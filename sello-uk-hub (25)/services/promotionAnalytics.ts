import { PromotionEvent, PromotionItem, PriceLog, PriceChangeRecord, Product } from '../types';
import { asDateKey, isDateKeyBetween, addDaysToDateKey } from './dateUtils';
import { calcRevenue, calcUnits, calcProfit, marginPct } from './metrics';

/**
 * Lifecycle phases for a promotion
 */
export type PromoPhase = 'PRE' | 'LIVE' | 'POST';

export interface PromoWindowRange {
  start: string;
  end: string;
  days: number;
}

export interface PromoEffectivenessMetrics {
  sku: string;
  baselinePrice: number;
  promoPrice: number;
  baselineDailyUnits: number;
  forecastUnits: number;
  actualUnits: number;
  actualRevenue: number;
  actualProfit: number;
  upliftUnits: number;
  upliftRevenue: number;
  upliftProfit: number;
  marginPctDuring: number | null;
  compliance: {
    isDiscountValid: boolean; // promoPrice < baselinePrice
    isMarginPositive: boolean;
    errors: string[];
  };
}

/**
 * A) deriveDiscountedPrice
 * Calculates effective price based on discount logic
 */
export function deriveDiscountedPrice(
  baselinePrice: number,
  discountType: PromotionItem['discountType'],
  discountValue: number
): number {
  if (baselinePrice <= 0) return discountType === 'FIXED_PRICE' ? discountValue : 0;

  switch (discountType) {
    case 'PERCENT_OFF':
    case 'PERCENTAGE':
      return baselinePrice * (1 - discountValue / 100);
    case 'FIXED_OFF':
    case 'FIXED':
      return Math.max(0.01, baselinePrice - discountValue);
    case 'FIXED_PRICE':
    default:
      return discountValue;
  }
}

/**
 * B) computeBaselinePrice
 * Determines the 'normal' price before an event
 */
export function computeBaselinePrice(
  event: PromotionEvent,
  sku: string,
  platform: string,
  txLogs: PriceLog[],
  priceChangeHistory: PriceChangeRecord[] = [],
  product?: Product
): number {
  if (event.baselineMode === 'MANUAL') return event.baselineManualPrice || 0;

  const eventStart = asDateKey(event.startDate);
  if (!eventStart) return 0;

  const targetSku = sku.toUpperCase();

  if (event.baselineMode === 'CA_PRICE') {
    // 1. Check historical CA Price changes before the event
    const history = priceChangeHistory
      .filter(c => c.sku.toUpperCase() === targetSku && asDateKey(c.date)! <= eventStart)
      .sort((a, b) => b.date.localeCompare(a.date));

    if (history.length > 0) return history[0].newPrice;
    
    // 2. Fallback: Use live product data if available (fixes the $0 issue)
    if (product && product.caPrice && product.caPrice > 0) {
        return product.caPrice;
    }

    // 3. Last Resort: Use latest known transaction price before or during start
    const latestTx = txLogs
      .filter(l => l.sku.toUpperCase() === targetSku && (l.platform === platform || platform === 'All'))
      .sort((a, b) => b.date.localeCompare(a.date))[0];
    
    return latestTx?.price || (product?.currentPrice || 0);
  }

  if (event.baselineMode === 'PRE_EVENT_AVG_PRICE') {
    const preEnd = addDaysToDateKey(eventStart, -1);
    const preStart = addDaysToDateKey(preEnd, -13); // 14 day window

    const windowLogs = txLogs.filter(l => 
      l.sku.toUpperCase() === targetSku && 
      (l.platform === platform || platform === 'All') &&
      isDateKeyBetween(asDateKey(l.date)!, preStart, preEnd)
    );

    const totalRev = windowLogs.reduce((sum, l) => sum + calcRevenue(l), 0);
    const totalQty = windowLogs.reduce((sum, l) => sum + calcUnits(l), 0);

    return totalQty > 0 ? totalRev / totalQty : (product?.caPrice || product?.currentPrice || 0);
  }

  return 0;
}

/**
 * C) computePromoWindows
 */
export function computePromoWindows(event: PromotionEvent, nowKey: string): {
  phase: PromoPhase;
  pre: PromoWindowRange;
  event: PromoWindowRange;
  post: PromoWindowRange;
} {
  const start = asDateKey(event.startDate)!;
  const end = asDateKey(event.endDate)!;

  let phase: PromoPhase = 'LIVE';
  if (nowKey < start) phase = 'PRE';
  else if (nowKey > end) phase = 'POST';

  const getRange = (s: string, e: string): PromoWindowRange => {
    const diff = new Date(e).getTime() - new Date(s).getTime();
    return { start: s, end: e, days: Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)) + 1) };
  };

  const eventRange = getRange(start, end);
  
  return {
    phase,
    event: eventRange,
    pre: getRange(addDaysToDateKey(start, -14), addDaysToDateKey(start, -1)),
    post: getRange(addDaysToDateKey(end, 1), addDaysToDateKey(end, 14))
  };
}

