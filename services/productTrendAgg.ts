
import { PriceLog, RefundLog, Product, ReturnDateBasis } from '../types';
import { calcRevenue, calcProfit, calcUnits, calcAdSpend, getReturnDateKey } from './metrics';
import { asDateKey, isDateKeyBetween, addDaysToDateKey } from './dateUtils';
import { scaleMoneyInclTax } from './taxPolicy';
import { VAT_MULTIPLIER } from '../constants';

export interface ProductTrendMetrics {
  revenue: number;
  netProfit: number;
  unitsSold: number;
  adSpend: number;
  refundValue: number;
  marginPct: number;
  tacosPct: number | null;
  refundRatePct: number;
}

export interface ProductTrendData {
  sku: string;
  name: string;
  category: string;
  gradeLevel?: number;
  current: ProductTrendMetrics;
  prior: ProductTrendMetrics;
  deltas: {
    revenueDeltaPct: number | null;
    netProfitDeltaPct: number | null;
    unitsDeltaPct: number | null;
    marginDeltaPp: number;
    tacosDeltaPp: number | null;
    refundRateDeltaPp: number;
  };
}

interface RawBucket {
  revenue: number;
  netProfit: number;
  adSpend: number;
  refundValue: number;
  units: number;
  adRowsCount: number;
}

const createRawBucket = (): RawBucket => ({
  revenue: 0,
  netProfit: 0,
  adSpend: 0,
  refundValue: 0,
  units: 0,
  adRowsCount: 0
});

/**
 * Aggregates SKU-level performance for a selected date window vs the prior window.
 */
export const aggregateProductTrends = (
  products: Product[],
  priceLogs: PriceLog[],
  dateRange: { startKey: string; endKey: string },
  refundHistory: RefundLog[] = [],
  deductRefunds: boolean = false,
  dateBasis: ReturnDateBasis = 'refundDate',
  orderDateMap?: Map<string, string>
): ProductTrendData[] => {
  const { startKey, endKey } = dateRange;

  const startDate = new Date(startKey);
  const endDate = new Date(endKey);
  const diffTime = endDate.getTime() - startDate.getTime();
  const durationDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

  const prevEndKey = addDaysToDateKey(startKey, -1);
  const prevStartKey = addDaysToDateKey(prevEndKey, -(durationDays - 1));

  const buckets: Record<string, { current: RawBucket; prior: RawBucket }> = {};
  const skuInfoMap = new Map<string, Product>();

  products.forEach(p => {
    buckets[p.sku] = { current: createRawBucket(), prior: createRawBucket() };
    skuInfoMap.set(p.sku, p);
  });

  // 1. Transaction Aggregation
  for (const log of priceLogs) {
    const logDateKey = asDateKey(log.date);
    if (!logDateKey || !buckets[log.sku]) continue;

    const bucketPair = buckets[log.sku];
    const isCurrent = isDateKeyBetween(logDateKey, startKey, endKey);
    const isPrior = isDateKeyBetween(logDateKey, prevStartKey, prevEndKey);

    if (!isCurrent && !isPrior) continue;

    const target = isCurrent ? bucketPair.current : bucketPair.prior;
    const p = skuInfoMap.get(log.sku);

    target.revenue += calcRevenue(log);
    target.netProfit += calcProfit(log);
    target.units += calcUnits(log);
    
    const ads = log.adsSpend !== undefined ? log.adsSpend : (p?.adsFee || 0) * log.velocity;
    target.adSpend += ads;
    if (log.adsSpend !== undefined) target.adRowsCount++;
  }

  // 2. Refund Deductions
  for (const r of refundHistory) {
    const refundDateKey = getReturnDateKey(r, dateBasis, orderDateMap);
    if (!refundDateKey || !buckets[r.sku]) continue;

    const isCurrent = isDateKeyBetween(refundDateKey, startKey, endKey);
    const isPrior = isDateKeyBetween(refundDateKey, prevStartKey, prevEndKey);

    if (!isCurrent && !isPrior) continue;

    const target = isCurrent ? buckets[r.sku].current : buckets[r.sku].prior;
    const refundVal = (Number(r.amount) + Number(r.freightAmount || 0));
    target.refundValue += refundVal;
    
    if (deductRefunds) {
      target.netProfit -= refundVal;
    }
  }

  // 3. Transform
  return products.map(p => {
    const raw = buckets[p.sku];
    
    const process = (b: RawBucket): ProductTrendMetrics => {
      const revenue = scaleMoneyInclTax(b.revenue);
      const netProfit = scaleMoneyInclTax(b.netProfit);
      const adSpend = scaleMoneyInclTax(b.adSpend);
      const refundValue = scaleMoneyInclTax(b.refundValue);

      return {
        revenue,
        netProfit,
        adSpend,
        refundValue,
        unitsSold: b.units,
        marginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
        tacosPct: (revenue > 0 && b.adRowsCount > 0) ? (adSpend / revenue) * 100 : null,
        refundRatePct: revenue > 0 ? (refundValue / revenue) * 100 : 0
      };
    };

    const current = process(raw.current);
    const prior = process(raw.prior);

    const calcDeltaPct = (curr: number, prev: number): number | null => {
      if (prev === 0) return curr === 0 ? 0 : null;
      return ((curr - prev) / Math.abs(prev)) * 100;
    };

    const tacosDelta = (current.tacosPct !== null && prior.tacosPct !== null) 
      ? current.tacosPct - prior.tacosPct 
      : null;

    return {
      sku: p.sku,
      name: p.name,
      category: p.category || 'Uncategorized',
      gradeLevel: p.gradeLevel,
      current,
      prior,
      deltas: {
        revenueDeltaPct: calcDeltaPct(current.revenue, prior.revenue),
        netProfitDeltaPct: calcDeltaPct(current.netProfit, prior.netProfit),
        unitsDeltaPct: calcDeltaPct(current.unitsSold, prior.unitsSold),
        marginDeltaPp: current.marginPct - prior.marginPct,
        tacosDeltaPp: tacosDelta,
        refundRateDeltaPp: current.refundRatePct - prior.refundRatePct
      }
    };
  });
};
