
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ContextBar } from '../common/ContextBar';
import { Product, StrategyConfig, PricingRules, PromotionEvent, PriceChangeRecord, VelocityLookback, CostChangeRecord, PriceLog, InventoryChangeRecord, RefundLog, SkuFamily, OptimalPriceResult } from '../../types';
import { ThresholdConfig } from '../../services/thresholdsConfig';
import { DEFAULT_STRATEGY_RULES, VAT_MULTIPLIER } from '../../constants';
import { Activity, History, Coins, Database, Ship, Settings, Download, X, ArrowRight, RotateCcw, TrendingUp, TrendingDown, Save, Edit2, CheckCircle, Info, Plus, ChevronLeft, ChevronRight } from 'lucide-react';
import { asDateKey, isDateKeyBetween, addDaysToDateKey, getTodayKeyMelbourne, getYesterdayKeyMelbourne } from '../../services/dateUtils';
import { formatSmartMoney } from '../../utils/format';
import { SortState, sortRows } from '../../utils/tableSort';
import { resolveEffectiveVelocity } from '../../services/metrics';

// Panels
import { ConfigParametersPanel } from './panels/ConfigParametersPanel';
import { AuditReconciliationPanel } from './panels/AuditReconciliationPanel';
import { RecommendationsTable } from './panels/RecommendationsTable';
import { TagSearchInput } from '../TagSearchInput'; // Keep for non-engine tabs
import { SortableHeader } from '../common/SortableHeader'; // For history tables
import { TabSwitcher } from '../common/TabSwitcher';
import ManualPriceChangeModal from '../ManualPriceChangeModal';
import ManualCostChangeModal from '../ManualCostChangeModal';

interface StrategyPageContainerProps {
    products: Product[];
    pricingRules: PricingRules;
    currentConfig: StrategyConfig;
    onSaveConfig: (config: StrategyConfig) => void;
    themeColor: string;
    priceHistoryMap: Map<string, PriceLog[]>;
    refundHistory?: RefundLog[];
    deductRefunds: boolean;
    setDeductRefunds: (v: boolean) => void;
    promotions: PromotionEvent[];
    priceChangeHistory: PriceChangeRecord[];
    costChangeHistory: CostChangeRecord[];
    inventoryChangeHistory: InventoryChangeRecord[];
    velocityLookback: VelocityLookback;
    thresholds?: ThresholdConfig;
    skuFamilies: SkuFamily[];
    onUpdatePriceChangeRecord?: (record: PriceChangeRecord) => void;
    onUpdateCostChangeRecord?: (record: CostChangeRecord) => void;
    onUpdateInventoryChangeRecord?: (record: InventoryChangeRecord) => void;
    onManualPriceChange?: (data: Omit<PriceChangeRecord, 'id' | 'changeType' | 'percentChange'>) => void;
    onManualCostChange?: (data: Omit<CostChangeRecord, 'id' | 'changeType' | 'percentChange'>) => void;
    // NOTE: wired down from App.tsx via StrategyPage in Session 6
    optimalPriceResults?: Map<string, OptimalPriceResult>;
}

