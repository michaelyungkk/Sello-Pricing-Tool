import { Product, PriceLog } from '../types';
import { calcRevenue, calcProfit, calcUnits, calcAdSpend, calcMarginPct, calcTACoSPct } from './metrics';
import { asDateKey, isDateKeyBetween, addDaysToDateKey } from './dateUtils';
import { scaleMoneyInclTax, assertNotAlreadyScaled } from './taxPolicy';

export interface CategoryMetric {
  revenue: number;
  units: number;
  orders: number;
  profit: number;
  adSpend: number;
  margin: number;
  tacos: number;
  // PoP data
  prevRevenue: number;
  prevUnits: number;
  prevProfit: number;
  prevAdSpend: number;
  prevMargin: number;
  prevTacos: number;
  // Guardrail: Explicit flag
  moneyIsTaxInclusive?: boolean;
}

export interface SubCategoryData {
    name: string;
    platforms: Record<string, CategoryMetric>; // Key: Platform Name
    total: CategoryMetric;
}

export interface MainCategoryData {
    name: string;
    platforms: Record<string, CategoryMetric>;
    total: CategoryMetric;
    subcategories: Record<string, SubCategoryData>;
}

const createEmptyMetric = (): CategoryMetric => ({
    revenue: 0, units: 0, orders: 0, profit: 0, adSpend: 0, margin: 0, tacos: 0,
    prevRevenue: 0, prevUnits: 0, prevProfit: 0, prevAdSpend: 0, prevMargin: 0, prevTacos: 0
});

const updateMetric = (current: CategoryMetric, log: PriceLog, product: Product, isPrevious: boolean) => {
    const rev = calcRevenue(log);
    const profit = calcProfit(log);
    const units = calcUnits(log);
    const adSpend = calcAdSpend(log);

    if (isPrevious) {
        current.prevRevenue += rev;
        current.prevProfit += profit;
        current.prevUnits += units;
        current.prevAdSpend += adSpend;
    } else {
        current.revenue += rev;
        current.profit += profit;
        current.units += units;
        current.adSpend += adSpend;
        if (units > 0 || rev > 0 || adSpend > 0) {
            current.orders += 1;
        }
    }
};

const finalizeMetric = (m: CategoryMetric) => {
    // Assert raw values are unscaled before applying VAT
    assertNotAlreadyScaled('finalizeMetric:revenue', m.revenue);

    // Apply VAT scaling to monetary values
    m.revenue = scaleMoneyInclTax(m.revenue);
    m.profit = scaleMoneyInclTax(m.profit);
    m.adSpend = scaleMoneyInclTax(m.adSpend);
    
    m.prevRevenue = scaleMoneyInclTax(m.prevRevenue);
    m.prevProfit = scaleMoneyInclTax(m.prevProfit);
    m.prevAdSpend = scaleMoneyInclTax(m.prevAdSpend);

    // Mark as tax inclusive to prevent double scaling downstream
    m.moneyIsTaxInclusive = true;

    // Recompute ratios based on scaled values (ratio remains mathematically invariant)
    m.margin = calcMarginPct(m.revenue, m.profit);
    m.tacos = calcTACoSPct(m.adSpend, m.revenue);
    m.prevMargin = calcMarginPct(m.prevRevenue, m.prevProfit);
    m.prevTacos = calcTACoSPct(m.prevAdSpend, m.prevRevenue);
};

export const aggregateCategoryData = (
    products: Product[],
    priceHistoryMap: Map<string, PriceLog[]>,
    dateRange: { start: Date; end: Date }
): { 
    categories: MainCategoryData[], 
    platforms: string[] 
} => {
    const startKey = asDateKey(dateRange.start);
    const endKey = asDateKey(dateRange.end);

    if (!startKey || !endKey) {
        return { categories: [], platforms: [] };
    }

    const durationMs = new Date(endKey).getTime() - new Date(startKey).getTime();
    const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24)) + 1;

    const prevEndKey = addDaysToDateKey(startKey, -1);
    const prevStartKey = addDaysToDateKey(prevEndKey, -(durationDays - 1));

    const skuMap = new Map<string, Product>();
    products.forEach(p => skuMap.set(p.sku, p));

    const categoryMap: Record<string, MainCategoryData> = {};
    const platformSet = new Set<string>();
    
    for (const [sku, logs] of priceHistoryMap.entries()) {
        const product = skuMap.get(sku);
        if (!product) continue;

        const mainCat = product.category || 'Uncategorized';
        const subCat = product.subcategory || 'General';

        if (!categoryMap[mainCat]) {
            categoryMap[mainCat] = {
                name: mainCat,
                platforms: {},
                total: createEmptyMetric(),
                subcategories: {}
            };
        }
        
        const catNode = categoryMap[mainCat];
        if (!catNode.subcategories[subCat]) {
            catNode.subcategories[subCat] = {
                name: subCat,
                platforms: {},
                total: createEmptyMetric()
            };
        }
        const subNode = catNode.subcategories[subCat];

        for (const log of logs) {
            const logKey = asDateKey(log.date);
            if (!logKey) continue;
            
            const isCurrent = isDateKeyBetween(logKey, startKey, endKey);
            const isPrevious = isDateKeyBetween(logKey, prevStartKey, prevEndKey);

            if (!isCurrent && !isPrevious) continue;

            const platform = log.platform || 'Unknown';
            platformSet.add(platform);

            // Update Platform-Specific Metrics
            if (!catNode.platforms[platform]) catNode.platforms[platform] = createEmptyMetric();
            if (!subNode.platforms[platform]) subNode.platforms[platform] = createEmptyMetric();

            updateMetric(catNode.platforms[platform], log, product, isPrevious);
            updateMetric(subNode.platforms[platform], log, product, isPrevious);
            
            // Update Totals
            updateMetric(catNode.total, log, product, isPrevious);
            updateMetric(subNode.total, log, product, isPrevious);
        }
    }

    // 2. Finalize calculations (margins, tacos)
    const sortedCategories = Object.values(categoryMap).map(cat => {
        // Finalize Platforms
        Object.values(cat.platforms).forEach(finalizeMetric);
        finalizeMetric(cat.total);

        // Finalize Subcategories
        Object.values(cat.subcategories).forEach(sub => {
            Object.values(sub.platforms).forEach(finalizeMetric);
            finalizeMetric(sub.total);
        });

        return cat;
    }).sort((a, b) => b.total.revenue - a.total.revenue); // Sort by total revenue desc

    const sortedPlatforms = Array.from(platformSet).sort();

    return {
        categories: sortedCategories,
        platforms: sortedPlatforms
    };
};