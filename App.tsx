
import React, { useState, useEffect } from 'react';
import { INITIAL_PRODUCTS, MOCK_PRICE_HISTORY, MOCK_PROMOTIONS } from './constants';
import { Product, AnalysisResult, PricingRules, PriceLog, PromotionEvent } from './types';
import ProductList from './components/ProductList';
import AnalysisModal from './components/AnalysisModal';
import BatchUploadModal, { BatchUpdateItem } from './components/BatchUploadModal';
import SalesImportModal, { HistoryPayload } from './components/SalesImportModal';
import SettingsPage from './components/SettingsPage';
import CostManagementPage from './components/CostManagementPage';
import CostUploadModal from './components/CostUploadModal';
import DefinitionsPage from './components/DefinitionsPage';
import PromotionPage from './components/PromotionPage';
import { analyzePriceAdjustment } from './services/geminiService';
import { LayoutDashboard, Settings, Bell, Upload, FileBarChart, MonitorPlay, DollarSign, BookOpen, Tag, Wifi, WifiOff } from 'lucide-react';

const DEFAULT_PRICING_RULES: PricingRules = {
  'Amazon(UK)': { markup: 2.0, commission: 15.0, manager: 'Bella Qin', color: '#FF9900' },
  'eBay': { markup: 0, commission: 10.0, manager: 'Sophie Nie', color: '#E53238' },
  'The Range': { markup: 0, commission: 12.0, manager: 'Queenie Wong', color: '#2C3E50' },
  'ManoMano': { markup: 0, commission: 18.0, manager: 'Queenie Wong', color: '#00D09C' },
  'Wayfair': { markup: 0, commission: 15.0, manager: 'Queenie Wong', color: '#7F187F' },
  'Onbuy': { markup: 0, commission: 9.0, manager: 'Queenie Wong', color: '#3B82F6' },
  'Groupon(UK)': { markup: 0, commission: 15.0, manager: 'Queenie Wong', color: '#53A318' },
  'Temu(UK)': { markup: 0, commission: 5.0, manager: 'Elaine Wang', color: '#FB7701' },
  'Tesco': { markup: 0, commission: 10.0, manager: 'Queenie Wong', color: '#00539F' },
  'Debenhams': { markup: 0, commission: 26.0, manager: 'Queenie Wong', color: '#1B4D3E' }
};

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

    // Find the "Sweet Spot": Maximize Total Daily Profit
    // Profit per unit = Price * (Margin%/100)
    // Total Daily Profit = Profit per unit * Velocity
    
    let bestPrice = 0;
    let maxDailyProfit = -Infinity;

    logs.forEach(log => {
        // Approximate profit per unit based on the log's margin and price
        const profitPerUnit = log.price * (log.margin / 100);
        const dailyProfit = profitPerUnit * log.velocity;
        
        if (dailyProfit > maxDailyProfit) {
            maxDailyProfit = dailyProfit;
            bestPrice = log.price;
        }
    });

    return bestPrice > 0 ? bestPrice : undefined;
};


