
import React, { useState, useMemo, useEffect } from 'react';
import { Product, PricingRules, PriceLog, RefundLog, PriceChangeRecord, SearchChip, PromotionEvent } from '../../types';
import { ThresholdConfig, getThresholdConfig } from '../../services/thresholdsConfig';
import { getDiagnosisMeta, CanonicalDiagnosisId } from '../diagnostics/diagnosisRegistry';
import { asDateKey, isDateKeyBetween, addDaysToDateKey, getTodayKeyMelbourne, getYesterdayKeyMelbourne } from '../../services/dateUtils';
import { buildWindow } from '../../services/dateWindow';
import { VAT_MULTIPLIER } from '../../constants';
import { MetricCard } from '../productManagement/parts/MetricCard';
import { AlertCard } from '../productManagement/parts/AlertCard';
import { GradeBadge } from '../GradeBadge';
import { SortState, sortRows } from '../../utils/tableSort';
import { SortableHeader } from '../common/SortableHeader';
import UkSalesMap from '../UkSalesMap';
import { CategoryPerformanceSlide } from '../CategoryPerformanceSlide';
import AuditPanel from '../AuditPanel';
import { Calendar, ChevronDown, Activity, ChevronLeft, ChevronRight, Download, Search, Info, Package, TrendingUp, TrendingDown, DollarSign, Megaphone, Clock, AlertTriangle, Coins, BarChart2, RotateCcw, PieChart, Map as MapIcon, ShieldAlert, Tag, ArrowRight, Wallet, Zap, History, Ship, Calculator } from 'lucide-react';
import { formatMoney, formatNumber, formatPct } from '../../utils/format';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, Bar, Line, BarChart, Cell } from 'recharts';
import { resolveEffectiveVelocity } from '../../services/metrics';

interface OverviewPageContainerProps {
    products: Product[];
    priceHistoryMap: Map<string, PriceLog[]>;
    refundHistory: RefundLog[];
    pricingRules: PricingRules;
    priceChangeHistory: PriceChangeRecord[];
    promotions: PromotionEvent[];
    themeColor: string;
    onAnalyze: (product: Product, context?: string) => void;
    onDeepDive: (sku: string) => void;
    onSearch?: (query: string | SearchChip[]) => void;
    thresholds?: ThresholdConfig;
    headerStyle?: React.CSSProperties;
    deductRefunds: boolean;
    setDeductRefunds: (v: boolean) => void;
    mapJumpState?: {
        carrier: string;
        metric: 'RETURN_RATE' | 'REVENUE' | 'PROFIT' | 'MARGIN' | 'TACOS';
    } | null;
}

type DateRange = 'yesterday' | '7d' | '14d' | '30d' | '90d' | 'custom';
type AlertType = 'margin' | 'velocity' | 'stock' | 'dead' | null;
type OverviewTab = 'actions' | 'financials' | 'inventory' | 'map' | 'categories';

type SortKey = 'sku' | 'price' | 'caPrice' | 'qtySold' | 'revenue' | 'profit' | 'margin' | 'inventory' | 'prevQty' | 'change' | 'runway' | 'volumeDrop' | 'priceChanges' | 'leadTime' | 'inventoryValue' | 'daysSinceLastSale';

const getMedianVal = (vals: number[]) => {
    if (!vals.length) return 0;
    const s = [...vals].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 !== 0 ? s[m] : (s[m - 1] + s[m]) / 2;
};

