
import React from 'react';
import { Tag, RefreshCw } from 'lucide-react';
import { TabSwitcher } from '../common/TabSwitcher';
import { ToolboxPageProps } from './types';
import { useToolBox } from './hooks/useToolBox';
import { PromoCheckerTool } from './components/PromoCheckerTool';
import { InventorySyncTool } from './components/InventorySyncTool';

const ToolboxPage: React.FC<ToolboxPageProps> = ({
    promotions,
    pricingRules,
    inventoryTemplates,
    onSaveTemplates,
    products,
    themeColor,
    headerStyle
}) => {
    const { activeTab, setActiveTab } = useToolBox();

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
            <TabSwitcher
                tabs={[
                    { key: 'PROMO', label: 'Promo Cross-Check', icon: Tag },
                    { key: 'SYNC', label: 'Inventory Sync', icon: RefreshCw },
                ]}
                activeTab={activeTab}
                onChange={(key) => setActiveTab(key as any)}
                size="sm"
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
                    themeColor={themeColor}
                    pricingRules={pricingRules}
                    products={products}
                />
            )}
        </div>
    );
};

export default ToolboxPage;
