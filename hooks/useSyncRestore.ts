import { useCallback, useEffect, useRef } from 'react';
import type { ChangeEvent, Dispatch, RefObject, SetStateAction } from 'react';
import {
    DEFAULT_LOGISTICS_RULES,
    DEFAULT_PRICING_RULES,
    DEFAULT_SEARCH_CONFIG,
    DEFAULT_STRATEGY_RULES
} from '../constants';
import type {
    AdGroup,
    AttributeMap,
    CostChangeRecord,
    FreightRate,
    InventoryChangeRecord,
    InventoryTemplate,
    LogisticsRule,
    PriceChangeRecord,
    PriceLog,
    PricingRules,
    Product,
    PromotionEvent,
    RefundLog,
    SearchConfig,
    SkuFamily,
    StrategyConfig,
    UserProfile as UserProfileType,
    VelocityLookback
} from '../types';
import type {
    BenchmarkUpdateNotice,
    CohortSnapshot,
    OptimalPriceResult
} from '../types';
import type { ReportLayout } from '../services/persistenceService';
import { pullSnapshot, pullSnapshotIfUpdated, checkVersion, pullTransactionPage, pullTransactionPageSince, pullRefundSignatures, pullRefundsAndShipments, pullPromotionSignatures, pullPromotionsSince } from '../services/dbService';
import { clearCache, getCachedVersion, loadFromCache, saveToCache } from '../services/localCache';
import { redistributeAdSpend } from '../services/adSpreadService';
import { saveThresholdConfig } from '../services/thresholdsConfig';
import { migrateRestoredDatabase } from '../services/migrationService';
import { normalizeRestoredState } from '../services/restoreSanitizer';
import { logPerfPostCommitTail, perfElapsedMs, perfNowMs, waitForUiResponsiveAfterApply } from '../services/uiSettle';

const FORCE_FULL_PULL_TOKEN_KEY = 'sello_last_force_full_pull_token';
const REFUND_CURSOR_KEY = 'sello_refunds_updated_at';
const PROMO_CURSOR_KEY = 'sello_promotions_updated_at';
const PROMO_BASELINE_COMPLETE_KEY = 'sello_promotions_baseline_complete';

type ThresholdConfig = ReturnType<typeof import('../services/thresholdsConfig').getThresholdConfig>;

type RecalculateProductMetrics = (
    products: Product[],
    historyOrMap: PriceLog[] | Map<string, PriceLog[]>,
    lookback: VelocityLookback,
    thresholds: ThresholdConfig,
    pricingRules?: PricingRules,
    brandMap?: AttributeMap,
    categoryMap?: AttributeMap
) => Product[];

type SharedSnapshot = {
    products: Product[];
    priceChangeHistory: PriceChangeRecord[];
    costChangeHistory: CostChangeRecord[];
    inventoryChangeHistory: InventoryChangeRecord[];
    learnedAliases: Record<string, string>;
    pricingRules: PricingRules;
    logisticsRules: LogisticsRule[];
    strategyRules: StrategyConfig;
    searchConfig: SearchConfig;
    thresholds: ThresholdConfig;
    brandMap: AttributeMap;
    categoryMap: AttributeMap;
    skuFamilies: SkuFamily[];
    adGroups: AdGroup[];
    inventoryTemplates: InventoryTemplate[];
    customReportPresets: ReportLayout[];
    priceCheckTemplates: any[];
    freightRates: FreightRate[];
    cohortSnapshot: any;
    optimalPriceResults: Record<string, OptimalPriceResult>;
    benchmarkUpdateNotices: BenchmarkUpdateNotice[];
};

