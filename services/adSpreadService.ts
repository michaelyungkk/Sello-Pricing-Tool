
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

    // Create a new array to maintain purity
    const results = salesHistory.map(log => ({ ...log }));

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

            let totalPooledSpend = 0;
            indices.forEach(idx => {
                totalPooledSpend += results[idx].adsSpend || 0;
            });

            if (totalPooledSpend <= 0) return;

            const equalShare = totalPooledSpend / memberCount;

            indices.forEach(idx => {
                const log = results[idx];
                if (log.rawAdsSpend === undefined || log.rawAdsSpend === null) {
                    log.rawAdsSpend = log.adsSpend || 0;
                }
                log.adsSpend = equalShare;
            });
        });
    });

    return results;
}