const StrategyPageContainerInner: React.FC<StrategyPageContainerProps> = ({
    products, pricingRules, currentConfig, onSaveConfig, themeColor,
    priceHistoryMap, refundHistory = [], deductRefunds, setDeductRefunds, promotions, priceChangeHistory = [], costChangeHistory = [],
    inventoryChangeHistory = [],
    velocityLookback, thresholds,
    skuFamilies = [],
    onUpdatePriceChangeRecord,
    onUpdateCostChangeRecord,
    onUpdateInventoryChangeRecord,
    onManualPriceChange,
    onManualCostChange,
    optimalPriceResults,
}) => {
    // --- STATE ---
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
    const [isManualLodgeOpen, setIsManualLodgeOpen] = useState(false);
    const [isManualCostLodgeOpen, setIsManualCostLodgeOpen] = useState(false);

    const [activeTab, setActiveTab] = useState<'ENGINE' | 'HISTORY' | 'COST_HISTORY' | 'INVENTORY_HISTORY'>('ENGINE');
    const [filterTab, setFilterTab] = useState<'All' | 'INCREASE' | 'DECREASE' | 'MAINTAIN'>('All');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
    const [historyItemsPerPage, setHistoryItemsPerPage] = useState(25);
    const [costHistoryCurrentPage, setCostHistoryCurrentPage] = useState(1);
    const [costHistoryItemsPerPage, setCostHistoryItemsPerPage] = useState(25);
    const [inventoryHistoryCurrentPage, setInventoryHistoryCurrentPage] = useState(1);
    const [inventoryHistoryItemsPerPage, setInventoryHistoryItemsPerPage] = useState(25);

    // Edit states for history tables (kept inline)
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

    // --- HELPERS ---
    const safeNum = (val: any) => {
        const n = Number(val);
        return isNaN(n) ? 0 : n;
    };

    const safeFormat = (val: any, decimals: number = 2) => {
        const n = Number(val);
        if (isNaN(n)) return '0.' + '0'.repeat(decimals);
        return n.toFixed(decimals);
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
        } else if (setting === 'Yesterday') {
            startKey = yesterdayKey;
            endKey = yesterdayKey;
            days = 1;
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

    // --- METRICS CALCULATION ---
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

        // Deduct Returns if requested
        if (deductRefunds) {
            const skuRefunds = refundHistory.filter(r => {
                if (r.sku !== product.sku) return false;
                if (r.platform && pricingRules[r.platform]?.isExcluded) return false;
                const dKey = asDateKey(r.date);
                return dKey && isDateKeyBetween(dKey, startKey, endKey);
            });
            skuRefunds.forEach(r => {
                const refundAmount = Number(r.amount) || 0;
                const freightAmount = Number(r.freightAmount) || 0;
                totalProfit -= (refundAmount + freightAmount);
            });
        }

        const rawAvgPrice = totalQty > 0 ? weightedPriceSum / totalQty : safeNum(product.currentPrice);
        const netPmPercent = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
        const dailyVelocity = totalQty / effectiveDays;

        const averagePrice = rawAvgPrice * VAT_MULTIPLIER;
        const totalSalesWithVat = totalSales * VAT_MULTIPLIER;

        return { totalSales: totalSalesWithVat, totalQty, averagePrice, netPmPercent, totalProfit, dailyVelocity };
    };

    const getRecommendation = (product: Product, dailyVelocity: number, netPmPercent: number, thresholds?: ThresholdConfig) => {
        const basePrice = safeNum(product.caPrice) || safeNum(product.currentPrice);
        const effectiveStock = safeNum(product.stockLevel) + (includeIncoming ? safeNum(product.incomingStock) : 0);

        const todayKey = getTodayKeyMelbourne();
        const limit7StartKey = addDaysToDateKey(todayKey, -7);

        const guardDays = safeNum(config.decrease.freshStockGuardDays ?? 0);
        const guardStartKey = addDaysToDateKey(todayKey, -(guardDays - 1));

        const recentStrategicRestock = guardDays > 0 ? inventoryChangeHistory.find(log => {
            const lKey = asDateKey(log.date);
            return lKey && lKey >= guardStartKey && lKey <= todayKey && log.sku === product.sku && log.isStrategic;
        }) : null;

        const inFreshStockGuard = !!recentStrategicRestock;

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

        if (action === 'DECREASE' && inFreshStockGuard) {
            action = 'MAINTAIN';
            reasoning = 'Stable';
        }

        return {
            action, adjustedPrice, reasoning, safetyViolation, runwayDays, effectiveStock, floorPrice, isNew, inPromotion, promoPlatforms,
            inFreshStockGuard, excludedReason: action === 'MAINTAIN' && inFreshStockGuard ? 'FRESH_STOCK_GUARD' : ''
        };
    };

    const tableData = useMemo(() => {
        // Calculate date limit for 30D recent changes scan
        const today = new Date();
        const d30 = new Date(today);
        d30.setDate(d30.getDate() - 30);
        const limitDate30d = d30.toISOString().split('T')[0];

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

                // CONSISTENCY FIX: Prioritize ERP velocity, otherwise use fallback weighted formula
                const effectiveDailySales = resolveEffectiveVelocity(p, priceHistoryMap.get(p.sku));

                const rec = getRecommendation(p, effectiveDailySales, global.netPmPercent, thresholds);

                // --- Recent Changes Bucketing (30D Timeline) ---
                // Changes sorted by date ascending
                const changes30d = priceChangeHistory
                    .filter(c => c.sku.toUpperCase() === p.sku.toUpperCase() && c.date >= limitDate30d)
                    .sort((a, b) => a.date.localeCompare(b.date));

                // Buckets: [22-30 days ago, 15-21 days ago, 8-14 days ago, 0-7 days ago]
                // Index 3 is most recent (rightmost)
                const weeklyChanges: (string | null)[] = [null, null, null, null];

                changes30d.forEach(change => {
                    const cDate = new Date(change.date);
                    const diffTime = Math.abs(today.getTime() - cDate.getTime());
                    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));

                    let bucketIdx = -1;
                    if (diffDays <= 7) bucketIdx = 3;
                    else if (diffDays <= 14) bucketIdx = 2;
                    else if (diffDays <= 21) bucketIdx = 1;
                    else if (diffDays <= 30) bucketIdx = 0;

                    if (bucketIdx !== -1) {
                        // Overwrite if multiple changes in same week - assumes latest change defines the week's state
                        weeklyChanges[bucketIdx] = (change.changeType as string) || null;
                    }
                });

                return {
                    ...p,
                    recentTotalSales: local.totalSales,
                    recentTotalQty: local.totalQty,
                    averagePrice: local.averagePrice,
                    netPmPercent: local.netPmPercent,
                    totalProfit: local.totalProfit,
                    dailyVelocity: effectiveDailySales,
                    recentChanges: weeklyChanges,
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
    }, [products, config, searchQuery, searchTags, selectedWindow, customStart, customEnd, velocityLookback, priceHistoryMap, refundHistory, deductRefunds, includeIncoming, pricingRules, showOOS, thresholds, promotions, inventoryChangeHistory, priceChangeHistory]);

    const filteredAndSortedData = useMemo(() => {
        let data = tableData.filter(row => filterTab === 'All' || row.action === filterTab);

        if (sort) {
            const getValue = (row: any, key: string) => {
                switch (key) {
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
                    case 'recentChanges': {
                        // Sort by number of active changes for now
                        return row.recentChanges.filter((c: any) => c !== null).length;
                    }
                    default: return 0;
                }
            };
            data = sortRows(data, sort, getValue);
        } else {
            data.sort((a, b) => {
                const score = (x: string) => x === 'INCREASE' ? 3 : x === 'DECREASE' ? 2 : 1;
                return score(b.action) - score(a.action);
            });
        }
        return data;
    }, [tableData, filterTab, sort]);

    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredAndSortedData.slice(start, start + itemsPerPage);
    }, [filteredAndSortedData, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage);

    // Audit Stats
    const auditStats = useMemo(() => {
        if (!isAuditPanelVisible || filteredAndSortedData.length === 0) return null;

        const localWindow = getCalculationWindow(selectedWindow, customStart, customEnd);
        const distinctDays = new Set<string>();

        filteredAndSortedData.forEach(product => {
            const logs = priceHistoryMap.get(product.sku) || [];
            logs.forEach(log => {
                const dKey = asDateKey(log.date);
                if (dKey && isDateKeyBetween(dKey, localWindow.startKey, localWindow.endKey)) {
                    distinctDays.add(dKey);
                }
            });
        });

        return {
            productCount: filteredAndSortedData.length,
            local: { distinctDaysCount: distinctDays.size }
        };
    }, [isAuditPanelVisible, filteredAndSortedData, selectedWindow, customStart, customEnd, priceHistoryMap]);

    // History Table Data Logic (kept inline for simplicity and safety)
    const historyTableData = useMemo(() => {
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

        const safeArr = Array.isArray(priceChangeHistory) ? priceChangeHistory : [];
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
                ...change, preVel, postVel,
                velocityChange: preVel > 0 ? ((postVel - preVel) / preVel) * 100 : (postVel > 0 ? 100 : 0)
            };
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        if (searchTags.length > 0 || searchQuery) {
            data = data.filter(item => {
                const matchesTerm = (term: string) => {
                    const t = term.toLowerCase();
                    return item.sku.toLowerCase().includes(t) || (item.productName || '').toLowerCase().includes(t);
                };
                if (searchTags.length > 0) return searchTags.some(tag => matchesTerm(tag));
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

    // Cost History Logic
    const costHistoryTableData = useMemo(() => {
        const safeArr = Array.isArray(costChangeHistory) ? costChangeHistory : [];
        let data = [...safeArr].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        if (searchTags.length > 0 || searchQuery) {
            data = data.filter(item => {
                const matchesTerm = (term: string) => {
                    const t = term.toLowerCase();
                    return item.sku.toLowerCase().includes(t) || (item.productName || '').toLowerCase().includes(t);
                };
                if (searchTags.length > 0) return searchTags.some(tag => matchesTerm(tag));
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

    // Inventory History Logic
    const inventoryHistoryTableData = useMemo(() => {
        const window = getCalculationWindow(selectedWindow, customStart, customEnd);
        const safeArr = Array.isArray(inventoryChangeHistory) ? inventoryChangeHistory : [];
        let data = [...safeArr];
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
                    return item.sku.toLowerCase().includes(t) || (item.productName || '').toLowerCase().includes(t);
                };
                if (searchTags.length > 0) return searchTags.some(tag => matchesTerm(tag));
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
        if (pricingRules) Object.keys(pricingRules).forEach(k => platformSet.add(k));
        return Array.from(platformSet).sort();
    }, [products, pricingRules]);

    const handleExport = (platform: string = 'All') => {
        const clean = (val: any) => `"${String(val || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""')}"`;
        const headers = [
            'SKU', 'Master SKU', 'Name', 'CA Price', 'New Price',
            'Runway (Days)', 'Inventory', 'Recent Avg Price', 'Recent Sales $',
            'Recent Qty', 'Net PM%', 'Is New', 'Action', 'Floor Price',
            'Safety Alert', 'Reason', 'On Promotion', 'Promo Platforms',
            'In Fresh Stock Guard', 'Exclusion Reason'
        ];

        const rows: string[][] = [];
        tableData.forEach((r: any) => {
            const finalReasoning = r.inPromotion ? `[PROMOTION WARNING] ${r.reasoning}` : r.reasoning;
            const commonData = [
                clean(r.name), safeFormat(r.caPrice, 2), safeFormat(r.adjustedPrice, 2),
                safeFormat(r.runwayDays, 0), safeFormat(r.effectiveStock, 0), safeFormat(r.averagePrice, 2),
                safeFormat(r.recentTotalSales, 2), safeFormat(r.recentTotalQty, 0), safeFormat(r.netPmPercent, 1),
                r.isNew ? 'Yes' : 'No', clean(r.action), safeFormat(r.floorPrice, 2),
                r.safetyViolation ? 'VIOLATION' : '', clean(finalReasoning),
                r.inPromotion ? 'TRUE' : 'FALSE', clean(r.promoPlatforms?.join(', ') || ''),
                r.inFreshStockGuard ? 'TRUE' : 'FALSE', clean(r.excludedReason)
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
        setTimeout(() => { if (document.body.contains(link)) document.body.removeChild(link); URL.revokeObjectURL(url); }, 60000);
        setIsExportMenuOpen(false);
    };

    const handleHistoryExport = (type: 'price' | 'cost' | 'inventory') => {
        let headers: string[] = [];
        let rows: any[] = [];
        let filename = '';

        const clean = (val: any) => `"${String(val || '').replace(/[\r\n]+/g, ' ').replace(/"/g, '""')}"`;

        if (type === 'price') {
            headers = ['Date', 'SKU', 'Product Name', 'Change Type', 'Change %', 'Old Price', 'New Price', 'Pre-Change Avg Daily Vel', 'Post-Change Avg Daily Vel', 'Vel Impact %'];
            rows = historyTableData.map(row => [
                row.date, clean(row.sku), clean(row.productName || ''), row.changeType,
                (row.percentChange || 0).toFixed(2) + '%', row.oldPrice.toFixed(2), row.newPrice.toFixed(2),
                row.preVel.toFixed(2), row.postVel.toFixed(2), row.velocityChange.toFixed(1) + '%'
            ]);
            filename = `price_change_log_${new Date().toISOString().slice(0, 10)}.csv`;
        } else if (type === 'cost') {
            headers = ['Date', 'SKU', 'Product Name', 'Change Type', 'Change %', 'Old Cost', 'New Cost'];
            rows = costHistoryTableData.map(row => [
                row.date, clean(row.sku), clean(row.productName || ''), row.changeType,
                (row.percentChange || 0).toFixed(2) + '%', row.oldCost.toFixed(2), row.newCost.toFixed(2),
            ]);
            filename = `cost_change_log_${new Date().toISOString().slice(0, 10)}.csv`;
        } else if (type === 'inventory') {
            headers = ['Date', 'SKU', 'Product Name', 'Stock Before', 'Stock After', '+Delta', 'Source', 'Is Strategic', 'Reason'];
            rows = inventoryHistoryTableData.map(row => [
                row.date, clean(row.sku), clean(row.productName), row.prevStock, row.newStock,
                row.deltaStock, row.source, row.isStrategic ? 'YES' : 'NO', clean(row.reason)
            ]);
            filename = `inventory_change_log_${new Date().toISOString().slice(0, 10)}.csv`;
        }

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\uFEFF', csvContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { if (document.body.contains(link)) document.body.removeChild(link); URL.revokeObjectURL(url); }, 100);
    };

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
            <div className="flex flex-wrap gap-4 items-center justify-between">
                <TabSwitcher
                    tabs={[
                        { key: 'ENGINE', label: 'Strategy Simulator', icon: Activity },
                        { key: 'HISTORY', label: 'Price Change Log', icon: History },
                        { key: 'COST_HISTORY', label: 'Cost Change Log', icon: Coins },
                        { key: 'INVENTORY_HISTORY', label: 'Inventory Change Log', icon: Database },
                    ]}
                    activeTab={activeTab}
                    onChange={(key) => { setActiveTab(key as 'ENGINE' | 'HISTORY' | 'COST_HISTORY' | 'INVENTORY_HISTORY'); setIsAuditPanelVisible(false); }}
                />

            </div>

            {activeTab === 'ENGINE' && (
                <div className="space-y-6">
                    <ContextBar
                        timeOptions={[
                            { key: 'Yesterday', label: 'Yesterday' },
                            { key: '7', label: '7D' },
                            { key: '14', label: '14D' },
                            { key: '30', label: '30D' },
                            { key: '60', label: '60D' },
                            { key: 'Custom', label: 'Custom' }
                        ]}
                        activeWindow={selectedWindow}
                        onWindowChange={(key) => { setSelectedWindow(key); setCurrentPage(1); }}
                        periodLabel={formattedDateRange}
                        customStart={customStart}
                        customEnd={customEnd}
                        onCustomStartChange={setCustomStart}
                        onCustomEndChange={setCustomEnd}
                        onCustomApply={() => { setSelectedWindow('Custom'); setCurrentPage(1); }}
                    >
                        <label className="flex items-center h-8 gap-2 px-3 bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:border-theme-20 transition-colors">
                            <input type="checkbox" checked={deductRefunds} onChange={e => setDeductRefunds(e.target.checked)} className="w-4 h-4 text-theme rounded focus:ring-theme border-gray-300" />
                            <div className="flex items-center gap-1.5">
                                <RotateCcw className={`w-3.5 h-3.5 ${deductRefunds ? 'text-red-500' : 'text-gray-400'}`} />
                                <span className={`text-[10px] font-bold uppercase tracking-tight ${deductRefunds ? 'text-gray-900' : 'text-gray-500'}`}>Deduct Returns</span>
                            </div>
                        </label>
                        <button onClick={() => setIsAuditPanelVisible(!isAuditPanelVisible)} className={`flex items-center gap-2 px-3 h-8 rounded-lg font-bold border transition-all shadow-sm text-xs ${isAuditPanelVisible ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`} title="Toggle Reconciliation Panel"><Activity className="w-4 h-4" />Audit: {isAuditPanelVisible ? 'On' : 'Off'}</button>
                        <button onClick={() => setIncludeIncoming(!includeIncoming)} className={`flex items-center gap-2 px-3 h-8 rounded-lg font-bold border transition-all shadow-sm text-xs ${includeIncoming ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`} title={includeIncoming ? "Including Incoming Stock in Runway Calc" : "Excluding Incoming Stock (Conservative Mode)"}><Ship className="w-4 h-4" />{includeIncoming ? 'Incoming Included' : 'Incoming Excluded'}</button>
                        <button onClick={() => setIsConfigOpen(!isConfigOpen)} className={`px-3 h-8 rounded-lg font-bold border flex items-center gap-2 transition-all text-xs ${isConfigOpen ? 'bg-gray-100 text-gray-900 border-gray-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}><Settings className="w-4 h-4" />{isConfigOpen ? 'Hide Rules' : 'Edit Rules'}</button>
                        <div className="relative">
                            <button onClick={() => setIsExportMenuOpen(!isExportMenuOpen)} className="px-3 h-8 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 shadow-sm flex items-center gap-2 transition-colors"><Download className="w-4 h-4" />Export Matrix</button>
                            {isExportMenuOpen && createPortal(
                                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setIsExportMenuOpen(false)}><div className="bg-custom-glass-modal backdrop-blur-custom-modal rounded-xl shadow-2xl w-full max-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-white/20" onClick={e => e.stopPropagation()}><div className="p-4 border-b border-gray-100/50 flex justify-between items-center bg-gray-50/50"><h3 className="font-bold text-gray-900">Export Strategy</h3><button onClick={() => setIsExportMenuOpen(false)} className="p-1 hover:bg-gray-200/50 rounded-full transition-colors"><X className="w-4 h-4 text-gray-500" /></button></div><div className="p-2"><div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Select Format</div><button onClick={() => handleExport('All')} className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50/50 flex items-center justify-between group rounded-lg transition-colors"><span className="font-medium">Standard (Master SKUs)</span><ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600" /></button><div className="my-2 border-t border-gray-100/50"></div><div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Export for Platform</div><div className="max-h-60 overflow-y-auto">{uniquePlatforms.map(platform => (<button key={platform} onClick={() => handleExport(platform)} className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50/50 flex items-center justify-between rounded-lg transition-colors"><span>{platform}</span><span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200">Alias Mode</span></button>))}{uniquePlatforms.length === 0 && (<div className="px-4 py-2 text-xs text-gray-400 italic">No platforms detected</div>)}</div></div></div></div>, document.body
                            )}
                        </div>
                    </ContextBar>

                    <AuditReconciliationPanel
                        isVisible={isAuditPanelVisible}
                        auditStats={auditStats}
                        startKey={getCalculationWindow(selectedWindow, customStart, customEnd).startKey}
                        endKey={getCalculationWindow(selectedWindow, customStart, customEnd).endKey}
                        rows={filteredAndSortedData}
                    />

                    <ConfigParametersPanel
                        config={config}
                        setConfig={setConfig}
                        onSave={onSaveConfig}
                        isConfigOpen={isConfigOpen}
                        setIsConfigOpen={setIsConfigOpen}
                    />

                    <RecommendationsTable
                        paginatedData={paginatedData}
                        totalCount={filteredAndSortedData.length}
                        currentPage={currentPage}
                        setCurrentPage={setCurrentPage}
                        itemsPerPage={itemsPerPage}
                        setItemsPerPage={setItemsPerPage}
                        totalPages={totalPages}
                        sort={sort}
                        setSort={setSort}
                        filterTab={filterTab}
                        setFilterTab={setFilterTab}
                        showOOS={showOOS}
                        setShowOOS={setShowOOS}
                        searchTags={searchTags}
                        setSearchTags={setSearchTags}
                        setSearchQuery={setSearchQuery}
                        themeColor={themeColor}
                        skuFamilies={skuFamilies}
                        products={products}
                        optimalPriceResults={optimalPriceResults}
                    />
                </div>
            )}

            {/* History Tabs (Table logic kept here as per plan) */}
            {activeTab === 'HISTORY' && (
                <div className="space-y-6">
                    <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex items-start gap-4">
                        <div className="p-2 bg-blue-50 text-blue-700 rounded-lg"><Info className="w-5 h-5" /></div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Price Change Ledger</h3>
                            <p className="text-xs text-gray-500 mt-1">This log is automatically populated when you upload a daily CA Report. The system compares your new upload against the previous prices to detect changes.<br /><span className="font-semibold text-blue-600">Impact Analysis:</span> We compare average daily velocity for the 7 days <em>before</em> the change vs. 7 days <em>after</em>.</p>
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
                                    <button onClick={() => handleHistoryExport('price')} className="px-3 h-8 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 shadow-sm transition-colors"><Download className="w-3.5 h-3.5" /> Export Log</button>
                                    <button onClick={() => setIsManualLodgeOpen(true)} className="px-3 h-8 bg-theme text-white border border-indigo-700 rounded-lg text-xs font-bold hover:bg-theme flex items-center gap-2 shadow-sm transition-colors"><Plus className="w-3.5 h-3.5" /> Lodge Manual Change</button>
                                </div>
                            </div>
                        </div>
                        <div className="sello-table-scroll">
                            <table className="sello-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>SKU</th>
                                        <th className="c">Change</th>
                                        <th className="r">Old Price</th>
                                        <th className="c"></th>
                                        <th>New Price</th>
                                        <th className="c">Impact (7-Day Avg)</th>
                                        <th className="r">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedHistoryData.map((row: any) => {
                                        const isEditing = editingHistoryId === row.id;
                                        return (
                                            <tr key={row.id} className={`${isEditing ? 'bg-theme-10/50' : ''}`}>
                                                <td>{isEditing ? <input type="date" value={editingDate} onChange={(e) => setEditingDate(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-md text-sm w-full bg-white" autoFocus /> : new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                                <td><div className="font-bold text-gray-900">{row.sku}</div><div className="text-xs text-gray-500 truncate max-w-[250px]">{row.productName}</div></td>
                                                <td className="c"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${row.changeType === 'INCREASE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{row.changeType === 'INCREASE' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}{Math.abs(row.percentChange).toFixed(1)}%</span></td>
                                                <td className="r text-gray-400 line-through">{formatSmartMoney(row.oldPrice)}</td>
                                                <td className="c text-gray-300"><ArrowRight className="w-4 h-4 mx-auto" /></td>
                                                <td><span className="font-bold text-gray-900">{formatSmartMoney(row.newPrice)}</span></td>
                                                <td><div className="flex items-center justify-center gap-2 text-xs"><span className="text-gray-500 font-medium">{row.preVel.toFixed(1)}/d</span><ArrowRight className="w-3 h-3 text-gray-300" /><span className={`font-bold ${row.postVel > row.preVel ? 'text-emerald-600' : row.postVel < row.preVel ? 'text-red-500' : 'text-gray-600'}`}>{row.postVel.toFixed(1)}/d</span></div></td>
                                                <td className="r">{isEditing ? (<div className="flex items-center justify-end gap-2 h-7"><button onClick={() => { if (onUpdatePriceChangeRecord && editingDate) { onUpdatePriceChangeRecord({ ...row, date: editingDate }); setRecentlySavedId(row.id); setTimeout(() => setRecentlySavedId(null), 2500); } setEditingHistoryId(null); }} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg" title="Save"><Save className="w-4 h-4" /></button><button onClick={() => setEditingHistoryId(null)} className="p-1.5 text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg" title="Cancel"><X className="w-4 h-4" /></button></div>) : (<div className="flex items-center justify-end gap-2 h-7">{recentlySavedId === row.id && (<span className="text-xs text-green-600 font-medium animate-in fade-in duration-300 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Saved</span>)}<button onClick={() => { setEditingHistoryId(row.id); setEditingDate(new Date(row.date).toISOString().split('T')[0]); }} className="p-1.5 text-gray-400 hover:text-theme hover:bg-theme-10 rounded-lg transition-colors" title="Edit Date"><Edit2 className="w-4 h-4" /></button></div>)}</td>
                                            </tr>
                                        )
                                    })}
                                    {paginatedHistoryData.length === 0 && (<tr><td colSpan={8} className="p-12 text-center text-gray-400">No price changes found.</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination Footer */}
                        {historyTableData.length > 0 && (
                            <div className="sello-table-footer">
                                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-4">
                                        <p className="text-sm text-gray-700">Showing <span className="font-medium">{(historyCurrentPage - 1) * historyItemsPerPage + 1}</span> to <span className="font-medium">{Math.min(historyCurrentPage * historyItemsPerPage, historyTableData.length)}</span> of <span className="font-medium">{historyTableData.length}</span> results</p>
                                        <select value={historyItemsPerPage} onChange={(e) => { setHistoryItemsPerPage(Number(e.target.value)); setHistoryCurrentPage(1); }} className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer focus:ring-theme focus:border-theme"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
                                    </div>
                                    <div>{totalHistoryPages > 1 && (<nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"><button onClick={() => setHistoryCurrentPage(prev => Math.max(prev - 1, 1))} disabled={historyCurrentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-5 w-5" /></button><span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">Page {historyCurrentPage} of {totalHistoryPages}</span><button onClick={() => setHistoryCurrentPage(prev => Math.min(totalHistoryPages, prev + 1))} disabled={historyCurrentPage === totalHistoryPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-5 w-5" /></button></nav>)}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'COST_HISTORY' && (
                <div className="space-y-6">
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
                                    <button onClick={() => handleHistoryExport('cost')} className="px-3 h-8 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 shadow-sm transition-colors"><Download className="w-3.5 h-3.5" /> Export Log</button>
                                    <button onClick={() => setIsManualCostLodgeOpen(true)} className="px-3 h-8 bg-theme text-white border border-indigo-700 rounded-lg text-xs font-bold hover:bg-theme flex items-center gap-2 shadow-sm transition-colors"><Plus className="w-3.5 h-3.5" /> Lodge Manual Cost Change</button>
                                </div>
                            </div>
                        </div>
                        <div className="sello-table-scroll">
                            <table className="sello-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>SKU</th>
                                        <th className="c">Change</th>
                                        <th className="r">Old Cost</th>
                                        <th className="c"></th>
                                        <th>New Cost</th>
                                        <th className="r">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedCostHistoryData.map((row: any) => {
                                        const isEditing = editingCostHistoryId === row.id;
                                        return (
                                            <tr key={row.id} className={`${isEditing ? 'bg-theme-10/50' : ''}`}>
                                                <td>{isEditing ? <input type="date" value={editingCostDate} onChange={(e) => setEditingCostDate(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-md text-sm w-full bg-white" autoFocus /> : new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                                <td><div className="font-bold text-gray-900">{row.sku}</div><div className="text-xs text-gray-500 truncate max-w-[250px]">{row.productName}</div></td>
                                                <td className="c"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${row.changeType === 'INCREASE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{row.changeType === 'INCREASE' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}{Math.abs(row.percentChange).toFixed(1)}%</span></td>
                                                <td className="r text-gray-400 line-through">{formatSmartMoney(row.oldCost)}</td>
                                                <td className="c text-gray-300"><ArrowRight className="w-4 h-4 mx-auto" /></td>
                                                <td><span className="font-bold text-gray-900">{formatSmartMoney(row.newCost)}</span></td>
                                                <td className="r">{isEditing ? (<div className="flex items-center justify-end gap-2 h-7"><button onClick={() => { if (onUpdateCostChangeRecord && editingCostDate) { onUpdateCostChangeRecord({ ...row, date: editingCostDate }); setRecentlySavedCostId(row.id); setTimeout(() => setRecentlySavedCostId(null), 2500); } setEditingCostHistoryId(null); }} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg" title="Save"><Save className="w-4 h-4" /></button><button onClick={() => setEditingCostHistoryId(null)} className="p-1.5 text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg" title="Cancel"><X className="w-4 h-4" /></button></div>) : (<div className="flex items-center justify-end gap-2 h-7">{recentlySavedCostId === row.id && (<span className="text-xs text-green-600 font-medium animate-in fade-in duration-300 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Saved</span>)}<button onClick={() => { setEditingCostHistoryId(row.id); setEditingCostDate(new Date(row.date).toISOString().split('T')[0]); }} className="p-1.5 text-gray-400 hover:text-theme hover:bg-theme-10 rounded-lg transition-colors" title="Edit Date"><Edit2 className="w-4 h-4" /></button></div>)}</td>
                                            </tr>
                                        );
                                    })}
                                    {paginatedCostHistoryData.length === 0 && (<tr><td colSpan={7} className="p-12 text-center text-gray-400">No cost changes found.</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination */}
                        {costHistoryTableData.length > 0 && (
                            <div className="sello-table-footer">
                                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-4">
                                        <p className="text-sm text-gray-700">Showing <span className="font-medium">{(costHistoryCurrentPage - 1) * costHistoryItemsPerPage + 1}</span> to <span className="font-medium">{Math.min(costHistoryCurrentPage * costHistoryItemsPerPage, costHistoryTableData.length)}</span> of <span className="font-medium">{costHistoryTableData.length}</span> results</p>
                                        <select value={costHistoryItemsPerPage} onChange={(e) => { setCostHistoryItemsPerPage(Number(e.target.value)); setCostHistoryCurrentPage(1); }} className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer focus:ring-theme focus:border-theme"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
                                    </div>
                                    <div>{totalCostHistoryPages > 1 && (<nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"><button onClick={() => setCostHistoryCurrentPage(prev => Math.max(1, prev - 1))} disabled={costHistoryCurrentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-5 w-5" /></button><span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">Page {costHistoryCurrentPage} of {totalCostHistoryPages}</span><button onClick={() => setCostHistoryCurrentPage(prev => Math.min(totalCostHistoryPages, prev + 1))} disabled={costHistoryCurrentPage === totalCostHistoryPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-5 w-5" /></button></nav>)}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {activeTab === 'INVENTORY_HISTORY' && (
                <div className="space-y-6">
                    <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex items-start gap-4">
                        <div className="p-2 bg-theme-10 text-theme rounded-lg"><Database className="w-5 h-5" /></div>
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
                                    <button onClick={() => handleHistoryExport('inventory')} className="px-3 h-8 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 shadow-sm transition-colors"><Download className="w-3.5 h-3.5" /> Export Log</button>
                                </div>
                            </div>
                        </div>
                        <div className="sello-table-scroll">
                            <table className="sello-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>SKU</th>
                                        <th className="c">Stock Before</th>
                                        <th className="c">Stock After</th>
                                        <th className="c">+Delta</th>
                                        <th className="c">Strategic?</th>
                                        <th>Source / Reason</th>
                                        <th className="r">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedInventoryHistoryData.map((row: InventoryChangeRecord) => {
                                        const isEditing = editingInventoryHistoryId === row.id;
                                        return (
                                            <tr key={row.id} className={`${isEditing ? 'bg-theme-10/50' : ''}`}>
                                                <td>{isEditing ? <input type="date" value={editingInventoryDate} onChange={(e) => setEditingInventoryDate(e.target.value)} className="px-2 py-1 border border-gray-300 rounded-md text-sm w-full bg-white" autoFocus /> : new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                                                <td><div className="font-bold text-gray-900">{row.sku}</div><div className="text-xs text-gray-500 truncate max-w-[250px]">{row.productName}</div></td>
                                                <td className="c text-gray-400">{row.prevStock}</td>
                                                <td className="c font-bold text-gray-900">{row.newStock}</td>
                                                <td className="c"><span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-700">+{row.deltaStock}</span></td>
                                                <td className="c">
                                                    {row.isStrategic ? (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-theme-10 text-theme border border-theme-20">YES</span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-gray-100 text-gray-500 border border-gray-200">NO</span>
                                                    )}
                                                </td>
                                                <td>
                                                    <div className="font-medium text-gray-700">{row.source}</div>
                                                    {row.reason && <div className="text-gray-400 mt-0.5 italic">{row.reason}</div>}
                                                </td>
                                                <td className="r">{isEditing ? (<div className="flex items-center justify-end gap-2 h-7"><button onClick={() => { if (onUpdateInventoryChangeRecord && editingInventoryDate) { onUpdateInventoryChangeRecord({ ...row, date: editingInventoryDate }); setRecentlySavedInventoryId(row.id); setTimeout(() => setRecentlySavedInventoryId(null), 2500); } setEditingInventoryHistoryId(null); }} className="p-1.5 text-green-600 bg-green-50 hover:bg-green-100 rounded-lg" title="Save"><Save className="w-4 h-4" /></button><button onClick={() => setEditingInventoryHistoryId(null)} className="p-1.5 text-gray-500 bg-gray-100 hover:bg-gray-200 rounded-lg" title="Cancel"><X className="w-4 h-4" /></button></div>) : (<div className="flex items-center justify-end gap-2 h-7">{recentlySavedInventoryId === row.id && (<span className="text-xs text-green-600 font-medium animate-in fade-in duration-300 flex items-center gap-1"><CheckCircle className="w-3 h-3" />Saved</span>)}<button onClick={() => { setEditingInventoryHistoryId(row.id); setEditingInventoryDate(new Date(row.date).toISOString().split('T')[0]); }} className="p-1.5 text-gray-400 hover:text-theme hover:bg-theme-10 rounded-lg transition-colors" title="Edit Date"><Edit2 className="w-4 h-4" /></button></div>)}</td>
                                            </tr>
                                        );
                                    })}
                                    {paginatedInventoryHistoryData.length === 0 && (<tr><td colSpan={8} className="p-12 text-center text-gray-400">No inventory increases found for the selected range.</td></tr>)}
                                </tbody>
                            </table>
                        </div>
                        {/* Pagination */}
                        {inventoryHistoryTableData.length > 0 && (
                            <div className="sello-table-footer">
                                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-4">
                                        <p className="text-sm text-gray-700">Showing <span className="font-medium">{(inventoryHistoryCurrentPage - 1) * inventoryHistoryItemsPerPage + 1}</span> to <span className="font-medium">{Math.min(inventoryHistoryCurrentPage * inventoryHistoryItemsPerPage, inventoryHistoryTableData.length)}</span> of <span className="font-medium">{inventoryHistoryTableData.length}</span> results</p>
                                        <select value={inventoryHistoryItemsPerPage} onChange={(e) => { setInventoryHistoryItemsPerPage(Number(e.target.value)); setInventoryHistoryCurrentPage(1); }} className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer focus:ring-theme focus:border-theme"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
                                    </div>
                                    <div>{totalInventoryHistoryPages > 1 && (<nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"><button onClick={() => setInventoryHistoryCurrentPage(prev => Math.max(1, prev - 1))} disabled={inventoryHistoryCurrentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-5 w-5" /></button><span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">Page {inventoryHistoryCurrentPage} of {totalInventoryHistoryPages}</span><button onClick={() => setInventoryHistoryCurrentPage(prev => Math.min(totalInventoryHistoryPages, prev + 1))} disabled={inventoryHistoryCurrentPage === totalInventoryHistoryPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-5 w-5" /></button></nav>)}</div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
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

export const StrategyPageContainer = React.memo(StrategyPageContainerInner);
