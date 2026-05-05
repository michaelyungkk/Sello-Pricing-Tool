
import { DEFAULT_PRICING_RULES, DEFAULT_LOGISTICS_RULES, DEFAULT_STRATEGY_RULES, DEFAULT_SEARCH_CONFIG } from '../constants';
import { DEFAULT_THRESHOLDS } from './thresholdsConfig';

/**
 * services/restoreSanitizer.ts
 * Normalizes restored JSON data to ensure structural integrity and prevent runtime crashes.
 */

const toArray = (x: any): any[] => (Array.isArray(x) ? x : []);

const toObject = (x: any, fallback: any = {}): any =>
  (x && typeof x === 'object' && !Array.isArray(x) ? x : fallback);

const toNumber = (x: any, fallback: number = 0): number => {
  if (x === null || x === undefined) return fallback;
  const n = parseFloat(x);
  return isNaN(n) ? fallback : n;
};

const toString = (x: any, fallback: string = ''): string =>
  (typeof x === 'string' ? x : fallback);

const MOJIBAKE_REPLACEMENTS: Record<string, string> = {
  '\u00C2\u00A3': '\u00A3',
  '\u00E2\u201A\u00AC': '\u20AC',
  '\u00E2\u20AC\u0153': '"',
  '\u00E2\u20AC\u009D': '"',
  '\u00E2\u20AC\u02DC': '\'',
  '\u00E2\u20AC\u2122': '\'',
  '\u00E2\u20AC\u201C': '-',
  '\u00E2\u20AC\u201D': '-',
  '\u00E2\u20AC\u00A6': '...',
};

const hasSuspiciousEncodingMarkers = (value: string): boolean => {
  if (!value) return false;
  return (
    value.includes('\u00C2') ||
    value.includes('\u00C3') ||
    value.includes('\u00E2') ||
    value.includes('\uFFFD')
  );
};

const encodingNoiseScore = (value: string): number => {
  if (!value) return 0;
  let score = 0;
  const markers = ['\u00C2', '\u00C3', '\u00E2', '\uFFFD'];
  markers.forEach(marker => {
    let idx = value.indexOf(marker);
    while (idx !== -1) {
      score += 1;
      idx = value.indexOf(marker, idx + marker.length);
    }
  });
  return score;
};

const tryDecodeLatin1AsUtf8 = (value: string): string => {
  const bytes = new Uint8Array(Array.from(value).map(ch => ch.charCodeAt(0) & 0xFF));
  return new TextDecoder('utf-8').decode(bytes);
};

/**
 * Repairs common mojibake patterns while preserving valid UTF-8 text.
 * Used at restore-time and upload-time before saving to state.
 */
export const repairMojibakeText = (input: string): string => {
  if (typeof input !== 'string' || input.length === 0) return input;

  let repaired = input;

  // Direct common replacements first.
  Object.entries(MOJIBAKE_REPLACEMENTS).forEach(([bad, good]) => {
    if (repaired.includes(bad)) {
      repaired = repaired.split(bad).join(good);
    }
  });

  // Attempt latin1->utf8 re-decode only when suspicious markers remain.
  if (hasSuspiciousEncodingMarkers(repaired)) {
    try {
      const decoded = tryDecodeLatin1AsUtf8(repaired);
      if (decoded && encodingNoiseScore(decoded) < encodingNoiseScore(repaired)) {
        repaired = decoded;
      }
    } catch {
      // Keep best-effort replacements above.
    }
  }

  return repaired;
};

/**
 * Sanitizes a single product object.
 */
const sanitizeProduct = (p: any): any => {
  if (!p || typeof p !== 'object') return null;
  return {
    ...p,
    id: p.id || `p-${Math.random().toString(36).substr(2, 9)}`,
    sku: toString(p.sku),
    name: toString(p.name || p.sku),
    channels: toArray(p.channels),
    shipments: toArray(p.shipments),
    incomingStock: toNumber(p.incomingStock),
    stockLevel: toNumber(p.stockLevel),
    costPrice: toNumber(p.costPrice),
    averageDailySales: toNumber(p.averageDailySales),
    dailyAverageSales: toNumber(p.dailyAverageSales),
    daysRemaining: toNumber(p.daysRemaining, 999),
    category: toString(p.category, "Uncategorized"),
    // Keep raw values raw here, normalization happens in recalculateProductMetrics or accessors
    brand: toString(p.brand),
  };
};

