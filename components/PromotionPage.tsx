
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, PricingRules, PromotionEvent, PromotionItem, PriceLog, LogisticsRule } from '../types';
import { Plus, ChevronRight, Search, Trash2, ArrowLeft, CheckCircle, Check, Download, Calendar, Lock, Unlock, LayoutDashboard, List, Calculator, Edit2, AlertCircle, Save, X, RotateCcw, Eye, EyeOff, ArrowUpDown, ChevronUp, ChevronDown, Upload, FileText, Loader2, RefreshCw, TrendingUp, TrendingDown, Target, ShoppingBag, Coins, Truck, Info, HelpCircle } from 'lucide-react';
import * as XLSX from 'xlsx';

interface PromotionPageProps {
  products: Product[];
  pricingRules: PricingRules;
  logisticsRules?: LogisticsRule[];
  promotions: PromotionEvent[];
  priceHistory?: PriceLog[];
  onAddPromotion: (promo: PromotionEvent) => void;
  onUpdatePromotion: (promo: PromotionEvent) => void;
  themeColor: string;
  headerStyle: React.CSSProperties;
}

type ViewMode = 'dashboard' | 'event_detail' | 'add_products';
type Tab = 'dashboard' | 'all_skus' | 'simulator';
type PromoSortKey = 'name' | 'platform' | 'startDate' | 'submissionDeadline' | 'items' | 'status';

// --- MAIN COMPONENT ---

