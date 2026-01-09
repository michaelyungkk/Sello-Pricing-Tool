
// ... existing imports ...
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { INITIAL_PRODUCTS, MOCK_PRICE_HISTORY, MOCK_PROMOTIONS, DEFAULT_PRICING_RULES, DEFAULT_LOGISTICS_RULES, DEFAULT_STRATEGY_RULES, DEFAULT_SEARCH_CONFIG, VAT_MULTIPLIER } from './constants';
import { Product, PricingRules, PriceLog, PromotionEvent, UserProfile as UserProfileType, ChannelData, LogisticsRule, ShipmentLog, StrategyConfig, VelocityLookback, RefundLog, ShipmentDetail, HistoryPayload, PriceChangeRecord, AnalysisResult, SearchChip, SearchConfig, SkuCostDetail, InventoryTemplate, SearchSession } from './types';

// Components
import ProductList from './components/ProductList';
import ProductManagementPage from './components/ProductManagementPage';
import StrategyPage from './components/StrategyPage';

import { 
  LayoutDashboard, Calculator, DollarSign, Tag, Wrench, Settings, BookOpen, Search, X, 
  Download, Upload, WifiOff, Database, CheckCircle, FileBarChart, Bell, History, 
  UploadCloud, ChevronDown, RotateCcw, FileText, Link as LinkIcon, Ship 
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
import { getThresholdConfig, ThresholdConfig } from './services/thresholdsConfig';
import { useTranslation } from 'react-i18next';

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

// --- CENTRAL RECALCULATION LOGIC ---
const recalculateProductMetrics = (
    products: Product[],
    history: PriceLog[],
    lookback: VelocityLookback,
    thresholds: ThresholdConfig
): Product[] => {
    // 1. Build History Map
    const historyMap = new Map<string, PriceLog[]>();
    history.forEach(h => {
        if (!historyMap.has(h.sku)) historyMap.set(h.sku, []);
        historyMap.get(h.sku)!.push(h);
    });

    // 2. Determine Time Window
    let days = 30;
    if (lookback === 'ALL') {
        if (history.length > 0) {
            const dates = history.map(l => new Date(l.date).getTime());
            const minDate = Math.min(...dates);
            const diff = Date.now() - minDate;
            days = Math.max(1, Math.ceil(diff / (1000 * 60 * 60 * 24)));
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
    return products.map(p => {
        const logs = historyMap.get(p.sku) || [];
        
        let currentQty = 0;
        let prevQty = 0;

        logs.forEach(l => {
            const d = new Date(l.date);
            if (d >= cutoffDate) {
                currentQty += l.velocity;
            } else if (d >= prevCutoffDate) {
                prevQty += l.velocity;
            }
        });

        const newDailySales = currentQty / days;
        const newPrevDailySales = prevQty / days;
        
        const daysRemaining = newDailySales > 0 ? p.stockLevel / newDailySales : 999;
        
        let status: 'Critical' | 'Warning' | 'Healthy' | 'Overstock' = 'Healthy';
        if (p.stockLevel <= 0) status = 'Critical';
        else if (daysRemaining < p.leadTimeDays * thresholds.stockoutRunwayMultiplier) status = 'Critical';
        else if (daysRemaining > thresholds.overstockDays) status = 'Overstock';
        else if (daysRemaining < p.leadTimeDays * (thresholds.stockoutRunwayMultiplier + 0.5)) status = 'Warning';

        const velocityChange = newPrevDailySales > 0 
            ? ((newDailySales - newPrevDailySales) / newPrevDailySales) * 100 
            : 0;

        return {
            ...p,
            averageDailySales: newDailySales,
            previousDailySales: newPrevDailySales,
            daysRemaining,
            status,
            _trendData: { velocityChange }
        };
    });
};

const App: React.FC = () => {
    const { t } = useTranslation();
    
    // ... (Keep existing state & effects)
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [priceHistory, setPriceHistory] = useState<PriceLog[]>([]);
    const [refundHistory, setRefundHistory] = useState<RefundLog[]>([]);
    const [shipmentHistory, setShipmentHistory] = useState<ShipmentLog[]>([]);
    const [priceChangeHistory, setPriceChangeHistory] = useState<PriceChangeRecord[]>([]);
    const [promotions, setPromotions] = useState<PromotionEvent[]>(MOCK_PROMOTIONS);
    const [learnedAliases, setLearnedAliases] = useState<Record<string, string>>({});
    const [inventoryTemplates, setInventoryTemplates] = useState<InventoryTemplate[]>([]); 
    const [pricingRules, setPricingRules] = useState<PricingRules>(DEFAULT_PRICING_RULES);
    const [logisticsRules, setLogisticsRules] = useState<LogisticsRule[]>(DEFAULT_LOGISTICS_RULES);
    const [strategyRules, setStrategyRules] = useState<StrategyConfig>(DEFAULT_STRATEGY_RULES);
    const [searchConfig, setSearchConfig] = useState<SearchConfig>(DEFAULT_SEARCH_CONFIG);
    
    // NEW: Threshold State
    const [thresholds, setThresholds] = useState<ThresholdConfig>(getThresholdConfig());

    // Initialize velocity from local storage to persist across refreshes
    const [velocityLookback, setVelocityLookback] = useState<VelocityLookback>(() => {
        return (localStorage.getItem('sello_velocity_setting') as VelocityLookback) || '30';
    });

    const [userProfile, setUserProfile] = useState<UserProfileType>({
        name: '', themeColor: '#4f46e5', backgroundImage: '', backgroundColor: '#f3f4f6', glassMode: 'light', glassOpacity: 90, glassBlur: 10, ambientGlass: true, ambientGlassOpacity: 15
    });

    // ... (Keep loading and storage effects)
    useEffect(() => {
        const loadDatabase = async () => {
            // ... (Mock loading)
            setTimeout(() => {
               // ...
               setIsDataLoaded(true);
            }, 500);
        };
        loadDatabase();
    }, []);

    // ... (State)
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
    const [currentView, setCurrentView] = useState<'dashboard' | 'strategy' | 'products' | 'settings' | 'costs' | 'definitions' | 'promotions' | 'tools' | 'search'>('products');
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const fileRestoreRef = useRef<HTMLInputElement>(null);

    // Derived State
    const priceHistoryMap = useMemo(() => {
        const map = new Map<string, PriceLog[]>();
        priceHistory.forEach(h => {
            if (!map.has(h.sku)) map.set(h.sku, []);
            map.get(h.sku)!.push(h);
        });
        return map;
    }, [priceHistory]);

    const existingOrders = useMemo(() => {
        const map = new Map<string, string>();
        priceHistory.forEach(p => {
            if (p.orderId) map.set(p.orderId, p.platform || 'Unknown');
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
       // ... existing search impl ...
       let rawText = "";
       if (typeof queryOrChips === 'string') { rawText = queryOrChips; } 
       else { const chips = queryOrChips; const metrics = chips.filter(c => c.type === 'METRIC').map(c => c.label).join(' '); const conditions = chips.filter(c => c.type === 'CONDITION').map(c => c.label).join(' '); const platforms = chips.filter(c => c.type === 'PLATFORM').map(c => `on ${c.label}`).join(' '); const text = chips.filter(c => c.type === 'TEXT').map(c => c.value).join(' '); const time = chips.filter(c => c.type === 'TIME').map(c => c.label).join(' '); rawText = `${time} ${conditions} ${metrics} ${platforms} ${text}`.trim(); }
       
       // --- INTERCEPT: Direct SKU/Alias Match -> Force Deep Dive ---
       const cleanQuery = rawText.replace(/^SKU:\s*/i, '').trim(); 
       const normalizedQuery = cleanQuery.toLowerCase();

       const directMatch = products.find(p => {
           if (p.sku.toLowerCase() === normalizedQuery) return true;
           return p.channels.some(c => c.skuAlias && c.skuAlias.split(',').some(a => a.trim().toLowerCase() === normalizedQuery));
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
               
               const newSession: SearchSession = { 
                   id: `search-${Date.now()}`, 
                   query: `SKU: ${directMatch.sku}`,
                   results: results || [], 
                   params: deepDiveIntent, 
                   explanation: deepDiveIntent.explanation, 
                   timeLabel: timeLabel, 
                   timestamp: Date.now() 
               };
               
               setSearchSessions(prev => [newSession, ...prev]); 
               setActiveSearchId(newSession.id); 
               setCurrentView('search');
               setIsSearchLoading(false);
           }, 150);
           return;
       }

       // Standard AI/Legacy Search
       setIsSearchLoading(true);
       try {
         const intent = await parseSearchQuery(rawText);
         const { results, timeLabel } = processDataForSearch(intent, products, priceHistory, pricingRules, refundHistory);
         const newSession: SearchSession = { id: `search-${Date.now()}`, query: rawText, results: results || [], params: intent, explanation: intent.explanation, timeLabel: timeLabel, timestamp: Date.now() };
         setSearchSessions(prev => [newSession, ...prev]); setActiveSearchId(newSession.id); setCurrentView('search');
       } catch(e) { console.error("Search failed", e); } finally { setIsSearchLoading(false); }
    };
    
    const handleDeepDiveRequest = (sku: string) => {
        handleSearch(`SKU: ${sku}`);
    };

    const handleRefineSearch = (sessionId: string, newIntent: SearchIntent) => { setIsSearchLoading(true); setTimeout(() => { const { results, timeLabel } = processDataForSearch(newIntent, products, priceHistory, pricingRules, refundHistory); setSearchSessions(prev => prev.map(s => { if (s.id === sessionId) { return { ...s, results, params: newIntent, timeLabel }; } return s; })); setIsSearchLoading(false); }, 150); };
    const deleteSearchSession = (id: string, e: React.MouseEvent) => { e.stopPropagation(); setSearchSessions(prev => prev.filter(s => s.id !== id)); if (activeSearchId === id) { setActiveSearchId(null); setCurrentView('products'); } };
    const handleViewElasticity = (product: Product) => { setSelectedElasticityProduct(product); };
    const handleAnalyze = async (product: Product, context?: string) => { const platformName = product.platform || (product.channels && product.channels.length > 0 ? product.channels[0].platform : 'General'); const platformRule = pricingRules[platformName] || { markup: 0, commission: 15, manager: 'General', isExcluded: false }; setSelectedAnalysisProduct(product); setAnalysisResult(null); setIsAnalysisLoading(true); try { const result = await analyzePriceAdjustment(product, platformRule, context, thresholds); setAnalysisResult(result); } catch (error) { console.error("Analysis failed in App:", error); } finally { setIsAnalysisLoading(false); } };
    const handleApplyPrice = (productId: string, newPrice: number) => { setProducts(prev => { const productToUpdate = prev.find(p => p.id === productId); if (!productToUpdate) { return prev; } const oldPrice = productToUpdate.caPrice || (productToUpdate.currentPrice * VAT_MULTIPLIER); const change: PriceChangeRecord = { id: `chg-${Date.now()}-${productToUpdate.sku}`, sku: productToUpdate.sku, productName: productToUpdate.name, date: new Date().toISOString().split('T')[0], oldPrice: oldPrice, newPrice: newPrice, changeType: newPrice > oldPrice ? 'INCREASE' : 'DECREASE', percentChange: oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 100 }; setPriceChangeHistory(prevHistory => [...prevHistory, change]); return prev.map(p => { if (p.id !== productId) { return p; } return Object.assign({}, p, { caPrice: newPrice, lastUpdated: new Date().toISOString().split('T')[0] }); }); }); setSelectedAnalysisProduct(null); setAnalysisResult(null); };
    const handleBackup = () => { const data = { products, priceHistory, refundHistory, shipmentHistory, priceChangeHistory, promotions, learnedAliases, pricingRules, logisticsRules, strategyRules, searchConfig, velocityLookback, userProfile, inventoryTemplates, exportDate: new Date().toISOString() }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `sello_backup_${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); };
    
    // --- UPDATED RESTORE HANDLER ---
    const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = async (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                if (!json.products) throw new Error("Invalid backup file format");
                
                // 1. Restore Base State
                if (json.priceHistory) setPriceHistory(json.priceHistory);
                if (json.refundHistory) setRefundHistory(json.refundHistory);
                if (json.shipmentHistory) setShipmentHistory(json.shipmentHistory);
                if (json.priceChangeHistory) setPriceChangeHistory(json.priceChangeHistory);
                if (json.promotions) setPromotions(json.promotions);
                if (json.learnedAliases) setLearnedAliases(json.learnedAliases);
                if (json.pricingRules) setPricingRules(json.pricingRules);
                if (json.logisticsRules) setLogisticsRules(json.logisticsRules);
                if (json.strategyRules) setStrategyRules(json.strategyRules);
                if (json.searchConfig) setSearchConfig(json.searchConfig);
                if (json.userProfile) setUserProfile(json.userProfile);
                if (json.inventoryTemplates) setInventoryTemplates(json.inventoryTemplates);
                
                let loadedVelocity = velocityLookback;
                if (json.velocityLookback) {
                    setVelocityLookback(json.velocityLookback);
                    loadedVelocity = json.velocityLookback;
                }

                // 2. FORCE RECALCULATION of Products using restored history and settings
                // This ensures "Days Remaining", "Status", and "Velocity" are consistent with the current date and restored rules
                const currentThresholds = getThresholdConfig(); // Always use latest local thresholds, or assume restored? Usually local.
                const recalculatedProducts = recalculateProductMetrics(json.products, json.priceHistory || [], loadedVelocity, currentThresholds);
                
                setProducts(recalculatedProducts);
                
                alert("Database restored & recalculated successfully!");
            } catch (err) {
                console.error("Restore failed", err);
                alert("Failed to restore database. Invalid file format.");
            }
        };
        reader.readAsText(file);
        if (fileRestoreRef.current) fileRestoreRef.current.value = '';
    };
    
    const handleResetRefunds = () => {
        setRefundHistory([]);
        setProducts(prev => prev.map(p => ({ ...p, returnRate: 0 })));
        setIsReturnsModalOpen(false);
    };

    const QuickUploadMenu = () => { 
        const [isOpen, setIsOpen] = useState(false); 
        const menuRef = useRef<HTMLDivElement>(null); 
        useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) { setIsOpen(false); } }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []); 
        const actions = [ 
            { label: 'Import Inventory', icon: Database, action: () => setIsUploadModalOpen(true), color: 'text-indigo-600' }, 
            { label: 'Import Sales', icon: FileBarChart, action: () => setIsSalesImportModalOpen(true), color: 'text-blue-600' }, 
            { label: 'Import Refunds', icon: RotateCcw, action: () => setIsReturnsModalOpen(true), color: 'text-red-600' }, 
            { label: 'SKU Detail', icon: FileText, action: () => setIsSkuDetailModalOpen(true), color: 'text-teal-600' }, 
            { label: 'CA Report', icon: Upload, action: () => setIsCAUploadModalOpen(true), color: 'text-purple-600' }, 
            { label: 'SKU Mapping', icon: LinkIcon, action: () => setIsMappingModalOpen(true), color: 'text-amber-600' }, 
            { label: 'Shipment Import', icon: Ship, action: () => setIsShipmentModalOpen(true), color: 'text-teal-600' }, 
        ]; 
        return ( <div className="relative z-50" ref={menuRef}> <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-all font-medium" style={{ backgroundColor: userProfile.themeColor }}> <UploadCloud className="w-4 h-4" /> <span className="hidden md:inline">{t('upload_data')}</span> <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} /> </button> {isOpen && ( <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right"> <div className="p-2 grid gap-1"> {actions.map((item) => ( <button key={item.label} onClick={() => { item.action(); setIsOpen(false); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors text-left w-full group" > <div className={`p-1.5 rounded-md bg-gray-50 group-hover:bg-white border border-gray-100 group-hover:shadow-sm transition-all ${item.color}`}> <item.icon className="w-4 h-4" /> </div> <span className="font-medium">{item.label}</span> </button> ))} </div> </div> )} </div> ); 
    };
    
    const headerTextColor = userProfile.textColor || '#111827';
    const textShadowStyle = userProfile.backgroundImage && userProfile.backgroundImage !== 'none' ? { textShadow: '0 1px 3px rgba(0,0,0,0.3)' } : {};
    const headerStyle = { color: headerTextColor, ...textShadowStyle };
    const hasInventory = products.length > 0;
    const activeSearch = searchSessions.find(s => s.id === activeSearchId);

    // --- UPDATED SALES IMPORT HANDLER ---
    const handleSalesImportConfirm = (
        updatedProductsFromImport: Product[], 
        newDateLabels?: { current: string, last: string }, 
        historyPayload?: HistoryPayload[], 
        newShipmentLogs?: ShipmentLog[], 
        discoveredPlatforms?: string[]
    ) => { 
        // 1. Update State Objects (Merge new history)
        let updatedPriceHistory = [...priceHistory];
        
        if (historyPayload && historyPayload.length > 0) { 
            const newLogs: PriceLog[] = historyPayload.map(h => ({ 
                id: `log-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, 
                sku: h.sku, 
                date: h.date, 
                price: h.price, 
                velocity: h.velocity, 
                margin: h.margin || 0, 
                profit: h.profit, 
                adsSpend: h.adsSpend, 
                platform: h.platform, 
                orderId: h.orderId 
            })); 
            
            // Merge logic (filter dups)
            const transactionKeys = new Set<string>(); 
            const dailyActivityKeys = new Set<string>(); 
            newLogs.forEach(l => { 
                const d = l.date.split('T')[0]; 
                const p = l.platform || 'General'; 
                const sku = l.sku; 
                if (l.orderId) { 
                    transactionKeys.add(`${l.sku}|${l.orderId}`); 
                } 
                dailyActivityKeys.add(`${sku}|${d}|${p}`); 
            }); 
            
            const keptHistory = priceHistory.filter(l => { 
                const d = l.date.split('T')[0]; 
                const p = l.platform || 'General'; 
                if (l.orderId) { 
                    const txKey = `${l.sku}|${l.orderId}`; 
                    if (transactionKeys.has(txKey)) return false; 
                    return true; 
                } 
                const dailyKey = `${l.sku}|${d}|${p}`; 
                if (dailyActivityKeys.has(dailyKey)) { return false; } 
                return true; 
            }); 
            
            updatedPriceHistory = [...newLogs, ...keptHistory];
            setPriceHistory(updatedPriceHistory);
        }

        // 2. Merge Product Updates (Cost/Fee data from import) with existing State
        let mergedProducts = products.map(p => {
            const update = updatedProductsFromImport.find(u => u.id === p.id);
            if (update) {
                // Return updated product BUT we will override velocity/status in step 3
                return update;
            }
            return p;
        });

        // 3. FORCE RECALCULATION of Velocity/Status using Global Settings
        // This overrides the simple velocity calc done inside the modal with the proper lookback window logic
        const currentThresholds = getThresholdConfig();
        const finalProducts = recalculateProductMetrics(mergedProducts, updatedPriceHistory, velocityLookback, currentThresholds);
        
        setProducts(finalProducts);

        if (newShipmentLogs && newShipmentLogs.length > 0) { 
            setShipmentHistory(prev => [...newShipmentLogs, ...prev]); 
        } 
        
        if (discoveredPlatforms && discoveredPlatforms.length > 0) { 
            setPricingRules(prev => { 
                const newRules = { ...prev }; 
                let changed = false; 
                discoveredPlatforms.forEach(p => { 
                    if (!newRules[p]) { 
                        newRules[p] = { markup: 0, commission: 15, manager: 'Unassigned', color: '#6b7280' }; 
                        changed = true; 
                    } 
                }); 
                return changed ? newRules : prev; 
            }); 
        } 
        
        setIsSalesImportModalOpen(false); 
    };

    const handleResetSalesData = () => { setPriceHistory([]); setProducts(prev => prev.map(p => ({ ...p, averageDailySales: 0, previousDailySales: 0, daysRemaining: p.stockLevel > 0 ? 999 : 0, status: p.stockLevel > 0 ? 'Overstock' : 'Critical' }))); setShipmentHistory([]); setIsSalesImportModalOpen(false); };
    const handleInventoryImport = (data: any[]) => { setProducts(prev => { const skuMap = new Map<string, Product>(); prev.forEach(p => skuMap.set(p.sku, p)); const newProducts = [...prev]; data.forEach(item => { const existingIndex = newProducts.findIndex(p => p.sku === item.sku); const existing = existingIndex !== -1 ? { ...newProducts[existingIndex] } : undefined; if (existing) { if (item.stock !== undefined) existing.stockLevel = item.stock; if (item.agedStock !== undefined) existing.agedStockQty = item.agedStock; if (item.cost !== undefined) existing.costPrice = item.cost; if (item.name) existing.name = item.name; if (item.category) existing.category = item.category; if (item.subcategory) existing.subcategory = item.subcategory; if (item.brand) existing.brand = item.brand; if (item.inventoryStatus) existing.inventoryStatus = item.inventoryStatus; if (item.cartonDimensions) existing.cartonDimensions = item.cartonDimensions; existing.lastUpdated = new Date().toISOString().split('T')[0]; newProducts[existingIndex] = existing; } else { newProducts.push({ id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, sku: item.sku, name: item.name || item.sku, brand: item.brand, category: item.category || 'Uncategorized', subcategory: item.subcategory, stockLevel: item.stock || 0, agedStockQty: item.agedStock || 0, costPrice: item.cost || 0, currentPrice: 0, averageDailySales: 0, leadTimeDays: 30, status: 'Healthy', recommendation: 'New Product', daysRemaining: 999, channels: [], lastUpdated: new Date().toISOString().split('T')[0], inventoryStatus: item.inventoryStatus, cartonDimensions: item.cartonDimensions }); } }); return newProducts; }); setIsUploadModalOpen(false); };
    const handleSkuDetailImport = (data: { masterSku: string; detail: SkuCostDetail }[]) => { setProducts(prev => prev.map(p => { const update = data.find(d => d.masterSku === p.sku); if (update) { return { ...p, costDetail: update.detail }; } return p; })); setIsSkuDetailModalOpen(false); };
    const handleMappingImport = (mappings: any[], mode: 'merge' | 'replace', platform: string) => { setProducts(prev => prev.map(p => { const productMappings = mappings.filter(m => m.masterSku === p.sku); if (productMappings.length === 0 && mode === 'merge') return p; let newChannels = [...p.channels]; if (mode === 'replace') { const chIdx = newChannels.findIndex(c => c.platform === platform); if (chIdx >= 0) { newChannels[chIdx] = { ...newChannels[chIdx], skuAlias: '' }; } } if (productMappings.length > 0) { const aliases = productMappings.map(m => m.alias).join(', '); const chIdx = newChannels.findIndex(c => c.platform === platform); if (chIdx >= 0) { const existingAliases = newChannels[chIdx].skuAlias ? newChannels[chIdx].skuAlias?.split(',').map(s => s.trim()) : []; const newSet = new Set(mode === 'merge' ? existingAliases : []); productMappings.forEach(m => newSet.add(m.alias)); newChannels[chIdx] = { ...newChannels[chIdx], skuAlias: Array.from(newSet).join(', ') }; } else { newChannels.push({ platform: platform, manager: pricingRules[platform]?.manager || 'Unassigned', velocity: 0, skuAlias: aliases }); } } return { ...p, channels: newChannels }; })); setIsMappingModalOpen(false); };
    const handleReturnsImport = (refunds: RefundLog[]) => { setRefundHistory(prev => { const existingIds = new Set(prev.map(r => r.id)); const newLogs = refunds.filter(r => !existingIds.has(r.id)); if (newLogs.length > 0) { const skuRefundCounts: Record<string, number> = {}; [...prev, ...newLogs].forEach(r => { skuRefundCounts[r.sku] = (skuRefundCounts[r.sku] || 0) + r.quantity; }); setProducts(products => products.map(p => { if (skuRefundCounts[p.sku] !== undefined) { const estimatedMonthlySales = Math.max(1, p.averageDailySales * 30); const rate = Math.min(100, (skuRefundCounts[p.sku] / estimatedMonthlySales) * 100); return { ...p, returnRate: Number(rate.toFixed(2)) }; } return p; })); } return [...newLogs, ...prev]; }); setIsReturnsModalOpen(false); };
    
    const handleCAImport = (data: { sku: string; caPrice: number }[], reportDate: string) => {
        const changes: PriceChangeRecord[] = [];
        const caDataMap = new Map<string, number>();
        data.forEach(d => caDataMap.set(d.sku.toUpperCase().trim(), d.caPrice));

        setProducts(prev => prev.map(p => {
            const masterSku = p.sku.toUpperCase().trim();
            let newPrice = caDataMap.get(masterSku);

            if (newPrice === undefined) {
                const stripped = masterSku.replace(/[-_]UK$/i, '');
                newPrice = caDataMap.get(stripped);
            }

            if (newPrice !== undefined) {
                const oldPrice = p.caPrice || 0;
                if (oldPrice > 0 && Math.abs(oldPrice - newPrice) > 0.02) {
                    changes.push({
                        id: `chg-${Date.now()}-${p.sku}`,
                        sku: p.sku,
                        productName: p.name,
                        date: reportDate,
                        oldPrice: oldPrice,
                        newPrice: newPrice,
                        changeType: newPrice > oldPrice ? 'INCREASE' : 'DECREASE',
                        percentChange: ((newPrice - oldPrice) / oldPrice) * 100
                    });
                }
                return { ...p, caPrice: newPrice };
            }
            return p;
        }));

        if (changes.length > 0) {
            setPriceChangeHistory(prev => [...changes, ...prev]);
        }
        setIsCAUploadModalOpen(false);
    };

    const handleShipmentImport = (updates: { sku: string; shipments: ShipmentDetail[] }[]) => { setProducts(prev => prev.map(p => { const update = updates.find(u => u.sku === p.sku); if (update) { const totalIncoming = update.shipments.reduce((sum, s) => sum + s.quantity, 0); return { ...p, shipments: update.shipments, incomingStock: totalIncoming }; } return p; })); setIsShipmentModalOpen(false); };

    return (
        <>
            <style>{` html, body { height: auto; margin: 0; padding: 0; min-height: 100vh; } :root { --glass-bg: ${userProfile.glassMode === 'dark' ? `rgba(17, 24, 39, ${(userProfile.glassOpacity??90)/100})` : `rgba(255, 255, 255, ${(userProfile.glassOpacity??90)/100})`}; --glass-border: ${userProfile.glassMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.4)'}; --glass-blur: blur(${userProfile.glassBlur??10}px); --glass-bg-modal: ${userProfile.glassMode === 'dark' ? `rgba(17, 24, 39, ${Math.min(1, (userProfile.glassOpacity??90)/100 + 0.1)})` : `rgba(255, 255, 255, ${Math.min(1, (userProfile.glassOpacity??90)/100 + 0.1)})`}; --glass-blur-modal: blur(${Math.min(40, (userProfile.glassBlur??10) + 8)}px); --ambient-bg: ${userProfile.glassMode === 'dark' ? `rgba(0,0,0,${(userProfile.ambientGlassOpacity??15)/100})` : `rgba(255,255,255,${(userProfile.ambientGlassOpacity??15)/100})`}; --ambient-blur: blur(${Math.min(20, (userProfile.glassBlur??10) + 4)}px); } .bg-custom-glass { background-color: var(--glass-bg); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); } .border-custom-glass { border-color: var(--glass-border); } .bg-custom-glass-modal { background-color: var(--glass-bg-modal); } .backdrop-blur-custom-modal { backdrop-filter: var(--glass-blur-modal); -webkit-backdrop-filter: var(--glass-blur-modal); } .bg-custom-ambient { background-color: var(--ambient-bg); } .backdrop-blur-custom-ambient { backdrop-filter: var(--ambient-blur); -webkit-backdrop-filter: var(--ambient-blur); } `}</style>
            <div className="min-h-screen flex font-sans text-gray-900 transition-colors duration-500 relative bg-transparent">
                {userProfile.ambientGlass && <div className="fixed inset-0 z-[1] pointer-events-none transition-all duration-500 bg-custom-ambient backdrop-blur-custom-ambient" />}
                <aside className={`w-64 border-r border-custom-glass hidden md:flex flex-col fixed h-full z-40 shadow-sm transition-all duration-300 bg-custom-glass`}>
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold transition-colors duration-300" style={{ backgroundColor: userProfile.themeColor }}>S</div>
                        <span className="font-bold text-xl tracking-tight text-gray-900">Sello UK Hub</span>
                    </div>
                    <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
                        {[ { id: 'products', icon: LayoutDashboard, label: t('nav_overview') }, { id: 'strategy', icon: Calculator, label: t('nav_strategy') }, { id: 'costs', icon: DollarSign, label: t('nav_costs') }, { id: 'promotions', icon: Tag, label: t('nav_promotions') }, { id: 'tools', icon: Wrench, label: t('nav_toolbox') }, { id: 'settings', icon: Settings, label: t('nav_config') }, { id: 'definitions', icon: BookOpen, label: t('nav_definitions') } ].map((item) => { const isActive = currentView === item.id; return ( <button key={item.id} onClick={() => setCurrentView(item.id as any)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${isActive ? 'bg-opacity-10' : 'text-gray-600 hover:bg-gray-50/50 hover:text-gray-900'}`} style={isActive ? { backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor } : {}} > <item.icon className="w-5 h-5" style={isActive ? { color: userProfile.themeColor } : {}} /> {item.label} </button> ); })}
                        {searchSessions.length > 0 && ( <div className="mt-6 pt-4 border-t border-gray-100/50"> <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2 flex items-center gap-2"> <History className="w-3 h-3" /> {t('active_searches')} </div> <div className="space-y-1"> {searchSessions.map(session => ( <div key={session.id} className="group relative flex items-center"> <button onClick={() => { setActiveSearchId(session.id); setCurrentView('search'); }} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all text-left overflow-hidden ${activeSearchId === session.id && currentView === 'search' ? 'bg-white/40 shadow-sm' : 'text-gray-600 hover:bg-gray-100/50'}`} style={activeSearchId === session.id && currentView === 'search' ? { backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor } : {}} > <Search className={`w-4 h-4 flex-shrink-0 ${activeSearchId === session.id && currentView === 'search' ? '' : 'opacity-70'}`} /> <span className="truncate pr-4 block w-full">{session.query}</span> </button> <button onClick={(e) => deleteSearchSession(session.id, e)} className="absolute right-1 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10" title="Close Search" > <X className="w-3 h-3" /> </button> </div> ))} </div> </div> )} 
                    </nav>
                    <div className="p-4 border-t border-custom-glass space-y-3">
                        <div className="px-2 space-y-2"> <button onClick={handleBackup} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100/50 transition-colors border border-transparent hover:border-custom-glass"><Download className="w-3.5 h-3.5" /> {t('backup_db')}</button> <button onClick={() => fileRestoreRef.current?.click()} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100/50 transition-colors border border-transparent hover:border-custom-glass"><Upload className="w-3.5 h-3.5" /> {t('restore_db')}</button> <input ref={fileRestoreRef} type="file" accept=".json" className="hidden" onChange={handleRestore} /> </div>
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-custom-glass"> <div className="flex justify-between items-center mb-1"><p className="text-xs font-semibold text-gray-500">{t('tool_status')}</p><span className="text-[10px] text-gray-400">v1.6.0</span></div> <div className={`flex items-center gap-2 text-sm ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>{isOnline ? <><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span> {t('system_online')}</> : <><WifiOff className="w-3 h-3" /> {t('offline_mode')}</>}</div> </div>
                    </div>
                </aside>
                <main className="flex-1 md:ml-64 p-8 min-w-0 relative z-10">
                    <header className="flex justify-between items-center mb-8 gap-8">
                        <div> <h1 className="text-2xl font-bold transition-colors" style={headerStyle}> {currentView === 'search' ? t('header_search') : currentView === 'products' ? t('header_products') : currentView === 'dashboard' ? t('header_dashboard') : currentView === 'strategy' ? t('header_strategy') : currentView === 'costs' ? t('header_costs') : currentView === 'definitions' ? t('header_definitions') : currentView === 'promotions' ? t('header_promotions') : currentView === 'tools' ? t('header_toolbox') : t('header_settings')} </h1> <p className="text-sm mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}> {currentView === 'search' ? t('desc_search') : currentView === 'dashboard' ? t('desc_dashboard') : currentView === 'strategy' ? t('desc_strategy') : currentView === 'products' ? t('desc_products') : currentView === 'costs' ? t('desc_costs') : currentView === 'definitions' ? t('desc_definitions') : currentView === 'promotions' ? t('desc_promotions') : currentView === 'tools' ? t('desc_toolbox') : t('desc_settings')} </p> </div>
                        <div className="flex-1 max-w-2xl"> <GlobalSearch onSearch={handleSearch} isLoading={isSearchLoading} platforms={Object.keys(pricingRules)} products={products} /> </div>
                        <div className="flex items-center gap-4"> {userProfile.name && <span className="text-sm font-semibold animate-in fade-in slide-in-from-top-2" style={headerStyle}>{t('hello')}, {userProfile.name}!</span>} {hasInventory && <QuickUploadMenu />} <button className="relative p-2 hover:opacity-70 transition-opacity" style={headerStyle}><Bell className="w-6 h-6" /></button> <div className="h-6 w-px" style={{ backgroundColor: `${headerTextColor}40` }}></div> <UserProfile profile={userProfile} onUpdate={setUserProfile} /> </div>
                    </header>
                    <div className="flex-1 overflow-y-auto no-scrollbar relative p-4 md:p-8">
                        {currentView === 'search' && activeSearch && ( <SearchResultsPage data={{ results: activeSearch.results, query: activeSearch.query, params: activeSearch.params, id: activeSearch.id }} products={products} pricingRules={pricingRules} themeColor={userProfile.themeColor} headerStyle={headerStyle} timeLabel={activeSearch.timeLabel} onRefine={handleRefineSearch} searchConfig={searchConfig} priceChangeHistory={priceChangeHistory} thresholds={thresholds} /> )}
                        {currentView === 'search' && !activeSearch && ( <div className="flex flex-col items-center justify-center h-full text-gray-400"> <Search className="w-12 h-12 mb-4 opacity-50" /> <p className="text-lg font-medium">Select a search from the sidebar or start a new one.</p> </div> )}
                        {currentView === 'products' && ( products.length === 0 ? ( <div className="flex flex-col items-center justify-center min-h-[500px] bg-custom-glass rounded-2xl border-2 border-dashed border-custom-glass text-center p-12 animate-in fade-in zoom-in duration-300 h-full"> <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm" style={{ backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor }}><Database className="w-10 h-10" /></div> <h3 className="text-2xl font-bold text-gray-900">Welcome to Sello UK Hub</h3> <p className="text-gray-500 max-w-lg mt-3 mb-10 text-lg">Let's get your dashboard set up. Please upload your company reports in the order below to initialize the system.</p> <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl relative"> <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative group ${hasInventory ? 'bg-green-50/50 border-green-200' : 'bg-gray-50/50 border-gray-200 hover:border-indigo-300'}`}> <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${hasInventory ? 'bg-green-600 text-white' : 'bg-white text-white'}`} style={!hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>{hasInventory ? 'Completed' : 'Step 1'}</div> <div className="p-4 bg-white rounded-full shadow-sm mb-4">{hasInventory ? <CheckCircle className="w-8 h-8 text-green-600" /> : <Database className="w-8 h-8" style={{ color: userProfile.themeColor }} />}</div> <h4 className="font-bold text-gray-900 text-lg">ERP Inventory Report</h4> <p className="text-sm text-gray-500 mt-2 text-center">Upload the 28-column ERP file to initialize Products, Stock Levels, COGS, and Categories.</p> <button onClick={() => setIsUploadModalOpen(true)} className={`mt-6 w-full py-3 bg-white border text-gray-700 font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${hasInventory ? 'border-green-300 text-green-700' : 'border-gray-300 hover:bg-opacity-5'}`} style={!hasInventory ? { borderColor: userProfile.themeColor, color: userProfile.themeColor } : {}}>{hasInventory ? 'Re-upload Inventory' : 'Upload Inventory'}</button> </div> <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative ${!hasInventory ? 'bg-gray-50/50 border-gray-200 opacity-60 cursor-not-allowed' : 'bg-custom-glass border-indigo-200 shadow-lg scale-105 z-10'}`}> <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${!hasInventory ? 'bg-gray-400 text-white' : 'text-white'}`} style={hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>Step 2</div> <div className="p-4 bg-white rounded-full shadow-sm mb-4"><FileBarChart className={`w-8 h-8 ${!hasInventory ? 'text-gray-400' : ''}`} style={hasInventory ? { color: userProfile.themeColor } : {}} /></div> <h4 className="font-bold text-gray-900 text-lg">Sales Transaction Report</h4> <p className="text-sm text-gray-500 mt-2 text-center">Once products are loaded, upload sales history to calculate Velocity, Fees, and Margins.</p> <button onClick={() => hasInventory && setIsSalesImportModalOpen(true)} disabled={!hasInventory} style={hasInventory ? { backgroundColor: userProfile.themeColor } : {}} className={`mt-6 w-full py-3 font-bold rounded-lg flex items-center justify-center gap-2 text-white transition-all ${!hasInventory ? 'bg-gray-300' : 'hover:opacity-90 shadow-lg'}`}><Upload className="w-5 h-5" /> Upload Sales</button> </div> </div> </div> ) : ( <ProductManagementPage products={products} pricingRules={pricingRules} promotions={promotions} priceHistoryMap={priceHistoryMap} refundHistory={refundHistory} priceChangeHistory={priceChangeHistory} onOpenMappingModal={() => setIsMappingModalOpen(true)} dateLabels={dynamicDateLabels} onUpdateProduct={(p) => setProducts(prev => prev.map(old => old.id === p.id ? p : old))} onViewElasticity={handleViewElasticity} themeColor={userProfile.themeColor} headerStyle={headerStyle} onAnalyze={handleAnalyze} onDeepDive={handleDeepDiveRequest} thresholds={thresholds} /> ) )}
                        {currentView === 'strategy' && (<StrategyPage products={products} pricingRules={pricingRules} currentConfig={strategyRules} onSaveConfig={(newConfig: StrategyConfig) => { setStrategyRules(newConfig); setCurrentView('products'); }} themeColor={userProfile.themeColor} headerStyle={headerStyle} priceHistoryMap={priceHistoryMap} promotions={promotions} priceChangeHistory={priceChangeHistory} velocityLookback={velocityLookback} />)}
                        {currentView === 'costs' && (<CostManagementPage products={products} themeColor={userProfile.themeColor} headerStyle={headerStyle} />)}
                        {currentView === 'promotions' && (<PromotionPage products={products} pricingRules={pricingRules} logisticsRules={logisticsRules} promotions={promotions} priceHistoryMap={priceHistoryMap} onAddPromotion={(p) => setPromotions(prev => [...prev, p])} onUpdatePromotion={(p) => setPromotions(prev => prev.map(o => o.id === p.id ? p : o))} onDeletePromotion={(id) => setPromotions(prev => prev.filter(p => p.id !== id))} themeColor={userProfile.themeColor} headerStyle={headerStyle} />)}
                        {currentView === 'tools' && (
                            <ToolboxPage 
                                promotions={promotions} 
                                pricingRules={pricingRules} 
                                inventoryTemplates={inventoryTemplates} 
                                onSaveTemplates={setInventoryTemplates} 
                                products={products} 
                                themeColor={userProfile.themeColor} 
                                headerStyle={headerStyle} 
                            />
                        )}
                        {currentView === 'definitions' && (<DefinitionsPage headerStyle={headerStyle} />)}
                        {currentView === 'settings' && (
                            <SettingsPage 
                                currentRules={pricingRules} 
                                onSave={(newRules, newVelocity, newSearchConfig) => { 
                                    setPricingRules(newRules); 
                                    setVelocityLookback(newVelocity); 
                                    if (newSearchConfig) setSearchConfig(newSearchConfig);
                                    localStorage.setItem('sello_velocity_setting', newVelocity);
                                    handleRecalculateVelocity(newVelocity, priceHistory);
                                }} 
                                logisticsRules={logisticsRules} 
                                onSaveLogistics={(newLogistics) => { setLogisticsRules(newLogistics); }} 
                                products={products} 
                                shipmentHistory={shipmentHistory} 
                                themeColor={userProfile.themeColor} 
                                headerStyle={headerStyle} 
                                searchConfig={searchConfig} 
                                velocityLookback={velocityLookback} 
                                extraData={{ priceHistory, promotions }}
                                onRefreshThresholds={handleRefreshThresholds}
                            />
                        )}
                    </div>
                </main>
                {isUploadModalOpen && <BatchUploadModal products={products} onClose={() => setIsUploadModalOpen(false)} onConfirm={handleInventoryImport} />}
                {isSalesImportModalOpen && <SalesImportModal products={products} pricingRules={pricingRules} learnedAliases={learnedAliases} onClose={() => setIsSalesImportModalOpen(false)} onResetData={handleResetSalesData} onConfirm={handleSalesImportConfirm} />}
                {isSkuDetailModalOpen && <SkuDetailUploadModal products={products} onClose={() => setIsSkuDetailModalOpen(false)} onConfirm={handleSkuDetailImport} />}
                {isCostUploadModalOpen && <CostUploadModal onClose={() => setIsCostUploadModalOpen(false)} onConfirm={() => {}} />} {/* Deprecated but kept for type safety if needed */}
                {isMappingModalOpen && <MappingUploadModal products={products} platforms={Object.keys(pricingRules)} learnedAliases={learnedAliases} onClose={() => setIsMappingModalOpen(false)} onConfirm={handleMappingImport} />}
                {isReturnsModalOpen && <ReturnsUploadModal onClose={() => setIsReturnsModalOpen(false)} onConfirm={handleReturnsImport} onReset={handleResetRefunds} existingOrders={existingOrders} />}
                {isCAUploadModalOpen && <CAUploadModal onClose={() => setIsCAUploadModalOpen(false)} onConfirm={handleCAImport} />}
                {isShipmentModalOpen && <ShipmentUploadModal products={products} onClose={() => setIsShipmentModalOpen(false)} onConfirm={handleShipmentImport} />}
                {selectedElasticityProduct && ( <PriceElasticityModal product={selectedElasticityProduct} priceHistory={priceHistory} priceChangeHistory={priceChangeHistory} onClose={() => setSelectedElasticityProduct(null)} /> )}
                {selectedAnalysisProduct && ( <AnalysisModal product={selectedAnalysisProduct} analysis={analysisResult} isLoading={isAnalysisLoading} onClose={() => { setSelectedAnalysisProduct(null); setAnalysisResult(null); }} onApplyPrice={handleApplyPrice} themeColor={userProfile.themeColor} /> )}
            </div>
        </>
    );
};

export default App;
