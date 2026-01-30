
// ... existing imports ...
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Product, StrategyConfig, PricingRules, PromotionEvent, PriceChangeRecord, VelocityLookback, CostChangeRecord, PriceLog, InventoryChangeRecord } from '../types';
import { ThresholdConfig } from '../services/thresholdsConfig';
import { DEFAULT_STRATEGY_RULES, VAT_MULTIPLIER } from '../constants';
import { TagSearchInput } from './TagSearchInput';
import { GradeBadge } from './GradeBadge';
import { Settings, AlertTriangle, TrendingUp, TrendingDown, Info, Save, Download, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Ship, X, ArrowRight, Calendar, Eye, EyeOff, ChevronLeft, ChevronRight, History, Activity, Edit2, Plus, Coins, Database } from 'lucide-react';
import ManualPriceChangeModal from './ManualPriceChangeModal';
import ManualCostChangeModal from './ManualCostChangeModal';
import { asDateKey, isDateKeyBetween, addDaysToDateKey, getTodayKeyMelbourne, getYesterdayKeyMelbourne } from '../services/dateUtils';
import { formatMoney, formatNumber, formatPct } from '../utils/format';
import AuditPanel from './AuditPanel';
import { SortState, sortRows } from '../utils/tableSort';
import { SortableHeader } from './common/SortableHeader';

// ... (Interface props remain same)
interface StrategyPageProps {
    products: Product[];
    pricingRules: PricingRules;
    currentConfig: StrategyConfig;
    onSaveConfig: (config: StrategyConfig) => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
    priceHistoryMap: Map<string, PriceLog[]>;
    promotions: PromotionEvent[];
    priceChangeHistory: PriceChangeRecord[];
    costChangeHistory: CostChangeRecord[];
    inventoryChangeHistory: InventoryChangeRecord[];
    onUpdatePriceChangeRecord?: (record: PriceChangeRecord) => void;
    onUpdateCostChangeRecord?: (record: CostChangeRecord) => void;
    onUpdateInventoryChangeRecord?: (record: InventoryChangeRecord) => void;
    onManualPriceChange?: (data: Omit<PriceChangeRecord, 'id' | 'changeType' | 'percentChange'>) => void;
    onManualCostChange?: (data: Omit<CostChangeRecord, 'id' | 'changeType' | 'percentChange'>) => void;
    velocityLookback: VelocityLookback;
    thresholds?: ThresholdConfig;
}

