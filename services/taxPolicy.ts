import { VAT_MULTIPLIER } from '../constants';

export const TAX_NOTE_SHORT = "All monetary values include tax unless stated otherwise.";

export type TaxBasis = 'inc' | 'ex';

/**
 * Generates a consistent label for monetary values indicating tax basis.
 * @param taxBasis - Whether the value is tax-inclusive ('inc') or tax-exclusive ('ex'). Defaults to 'inc'.
 * @returns A formatted string label, e.g., "£ (inc tax)".
 */
export function moneyLabel(taxBasis: TaxBasis = 'inc'): string {
  if (taxBasis === 'ex') {
    return "£ (ex tax)";
  }
  return "£ (inc tax)";
}

/**
 * Development utility to guard against double-application of VAT scaling.
 * Use this before applying scaleMoneyInclTax if the source is ambiguous.
 * @param context - Debug context string
 * @param value - The value being scaled
 */
export function assertNotAlreadyScaled(context: string, value: number): void {
  // In development, this serves as a placeholder hook for debugging double-taxation bugs.
  // We do not throw in production to avoid crashing the app, but this documents intent.
  if (process.env.NODE_ENV === 'development') {
    // Future expansion: Add heuristic checks here if needed
  }
}

/**
 * Apply VAT scaling to a raw monetary value.
 * Apply VAT at aggregation/output only. Do not scale raw logs.
 */
export function scaleMoneyInclTax(amount: number | null | undefined): number {
  if (amount === null || amount === undefined || isNaN(amount)) return 0;
  return amount * VAT_MULTIPLIER;
}

/**
 * Conditionally apply VAT scaling.
 */
export function scaleMoneyInclTaxIf(amount: number | null | undefined, apply: boolean): number {
  if (amount === null || amount === undefined || isNaN(amount)) return 0;
  return apply ? amount * VAT_MULTIPLIER : amount;
}

/**
 * Sums an array of potentially null/undefined numbers safely.
 */
export function safeSumMoney(values: (number | null | undefined)[]): number {
  return values.reduce((sum, val) => {
    const num = Number(val);
    return (sum || 0) + (isNaN(num) ? 0 : num);
  }, 0) || 0;
}