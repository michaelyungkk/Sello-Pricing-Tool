
import React from 'react';
import { formatMoney, formatSmartMoney } from '../../../utils/format';
import { TrendingUp, TrendingDown, CheckCircle } from 'lucide-react';

interface OptimalPriceCardProps {
    optimalPrice: number;
    currentPrice: number;
}

export const OptimalPriceCard: React.FC<OptimalPriceCardProps> = ({ optimalPrice, currentPrice }) => {
    if (!optimalPrice || optimalPrice <= 0) return null;

    const diff = optimalPrice - currentPrice;
    const diffPct = currentPrice > 0 ? (diff / currentPrice) * 100 : 0;
    const isIncrease = diff > 0.02;
    const isDecrease = diff < -0.02;

    return (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm animate-in fade-in slide-in-from-top-2">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                Optimal Price Target
            </div>
            <div className="flex items-end justify-between">
                <div className="text-3xl font-bold text-gray-900 tracking-tight">
                    {formatSmartMoney(optimalPrice)}
                </div>
                
                {isIncrease && (
                    <div className="text-right">
                        <div className="flex items-center gap-1 text-sm font-bold text-green-600">
                            <TrendingUp className="w-4 h-4" />
                            +{diffPct.toFixed(1)}%
                        </div>
                        <div className="text-[10px] text-gray-400">Target</div>
                    </div>
                )}

                {isDecrease && (
                    <div className="text-right">
                        <div className="flex items-center gap-1 text-sm font-bold text-red-600">
                            <TrendingDown className="w-4 h-4" />
                            {diffPct.toFixed(1)}%
                        </div>
                         <div className="text-[10px] text-gray-400">Target</div>
                    </div>
                )}

                {!isIncrease && !isDecrease && (
                    <div className="flex items-center gap-1 text-sm font-bold text-indigo-600">
                        <CheckCircle className="w-4 h-4" />
                        Optimized
                    </div>
                )}
            </div>
             {(isIncrease || isDecrease) && (
                <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-500 flex justify-between items-center">
                    <span className="font-medium">Current Price:</span>
                    <span className="font-mono">{formatSmartMoney(currentPrice)}</span>
                </div>
             )}
        </div>
    );
};
