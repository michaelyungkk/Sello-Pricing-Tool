

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { INITIAL_PRODUCTS, MOCK_PRICE_HISTORY, MOCK_PROMOTIONS, DEFAULT_PRICING_RULES, DEFAULT_LOGISTICS_RULES, DEFAULT_STRATEGY_RULES, DEFAULT_SEARCH_CONFIG, VAT_MULTIPLIER } from './constants';
import { Product, PricingRules, PriceLog, PromotionEvent, UserProfile as UserProfileType, ChannelData, LogisticsRule, ShipmentLog, StrategyConfig, VelocityLookback, RefundLog, ShipmentDetail, HistoryPayload, PriceChangeRecord, AnalysisResult, SearchChip, SearchConfig, SkuCostDetail, InventoryTemplate, SearchSession, CostChangeRecord, InventoryChangeRecord } from './types';

// Components
import ProductList from './components/ProductList';
import ProductManagementPage from './components/ProductManagementPage';
import StrategyPage from './components/StrategyPage';
import PlatformManagementPage from './components/PlatformManagementPage';

import { 
  LayoutDashboard, Calculator, DollarSign, Tag, Wrench, Settings, BookOpen, Search, X, 
  Download, Upload, WifiOff, Database, CheckCircle, FileBarChart, Bell, History, 
  UploadCloud, ChevronDown, RotateCcw, FileText, Link as LinkIcon, Ship, Globe,
  ArrowUp
} from 'lucide-react';

import GlobalSearch from './components/GlobalSearch';
import UserProfile from './components/UserProfile';
import SearchResultsPage from './components/SearchResultsPage';
import CostManagementPage from './components/CostManagementPage';
import PromotionPage from './components/PromotionPage';
import ToolboxPage from './components/ToolboxPage';
import DefinitionsPage from './components/DefinitionsPage';
import SettingsPage from './components/SettingsPage';
import BatchUploadModal from './components/BatchUploadModal';
import SalesImportModal from './components/SalesImportModal';
import SkuDetailUploadModal from './components/SkuDetailUploadModal';
import CostUploadModal from './components/CostUploadModal';
import MappingUploadModal from './components/MappingUploadModal';
import ReturnsUploadModal from './components/ReturnsUploadModal';
import CAUploadModal from './components/CAUploadModal';
import ShipmentUploadModal from './components/ShipmentUploadModal';
import PriceElasticityModal from './components/PriceElasticityModal';
import AnalysisModal from './components/AnalysisModal';

import { analyzePriceAdjustment, parseSearchQuery, SearchIntent } from './services/geminiService';
import { processDataForSearch } from './services/searchExecution';
import { getThresholdConfig, ThresholdConfig, saveThresholdConfig } from './services/thresholdsConfig';
import { useTranslation } from 'react-i18next';
import { TAX_NOTE_SHORT } from './services/taxPolicy';
import { migrateRestoredDatabase, auditRestoredDatabase } from './services/migrationService';
import { normalizeRestoredState } from './services/restoreSanitizer';
import { hexToRgb, extractFirstHex } from './utils/color';

// Helper functions
const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const getFridayThursdayRanges = () => {
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0 (Sun) - 6 (Sat)
    // Friday is 5
    const daysSinceFriday = (dayOfWeek + 7 - 5) % 7;
    
    const currentStart = new Date(today);
    currentStart.setDate(today.getDate() - daysSinceFriday);
    
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentStart.getDate() + 6);
    
    const lastStart = new Date(currentStart);
    lastStart.setDate(currentStart.getDate() - 7);
    
    const lastEnd = new Date(lastStart);
    lastEnd.setDate(lastStart.getDate() + 6);
    
    return {
        current: { start: currentStart, end: currentEnd },
        last: { start: lastStart, end: lastEnd }
    };
};

