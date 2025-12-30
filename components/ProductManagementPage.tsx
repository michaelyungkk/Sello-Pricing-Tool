
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Product, PricingRules, PromotionEvent, PriceLog, ShipmentDetail } from '../types';
import { TagSearchInput } from './TagSearchInput';
import { Search, Link as LinkIcon, Package, Filter, User, Eye, EyeOff, ChevronLeft, ChevronRight, LayoutDashboard, List, DollarSign, TrendingUp, TrendingDown, AlertCircle, CheckCircle, X, Save, ExternalLink, Tag, Globe, ArrowUpDown, ChevronUp, ChevronDown, Plus, Download, Calendar, Clock, BarChart2, Edit2, Ship, Maximize2, Minimize2, ArrowRight, Database, Layers, RotateCcw, Upload, FileBarChart, PieChart as PieIcon, AlertTriangle, Activity } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, LineChart, Line, AreaChart, Area, Legend } from 'recharts';
import ProductList from './ProductList';

interface ProductManagementPageProps {
    products: Product[];
    pricingRules: PricingRules;
    promotions?: PromotionEvent[];
    priceHistoryMap?: Map<string, PriceLog[]>;
    onOpenMappingModal: () => void;
    // Optional handlers left for compatibility if needed, but UI trigger removed
    onOpenSales?: () => void;
    onOpenInventory?: () => void;
    onOpenReturns?: () => void;
    onOpenCA?: () => void;
    onAnalyze: (product: Product) => void;
    dateLabels: { current: string, last: string };
    onUpdateProduct?: (product: Product) => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
}

type Tab = 'dashboard' | 'catalog' | 'pricing' | 'shipments';
type DateRange = 'yesterday' | '7d' | '30d' | 'custom';
type AlertType = 'margin' | 'velocity' | 'stock' | 'dead' | null;

const VAT = 1.20;

