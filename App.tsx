
import React from 'react';
import { useAppState } from './hooks/useAppState';
import { QuickUploadMenu } from './components/QuickUploadMenu';

// Components
import { OverviewPageContainer } from './components/overview/OverviewPageContainer';

import ProductManagementPage from './components/ProductManagementPage';
import StrategyPage from './components/StrategyPage';
import PlatformManagementPage from './components/PlatformManagementPage';

import {
    LayoutDashboard, Calculator, DollarSign, Tag, Wrench, Settings, BookOpen, Search, X, Lock, AlertTriangle, RefreshCw,
    Download, Upload, Database, CheckCircle, FileBarChart, Bell, History,
    ChevronDown, RotateCcw, FileText, Link as LinkIcon, Ship, Globe,
    ArrowUp, Package, Table, UploadCloud
} from 'lucide-react';

import GlobalSearch from './components/GlobalSearch';
import UserProfile from './components/UserProfile';
import SearchResultsPage from './components/SearchResultsPage';
import CostManagementPage from './components/CostManagementPage';
import PromotionPage from './components/PromotionPage';
import ToolboxPage from './components/ToolboxPage';
import DefinitionsPage from './components/Definitions';
import SettingsPage from './components/SettingsPage';
import { CustomReportPage } from './components/CustomReportPage';
import BatchUploadModal from './components/BatchUploadModal';
import SalesImportModal from './components/SalesImportModal';
import SkuDetailUploadModal from './components/SkuDetailUploadModal';
import MappingUploadModal from './components/MappingUploadModal';
import ReturnsUploadModal from './components/ReturnsUploadModal';
import CAUploadModal from './components/CAUploadModal';
import ShipmentUploadModal from './components/ShipmentUploadModal';
import PriceElasticityModal from './components/PriceElasticityModal';
import AnalysisModal from './components/AnalysisModal';

import { TAX_NOTE_SHORT } from './services/taxPolicy';
import { StrategyConfig } from './types';

