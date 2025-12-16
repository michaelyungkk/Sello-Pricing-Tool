
import React, { useState, useEffect, useRef } from 'react';
import { PricingRules, Platform, Product, PriceLog, PromotionEvent } from '../types';
import { Save, Percent, Coins, Info, Plus, Trash2, User, Download, Upload, Database, AlertCircle, Palette, CheckCircle, RefreshCcw, Trash, Link as LinkIcon } from 'lucide-react';
import { INITIAL_PRODUCTS, MOCK_PRICE_HISTORY, MOCK_PROMOTIONS, DEFAULT_PRICING_RULES } from '../constants';

interface SettingsPageProps {
  currentRules: PricingRules;
  onSave: (rules: PricingRules) => void;
  products: Product[];
  onRestore: (data: { products: Product[], rules: PricingRules, history?: PriceLog[], promotions?: PromotionEvent[] }) => void;
  extraData?: {
      priceHistory: PriceLog[];
      promotions: PromotionEvent[];
  };
  themeColor: string;
  headerStyle: React.CSSProperties;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ currentRules, onSave, products, onRestore, extraData, themeColor, headerStyle }) => {
  const [rules, setRules] = useState<PricingRules>(JSON.parse(JSON.stringify(currentRules)));
  const [newPlatformName, setNewPlatformName] = useState('');
  const [isSaved, setIsSaved] = useState(false);
  const [restoreStatus, setRestoreStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isSaved) {
        const timer = setTimeout(() => setIsSaved(false), 2000);
        return () => clearTimeout(timer);
    }
  }, [isSaved]);

  useEffect(() => {
    if (restoreStatus === 'success') {
        const timer = setTimeout(() => setRestoreStatus('idle'), 3000);
        return () => clearTimeout(timer);
    }
  }, [restoreStatus]);

  // Sync state with props if they change externally (e.g. after restore)
  useEffect(() => {
      setRules(JSON.parse(JSON.stringify(currentRules)));
  }, [currentRules]);

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

  const handleSave = () => {
    onSave(rules);
    setIsSaved(true);
  };

  const handleExportBackup = () => {
    const backupData = {
      products,
      rules,
      priceHistory: extraData?.priceHistory || [],
      promotions: extraData?.promotions || [],
      timestamp: new Date().toISOString()
    };
    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecompulse_backup_${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportBackup = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // IMPORTANT: Reset input value immediately so same file can be selected again
    e.target.value = '';

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const result = event.target?.result;
        if (typeof result !== 'string') throw new Error("Failed to read file");

        const json = JSON.parse(result);
        
        // Strict Validation
        if (!json || typeof json !== 'object') throw new Error("Invalid file format");
        if (!Array.isArray(json.products)) throw new Error("Backup file missing 'products' list");
        if (!json.rules || typeof json.rules !== 'object') throw new Error("Backup file missing 'rules' configuration");

        // Executing restore immediately to avoid 'window.confirm' issues in some environments
        onRestore({ 
            products: json.products, 
            rules: json.rules,
            history: json.priceHistory, // Restore history
            promotions: json.promotions // Restore promotions
        });
        // We do NOT setRules here because onRestore will trigger a prop update which useEffect handles
        setRestoreStatus('success');
        
      } catch (err: any) {
        console.error(err);
        alert(`Failed to restore data: ${err.message || "Unknown error"}`);
        setRestoreStatus('error');
      }
    };
    
    reader.onerror = () => {
        alert("Error reading file");
        setRestoreStatus('error');
    };

    reader.readAsText(file);
  };

  const getPlatformColor = (name: string, savedColor?: string) => {
    if (savedColor) return savedColor;
    
    // Fallback logic for legacy data if color is missing
    const lower = name.toLowerCase();
    if (lower.includes('amazon')) return '#FF9900';
    if (lower.includes('ebay')) return '#E53238';
    if (lower.includes('temu')) return '#FB7701';
    if (lower.includes('manomano')) return '#00D09C';
    if (lower.includes('wayfair')) return '#7F187F';
    return '#374151'; // gray-700
  };

  const platformKeys = Object.keys(rules).sort();

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-10">
      
      {/* Platform Settings Section */}
      <div>
        <div className="mb-6">
            <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Platform Configuration</h2>
            <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>Configure commission fees, strategic markups, and default managers for each marketplace.</p>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
            {/* Helper Banner */}
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
                            
                            {/* Platform Name & Icon */}
                            <div className="col-span-3 flex items-center gap-3">
                                <div className="relative group/icon cursor-pointer">
                                    {/* Invisible color input covering the icon */}
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

                                    {/* Edit indicator */}
                                    <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5 shadow border border-gray-100 opacity-0 group-hover/icon:opacity-100 transition-opacity z-0 pointer-events-none">
                                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: themeColor }}></div>
                                    </div>
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-semibold text-gray-800 text-sm truncate" title={platform}>{platform}</span>
                                    <span className="text-[10px] text-gray-400 group-hover:text-gray-500 transition-colors">Click icon to recolor</span>
                                </div>
                            </div>

                            {/* Commission Input */}
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

                            {/* Markup Input */}
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

                            {/* Manager Input */}
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
                            
                            {/* Delete Action */}
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

            {/* Add New Platform Section */}
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

            {/* Footer Actions */}
            <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end">
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
                        Save Configuration
                    </>
                )}
            </button>
            </div>
        </div>
      </div>

      {/* Data Backup Section */}
      <div>
         <div className="mb-6">
            <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Database Management</h2>
            <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>Backup your work or restore previous states.</p>
         </div>

         <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
             <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide border-b border-gray-100 pb-4 mb-4">Backup & Restore</h3>
             
             <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Export */}
                <div className="flex flex-col gap-3 p-5 rounded-lg border border-gray-200 bg-gray-50 hover:border-gray-300 transition-colors items-center text-center">
                    <div className="p-3 bg-blue-100 rounded-full text-blue-600">
                       <Download className="w-6 h-6" />
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-900 mb-1">Backup Data</h4>
                        <p className="text-xs text-gray-500">
                            Save all products, history, promotions, and settings to a JSON file.
                        </p>
                    </div>
                    <button 
                        onClick={handleExportBackup}
                        className="w-full mt-2 px-3 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100 flex items-center justify-center gap-2"
                    >
                        Export JSON
                    </button>
                </div>

                {/* Import */}
                <div className="flex flex-col gap-3 p-5 rounded-lg border border-gray-200 bg-gray-50 hover:border-gray-300 transition-colors items-center text-center">
                    <div className="p-3 bg-purple-100 rounded-full text-purple-600">
                       <Upload className="w-6 h-6" />
                    </div>
                    <div>
                        <h4 className="font-bold text-gray-900 mb-1">Restore Data</h4>
                        <p className="text-xs text-gray-500">
                            Overwrite current data with a previously saved backup file.
                        </p>
                    </div>
                    <div className="relative w-full mt-2">
                        <input 
                            ref={fileInputRef}
                            type="file" 
                            accept=".json"
                            onChange={handleImportBackup}
                            className="hidden"
                        />
                        <button 
                            onClick={() => fileInputRef.current?.click()}
                            disabled={restoreStatus === 'success'}
                            className="w-full px-3 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-100 flex items-center justify-center gap-2"
                        >
                            {restoreStatus === 'success' ? 'Restored Successfully!' : 'Select File'}
                        </button>
                    </div>
                </div>
             </div>

             <div className="mt-6 pt-4 border-t border-gray-100 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 p-3 rounded-lg">
                <AlertCircle className="w-4 h-4" />
                <span><strong>Note:</strong> Data is stored in your browser's Local Storage. Clearing your browser cache will also wipe this data.</span>
             </div>
         </div>
      </div>

    </div>
  );
};

export default SettingsPage;
