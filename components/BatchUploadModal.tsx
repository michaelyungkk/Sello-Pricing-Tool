
import React, { useState, useRef, useMemo } from 'react';
import { Product } from '../types';
import { Upload, X, FileText, Check, AlertCircle, Download, ArrowRight, RefreshCw, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface BatchUploadModalProps {
  products: Product[];
  onClose: () => void;
  onConfirm: (updates: BatchUpdateItem[]) => void;
}

export interface BatchUpdateItem {
  sku: string;
  price?: number;
  stock?: number;
  leadTime?: number;
}

interface ParsedItem extends BatchUpdateItem {
  productName?: string;
  oldPrice?: number;
  oldStock?: number;
  oldLeadTime?: number;
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
    // Reset input to allow selecting the same file again if needed
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const processFile = (file: File) => {
    setIsProcessing(true);
    setError(null);

    setTimeout(() => {
        const reader = new FileReader();

        if (file.name.endsWith('.xlsx')) {
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'array' });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                    processRows(rows);
                } catch (err) {
                    console.error("Excel parse error:", err);
                    setError("Failed to parse Excel file. Ensure it is a valid .xlsx file.");
                } finally {
                    setIsProcessing(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = (event) => {
                try {
                    const text = event.target?.result as string;
                    const rows = text.split('\n').map(line => line.split(','));
                    processRows(rows);
                } catch (err) {
                     setError("Failed to parse CSV file.");
                } finally {
                     setIsProcessing(false);
                }
            };
            reader.onerror = () => {
                setError("Error reading file.");
                setIsProcessing(false);
            };
            reader.readAsText(file);
        }
    }, 100);
  };

  const processRows = (rows: any[][]) => {
    try {
        if (rows.length < 2) {
            setError("File is empty or contains only headers.");
            return;
        }

        // Headers are in the first row
        const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/_/g, ' '));
        
        const skuIndex = headers.findIndex(h => h.includes('sku'));
        const priceIndex = headers.findIndex(h => h.includes('price'));
        const stockIndex = headers.findIndex(h => h.includes('stock') || h.includes('qty'));
        const leadTimeIndex = headers.findIndex(h => h.includes('lead time') || h.includes('leadtime') || h.includes('days'));

        if (skuIndex === -1) {
          setError("File must contain a 'sku' column.");
          return;
        }

        const results: ParsedItem[] = [];

        for (let i = 1; i < rows.length; i++) {
          const row = rows[i];
          // Skip empty rows
          if (!row || row.length === 0 || (row.length === 1 && !row[0])) continue;
          
          const rawSku = row[skuIndex];
          const sku = rawSku ? String(rawSku).trim() : '';
          
          if (!sku) continue;

          const priceValRaw = priceIndex !== -1 ? row[priceIndex] : undefined;
          const stockValRaw = stockIndex !== -1 ? row[stockIndex] : undefined;
          const leadTimeValRaw = leadTimeIndex !== -1 ? row[leadTimeIndex] : undefined;

          const priceVal = priceValRaw !== undefined && priceValRaw !== null && String(priceValRaw).trim() !== '' 
              ? parseFloat(String(priceValRaw)) 
              : undefined;
          
          const stockVal = stockValRaw !== undefined && stockValRaw !== null && String(stockValRaw).trim() !== ''
              ? parseInt(String(stockValRaw)) 
              : undefined;

          const leadTimeVal = leadTimeValRaw !== undefined && leadTimeValRaw !== null && String(leadTimeValRaw).trim() !== ''
              ? parseInt(String(leadTimeValRaw))
              : undefined;

          // Find existing product
          const existing = products.find(p => p.sku === sku);

          if (existing) {
            results.push({
              sku,
              price: priceVal !== undefined && !isNaN(priceVal) ? priceVal : undefined,
              stock: stockVal !== undefined && !isNaN(stockVal) ? stockVal : undefined,
              leadTime: leadTimeVal !== undefined && !isNaN(leadTimeVal) ? leadTimeVal : undefined,
              productName: existing.name,
              oldPrice: existing.currentPrice,
              oldStock: existing.stockLevel,
              oldLeadTime: existing.leadTimeDays,
              status: 'valid'
            });
          } else {
            results.push({
              sku,
              status: 'error',
              message: 'SKU not found'
            });
          }
        }
        setParsedItems(results);
        setCurrentPage(1);
    } catch (err) {
        console.error(err);
        setError("An unexpected error occurred while processing rows.");
    }
  };

  const downloadTemplate = () => {
    const headers = "sku,price,stock,lead_time";
    const blob = new Blob([headers], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = "inventory_template.csv";
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const validCount = parsedItems?.filter(i => i.status === 'valid').length || 0;

  // Pagination Logic
  const paginatedItems = useMemo(() => {
    if (!parsedItems) return [];
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return parsedItems.slice(start, start + ITEMS_PER_PAGE);
  }, [parsedItems, currentPage]);

  const totalPages = parsedItems ? Math.ceil(parsedItems.length / ITEMS_PER_PAGE) : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Batch Inventory Update</h2>
            <p className="text-sm text-gray-500 mt-1">Upload CSV or XLSX to update prices, stock levels, and lead times.</p>
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
                <p className="text-gray-600 font-medium">Processing file...</p>
                <p className="text-sm text-gray-400">This may take a moment for large files.</p>
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
                  accept=".csv, .xlsx" 
                  className="hidden" 
                  onChange={handleFileChange}
                />
                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 pointer-events-none">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 pointer-events-none">Drag and drop your file here</h3>
                <p className="text-gray-500 mt-1 mb-4 pointer-events-none">CSV or XLSX files only</p>
                
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

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 flex items-start gap-3">
                <FileText className="w-5 h-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="text-sm font-semibold text-blue-900">File Format Guide</h4>
                  <p className="text-sm text-blue-700 mt-1">
                    Required column: <code className="bg-blue-100 px-1 rounded">sku</code><br/>
                    Optional columns: <code className="bg-blue-100 px-1 rounded">price</code>, <code className="bg-blue-100 px-1 rounded">stock</code>, <code className="bg-blue-100 px-1 rounded">lead_time</code>
                  </p>
                  <button 
                    onClick={downloadTemplate}
                    className="mt-3 text-sm font-medium text-blue-700 hover:text-blue-800 flex items-center gap-1"
                  >
                    <Download className="w-4 h-4" />
                    Download CSV Template
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-4">
                    <div className="text-sm">
                        <span className="font-semibold text-green-600">{validCount}</span> Valid
                    </div>
                    <div className="text-sm">
                        <span className="font-semibold text-red-600">{parsedItems.length - validCount}</span> Errors
                    </div>
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
                      <th className="p-3">Price</th>
                      <th className="p-3">Stock</th>
                      <th className="p-3">Lead Time</th>
                      <th className="p-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {paginatedItems.map((item, idx) => (
                      <tr key={idx} className={item.status === 'error' ? 'bg-red-50' : ''}>
                        <td className="p-3 font-mono text-xs">
                            <div className="font-medium text-gray-900">{item.sku}</div>
                            {item.productName && <div className="text-gray-500 truncate max-w-[120px]">{item.productName}</div>}
                        </td>
                        <td className="p-3">
                          {item.price !== undefined && item.oldPrice !== undefined ? (
                             <div className="flex items-center gap-1 text-xs">
                                <span className="text-gray-400 line-through">${item.oldPrice}</span>
                                <ArrowRight className="w-3 h-3 text-gray-400" />
                                <span className="font-semibold text-gray-900">${item.price}</span>
                             </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="p-3">
                          {item.stock !== undefined && item.oldStock !== undefined ? (
                             <div className="flex items-center gap-1 text-xs">
                                <span className="text-gray-400 line-through">{item.oldStock}</span>
                                <ArrowRight className="w-3 h-3 text-gray-400" />
                                <span className="font-semibold text-gray-900">{item.stock}</span>
                             </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                         <td className="p-3">
                          {item.leadTime !== undefined && item.oldLeadTime !== undefined ? (
                             <div className="flex items-center gap-1 text-xs">
                                <span className="text-gray-400 line-through">{item.oldLeadTime}d</span>
                                <ArrowRight className="w-3 h-3 text-gray-400" />
                                <span className="font-semibold text-gray-900">{item.leadTime}d</span>
                             </div>
                          ) : (
                            <span className="text-gray-300">-</span>
                          )}
                        </td>
                        <td className="p-3">
                            {item.status === 'valid' ? (
                                <Check className="w-5 h-5 text-green-500" />
                            ) : (
                                <span className="flex items-center gap-1 text-red-600 text-xs">
                                    <AlertCircle className="w-4 h-4" />
                                    {item.message}
                                </span>
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
              Update {validCount} Products
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchUploadModal;
