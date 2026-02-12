
import React from 'react';
import { DollarSign, Tag, TrendingUp, TrendingDown, ArrowRight, Info } from 'lucide-react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, ReferenceArea, ReferenceLine, Tooltip as RechartsTooltip, Legend } from 'recharts';
import { PriceChangeHistoryPanel } from '../../strategy/PriceChangeHistoryPanel';

interface PricingHistorySectionProps {
    priceVolumeAnalysis: any;
    minPricePoint: number | null;
    maxPricePoint: number | null;
    filteredChartData: any[];
    filteredAvgStats: any[];
    chartPeriod: string;
    setChartPeriod: (p: string) => void;
    hoveredBubble: any;
    setHoveredBubble: (b: any) => void;
    priceChangeHistory: any[];
    productSku: string;
    startKey: string;
    endKey: string;
    themeColor: string;
    formatYAxis?: (val: any) => string; // Optional if needed
}

export const PricingHistorySection: React.FC<PricingHistorySectionProps> = ({
    priceVolumeAnalysis,
    minPricePoint,
    maxPricePoint,
    filteredChartData,
    filteredAvgStats,
    chartPeriod,
    setChartPeriod,
    hoveredBubble,
    setHoveredBubble,
    priceChangeHistory,
    productSku,
    startKey,
    endKey,
    themeColor
}) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
                <div className="flex justify-between items-center">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-green-600" />
                        Price Deviation vs Volume
                    </h3>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        {['7 Days', '30 Days', '90 Days', 'All'].map(p => (
                            <button
                                key={p}
                                onClick={() => setChartPeriod(p)}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${chartPeriod === p ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {p}
                            </button>
                        ))}
                    </div>
                </div>
                
                <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col h-auto select-none">
                    <div className="flex justify-between items-start mb-4">
                        <h4 className="text-xs font-bold text-gray-500 uppercase">
                            Aggregated Volume by Price Delta
                        </h4>
                        <div className="text-[10px] text-gray-400 flex items-center gap-2">
                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 opacity-20 rounded-full"></div> Safe ({'>'} -5%)</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-500 opacity-20 rounded-full"></div> Moderate (-5% to -15%)</span>
                            <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 opacity-20 rounded-full"></div> Severe ({'<'} -15%)</span>
                        </div>
                    </div>

                    <div className="w-full h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="category" dataKey="period" name="Period" allowDuplicatedCategory={false} tick={{fontSize: 12, style: { userSelect: 'none' }}} />
                                <YAxis type="number" dataKey="delta" name="Price Deviation" unit="£" domain={['auto', 'auto']} tick={{fontSize: 12, style: { userSelect: 'none' }}} label={{ value: 'Price Deviation (£)', angle: -90, position: 'insideLeft' }} />
                                <ZAxis type="number" dataKey="totalQty" range={[60, 600]} name="Volume" />
                                
                                <ReferenceArea y1={priceVolumeAnalysis.thresholds.amber} y2={1000} fill="green" fillOpacity={0.05} />
                                <ReferenceArea y1={priceVolumeAnalysis.thresholds.red} y2={priceVolumeAnalysis.thresholds.amber} fill="orange" fillOpacity={0.05} />
                                <ReferenceArea y1={-1000} y2={priceVolumeAnalysis.thresholds.red} fill="red" fillOpacity={0.05} />
                                
                                <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" label={{ value: 'Ref Price', position: 'right', fill: '#6b7280', fontSize: 10 }} />
                                
                                <Scatter 
                                    name="Price Bands" 
                                    data={filteredChartData} 
                                    fill="#8884d8" 
                                    fillOpacity={0.7} 
                                    onMouseEnter={(data) => setHoveredBubble(data.payload)}
                                    onMouseLeave={() => setHoveredBubble(null)}
                                />

                                <Scatter 
                                    name="Weighted Avg" 
                                    data={filteredAvgStats} 
                                    shape="star" 
                                    fill="#be185d" 
                                    legendType="star"
                                />
                            </ScatterChart>
                        </ResponsiveContainer>
                    </div>
                    
                    <div className="mt-2 h-10 bg-gray-50 rounded-lg border border-gray-100 flex items-center px-4 text-xs">
                        {hoveredBubble ? (
                            <div className="flex flex-wrap items-center gap-4 w-full animate-in fade-in duration-200">
                                <span className="font-medium text-gray-900 bg-white px-2 py-0.5 rounded shadow-sm border border-gray-200">{hoveredBubble.period}</span>
                                <div className="h-4 w-px bg-gray-300 hidden sm:block"></div>
                                <span className="text-gray-600">Band: <strong>{hoveredBubble.delta > 0 ? '+' : ''}£{hoveredBubble.delta.toFixed(2)}</strong></span>
                                <span className="text-gray-600">Avg Selling Price: <strong>£{hoveredBubble.tooltipPrice}</strong></span>
                                <span className="text-gray-600">Vol: <strong className="text-gray-900">{hoveredBubble.totalQty}</strong></span>
                            </div>
                        ) : (
                            <span className="text-gray-400 italic flex items-center gap-2">
                                <Info className="w-4 h-4"/> Hover over a bubble to see aggregated volume details
                            </span>
                        )}
                    </div>
                </div>

                <PriceChangeHistoryPanel 
                    history={priceChangeHistory} 
                    sku={productSku}
                    windowStart={startKey}
                    windowEnd={endKey}
                    themeColor={themeColor}
                />
            </div>

            <div className="space-y-4">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <Tag className="w-5 h-5 text-purple-600" />
                    Price Points (90d)
                </h3>
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-[400px] overflow-y-auto">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100 sticky top-0">
                            <tr>
                                <th className="p-3">Price Point</th>
                                <th className="p-3 text-right">Total Qty</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {priceVolumeAnalysis.pointsTable.map((pt: any, i: number) => {
                                const isLowest = minPricePoint !== null && pt.price === minPricePoint;
                                const isHighest = maxPricePoint !== null && pt.price === maxPricePoint;
                                return (
                                    <tr key={i} className={`hover:bg-gray-50 ${isLowest ? 'bg-amber-50/30' : isHighest ? 'bg-indigo-50/30' : ''}`}>
                                        <td className="p-3 font-mono font-bold text-gray-700">
                                            <div className="flex items-center gap-2">
                                                £{pt.price.toFixed(2)}
                                                {isLowest && (
                                                    <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 font-medium uppercase tracking-wide flex items-center gap-1">
                                                        <TrendingDown className="w-2.5 h-2.5" /> Lowest
                                                    </span>
                                                )}
                                                {isHighest && (
                                                    <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100 font-medium uppercase tracking-wide flex items-center gap-1">
                                                        <TrendingUp className="w-2.5 h-2.5" /> Highest
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-3 text-right">{pt.qty}</td>
                                    </tr>
                                );
                            })}
                            {priceVolumeAnalysis.pointsTable.length === 0 && (
                                <tr><td colSpan={2} className="p-4 text-center text-gray-400">No data</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
