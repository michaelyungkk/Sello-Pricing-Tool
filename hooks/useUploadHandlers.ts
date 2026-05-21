import { useCallback } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { VAT_MULTIPLIER } from '../constants';
import type {
    AttributeMap,
    BenchmarkUpdateNotice,
    CostChangeRecord,
    FreightRate,
    HistoryPayload,
    InventoryChangeRecord,
    PriceChangeRecord,
    PriceLog,
    PricingRules,
    Product,
    RefundLog,
    SkuCostDetail,
    SkuFamily,
    VelocityLookback
} from '../types';
import type { CohortSnapshot } from '../types';
import { detectBenchmarkUpdateNeeded } from '../services/cohortAnalysis';
import { getTodayKeyMelbourne } from '../services/dateUtils';
import { toNumber } from '../services/metrics';
import { repairMojibakeText } from '../services/restoreSanitizer';
import { buildCanonicalResolver, getCanonicalSku } from '../services/skuNormalization';
import { getThresholdConfig } from '../services/thresholdsConfig';
import { logPerfPostCommitTail, perfElapsedMs, perfNowMs, waitForUiResponsiveAfterApply } from '../services/uiSettle';

type PostApplySource =
    | 'none'
    | 'sales-import'
    | 'refund-import'
    | 'inventory-import'
    | 'freight-upload'
    | 'sync'
    | 'cache-load'
    | 'local-cache-load';

type PendingSalesReconciliation = {
    upsertKeys: string[];
    removedKeys: string[];
    added: number;
    changed: number;
    removed: number;
};

type SalesImportDirective = {
    salesPushMode: 'incremental' | 'reconciliation' | 'full_snapshot';
    reason: string;
    reconciliationPlan?: PendingSalesReconciliation | null;
};

type ProgressReporter = (status: { message: string; progress: number }) => void;

type RecalculateProductMetrics = (
    products: Product[],
    historyOrMap: PriceLog[] | Map<string, PriceLog[]>,
    lookback: VelocityLookback,
    thresholds: ReturnType<typeof getThresholdConfig>,
    pricingRules?: PricingRules,
    brandMap?: AttributeMap,
    categoryMap?: AttributeMap
) => Product[];

type UseUploadHandlersDeps = {
    products: Product[];
    salesHistory: PriceLog[];
    refundHistory: RefundLog[];
    priceHistoryMap: Map<string, PriceLog[]>;
    velocityLookback: VelocityLookback;
    pricingRules: PricingRules;
    brandMap: AttributeMap;
    categoryMap: AttributeMap;
    skuFamilies: SkuFamily[];
    cohortSnapshot: CohortSnapshot | null;
    learnedAliases: Record<string, string>;
    isAdminMode: boolean;
    pendingSalesReconciliationRef: MutableRefObject<PendingSalesReconciliation | null>;
    setPostApplySource: Dispatch<SetStateAction<PostApplySource>>;
    setSalesPushMode: Dispatch<SetStateAction<'incremental' | 'reconciliation' | 'full_snapshot'>>;
    setLearnedAliases: Dispatch<SetStateAction<Record<string, string>>>;
    setSalesHistory: Dispatch<SetStateAction<PriceLog[]>>;
    setProducts: Dispatch<SetStateAction<Product[]>>;
    setPricingRules: Dispatch<SetStateAction<PricingRules>>;
    setIsDirty: Dispatch<SetStateAction<boolean>>;
    setBenchmarkUpdateNotices: Dispatch<SetStateAction<BenchmarkUpdateNotice[]>>;
    setPendingFamilySuggestions: Dispatch<SetStateAction<SkuFamily[]>>;
    setCostChangeHistory: Dispatch<SetStateAction<CostChangeRecord[]>>;
    setInventoryChangeHistory: Dispatch<SetStateAction<InventoryChangeRecord[]>>;
    setRefundHistory: Dispatch<SetStateAction<RefundLog[]>>;
    setFreightRates: Dispatch<SetStateAction<FreightRate[]>>;
    setPriceChangeHistory: Dispatch<SetStateAction<PriceChangeRecord[]>>;
    setIsSalesImportModalOpen: Dispatch<SetStateAction<boolean>>;
    markSearchSessionsStale: () => void;
    updateTimestamp: (key: string) => void;
    recalculateProductMetrics: RecalculateProductMetrics;
    isArrivedShipmentStatus: (status?: string) => boolean;
};