const PromotionPage: React.FC<PromotionPageProps> = ({ products, pricingRules, logisticsRules = [], promotions, priceHistory = [], onAddPromotion, onUpdatePromotion, themeColor, headerStyle }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const selectedPromo = useMemo(() => 
    promotions.find(p => p.id === selectedPromoId), 
  [promotions, selectedPromoId]);

  const handleCreateEvent = (newEvent: PromotionEvent) => {
      onAddPromotion(newEvent);
      setSelectedPromoId(newEvent.id);
      setViewMode('event_detail'); 
      setActiveTab('dashboard'); 
  };

  const handleUpdateEventMeta = (id: string, updates: Partial<PromotionEvent>) => {
      const promo = promotions.find(p => p.id === id);
      if (!promo) return;
      onUpdatePromotion({ ...promo, ...updates });
  };

  const handleDeleteItem = (sku: string) => {
      if (!selectedPromo) return;
      const updatedItems = selectedPromo.items.filter(i => i.sku !== sku);
      onUpdatePromotion({ ...selectedPromo, items: updatedItems });
  };

  const handleAddItems = (newItems: PromotionItem[]) => {
      if (!selectedPromo) return;
      const existingSkus = new Set(selectedPromo.items.map(i => i.sku));
      const filteredNew = newItems.filter(i => !existingSkus.has(i.sku));
      
      onUpdatePromotion({ 
          ...selectedPromo, 
          items: [...selectedPromo.items, ...filteredNew] 
      });
      setViewMode('event_detail');
  };

  const handleTabChange = (tab: Tab) => {
      setActiveTab(tab);
  };

  // Tab Header Component
  const TabHeader = () => (
      <div className="flex gap-8 border-b border-gray-200 mb-6">
          <button 
            onClick={() => handleTabChange('dashboard')}
            className={`pb-3 text-sm font-medium flex items-center gap-2 transition-colors relative ${activeTab === 'dashboard' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            style={activeTab === 'dashboard' ? { color: themeColor } : {}}
          >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
              {activeTab === 'dashboard' && <div className="absolute bottom-0 left-0 w-full h-0.5 rounded-t-full" style={{ backgroundColor: themeColor }}></div>}
          </button>
          <button 
            onClick={() => handleTabChange('all_skus')}
            className={`pb-3 text-sm font-medium flex items-center gap-2 transition-colors relative ${activeTab === 'all_skus' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            style={activeTab === 'all_skus' ? { color: themeColor } : {}}
          >
              <List className="w-4 h-4" />
              All Promo SKUs
              {activeTab === 'all_skus' && <div className="absolute bottom-0 left-0 w-full h-0.5 rounded-t-full" style={{ backgroundColor: themeColor }}></div>}
          </button>
          <button 
            onClick={() => handleTabChange('simulator')}
            className={`pb-3 text-sm font-medium flex items-center gap-2 transition-colors relative ${activeTab === 'simulator' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            style={activeTab === 'simulator' ? { color: themeColor } : {}}
          >
              <Calculator className="w-4 h-4" />
              Simulator
              {activeTab === 'simulator' && <div className="absolute bottom-0 left-0 w-full h-0.5 rounded-t-full" style={{ backgroundColor: themeColor }}></div>}
          </button>
      </div>
  );

  return (
    <div className="max-w-full mx-auto h-full flex flex-col w-full min-w-0 pb-10">
        
        <TabHeader />

        <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }} className="h-full">
            {viewMode === 'dashboard' && (
            <PromotionDashboard 
                promotions={promotions} 
                pricingRules={pricingRules}
                onSelectPromo={(id: string) => { setSelectedPromoId(id); setViewMode('event_detail'); }} 
                onCreateEvent={handleCreateEvent}
                themeColor={themeColor}
            />
            )}
            
            {viewMode === 'event_detail' && selectedPromo && (
            <EventDetailView 
                promo={selectedPromo} 
                products={products}
                priceHistory={priceHistory}
                onBack={() => setViewMode('dashboard')} 
                onAddProducts={() => setViewMode('add_products')}
                onDeleteItem={handleDeleteItem}
                onUpdateMeta={(updates: Partial<PromotionEvent>) => handleUpdateEventMeta(selectedPromo.id, updates)}
                themeColor={themeColor}
            />
            )}

            {viewMode === 'add_products' && selectedPromo && (
            <ProductSelector 
                products={products}
                currentPromo={selectedPromo}
                pricingRules={pricingRules}
                logisticsRules={logisticsRules}
                onCancel={() => setViewMode('event_detail')}
                onConfirm={handleAddItems}
                themeColor={themeColor}
            />
            )}
        </div>

        <div style={{ display: activeTab === 'all_skus' ? 'block' : 'none' }} className="h-full">
            <AllPromoSkusView promotions={promotions} products={products} themeColor={themeColor} />
        </div>

        <div style={{ display: activeTab === 'simulator' ? 'block' : 'none' }} className="h-full">
            <SimulatorView themeColor={themeColor} />
        </div>

    </div>
  );
};

// --- SUB-COMPONENTS ---

// PERFORMANCE HEADER (NEW)
const PromoPerformanceHeader = ({ promo, products, priceHistory, themeColor }: { promo: PromotionEvent, products: Product[], priceHistory: PriceLog[], themeColor: string }) => {
    const stats = useMemo(() => {
        let totalDailyProfitBase = 0;
        let totalDailyProfitPromo = 0;
        let totalBaseRevenue = 0;
        let totalActualSold = 0;
        let totalActualRevenue = 0;

        const startDate = new Date(promo.startDate);
        const endDate = new Date(promo.endDate);
        const now = new Date();
        const hasStarted = now >= startDate;

        promo.items.forEach(item => {
            const product = products.find(p => p.sku === item.sku);
            if (!product) return;

            const velocity = product.averageDailySales || 0;
            // Updated Cost Structure: COGS + WMS + Other + Subscription (Excluded Selling Fee & Postage)
            const cost = (product.costPrice || 0) + (product.wmsFee || 0) + (product.otherFee || 0) + (product.subscriptionFee || 0);
            
            // Base
            const baseProfit = item.basePrice - cost;
            totalDailyProfitBase += (baseProfit * velocity);
            totalBaseRevenue += (item.basePrice * velocity);

            // Promo
            const promoProfit = item.promoPrice - cost;
            totalDailyProfitPromo += (promoProfit * velocity); // Assuming constant velocity for projection baseline

            // Actuals (if started)
            if (hasStarted && priceHistory.length > 0) {
                const logs = priceHistory.filter(l => {
                    const d = new Date(l.date);
                    const isSkuMatch = l.sku === item.sku;
                    const isDateMatch = d >= startDate && d <= endDate;
                    
                    // Strictly filter by platform to avoid double counting from other channels
                    // If platform is 'All', include everything (or if log platform is undefined for backwards compatibility, include it cautiously)
                    // If platform is specific, ONLY include matching logs.
                    const isPlatformMatch = promo.platform === 'All' || l.platform === promo.platform;

                    return isSkuMatch && isDateMatch && isPlatformMatch;
                });
                
                logs.forEach(l => {
                    // Approximation: 1 log = 1 week usually. 
                    // To be precise without complex date math on logs:
                    // If date is within range, take velocity * 7? 
                    // Let's assume the log date is the END of the week.
                    // Simple sum for now:
                    totalActualSold += (l.velocity * 7); // Rough approx of weekly volume
                    totalActualRevenue += (l.price * l.velocity * 7);
                });
            }
        });

        const profitGap = totalDailyProfitBase - totalDailyProfitPromo;
        // Breakeven Lift: (Base Profit / Promo Profit) - 1
        const breakevenLift = totalDailyProfitPromo > 0 
            ? ((totalDailyProfitBase / totalDailyProfitPromo) - 1) * 100 
            : 0;

        return {
            totalDailyProfitBase,
            totalDailyProfitPromo,
            profitGap,
            breakevenLift,
            totalActualSold,
            totalActualRevenue,
            hasStarted
        };
    }, [promo, products, priceHistory]);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 mb-6 animate-in fade-in slide-in-from-top-4">
            <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                    <TrendingUp className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wide">Campaign Intelligence</h3>
                <span className="text-xs text-gray-400 ml-auto">Live Estimates</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-gray-100">
                {/* 1. Financial Impact */}
                <div className="flex flex-col gap-1 pr-4">
                    <span className="text-xs text-gray-500 font-medium">Daily Profit Projection</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-gray-900">£{stats.totalDailyProfitPromo.toFixed(0)}</span>
                        <span className="text-xs text-gray-400">vs £{stats.totalDailyProfitBase.toFixed(0)} BAU</span>
                    </div>
                    <div className={`text-xs font-medium flex items-center gap-1 ${stats.profitGap > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {stats.profitGap > 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                        {stats.profitGap > 0 ? `Sacrificing £${stats.profitGap.toFixed(0)} / day` : `Gaining £${Math.abs(stats.profitGap).toFixed(0)} / day`}
                    </div>
                </div>

                {/* 2. Targets */}
                <div className="flex flex-col gap-1 md:px-4 pt-4 md:pt-0">
                    <span className="text-xs text-gray-500 font-medium">Breakeven Velocity Target</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-indigo-600">+{stats.breakevenLift.toFixed(0)}%</span>
                        <span className="text-xs text-gray-400">unit sales needed</span>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        To match normal profit levels
                    </div>
                </div>

                {/* 3. Actuals */}
                <div className="flex flex-col gap-1 md:pl-4 pt-4 md:pt-0">
                    <span className="text-xs text-gray-500 font-medium">Real-time Performance</span>
                    {stats.hasStarted ? (
                        <>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold text-gray-900">£{stats.totalActualRevenue.toFixed(0)}</span>
                                <span className="text-xs text-gray-400">Revenue</span>
                            </div>
                            <div className="text-xs text-green-600 font-medium flex items-center gap-1">
                                <ShoppingBag className="w-3 h-3" />
                                {stats.totalActualSold.toFixed(0)} Units Sold (Approx)
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col justify-center h-full">
                            <span className="text-sm font-medium text-gray-400 italic">Event has not started</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const AllPromoSkusView = ({ promotions, products, themeColor }: { promotions: PromotionEvent[], products: Product[], themeColor: string }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [platformFilter, setPlatformFilter] = useState('All Platforms');

    const allRows = useMemo(() => {
        const rows: any[] = [];
        promotions.forEach(promo => {
            promo.items.forEach(item => {
                rows.push({
                    id: `${promo.id}-${item.sku}`,
                    sku: item.sku,
                    eventName: promo.name,
                    platform: promo.platform,
                    promoPrice: item.promoPrice,
                    startDate: new Date(promo.startDate),
                    endDate: new Date(promo.endDate),
                    status: promo.status
                });
            });
        });
        return rows.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    }, [promotions]);

    const filteredRows = allRows.filter(row => {
        const matchesSearch = row.sku.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              row.eventName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesPlatform = platformFilter === 'All Platforms' || row.platform === platformFilter;
        return matchesSearch && matchesPlatform;
    });

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-GB'); 
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Filter by SKU or Event Name..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50"
                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                    />
                </div>
                <div className="w-48">
                    <select 
                        value={platformFilter}
                        onChange={(e) => setPlatformFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                    >
                        <option>All Platforms</option>
                        {Array.from(new Set(promotions.map(p => p.platform))).sort().map(p => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-white text-gray-500 font-bold border-b border-gray-200">
                        <tr>
                            <th className="p-4">SKU</th>
                            <th className="p-4">Event</th>
                            <th className="p-4">Platform</th>
                            <th className="p-4 text-right">Promo Price</th>
                            <th className="p-4">Dates</th>
                            <th className="p-4">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                        {filteredRows.map(row => (
                            <tr key={row.id} className="hover:bg-gray-50">
                                <td className="p-4 font-bold text-gray-700">{row.sku}</td>
                                <td className="p-4 text-gray-600">{row.eventName}</td>
                                <td className="p-4">
                                    <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-medium border border-gray-200">
                                        {row.platform}
                                    </span>
                                </td>
                                <td className="p-4 text-right font-bold" style={{ color: themeColor }}>
                                    £{row.promoPrice.toFixed(2)}
                                </td>
                                <td className="p-4 text-gray-500 text-xs">
                                    {formatDate(row.startDate)} - {formatDate(row.endDate)}
                                </td>
                                <td className="p-4">
                                    <StatusBadge status={row.status} />
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const SimulatorView = ({ themeColor }: { themeColor: string }) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
            <div className="text-center p-8">
                <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center mx-auto mb-4 text-gray-400">
                    <Calculator className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-gray-600 mb-2">Advanced Simulator</h3>
                <p className="text-gray-400 text-sm max-w-sm mx-auto">
                    Break-even velocity and sophisticated margin analysis coming soon.
                </p>
            </div>
        </div>
    );
};

// PRODUCT SELECTOR
const ProductSelector = ({ products, currentPromo, pricingRules, logisticsRules, onCancel, onConfirm, themeColor }: { 
    products: Product[], 
    currentPromo: PromotionEvent,
    pricingRules: PricingRules,
    logisticsRules: LogisticsRule[],
    onCancel: () => void,
    onConfirm: (items: PromotionItem[]) => void,
    themeColor: string
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All Categories');
    const [bulkRule, setBulkRule] = useState<{ type: 'PERCENTAGE' | 'FIXED', value: number }>({ type: 'PERCENTAGE', value: 10 });
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
    const [showInactive, setShowInactive] = useState(false);
    const [hoveredMargin, setHoveredMargin] = useState<{ id: string, rect: DOMRect } | null>(null);

    const existingSkuSet = useMemo(() => new Set(currentPromo.items.map(i => i.sku)), [currentPromo]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            if (existingSkuSet.has(p.sku)) return false;
            if (!showInactive && p.stockLevel <= 0 && p.averageDailySales === 0) return false;
            if (currentPromo.platform !== 'All') {
                const isSoldOnPlatform = p.channels.some(c => c.platform === currentPromo.platform);
                if (!isSoldOnPlatform) return false;
            }
            const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku.toLowerCase().includes(searchQuery.toLowerCase());
            const matchCat = selectedCategory === 'All Categories' || p.category === selectedCategory;
            return matchSearch && matchCat;
        });
    }, [products, searchQuery, selectedCategory, existingSkuSet, currentPromo.platform, showInactive]);

    const uniqueCategories = useMemo(() => {
        const cats = new Set(products.map(p => p.category || 'Uncategorized'));
        return Array.from(cats).filter(Boolean).sort();
    }, [products]);

    const handleRowClick = (sku: string) => {
        const newSet = new Set(selectedSkus);
        if (newSet.has(sku)) newSet.delete(sku);
        else newSet.add(sku);
        setSelectedSkus(newSet);
    };

    const toggleAll = () => {
        if (selectedSkus.size === filteredProducts.length) setSelectedSkus(new Set());
        else setSelectedSkus(new Set(filteredProducts.map(p => p.sku)));
    };

    const roundTo95 = (price: number, originalPrice: number): number => {
        const candidate = Math.floor(price) + 0.95;
        if (candidate > price) {
            return Math.max(0.95, candidate - 1);
        }
        return Number(candidate.toFixed(2));
    };

    const calculatePromoPrice = (product: Product) => {
        if (priceOverrides[product.sku] !== undefined) {
            return priceOverrides[product.sku];
        }
        let price = product.currentPrice;
        if (currentPromo.platform !== 'All') {
             const channel = product.channels.find(c => c.platform === currentPromo.platform);
             if (channel && channel.price) price = channel.price;
        }
        let targetPrice = price;
        if (bulkRule.type === 'PERCENTAGE') {
            targetPrice = price * (1 - bulkRule.value / 100);
        } else {
            targetPrice = Math.max(0, price - bulkRule.value);
        }
        const result = roundTo95(targetPrice, price);
        return Number(result.toFixed(2));
    };

    const handlePriceOverride = (sku: string, val: string) => {
        const num = parseFloat(val);
        if (isNaN(num)) {
            const newO = { ...priceOverrides };
            delete newO[sku];
            setPriceOverrides(newO);
        } else {
            setPriceOverrides({ ...priceOverrides, [sku]: num });
        }
    };

    const calculateDynamicMargin = (product: Product, promoPrice: number) => {
        // 1. VAT Stripping
        const netRevenue = promoPrice / 1.2;

        // 2. Commission
        const platformKey = currentPromo.platform !== 'All' ? currentPromo.platform : (product.platform || 'Amazon(UK)');
        const rule = pricingRules[platformKey];
        const commissionRate = rule ? rule.commission : 15; // Default 15% fallback
        const commissionCost = promoPrice * (commissionRate / 100);

        // 3. Logistics (Dynamic Lookup)
        const weight = product.cartonDimensions?.weight || 0;
        let standardPostage = product.postage || 0; // Fallback to avg
        let ruralPostage = product.postage || 0;

        if (logisticsRules && logisticsRules.length > 0) {
            // Filter helpers
            const isValidRule = (r: LogisticsRule) => {
                // Must have a price
                if (!r.price || r.price <= 0) return false;
                
                // Exclude Pickup/Collection
                if (r.id === 'pickup' || r.name.toUpperCase() === 'PICKUP' || r.carrier.toUpperCase() === 'COLLECTION') return false;
                
                // Exclude NA
                if (r.id === 'na' || r.name.toUpperCase() === 'NA') return false;

                // Weight check
                if (r.maxWeight !== undefined && r.maxWeight < weight) return false;

                return true;
            };

            // Find best standard rule
            const validStandard = logisticsRules.filter(r => 
                isValidRule(r) &&
                !r.name.includes('-Z') && !r.name.includes('-NI') && !r.name.includes('REMOTE')
            ).sort((a, b) => a.price - b.price);

            // Find best rural rule
            const validRural = logisticsRules.filter(r => 
                isValidRule(r) &&
                (r.name.includes('-Z') || r.name.includes('-NI') || r.name.includes('REMOTE'))
            ).sort((a, b) => a.price - b.price);

            if (validStandard.length > 0) standardPostage = validStandard[0].price;
            if (validRural.length > 0) ruralPostage = validRural[0].price;
            // If no rural specific found, assume standard applies to all (optimistic) or use standard (neutral)
            if (validRural.length === 0 && validStandard.length > 0) ruralPostage = validStandard[0].price;
        }

        // 4. Other Costs
        const otherCosts = (product.costPrice || 0) + 
                           // Removed adsFee as requested to align with user expectation
                           (product.subscriptionFee || 0) + 
                           (product.wmsFee || 0) + 
                           (product.otherFee || 0);

        // 5. Profit & Margin
        const profitStandard = netRevenue - commissionCost - standardPostage - otherCosts;
        const profitRural = netRevenue - commissionCost - ruralPostage - otherCosts;

        // Margin % based on GROSS Price (standard retail metric)
        const marginStandard = promoPrice > 0 ? (profitStandard / promoPrice) * 100 : 0;
        const marginRural = promoPrice > 0 ? (profitRural / promoPrice) * 100 : 0;

        return {
            marginStandard,
            marginRural,
            profitStandard,
            details: {
                netRevenue,
                commissionCost,
                standardPostage,
                ruralPostage,
                otherCosts,
                commissionRate,
                weight
            }
        };
    };

    const handleConfirm = () => {
        const items: PromotionItem[] = Array.from(selectedSkus).map((sku: string) => {
            const product = products.find(p => p.sku === sku)!;
            const promoPrice = calculatePromoPrice(product);
            return {
                sku,
                basePrice: product.currentPrice,
                discountType: bulkRule.type,
                discountValue: bulkRule.value,
                promoPrice
            };
        });
        onConfirm(items);
    };

    return (
        <div className="space-y-6 h-[calc(100vh-150px)] flex flex-col relative">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm font-medium transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Cancel
                    </button>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 ml-2">Add Products to {currentPromo.name}</h2>
                        {currentPromo.platform !== 'All' && (
                            <p className="text-xs text-indigo-600 ml-2 font-medium">Filtering for: {currentPromo.platform}</p>
                        )}
                    </div>
                </div>
                <button 
                    onClick={handleConfirm}
                    disabled={selectedSkus.size === 0}
                    className="px-6 py-2 text-white rounded-lg font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all hover:opacity-90"
                    style={{ backgroundColor: themeColor }}
                >
                    <CheckCircle className="w-4 h-4" />
                    Add {selectedSkus.size} Products
                </button>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-end gap-4">
                 <div className="flex-1 min-w-[200px]">
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Search</label>
                     <div className="relative">
                         <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                         <input 
                            type="text" 
                            placeholder="Search SKU..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-opacity-50"
                            style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                         />
                     </div>
                 </div>
                 <div className="w-48">
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Category</label>
                     <select 
                        value={selectedCategory} 
                        onChange={(e) => setSelectedCategory(e.target.value)} 
                        className="w-full border border-gray-300 rounded-lg py-2 px-3 text-sm bg-white focus:ring-2 focus:ring-opacity-50"
                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                     >
                         <option>All Categories</option>
                         {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                     </select>
                 </div>
                 
                 <div className="pl-4 border-l border-gray-200 flex flex-col justify-end">
                     <label className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1 block">Bulk Discount Rule</label>
                     <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">% Off</span>
                        <input 
                            type="number" 
                            value={bulkRule.value}
                            onChange={(e) => {
                                setBulkRule({ ...bulkRule, value: parseFloat(e.target.value) });
                                setPriceOverrides({});
                            }}
                            className="w-16 border-gray-300 rounded-lg text-sm py-1.5 px-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                     </div>
                 </div>

                 <div className="flex flex-col justify-end">
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Show Inactive</label>
                     <button
                        onClick={() => setShowInactive(!showInactive)}
                        className={`flex items-center justify-center w-10 h-9 rounded-lg border transition-colors ${showInactive ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-gray-300 text-gray-400'}`}
                        title="Show products with 0 stock and 0 sales"
                     >
                         {showInactive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                     </button>
                 </div>
            </div>

            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-0">
                <div className="overflow-auto flex-1">
                    {/* Changed: Removed select-none class */}
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 text-gray-700 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 w-10 border-b border-gray-200"><input type="checkbox" onChange={toggleAll} checked={selectedSkus.size > 0 && selectedSkus.size === filteredProducts.length} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></th>
                                <th className="p-4 border-b border-gray-200">SKU / Category</th>
                                <th className="p-4 text-right border-b border-gray-200">Base Price (Net)</th>
                                <th className="p-4 text-right border-b border-gray-200">Platform Price</th>
                                <th className="p-4 text-right border-b border-gray-200">Optimal</th>
                                <th className="p-4 text-right border-b border-gray-200">Min Price</th>
                                <th className="p-4 text-right border-b border-gray-200 bg-indigo-50 text-indigo-900">Promo Price</th>
                                <th className="p-4 text-right border-b border-gray-200">Proj. Margin</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {filteredProducts.map((p) => {
                                const isSelected = selectedSkus.has(p.sku);
                                const promoPrice = calculatePromoPrice(p);
                                const isOverridden = priceOverrides[p.sku] !== undefined;
                                const { marginStandard, marginRural, details } = calculateDynamicMargin(p, promoPrice);
                                const isRuralNegative = marginRural < 0;
                                
                                return (
                                    <tr key={p.id} onClick={(e) => { 
                                        // Ignore row click if clicking on an input or if text was selected (handled by stopping propagation on text)
                                        if ((e.target as HTMLElement).tagName !== 'INPUT') {
                                            handleRowClick(p.sku);
                                        }
                                    }} className={`cursor-pointer hover:bg-gray-50 transition-colors`} style={isSelected ? { backgroundColor: `${themeColor}08` } : {}}>
                                        <td className="p-4"><input type="checkbox" checked={isSelected} readOnly className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></td>
                                        <td className="p-4">
                                            {/* Changed: Added stopPropagation to SKU text to allow selection without toggling row */}
                                            <div className="font-bold text-gray-900" onClick={(e) => e.stopPropagation()}>{p.sku}</div>
                                            <div className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded border border-gray-200">{p.category || 'Uncategorized'}</div>
                                        </td>
                                        <td className="p-4 text-right text-gray-500">£{p.currentPrice.toFixed(2)}</td>
                                        <td className="p-4 text-right font-medium text-gray-900">£{p.currentPrice.toFixed(2)}</td>
                                        <td className="p-4 text-right text-indigo-600 font-medium">
                                            {p.optimalPrice ? `☆ £${p.optimalPrice.toFixed(2)}` : '-'}
                                        </td>
                                        <td className="p-4 text-right text-gray-400">{p.floorPrice ? `£${p.floorPrice}` : '-'}</td>
                                        <td className="p-4 text-right bg-indigo-50/30">
                                            <div className="flex items-center justify-end gap-1">
                                                <span className="text-gray-400 text-xs">£</span>
                                                <input 
                                                    type="number"
                                                    step="0.01"
                                                    value={promoPrice}
                                                    onClick={(e) => e.stopPropagation()}
                                                    onChange={(e) => handlePriceOverride(p.sku, e.target.value)}
                                                    className={`w-20 px-1 py-1 text-right text-base font-bold bg-transparent border-b border-dashed focus:border-indigo-500 focus:outline-none focus:bg-white ${isOverridden ? 'text-indigo-600 border-indigo-300' : 'text-gray-900 border-gray-300'}`}
                                                />
                                                {isOverridden && (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const newO = { ...priceOverrides };
                                                            delete newO[p.sku];
                                                            setPriceOverrides(newO);
                                                        }}
                                                        className="text-gray-400 hover:text-indigo-600"
                                                        title="Reset to calculated price"
                                                    >
                                                        <RotateCcw className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right relative">
                                            <div 
                                                className="flex items-center justify-end gap-2 group/margin"
                                                onMouseEnter={(e) => {
                                                    const rect = e.currentTarget.getBoundingClientRect();
                                                    setHoveredMargin({ id: p.id, rect });
                                                }}
                                                onMouseLeave={() => setHoveredMargin(null)}
                                            >
                                                {isRuralNegative && (
                                                    <span title="Negative margin in Rural/Zone areas">
                                                        <AlertCircle className="w-4 h-4 text-red-500 animate-pulse" />
                                                    </span>
                                                )}
                                                <span className={`px-2 py-0.5 rounded text-xs font-bold ${marginStandard > 15 ? 'bg-green-100 text-green-700' : marginStandard > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                    {marginStandard.toFixed(1)}%
                                                </span>
                                            </div>
                                            
                                            {/* Tooltip Render logic moved to Portal */}
                                            {hoveredMargin?.id === p.id && (
                                                <MarginTooltip 
                                                    details={details} 
                                                    marginStandard={marginStandard} 
                                                    promoPrice={promoPrice} 
                                                    rect={hoveredMargin.rect}
                                                />
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredProducts.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-12 text-center text-gray-500">
                                        {products.length > 0 
                                            ? `No products found. (Showing only products selling on ${currentPromo.platform})`
                                            : "No products available."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const MarginTooltip = ({ details, marginStandard, promoPrice, rect }: any) => {
    const style: React.CSSProperties = {
        position: 'fixed',
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        transform: 'translate(-100%, -50%) translateX(-12px)',
        zIndex: 9999,
        pointerEvents: 'none'
    };

    return createPortal(
        <div style={style} className="bg-gray-900 text-white p-4 rounded-xl shadow-xl w-64 text-xs z-50">
            <h4 className="font-bold text-gray-200 mb-2 border-b border-gray-700 pb-1">Margin Breakdown</h4>
            
            <div className="space-y-1.5 mb-3">
                <div className="flex justify-between">
                    <span className="text-gray-400">Promo Price (Gross)</span>
                    <span className="font-mono">£{promoPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span className="text-gray-400">Net Revenue (ex VAT)</span>
                    <span className="font-mono text-indigo-300">£{details.netRevenue.toFixed(2)}</span>
                </div>
            </div>

            <div className="space-y-1 mb-3 text-gray-400 border-b border-gray-700 pb-2 border-dashed">
                <div className="flex justify-between">
                    <span>Commission ({details.commissionRate}%)</span>
                    <span className="text-red-300">-£{details.commissionCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span>Logistics (Std)</span>
                    <span className="text-red-300">-£{details.standardPostage.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span>Costs (COGS/WMS/etc)</span>
                    <span className="text-red-300">-£{details.otherCosts.toFixed(2)}</span>
                </div>
            </div>

            <div className="flex justify-between items-center font-bold text-sm">
                <span className="text-green-400">Net Margin</span>
                <span>{marginStandard.toFixed(1)}%</span>
            </div>
            
            {details.ruralPostage > details.standardPostage && (
                <div className="mt-2 pt-2 border-t border-gray-700 text-[10px] text-gray-500 flex justify-between">
                    <span>Rural Surcharge Risk:</span>
                    <span className="text-red-400 font-mono">
                        Margin drops to {(( (details.netRevenue - details.commissionCost - details.ruralPostage - details.otherCosts) / promoPrice ) * 100).toFixed(1)}%
                    </span>
                </div>
            )}
        </div>,
        document.body
    );
};

// ... (Rest of existing components: EditEventModal, PromoUploadModal, etc.)

const StatusBadge = ({status}: any) => {
    const styles = {
        'ACTIVE': 'bg-green-100 text-green-700 border-green-200',
        'UPCOMING': 'bg-blue-100 text-blue-700 border-blue-200',
        'ENDED': 'bg-gray-100 text-gray-600 border-gray-200'
    };
    return (
        <span className={`text-[10px] font-bold px-3 py-0.5 rounded-full border uppercase tracking-wide ${(styles as any)[status] || styles['ENDED']}`}>
            {status}
        </span>
    );
};

// --- MAIN DASHBOARD VIEW ---

const PromotionDashboard = ({ promotions, pricingRules, onSelectPromo, onCreateEvent, themeColor }: any) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: PromoSortKey; direction: 'asc' | 'desc' } | null>(null);

    const handleSort = (key: PromoSortKey) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedPromotions = useMemo(() => {
        let filtered = promotions.filter((p: any) => 
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            p.platform.toLowerCase().includes(searchQuery.toLowerCase())
        );

        if (sortConfig) {
            filtered.sort((a: any, b: any) => {
                let aValue: any = a[sortConfig.key];
                let bValue: any = b[sortConfig.key];

                if (sortConfig.key === 'items') {
                    aValue = a.items.length;
                    bValue = b.items.length;
                } else if (sortConfig.key === 'startDate' || sortConfig.key === 'submissionDeadline') {
                    if (!aValue) return 1;
                    if (!bValue) return -1;
                    aValue = new Date(aValue).getTime();
                    bValue = new Date(bValue).getTime();
                } else if (typeof aValue === 'string') {
                    aValue = aValue.toLowerCase();
                    bValue = bValue.toLowerCase();
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        } else {
            filtered.sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        }

        return filtered;
    }, [promotions, searchQuery, sortConfig]);

    const SortHeader = ({ label, sortKey, alignCenter = false }: { label: string, sortKey: PromoSortKey, alignCenter?: boolean }) => {
        const isActive = sortConfig?.key === sortKey;
        return (
            <th 
                className={`p-4 cursor-pointer select-none hover:bg-gray-100 transition-colors ${alignCenter ? 'text-center' : 'text-left'}`}
                onClick={() => handleSort(sortKey)}
            >
                <div className={`flex items-center gap-1 ${alignCenter ? 'justify-center' : 'justify-start'}`}>
                    {label}
                    <div className="flex flex-col">
                        {isActive ? (
                            sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" style={{ color: themeColor }} /> : <ChevronDown className="w-3 h-3" style={{ color: themeColor }} />
                        ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50" />
                        )}
                    </div>
                </div>
            </th>
        );
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Search event name or platform..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50"
                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                    />
                </div>
                <button 
                    onClick={() => setIsCreateModalOpen(true)}
                    className="px-4 py-2 text-white rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm whitespace-nowrap transition-colors hover:opacity-90"
                    style={{ backgroundColor: themeColor }}
                >
                    <Plus className="w-4 h-4" />
                    Create Event
                </button>
            </div>

             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                        <tr>
                            <SortHeader label="Event Name" sortKey="name" />
                            <SortHeader label="Platform" sortKey="platform" />
                            <SortHeader label="Start Date" sortKey="startDate" />
                            <SortHeader label="Deadline" sortKey="submissionDeadline" />
                            <SortHeader label="SKUs" sortKey="items" alignCenter />
                            <SortHeader label="Status" sortKey="status" />
                            <th className="p-4"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                        {sortedPromotions.map((p: any) => (
                            <tr key={p.id} className="hover:bg-gray-50 group cursor-pointer transition-colors" onClick={() => onSelectPromo(p.id)}>
                                <td className="p-4 font-semibold text-gray-900">
                                    {p.name}
                                    {p.remark && <div className="text-xs text-gray-400 font-normal mt-0.5 truncate max-w-[200px]">{p.remark}</div>}
                                </td>
                                <td className="p-4">
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                                        {p.platform}
                                    </span>
                                </td>
                                <td className="p-4 text-gray-500">
                                    <div className="flex flex-col text-xs">
                                        <span className="font-medium text-gray-900">{new Date(p.startDate).toLocaleDateString()}</span>
                                        <span className="text-gray-400">to {new Date(p.endDate).toLocaleDateString()}</span>
                                    </div>
                                </td>
                                <td className="p-4">
                                    {p.submissionDeadline ? (
                                        <span className={`text-xs font-bold ${new Date(p.submissionDeadline) < new Date() && p.status === 'UPCOMING' ? 'text-red-600' : 'text-gray-600'}`}>
                                            {new Date(p.submissionDeadline).toLocaleDateString()}
                                        </span>
                                    ) : '-'}
                                </td>
                                <td className="p-4 text-center">
                                    <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-gray-100 text-gray-700 font-mono text-xs font-bold">
                                        {p.items.length}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <StatusBadge status={p.status} />
                                </td>
                                <td className="p-4 text-right">
                                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 transition-colors" />
                                </td>
                            </tr>
                        ))}
                        {sortedPromotions.length === 0 && (
                            <tr>
                                <td colSpan={7} className="p-8 text-center text-gray-500">
                                    No promotions found. Create one to get started.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {isCreateModalOpen && <CreateEventModal pricingRules={pricingRules} onClose={() => setIsCreateModalOpen(false)} onConfirm={onCreateEvent} themeColor={themeColor} />}
        </div>
    );
};

const CreateEventModal = ({ pricingRules, onClose, onConfirm, themeColor }: any) => {
    const [formData, setFormData] = useState({ name: '', platform: Object.keys(pricingRules)[0] || 'Amazon', startDate: '', endDate: '', deadline: '', remark: '' });
    const [error, setError] = useState<string | null>(null);
    
    const handleSubmit = () => {
        if (!formData.name.trim()) {
            setError("Event Name is required.");
            return;
        }
        if (!formData.startDate) {
            setError("Start Date is required.");
            return;
        }
        if (!formData.endDate) {
            setError("End Date is required.");
            return;
        }
        
        onConfirm({ 
            id: `evt-${Date.now()}`, 
            name: formData.name, 
            platform: formData.platform, 
            startDate: formData.startDate, 
            endDate: formData.endDate, 
            submissionDeadline: formData.deadline || undefined, 
            remark: formData.remark, 
            status: 'UPCOMING', 
            items: [] 
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
                <h2 className="text-xl font-bold text-gray-900">Create New Event</h2>
                {error && (
                    <div className="flex items-center gap-2 text-red-700 bg-red-50 p-3 rounded-lg text-sm border border-red-100">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Event Name <span className="text-red-500">*</span></label>
                        <input type="text" placeholder="e.g. Summer Sale 2025" className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-opacity-50" style={{ '--tw-ring-color': themeColor } as React.CSSProperties} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                        <select className="w-full border p-2 rounded-lg" value={formData.platform} onChange={e => setFormData({...formData, platform: e.target.value})}>
                            {Object.keys(pricingRules).map(p => <option key={p} value={p}>{p}</option>)}
                            <option value="All">All Platforms</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date <span className="text-red-500">*</span></label>
                            <input type="date" className="w-full border p-2 rounded-lg" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">End Date <span className="text-red-500">*</span></label>
                            <input type="date" className="w-full border p-2 rounded-lg" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Submission Deadline</label>
                        <input type="date" className="w-full border p-2 rounded-lg" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Remark (Optional)</label>
                        <textarea 
                            placeholder="Add internal notes about this event..." 
                            className="w-full border p-2 rounded-lg text-sm h-20 resize-none"
                            value={formData.remark}
                            onChange={e => setFormData({...formData, remark: e.target.value})}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 text-white rounded-lg shadow-sm hover:opacity-90 transition-opacity" style={{ backgroundColor: themeColor }}>Create Event</button>
                </div>
            </div>
        </div>
    );
}

const EditEventModal = ({ promo, onClose, onConfirm, themeColor }: { promo: PromotionEvent, onClose: () => void, onConfirm: (updates: Partial<PromotionEvent>) => void, themeColor: string }) => {
    const [formData, setFormData] = useState({ 
        name: promo.name, 
        startDate: promo.startDate, 
        endDate: promo.endDate, 
        submissionDeadline: promo.submissionDeadline || '',
        remark: promo.remark || '' 
    });
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = () => {
        if (!formData.name.trim() || !formData.startDate || !formData.endDate) {
            setError("Required fields cannot be empty.");
            return;
        }
        onConfirm(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900">Edit Event Details</h2>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
                </div>
                
                {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded border border-red-100">{error}</div>}
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
                        <input type="text" className="w-full border p-2 rounded-lg" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                            <input type="date" className="w-full border p-2 rounded-lg" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                            <input type="date" className="w-full border p-2 rounded-lg" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Submission Deadline</label>
                        <input type="date" className="w-full border p-2 rounded-lg" value={formData.submissionDeadline} onChange={e => setFormData({...formData, submissionDeadline: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
                        <textarea className="w-full border p-2 rounded-lg text-sm h-24 resize-none" value={formData.remark} onChange={e => setFormData({...formData, remark: e.target.value})} />
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 text-white rounded-lg" style={{ backgroundColor: themeColor }}>Save Changes</button>
                </div>
            </div>
        </div>
    );
};

const EventDetailView = ({ promo, products, priceHistory, onBack, onAddProducts, onDeleteItem, onUpdateMeta, themeColor }: any) => {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isImportModalOpen, setIsImportModalOpen] = useState(false);
    
    // Logic: Allow manual adding/deleting only if event hasn't started yet
    const today = new Date().toISOString().split('T')[0];
    const isUpcoming = promo.startDate > today;

    const handleImport = (items: { sku: string, price: number }[]) => {
        const newItems = [...promo.items];
        items.forEach(importItem => {
            const existingIndex = newItems.findIndex(i => i.sku === importItem.sku);
            const product = products.find((p: Product) => p.sku === importItem.sku);
            
            if (!product) return;

            if (existingIndex >= 0) {
                newItems[existingIndex] = {
                    ...newItems[existingIndex],
                    promoPrice: importItem.price,
                };
            } else {
                newItems.push({
                    sku: importItem.sku,
                    basePrice: product.currentPrice,
                    promoPrice: importItem.price,
                    discountType: 'FIXED', 
                    discountValue: product.currentPrice - importItem.price
                });
            }
        });

        onUpdateMeta({ items: newItems });
        setIsImportModalOpen(false);
    };

    const handleExport = () => {
        const headers = ['SKU', 'Master SKU', 'Product Name', 'Base Price', 'Promo Price', 'Discount %'];
        const rows = promo.items.map((item: any) => {
            const product = products.find((p: Product) => p.sku === item.sku);
            let exportSku = item.sku;
            if (product && promo.platform !== 'All') {
                const channel = product.channels.find((c: any) => c.platform === promo.platform);
                if (channel?.skuAlias) {
                    exportSku = channel.skuAlias;
                }
            }
            const discountPct = ((item.basePrice - item.promoPrice) / item.basePrice * 100).toFixed(2);
            return [
                exportSku,
                item.sku,
                `"${product?.name?.replace(/"/g, '""') || ''}"`,
                item.basePrice.toFixed(2),
                item.promoPrice.toFixed(2),
                `${discountPct}%`
            ];
        });

        const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `promo_export_${promo.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                        <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-50 border border-gray-200 transition-colors mt-1">
                            <ArrowLeft className="w-5 h-5 text-gray-600"/>
                        </button> 
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-bold text-gray-900">{promo.name}</h2>
                                <StatusBadge status={promo.status} />
                                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                    {promo.items.length} SKUs
                                </span>
                                <button 
                                    onClick={() => setIsEditModalOpen(true)}
                                    className="p-1 text-gray-400 hover:text-indigo-600 transition-colors rounded hover:bg-gray-100"
                                    title="Edit Event Details"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4" />
                                    <span>{new Date(promo.startDate).toLocaleDateString()} - {new Date(promo.endDate).toLocaleDateString()}</span>
                                </div>
                                <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                <span className="font-medium text-gray-700">{promo.platform}</span>
                                {promo.remark && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                        <span className="text-gray-500 italic max-w-lg truncate">{promo.remark}</span>
                                    </>
                                )}
                                {promo.submissionDeadline && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                        <span className="text-red-600 font-medium">Deadline: {new Date(promo.submissionDeadline).toLocaleDateString()}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {promo.items.length > 0 && (
                            <button 
                                onClick={handleExport}
                                className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
                            >
                                <Download className="w-4 h-4" />
                                Export List
                            </button>
                        )}
                        
                        {/* Batch Import Button - Always visible for quick updates */}
                        <button 
                            onClick={() => setIsImportModalOpen(true)}
                            className="bg-white text-indigo-600 border border-indigo-200 px-4 py-2 rounded-lg text-sm font-medium hover:bg-indigo-50 transition-colors flex items-center gap-2"
                        >
                            <Upload className="w-4 h-4" />
                            Batch Import
                        </button>

                        {isUpcoming ? (
                            <button 
                                onClick={onAddProducts} 
                                className="text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-md hover:opacity-90 transition-opacity text-sm font-medium" 
                                style={{ backgroundColor: themeColor }}
                            >
                                <Plus className="w-4 h-4"/> 
                                Add Products
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-500 rounded-lg text-sm border border-gray-200 cursor-not-allowed" title="Manual editing locked for active/past events. Use Batch Import to update.">
                                <Lock className="w-4 h-4" />
                                Event Locked
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Campaign Intelligence Header */}
            {promo.items.length > 0 && (
                <PromoPerformanceHeader 
                    promo={promo} 
                    products={products} 
                    priceHistory={priceHistory} 
                    themeColor={themeColor} 
                />
            )}

            {/* Empty State or Table */}
            {promo.items.length === 0 ? (
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 border-dashed flex flex-col items-center justify-center p-12 text-center min-h-[400px]">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle className="w-8 h-8 text-gray-300" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">No Products Yet</h3>
                    <p className="text-gray-500 max-w-sm mt-2 mb-6">
                        Start by adding products or importing a list.
                    </p>
                    <div className="flex gap-3">
                        <button 
                            onClick={() => setIsImportModalOpen(true)}
                            className="px-6 py-2.5 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg shadow-sm hover:bg-gray-50 transition-all"
                        >
                            Import from CSV
                        </button>
                        {isUpcoming && (
                            <button 
                                onClick={onAddProducts}
                                className="px-6 py-2.5 text-white font-medium rounded-lg shadow-md transition-all hover:opacity-90"
                                style={{ backgroundColor: themeColor }}
                            >
                                Manual Selection
                            </button>
                        )}
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col min-h-0">
                    <div className="overflow-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-white text-gray-500 font-bold border-b border-gray-200">
                                <tr>
                                    <th className="p-4">SKU / Category</th>
                                    <th className="p-4 text-right">Base Price (Net)</th>
                                    <th className="p-4 text-right">Platform Price</th>
                                    <th className="p-4 text-right">Discount</th>
                                    <th className="p-4 text-right">Promo Price</th>
                                    <th className="p-4 text-right">Breakeven Velocity</th>
                                    <th className="p-4"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {promo.items.map((item: any, idx: number) => {
                                    const discountPercent = ((item.basePrice - item.promoPrice) / item.basePrice * 100).toFixed(0);
                                    const product = products.find((p: Product) => p.sku === item.sku);
                                    
                                    // Calculate per-item breakeven
                                    // UPDATED: Using full fixed cost stack (COGS+WMS+Other+Sub), excluding logistics/commission to avoid double counting
                                    const cost = (product?.costPrice || 0) + (product?.wmsFee || 0) + (product?.otherFee || 0) + (product?.subscriptionFee || 0);
                                    const baseProfit = item.basePrice - cost;
                                    const promoProfit = item.promoPrice - cost;
                                    const liftNeeded = promoProfit > 0 ? ((baseProfit / promoProfit) - 1) * 100 : 0;

                                    return (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4">
                                                <div className="font-bold text-gray-900">{item.sku}</div>
                                                {product?.category && <div className="text-xs text-gray-500 mt-0.5">{product.category}</div>}
                                            </td>
                                            <td className="p-4 text-right text-gray-500">£{item.basePrice.toFixed(2)}</td>
                                            <td className="p-4 text-right text-gray-900 font-medium">£{item.basePrice.toFixed(2)}</td>
                                            <td className="p-4 text-right">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-50 text-red-600">
                                                    -{discountPercent}%
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-bold text-base text-gray-900">£{item.promoPrice.toFixed(2)}</td>
                                            <td className="p-4 text-right">
                                                {liftNeeded > 0 ? (
                                                    <span className="text-indigo-600 font-bold">+{liftNeeded.toFixed(0)}%</span>
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                            </td>
                                            <td className="p-4 text-right">
                                                {isUpcoming && (
                                                    <button onClick={() => onDeleteItem(item.sku)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                                                        <Trash2 className="w-4 h-4"/>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {isEditModalOpen && (
                <EditEventModal 
                    promo={promo} 
                    onClose={() => setIsEditModalOpen(false)} 
                    onConfirm={onUpdateMeta}
                    themeColor={themeColor}
                />
            )}

            {isImportModalOpen && (
                <PromoUploadModal 
                    products={products}
                    onClose={() => setIsImportModalOpen(false)}
                    onConfirm={handleImport}
                    themeColor={themeColor}
                />
            )}
        </div>
    );
};

const PromoUploadModal = ({ products, onClose, onConfirm, themeColor }: { products: Product[], onClose: () => void, onConfirm: (items: any[]) => void, themeColor: string }) => {
    const [dragActive, setDragActive] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [parsedItems, setParsedItems] = useState<any[] | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = (file: File) => {
        setIsProcessing(true);
        setError(null);
        setTimeout(() => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: file.name.endsWith('.xlsx') ? 'array' : 'string' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
                    parseRows(rows);
                } catch (err) {
                    setError("Failed to parse file. Please ensure valid CSV or Excel format.");
                } finally {
                    setIsProcessing(false);
                }
            };
            if (file.name.endsWith('.xlsx')) reader.readAsArrayBuffer(file);
            else reader.readAsText(file);
        }, 100);
    };

    const parseRows = (rows: any[][]) => {
        if (rows.length < 2) { setError("File is empty."); return; }
        
        const headers = rows[0].map(h => String(h).trim().toLowerCase());
        const skuIdx = headers.findIndex(h => h.includes('sku'));
        const priceIdx = headers.findIndex(h => h.includes('price') || h.includes('promo'));

        if (skuIdx === -1 || priceIdx === -1) {
            setError("Missing required columns: 'SKU' and 'Price' (or 'Promo Price').");
            return;
        }

        const results: any[] = [];
        
        // Build a lookup map for both Master SKUs and Aliases
        const skuResolver: Record<string, string> = {};
        products.forEach(p => {
            skuResolver[p.sku.toUpperCase()] = p.sku; // Master
            p.channels.forEach(c => {
                if(c.skuAlias) {
                    skuResolver[c.skuAlias.toUpperCase()] = p.sku; // Alias -> Master
                }
            });
        });

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row[skuIdx]) continue;
            
            const rawSku = String(row[skuIdx]).trim();
            const price = parseFloat(String(row[priceIdx]));
            
            const masterSku = skuResolver[rawSku.toUpperCase()];
            const isValid = !!masterSku && !isNaN(price) && price > 0;
            
            results.push({ sku: masterSku || rawSku, price, isValid, originalSku: rawSku });
        }
        setParsedItems(results);
    };

    const validItems = parsedItems?.filter(i => i.isValid) || [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-900">Batch Upload Promo Prices</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="p-6 flex-1 overflow-y-auto">
                    {!parsedItems ? (
                        <div 
                            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300'}`}
                            onDragEnter={(e) => { e.preventDefault(); setDragActive(true); }}
                            onDragLeave={(e) => { e.preventDefault(); setDragActive(false); }}
                            onDragOver={(e) => { e.preventDefault(); }}
                            onDrop={(e) => {
                                e.preventDefault();
                                setDragActive(false);
                                if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
                            }}
                        >
                            <input ref={fileInputRef} type="file" className="hidden" accept=".csv, .xlsx" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
                            {isProcessing ? (
                                <Loader2 className="w-8 h-8 animate-spin text-gray-400 mb-2" />
                            ) : (
                                <>
                                    <Upload className="w-8 h-8 text-gray-400 mb-2" />
                                    <p className="text-sm font-medium">Drag & Drop or <button onClick={() => fileInputRef.current?.click()} className="text-indigo-600 underline">Browse</button></p>
                                    <p className="text-xs text-gray-500 mt-2">Required Columns: SKU, Promo Price</p>
                                </>
                            )}
                            {error && <p className="text-red-500 text-xs mt-3">{error}</p>}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center text-sm">
                                <span className="text-green-600 font-bold">{validItems.length} Valid</span>
                                <button onClick={() => setParsedItems(null)} className="text-gray-500 flex items-center gap-1"><RefreshCw className="w-3 h-3" /> Reset</button>
                            </div>
                            <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50">
                                        <tr><th className="p-2">SKU (Resolved)</th><th className="p-2 text-right">Price</th><th className="p-2 text-right">Status</th></tr>
                                    </thead>
                                    <tbody className="divide-y">
                                        {parsedItems.map((item, i) => (
                                            <tr key={i} className={!item.isValid ? 'bg-red-50' : ''}>
                                                <td className="p-2">
                                                    {item.sku}
                                                    {item.originalSku !== item.sku && <span className="text-xs text-gray-400 block">via {item.originalSku}</span>}
                                                </td>
                                                <td className="p-2 text-right">{item.price || '-'}</td>
                                                <td className="p-2 text-right">{item.isValid ? <Check className="w-4 h-4 text-green-500 ml-auto" /> : <AlertCircle className="w-4 h-4 text-red-500 ml-auto" />}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg">Cancel</button>
                    {validItems.length > 0 && (
                        <button 
                            onClick={() => onConfirm(validItems)} 
                            className="px-6 py-2 text-white rounded-lg shadow-md hover:opacity-90"
                            style={{ backgroundColor: themeColor }}
                        >
                            Import {validItems.length} Items
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PromotionPage;
