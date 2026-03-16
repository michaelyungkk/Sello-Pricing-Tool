
import React, { useState } from 'react';
import { formatSmartMoney } from '../../../utils/format';
import { TrendingUp, TrendingDown, CheckCircle, AlertTriangle, Clock } from 'lucide-react';
import { OptimalPriceResult } from '../../../types';

// ── Confidence Badge (inline)
const ConfidenceBadge: React.FC<{ confidence: number; source: string }> = ({ confidence, source }) => {
    if (source === 'COHORT' || confidence < 0.3) {
        return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded border border-gray-300 text-gray-500">Benchmark</span>;
    }
    if (confidence >= 0.9) {
        return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-100 text-emerald-700">High</span>;
    }
    if (confidence >= 0.5) {
        return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-700">Medium</span>;
    }
    return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-gray-100 text-gray-500">Low</span>;
};

// ── Source label
const sourceStyles: Record<string, string> = {
    SKU_DATA: 'text-indigo-600',
    BLENDED: 'text-amber-600',
    COHORT: 'text-gray-400',
    GUARDRAIL: 'text-red-500',
};
const sourceLabels: Record<string, string> = {
    SKU_DATA: 'SKU Data',
    BLENDED: 'Blended',
    COHORT: 'Cohort',
    GUARDRAIL: '⚠ Guardrail',
};

interface OptimalPriceCardProps {
    result?: OptimalPriceResult | null;
    currentPrice: number;
    // Legacy compat — ignored when result is provided
    optimalPrice?: number;
}

export const OptimalPriceCard: React.FC<OptimalPriceCardProps> = ({ result, currentPrice, optimalPrice }) => {
    const [reasoningExpanded, setReasoningExpanded] = useState(false);

    // Legacy fallback — bare number
    if (!result) {
        if (!optimalPrice || optimalPrice <= 0) return null;
        const diff = optimalPrice - currentPrice;
        const diffPct = currentPrice > 0 ? (diff / currentPrice) * 100 : 0;
        const isIncrease = diff > 0.02;
        const isDecrease = diff < -0.02;
        return (
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm animate-in fade-in slide-in-from-top-2">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Optimal Price Target</div>
                <div className="flex items-end justify-between">
                    <div className="text-3xl font-bold text-gray-900 tracking-tight">{formatSmartMoney(optimalPrice)}</div>
                    {isIncrease && <div className="text-right"><div className="flex items-center gap-1 text-sm font-bold text-green-600"><TrendingUp className="w-4 h-4" />+{diffPct.toFixed(1)}%</div><div className="text-[10px] text-gray-400">Target</div></div>}
                    {isDecrease && <div className="text-right"><div className="flex items-center gap-1 text-sm font-bold text-red-600"><TrendingDown className="w-4 h-4" />{diffPct.toFixed(1)}%</div><div className="text-[10px] text-gray-400">Target</div></div>}
                    {!isIncrease && !isDecrease && <div className="flex items-center gap-1 text-sm font-bold text-indigo-600"><CheckCircle className="w-4 h-4" />Optimized</div>}
                </div>
                {(isIncrease || isDecrease) && (
                    <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 flex justify-between items-center">
                        <span className="font-medium">Current Price:</span>
                        <span className="font-mono">{formatSmartMoney(currentPrice)}</span>
                    </div>
                )}
            </div>
        );
    }

    const recommendedPrice = result.recommendedPrice;
    const diff = recommendedPrice - currentPrice;
    const diffPct = currentPrice > 0 ? (diff / currentPrice) * 100 : 0;
    const isIncrease = diff > 0.02;
    const isDecrease = diff < -0.02;

    const isStale = Date.now() - new Date(result.calculatedAt).getTime() > 30 * 24 * 60 * 60 * 1000;
    const daysSince = Math.floor((Date.now() - new Date(result.calculatedAt).getTime()) / 86400000);

    const MAX_REASONING_LINES = 3;
    const reasoningLines = result.reasoning.split('. ');
    const isLongReasoning = reasoningLines.length > MAX_REASONING_LINES;
    const displayedReasoning = reasoningExpanded || !isLongReasoning
        ? result.reasoning
        : reasoningLines.slice(0, MAX_REASONING_LINES).join('. ') + '.';

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm animate-in fade-in slide-in-from-top-2 space-y-3">
            {/* Header */}
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Optimal Price Target</div>

            {/* Price + direction */}
            <div className="flex items-end justify-between">
                <div className="text-3xl font-bold text-gray-900 tracking-tight">{formatSmartMoney(recommendedPrice)}</div>
                {isIncrease && (
                    <div className="text-right">
                        <div className="flex items-center gap-1 text-sm font-bold text-green-600"><TrendingUp className="w-4 h-4" />+{diffPct.toFixed(1)}%</div>
                        <div className="text-[10px] text-gray-400">Target</div>
                    </div>
                )}
                {isDecrease && (
                    <div className="text-right">
                        <div className="flex items-center gap-1 text-sm font-bold text-red-600"><TrendingDown className="w-4 h-4" />{diffPct.toFixed(1)}%</div>
                        <div className="text-[10px] text-gray-400">Target</div>
                    </div>
                )}
                {!isIncrease && !isDecrease && (
                    <div className="flex items-center gap-1 text-sm font-bold text-indigo-600"><CheckCircle className="w-4 h-4" />Optimized</div>
                )}
            </div>

            {/* Confidence badge + source label */}
            <div className="flex items-center gap-2">
                <ConfidenceBadge confidence={result.confidence} source={result.source} />
                <span className={`text-[10px] font-bold ${sourceStyles[result.source] ?? 'text-gray-500'}`}>
                    {sourceLabels[result.source] ?? result.source}
                </span>
            </div>

            {/* Reasoning */}
            <div>
                <p className="text-xs text-gray-500 leading-relaxed">{displayedReasoning}</p>
                {isLongReasoning && (
                    <button
                        onClick={() => setReasoningExpanded(v => !v)}
                        className="text-[10px] text-indigo-500 hover:text-indigo-700 mt-1 font-medium"
                    >
                        {reasoningExpanded ? 'Show less' : 'Show more'}
                    </button>
                )}
            </div>

            {/* Stale warning */}
            {isStale && (
                <div className="flex items-center gap-1.5 text-[11px] text-amber-600">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    Calculated {daysSince} days ago — may not reflect recent sales.
                </div>
            )}

            {/* Warnings */}
            {result.warnings.length > 0 && (
                <div className="space-y-1">
                    {result.warnings.map((w, i) => (
                        <div key={i} className="flex items-start gap-1.5 text-[11px] text-amber-600">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{w}</span>
                        </div>
                    ))}
                </div>
            )}

            {/* Current price + calculated at */}
            <div className="pt-3 border-t border-gray-100 space-y-1.5">
                {(isIncrease || isDecrease) && (
                    <div className="text-xs text-gray-500 flex justify-between items-center">
                        <span className="font-medium">Current Price:</span>
                        <span className="font-mono">{formatSmartMoney(currentPrice)}</span>
                    </div>
                )}
                <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Clock className="w-3 h-3" />
                    Last calculated: {new Date(result.calculatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                </div>
            </div>
        </div>
    );
};
