import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Package, Activity, Search, ArrowUpRight, ArrowDownRight, Minus, Trophy, AlertTriangle, ShieldAlert, Zap } from 'lucide-react';
import { Product, PriceLog, RefundLog } from '../../../types';
import { aggregateProductTrends, ProductTrendData } from '../../../services/productTrendAgg';
import { formatMoney, formatNumber, formatPct } from '../../../utils/format';
import { GradeBadge } from '../../GradeBadge';
import { SortableHeader } from '../../common/SortableHeader';
import { SortState, sortRows } from '../../../utils/tableSort';

interface ProductPerformanceTrendTabProps {
  products: Product[];
  priceHistoryMap: Map<string, PriceLog[]>;
  refundHistory: RefundLog[];
  dateWindow: { startKey: string, endKey: string };
  deductRefunds: boolean;
  themeColor: string;
  onDeepDive: (sku: string) => void;
}

const SummaryCard = ({ title, sku, delta, value, type }: any) => {
  const Icon = type === 'pos' ? ArrowUpRight : type === 'neg' ? ArrowDownRight : Activity;
  const colorClass = type === 'pos' ? 'text-green-600' : type === 'neg' ? 'text-red-600' : 'text-indigo-600';
  const bgClass = type === 'pos' ? 'bg-green-50' : type === 'neg' ? 'bg-red-50' : 'bg-indigo-50';

  return (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between min-w-0">
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1 truncate tracking-wider">{title}</span>
        <div className="font-bold text-gray-900 truncate text-sm font-mono">
          {sku || '—'}
        </div>
        <div className={`text-xs font-bold mt-1 flex items-center gap-1 ${colorClass}`}>
          {delta !== undefined && delta !== null ? (
            <>
              {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
            </>
          ) : value !== undefined ? (
            formatMoney(value, 0)
          ) : '—'}
        </div>
      </div>
      <div className={`p-2 rounded-lg shrink-0 ml-3 ${bgClass} ${colorClass}`}>
        <Icon className="w-4 h-4" />
      </div>
    </div>
  );
};

const TrendDeltaPill = ({ value, isPp = false, invert = false }: { value: number | null, isPp?: boolean, invert?: boolean }) => {
  if (value === null || !isFinite(value)) return <span className="text-[10px] text-gray-400">New</span>;
  if (Math.abs(value) < 0.1) return <Minus className="w-2.5 h-2.5 text-gray-300" />;
  
  const isPositive = value > 0;
  const isGood = invert ? !isPositive : isPositive;
  const colorClass = isGood ? 'text-green-700 bg-green-50 border-green-200' : 'text-red-700 bg-red-50 border-red-200';
  
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${colorClass}`}>
      {isPositive ? '+' : ''}{value.toFixed(1)}{isPp ? 'pp' : '%'}
    </span>
  );
};

export const ProductPerformanceTrendTab: React.FC<ProductPerformanceTrendTabProps> = ({
  products, priceHistoryMap, refundHistory, dateWindow, deductRefunds, themeColor, onDeepDive
}) => {
  const [sort, setSort] = useState<SortState<string>>({ key: 'revenue', dir: 'desc' });

  // 1. Trend Aggregation
  const trendData = useMemo(() => {
    const allLogs = Array.from(priceHistoryMap.values()).flat() as PriceLog[];
    return aggregateProductTrends(products, allLogs, dateWindow, refundHistory, deductRefunds);
  }, [products, priceHistoryMap, dateWindow, refundHistory, deductRefunds]);

  // 2. Summary Logic
  const summary = useMemo(() => {
    if (trendData.length === 0) return null;
    const validRev = trendData.filter(d => d.deltas.revenueDeltaPct !== null && d.current.revenue > 100);

    return {
      velocityKing: [...validRev].sort((a, b) => (b.deltas.unitsDeltaPct! - a.deltas.unitsDeltaPct!))[0],
      revenueLoser: [...validRev].sort((a, b) => (a.deltas.revenueDeltaPct! - b.deltas.revenueDeltaPct!))[0],
      marginImprover: trendData.sort((a, b) => b.deltas.marginDeltaPp - a.deltas.marginDeltaPp)[0],
      topProfit: [...trendData].sort((a, b) => b.current.netProfit - a.current.netProfit)[0]
    };
  }, [trendData]);

  // 3. Table Sorting
  const sortedData = useMemo(() => {
    const getValue = (row: ProductTrendData, key: string) => {
      if (key === 'revenue') return row.current.revenue;
      if (key === 'profit') return row.current.netProfit;
      if (key === 'margin') return row.current.marginPct;
      if (key === 'tacos') return row.current.tacosPct ?? -1;
      if (key === 'refund') return row.current.refundRatePct;
      return (row as any)[key];
    };
    return sortRows(trendData, sort, getValue);
  }, [trendData, sort]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Velocity King (Uplift)" sku={summary?.velocityKing?.sku} delta={summary?.velocityKing?.deltas.unitsDeltaPct} type="pos" />
        <SummaryCard title="Deepest Revenue Drop" sku={summary?.revenueLoser?.sku} delta={summary?.revenueLoser?.deltas.revenueDeltaPct} type="neg" />
        <SummaryCard title="Margin Improver" sku={summary?.marginImprover?.sku} delta={summary?.marginImprover?.deltas.marginDeltaPp} type="pos" />
        <SummaryCard title="Highest Net Profit" sku={summary?.topProfit?.sku} value={summary?.topProfit?.current.netProfit} type="info" />
      </div>

      {/* Momentum Comparison Matrix */}
      <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
        <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center">
            <div className="flex items-center gap-3">
                <Trophy className="w-5 h-5 text-amber-500" />
                <div>
                    <h3 className="font-bold text-gray-800 text-sm">SKU Momentum Matrix</h3>
                    <p className="text-[10px] text-gray-500 uppercase tracking-tighter">Current vs Prior • Ranked by Revenue</p>
                </div>
            </div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white/50 px-2 py-1 rounded border border-gray-100">
                PoP Comparison
            </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-gray-100/50 text-gray-500 font-bold border-b border-gray-200/50 text-[10px] uppercase tracking-wider">
                <tr>
                    <SortableHeader label="Product SKU" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                    <SortableHeader label="Revenue" sortKey="revenue" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                    <SortableHeader label="Net Profit" sortKey="profit" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                    <SortableHeader label="Efficiency (Margin)" sortKey="margin" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                    <SortableHeader label="Ads (TACoS)" sortKey="tacos" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                    <SortableHeader label="Quality (Refunds)" sortKey="refund" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                    <th className="px-4 py-3 text-center">Flags</th>
                    <th className="px-4 py-3 text-right">Action</th>
                </tr>
            </thead>
            <tbody className="divide-y divide-gray-100/50">
              {sortedData.slice(0, 50).map((row) => {
                const isRevWarning = row.deltas.revenueDeltaPct !== null && row.deltas.revenueDeltaPct <= -20;
                const isMarginCritical = row.current.marginPct < 5;
                const isTacosHigh = row.current.tacosPct !== null && row.current.tacosPct > 25;
                
                return (
                  <tr key={row.sku} className="even:bg-gray-50/20 hover:bg-gray-100/40 transition-all group">
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-gray-900 font-mono text-sm leading-none">{row.sku}</span>
                        <GradeBadge gradeLevel={row.gradeLevel} />
                      </div>
                      <div className="text-[9px] text-gray-400 font-bold uppercase mt-1 tracking-wider truncate max-w-[200px]">{row.name}</div>
                    </td>
                    <td className={`p-4 text-right transition-colors ${isRevWarning ? 'bg-red-50/30' : ''}`}>
                      <div className="flex flex-col items-end">
                        <span className="font-bold text-gray-900">{formatMoney(row.current.revenue, 0)}</span>
                        <TrendDeltaPill value={row.deltas.revenueDeltaPct} />
                      </div>
                    </td>
                    <td className="p-4 text-right font-medium">
                      <div className="flex flex-col items-end">
                        <span className={`font-bold ${row.current.netProfit >= 0 ? 'text-gray-900' : 'text-red-700'}`}>
                          {formatMoney(row.current.netProfit, 0)}
                        </span>
                        <TrendDeltaPill value={row.deltas.netProfitDeltaPct} />
                      </div>
                    </td>
                    <td className={`p-4 text-right transition-colors ${isMarginCritical ? 'bg-amber-50/30' : ''}`}>
                      <div className="flex flex-col items-end">
                        <span className={`font-black ${row.current.marginPct < 15 ? 'text-amber-600' : 'text-green-600'}`}>
                          {formatPct(row.current.marginPct)}
                        </span>
                        <TrendDeltaPill value={row.deltas.marginDeltaPp} isPp />
                      </div>
                    </td>
                    <td className={`p-4 text-right transition-colors ${isTacosHigh ? 'bg-purple-50/30' : ''}`}>
                      <div className="flex flex-col items-end">
                        <span className="font-medium text-gray-700">
                          {row.current.tacosPct !== null ? formatPct(row.current.tacosPct) : '—'}
                        </span>
                        <TrendDeltaPill value={row.deltas.tacosDeltaPp} isPp invert />
                      </div>
                    </td>
                    <td className="p-4 text-right transition-colors">
                      <div className="flex flex-col items-end">
                        <span className="font-medium text-gray-700">{formatPct(row.current.refundRatePct)}</span>
                        <TrendDeltaPill value={row.deltas.refundRateDeltaPp} isPp invert />
                      </div>
                    </td>
                    <td className="p-4 text-center">
                        <div className="flex justify-center gap-1.5 flex-wrap min-w-[100px]">
                            {isRevWarning && <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-red-100 text-red-800 border border-red-200 shadow-xs">Drop</span>}
                            {isMarginCritical && <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200 shadow-xs">Margin</span>}
                            {isTacosHigh && <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-purple-100 text-purple-800 border border-purple-200 shadow-xs">Ads</span>}
                            {row.current.unitsSold === 0 && <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-gray-100 text-gray-500 border border-gray-200 shadow-xs">Dormant</span>}
                        </div>
                    </td>
                    <td className="p-4 text-right">
                        <button 
                            onClick={() => onDeepDive(row.sku)}
                            className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-white rounded border border-transparent hover:border-gray-200 shadow-none hover:shadow-sm"
                            title="Deep Dive SKU"
                        >
                            <Search className="w-4 h-4" />
                        </button>
                    </td>
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