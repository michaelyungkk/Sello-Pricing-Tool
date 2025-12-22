
import React, { useState, useRef } from 'react';
import { Upload, X, Check, AlertCircle, Loader2, Ship, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product, ShipmentDetail } from '../types';

interface ShipmentUpdate {
  sku: string;
  shipments: ShipmentDetail[];
}

interface ShipmentUploadModalProps {
  products: Product[];
  onClose: () => void;
  onConfirm: (updates: ShipmentUpdate[]) => void;
}

const ShipmentUploadModal: React.FC<ShipmentUploadModalProps> = ({ products, onClose, onConfirm }) => {
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedUpdates, setParsedUpdates] = useState<ShipmentUpdate[] | null>(null);
  const [stats, setStats] = useState({ containers: 0, skus: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

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
                 const workbook = XLSX.read(content, { type: 'array', cellDates: true });
                 const sheet = workbook.Sheets[workbook.SheetNames[0]];
                 rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
             } else {
                 const text = content as string;
                 rows = text.split('\n').map(l => l.split(',')); 
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

        // Headers cleaning
        const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/[\s_\-\/]/g, ''));
        
        // --- Column Mapping (Based on user provided file structure) ---
        const findCol = (terms: string[]) => headers.findIndex(h => terms.some(t => h.includes(t)));

        const skuIdx = findCol(['sku', 'productsku']);
        
        // Container 1
        const c1Idx = findCol(['containerno.1', '1号柜']);
        const c1QtyIdx = findCol(['containerno.1stockqty', '1号柜装柜数量']);
        const c1StatusIdx = findCol(['containerno.1status', '1号柜状态']);
        const c1EtaIdx = findCol(['containerno.1expectedeta', '1号柜预计eta']);
        
        // Container 2
        const c2Idx = findCol(['containerno.2', '2号柜']);
        const c2QtyIdx = findCol(['containerno.2stockqty', '2号柜装柜数量']);
        const c2StatusIdx = findCol(['containerno.2status', '2号柜状态']);
        const c2EtaIdx = findCol(['containerno.2expectedeta', '2号柜预计eta']);

        if (skuIdx === -1) throw new Error("Could not detect 'Product SKU' column.");

        const updatesMap: Record<string, ShipmentDetail[]> = {};
        const containerSet = new Set<string>();

        // Helper to clean status strings (remove Chinese chars)
        const cleanStatus = (val: any): string => {
            const str = String(val).trim();
            if (!str || str === 'undefined' || str === 'null') return 'Pending';
            
            // 1. If format is "English/Chinese", take the first part
            if (str.includes('/')) {
                return str.split('/')[0].trim();
            }
            
            // 2. Regex to remove Chinese characters range \u4E00-\u9FFF
            return str.replace(/[\u4E00-\u9FFF]/g, '').trim();
        };

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length <= skuIdx) continue;
            
            const rawSku = String(row[skuIdx]).trim();
            if (!rawSku) continue;

            const parseDate = (val: any) => {
                if (!val) return undefined;
                if (val instanceof Date) return val.toISOString().split('T')[0];
                // Handle text date? Assume YYYY-MM-DD or attempt basic parse
                const d = new Date(val);
                return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : undefined;
            };

            const shipments: ShipmentDetail[] = [];

            // Process Container 1
            if (c1Idx !== -1 && row[c1Idx]) {
                const id = String(row[c1Idx]).trim();
                containerSet.add(id);
                shipments.push({
                    containerId: id,
                    quantity: parseFloat(row[c1QtyIdx]) || 0,
                    status: c1StatusIdx !== -1 ? cleanStatus(row[c1StatusIdx]) : 'Pending',
                    eta: parseDate(row[c1EtaIdx])
                });
            }

            // Process Container 2
            if (c2Idx !== -1 && row[c2Idx]) {
                const id = String(row[c2Idx]).trim();
                containerSet.add(id);
                shipments.push({
                    containerId: id,
                    quantity: parseFloat(row[c2QtyIdx]) || 0,
                    status: c2StatusIdx !== -1 ? cleanStatus(row[c2StatusIdx]) : 'Pending',
                    eta: parseDate(row[c2EtaIdx])
                });
            }

            if (shipments.length > 0) {
                // If SKU appears multiple times (unlikely in this file structure but good for safety), merge?
                // For now, assuming 1 row per SKU as per file sample.
                updatesMap[rawSku] = shipments;
            }
        }

        const result: ShipmentUpdate[] = Object.entries(updatesMap).map(([sku, shipments]) => ({
            sku,
            shipments
        }));
        
        setParsedUpdates(result);
        setStats({ containers: containerSet.size, skus: result.length });

      } catch (err: any) {
          setError(err.message || "Failed to analyze file.");
      } finally {
          setIsProcessing(false);
      }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                  <Ship className="w-5 h-5" />
              </div>
              <div>
                  <h2 className="text-xl font-bold text-gray-900">Import Shipment Schedule</h2>
                  <p className="text-xs text-gray-500">Update incoming stock and ETAs</p>
              </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
        </div>
        
        <div className="p-6">
            {!parsedUpdates ? (
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
                            <p className="text-indigo-600 font-medium">Parsing Logistics File...</p>
                        </div>
                    ) : (
                        <>
                            <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-4">
                                <Calendar className="w-7 h-7" />
                            </div>
                            <p className="text-gray-900 font-medium text-lg">Upload Container Schedule</p>
                            <p className="text-sm text-gray-500 mt-1">Supports the Standard Shipment Export (XLSX)</p>
                            
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
                <div className="space-y-6 text-center">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                            <div className="text-2xl font-bold text-indigo-700">{stats.skus}</div>
                            <div className="text-xs text-indigo-600 font-bold uppercase">SKUs Updated</div>
                        </div>
                        <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                            <div className="text-2xl font-bold text-green-700">{stats.containers}</div>
                            <div className="text-xs text-green-600 font-bold uppercase">Unique Containers</div>
                        </div>
                    </div>
                    
                    <p className="text-sm text-gray-500">
                        This will overwrite existing ETAs and quantities for matching container numbers. 
                        Incoming stock levels will be recalculated.
                    </p>
                </div>
            )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors">Cancel</button>
            {parsedUpdates && parsedUpdates.length > 0 && (
                <button 
                    onClick={() => onConfirm(parsedUpdates)}
                    className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                    <Check className="w-4 h-4" />
                    Confirm Update
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default ShipmentUploadModal;
