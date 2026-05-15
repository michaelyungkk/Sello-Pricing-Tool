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

self.onmessage = (event: MessageEvent<{ rawText?: string }>) => {
    try {
        const rawText = String(event.data?.rawText || '');
        postProgress(1, 'Parsing restore backup...');
        const rawJson = JSON.parse(rawText);

        postProgress(1, 'Normalizing restore data...');
        const safeJson = normalizeRestoredState(rawJson);

        postProgress(1, 'Migrating restore schema...');
        const migrated = migrateRestoredDatabase(safeJson);

        postProgress(2, 'Auditing restore payload...');
        const report = auditRestoredDatabase(migrated);
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

        self.postMessage({
            type: 'success',
            restored: {
                ...restored,
                rebuiltSalesHistory: rebuild.redistributedSalesHistory,
                rebuiltProducts: rebuild.rebuiltProducts,
                recalculationSummary: rebuild.recalculationSummary
            }
        });
    } catch (error: any) {
        self.postMessage({
            type: 'error',
            error: error?.message || 'Restore failed.'
        });
    }
};
