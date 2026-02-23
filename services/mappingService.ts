
import { AttributeMap } from '../types';

/**
 * Normalizes a raw value using the provided mapping.
 * Case-insensitive lookup.
 */
export const resolveAttribute = (raw: string | undefined, map: AttributeMap): string => {
    if (!raw) return 'Unassigned';
    const key = raw.trim().toLowerCase();
    if (map[key]) {
        return map[key];
    }
    // Default normalization: specific casing logic could go here, but for now return trimmed raw
    return raw.trim();
};

/**
 * Batch resolve function for processing entire datasets
 */
export const resolveProductAttributes = (
    product: { brand?: string; category?: string },
    brandMap: AttributeMap,
    categoryMap: AttributeMap
) => {
    return {
        brand: resolveAttribute(product.brand, brandMap),
        category: resolveAttribute(product.category, categoryMap)
    };
};

/**
 * Helpers to manage the map structure
 */
export const addMapping = (map: AttributeMap, raw: string, target: string): AttributeMap => {
    const key = raw.trim().toLowerCase();
    return { ...map, [key]: target.trim() };
};

export const removeMapping = (map: AttributeMap, raw: string): AttributeMap => {
    const key = raw.trim().toLowerCase();
    const newMap = { ...map };
    delete newMap[key];
    return newMap;
};

export const getUniqueRawValues = (products: any[], field: 'brand' | 'category'): string[] => {
    const set = new Set<string>();
    products.forEach(p => {
        const val = p[field];
        if (val) set.add(val);
    });
    return Array.from(set).sort();
};
