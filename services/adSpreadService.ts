
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

        // Skip groups with no members to avoid division by zero
        if (memberCount === 0) return;

        // Group indices of matching logs by date string
        const indicesByDate: Record<string, number[]> = {};

        results.forEach((log, index) => {
            // Check if log belongs to this group's platform and SKUs
            if (log.platform === targetPlatform && groupSkus.has(log.sku)) {
                // Check if log date falls within the ad group's date range
                const txDate = new Date(log.date.split('T')[0]);
                const startDate = group.startDate ? new Date(group.startDate) : null;
                const endDate = group.endDate ? new Date(group.endDate) : null;

                if (startDate && txDate < startDate) return; // Skip redistribution
                if (endDate && txDate > endDate) return; // Skip redistribution

                const dateKey = log.date;
                if (!indicesByDate[dateKey]) {
                    indicesByDate[dateKey] = [];
                }
                indicesByDate[dateKey].push(index);
            }
        });

        // Process each date cluster for this ad group
        Object.entries(indicesByDate).forEach(([date, indices]) => {
            if (indices.length === 0) return;

            // Pool the total ad spend across all matched entries for that day
            let totalPooledSpend = 0;
            indices.forEach(idx => {
                totalPooledSpend += results[idx].adsSpend || 0;
            });

            // Skip if no spend to redistribute
            if (totalPooledSpend <= 0) return;

            // Apply equal split redistribution
            // Share is based on total member count, not just those with transactions
            const equalShare = totalPooledSpend / memberCount;

            indices.forEach(idx => {
                const log = results[idx];

                // Preserve the true original spend for audit purposes
                if (log.rawAdsSpend === undefined || log.rawAdsSpend === null) {
                    log.rawAdsSpend = log.adsSpend || 0;
                }

                log.adsSpend = equalShare;
            });
        });
    });

    return results;
}
