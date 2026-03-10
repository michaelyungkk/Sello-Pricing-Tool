
import React, { useMemo, useState } from 'react';
import { TrendingUp, TrendingDown, Package, Activity, Search, ArrowUpRight, ArrowDownRight, Minus, Trophy, AlertTriangle, ShieldAlert, Zap, LayoutGrid, List, Info, X } from 'lucide-react';
import { Product, PriceLog, RefundLog } from '../../../types';
import { aggregateProductTrends, ProductTrendData } from '../../../services/productTrendAgg';
import { formatMoney, formatNumber, formatPct } from '../../../utils/format';
import { GradeBadge } from '../../GradeBadge';
import { SortableHeader } from '../../common/SortableHeader';
import AuditPanel from '../../AuditPanel';
import { FilterBar } from '../../common/FilterBar';
import { SortState, sortRows } from '../../../utils/tableSort';
import { BcgMatrix } from '../parts/BcgMatrix';

interface ProductPerformanceTrendTabProps {
  products: Product[];
  priceHistoryMap: Map<string, PriceLog[]>;
  refundHistory: RefundLog[];
  dateWindow: { startKey: string, endKey: string };
  deductRefunds: boolean;
  themeColor: string;
  onDeepDive: (sku: string) => void;
  startKey: string;
  endKey: string;
  isAuditVisible: boolean;
}

