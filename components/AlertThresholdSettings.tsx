import React, { useState, useEffect } from 'react';
import { ThresholdConfig, getThresholdConfig, saveThresholdConfig, resetThresholdConfig, DEFAULT_THRESHOLDS } from '../services/thresholdsConfig';
import { Save, RefreshCw, AlertTriangle, Activity, Info } from 'lucide-react';

interface AlertThresholdSettingsProps {
    themeColor: string;
}

const SETTING_META: Record<keyof ThresholdConfig, { label: string; unit: string; usedBy: string; description: string }> = {
    marginBelowTargetPct: {
        label: 'Low Margin Threshold',
        unit: '%',
        usedBy: 'Dashboard: Margin Thieves, Deep Dive: Margin Compression',
        description: 'Products with net margin below this value are flagged as critical.'
    },
    velocityCrashPct: {
        label: 'Velocity Crash (Heavy)',
        unit: '%',
        usedBy: 'Dashboard: Velocity Crashes',
        description: 'Trigger for high-priority velocity drop alerts on the dashboard.'
    },
    velocityDropPct: {
        label: 'Velocity Drop (Standard)',
        unit: '%',
        usedBy: 'Deep Dive: Velocity Drop',
        description: 'Standard sensitivity for detecting negative momentum in Deep Dive.'
    },
    stockoutRunwayMultiplier: {
        label: 'Stockout Lead Time Buffer',
        unit: 'x',
        usedBy: 'Dashboard: Stockout Risk, Deep Dive: Stockout Risk',
        description: 'Multiplier for Lead Time. If Runway < (Lead Time * Multiplier), flag risk.'
    },
    overstockDays: {
        label: 'Overstock Definition',
        unit: 'Days',
        usedBy: 'Dashboard: Overstock Risk, Deep Dive: Overstock',
        description: 'Inventory covering more than these days is considered overstock.'
    },
    deadStockMinValueGBP: {
        label: 'Dead Stock Min Value',
        unit: '£',
        usedBy: 'Dashboard: Dead Stock, Deep Dive: Dead Stock',
        description: 'Minimum stock value required to flag an item with 0 sales as Dead Stock.'
    },
    returnRatePct: {
        label: 'High Return Rate',
        unit: '%',
        usedBy: 'Deep Dive: Elevated Returns',
        description: 'Return rate percentage that triggers a quality warning.'
    },
    highAdDependencyPct: {
        label: 'High Ad Dependency',
        unit: '%',
        usedBy: 'Deep Dive: High Ad Dependency',
        description: 'Maximum healthy TACoS. Exceeding this triggers dependency alerts.'
    }
};

const AlertThresholdSettings: React.FC<AlertThresholdSettingsProps> = ({ themeColor }) => {
    const [config, setConfig] = useState<ThresholdConfig>(DEFAULT_THRESHOLDS);
    const [isDirty, setIsDirty] = useState(false);
    const [savedMessage, setSavedMessage] = useState<string | null>(null);

    useEffect(() => {
        setConfig(getThresholdConfig());
    }, []);

    const handleChange = (key: keyof ThresholdConfig, value: string) => {
        const num = parseFloat(value);
        if (isNaN(num)) return;
        
        setConfig(prev => ({ ...prev, [key]: num }));
        setIsDirty(true);
        setSavedMessage(null);
    };

    const handleSave = () => {
        saveThresholdConfig(config);
        setIsDirty(false);
        setSavedMessage('Configuration saved successfully.');
        setTimeout(() => setSavedMessage(null), 3000);
    };

    const handleReset = () => {
        if (window.confirm('Reset all thresholds to system defaults?')) {
            const defaults = resetThresholdConfig();
            setConfig(defaults);
            setIsDirty(false);
            setSavedMessage('Reset to defaults.');
            setTimeout(() => setSavedMessage(null), 3000);
        }
    };

    const isValid = (key: keyof ThresholdConfig, val: number) => {
        if (key.toLowerCase().includes('pct')) return val >= 0 && val <= 100;
        return val >= 0;
    };

    const allValid = Object.entries(config).every(([k, v]) => isValid(k as keyof ThresholdConfig, v as number));

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right-4">
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Alert & Diagnostic Thresholds</h2>
                    <p className="text-sm text-gray-500 mt-1">Fine-tune the sensitivity of the Decision Engine's detection logic.</p>
                </div>
                <div className="flex gap-2">
                    <button 
                        onClick={handleReset}
                        className="px-4 py-2 text-sm font-medium text-gray-600 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                    >
                        <RefreshCw className="w-4 h-4" /> Reset Defaults
                    </button>
                    <button 
                        onClick={handleSave}
                        disabled={!isDirty || !allValid}
                        className="px-6 py-2 text-sm font-bold text-white rounded-lg shadow-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all"
                        style={{ backgroundColor: themeColor }}
                    >
                        <Save className="w-4 h-4" /> Save Changes
                    </button>
                </div>
            </div>

            {savedMessage && (
                <div className="bg-green-50 text-green-700 px-4 py-2 rounded-lg border border-green-200 text-sm font-medium flex items-center gap-2 animate-in fade-in">
                    <Activity className="w-4 h-4" /> {savedMessage}
                </div>
            )}

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-gray-200">
                    {(Object.entries(config) as [keyof ThresholdConfig, number][]).map(([key, value]) => {
                        const meta = SETTING_META[key];
                        const valid = isValid(key, value);

                        return (
                            <div key={key} className="bg-white p-6 hover:bg-gray-50 transition-colors group">
                                <div className="flex justify-between items-start mb-2">
                                    <label className="text-sm font-bold text-gray-700 flex items-center gap-2">
                                        {meta.label}
                                        {!valid && <AlertTriangle className="w-4 h-4 text-red-500" />}
                                    </label>
                                    <div className="flex items-center gap-2">
                                        <input 
                                            type="number" 
                                            value={value}
                                            onChange={(e) => handleChange(key, e.target.value)}
                                            className={`w-20 text-right font-mono font-bold text-sm border rounded-md py-1 px-2 focus:ring-2 focus:ring-indigo-500 ${!valid ? 'border-red-500 text-red-600 bg-red-50' : 'border-gray-300'}`}
                                        />
                                        <span className="text-xs font-bold text-gray-400 w-8">{meta.unit}</span>
                                    </div>
                                </div>
                                
                                <p className="text-xs text-gray-500 mb-3 min-h-[1.5em]">{meta.description}</p>
                                
                                <div className="pt-3 border-t border-gray-100 flex items-center gap-1.5">
                                    <Info className="w-3 h-3 text-indigo-400" />
                                    <span className="text-[10px] font-semibold text-indigo-600 uppercase tracking-wide">Used by:</span>
                                    <span className="text-[10px] text-gray-600 font-medium truncate" title={meta.usedBy}>
                                        {meta.usedBy}
                                    </span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

export default AlertThresholdSettings;