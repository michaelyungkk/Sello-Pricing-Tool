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
    PricingRules,
    PriceLog,
    PromotionEvent,
    UserProfile as UserProfileType,
    LogisticsRule,
    ShipmentLog,
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
import { getCanonicalSku } from '../services/skuNormalization';
import { resolveEffectiveVelocity, toNumber } from '../services/metrics';
import { asDateKey } from '../services/dateUtils';
import { resolveAttribute } from '../services/mappingService';
import { redistributeAdSpend } from '../services/adSpreadService';
import { verifyPassword, pushSnapshot, pullSnapshot, pushTransactions, pullTransactions, clearTransactions } from '../services/dbService';

// Helper for recalculation
const recalculateProductMetrics = (
    products: Product[],
    history: PriceLog[],
    lookback: VelocityLookback,
    thresholds: ThresholdConfig,
    pricingRules?: PricingRules,
    brandMap?: AttributeMap,
    categoryMap?: AttributeMap
): Product[] => {
    const historyMap = new Map<string, PriceLog[]>();
    (history || []).forEach(h => {
        if (!h || !h.sku) return;
        if (!historyMap.has(h.sku)) historyMap.set(h.sku, []);
        historyMap.get(h.sku)!.push(h);
    });

    let days = 30;
    if (lookback === 'ALL') {
        if (history && history.length > 0) {
            const daysArr = history.map(l => new Date(l.date).getTime()).filter(t => !isNaN(t));
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

const formatDateShort = (date: Date) => {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

export const useAppState = () => {
    const { t } = useTranslation();

    // --- SHARED STATE ---
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [salesHistory, setSalesHistory] = useState<PriceLog[]>([]);
    const [refundHistory, setRefundHistory] = useState<RefundLog[]>([]);
    const [shipmentHistory, setShipmentHistory] = useState<ShipmentLog[]>([]);
    const [priceChangeHistory, setPriceChangeHistory] = useState<PriceChangeRecord[]>([]);
    const [costChangeHistory, setCostChangeHistory] = useState<CostChangeRecord[]>([]);
    const [inventoryChangeHistory, setInventoryChangeHistory] = useState<InventoryChangeRecord[]>([]);
    const [promotions, setPromotions] = useState<PromotionEvent[]>([]);
    const [learnedAliases, setLearnedAliases] = useState<Record<string, string>>({});
    const [inventoryTemplates, setInventoryTemplates] = useState<InventoryTemplate[]>([]);
    const [pricingRules, setPricingRules] = useState<PricingRules>(DEFAULT_PRICING_RULES);
    const [logisticsRules, setLogisticsRules] = useState<LogisticsRule[]>(DEFAULT_LOGISTICS_RULES);
    const [strategyRules, setStrategyRules] = useState<StrategyConfig>(DEFAULT_STRATEGY_RULES);
    const [searchConfig, setSearchConfig] = useState<SearchConfig>(DEFAULT_SEARCH_CONFIG);
    const [skuFamilies, setSkuFamilies] = useState<SkuFamily[]>([]);
    const [adGroups, setAdGroups] = useState<AdGroup[]>([]);
    const [brandMap, setBrandMap] = useState<AttributeMap>({});
    const [categoryMap, setCategoryMap] = useState<AttributeMap>({});
    const [thresholds, setThresholds] = useState<ThresholdConfig>(getThresholdConfig());
    const [pendingFamilySuggestions, setPendingFamilySuggestions] = useState<SkuFamily[]>([]);

    // --- PERSONAL STATE (localStorage) ---
    const [deductRefunds, setDeductRefunds] = useState<boolean>(() => {
        const saved = localStorage.getItem('sello_global_deduct_refunds');
        return saved === null ? true : saved === 'true';
    });
    const [uploadTimestamps, setUploadTimestamps] = useState<Record<string, string>>(() => {
        try {
            return JSON.parse(localStorage.getItem('sello_upload_timestamps') || '{}') || {};
        } catch { return {}; }
    });
    const [velocityLookback, setVelocityLookback] = useState<VelocityLookback>(() => {
        return (localStorage.getItem('sello_velocity_setting') as VelocityLookback) || '30';
    });
    const [userProfile, setUserProfile] = useState<UserProfileType>(() => {
        try {
            const saved = localStorage.getItem('sello_user_profile');
            if (saved) return JSON.parse(saved);
        } catch (e) { console.error('Error loading user profile', e); }
        return {
            name: '', themeColor: '#4f46e5', backgroundImage: '', backgroundColor: '#f3f4f6',
            glassMode: 'light', glassOpacity: 90, glassBlur: 10, ambientGlass: true, ambientGlassOpacity: 15
        };
    });

    // --- UI & SESSION STATE ---
    const [isAdminMode, setIsAdminMode] = useState<boolean>(() => sessionStorage.getItem('sello_admin_mode') === 'true');
    const [adminSessionActive, setAdminSessionActive] = useState<boolean>(false);
    const [storedAdminPassword, setStoredAdminPassword] = useState<string>('');
    const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'pushing' | 'error'>('idle');
    const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => localStorage.getItem('sello_last_synced_at'));
    const [pendingFamilyConflicts, setPendingFamilyConflicts] = useState<SkuFamily[]>([]);
    const [showSaveToast, setShowSaveToast] = useState(false);
    const [isDirty, setIsDirty] = useState<boolean>(false);

    // UI state for App.tsx
    const [selectedElasticityProduct, setSelectedElasticityProduct] = useState<Product | null>(null);
    const [selectedAnalysisProduct, setSelectedAnalysisProduct] = useState<Product | null>(null);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isSalesImportModalOpen, setIsSalesImportModalOpen] = useState(false);
    const [isSkuDetailModalOpen, setIsSkuDetailModalOpen] = useState(false);
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);
    const [isCAUploadModalOpen, setIsCAUploadModalOpen] = useState(false);
    const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
    const [currentView, setCurrentView] = useState<'overview' | 'strategy' | 'products' | 'platforms' | 'settings' | 'costs' | 'definitions' | 'promotions' | 'tools' | 'search' | 'custom-report' | 'family-groups'>('overview');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isFreshnessExpanded, setIsFreshnessExpanded] = useState(false);
    const [isSearchLoading, setIsSearchLoading] = useState(false);
    const [searchSessions, setSearchSessions] = useState<SearchSession[]>([]);
    const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
    const [lastRecalculationSummary, setLastRecalculationSummary] = useState<{ affectedTransactions: number; totalSpreadAmount: number; daysProcessed: number } | null>(null);
    const [mapJumpState, setMapJumpState] = useState<{ carrier: string, metric: any } | null>(null);
    const [showBackToTop, setShowBackToTop] = useState(false);

    const mainContentRef = useRef<HTMLDivElement>(null);
    const fileRestoreRef = useRef<HTMLInputElement>(null);

    // --- SYNC & PERSISTENCE HELPERS ---
    const getSharedSnapshot = useCallback(() => {
        return {
            products, priceChangeHistory, costChangeHistory,
            inventoryChangeHistory, promotions, learnedAliases,
            pricingRules, logisticsRules, strategyRules,
            searchConfig, thresholds, brandMap, categoryMap,
            skuFamilies, adGroups, inventoryTemplates
        };
    }, [products, priceChangeHistory, costChangeHistory, inventoryChangeHistory, promotions, learnedAliases, pricingRules, logisticsRules, strategyRules, searchConfig, thresholds, brandMap, categoryMap, skuFamilies, adGroups, inventoryTemplates]);

    const handleAdminPush = useCallback(async () => {
        if (!isAdminMode || !storedAdminPassword) return;
        setSyncStatus('pushing');
        try {
            // Push master data first
            const snapshot = getSharedSnapshot();
            const masterRes = await pushSnapshot(storedAdminPassword, snapshot);
            if (!masterRes.success) {
                setSyncStatus('error');
                return false;
            }

            // Push transaction history in chunks
            const txRes = await pushTransactions(storedAdminPassword, salesHistory || []);
            if (!txRes.success) {
                setSyncStatus('error');
                return false;
            }

            setIsDirty(false);
            setShowSaveToast(true);
            setTimeout(() => setShowSaveToast(false), 3000);
            setSyncStatus('idle');
            return true;
        } catch (e) {
            console.error('Push error', e);
            setSyncStatus('error');
            return false;
        }
    }, [isAdminMode, storedAdminPassword, getSharedSnapshot, salesHistory]);

    const applySharedSnapshot = useCallback((snapshot: any, transactionsOverride?: PriceLog[]) => {
        if (!snapshot) return;
        const safe = normalizeRestoredState(snapshot);
        const m = migrateRestoredDatabase(safe);
        setRefundHistory(Array.isArray(m.refundHistory) ? m.refundHistory : []);
        setShipmentHistory(Array.isArray(m.shipmentHistory) ? m.shipmentHistory : []);
        setPriceChangeHistory(Array.isArray(m.priceChangeHistory) ? m.priceChangeHistory : []);
        setCostChangeHistory(Array.isArray(m.costChangeHistory) ? m.costChangeHistory : []);
        setInventoryChangeHistory(Array.isArray(m.inventoryChangeHistory) ? m.inventoryChangeHistory : []);
        setPromotions(Array.isArray(m.promotions) ? m.promotions : []);
        setLearnedAliases(m.learnedAliases || {});
        setPricingRules(m.pricingRules || DEFAULT_PRICING_RULES);
        setLogisticsRules(m.logisticsRules || DEFAULT_LOGISTICS_RULES);
        setStrategyRules(m.strategyRules || DEFAULT_STRATEGY_RULES);
        setSearchConfig(m.searchConfig || DEFAULT_SEARCH_CONFIG);
        setInventoryTemplates(Array.isArray(m.inventoryTemplates) ? m.inventoryTemplates : []);
        setBrandMap(m.brandMap || {});
        setCategoryMap(m.categoryMap || {});
        setSkuFamilies(Array.isArray(m.skuFamilies) ? m.skuFamilies : []);
        if (m.thresholds) { setThresholds(m.thresholds); saveThresholdConfig(m.thresholds); }

        const adGroupsToUse = Array.isArray(m.adGroups) ? m.adGroups : [];

        // Use override transactions if provided (from db-pull-transactions)
        // Fall back to m.priceHistory (normalizeRestoredState maps salesHistory -> priceHistory)
        const priceHistoryToUse = transactionsOverride
            ? transactionsOverride
            : Array.isArray(m.priceHistory) ? m.priceHistory : [];

        const redistributed = redistributeAdSpend(priceHistoryToUse, adGroupsToUse);
        setSalesHistory(redistributed);
        const finalProducts = recalculateProductMetrics(Array.isArray(m.products) ? m.products : [], redistributed, velocityLookback, m.thresholds || thresholds, m.pricingRules, m.brandMap, m.categoryMap);
        setProducts(finalProducts);
        setAdGroups(adGroupsToUse);
    }, [velocityLookback, thresholds]);

    const handleSync = useCallback(async (incomingSnapshotOverride?: any) => {
        setSyncStatus('syncing');
        try {
            const res = incomingSnapshotOverride ? { success: true, snapshot: incomingSnapshotOverride, lastUpdatedAt: new Date().toISOString() } : await pullSnapshot();

            if (!res.success || !res.snapshot) {
                setSyncStatus('error');
                return;
            }

            // Check family conflicts
            const incomingFamilies = Array.isArray(res.snapshot.skuFamilies) ? res.snapshot.skuFamilies : [];
            const localFamilies = skuFamilies || [];
            const conflicts = localFamilies.filter(lf => !incomingFamilies.some((ifam: SkuFamily) => ifam.id === lf.id));
            if (conflicts.length > 0 && !incomingSnapshotOverride) {
                setPendingFamilyConflicts(conflicts);
                setSyncStatus('idle');
                return;
            }

            // Pull transactions separately
            const txRes = await pullTransactions();
            const transactions = (txRes.success && txRes.transactions) ? txRes.transactions : [];

            applySharedSnapshot(res.snapshot, transactions);

            const time = res.lastUpdatedAt || new Date().toISOString();
            setLastSyncedAt(time);
            localStorage.setItem('sello_last_synced_at', time);
            setSyncStatus('idle');
        } catch (e) {
            console.error('Sync error', e);
            setSyncStatus('error');
        }
    }, [skuFamilies, applySharedSnapshot]);

    const resolveConflicts = useCallback((keepLocal: boolean) => {
        const run = async () => {
            const res = await pullSnapshot();
            if (res.success && res.snapshot) {
                let snap = { ...res.snapshot };
                if (keepLocal) snap.skuFamilies = [...(Array.isArray(snap.skuFamilies) ? snap.skuFamilies : []), ...pendingFamilyConflicts];
                applySharedSnapshot(snap);
                const time = res.lastUpdatedAt || new Date().toISOString();
                setLastSyncedAt(time);
                localStorage.setItem('sello_last_synced_at', time);
            }
            setPendingFamilyConflicts([]);
            setSyncStatus('idle');
        };
        run();
    }, [pendingFamilyConflicts, applySharedSnapshot]);

    // --- EFFECTS ---
    useEffect(() => { localStorage.setItem('sello_global_deduct_refunds', deductRefunds.toString()); }, [deductRefunds]);
    useEffect(() => { localStorage.setItem('sello_upload_timestamps', JSON.stringify(uploadTimestamps)); }, [uploadTimestamps]);
    useEffect(() => { localStorage.setItem('sello_velocity_setting', velocityLookback); }, [velocityLookback]);
    useEffect(() => { localStorage.setItem('sello_user_profile', JSON.stringify(userProfile)); }, [userProfile]);

    useEffect(() => {
        setIsDataLoaded(true);
        const handleScroll = () => { if (mainContentRef.current) setShowBackToTop(mainContentRef.current.scrollTop > 400); };
        const sc = mainContentRef.current;
        if (sc) sc.addEventListener('scroll', handleScroll);
        return () => { if (sc) sc.removeEventListener('scroll', handleScroll); };
    }, []);

    useEffect(() => {
        // Auto-pull from database on first load if no local data exists yet
        if (!products || products.length === 0) {
            handleSync();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (isAdminMode && isDataLoaded && skuFamilies.length > 0) setIsDirty(true);
    }, [skuFamilies, isAdminMode, isDataLoaded]);

    // --- APP HANDLERS ---
    const updateTimestamp = useCallback((key: string) => { setUploadTimestamps(prev => ({ ...prev, [key]: new Date().toISOString() })); }, []);
    const handleRefreshThresholds = useCallback(() => { const newThresholds = getThresholdConfig(); setThresholds(newThresholds); setProducts(prev => recalculateProductMetrics(prev, salesHistory, velocityLookback, newThresholds, pricingRules, brandMap, categoryMap)); }, [salesHistory, velocityLookback, pricingRules, brandMap, categoryMap]);
    const handleRecalculateVelocity = useCallback((newLookback: VelocityLookback) => { setVelocityLookback(newLookback); setProducts(prev => recalculateProductMetrics(prev, salesHistory, newLookback, thresholds, pricingRules, brandMap, categoryMap)); }, [salesHistory, thresholds, pricingRules, brandMap, categoryMap]);
    const handleSearch = useCallback(async (query: string | SearchChip[]) => { setIsSearchLoading(true); try { const intent = await parseSearchQuery(typeof query === 'string' ? query : query.map(c => c.label).join(' ')); const { results, timeLabel } = processDataForSearch(intent, products, salesHistory, pricingRules, refundHistory); const session: SearchSession = { id: `s-${Date.now()}`, query: typeof query === 'string' ? query : 'Chip Search', results, params: intent, timeLabel, timestamp: Date.now() }; setSearchSessions(prev => [session, ...prev]); setActiveSearchId(session.id); setCurrentView('search'); } finally { setIsSearchLoading(false); } }, [products, salesHistory, pricingRules, refundHistory]);
    const handleDeepDiveRequest = useCallback((sku: string) => handleSearch(`SKU: ${sku}`), [handleSearch]);
    const handleManualPriceChange = useCallback((record: any) => { setPriceChangeHistory(prev => [record, ...(prev || [])]); }, []);
    const handleManualCostChange = useCallback((record: any) => { setCostChangeHistory(prev => [record, ...(prev || [])]); }, []);
    const handleAnalyzeCarrier = useCallback((carrier: string) => { setMapJumpState({ carrier, metric: 'RETURN_RATE' }); setCurrentView('overview'); }, []);
    const handleRefineSearch = useCallback((id: string, intent: any) => { const { results, timeLabel } = processDataForSearch(intent, products, salesHistory, pricingRules, refundHistory); setSearchSessions(prev => prev.map(s => s.id === id ? { ...s, results, params: intent, timeLabel } : s)); }, [products, salesHistory, pricingRules, refundHistory]);
    const deleteSearchSession = useCallback((id: string, e: any) => { e.stopPropagation(); setSearchSessions(prev => prev.filter(s => s.id !== id)); if (activeSearchId === id) setActiveSearchId(null); }, [activeSearchId]);
    const handleViewElasticity = useCallback((p: Product) => setSelectedElasticityProduct(p), []);
    const handleAnalyze = useCallback(async (p: Product) => { setIsAnalysisLoading(true); try { setSelectedAnalysisProduct(p); const res = await analyzePriceAdjustment(p, pricingRules[p.platform || 'General'] || DEFAULT_PRICING_RULES['Amazon'], '', thresholds); setAnalysisResult(res); } finally { setIsAnalysisLoading(false); } }, [pricingRules, thresholds]);
    const handleApplyPrice = useCallback((id: string, price: number) => { setProducts(prev => prev.map(p => p.id === id ? { ...p, caPrice: price } : p)); setSelectedAnalysisProduct(null); if (isAdminMode) setIsDirty(true); }, [isAdminMode]);
    const handleBackup = useCallback(() => {
        const backupData = {
            version: "2.0",
            exportDate: new Date().toISOString(),
            shared: {
                ...getSharedSnapshot(),
                // Include full transaction history in JSON backups so restores are complete.
                // This is intentionally NOT part of getSharedSnapshot() to avoid bloating
                // the DB app_snapshot table (transactions go to transaction_history separately).
                priceHistory: salesHistory
            },
            personal: {
                userProfile,
                velocityLookback,
                uploadTimestamps
            }
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `sello-backup-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    }, [getSharedSnapshot, salesHistory, userProfile, velocityLookback, uploadTimestamps]);

    const handleRestore = useCallback((e: any) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const data = JSON.parse(ev.target?.result as string);
                if (data.version === "2.0") {
                    if (data.shared) applySharedSnapshot(data.shared);
                    if (data.personal) {
                        const { userProfile: p, velocityLookback: v, uploadTimestamps: t } = data.personal;
                        if (p) { setUserProfile(p); localStorage.setItem('sello_user_profile', JSON.stringify(p)); }
                        if (v) { setVelocityLookback(v); localStorage.setItem('sello_velocity_setting', v); }
                        if (t) { setUploadTimestamps(t); localStorage.setItem('sello_upload_timestamps', JSON.stringify(t)); }
                    }
                    if (isAdminMode) setIsDirty(true);
                } else {
                    applySharedSnapshot(data);
                    alert("Legacy backup restored. Some personal settings may not have been restored.");
                    if (isAdminMode) setIsDirty(true);
                }
            } catch (err) {
                console.error('Restore error', err);
                alert('Invalid backup file');
            }
        };
        reader.readAsText(file);
    }, [applySharedSnapshot, isAdminMode]);
    const handleResetRefunds = useCallback(() => setRefundHistory([]), []);
    const handleUpdatePriceChangeRecord = useCallback((r: any) => setPriceChangeHistory(prev => prev.map(old => old.id === r.id ? r : old)), []);
    const handleUpdateCostChangeRecord = useCallback((r: any) => setCostChangeHistory(prev => prev.map(old => old.id === r.id ? r : old)), []);
    const handleUpdateInventoryChangeRecord = useCallback((r: any) => setInventoryChangeHistory(prev => prev.map(old => old.id === r.id ? r : old)), []);

    const handleAdminToggle = useCallback(async (password: string) => { const res = await verifyPassword(password); if (res.valid) { setIsAdminMode(true); setAdminSessionActive(true); setStoredAdminPassword(password); sessionStorage.setItem('sello_admin_mode', 'true'); return { success: true }; } return { success: false, error: 'Invalid credentials' }; }, []);
    const handleAdminExit = useCallback(async (force?: boolean) => {
        if (isDirty && !force) {
            return { needsConfirmation: true };
        }
        setIsAdminMode(false);
        setAdminSessionActive(false);
        setStoredAdminPassword('');
        setSyncStatus('idle');
        setIsDirty(false);
        sessionStorage.removeItem('sello_admin_mode');
        return { needsConfirmation: false };
    }, [isDirty]);

    const handleAdGroupSave = useCallback((updated: AdGroup[]) => { setAdGroups(updated); const redistributed = redistributeAdSpend(salesHistory, updated); setSalesHistory(redistributed); const summary = { affectedTransactions: redistributed.length, totalSpreadAmount: 0, daysProcessed: 30 }; setProducts(prev => recalculateProductMetrics(prev, redistributed, velocityLookback, thresholds, pricingRules, brandMap, categoryMap)); setLastRecalculationSummary(summary); if (isAdminMode) setIsDirty(true); return summary; }, [salesHistory, velocityLookback, thresholds, pricingRules, brandMap, categoryMap, isAdminMode]);
    const handleSalesImportConfirm = useCallback((updatedProducts: Product[], _labels?: { current: string; last: string }, historyPayload?: HistoryPayload[], newShipmentLogs?: ShipmentLog[], discoveredPlatforms?: string[], newlyLearnedAliases?: Record<string, string>) => {
        let updatedPriceHistory = [...salesHistory];
        if (historyPayload && historyPayload.length > 0) {
            const newLogs: PriceLog[] = historyPayload.map(h => ({
                ...h,
                id: `l-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
            }));

            // Build deduplication key sets from incoming new logs
            const transactionKeys = new Set<string>();
            const dailyActivityKeys = new Set<string>();

            newLogs.forEach(l => {
                const d = l.date.split('T')[0];
                const p = l.platform || 'General';
                if (l.orderId) {
                    transactionKeys.add(`${l.sku}|${l.orderId}`);
                }
                dailyActivityKeys.add(`${l.sku}|${d}|${p}`);
            });

            // Filter existing history to remove any records that 
            // overlap with the incoming data
            const keptHistory = (salesHistory || []).filter(l => {
                const d = l.date.split('T')[0];
                const p = l.platform || 'General';
                if (l.orderId) {
                    const txKey = `${l.sku}|${l.orderId}`;
                    if (transactionKeys.has(txKey)) return false;
                    return true;
                }
                const dailyKey = `${l.sku}|${d}|${p}`;
                if (dailyActivityKeys.has(dailyKey)) return false;
                return true;
            });

            // Combine: new records first, then non-overlapping history
            updatedPriceHistory = [...newLogs, ...keptHistory];
        }
        const redistributed = redistributeAdSpend(updatedPriceHistory, adGroups);
        const finalProducts = recalculateProductMetrics(updatedProducts, redistributed, velocityLookback, thresholds, pricingRules, brandMap, categoryMap);
        setSalesHistory(redistributed);
        setProducts(finalProducts);
        if (newShipmentLogs) setShipmentHistory(prev => [...newShipmentLogs, ...prev]);
        if (newlyLearnedAliases) setLearnedAliases(prev => ({ ...prev, ...newlyLearnedAliases }));
        updateTimestamp('Sales');
        setIsSalesImportModalOpen(false);
        if (isAdminMode) setIsDirty(true);
    }, [salesHistory, adGroups, velocityLookback, thresholds, pricingRules, brandMap, categoryMap, updateTimestamp, isAdminMode]);
    const handleInventoryImport = useCallback((data: any[]) => { const costChg: any[] = []; const invChg: any[] = []; setProducts(prev => (prev || []).map(p => { const u = data.find(d => getCanonicalSku(d.sku) === getCanonicalSku(p.sku)); if (!u) return p; const oldStock = p.stockLevel || 0; const newStock = toNumber(u.stockLevel); if (newStock !== oldStock) invChg.push({ id: `i-${Date.now()}`, sku: p.sku, productName: p.name, timestamp: Date.now(), date: new Date().toISOString(), prevStock: oldStock, newStock, deltaStock: newStock - oldStock, source: 'Import', isStrategic: false }); return { ...p, stockLevel: newStock, costPrice: toNumber(u.costPrice) || p.costPrice }; })); if (invChg.length > 0) setInventoryChangeHistory(prev => [...invChg, ...(prev || [])]); updateTimestamp('Inventory'); setIsUploadModalOpen(false); if (isAdminMode) setIsDirty(true); }, [updateTimestamp, isAdminMode]);
    const handleSkuDetailImport = useCallback((data: any[]) => { setProducts(prev => prev.map(p => { const u = data.find(d => getCanonicalSku(d.sku) === getCanonicalSku(p.sku)); return u ? { ...p, name: u.name || p.name, brand: u.brand || p.brand, category: u.category || p.category } : p; })); updateTimestamp('SKU Details'); setIsSkuDetailModalOpen(false); if (isAdminMode) setIsDirty(true); }, [updateTimestamp, isAdminMode]);
    const handleMappingImport = useCallback((m: any[]) => { setProducts(prev => prev.map(p => { const u = m.find(mx => getCanonicalSku(mx.sku) === getCanonicalSku(p.sku)); return u ? { ...p, channels: u.channels || p.channels } : p; })); if (isAdminMode) setIsDirty(true); }, [isAdminMode]);
    const handleReturnsImport = useCallback((r: any[]) => { setRefundHistory(prev => [...r.map(rx => ({ ...rx, id: `r-${Date.now()}` })), ...(prev || [])]); updateTimestamp('Refunds'); setIsReturnsModalOpen(false); if (isAdminMode) setIsDirty(true); }, [updateTimestamp, isAdminMode]);
    const handleCAImport = useCallback((d: any[]) => { setProducts(prev => prev.map(p => { const u = d.find(ux => getCanonicalSku(ux.sku) === getCanonicalSku(p.sku)); return u ? { ...p, caPrice: toNumber(u.caPrice) } : p; })); updateTimestamp('CA Prices'); setIsCAUploadModalOpen(false); if (isAdminMode) setIsDirty(true); }, [updateTimestamp, isAdminMode]);
    const handleShipmentImport = useCallback((s: any[]) => { setProducts(prev => prev.map(p => { const u = s.find(ux => getCanonicalSku(ux.sku) === getCanonicalSku(p.sku)); return u ? { ...p, incomingStock: (p.incomingStock || 0) + toNumber(u.quantity) } : p; })); updateTimestamp('Shipments'); setIsShipmentModalOpen(false); if (isAdminMode) setIsDirty(true); }, [updateTimestamp, isAdminMode]);
    const handleResetSalesData = useCallback(() => {
        setSalesHistory([]);
        if (isAdminMode) {
            setIsDirty(true);
            clearTransactions(storedAdminPassword);
        }
    }, [isAdminMode, storedAdminPassword]);

    const priceHistoryMap = useMemo(() => { const map = new Map<string, PriceLog[]>(); salesHistory.forEach(h => { if (!map.has(h.sku)) map.set(h.sku, []); map.get(h.sku)!.push(h); }); return map; }, [salesHistory]);
    const existingOrders = useMemo(() => { const map = new Map<string, string>(); salesHistory.forEach(h => { if (h.orderId) map.set(h.orderId, h.platform || 'Amazon'); }); return map; }, [salesHistory]);
    const dynamicDateLabels = useMemo(() => { const r = getFridayThursdayRanges(); return { current: `${formatDateShort(r.current.start)} - ${formatDateShort(r.current.end)}`, last: `${formatDateShort(r.last.start)} - ${formatDateShort(r.last.end)}` }; }, []);
    const ambientRgb = useMemo(() => { const r = hexToRgb(userProfile.themeColor); return r || { r: 79, g: 70, b: 229 }; }, [userProfile.themeColor]);

    return {
        t, products, setProducts, salesHistory, refundHistory, shipmentHistory, priceChangeHistory,
        costChangeHistory, inventoryChangeHistory, promotions, setPromotions, learnedAliases,
        inventoryTemplates, setInventoryTemplates, pricingRules, setPricingRules, logisticsRules, setLogisticsRules,
        strategyRules, setStrategyRules, searchConfig, setSearchConfig, skuFamilies, setSkuFamilies,
        pendingFamilySuggestions, setPendingFamilySuggestions, adGroups, setAdGroups,
        onSyncFromFamilies: (p: string) => { }, onAddAdGroup: (g: any) => { }, onEditAdGroup: (g: any) => { }, onRemoveAdGroup: (id: string) => { },
        handleAdGroupSave, lastRecalculationSummary, brandMap, setBrandMap, categoryMap, setCategoryMap,
        deductRefunds, setDeductRefunds, uploadTimestamps, thresholds, velocityLookback, setVelocityLookback,
        userProfile, setUserProfile, showBackToTop, mainContentRef, fileRestoreRef,
        selectedElasticityProduct, setSelectedElasticityProduct, isUploadModalOpen, setIsUploadModalOpen,
        isSalesImportModalOpen, setIsSalesImportModalOpen, isSkuDetailModalOpen, setIsSkuDetailModalOpen,
        isMappingModalOpen, setIsMappingModalOpen, isReturnsModalOpen, setIsReturnsModalOpen,
        isCAUploadModalOpen, setIsCAUploadModalOpen, isShipmentModalOpen, setIsShipmentModalOpen,
        selectedAnalysisProduct, setSelectedAnalysisProduct, analysisResult, setAnalysisResult,
        isAnalysisLoading, isSearchLoading, searchSessions, activeSearchId, setActiveSearchId,
        currentView, setCurrentView, isOnline, isFreshnessExpanded, setIsFreshnessExpanded,
        mapJumpState, priceHistoryMap, existingOrders, dynamicDateLabels, ambientRgb,
        handleRefreshThresholds, handleRecalculateVelocity, handleSearch, handleDeepDiveRequest,
        handleManualPriceChange, handleManualCostChange, handleAnalyzeCarrier, handleRefineSearch,
        deleteSearchSession, handleViewElasticity, handleAnalyze, handleApplyPrice, handleBackup,
        handleRestore, handleResetRefunds, handleUpdatePriceChangeRecord, handleUpdateCostChangeRecord,
        handleUpdateInventoryChangeRecord, handleSalesImportConfirm, handleInventoryImport, handleResetSalesData,
        handleSkuDetailImport, handleMappingImport, handleReturnsImport, handleCAImport, handleShipmentImport,
        isAdminMode, adminSessionActive, handleAdminToggle, handleAdminExit, lastSyncedAt, syncStatus,
        handleSync, pendingFamilyConflicts, resolveConflicts, showSaveToast, getSharedSnapshot, applySharedSnapshot, isDirty, handleAdminPush
    };
};
