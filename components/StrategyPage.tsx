
import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Product, StrategyConfig, PricingRules } from '../types';
import { Settings, AlertTriangle, TrendingUp, TrendingDown, Info, Save, Download, ChevronDown, ChevronUp, AlertCircle, CheckCircle, Ship, X, ArrowRight } from 'lucide-react';

interface StrategyPageProps {
    products: Product[];
    pricingRules: PricingRules;
    currentConfig: StrategyConfig;
    onSaveConfig: (config: StrategyConfig) => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
}

const StrategyPage: React.FC<StrategyPageProps> = ({ products, pricingRules, currentConfig, onSaveConfig, themeColor, headerStyle }) => {
    const [config, setConfig] = useState<StrategyConfig>(JSON.parse(JSON.stringify(currentConfig)));
    const [isConfigOpen, setIsConfigOpen] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [includeIncoming, setIncludeIncoming] = useState(false); // New Toggle State
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false); // Export Menu State

    // --- LOGIC HELPERS ---

    // 1. Calculate Filtered Global Price (excluding specific platforms defined in Settings)
    const getFilteredPrice = (product: Product) => {
        const validChannels = product.channels.filter(c => !pricingRules[c.platform]?.isExcluded);
        
        if (validChannels.length === 0) {
            return product.currentPrice;
        }

        const totalRevenue = validChannels.reduce((sum, c) => sum + ((c.price || product.currentPrice) * c.velocity), 0);
        const totalVelocity = validChannels.reduce((sum, c) => sum + c.velocity, 0);

        return totalVelocity > 0 ? totalRevenue / totalVelocity : product.currentPrice;
    };

    // 2. Metrics Calculation
    const getMetrics = (product: Product, filteredPrice: number) => {
        const weeklyVelocity = product.averageDailySales * 7;
        
        // --- UPDATED LOGIC FOR RUNWAY ---
        const effectiveStock = product.stockLevel + (includeIncoming ? (product.incomingStock || 0) : 0);
        
        // Avoid division by zero for runway
        const runwayWeeks = weeklyVelocity > 0 ? (effectiveStock / weeklyVelocity) : 999;
        
        const totalCost = (product.costPrice || 0) + (product.sellingFee || 0) + (product.adsFee || 0) + 
                          (product.postage || 0) + (product.otherFee || 0) + (product.subscriptionFee || 0) + (product.wmsFee || 0);
        
        const net = (filteredPrice + (product.extraFreight || 0)) - totalCost;
        const marginPercent = filteredPrice > 0 ? (net / filteredPrice) * 100 : 0;

        const floorPrice = ((product.costPrice || 0) + (product.postage || 0)) * (1 + config.safety.minMarginPercent / 100);

        // "New Product" Logic: Explicit ERP status OR created < 14 days ago (fallback)
        const isNew = product.inventoryStatus === 'New Product' || 
                      (new Date().getTime() - new Date(product.lastUpdated).getTime()) / (1000 * 3600 * 24) < 14; 

        return { weeklyVelocity, runwayWeeks, marginPercent, floorPrice, isNew, effectiveStock };
    };

    // 3. Decision Engine
    const getRecommendation = (product: Product, metrics: any) => {
        const { weeklyVelocity, runwayWeeks, marginPercent, floorPrice, isNew, effectiveStock } = metrics;
        const filteredPrice = getFilteredPrice(product);

        let action: 'INCREASE' | 'DECREASE' | 'MAINTAIN' = 'MAINTAIN';
        let adjustedPrice = filteredPrice;
        let reasoning = 'Stable';

        // Helper: Apply .99 cent logic (Psychological Pricing)
        const applyPsychologicalPricing = (price: number) => {
             const rounded = Math.ceil(price) - 0.01;
             return Number(rounded.toFixed(2));
        };

        // RULE 1: INCREASE
        if (
            runwayWeeks < config.increase.minRunwayWeeks &&
            effectiveStock > config.increase.minStock &&
            weeklyVelocity >= config.increase.minVelocity7Days
        ) {
            action = 'INCREASE';
            // Logic: Increase by % OR Fixed Amount, whichever is HIGHER
            const increaseAmount = Math.max(
                filteredPrice * (config.increase.adjustmentPercent / 100), 
                config.increase.adjustmentFixed
            );
            const rawNewPrice = filteredPrice + increaseAmount;
            adjustedPrice = applyPsychologicalPricing(rawNewPrice);
            
            reasoning = `Runway < ${config.increase.minRunwayWeeks} wks & Vel > ${config.increase.minVelocity7Days}`;
        }
        
        // RULE 2: DECREASE (Only if not New or if allowed via toggle)
        else if (!isNew || config.decrease.includeNewProducts) {
            const highStock = runwayWeeks > config.decrease.highStockWeeks;
            const medStockHighMargin = runwayWeeks > config.decrease.medStockWeeks && marginPercent > config.decrease.minMarginPercent;

            if (highStock || medStockHighMargin) {
                action = 'DECREASE';
                const rawNewPrice = filteredPrice * (1 - config.decrease.adjustmentPercent / 100);
                adjustedPrice = applyPsychologicalPricing(rawNewPrice);
                
                reasoning = highStock 
                    ? `Runway > ${config.decrease.highStockWeeks} wks` 
                    : `Runway > ${config.decrease.medStockWeeks} wks & Margin > ${config.decrease.minMarginPercent}%`;
            }
        }

        // SAFETY CHECK
        const safetyViolation = adjustedPrice < floorPrice;
        
        return { action, adjustedPrice, reasoning, safetyViolation };
    };

    const tableData = useMemo(() => {
        return products
            .filter(p => p.sku.toLowerCase().includes(searchQuery.toLowerCase()))
            .map(p => {
                const filteredPrice = getFilteredPrice(p);
                const metrics = getMetrics(p, filteredPrice);
                const rec = getRecommendation(p, metrics);
                return { ...p, filteredPrice, ...metrics, ...rec };
            })
            // Sort by Action priority (Increase > Decrease > Maintain)
            .sort((a, b) => {
                const score = (x: string) => x === 'INCREASE' ? 3 : x === 'DECREASE' ? 2 : 1;
                return score(b.action) - score(a.action);
            });
    }, [products, config, searchQuery, pricingRules, includeIncoming]);

    const uniquePlatforms = useMemo(() => {
        const platformSet = new Set<string>();
        products.forEach(p => p.channels.forEach(c => platformSet.add(c.platform)));
        if (pricingRules) {
            Object.keys(pricingRules).forEach(k => platformSet.add(k));
        }
        return Array.from(platformSet).sort();
    }, [products, pricingRules]);

    const handleExport = (platform: string = 'All') => {
        // Helper to sanitize CSV fields
        const clean = (val: any) => {
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/[\r\n]+/g, ' '); // Strip newlines
            return `"${str.replace(/"/g, '""')}"`; // Escape quotes
        };

        const headers = ['SKU', 'Master SKU', 'Name', 'Filtered Price', 'Runway (Wks)', 'Margin %', 'Is New', 'Action', 'Suggested Price', 'Floor Price', 'Safety Alert', 'Reason'];
        const rows: string[][] = [];

        tableData.forEach(r => {
            // Common Data Row
            const commonData = [
                clean(r.name),
                r.filteredPrice.toFixed(2),
                r.runwayWeeks.toFixed(1),
                r.marginPercent.toFixed(1),
                r.isNew ? 'Yes' : 'No',
                clean(r.action),
                r.adjustedPrice.toFixed(2),
                r.floorPrice.toFixed(2),
                r.safetyViolation ? 'VIOLATION' : '',
                clean(r.reasoning)
            ];

            if (platform === 'All') {
                // Standard Export: 1 Row, using Master SKU
                rows.push([clean(r.sku), clean(r.sku), ...commonData]);
            } else {
                // Platform Specific: Check for multiple aliases (One-to-Many)
                // Use case-insensitive + fuzzy match to find correct channel
                const normalize = (s: string) => s.toLowerCase().trim();
                const targetPlatform = normalize(platform);
                
                // 1. Exact match
                let channel = r.channels.find(c => normalize(c.platform) === targetPlatform);
                
                // 2. Fuzzy match
                if (!channel) {
                    channel = r.channels.find(c => normalize(c.platform).includes(targetPlatform) || targetPlatform.includes(normalize(c.platform)));
                }
                
                if (channel && channel.skuAlias) {
                    // Split comma-separated aliases and create a row for EACH
                    const aliases = channel.skuAlias.split(',').map(s => s.trim()).filter(Boolean);
                    
                    if (aliases.length > 0) {
                        aliases.forEach(alias => {
                            rows.push([clean(alias), clean(r.sku), ...commonData]);
                        });
                    } else {
                        // Fallback to Master SKU
                        rows.push([clean(r.sku), clean(r.sku), ...commonData]);
                    }
                } else {
                    // Fallback to Master SKU if no channel found
                    rows.push([clean(r.sku), clean(r.sku), ...commonData]);
                }
            }
        });
        
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        const filename = platform === 'All' ? `pricing_strategy_master_${new Date().toISOString().slice(0,10)}.csv` : `pricing_strategy_${platform.toLowerCase().replace(/\s+/g, '_')}_${new Date().toISOString().slice(0,10)}.csv`;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setIsExportMenuOpen(false);
    };

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
            {/* Header */}
            <div className="flex justify-between items-center">
                <div>
                    <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Strategy Engine</h2>
                    <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                        Rule-based pricing logic. Adjust criteria below to generate real-time recommendations.
                    </p>
                </div>
                <div className="flex gap-3 items-center relative">
                    {/* Incoming Stock Toggle */}
                    <button 
                        onClick={() => setIncludeIncoming(!includeIncoming)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-lg font-bold border transition-all shadow-sm ${includeIncoming ? 'bg-blue-600 text-white border-blue-700' : 'bg-white/80 text-gray-500 border-gray-300'}`}
                        title={includeIncoming ? "Including Incoming Stock in Runway Calc" : "Excluding Incoming Stock (Conservative Mode)"}
                    >
                        <Ship className="w-4 h-4" />
                        {includeIncoming ? 'Incoming Included' : 'Incoming Excluded'}
                    </button>

                    <button 
                        onClick={() => setIsConfigOpen(!isConfigOpen)}
                        className={`px-4 py-2 rounded-lg font-medium border flex items-center gap-2 transition-all ${isConfigOpen ? 'bg-gray-100 text-gray-900 border-gray-300' : 'bg-white/80 text-indigo-600 border-indigo-200'}`}
                    >
                        <Settings className="w-4 h-4" />
                        {isConfigOpen ? 'Hide Rules' : 'Edit Rules'}
                    </button>
                    
                    <div className="relative">
                        <button 
                            onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                            className="px-4 py-2 bg-white/80 text-gray-700 border border-gray-300 rounded-lg hover:bg-white flex items-center gap-2"
                        >
                            <Download className="w-4 h-4" />
                            Export Matrix
                            <ChevronDown className="w-3 h-3 text-gray-400" />
                        </button>

                        {/* Floating Modal for Export */}
                        {isExportMenuOpen && createPortal(
                            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setIsExportMenuOpen(false)}>
                                <div 
                                    className="bg-custom-glass-modal backdrop-blur-custom-modal rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-white/20"
                                    onClick={e => e.stopPropagation()} 
                                >
                                    <div className="p-4 border-b border-gray-100/50 flex justify-between items-center bg-gray-50/50">
                                        <h3 className="font-bold text-gray-900">Export Strategy</h3>
                                        <button onClick={() => setIsExportMenuOpen(false)} className="p-1 hover:bg-gray-200/50 rounded-full transition-colors">
                                            <X className="w-4 h-4 text-gray-500" />
                                        </button>
                                    </div>
                                    
                                    <div className="p-2">
                                        <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Select Format</div>
                                        <button 
                                            onClick={() => handleExport('All')}
                                            className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50/50 flex items-center justify-between group rounded-lg transition-colors"
                                        >
                                            <span className="font-medium">Standard (Master SKUs)</span>
                                            <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600" />
                                        </button>
                                        
                                        <div className="my-2 border-t border-gray-100/50"></div>
                                        
                                        <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Export for Platform</div>
                                        <div className="max-h-60 overflow-y-auto">
                                            {uniquePlatforms.map(platform => (
                                                <button 
                                                    key={platform}
                                                    onClick={() => handleExport(platform)}
                                                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50/50 flex items-center justify-between rounded-lg transition-colors"
                                                >
                                                    <span>{platform}</span>
                                                    <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200">Alias Mode</span>
                                                </button>
                                            ))}
                                            {uniquePlatforms.length === 0 && (
                                                <div className="px-4 py-2 text-xs text-gray-400 italic">No platforms detected</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </div>,
                            document.body
                        )}
                    </div>
                </div>
            </div>

            {/* Config Panel - Glass UI */}
            {isConfigOpen && (
                <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden animate-in fade-in slide-in-from-top-4">
                    <div className="border-b border-custom-glass bg-gray-50/50 p-4 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <Settings className="w-4 h-4 text-gray-500" />
                            Configuration Parameters
                        </h3>
                        <button 
                            onClick={() => onSaveConfig(config)}
                            className="text-xs bg-gray-900 text-white px-3 py-1.5 rounded-lg flex items-center gap-1 hover:bg-gray-800"
                        >
                            <Save className="w-3 h-3" /> Save Defaults
                        </button>
                    </div>
                    
                    <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                        {/* Increase Rules */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-green-700 font-bold border-b border-green-100 pb-2 mb-2">
                                <TrendingUp className="w-4 h-4" /> Increase Logic
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Runway (Weeks)</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-400">&lt;</span>
                                        <input 
                                            type="number" 
                                            value={config.increase.minRunwayWeeks}
                                            onChange={e => setConfig({...config, increase: {...config.increase, minRunwayWeeks: parseFloat(e.target.value)}})}
                                            className="w-full border rounded p-1.5 text-sm bg-white/50" 
                                        />
                                    </div>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Min Stock</label>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-400">&gt;</span>
                                        <input 
                                            type="number" 
                                            value={config.increase.minStock}
                                            onChange={e => setConfig({...config, increase: {...config.increase, minStock: parseFloat(e.target.value)}})}
                                            className="w-full border rounded p-1.5 text-sm bg-white/50" 
                                        />
                                    </div>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Min 7-Day Velocity (Exclusion)</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-400">&ge;</span>
                                    <input 
                                        type="number" 
                                        value={config.increase.minVelocity7Days}
                                        onChange={e => setConfig({...config, increase: {...config.increase, minVelocity7Days: parseFloat(e.target.value)}})}
                                        className="w-20 border rounded p-1.5 text-sm bg-white/50" 
                                    />
                                    <span className="text-xs text-gray-400">units</span>
                                </div>
                            </div>

                            <div className="bg-green-50/50 p-3 rounded border border-green-100">
                                <label className="text-xs font-bold text-green-800 uppercase block mb-2">Adjustment Action</label>
                                <div className="flex gap-2">
                                    <div className="flex-1">
                                        <span className="text-[10px] text-gray-500">Percent (%)</span>
                                        <input 
                                            type="number" 
                                            value={config.increase.adjustmentPercent}
                                            onChange={e => setConfig({...config, increase: {...config.increase, adjustmentPercent: parseFloat(e.target.value)}})}
                                            className="w-full border rounded p-1 text-sm text-green-700 font-bold bg-white/80" 
                                        />
                                    </div>
                                    <div className="flex-1">
                                        <span className="text-[10px] text-gray-500">Fixed (£)</span>
                                        <input 
                                            type="number" 
                                            value={config.increase.adjustmentFixed}
                                            onChange={e => setConfig({...config, increase: {...config.increase, adjustmentFixed: parseFloat(e.target.value)}})}
                                            className="w-full border rounded p-1 text-sm text-green-700 font-bold bg-white/80" 
                                        />
                                    </div>
                                </div>
                                <p className="text-[10px] text-green-600 mt-1 italic">*Applies whichever is higher</p>
                            </div>
                        </div>

                        {/* Decrease Rules */}
                        <div className="space-y-4 border-l border-r border-gray-200/50 px-6">
                            <div className="flex items-center gap-2 text-red-700 font-bold border-b border-red-100 pb-2 mb-2">
                                <TrendingDown className="w-4 h-4" /> Decrease Logic
                            </div>

                            <div className="bg-gray-50/50 p-2 rounded text-xs text-gray-600 mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <Info className="w-3 h-3" /> 
                                    <span>Include "New Products"?</span>
                                </div>
                                <button 
                                    onClick={() => setConfig({...config, decrease: {...config.decrease, includeNewProducts: !config.decrease.includeNewProducts}})}
                                    className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${config.decrease.includeNewProducts ? 'bg-red-500' : 'bg-gray-300'}`}
                                >
                                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${config.decrease.includeNewProducts ? 'translate-x-4' : 'translate-x-1'}`} />
                                </button>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Condition A: High Stock</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600">Runway &gt;</span>
                                    <input 
                                        type="number" 
                                        value={config.decrease.highStockWeeks}
                                        onChange={e => setConfig({...config, decrease: {...config.decrease, highStockWeeks: parseFloat(e.target.value)}})}
                                        className="w-16 border rounded p-1.5 text-sm bg-white/50" 
                                    />
                                    <span className="text-sm text-gray-600">weeks</span>
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Condition B: Med Stock + High Margin</label>
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-600 w-16">Runway &gt;</span>
                                        <input 
                                            type="number" 
                                            value={config.decrease.medStockWeeks}
                                            onChange={e => setConfig({...config, decrease: {...config.decrease, medStockWeeks: parseFloat(e.target.value)}})}
                                            className="w-16 border rounded p-1.5 text-sm bg-white/50" 
                                        />
                                        <span className="text-sm text-gray-600">weeks</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-gray-600 w-16">Margin &gt;</span>
                                        <input 
                                            type="number" 
                                            value={config.decrease.minMarginPercent}
                                            onChange={e => setConfig({...config, decrease: {...config.decrease, minMarginPercent: parseFloat(e.target.value)}})}
                                            className="w-16 border rounded p-1.5 text-sm bg-white/50" 
                                        />
                                        <span className="text-sm text-gray-600">%</span>
                                    </div>
                                </div>
                            </div>

                            <div className="bg-red-50/50 p-3 rounded border border-red-100">
                                <label className="text-xs font-bold text-red-800 uppercase block mb-2">Adjustment Action</label>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm text-gray-600">Decrease by</span>
                                    <input 
                                        type="number" 
                                        value={config.decrease.adjustmentPercent}
                                        onChange={e => setConfig({...config, decrease: {...config.decrease, adjustmentPercent: parseFloat(e.target.value)}})}
                                        className="w-20 border rounded p-1 text-sm text-red-700 font-bold bg-white/80" 
                                    />
                                    <span className="text-sm text-gray-600">%</span>
                                </div>
                            </div>
                        </div>

                        {/* Safety & Global */}
                        <div className="space-y-4">
                            <div className="flex items-center gap-2 text-amber-700 font-bold border-b border-amber-100 pb-2 mb-2">
                                <AlertTriangle className="w-4 h-4" /> Safety Net
                            </div>

                            <div className="bg-amber-50/50 p-4 rounded border border-amber-100">
                                <label className="text-xs font-bold text-amber-800 uppercase block mb-2">Minimum Floor Constraint</label>
                                <p className="text-xs text-amber-700 mb-3">Price must not fall below:</p>
                                <div className="flex items-center gap-2 font-mono text-sm bg-white/80 p-2 rounded border border-amber-200 mb-3">
                                    (Cost + Ship) × 
                                    <span className="font-bold">1.{config.safety.minMarginPercent}</span>
                                </div>
                                
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-amber-800">Min Margin Buffer:</span>
                                    <input 
                                        type="number" 
                                        value={config.safety.minMarginPercent}
                                        onChange={e => setConfig({...config, safety: {...config.safety, minMarginPercent: parseFloat(e.target.value)}})}
                                        className="w-16 border rounded p-1 text-sm font-bold text-amber-700 bg-white/80" 
                                    />
                                    <span className="text-xs text-amber-800">%</span>
                                </div>
                            </div>

                            <div className="mt-6 pt-4 border-t border-gray-200/50">
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Platform Exclusions</label>
                                <p className="text-[10px] text-gray-400">
                                    Configure excluded platforms (e.g. Wayfair, FBA) in the <strong>Settings</strong> page. 
                                    Transactions from excluded platforms are filtered out from the price calculation above.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Results Table - Glass UI */}
            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                <div className="p-4 border-b border-custom-glass flex items-center gap-4 bg-gray-50/50">
                    <input 
                        type="text" 
                        placeholder="Filter by SKU..." 
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 bg-white/80"
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                    />
                    <div className="text-xs text-gray-500">
                        Showing <strong>{tableData.length}</strong> SKUs
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50/50 text-gray-600 font-semibold border-b border-gray-200/50">
                            <tr>
                                <th className="p-4">Product</th>
                                <th className="p-4 text-right">Filtered Price</th>
                                <th className="p-4 text-right">Velocity (7d)</th>
                                <th className="p-4 text-right">
                                    {includeIncoming ? 'Runway (Inc. Incoming)' : 'Runway (On Hand Only)'}
                                </th>
                                <th className="p-4 text-right">Margin %</th>
                                <th className="p-4 text-center">Status</th>
                                <th className="p-4 text-center">Action</th>
                                <th className="p-4 text-right">New Price</th>
                                <th className="p-4 text-right">Floor Limit</th>
                                <th className="p-4">Reason</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/50">
                            {tableData.map((row) => (
                                <tr key={row.id} className={`hover:bg-gray-50/50 ${row.safetyViolation ? 'bg-amber-50/30' : ''}`}>
                                    <td className="p-4">
                                        <div className="font-bold text-gray-900">{row.sku}</div>
                                        {row.isNew && (
                                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] bg-blue-100 text-blue-700 font-bold border border-blue-200 mt-1">
                                                New Product
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right font-mono text-gray-600">£{row.filteredPrice.toFixed(2)}</td>
                                    <td className="p-4 text-right">{row.weeklyVelocity.toFixed(1)}</td>
                                    <td className="p-4 text-right">
                                        {row.runwayWeeks > 100 ? '100+' : row.runwayWeeks.toFixed(1)}
                                        {includeIncoming && row.incomingStock && row.incomingStock > 0 ? (
                                            <span className="block text-[9px] text-blue-500 font-bold">+ Incoming</span>
                                        ) : null}
                                    </td>
                                    <td className="p-4 text-right">{row.marginPercent.toFixed(1)}%</td>
                                    
                                    <td className="p-4 text-center">
                                        {/* Simple visualization of stock status */}
                                        {row.runwayWeeks < config.increase.minRunwayWeeks ? (
                                            <span className="w-3 h-3 rounded-full bg-red-500 inline-block" title="Low Stock"></span>
                                        ) : row.runwayWeeks > config.decrease.highStockWeeks ? (
                                            <span className="w-3 h-3 rounded-full bg-orange-500 inline-block" title="Overstock"></span>
                                        ) : (
                                            <span className="w-3 h-3 rounded-full bg-green-500 inline-block" title="Healthy"></span>
                                        )}
                                    </td>

                                    <td className="p-4 text-center">
                                        {row.action === 'INCREASE' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-green-100 text-green-800 border border-green-200">
                                                <TrendingUp className="w-3 h-3" /> INCREASE
                                            </span>
                                        )}
                                        {row.action === 'DECREASE' && (
                                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-800 border border-red-200">
                                                <TrendingDown className="w-3 h-3" /> DECREASE
                                            </span>
                                        )}
                                        {row.action === 'MAINTAIN' && (
                                            <span className="text-gray-400 text-xs font-medium">Maintain</span>
                                        )}
                                    </td>

                                    <td className="p-4 text-right font-bold text-gray-900">
                                        {row.action !== 'MAINTAIN' ? (
                                            <span style={{ color: themeColor }}>£{row.adjustedPrice.toFixed(2)}</span>
                                        ) : '-'}
                                    </td>

                                    <td className="p-4 text-right text-xs text-gray-500">
                                        £{row.floorPrice.toFixed(2)}
                                        {row.safetyViolation && (
                                            <div className="flex items-center justify-end gap-1 text-red-600 font-bold mt-1">
                                                <AlertCircle className="w-3 h-3" /> Violation
                                            </div>
                                        )}
                                    </td>

                                    <td className="p-4 text-xs text-gray-500 max-w-[200px] truncate" title={row.reasoning}>
                                        {row.reasoning}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

export default StrategyPage;
