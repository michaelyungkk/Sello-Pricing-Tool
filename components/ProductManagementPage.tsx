
import React from 'react';
import { ProductManagementPageContainer } from './productManagement/ProductManagementPageContainer';
import { Product, PricingRules, PromotionEvent, PriceLog, PriceChangeRecord, RefundLog, SearchChip, SkuFamily, OptimalPriceResult, CohortSnapshot, BenchmarkUpdateNotice } from '../types';
import { ThresholdConfig } from '../services/thresholdsConfig';
import type { CohortShiftWarning } from '../services/cohortAnalysis';

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
    onRecalculateBenchmarks?: () => CohortShiftWarning[];
}

const ProductManagementPage: React.FC<ProductManagementPageProps> = (props) => {
    return <ProductManagementPageContainer {...props} />;
};

export default ProductManagementPage;
