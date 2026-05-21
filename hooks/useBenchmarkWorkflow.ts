import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { PriceChangeRecord, PriceLog, PricingRules, Product, PromotionEvent } from '../types';
import type { BenchmarkUpdateNotice, CohortSnapshot, OptimalPriceResult, PricePoint } from '../types';
import type { CohortShiftWarning } from '../services/cohortAnalysis';
import { calculateOptimalPrice, buildPriceEras, buildPricePoints, isEligibleTransaction, tagTransactionSource, assignTransactionToEra } from '../services/optimalPriceEngine';
import { computeAllCohortStats, detectBenchmarkShifts } from '../services/cohortAnalysis';
import { buildCanonicalResolver } from '../services/skuNormalization';

type BenchmarkRecalcMode = 'incremental' | 'full';
type BenchmarkRecalcStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
type BenchmarkRecalcStage = 'IDLE' | 'PREPARING' | 'REBUILDING_COHORTS' | 'CALCULATING_OPTIMAL_PRICES' | 'FINALIZING';

export interface BenchmarkRecalcState {
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

export interface RecalculateBenchmarkOptions {
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

type UseBenchmarkWorkflowDeps = {
    products: Product[];
    salesHistory: PriceLog[];
    priceChangeHistory: PriceChangeRecord[];
    pricingRules: PricingRules;
    promotions: PromotionEvent[];
    learnedAliases: Record<string, string>;
    cohortSnapshot: CohortSnapshot | null;
    optimalPriceResults: Map<string, OptimalPriceResult>;
    benchmarkUpdateNotices: BenchmarkUpdateNotice[];
    setCohortSnapshot: Dispatch<SetStateAction<CohortSnapshot | null>>;
    setOptimalPriceResults: Dispatch<SetStateAction<Map<string, OptimalPriceResult>>>;
    setBenchmarkUpdateNotices: Dispatch<SetStateAction<BenchmarkUpdateNotice[]>>;
};

export const useBenchmarkWorkflow = ({
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
}: UseBenchmarkWorkflowDeps) => {
    const [benchmarkRecalcState, setBenchmarkRecalcState] = useState<BenchmarkRecalcState>(BENCHMARK_IDLE_STATE);
    const benchmarkRunRef = useRef<{ id: number; cancelled: boolean; running: boolean }>({ id: 0, cancelled: false, running: false });

    const handleCancelBenchmarkRecalculation = useCallback(() => {
        benchmarkRunRef.current.cancelled = true;
    }, []);

    const handleDismissBenchmarkRecalcState = useCallback(() => {
        if (benchmarkRunRef.current.running) return;
        setBenchmarkRecalcState(BENCHMARK_IDLE_STATE);
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
    }, [
        benchmarkUpdateNotices,
        learnedAliases,
        products,
        salesHistory,
        priceChangeHistory,
        pricingRules,
        promotions,
        cohortSnapshot,
        optimalPriceResults,
        setBenchmarkUpdateNotices,
        setCohortSnapshot,
        setOptimalPriceResults
    ]);

    return {
        benchmarkRecalcState,
        handleCancelBenchmarkRecalculation,
        handleDismissBenchmarkRecalcState,
        handleRecalculateBenchmarks
    };
};
