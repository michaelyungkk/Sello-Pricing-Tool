
import React, { useState } from 'react';
import { LayoutDashboard, List } from 'lucide-react';
import { TabSwitcher } from '../common/TabSwitcher';
import { CampaignsTab } from './tabs/CampaignsTab';
import { MasterPromoLogTab } from './tabs/MasterPromoLogTab';
import { PromotionEvent, Product, PricingRules, PriceLog, LogisticsRule, PriceChangeRecord } from '../../types';

interface PromotionManagerPageContainerProps {
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

type Tab = 'dashboard' | 'all_skus';

export const PromotionManagerPageContainer: React.FC<PromotionManagerPageContainerProps> = ({
    products = [],
    pricingRules = {},
    _logisticsRules = [], // Unused in this refactor but kept for API compat
    promotions = [],
    priceHistoryMap,
    onAddPromotion,
    onUpdatePromotion,
    onDeletePromotion,
    themeColor,
    _headerStyle,
    priceChangeHistory
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
            <TabSwitcher
                tabs={[
                    { key: 'dashboard', label: 'Campaigns', icon: LayoutDashboard },
                    { key: 'all_skus', label: 'Master Promo Log', icon: List },
                ]}
                activeTab={activeTab}
                onChange={(key) => setActiveTab(key as Tab)}
                size="sm"
            />

            <div className="min-h-[500px]">
                {activeTab === 'dashboard' && (
                    <CampaignsTab
                        promotions={promotions}
                        pricingRules={pricingRules}
                        onAddPromotion={onAddPromotion}
                        onUpdatePromotion={onUpdatePromotion}
                        onDeletePromotion={onDeletePromotion}
                        products={products}
                        priceHistoryMap={priceHistoryMap || new Map()}
                        priceChangeHistory={priceChangeHistory}
                        themeColor={themeColor}
                    />
                )}

                {activeTab === 'all_skus' && (
                    <MasterPromoLogTab
                        promotions={promotions}
                        products={products}
                        themeColor={themeColor}
                    />
                )}
            </div>
        </div>
    );
};
