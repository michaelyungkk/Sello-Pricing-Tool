
import { PriceLog, Product, RefundLog, ReturnDateBasis } from '../types';
import { VAT_MULTIPLIER } from '../constants';
import { asDateKey, isDateKeyBetween, addDaysToDateKey, getYesterdayKeyMelbourne, getReturnDateKey as _getReturnDateKey } from './dateUtils';

/**
 * Safely converts a value to a number.
 * @param x - The value to convert.
 * @param defaultValue - The value to return if conversion fails. Defaults to 0.
 * @returns A number.
 */
export const toNumber = (x: any, defaultValue: number = 0): number => {
    if (x === null || x === undefined) return defaultValue;
    const num = Number(x);
    return isNaN(num) ? defaultValue : num;
};

/**
 * Clamps a number between a minimum and maximum value.
 * @param x - The number to clamp.
 * @param min - The minimum value.
 * @param max - The maximum value.
 * @returns The clamped number.
 */
export const clamp = (x: number, min: number, max: number): number => {
    return Math.max(min, Math.min(x, max));
};

/**
 * Safely divides two numbers, returning a fallback value on division by zero.
 * @param numerator - The numerator.
 * @param denominator - The denominator.
 * @param fallback - The value to return if denominator is 0. Defaults to 0.
 * @returns The result of the division or the fallback value.
 */
export const safeDiv = (numerator: number, denominator: number, fallback: number = 0): number => {
    if (denominator === 0) return fallback;
    const result = numerator / denominator;
    return isNaN(result) ? fallback : result;
};


/**
 * Calculates revenue from a transaction log.
 * @param log - The PriceLog object.
 * @returns The calculated revenue.
 */
export const calcRevenue = (log: PriceLog): number => {
    return toNumber(log.price) * toNumber(log.velocity) + toNumber(log.realExtraFreight);
};


/**
 * Extracts the number of units (velocity) from a transaction log.
 * @param log - The PriceLog object.
 * @returns The number of units.
 */
export const calcUnits = (log: PriceLog): number => {
    return toNumber(log.velocity);
};


/**
 * Calculates the ad spend from a transaction log.
 * Ad-only rows (price=0, ad spend > 0) are valid.
 * @param log - The PriceLog object.
 * @returns The ad spend amount.
 */
export const calcAdSpend = (log: PriceLog): number => {
    return toNumber(log.adsSpend);
};

/**
 * Calculates the profit from a transaction log.
 * DEFINITION: This returns Net Profit (After Ads) as per standard system formulas.
 * If the source data is Gross Profit, it should be adjusted before calling this.
 * @param log - The PriceLog object.
 * @returns The calculated net profit.
 */
export const calcProfit = (log: PriceLog): number => {
    if (log.profit !== undefined && log.profit !== null) {
        return toNumber(log.profit);
    }
    const revenue = calcRevenue(log);
    const margin = toNumber(log.margin, 0);
    return revenue * (margin / 100);
};

/**
 * Fact-based net profit helper for transaction rows.
 * For ad-only rows, if source profit is missing/zero, treat net profit as -adSpend.
 */
export const calcNetProfitFact = (log: PriceLog): number => {
    const profit = calcProfit(log);
    const adSpend = calcAdSpend(log);
    const isAdOnly = toNumber(log.price) === 0 && adSpend > 0;
    if (isAdOnly && Math.abs(profit) <= 0.0001) {
        return -adSpend;
    }
    return profit;
};

// --- SUM FUNCTIONS ---

export const sumRevenue = (rows: PriceLog[]): number => {
    return rows.reduce((sum, log) => sum + calcRevenue(log), 0);
};

export const sumQty = (rows: PriceLog[]): number => {
    return rows.reduce((sum, log) => sum + calcUnits(log), 0);
};

export const sumProfit = (rows: PriceLog[]): number => {
    return rows.reduce((sum, log) => sum + calcProfit(log), 0);
};

export const sumAdSpend = (rows: PriceLog[]): number => {
    return rows.reduce((sum, log) => sum + calcAdSpend(log), 0);
};

// --- RATIO FUNCTIONS ---

/**
 * Calculates the margin percentage from revenue and profit. Returns null on invalid division.
 * @param profit - Total profit.
 * @param revenue - Total revenue.
 * @returns The margin percentage or null.
 */
export const marginPct = (profit: number, revenue: number): number | null => {
    if (revenue <= 0) return null;
    const margin = (profit / revenue) * 100;
    return isNaN(margin) ? null : margin;
};

