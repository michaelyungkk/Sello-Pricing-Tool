import React, { useState, useEffect, useRef, useMemo } from 'react';
import { PricingRules, Platform, Product, PriceLog, PromotionEvent, LogisticsRule, ShipmentLog, VelocityLookback, SearchConfig, PlatformConfig } from '../types';
import { Save, Percent, Coins, Info, Plus, Trash2, User, Globe, Truck, Calculator, Scale, Ruler, Eye, EyeOff, BarChart2, Search, Megaphone, AlertTriangle, Settings2, ShieldCheck, CreditCard } from 'lucide-react';
import { isAdsEnabled, setAdsCapability, ensureCapabilities } from '../services/platformCapabilities';
import AlertThresholdSettings from './AlertThresholdSettings';
import { useTranslation } from 'react-i18next';

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
    onRefreshThresholds?: () => void; // New callback for sync
}

const SettingsPage: React.FC<SettingsPageProps> = ({ currentRules, onSave, logisticsRules = [], onSaveLogistics, products, extraData, shipmentHistory = [], themeColor, headerStyle, searchConfig: initialSearchConfig, velocityLookback: initialVelocityLookback, onRefreshThresholds }) => {
    const { t } = useTranslation();
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
        products.forEach(p => p.channels.forEach(c => add(c.platform)));
        function add(p: string) { set.add(p); }
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

    const handleFieldChange = (platform: Platform, field: keyof PlatformConfig, value: any) => {
        setRules(prev => {
            const updatedPlatform = { ...prev[platform], [field]: value };
            
            // Validation: Clear attribution if ads disabled
            if (field === 'adsEnabled' && value === false) {
                updatedPlatform.adsAttribution = undefined;
            }
            
            // Updated timestamp
            updatedPlatform.updatedAt = new Date().toISOString();

            return {
                ...prev,
                [platform]: updatedPlatform
            };
        });
    };

    const toggleExclusion = (platform: Platform) => {
        handleFieldChange(platform, 'isExcluded', !rules[platform].isExcluded);
    };
    
    const toggleAdsSupported = (platform: Platform) => {
        const current = rules[platform].adsEnabled;
        handleFieldChange(platform, 'adsEnabled', !current);
        if (!current) {
            handleFieldChange(platform, 'adsAttribution', 'SKU_LEVEL');
        }
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
                    isExcluded: false,
                    pricingControl: 'MERCHANT',
                    feeModel: 'COMMISSION_PCT',
                    adsEnabled: false,
                    updatedAt: new Date().toISOString()
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
        <div className="max-w-[1600px] mx-auto pb-10 flex flex-col">

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
                        <div>
                            <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Platform Configuration</h2>
                            <p className="mt-1 text-sm transition-colors opacity-80" style={headerStyle}>
                                Platform Configuration controls platform-level commercial rules (fees, pricing control, and ads).<br />
                                Promotion rules remain in Promotions.
                            </p>
                        </div>

                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                            <div className="border-b border-custom-glass p-4 flex items-start gap-3" style={{ backgroundColor: `${themeColor}08` }}>
                                <Info className="w-5 h-5 mt-0.5" style={{ color: themeColor }} />
                                <div className="text-sm" style={{ color: themeColor }}>
                                    <p className="font-semibold">Commercial Logic Controls:</p>
                                    <p className="mt-1">
                                        <strong>Pricing Control:</strong> Defines who owns the final price point. MERCHANT gives full control to the engine.
                                    </p>
                                </div>
                            </div>

                            <div className="p-6">
                                <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50/50 rounded-lg text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">
                                    <div className="col-span-3">Platform / Manager</div>
                                    <div className="col-span-2">Pricing Control</div>
                                    <div className="col-span-3">Fee Model & Rate</div>
                                    <div className="col-span-1 text-center">Ads?</div>
                                    <div className="col-span-2">Ad Attribution</div>
                                    <div className="col-span-1"></div>
                                </div>

                                <div className="space-y-3">
                                    {platformKeys.map((platform) => {
                                        const config = rules[platform];
                                        const currentColor = getPlatformColor(platform, config.color);
                                        const isExcluded = config.isExcluded;
                                        const adsEnabled = config.adsEnabled;
                                        
                                        // Effective fallbacks for legacy data
                                        const effectiveFeeModel = config.feeModel || 'COMMISSION_PCT';
                                        const effectivePricingControl = config.pricingControl || 'MERCHANT';

                                        return (
                                            <div key={platform} className={`grid grid-cols-12 gap-4 items-center p-4 rounded-lg border transition-colors group ${isExcluded ? 'bg-gray-50/80 border-gray-200 opacity-90' : 'bg-white/80 border-gray-100 hover:border-gray-200'}`}>
                                                {/* 1. Platform Info */}
                                                <div className="col-span-3 flex items-center gap-3">
                                                    <div className="relative group/icon cursor-pointer flex-shrink-0">
                                                        <input
                                                            type="color"
                                                            value={currentColor}
                                                            onChange={(e) => handleFieldChange(platform, 'color', e.target.value)}
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
                                                    <div className="flex flex-col min-w-0">
                                                        <span className="font-semibold text-gray-800 text-sm truncate" title={platform}>{platform}</span>
                                                        <input
                                                            type="text"
                                                            placeholder="Unassigned"
                                                            value={config.manager || ''}
                                                            onChange={(e) => handleFieldChange(platform, 'manager', e.target.value)}
                                                            className="text-[10px] bg-transparent border-none p-0 focus:ring-0 text-gray-500 uppercase font-bold"
                                                        />
                                                    </div>
                                                </div>

                                                {/* 2. Pricing Control */}
                                                <div className="col-span-2">
                                                    <select
                                                        value={effectivePricingControl}
                                                        onChange={(e) => handleFieldChange(platform, 'pricingControl', e.target.value)}
                                                        className="w-full text-xs border border-gray-300 rounded-lg py-1.5 px-2 bg-white/50 focus:ring-2"
                                                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                                    >
                                                        <option value="MERCHANT">Merchant Owned</option>
                                                        <option value="PLATFORM_COST_BASED">Platform Cost-Based</option>
                                                        <option value="HYBRID">Hybrid Model</option>
                                                    </select>
                                                </div>

                                                {/* 3. Fee Model & Input */}
                                                <div className="col-span-3 space-y-1.5">
                                                    <select
                                                        value={effectiveFeeModel}
                                                        onChange={(e) => handleFieldChange(platform, 'feeModel', e.target.value)}
                                                        className="w-full text-[10px] font-bold border border-gray-300 rounded-lg py-1 px-2 bg-white/50 focus:ring-2 uppercase"
                                                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                                    >
                                                        <option value="COMMISSION_PCT">Commission %</option>
                                                        <option value="FIXED_PER_ORDER">Fixed Per Order</option>
                                                        <option value="COST_BASED_MARKUP">Cost-Based Markup</option>
                                                        <option value="NONE">No Platform Fees</option>
                                                    </select>
                                                    
                                                    {effectiveFeeModel === 'COMMISSION_PCT' && (
                                                        <div className="relative animate-in fade-in zoom-in-95 duration-200">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.1"
                                                                value={config.commission}
                                                                onChange={(e) => handleFieldChange(platform, 'commission', parseFloat(e.target.value) || 0)}
                                                                className="w-full pl-7 pr-3 py-1.5 text-right border border-gray-300 rounded-lg focus:ring-2 font-mono text-gray-900 text-xs bg-white/80"
                                                                style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                                            />
                                                            <Percent className="w-3 h-3 text-gray-400 absolute left-2 top-2" />
                                                        </div>
                                                    )}
                                                    
                                                    {effectiveFeeModel === 'FIXED_PER_ORDER' && (
                                                        <div className="relative animate-in fade-in zoom-in-95 duration-200">
                                                            <input
                                                                type="number"
                                                                min="0"
                                                                step="0.01"
                                                                value={config.fixedFee || 0}
                                                                onChange={(e) => handleFieldChange(platform, 'fixedFee', parseFloat(e.target.value) || 0)}
                                                                className="w-full pl-7 pr-3 py-1.5 text-right border border-gray-300 rounded-lg focus:ring-2 font-mono text-gray-900 text-xs bg-white/80"
                                                                style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                                            />
                                                            <Coins className="w-3 h-3 text-gray-400 absolute left-2 top-2" />
                                                        </div>
                                                    )}
                                                </div>

                                                {/* 5. Ads Enabled Toggle */}
                                                <div className="col-span-1 flex justify-center">
                                                    <button
                                                        onClick={() => toggleAdsSupported(platform)}
                                                        className={`p-2 rounded-lg transition-all shadow-sm ${adsEnabled ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-gray-100 text-gray-400 border border-transparent'}`}
                                                        title={adsEnabled ? "Paid Ads Enabled" : "Ads Not Supported"}
                                                    >
                                                        <Megaphone className="w-4 h-4" />
                                                    </button>
                                                </div>

                                                {/* 6. Ads Attribution */}
                                                <div className="col-span-2">
                                                    {adsEnabled ? (
                                                        <select
                                                            value={config.adsAttribution || 'SKU_LEVEL'}
                                                            onChange={(e) => handleFieldChange(platform, 'adsAttribution', e.target.value)}
                                                            className="w-full text-[10px] font-bold border border-orange-200 rounded-lg py-1.5 px-2 bg-orange-50/30 focus:ring-2 uppercase"
                                                            style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                                        >
                                                            <option value="SKU_LEVEL">SKU Level</option>
                                                            <option value="LUMP_SUM">Lump Sum / Apportioned</option>
                                                        </select>
                                                    ) : (
                                                        <span className="text-[10px] text-gray-400 font-medium italic block text-center">N/A</span>
                                                    )}
                                                </div>

                                                {/* 7. Delete / Actions */}
                                                <div className="col-span-1 flex justify-end gap-2">
                                                    <button
                                                        onClick={() => toggleExclusion(platform)}
                                                        className={`p-1.5 rounded-lg transition-colors ${!isExcluded ? 'text-green-600 hover:bg-green-50' : 'text-gray-400 hover:bg-gray-100'}`}
                                                        title={isExcluded ? "Included in Global Averages" : "Excluded from Global Averages"}
                                                    >
                                                        {!isExcluded ? <ShieldCheck className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                                    </button>
                                                    <button
                                                        onClick={() => handleDeletePlatform(platform)}
                                                        className="p-1.5 text-gray-300 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
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

                {/* Thresholds Settings Section */}
                {activeTab === 'thresholds' && (
                    <AlertThresholdSettings themeColor={themeColor} onSaveComplete={onRefreshThresholds} />
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