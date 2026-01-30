import { PriceLog } from '../types';
import { calcRevenue, calcProfit, calcUnits, calcAdSpend, calcMarginPct, calcTACoSPct } from './metrics';
import { asDateKey, isDateKeyBetween, addDaysToDateKey } from './dateUtils';
import { scaleMoneyInclTax } from './taxPolicy';

export interface PlatformTrendMetrics {
  revenue: number;
  netProfit: number; // Final bottom line
  unitsSold: number;
  orders: number;
  adSpend: number;
  avgOrderValue: number;
  marginPct: number;
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
    avgOrderValueDeltaPct: number | null;
  };
}

interface RawBucket {
  revenue: number;
  netProfit: number; // calcProfit result (already Net After Ads)
  adSpend: number;
  units: number;
  orderIds: Set<string>;
  nonOrderCount: number;
}

const createRawBucket = (): RawBucket => ({
  revenue: 0,
  netProfit: 0,
  adSpend: 0,
  units: 0,
  orderIds: new Set(),
  nonOrderCount: 0
});

/**
 * Aggregates platform performance for a selected date window vs the immediate prior window of the same length.
 * All monetary outputs are Tax Inclusive.
 */
export const aggregatePlatformTrends = (
  priceLogs: PriceLog[],
  dateRange: { startKey: string; endKey: string },
  platforms: string[]
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

  // Aggregate Logs
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
    targetBucket.netProfit += calcProfit(log); // calcProfit is Net After Ads
    targetBucket.adSpend += calcAdSpend(log);
    targetBucket.units += calcUnits(log);

    if (log.orderId) {
      targetBucket.orderIds.add(log.orderId);
    } else {
      targetBucket.nonOrderCount++;
    }
  }

  // Transform to Final Output
  return platforms.map(platform => {
    const raw = buckets[platform] || { current: createRawBucket(), prior: createRawBucket() };

    const processMetrics = (b: RawBucket): PlatformTrendMetrics => {
      // 1. Scale Money to Tax Inclusive
      const revenue = scaleMoneyInclTax(b.revenue);
      const netProfit = scaleMoneyInclTax(b.netProfit);
      const adSpend = scaleMoneyInclTax(b.adSpend);
      const orders = b.orderIds.size + b.nonOrderCount;

      return {
        revenue,
        netProfit,
        adSpend,
        unitsSold: b.units,
        orders,
        avgOrderValue: orders > 0 ? (revenue / orders) : 0,
        marginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0
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
        avgOrderValueDeltaPct: calcDeltaPct(current.avgOrderValue, prior.avgOrderValue)
      }
    };
  });
};