const QuickUploadMenu = ({ themeColor, actions }: any) => { 
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false); 
    const menuRef = useRef<HTMLDivElement>(null); 
    useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) { setIsOpen(false); } }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []); 
    
    return ( <div className="relative z-50" ref={menuRef}> <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-all font-medium" style={{ backgroundColor: themeColor }}> <UploadCloud className="w-4 h-4" /> <span className="hidden md:inline">{t('upload_data')}</span> <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} /> </button> {isOpen && ( <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right"> <div className="p-2 grid gap-1"> {actions.map((item: any) => ( <button key={item.label} onClick={() => { item.action(); setIsOpen(false); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors text-left w-full group" > <div className={`p-1.5 rounded-md bg-gray-50 group-hover:bg-white border border-gray-100 group-hover:shadow-sm transition-all ${item.color}`}> <item.icon className="w-4 h-4" /> </div> <span className="font-medium">{item.label}</span> </button> ))} </div> </div> )} </div> ); 
};

// --- CENTRAL RECALCULATION LOGIC ---
const recalculateProductMetrics = (
    products: Product[],
    history: PriceLog[],
    lookback: VelocityLookback,
    thresholds: ThresholdConfig
): Product[] => {
    // 1. Build History Map
    const historyMap = new Map<string, PriceLog[]>();
    (history || []).forEach(h => {
        if (!h || !h.sku) return;
        if (!historyMap.has(h.sku)) historyMap.set(h.sku, []);
        historyMap.get(h.sku)!.push(h);
    });

    // 2. Determine Time Window
    let days = 30;
    if (lookback === 'ALL') {
        if (history && history.length > 0) {
            const dates = history.map(l => new Date(l.date).getTime()).filter(t => !isNaN(t));
            if (dates.length > 0) {
                const minDate = Math.min(...dates);
                const diff = Date.now() - minDate;
                days = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
            }
        }
    } else {
        days = parseInt(lookback) || 30;
    }

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    cutoffDate.setHours(0, 0, 0, 0);

    const prevCutoffDate = new Date(cutoffDate);
    prevCutoffDate.setDate(prevCutoffDate.getDate() - days);

    // 3. Process Products
    return (products || []).map(p => {
        if (!p) return p;
        const logs = historyMap.get(p.sku) || [];
        
        let currentQty = 0;
        let prevQty = 0;

        logs.forEach(l => {
            const d = new Date(l.date);
            if (isNaN(d.getTime())) return;
            if (d >= cutoffDate) {
                currentQty += (l.velocity || 0);
            } else if (d >= prevCutoffDate) {
                prevQty += (l.velocity || 0);
            }
        });

        // Calculated actuals from history
        const calculatedDailySales = currentQty / days;
        const calculatedPrevDailySales = prevQty / days;
        
        // PRIORITIZE ERP VELOCITY for Inventory Logic
        const effectiveDailySales = (p.dailyAverageSales && p.dailyAverageSales > 0) 
            ? p.dailyAverageSales 
            : calculatedDailySales;

        const daysRemaining = effectiveDailySales > 0 ? (p.stockLevel || 0) / effectiveDailySales : 999;
        
        let status: 'Critical' | 'Warning' | 'Healthy' | 'Overstock' = 'Healthy';
        if ((p.stockLevel || 0) <= 0) status = 'Critical';
        else if (daysRemaining < (p.leadTimeDays || 30) * (thresholds.stockoutRunwayMultiplier || 1)) status = 'Critical';
        else if (daysRemaining > (thresholds.overstockDays || 120)) status = 'Overstock';
        else if (daysRemaining < (p.leadTimeDays || 30) * ((thresholds.stockoutRunwayMultiplier || 1) + 0.5)) status = 'Warning';

        const velocityChange = calculatedPrevDailySales > 0 
            ? ((calculatedDailySales - calculatedPrevDailySales) / calculatedPrevDailySales) * 100 
            : 0;

        return {
            ...p,
            averageDailySales: effectiveDailySales,
            previousDailySales: calculatedPrevDailySales,
            daysRemaining,
            status,
            _trendData: { velocityChange }
        };
    }).filter(Boolean);
};

const App: React.FC = () => {
    const { t } = useTranslation();
    
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [priceHistory, setPriceHistory] = useState<PriceLog[]>([]);
    const [refundHistory, setRefundHistory] = useState<RefundLog[]>([]);
    const [shipmentHistory, setShipmentHistory] = useState<ShipmentLog[]>([]);
    const [priceChangeHistory, setPriceChangeHistory] = useState<PriceChangeRecord[]>([]);
    const [costChangeHistory, setCostChangeHistory] = useState<CostChangeRecord[]>([]);
    const [inventoryChangeHistory, setInventoryChangeHistory] = useState<InventoryChangeRecord[]>([]);
    const [promotions, setPromotions] = useState<PromotionEvent[]>([]);
    const [learnedAliases, setLearnedAliases] = useState<Record<string, string>>({});
    const [inventoryTemplates, setInventoryTemplates] = useState<InventoryTemplate[]>([]); 
    const [pricingRules, setPricingRules] = useState<PricingRules>(DEFAULT_PRICING_RULES);
    const [logisticsRules, setLogisticsRules] = useState<LogisticsRule[]>(DEFAULT_LOGISTICS_RULES);
    const [strategyRules, setStrategyRules] = useState<StrategyConfig>(DEFAULT_STRATEGY_RULES);
    const [searchConfig, setSearchConfig] = useState<SearchConfig>(DEFAULT_SEARCH_CONFIG);
    
    const [uploadTimestamps, setUploadTimestamps] = useState<Record<string, string>>(() => {
        try {
            return JSON.parse(localStorage.getItem('sello_upload_timestamps') || '{}') || {};
        } catch { return {}; }
    });

    const updateTimestamp = (key: string) => {
        const now = new Date().toISOString();
        setUploadTimestamps(prev => {
            const next = { ...(prev || {}), [key]: now };
            localStorage.setItem('sello_upload_timestamps', JSON.stringify(next));
            return next;
        });
    };
    
    const [thresholds, setThresholds] = useState<ThresholdConfig>(getThresholdConfig());

    const [velocityLookback, setVelocityLookback] = useState<VelocityLookback>(() => {
        return (localStorage.getItem('sello_velocity_setting') as VelocityLookback) || '30';
    });

    const [userProfile, setUserProfile] = useState<UserProfileType>({
        name: '', themeColor: '#4f46e5', backgroundImage: '', backgroundColor: '#f3f4f6', glassMode: 'light', glassOpacity: 90, glassBlur: 10, ambientGlass: true, ambientGlassOpacity: 15
    });

    const [showBackToTop, setShowBackToTop] = useState(false);

    useEffect(() => {
        const loadDatabase = async () => {
            setIsDataLoaded(true);
        };
        loadDatabase();

        const handleScroll = () => {
            setShowBackToTop(window.scrollY > 400);
        };
        window.addEventListener('scroll', handleScroll);
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    const [selectedElasticityProduct, setSelectedElasticityProduct] = useState<Product | null>(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isSalesImportModalOpen, setIsSalesImportModalOpen] = useState(false);
    const [isCostUploadModalOpen, setIsCostUploadModalOpen] = useState(false);
    const [isSkuDetailModalOpen, setIsSkuDetailModalOpen] = useState(false);
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);
    const [isCAUploadModalOpen, setIsCAUploadModalOpen] = useState(false);
    const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);
    const [selectedAnalysisProduct, setSelectedAnalysisProduct] = useState<Product | null>(null);
    const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
    const [isAnalysisLoading, setIsAnalysisLoading] = useState(false);
    const [isSearchLoading, setIsSearchLoading] = useState(false);
    const [searchSessions, setSearchSessions] = useState<SearchSession[]>([]);
    const [activeSearchId, setActiveSearchId] = useState<string | null>(null);
    const [currentView, setCurrentView] = useState<'dashboard' | 'strategy' | 'products' | 'platforms' | 'settings' | 'costs' | 'definitions' | 'promotions' | 'tools' | 'search'>('products');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isFreshnessExpanded, setIsFreshnessExpanded] = useState(false);
    const fileRestoreRef = useRef<HTMLInputElement>(null);

    const priceHistoryMap = useMemo(() => {
        const map = new Map<string, PriceLog[]>();
        (priceHistory || []).forEach(h => {
            if (!h || !h.sku) return;
            if (!map.has(h.sku)) map.set(h.sku, []);
            map.get(h.sku)!.push(h);
        });
        return map;
    }, [priceHistory]);

    const existingOrders = useMemo(() => {
        const map = new Map<string, string>();
        (priceHistory || []).forEach(p => {
            if (p && p.orderId) map.set(p.orderId, p.platform || 'Unknown');
        });
        return map;
    }, [priceHistory]);

    const dynamicDateLabels = useMemo(() => {
        const ranges = getFridayThursdayRanges();
        return {
            current: `${formatDate(ranges.current.start)} - ${formatDate(ranges.current.end)}`,
            last: `${formatDate(ranges.last.start)} - ${formatDate(ranges.last.end)}`
        };
    }, []);

    const ambientRgb = useMemo(() => {
        let hex = userProfile.themeColor; // Ultimate fallback

        const bgImageHex = (userProfile.backgroundImage && userProfile.backgroundImage !== 'none') 
            ? extractFirstHex(userProfile.backgroundImage) 
            : null;

        if (bgImageHex) {
            hex = bgImageHex;
        } else if (userProfile.backgroundColor && userProfile.backgroundColor !== 'none') {
            hex = userProfile.backgroundColor;
        }

        const rgb = hexToRgb(hex);
        return rgb || (userProfile.glassMode === 'dark' ? {r:0, g:0, b:0} : {r:255, g:255, b:255});
    }, [userProfile.backgroundImage, userProfile.backgroundColor, userProfile.themeColor, userProfile.glassMode]);

    const handleRefreshProductStatuses = (config: ThresholdConfig) => {
        const recalculated = recalculateProductMetrics(products, priceHistory, velocityLookback, config);
        setProducts(recalculated);
    };

    const handleRefreshThresholds = () => {
        const newConfig = getThresholdConfig();
        setThresholds(newConfig);
        handleRefreshProductStatuses(newConfig);
    };

    const handleRecalculateVelocity = (newLookback: VelocityLookback, currentPriceHistory: PriceLog[]) => {
        const currentThresholds = getThresholdConfig();
        const recalculated = recalculateProductMetrics(products, currentPriceHistory, newLookback, currentThresholds);
        setProducts(recalculated);
    };

    const handleSearch = async (queryOrChips: string | SearchChip[]) => {
       let rawText = "";
       if (typeof queryOrChips === 'string') { rawText = queryOrChips; } 
       else { const chips = queryOrChips; const metrics = chips.filter(c => c.type === 'METRIC').map(c => c.label).join(' '); const conditions = chips.filter(c => c.type === 'CONDITION').map(c => c.label).join(' '); const platforms = chips.filter(c => c.type === 'PLATFORM').map(c => `on ${c.label}`).join(' '); const text = chips.filter(c => c.type === 'TEXT').map(c => c.value).join(' '); const time = chips.filter(c => c.type === 'TIME').map(c => c.label).join(' '); rawText = `${time} ${conditions} ${metrics} ${platforms} ${text}`.trim(); }
       
       const cleanQuery = rawText.replace(/^SKU:\s*/i, '').trim(); 
       const normalizedQuery = cleanQuery.toLowerCase();

       const directMatch = products.find(p => {
           if (!p) return false;
           if (p.sku.toLowerCase() === normalizedQuery) return true;
           return (p.channels || []).some(c => c.skuAlias && c.skuAlias.split(',').some(a => a.trim().toLowerCase() === normalizedQuery));
       });

       if (directMatch) {
           setIsSearchLoading(true);
           setTimeout(() => {
               const deepDiveIntent: SearchIntent = {
                   targetData: 'inventory',
                   filters: [{ field: 'sku', operator: '=', value: directMatch.sku }],
                   primaryMetric: 'DEEP_DIVE',
                   limit: 1,
                   explanation: `Deep Dive: ${directMatch.sku}`
               };
               const { results, timeLabel } = processDataForSearch(deepDiveIntent, products, priceHistory, pricingRules, refundHistory);
               const newSession: SearchSession = { id: `search-${Date.now()}`, query: `SKU: ${directMatch.sku}`, results: results || [], params: deepDiveIntent, explanation: deepDiveIntent.explanation, timeLabel: timeLabel, timestamp: Date.now() };
               setSearchSessions(prev => [newSession, ...(prev || [])]); setActiveSearchId(newSession.id); setCurrentView('search'); setIsSearchLoading(false);
           }, 150);
           return;
       }

       setIsSearchLoading(true);
       try {
         const intent = await parseSearchQuery(rawText);
         const { results, timeLabel } = processDataForSearch(intent, products, priceHistory, pricingRules, refundHistory);
         const newSession: SearchSession = { id: `search-${Date.now()}`, query: rawText, results: results || [], params: intent, explanation: intent.explanation, timeLabel: timeLabel, timestamp: Date.now() };
         setSearchSessions(prev => [newSession, ...(prev || [])]); setActiveSearchId(newSession.id); setCurrentView('search');
       } catch(e) { console.error("Search failed", e); } finally { setIsSearchLoading(false); }
    };
    
    const handleDeepDiveRequest = (sku: string) => { handleSearch(`SKU: ${sku}`); };

    const handleManualPriceChange = (data: Omit<PriceChangeRecord, 'id' | 'changeType' | 'percentChange'>) => {
        const { sku, productName, date, oldPrice, newPrice } = data;
        const changeType = newPrice > oldPrice ? 'INCREASE' : 'DECREASE';
        const percentChange = oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : (newPrice > 0 ? 100 : 0);
        const newRecord: PriceChangeRecord = { id: `manual-${Date.now()}-${sku}`, sku, productName, date, oldPrice, newPrice, changeType, percentChange };
        setPriceChangeHistory(prev => [newRecord, ...(prev || [])]);
    };

    const handleManualCostChange = (data: Omit<CostChangeRecord, 'id' | 'changeType' | 'percentChange'>) => {
        const { sku, productName, date, oldCost, newCost } = data;
        const changeType = newCost > oldCost ? 'INCREASE' : 'DECREASE';
        const percentChange = oldCost > 0 ? ((newCost - oldCost) / oldCost) * 100 : (newCost > 0 ? 100 : 0);
        const newRecord: CostChangeRecord = { id: `manual-cost-${Date.now()}-${sku}`, sku, productName, date, oldCost, newCost, changeType, percentChange };
        setCostChangeHistory(prev => [...(prev || []), newRecord].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    };

    const handleRefineSearch = (sessionId: string, newIntent: SearchIntent) => { setIsSearchLoading(true); setTimeout(() => { const { results, timeLabel } = processDataForSearch(newIntent, products, priceHistory, pricingRules, refundHistory); setSearchSessions(prev => (prev || []).map(s => { if (s.id === sessionId) { return { ...s, results, params: newIntent, timeLabel }; } return s; })); setIsSearchLoading(false); }, 150); };
    const deleteSearchSession = (id: string, e: React.MouseEvent) => { e.stopPropagation(); setSearchSessions(prev => (prev || []).filter(s => s.id !== id)); if (activeSearchId === id) { setActiveSearchId(null); setCurrentView('products'); } };
    const handleViewElasticity = (product: Product) => { setSelectedElasticityProduct(product); };
    const handleAnalyze = async (product: Product, context?: string) => { const platformName = product.platform || (product.channels && product.channels.length > 0 ? product.channels[0].platform : 'General'); const platformRule = pricingRules[platformName] || { markup: 0, commission: 15, manager: 'General', isExcluded: false }; setSelectedAnalysisProduct(product); setAnalysisResult(null); setIsAnalysisLoading(true); try { const result = await analyzePriceAdjustment(product, platformRule, context, thresholds); setAnalysisResult(result); } catch (error) { console.error("Analysis failed in App:", error); } finally { setIsAnalysisLoading(false); } };
    const handleApplyPrice = (productId: string, newPrice: number) => { setProducts(prev => { const productToUpdate = (prev || []).find(p => p.id === productId); if (!productToUpdate) return prev; const oldPrice = productToUpdate.caPrice || (productToUpdate.currentPrice * VAT_MULTIPLIER); const change: PriceChangeRecord = { id: `chg-${Date.now()}-${productToUpdate.sku}`, sku: productToUpdate.sku, productName: productToUpdate.name, date: new Date().toISOString().split('T')[0], oldPrice: oldPrice, newPrice: newPrice, changeType: newPrice > oldPrice ? 'INCREASE' : 'DECREASE', percentChange: oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 100 }; setPriceChangeHistory(prevHistory => [...(prevHistory || []), change]); return prev.map(p => { if (p.id !== productId) return p; return { ...p, caPrice: newPrice, lastUpdated: new Date().toISOString().split('T')[0] }; }); }); setSelectedAnalysisProduct(null); setAnalysisResult(null); };
    
    const handleBackup = () => { 
        const data = { products, priceHistory, refundHistory, shipmentHistory, priceChangeHistory, costChangeHistory, inventoryChangeHistory, promotions, learnedAliases, pricingRules, logisticsRules, strategyRules, searchConfig, velocityLookback, userProfile, inventoryTemplates, thresholds, uploadTimestamps, exportDate: new Date().toISOString() }; 
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); 
        const url = URL.createObjectURL(blob); 
        const link = document.createElement('a'); 
        link.href = url; link.download = `sello_backup_${new Date().toISOString().slice(0, 10)}.json`; 
        document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); 
    };
    
    const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const rawJson = JSON.parse(event.target?.result as string);
                
                // --- RESTORE PIPELINE ---
                // 1. Initial normalization to fix structural gaps
                const safeJson = normalizeRestoredState(rawJson);
                // 2. Migration
                const migrated = migrateRestoredDatabase(safeJson);
                
                // --- AUDIT STEP ---
                const report = auditRestoredDatabase(migrated);
                if (report.hasFatal) {
                    console.error('[RESTORE AUDIT FAIL]', report);
                    alert("Restore file contains invalid structure. Check console for details.");
                    if (fileRestoreRef.current) fileRestoreRef.current.value = '';
                    return;
                }

                // 3. Construct deterministic restored object
                // Check rawJson for optional settings to preserve user preference if missing in backup
                const hasThresholds = rawJson && typeof rawJson === 'object' && 'thresholds' in rawJson;
                const hasVelocity = rawJson && typeof rawJson === 'object' && 'velocityLookback' in rawJson;

                const restored = {
                    products: Array.isArray(migrated.products) ? migrated.products : [],
                    priceHistory: Array.isArray(migrated.priceHistory) ? migrated.priceHistory : [],
                    refundHistory: Array.isArray(migrated.refundHistory) ? migrated.refundHistory : [],
                    shipmentHistory: Array.isArray(migrated.shipmentHistory) ? migrated.shipmentHistory : [],
                    priceChangeHistory: Array.isArray(migrated.priceChangeHistory) ? migrated.priceChangeHistory : [],
                    costChangeHistory: Array.isArray(migrated.costChangeHistory) ? migrated.costChangeHistory : [],
                    inventoryChangeHistory: Array.isArray(migrated.inventoryChangeHistory) ? migrated.inventoryChangeHistory : [],
                    promotions: Array.isArray(migrated.promotions) ? migrated.promotions : [],
                    learnedAliases: migrated.learnedAliases && typeof migrated.learnedAliases === 'object' ? migrated.learnedAliases : {},
                    pricingRules: migrated.pricingRules || DEFAULT_PRICING_RULES,
                    logisticsRules: Array.isArray(migrated.logisticsRules) ? migrated.logisticsRules : DEFAULT_LOGISTICS_RULES,
                    strategyRules: migrated.strategyRules || DEFAULT_STRATEGY_RULES,
                    searchConfig: migrated.searchConfig || DEFAULT_SEARCH_CONFIG,
                    userProfile: migrated.userProfile && typeof migrated.userProfile === 'object' ? migrated.userProfile : {},
                    inventoryTemplates: Array.isArray(migrated.inventoryTemplates) ? migrated.inventoryTemplates : [],
                    uploadTimestamps: migrated.uploadTimestamps && typeof migrated.uploadTimestamps === 'object' ? migrated.uploadTimestamps : {},
                    
                    // Conditionally loaded settings (use migrated value if present in raw, else null)
                    thresholds: hasThresholds ? migrated.thresholds : null,
                    velocityLookback: hasVelocity ? migrated.velocityLookback : null,
                };

                // 4. Batch update all states unconditionally
                setPriceHistory(restored.priceHistory);
                setRefundHistory(restored.refundHistory);
                setShipmentHistory(restored.shipmentHistory);
                setPriceChangeHistory(restored.priceChangeHistory);
                setCostChangeHistory(restored.costChangeHistory);
                setInventoryChangeHistory(restored.inventoryChangeHistory);
                setPromotions(restored.promotions);
                setLearnedAliases(restored.learnedAliases);
                setPricingRules(restored.pricingRules);
                setLogisticsRules(restored.logisticsRules);
                setStrategyRules(restored.strategyRules);
                setSearchConfig(restored.searchConfig);
                setInventoryTemplates(restored.inventoryTemplates);
                setUploadTimestamps(restored.uploadTimestamps);
                localStorage.setItem('sello_upload_timestamps', JSON.stringify(restored.uploadTimestamps));

                // Merge Profile (preserve local if missing in backup)
                setUserProfile(prev => ({ ...prev, ...restored.userProfile }));
                
                // Thresholds Logic
                let currentThresholds = thresholds;
                if (restored.thresholds) {
                    setThresholds(restored.thresholds);
                    saveThresholdConfig(restored.thresholds);
                    currentThresholds = restored.thresholds;
                }

                // Velocity Logic
                let currentVelocity = velocityLookback;
                if (restored.velocityLookback) {
                    setVelocityLookback(restored.velocityLookback);
                    localStorage.setItem('sello_velocity_setting', restored.velocityLookback);
                    currentVelocity = restored.velocityLookback;
                }

                // 5. Trigger derived calculations
                const recalculatedProducts = recalculateProductMetrics(
                    restored.products, 
                    restored.priceHistory, 
                    currentVelocity, 
                    currentThresholds
                );
                setProducts(recalculatedProducts);
                
                alert(t('alert_db_restore_success'));
            } catch (err) {
                console.error("Restore failed", err);
                alert(t('alert_db_restore_fail'));
            }
        };
        reader.readAsText(file);
        if (fileRestoreRef.current) fileRestoreRef.current.value = '';
    };
    
    const handleResetRefunds = () => { setRefundHistory([]); setProducts(prev => (prev || []).map(p => ({ ...p, returnRate: 0 }))); setIsReturnsModalOpen(false); };

    const handleUpdatePriceChangeRecord = (recordToUpdate: PriceChangeRecord) => { setPriceChangeHistory(prev => (prev || []).map(record => record.id === recordToUpdate.id ? { ...record, date: recordToUpdate.date } : record)); };
    const handleUpdateCostChangeRecord = (recordToUpdate: CostChangeRecord) => { setCostChangeHistory(prev => (prev || []).map(record => record.id === recordToUpdate.id ? { ...record, date: recordToUpdate.date } : record)); };
    const handleUpdateInventoryChangeRecord = (recordToUpdate: InventoryChangeRecord) => { setInventoryChangeHistory(prev => (prev || []).map(record => record.id === recordToUpdate.id ? { ...record, date: recordToUpdate.date } : record)); };

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

    const handleSalesImportConfirm = (updatedProductsFromImport: Product[], newDateLabels?: { current: string, last: string }, historyPayload?: HistoryPayload[], newShipmentLogs?: ShipmentLog[], discoveredPlatforms?: string[], newlyLearnedAliases?: Record<string, string>) => { 
        if (newlyLearnedAliases) setLearnedAliases(prev => ({ ...(prev || {}), ...newlyLearnedAliases }));
        let updatedPriceHistory = [...(priceHistory || [])];
        if (historyPayload && historyPayload.length > 0) { 
            const newLogs: PriceLog[] = historyPayload.map(h => ({ id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, sku: h.sku, date: h.date, price: h.price, velocity: h.velocity, margin: h.margin || 0, profit: h.profit, adsSpend: h.adsSpend, platform: h.platform, orderId: h.orderId, postcode: h.postcode })); 
            const transactionKeys = new Set<string>(); const dailyActivityKeys = new Set<string>(); newLogs.forEach(l => { const d = l.date.split('T')[0]; const p = l.platform || 'General'; if (l.orderId) { transactionKeys.add(`${l.sku}|${l.orderId}`); } dailyActivityKeys.add(`${l.sku}|${d}|${p}`); }); 
            const keptHistory = (priceHistory || []).filter(l => { const d = l.date.split('T')[0]; const p = l.platform || 'General'; if (l.orderId) { const txKey = `${l.sku}|${l.orderId}`; if (transactionKeys.has(txKey)) return false; return true; } const dailyKey = `${l.sku}|${d}|${p}`; if (dailyActivityKeys.has(dailyKey)) return false; return true; }); 
            updatedPriceHistory = [...newLogs, ...keptHistory]; setPriceHistory(updatedPriceHistory);
        }
        let mergedProducts = (products || []).map(p => { const update = (updatedProductsFromImport || []).find(u => u.id === p.id); return update ? update : p; });
        const finalProducts = recalculateProductMetrics(mergedProducts, updatedPriceHistory, velocityLookback, getThresholdConfig());
        setProducts(finalProducts);
        if (newShipmentLogs && newShipmentLogs.length > 0) setShipmentHistory(prev => [...newShipmentLogs, ...(prev || [])]); 
        if (discoveredPlatforms && discoveredPlatforms.length > 0) { setPricingRules(prev => { const newRules = { ...(prev || {}) }; let changed = false; discoveredPlatforms.forEach(p => { if (!newRules[p]) { newRules[p] = { markup: 0, commission: 15, manager: 'Unassigned', color: '#6b7280', pricingControl: 'MERCHANT', feeModel: 'COMMISSION_PCT', adsEnabled: false }; changed = true; } }); return changed ? newRules : prev; }); } 
        updateTimestamp('Sales'); setIsSalesImportModalOpen(false); 
    };

    const handleInventoryImport = (data: any[]) => {
        const costChanges: CostChangeRecord[] = [];
        const inventoryLogs: InventoryChangeRecord[] = [];
        const reportDate = new Date().toISOString().split('T')[0];
        const timestamp = Date.now();
        const uploadBatchId = `batch-${timestamp}`;
        const aggregatedDataMap = new Map<string, any>();
        data.forEach(item => { const sku = String(item.sku || '').trim(); if (!sku) return; const existing = aggregatedDataMap.get(sku) || {}; Object.entries(item).forEach(([k, v]) => { if (v !== undefined) existing[k] = v; }); aggregatedDataMap.set(sku, existing); });
        const finalData = Array.from(aggregatedDataMap.values());
        setProducts(prev => {
            const newProducts = [...(prev || [])];
            finalData.forEach(item => {
                const parseTags = (tags?: string): string[] => { if (!tags) return []; return tags.split(',').map(t => t.trim()).filter(Boolean); };
                const existingIndex = newProducts.findIndex(p => p.sku === item.sku);
                const existingProduct = existingIndex !== -1 ? newProducts[existingIndex] : null;
                if (existingProduct) {
                    const existing = { ...existingProduct };
                    if (item.stock !== undefined) {
                        const prevStock = existing.stockLevel || 0; const newStock = Number(item.stock);
                        if (newStock > prevStock) {
                            const deltaStock = newStock - prevStock; const pctIncrease = prevStock === 0 ? 1 : deltaStock / prevStock; const isSignificant = pctIncrease >= 0.05;
                            const hasMatchingShipment = (existing.shipments || []).some(s => { if (!s.eta) return false; const shipmentDate = new Date(s.eta).getTime(); const reportTime = new Date(reportDate).getTime(); return Math.abs((shipmentDate - reportTime) / (1000 * 60 * 60 * 24)) <= 7; });
                            const isStrategic = isSignificant && hasMatchingShipment;
                            inventoryLogs.push({ id: `inv-chg-${timestamp}-${item.sku}`, sku: item.sku, productName: existing.name, timestamp, date: reportDate, prevStock, newStock, deltaStock, source: "ERP_UPLOAD", uploadBatchId, isStrategic, reason: isStrategic ? "Strategic Restock" : "Routine Adjustment" });
                        }
                        existing.stockLevel = newStock;
                    }
                    if (item.cost !== undefined) {
                        const oldCost = existing.costPrice || 0; const newCost = Number(item.cost);
                        if (oldCost > 0 && Math.abs(oldCost - newCost) > 0.02) { costChanges.push({ id: `cost-chg-${Date.now()}-${item.sku}`, sku: item.sku, productName: existing.name, date: reportDate, oldCost, newCost, changeType: newCost > oldCost ? 'INCREASE' : 'DECREASE', percentChange: ((newCost - oldCost) / oldCost) * 100 }); }
                        existing.costPrice = newCost;
                    }
                    if (item.name) existing.name = item.name;
                    if (item.category) existing.category = item.category;
                    existing.lastUpdated = reportDate;
                    newProducts[existingIndex] = existing;
                } else {
                    newProducts.push({ 
                        id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, 
                        sku: item.sku, 
                        name: item.name || item.sku, 
                        stockLevel: item.stock || 0, 
                        costPrice: item.cost || 0, 
                        currentPrice: 0, // Initialized to 0 as per requirements
                        averageDailySales: 0, 
                        leadTimeDays: 30, 
                        status: 'Healthy', 
                        recommendation: 'New Product', 
                        daysRemaining: 999, 
                        channels: [], 
                        lastUpdated: reportDate, 
                        category: item.category || 'Uncategorized', 
                        dailyAverageSales: item.dailyAverageSales || 0 
                    });
                }
            });
            return newProducts;
        });
        if (costChanges.length > 0) setCostChangeHistory(prev => [...costChanges, ...(prev || [])]);
        if (inventoryLogs.length > 0) setInventoryChangeHistory(prev => [...inventoryLogs, ...(prev || [])]);
        updateTimestamp('Inventory'); setIsUploadModalOpen(false);
    };

    const handleResetSalesData = () => {
        setPriceHistory([]);
        setShipmentHistory([]);
        const currentThresholds = getThresholdConfig();
        const recalculated = recalculateProductMetrics(products, [], velocityLookback, currentThresholds);
        setProducts(recalculated);
        setIsSalesImportModalOpen(false);
    };

    const handleSkuDetailImport = (data: { masterSku: string; detail: SkuCostDetail }[]) => {
        setProducts(prev => (prev || []).map(p => {
            const update = data.find(d => d.masterSku === p.sku);
            return update ? { ...p, costDetail: update.detail } : p;
        }));
        updateTimestamp('SKU Details');
        setIsSkuDetailModalOpen(false);
    };

    const handleMappingImport = (mappings: any[], mode: 'merge' | 'replace', platform: string) => {
        setProducts(prev => (prev || []).map(p => {
            const platformMappings = mappings.filter(m => m.masterSku === p.sku && m.platform === platform);
            if (platformMappings.length === 0 && mode === 'merge') return p;
            
            const updatedChannels = [...p.channels];
            const channelIdx = updatedChannels.findIndex(c => c.platform === platform);
            const newAliases = platformMappings.map(m => m.alias).join(', ');

            if (channelIdx >= 0) {
                const existingAliases = updatedChannels[channelIdx].skuAlias?.split(',').map(s => s.trim()).filter(Boolean) || [];
                const importedAliases = newAliases.split(',').map(s => s.trim()).filter(Boolean);
                updatedChannels[channelIdx] = {
                    ...updatedChannels[channelIdx],
                    skuAlias: mode === 'replace' ? newAliases : [...new Set([...existingAliases, ...importedAliases])].join(', ')
                };
            } else if (newAliases) {
                updatedChannels.push({
                    platform,
                    manager: pricingRules[platform]?.manager || 'Unassigned',
                    velocity: 0,
                    skuAlias: newAliases
                });
            }
            return { ...p, channels: updatedChannels };
        }));
        setIsMappingModalOpen(false);
    };

    const handleReturnsImport = (newRefunds: RefundLog[]) => {
        setRefundHistory(prev => {
            const existingIds = new Set(prev.map(r => r.id));
            const uniqueNew = newRefunds.filter(r => !existingIds.has(r.id));
            return [...prev, ...uniqueNew];
        });
        
        setProducts(prev => (prev || []).map(p => {
            const productRefunds = [...refundHistory, ...newRefunds].filter(r => r.sku === p.sku);
            const totalRefundQty = productRefunds.reduce((sum, r) => sum + r.quantity, 0);
            // Rough estimate for display in catalog, proper rate is calculated in Decision Engine
            const returnRate = p.averageDailySales > 0 ? (totalRefundQty / (p.averageDailySales * 30)) * 100 : 0; 
            return { ...p, returnRate };
        }));
        
        updateTimestamp('Refunds');
        setIsReturnsModalOpen(false);
    };

    const handleCAImport = (data: { sku: string; caPrice: number }[], reportDate: string) => {
        const changes: PriceChangeRecord[] = [];
        setProducts(prev => (prev || []).map(p => {
            const update = data.find(d => d.sku.toUpperCase() === p.sku.toUpperCase() || d.sku.toUpperCase() === p.sku.toUpperCase().replace(/[-_]UK$/i, ''));
            if (update) {
                const oldPrice = p.caPrice || (p.currentPrice * VAT_MULTIPLIER);
                if (oldPrice > 0 && Math.abs(oldPrice - update.caPrice) > 0.02) {
                    changes.push({
                        id: `ca-chg-${Date.now()}-${p.sku}`,
                        sku: p.sku,
                        productName: p.name,
                        date: reportDate,
                        oldPrice,
                        newPrice: update.caPrice,
                        changeType: update.caPrice > oldPrice ? 'INCREASE' : 'DECREASE',
                        percentChange: ((update.caPrice - oldPrice) / oldPrice) * 100
                    });
                }
                return { ...p, caPrice: update.caPrice, lastUpdated: reportDate };
            }
            return p;
        }));
        if (changes.length > 0) setPriceChangeHistory(prev => [...changes, ...(prev || [])]);
        updateTimestamp('CA Prices');
        setIsCAUploadModalOpen(false);
    };

    const handleShipmentImport = (updates: any[]) => {
        setProducts(prev => (prev || []).map(p => {
            const update = updates.find(u => u.sku === p.sku);
            if (update) {
                const incomingStock = update.shipments.reduce((sum: number, s: any) => sum + s.quantity, 0);
                return { ...p, shipments: update.shipments, incomingStock };
            }
            return p;
        }));
        updateTimestamp('Shipments');
        setIsShipmentModalOpen(false);
    };

    return (
        <>
            <style>{` html, body { height: auto; margin: 0; padding: 0; min-height: 100vh; } :root { --glass-bg: ${userProfile.glassMode === 'dark' ? `rgba(17, 24, 39, ${(userProfile.glassOpacity??90)/100})` : `rgba(255, 255, 255, ${(userProfile.glassOpacity??90)/100})`}; --glass-border: ${userProfile.glassMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.4)'}; --glass-blur: blur(${userProfile.glassBlur??10}px); --glass-bg-modal: ${userProfile.glassMode === 'dark' ? `rgba(17, 24, 39, ${Math.min(1, (userProfile.glassOpacity??90)/100 + 0.1)})` : `rgba(255, 255, 255, ${Math.min(1, (userProfile.glassOpacity??90)/100 + 0.1)})`}; --glass-blur-modal: blur(${Math.min(40, (userProfile.glassBlur??10) + 8)}px); --ambient-bg: rgba(${ambientRgb.r}, ${ambientRgb.g}, ${ambientRgb.b}, ${(userProfile.ambientGlassOpacity??15)/100}); --ambient-blur: blur(${Math.min(20, (userProfile.glassBlur??10) + 4)}px); } .bg-custom-glass { background-color: var(--glass-bg); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); } .border-custom-glass { border-color: var(--glass-border); } .bg-custom-glass-modal { background-color: var(--glass-bg-modal); } .backdrop-blur-custom-modal { backdrop-filter: var(--glass-blur-modal); -webkit-backdrop-filter: var(--glass-blur-modal); } .bg-custom-ambient { background-color: var(--ambient-bg); } .backdrop-blur-custom-ambient { backdrop-filter: var(--ambient-blur); -webkit-backdrop-filter: var(--ambient-blur); } `}</style>
            <div className="min-h-screen flex font-sans text-gray-900 transition-colors duration-500 relative bg-transparent">
                {userProfile.ambientGlass && <div className="fixed inset-0 z-[1] pointer-events-none transition-all duration-500 bg-custom-ambient backdrop-blur-custom-ambient" />}
                <aside className={`w-64 border-r border-custom-glass hidden md:flex flex-col fixed h-full z-40 shadow-sm transition-all duration-300 bg-custom-glass`}>
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold" style={{ backgroundColor: userProfile.themeColor }}>S</div>
                        <span className="font-bold text-xl tracking-tight text-gray-900">Sello UK Hub</span>
                    </div>
                    <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
                        {[ 
                          { id: 'products', icon: LayoutDashboard, label: t('nav_overview') }, 
                          { id: 'platforms', icon: Globe, label: t('nav_platforms') },
                          { id: 'strategy', icon: Calculator, label: t('nav_strategy') }, 
                          { id: 'costs', icon: DollarSign, label: t('nav_costs') }, 
                          { id: 'promotions', icon: Tag, label: t('nav_promotions') }, 
                          { id: 'tools', icon: Wrench, label: t('nav_toolbox') }, 
                          { id: 'settings', icon: Settings, label: t('nav_config') }, 
                          { id: 'definitions', icon: BookOpen, label: t('nav_definitions') } 
                        ].map((item) => { const isActive = currentView === item.id; return ( <button key={item.id} onClick={() => setCurrentView(item.id as any)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${isActive ? 'bg-opacity-10' : 'text-gray-600 hover:bg-gray-50/50 hover:text-gray-900'}`} style={isActive ? { backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor } : {}} > <item.icon className="w-5 h-5" style={isActive ? { color: userProfile.themeColor } : {}} /> {item.label} </button> ); })}
                        {searchSessions && searchSessions.length > 0 && ( <div className="mt-6 pt-4 border-t border-gray-100/50"> <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2 flex items-center gap-2"> <History className="w-3 h-3" /> {t('active_searches')} </div> <div className="space-y-1"> {searchSessions.map(session => ( <div key={session.id} className="group relative flex items-center"> <button onClick={() => { setActiveSearchId(session.id); setCurrentView('search'); }} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all text-left overflow-hidden ${activeSearchId === session.id && currentView === 'search' ? 'bg-white/40 shadow-sm' : 'text-gray-600 hover:bg-gray-100/50'}`} style={activeSearchId === session.id && currentView === 'search' ? { backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor } : {}} > <Search className={`w-4 h-4 flex-shrink-0 ${activeSearchId === session.id && currentView === 'search' ? '' : 'opacity-70'}`} /> <span className="truncate pr-4 block w-full">{session.query}</span> </button> <button onClick={(e) => deleteSearchSession(session.id, e)} className="absolute right-1 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10" title="Close Search" > <X className="w-3 h-3" /> </button> </div> ))} </div> </div> )} 
                    </nav>
                    <div className="p-4 border-t border-custom-glass space-y-3">
                        <div className="px-2 space-y-2"> <button onClick={handleBackup} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100/50 transition-colors border border-transparent hover:border-custom-glass"><Download className="w-3.5 h-3.5" /> {t('backup_db')}</button> <button onClick={() => fileRestoreRef.current?.click()} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100/50 transition-colors border border-transparent hover:border-custom-glass"><Upload className="w-3.5 h-3.5" /> {t('restore_db')}</button> <input ref={fileRestoreRef} type="file" accept=".json" className="hidden" onChange={handleRestore} /> </div>
                        <div className="bg-gray-50/50 rounded-xl border border-custom-glass overflow-hidden transition-all duration-300">
                            <button onClick={() => setIsFreshnessExpanded(!isFreshnessExpanded)} className="w-full flex justify-between items-center p-3 hover:bg-gray-100/50 transition-colors"> <div className="flex items-center gap-2"> <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Data Freshness</span> <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform duration-200 ${isFreshnessExpanded ? 'rotate-180' : ''}`} /> </div> <span className={`w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-green-500' : 'bg-gray-400'}`}></span> </button>
                            {isFreshnessExpanded && ( <div className="px-3 pb-3 space-y-1.5 pt-0 animate-in slide-in-from-top-1 duration-200"> <div className="border-t border-gray-200/50 mb-2"></div> {[ { label: 'Inventory', key: 'Inventory' }, { label: 'Sales', key: 'Sales' }, { label: 'SKU Detail', key: 'SKU Details' }, { label: 'Refunds', key: 'Refunds' }, { label: 'CA Prices', key: 'CA Prices' }, { label: 'Shipments', key: 'Shipments' }, ].map(item => ( <div key={item.key} className="flex justify-between items-center text-[10px]"> <span className="text-gray-500">{item.label}</span> <span className={`font-mono ${uploadTimestamps[item.key] ? 'text-gray-700 font-medium' : 'text-gray-300 italic'}`}> {uploadTimestamps[item.key] ? new Date(uploadTimestamps[item.key]).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '-'} </span> </div> ))} </div> )}
                        </div>
                    </div>
                </aside>
                <main className="flex-1 md:ml-64 min-0 relative z-10">
                    <header className="sticky top-0 z-50 flex justify-between items-center gap-8 px-8 py-4 bg-custom-glass border-b border-custom-glass/50 shadow-sm transition-all duration-300">
                        <div> <h1 className="text-2xl font-bold transition-colors" style={headerStyle}> {currentView === 'search' ? t('header_search') : currentView === 'products' ? t('header_products') : currentView === 'platforms' ? t('header_platforms') : currentView === 'dashboard' ? t('header_dashboard') : currentView === 'strategy' ? t('header_strategy') : currentView === 'costs' ? t('header_costs') : currentView === 'definitions' ? t('header_definitions') : currentView === 'promotions' ? t('header_promotions') : currentView === 'tools' ? t('header_toolbox') : t('header_settings')} </h1> <p className="text-sm mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}> {currentView === 'search' ? t('desc_search') : currentView === 'dashboard' ? t('desc_dashboard') : currentView === 'strategy' ? t('desc_strategy') : currentView === 'products' ? t('desc_products') : currentView === 'platforms' ? t('desc_platforms') : currentView === 'costs' ? t('desc_costs') : currentView === 'definitions' ? t('desc_definitions') : currentView === 'promotions' ? t('desc_promotions') : currentView === 'tools' ? t('desc_toolbox') : t('desc_settings')} </p> </div>
                        <div className="flex-1 max-w-2xl"> <GlobalSearch onSearch={handleSearch} isLoading={isSearchLoading} platforms={Object.keys(pricingRules)} products={products} /> </div>
                        <div className="flex items-center gap-4"> <span className="text-xs" style={{...headerStyle, opacity: 0.6}}>{TAX_NOTE_SHORT}</span> <div className="h-6 w-px" style={{ backgroundColor: `${headerTextColor}40` }}></div> {userProfile.name && <span className="text-sm font-semibold" style={headerStyle}>{t('hello')}, {userProfile.name}!</span>} {hasInventory && <QuickUploadMenu themeColor={userProfile.themeColor} actions={quickUploadActions} />} <button className="relative p-2 hover:opacity-70 transition-opacity" style={headerStyle}><Bell className="w-6 h-6" /></button> <div className="h-6 w-px" style={{ backgroundColor: `${headerTextColor}40` }}></div> <UserProfile profile={userProfile} onUpdate={setUserProfile} /> </div>
                    </header>
                    <div className="flex-1 overflow-y-auto no-scrollbar relative p-4 md:p-8">
                        <div style={{ display: currentView === 'search' ? 'block' : 'none' }}>
                            {activeSearch ? ( <SearchResultsPage data={{ results: activeSearch.results || [], query: activeSearch.query, params: activeSearch.params, id: activeSearch.id }} products={products} pricingRules={pricingRules} themeColor={userProfile.themeColor} headerStyle={headerStyle} timeLabel={activeSearch.timeLabel} onRefine={handleRefineSearch} searchConfig={searchConfig} priceChangeHistory={priceChangeHistory} thresholds={thresholds} /> ) : ( <div className="flex flex-col items-center justify-center h-full text-gray-400"> <Search className="w-12 h-12 mb-4 opacity-50" /> <p className="text-lg font-medium">{t('search_empty_state')}</p> </div> )}
                        </div>
                        <div style={{ display: currentView === 'products' ? 'block' : 'none' }}>
                            {products.length === 0 ? ( <div className="flex flex-col items-center justify-center min-h-[500px] bg-custom-glass rounded-2xl border-2 border-dashed border-custom-glass text-center p-12 h-full"> <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm" style={{ backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor }}><Database className="w-10 h-10" /></div> <h3 className="text-2xl font-bold text-gray-900">{t('welcome_title')}</h3> <p className="text-gray-500 max-w-lg mt-3 mb-10 text-lg">{t('welcome_desc')}</p> <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl relative"> <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative group ${hasInventory ? 'bg-green-50/50 border-green-200' : 'bg-gray-50/50 border-gray-200 hover:border-indigo-300'}`}> <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${hasInventory ? 'bg-green-600 text-white' : 'text-white'}`} style={!hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>{hasInventory ? t('step_completed') : t('step_1')}</div> <div className="p-4 bg-white rounded-full shadow-sm mb-4">{hasInventory ? <CheckCircle className="w-8 h-8 text-green-600" /> : <Database className="w-8 h-8" style={{ color: userProfile.themeColor }} />}</div> <h4 className="font-bold text-gray-900 text-lg">{t('empty_state_erp_title')}</h4> <p className="text-sm text-gray-500 mt-2 text-center">{t('empty_state_erp_desc')}</p> <button onClick={() => setIsUploadModalOpen(true)} className={`mt-6 w-full py-3 bg-white border text-gray-700 font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${hasInventory ? 'border-green-300 text-green-700' : 'border-gray-300'}`} style={!hasInventory ? { borderColor: userProfile.themeColor, color: userProfile.themeColor } : {}}>{hasInventory ? t('reupload_inventory') : t('upload_inventory')}</button> </div> <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative ${!hasInventory ? 'bg-gray-50/50 border-gray-200 opacity-60' : 'bg-custom-glass border-indigo-200 shadow-lg scale-105 z-10'}`}> <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${!hasInventory ? 'bg-gray-400 text-white' : 'text-white'}`} style={hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>{t('step_2')}</div> <div className="p-4 bg-white rounded-full shadow-sm mb-4"><FileBarChart className={`w-8 h-8 ${!hasInventory ? 'text-gray-400' : ''}`} style={hasInventory ? { color: userProfile.themeColor } : {}} /></div> <h4 className="font-bold text-gray-900 text-lg">{t('empty_state_sales_title')}</h4> <p className="text-sm text-gray-500 mt-2 text-center">{t('empty_state_sales_desc')}</p> <button onClick={() => hasInventory && setIsSalesImportModalOpen(true)} disabled={!hasInventory} style={hasInventory ? { backgroundColor: userProfile.themeColor } : {}} className={`mt-6 w-full py-3 font-bold rounded-lg flex items-center justify-center gap-2 text-white transition-all ${!hasInventory ? 'bg-gray-300' : 'hover:opacity-90 shadow-lg'}`}><Upload className="w-5 h-5" /> {t('upload_sales')}</button> </div> </div> </div> ) : ( <ProductManagementPage products={products} pricingRules={pricingRules} promotions={promotions || []} priceHistoryMap={priceHistoryMap} refundHistory={refundHistory || []} priceChangeHistory={priceChangeHistory || []} onOpenMappingModal={() => setIsMappingModalOpen(true)} dateLabels={dynamicDateLabels} onUpdateProduct={(p) => setProducts(prev => (prev || []).map(old => old.id === p.id ? p : old))} onViewElasticity={handleViewElasticity} themeColor={userProfile.themeColor} headerStyle={headerStyle} onAnalyze={handleAnalyze} onDeepDive={handleDeepDiveRequest} onSearch={handleSearch} thresholds={thresholds} /> )}
                        </div>
                        <div style={{ display: currentView === 'platforms' ? 'block' : 'none' }}>
                            <PlatformManagementPage products={products} priceHistoryMap={priceHistoryMap} pricingRules={pricingRules} themeColor={userProfile.themeColor} headerStyle={headerStyle} />
                        </div>
                        <div style={{ display: currentView === 'strategy' ? 'block' : 'none' }}>
                            <StrategyPage products={products} pricingRules={pricingRules} currentConfig={strategyRules} onSaveConfig={(newConfig: StrategyConfig) => { setStrategyRules(newConfig); setCurrentView('products'); }} themeColor={userProfile.themeColor} headerStyle={headerStyle} priceHistoryMap={priceHistoryMap} promotions={promotions || []} priceChangeHistory={priceChangeHistory || []} costChangeHistory={costChangeHistory || []} inventoryChangeHistory={inventoryChangeHistory || []} onUpdatePriceChangeRecord={handleUpdatePriceChangeRecord} onUpdateCostChangeRecord={handleUpdateCostChangeRecord} onUpdateInventoryChangeRecord={handleUpdateInventoryChangeRecord} onManualPriceChange={handleManualPriceChange} onManualCostChange={handleManualCostChange} velocityLookback={velocityLookback} thresholds={thresholds} />
                        </div>
                        <div style={{ display: currentView === 'costs' ? 'block' : 'none' }}>
                            <CostManagementPage products={products} themeColor={userProfile.themeColor} headerStyle={headerStyle} />
                        </div>
                        <div style={{ display: currentView === 'promotions' ? 'block' : 'none' }}>
                            <PromotionPage products={products} pricingRules={pricingRules} logisticsRules={logisticsRules || []} promotions={promotions || []} priceHistoryMap={priceHistoryMap} onAddPromotion={(p) => setPromotions(prev => [...(prev || []), p])} onUpdatePromotion={(p) => setPromotions(prev => (prev || []).map(o => o.id === p.id ? p : o))} onDeletePromotion={(id) => setPromotions(prev => (prev || []).filter(p => p.id !== id))} themeColor={userProfile.themeColor} headerStyle={headerStyle} />
                        </div>
                        <div style={{ display: currentView === 'tools' ? 'block' : 'none' }}>
                            <ToolboxPage promotions={promotions || []} pricingRules={pricingRules} inventoryTemplates={inventoryTemplates || []} onSaveTemplates={setInventoryTemplates} products={products} themeColor={userProfile.themeColor} headerStyle={headerStyle} />
                        </div>
                        <div style={{ display: currentView === 'definitions' ? 'block' : 'none' }}>
                            <DefinitionsPage headerStyle={headerStyle} />
                        </div>
                        <div style={{ display: currentView === 'settings' ? 'block' : 'none' }}>
                            <SettingsPage currentRules={pricingRules} onSave={(newRules, newVelocity, newSearchConfig) => { setPricingRules(newRules); setVelocityLookback(newVelocity); if (newSearchConfig) setSearchConfig(newSearchConfig); localStorage.setItem('sello_velocity_setting', newVelocity); handleRecalculateVelocity(newVelocity, priceHistory); }} logisticsRules={logisticsRules || []} onSaveLogistics={(newLogistics) => { setLogisticsRules(newLogistics); }} products={products} shipmentHistory={shipmentHistory || []} themeColor={userProfile.themeColor} headerStyle={headerStyle} searchConfig={searchConfig} velocityLookback={velocityLookback} extraData={{ priceHistory, promotions: promotions || [] }} onRefreshThresholds={handleRefreshThresholds} />
                        </div>
                    </div>
                </main>
                {isUploadModalOpen && <BatchUploadModal products={products} onClose={() => setIsUploadModalOpen(false)} onConfirm={handleInventoryImport} />}
                {isSalesImportModalOpen && <SalesImportModal products={products} pricingRules={pricingRules} learnedAliases={learnedAliases} onClose={() => setIsSalesImportModalOpen(false)} onResetData={handleResetSalesData} onConfirm={handleSalesImportConfirm} />}
                {isSkuDetailModalOpen && <SkuDetailUploadModal products={products} onClose={() => setIsSkuDetailModalOpen(false)} onConfirm={handleSkuDetailImport} />}
                {isMappingModalOpen && <MappingUploadModal products={products} platforms={Object.keys(pricingRules)} learnedAliases={learnedAliases} onClose={() => setIsMappingModalOpen(false)} onConfirm={handleMappingImport} />}
                {isReturnsModalOpen && <ReturnsUploadModal onClose={() => setIsReturnsModalOpen(false)} onConfirm={handleReturnsImport} onReset={handleResetRefunds} existingOrders={existingOrders} />}
                {isCAUploadModalOpen && <CAUploadModal products={products} onClose={() => setIsCAUploadModalOpen(false)} onConfirm={handleCAImport} />}
                {isShipmentModalOpen && <ShipmentUploadModal products={products} onClose={() => setIsShipmentModalOpen(false)} onConfirm={handleShipmentImport} />}
                {selectedElasticityProduct && ( <PriceElasticityModal product={selectedElasticityProduct} priceHistory={priceHistory} priceChangeHistory={priceChangeHistory || []} onClose={() => setSelectedElasticityProduct(null)} /> )}
                {selectedAnalysisProduct && ( <AnalysisModal product={selectedAnalysisProduct} analysis={analysisResult} isLoading={isAnalysisLoading} onClose={() => { setSelectedAnalysisProduct(null); setAnalysisResult(null); }} onApplyPrice={handleApplyPrice} themeColor={userProfile.themeColor} /> )}
                
                {/* Back to Top Button */}
                <button
                    onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                    className={`fixed bottom-8 right-8 p-2.5 rounded-full bg-custom-glass border border-custom-glass shadow-lg hover:shadow-xl transition-all duration-300 z-[60] flex items-center justify-center ${showBackToTop ? 'opacity-70 hover:opacity-100 translate-y-0' : 'opacity-0 translate-y-10 pointer-events-none'}`}
                    style={{ borderColor: `${userProfile.themeColor}40`, color: userProfile.themeColor }}
                    aria-label="Back to top"
                >
                    <ArrowUp className="w-5 h-5" />
                </button>
            </div>
        </>
    );
};

export default App;