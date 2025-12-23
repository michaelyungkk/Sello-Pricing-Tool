
import React, { useState, useMemo, useEffect } from 'react';
import { Product, PricingRules, PromotionEvent, PriceLog, ShipmentDetail } from '../types';
import { Search, Link as LinkIcon, Package, Filter, User, Eye, EyeOff, ChevronLeft, ChevronRight, LayoutDashboard, List, DollarSign, TrendingUp, AlertCircle, CheckCircle, X, Save, ExternalLink, Tag, Globe, ArrowUpDown, ChevronUp, ChevronDown, Plus, Download, Calendar, Clock, BarChart2, Edit2, Ship, Maximize2, Minimize2, ArrowRight } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, LineChart, Line, AreaChart, Area, Legend } from 'recharts';
import ShipmentUploadModal from './ShipmentUploadModal';

interface ProductManagementPageProps {
  products: Product[];
  pricingRules: PricingRules;
  promotions?: PromotionEvent[]; 
  priceHistory?: PriceLog[];
  onOpenMappingModal: () => void;
  onUpdateProduct?: (product: Product) => void;
  themeColor: string;
  headerStyle: React.CSSProperties;
}

type Tab = 'dashboard' | 'catalog' | 'pricing' | 'shipments';
type DateRange = 'yesterday' | '7d' | '30d' | 'custom';

