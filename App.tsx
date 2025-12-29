
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { INITIAL_PRODUCTS, MOCK_PRICE_HISTORY, MOCK_PROMOTIONS, DEFAULT_PRICING_RULES, DEFAULT_LOGISTICS_RULES, DEFAULT_STRATEGY_RULES } from './constants';
import { Product, AnalysisResult, PricingRules, PriceLog, PromotionEvent, UserProfile as UserProfileType, ChannelData, LogisticsRule, ShipmentLog, StrategyConfig, VelocityLookback, RefundLog } from './types';
import ProductList from './components/ProductList';
import AnalysisModal from './components/AnalysisModal';
import BatchUploadModal, { BatchUpdateItem } from './components/BatchUploadModal';
import SalesImportModal, { HistoryPayload } from './components/SalesImportModal';
import SettingsPage from './components/SettingsPage';
import CostManagementPage from './components/CostManagementPage';
import CostUploadModal from './components/CostUploadModal';
import DefinitionsPage from './components/DefinitionsPage';
import PromotionPage from './components/PromotionPage';
import UserProfile from './components/UserProfile';
import ProductManagementPage from './components/ProductManagementPage';
import MappingUploadModal, { SkuMapping } from './components/MappingUploadModal';
import StrategyPage from './components/StrategyPage';
import ReturnsUploadModal from './components/ReturnsUploadModal'; // New Import
import CAUploadModal from './components/CAUploadModal';
import { analyzePriceAdjustment } from './services/geminiService';
import { LayoutDashboard, Settings, Bell, Upload, FileBarChart, DollarSign, BookOpen, Tag, Wifi, WifiOff, Database, CheckCircle, ArrowRight, Package, Download, Calculator, RotateCcw, List } from 'lucide-react';

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
    // --- DATABASE INITIALIZATION ---
    const [products, setProducts] = useState<Product[]>(() => {
        try {
            const saved = localStorage.getItem('sello_products') || localStorage.getItem('ecompulse_products');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            console.error("Failed to load products from storage", e);
            return [];
        }
    });

    const [pricingRules, setPricingRules] = useState<PricingRules>(() => {
        try {
            const saved = localStorage.getItem('sello_rules') || localStorage.getItem('ecompulse_rules');
            const parsed = saved ? JSON.parse(saved) : null;
            return parsed && typeof parsed === 'object' ? parsed : DEFAULT_PRICING_RULES;
        } catch (e) {
            return DEFAULT_PRICING_RULES;
        }
    });

    const [logisticsRules, setLogisticsRules] = useState<LogisticsRule[]>(() => {
        try {
            const saved = localStorage.getItem('sello_logistics') || localStorage.getItem('ecompulse_logistics');
            return saved ? JSON.parse(saved) : DEFAULT_LOGISTICS_RULES;
        } catch (e) {
            return DEFAULT_LOGISTICS_RULES;
        }
    });

    const [strategyRules, setStrategyRules] = useState<StrategyConfig>(() => {
        try {
            const saved = localStorage.getItem('sello_strategy') || localStorage.getItem('ecompulse_strategy');
            return saved ? JSON.parse(saved) : DEFAULT_STRATEGY_RULES;
        } catch (e) {
            return DEFAULT_STRATEGY_RULES;
        }
    });

    const [velocityLookback, setVelocityLookback] = useState<VelocityLookback>(() => {
        try {
            return (localStorage.getItem('sello_velocity_setting') as VelocityLookback) || (localStorage.getItem('ecompulse_velocity_setting') as VelocityLookback) || '30';
        } catch (e) {
            return '30';
        }
    });

    const [priceHistory, setPriceHistory] = useState<PriceLog[]>(() => {
        try {
            const saved = localStorage.getItem('sello_price_history') || localStorage.getItem('ecompulse_price_history');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });

    // --- SMART CLEANUP LOGIC ---
    // Automatically prune legacy 'General' logs if specific platform logs exist for the same Date/SKU
    // This prevents "Double Counting" of revenue when users switch to the new multi-channel import mode.
    useEffect(() => {
        if (priceHistory.length === 0) return;

        const seenPlatforms = new Map<string, Set<string>>(); // Key: sku|date, Value: platforms
        priceHistory.forEach(l => {
            const key = `${l.sku}|${l.date}`;
            if (!seenPlatforms.has(key)) seenPlatforms.set(key, new Set());
            seenPlatforms.get(key)!.add(l.platform || 'General');
        });

        let hasDuplicates = false;
        const cleaned = priceHistory.filter(l => {
            const key = `${l.sku}|${l.date}`;
            const platforms = seenPlatforms.get(key);
            // If we have 'General' AND something else, remove the 'General' one
            if (platforms && platforms.size > 1 && (l.platform === 'General' || !l.platform)) {
                hasDuplicates = true;
                return false;
            }
            return true;
        });

        if (hasDuplicates) {
            setPriceHistory(cleaned);
        }
    }, [priceHistory.length]); // Only run when count changes

    const [refundHistory, setRefundHistory] = useState<RefundLog[]>(() => {
        try {
            const saved = localStorage.getItem('sello_refund_history') || localStorage.getItem('ecompulse_refund_history');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });

    const [shipmentHistory, setShipmentHistory] = useState<ShipmentLog[]>(() => {
        try {
            const saved = localStorage.getItem('sello_shipment_history') || localStorage.getItem('ecompulse_shipment_history');
            return saved ? JSON.parse(saved) : [];
        } catch (e) {
            return [];
        }
    });

    const [learnedAliases, setLearnedAliases] = useState<Record<string, string>>(() => {
        try {
            const saved = localStorage.getItem('sello_learned_aliases') || localStorage.getItem('ecompulse_learned_aliases');
            return saved ? JSON.parse(saved) : {};
        } catch (e) {
            return {};
        }
    });

    // Calculate the most recent data point to anchor the "Current Week" logic
    // This ensures that even if data is from last month, the UI shows relative comparison correctly
    const latestHistoryDate = useMemo(() => {
        if (priceHistory.length === 0) return new Date();
        // Safely parse dates and find max
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

    // Promotions State
    const [promotions, setPromotions] = useState<PromotionEvent[]>(() => {
        try {
            const saved = localStorage.getItem('sello_promotions') || localStorage.getItem('ecompulse_promotions');
            if (saved) {
                const parsed = JSON.parse(saved);
                // User Request: If data is empty (wiped), restore defaults automatically
                if (Array.isArray(parsed) && parsed.length > 0) return parsed;
            }
            return MOCK_PROMOTIONS;
        } catch (e) {
            return MOCK_PROMOTIONS;
        }
    });

    // User Profile State
    const [userProfile, setUserProfile] = useState<UserProfileType>(() => {
        try {
            const saved = localStorage.getItem('sello_user_profile') || localStorage.getItem('ecompulse_user_profile');
            const parsed = saved ? JSON.parse(saved) : {};
            return {
                name: parsed.name || '',
                themeColor: parsed.themeColor || '#4f46e5',
                backgroundImage: parsed.backgroundImage || '',
                backgroundColor: parsed.backgroundColor || '#f3f4f6',
                glassMode: parsed.glassMode || 'light',
                glassOpacity: parsed.glassOpacity !== undefined ? parsed.glassOpacity : 90,
                glassBlur: parsed.glassBlur !== undefined ? parsed.glassBlur : 10,
                ambientGlass: parsed.ambientGlass !== undefined ? parsed.ambientGlass : true,
                ambientGlassOpacity: parsed.ambientGlassOpacity !== undefined ? parsed.ambientGlassOpacity : 15,
                textColor: parsed.textColor // Add fallback handled below
            };
        } catch (e) {
            return {
                name: '',
                themeColor: '#4f46e5',
                backgroundImage: '',
                backgroundColor: '#f3f4f6',
                glassMode: 'light',
                glassOpacity: 90,
                glassBlur: 10,
                ambientGlass: true,
                ambientGlassOpacity: 15
            };
        }
    });

    // --- FIX: Sync Body AND HTML Background to eliminate gaps on scroll bounce ---
    useEffect(() => {
        const elements = [document.body, document.documentElement];

        elements.forEach(el => {
            // Clear potentially conflicting properties first
            el.style.background = '';
            el.style.backgroundColor = '';
            el.style.backgroundImage = '';

            if (userProfile.backgroundImage && userProfile.backgroundImage !== 'none') {
                const isUrl = userProfile.backgroundImage.startsWith('http') || userProfile.backgroundImage.startsWith('data:') || userProfile.backgroundImage.startsWith('/');

                // Apply backgroundImage directly
                el.style.backgroundImage = isUrl
                    ? `url(${userProfile.backgroundImage})`
                    : userProfile.backgroundImage;

                el.style.backgroundColor = 'transparent'; // Fallback
                el.style.backgroundSize = 'cover';
                el.style.backgroundPosition = 'center';
                el.style.backgroundAttachment = 'fixed';
                el.style.backgroundRepeat = 'no-repeat';
            } else {
                el.style.backgroundImage = 'none';
                el.style.backgroundColor = userProfile.backgroundColor || '#f3f4f6';
            }
        });
    }, [userProfile]);

    // --- STATE MANAGEMENT ---
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [isAnalyzing, setIsAnalyzing] = useState(false);
    const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
    const [isSalesImportModalOpen, setIsSalesImportModalOpen] = useState(false);
    const [isCostUploadModalOpen, setIsCostUploadModalOpen] = useState(false);
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [isReturnsModalOpen, setIsReturnsModalOpen] = useState(false); // NEW
    const [isCAUploadModalOpen, setIsCAUploadModalOpen] = useState(false);

    const [currentView, setCurrentView] = useState<'dashboard' | 'strategy' | 'products' | 'settings' | 'costs' | 'definitions' | 'promotions'>('products');

    // Connectivity State
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

    // Auto-update promotion statuses based on dates
    useEffect(() => {
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
    }, []);

    // --- CORE LOGIC: RECALCULATE VELOCITIES & RETURNS BASED ON SETTINGS ---
    // --- CORE LOGIC: RECALCULATE VELOCITIES & RETURNS BASED ON SETTINGS ---
    // --- DATA INDEXING FOR PERFORMANCE ---
    // Pre-group price history by SKU into a Map for O(1) lookup in child components
    const priceHistoryMap = useMemo(() => {
        const map = new Map<string, PriceLog[]>();
        priceHistory.forEach(l => {
            if (!map.has(l.sku)) map.set(l.sku, []);
            map.get(l.sku)!.push(l);
        });
        return map;
    }, [priceHistory]);

    // Pre-group refunds by SKU
    const refundHistoryMap = useMemo(() => {
        const map = new Map<string, RefundLog[]>();
        refundHistory.forEach(r => {
            if (!map.has(r.sku)) map.set(r.sku, []);
            map.get(r.sku)!.push(r);
        });
        return map;
    }, [refundHistory]);

    // --- CORE LOGIC: RECALCULATE VELOCITIES & RETURNS BASED ON SETTINGS ---
    useEffect(() => {
        if (priceHistory.length === 0) return;

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
    }, [priceHistoryMap, refundHistoryMap, velocityLookback, latestHistoryDate]);


    // --- AUTO-AGGREGATION OF WEEKLY PRICES (EXISTING LOGIC, PRESERVED) ---
    // --- AUTO-AGGREGATION OF WEEKLY PRICES (EXISTING LOGIC) ---
    useEffect(() => {
        if (priceHistory.length === 0) return;
        const { current, last } = weekRanges;

        setProducts(prevProducts => {
            let hasChanges = false;
            const updated = prevProducts.map(p => {
                const skuLogs = priceHistoryMap.get(p.sku) || [];
                const getAvg = (start: Date, end: Date) => {
                    const logs = skuLogs.filter(l => {
                        const d = new Date(l.date);
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
    }, [priceHistoryMap, weekRanges]);


    // --- DATA PERSISTENCE (Local Storage) ---
    const syncToStorage = (key: string, data: any) => {
        try {
            localStorage.setItem(key, typeof data === 'string' ? data : JSON.stringify(data));
        } catch (e) {
            console.error(`localStorage sync failed for ${key}`, e);
        }
    };

    useEffect(() => { syncToStorage('sello_products', products); }, [products]);
    useEffect(() => { syncToStorage('sello_rules', pricingRules); }, [pricingRules]);
    useEffect(() => { syncToStorage('sello_logistics', logisticsRules); }, [logisticsRules]);
    useEffect(() => { syncToStorage('sello_strategy', strategyRules); }, [strategyRules]);
    useEffect(() => { syncToStorage('sello_price_history', priceHistory); }, [priceHistory]);
    useEffect(() => { syncToStorage('sello_refund_history', refundHistory); }, [refundHistory]);
    useEffect(() => { syncToStorage('sello_shipment_history', shipmentHistory); }, [shipmentHistory]);
    useEffect(() => { syncToStorage('sello_promotions', promotions); }, [promotions]);
    useEffect(() => { syncToStorage('sello_user_profile', userProfile); }, [userProfile]);
    useEffect(() => { syncToStorage('sello_velocity_setting', velocityLookback); }, [velocityLookback]);
    useEffect(() => { syncToStorage('sello_learned_aliases', learnedAliases); }, [learnedAliases]);


    // --- HANDLERS ---

    const handleRestoreData = (data: {
        products: Product[],
        rules: PricingRules,
        logistics?: LogisticsRule[],
        history?: PriceLog[],
        refunds?: RefundLog[],
        promotions?: PromotionEvent[],
        learnedAliases?: Record<string, string>,
        velocitySetting?: VelocityLookback
    }) => {
        try {
            console.log("Restoring data...", { productCount: data.products?.length });

            const safeProducts = data.products ? JSON.parse(JSON.stringify(data.products)) : [];
            const safeRules = data.rules ? JSON.parse(JSON.stringify(data.rules)) : JSON.parse(JSON.stringify(DEFAULT_PRICING_RULES));
            const safeLogistics = data.logistics ? JSON.parse(JSON.stringify(data.logistics)) : JSON.parse(JSON.stringify(DEFAULT_LOGISTICS_RULES));
            const safeHistory = data.history ? JSON.parse(JSON.stringify(data.history)) : [];
            const safeRefunds = data.refunds ? JSON.parse(JSON.stringify(data.refunds)) : [];
            const safePromotions = data.promotions ? JSON.parse(JSON.stringify(data.promotions)) : [];
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
            setPromotions(safePromotions);
            setLearnedAliases(data.learnedAliases || {});
            setVelocityLookback(safeVelocity);
            alert("Database restored successfully!");
        } catch (e) {
            console.error("Failed to restore data", e);
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
        a.setAttribute('download', filename);
        document.body.appendChild(a);
        a.click();

        // Extended timeout to 30s to ensure browser starts the stream and captures the filename
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

    const handleApplyBatchChanges = (updates: { productId: string; newPrice: number }[]) => {
        const newLogs: PriceLog[] = [];
        const now = new Date().toISOString();

        const updatedProducts = products.map(p => {
            const update = updates.find(u => u.productId === p.id);
            if (update && Math.abs(update.newPrice - p.currentPrice) > 0.001) {
                newLogs.push({
                    id: Math.random().toString(36).substr(2, 9),
                    sku: p.sku,
                    date: now,
                    price: update.newPrice,
                    velocity: p.averageDailySales,
                    margin: calculateMargin(p, update.newPrice)
                });

                return {
                    ...p,
                    oldPrice: p.currentPrice,
                    currentPrice: update.newPrice,
                    lastUpdated: now.split('T')[0]
                };
            }
            return p;
        });

        const updatedHistory = [...priceHistory, ...newLogs];
        setPriceHistory(updatedHistory);

        const finalProducts = updatedProducts.map(p => {
            if (updates.find(u => u.productId === p.id)) {
                return { ...p, optimalPrice: calculateOptimalPrice(p.sku, updatedHistory) };
            }
            return p;
        });

        setProducts(finalProducts);
    };

    // INVENTORY REPORT HANDLER (Updated to support ERP Columns)
    const handleBatchUpdate = (updates: BatchUpdateItem[]) => {
        // 1. Process New Products
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
                    inventoryStatus: item.inventoryStatus, // Capture Inventory Status
                    cartonDimensions: item.cartonDimensions,
                    currentPrice: 0,
                    averageDailySales: 0,
                    channels: [],
                    leadTimeDays: 30, // Default
                    status: 'Healthy',
                    recommendation: 'Maintain',
                    daysRemaining: 999,
                    lastUpdated: new Date().toISOString().split('T')[0]
                });
            }
        });

        // 2. Update Existing Products
        const updatedExisting = products.map(p => {
            const update = updates.find(u => u.sku === p.sku);
            if (update) {
                // Update fields from ERP Report
                return {
                    ...p,
                    name: update.name || p.name,
                    brand: update.brand || p.brand,
                    category: update.category || p.category,
                    subcategory: update.subcategory || p.subcategory,
                    stockLevel: update.stock !== undefined ? update.stock : p.stockLevel,
                    costPrice: update.cost !== undefined ? update.cost : p.costPrice,
                    inventoryStatus: update.inventoryStatus || p.inventoryStatus, // Update Status
                    cartonDimensions: update.cartonDimensions || p.cartonDimensions,
                    lastUpdated: new Date().toISOString().split('T')[0]
                };
            }
            return p;
        });

        setProducts([...updatedExisting, ...newProducts]);
        setIsUploadModalOpen(false);
    };

    const handleSalesImport = (
        updatedProducts: Product[],
        dateLabels?: { current: string, last: string },
        historyPayload?: HistoryPayload[],
        shipmentLogs?: ShipmentLog[],
        discoveredPlatforms?: string[]
    ) => {
        try {
            console.log("Starting Sales Import...", {
                productCount: updatedProducts?.length,
                historyCount: historyPayload?.length
            });

            // 1. Process new history logs
            const newLogs: PriceLog[] = [];
            if (historyPayload && Array.isArray(historyPayload)) {
                historyPayload.forEach(item => {
                    const product = products.find(p => p.sku === item.sku) || updatedProducts.find(p => p.sku === item.sku);

                    const safePrice = Number(item.price) || 0;
                    const safeVelocity = Number(item.velocity) || 0;
                    const safeMargin = item.margin !== undefined && !isNaN(Number(item.margin))
                        ? Number(item.margin)
                        : calculateMargin(product!, safePrice);

                    if (item.sku) {
                        newLogs.push({
                            id: `hist-${item.sku}-${item.date || 'no-date'}-${Math.random().toString(36).substr(2, 5)}`,
                            sku: String(item.sku),
                            date: item.date || new Date().toISOString().split('T')[0],
                            price: safePrice,
                            velocity: safeVelocity,
                            margin: Number(safeMargin.toFixed(2)),
                            profit: item.profit ? Number(item.profit.toFixed(2)) : undefined,
                            platform: item.platform || 'General'
                        });
                    }
                });
            }

            let updatedHistory = [...priceHistory];
            if (newLogs.length > 0) {
                // Defines the Unique Key for a Price Log
                const getKey = (l: PriceLog) => `${l.sku}|${l.date}|${l.platform}|${l.orderId || ''}`;

                // 1. Identify "Granular Updates": SKU+Dates where we are now uploading specific Order IDs
                // We use this to purge "Legacy Aggregates" (data with no Order ID) for these days to avoid duplication
                const skuDatesWithOrders = new Set<string>();
                newLogs.forEach(l => {
                    if (l.orderId) skuDatesWithOrders.add(`${l.sku}|${l.date}`);
                });

                // 2. Create Set of Keys for O(1) Lookup of exact replacements
                const newLogKeys = new Set(newLogs.map(l => getKey(l)));

                // 3. Filter Logic
                updatedHistory = priceHistory.filter(l => {
                    // Rule A: Exact Match Replacement (e.g. updating a specific Order's profit)
                    if (newLogKeys.has(getKey(l))) return false;

                    // Rule B: Legacy Cleanup
                    // If we have an existing "Aggregate" (no OrderID) but we are now importing "Granular" data (with OrderID) for this SKU+Date,
                    // we MUST delete the aggregate to prevent double counting.
                    if (!l.orderId && skuDatesWithOrders.has(`${l.sku}|${l.date}`)) return false;

                    return true;
                });

                updatedHistory = [...updatedHistory, ...newLogs];
                setPriceHistory(updatedHistory);
            }

            if (shipmentLogs && Array.isArray(shipmentLogs) && shipmentLogs.length > 0) {
                setShipmentHistory(prev => [...prev, ...shipmentLogs]);
            }

            // 2. Pre-calculate Optimal Prices for updated products to avoid O(N*M) in setProducts
            const optimalPricesMap = new Map<string, number>();
            updatedProducts.forEach(p => {
                optimalPricesMap.set(p.sku, calculateOptimalPrice(p.sku, updatedHistory));
            });

            const updateMap = new Map(updatedProducts.map(p => [p.sku, p]));

            setProducts(prev => {
                return prev.map(existing => {
                    const update = updateMap.get(existing.sku);
                    if (update) {
                        const optimal = optimalPricesMap.get(existing.sku) || 0;

                        // Merge Channels carefully to preserve existing aliases if not replaced
                        const mergedChannels = [...existing.channels];
                        update.channels.forEach(newC => {
                            const idx = mergedChannels.findIndex(c => c.platform === newC.platform);
                            if (idx !== -1) {
                                mergedChannels[idx] = { ...mergedChannels[idx], ...newC };
                            } else {
                                mergedChannels.push(newC);
                            }
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
                });
            });

            // 3. Update Learned Aliases
            if (historyPayload) {
                setLearnedAliases(prev => {
                    const next = { ...prev };
                    let hasNew = false;
                    historyPayload.forEach(entry => {
                        // The modal now handles the 'learning' during resolution.
                        // This space is reserved for secondary verification if needed.
                    });
                    return hasNew ? next : prev;
                });
            }

            // 3. Update Pricing Rules
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
            console.error("Sales Import Error:", error);
            alert("An error occurred during import: " + (error.message || "Unknown error"));
        }
    };

    const handleResetData = () => {
        console.log("handleResetData called in App.tsx - Executing Immediate Reset");
        console.log("Reset confirmed by UI, clearing Sales History only...");

        // Wipe Sales/Transaction Data
        setPriceHistory([]);
        setShipmentHistory([]);
        setRefundHistory([]);
        // setPromotions([]); // PRESERVED: User requested to keep promotion "setup" data
        setAnalysis(null);

        // Optional: Reset calculated metrics on products to 0
        setProducts(prev => prev.map(p => ({
            ...p,
            averageDailySales: 0,
            previousDailySales: 0,
            returnRate: 0,
            totalRefunded: 0
        })));

        // Do NOT wipe: products, pricingRules, logisticsRules, userProfile
        // localStorage.clear(); // REMOVED
        // window.location.reload(); // REMOVED - allow React state to update
    };

    const handleUpdateCosts = (updates: any[]) => {
        setProducts(prev => prev.map(p => {
            const update = updates.find((u: any) => u.sku === p.sku);
            if (update) {
                const changes = { ...update };
                if (changes.cost !== undefined) {
                    changes.costPrice = changes.cost;
                    delete changes.cost;
                }
                return { ...p, ...changes };
            }
            return p;
        }));
        setIsCostUploadModalOpen(false);
    };

    const handleUpdateMappings = (mappings: SkuMapping[], mode: 'merge' | 'replace', platform: string) => {
        setProducts(prev => {
            let tempProducts = prev;

            // 1. If Replace mode, clear existing aliases for this platform
            if (mode === 'replace') {
                tempProducts = tempProducts.map(p => ({
                    ...p,
                    channels: p.channels.map(c => c.platform === platform ? { ...c, skuAlias: undefined } : c)
                }));
            }

            return tempProducts.map(p => {
                // Get all new mappings for this product
                const myMappings = mappings.filter(m => m.masterSku === p.sku);
                if (myMappings.length === 0) return p;

                const updatedChannels = [...p.channels];

                // We know all myMappings are for the `platform` passed in arguments
                // Aggregate new aliases from the file for this SKU
                const newAliases = new Set(myMappings.map(m => m.alias));

                const existingChannelIndex = updatedChannels.findIndex(c => c.platform === platform);

                if (existingChannelIndex !== -1) {
                    const currentChannel = updatedChannels[existingChannelIndex];

                    // If merge, get existing aliases and add them to the set
                    if (mode === 'merge' && currentChannel.skuAlias) {
                        currentChannel.skuAlias.split(',').forEach(a => newAliases.add(a.trim()));
                    }

                    updatedChannels[existingChannelIndex] = {
                        ...currentChannel,
                        skuAlias: Array.from(newAliases).join(', ')
                    };
                } else {
                    // Create new channel entry if it doesn't exist
                    updatedChannels.push({
                        platform: platform,
                        manager: 'Unassigned',
                        velocity: 0,
                        skuAlias: Array.from(newAliases).join(', ')
                    });
                }

                return { ...p, channels: updatedChannels };
            });
        });

        // 3. Learning Step: Populate global learned aliases
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

    const handleUpdateProduct = (updatedProduct: Product) => {
        setProducts(prev => prev.map(p => p.id === updatedProduct.id ? updatedProduct : p));
    };

    const handleAddPromotion = (promo: PromotionEvent) => {
        setPromotions(prev => [promo, ...prev]);
    };

    const handleUpdatePromotion = (updatedPromo: PromotionEvent) => {
        setPromotions(prev => prev.map(p => p.id === updatedPromo.id ? updatedPromo : p));
    };

    const handleDeletePromotion = (id: string) => {
        setPromotions(prev => prev.filter(p => p.id !== id));
    };

    const handleRefundImport = (newRefunds: RefundLog[]) => {
        setRefundHistory(prev => {
            // --- DEDUPLICATION LOGIC ---
            // Use the deterministic ID from the modal to identify existing records.
            const existingIds = new Set(prev.map(r => r.id));

            const uniqueNewRefunds = newRefunds.filter(r => !existingIds.has(r.id));

            if (uniqueNewRefunds.length < newRefunds.length) {
                console.log(`Skipped ${newRefunds.length - uniqueNewRefunds.length} duplicate refunds.`);
                // Optional: You could show a toast here, but simple logging is sufficient for now
            }

            return [...prev, ...uniqueNewRefunds];
        });

        // Note: The useEffect on [refundHistory] will automatically trigger recalculation of product return rates
        setIsReturnsModalOpen(false);
    };

    const handleCAUpdate = (updates: { sku: string; caPrice: number }[]) => {
        // Create a map for faster lookup (Normalized Keys)
        const priceMap = new Map<string, number>();
        updates.forEach(u => priceMap.set(u.sku.trim().toUpperCase(), u.caPrice));

        setProducts(prev => prev.map(p => {
            const masterSkuNorm = p.sku.trim().toUpperCase();

            // Priority 1: Direct Master SKU match (Case-Insensitive)
            if (priceMap.has(masterSkuNorm)) {
                return { ...p, caPrice: priceMap.get(masterSkuNorm) };
            }

            // Priority 2: Check Explicit Alias SKUs
            if (p.channels) {
                for (const channel of p.channels) {
                    if (channel.skuAlias) {
                        // Split comma-separated aliases and normalize
                        const aliases = channel.skuAlias.split(',').map(a => a.trim().toUpperCase());
                        const match = aliases.find(a => priceMap.has(a));
                        if (match) {
                            return { ...p, caPrice: priceMap.get(match) };
                        }
                    }
                }
            }

            // Priority 3: Fuzzy Suffix Match (e.g. Master is "CD1003", Report is "CD1003_1")
            for (const [reportSku, price] of priceMap.entries()) {
                if (reportSku.startsWith(masterSkuNorm + '_')) {
                    return { ...p, caPrice: price };
                }
            }

            // Priority 4: Reverse Suffix Match (e.g. Master is "CD1003_1", Report is "CD1003")
            const masterStripped = masterSkuNorm.replace(/_[0-9]+$/, '');
            if (masterStripped !== masterSkuNorm && priceMap.has(masterStripped)) {
                return { ...p, caPrice: priceMap.get(masterStripped) };
            }

            return p;
        }));
        setIsCAUploadModalOpen(false);
    };

    // Dynamic Styles
    const hasInventory = products.length > 0;
    const hasSalesData = priceHistory.length > 0 || products.some(p => p.averageDailySales > 0);

    const showDashboard = hasInventory && hasSalesData;
    const headerTextColor = userProfile.textColor || '#111827';
    // Reduced shadow intensity as requested
    const textShadowStyle = userProfile.backgroundImage && userProfile.backgroundImage !== 'none'
        ? { textShadow: '0 1px 3px rgba(0,0,0,0.3)' }
        : {};
    const headerStyle = { color: headerTextColor, ...textShadowStyle };

    // Glass Mode Logic
    const glassOpacityFraction = (userProfile.glassOpacity ?? 90) / 100;
    const glassBlur = userProfile.glassBlur ?? 10;
    const ambientOpacityFraction = (userProfile.ambientGlassOpacity ?? 15) / 100;

    return (
        <>
            {/* Dynamic Glass Styles Injection */}
            <style>{`
      /* GLOBAL RESET TO FIX GAPS */
      html, body {
        height: auto;
        margin: 0;
        padding: 0;
        min-height: 100vh;
      }

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

                {/* Ambient Depth Layer */}
                {userProfile.ambientGlass && (
                    <div
                        className="fixed inset-0 z-[1] pointer-events-none transition-all duration-500 bg-custom-ambient backdrop-blur-custom-ambient"
                    />
                )}

                {/* Sidebar */}
                <aside className={`w-64 border-r border-custom-glass hidden md:flex flex-col fixed h-full z-40 shadow-sm transition-all duration-300 bg-custom-glass`}>
                    <div className="p-6 flex items-center gap-3">
                        <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold transition-colors duration-300"
                            style={{ backgroundColor: userProfile.themeColor }}
                        >
                            S
                        </div>
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
                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${isActive
                                        ? 'bg-opacity-10'
                                        : 'text-gray-600 hover:bg-gray-50/50 hover:text-gray-900'
                                        }`}
                                    style={isActive ? { backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor } : {}}
                                >
                                    <item.icon className="w-5 h-5" style={isActive ? { color: userProfile.themeColor } : {}} />
                                    {item.label}
                                </button>
                            );
                        })}
                    </nav>

                    <div className="p-4 border-t border-custom-glass space-y-3">
                        {/* Database Quick Actions */}
                        <div className="px-2 space-y-2">
                            <button
                                onClick={handleExportBackup}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100/50 transition-colors border border-transparent hover:border-custom-glass"
                            >
                                <Download className="w-3.5 h-3.5" />
                                Backup Database
                            </button>
                            <button
                                onClick={() => fileRestoreRef.current?.click()}
                                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-100/50 transition-colors border border-transparent hover:border-custom-glass"
                            >
                                <Upload className="w-3.5 h-3.5" />
                                Restore Database
                            </button>
                            <input
                                ref={fileRestoreRef}
                                type="file"
                                accept=".json"
                                className="hidden"
                                onChange={handleImportFile}
                            />
                        </div>

                        <div className="bg-gray-50/50 rounded-xl p-4 border border-custom-glass">
                            <div className="flex justify-between items-center mb-1">
                                <p className="text-xs font-semibold text-gray-500">Tool Status</p>
                                <span className="text-[10px] text-gray-400">v1.5.0</span>
                            </div>
                            <div className={`flex items-center gap-2 text-sm ${isOnline ? 'text-green-600' : 'text-gray-500'}`}>
                                {isOnline ? (
                                    <>
                                        <span className="relative flex h-2 w-2">
                                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                                            <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
                                        </span>
                                        System Online
                                    </>
                                ) : (
                                    <>
                                        <WifiOff className="w-3 h-3" />
                                        Offline Mode
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </aside>

                {/* Main Content */}
                <main className="flex-1 md:ml-64 p-8 min-w-0 relative z-10">
                    {/* Top Bar */}
                    <header className="flex justify-between items-center mb-8">
                        <div>
                            <h1 className="text-2xl font-bold transition-colors" style={headerStyle}>
                                {currentView === 'products' ? 'Business Overview' :
                                    currentView === 'dashboard' ? 'Master Catalogue' :
                                        currentView === 'strategy' ? 'Pricing Strategy Engine' :
                                            currentView === 'costs' ? 'Product Costs & Limits' :
                                                currentView === 'definitions' ? 'Definitions & Formulas' :
                                                    currentView === 'promotions' ? 'Promotion Management' :
                                                        'Settings'}
                            </h1>
                            <p className="text-sm mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                                {currentView === 'dashboard' ? 'Manage SKUs, review velocities, and calculate strategies.' :
                                    currentView === 'strategy' ? 'Define and apply rule-based pricing logic.' :
                                        currentView === 'products' ? 'Manage Master SKUs and platform aliases.' :
                                            currentView === 'costs' ? 'Set cost prices, and define minimum/maximum price guardrails.' :
                                                currentView === 'definitions' ? 'Reference guide for calculations and logic.' :
                                                    currentView === 'promotions' ? 'Plan, execute, and track sales events across platforms.' :
                                                        'Manage platform fees, logistics rates, and user settings.'}
                            </p>
                        </div>
                        <div className="flex items-center gap-4">
                            {userProfile.name && (
                                <span className="text-sm font-semibold animate-in fade-in slide-in-from-top-2" style={headerStyle}>
                                    Hello, {userProfile.name}!
                                </span>
                            )}
                            <button className="relative p-2 hover:opacity-70 transition-opacity" style={headerStyle}>
                                <Bell className="w-6 h-6" />
                            </button>
                            <div className="h-6 w-px" style={{ backgroundColor: `${headerTextColor}40` }}></div>
                            <UserProfile profile={userProfile} onUpdate={setUserProfile} />
                        </div>
                    </header>



                    {/* Content Area - Persistence through conditional rendering */}
                    <div className="flex-1 overflow-y-auto no-scrollbar relative p-4 md:p-8">
                        {/* VIEW: OVERVIEW (Onboarding or Dashboard) */}
                        {currentView === 'products' && (
                            products.length === 0 ? (
                                <div className="flex flex-col items-center justify-center min-h-[500px] bg-custom-glass rounded-2xl border-2 border-dashed border-custom-glass text-center p-12 animate-in fade-in zoom-in duration-300 h-full">
                                    <div
                                        className="w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm"
                                        style={{ backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor }}
                                    >
                                        <Database className="w-10 h-10" />
                                    </div>
                                    <h3 className="text-2xl font-bold text-gray-900">Welcome to Sello UK Hub</h3>
                                    <p className="text-gray-500 max-w-lg mt-3 mb-10 text-lg">
                                        Let's get your dashboard set up. Please upload your company reports in the order below to initialize the system.
                                    </p>

                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl relative">
                                        {/* Step 1: Inventory */}
                                        <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative group ${hasInventory ? 'bg-green-50/50 border-green-200' : 'bg-gray-50/50 border-gray-200 hover:border-indigo-300'}`}>
                                            <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${hasInventory ? 'bg-green-600 text-white' : 'bg-white text-white'}`} style={!hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>
                                                {hasInventory ? 'Completed' : 'Step 1'}
                                            </div>
                                            <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                                                {hasInventory ? <CheckCircle className="w-8 h-8 text-green-600" /> : <Database className="w-8 h-8" style={{ color: userProfile.themeColor }} />}
                                            </div>
                                            <h4 className="font-bold text-gray-900 text-lg">ERP Inventory Report</h4>
                                            <p className="text-sm text-gray-500 mt-2 text-center">
                                                Upload the 28-column ERP file to initialize Products, Stock Levels, COGS, and Categories.
                                            </p>
                                            <button
                                                onClick={() => setIsUploadModalOpen(true)}
                                                className={`mt-6 w-full py-3 bg-white border text-gray-700 font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${hasInventory ? 'border-green-300 text-green-700' : 'border-gray-300 hover:bg-opacity-5'}`}
                                                style={!hasInventory ? { borderColor: userProfile.themeColor, color: userProfile.themeColor } : {}}
                                            >
                                                {hasInventory ? 'Re-upload Inventory' : 'Upload Inventory'}
                                            </button>
                                        </div>

                                        {/* Step 2: Sales History (Locked until Step 1 done) */}
                                        <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative ${!hasInventory ? 'bg-gray-50/50 border-gray-200 opacity-60 cursor-not-allowed' : 'bg-custom-glass border-indigo-200 shadow-lg scale-105 z-10'
                                            }`}>
                                            <div className={`absolute -top-4 px-4 py-1 rounded-full text-sm font-bold shadow-sm ${!hasInventory ? 'bg-gray-400 text-white' : 'text-white'}`} style={hasInventory ? { backgroundColor: userProfile.themeColor } : {}}>
                                                Step 2
                                            </div>
                                            <div className="p-4 bg-white rounded-full shadow-sm mb-4">
                                                <FileBarChart className={`w-8 h-8 ${!hasInventory ? 'text-gray-400' : ''}`} style={hasInventory ? { color: userProfile.themeColor } : {}} />
                                            </div>
                                            <h4 className="font-bold text-gray-900 text-lg">Sales Transaction Report</h4>
                                            <p className="text-sm text-gray-500 mt-2 text-center">
                                                Once products are loaded, upload sales history to calculate Velocity, Fees, and Margins.
                                            </p>
                                            <button
                                                onClick={() => hasInventory && setIsSalesImportModalOpen(true)}
                                                disabled={!hasInventory}
                                                style={hasInventory ? { backgroundColor: userProfile.themeColor } : {}}
                                                className={`mt-6 w-full py-3 font-bold rounded-lg flex items-center justify-center gap-2 text-white transition-all ${!hasInventory ? 'bg-gray-300' : 'hover:opacity-90 shadow-lg'}`}
                                            >
                                                <Upload className="w-5 h-5" />
                                                Upload Sales
                                            </button>
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
                                    onOpenSales={() => setIsSalesImportModalOpen(true)}
                                    onOpenInventory={() => setIsUploadModalOpen(true)}
                                    onOpenReturns={() => setIsReturnsModalOpen(true)}
                                    onOpenCA={() => setIsCAUploadModalOpen(true)}
                                    onAnalyze={handleAnalyze}
                                    dateLabels={dynamicDateLabels}
                                    onUpdateProduct={handleUpdateProduct}
                                    themeColor={userProfile.themeColor}
                                    headerStyle={headerStyle}
                                />
                            )
                        )}

                        {/* VIEW: STRATEGY ENGINE */}
                        {currentView === 'strategy' && (
                            <StrategyPage
                                products={products}
                                pricingRules={pricingRules}
                                currentConfig={strategyRules}
                                onSaveConfig={(newConfig: StrategyConfig) => {
                                    setStrategyRules(newConfig);
                                    setCurrentView('products');
                                }}
                                themeColor={userProfile.themeColor}
                                headerStyle={headerStyle}
                                priceHistoryMap={priceHistoryMap}
                                promotions={promotions}
                            />
                        )}

                        {/* VIEW: COST MANAGEMENT */}
                        {currentView === 'costs' && (
                            <CostManagementPage
                                products={products}
                                onUpdateCosts={handleUpdateCosts}
                                onOpenUpload={() => setIsCostUploadModalOpen(true)}
                                logisticsRules={logisticsRules}
                                themeColor={userProfile.themeColor}
                                headerStyle={headerStyle}
                            />
                        )}

                        {/* VIEW: PROMOTIONS */}
                        {currentView === 'promotions' && (
                            <PromotionPage
                                products={products}
                                pricingRules={pricingRules}
                                logisticsRules={logisticsRules}
                                promotions={promotions}
                                priceHistoryMap={priceHistoryMap}
                                onAddPromotion={handleAddPromotion}
                                onUpdatePromotion={handleUpdatePromotion}
                                onDeletePromotion={handleDeletePromotion}
                                themeColor={userProfile.themeColor}
                                headerStyle={headerStyle}
                            />
                        )}

                        {/* VIEW: DEFINITIONS */}
                        {currentView === 'definitions' && (
                            <DefinitionsPage headerStyle={headerStyle} />
                        )}

                        {/* VIEW: SETTINGS */}
                        {currentView === 'settings' && (
                            <SettingsPage
                                currentRules={pricingRules}
                                onSave={(newRules, newVelocity) => {
                                    setPricingRules(newRules);
                                    setVelocityLookback(newVelocity);
                                }}
                                logisticsRules={logisticsRules}
                                onSaveLogistics={(newLogistics) => {
                                    setLogisticsRules(newLogistics);
                                }}
                                products={products}
                                shipmentHistory={shipmentHistory}
                                themeColor={userProfile.themeColor}
                                headerStyle={headerStyle}
                            />
                        )}
                    </div>
                </main>


                {/* Analysis Modal */}


                {/* Modals */}
                {
                    isUploadModalOpen && (
                        <BatchUploadModal
                            products={products}
                            onClose={() => setIsUploadModalOpen(false)}
                            onConfirm={handleBatchUpdate}
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
                            onResetData={handleResetData}
                            onConfirm={handleSalesImport}
                        />
                    )
                }

                {
                    isCostUploadModalOpen && (
                        <CostUploadModal
                            onClose={() => setIsCostUploadModalOpen(false)}
                            onConfirm={handleUpdateCosts}
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
                            onConfirm={handleUpdateMappings}
                        />
                    )
                }

                {
                    isReturnsModalOpen && (
                        <ReturnsUploadModal
                            onClose={() => setIsReturnsModalOpen(false)}
                            onConfirm={handleRefundImport}
                        />
                    )
                }

                {
                    isCAUploadModalOpen && (
                        <CAUploadModal
                            onClose={() => setIsCAUploadModalOpen(false)}
                            onConfirm={handleCAUpdate}
                        />
                    )
                }

            </div >
        </>
    );
};

export default App;
