
import React, { startTransition, useState, useEffect } from 'react';
import { useAppState } from './hooks/useAppState';
import { QuickUploadMenu } from './components/shared/QuickUploadMenu';

// Components
import { OverviewPageContainer } from './components/overview/OverviewPageContainer';

import ProductManagementPage from './components/productManagement/ProductManagementPage';
import StrategyPage from './components/strategy/StrategyPage';
import PlatformManagementPage from './components/platformManagement/PlatformManagementPage';

import {
    LayoutDashboard, FlaskConical, BadgePoundSterling, Tag, Briefcase, Settings, BookOpen, Search, X,
    Download, Upload, Database, CheckCircle, FileBarChart, Bell, History,
    ChevronDown, RotateCcw, FileText, Link as LinkIcon, Ship, Store,
    ArrowUp, ShoppingBasket, Table, Lock, LogOut, RefreshCw, UploadCloud, Loader2, BarChart2, Target
} from 'lucide-react';

import GlobalSearch from './components/shared/GlobalSearch';
import UserProfile from './components/shared/UserProfile';
import SearchResultsPage from './components/search/SearchResultsPage';
import CostManagementPage from './components/costManagement/CostManagementPage';
import PromotionPage from './components/promotionManager/PromotionPage';
import ToolboxPage from './components/toolbox/ToolboxPageContainer';
import DefinitionsPage from './components/definitions/DefinitionsPageContainer';
import SettingsPage from './components/settings/SettingsPage';
import { CustomReportPage } from './components/customReport/CustomReportPage';
import AdCampaignPageContainer from './components/adCampaign/AdCampaignPageContainer';
import BatchUploadModal from './components/shared/modals/BatchUploadModal';
import SalesImportModal from './components/shared/modals/SalesImportModal';
import SkuDetailUploadModal from './components/shared/modals/SkuDetailUploadModal';
import MappingUploadModal from './components/shared/modals/MappingUploadModal';
import ReturnsUploadModal from './components/shared/modals/ReturnsUploadModal';
import CAUploadModal from './components/shared/modals/CAUploadModal';
import ShipmentUploadModal from './components/shared/modals/ShipmentUploadModal';
import PriceElasticityModal from './components/skuDeepDive/PriceElasticityModal';
import AnalysisModal from './components/skuDeepDive/AnalysisModal';

import { TAX_NOTE_SHORT } from './services/taxPolicy';
import { hexToRgb } from './utils/color';
import { StrategyConfig, OptimalPriceResult } from './types';
import type { CohortShiftWarning } from './services/cohortAnalysis';


