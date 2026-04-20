
import React, { useState, useMemo } from 'react';
import { Product, PricingRules, PromotionEvent, PriceLog, RefundLog, OptimalPriceResult, CohortSnapshot, BenchmarkUpdateNotice, SkuFamily, InventoryChangeRecord } from '../../types';
import type { CohortShiftWarning } from '../../services/cohortAnalysis';

import { List, Ship, RotateCcw, DollarSign, Activity, Columns, Layers, X } from 'lucide-react';

import { MasterCatalogueTab } from './tabs/MasterCatalogueTab';
import { ShipmentsTab } from './tabs/ShipmentsTab';
import { ReturnsAndRefundsTab } from './tabs/ReturnsAndRefundsTab';
import { PriceMatrixTab } from './tabs/PriceMatrixTab';
import { ProductPerformanceTrendTab } from './tabs/ProductPerformanceTrendTab';
import { PlatformComparisonTab } from './tabs/PlatformComparisonTab';
import { FamilyGroupsTab } from './tabs/FamilyGroupsTab';
import { TabSwitcher } from '../common/TabSwitcher';
import { AliasDrawer } from './parts/AliasDrawer';
import { TagsDrawer } from './parts/TagsDrawer';
import { buildWindow } from '../../services/dateWindow';
import { getTodayKeyMelbourne } from '../../services/dateUtils';
import { ContextBar } from '../common/ContextBar';

type BenchmarkRecalcMode = 'incremental' | 'full';
type BenchmarkRecalcStatus = 'idle' | 'running' | 'completed' | 'cancelled' | 'error';
type BenchmarkRecalcStage = 'IDLE' | 'PREPARING' | 'REBUILDING_COHORTS' | 'CALCULATING_OPTIMAL_PRICES' | 'FINALIZING';

interface BenchmarkRecalcState {
    status: BenchmarkRecalcStatus;
    stage: BenchmarkRecalcStage;
    mode: BenchmarkRecalcMode;
    processed: number;
    total: number;
    elapsedMs: number;
    startedAt: string | null;
    completedAt: string | null;
    summary: string;
}

interface ProductManagementPageContainerProps {
    products: Product[];
    pricingRules: PricingRules;
    promotions?: PromotionEvent[];
    priceHistoryMap?: Map<string, PriceLog[]>;
    refundHistory?: RefundLog[];
    inventoryChangeHistory?: InventoryChangeRecord[];

    dateLabels: { current: string, last: string };
    onUpdateProduct?: (product: Product) => void;
    onViewElasticity?: (product: Product, result?: OptimalPriceResult) => void;
    onDeepDive: (sku: string) => void;
    themeColor: string;
    deductRefunds: boolean;
    setDeductRefunds: (v: boolean) => void;
    onAnalyzeCarrier: (carrier: string) => void;
    skuFamilies: SkuFamily[];
    setSkuFamilies: (families: SkuFamily[]) => void;
    pendingFamilySuggestions: SkuFamily[];
    setPendingFamilySuggestions: (suggestions: SkuFamily[]) => void;
    // Optimal pricing — threaded down from App.tsx in Session 6
    cohortSnapshot?: CohortSnapshot | null;
    optimalPriceResults?: Map<string, OptimalPriceResult>;
    benchmarkUpdateNotices?: BenchmarkUpdateNotice[];
    onRecalculateBenchmarks?: (options?: { mode?: BenchmarkRecalcMode; categories?: string[] }) => Promise<CohortShiftWarning[]>;
    benchmarkRecalcState?: BenchmarkRecalcState;
    onCancelBenchmarkRecalculation?: () => void;
    onDismissBenchmarkRecalcState?: () => void;
    onConfirmContainersArrived?: (payload: { containerId: string; confirmedQty?: number; confirmedSkuQtys?: Record<string, number>; mode?: 'INFERRED' | 'MANUAL' }[]) => void;
    onEditContainerShipments?: (payload: { containerId: string; status?: string; eta?: string; items: { sku: string; quantity: number }[] }) => void;
}

type Tab = 'catalog' | 'performance' | 'pricing' | 'shipments' | 'returns' | 'comparison' | 'family-groups';

