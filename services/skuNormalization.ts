
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

/**
 * Builds a canonical SKU resolver that merges hardcoded CANONICAL_MAP rules
 * with runtime learnedAliases from CSV import. The returned function resolves
 * any raw SKU to its canonical form.
 *
 * Both maps are normalised to UPPERCASE keys before merging so lookups are
 * case-insensitive at the call site.
 *
 * @param learnedAliases  Runtime alias map from useAppState (raw → canonical)
 * @returns               (sku: string) => string resolver function
 */
export function buildCanonicalResolver(
    learnedAliases: Record<string, string>
): (sku: string) => string {
    // Merge hardcoded rules with runtime aliases (runtime aliases take precedence
    // only for keys not already in CANONICAL_MAP; spread order puts learned after
    // so they can supplement but not silently override deliberate hardcoded merges)
    const merged: Record<string, string> = {
        ...CANONICAL_MAP,
        ...Object.fromEntries(
            Object.entries(learnedAliases).map(([k, v]) => [k.toUpperCase(), v.toUpperCase()])
        ),
    };

    return (sku: string): string => {
        if (!sku) return sku;
        const upper = sku.trim().toUpperCase();
        return merged[upper] || sku;
    };
}
