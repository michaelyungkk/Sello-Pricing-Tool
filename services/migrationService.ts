
import { normalizeRestoredState } from './restoreSanitizer';

/**
 * Centralized migration pipeline for restored database objects.
 * Handles schema versioning and legacy field mapping for Promotions.
 */
export const migrateRestoredDatabase = (data: any): any => {
    if (!data) return data;

    // --- STEP 1: NORMALIZATION ---
    // Ensure all mandatory arrays and numeric fields exist to prevent crashes in the migration logic below.
    data = normalizeRestoredState(data);

    // --- STEP 2: MIGRATION: Promotions Schema ---
    if (data.promotions && Array.isArray(data.promotions)) {
        data.promotions = data.promotions.map((p: any) => {
            const items = p.items?.map((item: any) => {
                // Capture the legacy ground truth price
                const legacyPrice = Number(item.promoPrice || item.discountPrice || 0);
                
                // Identify if this is a legacy record:
                // 1. Missing discountType entirely
                // 2. Uses old 'FIXED' type but has no value (relying on legacy promoPrice)
                const isLegacy = !item.discountType || 
                               (item.discountType === 'FIXED' && (item.discountValue === 0 || item.discountValue === undefined));

                if (isLegacy && legacyPrice > 0) {
                    // Map to the new schema:
                    // Use 'FIXED_PRICE' so the effective price is explicitly the legacy value.
                    return {
                        ...item,
                        discountType: 'FIXED_PRICE',
                        discountValue: legacyPrice,
                        promoPrice: legacyPrice,
                        basePrice: item.basePrice || 0
                    };
                }
                
                // Defensive check: If effective price is 0 but legacy was > 0, 
                // restore the legacy value to prevent silent data loss.
                if (legacyPrice > 0 && (item.promoPrice === 0 || item.promoPrice === undefined)) {
                    return {
                        ...item,
                        promoPrice: legacyPrice
                    };
                }

                return item;
            }) || [];

            // Upgrade event metadata
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
