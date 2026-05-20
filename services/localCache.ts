import { get, set, del } from 'idb-keyval';
import { logRuntimeDebug, warnRuntimeDebug } from './runtimeDebug';

const CACHE_KEY = 'sello_app_cache';
const VERSION_KEY = 'sello_cache_version';

export interface CachedState {
    snapshot: any;
    transactions: any[];
    refunds: any[];
    cachedAt: string;
    version: string;
}

function isIndexedDBAvailable(): boolean {
    try {
        return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
        return false;
    }
}

export async function saveToCache(
    snapshot: any,
    transactions: any[],
    refunds: any[],
    _shipments: any[],
    version: string
): Promise<void> {
    if (!isIndexedDBAvailable()) {
        warnRuntimeDebug('[cache] IndexedDB not available, skipping save');
        return;
    }
    try {
        const cache: CachedState = {
            snapshot,
            transactions,
            refunds,
            cachedAt: new Date().toISOString(),
            version
        };
        await set(CACHE_KEY, cache);
        localStorage.setItem(VERSION_KEY, version);
        logRuntimeDebug(`[cache] saved - ${transactions.length} transactions, ${refunds.length} refunds`);
    } catch (e) {
        warnRuntimeDebug('[cache] failed to save:', e);
    }
}

export async function loadFromCache(): Promise<CachedState | null> {
    if (!isIndexedDBAvailable()) {
        warnRuntimeDebug('[cache] IndexedDB not available, skipping load');
        return null;
    }
    try {
        const cache = await get<CachedState>(CACHE_KEY);
        if (cache) {
            logRuntimeDebug(`[cache] loaded - ${cache.transactions?.length ?? 0} transactions`);
        }
        return cache || null;
    } catch (e) {
        warnRuntimeDebug('[cache] failed to load:', e);
        return null;
    }
}

export async function clearCache(): Promise<void> {
    if (!isIndexedDBAvailable()) return;
    try {
        await del(CACHE_KEY);
        localStorage.removeItem(VERSION_KEY);
        logRuntimeDebug('[cache] cleared');
    } catch (e) {
        warnRuntimeDebug('[cache] failed to clear:', e);
    }
}

export function getCachedVersion(): string | null {
    return localStorage.getItem(VERSION_KEY);
}
