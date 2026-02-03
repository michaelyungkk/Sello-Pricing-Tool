
import React, { useState, useEffect, useRef } from 'react';
import { Trophy, BellRing, X, Settings, Plus, Layers, TrendingUp, RotateCcw, BarChart as BarChartIcon, ArrowUpRight, ArrowDownRight, Activity, Check, ChevronDown } from 'lucide-react';
import { ResponsiveContainer, LineChart, Line, CartesianGrid, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ReferenceArea, BarChart, Bar, Cell } from 'recharts';
import { formatMoney, formatNumber, formatPct } from '../../../utils/format';
import { Tab3AlertRules } from '../../../services/platformAlertRules';
import { PlatformTrendData } from '../../../services/platformTrendAgg';

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
}

interface Flag {
    label: string;
    style: string;
    tooltip: string;
}

const SummaryCard = ({ title, platform, delta, value, type }: { title: string, platform?: string, delta?: number | null, value?: number, type: 'pos' | 'neg' | 'info' }) => {
    const Icon = type === 'pos' ? ArrowUpRight : type === 'neg' ? ArrowDownRight : Activity;
    const colorClass = type === 'pos' ? 'text-green-600' : type === 'neg' ? 'text-red-600' : 'text-indigo-600';
    const bgClass = type === 'pos' ? 'bg-green-50' : type === 'neg' ? 'bg-red-50' : 'bg-indigo-50';

    return (
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between min-w-0">
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
                        formatMoney(value, 0)
                    ) : '—'}
                </div>
            </div>
            <div className={`p-1.5 rounded-lg shrink-0 ml-3 ${bgClass} ${colorClass}`}>
                <Icon className="w-4 h-4" />
            </div>
        </div>
    );
};

