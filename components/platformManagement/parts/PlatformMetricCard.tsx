
import React from 'react';
import { Trophy, ChevronRight, Hash, Database, Wallet } from 'lucide-react';
import { formatMoney, formatPct, formatNumber } from '../../../utils/format';
import { PlatformSummary } from '../platformManagement.types';
import { PlatformConfig } from '../../../types';

interface PlatformMetricCardProps {
    summary: PlatformSummary;
    isTop: boolean;
    isSelected: boolean;
    onSelect: () => void;
    rule?: PlatformConfig;
    themeColor: string;
}

export const PlatformMetricCard: React.FC<PlatformMetricCardProps> = ({ summary, isTop, isSelected, onSelect, rule, themeColor }) => {
    return (
        <div 
            onClick={onSelect}
            className={`bg-white p-4 rounded-xl border shadow-sm flex flex-col relative overflow-hidden group hover:border-indigo-300 transition-all hover:shadow-md h-full cursor-pointer ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500' : 'border-gray-200'}`}
        >
            {isTop && (
                <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-bl-lg flex items-center gap-1 shadow-sm animate-in fade-in slide-in-from-top-1 z-10">
                    <Trophy className="w-3 h-3" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Top</span>
                </div>
            )}
            
            <div className="flex items-center gap-2.5 mb-4">
                <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-sm transition-transform group-hover:scale-105 shrink-0"
                    style={{ backgroundColor: rule?.color || themeColor }}
                >
                    {summary.platform[0]}
                </div>
                <div className="flex flex-col min-w-0">
                    <h4 className="font-bold text-gray-900 text-sm truncate leading-tight" title={summary.platform}>{summary.platform}</h4>
                    <span className="text-[9px] text-gray-400 uppercase font-medium tracking-tight truncate leading-tight">{rule?.manager || 'Unassigned'}</span>
                </div>
            </div>

            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                        <span className="text-[9px] font-medium text-gray-400 uppercase tracking-tight">Revenue</span>
                        <div className="text-sm font-bold text-gray-900 leading-none">{formatMoney(summary.revenue, 0)}</div>
                    </div>
                    <div className="space-y-0.5 text-right bg-indigo-50/50 -m-1 p-1 rounded">
                        <span className="text-[9px] font-medium text-indigo-500 uppercase tracking-tight">Net Profit</span>
                        <div className={`text-sm font-bold leading-none ${summary.netProfit >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                            {formatMoney(summary.netProfit, 0)}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <div className="space-y-0.5">
                        <span className="text-[9px] font-medium text-gray-400 uppercase tracking-tight">Margin %</span>
                        <div className={`text-sm font-bold ${summary.marginPct >= 15 ? 'text-green-600' : summary.marginPct >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                            {formatPct(summary.marginPct)}
                        </div>
                    </div>
                    <div className="space-y-0.5 text-right">
                        <span className="text-[9px] font-medium text-gray-400 uppercase tracking-tight">TACoS %</span>
                        <div className={`text-sm font-bold ${summary.tacosPct !== null ? (summary.tacosPct > 15 ? 'text-red-600' : 'text-gray-800') : 'text-gray-400'}`}>
                            {formatPct(summary.tacosPct)}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <div className="space-y-0.5">
                        <span className="text-[9px] font-medium text-gray-400 uppercase tracking-tight">Ad Spend</span>
                        <div className="text-sm font-bold text-orange-600 leading-none">{formatMoney(summary.adSpend, 0)}</div>
                    </div>
                    <div className="space-y-0.5 text-right">
                        <span className="text-[9px] font-medium text-gray-400 uppercase tracking-tight">Units</span>
                        <div className="text-sm font-bold text-gray-700 leading-none">{formatNumber(summary.units)}</div>
                    </div>
                </div>
            </div>

            <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[9px] text-gray-400 font-medium">
                <div className="flex items-center gap-1 truncate opacity-75">
                    <Hash className="w-2 h-2 shrink-0" />
                    {summary.skuCount} SKUs
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-75">
                    {!summary.hasAdData && (
                        <span className="flex items-center gap-1 text-slate-400 uppercase font-medium tracking-tighter">
                            <Database className="w-2 h-2" /> Gap
                        </span>
                    )}
                    <span className="ml-1">
                        <Wallet className="w-2 h-2 shrink-0 inline mr-0.5" />
                        Gross: {formatMoney(summary.profit, 0)}
                    </span>
                </div>
            </div>
            
            {isSelected && (
                <div className="absolute bottom-1 right-1 opacity-50">
                    <ChevronRight className="w-3 h-3 text-indigo-500" />
                </div>
            )}
        </div>
    );
};
