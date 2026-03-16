/**
 * PriceElasticityModal.tsx
 *
 * Renamed conceptually to OptimalPriceCurveModal.
 * Filename kept as PriceElasticityModal.tsx so existing imports don't break.
 *
 * Shows the profit-maximising price curve, confidence, reasoning, and
 * full price-points table for a single SKU's OptimalPriceResult.
 */

import React, { useMemo } from 'react';
import { X, AlertTriangle, Clock } from 'lucide-react';
import {
    ComposedChart,
    Scatter,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    ReferenceLine,
    ReferenceArea,
} from 'recharts';
import { GradeBadge } from './GradeBadge';
import { formatSmartMoney } from '../utils/format';
import { Product, OptimalPriceResult, PricePoint, PriceLog, PriceChangeRecord } from '../types';

// ─────────────────────────────────────────────
// Props — accepts new shape OR legacy shape from App.tsx
// ─────────────────────────────────────────────

interface OptimalPriceCurveModalProps {
    product: Product;
    result?: OptimalPriceResult;           // new: full result object
    onClose: () => void;
    // Legacy props (App.tsx call site — still supported)
    priceHistory?: PriceLog[];
    priceChangeHistory?: PriceChangeRecord[];
}

// ─────────────────────────────────────────────
// Confidence Badge
// ─────────────────────────────────────────────

const ConfidenceBadge: React.FC<{ confidence: number; source: string }> = ({ confidence, source }) => {
    if (source === 'COHORT' || confidence < 0.3) {
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded border border-gray-300 text-gray-500">Benchmark</span>;
    }
    if (confidence >= 0.9) {
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-emerald-100 text-emerald-700">High {Math.round(confidence * 100)}%</span>;
    }
    if (confidence >= 0.5) {
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-amber-100 text-amber-700">Medium {Math.round(confidence * 100)}%</span>;
    }
    return <span className="px-2 py-0.5 text-[10px] font-bold rounded bg-gray-100 text-gray-500">Low {Math.round(confidence * 100)}%</span>;
};

// ─────────────────────────────────────────────
// Source label
// ─────────────────────────────────────────────

const SourceLabel: React.FC<{ source: string }> = ({ source }) => {
    const styles: Record<string, string> = {
        SKU_DATA: 'text-indigo-700',
        BLENDED: 'text-amber-600',
        COHORT: 'text-gray-500',
        GUARDRAIL: 'text-red-600',
    };
    const labels: Record<string, string> = {
        SKU_DATA: 'SKU Data',
        BLENDED: 'Blended',
        COHORT: 'Cohort',
        GUARDRAIL: '⚠ Guardrail',
    };
    return <span className={`font-bold text-xs ${styles[source] ?? 'text-gray-600'}`}>{labels[source] ?? source}</span>;
};

// ─────────────────────────────────────────────
// Custom chart tooltip
// ─────────────────────────────────────────────

const ProfitTooltip = ({ active, payload, optimalPrice }: any) => {
    if (!active || !payload || payload.length === 0) return null;
    const d = payload[0]?.payload;
    if (!d) return null;
    const isOptimal = Math.abs(d.price - optimalPrice) < 0.5;
    return (
        <div className="bg-gray-900 text-white p-3 rounded-xl shadow-2xl text-[11px] min-w-[180px] border border-gray-700">
            <div className="font-bold mb-1.5 text-indigo-300">{formatSmartMoney(d.price)}{isOptimal ? ' ★ Optimal' : ''}</div>
            <div className="space-y-0.5">
                <div className="flex justify-between gap-4"><span className="text-gray-400">Source</span><span className="capitalize">{d.source ?? 'cohort'}</span></div>
                {d.eraId && <div className="flex justify-between gap-4"><span className="text-gray-400">Era</span><span>{d.eraId}</span></div>}
                {d.velocity != null && <div className="flex justify-between gap-4"><span className="text-gray-400">Velocity</span><span>{d.velocity.toFixed(2)}/day</span></div>}
                {d.margin != null && <div className="flex justify-between gap-4"><span className="text-gray-400">Margin</span><span>{formatSmartMoney(d.margin)}</span></div>}
                <div className={`flex justify-between gap-4 ${isOptimal ? 'font-bold text-emerald-300' : ''}`}>
                    <span className="text-gray-400">Daily Profit</span>
                    <span>{formatSmartMoney(d.dailyProfit ?? d.y)}</span>
                </div>
            </div>
        </div>
    );
};

// ─────────────────────────────────────────────
// Profit Curve Chart
// ─────────────────────────────────────────────

