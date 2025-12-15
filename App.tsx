
import React, { useState, useEffect } from 'react';
import { INITIAL_PRODUCTS, MOCK_PRICE_HISTORY, MOCK_PROMOTIONS, DEFAULT_PRICING_RULES } from './constants';
import { Product, AnalysisResult, PricingRules, PriceLog, PromotionEvent, UserProfile as UserProfileType, ChannelData } from './types';
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
import MappingUploadModal, { SkuMapping } from './components/MappingUploadModal';
import { analyzePriceAdjustment } from './services/geminiService';
import { LayoutDashboard, Settings, Bell, Upload, FileBarChart, DollarSign, BookOpen, Tag, Wifi, WifiOff, Database, CheckCircle, ArrowRight } from 'lucide-react';

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

  const [priceHistory, setPriceHistory] = useState<PriceLog[]>(() => {
      try {
          const saved = localStorage.getItem('ecompulse_price_history');
          return saved ? JSON.parse(saved) : [];
      } catch (e) {
          return [];
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
          return saved ? JSON.parse(saved) : [];
      } catch (e) {
          return [];
      }
  });

  // User Profile State
  const [userProfile, setUserProfile] = useState<UserProfileType>(() => {
      try {
          const saved = localStorage.getItem('ecompulse_user_profile');
          return saved ? JSON.parse(saved) : { 
              name: '', 
              themeColor: '#4f46e5', 
              backgroundImage: '', 
              backgroundColor: '#f3f4f6' 
          };
      } catch(e) {
          return { name: '', themeColor: '#4f46e5', backgroundImage: '', backgroundColor: '#f3f4f6' };
      }
  });

  // --- STATE MANAGEMENT ---
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [isSalesImportModalOpen, setIsSalesImportModalOpen] = useState(false);
  const [isCostUploadModalOpen, setIsCostUploadModalOpen] = useState(false);
  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  
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

  // --- DATA PERSISTENCE (Local Storage) ---
  
  useEffect(() => { localStorage.setItem('ecompulse_products', JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem('ecompulse_rules', JSON.stringify(pricingRules)); }, [pricingRules]);
  useEffect(() => { localStorage.setItem('ecompulse_date_labels', JSON.stringify(priceDateLabels)); }, [priceDateLabels]);
  useEffect(() => { localStorage.setItem('ecompulse_price_history', JSON.stringify(priceHistory)); }, [priceHistory]);
  useEffect(() => { localStorage.setItem('ecompulse_promotions', JSON.stringify(promotions)); }, [promotions]);
  useEffect(() => { localStorage.setItem('ecompulse_user_profile', JSON.stringify(userProfile)); }, [userProfile]);


  // --- HANDLERS ---

  const handleRestoreData = (data: { products: Product[], rules: PricingRules, history?: PriceLog[], promotions?: PromotionEvent[] }) => {
    try {
        console.log("Restoring data...", { productCount: data.products?.length });
        
        const safeProducts = data.products ? JSON.parse(JSON.stringify(data.products)) : [];
        const safeRules = data.rules ? JSON.parse(JSON.stringify(data.rules)) : JSON.parse(JSON.stringify(DEFAULT_PRICING_RULES));
        const safeHistory = data.history ? JSON.parse(JSON.stringify(data.history)) : [];
        const safePromotions = data.promotions ? JSON.parse(JSON.stringify(data.promotions)) : [];

        const enrichedProducts = safeProducts.map((p: Product) => ({
            ...p,
            optimalPrice: calculateOptimalPrice(p.sku, safeHistory)
        }));

        setProducts(enrichedProducts);
        setPricingRules(safeRules);
        setPriceHistory(safeHistory);
        setPromotions(safePromotions);
        
    } catch (e) {
        console.error("Failed to restore data", e);
        alert("An error occurred while loading data. Please try again.");
    }
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
                cartonDimensions: update.cartonDimensions || p.cartonDimensions,
                lastUpdated: new Date().toISOString().split('T')[0]
            };
        }
        return p;
    });

    setProducts([...updatedExisting, ...newProducts]);
    setIsUploadModalOpen(false);
  };
  
  const handleSalesImport = (updatedProducts: Product[], dateLabels?: { current: string, last: string }, historyPayload?: HistoryPayload[]) => {
      const newLogs: PriceLog[] = [];
      if (historyPayload) {
          historyPayload.forEach(item => {
              const product = updatedProducts.find(p => p.sku === item.sku);
              if (product) {
                  newLogs.push({
                      id: `hist-${item.sku}-${item.date}-${Math.random().toString(36).substr(2, 5)}`,
                      sku: item.sku,
                      price: item.price,
                      velocity: item.velocity,
                      date: item.date,
                      margin: item.margin !== undefined ? item.margin : calculateMargin(product, item.price)
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

      setProducts(prev => {
          return updatedProducts.map(newP => {
              const existing = prev.find(p => p.sku === newP.sku);
              return {
                  ...newP,
                  // Preserve static data from ERP Inventory if not present in Sales
                  brand: existing?.brand,
                  cartonDimensions: existing?.cartonDimensions,
                  // Preserve manual settings if not in import
                  costPrice: newP.costPrice || existing?.costPrice,
                  floorPrice: existing?.floorPrice,
                  ceilingPrice: existing?.ceilingPrice,
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

  const handleUpdateMappings = (mappings: SkuMapping[]) => {
      setProducts(prev => prev.map(p => {
          // Check if this product has a mapping update
          const myMappings = mappings.filter(m => m.masterSku === p.sku);
          if (myMappings.length === 0) return p;

          // Clone channels to update
          const updatedChannels = [...p.channels];

          myMappings.forEach(map => {
              const existingChannelIndex = updatedChannels.findIndex(c => c.platform === map.platform);
              
              if (existingChannelIndex !== -1) {
                  // Update existing channel
                  updatedChannels[existingChannelIndex] = {
                      ...updatedChannels[existingChannelIndex],
                      skuAlias: map.alias
                  };
              } else {
                  // Add new channel entry just for mapping (velocity 0)
                  updatedChannels.push({
                      platform: map.platform,
                      manager: 'Unassigned',
                      velocity: 0,
                      skuAlias: map.alias
                  });
              }
          });

          return { ...p, channels: updatedChannels };
      }));
      setIsMappingModalOpen(false);
  };

  const handleAddPromotion = (promo: PromotionEvent) => {
      setPromotions(prev => [promo, ...prev]);
  };

  const handleUpdatePromotion = (updatedPromo: PromotionEvent) => {
      setPromotions(prev => prev.map(p => p.id === updatedPromo.id ? updatedPromo : p));
  };

  // Dynamic Styles
  const isUrl = userProfile.backgroundImage && (userProfile.backgroundImage.startsWith('http') || userProfile.backgroundImage.startsWith('data:') || userProfile.backgroundImage.startsWith('/'));
  
  const bgStyle: React.CSSProperties = userProfile.backgroundImage && userProfile.backgroundImage !== 'none'
      ? isUrl 
        ? { backgroundImage: `url(${userProfile.backgroundImage})`, backgroundSize: 'cover', backgroundPosition: 'center', backgroundAttachment: 'fixed' }
        : { backgroundImage: userProfile.backgroundImage, backgroundAttachment: 'fixed', backgroundSize: 'cover' }
      : { backgroundColor: userProfile.backgroundColor || '#f3f4f6' };

  // Determine if we should show the full dashboard or the onboarding
  const hasInventory = products.length > 0;
  // History or velocity presence implies transaction report was loaded
  const hasSalesData = priceHistory.length > 0 || products.some(p => p.averageDailySales > 0);
  
  const showDashboard = hasInventory && hasSalesData;

  // Header Color Logic
  const headerTextColor = userProfile.textColor || '#111827';
  const headerSubColor = userProfile.textColor ? `${userProfile.textColor}CC` : '#6b7280'; // Add transparency for subtext if colored, else gray
  
  // Readability Shadow
  const textShadowStyle = userProfile.backgroundImage ? { textShadow: '0 2px 4px rgba(0,0,0,0.5)' } : {};
  const headerStyle = { color: headerTextColor, ...textShadowStyle };

  return (
    <div className="min-h-screen flex font-sans text-gray-900 transition-colors duration-500" style={bgStyle}>
      {/* Background Overlay for readability if image is present */}
      {userProfile.backgroundImage && <div className="fixed inset-0 bg-white/90 backdrop-blur-sm -z-10"></div>}

      {/* Sidebar */}
      <aside className="w-64 bg-white/95 backdrop-blur border-r border-gray-200 hidden md:flex flex-col fixed h-full z-40 shadow-sm">
        <div className="p-6 flex items-center gap-3">
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold transition-colors duration-300"
            style={{ backgroundColor: userProfile.themeColor }}
          >
            E
          </div>
          <span className="font-bold text-xl tracking-tight text-gray-900">EcomPulse</span>
        </div>
        
        <nav className="flex-1 px-4 py-4 space-y-1">
          {[
              { id: 'dashboard', icon: LayoutDashboard, label: 'Pricing Tool' },
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
                        : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                    }`}
                    style={isActive ? { backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor } : {}}
                >
                    <item.icon className="w-5 h-5" style={isActive ? { color: userProfile.themeColor } : {}} />
                    {item.label}
                </button>
             );
          })}
        </nav>

        <div className="p-4 border-t border-gray-100 space-y-4">
          <div className="bg-gray-50/80 rounded-xl p-4 border border-gray-100 backdrop-blur-sm">
            <div className="flex justify-between items-center mb-1">
                <p className="text-xs font-semibold text-gray-500">Tool Status</p>
                <span className="text-[10px] text-gray-400">v1.2.2</span>
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
      <main className="flex-1 md:ml-64 p-8 min-w-0">
        {/* Top Bar */}
        <header className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-2xl font-bold transition-colors" style={headerStyle}>
                {currentView === 'dashboard' ? 'Pricing & Inventory Analysis' : 
                 currentView === 'costs' ? 'Product Costs & Limits' : 
                 currentView === 'definitions' ? 'Definitions & Formulas' : 
                 currentView === 'promotions' ? 'Promotion Management' :
                 'Settings'}
            </h1>
            <p className="text-sm mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                {currentView === 'dashboard' ? 'Manage SKUs, review velocities, and calculate strategies.' : 
                 currentView === 'costs' ? 'Set cost prices, and define minimum/maximum price guardrails.' : 
                 currentView === 'definitions' ? 'Reference guide for calculations and logic.' :
                 currentView === 'promotions' ? 'Plan, execute, and track sales events across platforms.' :
                 'Manage platform fees and user settings.'}
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

        {/* Content Area */}
        {currentView === 'dashboard' ? (
            <>
                {!showDashboard ? (
                    // --- ONBOARDING FLOW ---
                    <div className="flex flex-col items-center justify-center min-h-[500px] bg-white/90 backdrop-blur rounded-2xl border-2 border-dashed border-gray-200 text-center p-12 animate-in fade-in zoom-in duration-300">
                         <div 
                             className="w-20 h-20 rounded-full flex items-center justify-center mb-6 shadow-sm"
                             style={{ backgroundColor: `${userProfile.themeColor}15`, color: userProfile.themeColor }}
                         >
                             <Database className="w-10 h-10" />
                         </div>
                         <h3 className="text-2xl font-bold text-gray-900">Welcome to EcomPulse</h3>
                         <p className="text-gray-500 max-w-lg mt-3 mb-10 text-lg">
                             Let's get your dashboard set up. Please upload your company reports in the order below to initialize the system.
                         </p>
                         
                         <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl relative">
                            {/* Step 1: Inventory */}
                            <div className={`rounded-xl p-8 border transition-all flex flex-col items-center relative group ${hasInventory ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200 hover:border-indigo-300'}`}>
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
                                 !hasInventory ? 'bg-gray-50 border-gray-200 opacity-60 cursor-not-allowed' : 'bg-white border-indigo-200 shadow-lg scale-105 z-10'
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
                            onClick={() => setIsSalesImportModalOpen(true)}
                            style={{ color: userProfile.themeColor, borderColor: `${userProfile.themeColor}40`, backgroundColor: `${userProfile.themeColor}10` }}
                            className="px-4 py-2 border rounded-lg text-sm font-medium hover:bg-opacity-20 transition-colors flex items-center gap-2"
                            >
                            <FileBarChart className="w-4 h-4" />
                            Import Transaction Report
                            </button>
                            <button 
                            onClick={() => setIsUploadModalOpen(true)}
                            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
                            >
                            <Database className="w-4 h-4" />
                            Update Inventory (ERP)
                            </button>
                        </div>
                        
                        <ProductList 
                            products={products} 
                            onAnalyze={handleAnalyze} 
                            onApplyChanges={handleApplyBatchChanges}
                            dateLabels={priceDateLabels}
                            themeColor={userProfile.themeColor}
                        />
                    </>
                )}
            </>
        ) : currentView === 'costs' ? (
            <CostManagementPage 
                products={products}
                onUpdateCosts={handleUpdateCosts}
                onOpenUpload={() => setIsCostUploadModalOpen(true)}
                themeColor={userProfile.themeColor}
                headerStyle={headerStyle}
            />
        ) : currentView === 'promotions' ? (
            <PromotionPage 
                products={products}
                pricingRules={pricingRules}
                promotions={promotions}
                onAddPromotion={handleAddPromotion}
                onUpdatePromotion={handleUpdatePromotion}
                themeColor={userProfile.themeColor}
                headerStyle={headerStyle}
            />
        ) : currentView === 'definitions' ? (
            <DefinitionsPage headerStyle={headerStyle} />
        ) : (
            <SettingsPage 
                currentRules={pricingRules} 
                onSave={(newRules) => {
                    setPricingRules(newRules);
                }} 
                products={products}
                onRestore={handleRestoreData}
                extraData={{
                    priceHistory,
                    promotions
                }}
                themeColor={userProfile.themeColor}
                headerStyle={headerStyle}
                onOpenMappingModal={() => setIsMappingModalOpen(true)}
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

    </div>
  );
};

export default App;
