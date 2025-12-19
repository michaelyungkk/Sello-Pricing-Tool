
import React, { useState, useRef, useMemo } from 'react';
import { Upload, X, Check, AlertCircle, Loader2, RefreshCw, FileText, Database, ArrowRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product } from '../types';

export interface BatchUpdateItem {
  sku: string;
  name?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  stock?: number;
  cost?: number;
  inventoryStatus?: string; // New Field for "New Product" logic
  cartonDimensions?: {
    length: number;
    width: number;
    height: number;
    weight: number;
  };
}

interface BatchUploadModalProps {
  products: Product[];
  onClose: () => void;
  onConfirm: (data: BatchUpdateItem[]) => void;
}

const BatchUploadModal: React.FC<BatchUploadModalProps> = ({ products, onClose, onConfirm }) => {
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedItems, setParsedItems] = useState<BatchUpdateItem[] | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existingSkus = useMemo(() => new Set(products.map(p => p.sku)), [products]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const processFile = (file: File) => {
    setIsProcessing(true);
    setError(null);

    setTimeout(() => {
        const reader = new FileReader();
        const handleContent = (content: any) => {
             let rows: any[][] = [];
             if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                 const workbook = XLSX.read(content, { type: 'array' });
                 const sheet = workbook.Sheets[workbook.SheetNames[0]];
                 rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
             } else {
                 const text = content as string;
                 rows = text.split('\n').map(l => l.split(',')); // Basic CSV split
             }
             analyzeRows(rows);
        };

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            reader.onload = (e) => {
                try { handleContent(e.target?.result); } 
                catch (err) { setError("Failed to parse Excel file."); setIsProcessing(false); } 
            };
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = (e) => {
                try { handleContent(e.target?.result); } 
                catch (err) { setError("Failed to parse CSV file."); setIsProcessing(false); } 
            };
            reader.readAsText(file);
        }
    }, 100);
  };

  const analyzeRows = (rows: any[][]) => {
      try {
        if (rows.length < 2) throw new Error("File empty.");

        // Clean headers: lower case, remove spaces/underscores/special chars for robust matching
        const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/[\s_\-\/]/g, ''));
        
        // Mapping helpers
        const findCol = (terms: string[]) => headers.findIndex(h => terms.some(t => h.includes(t)));

        const skuIdx = findCol(['sku', 'productcode', 'itemnumber']);
        const nameIdx = findCol(['name', 'title', 'description']);
        const brandIdx = findCol(['brand']);
        const catIdx = findCol(['category', 'maincat']);
        const subIdx = findCol(['subcategory', 'subcat']);
        
        // Specific Fix: Prioritize 'totalinventoryqty' and '库存总量' BEFORE generic 'inventory'.
        // 'Inventory' often matches 'Inventory Status' column which contains strings, resulting in 0/NaN stock.
        const stockIdx = findCol(['totalinventoryqty', '库存总量', 'stock', 'qty', 'quantity', 'available', 'onhand', '数量']);
        
        const costIdx = findCol(['cost', 'cogs', 'buyingprice', 'purchaseprice', '成本', '进价', '采购价']);
        
        // Status Column detection (Inventory Status/库存状态)
        const statusIdx = findCol(['inventorystatus', 'status', '库存状态']);

        // Dimensions
        const lenIdx = findCol(['length', 'depth']);
        const widthIdx = findCol(['width']);
        const heightIdx = findCol(['height']);
        const weightIdx = findCol(['weight']);

        if (skuIdx === -1) throw new Error("Could not detect SKU column. Please ensure header contains 'SKU'.");

        const results: BatchUpdateItem[] = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length <= skuIdx) continue;
            
            const sku = String(row[skuIdx]).trim();
            if (!sku) continue;

            const parseNum = (idx: number) => {
                if (idx === -1) return undefined;
                const val = parseFloat(String(row[idx]));
                return isNaN(val) ? undefined : val;
            };

            const item: BatchUpdateItem = {
                sku,
                name: nameIdx !== -1 ? String(row[nameIdx]).trim() : undefined,
                brand: brandIdx !== -1 ? String(row[brandIdx]).trim() : undefined,
                category: catIdx !== -1 ? String(row[catIdx]).trim() : undefined,
                subcategory: subIdx !== -1 ? String(row[subIdx]).trim() : undefined,
                stock: parseNum(stockIdx),
                cost: parseNum(costIdx),
                inventoryStatus: statusIdx !== -1 ? String(row[statusIdx]).trim() : undefined,
            };

            const l = parseNum(lenIdx);
            const w = parseNum(widthIdx);
            const h = parseNum(heightIdx);
            const wg = parseNum(weightIdx);

            if (l !== undefined || w !== undefined || h !== undefined || wg !== undefined) {
                item.cartonDimensions = {
                    length: l || 0,
                    width: w || 0,
                    height: h || 0,
                    weight: wg || 0
                };
            }

            results.push(item);
        }
        
        setParsedItems(results);
      } catch (err: any) {
          setError(err.message || "Failed to analyze file.");
      } finally {
          setIsProcessing(false);
      }
  };

  const validCount = parsedItems ? parsedItems.length : 0;
  const newProductCount = parsedItems ? parsedItems.filter(i => !existingSkus.has(i.sku)).length : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                  <Database className="w-5 h-5" />
              </div>
              <div>
                  <h2 className="text-xl font-bold text-gray-900">ERP Inventory Import</h2>
                  <p className="text-xs text-gray-500">Update stock, costs, and product details</p>
              </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto">
            {!parsedItems ? (
                 <div 
                    className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all ${
                    dragActive ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                    onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                >
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".csv, .xlsx, .xls" />
                    {isProcessing ? (
                        <div className="flex flex-col items-center py-4">
                            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
                            <p className="text-indigo-600 font-medium">Processing File...</p>
                        </div>
                    ) : (
                        <>
                            <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-4">
                                <Upload className="w-7 h-7" />
                            </div>
                            <p className="text-gray-900 font-medium text-lg">Click to upload ERP Report</p>
                            <p className="text-sm text-gray-500 mt-1">Drag and drop or browse (CSV / Excel)</p>
                            
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="mt-6 px-6 py-2 bg-white border border-gray-200 shadow-sm text-gray-700 font-bold rounded-lg hover:bg-gray-50"
                            >
                                Select File
                            </button>
                        </>
                    )}
                    
                    {error && (
                       <div className="mt-6 flex items-center gap-2 text-red-600 bg-red-50 px-4 py-2 rounded-lg border border-red-100">
                           <AlertCircle className="w-4 h-4" />
                           <span className="text-sm">{error}</span>
                       </div>
                   )}
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <div className="flex gap-6 items-center">
                            <div className="flex flex-col">
                                <span className="text-xs text-gray-500 uppercase font-bold">Total Items</span>
                                <span className="text-xl font-bold text-gray-900">{validCount}</span>
                            </div>
                            <div className="w-px h-8 bg-gray-200"></div>
                            <div className="flex flex-col">
                                <span className="text-xs text-indigo-600 uppercase font-bold">New SKUs</span>
                                <span className="text-xl font-bold text-indigo-600">{newProductCount}</span>
                            </div>
                        </div>
                        <button 
                            onClick={() => setParsedItems(null)}
                            className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            Reset
                        </button>
                    </div>

                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase flex">
                            <div className="flex-1">Product</div>
                            <div className="w-24 text-right">Stock</div>
                            <div className="w-24 text-right">Cost</div>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                            {parsedItems.slice(0, 50).map((item, idx) => (
                                <div key={idx} className="px-4 py-3 border-b border-gray-100 flex items-center hover:bg-gray-50 transition-colors last:border-0">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                                            {item.sku}
                                            {!existingSkus.has(item.sku) && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 uppercase">New</span>
                                            )}
                                            {item.inventoryStatus === 'New Product' && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700 font-bold border border-green-200 uppercase">Status: New</span>
                                            )}
                                        </div>
                                        {item.name && <div className="text-xs text-gray-500 truncate">{item.name}</div>}
                                    </div>
                                    <div className="w-24 text-right font-mono text-sm">
                                        {item.stock !== undefined ? item.stock : '-'}
                                    </div>
                                    <div className="w-24 text-right font-mono text-sm text-gray-600">
                                        {item.cost !== undefined ? `£${item.cost.toFixed(2)}` : '-'}
                                    </div>
                                </div>
                            ))}
                            {parsedItems.length > 50 && (
                                <div className="px-4 py-3 text-center text-xs text-gray-400 italic bg-gray-50">
                                    ...and {parsedItems.length - 50} more items
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors">Cancel</button>
            {parsedItems && parsedItems.length > 0 && (
                <button 
                    onClick={() => onConfirm(parsedItems)}
                    className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                    <Check className="w-4 h-4" />
                    Confirm Import
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default BatchUploadModal;
