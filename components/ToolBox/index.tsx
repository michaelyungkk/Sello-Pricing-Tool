
import React from 'react';
import { Tag, RefreshCw } from 'lucide-react';
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
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
                <button
                    onClick={() => setActiveTab('PROMO')}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-md transition-all flex items-center gap-2 ${activeTab === 'PROMO' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Tag className="w-4 h-4" />
                    Promo Cross-Check
                </button>
                <button
                    onClick={() => setActiveTab('SYNC')}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-md transition-all flex items-center gap-2 ${activeTab === 'SYNC' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <RefreshCw className="w-4 h-4" />
                    Inventory Sync
                </button>
            </div>

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
