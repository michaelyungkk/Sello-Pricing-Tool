
import { PriceLog, RefundLog, ReturnDateBasis } from '../types';
import { calcRevenue, calcProfit, calcUnits, calcAdSpend, calcNetProfitFact, getReturnDateKey } from './metrics';
import { asDateKey, isDateKeyBetween, addDaysToDateKey } from './dateUtils';
import { scaleMoneyInclTax } from './taxPolicy';
import { VAT_MULTIPLIER } from '../constants';

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

interface RawBucket {
  revenue: number;
  netProfit: number; // calcProfit result (already Net After Ads)
  adSpend: number;
  refundValue: number;
  units: number;
  orderIds: Set<string>;
  nonOrderCount: number;
  adRowsCount: number;
}

const createRawBucket = (): RawBucket => ({
  revenue: 0,
  netProfit: 0,
  adSpend: 0,
  refundValue: 0,
  units: 0,
  orderIds: new Set(),
  nonOrderCount: 0,
  adRowsCount: 0
});

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

  // Initialize buckets
  const buckets: Record<string, { current: RawBucket; prior: RawBucket }> = {};
  platforms.forEach(p => {
    buckets[p] = { current: createRawBucket(), prior: createRawBucket() };
  });

  // Include an 'Unknown' bucket just in case
  buckets['Unknown'] = { current: createRawBucket(), prior: createRawBucket() };

  // 1. Aggregate Transaction Logs
  for (const log of priceLogs) {
    const logDateKey = asDateKey(log.date);
    if (!logDateKey) continue;

    const platform = (log.platform && buckets[log.platform]) ? log.platform : 'Unknown';
    const bucketPair = buckets[platform];

    const isCurrent = isDateKeyBetween(logDateKey, startKey, endKey);
    const isPrior = isDateKeyBetween(logDateKey, prevStartKey, prevEndKey);

    if (!isCurrent && !isPrior) continue;

    const targetBucket = isCurrent ? bucketPair.current : bucketPair.prior;

    // Accumulate Raw Metrics
    targetBucket.revenue += calcRevenue(log);
    targetBucket.netProfit += calcNetProfitFact(log); // net profit after ads, fact-based for ad-only rows
    targetBucket.adSpend += calcAdSpend(log);
    targetBucket.units += calcUnits(log);

    if (log.adsSpend !== undefined && log.adsSpend !== null) {
      targetBucket.adRowsCount++;
    }

    if (log.orderId) {
      targetBucket.orderIds.add(log.orderId);
    } else {
      targetBucket.nonOrderCount++;
    }
  }

  // 2. Process Refund Deductions
  for (const r of refundHistory) {
    const refundDateKey = getReturnDateKey(r, dateBasis, orderDateMap);
    if (!refundDateKey) continue;

    const isCurrent = isDateKeyBetween(refundDateKey, startKey, endKey);
    const isPrior = isDateKeyBetween(refundDateKey, prevStartKey, prevEndKey);

    if (!isCurrent && !isPrior) continue;

    const platform = (r.platform && buckets[r.platform]) ? r.platform : 'Unknown';
    const bucketPair = buckets[platform];
    const targetBucket = isCurrent ? bucketPair.current : bucketPair.prior;

    const refundVal = (Number(r.amount) + Number(r.freightAmount || 0));
    targetBucket.refundValue += refundVal;
    
    if (deductRefunds) {
      targetBucket.netProfit -= refundVal;
    }
  }

  // 3. Transform to Final Output
  return platforms.map(platform => {
    const raw = buckets[platform] || { current: createRawBucket(), prior: createRawBucket() };

    const processMetrics = (b: RawBucket): PlatformTrendMetrics => {
      // Scale Money to Tax Inclusive
      const revenue = scaleMoneyInclTax(b.revenue);
      const netProfit = scaleMoneyInclTax(b.netProfit);
      const adSpend = scaleMoneyInclTax(b.adSpend);
      const refundValue = scaleMoneyInclTax(b.refundValue);
      const orders = b.orderIds.size + b.nonOrderCount;

      return {
        revenue,
        netProfit,
        adSpend,
        refundValue,
        unitsSold: b.units,
        orders,
        avgOrderValue: orders > 0 ? (revenue / orders) : 0,
        marginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
        tacosPct: revenue > 0 ? (adSpend / revenue) * 100 : 0,
        refundRatePct: revenue > 0 ? (refundValue / revenue) * 100 : 0
      };
    };

    const current = processMetrics(raw.current);
    const prior = processMetrics(raw.prior);

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
