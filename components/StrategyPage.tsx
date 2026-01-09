// ... (imports)
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, StrategyConfig, PricingRules, PromotionEvent, PriceChangeRecord, VelocityLookback } from '../types';
import { DEFAULT_STRATEGY_RULES, VAT_MULTIPLIER } from '../constants';
import { TagSearchInput } from './TagSearchInput';
import { Settings, AlertTriangle, TrendingUp, TrendingDown, Info, Save, Download, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Ship, X, ArrowRight, Calendar, Eye, EyeOff, ChevronLeft, ChevronRight, History, Activity } from 'lucide-react';

interface StrategyPageProps {
    products: Product[];
    pricingRules: PricingRules;
    currentConfig: StrategyConfig;
    onSaveConfig: (config: StrategyConfig) => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
    priceHistoryMap: Map<string, any[]>;
    promotions: PromotionEvent[];
    priceChangeHistory: PriceChangeRecord[];
    velocityLookback: VelocityLookback; // Global setting passed down (used for Runway/Velocity)
}

const StrategyPage: React.FC<StrategyPageProps> = ({ products, pricingRules, currentConfig, onSaveConfig, themeColor, headerStyle, priceHistoryMap, promotions, priceChangeHistory = [], velocityLookback }) => {
    // ... (state definitions)
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
    const [includeIncoming, setIncludeIncoming] = useState(false); // New Toggle State
    const [showOOS, setShowOOS] = useState(false); // OOS Visibility Toggle
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false); // Export Menu State

    // --- Local Time Window State (For "Recent" Columns Only) ---
    const [selectedWindow, setSelectedWindow] = useState<string>(() => {
        // Initialize with global setting if it maps to a valid local option, otherwise default to '30'
        if (['7', '14', '30', '60'].includes(velocityLookback)) return velocityLookback;
        return '30';
    });
    const [customStart, setCustomStart] = useState(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
    const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
    const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);

    const [activeTab, setActiveTab] = useState<'ENGINE' | 'HISTORY'>('ENGINE');
    const [filterTab, setFilterTab] = useState<'All' | 'INCREASE' | 'DECREASE' | 'MAINTAIN'>('All');

    // Pagination State (Engine)
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    // Pagination State (History)
    const [historyCurrentPage, setHistoryCurrentPage] = useState(1);
    const [historyItemsPerPage, setHistoryItemsPerPage] = useState(25);

    // --- LOGIC HELPERS ---

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

    // Helper: Calculate Date Window based on a string setting
    const getCalculationWindow = (setting: string, cStart?: string, cEnd?: string) => {
        const dStart = new Date();
        dStart.setHours(0, 0, 0, 0);
        
        let dEnd = new Date();
        dEnd.setHours(23, 59, 59, 999);
        dEnd.setDate(dEnd.getDate() - 1); // Standard: Exclude Today

        let days = 30;

        if (setting === 'Custom' && cStart && cEnd) {
            dStart.setTime(new Date(cStart).getTime());
            const customE = new Date(cEnd);
            customE.setHours(23, 59, 59, 999);
            dEnd.setTime(customE.getTime());
            
            const diff = dEnd.getTime() - dStart.getTime();
            days = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
        } else if (setting === 'ALL') {
            dStart.setTime(0); // Epoch
            // Days calculated dynamically from first log later
        } else {
            days = parseInt(setting) || 30;
            dStart.setDate(dStart.getDate() - days);
        }

        return { start: dStart, end: dEnd, days };
    };

    // Label for the LOCAL "Recent" view
    const formattedDateRange = useMemo(() => {
        const { start, end } = getCalculationWindow(selectedWindow, customStart, customEnd);
        const format = (d: Date, withYear: boolean) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined });
        const sameYear = start.getFullYear() === end.getFullYear();
        return `${format(start, !sameYear)} – ${format(end, true)}`;
    }, [selectedWindow, customStart, customEnd]);

    // Core Metrics Calculator
    const calculateMetrics = (product: Product, setting: string, isLocal: boolean) => {
        const { start, end, days: fixedDays } = getCalculationWindow(setting, isLocal ? customStart : undefined, isLocal ? customEnd : undefined);
        
        const skuLogs = priceHistoryMap.get(product.sku) || [];
        
        // Filter Logs
        const history = skuLogs.filter((h: any) => {
            if (h.platform && pricingRules[h.platform]?.isExcluded) return false;
            const logDate = new Date(h.date + 'T00:00:00');
            return logDate >= start && logDate <= end;
        });

        // Calculate Window Length (Handling ALL case)
        let effectiveDays = fixedDays;
        if (setting === 'ALL') {
             if (history.length > 0) {
                const dates = history.map(l => new Date(l.date).getTime());
                const min = Math.min(...dates);
                const max = end.getTime();
                effectiveDays = Math.max(1, Math.ceil((max - min) / (1000 * 60 * 60 * 24)));
             } else {
                 effectiveDays = 30;
             }
        }

        let totalSales = 0;
        let totalQty = 0;
        let weightedPriceSum = 0;
        let totalProfit = 0;

        history.forEach((h: any) => {
            const revenue = safeNum(h.price) * safeNum(h.velocity);
            const margin = safeNum(h.margin);
            const estimatedQty = safeNum(h.velocity);

            totalSales += revenue;
            totalQty += estimatedQty;
            weightedPriceSum += (h.price * estimatedQty);

            if (h.profit !== undefined && h.profit !== null) {
                totalProfit += h.profit;
            } else {
                totalProfit += revenue * (margin / 100);
            }
        });

        const rawAvgPrice = totalQty > 0 ? weightedPriceSum / totalQty : safeNum(product.currentPrice);
        const netPmPercent = totalSales > 0 ? (totalProfit / totalSales) * 100 : 0;
        const dailyVelocity = totalQty / effectiveDays;

        // Apply VAT for display
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

    // 3. Decision Engine
    const getRecommendation = (product: Product, dailyVelocity: number, netPmPercent: number) => {
        const basePrice = safeNum(product.caPrice) || safeNum(product.currentPrice);
        const effectiveStock = safeNum(product.stockLevel) + (includeIncoming ? safeNum(product.incomingStock) : 0);

        // LOGIC FIX: "Past 7 Days Velocity" check inside Strategy also needs to exclude Today to be consistent.
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        
        const limit7Start = new Date(todayStart);
        limit7Start.setDate(todayStart.getDate() - 7);

        const skuLogs = priceHistoryMap.get(product.sku) || [];
        const last7Qty = skuLogs
            .filter((h: any) => {
                const d = new Date(h.date + 'T00:00:00');
                // Include: Date >= Today-7 AND Date < Today
                return d >= limit7Start && d < todayStart;
            })
            .reduce((sum: number, h: any) => sum + (safeNum(h.velocity)), 0);

        // Runway is based on GLOBAL Velocity
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

        // CONVERT CONFIG WEEKS TO DAYS FOR COMPARISON (config uses weeks, engine now runs on days)
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

            if (highStock || medStockHighMargin) {
                action = 'DECREASE';
                const decreaseAmount = Math.max(
                    basePrice * (safeNum(config.decrease.adjustmentPercent) / 100),
                    safeNum(config.decrease.adjustmentFixed || 0)
                );
                
                adjustedPrice = applyPsychologicalPricing(basePrice - decreaseAmount);
                
                reasoning = highStock
                    ? `Runway > ${config.decrease.highStockWeeks} wks (${runwayDays.toFixed(0)}d)`
                    : `Runway > ${config.decrease.medStockWeeks} wks & Net PM > ${config.decrease.minMarginPercent}%`;
            }
        }

        const safetyViolation = adjustedPrice < floorPrice;

        return { action, adjustedPrice, reasoning, safetyViolation, runwayDays, effectiveStock, floorPrice, isNew };
    };

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
                // 1. Calculate Local Metrics (For Display Columns: Sales, Qty, Margin)
                const local = calculateMetrics(p, selectedWindow, true);
                
                // 2. Calculate Global Metrics (For Velocity, Runway, and Strategy Decision)
                const global = calculateMetrics(p, velocityLookback, false);
                
                // 3. Run Strategy using GLOBAL velocity (but Local Margin for context? Usually Strategy relies on long term margin, but user requested separation. Let's use Global Margin for strategy decision to be safe/consistent with Runway)
                const rec = getRecommendation(p, global.dailyVelocity, global.netPmPercent);
                
                return { 
                    ...p, 
                    // Display Columns (Local)
                    recentTotalSales: local.totalSales,
                    recentTotalQty: local.totalQty,
                    averagePrice: local.averagePrice,
                    netPmPercent: local.netPmPercent,
                    totalProfit: local.totalProfit,
                    
                    // Strategy Columns (Global)
                    dailyVelocity: global.dailyVelocity,
                    runwayDays: rec.runwayDays,
                    
                    ...rec 
                };
            })
            .filter(row => {
                const isOOS = row.effectiveStock <= 0;
                const isActive = row.recentTotalQty > 0;
                if (isOOS && !isActive) return false;
                if (isOOS && !showOOS) return false;
                return true;
            })
            .sort((a, b) => {
                const score = (x: string) => x === 'INCREASE' ? 3 : x === 'DECREASE' ? 2 : 1;
                return score(b.action) - score(a.action);
            });
    }, [products, config, searchQuery, searchTags, selectedWindow, customStart, customEnd, velocityLookback, priceHistoryMap, includeIncoming, pricingRules, showOOS]);

    const filteredAndSortedData = useMemo(() => {
        return tableData.filter(row => filterTab === 'All' || row.action === filterTab);
    }, [tableData, filterTab]);

    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredAndSortedData.slice(start, start + itemsPerPage);
    }, [filteredAndSortedData, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage);

    // --- Price Change History View Helpers ---
    
    const getAvgVelocity = (sku: string, startDate: Date, endDate: Date) => {
        const logs = priceHistoryMap.get(sku) || [];
        const relevantLogs = logs.filter(l => {
            const d = new Date(l.date + 'T00:00:00');
            return d >= startDate && d <= endDate;
        });
        
        if (relevantLogs.length === 0) return 0;
        
        const totalQty = relevantLogs.reduce((acc, l) => acc + l.velocity, 0);
        // If we have less than 7 days of data, average over the available days
        const distinctDays = new Set(relevantLogs.map(l => l.date)).size;
        return distinctDays > 0 ? totalQty / distinctDays : 0;
    };

    const historyTableData = useMemo(() => {
        let data = priceChangeHistory.map(change => {
            const date = new Date(change.date);
            
            // Before: Date - 7d to Date - 1d
            const preStart = new Date(date); preStart.setDate(date.getDate() - 7);
            const preEnd = new Date(date); preEnd.setDate(date.getDate() - 1);
            
            // After: Date + 1d to Date + 7d
            const postStart = new Date(date); postStart.setDate(date.getDate() + 1);
            const postEnd = new Date(date); postEnd.setDate(date.getDate() + 7);
            
            const preVel = getAvgVelocity(change.sku, preStart, preEnd);
            const postVel = getAvgVelocity(change.sku, postStart, postEnd);
            
            return {
                ...change,
                preVel,
                postVel,
                velocityChange: preVel > 0 ? ((postVel - preVel) / preVel) * 100 : (postVel > 0 ? 100 : 0)
            };
        }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

        // Filter Logic for History
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

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
        setHistoryCurrentPage(1);
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
// ... (export logic remains same)
        // Helper to sanitize CSV fields
        const clean = (val: any) => {
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/[\r\n]+/g, ' '); 
            return `"${str.replace(/"/g, '""')}"`;
        };

        const headers = ['SKU', 'Master SKU', 'Name', 'CA Price', 'New Price', 'Runway (Days)', 'Inventory', 'Recent Avg Price', 'Recent Sales $', 'Recent Qty', 'Net PM%', 'Is New', 'Action', 'Floor Price', 'Safety Alert', 'Reason'];
        const rows: string[][] = [];

        tableData.forEach((r: any) => {
            const commonData = [
                clean(r.name),
                safeFormat(r.caPrice, 2),
                safeFormat(r.adjustedPrice, 2),
                safeFormat(r.runwayDays, 0), // Export Days
                safeFormat(r.effectiveStock, 0),
                safeFormat(r.averagePrice, 2),
                safeFormat(r.recentTotalSales, 2),
                safeFormat(r.recentTotalQty, 0),
                safeFormat(r.netPmPercent, 1),
                r.isNew ? 'Yes' : 'No',
                clean(r.action),
                safeFormat(r.floorPrice, 2),
                r.safetyViolation ? 'VIOLATION' : '',
                clean(r.reasoning)
            ];

            if (platform === 'All') {
                rows.push([clean(r.sku), clean(r.sku), ...commonData]);
            } else {
                rows.push([clean(r.sku), clean(r.sku), ...commonData]);
            }
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
// ... (export logic remains same)
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

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
            {/* Header & Tabs */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Strategy Engine</h2>
                    <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                        Automated pricing recommendations and change tracking.
                    </p>
                </div>
            </div>

            {/* Main Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setActiveTab('ENGINE')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'ENGINE' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Activity className="w-4 h-4" />
                    Strategy Simulator
                </button>
                <button
                    onClick={() => setActiveTab('HISTORY')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'HISTORY' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <History className="w-4 h-4" />
                    Price Change Log
                </button>
            </div>

            {activeTab === 'ENGINE' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    {/* Controls Row */}
                    <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex flex-col xl:flex-row items-center justify-between gap-4 relative z-20 backdrop-blur-custom">
                        {/* Left Side: Time Controls (Restored Local Selection) */}
                        <div className="flex flex-col sm:flex-row items-center gap-4 w-full xl:w-auto">
                            <div className="flex items-center gap-3">
                                {/* Time Selector Buttons */}
                                <div className="flex bg-gray-100 p-1 rounded-lg">
                                    {['7', '14', '30', '60'].map(d => (
                                        <button
                                            key={d}
                                            onClick={() => { setSelectedWindow(d); setCurrentPage(1); }}
                                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${selectedWindow === d ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            {d}D
                                        </button>
                                    ))}
                                    <button
                                        onClick={() => setIsCustomDateModalOpen(true)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${selectedWindow === 'Custom' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        <Calendar className="w-3 h-3" />
                                        Custom
                                    </button>
                                </div>

                                <div className="flex flex-col items-start justify-center pl-2 border-l border-gray-200">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-0.5">Analyzing Period</span>
                                    <div className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">
                                        {formattedDateRange}
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Right Side: Actions */}
                        <div className="flex flex-wrap items-center gap-3 justify-end w-full xl:w-auto">
                            <button
                                onClick={() => setIncludeIncoming(!includeIncoming)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold border transition-all shadow-sm text-sm ${includeIncoming ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                title={includeIncoming ? "Including Incoming Stock in Runway Calc" : "Excluding Incoming Stock (Conservative Mode)"}
                            >
                                <Ship className="w-4 h-4" />
                                {includeIncoming ? 'Incoming Included' : 'Incoming Excluded'}
                            </button>

                            <button
                                onClick={() => setIsConfigOpen(!isConfigOpen)}
                                className={`px-4 py-2 rounded-lg font-medium border flex items-center gap-2 transition-all text-sm ${isConfigOpen ? 'bg-gray-100 text-gray-900 border-gray-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                            >
                                <Settings className="w-4 h-4" />
                                {isConfigOpen ? 'Hide Rules' : 'Edit Rules'}
                            </button>

                            <div className="relative">
                                <button
                                    onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                                    className="px-4 py-2 bg-white text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
                                >
                                    <Download className="w-4 h-4" />
                                    Export Matrix
                                    <ChevronDown className="w-3 h-3 text-gray-400" />
                                </button>

                                {/* Floating Modal for Export */}
                                {isExportMenuOpen && createPortal(
                                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setIsExportMenuOpen(false)}>
                                        <div
                                            className="bg-custom-glass-modal backdrop-blur-custom-modal rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-white/20"
                                            onClick={e => e.stopPropagation()}
                                        >
                                            <div className="p-4 border-b border-gray-100/50 flex justify-between items-center bg-gray-50/50">
                                                <h3 className="font-bold text-gray-900">Export Strategy</h3>
                                                <button onClick={() => setIsExportMenuOpen(false)} className="p-1 hover:bg-gray-200/50 rounded-full transition-colors">
                                                    <X className="w-4 h-4 text-gray-500" />
                                                </button>
                                            </div>

                                            <div className="p-2">
                                                <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Select Format</div>
                                                <button
                                                    onClick={() => handleExport('All')}
                                                    className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50/50 flex items-center justify-between group rounded-lg transition-colors"
                                                >
                                                    <span className="font-medium">Standard (Master SKUs)</span>
                                                    <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600" />
                                                </button>

                                                <div className="my-2 border-t border-gray-100/50"></div>

                                                <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Export for Platform</div>
                                                <div className="max-h-60 overflow-y-auto">
                                                    {uniquePlatforms.map(platform => (
                                                        <button
                                                            key={platform}
                                                            onClick={() => handleExport(platform)}
                                                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50/50 flex items-center justify-between rounded-lg transition-colors"
                                                        >
                                                            <span>{platform}</span>
                                                            <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200">Alias Mode</span>
                                                        </button>
                                                    ))}
                                                    {uniquePlatforms.length === 0 && (
                                                        <div className="px-4 py-2 text-xs text-gray-400 italic">No platforms detected</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>,
                                    document.body
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Config Panel - Glass UI */}
                    {isConfigOpen && (
                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden animate-in fade-in slide-in-from-top-4">
                            <div className="border-b border-custom-glass bg-gray-50/50 p-4 flex justify-between items-center">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                    <Settings className="w-4 h-4 text-gray-500" />
                                    Configuration Parameters
                                </h3>
                                <button
                                    onClick={() => onSaveConfig(config)}
                                    className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-gray-800"
                                >
                                    <Save className="w-3 h-3" /> Save Defaults
                                </button>
                            </div>

                            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                                {/* Increase Rules */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-green-700 font-bold border-b border-green-100 pb-2 mb-2">
                                        <TrendingUp className="w-4 h-4" /> Increase Logic
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Runway (Weeks)</label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-400">&lt;</span>
                                                <input
                                                    type="number"
                                                    value={config.increase.minRunwayWeeks}
                                                    onChange={e => setConfig({ ...config, increase: { ...config.increase, minRunwayWeeks: parseFloat(e.target.value) } })}
                                                    className="w-full border rounded p-1.5 text-sm bg-white/50"
                                                />
                                            </div>
                                        </div>
                                        <div>
                                            <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Min Stock</label>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-400">&gt;</span>
                                                <input
                                                    type="number"
                                                    value={config.increase.minStock}
                                                    onChange={e => setConfig({ ...config, increase: { ...config.increase, minStock: parseFloat(e.target.value) } })}
                                                    className="w-full border rounded p-1.5 text-sm bg-white/50"
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Past 7-Days QTY (Exclusion)</label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-gray-400">&le;</span>
                                            <input
                                                type="number"
                                                value={config.increase.minVelocity7Days}
                                                onChange={e => setConfig({ ...config, increase: { ...config.increase, minVelocity7Days: parseFloat(e.target.value) } })}
                                                className="w-20 border rounded p-1.5 text-sm bg-white/50"
                                            />
                                            <span className="text-xs text-gray-400">units</span>
                                        </div>
                                    </div>

                                    <div className="bg-green-50/50 p-3 rounded border border-green-100">
                                        <label className="text-xs font-bold text-green-800 uppercase block mb-2">Adjustment Action</label>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <span className="text-[10px] text-gray-500">Percent (%)</span>
                                                <input
                                                    type="number"
                                                    value={config.increase.adjustmentPercent}
                                                    onChange={e => setConfig({ ...config, increase: { ...config.increase, adjustmentPercent: parseFloat(e.target.value) } })}
                                                    className="w-full border rounded p-1 text-sm text-green-700 font-bold bg-white/80"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-[10px] text-gray-500">Fixed (£)</span>
                                                <input
                                                    type="number"
                                                    value={config.increase.adjustmentFixed}
                                                    onChange={e => setConfig({ ...config, increase: { ...config.increase, adjustmentFixed: parseFloat(e.target.value) } })}
                                                    className="w-full border rounded p-1 text-sm text-green-700 font-bold bg-white/80"
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-green-600 mt-1 italic">*Applies whichever is higher</p>
                                    </div>
                                </div>

                                {/* Decrease Rules */}
                                <div className="space-y-4 border-l border-r border-gray-200/50 px-6">
                                    <div className="flex items-center gap-2 text-red-700 font-bold border-b border-red-100 pb-2 mb-2">
                                        <TrendingDown className="w-4 h-4" /> Decrease Logic
                                    </div>

                                    <div className="bg-gray-50/50 p-2 rounded text-xs text-gray-600 mb-2 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <Info className="w-3 h-3" />
                                            <span>Include "New Products"?</span>
                                        </div>
                                        <button
                                            onClick={() => setConfig({ ...config, decrease: { ...config.decrease, includeNewProducts: !config.decrease.includeNewProducts } })}
                                            className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${config.decrease.includeNewProducts ? 'bg-red-500' : 'bg-gray-300'}`}
                                        >
                                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${config.decrease.includeNewProducts ? 'translate-x-4' : 'translate-x-1'}`} />
                                        </button>
                                    </div>

                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Condition A: High Stock</label>
                                        <div className="flex items-center gap-2">
                                            <span className="text-sm text-gray-600">Runway &gt;</span>
                                            <input
                                                type="number"
                                                value={config.decrease.highStockWeeks}
                                                onChange={e => setConfig({ ...config, decrease: { ...config.decrease, highStockWeeks: parseFloat(e.target.value) } })}
                                                className="w-16 border rounded p-1.5 text-sm bg-white/50"
                                            />
                                            <span className="text-sm text-gray-600">weeks</span>
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Condition B: Med Stock + High Margin</label>
                                        <div className="flex flex-col gap-2">
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-600 w-16">Runway &gt;</span>
                                                <input
                                                    type="number"
                                                    value={config.decrease.medStockWeeks}
                                                    onChange={e => setConfig({ ...config, decrease: { ...config.decrease, medStockWeeks: parseFloat(e.target.value) } })}
                                                    className="w-16 border rounded p-1.5 text-sm bg-white/50"
                                                />
                                                <span className="text-sm text-gray-600">weeks</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <span className="text-sm text-gray-600 w-16">Margin &gt;</span>
                                                <input
                                                    type="number"
                                                    value={config.decrease.minMarginPercent}
                                                    onChange={e => setConfig({ ...config, decrease: { ...config.decrease, minMarginPercent: parseFloat(e.target.value) } })}
                                                    className="w-16 border rounded p-1.5 text-sm bg-white/50"
                                                />
                                                <span className="text-sm text-gray-600">%</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-red-50/50 p-3 rounded border border-red-100">
                                        <label className="text-xs font-bold text-red-800 uppercase block mb-2">Adjustment Action</label>
                                        <div className="flex gap-2">
                                            <div className="flex-1">
                                                <span className="text-[10px] text-gray-500">Percent (%)</span>
                                                <input
                                                    type="number"
                                                    value={config.decrease.adjustmentPercent}
                                                    onChange={e => setConfig({ ...config, decrease: { ...config.decrease, adjustmentPercent: parseFloat(e.target.value) } })}
                                                    className="w-full border rounded p-1 text-sm text-red-700 font-bold bg-white/80"
                                                />
                                            </div>
                                            <div className="flex-1">
                                                <span className="text-[10px] text-gray-500">Fixed (£)</span>
                                                <input
                                                    type="number"
                                                    value={config.decrease.adjustmentFixed}
                                                    onChange={e => setConfig({ ...config, decrease: { ...config.decrease, adjustmentFixed: parseFloat(e.target.value) } })}
                                                    className="w-full border rounded p-1 text-sm text-red-700 font-bold bg-white/80"
                                                />
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-red-600 mt-1 italic">*Applies whichever is higher</p>
                                    </div>
                                </div>

                                {/* Safety & Global */}
                                <div className="space-y-4">
                                    <div className="flex items-center gap-2 text-amber-700 font-bold border-b border-amber-100 pb-2 mb-2">
                                        <AlertTriangle className="w-4 h-4" /> Safety Net
                                    </div>

                                    <div className="bg-amber-50/50 p-4 rounded border border-amber-100">
                                        <label className="text-xs font-bold text-amber-800 uppercase block mb-2">Minimum Floor Constraint</label>
                                        <p className="text-xs text-amber-700 mb-3">Price must not fall below:</p>
                                        <div className="flex items-center gap-2 font-mono text-sm bg-white/80 p-2 rounded border border-amber-200 mb-3">
                                            (Cost + Ship) ÷
                                            <span className="font-bold">{(1 - (safeNum(config.safety.minMarginPercent) / 100)).toFixed(2)}</span>
                                        </div>

                                        <div className="flex items-center gap-2">
                                            <span className="text-xs text-amber-800">Min Margin Buffer:</span>
                                            <input
                                                type="number"
                                                value={config.safety.minMarginPercent}
                                                onChange={e => setConfig({ ...config, safety: { ...config.safety, minMarginPercent: parseFloat(e.target.value) } })}
                                                className="w-16 border rounded p-1 text-sm font-bold text-amber-700 bg-white/80"
                                            />
                                            <span className="text-xs text-amber-800">%</span>
                                        </div>
                                    </div>

                                    <div className="mt-6 pt-4 border-t border-gray-200/50">
                                        <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Platform Exclusions</label>
                                        <p className="text-[10px] text-gray-400">
                                            Configure excluded platforms (e.g. Wayfair, FBA) in the <strong>Settings</strong> page.
                                            Transactions from excluded platforms are filtered out from the price calculation above.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Results Table - Glass UI */}
                    <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                        <div className="p-4 border-b border-custom-glass flex items-center justify-between bg-gray-50/50">
                            <div className="flex items-center gap-4">
                                <TagSearchInput 
                                    tags={searchTags}
                                    onTagsChange={(tags) => { setSearchTags(tags); setCurrentPage(1); }}
                                    onInputChange={(val) => { setSearchQuery(val); setCurrentPage(1); }}
                                    placeholder="Filter by SKU or Alias..."
                                    themeColor={themeColor}
                                />
                                {/* Filter Tabs */}
                                <div className="flex bg-gray-200/50 p-1 rounded-lg">
                                    {['All', 'INCREASE', 'DECREASE', 'MAINTAIN'].map(tab => (
                                        <button
                                            key={tab}
                                            onClick={() => setFilterTab(tab as any)}
                                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${filterTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            {tab === 'All' ? 'All' : tab.charAt(0) + tab.slice(1).toLowerCase()}
                                        </button>
                                    ))}
                                </div>

                                {/* OOS Toggle - Moved Here */}
                                <button
                                    onClick={() => setShowOOS(!showOOS)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold border text-xs transition-all shadow-sm ${showOOS ? 'bg-gray-800 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-300'}`}
                                    title={showOOS ? "Hide Out of Stock items" : "Show Out of Stock items (Active Only)"}
                                >
                                    {showOOS ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                    {showOOS ? 'OOS Shown' : 'OOS Hidden'}
                                </button>
                            </div>
                            <div className="text-xs text-gray-500">
                                Showing <strong>{tableData.filter(r => filterTab === 'All' || r.action === filterTab).length}</strong> SKUs
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm whitespace-nowrap">
                                <thead className="bg-gray-50/50 text-gray-600 font-semibold border-b border-gray-200/50">
                                    <tr>
                                        <th className="p-4">Product</th>
                                        <th className="p-4 text-right">Runway / Velocity</th>
                                        <th className="p-4 text-right">Inventory</th>
                                        <th className="p-4 text-right bg-blue-50/50">Recent Avg Price</th>
                                        <th className="p-4 text-right bg-blue-50/50">Recent Sales $</th>
                                        <th className="p-4 text-right bg-blue-50/50">Recent Qty</th>
                                        <th className="p-4 text-right bg-green-50/50">Net PM%</th>
                                        <th className="p-4 text-right text-purple-600">CA Price</th>
                                        <th className="p-4 text-right">New Price</th>
                                        <th className="p-4 text-center">Action</th>
                                        <th className="p-4">Reason</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100/50">
                                    {paginatedData.map((row: any) => (
                                        <tr key={row.id} className={`even:bg-gray-50/30 hover:bg-gray-100/50 ${row.safetyViolation ? 'bg-amber-50/30' : ''}`}>
                                            <td className="p-4">
                                                <div className="font-bold text-gray-900">{row.sku}</div>
                                                <div className="text-xs text-gray-500 truncate max-w-[200px]">{row.name}</div>
                                                {row.subcategory && (
                                                    <span className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full border border-gray-200">
                                                        {row.subcategory}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                <div className="flex flex-col items-end gap-1.5">
                                                    {(() => {
                                                        const runwayBin = getRunwayBin(row.runwayDays, row.stockLevel, row.leadTimeDays);
                                                        return (
                                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${runwayBin.color}`}>
                                                                {runwayBin.label}
                                                            </span>
                                                        );
                                                    })()}
                                                    <span className="text-[11px] font-semibold text-gray-700">
                                                        {safeFormat(row.dailyVelocity, 1)} / day
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold text-gray-700">
                                                {row.stockLevel}
                                            </td>
                                            <td className="p-4 text-right bg-blue-50/30">£{safeFormat(row.averagePrice, 2)}</td>
                                            <td className="p-4 text-right bg-blue-50/30">£{safeNum(row.recentTotalSales).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                            <td className="p-4 text-right bg-blue-50/30 font-bold">{safeFormat(row.recentTotalQty, 0)}</td>
                                            <td className="p-4 text-right bg-green-50/30 font-bold text-green-700">
                                                <span title={`Profit: £${safeFormat(row.totalProfit, 4)} / Sales: £${safeFormat(row.recentTotalSales, 2)}`} className="cursor-help border-b border-dotted border-green-700/50">
                                                    {safeFormat(row.netPmPercent, 1)}%
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-bold text-purple-600 font-mono">
                                                {row.caPrice ? `£${safeFormat(row.caPrice, 2)}` : '-'}
                                            </td>
                                            <td className="p-4 text-right font-mono font-bold">
                                                {row.action !== 'MAINTAIN' ? (
                                                    <span style={{ color: themeColor }}>£{safeFormat(row.adjustedPrice, 2)}</span>
                                                ) : '-'}
                                                {row.safetyViolation && <AlertCircle className="w-4 h-4 text-red-500 inline ml-1" />}
                                            </td>
                                            <td className="p-4 text-center">
                                                {row.action === 'INCREASE' && <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-bold">INCREASE</span>}
                                                {row.action === 'DECREASE' && <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-bold">DECREASE</span>}
                                                {row.action === 'MAINTAIN' && <span className="text-gray-400 text-xs shadow-sm border px-2 py-1 rounded">MAINTAIN</span>}
                                            </td>
                                            <td className="p-4 text-xs text-gray-500 max-w-[200px] truncate" title={row.reasoning}>
                                                {row.reasoning}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* Pagination Footer */}
                        {filteredAndSortedData.length > 0 && (
                            <div className="bg-gray-50/50 px-4 py-3 border-t border-custom-glass flex items-center justify-between sm:px-6">
                                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-4">
                                        <p className="text-sm text-gray-700">
                                            Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredAndSortedData.length)}</span> of <span className="font-medium">{filteredAndSortedData.length}</span> results
                                        </p>
                                        <select
                                            value={itemsPerPage}
                                            onChange={(e) => {
                                                setItemsPerPage(Number(e.target.value));
                                                setCurrentPage(1);
                                            }}
                                            className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer focus:ring-indigo-500 focus:border-indigo-500"
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                    </div>
                                    <div>
                                        {totalPages > 1 && (
                                            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                                <button
                                                    onClick={() => setCurrentPage(prev => prev - 1)}
                                                    disabled={currentPage === 1}
                                                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                                >
                                                    <ChevronLeft className="h-5 w-5" />
                                                </button>
                                                <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                                    Page {currentPage} of {totalPages}
                                                </span>
                                                <button
                                                    onClick={() => setCurrentPage(prev => prev + 1)}
                                                    disabled={currentPage === totalPages}
                                                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                                >
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

            {activeTab === 'HISTORY' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
                    <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex items-start gap-4">
                        <div className="p-2 bg-blue-50 text-blue-700 rounded-lg">
                            <Info className="w-5 h-5" />
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-gray-900">Price Change Ledger</h3>
                            <p className="text-xs text-gray-500 mt-1">
                                This log is automatically populated when you upload a daily CA Report. 
                                The system compares your new upload against the previous prices to detect changes.
                                <br/>
                                <span className="font-semibold text-blue-600">Impact Analysis:</span> We compare average daily velocity for the 7 days <em>before</em> the change vs. 7 days <em>after</em>.
                            </p>
                        </div>
                    </div>

                    <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                        {/* Search Bar for History */}
                        <div className="p-4 border-b border-custom-glass bg-gray-50/50">
                            <div className="flex flex-col md:flex-row gap-4 items-center justify-between">
                                <div className="w-full max-w-lg">
                                    <TagSearchInput 
                                        tags={searchTags}
                                        onTagsChange={(tags) => { setSearchTags(tags); setHistoryCurrentPage(1); }}
                                        onInputChange={(val) => { setSearchQuery(val); setHistoryCurrentPage(1); }}
                                        placeholder="Search History (SKU or Name)..."
                                        themeColor={themeColor}
                                    />
                                </div>
                                <div className="flex items-center gap-4">
                                    <div className="text-xs text-gray-500">
                                        Showing <strong>{historyTableData.length}</strong> records
                                    </div>
                                    <button
                                        onClick={handleHistoryExport}
                                        className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold text-gray-700 hover:bg-gray-50 flex items-center gap-2 shadow-sm transition-colors"
                                    >
                                        <Download className="w-3.5 h-3.5" />
                                        Export Log
                                    </button>
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
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100/50">
                                {paginatedHistoryData.map((row: any) => (
                                    <tr key={row.id} className="even:bg-gray-50/30 hover:bg-gray-100/50">
                                        <td className="p-4 text-gray-500 text-xs">
                                            {new Date(row.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        </td>
                                        <td className="p-4">
                                            <div className="font-bold text-gray-900">{row.sku}</div>
                                            <div className="text-xs text-gray-500 truncate max-w-[250px]">{row.productName}</div>
                                        </td>
                                        <td className="p-4 text-center">
                                            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${row.changeType === 'INCREASE' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {row.changeType === 'INCREASE' ? <TrendingUp className="w-3 h-3 mr-1" /> : <TrendingDown className="w-3 h-3 mr-1" />}
                                                {Math.abs(row.percentChange).toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="p-4 text-right text-gray-400 line-through">
                                            £{row.oldPrice.toFixed(2)}
                                        </td>
                                        <td className="p-4 text-center text-gray-300">
                                            <ArrowRight className="w-4 h-4 mx-auto" />
                                        </td>
                                        <td className="p-4 font-bold text-gray-900">
                                            £{row.newPrice.toFixed(2)}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex items-center justify-center gap-2 text-xs">
                                                <span className="text-gray-500 font-medium">{row.preVel.toFixed(1)}/d</span>
                                                <ArrowRight className="w-3 h-3 text-gray-300" />
                                                <span className={`font-bold ${row.postVel > row.preVel ? 'text-green-600' : row.postVel < row.preVel ? 'text-red-600' : 'text-gray-600'}`}>
                                                    {row.postVel.toFixed(1)}/d
                                                </span>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {paginatedHistoryData.length === 0 && (
                                    <tr>
                                        <td colSpan={7} className="p-12 text-center text-gray-400">
                                            No price changes found.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>

                        {/* Pagination Footer for History */}
                        {historyTableData.length > 0 && (
                            <div className="bg-gray-50/50 px-4 py-3 border-t border-custom-glass flex items-center justify-between sm:px-6">
                                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-4">
                                        <p className="text-sm text-gray-700">
                                            Showing <span className="font-medium">{(historyCurrentPage - 1) * historyItemsPerPage + 1}</span> to <span className="font-medium">{Math.min(historyCurrentPage * historyItemsPerPage, historyTableData.length)}</span> of <span className="font-medium">{historyTableData.length}</span> results
                                        </p>
                                        <select
                                            value={historyItemsPerPage}
                                            onChange={(e) => {
                                                setHistoryItemsPerPage(Number(e.target.value));
                                                setHistoryCurrentPage(1);
                                            }}
                                            className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer focus:ring-indigo-500 focus:border-indigo-500"
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                    </div>
                                    <div>
                                        {totalHistoryPages > 1 && (
                                            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                                <button
                                                    onClick={() => setHistoryCurrentPage(prev => Math.max(prev - 1, 1))}
                                                    disabled={historyCurrentPage === 1}
                                                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                                >
                                                    <ChevronLeft className="h-5 w-5" />
                                                </button>
                                                <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                                    Page {historyCurrentPage} of {totalHistoryPages}
                                                </span>
                                                <button
                                                    onClick={() => setHistoryCurrentPage(prev => Math.min(prev + 1, totalHistoryPages))}
                                                    disabled={historyCurrentPage === totalHistoryPages}
                                                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                                >
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

            {/* Custom Date Modal */}
            {isCustomDateModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setIsCustomDateModalOpen(false)}>
                    <div
                        className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-gray-200 p-6"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Select Custom Range</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Start Date</label>
                                <input
                                    type="date"
                                    value={customStart}
                                    onChange={e => setCustomStart(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">End Date</label>
                                <input
                                    type="date"
                                    value={customEnd}
                                    onChange={e => setCustomEnd(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setIsCustomDateModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button>
                            <button
                                onClick={() => {
                                    setSelectedWindow('Custom');
                                    setIsCustomDateModalOpen(false);
                                    setCurrentPage(1);
                                }}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700"
                            >
                                Apply Range
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

export default StrategyPage;