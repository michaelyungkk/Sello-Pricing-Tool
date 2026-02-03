import React, { useState } from 'react';
import { StrategyConfig } from '../../../types';
import { Settings, Save, TrendingUp, TrendingDown, Info, AlertTriangle, Check } from 'lucide-react';

interface ConfigParametersPanelProps {
    config: StrategyConfig;
    setConfig: (config: StrategyConfig) => void;
    onSave: (config: StrategyConfig) => void;
    isConfigOpen: boolean;
    setIsConfigOpen: (v: boolean) => void;
}

export const ConfigParametersPanel: React.FC<ConfigParametersPanelProps> = ({ config, setConfig, onSave, isConfigOpen, setIsConfigOpen }) => {
    const [saved, setSaved] = useState(false);

    if (!isConfigOpen) return null;
    
    // Helper to safe cast string to float for inputs
    const setVal = (path: string[], val: string) => {
        const num = parseFloat(val);
        if (isNaN(num)) return;
        
        const newConfig = { ...config };
        let current: any = newConfig;
        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
        }
        current[path[path.length - 1]] = num;
        setConfig(newConfig);
    };

    const toggleBool = (path: string[]) => {
        const newConfig = { ...config };
        let current: any = newConfig;
        for (let i = 0; i < path.length - 1; i++) {
            current = current[path[i]];
        }
        current[path[path.length - 1]] = !current[path[path.length - 1]];
        setConfig(newConfig);
    };

    const handleSaveClick = () => {
        onSave(config);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    return (
        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden animate-in fade-in slide-in-from-top-4">
            <div className="border-b border-custom-glass bg-gray-50/50 p-4 flex justify-between items-center">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-gray-500" />
                    Configuration Parameters
                </h3>
                <button 
                    onClick={handleSaveClick} 
                    className={`text-xs px-3 py-1.5 rounded-lg flex items-center gap-1 transition-all duration-300 ${saved ? 'bg-green-600 text-white' : 'bg-gray-900 text-white hover:bg-gray-800'}`}
                >
                    {saved ? <Check className="w-3 h-3" /> : <Save className="w-3 h-3" />}
                    {saved ? 'Saved' : 'Save Defaults'}
                </button>
            </div>
            <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-8">
                {/* Increase Logic */}
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
                                    onChange={e => setVal(['increase', 'minRunwayWeeks'], e.target.value)} 
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
                                    onChange={e => setVal(['increase', 'minStock'], e.target.value)} 
                                    className="w-full border rounded p-1.5 text-sm bg-white/50" 
                                />
                            </div>
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-semibold text-gray-500 uppercase block mb-1">Past 7-Days QTY (Exclusion)</label>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-400">&le;</span>
                            <input 
                                type="number" 
                                value={config.increase.minVelocity7Days} 
                                onChange={e => setVal(['increase', 'minVelocity7Days'], e.target.value)} 
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
                                    onChange={e => setVal(['increase', 'adjustmentPercent'], e.target.value)} 
                                    className="w-full border rounded p-1 text-sm text-green-700 font-bold bg-white/80" 
                                />
                            </div>
                            <div className="flex-1">
                                <span className="text-[10px] text-gray-500">Fixed (£)</span>
                                <input 
                                    type="number" 
                                    value={config.increase.adjustmentFixed} 
                                    onChange={e => setVal(['increase', 'adjustmentFixed'], e.target.value)} 
                                    className="w-full border rounded p-1 text-sm text-green-700 font-bold bg-white/80" 
                                />
                            </div>
                        </div>
                        <p className="text-[10px] text-green-600 mt-1 italic">*Applies whichever is higher</p>
                    </div>
                </div>

                {/* Decrease Logic */}
                <div className="space-y-4 border-l border-r border-gray-200/50 px-6">
                    <div className="flex items-center gap-2 text-red-700 font-bold border-b border-red-100 pb-2 mb-2">
                        <TrendingDown className="w-4 h-4" /> Decrease Logic
                    </div>
                    <div className="bg-gray-50/50 p-2 rounded text-xs text-gray-600 mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Info className="w-3 h-3" /><span>Include "New Products"?</span>
                        </div>
                        <button 
                            onClick={() => toggleBool(['decrease', 'includeNewProducts'])} 
                            className={`relative inline-flex h-4 w-8 items-center rounded-full transition-colors focus:outline-none ${config.decrease.includeNewProducts ? 'bg-red-500' : 'bg-gray-300'}`}
                        >
                            <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${config.decrease.includeNewProducts ? 'translate-x-4' : 'translate-x-1'}`} />
                        </button>
                    </div>
                    
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Condition A: High Stock</label>
                        <div className="flex items-center gap-2">
                            <span className="text-sm text-gray-600">Runway &gt;</span>
                            <input 
                                type="number" 
                                value={config.decrease.highStockWeeks} 
                                onChange={e => setVal(['decrease', 'highStockWeeks'], e.target.value)} 
                                className="w-16 border rounded p-1.5 text-sm bg-white/50" 
                            />
                            <span className="text-sm text-gray-600">wks</span>
                        </div>
                    </div>

                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Condition B: Med Stock + High Margin</label>
                        <div className="grid grid-cols-2 gap-2">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">Runway &gt;</span>
                                <input 
                                    type="number" 
                                    value={config.decrease.medStockWeeks} 
                                    onChange={e => setVal(['decrease', 'medStockWeeks'], e.target.value)} 
                                    className="w-16 border rounded p-1.5 text-sm bg-white/50" 
                                />
                                <span className="text-sm text-gray-600">wks</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">Margin &gt;</span>
                                <input 
                                    type="number" 
                                    value={config.decrease.minMarginPercent} 
                                    onChange={e => setVal(['decrease', 'minMarginPercent'], e.target.value)} 
                                    className="w-16 border rounded p-1.5 text-sm bg-white/50" 
                                />
                                <span className="text-sm text-gray-600">%</span>
                            </div>
                        </div>
                    </div>

                    <div className="pt-2 border-t border-gray-100">
                            <label className="text-xs font-bold text-gray-500 uppercase mb-1 flex items-center gap-1">
                            Fresh Stock Guard
                            <div className="group relative">
                                <Info className="w-3 h-3 text-gray-400 cursor-help" />
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-48 p-2 bg-gray-800 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none text-center">
                                    Prevents price drops on items recently restocked. <br/><br/>
                                    <strong>Strategic Restock:</strong> Increase &ge; 5% &amp; matches a Shipment in transit (+/- 7 days).
                                </div>
                            </div>
                            </label>
                            <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                                <span className="text-sm text-gray-600">Exclude if restocked in last</span>
                                <input 
                                    type="number" 
                                    min="0"
                                    value={config.decrease.freshStockGuardDays ?? 0}
                                    onChange={e => setVal(['decrease', 'freshStockGuardDays'], e.target.value)}
                                    className="w-16 border rounded p-1.5 text-sm bg-white/50" 
                                />
                                <span className="text-sm text-gray-600">days</span>
                            </div>
                            <span className="text-[10px] text-gray-400 italic">(Set 0 to disable)</span>
                            </div>
                    </div>

                    <div className="bg-red-50/50 p-3 rounded border border-red-100">
                        <label className="text-xs font-bold text-red-800 uppercase block mb-2">Adjustment Action</label>
                        <div className="flex gap-2">
                            <div className="flex-1">
                                <span className="text-[10px] text-gray-500">Percent (%)</span>
                                <input 
                                    type="number" 
                                    value={config.decrease.adjustmentPercent} 
                                    onChange={e => setVal(['decrease', 'adjustmentPercent'], e.target.value)} 
                                    className="w-full border rounded p-1 text-sm text-red-700 font-bold bg-white/80" 
                                />
                            </div>
                            <div className="flex-1">
                                <span className="text-[10px] text-gray-500">Fixed (£)</span>
                                <input 
                                    type="number" 
                                    value={config.decrease.adjustmentFixed} 
                                    onChange={e => setVal(['decrease', 'adjustmentFixed'], e.target.value)} 
                                    className="w-full border rounded p-1 text-sm text-red-700 font-bold bg-white/80" 
                                />
                            </div>
                        </div>
                        <p className="text-[10px] text-red-600 mt-1 italic">*Applies whichever is higher</p>
                    </div>
                </div>

                {/* Safety Net */}
                <div className="space-y-4">
                    <div className="flex items-center gap-2 text-amber-700 font-bold border-b border-amber-100 pb-2 mb-2">
                        <AlertTriangle className="w-4 h-4" /> Safety Net
                    </div>
                    <div className="bg-amber-50/50 p-4 rounded border border-amber-100">
                        <label className="text-xs font-bold text-amber-800 uppercase block mb-2">Minimum Floor Constraint</label>
                        <p className="text-xs text-amber-700 mb-3">Price must not fall below:</p>
                        <div className="flex items-center gap-2 font-mono text-sm bg-white/80 p-2 rounded border border-amber-200 mb-3">
                            (Cost + Ship) ÷
                            <span className="font-bold">
                                {(1 - ((config.safety.minMarginPercent || 0) / 100)).toFixed(2)}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs text-amber-800">Min Margin Buffer:</span>
                            <input 
                                type="number" 
                                value={config.safety.minMarginPercent} 
                                onChange={e => setVal(['safety', 'minMarginPercent'], e.target.value)} 
                                className="w-16 border rounded p-1 text-sm font-bold text-amber-700 bg-white/80" 
                            />
                            <span className="text-xs text-amber-800">%</span>
                        </div>
                    </div>
                    <div className="mt-6 pt-4 border-t border-gray-200/50">
                        <p className="text-xs text-gray-400 italic">Seasonal adjustments: Coming soon.</p>
                    </div>
                </div>
            </div>
        </div>
    );
};