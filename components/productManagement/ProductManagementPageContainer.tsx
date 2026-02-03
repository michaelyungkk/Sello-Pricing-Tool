
import React, { useState } from 'react';
import { Product, PricingRules, PromotionEvent, PriceLog, PriceChangeRecord, RefundLog, SearchChip } from '../../types';
import { ThresholdConfig } from '../../services/thresholdsConfig';
import { LayoutDashboard, List, Ship, RotateCcw, DollarSign } from 'lucide-react';

import { DecisionEngineTab } from './tabs/DecisionEngineTab';
import { MasterCatalogueTab } from './tabs/MasterCatalogueTab';
import { ShipmentsTab } from './tabs/ShipmentsTab';
import { ReturnsAndRefundsTab } from './tabs/ReturnsAndRefundsTab';
import { PriceMatrixTab } from './tabs/PriceMatrixTab';

import { AliasDrawer } from './parts/AliasDrawer';
import { TagsDrawer } from './parts/TagsDrawer';

interface ProductManagementPageContainerProps {
    products: Product[];
    pricingRules: PricingRules;
    promotions?: PromotionEvent[];
    priceHistoryMap?: Map<string, PriceLog[]>;
    refundHistory?: RefundLog[];
    priceChangeHistory?: PriceChangeRecord[];
    onOpenMappingModal: () => void;
    onAnalyze: (product: Product, context?: string) => void;
    dateLabels: { current: string, last: string };
    onUpdateProduct?: (product: Product) => void;
    onViewElasticity?: (product: Product) => void;
    onDeepDive: (sku: string) => void;
    onSearch?: (query: string | SearchChip[]) => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
    thresholds?: ThresholdConfig;
}

type Tab = 'dashboard' | 'catalog' | 'pricing' | 'shipments' | 'returns';

export const ProductManagementPageContainer: React.FC<ProductManagementPageContainerProps> = ({
    products,
    pricingRules,
    promotions = [],
    priceHistoryMap = new Map(),
    refundHistory = [],
    priceChangeHistory = [],
    onOpenMappingModal,
    onAnalyze,
    dateLabels,
    onUpdateProduct,
    onViewElasticity,
    onDeepDive,
    onSearch,
    themeColor,
    headerStyle,
    thresholds
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [selectedProductForDrawer, setSelectedProductForDrawer] = useState<Product | null>(null);
    const [productForTags, setProductForTags] = useState<Product | null>(null);
    const [shipmentSearchTags, setShipmentSearchTags] = useState<string[]>([]);

    const handleViewShipments = (sku: string) => {
        setShipmentSearchTags([sku]);
        setActiveTab('shipments');
    };

    return (
        <div className="max-w-full mx-auto space-y-6 pb-10 h-full flex flex-col">
            <div>
                <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Product Management</h2>
                <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                    Manage Master SKUs, aliases, and pricing consistency.
                </p>
            </div>

            <div className="flex justify-between items-end gap-4">
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => setActiveTab('dashboard')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <LayoutDashboard className="w-4 h-4" />
                        Decision Engine
                    </button>

                    <button
                        onClick={() => setActiveTab('catalog')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'catalog' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <List className="w-4 h-4" />
                        Master Catalogue
                    </button>

                    <button
                        onClick={() => setActiveTab('shipments')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'shipments' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Ship className="w-4 h-4" />
                        Shipments
                    </button>

                    <button
                        onClick={() => setActiveTab('returns')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'returns' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <RotateCcw className="w-4 h-4" />
                        Returns & Refunds
                    </button>
                    
                    <button
                        onClick={() => setActiveTab('pricing')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'pricing' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <DollarSign className="w-4 h-4" />
                        Price Matrix
                    </button>
                </div>
            </div>

            <div className="flex-1 min-h-0 relative">
                {activeTab === 'dashboard' && (
                    <DecisionEngineTab
                        products={products}
                        priceHistoryMap={priceHistoryMap}
                        refundHistory={refundHistory}
                        pricingRules={pricingRules}
                        priceChangeHistory={priceChangeHistory}
                        themeColor={themeColor}
                        onAnalyze={onAnalyze}
                        onDeepDive={onDeepDive}
                        onSearch={onSearch}
                        thresholds={thresholds}
                    />
                )}

                {activeTab === 'catalog' && (
                    <MasterCatalogueTab
                        products={products}
                        onEditAliases={setSelectedProductForDrawer}
                        onEditTags={setProductForTags}
                        onViewShipments={handleViewShipments}
                        onViewElasticity={onViewElasticity}
                        onDeepDive={onDeepDive}
                        dateLabels={dateLabels}
                        pricingRules={pricingRules}
                        themeColor={themeColor}
                    />
                )}
                
                {activeTab === 'returns' && (
                    <ReturnsAndRefundsTab
                        refundHistory={refundHistory}
                        products={products}
                        themeColor={themeColor}
                        pricingRules={pricingRules}
                        onDeepDive={onDeepDive}
                    />
                )}

                {activeTab === 'shipments' && (
                    <ShipmentsTab 
                        products={products} 
                        themeColor={themeColor} 
                        initialTags={shipmentSearchTags}
                        onTagsChange={setShipmentSearchTags}
                    />
                )}

                {activeTab === 'pricing' && (
                    <PriceMatrixTab
                        products={products}
                        pricingRules={pricingRules}
                        promotions={promotions}
                        themeColor={themeColor}
                    />
                )}
            </div>

            {selectedProductForDrawer && (
                <AliasDrawer
                    product={selectedProductForDrawer}
                    pricingRules={pricingRules}
                    onClose={() => setSelectedProductForDrawer(null)}
                    onSave={(updated: Product) => {
                        if (onUpdateProduct) {
                            onUpdateProduct(updated);
                        }
                    }}
                    themeColor={themeColor}
                />
            )}

            {productForTags && (
                <TagsDrawer
                    product={productForTags}
                    products={products}
                    onClose={() => setProductForTags(null)}
                    onSave={(updated: Product) => {
                        if (onUpdateProduct) {
                            onUpdateProduct(updated);
                        }
                    }}
                    themeColor={themeColor}
                />
            )}
        </div>
    );
};
