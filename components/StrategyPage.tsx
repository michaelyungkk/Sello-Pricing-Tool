
import React from 'react';
import { StrategyPageContainer } from './strategy/StrategyPageContainer';
import { Product, StrategyConfig, PricingRules, PromotionEvent, PriceChangeRecord, VelocityLookback, CostChangeRecord, PriceLog, InventoryChangeRecord, RefundLog } from '../types';
import { ThresholdConfig } from '../services/thresholdsConfig';

interface StrategyPageProps {
    products: Product[];
    pricingRules: PricingRules;
    currentConfig: StrategyConfig;
    onSaveConfig: (config: StrategyConfig) => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
    priceHistoryMap: Map<string, PriceLog[]>;
    refundHistory?: RefundLog[];
    deductRefunds: boolean;
    setDeductRefunds: (v: boolean) => void;
    promotions: PromotionEvent[];
    priceChangeHistory: PriceChangeRecord[];
    costChangeHistory: CostChangeRecord[];
    inventoryChangeHistory: InventoryChangeRecord[];
    onUpdatePriceChangeRecord?: (record: PriceChangeRecord) => void;
    onUpdateCostChangeRecord?: (record: CostChangeRecord) => void;
    onUpdateInventoryChangeRecord?: (record: InventoryChangeRecord) => void;
    onManualPriceChange?: (data: Omit<PriceChangeRecord, 'id' | 'changeType' | 'percentChange'>) => void;
    onManualCostChange?: (data: Omit<CostChangeRecord, 'id' | 'changeType' | 'percentChange'>) => void;
    velocityLookback: VelocityLookback;
    thresholds?: ThresholdConfig;
}

const StrategyPage: React.FC<StrategyPageProps> = (props) => {
    return <StrategyPageContainer {...props} />;
};

export default StrategyPage;