/**
 * D) computePromoEffectiveness
 */
export function computePromoEffectiveness(
  event: PromotionEvent,
  sku: string,
  txLogs: PriceLog[],
  priceChangeHistory: PriceChangeRecord[] = [],
  product?: Product
): PromoEffectivenessMetrics {
  const platform = event.platform;
  const nowKey = asDateKey(new Date())!;
  const windows = computePromoWindows(event, nowKey);
  const targetSku = sku.toUpperCase();
  
  // 1. Resolve Pricing with Product Fallback
  const baselinePrice = computeBaselinePrice(event, sku, platform, txLogs, priceChangeHistory, product);
  const promoItem = event.items.find(i => i.sku.toUpperCase() === targetSku);
  
  let promoPrice = 0;
  if (event.promotionScope === 'SHOP') {
    promoPrice = deriveDiscountedPrice(baselinePrice, event.shopDiscountType || 'PERCENT_OFF', event.shopDiscountValue || 0);
  } else if (promoItem) {
    promoPrice = deriveDiscountedPrice(baselinePrice, promoItem.discountType || 'FIXED_PRICE', promoItem.discountValue || 0);
  }

  // 2. Pre-Window Analysis (Baseline Velocity)
  const preLogs = txLogs.filter(l => 
    l.sku.toUpperCase() === targetSku && 
    (l.platform === platform || platform === 'All') &&
    isDateKeyBetween(asDateKey(l.date)!, windows.pre.start, windows.pre.end)
  );
  const baselineDailyUnits = preLogs.length > 0 
    ? preLogs.reduce((sum, l) => sum + calcUnits(l), 0) / windows.pre.days
    : 0;

  // 3. During-Window Analysis (Actuals to current date)
  const limitDate = nowKey < windows.event.end ? nowKey : windows.event.end;
  const eventLogs = txLogs.filter(l => 
    l.sku.toUpperCase() === targetSku && 
    (l.platform === platform || platform === 'All') &&
    isDateKeyBetween(asDateKey(l.date)!, windows.event.start, limitDate)
  );

  const actualUnits = eventLogs.reduce((sum, l) => sum + calcUnits(l), 0);
  const actualRevenue = eventLogs.reduce((sum, l) => sum + calcRevenue(l), 0);
  const actualProfit = eventLogs.reduce((sum, l) => sum + calcProfit(l), 0);
  
  // 4. Forecast & Uplift
  const liftFactor = 1 + (event.expectedLiftPct || 0) / 100;
  const expectedUnitsBaseline = baselineDailyUnits * windows.event.days;
  const forecastUnits = expectedUnitsBaseline * liftFactor;

  const upliftUnits = actualUnits - (baselineDailyUnits * (eventLogs.length || 0));
  const upliftRevenue = actualRevenue - ((baselineDailyUnits * (eventLogs.length || 0)) * baselinePrice);

  // 5. Profit Uplift Calculation
  let baselineProfitPerUnit = 0;
  if (product) {
      const totalCost = (Number(product.costPrice) || 0) +
          (Number(product.sellingFee) || 0) +
          (Number(product.adsFee) || 0) +
          (Number(product.postage) || 0) +
          (Number(product.otherFee) || 0) +
          (Number(product.subscriptionFee) || 0) +
          (Number(product.wmsFee) || 0);
      
      // baselineProfitPerUnit = (Price + Income) - Costs
      baselineProfitPerUnit = (baselinePrice + (Number(product.extraFreight) || 0)) - totalCost;
  }
  const expectedProfitBaseline = baselineDailyUnits * (eventLogs.length || 0) * baselineProfitPerUnit;
  const upliftProfit = actualProfit - expectedProfitBaseline;

  const marginDuring = marginPct(actualProfit, actualRevenue);

  // 6. Compliance
  const errors: string[] = [];
  if (promoPrice >= baselinePrice && baselinePrice > 0) errors.push('Promo price is not a discount');

  return {
    sku,
    baselinePrice,
    promoPrice,
    baselineDailyUnits,
    forecastUnits,
    actualUnits,
    actualRevenue,
    actualProfit,
    upliftUnits,
    upliftRevenue,
    upliftProfit,
    marginPctDuring: marginDuring,
    compliance: {
      isDiscountValid: promoPrice < baselinePrice || baselinePrice === 0,
      isMarginPositive: (marginDuring || 0) > 0,
      errors
    }
  };
}