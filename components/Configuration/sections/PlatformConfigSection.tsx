
import React from 'react';
import { PricingRules, Platform, PlatformConfig } from '../../../types';
import { Info, Plus, ShieldCheck, EyeOff, Trash2, Megaphone, Percent, Coins } from 'lucide-react';

interface PlatformConfigSectionProps {
    rules: PricingRules;
    platformKeys: string[];
    discoveredPlatforms: string[];
    newPlatformName: string;
    setNewPlatformName: (name: string) => void;
    handleAddPlatform: () => void;
    handleFieldChange: (platform: Platform, field: keyof PlatformConfig, value: any) => void;
    toggleExclusion: (platform: Platform) => void;
    toggleAdsSupported: (platform: Platform) => void;
    handleDeletePlatform: (platform: Platform) => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
}

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

export const PlatformConfigSection: React.FC<PlatformConfigSectionProps> = ({
    rules, platformKeys, discoveredPlatforms, newPlatformName, setNewPlatformName,
    handleAddPlatform, handleFieldChange, toggleExclusion, toggleAdsSupported, handleDeletePlatform,
    themeColor, headerStyle
}) => {
    return (
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
                                            title={isExcluded ? "Excluded from Global Averages" : "Included in Global Averages"}
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
    );
};
