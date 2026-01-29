
export type SortDir = 'asc' | 'desc';

export type SortState<K extends string> = {
  key: K;
  dir: SortDir;
} | null;

/**
 * Toggles sort state for a given key.
 * Cycle: null -> desc -> asc -> null
 * Default to descending for new keys (optimized for metrics/dates).
 */
export function toggleSort<K extends string>(
  prev: SortState<K>,
  nextKey: K
): SortState<K> {
  if (!prev || prev.key !== nextKey) {
    return { key: nextKey, dir: 'desc' };
  }
  if (prev.dir === 'desc') {
    return { key: nextKey, dir: 'asc' };
  }
  return null; // Clear sort on third click
}

function isEmpty(val: unknown): boolean {
  return val === null || val === undefined || (typeof val === 'number' && isNaN(val));
}

/**
 * Stable sort helper.
 * - Null/Undefined/NaN always pushed to the bottom.
 * - Handles Numbers, Strings, Booleans, Dates.
 */
export function sortRows<T>(
  rows: T[],
  sort: SortState<string>,
  getValue: (row: T, key: string) => unknown
): T[] {
  if (!sort) return rows;

  return [...rows].sort((a, b) => {
    const valA = getValue(a, sort.key);
    const valB = getValue(b, sort.key);

    const emptyA = isEmpty(valA);
    const emptyB = isEmpty(valB);

    // Always sort empty values to the bottom regardless of direction
    if (emptyA && emptyB) return 0;
    if (emptyA) return 1;
    if (emptyB) return -1;

    let comparison = 0;

    if (typeof valA === 'number' && typeof valB === 'number') {
      comparison = valA - valB;
    } else if (typeof valA === 'string' && typeof valB === 'string') {
      comparison = valA.localeCompare(valB, undefined, { numeric: true, sensitivity: 'base' });
    } else if (typeof valA === 'boolean' && typeof valB === 'boolean') {
      comparison = (valA === valB ? 0 : valA ? 1 : -1);
    } else if (valA instanceof Date && valB instanceof Date) {
      comparison = valA.getTime() - valB.getTime();
    } else {
      // Fallback
      comparison = String(valA).localeCompare(String(valB));
    }

    return sort.dir === 'asc' ? comparison : -comparison;
  });
}
