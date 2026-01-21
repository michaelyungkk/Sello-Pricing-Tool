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