const ProductManagementPage: React.FC<ProductManagementPageProps> = ({ 
  products, 
  pricingRules, 
  promotions = [], 
  priceHistory = [],
  onOpenMappingModal, 
  onUpdateProduct,
  themeColor, 
  headerStyle 
}) => {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [selectedProductForDrawer, setSelectedProductForDrawer] = useState<Product | null>(null);
  const [isShipmentModalOpen, setIsShipmentModalOpen] = useState(false);

  const handleShipmentUpdate = (updates: { sku: string, shipments: ShipmentDetail[] }[]) => {
      const updateMap = new Map(updates.map(u => [u.sku, u.shipments]));

      products.forEach(p => {
          if (updateMap.has(p.sku)) {
              const newShipmentsData = updateMap.get(p.sku)!;
              
              let currentShipments = p.shipments ? [...p.shipments] : [];
              
              newShipmentsData.forEach(newS => {
                  const idx = currentShipments.findIndex(s => s.containerId === newS.containerId);
                  if (idx >= 0) {
                      currentShipments[idx] = newS;
                  } else {
                      currentShipments.push(newS);
                  }
              });

              // Recalculate Incoming Stock
              const incoming = currentShipments.reduce((sum, s) => sum + s.quantity, 0);
              
              // Recalculate Lead Time based on EARLIEST incoming ETA
              const now = new Date().toISOString().split('T')[0];
              const futureShipments = currentShipments
                  .filter(s => s.eta && s.eta >= now)
                  .sort((a, b) => (a.eta! > b.eta! ? 1 : -1));
              
              let newLeadTime = p.leadTimeDays;
              if (futureShipments.length > 0 && futureShipments[0].eta) {
                  const arrival = new Date(futureShipments[0].eta);
                  const diffTime = Math.abs(arrival.getTime() - new Date().getTime());
                  newLeadTime = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
              }

              if (onUpdateProduct) {
                  onUpdateProduct({
                      ...p,
                      shipments: currentShipments,
                      incomingStock: incoming,
                      leadTimeDays: newLeadTime
                  });
              }
          }
      });
      setIsShipmentModalOpen(false);
  };

  return (
    <div className="max-w-full mx-auto space-y-6 pb-10 h-full flex flex-col">
      {/* Header Section */}
      <div>
          <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Product Management</h2>
          <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
              Manage Master SKUs, aliases, and pricing consistency.
          </p>
      </div>

      {/* Navigation Tabs (Strict Match with Definitions Page) */}
      <div className="flex justify-between items-end gap-4">
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto no-scrollbar">
              <button 
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'dashboard' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  <LayoutDashboard className="w-4 h-4" />
                  Overview
              </button>
              
              <button 
                onClick={() => setActiveTab('catalog')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'catalog' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  <List className="w-4 h-4" />
                  Master Catalogue
              </button>

              <button 
                onClick={() => setActiveTab('shipments')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'shipments' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  <Ship className="w-4 h-4" />
                  Shipments
              </button>

              <button 
                onClick={() => setActiveTab('pricing')}
                className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'pricing' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  <DollarSign className="w-4 h-4" />
                  Price Matrix
              </button>
          </div>

          <div className="mb-1">
              <button
                  onClick={() => setIsShipmentModalOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-medium shadow-md hover:opacity-90 transition-all"
                  style={{ backgroundColor: themeColor }}
              >
                  <Ship className="w-4 h-4" />
                  Import Shipment Schedule
              </button>
          </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 min-h-0 relative">
          {activeTab === 'dashboard' && (
              <DashboardView products={products} priceHistory={priceHistory} themeColor={themeColor} />
          )}

          {activeTab === 'catalog' && (
              <MasterCatalogView 
                  products={products} 
                  onEditAliases={(p: Product) => setSelectedProductForDrawer(p)} 
                  onOpenMappingModal={onOpenMappingModal}
                  themeColor={themeColor} 
              />
          )}

          {activeTab === 'shipments' && (
              <ShipmentsView products={products} themeColor={themeColor} />
          )}

          {activeTab === 'pricing' && (
              <PriceMatrixView 
                  products={products} 
                  pricingRules={pricingRules} 
                  promotions={promotions}
                  themeColor={themeColor} 
              />
          )}
      </div>

      {/* Slide-over Drawer for Aliases - Using Portal recommended */}
      {selectedProductForDrawer && (
          <AliasDrawer 
              product={selectedProductForDrawer} 
              pricingRules={pricingRules}
              onClose={() => setSelectedProductForDrawer(null)}
              onSave={(updated: Product) => {
                  if (onUpdateProduct) {
                      onUpdateProduct(updated);
                  }
              }}
              themeColor={themeColor}
          />
      )}

      {/* Modals */}
      {isShipmentModalOpen && (
          <ShipmentUploadModal 
              products={products}
              onClose={() => setIsShipmentModalOpen(false)}
              onConfirm={handleShipmentUpdate}
          />
      )}
    </div>
  );
};

// 1. DASHBOARD VIEW (GLASS UI)
const DashboardView = ({ products, priceHistory, themeColor }: { products: Product[], priceHistory: PriceLog[], themeColor: string }) => {
    // ... (State logic unchanged)
    const [range, setRange] = useState<DateRange>('yesterday');
    
    // Updated: Range State
    const [customStart, setCustomStart] = useState(new Date().toISOString().split('T')[0]);
    const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
    
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [topSellerMetric, setTopSellerMetric] = useState<'units' | 'rev'>('units');

    // KPI Calculations (Snapshot - Always current)
    const totalProducts = products.length;
    const totalStock = products.reduce((sum, p) => sum + p.stockLevel, 0);
    const totalIncoming = products.reduce((sum, p) => sum + (p.incomingStock || 0), 0);
    const totalValue = products.reduce((sum, p) => sum + (p.stockLevel * (p.costPrice || 0)), 0);

    // Dynamic Filter Logic based on Range
    const { filteredSales, daysMultiplier, periodLabel } = useMemo(() => {
        let startDate = new Date();
        let endDate = new Date();
        let days = 1;
        let label = '';

        if (range === 'yesterday') {
            startDate.setDate(startDate.getDate() - 1);
            endDate.setDate(endDate.getDate() - 1);
            days = 1;
            label = startDate.toLocaleDateString();
        } else if (range === '7d') {
            startDate.setDate(startDate.getDate() - 7);
            days = 7;
            label = 'Last 7 Days';
        } else if (range === '30d') {
            startDate.setDate(startDate.getDate() - 30);
            days = 30;
            label = 'Last 30 Days';
        } else if (range === 'custom') {
            startDate = new Date(customStart);
            endDate = new Date(customEnd);
            if (startDate > endDate) {
                const temp = startDate;
                startDate = endDate;
                endDate = temp;
            }
            const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
            days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; 
            label = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
        }

        const sStr = startDate.toISOString().split('T')[0];
        const eStr = endDate.toISOString().split('T')[0];
        
        const salesMap: Record<string, { units: number, revenue: number }> = {};

        if (priceHistory && priceHistory.length > 0) {
            const relevantLogs = priceHistory.filter(l => {
                const d = l.date.split('T')[0];
                return d >= sStr && d <= eStr;
            });
            
            if (relevantLogs.length > 0) {
                relevantLogs.forEach(l => {
                    if (!salesMap[l.sku]) salesMap[l.sku] = { units: 0, revenue: 0 };
                    salesMap[l.sku].units += l.velocity; 
                    salesMap[l.sku].revenue += (l.velocity * l.price);
                });
            } else {
                products.forEach(p => {
                    salesMap[p.sku] = {
                        units: p.averageDailySales * days,
                        revenue: p.averageDailySales * p.currentPrice * days
                    };
                });
            }
        } else {
            products.forEach(p => {
                salesMap[p.sku] = {
                    units: p.averageDailySales * days,
                    revenue: p.averageDailySales * p.currentPrice * days
                };
            });
        }

        return { filteredSales: salesMap, daysMultiplier: days, periodLabel: label };
    }, [products, priceHistory, range, customStart, customEnd]);

    const topSellers = useMemo(() => {
        const items = products.map(p => {
            const stats = filteredSales[p.sku] || { units: 0, revenue: 0 };
            return { ...p, periodUnits: stats.units, periodRevenue: stats.revenue };
        });

        return items
            .sort((a, b) => topSellerMetric === 'units' ? b.periodUnits - a.periodUnits : b.periodRevenue - a.periodRevenue)
            .slice(0, 5)
            .filter(p => topSellerMetric === 'units' ? p.periodUnits > 0 : p.periodRevenue > 0);
    }, [products, filteredSales, topSellerMetric]);

    const categoryData = useMemo(() => {
        const counts: Record<string, number> = {};
        products.forEach(p => {
            const cat = p.category || 'Uncategorized';
            if (!counts[cat]) counts[cat] = 0;
            counts[cat] += p.stockLevel;
        });
        return Object.entries(counts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value)
            .slice(0, 8);
    }, [products]);

    const platformData = useMemo(() => {
        const counts: Record<string, number> = {};
        products.forEach(p => {
            p.channels.forEach(c => {
                if (!counts[c.platform]) counts[c.platform] = 0;
                counts[c.platform] += 1;
            });
        });
        
        const data = Object.entries(counts).map(([name, value]) => ({ name, value }));
        const colors = ['#8884d8', '#82ca9d', '#ffc658', '#ff8042', '#0088fe', '#00C49F'];
        return data.map((d, i) => ({ ...d, color: colors[i % colors.length] }));
    }, [products]);

    const missingAliases = products.filter(p => !p.channels || p.channels.length === 0 || p.channels.every(c => !c.skuAlias)).length;
    const missingCosts = products.filter(p => !p.costPrice || p.costPrice === 0).length;

    const risingStars = useMemo(() => {
        return products
            .map(p => {
                const currentVel = p.averageDailySales;
                const prevVel = p.previousDailySales || 0;
                const growth = prevVel > 0 ? ((currentVel - prevVel) / prevVel) * 100 : 0;
                const periodUnits = currentVel * daysMultiplier;
                const prevPeriodUnits = prevVel * daysMultiplier;
                
                return { ...p, growth, periodUnits, prevPeriodUnits };
            })
            .filter(p => p.growth > 5 && p.periodUnits > 5)
            .sort((a, b) => b.growth - a.growth)
            .slice(0, 4);
    }, [products, daysMultiplier]);

    return (
        <div className="space-y-6 animate-in fade-in duration-500 pb-12">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex flex-col justify-between">
                    <div className="text-gray-500 text-xs font-bold uppercase mb-1">Total Products</div>
                    <div className="flex justify-between items-end">
                        <div className="text-2xl font-bold text-gray-900">{totalProducts}</div>
                        <Package className="w-5 h-5 text-gray-300 mb-1" />
                    </div>
                </div>
                <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex flex-col justify-between">
                    <div className="text-gray-500 text-xs font-bold uppercase mb-1">Stock on Hand</div>
                    <div className="flex justify-between items-end">
                        <div className="text-2xl font-bold text-gray-900">{totalStock.toLocaleString()}</div>
                        <div className="text-xs text-gray-400 mb-1">Units</div>
                    </div>
                </div>
                <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex flex-col justify-between">
                    <div className="text-gray-500 text-xs font-bold uppercase mb-1">Incoming Stock</div>
                    <div className="flex justify-between items-end">
                        <div className="text-2xl font-bold text-indigo-600">+{totalIncoming.toLocaleString()}</div>
                        <Ship className="w-5 h-5 text-indigo-100 mb-1" />
                    </div>
                </div>
                <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex flex-col justify-between">
                    <div className="text-gray-500 text-xs font-bold uppercase mb-1">Inventory Value</div>
                    <div className="flex justify-between items-end">
                        <div className="text-2xl font-bold text-gray-900">£{totalValue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
                        <div className="text-xs text-gray-400 mb-1">COGS</div>
                    </div>
                </div>
            </div>

            <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <button 
                            onClick={() => setShowDatePicker(!showDatePicker)}
                            className={`p-2 border rounded-lg hover:bg-gray-50 transition-colors ${showDatePicker || range === 'custom' ? 'border-indigo-300 text-indigo-600 bg-indigo-50' : 'border-gray-200 text-gray-600 bg-white/50'}`}
                        >
                            <Calendar className="w-5 h-5" />
                        </button>
                        {showDatePicker && (
                            <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-50 animate-in fade-in slide-in-from-top-2 w-64">
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-3">Select Date Range</label>
                                <div className="space-y-3">
                                    <div>
                                        <span className="text-[10px] text-gray-400 font-bold">START DATE</span>
                                        <input 
                                            type="date" 
                                            value={customStart}
                                            onChange={(e) => {
                                                setCustomStart(e.target.value);
                                                setRange('custom');
                                            }}
                                            className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full mt-1"
                                        />
                                    </div>
                                    <div>
                                        <span className="text-[10px] text-gray-400 font-bold">END DATE</span>
                                        <input 
                                            type="date" 
                                            value={customEnd}
                                            onChange={(e) => {
                                                setCustomEnd(e.target.value);
                                                setRange('custom');
                                            }}
                                            min={customStart}
                                            className="border border-gray-300 rounded px-2 py-1.5 text-sm w-full mt-1"
                                        />
                                    </div>
                                </div>
                                <div className="mt-3 flex justify-end">
                                    <button 
                                        onClick={() => setShowDatePicker(false)}
                                        className="text-xs text-indigo-600 font-bold hover:underline"
                                    >
                                        Close
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                    
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setRange('yesterday')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${range === 'yesterday' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Yesterday
                        </button>
                        <button 
                            onClick={() => setRange('7d')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${range === '7d' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Last 7 Days
                        </button>
                        <button 
                            onClick={() => setRange('30d')}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${range === '30d' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            Last 30 Days
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50/50 px-3 py-1.5 rounded-lg border border-gray-100">
                    <Clock className="w-4 h-4" />
                    View: <span className="font-bold text-gray-900">{periodLabel}</span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-custom-glass p-6 rounded-xl border border-custom-glass shadow-sm flex flex-col h-[400px]">
                    <div className="flex justify-between items-start mb-6">
                        <div className="flex items-center gap-2">
                            <div className="p-1.5 bg-indigo-50 rounded text-indigo-600"><TrendingUp className="w-4 h-4" /></div>
                            <h3 className="font-bold text-gray-900">Top Sellers</h3>
                        </div>
                        <div className="flex gap-1 text-[10px] bg-gray-100 p-1 rounded">
                            <button 
                                onClick={() => setTopSellerMetric('units')}
                                className={`px-2 py-0.5 rounded shadow-sm font-medium transition-all ${topSellerMetric === 'units' ? 'bg-white text-gray-800' : 'text-gray-500'}`}
                            >
                                Units
                            </button>
                            <button 
                                onClick={() => setTopSellerMetric('rev')}
                                className={`px-2 py-0.5 rounded shadow-sm font-medium transition-all ${topSellerMetric === 'rev' ? 'bg-white text-gray-800' : 'text-gray-500'}`}
                            >
                                £ Rev
                            </button>
                        </div>
                    </div>
                    
                    {topSellers.length === 0 ? (
                        <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">No sales data available for this period.</div>
                    ) : (
                        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                            {topSellers.map((p, idx) => {
                                const maxVal = topSellerMetric === 'units' ? topSellers[0].periodUnits : topSellers[0].periodRevenue;
                                const currentVal = topSellerMetric === 'units' ? p.periodUnits : p.periodRevenue;
                                const displayVal = topSellerMetric === 'units' ? Math.round(currentVal).toLocaleString() : `£${Math.round(currentVal).toLocaleString()}`;
                                
                                return (
                                    <div key={p.id} className="group">
                                        <div className="flex justify-between text-sm mb-1">
                                            <span className="font-medium text-gray-700 truncate max-w-[180px]" title={p.name}>{idx + 1}. {p.sku}</span>
                                            <span className="font-bold text-gray-900">{displayVal}</span>
                                        </div>
                                        <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                                            <div 
                                                className="h-full rounded-full transition-all duration-500 group-hover:bg-indigo-500" 
                                                style={{ width: `${(currentVal / maxVal) * 100}%`, backgroundColor: themeColor }}
                                            ></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                <div className="bg-custom-glass p-6 rounded-xl border border-custom-glass shadow-sm flex flex-col h-[400px]">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-blue-50 rounded text-blue-600"><BarChart2 className="w-4 h-4" /></div>
                        <h3 className="font-bold text-gray-900">Quantity by Main Category</h3>
                    </div>
                    <div className="flex-1 min-h-0 -ml-4">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <BarChart data={categoryData} layout="vertical" margin={{ top: 20, right: 30, left: 40, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                <XAxis type="number" hide />
                                <YAxis 
                                    dataKey="name" 
                                    type="category" 
                                    width={100} 
                                    tick={{ fontSize: 10, fill: '#6b7280' }} 
                                    interval={0}
                                />
                                <RechartsTooltip 
                                    cursor={{ fill: 'transparent' }}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                                />
                                <Bar dataKey="value" fill="#94a3b8" radius={[0, 4, 4, 0]} barSize={16}>
                                    {categoryData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={index === 0 ? themeColor : '#94a3b8'} />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="text-center">
                        <div className="text-[10px] text-gray-400 mt-2 font-medium flex justify-center items-center gap-4">
                            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-indigo-500 rounded-full" style={{ backgroundColor: themeColor }}></span> MAX: {categoryData[0]?.value || 0}</span>
                            <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-gray-400 rounded-full"></span> AVG: {(categoryData.reduce((a,b)=>a+b.value,0) / (categoryData.length || 1)).toFixed(0)}</span>
                        </div>
                    </div>
                </div>

                <div className="bg-custom-glass p-6 rounded-xl border border-custom-glass shadow-sm flex flex-col h-[400px]">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-1.5 bg-purple-50 rounded text-purple-600"><Globe className="w-4 h-4" /></div>
                        <h3 className="font-bold text-gray-900">Platform Presence</h3>
                    </div>
                    <div className="flex-1 min-h-0 relative">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                            <PieChart>
                                <Pie
                                    data={platformData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={90}
                                    paddingAngle={2}
                                    dataKey="value"
                                    cornerRadius={4}
                                >
                                    {platformData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} strokeWidth={0} />
                                    ))}
                                </Pie>
                                <RechartsTooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                                <span className="block text-3xl font-bold text-gray-800">{platformData.reduce((a,b)=>a+b.value,0)}</span>
                                <span className="text-[10px] text-gray-400 uppercase font-bold tracking-wider">Listings</span>
                            </div>
                        </div>
                    </div>
                    <div className="flex flex-wrap justify-center gap-3 mt-4 px-4">
                        {platformData.map(d => (
                            <div key={d.name} className="flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: d.color }}></span>
                                <span className="text-[10px] font-bold text-gray-600">{d.name}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-custom-glass p-6 rounded-xl border border-custom-glass shadow-sm flex flex-col justify-center">
                    <div className="flex items-center gap-2 mb-6">
                        <div className="p-1.5 bg-red-50 rounded text-red-600"><AlertCircle className="w-4 h-4" /></div>
                        <h3 className="font-bold text-gray-900">Catalogue Health</h3>
                    </div>
                    <div className="space-y-4">
                        <div className="flex justify-between items-center p-4 bg-red-50/50 rounded-lg border border-red-100">
                            <span className="text-sm font-medium text-gray-700">Missing Aliases</span>
                            <span className="text-xl font-bold text-red-600">{missingAliases}</span>
                        </div>
                        <div className="flex justify-between items-center p-4 bg-amber-50/50 rounded-lg border border-amber-100">
                            <span className="text-sm font-medium text-gray-700">Missing Costs</span>
                            <span className="text-xl font-bold text-amber-600">{missingCosts}</span>
                        </div>
                    </div>
                </div>

                <div className="md:col-span-2 bg-custom-glass p-6 rounded-xl border border-custom-glass shadow-sm flex flex-col">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-1.5 bg-green-50 rounded text-green-600"><TrendingUp className="w-4 h-4" /></div>
                        <h3 className="font-bold text-gray-900">Rising Stars ({range === 'yesterday' ? 'Yesterday' : periodLabel})</h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {risingStars.map(product => (
                            <div key={product.id} className="p-4 rounded-lg border border-gray-100 bg-gray-50 flex justify-between items-center hover:bg-white hover:shadow-sm transition-all">
                                <div>
                                    <div className="font-bold text-gray-900 text-sm uppercase">{product.sku}</div>
                                    <div className="text-xs text-gray-500 truncate max-w-[200px] mt-0.5">{product.name}</div>
                                </div>
                                <div className="text-right">
                                    <div className="inline-flex items-center px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-700">
                                        +{product.growth.toFixed(0)}%
                                    </div>
                                    <div className="text-[10px] text-gray-400 mt-1">
                                        {Math.round(product.prevPeriodUnits)} → {Math.round(product.periodUnits)} units
                                    </div>
                                </div>
                            </div>
                        ))}
                        {risingStars.length === 0 && (
                            <div className="col-span-2 text-center text-sm text-gray-400 py-8">
                                No significant positive trends detected in this period.
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const MasterCatalogView = ({ products, onEditAliases, onOpenMappingModal, themeColor }: { products: Product[], onEditAliases: (p: Product) => void, onOpenMappingModal: () => void, themeColor: string }) => {
    // ... (MasterCatalogView implementation remains unchanged)
    const [search, setSearch] = useState('');
    const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set());
    const [showInactive, setShowInactive] = useState(false);
    
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    const filtered = products.filter((p: Product) => {
        // Filter out inactive products if toggle is off
        if (!showInactive && p.stockLevel <= 0 && p.averageDailySales === 0) {
            return false;
        }
        
        return p.sku.toLowerCase().includes(search.toLowerCase()) ||
               p.name.toLowerCase().includes(search.toLowerCase());
    });

    // Reset page on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [search, showInactive]);

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginatedProducts = filtered.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    // Calculate empty rows for spreadsheet effect
    const emptyRows = Math.max(0, itemsPerPage - paginatedProducts.length);

    const toggleRow = (id: string) => {
        const newSet = new Set(expandedRows);
        if (newSet.has(id)) newSet.delete(id);
        else newSet.add(id);
        setExpandedRows(newSet);
    };

    const toggleAll = () => {
        if (expandedRows.size === filtered.length) {
            setExpandedRows(new Set());
        } else {
            setExpandedRows(new Set(filtered.map(p => p.id)));
        }
    };

    // Helper for Badge Styles (Blue/Green Logic - Consistent with ShipmentsView)
    const getBadgeStyle = (status: string) => {
        const lower = status.toLowerCase();
        if (lower.includes('to be shipped')) {
            return 'bg-blue-100 text-blue-700 border-blue-200'; // Blue for Scheduled
        }
        if (lower.includes('shipped out') || lower.includes('shipped')) {
            return 'bg-green-100 text-green-700 border-green-200'; // Green for Active
        }
        return 'bg-gray-100 text-gray-600 border-gray-200'; // Grey for Pending/Unknown
    };

    return (
        <div className="space-y-4 animate-in fade-in duration-500 h-full flex flex-col">
            <div className="flex items-center gap-4 bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search catalogue..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white/50"
                    />
                </div>
                
                <div className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 min-w-[140px]">
                    <span className="text-xs font-bold text-gray-500 uppercase mr-2">Show Inactive</span>
                    <button 
                        onClick={() => setShowInactive(!showInactive)}
                        className="text-gray-500 hover:text-indigo-600 focus:outline-none"
                        style={showInactive ? { color: themeColor } : {}}
                        title="Toggle products with 0 stock and 0 sales"
                    >
                        {showInactive ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                    </button>
                </div>

                <div className="flex gap-2">
                    <button
                        onClick={toggleAll}
                        className="px-3 py-2 bg-gray-100 text-gray-600 rounded-lg text-sm font-medium hover:bg-gray-200 flex items-center gap-2"
                    >
                        {expandedRows.size === filtered.length ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
                        {expandedRows.size === filtered.length ? 'Collapse All' : 'Expand All'}
                    </button>
                    <button
                        onClick={onOpenMappingModal}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                    >
                        <LinkIcon className="w-4 h-4" />
                        Import Aliases
                    </button>
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden flex-1 flex flex-col">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50/50 text-gray-500 font-bold border-b border-custom-glass sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 w-10"></th>
                                <th className="p-4">SKU</th>
                                <th className="p-4">Name</th>
                                <th className="p-4">Category</th>
                                <th className="p-4 text-right">Stock</th>
                                <th className="p-4 text-right">Incoming</th>
                                <th className="p-4 text-right">Next Arrival</th>
                                <th className="p-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/50">
                            {paginatedProducts.map((p: Product) => {
                                const isExpanded = expandedRows.has(p.id);
                                const totalIncoming = p.shipments?.reduce((sum, s) => sum + s.quantity, 0) || 0;
                                const shipmentCount = p.shipments?.length || 0;
                                
                                return (
                                    <React.Fragment key={p.id}>
                                        <tr className={`hover:bg-gray-50/50 cursor-pointer ${isExpanded ? 'bg-gray-50/30' : ''}`} onClick={() => toggleRow(p.id)}>
                                            <td className="p-4 text-center">
                                                {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                            </td>
                                            <td className="p-4 font-mono font-bold text-gray-900">{p.sku}</td>
                                            <td className="p-4 text-gray-600 truncate max-w-xs">{p.name}</td>
                                            <td className="p-4 text-xs font-medium text-gray-500">{p.category}</td>
                                            <td className="p-4 text-right font-bold">{p.stockLevel}</td>
                                            
                                            <td className="p-4 text-right">
                                                {totalIncoming > 0 ? (
                                                    <span 
                                                        className={`font-medium ${shipmentCount > 1 ? 'text-indigo-600 font-bold' : 'text-gray-900'}`}
                                                        title={shipmentCount > 1 ? `${shipmentCount} incoming shipments` : '1 incoming shipment'}
                                                    >
                                                        +{totalIncoming}
                                                    </span>
                                                ) : (
                                                    <span className="text-gray-300">-</span>
                                                )}
                                            </td>

                                            <td className="p-4 text-right text-gray-500 text-xs">
                                                {p.shipments && p.shipments.length > 0 
                                                    ? `${p.leadTimeDays} days` 
                                                    : '-'}
                                            </td>
                                            <td className="p-4 text-right">
                                                <button 
                                                    onClick={(e) => { e.stopPropagation(); onEditAliases(p); }} 
                                                    className="p-2 text-gray-400 hover:text-indigo-600"
                                                    title="Manage Aliases"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                        {isExpanded && (
                                            <tr className="bg-gray-50/30">
                                                <td colSpan={8} className="p-0">
                                                    <div className="p-4 pl-12 border-b border-gray-100 shadow-inner bg-gray-50/50">
                                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-2">
                                                            <Ship className="w-3 h-3" /> Incoming Shipments
                                                        </h4>
                                                        {p.shipments && p.shipments.length > 0 ? (
                                                            <table className="w-full max-w-2xl text-xs bg-white border border-gray-200 rounded-lg overflow-hidden">
                                                                <thead className="bg-gray-100 text-gray-600">
                                                                    <tr>
                                                                        <th className="p-2 text-left">Container No.</th>
                                                                        <th className="p-2 text-left">Status</th>
                                                                        <th className="p-2 text-right">Quantity</th>
                                                                        <th className="p-2 text-right">ETA</th>
                                                                    </tr>
                                                                </thead>
                                                                <tbody className="divide-y divide-gray-100">
                                                                    {p.shipments.map((s, idx) => (
                                                                        <tr key={idx}>
                                                                            <td className="p-2 font-mono font-medium">{s.containerId}</td>
                                                                            <td className="p-2">
                                                                                <span className={`px-1.5 py-0.5 rounded border ${getBadgeStyle(s.status)}`}>
                                                                                    {s.status}
                                                                                </span>
                                                                            </td>
                                                                            <td className="p-2 text-right">{s.quantity}</td>
                                                                            <td className="p-2 text-right">{s.eta || '-'}</td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        ) : (
                                                            <div className="text-xs text-gray-400 italic">No active shipments found.</div>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                );
                            })}
                            {/* Filler Rows for Spreadsheet Style */}
                            {emptyRows > 0 && Array.from({ length: emptyRows }).map((_, idx) => (
                                <tr key={`empty-${idx}`} className="h-[53px]">
                                    <td colSpan={8} className="p-4 text-transparent select-none">-</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                
                {/* Pagination Footer */}
                {filtered.length > 0 && (
                    <div className="bg-gray-50/50 px-4 py-3 border-t border-gray-200 flex items-center justify-between sm:px-6">
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                            <div>
                                <p className="text-sm text-gray-700">
                                    Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> of <span className="font-medium">{filtered.length}</span> results
                                </p>
                            </div>
                            <div>
                                {totalPages > 1 && (
                                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                            disabled={currentPage === 1}
                                            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            <span className="sr-only">Previous</span>
                                            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                                        </button>
                                        <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                            Page {currentPage} of {totalPages}
                                        </span>
                                        <button
                                            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                            disabled={currentPage === totalPages}
                                            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            <span className="sr-only">Next</span>
                                            <ChevronRight className="h-5 w-5" aria-hidden="true" />
                                        </button>
                                    </nav>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ... (Rest of components: ShipmentsView, PriceMatrixView, AliasDrawer remain largely unchanged in structure)
// Re-exporting them as is to keep file structure valid.

const ShipmentsView = ({ products, themeColor }: { products: Product[], themeColor: string }) => {
    // ... (ShipmentsView logic - same as before)
    const containerMap = useMemo(() => {
        const map: Record<string, { id: string, eta: string, status: string, totalQty: number, items: { sku: string, qty: number }[] }> = {};
        products.forEach(p => {
            if (p.shipments) {
                p.shipments.forEach(s => {
                    if (!map[s.containerId]) {
                        map[s.containerId] = { id: s.containerId, eta: s.eta || '', status: s.status, totalQty: 0, items: [] };
                    }
                    map[s.containerId].totalQty += s.quantity;
                    map[s.containerId].items.push({ sku: p.sku, qty: s.quantity });
                    if (s.eta) map[s.containerId].eta = s.eta;
                    if (s.status) map[s.containerId].status = s.status;
                });
            }
        });
        return Object.values(map).sort((a, b) => {
            if (!a.eta) return 1;
            if (!b.eta) return -1;
            return a.eta.localeCompare(b.eta);
        });
    }, [products]);

    const getBadgeStyle = (status: string) => {
        const lower = status.toLowerCase();
        if (lower.includes('to be shipped')) return 'bg-blue-100 text-blue-700 border-blue-200';
        if (lower.includes('shipped out') || lower.includes('shipped')) return 'bg-green-100 text-green-700 border-green-200';
        return 'bg-gray-100 text-gray-600 border-gray-200';
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4">
            {containerMap.map(c => (
                <div key={c.id} className="bg-custom-glass rounded-xl border border-custom-glass shadow-sm overflow-hidden flex flex-col">
                    <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-start">
                        <div>
                            <h3 className="font-bold text-gray-900 flex items-center gap-2"><Ship className="w-4 h-4 text-indigo-600" />{c.id}</h3>
                            <div className="text-xs text-gray-500 mt-1 flex items-center gap-2"><Calendar className="w-3 h-3" />ETA: {c.eta ? new Date(c.eta).toLocaleDateString() : 'Pending'}</div>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-1 rounded uppercase border ${getBadgeStyle(c.status)}`}>{c.status}</span>
                    </div>
                    <div className="p-4 flex-1">
                        <div className="flex justify-between items-center mb-2 text-xs font-bold text-gray-500 uppercase"><span>Contents</span><span>{c.totalQty} Units</span></div>
                        <div className="max-h-40 overflow-y-auto pr-1 space-y-1 custom-scrollbar">
                            {c.items.map((item, idx) => (
                                <div key={idx} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0">
                                    <span className="text-gray-700 font-mono truncate max-w-[180px]" title={item.sku}>{item.sku}</span>
                                    <span className="font-medium">{item.qty}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            ))}
            {containerMap.length === 0 && (
                <div className="col-span-full p-12 text-center text-gray-400 bg-custom-glass rounded-xl border border-dashed border-custom-glass">
                    <Ship className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    No active shipments found.
                </div>
            )}
        </div>
    );
};

const PriceMatrixView = ({ products, pricingRules, promotions, themeColor }: { products: Product[], pricingRules: PricingRules, promotions: PromotionEvent[], themeColor: string }) => {
    // ... (PriceMatrixView logic - same as before)
    const [search, setSearch] = useState('');
    const [showInactive, setShowInactive] = useState(false);
    const platforms = Object.keys(pricingRules);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    const filtered = products.filter((p: Product) => {
        if (!showInactive && p.stockLevel <= 0 && p.averageDailySales === 0) return false;
        return p.sku.toLowerCase().includes(search.toLowerCase()) || p.name.toLowerCase().includes(search.toLowerCase());
    });

    useEffect(() => { setCurrentPage(1); }, [search, showInactive]);

    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    const paginatedProducts = filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const emptyRows = Math.max(0, itemsPerPage - paginatedProducts.length);

    return (
        <div className="space-y-4 h-full flex flex-col">
            <div className="flex items-center gap-4 bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                    <input type="text" placeholder="Search product matrix..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm bg-white/50" />
                </div>
                <div className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 min-w-[140px]">
                    <span className="text-xs font-bold text-gray-500 uppercase mr-2">Show Inactive</span>
                    <button onClick={() => setShowInactive(!showInactive)} className="text-gray-500 hover:text-indigo-600 focus:outline-none" style={showInactive ? { color: themeColor } : {}}>
                        {showInactive ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                    </button>
                </div>
            </div>
            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden flex-1 flex flex-col">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50/50 text-gray-500 font-bold border-b border-custom-glass sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 sticky left-0 z-20 backdrop-blur-md bg-white/80">SKU</th>
                                <th className="p-4 text-right sticky left-[120px] z-20 border-r border-gray-200 backdrop-blur-md bg-white/80">Master Price</th>
                                {platforms.map(platform => <th key={platform} className="p-4 text-center">{platform}</th>)}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/50">
                            {paginatedProducts.map(p => (
                                <tr key={p.id} className="hover:bg-gray-50/50">
                                    <td className="p-4 font-mono font-bold text-gray-900 sticky left-0 z-10 bg-white/50 backdrop-blur-sm">{p.sku}</td>
                                    <td className="p-4 text-right font-medium sticky left-[120px] z-10 border-r border-gray-100 bg-white/50 backdrop-blur-sm">£{p.currentPrice.toFixed(2)}</td>
                                    {platforms.map(platform => {
                                        const channel = p.channels.find(c => c.platform === platform);
                                        return (
                                            <td key={platform} className="p-4 text-center">
                                                {channel ? (
                                                    <div className="flex flex-col items-center"><span className="font-bold text-gray-700">£{(channel.price || p.currentPrice).toFixed(2)}</span><span className="text-[10px] text-gray-400 mt-0.5">{channel.velocity.toFixed(1)}/day</span></div>
                                                ) : <span className="text-gray-300">-</span>}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                            {emptyRows > 0 && Array.from({ length: emptyRows }).map((_, idx) => (
                                <tr key={`empty-${idx}`} className="h-[69px]"><td className="p-4 sticky left-0 z-10 bg-white/50">&nbsp;</td><td className="p-4 sticky left-[120px] z-10 border-r border-gray-100 bg-white/50">&nbsp;</td>{platforms.map(p => <td key={p} className="p-4">&nbsp;</td>)}</tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {filtered.length > 0 && (
                    <div className="bg-gray-50/50 px-4 py-3 border-t border-gray-200/50 flex items-center justify-between sm:px-6">
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                            <div><p className="text-sm text-gray-700">Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> of <span className="font-medium">{filtered.length}</span> results</p></div>
                            <div>
                                {totalPages > 1 && (
                                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                        <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-5 w-5" /></button>
                                        <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">Page {currentPage} of {totalPages}</span>
                                        <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-5 w-5" /></button>
                                    </nav>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

const AliasDrawer = ({ product, pricingRules, onClose, onSave, themeColor }: { product: Product, pricingRules: PricingRules, onClose: () => void, onSave: (p: Product) => void, themeColor: string }) => {
    // 1. Initial State: Convert string aliases to array of tags
    const [platformTags, setPlatformTags] = useState<{ platform: string; tags: string[] }[]>(() => {
        const existing = product.channels.map(c => ({
            platform: c.platform,
            tags: c.skuAlias ? c.skuAlias.split(',').map(s => s.trim()).filter(Boolean) : []
        }));
        // Ensure all platforms from rules exist
        Object.keys(pricingRules).forEach(pKey => {
            if (!existing.find(e => e.platform === pKey)) {
                existing.push({ platform: pKey, tags: [] });
            }
        });
        return existing;
    });

    // 2. Input values state (what the user is currently typing per platform)
    const [inputValues, setInputValues] = useState<Record<string, string>>({});

    const handleInputChange = (platform: string, value: string) => {
        // If user enters comma, split and add tag immediately (handled via KeyDown usually, but regex safety here)
        if (value.includes(',')) {
            const parts = value.split(',').map(s => s.trim()).filter(Boolean);
            if (parts.length > 0) {
                addTags(platform, parts);
                setInputValues(prev => ({ ...prev, [platform]: '' }));
            }
        } else {
            setInputValues(prev => ({ ...prev, [platform]: value }));
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent, platform: string) => {
        const val = inputValues[platform]?.trim();
        if ((e.key === 'Enter') && val) {
            e.preventDefault();
            addTags(platform, [val]);
            setInputValues(prev => ({ ...prev, [platform]: '' }));
        } else if (e.key === 'Backspace' && !val) {
            // Remove last tag if input is empty
            const current = platformTags.find(p => p.platform === platform);
            if (current && current.tags.length > 0) {
                removeTag(platform, current.tags.length - 1);
            }
        }
    };

    const addTags = (platform: string, newTags: string[]) => {
        setPlatformTags(prev => prev.map(p => {
            if (p.platform === platform) {
                // Prevent duplicates
                const updated = [...p.tags];
                newTags.forEach(t => {
                    if (!updated.includes(t)) updated.push(t);
                });
                return { ...p, tags: updated };
            }
            return p;
        }));
    };

    const removeTag = (platform: string, index: number) => {
        setPlatformTags(prev => prev.map(p => {
            if (p.platform === platform) {
                const newTags = [...p.tags];
                newTags.splice(index, 1);
                return { ...p, tags: newTags };
            }
            return p;
        }));
    };

    const handleSave = () => {
        const updatedChannels = [...product.channels];
        
        platformTags.forEach(pt => {
            const aliasString = pt.tags.join(', ');
            const idx = updatedChannels.findIndex(c => c.platform === pt.platform);
            
            if (idx >= 0) {
                updatedChannels[idx] = { ...updatedChannels[idx], skuAlias: aliasString };
            } else if (aliasString) {
                // New channel entry
                updatedChannels.push({ 
                    platform: pt.platform, 
                    manager: pricingRules[pt.platform]?.manager || 'Unassigned', 
                    velocity: 0, 
                    skuAlias: aliasString 
                });
            }
        });
        
        onSave({ ...product, channels: updatedChannels });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white w-full max-w-md h-full shadow-2xl relative flex flex-col animate-in slide-in-from-right duration-300">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <div><h3 className="font-bold text-lg text-gray-900">Manage Aliases</h3><p className="text-xs text-gray-500 font-mono mt-1">{product.sku}</p></div>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
                </div>
                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                    <div className="text-sm text-gray-600 bg-blue-50 p-4 rounded-xl border border-blue-100 flex gap-3">
                        <div className="p-1 bg-blue-100 rounded h-fit text-blue-600"><LinkIcon className="w-4 h-4"/></div>
                        <div>
                            <p className="font-semibold text-blue-900 text-xs mb-1 uppercase">How Aliases Work</p>
                            Map platform-specific SKUs to this Master SKU. Type an alias and press <strong>Enter</strong> or <strong>Comma</strong> to add it.
                        </div>
                    </div>
                    
                    {platformTags.map((item) => (
                        <div key={item.platform} className="flex flex-col gap-2">
                            <label className="text-xs font-bold text-gray-500 uppercase tracking-wide ml-1">{item.platform}</label>
                            <div 
                                className="flex flex-wrap items-center gap-2 p-2 border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500 transition-all min-h-[42px]"
                                onClick={() => document.getElementById(`input-${item.platform}`)?.focus()}
                            >
                                {item.tags.map((tag, idx) => (
                                    <span key={idx} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100 animate-in fade-in zoom-in duration-200">
                                        {tag}
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); removeTag(item.platform, idx); }}
                                            className="hover:text-red-500 rounded-full hover:bg-red-50 p-0.5 transition-colors"
                                        >
                                            <X className="w-3 h-3" />
                                        </button>
                                    </span>
                                ))}
                                <input 
                                    id={`input-${item.platform}`}
                                    type="text" 
                                    value={inputValues[item.platform] || ''}
                                    onChange={(e) => handleInputChange(item.platform, e.target.value)}
                                    onKeyDown={(e) => handleKeyDown(e, item.platform)}
                                    placeholder={item.tags.length === 0 ? "Type SKU alias..." : ""}
                                    className="flex-1 min-w-[80px] outline-none text-sm bg-transparent placeholder-gray-400 text-gray-700"
                                />
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
                    <button onClick={handleSave} className="px-6 py-2 text-white font-medium rounded-lg shadow-md hover:opacity-90 transition-colors flex items-center gap-2" style={{ backgroundColor: themeColor }}>
                        <Save className="w-4 h-4" />
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ProductManagementPage;
