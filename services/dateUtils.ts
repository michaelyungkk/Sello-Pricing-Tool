
import { RefundLog, ReturnDateBasis } from '../types';

export const APP_TIMEZONE = 'Australia/Melbourne' as const;

/**
 * Formats a Date object into a stable "YYYY-MM-DD" string in the Melbourne timezone.
 */
export function formatDateKeyMelbourne(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

/**
 * Converts an Excel date serial number to a JS Date.
 * Excel epoch is December 30, 1899. Serial 1 = Jan 1 1900.
 * Excel also has a leap year bug (falsely treats 1900 as leap),
 * so serials > 59 need to subtract 1.
 */
function excelSerialToDate(serial: number): Date {
  const excelEpoch = new Date(Date.UTC(1899, 11, 30)); // Dec 30, 1899 UTC
  const days = serial > 59 ? serial - 1 : serial;     // correct for Excel leap year bug
  const ms = days * 24 * 60 * 60 * 1000;
  return new Date(excelEpoch.getTime() + ms);
}

/**
 * Returns true if a number looks like a plausible Excel date serial.
 * Valid range: 1 (Jan 1 1900) to ~55000 (year ~2050).
 * Numbers like 45123 = a real date; numbers like 45 (milliseconds) would be 1970.
 */
function looksLikeExcelSerial(n: number): boolean {
  return Number.isInteger(n) && n > 1 && n < 60000;
}

/**
 * Coerces various date-like inputs into a standardized "YYYY-MM-DD" string key.
 */
export function asDateKey(input: Date | string | null | undefined): string | null {
  if (!input) return null;

  if (input instanceof Date) {
    return formatDateKeyMelbourne(input);
  }
  if (typeof input === 'string') {
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;
    const d = new Date(input);
    if (!isNaN(d.getTime())) return formatDateKeyMelbourne(d);
  }
  return null;
}

/**
 * Use for parsing uploaded spreadsheets.
 *
 * Handles three cases that come out of xlsx.read():
 *   1. JS Date object  — xlsx parsed the cell correctly (cellDates: true, proper format)
 *   2. Excel serial number (integer ~1–60000) — cell was unformatted or generic in ERP export;
 *      this is the 1970-01-01 bug: new Date(45123) = 45 seconds after epoch, not a real date.
 *   3. String — ISO string, DD/MM/YYYY, or other text formats.
 */
export function asDateKeyNaive(input: unknown): string | null {
  if (input === null || input === undefined || input === '') return null;

  // Case 1: Already a proper JS Date from xlsx cellDates parsing
  if (input instanceof Date) {
    if (isNaN(input.getTime())) return null;
    const y = input.getFullYear();
    const m = String(input.getMonth() + 1).padStart(2, '0');
    const d = String(input.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // Case 2: Raw Excel serial number — the 1970-01-01 bug
  // xlsx passes this through as a plain number when cell format is unrecognised
  if (typeof input === 'number') {
    if (looksLikeExcelSerial(input)) {
      const date = excelSerialToDate(input);
      if (!isNaN(date.getTime())) {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
      }
    }
    // Not a valid serial — give up
    return null;
  }

  // Case 3: String — try common formats
  if (typeof input === 'string') {
    const s = input.trim();
    if (!s) return null;

    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

    // DD/MM/YYYY (common ERP format)
    const dmyMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (dmyMatch) {
      const [, d, mo, y] = dmyMatch;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }

    // ISO string or other parseable formats
    const parsed = new Date(s);
    if (!isNaN(parsed.getTime())) {
      const y = parsed.getFullYear();
      const mo = String(parsed.getMonth() + 1).padStart(2, '0');
      const d = String(parsed.getDate()).padStart(2, '0');
      return `${y}-${mo}-${d}`;
    }
  }

  return null;
}

/**
 * Resolves the date key for a return record.
 */
export function getReturnDateKey(
  row: RefundLog,
  basis: ReturnDateBasis = 'refundDate',
  orderDateMap?: Map<string, string>
): string | null {
  if (basis === 'orderDate' && orderDateMap && row.orderId) {
    const lookupKey = row.resendBaseOrderId || row.orderId.replace(/-resend$/i, '');
    const matchedDate = orderDateMap.get(lookupKey);
    if (matchedDate) return asDateKey(matchedDate);
  }
  return asDateKey(row.date);
}

export function compareDateKeys(a: string, b: string): number {
  return a.localeCompare(b);
}

export function isDateKeyBetween(d: string, start: string, end: string): boolean {
  return d >= start && d <= end;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const d = new Date(dateKey);
  d.setUTCDate(d.getUTCDate() + days);
  return formatDateKeyMelbourne(d);
}

export function getTodayKeyMelbourne(now: Date = new Date()): string {
  return formatDateKeyMelbourne(now);
}

export function getYesterdayKeyMelbourne(now: Date = new Date()): string {
  const todayKey = getTodayKeyMelbourne(now);
  return addDaysToDateKey(todayKey, -1);
}
