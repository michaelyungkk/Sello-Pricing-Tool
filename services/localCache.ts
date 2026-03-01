import { get, set, del } from 'idb-keyval';

const CACHE_KEY = 'sello_app_cache';
const VERSION_KEY = 'sello_cache_version';

export interface CachedState {
    snapshot: any;
    transactions: any[];
    cachedAt: string;
    version: string; // matches last_push_at from sync_metadata
}

export async function saveToCache(
    snapshot: any,
    transactions: any[],
    version: string
): Promise<void> {
    try {
        const cache: CachedState = {
            snapshot,
            transactions,
            cachedAt: new Date().toISOString(),
            version
        };
        await set(CACHE_KEY, cache);
        localStorage.setItem(VERSION_KEY, version);
    } catch (e) {
        console.warn('[cache] failed to save:', e);
    }
}

export async function loadFromCache(): Promise<CachedState | null> {
    try {
        const cache = await get<CachedState>(CACHE_KEY);
        return cache || null;
    } catch (e) {
        console.warn('[cache] failed to load:', e);
        return null;
    }
}

export async function clearCache(): Promise<void> {
    try {
        await del(CACHE_KEY);
        localStorage.removeItem(VERSION_KEY);
    } catch (e) {
        console.warn('[cache] failed to clear:', e);
    }
}

export function getCachedVersion(): string | null {
    return localStorage.getItem(VERSION_KEY);
}
