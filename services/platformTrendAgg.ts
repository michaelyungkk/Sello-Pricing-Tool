
import { PriceLog, RefundLog, ReturnDateBasis } from '../types';
import { aggregateTransactionLedger } from './metrics';
import { addDaysToDateKey } from './dateUtils';

export interface PlatformTrendMetrics {
  revenue: number;
  netProfit: number; // Final bottom line
  unitsSold: number;
  orders: number;
  adSpend: number;
  refundValue: number;
  avgOrderValue: number;
  marginPct: number;
  tacosPct: number;
  refundRatePct: number;
}

export interface PlatformTrendData {
  platform: string;
  current: PlatformTrendMetrics;
  prior: PlatformTrendMetrics;
  deltas: {
    revenueDeltaPct: number | null;
    netProfitDeltaPct: number | null;
    ordersDeltaPct: number | null;
    unitsDeltaPct: number | null;
    marginDeltaPp: number;
    tacosDeltaPp: number;
    refundRateDeltaPp: number;
    avgOrderValueDeltaPct: number | null;
  };
}

/**
 * Aggregates platform performance for a selected date window vs the immediate prior window of the same length.
 * All monetary outputs are Tax Inclusive.
 */
export const aggregatePlatformTrends = (
  priceLogs: PriceLog[],
  dateRange: { startKey: string; endKey: string },
  platforms: string[],
  refundHistory: RefundLog[] = [],
  deductRefunds: boolean = false,
  dateBasis: ReturnDateBasis = 'refundDate',
  orderDateMap?: Map<string, string>
): PlatformTrendData[] => {
  const { startKey, endKey } = dateRange;

  // Calculate duration
  const startDate = new Date(startKey);
  const endDate = new Date(endKey);
  const diffTime = endDate.getTime() - startDate.getTime();
  const durationDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

  // Calculate prior window
  const prevEndKey = addDaysToDateKey(startKey, -1);
  const prevStartKey = addDaysToDateKey(prevEndKey, -(durationDays - 1));

  const currentLedger = aggregateTransactionLedger({
    priceLogs,
    refundLogs: refundHistory,
    startKey,
    endKey,
    returnDateBasis: dateBasis,
    orderDateMap,
    deductRefunds
  });
  const priorLedger = aggregateTransactionLedger({
    priceLogs,
    refundLogs: refundHistory,
    startKey: prevStartKey,
    endKey: prevEndKey,
    returnDateBasis: dateBasis,
    orderDateMap,
    deductRefunds
  });

  // 3. Transform to Final Output
  return platforms.map(platform => {
    const processMetrics = (b?: any): PlatformTrendMetrics => {
      const revenue = b?.revenue || 0;
      const netProfit = b?.netProfit || 0;
      const adSpend = b?.adjustedAdSpend || 0;
      const refundValue = b?.refundImpact || 0;
      const orders = b?.orders || 0;

      return {
        revenue,
        netProfit,
        adSpend,
        refundValue,
        unitsSold: b?.units || 0,
        orders,
        avgOrderValue: orders > 0 ? (revenue / orders) : 0,
        marginPct: b?.margin ?? 0,
        tacosPct: revenue > 0 ? (adSpend / revenue) * 100 : 0,
        refundRatePct: revenue > 0 ? (refundValue / revenue) * 100 : 0
      };
    };

    const current = processMetrics(currentLedger.byPlatform[platform]);
    const prior = processMetrics(priorLedger.byPlatform[platform]);

    // Deltas
    const calcDeltaPct = (curr: number, prev: number): number | null => {
      if (prev === 0) return curr === 0 ? 0 : null; // null indicates new or undefined growth
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

    return {
      platform,
      current,
      prior,
      deltas: {
        revenueDeltaPct: calcDeltaPct(current.revenue, prior.revenue),
        netProfitDeltaPct: calcDeltaPct(current.netProfit, prior.netProfit),
        ordersDeltaPct: calcDeltaPct(current.orders, prior.orders),
        unitsDeltaPct: calcDeltaPct(current.unitsSold, prior.unitsSold),
        marginDeltaPp: current.marginPct - prior.marginPct,
        tacosDeltaPp: current.tacosPct - prior.tacosPct,
        refundRateDeltaPp: current.refundRatePct - prior.refundRatePct,
        avgOrderValueDeltaPct: calcDeltaPct(current.avgOrderValue, prior.avgOrderValue)
      }
    };
  });
};
