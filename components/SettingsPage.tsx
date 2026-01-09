import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PricingRules, Platform, Product, PriceLog, PromotionEvent, LogisticsRule, ShipmentLog, VelocityLookback, SearchConfig } from '../types';
import { Save, Percent, Coins, Info, Plus, Trash2, User, Globe, Truck, Calculator, Scale, Ruler, Eye, EyeOff, BarChart2, Calendar, Search, Megaphone, AlertTriangle } from 'lucide-react';
import { isAdsEnabled, setAdsCapability, ensureCapabilities } from '../services/platformCapabilities';
import AlertThresholdSettings from './AlertThresholdSettings';

interface SettingsPageProps {
    currentRules: PricingRules;
    onSave: (rules: PricingRules, velocitySetting: VelocityLookback, searchConfig: SearchConfig) => void;
    logisticsRules?: LogisticsRule[];
    onSaveLogistics?: (rules: LogisticsRule[]) => void;
    products: Product[];
    extraData?: {
        priceHistory: PriceLog[];
        promotions: PromotionEvent[];
    };
    shipmentHistory?: ShipmentLog[];
    themeColor: string;
    headerStyle: React.CSSProperties;
    searchConfig?: SearchConfig;
    velocityLookback: VelocityLookback;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ currentRules, onSave, logisticsRules = [], onSaveLogistics, products, extraData, shipmentHistory = [], themeColor, headerStyle, searchConfig: initialSearchConfig, velocityLookback: initialVelocityLookback }) => {
    const [activeTab, setActiveTab] = useState<'platforms' | 'logistics' | 'analysis' | 'thresholds' | 'search'>('platforms');
    const [rules, setRules] = useState<PricingRules>(JSON.parse(JSON.stringify(currentRules)));
    const [logistics, setLogistics] = useState<LogisticsRule[]>(JSON.parse(JSON.stringify(logisticsRules)));
    const [searchConfig, setSearchConfig] = useState<SearchConfig>(initialSearchConfig ? JSON.parse(JSON.stringify(initialSearchConfig)) : { volumeBands: { topPercentile: 20, bottomPercentile: 20 }, minAbsoluteFloor: 10 });
    const [velocityLookback, setVelocityLookback] = useState<VelocityLookback>(initialVelocityLookback);

    const [newPlatformName, setNewPlatformName] = useState('');
    const [isSaved, setIsSaved] = useState(false);
    
    // Ads capabilities refresh trigger
    const [adsRefresh, setAdsRefresh] = useState(0);

    // Sync state with props if they change externally (e.g. after restore)
    useEffect(() => {
        setRules(JSON.parse(JSON.stringify(currentRules)));
        setLogistics(JSON.parse(JSON.stringify(logisticsRules)));
        if (initialSearchConfig) setSearchConfig(JSON.parse(JSON.stringify(initialSearchConfig)));
    }, [currentRules, logisticsRules, initialSearchConfig]);

    // Sync velocityLookback prop
    useEffect(() => {
        setVelocityLookback(initialVelocityLookback);
    }, [initialVelocityLookback]);

    // Extract platforms that exist in the product data but might not be in rules yet
    const discoveredPlatforms = useMemo(() => {
        const set = new Set<string>();
        products.forEach(p => p.channels.forEach(c => set.add(c.platform)));
        return Array.from(set).sort();
    }, [products]);

    useEffect(() => {
        // Run inference once on mount
        if (Object.keys(rules).length > 0 && extraData?.priceHistory) {
            ensureCapabilities(Object.keys(rules), extraData.priceHistory);
            setAdsRefresh(prev => prev + 1); // Force re-render of toggles
        }
    }, [rules, extraData]);

    useEffect(() => {
        if (isSaved) {
            const timer = setTimeout(() => setIsSaved(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [isSaved]);

    const handleMarkupChange = (platform: Platform, value: string) => {
        const numValue = parseFloat(value);
        setRules(prev => ({
            ...prev,
            [platform]: { ...prev[platform], markup: isNaN(numValue) ? 0 : numValue }
        }));
    };

    const handleCommissionChange = (platform: Platform, value: string) => {
        const numValue = parseFloat(value);
        setRules(prev => ({
            ...prev,
            [platform]: { ...prev[platform], commission: isNaN(numValue) ? 0 : Math.max(0, numValue) }
        }));
    };

    const handleManagerChange = (platform: Platform, value: string) => {
        setRules(prev => ({
            ...prev,
            [platform]: { ...prev[platform], manager: value }
        }));
    };

    const handleColorChange = (platform: Platform, value: string) => {
        setRules(prev => ({
            ...prev,
            [platform]: { ...prev[platform], color: value }
        }));
    };

    const toggleExclusion = (platform: Platform) => {
        setRules(prev => ({
            ...prev,
            [platform]: { ...prev[platform], isExcluded: !prev[platform].isExcluded }
        }));
    };
    
    const toggleAdsSupported = (platform: Platform) => {
        const current = isAdsEnabled(platform);
        setAdsCapability(platform, !current);
        setAdsRefresh(prev => prev + 1);
    };

    const handleAddPlatform = () => {
        const trimmedName = newPlatformName.trim();
        if (trimmedName && !rules[trimmedName]) {
            setRules(prev => ({
                ...prev,
                [trimmedName]: {
                    markup: 0,
                    commission: 0,
                    manager: 'Unassigned',
                    color: '#374151',
                    isExcluded: false
                }
            }));
            setNewPlatformName('');
        }
    };

    const handleDeletePlatform = (platform: Platform) => {
        const newRules = { ...rules };
        delete newRules[platform];
        setRules(newRules);
    };

    // Logistics Handlers
    const handleLogisticsChange = (id: string, field: keyof LogisticsRule, value: string) => {
        const numValue = parseFloat(value);
        setLogistics(prev => prev.map(rule =>
            rule.id === id ? { ...rule, [field]: isNaN(numValue) ? 0 : numValue } : rule
        ));
    };

    const handleAutoCalibrate = () => {
        if (shipmentHistory.length === 0) {
            alert("No shipping history found. Please import a Transaction Report with 'Logistics Service' mapped first.");
            return;
        }

        // Group logs by service
        const serviceStats: Record<string, { costs: number[], maxWeight: number, maxLength: number }> = {};

        shipmentHistory.forEach(log => {
            const product = products.find(p => p.sku === log.sku);
            if (!product) return;

            const normalizedService = log.service.toUpperCase();
            if (!serviceStats[normalizedService]) serviceStats[normalizedService] = { costs: [], maxWeight: 0, maxLength: 0 };

            const stats = serviceStats[normalizedService];
            stats.costs.push(log.cost);

            if (product.cartonDimensions) {
                if (product.cartonDimensions.weight > stats.maxWeight) stats.maxWeight = product.cartonDimensions.weight;
                if (product.cartonDimensions.length > stats.maxLength) stats.maxLength = product.cartonDimensions.length;
            }
        });

        const newRules = [...logistics];
        let updatesCount = 0;

        Object.entries(serviceStats).forEach(([serviceName, stats]) => {
            stats.costs.sort((a, b) => a - b);
            const mid = Math.floor(stats.costs.length / 2);
            const medianCost = stats.costs.length % 2 !== 0 ? stats.costs[mid] : (stats.costs[mid - 1] + stats.costs[mid]) / 2;

            const existingIdx = newRules.findIndex(r => r.name.trim().toUpperCase() === serviceName);

            const ruleUpdate = {
                price: Number(medianCost.toFixed(2)),
                maxWeight: stats.maxWeight > 0 ? Number(stats.maxWeight.toFixed(2)) : undefined,
                maxLength: stats.maxLength > 0 ? Number(stats.maxLength.toFixed(2)) : undefined
            };

            if (existingIdx >= 0) {
                const existing = newRules[existingIdx];
                newRules[existingIdx] = {
                    ...existing,
                    price: ruleUpdate.price,
                    maxWeight: ruleUpdate.maxWeight || existing.maxWeight,
                    maxLength: ruleUpdate.maxLength || existing.maxLength
                };
                updatesCount++;
            } else {
                newRules.push({
                    id: `auto-${serviceName.toLowerCase().replace(/\s/g, '-')}`,
                    name: serviceName,
                    carrier: 'Auto-Detected',
                    price: ruleUpdate.price,
                    maxWeight: ruleUpdate.maxWeight,
                    maxLength: ruleUpdate.maxLength
                });
                updatesCount++;
            }
        });

        setLogistics(newRules);
        alert(`Calibration complete. Updated rates for ${updatesCount} services based on ${shipmentHistory.length} shipments.`);
    };

    const handleSave = () => {
        onSave(rules, velocityLookback, searchConfig);
        if (onSaveLogistics) onSaveLogistics(logistics);
        setIsSaved(true);
    };

    const getPlatformColor = (name: string, savedColor?: string) => {
        if (savedColor) return savedColor;
        const lower = name.toLowerCase();
        if (lower.includes('amazon')) return '#FF9900';
        if (lower.includes('ebay')) return '#E53238';
        if (lower.includes('temu')) return '#FB7701';
        if (lower.includes('manomano')) return '#00D09C';
        if (lower.includes('wayfair')) return '#7F187F';
        return '#374151';
    };

    const platformKeys = Object.keys(rules).sort();

    return (
        <div className="max-w-6xl mx-auto pb-10 flex flex-col">

            {/* Updated Tab Navigation (Strict Match with Definitions Page) */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
                <button
                    onClick={() => setActiveTab('platforms')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'platforms' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Globe className="w-4 h-4" />
                    Platform Rules
                </button>

                <button
                    onClick={() => setActiveTab('logistics')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'logistics' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Truck className="w-4 h-4" />
                    Logistics Rates
                </button>

                <button
                    onClick={() => setActiveTab('analysis')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'analysis' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <BarChart2 className="w-4 h-4" />
                    Analysis Logic
                </button>

                <button
                    onClick={() => setActiveTab('thresholds')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'thresholds' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <AlertTriangle className="w-4 h-4" />
                    Alerts & Diagnostics
                </button>

                <button
                    onClick={() => setActiveTab('search')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'search' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Search className="w-4 h-4" />
                    Search Settings
                </button>
            </div>

            <div className="pr-2">
                {/* Platform Settings Section */}
                {activeTab === 'platforms' && (
                    <div className="space-y-6">
                        {/* ... Content remains unchanged ... */}
                        <div>
                            <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Platform Configuration</h2>
                            <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>Configure fees, capabilities, and strategic adjustments per marketplace.</p>
                        </div>

                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                            <div className="border-b border-custom-glass p-4 flex items-start gap-3" style={{ backgroundColor: `${themeColor}08` }}>
                                <Info className="w-5 h-5 mt-0.5" style={{ color: themeColor }} />
                                <div className="text-sm" style={{ color: themeColor }}>
                                    <p className="font-semibold">How these settings affect analysis:</p>
                                    <p className="mt-1">
                                        <strong>Ads Supported:</strong> Enables "Organic Share" calculation and TACoS logic for this platform.<br />
                                        <strong>Exclude from Global Average:</strong> If checked, sales from this platform (e.g. Wayfair, FBA) will NOT affect the "Current Price" or "Velocity" used for strategy calculations.
                                    </p>
                                </div>
                            </div>

                            <div className="p-6">
                                <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50/50 rounded-lg text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                    <div className="col-span-3">Platform</div>
                                    <div className="col-span-2 text-center">Commission (%)</div>
                                    <div className="col-span-2 text-center">Markup (%)</div>
                                    <div className="col-span-2">Manager</div>
                                    <div className="col-span-1 text-center">Ads?</div>
                                    <div className="col-span-1 text-center">Global Avg</div>
                                    <div className="col-span-1"></div>
                                </div>

                                <div className="space-y-3">
                                    {platformKeys.map((platform) => {
                                        const currentColor = getPlatformColor(platform, rules[platform].color);
                                        const isExcluded = rules[platform].isExcluded;
                                        const adsEnabled = isAdsEnabled(platform);

                                        return (
                                            <div key={platform} className={`grid grid-cols-12 gap-4 items-center p-4 rounded-lg border transition-colors group ${isExcluded ? 'bg-gray-50/80 border-gray-200 opacity-90' : 'bg-white/80 border-gray-100 hover:border-gray-200'}`}>
                                                <div className="col-span-3 flex items-center gap-3">
                                                    <div className="relative group/icon cursor-pointer">
                                                        <input
                                                            type="color"
                                                            value={currentColor}
                                                            onChange={(e) => handleColorChange(platform, e.target.value)}
                                                            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10"
                                                            title="Click to change platform color"
                                                        />
                                                        <div
                                                            className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-bold shadow-sm text-white transition-colors"
                                                            style={{ backgroundColor: currentColor }}
                                                        >
                                                            {platform[0].toUpperCase()}
                                                        </div>
                                                    </div>
                                                    <div className="flex flex-col">
                                                        <span className="font-semibold text-gray-800 text-sm truncate" title={platform}>{platform}</span>
                                                        {isExcluded && <span className="text-[10px] text-gray-500">Excluded from Avg</span>}
                                                    </div>
                                                </div>

                                                <div className="col-span-2 flex items-center justify-center">
                                                    <div className="relative w-full max-w-[100px]">
                                                        <input
                                                            type="number"
                                                            min="0"
                                                            step="0.1"
                                                            value={rules[platform].commission}
                                                            onChange={(e) => handleCommissionChange(platform, e.target.value)}
                                                            className="w-full pl-7 pr-3 py-2 text-right border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 font-mono text-gray-900 transition-colors text-sm bg-white/50"
                                                            style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                                        />
                                                        <Coins className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-3" />
                                                    </div>
                                                </div>

                                                <div className="col-span-2 flex items-center justify-center">
                                                    <div className="relative w-full max-w-[100px]">
                                                        <input
                                                            type="number"
                                                            step="0.1"
                                                            value={rules[platform].markup}
                                                            onChange={(e) => handleMarkupChange(platform, e.target.value)}
                                                            className="w-full pl-7 pr-3 py-2 text-right border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 font-mono text-gray-900 transition-colors text-sm bg-white/50"
                                                            style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                                        />
                                                        <Percent className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-3" />
                                                    </div>
                                                </div>

                                                <div className="col-span-2">
                                                    <div className="relative w-full">
                                                        <input
                                                            type="text"
                                                            placeholder="Unassigned"
                                                            value={rules[platform].manager || ''}
                                                            onChange={(e) => handleManagerChange(platform, e.target.value)}
                                                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 text-gray-900 transition-colors text-sm bg-white/50"
                                                            style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                                        />
                                                        <User className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                                                    </div>
                                                </div>
                                                
                                                <div className="col-span-1 flex justify-center">
                                                    <button
                                                        onClick={() => toggleAdsSupported(platform)}
                                                        className={`p-2 rounded-lg transition-colors ${adsEnabled ? 'bg-orange-100 text-orange-700' : 'bg-gray-200 text-gray-400'}`}
                                                        title={adsEnabled ? "Ads Enabled: Costs tracked" : "Ads Disabled: Costs ignored"}
                                                    >
                                                        <Megaphone className="w-4 h-4" />
                                                    </button>
                                                </div>

                                                <div className="col-span-1 flex justify-center">
                                                    <button
                                                        onClick={() => toggleExclusion(platform)}
                                                        className={`p-2 rounded-lg transition-colors ${!isExcluded ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-500'}`}
                                                        title={isExcluded ? "Click to INCLUDE in Global Average" : "Click to EXCLUDE from Global Average"}
                                                    >
                                                        {!isExcluded ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                                    </button>
                                                </div>

                                                <div className="col-span-1 flex justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                                    <button
                                                        onClick={() => handleDeletePlatform(platform)}
                                                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                        title="Remove Platform"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>

                                <div className="mt-6 pt-6 border-t border-gray-100">
                                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Add New Platform</h3>
                                    <div className="flex gap-3 relative">
                                        <div className="relative flex-1 max-w-sm">
                                            <input
                                                type="text"
                                                list="platform-suggestions"
                                                placeholder="Enter platform name (e.g. Shopify)"
                                                value={newPlatformName}
                                                onChange={(e) => setNewPlatformName(e.target.value)}
                                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 bg-white/50"
                                                style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                            />
                                            <datalist id="platform-suggestions">
                                                {discoveredPlatforms.filter(p => !rules[p]).map(p => (
                                                    <option key={p} value={p} />
                                                ))}
                                            </datalist>
                                        </div>
                                        <button
                                            onClick={handleAddPlatform}
                                            disabled={!newPlatformName}
                                            className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                                        >
                                            <Plus className="w-4 h-4" />
                                            Add Platform
                                        </button>
                                    </div>
                                    <p className="text-[10px] text-gray-400 mt-2">
                                        Tip: Use the autocomplete to match platform names exactly as they appear in your imported files.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Logistics Settings Section */}
                {activeTab === 'logistics' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-start">
                            <div>
                                <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Logistics Rate Cards</h2>
                                <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>Define shipping rates, weight limits, and dimensions for your carriers.</p>
                            </div>
                            <button
                                onClick={handleAutoCalibrate}
                                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-md transition-colors flex items-center gap-2"
                                title={shipmentHistory.length > 0 ? `Calibrate using ${shipmentHistory.length} records` : "No shipment history available"}
                            >
                                <Calculator className="w-4 h-4" />
                                Auto-Calibrate from History
                            </button>
                        </div>

                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                            <div className="p-6">
                                <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50/50 rounded-lg text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                                    <div className="col-span-4">Service Name / Code</div>
                                    <div className="col-span-2">Carrier</div>
                                    <div className="col-span-2 text-right">Rate (£)</div>
                                    <div className="col-span-2 text-right">Max Weight (kg)</div>
                                    <div className="col-span-2 text-right">Max Length (cm)</div>
                                </div>

                                <div className="space-y-2">
                                    {logistics.map((rule) => (
                                        <div key={rule.id} className="grid grid-cols-12 gap-4 items-center p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50/50 transition-colors bg-white/50">
                                            <div className="col-span-4 font-mono font-bold text-sm text-gray-700">
                                                {rule.name}
                                            </div>
                                            <div className="col-span-2">
                                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                                    {rule.carrier}
                                                </span>
                                            </div>
                                            <div className="col-span-2">
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.01"
                                                        value={rule.price || ''}
                                                        placeholder="0.00"
                                                        onChange={(e) => handleLogisticsChange(rule.id, 'price', e.target.value)}
                                                        className="w-full pl-6 pr-3 py-1.5 text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-opacity-50 font-bold text-gray-900 text-sm bg-white"
                                                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                                    />
                                                    <span className="absolute left-2 top-1.5 text-gray-400 text-xs">£</span>
                                                </div>
                                            </div>
                                            <div className="col-span-2">
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="0.1"
                                                        value={rule.maxWeight || ''}
                                                        placeholder="-"
                                                        onChange={(e) => handleLogisticsChange(rule.id, 'maxWeight', e.target.value)}
                                                        className="w-full pl-3 pr-8 py-1.5 text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-opacity-50 text-sm bg-white"
                                                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                                    />
                                                    <Scale className="w-3 h-3 text-gray-400 absolute right-2 top-2" />
                                                </div>
                                            </div>
                                            <div className="col-span-2">
                                                <div className="relative">
                                                    <input
                                                        type="number"
                                                        min="0"
                                                        step="1"
                                                        value={rule.maxLength || ''}
                                                        placeholder="-"
                                                        onChange={(e) => handleLogisticsChange(rule.id, 'maxLength', e.target.value)}
                                                        className="w-full pl-3 pr-8 py-1.5 text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-opacity-50 text-sm bg-white"
                                                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                                    />
                                                    <Ruler className="w-3 h-3 text-gray-400 absolute right-2 top-2" />
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Analysis Logic Section */}
                {activeTab === 'analysis' && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Analysis Logic</h2>
                            <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                                Control how the system interprets historical sales data to calculate velocity and trends.
                            </p>
                        </div>

                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                            <div className="p-6">
                                <div className="flex flex-col gap-6">
                                    <div className="flex flex-col md:flex-row gap-6">
                                        <div className="flex-1">
                                            <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                                                <Calendar className="w-4 h-4 text-indigo-600" />
                                                Velocity Lookback Window
                                            </label>
                                            <p className="text-xs text-gray-500 mb-3">
                                                Determines how many days of recent history are used to calculate "Average Daily Sales".
                                                Changing this will instantly update the stock runway and restocking recommendations for all products.
                                            </p>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                                                {[
                                                    { val: '7', label: 'Last 7 Days', desc: 'Highly sensitive. Good for fast-moving goods.' },
                                                    { val: '30', label: 'Last 30 Days', desc: 'Balanced. Recommended for general retail.' },
                                                    { val: '60', label: 'Last 60 Days', desc: 'Smoothed. Reduces noise from short spikes.' },
                                                    { val: '90', label: 'Last 90 Days', desc: 'Conservative. Good for slow-movers.' },
                                                    { val: 'ALL', label: 'Full History', desc: 'Maximum data. Uses all imported logs.' }
                                                ].map((opt) => (
                                                    <button
                                                        key={opt.val}
                                                        onClick={() => setVelocityLookback(opt.val as VelocityLookback)}
                                                        className={`text-left p-3 rounded-lg border transition-all ${velocityLookback === opt.val
                                                                ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                                                                : 'border-gray-200 hover:border-indigo-200 hover:bg-gray-50/50 bg-white/50'
                                                            }`}
                                                    >
                                                        <div className={`font-bold text-sm mb-1 ${velocityLookback === opt.val ? 'text-indigo-700' : 'text-gray-700'}`}>
                                                            {opt.label}
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 leading-tight">
                                                            {opt.desc}
                                                        </div>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4 flex gap-3">
                                        <Info className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                                        <div className="text-sm text-blue-800">
                                            <p className="font-bold mb-1">Impact on "Rising Stars"</p>
                                            <p>
                                                The "Rising Stars" chart on the dashboard compares the velocity of the selected window (e.g., Last 30 Days) against the
                                                <strong> immediately preceding period</strong> of the same length (e.g., Days 31-60).
                                                Selecting a shorter window makes the system more responsive to recent trend changes.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* Thresholds Settings Section */}
                {activeTab === 'thresholds' && (
                    <AlertThresholdSettings themeColor={themeColor} />
                )}

                {/* Search Settings Section */}
                {activeTab === 'search' && (
                    <div className="space-y-6">
                        <div>
                            <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Search Result Settings</h2>
                            <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                                Fine-tune how search results are visualized and banded.
                            </p>
                        </div>

                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                                            <BarChart2 className="w-5 h-5" />
                                        </div>
                                        <h3 className="font-bold text-gray-900">Volume Distribution Bands</h3>
                                    </div>
                                    <p className="text-sm text-gray-500 mb-4">
                                        Configure the percentile thresholds used to classify sales volume into Top, Middle, and Bottom tiers in the Volume View.
                                    </p>
                                    
                                    <div className="space-y-4">
                                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                            <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Top Band Threshold (%)</label>
                                            <div className="flex items-center gap-3">
                                                <input 
                                                    type="number" 
                                                    min="1" max="99" 
                                                    value={searchConfig.volumeBands.topPercentile}
                                                    onChange={e => setSearchConfig({...searchConfig, volumeBands: {...searchConfig.volumeBands, topPercentile: parseFloat(e.target.value)}})}
                                                    className="w-20 border rounded p-2 text-sm font-bold text-gray-900"
                                                />
                                                <span className="text-sm text-gray-600">The top {searchConfig.volumeBands.topPercentile}% of products by volume</span>
                                            </div>
                                        </div>

                                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                            <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Bottom Band Threshold (%)</label>
                                            <div className="flex items-center gap-3">
                                                <input 
                                                    type="number" 
                                                    min="1" max="99" 
                                                    value={searchConfig.volumeBands.bottomPercentile}
                                                    onChange={e => setSearchConfig({...searchConfig, volumeBands: {...searchConfig.volumeBands, bottomPercentile: parseFloat(e.target.value)}})}
                                                    className="w-20 border rounded p-2 text-sm font-bold text-gray-900"
                                                />
                                                <span className="text-sm text-gray-600">The bottom {searchConfig.volumeBands.bottomPercentile}% of products by volume</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <div>
                                    <div className="flex items-center gap-2 mb-4">
                                        <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                                            <Scale className="w-5 h-5" />
                                        </div>
                                        <h3 className="font-bold text-gray-900">Minimum Volume Floor</h3>
                                    </div>
                                    <p className="text-sm text-gray-500 mb-4">
                                        Define the absolute minimum sales quantity required to enable scale coloring. If the max volume in a result set is below this, distribution bands are disabled.
                                    </p>

                                    <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                        <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Absolute Floor (Units)</label>
                                        <div className="flex items-center gap-3">
                                            <input 
                                                type="number" 
                                                min="0"
                                                value={searchConfig.minAbsoluteFloor}
                                                onChange={e => setSearchConfig({...searchConfig, minAbsoluteFloor: parseFloat(e.target.value)})}
                                                className="w-20 border rounded p-2 text-sm font-bold text-gray-900"
                                            />
                                            <span className="text-sm text-gray-600">units</span>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-2">
                                            Prevents misleading "Top Performer" badges on low-volume data sets (e.g. daily views).
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

            </div>

            {/* Footer Actions (Sticky) */}
            <div className="pt-6 border-t border-custom-glass flex justify-end">
                {activeTab !== 'thresholds' && (
                    <button
                        onClick={handleSave}
                        disabled={isSaved}
                        className={`px-8 py-3 rounded-lg font-medium shadow-md transition-all flex items-center gap-2 text-white`}
                        style={{ backgroundColor: isSaved ? '#16a34a' : themeColor }}
                    >
                        {isSaved ? (
                            <>Saved Successfully</>
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                Save All Changes
                            </>
                        )}
                    </button>
                )}
            </div>

        </div>
    );
};

export default SettingsPage;