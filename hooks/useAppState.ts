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
    AdCampaignState,
    PricingRules,
    PriceLog,
    PromotionEvent,
    UserProfile as UserProfileType,
    LogisticsRule,
    FreightRate,
    StrategyConfig,
    VelocityLookback,
    RefundLog,
    HistoryPayload,
    PriceChangeRecord,
    AnalysisResult,
    SearchChip,
    SearchConfig,
    SkuCostDetail,
    InventoryTemplate,
    PriceCheckTemplate,
    SearchSession,
    CostChangeRecord,
    InventoryChangeRecord,
    AttributeMap,
    SkuFamily,
    AdGroup
} from '../types';
import { analyzePriceAdjustment, parseSearchQuery, SearchIntent } from '../services/geminiService';
import { processDataForSearch } from '../services/searchExecution';
import { getThresholdConfig, ThresholdConfig, saveThresholdConfig } from '../services/thresholdsConfig';
import { migrateRestoredDatabase, auditRestoredDatabase } from '../services/migrationService';
import { normalizeRestoredState } from '../services/restoreSanitizer';
import { hexToRgb, extractFirstHex } from '../utils/color';
import { getCanonicalSku, buildCanonicalResolver, CANONICAL_MAP } from '../services/skuNormalization';
import {
    calculateOptimalPrice,
    buildPriceEras,
    buildPricePoints,
    isEligibleTransaction,
    tagTransactionSource,
    assignTransactionToEra,
} from '../services/optimalPriceEngine';
import {
    computeAllCohortStats,
    detectBenchmarkShifts,
    detectBenchmarkUpdateNeeded,
} from '../services/cohortAnalysis';
import type { CohortShiftWarning } from '../services/cohortAnalysis';
import type { CohortSnapshot, OptimalPriceResult, BenchmarkUpdateNotice, PricePoint } from '../types';
import { resolveEffectiveVelocity, toNumber } from '../services/metrics';
import { asDateKey, getTodayKeyMelbourne } from '../services/dateUtils';
import { resolveAttribute } from '../services/mappingService';
import { redistributeAdSpend } from '../services/adSpreadService';
import {
    verifyPassword, pushSnapshot, pullSnapshot,
    pullSnapshotIfUpdated,
    pushTransactions, pullTransactions, getLatestTransactionDate,
    pullTransactionPage, pullTransactionPageSince, checkVersion,
    pushRefundsAndShipments, pullRefundsAndShipments,
    pushAdData, pullAdData,
    pushPromotions, pullPromotions
} from '../services/dbService';
import { saveToCache, loadFromCache, clearCache, getCachedVersion } from '../services/localCache';

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

type BenchmarkRecalcMode = 'incremental' | 'full';
type BenchmarkRecalcStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
type BenchmarkRecalcStage = 'IDLE' | 'PREPARING' | 'REBUILDING_COHORTS' | 'CALCULATING_OPTIMAL_PRICES' | 'FINALIZING';

interface BenchmarkRecalcState {
    status: BenchmarkRecalcStatus;
    stage: BenchmarkRecalcStage;
    mode: BenchmarkRecalcMode;
    processed: number;
    total: number;
    elapsedMs: number;
    startedAt: string | null;
    completedAt: string | null;
    summary: string;
}

interface RecalculateBenchmarkOptions {
    mode?: BenchmarkRecalcMode;
    categories?: string[];
}

const BENCHMARK_IDLE_STATE: BenchmarkRecalcState = {
    status: 'idle',
    stage: 'IDLE',
    mode: 'incremental',
    processed: 0,
    total: 0,
    elapsedMs: 0,
    startedAt: null,
    completedAt: null,
    summary: '',
};