const App: React.FC = () => {
    const [isAdminModalOpen, setIsAdminModalOpen] = React.useState(false);
    const [adminPassword, setAdminPassword] = React.useState('');
    const [adminError, setAdminError] = React.useState<string | null>(null);
    const [showAdminExitConfirmation, setShowAdminExitConfirmation] = React.useState(false);

    const {
        t,
        products,
        setProducts,
        salesHistory,
        refundHistory,
        shipmentHistory,
        priceChangeHistory,
        costChangeHistory,
        inventoryChangeHistory,
        promotions,
        setPromotions,
        learnedAliases,
        inventoryTemplates,
        setInventoryTemplates,
        pricingRules,
        setPricingRules,
        logisticsRules,
        setLogisticsRules,
        strategyRules,
        setStrategyRules,
        searchConfig,
        setSearchConfig,
        skuFamilies,
        setSkuFamilies,
        pendingFamilySuggestions,
        setPendingFamilySuggestions,
        adGroups,
        setAdGroups,
        onSyncFromFamilies,
        onAddAdGroup,
        onEditAdGroup,
        onRemoveAdGroup,
        handleAdGroupSave,
        lastRecalculationSummary,
        brandMap,
        setBrandMap,
        categoryMap,
        setCategoryMap,
        deductRefunds,
        setDeductRefunds,
        uploadTimestamps,
        thresholds,
        velocityLookback,
        setVelocityLookback,
        userProfile,
        setUserProfile,
        showBackToTop,
        mainContentRef,
        fileRestoreRef,
        selectedElasticityProduct,
        setSelectedElasticityProduct,
        isUploadModalOpen,
        setIsUploadModalOpen,
        isSalesImportModalOpen,
        setIsSalesImportModalOpen,
        isSkuDetailModalOpen,
        setIsSkuDetailModalOpen,
        isMappingModalOpen,
        setIsMappingModalOpen,
        isReturnsModalOpen,
        setIsReturnsModalOpen,
        isCAUploadModalOpen,
        setIsCAUploadModalOpen,
        isShipmentModalOpen,
        setIsShipmentModalOpen,
        selectedAnalysisProduct,
        setSelectedAnalysisProduct,
        analysisResult,
        setAnalysisResult,
        isAnalysisLoading,
        isSearchLoading,
        searchSessions,
        activeSearchId,
        setActiveSearchId,
        currentView,
        setCurrentView,
        isOnline,
        isFreshnessExpanded,
        setIsFreshnessExpanded,
        mapJumpState,
        priceHistoryMap,
        existingOrders,
        dynamicDateLabels,
        ambientRgb,
        handleRefreshThresholds,
        handleRecalculateVelocity,
        handleSearch,
        handleDeepDiveRequest,
        handleManualPriceChange,
        handleManualCostChange,
        handleAnalyzeCarrier,
        handleRefineSearch,
        deleteSearchSession,
        handleViewElasticity,
        handleAnalyze,
        handleApplyPrice,
        handleBackup,
        handleRestore,
        handleResetRefunds,
        handleUpdatePriceChangeRecord,
        handleUpdateCostChangeRecord,
        handleUpdateInventoryChangeRecord,
        handleSalesImportConfirm,
        handleInventoryImport,
        handleResetSalesData,
        handleSkuDetailImport,
        handleMappingImport,
        handleReturnsImport,
        handleCAImport,
        handleShipmentImport,
        isAdminMode,
        adminSessionActive,
        handleAdminToggle,
        handleAdminExit,
        lastSyncedAt,
        syncStatus,
        handleSync,
        pendingFamilyConflicts,
        resolveConflicts,
        showSaveToast,
        isDirty,
        handleAdminPush
    } = useAppState();

    const isBusy = syncStatus === 'syncing' || syncStatus === 'pushing';

    const quickUploadActions = [
        { label: t('quick_upload_inventory'), icon: Database, action: () => setIsUploadModalOpen(true), color: 'text-indigo-600' },
        { label: t('quick_upload_sales'), icon: FileBarChart, action: () => setIsSalesImportModalOpen(true), color: 'text-blue-600' },
        { label: t('quick_upload_refunds'), icon: RotateCcw, action: () => setIsReturnsModalOpen(true), color: 'text-red-600' },
        { label: t('quick_upload_sku_detail'), icon: FileText, action: () => setIsSkuDetailModalOpen(true), color: 'text-teal-600' },
        { label: t('quick_upload_ca_report'), icon: Upload, action: () => setIsCAUploadModalOpen(true), color: 'text-purple-600' },
        { label: t('quick_upload_sku_mapping'), icon: LinkIcon, action: () => setIsMappingModalOpen(true), color: 'text-amber-600' },
        { label: t('quick_upload_shipment'), icon: Ship, action: () => setIsShipmentModalOpen(true), color: 'text-teal-600' },
    ];

    const headerTextColor = userProfile.textColor || '#111827';
    const textShadowStyle = userProfile.backgroundImage && userProfile.backgroundImage !== 'none' ? { textShadow: '0 1px 3px rgba(0,0,0,0.3)' } : {};
    const headerStyle = { color: headerTextColor, ...textShadowStyle };
    const hasInventory = products && products.length > 0;
    const activeSearch = (searchSessions || []).find(s => s.id === activeSearchId);

    const pageTitles: Record<string, string> = {
        search: t('header_search'),
        products: t('header_products'),
        platforms: t('header_platforms'),
        overview: t('header_dashboard'),
        strategy: t('header_strategy'),
        costs: t('header_costs'),
        definitions: t('header_definitions'),
        promotions: t('header_promotions'),
        tools: t('header_toolbox'),
        'family-groups': 'Family Groups',
        'custom-report': 'Custom Report Builder',
        settings: t('desc_settings'),
    };

    const pageDescs: Record<string, string> = {
        search: t('desc_search'),
        overview: t('desc_dashboard'),
        strategy: t('desc_strategy'),
        products: t('desc_products'),
        platforms: t('desc_platforms'),
        costs: t('desc_costs'),
        definitions: t('desc_definitions'),
        promotions: t('desc_promotions'),
        tools: t('desc_toolbox'),
        'family-groups': 'Manage SKU family groups for analytics',
        'custom-report': 'Build and save custom data views',
        settings: t('desc_settings'),
    };

    return (
        <>
            <style>{` html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; } :root { --glass-bg: ${userProfile.glassMode === 'dark' ? `rgba(17, 24, 39, ${(userProfile.glassOpacity ?? 90) / 100})` : `rgba(255, 255, 255, ${(userProfile.glassOpacity ?? 90) / 100})`}; --glass-border: ${userProfile.glassMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.4)'}; --glass-blur: blur(${userProfile.glassBlur ?? 10}px); --glass-bg-modal: ${userProfile.glassMode === 'dark' ? `rgba(17, 24, 39, ${Math.min(1, (userProfile.glassOpacity ?? 90) / 100 + 0.1)})` : `rgba(255, 255, 255, ${Math.min(1, (userProfile.glassOpacity ?? 90) / 100 + 0.1)})`}; --glass-blur-modal: blur(${Math.min(40, (userProfile.glassBlur ?? 10) + 8)}px); --ambient-bg: rgba(${ambientRgb.r}, ${ambientRgb.g}, ${ambientRgb.b}, ${(userProfile.ambientGlassOpacity ?? 15) / 100}); --ambient-blur: blur(${Math.min(20, (userProfile.glassBlur ?? 10) + 4)}px); } .bg-custom-glass { background-color: var(--glass-bg); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); } .border-custom-glass { border-color: var(--glass-border); } .bg-custom-glass-modal { background-color: var(--glass-bg-modal); } .backdrop-blur-custom-modal { backdrop-filter: var(--glass-blur-modal); -webkit-backdrop-filter: var(--glass-blur-modal); } .bg-custom-ambient { background-color: var(--ambient-bg); } .backdrop-blur-custom-ambient { backdrop-filter: var(--ambient-blur); -webkit-backdrop-filter: var(--ambient-blur); } `}</style>
            <div className="h-screen flex font-sans text-gray-900 transition-colors duration-500 relative bg-transparent overflow-hidden">
                {userProfile.ambientGlass && <div className="fixed inset-0 z-[1] pointer-events-none transition-all duration-500 bg-custom-ambient backdrop-blur-custom-ambient" />}
                <aside className={`w-60 border-r border-custom-glass hidden md:flex flex-col fixed h-full z-40 shadow-sm transition-all duration-300 bg-custom-glass`}>
                    <div className="p-4 flex items-center gap-3">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm" style={{ backgroundColor: userProfile.themeColor }}>S</div>
                        <span className="font-bold text-lg tracking-tight text-gray-900">Sello UK Hub</span>
                    </div>
                    <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
                        {[
                            { id: 'overview', icon: LayoutDashboard, label: t('nav_overview') },
                            { id: 'products', icon: Package, label: t('nav_products') },
                            { id: 'platforms', icon: Globe, label: t('nav_platforms') },
                            { id: 'strategy', icon: Calculator, label: t('nav_strategy') },
                            { id: 'costs', icon: DollarSign, label: t('nav_costs') },
                            { id: 'promotions', icon: Tag, label: t('nav_promotions') },
                            { id: 'custom-report', icon: Table, label: 'Custom Reports' },
                            { id: 'tools', icon: Wrench, label: t('nav_toolbox') },
                            { id: 'settings', icon: Settings, label: t('nav_config') },
                            { id: 'definitions', icon: BookOpen, label: t('nav_definitions') }
                        ].map((item) => {
                            const isActive = currentView === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setCurrentView(item.id as any)}
                                    className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-all text-sm ${isActive ? 'bg-opacity-10' : 'text-gray-600 hover:bg-gray-50/50 hover:text-gray-900'}`}
                                    style={isActive ? { backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor } : {}}
                                >
                                    <item.icon className="w-4 h-4" style={isActive ? { color: userProfile.themeColor } : {}} />
                                    {item.label}
                                </button>
                            );
                        })}
                        {searchSessions && searchSessions.length > 0 && (
                            <div className="mt-4 pt-3 border-t border-gray-100/50">
                                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1 px-2 flex items-center gap-2">
                                    <History className="w-3 h-3" />
                                    {t('active_searches')}
                                </div>
                                <div className="space-y-0.5">
                                    {searchSessions.map(session => (
                                        <div key={session.id} className="group relative flex items-center">
                                            <button
                                                onClick={() => { setActiveSearchId(session.id); setCurrentView('search'); }}
                                                className={`w-full flex items-center gap-3 px-3 py-1.5 rounded-lg text-xs font-medium transition-all text-left overflow-hidden ${activeSearchId === session.id && currentView === 'search' ? 'bg-white/40 shadow-sm' : 'text-gray-600 hover:bg-gray-100/50'}`}
                                                style={activeSearchId === session.id && currentView === 'search' ? { backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor } : {}}
                                            >
                                                <Search className={`w-3.5 h-3.5 flex-shrink-0 ${activeSearchId === session.id && currentView === 'search' ? '' : 'opacity-70'}`} />
                                                <span className="truncate pr-4 block w-full">{session.query}</span>
                                            </button>
                                            <button
                                                onClick={(e) => deleteSearchSession(session.id, e)}
                                                className="absolute right-1 p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10"
                                                title="Close Search"
                                            >
                                                <X className="w-2.5 h-2.5" />
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </nav>
                    <div className="p-3 border-t border-custom-glass space-y-2">
                        <div className="px-1 flex gap-1">
                            <button
                                onClick={handleBackup}
                                disabled={isBusy}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold text-gray-600 transition-colors border border-custom-glass ${isBusy ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'hover:bg-gray-100/50'}`}
                            >
                                <Download className="w-3 h-3" /> {t('backup_db')}
                            </button>
                            <button
                                onClick={() => fileRestoreRef.current?.click()}
                                disabled={isBusy}
                                className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold text-gray-600 transition-colors border border-custom-glass ${isBusy ? 'opacity-40 cursor-not-allowed pointer-events-none' : 'hover:bg-gray-100/50'}`}
                            >
                                <Upload className="w-3 h-3" /> {t('restore_db')}
                            </button>
                            <input ref={fileRestoreRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
                        </div>

                        {/* Sync Button Section */}
                        <div className="px-1 pt-1">
                            <button
                                onClick={() => {
                                    if (isAdminMode && isDirty) {
                                        handleAdminPush();
                                    } else {
                                        handleSync();
                                    }
                                }}
                                disabled={isBusy}
                                className={`w-full flex flex-col items-center gap-1.5 p-3 rounded-xl transition-all border ${syncStatus === 'error'
                                    ? 'bg-red-50 border-red-200 text-red-600'
                                    : (isAdminMode && isDirty)
                                        ? 'bg-amber-50 border-amber-200 text-amber-700 hover:bg-amber-100'
                                        : 'bg-white border-custom-glass text-gray-700 hover:bg-gray-50'
                                    } shadow-sm group relative overflow-hidden ${isBusy ? 'opacity-40 cursor-not-allowed' : ''}`}
                            >
                                <div className="flex items-center gap-2">
                                    {syncStatus === 'pushing' ? (
                                        <UploadCloud className="w-3.5 h-3.5 animate-bounce" />
                                    ) : (
                                        <RotateCcw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                                    )}
                                    <span className="text-[10px] font-bold tracking-wider uppercase">
                                        {syncStatus === 'syncing' ? t('syncing...') : syncStatus === 'pushing' ? 'Pushing...' : syncStatus === 'error' ? t('sync_failed_retry') : (isAdminMode && isDirty) ? 'Push Changes' : t('sync_data')}
                                    </span>
                                    {isAdminMode && isDirty && syncStatus === 'idle' && (
                                        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
                                    )}
                                </div>
                                <div className="text-[9px] text-gray-500 font-medium">
                                    {lastSyncedAt ? `${t('last_synced')}: ${new Date(lastSyncedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : t('never_synced')}
                                </div>
                                {(syncStatus === 'syncing' || syncStatus === 'pushing') && <div className="absolute bottom-0 left-0 h-0.5 bg-indigo-500 animate-progress-fast shadow-[0_0_8px_rgba(79,70,229,0.5)] w-full"></div>}
                            </button>
                        </div>

                        <div className="bg-gray-50/50 rounded-lg border border-custom-glass overflow-hidden transition-all duration-300">
                            <button onClick={() => setIsFreshnessExpanded(!isFreshnessExpanded)} className="w-full flex justify-between items-center p-2 hover:bg-gray-100/50 transition-colors">
                                <div className="flex items-center gap-2">
                                    <span className="text-[9px] font-bold text-gray-500 uppercase tracking-wide">Data Freshness</span>
                                    <ChevronDown className={`w-2.5 h-2.5 text-gray-400 transition-transform duration-200 ${isFreshnessExpanded ? 'rotate-180' : ''}`} />
                                </div>
                                <span className={`w-1 h-1 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></span>
                            </button>
                            {isFreshnessExpanded && (
                                <div className="px-2 pb-2 space-y-1 pt-0 animate-in slide-in-from-top-1 duration-200 text-[9px]">
                                    <div className="border-t border-gray-200/50 mb-1.5"></div>
                                    {[
                                        { label: 'Inventory', key: 'Inventory' },
                                        { label: 'Sales', key: 'Sales' },
                                        { label: 'SKU Detail', key: 'SKU Details' },
                                        { label: 'Refunds', key: 'Refunds' },
                                        { label: 'CA Prices', key: 'CA Prices' },
                                        { label: 'Shipments', key: 'Shipments' },
                                    ].map(item => (
                                        <div key={item.key} className="flex justify-between items-center">
                                            <span className="text-gray-500">{item.label}</span>
                                            <span className={`font-mono ${uploadTimestamps[item.key] ? 'text-gray-700 font-medium' : 'text-gray-300 italic'}`}>
                                                {uploadTimestamps[item.key] ? new Date(uploadTimestamps[item.key]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : '-'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                </aside>
                <main className="flex-1 md:ml-60 min-0 relative z-10 flex flex-col h-full overflow-hidden">
                    <header className="sticky top-0 z-50 flex justify-between items-center gap-8 px-8 py-4 bg-custom-glass border-b border-custom-glass/50 shadow-sm transition-all duration-300">
                        <div>
                            <h1 className="text-2xl font-bold transition-colors" style={headerStyle}>
                                {pageTitles[currentView] || pageTitles.settings}
                            </h1>
                            <p className="text-sm mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                                {pageDescs[currentView] || pageDescs.settings}
                            </p>
                        </div>
                        <div className="flex-1 max-w-2xl"> <GlobalSearch onSearch={handleSearch} isLoading={isSearchLoading} platforms={Object.keys(pricingRules)} products={products} /> </div>
                        <div className="flex flex-col items-end gap-1">
                            <div className="flex items-center gap-4">
                                {userProfile.name && <span className="text-sm font-semibold" style={headerStyle}>{t('hello')}, {userProfile.name}!</span>}

                                {/* Admin Mode Indicator */}
                                <div className="flex flex-col items-center">
                                    <div className="flex items-center gap-2">
                                        <button
                                            onClick={() => setIsAdminModalOpen(true)}
                                            className={`px-3 py-1 rounded-full text-[10px] font-bold tracking-wider uppercase transition-all flex items-center gap-1.5 shadow-sm border ${isAdminMode
                                                ? 'bg-green-500/10 text-green-500 border-green-500/30'
                                                : 'bg-gray-500/10 text-gray-400 border-gray-500/30'
                                                }`}
                                        >
                                            <div className={`w-1.5 h-1.5 rounded-full animate-pulse ${isAdminMode ? 'bg-green-500' : 'bg-gray-400'}`}></div>
                                            {isAdminMode && <Lock className="w-3 h-3" />}
                                            {isAdminMode ? 'Admin Mode' : 'User Mode'}
                                        </button>

                                        {isAdminMode && (
                                            <button
                                                onClick={handleAdminPush}
                                                disabled={(!isDirty && syncStatus === 'idle') || isBusy}
                                                className={`flex items-center gap-2 px-3 py-1 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all shadow-sm border relative ${syncStatus === 'error'
                                                    ? 'bg-red-500 text-white border-red-600'
                                                    : (isDirty && syncStatus === 'idle')
                                                        ? 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700 shadow-indigo-200'
                                                        : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                                                    } ${isBusy ? 'opacity-40 cursor-not-allowed' : ''}`}
                                                title={!isDirty && syncStatus === 'idle' ? "No changes to push" : ""}
                                            >
                                                {syncStatus === 'pushing' ? (
                                                    <RotateCcw className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <UploadCloud className="w-3 h-3" />
                                                )}
                                                <span>
                                                    {syncStatus === 'pushing' ? 'Pushing...' : syncStatus === 'error' ? 'Push Failed — Retry' : 'Push to Database'}
                                                </span>
                                                {isDirty && syncStatus === 'idle' && (
                                                    <span className="absolute -top-1 -right-1 w-2 h-2 bg-indigo-500 rounded-full animate-pulse border-2 border-white"></span>
                                                )}
                                            </button>
                                        )}
                                    </div>
                                    {isAdminMode && syncStatus === 'pushing' && (
                                        <span className="text-[8px] text-indigo-500 font-bold mt-0.5 animate-pulse">
                                            Uploading master data and transactions...
                                        </span>
                                    )}
                                </div>

                                {hasInventory && <QuickUploadMenu themeColor={userProfile.themeColor} actions={quickUploadActions} disabled={isBusy} />}
                                <button className="relative p-2 hover:opacity-70 transition-opacity" style={headerStyle}><Bell className="w-6 h-6" /></button>
                                <div className="h-6 w-px" style={{ backgroundColor: `${headerTextColor}40` }}></div>
                                <UserProfile profile={userProfile} onUpdate={setUserProfile} />
                            </div>
                            <span className="text-[10px]" style={{ ...headerStyle, opacity: 0.6 }}>{TAX_NOTE_SHORT}</span>
                        </div>
                    </header>
                    <div ref={mainContentRef} className="flex-1 overflow-y-auto relative p-4 md:p-8">
                        <div style={{ display: currentView === 'search' ? 'block' : 'none' }}>
                            {activeSearch ? (
                                <SearchResultsPage
                                    data={{ results: activeSearch.results || [], query: activeSearch.query, params: activeSearch.params, id: activeSearch.id }}
                                    products={products}
                                    pricingRules={pricingRules}
                                    themeColor={userProfile.themeColor}
                                    timeLabel={activeSearch.timeLabel}
                                    onRefine={handleRefineSearch}
                                    searchConfig={searchConfig}
                                    priceChangeHistory={priceChangeHistory}
                                    thresholds={thresholds}
                                    headerStyle={headerStyle}
                                    skuFamilies={skuFamilies}
                                    adGroups={adGroups}
                                    priceHistoryMap={priceHistoryMap}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                    <Search className="w-12 h-12 mb-4 opacity-50" />
                                    <p className="text-lg font-medium">{t('search_empty_state')}</p>
                                </div>
                            )}
                        </div>
                        <div style={{ display: currentView === 'overview' ? 'block' : 'none' }}>
                            {products.length === 0 ? (
                                <div className="flex flex-col items-center justify-center min-h-[500px] bg-custom-glass rounded-2xl border-2 border-dashed border-custom-glass text-center p-12 h-full">
                                    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm" style={{ backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor }}>
                                        <Database className="w-10 h-10" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-900">{t('welcome_title')}</h3>
                                    <p className="text-gray-500 max-w-lg mt-3 mb-10 text-lg">{t('welcome_desc')}</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl relative">
                                        <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative group ${hasInventory ? 'bg-green-50/50 border-green-200' : 'bg-gray-50/50 border-gray-200 hover:border-indigo-300'}`}>
                                            <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${hasInventory ? 'bg-green-600 text-white' : 'text-white'}`} style={!hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>
                                                {hasInventory ? t('step_completed') : t('step_1')}
                                            </div>
                                            <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                                                {hasInventory ? <CheckCircle className="w-8 h-8 text-green-600" /> : <Database className="w-8 h-8" style={{ color: userProfile.themeColor }} />}
                                            </div>
                                            <h4 className="font-bold text-gray-900 text-lg">{t('empty_state_erp_title')}</h4>
                                            <p className="text-sm text-gray-500 mt-2 text-center">{t('empty_state_erp_desc')}</p>
                                            <button
                                                onClick={() => setIsUploadModalOpen(true)}
                                                className={`mt-6 w-full py-3 bg-white border text-gray-700 font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${hasInventory ? 'border-green-300 text-green-700' : 'border-gray-300'}`}
                                                style={!hasInventory ? { borderColor: userProfile.themeColor, color: userProfile.themeColor } : {}}
                                            >
                                                {hasInventory ? t('reupload_inventory') : t('upload_inventory')}
                                            </button>
                                        </div>
                                        <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative ${!hasInventory ? 'bg-gray-50/50 border-gray-200 opacity-60' : 'bg-custom-glass border-indigo-200 shadow-lg scale-105 z-10'}`}>
                                            <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${!hasInventory ? 'bg-gray-400 text-white' : 'text-white'}`} style={hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>
                                                {t('step_2')}
                                            </div>
                                            <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                                                <FileBarChart className={`w-8 h-8 ${!hasInventory ? 'text-gray-400' : ''}`} style={hasInventory ? { color: userProfile.themeColor } : {}} />
                                            </div>
                                            <h4 className="font-bold text-gray-900 text-lg">{t('empty_state_sales_title')}</h4>
                                            <p className="text-sm text-gray-500 mt-2 text-center">{t('empty_state_sales_desc')}</p>
                                            <button
                                                onClick={() => hasInventory && setIsSalesImportModalOpen(true)}
                                                disabled={!hasInventory}
                                                style={hasInventory ? { backgroundColor: userProfile.themeColor } : {}}
                                                className={`mt-6 w-full py-3 font-bold rounded-lg flex items-center justify-center gap-2 text-white transition-all ${!hasInventory ? 'bg-gray-300' : 'hover:opacity-90 shadow-lg'}`}
                                            >
                                                <Upload className="w-5 h-5" /> {t('upload_sales')}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <OverviewPageContainer
                                    products={products}
                                    priceHistoryMap={priceHistoryMap}
                                    refundHistory={refundHistory}
                                    pricingRules={pricingRules}
                                    priceChangeHistory={priceChangeHistory}
                                    promotions={promotions}
                                    themeColor={userProfile.themeColor}
                                    onAnalyze={handleAnalyze}
                                    onDeepDive={handleDeepDiveRequest}
                                    onSearch={handleSearch}
                                    thresholds={thresholds}
                                    deductRefunds={deductRefunds}
                                    setDeductRefunds={setDeductRefunds}
                                    mapJumpState={mapJumpState}
                                />
                            )}
                        </div>
                        <div style={{ display: currentView === 'products' ? 'block' : 'none' }}>
                            <ProductManagementPage
                                products={products}
                                pricingRules={pricingRules}
                                promotions={promotions || []}
                                priceHistoryMap={priceHistoryMap}
                                refundHistory={refundHistory || []}
                                priceChangeHistory={priceChangeHistory || []}
                                onOpenMappingModal={() => setIsMappingModalOpen(true)}
                                dateLabels={dynamicDateLabels}
                                onUpdateProduct={(p) => setProducts(prev => (prev || []).map(old => old.id === p.id ? p : old))}
                                onViewElasticity={handleViewElasticity}
                                themeColor={userProfile.themeColor}
                                onAnalyze={handleAnalyze}
                                onDeepDive={handleDeepDiveRequest}
                                onSearch={handleSearch}
                                thresholds={thresholds}
                                deductRefunds={deductRefunds}
                                setDeductRefunds={setDeductRefunds}
                                onAnalyzeCarrier={handleAnalyzeCarrier}
                                skuFamilies={skuFamilies}
                                setSkuFamilies={setSkuFamilies}
                                pendingFamilySuggestions={pendingFamilySuggestions}
                                setPendingFamilySuggestions={setPendingFamilySuggestions}
                                headerStyle={headerStyle}
                            />
                        </div>
                        <div style={{ display: currentView === 'platforms' ? 'block' : 'none' }}>
                            <PlatformManagementPage
                                products={products}
                                priceHistoryMap={priceHistoryMap}
                                refundHistory={refundHistory}
                                deductRefunds={deductRefunds}
                                setDeductRefunds={setDeductRefunds}
                                pricingRules={pricingRules}
                                themeColor={userProfile.themeColor}
                                adGroups={adGroups}
                                skuFamilies={skuFamilies}
                                onSyncFromFamilies={onSyncFromFamilies}
                                onAddAdGroup={onAddAdGroup}
                                onEditAdGroup={onEditAdGroup}
                                onRemoveAdGroup={onRemoveAdGroup}
                                onSaveAdGroups={handleAdGroupSave}
                                lastRecalculationSummary={lastRecalculationSummary}
                                headerStyle={headerStyle}
                            />
                        </div>
                        <div style={{ display: currentView === 'strategy' ? 'block' : 'none' }}>
                            <StrategyPage
                                products={products}
                                pricingRules={pricingRules}
                                currentConfig={strategyRules}
                                onSaveConfig={(newConfig: StrategyConfig) => { setStrategyRules(newConfig); }}
                                themeColor={userProfile.themeColor}
                                priceHistoryMap={priceHistoryMap}
                                refundHistory={refundHistory}
                                deductRefunds={deductRefunds}
                                setDeductRefunds={setDeductRefunds}
                                promotions={promotions || []}
                                priceChangeHistory={priceChangeHistory || []}
                                costChangeHistory={costChangeHistory || []}
                                inventoryChangeHistory={inventoryChangeHistory || []}
                                onUpdatePriceChangeRecord={handleUpdatePriceChangeRecord}
                                onUpdateCostChangeRecord={handleUpdateCostChangeRecord}
                                onUpdateInventoryChangeRecord={handleUpdateInventoryChangeRecord}
                                onManualPriceChange={handleManualPriceChange}
                                onManualCostChange={handleManualCostChange}
                                velocityLookback={velocityLookback}
                                thresholds={thresholds}
                                skuFamilies={skuFamilies}
                            />
                        </div>
                        <div style={{ display: currentView === 'costs' ? 'block' : 'none' }}>
                            <CostManagementPage products={products} themeColor={userProfile.themeColor} headerStyle={headerStyle} />
                        </div>
                        <div style={{ display: currentView === 'promotions' ? 'block' : 'none' }}>
                            <PromotionPage
                                products={products}
                                pricingRules={pricingRules}
                                logisticsRules={logisticsRules || []}
                                promotions={promotions || []}
                                priceHistoryMap={priceHistoryMap}
                                onAddPromotion={(p) => setPromotions(prev => [...(prev || []), p])}
                                onUpdatePromotion={(p) => setPromotions(prev => (prev || []).map(o => o.id === p.id ? p : o))}
                                onDeletePromotion={(id) => setPromotions(prev => (prev || []).filter(p => p.id !== id))}
                                themeColor={userProfile.themeColor}
                                headerStyle={headerStyle}
                            />
                        </div>
                        <div style={{ display: currentView === 'tools' ? 'block' : 'none' }}>
                            <ToolboxPage
                                promotions={promotions || []}
                                pricingRules={pricingRules}
                                inventoryTemplates={inventoryTemplates || []}
                                onSaveTemplates={setInventoryTemplates}
                                products={products}
                                themeColor={userProfile.themeColor}
                                headerStyle={headerStyle}
                            />
                        </div>
                        <div style={{ display: currentView === 'definitions' ? 'block' : 'none' }}>
                            <DefinitionsPage />
                        </div>
                        <div style={{ display: currentView === 'custom-report' ? 'block' : 'none' }}>
                            <CustomReportPage
                                products={products}
                                priceHistory={salesHistory}
                                refundHistory={refundHistory}
                            />
                        </div>
                        <div style={{ display: currentView === 'settings' ? 'block' : 'none' }}>
                            <SettingsPage
                                currentRules={pricingRules}
                                onSave={(newRules, newVelocity, newSearchConfig) => {
                                    setPricingRules(newRules);
                                    setVelocityLookback(newVelocity);
                                    if (newSearchConfig) setSearchConfig(newSearchConfig);
                                    localStorage.setItem('sello_velocity_setting', newVelocity);
                                    handleRecalculateVelocity(newVelocity);
                                }}
                                logisticsRules={logisticsRules || []}
                                onSaveLogistics={(newLogistics) => { setLogisticsRules(newLogistics); }}
                                products={products}
                                shipmentHistory={shipmentHistory || []}
                                themeColor={userProfile.themeColor}
                                searchConfig={searchConfig}
                                velocityLookback={velocityLookback}
                                extraData={{ priceHistory: salesHistory, promotions: promotions || [] }}
                                onRefreshThresholds={handleRefreshThresholds}
                                brandMap={brandMap}
                                categoryMap={categoryMap}
                                onSaveBrandMap={setBrandMap}
                                onSaveCategoryMap={setCategoryMap}
                                headerStyle={headerStyle}
                            />
                        </div>
                    </div>
                </main>
                {/* Admin Password Modal */}
                {isAdminModalOpen && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-gray-100">
                            <div className="flex flex-col items-center gap-4 text-center mb-6">
                                <div className={`w-16 h-16 rounded-full flex items-center justify-center ${isAdminMode ? 'bg-green-100 text-green-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                    <Lock className="w-8 h-8" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">
                                        {isAdminMode ? 'Elevated Access Active' : 'Restricted Access'}
                                    </h3>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {isAdminMode
                                            ? 'Manually synchronize your changes to the global cloud database.'
                                            : 'Please enter your administrator credentials to enable global persistence.'}
                                    </p>
                                </div>
                            </div>

                            {!isAdminMode ? (
                                <div className="space-y-4">
                                    <input
                                        type="password"
                                        placeholder="Admin Password"
                                        value={adminPassword}
                                        onChange={(e) => setAdminPassword(e.target.value)}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && (async () => {
                                            const res = await handleAdminToggle(adminPassword);
                                            if (res.success) {
                                                setIsAdminModalOpen(false);
                                                setAdminPassword('');
                                                setAdminError(null);
                                            } else {
                                                setAdminError(res.error || 'Login failed');
                                            }
                                        })()}
                                    />
                                    {adminError && <p className="text-xs text-red-500 font-medium px-1">{adminError}</p>}
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => { setIsAdminModalOpen(false); setAdminPassword(''); setAdminError(null); }}
                                            className="flex-1 py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={async () => {
                                                const res = await handleAdminToggle(adminPassword);
                                                if (res.success) {
                                                    setIsAdminModalOpen(false);
                                                    setAdminPassword('');
                                                    setAdminError(null);
                                                } else {
                                                    setAdminError(res.error || 'Login failed');
                                                }
                                            }}
                                            className="flex-1 py-3 text-sm font-bold text-white rounded-xl transition-all shadow-md active:scale-95"
                                            style={{ backgroundColor: userProfile.themeColor }}
                                        >
                                            Login
                                        </button>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <button
                                        onClick={async () => {
                                            const res = await handleAdminExit();
                                            if (res.needsConfirmation) {
                                                setShowAdminExitConfirmation(true);
                                                setIsAdminModalOpen(false);
                                            } else {
                                                setIsAdminModalOpen(false);
                                            }
                                        }}
                                        className="w-full py-3 bg-red-50 text-red-600 font-bold rounded-xl border border-red-100 hover:bg-red-100 transition-colors shadow-sm"
                                    >
                                        Exit Admin Mode
                                    </button>
                                    <button
                                        onClick={() => setIsAdminModalOpen(false)}
                                        className="w-full py-3 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-colors"
                                    >
                                        Keep Active
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Save Toast */}
                {showSaveToast && (
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <div className="bg-green-600 text-white px-6 py-3 rounded-full shadow-2xl flex items-center gap-3 border border-green-500/50">
                            <div className="w-5 h-5 rounded-full bg-white/20 flex items-center justify-center">
                                <RefreshCw className="w-3 h-3 animate-spin" />
                            </div>
                            <span className="font-bold text-sm">Saved to database ✓</span>
                        </div>
                    </div>
                )}

                {/* Family Conflict Modal */}
                {pendingFamilyConflicts.length > 0 && (
                    <div className="fixed inset-0 z-[150] flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                        <div className="bg-white rounded-3xl p-8 max-w-md w-full shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
                            <div className="flex flex-col items-center gap-4 text-center mb-8">
                                <div className="w-20 h-20 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center shadow-inner">
                                    <AlertTriangle className="w-10 h-10" />
                                </div>
                                <div>
                                    <h3 className="text-2xl font-bold text-gray-900">Sync Conflicts Detected</h3>
                                    <p className="text-sm text-gray-500 mt-2">
                                        The following {pendingFamilyConflicts.length} family groups exist locally but are missing from the master database:
                                    </p>
                                </div>
                            </div>

                            <div className="max-h-48 overflow-y-auto mb-8 pr-2 space-y-2">
                                {pendingFamilyConflicts.map(fam => (
                                    <div key={fam.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <span className="font-bold text-gray-700">{fam.name}</span>
                                        <span className="text-[10px] text-gray-400 bg-white px-2 py-1 rounded-md border border-gray-100">
                                            {fam.memberSkus.length} SKUs
                                        </span>
                                    </div>
                                ))}
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <button
                                    onClick={() => resolveConflicts(false)}
                                    className="py-4 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-2xl transition-all active:scale-95"
                                >
                                    Discard Local
                                </button>
                                <button
                                    onClick={() => resolveConflicts(true)}
                                    className="py-4 text-sm font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-2xl transition-all shadow-lg shadow-amber-600/20 active:scale-95 flex items-center justify-center gap-2"
                                >
                                    Keep Local
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                {isUploadModalOpen && (
                    <BatchUploadModal
                        products={products}
                        onClose={() => setIsUploadModalOpen(false)}
                        onConfirm={handleInventoryImport}
                    />
                )}
                {isSalesImportModalOpen && (
                    <SalesImportModal
                        products={products}
                        pricingRules={pricingRules}
                        learnedAliases={learnedAliases}
                        onClose={() => setIsSalesImportModalOpen(false)}
                        onResetData={handleResetSalesData}
                        onConfirm={handleSalesImportConfirm}
                    />
                )}
                {isSkuDetailModalOpen && (
                    <SkuDetailUploadModal
                        products={products}
                        onClose={() => setIsSkuDetailModalOpen(false)}
                        onConfirm={handleSkuDetailImport}
                    />
                )}
                {isMappingModalOpen && (
                    <MappingUploadModal
                        products={products}
                        platforms={Object.keys(pricingRules)}
                        learnedAliases={learnedAliases}
                        onClose={() => setIsMappingModalOpen(false)}
                        onConfirm={handleMappingImport}
                    />
                )}
                {isReturnsModalOpen && (
                    <ReturnsUploadModal
                        onClose={() => setIsReturnsModalOpen(false)}
                        onConfirm={handleReturnsImport}
                        onReset={handleResetRefunds}
                        existingOrders={existingOrders}
                    />
                )}
                {isCAUploadModalOpen && (
                    <CAUploadModal
                        products={products}
                        onClose={() => setIsCAUploadModalOpen(false)}
                        onConfirm={handleCAImport}
                    />
                )}
                {isShipmentModalOpen && (
                    <ShipmentUploadModal
                        products={products}
                        onClose={() => setIsShipmentModalOpen(false)}
                        onConfirm={handleShipmentImport}
                    />
                )}
                {selectedElasticityProduct && (
                    <PriceElasticityModal
                        product={selectedElasticityProduct}
                        priceHistory={salesHistory}
                        priceChangeHistory={priceChangeHistory || []}
                        onClose={() => setSelectedElasticityProduct(null)}
                    />
                )}
                {selectedAnalysisProduct && (
                    <AnalysisModal
                        product={selectedAnalysisProduct}
                        analysis={analysisResult}
                        isLoading={isAnalysisLoading}
                        onClose={() => { setSelectedAnalysisProduct(null); setAnalysisResult(null); }}
                        onApplyPrice={handleApplyPrice}
                        themeColor={userProfile.themeColor}
                    />
                )}

                <button
                    onClick={() => {
                        if (mainContentRef.current) {
                            mainContentRef.current.scrollTo({ top: 0, behavior: 'smooth' });
                        }
                    }}
                    className={`fixed bottom-8 right-8 p-2.5 rounded-full bg-custom-glass border border-custom-glass shadow-lg hover:shadow-xl transition-all duration-300 z-[60] flex items-center justify-center ${showBackToTop ? 'opacity-70 hover:opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}
                    style={{ borderColor: `${userProfile.themeColor}40`, color: userProfile.themeColor }}
                    aria-label="Back to top"
                >
                    <ArrowUp className="w-5 h-5" />
                </button>
                {/* Admin Exit Confirmation Modal */}
                {showAdminExitConfirmation && (
                    <div className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                        <div className="bg-white rounded-2xl p-8 max-w-sm w-full shadow-2xl border border-gray-100 animate-in zoom-in-95 duration-200">
                            <div className="flex flex-col items-center gap-4 text-center mb-6">
                                <div className="w-16 h-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                                    <AlertTriangle className="w-8 h-8" />
                                </div>
                                <div className="space-y-2">
                                    <h3 className="text-xl font-bold text-gray-900">Unsaved Changes</h3>
                                    <p className="text-sm text-gray-500">
                                        You have changes that haven't been pushed to the database yet. Your team won't see these updates until you push.
                                    </p>
                                </div>
                            </div>

                            <div className="flex flex-col gap-3">
                                <button
                                    onClick={async () => {
                                        const success = await handleAdminPush();
                                        if (success) {
                                            await handleAdminExit(true);
                                            setShowAdminExitConfirmation(false);
                                        }
                                    }}
                                    disabled={syncStatus === 'pushing'}
                                    className="w-full py-4 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                                >
                                    {syncStatus === 'pushing' ? <RotateCcw className="w-4 h-4 animate-spin" /> : <UploadCloud className="w-4 h-4" />}
                                    Push Now
                                </button>
                                <button
                                    onClick={async () => {
                                        await handleAdminExit(true);
                                        setShowAdminExitConfirmation(false);
                                    }}
                                    className="w-full py-4 text-sm font-bold text-gray-500 hover:bg-gray-50 rounded-xl transition-colors"
                                >
                                    Exit Without Pushing
                                </button>
                                <button
                                    onClick={() => {
                                        setShowAdminExitConfirmation(false);
                                        setIsAdminModalOpen(true);
                                    }}
                                    className="w-full py-2 text-sm font-bold text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
};

export default App;