const ProductManagementPageContainerInner: React.FC<ProductManagementPageContainerProps> = ({
    products,
    pricingRules,
    priceHistoryMap = new Map(),
    refundHistory = [],
    inventoryChangeHistory = [],

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
    promotions = [],
    cohortSnapshot,
    optimalPriceResults,
    benchmarkUpdateNotices,
    onRecalculateBenchmarks,
    benchmarkRecalcState,
    onCancelBenchmarkRecalculation,
    onDismissBenchmarkRecalcState,
    onConfirmContainersArrived,
    onEditContainerShipments,
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('performance');
    const [selectedProductForDrawer, setSelectedProductForDrawer] = useState<Product | null>(null);
    const [productForTags, setProductForTags] = useState<Product | null>(null);
    const [shipmentSearchTags, setShipmentSearchTags] = useState<string[]>([]);
    const [isAuditVisible, setIsAuditVisible] = useState(false);

    // Time Window State (Mirroring Platform Management)
    const [timeWindow, setTimeWindow] = useState<'YESTERDAY' | '7D' | '14D' | '30D' | '60D' | 'ALL' | 'CUSTOM'>('30D');
    const [customStart, setCustomStart] = useState<string>(getTodayKeyMelbourne());
    const [customEnd, setCustomEnd] = useState<string>(getTodayKeyMelbourne());

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
        else if (timeWindow === 'YESTERDAY') { mode = 'days'; days = 1; }
        else days = parseInt(timeWindow.replace('D', ''));

        return buildWindow({
            mode,
            days,
            startKey: customStart,
            endKey: customEnd,
            excludeToday: timeWindow === 'YESTERDAY',
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

    const benchmarkProgressPct = useMemo(() => {
        const total = benchmarkRecalcState?.total || 0;
        const processed = benchmarkRecalcState?.processed || 0;
        if (total <= 0) return 0;
        return Math.max(0, Math.min(100, Math.round((processed / total) * 100)));
    }, [benchmarkRecalcState?.processed, benchmarkRecalcState?.total]);

    const benchmarkStageLabel = useMemo(() => {
        switch (benchmarkRecalcState?.stage) {
            case 'PREPARING': return 'Preparing';
            case 'REBUILDING_COHORTS': return 'Rebuilding cohorts';
            case 'CALCULATING_OPTIMAL_PRICES': return 'Calculating optimal prices';
            case 'FINALIZING': return 'Finalizing';
            default: return 'Idle';
        }
    }, [benchmarkRecalcState?.stage]);

    const benchmarkElapsedLabel = useMemo(() => {
        const ms = benchmarkRecalcState?.elapsedMs || 0;
        const secs = Math.floor(ms / 1000);
        const minutes = Math.floor(secs / 60);
        const rem = secs % 60;
        return `${minutes}:${String(rem).padStart(2, '0')}`;
    }, [benchmarkRecalcState?.elapsedMs]);

    return (
        <div className="max-w-full mx-auto space-y-6 pb-10 h-full flex flex-col">
            {benchmarkRecalcState && benchmarkRecalcState.status !== 'idle' && (
                <div className="sticky top-0 z-30 bg-custom-glass backdrop-blur-custom border border-custom-glass rounded-xl p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
                            <span className="px-2 py-0.5 rounded-full bg-theme-10 text-theme uppercase tracking-wide">
                                {benchmarkRecalcState.mode === 'full' ? 'Full Rebuild' : 'Incremental'}
                            </span>
                            <span>{benchmarkStageLabel}</span>
                            <span className="text-gray-400">{benchmarkRecalcState.processed.toLocaleString()} / {benchmarkRecalcState.total.toLocaleString()}</span>
                            <span className="text-gray-400">{benchmarkElapsedLabel}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            {benchmarkRecalcState.status === 'running' && onCancelBenchmarkRecalculation && (
                                <button
                                    onClick={onCancelBenchmarkRecalculation}
                                    className="px-3 py-1 text-xs font-bold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition-colors"
                                >
                                    Cancel
                                </button>
                            )}
                            {benchmarkRecalcState.completedAt && benchmarkRecalcState.status !== 'running' && (
                                <span className="text-[11px] font-medium text-gray-500">
                                    Last updated {new Date(benchmarkRecalcState.completedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                            {benchmarkRecalcState.status !== 'running' && onDismissBenchmarkRecalcState && (
                                <button
                                    onClick={onDismissBenchmarkRecalcState}
                                    className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                                    title="Close"
                                >
                                    <X className="w-3.5 h-3.5" />
                                </button>
                            )}
                        </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full bg-gray-200 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-theme transition-all duration-200"
                            style={{ width: `${benchmarkProgressPct}%` }}
                        />
                    </div>
                    {!!benchmarkRecalcState.summary && (
                        <div className="mt-2 text-[11px] text-gray-600">{benchmarkRecalcState.summary}</div>
                    )}
                </div>
            )}

            {/* Top Bar matching Marketplace View */}
            <div className="flex flex-wrap gap-4 items-center justify-between">
                <TabSwitcher
                    tabs={[
                        { key: 'performance', label: 'Performance Trend', icon: Activity },
                        { key: 'catalog', label: 'Master Catalogue', icon: List },
                        { key: 'shipments', label: 'Shipments', icon: Ship },
                        { key: 'returns', label: 'Returns Management', icon: RotateCcw },
                        { key: 'pricing', label: 'Price Matrix', icon: DollarSign },
                        { key: 'comparison', label: 'Platform Comparison', icon: Columns },
                        { key: 'family-groups', label: 'Family Groups', icon: Layers },
                    ]}
                    activeTab={activeTab}
                    onChange={(key) => { setActiveTab(key as Tab); setIsAuditVisible(false); }}
                />

            </div>

            {/* Global Context Control — only relevant for data-driven tabs */}
            {(activeTab === 'performance' || activeTab === 'comparison' || activeTab === 'returns') && <ContextBar
                timeOptions={[
                    { key: 'YESTERDAY', label: 'Yesterday' },
                    { key: '7D', label: '7D' },
                    { key: '14D', label: '14D' },
                    { key: '30D', label: '30D' },
                    { key: '60D', label: '60D' },
                    { key: 'ALL', label: 'All Time' },
                    { key: 'CUSTOM', label: 'Custom' }
                ]}
                activeWindow={timeWindow}
                onWindowChange={(key) => setTimeWindow(key as any)}
                periodLabel={periodLabel}
                customStart={customStart}
                customEnd={customEnd}
                onCustomStartChange={setCustomStart}
                onCustomEndChange={setCustomEnd}
            >
                {activeTab !== 'returns' && (
                    <label className="flex items-center h-8 gap-2 px-3 bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:border-theme-20 transition-colors">
                        <input type="checkbox" checked={deductRefunds} onChange={e => setDeductRefunds(e.target.checked)} className="w-4 h-4 text-theme rounded focus:ring-theme border-gray-300" />
                        <div className="flex items-center gap-1.5">
                            <RotateCcw className={`w-3.5 h-3.5 ${deductRefunds ? 'text-red-500' : 'text-gray-400'}`} />
                            <span className={`text-[10px] font-bold uppercase tracking-tight ${deductRefunds ? 'text-gray-900' : 'text-gray-500'}`}>Deduct Returns</span>
                        </div>
                    </label>
                )}
                {(activeTab === 'performance' || activeTab === 'comparison') && (
                    <button
                        onClick={() => setIsAuditVisible(v => !v)}
                        className={`flex items-center gap-2 px-3 h-8 rounded-lg font-bold border transition-all shadow-sm text-xs ${isAuditVisible ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                        title="Toggle Audit Panel"
                    >
                        <Activity className="w-4 h-4" />
                        Audit{isAuditVisible ? ': On' : ''}
                    </button>
                )}
            </ContextBar>}

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
                        startKey={dateWindow.startKey}
                        endKey={dateWindow.endKey}
                        isAuditVisible={isAuditVisible}
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
                        cohortSnapshot={cohortSnapshot}
                        optimalPriceResults={optimalPriceResults}
                        benchmarkUpdateNotices={benchmarkUpdateNotices}
                        onRecalculateBenchmarks={onRecalculateBenchmarks}
                        benchmarkRecalcState={benchmarkRecalcState}
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
                        inventoryChangeHistory={inventoryChangeHistory}
                        onConfirmContainersArrived={onConfirmContainersArrived}
                        onEditContainerShipments={onEditContainerShipments}
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
                        isAuditVisible={isAuditVisible}
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

        </div>
    );
};

export const ProductManagementPageContainer = React.memo(ProductManagementPageContainerInner);