/**
 * Sanitizes a single price history log entry.
 */
const sanitizePriceLog = (l: any): any => {
  if (!l || typeof l !== 'object') return null;
  return {
    ...l,
    id: l.id || `l-${Math.random().toString(36).substr(2, 9)}`,
    sku: String(l.sku || ''),
    date: String(l.date || ''),
    price: toNumber(l.price),
    velocity: toNumber(l.velocity),
    platform: l.platform || 'Unknown',
    margin: toNumber(l.margin),
    profit: l.profit !== undefined ? toNumber(l.profit) : undefined,
    adsSpend: l.adsSpend !== undefined ? toNumber(l.adsSpend) : undefined,
  };
};

/**
 * Normalizes a restored database object by ensuring all mandatory slices exist 
 * and critical fields are correctly typed. This makes the restore flow idempotent.
 */
export const normalizeRestoredState = (db: any): any => {
  const d = db || {};

  return {
    // Standardize all data lists
    products: toArray(d.products).map(sanitizeProduct).filter(Boolean),
    priceHistory: toArray(d.priceHistory || d.salesHistory).map(sanitizePriceLog).filter(Boolean),
    refundHistory: toArray(d.refundHistory),
    shipmentHistory: toArray(d.shipmentHistory),
    priceChangeHistory: toArray(d.priceChangeHistory),
    costChangeHistory: toArray(d.costChangeHistory),
    inventoryChangeHistory: toArray(d.inventoryChangeHistory),

    // Standarize Promotions
    promotions: toArray(d.promotions).map((promo: any) => {
      if (!promo || typeof promo !== 'object') return null;
      return {
        ...promo,
        items: toArray(promo.items).map((item: any) => {
          if (!item || typeof item !== 'object') return null;
          return {
            ...item,
            basePrice: toNumber(item.basePrice),
            discountValue: toNumber(item.discountValue),
            promoPrice: toNumber(item.promoPrice),
            discountType: toString(item.discountType, 'FIXED_PRICE')
          };
        }).filter(Boolean)
      };
    }).filter(Boolean),

    // Standardize metadata and config
    learnedAliases: toObject(d.learnedAliases),
    inventoryTemplates: toArray(d.inventoryTemplates),
    customReportPresets: toArray(d.customReportPresets),
    pricingRules: toObject(d.pricingRules, DEFAULT_PRICING_RULES),
    logisticsRules: toArray(d.logisticsRules).length > 0 ? d.logisticsRules : DEFAULT_LOGISTICS_RULES,
    strategyRules: toObject(d.strategyRules, DEFAULT_STRATEGY_RULES),
    searchConfig: toObject(d.searchConfig, DEFAULT_SEARCH_CONFIG),
    thresholds: toObject(d.thresholds, DEFAULT_THRESHOLDS),
    brandMap: toObject(d.brandMap),
    categoryMap: toObject(d.categoryMap),

    // Optimal pricing — pass through as-is (Maps were serialised to plain objects by getSharedSnapshot)
    cohortSnapshot: d.cohortSnapshot ?? null,
    optimalPriceResults: d.optimalPriceResults ?? null,
    benchmarkUpdateNotices: toArray(d.benchmarkUpdateNotices),

    // Standardize user context
    userProfile: toObject(d.userProfile),
    velocityLookback: toString(d.velocityLookback, '30'),
    uploadTimestamps: toObject(d.uploadTimestamps),
    skuFamilies: toArray(d.skuFamilies),
    adGroups: toArray(d.adGroups),
    priceCheckTemplates: toArray(d.priceCheckTemplates),
    freightRates: toArray(d.freightRates),
  };
};
