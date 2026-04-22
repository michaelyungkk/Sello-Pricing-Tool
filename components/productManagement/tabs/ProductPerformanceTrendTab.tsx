
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Activity, Search, ArrowUpRight, ArrowDownRight, Minus, Trophy, LayoutGrid, List } from 'lucide-react';
import { Product, PriceLog, RefundLog } from '../../../types';
import { aggregateProductTrends, ProductTrendData } from '../../../services/productTrendAgg';
import { formatSmartMoney, formatPct } from '../../../utils/format';
import { GradeBadge } from '../../common/GradeBadge';
import { SortableHeader } from '../../common/SortableHeader';
import AuditPanel from '../../common/AuditPanel';
import { SortState, sortRows } from '../../../utils/tableSort';
import { BcgMatrix, QuadrantKey } from '../parts/BcgMatrix';

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
  const colorClass = type === 'pos' ? 'text-emerald-600' : type === 'neg' ? 'text-red-500' : 'text-theme';
  const bgClass = type === 'pos' ? 'bg-green-50' : type === 'neg' ? 'bg-red-50' : 'bg-theme-10';

  return (
    <div className="bg-custom-glass backdrop-blur-custom p-4 rounded-xl border border-custom-glass shadow-sm flex items-start justify-between min-w-0">
      <div className="min-w-0 flex-1">
        <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1 truncate tracking-wider">{title}</span>
        <div className="font-bold text-gray-900 truncate text-sm font-mono">
          {sku || '\u2014'}
        </div>
        <div className={`text-xs font-bold mt-1 flex items-center gap-1 ${colorClass}`}>
          {delta !== undefined && delta !== null ? (
            <>
              {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
            </>
          ) : value !== undefined ? (
            formatSmartMoney(value)
          ) : '\u2014'}
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
  products, priceHistoryMap, refundHistory, dateWindow, deductRefunds, onDeepDive,
  startKey, endKey, isAuditVisible
}) => {
  const [sort, setSort] = useState<SortState<string>>({ key: 'revenue', dir: 'desc' });
  const [viewMode, setViewMode] = useState<'LIST' | 'MATRIX'>('LIST');
  const [selectedQuadrants, setSelectedQuadrants] = useState<QuadrantKey[]>([]);
  const pendingScrollRestoreRef = useRef<number | null>(null);

  const switchViewMode = (mode: 'LIST' | 'MATRIX') => {
    pendingScrollRestoreRef.current = window.scrollY;
    setViewMode(mode);
  };

  useEffect(() => {
    if (pendingScrollRestoreRef.current === null) return;
    const targetY = pendingScrollRestoreRef.current;
    pendingScrollRestoreRef.current = null;
    requestAnimationFrame(() => {
      window.scrollTo({ top: targetY, behavior: 'auto' });
    });
  }, [viewMode]);

  const toggleQuadrant = (quadrant: QuadrantKey) => {
    setSelectedQuadrants(prev => prev.includes(quadrant) ? prev.filter(q => q !== quadrant) : [...prev, quadrant]);
  };

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
    <div className="space-y-6 pb-24">
      {isAuditVisible && (
        <div className="">
          <AuditPanel
            title="Product Performance Audit"
            startKey={dateWindow.startKey}
            endKey={dateWindow.endKey}
            rows={trendData}
            getDateKey={() => null}
                        distinctDaysCount={startKey && endKey ? Math.round((new Date(endKey).getTime() - new Date(startKey).getTime()) / 86400000) + 1 : 0}
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
        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
          <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-start gap-3">
            <div className="flex flex-col gap-2 min-w-0">
              <div className="inline-flex max-w-full items-center gap-1 rounded-lg border border-gray-200 bg-white p-1">
                <button
                  onClick={() => toggleQuadrant('STARS')}
                  aria-pressed={selectedQuadrants.includes('STARS')}
                  className={`h-[34px] px-2.5 rounded-md border inline-flex items-center gap-1.5 cursor-pointer transition-all duration-150 hover:-translate-y-[1px] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-300 ${selectedQuadrants.includes('STARS') ? 'border-green-400 bg-green-50 shadow-sm ring-1 ring-green-200' : 'border-gray-200 bg-white hover:border-green-300 hover:bg-green-50/60'}`}
                >
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  <span className="text-[10px] font-bold text-green-700 uppercase">Stars</span>
                  <span className="text-[9px] text-gray-500">High Rev / Growing</span>
                </button>
                <button
                  onClick={() => toggleQuadrant('CASH_COWS')}
                  aria-pressed={selectedQuadrants.includes('CASH_COWS')}
                  className={`h-[34px] px-2.5 rounded-md border inline-flex items-center gap-1.5 cursor-pointer transition-all duration-150 hover:-translate-y-[1px] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-yellow-300 ${selectedQuadrants.includes('CASH_COWS') ? 'border-yellow-400 bg-yellow-50 shadow-sm ring-1 ring-yellow-200' : 'border-gray-200 bg-white hover:border-yellow-300 hover:bg-yellow-50/60'}`}
                >
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  <span className="text-[10px] font-bold text-yellow-700 uppercase">Cash Cows</span>
                  <span className="text-[9px] text-gray-500">High Rev / Stable</span>
                </button>
                <button
                  onClick={() => toggleQuadrant('QUESTIONS')}
                  aria-pressed={selectedQuadrants.includes('QUESTIONS')}
                  className={`h-[34px] px-2.5 rounded-md border inline-flex items-center gap-1.5 cursor-pointer transition-all duration-150 hover:-translate-y-[1px] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-300 ${selectedQuadrants.includes('QUESTIONS') ? 'border-[#8B5CF6] bg-purple-50 shadow-sm ring-1 ring-purple-200' : 'border-gray-200 bg-white hover:border-purple-300 hover:bg-purple-50/60'}`}
                >
                  <span className="w-2 h-2 rounded-full bg-[#5B21B6]"></span>
                  <span className="text-[10px] font-bold text-[#5B21B6] uppercase">Questions</span>
                  <span className="text-[9px] text-gray-500">Low Rev / Growing</span>
                </button>
                <button
                  onClick={() => toggleQuadrant('DOGS')}
                  aria-pressed={selectedQuadrants.includes('DOGS')}
                  className={`h-[34px] px-2.5 rounded-md border inline-flex items-center gap-1.5 cursor-pointer transition-all duration-150 hover:-translate-y-[1px] hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300 ${selectedQuadrants.includes('DOGS') ? 'border-red-400 bg-red-50 shadow-sm ring-1 ring-red-200' : 'border-gray-200 bg-white hover:border-red-300 hover:bg-red-50/60'}`}
                >
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  <span className="text-[10px] font-bold text-red-700 uppercase">Dogs</span>
                  <span className="text-[9px] text-gray-500">Low Rev / Declining</span>
                </button>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <div className="flex bg-white p-1 rounded-lg border border-gray-200">
                <button
                  onClick={() => switchViewMode('LIST')}
                  className={`px-2.5 py-1.5 rounded-md transition-all text-[12px] font-medium flex items-center gap-1.5 ${(viewMode as string) === 'LIST' ? 'bg-theme-10 text-theme shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Momentum Matrix Table"
                >
                  <List className="w-4 h-4" />
                  <span>Momentum Matrix Table</span>
                </button>
                <button
                  onClick={() => switchViewMode('MATRIX')}
                  className={`px-2.5 py-1.5 rounded-md transition-all text-[12px] font-medium flex items-center gap-1.5 ${(viewMode as string) === 'MATRIX' ? 'bg-theme-10 text-theme shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  title="BCG Chart"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>BCG Chart</span>
                </button>
              </div>
            </div>
          </div>
          <BcgMatrix
            data={trendData}
            onDeepDive={onDeepDive}
            hideLegend
            embedded
            selectedQuadrants={selectedQuadrants}
            onToggleQuadrant={toggleQuadrant}
          />
        </div>
      ) : (
        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
          <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center">
            <div className="flex items-center gap-3">
              <Trophy className="w-5 h-5 text-amber-500" />
              <div>
                <h3 className="font-bold text-gray-800 text-sm">SKU Momentum Matrix</h3>
                <p className="text-[10px] text-gray-500 uppercase tracking-tighter">Current vs Prior {'\u2022'} Ranked by Revenue</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white/50 px-2 py-1 rounded border border-gray-100 hidden sm:block">
                PoP Comparison
              </div>
              <div className="flex bg-white p-1 rounded-lg border border-gray-200">
                <button
                  onClick={() => switchViewMode('LIST')}
                  className={`px-2.5 py-1.5 rounded-md transition-all text-[12px] font-medium flex items-center gap-1.5 ${(viewMode as string) === 'LIST' ? 'bg-theme-10 text-theme shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Momentum Matrix Table"
                >
                  <List className="w-4 h-4" />
                  <span>Momentum Matrix Table</span>
                </button>
                <button
                  onClick={() => switchViewMode('MATRIX')}
                  className={`px-2.5 py-1.5 rounded-md transition-all text-[12px] font-medium flex items-center gap-1.5 ${(viewMode as string) === 'MATRIX' ? 'bg-theme-10 text-theme shadow-sm' : 'text-gray-400 hover:text-gray-600'}`}
                  title="BCG Chart"
                >
                  <LayoutGrid className="w-4 h-4" />
                  <span>BCG Chart</span>
                </button>
              </div>
            </div>
          </div>
          <div className="sello-table-scroll" style={{ paddingBottom: '5rem' }}>
            <table className="sello-table">
              <thead className="sticky top-0">
                <tr>
                  <th className="c">Detail</th>
                  <SortableHeader label="Product SKU" sortKey="sku" sort={sort} onChange={setSort} />
                  <SortableHeader label="Revenue" sortKey="revenue" sort={sort} onChange={setSort} align="right" />
                  <SortableHeader label="Net Profit" sortKey="profit" sort={sort} onChange={setSort} align="right" />
                  <SortableHeader label="Efficiency (Margin)" sortKey="margin" sort={sort} onChange={setSort} align="right" />
                  <SortableHeader label="Ads (TACoS)" sortKey="tacos" sort={sort} onChange={setSort} align="right" />
                  <SortableHeader label="Quality (Refunds)" sortKey="refund" sort={sort} onChange={setSort} align="right" />
                  <th className="c">Flags</th>
                </tr>
              </thead>
              <tbody>
                {sortedData.slice(0, 50).map((row) => {
                  const isRevWarning = row.deltas.revenueDeltaPct !== null && row.deltas.revenueDeltaPct <= -20;
                  const isMarginCritical = row.current.marginPct < 5;
                  const isTacosHigh = row.current.tacosPct !== null && row.current.tacosPct > 25;

                  return (
                    <tr key={row.sku} className="group">
                      <td className="c">
                        <button
                          onClick={() => onDeepDive(row.sku)}
                          className="p-1.5 text-gray-400 hover:text-theme hover:bg-white rounded border border-transparent hover:border-gray-200 shadow-none hover:shadow-sm transition-colors"
                          title="Deep Dive SKU"
                        >
                          <Search className="w-4 h-4" />
                        </button>
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 font-mono text-sm leading-none">{row.sku}</span>
                          <GradeBadge gradeLevel={row.gradeLevel} />
                        </div>
                        <div className="text-[9px] text-gray-400 font-bold uppercase mt-1 tracking-wider truncate max-w-[200px]">{row.name}</div>
                      </td>
                      <td className={`r transition-colors ${isRevWarning ? 'bg-red-50/30' : ''}`}>
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-gray-900">{formatSmartMoney(row.current.revenue)}</span>
                          <TrendDeltaPill value={row.deltas.revenueDeltaPct} />
                        </div>
                      </td>
                      <td className="r font-medium">
                        <div className="flex flex-col items-end">
                          <span className={`font-bold ${row.current.netProfit >= 0 ? 'text-gray-700' : 'text-red-500'}`}>
                            {formatSmartMoney(row.current.netProfit)}
                          </span>
                          <TrendDeltaPill value={row.deltas.netProfitDeltaPct} />
                        </div>
                      </td>
                      <td className={`r transition-colors ${isMarginCritical ? 'bg-amber-50/30' : ''}`}>
                        <div className="flex flex-col items-end">
                          <span className={`font-black ${row.current.marginPct < 15 ? 'text-amber-500' : 'text-emerald-600'}`}>
                            {formatPct(row.current.marginPct)}
                          </span>
                          <TrendDeltaPill value={row.deltas.marginDeltaPp} isPp />
                        </div>
                      </td>
                      <td className={`r transition-colors ${isTacosHigh ? 'bg-purple-50/30' : ''}`}>
                        <div className="flex flex-col items-end">
                          <span className="font-medium text-gray-700">
                            {row.current.tacosPct !== null ? formatPct(row.current.tacosPct) : '\u2014'}
                          </span>
                          <TrendDeltaPill value={row.deltas.tacosDeltaPp} isPp invert />
                        </div>
                      </td>
                      <td className="r transition-colors">
                        <div className="flex flex-col items-end">
                          <span className="font-medium text-gray-700">{formatPct(row.current.refundRatePct)}</span>
                          <TrendDeltaPill value={row.deltas.refundRateDeltaPp} isPp invert />
                        </div>
                      </td>
                      <td className="c">
                        <div className="flex justify-center gap-1.5 flex-wrap min-w-[100px]">
                          {isRevWarning && <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-red-100 text-red-800 border border-red-200 shadow-xs">Drop</span>}
                          {isMarginCritical && <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-amber-100 text-amber-800 border border-amber-200 shadow-xs">Margin</span>}
                          {isTacosHigh && <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-purple-100 text-purple-800 border border-purple-200 shadow-xs">Ads</span>}
                          {row.current.unitsSold === 0 && <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-gray-100 text-gray-500 border border-gray-200 shadow-xs">Dormant</span>}
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

