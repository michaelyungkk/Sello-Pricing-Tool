/**
 * @file services/dateWindow.ts
 * @description A shared, timezone-safe helper for generating and manipulating date windows.
 * This module re-exports core timezone-aware date utilities from `dateUtils.ts` and
 * adds a new `buildWindow` function for creating consistent, inclusive date ranges for filtering.
 */

import {
  asDateKey,
  isDateKeyBetween,
  addDaysToDateKey,
  getTodayKeyMelbourne,
  getYesterdayKeyMelbourne
} from './dateUtils';

// --- Re-exports from dateUtils.ts ---

/**
 * Gets today's date as a "YYYY-MM-DD" string in the Melbourne timezone.
 * Re-exports `getTodayKeyMelbourne`.
 */
export const getTodayKey = getTodayKeyMelbourne;

/**
 * Gets yesterday's date as a "YYYY-MM-DD" string in the Melbourne timezone.
 * Re-exports `getYesterdayKeyMelbourne`.
 */
export const getYesterdayKey = getYesterdayKeyMelbourne;

/**
 * Adds or subtracts days from a "YYYY-MM-DD" date key.
 * Re-exports `addDaysToDateKey`.
 * @param key - The starting date key in "YYYY-MM-DD" format.
 * @param delta - The number of days to add (can be negative).
 * @returns A new "YYYY-MM-DD" string.
 */
export const addDays = addDaysToDateKey;

/**
 * Checks if a date key is inclusively between a start and end date key.
 * Re-exports `isDateKeyBetween`.
 * @param key - The date key to check.
 * @param startKey - The start date key of the range.
 * @param endKey - The end date key of the range.
 * @returns True if `key` is between `startKey` and `endKey` (inclusive).
 */
export const isBetweenInclusive = isDateKeyBetween;


// --- New `buildWindow` function ---

export interface BuildWindowOptions {
  mode: 'days' | 'custom' | 'all';
  days?: number;
  startKey?: string;
  endKey?: string;
  excludeToday?: boolean;
}

export interface WindowResult {
  startKey: string;
  endKey: string;
  expectedDays: number;
}

/**
 * Builds a consistent, inclusive date window for filtering and analysis.
 *
 * @param options - The configuration for building the window.
 * @param options.mode - The mode of operation:
 *   - 'days': A relative period of `days` ending on today (or yesterday if `excludeToday` is true).
 *   - 'custom': An absolute period defined by `startKey` and `endKey`.
 *   - 'all': A period from a very early date up to today/yesterday.
 * @param options.days - The number of days for 'days' mode. Defaults to 30.
 * @param options.startKey - The start of the range for 'custom' mode.
 * @param options.endKey - The end of the range for 'custom' mode.
 * @param options.excludeToday - If true, the latest possible date is yesterday.
 * @returns An object containing the calculated `startKey`, `endKey`, and `expectedDays`.
 */
export function buildWindow({
  mode,
  days,
  startKey: customStart,
  endKey: customEnd,
  excludeToday = false
}: BuildWindowOptions): WindowResult {
  const today = getTodayKeyMelbourne();
  const yesterday = getYesterdayKeyMelbourne();
  let startKey: string;
  let endKey: string;

  if (mode === 'custom' && customStart && customEnd) {
    startKey = asDateKey(customStart) || today;
    endKey = asDateKey(customEnd) || today;
    if (startKey > endKey) {
      [startKey, endKey] = [endKey, startKey]; // Swap if in wrong order
    }
  } else if (mode === 'all') {
    startKey = '1970-01-01'; // A long time ago, effectively "all time"
    endKey = excludeToday ? yesterday : today;
  } else { // mode === 'days'
    const numDays = days || 30;
    endKey = excludeToday ? yesterday : today;
    startKey = addDaysToDateKey(endKey, -(numDays - 1));
  }

  // Calculate expectedDays inclusively
  const startDate = new Date(startKey);
  const endDate = new Date(endKey);

  // Safety check for invalid date strings or ranges
  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime()) || endDate < startDate) {
      return { startKey, endKey, expectedDays: 0 };
  }

  // Calculate the difference in time, add 1 for inclusivity
  const diffTime = endDate.getTime() - startDate.getTime();
  const expectedDays = Math.round(diffTime / (1000 * 60 * 60 * 24)) + 1;

  return { startKey, endKey, expectedDays };
}