const ProductManagementPage: React.FC<ProductManagementPageProps> = ({
    products,
    pricingRules,
    promotions = [],
    priceHistoryMap = new Map(),
    onOpenMappingModal,
    onAnalyze,
    dateLabels,
    onUpdateProduct,
    themeColor,
    headerStyle
}) => {
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');
    const [selectedProductForDrawer, setSelectedProductForDrawer] = useState<Product | null>(null);
    
    // Lifted State for Shipment Search (Cross-Link Capability)
    const [shipmentSearchTags, setShipmentSearchTags] = useState<string[]>([]);

    const handleViewShipments = (sku: string) => {
        setShipmentSearchTags([sku]);
        setActiveTab('shipments');
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
                        Decision Engine
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
            </div>

            {/* Main Content Area */}
            <div className="flex-1 min-h-0 relative">
                {activeTab === 'dashboard' && (
                    <DashboardView
                        products={products}
                        priceHistoryMap={priceHistoryMap}
                        pricingRules={pricingRules}
                        themeColor={themeColor}
                        onAnalyze={onAnalyze}
                    />
                )}

                {activeTab === 'catalog' && (
                    <ProductList
                        products={products}
                        onAnalyze={onAnalyze}
                        onEditAliases={setSelectedProductForDrawer}
                        onViewShipments={handleViewShipments}
                        dateLabels={dateLabels}
                        pricingRules={pricingRules}
                        themeColor={themeColor}
                    />
                )}

                {activeTab === 'shipments' && (
                    <ShipmentsView 
                        products={products} 
                        themeColor={themeColor} 
                        initialTags={shipmentSearchTags}
                        onTagsChange={setShipmentSearchTags}
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
        </div>
    );
};

const DashboardView = ({
    products,
    priceHistoryMap,
    pricingRules,
    themeColor,
    onAnalyze,
}: {
    products: Product[],
    priceHistoryMap: Map<string, PriceLog[]>,
    pricingRules: PricingRules,
    themeColor: string,
    onAnalyze: (product: Product) => void,
}) => {
    const [range, setRange] = useState<DateRange>('yesterday');
    const [customStart, setCustomStart] = useState(new Date().toISOString().split('T')[0]);
    const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [platformScope, setPlatformScope] = useState<string>('All');
    const [selectedAlert, setSelectedAlert] = useState<AlertType>(null);
    
    // Pagination for Workbench
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 10;

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedAlert, range, platformScope]);

    // Helper to get platform color from settings with fallback
    const getPlatformColor = (configKey: string, fallback: string) => {
        return pricingRules[configKey]?.color || fallback;
    };

    // --- 1. Filter Logic based on Range & Scope ---
    const { processedData, periodLabel, dateRange } = useMemo(() => {
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
            endDate.setDate(endDate.getDate() - 1); // Exclude today
            days = 7;
            label = 'Last 7 Days';
        } else if (range === '30d') {
            startDate.setDate(startDate.getDate() - 30);
            endDate.setDate(endDate.getDate() - 1); // Exclude today
            days = 30;
            label = 'Last 30 Days';
        } else if (range === 'custom') {
            startDate = new Date(customStart);
            endDate = new Date(customEnd);
            if (startDate > endDate) { const temp = startDate; startDate = endDate; endDate = temp; }
            const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
            days = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
            label = `${startDate.toLocaleDateString()} - ${endDate.toLocaleDateString()}`;
        }

        // Previous Period Logic (for velocity comparison)
        const prevStart = new Date(startDate);
        const prevEnd = new Date(startDate);
        prevEnd.setDate(prevEnd.getDate() - 1);
        prevStart.setDate(prevStart.getDate() - days);

        // Convert to YYYY-MM-DD
        const sStr = startDate.toISOString().split('T')[0];
        const eStr = endDate.toISOString().split('T')[0];
        const psStr = prevStart.toISOString().split('T')[0];
        const peStr = prevEnd.toISOString().split('T')[0];

        // Process Products
        const data = products.map(p => {
            const logs = priceHistoryMap.get(p.sku) || [];
            
            // Filter logs by Scope (Platform)
            const scopeLogs = platformScope === 'All' 
                ? logs 
                : logs.filter(l => l.platform === platformScope || (platformScope !== 'All' && l.platform?.includes(platformScope)));

            // Calculate Period Stats
            let curUnits = 0; let curRev = 0; let curProfit = 0;
            let prevUnits = 0;

            scopeLogs.forEach(l => {
                const d = l.date.split('T')[0];
                if (d >= sStr && d <= eStr) {
                    curUnits += l.velocity;
                    curRev += (l.velocity * l.price);
                    // Use stored profit or estimate from margin
                    curProfit += (l.profit || (l.velocity * l.price * (l.margin / 100)));
                } else if (d >= psStr && d <= peStr) {
                    prevUnits += l.velocity;
                }
            });

            // Calculate Net Margin % for the period
            // If Revenue is 0, we can't calc margin from sales. 
            // Fallback: Use Product's current calculated margin if available, otherwise 0.
            const netMargin = curRev > 0 ? (curProfit / curRev) * 100 : 0;

            // Velocity Change
            const velocityChange = prevUnits > 0 ? ((curUnits - prevUnits) / prevUnits) * 100 : (curUnits > 0 ? 100 : 0);

            // Platform Specific Stock/Price (Context)
            let displayPrice = p.currentPrice;
            if (platformScope !== 'All') {
                const channel = p.channels.find(c => c.platform === platformScope);
                if (channel && channel.price) displayPrice = channel.price;
            }

            return {
                ...p,
                periodUnits: curUnits,
                periodRevenue: curRev,
                periodProfit: curProfit,
                periodMargin: netMargin,
                prevPeriodUnits: prevUnits,
                velocityChange,
                displayPrice
            };
        });

        return { processedData: data, periodLabel: label, dateRange: { start: startDate, end: endDate } };
    }, [products, priceHistoryMap, range, customStart, customEnd, platformScope]);

    // --- 2. Alert Buckets Logic ---
    const alerts = useMemo(() => {
        return {
            // Margin Thieves: Active Items with < 10% Margin
            margin: processedData.filter(p => p.periodUnits > 0 && p.periodMargin < 10),
            
            // Velocity Crashes: Active (prev) items dropped > 30%
            velocity: processedData.filter(p => p.prevPeriodUnits > 2 && p.velocityChange < -30),
            
            // Stock Risks: Runway < Lead Time (Global Stock used as fallback if platform stock not specific)
            stock: processedData.filter(p => {
                const dailyVel = p.periodUnits / (range === 'yesterday' ? 1 : range === '7d' ? 7 : 30); // Approx
                if (dailyVel <= 0) return false;
                const runway = p.stockLevel / dailyVel;
                return runway < p.leadTimeDays && p.stockLevel > 0;
            }),

            // Dead Stock: > £200 Value AND 0 Sales in Period
            dead: processedData.filter(p => p.stockLevel * (p.costPrice || 0) > 200 && p.periodUnits === 0)
        };
    }, [processedData, range]);

    // --- 3. Workbench Data ---
    const workbenchData = useMemo(() => {
        if (!selectedAlert) {
            // Default: Top Movers by Revenue
            return processedData.filter(p => p.periodRevenue > 0).sort((a, b) => b.periodRevenue - a.periodRevenue).slice(0, 50);
        }
        return alerts[selectedAlert].sort((a, b) => {
            if (selectedAlert === 'margin') return a.periodMargin - b.periodMargin; // Lowest margin first
            if (selectedAlert === 'velocity') return a.velocityChange - b.velocityChange; // Biggest drop first
            if (selectedAlert === 'stock') return a.stockLevel - b.stockLevel; // Lowest stock first
            if (selectedAlert === 'dead') return (b.stockLevel * (b.costPrice || 0)) - (a.stockLevel * (a.costPrice || 0)); // Highest value first
            return 0;
        });
    }, [selectedAlert, alerts, processedData]);

    const totalPages = Math.ceil(workbenchData.length / ITEMS_PER_PAGE);
    const paginatedData = workbenchData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);

    // --- 4. Market Intelligence Data ---
    const platformTrendData = useMemo(() => {
        // Daily breakdown for the selected range
        const days = [];
        for (let d = new Date(dateRange.start); d <= dateRange.end; d.setDate(d.getDate() + 1)) {
            days.push(new Date(d).toISOString().split('T')[0]);
        }

        return days.map(day => {
            const entry: any = { day: day.slice(5) }; // MM-DD
            
            products.forEach(p => {
                const logs = priceHistoryMap.get(p.sku) || [];
                logs.filter(l => l.date.startsWith(day)).forEach(l => {
                    const plat = l.platform?.toLowerCase() || '';
                    let key = 'Others';
                    
                    if (plat.includes('amazon') && plat.includes('fbm')) key = 'Amazon FBM';
                    else if (plat.includes('ebay')) key = 'eBay';
                    else if (plat.includes('the range')) key = 'The Range';
                    else if (plat.includes('tesco')) key = 'Tesco';
                    else if (plat.includes('debenhams')) key = 'Debenhams';
                    else if (plat.includes('wayfair')) key = 'Wayfair';
                    
                    // Note: Amazon FBA and others fall into 'Others' as per instruction to group the rest
                    
                    entry[key] = (entry[key] || 0) + (l.price * l.velocity);
                });
            });
            return entry;
        });
    }, [products, priceHistoryMap, dateRange]);

    const categoryProfitData = useMemo(() => {
        const catMap: Record<string, number> = {};
        processedData.forEach(p => {
            const cat = p.category || 'Uncategorized';
            catMap[cat] = (catMap[cat] || 0) + p.periodProfit;
        });
        return Object.entries(catMap)
            .map(([name, profit]) => ({ name, profit: Math.round(profit) }))
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 8); // Top 8
    }, [processedData]);

    const formattedDateRange = useMemo(() => {
        const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
        return `${dateRange.start.toLocaleDateString('en-GB', options)} - ${dateRange.end.toLocaleDateString('en-GB', options)}`;
    }, [dateRange]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            
            {/* 1. CONTROL DECK */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm gap-4 relative z-30">
                <div className="flex items-center gap-2">
                    {/* Platform Scope */}
                    <div className="relative">
                        <select 
                            value={platformScope} 
                            onChange={(e) => setPlatformScope(e.target.value)}
                            className="appearance-none bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold py-2 pl-4 pr-10 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="All">Global View (All)</option>
                            {Object.keys(pricingRules).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-indigo-600 pointer-events-none" />
                    </div>

                    <div className="h-8 w-px bg-gray-300 mx-2"></div>

                    {/* Date Picker */}
                    <div className="relative">
                        <button
                            onClick={() => setShowDatePicker(!showDatePicker)}
                            className={`p-2 border rounded-lg hover:bg-gray-50 transition-colors ${showDatePicker || range === 'custom' ? 'border-indigo-300 text-indigo-600 bg-indigo-50' : 'border-gray-200 text-gray-600 bg-white/50'}`}
                        >
                            <Calendar className="w-5 h-5" />
                        </button>
                        {showDatePicker && (
                            <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-50 animate-in fade-in slide-in-from-top-2 w-64">
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-3">Custom Range</label>
                                <div className="space-y-3">
                                    <input type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setRange('custom'); }} className="border rounded px-2 py-1.5 text-sm w-full" />
                                    <input type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setRange('custom'); }} min={customStart} className="border rounded px-2 py-1.5 text-sm w-full" />
                                </div>
                                <div className="mt-3 flex justify-end"><button onClick={() => setShowDatePicker(false)} className="text-xs text-indigo-600 font-bold">Close</button></div>
                            </div>
                        )}
                    </div>

                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        {['yesterday', '7d', '30d'].map((r: any) => (
                            <button
                                key={r}
                                onClick={() => setRange(r)}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${range === r ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {r === 'yesterday' ? 'Yesterday' : r === '7d' ? '7 Days' : '30 Days'}
                            </button>
                        ))}
                    </div>

                    {/* Date Range Label - Added here */}
                    <div className="ml-3 flex flex-col justify-center">
                        <span className="text-[10px] text-gray-400 font-bold uppercase leading-none mb-0.5">Period</span>
                        <span className="text-xs font-bold text-indigo-600 flex items-center gap-1">
                            {formattedDateRange}
                        </span>
                    </div>
                </div>
            </div>

            {/* 2. ALERT CARDS (Decision Layer) */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <AlertCard 
                    title="Margin Thieves" 
                    count={alerts.margin.length} 
                    icon={AlertTriangle} 
                    color="red" 
                    isActive={selectedAlert === 'margin'} 
                    onClick={() => setSelectedAlert(selectedAlert === 'margin' ? null : 'margin')} 
                    desc="Net Margin < 10%"
                />
                <AlertCard 
                    title="Velocity Crashes" 
                    count={alerts.velocity.length} 
                    icon={TrendingDown} 
                    color="amber" 
                    isActive={selectedAlert === 'velocity'} 
                    onClick={() => setSelectedAlert(selectedAlert === 'velocity' ? null : 'velocity')}
                    desc="Vol. Drop > 30%" 
                />
                <AlertCard 
                    title="Stockout Risk" 
                    count={alerts.stock.length} 
                    icon={Clock} 
                    color="purple" 
                    isActive={selectedAlert === 'stock'} 
                    onClick={() => setSelectedAlert(selectedAlert === 'stock' ? null : 'stock')} 
                    desc="Runway < Lead Time"
                />
                <AlertCard 
                    title="Dead Stock" 
                    count={alerts.dead.length} 
                    icon={Package} 
                    color="gray" 
                    isActive={selectedAlert === 'dead'} 
                    onClick={() => setSelectedAlert(selectedAlert === 'dead' ? null : 'dead')} 
                    desc=">£200 Value, 0 Sales"
                />
            </div>

            {/* 3. ACTION WORKBENCH */}
            <div className="bg-custom-glass rounded-xl border border-custom-glass shadow-lg overflow-hidden flex flex-col min-h-[400px]">
                <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        {selectedAlert ? (
                            <>
                                <span className={`w-2 h-2 rounded-full ${selectedAlert === 'margin' ? 'bg-red-500' : 'bg-amber-500'}`}></span>
                                Priority Actions: {selectedAlert === 'margin' ? 'Fix Margins' : selectedAlert === 'velocity' ? 'Investigate Drops' : selectedAlert === 'stock' ? 'Replenish' : 'Liquidation'}
                            </>
                        ) : (
                            <><Activity className="w-4 h-4 text-indigo-500" /> Top Movers (Overview)</>
                        )}
                    </h3>
                    <span className="text-xs text-gray-500">{workbenchData.length} SKUs require attention</span>
                </div>
                
                <div className="flex-1 overflow-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50/50 text-gray-500 font-semibold border-b border-gray-200/50 sticky top-0 z-10 backdrop-blur-sm">
                            <tr>
                                <th className="p-4">Product</th>
                                <th className="p-4 text-right">Price (Inc VAT)</th>
                                {selectedAlert === 'margin' && <th className="p-4 text-right">Cost (Inc VAT)</th>}
                                <th className="p-4 text-right">{selectedAlert === 'velocity' ? 'Prev Qty' : 'Period Sales'}</th>
                                <th className="p-4 text-right">{selectedAlert === 'velocity' ? 'Curr Qty' : 'Period Profit'}</th>
                                <th className="p-4 text-right">
                                    {selectedAlert === 'velocity' ? '% Change' : 'Net Margin %'}
                                </th>
                                <th className="p-4 text-right">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/50">
                            {paginatedData.map(p => (
                                <tr key={p.id} className="even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors group">
                                    <td className="p-4">
                                        <div className="font-bold text-gray-900">{p.sku}</div>
                                        <div className="text-xs text-gray-500 truncate max-w-[200px]">{p.name}</div>
                                    </td>
                                    <td className="p-4 text-right">£{(p.displayPrice * VAT).toFixed(2)}</td>
                                    
                                    {selectedAlert === 'margin' && (
                                        <td className="p-4 text-right text-gray-500">£{((p.costPrice || 0) * VAT).toFixed(2)}</td>
                                    )}

                                    <td className="p-4 text-right text-gray-600">
                                        {selectedAlert === 'velocity' ? p.prevPeriodUnits : `£${p.periodRevenue.toFixed(0)}`}
                                    </td>
                                    <td className="p-4 text-right font-medium">
                                        {selectedAlert === 'velocity' ? p.periodUnits : `£${p.periodProfit.toFixed(0)}`}
                                    </td>
                                    <td className="p-4 text-right">
                                        {selectedAlert === 'velocity' ? (
                                            <span className="text-red-600 font-bold">{p.velocityChange.toFixed(0)}%</span>
                                        ) : (
                                            <span className={`font-bold ${p.periodMargin < 10 ? 'text-red-600' : 'text-green-600'}`}>
                                                {p.periodMargin.toFixed(1)}%
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        <button 
                                            onClick={() => onAnalyze(p)}
                                            className="px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-xs font-bold hover:bg-indigo-100 transition-colors"
                                        >
                                            Analyze AI
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {workbenchData.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-12 text-center text-gray-400 italic">
                                        Excellent work! No items match this alert criteria.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                {workbenchData.length > ITEMS_PER_PAGE && (
                    <div className="p-3 border-t border-custom-glass bg-gray-50/50 flex items-center justify-between">
                        <div className="text-xs text-gray-500">
                            Showing {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, workbenchData.length)} of {workbenchData.length}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                disabled={currentPage === 1}
                                className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                            <span className="text-xs font-medium text-gray-700">
                                Page {currentPage} of {totalPages}
                            </span>
                            <button
                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                disabled={currentPage === totalPages}
                                className="p-1.5 rounded-lg hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                            >
                                <ChevronRight className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* 4. MARKET INTELLIGENCE (Charts) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Platform Trends */}
                <div className="bg-custom-glass p-5 rounded-xl border border-custom-glass shadow-sm flex flex-col h-[350px]">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4 text-blue-600" /> Platform Revenue Trend
                    </h3>
                    <div className="flex-1 min-h-0 -ml-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={platformTrendData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                <XAxis dataKey="day" tick={{fontSize: 10}} />
                                <YAxis 
                                    tick={{fontSize: 10}} 
                                    tickFormatter={(value) => `£${value.toLocaleString()}`}
                                />
                                <RechartsTooltip 
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    formatter={(value: number) => '£' + value.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}
                                />
                                <Legend wrapperStyle={{ fontSize: '12px' }} />
                                {/* Colors are dynamically fetched from settings or fallback to standard ones */}
                                <Line type="monotone" dataKey="Amazon FBM" stroke={getPlatformColor('Amazon(UK) FBM', '#E68A00')} strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="eBay" stroke={getPlatformColor('eBay', '#E53238')} strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="The Range" stroke={getPlatformColor('The Range', '#2C3E50')} strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="Tesco" stroke={getPlatformColor('Tesco', '#00539F')} strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="Debenhams" stroke={getPlatformColor('Debenhams', '#1B4D3E')} strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="Wayfair" stroke={getPlatformColor('Wayfair', '#7F187F')} strokeWidth={2} dot={false} />
                                <Line type="monotone" dataKey="Others" stroke="#9CA3AF" strokeWidth={2} dot={false} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Category Profit */}
                <div className="bg-custom-glass p-5 rounded-xl border border-custom-glass shadow-sm flex flex-col h-[350px]">
                    <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <PieIcon className="w-4 h-4 text-green-600" /> Net Profit by Category
                    </h3>
                    <div className="flex-1 min-h-0 -ml-2">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={categoryProfitData} layout="vertical">
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f0f0f0" />
                                <XAxis type="number" hide />
                                <YAxis dataKey="name" type="category" width={100} tick={{fontSize: 10}} />
                                <RechartsTooltip 
                                    cursor={{fill: 'transparent'}}
                                    formatter={(val: number) => [`£${val.toLocaleString()}`, 'Net Profit']}
                                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                />
                                <Bar dataKey="profit" fill={themeColor} radius={[0, 4, 4, 0]} barSize={20} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

        </div>
    );
};

const AlertCard = ({ title, count, icon: Icon, color, isActive, onClick, desc }: any) => {
    const colorStyles = {
        red: isActive ? 'bg-red-600 text-white border-red-700' : 'bg-white hover:border-red-300 border-transparent',
        amber: isActive ? 'bg-amber-500 text-white border-amber-600' : 'bg-white hover:border-amber-300 border-transparent',
        purple: isActive ? 'bg-purple-600 text-white border-purple-700' : 'bg-white hover:border-purple-300 border-transparent',
        gray: isActive ? 'bg-gray-700 text-white border-gray-800' : 'bg-white hover:border-gray-300 border-transparent',
    };

    const textStyles = {
        red: isActive ? 'text-red-100' : 'text-red-600',
        amber: isActive ? 'text-amber-100' : 'text-amber-600',
        purple: isActive ? 'text-purple-100' : 'text-purple-600',
        gray: isActive ? 'text-gray-300' : 'text-gray-500',
    };

    return (
        <button 
            onClick={onClick}
            className={`p-4 rounded-xl shadow-sm border transition-all duration-200 flex flex-col items-start text-left ${colorStyles[color as keyof typeof colorStyles]} ${!isActive && 'hover:shadow-md hover:-translate-y-1'}`}
        >
            <div className="flex justify-between w-full items-start mb-2">
                <span className={`font-bold text-sm ${isActive ? 'text-white' : 'text-gray-600'}`}>{title}</span>
                <Icon className={`w-5 h-5 ${textStyles[color as keyof typeof textStyles]}`} />
            </div>
            <div className="text-3xl font-bold mb-1">{count}</div>
            <div className={`text-[10px] font-medium uppercase tracking-wide opacity-80 ${isActive ? 'text-white' : 'text-gray-400'}`}>
                {desc}
            </div>
        </button>
    );
};

const ShipmentsView = ({ products, themeColor, initialTags = [], onTagsChange }: { products: Product[], themeColor: string, initialTags?: string[], onTagsChange?: (tags: string[]) => void }) => {
    const [inputValue, setInputValue] = useState('');
    const searchTags = initialTags;
    const updateTags = (newTags: string[]) => { if (onTagsChange) onTagsChange(newTags); };

    const containerMap = useMemo(() => {
        const map: Record<string, any> = {};
        products.forEach(p => {
            if (p.shipments) {
                p.shipments.forEach(s => {
                    if (!map[s.containerId]) map[s.containerId] = { id: s.containerId, eta: s.eta || '', status: s.status, totalQty: 0, items: [] };
                    map[s.containerId].totalQty += s.quantity;
                    map[s.containerId].items.push({ sku: p.sku, qty: s.quantity });
                    if (s.eta) map[s.containerId].eta = s.eta;
                    if (s.status) map[s.containerId].status = s.status;
                });
            }
        });
        return Object.values(map).sort((a:any, b:any) => {
            // Sort dates ascending, pushing empty ETAs to the end
            if (!a.eta && !b.eta) return 0;
            if (!a.eta) return 1;
            if (!b.eta) return -1;
            return a.eta.localeCompare(b.eta);
        });
    }, [products]);

    const allShipmentItems = useMemo(() => {
        const items: any[] = [];
        products.forEach(p => {
            if (p.shipments) {
                // Collect aliases for this product
                const aliases = p.channels.flatMap(c => c.skuAlias ? c.skuAlias.split(',') : []).map(a => a.trim().toLowerCase());
                
                p.shipments.forEach(s => {
                    items.push({ 
                        id: `${p.sku}-${s.containerId}`, 
                        sku: p.sku, 
                        name: p.name, 
                        containerId: s.containerId, 
                        status: s.status, 
                        eta: s.eta, 
                        quantity: s.quantity,
                        aliases // Add aliases to item
                    });
                });
            }
        });
        return items;
    }, [products]);

    const filteredTableData = useMemo(() => {
        // If no tags and no input, return nothing (or everything? currently logic says return [] if empty, lets keep consistent)
        if (searchTags.length === 0 && !inputValue.trim()) return [];
        
        return allShipmentItems.filter(item => {
            const checkTerm = (term: string) => {
                const t = term.toLowerCase();
                return item.containerId.toLowerCase().includes(t) || 
                       item.sku.toLowerCase().includes(t) ||
                       (item.aliases && item.aliases.some((a: string) => a.includes(t)));
            };

            const matchesTag = searchTags.length > 0 && searchTags.some(tag => checkTerm(tag));
            const matchesInput = inputValue.trim().length > 0 && checkTerm(inputValue);

            return matchesTag || matchesInput;
        });
    }, [allShipmentItems, searchTags, inputValue]);

    // Calculate how many tags matched at least one item
    const foundTagsCount = useMemo(() => {
        if (searchTags.length === 0) return 0;
        const lowerTags = searchTags.map(t => t.toLowerCase().trim());
        return lowerTags.filter(tag => 
            allShipmentItems.some(item => 
                item.sku.toLowerCase().includes(tag) || 
                item.containerId.toLowerCase().includes(tag) ||
                (item.aliases && item.aliases.some((a: string) => a.includes(tag)))
            )
        ).length;
    }, [searchTags, allShipmentItems]);

    const getStatusStyle = (status: string) => {
        if (!status) return 'bg-gray-100 text-gray-800 border-gray-200';
        const s = status.toLowerCase();
        if (s.includes('shipped') && !s.includes('to be')) return 'bg-blue-100 text-blue-800 border-blue-200'; // Shipped Out
        if (s.includes('arrived') || s.includes('delivered') || s.includes('cleared')) return 'bg-green-100 text-green-800 border-green-200';
        if (s.includes('pending') || s.includes('to be')) return 'bg-amber-100 text-amber-800 border-amber-200';
        return 'bg-gray-100 text-gray-800 border-gray-200';
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm">
                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Filter Shipments</label>
                <TagSearchInput 
                    tags={searchTags}
                    onTagsChange={updateTags}
                    onInputChange={setInputValue}
                    placeholder="Search SKUs, Aliases, or Container IDs..."
                    themeColor={themeColor}
                />
            </div>
            {(searchTags.length > 0 || inputValue.trim().length > 0) ? (
                <div className="space-y-3">
                    {searchTags.length > 0 && (
                        <div className="flex items-center justify-between px-1">
                            <div className={`text-sm font-medium px-3 py-1.5 rounded-lg border inline-flex items-center gap-2 shadow-sm ${foundTagsCount === searchTags.length ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                {foundTagsCount === searchTags.length ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                                <span>Found shipments for <strong>{foundTagsCount}</strong> of <strong>{searchTags.length}</strong> searched items</span>
                            </div>
                        </div>
                    )}
                    <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50/80 border-b border-gray-200 text-xs uppercase font-medium text-gray-500">
                                <tr><th className="px-4 py-3">SKU</th><th className="px-4 py-3">Container</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">ETA</th><th className="px-4 py-3 text-right">Qty</th></tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100/50">
                                {filteredTableData.map(row => (
                                    <tr key={row.id} className="even:bg-gray-50/30 hover:bg-gray-100/50">
                                        <td className="px-4 py-3 font-mono font-bold">{row.sku}</td>
                                        <td className="px-4 py-3 text-indigo-600">{row.containerId}</td>
                                        <td className="px-4 py-3"><span className={`px-2 py-1 rounded border text-[10px] uppercase font-bold ${getStatusStyle(row.status)}`}>{row.status}</span></td>
                                        <td className="px-4 py-3">{row.eta || <span className="text-gray-400 italic">Pending</span>}</td>
                                        <td className="px-4 py-3 text-right font-bold">{row.quantity}</td>
                                    </tr>
                                ))}
                                {filteredTableData.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-gray-400">
                                            No shipments found matching your search.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {containerMap.map((c:any) => (
                        <div key={c.id} className="bg-custom-glass rounded-xl border border-custom-glass shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                            <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2"><Ship className="w-4 h-4 text-indigo-600"/>{c.id}</h3>
                                    <div className="text-xs text-gray-500 mt-1">ETA: {c.eta || 'Pending'}</div>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-1 rounded border ${getStatusStyle(c.status)}`}>{c.status}</span>
                            </div>
                            <div className="p-4 flex-1 space-y-1 max-h-40 overflow-y-auto">
                                {c.items.map((item:any, idx:number) => (
                                    <div key={idx} className="flex justify-between text-sm py-1 border-b border-gray-50 last:border-0"><span className="font-mono text-gray-700">{item.sku}</span><span className="font-medium">{item.qty}</span></div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const PriceMatrixView = ({ products, pricingRules, promotions, themeColor }: { products: Product[], pricingRules: PricingRules, promotions: PromotionEvent[], themeColor: string }) => {
    const [search, setSearch] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const platforms = Object.keys(pricingRules);
    
    const filtered = products.filter(p => {
        const matchesTerm = (term: string) => {
            const t = term.toLowerCase();
            return p.sku.toLowerCase().includes(t) || 
                   p.name.toLowerCase().includes(t) ||
                   p.channels.some(c => c.skuAlias?.toLowerCase().includes(t));
        };

        if (searchTags.length > 0) {
            const matchesTag = searchTags.some(tag => matchesTerm(tag));
            const matchesText = search.trim().length > 0 ? matchesTerm(search) : true;
            return matchesTag && matchesText;
        }
        return matchesTerm(search);
    });
    
    // Helper to find active promo
    const getActivePromo = (sku: string, platform: string) => {
        const today = new Date().toISOString().split('T')[0];
        return promotions.find(p => 
            p.status === 'ACTIVE' && 
            p.platform === platform && 
            p.startDate <= today && 
            p.endDate >= today &&
            p.items.some(i => i.sku === sku)
        );
    };

    return (
        <div className="space-y-4 h-full flex flex-col">
            <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm">
                <TagSearchInput 
                    tags={searchTags}
                    onTagsChange={setSearchTags}
                    onInputChange={setSearch}
                    placeholder="Search matrix (SKU or Alias)..."
                    themeColor={themeColor}
                />
            </div>
            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-auto flex-1">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50/50 font-bold border-b border-gray-200 sticky top-0 z-10">
                        <tr>
                            <th className="p-4 bg-white/90 backdrop-blur sticky left-0 z-20 min-w-[200px] border-r border-gray-100">Product Reference</th>
                            <th className="p-4 bg-white/90 backdrop-blur sticky left-[200px] z-20 w-[100px] text-right border-r border-gray-100">CA Price</th>
                            {platforms.map(p => <th key={p} className="p-4 text-center min-w-[140px]">{p}</th>)}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/50">
                        {filtered.slice(0, 50).map(p => (
                            <tr key={p.id} className="even:bg-gray-50/30 hover:bg-gray-100/50">
                                <td className="p-4 sticky left-0 bg-white/50 backdrop-blur-sm z-10 border-r border-gray-100">
                                    <div className="font-mono font-bold text-gray-900">{p.sku}</div>
                                    <div className="text-xs text-gray-500 truncate max-w-[180px]">{p.name}</div>
                                </td>
                                <td className="p-4 sticky left-[200px] bg-white/50 backdrop-blur-sm z-10 text-right font-medium text-purple-600 border-r border-gray-100">
                                    {p.caPrice ? `£${p.caPrice.toFixed(2)}` : '-'}
                                </td>
                                {platforms.map(platform => {
                                    const channel = p.channels.find(c => c.platform === platform);
                                    const promo = getActivePromo(p.sku, platform);
                                    const promoItem = promo?.items.find(i => i.sku === p.sku);
                                    
                                    // Price logic: Channel Price -> Product Current Price
                                    const rawPrice = channel?.price || p.currentPrice;
                                    const displayPrice = rawPrice * VAT;
                                    const velocity = channel?.velocity || 0;

                                    return (
                                        <td key={platform} className="p-4 text-center align-top">
                                            {channel ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    {promoItem ? (
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-xs text-gray-400 line-through">£{displayPrice.toFixed(2)}</span>
                                                            <span className="font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded border border-red-100">
                                                                £{promoItem.promoPrice.toFixed(2)}
                                                            </span>
                                                            <span className="text-[10px] text-red-500 mt-0.5">Active Promo</span>
                                                        </div>
                                                    ) : (
                                                        <span className="font-bold text-gray-900">£{displayPrice.toFixed(2)}</span>
                                                    )}
                                                    
                                                    {velocity > 0 && (
                                                        <span className="text-xs text-gray-500 flex items-center gap-1 mt-1 bg-gray-100 px-1.5 py-0.5 rounded">
                                                            <Activity className="w-3 h-3" /> {velocity.toFixed(1)}/day
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const AliasDrawer = ({ product, pricingRules, onClose, onSave, themeColor }: any) => {
    const [platformTags, setPlatformTags] = useState<{ platform: string; tags: string[] }[]>(() => {
        const existing = product.channels.map((c:any) => ({ platform: c.platform, tags: c.skuAlias ? c.skuAlias.split(',').map((s:string) => s.trim()).filter(Boolean) : [] }));
        Object.keys(pricingRules).forEach(pKey => { if (!existing.find((e:any) => e.platform === pKey)) existing.push({ platform: pKey, tags: [] }); });
        return existing;
    });
    const [inputValues, setInputValues] = useState<Record<string, string>>({});

    const addTags = (platform: string, newTags: string[]) => {
        setPlatformTags(prev => prev.map(p => p.platform === platform ? { ...p, tags: [...new Set([...p.tags, ...newTags])] } : p));
    };
    
    const handleSave = () => {
        const updatedChannels = [...product.channels];
        platformTags.forEach(pt => {
            const aliasString = pt.tags.join(', ');
            const idx = updatedChannels.findIndex(c => c.platform === pt.platform);
            if (idx >= 0) updatedChannels[idx] = { ...updatedChannels[idx], skuAlias: aliasString };
            else if (aliasString) updatedChannels.push({ platform: pt.platform, manager: 'Unassigned', velocity: 0, skuAlias: aliasString });
        });
        onSave({ ...product, channels: updatedChannels });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white w-full max-w-md h-full shadow-2xl relative flex flex-col animate-in slide-in-from-right">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-lg">Manage Aliases</h3>
                    <button onClick={onClose}><X className="w-5 h-5" /></button>
                </div>
                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                    {platformTags.map(item => (
                        <div key={item.platform}>
                            <label className="text-xs font-bold text-gray-500 uppercase">{item.platform}</label>
                            <div className="flex flex-wrap gap-2 p-2 border rounded-lg mt-1 focus-within:ring-2 focus-within:ring-indigo-500">
                                {item.tags.map((tag:string, i:number) => (
                                    <span key={i} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs flex items-center gap-1">
                                        {tag} <button onClick={() => setPlatformTags(prev => prev.map(p => p.platform === item.platform ? { ...p, tags: p.tags.filter((_, idx) => idx !== i) } : p))}><X className="w-3 h-3" /></button>
                                    </span>
                                ))}
                                <input 
                                    type="text" 
                                    className="flex-1 min-w-[80px] outline-none text-sm" 
                                    placeholder="Add alias..." 
                                    value={inputValues[item.platform] || ''}
                                    onChange={e => setInputValues({...inputValues, [item.platform]: e.target.value})}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && inputValues[item.platform]) {
                                            addTags(item.platform, [inputValues[item.platform]]);
                                            setInputValues({...inputValues, [item.platform]: ''});
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-4 border-t flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Save</button>
                </div>
            </div>
        </div>
    );
};

export default ProductManagementPage;
