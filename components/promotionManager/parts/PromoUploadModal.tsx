
import React, { useState, useRef } from 'react';
import { Upload, X, Loader2, Settings2, AlertCircle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product } from '../../../types';

export type UploadDiscountMode = 'FIXED_PRICE' | 'PERCENT_OFF' | 'FIXED_OFF';

interface PromoUploadModalProps {
    products: Product[];
    themeColor: string;
    onClose: () => void;
    onConfirm: (items: { sku: string; value: number }[], mode: UploadDiscountMode) => void;
}

export const PromoUploadModal: React.FC<PromoUploadModalProps> = ({ products, themeColor, onClose, onConfirm }) => {
    const [dragActive, setDragActive] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [uploadMode, setUploadMode] = useState<UploadDiscountMode>('FIXED_PRICE');
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = (file: File) => {
        setIsProcessing(true);
        setError(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                let rows: any[] = [];
                if (file.name.endsWith('.xlsx')) {
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    rows = XLSX.utils.sheet_to_json(sheet);
                } else {
                    const text = data as string;
                    rows = text.split('\n').map(l => {
                        const [sku, val] = l.split(',');
                        return { sku: sku?.trim(), value: val?.trim() };
                    }).filter(r => r.sku);
                }

                const parsed = rows.map((r: any) => {
                    const keys = Object.keys(r);
                    
                    // Flexible column matching
                    const skuKey = keys.find(k => k.toLowerCase().includes('sku') || k.toLowerCase().includes('item'));
                    const valKey = keys.find(k => 
                        k.toLowerCase().includes('price') || 
                        k.toLowerCase().includes('value') || 
                        k.toLowerCase().includes('discount') || 
                        k.toLowerCase().includes('%')
                    );
                    
                    const sku = skuKey ? r[skuKey] : r[0] || r['sku'] || r['SKU'];
                    const val = valKey ? r[valKey] : r[1] || r['price'] || r['value'];

                    return {
                        sku: String(sku).trim(),
                        value: parseFloat(String(val).replace(/[^0-9.]/g, '')) || 0
                    };
                }).filter(i => i.sku && i.value > 0 && products.some(p => p.sku.toUpperCase() === i.sku.toUpperCase()));

                if (parsed.length === 0) throw new Error("No valid products found in file. Ensure SKUs match Master Catalogue.");
                onConfirm(parsed, uploadMode);
            } catch (err: any) {
                setError(err.message || "Failed to parse file.");
            } finally {
                setIsProcessing(false);
            }
        };
        if (file.name.endsWith('.xlsx')) reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-900">Batch Upload Items</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
                </div>

                <div className="mb-6 bg-gray-50 p-4 rounded-lg border border-gray-100">
                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-2 flex items-center gap-1">
                        <Settings2 className="w-3 h-3" /> Column Interpretation
                    </label>
                    <div className="space-y-2">
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="mode" 
                                checked={uploadMode === 'FIXED_PRICE'} 
                                onChange={() => setUploadMode('FIXED_PRICE')}
                                className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-gray-700">Column 2 is <strong>Target Price (£)</strong></span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="mode" 
                                checked={uploadMode === 'PERCENT_OFF'} 
                                onChange={() => setUploadMode('PERCENT_OFF')}
                                className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-gray-700">Column 2 is <strong>Percentage Off (%)</strong> <span className="text-gray-400 text-xs ml-1">(e.g. "25" = 25%)</span></span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input 
                                type="radio" 
                                name="mode" 
                                checked={uploadMode === 'FIXED_OFF'} 
                                onChange={() => setUploadMode('FIXED_OFF')}
                                className="text-indigo-600 focus:ring-indigo-500"
                            />
                            <span className="text-sm text-gray-700">Column 2 is <strong>Amount Off (£)</strong></span>
                        </label>
                    </div>
                </div>
                
                <div 
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:bg-gray-50'}`}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                >
                    <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.xlsx" onChange={(e) => e.target.files && handleFile(e.target.files[0])} />
                    {isProcessing ? (
                        <div className="flex flex-col items-center">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
                            <p className="text-sm text-indigo-600 font-medium">Processing...</p>
                        </div>
                    ) : (
                        <>
                            <Upload className="w-8 h-8 text-gray-400 mb-2" />
                            <p className="text-sm font-medium text-gray-900">Drag & Drop or <button onClick={() => fileInputRef.current?.click()} className="text-indigo-600 hover:underline">Browse</button></p>
                            <p className="text-xs text-gray-500 mt-2">
                                Expected Format: Column 1 (SKU), Column 2 ({uploadMode === 'PERCENT_OFF' ? '% e.g. 25' : '£ value'})
                            </p>
                        </>
                    )}
                </div>
                {error && (
                    <div className="mt-3 p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100 flex items-start gap-2">
                        <div className="mt-0.5"><AlertCircle className="w-3 h-3"/></div>
                        {error}
                    </div>
                )}
                
                <div className="flex justify-end mt-6">
                    <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-900 px-4 py-2">Cancel</button>
                </div>
            </div>
        </div>
    );
};
