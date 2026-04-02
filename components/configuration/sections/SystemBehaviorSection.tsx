import React from 'react';
import { FreightRate } from '../../../types';
import { Truck, CheckCircle2, Package, ArrowRight } from 'lucide-react';

interface SystemBehaviorSectionProps {
    freightRates?: FreightRate[];
    freightUploadCount: number;
    themeColor: string;
    headerStyle: React.CSSProperties;
    onOpenFreightUpload?: () => void;
}

export const SystemBehaviorSection: React.FC<SystemBehaviorSectionProps> = ({
    freightRates, freightUploadCount, themeColor, headerStyle, onOpenFreightUpload
}) => {
    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Freight Costs</h2>
                <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                    Upload your ERP shipping cost export to apply per-SKU freight costs to all margin and profit calculations.
                </p>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass backdrop-blur-custom p-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-teal-50 flex items-center justify-center flex-shrink-0">
                            <Package className="w-5 h-5 text-teal-700" />
                        </div>
                        <div>
                            {freightRates && freightRates.length > 0 ? (
                                <div className="flex items-center gap-2">
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                                    <p className="text-sm font-bold text-gray-800">
                                        {freightRates.length} SKU freight rates loaded
                                    </p>
                                </div>
                            ) : (
                                <p className="text-sm font-medium text-gray-600">No freight rates uploaded yet</p>
                            )}
                            <p className="text-xs text-gray-400 mt-0.5">
                                ERP export format · columns: <span className="font-mono text-gray-500">sku_code, totalCharge</span> (plus optional dimensions)
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5">
                                SKUs not in the file fall back to the freight formula estimate.
                            </p>
                        </div>
                    </div>

                    <button
                        onClick={onOpenFreightUpload}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold text-white transition-colors"
                        style={{ background: themeColor }}
                    >
                        <Truck className="w-4 h-4" />
                        Upload Freight Costs
                        <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                </div>

                {freightRates && freightRates.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <div className="grid grid-cols-3 gap-3 text-[10px]">
                            <div className="rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                                <div className="text-gray-400 mb-1">Total SKUs</div>
                                <div className="font-bold text-gray-800 text-sm">{freightRates.length}</div>
                            </div>
                            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
                                <div className="text-gray-400 mb-1">Avg rate</div>
                                <div className="font-bold text-emerald-700 text-sm">
                                    £{(freightRates.reduce((s, r) => s + r.rate, 0) / freightRates.length).toFixed(2)}
                                </div>
                            </div>
                            <div className="rounded-lg bg-blue-50 border border-blue-100 px-3 py-2">
                                <div className="text-gray-400 mb-1">Rate range</div>
                                <div className="font-bold text-blue-700 text-sm">
                                    £{Math.min(...freightRates.map(r => r.rate)).toFixed(2)} – £{Math.max(...freightRates.map(r => r.rate)).toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
