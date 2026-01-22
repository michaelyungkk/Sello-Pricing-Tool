/**
 * Standardized formatters to prevent "silent zeros" on missing data.
 * Returns "—" if the value is null, undefined, or NaN.
 */

export const formatMoney = (val: number | null | undefined, decimals = 2, currencySymbol = '£'): string => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return `${currencySymbol}${val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
};

export const formatPct = (val: number | null | undefined, decimals = 1): string => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return `${val.toFixed(decimals)}%`;
};

export const formatNumber = (val: number | null | undefined, decimals = 0): string => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  return val.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
