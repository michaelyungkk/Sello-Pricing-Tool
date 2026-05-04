
import React from 'react';
import { MetricCard } from '../../productManagement/parts/MetricCard';
import { Megaphone, PieChart, Zap, Target, Trophy, Coins } from 'lucide-react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell, ReferenceLine, ReferenceArea } from 'recharts';
import { SortState, sortRows } from '../../../utils/tableSort';
import { SortableHeader } from '../../common/SortableHeader';
import { formatSmartMoney, formatPct } from '../../../utils/format';
import { PlatformFeesRoi, PlatformSortKey } from '../platformManagement.types';
import { PricingRules } from '../../../types';
import AuditPanel from '../../common/AuditPanel';
import { getPopComparison } from '../../../services/popComparison';

interface FeesAndRoiTabProps {
    roiData: PlatformFeesRoi[];
    pricingRules: PricingRules;
    themeColor: string;
    sort: SortState<PlatformSortKey>;
    setSort: (sort: SortState<PlatformSortKey>) => void;
    startKey?: string;
    endKey?: string;
    isAuditVisible: boolean;
    popByPlatform?: Map<string, Record<string, ReturnType<typeof getPopComparison>>>;
}

export const FeesAndRoiTab: React.FC<FeesAndRoiTabProps> = ({ roiData, pricingRules, themeColor, sort, setSort, startKey = '', endKey = '', isAuditVisible, popByPlatform = new Map() }) => {
    const [showPop, setShowPop] = React.useState(false);
    const formatPopPct = (v: number | null) => v === null ? 'N/A' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
    const formatPopAbs = (v: number) => `${v >= 0 ? '+' : ''}${formatSmartMoney(v)}`;
    const totalAdSpend = roiData.reduce((sum: number, d: any) => sum + d.adSpend, 0);
    const totalRevenueForAds = roiData.reduce((sum: number, d: any) => (d.dataQuality.hasAdData && d.revenue > 0) ? sum + d.revenue : sum, 0);
    const avgTacos = totalRevenueForAds > 0 ? (totalAdSpend / totalRevenueForAds) * 100 : 0;
    const totalNetProfit = roiData.reduce((sum: number, d: any) => d.dataQuality.hasAdData ? (sum + d.netAfterAds) : sum, 0);
    const avgRoi = totalAdSpend > 0 ? (totalNetProfit / totalAdSpend) : 0;
    const filteredForLeaderboard = [...roiData].filter(d => d.dataQuality.hasAdData && d.adSpend > 0);

    return (
        <div className="space-y-6">
            {isAuditVisible && (
                <div className="">
                    <AuditPanel
                        title="Fees & ROI Audit"
                        startKey={startKey}
                        endKey={endKey}
                        rows={roiData}
                        getDateKey={() => null}
                        distinctDaysCount={startKey && endKey ? Math.round((new Date(endKey).getTime() - new Date(startKey).getTime()) / 86400000) + 1 : 0}
                        getRevenue={(row) => row.revenue}
                        getQty={(row) => row.units}
                        getProfit={(row) => row.profit}
                        getAdSpend={(row) => row.adSpend}
                    />
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard title="Total Ad Spend" value={formatSmartMoney(totalAdSpend)} icon={Megaphone} color="orange" metricKey="totalAdSpend" metricWindowLabel="Current platform period" />
                <MetricCard
                    title="Average TACoS"
                    value={<span className={avgTacos > 15 ? 'text-red-500' : 'text-gray-800'}>{formatPct(avgTacos)}</span>}
                    icon={PieChart}
                    color="indigo"
                    metricKey="tacos"
                    metricWindowLabel="Current platform period"
                />
                <MetricCard
                    title="Global Ad ROI"
                    value={<span className={avgRoi < 0 ? 'text-red-500' : 'text-emerald-600'}>{avgRoi.toFixed(2)}x</span>}
                    icon={Zap}
                    color="green"
                    metricKey="globalAdRoi"
                    metricWindowLabel="Current platform period"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 bg-custom-glass backdrop-blur-custom rounded-xl border border-custom-glass shadow-sm p-6">
                    <div className="flex items-center justify-between mb-2">
                        <div>
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Target className="w-4 h-4 text-theme" />
                                Efficiency Map
                            </h3>
                            <p className="text-xs text-gray-500 mt-1">
                                Bubble Size = Revenue • <span className="font-medium">Quadrants define health</span>
                            </p>
                        </div>
                    </div>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis type="number" dataKey="marginPct" name="Margin" unit="%" tick={{ fontSize: 10 }} label={{ value: 'Net Margin %', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                                <YAxis type="number" dataKey="tacosPct" name="TACoS" unit="%" tick={{ fontSize: 10 }} label={{ value: 'TACoS % (Cost/Rev)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                                <ZAxis type="number" dataKey="revenue" range={[100, 1000]} name="Revenue" />
                                <RechartsTooltip
                                    cursor={{ strokeDasharray: '3 3' }}
                                    content={({ active, payload }) => {
                                        if (active && payload && payload.length) {
                                            const data = payload[0].payload;
                                            return (
                                                <div className="bg-white p-3 border border-gray-200 shadow-xl rounded-lg text-xs z-50">
                                                    <div className="font-bold text-gray-900 mb-2 border-b border-gray-100 pb-1">
                                                        {data.platform}
                                                    </div>
                                                    <div className="space-y-1">
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-gray-500">Revenue:</span>
                                                            <span className="font-mono font-bold text-theme">
                                                                {formatSmartMoney(data.revenue)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-gray-500">Net Margin:</span>
                                                            <span className={`font-mono font-bold ${data.marginPct < 15 ? 'text-red-600' : 'text-green-600'}`}>
                                                                {formatPct(data.marginPct)}
                                                            </span>
                                                        </div>
                                                        <div className="flex justify-between gap-4">
                                                            <span className="text-gray-500">TACoS:</span>
                                                            <span className={`font-mono font-bold ${data.tacosPct > 15 ? 'text-orange-600' : 'text-gray-700'}`}>
                                                                {formatPct(data.tacosPct)}
                                                            </span>
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        }
                                        return null;
                                    }}
                                />

                                <ReferenceLine x={15} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Min Margin (15%)', position: 'insideTopRight', fill: '#10b981', fontSize: 10, angle: 90 }} />
                                <ReferenceLine y={15} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Max TACoS (15%)', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }} />

                                <ReferenceArea x1={15} y2={15} fill="green" fillOpacity={0.05} label={{ value: 'Efficient', position: 'center', fill: '#15803d', fontSize: 12, fontWeight: 'bold', opacity: 0.3 }} />
                                <ReferenceArea x2={15} y1={15} fill="red" fillOpacity={0.05} label={{ value: 'Bleeding', position: 'center', fill: '#b91c1c', fontSize: 12, fontWeight: 'bold', opacity: 0.3 }} />
                                <ReferenceArea x1={15} y1={15} fill="orange" fillOpacity={0.05} label={{ value: 'High TACoS', position: 'center', fill: '#c2410c', fontSize: 12, fontWeight: 'bold', opacity: 0.3 }} />
                                <ReferenceArea x2={15} y2={15} fill="gray" fillOpacity={0.05} label={{ value: 'Low Margin', position: 'center', fill: '#374151', fontSize: 12, fontWeight: 'bold', opacity: 0.3 }} />

                                <Scatter data={roiData.filter((d: any) => d.dataQuality.hasAdData)}>
                                    {roiData.filter((d: any) => d.dataQuality.hasAdData).map((entry: any, index: number) => (
                                        <Cell key={`cell-${index}`} fill={pricingRules[entry.platform]?.color || themeColor} />
                                    ))}
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div className="lg:col-span-1 bg-indigo-900 rounded-xl shadow-lg p-6 text-white overflow-hidden relative">
                    <h3 className="font-bold text-lg mb-1 flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-yellow-400" />
                        ROI Leaderboard
                    </h3>
                    <p className="text-[10px] text-indigo-300 mb-4 opacity-90">Post-Ad Profitability ({'>'}1.0x = Safe)</p>
                    <div className="space-y-4">
                        {filteredForLeaderboard.sort((a: any, b: any) => (b.roiAfterAds || 0) - (a.roiAfterAds || 0)).slice(0, 3).map((d: any, _i: number) => (
                            <div key={d.platform} className="flex items-center justify-between">
                                <div>
                                    <div className="font-bold text-sm">{d.platform}</div>
                                    <div className="text-[10px] text-indigo-300 opacity-80">Ads: {formatSmartMoney(d.adSpend)}</div>
                                </div>
                                <div className="text-lg font-bold text-white font-mono">{d.roiAfterAds?.toFixed(2)}x</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 text-sm flex items-center gap-2"><Coins className="w-4 h-4 text-amber-500" />Fees Table</h3>
                    <button
                        onClick={() => setShowPop(v => !v)}
                        className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${showPop ? 'bg-theme-10 text-theme border-theme-20' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                    >
                        PoP
                    </button>
                </div>
                <div className="overflow-x-auto">
                    <table className="tbl w-full text-left text-sm whitespace-nowrap">
                        <thead className="sticky top-0">
                            <tr>
                                <SortableHeader label="Platform" sortKey="name" sort={sort} onChange={setSort as any} themeColor={themeColor} />
                                <SortableHeader label="Revenue" sortKey="revenue" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" />
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Profit (Gross)</th>
                                <SortableHeader label="Margin %" sortKey="margin" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" />
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Ad Spend</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">TACoS %</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right bg-green-50/30">Net Profit</th>
                                <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right bg-green-50/30">ROI After Ads</th>
                                {showPop && (
                                    <>
                                        <th className="px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wide text-right pop-col-current">PoP Revenue</th>
                                        <th className="px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wide text-right pop-col-delta-pct">PoP Margin</th>
                                        <th className="px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wide text-right pop-col-prev">PoP Ad Spend</th>
                                        <th className="px-3 py-3 text-[10px] font-semibold text-gray-500 uppercase tracking-wide text-right pop-col-delta">PoP Net Profit</th>
                                    </>
                                )}
                            </tr>
                        </thead>
                        <tbody>
                            {sortRows(roiData, sort as any, (row: any, key: string) => row[key] || 0).map((d: any) => {
                                const isCostBased = pricingRules[d.platform]?.pricingControl === 'PLATFORM_COST_BASED';
                                const pop = popByPlatform.get(d.platform);
                                return (
                                    <tr key={d.platform} className="">
                                        <td className="p-4 font-bold text-gray-900">{d.platform}</td>
                                        <td className="p-4 text-right font-medium">
                                            {formatSmartMoney(d.revenue)}
                                            {isCostBased && <span className="block text-[8px] text-slate-400 font-normal uppercase mt-0.5">Cost Basis</span>}
                                        </td>
                                        <td className="p-4 text-right font-medium text-gray-600">{formatSmartMoney(d.profit)}</td>
                                        <td className="p-4 text-right font-bold text-gray-800">{formatPct(d.marginPct)}</td>
                                        <td className="p-4 text-right text-amber-500">{formatSmartMoney(d.adSpend)}</td>
                                        <td className="p-4 text-right text-gray-600">{formatPct(d.tacosPct)}</td>
                                        <td className="p-4 text-right font-bold text-green-700">{formatSmartMoney(d.netAfterAds)}</td>
                                        <td className="p-4 text-right font-bold text-theme">{d.roiAfterAds?.toFixed(2)}x</td>
                                        {showPop && (
                                            <>
                                                <td className="p-3 text-right font-mono text-xs pop-col-current">{formatPopAbs(pop?.revenue?.delta ?? 0)}</td>
                                                <td className="p-3 text-right font-mono text-xs pop-col-delta-pct">{formatPopPct(pop?.margin?.deltaPct ?? null)}</td>
                                                <td className="p-3 text-right font-mono text-xs pop-col-prev">{formatPopAbs(pop?.adSpend?.delta ?? 0)}</td>
                                                <td className="p-3 text-right font-mono text-xs pop-col-delta">{formatPopAbs(pop?.netProfit?.delta ?? 0)}</td>
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
    );
};