const ProfitCurveChart: React.FC<{
    pricePoints: PricePoint[];
    currentPrice: number;
    recommendedPrice: number;
    cohortElasticity: number;
    cohortVelocity: number;
    costs: number;
}> = ({ pricePoints, currentPrice, recommendedPrice, cohortElasticity, cohortVelocity, costs }) => {
    const { organicData, promoData, curveData, cohortCurveData, xMin, xMax } = useMemo(() => {
        const allPrices = pricePoints.map(p => p.price);
        const lo = allPrices.length > 0 ? Math.min(...allPrices) * 0.9 : currentPrice * 0.7;
        const hi = Math.max(currentPrice, recommendedPrice) * 1.15;
        const xMin = Math.min(lo, currentPrice * 0.85);
        const xMax = hi;

        const organicData = pricePoints
            .filter(p => p.source === 'organic')
            .map(p => ({
                x: p.price,
                y: p.dailyProfit,
                price: p.price,
                source: 'organic',
                velocity: p.velocity,
                margin: p.margin,
                dailyProfit: p.dailyProfit,
                eraId: p.eraId,
                r: Math.min(12, Math.max(4, (p.weekCount ?? 1) * 2)),
            }));

        const promoData = pricePoints
            .filter(p => p.source === 'promo')
            .map(p => ({
                x: p.price,
                y: p.dailyProfit,
                price: p.price,
                source: 'promo',
                velocity: p.velocity,
                margin: p.margin,
                dailyProfit: p.dailyProfit,
                eraId: p.eraId,
                promoDiscountPct: p.promoDiscountPct,
                r: Math.min(12, Math.max(4, (p.weekCount ?? 1) * 2)),
            }));

        // Interpolated SKU curve (3+ points sorted by price)
        const sorted = [...pricePoints].sort((a, b) => a.price - b.price);
        const curveData = sorted.length >= 3
            ? sorted.map(p => ({ x: p.price, y: p.dailyProfit, price: p.price, dailyProfit: p.dailyProfit, source: p.source }))
            : [];

        // Cohort dotted curve across full x range
        const STEPS = 40;
        const bucketMid = (xMin + xMax) / 2;
        const cohortCurveData = Array.from({ length: STEPS + 1 }, (_, i) => {
            const price = xMin + (i / STEPS) * (xMax - xMin);
            const margin = price - costs;
            if (margin <= 0) return null;
            const velocityFactor = 1 + cohortElasticity * ((price - bucketMid) / (bucketMid || 1));
            const estVelocity = cohortVelocity * Math.max(0, velocityFactor);
            return { x: price, y: margin * estVelocity, price, dailyProfit: margin * estVelocity, source: 'cohort' };
        }).filter((d): d is NonNullable<typeof d> => d !== null);

        return { organicData, promoData, curveData, cohortCurveData, xMin, xMax };
    }, [pricePoints, currentPrice, recommendedPrice, cohortElasticity, cohortVelocity, costs]);

    const hasNoData = pricePoints.length === 0;
    const hasOnePoint = pricePoints.length === 1;

    return (
        <div className="relative h-full">
            {(hasNoData || hasOnePoint) && (
                <div className="absolute top-2 left-0 right-0 flex justify-center z-10 pointer-events-none">
                    <span className="bg-gray-800/80 text-white text-[10px] px-3 py-1 rounded-full">
                        {hasNoData
                            ? 'No sales history — curve based on benchmark'
                            : '1 observed price point — curve estimated from benchmark'}
                    </span>
                </div>
            )}
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart margin={{ top: 24, right: 20, left: 10, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis
                        type="number"
                        dataKey="x"
                        domain={[xMin, xMax]}
                        tickFormatter={(v) => `£${Number(v).toFixed(0)}`}
                        tick={{ fontSize: 10 }}
                        label={{ value: 'Price (£)', position: 'insideBottom', offset: -8, fontSize: 10, fill: '#9ca3af' }}
                    />
                    <YAxis
                        tick={{ fontSize: 10 }}
                        tickFormatter={(v) => `£${Number(v).toFixed(2)}`}
                        label={{ value: 'Daily Profit', angle: -90, position: 'insideLeft', offset: 10, fontSize: 10, fill: '#9ca3af' }}
                    />
                    <Tooltip content={<ProfitTooltip optimalPrice={recommendedPrice} />} />

                    {/* Guardrail: below cost floor */}
                    {costs > 0 && <ReferenceArea x1={xMin} x2={costs * 1.05} fill="rgba(239,68,68,0.04)" />}

                    {/* Cohort dotted curve */}
                    {cohortCurveData.length > 0 && (
                        <Line
                            data={cohortCurveData}
                            type="monotone"
                            dataKey="y"
                            stroke="#9ca3af"
                            strokeWidth={1.5}
                            strokeDasharray="4 4"
                            dot={false}
                            isAnimationActive={false}
                        />
                    )}

                    {/* Interpolated SKU curve (3+ points) */}
                    {curveData.length >= 3 && (
                        <Line
                            data={curveData}
                            type="monotone"
                            dataKey="y"
                            stroke="#4f46e5"
                            strokeWidth={2}
                            dot={false}
                            isAnimationActive={false}
                        />
                    )}

                    {/* Organic scatter */}
                    {organicData.length > 0 && (
                        <Scatter data={organicData} fill="#4f46e5" name="Organic" />
                    )}

                    {/* Promo scatter */}
                    {promoData.length > 0 && (
                        <Scatter data={promoData} fill="none" stroke="#f59e0b" strokeWidth={2} name="Promo" />
                    )}

                    {/* Current price line */}
                    <ReferenceLine
                        x={currentPrice}
                        stroke="#6b7280"
                        strokeWidth={1.5}
                        strokeDasharray="4 3"
                        label={{ value: `Current ${formatSmartMoney(currentPrice)}`, position: 'top', fontSize: 9, fill: '#6b7280' }}
                    />

                    {/* Recommended price line */}
                    <ReferenceLine
                        x={recommendedPrice}
                        stroke="#10b981"
                        strokeWidth={2}
                        label={{ value: `Optimal ${formatSmartMoney(recommendedPrice)} ★`, position: 'top', fontSize: 9, fill: '#10b981' }}
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

// ─────────────────────────────────────────────
// Price Points Table
// ─────────────────────────────────────────────

const PricePointsTable: React.FC<{
    pricePoints: PricePoint[];
    recommendedPrice: number;
    aliasesUsed: string[];
}> = ({ pricePoints, recommendedPrice, aliasesUsed }) => {
    if (pricePoints.length === 0) {
        return (
            <div className="text-center text-sm text-gray-400 py-6">
                No price points — no eligible sales history for this SKU.
            </div>
        );
    }

    return (
        <div>
            {aliasesUsed.length > 0 && (
                <p className="text-xs text-gray-500 mb-2">
                    Includes data from: <span className="font-medium text-gray-700">{aliasesUsed.join(', ')}</span>
                </p>
            )}
            <table className="w-full text-xs">
                <thead>
                    <tr className="border-b border-gray-200">
                        {['Era', 'Price', 'Source', 'Weeks', 'Velocity', 'Margin', 'Daily Profit'].map(h => (
                            <th key={h} className={`pb-2 font-bold text-gray-500 uppercase tracking-wide ${h === 'Era' ? 'text-left' : 'text-right'}`}>{h}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {pricePoints.map((p, i) => {
                        const isOptimal = Math.abs(p.price - recommendedPrice) < 0.5;
                        const isPromo = p.source === 'promo';
                        return (
                            <tr key={i} className={`border-b border-gray-100 ${isOptimal ? 'bg-emerald-50' : isPromo ? 'bg-amber-50/40' : ''}`}>
                                <td className="py-2 text-gray-500 font-mono text-[10px]">{p.eraId}</td>
                                <td className="py-2 text-right font-bold text-gray-900">
                                    {formatSmartMoney(p.price)}{isOptimal ? ' ★' : ''}
                                </td>
                                <td className="py-2 text-right">
                                    {isPromo ? (
                                        <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-bold">
                                            ↓{Math.round((p.promoDiscountPct ?? 0) * 100)}%
                                        </span>
                                    ) : (
                                        <span className="text-indigo-600 font-medium">Organic</span>
                                    )}
                                </td>
                                <td className="py-2 text-right text-gray-600">{p.weekCount ?? '—'}</td>
                                <td className="py-2 text-right text-gray-700">{p.velocity.toFixed(2)}/day</td>
                                <td className="py-2 text-right text-gray-700">{formatSmartMoney(p.margin)}</td>
                                <td className={`py-2 text-right font-bold ${isOptimal ? 'text-emerald-700' : 'text-gray-800'}`}>
                                    {formatSmartMoney(p.dailyProfit)}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

// ─────────────────────────────────────────────
// Main Modal
// ─────────────────────────────────────────────

const OptimalPriceCurveModal: React.FC<OptimalPriceCurveModalProps> = ({ product, result, onClose }) => {
    // Legacy call site (App.tsx) passes no result — show a placeholder
    if (!result) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8 text-center border border-gray-200">
                    <div className="text-gray-400 mb-4">No optimal price data available for <span className="font-mono font-bold text-gray-700">{product.sku}</span> yet.</div>
                    <p className="text-xs text-gray-400 mb-6">Calculate Price Benchmarks in Master Catalogue to generate optimal pricing recommendations.</p>
                    <button onClick={onClose} className="px-5 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700 transition-colors">Close</button>
                </div>
            </div>
        );
    }

    const costs = (product.costPrice ?? product.costDetail?.cogs ?? 0)
        + (product.postage ?? product.costDetail?.postage ?? 0)
        + (product.sellingFee ?? product.costDetail?.sellingFee ?? 0)
        + (product.adsFee ?? product.costDetail?.adsFee ?? 0);

    const profitUpliftSign = result.profitUplift >= 0 ? '+' : '';
    const isStale = Date.now() - new Date(result.calculatedAt).getTime() > 30 * 24 * 60 * 60 * 1000;
    const daysSince = Math.floor((Date.now() - new Date(result.calculatedAt).getTime()) / 86400000);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden border border-gray-200">

                {/* Header */}
                <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50/60 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="flex items-center gap-2">
                            <span className="font-mono text-sm font-bold text-gray-800">{product.sku}</span>
                            <GradeBadge gradeLevel={product.gradeLevel} />
                            <span className="text-[10px] px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full font-bold uppercase tracking-wide">Price Curve</span>
                        </div>
                        <span className="text-gray-400">·</span>
                        <span className="text-gray-500 text-xs max-w-[380px] truncate">{product.name}</span>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200/60 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto">

                    {/* Two-column section */}
                    <div className="grid grid-cols-[1fr_300px]">

                        {/* Left: Chart */}
                        <div className="p-6 border-r border-gray-100" style={{ height: 400 }}>
                            <ProfitCurveChart
                                pricePoints={result.skuPricePoints}
                                currentPrice={result.currentPrice}
                                recommendedPrice={result.recommendedPrice}
                                cohortElasticity={result.cohort.elasticity}
                                cohortVelocity={result.cohort.medianVelocity}
                                costs={costs}
                            />
                        </div>

                        {/* Right: Summary + Reasoning + Warnings */}
                        <div className="flex flex-col divide-y divide-gray-100">

                            {/* Summary */}
                            <div className="p-5 space-y-3">
                                <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2.5 text-xs items-center">
                                    <span className="text-gray-500">Recommended</span>
                                    <div className="flex items-center gap-2 justify-end flex-wrap">
                                        <span className="text-xl font-bold text-gray-900">{formatSmartMoney(result.recommendedPrice)}</span>
                                        <ConfidenceBadge confidence={result.confidence} source={result.source} />
                                    </div>

                                    <span className="text-gray-500">Current</span>
                                    <span className="text-right font-medium text-gray-700">{formatSmartMoney(result.currentPrice)}</span>

                                    <span className="text-gray-500">Expected uplift</span>
                                    <span className={`text-right font-bold ${result.profitUplift >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                        {profitUpliftSign}{result.profitUplift.toFixed(1)}%
                                    </span>

                                    <span className="text-gray-500">Source</span>
                                    <div className="flex justify-end"><SourceLabel source={result.source} /></div>

                                    <span className="text-gray-500">Last calculated</span>
                                    <span className="text-right text-gray-500">
                                        {new Date(result.calculatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                    </span>
                                </div>

                                {isStale && (
                                    <div className="flex items-center gap-1.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                                        <Clock className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                        <span className="text-[11px] text-amber-700">
                                            Calculated {daysSince} days ago — may not reflect recent sales.
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Reasoning */}
                            <div className="p-5 flex-1">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Reasoning</div>
                                <p className="text-sm text-gray-700 leading-relaxed">{result.reasoning}</p>
                            </div>

                            {/* Warnings */}
                            {result.warnings.length > 0 && (
                                <div className="p-5">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Warnings</div>
                                    <div className="space-y-1.5">
                                        {result.warnings.map((w, i) => (
                                            <div key={i} className="flex items-start gap-2 text-xs text-amber-700">
                                                <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                                                <span>{w}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Price Points Table */}
                    <div className="p-6 border-t border-gray-100">
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Price Points</div>
                        <PricePointsTable
                            pricePoints={result.skuPricePoints}
                            recommendedPrice={result.recommendedPrice}
                            aliasesUsed={result.aliasesUsed}
                        />
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex justify-end shrink-0">
                    <button
                        onClick={onClose}
                        className="px-5 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-bold hover:bg-gray-50 rounded-lg transition-colors shadow-sm"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};

export { OptimalPriceCurveModal as default, OptimalPriceCurveModal };
