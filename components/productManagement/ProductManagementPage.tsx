
import React from 'react';
import { ProductManagementPageContainer } from './ProductManagementPageContainer';
import { Product, PricingRules, PromotionEvent, PriceLog, PriceChangeRecord, RefundLog, SearchChip, SkuFamily, OptimalPriceResult, CohortSnapshot, BenchmarkUpdateNotice } from '../../types';
import { ThresholdConfig } from '../../services/thresholdsConfig';
import type { CohortShiftWarning } from '../../services/cohortAnalysis';

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

interface ProductManagementPageProps {
    products: Product[];
    pricingRules: PricingRules;
    promotions?: PromotionEvent[];
    priceHistoryMap?: Map<string, PriceLog[]>;
    refundHistory?: RefundLog[];
    priceChangeHistory?: PriceChangeRecord[];
    onOpenMappingModal: () => void;
    onAnalyze: (product: Product, context?: string) => void;
    dateLabels: { current: string, last: string };
    onUpdateProduct?: (product: Product) => void;
    onViewElasticity?: (product: Product, result?: OptimalPriceResult) => void;
    onDeepDive: (sku: string) => void;
    onSearch?: (query: string | SearchChip[]) => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
    thresholds?: ThresholdConfig;
    deductRefunds: boolean;
    setDeductRefunds: (v: boolean) => void;
    onAnalyzeCarrier: (carrier: string) => void;
    skuFamilies: SkuFamily[];
    setSkuFamilies: (families: SkuFamily[]) => void;
    pendingFamilySuggestions: SkuFamily[];
    setPendingFamilySuggestions: (suggestions: SkuFamily[]) => void;
    // Optimal pricing — threaded from App.tsx in Session 6
    cohortSnapshot?: CohortSnapshot | null;
    optimalPriceResults?: Map<string, OptimalPriceResult>;
    benchmarkUpdateNotices?: BenchmarkUpdateNotice[];
    onRecalculateBenchmarks?: (options?: { mode?: BenchmarkRecalcMode; categories?: string[] }) => Promise<CohortShiftWarning[]>;
    benchmarkRecalcState?: BenchmarkRecalcState;
    onCancelBenchmarkRecalculation?: () => void;
    onDismissBenchmarkRecalcState?: () => void;
}

const ProductManagementPage: React.FC<ProductManagementPageProps> = (props) => {
    return <ProductManagementPageContainer {...props} />;
};

export default ProductManagementPage;
