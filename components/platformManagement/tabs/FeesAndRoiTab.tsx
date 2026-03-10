
import React from 'react';
import { MetricCard } from '../../productManagement/parts/MetricCard';
import { Megaphone, PieChart, Zap, Target, Trophy, Coins } from 'lucide-react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell, ReferenceLine, ReferenceArea } from 'recharts';
import { SortState, sortRows } from '../../../utils/tableSort';
import { SortableHeader } from '../../common/SortableHeader';
import { formatMoney, formatPct } from '../../../utils/format';
import { PlatformFeesRoi, PlatformSortKey } from '../platformManagement.types';
import { PricingRules } from '../../../types';
import AuditPanel from '../../AuditPanel';

interface FeesAndRoiTabProps {
    roiData: PlatformFeesRoi[];
    pricingRules: PricingRules;
    themeColor: string;
    sort: SortState<PlatformSortKey>;
    setSort: (sort: SortState<PlatformSortKey>) => void;
    startKey?: string;
    endKey?: string;
    isAuditVisible: boolean;
}

export const FeesAndRoiTab: React.FC<FeesAndRoiTabProps> = ({ roiData, pricingRules, themeColor, sort, setSort, startKey = '', endKey = '', isAuditVisible }) => {
    const totalAdSpend = roiData.reduce((sum: number, d: any) => sum + d.adSpend, 0);
    const totalRevenueForAds = roiData.reduce((sum: number, d: any) => (d.dataQuality.hasAdData && d.revenue > 0) ? sum + d.revenue : sum, 0);
    const avgTacos = totalRevenueForAds > 0 ? (totalAdSpend / totalRevenueForAds) * 100 : 0;
    const totalNetProfit = roiData.reduce((sum: number, d: any) => d.dataQuality.hasAdData ? (sum + d.netAfterAds) : sum, 0);
    const avgRoi = totalAdSpend > 0 ? (totalNetProfit / totalAdSpend) : 0;
    const filteredForLeaderboard = [...roiData].filter(d => d.dataQuality.hasAdData && d.adSpend > 0);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {isAuditVisible && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <AuditPanel title="Fees & ROI Audit" startKey={startKey} endKey={endKey}
                        rows={roiData} getDateKey={() => null}
                        getRevenue={r => r.revenue} getQty={r => r.units}
                        getProfit={r => r.profit} getAdSpend={r => r.adSpend} />
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <MetricCard title="Total Ad Spend" value={formatMoney(totalAdSpend, 0)} icon={Megaphone} color="orange" />
                <MetricCard title="Average TACoS" value={<span className={avgTacos > 15 ? 'text-red-500' : 'text-gray-800'}>{formatPct(avgTacos)}</span>} icon={PieChart} color="indigo" />
                <MetricCard title="Global Ad ROI" value={<span className={avgRoi < 0 ? 'text-red-500' : 'text-emerald-600'}>{avgRoi.toFixed(2)}x</span>} icon={Zap} color="green" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 sello-glass rounded-xl p-6">
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                        <div>
                            <h3 style={{ fontWeight: 700, fontSize: 14, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                                <Target style={{ width: 14, height: 14, color: '#4f46e5' }} />Efficiency Map
                            </h3>
                            <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4 }}>Bubble Size = Revenue · <span style={{ fontWeight: 500 }}>Quadrants define health</span></p>
                        </div>
                    </div>
                    <div style={{ height: 300, width: '100%' }}>
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis type="number" dataKey="marginPct" name="Margin" unit="%" tick={{ fontSize: 10 }} label={{ value: 'Net Margin %', position: 'insideBottom', offset: -5, fontSize: 10 }} />
                                <YAxis type="number" dataKey="tacosPct" name="TACoS" unit="%" tick={{ fontSize: 10 }} label={{ value: 'TACoS % (Cost/Rev)', angle: -90, position: 'insideLeft', fontSize: 10 }} />
                                <ZAxis type="number" dataKey="revenue" range={[100, 1000]} name="Revenue" />
                                <RechartsTooltip cursor={{ strokeDasharray: '3 3' }} content={({ active, payload }) => {
                                    if (active && payload?.length) {
                                        const d = payload[0].payload;
                                        return (
                                            <div style={{ background: '#fff', padding: 12, border: '1px solid #e5e7eb', borderRadius: 8, boxShadow: '0 4px 20px rgba(0,0,0,0.12)', fontSize: 12 }}>
                                                <div style={{ fontWeight: 700, color: '#111827', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #f3f4f6' }}>{d.platform}</div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}><span style={{ color: '#9ca3af' }}>Revenue:</span><span className="v-num v-bold" style={{ color: '#4f46e5' }}>{formatMoney(d.revenue, 0)}</span></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 4 }}><span style={{ color: '#9ca3af' }}>Net Margin:</span><span className={d.marginPct < 15 ? 'v-neg' : 'v-num'} style={d.marginPct >= 15 ? { color: '#059669' } : undefined}>{formatPct(d.marginPct)}</span></div>
                                                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16 }}><span style={{ color: '#9ca3af' }}>TACoS:</span><span className="v-num" style={{ color: d.tacosPct > 15 ? '#ea580c' : '#374151' }}>{formatPct(d.tacosPct)}</span></div>
                                            </div>
                                        );
                                    }
                                    return null;
                                }} />
                                <ReferenceLine x={15} stroke="#10b981" strokeDasharray="3 3" label={{ value: 'Min Margin (15%)', position: 'insideTopRight', fill: '#10b981', fontSize: 10, angle: 90 }} />
                                <ReferenceLine y={15} stroke="#ef4444" strokeDasharray="3 3" label={{ value: 'Max TACoS (15%)', position: 'insideTopRight', fill: '#ef4444', fontSize: 10 }} />
                                <ReferenceArea x1={15} y2={15} fill="green" fillOpacity={0.05} label={{ value: 'Efficient', position: 'center', fill: '#15803d', fontSize: 12, fontWeight: 'bold', opacity: 0.3 }} />
                                <ReferenceArea x2={15} y1={15} fill="red" fillOpacity={0.05} label={{ value: 'Bleeding', position: 'center', fill: '#b91c1c', fontSize: 12, fontWeight: 'bold', opacity: 0.3 }} />
                                <ReferenceArea x1={15} y1={15} fill="orange" fillOpacity={0.05} label={{ value: 'High TACoS', position: 'center', fill: '#c2410c', fontSize: 12, fontWeight: 'bold', opacity: 0.3 }} />
                                <ReferenceArea x2={15} y2={15} fill="gray" fillOpacity={0.05} label={{ value: 'Low Margin', position: 'center', fill: '#374151', fontSize: 12, fontWeight: 'bold', opacity: 0.3 }} />
                                <Scatter data={roiData.filter((d: any) => d.dataQuality.hasAdData)}>
                                    {roiData.filter((d: any) => d.dataQuality.hasAdData).map((entry: any, i: number) => (
                                        <Cell key={i} fill={pricingRules[entry.platform]?.color || themeColor} />
                                    ))}
                                </Scatter>
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                <div style={{ background: 'linear-gradient(135deg,#1e1b4b,#312e81)', borderRadius: 12, padding: 24, color: '#fff', position: 'relative', overflow: 'hidden' }}>
                    <h3 style={{ fontWeight: 700, fontSize: 18, marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Trophy style={{ width: 20, height: 20, color: '#fbbf24' }} />ROI Leaderboard
                    </h3>
                    <p style={{ fontSize: 10, color: '#a5b4fc', marginBottom: 16, opacity: 0.9 }}>Post-Ad Profitability (&gt;1.0x = Safe)</p>
                    <div className="space-y-4">
                        {filteredForLeaderboard.sort((a: any, b: any) => (b.roiAfterAds || 0) - (a.roiAfterAds || 0)).slice(0, 3).map((d: any) => (
                            <div key={d.platform} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <div style={{ fontWeight: 700, fontSize: 14 }}>{d.platform}</div>
                                    <div style={{ fontSize: 10, color: '#a5b4fc', opacity: 0.8 }}>Ads: {formatMoney(d.adSpend, 0)}</div>
                                </div>
                                <div style={{ fontSize: 18, fontWeight: 700, fontFamily: 'monospace' }}>{d.roiAfterAds?.toFixed(2)}x</div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="sello-glass rounded-xl overflow-hidden">
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--glass-divider)', background: 'var(--glass-head-bg)', display: 'flex', alignItems: 'center' }}>
                    <h3 style={{ fontWeight: 700, fontSize: 13, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 6 }}><Coins style={{ width: 14, height: 14, color: '#f59e0b' }} />Fees Table</h3>
                </div>
                <div className="sello-table-scroll">
                    <table className="sello-table">
                        <thead>
                            <tr>
                                <SortableHeader label="Platform" sortKey="name" sort={sort} onChange={setSort as any} />
                                <SortableHeader label="Revenue" sortKey="revenue" sort={sort} onChange={setSort as any} tint="blue" align="right" />
                                <th className="r">Profit (Gross)</th>
                                <SortableHeader label="Margin %" sortKey="margin" sort={sort} onChange={setSort as any} align="right" />
                                <th className="r">Ad Spend</th>
                                <th className="r">TACoS %</th>
                                <th className="r col-green">Net Profit</th>
                                <th className="r col-green">ROI After Ads</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortRows(roiData, sort as any, (row: any, key: string) => row[key] || 0).map((d: any) => {
                                const isCostBased = pricingRules[d.platform]?.pricingControl === 'PLATFORM_COST_BASED';
                                return (
                                    <tr key={d.platform}>
                                        <td><span style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{d.platform}</span></td>
                                        <td className="r col-blue">
                                            <span className="v-num">{formatMoney(d.revenue, 0)}</span>
                                            {isCostBased && <span style={{ display: 'block', fontSize: 8, color: '#94a3b8', textTransform: 'uppercase', marginTop: 1 }}>Cost Basis</span>}
                                        </td>
                                        <td className="r"><span className="v-num">{formatMoney(d.profit, 0)}</span></td>
                                        <td className="r"><span className="v-num v-bold">{formatPct(d.marginPct)}</span></td>
                                        <td className="r"><span className="v-num" style={{ color: '#d97706' }}>{formatMoney(d.adSpend, 0)}</span></td>
                                        <td className="r"><span className="v-num">{formatPct(d.tacosPct)}</span></td>
                                        <td className="r col-green"><span className={d.netAfterAds >= 0 ? 'v-num v-bold' : 'v-neg v-bold'}>{formatMoney(d.netAfterAds, 0)}</span></td>
                                        <td className="r col-green"><span className="v-num v-bold" style={{ color: '#4f46e5' }}>{d.roiAfterAds?.toFixed(2)}x</span></td>
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
