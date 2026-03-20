
import React, { useState, useMemo, useEffect } from 'react';
import { Product, PricingRules, PriceLog, RefundLog, PriceChangeRecord, SearchChip, PromotionEvent } from '../../types';
import { ThresholdConfig, getThresholdConfig } from '../../services/thresholdsConfig';
import { getDiagnosisMeta, CanonicalDiagnosisId } from '../../services/diagnosisRegistry';
import { asDateKey, isDateKeyBetween, addDaysToDateKey, getTodayKeyMelbourne, getYesterdayKeyMelbourne } from '../../services/dateUtils';
import { buildWindow } from '../../services/dateWindow';
import { VAT_MULTIPLIER } from '../../constants';
import { MetricCard } from '../productManagement/parts/MetricCard';
import { AlertCard } from '../productManagement/parts/AlertCard';
import { GradeBadge } from '../common/GradeBadge';
import { SortState, sortRows } from '../../utils/tableSort';
import { SortableHeader } from '../common/SortableHeader';
import UkSalesMap from './tabs/MapTab';
import { CategoryPerformanceSlide } from './tabs/CategoriesTab';
import { aggregateCategoryData } from '../../services/categoryAgg';
import AuditPanel from '../common/AuditPanel';
import { FilterBar } from '../common/FilterBar';
import { Activity, ChevronLeft, ChevronRight, Download, Search, Info, Package, TrendingDown, DollarSign, BarChart2, RotateCcw, PieChart, Map as MapIcon, ShieldAlert, Zap, History, Ship, Calculator, Coins, Megaphone } from 'lucide-react';
import { formatSmartMoney, formatNumber, formatPct } from '../../utils/format';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, Bar, Line, BarChart, Cell } from 'recharts';
import { resolveEffectiveVelocity } from '../../services/metrics';
import { MetricValue } from '../common/MetricValue';
import { TabSwitcher } from '../common/TabSwitcher';
import { ContextBar } from '../common/ContextBar';
import { SelectFilter } from '../common/SelectFilter';

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

