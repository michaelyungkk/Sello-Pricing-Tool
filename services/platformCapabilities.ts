
import { PriceLog } from '../types';

const KEY = 'sello_platform_ads_config';
let cache: Record<string, boolean> | null = null;

const load = (): Record<string, boolean> => {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); } catch { return {}; }
};

export const isAdsEnabled = (platform: string): boolean => {
  if (!platform) return false;
  if (!cache) cache = load();
  const entry = Object.entries(cache!).find(([k]) => k.toLowerCase() === platform.toLowerCase());
  if (entry) return entry[1];
  
  // Default heuristic if strictly unknown (fallback before inference runs)
  return ['amazon', 'ebay', 'temu'].some(x => platform.toLowerCase().includes(x));
};

export const setAdsCapability = (platform: string, enabled: boolean) => {
  if (!cache) cache = load();
  cache[platform] = enabled;
  localStorage.setItem(KEY, JSON.stringify(cache));
};

export const ensureCapabilities = (platforms: string[], history: PriceLog[]) => {
  if (!cache) cache = load();
  let changed = false;
  platforms.forEach(p => {
    // Check if key exists (case-insensitive)
    const exists = Object.keys(cache!).some(k => k.toLowerCase() === p.toLowerCase());
    if (exists) return;

    // Inference: Check history for ad spend OR specific order types if we had that field (we rely on adsSpend here)
    // Also fallback to name matching for known platforms
    const hasAdsData = history.some(h => (h.platform === p && (h.adsSpend || 0) > 0));
    const nameMatch = ['amazon', 'ebay', 'temu'].some(x => p.toLowerCase().includes(x));
    
    cache![p] = hasAdsData || nameMatch;
    changed = true;
  });
  if (changed) localStorage.setItem(KEY, JSON.stringify(cache));
};