/**
 * Calculates the Total Advertising Cost of Sales (TACoS) percentage. Returns null on invalid division.
 * @param adSpend - Total ad spend.
 * @param revenue - Total revenue.
 * @returns The TACoS percentage or null.
 */
export const tacosPct = (adSpend: number, revenue: number): number | null => {
    if (revenue <= 0) return null;
    const tacos = (adSpend / revenue) * 100;
    return isNaN(tacos) ? null : tacos;
};

/**
 * Calculates the margin percentage from revenue and profit.
 * @param revenue - Total revenue.
 * @param profit - Total profit.
 * @returns The margin percentage.
 */
export const calcMarginPct = (revenue: number, profit: number): number => {
    return safeDiv(profit, revenue) * 100;
};

/**
 * Calculates the Total Advertising Cost of Sales (TACoS) percentage.
 * @param adSpend - Total ad spend.
 * @param revenue - Total revenue.
 * @returns The TACoS percentage. Returns 0 if revenue is 0.
 */
export const calcTACoSPct = (adSpend: number, revenue: number): number => {
    return safeDiv(adSpend, revenue) * 100;
};


// --- COVERAGE HELPERS ---
export const coverageCount = (rows: any[], fieldName: string): { present: number; missing: number; pct: number } => {
    if (rows.length === 0) {
        return { present: 0, missing: 0, pct: 0 };
    }

    let present = 0;
    for (const row of rows) {
        const val = row[fieldName];
        if (val !== undefined && val !== null && !Number.isNaN(val)) {
            present++;
        }
    }

    const total = rows.length;
    const missing = total - present;
    const pct = (present / total) * 100;

    return { present, missing, pct };
}

// --- VELOCITY CALCULATIONS ---

/**
 * Calculates a weighted average daily sales (velocity) based on multiple lookback periods.
 * Formula: (3-day × 10%) + (7-day × 10%) + (15-day × 15%) + (30-day × 25%) + (60-day × 20%) + (90-day × 20%)
 */
export const calculateWeightedVelocity = (skuLogs: PriceLog[]): number => {
    if (!skuLogs || skuLogs.length === 0) return 0;

    const yesterdayKey = getYesterdayKeyMelbourne();

    const calculatePeriodVelocity = (days: number): number => {
        const startKey = addDaysToDateKey(yesterdayKey, -(days - 1));
        const periodLogs = skuLogs.filter(l => {
            const dKey = asDateKey(l.date);
            return dKey && isDateKeyBetween(dKey, startKey, yesterdayKey);
        });
        const totalQty = periodLogs.reduce((sum, l) => sum + toNumber(l.velocity), 0);
        return totalQty / days;
    };

    const v3 = calculatePeriodVelocity(3);
    const v7 = calculatePeriodVelocity(7);
    const v15 = calculatePeriodVelocity(15);
    const v30 = calculatePeriodVelocity(30);
    const v60 = calculatePeriodVelocity(60);
    const v90 = calculatePeriodVelocity(90);

    return (v3 * 0.10) + (v7 * 0.10) + (v15 * 0.15) + (v30 * 0.25) + (v60 * 0.20) + (v90 * 0.20);
};

/**
 * Resolves the final "Average Daily Sales" for a product.
 * PRIORITIZATION RULE: Use ERP Daily Average Sales if it exists and is > 0.
 * Fallback to weighted history otherwise.
 */
export const resolveEffectiveVelocity = (product: Product, skuLogs?: PriceLog[]): number => {
    // 1. Mandatory Primary: ERP Daily Average Sales
    // Check both potential field mappings from the inventory report
    const erpVal = toNumber(product.dailyAverageSales || (product as any).Daily_Average_Sales);

    if (erpVal > 0) {
        return erpVal;
    }

    // 2. Fallback: Weighted Calculation from imported transaction history
    if (skuLogs && skuLogs.length > 0) {
        return calculateWeightedVelocity(skuLogs);
    }

    // 3. Last Resort: Existing value or 0
    return toNumber(product.averageDailySales);
};

export const getReturnDateKey = _getReturnDateKey;

export interface TransactionLedgerPlatformMetrics {
    platform: string;
    revenue: number;
    units: number;
    rawAdSpend: number;
    adjustedAdSpend: number;
    adDelta: number;
    refundImpact: number;
    refundCount: number;
    refundUnits: number;
    profitBeforeRefund: number;
    netProfit: number;
    reconciliation: number;
    margin: number | null;
    revenueSharePct: number;
    salesRows: number;
    adOnlySpend: number;
    adRowsCount: number;
    orders: number;
    skuCount: number;
    costs: Array<{ label: string; value: number }>;
    reconciliationLabel: string;
    maxBarAbs: number;
}