const PageSpinner = () => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '16rem', opacity: 0.35 }}>
        <svg style={{ width: 28, height: 28, animation: 'spin 1s linear infinite' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        </svg>
    </div>
);


// ── Admin Modal — own component so password typing doesn't re-render the whole app ──
interface AdminModalProps {
    onClose: () => void;
    onSuccess: () => void;
    handleAdminToggle: (pw: string) => Promise<{ success: boolean; error?: string }>;
}
const AdminModal: React.FC<AdminModalProps> = ({ onClose, onSuccess, handleAdminToggle }) => {
    const [password, setPassword] = React.useState('');
    const [error, setError] = React.useState('');

    const tryLogin = async () => {
        const r = await handleAdminToggle(password);
        if (r.success) { onSuccess(); } else { setError(r.error || 'Invalid password'); }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <h3 className="text-base font-bold text-gray-900">Enter Admin Mode</h3>
                    <button onClick={onClose} className="p-1.5 hover:bg-gray-200 rounded-full text-gray-400"><X className="w-4 h-4" /></button>
                </div>
                <div className="p-6 space-y-4">
                    <p className="text-sm text-gray-500">Enter the admin password to unlock push-to-database controls.</p>
                    <input
                        type="password"
                        value={password}
                        onChange={e => { setPassword(e.target.value); setError(''); }}
                        onKeyDown={async e => { if (e.key === 'Enter') await tryLogin(); }}
                        placeholder="Admin password..."
                        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:ring-2 focus:ring-theme outline-none transition-all text-sm"
                        autoFocus
                    />
                    {error && <p className="text-xs text-red-600 font-medium">{error}</p>}
                </div>
                <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-5 py-2 text-gray-500 font-bold text-sm hover:text-gray-700">Cancel</button>
                    <button onClick={tryLogin} className="px-6 py-2 bg-theme hover:bg-theme text-white rounded-xl text-sm font-bold shadow-md transition-all opacity-90 hover:opacity-100">
                        Unlock
                    </button>
                </div>
            </div>
        </div>
    );
};

const App: React.FC = () => {
    const {
        t,
        products,
        setProducts,
        salesHistory,
        refundHistory,
        freightRates,
        handleFreightRatesUpload,
        priceChangeHistory,
        costChangeHistory,
        inventoryChangeHistory,
        promotions,
        setPromotions,
        learnedAliases,
        setLearnedAliases,
        inventoryTemplates,
        setInventoryTemplates,
        priceCheckTemplates,
        handleSavePriceCheckTemplates,
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
        handleSaveBrandMap,
        categoryMap,
        handleSaveCategoryMap,
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
        handleDescriptionImport,
        handleStampLandedAt,
        handleShipmentImport,
        // DB Sync
        isAdminMode,
        isDirty,
        syncStatus,
        lastSyncedAt,
        showSaveToast,
        pushProgress,
        pushTotal,
        syncStep,
        syncProgress,
        syncTotal,
        handleAdminToggle,
        handleAdminExit,
        handleAdminPush,
        handleSync,
        // Optimal pricing
        cohortSnapshot,
        optimalPriceResults,
        benchmarkUpdateNotices,
        handleRecalculateBenchmarks,
        // Ad Campaign
        adSnapshots,
        adRosterChanges,
        adBudgets,
        handleAdCampaignImport,
        handleAdRosterChange,
    } = useAppState();

    // Progressive page mounting — pages stagger-mount during browser idle time after initial render
    const PAGE_ORDER = ['search','products','platforms','strategy','costs','promotions','ad-campaigns','tools','definitions','settings','custom-report'];
    const [mountedPages, setMountedPages] = useState<Set<string>>(() => new Set<string>());
    // Frozen props for background-mounted pages — only update when page is active
    // Prevents expensive useMemo recalcs in hidden pages when unrelated state changes
    const frozenPromotionsRef = React.useRef(promotions || []);
    if (currentView === 'strategy' || !mountedPages.has('strategy')) {
        frozenPromotionsRef.current = promotions || [];
    }
    const strategyPromotions = frozenPromotionsRef.current;

    const frozenPromoOverviewRef = React.useRef(promotions || []);
    if (currentView === 'overview' || !mountedPages.has('overview')) {
        frozenPromoOverviewRef.current = promotions || [];
    }

    const frozenPromoProductsRef = React.useRef(promotions || []);
    if (currentView === 'products' || !mountedPages.has('products')) {
        frozenPromoProductsRef.current = promotions || [];
    }

    const frozenPromoToolboxRef = React.useRef(promotions || []);
    if (currentView === 'tools' || !mountedPages.has('tools')) {
        frozenPromoToolboxRef.current = promotions || [];
    }
    const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
        try { return localStorage.getItem('sello_sidebar_collapsed') === 'true'; } catch { return false; }
    });
    const toggleSidebar = () => setSidebarCollapsed(prev => {
        const next = !prev;
        try { localStorage.setItem('sello_sidebar_collapsed', String(next)); } catch {}
        return next;
    });

    // Optimal price curve modal state (extends useAppState's selectedElasticityProduct)
    const [elasticityResult, setElasticityResult] = useState<OptimalPriceResult | null>(null);
    const handleViewElasticityWithResult = (product: Parameters<typeof handleViewElasticity>[0], result?: OptimalPriceResult) => {
        setElasticityResult(result ?? null);
        handleViewElasticity(product);
    };

    useEffect(() => {
        let i = 0;
        const schedule = () => {
            if (i >= PAGE_ORDER.length) return;
            const page = PAGE_ORDER[i++];
            setMountedPages(prev => new Set([...prev, page]));
            if (typeof requestIdleCallback !== 'undefined') {
                requestIdleCallback(schedule, { timeout: 300 });
            } else {
                setTimeout(schedule, 50);
            }
        };
        if (typeof requestIdleCallback !== 'undefined') {
            requestIdleCallback(schedule, { timeout: 500 });
        } else {
            setTimeout(schedule, 100);
        }
    }, []);

    // Admin mode local UI state
    const [showAdminModal, setShowAdminModal] = useState(false);
    const [showExitConfirm, setShowExitConfirm] = useState(false);

    const quickUploadActions = [
        { label: t('quick_upload_inventory'), icon: Database, action: () => setIsUploadModalOpen(true), color: 'text-theme' },
        { label: t('quick_upload_sales'), icon: FileBarChart, action: () => setIsSalesImportModalOpen(true), color: 'text-blue-600' },
        { label: t('quick_upload_refunds'), icon: RotateCcw, action: () => setIsReturnsModalOpen(true), color: 'text-red-600' },
        { label: t('quick_upload_sku_detail'), icon: FileText, action: () => setIsSkuDetailModalOpen(true), color: 'text-teal-600' },
        { label: t('quick_upload_ca_report'), icon: Upload, action: () => setIsCAUploadModalOpen(true), color: 'text-purple-600' },
        { label: t('quick_upload_sku_mapping'), icon: LinkIcon, action: () => setIsMappingModalOpen(true), color: 'text-amber-600' },
        { label: t('quick_upload_shipment'), icon: Ship, action: () => setIsShipmentModalOpen(true), color: 'text-teal-600' },
    ];

    const headerTextColor = userProfile.textColor || '#111827';
    const textShadowStyle = userProfile.backgroundImage && userProfile.backgroundImage !== 'none' ? { textShadow: '0 1px 3px rgba(0,0,0,0.3)' } : {};
    const _themeRgb = (() => { const rgb = hexToRgb(userProfile.themeColor); return rgb ? `${rgb.r}, ${rgb.g}, ${rgb.b}` : '19, 78, 74'; })();
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
        'ad-campaigns': 'Ad Campaigns',
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
        'ad-campaigns': 'Track and manage ad group performance',
        settings: t('desc_settings'),
    };

    return (
        <>
            <style>{`html, body { height: 100%; margin: 0; padding: 0; overflow: hidden; } :root { --glass-bg: ${userProfile.glassMode === 'dark' ? `rgba(17, 24, 39, ${(userProfile.glassOpacity ?? 90) / 100})` : `rgba(255, 255, 255, ${(userProfile.glassOpacity ?? 90) / 100})`}; --glass-border: ${userProfile.glassMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.4)'}; --glass-blur: blur(${userProfile.glassBlur ?? 10}px); --glass-bg-modal: ${userProfile.glassMode === 'dark' ? `rgba(17, 24, 39, ${Math.min(1, (userProfile.glassOpacity ?? 90) / 100 + 0.1)})` : `rgba(255, 255, 255, ${Math.min(1, (userProfile.glassOpacity ?? 90) / 100 + 0.1)})`}; --glass-blur-modal: blur(${Math.min(40, (userProfile.glassBlur ?? 10) + 8)}px); --ambient-bg: rgba(${ambientRgb.r}, ${ambientRgb.g}, ${ambientRgb.b}, ${(userProfile.ambientGlassOpacity ?? 15) / 100}); --ambient-blur: blur(${Math.min(20, (userProfile.glassBlur ?? 10) + 4)}px); --glass-header-bg: rgba(249,250,251,0.97); --glass-row-even: rgba(249,250,251,0.30); --glass-row-hover: rgba(243,244,246,0.60); --glass-divider: rgba(229,231,235,0.55); --theme: ${userProfile.themeColor}; --theme-rgb: ${_themeRgb}; --theme-10: rgba(${_themeRgb}, 0.10); --theme-20: rgba(${_themeRgb}, 0.20); } .bg-custom-glass { background-color: var(--glass-bg); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); } .border-custom-glass { border-color: var(--glass-border); } .bg-custom-glass-modal { background-color: var(--glass-bg-modal); } .backdrop-blur-custom-modal { backdrop-filter: var(--glass-blur-modal); -webkit-backdrop-filter: var(--glass-blur-modal); } .bg-custom-ambient { background-color: var(--ambient-bg); } .backdrop-blur-custom-ambient { backdrop-filter: var(--ambient-blur); -webkit-backdrop-filter: var(--ambient-blur); }`}</style>
            <div className="h-screen flex font-sans text-gray-900 transition-colors duration-500 relative bg-transparent">
                {userProfile.ambientGlass && <div className="fixed inset-0 z-[1] pointer-events-none transition-all duration-500 bg-custom-ambient backdrop-blur-custom-ambient" />}
                <div className="group/sidebar hidden md:block fixed h-full z-40" style={{ width: sidebarCollapsed ? 64 : 240, transition: 'width 300ms' }}>
                <aside className="w-full h-full flex flex-col border-r border-custom-glass shadow-sm bg-custom-glass">
                    <div className="h-[60px] flex items-center px-3 gap-6 border-b border-custom-glass">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0" style={{ backgroundColor: userProfile.themeColor, marginLeft: '6px' }}>S</div>
                        <span
                            className="overflow-hidden whitespace-nowrap transition-[width,opacity] duration-300 ease-in-out"
                            style={{
                                width: sidebarCollapsed ? 0 : '160px',
                                opacity: sidebarCollapsed ? 0 : 1,
                                marginLeft: sidebarCollapsed ? 0 : '0px',
                            }}
                        >
                            <span className="font-bold text-lg tracking-tight text-gray-900 whitespace-nowrap">Sello UK Hub</span>
                        </span>
                    </div>
                    <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto">
                        {[
                            { id: 'overview', icon: LayoutDashboard, label: t('nav_overview') },
                            { id: 'products', icon: ShoppingBasket, label: t('nav_products') },
                            { id: 'platforms', icon: Store, label: t('nav_platforms') },
                            { id: 'strategy', icon: FlaskConical, label: t('nav_strategy') },
                            { id: 'costs', icon: BadgePoundSterling, label: t('nav_costs') },
                            { id: 'promotions', icon: Tag, label: t('nav_promotions') },
                            { id: 'ad-campaigns', icon: Target, label: 'Ad Campaigns' },
                            { id: 'custom-report', icon: Table, label: 'Custom Reports' },
                            { id: 'tools', icon: Briefcase, label: t('nav_toolbox') },
                            { id: 'settings', icon: Settings, label: t('nav_config') },
                            { id: 'definitions', icon: BookOpen, label: t('nav_definitions') }
                        ].map((item) => {
                            const isActive = currentView === item.id;
                            return (
                                <div key={item.id}>
                                    <button
                                        onClick={() => setCurrentView(item.id as any)}
                                        className={`w-full flex items-center px-3 py-2 rounded-lg font-medium text-sm transition-colors duration-150 ${isActive ? 'bg-opacity-10' : 'text-gray-500'}`}
                                        style={isActive
                                            ? { backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor }
                                            : undefined}
                                        onMouseEnter={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.backgroundColor = `${userProfile.themeColor}12`; (e.currentTarget as HTMLElement).style.color = userProfile.themeColor; } }}
                                        onMouseLeave={e => { if (!isActive) { (e.currentTarget as HTMLElement).style.backgroundColor = ''; (e.currentTarget as HTMLElement).style.color = ''; } }}
                                    >
                                        <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                                            <item.icon className="w-4 h-4" />
                                        </span>
                                        <span
                                            className="overflow-hidden whitespace-nowrap transition-[width,opacity] duration-300 ease-in-out"
                                            style={{
                                                width: sidebarCollapsed ? 0 : 'auto',
                                                opacity: sidebarCollapsed ? 0 : 1,
                                                marginLeft: sidebarCollapsed ? 0 : '30px',
                                            }}
                                        >
                                            {item.label}
                                        </span>
                                    </button>
                                </div>
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
                    <div className={`border-t border-custom-glass space-y-2 ${sidebarCollapsed ? 'p-2' : 'p-3'}`}>
                        {!sidebarCollapsed && <div className="px-1 flex gap-1">
                            <button
                                onClick={handleBackup}
                                disabled={syncStatus === 'syncing' || syncStatus === 'pushing'}
                                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold text-gray-600 hover:bg-gray-100/50 transition-colors border border-custom-glass disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Download className="w-3 h-3" /> {t('backup_db')}
                            </button>
                            <button
                                onClick={() => fileRestoreRef.current?.click()}
                                disabled={syncStatus === 'syncing' || syncStatus === 'pushing'}
                                className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 rounded-lg text-[10px] font-bold text-gray-600 hover:bg-gray-100/50 transition-colors border border-custom-glass disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                <Upload className="w-3 h-3" /> {t('restore_db')}
                            </button>
                            <input ref={fileRestoreRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />
                        </div>}
                        {sidebarCollapsed && <input ref={fileRestoreRef} type="file" accept=".json" className="hidden" onChange={handleRestore} />}
                        {!sidebarCollapsed && <button
                            onClick={handleSync}
                            disabled={syncStatus === 'pushing' || syncStatus === 'syncing'}
                            className={`w-full flex flex-col items-center justify-center gap-0.5 px-2 py-2 rounded-lg text-[10px] font-bold transition-all border ${syncStatus === 'error'
                                ? 'text-red-600 border-red-200 bg-red-50/50 hover:bg-red-50'
                                : 'text-theme border-theme-20 bg-theme-10 hover:bg-theme-10'
                                } disabled:opacity-40 disabled:cursor-not-allowed`}
                        >
                            <div className="flex items-center gap-1.5 w-full">
                                {syncStatus === 'syncing' ? (
                                    <div className="flex flex-col items-center gap-1 w-full">
                                        <div className="flex items-center gap-1.5">
                                            <Loader2 className="w-3 h-3 animate-spin" />
                                            <span>
                                                {syncTotal > 0
                                                    ? `Syncing ${Math.round((syncProgress / syncTotal) * 100)}%`
                                                    : 'Syncing...'}
                                            </span>
                                        </div>
                                        {syncTotal > 0 && (
                                            <div className="w-full bg-gray-200 rounded-full h-1">
                                                <div
                                                    className="bg-theme rounded-full h-1 transition-all duration-300"
                                                    style={{ width: `${Math.round((syncProgress / syncTotal) * 100)}%` }}
                                                />
                                            </div>
                                        )}
                                        {syncStep ? (
                                            <span className="text-[9px] font-normal opacity-75 text-center leading-tight">
                                                {syncStep}
                                            </span>
                                        ) : null}
                                    </div>
                                ) : syncStatus === 'error' ? (
                                    <><RefreshCw className="w-3 h-3" /> Sync Failed — Retry</>
                                ) : (
                                    <><RefreshCw className="w-3 h-3" /> SYNC DATA</>
                                )}
                            </div>
                            {lastSyncedAt && syncStatus === 'idle' && (
                                <span className="text-[8px] text-gray-400 font-normal">
                                    {new Date(lastSyncedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                </span>
                            )}
                        </button>}
                        {!sidebarCollapsed && <div className="bg-gray-50/50 rounded-lg border border-custom-glass overflow-hidden transition-all duration-300">
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
                        </div>}
                    </div>
                </aside>
                {/* Floating sidebar toggle — appears on hover at vertical centre of sidebar edge */}
                <button
                    onClick={toggleSidebar}
                    className="absolute top-1/2 -translate-y-1/2 -right-3 w-6 h-6 rounded-full border border-custom-glass bg-white shadow-md flex items-center justify-center text-gray-400 hover:text-gray-700 hover:shadow-lg transition-all duration-150 opacity-0 group-hover/sidebar:opacity-100 z-50"
                    title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
                >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        {sidebarCollapsed
                            ? <path d="M9 18l6-6-6-6"/>
                            : <path d="M15 18l-6-6 6-6"/>
                        }
                    </svg>
                </button>
                </div>
                <main className={`flex-1 ${sidebarCollapsed ? 'md:ml-16' : 'md:ml-60'} min-0 relative z-10 flex flex-col h-full overflow-hidden transition-all duration-300`}>
                    <header className={`fixed top-0 right-0 z-50 flex items-center gap-4 px-6 h-[60px] bg-custom-glass border-b border-custom-glass/50 shadow-sm transition-all duration-300 ${sidebarCollapsed ? 'left-16' : 'left-60'}`}>
                        <div className="flex items-center gap-2 min-w-0">
                            <h1 className="text-sm font-bold transition-colors whitespace-nowrap" style={headerStyle}>
                                {pageTitles[currentView] || pageTitles.settings}
                            </h1>
                            <span className="text-gray-300 text-xs">·</span>
                            <p className="text-xs truncate" style={{ ...headerStyle, opacity: 0.6 }}>
                                {pageDescs[currentView] || pageDescs.settings}
                            </p>
                        </div>
                        <div className="flex-1 max-w-2xl"> <GlobalSearch onSearch={handleSearch} isLoading={isSearchLoading} platforms={Object.keys(pricingRules)} products={products} /> </div>
                        <div className="flex items-center gap-3">
                                {userProfile.name && <span className="text-xs font-semibold" style={headerStyle}>{t('hello')}, {userProfile.name}!</span>}
                                {hasInventory && <QuickUploadMenu themeColor={userProfile.themeColor} actions={quickUploadActions} />}
                                <button className="relative p-1.5 hover:opacity-70 transition-opacity" style={headerStyle}><Bell className="w-4 h-4" /></button>
                                <div className="h-4 w-px" style={{ backgroundColor: `${headerTextColor}40` }}></div>

                                {/* Admin Mode Controls */}
                                {isAdminMode ? (
                                    <div className="flex items-center gap-2">
                                        {/* Push to Database Button */}
                                        <button
                                            onClick={handleAdminPush}
                                            disabled={(!isDirty && syncStatus === 'idle') || syncStatus === 'pushing'}
                                            className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold transition-all border shadow-sm ${syncStatus === 'pushing'
                                                ? 'bg-theme-10 text-theme border-theme-20 cursor-wait'
                                                : syncStatus === 'error'
                                                    ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100 cursor-pointer'
                                                    : !isDirty
                                                        ? 'bg-gray-50 text-gray-400 border-gray-200 cursor-not-allowed'
                                                        : 'bg-theme text-white border-theme hover:opacity-90 cursor-pointer'
                                                }`}
                                        >
                                            {syncStatus === 'pushing' ? (
                                                <div className="flex flex-col items-center gap-1 w-full min-w-[120px]">
                                                    <div className="flex items-center gap-1.5 text-xs font-bold">
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                        {pushTotal > 0
                                                            ? `Pushing... ${Math.round((pushProgress / pushTotal) * 100)}%`
                                                            : 'Pushing...'}
                                                    </div>
                                                    {pushTotal > 0 && (
                                                        <div className="w-full bg-white/30 rounded-full h-1">
                                                            <div
                                                                className="bg-white rounded-full h-1 transition-all duration-300"
                                                                style={{ width: `${Math.round((pushProgress / pushTotal) * 100)}%` }}
                                                            />
                                                        </div>
                                                    )}
                                                </div>
                                            ) : syncStatus === 'error' ? (
                                                <><RefreshCw className="w-3.5 h-3.5" /> Push Failed — Retry</>
                                            ) : (
                                                <><UploadCloud className="w-3.5 h-3.5" /> Push to Database</>
                                            )}
                                        </button>
                                        {/* Admin Mode Pill */}
                                        <button
                                            onClick={() => {
                                                const result = handleAdminExit();
                                                if (result.needsConfirmation) setShowExitConfirm(true);
                                            }}
                                            className="flex items-center gap-1.5 px-3 py-1 bg-green-50 text-green-700 border border-green-200 rounded-lg text-xs font-bold hover:bg-green-100 transition-all shadow-sm"
                                        >
                                            <Lock className="w-3 h-3" />
                                            ADMIN MODE
                                            <LogOut className="w-3 h-3 opacity-60" />
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={() => setShowAdminModal(true)}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-gray-100/60 text-gray-500 border border-gray-200 rounded-lg text-[10px] font-bold hover:bg-gray-200/60 transition-all"
                                    >
                                        <Lock className="w-3 h-3" />
                                        USER MODE
                                    </button>
                                )}

                                <UserProfile profile={userProfile} onUpdate={setUserProfile} />
                        </div>
                    </header>
                    <div className="h-[60px] shrink-0" />
                    <div ref={mainContentRef} className="flex-1 overflow-y-auto relative p-4 md:p-8">
                        {/* Spinner shown when user navigates to a page before it has mounted */}
                        {!mountedPages.has(currentView) && currentView !== 'overview' && currentView !== 'custom-report' && (
                            <PageSpinner />
                        )}
                        {mountedPages.has('search') && (
                        <div style={{ display: currentView === 'search' ? 'block' : 'none' }}>
                            <>
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
                                    optimalPriceResults={optimalPriceResults}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center h-full text-gray-400">
                                    <Search className="w-12 h-12 mb-4 opacity-50" />
                                    <p className="text-lg font-medium">{t('search_empty_state')}</p>
                                </div>
                            )}
                            </>
                        </div>)}
                        <div style={{ display: currentView === 'overview' ? 'block' : 'none' }}>
                            {products.length === 0 ? (
                                syncStatus === 'syncing' ? (
                                    <div className="flex flex-col items-center justify-center min-h-[500px]">
                                        <div className="w-16 h-16 rounded-full flex items-center justify-center mb-6"
                                            style={{ backgroundColor: `${userProfile.themeColor}15` }}>
                                            <Loader2 className="w-8 h-8 animate-spin"
                                                style={{ color: userProfile.themeColor }} />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900">
                                            Loading your data...
                                        </h3>
                                        <p className="text-gray-500 mt-2">
                                            Syncing from database, please wait.
                                        </p>
                                        {syncTotal > 0 && (
                                            <div className="w-64 mt-6">
                                                <div className="flex justify-between text-xs text-gray-400 mb-1">
                                                    <span>{syncStep}</span>
                                                    <span>{Math.round((syncProgress / syncTotal) * 100)}%</span>
                                                </div>
                                                <div className="w-full bg-gray-200 rounded-full h-2">
                                                    <div
                                                        className="rounded-full h-2 transition-all duration-300"
                                                        style={{
                                                            width: `${Math.round((syncProgress / syncTotal) * 100)}%`,
                                                            backgroundColor: userProfile.themeColor
                                                        }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ) : syncStatus === 'error' ? (
                                    <div className="flex flex-col items-center justify-center min-h-[500px]">
                                        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mb-6">
                                            <Database className="w-8 h-8 text-red-400" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900">Could not load data</h3>
                                        <p className="text-gray-500 mt-2 mb-6">Failed to sync from database.</p>
                                        <button
                                            onClick={handleSync}
                                            className="px-6 py-2 rounded-lg text-white font-medium"
                                            style={{ backgroundColor: userProfile.themeColor }}
                                        >
                                            Try Again
                                        </button>
                                    </div>
                                ) : isAdminMode ? (
                                    <div className="flex flex-col items-center justify-center min-h-[500px] bg-custom-glass rounded-2xl border-2 border-dashed border-custom-glass text-center p-12 h-full">
                                        <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm"
                                            style={{ backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor }}>
                                            <Database className="w-10 h-10" />
                                        </div>
                                        <h3 className="text-2xl font-bold text-gray-900">{t('welcome_title')}</h3>
                                        <p className="text-gray-500 max-w-lg mt-3 mb-10 text-lg">{t('welcome_desc')}</p>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl relative">
                                            <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative group ${hasInventory ? 'bg-green-50/50 border-green-200' : 'bg-gray-50/50 border-gray-200 hover:border-indigo-300'}`}>
                                                <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${hasInventory ? 'bg-green-600 text-white' : 'text-white'}`}
                                                    style={!hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>
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
                                            <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative ${!hasInventory ? 'bg-gray-50/50 border-gray-200 opacity-60' : 'bg-custom-glass border-theme-20 shadow-lg scale-105 z-10'}`}>
                                                <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${!hasInventory ? 'bg-gray-400 text-white' : 'text-white'}`}
                                                    style={hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>
                                                    {t('step_2')}
                                                </div>
                                                <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                                                    <FileBarChart className={`w-8 h-8 ${!hasInventory ? 'text-gray-400' : ''}`}
                                                        style={hasInventory ? { color: userProfile.themeColor } : {}} />
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
                                    <div className="flex flex-col items-center justify-center min-h-[500px]">
                                        <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-6">
                                            <Database className="w-8 h-8 text-gray-400" />
                                        </div>
                                        <h3 className="text-xl font-bold text-gray-900">No data available</h3>
                                        <p className="text-gray-500 mt-2 mb-6 text-center max-w-sm">
                                            Waiting for admin to upload data. Try syncing again later.
                                        </p>
                                        <button
                                            onClick={handleSync}
                                            className="px-6 py-2 rounded-lg border border-gray-300 text-gray-600 font-medium hover:bg-gray-50"
                                        >
                                            Sync Again
                                        </button>
                                    </div>
                                )
                            ) : (
                                <OverviewPageContainer
                                    products={products}
                                    priceHistoryMap={priceHistoryMap}
                                    refundHistory={refundHistory}
                                    pricingRules={pricingRules}
                                    priceChangeHistory={priceChangeHistory}
                                    promotions={frozenPromoOverviewRef.current}
                                    themeColor={userProfile.themeColor}
                                    onAnalyze={handleAnalyze}
                                    onDeepDive={handleDeepDiveRequest}
                                    onSearch={handleSearch}
                                    thresholds={thresholds}
                                    mapJumpState={mapJumpState}
                                />
                            )}
                        </div>
                        {mountedPages.has('products') && (
                        <div style={{ display: currentView === 'products' ? 'block' : 'none' }}>
                            <ProductManagementPage
                                products={products}
                                pricingRules={pricingRules}
                                promotions={frozenPromoProductsRef.current}
                                priceHistoryMap={priceHistoryMap}
                                refundHistory={refundHistory || []}
                                priceChangeHistory={priceChangeHistory || []}
                                onOpenMappingModal={() => setIsMappingModalOpen(true)}
                                dateLabels={dynamicDateLabels}
                                onUpdateProduct={(p) => setProducts(prev => (prev || []).map(old => old.id === p.id ? p : old))}
                                onViewElasticity={handleViewElasticityWithResult}
                                themeColor={userProfile.themeColor}
                                onAnalyze={handleAnalyze}
                                onDeepDive={handleDeepDiveRequest}
                                onSearch={handleSearch}
                                thresholds={thresholds}
                                onAnalyzeCarrier={handleAnalyzeCarrier}
                                skuFamilies={skuFamilies}
                                setSkuFamilies={setSkuFamilies}
                                pendingFamilySuggestions={pendingFamilySuggestions}
                                setPendingFamilySuggestions={setPendingFamilySuggestions}
                                headerStyle={headerStyle}
                                cohortSnapshot={cohortSnapshot}
                                optimalPriceResults={optimalPriceResults}
                                benchmarkUpdateNotices={benchmarkUpdateNotices}
                                onRecalculateBenchmarks={handleRecalculateBenchmarks}
                                onStampLandedAt={handleStampLandedAt}
                            />
                        </div>)}
                        {mountedPages.has('platforms') && (
                        <div style={{ display: currentView === 'platforms' ? 'block' : 'none' }}>
                            <PlatformManagementPage
                                products={products}
                                priceHistoryMap={priceHistoryMap}
                                refundHistory={refundHistory}
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
                        </div>)}
                        {mountedPages.has('strategy') && (
                        <div style={{ display: currentView === 'strategy' ? 'block' : 'none' }}>
                            <StrategyPage
                                products={products}
                                pricingRules={pricingRules}
                                currentConfig={strategyRules}
                                onSaveConfig={(newConfig: StrategyConfig) => { setStrategyRules(newConfig); }}
                                themeColor={userProfile.themeColor}
                                priceHistoryMap={priceHistoryMap}
                                refundHistory={refundHistory}
                                promotions={strategyPromotions}
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
                                optimalPriceResults={optimalPriceResults}
                            />
                        </div>)}
                        {mountedPages.has('costs') && (
                        <div style={{ display: currentView === 'costs' ? 'block' : 'none' }}>
                            <CostManagementPage products={products} themeColor={userProfile.themeColor} headerStyle={headerStyle} />
                        </div>)}
                        {mountedPages.has('promotions') && (
                        <div style={{ display: currentView === 'promotions' ? 'block' : 'none' }}>
                            <PromotionPage
                                products={products}
                                pricingRules={pricingRules}
                                logisticsRules={logisticsRules || []}
                                promotions={promotions || []}
                                priceHistoryMap={priceHistoryMap}
                                onAddPromotion={(p) => startTransition(() => setPromotions(prev => [...(prev || []), p]))}
                                onUpdatePromotion={(p) => startTransition(() => setPromotions(prev => (prev || []).map(o => o.id === p.id ? p : o)))}
                                onDeletePromotion={(id) => startTransition(() => setPromotions(prev => (prev || []).filter(p => p.id !== id)))}
                                themeColor={userProfile.themeColor}
                                headerStyle={headerStyle}
                            />
                        </div>)}
                        {mountedPages.has('ad-campaigns') && (
                        <div style={{ display: currentView === 'ad-campaigns' ? 'block' : 'none' }}>
                            <AdCampaignPageContainer
                                products={products || []}
                                salesHistory={salesHistory || []}
                                learnedAliases={learnedAliases || {}}
                                adSnapshots={adSnapshots || []}
                                adRosterChanges={adRosterChanges || []}
                                adBudgets={adBudgets || {}}
                                onImport={handleAdCampaignImport}
                                onRosterChange={handleAdRosterChange}
                            />
                        </div>)}
                        {mountedPages.has('tools') && (
                        <div style={{ display: currentView === 'tools' ? 'block' : 'none' }}>
                            <ToolboxPage
                                promotions={frozenPromoToolboxRef.current}
                                pricingRules={pricingRules}
                                inventoryTemplates={inventoryTemplates || []}
                                onSaveTemplates={setInventoryTemplates}
                                learnedAliases={learnedAliases}
                                onSaveLearnedAliases={(aliases) => setLearnedAliases(prev => ({ ...prev, ...aliases }))}
                                products={products || []}
                                themeColor={userProfile.themeColor}
                                headerStyle={headerStyle}
                                salesHistory={salesHistory || []}
                                refundHistory={refundHistory || []}
                                priceCheckTemplates={priceCheckTemplates || []}
                                onSavePriceCheckTemplates={handleSavePriceCheckTemplates}
                                onDescriptionImport={handleDescriptionImport}
                            />
                        </div>)}
                        {mountedPages.has('definitions') && (
                        <div style={{ display: currentView === 'definitions' ? 'block' : 'none' }}>
                            <DefinitionsPage />
                        </div>)}
                        {mountedPages.has('custom-report') && (
                        <div style={{ display: currentView === 'custom-report' ? 'block' : 'none' }}>
                            <CustomReportPage
                                products={products}
                                priceHistory={salesHistory}
                                refundHistory={refundHistory}
                                pricingRules={pricingRules}
                            />
                        </div>)}
                        {mountedPages.has('settings') && (
                        <div style={{ display: currentView === 'settings' ? 'block' : 'none' }}>
                            <SettingsPage
                                currentRules={pricingRules}
                                onSave={(newRules, newVelocity, newSearchConfig) => {
                                    setPricingRules(newRules);
                                    setVelocityLookback(newVelocity);
                                    if (newSearchConfig) setSearchConfig(newSearchConfig);
                                    localStorage.setItem('sello_velocity_setting', newVelocity);
                                    handleRecalculateVelocity(newVelocity, salesHistory);
                                }}
                                logisticsRules={logisticsRules || []}
                                onSaveLogistics={(newLogistics) => { setLogisticsRules(newLogistics); }}
                                products={products}
                                freightRates={freightRates || []}
                                onFreightRatesUpload={handleFreightRatesUpload}
                                themeColor={userProfile.themeColor}
                                searchConfig={searchConfig}
                                velocityLookback={velocityLookback}
                                extraData={{ priceHistory: salesHistory, promotions: promotions || [] }}
                                onRefreshThresholds={handleRefreshThresholds}
                                brandMap={brandMap}
                                categoryMap={categoryMap}
                                onSaveBrandMap={handleSaveBrandMap}
                                onSaveCategoryMap={handleSaveCategoryMap}
                                headerStyle={headerStyle}
                            />
                        </div>)}
                    </div>
                </main>
                {isUploadModalOpen && (
                    <BatchUploadModal
                        products={products}
                        onClose={() => setIsUploadModalOpen(false)}
                        onConfirm={handleInventoryImport}
                    />
                )
                }
                {
                    isSalesImportModalOpen && (
                        <SalesImportModal
                            products={products}
                            pricingRules={pricingRules}
                            learnedAliases={learnedAliases}
                            onClose={() => setIsSalesImportModalOpen(false)}
                            onResetData={handleResetSalesData}
                            onConfirm={handleSalesImportConfirm}
                        />
                    )
                }
                {
                    isSkuDetailModalOpen && (
                        <SkuDetailUploadModal
                            products={products}
                            onClose={() => setIsSkuDetailModalOpen(false)}
                            onConfirm={handleSkuDetailImport}
                        />
                    )
                }
                {
                    isMappingModalOpen && (
                        <MappingUploadModal
                            products={products}
                            platforms={Object.keys(pricingRules)}
                            learnedAliases={learnedAliases}
                            onClose={() => setIsMappingModalOpen(false)}
                            onConfirm={handleMappingImport}
                        />
                    )
                }
                {
                    isReturnsModalOpen && (
                        <ReturnsUploadModal
                            onClose={() => setIsReturnsModalOpen(false)}
                            onConfirm={handleReturnsImport}
                            onReset={handleResetRefunds}
                            existingOrders={existingOrders}
                        />
                    )
                }
                {
                    isCAUploadModalOpen && (
                        <CAUploadModal
                            products={products}
                            onClose={() => setIsCAUploadModalOpen(false)}
                            onConfirm={handleCAImport}
                        />
                    )
                }
                {
                    isShipmentModalOpen && (
                        <ShipmentUploadModal
                            products={products}
                            onClose={() => setIsShipmentModalOpen(false)}
                            onConfirm={handleShipmentImport}
                        />
                    )
                }
                {
                    selectedElasticityProduct && (
                        <PriceElasticityModal
                            product={selectedElasticityProduct}
                            result={elasticityResult ?? undefined}
                            onClose={() => {
                                setSelectedElasticityProduct(null);
                                setElasticityResult(null);
                            }}
                        />
                    )
                }
                {
                    selectedAnalysisProduct && (
                        <AnalysisModal
                            product={selectedAnalysisProduct}
                            analysis={analysisResult}
                            isLoading={isAnalysisLoading}
                            onClose={() => { setSelectedAnalysisProduct(null); setAnalysisResult(null); }}
                            onApplyPrice={handleApplyPrice}
                            themeColor={userProfile.themeColor}
                        />
                    )
                }

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
            </div>

            {/* Admin Password Modal */}
            {
                showAdminModal && (
                    <AdminModal
                        onClose={() => setShowAdminModal(false)}
                        onSuccess={() => setShowAdminModal(false)}
                        handleAdminToggle={handleAdminToggle}
                    />
                )
            }

            {/* Exit Confirmation Dialog */}
            {
                showExitConfirm && (
                    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200">
                            <div className="p-6">
                                <h3 className="text-base font-bold text-gray-900 mb-2">Unsaved Changes</h3>
                                <p className="text-sm text-gray-600">You have changes that haven't been pushed to the database. What would you like to do?</p>
                            </div>
                            <div className="px-6 pb-6 flex flex-col gap-2">
                                <button
                                    onClick={async () => { setShowExitConfirm(false); await handleAdminPush(); handleAdminExit(true); }}
                                    className="w-full px-4 py-2.5 bg-theme text-white rounded-xl text-sm font-bold hover:opacity-90 transition-all"
                                >
                                    Push Now
                                </button>
                                <button
                                    onClick={() => { setShowExitConfirm(false); handleAdminExit(true); }}
                                    className="w-full px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-200 transition-all"
                                >
                                    Exit Anyway
                                </button>
                                <button
                                    onClick={() => setShowExitConfirm(false)}
                                    className="w-full px-4 py-2 text-gray-400 text-sm font-medium hover:text-gray-600 transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }

            {/* Save Toast */}
            {
                showSaveToast && (
                    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-bottom-4 duration-300">
                        <div className="flex items-center gap-2.5 px-5 py-3 bg-green-600 text-white rounded-xl shadow-xl font-bold text-sm">
                            <CheckCircle className="w-4 h-4" />
                            Pushed to database
                        </div>
                    </div>
                )
            }
        </>
    );
};

export default App;
