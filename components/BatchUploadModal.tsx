
import React, { useState, useRef, useMemo } from 'react';
import { Upload, X, Check, AlertCircle, Loader2, RefreshCw, FileText, Database, ArrowRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product } from '../types';
import { useTranslation } from 'react-i18next';

export interface BatchUpdateItem {
  sku: string;
  name?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  stock?: number;
  agedStock?: number; // New Field for Aged Stock
  cost?: number;
  inventoryStatus?: string; // New Field for "New Product" logic
  cartonDimensions?: {
    length: number;
    width: number;
    height: number;
    weight: number;
  };
  gradeLevel?: number;
  dailyAverageSales?: number;
  seasonTags?: string;
  festivalTags?: string;
}

interface BatchUploadModalProps {
  products: Product[];
  onClose: () => void;
  onConfirm: (data: BatchUpdateItem[]) => void;
}

const BatchUploadModal: React.FC<BatchUploadModalProps> = ({ products, onClose, onConfirm }) => {
  const { t } = useTranslation();
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
        const stockIdx = findCol(['totalinventoryqty', '库存总量', 'stock', 'qty', 'quantity', 'available', 'onhand', '数量']);
        
        // Detect Aged Stock column
        const agedStockIdx = findCol(['aged', '90+', '180+', 'oldstock', 'longterm', 'unsellable', '滞销']);

        const costIdx = findCol(['cost', 'cogs', 'buyingprice', 'purchaseprice', '成本', '进价', '采购价']);
        
        // Status Column detection (Inventory Status/库存状态)
        const statusIdx = findCol(['inventorystatus', 'status', '库存状态']);

        // New columns
        const gradeLevelIdx = findCol(['gradelevel', '等级']);
        const dailyAverageSalesIdx = findCol(['dailyaveragesales', '日均销量']);

        // Dimensions
        const lenIdx = findCol(['length', 'depth']);
        const widthIdx = findCol(['width']);
        const heightIdx = findCol(['height']);
        const weightIdx = findCol(['weight']);

        const seasonTagsIdx = findCol(['seasontags', 'season', 'season_tags']);
        const festivalTagsIdx = findCol(['festivaltags', 'festival', 'event', 'festival_tags']);

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

            const parseGradeLevel = (idx: number): number | undefined => {
                if (idx === -1) return undefined; // Column not present, do not update existing values
                const rawVal = row[idx];
                if (rawVal === null || rawVal === undefined || String(rawVal).trim() === '') {
                    return 0; // Empty cell, default to 0
                }
                
                const valStr = String(rawVal);
                const match = valStr.match(/\d+/); // Extract first number sequence
                if (match && match[0]) {
                    const num = parseInt(match[0], 10);
                    return isNaN(num) ? 0 : num; // If parsing the extracted number fails, default 0
                }
                
                return 0; // If no number is found at all
            };

            const item: BatchUpdateItem = {
                sku,
                name: nameIdx !== -1 ? String(row[nameIdx]).trim() : undefined,
                brand: brandIdx !== -1 ? String(row[brandIdx]).trim() : undefined,
                category: catIdx !== -1 ? String(row[catIdx]).trim() : undefined,
                subcategory: subIdx !== -1 ? String(row[subIdx]).trim() : undefined,
                stock: parseNum(stockIdx),
                agedStock: parseNum(agedStockIdx),
                cost: parseNum(costIdx),
                gradeLevel: parseGradeLevel(gradeLevelIdx),
                dailyAverageSales: parseNum(dailyAverageSalesIdx),
                inventoryStatus: statusIdx !== -1 ? String(row[statusIdx]).trim() : undefined,
                seasonTags: seasonTagsIdx !== -1 ? String(row[seasonTagsIdx]).trim() : undefined,
                festivalTags: festivalTagsIdx !== -1 ? String(row[festivalTagsIdx]).trim() : undefined,
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
                  <h2 className="text-xl font-bold text-gray-900">{t('modal_erp_title')}</h2>
                  <p className="text-xs text-gray-500">{t('modal_erp_desc')}</p>
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
                            <p className="text-indigo-600 font-medium">{t('processing_file')}</p>
                        </div>
                    ) : (
                        <>
                            <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-4">
                                <Upload className="w-7 h-7" />
                            </div>
                            <p className="text-gray-900 font-medium text-lg">{t('modal_click_to_upload_erp')}</p>
                            <p className="text-sm text-gray-500 mt-1">{t('drag_and_drop_or_browse')}</p>
                            
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="mt-6 px-6 py-2 bg-white border border-gray-200 shadow-sm text-gray-700 font-bold rounded-lg hover:bg-gray-50"
                            >
                                {t('select_file')}
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
                                <span className="text-xs text-gray-500 uppercase font-bold">{t('total_items')}</span>
                                <span className="text-xl font-bold text-gray-900">{validCount}</span>
                            </div>
                            <div className="w-px h-8 bg-gray-200"></div>
                            <div className="flex flex-col">
                                <span className="text-xs text-indigo-600 uppercase font-bold">{t('new_skus')}</span>
                                <span className="text-xl font-bold text-indigo-600">{newProductCount}</span>
                            </div>
                        </div>
                        <button 
                            onClick={() => setParsedItems(null)}
                            className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1.5 px-3 py-1.5 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            <RefreshCw className="w-4 h-4" />
                            {t('reset')}
                        </button>
                    </div>

                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm">
                        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase flex">
                            <div className="flex-1">{t('product')}</div>
                            <div className="w-20 text-right">{t('stock')}</div>
                            <div className="w-20 text-right">{t('aged')}</div>
                            <div className="w-24 text-right">{t('cost')}</div>
                        </div>
                        <div className="max-h-[300px] overflow-y-auto">
                            {parsedItems.slice(0, 50).map((item, idx) => (
                                <div key={idx} className="px-4 py-3 border-b border-gray-100 flex items-center hover:bg-gray-50 transition-colors last:border-0">
                                    <div className="flex-1 min-w-0 pr-4">
                                        <div className="font-bold text-sm text-gray-900 flex items-center gap-2">
                                            {item.sku}
                                            {!existingSkus.has(item.sku) && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-700 font-bold border border-indigo-200 uppercase">{t('new')}</span>
                                            )}
                                            {item.inventoryStatus === 'New Product' && (
                                                <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-100 text-green-700 font-bold border border-green-200 uppercase">{t('status_new')}</span>
                                            )}
                                        </div>
                                        {item.name && <div className="text-xs text-gray-500 truncate">{item.name}</div>}
                                    </div>
                                    <div className="w-20 text-right font-mono text-sm">
                                        {item.stock !== undefined ? item.stock : '-'}
                                    </div>
                                    <div className="w-20 text-right font-mono text-sm text-amber-600 font-bold">
                                        {item.agedStock !== undefined ? item.agedStock : '-'}
                                    </div>
                                    <div className="w-24 text-right font-mono text-sm text-gray-600">
                                        {item.cost !== undefined ? `£${item.cost.toFixed(2)}` : '-'}
                                    </div>
                                </div>
                            ))}
                            {parsedItems.length > 50 && (
                                <div className="px-4 py-3 text-center text-xs text-gray-400 italic bg-gray-50">
                                    {t('and_x_more_items', { count: parsedItems.length - 50 })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors">{t('cancel')}</button>
            {parsedItems && parsedItems.length > 0 && (
                <button 
                    onClick={() => onConfirm(parsedItems)}
                    className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                    <Check className="w-4 h-4" />
                    {t('confirm_import')}
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default BatchUploadModal;
