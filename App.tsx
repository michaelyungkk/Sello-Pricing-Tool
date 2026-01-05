


// ... existing imports ...
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { INITIAL_PRODUCTS, MOCK_PRICE_HISTORY, MOCK_PROMOTIONS, DEFAULT_PRICING_RULES, DEFAULT_LOGISTICS_RULES, DEFAULT_STRATEGY_RULES, DEFAULT_SEARCH_CONFIG, VAT_MULTIPLIER } from './constants';
import { Product, PricingRules, PriceLog, PromotionEvent, UserProfile as UserProfileType, ChannelData, LogisticsRule, ShipmentLog, StrategyConfig, VelocityLookback, RefundLog, ShipmentDetail, HistoryPayload, PriceChangeRecord, AnalysisResult, SearchChip, SearchConfig, SkuCostDetail } from './types';

// Components
import ProductList from './components/ProductList';
import ProductManagementPage from './components/ProductManagementPage';
import StrategyPage from './components/StrategyPage';
import CostManagementPage from './components/CostManagementPage';
import PromotionPage from './components/PromotionPage';
import ToolboxPage from './components/ToolboxPage';
import DefinitionsPage from './components/DefinitionsPage';
import SettingsPage from './components/SettingsPage';
import SearchResultsPage from './components/SearchResultsPage';
import GlobalSearch from './components/GlobalSearch';
import UserProfile from './components/UserProfile';

// Modals
import BatchUploadModal from './components/BatchUploadModal';
import SalesImportModal from './components/SalesImportModal';
import CostUploadModal from './components/CostUploadModal';
import MappingUploadModal from './components/MappingUploadModal';
import ReturnsUploadModal from './components/ReturnsUploadModal';
import CAUploadModal from './components/CAUploadModal';
import ShipmentUploadModal from './components/ShipmentUploadModal';
import PriceElasticityModal from './components/PriceElasticityModal';
import AnalysisModal from './components/AnalysisModal';
import SkuDetailUploadModal from './components/SkuDetailUploadModal'; // Imported

// Services & Utils
import { analyzePriceAdjustment, parseSearchQuery, SearchIntent } from './services/geminiService';
import { LayoutDashboard, Settings, Bell, Upload, FileBarChart, DollarSign, BookOpen, Tag, Wifi, WifiOff, Database, CheckCircle, ArrowRight, Package, Download, Calculator, RotateCcw, List, UploadCloud, ChevronDown, Ship, Link as LinkIcon, Loader2, Wrench, Search, X, History, FileText } from 'lucide-react';
import { get, set, del } from 'idb-keyval';

// --- LOGIC HELPERS --- (Keep existing)
const safeCalculateMargin = (p: Product | undefined, price: number): number => {
    if (!p || !price || isNaN(price)) return 0;
    const totalCost = (Number(p.costPrice) || 0) +
        (Number(p.sellingFee) || 0) +
        (Number(p.adsFee) || 0) +
        (Number(p.postage) || 0) +
        (Number(p.otherFee) || 0) +
        (Number(p.subscriptionFee) || 0) +
        (Number(p.wmsFee) || 0);

    const totalIncome = price + (Number(p.extraFreight) || 0);
    const netProfit = totalIncome - totalCost;
    const margin = price > 0 ? (netProfit / price) * 100 : 0;
    return isNaN(margin) ? 0 : margin;
};
// ... (Keep existing helpers)
const calculateMargin = safeCalculateMargin;
const calculateOptimalPrice = (sku: string, currentHistory: PriceLog[]): number => {
    if (!Array.isArray(currentHistory)) return 0;
    const logs = currentHistory.filter(l => l.sku === sku);
    if (logs.length === 0) return 0;
    let bestPrice = 0;
    let maxDailyProfit = -Infinity;
    logs.forEach(log => {
        const price = Number(log.price) || 0;
        const margin = Number(log.margin) || 0;
        const velocity = Number(log.velocity) || 0;
        const profitPerUnit = price * (margin / 100);
        const dailyProfit = profitPerUnit * velocity;
        if (!isNaN(dailyProfit) && dailyProfit > maxDailyProfit) {
            maxDailyProfit = dailyProfit;
            bestPrice = price;
        }
    });
    return bestPrice > 0 ? bestPrice : (Number(logs[0].price) || 0);
};
const getFridayThursdayRanges = (anchorDate: Date = new Date()) => {
    const currentDay = anchorDate.getDay(); 
    const diff = (currentDay + 2) % 7;
    const currentStart = new Date(anchorDate);
    currentStart.setDate(anchorDate.getDate() - diff);
    currentStart.setHours(0, 0, 0, 0);
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + 6);
    currentEnd.setHours(23, 59, 59, 999);
    const lastStart = new Date(currentStart);
    lastStart.setDate(lastStart.getDate() - 7);
    const lastEnd = new Date(lastStart);
    lastEnd.setDate(lastEnd.getDate() + 6);
    lastEnd.setHours(23, 59, 59, 999);
    return { current: { start: currentStart, end: currentEnd }, last: { start: lastStart, end: lastEnd } };
};
const formatDateShort = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

interface SearchSession {
    id: string;
    query: string;
    results: any[];
    params: any;
    explanation?: string;
    timeLabel?: string;
    timestamp: number;
}

