import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
    VAT_MULTIPLIER,
    DEFAULT_PRICING_RULES,
    DEFAULT_LOGISTICS_RULES,
    DEFAULT_STRATEGY_RULES,
    DEFAULT_SEARCH_CONFIG
} from '../constants';
import {
    Product,
    AdSnapshot,
    AdRosterChange,
    PricingRules,
    PriceLog,
    PromotionEvent,
    UserProfile as UserProfileType,
    LogisticsRule,
    FreightRate,
    StrategyConfig,
    VelocityLookback,
    RefundLog,
    PriceChangeRecord,
    SearchChip,
    SearchConfig,
    InventoryTemplate,
    PriceCheckTemplate,
    SearchSession,
    CostChangeRecord,
    InventoryChangeRecord,
    AttributeMap,
    SkuFamily,
    AdGroup,
    NavigationIntent
} from '../types';
import { analyzePriceAdjustment, parseSearchQuery, createTextFallbackIntent, SearchIntent } from '../services/searchIntentService';
import { processDataForSearch } from '../services/searchExecution';
import { getThresholdConfig, ThresholdConfig } from '../services/thresholdsConfig';
import { ReportLayout } from '../services/persistenceService';
import { hexToRgb, extractFirstHex } from '../utils/color';
import type { CohortSnapshot, OptimalPriceResult, BenchmarkUpdateNotice } from '../types';
import { resolveEffectiveVelocity, toNumber } from '../services/metrics';
import { asDateKey, getTodayKeyMelbourne } from '../services/dateUtils';
import { resolveAttribute } from '../services/mappingService';
import { redistributeAdSpend } from '../services/adSpreadService';
import {
    verifyPassword, pushSnapshot,
    getLatestTransactionDate,
    pushRefundsAndShipments,
    pushAdData,
    pushPromotions, pullPromotionSignatures
} from '../services/dbService';
import { useUploadHandlers } from './useUploadHandlers';
import { useSyncRestore } from './useSyncRestore';
import { useBenchmarkWorkflow } from './useBenchmarkWorkflow';
import { useUiNavigationState } from './useUiNavigationState';

const PROMO_CURSOR_KEY = 'sello_promotions_updated_at';
const PROMO_BASELINE_COMPLETE_KEY = 'sello_promotions_baseline_complete';

// Helper for recalculation
const recalculateProductMetrics = (
    products: Product[],
    historyOrMap: PriceLog[] | Map<string, PriceLog[]>,
    lookback: VelocityLookback,
    thresholds: ThresholdConfig,
    pricingRules?: PricingRules,
    brandMap?: AttributeMap,
    categoryMap?: AttributeMap
): Product[] => {
    let historyMap: Map<string, PriceLog[]>;
    let historyArray: PriceLog[];

    if (historyOrMap instanceof Map) {
        historyMap = historyOrMap;
        // Flatten map to array for the date range calculation below
        historyArray = [];
        historyOrMap.forEach(logs => historyArray.push(...logs));
    } else {
        historyArray = historyOrMap || [];
        historyMap = new Map<string, PriceLog[]>();
        historyArray.forEach(h => {
            if (!h || !h.sku) return;
            if (!historyMap.has(h.sku)) historyMap.set(h.sku, []);
            historyMap.get(h.sku)!.push(h);
        });
    }

    let days = 30;
    if (lookback === 'ALL') {
        if (historyArray.length > 0) {
            const daysArr = historyArray.map(l => new Date(l.date).getTime()).filter(t => !isNaN(t));
            if (daysArr.length > 0) {
                const minDate = Math.min(...daysArr);
                const diff = Date.now() - minDate;
                days = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
            }
        }
    } else {
        days = parseInt(lookback) || 30;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    cutoffDate.setHours(0, 0, 0, 0);

    const prevCutoffDate = new Date(cutoffDate);
    prevCutoffDate.setDate(prevCutoffDate.getDate() - days);

    return (products || []).map(p => {
        if (!p) return p;
        const logs = historyMap.get(p.sku) || [];

        let currentQty = 0;
        let prevQty = 0;
        const priceMap = new Map<number, number>();

        logs.forEach(l => {
            const d = new Date(l.date);
            if (isNaN(d.getTime())) return;

            if (d >= cutoffDate) {
                currentQty += toNumber(l.velocity);
            } else if (d >= prevCutoffDate) {
                prevQty += toNumber(l.velocity);
            }

            let isCostBased = false;
            if (pricingRules && l.platform) {
                const config = pricingRules[l.platform];
                if (config && config.pricingControl === 'PLATFORM_COST_BASED') {
                    isCostBased = true;
                }
            }

            if (!isCostBased && l.velocity > 0 && l.price > 0) {
                const pricePoint = Math.round(l.price * 100) / 100;
                priceMap.set(pricePoint, (priceMap.get(pricePoint) || 0) + l.velocity);
            }
        });

        const effectiveDailySales = resolveEffectiveVelocity(p, logs);
        const calculatedPrevDailySales = prevQty / days;
        const daysRemaining = effectiveDailySales > 0 ? toNumber(p.stockLevel) / effectiveDailySales : 999;

        let status: 'Critical' | 'Warning' | 'Healthy' | 'Overstock' = 'Healthy';
        if (toNumber(p.stockLevel) <= 0) status = 'Critical';
        else if (daysRemaining < toNumber(p.leadTimeDays, 30) * toNumber(thresholds.stockoutRunwayMultiplier, 1)) status = 'Critical';
        else if (daysRemaining > toNumber(thresholds.overstockDays, 120)) status = 'Overstock';
        else if (daysRemaining < toNumber(p.leadTimeDays, 30) * (toNumber(thresholds.stockoutRunwayMultiplier, 1) + 0.5)) status = 'Warning';

        const currentCalculatedVelocity = currentQty / days;
        const velocityChange = calculatedPrevDailySales > 0
            ? ((currentCalculatedVelocity - calculatedPrevDailySales) / calculatedPrevDailySales) * 100
            : 0;

        let maxVel = 0;
        let maxVelocityPrice: number | undefined = undefined;
        priceMap.forEach((qty, price) => {
            if (qty > maxVel) {
                maxVel = qty;
                maxVelocityPrice = price;
            } else if (qty === maxVel && maxVel > 0) {
                if (price > (maxVelocityPrice || 0)) {
                    maxVelocityPrice = price;
                }
            }
        });

        let resolvedBrand = p.brand;
        let resolvedCategory = p.category;

        if (brandMap && p.brand) {
            resolvedBrand = resolveAttribute(p.brand, brandMap);
        }
        if (categoryMap && p.category) {
            resolvedCategory = resolveAttribute(p.category, categoryMap);
        }

        return {
            ...p,
            averageDailySales: effectiveDailySales,
            previousDailySales: calculatedPrevDailySales,
            daysRemaining,
            status,
            maxVelocityPrice,
            _trendData: { velocityChange },
            brand: resolvedBrand,
            category: resolvedCategory
        };
    }).filter(Boolean);
};

const getFridayThursdayRanges = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const daysSinceFriday = (dayOfWeek + 7 - 5) % 7;

    const currentStart = new Date(today);
    currentStart.setDate(today.getDate() - daysSinceFriday);

    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentStart.getDate() + 6);

    const lastStart = new Date(currentStart);
    lastStart.setDate(currentStart.getDate() - 7);

    const lastEnd = new Date(currentStart);
    lastEnd.setDate(currentStart.getDate() + 6);

    return {
        current: { start: currentStart, end: currentEnd },
        last: { start: lastStart, end: lastEnd }
    };
};

const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const derivePromotionStatus = (startDate?: string, endDate?: string): 'UPCOMING' | 'ACTIVE' | 'ENDED' => {
    const today = getTodayKeyMelbourne();
    const start = asDateKey(startDate || null);
    const end = asDateKey(endDate || null);
    if (!start || !end) return 'UPCOMING';
    if (start > today) return 'UPCOMING';
    if (end < today) return 'ENDED';
    return 'ACTIVE';
};

const normalizePromotionStatuses = (list: PromotionEvent[] = []): PromotionEvent[] => {
    return (Array.isArray(list) ? list : []).map((promo) => ({
        ...promo,
        status: derivePromotionStatus(promo.startDate, promo.endDate)
    }));
};

