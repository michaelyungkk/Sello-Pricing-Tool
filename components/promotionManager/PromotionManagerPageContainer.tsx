
import React, { useState } from 'react';
import { LayoutDashboard, List } from 'lucide-react';
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
    logisticsRules = [], // Unused in this refactor but kept for API compat
    promotions = [],
    priceHistoryMap,
    onAddPromotion,
    onUpdatePromotion,
    onDeletePromotion,
    themeColor,
    headerStyle,
    priceChangeHistory
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
            <div>
                <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Promotion Manager</h2>
                <p className="mt-1 transition-colors opacity-80" style={headerStyle}>
                    Plan, nominate SKUs, and manage cross-platform discount rules.
                </p>
            </div>

            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <LayoutDashboard className="w-4 h-4" />
                    Campaigns
                </button>
                <button
                    onClick={() => setActiveTab('all_skus')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'all_skus' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <List className="w-4 h-4" />
                    Master Promo Log
                </button>
            </div>

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