export const useAppState = () => {
    const { t } = useTranslation();

    const [isDataLoaded, setIsDataLoaded] = useState(false);
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
    const [priceCheckTemplates, setPriceCheckTemplates] = useState<PriceCheckTemplate[]>(() => {
        try { return JSON.parse(localStorage.getItem('sello_price_check_templates') || '[]'); } catch { return []; }
    });
    const handleSavePriceCheckTemplates = (templates: PriceCheckTemplate[]) => {
        setPriceCheckTemplates(templates);
        try { localStorage.setItem('sello_price_check_templates', JSON.stringify(templates)); } catch {}
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
    const [benchmarkRecalcState, setBenchmarkRecalcState] = useState<BenchmarkRecalcState>(BENCHMARK_IDLE_STATE);
    const benchmarkRunRef = useRef<{ id: number; cancelled: boolean; running: boolean }>({ id: 0, cancelled: false, running: false });

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
        const loadDatabase = async () => {
            setIsDataLoaded(true);
        };
        loadDatabase();

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

    const [selectedElasticityProduct, setSelectedElasticityProduct] = useState<Product | null>(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isSalesImportModalOpen, setIsSalesImportModalOpen] = useState(false);
    const [isCostUploadModalOpen, setIsCostUploadModalOpen] = useState(false);
    const [isSkuDetailModalOpen, setIsSkuDetailModalOpen] = useState(false);
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);
    const [isCAUploadModalOpen, setIsCAUploadModalOpen] = useState(false);
    const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
    const [selectedAnalysisProduct, setSelectedAnalysisProduct] = useState<Product | null>(null);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
    const [isSearchLoading, setIsSearchLoading] = useState(false);
    const [searchSessions, setSearchSessions] = useState<SearchSession[]>([]);
    const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
    const [currentView, setCurrentView] = useState<'overview' | 'strategy' | 'products' | 'platforms' | 'settings' | 'costs' | 'definitions' | 'promotions' | 'tools' | 'search' | 'custom-report' | 'family-groups'>('overview');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isFreshnessExpanded, setIsFreshnessExpanded] = useState(false);
    const [mapJumpState, setMapJumpState] = useState<{ carrier: string, metric: 'RETURN_RATE' | 'REVENUE' | 'PROFIT' | 'MARGIN' | 'TACOS' } | null>(null);

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
    }, [products, salesHistory, velocityLookback, pricingRules, brandMap, categoryMap]);

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
        let rawText = "";
        if (typeof queryOrChips === 'string') { rawText = queryOrChips; }
        else { const chips = queryOrChips; const metrics = chips.filter(c => c.type === 'METRIC').map(c => c.label).join(' '); const conditions = chips.filter(c => c.type === 'CONDITION').map(c => c.label).join(' '); const platforms = chips.filter(c => c.type === 'PLATFORM').map(c => `on ${c.label}`).join(' '); const text = chips.filter(c => c.type === 'TEXT').map(c => c.value).join(' '); const time = chips.filter(c => c.type === 'TIME').map(c => c.label).join(' '); rawText = `${time} ${conditions} ${metrics} ${platforms} ${text}`.trim(); }

        const cleanQuery = rawText.replace(/^SKU:\s*/i, '').trim();
        const normalizedQuery = cleanQuery.toLowerCase();

        const directMatch = products.find(p => {
            if (!p) return false;
            if (p.sku.toLowerCase() === normalizedQuery) return true;
            return (p.channels || []).some(c => c.skuAlias && c.skuAlias.split(',').some(a => a.trim().toLowerCase() === normalizedQuery));
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
            const { results, timeLabel } = processDataForSearch(intent, products, salesHistory, pricingRules, refundHistory);
            const newSession: SearchSession = { id: `search-${Date.now()}`, query: rawText, results: results || [], params: intent, explanation: intent.explanation, timeLabel: timeLabel, timestamp: Date.now() };
            setSearchSessions(prev => [newSession, ...(prev || [])]); setActiveSearchId(newSession.id); setCurrentView('search');
        } catch (e) { console.error("Search failed", e); } finally { setIsSearchLoading(false); }
    }, [products, salesHistory, pricingRules, refundHistory]);

    const handleDeepDiveRequest = useCallback((sku: string) => { handleSearch(`SKU: ${sku}`); }, [handleSearch]);

    const handleManualPriceChange = useCallback((data: Omit<PriceChangeRecord, 'id' | 'changeType' | 'percentChange'>) => {
        const { sku, productName, date, oldPrice, newPrice } = data;
        const changeType = newPrice > oldPrice ? 'INCREASE' : 'DECREASE';
        const percentChange = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : (newPrice > 0 ? 100 : 0);
        const newRecord: PriceChangeRecord = { id: `manual-${Date.now()}-${sku}`, sku, productName, date, oldPrice, newPrice, changeType, percentChange };
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
        setMapJumpState({ carrier, metric: 'RETURN_RATE' });
        setCurrentView('overview');
    }, []);

    const handleRefineSearch = useCallback((sessionId: string, newIntent: SearchIntent) => { setIsSearchLoading(true); setTimeout(() => { const { results, timeLabel } = processDataForSearch(newIntent, products, salesHistory, pricingRules, refundHistory); setSearchSessions(prev => (prev || []).map(s => { if (s.id === sessionId) { return { ...s, results, params: newIntent, timeLabel }; } return s; })); setIsSearchLoading(false); }, 150); }, [products, salesHistory, pricingRules, refundHistory]);
    const deleteSearchSession = useCallback((id: string, e: React.MouseEvent) => { e.stopPropagation(); setSearchSessions(prev => (prev || []).filter(s => s.id !== id)); if (activeSearchId === id) { setActiveSearchId(null); setCurrentView('overview'); } }, [activeSearchId]);
    const handleViewElasticity = useCallback((product: Product) => { setSelectedElasticityProduct(product); }, []);
    const handleAnalyze = useCallback(async (product: Product, context?: string) => { const platformName = product.platform || (product.channels && product.channels.length > 0 ? product.channels[0].platform : 'General'); const platformRule = pricingRules[platformName] || { markup: 0, commission: 15, manager: 'General', isExcluded: false }; setSelectedAnalysisProduct(product); setAnalysisResult(null); setIsAnalysisLoading(true); try { const result = await analyzePriceAdjustment(product, platformRule, context, thresholds); setAnalysisResult(result); } catch (error) { console.error("Analysis failed in App:", error); } finally { setIsAnalysisLoading(false); } }, [pricingRules, thresholds]);
    const handleApplyPrice = useCallback((productId: string, newPrice: number) => { setProducts(prev => { const productToUpdate = (prev || []).find(p => p.id === productId); if (!productToUpdate) return prev; const oldPrice = productToUpdate.caPrice || (productToUpdate.currentPrice * VAT_MULTIPLIER); const change: PriceChangeRecord = { id: `chg-${Date.now()}-${productToUpdate.sku}`, sku: productToUpdate.sku, productName: productToUpdate.name, date: new Date().toISOString().split('T')[0], oldPrice: oldPrice, newPrice: newPrice, changeType: newPrice > oldPrice ? 'INCREASE' : 'DECREASE', percentChange: oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 100 }; setPriceChangeHistory(prevHistory => [...(prevHistory || []), change]); return prev.map(p => { if (p.id !== productId) return p; return { ...p, caPrice: newPrice, lastUpdated: new Date().toISOString().split('T')[0] }; }); }); setSelectedAnalysisProduct(null); setAnalysisResult(null); }, []);

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

        if (isAdminMode) setIsDirty(true);
        return summary;
    }, [salesHistory, products, velocityLookback, pricingRules, brandMap, categoryMap, isAdminMode]);

    const getSharedSnapshot = useCallback(() => ({
        products,
        priceChangeHistory,
        costChangeHistory,
        inventoryChangeHistory,
        learnedAliases,
        pricingRules,
        logisticsRules,
        strategyRules,
        searchConfig,
        thresholds,
        brandMap,
        categoryMap,
        skuFamilies,
        adGroups,
        inventoryTemplates,
        priceCheckTemplates,
        freightRates,
        cohortSnapshot: cohortSnapshot ? {
            ...cohortSnapshot,
            categoryBuckets: Object.fromEntries(cohortSnapshot.categoryBuckets),
            cohortStats: Object.fromEntries(cohortSnapshot.cohortStats),
            skuAssignments: Object.fromEntries(cohortSnapshot.skuAssignments),
        } : null,
        optimalPriceResults: Object.fromEntries(optimalPriceResults),
        benchmarkUpdateNotices,
    }), [products, priceChangeHistory, costChangeHistory,
        inventoryChangeHistory, learnedAliases,
        pricingRules, logisticsRules, strategyRules, searchConfig,
        thresholds, brandMap, categoryMap, skuFamilies, adGroups,
        inventoryTemplates, priceCheckTemplates, freightRates,
        cohortSnapshot, optimalPriceResults, benchmarkUpdateNotices]);

    // --- AD CAMPAIGN HANDLERS ---
    const handleAdCampaignImport = useCallback((snapshot: AdSnapshot, updatedBudgets: Record<string, number>) => {
        setAdSnapshots(prev => {
            // Replace if same week+platform exists, otherwise prepend
            const filtered = prev.filter(s => !(s.platform === snapshot.platform && s.weekStartDate === snapshot.weekStartDate));
            const next = [snapshot, ...filtered];
            try { localStorage.setItem('sello_ad_snapshots', JSON.stringify(next)); } catch {}
            return next;
        });
        setAdBudgets(updatedBudgets);
        try { localStorage.setItem('sello_ad_budgets', JSON.stringify(updatedBudgets)); } catch {}
    }, []);

    const handleAdRosterChange = useCallback((change: AdRosterChange) => {
        setAdRosterChanges(prev => {
            const next = [change, ...prev];
            try { localStorage.setItem('sello_ad_roster_changes', JSON.stringify(next)); } catch {}
            return next;
        });
    }, []);

    const handleBackup = useCallback(() => {
        const normalizedPromotions = normalizePromotionStatuses(promotions || []);
        const data = {
            ...getSharedSnapshot(),
            promotions: normalizedPromotions,
            priceHistory: salesHistory,
            refundHistory,
            velocityLookback,
            userProfile,
            uploadTimestamps,
            exportDate: new Date().toISOString()
        };
        const blob = new Blob(
            [JSON.stringify(data, null, 2)],
            { type: 'application/json' }
        );
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sello_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [getSharedSnapshot, salesHistory, refundHistory,
        promotions,
        velocityLookback, userProfile,
        uploadTimestamps]);

    const handleRestore = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const rawJson = JSON.parse(event.target?.result as string);
                const safeJson = normalizeRestoredState(rawJson);
                const migrated = migrateRestoredDatabase(safeJson);
                const report = auditRestoredDatabase(migrated);
                if (report.hasFatal) {
                    console.error('[RESTORE AUDIT FAIL]', report);
                    alert("Restore file contains invalid structure. Check console for details.");
                    if (fileRestoreRef.current) fileRestoreRef.current.value = '';
                    return;
                }
                const hasThresholds = rawJson && typeof rawJson === 'object' && 'thresholds' in rawJson;
                const hasVelocity = rawJson && typeof rawJson === 'object' && 'velocityLookback' in rawJson;

                const restored = {
                    products: Array.isArray(migrated.products) ? migrated.products : [],
                    priceHistory: Array.isArray(migrated.priceHistory) ? migrated.priceHistory : [],
                    refundHistory: Array.isArray(migrated.refundHistory) ? migrated.refundHistory : [],
                    priceChangeHistory: Array.isArray(migrated.priceChangeHistory) ? migrated.priceChangeHistory : [],
                    costChangeHistory: Array.isArray(migrated.costChangeHistory) ? migrated.costChangeHistory : [],
                    inventoryChangeHistory: Array.isArray(migrated.inventoryChangeHistory) ? migrated.inventoryChangeHistory : [],
                    promotions: normalizePromotionStatuses(Array.isArray(migrated.promotions) ? migrated.promotions : []),
                    learnedAliases: migrated.learnedAliases && typeof migrated.learnedAliases === 'object' ? migrated.learnedAliases : {},
                    pricingRules: migrated.pricingRules || DEFAULT_PRICING_RULES,
                    logisticsRules: Array.isArray(migrated.logisticsRules) ? migrated.logisticsRules : DEFAULT_LOGISTICS_RULES,
                    strategyRules: migrated.strategyRules || DEFAULT_STRATEGY_RULES,
                    searchConfig: migrated.searchConfig || DEFAULT_SEARCH_CONFIG,
                    userProfile: migrated.userProfile && typeof migrated.userProfile === 'object' ? migrated.userProfile : {},
                    inventoryTemplates: Array.isArray(migrated.inventoryTemplates) ? migrated.inventoryTemplates : [],
                    priceCheckTemplates: Array.isArray(migrated.priceCheckTemplates) ? migrated.priceCheckTemplates : [],
                    uploadTimestamps: migrated.uploadTimestamps && typeof migrated.uploadTimestamps === 'object' ? migrated.uploadTimestamps : {},
                    thresholds: hasThresholds ? migrated.thresholds : null,
                    velocityLookback: hasVelocity ? migrated.velocityLookback : null,
                    brandMap: migrated.brandMap && typeof migrated.brandMap === 'object' ? migrated.brandMap : {},
                    categoryMap: migrated.categoryMap && typeof migrated.categoryMap === 'object' ? migrated.categoryMap : {},
                    skuFamilies: Array.isArray(migrated.skuFamilies) ? migrated.skuFamilies : [],
                    adGroups: Array.isArray(migrated.adGroups) ? migrated.adGroups : [],
                    freightRates: Array.isArray(migrated.freightRates) ? migrated.freightRates : []
                };

                // Apply restored state
                setRefundHistory(restored.refundHistory);
                setFreightRates(restored.freightRates);
                setPriceChangeHistory(restored.priceChangeHistory);
                setCostChangeHistory(restored.costChangeHistory);
                setInventoryChangeHistory(restored.inventoryChangeHistory);
                setPromotions(normalizePromotionStatuses(restored.promotions));
                setLearnedAliases(restored.learnedAliases);
                setPricingRules(restored.pricingRules);
                setLogisticsRules(restored.logisticsRules);
                setStrategyRules(restored.strategyRules);
                setSearchConfig(restored.searchConfig);
                setInventoryTemplates(restored.inventoryTemplates);
                if (Array.isArray(restored.priceCheckTemplates)) setPriceCheckTemplates(restored.priceCheckTemplates);
                setUploadTimestamps(restored.uploadTimestamps);
                setBrandMap(restored.brandMap);
                setCategoryMap(restored.categoryMap);
                setSkuFamilies(restored.skuFamilies);

                localStorage.setItem('sello_upload_timestamps', JSON.stringify(restored.uploadTimestamps));
                setUserProfile(prev => ({ ...prev, ...restored.userProfile }));

                let currentThresholds = thresholds;
                if (restored.thresholds) {
                    setThresholds(restored.thresholds);
                    saveThresholdConfig(restored.thresholds);
                    currentThresholds = restored.thresholds;
                }

                let currentVelocity = velocityLookback;
                if (restored.velocityLookback) {
                    setVelocityLookback(restored.velocityLookback);
                    localStorage.setItem('sello_velocity_setting', restored.velocityLookback);
                    currentVelocity = restored.velocityLookback;
                }

                // Recalculate everything including Ad redistribution, using freshly restored state
                handleAdGroupSave(
                    restored.adGroups,
                    restored.priceHistory,
                    restored.products,
                    restored.velocityLookback,
                    restored.pricingRules,
                    restored.brandMap,
                    restored.categoryMap
                );

                if (isAdminMode) setIsDirty(true);
                alert(t('alert_db_restore_success'));
            } catch (err) {
                console.error("Restore failed", err);
                alert(t('alert_db_restore_fail'));
            }
        };
        reader.readAsText(file);
        if (fileRestoreRef.current) fileRestoreRef.current.value = '';
    }, [t, thresholds, velocityLookback, handleAdGroupSave, isAdminMode]);

    const handleResetRefunds = useCallback(() => { setRefundHistory([]); setProducts(prev => (prev || []).map(p => ({ ...p, returnRate: 0 }))); setIsReturnsModalOpen(false); }, []);

    const handleUpdatePriceChangeRecord = useCallback((recordToUpdate: PriceChangeRecord) => { setPriceChangeHistory(prev => (prev || []).map(record => record.id === recordToUpdate.id ? { ...record, date: recordToUpdate.date } : record)); }, []);
    const handleUpdateCostChangeRecord = useCallback((recordToUpdate: CostChangeRecord) => { setCostChangeHistory(prev => (prev || []).map(record => record.id === recordToUpdate.id ? { ...record, date: recordToUpdate.date } : record)); }, []);
    const handleUpdateInventoryChangeRecord = useCallback((recordToUpdate: InventoryChangeRecord) => { setInventoryChangeHistory(prev => (prev || []).map(record => record.id === recordToUpdate.id ? { ...record, date: recordToUpdate.date } : record)); }, []);

    const handleSalesImportConfirm = useCallback((updatedProductsFromImport: Product[], newDateLabels?: { current: string, last: string }, historyPayload?: HistoryPayload[], newShipmentLogs?: any[], discoveredPlatforms?: string[], newlyLearnedAliases?: Record<string, string>) => {
        if (newlyLearnedAliases) setLearnedAliases(prev => ({ ...(prev || {}), ...newlyLearnedAliases }));
        let updatedPriceHistory = [...(salesHistory || [])];
        if (historyPayload && historyPayload.length > 0) {
            const newLogs: PriceLog[] = historyPayload.map(h => ({
                id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                sku: h.sku,
                date: h.date,
                price: h.price,
                velocity: h.velocity,
                margin: h.margin || 0,
                profit: h.profit,
                adsSpend: h.adsSpend,
                platform: h.platform,
                orderId: h.orderId,
                postcode: h.postcode,
                logisticPartner: h.logisticPartner,
                logisticService: h.logisticService,
                realPostage: h.realPostage,
                realExtraFreight: h.realExtraFreight
            }));
            const transactionKeys = new Set<string>(); const dailyActivityKeys = new Set<string>(); newLogs.forEach(l => { const d = l.date.split('T')[0]; const p = l.platform || 'General'; if (l.orderId) { transactionKeys.add(`${l.sku}|${l.orderId}`); } dailyActivityKeys.add(`${l.sku}|${d}|${p}`); });
            const keptHistory = (salesHistory || []).filter(l => { const d = l.date.split('T')[0]; const p = l.platform || 'General'; if (l.orderId) { const txKey = `${l.sku}|${l.orderId}`; if (transactionKeys.has(txKey)) return false; return true; } const dailyKey = `${l.sku}|${d}|${p}`; if (dailyActivityKeys.has(dailyKey)) return false; return true; });
            updatedPriceHistory = [...newLogs, ...keptHistory]; setSalesHistory(updatedPriceHistory);
        }
        const mergedProducts = (products || []).map(p => { const update = (updatedProductsFromImport || []).find(u => u.id === p.id); return update ? update : p; });
        const redistributed = redistributeAdSpend(updatedPriceHistory, adGroups);
        const finalProducts = recalculateProductMetrics(mergedProducts, redistributed, velocityLookback, getThresholdConfig(), pricingRules, brandMap, categoryMap);
        setSalesHistory(redistributed);
        setProducts(finalProducts);
        if (discoveredPlatforms && discoveredPlatforms.length > 0) { setPricingRules(prev => { const newRules = { ...(prev || {}) }; let changed = false; discoveredPlatforms.forEach(p => { if (!newRules[p]) { newRules[p] = { markup: 0, commission: 15, manager: 'Unassigned', color: '#6b7280', pricingControl: 'MERCHANT', feeModel: 'COMMISSION_PCT', adsEnabled: false }; changed = true; } }); return changed ? newRules : prev; }); }
        updateTimestamp('Sales'); setIsSalesImportModalOpen(false);
        if (isAdminMode) setIsDirty(true);

        // Auto-recalculate optimal prices for SKUs that received new transactions
        if (historyPayload && historyPayload.length > 0 && cohortSnapshot) {
            const todayKey = new Date().toISOString().split('T')[0];
            const resolver = buildCanonicalResolver(learnedAliases);
            const affectedSkus = new Set(historyPayload.map(tx => resolver(tx.sku)));

            setOptimalPriceResults(prev => {
                const next = new Map(prev);
                affectedSkus.forEach(canonicalSku => {
                    const product = products.find(p => resolver(p.sku) === canonicalSku);
                    if (!product) return;
                    const bucketKey = cohortSnapshot.skuAssignments.get(canonicalSku);
                    const cohort = bucketKey ? cohortSnapshot.cohortStats.get(bucketKey) : undefined;
                    if (!cohort) return;
                    const result = calculateOptimalPrice({
                        sku: product,
                        priceHistory: salesHistory,
                        priceChangeLog: priceChangeHistory,
                        promotions,
                        pricingRules,
                        cohortSnapshot,
                        learnedAliases,
                        today: todayKey,
                    });
                    next.set(canonicalSku, result);
                });
                return next;
            });

            // Detect if any categories need benchmark update
            const notices = detectBenchmarkUpdateNeeded(products, cohortSnapshot, Array.from(affectedSkus));
            if (notices.length > 0) {
                setBenchmarkUpdateNotices(prev => {
                    const merged = [...prev];
                    notices.forEach(n => {
                        const existing = merged.findIndex(m => m.category === n.category);
                        if (existing >= 0) {
                            merged[existing] = { ...merged[existing], skuCount: merged[existing].skuCount + n.skuCount };
                        } else {
                            merged.push(n);
                        }
                    });
                    return merged;
                });
            }
        }
    }, [salesHistory, products, velocityLookback, pricingRules, brandMap, categoryMap, updateTimestamp, isAdminMode,
        cohortSnapshot, learnedAliases, priceChangeHistory, promotions]);

    const handleInventoryImport = useCallback((data: any[]) => {
        const costChanges: CostChangeRecord[] = [];
        const inventoryLogs: InventoryChangeRecord[] = [];
        const reportDate = new Date().toISOString().split('T')[0];
        const timestamp = Date.now();
        const uploadBatchId = `batch-${timestamp}`;
        const aggregatedDataMap = new Map<string, any>();
        data.forEach(item => {
            const rawSku = String(item.sku || '').trim();
            if (!rawSku) return;
            const canonicalSku = getCanonicalSku(rawSku);
            const existing = aggregatedDataMap.get(canonicalSku) || {};
            Object.entries(item).forEach(([k, v]) => {
                if (v !== undefined) {
                    if (k === 'stock') existing[k] = (Number(existing.k) || 0) + Number(v);
                    else if (k === 'sku') existing[k] = canonicalSku;
                    else existing[k] = v;
                }
            });
            aggregatedDataMap.set(canonicalSku, existing);
        });
        const finalData = Array.from(aggregatedDataMap.values());
        setProducts(prev => {
            const currentThresholds = getThresholdConfig();
            const newProducts = [...(prev || [])];
            finalData.forEach(item => {
                const existingIndex = newProducts.findIndex(p => p.sku === item.sku);
                const existingProduct = existingIndex !== -1 ? newProducts[existingIndex] : null;
                if (existingProduct) {
                    const existing = { ...existingProduct };
                    if (item.stock !== undefined) {
                        const prevStock = existing.stockLevel || 0; const newStock = Number(item.stock);
                        if (newStock > prevStock) {
                            const deltaStock = newStock - prevStock; const pctIncrease = prevStock === 0 ? 1 : deltaStock / prevStock; const isSignificant = pctIncrease >= 0.05;
                            const hasMatchingShipment = (existing.shipments || []).some(s => { if (!s.eta) return false; const shipmentDate = new Date(s.eta).getTime(); const reportTime = new Date(reportDate).getTime(); return Math.abs((shipmentDate - reportTime) / (1000 * 60 * 60 * 24)) <= 7; });
                            const isStrategic = isSignificant && hasMatchingShipment;
                            inventoryLogs.push({ id: `inv-chg-${timestamp}-${item.sku}`, sku: item.sku, productName: existing.name, timestamp, date: reportDate, prevStock, newStock, deltaStock, source: "ERP_UPLOAD", uploadBatchId, isStrategic, reason: isStrategic ? "Strategic Restock" : "Routine Adjustment" });
                        }
                        existing.stockLevel = newStock;
                    }
                    if (item.cost !== undefined) {
                        const oldCost = existing.costPrice || 0; const newCost = Number(item.cost);
                        if (oldCost > 0 && Math.abs(oldCost - newCost) > 0.02) { costChanges.push({ id: `cost-chg-${Date.now()}-${item.sku}`, sku: item.sku, productName: existing.name, date: reportDate, oldCost, newCost, changeType: newCost > oldCost ? 'INCREASE' : 'DECREASE', percentChange: ((newCost - oldCost) / oldCost) * 100 }); }
                        existing.costPrice = newCost;
                    }
                    if (item.dailyAverageSales !== undefined) {
                        existing.dailyAverageSales = toNumber(item.dailyAverageSales);
                    }
                    if (item.name) existing.name = item.name;
                    if (item.brand) existing.brand = item.brand;
                    if (item.category) existing.category = item.category;
                    if (item.gradeLevel !== undefined && item.gradeLevel !== null) existing.gradeLevel = item.gradeLevel;
                    if (item.subcategory) existing.subcategory = item.subcategory;
                    if (item.agedStock !== undefined) existing.agedStockQty = item.agedStock;
                    if (item.inventoryStatus) existing.inventoryStatus = item.inventoryStatus;
                    if (item.cartonDimensions) existing.cartonDimensions = item.cartonDimensions;
                    existing.lastUpdated = reportDate;
                    newProducts[existingIndex] = existing;
                } else {
                    newProducts.push({
                        id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        sku: item.sku,
                        name: item.name || item.sku,
                        stockLevel: item.stock || 0,
                        costPrice: item.cost || 0,
                        currentPrice: 0,
                        averageDailySales: toNumber(item.dailyAverageSales),
                        leadTimeDays: 30,
                        status: 'Healthy',
                        recommendation: 'New Product',
                        daysRemaining: 999,
                        channels: [],
                        lastUpdated: reportDate,
                        category: item.category || 'Uncategorized',
                        subcategory: item.subcategory,
                        brand: item.brand,
                        dailyAverageSales: toNumber(item.dailyAverageSales),
                        gradeLevel: item.gradeLevel ?? undefined,
                        agedStockQty: item.agedStock ?? undefined,
                        inventoryStatus: item.inventoryStatus ?? undefined,
                        cartonDimensions: item.cartonDimensions ?? undefined,
                    });
                }
            });
            return recalculateProductMetrics(newProducts, priceHistoryMap, velocityLookback, currentThresholds, pricingRules, brandMap, categoryMap);
        });

        // Family Group Suggestion Step
        const prefixGroups = new Map<string, string[]>();
        data.forEach(item => {
            const sku = String(item.sku || '').trim();
            if (!sku) return;
            const parts = sku.split('-');
            if (parts.length >= 3) {
                // Strip the variant segment between the first and last hyphen groups
                const prefix = `${parts[0]}-${parts[parts.length - 1]}`;
                if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
                prefixGroups.get(prefix)!.push(sku);
            }
        });

        const newSuggestions: SkuFamily[] = [];
        prefixGroups.forEach((memberSkus, prefix) => {
            if (memberSkus.length >= 2) {
                // Check if a SkuFamily already exists that contains all these SKUs
                const alreadyExists = skuFamilies.some(f =>
                    memberSkus.every(sku => f.memberSkus.includes(sku))
                );

                if (!alreadyExists) {
                    newSuggestions.push({
                        id: `suggest-${Date.now()}-${prefix}`,
                        name: prefix,
                        memberSkus,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString()
                    });
                }
            }
        });

        if (newSuggestions.length > 0) {
            setPendingFamilySuggestions(prev => [...prev, ...newSuggestions]);
            alert(`${newSuggestions.length} new SKU family groups detected. Review them in Family Groups.`);
        }

        if (costChanges.length > 0) setCostChangeHistory(prev => [...costChanges, ...(prev || [])]);
        if (inventoryLogs.length > 0) setInventoryChangeHistory(prev => [...inventoryLogs, ...(prev || [])]);
        updateTimestamp('Inventory'); setIsUploadModalOpen(false);
        if (isAdminMode) setIsDirty(true);
    }, [priceHistoryMap, velocityLookback, pricingRules, brandMap, categoryMap, updateTimestamp, skuFamilies, isAdminMode]);

    const handleResetSalesData = useCallback(() => {
        setSalesHistory([]);
        const currentThresholds = getThresholdConfig();
        const recalculated = recalculateProductMetrics(products, [], velocityLookback, currentThresholds, pricingRules, brandMap, categoryMap);
        setProducts(recalculated);
        setIsSalesImportModalOpen(false);
    }, [products, velocityLookback, pricingRules, brandMap, categoryMap]);

    const handleSkuDetailImport = useCallback((data: { masterSku: string; detail: SkuCostDetail }[]) => {
        setProducts(prev => (prev || []).map(p => {
            const update = data.find(d => d.masterSku === p.sku);
            return update ? { ...p, costDetail: update.detail } : p;
        }));
        updateTimestamp('SKU Details');
        setIsSkuDetailModalOpen(false);
        if (isAdminMode) setIsDirty(true);
    }, [updateTimestamp, isAdminMode]);

    const handleMappingImport = useCallback((mappings: any[], mode: 'merge' | 'replace', platform: string) => {
        setProducts(prev => (prev || []).map(p => {
            const platformMappings = mappings.filter(m => m.masterSku === p.sku && m.platform === platform);
            if (platformMappings.length === 0 && mode === 'merge') return p;
            const updatedChannels = [...p.channels];
            const channelIdx = updatedChannels.findIndex(c => c.platform === platform);
            const newAliases = platformMappings.map(m => m.alias).join(', ');
            if (channelIdx >= 0) {
                const existingAliases = updatedChannels[channelIdx].skuAlias?.split(',').map(s => s.trim()).filter(Boolean) || [];
                const importedAliases = newAliases.split(',').map(s => s.trim()).filter(Boolean);
                updatedChannels[channelIdx] = { ...updatedChannels[channelIdx], skuAlias: mode === 'replace' ? newAliases : [...new Set([...existingAliases, ...importedAliases])].join(', ') };
            } else if (newAliases) {
                updatedChannels.push({ platform, manager: pricingRules[platform]?.manager || 'Unassigned', velocity: 0, skuAlias: newAliases });
            }
            return { ...p, channels: updatedChannels };
        }));
        setIsMappingModalOpen(false);
        if (isAdminMode) setIsDirty(true);
    }, [pricingRules, isAdminMode]);

    const handleReturnsImport = useCallback((newRefunds: RefundLog[]) => {
        // Deduplicate incoming records by id (deterministic hash of sku|orderId|date|amount)
        const uniqueInNew = new Map<string, RefundLog>();
        newRefunds.forEach(r => { if (!uniqueInNew.has(r.id)) uniqueInNew.set(r.id, r); });
        const deduped = Array.from(uniqueInNew.values());

        // Build sets of keys from new records to replace any matching existing records
        // Keys: generated id (exact match) OR orderId+sku (catches platform-remap cases)
        const newIds = new Set(deduped.map(r => r.id));
        const newOrderSkuKeys = new Set(deduped.map(r => `${r.orderId || ''}|${r.sku}`));

        // Keep existing records that are NOT superseded by the new upload
        const keptExisting = (refundHistory || []).filter(r => {
            if (newIds.has(r.id)) return false; // exact match — replace
            if (r.orderId && newOrderSkuKeys.has(`${r.orderId}|${r.sku}`)) return false; // same order+sku — replace
            return true;
        });

        const mergedRefunds = [...deduped, ...keptExisting];

        setRefundHistory(mergedRefunds);
        setProducts(prev => (prev || []).map(p => {
            const productRefunds = mergedRefunds.filter(r => r.sku === p.sku);
            const totalRefundQty = productRefunds.reduce((sum, r) => sum + r.quantity, 0);
            const returnRate = p.averageDailySales > 0 ? (totalRefundQty / (p.averageDailySales * 30)) * 100 : 0;
            return { ...p, returnRate };
        }));
        updateTimestamp('Refunds');
        setIsReturnsModalOpen(false);
        if (isAdminMode) setIsDirty(true);
    }, [refundHistory, updateTimestamp, isAdminMode]);

    const handleFreightRatesUpload = useCallback((rates: FreightRate[]) => {
        if (!rates || rates.length === 0) return;
        setFreightRates(rates);
        // Apply rates directly to product.postage so all profit/margin calculations use them
        setProducts(prev => (prev || []).map(p => {
            const match = rates.find(r => r.sku.toUpperCase() === p.sku.toUpperCase());
            return match ? { ...p, postage: match.rate } : p;
        }));
        updateTimestamp('FreightRates');
        if (isAdminMode) setIsDirty(true);
    }, [updateTimestamp, isAdminMode]);

    const handleCAImport = useCallback((data: { sku: string; caPrice: number; imageUrl?: string }[], reportDate: string) => {
        const changes: PriceChangeRecord[] = [];
        setProducts(prev => (prev || []).map(p => {
            const update = data.find(d => d.sku.toUpperCase() === p.sku.toUpperCase() || d.sku.toUpperCase() === p.sku.toUpperCase().replace(/[-_]UK$/i, ''));
            if (update) {
                const oldPrice = p.caPrice || (p.currentPrice * VAT_MULTIPLIER);
                if (oldPrice > 0 && Math.abs(oldPrice - update.caPrice) > 0.02) {
                    changes.push({ id: `ca-chg-${Date.now()}-${p.sku}`, sku: p.sku, productName: p.name, date: reportDate, oldPrice, newPrice: update.caPrice, changeType: update.caPrice > oldPrice ? 'INCREASE' : 'DECREASE', percentChange: ((update.caPrice - oldPrice) / oldPrice) * 100 });
                }
                return {
                    ...p,
                    caPrice: update.caPrice,
                    lastUpdated: reportDate,
                    imageUrl: update.imageUrl || p.imageUrl
                };
            }
            return p;
        }));
        if (changes.length > 0) setPriceChangeHistory(prev => [...changes, ...(prev || [])]);
        updateTimestamp('CA Prices');
        setIsCAUploadModalOpen(false);
    }, [updateTimestamp]);

    const handleShipmentImport = useCallback((updates: any[]) => {
        setProducts(prev => (prev || []).map(p => {
            const update = updates.find(u => u.sku === p.sku);
            if (update) {
                const incomingStock = update.shipments.reduce((sum: number, s: any) => sum + s.quantity, 0);
                return { ...p, shipments: update.shipments, incomingStock };
            }
            return p;
        }));
        updateTimestamp('Shipments');
        setIsShipmentModalOpen(false);
    }, [updateTimestamp]);


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

    const handleAdminPush = useCallback(async () => {
        if (!isAdminMode || !storedAdminPassword) return;
        setSyncStatus('pushing');
        setPushProgress(0);
        setPushTotal(0);
        try {
            // Step 1: Get latest date in DB
            const latestRes = await getLatestTransactionDate();
            if (!latestRes.success) {
                console.error('[push] failed to get latest date:', latestRes.error);
                setSyncStatus('error');
                return;
            }
            const latestDateInDb = latestRes.latestDate;
            const totalInDb = latestRes.totalRows;

            // Step 2: Determine which transactions to push.
            // Use row count as the primary signal — if local has more rows than DB,
            // push ALL local transactions (ON CONFLICT DO UPDATE handles deduplication).
            // Date-only filtering was unreliable: it skipped records with dates before
            // the DB's latest date that were never pushed (late imports, backdated entries).
            const allTransactions = salesHistory || [];
            const localTotal = allTransactions.length;
            const localPromotionCount = promotions?.length || 0;
            const localRefundCount = refundHistory?.length || 0;
            const localPriceChangeCount = priceChangeHistory?.length || 0;
            const localCostChangeCount = costChangeHistory?.length || 0;
            const localInventoryChangeCount = inventoryChangeHistory?.length || 0;
            // Always use date-based incremental filter — ON CONFLICT DO UPDATE deduplicates boundary rows.
            // We no longer fall back to full push when localTotal > totalInDb;
            // that triggered 70k+ row pushes every sync because local always grows faster than DB count.
            const newTransactions = (totalInDb === 0 || !latestDateInDb)
                ? allTransactions
                : allTransactions.filter(tx => {
                    const txDate = (tx.date || '').split('T')[0];
                    return txDate >= latestDateInDb;
                });

            console.log(`[push] DB has ${totalInDb} rows up to ${latestDateInDb || 'none'}`);
            console.log(`[push] local total: ${localTotal}, sending: ${newTransactions.length} (incremental from ${latestDateInDb || 'start'})`);
            console.log(
                `[push] local snapshot counts - promotions:${localPromotionCount}, refunds:${localRefundCount}, ` +
                `priceChanges:${localPriceChangeCount}, costChanges:${localCostChangeCount}, inventoryChanges:${localInventoryChangeCount}`
            );

            // Step 3: Calculate total chunks for progress
            const CHUNK_SIZE = 50;
            const txChunks: typeof newTransactions[] = [];
            for (let i = 0; i < newTransactions.length; i += CHUNK_SIZE) {
                txChunks.push(newTransactions.slice(i, i + CHUNK_SIZE));
            }
            const totalSteps = txChunks.length + 1; // +1 for master snapshot
            setPushTotal(totalSteps);
            setPushProgress(0);

            // Step 4: Push master snapshot
            const masterRes = await pushSnapshot(
                storedAdminPassword,
                getSharedSnapshot()
            );
            if (!masterRes.success) { setSyncStatus('error'); return; }
            setPushProgress(1);

            // Step 5: Push transaction chunks with progress
            for (let i = 0; i < txChunks.length; i++) {
                const res = await fetch('/.netlify/functions/db-push-transactions', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        password: storedAdminPassword,
                        transactions: txChunks[i],
                        chunkIndex: i,
                        totalChunks: txChunks.length
                    })
                });
                const data = await res.json();
                if (!data.success) {
                    console.error('[push] chunk error:', data.error);
                    setSyncStatus('error');
                    return;
                }
                setPushProgress(i + 2); // +2 because snapshot = step 1
            }

            console.log(`[push] complete — pushed ${newTransactions.length} transactions`);

            // Push refunds and shipments
            console.log(`[push] pushing ${refundHistory?.length || 0} refunds`);
            const refundPushRes = await pushRefundsAndShipments(
                storedAdminPassword,
                refundHistory || [],
                []
            );
            if (!refundPushRes.success) {
                console.error('[push] refunds error:', refundPushRes.error);
                setSyncStatus('error');
                return;
            }
            console.log(`[push] refunds pushed`);

            // Push promotions to separate table
            if ((promotions?.length || 0) === 0) {
                console.error('[push] blocked: local promotions list is empty. Refusing to push empty promotions payload.');
                setSyncStatus('error');
                return;
            }
            const normalizedPromotionsForPush = normalizePromotionStatuses(promotions || []);
            const promoPushRes = await pushPromotions(
                storedAdminPassword,
                normalizedPromotionsForPush
            );
            if (!promoPushRes.success) {
                console.error('[push] promotions push failed:', promoPushRes.error);
                setSyncStatus('error');
                return;
            }
            console.log(`[push] promotions pushed — ${promotions?.length || 0} campaigns`);

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
                console.log(`[push] ad data pushed — ${adSnapshots?.length || 0} snapshots`);
            }

            setPushProgress(0);
            setPushTotal(0);
            setIsDirty(false);
            setShowSaveToast(true);
            setTimeout(() => setShowSaveToast(false), 3000);
            setSyncStatus('idle');

            // Keep local cache after push; clients rely on version checks + incremental pulls.
            // Clearing cache here forces expensive full transaction re-downloads.
            console.log('[push] cache preserved — next sync can stay incremental');
        } catch (e) {
            console.error('[push] error:', e);
            setSyncStatus('error');
            setPushProgress(0);
            setPushTotal(0);
        }
    }, [isAdminMode, storedAdminPassword, getSharedSnapshot,
        salesHistory, refundHistory, promotions, adSnapshots, adRosterChanges, adBudgets,
        priceChangeHistory, costChangeHistory, inventoryChangeHistory]);

    const applyLoadedState = useCallback((
        snapshot: any,
        transactions: any[],
        refunds: any[] = []
    ) => {
        const safe = normalizeRestoredState(snapshot);
        const m = migrateRestoredDatabase(safe);
        const mergeHistoryById = <T extends { id?: string; date?: string }>(incoming: any, prev: T[]): T[] => {
            const prevSafe = Array.isArray(prev) ? prev : [];
            const incomingSafe = Array.isArray(incoming) ? incoming as T[] : [];
            if (incomingSafe.length === 0) return prevSafe;

            const seen = new Set<string>();
            const out: T[] = [];
            const pushUnique = (item: T) => {
                const key = item?.id || JSON.stringify(item);
                if (seen.has(key)) return;
                seen.add(key);
                out.push(item);
            };

            incomingSafe.forEach(pushUnique);
            prevSafe.forEach(pushUnique);

            return out.sort((a, b) => {
                const ad = a?.date ? new Date(a.date).getTime() : 0;
                const bd = b?.date ? new Date(b.date).getTime() : 0;
                return bd - ad;
            });
        };

        setRefundHistory(Array.isArray(refunds) ? refunds : []);
        setFreightRates(Array.isArray(m.freightRates) ? m.freightRates : []);
        setPriceChangeHistory(prev => mergeHistoryById<PriceChangeRecord>(m.priceChangeHistory, prev));
        setCostChangeHistory(prev => mergeHistoryById<CostChangeRecord>(m.costChangeHistory, prev));
        setInventoryChangeHistory(prev => mergeHistoryById<InventoryChangeRecord>(m.inventoryChangeHistory, prev));
        setLearnedAliases(m.learnedAliases || {});
        setPricingRules(m.pricingRules || DEFAULT_PRICING_RULES);
        setLogisticsRules(
            Array.isArray(m.logisticsRules) && m.logisticsRules.length > 0
                ? m.logisticsRules : DEFAULT_LOGISTICS_RULES
        );
        setStrategyRules(m.strategyRules || DEFAULT_STRATEGY_RULES);
        setSearchConfig(m.searchConfig || DEFAULT_SEARCH_CONFIG);
        setInventoryTemplates(
            Array.isArray(m.inventoryTemplates) ? m.inventoryTemplates : []
        );
        setBrandMap(m.brandMap || {});
        setCategoryMap(m.categoryMap || {});
        setSkuFamilies(Array.isArray(m.skuFamilies) ? m.skuFamilies : []);
        if (m.thresholds) {
            setThresholds(m.thresholds);
            saveThresholdConfig(m.thresholds);
        }
        const adGroupsToUse = Array.isArray(m.adGroups) ? m.adGroups : [];
        const redistributed = redistributeAdSpend(transactions, adGroupsToUse);
        setSalesHistory(redistributed);
        const finalProducts = recalculateProductMetrics(
            Array.isArray(m.products) ? m.products : [],
            redistributed,
            velocityLookback,
            m.thresholds || thresholds,
            m.pricingRules,
            m.brandMap,
            m.categoryMap
        );
        setProducts(finalProducts);
        setAdGroups(adGroupsToUse);

        // Restore optimal pricing state if present in snapshot
        if (m.cohortSnapshot) {
            const s = m.cohortSnapshot;
            setCohortSnapshot({
                ...s,
                categoryBuckets: new Map(Object.entries(s.categoryBuckets || {})),
                cohortStats: new Map(Object.entries(s.cohortStats || {})),
                skuAssignments: new Map(Object.entries(s.skuAssignments || {})),
            });
        }
        if (m.optimalPriceResults) {
            setOptimalPriceResults(new Map(Object.entries(m.optimalPriceResults)));
        }
        if (m.benchmarkUpdateNotices) {
            setBenchmarkUpdateNotices(m.benchmarkUpdateNotices);
        }
    }, [velocityLookback, thresholds]);

    const handleSync = useCallback(async () => {
        setSyncStatus('syncing');
        setSyncStep('Connecting...');
        setSyncProgress(0);
        setSyncTotal(0);
        try {
            const lastKnownSnapshotUpdatedAt = localStorage.getItem('sello_snapshot_updated_at') || undefined;
            const masterRes = await pullSnapshotIfUpdated(lastKnownSnapshotUpdatedAt);
            if (!masterRes.success) {
                setSyncStatus('error');
                setSyncStep('');
                return;
            }

            const hasSnapshotUpdate = !masterRes.unchanged;
            let incoming = hasSnapshotUpdate ? masterRes.snapshot : null;
            if (hasSnapshotUpdate && !incoming) {
                setSyncStatus('error');
                setSyncStep('');
                return;
            }

            if (hasSnapshotUpdate) {
                setSyncStep('Loading settings...');
                const incomingFamilies: SkuFamily[] =
                    Array.isArray(incoming.skuFamilies)
                        ? incoming.skuFamilies : [];
                const localFamilies = skuFamilies || [];
                const conflicts = localFamilies.filter((lf: SkuFamily) =>
                    !incomingFamilies.some((ifam: SkuFamily) => ifam.id === lf.id)
                );
                if (conflicts.length > 0) {
                    setPendingFamilyConflicts(conflicts);
                    setSyncStatus('idle');
                    setSyncStep('');
                    return;
                }
            } else {
                setSyncStep('Snapshot unchanged — checking transactions...');
                // Even when metadata says unchanged, pull full snapshot to ensure
                // history slices (price/cost/inventory changes) stay in sync locally.
                const fullSnapshotRes = await pullSnapshot();
                if (fullSnapshotRes.success && fullSnapshotRes.snapshot) {
                    incoming = fullSnapshotRes.snapshot;
                    console.log(
                        `[sync] refreshed snapshot (unchanged path) - history counts: ` +
                        `price=${Array.isArray(incoming.priceChangeHistory) ? incoming.priceChangeHistory.length : 0}, ` +
                        `cost=${Array.isArray(incoming.costChangeHistory) ? incoming.costChangeHistory.length : 0}, ` +
                        `inventory=${Array.isArray(incoming.inventoryChangeHistory) ? incoming.inventoryChangeHistory.length : 0}`
                    );
                } else {
                    console.warn('[sync] full snapshot refresh failed on unchanged path:', fullSnapshotRes.error);
                }
            }

            // Incremental pull — only fetch rows newer than what's already in local cache
            setSyncStep('Checking for new transactions...');
            const PAGE_SIZE = 2000;
            let allTransactions: PriceLog[] = [];

            // Find the newest date already cached locally
            const cachedTransactions = salesHistory || [];
            const localDates = cachedTransactions.map((t: PriceLog) => t.date).filter(Boolean).sort();
            const localNewestDate = localDates.length > 0 ? localDates[localDates.length - 1] : null;

            if (localNewestDate && cachedTransactions.length > 0) {
                // Incremental: only pull rows after the local newest date
                setSyncStep(`Checking for new data after ${localNewestDate}...`);
                const firstPage = await pullTransactionPageSince(localNewestDate, 0, PAGE_SIZE);
                if (!firstPage.success) {
                    setSyncStatus('error');
                    setSyncStep('');
                    return;
                }
                const newRows = firstPage.transactions || [];
                const totalNew = firstPage.totalRows || 0;

                if (totalNew === 0) {
                    // Nothing new — reuse local cache
                    setSyncStep('No new transactions — using cached data');
                    allTransactions = cachedTransactions;
                } else {
                    // Pull remaining pages of new rows
                    allTransactions = [...newRows];
                    const totalPages = Math.ceil(totalNew / PAGE_SIZE);
                    setSyncTotal(totalPages);
                    setSyncProgress(1);
                    setSyncStep(`Loading ${totalNew.toLocaleString()} new transactions...`);

                    let page = 1;
                    let hasMore = !!firstPage.hasMore;
                    while (hasMore && page < totalPages) {
                        const pageRes = await pullTransactionPageSince(localNewestDate, page, PAGE_SIZE);
                        if (!pageRes.success) { setSyncStatus('error'); setSyncStep(''); return; }
                        allTransactions = [...allTransactions, ...(pageRes.transactions || [])];
                        hasMore = !!pageRes.hasMore;
                        setSyncProgress(page + 1);
                        setSyncStep(`Loading new transactions... ${allTransactions.length.toLocaleString()} / ${totalNew.toLocaleString()}`);
                        page++;
                    }

                    // Merge new rows onto the front of existing cache (DB returns newest first)
                    // Deduplicate by id to avoid duplicates on the boundary date
                    const existingIds = new Set(cachedTransactions.map((t: PriceLog) => t.id).filter(Boolean));
                    const deduped = allTransactions.filter((t: PriceLog) => !t.id || !existingIds.has(t.id));
                    allTransactions = [...deduped, ...cachedTransactions];
                    setSyncStep(`Merged ${deduped.length.toLocaleString()} new rows with ${cachedTransactions.length.toLocaleString()} cached`);
                }
            } else {
                // No local cache — full pull
                setSyncStep('Loading transactions (first sync)...');
                const firstPage = await pullTransactionPage(0, PAGE_SIZE);
                if (!firstPage.success) { setSyncStatus('error'); setSyncStep(''); return; }
                const totalRows = firstPage.totalRows || 0;
                allTransactions = firstPage.transactions || [];
                const totalPages = Math.ceil(totalRows / PAGE_SIZE);
                setSyncTotal(totalPages);
                setSyncProgress(1);
                setSyncStep(`Loading transactions... ${allTransactions.length.toLocaleString()} / ${totalRows.toLocaleString()}`);

                let page = 1;
                let hasMore = !!firstPage.hasMore;
                while (hasMore && page < totalPages) {
                    const pageRes = await pullTransactionPage(page, PAGE_SIZE);
                    if (!pageRes.success) { setSyncStatus('error'); setSyncStep(''); return; }
                    allTransactions = [...allTransactions, ...(pageRes.transactions || [])];
                    hasMore = !!pageRes.hasMore;
                    setSyncProgress(page + 1);
                    setSyncStep(`Loading transactions... ${allTransactions.length.toLocaleString()} / ${totalRows.toLocaleString()}`);
                    page++;
                }
            }

            setSyncStep('Applying data...');

            // Pull refunds only
            const refundRes = await pullRefundsAndShipments();
            const keepLocalIfRemoteEmpty = <T,>(label: string, remote: any, local: T[]): T[] => {
                const remoteSafe = Array.isArray(remote) ? remote as T[] : [];
                const localSafe = Array.isArray(local) ? local : [];
                if (remoteSafe.length === 0 && localSafe.length > 0) {
                    console.warn(`[sync] ${label} pull returned empty; preserving local ${localSafe.length}`);
                    return localSafe;
                }
                return remoteSafe;
            };
            const refunds = refundRes.success
                ? keepLocalIfRemoteEmpty('refunds', refundRes.refunds || [], refundHistory || [])
                : (refundHistory || []);
            if (!refundRes.success) {
                console.warn('[sync] refunds pull failed (non-fatal):', refundRes.error);
            }

            // Pull ad campaign data from separate table
            const adRes = await pullAdData();
            if (adRes.success) {
                const nextSnapshots = keepLocalIfRemoteEmpty('ad snapshots', adRes.adSnapshots || [], adSnapshots || []);
                if (Array.isArray(nextSnapshots)) {
                    setAdSnapshots(nextSnapshots);
                    try { localStorage.setItem('sello_ad_snapshots', JSON.stringify(nextSnapshots)); } catch {}
                }
                const nextRoster = keepLocalIfRemoteEmpty('ad roster changes', adRes.adRosterChanges || [], adRosterChanges || []);
                if (Array.isArray(nextRoster)) {
                    setAdRosterChanges(nextRoster);
                    try { localStorage.setItem('sello_ad_roster_changes', JSON.stringify(nextRoster)); } catch {}
                }
                if (adRes.adBudgets && typeof adRes.adBudgets === 'object') {
                    const remoteBudgetKeys = Object.keys(adRes.adBudgets).length;
                    const localBudgetKeys = Object.keys(adBudgets || {}).length;
                    const nextBudgets = remoteBudgetKeys === 0 && localBudgetKeys > 0
                        ? adBudgets
                        : adRes.adBudgets;
                    if (remoteBudgetKeys === 0 && localBudgetKeys > 0) {
                        console.warn(`[sync] ad budgets pull returned empty; preserving local ${localBudgetKeys}`);
                    }
                    setAdBudgets(nextBudgets);
                    try { localStorage.setItem('sello_ad_budgets', JSON.stringify(nextBudgets)); } catch {}
                }
                console.log(`[sync] ad data loaded — ${(Array.isArray(adRes.adSnapshots) ? adRes.adSnapshots.length : 0)} snapshots`);
            } else {
                console.warn('[sync] ad data pull failed (non-fatal):', adRes.error);
            }

            // Pull promotions from separate table
            const promoRes = await pullPromotions();
            if (promoRes.success && Array.isArray(promoRes.promotions)) {
                const nextPromotionsRaw = keepLocalIfRemoteEmpty('promotions', promoRes.promotions, promotions || []);
                const nextPromotions = normalizePromotionStatuses(nextPromotionsRaw);
                setPromotions(nextPromotions);
                console.log(`[sync] promotions loaded — ${nextPromotions.length} campaigns`);
            } else {
                console.warn('[sync] promotions pull failed (non-fatal):', promoRes.error);
            }

            if (incoming) {
                applyLoadedState(incoming, allTransactions, refunds);
            } else {
                setRefundHistory(Array.isArray(refunds) ? refunds : []);
                const redistributed = redistributeAdSpend(allTransactions, adGroups);
                setSalesHistory(redistributed);
                const finalProducts = recalculateProductMetrics(
                    products,
                    redistributed,
                    velocityLookback,
                    thresholds,
                    pricingRules,
                    brandMap,
                    categoryMap
                );
                setProducts(finalProducts);
            }

            const time = masterRes.lastUpdatedAt || new Date().toISOString();
            localStorage.setItem('sello_snapshot_updated_at', time);
            setLastSyncedAt(time);
            localStorage.setItem('sello_last_synced_at', time);

            // Save to local cache with current version
            const versionRes = await checkVersion();
            const version = versionRes.lastPushAt || time;
            const snapshotForCache = hasSnapshotUpdate && incoming ? incoming : getSharedSnapshot();
            await saveToCache(snapshotForCache, allTransactions, refunds, [], version);

            console.log(`[sync] complete — cached version: ${version}`);
            setSyncProgress(0);
            setSyncTotal(0);
            setSyncStep('');
            setSyncStatus('idle');
        } catch (e) {
            console.error('[sync] error:', e);
            setSyncStatus('error');
            setSyncStep('');
            setSyncProgress(0);
            setSyncTotal(0);
        }
    }, [skuFamilies, velocityLookback, thresholds, applyLoadedState, adGroups, products, pricingRules, brandMap, categoryMap, getSharedSnapshot, pullSnapshot,
        refundHistory, promotions, adSnapshots, adRosterChanges, adBudgets]);

    const resolveConflicts = useCallback(async (keepLocal: boolean) => {
        const res = await pullSnapshot();
        if (!res.success || !res.snapshot) return;
        const snap = { ...res.snapshot };
        if (keepLocal) {
            snap.skuFamilies = [
                ...(Array.isArray(snap.skuFamilies) ? snap.skuFamilies : []),
                ...pendingFamilyConflicts
            ];
        }
        setPendingFamilyConflicts([]);
        await handleSync();
    }, [pendingFamilyConflicts, handleSync]);

    const initRanRef = useRef(false);

    useEffect(() => {
        if (initRanRef.current) return;
        initRanRef.current = true;

        const initApp = async () => {
            // Step 1: Check what version the DB has (fast, tiny request)
            const versionRes = await checkVersion();
            const dbVersion = versionRes.success ? versionRes.lastPushAt : null;
            const localVersion = getCachedVersion();

            console.log(`[init] DB version: ${dbVersion}, local version: ${localVersion}`);

            // Step 2: If versions match, load from local cache instantly
            if (dbVersion && localVersion && dbVersion === localVersion) {
                console.log('[init] versions match — loading from cache');
                setSyncStatus('syncing');
                const cache = await loadFromCache();
                if (cache) {
                    applyLoadedState(
                        cache.snapshot,
                        cache.transactions,
                        cache.refunds || []
                    );
                    const time = localStorage.getItem('sello_last_synced_at')
                        || cache.cachedAt;
                    setLastSyncedAt(time);
                    setSyncStatus('idle');
                    console.log('[init] loaded from cache instantly');
                    return;
                }
            }

            // Step 3: Versions don't match or no cache — full sync
            console.log('[init] syncing from database');
            handleSync();
        };

        initApp();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- OPTIMAL PRICING: RECALCULATE BENCHMARKS ---
    const handleCancelBenchmarkRecalculation = useCallback(() => {
        benchmarkRunRef.current.cancelled = true;
    }, []);

    const handleRecalculateBenchmarks = useCallback(async (options?: RecalculateBenchmarkOptions): Promise<CohortShiftWarning[]> => {
        if (benchmarkRunRef.current.running) return [];

        const mode: BenchmarkRecalcMode = options?.mode ?? 'incremental';
        const noticeCategories = (benchmarkUpdateNotices || []).map(n => n.category);
        const categoryScopeRaw = mode === 'full'
            ? (options?.categories || [])
            : ((options?.categories && options.categories.length > 0) ? options.categories : noticeCategories);
        const categoryScope = Array.from(new Set((categoryScopeRaw || []).filter(Boolean)));
        const hasScopedCategories = mode === 'full' ? true : categoryScope.length > 0;

        if (!hasScopedCategories) {
            setBenchmarkRecalcState({
                status: 'completed',
                stage: 'FINALIZING',
                mode,
                processed: 0,
                total: 0,
                elapsedMs: 0,
                startedAt: new Date().toISOString(),
                completedAt: new Date().toISOString(),
                summary: 'No categories require recalculation.',
            });
            return [];
        }

        const runId = benchmarkRunRef.current.id + 1;
        benchmarkRunRef.current.id = runId;
        benchmarkRunRef.current.cancelled = false;
        benchmarkRunRef.current.running = true;
        const startedAt = Date.now();
        const todayKey = new Date().toISOString().split('T')[0];
        const resolver = buildCanonicalResolver(learnedAliases);
        const shouldStop = () => benchmarkRunRef.current.cancelled || benchmarkRunRef.current.id !== runId;
        const tick = () => Date.now() - startedAt;
        const yieldToUi = async () => new Promise<void>(resolve => setTimeout(resolve, 0));
        let lastProcessed = 0;
        let lastTotal = 0;

        try {
            setBenchmarkRecalcState({
                status: 'running',
                stage: 'PREPARING',
                mode,
                processed: 0,
                total: 0,
                elapsedMs: 0,
                startedAt: new Date(startedAt).toISOString(),
                completedAt: null,
                summary: '',
            });

            const canonicalProductMap = new Map<string, Product>();
            products.forEach(product => {
                const canonicalSku = resolver(product.sku);
                if (!canonicalProductMap.has(canonicalSku)) canonicalProductMap.set(canonicalSku, product);
            });

            const scopedCategorySet = new Set(categoryScope);
            const scopedCanonicalSkus = Array.from(canonicalProductMap.entries())
                .filter(([, product]) => mode === 'full' || scopedCategorySet.has(product.category ?? 'Uncategorised'))
                .map(([canonicalSku]) => canonicalSku);

            if (scopedCanonicalSkus.length === 0) {
                setBenchmarkRecalcState({
                    status: 'completed',
                    stage: 'FINALIZING',
                    mode,
                    processed: 0,
                    total: 0,
                    elapsedMs: tick(),
                    startedAt: new Date(startedAt).toISOString(),
                    completedAt: new Date().toISOString(),
                    summary: 'No SKUs found in selected scope.',
                });
                return [];
            }

            const txByCanonical = new Map<string, PriceLog[]>();
            salesHistory.forEach(tx => {
                const canonicalSku = resolver(tx.sku);
                if (!txByCanonical.has(canonicalSku)) txByCanonical.set(canonicalSku, []);
                txByCanonical.get(canonicalSku)!.push(tx);
            });

            const priceChangesByCanonical = new Map<string, PriceChangeRecord[]>();
            priceChangeHistory.forEach(change => {
                const canonicalSku = resolver(change.sku);
                if (!priceChangesByCanonical.has(canonicalSku)) priceChangesByCanonical.set(canonicalSku, []);
                priceChangesByCanonical.get(canonicalSku)!.push(change);
            });

            const allPricePoints = new Map<string, PricePoint[]>();
            const pointsBatchSize = 40;
            setBenchmarkRecalcState(prev => ({
                ...prev,
                stage: 'REBUILDING_COHORTS',
                total: scopedCanonicalSkus.length,
                processed: 0,
                elapsedMs: tick(),
            }));
            lastProcessed = 0;
            lastTotal = scopedCanonicalSkus.length;

            for (let i = 0; i < scopedCanonicalSkus.length; i++) {
                if (shouldStop()) throw new Error('BENCHMARK_CANCELLED');

                const canonicalSku = scopedCanonicalSkus[i];
                const product = canonicalProductMap.get(canonicalSku);
                if (!product) continue;

                const txs = txByCanonical.get(canonicalSku) || [];
                const skuPriceChanges = priceChangesByCanonical.get(canonicalSku) || [];
                const eras = buildPriceEras(
                    canonicalSku,
                    skuPriceChanges,
                    txs,
                    product.caPrice ?? product.currentPrice,
                    todayKey,
                    resolver
                );
                const tagged = txs
                    .filter(tx => isEligibleTransaction(tx, pricingRules))
                    .map(tx => ({
                        ...tx,
                        canonicalSku,
                        rawSku: tx.sku,
                        source: tagTransactionSource(tx, promotions, canonicalSku, resolver),
                        effectivePrice: tx.price,
                        eraId: assignTransactionToEra(tx, eras)?.eraId ?? '',
                    }));
                const costs =
                    (product.costPrice ?? product.costDetail?.cogs ?? 0) +
                    (product.postage ?? product.costDetail?.postage ?? 0) +
                    (product.sellingFee ?? product.costDetail?.sellingFee ?? 0) +
                    (product.adsFee ?? product.costDetail?.adsFee ?? 0);
                allPricePoints.set(
                    canonicalSku,
                    buildPricePoints(canonicalSku, tagged, eras, promotions, costs, resolver)
                );

                if ((i + 1) % pointsBatchSize === 0 || i === scopedCanonicalSkus.length - 1) {
                    lastProcessed = i + 1;
                    lastTotal = scopedCanonicalSkus.length;
                    setBenchmarkRecalcState(prev => ({
                        ...prev,
                        processed: i + 1,
                        total: scopedCanonicalSkus.length,
                        elapsedMs: tick(),
                    }));
                    await yieldToUi();
                }
            }

            if (shouldStop()) throw new Error('BENCHMARK_CANCELLED');

            const scopedProducts = Array.from(canonicalProductMap.entries())
                .filter(([, product]) => mode === 'full' || scopedCategorySet.has(product.category ?? 'Uncategorised'))
                .map(([, product]) => product);
            const rebuiltSnapshot = computeAllCohortStats(scopedProducts, allPricePoints, 4, resolver);
            const shifts = cohortSnapshot ? detectBenchmarkShifts(cohortSnapshot, rebuiltSnapshot) : [];

            let merged: CohortSnapshot;
            if (!cohortSnapshot || mode === 'full') {
                merged = rebuiltSnapshot;
            } else {
                const scopedCategories = new Set(Array.from(rebuiltSnapshot.categoryBuckets.keys()));
                const mergedCategoryBuckets = new Map(cohortSnapshot.categoryBuckets);
                scopedCategories.forEach(category => mergedCategoryBuckets.delete(category));
                rebuiltSnapshot.categoryBuckets.forEach((value, key) => mergedCategoryBuckets.set(key, value));

                const mergedCohortStats = new Map(cohortSnapshot.cohortStats);
                Array.from(mergedCohortStats.keys()).forEach(bucketKey => {
                    const category = bucketKey.split('::')[0] || '';
                    if (scopedCategories.has(category)) mergedCohortStats.delete(bucketKey);
                });
                rebuiltSnapshot.cohortStats.forEach((value, key) => mergedCohortStats.set(key, value));

                const mergedAssignments = new Map(cohortSnapshot.skuAssignments);
                Array.from(mergedAssignments.entries()).forEach(([sku, bucketKey]) => {
                    const assignedCategory = bucketKey.split('::')[0] || '';
                    if (scopedCategories.has(assignedCategory)) mergedAssignments.delete(sku);
                });
                rebuiltSnapshot.skuAssignments.forEach((value, key) => mergedAssignments.set(key, value));

                merged = {
                    ...cohortSnapshot,
                    computedAt: rebuiltSnapshot.computedAt,
                    version: (cohortSnapshot.version ?? 0) + 1,
                    categoryBuckets: mergedCategoryBuckets,
                    cohortStats: mergedCohortStats,
                    skuAssignments: mergedAssignments,
                };
            }

            setCohortSnapshot(merged);

            const affectedSkus = Array.from(rebuiltSnapshot.skuAssignments.keys());
            setBenchmarkRecalcState(prev => ({
                ...prev,
                stage: 'CALCULATING_OPTIMAL_PRICES',
                processed: 0,
                total: affectedSkus.length,
                elapsedMs: tick(),
            }));
            lastProcessed = 0;
            lastTotal = affectedSkus.length;

            const nextResults = new Map(optimalPriceResults);
            const calcBatchSize = 30;
            for (let i = 0; i < affectedSkus.length; i++) {
                if (shouldStop()) throw new Error('BENCHMARK_CANCELLED');
                const canonicalSku = affectedSkus[i];
                const product = canonicalProductMap.get(canonicalSku);
                if (!product) continue;
                const bucketKey = merged.skuAssignments.get(canonicalSku);
                const cohort = bucketKey ? merged.cohortStats.get(bucketKey) : undefined;
                if (!cohort) continue;
                const result = calculateOptimalPrice({
                    sku: product,
                    priceHistory: salesHistory,
                    priceChangeLog: priceChangeHistory,
                    promotions,
                    pricingRules,
                    cohortSnapshot: merged,
                    learnedAliases,
                    today: todayKey,
                });
                nextResults.set(canonicalSku, result);

                if ((i + 1) % calcBatchSize === 0 || i === affectedSkus.length - 1) {
                    lastProcessed = i + 1;
                    lastTotal = affectedSkus.length;
                    setOptimalPriceResults(new Map(nextResults));
                    setBenchmarkRecalcState(prev => ({
                        ...prev,
                        processed: i + 1,
                        total: affectedSkus.length,
                        elapsedMs: tick(),
                    }));
                    await yieldToUi();
                }
            }

            if (shouldStop()) throw new Error('BENCHMARK_CANCELLED');

            setBenchmarkUpdateNotices(prev => prev.filter(n => !rebuiltSnapshot.categoryBuckets.has(n.category)));
            setBenchmarkRecalcState({
                status: 'completed',
                stage: 'FINALIZING',
                mode,
                processed: affectedSkus.length,
                total: affectedSkus.length,
                elapsedMs: tick(),
                startedAt: new Date(startedAt).toISOString(),
                completedAt: new Date().toISOString(),
                summary: `Updated ${affectedSkus.length.toLocaleString()} SKU benchmarks.`,
            });
            return shifts;
        } catch (error) {
            if ((error as Error).message === 'BENCHMARK_CANCELLED') {
                setBenchmarkRecalcState({
                    status: 'cancelled',
                    stage: 'FINALIZING',
                    mode,
                    processed: lastProcessed,
                    total: lastTotal,
                    elapsedMs: tick(),
                    startedAt: new Date(startedAt).toISOString(),
                    completedAt: new Date().toISOString(),
                    summary: 'Benchmark recalculation was cancelled.',
                });
                return [];
            }
            console.error('[benchmark] recalculation failed', error);
            setBenchmarkRecalcState({
                status: 'error',
                stage: 'FINALIZING',
                mode,
                processed: 0,
                total: 0,
                elapsedMs: tick(),
                startedAt: new Date(startedAt).toISOString(),
                completedAt: new Date().toISOString(),
                summary: 'Benchmark recalculation failed.',
            });
            return [];
        } finally {
            benchmarkRunRef.current.running = false;
        }
    }, [benchmarkUpdateNotices, learnedAliases, products, salesHistory, priceChangeHistory, pricingRules, promotions, cohortSnapshot, optimalPriceResults]);

    // ── Dirty-tracking wrappers ──────────────────────────────────────────────
    // These replace the raw setters exported to consumers so that any in-app
    // edit (new promotion, saved template, rule change, etc.) automatically
    // marks the app dirty and prompts a DB push — same as file uploads do.
    const updatePromotions = useCallback((v: React.SetStateAction<PromotionEvent[]>) => {
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
        handleAdminToggle,
        handleAdminExit,
        handleAdminPush,
        handleSync,
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
    };
};
