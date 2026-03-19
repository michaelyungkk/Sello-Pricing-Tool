
import { PriceLog, Product, RefundLog, ReturnDateBasis } from '../types';
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
