import React, { useRef } from 'react';
import { LogisticsRule, FreightRate } from '../../../types';
import { Scale, Ruler, Upload, CheckCircle, AlertCircle, Package } from 'lucide-react';

interface SystemBehaviorSectionProps {
    logistics: LogisticsRule[];
    handleLogisticsChange: (id: string, field: keyof LogisticsRule, value: string) => void;
    handleFreightFileUpload: (file: File) => void;
    freightRates?: FreightRate[];
    freightUploadStatus: 'idle' | 'success' | 'error';
    freightUploadCount: number;
    themeColor: string;
    headerStyle: React.CSSProperties;
}

export const SystemBehaviorSection: React.FC<SystemBehaviorSectionProps> = ({
    logistics, handleLogisticsChange, handleFreightFileUpload,
    freightRates, freightUploadStatus, freightUploadCount, themeColor, headerStyle
}) => {
    const fileInputRef = useRef<HTMLInputElement>(null);

    return (
        <div className="space-y-6">
            {/* Logistics Rate Cards */}
            <div className="flex justify-between items-start">
                <div>
                    <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Logistics Rate Cards</h2>
                    <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>Define shipping rates, weight limits, and dimensions for your carriers.</p>
                </div>
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
                                            type="number" min="0" step="0.01"
                                            value={rule.price || ''} placeholder="0.00"
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
                                            type="number" min="0" step="0.1"
                                            value={rule.maxWeight || ''} placeholder="-"
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
                                            type="number" min="0" step="1"
                                            value={rule.maxLength || ''} placeholder="-"
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

            {/* Freight Rate Upload */}
            <div>
                <div className="mb-4">
                    <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>SKU Freight Rates</h2>
                    <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                        Upload your official freight rate table (Excel). Each SKU's postage cost will be updated for profit calculations.
                        Rates are reference only — actual cost may vary by shipping zone.
                    </p>
                </div>

                <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass backdrop-blur-custom p-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Package className="w-5 h-5 text-gray-400" />
                            <div>
                                {freightRates && freightRates.length > 0 ? (
                                    <p className="text-sm font-medium text-gray-700">
                                        {freightRates.length} SKU rates loaded
                                    </p>
                                ) : (
                                    <p className="text-sm text-gray-500">No freight rates uploaded yet</p>
                                )}
                                <p className="text-xs text-gray-400 mt-0.5">
                                    Required columns: <span className="font-mono">SKU</span> and one of <span className="font-mono">Rate / Freight / Postage / Cost</span>
                                </p>
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            {freightUploadStatus === 'success' && (
                                <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
                                    <CheckCircle className="w-4 h-4" />
                                    {freightUploadCount} rates applied
                                </span>
                            )}
                            {freightUploadStatus === 'error' && (
                                <span className="flex items-center gap-1.5 text-sm text-red-600 font-medium">
                                    <AlertCircle className="w-4 h-4" />
                                    Upload failed
                                </span>
                            )}

                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls,.csv"
                                className="hidden"
                                onChange={(e) => {
                                    const file = e.target.files?.[0];
                                    if (file) handleFreightFileUpload(file);
                                    e.target.value = '';
                                }}
                            />
                            <button
                                onClick={() => fileInputRef.current?.click()}
                                className="px-4 py-2 bg-theme hover:bg-theme text-white font-medium rounded-lg shadow-md transition-colors flex items-center gap-2"
                            >
                                <Upload className="w-4 h-4" />
                                Upload Rate Table
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
