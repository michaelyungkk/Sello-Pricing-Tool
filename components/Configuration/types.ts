
import React from 'react';
import { PricingRules, LogisticsRule, SearchConfig, VelocityLookback, Product, PriceLog, PromotionEvent, ShipmentLog } from '../../types';

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
    shipmentHistory?: ShipmentLog[];
    themeColor: string;
    headerStyle: React.CSSProperties;
    searchConfig?: SearchConfig;
    velocityLookback: VelocityLookback;
    onRefreshThresholds?: () => void;
}

export type ConfigTab = 'platforms' | 'logistics' | 'thresholds' | 'search';
