
import React from 'react';
import { PromotionManagerPageContainer } from './PromotionManagerPageContainer';
import { Product, PricingRules, PromotionEvent, PriceLog, LogisticsRule, PriceChangeRecord, NavigationIntent } from '../../types';

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
    navigationIntent?: NavigationIntent | null;
    onConsumeNavigationIntent?: (result?: { success: boolean; message?: string }) => void;
}

const PromotionPageInner: React.FC<PromotionPageProps> = (props) => {
    return <PromotionManagerPageContainer {...props} />;
};

const PromotionPage = React.memo(PromotionPageInner);
export default PromotionPage;