const SummaryCard = ({ title, sku, delta, value, type }: any) => {
  const Icon = type === 'pos' ? ArrowUpRight : type === 'neg' ? ArrowDownRight : Activity;
  const colorClass = type === 'pos' ? 'text-emerald-600' : type === 'neg' ? 'text-red-500' : 'text-indigo-600';
  const bgClass = type === 'pos' ? 'bg-green-50' : type === 'neg' ? 'bg-red-50' : 'bg-indigo-50';

  return (
    <div className="sello-glass p-4 rounded-xl border border-custom-glass shadow-sm flex items-start justify-between min-w-0">
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
  const colorClass = isGood ? 'text-emerald-600 bg-emerald-50 border-emerald-200' : 'text-red-500 bg-red-50 border-red-200';

  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold border ${colorClass}`}>
      {isPositive ? '+' : ''}{value.toFixed(1)}{isPp ? 'pp' : '%'}
    </span>
  );
};

export const ProductPerformanceTrendTab: React.FC<ProductPerformanceTrendTabProps> = ({
  products, priceHistoryMap, refundHistory, dateWindow, deductRefunds, themeColor, onDeepDive,
  startKey, endKey, isAuditVisible
}) => {
  const [sort, setSort] = useState<SortState<string>>({ key: 'revenue', dir: 'desc' });
  const [viewMode, setViewMode] = useState<'LIST' | 'MATRIX'>('LIST');
  const [showMatrixInfo, setShowMatrixInfo] = useState(false);

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
    <div className="space-y-6 pb-24 animate-in fade-in slide-in-from-bottom-4 duration-500">
      {isAuditVisible && (
        <div className="animate-in fade-in slide-in-from-top-2 duration-300">
          <AuditPanel
            title="Product Performance Audit"
            startKey={dateWindow.startKey}
            endKey={dateWindow.endKey}
            rows={trendData}
            getDateKey={() => null}
            getRevenue={(row: any) => row.current.revenue}
            getQty={(row: any) => row.current.unitsSold}
            getProfit={(row: any) => row.current.netProfit}
            getAdSpend={(row: any) => row.current.adSpend}
          />
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard title="Velocity King (Uplift)" sku={summary?.velocityKing?.sku} delta={summary?.velocityKing?.deltas.unitsDeltaPct} type="pos" />
        <SummaryCard title="Deepest Revenue Drop" sku={summary?.revenueLoser?.sku} delta={summary?.revenueLoser?.deltas.revenueDeltaPct} type="neg" />
        <SummaryCard title="Margin Improver" sku={summary?.marginImprover?.sku} delta={summary?.marginImprover?.deltas.marginDeltaPp} type="pos" />
        <SummaryCard title="Highest Net Profit" sku={summary?.topProfit?.sku} value={summary?.topProfit?.current.netProfit} type="info" />
      </div>

      {/* Main Content Area: Matrix or List */}
      {viewMode === 'MATRIX' ? (
        <div className="relative">
          <div className="absolute top-0 right-0 z-10 p-2 flex gap-2">
            {/* Matrix Toggle Controls */}
            <div className="relative">
              <button
                onClick={() => setShowMatrixInfo(!showMatrixInfo)}
                className="p-1.5 rounded-lg bg-white/80 border border-gray-200 shadow-sm backdrop-blur-sm text-gray-500 hover:text-indigo-600 transition-colors"
                title="How to read this chart"
              >
                <Info className="w-4 h-4" />
              </button>
              {showMatrixInfo && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-50 animate-in fade-in zoom-in-95 duration-200">
                  <div className="flex justify-between items-center mb-2">
                    <h4 className="font-bold text-gray-900 text-xs uppercase">House vs. Classic BCG</h4>
                    <button onClick={() => setShowMatrixInfo(false)}><X className="w-3 h-3 text-gray-400" /></button>
                  </div>
                  <p className="text-[11px] text-gray-600 leading-relaxed mb-3">
                    The traditional BCG Matrix uses <strong>Relative Market Share</strong> vs. <strong>Market Growth Rate</strong> to categorize products.
                  </p>
                  <p className="text-[11px] text-gray-600 leading-relaxed border-t border-gray-100 pt-2">
                    This <strong>Internal Adaptation</strong> uses:
                    <br />
                    • <strong>Revenue</strong> as a proxy for Market Share.
                    <br />
                    • <strong>Volume Growth (PoP)</strong> as a proxy for Market Growth.
                  </p>
                  <div className="mt-2 text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-1 rounded">
                    Goal: Identify internal cash cows without external competitor data.
                  </div>
                </div>
              )}
            </div>

            <div className="flex bg-white/80 p-1 rounded-lg border border-gray-200 shadow-sm backdrop-blur-sm">
              <button
                onClick={() => setViewMode('LIST')}
                className={`p-1.5 rounded-md transition-all ${(viewMode as string) === 'LIST' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:text-gray-900'}`}
                title="List View"
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('MATRIX')}
                className={`p-1.5 rounded-md transition-all ${(viewMode as string) === 'MATRIX' ? 'bg-indigo-100 text-indigo-600' : 'text-gray-500 hover:text-gray-900'}`}
                title="Matrix View"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
            </div>
          </div>
          <BcgMatrix data={trendData} onDeepDive={onDeepDive} />
        </div>
      ) : (
        <div className="sello-glass rounded-xl overflow-hidden">
          <div style={{padding:"12px 16px",borderBottom:"1px solid var(--glass-divider)",background:"var(--glass-head-bg)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div className="flex items-center gap-3">
              <Trophy className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="font-bold text-gray-800 text-sm">SKU Momentum Matrix</h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-tighter">Current vs Prior • Ranked by Revenue</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white/50 px-2 py-1 rounded border border-gray-100 hidden sm:block">
                PoP Comparison
              </div>
              <div className="flex bg-white p-1 rounded-lg border border-gray-200">
                <button
                  onClick={() => setViewMode('LIST')}
                  className={`p-1.5 rounded-md transition-all ${(viewMode as string) === 'LIST' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  title="List View"
                >
                  <List className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('MATRIX')}
                  className={`p-1.5 rounded-md transition-all ${(viewMode as string) === 'MATRIX' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  title="BCG Matrix View"
                >
                  <LayoutGrid className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="sello-table-scroll" style={{paddingBottom:80}}>
            <table className="sello-table">
              <thead >
                <tr>
                  <th style={{textAlign:"center"}}>Detail</th>
                  <SortableHeader label="Product SKU" sortKey="sku" sort={sort} onChange={setSort} />
                  <SortableHeader label="Revenue" sortKey="revenue" sort={sort} onChange={setSort} align="right" />
                  <SortableHeader label="Net Profit" sortKey="profit" sort={sort} onChange={setSort} align="right" />
                  <SortableHeader label="Efficiency (Margin)" sortKey="margin" sort={sort} onChange={setSort} align="right" />
                  <SortableHeader label="Ads (TACoS)" sortKey="tacos" sort={sort} onChange={setSort} align="right" />
                  <SortableHeader label="Quality (Refunds)" sortKey="refund" sort={sort} onChange={setSort} align="right" />
                  <th style={{textAlign:"center"}}>Flags</th>
                </tr>
              </thead>
              <tbody >
                {sortedData.slice(0, 50).map((row) => {
                  const isRevWarning = row.deltas.revenueDeltaPct !== null && row.deltas.revenueDeltaPct <= -20;
                  const isMarginCritical = row.current.marginPct < 5;
                  const isTacosHigh = row.current.tacosPct !== null && row.current.tacosPct > 25;

                  return (
                    <tr key={row.sku} >
                      <td style={{textAlign:"center"}}>
                        <button
                          onClick={() => onDeepDive(row.sku)}
                          className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-white rounded border border-transparent hover:border-gray-200 shadow-none hover:shadow-sm transition-colors"
                          title="Deep Dive SKU"
                        >
                          <Search className="w-4 h-4" />
                        </button>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 font-mono text-sm leading-none">{row.sku}</span>
                          <GradeBadge gradeLevel={row.gradeLevel} />
                        </div>
                        <div className="text-[9px] text-gray-400 font-bold uppercase mt-1 tracking-wider truncate max-w-[200px]">{row.name}</div>
                      </td>
                      <td className="r col-blue" style={{background:isRevWarning?"rgba(254,226,226,0.2)":undefined}}>
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-gray-900">{formatMoney(row.current.revenue, 0)}</span>
                          <TrendDeltaPill value={row.deltas.revenueDeltaPct} />
                        </div>
                      </td>
                      <td className="r col-green">
                        <div className="flex flex-col items-end">
                          <span className={`font-bold ${row.current.netProfit >= 0 ? 'text-gray-700' : 'text-red-500'}`}>
                            {formatMoney(row.current.netProfit, 0)}
                          </span>
                          <TrendDeltaPill value={row.deltas.netProfitDeltaPct} />
                        </div>
                      </td>
                      <td className="r" style={{background:isMarginCritical?"rgba(254,243,199,0.2)":undefined}}>
                        <div className="flex flex-col items-end">
                          <span className={`font-black ${row.current.marginPct < 15 ? 'text-amber-500' : 'text-emerald-600'}`}>
                            {formatPct(row.current.marginPct)}
                          </span>
                          <TrendDeltaPill value={row.deltas.marginDeltaPp} isPp />
                        </div>
                      </td>
                      <td className="r" style={{background:isTacosHigh?"rgba(237,233,254,0.2)":undefined}}>
                        <div className="flex flex-col items-end">
                          <span className="v-num">
                            {row.current.tacosPct !== null ? formatPct(row.current.tacosPct) : '—'}
                          </span>
                          <TrendDeltaPill value={row.deltas.tacosDeltaPp} isPp invert />
                        </div>
                      </td>
                      <td className="r">
                        <div className="flex flex-col items-end">
                          <span className="v-num">{formatPct(row.current.refundRatePct)}</span>
                          <TrendDeltaPill value={row.deltas.refundRateDeltaPp} isPp invert />
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <div className="flex justify-center gap-1.5 flex-wrap min-w-[100px]">
                          {isRevWarning && <span className=style={{padding:"1px 6px",borderRadius:3,fontSize:9,fontWeight:700,textTransform:"uppercase",background:"#fee2e2",color:"#991b1b",border:"1px solid #fca5a5"}}>Drop</span>}
                          {isMarginCritical && <span className=style={{padding:"1px 6px",borderRadius:3,fontSize:9,fontWeight:700,textTransform:"uppercase",background:"#fef3c7",color:"#92400e",border:"1px solid #fde68a"}}>Margin</span>}
                          {isTacosHigh && <span className=style={{padding:"1px 6px",borderRadius:3,fontSize:9,fontWeight:700,textTransform:"uppercase",background:"#ede9fe",color:"#6d28d9",border:"1px solid #c4b5fd"}}>Ads</span>}
                          {row.current.unitsSold === 0 && <span className=style={{padding:"1px 6px",borderRadius:3,fontSize:9,fontWeight:700,textTransform:"uppercase",background:"#f3f4f6",color:"#6b7280",border:"1px solid #e5e7eb"}}>Dormant</span>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
