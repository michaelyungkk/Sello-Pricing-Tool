
import React, { useState, useRef, useMemo } from 'react';
import { Product } from '../types';
import { Upload, X, FileText, Check, AlertCircle, Download, ArrowRight, RefreshCw, ChevronLeft, ChevronRight, Loader2, Database } from 'lucide-react';
import * as XLSX from 'xlsx';

interface BatchUploadModalProps {
  products: Product[];
  onClose: () => void;
  onConfirm: (updates: BatchUpdateItem[]) => void;
}

export interface BatchUpdateItem {
  sku: string;
  name?: string;
  brand?: string;
  category?: string;
  subcategory?: string;
  price?: number; // Not in inventory report usually, but kept for compatibility
  stock?: number;
  cost?: number; // COGS
  cartonDimensions?: {
      length: number;
      width: number;
      height: number;
      weight: number;
  };
}

interface ParsedItem extends BatchUpdateItem {
  oldStock?: number;
  oldCost?: number;
  isNewProduct: boolean;
  status: 'valid' | 'error';
  message?: string;
}

const BatchUploadModal: React.FC<BatchUploadModalProps> = ({ products, onClose, onConfirm }) => {
  const [dragActive, setDragActive] = useState(false);
  const [parsedItems, setParsedItems] = useState<ParsedItem[] | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const ITEMS_PER_PAGE = 50;

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
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const processFile = (file: File) => {
    setIsProcessing(true);
    setError(null);

    setTimeout(() => {
        const reader = new FileReader();

        const handleData = (data: any) => {
             const workbook = XLSX.read(data, { type: 'array' });
             const firstSheetName = workbook.SheetNames[0];
             const worksheet = workbook.Sheets[firstSheetName];
             // Get raw headers from first row
             const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
             processRows(rows);
        };

        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
            reader.onload = (e) => {
                try {
                    handleData(e.target?.result);
                } catch (err) {
                    console.error(err);
                    setError("Failed to parse Excel file.");
                } finally {
                    setIsProcessing(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            // For CSV, we can still use XLSX lib
            reader.onload = (e) => {
                try {
                    const text = e.target?.result;
                    const workbook = XLSX.read(text, { type: 'string' });
                    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' }) as any[][];
                    processRows(rows);
                } catch (err) {
                    setError("Failed to parse CSV file.");
                } finally {
                    setIsProcessing(false);
                }
            };
            reader.readAsText(file);
        }
    }, 100);
  };

  // ERP Column Mapping
  const COL_MAP = {
      SKU: "Product SKU/SKU编码",
      NAME: "Product Name/SKU名称",
      BRAND: "Brand/品牌",
      MAIN_CAT: "Main Category/主分类",
      SUB_CAT: "Subcategory/子分类",
      STOCK: "Total Inventory Qty/库存总量",
      COGS: "COGS/成本价",
      // Dimensions
      C_LEN: "Carton Length/外箱长度",
      C_WID: "Carton Width/外箱宽度",
      C_HEI: "Carton Height/外箱高度",
      C_WGT: "Carton Weight/外箱重量"
  };

  const processRows = (rows: any[][]) => {
    try {
        if (rows.length < 2) {
            setError("File is empty or contains only headers.");
            return;
        }

        // 1. Map Headers to Index
        const headerRow = rows[0].map(h => String(h).trim());
        
        const getIdx = (key: string) => headerRow.indexOf(key);

        const skuIdx = getIdx(COL_MAP.SKU);
        const stockIdx = getIdx(COL_MAP.STOCK);
        const cogsIdx = getIdx(COL_MAP.COGS);
        const nameIdx = getIdx(COL_MAP.NAME);
        const brandIdx = getIdx(COL_MAP.BRAND);
        const mainCatIdx = getIdx(COL_MAP.MAIN_CAT);
        const subCatIdx = getIdx(COL_MAP.SUB_CAT);
        
        // Dimensions
        const lenIdx = getIdx(COL_MAP.C_LEN);
        const widIdx = getIdx(COL_MAP.C_WID);
        const heiIdx = getIdx(COL_MAP.C_HEI);
        const wgtIdx = getIdx(COL_MAP.C_WGT);

        if (skuIdx === -1) {
          setError(`Invalid Template. Could not find column: "${COL_MAP.SKU}"`);
          return;
        }

        const results: ParsedItem[] = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          if (!row || row.length === 0) continue;
          
          const rawSku = row[skuIdx];
          const sku = rawSku ? String(rawSku).trim() : '';
          
          if (!sku) continue;

          // Parse Numbers
          const parseNum = (idx: number) => {
              if (idx === -1) return undefined;
              const val = row[idx];
              if (val === undefined || val === null || val === '') return undefined;
              const num = parseFloat(String(val));
              return isNaN(num) ? 0 : num;
          };

          const parseStr = (idx: number) => {
              if (idx === -1) return undefined;
              const val = row[idx];
              return val ? String(val).trim() : undefined;
          };

          const stock = parseNum(stockIdx);
          const cost = parseNum(cogsIdx);
          
          // Dimensions
          const cLen = parseNum(lenIdx) || 0;
          const cWid = parseNum(widIdx) || 0;
          const cHei = parseNum(heiIdx) || 0;
          const cWgt = parseNum(wgtIdx) || 0;

          // Find existing product to compare
          const existing = products.find(p => p.sku === sku);

          results.push({
            sku,
            name: parseStr(nameIdx),
            brand: parseStr(brandIdx),
            category: parseStr(mainCatIdx),
            subcategory: parseStr(subCatIdx),
            stock: stock,
            cost: cost,
            cartonDimensions: {
                length: cLen, width: cWid, height: cHei, weight: cWgt
            },
            
            // Comparison Data
            oldStock: existing?.stockLevel,
            oldCost: existing?.costPrice,
            isNewProduct: !existing,
            status: 'valid'
          });
        }
        setParsedItems(results);
        setCurrentPage(1);
    } catch (err) {
        console.error(err);
        setError("An unexpected error occurred while processing rows.");
    }
  };

  const validCount = parsedItems?.filter(i => i.status === 'valid').length || 0;
  const newProductCount = parsedItems?.filter(i => i.status === 'valid' && i.isNewProduct).length || 0;

  // Pagination Logic
  const paginatedItems = useMemo(() => {
    if (!parsedItems) return [];
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return parsedItems.slice(start, start + ITEMS_PER_PAGE);
  }, [parsedItems, currentPage]);

  const totalPages = parsedItems ? Math.ceil(parsedItems.length / ITEMS_PER_PAGE) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-600" />
                Import ERP Inventory Report
            </h2>
            <p className="text-sm text-gray-500 mt-1">Upload the standard 28-column ERP export to update stock, COGS, and product details.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {isProcessing ? (
             <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                <p className="text-gray-600 font-medium">Processing ERP Report...</p>
             </div>
          ) : !parsedItems ? (
            <div className="space-y-6">
              <div 
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-colors ${
                  dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input 
                  ref={fileInputRef}
                  type="file" 
                  accept=".csv, .xlsx, .xls" 
                  className="hidden" 
                  onChange={handleFileChange}
                />
                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 pointer-events-none">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 pointer-events-none">Drag & Drop Inventory Report</h3>
                <p className="text-gray-500 mt-1 mb-4 pointer-events-none">Supports .xlsx or .csv from ERP</p>
                
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-white border border-gray-300 shadow-sm text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                    Select File
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-red-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-blue-900 mb-2">Required Column Headers (Bilingual)</h4>
                <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-xs text-blue-800 font-mono">
                    <div>Product SKU/SKU编码</div>
                    <div>Product Name/SKU名称</div>
                    <div>Total Inventory Qty/库存总量</div>
                    <div>COGS/成本价</div>
                    <div>Main Category/主分类</div>
                    <div>Brand/品牌</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                    <div className="text-sm">
                        <span className="font-semibold text-green-600">{validCount}</span> Valid Items
                    </div>
                    {newProductCount > 0 && (
                        <div className="text-sm">
                            <span className="font-semibold text-indigo-600">{newProductCount}</span> New Products
                        </div>
                    )}
                </div>
                <button 
                  onClick={() => setParsedItems(null)}
                  className="text-sm text-gray-500 hover:text-gray-900 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  Reset
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <table className="w-full text-sm text-left">
                  <thead className="bg-gray-50 text-gray-500 font-medium">
                    <tr>
                      <th className="p-3">SKU</th>
                      <th className="p-3">Info</th>
                      <th className="p-3 text-right">Stock</th>
                      <th className="p-3 text-right">COGS</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedItems.map((item, idx) => (
                      <tr key={idx} className={item.isNewProduct ? 'bg-indigo-50/30' : ''}>
                        <td className="p-3 font-mono text-xs">
                            <div className="font-medium text-gray-900">{item.sku}</div>
                            {item.isNewProduct && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1 rounded">NEW</span>}
                        </td>
                        <td className="p-3">
                            <div className="text-xs text-gray-900 font-medium truncate max-w-[200px]">{item.name || '-'}</div>
                            <div className="text-[10px] text-gray-500">{item.brand} • {item.category}</div>
                        </td>
                        <td className="p-3 text-right">
                          {item.stock !== undefined ? (
                             <div className="flex items-center justify-end gap-1 text-xs">
                                {item.oldStock !== undefined && item.stock !== item.oldStock && (
                                    <>
                                        <span className="text-gray-400 line-through">{item.oldStock}</span>
                                        <ArrowRight className="w-3 h-3 text-gray-400" />
                                    </>
                                )}
                                <span className={`font-semibold ${item.stock === 0 ? 'text-red-600' : 'text-gray-900'}`}>
                                    {item.stock}
                                </span>
                             </div>
                          ) : '-'}
                        </td>
                        <td className="p-3 text-right">
                          {item.cost !== undefined ? (
                             <div className="flex items-center justify-end gap-1 text-xs">
                                {item.oldCost !== undefined && Math.abs(item.cost - item.oldCost) > 0.01 && (
                                    <>
                                        <span className="text-gray-400 line-through">${item.oldCost.toFixed(2)}</span>
                                        <ArrowRight className="w-3 h-3 text-gray-400" />
                                    </>
                                )}
                                <span className="font-semibold text-gray-900">${item.cost.toFixed(2)}</span>
                             </div>
                          ) : '-'}
                        </td>
                        <td className="p-3">
                            {item.status === 'valid' ? (
                                <Check className="w-5 h-5 text-green-500" />
                            ) : (
                                <AlertCircle className="w-5 h-5 text-red-500" />
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

               {/* Pagination Controls */}
               {parsedItems.length > ITEMS_PER_PAGE && (
                  <div className="flex items-center justify-between border-t border-gray-100 pt-3">
                      <button
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        Prev
                      </button>
                      <span className="text-sm text-gray-500">
                        Page {currentPage} of {totalPages}
                      </span>
                      <button
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50"
                      >
                        Next
                        <ChevronRight className="w-4 h-4" />
                      </button>
                  </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          {parsedItems && validCount > 0 && (
            <button 
              onClick={() => onConfirm(parsedItems.filter(i => i.status === 'valid'))}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-md shadow-indigo-200 transition-all flex items-center gap-2"
            >
              Confirm Update
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchUploadModal;
