
import { PriceLog, AdGroup } from '../types';

/**
 * Redistributes ad spend within Ad Groups based on an equal split across all family members.
 * This ensures that campaign costs are shared evenly regardless of individual SKU sales performance.
 * 
 * Only transactions falling within the group's startDate and endDate range are redistributed.
 * Transactions outside this range retain their raw platform-reported ad spend.
 * 
 * @param salesHistory The array of sales transactions to process
 * @param adGroups The array of ad groups defining SKU memberships and platforms
 * @returns A new array of PriceLogs with redistributed ad spend values
 */
export function redistributeAdSpend(salesHistory: PriceLog[], adGroups: AdGroup[]): PriceLog[] {
    // Return early if no history
    if (salesHistory.length === 0) {
        return salesHistory.map(log => ({ ...log }));
    }

    // Create a new array to maintain purity and keep a stable raw baseline.
    const results = salesHistory.map(log => {
        const baseline = (log.rawAdsSpend ?? log.adsSpend ?? 0);
        return {
            ...log,
            rawAdsSpend: baseline
        };
    });

    // Fact-based reset: with no groups, revert adjusted spend back to raw baseline.
    if (!adGroups || adGroups.length === 0) {
        return results.map(log => ({
            ...log,
            adsSpend: log.rawAdsSpend ?? log.adsSpend ?? 0
        }));
    }

    /**
     * Helper to group indices by date for a specific platform and set of SKUs.
     */
    adGroups.forEach(group => {
        const groupSkus = new Set(group.memberSkus);
        const targetPlatform = group.platform;
        const memberCount = group.memberSkus.length;

        if (memberCount === 0) return;

        // Parse group date range ONCE outside the loop
        // Compare as plain date strings (YYYY-MM-DD) to avoid
        // creating thousands of Date objects inside the loop
        const groupStart = group.startDate
            ? group.startDate.split('T')[0]
            : null;
        const groupEnd = group.endDate
            ? group.endDate.split('T')[0]
            : null;

        const indicesByDate: Record<string, number[]> = {};

        results.forEach((log, index) => {
            if (log.platform !== targetPlatform) return;
            if (!groupSkus.has(log.sku)) return;

            // Compare date strings directly — no Date objects needed
            const txDate = log.date.split('T')[0];
            if (groupStart && txDate < groupStart) return;
            if (groupEnd && txDate > groupEnd) return;

            if (!indicesByDate[txDate]) {
                indicesByDate[txDate] = [];
            }
            indicesByDate[txDate].push(index);
        });

        // Process each date cluster
        Object.values(indicesByDate).forEach(indices => {
            if (indices.length === 0) return;

            // Group rows by SKU so redistribution happens at SKU level, not per row.
            const indicesBySku = new Map<string, number[]>();
            indices.forEach(idx => {
                const sku = results[idx].sku;
                if (!indicesBySku.has(sku)) indicesBySku.set(sku, []);
                indicesBySku.get(sku)!.push(idx);
            });

            const activeSkuCount = indicesBySku.size;
            if (activeSkuCount === 0) return;

            const totalPooledSpend = indices.reduce((sum, idx) => sum + (results[idx].rawAdsSpend || 0), 0);

            if (totalPooledSpend <= 0) return;

            // Use active SKUs for this date to preserve date-level totals and avoid row-multiplication inflation.
            const skuShare = totalPooledSpend / activeSkuCount;

            indicesBySku.forEach((skuIndices) => {
                const rowValues = skuIndices.map(idx => results[idx].rawAdsSpend || 0);
                const skuCurrentTotal = rowValues.reduce((sum, value) => sum + value, 0);
                const weights = skuCurrentTotal > 0
                    ? rowValues.map(value => value / skuCurrentTotal)
                    : skuIndices.map(() => 1 / skuIndices.length);

                let allocated = 0;
                skuIndices.forEach((idx, position) => {
                    const log = results[idx];
                    if (position === skuIndices.length - 1) {
                        // Apply remainder on final row so per-SKU sum stays exact.
                        log.adsSpend = skuShare - allocated;
                    } else {
                        const nextValue = skuShare * weights[position];
                        log.adsSpend = nextValue;
                        allocated += nextValue;
                    }
                });
            });
        });
    });

    return results;
}
