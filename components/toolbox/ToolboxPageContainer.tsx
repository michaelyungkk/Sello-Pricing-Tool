
import React from 'react';
import { Tag, RefreshCw, GitCompare, ShieldCheck, List, Calculator } from 'lucide-react';
import { TabSwitcher } from '../common/TabSwitcher';
import { ToolboxPageProps } from './types';
import { useToolBox } from './hooks/useToolBox';
import { PromoCheckerTool } from './components/PromoCheckerTool';
import { InventorySyncTool } from './components/InventorySyncTool';
import { ERPCrossCheckTool } from './components/ERPCrossCheckTool';
import { PriceCheckTool } from './components/PriceCheckTool';
import { SkuScreenTool } from './components/SkuScreenTool';
import { DealSimulatorTool } from './components/DealSimulatorTool';

const ToolboxPageInner: React.FC<ToolboxPageProps> = ({
    promotions,
    pricingRules,
    inventoryTemplates,
    onSaveTemplates,
    learnedAliases,
    onSaveLearnedAliases,
    products,
    themeColor,
    headerStyle,
    salesHistory,
    refundHistory,
    priceCheckTemplates,
    onSavePriceCheckTemplates,
    freightRates,
}) => {
    const { activeTab, setActiveTab } = useToolBox();

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
            <TabSwitcher
                tabs={[
                    { key: 'PROMO', label: 'Promo Cross-Check', icon: Tag },
                    { key: 'SYNC', label: 'Inventory Sync', icon: RefreshCw },
                    { key: 'ERP', label: 'ERP Cross-Check', icon: GitCompare },
                    { key: 'PRICE', label: 'Price Check', icon: ShieldCheck },
                    { key: 'SKU', label: 'SKU Screen', icon: List },
                    { key: 'DEAL', label: 'Deal Simulator', icon: Calculator },
                ]}
                activeTab={activeTab}
                onChange={(key) => setActiveTab(key as any)}
            />

            {/* Content Area */}
            {activeTab === 'PROMO' && (
                <PromoCheckerTool
                    promotions={promotions}
                    pricingRules={pricingRules}
                    products={products || []}
                    themeColor={themeColor}
                />
            )}

            {activeTab === 'SYNC' && (
                <InventorySyncTool
                    templates={inventoryTemplates}
                    onSaveTemplates={onSaveTemplates}
                    learnedAliases={learnedAliases}
                    onSaveLearnedAliases={onSaveLearnedAliases}
                    themeColor={themeColor}
                    pricingRules={pricingRules}
                    products={products}
                />
            )}

            {activeTab === 'ERP' && (
                <ERPCrossCheckTool
                    salesHistory={salesHistory || []}
                    refundHistory={refundHistory || []}
                    pricingRules={pricingRules}
                    products={products || []}
                    learnedAliases={learnedAliases || {}}
                    themeColor={themeColor}
                />
            )}

            {activeTab === 'PRICE' && (
                <PriceCheckTool
                    products={products || []}
                    learnedAliases={learnedAliases || {}}
                    pricingRules={pricingRules}
                    priceCheckTemplates={priceCheckTemplates || []}
                    onSaveTemplates={onSavePriceCheckTemplates}
                />
            )}

            {activeTab === 'DEAL' && (
                <DealSimulatorTool
                    products={products || []}
                    freightRates={freightRates || []}
                    themeColor={themeColor}
                />
            )}

            {activeTab === 'SKU' && (
                <SkuScreenTool
                    products={products || []}
                    promotions={promotions || []}
                    learnedAliases={learnedAliases || {}}
                    themeColor={themeColor}
                />
            )}

        </div>
    );
};

const ToolboxPage = React.memo(ToolboxPageInner);
export default ToolboxPage;
