
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, PricingRules, PriceLog, RefundLog, PriceChangeRecord, SearchChip } from '../../../types';
import { ThresholdConfig, getThresholdConfig } from '../../../services/thresholdsConfig';
import { getDiagnosisMeta, CanonicalDiagnosisId } from '../../diagnostics/diagnosisRegistry';
import { asDateKey, isDateKeyBetween, addDaysToDateKey, getTodayKeyMelbourne } from '../../../services/dateUtils';
import { buildWindow } from '../../../services/dateWindow';
import { VAT_MULTIPLIER } from '../../../constants';
import { MetricCard } from '../parts/MetricCard';
import { AlertCard } from '../parts/AlertCard';
import { TagSearchInput } from '../../TagSearchInput';
import { GradeBadge } from '../../GradeBadge';
import { SortState, sortRows } from '../../../utils/tableSort';
import { SortableHeader } from '../../common/SortableHeader';
import UkSalesMap from '../../UkSalesMap';
import { CategoryPerformanceSlide } from '../../CategoryPerformanceSlide';
import AuditPanel from '../../AuditPanel';
import { PriceChangeHistoryPanel } from '../../strategy/PriceChangeHistoryPanel';
import { Calendar, ChevronDown, Activity, ChevronLeft, ChevronRight, Download, Search, Info, Package, TrendingUp, TrendingDown, DollarSign, Megaphone, Clock, AlertTriangle, Coins, BarChart2, Database } from 'lucide-react';
import { formatMoney, formatNumber, formatPct } from '../../../utils/format';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, Bar, Line, BarChart, Cell } from 'recharts';

interface DecisionEngineTabProps {
    products: Product[];
    priceHistoryMap: Map<string, PriceLog[]>;
    refundHistory: RefundLog[];
    pricingRules: PricingRules;
    priceChangeHistory: PriceChangeRecord[];
    themeColor: string;
    onAnalyze: (product: Product, context?: string) => void;
    onDeepDive: (sku: string) => void;
    onSearch?: (query: string | SearchChip[]) => void;
    thresholds?: ThresholdConfig;
}

type DateRange = 'yesterday' | '7d' | '14d' | '30d' | '90d' | 'custom';
type AlertType = 'margin' | 'velocity' | 'stock' | 'dead' | null;

interface ToxicPlatform {
    name: string;
    margin: number;
    revenue: number;
    velocity: number;
}

