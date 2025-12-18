import React, { useState, useMemo } from 'react';
import { Product, PricingRules, PromotionEvent, PriceLog } from '../types';
import { Search, Link as LinkIcon, Package, Filter, User, Eye, EyeOff, ChevronLeft, ChevronRight, LayoutDashboard, List, DollarSign, TrendingUp, AlertCircle, CheckCircle, X, Save, ExternalLink, Tag, Globe, ArrowUpDown, ChevronUp, ChevronDown, Plus, Download, Calendar, Clock, BarChart2, Edit2 } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine } from 'recharts';

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

type Tab = 'dashboard' | 'catalog' | 'pricing';
type TimeFrame = 'Yesterday' | 'Last 7 Days' | 'Last 30 Days' | 'Custom';

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

  return (
    <div className="max-w-full mx-auto space-y-6 pb-10 h-full flex flex-col">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Product Management</h2>
            <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                Manage Master SKUs, aliases, and pricing consistency.
            </p>
        </div>
        <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
                onClick={() => setActiveTab('dashboard')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'dashboard' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
                <LayoutDashboard className="w-4 h-4" />
                Overview
            </button>
            <button
                onClick={() => setActiveTab('catalog')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'catalog' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
                <List className="w-4 h-4" />
                Master Catalog
            </button>
            <button
                onClick={() => setActiveTab('pricing')}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'pricing' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
            >
                <DollarSign className="w-4 h-4" />
                Price Matrix
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

          {activeTab === 'pricing' && (
              <PriceMatrixView 
                  products={products} 
                  pricingRules={pricingRules} 
                  promotions={promotions}
                  themeColor={themeColor} 
              />
          )}
      </div>

      {/* Slide-over Drawer for Aliases */}
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
    </div>
  );
};

// 1. DASHBOARD VIEW
const DashboardView = ({ products, priceHistory, themeColor }: { products: Product[], priceHistory: PriceLog[], themeColor: string }) => {
    const [timeFrame, setTimeFrame] = useState<TimeFrame>('Yesterday');
    const [showCalendar, setShowCalendar] = useState(false);
    const [rankMetric, setRankMetric] = useState<'quantity' | 'revenue'>('quantity');
    
    // Determine system reference points
    const systemToday = new Date();
    const systemYesterday = new Date(systemToday);
    systemYesterday.setDate(systemYesterday.getDate() - 1);
    const yesterdayStr = systemYesterday.toISOString().split('T')[0];

    // Find latest date with any data to act as anchor
    const datasetMaxDate = useMemo(() => {
        if (!priceHistory || priceHistory.length === 0) return yesterdayStr;
        return priceHistory.reduce((max, log) => log.date > max ? log.date : max, '0000-00-00');
    }, [priceHistory, yesterdayStr]);

    const anchorDateStr = datasetMaxDate > yesterdayStr ? datasetMaxDate : yesterdayStr;

    // Custom range state
    const [customRange, setCustomRange] = useState({
        start: new Date(new Date(anchorDateStr).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: anchorDateStr
    });

    const effectiveReportDate = useMemo(() => {
        if (!priceHistory || priceHistory.length === 0) return anchorDateStr;
        const availableDates = Array.from(new Set(priceHistory.map(p => p.date))).sort().reverse();
        const match = availableDates.find(d => d <= anchorDateStr);
        return match || anchorDateStr;
    }, [priceHistory, anchorDateStr]);

    const periodLength = useMemo(() => {
        if (timeFrame === 'Yesterday') return 1;
        if (timeFrame === 'Last 7 Days') return 7;
        if (timeFrame === 'Last 30 Days') return 30;
        if (timeFrame === 'Custom') {
            const start = new Date(customRange.start);
            const end = new Date(customRange.end);
            return Math.max(1, Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1);
        }
        return 1;
    }, [timeFrame, customRange]);

    // Aggregation logic
    const dynamicStats = useMemo(() => {
        const refDate = new Date(effectiveReportDate);

        return products.map(p => {
            let currentVelocity = 0;
            let previousVelocity = 0;
            const productLogs = priceHistory.filter(l => l.sku === p.sku);
            const hasAnyHistory = productLogs.length > 0;

            if (timeFrame === 'Yesterday') {
                const log = productLogs.find(l => l.date === effectiveReportDate);
                currentVelocity = log ? log.velocity : 0;
                const prevLog = productLogs.filter(l => l.date < effectiveReportDate).sort((a, b) => b.date.localeCompare(a.date))[0];
                previousVelocity = prevLog ? prevLog.velocity : 0;
            } else if (timeFrame === 'Custom') {
                const currentLogs = productLogs.filter(l => l.date >= customRange.start && l.date <= customRange.end);
                const totalUnits = currentLogs.reduce((sum, l) => sum + l.velocity, 0); 
                currentVelocity = currentLogs.length > 0 ? totalUnits / currentLogs.length : 0;
                previousVelocity = 0; 
            } else {
                const days = timeFrame === 'Last 7 Days' ? 7 : 30;
                const windowStart = new Date(refDate);
                windowStart.setDate(windowStart.getDate() - days + 1);
                const windowStartStr = windowStart.toISOString().split('T')[0];

                const currentLogs = productLogs.filter(l => l.date >= windowStartStr && l.date <= effectiveReportDate);
                currentVelocity = currentLogs.length > 0 ? currentLogs.reduce((sum, l) => sum + l.velocity, 0) / currentLogs.length : 0;

                const prevWindowStart = new Date(windowStart);
                prevWindowStart.setDate(prevWindowStart.getDate() - days);
                const prevWindowStartStr = prevWindowStart.toISOString().split('T')[0];
                const prevLogs = productLogs.filter(l => l.date >= prevWindowStartStr && l.date < windowStartStr);
                previousVelocity = prevLogs.length > 0 ? prevLogs.reduce((sum, l) => sum + l.velocity, 0) / prevLogs.length : 0;
            }

            // Trust history if it exists, otherwise fallback to ERP global average
            const finalVelocity = hasAnyHistory ? currentVelocity : (p.averageDailySales || 0);
            const finalPrevVelocity = hasAnyHistory ? previousVelocity : (p.previousDailySales || 0);

            return {
                ...p,
                _dynamicVelocity: finalVelocity,
                _previousVelocity: finalPrevVelocity,
                _dynamicGrowth: finalPrevVelocity > 0 ? (finalVelocity - finalPrevVelocity) / finalPrevVelocity : (finalVelocity > 0 ? 1 : 0)
            };
        });
    }, [products, priceHistory, timeFrame, effectiveReportDate, customRange]);

    const topSellers = useMemo(() => 
        [...dynamicStats]
        .map(p => ({
            ...p,
            _totalUnits: p._dynamicVelocity * periodLength,
            _totalRevenue: p._dynamicVelocity * periodLength * (p.currentPrice || 0)
        }))
        .filter(p => p._dynamicVelocity > 0)
        .sort((a, b) => {
            if (rankMetric === 'revenue') return b._totalRevenue - a._totalRevenue;
            return b._totalUnits - a._totalUnits;
        })
        .slice(0, 10), 
    [dynamicStats, periodLength, rankMetric]);

    const categoryStats = useMemo(() => {
        const stats: Record<string, number> = {};
        dynamicStats.forEach(p => {
            const cat = p.category || 'Uncategorized';
            // Rounding to whole number for units
            const totalUnits = Math.round(p._dynamicVelocity * periodLength);
            stats[cat] = (stats[cat] || 0) + totalUnits;
        });
        return Object.entries(stats)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);
    }, [dynamicStats, periodLength]);

    const maxCatQty = useMemo(() => Math.max(...categoryStats.map(s => s.value), 0), [categoryStats]);
    const minCatQty = useMemo(() => categoryStats.length > 0 ? Math.min(...categoryStats.map(s => s.value)) : 0, [categoryStats]);
    const avgCatQty = useMemo(() => categoryStats.length > 0 ? Math.round(categoryStats.reduce((sum, s) => sum + s.value, 0) / categoryStats.length) : 0, [categoryStats]);

    const topGrowers = useMemo(() => 
        [...dynamicStats]
        .sort((a, b) => {
            if (b._dynamicGrowth !== a._dynamicGrowth) return b._dynamicGrowth - a._dynamicGrowth;
            return b._dynamicVelocity - a._dynamicVelocity;
        })
        .slice(0, 10), 
    [dynamicStats]);
    
    const channelStats = useMemo(() => {
        const stats: Record<string, number> = {};
        products.forEach(p => {
            p.channels.forEach(c => {
                stats[c.platform] = (stats[c.platform] || 0) + 1;
            });
        });
        return Object.entries(stats).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
    }, [products]);

    const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#0ea5e9', '#d946ef'];

    const displayDateLabel = useMemo(() => {
        const fmt = (d: Date) => d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
        const fmtShort = (d: Date) => d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short'});

        if (timeFrame === 'Custom') {
            return `${fmtShort(new Date(customRange.start))} - ${fmt(new Date(customRange.end))}`;
        }
        
        const anchorDate = new Date(effectiveReportDate);
        if (timeFrame === 'Yesterday') {
            return fmt(anchorDate);
        }

        const days = timeFrame === 'Last 7 Days' ? 7 : 30;
        const startDate = new Date(anchorDate);
        startDate.setDate(startDate.getDate() - days + 1);

        return `${fmtShort(startDate)} - ${fmt(anchorDate)}`;
    }, [timeFrame, customRange, effectiveReportDate]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Filter Toolbar */}
            <div className="flex flex-col sm:flex-row justify-between items-center bg-white p-3 rounded-xl border border-gray-200 shadow-sm gap-4">
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setShowCalendar(!showCalendar)}
                        className={`p-2 rounded-lg transition-colors border ${showCalendar || timeFrame === 'Custom' ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-gray-50 border-gray-100 text-gray-500 hover:bg-gray-100'}`}
                        title="Pick Custom Range"
                    >
                        <Calendar className="w-4 h-4" />
                    </button>
                    <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                        {(['Yesterday', 'Last 7 Days', 'Last 30 Days'] as TimeFrame[]).map(tf => (
                            <button
                                key={tf}
                                onClick={() => { setTimeFrame(tf); setShowCalendar(false); }}
                                className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${timeFrame === tf ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {tf}
                            </button>
                        ))}
                        {timeFrame === 'Custom' && (
                            <button className="px-4 py-1.5 bg-white text-indigo-600 shadow-sm rounded-md text-xs font-bold border border-indigo-100">Custom Range</button>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-100 text-xs font-medium text-gray-500">
                    <Clock className="w-3 h-3" />
                    <span>View: <strong className="text-gray-800">{displayDateLabel}</strong></span>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* 1. Top Sellers */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-2">
                            <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                <TrendingUp className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-gray-900">Top Sellers</h3>
                        </div>
                        {/* Metric Toggle */}
                        <div className="flex bg-gray-100 p-1 rounded-md">
                            <button 
                                onClick={() => setRankMetric('quantity')}
                                className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${rankMetric === 'quantity' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Units
                            </button>
                            <button 
                                onClick={() => setRankMetric('revenue')}
                                className={`px-2 py-1 text-[10px] font-bold rounded transition-all ${rankMetric === 'revenue' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                £ Rev
                            </button>
                        </div>
                    </div>
                    <div className="space-y-3">
                        {topSellers.map((p, i) => (
                            <div key={p.id} className="flex items-center justify-between group">
                                <div className="flex items-center gap-3 overflow-hidden">
                                    <span className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 ${i < 3 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>{i + 1}</span>
                                    <div className="truncate min-w-0">
                                        <div className="text-sm font-bold text-gray-900 font-mono truncate" title={p.sku}>{p.sku}</div>
                                        <div className="text-[10px] text-gray-400 truncate" title={p.name}>{p.name}</div>
                                    </div>
                                </div>
                                <div className="text-right flex flex-col items-end">
                                    <div className="text-[11px] font-bold text-gray-900 whitespace-nowrap">
                                        {rankMetric === 'revenue' 
                                            ? `£${Math.round(p._totalRevenue).toLocaleString()}` 
                                            : `${Math.round(p._totalUnits).toLocaleString()} units`}
                                    </div>
                                    <div className="text-[9px] text-gray-400 font-medium font-mono">
                                        {p._dynamicVelocity.toFixed(1)}/day
                                    </div>
                                </div>
                            </div>
                        ))}
                        {topSellers.length === 0 && <div className="text-gray-400 text-xs py-8 text-center">No sales data available for this period.</div>}
                    </div>
                </div>

                {/* 2. Main Category Quantity */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm col-span-1 lg:col-span-1">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                            <BarChart2 className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-gray-900">Quantity by Main Category</h3>
                    </div>
                    <div className="h-[280px] mt-4 overflow-y-auto pr-1 custom-scrollbar">
                        <div style={{ height: Math.max(260, categoryStats.length * 32) + 'px', minWidth: '100%' }}>
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={categoryStats} layout="vertical" margin={{ left: -10, right: 20, top: 30, bottom: 20 }}>
                                    <XAxis type="number" hide domain={[0, maxCatQty > 0 ? maxCatQty * 1.1 : 'auto']} />
                                    <YAxis 
                                        dataKey="name" 
                                        type="category" 
                                        width={110} 
                                        tick={{ fontSize: 10, fontWeight: 500 }} 
                                        axisLine={false} 
                                        tickLine={false}
                                    />
                                    <RechartsTooltip 
                                        cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                        formatter={(value: any) => [`${value} units`, 'Total Quantity']}
                                    />
                                    <Bar dataKey="value" fill={themeColor} radius={[0, 4, 4, 0]} barSize={16} minPointSize={2} />
                                    
                                    {/* Minimum Reference Line */}
                                    {minCatQty > 0 && (
                                        <ReferenceLine 
                                            x={minCatQty} 
                                            stroke="#f59e0b" 
                                            strokeDasharray="3 3" 
                                            label={{ value: 'Min', position: 'top', fill: '#f59e0b', fontSize: 10, fontWeight: 'bold' }} 
                                        />
                                    )}

                                    {/* Average Reference Line */}
                                    {avgCatQty > 0 && (
                                        <ReferenceLine 
                                            x={avgCatQty} 
                                            stroke="#6366f1" 
                                            strokeDasharray="3 3" 
                                            label={{ value: 'Avg', position: 'top', fill: '#6366f1', fontSize: 10, fontWeight: 'bold' }} 
                                        />
                                    )}
                                    
                                    {/* Maximum Reference Line */}
                                    {maxCatQty > 0 && (
                                        <ReferenceLine 
                                            x={maxCatQty} 
                                            stroke="#10b981" 
                                            strokeDasharray="3 3" 
                                            label={{ value: 'Max', position: 'top', fill: '#10b981', fontSize: 10, fontWeight: 'bold' }} 
                                        />
                                    )}
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="flex justify-center gap-4 mt-2 border-t border-gray-50 pt-2">
                         <div className="flex items-center gap-1.5">
                             <div className="w-2.5 h-0.5 border-t-2 border-dashed border-amber-500"></div>
                             <span className="text-[10px] text-gray-500 font-bold uppercase">Min: {minCatQty}</span>
                         </div>
                         <div className="flex items-center gap-1.5">
                             <div className="w-2.5 h-0.5 border-t-2 border-dashed border-indigo-500"></div>
                             <span className="text-[10px] text-gray-500 font-bold uppercase">Average: {avgCatQty}</span>
                         </div>
                         <div className="flex items-center gap-1.5">
                             <div className="w-2.5 h-0.5 border-t-2 border-dashed border-emerald-500"></div>
                             <span className="text-[10px] text-gray-500 font-bold uppercase">Max: {maxCatQty}</span>
                         </div>
                    </div>
                </div>

                {/* 3. Platform Distribution */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-2">
                        <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                            <Globe className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-gray-900">Platform Presence</h3>
                    </div>
                    <div className="h-56">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={channelStats}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={50}
                                    outerRadius={70}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {channelStats.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <RechartsTooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                    <div className="flex flex-wrap gap-2 justify-center mt-2">
                        {channelStats.slice(0, 4).map((entry, index) => (
                            <div key={entry.name} className="flex items-center gap-1 text-[10px] font-medium bg-gray-50 px-1.5 py-0.5 rounded border border-gray-100">
                                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                                <span className="text-gray-600">{entry.name}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 4. Health & Rising Stars */}
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 bg-red-50 rounded-lg text-red-600">
                                <AlertCircle className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-gray-900">Catalog Health</h3>
                        </div>
                        <div className="space-y-3">
                            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                                <span className="text-sm text-gray-600">Missing Aliases</span>
                                <span className="font-bold text-red-600">{products.filter(p => p.channels.length === 0).length}</span>
                            </div>
                            <div className="flex justify-between p-3 bg-gray-50 rounded-lg">
                                <span className="text-sm text-gray-600">Missing Costs</span>
                                <span className="font-bold text-orange-600">{products.filter(p => !p.costPrice || p.costPrice === 0).length}</span>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-green-50 rounded-lg text-green-600">
                            <TrendingUp className="w-5 h-5" />
                        </div>
                        <h3 className="font-bold text-gray-900">Rising Stars ({timeFrame})</h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {topGrowers.map(p => (
                            <div key={p.id} className="flex justify-between items-center p-3 border border-gray-100 rounded-lg bg-gray-50/50 hover:bg-gray-50 transition-colors">
                                <div className="truncate pr-2">
                                    <div className="text-sm font-bold text-gray-900 font-mono truncate">{p.sku}</div>
                                    <div className="text-[10px] text-gray-400 truncate">{p.name}</div>
                                </div>
                                <div className="text-right flex flex-col items-end gap-1">
                                    <div className={`text-xs font-bold px-2 py-1 rounded ${p._dynamicGrowth >= 0 ? 'text-green-600 bg-green-100' : 'text-amber-600 bg-amber-100'}`}>
                                        {p._dynamicGrowth >= 0 ? '+' : ''}{(p._dynamicGrowth * 100).toFixed(0)}%
                                    </div>
                                    <div className="text-[9px] font-mono text-gray-400 font-bold">
                                        {Math.round(p._previousVelocity * periodLength)} → {Math.round(p._dynamicVelocity * periodLength)} units
                                    </div>
                                </div>
                            </div>
                        ))}
                        {topGrowers.length === 0 && <div className="text-gray-400 text-xs italic col-span-2 py-10 text-center">No trending data available.</div>}
                    </div>
                </div>
            </div>
        </div>
    );
}

// 2. MASTER CATALOG VIEW
const MasterCatalogView = ({ products, onEditAliases, onOpenMappingModal, themeColor }: { products: Product[], onEditAliases: (p: Product) => void, onOpenMappingModal: () => void, themeColor: string }) => {
    const [search, setSearch] = useState('');

    const filtered = products.filter((p: Product) =>
        p.sku.toLowerCase().includes(search.toLowerCase()) ||
        p.name.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-4 animate-in fade-in duration-500">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search catalog..."
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                </div>
                <button
                    onClick={onOpenMappingModal}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium flex items-center gap-2"
                >
                    <LinkIcon className="w-4 h-4" />
                    Import Aliases
                </button>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 text-gray-500 font-bold border-b">
                        <tr>
                            <th className="p-4">SKU</th>
                            <th className="p-4">Name</th>
                            <th className="p-4">Category</th>
                            <th className="p-4 text-right">Stock</th>
                            <th className="p-4 text-center">Channels</th>
                            <th className="p-4"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {filtered.map((p: Product) => (
                            <tr key={p.id} className="hover:bg-gray-50">
                                <td className="p-4 font-mono font-bold text-gray-900">{p.sku}</td>
                                <td className="p-4 text-gray-600 truncate max-w-xs">{p.name}</td>
                                <td className="p-4 text-xs font-medium text-gray-500">{p.category}</td>
                                <td className="p-4 text-right">{p.stockLevel}</td>
                                <td className="p-4 text-center">
                                    <div className="flex justify-center -space-x-2">
                                        {p.channels.slice(0, 3).map((c: any, i: number) => (
                                            <div key={i} className="w-6 h-6 rounded-full border-2 border-white bg-indigo-100 flex items-center justify-center text-[8px] font-bold text-indigo-600">
                                                {c.platform[0]}
                                            </div>
                                        ))}
                                    </div>
                                </td>
                                <td className="p-4 text-right">
                                    <button onClick={() => onEditAliases(p)} className="p-2 text-gray-400 hover:text-indigo-600">
                                        <Edit2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// 3. PRICE MATRIX VIEW
const PriceMatrixView = ({ products, pricingRules, promotions, themeColor }: { products: Product[], pricingRules: PricingRules, promotions: PromotionEvent[], themeColor: string }) => {
    const platforms = Object.keys(pricingRules);

    return (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-in fade-in duration-500 h-full flex flex-col">
            <div className="overflow-auto flex-1">
                <table className="w-full text-left text-xs">
                    <thead className="bg-gray-50 text-gray-500 font-bold border-b uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                        <tr>
                            <th className="p-4 sticky left-0 bg-gray-50 z-20 border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Master SKU</th>
                            {platforms.map(plat => <th key={plat} className="p-4 text-right min-w-[120px]">{plat}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {products.map((p: Product) => (
                            <tr key={p.id} className="hover:bg-gray-50">
                                <td className="p-4 sticky left-0 bg-white font-bold text-gray-900 border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] group-hover:bg-gray-50">{p.sku}</td>
                                {platforms.map((plat: string) => {
                                    const channel = p.channels.find((c: any) => c.platform === plat);
                                    const price = channel?.price || p.currentPrice;
                                    
                                    // Find active promotion logic (Updated)
                                    const activePromo = promotions?.find((promo: PromotionEvent) => 
                                        promo.platform === plat && 
                                        promo.status === 'ACTIVE' &&
                                        promo.items.some((item: any) => item.sku === p.sku)
                                    );
                                    const promoItem = activePromo?.items.find((item: any) => item.sku === p.sku);

                                    return (
                                        <td key={plat} className="p-4 text-right">
                                            <div className="font-mono font-bold text-gray-700">£{price.toFixed(2)}</div>
                                            {promoItem ? (
                                                <div className="text-[10px] text-red-600 font-bold mt-1 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 inline-block whitespace-nowrap">
                                                    Promo: £{promoItem.promoPrice.toFixed(2)}
                                                </div>
                                            ) : null}
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// 4. ALIAS DRAWER
const AliasDrawer = ({ product, pricingRules, onClose, onSave, themeColor }: { product: Product, pricingRules: PricingRules, onClose: () => void, onSave: (p: Product) => void, themeColor: string }) => {
    const [localProduct, setLocalProduct] = useState({ ...product });
    const [newAliasInputs, setNewAliasInputs] = useState<Record<string, string>>({}); // Temporary inputs for tags

    const addAlias = (platform: string, alias: string) => {
        if (!alias.trim()) return;
        
        const updatedChannels = [...localProduct.channels];
        const idx = updatedChannels.findIndex((c: any) => c.platform === platform);
        
        // Helper to merge lists
        const merge = (current: string) => {
            const set = new Set(current ? current.split(',').map(s => s.trim()) : []);
            set.add(alias.trim());
            return Array.from(set).join(',');
        };

        if (idx >= 0) {
            updatedChannels[idx] = { 
                ...updatedChannels[idx], 
                skuAlias: merge(updatedChannels[idx].skuAlias || '') 
            };
        } else {
            updatedChannels.push({ 
                platform, 
                manager: pricingRules[platform]?.manager || 'Unassigned', 
                velocity: 0, 
                skuAlias: alias.trim() 
            });
        }
        
        setLocalProduct({ ...localProduct, channels: updatedChannels });
        setNewAliasInputs(prev => ({ ...prev, [platform]: '' })); // Clear input
    };

    const removeAlias = (platform: string, aliasToRemove: string) => {
        const updatedChannels = [...localProduct.channels];
        const idx = updatedChannels.findIndex((c: any) => c.platform === platform);
        if (idx >= 0) {
            const currentAliases = updatedChannels[idx].skuAlias ? updatedChannels[idx].skuAlias.split(',').map((s: string) => s.trim()) : [];
            const newAliases = currentAliases.filter((a: string) => a !== aliasToRemove);
            
            if (newAliases.length === 0) {
                // Keep the channel but empty aliases to preserve sales data attached to channel?
                // Or just set alias string to empty
                updatedChannels[idx] = { ...updatedChannels[idx], skuAlias: '' };
            } else {
                updatedChannels[idx] = { ...updatedChannels[idx], skuAlias: newAliases.join(',') };
            }
            setLocalProduct({ ...localProduct, channels: updatedChannels });
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex justify-end">
            <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose}></div>
            <div className="relative w-full max-w-md bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-300">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Aliases</h3>
                        <p className="text-xs text-gray-500 font-mono">{product.sku}</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>
                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                    {Object.keys(pricingRules).map(plat => {
                        const channel = localProduct.channels.find((c: any) => c.platform === plat);
                        const aliases = channel?.skuAlias ? channel.skuAlias.split(',').filter((s: string) => s.trim()) : [];
                        const inputValue = newAliasInputs[plat] || '';

                        return (
                            <div key={plat} className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase">{plat}</label>
                                
                                <div className="border border-gray-300 rounded-lg p-2 bg-white flex flex-wrap gap-2 focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-indigo-500">
                                    {aliases.map((alias: string) => (
                                        <span key={alias} className="inline-flex items-center px-2 py-1 rounded bg-indigo-50 text-indigo-700 text-xs font-medium border border-indigo-100">
                                            {alias}
                                            <button 
                                                onClick={() => removeAlias(plat, alias)}
                                                className="ml-1 hover:text-indigo-900"
                                            >
                                                <X className="w-3 h-3" />
                                            </button>
                                        </span>
                                    ))}
                                    <input
                                        type="text"
                                        value={inputValue}
                                        onChange={(e) => setNewAliasInputs(prev => ({ ...prev, [plat]: e.target.value }))}
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                addAlias(plat, inputValue);
                                            }
                                        }}
                                        onBlur={() => {
                                            if (inputValue.trim()) addAlias(plat, inputValue);
                                        }}
                                        placeholder={aliases.length === 0 ? "Type SKU alias & enter" : "+"}
                                        className="flex-1 min-w-[100px] text-sm outline-none bg-transparent"
                                    />
                                </div>
                            </div>
                        );
                    })}
                </div>
                <div className="p-6 border-t bg-gray-50 gap-3 flex">
                    <button onClick={onClose} className="flex-1 px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg">Cancel</button>
                    <button onClick={() => { onSave(localProduct); onClose(); }} className="flex-1 px-4 py-2 text-white font-medium rounded-lg" style={{ backgroundColor: themeColor }}>Save</button>
                </div>
            </div>
        </div>
    );
};

export default ProductManagementPage;