export interface TransactionLedgerResult {
    byPlatform: Record<string, TransactionLedgerPlatformMetrics>;
    platforms: TransactionLedgerPlatformMetrics[];
    totals: TransactionLedgerPlatformMetrics;
}

export interface TransactionLedgerOptions {
    priceLogs?: PriceLog[];
    refundLogs?: RefundLog[];
    startKey?: string | null;
    endKey?: string | null;
    returnDateBasis?: ReturnDateBasis;
    orderDateMap?: Map<string, string>;
    deductRefunds?: boolean;
    platformFilter?: string[] | string | null;
    typeFilter?: 'All' | 'Sale' | 'Ad Cost' | 'Refund';
    postcodeArea?: string | null;
    showRedistributedOnly?: boolean;
}

interface TransactionLedgerBucket {
    platform: string;
    revenue: number;
    units: number;
    rawAdSpend: number;
    adjustedAdSpend: number;
    refundImpact: number;
    refundCount: number;
    refundUnits: number;
    profitBeforeRefund: number;
    salesRows: number;
    adOnlySpend: number;
    adRowsCount: number;
    orderIds: Set<string>;
    nonOrderRows: number;
    skus: Set<string>;
    costs: Record<string, number>;
}

const createTransactionLedgerBucket = (platform: string): TransactionLedgerBucket => ({
    platform,
    revenue: 0,
    units: 0,
    rawAdSpend: 0,
    adjustedAdSpend: 0,
    refundImpact: 0,
    refundCount: 0,
    refundUnits: 0,
    profitBeforeRefund: 0,
    salesRows: 0,
    adOnlySpend: 0,
    adRowsCount: 0,
    orderIds: new Set(),
    nonOrderRows: 0,
    skus: new Set(),
    costs: {
        promoRelief: 0,
        cogs: 0,
        sellingFee: 0,
        adsFee: 0,
        postage: 0,
        otherFee: 0,
        subscription: 0,
        wmsFee: 0
    }
});

const readFiniteNumber = (row: any, keys: string[]): number => {
    for (const key of keys) {
        const value = row?.[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string') {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) return parsed;
        }
    }
    return 0;
};

const hasAnyValue = (row: any, keys: string[]): boolean => {
    return keys.some(key => row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== '');
};

const matchesPlatformFilter = (platform: string, filter: TransactionLedgerOptions['platformFilter']): boolean => {
    if (!filter || filter === 'All') return true;
    const selected = Array.isArray(filter) ? filter : [filter];
    if (selected.length === 0) return true;
    return selected.some(value => platform === value || platform.includes(value));
};

const getPostcodeArea = (row: any): string | null => {
    const postcode = String(row?.postcode || '').trim();
    if (!postcode) return null;
    const match = postcode.match(/^([A-Z]{1,2})/i);
    return match ? match[1].toUpperCase() : null;
};

const isWithinOptionalWindow = (dateKey: string | null, startKey?: string | null, endKey?: string | null): boolean => {
    if (!dateKey) return false;
    if (startKey && dateKey < startKey) return false;
    if (endKey && dateKey > endKey) return false;
    return true;
};

const toLedgerPlatformMetrics = (
    bucket: TransactionLedgerBucket,
    totalRevenue: number,
    deductRefunds: boolean
): TransactionLedgerPlatformMetrics => {
    const costs = [
        { label: 'Promo Relief', value: bucket.costs.promoRelief },
        { label: 'COGS', value: bucket.costs.cogs },
        { label: 'Selling Fee', value: bucket.costs.sellingFee },
        { label: 'Ads Fee', value: bucket.costs.adsFee },
        { label: 'Postage', value: bucket.costs.postage },
        { label: 'Other Fee', value: bucket.costs.otherFee },
        { label: 'Subscription', value: bucket.costs.subscription },
        { label: 'WMS Fee', value: bucket.costs.wmsFee },
        { label: 'Refund Impact', value: deductRefunds ? bucket.refundImpact : 0 }
    ].filter(item => Math.abs(item.value) > 0.0001);

    const nonRefundCostTotal = costs
        .filter(cost => cost.label !== 'Refund Impact')
        .reduce((sum, cost) => sum + cost.value, 0);
    const reconstructedProfitBeforeRefund = bucket.revenue - nonRefundCostTotal;
    const refundImpact = deductRefunds ? bucket.refundImpact : 0;
    const netProfit = bucket.profitBeforeRefund - refundImpact;
    const reconciliation = bucket.profitBeforeRefund - reconstructedProfitBeforeRefund;
    const adDelta = bucket.adjustedAdSpend - bucket.rawAdSpend;
    const valuesForBars = [
        bucket.revenue,
        bucket.profitBeforeRefund,
        netProfit,
        refundImpact,
        reconciliation,
        ...costs.map(cost => cost.value)
    ];

    return {
        platform: bucket.platform,
        revenue: bucket.revenue,
        units: bucket.units,
        rawAdSpend: bucket.rawAdSpend,
        adjustedAdSpend: bucket.adjustedAdSpend,
        adDelta,
        refundImpact,
        refundCount: bucket.refundCount,
        refundUnits: bucket.refundUnits,
        profitBeforeRefund: bucket.profitBeforeRefund,
        netProfit,
        reconciliation,
        margin: marginPct(netProfit, bucket.revenue),
        revenueSharePct: totalRevenue > 0 ? (bucket.revenue / totalRevenue) * 100 : 0,
        salesRows: bucket.salesRows,
        adOnlySpend: bucket.adOnlySpend,
        adRowsCount: bucket.adRowsCount,
        orders: bucket.orderIds.size + bucket.nonOrderRows,
        skuCount: bucket.skus.size,
        costs,
        reconciliationLabel: Math.abs(refundImpact) > 0.0001 ? 'Residual Adjustment' : 'Reconciliation',
        maxBarAbs: Math.max(0, ...valuesForBars.map(value => Math.abs(value)))
    };
};

