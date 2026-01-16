export const APP_TIMEZONE = 'Australia/Melbourne' as const;

/**
 * Formats a Date object into a stable "YYYY-MM-DD" string in the Melbourne timezone.
 * Uses 'en-CA' locale which reliably produces the YYYY-MM-DD format.
 * @param date The Date object to format.
 * @returns A "YYYY-MM-DD" string.
 */
export function formatDateKeyMelbourne(date: Date): string {
  // Using en-CA locale is a reliable way to get YYYY-MM-DD format.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Coerces various date-like inputs into a standardized "YYYY-MM-DD" string key.
 * @param input A Date, a string, or null/undefined.
 * @returns A "YYYY-MM-DD" string or null if the input is invalid.
 */
export function asDateKey(input: Date | string | null | undefined): string | null {
  if (!input) {
    return null;
  }
  if (input instanceof Date) {
    return formatDateKeyMelbourne(input);
  }
  if (typeof input === 'string') {
    // Check if it's already in the correct format
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      return input;
    }
    // Attempt to parse other string formats
    const d = new Date(input);
    if (!isNaN(d.getTime())) {
      return formatDateKeyMelbourne(d);
    }
  }
  return null;
}

/**
 * Compares two "YYYY-MM-DD" date keys lexicographically.
 * @param a The first date key.
 * @param b The second date key.
 * @returns -1 if a < b, 0 if a === b, 1 if a > b.
 */
export function compareDateKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

/**
 * Checks if a date key is inclusively between a start and end date key.
 * @param d The date key to check.
 * @param start The start date key of the range.
 * @param end The end date key of the range.
 * @returns True if d is between start and end (inclusive).
 */
export function isDateKeyBetween(d: string, start: string, end: string): boolean {
  return d >= start && d <= end;
}

/**
 * Adds or subtracts days from a "YYYY-MM-DD" date key, maintaining timezone correctness.
 * It treats the input date key as a UTC date to perform safe arithmetic, then formats
 * the result back into the Melbourne timezone.
 * @param dateKey The starting date key in "YYYY-MM-DD" format.
 * @param days The number of days to add (can be negative).
 * @returns A new "YYYY-MM-DD" string.
 */
export function addDaysToDateKey(dateKey: string, days: number): string {
  // By passing 'YYYY-MM-DD', new Date() correctly interprets it as midnight UTC.
  const d = new Date(dateKey);
  // Use UTC methods to avoid local timezone interference during calculation.
  d.setUTCDate(d.getUTCDate() + days);
  // Format the resulting date back into the target Melbourne timezone.
  return formatDateKeyMelbourne(d);
}

/**
 * Gets the current date as a "YYYY-MM-DD" string in the Melbourne timezone.
 * @param now Optional reference date. Defaults to the current time.
 * @returns Today's date key.
 */
export function getTodayKeyMelbourne(now: Date = new Date()): string {
  return formatDateKeyMelbourne(now);
}

/**
 * Gets yesterday's date as a "YYYY-MM-DD" string in the Melbourne timezone.
 * @param now Optional reference date. Defaults to the current time.
 * @returns Yesterday's date key.
 */
export function getYesterdayKeyMelbourne(now: Date = new Date()): string {
  const todayKey = getTodayKeyMelbourne(now);
  return addDaysToDateKey(todayKey, -1);
}
