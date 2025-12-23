
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
import { analyzePriceAdjustment } from './services/geminiService';
import { LayoutDashboard, Settings, Bell, Upload, FileBarChart, DollarSign, BookOpen, Tag, Wifi, WifiOff, Database, CheckCircle, ArrowRight, Package, Download, Calculator, RotateCcw } from 'lucide-react';

// --- LOGIC HELPERS ---

const calculateMargin = (p: Product, price: number): number => {
  const totalCost = (p.costPrice || 0) + 
                    (p.sellingFee || 0) + 
                    (p.adsFee || 0) + 
                    (p.postage || 0) + 
                    (p.otherFee || 0) + 
                    (p.subscriptionFee || 0) + 
                    (p.wmsFee || 0);
                    
  const totalIncome = price + (p.extraFreight || 0);
  
  // Net Profit = (Price + ExtraFreight) - TotalCosts
  const netProfit = totalIncome - totalCost;
  
  // Margin % = (NetProfit / Price) * 100 
  return price > 0 ? (netProfit / price) * 100 : 0;
};

const calculateOptimalPrice = (sku: string, currentHistory: PriceLog[]): number | undefined => {
    if (!Array.isArray(currentHistory)) return undefined;
    
    const logs = currentHistory.filter(l => l.sku === sku);
    if (logs.length === 0) return undefined;
    
    let bestPrice = 0;
    let maxDailyProfit = -Infinity;

    logs.forEach(log => {
        const profitPerUnit = log.price * (log.margin / 100);
        const dailyProfit = profitPerUnit * log.velocity;
        
        if (dailyProfit > maxDailyProfit) {
            maxDailyProfit = dailyProfit;
            bestPrice = log.price;
        }
    });

    return bestPrice > 0 ? bestPrice : undefined;
};

// Helper to determine Friday-Thursday week ranges relative to a specific date
const getFridayThursdayRanges = (anchorDate: Date = new Date()) => {
    const currentDay = anchorDate.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    // Target: Friday (5).
    const diff = (currentDay + 2) % 7;
    
    const currentStart = new Date(anchorDate);
    currentStart.setDate(anchorDate.getDate() - diff);
    currentStart.setHours(0,0,0,0);
    
    const currentEnd = new Date(currentStart);
    currentEnd.setDate(currentEnd.getDate() + 6);
    currentEnd.setHours(23,59,59,999);
    
    const lastStart = new Date(currentStart);
    lastStart.setDate(lastStart.getDate() - 7);
    
    const lastEnd = new Date(lastStart);
    lastEnd.setDate(lastEnd.getDate() + 6);
    lastEnd.setHours(23,59,59,999);
    
    return { current: { start: currentStart, end: currentEnd }, last: { start: lastStart, end: lastEnd } };
};

const formatDateShort = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

