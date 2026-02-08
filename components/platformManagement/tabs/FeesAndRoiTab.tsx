
import React from 'react';
import { Megaphone, PieChart, Zap, Target, Trophy, Coins, Database, Wallet, HelpCircle } from 'lucide-react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell, ReferenceLine, ReferenceArea } from 'recharts';
import { SortState, sortRows } from '../../../utils/tableSort';
import { SortableHeader } from '../../common/SortableHeader';
import { formatMoney, formatPct } from '../../../utils/format';
import { PlatformFeesRoi, PlatformSortKey } from '../platformManagement.types';
import { PricingRules, PlatformConfig } from '../../../types';

interface FeesAndRoiTabProps {
    roiData: PlatformFeesRoi[];
    pricingRules: PricingRules;
    themeColor: string;
    sort: SortState<PlatformSortKey>;
    setSort: (sort: SortState<PlatformSortKey>) => void;
}

export const FeesAndRoiTab: React.FC<FeesAndRoiTabProps> = ({ roiData, pricingRules, themeColor, sort, setSort }) => {
    const totalAdSpend = roiData.reduce((sum: number, d: any) => sum + d.adSpend, 0);
    const totalRevenueForAds = roiData.reduce((sum: number, d: any) => (d.dataQuality.hasAdData && d.revenue > 0) ? sum + d.revenue : sum, 0);
    const avgTacos = totalRevenueForAds > 0 ? (totalAdSpend / totalRevenueForAds) * 100 : 0;
    const totalNetProfit = roiData.reduce((sum: number, d: any) => d.dataQuality.hasAdData ? (sum + d.netAfterAds) : sum, 0);
    const avgRoi = totalAdSpend > 0 ? (totalNetProfit / totalAdSpend) : 0;
    const filteredForLeaderboard = [...roiData].filter(d => d.dataQuality.hasAdData && d.adSpend > 0);

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-orange-50 text-orange-600 rounded-lg"><Megaphone className="w-6 h-6" /></div>
                <div><span className="text-xs font-medium text-gray-400 uppercase">Total Ad Spend</span><div className="text-2xl font-black text-gray-900">{formatMoney(totalAdSpend, 0)}</div></div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg"><PieChart className="w-6 h-6" /></div>
                <div><span className="text-xs font-medium text-gray-400 uppercase">Average TACoS</span><div className={`text-2xl font-black ${avgTacos > 15 ? 'text-red-600' : 'text-gray-900'}`}>{formatPct(avgTacos)}</div></div>
            </div>
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                <div className="p-3 bg-green-50 text-green-600 rounded-lg"><Zap className="w-6 h-6" /></div>
                <div><span className="text-xs font-medium text-gray-400 uppercase">Global Ad ROI</span><div className={`text-2xl font-black ${avgRoi < 0 ? 'text-red-600' : 'text-green-700'}`}>{avgRoi.toFixed(2)}x</div></div>
            </div>
        </div>
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                <div className="flex items-center justify-between mb-2">
                    <div>
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <Target className="w-4 h-4 text-indigo-500" />
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
                                                        <span className="font-mono font-bold text-indigo-600">
                                                            {formatMoney(data.revenue, 0)}
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
                    {filteredForLeaderboard.sort((a: any, b: any) => (b.roiAfterAds || 0) - (a.roiAfterAds || 0)).slice(0, 3).map((d: any, i: number) => (
                        <div key={d.platform} className="flex items-center justify-between">
                            <div>
                                <div className="font-bold text-sm">{d.platform}</div>
                                <div className="text-[10px] text-indigo-300 opacity-80">Ads: {formatMoney(d.adSpend, 0)}</div>
                            </div>
                            <div className="text-lg font-black">{d.roiAfterAds?.toFixed(2)}x</div>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden"><div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center"><h3 className="font-bold text-gray-800 text-sm flex items-center gap-2"><Coins className="w-4 h-4 text-amber-500" />Fees Table</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-sm whitespace-nowrap"><thead className="bg-gray-50/50 text-gray-500 font-semibold border-b border-gray-200/50"><tr><SortableHeader label="Platform" sortKey="name" sort={sort} onChange={setSort as any} themeColor={themeColor} /><SortableHeader label="Revenue" sortKey="revenue" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" /><th className="px-4 py-3 text-right">Profit (Gross)</th><SortableHeader label="Margin %" sortKey="margin" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" /><th className="px-4 py-3 text-right">Ad Spend</th><th className="px-4 py-3 text-right">TACoS %</th><th className="px-4 py-3 text-right bg-green-50/30">Net Profit</th><th className="px-4 py-3 text-right bg-green-50/30">ROI After Ads</th></tr></thead><tbody className="divide-y divide-gray-100/50">{sortRows(roiData, sort as any, (row: any, key: string) => row[key] || 0).map((d: any) => (<tr key={d.platform} className="even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors"><td className="p-4 font-bold text-gray-900">{d.platform}</td><td className="p-4 text-right">{formatMoney(d.revenue, 0)}</td><td className="p-4 text-right">{formatMoney(d.profit, 0)}</td><td className="p-4 text-right font-bold">{formatPct(d.marginPct)}</td><td className="p-4 text-right text-orange-700">{formatMoney(d.adSpend, 0)}</td><td className="p-4 text-right">{formatPct(d.tacosPct)}</td><td className="p-4 text-right font-bold text-green-700">{formatMoney(d.netAfterAds, 0)}</td><td className="p-4 text-right font-black text-indigo-700">{d.roiAfterAds?.toFixed(2)}x</td></tr>))}</tbody></table></div></div>
      </div>
    );
};
