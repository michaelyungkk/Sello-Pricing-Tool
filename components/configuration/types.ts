
import React from 'react';
import { PricingRules, LogisticsRule, SearchConfig, VelocityLookback, Product, PriceLog, PromotionEvent, FreightRate, AttributeMap } from '../../types';

export interface ConfigurationPageProps {
    currentRules: PricingRules;
    onSave: (rules: PricingRules, velocitySetting: VelocityLookback, searchConfig: SearchConfig) => void;
    logisticsRules?: LogisticsRule[];
    onSaveLogistics?: (rules: LogisticsRule[]) => void;
    products: Product[];
    extraData?: {
        priceHistory: PriceLog[];
        promotions: PromotionEvent[];
    };
    freightRates?: FreightRate[];
    onFreightRatesUpload?: (rates: FreightRate[]) => void;
    onOpenFreightUpload?: () => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
    searchConfig?: SearchConfig;
    velocityLookback: VelocityLookback;
    onRefreshThresholds?: () => void;
    brandMap: AttributeMap;
    categoryMap: AttributeMap;
    onSaveBrandMap: (map: AttributeMap) => void;
    onSaveCategoryMap: (map: AttributeMap) => void;
}

export type ConfigTab = 'platforms' | 'logistics' | 'thresholds' | 'search' | 'normalization';