/**
 * Canonical transaction-derived ledger aggregation.
 * All monetary outputs are GBP tax-inclusive. Raw rows remain unmodified.
 */
export const aggregateTransactionLedger = ({
    priceLogs = [],
    refundLogs = [],
    startKey,
    endKey,
    returnDateBasis = 'refundDate',
    orderDateMap,
    deductRefunds = true,
    platformFilter = null,
    typeFilter = 'All',
    postcodeArea = null,
    showRedistributedOnly = false
}: TransactionLedgerOptions): TransactionLedgerResult => {
    const buckets = new Map<string, TransactionLedgerBucket>();
    const getBucket = (platformValue: string | undefined | null) => {
        const platform = platformValue || 'Unknown';
        if (!buckets.has(platform)) buckets.set(platform, createTransactionLedgerBucket(platform));
        return buckets.get(platform)!;
    };

    for (const log of priceLogs || []) {
        const platform = log.platform || 'Unknown';
        if (!matchesPlatformFilter(platform, platformFilter)) continue;
        const dateKey = asDateKey(log.date);
        if (!isWithinOptionalWindow(dateKey, startKey, endKey)) continue;

        const units = calcUnits(log);
        const adjustedAdRaw = calcAdSpend(log);
        const rawAdRaw = toNumber(log.rawAdsSpend ?? log.adsSpend);
        const isAdOnly = toNumber(log.price) === 0 && adjustedAdRaw > 0;
        const isSale = units > 0 && !isAdOnly;

        if (typeFilter === 'Sale' && !isSale) continue;
        if (typeFilter === 'Ad Cost' && !isAdOnly) continue;
        if (typeFilter === 'Refund') continue;
        if (postcodeArea && postcodeArea !== 'All') {
            if (!isSale || getPostcodeArea(log) !== postcodeArea) continue;
        }
        if (showRedistributedOnly && Math.abs(adjustedAdRaw - rawAdRaw) <= 0.0001) continue;

        const bucket = getBucket(platform);
        const rawAdSpend = rawAdRaw * VAT_MULTIPLIER;
        const adjustedAdSpend = adjustedAdRaw * VAT_MULTIPLIER;
        bucket.rawAdSpend += rawAdSpend;
        bucket.adjustedAdSpend += adjustedAdSpend;
        bucket.profitBeforeRefund += calcNetProfitFact(log) * VAT_MULTIPLIER;
        if (adjustedAdRaw > 0 || rawAdRaw > 0) bucket.adRowsCount += 1;
        if (isAdOnly) bucket.adOnlySpend += adjustedAdSpend;
        if (log.sku) bucket.skus.add(log.sku);
        if (log.orderId) bucket.orderIds.add(log.orderId);
        else bucket.nonOrderRows += 1;

        if (isSale) {
            bucket.salesRows += 1;
            bucket.units += units;
            bucket.revenue += calcRevenue(log) * VAT_MULTIPLIER;
        }

        if (hasAnyValue(log, ['promoRel', 'promo_rel', 'promoRebate'])) {
            bucket.costs.promoRelief += readFiniteNumber(log, ['promoRel', 'promo_rel', 'promoRebate']) * VAT_MULTIPLIER;
        }
        if (hasAnyValue(log, ['cogs', 'costPrice'])) {
            bucket.costs.cogs += readFiniteNumber(log, ['cogs', 'costPrice']) * VAT_MULTIPLIER;
        }
        if (hasAnyValue(log, ['sellingFee', 'selling_fee'])) {
            bucket.costs.sellingFee += readFiniteNumber(log, ['sellingFee', 'selling_fee']) * VAT_MULTIPLIER;
        }
        if (hasAnyValue(log, ['rawAdsSpend', 'adsSpend'])) {
            bucket.costs.adsFee += rawAdSpend;
        }
        if (hasAnyValue(log, ['postage', 'realPostage'])) {
            bucket.costs.postage += readFiniteNumber(log, ['postage', 'realPostage']) * VAT_MULTIPLIER;
        }
        if (hasAnyValue(log, ['otherFee', 'other_fee'])) {
            bucket.costs.otherFee += readFiniteNumber(log, ['otherFee', 'other_fee']) * VAT_MULTIPLIER;
        }
        if (hasAnyValue(log, ['subscription_fee', 'subscriptionFee', 'subscription'])) {
            bucket.costs.subscription += readFiniteNumber(log, ['subscription_fee', 'subscriptionFee', 'subscription']) * VAT_MULTIPLIER;
        }
        if (hasAnyValue(log, ['wmsFee', 'wms_fee'])) {
            bucket.costs.wmsFee += readFiniteNumber(log, ['wmsFee', 'wms_fee']) * VAT_MULTIPLIER;
        }
    }

    for (const refund of refundLogs || []) {
        const platform = refund.platform || 'Unknown';
        if (!matchesPlatformFilter(platform, platformFilter)) continue;
        const dateKey = returnDateBasis === 'orderDate'
            ? (() => {
                if (!orderDateMap || !refund.orderId) return null;
                const lookupKey = refund.resendBaseOrderId || refund.orderId.replace(/-resend$/i, '');
                return asDateKey(orderDateMap.get(lookupKey));
            })()
            : asDateKey(refund.date);
        if (!isWithinOptionalWindow(dateKey, startKey, endKey)) continue;
        if (typeFilter === 'Sale' || typeFilter === 'Ad Cost') continue;
        if (postcodeArea && postcodeArea !== 'All') continue;
        if (showRedistributedOnly) continue;

        const bucket = getBucket(platform);
        bucket.refundImpact += (toNumber(refund.amount) + toNumber(refund.freightAmount)) * VAT_MULTIPLIER;
        bucket.refundCount += 1;
        bucket.refundUnits += toNumber(refund.quantity);
        if (refund.sku) bucket.skus.add(refund.sku);
    }

    const totalRevenue = Array.from(buckets.values()).reduce((sum, bucket) => sum + bucket.revenue, 0);
    const platforms = Array.from(buckets.values())
        .map(bucket => toLedgerPlatformMetrics(bucket, totalRevenue, deductRefunds))
        .sort((a, b) => b.revenue - a.revenue || a.platform.localeCompare(b.platform));

    const totalsBucket = createTransactionLedgerBucket('Total');
    for (const bucket of buckets.values()) {
        totalsBucket.revenue += bucket.revenue;
        totalsBucket.units += bucket.units;
        totalsBucket.rawAdSpend += bucket.rawAdSpend;
        totalsBucket.adjustedAdSpend += bucket.adjustedAdSpend;
        totalsBucket.refundImpact += bucket.refundImpact;
        totalsBucket.refundCount += bucket.refundCount;
        totalsBucket.refundUnits += bucket.refundUnits;
        totalsBucket.profitBeforeRefund += bucket.profitBeforeRefund;
        totalsBucket.salesRows += bucket.salesRows;
        totalsBucket.adOnlySpend += bucket.adOnlySpend;
        totalsBucket.adRowsCount += bucket.adRowsCount;
        bucket.orderIds.forEach(id => totalsBucket.orderIds.add(id));
        totalsBucket.nonOrderRows += bucket.nonOrderRows;
        bucket.skus.forEach(sku => totalsBucket.skus.add(sku));
        Object.keys(totalsBucket.costs).forEach(key => {
            totalsBucket.costs[key] += bucket.costs[key];
        });
    }

    const totals = toLedgerPlatformMetrics(totalsBucket, totalRevenue, deductRefunds);
    totals.revenueSharePct = platforms.length > 0 ? 100 : 0;

    return {
        byPlatform: Object.fromEntries(platforms.map(platform => [platform.platform, platform])),
        platforms,
        totals
    };
};