export const useUploadHandlers = ({
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
}: UseUploadHandlersDeps) => {
    const handleSalesImportConfirm = useCallback(async (
        updatedProductsFromImport: Product[],
        newDateLabels?: { current: string; last: string },
        historyPayload?: HistoryPayload[],
        newShipmentLogs?: any[],
        discoveredPlatforms?: string[],
        newlyLearnedAliases?: Record<string, string>,
        importDirective?: SalesImportDirective,
        progressReporter?: ProgressReporter
    ) => {
        void newDateLabels;
        void newShipmentLogs;
        const salesImportStartedAt = perfNowMs();
        const reportProgress = (message: string, progress: number) => {
            progressReporter?.({ message, progress });
        };

        setPostApplySource('sales-import');
        reportProgress('Applying sales import...', 78);
        console.log('[perf][sales-import] start', {
            currentProducts: Array.isArray(products) ? products.length : 0,
            currentSalesHistory: Array.isArray(salesHistory) ? salesHistory.length : 0,
            incomingProducts: Array.isArray(updatedProductsFromImport) ? updatedProductsFromImport.length : 0,
            historyPayload: Array.isArray(historyPayload) ? historyPayload.length : 0,
            pushMode: importDirective?.salesPushMode || null
        });

        if (newlyLearnedAliases) {
            setLearnedAliases(prev => ({ ...(prev || {}), ...newlyLearnedAliases }));
        }

        if (importDirective?.salesPushMode) {
            setSalesPushMode(importDirective.salesPushMode);
            console.log(`[sales-import] push mode set: ${importDirective.salesPushMode} (${importDirective.reason || 'no reason'})`);
        }

        let updatedPriceHistory = [...(salesHistory || [])];
        if (historyPayload && historyPayload.length > 0) {
            const newLogs: PriceLog[] = historyPayload.map(h => {
                const adsSpend = h.adsSpend ?? h.adsFee ?? 0;
                const isAdOnly = (h.price ?? 0) === 0 && adsSpend > 0;
                const normalizedProfit = (h.profit ?? 0) === 0 && isAdOnly ? -adsSpend : h.profit;
                return {
                    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
                    sku: h.sku,
                    date: h.date,
                    price: h.price,
                    velocity: h.velocity,
                    margin: h.margin,
                    profit: normalizedProfit,
                    adsSpend,
                    rawAdsSpend: h.rawAdsSpend ?? adsSpend,
                    platform: h.platform,
                    orderId: h.orderId,
                    postcode: h.postcode,
                    logisticPartner: h.logisticPartner,
                    logisticService: h.logisticService,
                    realPostage: h.realPostage,
                    realExtraFreight: h.realExtraFreight,
                    cogs: h.cogs,
                    sellingFee: h.sellingFee,
                    adsFee: h.adsFee,
                    postage: h.postage,
                    otherFee: h.otherFee,
                    subscriptionFee: h.subscriptionFee,
                    wmsFee: h.wmsFee,
                    promoRel: h.promoRel
                };
            });

            const rowsWithWaterfallCosts = newLogs.filter(l =>
                l.cogs !== undefined ||
                l.sellingFee !== undefined ||
                l.adsFee !== undefined ||
                l.postage !== undefined ||
                l.otherFee !== undefined ||
                l.subscriptionFee !== undefined ||
                l.wmsFee !== undefined ||
                l.promoRel !== undefined
            ).length;
            console.log(
                `[sales-import] mapped ${newLogs.length} logs; ` +
                `${rowsWithWaterfallCosts} rows include waterfall cost fields`
            );

            updatedPriceHistory = [...newLogs];

            if (importDirective?.salesPushMode === 'reconciliation' && importDirective.reconciliationPlan) {
                pendingSalesReconciliationRef.current = importDirective.reconciliationPlan;
                console.log('[sales-import] reconciliation plan prepared', {
                    upserts: importDirective.reconciliationPlan.upsertKeys.length,
                    added: importDirective.reconciliationPlan.added,
                    changed: importDirective.reconciliationPlan.changed,
                    removed: importDirective.reconciliationPlan.removed
                });
            } else {
                pendingSalesReconciliationRef.current = null;
            }
        }

        console.log('[perf][sales-import] mapping complete', {
            elapsedMs: perfElapsedMs(salesImportStartedAt),
            updatedPriceHistory: updatedPriceHistory.length
        });

        const mergedProducts = (products || []).map(p => {
            const update = (updatedProductsFromImport || []).find(u => u.id === p.id);
            return update ? update : p;
        });
        const finalProducts = recalculateProductMetrics(
            mergedProducts,
            updatedPriceHistory,
            velocityLookback,
            getThresholdConfig(),
            pricingRules,
            brandMap,
            categoryMap
        );
        console.log('[perf][sales-import] recalc complete', {
            elapsedMs: perfElapsedMs(salesImportStartedAt),
            finalProducts: finalProducts.length
        });

        await new Promise<void>((resolve) => {
            setTimeout(() => {
                setSalesHistory(updatedPriceHistory);
                setProducts(finalProducts);
                markSearchSessionsStale();
                if (discoveredPlatforms && discoveredPlatforms.length > 0) {
                    setPricingRules(prev => {
                        const nextRules = { ...(prev || {}) };
                        let changed = false;
                        discoveredPlatforms.forEach(platform => {
                            if (!nextRules[platform]) {
                                nextRules[platform] = {
                                    markup: 0,
                                    commission: 15,
                                    manager: 'Unassigned',
                                    color: '#6b7280',
                                    pricingControl: 'MERCHANT',
                                    feeModel: 'COMMISSION_PCT',
                                    adsEnabled: false
                                };
                                changed = true;
                            }
                        });
                        return changed ? nextRules : prev;
                    });
                }
                updateTimestamp('Sales');
                if (isAdminMode) {
                    setIsDirty(true);
                }
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => resolve());
                });
            }, 0);
        });

        console.log('[perf][sales-import] state handoff complete', {
            elapsedMs: perfElapsedMs(salesImportStartedAt),
            salesHistory: updatedPriceHistory.length,
            products: finalProducts.length
        });
        logPerfPostCommitTail('[perf][sales-import]', salesImportStartedAt, {
            salesHistory: updatedPriceHistory.length,
            products: finalProducts.length,
            pushMode: importDirective?.salesPushMode || null
        });

        await waitForUiResponsiveAfterApply('[perf][sales-import]', salesImportStartedAt, {
            salesHistory: updatedPriceHistory.length,
            products: finalProducts.length,
            pushMode: importDirective?.salesPushMode || null
        });
        reportProgress('Refreshing visible page...', 86);

        if (historyPayload && historyPayload.length > 0 && cohortSnapshot) {
            try {
                reportProgress('Checking benchmark shifts...', 92);
                console.log('[perf][sales-import][benchmark-check] start', {
                    elapsedMsFromImportStart: perfElapsedMs(salesImportStartedAt)
                });
                const resolver = buildCanonicalResolver({ ...(learnedAliases || {}), ...(newlyLearnedAliases || {}) });
                const affectedSkus = Array.from(new Set(historyPayload.map(tx => resolver(tx.sku))));
                const notices = detectBenchmarkUpdateNeeded(finalProducts, cohortSnapshot, affectedSkus);
                if (notices.length > 0) {
                    setBenchmarkUpdateNotices(prev => {
                        const merged = [...prev];
                        notices.forEach(notice => {
                            const existing = merged.findIndex(item => item.category === notice.category);
                            if (existing >= 0) {
                                merged[existing] = {
                                    ...merged[existing],
                                    skuCount: merged[existing].skuCount + notice.skuCount
                                };
                            } else {
                                merged.push(notice);
                            }
                        });
                        return merged;
                    });
                }
                console.log('[perf][sales-import][benchmark-check] complete', {
                    elapsedMsFromImportStart: perfElapsedMs(salesImportStartedAt),
                    affectedSkus: affectedSkus.length,
                    notices: notices.length
                });
                await waitForUiResponsiveAfterApply('[perf][sales-import][benchmark-check]', salesImportStartedAt, {
                    affectedSkus: affectedSkus.length,
                    notices: notices.length
                });
                reportProgress('Finalizing import...', 99);
            } catch (error) {
                console.warn('[sales-import] benchmark shift detection failed:', error);
            }
        }
    }, [
        products,
        salesHistory,
        velocityLookback,
        pricingRules,
        brandMap,
        categoryMap,
        isAdminMode,
        cohortSnapshot,
        learnedAliases,
        pendingSalesReconciliationRef,
        setBenchmarkUpdateNotices,
        setIsDirty,
        setLearnedAliases,
        setPostApplySource,
        setPricingRules,
        setProducts,
        setSalesHistory,
        setSalesPushMode,
        markSearchSessionsStale,
        recalculateProductMetrics,
        updateTimestamp
    ]);

    const handleInventoryImport = useCallback(async (data: any[]) => {
        const startedAt = perfNowMs();
        console.log('[perf][inventory-import] start', {
            incomingRows: data.length,
            currentProducts: products.length,
            currentSalesHistory: salesHistory.length
        });
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
            Object.entries(item).forEach(([key, value]) => {
                if (value === undefined) return;
                if (key === 'stock') existing[key] = (Number(existing[key]) || 0) + Number(value);
                else if (key === 'sku') existing[key] = canonicalSku;
                else existing[key] = value;
            });
            aggregatedDataMap.set(canonicalSku, existing);
        });

        const finalData = Array.from(aggregatedDataMap.values());
        console.log('[perf][inventory-import] aggregate complete', {
            elapsedMs: perfElapsedMs(startedAt),
            aggregatedSkus: finalData.length
        });

        setPostApplySource('inventory-import');
        setProducts(prev => {
            const nextProducts = [...(prev || [])];
            finalData.forEach(item => {
                const existingIndex = nextProducts.findIndex(product => product.sku === item.sku);
                const existingProduct = existingIndex !== -1 ? nextProducts[existingIndex] : null;

                if (existingProduct) {
                    const existing = { ...existingProduct };
                    if (item.stock !== undefined) {
                        const prevStock = existing.stockLevel || 0;
                        const newStock = Number(item.stock);
                        if (newStock > prevStock) {
                            const deltaStock = newStock - prevStock;
                            const pctIncrease = prevStock === 0 ? 1 : deltaStock / prevStock;
                            const isSignificant = pctIncrease >= 0.05;
                            const hasMatchingShipment = (existing.shipments || []).some(shipment => {
                                if (!shipment.eta) return false;
                                const shipmentDate = new Date(shipment.eta).getTime();
                                const reportTime = new Date(reportDate).getTime();
                                return Math.abs((shipmentDate - reportTime) / (1000 * 60 * 60 * 24)) <= 7;
                            });
                            const isStrategic = isSignificant && hasMatchingShipment;
                            inventoryLogs.push({
                                id: `inv-chg-${timestamp}-${item.sku}`,
                                sku: item.sku,
                                productName: existing.name,
                                timestamp,
                                date: reportDate,
                                prevStock,
                                newStock,
                                deltaStock,
                                source: 'ERP_UPLOAD',
                                uploadBatchId,
                                isStrategic,
                                reason: isStrategic ? 'Strategic Restock' : 'Routine Adjustment'
                            });
                        }
                        existing.stockLevel = newStock;
                    }
                    if (item.cost !== undefined) {
                        const oldCost = existing.costPrice || 0;
                        const newCost = Number(item.cost);
                        if (oldCost > 0 && Math.abs(oldCost - newCost) > 0.02) {
                            costChanges.push({
                                id: `cost-chg-${Date.now()}-${item.sku}`,
                                sku: item.sku,
                                productName: existing.name,
                                date: reportDate,
                                oldCost,
                                newCost,
                                changeType: newCost > oldCost ? 'INCREASE' : 'DECREASE',
                                percentChange: ((newCost - oldCost) / oldCost) * 100
                            });
                        }
                        existing.costPrice = newCost;
                    }
                    if (item.dailyAverageSales !== undefined) existing.dailyAverageSales = toNumber(item.dailyAverageSales);
                    if (item.name) existing.name = item.name;
                    if (item.brand) existing.brand = item.brand;
                    if (item.category) existing.category = item.category;
                    if (item.gradeLevel !== undefined && item.gradeLevel !== null) existing.gradeLevel = item.gradeLevel;
                    if (item.subcategory) existing.subcategory = item.subcategory;
                    if (item.agedStock !== undefined) existing.agedStockQty = item.agedStock;
                    if (item.inventoryStatus) existing.inventoryStatus = item.inventoryStatus;
                    if (item.cartonDimensions) existing.cartonDimensions = item.cartonDimensions;
                    if (!existing.landedAt) existing.landedAt = reportDate;
                    existing.lastUpdated = reportDate;
                    nextProducts[existingIndex] = existing;
                    return;
                }

                nextProducts.push({
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
                    landedAt: reportDate,
                    lastUpdated: reportDate,
                    category: item.category || 'Uncategorized',
                    subcategory: item.subcategory,
                    brand: item.brand,
                    dailyAverageSales: toNumber(item.dailyAverageSales),
                    gradeLevel: item.gradeLevel ?? undefined,
                    agedStockQty: item.agedStock ?? undefined,
                    inventoryStatus: item.inventoryStatus ?? undefined,
                    cartonDimensions: item.cartonDimensions ?? undefined
                });
            });
            return nextProducts;
        });

        await new Promise<void>(resolve => setTimeout(resolve, 0));
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        console.log('[perf][inventory-import] base product handoff complete', {
            elapsedMs: perfElapsedMs(startedAt),
            products: finalData.length
        });

        setProducts(prev => {
            const currentThresholds = getThresholdConfig();
            return recalculateProductMetrics(prev || [], priceHistoryMap, velocityLookback, currentThresholds, pricingRules, brandMap, categoryMap);
        });

        await new Promise<void>(resolve => setTimeout(resolve, 0));
        await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
        console.log('[perf][inventory-import] recalc handoff complete', {
            elapsedMs: perfElapsedMs(startedAt),
            products: products.length,
            aggregatedSkus: finalData.length
        });

        const prefixGroups = new Map<string, string[]>();
        data.forEach(item => {
            const sku = String(item.sku || '').trim();
            if (!sku) return;
            const parts = sku.split('-');
            if (parts.length < 3) return;
            const prefix = `${parts[0]}-${parts[parts.length - 1]}`;
            if (!prefixGroups.has(prefix)) prefixGroups.set(prefix, []);
            prefixGroups.get(prefix)!.push(sku);
        });

        const newSuggestions: SkuFamily[] = [];
        prefixGroups.forEach((memberSkus, prefix) => {
            if (memberSkus.length < 2) return;
            const alreadyExists = skuFamilies.some(family => memberSkus.every(sku => family.memberSkus.includes(sku)));
            if (alreadyExists) return;
            newSuggestions.push({
                id: `suggest-${Date.now()}-${prefix}`,
                name: prefix,
                memberSkus,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            });
        });

        if (newSuggestions.length > 0) {
            setPendingFamilySuggestions(prev => [...prev, ...newSuggestions]);
            alert(`${newSuggestions.length} new SKU family groups detected. Review them in Family Groups.`);
        }

        if (costChanges.length > 0) setCostChangeHistory(prev => [...costChanges, ...(prev || [])]);
        if (inventoryLogs.length > 0) setInventoryChangeHistory(prev => [...inventoryLogs, ...(prev || [])]);
        updateTimestamp('Inventory');
        if (isAdminMode) setIsDirty(true);
        console.log('[perf][inventory-import] complete', {
            elapsedMs: perfElapsedMs(startedAt),
            costChanges: costChanges.length,
            inventoryLogs: inventoryLogs.length,
            familySuggestions: newSuggestions.length
        });
        logPerfPostCommitTail('[perf][inventory-import]', startedAt, {
            costChanges: costChanges.length,
            inventoryLogs: inventoryLogs.length,
            familySuggestions: newSuggestions.length
        });
        await waitForUiResponsiveAfterApply('[perf][inventory-import]', startedAt, {
            costChanges: costChanges.length,
            inventoryLogs: inventoryLogs.length,
            familySuggestions: newSuggestions.length
        });
    }, [
        products.length,
        salesHistory.length,
        priceHistoryMap,
        velocityLookback,
        pricingRules,
        brandMap,
        categoryMap,
        skuFamilies,
        isAdminMode,
        recalculateProductMetrics,
        setCostChangeHistory,
        setInventoryChangeHistory,
        setIsDirty,
        setPendingFamilySuggestions,
        setPostApplySource,
        setProducts,
        updateTimestamp
    ]);

    const handleResetSalesData = useCallback(() => {
        setSalesHistory([]);
        pendingSalesReconciliationRef.current = null;
        const currentThresholds = getThresholdConfig();
        const recalculated = recalculateProductMetrics(products, [], velocityLookback, currentThresholds, pricingRules, brandMap, categoryMap);
        setProducts(recalculated);
        setIsSalesImportModalOpen(false);
    }, [
        products,
        velocityLookback,
        pricingRules,
        brandMap,
        categoryMap,
        pendingSalesReconciliationRef,
        recalculateProductMetrics,
        setIsSalesImportModalOpen,
        setProducts,
        setSalesHistory
    ]);

    const handleSkuDetailImport = useCallback(async (data: { masterSku: string; detail: SkuCostDetail }[]) => {
        const skuDetailImportStartedAt = perfNowMs();
        setProducts(prev => (prev || []).map(product => {
            const update = data.find(item => item.masterSku === product.sku);
            return update ? { ...product, costDetail: update.detail } : product;
        }));
        updateTimestamp('SKU Details');
        if (isAdminMode) setIsDirty(true);
        await waitForUiResponsiveAfterApply('[perf][sku-detail-import]', skuDetailImportStartedAt, {
            rows: Array.isArray(data) ? data.length : 0
        });
    }, [isAdminMode, setIsDirty, setProducts, updateTimestamp]);

    const handleMappingImport = useCallback(async (mappings: any[], mode: 'merge' | 'replace', platform: string) => {
        const mappingImportStartedAt = perfNowMs();
        setProducts(prev => (prev || []).map(product => {
            const platformMappings = mappings.filter(mapping => mapping.masterSku === product.sku && mapping.platform === platform);
            if (platformMappings.length === 0 && mode === 'merge') return product;
            const updatedChannels = [...product.channels];
            const channelIdx = updatedChannels.findIndex(channel => channel.platform === platform);
            const newAliases = platformMappings.map(mapping => mapping.alias).join(', ');
            if (channelIdx >= 0) {
                const existingAliases = updatedChannels[channelIdx].skuAlias?.split(',').map(alias => alias.trim()).filter(Boolean) || [];
                const importedAliases = newAliases.split(',').map(alias => alias.trim()).filter(Boolean);
                updatedChannels[channelIdx] = {
                    ...updatedChannels[channelIdx],
                    skuAlias: mode === 'replace'
                        ? newAliases
                        : [...new Set([...existingAliases, ...importedAliases])].join(', ')
                };
            } else if (newAliases) {
                updatedChannels.push({
                    platform,
                    manager: pricingRules[platform]?.manager || 'Unassigned',
                    velocity: 0,
                    skuAlias: newAliases
                });
            }
            return { ...product, channels: updatedChannels };
        }));
        if (isAdminMode) setIsDirty(true);
        await waitForUiResponsiveAfterApply('[perf][mapping-import]', mappingImportStartedAt, {
            rows: Array.isArray(mappings) ? mappings.length : 0,
            mode,
            platform
        });
    }, [isAdminMode, pricingRules, setIsDirty, setProducts]);

    const handleReturnsImport = useCallback(async (newRefunds: RefundLog[]): Promise<void> => {
        const refundImportStartedAt = perfNowMs();
        setPostApplySource('refund-import');
        console.log('[perf][refund-import] start', {
            incomingRefunds: Array.isArray(newRefunds) ? newRefunds.length : 0,
            currentRefunds: Array.isArray(refundHistory) ? refundHistory.length : 0,
            currentProducts: Array.isArray(products) ? products.length : 0
        });

        const uniqueInNew = new Map<string, RefundLog>();
        newRefunds.forEach(refund => {
            if (!uniqueInNew.has(refund.id)) uniqueInNew.set(refund.id, refund);
        });
        const deduped = Array.from(uniqueInNew.values());

        const matchesCurrentState = deduped.length === refundHistory.length && deduped.every((refund, index) => {
            const current = refundHistory[index];
            if (!current) return false;
            return (
                current.id === refund.id &&
                current.quantity === refund.quantity &&
                current.amount === refund.amount &&
                current.freightAmount === refund.freightAmount &&
                current.orderId === refund.orderId &&
                current.platform === refund.platform
            );
        });

        if (matchesCurrentState) {
            console.log('[perf][refund-import] no-op match', {
                elapsedMs: perfElapsedMs(refundImportStartedAt),
                refunds: deduped.length
            });
            updateTimestamp('Refunds');
            if (isAdminMode) setIsDirty(true);
            return;
        }

        const refundQtyBySku = new Map<string, number>();
        deduped.forEach(refund => {
            const sku = refund.sku || '';
            if (!sku) return;
            refundQtyBySku.set(sku, (refundQtyBySku.get(sku) || 0) + (Number(refund.quantity) || 0));
        });
        console.log('[perf][refund-import] dedupe complete', {
            elapsedMs: perfElapsedMs(refundImportStartedAt),
            dedupedRefunds: deduped.length,
            refundSkus: refundQtyBySku.size
        });

        const yieldToUi = () => new Promise<void>(resolve => setTimeout(resolve, 0));

        await new Promise<void>((resolve) => {
            setTimeout(() => {
                setRefundHistory(deduped);
                resolve();
            }, 0);
        });
        console.log('[perf][refund-import] refund history handoff complete', {
            elapsedMs: perfElapsedMs(refundImportStartedAt),
            refunds: deduped.length
        });

        await yieldToUi();

        await new Promise<void>((resolve) => {
            setTimeout(() => {
                setProducts(prev => (prev || []).map(product => {
                    const totalRefundQty = refundQtyBySku.get(product.sku) || 0;
                    const returnRate = product.averageDailySales > 0
                        ? (totalRefundQty / (product.averageDailySales * 30)) * 100
                        : 0;
                    return product.returnRate === returnRate ? product : { ...product, returnRate };
                }));
                markSearchSessionsStale();
                updateTimestamp('Refunds');
                if (isAdminMode) setIsDirty(true);
                resolve();
            }, 0);
        });
        console.log('[perf][refund-import] product rewrite complete', {
            elapsedMs: perfElapsedMs(refundImportStartedAt),
            refunds: deduped.length
        });
        logPerfPostCommitTail('[perf][refund-import]', refundImportStartedAt, {
            refunds: deduped.length,
            refundSkus: refundQtyBySku.size
        });
        await waitForUiResponsiveAfterApply('[perf][refund-import]', refundImportStartedAt, {
            refunds: deduped.length,
            refundSkus: refundQtyBySku.size
        });
        console.log('[perf][refund-import] complete', {
            elapsedMs: perfElapsedMs(refundImportStartedAt),
            refunds: deduped.length
        });
    }, [
        products,
        refundHistory,
        isAdminMode,
        setIsDirty,
        setPostApplySource,
        setProducts,
        setRefundHistory,
        markSearchSessionsStale,
        updateTimestamp
    ]);

    const handleFreightRatesUpload = useCallback(async (rates: FreightRate[]): Promise<void> => {
        const freightUploadStartedAt = perfNowMs();
        setPostApplySource('freight-upload');
        console.log('[perf][freight-upload] start', {
            rates: Array.isArray(rates) ? rates.length : 0,
            currentProducts: Array.isArray(products) ? products.length : 0
        });
        if (!rates || rates.length === 0) return;

        const rateMap = new Map<string, number>();
        rates.forEach(rate => {
            const sku = String(rate?.sku || '').trim().toUpperCase();
            if (!sku) return;
            rateMap.set(sku, Number(rate.rate) || 0);
        });
        console.log('[perf][freight-upload] map complete', {
            elapsedMs: perfElapsedMs(freightUploadStartedAt),
            uniqueSkus: rateMap.size
        });

        await new Promise<void>((resolve) => {
            setTimeout(() => {
                let changedRateRows = 0;
                let changedProducts = 0;
                setFreightRates(prev => {
                    const current = Array.isArray(prev) ? prev : [];
                    const nextBySku = new Map<string, FreightRate>();
                    current.forEach(rate => {
                        const sku = String(rate?.sku || '').trim().toUpperCase();
                        if (!sku) return;
                        nextBySku.set(sku, rate);
                    });
                    rates.forEach(rate => {
                        const sku = String(rate?.sku || '').trim().toUpperCase();
                        if (!sku) return;
                        const prevRate = nextBySku.get(sku);
                        const incomingRate = Number(rate.rate) || 0;
                        const prevValue = prevRate ? (Number(prevRate.rate) || 0) : undefined;
                        if (!prevRate || prevValue !== incomingRate) {
                            changedRateRows++;
                            nextBySku.set(sku, rate);
                        }
                    });
                    return Array.from(nextBySku.values());
                });

                setProducts(prev => (prev || []).map(product => {
                    const nextRate = rateMap.get(product.sku.toUpperCase());
                    if (nextRate === undefined) return product;
                    if ((product.postage ?? 0) === nextRate) return product;
                    changedProducts++;
                    return { ...product, postage: nextRate };
                }));
                markSearchSessionsStale();
                updateTimestamp('FreightRates');
                if (isAdminMode) setIsDirty(true);
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        console.log('[perf][freight-upload] apply delta', {
                            elapsedMs: perfElapsedMs(freightUploadStartedAt),
                            changedRateRows,
                            changedProducts
                        });
                        resolve();
                    });
                });
            }, 0);
        });

        console.log('[perf][freight-upload] complete', {
            elapsedMs: perfElapsedMs(freightUploadStartedAt),
            rates: rates.length,
            uniqueSkus: rateMap.size
        });
        logPerfPostCommitTail('[perf][freight-upload]', freightUploadStartedAt, {
            rates: rates.length,
            uniqueSkus: rateMap.size
        });
        await waitForUiResponsiveAfterApply('[perf][freight-upload]', freightUploadStartedAt, {
            rates: rates.length,
            uniqueSkus: rateMap.size
        });
    }, [
        products,
        isAdminMode,
        setFreightRates,
        setIsDirty,
        setPostApplySource,
        setProducts,
        markSearchSessionsStale,
        updateTimestamp
    ]);

    const handleCAImport = useCallback(async (
        data: { sku: string; caPrice: number; imageUrl?: string; description?: string }[],
        reportDate: string
    ) => {
        const caImportStartedAt = perfNowMs();
        let repairedFieldCount = 0;
        const repairedSkuSet = new Set<string>();
        const normalizedData = (data || []).map(item => {
            let rowChanged = false;
            const originalSku = String(item.sku || '').trim();
            const repairedSku = repairMojibakeText(originalSku);
            if (repairedSku !== originalSku) {
                repairedFieldCount += 1;
                rowChanged = true;
            }

            const originalImageUrl = item.imageUrl ? String(item.imageUrl).trim() : undefined;
            const repairedImageUrl = originalImageUrl ? repairMojibakeText(originalImageUrl) : undefined;
            if (repairedImageUrl !== originalImageUrl) {
                repairedFieldCount += 1;
                rowChanged = true;
            }

            const originalDescription = item.description ? String(item.description).trim() : undefined;
            const repairedDescription = originalDescription ? repairMojibakeText(originalDescription) : undefined;
            if (repairedDescription !== originalDescription) {
                repairedFieldCount += 1;
                rowChanged = true;
            }

            if (rowChanged && repairedSku) repairedSkuSet.add(repairedSku.toUpperCase());

            return {
                ...item,
                sku: repairedSku,
                imageUrl: repairedImageUrl,
                description: repairedDescription
            };
        });

        if (repairedFieldCount > 0) {
            console.log(`[ca-import] repaired ${repairedFieldCount} text field(s) across ${repairedSkuSet.size} SKU(s)`);
        }

        const changes: PriceChangeRecord[] = [];
        setProducts(prev => (prev || []).map(product => {
            const update = normalizedData.find(item =>
                item.sku.toUpperCase() === product.sku.toUpperCase() ||
                item.sku.toUpperCase() === product.sku.toUpperCase().replace(/[-_]UK$/i, '')
            );
            if (!update) return product;
            const oldPrice = product.caPrice || (product.currentPrice * VAT_MULTIPLIER);
            if (oldPrice > 0 && Math.abs(oldPrice - update.caPrice) > 0.02) {
                changes.push({
                    id: `ca-chg-${Date.now()}-${product.sku}`,
                    sku: product.sku,
                    productName: product.name,
                    date: reportDate,
                    platform: product.platform || 'Unknown',
                    oldPrice,
                    newPrice: update.caPrice,
                    changeType: update.caPrice > oldPrice ? 'INCREASE' : 'DECREASE',
                    percentChange: ((update.caPrice - oldPrice) / oldPrice) * 100
                });
            }
            const nextImageUrl = update.imageUrl || product.imageUrl;
            const nextDescription = update.description || product.description;
            const wasListingReady = !!(product.imageUrl && product.description);
            const isListingReady = !!(nextImageUrl && nextDescription);
            const becameListingReady = !product.listingReadyAt && !wasListingReady && isListingReady;
            return {
                ...product,
                caPrice: update.caPrice,
                lastUpdated: reportDate,
                imageUrl: nextImageUrl,
                description: nextDescription,
                listingReadyAt: product.listingReadyAt || (becameListingReady ? reportDate : undefined)
            };
        }));
        if (changes.length > 0) {
            setPriceChangeHistory(prev => [...changes, ...(prev || [])]);
        }
        updateTimestamp('CA Prices');
        await waitForUiResponsiveAfterApply('[perf][ca-import]', caImportStartedAt, {
            rows: Array.isArray(data) ? data.length : 0,
            changes: changes.length
        });
    }, [setPriceChangeHistory, setProducts, updateTimestamp]);

    const handleDescriptionImport = useCallback((data: { sku: string; description: string; imageUrl?: string }[]) => {
        const todayKey = getTodayKeyMelbourne();
        if (!Array.isArray(data) || data.length === 0) return;
        setProducts(prev => (prev || []).map(product => {
            const update = data.find(item =>
                item.sku.toUpperCase() === product.sku.toUpperCase() ||
                item.sku.toUpperCase() === product.sku.toUpperCase().replace(/[-_]UK$/i, '')
            );
            if (!update) return product;
            const nextImageUrl = update.imageUrl || product.imageUrl;
            const nextDescription = update.description || product.description;
            const wasListingReady = !!(product.imageUrl && product.description);
            const isListingReady = !!(nextImageUrl && nextDescription);
            const becameListingReady = !product.listingReadyAt && !wasListingReady && isListingReady;
            return {
                ...product,
                imageUrl: nextImageUrl,
                description: nextDescription,
                listingReadyAt: product.listingReadyAt || (becameListingReady ? todayKey : undefined),
                lastUpdated: todayKey
            };
        }));
        updateTimestamp('Descriptions');
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode, setIsDirty, setProducts, updateTimestamp]);

    const handleStampLandedAt = useCallback((skus: string[], date: string) => {
        if (!Array.isArray(skus) || skus.length === 0 || !date) return;
        const lookup = new Set(skus.map(sku => String(sku || '').trim().toUpperCase()).filter(Boolean));
        setProducts(prev => (prev || []).map(product => {
            const skuUpper = product.sku.toUpperCase();
            const skuStripped = skuUpper.replace(/[-_]UK$/i, '');
            if (!lookup.has(skuUpper) && !lookup.has(skuStripped)) return product;
            if (product.landedAt) return product;
            return { ...product, landedAt: date };
        }));
        updateTimestamp('Landed Date');
        if (isAdminMode) setIsDirty(true);
    }, [isAdminMode, setIsDirty, setProducts, updateTimestamp]);

    const handleShipmentImport = useCallback(async (updates: any[]) => {
        const shipmentImportStartedAt = perfNowMs();
        setProducts(prev => (prev || []).map(product => {
            const update = updates.find(item => item.sku === product.sku);
            if (!update) return product;
            const nextShipments = update.clearShipments === true
                ? (product.shipments || []).filter((shipment: any) => isArrivedShipmentStatus(shipment?.status))
                : (Array.isArray(update.shipments) && update.shipments.length > 0
                    ? update.shipments
                    : (product.shipments || []));
            const incomingStock = nextShipments.reduce((sum: number, shipment: any) => {
                return isArrivedShipmentStatus(shipment?.status) ? sum : sum + (Number(shipment?.quantity) || 0);
            }, 0);
            return {
                ...product,
                shipments: nextShipments,
                incomingStock,
                reorderPlacedDate: update.reorderPlacedDate || undefined,
                productionScheduledQty: Number(update.productionScheduledQty) || 0,
                toBeShippedQty: Number(update.toBeShippedQty) || 0,
                shippedOutQty: Number(update.shippedOutQty) || 0,
                shipmentStatus: update.shipmentStatus || ''
            };
        }));
        updateTimestamp('Shipments');
        await waitForUiResponsiveAfterApply('[perf][shipment-import]', shipmentImportStartedAt, {
            rows: Array.isArray(updates) ? updates.length : 0
        });
    }, [isArrivedShipmentStatus, setProducts, updateTimestamp]);

    return {
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
    };
};