const App: React.FC = () => {
  // --- DATABASE INITIALIZATION ---
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const saved = localStorage.getItem('ecompulse_products');
      const parsed = saved ? JSON.parse(saved) : null;
      return Array.isArray(parsed) ? parsed : INITIAL_PRODUCTS;
    } catch (e) {
      console.error("Failed to load products from storage", e);
      return INITIAL_PRODUCTS;
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

  const [priceHistory, setPriceHistory] = useState<PriceLog[]>(() => {
      try {
          const saved = localStorage.getItem('ecompulse_price_history');
          const parsed = saved ? JSON.parse(saved) : null;
          // Ensure it's an array
          return Array.isArray(parsed) ? parsed : MOCK_PRICE_HISTORY;
      } catch (e) {
          return MOCK_PRICE_HISTORY;
      }
  });

  const [priceDateLabels, setPriceDateLabels] = useState<{current: string, last: string}>(() => {
     try {
         const saved = localStorage.getItem('ecompulse_date_labels');
         return saved ? JSON.parse(saved) : { current: '', last: '' };
     } catch(e) {
         return { current: '', last: '' };
     }
  });

  // Promotions State
  const [promotions, setPromotions] = useState<PromotionEvent[]>(() => {
      try {
          const saved = localStorage.getItem('ecompulse_promotions');
          const parsed = saved ? JSON.parse(saved) : null;
          return Array.isArray(parsed) ? parsed : MOCK_PROMOTIONS;
      } catch (e) {
          return MOCK_PROMOTIONS;
      }
  });

  // --- STATE MANAGEMENT ---
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSalesImportModalOpen, setIsSalesImportModalOpen] = useState(false);
  const [isCostUploadModalOpen, setIsCostUploadModalOpen] = useState(false);
  const [currentView, setCurrentView] = useState<'dashboard' | 'settings' | 'costs' | 'definitions' | 'promotions'>('dashboard');
  
  // Connectivity State
  const [isOnline, setIsOnline] = useState(navigator.onLine);

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

  // --- EFFECT: Calculate Optimal Prices on Init ---
  useEffect(() => {
     // Safety check
     if (!Array.isArray(products) || !Array.isArray(priceHistory)) return;

     // If products exist but don't have optimal prices, try to calculate them from history
     const needsUpdate = products.some(p => p.optimalPrice === undefined);
     if (needsUpdate && priceHistory.length > 0) {
         setProducts(prev => prev.map(p => ({
             ...p,
             optimalPrice: calculateOptimalPrice(p.sku, priceHistory) || p.optimalPrice
         })));
     }
  }, []); // Run once on mount

  // --- PERSISTENCE ---
  useEffect(() => {
    localStorage.setItem('ecompulse_products', JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    localStorage.setItem('ecompulse_rules', JSON.stringify(pricingRules));
  }, [pricingRules]);

  useEffect(() => {
      localStorage.setItem('ecompulse_date_labels', JSON.stringify(priceDateLabels));
  }, [priceDateLabels]);
  
  useEffect(() => {
      localStorage.setItem('ecompulse_price_history', JSON.stringify(priceHistory));
  }, [priceHistory]);
  
  useEffect(() => {
      localStorage.setItem('ecompulse_promotions', JSON.stringify(promotions));
  }, [promotions]);


  // --- HANDLERS ---

  const handleRestoreData = (data: { products: Product[], rules: PricingRules, history?: PriceLog[], promotions?: PromotionEvent[] }) => {
    const restoredHistory = data.history || [];
    
    // Recalculate optimal prices for the restored products using the restored history immediately
    const enrichedProducts = data.products.map(p => ({
        ...p,
        optimalPrice: calculateOptimalPrice(p.sku, restoredHistory)
    }));

    setProducts(enrichedProducts);
    setPricingRules(data.rules);
    setPriceHistory(restoredHistory);
    // Explicitly restore promotions, defaulting to empty array if missing in backup to avoid stale state
    setPromotions(data.promotions || []);
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

    // Create Log Entry
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
    
    // Calculate new optimal price based on updated history
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

  // Bulk Adjustment Handler
  const handleApplyBatchChanges = (updates: { productId: string; newPrice: number }[]) => {
      const newLogs: PriceLog[] = [];
      const now = new Date().toISOString();

      const updatedProducts = products.map(p => {
          const update = updates.find(u => u.productId === p.id);
          if (update && Math.abs(update.newPrice - p.currentPrice) > 0.001) {
              // Log the change
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

      // Recalculate optimal prices for affected products
      const finalProducts = updatedProducts.map(p => {
          if (updates.find(u => u.productId === p.id)) {
             return { ...p, optimalPrice: calculateOptimalPrice(p.sku, updatedHistory) };
          }
          return p;
      });

      setProducts(finalProducts);
  };

  const handleBatchUpdate = (updates: BatchUpdateItem[]) => {
    setProducts(prev => prev.map(p => {
      const update = updates.find(u => u.sku === p.sku);
      if (update) {
        const newStock = update.stock !== undefined ? update.stock : p.stockLevel;
        const newPrice = update.price !== undefined ? update.price : p.currentPrice;
        const newLeadTime = update.leadTime !== undefined ? update.leadTime : p.leadTimeDays;

        const dailyVelocity = p.averageDailySales;
        const daysRemaining = dailyVelocity > 0 ? newStock / dailyVelocity : 999;
        
        let status: 'Critical' | 'Warning' | 'Healthy' | 'Overstock' = 'Healthy';
        let recommendation = 'Maintain';
        const leadTime = newLeadTime || 30;

        if (daysRemaining < leadTime) {
            status = 'Critical';
            recommendation = 'Increase Price';
        } else if (daysRemaining > leadTime * 4) {
            status = 'Overstock';
            recommendation = 'Decrease Price';
        } else if (daysRemaining < leadTime * 1.5) {
            status = 'Warning';
            recommendation = 'Maintain';
        }

        return {
          ...p,
          oldPrice: newPrice !== p.currentPrice ? p.currentPrice : p.oldPrice,
          currentPrice: newPrice,
          stockLevel: newStock,
          leadTimeDays: leadTime,
          lastUpdated: new Date().toISOString().split('T')[0],
          daysRemaining: Math.floor(daysRemaining),
          status,
          recommendation
        };
      }
      return p;
    }));
    setIsUploadModalOpen(false);
  };
  
  const handleSalesImport = (updatedProducts: Product[], dateLabels?: { current: string, last: string }, historyPayload?: HistoryPayload[]) => {
      // 1. Convert historyPayload to PriceLog[]
      const newLogs: PriceLog[] = [];
      if (historyPayload) {
          historyPayload.forEach(item => {
              // Find the product context to calculate margin if not provided
              const product = updatedProducts.find(p => p.sku === item.sku);
              if (product) {
                  newLogs.push({
                      id: `hist-${item.sku}-${item.date}-${Math.random().toString(36).substr(2, 5)}`,
                      sku: item.sku,
                      price: item.price,
                      velocity: item.velocity,
                      date: item.date,
                      // Use pre-calculated actual margin from import if available, else theoretical current margin
                      margin: item.margin !== undefined ? item.margin : calculateMargin(product, item.price)
                  });
              }
          });
      }

      // 2. Update History State
      let updatedHistory = [...priceHistory];
      if (newLogs.length > 0) {
          // Filter out existing logs for same dates to avoid duplicates if re-importing
          const newDates = new Set(newLogs.map(l => l.sku + l.date));
          updatedHistory = priceHistory.filter(l => !newDates.has(l.sku + l.date));
          updatedHistory = [...updatedHistory, ...newLogs];
          
          setPriceHistory(updatedHistory);
      }

      // 3. Update Products & Recalculate Optimal Price
      setProducts(prev => {
          return updatedProducts.map(newP => {
              const existing = prev.find(p => p.sku === newP.sku);
              return {
                  ...newP,
                  // Preserve manual settings if not in import
                  costPrice: newP.costPrice || existing?.costPrice,
                  floorPrice: existing?.floorPrice,
                  ceilingPrice: existing?.ceilingPrice,
                  // Recalculate optimal price based on the NEW merged history
                  optimalPrice: calculateOptimalPrice(newP.sku, updatedHistory) 
              };
          });
      });

      if (dateLabels) {
          setPriceDateLabels(dateLabels);
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

  const handleAddPromotion = (promo: PromotionEvent) => {
      setPromotions(prev => [promo, ...prev]);
  };

  const handleUpdatePromotion = (updatedPromo: PromotionEvent) => {
      setPromotions(prev => prev.map(p => p.id === updatedPromo.id ? updatedPromo : p));
  };

  return (
    <div className="min-h-screen bg-gray-50 flex font-sans text-gray-900">
      
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-gray-200 hidden md:flex flex-col fixed h-full z-50">
        <div className="p-6 flex items-center gap-3">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold">
            E
          </div>
          <span className="font-bold text-xl tracking-tight text-gray-900">EcomPulse</span>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-1">
          <button 
            onClick={() => setCurrentView('dashboard')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
              currentView === 'dashboard' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <LayoutDashboard className="w-5 h-5" />
            Pricing Tool
          </button>
          
          <button 
            onClick={() => setCurrentView('costs')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
              currentView === 'costs' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <DollarSign className="w-5 h-5" />
            Cost Management
          </button>

          <button 
            onClick={() => setCurrentView('promotions')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
              currentView === 'promotions' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Tag className="w-5 h-5" />
            Promotions
          </button>

          <button 
            onClick={() => setCurrentView('settings')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
              currentView === 'settings' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <Settings className="w-5 h-5" />
            Configuration
          </button>
          
          <button 
            onClick={() => setCurrentView('definitions')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-medium transition-colors ${
              currentView === 'definitions' ? 'bg-indigo-50 text-indigo-700' : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            Definitions
          </button>
        </nav>

        <div className="p-4 border-t border-gray-100 space-y-4">
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <div className="flex justify-between items-center mb-1">
                <p className="text-xs font-semibold text-gray-500">Tool Status</p>
                <span className="text-[10px] text-gray-400">v1.0.1</span>
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
      <main className="flex-1 md:ml-64 p-8">
        {/* Top Bar */}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
                {currentView === 'dashboard' ? 'Pricing & Inventory Analysis' : 
                 currentView === 'costs' ? 'Product Costs & Limits' : 
                 currentView === 'definitions' ? 'Definitions & Formulas' : 
                 currentView === 'promotions' ? 'Promotion Management' :
                 'Settings'}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
                {currentView === 'dashboard' ? 'Manage SKUs, review velocities, and calculate strategies.' : 
                 currentView === 'costs' ? 'Set cost prices, and define minimum/maximum price guardrails.' : 
                 currentView === 'definitions' ? 'Reference guide for calculations and logic.' :
                 currentView === 'promotions' ? 'Plan, execute, and track sales events across platforms.' :
                 'Manage platform fees and user settings.'}
            </p>
          </div>
          <div className="flex items-center gap-4">
            <button className="relative p-2 text-gray-400 hover:text-gray-600 transition-colors">
              <Bell className="w-6 h-6" />
            </button>
            <div className="h-10 w-10 rounded-full bg-gray-200 border-2 border-white shadow-sm overflow-hidden">
              <img src="https://picsum.photos/100/100" alt="User" className="w-full h-full object-cover" />
            </div>
          </div>
        </header>

        {/* Content Area */}
        {currentView === 'dashboard' ? (
            <>
                <div className="mb-6 flex justify-end items-center gap-3">
                    <button 
                      onClick={() => setIsSalesImportModalOpen(true)}
                      className="px-4 py-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-lg text-sm font-medium hover:bg-indigo-100 transition-colors flex items-center gap-2"
                    >
                      <FileBarChart className="w-4 h-4" />
                      Import Transaction Report
                    </button>
                    <button 
                      onClick={() => setIsUploadModalOpen(true)}
                      className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
                    >
                      <Upload className="w-4 h-4" />
                      Batch Update Stock
                    </button>
                </div>
                
                <ProductList 
                    products={products} 
                    onAnalyze={handleAnalyze} 
                    onApplyChanges={handleApplyBatchChanges}
                    dateLabels={priceDateLabels}
                />
            </>
        ) : currentView === 'costs' ? (
            <CostManagementPage 
                products={products}
                onUpdateCosts={handleUpdateCosts}
                onOpenUpload={() => setIsCostUploadModalOpen(true)}
            />
        ) : currentView === 'promotions' ? (
            <PromotionPage 
                products={products}
                pricingRules={pricingRules}
                promotions={promotions}
                onAddPromotion={handleAddPromotion}
                onUpdatePromotion={handleUpdatePromotion}
            />
        ) : currentView === 'definitions' ? (
            <DefinitionsPage />
        ) : (
            <SettingsPage 
                currentRules={pricingRules} 
                onSave={(newRules) => {
                    setPricingRules(newRules);
                }} 
                products={products}
                onRestore={handleRestoreData}
                // Pass extra data for full backup
                extraData={{
                    priceHistory,
                    promotions
                }}
            />
        )}

      </main>

      {/* Analysis Modal */}
      {selectedProduct && (
        <AnalysisModal 
          product={selectedProduct}
          analysis={analysis}
          isLoading={isAnalyzing}
          onClose={() => setSelectedProduct(null)}
          onApplyPrice={handleApplyPrice}
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

    </div>
  );
};

export default App;