const buildStableString = (value: any): string => {
    if (value === null || value === undefined) return 'null';
    if (Array.isArray(value)) return `[${value.map(buildStableString).join(',')}]`;
    if (typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map((k) => `${JSON.stringify(k)}:${buildStableString(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
};

const toHash = (raw: string): string => {
    let h1 = 0xdeadbeef;
    let h2 = 0x41c6ce57;
    for (let i = 0; i < raw.length; i++) {
        const ch = raw.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
};

const buildPromotionSignature = (promotion: any): string => toHash(buildStableString(promotion));
const toSalesCompareDateKey = (value: unknown): string =>
    asDateKey(value == null ? null : String(value)) || '';
const buildSalesCompareKey = (row: any): string => {
    const date = toSalesCompareDateKey(row?.date);
    const sku = String(row?.sku || '').trim().toUpperCase();
    const platform = String(row?.platform || 'General').trim();
    const orderId = String(row?.orderId || '').trim();
    return orderId ? `${sku}|${date}|${platform}|${orderId}` : `${sku}|${date}|${platform}`;
};
const isArrivedShipmentStatus = (status?: string): boolean => {
    const raw = String(status || '').trim();
    if (!raw) return false;
    const first = raw.includes('/') ? raw.split('/')[0].trim() : raw;
    const cleaned = first.replace(/[\u4E00-\u9FFF]/g, '').trim().toLowerCase();
    return cleaned.includes('arrived') || cleaned.includes('delivered') || cleaned.includes('cleared') || cleaned.includes('received') || cleaned.includes('landed');
};

export const useAppState = () => {
    const { t } = useTranslation();

    const [products, setProducts] = useState<Product[]>([]);
    const [salesHistory, setSalesHistory] = useState<PriceLog[]>([]);
    const [refundHistory, setRefundHistory] = useState<RefundLog[]>([]);
    const [freightRates, setFreightRates] = useState<FreightRate[]>([]);
    const [isFreightModalOpen, setIsFreightModalOpen] = useState<boolean>(false);
    const [priceChangeHistory, setPriceChangeHistory] = useState<PriceChangeRecord[]>([]);
    const [costChangeHistory, setCostChangeHistory] = useState<CostChangeRecord[]>([]);
    const [inventoryChangeHistory, setInventoryChangeHistory] = useState<InventoryChangeRecord[]>([]);
    const [promotions, setPromotions] = useState<PromotionEvent[]>([]);
    const [learnedAliases, setLearnedAliases] = useState<Record<string, string>>({});
    const [inventoryTemplates, setInventoryTemplates] = useState<InventoryTemplate[]>([]);
    const [customReportPresets, setCustomReportPresets] = useState<ReportLayout[]>([]);
    const [priceCheckTemplates, setPriceCheckTemplates] = useState<PriceCheckTemplate[]>(() => {
        try { return JSON.parse(localStorage.getItem('sello_price_check_templates') || '[]'); } catch { return []; }
    });
    const handleSavePriceCheckTemplates = (templates: PriceCheckTemplate[]) => {
        setPriceCheckTemplates(templates);
        try { localStorage.setItem('sello_price_check_templates', JSON.stringify(templates)); } catch { /* ignore localStorage write failures */ }
    };

    const [pricingRules, setPricingRules] = useState<PricingRules>(DEFAULT_PRICING_RULES);
    const [logisticsRules, setLogisticsRules] = useState<LogisticsRule[]>(DEFAULT_LOGISTICS_RULES);
    const [strategyRules, setStrategyRules] = useState<StrategyConfig>(DEFAULT_STRATEGY_RULES);
    const [searchConfig, setSearchConfig] = useState<SearchConfig>(DEFAULT_SEARCH_CONFIG);
    const [skuFamilies, setSkuFamilies] = useState<SkuFamily[]>([]);
    const [adGroups, setAdGroups] = useState<AdGroup[]>([]);

    // --- AD CAMPAIGN STATE ---
    const [adSnapshots, setAdSnapshots] = useState<AdSnapshot[]>(() => {
        try { return JSON.parse(localStorage.getItem('sello_ad_snapshots') || '[]'); } catch { return []; }
    });
    const [adRosterChanges, setAdRosterChanges] = useState<AdRosterChange[]>(() => {
        try { return JSON.parse(localStorage.getItem('sello_ad_roster_changes') || '[]'); } catch { return []; }
    });
    const [adBudgets, setAdBudgets] = useState<Record<string, number>>(() => {
        try { return JSON.parse(localStorage.getItem('sello_ad_budgets') || '{}'); } catch { return {}; }
    });
    const [lastRecalculationSummary, setLastRecalculationSummary] = useState<{ affectedTransactions: number; totalSpreadAmount: number; daysProcessed: number } | null>(null);
    const [pendingFamilySuggestions, setPendingFamilySuggestions] = useState<SkuFamily[]>([]);

    // --- OPTIMAL PRICING STATE ---
    const [cohortSnapshot, setCohortSnapshot] = useState<CohortSnapshot | null>(null);
    const [optimalPriceResults, setOptimalPriceResults] = useState<Map<string, OptimalPriceResult>>(new Map());
    const [benchmarkUpdateNotices, setBenchmarkUpdateNotices] = useState<BenchmarkUpdateNotice[]>([]);

    // --- DB SYNC STATE ---
    const [isAdminMode, setIsAdminMode] = useState<boolean>(
        () => sessionStorage.getItem('sello_admin_mode') === 'true'
    );
    const [adminSessionActive, setAdminSessionActive] = useState<boolean>(false);
    const [storedAdminPassword, setStoredAdminPassword] = useState<string>(
        () => sessionStorage.getItem('sello_admin_pw') || ''
    );
    const [isDirty, setIsDirty] = useState<boolean>(false);
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'pushing' | 'error'>('idle');
    const [postApplySource, setPostApplySource] = useState<'none' | 'sales-import' | 'refund-import' | 'inventory-import' | 'freight-upload' | 'sync' | 'cache-load' | 'local-cache-load'>('none');
    const [salesPushMode, setSalesPushMode] = useState<'incremental' | 'reconciliation' | 'full_snapshot'>('incremental');
    const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(
        () => localStorage.getItem('sello_last_synced_at')
    );
    const [showSaveToast, setShowSaveToast] = useState<boolean>(false);
    const [pendingFamilyConflicts, setPendingFamilyConflicts] = useState<SkuFamily[]>([]);
    const [pushProgress, setPushProgress] = useState<number>(0);
    const [pushTotal, setPushTotal] = useState<number>(0);
    const [syncStep, setSyncStep] = useState<string>('');
    const [syncProgress, setSyncProgress] = useState<number>(0);
    const [syncTotal, setSyncTotal] = useState<number>(0);
    const [startupChoicePending, setStartupChoicePending] = useState<boolean>(true);
    const [startupSyncMode, setStartupSyncMode] = useState<'sync' | 'local' | null>(null);
    const [isRestoring, setIsRestoring] = useState<boolean>(false);
    const pendingSalesReconciliationRef = useRef<{
        upsertKeys: string[];
        removedKeys: string[];
        added: number;
        changed: number;
        removed: number;
    } | null>(null);

    const [brandMap, setBrandMap] = useState<AttributeMap>({});
    const [categoryMap, setCategoryMap] = useState<AttributeMap>({});

    const [uploadTimestamps, setUploadTimestamps] = useState<Record<string, string>>(() => {
        try {
            return JSON.parse(localStorage.getItem('sello_upload_timestamps') || '{}') || {};
        } catch { return {}; }
    });

    const updateTimestamp = useCallback((key: string) => {
        const now = new Date().toISOString();
        setUploadTimestamps(prev => {
            const next = { ...(prev || {}), [key]: now };
            localStorage.setItem('sello_upload_timestamps', JSON.stringify(next));
            return next;
        });
    }, []);

    const [thresholds, setThresholds] = useState<ThresholdConfig>(getThresholdConfig());

    const [velocityLookback, setVelocityLookback] = useState<VelocityLookback>(() => {
        return (localStorage.getItem('sello_velocity_setting') as VelocityLookback) || '30';
    });

    const [userProfile, setUserProfile] = useState<UserProfileType>({
        name: '', themeColor: '#134E4A', backgroundImage: '', backgroundColor: '#f3f4f6', glassMode: 'light', glassOpacity: 90, glassBlur: 10, ambientGlass: true, ambientGlassOpacity: 15
    });

    const [showBackToTop, setShowBackToTop] = useState(false);
    const mainContentRef = useRef<HTMLDivElement>(null);
    const fileRestoreRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let lastShowBackToTop = false;
        const handleScroll = () => {
            if (mainContentRef.current) {
                const shouldShow = mainContentRef.current.scrollTop > 400;
                if (shouldShow !== lastShowBackToTop) {
                    lastShowBackToTop = shouldShow;
                    setShowBackToTop(shouldShow);
                }
            }
        };

        const scrollContainer = mainContentRef.current;
        if (scrollContainer) {
            scrollContainer.addEventListener('scroll', handleScroll);
        }

        return () => {
            if (scrollContainer) scrollContainer.removeEventListener('scroll', handleScroll);
        };
    }, []);

    const [isOnline] = useState(navigator.onLine);

    const {
        selectedElasticityProduct,
        setSelectedElasticityProduct,
        isUploadModalOpen,
        setIsUploadModalOpen,
        isSalesImportModalOpen,
        setIsSalesImportModalOpen,
        isCostUploadModalOpen,
        setIsCostUploadModalOpen,
        isSkuDetailModalOpen,
        setIsSkuDetailModalOpen,
        isMappingModalOpen,
        setIsMappingModalOpen,
        isReturnsModalOpen,
        setIsReturnsModalOpen,
        isCAUploadModalOpen,
        setIsCAUploadModalOpen,
        isShipmentModalOpen,
        setIsShipmentModalOpen,
        selectedAnalysisProduct,
        setSelectedAnalysisProduct,
        analysisResult,
        setAnalysisResult,
        isAnalysisLoading,
        setIsAnalysisLoading,
        isSearchLoading,
        setIsSearchLoading,
        searchSessions,
        setSearchSessions,
        activeSearchId,
        setActiveSearchId,
        currentView,
        setCurrentView,
        navigationIntent,
        setNavigationIntent,
        isFreshnessExpanded,
        setIsFreshnessExpanded,
        mapJumpState,
        setMapJumpState
    } = useUiNavigationState();

    const priceHistoryMap = useMemo(() => {
        const map = new Map<string, PriceLog[]>();
        (salesHistory || []).forEach(h => {
            if (!h || !h.sku) return;
            if (!map.has(h.sku)) map.set(h.sku, []);
            map.get(h.sku)!.push(h);
        });
        return map;
    }, [salesHistory]);

    const existingOrders = useMemo(() => {
        const map = new Map<string, string>();
        (salesHistory || []).forEach(p => {
            if (p && p.orderId) map.set(p.orderId, p.platform || 'Unknown');
        });
        return map;
    }, [salesHistory]);

    const dynamicDateLabels = useMemo(() => {
        const ranges = getFridayThursdayRanges();
        return {
            current: `${formatDate(ranges.current.start)} - ${formatDate(ranges.current.end)}`,
            last: `${formatDate(ranges.last.start)} - ${formatDate(ranges.last.end)}`
        };
    }, []);

    const ambientRgb = useMemo(() => {
        let hex = userProfile.themeColor;
        const bgImageHex = (userProfile.backgroundImage && userProfile.backgroundImage !== 'none')
            ? extractFirstHex(userProfile.backgroundImage)
            : null;

        if (bgImageHex) {
            hex = bgImageHex;
        } else if (userProfile.backgroundColor && userProfile.backgroundColor !== 'none') {
            hex = userProfile.backgroundColor;
        }

        const rgb = hexToRgb(hex);
        return rgb || (userProfile.glassMode === 'dark' ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 });
    }, [userProfile.backgroundImage, userProfile.backgroundColor, userProfile.themeColor, userProfile.glassMode]);

    const handleRefreshProductStatuses = useCallback((config: ThresholdConfig) => {
        const recalculated = recalculateProductMetrics(products, priceHistoryMap, velocityLookback, config, pricingRules, brandMap, categoryMap);
        setProducts(recalculated);
    }, [products, priceHistoryMap, velocityLookback, pricingRules, brandMap, categoryMap]);

    const handleSaveBrandMap = useCallback((newMap: AttributeMap) => {
        setBrandMap(newMap);
        const currentThresholds = getThresholdConfig();
        const recalculated = recalculateProductMetrics(
            products, priceHistoryMap, velocityLookback, currentThresholds, pricingRules, newMap, categoryMap
        );
        setProducts(recalculated);
        if (isAdminMode) setIsDirty(true);
    }, [products, priceHistoryMap, velocityLookback, pricingRules, categoryMap, isAdminMode]);

    const handleSaveCategoryMap = useCallback((newMap: AttributeMap) => {
        setCategoryMap(newMap);
        const currentThresholds = getThresholdConfig();
        const recalculated = recalculateProductMetrics(
            products, priceHistoryMap, velocityLookback, currentThresholds, pricingRules, brandMap, newMap
        );
        setProducts(recalculated);
        if (isAdminMode) setIsDirty(true);
    }, [products, priceHistoryMap, velocityLookback, pricingRules, brandMap, isAdminMode]);

    const handleRefreshThresholds = useCallback(() => {
        const newConfig = getThresholdConfig();
        setThresholds(newConfig);
        handleRefreshProductStatuses(newConfig);
    }, [handleRefreshProductStatuses]);

    const handleRecalculateVelocity = useCallback((newLookback: VelocityLookback, currentPriceHistory: PriceLog[]) => {
        const currentThresholds = getThresholdConfig();
        const recalculated = recalculateProductMetrics(products, currentPriceHistory, newLookback, currentThresholds, pricingRules, brandMap, categoryMap);
        setProducts(recalculated);
    }, [products, pricingRules, brandMap, categoryMap]);

    const handleSearch = useCallback(async (queryOrChips: string | SearchChip[]) => {
        const devSearchLog = (label: string, payload?: unknown) => {
            if (!import.meta.env.DEV) return;
            if (payload === undefined) {
                console.log(`[search-debug] ${label}`);
                return;
            }
            console.log(`[search-debug] ${label}`, payload);
        };

        let rawText = "";
        if (typeof queryOrChips === 'string') { rawText = queryOrChips; }
        else { const chips = queryOrChips; const metrics = chips.filter(c => c.type === 'METRIC').map(c => c.label).join(' '); const conditions = chips.filter(c => c.type === 'CONDITION').map(c => c.label).join(' '); const platforms = chips.filter(c => c.type === 'PLATFORM').map(c => `on ${c.label}`).join(' '); const text = chips.filter(c => c.type === 'TEXT').map(c => c.value).join(' '); const time = chips.filter(c => c.type === 'TIME').map(c => c.label).join(' '); rawText = `${time} ${conditions} ${metrics} ${platforms} ${text}`.trim(); }

        const cleanQuery = rawText.replace(/^SKU:\s*/i, '').trim();
        const normalizedQuery = cleanQuery.toLowerCase();

        const directMatch = products.find(p => {
            if (!p) return false;
            if (p.sku.toLowerCase() === normalizedQuery) return true;
            return normalizedQuery !== '' && (p.channels || []).some(c => c.skuAlias && c.skuAlias.split(',').map(a => a.trim()).filter(Boolean).some(a => a.toLowerCase() === normalizedQuery));
        });

        if (directMatch) {
            setIsSearchLoading(true);
            setTimeout(() => {
                const deepDiveIntent: SearchIntent = {
                    targetData: 'inventory',
                    filters: [{ field: 'sku', operator: '=', value: directMatch.sku }],
                    primaryMetric: 'DEEP_DIVE',
                    limit: 1,
                    explanation: `Deep Dive: ${directMatch.sku}`
                };
                const { results, timeLabel } = processDataForSearch(deepDiveIntent, products, salesHistory, pricingRules, refundHistory);
                const newSession: SearchSession = { id: `search-${Date.now()}`, query: `SKU: ${directMatch.sku}`, results: results || [], params: deepDiveIntent, explanation: deepDiveIntent.explanation, timeLabel: timeLabel, timestamp: Date.now() };
                setSearchSessions(prev => [newSession, ...(prev || [])]); setActiveSearchId(newSession.id); setCurrentView('search'); setIsSearchLoading(false);
            }, 150);
            return;
        }

        setIsSearchLoading(true);
        try {
            const intent = await parseSearchQuery(rawText);
            devSearchLog('parsed intent', {
                query: rawText,
                targetData: intent.targetData,
                primaryMetric: intent.primaryMetric,
                filterCount: intent.filters?.length || 0,
                sortField: intent.sort?.field,
                sortDirection: intent.sort?.direction,
                limit: intent.limit,
                timeRange: intent.timeRange?.value
            });
            let { results, timeLabel } = processDataForSearch(intent, products, salesHistory, pricingRules, refundHistory);
            let finalIntent = intent;
            let fallbackUsed = false;

            if ((!results || results.length === 0) && rawText.trim().length > 0) {
                const fallbackIntent = createTextFallbackIntent(rawText);
                const fallbackSearch = processDataForSearch(fallbackIntent, products, salesHistory, pricingRules, refundHistory);
                fallbackUsed = true;
                devSearchLog('fallback attempted', {
                    query: rawText,
                    fallbackTargetData: fallbackIntent.targetData,
                    fallbackFilterCount: fallbackIntent.filters?.length || 0,
                    fallbackResults: fallbackSearch.results?.length || 0
                });
                if ((fallbackSearch.results || []).length > 0) {
                    results = fallbackSearch.results;
                    timeLabel = fallbackSearch.timeLabel;
                    finalIntent = fallbackIntent;
                }
            }

            devSearchLog('search completed', {
                query: rawText,
                fallbackUsed,
                finalTargetData: finalIntent.targetData,
                finalPrimaryMetric: finalIntent.primaryMetric,
                finalFilterCount: finalIntent.filters?.length || 0,
                resultCount: results?.length || 0,
                timeLabel
            });

            const newSession: SearchSession = { id: `search-${Date.now()}`, query: rawText, results: results || [], params: finalIntent, explanation: finalIntent.explanation, timeLabel: timeLabel, timestamp: Date.now() };
            setSearchSessions(prev => [newSession, ...(prev || [])]); setActiveSearchId(newSession.id); setCurrentView('search');
        } catch (e) {
            devSearchLog('search failed', { query: rawText, error: e });
            console.error("Search failed", e);
        } finally { setIsSearchLoading(false); }
    }, [products, salesHistory, pricingRules, refundHistory, setActiveSearchId, setCurrentView, setIsSearchLoading, setSearchSessions]);

    const handleDeepDiveRequest = useCallback((sku: string) => { handleSearch(`SKU: ${sku}`); }, [handleSearch]);

    /**
     * navigateToEntity is the single entrypoint for cross-page entity navigation.
     * Callers must pass typed intent (`targetView`, `entityType`, `entityId`, `sourceView`).
     * Consumers must resolve, handle once, and clear intent to avoid stale reopen behavior.
     */
    const navigateToEntity = useCallback((intent: Omit<NavigationIntent, 'createdAt'>) => {
        setNavigationIntent({
            ...intent,
            createdAt: Date.now()
        });
    }, [setNavigationIntent]);

    const clearNavigationIntent = useCallback(() => {
        setNavigationIntent(null);
    }, [setNavigationIntent]);

    const handleManualPriceChange = useCallback((data: Omit<PriceChangeRecord, 'id' | 'changeType' | 'percentChange'>) => {
        const { sku, productName, date, platform, oldPrice, newPrice } = data;
        const changeType = newPrice > oldPrice ? 'INCREASE' : 'DECREASE';
        const percentChange = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : (newPrice > 0 ? 100 : 0);
        const newRecord: PriceChangeRecord = { id: `manual-${Date.now()}-${sku}`, sku, productName, date, platform: platform || 'Unknown', oldPrice, newPrice, changeType, percentChange };
        setPriceChangeHistory(prev => [newRecord, ...(prev || [])]);
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode]);

    const handleManualCostChange = useCallback((data: Omit<CostChangeRecord, 'id' | 'changeType' | 'percentChange'>) => {
        const { sku, productName, date, oldCost, newCost } = data;
        const changeType = newCost > oldCost ? 'INCREASE' : 'DECREASE';
        const percentChange = oldCost > 0 ? ((newCost - oldCost) / oldCost) * 100 : (newCost > 0 ? 100 : 0);
        const newRecord: CostChangeRecord = { id: `manual-cost-${Date.now()}-${sku}`, sku, productName, date, oldCost, newCost, changeType, percentChange };
        setCostChangeHistory(prev => [...(prev || []), newRecord].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode]);

    const handleAnalyzeCarrier = useCallback((carrier: string) => {
        const trimmedCarrier = (carrier || '').trim();
        if (!trimmedCarrier) return;
        navigateToEntity({
            targetView: 'overview',
            entityType: 'sales_map_carrier',
            entityId: trimmedCarrier,
            sourceView: currentView
        });
    }, [navigateToEntity, currentView]);

    const markSearchSessionsStale = useCallback(() => {
        setSearchSessions(prev => (prev || []).map(session => ({ ...session, stale: true } as SearchSession)));
    }, [setSearchSessions]);

    const handleRefineSearch = useCallback((sessionId: string, newIntent: SearchIntent) => { setIsSearchLoading(true); setTimeout(() => { const { results, timeLabel } = processDataForSearch(newIntent, products, salesHistory, pricingRules, refundHistory); setSearchSessions(prev => (prev || []).map(s => { if (s.id === sessionId) { return { ...s, results, params: newIntent, timeLabel, stale: false } as SearchSession; } return s; })); setIsSearchLoading(false); }, 150); }, [products, salesHistory, pricingRules, refundHistory, setIsSearchLoading, setSearchSessions]);
    const deleteSearchSession = useCallback((id: string, e: React.MouseEvent) => { e.stopPropagation(); setSearchSessions(prev => (prev || []).filter(s => s.id !== id)); if (activeSearchId === id) { setActiveSearchId(null); setCurrentView('overview'); } }, [activeSearchId, setActiveSearchId, setCurrentView, setSearchSessions]);
    const handleViewElasticity = useCallback((product: Product) => { setSelectedElasticityProduct(product); }, [setSelectedElasticityProduct]);
    const handleAnalyze = useCallback(async (product: Product, context?: string) => { const platformName = product.platform || (product.channels && product.channels.length > 0 ? product.channels[0].platform : 'General'); const platformRule = pricingRules[platformName] || { markup: 0, commission: 15, manager: 'General', isExcluded: false }; setSelectedAnalysisProduct(product); setAnalysisResult(null); setIsAnalysisLoading(true); try { const result = await analyzePriceAdjustment(product, platformRule, context, thresholds); setAnalysisResult(result); } catch (error) { console.error("Analysis failed in App:", error); } finally { setIsAnalysisLoading(false); } }, [pricingRules, thresholds, setAnalysisResult, setIsAnalysisLoading, setSelectedAnalysisProduct]);
    const handleApplyPrice = useCallback((productId: string, newPrice: number) => { setProducts(prev => { const productToUpdate = (prev || []).find(p => p.id === productId); if (!productToUpdate) return prev; const oldPrice = productToUpdate.caPrice || (productToUpdate.currentPrice * VAT_MULTIPLIER); const change: PriceChangeRecord = { id: `chg-${Date.now()}-${productToUpdate.sku}`, sku: productToUpdate.sku, productName: productToUpdate.name, date: new Date().toISOString().split('T')[0], platform: productToUpdate.platform || 'Unknown', oldPrice: oldPrice, newPrice: newPrice, changeType: newPrice > oldPrice ? 'INCREASE' : 'DECREASE', percentChange: oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 100 }; setPriceChangeHistory(prevHistory => [...(prevHistory || []), change]); return prev.map(p => { if (p.id !== productId) return p; return { ...p, caPrice: newPrice, lastUpdated: new Date().toISOString().split('T')[0] }; }); }); setSelectedAnalysisProduct(null); setAnalysisResult(null); }, [setAnalysisResult, setSelectedAnalysisProduct]);

    const handleAdGroupSave = useCallback((
        updatedAdGroups: AdGroup[],
        customHistory?: PriceLog[],
        customProducts?: Product[],
        customLookback?: VelocityLookback,
        customRules?: PricingRules,
        customBrandMap?: AttributeMap,
        customCategoryMap?: AttributeMap
    ) => {
        setAdGroups(updatedAdGroups);
        const historyToUse = customHistory || salesHistory;
        const redistributed = redistributeAdSpend(historyToUse, updatedAdGroups);

        let affected = 0;
        let totalSpread = 0;
        const processedDates = new Set<string>();

        redistributed.forEach((log, i) => {
            const original = historyToUse[i];
            if (log.adsSpend !== (original?.adsSpend || 0)) {
                affected++;
                totalSpread += Math.abs((log.adsSpend || 0) - (original?.adsSpend || 0));
                processedDates.add(log.date.split('T')[0]);
            }
        });

        const summary = {
            affectedTransactions: affected,
            totalSpreadAmount: totalSpread,
            daysProcessed: processedDates.size
        };

        setSalesHistory(redistributed);
        const currentThresholds = getThresholdConfig();
        const finalProducts = recalculateProductMetrics(
            customProducts || products,
            redistributed,
            customLookback || velocityLookback,
            currentThresholds,
            customRules || pricingRules,
            customBrandMap || brandMap,
            customCategoryMap || categoryMap
        );
        setProducts(finalProducts);
        setLastRecalculationSummary(summary);
        markSearchSessionsStale();

        if (isAdminMode) setIsDirty(true);
        return summary;
    }, [salesHistory, products, velocityLookback, pricingRules, brandMap, categoryMap, isAdminMode, markSearchSessionsStale]);

    // --- AD CAMPAIGN HANDLERS ---
    const handleAdCampaignImport = useCallback((snapshot: AdSnapshot, updatedBudgets: Record<string, number>) => {
        setAdSnapshots(prev => {
            // Replace if same week+platform exists, otherwise prepend
            const filtered = prev.filter(s => !(s.platform === snapshot.platform && s.weekStartDate === snapshot.weekStartDate));
            const next = [snapshot, ...filtered];
            try { localStorage.setItem('sello_ad_snapshots', JSON.stringify(next)); } catch { /* ignore localStorage write failures */ }
            return next;
        });
        setAdBudgets(updatedBudgets);
        try { localStorage.setItem('sello_ad_budgets', JSON.stringify(updatedBudgets)); } catch { /* ignore localStorage write failures */ }
    }, []);

    const handleAdRosterChange = useCallback((change: AdRosterChange) => {
        setAdRosterChanges(prev => {
            const next = [change, ...prev];
            try { localStorage.setItem('sello_ad_roster_changes', JSON.stringify(next)); } catch { /* ignore localStorage write failures */ }
            return next;
        });
    }, []);

    const handleResetRefunds = useCallback(() => { setRefundHistory([]); setProducts(prev => (prev || []).map(p => ({ ...p, returnRate: 0 }))); setIsReturnsModalOpen(false); }, [setIsReturnsModalOpen]);

    const handleUpdatePriceChangeRecord = useCallback((recordToUpdate: PriceChangeRecord) => { setPriceChangeHistory(prev => (prev || []).map(record => record.id === recordToUpdate.id ? { ...record, date: recordToUpdate.date } : record)); }, []);
    const handleUpdateCostChangeRecord = useCallback((recordToUpdate: CostChangeRecord) => { setCostChangeHistory(prev => (prev || []).map(record => record.id === recordToUpdate.id ? { ...record, date: recordToUpdate.date } : record)); }, []);
    const handleUpdateInventoryChangeRecord = useCallback((recordToUpdate: InventoryChangeRecord) => { setInventoryChangeHistory(prev => (prev || []).map(record => record.id === recordToUpdate.id ? { ...record, date: recordToUpdate.date } : record)); }, []);
    const {
        handleSalesImportConfirm,
        handleInventoryImport,
        handleResetSalesData,
        handleSkuDetailImport,
        handleMappingImport,
        handleReturnsImport,
        handleFreightRatesUpload,
        handleCAImport,
        handleDescriptionImport,
        handleStampLandedAt,
        handleShipmentImport
    } = useUploadHandlers({
        products,
        salesHistory,
        refundHistory,
        priceHistoryMap,
        velocityLookback,
        pricingRules,
        brandMap,
        categoryMap,
        skuFamilies,
        cohortSnapshot,
        learnedAliases,
        isAdminMode,
        pendingSalesReconciliationRef,
        setPostApplySource,
        setSalesPushMode,
        setLearnedAliases,
        setSalesHistory,
        setProducts,
        setPricingRules,
        setIsDirty,
        setBenchmarkUpdateNotices,
        setPendingFamilySuggestions,
        setCostChangeHistory,
        setInventoryChangeHistory,
        setRefundHistory,
        setFreightRates,
        setPriceChangeHistory,
        setIsSalesImportModalOpen,
        markSearchSessionsStale,
        updateTimestamp,
        recalculateProductMetrics,
        isArrivedShipmentStatus
    });

    const {
        getSharedSnapshot,
        handleBackup,
        handleRestore,
        handleSync,
        resolveConflicts,
        handleStartSyncNow,
        handleStartLocalOnly
    } = useSyncRestore({
        t,
        products,
        salesHistory,
        refundHistory,
        priceChangeHistory,
        costChangeHistory,
        inventoryChangeHistory,
        promotions,
        adGroups,
        skuFamilies,
        learnedAliases,
        pricingRules,
        logisticsRules,
        strategyRules,
        searchConfig,
        thresholds,
        brandMap,
        categoryMap,
        inventoryTemplates,
        customReportPresets,
        priceCheckTemplates,
        freightRates,
        cohortSnapshot,
        optimalPriceResults,
        benchmarkUpdateNotices,
        velocityLookback,
        userProfile,
        uploadTimestamps,
        pendingFamilyConflicts,
        isAdminMode,
        startupChoicePending,
        startupSyncMode,
        fileRestoreRef,
        setRefundHistory,
        setFreightRates,
        setPriceChangeHistory,
        setCostChangeHistory,
        setInventoryChangeHistory,
        setPromotions,
        setLearnedAliases,
        setPricingRules,
        setLogisticsRules,
        setStrategyRules,
        setSearchConfig,
        setInventoryTemplates,
        setCustomReportPresets,
        setPriceCheckTemplates,
        setUploadTimestamps,
        setBrandMap,
        setCategoryMap,
        setSkuFamilies,
        setUserProfile,
        setThresholds,
        setVelocityLookback,
        setAdGroups,
        setSalesHistory,
        setProducts,
        setLastRecalculationSummary,
        setSearchSessions,
        setActiveSearchId,
        setSyncStatus,
        setSyncStep,
        setSyncProgress,
        setSyncTotal,
        setStartupSyncMode,
        setStartupChoicePending,
        setIsRestoring,
        setLastSyncedAt,
        setPendingFamilyConflicts,
        setPostApplySource,
        setCohortSnapshot,
        setOptimalPriceResults,
        setBenchmarkUpdateNotices,
        setIsDirty,
        normalizePromotionStatuses,
        recalculateProductMetrics,
        markSearchSessionsStale
    });

    const {
        benchmarkRecalcState,
        handleCancelBenchmarkRecalculation,
        handleDismissBenchmarkRecalcState,
        handleRecalculateBenchmarks
    } = useBenchmarkWorkflow({
        products,
        salesHistory,
        priceChangeHistory,
        pricingRules,
        promotions,
        learnedAliases,
        cohortSnapshot,
        optimalPriceResults,
        benchmarkUpdateNotices,
        setCohortSnapshot,
        setOptimalPriceResults,
        setBenchmarkUpdateNotices
    });

    const onSyncFromFamilies = useCallback((platform: string) => {
        const nextGroups = [...(adGroups || [])];
        let hasChanges = false;
        const todayStr = new Date().toISOString().split('T')[0];

        skuFamilies.forEach(family => {
            const syncName = `${family.name} (${platform})`;
            if (!nextGroups.some(g => g.name === syncName && g.platform === platform)) {
                nextGroups.push({
                    id: `ag-sync-${Date.now()}-${family.id}-${platform}`,
                    name: syncName,
                    memberSkus: [...family.memberSkus],
                    platform: platform,
                    startDate: todayStr,
                    createdAt: new Date().toISOString(),
                    updatedAt: new Date().toISOString()
                });
                hasChanges = true;
            }
        });
        if (hasChanges) handleAdGroupSave(nextGroups);
    }, [skuFamilies, adGroups, handleAdGroupSave]);

    const onAddAdGroup = useCallback((group: AdGroup) => {
        handleAdGroupSave([...(adGroups || []), group]);
    }, [adGroups, handleAdGroupSave]);

    const onEditAdGroup = useCallback((group: AdGroup) => {
        handleAdGroupSave((adGroups || []).map(g => g.id === group.id ? group : g));
    }, [adGroups, handleAdGroupSave]);

    const onRemoveAdGroup = useCallback((id: string) => {
        handleAdGroupSave((adGroups || []).filter(g => g.id !== id));
    }, [adGroups, handleAdGroupSave]);

    // --- ADMIN TOGGLE ---
    const handleAdminToggle = useCallback(async (password: string) => {
        const res = await verifyPassword(password);
        if (res.valid) {
            setIsAdminMode(true);
            setAdminSessionActive(true);
            setStoredAdminPassword(password);
            sessionStorage.setItem('sello_admin_mode', 'true');
            sessionStorage.setItem('sello_admin_pw', password);
            return { success: true };
        }
        return { success: false, error: 'Invalid credentials' };
    }, []);

    const handleAdminExit = useCallback((force = false) => {
        if (isDirty && !force) return { needsConfirmation: true };
        setIsAdminMode(false);
        setAdminSessionActive(false);
        setStoredAdminPassword('');
        setIsDirty(false);
        setSyncStatus('idle');
        sessionStorage.removeItem('sello_admin_mode');
        sessionStorage.removeItem('sello_admin_pw');
        return { needsConfirmation: false };
    }, [isDirty]);

    const handleAdminPush = useCallback(async (issueImportantRefresh: boolean = false) => {
        if (!isAdminMode || !storedAdminPassword) return;
        setSyncStatus('pushing');
        setPushProgress(0);
        setPushTotal(0);
        let replaceUploadId: string | null = null;
        let replaceSessionStarted = false;
        try {
            // Step 1: Determine sales push mode and payload.
            const allTransactions = salesHistory || [];
            const localTotal = allTransactions.length;
            const localPromotionCount = promotions?.length || 0;
            const localRefundCount = refundHistory?.length || 0;
            const localPriceChangeCount = priceChangeHistory?.length || 0;
            const localCostChangeCount = costChangeHistory?.length || 0;
            const localInventoryChangeCount = inventoryChangeHistory?.length || 0;
            let newTransactions = allTransactions;
            let removedTransactionKeys: string[] = [];
            const pendingSalesReconciliation = pendingSalesReconciliationRef.current;
            const requestedReconciliation = salesPushMode === 'reconciliation';
            const canReconcile = requestedReconciliation && !!pendingSalesReconciliation;
            const doReconciliation = canReconcile;
            const doFullSnapshotReplace = salesPushMode === 'full_snapshot' || (requestedReconciliation && !canReconcile);
            const fullSnapshotPushStartedAt = doFullSnapshotReplace ? performance.now() : 0;
            if (doReconciliation && pendingSalesReconciliation) {
                const upsertKeySet = new Set(pendingSalesReconciliation.upsertKeys);
                newTransactions = allTransactions.filter(tx => upsertKeySet.has(buildSalesCompareKey(tx)));
                removedTransactionKeys = pendingSalesReconciliation.removedKeys;
                console.log(
                    `[push] sales reconciliation mode - local total: ${localTotal}, ` +
                    `upserts: ${newTransactions.length} (added:${pendingSalesReconciliation.added}, changed:${pendingSalesReconciliation.changed}), ` +
                    `removals: ${removedTransactionKeys.length}`
                );
            } else if (!doFullSnapshotReplace) {
                const latestRes = await getLatestTransactionDate();
                if (!latestRes.success) {
                    console.error('[push] failed to get latest date for incremental mode:', latestRes.error);
                    setSyncStatus('error');
                    return;
                }
                const latestDateInDb = latestRes.latestDate;
                newTransactions = (latestRes.totalRows === 0 || !latestDateInDb)
                    ? allTransactions
                    : allTransactions.filter(tx => {
                        const txDate = (tx.date || '').split('T')[0];
                        return txDate >= latestDateInDb;
                    });
                console.log(`[push] sales incremental mode - local total: ${localTotal}, sending: ${newTransactions.length} from ${latestDateInDb || 'start'}`);
            } else {
                if (requestedReconciliation && !pendingSalesReconciliation) {
                    console.warn('[push] reconciliation requested but no plan is available; falling back to full snapshot replace');
                }
                console.log(`[push] sales snapshot replace - local total: ${localTotal}, sending full snapshot: ${newTransactions.length}`);
            }
            console.log(
                `[push] local snapshot counts - promotions:${localPromotionCount}, refunds:${localRefundCount}, ` +
                `priceChanges:${localPriceChangeCount}, costChanges:${localCostChangeCount}, inventoryChanges:${localInventoryChangeCount}`
            );

            // Step 3: Calculate total chunks for progress
            const CHUNK_SIZE = doFullSnapshotReplace || doReconciliation ? 500 : 50;
            const txChunks: typeof newTransactions[] = [];
            for (let i = 0; i < newTransactions.length; i += CHUNK_SIZE) {
                txChunks.push(newTransactions.slice(i, i + CHUNK_SIZE));
            }
            const DELETE_CHUNK_SIZE = 1000;
            const deleteChunks: string[][] = [];
            for (let i = 0; i < removedTransactionKeys.length; i += DELETE_CHUNK_SIZE) {
                deleteChunks.push(removedTransactionKeys.slice(i, i + DELETE_CHUNK_SIZE));
            }
            const totalSteps = doFullSnapshotReplace
                ? txChunks.length + 3
                : doReconciliation
                    ? txChunks.length + deleteChunks.length + 1
                    : txChunks.length + 1;
            setPushTotal(totalSteps);
            setPushProgress(0);

            if (doFullSnapshotReplace) {
                replaceUploadId = `tx-replace-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
                const beginReplaceStartedAt = performance.now();
                const beginReplaceRes = await fetch('/.netlify/functions/db-push-transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        password: storedAdminPassword,
                        action: 'begin_replace',
                        uploadId: replaceUploadId,
                        totalChunks: txChunks.length
                    })
                });
                const beginReplaceData = await beginReplaceRes.json();
                console.log('[push][sales-full][begin_replace]', {
                    uploadId: replaceUploadId,
                    totalChunks: txChunks.length,
                    elapsedMs: Number((performance.now() - beginReplaceStartedAt).toFixed(1))
                });
                if (!beginReplaceData.success) {
                    console.error('[push][sales-full][begin_replace][error]', {
                        status: beginReplaceRes.status,
                        payload: beginReplaceData
                    });
                    setSyncStatus('error');
                    return;
                }
                replaceSessionStarted = true;
                setPushProgress(1);
            }

            // Step 6: Push transaction chunks with progress
            for (let i = 0; i < txChunks.length; i++) {
                const chunkStartedAt = performance.now();
                const res = await fetch('/.netlify/functions/db-push-transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        password: storedAdminPassword,
                        action: doFullSnapshotReplace ? 'upload_replace_chunk' : (doReconciliation ? 'reconcile_upsert' : undefined),
                        uploadId: doFullSnapshotReplace ? replaceUploadId : undefined,
                        transactions: txChunks[i],
                        chunkIndex: i,
                        totalChunks: txChunks.length
                    })
                });
                const data = await res.json();
                if (!data.success) {
                    console.error(doFullSnapshotReplace ? '[push][sales-full][chunk][error]' : '[push][sales-reconcile][upsert][error]', {
                        status: res.status,
                        uploadId: replaceUploadId,
                        chunkIndex: i + 1,
                        totalChunks: txChunks.length,
                        rows: txChunks[i].length,
                        payload: data
                    });
                    if (doFullSnapshotReplace && replaceSessionStarted && replaceUploadId) {
                        await fetch('/.netlify/functions/db-push-transactions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                password: storedAdminPassword,
                                action: 'abort_replace',
                                uploadId: replaceUploadId
                            })
                        });
                    }
                    setSyncStatus('error');
                    return;
                }
                const elapsedMs = performance.now() - chunkStartedAt;
                const rowCount = txChunks[i].length;
                const rowsPerSecond = elapsedMs > 0 ? (rowCount / elapsedMs) * 1000 : 0;
                if (doFullSnapshotReplace) {
                    console.log('[push][sales-full][chunk]', {
                        uploadId: replaceUploadId,
                        chunkIndex: i + 1,
                        totalChunks: txChunks.length,
                        rows: rowCount,
                        elapsedMs: Number(elapsedMs.toFixed(1)),
                        rowsPerSecond: Number(rowsPerSecond.toFixed(1))
                    });
                } else if (doReconciliation) {
                    console.log('[push][sales-reconcile][upsert]', {
                        chunkIndex: i + 1,
                        totalChunks: txChunks.length,
                        rows: rowCount,
                        elapsedMs: Number(elapsedMs.toFixed(1)),
                        rowsPerSecond: Number(rowsPerSecond.toFixed(1))
                    });
                }
                setPushProgress(i + (doFullSnapshotReplace ? 2 : 1));
            }

            if (doFullSnapshotReplace) {
                const finalizeReplaceStartedAt = performance.now();
                const finalizeReplaceRes = await fetch('/.netlify/functions/db-push-transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        password: storedAdminPassword,
                        action: 'finalize_replace',
                        uploadId: replaceUploadId
                    })
                });
                const finalizeReplaceData = await finalizeReplaceRes.json();
                const finalizeElapsedMs = performance.now() - finalizeReplaceStartedAt;
                const totalElapsedMs = performance.now() - fullSnapshotPushStartedAt;
                console.log('[push][sales-full][finalize_replace]', {
                    uploadId: replaceUploadId,
                    elapsedMs: Number(finalizeElapsedMs.toFixed(1)),
                    totalElapsedMs: Number(totalElapsedMs.toFixed(1)),
                    totalRows: newTransactions.length,
                    overallRowsPerSecond: Number((totalElapsedMs > 0 ? (newTransactions.length / totalElapsedMs) * 1000 : 0).toFixed(1))
                });
                if (!finalizeReplaceData.success) {
                    console.error('[push][sales-full][finalize_replace][error]', {
                        status: finalizeReplaceRes.status,
                        payload: finalizeReplaceData
                    });
                    if (replaceSessionStarted && replaceUploadId) {
                        await fetch('/.netlify/functions/db-push-transactions', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                password: storedAdminPassword,
                                action: 'abort_replace',
                                uploadId: replaceUploadId
                            })
                        });
                    }
                    setSyncStatus('error');
                    return;
                }
                replaceSessionStarted = false;
                setPushProgress(txChunks.length + 2);
            }

            if (doReconciliation) {
                for (let i = 0; i < deleteChunks.length; i++) {
                    const deleteStartedAt = performance.now();
                    const res = await fetch('/.netlify/functions/db-push-transactions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            password: storedAdminPassword,
                            action: 'reconcile_delete',
                            removedKeys: deleteChunks[i],
                            chunkIndex: i,
                            totalChunks: deleteChunks.length
                        })
                    });
                    const data = await res.json();
                    if (!data.success) {
                        console.error('[push][sales-reconcile][delete][error]', {
                            status: res.status,
                            chunkIndex: i + 1,
                            totalChunks: deleteChunks.length,
                            rows: deleteChunks[i].length,
                            payload: data
                        });
                        setSyncStatus('error');
                        return;
                    }
                    const elapsedMs = performance.now() - deleteStartedAt;
                    console.log('[push][sales-reconcile][delete]', {
                        chunkIndex: i + 1,
                        totalChunks: deleteChunks.length,
                        rows: deleteChunks[i].length,
                        elapsedMs: Number(elapsedMs.toFixed(1))
                    });
                    setPushProgress(txChunks.length + i + 1);
                }
            }

            console.log(
                doReconciliation
                    ? `[push] reconciliation complete  -  upserted ${newTransactions.length} rows, deleted ${removedTransactionKeys.length} rows`
                    : `[push] complete  -  pushed ${newTransactions.length} transactions`
            );

            // Push refunds as authoritative snapshot (full replace).
            // ERP files can amend/remove prior rows, so delta-only upsert is not sufficient.
            const localRefunds = refundHistory || [];
            console.log(`[push] refunds snapshot replace - local rows: ${localRefunds.length}`);
            const refundPushRes = await pushRefundsAndShipments(
                storedAdminPassword,
                localRefunds,
                [],
                true
            );
            if (!refundPushRes.success) {
                console.error('[push] refunds error:', refundPushRes.error);
                setSyncStatus('error');
                return;
            }
            console.log(`[push] refunds pushed`);

            // Push promotions to separate table (delta only: new/changed rows by id+signature)
            if ((promotions?.length || 0) === 0) {
                console.error('[push] blocked: local promotions list is empty. Refusing to push empty promotions payload.');
                setSyncStatus('error');
                return;
            }
            const normalizedPromotionsForPush = normalizePromotionStatuses(promotions || []);
            let promotionsToPush = normalizedPromotionsForPush;
            const promoSigRes = await pullPromotionSignatures();
            if (promoSigRes.success && Array.isArray(promoSigRes.signatures)) {
                const remoteSigMap = new Map(promoSigRes.signatures.map((s: any) => [String(s.id), String(s.rowHash)]));
                promotionsToPush = normalizedPromotionsForPush.filter((promo: any) => {
                    const id = String(promo?.id || '').trim();
                    if (!id) return false;
                    return remoteSigMap.get(id) !== buildPromotionSignature(promo);
                });
                console.log(`[push] promotions local: ${normalizedPromotionsForPush.length}, changed/new: ${promotionsToPush.length}`);
            } else {
                console.warn('[push] promotions signature check failed, falling back to full promotions push');
                console.log(`[push] promotions local: ${normalizedPromotionsForPush.length}, changed/new: ${normalizedPromotionsForPush.length}`);
            }
            if (promotionsToPush.length > 0) {
                const promoPushRes = await pushPromotions(
                    storedAdminPassword,
                    promotionsToPush
                );
                if (!promoPushRes.success) {
                    console.error('[push] promotions push failed:', promoPushRes.error);
                    setSyncStatus('error');
                    return;
                }
            }
            console.log(`[push] promotions pushed  -  ${promotionsToPush.length} campaigns`);

            // Push ad campaign data to separate table
            const adPushRes = await pushAdData(
                storedAdminPassword,
                adSnapshots || [],
                adRosterChanges || [],
                adBudgets || {}
            );
            if (!adPushRes.success) {
                console.warn('[push] ad data push failed (non-fatal):', adPushRes.error);
            } else {
                console.log(`[push] ad data pushed  -  ${adSnapshots?.length || 0} snapshots`);
            }

            // Push master snapshot only after row-level tables succeed.
            const snapshotPayload = getSharedSnapshot();
            if (issueImportantRefresh) {
                const token = `important-refresh-${Date.now()}`;
                (snapshotPayload as any).sync_control = { forceFullPullToken: token };
                console.log(`[push] important refresh token issued: ${token}`);
            }
            const masterRes = await pushSnapshot(
                storedAdminPassword,
                snapshotPayload
            );
            if (!masterRes.success) { setSyncStatus('error'); return; }
            setPushProgress(totalSteps);

            setPushProgress(0);
            setPushTotal(0);
            pendingSalesReconciliationRef.current = null;
            setIsDirty(false);
            setShowSaveToast(true);
            setTimeout(() => setShowSaveToast(false), 3000);
            setSyncStatus('idle');

            // Keep local cache after push; clients rely on version checks + incremental pulls.
            // Clearing cache here forces expensive full transaction re-downloads.
            console.log('[push] cache preserved  -  next sync can stay incremental');
        } catch (e) {
            if (replaceSessionStarted && replaceUploadId) {
                try {
                    await fetch('/.netlify/functions/db-push-transactions', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            password: storedAdminPassword,
                            action: 'abort_replace',
                            uploadId: replaceUploadId
                        })
                    });
                } catch {
                    /* ignore abort cleanup failures */
                }
            }
            console.error('[push] error:', e);
            setSyncStatus('error');
            setPushProgress(0);
            setPushTotal(0);
        }
    }, [isAdminMode, storedAdminPassword, getSharedSnapshot,
        salesHistory, refundHistory, promotions, adSnapshots, adRosterChanges, adBudgets,
        priceChangeHistory, costChangeHistory, inventoryChangeHistory, salesPushMode]);

    // Dirty-tracking wrappers
    // These replace the raw setters exported to consumers so that any in-app
    // edit (new promotion, saved template, rule change, etc.) automatically
    // marks the app dirty and prompts a DB push  -  same as file uploads do.
    const updatePromotions = useCallback((v: React.SetStateAction<PromotionEvent[]>) => {
        localStorage.removeItem(PROMO_CURSOR_KEY);
        localStorage.removeItem(PROMO_BASELINE_COMPLETE_KEY);
        setPromotions(prev => {
            const nextRaw = typeof v === 'function' ? (v as (prev: PromotionEvent[]) => PromotionEvent[])(prev) : v;
            return normalizePromotionStatuses(nextRaw || []);
        });
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode]);

    const updateInventoryTemplates = useCallback((v: React.SetStateAction<InventoryTemplate[]>) => {
        setInventoryTemplates(v);
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode]);

    const updateCustomReportPresets = useCallback((v: React.SetStateAction<ReportLayout[]>) => {
        setCustomReportPresets(v);
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode]);

    const updatePricingRules = useCallback((v: React.SetStateAction<PricingRules>) => {
        setPricingRules(v);
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode]);

    const updateLogisticsRules = useCallback((v: React.SetStateAction<LogisticsRule[]>) => {
        setLogisticsRules(v);
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode]);

    const updateStrategyRules = useCallback((v: React.SetStateAction<StrategyConfig>) => {
        setStrategyRules(v);
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode]);

    const updateSearchConfig = useCallback((v: React.SetStateAction<SearchConfig>) => {
        setSearchConfig(v);
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode]);

    const updateSkuFamilies = useCallback((v: React.SetStateAction<SkuFamily[]>) => {
        setSkuFamilies(v);
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode]);

    const updateAdGroups = useCallback((v: React.SetStateAction<AdGroup[]>) => {
        setAdGroups(v);
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode]);

    const updateLearnedAliases = useCallback((v: React.SetStateAction<Record<string, string>>) => {
        setLearnedAliases(v);
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode]);

    const updateFreightRates = useCallback((v: React.SetStateAction<FreightRate[]>) => {
        setFreightRates(v);
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode]);


    return {
        t,
        products,
        setProducts,
        salesHistory,
        setSalesHistory,
        refundHistory,
        setRefundHistory,
        freightRates,
        setFreightRates: updateFreightRates,
        handleFreightRatesUpload,
        isFreightModalOpen,
        setIsFreightModalOpen,
        priceChangeHistory,
        setPriceChangeHistory,
        costChangeHistory,
        setCostChangeHistory,
        inventoryChangeHistory,
        setInventoryChangeHistory,
        promotions,
        setPromotions: updatePromotions,
        learnedAliases,
        setLearnedAliases: updateLearnedAliases,
        inventoryTemplates,
        setInventoryTemplates: updateInventoryTemplates,
        customReportPresets,
        setCustomReportPresets: updateCustomReportPresets,
        priceCheckTemplates,
        handleSavePriceCheckTemplates,
        pricingRules,
        setPricingRules: updatePricingRules,
        logisticsRules,
        setLogisticsRules: updateLogisticsRules,
        strategyRules,
        setStrategyRules: updateStrategyRules,
        searchConfig,
        setSearchConfig: updateSearchConfig,
        skuFamilies,
        setSkuFamilies: updateSkuFamilies,
        adGroups,
        setAdGroups: updateAdGroups,
        onSyncFromFamilies,
        onAddAdGroup,
        onEditAdGroup,
        onRemoveAdGroup,
        handleAdGroupSave,
        lastRecalculationSummary,
        pendingFamilySuggestions,
        setPendingFamilySuggestions,
        brandMap,
        setBrandMap,
        handleSaveBrandMap,
        categoryMap,
        setCategoryMap,
        handleSaveCategoryMap,
        uploadTimestamps,
        thresholds,
        velocityLookback,
        setVelocityLookback,
        userProfile,
        setUserProfile,
        showBackToTop,
        mainContentRef,
        fileRestoreRef,
        selectedElasticityProduct,
        setSelectedElasticityProduct,
        isUploadModalOpen,
        setIsUploadModalOpen,
        isSalesImportModalOpen,
        setIsSalesImportModalOpen,
        isCostUploadModalOpen,
        setIsCostUploadModalOpen,
        isSkuDetailModalOpen,
        setIsSkuDetailModalOpen,
        isMappingModalOpen,
        setIsMappingModalOpen,
        isReturnsModalOpen,
        setIsReturnsModalOpen,
        isCAUploadModalOpen,
        setIsCAUploadModalOpen,
        isShipmentModalOpen,
        setIsShipmentModalOpen,
        selectedAnalysisProduct,
        setSelectedAnalysisProduct,
        analysisResult,
        setAnalysisResult,
        isAnalysisLoading,
        isSearchLoading,
        searchSessions,
        setSearchSessions,
        activeSearchId,
        setActiveSearchId,
        currentView,
        setCurrentView,
        navigationIntent,
        navigateToEntity,
        clearNavigationIntent,
        isOnline,
        isFreshnessExpanded,
        setIsFreshnessExpanded,
        mapJumpState,
        setMapJumpState,
        priceHistoryMap,
        existingOrders,
        dynamicDateLabels,
        ambientRgb,
        handleRefreshThresholds,
        handleRecalculateVelocity,
        handleSearch,
        handleDeepDiveRequest,
        handleManualPriceChange,
        handleManualCostChange,
        handleAnalyzeCarrier,
        handleRefineSearch,
        deleteSearchSession,
        handleViewElasticity,
        handleAnalyze,
        handleApplyPrice,
        handleBackup,
        handleRestore,
        handleResetRefunds,
        handleUpdatePriceChangeRecord,
        handleUpdateCostChangeRecord,
        handleUpdateInventoryChangeRecord,
        handleSalesImportConfirm,
        handleInventoryImport,
        handleResetSalesData,
        handleSkuDetailImport,
        handleMappingImport,
        handleReturnsImport,
        handleCAImport,
        handleDescriptionImport,
        handleStampLandedAt,
        handleShipmentImport,
        // DB Sync
        isAdminMode,
        adminSessionActive,
        isDirty,
        syncStatus,
        lastSyncedAt,
        showSaveToast,
        pendingFamilyConflicts,
        pushProgress,
        pushTotal,
        syncStep,
        syncProgress,
        syncTotal,
        startupChoicePending,
        startupSyncMode,
        postApplySource,
        isRestoring,
        handleAdminToggle,
        handleAdminExit,
        handleAdminPush,
        handleSync,
        handleStartSyncNow,
        handleStartLocalOnly,
        resolveConflicts,
        getSharedSnapshot,
        // Ad Campaign
        adSnapshots,
        adRosterChanges,
        adBudgets,
        handleAdCampaignImport,
        handleAdRosterChange,
        // Optimal Pricing
        cohortSnapshot,
        setCohortSnapshot,
        optimalPriceResults,
        benchmarkUpdateNotices,
        benchmarkRecalcState,
        handleRecalculateBenchmarks,
        handleCancelBenchmarkRecalculation,
        handleDismissBenchmarkRecalcState,
    };
};



