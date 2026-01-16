
import { Product, PriceLog } from '../types';
import { POSTCODE_COORDS } from '../components/UkPostcodeMapCoords';
import { calcRevenue, calcProfit, calcUnits, calcAdSpend, calcMarginPct, calcTACoSPct } from './metrics';
import { asDateKey, isDateKeyBetween, addDaysToDateKey } from './dateUtils';

// In-component type for aggregated data
export interface DistrictData {
    code: string;
    revenue: number;
    volume: number;
    profit: number;
    totalShippingCost: number;
    avgShippingCost: number;
}
export interface AreaData {
    code: string;
    revenue: number;
    volume: number;
    orders: number;
    profit: number;
    margin: number;
    returnRate: number;
    avgShippingCost: number;
    adSpend: number;
    tacos: number;
    coordinates: [number, number];
    platformBreakdown: { platform: string; revenue: number; volume: number; profit: number }[];
    topSkus: { sku: string; name: string; profit: number; volume: number }[];
    prevRevenue: number;
    prevVolume: number;
    revenueDelta: number;
    volumeDelta: number;
    revenueDeltaPct: number;
    volumeDeltaPct: number;
    districtBreakdown: DistrictData[];
    totalShippingCost: number;
}


interface MapFilters {
  startDate: Date;
  endDate: Date;
  selectedPlatform: string;
  selectedCategory: string;
  selectedSubcategory: string;
}