const FocusPlatformDropdown = ({ 
    platforms = [], 
    selected = [], 
    onChange 
}: { 
    platforms?: string[], 
    selected?: string[], 
    onChange: (p: string[]) => void 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const togglePlatform = (p: string) => {
        if (selected.includes(p)) {
            onChange(selected.filter(s => s !== p));
        } else {
            onChange([...selected, p]);
        }
    };

    const handleReset = () => {
        onChange(platforms);
    };

    const handleClear = () => {
        onChange([]);
    };

    let label = "Select Platforms";
    if (selected.length === platforms.length && platforms.length > 0) label = "All Platforms Visible";
    else if (selected.length === 0) label = "Hidden (None)";
    else if (selected.length === 1) label = selected[0];
    else label = `${selected.length} Platforms Visible`;

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-medium text-gray-700 shadow-sm hover:border-indigo-300 transition-all"
            >
                <div className="flex items-center gap-2 truncate">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    <span className="truncate">{label}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-left">
                    <div className="p-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                        <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Visibility</span>
                        <div className="flex gap-3">
                            <button onClick={handleClear} className="text-[10px] font-medium text-gray-500 hover:text-red-600">Clear</button>
                            <button onClick={handleReset} className="text-[10px] font-medium text-indigo-600 hover:text-indigo-700 hover:underline">All</button>
                        </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1">
                        {platforms.map(p => {
                            const isSelected = selected.includes(p);
                            return (
                                <button 
                                    key={p} 
                                    onClick={() => togglePlatform(p)}
                                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors text-left group"
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all flex-shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white group-hover:border-gray-400'}`}>
                                        {isSelected && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className={`text-xs truncate ${isSelected ? 'font-medium text-gray-900' : 'font-medium text-gray-600'}`}>{p}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export const PerformanceTrendTab: React.FC<PerformanceTrendTabProps> = ({ 
    trendData, performanceSummary, timeWindow, alertRules, setAlertRules, 
    uniquePlatforms, selectedChartPlatforms, setSelectedChartPlatforms, 
    platformGroups, setPlatformGroups, isGroupCreatorOpen, setIsGroupCreatorOpen, 
    newGroupName, setNewGroupName, newGroupPlatforms, setNewGroupPlatforms, 
    handleCreateGroup, deleteGroup, toggleNewGroupPlatform, 
    trendMetric, setTrendMetric, zoomState, handleResetZoom, visibleChartData, 
    setRefAreaLeft, setRefAreaRight, refAreaLeft, refAreaRight, zoom, 
    handleLegendClick, hiddenSeries, pricingRules, barChartData 
}) => {
    const [isAlertRulesOpen, setIsAlertRulesOpen] = useState(false);

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
                            <div key={i} className="flex items-center justify-between gap-4"><div className="flex items-center gap-2 min-w-0"><div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} /><span className="text-[11px] font-medium truncate opacity-90">{platformName}</span></div><div className="flex items-center gap-2 shrink-0"><span className="text-[11px] font-mono font-medium">{trendMetric === 'MARGIN_PCT' ? value.toFixed(1) + '%' : trendMetric === 'UNITS_SOLD' ? formatNumber(value) : formatMoney(value, 0)}</span>{delta !== null && isFinite(delta) && (<span className={`text-[9px] font-medium px-1 rounded-sm ${delta >= 0 ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>{trendMetric === 'MARGIN_PCT' ? (delta > 0 ? '+' : '') : (delta > 0 ? '↑' : '↓')}{Math.abs(delta).toFixed(0)}{trendMetric === 'MARGIN_PCT' ? 'pp' : '%'}</span>)}</div></div>
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

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <div className="flex items-center gap-2 mb-1"><h3 className="text-lg font-bold text-gray-900">Summary</h3><span className="text-xs text-gray-400 font-medium">Latest vs prior period</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
                    <SummaryCard title="Biggest Revenue Gainer" platform={performanceSummary?.gainer?.platform} delta={performanceSummary?.gainer?.deltas.revenueDeltaPct} type="pos" />
                    <SummaryCard title="Biggest Revenue Loser" platform={performanceSummary?.loser?.platform} delta={performanceSummary?.loser?.deltas.revenueDeltaPct} type="neg" />
                    <SummaryCard title="Most Improved Net Profit" platform={performanceSummary?.improvedNet?.platform} delta={performanceSummary?.improvedNet?.deltas.netProfitDeltaPct} type="pos" />
                    <SummaryCard title="Worst Net Profit" platform={performanceSummary?.worstNet?.platform} value={performanceSummary?.worstNet?.current.netProfit} type="info" />
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center"><h3 className="font-bold text-gray-800 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" />Comparison Matrix</h3><div className="relative"><button onClick={() => setIsAlertRulesOpen(!isAlertRulesOpen)} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium hover:bg-gray-50 flex items-center gap-1.5 shadow-sm transition-all"><BellRing className="w-3.5 h-3.5 text-indigo-500" />Alert Rules</button>{isAlertRulesOpen && (<div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right"><div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2"><h4 className="font-bold text-gray-900 text-sm">Alert Thresholds</h4><button onClick={() => setIsAlertRulesOpen(false)}><X className="w-4 h-4 text-gray-400" /></button></div><div className="space-y-4"><div className="space-y-1.5"><label className="text-[10px] font-medium uppercase text-gray-400">Revenue Drop Threshold (%)</label><input type="number" value={alertRules.revenueDropPctThreshold} onChange={e => setAlertRules({...alertRules, revenueDropPctThreshold: parseFloat(e.target.value) || 0})} className="w-full border rounded px-3 py-1.5 text-sm font-medium bg-gray-50" /></div><div className="space-y-1.5"><label className="text-[10px] font-medium uppercase text-gray-400">Low Margin Threshold (%)</label><input type="number" value={alertRules.marginLowThreshold} onChange={e => setAlertRules({...alertRules, marginLowThreshold: parseFloat(e.target.value) || 0})} className="w-full border rounded px-3 py-1.5 text-sm font-medium bg-gray-50" /></div></div><div className="mt-6 flex gap-2"><button onClick={() => setIsAlertRulesOpen(false)} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-medium text-xs">Save</button></div></div>)}</div></div>
                <div className="overflow-x-auto"><table className="w-full text-left text-sm whitespace-nowrap"><thead className="bg-gray-50/50 text-gray-500 font-semibold border-b border-gray-200/50"><tr><th className="px-4 py-3">Platform</th><th className="px-4 py-3 text-right">Revenue (Current)</th><th className="px-4 py-3 text-right">Net Profit</th><th className="px-4 py-3 text-right">Margin %</th><th className="px-4 py-3 text-center">Health Flags</th></tr></thead><tbody className="divide-y divide-gray-100/50">{trendData.map((row: any) => { const rule = pricingRules[row.platform]; const revDelta = row.deltas.revenueDeltaPct; const flags: Flag[] = []; if (revDelta !== null && revDelta <= -alertRules.revenueDropPctThreshold) flags.push({ label: "Revenue Drop", style: "bg-red-100 text-red-800 border-red-200", tooltip: `Revenue ${revDelta.toFixed(1)}% vs prior period` }); if (row.current.netProfit < 0) flags.push({ label: "Negative Net", style: "bg-red-900 text-white border-red-950", tooltip: "Net Profit is below £0" }); return (<tr key={row.platform} className="even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors"><td className="p-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: rule?.color || '#6366f1' }}>{row.platform[0]}</div><div className="font-medium text-gray-900">{row.platform}</div></div></td><td className="p-4 text-right"><div className="font-medium text-gray-900">{formatMoney(row.current.revenue, 0)}</div></td><td className="p-4 text-right bg-green-50/10"><div className="font-medium text-indigo-700">{formatMoney(row.current.netProfit, 0)}</div></td><td className="p-4 text-right"><div className="font-medium text-gray-800">{formatPct(row.current.marginPct)}</div></td><td className="p-4 text-center"><div className="flex justify-center gap-1 flex-wrap">{flags.map((flag, idx) => <span key={idx} className={`px-2 py-1 rounded text-[10px] font-medium border cursor-help ${flag.style}`} title={flag.tooltip}>{flag.label}</span>)}</div></td></tr>); })}</tbody></table></div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center"><div className="flex items-center gap-2"><Settings className="w-4 h-4 text-indigo-500" /><h4 className="font-bold text-gray-800 text-sm">Chart Configuration</h4></div><button onClick={() => setIsGroupCreatorOpen(!isGroupCreatorOpen)} className="text-xs font-medium px-3 py-1.5 rounded-lg border bg-white text-gray-600 border-gray-200 hover:border-gray-300 transition-all flex items-center gap-1"><Plus className="w-3 h-3" /> Create Group</button></div>
                <div className="p-6">
                    {isGroupCreatorOpen && (<div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 animate-in fade-in slide-in-from-top-2 mb-6"><div className="flex gap-4 mb-3"><div className="flex-1"><label className="text-[10px] font-medium text-indigo-400 uppercase block mb-1">Group Name</label><input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g. Amazon Combined" className="w-full text-sm border border-indigo-200 rounded-md px-3 py-1.5 bg-white" /></div></div><div className="mb-4"><label className="text-[10px] font-medium text-indigo-400 uppercase block mb-1">Select Platforms</label><div className="flex flex-wrap gap-2">{uniquePlatforms.map((p: string) => <button key={p} onClick={() => toggleNewGroupPlatform(p)} className={`px-2 py-1 text-xs rounded border transition-all ${newGroupPlatforms.includes(p) ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>{p}</button>)}</div></div><div className="flex justify-end gap-2"><button onClick={() => setIsGroupCreatorOpen(false)} className="text-xs text-gray-500 px-3 py-1.5">Cancel</button><button onClick={handleCreateGroup} disabled={!newGroupName || newGroupPlatforms.length < 2} className="text-xs bg-indigo-600 text-white font-medium px-4 py-1.5 rounded-md disabled:opacity-50">Save Group</button></div></div>)}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8"><div><span className="text-[10px] font-medium text-gray-400 uppercase block mb-3 tracking-widest">Focus Platforms</span><FocusPlatformDropdown platforms={uniquePlatforms} selected={selectedChartPlatforms} onChange={setSelectedChartPlatforms} /></div><div><span className="text-[10px] font-medium text-gray-400 uppercase block mb-3 tracking-widest">Custom Groups</span>{platformGroups.length > 0 ? (<div className="flex flex-wrap gap-2">{platformGroups.map((g: any) => (<div key={g.id} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-lg border border-indigo-100 shadow-sm"><Layers className="w-3.5 h-3.5" />{g.name}<button onClick={() => deleteGroup(g.id)} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button></div>))}</div>) : (<div className="p-3 border-2 border-dashed border-gray-100 rounded-lg text-xs text-gray-400 text-center">No custom groups defined.</div>)}</div></div>
                    <div className="border-t border-gray-100 my-8"></div>
                    <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4"><h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg"><TrendingUp className="w-5 h-5 text-indigo-600" />Performance Trend</h3><div className="flex bg-gray-100 p-1 rounded-lg">{(['NET_PROFIT', 'MARGIN_PCT', 'AVG_ORDER_VALUE', 'UNITS_SOLD'] as const).map(m => (<button key={m} onClick={() => setTrendMetric(m)} className={`px-4 py-2 text-[10px] font-medium uppercase tracking-wider rounded-md transition-all ${trendMetric === m ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>{metricLabels[m]}</button>))}</div></div>
                    <div className="h-[450px] w-full relative group/chart select-none">
                        {zoomState.isZoomed && (<button onClick={handleResetZoom} className="absolute top-4 right-12 z-20 px-3 py-1.5 bg-white/90 backdrop-blur-sm border border-indigo-100 text-indigo-600 rounded-lg shadow-lg hover:bg-indigo-50 transition-all flex items-center gap-1.5 text-xs font-medium animate-in fade-in slide-in-from-top-2"><RotateCcw className="w-3.5 h-3.5" />Reset View</button>)}
                        {visibleChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={visibleChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }} onMouseDown={(e: any) => e?.activeLabel && setRefAreaLeft(e.activeLabel)} onMouseMove={(e: any) => refAreaLeft && e?.activeLabel && setRefAreaRight(e.activeLabel)} onMouseUp={zoom}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tickFormatter={(val) => new Date(val).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={true} />
                                    <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={true} domain={['auto', 'auto']} />
                                    <RechartsTooltip shared={true} cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '3 3' }} content={<CustomTrendTooltip />} />
                                    <Legend wrapperStyle={{ paddingTop: '20px' }} onClick={handleLegendClick} formatter={(value) => (<span className={`text-xs font-medium cursor-pointer transition-opacity ${hiddenSeries.has(value) ? 'opacity-30' : 'opacity-100'}`}>{value}</span>)} />
                                    {refAreaLeft && refAreaRight && (<ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#8884d8" fillOpacity={0.3} />)}
                                    {selectedChartPlatforms.map((platform: string) => (<Line key={platform} type="monotone" dataKey={`${platform}_${trendMetric}`} name={platform} stroke={pricingRules[platform]?.color || '#9ca3af'} strokeWidth={2} dot={false} hide={hiddenSeries.has(platform)} isAnimationActive={false} />))}
                                    {platformGroups.map((group: any, i: number) => (<Line key={group.id} type="monotone" dataKey={`${group.name}_${trendMetric}`} name={group.name} stroke={['#ec4899', '#8b5cf6', '#14b8a6', '#f59e0b', '#6366f1'][i % 5]} strokeWidth={3} strokeDasharray="5 5" dot={false} hide={hiddenSeries.has(group.name)} isAnimationActive={false} />))}
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (<div className="h-full w-full flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-200 rounded-xl text-gray-400 italic">No sales data available for the selected period.</div>)}
                    </div>
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
                                {/* Hidden Axis for background overlapping */}
                                <XAxis dataKey="platform" hide xAxisId="bg" />
                                <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <RechartsTooltip cursor={{ fill: 'transparent' }} content={({ active, payload, label }) => (active && payload && payload.length) ? (<div className="bg-gray-900 text-white p-3 rounded-xl shadow-2xl border border-gray-700 text-xs"><div className="font-bold border-b border-gray-700 pb-1 mb-2">{label}</div><div className="space-y-1"><div className="flex justify-between gap-6"><span className="text-gray-400">Current:</span><span className="font-mono font-medium text-white">{trendMetric === 'MARGIN_PCT' ? (payload[0].value as number).toFixed(1) + '%' : trendMetric === 'UNITS_SOLD' ? formatNumber(payload[0].value as number) : formatMoney(payload[0].value as number)}</span></div><div className="flex justify-between gap-6"><span className="text-gray-400">Prior:</span><span className="font-mono font-medium text-blue-300">{trendMetric === 'MARGIN_PCT' ? (payload[1].value as number).toFixed(1) + '%' : trendMetric === 'UNITS_SOLD' ? formatNumber(payload[1].value as number) : formatMoney(payload[1].value as number)}</span></div>{payload[0].value !== undefined && payload[1].value !== undefined && (<div className="pt-1 border-t border-gray-700 mt-1 flex justify-between gap-4"><span className="text-gray-400">Change:</span><span className={`font-medium ${(payload[0].value as number) >= (payload[1].value as number) ? 'text-green-400' : 'text-red-400'}`}>{((payload[0].value as number) - (payload[1].value as number) >= 0 ? '+' : '')}{trendMetric === 'MARGIN_PCT' ? ((payload[0].value as number) - (payload[1].value as number)).toFixed(1) + 'pp' : (((((payload[0].value as number) - (payload[1].value as number)) / (Math.abs(payload[1].value as number) || 1)) * 100).toFixed(1) + '%')}</span></div>)}</div></div>) : null} />
                                <Legend verticalAlign="bottom" align="center" wrapperStyle={{ paddingTop: '20px' }} iconType="rect" />
                                
                                {/* Background Tinted Bars */}
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