export const DecisionEngineTab: React.FC<DecisionEngineTabProps> = ({
    products,
    priceHistoryMap,
    refundHistory,
    pricingRules,
    priceChangeHistory,
    themeColor,
    onAnalyze,
    onDeepDive,
    onSearch,
    thresholds: propThresholds
}) => {
    const [range, setRange] = useState<DateRange>('30d');
    const [customStart, setCustomStart] = useState<string>(getTodayKeyMelbourne());
    const [customEnd, setCustomEnd] = useState<string>(getTodayKeyMelbourne());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [platformScope, setPlatformScope] = useState<string>('All');
    const [currentSlide, setCurrentSlide] = useState(0);
    const [selectedAlert, setSelectedAlert] = useState<AlertType>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [isAuditPanelVisible, setIsAuditPanelVisible] = useState(false);
    const [sort, setSort] = useState<SortState<string> | null>(null);

    // Fallback if prop is missing (e.g. initial load or parent hasn't updated yet)
    // IMPORTANT: Dependencies must include propThresholds to trigger re-calc on change
    const thresholds = useMemo(() => propThresholds || getThresholdConfig(), [propThresholds]);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedAlert, range, platformScope, sort]);

    const nextSlide = () => setCurrentSlide(prev => (prev + 1) % 5);
    const prevSlide = () => setCurrentSlide(prev => (prev - 1 + 5) % 5);

    const getSignalStyle = (priority: string) => {
        switch (priority) {
            case 'High': return 'bg-red-50 text-red-700 border-red-200';
            case 'Medium': return 'bg-amber-50 text-amber-700 border-amber-200';
            case 'Low': return 'bg-blue-50 text-blue-700 border-blue-200';
            default: return 'bg-gray-50 text-gray-600 border-gray-200';
        }
    };

    // Format range label for search
    const getRangeLabel = () => {
        if (range === 'yesterday') return 'Last 1 Day';
        if (range === '7d') return 'Last 7 Days';
        if (range === '14d') return 'Last 14 Days';
        if (range === '30d') return 'Last 30 Days';
        if (range === '90d') return 'Last 90 Days';
        return 'Custom Range';
    };

    const { processedData, periodLabel, dateRange, periodDays, startKey, endKey, distinctDaysFound, totalLogsInWindow } = useMemo(() => {
        const { startKey, endKey, expectedDays } = buildWindow({
            mode: range === 'custom' ? 'custom' : 'days',
            days: range === 'yesterday' ? 1 : 
                  range === '7d' ? 7 : 
                  range === '14d' ? 14 :
                  range === '30d' ? 30 : 
                  range === '90d' ? 90 : 30,
            startKey: customStart,
            endKey: customEnd,
            excludeToday: true
        });

        const startDate = new Date(startKey);
        const endDate = new Date(endKey);
        const format = (d: Date, withYear: boolean) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
        const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
        const label = `${format(startDate, !sameYear)} – ${format(endDate, true)}`;
        
        // Calculate previous period for trends
        const prevEndKey = addDaysToDateKey(startKey, -1);
        const prevStartKey = addDaysToDateKey(prevEndKey, -(expectedDays - 1));

        const distinctDaysSet = new Set<string>();
        let logsInWindow = 0;

        const data = products.map(p => {
            const logs = priceHistoryMap.get(p.sku) || [];
            const scopeLogs = platformScope === 'All' 
                ? logs 
                : logs.filter(l => l.platform === platformScope || (platformScope !== 'All' && l.platform?.includes(platformScope)));

            let curUnits = 0; let curRev = 0; let curProfit = 0; let curAdSpend = 0;
            let prevUnits = 0;
            const platformBreakdown: Record<string, { rev: number, profit: number, units: number }> = {};

            scopeLogs.forEach(l => {
                const d = asDateKey(l.date);
                if (!d) return;

                if (isDateKeyBetween(d, startKey, endKey)) {
                    distinctDaysSet.add(d); // Track globally distinct days found
                    logsInWindow++;

                    curUnits += l.velocity;
                    curRev += (l.velocity * l.price);
                    
                    const dailyAds = l.adsSpend !== undefined ? l.adsSpend : (p.adsFee || 0) * l.velocity;
                    curAdSpend += dailyAds;

                    if (l.profit !== undefined) {
                        curProfit += l.profit;
                    } else {
                        curProfit += (l.velocity * l.price * (l.margin / 100));
                    }

                    if (platformScope === 'All') {
                        const pName = l.platform || 'Unknown';
                        if (!platformBreakdown[pName]) platformBreakdown[pName] = { rev: 0, profit: 0, units: 0 };
                        
                        platformBreakdown[pName].rev += (l.velocity * l.price);
                        platformBreakdown[pName].units += l.velocity;
                        if (l.profit !== undefined) {
                            platformBreakdown[pName].profit += l.profit;
                        } else {
                            platformBreakdown[pName].profit += (l.velocity * l.price * (l.margin / 100));
                        }
                    }

                } else if (isDateKeyBetween(d, prevStartKey, prevEndKey)) {
                    prevUnits += l.velocity;
                }
            });

            const netMargin = curRev > 0 ? (curProfit / curRev) * 100 : 0;
            const velocityChange = prevUnits > 0 ? ((curUnits - prevUnits) / prevUnits) * 100 : (curUnits > 0 ? 100 : 0);
            
            let displayPrice = p.currentPrice;
            if (platformScope !== 'All') {
                const channel = p.channels.find(c => c.platform === platformScope);
                if (channel && channel.price) displayPrice = channel.price;
            }

            const toxicPlatforms: ToxicPlatform[] = [];
            if (platformScope === 'All') {
                Object.entries(platformBreakdown).forEach(([plat, stats]) => {
                    if (stats.rev > 0) {
                        const m = (stats.profit / stats.rev) * 100;
                        if (m < (thresholds.marginBelowTargetPct / 2) && stats.rev > 10) {
                            toxicPlatforms.push({
                                name: plat,
                                margin: m,
                                revenue: stats.rev,
                                velocity: stats.units / expectedDays
                            });
                        }
                    }
                });
                toxicPlatforms.sort((a,b) => a.margin - b.margin);
            }

            const signals: CanonicalDiagnosisId[] = [];
            
            // --- DECISION ENGINE VELOCITY FIX: Always use system average daily sales for inventory alerts ---
            const globalDailyVelocity = p.averageDailySales || 0;
            const globalRunway = globalDailyVelocity > 0 ? p.stockLevel / globalDailyVelocity : 999;
            
            const tacos = curRev > 0 ? (curAdSpend / curRev) * 100 : 0;
            const stockValue = p.stockLevel * (p.costPrice || 0);

            if (p.stockLevel > 0) {
                // Use globalRunway instead of periodRunway so alerts remain constant across windows
                if (globalRunway < (p.leadTimeDays * thresholds.stockoutRunwayMultiplier)) signals.push('STOCKOUT_RISK');
                else if (globalRunway > thresholds.overstockDays) signals.push('OVERSTOCK_RISK');
            }
            if ((p.returnRate || 0) > thresholds.returnRatePct) signals.push('HIGH_RETURN_RATE');
            if (tacos > thresholds.highAdDependencyPct) signals.push('HIGH_AD_DEPENDENCY');
            
            if (netMargin < 0) signals.push('NEGATIVE_LOSS');
            else if (netMargin < thresholds.marginBelowTargetPct) signals.push('BELOW_TARGET');
            
            // Use local trend for Velocity Drop signal (this still needs to be context-aware)
            if (velocityChange < -thresholds.velocityDropPct) signals.push('VELOCITY_DROP_WOW');
            
            // Dead Stock: Use global velocity to determine if active items are dormant
            if (stockValue > thresholds.deadStockMinValueGBP && globalDailyVelocity === 0) signals.push('DORMANT_NO_SALES');

            // Sort signals by priority
            const priorityOrder: Record<string, number> = { High: 1, Medium: 2, Low: 3 };
            signals.sort((a, b) => {
                const pA = priorityOrder[getDiagnosisMeta(a).priority] || 99;
                const pB = priorityOrder[getDiagnosisMeta(b).priority] || 99;
                return pA - pB;
            });

            // Apply VAT Scaling to Summary Metrics - Displayed incl tax per app standard
            const periodRevenue = curRev * VAT_MULTIPLIER;
            const periodProfit = curProfit * VAT_MULTIPLIER;
            const periodAdSpend = curAdSpend * VAT_MULTIPLIER;

            return {
                ...p,
                periodUnits: curUnits,
                periodRevenue,
                periodProfit,
                periodAdSpend,
                periodMargin: netMargin,
                prevPeriodUnits: prevUnits,
                velocityChange, // Local trend for table display & alerts
                periodDailyVelocity: globalDailyVelocity, // Switched to global per user request
                periodRunway: globalRunway, // Switched to global per user request
                displayPrice,
                toxicPlatforms,
                signals,
            };
        });
        
        return { 
            processedData: data, 
            periodLabel: label, 
            dateRange: { start: startDate, end: endDate }, 
            periodDays: expectedDays,
            startKey,
            endKey,
            distinctDaysFound: distinctDaysSet.size,
            totalLogsInWindow: logsInWindow
        };
    }, [products, priceHistoryMap, range, customStart, customEnd, platformScope, thresholds]); 

    const alerts = useMemo(() => ({
        margin: processedData.filter(p => (p.periodUnits > 0 && p.periodMargin < thresholds.marginBelowTargetPct) || p.toxicPlatforms.length > 0),
        // Use local trend for Velocity Alert
        velocity: processedData.filter(p => p.velocityChange < -thresholds.velocityCrashPct),
        // Use consistent global runway for Stock Alert
        stock: processedData.filter(p => {
            return p.periodRunway < (p.leadTimeDays * thresholds.stockoutRunwayMultiplier) && p.stockLevel > 0;
        }),
        // Use consistent global velocity for Dead Stock check
        dead: processedData.filter(p => p.stockLevel * (p.costPrice || 0) > thresholds.deadStockMinValueGBP && p.periodDailyVelocity === 0)
    }), [processedData, thresholds]);

    const workbenchData = useMemo(() => {
        let data = !selectedAlert ? processedData.filter(p => p.periodRevenue > 0) : alerts[selectedAlert];
        
        const getValue = (row: any, key: string) => {
            switch(key) {
                case 'sku': return row.sku;
                case 'price': return row.displayPrice;
                case 'caPrice': return row.caPrice;
                case 'qtySold': return row.periodUnits;
                case 'revenue': return row.periodRevenue;
                case 'profit': return row.periodProfit;
                case 'margin': return row.periodMargin;
                case 'inventory': return row.stockLevel;
                case 'prevQty': return row.prevPeriodUnits;
                case 'change': return row.velocityChange;
                case 'runway': return row.periodRunway;
                default: return 0;
            }
        };

        if (sort) {
            return sortRows(data, sort, getValue);
        }

        // Default sorts per alert type (when no manual sort is active)
        return [...data].sort((a, b) => {
            if (!selectedAlert) return b.periodRevenue - a.periodRevenue;
            if (selectedAlert === 'margin') return a.periodMargin - b.margin;
            if (selectedAlert === 'velocity') return a.velocityChange - b.velocityChange;
            if (selectedAlert === 'stock') return a.periodRunway - b.periodRunway;
            if (selectedAlert === 'dead') return (b.stockLevel * (b.costPrice || 0)) - (a.stockLevel * (a.costPrice || 0));
            return 0;
        });
    }, [selectedAlert, alerts, processedData, sort, thresholds]);

    const paginatedData = workbenchData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalPages = Math.ceil(workbenchData.length / itemsPerPage);

    const handleExport = () => {
        const clean = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
        const headers = ['SKU', 'Name', 'Price (Inc VAT)', 'Period Sales', 'Period Profit', 'Net Margin %', 'Velocity Change %', 'Toxic Platform Info'];
        const rows = workbenchData.map(p => [
            clean(p.sku),
            clean(p.name),
            (p.displayPrice * VAT_MULTIPLIER).toFixed(2),
            p.periodRevenue.toFixed(2),
            p.periodProfit.toFixed(2),
            p.periodMargin.toFixed(2) + '%',
            p.velocityChange.toFixed(0) + '%',
            p.toxicPlatforms && p.toxicPlatforms.length > 0 ? clean(`${p.toxicPlatforms[0].name}: ${p.toxicPlatforms[0].margin.toFixed(1)}%`) : ''
        ]);
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\uFEFF', csvContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        const filename = `decision_engine_export_${selectedAlert || 'overview'}_${new Date().toISOString().slice(0, 10)}.csv`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { if (document.body.contains(link)) document.body.removeChild(link); }, 60000);
    };

    const financialStats = useMemo(() => {
        const totalRevenue = processedData.reduce((acc, p) => acc + p.periodRevenue, 0);
        const totalProfit = processedData.reduce((acc, p) => acc + p.periodProfit, 0);
        const totalAdSpend = processedData.reduce((acc, p) => acc + p.periodAdSpend, 0);
        const tacos = totalRevenue > 0 ? (totalAdSpend / totalRevenue) * 100 : 0;
        const days = [];
        for (let d = new Date(dateRange.start); d <= dateRange.end; d.setDate(d.getDate() + 1)) {
            days.push(new Date(d).toISOString().split('T')[0]);
        }
        const chartData = days.map(day => {
            let dayRev = 0; let dayAds = 0; let dayProfit = 0;
            products.forEach(p => {
                const logs = priceHistoryMap.get(p.sku) || [];
                logs.filter(l => l.date.startsWith(day)).forEach(l => {
                    dayRev += (l.price * l.velocity);
                    dayAds += (l.adsSpend !== undefined ? l.adsSpend : (p.adsFee || 0) * l.velocity);
                    if (l.profit !== undefined) dayProfit += l.profit;
                    else dayProfit += (l.velocity * l.price * (l.margin / 100));
                });
            });
            const [y, m, dStr] = day.split('-');
            const dateObj = new Date(Number(y), Number(m) - 1, Number(dStr));
            const displayDate = dateObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            
            // Scale daily chart data to be inclusive of tax
            return { 
                day: displayDate, 
                revenue: dayRev * VAT_MULTIPLIER, // Displayed incl tax per app standard
                ads: dayAds * VAT_MULTIPLIER,     // Displayed incl tax per app standard
                profit: dayProfit * VAT_MULTIPLIER // Displayed incl tax per app standard
            };
        });
        return { totalRevenue, totalProfit, totalAdSpend, tacos, chartData };
    }, [processedData, dateRange, priceHistoryMap, products]);

    const inventoryStats = useMemo(() => {
        let totalStockValue = 0; let deadStockValue = 0; let lostRevenue = 0;
        const runwayDistribution = { '< 2w': 0, '2-4w': 0, '4-12w': 0, '12w+': 0, 'OOS': 0 };
        processedData.forEach(p => {
            const stockVal = p.stockLevel * (p.costPrice || 0);
            totalStockValue += stockVal;
            
            // Consistent global velocity check for dead stock value
            if (p.periodDailyVelocity === 0) deadStockValue += stockVal;
            
            const runway = p.periodRunway; // This is now globalRunway from processedData
            
            if (p.stockLevel <= 0) runwayDistribution['OOS']++;
            else if (runway < 14) runwayDistribution['< 2w']++;
            else if (runway < 28) runwayDistribution['2-4w']++;
            else if (runway < 84) runwayDistribution['4-12w']++;
            else runwayDistribution['12w+']++;
            
            // Calculate lost revenue projection based on global velocity (conservative state management)
            if (runway < p.leadTimeDays && p.periodDailyVelocity > 0) {
                const daysOOS = p.leadTimeDays - runway;
                lostRevenue += (daysOOS * p.periodDailyVelocity * (p.currentPrice || 0));
            }
        });
        const chartData = Object.entries(runwayDistribution).map(([name, value]) => ({ name, value }));
        return { totalStockValue, deadStockValue, lostRevenue, chartData };
    }, [processedData, thresholds]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
            <div className="flex flex-col md:flex-row justify-between items-center bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm gap-4 relative z-30">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <select 
                            value={platformScope} 
                            onChange={(e) => setPlatformScope(e.target.value)}
                            className="appearance-none bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold py-2 pl-4 pr-10 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="All">Global View (All)</option>
                            {Object.keys(pricingRules).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-indigo-600 pointer-events-none" />
                    </div>
                    <div className="h-8 w-px bg-gray-300 mx-2"></div>
                    <div className="relative">
                        <button
                            onClick={() => setShowDatePicker(!showDatePicker)}
                            className={`p-2 border rounded-lg hover:bg-gray-50 transition-colors ${showDatePicker || range === 'custom' ? 'border-indigo-300 text-indigo-600 bg-indigo-50' : 'border-gray-200 text-gray-600 bg-white/50'}`}
                        >
                            <Calendar className="w-5 h-5" />
                        </button>
                        {showDatePicker && (
                            <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-50 animate-in fade-in slide-in-from-top-2 w-64">
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-3">Custom Range</label>
                                <div className="space-y-3">
                                    <input type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setRange('custom'); }} className="border rounded px-2 py-1.5 text-sm w-full" />
                                    <input type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setRange('custom'); }} min={customStart} className="border rounded px-2 py-1.5 text-sm w-full" />
                                </div>
                                <div className="mt-3 flex justify-end"><button onClick={() => setShowDatePicker(false)} className="text-xs text-indigo-600 font-bold">Close</button></div>
                            </div>
                        )}
                    </div>
                    <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto no-scrollbar">
                        {['yesterday', '7d', '14d', '30d', '90d'].map((r: any) => (
                            <button
                                key={r}
                                onClick={() => setRange(r)}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${range === r ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {r === 'yesterday' ? 'Yesterday' : r.toUpperCase().replace('D', ' Days')}
                            </button>
                        ))}
                    </div>
                    <div className="ml-3 flex flex-col justify-center pl-2 border-l border-gray-200">
                        <span className="text-[10px] text-gray-400 font-medium uppercase leading-none mb-0.5">Analyzing Period</span>
                        <span className="text-xs font-medium text-indigo-600 flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            {periodLabel}
                        </span>
                    </div>
                    <div className="ml-3 flex flex-col justify-center pl-2 border-l border-gray-200">
                        <span className="text-[10px] text-gray-400 font-medium uppercase leading-none mb-0.5">Data Coverage</span>
                        <span className="text-xs font-medium text-emerald-600 flex items-center gap-1.5" title={`${totalLogsInWindow} individual transaction logs analyzed across ${distinctDaysFound} distinct days in this period.`}>
                            <Database className="w-3 h-3" />
                            {totalLogsInWindow} logs / {distinctDaysFound} days
                        </span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsAuditPanelVisible(!isAuditPanelVisible)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium border transition-all shadow-sm text-xs ${isAuditPanelVisible ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                        title="Show Data Audit"
                    >
                        <Activity className="w-3 h-3" />
                        Audit
                    </button>
                </div>
            </div>

            {isAuditPanelVisible && (
                <div className="mb-4">
                    <AuditPanel
                        title="Decision Engine Data"
                        startKey={startKey}
                        endKey={endKey}
                        rows={processedData}
                        getDateKey={() => null}
                        getRevenue={(row: any) => row.periodRevenue}
                        getQty={(row: any) => row.periodUnits}
                        getProfit={(row: any) => row.periodProfit}
                        getAdSpend={(row: any) => row.periodAdSpend}
                        distinctDaysCount={distinctDaysFound}
                    />
                </div>
            )}

            <div className="min-h-[850px] flex flex-col relative group">
                {/* NAVIGATION HEADER ROW */}
                <div className="relative flex items-center justify-center mb-4 min-h-[3rem] px-2 z-20">
                    <button 
                        onClick={prevSlide}
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-custom-glass border border-custom-glass shadow-sm rounded-xl flex items-center justify-center transition-colors hidden md:flex text-gray-500 hover:text-indigo-600 hover:bg-white/50"
                    >
                        <ChevronLeft className="w-6 h-6" />
                    </button>

                    <div className="flex justify-center gap-2">
                        {[0, 1, 2, 3, 4].map(idx => (
                            <div key={idx} className={`h-1.5 rounded-full transition-all duration-300 ${currentSlide === idx ? 'w-8 bg-indigo-600' : 'w-2 bg-gray-300'}`} />
                        ))}
                    </div>

                    <button 
                        onClick={nextSlide}
                        className="absolute right-0 top-1/2 -translate-y-1/2 w-10 h-10 bg-custom-glass border border-custom-glass shadow-sm rounded-xl flex items-center justify-center transition-colors hidden md:flex text-gray-500 hover:text-indigo-600 hover:bg-white/50"
                    >
                        <ChevronRight className="w-6 h-6" />
                    </button>
                </div>

                <div className="flex-1 relative">
                    {currentSlide === 0 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 mb-6">
                                <AlertCard title="Margin Thieves" count={alerts.margin.length} icon={AlertTriangle} color="red" isActive={selectedAlert === 'margin'} onClick={() => setSelectedAlert(selectedAlert === 'margin' ? null : 'margin')} desc={`Net Margin < ${thresholds.marginBelowTargetPct}% (Scan all)`} />
                                <AlertCard title="Volume Crashes" count={alerts.velocity.length} icon={TrendingDown} color="amber" isActive={selectedAlert === 'velocity'} onClick={() => setSelectedAlert(selectedAlert === 'velocity' ? null : 'velocity')} desc={`Vol. Drop > ${thresholds.velocityCrashPct}%`} />
                                <AlertCard title="Stockout Risk" count={alerts.stock.length} icon={Clock} color="purple" isActive={selectedAlert === 'stock'} onClick={() => setSelectedAlert(selectedAlert === 'stock' ? null : 'stock')} desc="Runway < Lead Time" />
                                <AlertCard title="Dead Stock" count={alerts.dead.length} icon={Package} color="gray" isActive={selectedAlert === 'dead'} onClick={() => setSelectedAlert(selectedAlert === 'dead' ? null : 'dead')} desc={`>£${thresholds.deadStockMinValueGBP} Value, 0 Sales`} />
                            </div>

                            <div className="bg-custom-glass rounded-xl border border-custom-glass shadow-lg overflow-hidden flex flex-col min-h-[400px]">
                                <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                            {selectedAlert ? (
                                                <>
                                                    <span className={`w-2 h-2 rounded-full ${selectedAlert === 'margin' ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                                                    Priority Actions: {selectedAlert === 'margin' ? 'Fix Margins' : selectedAlert === 'velocity' ? 'Investigate Drops' : selectedAlert === 'stock' ? 'Replenish' : 'Liquidation'}
                                                </>
                                            ) : (
                                                <><Activity className="w-4 h-4 text-indigo-500" /> Top Movers (Overview)</>
                                            )}
                                        </h3>
                                        <span className="text-xs text-gray-500">{workbenchData.length} SKUs require attention</span>
                                    </div>
                                    <button onClick={handleExport} className="p-2 hover:bg-gray-200/50 rounded-lg text-gray-500 hover:text-gray-700 transition-colors border border-transparent hover:border-gray-200" title="Export current view to CSV"><Download className="w-4 h-4" /></button>
                                </div>
                                <div className="flex-1 overflow-auto">
                                    <table className="w-full text-left text-sm whitespace-nowrap">
                                        <thead className="bg-gray-50/50 text-gray-500 font-semibold border-b border-gray-200/50 sticky top-0 z-10 backdrop-blur-sm">
                                            <tr>
                                                <th className="p-4 w-12 text-center">Action</th>
                                                <SortableHeader label="Product" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                                                <th className="p-4">Signals</th>
                                                <SortableHeader label="Price (Inc VAT)" sortKey="price" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                
                                                {selectedAlert === null && (
                                                    <>
                                                        <SortableHeader label="CA Price" sortKey="caPrice" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="text-purple-600" />
                                                        <SortableHeader label="Qty Sold" sortKey="qtySold" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                        <SortableHeader label="Period Sales" sortKey="revenue" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                        <SortableHeader label="Period Profit" sortKey="profit" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                        <SortableHeader label="Net Margin %" sortKey="margin" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                        <SortableHeader label="Inventory" sortKey="inventory" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                    </>
                                                )}

                                                {(selectedAlert === 'margin' || selectedAlert === 'dead') && (
                                                    <>
                                                        <SortableHeader label="Period Sales" sortKey="revenue" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                        <SortableHeader label="Period Profit" sortKey="profit" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                        <SortableHeader label="Net Margin %" sortKey="margin" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                    </>
                                                )}

                                                {selectedAlert === 'stock' && (
                                                    <>
                                                        <SortableHeader label="Period Sales" sortKey="revenue" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                        <SortableHeader label="Net Margin %" sortKey="margin" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                        <SortableHeader label="Runway" sortKey="runway" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="bg-purple-50/30" />
                                                        <SortableHeader label="Inventory" sortKey="inventory" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                    </>
                                                )}

                                                {selectedAlert === 'velocity' && (
                                                    <>
                                                        <SortableHeader label="Prev Qty" sortKey="prevQty" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                        <SortableHeader label="Curr Qty" sortKey="qtySold" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                        <SortableHeader label="% Change" sortKey="change" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                        <SortableHeader label="Inventory" sortKey="inventory" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                    </>
                                                )}
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-gray-100/50">
                                            {paginatedData.map(p => (
                                                <tr key={p.id} className="even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors group">
                                                    <td className="p-4 text-center">
                                                        <button onClick={() => onDeepDive(p.sku)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Deep Dive SKU Analysis"><Search className="w-4 h-4" /></button>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="font-medium text-gray-900 group-hover:text-indigo-600 transition-colors flex items-center">
                                                            {p.sku}
                                                            <GradeBadge gradeLevel={p.gradeLevel} />
                                                        </div>
                                                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{p.name}</div>
                                                    </td>
                                                    <td className="p-4">
                                                        <div className="flex flex-wrap gap-1 max-w-[140px]">
                                                            {p.signals.slice(0, 2).map(id => {
                                                                const meta = getDiagnosisMeta(id);
                                                                return <span key={id} onClick={(e) => { e.stopPropagation(); onDeepDive(p.sku); }} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium cursor-pointer hover:opacity-80 ${getSignalStyle(meta.priority)}`} title={meta.description}>{meta.shortLabel}</span>
                                                            })}
                                                        </div>
                                                    </td>
                                                    <td className="p-4 text-right">£{(p.displayPrice * VAT_MULTIPLIER).toFixed(2)}</td>
                                                    {selectedAlert === null && (
                                                        <>
                                                            <td className="p-4 text-right font-medium text-purple-600">{p.caPrice ? `£${(p.caPrice * VAT_MULTIPLIER).toFixed(2)}` : '-'}</td>
                                                            <td className="p-4 text-right font-medium text-gray-800">{p.periodUnits}</td>
                                                            <td className="p-4 text-right text-gray-600">£{p.periodRevenue.toFixed(0)}</td>
                                                            <td className="p-4 text-right font-medium">£{p.periodProfit.toFixed(0)}</td>
                                                            <td className="p-4 text-right"><span className={`font-medium ${p.periodMargin < thresholds.marginBelowTargetPct ? 'text-red-600' : 'text-green-600'}`}>{p.periodMargin.toFixed(1)}%</span></td>
                                                            <td className="p-4 text-right font-medium text-gray-800">{p.stockLevel}</td>
                                                        </>
                                                    )}
                                                    {(selectedAlert === 'margin' || selectedAlert === 'dead') && (
                                                        <>
                                                            <td className="p-4 text-right text-gray-600">£{p.periodRevenue.toFixed(0)}</td>
                                                            <td className="p-4 text-right font-medium">£{p.periodProfit.toFixed(0)}</td>
                                                            <td className="p-4 text-right">
                                                                <div className="flex flex-col items-end gap-1">
                                                                    <span className={`font-medium ${p.periodMargin < thresholds.marginBelowTargetPct ? 'text-red-600' : 'text-green-600'}`}>{p.periodMargin.toFixed(1)}%</span>
                                                                </div>
                                                            </td>
                                                        </>
                                                    )}
                                                    {selectedAlert === 'stock' && (
                                                        <>
                                                            <td className="p-4 text-right text-gray-600">£{p.periodRevenue.toFixed(0)}</td>
                                                            <td className="p-4 text-right">
                                                                <span className={`font-medium ${p.periodMargin < thresholds.marginBelowTargetPct ? 'text-red-600' : 'text-green-600'}`}>{p.periodMargin.toFixed(1)}%</span>
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <div className="flex flex-col items-end">
                                                                    <span className={`font-medium ${p.periodRunway < p.leadTimeDays ? 'text-red-600' : 'text-amber-600'}`}>
                                                                        {p.periodRunway > 365 ? '> 1 Year' : `${p.periodRunway.toFixed(0)} Days`}
                                                                    </span>
                                                                    <span className="text-[10px] text-gray-400">LT: {p.leadTimeDays}d</span>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-right font-medium text-gray-800">{p.stockLevel}</td>
                                                        </>
                                                    )}
                                                    {selectedAlert === 'velocity' && (
                                                        <>
                                                            <td className="p-4 text-right text-gray-600">{p.prevPeriodUnits}</td>
                                                            <td className="p-4 text-right font-medium">{p.periodUnits}</td>
                                                            <td className="p-4 text-right"><span className="text-red-600 font-medium">{p.velocityChange.toFixed(0)}%</span></td>
                                                            <td className="p-4 text-right font-medium text-gray-800">{p.stockLevel}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            {workbenchData.length > itemsPerPage && (
                                    <div className="bg-gray-50/50 px-4 py-3 border-t border-custom-glass flex items-center justify-between sm:px-6">
                                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                            <div className="flex items-center gap-4">
                                                <p className="text-sm text-gray-700">Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, workbenchData.length)}</span> of <span className="font-medium">{workbenchData.length}</span> results</p>
                                                <select value={itemsPerPage} onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }} className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer focus:ring-indigo-500 focus:border-indigo-500"><option value={10}>10</option><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></select>
                                            </div>
                                            <div>
                                                {totalPages > 1 && (
                                                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                                        <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-5 w-5" /></button>
                                                        <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">Page {currentPage} of {totalPages}</span>
                                                        <button onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} disabled={currentPage === totalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-5 w-5" /></button>
                                                    </nav>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {currentSlide === 1 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1 mb-6">
                                <MetricCard title="Total Revenue" value={`£${financialStats.totalRevenue.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={DollarSign} color="blue" />
                                <MetricCard title="True Net Profit" value={`£${financialStats.totalProfit.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={Coins} color="green" />
                                <MetricCard title="Total Ad Spend" value={`£${financialStats.totalAdSpend.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={Megaphone} color="purple" desc="Includes Ad-Only Transactions" />
                                <MetricCard title="TACoS %" value={`${financialStats.tacos.toFixed(1)}%`} icon={BarChart2} color="orange" desc="Total Advertising Cost of Sales" />
                            </div>
                            <div className="bg-custom-glass p-5 rounded-xl border border-custom-glass shadow-sm flex flex-col h-[400px]">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-600" /> Financial Performance</h3>
                                <div className="flex-1 min-h-0 -ml-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <ComposedChart data={financialStats.chartData}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                            <XAxis dataKey="day" tick={{fontSize: 10}} />
                                            <YAxis yAxisId="left" tick={{fontSize: 10, fill: '#6b7280'}} tickFormatter={(val) => `£${val.toLocaleString()}`} label={{ value: 'Revenue', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle', fill: '#93c5fd', fontWeight: 'bold', fontSize: 12 } }} />
                                            <YAxis yAxisId="right" orientation="right" tick={{fontSize: 10, fill: '#6b7280'}} tickFormatter={(val) => `£${val.toLocaleString()}`} label={{ value: 'Profit & Ads', angle: 90, position: 'insideRight', style: { textAnchor: 'middle', fill: '#8b5cf6', fontWeight: 'bold', fontSize: 12 } }} />
                                            <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(value: number) => '£' + value.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})} />
                                            <Legend wrapperStyle={{ fontSize: '12px' }} />
                                            <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#93c5fd" barSize={20} radius={[4, 4, 0, 0]} />
                                            <Line yAxisId="right" type="monotone" dataKey="ads" name="Ad Spend" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                                            <Line yAxisId="right" type="monotone" dataKey="profit" name="Net Profit" stroke="#10b981" strokeWidth={2} dot={false} />
                                        </ComposedChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}

                    {currentSlide === 2 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-300">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1 mb-6">
                                <MetricCard title="Total Stock Value" value={`£${inventoryStats.totalStockValue.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={Package} color="blue" desc="Based on Cost Price" />
                                <MetricCard title="Dead Stock Value" value={`£${inventoryStats.deadStockValue.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={AlertTriangle} color="gray" desc="0 Global System Velocity" />
                                <MetricCard title="Projected Lost Revenue" value={`£${inventoryStats.lostRevenue.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={TrendingDown} color="red" desc="Due to Stockouts" />
                            </div>
                            <div className="bg-custom-glass p-5 rounded-xl border border-custom-glass shadow-sm flex flex-col h-[400px]">
                                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Clock className="w-4 h-4 text-purple-600" /> Stock Runway Distribution</h3>
                                <div className="flex-1 min-h-0 -ml-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={inventoryStats.chartData} layout="horizontal">
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                            <XAxis dataKey="name" tick={{fontSize: 12, fontWeight: 600}} />
                                            <YAxis tick={{fontSize: 10}} />
                                            <RechartsTooltip cursor={{fill: 'transparent'}} />
                                            <Bar dataKey="value" name="SKU Count" fill="#818cf8" radius={[4, 4, 0, 0]} barSize={40}>
                                                {inventoryStats.chartData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.name === 'OOS' || entry.name === '< 2w' ? '#f87171' : entry.name === '2-4w' ? '#fbbf24' : '#34d399'} />
                                                ))}
                                            </Bar>
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* SLIDE 3: UK MAP VISUALIZATION */}
                    {currentSlide === 3 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-300 h-full">
                            <div className="h-full">
                                <UkSalesMap 
                                    products={products}
                                    priceHistoryMap={priceHistoryMap}
                                    dateRange={dateRange}
                                    selectedPlatform={platformScope}
                                    themeColor={themeColor}
                                    onSearch={onSearch}
                                    timePeriodLabel={getRangeLabel()} // Pass the time label
                                />
                            </div>
                        </div>
                    )}

                    {/* SLIDE 4: CATEGORY PERFORMANCE (NEW) */}
                    {currentSlide === 4 && (
                        <div className="animate-in fade-in slide-in-from-right-8 duration-300 h-full">
                            <div className="h-full">
                                <CategoryPerformanceSlide
                                    products={products}
                                    priceHistoryMap={priceHistoryMap}
                                    dateRange={dateRange}
                                    themeColor={themeColor}
                                />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