export const aggregateUkMapData = (
  products: Product[],
  priceHistoryMap: Map<string, PriceLog[]>,
  filters: MapFilters
): AreaData[] => {
    const { startDate, endDate, selectedPlatform, selectedCategory, selectedSubcategory } = filters;

    const startKey = asDateKey(startDate);
    const endKey = asDateKey(endDate);

    if (!startKey || !endKey) {
        return [];
    }

    const durationMs = new Date(endKey).getTime() - new Date(startKey).getTime();
    const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24)) + 1;

    const prevEndKey = addDaysToDateKey(startKey, -1);
    const prevStartKey = addDaysToDateKey(prevEndKey, -(durationDays - 1));
    
    const areaStats: Record<string, { 
        revenue: number, 
        volume: number, 
        orders: number,
        profit: number, 
        prevRevenue: number;
        prevVolume: number;
        prevProfit: number;
        weightedReturnRate: number,
        totalPostage: number,
        totalAdSpend: number,
        platforms: Record<string, { revenue: number, volume: number, profit: number }>,
        skus: Record<string, { name: string, profit: number, volume: number, revenue: number }>
    }> = {};
    
    const districtStats: Record<string, { revenue: number, volume: number, profit: number, totalPostage: number }> = {};

    const skuMap = new Map<string, Product>();
    
    // Pre-filter products to optimize loop
    const relevantProducts = products.filter(p => {
        if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;
        if (selectedSubcategory !== 'All' && p.subcategory !== selectedSubcategory) return false;
        return true;
    });

    relevantProducts.forEach(p => skuMap.set(p.sku, p));
    const validSkus = new Set(relevantProducts.map(p => p.sku));

    // Iterate through all history logs
    for (const [sku, logs] of priceHistoryMap.entries()) {
        if (!validSkus.has(sku)) continue;
        const product = skuMap.get(sku);
        if (!product) continue;

        logs.forEach(log => {
            // Apply Global Filters
            if (selectedPlatform !== 'All' && log.platform !== selectedPlatform) return;
            
            const logKey = asDateKey(log.date);
            if (!logKey) return;
            
            // Extract Postcode Area
            if (!log.postcode) return;
            const areaMatch = log.postcode.match(/^([A-Z]{1,2})/i); 
            const districtMatch = log.postcode.match(/^([A-Z]{1,2}[0-9R][0-9A-Z]?)/i);
            
            if (!areaMatch) return;
            const areaCode = areaMatch[1].toUpperCase();
            
            if (!areaStats[areaCode]) {
                areaStats[areaCode] = { revenue: 0, volume: 0, orders: 0, profit: 0, prevRevenue: 0, prevVolume: 0, prevProfit: 0, weightedReturnRate: 0, totalPostage: 0, totalAdSpend: 0, platforms: {}, skus: {} };
            }

            const rev = calcRevenue(log);
            const profit = calcProfit(log);
            const units = calcUnits(log);

            // Aggregate District Level Data
            if (districtMatch) {
                const districtCode = districtMatch[1].toUpperCase();
                if (!districtStats[districtCode]) {
                    districtStats[districtCode] = { revenue: 0, volume: 0, profit: 0, totalPostage: 0 };
                }
                if (isDateKeyBetween(logKey, startKey, endKey)) {
                    districtStats[districtCode].revenue += rev;
                    districtStats[districtCode].volume += units;
                    districtStats[districtCode].profit += profit;
                    districtStats[districtCode].totalPostage += (product.postage || 0) * units;
                }
            }
            
            const area = areaStats[areaCode];
            const platform = log.platform || 'Unknown';
            const adSpend = calcAdSpend(log);
            
            if (isDateKeyBetween(logKey, startKey, endKey)) {
                // Top level stats
                area.revenue += rev;
                area.volume += units;
                area.orders += 1; // Assuming one log is one transaction/order
                area.profit += profit;
                area.weightedReturnRate += (product.returnRate || 0) * units;
                area.totalPostage += (product.postage || 0) * units;
                area.totalAdSpend += adSpend;
                
                // Platform breakdown
                if (!area.platforms[platform]) area.platforms[platform] = { revenue: 0, volume: 0, profit: 0 };
                area.platforms[platform].revenue += rev;
                area.platforms[platform].volume += units;
                area.platforms[platform].profit += profit;

                // SKU breakdown
                if (!area.skus[sku]) area.skus[sku] = { name: product.name, profit: 0, volume: 0, revenue: 0 };
                area.skus[sku].profit += profit;
                area.skus[sku].volume += units;
                area.skus[sku].revenue += rev;

            } else if (isDateKeyBetween(logKey, prevStartKey, prevEndKey)) {
                area.prevRevenue += rev;
                area.prevVolume += units;
                area.prevProfit += profit;
            }
        });
    }

    return Object.entries(areaStats).map(([code, stats]) => {
        const platformBreakdown = Object.entries(stats.platforms)
            .map(([platform, data]) => ({ platform, ...data }))
            .sort((a, b) => b.revenue - a.revenue);
        
        const topSkus = Object.entries(stats.skus)
            .map(([sku, data]) => ({ sku, ...data }))
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 3);

        const revenueDelta = stats.revenue - stats.prevRevenue;
        const volumeDelta = stats.volume - stats.prevVolume;
        
        const districtBreakdown = Object.entries(districtStats)
          .filter(([districtCode]) => {
              const prefixMatch = districtCode.match(/^[A-Z]+/);
              return prefixMatch && prefixMatch[0] === code;
          })
          .map(([districtCode, districtData]) => ({
            code: districtCode,
            revenue: districtData.revenue,
            volume: districtData.volume,
            profit: districtData.profit,
            totalShippingCost: districtData.totalPostage,
            avgShippingCost: districtData.volume > 0 ? districtData.totalPostage / districtData.volume : 0
          }))
          .sort((a, b) => b.revenue - a.revenue);

        return {
            code,
            revenue: stats.revenue,
            volume: stats.volume,
            orders: stats.orders,
            profit: stats.profit,
            margin: calcMarginPct(stats.revenue, stats.profit),
            returnRate: stats.volume > 0 ? stats.weightedReturnRate / stats.volume : 0,
            avgShippingCost: stats.volume > 0 ? stats.totalPostage / stats.volume : 0,
            totalShippingCost: stats.totalPostage,
            adSpend: stats.totalAdSpend,
            tacos: calcTACoSPct(stats.totalAdSpend, stats.revenue),
            coordinates: POSTCODE_COORDS[code],
            platformBreakdown,
            topSkus,
            prevRevenue: stats.prevRevenue,
            prevVolume: stats.prevVolume,
            revenueDelta,
            volumeDelta,
            revenueDeltaPct: stats.prevRevenue > 0 ? (revenueDelta / stats.prevRevenue) * 100 : (revenueDelta > 0 ? Infinity : 0),
            volumeDeltaPct: stats.prevVolume > 0 ? (volumeDelta / stats.prevVolume) * 100 : (volumeDelta > 0 ? Infinity : 0),
            districtBreakdown,
        };
    }).filter(d => d.coordinates);
};
