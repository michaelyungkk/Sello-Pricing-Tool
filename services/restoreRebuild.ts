import { DEFAULT_THRESHOLDS, ThresholdConfig } from './thresholdsConfig';
import { resolveEffectiveVelocity, toNumber } from './metrics';
import { resolveAttribute } from './mappingService';
import { redistributeAdSpend } from './adSpreadService';
import { AdGroup, AttributeMap, PriceLog, PricingRules, Product, VelocityLookback } from '../types';

const recalculateRestoreProductMetrics = (
    products: Product[],
    historyOrMap: PriceLog[] | Map<string, PriceLog[]>,
    lookback: VelocityLookback,
    thresholds: ThresholdConfig,
    pricingRules?: PricingRules,
    brandMap?: AttributeMap,
    categoryMap?: AttributeMap
): Product[] => {
    let historyMap: Map<string, PriceLog[]>;
    let historyArray: PriceLog[];

    if (historyOrMap instanceof Map) {
        historyMap = historyOrMap;
        historyArray = [];
        historyOrMap.forEach(logs => historyArray.push(...logs));
    } else {
        historyArray = historyOrMap || [];
        historyMap = new Map<string, PriceLog[]>();
        historyArray.forEach(h => {
            if (!h || !h.sku) return;
            if (!historyMap.has(h.sku)) historyMap.set(h.sku, []);
            historyMap.get(h.sku)!.push(h);
        });
    }

    let days = 30;
    if (lookback === 'ALL') {
        if (historyArray.length > 0) {
            const daysArr = historyArray.map(l => new Date(l.date).getTime()).filter(t => !isNaN(t));
            if (daysArr.length > 0) {
                const minDate = Math.min(...daysArr);
                const diff = Date.now() - minDate;
                days = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
            }
        }
    } else {
        days = parseInt(lookback) || 30;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    cutoffDate.setHours(0, 0, 0, 0);

    const prevCutoffDate = new Date(cutoffDate);
    prevCutoffDate.setDate(prevCutoffDate.getDate() - days);

    return (products || []).map(p => {
        if (!p) return p;
        const logs = historyMap.get(p.sku) || [];

        let currentQty = 0;
        let prevQty = 0;
        const priceMap = new Map<number, number>();

        logs.forEach(l => {
            const d = new Date(l.date);
            if (isNaN(d.getTime())) return;

            if (d >= cutoffDate) {
                currentQty += toNumber(l.velocity);
            } else if (d >= prevCutoffDate) {
                prevQty += toNumber(l.velocity);
            }

            let isCostBased = false;
            if (pricingRules && l.platform) {
                const config = pricingRules[l.platform];
                if (config && config.pricingControl === 'PLATFORM_COST_BASED') {
                    isCostBased = true;
                }
            }

            if (!isCostBased && l.velocity > 0 && l.price > 0) {
                const pricePoint = Math.round(l.price * 100) / 100;
                priceMap.set(pricePoint, (priceMap.get(pricePoint) || 0) + l.velocity);
            }
        });

        const effectiveDailySales = resolveEffectiveVelocity(p, logs);
        const calculatedPrevDailySales = prevQty / days;
        const daysRemaining = effectiveDailySales > 0 ? toNumber(p.stockLevel) / effectiveDailySales : 999;

        let status: 'Critical' | 'Warning' | 'Healthy' | 'Overstock' = 'Healthy';
        if (toNumber(p.stockLevel) <= 0) status = 'Critical';
        else if (daysRemaining < toNumber(p.leadTimeDays, 30) * toNumber(thresholds.stockoutRunwayMultiplier, 1)) status = 'Critical';
        else if (daysRemaining > toNumber(thresholds.overstockDays, 120)) status = 'Overstock';
        else if (daysRemaining < toNumber(p.leadTimeDays, 30) * (toNumber(thresholds.stockoutRunwayMultiplier, 1) + 0.5)) status = 'Warning';

        const currentCalculatedVelocity = currentQty / days;
        const velocityChange = calculatedPrevDailySales > 0
            ? ((currentCalculatedVelocity - calculatedPrevDailySales) / calculatedPrevDailySales) * 100
            : 0;

        let maxVel = 0;
        let maxVelocityPrice: number | undefined = undefined;
        priceMap.forEach((qty, price) => {
            if (qty > maxVel) {
                maxVel = qty;
                maxVelocityPrice = price;
            } else if (qty === maxVel && maxVel > 0) {
                if (price > (maxVelocityPrice || 0)) {
                    maxVelocityPrice = price;
                }
            }
        });

        let resolvedBrand = p.brand;
        let resolvedCategory = p.category;

        if (brandMap && p.brand) {
            resolvedBrand = resolveAttribute(p.brand, brandMap);
        }
        if (categoryMap && p.category) {
            resolvedCategory = resolveAttribute(p.category, categoryMap);
        }

        return {
            ...p,
            averageDailySales: effectiveDailySales,
            previousDailySales: calculatedPrevDailySales,
            daysRemaining,
            status,
            maxVelocityPrice,
            _trendData: { velocityChange },
            brand: resolvedBrand,
            category: resolvedCategory
        };
    }).filter(Boolean);
};

export interface RestoreRebuildPayload {
    redistributedSalesHistory: PriceLog[];
    rebuiltProducts: Product[];
    recalculationSummary: {
        affectedTransactions: number;
        totalSpreadAmount: number;
        daysProcessed: number;
    };
}

export const buildRestoreRebuildPayload = ({
    adGroups,
    products,
    priceHistory,
    velocityLookback,
    thresholds,
    pricingRules,
    brandMap,
    categoryMap
}: {
    adGroups: AdGroup[];
    products: Product[];
    priceHistory: PriceLog[];
    velocityLookback: VelocityLookback;
    thresholds?: ThresholdConfig | null;
    pricingRules?: PricingRules;
    brandMap?: AttributeMap;
    categoryMap?: AttributeMap;
}): RestoreRebuildPayload => {
    const redistributedSalesHistory = redistributeAdSpend(priceHistory || [], adGroups || []);

    let affectedTransactions = 0;
    let totalSpreadAmount = 0;
    const processedDates = new Set<string>();

    redistributedSalesHistory.forEach((log, i) => {
        const original = priceHistory[i];
        if (log.adsSpend !== (original?.adsSpend || 0)) {
            affectedTransactions++;
            totalSpreadAmount += Math.abs((log.adsSpend || 0) - (original?.adsSpend || 0));
            processedDates.add(log.date.split('T')[0]);
        }
    });

    const rebuiltProducts = recalculateRestoreProductMetrics(
        products || [],
        redistributedSalesHistory,
        velocityLookback || '30',
        thresholds || DEFAULT_THRESHOLDS,
        pricingRules,
        brandMap,
        categoryMap
    );

    return {
        redistributedSalesHistory,
        rebuiltProducts,
        recalculationSummary: {
            affectedTransactions,
            totalSpreadAmount,
            daysProcessed: processedDates.size
        }
    };
};
