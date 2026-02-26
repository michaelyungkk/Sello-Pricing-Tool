
import React, { useState, useMemo } from 'react';
import { Product, PricingRules, PromotionEvent, PriceLog, RefundLog } from '../../types';

import { List, Ship, RotateCcw, DollarSign, Activity, Calendar, Columns, Layers } from 'lucide-react';

import { MasterCatalogueTab } from './tabs/MasterCatalogueTab';
import { ShipmentsTab } from './tabs/ShipmentsTab';
import { ReturnsAndRefundsTab } from './tabs/ReturnsAndRefundsTab';
import { PriceMatrixTab } from './tabs/PriceMatrixTab';
import { ProductPerformanceTrendTab } from './tabs/ProductPerformanceTrendTab';
import { PlatformComparisonTab } from './tabs/PlatformComparisonTab';
import { FamilyGroupsTab } from './tabs/FamilyGroupsTab';

import { AliasDrawer } from './parts/AliasDrawer';
import { TagsDrawer } from './parts/TagsDrawer';
import { buildWindow } from '../../services/dateWindow';
import { getTodayKeyMelbourne } from '../../services/dateUtils';
import { createPortal } from 'react-dom';
import { SkuFamily } from '../../types';

interface ProductManagementPageContainerProps {
    products: Product[];
    pricingRules: PricingRules;
    promotions?: PromotionEvent[];
    priceHistoryMap?: Map<string, PriceLog[]>;
    refundHistory?: RefundLog[];

    dateLabels: { current: string, last: string };
    onUpdateProduct?: (product: Product) => void;
    onViewElasticity?: (product: Product) => void;
    onDeepDive: (sku: string) => void;
    themeColor: string;
    deductRefunds: boolean;
    setDeductRefunds: (v: boolean) => void;
    onAnalyzeCarrier: (carrier: string) => void;
    skuFamilies: SkuFamily[];
    setSkuFamilies: (families: SkuFamily[]) => void;
    pendingFamilySuggestions: SkuFamily[];
    setPendingFamilySuggestions: (suggestions: SkuFamily[]) => void;
}

type Tab = 'catalog' | 'performance' | 'pricing' | 'shipments' | 'returns' | 'comparison' | 'family-groups';

