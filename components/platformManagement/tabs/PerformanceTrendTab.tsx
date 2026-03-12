
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Trophy, BellRing, X, Settings, Plus, Layers, TrendingUp, RotateCcw, BarChart as BarChartIcon, ArrowUpRight, ArrowDownRight, Activity, Minus, Medal, Info, ArrowUp, ArrowDown, LayoutGrid, Maximize2, Sparkles, Search } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ReferenceArea, BarChart, Bar, Cell, ReferenceLine, AreaChart, Area } from 'recharts';
import { formatSmartMoney, formatNumber, formatPct } from '../../../utils/format';
import { Tab3AlertRules } from '../../../services/platformAlertRules';
import { PlatformTrendData } from '../../../services/platformTrendAgg';
import { Flag } from '../platformManagement.types';
import { SortState, sortRows } from '../../../utils/tableSort';
import { SortableHeader } from '../../common/SortableHeader';
import { SelectFilter } from '../../common/SelectFilter';
import AuditPanel from '../../AuditPanel';
import { FilterBar } from '../../common/FilterBar';

interface PerformanceTrendTabProps {
    trendData: PlatformTrendData[];
    performanceSummary: any;
    timeWindow: string;
    alertRules: Tab3AlertRules;
    setAlertRules: (rules: Tab3AlertRules) => void;
    uniquePlatforms: string[];
    selectedChartPlatforms: string[];
    setSelectedChartPlatforms: (platforms: string[]) => void;
    platformGroups: any[];
    setPlatformGroups: (groups: any[]) => void;
    isGroupCreatorOpen: boolean;
    setIsGroupCreatorOpen: (v: boolean) => void;
    newGroupName: string;
    setNewGroupName: (name: string) => void;
    newGroupPlatforms: string[];
    setNewGroupPlatforms: (platforms: string[]) => void;
    handleCreateGroup: () => void;
    deleteGroup: (id: string) => void;
    toggleNewGroupPlatform: (p: string) => void;
    trendMetric: string;
    setTrendMetric: (m: any) => void;
    zoomState: any;
    handleResetZoom: () => void;
    visibleChartData: any[];
    setRefAreaLeft: (val: string) => void;
    setRefAreaRight: (val: string) => void;
    refAreaLeft: string;
    refAreaRight: string;
    zoom: () => void;
    handleLegendClick: (o: any) => void;
    hiddenSeries: Set<string>;
    pricingRules: any;
    barChartData: any[];
    startKey?: string;
    endKey?: string;
    isAuditVisible: boolean;
}

const SummaryCard = ({ title, platform, delta, value, type }: { title: string, platform?: string, delta?: number | null, value?: number, type: 'pos' | 'neg' | 'info' }) => {
    const Icon = type === 'pos' ? ArrowUpRight : type === 'neg' ? ArrowDownRight : Activity;
    const colorClass = type === 'pos' ? 'text-emerald-600' : type === 'neg' ? 'text-red-500' : 'text-indigo-600';
    const bgClass = type === 'pos' ? 'bg-green-50' : type === 'neg' ? 'bg-red-50' : 'bg-indigo-50';

    return (
        <div className="bg-custom-glass backdrop-blur-custom p-3.5 rounded-xl border border-custom-glass shadow-sm flex items-start justify-between min-w-0">
            <div className="min-w-0 flex-1">
                <span className="text-[10px] font-medium text-gray-400 uppercase block mb-1 truncate">{title}</span>
                <div className="font-medium text-gray-900 truncate text-sm">
                    {platform || '—'}
                </div>
                <div className={`text-xs font-medium mt-1 flex items-center gap-1 ${colorClass}`}>
                    {delta !== undefined && delta !== null ? (
                        <>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                        </>
                    ) : value !== undefined ? (
                        formatSmartMoney(value)
                    ) : '—'}
                </div>
            </div>
            <div className={`p-1.5 rounded-lg shrink-0 ml-3 ${bgClass} ${colorClass}`}>
                <Icon className="w-4 h-4" />
            </div>
        </div>
    );
};

