
/**
 * Centralized SKU normalization rules.
 * Handles specific business logic for merging variant SKUs into canonical master SKUs.
 */

export const CANONICAL_MAP: Record<string, string> = {
    'VM1014-WH-A-UK': 'VM1014-WH-UK',
    'VM1014-WH-B-UK': 'VM1014-WH-UK'
};

/**
 * Returns the canonical (master) SKU for a given input SKU.
 * @param sku The raw SKU string to normalize.
 */
export const getCanonicalSku = (sku: string): string => {
    if (!sku) return sku;
    const upper = sku.trim().toUpperCase();
    return CANONICAL_MAP[upper] || sku;
};

/**
 * Returns true if the SKU is one of the variants that should be merged.
 */
export const isMergeVariant = (sku: string): boolean => {
    if (!sku) return false;
    const upper = sku.trim().toUpperCase();
    return !!CANONICAL_MAP[upper];
};
