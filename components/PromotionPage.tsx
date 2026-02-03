
import React from 'react';
import { PromotionManagerPageContainer } from './promotionManager/PromotionManagerPageContainer';
import { Product, PricingRules, PromotionEvent, PriceLog, LogisticsRule, PriceChangeRecord } from '../types';

interface PromotionPageProps {
    products: Product[];
    pricingRules: PricingRules;
    logisticsRules?: LogisticsRule[];
    promotions: PromotionEvent[];
    priceHistoryMap?: Map<string, PriceLog[]>;
    onAddPromotion: (promo: PromotionEvent) => void;
    onUpdatePromotion: (promo: PromotionEvent) => void;
    onDeletePromotion: (id: string) => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
    priceChangeHistory?: PriceChangeRecord[];
}

const PromotionPage: React.FC<PromotionPageProps> = (props) => {
    return <PromotionManagerPageContainer {...props} />;
};

export default PromotionPage;