const App: React.FC = () => {
    // ... (Keep existing state & effects)
    const [isDataLoaded, setIsDataLoaded] = useState(false);
    const [products, setProducts] = useState<Product[]>([]);
    const [priceHistory, setPriceHistory] = useState<PriceLog[]>([]);
    const [refundHistory, setRefundHistory] = useState<RefundLog[]>([]);
    const [shipmentHistory, setShipmentHistory] = useState<ShipmentLog[]>([]);
    const [priceChangeHistory, setPriceChangeHistory] = useState<PriceChangeRecord[]>([]);
    const [promotions, setPromotions] = useState<PromotionEvent[]>(MOCK_PROMOTIONS);
    const [learnedAliases, setLearnedAliases] = useState<Record<string, string>>({});
    const [pricingRules, setPricingRules] = useState<PricingRules>(DEFAULT_PRICING_RULES);
    const [logisticsRules, setLogisticsRules] = useState<LogisticsRule[]>(DEFAULT_LOGISTICS_RULES);
    const [strategyRules, setStrategyRules] = useState<StrategyConfig>(DEFAULT_STRATEGY_RULES);
    const [searchConfig, setSearchConfig] = useState<SearchConfig>(DEFAULT_SEARCH_CONFIG);
    const [velocityLookback, setVelocityLookback] = useState<VelocityLookback>('30');
    const [userProfile, setUserProfile] = useState<UserProfileType>({
        name: '', themeColor: '#4f46e5', backgroundImage: '', backgroundColor: '#f3f4f6', glassMode: 'light', glassOpacity: 90, glassBlur: 10, ambientGlass: true, ambientGlassOpacity: 15
    });

    // ... (Keep loading and storage effects)
    
    // --- DATABASE LOADING & SYNC LOGIC (HIDDEN FOR BREVITY) ---
    useEffect(() => {
        const loadData = async () => {
            try {
                const loadHeavy = async (key: string, fallback: any) => { const idbData = await get(key); if (idbData) return idbData; const lsData = localStorage.getItem(key); if (lsData) { try { const parsed = JSON.parse(lsData); await set(key, parsed); localStorage.removeItem(key); return parsed; } catch (e) {} } return fallback; };
                const [p, h, r, s, prom, aliases, changes] = await Promise.all([ loadHeavy('sello_products', []), loadHeavy('sello_price_history', []), loadHeavy('sello_refund_history', []), loadHeavy('sello_shipment_history', []), loadHeavy('sello_promotions', MOCK_PROMOTIONS), loadHeavy('sello_learned_aliases', {}), loadHeavy('sello_price_change_history', []) ]);
                setProducts(p); setPriceHistory(h); setRefundHistory(r); setShipmentHistory(s); setPromotions(prom); setLearnedAliases(aliases); setPriceChangeHistory(changes);
                const loadLS = (key: string, fallback: any) => { const saved = localStorage.getItem(key); return saved ? JSON.parse(saved) : fallback; };
                setPricingRules(loadLS('sello_rules', DEFAULT_PRICING_RULES)); setLogisticsRules(loadLS('sello_logistics', DEFAULT_LOGISTICS_RULES)); setStrategyRules(loadLS('sello_strategy', DEFAULT_STRATEGY_RULES)); setVelocityLookback(localStorage.getItem('sello_velocity_setting') as VelocityLookback || '30'); setUserProfile(loadLS('sello_user_profile', { name: '', themeColor: '#4f46e5', backgroundImage: '', backgroundColor: '#f3f4f6', glassMode: 'light', glassOpacity: 90, glassBlur: 10, ambientGlass: true, ambientGlassOpacity: 15 }));
                setSearchConfig(loadLS('sello_search_config', DEFAULT_SEARCH_CONFIG));
                setIsDataLoaded(true);
            } catch (err) { console.error("Critical error loading data", err); setIsDataLoaded(true); }
        };
        loadData();
    }, []);
    const IDB_KEYS = ['sello_products', 'sello_price_history', 'sello_refund_history', 'sello_shipment_history', 'sello_promotions', 'sello_learned_aliases', 'sello_price_change_history'];
    const syncToStorage = async (key: string, data: any) => { if (!isDataLoaded) return; try { if (IDB_KEYS.includes(key)) { await set(key, data); } else { localStorage.setItem(key, typeof data === 'string' ? data : JSON.stringify(data)); } } catch (e) { console.error(`Storage sync failed for ${key}`, e); } };
    useEffect(() => { if (isDataLoaded) { const handler = setTimeout(() => { syncToStorage('sello_products', products); }, 1000); return () => clearTimeout(handler); } }, [products, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) syncToStorage('sello_rules', pricingRules); }, [pricingRules, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) syncToStorage('sello_logistics', logisticsRules); }, [logisticsRules, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) syncToStorage('sello_strategy', strategyRules); }, [strategyRules, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) syncToStorage('sello_search_config', searchConfig); }, [searchConfig, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) { const handler = setTimeout(() => { syncToStorage('sello_price_history', priceHistory); }, 2000); return () => clearTimeout(handler); } }, [priceHistory, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) { const handler = setTimeout(() => { syncToStorage('sello_refund_history', refundHistory); }, 1000); return () => clearTimeout(handler); } }, [refundHistory, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) { const handler = setTimeout(() => { syncToStorage('sello_shipment_history', shipmentHistory); }, 1000); return () => clearTimeout(handler); } }, [shipmentHistory, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) syncToStorage('sello_promotions', promotions); }, [promotions, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) syncToStorage('sello_user_profile', userProfile); }, [userProfile, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) syncToStorage('sello_velocity_setting', velocityLookback); }, [velocityLookback, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) { const handler = setTimeout(() => { syncToStorage('sello_learned_aliases', learnedAliases); }, 1000); return () => clearTimeout(handler); } }, [learnedAliases, isDataLoaded]);
    useEffect(() => { if (isDataLoaded) { const handler = setTimeout(() => { syncToStorage('sello_price_change_history', priceChangeHistory); }, 1000); return () => clearTimeout(handler); } }, [priceChangeHistory, isDataLoaded]);
    useEffect(() => { if (!isDataLoaded) return; const elements = [document.body, document.documentElement]; elements.forEach(el => { el.style.background = ''; el.style.backgroundColor = ''; el.style.backgroundImage = ''; if (userProfile.backgroundImage && userProfile.backgroundImage !== 'none') { const isUrl = userProfile.backgroundImage.startsWith('http') || userProfile.backgroundImage.startsWith('data:') || userProfile.backgroundImage.startsWith('/'); el.style.backgroundImage = isUrl ? `url(${userProfile.backgroundImage})` : userProfile.backgroundImage; el.style.backgroundColor = 'transparent'; el.style.backgroundSize = 'cover'; el.style.backgroundPosition = 'center'; el.style.backgroundAttachment = 'fixed'; el.style.backgroundRepeat = 'no-repeat'; } else { el.style.backgroundImage = 'none'; el.style.backgroundColor = userProfile.backgroundColor || '#f3f4f6'; } }); }, [userProfile, isDataLoaded]);
    useEffect(() => { if (!isDataLoaded || priceHistory.length === 0) return; const seenPlatforms = new Map<string, Set<string>>(); priceHistory.forEach(l => { const key = `${l.sku}|${l.date}`; if (!seenPlatforms.has(key)) seenPlatforms.set(key, new Set()); seenPlatforms.get(key)!.add(l.platform || 'General'); }); let hasDuplicates = false; const cleaned = priceHistory.filter(l => { const key = `${l.sku}|${l.date}`; const platforms = seenPlatforms.get(key); if (platforms && platforms.size > 1 && (l.platform === 'General' || !l.platform)) { hasDuplicates = true; return false; } return true; }); if (hasDuplicates) setPriceHistory(cleaned); }, [priceHistory.length, isDataLoaded]);
    const latestHistoryDate = useMemo(() => { if (priceHistory.length === 0) return new Date(); let maxTs = 0; priceHistory.forEach(p => { const ts = new Date(p.date).getTime(); if (!isNaN(ts) && ts > maxTs) maxTs = ts; }); return maxTs > 0 ? new Date(maxTs) : new Date(); }, [priceHistory]);
    const weekRanges = useMemo(() => getFridayThursdayRanges(latestHistoryDate), [latestHistoryDate]);
    const dynamicDateLabels = useMemo(() => ({ current: `${formatDateShort(weekRanges.current.start)} - ${formatDateShort(weekRanges.current.end)}`, last: `${formatDateShort(weekRanges.last.start)} - ${formatDateShort(weekRanges.last.end)}` }), [weekRanges]);
    const priceHistoryMap = useMemo(() => { const map = new Map<string, PriceLog[]>(); priceHistory.forEach(l => { if (!map.has(l.sku)) map.set(l.sku, []); map.get(l.sku)!.push(l); }); return map; }, [priceHistory]);
    const refundHistoryMap = useMemo(() => { const map = new Map<string, RefundLog[]>(); refundHistory.forEach(r => { if (!map.has(r.sku)) map.set(r.sku, []); map.get(r.sku)!.push(r); }); return map; }, [refundHistory]);

    // ... (State)
    const [selectedElasticityProduct, setSelectedElasticityProduct] = useState<Product | null>(null);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isSalesImportModalOpen, setIsSalesImportModalOpen] = useState(false);
    const [isCostUploadModalOpen, setIsCostUploadModalOpen] = useState(false);
    const [isSkuDetailModalOpen, setIsSkuDetailModalOpen] = useState(false); // New Modal State
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

    // ... (processDataForSearch logic)
    const processDataForSearch = (intent: SearchIntent, products: Product[], priceHistory: PriceLog[], pricingRules: PricingRules, refundHistory: RefundLog[]) => {
       const productMap = new Map(products.map(p => [p.sku, p]));

       // 1. REFUND SEARCH (Standard, no changes)
       if (intent.targetData === 'refunds') {
           const results: any[] = [];
           refundHistory.forEach(r => {
               const p = productMap.get(r.sku);
               results.push({ sku: r.sku, productName: p?.name || 'Unknown', platform: r.platform || 'Unknown', date: r.date, price: -r.amount, velocity: r.quantity, margin: -100, type: 'REFUND' });
           });
           return { results, timeLabel: 'All Refunds' };
       }

       // 2. INVENTORY SEARCH (Current Snapshot - Simple Filtering)
       if (intent.targetData === 'inventory') {
           const results: any[] = [];
           products.forEach(p => {
               const derivedMetrics: any = { daysRemaining: p.averageDailySales > 0 ? p.stockLevel / p.averageDailySales : 999, velocityChange: p.previousDailySales && p.previousDailySales > 0 ? ((p.averageDailySales - p.previousDailySales) / p.previousDailySales) * 100 : 0 };
               const pass = intent.filters.every(f => {
                   let val = (p as any)[f.field];
                   if (val === undefined) val = derivedMetrics[f.field];
                   const criteria = Number(f.value) || f.value;
                   if (f.operator === 'CONTAINS') return String(val).toLowerCase().includes(String(criteria).toLowerCase());
                   if (f.operator === '=') return String(val).toLowerCase() === String(criteria).toLowerCase();
                   if (f.operator === '>') return val > criteria;
                   if (f.operator === '<') return val < criteria;
                   if (f.operator === '>=') return val >= criteria;
                   if (f.operator === '<=') return val <= criteria;
                   return val == criteria;
               });
               if (!pass) return;
               
               results.push({ 
                   sku: p.sku, 
                   productName: p.name, 
                   platform: p.channels.length > 0 ? p.channels[0].platform : 'General', 
                   channels: p.channels, // Pass Full Channels for Hierarchy Breakdown
                   date: new Date().toISOString(), 
                   price: p.currentPrice, 
                   velocity: p.stockLevel, // Use Stock Level as 'velocity' for aggregation in search results
                   revenue: p.stockLevel * p.currentPrice, // Use Stock Value as 'revenue' for aggregation
                   margin: safeCalculateMargin(p, p.currentPrice), 
                   stockLevel: p.stockLevel, 
                   averageDailySales: p.averageDailySales, // Keep explicit for detail rows
                   daysRemaining: derivedMetrics.daysRemaining, 
                   velocityChange: derivedMetrics.velocityChange, 
                   type: 'INVENTORY' 
               });
           });
           if (intent.sort) {
               results.sort((a, b) => {
                   const field = intent.sort!.field;
                   const valA = a[field] || 0;
                   const valB = b[field] || 0;
                   return intent.sort!.direction === 'asc' ? valA - valB : valB - valA;
               });
           }
           if (intent.limit && intent.limit > 0) { return { results: results.slice(0, intent.limit), timeLabel: 'Current Snapshot' }; }
           return { results, timeLabel: 'Current Snapshot' };
       }

       // 3. PERFORMANCE SEARCH (Transactions)
       let startTime = 0; let endTime = Number.MAX_SAFE_INTEGER; let timeLabel = "All Time";
       if (intent.timeRange) {
           const now = new Date();
           if (intent.timeRange.type === 'relative' && intent.timeRange.value.endsWith('d')) { const days = parseInt(intent.timeRange.value); const start = new Date(); start.setDate(now.getDate() - days); startTime = start.getTime(); endTime = now.getTime(); timeLabel = `Last ${days} Days`; } 
           else if (intent.timeRange.type === 'absolute') { const val = intent.timeRange.value; const date = new Date(val); if (!isNaN(date.getTime())) { startTime = date.getTime(); timeLabel = `Since ${val}`; } }
       } else { const start = new Date(); start.setDate(start.getDate() - 30); startTime = start.getTime(); endTime = Date.now(); timeLabel = "Last 30 Days (Default)"; }

       const candidates: any[] = [];
       const skuTotals: Record<string, number> = {};
       let grandTotalRevenue = 0;

       priceHistory.forEach(log => {
         const product = productMap.get(log.sku);
         if (!product) return;
         const logTime = new Date(log.date).getTime();
         if (logTime < startTime || logTime > endTime) return;

         let margin = log.margin;
         let type = 'TRANSACTION';
         const revenue = log.price * log.velocity;
         
         const adsSpend = log.adsSpend !== undefined ? log.adsSpend : (product.adsFee || 0) * log.velocity;
         
         // --- FIX: Handle 0 Revenue but Active Costs (TACoS / Ad Spend) ---
         if (log.price === 0 && adsSpend > 0) {
             type = 'AD_COST';
             margin = -Infinity; // Undefined mathematical margin
         }
         else if (margin === undefined || margin === null) {
           const totalCost = (product.costPrice || 0) + (product.sellingFee || 0) + (product.adsFee || 0) + (product.postage || 0) + (product.otherFee || 0);
           const netProfit = log.price - totalCost;
           margin = log.price > 0 ? (netProfit / log.price) * 100 : 0;
         }

         const tacos = revenue > 0 ? (adsSpend / revenue) * 100 : 0;
         
         const calculatedMetrics: any = {
             revenue, margin, adsSpend, tacos,
             profit: log.profit || (revenue * ((margin || 0)/100)),
             returnRate: product.returnRate || 0,
             stockLevel: product.stockLevel,
             daysRemaining: product.averageDailySales > 0 ? product.stockLevel / product.averageDailySales : 999,
             velocityChange: product.previousDailySales && product.previousDailySales > 0 ? ((product.averageDailySales - product.previousDailySales) / product.previousDailySales) * 100 : 0
         };

         // For Ad-Only rows (Zero Revenue, Positive Spend)
         // Profit = -Spend (Contribution)
         if (log.price === 0 && adsSpend > 0) {
             calculatedMetrics.profit = -adsSpend;
         }

         const pass = intent.filters.every(f => {
             let val: any = (log as any)[f.field];
             if (calculatedMetrics[f.field] !== undefined) val = calculatedMetrics[f.field];
             else if (val === undefined) val = (product as any)[f.field];
             const criteria = Number(f.value);
             const strCriteria = String(f.value).toLowerCase();
             const valStr = String(val).toLowerCase();
             if (f.operator === 'CONTAINS') return valStr.includes(strCriteria);
             if (f.operator === '=') return valStr === strCriteria || val == f.value;
             if (f.operator === '>') return val > criteria;
             if (f.operator === '<') return val < criteria;
             if (f.operator === '>=') return val >= criteria;
             if (f.operator === '<=') return val <= criteria;
             return true;
         });

         if (pass) {
           grandTotalRevenue += revenue;
           const sortField = intent.sort?.field || 'revenue';
           const sortVal = calculatedMetrics[sortField] || revenue;
           if (!skuTotals[log.sku]) skuTotals[log.sku] = 0;
           skuTotals[log.sku] += sortVal;

           candidates.push({
             sku: product.sku,
             productName: product.name,
             platform: log.platform || 'Unknown',
             date: log.date,
             price: log.price,
             velocity: log.velocity,
             revenue: calculatedMetrics.revenue,
             profit: calculatedMetrics.profit,
             margin: calculatedMetrics.margin,
             adsSpend: calculatedMetrics.adsSpend,
             tacos: calculatedMetrics.tacos,
             stockLevel: calculatedMetrics.stockLevel,
             daysRemaining: calculatedMetrics.daysRemaining,
             velocityChange: calculatedMetrics.velocityChange,
             returnRate: calculatedMetrics.returnRate,
             type: type
           });
         }
       });

       // --- PASS 2: IDENTIFY TOP SKUS ---
       let validSkus = new Set<string>();
       if (intent.limit && intent.limit > 0) {
           const sortedSkus = Object.entries(skuTotals).sort(([, a], [, b]) => (intent.sort?.direction === 'asc' ? a - b : b - a)).slice(0, intent.limit).map(([sku]) => sku);
           validSkus = new Set(sortedSkus);
       } else { validSkus = new Set(Object.keys(skuTotals)); }

       // --- PASS 3: FINALIZE RESULTS ---
       const results: any[] = [];
       candidates.forEach(cand => {
           if (validSkus.has(cand.sku)) {
               const contribution = grandTotalRevenue > 0 ? (cand.revenue / grandTotalRevenue) * 100 : 0;
               results.push({ ...cand, contribution: contribution });
           }
       });

       if (intent.sort) {
           results.sort((a, b) => {
               const field = intent.sort!.field;
               const valA = a[field] || 0;
               const valB = b[field] || 0;
               return intent.sort!.direction === 'asc' ? valA - valB : valB - valA;
           });
       }
       return { results, timeLabel };
     };

    // ... (handleSearch and remaining component code)
    const handleSearch = async (queryOrChips: string | SearchChip[]) => {
// ... existing handleSearch implementation
       let rawText = "";
       if (typeof queryOrChips === 'string') { rawText = queryOrChips; } 
       else { const chips = queryOrChips; const metrics = chips.filter(c => c.type === 'METRIC').map(c => c.label).join(' '); const conditions = chips.filter(c => c.type === 'CONDITION').map(c => c.label).join(' '); const platforms = chips.filter(c => c.type === 'PLATFORM').map(c => `on ${c.label}`).join(' '); const text = chips.filter(c => c.type === 'TEXT').map(c => c.value).join(' '); const time = chips.filter(c => c.type === 'TIME').map(c => c.label).join(' '); rawText = `${time} ${conditions} ${metrics} ${platforms} ${text}`.trim(); }
       setIsSearchLoading(true);
       try {
         const intent = await parseSearchQuery(rawText);
         const { results, timeLabel } = processDataForSearch(intent, products, priceHistory, pricingRules, refundHistory);
         const newSession: SearchSession = { id: `search-${Date.now()}`, query: rawText, results: results || [], params: intent, explanation: intent.explanation, timeLabel: timeLabel, timestamp: Date.now() };
         setSearchSessions(prev => [newSession, ...prev]); setActiveSearchId(newSession.id); setCurrentView('search');
       } catch(e) { console.error("Search failed", e); } finally { setIsSearchLoading(false); }
    };
    // ... existing rest of component
    const handleRefineSearch = (sessionId: string, newIntent: SearchIntent) => { setIsSearchLoading(true); setTimeout(() => { const { results, timeLabel } = processDataForSearch(newIntent, products, priceHistory, pricingRules, refundHistory); setSearchSessions(prev => prev.map(s => { if (s.id === sessionId) { return { ...s, results, params: newIntent, timeLabel }; } return s; })); setIsSearchLoading(false); }, 150); };
    const deleteSearchSession = (id: string, e: React.MouseEvent) => { e.stopPropagation(); setSearchSessions(prev => prev.filter(s => s.id !== id)); if (activeSearchId === id) { setActiveSearchId(null); setCurrentView('products'); } };
    const handleViewElasticity = (product: Product) => { setSelectedElasticityProduct(product); };
    const handleAnalyze = async (product: Product, context?: string) => { const platformName = product.platform || (product.channels && product.channels.length > 0 ? product.channels[0].platform : 'General'); const platformRule = pricingRules[platformName] || { markup: 0, commission: 15, manager: 'General', isExcluded: false }; setSelectedAnalysisProduct(product); setAnalysisResult(null); setIsAnalysisLoading(true); try { const result = await analyzePriceAdjustment(product, platformRule, context); setAnalysisResult(result); } catch (error) { console.error("Analysis failed in App:", error); } finally { setIsAnalysisLoading(false); } };
    const handleApplyPrice = (productId: string, newPrice: number) => { setProducts(prev => { const productToUpdate = prev.find(p => p.id === productId); if (!productToUpdate) { return prev; } const oldPrice = productToUpdate.caPrice || (productToUpdate.currentPrice * VAT_MULTIPLIER); const change: PriceChangeRecord = { id: `chg-${Date.now()}-${productToUpdate.sku}`, sku: productToUpdate.sku, productName: productToUpdate.name, date: new Date().toISOString().split('T')[0], oldPrice: oldPrice, newPrice: newPrice, changeType: newPrice > oldPrice ? 'INCREASE' : 'DECREASE', percentChange: oldPrice > 0 ? ((newPrice - oldPrice) / oldPrice) * 100 : 100 }; setPriceChangeHistory(prevHistory => [...prevHistory, change]); return prev.map(p => { if (p.id !== productId) { return p; } return Object.assign({}, p, { caPrice: newPrice, lastUpdated: new Date().toISOString().split('T')[0] }); }); }); setSelectedAnalysisProduct(null); setAnalysisResult(null); };
    const handleBackup = () => { const data = { products, priceHistory, refundHistory, shipmentHistory, priceChangeHistory, promotions, learnedAliases, pricingRules, logisticsRules, strategyRules, searchConfig, velocityLookback, userProfile, exportDate: new Date().toISOString() }; const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `sello_backup_${new Date().toISOString().slice(0, 10)}.json`; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url); };
    const handleRestore = (e: React.ChangeEvent<HTMLInputElement>) => { const file = e.target.files?.[0]; if (!file) return; const reader = new FileReader(); reader.onload = async (event) => { try { const json = JSON.parse(event.target?.result as string); if (!json.products) throw new Error("Invalid backup file format"); if (json.products) setProducts(json.products); if (json.priceHistory) setPriceHistory(json.priceHistory); if (json.refundHistory) setRefundHistory(json.refundHistory); if (json.shipmentHistory) setShipmentHistory(json.shipmentHistory); if (json.priceChangeHistory) setPriceChangeHistory(json.priceChangeHistory); if (json.promotions) setPromotions(json.promotions); if (json.learnedAliases) setLearnedAliases(json.learnedAliases); if (json.pricingRules) setPricingRules(json.pricingRules); if (json.logisticsRules) setLogisticsRules(json.logisticsRules); if (json.strategyRules) setStrategyRules(json.strategyRules); if (json.searchConfig) setSearchConfig(json.searchConfig); if (json.velocityLookback) setVelocityLookback(json.velocityLookback); if (json.userProfile) setUserProfile(json.userProfile); alert("Database restored successfully!"); } catch (err) { console.error("Restore failed", err); alert("Failed to restore database. Invalid file format."); } }; reader.readAsText(file); if (fileRestoreRef.current) fileRestoreRef.current.value = ''; };
    
    // --- QUICK UPLOAD MENU ---
    const QuickUploadMenu = () => { 
        const [isOpen, setIsOpen] = useState(false); 
        const menuRef = useRef<HTMLDivElement>(null); 
        useEffect(() => { const handleClickOutside = (event: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(event.target as Node)) { setIsOpen(false); } }; document.addEventListener('mousedown', handleClickOutside); return () => document.removeEventListener('mousedown', handleClickOutside); }, []); 
        const actions = [ 
            { label: 'Import Inventory', icon: Database, action: () => setIsUploadModalOpen(true), color: 'text-indigo-600' }, 
            { label: 'Import Sales', icon: FileBarChart, action: () => setIsSalesImportModalOpen(true), color: 'text-blue-600' }, 
            { label: 'Import Refunds', icon: RotateCcw, action: () => setIsReturnsModalOpen(true), color: 'text-red-600' }, 
            { label: 'SKU Detail', icon: FileText, action: () => setIsSkuDetailModalOpen(true), color: 'text-teal-600' }, // New Action
            { label: 'CA Report', icon: Upload, action: () => setIsCAUploadModalOpen(true), color: 'text-purple-600' }, 
            { label: 'SKU Mapping', icon: LinkIcon, action: () => setIsMappingModalOpen(true), color: 'text-amber-600' }, 
            { label: 'Shipment Import', icon: Ship, action: () => setIsShipmentModalOpen(true), color: 'text-teal-600' }, 
            // Removed manual cost update 
        ]; 
        return ( <div className="relative z-50" ref={menuRef}> <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-all font-medium" style={{ backgroundColor: userProfile.themeColor }}> <UploadCloud className="w-4 h-4" /> <span className="hidden md:inline">Upload Data</span> <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} /> </button> {isOpen && ( <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right"> <div className="p-2 grid gap-1"> {actions.map((item) => ( <button key={item.label} onClick={() => { item.action(); setIsOpen(false); }} className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors text-left w-full group" > <div className={`p-1.5 rounded-md bg-gray-50 group-hover:bg-white border border-gray-100 group-hover:shadow-sm transition-all ${item.color}`}> <item.icon className="w-4 h-4" /> </div> <span className="font-medium">{item.label}</span> </button> ))} </div> </div> )} </div> ); 
    };
    
    const headerTextColor = userProfile.textColor || '#111827';
    const textShadowStyle = userProfile.backgroundImage && userProfile.backgroundImage !== 'none' ? { textShadow: '0 1px 3px rgba(0,0,0,0.3)' } : {};
    const headerStyle = { color: headerTextColor, ...textShadowStyle };
    const hasInventory = products.length > 0;
    const activeSearch = searchSessions.find(s => s.id === activeSearchId);

    // ... (Rest of component remains unchanged)
    
    // --- SALES IMPORT CONFIRM ---
    const handleSalesImportConfirm = (
        updatedProducts: Product[],
        newDateLabels?: { current: string, last: string },
        historyPayload?: HistoryPayload[],
        newShipmentLogs?: ShipmentLog[],
        discoveredPlatforms?: string[]
    ) => {
        setProducts(prev => {
            const updateMap = new Map(updatedProducts.map(p => [p.id, p]));
            return prev.map(p => updateMap.get(p.id) || p);
        });

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
            setPriceHistory(prev => [...newLogs, ...prev]);
        }

        if (newShipmentLogs && newShipmentLogs.length > 0) {
            setShipmentHistory(prev => [...newShipmentLogs, ...prev]);
        }

        if (discoveredPlatforms && discoveredPlatforms.length > 0) {
            setPricingRules(prev => {
                const newRules = { ...prev };
                let changed = false;
                discoveredPlatforms.forEach(p => {
                    if (!newRules[p]) {
                        newRules[p] = {
                            markup: 0,
                            commission: 15, // Default assumption
                            manager: 'Unassigned',
                            color: '#6b7280' // Default gray
                        };
                        changed = true;
                    }
                });
                return changed ? newRules : prev;
            });
        }

        setIsSalesImportModalOpen(false);
    };

    const handleResetSalesData = () => {
        setPriceHistory([]);
        setProducts(prev => prev.map(p => ({
            ...p,
            averageDailySales: 0,
            previousDailySales: 0,
            daysRemaining: p.stockLevel > 0 ? 999 : 0,
            status: p.stockLevel > 0 ? 'Overstock' : 'Critical' // Reset status default
        })));
        setShipmentHistory([]);
        setIsSalesImportModalOpen(false);
    };

    // --- INVENTORY IMPORT ---
    const handleInventoryImport = (data: any[]) => {
        setProducts(prev => {
            const skuMap = new Map<string, Product>();
            prev.forEach(p => skuMap.set(p.sku, p));
            
            const newProducts = [...prev];

            data.forEach(item => {
                const existingIndex = newProducts.findIndex(p => p.sku === item.sku);
                const existing = existingIndex !== -1 ? { ...newProducts[existingIndex] } : undefined;

                if (existing) {
                    if (item.stock !== undefined) existing.stockLevel = item.stock;
                    if (item.cost !== undefined) existing.costPrice = item.cost;
                    if (item.name) existing.name = item.name;
                    if (item.category) existing.category = item.category;
                    if (item.subcategory) existing.subcategory = item.subcategory;
                    if (item.brand) existing.brand = item.brand;
                    if (item.inventoryStatus) existing.inventoryStatus = item.inventoryStatus;
                    if (item.cartonDimensions) existing.cartonDimensions = item.cartonDimensions;
                    
                    existing.lastUpdated = new Date().toISOString().split('T')[0];
                    newProducts[existingIndex] = existing;
                } else {
                    newProducts.push({
                        id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
                        sku: item.sku,
                        name: item.name || item.sku,
                        brand: item.brand,
                        category: item.category || 'Uncategorized',
                        subcategory: item.subcategory,
                        stockLevel: item.stock || 0,
                        costPrice: item.cost || 0,
                        currentPrice: 0,
                        averageDailySales: 0,
                        leadTimeDays: 30, // Default
                        status: 'Healthy',
                        recommendation: 'New Product',
                        daysRemaining: 999,
                        channels: [],
                        lastUpdated: new Date().toISOString().split('T')[0],
                        inventoryStatus: item.inventoryStatus,
                        cartonDimensions: item.cartonDimensions
                    });
                }
            });
            return newProducts;
        });
        setIsUploadModalOpen(false);
    };

    // --- SKU DETAIL IMPORT ---
    const handleSkuDetailImport = (data: { masterSku: string; detail: SkuCostDetail }[]) => {
        setProducts(prev => prev.map(p => {
            const update = data.find(d => d.masterSku === p.sku);
            if (update) {
                return {
                    ...p,
                    costDetail: update.detail
                };
            }
            return p;
        }));
        setIsSkuDetailModalOpen(false);
    };

    // --- MAPPING IMPORT ---
    const handleMappingImport = (mappings: any[], mode: 'merge' | 'replace', platform: string) => {
        setProducts(prev => prev.map(p => {
            const productMappings = mappings.filter(m => m.masterSku === p.sku);
            if (productMappings.length === 0 && mode === 'merge') return p;

            let newChannels = [...p.channels];
            
            if (mode === 'replace') {
                const chIdx = newChannels.findIndex(c => c.platform === platform);
                if (chIdx >= 0) {
                    newChannels[chIdx] = { ...newChannels[chIdx], skuAlias: '' };
                }
            }

            if (productMappings.length > 0) {
                const aliases = productMappings.map(m => m.alias).join(', ');
                const chIdx = newChannels.findIndex(c => c.platform === platform);
                
                if (chIdx >= 0) {
                    const existingAliases = newChannels[chIdx].skuAlias ? newChannels[chIdx].skuAlias?.split(',').map(s => s.trim()) : [];
                    const newSet = new Set(mode === 'merge' ? existingAliases : []);
                    productMappings.forEach(m => newSet.add(m.alias));
                    newChannels[chIdx] = { ...newChannels[chIdx], skuAlias: Array.from(newSet).join(', ') };
                } else {
                    newChannels.push({
                        platform: platform,
                        manager: pricingRules[platform]?.manager || 'Unassigned',
                        velocity: 0,
                        skuAlias: aliases
                    });
                }
            }
            
            return { ...p, channels: newChannels };
        }));
        setIsMappingModalOpen(false);
    };

    // --- NEW: RETURNS IMPORT ---
    const handleReturnsImport = (refunds: RefundLog[]) => {
        setRefundHistory(prev => {
            const existingIds = new Set(prev.map(r => r.id));
            const newLogs = refunds.filter(r => !existingIds.has(r.id));
            
            if (newLogs.length > 0) {
                // Update Product Return Rates dynamically
                const skuRefundCounts: Record<string, number> = {};
                [...prev, ...newLogs].forEach(r => {
                    skuRefundCounts[r.sku] = (skuRefundCounts[r.sku] || 0) + r.quantity;
                });

                setProducts(products => products.map(p => {
                    if (skuRefundCounts[p.sku] !== undefined) {
                        // Approximate return rate: Returns / (Velocity * 30 days) * 100
                        // Using a simple 30 day basis for velocity context
                        const estimatedMonthlySales = Math.max(1, p.averageDailySales * 30);
                        const rate = Math.min(100, (skuRefundCounts[p.sku] / estimatedMonthlySales) * 100);
                        return { ...p, returnRate: Number(rate.toFixed(2)) };
                    }
                    return p;
                }));
            }
            
            return [...newLogs, ...prev];
        });
        setIsReturnsModalOpen(false);
    };

    // --- NEW: CA REPORT IMPORT ---
    const handleCAImport = (data: { sku: string; caPrice: number }[], reportDate: string) => {
        const changes: PriceChangeRecord[] = [];
        
        setProducts(prev => prev.map(p => {
            const update = data.find(d => d.sku === p.sku);
            if (update) {
                // Check for price change
                const oldPrice = p.caPrice || 0;
                if (oldPrice > 0 && Math.abs(oldPrice - update.caPrice) > 0.02) {
                    changes.push({
                        id: `chg-${Date.now()}-${p.sku}`,
                        sku: p.sku,
                        productName: p.name,
                        date: reportDate,
                        oldPrice: oldPrice,
                        newPrice: update.caPrice,
                        changeType: update.caPrice > oldPrice ? 'INCREASE' : 'DECREASE',
                        percentChange: ((update.caPrice - oldPrice) / oldPrice) * 100
                    });
                }
                return { ...p, caPrice: update.caPrice };
            }
            return p;
        }));

        if (changes.length > 0) {
            setPriceChangeHistory(prev => [...changes, ...prev]);
        }
        
        setIsCAUploadModalOpen(false);
    };

    // --- NEW: SHIPMENT IMPORT ---
    const handleShipmentImport = (updates: { sku: string; shipments: ShipmentDetail[] }[]) => {
        setProducts(prev => prev.map(p => {
            const update = updates.find(u => u.sku === p.sku);
            if (update) {
                const totalIncoming = update.shipments.reduce((sum, s) => sum + s.quantity, 0);
                return {
                    ...p,
                    shipments: update.shipments,
                    incomingStock: totalIncoming
                };
            }
            return p;
        }));
        setIsShipmentModalOpen(false);
    };

    // ... (Return JSX identical to original, just ensuring updated logic is used)
    return (
        <>
            <style>{` html, body { height: auto; margin: 0; padding: 0; min-height: 100vh; } :root { --glass-bg: ${userProfile.glassMode === 'dark' ? `rgba(17, 24, 39, ${(userProfile.glassOpacity??90)/100})` : `rgba(255, 255, 255, ${(userProfile.glassOpacity??90)/100})`}; --glass-border: ${userProfile.glassMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.4)'}; --glass-blur: blur(${userProfile.glassBlur??10}px); --glass-bg-modal: ${userProfile.glassMode === 'dark' ? `rgba(17, 24, 39, ${Math.min(1, (userProfile.glassOpacity??90)/100 + 0.1)})` : `rgba(255, 255, 255, ${Math.min(1, (userProfile.glassOpacity??90)/100 + 0.1)})`}; --glass-blur-modal: blur(${Math.min(40, (userProfile.glassBlur??10) + 8)}px); --ambient-bg: ${userProfile.glassMode === 'dark' ? `rgba(0,0,0,${(userProfile.ambientGlassOpacity??15)/100})` : `rgba(255,255,255,${(userProfile.ambientGlassOpacity??15)/100})`}; --ambient-blur: blur(${Math.max(4, (userProfile.glassBlur??10) / 2)}px); } .bg-custom-glass { background-color: var(--glass-bg); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); } .border-custom-glass { border-color: var(--glass-border); } .bg-custom-glass-modal { background-color: var(--glass-bg-modal); } .backdrop-blur-custom-modal { backdrop-filter: var(--glass-blur-modal); -webkit-backdrop-filter: var(--glass-blur-modal); } .bg-custom-ambient { background-color: var(--ambient-bg); } .backdrop-blur-custom-ambient { backdrop-filter: var(--ambient-blur); -webkit-backdrop-filter: var(--ambient-blur); } `}</style>
            <div className="min-h-screen flex font-sans text-gray-900 transition-colors duration-500 relative bg-transparent">
                {userProfile.ambientGlass && <div className="fixed inset-0 z-[1] pointer-events-none transition-all duration-500 bg-custom-ambient backdrop-blur-custom-ambient" />}
                <aside className={`w-64 border-r border-custom-glass hidden md:flex flex-col fixed h-full z-40 shadow-sm transition-all duration-300 bg-custom-glass`}>
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold transition-colors duration-300" style={{ backgroundColor: userProfile.themeColor }}>S</div>
                        <span className="font-bold text-xl tracking-tight text-gray-900">Sello UK Hub</span>
                    </div>
                    <nav className="flex-1 px-4 py-4 space-y-1 overflow-y-auto">
                        {[ { id: 'products', icon: LayoutDashboard, label: 'Overview' }, { id: 'strategy', icon: Calculator, label: 'Strategy Engine' }, { id: 'costs', icon: DollarSign, label: 'Cost Management' }, { id: 'promotions', icon: Tag, label: 'Promotions' }, { id: 'tools', icon: Wrench, label: 'Toolbox' }, { id: 'settings', icon: Settings, label: 'Configuration' }, { id: 'definitions', icon: BookOpen, label: 'Definitions' } ].map((item) => { const isActive = currentView === item.id; return ( <button key={item.id} onClick={() => setCurrentView(item.id as any)} className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${isActive ? 'bg-opacity-10' : 'text-gray-600 hover:bg-gray-50/50 hover:text-gray-900'}`} style={isActive ? { backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor } : {}} > <item.icon className="w-5 h-5" style={isActive ? { color: userProfile.themeColor } : {}} /> {item.label} </button> ); })}
                        {searchSessions.length > 0 && ( <div className="mt-6 pt-4 border-t border-gray-100/50"> <div className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2 flex items-center gap-2"> <History className="w-3 h-3" /> Active Searches </div> <div className="space-y-1"> {searchSessions.map(session => ( <div key={session.id} className="group relative flex items-center"> <button onClick={() => { setActiveSearchId(session.id); setCurrentView('search'); }} className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all text-left overflow-hidden ${activeSearchId === session.id && currentView === 'search' ? 'bg-white/40 shadow-sm' : 'text-gray-600 hover:bg-gray-100/50'}`} style={activeSearchId === session.id && currentView === 'search' ? { backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor } : {}} > <Search className={`w-4 h-4 flex-shrink-0 ${activeSearchId === session.id && currentView === 'search' ? '' : 'opacity-70'}`} /> <span className="truncate pr-4 block w-full">{session.query}</span> </button> <button onClick={(e) => deleteSearchSession(session.id, e)} className="absolute right-1 p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full opacity-0 group-hover:opacity-100 transition-all z-10" title="Close Search" > <X className="w-3 h-3" /> </button> </div> ))} </div> </div> )}
                    </nav>
                    <div className="p-4 border-t border-custom-glass space-y-3">
                        <div className="px-2 space-y-2"> <button onClick={handleBackup} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100/50 transition-colors border border-transparent hover:border-custom-glass"><Download className="w-3.5 h-3.5" /> Backup Database</button> <button onClick={() => fileRestoreRef.current?.click()} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100/50 transition-colors border border-transparent hover:border-custom-glass"><Upload className="w-3.5 h-3.5" /> Restore Database</button> <input ref={fileRestoreRef} type="file" accept=".json" className="hidden" onChange={handleRestore} /> </div>
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-custom-glass"> <div className="flex justify-between items-center mb-1"><p className="text-xs font-semibold text-gray-500">Tool Status</p><span className="text-[10px] text-gray-400">v1.6.0</span></div> <div className={`flex items-center gap-2 text-sm ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>{isOnline ? <><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span> System Online</> : <><WifiOff className="w-3 h-3" /> Offline Mode</>}</div> </div>
                    </div>
                </aside>
                <main className="flex-1 md:ml-64 p-8 min-w-0 relative z-10">
                    <header className="flex justify-between items-center mb-8 gap-8">
                        <div> <h1 className="text-2xl font-bold transition-colors" style={headerStyle}> {currentView === 'search' ? 'Search Results' : currentView === 'products' ? 'Business Overview' : currentView === 'dashboard' ? 'Master Catalogue' : currentView === 'strategy' ? 'Pricing Strategy Engine' : currentView === 'costs' ? 'Product Costs & Limits' : currentView === 'definitions' ? 'Definitions & Formulas' : currentView === 'promotions' ? 'Promotion Management' : currentView === 'tools' ? 'Automation Toolbox' : 'Settings'} </h1> <p className="text-sm mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}> {currentView === 'search' ? 'Analyzing your inventory data based on natural language queries.' : currentView === 'dashboard' ? 'Manage SKUs, review velocities, and calculate strategies.' : currentView === 'strategy' ? 'Define and apply rule-based pricing logic.' : currentView === 'products' ? 'Manage Master SKUs and platform aliases.' : currentView === 'costs' ? 'Detailed SKU P&L and CA Price Benchmarks.' : currentView === 'definitions' ? 'Reference guide for calculations and logic.' : currentView === 'promotions' ? 'Plan, execute, and track sales events across platforms.' : currentView === 'tools' ? 'Access specialized tools to automate complex tasks.' : 'Manage platform fees, logistics rates, and user settings.'} </p> </div>
                        <div className="flex-1 max-w-2xl"> <GlobalSearch onSearch={handleSearch} isLoading={isSearchLoading} platforms={Object.keys(pricingRules)} /> </div>
                        <div className="flex items-center gap-4"> {userProfile.name && <span className="text-sm font-semibold animate-in fade-in slide-in-from-top-2" style={headerStyle}>Hello, {userProfile.name}!</span>} {hasInventory && <QuickUploadMenu />} <button className="relative p-2 hover:opacity-70 transition-opacity" style={headerStyle}><Bell className="w-6 h-6" /></button> <div className="h-6 w-px" style={{ backgroundColor: `${headerTextColor}40` }}></div> <UserProfile profile={userProfile} onUpdate={setUserProfile} /> </div>
                    </header>
                    <div className="flex-1 overflow-y-auto no-scrollbar relative p-4 md:p-8">
                        {currentView === 'search' && activeSearch && ( <SearchResultsPage data={{ results: activeSearch.results, query: activeSearch.query, params: activeSearch.params, id: activeSearch.id }} products={products} pricingRules={pricingRules} themeColor={userProfile.themeColor} headerStyle={headerStyle} timeLabel={activeSearch.timeLabel} onRefine={handleRefineSearch} searchConfig={searchConfig} /> )}
                        {currentView === 'search' && !activeSearch && ( <div className="flex flex-col items-center justify-center h-full text-gray-400"> <Search className="w-12 h-12 mb-4 opacity-50" /> <p className="text-lg font-medium">Select a search from the sidebar or start a new one.</p> </div> )}
                        {currentView === 'products' && ( products.length === 0 ? ( <div className="flex flex-col items-center justify-center min-h-[500px] bg-custom-glass rounded-2xl border-2 border-dashed border-custom-glass text-center p-12 animate-in fade-in zoom-in duration-300 h-full"> <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm" style={{ backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor }}><Database className="w-10 h-10" /></div> <h3 className="text-2xl font-bold text-gray-900">Welcome to Sello UK Hub</h3> <p className="text-gray-500 max-w-lg mt-3 mb-10 text-lg">Let's get your dashboard set up. Please upload your company reports in the order below to initialize the system.</p> <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl relative"> <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative group ${hasInventory ? 'bg-green-50/50 border-green-200' : 'bg-gray-50/50 border-gray-200 hover:border-indigo-300'}`}> <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${hasInventory ? 'bg-green-600 text-white' : 'bg-white text-white'}`} style={!hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>{hasInventory ? 'Completed' : 'Step 1'}</div> <div className="p-4 bg-white rounded-full shadow-sm mb-4">{hasInventory ? <CheckCircle className="w-8 h-8 text-green-600" /> : <Database className="w-8 h-8" style={{ color: userProfile.themeColor }} />}</div> <h4 className="font-bold text-gray-900 text-lg">ERP Inventory Report</h4> <p className="text-sm text-gray-500 mt-2 text-center">Upload the 28-column ERP file to initialize Products, Stock Levels, COGS, and Categories.</p> <button onClick={() => setIsUploadModalOpen(true)} className={`mt-6 w-full py-3 bg-white border text-gray-700 font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${hasInventory ? 'border-green-300 text-green-700' : 'border-gray-300 hover:bg-opacity-5'}`} style={!hasInventory ? { borderColor: userProfile.themeColor, color: userProfile.themeColor } : {}}>{hasInventory ? 'Re-upload Inventory' : 'Upload Inventory'}</button> </div> <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative ${!hasInventory ? 'bg-gray-50/50 border-gray-200 opacity-60 cursor-not-allowed' : 'bg-custom-glass border-indigo-200 shadow-lg scale-105 z-10'}`}> <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${!hasInventory ? 'bg-gray-400 text-white' : 'text-white'}`} style={hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>Step 2</div> <div className="p-4 bg-white rounded-full shadow-sm mb-4"><FileBarChart className={`w-8 h-8 ${!hasInventory ? 'text-gray-400' : ''}`} style={hasInventory ? { color: userProfile.themeColor } : {}} /></div> <h4 className="font-bold text-gray-900 text-lg">Sales Transaction Report</h4> <p className="text-sm text-gray-500 mt-2 text-center">Once products are loaded, upload sales history to calculate Velocity, Fees, and Margins.</p> <button onClick={() => hasInventory && setIsSalesImportModalOpen(true)} disabled={!hasInventory} style={hasInventory ? { backgroundColor: userProfile.themeColor } : {}} className={`mt-6 w-full py-3 font-bold rounded-lg flex items-center justify-center gap-2 text-white transition-all ${!hasInventory ? 'bg-gray-300' : 'hover:opacity-90 shadow-lg'}`}><Upload className="w-5 h-5" /> Upload Sales</button> </div> </div> </div> ) : ( <ProductManagementPage products={products} pricingRules={pricingRules} promotions={promotions} priceHistoryMap={priceHistoryMap} priceChangeHistory={priceChangeHistory} onOpenMappingModal={() => setIsMappingModalOpen(true)} dateLabels={dynamicDateLabels} onUpdateProduct={(p) => setProducts(prev => prev.map(old => old.id === p.id ? p : old))} onViewElasticity={handleViewElasticity} themeColor={userProfile.themeColor} headerStyle={headerStyle} onAnalyze={handleAnalyze} /> ) )}
                        {currentView === 'strategy' && (<StrategyPage products={products} pricingRules={pricingRules} currentConfig={strategyRules} onSaveConfig={(newConfig: StrategyConfig) => { setStrategyRules(newConfig); setCurrentView('products'); }} themeColor={userProfile.themeColor} headerStyle={headerStyle} priceHistoryMap={priceHistoryMap} promotions={promotions} priceChangeHistory={priceChangeHistory} />)}
                        {currentView === 'costs' && (<CostManagementPage products={products} themeColor={userProfile.themeColor} headerStyle={headerStyle} />)}
                        {currentView === 'promotions' && (<PromotionPage products={products} pricingRules={pricingRules} logisticsRules={logisticsRules} promotions={promotions} priceHistoryMap={priceHistoryMap} onAddPromotion={(p) => setPromotions(prev => [...prev, p])} onUpdatePromotion={(p) => setPromotions(prev => prev.map(o => o.id === p.id ? p : o))} onDeletePromotion={(id) => setPromotions(prev => prev.filter(p => p.id !== id))} themeColor={userProfile.themeColor} headerStyle={headerStyle} />)}
                        {currentView === 'tools' && (<ToolboxPage promotions={promotions} pricingRules={pricingRules} themeColor={userProfile.themeColor} headerStyle={headerStyle} />)}
                        {currentView === 'definitions' && (<DefinitionsPage headerStyle={headerStyle} />)}
                        {currentView === 'settings' && (<SettingsPage currentRules={pricingRules} onSave={(newRules, newVelocity, newSearchConfig) => { setPricingRules(newRules); setVelocityLookback(newVelocity); if (newSearchConfig) setSearchConfig(newSearchConfig); }} logisticsRules={logisticsRules} onSaveLogistics={(newLogistics) => { setLogisticsRules(newLogistics); }} products={products} shipmentHistory={shipmentHistory} themeColor={userProfile.themeColor} headerStyle={headerStyle} searchConfig={searchConfig} />)}
                    </div>
                </main>
                {isUploadModalOpen && <BatchUploadModal products={products} onClose={() => setIsUploadModalOpen(false)} onConfirm={handleInventoryImport} />}
                {isSalesImportModalOpen && <SalesImportModal products={products} pricingRules={pricingRules} learnedAliases={learnedAliases} onClose={() => setIsSalesImportModalOpen(false)} onResetData={handleResetSalesData} onConfirm={handleSalesImportConfirm} />}
                {isSkuDetailModalOpen && <SkuDetailUploadModal products={products} onClose={() => setIsSkuDetailModalOpen(false)} onConfirm={handleSkuDetailImport} />}
                {isCostUploadModalOpen && <CostUploadModal onClose={() => setIsCostUploadModalOpen(false)} onConfirm={() => {}} />} {/* Deprecated but kept for type safety if needed */}
                {isMappingModalOpen && <MappingUploadModal products={products} platforms={Object.keys(pricingRules)} learnedAliases={learnedAliases} onClose={() => setIsMappingModalOpen(false)} onConfirm={handleMappingImport} />}
                {isReturnsModalOpen && <ReturnsUploadModal onClose={() => setIsReturnsModalOpen(false)} onConfirm={handleReturnsImport} />}
                {isCAUploadModalOpen && <CAUploadModal onClose={() => setIsCAUploadModalOpen(false)} onConfirm={handleCAImport} />}
                {isShipmentModalOpen && <ShipmentUploadModal products={products} onClose={() => setIsShipmentModalOpen(false)} onConfirm={handleShipmentImport} />}
                {selectedElasticityProduct && ( <PriceElasticityModal product={selectedElasticityProduct} priceHistory={priceHistory} priceChangeHistory={priceChangeHistory} onClose={() => setSelectedElasticityProduct(null)} /> )}
                {selectedAnalysisProduct && ( <AnalysisModal product={selectedAnalysisProduct} analysis={analysisResult} isLoading={isAnalysisLoading} onClose={() => { setSelectedAnalysisProduct(null); setAnalysisResult(null); }} onApplyPrice={handleApplyPrice} themeColor={userProfile.themeColor} /> )}
            </div>
        </>
    );
};

export default App;