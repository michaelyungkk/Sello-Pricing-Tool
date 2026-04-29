
import React, { useMemo, useState } from 'react';
import { DollarSign, Tag, TrendingUp, TrendingDown, ArrowRight, Info, Users, Clock, LayoutGrid, ExternalLink } from 'lucide-react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, ReferenceArea, ReferenceLine, ReferenceDot, Tooltip as RechartsTooltip, Legend, BarChart, Bar, ComposedChart, Line } from 'recharts';
import { PriceChangeHistoryPanel } from '../../strategy/PriceChangeHistoryPanel';
import { OptimalPriceCard } from '../parts/OptimalPriceCard';
import { Product, PriceLog, OptimalPriceResult, PricePoint } from '../../../types';
import { formatMoney, formatSmartMoney } from '../../../utils/format';
import { asDateKey, addDaysToDateKey } from '../../../services/dateUtils';

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
    formatYAxis?: (val: any) => string;
    optimalPrice: number;
    optimalPriceResult?: OptimalPriceResult;   // new: full result
    currentPrice: number;
    siblings: Product[];
    isInFamily: boolean;
    priceHistoryMap: Map<string, PriceLog[]>;
    onOpenSiblingDeepDive?: (sku: string) => void;
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
    themeColor,
    optimalPrice,
    optimalPriceResult,
    currentPrice,
    siblings,
    isInFamily,
    priceHistoryMap,
    onOpenSiblingDeepDive
}) => {
    const [viewMode, setViewMode] = useState<'deviation' | 'velocity'>('deviation');

    // Calculate total volume for share % calculation
    const totalVolume = useMemo(() => {
        return priceVolumeAnalysis.pointsTable.reduce((sum: number, pt: any) => sum + pt.qty, 0);
    }, [priceVolumeAnalysis.pointsTable]);

    const siblingColors = ['#64748b', '#f59e0b', '#14b8a6', '#f43f5e', '#8b5cf6', '#ec4899'];

    const aggregatedFamilyVelocityData = useMemo(() => {
        if (!isInFamily || !startKey || !endKey) return [];

        const allFamilySkus = [productSku, ...siblings.map(s => s.sku)];
        const data: any[] = [];

        // 1. Determine Bucket Strategy
        let bucketSize: 'daily' | 'weekly' | 'monthly' = 'daily';
        if (chartPeriod === '30 Days' || chartPeriod === '90 Days') bucketSize = 'weekly';
        if (chartPeriod === 'All') bucketSize = 'monthly';

        // 2. Generate Buckets
        const startDate = new Date(startKey);
        const endDate = new Date(endKey);

        if (bucketSize === 'daily') {
            let curr = startKey;
            while (curr <= endKey) {
                const d = new Date(curr);
                const label = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                data.push({ period: label, dateKey: curr });
                curr = addDaysToDateKey(curr, 1);
            }
        } else if (bucketSize === 'weekly') {
            let curr = startKey;
            let weekCount = 1;
            while (curr <= endKey) {
                const weekEnd = addDaysToDateKey(curr, 6);
                const actualEnd = weekEnd > endKey ? endKey : weekEnd;

                const dStart = new Date(curr);
                const dEnd = new Date(actualEnd);
                const label = `${dStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} - ${dEnd.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;

                data.push({
                    period: label,
                    start: curr,
                    end: actualEnd,
                    weekLabel: `Week ${weekCount++}`
                });
                curr = addDaysToDateKey(actualEnd, 1);
            }
        } else { // monthly
            let curr = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
            while (curr <= endDate) {
                const monthEnd = new Date(curr.getFullYear(), curr.getMonth() + 1, 0);
                const mStartKey = asDateKey(curr)!;
                const mEndKey = asDateKey(monthEnd)!;

                const label = curr.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
                data.push({
                    period: label,
                    start: mStartKey,
                    end: mEndKey
                });
                curr = new Date(curr.getFullYear(), curr.getMonth() + 1, 1);
            }
        }

        // 3. Fill Buckets with Data
        allFamilySkus.forEach(sku => {
            const logs = priceHistoryMap.get(sku) || [];
            data.forEach(bucket => {
                let units = 0;
                if (bucketSize === 'daily') {
                    units = logs
                        .filter(l => asDateKey(l.date) === bucket.dateKey)
                        .reduce((sum, l) => sum + (l.velocity || 0), 0);
                } else {
                    units = logs
                        .filter(l => {
                            const d = asDateKey(l.date);
                            return d && d >= bucket.start && d <= bucket.end;
                        })
                        .reduce((sum, l) => sum + (l.velocity || 0), 0);
                }
                bucket[sku] = units;
            });
        });

        return data;
    }, [isInFamily, siblings, productSku, priceHistoryMap, chartPeriod, startKey, endKey]);

    const familySkus = [productSku, ...siblings.map(s => s.sku)];

    // ── Inline Profit Curve Chart (same spec as modal in Session 4)
    const ProfitCurveChart: React.FC<{ result?: OptimalPriceResult; currentPrice: number }> = ({ result: r, currentPrice: cp }) => {
        if (!r) {
            return (
                <div className="w-full h-full flex items-center justify-center text-gray-400 text-sm">
                    No optimal price data available for this SKU yet.
                </div>
            );
        }
        const pricePoints: PricePoint[] = r.skuPricePoints;
        const recommendedPrice = r.recommendedPrice;
        const cohortElasticity = r.cohort.elasticity;
        const cohortVelocity = r.cohort.medianVelocity;
        const costs = 0; // costs not available in this context — guardrail zone omitted

        const allPrices = pricePoints.map(p => p.price);
        const lo = allPrices.length > 0 ? Math.min(...allPrices) * 0.9 : cp * 0.7;
        const hi = Math.max(cp, recommendedPrice) * 1.15;
        const xMin = Math.min(lo, cp * 0.85);
        const xMax = hi;

        const organicData = pricePoints.filter(p => p.source === 'organic').map(p => ({
            x: p.price, y: p.dailyProfit, price: p.price, source: 'organic',
            velocity: p.velocity, margin: p.margin, dailyProfit: p.dailyProfit, eraId: p.eraId,
        }));
        const promoData = pricePoints.filter(p => p.source === 'promo').map(p => ({
            x: p.price, y: p.dailyProfit, price: p.price, source: 'promo',
            velocity: p.velocity, margin: p.margin, dailyProfit: p.dailyProfit, eraId: p.eraId,
        }));
        // Organic points only, 2+ distinct prices required — avoids vertical spikes
        // when promo and organic share the same price on the x axis
        const organicSorted = [...pricePoints]
            .filter(p => p.source === 'organic')
            .sort((a, b) => a.price - b.price);
        const distinctOrganicPrices = new Set(organicSorted.map(p => p.price)).size;
        const curveData = distinctOrganicPrices >= 2
            ? organicSorted.map(p => ({ x: p.price, y: p.dailyProfit, price: p.price, dailyProfit: p.dailyProfit }))
            : [];
        const STEPS = 40;
        const bucketMid = (xMin + xMax) / 2;
        const cohortCurveData = Array.from({ length: STEPS + 1 }, (_, i) => {
            const price = xMin + (i / STEPS) * (xMax - xMin);
            const margin = price - costs;
            if (margin <= 0) return null;
            const vf = 1 + cohortElasticity * ((price - bucketMid) / (bucketMid || 1));
            const estV = cohortVelocity * Math.max(0, vf);
            return { x: price, y: margin * estV, price, dailyProfit: margin * estV };
        }).filter((d): d is NonNullable<typeof d> => d !== null);

        const hasNoData = pricePoints.length === 0;
        const interpolateY = (series: Array<{ x: number; y: number }>, x: number): number | null => {
            if (!series.length) return null;
            const sorted = [...series].sort((a, b) => a.x - b.x);
            if (x < sorted[0].x || x > sorted[sorted.length - 1].x) return null;
            for (let i = 0; i < sorted.length; i++) {
                const point = sorted[i];
                if (Math.abs(point.x - x) < 0.0001) return point.y;
                if (i < sorted.length - 1) {
                    const next = sorted[i + 1];
                    if (x >= point.x && x <= next.x) {
                        const span = next.x - point.x;
                        if (Math.abs(span) < 0.0001) return point.y;
                        const ratio = (x - point.x) / span;
                        return point.y + ratio * (next.y - point.y);
                    }
                }
            }
            return null;
        };
        const primaryCurve = curveData.length >= 2 ? curveData : cohortCurveData;
        const currentProfitAtPrice = interpolateY(primaryCurve, cp);
        const recommendedProfitAtPrice = interpolateY(primaryCurve, recommendedPrice);
        const renderProfitLabel = (
            text: string,
            tone: 'neutral' | 'positive',
            align: 'left' | 'right'
        ) => (props: any) => {
            const x = Number(props?.viewBox?.x ?? 0);
            const y = Number(props?.viewBox?.y ?? 0);
            const padX = 5;
            const boxH = 16;
            const approxW = Math.max(36, text.length * 6 + (padX * 2));
            const dx = align === 'left' ? -(approxW + 8) : 8;
            const dy = -20;
            const bg = tone === 'positive' ? '#ecfdf5' : '#f3f4f6';
            const stroke = tone === 'positive' ? '#86efac' : '#d1d5db';
            const color = tone === 'positive' ? '#065f46' : '#374151';
            return (
                <g transform={`translate(${x + dx}, ${y + dy})`}>
                    <rect x={0} y={0} rx={4} ry={4} width={approxW} height={boxH} fill={bg} stroke={stroke} />
                    <text x={padX} y={11} fontSize={9} fontWeight={700} fill={color}>{text}</text>
                </g>
            );
        };

        return (
            <div className="w-full h-full flex flex-col">
                <div className="relative flex-1 min-h-0">
                    {hasNoData && (
                        <div className="absolute top-2 left-0 right-0 flex justify-center z-10 pointer-events-none">
                            <span className="bg-gray-800/80 text-white text-[10px] px-3 py-1 rounded-full">
                                No sales history — curve based on benchmark
                            </span>
                        </div>
                    )}
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart margin={{ top: 24, right: 20, left: 10, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                        <XAxis type="number" dataKey="x" domain={[xMin, xMax]} tickFormatter={(v) => `£${Number(v).toFixed(0)}`} tick={{ fontSize: 10 }} label={{ value: 'Price (£)', position: 'insideBottom', offset: -8, fontSize: 10, fill: '#9ca3af' }} />
                        <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => `£${Number(v).toFixed(2)}`} label={{ value: 'Daily Profit', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#9ca3af' }} />
                        <RechartsTooltip
                            content={({ active, payload }: any) => {
                                if (!active || !payload?.length) return null;
                                const d = payload[0]?.payload;
                                if (!d) return null;
                                const isOpt = Math.abs(d.price - recommendedPrice) < 0.5;
                                return (
                                    <div className="bg-gray-900 text-white p-3 rounded-xl text-[11px] min-w-[160px] border border-gray-700">
                                        <div className="font-bold text-indigo-300 mb-1">{formatSmartMoney(d.price)}{isOpt ? ' ★' : ''}</div>
                                        {d.velocity != null && <div className="text-gray-400">Velocity: {d.velocity.toFixed(2)}/day</div>}
                                        <div className={isOpt ? 'font-bold text-emerald-300' : ''}>Profit: {formatSmartMoney(d.dailyProfit ?? d.y)}</div>
                                    </div>
                                );
                            }}
                        />
                        {cohortCurveData.length > 0 && (
                            <Line data={cohortCurveData} type="monotone" dataKey="y" stroke="#9ca3af" strokeWidth={1.5} strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                        )}
                        {curveData.length >= 3 && (
                            <Line data={curveData} type="monotone" dataKey="y" stroke='var(--theme)' strokeWidth={2} dot={false} isAnimationActive={false} />
                        )}
                        {organicData.length > 0 && <Scatter data={organicData} fill='var(--theme)' name="Organic" />}
                        {promoData.length > 0 && <Scatter data={promoData} fill="none" stroke="#f59e0b" strokeWidth={2} name="Promo" />}
                        {(() => {
                            const priceDiff = Math.abs(recommendedPrice - cp);
                            const xRange = xMax - xMin;
                            const tooClose = xRange > 0 && (priceDiff / xRange) < 0.08;
                            return (
                                <ReferenceLine
                                    x={cp}
                                    stroke="#6b7280"
                                    strokeWidth={1.5}
                                    strokeDasharray="4 3"
                                    label={{ value: `Current ${formatSmartMoney(cp)}`, position: tooClose ? 'insideTopLeft' : 'top', fontSize: 9, fill: '#6b7280', ...(tooClose ? { dy: 28 } : {}) }}
                                />
                            );
                        })()}
                        {currentProfitAtPrice !== null && (
                            <ReferenceDot
                                x={cp}
                                y={currentProfitAtPrice}
                                r={4}
                                fill="#374151"
                                stroke="#ffffff"
                                strokeWidth={1.5}
                                label={renderProfitLabel(formatSmartMoney(currentProfitAtPrice), 'neutral', 'left')}
                            />
                        )}
                        {recommendedProfitAtPrice !== null && (
                            <ReferenceDot
                                x={recommendedPrice}
                                y={recommendedProfitAtPrice}
                                r={4}
                                fill="#10b981"
                                stroke="#ffffff"
                                strokeWidth={1.5}
                                label={renderProfitLabel(formatSmartMoney(recommendedProfitAtPrice), 'positive', 'right')}
                            />
                        )}
                        <ReferenceLine x={recommendedPrice} stroke="#10b981" strokeWidth={2} label={{ value: `Optimal ${formatSmartMoney(recommendedPrice)} ★`, position: 'top', fontSize: 9, fill: '#10b981' }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
                <div className="mt-2 px-2">
                    <div className="rounded-lg border border-gray-200 bg-white/95 px-3 py-2 text-[10px] text-gray-600 shadow-sm w-fit">
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-5 border-t border-dashed border-gray-400"></span>
                                <span>Peer benchmark curve</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block w-5 border-t-2 border-theme"></span>
                                <span>SKU profit curve</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block h-3 border-l border-dashed border-gray-500"></span>
                                <span>Current price</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="inline-block h-3 border-l-2 border-emerald-500"></span>
                                <span>Recommended price</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    // ── Profit Curve Price Points Table
    const ProfitCurveTable: React.FC<{ result: OptimalPriceResult }> = ({ result: r }) => (
        <div className="mt-4">
            {r.aliasesUsed.length > 0 && (
                <p className="text-xs text-gray-500 mb-2">
                    Includes data from: <span className="font-medium text-gray-700">{r.aliasesUsed.join(', ')}</span>
                </p>
            )}
            {r.skuPricePoints.length === 0 ? (
                <p className="text-xs text-gray-400 italic">No price points — no eligible sales history.</p>
            ) : (
                <table className="sello-table text-xs">
                    <thead><tr>
                        <th className="text-left">Era</th>
                        <th className="r">Price</th>
                        <th className="r">Source</th>
                        <th className="r">Weeks</th>
                        <th className="r">Velocity</th>
                        <th className="r">Margin</th>
                        <th className="r">Daily Profit</th>
                    </tr></thead>
                    <tbody>
                        {r.skuPricePoints.map((p, i) => {
                            const isOpt = Math.abs(p.price - r.recommendedPrice) < 0.5;
                            const isPromo = p.source === 'promo';
                            return (
                                <tr key={i} className={isOpt ? 'bg-emerald-50' : isPromo ? 'bg-amber-50/40' : ''}>
                                    <td className="font-mono text-[10px] text-gray-500">{p.eraId}</td>
                                    <td className="r font-bold">{formatSmartMoney(p.price)}{isOpt ? ' ★' : ''}</td>
                                    <td className="r">
                                        {isPromo
                                            ? <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">↓{Math.round((p.promoDiscountPct ?? 0) * 100)}%</span>
                                            : <span className="text-theme font-medium">Organic</span>
                                        }
                                    </td>
                                    <td className="r">{p.weekCount ?? '—'}</td>
                                    <td className="r">{p.velocity.toFixed(2)}/day</td>
                                    <td className="r">{formatSmartMoney(p.margin)}</td>
                                    <td className={`r font-bold ${isOpt ? 'text-emerald-700' : ''}`}>{formatSmartMoney(p.dailyProfit)}</td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-4">
                    <div className="flex justify-between items-center min-h-[42px]">
                        <div className="flex items-center gap-4">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                {viewMode === 'deviation' ? (
                                    <>
                                        <DollarSign className="w-5 h-5 text-green-600" />
                                        Price Deviation vs Volume
                                    </>
                                ) : (
                                    <>
                                        <TrendingUp className="w-5 h-5 text-theme" />
                                        Family Sales Velocity
                                    </>
                                )}
                            </h3>

                            {isInFamily && (
                                <div className="flex items-center">
                                    <div className="flex bg-gray-100 p-1 rounded-full border border-gray-200 shadow-inner">
                                        <button
                                            onClick={() => setViewMode('deviation')}
                                            className={`px-4 py-1.5 text-[10px] font-bold rounded-full transition-all flex items-center gap-2 ${viewMode === 'deviation' ? 'bg-white shadow-sm text-theme' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            <LayoutGrid className="w-3.5 h-3.5" /> Price Deviation
                                        </button>
                                        <button
                                            onClick={() => setViewMode('velocity')}
                                            className={`px-4 py-1.5 text-[10px] font-bold rounded-full transition-all flex items-center gap-2 ${viewMode === 'velocity' ? 'bg-white shadow-sm text-theme' : 'text-gray-500 hover:text-gray-700'}`}
                                        >
                                            <TrendingUp className="w-3.5 h-3.5" /> Family Velocity
                                        </button>
                                    </div>
                                    <div className="mx-4 h-6 w-px bg-gray-200"></div>
                                </div>
                            )}
                        </div>

                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            {['7 Days', '14 Days', '30 Days', '90 Days', 'All'].map(p => (
                                <button
                                    key={p}
                                    onClick={() => setChartPeriod(p)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${chartPeriod === p ? 'bg-white text-theme shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                >
                                    {p}
                                </button>
                            ))}
                            <button
                                onClick={() => setChartPeriod('profit-curve')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${chartPeriod === 'profit-curve' ? 'bg-white text-emerald-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Profit Curve
                            </button>
                        </div>
                    </div>

                    <div className="bg-custom-glass backdrop-blur-custom p-4 rounded-xl border border-custom-glass shadow-sm flex flex-col h-[420px] select-none relative">
                        {chartPeriod === 'profit-curve' ? (
                            <ProfitCurveChart result={optimalPriceResult} currentPrice={currentPrice} />
                        ) : viewMode === 'deviation' ? (
                            <>
                                <div className="flex justify-between items-start mb-4 shrink-0">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase font-mono">
                                        Aggregated Volume by Price Delta
                                    </h4>
                                    <div className="text-[10px] text-gray-400 flex items-center gap-2">
                                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 opacity-20 rounded-full"></div> Safe ({'>'} -5%)</span>
                                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-500 opacity-20 rounded-full"></div> Moderate (-5% to -15%)</span>
                                        <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 opacity-20 rounded-full"></div> Severe ({'<'} -15%)</span>
                                    </div>
                                </div>

                                <div className="w-full flex-1 min-h-0">
                                    {filteredChartData.length === 0 ? (
                                        <div className="w-full h-full flex flex-col items-center justify-center text-gray-400">
                                            <Info className="w-8 h-8 mb-2 opacity-50" />
                                            <span className="text-sm font-medium">No comparable sell-price data</span>
                                            <span className="text-xs opacity-75">(cost-based platforms excluded)</span>
                                        </div>
                                    ) : (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis type="category" dataKey="period" name="Period" allowDuplicatedCategory={false} tick={{ fontSize: 11, fontWeight: 500 }} axisLine={false} tickLine={false} />
                                                <YAxis type="number" dataKey="delta" name="Price Deviation" unit="£" domain={['auto', 'auto']} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} label={{ value: 'Price Deviation (£)', angle: -90, position: 'insideLeft', style: { fontSize: 10, fill: '#94a3b8' } }} />
                                                <ZAxis type="number" dataKey="totalQty" range={[60, 600]} name="Volume" />

                                                <ReferenceArea y1={priceVolumeAnalysis.thresholds.amber} y2={1000} fill="green" fillOpacity={0.05} />
                                                <ReferenceArea y1={priceVolumeAnalysis.thresholds.red} y2={priceVolumeAnalysis.thresholds.amber} fill="orange" fillOpacity={0.05} />
                                                <ReferenceArea y1={-1000} y2={priceVolumeAnalysis.thresholds.red} fill="red" fillOpacity={0.05} />

                                                <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" label={{ value: 'Ref Price', position: 'right', fill: '#6b7280', fontSize: 10 }} />

                                                <Scatter
                                                    name="Price Bands"
                                                    data={filteredChartData}
                                                    fill="#818cf8"
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
                                    )}
                                </div>

                                <div className="mt-2 h-10 bg-gray-50 rounded-lg border border-gray-100 flex items-center px-4 text-xs shrink-0">
                                    {hoveredBubble ? (
                                        <div className="flex flex-wrap items-center gap-4 w-full animate-in fade-in duration-200">
                                            <span className="font-medium text-gray-900 bg-white px-2 py-0.5 rounded shadow-sm border border-gray-200">{hoveredBubble.period}</span>
                                            <div className="h-4 w-px bg-gray-300 hidden sm:block"></div>
                                            <span className="text-gray-600">Band: <strong>{hoveredBubble.delta > 0 ? '+' : ''}{formatSmartMoney(hoveredBubble.delta)}</strong></span>
                                            <span className="text-gray-600">Avg Selling Price: <strong>£{hoveredBubble.tooltipPrice}</strong></span>
                                            <span className="text-gray-600">Vol: <strong className="text-gray-900">{hoveredBubble.totalQty}</strong></span>
                                        </div>
                                    ) : (
                                        <span className="text-gray-400 italic flex items-center gap-2">
                                            <Info className="w-4 h-4" /> Hover over a bubble to see aggregated volume details
                                        </span>
                                    )}
                                </div>
                            </>
                        ) : (
                            <div className="w-full flex-1 flex flex-col min-h-0">
                                <div className="flex justify-between items-start mb-4 shrink-0">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase font-mono">
                                        Family Sales Velocity ({chartPeriod})
                                    </h4>
                                    <div className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">
                                        Units per bucket
                                    </div>
                                </div>
                                <div className="flex-1 min-h-0">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart
                                            data={aggregatedFamilyVelocityData}
                                            margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
                                            barGap={4}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis
                                                dataKey="period"
                                                tick={{ fontSize: 10, fontWeight: 500, fill: '#64748b' }}
                                                axisLine={false}
                                                tickLine={false}
                                                interval={chartPeriod === '7 Days' ? 0 : undefined}
                                            />
                                            <YAxis
                                                tick={{ fontSize: 11, fill: '#94a3b8' }}
                                                axisLine={false}
                                                tickLine={false}
                                            />
                                            <RechartsTooltip
                                                cursor={{ fill: '#f8fafc' }}
                                                contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', padding: '12px' }}
                                                itemStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                                            />
                                            <Legend
                                                verticalAlign="bottom"
                                                align="center"
                                                iconType="circle"
                                                wrapperStyle={{ fontSize: '10px', paddingTop: '20px', fontWeight: 'bold', color: '#64748b' }}
                                            />
                                            {familySkus.map((sku, index) => (
                                                <Bar
                                                    key={sku}
                                                    dataKey={sku}
                                                    name={sku === productSku ? `${sku} (Target)` : sku}
                                                    fill={sku === productSku ? themeColor : siblingColors[index % siblingColors.length]}
                                                    radius={[4, 4, 0, 0]}
                                                    animationDuration={1500}
                                                />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        )}
                    </div>

                    <PriceChangeHistoryPanel
                        history={priceChangeHistory}
                        sku={productSku}
                        windowStart={startKey}
                        windowEnd={endKey}
                        themeColor={themeColor}
                    />

                    {/* Profit Curve price points table */}
                    {chartPeriod === 'profit-curve' && optimalPriceResult && (
                        <ProfitCurveTable result={optimalPriceResult} />
                    )}
                </div>

                <div className="space-y-4">
                    <div className="flex justify-between items-center min-h-[42px]">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Tag className="w-5 h-5 text-purple-600" />
                            Price Points
                        </h3>
                    </div>

                    <div className="bg-custom-glass backdrop-blur-custom rounded-xl border border-custom-glass shadow-sm overflow-hidden h-[420px] overflow-y-auto">
                        <table className="sello-table">
                            <thead className="sticky top-0">
                                <tr>
                                    <th>Price Point</th>
                                    <th className="r">Total Qty</th>
                                    <th className="r">Share %</th>
                                </tr>
                            </thead>
                            <tbody>
                                {priceVolumeAnalysis.pointsTable.map((pt: any, i: number) => {
                                    const isLowest = minPricePoint !== null && pt.price === minPricePoint;
                                    const isHighest = maxPricePoint !== null && pt.price === maxPricePoint;
                                    // Prefer new algorithm result; fall back to legacy optimalPrice
                                    const optimalRef = optimalPriceResult?.recommendedPrice ?? optimalPrice;
                                    const isOptimal = optimalRef && Math.abs(pt.price - optimalRef) < 0.5;
                                    const sharePct = totalVolume > 0 ? (pt.qty / totalVolume) * 100 : 0;

                                    return (
                                        <tr key={i} className={`${isOptimal ? 'bg-theme-10 border-l-4 border-theme' : isLowest ? 'bg-amber-50/30' : isHighest ? 'bg-theme-10/30' : ''}`}>
                                            <td className="font-mono font-bold text-gray-700">
                                                <div className="flex flex-col gap-1">
                                                    <div className="flex items-center gap-2">
                                                        {formatSmartMoney(pt.price)}
                                                        {isOptimal && (
                                                            <span className="text-[9px] bg-theme-10 text-theme px-1.5 py-0.5 rounded border border-theme-20 font-bold uppercase tracking-wide flex items-center gap-1">
                                                                <Tag className="w-2.5 h-2.5" /> Optimal
                                                            </span>
                                                        )}
                                                        {isLowest && !isOptimal && (
                                                            <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 font-medium uppercase tracking-wide flex items-center gap-1">
                                                                <TrendingDown className="w-2.5 h-2.5" /> Lowest
                                                            </span>
                                                        )}
                                                        {isHighest && !isOptimal && (
                                                            <span className="text-[9px] bg-theme-10 text-theme px-1.5 py-0.5 rounded border border-indigo-100 font-medium uppercase tracking-wide flex items-center gap-1">
                                                                <TrendingUp className="w-2.5 h-2.5" /> Highest
                                                            </span>
                                                        )}
                                                    </div>
                                                    {pt.isCostBased && (
                                                        <div className="flex items-center gap-1">
                                                            <span className="text-[8px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded border border-slate-200 uppercase font-medium cursor-help" title="This price point originates from a Cost-Based Platform (e.g. Wayfair). It represents an agreed cost price, not a consumer selling price.">
                                                                Fixed Cost Price
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="r">{pt.qty}</td>
                                            <td className="r text-gray-500 font-medium">{sharePct.toFixed(1)}%</td>
                                        </tr>
                                    );
                                })}
                                {priceVolumeAnalysis.pointsTable.length === 0 && (
                                    <tr><td colSpan={3} className="c p-4 text-gray-400">No data</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>

                    {(optimalPriceResult || (optimalPrice && optimalPrice > 0)) && (
                        <OptimalPriceCard
                            result={optimalPriceResult}
                            optimalPrice={optimalPrice}
                            currentPrice={currentPrice || 0}
                        />
                    )}
                </div>
            </div>

            {isInFamily && (
                <div className="bg-custom-glass backdrop-blur-custom rounded-xl border border-custom-glass shadow-sm overflow-hidden animate-in fade-in slide-in-from-bottom duration-500 delay-150">
                    <div className="p-4 bg-white/10 border-b border-custom-glass flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-custom-glass backdrop-blur-custom p-2 rounded-lg shadow-sm border border-custom-glass">
                                <Users className="w-5 h-5 text-theme" />
                            </div>
                            <div>
                                <h4 className="text-sm font-bold text-gray-800">Family Price Comparison</h4>
                                <p className="text-[10px] text-gray-500">Prices for sibling SKUs in the same family library</p>
                            </div>
                        </div>
                    </div>
                    <div className="sello-table-scroll">
                        <table className="sello-table">
                            <thead>
                                <tr>
                                    <th>Sibling SKU</th>
                                    <th>Product Name</th>
                                    <th className="r">Price (Inc. VAT)</th>
                                    <th className="r">Last Updated</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr className="bg-theme-10/30">
                                    <td>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold text-theme">{productSku}</span>
                                            <span className="text-[8px] bg-theme-10 text-theme px-1.5 py-0.5 rounded-full font-bold uppercase">Current</span>
                                        </div>
                                    </td>
                                    <td>
                                        <div className="text-xs text-gray-900 font-medium truncate max-w-[300px]" title="Current product">This Product</div>
                                    </td>
                                    <td className="r">
                                        <span className="font-mono font-bold text-theme">{formatSmartMoney(currentPrice)}</span>
                                    </td>
                                    <td className="r">
                                        <div className="flex items-center justify-end gap-1.5 text-xs text-gray-400">
                                            <Clock className="w-3.5 h-3.5" />
                                            Active
                                        </div>
                                    </td>
                                </tr>
                                {siblings.map((sib) => (
                                    <tr key={sib.sku} className="">
                                        <td>
                                            <div className="flex items-center gap-2">
                                                <span className="font-mono text-gray-600">{sib.sku}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => onOpenSiblingDeepDive?.(sib.sku)}
                                                    className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] font-bold text-gray-600 hover:bg-gray-50"
                                                    title={`Open deep dive for ${sib.sku}`}
                                                >
                                                    <ExternalLink className="w-3 h-3" />
                                                    Deep Dive
                                                </button>
                                            </div>
                                        </td>
                                        <td>
                                            <div className="text-xs text-gray-600 truncate max-w-[300px]" title={sib.name}>{sib.name}</div>
                                        </td>
                                        <td className="r">
                                            <span className="font-mono font-bold text-gray-900">{formatSmartMoney(sib.caPrice ?? sib.currentPrice)}</span>
                                        </td>
                                        <td className="r">
                                            <div className="flex items-center justify-end gap-1.5 text-xs text-gray-400">
                                                <Clock className="w-3.5 h-3.5" />
                                                {sib.updatedAt ? new Date(sib.updatedAt).toLocaleDateString('en-GB') : 'Unknown'}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {siblings.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="c p-8 text-gray-400 italic text-xs">
                                            No other active siblings found in this family.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};