type UseSyncRestoreDeps = {
    t: (key: string) => string;
    products: Product[];
    salesHistory: PriceLog[];
    refundHistory: RefundLog[];
    priceChangeHistory: PriceChangeRecord[];
    costChangeHistory: CostChangeRecord[];
    inventoryChangeHistory: InventoryChangeRecord[];
    promotions: PromotionEvent[];
    adGroups: AdGroup[];
    skuFamilies: SkuFamily[];
    learnedAliases: Record<string, string>;
    pricingRules: PricingRules;
    logisticsRules: LogisticsRule[];
    strategyRules: StrategyConfig;
    searchConfig: SearchConfig;
    thresholds: ThresholdConfig;
    brandMap: AttributeMap;
    categoryMap: AttributeMap;
    inventoryTemplates: InventoryTemplate[];
    customReportPresets: ReportLayout[];
    priceCheckTemplates: any[];
    freightRates: FreightRate[];
    cohortSnapshot: CohortSnapshot | null;
    optimalPriceResults: Map<string, OptimalPriceResult>;
    benchmarkUpdateNotices: BenchmarkUpdateNotice[];
    velocityLookback: VelocityLookback;
    userProfile: UserProfileType;
    uploadTimestamps: Record<string, string>;
    pendingFamilyConflicts: SkuFamily[];
    isAdminMode: boolean;
    startupChoicePending: boolean;
    startupSyncMode: 'sync' | 'local' | null;
    fileRestoreRef: RefObject<HTMLInputElement>;
    setRefundHistory: Dispatch<SetStateAction<RefundLog[]>>;
    setFreightRates: Dispatch<SetStateAction<FreightRate[]>>;
    setPriceChangeHistory: Dispatch<SetStateAction<PriceChangeRecord[]>>;
    setCostChangeHistory: Dispatch<SetStateAction<CostChangeRecord[]>>;
    setInventoryChangeHistory: Dispatch<SetStateAction<InventoryChangeRecord[]>>;
    setPromotions: Dispatch<SetStateAction<PromotionEvent[]>>;
    setLearnedAliases: Dispatch<SetStateAction<Record<string, string>>>;
    setPricingRules: Dispatch<SetStateAction<PricingRules>>;
    setLogisticsRules: Dispatch<SetStateAction<LogisticsRule[]>>;
    setStrategyRules: Dispatch<SetStateAction<StrategyConfig>>;
    setSearchConfig: Dispatch<SetStateAction<SearchConfig>>;
    setInventoryTemplates: Dispatch<SetStateAction<InventoryTemplate[]>>;
    setCustomReportPresets: Dispatch<SetStateAction<ReportLayout[]>>;
    setPriceCheckTemplates: Dispatch<SetStateAction<any[]>>;
    setUploadTimestamps: Dispatch<SetStateAction<Record<string, string>>>;
    setBrandMap: Dispatch<SetStateAction<AttributeMap>>;
    setCategoryMap: Dispatch<SetStateAction<AttributeMap>>;
    setSkuFamilies: Dispatch<SetStateAction<SkuFamily[]>>;
    setUserProfile: Dispatch<SetStateAction<UserProfileType>>;
    setThresholds: Dispatch<SetStateAction<ThresholdConfig>>;
    setVelocityLookback: Dispatch<SetStateAction<VelocityLookback>>;
    setAdGroups: Dispatch<SetStateAction<AdGroup[]>>;
    setSalesHistory: Dispatch<SetStateAction<PriceLog[]>>;
    setProducts: Dispatch<SetStateAction<Product[]>>;
    setLastRecalculationSummary: Dispatch<SetStateAction<{ affectedTransactions: number; totalSpreadAmount: number; daysProcessed: number } | null>>;
    setSearchSessions: Dispatch<SetStateAction<any[]>>;
    setActiveSearchId: Dispatch<SetStateAction<string | null>>;
    setSyncStatus: Dispatch<SetStateAction<'idle' | 'syncing' | 'pushing' | 'error'>>;
    setSyncStep: Dispatch<SetStateAction<string>>;
    setSyncProgress: Dispatch<SetStateAction<number>>;
    setSyncTotal: Dispatch<SetStateAction<number>>;
    setStartupSyncMode: Dispatch<SetStateAction<'sync' | 'local' | null>>;
    setStartupChoicePending: Dispatch<SetStateAction<boolean>>;
    setIsRestoring: Dispatch<SetStateAction<boolean>>;
    setLastSyncedAt: Dispatch<SetStateAction<string | null>>;
    setPendingFamilyConflicts: Dispatch<SetStateAction<SkuFamily[]>>;
    setPostApplySource: Dispatch<SetStateAction<'none' | 'sales-import' | 'refund-import' | 'inventory-import' | 'freight-upload' | 'sync' | 'cache-load' | 'local-cache-load'>>;
    setCohortSnapshot: Dispatch<SetStateAction<CohortSnapshot | null>>;
    setOptimalPriceResults: Dispatch<SetStateAction<Map<string, OptimalPriceResult>>>;
    setBenchmarkUpdateNotices: Dispatch<SetStateAction<BenchmarkUpdateNotice[]>>;
    setIsDirty: Dispatch<SetStateAction<boolean>>;
    normalizePromotionStatuses: (list: PromotionEvent[]) => PromotionEvent[];
    recalculateProductMetrics: RecalculateProductMetrics;
    markSearchSessionsStale: () => void;
};

