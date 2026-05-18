import { migrateRestoredDatabase, auditRestoredDatabase } from '../services/migrationService';
import { normalizeRestoredState } from '../services/restoreSanitizer';
import { buildRestoreRebuildPayload } from '../services/restoreRebuild';
import {
    DEFAULT_LOGISTICS_RULES,
    DEFAULT_PRICING_RULES,
    DEFAULT_SEARCH_CONFIG,
    DEFAULT_STRATEGY_RULES
} from '../constants';

const postProgress = (progress: number, message: string) => {
    self.postMessage({
        type: 'progress',
        progress,
        message
    });
};

const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

self.onmessage = (event: MessageEvent<{ rawText?: string }>) => {
    try {
        const workerStartMs = nowMs();
        const stageStartMs = nowMs();
        const rawText = String(event.data?.rawText || '');
        postProgress(1, 'Parsing restore backup...');
        const rawJson = JSON.parse(rawText);
        console.log('[restore][worker] parse complete', {
            elapsedMs: Number((nowMs() - stageStartMs).toFixed(1)),
            rawTextBytes: rawText.length
        });

        const normalizeStartMs = nowMs();
        postProgress(1, 'Normalizing restore data...');
        const safeJson = normalizeRestoredState(rawJson);
        console.log('[restore][worker] normalize complete', {
            elapsedMs: Number((nowMs() - normalizeStartMs).toFixed(1))
        });

        const migrateStartMs = nowMs();
        postProgress(1, 'Migrating restore schema...');
        const migrated = migrateRestoredDatabase(safeJson);
        console.log('[restore][worker] migrate complete', {
            elapsedMs: Number((nowMs() - migrateStartMs).toFixed(1))
        });

        const auditStartMs = nowMs();
        postProgress(2, 'Auditing restore payload...');
        const report = auditRestoredDatabase(migrated);
        console.log('[restore][worker] audit complete', {
            elapsedMs: Number((nowMs() - auditStartMs).toFixed(1)),
            hasFatal: report.hasFatal
        });
        if (report.hasFatal) {
            console.error('[RESTORE AUDIT FAIL]', report);
            self.postMessage({
                type: 'error',
                error: 'Restore file contains invalid structure. Check console for details.'
            });
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
            promotions: Array.isArray(migrated.promotions) ? migrated.promotions : [],
            learnedAliases: migrated.learnedAliases && typeof migrated.learnedAliases === 'object' ? migrated.learnedAliases : {},
            pricingRules: migrated.pricingRules || DEFAULT_PRICING_RULES,
            logisticsRules: Array.isArray(migrated.logisticsRules) ? migrated.logisticsRules : DEFAULT_LOGISTICS_RULES,
            strategyRules: migrated.strategyRules || DEFAULT_STRATEGY_RULES,
            searchConfig: migrated.searchConfig || DEFAULT_SEARCH_CONFIG,
            userProfile: migrated.userProfile && typeof migrated.userProfile === 'object' ? migrated.userProfile : {},
            inventoryTemplates: Array.isArray(migrated.inventoryTemplates) ? migrated.inventoryTemplates : [],
            customReportPresets: Array.isArray(migrated.customReportPresets) ? migrated.customReportPresets : [],
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

        console.log('[restore][worker] payload counts', {
            products: restored.products.length,
            priceHistory: restored.priceHistory.length,
            refundHistory: restored.refundHistory.length,
            promotions: restored.promotions.length,
            adGroups: restored.adGroups.length,
            freightRates: restored.freightRates.length
        });

        const rebuildStartMs = nowMs();
        postProgress(3, 'Rebuilding transactions and product metrics...');
        const rebuild = buildRestoreRebuildPayload({
            adGroups: restored.adGroups,
            products: restored.products,
            priceHistory: restored.priceHistory,
            velocityLookback: restored.velocityLookback,
            thresholds: restored.thresholds,
            pricingRules: restored.pricingRules,
            brandMap: restored.brandMap,
            categoryMap: restored.categoryMap
        });

        const rebuiltSalesHistory = rebuild.redistributedSalesHistory;
        const rebuiltProducts = rebuild.rebuiltProducts;
        console.log('[restore][worker] rebuild complete', {
            elapsedMs: Number((nowMs() - rebuildStartMs).toFixed(1)),
            rebuiltSalesHistory: rebuiltSalesHistory.length,
            rebuiltProducts: rebuiltProducts.length
        });
        console.log('[restore][worker] success summary', {
            totalElapsedMs: Number((nowMs() - workerStartMs).toFixed(1)),
            products: restored.products.length,
            priceHistory: restored.priceHistory.length,
            refundHistory: restored.refundHistory.length,
            rebuiltSalesHistory: rebuiltSalesHistory.length,
            rebuiltProducts: rebuiltProducts.length
        });

        self.postMessage({
            type: 'success',
            restored: {
                ...restored,
                rebuiltSalesHistory,
                rebuiltProducts,
                recalculationSummary: rebuild.recalculationSummary
            }
        });
    } catch (error: any) {
        console.error('[restore][worker] error', {
            error: error?.message || String(error)
        });
        self.postMessage({
            type: 'error',
            error: error?.message || 'Restore failed.'
        });
    }
};