const App: React.FC = () => {
  // --- DATABASE INITIALIZATION ---
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('ecompulse_products');
      return saved ? JSON.parse(saved) : []; 
    } catch (e) {
      console.error("Failed to load products from storage", e);
      return [];
    }
  });

  const [pricingRules, setPricingRules] = useState<PricingRules>(() => {
    try {
      const saved = localStorage.getItem('ecompulse_rules');
      const parsed = saved ? JSON.parse(saved) : null;
      return parsed && typeof parsed === 'object' ? parsed : DEFAULT_PRICING_RULES;
    } catch (e) {
      return DEFAULT_PRICING_RULES;
    }
  });

  const [logisticsRules, setLogisticsRules] = useState<LogisticsRule[]>(() => {
      try {
          const saved = localStorage.getItem('ecompulse_logistics');
          return saved ? JSON.parse(saved) : DEFAULT_LOGISTICS_RULES;
      } catch (e) {
          return DEFAULT_LOGISTICS_RULES;
      }
  });

  const [strategyRules, setStrategyRules] = useState<StrategyConfig>(() => {
      try {
          const saved = localStorage.getItem('ecompulse_strategy');
          return saved ? JSON.parse(saved) : DEFAULT_STRATEGY_RULES;
      } catch (e) {
          return DEFAULT_STRATEGY_RULES;
      }
  });

  const [velocityLookback, setVelocityLookback] = useState<VelocityLookback>(() => {
      try {
          return (localStorage.getItem('ecompulse_velocity_setting') as VelocityLookback) || '30';
      } catch (e) {
          return '30';
      }
  });

  const [priceHistory, setPriceHistory] = useState<PriceLog[]>(() => {
      try {
          const saved = localStorage.getItem('ecompulse_price_history');
          return saved ? JSON.parse(saved) : [];
      } catch (e) {
          return [];
      }
  });

  const [refundHistory, setRefundHistory] = useState<RefundLog[]>(() => {
      try {
          const saved = localStorage.getItem('ecompulse_refund_history');
          return saved ? JSON.parse(saved) : [];
      } catch (e) {
          return [];
      }
  });

  const [shipmentHistory, setShipmentHistory] = useState<ShipmentLog[]>(() => {
      try {
          const saved = localStorage.getItem('ecompulse_shipment_history');
          return saved ? JSON.parse(saved) : [];
      } catch (e) {
          return [];
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
          const saved = localStorage.getItem('ecompulse_promotions');
          return saved ? JSON.parse(saved) : MOCK_PROMOTIONS;
      } catch (e) {
          return MOCK_PROMOTIONS;
      }
  });

  // User Profile State
  const [userProfile, setUserProfile] = useState<UserProfileType>(() => {
      try {
          const saved = localStorage.getItem('ecompulse_user_profile');
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
      } catch(e) {
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
  
  const [currentView, setCurrentView] = useState<'dashboard' | 'strategy' | 'products' | 'settings' | 'costs' | 'definitions' | 'promotions'>('dashboard');
  
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
  useEffect(() => {
      if (priceHistory.length === 0) return;

      // 1. Determine Window Dates based on latest history and setting
      const anchorTime = latestHistoryDate.getTime();
      let lookbackDays = 30; // Default
      
      if (velocityLookback !== 'ALL') {
          lookbackDays = parseInt(velocityLookback, 10);
      } else {
          // If ALL, we just use a very large number effectively
          lookbackDays = 9999;
      }

      // Current Window: [Now - Lookback] to [Now]
      const currentWindowStart = anchorTime - (lookbackDays * 24 * 60 * 60 * 1000);
      
      // Previous Window: [Now - 2*Lookback] to [Now - Lookback]
      const prevWindowStart = anchorTime - (lookbackDays * 2 * 24 * 60 * 60 * 1000);
      const prevWindowEnd = currentWindowStart;

      setProducts(prevProducts => {
          let hasChanges = false;
          
          const updated = prevProducts.map(p => {
              // --- SALES VELOCITY ---
              // Get all history for this SKU
              const skuLogs = priceHistory.filter(l => l.sku === p.sku);
              
              // Helper to calculate avg velocity for a time window
              const calcAvgVel = (startMs: number, endMs: number) => {
                  const relevantLogs = skuLogs.filter(l => {
                      const d = new Date(l.date).getTime();
                      return d >= startMs && d <= endMs;
                  });
                  
                  if (relevantLogs.length === 0) return 0;
                  const sumVel = relevantLogs.reduce((acc, l) => acc + l.velocity, 0);
                  return sumVel / relevantLogs.length;
              };

              // --- RETURNS METRICS ---
              const skuRefunds = refundHistory.filter(r => r.sku === p.sku);
              let totalRefunded = 0;
              let refundedQty = 0;
              
              // Calculate refunds within current window
              skuRefunds.forEach(r => {
                  const rDate = new Date(r.date).getTime();
                  if (rDate >= currentWindowStart && rDate <= anchorTime) {
                      totalRefunded += r.amount;
                      refundedQty += r.quantity;
                  }
              });

              // Calculate Sales in same period for Rate %
              // Note: averageDailySales is daily * days = total sold approximation
              const estimatedSold = (calcAvgVel(currentWindowStart, anchorTime) || p.averageDailySales) * lookbackDays;
              const returnRate = estimatedSold > 0 ? (refundedQty / estimatedSold) * 100 : 0;

              const newAvgDaily = calcAvgVel(currentWindowStart, anchorTime);
              const newPrevDaily = calcAvgVel(prevWindowStart, prevWindowEnd);

              // Update conditions
              const velChanged = Math.abs(newAvgDaily - p.averageDailySales) > 0.001 || Math.abs((newPrevDaily || 0) - (p.previousDailySales || 0)) > 0.001;
              const returnsChanged = Math.abs((p.returnRate || 0) - returnRate) > 0.01 || Math.abs((p.totalRefunded || 0) - totalRefunded) > 0.01;

              if (velChanged || returnsChanged) {
                  hasChanges = true;
                  return {
                      ...p,
                      averageDailySales: Number(newAvgDaily.toFixed(2)),
                      previousDailySales: Number(newPrevDaily.toFixed(2)),
                      returnRate: Number(returnRate.toFixed(2)),
                      totalRefunded: Number(totalRefunded.toFixed(2))
                  };
              }
              return p;
          });

          return hasChanges ? updated : prevProducts;
      });

  }, [priceHistory, refundHistory, velocityLookback, latestHistoryDate]);


  // --- AUTO-AGGREGATION OF WEEKLY PRICES (EXISTING LOGIC, PRESERVED) ---
  useEffect(() => {
      if (priceHistory.length === 0) return;

      const { current, last } = weekRanges;
      
      setProducts(prevProducts => {
          let hasChanges = false;
          const updated = prevProducts.map(p => {
               const getAvg = (start: Date, end: Date) => {
                   const logs = priceHistory.filter(l => {
                       const d = new Date(l.date);
                       return l.sku === p.sku && d >= start && d <= end;
                   });
                   if (logs.length === 0) return null;
                   const totalRev = logs.reduce((acc, l) => acc + (l.price * l.velocity), 0);
                   const totalQty = logs.reduce((acc, l) => acc + l.velocity, 0);
                   return totalQty > 0 ? totalRev / totalQty : null;
               };
               
               const avgCurrent = getAvg(current.start, current.end);
               const avgLast = getAvg(last.start, last.end);
               
               let newCurrent = p.currentPrice;
               let newOld = p.oldPrice;
               
               if (avgCurrent !== null) newCurrent = Number(avgCurrent.toFixed(2));
               if (avgLast !== null) newOld = Number(avgLast.toFixed(2));
               
               if (Math.abs(newCurrent - p.currentPrice) > 0.001 || Math.abs((newOld || 0) - (p.oldPrice || 0)) > 0.001) {
                   hasChanges = true;
                   return { ...p, currentPrice: newCurrent, oldPrice: newOld };
               }
               return p;
          });
          return hasChanges ? updated : prevProducts;
      });
  }, [priceHistory, weekRanges]);


  // --- DATA PERSISTENCE (Local Storage) ---
  
  useEffect(() => { localStorage.setItem('ecompulse_products', JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem('ecompulse_rules', JSON.stringify(pricingRules)); }, [pricingRules]);
  useEffect(() => { localStorage.setItem('ecompulse_logistics', JSON.stringify(logisticsRules)); }, [logisticsRules]);
  useEffect(() => { localStorage.setItem('ecompulse_strategy', JSON.stringify(strategyRules)); }, [strategyRules]);
  useEffect(() => { localStorage.setItem('ecompulse_price_history', JSON.stringify(priceHistory)); }, [priceHistory]);
  useEffect(() => { localStorage.setItem('ecompulse_refund_history', JSON.stringify(refundHistory)); }, [refundHistory]);
  useEffect(() => { localStorage.setItem('ecompulse_shipment_history', JSON.stringify(shipmentHistory)); }, [shipmentHistory]);
  useEffect(() => { localStorage.setItem('ecompulse_promotions', JSON.stringify(promotions)); }, [promotions]);
  useEffect(() => { localStorage.setItem('ecompulse_user_profile', JSON.stringify(userProfile)); }, [userProfile]);
  useEffect(() => { localStorage.setItem('ecompulse_velocity_setting', velocityLookback); }, [velocityLookback]);


  // --- HANDLERS ---

  const handleRestoreData = (data: { products: Product[], rules: PricingRules, logistics?: LogisticsRule[], history?: PriceLog[], refunds?: RefundLog[], promotions?: PromotionEvent[], velocitySetting?: VelocityLookback }) => {
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
      velocitySetting: velocityLookback,
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecompulse_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
      // 1. Process new history logs
      const newLogs: PriceLog[] = [];
      if (historyPayload) {
          historyPayload.forEach(item => {
              // Find matching product in existing catalog first, or fall back to updated list
              const product = products.find(p => p.sku === item.sku) || updatedProducts.find(p => p.sku === item.sku);
              if (product) {
                  newLogs.push({
                      id: `hist-${item.sku}-${item.date}-${Math.random().toString(36).substr(2, 5)}`,
                      sku: item.sku,
                      price: item.price,
                      velocity: item.velocity,
                      date: item.date,
                      margin: item.margin !== undefined ? item.margin : calculateMargin(product, item.price),
                      platform: item.platform 
                  });
              }
          });
      }

      let updatedHistory = [...priceHistory];
      if (newLogs.length > 0) {
          const newDates = new Set(newLogs.map(l => l.sku + l.date));
          updatedHistory = priceHistory.filter(l => !newDates.has(l.sku + l.date));
          updatedHistory = [...updatedHistory, ...newLogs];
          setPriceHistory(updatedHistory);
      }

      if (shipmentLogs && shipmentLogs.length > 0) {
          setShipmentHistory(prev => [...prev, ...shipmentLogs]);
      }

      // --- CRITICAL FIX: MERGE UPDATES INSTEAD OF REPLACE ---
      // This ensures we don't lose the 600+ products that had no sales in this report
      setProducts(prev => {
          const updateMap = new Map(updatedProducts.map(p => [p.sku, p]));
          
          return prev.map(existing => {
              if (updateMap.has(existing.sku)) {
                  const newP = updateMap.get(existing.sku)!;
                  return {
                      ...newP, // Overwrite with new sales data
                      // Preserve existing fields that might not be in the sales update
                      brand: existing.brand || newP.brand,
                      cartonDimensions: existing.cartonDimensions || newP.cartonDimensions,
                      inventoryStatus: existing.inventoryStatus || newP.inventoryStatus,
                      costPrice: newP.costPrice || existing.costPrice,
                      floorPrice: existing.floorPrice,
                      ceilingPrice: existing.ceilingPrice,
                      // Recalculate optimal based on updated history
                      optimalPrice: calculateOptimalPrice(newP.sku, updatedHistory) 
                  };
              }
              return existing; // Keep product as-is if not in this sales report
          });
      });

      // --- AUTO ADD PLATFORMS TO CONFIG ---
      if (discoveredPlatforms && discoveredPlatforms.length > 0) {
          setPricingRules(prevRules => {
              const newRules = { ...prevRules };
              let hasChanges = false;
              
              discoveredPlatforms.forEach(plat => {
                  if (!newRules[plat]) {
                      // Attempt to inherit from parent platform
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
              // Get all new mappings for this product from the uploaded file
              const myMappings = mappings.filter(m => m.masterSku === p.sku);
              if (myMappings.length === 0) return p;

              const updatedChannels = [...p.channels];
              
              // We know all myMappings are for the `platform` passed in arguments
              // Aggregate new aliases from the file for this SKU
              // Note: Using Set ensures file duplicates are removed
              const newAliases = new Set(myMappings.map(m => m.alias));

              // Helper for Fuzzy Matching Platforms
              const normalize = (s: string) => s.toLowerCase().trim();
              const targetPlatform = normalize(platform);
              
              // Try exact match first
              let existingChannelIndex = updatedChannels.findIndex(c => normalize(c.platform) === targetPlatform);
              
              // Try fuzzy match if exact fail (e.g. User selected "Amazon" but channel is "Amazon(UK)")
              if (existingChannelIndex === -1) {
                   existingChannelIndex = updatedChannels.findIndex(c => 
                        normalize(c.platform).includes(targetPlatform) || 
                        targetPlatform.includes(normalize(c.platform))
                   );
              }
              
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
              { id: 'dashboard', icon: LayoutDashboard, label: 'Pricing Tool' },
              { id: 'strategy', icon: Calculator, label: 'Strategy Engine' }, 
              { id: 'products', icon: Package, label: 'Product Mgmt.' },
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
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-all ${
                        isActive 
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
                {currentView === 'dashboard' ? 'Pricing & Inventory Analysis' : 
                 currentView === 'strategy' ? 'Pricing Strategy Engine' :
                 currentView === 'products' ? 'Product Management' :
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

        {/* Content Area - Using Display Toggling for Persistence */}
        
        {/* VIEW: DASHBOARD (Legacy/Pricing Tool) */}
        <div style={{ display: currentView === 'dashboard' ? 'block' : 'none' }} className="h-full">
            {!showDashboard ? (
                // --- ONBOARDING FLOW ---
                <div className="flex flex-col items-center justify-center min-h-[500px] bg-custom-glass rounded-2xl border-2 border-dashed border-custom-glass text-center p-12 animate-in fade-in zoom-in duration-300">
                        {/* ... (Existing onboarding code) ... */}
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
                                {hasInventory ? <CheckCircle className="w-8 h-8 text-green-600"/> : <Database className="w-8 h-8" style={{ color: userProfile.themeColor }} />}
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
                            <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative ${
                                !hasInventory ? 'bg-gray-50/50 border-gray-200 opacity-60 cursor-not-allowed' : 'bg-custom-glass border-indigo-200 shadow-lg scale-105 z-10'
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
                            
                            {hasInventory && (
                                <div className="absolute -right-4 top-1/2 -translate-y-1/2 bg-white rounded-full p-2 shadow-lg animate-pulse hidden md:block">
                                    <ArrowRight className="w-6 h-6" style={{ color: userProfile.themeColor }} />
                                </div>
                            )}
                        </div>
                        </div>
                </div>
            ) : (
                <>
                    {/* NORMAL DASHBOARD VIEW */}
                    <div className="mb-6 flex justify-end items-center gap-3">
                        <button 
                            onClick={() => setIsReturnsModalOpen(true)}
                            className="px-4 py-2 bg-red-50 text-red-600 border border-red-200 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors flex items-center gap-2"
                        >
                            <RotateCcw className="w-4 h-4" />
                            Import Refunds
                        </button>
                        <button 
                            onClick={() => setIsSalesImportModalOpen(true)}
                            style={{ color: userProfile.themeColor, borderColor: `${userProfile.themeColor}40`, backgroundColor: `${userProfile.themeColor}10` }}
                            className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-opacity-20 transition-colors flex items-center gap-2 backdrop-blur-sm"
                        >
                            <FileBarChart className="w-4 h-4" />
                            Import Transaction Report
                        </button>
                        <button 
                            onClick={() => setIsUploadModalOpen(true)}
                            className="px-4 py-2 bg-custom-glass border border-custom-glass text-gray-700 rounded-lg text-sm font-medium hover:bg-white/50 transition-colors flex items-center gap-2"
                        >
                            <Database className="w-4 h-4" />
                            Update Inventory (ERP)
                        </button>
                    </div>
                    
                    <ProductList 
                        products={products} 
                        onAnalyze={handleAnalyze} 
                        onApplyChanges={handleApplyBatchChanges}
                        dateLabels={dynamicDateLabels}
                        pricingRules={pricingRules}
                        themeColor={userProfile.themeColor}
                    />
                </>
            )}
        </div>

        {/* VIEW: STRATEGY ENGINE */}
        <div style={{ display: currentView === 'strategy' ? 'block' : 'none' }} className="h-full">
            <StrategyPage 
                products={products}
                pricingRules={pricingRules}
                currentConfig={strategyRules}
                onSaveConfig={(newConfig) => setStrategyRules(newConfig)}
                themeColor={userProfile.themeColor}
                headerStyle={headerStyle}
            />
        </div>

        {/* VIEW: PRODUCT MANAGEMENT */}
        <div style={{ display: currentView === 'products' ? 'block' : 'none' }} className="h-full">
            <ProductManagementPage 
                products={products}
                pricingRules={pricingRules}
                promotions={promotions}
                priceHistory={priceHistory}
                onOpenMappingModal={() => setIsMappingModalOpen(true)}
                onUpdateProduct={handleUpdateProduct}
                themeColor={userProfile.themeColor}
                headerStyle={headerStyle}
            />
        </div>

        {/* VIEW: COST MANAGEMENT */}
        <div style={{ display: currentView === 'costs' ? 'block' : 'none' }} className="h-full">
            <CostManagementPage 
                products={products}
                onUpdateCosts={handleUpdateCosts}
                onOpenUpload={() => setIsCostUploadModalOpen(true)}
                logisticsRules={logisticsRules}
                themeColor={userProfile.themeColor}
                headerStyle={headerStyle}
            />
        </div>

        {/* VIEW: PROMOTIONS */}
        <div style={{ display: currentView === 'promotions' ? 'block' : 'none' }} className="h-full">
            <PromotionPage 
                products={products}
                pricingRules={pricingRules}
                logisticsRules={logisticsRules}
                promotions={promotions}
                priceHistory={priceHistory}
                onAddPromotion={handleAddPromotion}
                onUpdatePromotion={handleUpdatePromotion}
                themeColor={userProfile.themeColor}
                headerStyle={headerStyle}
            />
        </div>

        {/* VIEW: DEFINITIONS */}
        <div style={{ display: currentView === 'definitions' ? 'block' : 'none' }} className="h-full">
            <DefinitionsPage headerStyle={headerStyle} />
        </div>

        {/* VIEW: SETTINGS */}
        <div style={{ display: currentView === 'settings' ? 'block' : 'none' }} className="h-full">
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
                extraData={{
                    priceHistory,
                    promotions
                }}
                shipmentHistory={shipmentHistory}
                themeColor={userProfile.themeColor}
                headerStyle={headerStyle}
            />
        </div>

      </main>

      {/* Analysis Modal */}
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

      {/* Modals */}
      {isUploadModalOpen && (
        <BatchUploadModal 
          products={products}
          onClose={() => setIsUploadModalOpen(false)}
          onConfirm={handleBatchUpdate}
        />
      )}
      
      {isSalesImportModalOpen && (
        <SalesImportModal
            products={products}
            pricingRules={pricingRules}
            onClose={() => setIsSalesImportModalOpen(false)}
            onConfirm={handleSalesImport}
        />
      )}

      {isCostUploadModalOpen && (
        <CostUploadModal
            onClose={() => setIsCostUploadModalOpen(false)}
            onConfirm={handleUpdateCosts}
        />
      )}

      {isMappingModalOpen && (
        <MappingUploadModal
            products={products}
            platforms={Object.keys(pricingRules)}
            onClose={() => setIsMappingModalOpen(false)}
            onConfirm={handleUpdateMappings}
        />
      )}

      {isReturnsModalOpen && (
        <ReturnsUploadModal
            onClose={() => setIsReturnsModalOpen(false)}
            onConfirm={handleRefundImport}
        />
      )}

    </div>
    </>
  );
};

export default App;