export const ProductManagementPageContainer: React.FC<ProductManagementPageContainerProps> = ({
    products,
    pricingRules,
    priceHistoryMap = new Map(),
    refundHistory = [],

    dateLabels,
    onUpdateProduct,
    onViewElasticity,
    onDeepDive,
    themeColor,
    deductRefunds,
    setDeductRefunds,
    onAnalyzeCarrier,
    skuFamilies,
    setSkuFamilies,
    pendingFamilySuggestions,
    setPendingFamilySuggestions,
    promotions = []
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('performance');
    const [selectedProductForDrawer, setSelectedProductForDrawer] = useState<Product | null>(null);
    const [productForTags, setProductForTags] = useState<Product | null>(null);
    const [shipmentSearchTags, setShipmentSearchTags] = useState<string[]>([]);

    // Time Window State (Mirroring Platform Management)
    const [timeWindow, setTimeWindow] = useState<'7D' | '14D' | '30D' | '60D' | 'ALL' | 'CUSTOM'>('30D');
    const [customStart, setCustomStart] = useState<string>(getTodayKeyMelbourne());
    const [customEnd, setCustomEnd] = useState<string>(getTodayKeyMelbourne());
    const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);

    const handleViewShipments = (sku: string) => {
        setShipmentSearchTags([sku]);
        setActiveTab('shipments');
    };

    // Family Group Handlers
    const handleConfirmSuggestion = (suggestion: SkuFamily) => {
        const newFamily: SkuFamily = {
            ...suggestion,
            id: `family-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        setSkuFamilies([...skuFamilies, newFamily]);
        setPendingFamilySuggestions(pendingFamilySuggestions.filter(s => s.id !== suggestion.id));
    };

    const handleDismissSuggestion = (id: string) => {
        setPendingFamilySuggestions(pendingFamilySuggestions.filter(s => s.id !== id));
    };

    const handleConfirmAllSuggestions = () => {
        const newFamilies = pendingFamilySuggestions.map(s => ({
            ...s,
            id: `family-${Date.now()}-${Math.random().toString(36).substr(2, 5)}-${s.name}`,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        }));
        setSkuFamilies([...skuFamilies, ...newFamilies]);
        setPendingFamilySuggestions([]);
    };

    const handleAddFamily = (family: SkuFamily) => {
        setSkuFamilies([...skuFamilies, family]);
    };

    const handleEditFamily = (updatedFamily: SkuFamily) => {
        setSkuFamilies(skuFamilies.map(f => f.id === updatedFamily.id ? updatedFamily : f));
    };

    const handleRemoveFamily = (id: string) => {
        setSkuFamilies(skuFamilies.filter(f => f.id !== id));
    };

    const dateWindow = useMemo(() => {
        let mode: 'days' | 'custom' | 'all' = 'days';
        let days = 30;
        if (timeWindow === 'ALL') mode = 'all';
        else if (timeWindow === 'CUSTOM') mode = 'custom';
        else days = parseInt(timeWindow.replace('D', ''));

        return buildWindow({
            mode,
            days,
            startKey: customStart,
            endKey: customEnd,
            excludeToday: true
        });
    }, [timeWindow, customStart, customEnd]);

    const periodLabel = useMemo(() => {
        const start = new Date(dateWindow.startKey);
        const end = new Date(dateWindow.endKey);
        const format = (d: Date, withYear: boolean) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
        const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
        return `${format(start, !sameYear)} – ${format(end, true)}`;
    }, [dateWindow]);

    return (
        <div className="max-w-full mx-auto space-y-6 pb-10 h-full flex flex-col">
            {/* Top Bar matching Marketplace View */}
            <div className="flex flex-wrap gap-4 items-center justify-between">
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto no-scrollbar">
                    <button
                        onClick={() => setActiveTab('performance')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'performance' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Activity className="w-4 h-4" />
                        Performance Trend
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
                        Returns Management
                    </button>

                    <button
                        onClick={() => setActiveTab('pricing')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'pricing' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <DollarSign className="w-4 h-4" />
                        Price Matrix
                    </button>

                    <button
                        onClick={() => setActiveTab('comparison')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'comparison' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Columns className="w-4 h-4" />
                        Platform Comparison
                    </button>

                    <button
                        onClick={() => setActiveTab('family-groups')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'family-groups' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Layers className="w-4 h-4" />
                        Family Groups
                    </button>
                </div>

                <div className="flex items-center gap-3">
                    <label className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:border-indigo-300 transition-colors">
                        <input
                            type="checkbox"
                            checked={deductRefunds}
                            onChange={e => setDeductRefunds(e.target.checked)}
                            className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
                        />
                        <div className="flex items-center gap-1.5">
                            <RotateCcw className={`w-3.5 h-3.5 ${deductRefunds ? 'text-red-500' : 'text-gray-400'}`} />
                            <span className={`text-[10px] font-bold uppercase tracking-tight ${deductRefunds ? 'text-gray-900' : 'text-gray-500'}`}>Deduct Refunds/Resends</span>
                        </div>
                    </label>
                </div>
            </div>

            {/* Global Context Control (Time Window) - Reused from Platform Management */}
            <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex flex-col md:flex-row justify-between items-center gap-4 animate-in fade-in">
                <div className="flex items-center gap-3">
                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Time Window</span>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        {(['7D', '14D', '30D', '60D'] as const).map(w => (
                            <button key={w} onClick={() => setTimeWindow(w)} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${timeWindow === w ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>{w}</button>
                        ))}
                        <button onClick={() => setTimeWindow('ALL')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${timeWindow === 'ALL' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>All Time</button>
                        <button onClick={() => setIsCustomDateModalOpen(true)} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${timeWindow === 'CUSTOM' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}><Calendar className="w-3 h-3" /> Custom</button>
                    </div>
                </div>
                <div className="flex items-center gap-2 pl-4 border-l border-gray-200">
                    <span className="text-xs text-gray-400 font-medium">Analyzing Period:</span>
                    <span className="text-sm font-bold text-indigo-600">{periodLabel}</span>
                </div>
            </div>

            <div className="flex-1 min-h-0 relative">
                {activeTab === 'performance' && (
                    <ProductPerformanceTrendTab
                        products={products}
                        priceHistoryMap={priceHistoryMap}
                        refundHistory={refundHistory}
                        dateWindow={{ startKey: dateWindow.startKey, endKey: dateWindow.endKey }}
                        deductRefunds={deductRefunds}
                        themeColor={themeColor}
                        onDeepDive={onDeepDive}
                    />
                )}

                {activeTab === 'catalog' && (
                    <MasterCatalogueTab
                        products={products}
                        skuFamilies={skuFamilies}
                        onEditAliases={setSelectedProductForDrawer}
                        onEditTags={setProductForTags}
                        onViewShipments={handleViewShipments}
                        onViewElasticity={onViewElasticity}
                        onDeepDive={onDeepDive}
                        dateLabels={dateLabels}
                        pricingRules={pricingRules}
                        themeColor={themeColor}
                        priceHistoryMap={priceHistoryMap}
                    />
                )}

                {activeTab === 'returns' && (
                    <ReturnsAndRefundsTab
                        refundHistory={refundHistory}
                        products={products}
                        themeColor={themeColor}
                        pricingRules={pricingRules}
                        onDeepDive={onDeepDive}
                        priceHistoryMap={priceHistoryMap}
                        startDate={dateWindow.startKey}
                        endDate={dateWindow.endKey}
                        onAnalyzeCarrier={onAnalyzeCarrier}
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

                {activeTab === 'comparison' && (
                    <PlatformComparisonTab
                        products={products}
                        priceHistoryMap={priceHistoryMap}
                        pricingRules={pricingRules}
                        dateWindow={{ startKey: dateWindow.startKey, endKey: dateWindow.endKey }}
                        themeColor={themeColor}
                        deductRefunds={deductRefunds}
                        refundHistory={refundHistory}
                    />
                )}

                {activeTab === 'family-groups' && (
                    <FamilyGroupsTab
                        skuFamilies={skuFamilies}
                        pendingFamilySuggestions={pendingFamilySuggestions}
                        products={products}
                        onConfirmSuggestion={handleConfirmSuggestion}
                        onDismissSuggestion={handleDismissSuggestion}
                        onConfirmAllSuggestions={handleConfirmAllSuggestions}
                        onAddFamily={handleAddFamily}
                        onEditFamily={handleEditFamily}
                        onRemoveFamily={handleRemoveFamily}
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

            {/* Custom Date Modal */}
            {isCustomDateModalOpen && createPortal(
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setIsCustomDateModalOpen(false)}>
                    <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-gray-200 p-6" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Select Custom Range</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Start Date</label>
                                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">End Date</label>
                                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button onClick={() => setIsCustomDateModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button>
                            <button onClick={() => { setTimeWindow('CUSTOM'); setIsCustomDateModalOpen(false); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700">Apply Range</button>
                        </div>
                    </div>
                </div>, document.body
            )}
        </div>
    );
};
