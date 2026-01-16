
import { PriceLog } from '../types';

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
  return toNumber(log.price) * toNumber(log.velocity);
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
 * Prioritizes the explicit `profit` field if available, otherwise calculates from margin.
 * @param log - The PriceLog object.
 * @returns The calculated profit.
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
