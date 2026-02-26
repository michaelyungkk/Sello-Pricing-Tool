
import React from 'react';
import { ProductManagementPageContainer } from './productManagement/ProductManagementPageContainer';
import { Product, PricingRules, PromotionEvent, PriceLog, PriceChangeRecord, RefundLog, SearchChip, SkuFamily } from '../types';
import { ThresholdConfig } from '../services/thresholdsConfig';

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
    onViewElasticity?: (product: Product) => void;
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
}

const ProductManagementPage: React.FC<ProductManagementPageProps> = (props) => {
    return <ProductManagementPageContainer {...props} />;
};

export default ProductManagementPage;
