
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { INITIAL_PRODUCTS, MOCK_PRICE_HISTORY, MOCK_PROMOTIONS, DEFAULT_PRICING_RULES, DEFAULT_LOGISTICS_RULES, DEFAULT_STRATEGY_RULES } from './constants';
import { Product, AnalysisResult, PricingRules, PriceLog, PromotionEvent, UserProfile as UserProfileType, ChannelData, LogisticsRule, ShipmentLog, StrategyConfig, VelocityLookback, RefundLog, ShipmentDetail, HistoryPayload, PriceChangeRecord } from './types';
import ProductList from './components/ProductList';
import AnalysisModal from './components/AnalysisModal';
import BatchUploadModal, { BatchUpdateItem } from './components/BatchUploadModal';
import SalesImportModal from './components/SalesImportModal';
import SettingsPage from './components/SettingsPage';
import CostManagementPage from './components/CostManagementPage';
import CostUploadModal from './components/CostUploadModal';
import DefinitionsPage from './components/DefinitionsPage';
import PromotionPage from './components/PromotionPage';
import UserProfile from './components/UserProfile';
import ProductManagementPage from './components/ProductManagementPage';
import MappingUploadModal, { SkuMapping } from './components/MappingUploadModal';
import StrategyPage from './components/StrategyPage';
import ReturnsUploadModal from './components/ReturnsUploadModal';
import CAUploadModal from './components/CAUploadModal';
import ShipmentUploadModal from './components/ShipmentUploadModal';
import { analyzePriceAdjustment } from './services/geminiService';
import { LayoutDashboard, Settings, Bell, Upload, FileBarChart, DollarSign, BookOpen, Tag, Wifi, WifiOff, Database, CheckCircle, ArrowRight, Package, Download, Calculator, RotateCcw, List, UploadCloud, ChevronDown, Ship, Link as LinkIcon, Loader2 } from 'lucide-react';
import { get, set, del } from 'idb-keyval';

// --- LOGIC HELPERS ---

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

// Legacy name alias for compatibility
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

