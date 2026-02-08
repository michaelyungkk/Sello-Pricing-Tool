
import { normalizeRestoredState } from './restoreSanitizer';
import { getCanonicalSku, isMergeVariant } from './skuNormalization';

/**
 * Centralized migration pipeline for restored database objects.
 * Handles schema versioning and legacy field mapping for Promotions.
 */
export const migrateRestoredDatabase = (data: any): any => {
    if (!data) return data;

    // --- STEP 1: NORMALIZATION ---
    data = normalizeRestoredState(data);

    // --- STEP 2: SKU MERGING (Specific Rule for VM1014 variants) ---
    data = mergeSpecificSkusMigration(data);

    // --- STEP 3: MIGRATION: Promotions Schema ---
    if (data.promotions && Array.isArray(data.promotions)) {
        data.promotions = data.promotions.map((p: any) => {
            const items = p.items?.map((item: any) => {
                const legacyPrice = Number(item.promoPrice || item.discountPrice || 0);
                const isLegacy = !item.discountType || 
                               (item.discountType === 'FIXED' && (item.discountValue === 0 || item.discountValue === undefined));

                if (isLegacy && legacyPrice > 0) {
                    return {
                        ...item,
                        discountType: 'FIXED_PRICE',
                        discountValue: legacyPrice,
                        promoPrice: legacyPrice,
                        basePrice: item.basePrice || 0
                    };
                }
                
                if (legacyPrice > 0 && (item.promoPrice === 0 || item.promoPrice === undefined)) {
                    return { ...item, promoPrice: legacyPrice };
                }

                return item;
            }) || [];

            return {
                ...p,
                schemaVersion: p.schemaVersion || 2,
                promotionScope: p.promotionScope || 'SKU',
                baselineMode: p.baselineMode || 'CA_PRICE',
                items
            };
        });
    }

    return data;
};

/**
 * Internal helper to merge specific variant SKUs into their canonical form in a restored database.
 */
function mergeSpecificSkusMigration(data: any): any {
    const products = Array.isArray(data.products) ? [...data.products] : [];
    
    // 1. Identify and consolidate product entries
    const mergedProductsMap = new Map<string, any>();
    const variantsToRemove = new Set<string>();

    products.forEach(p => {
        const canonical = getCanonicalSku(p.sku);
        if (canonical !== p.sku) {
            variantsToRemove.add(p.sku);
        }

        if (!mergedProductsMap.has(canonical)) {
            mergedProductsMap.set(canonical, { ...p, sku: canonical });
        } else {
            // MERGE LOGIC
            const existing = mergedProductsMap.get(canonical);
            
            // Sum stock and incoming
            existing.stockLevel = (Number(existing.stockLevel) || 0) + (Number(p.stockLevel) || 0);
            existing.incomingStock = (Number(existing.incomingStock) || 0) + (Number(p.incomingStock) || 0);
            
            // Combine shipments
            if (p.shipments) {
                existing.shipments = [...(existing.shipments || []), ...p.shipments];
            }

            // Combine channels (aliases)
            if (p.channels) {
                const existingChannels = existing.channels || [];
                p.channels.forEach((newChan: any) => {
                    const match = existingChannels.find((ec: any) => ec.platform === newChan.platform);
                    if (match) {
                        const aliases = new Set([
                            ...(match.skuAlias || '').split(',').map((s: string) => s.trim()),
                            ...(newChan.skuAlias || '').split(',').map((s: string) => s.trim()),
                            p.sku // Add the variant SKU itself as an alias
                        ].filter(Boolean));
                        match.skuAlias = Array.from(aliases).join(', ');
                    } else {
                        existingChannels.push({ ...newChan });
                    }
                });
                existing.channels = existingChannels;
            }
        }
    });

    data.products = Array.from(mergedProductsMap.values());

    // 2. Normalize all history references
    const normalizeList = (list: any[]) => {
        if (!Array.isArray(list)) return list;
        return list.map(item => {
            if (item && item.sku) {
                return { ...item, sku: getCanonicalSku(item.sku) };
            }
            return item;
        });
    };

    data.priceHistory = normalizeList(data.priceHistory);
    data.refundHistory = normalizeList(data.refundHistory);
    data.priceChangeHistory = normalizeList(data.priceChangeHistory);
    data.costChangeHistory = normalizeList(data.costChangeHistory);
    data.inventoryChangeHistory = normalizeList(data.inventoryChangeHistory);

    if (data.promotions) {
        data.promotions = data.promotions.map((promo: any) => ({
            ...promo,
            items: Array.isArray(promo.items) ? promo.items.map((it: any) => ({
                ...it,
                sku: getCanonicalSku(it.sku)
            })) : []
        }));
    }

    return data;
}

export const auditRestoredDatabase = (data: any): { hasFatal: boolean; issues: any[] } => {
    const issues: Array<{ path: string; expected: string; actual: string; sample?: any }> = [];

    const checkArray = (path: string, val: any) => {
        if (!Array.isArray(val)) {
            issues.push({ path, expected: 'Array', actual: typeof val, sample: val });
        }
    };

    if (!data || typeof data !== 'object') {
        return { hasFatal: true, issues: [{ path: 'root', expected: 'Object', actual: typeof data }] };
    }

    checkArray('products', data.products);
    if (Array.isArray(data.products)) {
        data.products.slice(0, 30).forEach((p: any, i: number) => {
            if (!p) return;
            checkArray(`products[${i}].channels`, p.channels);
            if (p.shipments !== undefined && p.shipments !== null) {
                checkArray(`products[${i}].shipments`, p.shipments);
            }
        });
    }

    checkArray('promotions', data.promotions);
    if (Array.isArray(data.promotions)) {
        data.promotions.slice(0, 30).forEach((p: any, i: number) => {
            if (!p) return;
            checkArray(`promotions[${i}].items`, p.items);
            if (Array.isArray(p.items)) {
                p.items.forEach((item: any, j: number) => {
                    if (item && !item.sku) {
                        issues.push({ path: `promotions[${i}].items[${j}].sku`, expected: 'String', actual: typeof item?.sku });
                    }
                });
            }
        });
    }

    checkArray('priceHistory', data.priceHistory);
    checkArray('refundHistory', data.refundHistory);
    checkArray('shipmentHistory', data.shipmentHistory);
    checkArray('priceChangeHistory', data.priceChangeHistory);
    checkArray('costChangeHistory', data.costChangeHistory);
    checkArray('inventoryChangeHistory', data.inventoryChangeHistory);
    
    return { hasFatal: issues.length > 0, issues };
};
