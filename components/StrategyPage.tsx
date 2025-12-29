import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Product, StrategyConfig, PricingRules, PromotionEvent } from '../types';
import { DEFAULT_STRATEGY_RULES } from '../constants';
import { Settings, AlertTriangle, TrendingUp, TrendingDown, Info, Save, Download, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Ship, X, ArrowRight, Calendar, Eye, EyeOff, ChevronLeft, ChevronRight } from 'lucide-react';

interface StrategyPageProps {
    products: Product[];
    pricingRules: PricingRules;
    currentConfig: StrategyConfig;
    onSaveConfig: (config: StrategyConfig) => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
    priceHistoryMap: Map<string, any[]>;
    promotions: PromotionEvent[];
}

const StrategyPage: React.FC<StrategyPageProps> = ({ products, pricingRules, currentConfig, onSaveConfig, themeColor, headerStyle, priceHistoryMap, promotions }) => {
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
    const [includeIncoming, setIncludeIncoming] = useState(false); // New Toggle State
    const [showOOS, setShowOOS] = useState(false); // OOS Visibility Toggle
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false); // Export Menu State

    // Time Window State
    const [timeWindow, setTimeWindow] = useState<'7' | '14' | '30' | '60' | 'CUSTOM'>('30');
    const [customRange, setCustomRange] = useState<{ start: string, end: string }>({
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0]
    });
    const [activeTab, setActiveTab] = useState<'All' | 'INCREASE' | 'DECREASE' | 'MAINTAIN'>('All');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

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

    const getRunwayBin = (days: number, stockLevel: number) => {
        if (stockLevel <= 0) return { label: 'Out of Stock', color: 'bg-slate-100 text-slate-500 border-slate-200' };
        if (days <= 14) return { label: '2 Weeks', color: 'bg-red-100 text-red-800 border-red-200' };
        if (days <= 28) return { label: '4 Weeks', color: 'bg-amber-100 text-amber-800 border-amber-200' };
        if (days <= 84) return { label: '12 Weeks', color: 'bg-green-100 text-green-800 border-green-200' };
        if (days <= 168) return { label: '24 Weeks', color: 'bg-teal-100 text-teal-800 border-teal-200' };
        return { label: '24 Weeks +', color: 'bg-blue-100 text-blue-800 border-blue-200' };
    };

    // 1. Calculate Filtered Global Price (excluding specific platforms defined in Settings)
    const getFilteredPrice = (product: Product) => {
        const validChannels = product.channels.filter(c => !pricingRules[c.platform]?.isExcluded);

        if (validChannels.length === 0) {
            return safeNum(product.currentPrice);
        }

        const totalRevenue = validChannels.reduce((sum, c) => sum + ((safeNum(c.price) || safeNum(product.currentPrice)) * safeNum(c.velocity)), 0);
        const totalVelocity = validChannels.reduce((sum, c) => sum + safeNum(c.velocity), 0);

        return totalVelocity > 0 ? totalRevenue / totalVelocity : safeNum(product.currentPrice);
    };

    // 1. Time Window Filtering Helpers
    const getWindowDateLimit = () => {
        const d = new Date();
        d.setHours(0, 0, 0, 0); // Start of today (Local Time)

        if (timeWindow === 'CUSTOM' && customRange.start) {
            return new Date(customRange.start + 'T00:00:00');
        }

        // Standard windows (7, 14, 30, 90)
        // Logic: Return the Start Date of the window
        // For "Last 7 Completed Days": [Today-7] to [Today-1]
        // Start Date is simply Today - 7.
        const days = safeNum(parseInt(timeWindow));
        d.setDate(d.getDate() - (days || 30));
        return d;
    };

    const formattedDateRange = useMemo(() => {
        const start = getWindowDateLimit();
        let end = new Date();
        
        // VISUAL FIX: If using a preset, the window effectively ends Yesterday.
        // Custom range respects user input.
        if (timeWindow !== 'CUSTOM') {
            end.setDate(end.getDate() - 1);
        } else if (customRange.end) {
            end = new Date(customRange.end);
        }

        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };
        return `${start.toLocaleDateString(undefined, options)} - ${end.toLocaleDateString(undefined, options)}`;
    }, [timeWindow, customRange]);

    // 2. Metrics Calculation (now includes historical window)
    const getMetricsInWindow = (product: Product, windowLimit: Date) => {
        // Upper limit definition
        const upperLimit = new Date();
        upperLimit.setHours(23, 59, 59, 999);

        // LOGIC FIX: For presets, we strictly exclude today.
        // The upper limit becomes Yesterday 23:59:59.999
        if (timeWindow !== 'CUSTOM') {
            upperLimit.setDate(upperLimit.getDate() - 1);
        } else if (timeWindow === 'CUSTOM' && customRange.end) {
            const customEnd = new Date(customRange.end + 'T23:59:59');
            if (!isNaN(customEnd.getTime())) {
                upperLimit.setTime(customEnd.getTime());
            }
        }

        const skuLogs = priceHistoryMap.get(product.sku) || [];
        const history = skuLogs.filter((h: any) => {
            // --- STRICT PLATFORM FILTERING ---
            // If the platform is explicitly excluded in Settings, ignore these logs for metrics sum
            if (h.platform && pricingRules[h.platform]?.isExcluded) return false;

            // Force local interpretation of the log date string (YYYY-MM-DD)
            const logDate = new Date(h.date + 'T00:00:00');
            return logDate >= windowLimit && logDate <= upperLimit;
        });

        let recentTotalSales = 0;
        let recentTotalQty = 0;
        let weightedPriceSum = 0;
        let totalProfit = 0;

        history.forEach((h: any) => {
            const revenue = safeNum(h.price) * safeNum(h.velocity);
            const margin = safeNum(h.margin);
            const estimatedQty = safeNum(h.velocity);

            recentTotalSales += revenue;
            recentTotalQty += estimatedQty;
            weightedPriceSum += (h.price * estimatedQty);

            if (h.profit !== undefined && h.profit !== null) {
                totalProfit += h.profit;
            } else {
                // Fallback for legacy logs without absolute profit: Derive Profit from Margin %
                // Margin is stored as percentage (e.g. 30 for 30%), so we divide by 100
                totalProfit += revenue * (margin / 100);
            }
        });

        const rawAveragePrice = recentTotalQty > 0 ? weightedPriceSum / recentTotalQty : safeNum(product.currentPrice);

        // Revenue-Weighted Financial Net Margin: (Total Profit / Total Revenue) * 100
        // Calculated on the RAW sales figures (Pre-VAT adjustment) to ensure margin % is accurate.
        const netPmPercent = recentTotalSales > 0 ? (totalProfit / recentTotalSales) * 100 : 0;

        // User Request: Add 20% VAT to Recent stats for Display & Strategy context
        const VAT_MULTIPLIER = 1.20;
        const averagePrice = rawAveragePrice * VAT_MULTIPLIER;
        const recentTotalSalesWithVat = recentTotalSales * VAT_MULTIPLIER;

        return { 
            recentTotalSales: recentTotalSalesWithVat, 
            recentTotalQty, 
            averagePrice, 
            netPmPercent, 
            totalProfit 
        };
    };

    // 3. Decision Engine
    const getRecommendation = (product: Product, metrics: any) => {
        const { recentTotalQty, averagePrice, netPmPercent } = metrics;
        const basePrice = safeNum(product.caPrice) || safeNum(averagePrice) || safeNum(product.currentPrice);
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

        const weeklyVelocity = safeNum(product.averageDailySales) * 7;
        const runwayWeeks = weeklyVelocity > 0 ? (effectiveStock / weeklyVelocity) : 999;

        let action: 'INCREASE' | 'DECREASE' | 'MAINTAIN' = 'MAINTAIN';
        let adjustedPrice = basePrice;
        let reasoning = 'Stable';

        const applyPsychologicalPricing = (price: number) => {
            if (isNaN(price)) return 0;
            const rounded = Math.ceil(price) - 0.01;
            return Number(rounded.toFixed(2));
        };

        const minMarginBuffer = safeNum(config.safety.minMarginPercent) / 100;
        
        // LOGIC CHANGE: Use Division (Gross Margin Logic) instead of Markup (Multiplication Logic)
        // If buffer is 10%, we want Price >= Cost / (1 - 0.10)
        const floorDivisor = 1 - minMarginBuffer;
        const floorPrice = floorDivisor > 0 
            ? (safeNum(product.costPrice) + safeNum(product.postage)) / floorDivisor 
            : (safeNum(product.costPrice) + safeNum(product.postage)) * 1.5; // Fallback if invalid

        if (runwayWeeks < safeNum(config.increase.minRunwayWeeks) && effectiveStock > safeNum(config.increase.minStock)) {
            if (last7Qty > safeNum(config.increase.minVelocity7Days)) {
                action = 'INCREASE';
                const increaseAmount = Math.max(
                    basePrice * (safeNum(config.increase.adjustmentPercent) / 100),
                    safeNum(config.increase.adjustmentFixed)
                );
                adjustedPrice = applyPsychologicalPricing(basePrice + increaseAmount);
                reasoning = `Runway < ${config.increase.minRunwayWeeks} wks & P7D Qty > ${config.increase.minVelocity7Days}`;
            } else {
                reasoning = `Excluded: P7D Qty (${safeFormat(last7Qty, 0)}) <= Limit (${config.increase.minVelocity7Days})`;
            }
        }

        // RULE 2: DECREASE
        else if (!(!product.inventoryStatus?.includes('New') && !config.decrease.includeNewProducts)) {
            const highStock = runwayWeeks > config.decrease.highStockWeeks;
            const medStockHighMargin = runwayWeeks > config.decrease.medStockWeeks && netPmPercent > config.decrease.minMarginPercent;

            if (highStock || medStockHighMargin) {
                action = 'DECREASE';
                adjustedPrice = applyPsychologicalPricing(basePrice * (1 - config.decrease.adjustmentPercent / 100));
                reasoning = highStock
                    ? `Runway > ${config.decrease.highStockWeeks} wks`
                    : `Runway > ${config.decrease.medStockWeeks} wks & Net PM > ${config.decrease.minMarginPercent}%`;
            }
        }

        // SAFETY CHECK
        const safetyViolation = adjustedPrice < floorPrice;

        // Is New Logic
        const isNew = (product.inventoryStatus === 'New Product') ||
            (product.lastUpdated && (new Date().getTime() - new Date(product.lastUpdated).getTime()) / (1000 * 3600 * 24) < 14);

        return { action, adjustedPrice, reasoning, safetyViolation, runwayWeeks, effectiveStock, weeklyVelocity, floorPrice, isNew };
    };

    const tableData = useMemo(() => {
        const limit = getWindowDateLimit();
        return products
            .filter(p => p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(p => {
                const metrics = getMetricsInWindow(p, limit);
                const rec = getRecommendation(p, metrics);
                // Mapped filteredPrice to averagePrice for Export compatibility
                return { ...p, ...metrics, filteredPrice: metrics.averagePrice, ...rec };
            })
            // --- VISIBILITY FILTER ---
            .filter(row => {
                const isOOS = row.effectiveStock <= 0;
                // Active means it has sales in the selected window (or velocity > 0)
                const isActive = row.recentTotalQty > 0;

                // 1. Always hide inactive products (0 Stock + 0 Sales in window)
                if (isOOS && !isActive) return false;

                // 2. Hide Active OOS products unless toggle is enabled
                if (isOOS && !showOOS) return false;

                return true;
            })
            .sort((a, b) => {
                const score = (x: string) => x === 'INCREASE' ? 3 : x === 'DECREASE' ? 2 : 1;
                return score(b.action) - score(a.action);
            });
    }, [products, config, searchQuery, timeWindow, customRange, priceHistoryMap, includeIncoming, pricingRules, showOOS]);

    const filteredAndSortedData = useMemo(() => {
        return tableData.filter(row => activeTab === 'All' || row.action === activeTab);
    }, [tableData, activeTab]);

    const paginatedData = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredAndSortedData.slice(start, start + itemsPerPage);
    }, [filteredAndSortedData, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filteredAndSortedData.length / itemsPerPage);

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, activeTab, timeWindow, showOOS]);

    const uniquePlatforms = useMemo(() => {
        const platformSet = new Set<string>();
        products.forEach(p => p.channels.forEach(c => platformSet.add(c.platform)));
        if (pricingRules) {
            Object.keys(pricingRules).forEach(k => platformSet.add(k));
        }
        return Array.from(platformSet).sort();
    }, [products, pricingRules]);

    const handleExport = (platform: string = 'All') => {
        // Helper to sanitize CSV fields
        const clean = (val: any) => {
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/[\r\n]+/g, ' '); // Strip newlines
            return `"${str.replace(/"/g, '""')}"`; // Escape quotes
        };

        // --- FILE 1: FULL STRATEGY REPORT ---
        const headers = ['SKU', 'Master SKU', 'Name', 'CA Price', 'New Price', 'Runway (Wks)', 'Inventory', 'Recent Avg Price', 'Recent Sales $', 'Recent Qty', 'Net PM%', 'Is New', 'Action', 'Floor Price', 'Safety Alert', 'Reason', 'Price_Lock_Warnings'];
        const rows: string[][] = [];

        tableData.forEach((r: any) => {
            // Find upcoming promotions for this SKU
            const today = new Date();
            const futurePromos = promotions.flatMap((promo: PromotionEvent) => {
                const item = promo.items.find((i: any) => i.sku === r.sku);
                const startDate = new Date(promo.startDate);
                // Check if it's an upcoming promo (starts today or later)
                if (item && startDate >= today) {
                    return [`${promo.platform} (£${item.promoPrice.toFixed(2)}, starts ${startDate.toLocaleDateString()})`];
                }
                return [];
            });

            const lockWarning = futurePromos.length > 0
                ? `[!] LOCKED: ${futurePromos.join(' | ')}`
                : '';

            // Common Data Row
            const commonData = [
                clean(r.name),
                safeFormat(r.caPrice, 2),
                safeFormat(r.adjustedPrice, 2),
                safeFormat(r.runwayWeeks, 1),
                safeFormat(r.effectiveStock, 0),
                safeFormat(r.averagePrice, 2),
                safeFormat(r.recentTotalSales, 2),
                safeFormat(r.recentTotalQty, 0),
                safeFormat(r.netPmPercent, 1),
                r.isNew ? 'Yes' : 'No',
                clean(r.action),
                safeFormat(r.floorPrice, 2),
                r.safetyViolation ? 'VIOLATION' : '',
                clean(r.reasoning),
                clean(lockWarning)
            ];

            if (platform === 'All') {
                rows.push([clean(r.sku), clean(r.sku), ...commonData]);
            } else {
                rows.push([clean(r.sku), clean(r.sku), ...commonData]);
            }
        });

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        // Use octet-stream to tell Chrome "this is a binary download" and add UTF-8 BOM
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

        // Standard cleanup with very long timeout (60s) for slow scanners
        setTimeout(() => {
            if (document.body.contains(link)) document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 60000);

        // --- FILE 2: PRICING UPDATE (CA Price + New Price + Aliases) ---
        // Stagger the second download by 1 second to avoid Chrome's automated download protection
        setTimeout(() => {
            if (platform === 'All') {
                const updateHeaders = ['SKU', 'Alias', 'CA Price', 'New Price', 'Price_Lock_Warnings'];
                const updateRows: string[][] = [];

                tableData.forEach((r: any) => {
                    // Find upcoming promotions for this SKU
                    const today = new Date();
                    const futurePromos = promotions.flatMap((promo: PromotionEvent) => {
                        const item = promo.items.find((i: any) => i.sku === r.sku);
                        const startDate = new Date(promo.startDate);
                        if (item && startDate >= today) {
                            return [`${promo.platform} (£${item.promoPrice.toFixed(2)}, starts ${startDate.toLocaleDateString()})`];
                        }
                        return [];
                    });

                    const lockWarning = futurePromos.length > 0
                        ? `[!] LOCKED: ${futurePromos.join(' | ')}`
                        : '';

                    // Master SKU Row
                    updateRows.push([clean(r.sku), clean(r.sku), safeFormat(r.caPrice, 2), safeFormat(r.adjustedPrice, 2), clean(lockWarning)]);

                    // Alias Rows
                    r.channels.forEach((c: any) => {
                        if (c.skuAlias) {
                            const aliases = c.skuAlias.split(',').map((s: string) => s.trim()).filter(Boolean);
                            aliases.forEach((alias: string) => {
                                updateRows.push([clean(r.sku), clean(alias), safeFormat(r.caPrice, 2), safeFormat(r.adjustedPrice, 2), clean(lockWarning)]);
                            });
                        }
                    });
                });

                const csvContent2 = [updateHeaders.join(','), ...updateRows.map(r => r.join(','))].join('\n');
                const blob2 = new Blob(['\uFEFF', csvContent2], { type: 'application/octet-stream' });
                const url2 = URL.createObjectURL(blob2);
                const link2 = document.createElement('a');
                link2.style.display = 'none';
                link2.href = url2;
                const filename2 = `pricing_update_${new Date().toISOString().slice(0, 10)}.csv`;
                link2.download = filename2;
                link2.setAttribute('download', filename2);
                document.body.appendChild(link2);
                link2.click();

                setTimeout(() => {
                    if (document.body.contains(link2)) document.body.removeChild(link2);
                    URL.revokeObjectURL(url2);
                }, 60000);
            }
        }, 1000);

        setIsExportMenuOpen(false);
    };

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Strategy Engine</h2>
                    <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                        Rule-based pricing logic. Adjust criteria below to generate real-time recommendations.
                    </p>
                </div>
                <div className="flex gap-3 items-center relative z-20">
                    {/* Time Window Selector */}
                    <div className="flex flex-col gap-1.5">
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            {['7', '14', '30', '60'].map(d => (
                                <button
                                    key={d}
                                    onClick={() => setTimeWindow(d as any)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${timeWindow === d ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    {d}D
                                </button>
                            ))}
                            <button
                                onClick={() => setTimeWindow('CUSTOM')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-1 transition-all ${timeWindow === 'CUSTOM' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Calendar className="w-3 h-3" /> Custom
                            </button>
                        </div>
                        <div className="text-[10px] font-bold text-indigo-500/70 px-1 flex items-center gap-1 bg-indigo-50/50 py-0.5 rounded border border-indigo-100/50 w-fit">
                            <Calendar className="w-2.5 h-2.5" />
                            {formattedDateRange}
                        </div>
                    </div>

                    {timeWindow === 'CUSTOM' && (
                        <div className="flex items-center gap-2 text-sm">
                            <input type="date" value={customRange.start} onChange={e => setCustomRange({ ...customRange, start: e.target.value })} className="border rounded px-2 py-1" />
                            <span>-</span>
                            <input type="date" value={customRange.end} onChange={e => setCustomRange({ ...customRange, end: e.target.value })} className="border rounded px-2 py-1" />
                        </div>
                    )}

                    <div className="h-8 w-px bg-gray-300 mx-2"></div>

                    {/* Incoming Stock Toggle */}
                    <button
                        onClick={() => setIncludeIncoming(!includeIncoming)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold border transition-all shadow-sm ${includeIncoming ? 'bg-blue-600 text-white border-blue-700' : 'bg-white/80 text-gray-500 border-gray-300'}`}
                        title={includeIncoming ? "Including Incoming Stock in Runway Calc" : "Excluding Incoming Stock (Conservative Mode)"}
                    >
                        <Ship className="w-4 h-4" />
                        {includeIncoming ? 'Incoming Included' : 'Incoming Excluded'}
                    </button>

                    <button
                        onClick={() => setIsConfigOpen(!isConfigOpen)}
                        className={`px-4 py-2 rounded-lg font-medium border flex items-center gap-2 transition-all ${isConfigOpen ? 'bg-gray-100 text-gray-900 border-gray-300' : 'bg-white/80 text-indigo-600 border-indigo-200'}`}
                    >
                        <Settings className="w-4 h-4" />
                        {isConfigOpen ? 'Hide Rules' : 'Edit Rules'}
                    </button>

                    <div className="relative">
                        <button
                            onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                            className="px-4 py-2 bg-white/80 text-gray-700 border border-gray-300 rounded-lg hover:bg-white flex items-center gap-2"
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
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600">Decrease by</span>
                                    <input
                                        type="number"
                                        value={config.decrease.adjustmentPercent}
                                        onChange={e => setConfig({ ...config, decrease: { ...config.decrease, adjustmentPercent: parseFloat(e.target.value) } })}
                                        className="w-20 border rounded p-1 text-sm text-red-700 font-bold bg-white/80"
                                    />
                                    <span className="text-sm text-gray-600">%</span>
                                </div>
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
                        <input
                            type="text"
                            placeholder="Filter by SKU..."
                            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 bg-white/80"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                        />
                        {/* Filter Tabs */}
                        <div className="flex bg-gray-200/50 p-1 rounded-lg">
                            {['All', 'INCREASE', 'DECREASE', 'MAINTAIN'].map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setActiveTab(tab as any)}
                                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${activeTab === tab ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
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
                        Showing <strong>{tableData.filter(r => activeTab === 'All' || r.action === activeTab).length}</strong> SKUs
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50/50 text-gray-600 font-semibold border-b border-gray-200/50">
                            <tr>
                                <th className="p-4">Product</th>
                                <th className="p-4 text-right">Runway & Vel</th>
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
                                <tr key={row.id} className={`hover:bg-gray-50/50 ${row.safetyViolation ? 'bg-amber-50/30' : ''}`}>
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
                                                const runwayBin = getRunwayBin(row.runwayWeeks * 7, row.stockLevel);
                                                return (
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${runwayBin.color}`}>
                                                        {runwayBin.label}
                                                    </span>
                                                );
                                            })()}
                                            <div className="flex items-center gap-1">
                                                <span className="text-[11px] font-semibold text-gray-700">
                                                    {safeFormat(row.weeklyVelocity / 7, 1)} / day
                                                </span>
                                            </div>
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
                                    <td className="p-4 text-right font-mono text-purple-600 font-bold">
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
    );
};

export default StrategyPage;