import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, PricingRules, PromotionEvent, PriceLog, ShipmentDetail, PriceChangeRecord } from '../types';
import { TagSearchInput } from './TagSearchInput';
import { Search, Link as LinkIcon, Package, Filter, User, Eye, EyeOff, ChevronLeft, ChevronRight, LayoutDashboard, List, DollarSign, TrendingUp, TrendingDown, AlertCircle, CheckCircle, X, Save, ExternalLink, Tag, Globe, ArrowUpDown, ChevronUp, ChevronDown, Plus, Download, Calendar, Clock, BarChart2, Edit2, Ship, Maximize2, Minimize2, ArrowRight, Database, Layers, RotateCcw, Upload, FileBarChart, PieChart as PieIcon, AlertTriangle, Activity, Megaphone, Coins, Wrench } from 'lucide-react';
import { PieChart, Pie, Cell, Tooltip as RechartsTooltip, ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, ReferenceLine, LineChart, Line, ComposedChart, Legend } from 'recharts';
import ProductList from './ProductList';

interface ProductManagementPageProps {
    products: Product[];
    pricingRules: PricingRules;
    promotions?: PromotionEvent[];
    priceHistoryMap?: Map<string, PriceLog[]>;
    priceChangeHistory?: PriceChangeRecord[]; // Added for Elasticity
    onOpenMappingModal: () => void;
    // Optional handlers left for compatibility if needed, but UI trigger removed
    onOpenSales?: () => void;
    onOpenInventory?: () => void;
    onOpenReturns?: () => void;
    onOpenCA?: () => void;
    onAnalyze: (product: Product, context?: string) => void;
    dateLabels: { current: string, last: string };
    onUpdateProduct?: (product: Product) => void;
    onViewElasticity?: (product: Product) => void; // Added for Elasticity
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
    priceChangeHistory = [], // Default to empty array
    onOpenMappingModal,
    onAnalyze,
    dateLabels,
    onUpdateProduct,
    onViewElasticity, // Handler passed from App
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
                        onEditAliases={setSelectedProductForDrawer}
                        onViewShipments={handleViewShipments}
                        onViewElasticity={onViewElasticity}
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

interface ToxicPlatform {
    name: string;
    margin: number;
    revenue: number;
    velocity: number;
}

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
    onAnalyze: (product: Product, context?: string) => void,
}) => {
    const [range, setRange] = useState<DateRange>('30d');
    const [customStart, setCustomStart] = useState(new Date().toISOString().split('T')[0]);
    const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [platformScope, setPlatformScope] = useState<string>('All');
    
    // Slide State (0: Operations, 1: Financial, 2: Inventory)
    const [currentSlide, setCurrentSlide] = useState(0);
    
    const [selectedAlert, setSelectedAlert] = useState<AlertType>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [selectedAlert, range, platformScope]);

    // --- CAROUSEL NAVIGATION ---
    const nextSlide = () => setCurrentSlide(prev => (prev + 1) % 3);
    const prevSlide = () => setCurrentSlide(prev => (prev - 1 + 3) % 3);

    // --- DATA LOGIC ---
    const { processedData, periodLabel, dateRange, periodDays } = useMemo(() => {
        let startDate = new Date();
        let endDate = new Date();
        let days = 30;
        let label = '';

        if (range === 'yesterday') {
            startDate.setDate(startDate.getDate() - 1);
            endDate.setDate(endDate.getDate() - 1);
            days = 1;
            label = startDate.toLocaleDateString();
        } else if (range === '7d') {
            startDate.setDate(startDate.getDate() - 7);
            endDate.setDate(endDate.getDate() - 1);
            days = 7;
            label = 'Last 7 Days';
        } else if (range === '30d') {
            startDate.setDate(startDate.getDate() - 30);
            endDate.setDate(endDate.getDate() - 1);
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

        const prevStart = new Date(startDate);
        const prevEnd = new Date(startDate);
        prevEnd.setDate(prevEnd.getDate() - 1);
        prevStart.setDate(prevStart.getDate() - days);

        const sStr = startDate.toISOString().split('T')[0];
        const eStr = endDate.toISOString().split('T')[0];
        const psStr = prevStart.toISOString().split('T')[0];
        const peStr = prevEnd.toISOString().split('T')[0];

        const data = products.map(p => {
            const logs = priceHistoryMap.get(p.sku) || [];
            const scopeLogs = platformScope === 'All' 
                ? logs 
                : logs.filter(l => l.platform === platformScope || (platformScope !== 'All' && l.platform?.includes(platformScope)));

            let curUnits = 0; let curRev = 0; let curProfit = 0; let curAdSpend = 0;
            let prevUnits = 0;
            const platformBreakdown: Record<string, { rev: number, profit: number, units: number }> = {};

            scopeLogs.forEach(l => {
                const d = l.date.split('T')[0];
                if (d >= sStr && d <= eStr) {
                    curUnits += l.velocity;
                    curRev += (l.velocity * l.price);
                    
                    const dailyAds = l.adsSpend !== undefined ? l.adsSpend : (p.adsFee || 0) * l.velocity;
                    curAdSpend += dailyAds;

                    if (l.profit !== undefined) {
                        curProfit += l.profit;
                    } else {
                        curProfit += (l.velocity * l.price * (l.margin / 100));
                    }

                    // --- Platform Scanning Logic ---
                    // Only active if Global scope is selected, to identify hidden risks
                    if (platformScope === 'All') {
                        const pName = l.platform || 'Unknown';
                        if (!platformBreakdown[pName]) platformBreakdown[pName] = { rev: 0, profit: 0, units: 0 };
                        
                        platformBreakdown[pName].rev += (l.velocity * l.price);
                        platformBreakdown[pName].units += l.velocity;
                        if (l.profit !== undefined) {
                            platformBreakdown[pName].profit += l.profit;
                        } else {
                            platformBreakdown[pName].profit += (l.velocity * l.price * (l.margin / 100));
                        }
                    }

                } else if (d >= psStr && d <= peStr) {
                    prevUnits += l.velocity;
                }
            });

            const netMargin = curRev > 0 ? (curProfit / curRev) * 100 : 0;
            const velocityChange = prevUnits > 0 ? ((curUnits - prevUnits) / prevUnits) * 100 : (curUnits > 0 ? 100 : 0);
            
            let displayPrice = p.currentPrice;
            if (platformScope !== 'All') {
                const channel = p.channels.find(c => c.platform === platformScope);
                if (channel && channel.price) displayPrice = channel.price;
            }

            // Determine toxic platforms
            const toxicPlatforms: ToxicPlatform[] = [];
            if (platformScope === 'All') {
                Object.entries(platformBreakdown).forEach(([plat, stats]) => {
                    if (stats.rev > 0) {
                        const m = (stats.profit / stats.rev) * 100;
                        // Toxic Threshold: < 5% Margin AND significant revenue (> £10)
                        if (m < 5 && stats.rev > 10) {
                            toxicPlatforms.push({
                                name: plat,
                                margin: m,
                                revenue: stats.rev,
                                velocity: stats.units / days
                            });
                        }
                    }
                });
                toxicPlatforms.sort((a,b) => a.margin - b.margin); // Worst margins first
            }

            return {
                ...p,
                periodUnits: curUnits,
                periodRevenue: curRev,
                periodProfit: curProfit,
                periodAdSpend: curAdSpend,
                periodMargin: netMargin,
                prevPeriodUnits: prevUnits,
                velocityChange,
                displayPrice,
                toxicPlatforms // Array of toxic platforms
            };
        });

        return { processedData: data, periodLabel: label, dateRange: { start: startDate, end: endDate }, periodDays: days };
    }, [products, priceHistoryMap, range, customStart, customEnd, platformScope]);

    // --- ALERTS (SLIDE 1) ---
    const alerts = useMemo(() => ({
        // Modified Margin Logic: Global < 10% OR Specific Toxic Platform Detected
        margin: processedData.filter(p => (p.periodUnits > 0 && p.periodMargin < 10) || p.toxicPlatforms.length > 0),
        velocity: processedData.filter(p => p.prevPeriodUnits > 2 && p.velocityChange < -30),
        stock: processedData.filter(p => {
            const dailyVel = p.periodUnits / (range === 'yesterday' ? 1 : range === '7d' ? 7 : 30);
            if (dailyVel <= 0) return false;
            const runway = p.stockLevel / dailyVel;
            return runway < p.leadTimeDays && p.stockLevel > 0;
        }),
        dead: processedData.filter(p => p.stockLevel * (p.costPrice || 0) > 200 && p.periodUnits === 0)
    }), [processedData, range]);

    const workbenchData = useMemo(() => {
        if (!selectedAlert) return processedData.filter(p => p.periodRevenue > 0).sort((a, b) => b.periodRevenue - a.periodRevenue).slice(0, 50);
        return alerts[selectedAlert].sort((a, b) => {
            if (selectedAlert === 'margin') return a.periodMargin - b.periodMargin; // Sort by global margin primarily
            if (selectedAlert === 'velocity') return a.velocityChange - b.velocityChange;
            if (selectedAlert === 'stock') return a.stockLevel - b.stockLevel;
            if (selectedAlert === 'dead') return (b.stockLevel * (b.costPrice || 0)) - (a.stockLevel * (a.costPrice || 0));
            return 0;
        });
    }, [selectedAlert, alerts, processedData]);

    const paginatedData = workbenchData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalPages = Math.ceil(workbenchData.length / itemsPerPage);

    const handleToxicAnalysis = (product: any, toxic: ToxicPlatform) => {
        // Construct a temporary context-aware product for the AI
        // This overrides global stats with platform-specific stats
        
        // Find channel price
        const channel = product.channels.find((c: any) => c.platform === toxic.name);
        const channelPrice = channel ? channel.price : product.currentPrice;

        const contextProduct = {
            ...product,
            platform: toxic.name, // Force platform context
            currentPrice: channelPrice || product.currentPrice,
            averageDailySales: toxic.velocity, // Use specific platform velocity
            // We keep stockLevel global as stock is usually shared, but velocity is specific
        };
        
        onAnalyze(contextProduct, 'margin');
    };

    const handleExport = () => {
        const clean = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
        const headers = ['SKU', 'Name', 'Price (Inc VAT)', 'Period Sales', 'Period Profit', 'Net Margin %', 'Velocity Change %', 'Toxic Platform Info'];
        
        const rows = workbenchData.map(p => [
            clean(p.sku),
            clean(p.name),
            (p.displayPrice * VAT).toFixed(2),
            p.periodRevenue.toFixed(2),
            p.periodProfit.toFixed(2),
            p.periodMargin.toFixed(2) + '%',
            p.velocityChange.toFixed(0) + '%',
            p.toxicPlatforms && p.toxicPlatforms.length > 0 ? clean(`${p.toxicPlatforms[0].name}: ${p.toxicPlatforms[0].margin.toFixed(1)}%`) : ''
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\uFEFF', csvContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        const filename = `decision_engine_export_${selectedAlert || 'overview'}_${new Date().toISOString().slice(0, 10)}.csv`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { if (document.body.contains(link)) document.body.removeChild(link); }, 60000);
    };

    // ... [FinancialStats and InventoryStats useMemo remain unchanged]
    // Re-included for completeness of the component file structure
    const financialStats = useMemo(() => {
        const totalRevenue = processedData.reduce((acc, p) => acc + p.periodRevenue, 0);
        const totalProfit = processedData.reduce((acc, p) => acc + p.periodProfit, 0);
        const totalAdSpend = processedData.reduce((acc, p) => acc + p.periodAdSpend, 0);
        const tacos = totalRevenue > 0 ? (totalAdSpend / totalRevenue) * 100 : 0;
        const days = [];
        for (let d = new Date(dateRange.start); d <= dateRange.end; d.setDate(d.getDate() + 1)) {
            days.push(new Date(d).toISOString().split('T')[0]);
        }
        const chartData = days.map(day => {
            let dayRev = 0; let dayAds = 0; let dayProfit = 0;
            products.forEach(p => {
                const logs = priceHistoryMap.get(p.sku) || [];
                logs.filter(l => l.date.startsWith(day)).forEach(l => {
                    dayRev += (l.price * l.velocity);
                    dayAds += (l.adsSpend !== undefined ? l.adsSpend : (p.adsFee || 0) * l.velocity);
                    if (l.profit !== undefined) dayProfit += l.profit;
                    else dayProfit += (l.velocity * l.price * (l.margin / 100));
                });
            });
            return { day: day.slice(5), revenue: dayRev, ads: dayAds, profit: dayProfit };
        });
        return { totalRevenue, totalProfit, totalAdSpend, tacos, chartData };
    }, [processedData, dateRange, priceHistoryMap, products]);

    const inventoryStats = useMemo(() => {
        let totalStockValue = 0; let deadStockValue = 0; let lostRevenue = 0;
        const runwayDistribution = { '< 2w': 0, '2-4w': 0, '4-12w': 0, '12w+': 0, 'OOS': 0 };
        processedData.forEach(p => {
            const stockVal = p.stockLevel * (p.costPrice || 0);
            totalStockValue += stockVal;
            if (p.periodUnits === 0) deadStockValue += stockVal;
            const dailyVel = p.periodUnits / periodDays;
            const runway = dailyVel > 0 ? p.stockLevel / dailyVel : 999;
            if (p.stockLevel <= 0) runwayDistribution['OOS']++;
            else if (runway < 14) runwayDistribution['< 2w']++;
            else if (runway < 28) runwayDistribution['2-4w']++;
            else if (runway < 84) runwayDistribution['4-12w']++;
            else runwayDistribution['12w+']++;
            if (runway < p.leadTimeDays && dailyVel > 0) {
                const daysOOS = p.leadTimeDays - runway;
                lostRevenue += (daysOOS * dailyVel * (p.currentPrice || 0));
            }
        });
        const chartData = Object.entries(runwayDistribution).map(([name, value]) => ({ name, value }));
        return { totalStockValue, deadStockValue, lostRevenue, chartData };
    }, [processedData, range]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500 relative">
            
            {/* 1. CONTROL DECK */}
            <div className="flex flex-col md:flex-row justify-between items-center bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm gap-4 relative z-30">
                <div className="flex items-center gap-2">
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

                    <div className="ml-3 flex flex-col justify-center">
                        <span className="text-[10px] text-gray-400 font-bold uppercase leading-none mb-0.5">Period</span>
                        <span className="text-xs font-bold text-indigo-600 flex items-center gap-1">
                            {periodLabel}
                        </span>
                    </div>
                </div>
            </div>

            {/* CAROUSEL WRAPPER */}
            <div>
                {/* SLIDE INDICATORS */}
                <div className="flex justify-center gap-2 mb-4">
                    {[0, 1, 2].map(idx => (
                        <div key={idx} className={`h-1.5 rounded-full transition-all duration-300 ${currentSlide === idx ? 'w-8 bg-indigo-600' : 'w-2 bg-gray-300'}`} />
                    ))}
                </div>

                {/* SLIDE 1: OPERATIONS */}
                {currentSlide === 0 && (
                    <div className="animate-in fade-in slide-in-from-right-8 duration-300">
                        <div className="flex items-stretch gap-4 mb-6">
                            <button 
                                onClick={prevSlide}
                                className="w-12 flex-shrink-0 bg-custom-glass border-custom-glass shadow-lg rounded-xl flex items-center justify-center transition-colors hidden md:flex text-gray-500 hover:text-indigo-600 hover:bg-white/50"
                            >
                                <ChevronLeft className="w-6 h-6" />
                            </button>
                            {/* ALERT CARDS */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1">
                                <AlertCard title="Margin Thieves" count={alerts.margin.length} icon={AlertTriangle} color="red" isActive={selectedAlert === 'margin'} onClick={() => setSelectedAlert(selectedAlert === 'margin' ? null : 'margin')} desc="Net Margin < 10% (Scan all)" />
                                <AlertCard title="Velocity Crashes" count={alerts.velocity.length} icon={TrendingDown} color="amber" isActive={selectedAlert === 'velocity'} onClick={() => setSelectedAlert(selectedAlert === 'velocity' ? null : 'velocity')} desc="Vol. Drop > 30%" />
                                <AlertCard title="Stockout Risk" count={alerts.stock.length} icon={Clock} color="purple" isActive={selectedAlert === 'stock'} onClick={() => setSelectedAlert(selectedAlert === 'stock' ? null : 'stock')} desc="Runway < Lead Time" />
                                <AlertCard title="Dead Stock" count={alerts.dead.length} icon={Package} color="gray" isActive={selectedAlert === 'dead'} onClick={() => setSelectedAlert(selectedAlert === 'dead' ? null : 'dead')} desc=">£200 Value, 0 Sales" />
                            </div>
                            <button 
                                onClick={nextSlide}
                                className="w-12 flex-shrink-0 bg-custom-glass border-custom-glass shadow-lg rounded-xl flex items-center justify-center transition-colors hidden md:flex text-gray-500 hover:text-indigo-600 hover:bg-white/50"
                            >
                                <ChevronRight className="w-6 h-6" />
                            </button>
                        </div>

                        {/* WORKBENCH TABLE */}
                        <div className="bg-custom-glass rounded-xl border border-custom-glass shadow-lg overflow-hidden flex flex-col min-h-[400px]">
                            <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center">
                                <div className="flex items-center gap-4">
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
                                <button
                                    onClick={handleExport}
                                    className="p-2 hover:bg-gray-200/50 rounded-lg text-gray-500 hover:text-gray-700 transition-colors border border-transparent hover:border-gray-200"
                                    title="Export current view to CSV"
                                >
                                    <Download className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto">
                                <table className="w-full text-left text-sm whitespace-nowrap">
                                    <thead className="bg-gray-50/50 text-gray-500 font-semibold border-b border-gray-200/50 sticky top-0 z-10 backdrop-blur-sm">
                                        <tr>
                                            <th className="p-4">Product</th>
                                            <th className="p-4 text-right">Price (Inc VAT)</th>
                                            
                                            {selectedAlert === null && <>
                                                <th className="p-4 text-right">CA Price</th>
                                                <th className="p-4 text-right">Qty Sold</th>
                                                <th className="p-4 text-right">Period Sales</th>
                                                <th className="p-4 text-right">Period Profit</th>
                                                <th className="p-4 text-right">Net Margin %</th>
                                                <th className="p-4 text-right">Inventory</th>
                                            </>}
                                            
                                            {(selectedAlert === 'margin' || selectedAlert === 'stock' || selectedAlert === 'dead') && <>
                                                {selectedAlert === 'margin' && <th className="p-4 text-right">Cost (Inc VAT)</th>}
                                                <th className="p-4 text-right">Period Sales</th>
                                                <th className="p-4 text-right">Period Profit</th>
                                                <th className="p-4 text-right">Net Margin %</th>
                                            </>}

                                            {selectedAlert === 'velocity' && <>
                                                <th className="p-4 text-right">Prev Qty</th>
                                                <th className="p-4 text-right">Curr Qty</th>
                                                <th className="p-4 text-right">% Change</th>
                                            </>}
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
                                                
                                                {/* Top Movers Columns */}
                                                {selectedAlert === null && (
                                                    <>
                                                        <td className="p-4 text-right font-bold text-purple-600">
                                                            {p.caPrice ? `£${(p.caPrice * VAT).toFixed(2)}` : '-'}
                                                        </td>
                                                        <td className="p-4 text-right font-medium text-gray-800">{p.periodUnits}</td>
                                                        <td className="p-4 text-right text-gray-600">£{p.periodRevenue.toFixed(0)}</td>
                                                        <td className="p-4 text-right font-medium">£{p.periodProfit.toFixed(0)}</td>
                                                        <td className="p-4 text-right">
                                                            <span className={`font-bold ${p.periodMargin < 10 ? 'text-red-600' : 'text-green-600'}`}>{p.periodMargin.toFixed(1)}%</span>
                                                        </td>
                                                        <td className="p-4 text-right font-bold text-gray-800">{p.stockLevel}</td>
                                                    </>
                                                )}

                                                {/* Margin/Stock/Dead Alert Columns */}
                                                {(selectedAlert === 'margin' || selectedAlert === 'stock' || selectedAlert === 'dead') && (
                                                    <>
                                                        {selectedAlert === 'margin' && <td className="p-4 text-right text-gray-500">£{((p.costPrice || 0) * VAT).toFixed(2)}</td>}
                                                        <td className="p-4 text-right text-gray-600">£{p.periodRevenue.toFixed(0)}</td>
                                                        <td className="p-4 text-right font-medium">£{p.periodProfit.toFixed(0)}</td>
                                                        <td className="p-4 text-right">
                                                            <div className="flex flex-col items-end gap-1">
                                                                <span className={`font-bold ${p.periodMargin < 10 ? 'text-red-600' : 'text-green-600'}`}>{p.periodMargin.toFixed(1)}%</span>
                                                                {selectedAlert === 'margin' && p.toxicPlatforms && p.toxicPlatforms.length > 0 && (
                                                                    <button
                                                                        onClick={() => handleToxicAnalysis(p, p.toxicPlatforms[0])}
                                                                        className="flex items-center gap-1 text-[10px] bg-red-50 text-red-700 px-2 py-1 rounded border border-red-200 font-bold hover:bg-red-100 hover:border-red-300 transition-all shadow-sm"
                                                                        title={`Click to analyze ${p.toxicPlatforms[0].name} specifically`}
                                                                    >
                                                                        <Wrench className="w-3 h-3" />
                                                                        {p.toxicPlatforms[0].name}: {p.toxicPlatforms[0].margin.toFixed(1)}%
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </td>
                                                    </>
                                                )}

                                                {/* Velocity Alert Columns */}
                                                {selectedAlert === 'velocity' && (
                                                    <>
                                                        <td className="p-4 text-right text-gray-600">{p.prevPeriodUnits}</td>
                                                        <td className="p-4 text-right font-medium">{p.periodUnits}</td>
                                                        <td className="p-4 text-right">
                                                            <span className="text-red-600 font-bold">{p.velocityChange.toFixed(0)}%</span>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                           {workbenchData.length > itemsPerPage && (
                                <div className="bg-gray-50/50 px-4 py-3 border-t border-custom-glass flex items-center justify-between sm:px-6">
                                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                        <div className="flex items-center gap-4">
                                            <p className="text-sm text-gray-700">
                                                Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, workbenchData.length)}</span> of <span className="font-medium">{workbenchData.length}</span> results
                                            </p>
                                            <select
                                                value={itemsPerPage}
                                                onChange={(e) => {
                                                    setItemsPerPage(Number(e.target.value));
                                                    setCurrentPage(1);
                                                }}
                                                className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer"
                                            >
                                                <option value={10}>10</option>
                                                <option value={25}>25</option>
                                                <option value={50}>50</option>
                                                <option value={100}>100</option>
                                            </select>
                                        </div>
                                        <div>
                                            {totalPages > 1 && (
                                                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                                    <button
                                                        onClick={() => setCurrentPage(p => Math.max(1, p-1))}
                                                        disabled={currentPage === 1}
                                                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                                    >
                                                        <ChevronLeft className="h-5 w-5" />
                                                    </button>
                                                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                                        Page {currentPage} of {totalPages}
                                                    </span>
                                                    <button
                                                        onClick={() => setCurrentPage(p => Math.min(totalPages, p+1))}
                                                        disabled={currentPage === totalPages}
                                                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                                    >
                                                        <ChevronRight className="h-5 w-5" />
                                                    </button>
                                                </nav>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* SLIDE 2: FINANCIAL HEALTH */}
                {currentSlide === 1 && (
                    <div className="animate-in fade-in slide-in-from-right-8 duration-300">
                        <div className="flex items-stretch gap-4 mb-6">
                             <button 
                                onClick={prevSlide}
                                className="w-12 flex-shrink-0 bg-custom-glass border-custom-glass shadow-lg rounded-xl flex items-center justify-center transition-colors hidden md:flex text-gray-500 hover:text-indigo-600 hover:bg-white/50"
                            >
                                <ChevronLeft className="w-6 h-6" />
                            </button>
                            {/* FINANCIAL METRICS */}
                            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 flex-1">
                                <MetricCard title="Total Revenue" value={`£${financialStats.totalRevenue.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={DollarSign} color="blue" />
                                <MetricCard title="True Net Profit" value={`£${financialStats.totalProfit.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={Coins} color="green" />
                                <MetricCard title="Total Ad Spend" value={`£${financialStats.totalAdSpend.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={Megaphone} color="purple" />
                                <MetricCard title="TACoS %" value={`${financialStats.tacos.toFixed(1)}%`} icon={PieIcon} color="orange" desc="Total Advertising Cost of Sales" />
                            </div>
                             <button 
                                onClick={nextSlide}
                                className="w-12 flex-shrink-0 bg-custom-glass border-custom-glass shadow-lg rounded-xl flex items-center justify-center transition-colors hidden md:flex text-gray-500 hover:text-indigo-600 hover:bg-white/50"
                            >
                                <ChevronRight className="w-6 h-6" />
                            </button>
                        </div>

                        {/* COMPOSED CHART */}
                        <div className="bg-custom-glass p-5 rounded-xl border border-custom-glass shadow-sm flex flex-col h-[400px]">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-blue-600" /> Financial Performance
                            </h3>
                            <div className="flex-1 min-h-0 -ml-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ComposedChart data={financialStats.chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                                        <XAxis dataKey="day" tick={{fontSize: 10}} />
                                        <YAxis yAxisId="left" tick={{fontSize: 10}} tickFormatter={(val) => `£${val}`} />
                                        <YAxis yAxisId="right" orientation="right" tick={{fontSize: 10}} tickFormatter={(val) => `£${val}`} />
                                        <RechartsTooltip 
                                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                            formatter={(value: number) => '£' + value.toLocaleString()}
                                        />
                                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                                        <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#93c5fd" barSize={20} radius={[4, 4, 0, 0]} />
                                        <Line yAxisId="right" type="monotone" dataKey="ads" name="Ad Spend" stroke="#8b5cf6" strokeWidth={2} dot={false} />
                                        <Line yAxisId="right" type="monotone" dataKey="profit" name="Net Profit" stroke="#10b981" strokeWidth={2} dot={false} />
                                    </ComposedChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}

                {/* SLIDE 3: INVENTORY RISK */}
                {currentSlide === 2 && (
                    <div className="animate-in fade-in slide-in-from-right-8 duration-300">
                        <div className="flex items-stretch gap-4 mb-6">
                            <button 
                                onClick={prevSlide}
                                className="w-12 flex-shrink-0 bg-custom-glass border-custom-glass shadow-lg rounded-xl flex items-center justify-center transition-colors hidden md:flex text-gray-500 hover:text-indigo-600 hover:bg-white/50"
                            >
                                <ChevronLeft className="w-6 h-6" />
                            </button>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 flex-1">
                                <MetricCard title="Total Stock Value" value={`£${inventoryStats.totalStockValue.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={Package} color="blue" desc="Based on Cost Price" />
                                <MetricCard title="Dead Stock Value" value={`£${inventoryStats.deadStockValue.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={AlertTriangle} color="gray" desc="0 Sales in Period" />
                                <MetricCard title="Projected Lost Revenue" value={`£${inventoryStats.lostRevenue.toLocaleString(undefined, {maximumFractionDigits:0})}`} icon={TrendingDown} color="red" desc="Due to Stockouts" />
                            </div>
                             <button 
                                onClick={nextSlide}
                                className="w-12 flex-shrink-0 bg-custom-glass border-custom-glass shadow-lg rounded-xl flex items-center justify-center transition-colors hidden md:flex text-gray-500 hover:text-indigo-600 hover:bg-white/50"
                            >
                                <ChevronRight className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="bg-custom-glass p-5 rounded-xl border border-custom-glass shadow-sm flex flex-col h-[400px]">
                            <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                                <Clock className="w-4 h-4 text-purple-600" /> Stock Runway Distribution
                            </h3>
                            <div className="flex-1 min-h-0 -ml-2">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={inventoryStats.chartData} layout="horizontal">
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                        <XAxis dataKey="name" tick={{fontSize: 12, fontWeight: 600}} />
                                        <YAxis tick={{fontSize: 10}} />
                                        <RechartsTooltip cursor={{fill: 'transparent'}} />
                                        <Bar dataKey="value" name="SKU Count" fill="#818cf8" radius={[4, 4, 0, 0]} barSize={40}>
                                            {inventoryStats.chartData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.name === 'OOS' || entry.name === '< 2w' ? '#f87171' : entry.name === '2-4w' ? '#fbbf24' : '#34d399'} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// ... [AlertCard, ShipmentsView, PriceMatrixView, AliasDrawer remain unchanged]
const MetricCard = ({ title, value, icon: Icon, color, desc }: any) => {
    const colorStyles = {
        blue: 'bg-blue-50 text-blue-700',
        green: 'bg-green-50 text-green-700',
        purple: 'bg-purple-50 text-purple-700',
        orange: 'bg-orange-50 text-orange-700',
        red: 'bg-red-50 text-red-700',
        gray: 'bg-gray-50 text-gray-700'
    };

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm flex items-start justify-between">
            <div>
                <span className="text-xs font-bold text-gray-500 uppercase">{title}</span>
                <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
                {desc && <div className="text-[10px] text-gray-400 mt-1">{desc}</div>}
            </div>
            <div className={`p-2 rounded-lg ${colorStyles[color as keyof typeof colorStyles]}`}>
                <Icon className="w-5 h-5" />
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
    // ... [Content identical to previous version, omitted for brevity but assumed present]
    // Re-implementing for correctness in output
    const [inputValue, setInputValue] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
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
                        aliases 
                    });
                });
            }
        });
        return items;
    }, [products]);

    const filteredTableData = useMemo(() => {
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

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTags, inputValue]);
    
    const paginatedTableData = useMemo(() => {
        return filteredTableData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    }, [filteredTableData, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filteredTableData.length / itemsPerPage);

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
        if (s.includes('shipped') && !s.includes('to be')) return 'bg-blue-100 text-blue-800 border-blue-200';
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
                                {paginatedTableData.map(row => (
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
                         {filteredTableData.length > 0 && (
                            <div className="bg-gray-50/50 px-4 py-3 border-t border-gray-200/50 flex items-center justify-between sm:px-6">
                                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                                    <div className="flex items-center gap-4">
                                        <p className="text-sm text-gray-700">
                                            Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredTableData.length)}</span> of <span className="font-medium">{filteredTableData.length}</span> results
                                        </p>
                                        <select
                                            value={itemsPerPage}
                                            onChange={(e) => {
                                                setItemsPerPage(Number(e.target.value));
                                                setCurrentPage(1);
                                            }}
                                            className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer"
                                        >
                                            <option value={10}>10</option>
                                            <option value={25}>25</option>
                                            <option value={50}>50</option>
                                            <option value={100}>100</option>
                                        </select>
                                    </div>
                                    <div>
                                        {totalPages > 1 && (
                                            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                                <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-5 w-5" /></button>
                                                <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">Page {currentPage} of {totalPages}</span>
                                                <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-5 w-5" /></button>
                                            </nav>
                                        )}
                                    </div>
                                </div>
                            </div>
                         )}
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
    // ... [Identical to previous]
    const [search, setSearch] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const platforms = Object.keys(pricingRules);
    
    const filtered = useMemo(() => products.filter(p => {
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
    }), [products, search, searchTags]);
    
    useEffect(() => { setCurrentPage(1); }, [search, searchTags]);

    const paginatedProducts = useMemo(() => {
        return filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    }, [filtered, currentPage, itemsPerPage]);
    
    const totalPages = Math.ceil(filtered.length / itemsPerPage);
    
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
                        {paginatedProducts.map(p => (
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
                 {filtered.length > itemsPerPage && (
                    <div className="bg-gray-50/50 px-4 py-3 border-t border-gray-200/50 flex items-center justify-between sm:px-6 sticky bottom-0">
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                            <div className="flex items-center gap-4">
                                <p className="text-sm text-gray-700">
                                    Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> of <span className="font-medium">{filtered.length}</span> results
                                </p>
                                <select
                                    value={itemsPerPage}
                                    onChange={(e) => {
                                        setItemsPerPage(Number(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                    className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                            <div>
                                {totalPages > 1 && (
                                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-5 w-5" /></button>
                                        <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">Page {currentPage} of {totalPages}</span>
                                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-5 w-5" /></button>
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

const AliasDrawer = ({ product, pricingRules, onClose, onSave, themeColor }: any) => {
    // ... [Identical to previous]
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