const TrendDeltaPill = ({ value, isPp = false, invert = false }: { value: number | null, isPp?: boolean, invert?: boolean }) => {
    if (value === null || !isFinite(value)) return <span className="text-[10px] text-gray-400">New</span>;
    if (Math.abs(value) < 0.1) return <Minus className="w-3 h-3 text-gray-300" />;

    const isPositive = value > 0;
    const isGood = invert ? !isPositive : isPositive;
    const colorClass = isGood ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-red-500 bg-red-50 border-red-200';

    return (
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${colorClass}`}>
            {isPositive ? '+' : ''}{value.toFixed(1)}{isPp ? 'pp' : '%'}
        </span>
    );
};


export const PerformanceTrendTab: React.FC<PerformanceTrendTabProps> = ({
    trendData,
    performanceSummary,
    timeWindow,
    alertRules,
    setAlertRules,
    uniquePlatforms,
    selectedChartPlatforms,
    setSelectedChartPlatforms,
    platformGroups,
    setPlatformGroups,
    isGroupCreatorOpen,
    setIsGroupCreatorOpen,
    newGroupName,
    setNewGroupName,
    newGroupPlatforms,
    setNewGroupPlatforms,
    handleCreateGroup,
    deleteGroup,
    toggleNewGroupPlatform,
    trendMetric,
    setTrendMetric,
    zoomState,
    handleResetZoom,
    visibleChartData,
    setRefAreaLeft,
    setRefAreaRight,
    refAreaLeft,
    refAreaRight,
    zoom,
    handleLegendClick,
    hiddenSeries,
    pricingRules,
    barChartData,
    startKey = '',
    endKey = '',
    isAuditVisible,
}) => {
    const [isAlertRulesOpen, setIsAlertRulesOpen] = useState(false);
    const [chartViewMode, setChartViewMode] = useState<'OVERLAY' | 'TRELLIS'>('OVERLAY');
    const [hoveredPlatform, setHoveredPlatform] = useState<string | null>(null);
    const [isSmoothed, setIsSmoothed] = useState(true);
    const [tableSort, setTableSort] = useState<SortState<string>>({ key: 'revenue', dir: 'desc' });

    // --- SMOOTHING LOGIC (7-Day Rolling Average) ---
    const smoothedChartData = useMemo(() => {
        if (!isSmoothed || visibleChartData.length === 0) return visibleChartData;

        return visibleChartData.map((day, idx, arr) => {
            const smoothedDay = { ...day };
            const windowSize = 7;
            const startIdx = Math.max(0, idx - Math.floor(windowSize / 2));
            const endIdx = Math.min(arr.length - 1, idx + Math.floor(windowSize / 2));
            const actualWindow = arr.slice(startIdx, endIdx + 1);

            const keysToSmooth = [
                ...selectedChartPlatforms.map(p => `${p}_${trendMetric}`),
                ...platformGroups.map(g => `${g.name}_${trendMetric}`)
            ];

            keysToSmooth.forEach(key => {
                const values = actualWindow.map(d => d[key]).filter(v => v !== undefined && v !== null);
                if (values.length > 0) {
                    smoothedDay[key] = values.reduce((a, b) => a + b, 0) / values.length;
                }
            });

            return smoothedDay;
        });
    }, [visibleChartData, isSmoothed, selectedChartPlatforms, platformGroups, trendMetric]);

    // --- ENHANCED MATRIX LOGIC ---
    const portfolioAverages = useMemo(() => {
        if (trendData.length === 0) return null;

        const sumCurrent = { rev: 0, profit: 0, units: 0, orders: 0, adSpend: 0, refundValue: 0 };
        const sumPrior = { rev: 0, profit: 0, units: 0, orders: 0, adSpend: 0, refundValue: 0 };

        trendData.forEach(d => {
            sumCurrent.rev += d.current.revenue;
            sumCurrent.profit += d.current.netProfit;
            sumCurrent.units += d.current.unitsSold;
            sumCurrent.orders += d.current.orders;
            sumCurrent.adSpend += d.current.adSpend;
            sumCurrent.refundValue += d.current.refundValue;

            sumPrior.rev += d.prior.revenue;
            sumPrior.profit += d.prior.netProfit;
            sumPrior.units += d.prior.unitsSold;
            sumPrior.orders += d.prior.orders;
            sumPrior.adSpend += d.prior.adSpend;
            sumPrior.refundValue += d.prior.refundValue;
        });

        const currentMargin = sumCurrent.rev > 0 ? (sumCurrent.profit / sumCurrent.rev) * 100 : 0;
        const priorMargin = sumPrior.rev > 0 ? (sumPrior.profit / sumPrior.rev) * 100 : 0;

        const currentTacos = sumCurrent.rev > 0 ? (sumCurrent.adSpend / sumCurrent.rev) * 100 : 0;
        const priorTacos = sumPrior.rev > 0 ? (sumPrior.adSpend / sumPrior.rev) * 100 : 0;

        const currentRefundRate = sumCurrent.rev > 0 ? (sumCurrent.refundValue / sumCurrent.rev) * 100 : 0;
        const priorRefundRate = sumPrior.rev > 0 ? (sumPrior.refundValue / sumPrior.rev) * 100 : 0;

        return {
            revenue: sumCurrent.rev,
            revenueDelta: sumPrior.rev > 0 ? ((sumCurrent.rev - sumPrior.rev) / sumPrior.rev) * 100 : 0,
            margin: currentMargin,
            marginDelta: currentMargin - priorMargin,
            tacos: currentTacos,
            tacosDelta: currentTacos - priorTacos,
            refundRate: currentRefundRate,
            refundRateDelta: currentRefundRate - priorRefundRate,
            unitsDelta: sumPrior.units > 0 ? ((sumCurrent.units - sumPrior.units) / sumPrior.units) * 100 : 0
        };
    }, [trendData]);

    const globalTrendLine = useMemo(() => {
        if (!smoothedChartData.length) return [];
        return smoothedChartData.map(day => {
            let sumVal = 0;
            let count = 0;
            uniquePlatforms.forEach(p => {
                const val = day[`${p}_${trendMetric}`];
                if (val !== undefined) {
                    sumVal += val;
                    count++;
                }
            });
            return { date: day.date, avg: count > 0 ? sumVal / count : 0 };
        });
    }, [smoothedChartData, uniquePlatforms, trendMetric]);

    const rankedPlatforms = useMemo(() => {
        const currentRanked = [...trendData].sort((a, b) => b.current.revenue - a.current.revenue);
        const priorRanked = [...trendData].sort((a, b) => b.prior.revenue - a.prior.revenue);

        const ranked = currentRanked.map((item, idx) => {
            const currentPos = idx + 1;
            const priorIdx = priorRanked.findIndex(p => p.platform === item.platform);
            const priorPos = priorIdx !== -1 ? priorIdx + 1 : currentPos;
            const shift = priorPos - currentPos;
            return { ...item, currentPos, shift };
        });

        // Apply UI Sorting
        const getValue = (row: any, key: string) => {
            switch (key) {
                case 'name': return row.platform;
                case 'rank': return row.currentPos;
                case 'revenue': return row.current.revenue;
                case 'margin': return row.current.marginPct;
                case 'tacos': return row.current.tacosPct;
                case 'refunds': return row.current.refundRatePct;
                default: return 0;
            }
        };

        return sortRows(ranked, tableSort, getValue);
    }, [trendData, tableSort]);

    const CustomTrendTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length) return null;
        return (
            <div className="bg-gray-900/95 backdrop-blur-md border border-gray-700 p-3 rounded-xl shadow-2xl text-white min-w-[220px] pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-gray-700 pb-2 mb-2"><span className="font-medium text-xs">{new Date(label).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span><span className="text-[9px] text-gray-400 font-medium uppercase tracking-widest bg-white/50 px-1.5 py-0.5 rounded">{trendMetric.replace(/_/g, ' ')}</span></div>
                <div className="space-y-2">
                    {[...payload].sort((a: any, b: any) => b.value - a.value).map((entry: any, i: number) => {
                        const platformName = entry.name; const color = entry.color; const value = entry.value;
                        const platformTrend = trendData.find((t: any) => t.platform === platformName);
                        let delta = null;
                        if (platformTrend) {
                            if (trendMetric === 'NET_PROFIT') delta = platformTrend.deltas.netProfitDeltaPct;
                            if (trendMetric === 'UNITS_SOLD') delta = platformTrend.deltas.unitsDeltaPct;
                            if (trendMetric === 'MARGIN_PCT') delta = platformTrend.deltas.marginDeltaPp;
                            if (trendMetric === 'AVG_ORDER_VALUE') delta = platformTrend.deltas.avgOrderValueDeltaPct;
                        }
                        return (
                            <div key={i} className={`flex items-center justify-between gap-4 transition-opacity ${hoveredPlatform && hoveredPlatform !== platformName ? 'opacity-30' : 'opacity-100'}`}><div className="flex items-center gap-2 min-w-0"><div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} /><span className="text-[11px] font-medium truncate opacity-90">{platformName}</span></div><div className="flex items-center gap-2 shrink-0"><span className="text-[11px] font-mono font-medium">{trendMetric === 'MARGIN_PCT' ? value.toFixed(1) + '%' : trendMetric === 'UNITS_SOLD' ? formatNumber(value) : formatSmartMoney(value)}</span>{delta !== null && isFinite(delta) && (<span className={`text-[9px] font-medium px-1 rounded-sm ${delta >= 0 ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>{trendMetric === 'MARGIN_PCT' ? (delta > 0 ? '+' : '') : (delta > 0 ? '↑' : '↓')}{Math.abs(delta).toFixed(0)}{trendMetric === 'MARGIN_PCT' ? 'pp' : '%'}</span>)}</div></div>
                        );
                    })}
                </div>
                <div className="mt-2 pt-2 border-t border-gray-700/50 flex justify-center"><span className="text-[8px] text-gray-500 italic uppercase">Percentages represent period delta</span></div>
            </div>
        );
    };

    const metricLabels: Record<string, string> = {
        NET_PROFIT: 'Net Profit',
        MARGIN_PCT: 'Profit Margin',
        AVG_ORDER_VALUE: 'Average Order Amount',
        UNITS_SOLD: 'Unit Sold'
    };

    const formatYAxis = (val: number) => {
        if (trendMetric === 'MARGIN_PCT') return `${val}%`;
        if (trendMetric === 'UNITS_SOLD') return formatNumber(val);
        return `£${val.toLocaleString()}`;
    };

    // Helper for Trellis view gradient IDs (Sanitized for SVG URL references)
    const sanitizeId = (name: string) => name.replace(/[^a-zA-Z0-9]/g, '_');

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {isAuditVisible && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <AuditPanel
                        title="Platform Performance Audit"
                        startKey={startKey}
                        endKey={endKey}
                        rows={trendData}
                        getDateKey={() => null}
                        getRevenue={(row: any) => row.current.revenue}
                        getQty={(row: any) => row.current.unitsSold}
                        getProfit={(row: any) => row.current.netProfit}
                        getAdSpend={(row: any) => row.current.adSpend}
                    />
                </div>
            )}

            <div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
                    <SummaryCard title="Biggest Revenue Gainer" platform={performanceSummary?.gainer?.platform} delta={performanceSummary?.gainer?.deltas.revenueDeltaPct} type="pos" />
                    <SummaryCard title="Biggest Revenue Loser" platform={performanceSummary?.loser?.platform} delta={performanceSummary?.loser?.deltas.revenueDeltaPct} type="neg" />
                    <SummaryCard title="Most Improved Net Profit" platform={performanceSummary?.improvedNet?.platform} delta={performanceSummary?.improvedNet?.deltas.netProfitDeltaPct} type="pos" />
                    <SummaryCard title="Worst Net Profit" platform={performanceSummary?.worstNet?.platform} value={performanceSummary?.worstNet?.current.netProfit} type="info" />
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <Trophy className="w-5 h-5 text-amber-500" />
                        <div>
                            <h3 className="font-bold text-gray-800 text-sm">Momentum Comparison Matrix</h3>
                            <p className="text-[10px] text-gray-500 uppercase tracking-tighter">Current vs Prior • Ranked by Revenue</p>
                        </div>
                    </div>
                    <div className="relative">
                        <button onClick={() => setIsAlertRulesOpen(!isAlertRulesOpen)} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-1.5 shadow-sm transition-all"><BellRing className="w-3.5 h-3.5 text-indigo-500" />Alert Rules</button>
                        {isAlertRulesOpen && (<div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right"><div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2"><h4 className="font-bold text-gray-900 text-sm">Alert Thresholds</h4><button onClick={() => setIsAlertRulesOpen(false)}><X className="w-4 h-4 text-gray-400" /></button></div><div className="space-y-4"><div className="space-y-1.5"><label className="text-[10px] font-medium uppercase text-gray-400">Revenue Drop Threshold (%)</label><input type="number" value={alertRules.revenueDropPctThreshold} onChange={e => setAlertRules({ ...alertRules, revenueDropPctThreshold: parseFloat(e.target.value) || 0 })} className="w-full border rounded px-3 py-1.5 text-sm font-medium bg-gray-50" /></div><div className="space-y-1.5"><label className="text-[10px] font-medium uppercase text-gray-400">Low Margin Threshold (%)</label><input type="number" value={alertRules.marginLowThreshold} onChange={e => setAlertRules({ ...alertRules, marginLowThreshold: parseFloat(e.target.value) || 0 })} className="w-full border rounded px-3 py-1.5 text-sm font-medium bg-gray-50" /></div><div className="space-y-1.5"><label className="text-[10px] font-medium uppercase text-gray-400">High TACoS Threshold (%)</label><input type="number" value={alertRules.tacosHighThreshold} onChange={e => setAlertRules({ ...alertRules, tacosHighThreshold: parseFloat(e.target.value) || 0 })} className="w-full border rounded px-3 py-1.5 text-sm font-medium bg-gray-50" /></div></div><div className="mt-6 flex gap-2"><button onClick={() => setIsAlertRulesOpen(false)} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-medium text-xs">Save</button></div></div>)}
                    </div>
                </div>
                <div className="sello-table-scroll">
                    <table className="sello-table">
                        <thead className="sticky top-0">
                            <tr>
                                <SortableHeader label="Rank" sortKey="rank" sort={tableSort} onChange={setTableSort} align="center" style={{ width: 40 }} />
                                <SortableHeader label="Platform Performance" sortKey="name" sort={tableSort} onChange={setTableSort} />
                                <SortableHeader label="Revenue" sortKey="revenue" sort={tableSort} onChange={setTableSort} align="right" />
                                <SortableHeader label="Efficiency (Margin)" sortKey="margin" sort={tableSort} onChange={setTableSort} align="right" />
                                <SortableHeader label="Ads (TACoS)" sortKey="tacos" sort={tableSort} onChange={setTableSort} align="right" />
                                <SortableHeader label="Quality (Refunds)" sortKey="refunds" sort={tableSort} onChange={setTableSort} align="right" />
                                <th className="c">Risk Analysis</th>
                            </tr>
                        </thead>
                        <tbody>
                            {portfolioAverages && (
                                <tr className="bg-indigo-50/50 border-b border-indigo-100 shadow-inner">
                                    <td className="c"><Activity className="w-4 h-4 text-indigo-400 mx-auto" /></td>
                                    <td><div className="font-black text-indigo-900 text-xs italic">PORTFOLIO AVERAGE</div></td>
                                    <td className="r"><div className="flex flex-col items-end"><span className="font-bold text-indigo-900">{formatSmartMoney(portfolioAverages.revenue)}</span><TrendDeltaPill value={portfolioAverages.revenueDelta} /></div></td>
                                    <td className="r"><div className="flex flex-col items-end"><span className="font-bold text-indigo-900">{formatPct(portfolioAverages.margin)}</span><TrendDeltaPill value={portfolioAverages.marginDelta} isPp /></div></td>
                                    <td className="r"><div className="flex flex-col items-end"><span className="font-bold text-indigo-900">{formatPct(portfolioAverages.tacos)}</span><TrendDeltaPill value={portfolioAverages.tacosDelta} isPp invert /></div></td>
                                    <td className="r"><div className="flex flex-col items-end"><span className="font-bold text-indigo-900">{formatPct(portfolioAverages.refundRate)}</span><TrendDeltaPill value={portfolioAverages.refundRateDelta} isPp invert /></div></td>
                                    <td className="c"><span className="text-[10px] font-bold text-indigo-400 uppercase italic">System Baseline</span></td>
                                </tr>
                            )}
                            {rankedPlatforms.map((row) => {
                                const rule = pricingRules[row.platform];
                                const revDelta = row.deltas.revenueDeltaPct;
                                const marginDelta = row.deltas.marginDeltaPp;
                                const tacosDelta = row.deltas.tacosDeltaPp;
                                const refundDelta = row.deltas.refundRateDeltaPp;
                                const isRevWarning = revDelta !== null && revDelta <= -alertRules.revenueDropPctThreshold;
                                const isMarginCritical = row.current.marginPct < alertRules.marginLowThreshold;
                                const isTacosHigh = row.current.tacosPct > alertRules.tacosHighThreshold;
                                const isRefundHigh = row.current.refundRatePct > 5.0;
                                const isCostBased = rule?.pricingControl === 'PLATFORM_COST_BASED';

                                const flags: Flag[] = [];
                                if (isRevWarning) flags.push({ label: "Growth Drop", style: "badge-red", tooltip: `Revenue down ${revDelta?.toFixed(1)}%` });
                                if (isMarginCritical) flags.push({ label: "Low Margin", style: "badge-amber", tooltip: "Below efficiency target" });
                                if (isTacosHigh) flags.push({ label: "High Ad Costs", style: "badge-purple", tooltip: "Ad spend above threshold" });
                                if (isRefundHigh) flags.push({ label: "High Returns", style: "badge-orange", tooltip: "Quality/Fulfillment issues detected" });
                                if (row.current.netProfit < 0) flags.push({ label: "Bleeding", style: "badge-red", tooltip: "Operating at a net loss" });
                                return (
                                    <tr key={row.platform} className={`cursor-pointer ${hoveredPlatform === row.platform ? 'bg-indigo-50/40 ring-1 ring-inset ring-indigo-200' : ''}`} onMouseEnter={() => setHoveredPlatform(row.platform)} onMouseLeave={() => setHoveredPlatform(null)}>
                                        <td className="c"><div className="flex flex-col items-center gap-0.5"><div className="w-6 h-6 flex items-center justify-center rounded-full bg-gray-100 text-gray-500 text-[10px] font-black border border-gray-200">{row.currentPos}</div>{row.shift !== 0 ? (<div className={`text-[8px] font-black flex items-center ${row.shift > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{row.shift > 0 ? <ArrowUp className="w-2 h-2" /> : <ArrowDown className="w-2 h-2" />}{Math.abs(row.shift)}</div>) : <Minus className="w-2 h-2 text-gray-300" />}</div></td>
                                        <td><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-sm" style={{ backgroundColor: rule?.color || '#6366f1' }}>{row.platform[0]}</div><div className="flex flex-col"><div className="font-bold text-gray-900 text-sm leading-none">{row.platform}</div><div className="text-[9px] text-gray-400 font-bold uppercase mt-1 tracking-wider">{rule?.manager || 'Unassigned'}</div></div></div></td>
                                        <td className={`r transition-colors ${isRevWarning ? 'bg-red-50/30' : ''}`}>
                                            <div className="flex flex-col items-end">
                                                <span className="font-bold text-gray-900">{formatSmartMoney(row.current.revenue)}</span>
                                                {isCostBased && <span className="text-[8px] bg-slate-100 text-slate-500 px-1 py-0.5 rounded border border-slate-200 cursor-help" title="Cost-based Revenue">Cost Basis</span>}
                                                <TrendDeltaPill value={revDelta} />
                                            </div>
                                        </td>
                                        <td className={`r transition-colors ${isMarginCritical ? 'bg-amber-50/30' : ''}`}><div className="flex flex-col items-end"><span className={`font-black ${row.current.marginPct < 15 ? 'text-amber-500' : 'text-emerald-600'}`}>{formatPct(row.current.marginPct)}</span><TrendDeltaPill value={marginDelta} isPp /></div></td>
                                        <td className={`r transition-colors ${isTacosHigh ? 'bg-purple-50/30' : ''}`}><div className="flex flex-col items-end"><span className="font-medium text-gray-700">{formatPct(row.current.tacosPct)}</span><TrendDeltaPill value={tacosDelta} isPp invert /></div></td>
                                        <td className={`r transition-colors ${isRefundHigh ? 'bg-orange-50/30' : ''}`}><div className="flex flex-col items-end"><span className="font-medium text-gray-700">{formatPct(row.current.refundRatePct)}</span><TrendDeltaPill value={refundDelta} isPp invert /></div></td>
                                        <td className="c"><div className="flex justify-center gap-1.5 flex-wrap min-w-[120px]">{flags.length > 0 ? flags.map((flag, idx) => (<span key={idx} className={`sello-badge ${flag.style} cursor-help`} title={flag.tooltip}>{flag.label}</span>)) : (<span className="sello-badge badge-green">Healthy</span>)}</div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center"><div className="flex items-center gap-2"><Settings className="w-4 h-4 text-indigo-500" /><h4 className="font-bold text-gray-800 text-sm">Chart Configuration</h4></div><button onClick={() => setIsGroupCreatorOpen(!isGroupCreatorOpen)} className="text-xs font-medium px-3 py-1.5 rounded-lg border bg-white text-gray-600 border-gray-200 hover:border-gray-300 transition-all flex items-center gap-1"><Plus className="w-3 h-3" /> Create Group</button></div>
                <div className="p-6">
                    {isGroupCreatorOpen && (<div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 animate-in fade-in slide-in-from-top-2 mb-6"><div className="flex gap-4 mb-3"><div className="flex-1"><label className="text-[10px] font-medium text-indigo-400 uppercase block mb-1">Group Name</label><input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g. Amazon Combined" className="w-full text-sm border border-indigo-200 rounded-md px-3 py-1.5 bg-white" /></div></div><div className="mb-4"><label className="text-[10px] font-medium text-indigo-400 uppercase block mb-1">Select Platforms</label><div className="flex flex-wrap gap-2">{uniquePlatforms.map((p: string) => <button key={p} onClick={() => toggleNewGroupPlatform(p)} className={`px-2 py-1 text-xs rounded border transition-all ${newGroupPlatforms.includes(p) ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>{p}</button>)}</div></div><div className="flex justify-end gap-2"><button onClick={() => setIsGroupCreatorOpen(false)} className="text-xs text-gray-500 px-3 py-1.5">Cancel</button><button onClick={handleCreateGroup} disabled={!newGroupName || newGroupPlatforms.length < 2} className="text-xs bg-indigo-600 text-white font-medium px-4 py-1.5 rounded-md disabled:opacity-50">Save Group</button></div></div>)}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                        <div>
                            <span className="text-[10px] font-medium text-gray-400 uppercase block mb-3 tracking-widest">Focus Platforms</span>
                            <SelectFilter
                                label="Platforms"
                                icon={Layers}
                                options={uniquePlatforms}
                                selected={selectedChartPlatforms}
                                onChange={setSelectedChartPlatforms}
                            />
                        </div>
                        <div>
                            <span className="text-[10px] font-medium text-gray-400 uppercase block mb-3 tracking-widest">Processing</span>
                            <div className="flex items-center gap-4">
                                <button
                                    onClick={() => setIsSmoothed(!isSmoothed)}
                                    className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-xs font-bold transition-all shadow-sm ${isSmoothed ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-500 border-gray-200 hover:border-indigo-200'}`}
                                >
                                    <Sparkles className={`w-3.5 h-3.5 ${isSmoothed ? 'text-indigo-500' : 'text-gray-400'}`} />
                                    {isSmoothed ? '7-Day Smooth Active' : 'Raw Data (Choppy)'}
                                </button>
                                {platformGroups.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">{platformGroups.map((g: any) => (<div key={g.id} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-100 shadow-sm"><Layers className="w-3.5 h-3.5" />{g.name}<button onClick={() => deleteGroup(g.id)} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button></div>))}</div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                    <div className="border-t border-gray-100 my-8"></div>
                    <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4">
                        <div className="flex items-center gap-4">
                            <h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg"><TrendingUp className="w-5 h-5 text-indigo-600" />Performance Trend</h3>
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                <button onClick={() => setChartViewMode('OVERLAY')} className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all flex items-center gap-1.5 ${chartViewMode === 'OVERLAY' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}><Maximize2 className="w-3 h-3" /> Overlay</button>
                                <button onClick={() => setChartViewMode('TRELLIS')} className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all flex items-center gap-1.5 ${chartViewMode === 'TRELLIS' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}><LayoutGrid className="w-3 h-3" /> Trellis</button>
                            </div>
                        </div>
                        <div className="flex bg-gray-100 p-1 rounded-lg">{(['NET_PROFIT', 'MARGIN_PCT', 'AVG_ORDER_VALUE', 'UNITS_SOLD'] as const).map(m => (<button key={m} onClick={() => setTrendMetric(m)} className={`px-4 py-2 text-[10px] font-medium uppercase tracking-wider rounded-md transition-all ${trendMetric === m ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>{metricLabels[m]}</button>))}</div>
                    </div>

                    {chartViewMode === 'OVERLAY' ? (
                        <div className="h-[450px] w-full relative group/chart select-none">
                            {zoomState.isZoomed && (<button onClick={handleResetZoom} className="absolute top-4 right-12 z-20 px-3 py-1.5 bg-white/90 backdrop-blur-sm border border-indigo-100 text-indigo-600 rounded-lg shadow-lg hover:bg-indigo-50 transition-all flex items-center gap-1.5 text-xs font-medium animate-in fade-in slide-in-from-top-2"><RotateCcw className="w-3.5 h-3.5" />Reset View</button>)}
                            {smoothedChartData.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={smoothedChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }} onMouseDown={(e: any) => e?.activeLabel && setRefAreaLeft(e.activeLabel)} onMouseMove={(e: any) => refAreaLeft && e?.activeLabel && setRefAreaRight(e.activeLabel)} onMouseUp={zoom}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
                                        <XAxis dataKey="date" tickFormatter={(val) => new Date(val).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={true} />
                                        <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={true} domain={['auto', 'auto']} />
                                        <RechartsTooltip shared={true} cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '3 3' }} content={<CustomTrendTooltip />} />
                                        <Legend
                                            wrapperStyle={{ paddingTop: '20px' }}
                                            onClick={handleLegendClick}
                                            onMouseEnter={(o) => {
                                                const key = o.dataKey as string;
                                                if (key) setHoveredPlatform(key.replace(`_${trendMetric}`, ''));
                                            }}
                                            onMouseLeave={() => setHoveredPlatform(null)}
                                            formatter={(value) => (<span className={`text-xs font-medium cursor-pointer transition-opacity ${hiddenSeries.has(value) ? 'opacity-30' : 'opacity-100'} ${hoveredPlatform === value ? 'font-bold underline' : ''}`}>{value}</span>)}
                                        />
                                        {refAreaLeft && refAreaRight && (<ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#8884d8" fillOpacity={0.3} />)}
                                        {selectedChartPlatforms.map((platform: string) => (
                                            <Line
                                                key={platform}
                                                type="monotone"
                                                dataKey={`${platform}_${trendMetric}`}
                                                name={platform}
                                                stroke={pricingRules[platform]?.color || '#9ca3af'}
                                                strokeWidth={hoveredPlatform === platform ? 4 : 2}
                                                strokeOpacity={!hoveredPlatform || hoveredPlatform === platform ? 1 : 0.15}
                                                dot={false}
                                                connectNulls={true}
                                                hide={hiddenSeries.has(platform)}
                                                isAnimationActive={false}
                                            />
                                        ))}
                                        {platformGroups.map((group: any, i: number) => (
                                            <Line
                                                key={group.id}
                                                type="monotone"
                                                dataKey={`${group.name}_${trendMetric}`}
                                                name={group.name}
                                                stroke={['#ec4899', '#8b5cf6', '#14b8a6', '#f59e0b', '#6366f1'][i % 5]}
                                                strokeWidth={hoveredPlatform === group.name ? 5 : 3}
                                                strokeOpacity={!hoveredPlatform || hoveredPlatform === group.name ? 1 : 0.15}
                                                strokeDasharray="5 5"
                                                dot={false}
                                                connectNulls={true}
                                                hide={hiddenSeries.has(group.name)}
                                                isAnimationActive={false}
                                            />
                                        ))}
                                    </LineChart>
                                </ResponsiveContainer>
                            ) : (<div className="h-full w-full flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-200 rounded-xl text-gray-400 italic">No sales data available for the selected period.</div>)}
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 animate-in fade-in duration-500">
                            {selectedChartPlatforms.map((platform) => {
                                const platformKey = `${platform}_${trendMetric}`;
                                const color = pricingRules[platform]?.color || '#9ca3af';
                                const sId = sanitizeId(platform);

                                const chartDomain = (() => {
                                    const platValues = smoothedChartData.map(d => d[platformKey]).filter(v => v !== undefined && v !== null);
                                    const avgValues = globalTrendLine.map(d => d.avg).filter(v => v !== undefined && v !== null);
                                    const combined = [...platValues, ...avgValues];

                                    if (combined.length === 0) return ['auto', 'auto'];
                                    const min = Math.min(...combined);
                                    const max = Math.max(...combined);
                                    const spread = max - min || Math.abs(max) || 1;
                                    const padding = spread * 0.15;
                                    return [min - padding, max + padding];
                                })();

                                return (
                                    <div key={platform} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 h-[240px] flex flex-col group hover:shadow-md hover:border-indigo-200 transition-all">
                                        <div className="flex justify-between items-center mb-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-5 h-5 rounded flex items-center justify-center text-[10px] font-black text-white" style={{ backgroundColor: color }}>{platform[0]}</div>
                                                <span className="text-xs font-bold text-gray-800">{platform}</span>
                                            </div>
                                            <div className="text-[10px] font-black text-indigo-500 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                                {(() => {
                                                    const platData = trendData.find(d => d.platform === platform);
                                                    let val = 0;
                                                    switch (trendMetric) {
                                                        case 'NET_PROFIT': val = platData?.current.netProfit || 0; break;
                                                        case 'MARGIN_PCT': val = platData?.current.marginPct || 0; break;
                                                        case 'AVG_ORDER_VALUE': val = platData?.current.avgOrderValue || 0; break;
                                                        case 'UNITS_SOLD': val = platData?.current.unitsSold || 0; break;
                                                    }
                                                    return trendMetric === 'MARGIN_PCT' ? val.toFixed(1) + '%' : trendMetric === 'UNITS_SOLD' ? formatNumber(val) : formatSmartMoney(val);
                                                })()}
                                            </div>
                                        </div>
                                        <div className="flex-1 min-h-0">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={smoothedChartData}>
                                                    <defs>
                                                        <linearGradient id={`gradient-${sId}`} x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor={color} stopOpacity={0.06} />
                                                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f8fafc" />
                                                    <XAxis dataKey="date" hide />
                                                    <YAxis hide domain={chartDomain} />
                                                    <RechartsTooltip cursor={{ stroke: '#6366f1', strokeWidth: 1 }} content={({ active, payload }) => {
                                                        if (active && payload && payload.length) {
                                                            const val = payload[0].value as number;
                                                            return (
                                                                <div className="bg-gray-900 text-white px-2 py-1 rounded text-[10px] font-bold">
                                                                    {trendMetric === 'MARGIN_PCT' ? val.toFixed(1) + '%' : trendMetric === 'UNITS_SOLD' ? formatNumber(val) : formatSmartMoney(val)}
                                                                </div>
                                                            );
                                                        }
                                                        return null;
                                                    }} />
                                                    <ReferenceLine y={0} stroke="#e2e8f0" />
                                                    <Area
                                                        type="monotone"
                                                        dataKey={platformKey}
                                                        stroke={color}
                                                        strokeWidth={2.5}
                                                        fill={`url(#gradient-${sId})`}
                                                        connectNulls={true}
                                                        dot={false}
                                                        isAnimationActive={false}
                                                    />
                                                    {/* Dimmed Portfolio Average Reference */}
                                                    <Line data={globalTrendLine} type="monotone" dataKey="avg" stroke="#cbd5e1" strokeWidth={1} strokeDasharray="3 3" dot={false} connectNulls={true} isAnimationActive={false} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden mt-6">
                <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center"><div className="flex items-center gap-2"><BarChartIcon className="w-4 h-4 text-indigo-500" /><h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">{metricLabels[trendMetric]} Comparison by Platform</h3></div></div>
                <div className="p-6 h-[400px]">
                    {barChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }} barGap={8}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="platform" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                <XAxis dataKey="platform" hide xAxisId="bg" />
                                <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <RechartsTooltip cursor={{ fill: 'transparent' }} content={({ active, payload, label }) => {
                                    if (active && payload && payload.length) {
                                        const currentItem = payload.find((p: any) => p.name === 'Current');
                                        const priorItem = payload.find((p: any) => p.name === 'Prior');

                                        const currVal = currentItem ? (currentItem.value as number) : 0;
                                        const priorVal = priorItem ? (priorItem.value as number) : 0;

                                        return (
                                            <div className="bg-gray-900 text-white p-3 rounded-xl shadow-2xl border border-gray-700 text-xs">
                                                <div className="font-bold border-b border-gray-700 pb-1 mb-2">{label}</div>
                                                <div className="space-y-1">
                                                    <div className="flex justify-between gap-6">
                                                        <span className="text-gray-400">Current:</span>
                                                        <span className="font-mono font-medium text-white">
                                                            {trendMetric === 'MARGIN_PCT' ? currVal.toFixed(1) + '%' : trendMetric === 'UNITS_SOLD' ? formatNumber(currVal) : formatSmartMoney(currVal)}
                                                        </span>
                                                    </div>
                                                    <div className="flex justify-between gap-6">
                                                        <span className="text-gray-400">Prior:</span>
                                                        <span className="font-mono font-medium text-blue-300">
                                                            {trendMetric === 'MARGIN_PCT' ? priorVal.toFixed(1) + '%' : trendMetric === 'UNITS_SOLD' ? formatNumber(priorVal) : formatSmartMoney(priorVal)}
                                                        </span>
                                                    </div>
                                                    {(currentItem || priorItem) && (
                                                        <div className="pt-1 border-t border-gray-700 mt-1 flex justify-between gap-4">
                                                            <span className="text-gray-400">Change:</span>
                                                            <span className={`font-medium ${currVal >= priorVal ? 'text-green-400' : 'text-red-400'}`}>
                                                                {(currVal - priorVal >= 0 ? '+' : '')}
                                                                {trendMetric === 'MARGIN_PCT'
                                                                    ? (currVal - priorVal).toFixed(1) + 'pp'
                                                                    : (((currVal - priorVal) / (Math.abs(priorVal) || 1)) * 100).toFixed(1) + '%'}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }} />
                                <Legend verticalAlign="bottom" align="center" wrapperStyle={{ paddingTop: '20px' }} iconType="rect" />
                                <Bar xAxisId="bg" dataKey="bgValue" barSize={64} isAnimationActive={false} legendType="none">
                                    {barChartData.map((entry: any, index: number) => (
                                        <Cell key={`cell-bg-${index}`} fill={entry.color} fillOpacity={0.06} />
                                    ))}
                                </Bar>
                                <Bar dataKey="current" name="Current" fill="#1f2937" radius={[4, 4, 0, 0]} barSize={24} isAnimationActive={false} />
                                <Bar dataKey="prior" name="Prior" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={24} isAnimationActive={false} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (<div className="h-full w-full flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-200 rounded-xl text-gray-400 italic text-sm">No comparative data available.</div>)}
                </div>
            </div>
        </div>
    );
};
