/**
 * Standardized formatters to prevent "silent zeros" on missing data.
 * Returns "—" if the value is null, undefined, or NaN.
 */

/**
 * Smart money formatter: shows 2dp only when there are meaningful cents,
 * otherwise shows 0dp. e.g. £12,345 or £12,345.67 (never £12,345.00)
 * Handles negative values correctly: -£12.50
 */
export const formatSmartMoney = (val: number | null | undefined, currencySymbol = '£'): string => {
  if (val === null || val === undefined || isNaN(val)) return '—';
  const abs = Math.abs(val);
  const decimals = Math.round((abs - Math.floor(abs)) * 100) === 0 ? 0 : 2;
  const formatted = abs.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return `${val < 0 ? '-' : ''}${currencySymbol}${formatted}`;
};

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

/** Returns YYYY-MM-DD using the user's local machine timezone (not UTC/ISO) */
export const localDateStamp = (): string => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};