const OverviewPageContainerInner: React.FC<OverviewPageContainerProps> = ({
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
        mapJumpState
}) => {
    const [debouncedProducts, setDebouncedProducts] = useState(products);

    useEffect(() => {
        const timer = setTimeout(() => {
            setDebouncedProducts(products);
        }, 300);
        return () => clearTimeout(timer);
    }, [products]);

    const [activeTab, setActiveTab] = useState<OverviewTab>('actions');
    const [isAuditVisible, setIsAuditVisible] = useState(false);
    const [range, setRange] = useState<DateRange>('30d');
    const [customStart, setCustomStart] = useState<string>(getTodayKeyMelbourne());
    const [customEnd, setCustomEnd] = useState<string>(getTodayKeyMelbourne());
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [platformScope, setPlatformScope] = useState<string[]>([]);
    // Default to 'margin' (Fix Margin)
    const [selectedAlert, setSelectedAlert] = useState<AlertType>('margin');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [isAuditPanelVisible, setIsAuditPanelVisible] = useState(false);
    const [sort, setSort] = useState<SortState<SortKey> | null>(null);

    const [deductRefunds, setDeductRefunds] = React.useState<boolean>(() => {
        const saved = localStorage.getItem('sello_deduct_refunds_overview');
        return saved === null ? true : saved === 'true';
    });
    React.useEffect(() => {
        localStorage.setItem('sello_deduct_refunds_overview', deductRefunds.toString());
    }, [deductRefunds]);

    const thresholds = useMemo(() => propThresholds || getThresholdConfig(), [propThresholds]);

    // Pre-compute refund totals per SKU for the selected window — same pattern as StrategyPageContainer
    // Keeps deductRefunds toggle instant by avoiding re-running the full product loop
    const refundTotalsBySku = useMemo(() => {
        const map = new Map<string, number>();
        const { startKey, endKey } = buildWindow({
            mode: range === 'custom' ? 'custom' : 'days',
            days: range === 'yesterday' ? 1 : range === '7d' ? 7 : range === '14d' ? 14 :
                  range === '30d' ? 30 : range === '90d' ? 90 : 30,
            startKey: customStart, endKey: customEnd, excludeToday: true
        });
        refundHistory.forEach(r => {
            if (!r.sku || !r.date) return;
            if (platformScope.length > 0 && !platformScope.includes(r.platform || '')) return;
            const dKey = asDateKey(r.date);
            if (!dKey || !isDateKeyBetween(dKey, startKey, endKey)) return;
            const amt = (Number(r.amount) + Number(r.freightAmount || 0));
            map.set(r.sku, (map.get(r.sku) || 0) + amt);
        });
        return map;
    }, [refundHistory, range, customStart, customEnd, platformScope]);

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

        const todayStr = getTodayKeyMelbourne();
        const todayTs = new Date(todayStr).getTime();

        const data = debouncedProducts.map(p => {
            const logs = priceHistoryMap.get(p.sku) || [];

            // Scope Filter: Respect platform selection only. 
            // Exclusion shield ONLY affects strategy, not dashboard metrics.
            const scopeLogs = logs.filter(l => {
                const platform = l.platform || 'Unknown';
                const matchesScope = platformScope.length === 0 || platformScope.some(p => platform === p || platform.includes(p));
                return matchesScope;
            });

            let curUnits = 0; let curRev = 0; let curProfit = 0; let curAdSpend = 0;
            let prevUnits = 0;

            scopeLogs.forEach(l => {
                const d = asDateKey(l.date);
                if (!d) return;

                if (isDateKeyBetween(d, startKey, endKey)) {
                    curUnits += l.velocity;
                    curRev += (l.velocity * l.price);
                    const dailyAds = l.adsSpend !== undefined ? l.adsSpend : (p.adsFee || 0) * l.velocity;
                    curAdSpend += dailyAds;
                    if (l.profit !== undefined) curProfit += l.profit;
                    else curProfit += (l.velocity * l.price * ((l.margin || 0) / 100));
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
                if (platformScope.length > 0 && !platformScope.some(p => l.platform === p || l.platform?.includes(p))) return false;
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
                promo.startDate <= todayStr &&
                promo.endDate >= todayStr &&
                promo.items.some(item => item.sku.toUpperCase() === p.sku.toUpperCase())
            );

            // Fetch price changes in the selected period
            const changesInPeriod = priceChangeHistory.filter(c =>
                c.sku.toUpperCase() === p.sku.toUpperCase() &&
                isDateKeyBetween(asDateKey(c.date) || '', startKey, endKey)
            ).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            // Use pre-computed refundTotalsBySku — deductRefunds applied cheaply below
            const refundLoss = refundTotalsBySku.get(p.sku) || 0;
            const curProfitGross = curProfit; // before refund deduction

            const netMargin = curRev > 0 ? (curProfit / curRev) * 100 : 0;
            const velocityChange = prevUnits > 0 ? ((curUnits - prevUnits) / prevUnits) * 100 : (curUnits > 0 ? 100 : 0);

            let displayPrice = p.currentPrice;
            if (platformScope.length === 1) {
                const channel = p.channels.find(c => c.platform === platformScope[0]);
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
                periodProfit: (curProfitGross - refundLoss) * VAT_MULTIPLIER,
                periodProfitGross: curProfitGross * VAT_MULTIPLIER,
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

        const distinctDaysSet = new Set<string>();
        // Re-calculate distinctDaysFound since it was inside the map before (inefficient but that's how it was)
        // Wait, I should do it properly.
        debouncedProducts.forEach(p => {
            const logs = priceHistoryMap.get(p.sku) || [];
            logs.forEach(l => {
                const d = asDateKey(l.date);
                if (d && isDateKeyBetween(d, startKey, endKey)) {
                    distinctDaysSet.add(d);
                }
            });
        });

        return { processedData: data, periodLabel: label, dateRange: { start: startDate, end: endDate }, startKey, endKey, distinctDaysFound: distinctDaysSet.size, expectedDays };
    }, [debouncedProducts, priceHistoryMap, refundTotalsBySku, range, customStart, customEnd, platformScope, thresholds, pricingRules, promotions, priceChangeHistory]);

    // Cheap: apply deductRefunds toggle without re-running the full product loop
    const processedDataWithToggle = useMemo(() => {
        if (deductRefunds) return processedData;
        return processedData.map(row => ({
            ...row,
            periodProfit: row.periodProfitGross ?? row.periodProfit,
            periodMargin: row.periodRevenue > 0 
                ? ((row.periodProfitGross ?? row.periodProfit) / row.periodRevenue) * 100 
                : 0,
        }));
    }, [processedData, deductRefunds]);

    const alerts = useMemo(() => ({
        margin: processedDataWithToggle.filter(p => p.periodUnits > 0 && p.periodMargin < 5),
        velocity: processedDataWithToggle.filter(p => p.stockLevel > 0 && p.volumeDropPct <= -30 && p.historicalMedianUnits >= 5),
        // STOCK ALERTS: Updated logic - only alert if we HAVE an incoming shipment (Lead Time < 999) and runway is tight
        stock: processedDataWithToggle.filter(p => p.stockLevel > 2 && p.effectiveAlertLeadTime < 999 && p.periodRunway < (p.effectiveAlertLeadTime * 1.2)),
        // DEAD STOCK BUCKET: Updated logic per requirements
        dead: processedData.filter(p => p.inventoryValue > 200 && p.periodUnits === 0 && p.periodDailyVelocity < p.historicalMedianDemand)
    }), [processedData, thresholds]);

    const workbenchData = useMemo(() => {
        const data = !selectedAlert ? processedData.filter(p => p.periodRevenue > 0) : alerts[selectedAlert];
        const getValue = (row: any, key: string) => {
            switch (key) {
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

        return [...data].sort((a, b) => (b.periodRevenue || 0) - (a.periodRevenue || 0));
    }, [selectedAlert, alerts, processedData, sort]);

    const paginatedData = workbenchData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const categoryData = useMemo(() => {
        if (activeTab !== 'categories') return [];
        const result = aggregateCategoryData(products, priceHistoryMap, dateRange);
        return result.mainCategories;
    }, [activeTab, products, priceHistoryMap, dateRange]);

    const totalPages = Math.ceil(workbenchData.length / itemsPerPage);

    const financialStats = useMemo(() => {
        const totalRevenue = processedDataWithToggle.reduce((acc, p) => acc + p.periodRevenue, 0);
        const totalProfit = processedDataWithToggle.reduce((acc, p) => acc + p.periodProfit, 0);
        const totalAdSpend = processedDataWithToggle.reduce((acc, p) => acc + p.periodAdSpend, 0);
        const tacos = totalRevenue > 0 ? (totalAdSpend / totalRevenue) * 100 : 0;

        const days = [];
        for (let d = new Date(dateRange.start); d <= dateRange.end; d.setDate(d.getDate() + 1)) {
            days.push(new Date(d).toISOString().split('T')[0]);
        }

        // Optimized Daily Aggregation to avoid O(days * products * logs) complexity
        const dailyAggs = new Map<string, { rev: number, ads: number, profit: number }>();
        days.forEach(day => dailyAggs.set(day, { rev: 0, ads: 0, profit: 0 }));

        products.forEach(p => {
            const logs = priceHistoryMap.get(p.sku) || [];
            logs.forEach(l => {
                if (!l.date) return;
                const dKey = l.date.split('T')[0];
                const agg = dailyAggs.get(dKey);
                if (agg) {
                    agg.rev += (l.price * l.velocity);
                    agg.ads += (l.adsSpend !== undefined ? l.adsSpend : (p.adsFee || 0) * l.velocity);
                    if (l.profit !== undefined) agg.profit += l.profit;
                    else agg.profit += (l.velocity * l.price * ((l.margin || 0) / 100));
                }
            });
        });

        // Profit deduction via deductRefunds already reflected in processedDataWithToggle.periodProfit

        const chartData = days.map(day => {
            const agg = dailyAggs.get(day) || { rev: 0, ads: 0, profit: 0 };
            const displayDate = new Date(day).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
            return {
                day: displayDate,
                revenue: agg.rev * VAT_MULTIPLIER,
                ads: agg.ads * VAT_MULTIPLIER,
                profit: agg.profit * VAT_MULTIPLIER
            };
        });

        return { totalRevenue, totalProfit, totalAdSpend, tacos, chartData };
    }, [processedDataWithToggle, dateRange, priceHistoryMap, products, pricingRules, platformScope]);

    return (
        <div className="space-y-6 pb-20 max-w-[1600px] mx-auto min-h-full flex flex-col">
            <TabSwitcher
                tabs={[
                    { key: 'actions', label: 'Decisions', icon: ShieldAlert },
                    { key: 'financials', label: 'Financials', icon: BarChart2 },
                    { key: 'map', label: 'Sales Map', icon: MapIcon },
                    { key: 'categories', label: 'Categories', icon: PieChart },
                ]}
                activeTab={activeTab}
                onChange={(key) => { setActiveTab(key as OverviewTab); setIsAuditVisible(false); setIsAuditPanelVisible(false); }}
            />

            <ContextBar
                timeOptions={[
                    { key: 'yesterday', label: 'Yesterday' },
                    { key: '7d', label: '7 Days' },
                    { key: '14d', label: '14 Days' },
                    { key: '30d', label: '30 Days' },
                    { key: '90d', label: '90 Days' },
                    { key: 'custom', label: 'Custom' }
                ]}
                activeWindow={range}
                onWindowChange={(key) => setRange(key as any)}
                periodLabel={periodLabel}
                customStart={customStart}
                customEnd={customEnd}
                onCustomStartChange={(val) => { setCustomStart(val); setRange('custom'); }}
                onCustomEndChange={(val) => { setCustomEnd(val); setRange('custom'); }}
                onCustomApply={() => { setRange('custom'); setShowDatePicker(false); }}
            >
                <SelectFilter
                    label="Platform"
                    options={Object.keys(pricingRules)}
                    selected={platformScope}
                    onChange={sel => setPlatformScope(sel)}
                    allLabel="Global View (All)"
                />
                <label className="flex items-center gap-2 px-3 h-8 bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:border-theme-20 transition-colors">
                    <input type="checkbox" checked={deductRefunds} onChange={e => setDeductRefunds(e.target.checked)} className="w-4 h-4 text-theme rounded focus:ring-theme border-gray-300" />
                    <div className="flex items-center gap-1.5"><RotateCcw className={`w-3.5 h-3.5 ${deductRefunds ? 'text-red-500' : 'text-gray-400'}`} /><span className={`text-[10px] font-bold uppercase tracking-tight ${deductRefunds ? 'text-gray-900' : 'text-gray-500'}`}>Deduct Returns</span></div>
                </label>
                {(activeTab === 'actions' || activeTab === 'financials' || activeTab === 'map') && (
                    <button onClick={() => setIsAuditPanelVisible(!isAuditPanelVisible)} className={`flex items-center gap-2 px-3 h-8 rounded-lg font-bold border transition-all shadow-sm text-xs ${isAuditPanelVisible ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}><Activity className="w-4 h-4" />Audit</button>
                )}
                {activeTab === 'categories' && (
                    <button onClick={() => setIsAuditVisible(v => !v)} className={`flex items-center gap-2 px-3 h-8 rounded-lg font-bold border transition-all shadow-sm text-xs ${isAuditVisible ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}><Activity className="w-4 h-4" />Audit{isAuditVisible ? ': On' : ''}</button>
                )}
            </ContextBar>

            {isAuditPanelVisible && (
                <div className="mb-4">
                    <AuditPanel title="Overview Data Quality" startKey={startKey} endKey={endKey} rows={processedData} getDateKey={() => null} getRevenue={(row: any) => row.periodRevenue / VAT_MULTIPLIER} getQty={(row: any) => row.periodUnits} getProfit={(row: any) => row.periodProfit / VAT_MULTIPLIER} getAdSpend={(row: any) => row.periodAdSpend / VAT_MULTIPLIER} distinctDaysCount={distinctDaysFound} />
                </div>
            )}

            <div className="flex-1 min-h-0 relative">
                {activeTab === 'actions' && (
                    <div className="space-y-6">
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
                                        ) : selectedAlert && typeof selectedAlert === 'string' ? (
                                            <><Activity className="w-4 h-4 text-theme" /> Decision Panel: {(selectedAlert as string).charAt(0).toUpperCase() + (selectedAlert as string).slice(1)}</>
                                        ) : (
                                            <><Activity className="w-4 h-4 text-theme" /> Executive Workbench</>
                                        )}
                                    </h3>
                                    <span className="text-xs text-gray-500">{workbenchData.length} items requiring action</span>
                                </div>
                                <button onClick={() => { }} className="p-2 hover:bg-gray-200/50 rounded-lg text-gray-500 hover:text-gray-700 transition-colors border border-transparent hover:border-gray-200"><Download className="w-4 h-4" /></button>
                            </div>
                            <div className="flex-1 overflow-auto">
                                <table className="tbl w-full text-left text-sm whitespace-nowrap border-separate border-spacing-0">
                                    <thead className="sticky top-0">
                                        {selectedAlert === 'margin' ? (
                                        <tr className="bg-gray-50/80 border-b border-gray-200/50 text-xs uppercase tracking-wider text-gray-600 font-semibold backdrop-blur-sm shadow-sm">
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Detail</th>
                                                <SortableHeader label="SKU / Title" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                                                <SortableHeader label="CA Price" sortKey="caPrice" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="text-purple-600" />
                                                <SortableHeader label="Actual Margin" sortKey="margin" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Recent Qty" sortKey="qtySold" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Revenue" sortKey="revenue" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Net Profit" sortKey="profit" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-left">Cause</th>
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right pr-6">Recommend</th>
                                            </tr>
                                        ) : selectedAlert === 'velocity' ? (
                                        <tr className="bg-gray-50/80 border-b border-gray-200/50 text-xs uppercase tracking-wider text-gray-600 font-semibold backdrop-blur-sm shadow-sm">
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Detail</th>
                                                <SortableHeader label="SKU / Title" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                                                <SortableHeader label="Drop #" sortKey="volumeDrop" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Drop %" sortKey="volumeDrop" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Period Qty" sortKey="qtySold" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right group/header relative">
                                                    <div className="flex items-center justify-end gap-1 cursor-help">
                                                        Baseline Qty
                                                        <Info className="w-3 h-3 text-gray-400" />
                                                    </div>
                                                    <div className="absolute top-full right-0 mt-2 w-64 bg-gray-900 text-white text-[10px] rounded-lg px-2 py-1 shadow-lg opacity-0 group-hover/header:opacity-100 transition-all pointer-events-none z-50 border border-gray-700 animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <div className="font-bold border-b border-gray-700 pb-1 mb-1 uppercase tracking-tight flex items-center justify-center gap-1.5">
                                                            <Calculator className="w-3 h-3 text-theme" /> Calculation Logic
                                                        </div>
                                                        <div className="leading-relaxed text-center normal-case font-medium whitespace-normal">
                                                            Projected volume based on <span className="font-bold">Median Daily Sales</span> x <span className="font-bold">{expectedDays} days</span> window.
                                                        </div>
                                                    </div>
                                                </th>
                                                <SortableHeader label="Price" sortKey="price" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Hist. Price</th>
                                                <SortableHeader label="Inventory" sortKey="inventory" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Price Adj." sortKey="priceChanges" sort={sort} onChange={setSort} themeColor={themeColor} align="center" />
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right pr-6">CTA / Justification</th>
                                            </tr>
                                        ) : selectedAlert === 'stock' ? (
                                        <tr className="bg-gray-50/80 border-b border-gray-200/50 text-xs uppercase tracking-wider text-gray-600 font-semibold backdrop-blur-sm shadow-sm">
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Detail</th>
                                                <SortableHeader label="SKU / Title" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                                                <SortableHeader label="Runway (Days)" sortKey="runway" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Lead Time" sortKey="leadTime" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right group/header relative">
                                                    <div className="flex items-center justify-end gap-1 cursor-help">
                                                        Global Velocity
                                                        <Info className="w-3 h-3 text-gray-400" />
                                                    </div>
                                                    <div className="absolute top-full right-0 mt-2 w-64 bg-gray-900 text-white text-[10px] rounded-lg px-2 py-1 shadow-lg opacity-0 group-hover/header:opacity-100 transition-all pointer-events-none z-50 border border-gray-700 animate-in fade-in slide-in-from-top-2 duration-200">
                                                        <div className="font-bold border-b border-gray-700 pb-1 mb-1 uppercase tracking-tight flex items-center justify-center gap-1.5">
                                                            <Calculator className="w-3 h-3 text-theme" /> Data Source
                                                        </div>
                                                        <div className="leading-relaxed text-center normal-case font-medium whitespace-normal">
                                                            Prioritizes <span className="font-bold">ERP Daily Sales</span> if available, else calculates from imported history.
                                                        </div>
                                                    </div>
                                                </th>
                                                <SortableHeader label="Stock (Min 2)" sortKey="inventory" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right pr-6">Action / Continuity Strategy</th>
                                            </tr>
                                        ) : selectedAlert === 'dead' ? (
                                        <tr className="bg-gray-50/80 border-b border-gray-200/50 text-xs uppercase tracking-wider text-gray-600 font-semibold backdrop-blur-sm shadow-sm">
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Detail</th>
                                                <SortableHeader label="SKU / Title" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                                                <SortableHeader label="Inventory Units" sortKey="inventory" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Inventory Value" sortKey="inventoryValue" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Days Since Sale" sortKey="daysSinceLastSale" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Median Demand</th>
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right pr-6">Action</th>
                                            </tr>
                                        ) : (
                                        <tr className="bg-gray-50/80 border-b border-gray-200/50 text-xs uppercase tracking-wider text-gray-600 font-semibold backdrop-blur-sm shadow-sm">
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-center">Action</th>
                                                <SortableHeader label="Product" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-left">Signals</th>
                                                <SortableHeader label="Price (Inc VAT)" sortKey="price" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Sales" sortKey="revenue" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Net Margin %" sortKey="margin" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                                <SortableHeader label="Inventory" sortKey="inventory" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                                            </tr>
                                        )}
                                    </thead>
                                    <tbody>
                                        {paginatedData.map(p => {
                                            if (selectedAlert === 'velocity') {
                                                const priceDiff = p.displayPrice - p.historicalMedianPrice;
                                                const isPriceHigh = priceDiff > 0.05;

                                                const hasRecentPriceIncrease = p.changesInPeriod.some(c => c.changeType === 'INCREASE');

                                                // CTA and Justification
                                                let ctaText = isPriceHigh ? "Review Price Positioning" : "Consider Promotion";
                                                let justification = isPriceHigh
                                                    ? `Price is currently ${formatSmartMoney(Math.abs(priceDiff))} above historical median (${formatSmartMoney(p.historicalMedianPrice)})`
                                                    : `Velocity is down ${Math.abs(p.volumeDropPct).toFixed(0)}% despite baseline pricing`;

                                                if (hasRecentPriceIncrease) {
                                                    ctaText = "Monitor Intentional Slowdown";
                                                    justification = `Price increase detected in period. Slowdown likely deliberate to protect stockout.`;
                                                }

                                                return (
                                                    <tr key={p.id} className="group text-sm">
                                                        <td className="p-4 text-center">
                                                            <button onClick={() => onDeepDive(p.sku)} className="p-1.5 text-gray-400 hover:text-theme hover:bg-theme-10 rounded-lg transition-colors">
                                                                <Search className="w-4 h-4" />
                                                            </button>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="font-bold text-gray-900 flex items-center">
                                                                {p.sku}
                                                                <GradeBadge gradeLevel={p.gradeLevel} />
                                                                {p.inPromotion && (
                                                                    <span className="ml-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-theme-10 text-theme border border-theme-20 flex items-center gap-1">
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
                                                            <MetricValue value={p.volumeDropPct} type="percent" />
                                                        </td>
                                                        <td className="p-4 text-right text-gray-700 font-semibold">{formatNumber(p.periodUnits)}</td>
                                                        <td className="p-4 text-right text-gray-400 font-medium">{formatNumber(p.historicalMedianUnits, 0)}</td>
                                                        <td className="p-4 text-right">
                                                            <span className={isPriceHigh ? 'text-amber-500 font-semibold' : 'text-gray-700 font-semibold'}>
                                                                <MetricValue value={p.displayPrice} type="currency" neutral />
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-right text-gray-400 font-medium">{formatSmartMoney(p.historicalMedianPrice)}</td>
                                                        <td className={`p-4 text-right ${p.stockLevel < thresholds.minAbsoluteFloor ? 'text-amber-500 font-semibold' : 'text-gray-700 font-semibold'}`}>{formatNumber(p.stockLevel)}</td>

                                                        {/* Price Changes Column - Tooltip restricted to hover on this badge only */}
                                                        <td className="p-4 text-center">
                                                            <div className="group/tooltip relative inline-block">
                                                                <div className={`flex items-center gap-1 px-2 py-1 rounded-lg border font-bold text-xs transition-colors cursor-help ${p.priceChangeCount > 0 ? 'bg-theme-10 text-theme border-theme-20' : 'bg-gray-50 text-gray-300 border-gray-100'}`}>
                                                                    <History className="w-3 h-3" />
                                                                    {p.priceChangeCount}
                                                                </div>
                                                                 {p.priceChangeCount > 0 && (
                                                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 bg-gray-900 text-white text-[10px] rounded-lg px-2 py-1 shadow-lg opacity-0 group-hover/tooltip:opacity-100 transition-all pointer-events-none z-50 border border-gray-700 animate-in fade-in slide-in-from-bottom-2 duration-200">
                                                                        <div className="font-bold border-b border-gray-700 pb-1 mb-1 uppercase tracking-tight flex justify-between items-center">
                                                                            <span>Recent Changes</span>
                                                                            <History className="w-3 h-3" />
                                                                        </div>
                                                                        <div className="space-y-1">
                                                                            {p.changesInPeriod.slice(0, 5).map(c => (
                                                                                <div key={c.id} className="flex justify-between items-center gap-3">
                                                                                    <span className="text-gray-400">{new Date(c.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</span>
                                                                                    <div className="flex items-center gap-2">
                                                                                        <span className="font-mono">{formatSmartMoney(c.oldPrice)} → {formatSmartMoney(c.newPrice)}</span>
                                                                                        <span className={`${(c.changeType || (c.newPrice > c.oldPrice ? 'INCREASE' : 'DECREASE')) === 'INCREASE' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                                                            {(c.changeType || (c.newPrice > c.oldPrice ? 'INCREASE' : 'DECREASE')) === 'INCREASE' ? '↑' : '↓'}{(c.percentChange ?? (c.oldPrice > 0 ? ((c.newPrice - c.oldPrice) / c.oldPrice) * 100 : 0)).toFixed(1)}%
                                                                                        </span>
                                                                                    </div>
                                                                                </div>
                                                                            ))}
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </td>

                                                        <td className="p-4 text-right pr-6">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-[11px] font-black uppercase text-theme tracking-wider bg-theme-10 px-2 py-0.5 rounded border border-indigo-100">{ctaText}</span>
                                                                <span className="text-[11px] text-gray-600 mt-1 font-medium leading-relaxed max-w-[280px] break-words whitespace-normal text-right">{justification}</span>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            if (selectedAlert === 'stock') {
                                                const isArrivalDriven = p.daysToArrival < 999;
                                                return (
                                                    <tr key={p.id} className="group text-sm">
                                                        <td className="p-4 text-center">
                                                            <button onClick={() => onDeepDive(p.sku)} className="p-1.5 text-gray-400 hover:text-theme hover:bg-theme-10 rounded-lg transition-colors">
                                                                <Search className="w-4 h-4" />
                                                            </button>
                                                        </td>
                                                        <td className="p-4">
                                                            <div className="font-bold text-gray-900 flex items-center">
                                                                {p.sku}
                                                                <GradeBadge gradeLevel={p.gradeLevel} />
                                                                {p.inPromotion && (
                                                                    <span className="ml-2 px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-theme-10 text-theme border border-theme-20 flex items-center gap-1">
                                                                        <Zap className="w-2 h-2" /> Live Promo
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-xs text-gray-500 truncate max-w-[250px]">{p.name}</div>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <span className={`font-semibold text-sm px-2 py-1 rounded ${p.periodRunway < p.effectiveAlertLeadTime ? 'bg-red-100 text-red-500 border border-red-200' : 'bg-amber-100 text-amber-500 border border-amber-200'}`}>
                                                                {p.periodRunway.toFixed(0)} Days
                                                            </span>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <div className="flex flex-col items-end">
                                                                <span className="text-gray-700 font-semibold">{p.effectiveAlertLeadTime} Days</span>
                                                                <span className="text-[10px] text-gray-400 uppercase font-bold">{isArrivalDriven ? 'Arrival ETA' : 'No Shipment'}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-right text-gray-700 font-semibold">
                                                            {formatNumber(p.periodDailyVelocity, 1)} /day
                                                        </td>
                                                        <td className={`p-4 text-right ${p.stockLevel < (thresholds.minAbsoluteFloor || 2) ? 'text-amber-500 font-semibold' : 'text-gray-700 font-semibold'}`}>
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
                                                    <tr key={p.id} className="group text-sm">
                                                        <td className="p-4 text-center">
                                                            <button onClick={() => onDeepDive(p.sku)} className="p-1.5 text-gray-400 hover:text-theme hover:bg-theme-10 rounded-lg transition-colors">
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
                                                        <td className="p-4 text-right text-gray-700 font-semibold">
                                                            {formatNumber(p.stockLevel)}
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <MetricValue value={p.inventoryValue} type="currency" neutral />
                                                        </td>
                                                        <td className={`p-4 text-right font-semibold ${p.daysSinceLastSale > 60 ? 'text-red-500' : 'text-gray-700'}`}>
                                                            {p.daysSinceLastSale === 999 ? 'No Sales' : `${p.daysSinceLastSale} days`}
                                                        </td>
                                                        <td className="p-4 text-right text-gray-400 font-medium">
                                                            {p.historicalMedianDemand.toFixed(1)} /day
                                                        </td>
                                                        <td className="p-4 text-right pr-6">
                                                            <span className="text-[11px] font-black uppercase text-amber-700 tracking-wider bg-amber-50 px-2 py-0.5 rounded border border-amber-100 shadow-sm">{cta}</span>
                                                        </td>
                                                    </tr>
                                                );
                                            }

                                            return (
                                                <tr key={p.id} className="group text-sm">
                                                    {selectedAlert === 'margin' ? (
                                                        <>
                                                            <td className="p-4 text-center">
                                                                <button onClick={() => onDeepDive(p.sku)} className="p-1.5 text-gray-400 hover:text-theme hover:bg-theme-10 rounded-lg transition-colors">
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
                                                                {p.caPrice ? formatSmartMoney(p.caPrice) : '—'}
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <MetricValue value={p.periodMargin} type="percent" />
                                                            </td>
                                                            <td className="p-4 text-right text-gray-700 font-semibold">
                                                                {formatNumber(p.periodUnits)}
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <MetricValue value={p.periodRevenue} type="currency" neutral />
                                                            </td>
                                                            <td className="p-4 text-right">
                                                                <MetricValue value={p.periodProfit} type="currency" />
                                                            </td>
                                                            <td className="p-4">
                                                                <div className="flex items-center gap-2 group relative inline-block">
                                                                    <span className={`sello-badge ${
                                                                        p.primaryDrag === 'Ad Spend Heavy' ? 'badge-purple' :
                                                                        p.primaryDrag === 'Heavy Returns' ? 'badge-red' :
                                                                        p.primaryDrag === 'Selling at a Loss' ? 'badge-red' :
                                                                        p.primaryDrag === 'Price Below Master' ? 'badge-indigo' :
                                                                        p.primaryDrag === 'High Returns' ? 'badge-orange' :
                                                                        p.primaryDrag === 'Margin Compression' ? 'badge-amber' :
                                                                        'badge-gray'
                                                                    }`}>
                                                                        {p.primaryDrag}
                                                                    </span>
                                                                     <div className="absolute left-0 top-full mt-1 w-64 bg-gray-900 text-white text-[10px] rounded-lg px-2 py-1 shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none border border-gray-700">
                                                                        <div className="font-bold border-b border-gray-700 pb-1 mb-1 uppercase tracking-tight">Cost Breakdown (Ex VAT)</div>
                                                                        <div className="space-y-0.5">
                                                                            <div className="flex justify-between"><span>Unit Revenue:</span><span>{formatSmartMoney(p.displayPrice)}</span></div>
                                                                            <div className="flex justify-between text-orange-400"><span>Ad Cost:</span><span>-{formatSmartMoney((p.adsFee || 0), 2)} ({formatPct(p.tacos)})</span></div>
                                                                            <div className="flex justify-between text-red-400"><span>Refund Impact:</span><span>-{formatSmartMoney((p.refundRateValue / 100 * p.displayPrice), 2)}</span></div>
                                                                            <div className="flex justify-between text-gray-400"><span>COGS + Ops:</span><span>-{formatSmartMoney((p.costPrice || 0) + (p.postage || 0) + (p.wmsFee || 0), 2)}</span></div>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 text-right pr-6">
                                                                <div className="flex flex-col items-end">
                                                                    <span className={`sello-badge ${
                                                                        p.suggestedAction?.toLowerCase().includes('urgent') ? 'badge-red' :
                                                                        p.suggestedAction?.toLowerCase().includes('optimize') ? 'badge-purple' :
                                                                        p.suggestedAction?.toLowerCase().includes('investigate') ? 'badge-orange' :
                                                                        p.suggestedAction?.toLowerCase().includes('raise') || p.suggestedAction?.toLowerCase().includes('increase') ? 'badge-indigo' :
                                                                        'badge-gray'
                                                                    }`}>
                                                                        {p.suggestedAction}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <td className="p-4 text-center"><button onClick={() => onDeepDive(p.sku)} className="p-1.5 text-gray-400 hover:text-theme hover:bg-theme-10 rounded-lg transition-colors"><Search className="w-4 h-4" /></button></td>
                                                            <td className="p-4"><div className="font-medium text-gray-900 group-hover:text-theme transition-colors flex items-center">{p.sku}<GradeBadge gradeLevel={p.gradeLevel} /></div><div className="text-xs text-gray-500 truncate max-w-[250px]">{p.name}</div></td>
                                                            <td className="p-4"><div className="flex flex-wrap gap-1 max-w-[140px]">{p.signals.slice(0, 2).map((id: string) => { const meta = getDiagnosisMeta(id as CanonicalDiagnosisId); return <span key={id} onClick={() => onDeepDive(p.sku)} className={`text-[10px] px-1.5 py-0.5 rounded border font-medium cursor-pointer hover:opacity-80 ${meta.priority === 'High' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`} title={meta.description}>{meta.shortLabel}</span> })}</div></td>
                                                            <td className="p-4 text-right text-gray-700">{formatSmartMoney((p.displayPrice * VAT_MULTIPLIER))}</td>
                                                            <td className="p-4 text-right text-gray-600">{formatSmartMoney(p.periodRevenue)}</td>
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
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <MetricCard title="Total Revenue" value={`£${financialStats.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={DollarSign} color="blue" />
                            <MetricCard
                                title="True Net Profit"
                                value={<span className={financialStats.totalProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}>{financialStats.totalProfit < 0 ? '-' : ''}£{Math.abs(financialStats.totalProfit).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                                icon={Coins}
                                color={financialStats.totalProfit >= 0 ? "green" : "red"}
                            />
                            <MetricCard title="Total Ad Spend" value={`£${financialStats.totalAdSpend.toLocaleString(undefined, { maximumFractionDigits: 0 })}`} icon={Megaphone} color="purple" desc="Includes Ad-Only Transactions" />
                            <MetricCard
                                title="TACoS %"
                                value={<span className={financialStats.tacos > 20 ? 'text-amber-500' : 'text-gray-800'}>{financialStats.tacos.toFixed(1)}%</span>}
                                icon={BarChart2}
                                color="orange"
                                desc="Total Advertising Cost of Sales"
                            />
                        </div>
                        <div className="bg-custom-glass p-5 rounded-xl border border-custom-glass shadow-sm flex flex-col h-[500px]">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2"><Activity className="w-4 h-4 text-blue-600" /> Financial Performance</h3>
                            <div className="flex-1 min-0"><ResponsiveContainer width="100%" height="100%"><ComposedChart data={financialStats.chartData}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" /><XAxis dataKey="day" tick={{ fontSize: 10 }} /><YAxis yAxisId="left" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(val) => `£${val.toLocaleString()}`} label={{ value: 'Revenue', angle: -90, position: 'insideLeft', style: { fill: '#93c5fd', fontWeight: 'bold', fontSize: 12 } }} /><YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: '#6b7280' }} tickFormatter={(val) => `£${val.toLocaleString()}`} label={{ value: 'Profit & Ads', angle: 90, position: 'insideRight', style: { fill: '#8b5cf6', fontWeight: 'bold', fontSize: 12 } }} /><RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }} formatter={(value: number) => '£' + value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} /><Legend wrapperStyle={{ fontSize: '12px' }} /><Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#93c5fd" barSize={20} radius={[4, 4, 0, 0]} /><Line yAxisId="right" type="monotone" dataKey="ads" name="Ad Spend" stroke="#8b5cf6" strokeWidth={2} dot={false} /><Line yAxisId="right" type="monotone" dataKey="profit" name="Net Profit" stroke="#10b981" strokeWidth={2} dot={false} /></ComposedChart></ResponsiveContainer></div>
                        </div>
                    </div>
                )}
                {activeTab === 'map' && (<div className="h-auto"><UkSalesMap products={products} priceHistoryMap={priceHistoryMap} dateRange={dateRange} selectedPlatform={platformScope.length === 1 ? platformScope[0] : 'All'} themeColor={themeColor} refundHistory={refundHistory} deductRefunds={deductRefunds} onSearch={onSearch} timePeriodLabel={periodLabel} externalConfig={mapJumpState} /></div>)}
                {activeTab === 'categories' && (
                    <div className="space-y-4 pb-24 h-auto">

                        {isAuditVisible && (
                            <div className="">
                                <AuditPanel
                                    title="Categories Performance Audit"
                                    startKey={asDateKey(dateRange.start) || ''}
                                    endKey={asDateKey(dateRange.end) || ''}
                                    rows={categoryData}
                                    getDateKey={() => null}
                        distinctDaysCount={startKey && endKey ? Math.round((new Date(endKey).getTime() - new Date(startKey).getTime()) / 86400000) + 1 : 0}
                                    getRevenue={(row) => row.total.revenue}
                                    getQty={() => 0}
                                    getProfit={() => 0}
                                    getAdSpend={() => 0}
                                />
                            </div>
                        )}

                        <CategoryPerformanceSlide
                            products={products}
                            priceHistoryMap={priceHistoryMap}
                            dateRange={dateRange}
                            themeColor={themeColor}
                            refundHistory={refundHistory}
                            deductRefunds={deductRefunds}
                            platformScope={platformScope}
                        />
                    </div>
                )}
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

export const OverviewPageContainer = React.memo(OverviewPageContainerInner);

export default OverviewPageContainer;
