import React, { useState, useEffect, useRef } from 'react';
import { PricingRules, Platform, Product, PriceLog, PromotionEvent, LogisticsRule, ShipmentLog } from '../types';
import { Save, Percent, Coins, Info, Plus, Trash2, User, Globe, Truck, Calculator, Scale, Ruler } from 'lucide-react';

interface SettingsPageProps {
  currentRules: PricingRules;
  onSave: (rules: PricingRules) => void;
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
}

const SettingsPage: React.FC<SettingsPageProps> = ({ currentRules, onSave, logisticsRules = [], onSaveLogistics, products, extraData, shipmentHistory = [], themeColor, headerStyle }) => {
  const [activeTab, setActiveTab] = useState<'platforms' | 'logistics'>('platforms');
  const [rules, setRules] = useState<PricingRules>(JSON.parse(JSON.stringify(currentRules)));
  const [logistics, setLogistics] = useState<LogisticsRule[]>(JSON.parse(JSON.stringify(logisticsRules)));
  const [newPlatformName, setNewPlatformName] = useState('');
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (isSaved) {
        const timer = setTimeout(() => setIsSaved(false), 2000);
        return () => clearTimeout(timer);
    }
  }, [isSaved]);

  // Sync state with props if they change externally (e.g. after restore)
  useEffect(() => {
      setRules(JSON.parse(JSON.stringify(currentRules)));
      setLogistics(JSON.parse(JSON.stringify(logisticsRules)));
  }, [currentRules, logisticsRules]);

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

  const handleAddPlatform = () => {
    if (newPlatformName && !rules[newPlatformName]) {
      setRules(prev => ({
        ...prev,
        [newPlatformName]: { 
            markup: 0, 
            commission: 0, 
            manager: 'Unassigned',
            color: '#374151' // Default gray
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
    onSave(rules);
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
    <div className="max-w-6xl mx-auto pb-10 flex flex-col h-[calc(100vh-100px)]">
      
      {/* Tab Navigation */}
      <div className="flex justify-center mb-6">
          <div className="bg-gray-100 p-1 rounded-xl inline-flex shadow-inner">
              <button 
                onClick={() => setActiveTab('platforms')}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'platforms' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  <Globe className="w-4 h-4" />
                  Platform Rules
              </button>
              <button 
                onClick={() => setActiveTab('logistics')}
                className={`px-6 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'logistics' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
              >
                  <Truck className="w-4 h-4" />
                  Logistics Rates
              </button>
          </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto pr-2">
      {/* Platform Settings Section */}
      {activeTab === 'platforms' && (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Platform Configuration</h2>
                <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>Configure commission fees, strategic markups, and default managers for each marketplace.</p>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="border-b p-4 flex items-start gap-3" style={{ backgroundColor: `${themeColor}08`, borderColor: `${themeColor}20` }}>
                    <Info className="w-5 h-5 mt-0.5" style={{ color: themeColor }} />
                    <div className="text-sm" style={{ color: themeColor }}>
                        <p className="font-semibold">How these settings affect analysis:</p>
                        <p className="mt-1">
                            <strong>Commission Fee:</strong> Deducted from the selling price during AI analysis.<br/>
                            <strong>Default Manager:</strong> Automatically assigned to new products or imports if no manager is specified in the CSV.
                        </p>
                    </div>
                </div>

                <div className="p-6">
                    <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 rounded-lg text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        <div className="col-span-3">Platform</div>
                        <div className="col-span-2 text-center">Commission (%)</div>
                        <div className="col-span-2 text-center">Markup (%)</div>
                        <div className="col-span-4">Default Manager</div>
                        <div className="col-span-1"></div>
                    </div>

                    <div className="space-y-3">
                        {platformKeys.map((platform) => {
                            const currentColor = getPlatformColor(platform, rules[platform].color);

                            return (
                                <div key={platform} className="grid grid-cols-12 gap-4 items-center p-4 rounded-lg border border-gray-100 hover:border-gray-200 transition-colors group">
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
                                                className="w-full pl-7 pr-3 py-2 text-right border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 font-mono text-gray-900 transition-colors text-sm"
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
                                                className="w-full pl-7 pr-3 py-2 text-right border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 font-mono text-gray-900 transition-colors text-sm"
                                                style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                            />
                                            <Percent className="w-3.5 h-3.5 text-gray-400 absolute left-2 top-3" />
                                        </div>
                                    </div>

                                    <div className="col-span-4">
                                        <div className="relative w-full">
                                            <input
                                                type="text"
                                                placeholder="Unassigned"
                                                value={rules[platform].manager || ''}
                                                onChange={(e) => handleManagerChange(platform, e.target.value)}
                                                className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 text-gray-900 transition-colors text-sm"
                                                style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                                            />
                                            <User className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
                                        </div>
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
                        <div className="flex gap-3">
                            <input 
                                type="text" 
                                placeholder="Enter platform name (e.g. Shopify)" 
                                value={newPlatformName}
                                onChange={(e) => setNewPlatformName(e.target.value)}
                                className="flex-1 max-w-sm px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50"
                                style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                            />
                            <button 
                                onClick={handleAddPlatform}
                                disabled={!newPlatformName}
                                className="px-4 py-2 bg-gray-900 text-white rounded-lg font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                            >
                                <Plus className="w-4 h-4" />
                                Add Platform
                            </button>
                        </div>
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

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="p-6">
                    <div className="grid grid-cols-12 gap-4 px-4 py-3 bg-gray-50 rounded-lg text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
                        <div className="col-span-4">Service Name / Code</div>
                        <div className="col-span-2">Carrier</div>
                        <div className="col-span-2 text-right">Rate (£)</div>
                        <div className="col-span-2 text-right">Max Weight (kg)</div>
                        <div className="col-span-2 text-right">Max Length (cm)</div>
                    </div>

                    <div className="space-y-2">
                        {logistics.map((rule) => (
                            <div key={rule.id} className="grid grid-cols-12 gap-4 items-center p-3 rounded-lg border border-gray-100 hover:border-gray-200 hover:bg-gray-50 transition-colors">
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
                                            className="w-full pl-6 pr-3 py-1.5 text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-opacity-50 font-bold text-gray-900 text-sm"
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
                                            className="w-full pl-3 pr-8 py-1.5 text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-opacity-50 text-sm"
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
                                            className="w-full pl-3 pr-8 py-1.5 text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-opacity-50 text-sm"
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
      </div>

      {/* Footer Actions (Sticky) */}
      <div className="pt-6 border-t border-gray-200 flex justify-end">
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
       </div>

    </div>
  );
};

export default SettingsPage;