export const useSyncRestore = ({
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
}: UseSyncRestoreDeps) => {
    const getSharedSnapshot = useCallback<() => SharedSnapshot>(() => ({
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
        customReportPresets,
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
    }), [
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
        customReportPresets,
        priceCheckTemplates,
        freightRates,
        cohortSnapshot,
        optimalPriceResults,
        benchmarkUpdateNotices
    ]);

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
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `sello_backup_${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }, [getSharedSnapshot, normalizePromotionStatuses, promotions, refundHistory, salesHistory, uploadTimestamps, userProfile, velocityLookback]);

    const handleRestore = useCallback((e: ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            let worker: Worker | null = null;
            const restoreStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
            try {
                setIsRestoring(true);
                setStartupSyncMode('local');
                setStartupChoicePending(false);
                console.log('[restore] start', {
                    fileName: file.name,
                    fileSizeBytes: file.size
                });
                setSyncStatus('syncing');
                setSyncProgress(0);
                setSyncTotal(4);
                setSyncStep('Reading restore backup...');

                const rawText = String(event.target?.result || '');
                console.log('[restore] file read complete', {
                    elapsedMs: Number((((typeof performance !== 'undefined' ? performance.now() : Date.now()) - restoreStartedAt)).toFixed(1)),
                    rawTextLength: rawText.length
                });
                await new Promise<void>(resolve => setTimeout(resolve, 0));

                worker = new Worker(new URL('../workers/restoreWorker.ts', import.meta.url), { type: 'module' });
                const restored = await new Promise<any>((resolve, reject) => {
                    if (!worker) {
                        reject(new Error('Restore worker failed to initialize.'));
                        return;
                    }
                    worker.onmessage = (message) => {
                        const payload = message.data;
                        if (payload?.type === 'progress') {
                            setSyncProgress(payload.progress || 0);
                            setSyncStep(payload.message || 'Restoring backup...');
                            return;
                        }
                        if (payload?.type === 'success') {
                            resolve(payload.restored);
                            return;
                        }
                        if (payload?.type === 'error') {
                            reject(new Error(payload.error || 'Restore worker failed.'));
                        }
                    };
                    worker.onerror = (workerError) => reject(workerError);
                    worker.postMessage({ rawText });
                });

                console.log('[restore] worker complete', {
                    elapsedMs: Number((((typeof performance !== 'undefined' ? performance.now() : Date.now()) - restoreStartedAt)).toFixed(1)),
                    products: Array.isArray(restored.products) ? restored.products.length : 0,
                    priceHistory: Array.isArray(restored.priceHistory) ? restored.priceHistory.length : 0,
                    refundHistory: Array.isArray(restored.refundHistory) ? restored.refundHistory.length : 0,
                    rebuiltSalesHistory: Array.isArray(restored.rebuiltSalesHistory) ? restored.rebuiltSalesHistory.length : 0,
                    rebuiltProducts: Array.isArray(restored.rebuiltProducts) ? restored.rebuiltProducts.length : 0
                });

                setSyncProgress(2);
                setSyncStep('Applying restored settings...');
                const settingsApplyStartedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();
                console.log('[restore] applying settings', {
                    promotions: Array.isArray(restored.promotions) ? restored.promotions.length : 0,
                    freightRates: Array.isArray(restored.freightRates) ? restored.freightRates.length : 0,
                    adGroups: Array.isArray(restored.adGroups) ? restored.adGroups.length : 0
                });

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
                setCustomReportPresets(restored.customReportPresets);
                if (Array.isArray(restored.priceCheckTemplates)) setPriceCheckTemplates(restored.priceCheckTemplates);
                setUploadTimestamps(restored.uploadTimestamps);
                setBrandMap(restored.brandMap);
                setCategoryMap(restored.categoryMap);
                setSkuFamilies(restored.skuFamilies);

                localStorage.setItem('sello_upload_timestamps', JSON.stringify(restored.uploadTimestamps));
                setUserProfile(prev => ({ ...prev, ...restored.userProfile }));

                if (restored.thresholds) {
                    setThresholds(restored.thresholds);
                    saveThresholdConfig(restored.thresholds);
                }

                if (restored.velocityLookback) {
                    setVelocityLookback(restored.velocityLookback);
                    localStorage.setItem('sello_velocity_setting', restored.velocityLookback);
                }

                await new Promise<void>(resolve => setTimeout(resolve, 0));
                console.log('[restore] settings apply scheduled', {
                    elapsedMs: Number((((typeof performance !== 'undefined' ? performance.now() : Date.now()) - settingsApplyStartedAt)).toFixed(1))
                });
                setSyncProgress(3);
                setSyncStep('Applying rebuilt transactions and product metrics...');

                setAdGroups(restored.adGroups);
                setSalesHistory(restored.rebuiltSalesHistory || restored.priceHistory || []);
                setProducts(restored.rebuiltProducts || restored.products || []);
                setLastRecalculationSummary(restored.recalculationSummary || null);
                setSearchSessions([]);
                setActiveSearchId(null);

                if (isAdminMode) setIsDirty(true);
                setSyncProgress(4);
                setSyncStep('');
                setSyncStatus('idle');
                setIsRestoring(false);
                alert(t('alert_db_restore_success'));
            } catch (err) {
                console.error('[restore] failed', {
                    elapsedMs: Number((((typeof performance !== 'undefined' ? performance.now() : Date.now()) - restoreStartedAt)).toFixed(1)),
                    error: err
                });
                setIsRestoring(false);
                setSyncStatus('error');
                setSyncStep('');
                setSyncProgress(0);
                setSyncTotal(0);
                alert(t('alert_db_restore_fail'));
            } finally {
                if (worker) worker.terminate();
            }
        };
        reader.readAsText(file);
        if (fileRestoreRef.current) fileRestoreRef.current.value = '';
    }, [
        fileRestoreRef,
        isAdminMode,
        normalizePromotionStatuses,
        setActiveSearchId,
        setAdGroups,
        setBrandMap,
        setCategoryMap,
        setCostChangeHistory,
        setCustomReportPresets,
        setFreightRates,
        setInventoryChangeHistory,
        setInventoryTemplates,
        setIsRestoring,
        setLearnedAliases,
        setLogisticsRules,
        setPriceChangeHistory,
        setPriceCheckTemplates,
        setProducts,
        setPromotions,
        setRefundHistory,
        setSalesHistory,
        setSearchConfig,
        setSearchSessions,
        setSkuFamilies,
        setStartupChoicePending,
        setStartupSyncMode,
        setStrategyRules,
        setSyncProgress,
        setSyncStatus,
        setSyncStep,
        setSyncTotal,
        setThresholds,
        setUploadTimestamps,
        setUserProfile,
        setVelocityLookback,
        setLastRecalculationSummary,
        setPricingRules,
        setIsDirty,
        t
    ]);

    const applyLoadedState = useCallback((snapshot: any, transactions: any[], refunds: any[] = []) => {
        const applyLoadedStateStartedAt = perfNowMs();
        console.log('[perf][apply-loaded-state] start', {
            snapshotProducts: Array.isArray(snapshot?.products) ? snapshot.products.length : 0,
            transactions: Array.isArray(transactions) ? transactions.length : 0,
            refunds: Array.isArray(refunds) ? refunds.length : 0
        });
        const safe = normalizeRestoredState(snapshot);
        const m = migrateRestoredDatabase(safe);
        console.log('[perf][apply-loaded-state] sanitize complete', {
            elapsedMs: perfElapsedMs(applyLoadedStateStartedAt),
            migratedProducts: Array.isArray(m.products) ? m.products.length : 0
        });
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
        setLogisticsRules(Array.isArray(m.logisticsRules) && m.logisticsRules.length > 0 ? m.logisticsRules : DEFAULT_LOGISTICS_RULES);
        setStrategyRules(m.strategyRules || DEFAULT_STRATEGY_RULES);
        setSearchConfig(m.searchConfig || DEFAULT_SEARCH_CONFIG);
        setInventoryTemplates(Array.isArray(m.inventoryTemplates) ? m.inventoryTemplates : []);
        setCustomReportPresets(Array.isArray(m.customReportPresets) ? m.customReportPresets : []);
        if (Array.isArray(m.priceCheckTemplates)) setPriceCheckTemplates(m.priceCheckTemplates);
        setBrandMap(m.brandMap || {});
        setCategoryMap(m.categoryMap || {});
        setSkuFamilies(Array.isArray(m.skuFamilies) ? m.skuFamilies : []);
        setUploadTimestamps(m.uploadTimestamps && typeof m.uploadTimestamps === 'object' ? m.uploadTimestamps : {});
        if (m.userProfile && typeof m.userProfile === 'object') {
            setUserProfile(prev => ({ ...prev, ...m.userProfile }));
        }
        if (m.thresholds) {
            setThresholds(m.thresholds);
            saveThresholdConfig(m.thresholds);
        }
        const adGroupsToUse = Array.isArray(m.adGroups) ? m.adGroups : [];
        console.log('[perf][apply-loaded-state] base state hydrated', {
            elapsedMs: perfElapsedMs(applyLoadedStateStartedAt),
            adGroups: adGroupsToUse.length,
            skuFamilies: Array.isArray(m.skuFamilies) ? m.skuFamilies.length : 0
        });
        const redistributedTransactions = redistributeAdSpend(transactions, adGroupsToUse);
        console.log('[perf][apply-loaded-state] redistribution complete', {
            elapsedMs: perfElapsedMs(applyLoadedStateStartedAt),
            redistributedTransactions: redistributedTransactions.length
        });
        const pricingRulesToUse = m.pricingRules || DEFAULT_PRICING_RULES;
        setSalesHistory(redistributedTransactions);
        const finalProducts = recalculateProductMetrics(
            Array.isArray(m.products) ? m.products : [],
            redistributedTransactions,
            velocityLookback,
            m.thresholds || thresholds,
            pricingRulesToUse,
            m.brandMap,
            m.categoryMap
        );
        console.log('[perf][apply-loaded-state] recalc complete', {
            elapsedMs: perfElapsedMs(applyLoadedStateStartedAt),
            finalProducts: finalProducts.length
        });
        setProducts(finalProducts);
        setAdGroups(adGroupsToUse);
        markSearchSessionsStale();

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
        console.log('[perf][apply-loaded-state] secondary state hydrated', {
            elapsedMs: perfElapsedMs(applyLoadedStateStartedAt),
            cohortSnapshot: Boolean(m.cohortSnapshot),
            optimalPriceResults: m.optimalPriceResults ? Object.keys(m.optimalPriceResults).length : 0,
            benchmarkNotices: Array.isArray(m.benchmarkUpdateNotices) ? m.benchmarkUpdateNotices.length : 0
        });
        console.log('[perf][apply-loaded-state] complete', {
            elapsedMs: perfElapsedMs(applyLoadedStateStartedAt),
            products: finalProducts.length,
            transactions: redistributedTransactions.length,
            refunds: Array.isArray(refunds) ? refunds.length : 0
        });
        logPerfPostCommitTail('[perf][apply-loaded-state]', applyLoadedStateStartedAt, {
            products: finalProducts.length,
            transactions: redistributedTransactions.length,
            refunds: Array.isArray(refunds) ? refunds.length : 0
        });
        return {
            startedAt: applyLoadedStateStartedAt,
            products: finalProducts.length,
            transactions: redistributedTransactions.length,
            refunds: Array.isArray(refunds) ? refunds.length : 0
        };
    }, [
        markSearchSessionsStale,
        recalculateProductMetrics,
        setAdGroups,
        setBenchmarkUpdateNotices,
        setBrandMap,
        setCategoryMap,
        setCohortSnapshot,
        setCostChangeHistory,
        setCustomReportPresets,
        setFreightRates,
        setInventoryChangeHistory,
        setInventoryTemplates,
        setLearnedAliases,
        setLogisticsRules,
        setOptimalPriceResults,
        setPriceChangeHistory,
        setPriceCheckTemplates,
        setPricingRules,
        setProducts,
        setRefundHistory,
        setSalesHistory,
        setSearchConfig,
        setSkuFamilies,
        setStrategyRules,
        setThresholds,
        setUploadTimestamps,
        setUserProfile,
        thresholds,
        velocityLookback
    ]);

    const clearClientDataForImportantRefresh = useCallback(async (token: string) => {
        await clearCache();
        localStorage.removeItem(REFUND_CURSOR_KEY);
        localStorage.removeItem(PROMO_CURSOR_KEY);
        localStorage.removeItem(PROMO_BASELINE_COMPLETE_KEY);
        localStorage.removeItem('sello_snapshot_updated_at');
        localStorage.removeItem('sello_last_synced_at');
        localStorage.setItem(FORCE_FULL_PULL_TOKEN_KEY, token);
        console.log(`[sync] important refresh cache reset complete: ${token}`);
    }, []);

    const handleSync = useCallback(async () => {
        const syncStartedAt = perfNowMs();
        setSyncStatus('syncing');
        setSyncStep('Connecting...');
        setSyncProgress(0);
        setSyncTotal(0);
        try {
            console.log('[perf][sync] start', {
                currentProducts: Array.isArray(products) ? products.length : 0,
                currentSalesHistory: Array.isArray(salesHistory) ? salesHistory.length : 0,
                currentRefunds: Array.isArray(refundHistory) ? refundHistory.length : 0
            });
            let promotionsForCache: PromotionEvent[] = normalizePromotionStatuses(promotions || []);
            const lastKnownSnapshotUpdatedAt = localStorage.getItem('sello_snapshot_updated_at') || undefined;
            const masterRes = await pullSnapshotIfUpdated(lastKnownSnapshotUpdatedAt);
            if (!masterRes.success) {
                setSyncStatus('error');
                setSyncStep('');
                return;
            }

            let incoming = !masterRes.unchanged ? masterRes.snapshot : null;
            if (!masterRes.unchanged && !incoming) {
                setSyncStatus('error');
                setSyncStep('');
                return;
            }

            if (!masterRes.unchanged) {
                setSyncStep('Loading settings...');
                const incomingFamilies: SkuFamily[] = Array.isArray(incoming.skuFamilies) ? incoming.skuFamilies : [];
                const localFamilies = skuFamilies || [];
                const conflicts = localFamilies.filter(lf => !incomingFamilies.some(ifam => ifam.id === lf.id));
                if (conflicts.length > 0) {
                    setPendingFamilyConflicts(conflicts);
                    setSyncStatus('idle');
                    setSyncStep('');
                    return;
                }
            } else {
                setSyncStep('Snapshot unchanged  -  checking transactions...');
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
                    const hasLocalInventory = Array.isArray(products) && products.length > 0;
                    if (!hasLocalInventory) {
                        setSyncStatus('error');
                        setSyncStep('');
                        setSyncProgress(0);
                        setSyncTotal(0);
                        return;
                    }
                }
            }

            const remoteForceToken = String((incoming as any)?.sync_control?.forceFullPullToken || '').trim();
            const localForceToken = localStorage.getItem(FORCE_FULL_PULL_TOKEN_KEY) || '';
            const forceImportantRefresh = Boolean(remoteForceToken && remoteForceToken !== localForceToken);
            if (forceImportantRefresh) {
                console.log(`[sync] important refresh token detected: ${remoteForceToken}`);
                setSyncStep('Important refresh detected - running full data pull...');
                await clearClientDataForImportantRefresh(remoteForceToken);
            }

            setSyncStep('Checking for new transactions...');
            const PAGE_SIZE = 2000;
            let allTransactions: PriceLog[] = [];
            const cachedTransactions = salesHistory || [];
            const localDates = cachedTransactions.map(tx => tx.date).filter(Boolean).sort();
            const localNewestDate = localDates.length > 0 ? localDates[localDates.length - 1] : null;
            console.log(
                `[sync] transactions mode: ${!forceImportantRefresh && localNewestDate && cachedTransactions.length > 0 ? 'incremental' : 'full'} ` +
                `(cached=${cachedTransactions.length}, newest=${localNewestDate || 'none'})`
            );

            if (!forceImportantRefresh && localNewestDate && cachedTransactions.length > 0) {
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
                    setSyncStep('No new transactions  -  using cached data');
                    allTransactions = cachedTransactions;
                } else {
                    allTransactions = [...newRows];
                    const totalPages = Math.ceil(totalNew / PAGE_SIZE);
                    setSyncTotal(totalPages);
                    setSyncProgress(1);
                    setSyncStep(`Loading ${totalNew.toLocaleString()} new transactions...`);

                    let page = 1;
                    let nextCursor = firstPage.nextCursor || null;
                    let hasMore = !!firstPage.hasMore;
                    while (hasMore && page < totalPages) {
                        const pageRes = await pullTransactionPageSince(localNewestDate, page, PAGE_SIZE, nextCursor);
                        if (!pageRes.success) {
                            setSyncStatus('error');
                            setSyncStep('');
                            return;
                        }
                        allTransactions = [...allTransactions, ...(pageRes.transactions || [])];
                        hasMore = !!pageRes.hasMore;
                        nextCursor = pageRes.nextCursor || null;
                        setSyncProgress(page + 1);
                        setSyncStep(`Loading new transactions... ${allTransactions.length.toLocaleString()} / ${totalNew.toLocaleString()}`);
                        page++;
                    }

                    const existingIds = new Set(cachedTransactions.map(tx => tx.id).filter(Boolean));
                    const deduped = allTransactions.filter(tx => !tx.id || !existingIds.has(tx.id));
                    allTransactions = [...deduped, ...cachedTransactions];
                    setSyncStep(`Merged ${deduped.length.toLocaleString()} new rows with ${cachedTransactions.length.toLocaleString()} cached`);
                }
            } else {
                setSyncStep('Loading transactions (first sync)...');
                const firstPage = await pullTransactionPage(0, PAGE_SIZE);
                if (!firstPage.success) {
                    setSyncStatus('error');
                    setSyncStep('');
                    return;
                }
                const totalRows = firstPage.totalRows || 0;
                allTransactions = firstPage.transactions || [];
                const totalPages = Math.ceil(totalRows / PAGE_SIZE);
                setSyncTotal(totalPages);
                setSyncProgress(1);
                setSyncStep(`Loading transactions... ${allTransactions.length.toLocaleString()} / ${totalRows.toLocaleString()}`);

                let page = 1;
                let nextCursor = firstPage.nextCursor || null;
                let hasMore = !!firstPage.hasMore;
                while (hasMore && page < totalPages) {
                    const pageRes = await pullTransactionPage(page, PAGE_SIZE, nextCursor);
                    if (!pageRes.success) {
                        setSyncStatus('error');
                        setSyncStep('');
                        return;
                    }
                    allTransactions = [...allTransactions, ...(pageRes.transactions || [])];
                    hasMore = !!pageRes.hasMore;
                    nextCursor = pageRes.nextCursor || null;
                    setSyncProgress(page + 1);
                    setSyncStep(`Loading transactions... ${allTransactions.length.toLocaleString()} / ${totalRows.toLocaleString()}`);
                    page++;
                }
            }

            setSyncStep('Applying data...');
            console.log('[perf][sync] transactions ready', {
                elapsedMs: perfElapsedMs(syncStartedAt),
                transactions: allTransactions.length,
                snapshotUpdated: !masterRes.unchanged
            });

            const lastRefundUpdatedAt = forceImportantRefresh ? undefined : (localStorage.getItem(REFUND_CURSOR_KEY) || undefined);
            const refundRes = await pullRefundsAndShipments(lastRefundUpdatedAt);
            const keepLocalIfRemoteEmpty = <T,>(label: string, remote: any, local: T[]): T[] => {
                const remoteSafe = Array.isArray(remote) ? remote as T[] : [];
                const localSafe = Array.isArray(local) ? local : [];
                if (remoteSafe.length === 0 && localSafe.length > 0) {
                    console.warn(`[sync] ${label} pull returned empty; preserving local ${localSafe.length}`);
                    return localSafe;
                }
                return remoteSafe;
            };
            const mergeById = <T extends { id?: string }>(base: T[], incomingRows: T[]): T[] => {
                const out = [...base];
                const idxById = new Map<string, number>();
                out.forEach((row, idx) => {
                    if (row?.id) idxById.set(String(row.id), idx);
                });
                for (const row of incomingRows) {
                    const id = row?.id ? String(row.id) : '';
                    if (id && idxById.has(id)) out[idxById.get(id)!] = row;
                    else out.push(row);
                }
                return out;
            };

            let refunds = refundRes.success
                ? (() => {
                    const remoteRows = Array.isArray(refundRes.refunds) ? refundRes.refunds : [];
                    const localRows = Array.isArray(refundHistory) ? refundHistory : [];
                    if (lastRefundUpdatedAt && refundRes.incremental) {
                        return remoteRows.length === 0 ? localRows : mergeById(localRows as any[], remoteRows as any[]);
                    }
                    return keepLocalIfRemoteEmpty('refunds', remoteRows, localRows);
                })()
                : (refundHistory || []);
            if (!refundRes.success) {
                console.warn('[sync] refunds pull failed (non-fatal):', refundRes.error);
            } else if (refundRes.latestUpdatedAt) {
                localStorage.setItem(REFUND_CURSOR_KEY, refundRes.latestUpdatedAt);
            }

            if (refundRes.success && lastRefundUpdatedAt && refundRes.incremental) {
                try {
                    const sigRes = await pullRefundSignatures();
                    const serverCount = Number(sigRes.totalRows || 0);
                    const localCount = Array.isArray(refunds) ? refunds.length : 0;
                    if (sigRes.success && serverCount > 0 && localCount !== serverCount) {
                        console.warn(`[sync] refunds count mismatch after incremental pull (local=${localCount}, server=${serverCount}); forcing full refunds pull`);
                        const fullRefundRes = await pullRefundsAndShipments(undefined);
                        if (fullRefundRes.success && Array.isArray(fullRefundRes.refunds)) {
                            refunds = fullRefundRes.refunds;
                            if (fullRefundRes.latestUpdatedAt) {
                                localStorage.setItem(REFUND_CURSOR_KEY, fullRefundRes.latestUpdatedAt);
                            }
                            console.log(`[sync] refunds self-healed via full pull - ${refunds.length} rows`);
                        } else {
                            console.warn('[sync] refunds full-pull fallback failed (non-fatal):', fullRefundRes.error);
                        }
                    }
                } catch (error) {
                    console.warn('[sync] refunds mismatch check failed (non-fatal):', error);
                }
            }

            const promoBaselineComplete = !forceImportantRefresh && localStorage.getItem(PROMO_BASELINE_COMPLETE_KEY) === '1';
            const localPromotions = Array.isArray(promotions) ? promotions : [];
            const canUsePromoIncremental = promoBaselineComplete && localPromotions.length > 0;
            const lastPromoUpdatedAt = canUsePromoIncremental ? (localStorage.getItem(PROMO_CURSOR_KEY) || undefined) : undefined;
            if (promoBaselineComplete && localPromotions.length === 0) {
                console.warn('[sync] promotions local baseline empty; ignoring cursor and forcing full pull');
            }

            let promoRes = await pullPromotionsSince(lastPromoUpdatedAt);
            if (promoRes.success && Array.isArray(promoRes.promotions)) {
                const isIncrementalEmpty = Boolean(lastPromoUpdatedAt && promoRes.incremental && promoRes.promotions.length === 0);
                if (isIncrementalEmpty && localPromotions.length === 0) {
                    console.warn('[sync] promotions incremental returned empty with empty local state; retrying full pull');
                    promoRes = await pullPromotionsSince(undefined);
                }
                const remotePromotions = Array.isArray(promoRes.promotions) ? promoRes.promotions : [];
                const nextPromotionsRaw = (lastPromoUpdatedAt && promoRes.incremental)
                    ? (remotePromotions.length === 0
                        ? localPromotions
                        : mergeById(localPromotions as any[], remotePromotions as any[]))
                    : keepLocalIfRemoteEmpty('promotions', remotePromotions, localPromotions);
                const nextPromotions = normalizePromotionStatuses(nextPromotionsRaw);
                setPromotions(nextPromotions);
                promotionsForCache = nextPromotions;
                console.log(`[sync] promotions loaded  -  ${nextPromotions.length} campaigns`);
                if (!promoBaselineComplete) localStorage.setItem(PROMO_BASELINE_COMPLETE_KEY, '1');
                if (promoRes.latestUpdatedAt) localStorage.setItem(PROMO_CURSOR_KEY, promoRes.latestUpdatedAt);

                if (lastPromoUpdatedAt && promoRes.incremental) {
                    try {
                        const promoSigRes = await pullPromotionSignatures();
                        const serverCount = Number(promoSigRes.totalRows || 0);
                        const localCount = Array.isArray(nextPromotions) ? nextPromotions.length : 0;
                        if (promoSigRes.success && serverCount > 0 && localCount !== serverCount) {
                            console.warn(`[sync] promotions count mismatch after incremental pull (local=${localCount}, server=${serverCount}); forcing full promotions pull`);
                            const fullPromoRes = await pullPromotionsSince(undefined);
                            if (fullPromoRes.success && Array.isArray(fullPromoRes.promotions)) {
                                const fullPromotions = normalizePromotionStatuses(fullPromoRes.promotions);
                                setPromotions(fullPromotions);
                                promotionsForCache = fullPromotions;
                                if (fullPromoRes.latestUpdatedAt) localStorage.setItem(PROMO_CURSOR_KEY, fullPromoRes.latestUpdatedAt);
                                localStorage.setItem(PROMO_BASELINE_COMPLETE_KEY, '1');
                                console.log(`[sync] promotions self-healed via full pull - ${fullPromotions.length} campaigns`);
                            } else {
                                console.warn('[sync] promotions full-pull fallback failed (non-fatal):', fullPromoRes.error);
                            }
                        }
                    } catch (error) {
                        console.warn('[sync] promotions mismatch check failed (non-fatal):', error);
                    }
                }
            } else {
                console.warn('[sync] promotions pull failed (non-fatal):', promoRes.error);
                localStorage.removeItem(PROMO_BASELINE_COMPLETE_KEY);
            }

            const syncApplyStartedAt = perfNowMs();
            if (incoming) {
                setPostApplySource('sync');
                applyLoadedState(incoming, allTransactions, refunds);
            } else {
                setPostApplySource('sync');
                setRefundHistory(Array.isArray(refunds) ? refunds : []);
                const redistributedTransactions = redistributeAdSpend(allTransactions, adGroups);
                setSalesHistory(redistributedTransactions);
                const finalProducts = recalculateProductMetrics(
                    products,
                    redistributedTransactions,
                    velocityLookback,
                    thresholds,
                    pricingRules,
                    brandMap,
                    categoryMap
                );
                setProducts(finalProducts);
                markSearchSessionsStale();
            }
            console.log('[perf][sync] apply complete', {
                elapsedMs: perfElapsedMs(syncApplyStartedAt),
                totalElapsedMs: perfElapsedMs(syncStartedAt),
                transactions: allTransactions.length,
                refunds: Array.isArray(refunds) ? refunds.length : 0,
                usedIncomingSnapshot: Boolean(incoming)
            });
            logPerfPostCommitTail('[perf][sync]', syncApplyStartedAt, {
                totalElapsedMs: perfElapsedMs(syncStartedAt),
                transactions: allTransactions.length,
                refunds: Array.isArray(refunds) ? refunds.length : 0,
                usedIncomingSnapshot: Boolean(incoming)
            });

            const resolvedProducts = incoming ? (Array.isArray(incoming.products) ? incoming.products : []) : (Array.isArray(products) ? products : []);
            const hasResolvedInventory = resolvedProducts.length > 0;
            const hasResolvedHistory = allTransactions.length > 0 || (Array.isArray(refunds) && refunds.length > 0);
            if (!hasResolvedInventory && hasResolvedHistory) {
                console.warn(`[sync] inventory integrity check failed after sync (products=${resolvedProducts.length}, transactions=${allTransactions.length}, refunds=${Array.isArray(refunds) ? refunds.length : 0})`);
                setSyncStatus('error');
                setSyncStep('');
                setSyncProgress(0);
                setSyncTotal(0);
                return;
            }

            const time = masterRes.lastUpdatedAt || new Date().toISOString();
            localStorage.setItem('sello_snapshot_updated_at', time);
            setLastSyncedAt(time);
            localStorage.setItem('sello_last_synced_at', time);

            const versionRes = await checkVersion();
            const version = versionRes.lastPushAt || time;
            const snapshotForCacheBase = !masterRes.unchanged && incoming ? incoming : getSharedSnapshot();
            const snapshotForCache = { ...snapshotForCacheBase, promotions: promotionsForCache };
            await saveToCache(snapshotForCache, allTransactions, refunds, [], version);
            setSyncStep('Finalizing interface...');
            await waitForUiResponsiveAfterApply('[perf][sync]', syncStartedAt, {
                transactions: allTransactions.length,
                refunds: Array.isArray(refunds) ? refunds.length : 0,
                promotions: Array.isArray(promotionsForCache) ? promotionsForCache.length : 0,
                usedIncomingSnapshot: Boolean(incoming)
            });

            if (forceImportantRefresh && remoteForceToken) {
                localStorage.setItem(FORCE_FULL_PULL_TOKEN_KEY, remoteForceToken);
                console.log(`[sync] important refresh token consumed: ${remoteForceToken}`);
            }
            console.log(`[sync] complete  -  cached version: ${version}`);
            console.log('[perf][sync] complete', {
                elapsedMs: perfElapsedMs(syncStartedAt),
                transactions: allTransactions.length,
                refunds: Array.isArray(refunds) ? refunds.length : 0,
                promotions: Array.isArray(promotionsForCache) ? promotionsForCache.length : 0
            });
            setSyncProgress(0);
            setSyncTotal(0);
            setSyncStep('');
            setSyncStatus('idle');
        } catch (error) {
            console.error('[sync] error:', error);
            setSyncStatus('error');
            setSyncStep('');
            setSyncProgress(0);
            setSyncTotal(0);
        }
    }, [
        adGroups,
        applyLoadedState,
        brandMap,
        categoryMap,
        clearClientDataForImportantRefresh,
        getSharedSnapshot,
        markSearchSessionsStale,
        normalizePromotionStatuses,
        pricingRules,
        products,
        promotions,
        refundHistory,
        recalculateProductMetrics,
        salesHistory,
        setLastSyncedAt,
        setPendingFamilyConflicts,
        setPostApplySource,
        setProducts,
        setPromotions,
        setRefundHistory,
        setSalesHistory,
        setSyncProgress,
        setSyncStatus,
        setSyncStep,
        setSyncTotal,
        skuFamilies,
        thresholds,
        velocityLookback
    ]);

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
    }, [handleSync, pendingFamilyConflicts, setPendingFamilyConflicts]);

    const initRanRef = useRef(false);
    const handleStartSyncNow = useCallback(() => {
        setStartupSyncMode('sync');
        setStartupChoicePending(false);
    }, [setStartupChoicePending, setStartupSyncMode]);

    const handleStartLocalOnly = useCallback(() => {
        setStartupSyncMode('local');
        setStartupChoicePending(false);
    }, [setStartupChoicePending, setStartupSyncMode]);

    useEffect(() => {
        if (startupChoicePending || !startupSyncMode || initRanRef.current) return;
        initRanRef.current = true;

        const loadCacheOnly = async () => {
            const startupLoadStartedAt = perfNowMs();
            console.log('[init] startup choice: local cache only');
            setSyncStatus('syncing');
            const cache = await loadFromCache();
            if (cache) {
                const cachedProducts = Array.isArray(cache.snapshot?.products) ? cache.snapshot.products : [];
                const cachedTransactions = Array.isArray(cache.transactions) ? cache.transactions : [];
                const cachedRefunds = Array.isArray(cache.refunds) ? cache.refunds : [];
                const hasHistoryButNoInventory = cachedProducts.length === 0 && (cachedTransactions.length > 0 || cachedRefunds.length > 0);
                if (hasHistoryButNoInventory) {
                    console.warn(`[init] local-only cache rejected - products:${cachedProducts.length}, transactions:${cachedTransactions.length}, refunds:${cachedRefunds.length}`);
                } else {
                    setPostApplySource('local-cache-load');
                    const applyResult = applyLoadedState(cache.snapshot, cache.transactions, cache.refunds || []);
                    const time = localStorage.getItem('sello_last_synced_at') || cache.cachedAt;
                    setLastSyncedAt(time);
                    const cachedPromotions = normalizePromotionStatuses(Array.isArray(cache.snapshot?.promotions) ? cache.snapshot.promotions : []);
                    if (cachedPromotions.length > 0) setPromotions(cachedPromotions);
                    console.log('[init] loaded from local cache only');
                    setSyncStep('Finalizing interface...');
                    await waitForUiResponsiveAfterApply('[perf][local-cache-load]', startupLoadStartedAt, {
                        applyElapsedMs: perfElapsedMs(applyResult.startedAt),
                        products: applyResult.products,
                        transactions: applyResult.transactions,
                        refunds: applyResult.refunds
                    });
                }
            } else {
                console.warn('[init] local-only start requested but no cache found');
            }
            setSyncStatus('idle');
        };

        const initApp = async () => {
            if (startupSyncMode === 'local') {
                await loadCacheOnly();
                return;
            }
            const versionRes = await checkVersion();
            const dbVersion = versionRes.success ? versionRes.lastPushAt : null;
            const localVersion = getCachedVersion();
            const lastKnownSnapshotUpdatedAt = localStorage.getItem('sello_snapshot_updated_at') || undefined;
            const masterRes = await pullSnapshotIfUpdated(lastKnownSnapshotUpdatedAt);
            const remoteForceToken = String((masterRes as any)?.forceFullPullToken || '').trim();
            const localForceToken = localStorage.getItem(FORCE_FULL_PULL_TOKEN_KEY) || '';
            const forceImportantRefresh = Boolean(remoteForceToken && remoteForceToken !== localForceToken);
            if (forceImportantRefresh) {
                console.log(`[init] important refresh token detected: ${remoteForceToken}`);
                await clearClientDataForImportantRefresh(remoteForceToken);
            }

            console.log(`[init] DB version: ${dbVersion}, local version: ${localVersion}`);

            if (!forceImportantRefresh && dbVersion && localVersion && dbVersion === localVersion) {
                console.log('[init] versions match  -  loading from cache');
                setSyncStatus('syncing');
                const cache = await loadFromCache();
                if (cache) {
                    const cachedProducts = Array.isArray(cache.snapshot?.products) ? cache.snapshot.products : [];
                    const cachedTransactions = Array.isArray(cache.transactions) ? cache.transactions : [];
                    const cachedRefunds = Array.isArray(cache.refunds) ? cache.refunds : [];
                    const hasHistoryButNoInventory = cachedProducts.length === 0 && (cachedTransactions.length > 0 || cachedRefunds.length > 0);
                    if (hasHistoryButNoInventory) {
                        console.warn(`[init] cache rejected - products:${cachedProducts.length}, transactions:${cachedTransactions.length}, refunds:${cachedRefunds.length}`);
                        setSyncStatus('idle');
                    } else {
                        setPostApplySource('cache-load');
                        const applyResult = applyLoadedState(cache.snapshot, cache.transactions, cache.refunds || []);
                        const time = localStorage.getItem('sello_last_synced_at') || cache.cachedAt;
                        setLastSyncedAt(time);
                        const cachedPromotions = normalizePromotionStatuses(Array.isArray(cache.snapshot?.promotions) ? cache.snapshot.promotions : []);
                        if (cachedPromotions.length > 0) setPromotions(cachedPromotions);
                        setSyncStep('Finalizing interface...');
                        await waitForUiResponsiveAfterApply('[perf][cache-load]', applyResult.startedAt, {
                            products: applyResult.products,
                            transactions: applyResult.transactions,
                            refunds: applyResult.refunds
                        });
                        console.log('[init] loaded from cache instantly');
                        if (cachedPromotions.length > 0) {
                            localStorage.setItem(PROMO_BASELINE_COMPLETE_KEY, '1');
                        }
                        setSyncStatus('idle');
                        return;
                    }
                }
            }

            console.log('[init] syncing from database');
            handleSync();
        };

        initApp();
    }, [
        startupChoicePending,
        startupSyncMode,
        applyLoadedState,
        clearClientDataForImportantRefresh,
        handleSync,
        normalizePromotionStatuses,
        setLastSyncedAt,
        setPostApplySource,
        setPromotions,
        setSyncStep,
        setSyncStatus
    ]);

    return {
        getSharedSnapshot,
        handleBackup,
        handleRestore,
        applyLoadedState,
        handleSync,
        resolveConflicts,
        handleStartSyncNow,
        handleStartLocalOnly
    };
};
