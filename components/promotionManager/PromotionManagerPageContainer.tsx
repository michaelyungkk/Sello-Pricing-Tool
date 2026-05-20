
import React, { useState } from 'react';
import { LayoutDashboard, List } from 'lucide-react';
import { TabSwitcher } from '../common/TabSwitcher';
import { CampaignsTab } from './tabs/CampaignsTab';
import { MasterPromoLogTab } from './tabs/MasterPromoLogTab';
import { PromotionEvent, Product, PricingRules, PriceLog, LogisticsRule, PriceChangeRecord, NavigationIntent } from '../../types';
import { perfNowMs, usePagePerfLogger } from '../../services/pagePerf';

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
    navigationIntent?: NavigationIntent | null;
    onConsumeNavigationIntent?: (result?: { success: boolean; message?: string }) => void;
}

type Tab = 'dashboard' | 'all_skus';

const PromotionManagerPageContainerInner: React.FC<PromotionManagerPageContainerProps> = ({
    products = [],
    pricingRules = {},
    logisticsRules = [], // Unused in this refactor but kept for API compat
    promotions = [],
    priceHistoryMap,
    onAddPromotion,
    onUpdatePromotion,
    onDeletePromotion,
    themeColor,
    headerStyle,
    priceChangeHistory,
    navigationIntent,
    onConsumeNavigationIntent
}) => {
    const pagePerfStartedAt = perfNowMs();
    void logisticsRules;
    void headerStyle;
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');

    const promotionPerfKey = `${activeTab}|${promotions.length}|${products.length}|${priceHistoryMap?.size || 0}`;
    usePagePerfLogger('promotions', 'promotions', promotionPerfKey, {
        activeTab,
        promotions: promotions.length,
        products: products.length,
        priceHistoryBuckets: priceHistoryMap?.size || 0
    }, true, pagePerfStartedAt);

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
            <TabSwitcher
                tabs={[
                    { key: 'dashboard', label: 'Campaigns', icon: LayoutDashboard },
                    { key: 'all_skus', label: 'Master Promo Log', icon: List },
                ]}
                activeTab={activeTab}
                onChange={(key) => setActiveTab(key as Tab)}
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
                        navigationIntent={navigationIntent}
                        onConsumeNavigationIntent={onConsumeNavigationIntent}
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

export const PromotionManagerPageContainer = React.memo(PromotionManagerPageContainerInner);
