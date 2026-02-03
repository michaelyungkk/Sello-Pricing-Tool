
import React, { useState, useRef } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product } from '../../../types';

interface PromoUploadModalProps {
    products: Product[];
    themeColor: string;
    onClose: () => void;
    onConfirm: (items: any[]) => void;
}

export const PromoUploadModal: React.FC<PromoUploadModalProps> = ({ products, themeColor, onClose, onConfirm }) => {
    const [dragActive, setDragActive] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
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
                        const [sku, price] = l.split(',');
                        return { sku: sku?.trim(), price: price?.trim() };
                    }).filter(r => r.sku);
                }

                const parsed = rows.map((r: any) => {
                    const skuKey = Object.keys(r).find(k => k.toLowerCase().includes('sku'));
                    const priceKey = Object.keys(r).find(k => k.toLowerCase().includes('price'));
                    
                    const sku = skuKey ? r[skuKey] : r[0] || r['sku'] || r['SKU'];
                    const price = priceKey ? r[priceKey] : r[1] || r['price'] || r['Price'];

                    return {
                        sku: String(sku).trim(),
                        price: parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0
                    };
                }).filter(i => i.sku && i.price > 0 && products.some(p => p.sku === i.sku));

                if (parsed.length === 0) throw new Error("No valid products found in file.");
                onConfirm(parsed);
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
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-900">Batch Upload Items</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>
                
                <div 
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:bg-gray-50'}`}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                >
                    <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.xlsx" onChange={(e) => e.target.files && handleFile(e.target.files[0])} />
                    {isProcessing ? (
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                    ) : (
                        <>
                            <Upload className="w-8 h-8 text-gray-400 mb-2" />
                            <p className="text-sm font-medium text-gray-900">Drag & Drop or <button onClick={() => fileInputRef.current?.click()} className="text-indigo-600 hover:underline">Browse</button></p>
                            <p className="text-xs text-gray-500 mt-1">Columns: SKU, Promo Price</p>
                        </>
                    )}
                </div>
                {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
                
                <div className="flex justify-end mt-4">
                    <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-900">Cancel</button>
                </div>
            </div>
        </div>
    );
};