export const OverviewPageContainer: React.FC<OverviewPageContainerProps> = ({
    products,
    priceHistoryMap,
    refundHistory,
    pricingRules,
    priceChangeHistory,
    promotions,
    themeColor,
    onAnalyze,
    onDeepDive,
    onSearch,
    thresholds: propThresholds,
    headerStyle,
    deductRefunds,
    setDeductRefunds,
    mapJumpState
}) => {
    const [activeTab, setActiveTab] = useState<OverviewTab>('actions');
    const [range, setRange] = useState<DateRange>('30d');
    const [customStart, setCustomStart] = useState<string>(getTodayKeyMelbourne());
    const [customEnd, setCustomEnd] = useState<string>(getTodayKeyMelbourne());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [platformScope, setPlatformScope] = useState<string>('All');
    // Default to 'margin' (Fix Margin)
    const [selectedAlert, setSelectedAlert] = useState<AlertType>('margin');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [isAuditPanelVisible, setIsAuditPanelVisible] = useState(false);
    const [sort, setSort] = useState<SortState<SortKey> | null>(null);

    const thresholds = useMemo(() => propThresholds || getThresholdConfig(), [propThresholds]);

    // Handle map jump state
    useEffect(() => {
        if (mapJumpState) {
            setActiveTab('map');
        }
    }, [mapJumpState]);

    // Initialize Sort State based on the selected decision mode
    useEffect(() => {
        if (selectedAlert === 'margin') {
            setSort({ key: 'margin', dir: 'asc' });
        } else if (selectedAlert === 'velocity') {
            setSort({ key: 'volumeDrop', dir: 'asc' });
        } else if (selectedAlert === 'stock') {
            setSort({ key: 'runway', dir: 'asc' });
        } else if (selectedAlert === 'dead') {
            setSort({ key: 'inventoryValue', dir: 'desc' });
        } else {
            setSort(null);
        }
    }, [selectedAlert]);

    useEffect(() => {
        setCurrentPage(1);
    }, [selectedAlert, range, platformScope, sort, deductRefunds, activeTab]);

    const { processedData, periodLabel, dateRange, startKey, endKey, distinctDaysFound, expectedDays } = useMemo(() => {
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
        const formatLabel = (d: Date, withYear: boolean) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
        const sameYear = startDate.getUTCFullYear() === endDate.getUTCFullYear();
        const label = `${formatLabel(startDate, !sameYear)} – ${formatLabel(endDate, true)}`;
        
        const prevEndKey = addDaysToDateKey(startKey, -1);
        const prevStartKey = addDaysToDateKey(prevEndKey, -(expectedDays - 1));

        const distinctDaysSet = new Set<string>();
        const todayKey = getTodayKeyMelbourne();
        const todayTs = new Date(todayKey).getTime();

        const data = products.map(p => {
            const logs = priceHistoryMap.get(p.sku) || [];
            
            // Scope Filter: Respect platform selection only. 
            // Exclusion shield ONLY affects strategy, not dashboard metrics.
            const scopeLogs = logs.filter(l => {
                const platform = l.platform || 'Unknown';
                const matchesScope = platformScope === 'All' || platform === platformScope || platform.includes(platformScope);
                return matchesScope;
            });

            let curUnits = 0; let curRev = 0; let curProfit = 0; let curAdSpend = 0;
            let prevUnits = 0;

            scopeLogs.forEach(l => {
                const d = asDateKey(l.date);
                if (!d) return;

                if (isDateKeyBetween(d, startKey, endKey)) {
                    distinctDaysSet.add(d);
                    curUnits += l.velocity;
                    curRev += (l.velocity * l.price);
                    const dailyAds = l.adsSpend !== undefined ? l.adsSpend : (p.adsFee || 0) * l.velocity;
                    curAdSpend += dailyAds;
                    if (l.profit !== undefined) curProfit += l.profit;
                    else curProfit += (l.velocity * l.price * (l.margin / 100));
                } else if (isDateKeyBetween(d, prevStartKey, prevEndKey)) {
                    prevUnits += l.velocity;
                }
            });

            // Days Since Last Sale calculation
            const saleLogs = logs.filter(l => l.velocity > 0).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const lastSaleDate = saleLogs.length > 0 ? new Date(saleLogs[0].date).getTime() : 0;
            const daysSinceLastSale = lastSaleDate > 0 ? Math.floor((todayTs - lastSaleDate) / (1000 * 60 * 60 * 24)) : 999;

            // Calculate Historical Medians
            const allSkuLogs = logs.filter(l => {
                if (platformScope !== 'All' && l.platform !== platformScope && !l.platform?.includes(platformScope)) return false;
                return true;
            });
            const histDailyUnits = allSkuLogs.map(l => l.velocity);
            const histDailyPrices = allSkuLogs.map(l => l.price);
            
            const medDailyUnits = getMedianVal(histDailyUnits);
            const medPrice = getMedianVal(histDailyPrices);
            const historicalMedianUnits = medDailyUnits * expectedDays;
            const historicalMedianPrice = medPrice;
            const volumeDropPct = historicalMedianUnits > 0 
                ? ((curUnits - historicalMedianUnits) / historicalMedianUnits) * 100 
                : 0;
            
            const volumeDropAbs = curUnits - historicalMedianUnits;

            // DYNAMIC LEAD TIME LOGIC (Arrival ETA)
            let daysToArrival = 999;
            if (p.shipments && p.shipments.length > 0) {
                const upcomingShipments = p.shipments
                    .filter(s => s.eta && s.status !== 'Delivered')
                    .map(s => new Date(s.eta!).getTime())
                    .filter(t => !isNaN(t) && t >= todayTs);
                
                if (upcomingShipments.length > 0) {
                    const earliestArrival = Math.min(...upcomingShipments);
                    daysToArrival = Math.ceil((earliestArrival - todayTs) / (1000 * 60 * 60 * 24));
                }
            }

            // REFINED PROMOTION CHECK: Use date range strictly for current validity
            const inPromotion = promotions.some(promo => 
                promo.startDate <= todayKey && 
                promo.endDate >= todayKey && 
                promo.items.some(item => item.sku.toUpperCase() === p.sku.toUpperCase())
            );

            // Fetch price changes in the selected period
            const changesInPeriod = priceChangeHistory.filter(c => 
                c.sku.toUpperCase() === p.sku.toUpperCase() &&
                isDateKeyBetween(asDateKey(c.date) || '', startKey, endKey)
            ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            let refundLoss = 0;
            if (deductRefunds) {
                const skuRefunds = refundHistory.filter(r => {
                    if (r.sku !== p.sku) return false;
                    if (platformScope !== 'All' && r.platform !== platformScope) return false;
                    const dKey = asDateKey(r.date);
                    return dKey && isDateKeyBetween(dKey, startKey, endKey);
                });
                skuRefunds.forEach(r => {
                    const refundAmt = (Number(r.amount) + Number(r.freightAmount || 0));
                    refundLoss += refundAmt;
                    curProfit -= refundAmt;
                });
            }

            const netMargin = curRev > 0 ? (curProfit / curRev) * 100 : 0;
            const velocityChange = prevUnits > 0 ? ((curUnits - prevUnits) / prevUnits) * 100 : (curUnits > 0 ? 100 : 0);
            
            let displayPrice = p.currentPrice;
            if (platformScope !== 'All') {
                const channel = p.channels.find(c => c.platform === platformScope);
                if (channel && channel.price) displayPrice = channel.price;
            }

            const tacos = curRev > 0 ? (curAdSpend / curRev) * 100 : 0;
            const refundRateValue = curRev > 0 ? (refundLoss / curRev) * 100 : 0;

            // Primary Drag Logic
            let primaryDrag = "Healthy";
            let suggestedAction = "Maintain";
            let dragSeverity: 'high' | 'med' | 'low' = 'low';

            if (netMargin < 5) {
                if (tacos > 25) {
                    primaryDrag = "Ad Spend Heavy";
                    suggestedAction = "Optimize Ad Spend";
                    dragSeverity = 'high';
                } 
                else if (refundRateValue > 10) {
                    primaryDrag = "Heavy Returns";
                    suggestedAction = "Investigate Quality";
                    dragSeverity = 'high';
                }
                else if (netMargin < 0) {
                    primaryDrag = "Selling at a Loss";
                    suggestedAction = "Urgent: Increase Price";
                    dragSeverity = 'high';
                } else if (refundRateValue > 5) {
                    primaryDrag = "High Returns";
                    suggestedAction = "Investigate Returns";
                    dragSeverity = 'med';
                } else if (displayPrice < (p.caPrice || 0)) {
                    primaryDrag = "Price Below Master";
                    suggestedAction = "Raise to CA Price";
                    dragSeverity = 'med';
                } else {
                    primaryDrag = "Margin Compression";
                    suggestedAction = "Review Unit Economics";
                    dragSeverity = 'low';
                }
            }

            const signals: CanonicalDiagnosisId[] = [];
            
            // CONSISTENCY FIX: Prioritize ERP velocity for health signals
            const globalDailyVelocity = resolveEffectiveVelocity(p, logs);

            const globalRunway = globalDailyVelocity > 0 ? p.stockLevel / globalDailyVelocity : 999;
            const stockValue = p.stockLevel * (p.costPrice || 0);

            if (p.stockLevel > 0) {
                if (globalRunway < (p.leadTimeDays * thresholds.stockoutRunwayMultiplier)) signals.push('STOCKOUT_RISK');
                else if (globalRunway > thresholds.overstockDays) signals.push('OVERSTOCK_RISK');
            }
            if ((p.returnRate || 0) > thresholds.returnRatePct) signals.push('HIGH_RETURN_RATE');
            if (tacos > thresholds.highAdDependencyPct) signals.push('HIGH_AD_DEPENDENCY');
            if (netMargin < 0) signals.push('NEGATIVE_LOSS');
            else if (netMargin < thresholds.marginBelowTargetPct) signals.push('BELOW_TARGET');
            if (velocityChange < -thresholds.velocityDropPct) signals.push('VELOCITY_DROP_WOW');
            if (stockValue > thresholds.deadStockMinValueGBP && globalDailyVelocity === 0) signals.push('DORMANT_NO_SALES');

            // Stockout Action Logic - Updated to use effective lead time
            let stockoutAction = "Safe";
            const effectiveAlertLeadTime = daysToArrival < 999 ? daysToArrival : 999;
            
            if (effectiveAlertLeadTime < 999 && globalRunway < effectiveAlertLeadTime * 1.2) {
                if (inPromotion) stockoutAction = "End Promo & Raise Price";
                else if (tacos > 10) stockoutAction = "Stop Ad & Raise Price";
                else stockoutAction = "Urgent: Increase Price";
            }

            return {
                ...p,
                periodUnits: curUnits,
                periodRevenue: curRev * VAT_MULTIPLIER,
                periodProfit: curProfit * VAT_MULTIPLIER,
                periodAdSpend: curAdSpend * VAT_MULTIPLIER,
                periodMargin: netMargin,
                prevPeriodUnits: prevUnits,
                velocityChange,
                periodDailyVelocity: globalDailyVelocity,
                periodRunway: globalRunway,
                displayPrice,
                signals,
                primaryDrag,
                suggestedAction,
                dragSeverity,
                tacos,
                refundRateValue,
                volumeDropPct,
                volumeDropAbs, 
                historicalMedianUnits,
                historicalMedianPrice,
                historicalMedianDemand: medDailyUnits,
                inPromotion,
                changesInPeriod,
                priceChangeCount: changesInPeriod.length,
                stockoutAction,
                daysToArrival, 
                effectiveAlertLeadTime,
                daysSinceLastSale,
                inventoryValue: stockValue,
                causeTags: []
            };
        });
        
        return { processedData: data, periodLabel: label, dateRange: { start: startDate, end: endDate }, startKey, endKey, distinctDaysFound: distinctDaysSet.size, expectedDays };
    }, [products, priceHistoryMap, refundHistory, deductRefunds, range, customStart, customEnd, platformScope, thresholds, pricingRules, promotions, priceChangeHistory]); 

    const alerts = useMemo(() => ({
        margin: processedData.filter(p => p.periodUnits > 0 && p.periodMargin < 5),
        velocity: processedData.filter(p => p.stockLevel > 0 && p.volumeDropPct <= -30 && p.historicalMedianUnits >= 5),
        // STOCK ALERTS: Updated logic - only alert if we HAVE an incoming shipment (Lead Time < 999) and runway is tight
        stock: processedData.filter(p => p.stockLevel > 2 && p.effectiveAlertLeadTime < 999 && p.periodRunway < (p.effectiveAlertLeadTime * 1.2)),
        // DEAD STOCK BUCKET: Updated logic per requirements
        dead: processedData.filter(p => p.inventoryValue > 200 && p.periodUnits === 0 && p.periodDailyVelocity < p.historicalMedianDemand)
    }), [processedData, thresholds]);

    const workbenchData = useMemo(() => {
        const data = !selectedAlert ? processedData.filter(p => p.periodRevenue > 0) : alerts[selectedAlert];
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
                case 'leadTime': return row.effectiveAlertLeadTime;
                case 'velocity': return row.periodDailyVelocity;
                case 'volumeDrop': return row.volumeDropAbs; 
                case 'priceChanges': return row.priceChangeCount;
                case 'inventoryValue': return row.inventoryValue;
                case 'daysSinceLastSale': return row.daysSinceLastSale;
                default: return 0;
            }
        };
        
        if (sort) {
            return sortRows(data, sort, getValue);
        }
        
        return [...data].sort((a, b) => b.periodRevenue - a.revenue);
    }, [selectedAlert, alerts, processedData, sort]);

    const paginatedData = workbenchData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalPages = Math.ceil(workbenchData.length / itemsPerPage);

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
                if (deductRefunds) {
                    refundHistory.filter(r => r.sku === p.sku && r.date.startsWith(day)).forEach(r => {
                        dayProfit -= (Number(r.amount) + Number(r.freightAmount || 0));
                    });
                }
            });
            const displayDate = new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            return { day: displayDate, revenue: dayRev * VAT_MULTIPLIER, ads: dayAds * VAT_MULTIPLIER, profit: dayProfit * VAT_MULTIPLIER };
        });
        return { totalRevenue, totalProfit, totalAdSpend, tacos, chartData };
    }, [processedData, dateRange, priceHistoryMap, refundHistory, deductRefunds, products, pricingRules, platformScope]);

    return (
        <div className="space-y-6 pb-20 animate-in fade-in duration-500 max-w-[1600px] mx-auto min-h-full flex flex-col">
            <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
                <button onClick={() => setActiveTab('actions')} className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'actions' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}><ShieldAlert className="w-4 h-4" /> Decisions</button>
                <button onClick={() => setActiveTab('financials')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'financials' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}><BarChart2 className="w-4 h-4" /> Financials</button>
                <button onClick={() => setActiveTab('map')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'map' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}><MapIcon className="w-4 h-4" /> Sales Map</button>
                <button onClick={() => setActiveTab('categories')} className={`px-4 py-2 text-sm font-bold rounded-lg transition-all flex items-center gap-2 ${activeTab === 'categories' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}><PieChart className="w-4 h-4" /> Categories</button>
            </div>

            <div className="flex flex-col md:flex-row justify-between items-center bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm gap-4 relative z-30 backdrop-blur-custom">
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
                            <button key={r} onClick={() => setRange(r)} className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all whitespace-nowrap ${range === r ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>{r === 'yesterday' ? 'Yesterday' : r.toUpperCase().replace('D', ' Days')}</button>
                        ))}
                    </div>
                    <div className="ml-3 flex flex-col justify-center pl-2 border-l border-gray-200"><span className="text-[10px] text-gray-400 font-medium uppercase leading-none mb-0.5">Analyzing Period</span><span className="text-xs font-medium text-indigo-600 flex items-center gap-1.5"><Calendar className="w-3 h-3" />{periodLabel}</span></div>
                </div>
                <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:border-indigo-300 transition-colors">
                        <input type="checkbox" checked={deductRefunds} onChange={e => setDeductRefunds(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300" />
                        <div className="flex items-center gap-1.5"><RotateCcw className={`w-3.5 h-3.5 ${deductRefunds ? 'text-red-500' : 'text-gray-400'}`} /><span className={`text-[10px] font-bold uppercase tracking-tight ${deductRefunds ? 'text-gray-900' : 'text-gray-500'}`}>Deduct Refunds</span></div>
                    </label>
                    <button onClick={() => setIsAuditPanelVisible(!isAuditPanelVisible)} className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium border transition-all shadow-sm text-xs ${isAuditPanelVisible ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}><Activity className="w-4 h-4" />Audit</button>
                </div>
            </div>

            {isAuditPanelVisible && (
                <div className="mb-4 animate-in slide-in-from-top-2 duration-300">
                    <AuditPanel title="Overview Data Quality" startKey={startKey} endKey={endKey} rows={processedData} getDateKey={() => null} getRevenue={(row: any) => row.periodRevenue / VAT_MULTIPLIER} getQty={(row: any) => row.periodUnits} getProfit={(row: any) => row.periodProfit / VAT_MULTIPLIER} getAdSpend={(row: any) => row.periodAdSpend / VAT_MULTIPLIER} distinctDaysCount={distinctDaysFound} />
                </div>
            )}

            <div className="flex-1 min-h-0 relative">
                {activeTab === 'actions' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <AlertCard title="Fix Margin" count={alerts.margin.length} icon={DollarSign} color="red" isActive={selectedAlert === 'margin'} onClick={() => setSelectedAlert(selectedAlert === 'margin' ? null : 'margin')} desc={`Net PM% < 5%`} />
                            <AlertCard title="Volume Drop" count={alerts.velocity.length} icon={TrendingDown} color="amber" isActive={selectedAlert === 'velocity'} onClick={() => setSelectedAlert(selectedAlert === 'velocity' ? null : 'velocity')} desc={`Drop ≤ -30% vs Median`} />
                            <AlertCard title="Prevent Stockout" count={alerts.stock.length} icon={Ship} color="purple" isActive={selectedAlert === 'stock'} onClick={() => setSelectedAlert(selectedAlert === 'stock' ? null : 'stock')} desc="Only Items with Arriving Stock" />
                            <AlertCard title="Clear Dead Stock" count={alerts.dead.length} icon={Package} color="gray" isActive={selectedAlert === 'dead'} onClick={() => setSelectedAlert(selectedAlert === 'dead' ? null : 'dead')} desc={`>£200 Value, 0 Sales`} />
                        </div>
                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass flex flex-col min-h-[400px]">
                            <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center">
                                <div className="flex items-center gap-4">
                                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                                        {selectedAlert === 'margin' ? (
                                            <><DollarSign className="w-4 h-4 text-red-600" /> Fix Margin Workbench</>
                                        ) : selectedAlert === 'velocity' ? (
                                            <><TrendingDown className="w-4 h-4 text-amber-600" /> Volume Drop Workbench</>
                                        ) : selectedAlert === 'stock' ? (
                                            <><Ship className="w-4 h-4 text-purple-600" /> Prevent Stockout Workbench</>
                                        ) : selectedAlert === 'dead' ? (
                                            <><Package className="w-4 h-4 text-gray-600" /> Clear Dead Stock Workbench</>
                                        ) : selectedAlert ? (
                                            <><Activity className="w-4 h-4 text-indigo-500" /> Decision Panel: {selectedAlert.charAt(0).toUpperCase() + selectedAlert.slice(1)}</>
                                        ) : (
                                            <><Activity className="w-4 h-4 text-indigo-500" /> Executive Workbench</>
                                        )}
                                    </h3>
                                    <span className="text-xs text-gray-500">{workbenchData.length} items requiring action</span>
                                </div>
                                <button onClick={() => {}} className="p-2 hover:bg-gray-200/50 rounded-lg text-gray-500 hover:text-gray-700 transition-colors border border-transparent hover:border-gray-200"><Download className="w-4 h-4" /></button>
                            </div>
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap relative">
                                    <thead className="bg-gray-50/50 text-gray-500 font-semibold border-b border-gray-200/50 sticky top-0 z-20 backdrop-blur-sm">
                                        {selectedAlert === 'margin' ? (
                                            <tr>
                                                <th className="p-4 w-12 text-center">Detail</th>
                                                <SortableHeader label="SKU / Title" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                                                <SortableHeader label="CA Price" sortKey="caPrice" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="text-purple-600" />
                                                <SortableHeader label="Actual Margin" sortKey="margin" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Recent Qty" sortKey="qtySold" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Revenue" sortKey="revenue" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Net Profit" sortKey="profit" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <th className="p-4 text-left">Cause</th>
                                                <th className="p-4 text-right pr-6">Recommend</th>
                                            </tr>
                                        ) : selectedAlert === 'velocity' ? (
                                            <tr>
                                                <th className="p-4 w-12 text-center">Detail</th>
                                                <SortableHeader label="SKU / Title" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                                                <SortableHeader label="Drop #" sortKey="volumeDrop" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Drop %" sortKey="volumeDrop" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Period Qty" sortKey="qtySold" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <th className="p-4 text-right group/header relative">
                                                    <div className="flex items-center justify-end gap-1 cursor-help">
                                                        Baseline Qty
                                                        <Info className="w-3 h-3 text-gray-400" />
                                                    </div>
                                                    <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900/95 backdrop-blur shadow-2xl rounded-xl opacity-0 group-hover/header:opacity-100 transition-all pointer-events-none z-50 border border-slate-700 p-3 animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <div className="font-black border-b border-slate-700 pb-1.5 mb-2 uppercase tracking-widest text-[9px] text-indigo-300 flex items-center justify-center gap-1.5">
                                                            <Calculator className="w-3 h-3" /> Calculation Logic
                                                        </div>
                                                        <div className="text-[10px] text-slate-300 leading-relaxed text-center normal-case font-medium whitespace-normal">
                                                            Projected volume based on <span className="text-white font-bold">Median Daily Sales</span> multiplied by the <span className="text-white font-bold">{expectedDays} days</span> currently selected in your filter window.
                                                        </div>
                                                        <div className="absolute bottom-full right-4 -mb-1.5 border-[6px] border-transparent border-b-slate-900/95"></div>
                                                    </div>
                                                </th>
                                                <SortableHeader label="Price" sortKey="price" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <th className="p-4 text-right">Hist. Price</th>
                                                <SortableHeader label="Inventory" sortKey="inventory" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Price Adj." sortKey="priceChanges" sort={sort} onChange={setSort} themeColor={themeColor} align="center" />
                                                <th className="p-4 text-right pr-6">CTA / Justification</th>
                                            </tr>
                                        ) : selectedAlert === 'stock' ? (
                                            <tr>
                                                <th className="p-4 w-12 text-center">Detail</th>
                                                <SortableHeader label="SKU / Title" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                                                <SortableHeader label="Runway (Days)" sortKey="runway" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Lead Time" sortKey="leadTime" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <th className="p-4 text-right group/header relative">
                                                    <div className="flex items-center justify-end gap-1 cursor-help">
                                                        Global Velocity
                                                        <Info className="w-3 h-3 text-gray-400" />
                                                    </div>
                                                    <div className="absolute top-full right-0 mt-2 w-64 bg-slate-900/95 backdrop-blur shadow-2xl rounded-xl opacity-0 group-hover/header:opacity-100 transition-all pointer-events-none z-50 border border-slate-700 p-4 animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <div className="font-black border-b border-slate-700 pb-2 mb-3 uppercase tracking-widest text-[10px] text-indigo-300 flex items-center justify-center gap-1.5">
                                                            <Calculator className="w-3 h-3" /> Data Source
                                                        </div>
                                                        <div className="text-[10px] text-slate-300 leading-relaxed text-center normal-case font-medium whitespace-normal">
                                                            Prioritizes <span className="text-white font-bold">Average Daily Sales from ERP</span> if available, otherwise calculates from imported history.
                                                        </div>
                                                        <div className="absolute top-full right-4 -mb-1.5 border-[6px] border-transparent border-t-slate-900/95"></div>
                                                    </div>
                                                </th>
                                                <SortableHeader label="Stock (Min 2)" sortKey="inventory" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <th className="p-4 text-right pr-6">Action / Continuity Strategy</th>
                                            </tr>
                                        ) : selectedAlert === 'dead' ? (
                                            <tr>
                                                <th className="p-4 w-12 text-center">Detail</th>
                                                <SortableHeader label="SKU / Title" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                                                <SortableHeader label="Inventory Units" sortKey="inventory" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Inventory Value" sortKey="inventoryValue" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Days Since Sale" sortKey="daysSinceLastSale" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <th className="p-4 text-right">Median Demand</th>
                                                <th className="p-4 text-right pr-6">Action</th>
                                            </tr>
                                        ) : (
                                            <tr>
                                                <th className="p-4 w-12 text-center">Action</th>
                                                <SortableHeader label="Product" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                                                <th className="p-4">Signals</th>
                                                <SortableHeader label="Price (Inc VAT)" sortKey="price" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Sales" sortKey="revenue" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Net Margin %" sortKey="margin" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Inventory" sortKey="inventory" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                            </tr>
                                        )}
                                    </thead>
                                    <tbody className="divide-y divide-gray-100/50">
                                        {paginatedData.map(p => {
                                            if (selectedAlert === 'velocity') {
                                                const priceDiff = p.displayPrice - p.historicalMedianPrice;
                                                const isPriceHigh = priceDiff > 0.05;
                                                
                                                const hasRecentPriceIncrease = p.changesInPeriod.some(c => c.changeType === 'INCREASE');
                                                
                                                // CTA and Justification
                                                let ctaText = isPriceHigh ? "Review Price Positioning" : "Consider Promotion";
                                                let justification = isPriceHigh 
                                                    ? `Price is currently £${formatMoney(Math.abs(priceDiff), 2, '')} above historical median (£${formatMoney(p.historicalMedianPrice, 2, '')})`
                                                    : `Velocity is down ${Math.abs(p.volumeDropPct).toFixed(0)}% despite baseline pricing`;

                                                if (hasRecentPriceIncrease) {
                                                    ctaText = "Monitor Intentional Slowdown";
                                                    justification = `Price increase detected in period. Slowdown likely deliberate to protect stockout.`;
                                                }

                                                return (
                                                    <tr key={p.id} className="even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors group">
                                                        <td className="p-4 text-center">
                                                            <button onClick={() => onDeepDive(p.sku)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                                                <Search className="w-4 h-4" />
                                                            </button>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="font-bold text-gray-900 flex items-center">
                                                                {p.sku}
                                                                <GradeBadge gradeLevel={p.gradeLevel} />
                                                                {p.inPromotion && (
                                                                    <span className="ml-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                                                                        <Zap className="w-2 h-2" /> Live Promo
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-500 truncate max-w-[250px]">{p.name}</div>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <span className="font-bold text-gray-900">
                                                                {formatNumber(p.volumeDropAbs, 0)}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <span className="font-black text-red-600">
                                                                {formatPct(p.volumeDropPct)}
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-right font-bold text-gray-900">{formatNumber(p.periodUnits)}</td>
                                                        <td className="p-4 text-right text-gray-400 font-medium">{formatNumber(p.historicalMedianUnits, 0)}</td>
                                                        <td className={`p-4 text-right font-bold ${isPriceHigh ? 'text-amber-600' : 'text-gray-900'}`}>£{formatMoney(p.displayPrice, 2, '')}</td>
                                                        <td className="p-4 text-right text-gray-400 font-medium">£{formatMoney(p.historicalMedianPrice, 2, '')}</td>
                                                        <td className={`p-4 text-right font-bold ${p.stockLevel < thresholds.minAbsoluteFloor ? 'text-orange-600' : 'text-gray-800'}`}>{formatNumber(p.stockLevel)}</td>
                                                        
                                                        {/* Price Changes Column - Tooltip restricted to hover on this badge only */}
                                                        <td className="p-4 text-center">
                                                            <div className="group/tooltip relative inline-block">
                                                                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-bold text-xs transition-colors cursor-help ${p.priceChangeCount > 0 ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-gray-50 text-gray-300 border-gray-100'}`}>
                                                                    <History className="w-3 h-3" />
                                                                    {p.priceChangeCount}
                                                                </div>
                                                                {p.priceChangeCount > 0 && (
                                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-3 w-72 bg-slate-900/95 backdrop-blur shadow-2xl rounded-xl opacity-0 group-hover/tooltip:opacity-100 transition-all pointer-events-none z-50 border border-slate-700 p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                                                        <div className="font-black border-b border-slate-700 pb-2 mb-3 uppercase tracking-widest text-[10px] text-indigo-300 flex justify-between items-center">
                                                                            <span>Recent Price Adjustments</span>
                                                                            <History className="w-3 h-3" />
                                                                        </div>
                                                                        <div className="space-y-2.5">
                                                                            {p.changesInPeriod.slice(0, 5).map(c => (
                                                                                <div key={c.id} className="flex justify-between items-center gap-3">
                                                                                    <div className="flex flex-col">
                                                                                        <span className="text-[10px] text-slate-400 font-medium uppercase">{new Date(c.date).toLocaleDateString('en-GB', {day:'numeric', month:'short'})}</span>
                                                                                    </div>
                                                                                    <div className="flex items-center gap-2 flex-1 justify-end">
                                                                                        <span className="text-[10px] text-white font-mono italic">£{c.oldPrice.toFixed(2)} → £{c.newPrice.toFixed(2)}</span>
                                                                                        <span className={`font-black text-xs min-w-[50px] text-right ${c.changeType === 'INCREASE' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                                            {c.changeType === 'INCREASE' ? '↑' : '↓'} {Math.abs(c.percentChange).toFixed(1)}%
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                            {p.priceChangeCount > 5 && (
                                                                                <div className="text-center pt-2 border-t border-slate-800 text-[9px] text-slate-500 font-bold uppercase tracking-tight">
                                                                                    + {p.priceChangeCount - 5} additional events
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                        <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1.5 border-[6px] border-transparent border-t-slate-900/95"></div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>

                                                        <td className="p-4 text-right pr-6">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[11px] font-black uppercase text-indigo-700 tracking-wider bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{ctaText}</span>
                                                                <span className="text-[11px] text-gray-600 mt-1 font-medium leading-relaxed max-w-[280px] break-words whitespace-normal text-right">{justification}</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            if (selectedAlert === 'stock') {
                                                const isArrivalDriven = p.daysToArrival < 999;
                                                return (
                                                    <tr key={p.id} className="even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors group">
                                                        <td className="p-4 text-center">
                                                            <button onClick={() => onDeepDive(p.sku)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                                                <Search className="w-4 h-4" />
                                                            </button>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="font-bold text-gray-900 flex items-center">
                                                                {p.sku}
                                                                <GradeBadge gradeLevel={p.gradeLevel} />
                                                                {p.inPromotion && (
                                                                    <span className="ml-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                                                                        <Zap className="w-2 h-2" /> Live Promo
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-500 truncate max-w-[250px]">{p.name}</div>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <span className={`font-black text-sm px-2 py-1 rounded ${p.periodRunway < p.effectiveAlertLeadTime ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-amber-100 text-amber-700 border border-amber-200'}`}>
                                                                {p.periodRunway.toFixed(0)} Days
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <div className="flex flex-col items-end">
                                                                <span className="font-medium text-gray-900">{p.effectiveAlertLeadTime} Days</span>
                                                                <span className="text-[10px] text-gray-400 uppercase font-bold">{isArrivalDriven ? 'Arrival ETA' : 'No Shipment'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-right font-medium text-gray-700">
                                                            {formatNumber(p.periodDailyVelocity, 1)} /day
                                                        </td>
                                                        <td className="p-4 text-right font-bold text-gray-900">
                                                            {formatNumber(p.stockLevel)}
                                                        </td>
                                                        <td className="p-4 text-right pr-6">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[11px] font-black uppercase text-purple-700 tracking-wider bg-purple-50 px-2 py-0.5 rounded border border-purple-100 shadow-sm">{p.stockoutAction}</span>
                                                                <span className="text-[11px] text-gray-500 mt-1 font-medium text-right">Runway covers {p.effectiveAlertLeadTime === 999 ? 'N/A' : ((p.periodRunway / p.effectiveAlertLeadTime) * 100).toFixed(0) + '% of buffer'}</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            if (selectedAlert === 'dead') {
                                                let cta = "Clearance Promo";
                                                if (p.inventoryValue > 1000) cta = "Liquidate";
                                                else if (p.gradeLevel && p.gradeLevel >= 4) cta = "Bundle";

                                                return (
                                                    <tr key={p.id} className="even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors group">
                                                        <td className="p-4 text-center">
                                                            <button onClick={() => onDeepDive(p.sku)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                                                <Search className="w-4 h-4" />
                                                            </button>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="font-bold text-gray-900 flex items-center">
                                                                {p.sku}
                                                                <GradeBadge gradeLevel={p.gradeLevel} />
                                                            </div>
                                                            <div className="text-xs text-gray-500 truncate max-w-[250px]">{p.name}</div>
                                                        </td>
                                                        <td className="p-4 text-right font-bold text-gray-900">
                                                            {formatNumber(p.stockLevel)}
                                                        </td>
                                                        <td className="p-4 text-right font-bold text-red-600">
                                                            {formatMoney(p.inventoryValue, 0)}
                                                        </td>
                                                        <td className={`p-4 text-right font-medium ${p.daysSinceLastSale > 60 ? 'text-red-600' : 'text-gray-700'}`}>
                                                            {p.daysSinceLastSale === 999 ? 'No Sales' : `${p.daysSinceLastSale} days`}
                                                        </td>
                                                        <td className="p-4 text-right text-gray-500 italic">
                                                            {p.historicalMedianDemand.toFixed(1)} /day
                                                        </td>
                                                        <td className="p-4 text-right pr-6">
                                                            <span className="text-[11px] font-black uppercase text-amber-700 tracking-wider bg-amber-50 px-2 py-0.5 rounded border border-amber-100 shadow-sm">{cta}</span>
                                                        </td>
                                                    </tr>
                                                );
                                            }
                                            
                                            return (
                                                <tr key={p.id} className="even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors group">
                                                    {selectedAlert === 'margin' ? (
                                                        <>
                                                            <td className="p-4 text-center">
                                                                <button onClick={() => onDeepDive(p.sku)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors">
                                                                    <Search className="w-4 h-4" />
                                                                </button>
                                                            </td>
                                                            <td className="p-4">
                                                                <div className="font-bold text-gray-900 flex items-center">
                                                                    {p.sku}
                                                                    <GradeBadge gradeLevel={p.gradeLevel} />
                                                                </div>
                                                                <div className="text-xs text-gray-500 truncate max-w-[250px]">{p.name}</div>
                                                            </td>
                                                            <td className="p-4 text-right font-mono font-bold text-purple-600">
                                                                {p.caPrice ? formatMoney(p.caPrice) : '—'}
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <span className={`font-black text-sm px-2 py-1 rounded ${p.periodMargin < 0 ? 'bg-red-100 text-red-700 border border-red-200' : 'text-red-600'}`}>
                                                                    {formatPct(p.periodMargin)}
                                                                </span>
                                                            </td>
                                                            <td className="p-4 text-right font-medium text-gray-900">
                                                                {formatNumber(p.periodUnits)}
                                                            </td>
                                                            <td className="p-4 text-right font-medium text-gray-600">{formatMoney(p.periodRevenue, 0)}</td>
                                                            <td className={`p-4 text-right font-bold ${p.periodProfit < 0 ? 'text-red-600' : 'text-gray-900'}`}>{formatMoney(p.periodProfit, 2)}</td>
                                                            <td className="p-4">
                                                                <div className="flex items-center gap-2 group relative inline-block">
                                                                    <span className={`text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded border shadow-sm ${
                                                                        p.primaryDrag === "Ad Spend Heavy" ? 'text-purple-700 bg-purple-50 border-purple-100' :
                                                                        p.primaryDrag === "Heavy Returns" ? 'text-red-700 bg-red-50 border-red-100' :
                                                                        p.primaryDrag === "Selling at a Loss" ? 'text-rose-700 bg-rose-50 border-rose-100' :
                                                                        p.primaryDrag === "Price Below Master" ? 'text-indigo-700 bg-indigo-50 border-indigo-100' :
                                                                        p.primaryDrag === "High Returns" ? 'text-amber-700 bg-amber-50 border-amber-100' :
                                                                        'text-gray-700 bg-gray-50 border-gray-100'
                                                                    }`}>
                                                                        {p.primaryDrag}
                                                                    </span>
                                                                    <div className="absolute left-0 top-full mt-1 w-64 bg-gray-900 text-white text-[10px] p-2 rounded shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none border border-gray-700">
                                                                        <div className="font-bold border-b border-gray-700 pb-1 mb-1">Cost Breakdown (Ex VAT)</div>
                                                                        <div className="space-y-0.5">
                                                                            <div className="flex justify-between"><span>Unit Revenue:</span><span>{formatMoney(p.displayPrice, 2)}</span></div>
                                                                            <div className="flex justify-between text-orange-400"><span>Ad Cost:</span><span>-{formatMoney((p.adsFee || 0), 2)} ({formatPct(p.tacos)})</span></div>
                                                                            <div className="flex justify-between text-red-400"><span>Refund Impact:</span><span>-{formatMoney((p.refundRateValue / 100 * p.displayPrice), 2)}</span></div>
                                                                            <div className="flex justify-between text-gray-400"><span>COGS + Ops:</span><span>-{formatMoney((p.costPrice || 0) + (p.postage || 0) + (p.wmsFee || 0), 2)}</span></div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-right pr-6">
                                                                <div className="flex flex-col items-end">
                                                                    <span className="text-[11px] font-black uppercase text-indigo-700 tracking-wider bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100 shadow-sm">
                                                                        {p.suggestedAction}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="p-4 text-center"><button onClick={() => onDeepDive(p.sku)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"><Search className="w-4 h-4" /></button></td>
                                                            <td className="p-4"><div className="font-medium text-gray-900 group-hover:text-indigo-600 transition-colors flex items-center">{p.sku}<GradeBadge gradeLevel={p.gradeLevel} /></div><div className="text-xs text-gray-500 truncate max-w-[250px]">{p.name}</div></td>
                                                            <td className="p-4"><div className="flex flex-wrap gap-1 max-w-[140px]">{p.signals.slice(0, 2).map((id:string) => { const meta = getDiagnosisMeta(id as CanonicalDiagnosisId); return <span key={id} onClick={() => onDeepDive(p.sku)} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium cursor-pointer hover:opacity-80 ${meta.priority === 'High' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`} title={meta.description}>{meta.shortLabel}</span>})}</div></td>
                                                            <td className="p-4 text-right">£{(p.displayPrice * VAT_MULTIPLIER).toFixed(2)}</td>
                                                            <td className="p-4 text-right text-gray-600">£{p.periodRevenue.toFixed(0)}</td>
                                                            <td className="p-4 text-right"><span className={`font-medium ${p.periodMargin < thresholds.marginBelowTargetPct ? 'text-red-600' : 'text-green-600'}`}>{p.periodMargin.toFixed(1)}%</span></td>
                                                            <td className="p-4 text-right font-medium text-gray-800">{p.stockLevel}</td>
                                                        </>
                                                    )}
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
                {activeTab === 'financials' && (
                    <div className="animate-in fade-in slide-in-from-bottom-4 duration-300 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <MetricCard title="Total Revenue" value={`£${financialStats.totalRevenue.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={DollarSign} color="blue" />
                            <MetricCard title="True Net Profit" value={`£${financialStats.totalProfit.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={Coins} color="green" />
                            <MetricCard title="Total Ad Spend" value={`£${financialStats.totalAdSpend.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={Megaphone} color="purple" desc="Includes Ad-Only Transactions" />
                            <MetricCard title="TACoS %" value={`${financialStats.tacos.toFixed(1)}%`} icon={BarChart2} color="orange" desc="Total Advertising Cost of Sales" />
                        </div>
                        <div className="bg-custom-glass p-5 rounded-xl border border-custom-glass shadow-sm flex flex-col h-[500px]">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-600" /> Financial Performance</h3>
                            <div className="flex-1 min-0"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={financialStats.chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" /><XAxis dataKey="day" tick={{fontSize: 10}} /><YAxis yAxisId="left" tick={{fontSize: 10, fill: '#6b7280'}} tickFormatter={(val) => `£${val.toLocaleString()}`} label={{ value: 'Revenue', angle: -90, position: 'insideLeft', style: { fill: '#93c5fd', fontWeight: 'bold', fontSize: 12 } }} /><YAxis yAxisId="right" orientation="right" tick={{fontSize: 10, fill: '#6b7280'}} tickFormatter={(val) => `£${val.toLocaleString()}`} label={{ value: 'Profit & Ads', angle: 90, position: 'insideRight', style: { fill: '#8b5cf6', fontWeight: 'bold', fontSize: 12 } }} /><RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(value: number) => '£' + value.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})} /><Legend wrapperStyle={{ fontSize: '12px' }} /><Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#93c5fd" barSize={20} radius={[4, 4, 0, 0]} /><Line yAxisId="right" type="monotone" dataKey="ads" name="Ad Spend" stroke="#8b5cf6" strokeWidth={2} dot={false} /><Line yAxisId="right" type="monotone" dataKey="profit" name="Net Profit" stroke="#10b981" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div>
                        </div>
                    </div>
                )}
                {activeTab === 'map' && (<div className="animate-in fade-in slide-in-from-bottom-4 duration-300 h-auto"><UkSalesMap products={products} priceHistoryMap={priceHistoryMap} dateRange={dateRange} selectedPlatform={platformScope} themeColor={themeColor} onSearch={onSearch} timePeriodLabel={periodLabel} externalConfig={mapJumpState} /></div>)}
                {activeTab === 'categories' && (<div className="animate-in fade-in slide-in-from-bottom-4 duration-300 h-auto pb-24"><CategoryPerformanceSlide products={products} priceHistoryMap={priceHistoryMap} dateRange={dateRange} themeColor={themeColor} refundHistory={refundHistory} deductRefunds={deductRefunds} /></div>)}
            </div>
            
            {totalPages > 1 && activeTab === 'actions' && (
                <div className="bg-white/50 px-4 py-3 border-t border-gray-100 flex items-center justify-between mt-auto">
                    <p className="text-xs text-gray-500">Showing page {currentPage} of {totalPages}</p>
                    <div className="flex gap-1">
                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="p-1 border rounded disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="p-1 border rounded disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
                    </div>
                </div>
            )}
        </div>
    );
};