// Helper to determine Friday-Thursday week ranges relative to a specific date
const getFridayThursdayRanges = (anchorDate: Date = new Date()) => {
    const currentDay = anchorDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    // Target: Friday (5).
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

const App: React.FC = () => {
    const [isDataLoaded, setIsDataLoaded] = useState(false);

    // --- DATABASE INITIALIZATION ---
    const [products, setProducts] = useState<Product[]>([]);
    const [priceHistory, setPriceHistory] = useState<PriceLog[]>([]);
    const [refundHistory, setRefundHistory] = useState<RefundLog[]>([]);
    const [shipmentHistory, setShipmentHistory] = useState<ShipmentLog[]>([]);
    const [priceChangeHistory, setPriceChangeHistory] = useState<PriceChangeRecord[]>([]); // New State
    const [promotions, setPromotions] = useState<PromotionEvent[]>(MOCK_PROMOTIONS);
    const [learnedAliases, setLearnedAliases] = useState<Record<string, string>>({});

    // Configs (Keep in LocalStorage for simplicity unless large)
    const [pricingRules, setPricingRules] = useState<PricingRules>(DEFAULT_PRICING_RULES);
    const [logisticsRules, setLogisticsRules] = useState<LogisticsRule[]>(DEFAULT_LOGISTICS_RULES);
    const [strategyRules, setStrategyRules] = useState<StrategyConfig>(DEFAULT_STRATEGY_RULES);
    const [velocityLookback, setVelocityLookback] = useState<VelocityLookback>('30');
    
    // User Profile
    const [userProfile, setUserProfile] = useState<UserProfileType>({
        name: '',
        themeColor: '#4f46e5',
        backgroundImage: '',
        backgroundColor: '#f3f4f6',
        glassMode: 'light',
        glassOpacity: 90,
        glassBlur: 10,
        ambientGlass: true,
        ambientGlassOpacity: 15
    });

    // --- ASYNC DATA LOADING (IDB + LocalStorage Migration) ---
    useEffect(() => {
        const loadData = async () => {
            try {
                // 1. Load Heavy Data (IDB Preferred)
                const loadHeavy = async (key: string, fallback: any) => {
                    // Try IDB
                    const idbData = await get(key);
                    if (idbData) return idbData;

                    // Fallback: Check LocalStorage (Migration)
                    const lsData = localStorage.getItem(key);
                    if (lsData) {
                        try {
                            const parsed = JSON.parse(lsData);
                            await set(key, parsed); // Migrate to IDB
                            localStorage.removeItem(key); // Clear LS to free quota
                            return parsed;
                        } catch (e) {
                            console.error(`Migration failed for ${key}`, e);
                        }
                    }
                    return fallback;
                };

                const [p, h, r, s, prom, aliases, changes] = await Promise.all([
                    loadHeavy('sello_products', []),
                    loadHeavy('sello_price_history', []),
                    loadHeavy('sello_refund_history', []),
                    loadHeavy('sello_shipment_history', []),
                    loadHeavy('sello_promotions', MOCK_PROMOTIONS),
                    loadHeavy('sello_learned_aliases', {}),
                    loadHeavy('sello_price_change_history', [])
                ]);

                setProducts(p);
                setPriceHistory(h);
                setRefundHistory(r);
                setShipmentHistory(s);
                setPromotions(prom);
                setLearnedAliases(aliases);
                setPriceChangeHistory(changes);

                // 2. Load Light Config (LocalStorage)
                const loadLS = (key: string, fallback: any) => {
                    const saved = localStorage.getItem(key);
                    return saved ? JSON.parse(saved) : fallback;
                };

                setPricingRules(loadLS('sello_rules', DEFAULT_PRICING_RULES));
                setLogisticsRules(loadLS('sello_logistics', DEFAULT_LOGISTICS_RULES));
                setStrategyRules(loadLS('sello_strategy', DEFAULT_STRATEGY_RULES));
                setVelocityLookback(localStorage.getItem('sello_velocity_setting') as VelocityLookback || '30');
                setUserProfile(loadLS('sello_user_profile', {
                    name: '',
                    themeColor: '#4f46e5',
                    backgroundImage: '',
                    backgroundColor: '#f3f4f6',
                    glassMode: 'light',
                    glassOpacity: 90,
                    glassBlur: 10,
                    ambientGlass: true,
                    ambientGlassOpacity: 15
                }));

                setIsDataLoaded(true);
            } catch (err) {
                console.error("Critical error loading data", err);
                // Emergency fallback to let app render even if empty
                setIsDataLoaded(true);
            }
        };

        loadData();
    }, []);

    // --- STORAGE SYNC ---
    const IDB_KEYS = ['sello_products', 'sello_price_history', 'sello_refund_history', 'sello_shipment_history', 'sello_promotions', 'sello_learned_aliases', 'sello_price_change_history'];

    const syncToStorage = async (key: string, data: any) => {
        if (!isDataLoaded) return; // Prevent overwriting with empty state during load
        try {
            if (IDB_KEYS.includes(key)) {
                await set(key, data);
            } else {
                localStorage.setItem(key, typeof data === 'string' ? data : JSON.stringify(data));
            }
        } catch (e) {
            console.error(`Storage sync failed for ${key}`, e);
        }
    };

    // --- EFFECTS FOR SYNC ---
    useEffect(() => { syncToStorage('sello_products', products); }, [products, isDataLoaded]);
    useEffect(() => { syncToStorage('sello_rules', pricingRules); }, [pricingRules, isDataLoaded]);
    useEffect(() => { syncToStorage('sello_logistics', logisticsRules); }, [logisticsRules, isDataLoaded]);
    useEffect(() => { syncToStorage('sello_strategy', strategyRules); }, [strategyRules, isDataLoaded]);
    useEffect(() => { syncToStorage('sello_price_history', priceHistory); }, [priceHistory, isDataLoaded]);
    useEffect(() => { syncToStorage('sello_refund_history', refundHistory); }, [refundHistory, isDataLoaded]);
    useEffect(() => { syncToStorage('sello_shipment_history', shipmentHistory); }, [shipmentHistory, isDataLoaded]);
    useEffect(() => { syncToStorage('sello_promotions', promotions); }, [promotions, isDataLoaded]);
    useEffect(() => { syncToStorage('sello_user_profile', userProfile); }, [userProfile, isDataLoaded]);
    useEffect(() => { syncToStorage('sello_velocity_setting', velocityLookback); }, [velocityLookback, isDataLoaded]);
    useEffect(() => { syncToStorage('sello_learned_aliases', learnedAliases); }, [learnedAliases, isDataLoaded]);
    useEffect(() => { syncToStorage('sello_price_change_history', priceChangeHistory); }, [priceChangeHistory, isDataLoaded]);

    // --- BACKGROUND STYLES ---
    useEffect(() => {
        if (!isDataLoaded) return;
        const elements = [document.body, document.documentElement];
        elements.forEach(el => {
            el.style.background = '';
            el.style.backgroundColor = '';
            el.style.backgroundImage = '';

            if (userProfile.backgroundImage && userProfile.backgroundImage !== 'none') {
                const isUrl = userProfile.backgroundImage.startsWith('http') || userProfile.backgroundImage.startsWith('data:') || userProfile.backgroundImage.startsWith('/');
                el.style.backgroundImage = isUrl
                    ? `url(${userProfile.backgroundImage})`
                    : userProfile.backgroundImage;
                el.style.backgroundColor = 'transparent';
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                el.style.backgroundAttachment = 'fixed';
                el.style.backgroundRepeat = 'no-repeat';
            } else {
                el.style.backgroundImage = 'none';
                el.style.backgroundColor = userProfile.backgroundColor || '#f3f4f6';
            }
        });
    }, [userProfile, isDataLoaded]);

    // --- DATA PROCESSING LOGIC ---
    // (Everything below relies on loaded data)

    // Smart Cleanup
    useEffect(() => {
        if (!isDataLoaded || priceHistory.length === 0) return;

        const seenPlatforms = new Map<string, Set<string>>();
        priceHistory.forEach(l => {
            const key = `${l.sku}|${l.date}`;
            if (!seenPlatforms.has(key)) seenPlatforms.set(key, new Set());
            seenPlatforms.get(key)!.add(l.platform || 'General');
        });

        let hasDuplicates = false;
        const cleaned = priceHistory.filter(l => {
            const key = `${l.sku}|${l.date}`;
            const platforms = seenPlatforms.get(key);
            if (platforms && platforms.size > 1 && (l.platform === 'General' || !l.platform)) {
                hasDuplicates = true;
                return false;
            }
            return true;
        });

        if (hasDuplicates) {
            setPriceHistory(cleaned);
        }
    }, [priceHistory.length, isDataLoaded]);

    const latestHistoryDate = useMemo(() => {
        if (priceHistory.length === 0) return new Date();
        let maxTs = 0;
        priceHistory.forEach(p => {
            const ts = new Date(p.date).getTime();
            if (!isNaN(ts) && ts > maxTs) maxTs = ts;
        });
        return maxTs > 0 ? new Date(maxTs) : new Date();
    }, [priceHistory]);

    const weekRanges = useMemo(() => getFridayThursdayRanges(latestHistoryDate), [latestHistoryDate]);

    const dynamicDateLabels = useMemo(() => ({
        current: `${formatDateShort(weekRanges.current.start)} - ${formatDateShort(weekRanges.current.end)}`,
        last: `${formatDateShort(weekRanges.last.start)} - ${formatDateShort(weekRanges.last.end)}`
    }), [weekRanges]);

    // --- INDEXING ---
    const priceHistoryMap = useMemo(() => {
        const map = new Map<string, PriceLog[]>();
        priceHistory.forEach(l => {
            if (!map.has(l.sku)) map.set(l.sku, []);
            map.get(l.sku)!.push(l);
        });
        return map;
    }, [priceHistory]);

    const refundHistoryMap = useMemo(() => {
        const map = new Map<string, RefundLog[]>();
        refundHistory.forEach(r => {
            if (!map.has(r.sku)) map.set(r.sku, []);
            map.get(r.sku)!.push(r);
        });
        return map;
    }, [refundHistory]);

    // --- RECALCULATE VELOCITIES ---
    useEffect(() => {
        if (!isDataLoaded || priceHistory.length === 0) return;

        const anchorTime = latestHistoryDate.getTime();
        let lookbackDays = 30;
        if (velocityLookback !== 'ALL') {
            lookbackDays = parseInt(velocityLookback, 10);
        } else {
            lookbackDays = 9999;
        }

        const currentWindowStart = anchorTime - (lookbackDays * 24 * 60 * 60 * 1000);
        const prevWindowStart = anchorTime - (lookbackDays * 2 * 24 * 60 * 60 * 1000);
        const prevWindowEnd = currentWindowStart;

        setProducts(prevProducts => {
            let hasChanges = false;
            const updated = prevProducts.map(p => {
                const skuLogs = priceHistoryMap.get(p.sku) || [];
                const skuRefunds = refundHistoryMap.get(p.sku) || [];

                const calcAvgVel = (startMs: number, endMs: number) => {
                    const relevant = skuLogs.filter(l => {
                        const d = new Date(l.date).getTime();
                        // Respect Platform Exclusion Rules
                        if (l.platform && pricingRules[l.platform]?.isExcluded) return false;
                        return d >= startMs && d <= endMs;
                    });
                    if (relevant.length === 0) return 0;

                    const sum = relevant.reduce((acc, l) => acc + (Number(l.velocity) || 0), 0);
                    const windowLengthDays = Math.max(1, Math.ceil((endMs - startMs) / (24 * 60 * 60 * 1000)));
                    return isNaN(sum / windowLengthDays) ? 0 : sum / windowLengthDays;
                };

                let totalRefunded = 0;
                let refundedQty = 0;
                skuRefunds.forEach(r => {
                    const ts = new Date(r.date).getTime();
                    if (ts >= currentWindowStart && ts <= anchorTime) {
                        totalRefunded += (Number(r.amount) || 0);
                        refundedQty += (Number(r.quantity) || 0);
                    }
                });

                const newAvgDaily = calcAvgVel(currentWindowStart, anchorTime);
                const estimatedSold = (newAvgDaily || Number(p.averageDailySales) || 0) * lookbackDays;
                const returnRate = estimatedSold > 0 ? (refundedQty / estimatedSold) * 100 : 0;
                const newPrevDaily = calcAvgVel(prevWindowStart, prevWindowEnd);

                const currentV = Number(p.averageDailySales) || 0;
                const prevV = Number(p.previousDailySales) || 0;
                const revR = Number(p.returnRate) || 0;
                const totalR = Number(p.totalRefunded) || 0;

                if (Math.abs(newAvgDaily - currentV) > 0.001 || Math.abs(newPrevDaily - prevV) > 0.001 || Math.abs(returnRate - revR) > 0.01 || Math.abs(totalRefunded - totalR) > 0.01) {
                    hasChanges = true;
                    return {
                        ...p,
                        averageDailySales: Number(newAvgDaily.toFixed(2)) || 0,
                        previousDailySales: Number(newPrevDaily.toFixed(2)) || 0,
                        returnRate: isNaN(returnRate) ? 0 : Number(returnRate.toFixed(2)),
                        totalRefunded: Number(totalRefunded.toFixed(2)) || 0
                    };
                }
                return p;
            });
            return hasChanges ? updated : prevProducts;
        });
    }, [priceHistoryMap, refundHistoryMap, velocityLookback, latestHistoryDate, isDataLoaded, pricingRules]);

    // Recalc Prices based on recent weeks
    useEffect(() => {
        if (!isDataLoaded || priceHistory.length === 0) return;
        const { current, last } = weekRanges;

        setProducts(prevProducts => {
            let hasChanges = false;
            const updated = prevProducts.map(p => {
                const skuLogs = priceHistoryMap.get(p.sku) || [];
                const getAvg = (start: Date, end: Date) => {
                    const logs = skuLogs.filter(l => {
                        const d = new Date(l.date);
                        // Respect Platform Exclusion Rules
                        if (l.platform && pricingRules[l.platform]?.isExcluded) return false;
                        return d >= start && d <= end;
                    });
                    if (logs.length === 0) return null;
                    const totalRev = logs.reduce((acc, l) => acc + ((Number(l.price) || 0) * (Number(l.velocity) || 0)), 0);
                    const totalQty = logs.reduce((acc, l) => acc + (Number(l.velocity) || 0), 0);
                    const avg = totalQty > 0 ? totalRev / totalQty : null;
                    return (avg !== null && isNaN(avg)) ? null : avg;
                };

                const avgCurrent = getAvg(current.start, current.end);
                const avgLast = getAvg(last.start, last.end);

                let newCurrent = Number(p.currentPrice) || 0;
                let newOld = Number(p.oldPrice) || 0;

                if (avgCurrent !== null) newCurrent = Number(avgCurrent.toFixed(2));
                if (avgLast !== null) newOld = Number(avgLast.toFixed(2));

                if (Math.abs(newCurrent - (Number(p.currentPrice) || 0)) > 0.001 || Math.abs(newOld - (Number(p.oldPrice) || 0)) > 0.001) {
                    hasChanges = true;
                    return { ...p, currentPrice: newCurrent, oldPrice: newOld };
                }
                return p;
            });
            return hasChanges ? updated : prevProducts;
        });
    }, [priceHistoryMap, weekRanges, isDataLoaded, pricingRules]);

    // --- STATE MANAGEMENT ---
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    
    // Global Modals State
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isSalesImportModalOpen, setIsSalesImportModalOpen] = useState(false);
    const [isCostUploadModalOpen, setIsCostUploadModalOpen] = useState(false);
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false);
    const [isCAUploadModalOpen, setIsCAUploadModalOpen] = useState(false);
    const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);

    const [currentView, setCurrentView] = useState<'dashboard' | 'strategy' | 'products' | 'settings' | 'costs' | 'definitions' | 'promotions'>('products');

    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const fileRestoreRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    // Promo status update check
    useEffect(() => {
        if (!isDataLoaded) return;
        const today = new Date().toISOString().split('T')[0];
        setPromotions(prevPromos => {
            let updatesNeeded = false;
            const updated = prevPromos.map(p => {
                let status: 'UPCOMING' | 'ACTIVE' | 'ENDED' = p.status;
                if (today < p.startDate) status = 'UPCOMING';
                else if (today > p.endDate) status = 'ENDED';
                else status = 'ACTIVE';

                if (status !== p.status) {
                    updatesNeeded = true;
                    return { ...p, status };
                }
                return p;
            });
            return updatesNeeded ? updated : prevPromos;
        });
    }, [isDataLoaded]);

    // --- GLOBAL HANDLERS ---

    const handleRestoreData = (data: any) => {
        try {
            const safeProducts = data.products ? JSON.parse(JSON.stringify(data.products)) : [];
            const safeRules = data.rules ? JSON.parse(JSON.stringify(data.rules)) : JSON.parse(JSON.stringify(DEFAULT_PRICING_RULES));
            const safeLogistics = data.logistics ? JSON.parse(JSON.stringify(data.logistics)) : JSON.parse(JSON.stringify(DEFAULT_LOGISTICS_RULES));
            const safeHistory = data.history ? JSON.parse(JSON.stringify(data.history)) : [];
            const safeRefunds = data.refunds ? JSON.parse(JSON.stringify(data.refunds)) : [];
            const safePromotions = data.promotions ? JSON.parse(JSON.stringify(data.promotions)) : [];
            const safeShipments = data.shipmentHistory ? JSON.parse(JSON.stringify(data.shipmentHistory)) : [];
            const safePriceChanges = data.priceChangeHistory ? JSON.parse(JSON.stringify(data.priceChangeHistory)) : [];
            const safeVelocity = data.velocitySetting || '30';

            const enrichedProducts = safeProducts.map((p: Product) => ({
                ...p,
                optimalPrice: calculateOptimalPrice(p.sku, safeHistory)
            }));

            setProducts(enrichedProducts);
            setPricingRules(safeRules);
            setLogisticsRules(safeLogistics);
            setPriceHistory(safeHistory);
            setRefundHistory(safeRefunds);
            setShipmentHistory(safeShipments);
            setPromotions(safePromotions);
            setPriceChangeHistory(safePriceChanges);
            setLearnedAliases(data.learnedAliases || {});
            setVelocityLookback(safeVelocity);
            alert("Database restored successfully!");
        } catch (e) {
            alert("An error occurred while loading data. Please check your backup file.");
        }
    };

    const handleExportBackup = () => {
        const backupData = {
            products,
            rules: pricingRules,
            logistics: logisticsRules,
            history: priceHistory,
            refunds: refundHistory,
            shipmentHistory,
            promotions,
            priceChangeHistory,
            learnedAliases,
            velocitySetting: velocityLookback,
            timestamp: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        const filename = `sello_uk_hub_backup_${new Date().toISOString().slice(0, 10)}.json`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
            if (document.body.contains(a)) document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 30000);
    };

    const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const json = JSON.parse(event.target?.result as string);
                handleRestoreData(json);
            } catch (err) {
                alert("Invalid backup file format.");
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    };

    const handleAnalyze = async (product: Product) => {
        setSelectedProduct(product);
        setAnalysis(null);
        setIsAnalyzing(true);
        const platformName = product.platform || (product.channels && product.channels.length > 0 ? product.channels[0].platform : 'Unknown');
        const platformRule = pricingRules[platformName] || { markup: 0, commission: 0, manager: 'Unassigned' };
        const result = await analyzePriceAdjustment(product, platformRule);
        setAnalysis(result);
        setIsAnalyzing(false);
    };

    const handleApplyPrice = (productId: string, newPrice: number) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;
        const newLog: PriceLog = {
            id: Math.random().toString(36).substr(2, 9),
            sku: product.sku,
            date: new Date().toISOString(),
            price: newPrice,
            velocity: product.averageDailySales,
            margin: calculateMargin(product, newPrice)
        };
        const updatedHistory = [...priceHistory, newLog];
        setPriceHistory(updatedHistory);
        const optimal = calculateOptimalPrice(product.sku, updatedHistory);
        setProducts(prev => prev.map(p =>
            p.id === productId ? {
                ...p,
                oldPrice: p.currentPrice,
                currentPrice: newPrice,
                lastUpdated: new Date().toISOString().split('T')[0],
                optimalPrice: optimal
            } : p
        ));
        setSelectedProduct(null);
        setAnalysis(null);
    };

    const handleBatchUpdate = (updates: BatchUpdateItem[]) => {
        const newProducts: Product[] = [];
        const existingSkuSet = new Set(products.map(p => p.sku));
        updates.forEach(item => {
            if (!existingSkuSet.has(item.sku)) {
                newProducts.push({
                    id: `p-${item.sku}-${Date.now()}`,
                    sku: item.sku,
                    name: item.name || item.sku,
                    brand: item.brand,
                    category: item.category || 'Uncategorized',
                    subcategory: item.subcategory,
                    stockLevel: item.stock || 0,
                    costPrice: item.cost || 0,
                    inventoryStatus: item.inventoryStatus,
                    cartonDimensions: item.cartonDimensions,
                    currentPrice: 0,
                    averageDailySales: 0,
                    channels: [],
                    leadTimeDays: 30,
                    status: 'Healthy',
                    recommendation: 'Maintain',
                    daysRemaining: 999,
                    lastUpdated: new Date().toISOString().split('T')[0]
                });
            }
        });
        const updatedExisting = products.map(p => {
            const update = updates.find(u => u.sku === p.sku);
            if (update) {
                return {
                    ...p,
                    name: update.name || p.name,
                    brand: update.brand || p.brand,
                    category: update.category || p.category,
                    subcategory: update.subcategory || p.subcategory,
                    stockLevel: update.stock !== undefined ? update.stock : p.stockLevel,
                    costPrice: update.cost !== undefined ? update.cost : p.costPrice,
                    inventoryStatus: update.inventoryStatus || p.inventoryStatus,
                    cartonDimensions: update.cartonDimensions || p.cartonDimensions,
                    lastUpdated: new Date().toISOString().split('T')[0]
                };
            }
            return p;
        });
        setProducts([...updatedExisting, ...newProducts]);
        setIsUploadModalOpen(false);
    };

    const handleSalesImport = (updatedProducts: Product[], _dl?: any, historyPayload?: HistoryPayload[], shipmentLogs?: ShipmentLog[], discoveredPlatforms?: string[]) => {
        try {
            const newLogs: PriceLog[] = [];
            if (historyPayload && Array.isArray(historyPayload)) {
                historyPayload.forEach(item => {
                    const product = products.find(p => p.sku === item.sku) || updatedProducts.find(p => p.sku === item.sku);
                    const safePrice = Number(item.price) || 0;
                    const safeVelocity = Number(item.velocity) || 0;
                    const safeMargin = item.margin !== undefined && !isNaN(Number(item.margin)) ? Number(item.margin) : calculateMargin(product!, safePrice);
                    if (item.sku) {
                        newLogs.push({
                            id: `hist-${item.sku}-${item.date}-${Math.random().toString(36).substr(2, 5)}`,
                            sku: String(item.sku),
                            date: item.date || new Date().toISOString().split('T')[0],
                            price: safePrice,
                            velocity: safeVelocity,
                            margin: Number(safeMargin.toFixed(2)),
                            profit: item.profit ? Number(item.profit.toFixed(2)) : undefined,
                            platform: item.platform || 'General',
                            orderId: item.orderId
                        });
                    }
                });
            }

            let updatedHistory = [...priceHistory];
            if (newLogs.length > 0) {
                const getKey = (l: PriceLog) => `${l.sku}|${l.date}|${l.platform}|${l.orderId || ''}`;
                const skuDatesWithOrders = new Set<string>();
                newLogs.forEach(l => { if (l.orderId) skuDatesWithOrders.add(`${l.sku}|${l.date}`); });
                const newLogKeys = new Set(newLogs.map(l => getKey(l)));
                updatedHistory = priceHistory.filter(l => {
                    if (newLogKeys.has(getKey(l))) return false;
                    if (!l.orderId && skuDatesWithOrders.has(`${l.sku}|${l.date}`)) return false;
                    return true;
                });
                updatedHistory = [...updatedHistory, ...newLogs];
                setPriceHistory(updatedHistory);
            }

            if (shipmentLogs && Array.isArray(shipmentLogs) && shipmentLogs.length > 0) {
                setShipmentHistory(prev => [...prev, ...shipmentLogs]);
            }

            const optimalPricesMap = new Map<string, number>();
            updatedProducts.forEach(p => optimalPricesMap.set(p.sku, calculateOptimalPrice(p.sku, updatedHistory)));
            const updateMap = new Map(updatedProducts.map(p => [p.sku, p]));

            setProducts(prev => prev.map(existing => {
                const update = updateMap.get(existing.sku);
                if (update) {
                    const optimal = optimalPricesMap.get(existing.sku) || 0;
                    const mergedChannels = [...existing.channels];
                    update.channels.forEach(newC => {
                        const idx = mergedChannels.findIndex(c => c.platform === newC.platform);
                        if (idx !== -1) mergedChannels[idx] = { ...mergedChannels[idx], ...newC };
                        else mergedChannels.push(newC);
                    });
                    return {
                        ...existing,
                        ...update,
                        channels: mergedChannels,
                        optimalPrice: Number(optimal) || 0,
                        lastUpdated: new Date().toISOString().split('T')[0]
                    };
                }
                return existing;
            }));

            if (discoveredPlatforms && Array.isArray(discoveredPlatforms)) {
                setPricingRules(prevRules => {
                    const newRules = { ...prevRules };
                    let hasChanges = false;
                    discoveredPlatforms.forEach(plat => {
                        if (plat && !newRules[plat]) {
                            const parentKey = Object.keys(newRules).find(k => plat.includes(k));
                            const parent = parentKey ? newRules[parentKey] : null;
                            newRules[plat] = {
                                markup: parent?.markup || 0,
                                commission: parent?.commission || 0,
                                manager: parent?.manager || 'Unassigned',
                                color: parent?.color || '#374151',
                                isExcluded: parent?.isExcluded || false
                            };
                            hasChanges = true;
                        }
                    });
                    return hasChanges ? newRules : prevRules;
                });
            }
            setIsSalesImportModalOpen(false);
        } catch (error: any) {
            alert("An error occurred during import: " + (error.message || "Unknown error"));
        }
    };

    const handleShipmentUpdate = (updates: { sku: string, shipments: ShipmentDetail[] }[]) => {
        const updateMap = new Map(updates.map(u => [u.sku, u.shipments]));
        setProducts(prev => prev.map(p => {
            if (updateMap.has(p.sku)) {
                const newShipmentsData = updateMap.get(p.sku)!;
                let currentShipments = p.shipments ? [...p.shipments] : [];
                newShipmentsData.forEach(newS => {
                    const idx = currentShipments.findIndex(s => s.containerId === newS.containerId);
                    if (idx >= 0) currentShipments[idx] = newS;
                    else currentShipments.push(newS);
                });
                const incoming = currentShipments.reduce((sum, s) => sum + s.quantity, 0);
                const now = new Date().toISOString().split('T')[0];
                const futureShipments = currentShipments.filter(s => s.eta && s.eta >= now).sort((a, b) => (a.eta! > b.eta! ? 1 : -1));
                let newLeadTime = p.leadTimeDays;
                if (futureShipments.length > 0 && futureShipments[0].eta) {
                    const arrival = new Date(futureShipments[0].eta);
                    const diffTime = Math.abs(arrival.getTime() - new Date().getTime());
                    newLeadTime = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                }
                return { ...p, shipments: currentShipments, incomingStock: incoming, leadTimeDays: newLeadTime };
            }
            return p;
        }));
        setIsShipmentModalOpen(false);
    };

    const handleUpdateCosts = (updates: any[]) => {
        setProducts(prev => prev.map(p => {
            const update = updates.find((u: any) => u.sku === p.sku);
            if (update) {
                const changes = { ...update };
                if (changes.cost !== undefined) { changes.costPrice = changes.cost; delete changes.cost; }
                return { ...p, ...changes };
            }
            return p;
        }));
        setIsCostUploadModalOpen(false);
    };

    const handleUpdateMappings = (mappings: SkuMapping[], mode: 'merge' | 'replace', platform: string) => {
        setProducts(prev => {
            let tempProducts = prev;
            if (mode === 'replace') {
                tempProducts = tempProducts.map(p => ({
                    ...p,
                    channels: p.channels.map(c => c.platform === platform ? { ...c, skuAlias: undefined } : c)
                }));
            }
            return tempProducts.map(p => {
                const myMappings = mappings.filter(m => m.masterSku === p.sku);
                if (myMappings.length === 0) return p;
                const updatedChannels = [...p.channels];
                const newAliases = new Set(myMappings.map(m => m.alias));
                const existingChannelIndex = updatedChannels.findIndex(c => c.platform === platform);
                if (existingChannelIndex !== -1) {
                    const currentChannel = updatedChannels[existingChannelIndex];
                    if (mode === 'merge' && currentChannel.skuAlias) currentChannel.skuAlias.split(',').forEach(a => newAliases.add(a.trim()));
                    updatedChannels[existingChannelIndex] = { ...currentChannel, skuAlias: Array.from(newAliases).join(', ') };
                } else {
                    updatedChannels.push({ platform: platform, manager: 'Unassigned', velocity: 0, skuAlias: Array.from(newAliases).join(', ') });
                }
                return { ...p, channels: updatedChannels };
            });
        });
        setLearnedAliases(prev => {
            const next = { ...prev };
            let hasChanges = false;
            mappings.forEach(m => {
                const aliasUpper = m.alias.toUpperCase();
                if (aliasUpper !== m.masterSku.toUpperCase() && next[aliasUpper] !== m.masterSku) {
                    next[aliasUpper] = m.masterSku;
                    hasChanges = true;
                }
            });
            return hasChanges ? next : prev;
        });
        setIsMappingModalOpen(false);
    };

    const handleResetData = () => {
        setPriceHistory([]); 
        setShipmentHistory([]); 
        setRefundHistory([]); 
        setPriceChangeHistory([]);
        setAnalysis(null);
        // Explicitly wipe prices to prevent stale data
        setProducts(prev => prev.map(p => ({ 
            ...p, 
            averageDailySales: 0, 
            previousDailySales: 0, 
            returnRate: 0, 
            totalRefunded: 0,
            currentPrice: 0, 
            oldPrice: 0,
            optimalPrice: 0
        })));
    };

    const handleRefundImport = (newRefunds: RefundLog[]) => {
        setRefundHistory(prev => {
            const existingIds = new Set(prev.map(r => r.id));
            const uniqueNewRefunds = newRefunds.filter(r => !existingIds.has(r.id));
            return [...prev, ...uniqueNewRefunds];
        });
        setIsReturnsModalOpen(false);
    };

    const handleCAUpdate = (updates: { sku: string; caPrice: number }[], reportDate: string = new Date().toISOString().split('T')[0]) => {
        const priceMap = new Map<string, number>();
        updates.forEach(u => priceMap.set(u.sku.trim().toUpperCase(), u.caPrice));
        
        // 1. Detect Changes and Create Log Records
        const newChanges: PriceChangeRecord[] = [];
        // Use the reportDate provided by the user for historical accuracy
        const changeDate = reportDate;

        // Helper to find match logic (copied from product mapping logic)
        const findNewPriceForProduct = (p: Product): number | undefined => {
            const masterSkuNorm = p.sku.trim().toUpperCase();
            if (priceMap.has(masterSkuNorm)) return priceMap.get(masterSkuNorm);
            
            if (p.channels) {
                for (const channel of p.channels) {
                    if (channel.skuAlias) {
                        const aliases = channel.skuAlias.split(',').map(a => a.trim().toUpperCase());
                        const match = aliases.find(a => priceMap.has(a));
                        if (match) return priceMap.get(match);
                    }
                }
            }
            
            // Check direct suffix pattern matches from priceMap keys
            for (const [reportSku, price] of priceMap.entries()) {
                if (reportSku.startsWith(masterSkuNorm + '_')) return price;
            }
            
            // Check if master matches a suffix stripped priceMap key
            const masterStripped = masterSkuNorm.replace(/_[0-9]+$/, '');
            if (masterStripped !== masterSkuNorm && priceMap.has(masterStripped)) return priceMap.get(masterStripped);
            
            return undefined;
        };

        const updatedProducts = products.map(p => {
            const newPrice = findNewPriceForProduct(p);
            
            if (newPrice !== undefined) {
                const oldPrice = p.caPrice || 0;
                
                // Record Change if different and significant
                if (oldPrice > 0 && Math.abs(newPrice - oldPrice) > 0.01) {
                    const changeType = newPrice > oldPrice ? 'INCREASE' : 'DECREASE';
                    const percentChange = ((newPrice - oldPrice) / oldPrice) * 100;
                    
                    newChanges.push({
                        id: `pc-${p.sku}-${changeDate}-${Math.random().toString(36).substr(2, 5)}`,
                        sku: p.sku,
                        productName: p.name,
                        date: changeDate, // Use the user-provided date
                        oldPrice,
                        newPrice,
                        changeType,
                        percentChange
                    });
                }
                return { ...p, caPrice: newPrice };
            }
            return p;
        });

        if (newChanges.length > 0) {
            setPriceChangeHistory(prev => [...newChanges, ...prev]);
        }

        setProducts(updatedProducts);
        setIsCAUploadModalOpen(false);
    };

    const handleUpdateProduct = (updatedProduct: Product) => {
        setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    };

    const handleAddPromotion = (promo: PromotionEvent) => setPromotions(prev => [promo, ...prev]);
    const handleUpdatePromotion = (updatedPromo: PromotionEvent) => setPromotions(prev => prev.map(p => p.id === updatedPromo.id ? updatedPromo : p));
    const handleDeletePromotion = (id: string) => setPromotions(prev => prev.filter(p => p.id !== id));

    // --- UI HELPERS ---
    const hasInventory = products.length > 0;
    const headerTextColor = userProfile.textColor || '#111827';
    const textShadowStyle = userProfile.backgroundImage && userProfile.backgroundImage !== 'none' ? { textShadow: '0 1px 3px rgba(0,0,0,0.3)' } : {};
    const headerStyle = { color: headerTextColor, ...textShadowStyle };
    const glassOpacityFraction = (userProfile.glassOpacity ?? 90) / 100;
    const glassBlur = userProfile.glassBlur ?? 10;
    const ambientOpacityFraction = (userProfile.ambientGlassOpacity ?? 15) / 100;

    // --- QUICK UPLOAD MENU COMPONENT ---
    const QuickUploadMenu = () => {
        const [isOpen, setIsOpen] = useState(false);
        const menuRef = useRef<HTMLDivElement>(null);

        useEffect(() => {
            const handleClickOutside = (event: MouseEvent) => {
                if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                    setIsOpen(false);
                }
            };
            document.addEventListener('mousedown', handleClickOutside);
            return () => document.removeEventListener('mousedown', handleClickOutside);
        }, []);

        const actions = [
            { label: 'Import Inventory', icon: Database, action: () => setIsUploadModalOpen(true), color: 'text-indigo-600' },
            { label: 'Import Sales', icon: FileBarChart, action: () => setIsSalesImportModalOpen(true), color: 'text-blue-600' },
            { label: 'Import Refunds', icon: RotateCcw, action: () => setIsReturnsModalOpen(true), color: 'text-red-600' },
            { label: 'CA Report', icon: Upload, action: () => setIsCAUploadModalOpen(true), color: 'text-purple-600' },
            { label: 'SKU Mapping', icon: LinkIcon, action: () => setIsMappingModalOpen(true), color: 'text-amber-600' },
            { label: 'Shipment Import', icon: Ship, action: () => setIsShipmentModalOpen(true), color: 'text-teal-600' },
            { label: 'Cost Update', icon: DollarSign, action: () => setIsCostUploadModalOpen(true), color: 'text-green-600' },
        ];

        return (
            <div className="relative z-50" ref={menuRef}>
                <button
                    onClick={() => setIsOpen(!isOpen)}
                    className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-all font-medium"
                    style={{ backgroundColor: userProfile.themeColor }}
                >
                    <UploadCloud className="w-4 h-4" />
                    <span className="hidden md:inline">Upload Data</span>
                    <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>

                {isOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                        <div className="p-2 grid gap-1">
                            {actions.map((item) => (
                                <button
                                    key={item.label}
                                    onClick={() => { item.action(); setIsOpen(false); }}
                                    className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors text-left w-full group"
                                >
                                    <div className={`p-1.5 rounded-md bg-gray-50 group-hover:bg-white border border-gray-100 group-hover:shadow-sm transition-all ${item.color}`}>
                                        <item.icon className="w-4 h-4" />
                                    </div>
                                    <span className="font-medium">{item.label}</span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    if (!isDataLoaded) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="flex flex-col items-center gap-4">
                    <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                    <p className="text-gray-500 font-medium">Initializing Dashboard...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <style>{`
      html, body { height: auto; margin: 0; padding: 0; min-height: 100vh; }
      :root {
        --glass-bg: ${userProfile.glassMode === 'dark' ? `rgba(17, 24, 39, ${glassOpacityFraction})` : `rgba(255, 255, 255, ${glassOpacityFraction})`};
        --glass-border: ${userProfile.glassMode === 'dark' ? 'rgba(255, 255, 255, 0.1)' : 'rgba(255, 255, 255, 0.4)'};
        --glass-blur: blur(${glassBlur}px);
        --glass-bg-modal: ${userProfile.glassMode === 'dark' ? `rgba(17, 24, 39, ${Math.min(1, glassOpacityFraction + 0.1)})` : `rgba(255, 255, 255, ${Math.min(1, glassOpacityFraction + 0.1)})`};
        --glass-blur-modal: blur(${Math.min(40, glassBlur + 8)}px);
        --ambient-bg: ${userProfile.glassMode === 'dark' ? `rgba(0,0,0,${ambientOpacityFraction})` : `rgba(255,255,255,${ambientOpacityFraction})`};
        --ambient-blur: blur(${Math.max(4, glassBlur / 2)}px);
      }
      .bg-custom-glass { background-color: var(--glass-bg); backdrop-filter: var(--glass-blur); -webkit-backdrop-filter: var(--glass-blur); }
      .border-custom-glass { border-color: var(--glass-border); }
      .bg-custom-glass-modal { background-color: var(--glass-bg-modal); }
      .backdrop-blur-custom-modal { backdrop-filter: var(--glass-blur-modal); -webkit-backdrop-filter: var(--glass-blur-modal); }
      .bg-custom-ambient { background-color: var(--ambient-bg); }
      .backdrop-blur-custom-ambient { backdrop-filter: var(--ambient-blur); -webkit-backdrop-filter: var(--ambient-blur); }
    `}</style>

            <div className="min-h-screen flex font-sans text-gray-900 transition-colors duration-500 relative bg-transparent">
                {userProfile.ambientGlass && <div className="fixed inset-0 z-[1] pointer-events-none transition-all duration-500 bg-custom-ambient backdrop-blur-custom-ambient" />}

                <aside className={`w-64 border-r border-custom-glass hidden md:flex flex-col fixed h-full z-40 shadow-sm transition-all duration-300 bg-custom-glass`}>
                    <div className="p-6 flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold transition-colors duration-300" style={{ backgroundColor: userProfile.themeColor }}>S</div>
                        <span className="font-bold text-xl tracking-tight text-gray-900">Sello UK Hub</span>
                    </div>
                    <nav className="flex-1 px-4 py-4 space-y-1">
                        {[
                            { id: 'products', icon: LayoutDashboard, label: 'Overview' },
                            { id: 'strategy', icon: Calculator, label: 'Strategy Engine' },
                            { id: 'costs', icon: DollarSign, label: 'Cost Management' },
                            { id: 'promotions', icon: Tag, label: 'Promotions' },
                            { id: 'settings', icon: Settings, label: 'Configuration' },
                            { id: 'definitions', icon: BookOpen, label: 'Definitions' }
                        ].map((item) => {
                            const isActive = currentView === item.id;
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => setCurrentView(item.id as any)}
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${isActive ? 'bg-opacity-10' : 'text-gray-600 hover:bg-gray-50/50 hover:text-gray-900'}`}
                                    style={isActive ? { backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor } : {}}
                                >
                                    <item.icon className="w-5 h-5" style={isActive ? { color: userProfile.themeColor } : {}} />
                                    {item.label}
                                </button>
                            );
                        })}
                    </nav>
                    <div className="p-4 border-t border-custom-glass space-y-3">
                        <div className="px-2 space-y-2">
                            <button onClick={handleExportBackup} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100/50 transition-colors border border-transparent hover:border-custom-glass"><Download className="w-3.5 h-3.5" /> Backup Database</button>
                            <button onClick={() => fileRestoreRef.current?.click()} className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100/50 transition-colors border border-transparent hover:border-custom-glass"><Upload className="w-3.5 h-3.5" /> Restore Database</button>
                            <input ref={fileRestoreRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />
                        </div>
                        <div className="bg-gray-50/50 rounded-xl p-4 border border-custom-glass">
                            <div className="flex justify-between items-center mb-1"><p className="text-xs font-semibold text-gray-500">Tool Status</p><span className="text-[10px] text-gray-400">v1.6.0</span></div>
                            <div className={`flex items-center gap-2 text-sm ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>{isOnline ? <><span className="relative flex h-2 w-2"><span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span><span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span></span> System Online</> : <><WifiOff className="w-3 h-3" /> Offline Mode</>}</div>
                        </div>
                    </div>
                </aside>

                <main className="flex-1 md:ml-64 p-8 min-w-0 relative z-10">
                    <header className="flex justify-between items-center mb-8">
                        <div>
                            <h1 className="text-2xl font-bold transition-colors" style={headerStyle}>
                                {currentView === 'products' ? 'Business Overview' : currentView === 'dashboard' ? 'Master Catalogue' : currentView === 'strategy' ? 'Pricing Strategy Engine' : currentView === 'costs' ? 'Product Costs & Limits' : currentView === 'definitions' ? 'Definitions & Formulas' : currentView === 'promotions' ? 'Promotion Management' : 'Settings'}
                            </h1>
                            <p className="text-sm mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                                {currentView === 'dashboard' ? 'Manage SKUs, review velocities, and calculate strategies.' : currentView === 'strategy' ? 'Define and apply rule-based pricing logic.' : currentView === 'products' ? 'Manage Master SKUs and platform aliases.' : currentView === 'costs' ? 'Set cost prices, and define minimum/maximum price guardrails.' : currentView === 'definitions' ? 'Reference guide for calculations and logic.' : currentView === 'promotions' ? 'Plan, execute, and track sales events across platforms.' : 'Manage platform fees, logistics rates, and user settings.'}
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            {userProfile.name && <span className="text-sm font-semibold animate-in fade-in slide-in-from-top-2" style={headerStyle}>Hello, {userProfile.name}!</span>}
                            
                            {/* GLOBAL UPLOAD MENU */}
                            {hasInventory && <QuickUploadMenu />}

                            <button className="relative p-2 hover:opacity-70 transition-opacity" style={headerStyle}><Bell className="w-6 h-6" /></button>
                            <div className="h-6 w-px" style={{ backgroundColor: `${headerTextColor}40` }}></div>
                            <UserProfile profile={userProfile} onUpdate={setUserProfile} />
                        </div>
                    </header>

                    <div className="flex-1 overflow-y-auto no-scrollbar relative p-4 md:p-8">
                        {currentView === 'products' && (
                            products.length === 0 ? (
                                <div className="flex flex-col items-center justify-center min-h-[500px] bg-custom-glass rounded-2xl border-2 border-dashed border-custom-glass text-center p-12 animate-in fade-in zoom-in duration-300 h-full">
                                    <div className="w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm" style={{ backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor }}><Database className="w-10 h-10" /></div>
                                    <h3 className="text-2xl font-bold text-gray-900">Welcome to Sello UK Hub</h3>
                                    <p className="text-gray-500 max-w-lg mt-3 mb-10 text-lg">Let's get your dashboard set up. Please upload your company reports in the order below to initialize the system.</p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl relative">
                                        <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative group ${hasInventory ? 'bg-green-50/50 border-green-200' : 'bg-gray-50/50 border-gray-200 hover:border-indigo-300'}`}>
                                            <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${hasInventory ? 'bg-green-600 text-white' : 'bg-white text-white'}`} style={!hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>{hasInventory ? 'Completed' : 'Step 1'}</div>
                                            <div className="p-4 bg-white rounded-full shadow-sm mb-4">{hasInventory ? <CheckCircle className="w-8 h-8 text-green-600" /> : <Database className="w-8 h-8" style={{ color: userProfile.themeColor }} />}</div>
                                            <h4 className="font-bold text-gray-900 text-lg">ERP Inventory Report</h4>
                                            <p className="text-sm text-gray-500 mt-2 text-center">Upload the 28-column ERP file to initialize Products, Stock Levels, COGS, and Categories.</p>
                                            <button onClick={() => setIsUploadModalOpen(true)} className={`mt-6 w-full py-3 bg-white border text-gray-700 font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${hasInventory ? 'border-green-300 text-green-700' : 'border-gray-300 hover:bg-opacity-5'}`} style={!hasInventory ? { borderColor: userProfile.themeColor, color: userProfile.themeColor } : {}}>{hasInventory ? 'Re-upload Inventory' : 'Upload Inventory'}</button>
                                        </div>
                                        <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative ${!hasInventory ? 'bg-gray-50/50 border-gray-200 opacity-60 cursor-not-allowed' : 'bg-custom-glass border-indigo-200 shadow-lg scale-105 z-10'}`}>
                                            <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${!hasInventory ? 'bg-gray-400 text-white' : 'text-white'}`} style={hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>Step 2</div>
                                            <div className="p-4 bg-white rounded-full shadow-sm mb-4"><FileBarChart className={`w-8 h-8 ${!hasInventory ? 'text-gray-400' : ''}`} style={hasInventory ? { color: userProfile.themeColor } : {}} /></div>
                                            <h4 className="font-bold text-gray-900 text-lg">Sales Transaction Report</h4>
                                            <p className="text-sm text-gray-500 mt-2 text-center">Once products are loaded, upload sales history to calculate Velocity, Fees, and Margins.</p>
                                            <button onClick={() => hasInventory && setIsSalesImportModalOpen(true)} disabled={!hasInventory} style={hasInventory ? { backgroundColor: userProfile.themeColor } : {}} className={`mt-6 w-full py-3 font-bold rounded-lg flex items-center justify-center gap-2 text-white transition-all ${!hasInventory ? 'bg-gray-300' : 'hover:opacity-90 shadow-lg'}`}><Upload className="w-5 h-5" /> Upload Sales</button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <ProductManagementPage
                                    products={products}
                                    pricingRules={pricingRules}
                                    promotions={promotions}
                                    priceHistoryMap={priceHistoryMap}
                                    onOpenMappingModal={() => setIsMappingModalOpen(true)}
                                    onAnalyze={handleAnalyze}
                                    dateLabels={dynamicDateLabels}
                                    onUpdateProduct={handleUpdateProduct}
                                    themeColor={userProfile.themeColor}
                                    headerStyle={headerStyle}
                                />
                            )
                        )}
                        {currentView === 'strategy' && (<StrategyPage products={products} pricingRules={pricingRules} currentConfig={strategyRules} onSaveConfig={(newConfig: StrategyConfig) => { setStrategyRules(newConfig); setCurrentView('products'); }} themeColor={userProfile.themeColor} headerStyle={headerStyle} priceHistoryMap={priceHistoryMap} promotions={promotions} priceChangeHistory={priceChangeHistory} />)}
                        {currentView === 'costs' && (<CostManagementPage products={products} onUpdateCosts={handleUpdateCosts} onOpenUpload={() => setIsCostUploadModalOpen(true)} logisticsRules={logisticsRules} themeColor={userProfile.themeColor} headerStyle={headerStyle} />)}
                        {currentView === 'promotions' && (<PromotionPage products={products} pricingRules={pricingRules} logisticsRules={logisticsRules} promotions={promotions} priceHistoryMap={priceHistoryMap} onAddPromotion={handleAddPromotion} onUpdatePromotion={handleUpdatePromotion} onDeletePromotion={handleDeletePromotion} themeColor={userProfile.themeColor} headerStyle={headerStyle} />)}
                        {currentView === 'definitions' && (<DefinitionsPage headerStyle={headerStyle} />)}
                        {currentView === 'settings' && (<SettingsPage currentRules={pricingRules} onSave={(newRules, newVelocity) => { setPricingRules(newRules); setVelocityLookback(newVelocity); }} logisticsRules={logisticsRules} onSaveLogistics={(newLogistics) => { setLogisticsRules(newLogistics); }} products={products} shipmentHistory={shipmentHistory} themeColor={userProfile.themeColor} headerStyle={headerStyle} />)}
                    </div>
                </main>

                {isUploadModalOpen && <BatchUploadModal products={products} onClose={() => setIsUploadModalOpen(false)} onConfirm={handleBatchUpdate} />}
                {isSalesImportModalOpen && <SalesImportModal products={products} pricingRules={pricingRules} learnedAliases={learnedAliases} onClose={() => setIsSalesImportModalOpen(false)} onResetData={handleResetData} onConfirm={handleSalesImport} />}
                {isCostUploadModalOpen && <CostUploadModal onClose={() => setIsCostUploadModalOpen(false)} onConfirm={handleUpdateCosts} />}
                {isMappingModalOpen && <MappingUploadModal products={products} platforms={Object.keys(pricingRules)} learnedAliases={learnedAliases} onClose={() => setIsMappingModalOpen(false)} onConfirm={handleUpdateMappings} />}
                {isReturnsModalOpen && <ReturnsUploadModal onClose={() => setIsReturnsModalOpen(false)} onConfirm={handleRefundImport} />}
                {isCAUploadModalOpen && <CAUploadModal onClose={() => setIsCAUploadModalOpen(false)} onConfirm={handleCAUpdate} />}
                {isShipmentModalOpen && <ShipmentUploadModal products={products} onClose={() => setIsShipmentModalOpen(false)} onConfirm={handleShipmentUpdate} />}
                
                {selectedProduct && (
                    <AnalysisModal
                        product={selectedProduct}
                        analysis={analysis}
                        isLoading={isAnalyzing}
                        onClose={() => setSelectedProduct(null)}
                        onApplyPrice={handleApplyPrice}
                        themeColor={userProfile.themeColor}
                    />
                )}
            </div>
        </>
    );
};

export default App;