const StrategyPage: React.FC<StrategyPageProps> = ({ products, pricingRules, currentConfig, onSaveConfig, themeColor, headerStyle, priceHistoryMap, promotions, priceChangeHistory = [], costChangeHistory = [], inventoryChangeHistory = [], onUpdatePriceChangeRecord, onUpdateCostChangeRecord, onUpdateInventoryChangeRecord, onManualPriceChange, onManualCostChange, velocityLookback, thresholds }) => {
    // ... (State initialization remains same)
    const [config, setConfig] = useState<StrategyConfig>(() => {
        try {
            return currentConfig ? JSON.parse(JSON.stringify(currentConfig)) : DEFAULT_STRATEGY_RULES;
        } catch (e) {
            console.error("Failed to initialize strategy config", e);
            return DEFAULT_STRATEGY_RULES;
        }
    });
    const [isConfigOpen, setIsConfigOpen] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [includeIncoming, setIncludeIncoming] = useState(false);
    const [showOOS, setShowOOS] = useState(false);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [isAuditPanelVisible, setIsAuditPanelVisible] = useState(false);

    // --- Local Time Window State ---
    const [selectedWindow, setSelectedWindow] = useState<string>(() => {
        if (['7', '14', '30', '60'].includes(velocityLookback)) return velocityLookback;
        return '30';
    });
    const [customStart, setCustomStart] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
    const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);
    const [isManualLodgeOpen, setIsManualLodgeOpen] = useState(false);
    const [isManualCostLodgeOpen, setIsManualCostLodgeOpen] = useState(false);

    const [activeTab, setActiveTab] = useState<'ENGINE' | 'HISTORY' | 'COST_HISTORY' | 'INVENTORY_HISTORY'>('ENGINE');
    const [filterTab, setFilterTab] = useState<'All' | 'INCREASE' | 'DECREASE' | 'MAINTAIN'>('All');

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
    const [historyItemsPerPage, setHistoryItemsPerPage] = useState(25);

    const [costHistoryCurrentPage, setCostHistoryCurrentPage] = useState(1);
    const [costHistoryItemsPerPage, setCostHistoryItemsPerPage] = useState(25);

    const [inventoryHistoryCurrentPage, setInventoryHistoryCurrentPage] = useState(1);
    const [inventoryHistoryItemsPerPage, setInventoryHistoryItemsPerPage] = useState(25);

    const [editingHistoryId, setEditingHistoryId] = useState<string | null>(null);
    const [editingDate, setEditingDate] = useState('');
    const [recentlySavedId, setRecentlySavedId] = useState<string | null>(null);

    const [editingCostHistoryId, setEditingCostHistoryId] = useState<string | null>(null);
    const [editingCostDate, setEditingCostDate] = useState('');
    const [recentlySavedCostId, setRecentlySavedCostId] = useState<string | null>(null);

    const [editingInventoryHistoryId, setEditingInventoryHistoryId] = useState<string | null>(null);
    const [editingInventoryDate, setEditingInventoryDate] = useState('');
    const [recentlySavedInventoryId, setRecentlySavedInventoryId] = useState<string | null>(null);

    const [sort, setSort] = useState<SortState<string> | null>(null);

    // ... (Logic helpers like safeNum, safeFormat, getRunwayBin, getCalculationWindow, formattedDateRange, calculateMetrics remain same)
    const safeNum = (val: any) => {
        const n = Number(val);
        return isNaN(n) ? 0 : n;
    };

    const safeFormat = (val: any, decimals: number = 2) => {
        const n = Number(val);
        if (isNaN(n)) return '0.' + '0'.repeat(decimals);
        return n.toFixed(decimals);
    }

    const getRunwayBin = (days: number, stockLevel: number, leadTime: number) => {
        if (stockLevel <= 0) return { label: 'Out of Stock', color: 'bg-red-50 text-red-600 border-red-200' };
        
        if (days > 730) return { label: '> 2 Years', color: 'bg-green-50 text-green-600 border-green-200' };

        let status = 'Healthy';
        let color = 'bg-green-50 text-green-600 border-green-200';

        if (days < leadTime) {
            status = 'Critical';
            color = 'bg-red-50 text-red-600 border-red-200';
        } else if (days < leadTime * 1.5) {
            status = 'Warning';
            color = 'bg-amber-50 text-amber-600 border-amber-200';
        } else if (days > leadTime * 4) {
            status = 'Overstock';
            color = 'bg-orange-50 text-orange-600 border-orange-200';
        }

        const weeks = days / 7;
        const label = `${weeks.toFixed(1)} Weeks`;

        return { label, color };
    };

    const getCalculationWindow = (setting: string, cStart?: string, cEnd?: string) => {
        const todayKey = getTodayKeyMelbourne();
        const yesterdayKey = getYesterdayKeyMelbourne();

        let startKey: string;
        let endKey: string;
        let days = 30;

        if (setting === 'Custom' && cStart && cEnd) {
            startKey = asDateKey(cStart) || todayKey;
            endKey = asDateKey(cEnd) || todayKey;
            if (startKey > endKey) {
                const temp = startKey;
                startKey = endKey;
                endKey = temp;
            }
            const diff = new Date(endKey).getTime() - new Date(startKey).getTime();
            days = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1);
        } else if (setting === 'ALL') {
            startKey = '1970-01-01'; 
            endKey = yesterdayKey;
            days = 30; 
        } else {
            days = parseInt(setting) || 30;
            endKey = yesterdayKey;
            startKey = addDaysToDateKey(endKey, -(days - 1));
        }

        return { startKey, endKey, days };
    };

    const formattedDateRange = useMemo(() => {
        const { startKey, endKey } = getCalculationWindow(selectedWindow, customStart, customEnd);
        const start = new Date(startKey);
        const end = new Date(endKey);
        const format = (d: Date, withYear: boolean) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
        const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
        return `${format(start, !sameYear)} – ${format(end, true)}`;
    }, [selectedWindow, customStart, customEnd]);

    const calculateMetrics = (product: Product, setting: string, isLocal: boolean) => {
        const { startKey, endKey, days: fixedDays } = getCalculationWindow(setting, isLocal ? customStart : undefined, isLocal ? customEnd : undefined);
        
        const skuLogs = priceHistoryMap.get(product.sku) || [];
        
        const history = skuLogs.filter((h: PriceLog) => {
            if (h.platform && pricingRules[h.platform]?.isExcluded) return false;
            const logKey = asDateKey(h.date);
            if (!logKey) return false;
            return isDateKeyBetween(logKey, startKey, endKey);
        });

        let effectiveDays = fixedDays;
        if (setting === 'ALL') {
             if (history.length > 0) {
                const dates = history.map(l => new Date(l.date).getTime());
                const min = Math.min(...dates);
                const max = new Date(endKey).getTime(); 
                effectiveDays = Math.max(1, Math.ceil((max - min) / (1000 * 60 * 60 * 24)));
             } else {
                 effectiveDays = 30;
             }
        }

        let totalSales = 0;
        let totalQty = 0;
        let weightedPriceSum = 0;
        let totalProfit = 0;

        history.forEach((h: PriceLog) => {
            const vel = safeNum(h.velocity);
            const price = safeNum(h.price);
            const revenue = price * vel;
            const margin = safeNum(h.margin);

            totalSales += revenue;
            totalQty += vel;
            weightedPriceSum += (price * vel);

            if (h.profit !== undefined && h.profit !== null) {
                totalProfit += h.profit;
            } else {
                totalProfit += revenue * (margin / 100);
            }
        });

        const rawAvgPrice = totalQty > 0 ? weightedPriceSum / totalQty : safeNum(product.currentPrice);
        const netPmPercent = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
        const dailyVelocity = totalQty / effectiveDays;

        const averagePrice = rawAvgPrice * VAT_MULTIPLIER;
        const totalSalesWithVat = totalSales * VAT_MULTIPLIER;

        return { 
            totalSales: totalSalesWithVat, 
            totalQty, 
            averagePrice, 
            netPmPercent, 
            totalProfit,
            dailyVelocity
        };
    };

    const getRecommendation = (product: Product, dailyVelocity: number, netPmPercent: number, thresholds?: ThresholdConfig) => {
        const basePrice = safeNum(product.caPrice) || safeNum(product.currentPrice);
        const effectiveStock = safeNum(product.stockLevel) + (includeIncoming ? safeNum(product.incomingStock) : 0);

        const todayKey = getTodayKeyMelbourne();
        const limit7StartKey = addDaysToDateKey(todayKey, -7);

        // --- FRESH STOCK GUARD (UPDATED) ---
        // Only look for STRATEGIC restocks (>= 5% increase or matched to shipment)
        const guardDays = safeNum(config.decrease.freshStockGuardDays ?? 0);
        const guardStartKey = addDaysToDateKey(todayKey, -(guardDays - 1));
        
        const recentStrategicRestock = guardDays > 0 ? inventoryChangeHistory.find(log => {
            const lKey = asDateKey(log.date);
            return lKey && lKey >= guardStartKey && lKey <= todayKey && log.sku === product.sku && log.isStrategic;
        }) : null;

        const inFreshStockGuard = !!recentStrategicRestock;

        // --- PROMOTION FLAG (NOW A WARNING ONLY) ---
        const activePromos = promotions.filter(p => 
            p.status === 'ACTIVE' && 
            p.startDate <= todayKey && 
            p.endDate >= todayKey && 
            p.items.some(i => i.sku === product.sku)
        );

        const inPromotion = activePromos.length > 0;
        const promoPlatforms = activePromos.map(p => p.platform);

        const skuLogs = priceHistoryMap.get(product.sku) || [];
        const last7Qty = skuLogs
            .filter((h: PriceLog) => {
                const logKey = asDateKey(h.date);
                return logKey && logKey >= limit7StartKey && logKey < todayKey;
            })
            .reduce((sum: number, h: PriceLog) => sum + (safeNum(h.velocity)), 0);

        const runwayDays = dailyVelocity > 0 ? (effectiveStock / dailyVelocity) : 999;

        let action: 'INCREASE' | 'DECREASE' | 'MAINTAIN' = 'MAINTAIN';
        let adjustedPrice = basePrice;
        let reasoning = 'Stable';

        const applyPsychologicalPricing = (price: number) => {
            if (isNaN(price)) return 0;
            const rounded = Math.ceil(price) - 0.01;
            return Number(rounded.toFixed(2));
        };

        const minMarginBuffer = safeNum(config.safety.minMarginPercent) / 100;
        const floorDivisor = 1 - minMarginBuffer;
        const floorPrice = floorDivisor > 0 
            ? (safeNum(product.costPrice) + safeNum(product.postage)) / floorDivisor 
            : (safeNum(product.costPrice) + safeNum(product.postage)) * 1.5; 

        const isNew = product.inventoryStatus === 'New Product';

        let isOffSeasonSeasonalItem = false;
        const currentSeason = thresholds?.currentSeason;
        if (currentSeason && currentSeason !== 'None' && product.seasonTags && product.seasonTags.length > 0) {
            const isCurrentlyInSeason = product.seasonTags.some(tag => tag.toLowerCase() === currentSeason.toLowerCase());
            if (!isCurrentlyInSeason) {
                isOffSeasonSeasonalItem = true;
            }
        }
        
        const minRunwayDays = safeNum(config.increase.minRunwayWeeks) * 7;
        const highStockDays = safeNum(config.decrease.highStockWeeks) * 7;
        const medStockDays = safeNum(config.decrease.medStockWeeks) * 7;

        if (runwayDays < minRunwayDays && effectiveStock > safeNum(config.increase.minStock)) {
            if (last7Qty > safeNum(config.increase.minVelocity7Days)) {
                action = 'INCREASE';
                const increaseAmount = Math.max(
                    basePrice * (safeNum(config.increase.adjustmentPercent) / 100),
                    safeNum(config.increase.adjustmentFixed)
                );
                adjustedPrice = applyPsychologicalPricing(basePrice + increaseAmount);
                reasoning = `Runway < ${config.increase.minRunwayWeeks} wks (${runwayDays.toFixed(0)}d) & P7D Qty > ${config.increase.minVelocity7Days}`;
            } else {
                reasoning = `Excluded: P7D Qty (${safeFormat(last7Qty, 0)}) <= Limit (${config.increase.minVelocity7Days})`;
            }
        }
        else if (!isNew || config.decrease.includeNewProducts) {
            const highStock = runwayDays > highStockDays;
            const medStockHighMargin = runwayDays > medStockDays && netPmPercent > config.decrease.minMarginPercent;

            if ((highStock || medStockHighMargin) && !isOffSeasonSeasonalItem) {
                action = 'DECREASE';
                const decreaseAmount = Math.max(
                    basePrice * (safeNum(config.decrease.adjustmentPercent) / 100),
                    safeNum(config.decrease.adjustmentFixed || 0)
                );
                
                adjustedPrice = applyPsychologicalPricing(basePrice - decreaseAmount);
                
                reasoning = highStock
                    ? `Runway > ${config.decrease.highStockWeeks} wks (${runwayDays.toFixed(0)}d)`
                    : `Runway > ${config.decrease.medStockWeeks} wks & Net PM > ${config.decrease.minMarginPercent}%`;
            } else if (isOffSeasonSeasonalItem) {
                reasoning = 'Maintain: Off-season item with high stock.';
            }
        }

        const safetyViolation = adjustedPrice < floorPrice;

        // Final override for Decrease Logic - Fresh Stock Guard
        let excludedReason = '';
        if (action === 'DECREASE' && inFreshStockGuard) {
            action = 'MAINTAIN';
            reasoning = 'Stable';
            excludedReason = 'FRESH_STOCK_GUARD';
        }

        return { 
            action, 
            adjustedPrice, 
            reasoning, 
            safetyViolation, 
            runwayDays, 
            effectiveStock, 
            floorPrice, 
            isNew, 
            inPromotion, 
            promoPlatforms,
            excludedReason,
            inFreshStockGuard
        };
    };

    // ... (Memoized tableData, filteredAndSortedData, auditStats, paginatedData, etc. remain unchanged)
    const tableData = useMemo(() => {
        return products
            .filter(p => {
                const matchesTerm = (term: string) => {
                    const t = term.toLowerCase();
                    return p.sku.toLowerCase().includes(t) || 
                           p.name.toLowerCase().includes(t) ||
                           p.channels.some(c => c.skuAlias?.toLowerCase().includes(t));
                };

                if (searchTags.length > 0) {
                    return searchTags.some(tag => matchesTerm(tag));
                }
                return matchesTerm(searchQuery);
            })
            .map(p => {
                const local = calculateMetrics(p, selectedWindow, true);
                const global = calculateMetrics(p, velocityLookback, false);
                const strategyVelocity = (p.dailyAverageSales && p.dailyAverageSales > 0) 
                    ? p.dailyAverageSales 
                    : global.dailyVelocity;
                const rec = getRecommendation(p, strategyVelocity, global.netPmPercent, thresholds);
                
                return { 
                    ...p, 
                    recentTotalSales: local.totalSales,
                    recentTotalQty: local.totalQty,
                    averagePrice: local.averagePrice,
                    netPmPercent: local.netPmPercent,
                    totalProfit: local.totalProfit,
                    dailyVelocity: strategyVelocity,
                    ...rec 
                };
            })
            .filter(row => {
                const isOOS = row.effectiveStock <= 0;
                const isActive = row.recentTotalQty > 0;
                if (isOOS && !isActive) return false;
                if (isOOS && !showOOS) return false;
                return true;
            });
    }, [products, config, searchQuery, searchTags, selectedWindow, customStart, customEnd, velocityLookback, priceHistoryMap, includeIncoming, pricingRules, showOOS, thresholds, promotions]);

    const filteredAndSortedData = useMemo(() => {
        let data = tableData.filter(row => filterTab === 'All' || row.action === filterTab);
    
        if (sort) {
            const getValue = (row: any, key: string) => {
                // Map sortKey to actual data property
                switch(key) {
                    case 'sku': return row.sku;
                    case 'runway': return row.runwayDays;
                    case 'velocity': return row.dailyVelocity;
                    case 'inventory': return row.effectiveStock;
                    case 'avgPrice': return row.averagePrice;
                    case 'sales': return row.recentTotalSales;
                    case 'qty': return row.recentTotalQty;
                    case 'margin': return row.netPmPercent;
                    case 'caPrice': return row.caPrice;
                    case 'newPrice': return row.adjustedPrice;
                    case 'action': return row.action;
                    default: return 0;
                }
            };
            data = sortRows(data, sort, getValue);
        } else {
            // Apply original default sort
            data.sort((a, b) => {
                const score = (x: string) => x === 'INCREASE' ? 3 : x === 'DECREASE' ? 2 : 1;
                return score(b.action) - score(a.action);
            });
        }
    
        return data;
    }, [tableData, filterTab, sort]);

    // ... (auditStats, paginatedData, etc. same as before)
    const auditStats = useMemo(() => {
        if (!isAuditPanelVisible || filteredAndSortedData.length === 0) {
            return null;
        }
    
        const localWindow = getCalculationWindow(selectedWindow, customStart, customEnd);
        const globalWindow = getCalculationWindow(velocityLookback, undefined, undefined);
    
        const local = { logs: 0, distinctDays: new Set<string>(), revenue: 0, qty: 0, profit: 0, profitLogsWith: 0, profitLogsWithout: 0, estimatedProfit: 0 };
        const global = { logs: 0, distinctDays: new Set<string>(), revenue: 0, qty: 0, profit: 0, profitLogsWith: 0, profitLogsWithout: 0, estimatedProfit: 0 };
        
        let totalLocalDistinctDays = 0;
    
        for (const product of filteredAndSortedData) {
            const logs = priceHistoryMap.get(product.sku) || [];
            const productLocalDistinctDays = new Set<string>();
            
            for (const log of logs) {
                const logKey = asDateKey(log.date);
                if (!logKey) continue;
                
                const revenue = safeNum(log.price) * safeNum(log.velocity);
                let logProfit = 0;
    
                if (isDateKeyBetween(logKey, localWindow.startKey, localWindow.endKey)) {
                    local.logs++;
                    local.distinctDays.add(logKey);
                    productLocalDistinctDays.add(logKey);
                    local.revenue += revenue;
                    local.qty += safeNum(log.velocity);
    
                    if (log.profit !== undefined && log.profit !== null) {
                        local.profitLogsWith++;
                        logProfit = safeNum(log.profit);
                    } else {
                        local.profitLogsWithout++;
                        logProfit = revenue * (safeNum(log.margin) / 100);
                        local.estimatedProfit += logProfit;
                    }
                    local.profit += logProfit;
                }
    
                if (isDateKeyBetween(logKey, globalWindow.startKey, globalWindow.endKey)) {
                    global.logs++;
                    global.distinctDays.add(logKey);
                    global.revenue += revenue;
                    global.qty += safeNum(log.velocity);
                    
                    if (log.profit !== undefined && log.profit !== null) {
                        global.profitLogsWith++;
                        logProfit = safeNum(log.profit);
                    } else {
                        global.profitLogsWithout++;
                        logProfit = revenue * (safeNum(log.margin) / 100);
                        local.estimatedProfit += logProfit;
                    }
                    global.profit += logProfit;
                }
            }
            totalLocalDistinctDays += productLocalDistinctDays.size;
        }
        
        const avgLocalDistinctDays = filteredAndSortedData.length > 0 ? totalLocalDistinctDays / filteredAndSortedData.length : 0;
    
        return {
            productCount: filteredAndSortedData.length,
            local: {
                ...local,
                distinctDaysCount: local.distinctDays.size,
                avgDistinctDaysPerProduct: avgLocalDistinctDays
            },
            global: {
                ...global,
                distinctDaysCount: global.distinctDays.size
            }
        };
    }, [isAuditPanelVisible, filteredAndSortedData, selectedWindow, customStart, customEnd, velocityLookback, priceHistoryMap]);

    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredAndSortedData.slice(start, start + itemsPerPage);
    }, [filteredAndSortedData, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage);

    const getAvgVelocity = (sku: string, startKey: string, endKey: string) => {
        const logs = priceHistoryMap.get(sku) || [];
        const relevantLogs = logs.filter((l: PriceLog) => {
            const logKey = asDateKey(l.date);
            return logKey && isDateKeyBetween(logKey, startKey, endKey);
        });
        
        if (relevantLogs.length === 0) return 0;
        
        const totalQty = relevantLogs.reduce((acc, l) => acc + l.velocity, 0);
        const distinctDays = new Set(relevantLogs.map(l => l.date)).size;
        return distinctDays > 0 ? totalQty / distinctDays : 0;
    };

    const historyTableData = useMemo(() => {
        const safeArr = Array.isArray(priceChangeHistory) ? priceChangeHistory : [];
        if (process.env.NODE_ENV === 'development' && priceChangeHistory && !Array.isArray(priceChangeHistory)) {
             console.warn('StrategyPage: priceChangeHistory is not an array', priceChangeHistory);
        }

        let data = safeArr.map(change => {
            const dateKey = asDateKey(change.date);
            if (!dateKey) return { ...change, preVel: 0, postVel: 0, velocityChange: 0 };
            
            const preEndKey = addDaysToDateKey(dateKey, -1);
            const preStartKey = addDaysToDateKey(dateKey, -7);
            const postStartKey = addDaysToDateKey(dateKey, 1);
            const postEndKey = addDaysToDateKey(dateKey, 7);
            
            const preVel = getAvgVelocity(change.sku, preStartKey, preEndKey);
            const postVel = getAvgVelocity(change.sku, postStartKey, postEndKey);
            
            return {
                ...change,
                preVel,
                postVel,
                velocityChange: preVel > 0 ? ((postVel - preVel) / preVel) * 100 : (postVel > 0 ? 100 : 0)
            };
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (searchTags.length > 0 || searchQuery) {
            data = data.filter(item => {
                const matchesTerm = (term: string) => {
                    const t = term.toLowerCase();
                    return item.sku.toLowerCase().includes(t) || 
                           item.productName.toLowerCase().includes(t);
                };

                if (searchTags.length > 0) {
                    return searchTags.some(tag => matchesTerm(tag));
                }
                return matchesTerm(searchQuery);
            });
        }

        return data;
    }, [priceChangeHistory, priceHistoryMap, searchTags, searchQuery]);

    const paginatedHistoryData = useMemo(() => {
        const start = (historyCurrentPage - 1) * historyItemsPerPage;
        return historyTableData.slice(start, start + historyItemsPerPage);
    }, [historyTableData, historyCurrentPage, historyItemsPerPage]);

    const totalHistoryPages = Math.ceil(historyTableData.length / historyItemsPerPage);

    const costHistoryTableData = useMemo(() => {
        const safeArr = Array.isArray(costChangeHistory) ? costChangeHistory : [];
        let data = [...safeArr].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (searchTags.length > 0 || searchQuery) {
            data = data.filter(item => {
                const matchesTerm = (term: string) => {
                    const t = term.toLowerCase();
                    return item.sku.toLowerCase().includes(t) || 
                           item.productName.toLowerCase().includes(t);
                };
                if (searchTags.length > 0) {
                    return searchTags.some(tag => matchesTerm(tag));
                }
                return matchesTerm(searchQuery);
            });
        }
        return data;
    }, [costChangeHistory, searchTags, searchQuery]);

    const paginatedCostHistoryData = useMemo(() => {
        const start = (costHistoryCurrentPage - 1) * costHistoryItemsPerPage;
        return costHistoryTableData.slice(start, start + costHistoryItemsPerPage);
    }, [costHistoryTableData, costHistoryCurrentPage, costHistoryItemsPerPage]);

    const totalCostHistoryPages = Math.ceil(costHistoryTableData.length / costHistoryItemsPerPage);

    const inventoryHistoryTableData = useMemo(() => {
        const window = getCalculationWindow(selectedWindow, customStart, customEnd);
        const safeArr = Array.isArray(inventoryChangeHistory) ? inventoryChangeHistory : [];
        
        let data = [...safeArr];
        
        // --- Date Range Filter ---
        if (selectedWindow !== 'ALL') {
            data = data.filter(item => {
                const itemKey = asDateKey(item.date);
                return itemKey && isDateKeyBetween(itemKey, window.startKey, window.endKey);
            });
        }

        if (searchTags.length > 0 || searchQuery) {
            data = data.filter(item => {
                const matchesTerm = (term: string) => {
                    const t = term.toLowerCase();
                    return item.sku.toLowerCase().includes(t) || 
                           item.productName.toLowerCase().includes(t);
                };
                if (searchTags.length > 0) {
                    return searchTags.some(tag => matchesTerm(tag));
                }
                return matchesTerm(searchQuery);
            });
        }
        
        return data.sort((a, b) => b.timestamp - a.timestamp);
    }, [inventoryChangeHistory, searchTags, searchQuery, selectedWindow, customStart, customEnd]);

    const paginatedInventoryHistoryData = useMemo(() => {
        const start = (inventoryHistoryCurrentPage - 1) * inventoryHistoryItemsPerPage;
        return inventoryHistoryTableData.slice(start, start + inventoryHistoryItemsPerPage);
    }, [inventoryHistoryTableData, inventoryHistoryCurrentPage, inventoryHistoryItemsPerPage]);

    const totalInventoryHistoryPages = Math.ceil(inventoryHistoryTableData.length / inventoryHistoryItemsPerPage);

    useEffect(() => {
        setCurrentPage(1);
        setHistoryCurrentPage(1);
        setCostHistoryCurrentPage(1);
        setInventoryHistoryCurrentPage(1);
    }, [searchQuery, searchTags, activeTab, filterTab, selectedWindow, showOOS]);

    const uniquePlatforms = useMemo(() => {
        const platformSet = new Set<string>();
        products.forEach(p => p.channels.forEach(c => platformSet.add(c.platform)));
        if (pricingRules) {
            Object.keys(pricingRules).forEach(k => platformSet.add(k));
        }
        return Array.from(platformSet).sort();
    }, [products, pricingRules]);

    const handleExport = (platform: string = 'All') => {
        const clean = (val: any) => {
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/[\r\n]+/g, ' '); 
            return `"${str.replace(/"/g, '""')}"`;
        };

        const headers = [
            'SKU', 'Master SKU', 'Name', 'CA Price', 'New Price', 
            'Runway (Days)', 'Inventory', 'Recent Avg Price', 'Recent Sales $', 
            'Recent Qty', 'Net PM%', 'Is New', 'Action', 'Floor Price', 
            'Safety Alert', 'Reason', 'On Promotion', 'Promo Platforms',
            'In Fresh Stock Guard', 'Exclusion Reason'
        ];
        
        const rows: string[][] = [];

        tableData.forEach((r: any) => {
            const finalReasoning = r.inPromotion 
                ? `[PROMOTION WARNING] ${r.reasoning}`
                : r.reasoning;

            const commonData = [
                clean(r.name),
                safeFormat(r.caPrice, 2),
                safeFormat(r.adjustedPrice, 2),
                safeFormat(r.runwayDays, 0),
                safeFormat(r.effectiveStock, 0),
                safeFormat(r.averagePrice, 2),
                safeFormat(r.recentTotalSales, 2),
                safeFormat(r.recentTotalQty, 0),
                safeFormat(r.netPmPercent, 1),
                r.isNew ? 'Yes' : 'No',
                clean(r.action),
                safeFormat(r.floorPrice, 2),
                r.safetyViolation ? 'VIOLATION' : '',
                clean(finalReasoning),
                r.inPromotion ? 'TRUE' : 'FALSE',
                clean(r.promoPlatforms?.join(', ') || ''),
                r.inFreshStockGuard ? 'TRUE' : 'FALSE',
                clean(r.excludedReason)
            ];

            rows.push([clean(r.sku), clean(r.sku), ...commonData]);
        });

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\uFEFF', csvContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        const filename = `strategy_report_full_${new Date().toISOString().slice(0, 10)}.csv`;
        link.download = filename;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();

        setTimeout(() => {
            if (document.body.contains(link)) document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 60000);
        setIsExportMenuOpen(false);
    };

    const handleHistoryExport = () => {
        const clean = (val: any) => {
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/[\r\n]+/g, ' '); 
            return `"${str.replace(/"/g, '""')}"`;
        };

        const headers = ['Date', 'SKU', 'Product Name', 'Change Type', 'Change %', 'Old Price', 'New Price', 'Pre-Change Avg Daily Vel', 'Post-Change Avg Daily Vel', 'Vel Impact %'];
        
        const rows = historyTableData.map(row => [
            row.date,
            clean(row.sku),
            clean(row.productName),
            row.changeType,
            row.percentChange.toFixed(2) + '%',
            row.oldPrice.toFixed(2),
            row.newPrice.toFixed(2),
            row.preVel.toFixed(2),
            row.postVel.toFixed(2),
            row.velocityChange.toFixed(1) + '%'
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\uFEFF', csvContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        const filename = `price_change_log_${new Date().toISOString().slice(0, 10)}.csv`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
            if (document.body.contains(link)) document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    };

    const handleCostHistoryExport = () => {
        const clean = (val: any) => {
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/[\r\n]+/g, ' ');
            return `"${str.replace(/"/g, '""')}"`;
        };
    
        const headers = ['Date', 'SKU', 'Product Name', 'Change Type', 'Change %', 'Old Cost', 'New Cost'];
        
        const rows = costHistoryTableData.map(row => [
            row.date,
            clean(row.sku),
            clean(row.productName),
            row.changeType,
            row.percentChange.toFixed(2) + '%',
            row.oldCost.toFixed(2),
            row.newCost.toFixed(2),
        ]);
    
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\uFEFF', csvContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        const filename = `cost_change_log_${new Date().toISOString().slice(0, 10)}.csv`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
            if (document.body.contains(link)) document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    };

    const handleInventoryHistoryExport = () => {
        const clean = (val: any) => {
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/[\r\n]+/g, ' ');
            return `"${str.replace(/"/g, '""')}"`;
        };
    
        const headers = ['Date', 'SKU', 'Product Name', 'Stock Before', 'Stock After', '+Delta', 'Source', 'Is Strategic', 'Reason'];
        
        const rows = inventoryHistoryTableData.map(row => [
            row.date,
            clean(row.sku),
            clean(row.productName),
            row.prevStock,
            row.newStock,
            row.deltaStock,
            row.source,
            row.isStrategic ? 'YES' : 'NO',
            clean(row.reason)
        ]);
    
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\uFEFF', csvContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        const filename = `inventory_change_log_${new Date().toISOString().slice(0, 10)}.csv`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        
        setTimeout(() => {
            if (document.body.contains(link)) document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 100);
    };

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
            {/* ... (Header and Tabs remain same) ... */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Strategy Engine</h2>
                    <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                        Automated pricing recommendations and change tracking.
                    </p>
                </div>
            </div>

            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto no-scrollbar">
                <button onClick={() => setActiveTab('ENGINE')} className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'ENGINE' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><Activity className="w-4 h-4" />Strategy Simulator</button>
                <button onClick={() => setActiveTab('HISTORY')} className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'HISTORY' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><History className="w-4 h-4" />Price Change Log</button>
                <button onClick={() => setActiveTab('COST_HISTORY')} className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'COST_HISTORY' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><Coins className="w-4 h-4" />Cost Change Log</button>
                <button onClick={() => setActiveTab('INVENTORY_HISTORY')} className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'INVENTORY_HISTORY' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><Database className="w-4 h-4" />Inventory Change Log</button>
            </div>

            {activeTab === 'ENGINE' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    {/* ... (Engine Controls) ... */}
                    <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex flex-col xl:flex-row items-center justify-between gap-4 relative z-20 backdrop-blur-custom">
                        <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
                            <div className="flex items-center gap-3">
                                <div className="flex bg-gray-100 p-1 rounded-lg">
                                    {['7', '14', '30', '60'].map(d => (
                                        <button key={d} onClick={() => { setSelectedWindow(d); setCurrentPage(1); }} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${selectedWindow === d ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>{d}D</button>
                                    ))}
                                    <button onClick={() => setIsCustomDateModalOpen(true)} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${selectedWindow === 'Custom' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}><Calendar className="w-3 h-3" />Custom</button>
                                </div>
                                <div className="flex flex-col items-start justify-center pl-2 border-l border-gray-200"><span className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-0.5">Analyzing Period</span><div className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">{formattedDateRange}</div></div>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-3 justify-end w-full xl:w-auto">
                             <button onClick={() => setIsAuditPanelVisible(!isAuditPanelVisible)} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold border transition-all shadow-sm text-sm ${isAuditPanelVisible ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`} title="Toggle Reconciliation Panel"><Activity className="w-4 h-4" />Audit: {isAuditPanelVisible ? 'On' : 'Off'}</button>
                            <button onClick={() => setIncludeIncoming(!includeIncoming)} className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold border transition-all shadow-sm text-sm ${includeIncoming ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`} title={includeIncoming ? "Including Incoming Stock in Runway Calc" : "Excluding Incoming Stock (Conservative Mode)"}><Ship className="w-4 h-4" />{includeIncoming ? 'Incoming Included' : 'Incoming Excluded'}</button>
                            <button onClick={() => setIsConfigOpen(!isConfigOpen)} className={`px-4 py-2 rounded-lg font-medium border flex items-center gap-2 transition-all text-sm ${isConfigOpen ? 'bg-gray-100 text-gray-900 border-gray-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}><Settings className="w-4 h-4" />{isConfigOpen ? 'Hide Rules' : 'Edit Rules'}</button>
                            <div className="relative">
                                <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} className="px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"><Download className="w-4 h-4" />Export Matrix<ChevronDown className="w-3 h-3 text-gray-400" /></button>
                                {isExportMenuOpen && createPortal(
                                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setIsExportMenuOpen(false)}><div className="bg-custom-glass-modal backdrop-blur-custom-modal rounded-xl shadow-2xl w-full max-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-white/20" onClick={e => e.stopPropagation()}><div className="p-4 border-b border-gray-100/50 flex justify-between items-center bg-gray-50/50"><h3 className="font-bold text-gray-900">Export Strategy</h3><button onClick={() => setIsExportMenuOpen(false)} className="p-1 hover:bg-gray-200/50 rounded-full transition-colors"><X className="w-4 h-4 text-gray-500" /></button></div><div className="p-2"><div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Select Format</div><button onClick={() => handleExport('All')} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50/50 flex items-center justify-between group rounded-lg transition-colors"><span className="font-medium">Standard (Master SKUs)</span><ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600" /></button><div className="my-2 border-t border-gray-100/50"></div><div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Export for Platform</div><div className="max-h-60 overflow-y-auto">{uniquePlatforms.map(platform => (<button key={platform} onClick={() => handleExport(platform)} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50/50 flex items-center justify-between rounded-lg transition-colors"><span>{platform}</span><span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200">Alias Mode</span></button>))}{uniquePlatforms.length === 0 && (<div className="px-4 py-2 text-xs text-gray-400 italic">No platforms detected</div>)}</div></div></div></div>, document.body
                                )}
                            </div>
                        </div>
                    </div>

                    {isAuditPanelVisible && auditStats && (
                        <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-200/80 space-y-4 animate-in fade-in slide-in-from-top-2">
                            <AuditPanel
                                title={`Audit & Reconciliation Panel (${auditStats.productCount} Products)`}
                                startKey={getCalculationWindow(selectedWindow, customStart, customEnd).startKey}
                                endKey={getCalculationWindow(selectedWindow, customStart, customEnd).endKey}
                                rows={filteredAndSortedData}
                                getDateKey={(row: any) => null} // We are feeding pre-filtered data, so row-level date check is redundant
                                getRevenue={(row: any) => row.recentTotalSales / VAT_MULTIPLIER}
                                getQty={(row: any) => row.recentTotalQty}
                                getProfit={(row: any) => row.totalProfit}
                                getAdSpend={(row: any) => 0} // This audit doesn't have ad-spend context, needs to be built
                                distinctDaysCount={auditStats.local.distinctDaysCount}
                            />
                        </div>
                    )}

                    {isConfigOpen && (
                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden animate-in fade-in slide-in-from-top-4">
                            <div className="border-b border-custom-glass bg-gray-50/50 p-4 flex justify-between items-center"><h3 className="font-bold text-gray-800 flex items-center gap-2"><Settings className="w-4 h-4 text-gray-500" />Configuration Parameters</h3><button onClick={() => onSaveConfig(config)} className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-gray-800"><Save className="w-3 h-3" /> Save Defaults</button></div>
                            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                                <div className="space-y-4">
                                    {/* ... Increase Logic ... */}
                                    <div className="flex items-center gap-2 text-green-700 font-bold border-b border-green-100 pb-2 mb-2"><TrendingUp className="w-4 h-4" /> Increase Logic</div>
                                    <div className="grid grid-cols-2 gap-4"><div><label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Runway (Weeks)</label><div className="flex items-center gap-2"><span className="text-sm text-gray-400">&lt;</span><input type="number" value={config.increase.minRunwayWeeks} onChange={e => setConfig({ ...config, increase: { ...config.increase, minRunwayWeeks: parseFloat(e.target.value) } })} className="w-full border rounded p-1.5 text-sm bg-white/50" /></div></div><div><label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Min Stock</label><div className="flex items-center gap-2"><span className="text-sm text-gray-400">&gt;</span><input type="number" value={config.increase.minStock} onChange={e => setConfig({ ...config, increase: { ...config.increase, minStock: parseFloat(e.target.value) } })} className="w-full border rounded p-1.5 text-sm bg-white/50" /></div></div></div>
                                    <div><label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Past 7-Days QTY (Exclusion)</label><div className="flex items-center gap-2"><span className="text-sm text-gray-400">&le;</span><input type="number" value={config.increase.minVelocity7Days} onChange={e => setConfig({ ...config, increase: { ...config.increase, minVelocity7Days: parseFloat(e.target.value) } })} className="w-20 border rounded p-1.5 text-sm bg-white/50" /><span className="text-xs text-gray-400">units</span></div></div>
                                    <div className="bg-green-50/50 p-3 rounded border border-green-100"><label className="text-xs font-bold text-green-800 uppercase block mb-2">Adjustment Action</label><div className="flex gap-2"><div className="flex-1"><span className="text-[10px] text-gray-500">Percent (%)</span><input type="number" value={config.increase.adjustmentPercent} onChange={e => setConfig({ ...config, increase: { ...config.increase, adjustmentPercent: parseFloat(e.target.value) } })} className="w-full border rounded p-1 text-sm text-green-700 font-bold bg-white/80" /></div><div className="flex-1"><span className="text-[10px] text-gray-500">Fixed (£)</span><input type="number" value={config.increase.adjustmentFixed} onChange={e => setConfig({ ...config, increase: { ...config.increase, adjustmentFixed: parseFloat(e.target.value) } })} className="w-full border rounded p-1 text-sm text-green-700 font-bold bg-white/80" /></div></div><p className="text-[10px] text-green-600 mt-1 italic">*Applies whichever is higher</p></div>
                                </div>
                                <div className="space-y-4 border-l border-r border-gray-200/50 px-6">
                                    <div className="flex items-center gap-2 text-red-700 font-bold border-b border-red-100 pb-2 mb-2"><TrendingDown className="w-4 h-4" /> Decrease Logic</div>
                                    <div className="bg-gray-50/50 p-2 rounded text-xs text-gray-600 mb-2 flex items-center justify-between"><div className="flex items-center gap-2"><Info className="w-3 h-3" /><span>Include "New Products"?</span></div><button onClick={() => setConfig({ ...config, decrease: { ...config.decrease, includeNewProducts: !config.decrease.includeNewProducts } })} className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${config.decrease.includeNewProducts ? 'bg-red-500' : 'bg-gray-300'}`}><span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${config.decrease.includeNewProducts ? 'translate-x-4' : 'translate-x-1'}`} /></button></div>
                                    
                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Condition A: High Stock</label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-gray-600">Runway &gt;</span>
                                            <input type="number" value={config.decrease.highStockWeeks} onChange={e => setConfig({ ...config, decrease: { ...config.decrease, highStockWeeks: parseFloat(e.target.value) } })} className="w-16 border rounded p-1.5 text-sm bg-white/50" />
                                            <span className="text-sm text-gray-600">wks</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Condition B: Med Stock + High Margin</label>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-600">Runway &gt;</span>
                                                <input type="number" value={config.decrease.medStockWeeks} onChange={e => setConfig({ ...config, decrease: { ...config.decrease, medStockWeeks: parseFloat(e.target.value) } })} className="w-16 border rounded p-1.5 text-sm bg-white/50" />
                                                <span className="text-sm text-gray-600">wks</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-600">Margin &gt;</span>
                                                <input type="number" value={config.decrease.minMarginPercent} onChange={e => setConfig({ ...config, decrease: { ...config.decrease, minMarginPercent: parseFloat(e.target.value) } })} className="w-16 border rounded p-1.5 text-sm bg-white/50" />
                                                <span className="text-sm text-gray-600">%</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="pt-2 border-t border-gray-100">
                                         <label className="text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1">
                                            Fresh Stock Guard
                                            <div className="group relative">
                                                <Info className="w-3 h-3 text-gray-400 cursor-help" />
                                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-800 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none text-center">
                                                    Prevents price drops on items recently restocked. <br/><br/>
                                                    <strong>Strategic Restock:</strong> Increase &ge; 5% &amp; matches a Shipment in transit (+/- 7 days).
                                                </div>
                                            </div>
                                         </label>
                                         <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-600">Exclude if restocked in last</span>
                                                <input 
                                                    type="number" 
                                                    min="0"
                                                    value={config.decrease.freshStockGuardDays ?? 0}
                                                    onChange={e => setConfig({ ...config, decrease: { ...config.decrease, freshStockGuardDays: parseFloat(e.target.value) } })}
                                                    className="w-16 border rounded p-1.5 text-sm bg-white/50" 
                                                />
                                                <span className="text-sm text-gray-600">days</span>
                                            </div>
                                            <span className="text-[10px] text-gray-400 italic">(Set 0 to disable)</span>
                                         </div>
                                    </div>

                                    <div className="bg-red-50/50 p-3 rounded border border-red-100"><label className="text-xs font-bold text-red-800 uppercase block mb-2">Adjustment Action</label><div className="flex gap-2"><div className="flex-1"><span className="text-[10px] text-gray-500">Percent (%)</span><input type="number" value={config.decrease.adjustmentPercent} onChange={e => setConfig({ ...config, decrease: { ...config.decrease, adjustmentPercent: parseFloat(e.target.value) } })} className="w-full border rounded p-1 text-sm text-red-700 font-bold bg-white/80" /></div><div className="flex-1"><span className="text-[10px] text-gray-500">Fixed (£)</span><input type="number" value={config.decrease.adjustmentFixed} onChange={e => setConfig({ ...config, decrease: { ...config.decrease, adjustmentFixed: parseFloat(e.target.value) } })} className="w-full border rounded p-1 text-sm text-red-700 font-bold bg-white/80" /></div></div><p className="text-[10px] text-red-600 mt-1 italic">*Applies whichever is higher</p></div>
                                </div>
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-amber-700 font-bold border-b border-amber-100 pb-2 mb-2"><AlertTriangle className="w-4 h-4" /> Safety Net</div>
                                    <div className="bg-amber-50/50 p-4 rounded border border-amber-100"><label className="text-xs font-bold text-amber-800 uppercase block mb-2">Minimum Floor Constraint</label><p className="text-xs text-amber-700 mb-3">Price must not fall below:</p><div className="flex items-center gap-2 font-mono text-sm bg-white/80 p-2 rounded border border-amber-200 mb-3">(Cost + Ship) ÷<span className="font-bold">{(1 - (safeNum(config.safety.minMarginPercent) / 100)).toFixed(2)}</span></div><div className="flex items-center gap-2"><span className="text-xs text-amber-800">Min Margin Buffer:</span><input type="number" value={config.safety.minMarginPercent} onChange={e => setConfig({ ...config, safety: { ...config.safety, minMarginPercent: parseFloat(e.target.value) } })} className="w-16 border rounded p-1 text-sm font-bold text-amber-700 bg-white/80" /><span className="text-xs text-amber-800">%</span></div></div>
                                    <div className="mt-6 pt-4 border-t border-gray-200/50"><p className="text-xs text-gray-400 italic">Seasonal adjustments: Coming soon.</p></div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                        {/* ... (Table content remains same) ... */}
                        <div className="p-4 border-b border-custom-glass flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-4">
                                <TagSearchInput 
                                    tags={searchTags}
                                    onTagsChange={(tags) => { setSearchTags(tags); setCurrentPage(1); }}
                                    onInputChange={(val) => { setSearchQuery(val); setCurrentPage(1); }}
                                    placeholder="Filter by SKU or Alias..."
                                    themeColor={themeColor}
                                />
                                <div className="flex bg-gray-200/50 p-1 rounded-lg">
                                    {['All', 'INCREASE', 'DECREASE', 'MAINTAIN'].map(tab => (
                                        <button key={tab} onClick={() => setFilterTab(tab as any)} className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${filterTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>{tab === 'All' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}</button>
                                    ))}
                                </div>
                                <button onClick={() => setShowOOS(!showOOS)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold border text-xs transition-all shadow-sm ${showOOS ? 'bg-gray-800 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-300'}`} title={showOOS ? "Hide Out of Stock items" : "Show Out of Stock items (Active Only)"}>{showOOS ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}{showOOS ? 'OOS Shown' : 'OOS Hidden'}</button>
                            </div>
                            <div className="text-xs text-gray-500">Showing <strong>{tableData.filter(r => filterTab === 'All' || r.action === filterTab).length}</strong> SKUs</div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50/50 text-gray-600 font-semibold border-b border-gray-200/50">
                                    <tr>
                                        <SortableHeader label="Product" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                                        <SortableHeader label="Runway / Velocity" sortKey="runway" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                        <SortableHeader label="Inventory" sortKey="inventory" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                        <SortableHeader label="Recent Avg Price" sortKey="avgPrice" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="bg-blue-50/50" />
                                        <SortableHeader label="Recent Sales $" sortKey="sales" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="bg-blue-50/50" />
                                        <SortableHeader label="Recent Qty" sortKey="qty" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="bg-blue-50/50" />
                                        <SortableHeader label="Net PM%" sortKey="margin" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="bg-green-50/50" />
                                        <SortableHeader label="CA Price" sortKey="caPrice" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="text-purple-600" />
                                        <SortableHeader label="New Price" sortKey="newPrice" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                        <SortableHeader label="Action" sortKey="action" sort={sort} onChange={setSort} themeColor={themeColor} align="center" />
                                        <th className="p-4">Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100/50">
                                    {paginatedData.map((row: any) => (
                                        <tr key={row.id} className={`even:bg-gray-50/30 hover:bg-gray-100/50 ${row.safetyViolation ? 'bg-amber-50/30' : ''}`}>
                                            <td className="p-4">
                                                <div className="flex items-center"><div className="font-bold text-gray-900">{row.sku}</div><GradeBadge gradeLevel={row.gradeLevel} /></div>
                                                <div className="text-xs text-gray-500 truncate max-w-[200px]">{row.name}</div>
                                                <div className="flex flex-wrap items-center gap-1 mt-1.5">{row.subcategory && <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full border border-gray-200">{row.subcategory}</span>}{row.seasonTags?.slice(0, 2).map((tag: string) => (<span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>))}{(row.seasonTags?.length || 0) > 2 && (<span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{ (row.seasonTags?.length || 0) - 2 }</span>)}{row.festivalTags?.slice(0, 2).map((tag: string) => (<span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>))}{(row.festivalTags?.length || 0) > 2 && (<span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{ (row.festivalTags?.length || 0) - 2 }</span>)}</div>
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex flex-col items-end gap-1.5">{(() => { const runwayBin = getRunwayBin(row.runwayDays, row.stockLevel, row.leadTimeDays); return (<span className={`inline-flex items-center px-2.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${runwayBin.color}`}>{runwayBin.label}</span>); })()}<span className="text-[11px] font-semibold text-gray-700">{safeFormat(row.dailyVelocity, 1)} / day</span></div>
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold text-gray-700">{row.stockLevel}</td>
                                            <td className="p-4 text-right bg-blue-50/30">£{safeFormat(row.averagePrice, 2)}</td>
                                            <td className="p-4 text-right bg-blue-50/30">£{safeNum(row.recentTotalSales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td className="p-4 text-right bg-blue-50/30 font-bold">{safeFormat(row.recentTotalQty, 0)}</td>
                                            <td className="p-4 text-right bg-green-50/30 font-bold text-green-700"><span title={`Profit: £${safeFormat(row.totalProfit, 4)} / Sales: £${safeFormat(row.recentTotalSales, 2)}`} className="cursor-help border-b border-dotted border-green-700/50">{safeFormat(row.netPmPercent, 1)}%</span></td>
                                            <td className="p-4 text-right font-bold text-purple-600 font-mono">{row.caPrice ? `£${safeFormat(row.caPrice, 2)}` : '-'}</td>
                                            <td className="p-4 text-right font-mono font-bold">{row.action !== 'MAINTAIN' ? (<span style={{ color: themeColor }}>£{safeFormat(row.adjustedPrice, 2)}</span>) : '-'}{row.safetyViolation && <AlertCircle className="w-4 h-4 text-red-500 inline ml-1" />}</td>
                                            <td className="p-4 text-center">{row.action === 'INCREASE' && <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-bold">INCREASE</span>}{row.action === 'DECREASE' && <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-bold">DECREASE</span>}{row.action === 'MAINTAIN' && <span className="text-gray-400 text-xs shadow-sm border px-2 py-1 rounded">MAINTAIN</span>}</td>
                                            <td className="p-4 text-xs text-gray-500 max-w-[200px] truncate" title={row.reasoning}>{row.inPromotion && <span className="text-indigo-600 font-bold mr-1">[PROMO]</span>}{row.reasoning}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* ... (Footer pagination remains same) ... */}
                        {filteredAndSortedData.length > 0 && (<div className="bg-gray-50/50 px-4 py-3 border-t border-custom-glass flex items-center justify-between sm:px-6"><div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between"><div className="flex items-center gap-4"><p className="text-sm text-gray-700">Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredAndSortedData.length)}</span> of <span className="font-medium">{filteredAndSortedData.length}</span> results</p><select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer focus:ring-indigo-500 focus:border-indigo-500"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select></div><div>{totalPages > 1 && (<nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"><button onClick={() => setCurrentPage(prev => prev - 1)} disabled={currentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"><ChevronLeft className="h-5 w-5" /></button><span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">Page {currentPage} of {totalPages}</span><button onClick={() => setCurrentPage(prev => prev + 1)} disabled={currentPage === totalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"><ChevronRight className="h-5 w-5" /></button></nav>)}</div></div></div>)}
                    </div>
                </div>
            )}

            {activeTab === 'HISTORY' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    {/* ... (History content remains same) ... */}
                    <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex items-start gap-4">
                        <div className="p-2 bg-blue-50 text-blue-700 rounded-lg"><Info className="w-5 h-5" /></div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Price Change Ledger</h3>
                            <p className="text-xs text-gray-500 mt-1">This log is automatically populated when you upload a daily CA Report. The system compares your new upload against the previous prices to detect changes.<br/><span className="font-semibold text-blue-600">Impact Analysis:</span> We compare average daily velocity for the 7 days <em>before</em> the change vs. 7 days <em>after</em>.</p>
                        </div>
                    </div>
                    <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                        <div className="p-4 border-b border-custom-glass bg-gray-50/50">
                            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                                <div className="w-full max-w-lg">
                                    <TagSearchInput tags={searchTags} onTagsChange={(tags) => { setSearchTags(tags); setHistoryCurrentPage(1); }} onInputChange={(val) => { setSearchQuery(val); setHistoryCurrentPage(1); }} placeholder="Search History (SKU or Name)..." themeColor={themeColor} />
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-xs text-gray-500">Showing <strong>{historyTableData.length}</strong> records</div>
                                    <button onClick={handleHistoryExport} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 shadow-sm transition-colors"><Download className="w-3.5 h-3.5" /> Export Log</button>
                                    <button onClick={() => setIsManualLodgeOpen(true)} className="px-3 py-1.5 bg-indigo-600 text-white border border-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-sm transition-colors"><Plus className="w-3.5 h-3.5" /> Lodge Manual Change</button>
                                </div>
                            </div>
                        </div>
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50/50 text-gray-600 font-semibold border-b border-gray-200/50">
                                <tr>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">SKU</th>
                                    <th className="p-4 text-center">Change</th>
                                    <th className="p-4 text-right">Old Price</th>
                                    <th className="p-4 text-center"></th>
                                    <th className="p-4 text-left">New Price</th>
                                    <th className="p-4 text-center">Impact (7-Day Avg)</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100/50">
                                {paginatedHistoryData.map((row: any) => {
                                    const isEditing = editingHistoryId === row.id;
                                    return (
                                    <tr key={row.id} className={`even:bg-gray-50/30 hover:bg-gray-100/50 ${isEditing ? 'bg-indigo-50/50' : ''}`}>
                                        <td className="p-4 text-gray-500 text-xs">{isEditing ? <input type="date" value={editingDate} onChange={(e) => setEditingDate(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-md text-sm w-full bg-white" autoFocus/> : new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                        <td className="p-4"><div className="font-bold text-gray-900">{row.sku}</div><div className="text-xs text-gray-500 truncate max-w-[250px]">{row.productName}</div></td>
                                        <td className="p-4 text-center"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${row.changeType === 'INCREASE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{row.changeType === 'INCREASE' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}{Math.abs(row.percentChange).toFixed(1)}%</span></td>
                                        <td className="p-4 text-right text-gray-400 line-through">£{row.oldPrice.toFixed(2)}</td>
                                        <td className="p-4 text-center text-gray-300"><ArrowRight className="w-4 h-4 mx-auto" /></td>
                                        <td className="p-4 font-bold text-gray-900">£{row.newPrice.toFixed(2)}</td>
                                        <td className="p-4"><div className="flex items-center justify-center gap-2 text-xs"><span className="text-gray-500 font-medium">{row.preVel.toFixed(1)}/d</span><ArrowRight className="w-3 h-3 text-gray-300" /><span className={`font-bold ${row.postVel > row.preVel ? 'text-green-600' : row.postVel < row.preVel ? 'text-red-600' : 'text-gray-600'}`}>{row.postVel.toFixed(1)}/d</span></div></td>
                                        <td className="p-4 text-right">{isEditing ? (<div className="flex items-center justify-end gap-2 h-7"><button onClick={() => {if (onUpdatePriceChangeRecord && editingDate) { onUpdatePriceChangeRecord({ ...row, date: editingDate }); setRecentlySavedId(row.id); setTimeout(() => setRecentlySavedId(null), 2500); } setEditingHistoryId(null);}} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg" title="Save"><Save className="w-4 h-4" /></button><button onClick={() => setEditingHistoryId(null)} className="p-1.5 text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg" title="Cancel"><X className="w-4 h-4" /></button></div>) : (<div className="flex items-center justify-end gap-2 h-7">{recentlySavedId === row.id && (<span className="text-xs text-green-600 font-medium animate-in fade-in duration-300 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Saved</span>)}<button onClick={() => { setEditingHistoryId(row.id); setEditingDate(new Date(row.date).toISOString().split('T')[0]); }} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit Date"><Edit2 className="w-4 h-4" /></button></div>)}</td>
                                    </tr>
                                )})}
                                {paginatedHistoryData.length === 0 && (<tr><td colSpan={8} className="p-12 text-center text-gray-400">No price changes found.</td></tr>)}
                            </tbody>
                        </table>
                        {/* Fixed pagination footer for Price Change Log */}
                        {historyTableData.length > 0 && (
                          <div className="bg-gray-50/50 px-4 py-3 border-t border-custom-glass flex items-center justify-between sm:px-6">
                            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-gray-700">Showing <span className="font-medium">{(historyCurrentPage - 1) * historyItemsPerPage + 1}</span> to <span className="font-medium">{Math.min(historyCurrentPage * historyItemsPerPage, historyTableData.length)}</span> of <span className="font-medium">{historyTableData.length}</span> results</p>
                                <select value={historyItemsPerPage} onChange={(e) => { setHistoryItemsPerPage(Number(e.target.value)); setHistoryCurrentPage(1); }} className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer focus:ring-indigo-500 focus:border-indigo-500">
                                  <option value={10}>10</option>
                                  <option value={25}>25</option>
                                  <option value={50}>50</option>
                                  <option value={100}>100</option>
                                </select>
                              </div>
                              <div>
                                {totalHistoryPages > 1 && (
                                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                    <button onClick={() => setHistoryCurrentPage(prev => Math.max(prev - 1, 1))} disabled={historyCurrentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                                      <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                      Page {historyCurrentPage} of {totalHistoryPages}
                                    </span>
                                    <button onClick={() => setHistoryCurrentPage(prev => Math.min(totalHistoryPages, prev + 1))} disabled={historyCurrentPage === totalHistoryPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                                      <ChevronRight className="h-5 w-5" />
                                    </button>
                                  </nav>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'COST_HISTORY' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    {/* ... (Cost History content remains same) ... */}
                    <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex items-start gap-4">
                        <div className="p-2 bg-green-50 text-green-700 rounded-lg"><Info className="w-5 h-5" /></div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Cost Price Change Ledger</h3>
                            <p className="text-xs text-gray-500 mt-1">This log is automatically populated when you upload an ERP Inventory Report. The system compares the new cost against the previously stored cost to detect changes.</p>
                        </div>
                    </div>
                    <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                        <div className="p-4 border-b border-custom-glass bg-gray-50/50">
                             <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                                <div className="w-full max-w-lg">
                                    <TagSearchInput tags={searchTags} onTagsChange={(tags) => { setSearchTags(tags); setCostHistoryCurrentPage(1); }} onInputChange={(val) => { setSearchQuery(val); setCostHistoryCurrentPage(1); }} placeholder="Search History (SKU or Name)..." themeColor={themeColor} />
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-xs text-gray-500">Showing <strong>{costHistoryTableData.length}</strong> records</div>
                                    <button onClick={handleCostHistoryExport} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 shadow-sm transition-colors"><Download className="w-3.5 h-3.5" /> Export Log</button>
                                    <button onClick={() => setIsManualCostLodgeOpen(true)} className="px-3 py-1.5 bg-indigo-600 text-white border border-indigo-700 rounded-lg text-xs font-bold hover:bg-indigo-700 flex items-center gap-2 shadow-sm transition-colors"><Plus className="w-3.5 h-3.5" /> Lodge Manual Cost Change</button>
                                </div>
                            </div>
                        </div>
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50/50 text-gray-600 font-semibold border-b border-gray-200/50">
                                <tr>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">SKU</th>
                                    <th className="p-4 text-center">Change</th>
                                    <th className="p-4 text-right">Old Cost</th>
                                    <th className="p-4 text-center"></th>
                                    <th className="p-4 text-left">New Cost</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100/50">
                                {paginatedCostHistoryData.map((row: any) => {
                                    const isEditing = editingCostHistoryId === row.id;
                                    return (
                                        <tr key={row.id} className={`even:bg-gray-50/30 hover:bg-gray-100/50 ${isEditing ? 'bg-indigo-50/50' : ''}`}>
                                            <td className="p-4 text-gray-500 text-xs">{isEditing ? <input type="date" value={editingCostDate} onChange={(e) => setEditingCostDate(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-md text-sm w-full bg-white" autoFocus/> : new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                            <td className="p-4"><div className="font-bold text-gray-900">{row.sku}</div><div className="text-xs text-gray-500 truncate max-w-[250px]">{row.productName}</div></td>
                                            <td className="p-4 text-center"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${row.changeType === 'INCREASE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{row.changeType === 'INCREASE' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}{Math.abs(row.percentChange).toFixed(1)}%</span></td>
                                            <td className="p-4 text-right text-gray-400 line-through">£{row.oldCost.toFixed(2)}</td>
                                            <td className="p-4 text-center text-gray-300"><ArrowRight className="w-4 h-4 mx-auto" /></td>
                                            <td className="p-4 font-bold text-gray-900">£{row.newCost.toFixed(2)}</td>
                                            <td className="p-4 text-right">{isEditing ? (<div className="flex items-center justify-end gap-2 h-7"><button onClick={() => {if (onUpdateCostChangeRecord && editingCostDate) { onUpdateCostChangeRecord({ ...row, date: editingCostDate }); setRecentlySavedCostId(row.id); setTimeout(() => setRecentlySavedCostId(null), 2500); } setEditingCostHistoryId(null);}} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg" title="Save"><Save className="w-4 h-4" /></button><button onClick={() => setEditingCostHistoryId(null)} className="p-1.5 text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg" title="Cancel"><X className="w-4 h-4" /></button></div>) : (<div className="flex items-center justify-end gap-2 h-7">{recentlySavedCostId === row.id && (<span className="text-xs text-green-600 font-medium animate-in fade-in duration-300 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Saved</span>)}<button onClick={() => { setEditingCostHistoryId(row.id); setEditingCostDate(new Date(row.date).toISOString().split('T')[0]); }} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit Date"><Edit2 className="w-4 h-4" /></button></div>)}</td>
                                        </tr>
                                    );
                                })}
                                {paginatedCostHistoryData.length === 0 && (<tr><td colSpan={7} className="p-12 text-center text-gray-400">No cost changes found.</td></tr>)}
                            </tbody>
                        </table>
                        {/* Fixed pagination footer for Cost Change Log */}
                        {costHistoryTableData.length > 0 && (
                          <div className="bg-gray-50/50 px-4 py-3 border-t border-custom-glass flex items-center justify-between sm:px-6">
                            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-gray-700">Showing <span className="font-medium">{(costHistoryCurrentPage - 1) * costHistoryItemsPerPage + 1}</span> to <span className="font-medium">{Math.min(costHistoryCurrentPage * costHistoryItemsPerPage, costHistoryTableData.length)}</span> of <span className="font-medium">{costHistoryTableData.length}</span> results</p>
                                <select value={costHistoryItemsPerPage} onChange={(e) => { setCostHistoryItemsPerPage(Number(e.target.value)); setCostHistoryCurrentPage(1); }} className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer focus:ring-indigo-500 focus:border-indigo-500">
                                  <option value={10}>10</option>
                                  <option value={25}>25</option>
                                  <option value={50}>50</option>
                                  <option value={100}>100</option>
                                </select>
                              </div>
                              <div>
                                {totalCostHistoryPages > 1 && (
                                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                    <button onClick={() => setCostHistoryCurrentPage(prev => Math.max(1, prev - 1))} disabled={costHistoryCurrentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                                      <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                      Page {costHistoryCurrentPage} of {totalCostHistoryPages}
                                    </span>
                                    <button onClick={() => setCostHistoryCurrentPage(prev => Math.min(totalCostHistoryPages, prev + 1))} disabled={costHistoryCurrentPage === totalCostHistoryPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                                      <ChevronRight className="h-5 w-5" />
                                    </button>
                                  </nav>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'INVENTORY_HISTORY' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    {/* ... (Inventory History content) */}
                    <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex items-start gap-4">
                        <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg"><Database className="w-5 h-5" /></div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Inventory Change Log</h3>
                            <p className="text-xs text-gray-500 mt-1">This log tracks when your in-stock levels increase (e.g. from an ERP upload or new product creation). It only records positive stock deltas.</p>
                        </div>
                    </div>
                    <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                        <div className="p-4 border-b border-custom-glass bg-gray-50/50">
                             <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                                <div className="w-full max-w-lg">
                                    <TagSearchInput tags={searchTags} onTagsChange={(tags) => { setSearchTags(tags); setInventoryHistoryCurrentPage(1); }} onInputChange={(val) => { setSearchQuery(val); setInventoryHistoryCurrentPage(1); }} placeholder="Search Inventory History (SKU or Name)..." themeColor={themeColor} />
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-xs text-gray-500">Showing <strong>{inventoryHistoryTableData.length}</strong> records</div>
                                    <button onClick={handleInventoryHistoryExport} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 shadow-sm transition-colors"><Download className="w-3.5 h-3.5" /> Export Log</button>
                                </div>
                            </div>
                        </div>
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50/50 text-gray-600 font-semibold border-b border-gray-200/50">
                                <tr>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">SKU</th>
                                    <th className="p-4 text-center">Stock Before</th>
                                    <th className="p-4 text-center">Stock After</th>
                                    <th className="p-4 text-center">+Delta</th>
                                    <th className="p-4 text-center">Strategic?</th>
                                    <th className="p-4">Source / Reason</th>
                                    <th className="p-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100/50">
                                {paginatedInventoryHistoryData.map((row: InventoryChangeRecord) => {
                                    const isEditing = editingInventoryHistoryId === row.id;
                                    return (
                                        <tr key={row.id} className={`even:bg-gray-50/30 hover:bg-gray-100/50 ${isEditing ? 'bg-indigo-50/50' : ''}`}>
                                            <td className="p-4 text-gray-500 text-xs">{isEditing ? <input type="date" value={editingInventoryDate} onChange={(e) => setEditingInventoryDate(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-md text-sm w-full bg-white" autoFocus/> : new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                            <td className="p-4"><div className="font-bold text-gray-900">{row.sku}</div><div className="text-xs text-gray-500 truncate max-w-[250px]">{row.productName}</div></td>
                                            <td className="p-4 text-center text-gray-400">{row.prevStock}</td>
                                            <td className="p-4 text-center font-bold text-gray-900">{row.newStock}</td>
                                            <td className="p-4 text-center"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">+{row.deltaStock}</span></td>
                                            <td className="p-4 text-center">
                                                {row.isStrategic ? (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">YES</span>
                                                ) : (
                                                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">NO</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-xs text-gray-500">
                                                <div className="font-medium text-gray-700">{row.source}</div>
                                                {row.reason && <div className="text-gray-400 mt-0.5 italic">{row.reason}</div>}
                                            </td>
                                            <td className="p-4 text-right">{isEditing ? (<div className="flex items-center justify-end gap-2 h-7"><button onClick={() => {if (onUpdateInventoryChangeRecord && editingInventoryDate) { onUpdateInventoryChangeRecord({ ...row, date: editingInventoryDate }); setRecentlySavedInventoryId(row.id); setTimeout(() => setRecentlySavedInventoryId(null), 2500); } setEditingInventoryHistoryId(null);}} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg" title="Save"><Save className="w-4 h-4" /></button><button onClick={() => setEditingInventoryHistoryId(null)} className="p-1.5 text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg" title="Cancel"><X className="w-4 h-4" /></button></div>) : (<div className="flex items-center justify-end gap-2 h-7">{recentlySavedInventoryId === row.id && (<span className="text-xs text-green-600 font-medium animate-in fade-in duration-300 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Saved</span>)}<button onClick={() => { setEditingInventoryHistoryId(row.id); setEditingInventoryDate(new Date(row.date).toISOString().split('T')[0]); }} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Edit Date"><Edit2 className="w-4 h-4" /></button></div>)}</td>
                                        </tr>
                                    );
                                })}
                                {paginatedInventoryHistoryData.length === 0 && (<tr><td colSpan={8} className="p-12 text-center text-gray-400">No inventory increases found for the selected range.</td></tr>)}
                            </tbody>
                        </table>
                        {/* Fixed pagination footer for Inventory Change Log */}
                        {inventoryHistoryTableData.length > 0 && (
                          <div className="bg-gray-50/50 px-4 py-3 border-t border-custom-glass flex items-center justify-between sm:px-6">
                            <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-gray-700">Showing <span className="font-medium">{(inventoryHistoryCurrentPage - 1) * inventoryHistoryItemsPerPage + 1}</span> to <span className="font-medium">{Math.min(inventoryHistoryCurrentPage * inventoryHistoryItemsPerPage, inventoryHistoryTableData.length)}</span> of <span className="font-medium">{inventoryHistoryTableData.length}</span> results</p>
                                <select value={inventoryHistoryItemsPerPage} onChange={(e) => { setInventoryHistoryItemsPerPage(Number(e.target.value)); setInventoryHistoryCurrentPage(1); }} className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer focus:ring-indigo-500 focus:border-indigo-500">
                                  <option value={10}>10</option>
                                  <option value={25}>25</option>
                                  <option value={50}>50</option>
                                  <option value={100}>100</option>
                                </select>
                              </div>
                              <div>
                                {totalInventoryHistoryPages > 1 && (
                                  <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                    <button onClick={() => setInventoryHistoryCurrentPage(prev => Math.max(1, prev - 1))} disabled={inventoryHistoryCurrentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                                      <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                      Page {inventoryHistoryCurrentPage} of {totalInventoryHistoryPages}
                                    </span>
                                    <button onClick={() => setInventoryHistoryCurrentPage(prev => Math.min(totalInventoryHistoryPages, prev + 1))} disabled={inventoryHistoryCurrentPage === totalInventoryHistoryPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors">
                                      <ChevronRight className="h-5 w-5" />
                                    </button>
                                  </nav>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                    </div>
                </div>
            )}

            {isCustomDateModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setIsCustomDateModalOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-gray-200 p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Select Custom Range</h3>
                        <div className="space-y-4">
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Start Date</label><input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
                            <div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">End Date</label><input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" /></div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setIsCustomDateModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button>
                            <button onClick={() => { setSelectedWindow('Custom'); setIsCustomDateModalOpen(false); setCurrentPage(1); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700">Apply Range</button>
                        </div>
                    </div>
                </div>, document.body
            )}

            {isManualLodgeOpen && onManualPriceChange && (
                <ManualPriceChangeModal products={products} onClose={() => setIsManualLodgeOpen(false)} onConfirm={onManualPriceChange} />
            )}

            {isManualCostLodgeOpen && onManualCostChange && (
                <ManualCostChangeModal products={products} onClose={() => setIsManualCostLodgeOpen(false)} onConfirm={onManualCostChange} />
            )}
        </div>
    );
};

export default StrategyPage;
