
import React, { useState, useRef, useMemo } from 'react';
import { Upload, X, Check, AlertCircle, Loader2, Ship, Calendar, Box, ArrowRight, Clock, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product, ShipmentDetail } from '../types';

interface ShipmentUpdate {
  sku: string;
  shipments: ShipmentDetail[];
}

type ChangeType = 'DELAYED' | 'EARLIER' | 'STATUS_CHANGE' | 'NEW' | 'UNCHANGED';

interface ContainerSummary {
    id: string;
    status: string;
    eta?: string;
    skuCount: number;
    totalQty: number;
    // Diff Data
    changeType: ChangeType;
    oldEta?: string;
    oldStatus?: string;
    daysDiff?: number;
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
  const [containerSummaries, setContainerSummaries] = useState<ContainerSummary[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 1. Build a Snapshot of Existing Containers
  const existingContainerMap = useMemo(() => {
      const map = new Map<string, { status: string, eta?: string }>();
      products.forEach(p => {
          if (p.shipments) {
              p.shipments.forEach(s => {
                  // If multiple SKUs have same container, we assume consistent ETA/Status. 
                  // We take the first one found or overwrite (doesn't matter if consistent).
                  if (s.containerId) {
                      map.set(s.containerId.trim(), { status: s.status, eta: s.eta });
                  }
              });
          }
      });
      return map;
  }, [products]);

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
        
        // --- Column Mapping ---
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
        const summaryMap: Record<string, ContainerSummary> = {};

        const cleanStatus = (val: any): string => {
            const str = String(val).trim();
            if (!str || str === 'undefined' || str === 'null') return 'Pending';
            if (str.includes('/')) return str.split('/')[0].trim();
            return str.replace(/[\u4E00-\u9FFF]/g, '').trim();
        };

        const updateSummary = (id: string, status: string, eta: string | undefined, qty: number) => {
            if (!summaryMap[id]) {
                // Initialize new summary
                // Check against Existing Map for DIFFs
                const existing = existingContainerMap.get(id);
                let changeType: ChangeType = existing ? 'UNCHANGED' : 'NEW';
                let daysDiff = 0;
                let oldEta = existing?.eta;
                let oldStatus = existing?.status;

                if (existing) {
                    // 1. Check ETA Difference
                    if (eta && existing.eta && eta !== existing.eta) {
                        const dOld = new Date(existing.eta);
                        const dNew = new Date(eta);
                        if (!isNaN(dOld.getTime()) && !isNaN(dNew.getTime())) {
                            const diffTime = dNew.getTime() - dOld.getTime();
                            daysDiff = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                            
                            if (daysDiff > 0) changeType = 'DELAYED';
                            else if (daysDiff < 0) changeType = 'EARLIER';
                        }
                    }

                    // 2. Check Status Change (if not already marked as delay/early, or force status update logic)
                    if (status !== existing.status) {
                        if (changeType === 'UNCHANGED') changeType = 'STATUS_CHANGE';
                        // Note: If it's delayed AND status changed, 'DELAYED' takes precedence for the badge, 
                        // but we will show the status text change regardless.
                    }
                }

                summaryMap[id] = { 
                    id, 
                    status, 
                    eta, 
                    skuCount: 0, 
                    totalQty: 0,
                    changeType,
                    daysDiff,
                    oldEta,
                    oldStatus
                };
            }
            
            // Assuming row-level data is consistent for the same container, we just aggregate stats
            summaryMap[id].skuCount++;
            summaryMap[id].totalQty += qty;
        };

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length <= skuIdx) continue;
            
            const rawSku = String(row[skuIdx]).trim();
            if (!rawSku) continue;

            const parseDate = (val: any) => {
                if (!val) return undefined;
                if (val instanceof Date) return val.toISOString().split('T')[0];
                const d = new Date(val);
                return !isNaN(d.getTime()) ? d.toISOString().split('T')[0] : undefined;
            };

            const shipments: ShipmentDetail[] = [];

            // Process C1
            if (c1Idx !== -1 && row[c1Idx]) {
                const id = String(row[c1Idx]).trim();
                const qty = parseFloat(row[c1QtyIdx]) || 0;
                const status = c1StatusIdx !== -1 ? cleanStatus(row[c1StatusIdx]) : 'Pending';
                const eta = parseDate(row[c1EtaIdx]);
                if (id) {
                    shipments.push({ containerId: id, quantity: qty, status, eta });
                    updateSummary(id, status, eta, qty);
                }
            }

            // Process C2
            if (c2Idx !== -1 && row[c2Idx]) {
                const id = String(row[c2Idx]).trim();
                const qty = parseFloat(row[c2QtyIdx]) || 0;
                const status = c2StatusIdx !== -1 ? cleanStatus(row[c2StatusIdx]) : 'Pending';
                const eta = parseDate(row[c2EtaIdx]);
                if (id) {
                    shipments.push({ containerId: id, quantity: qty, status, eta });
                    updateSummary(id, status, eta, qty);
                }
            }

            if (shipments.length > 0) {
                updatesMap[rawSku] = shipments;
            }
        }

        const result: ShipmentUpdate[] = Object.entries(updatesMap).map(([sku, shipments]) => ({ sku, shipments }));
        
        // Sort summaries: Problems (Delays) first, then Opportunities (Earlier), then Updates, then New, then Unchanged
        const getPriority = (c: ContainerSummary) => {
            if (c.changeType === 'DELAYED') return 0;
            if (c.changeType === 'EARLIER') return 1;
            if (c.changeType === 'STATUS_CHANGE') return 2;
            if (c.changeType === 'NEW') return 3;
            return 4;
        };

        const summaries = Object.values(summaryMap).sort((a,b) => getPriority(a) - getPriority(b));
        
        setParsedUpdates(result);
        setContainerSummaries(summaries);

      } catch (err: any) {
          setError(err.message || "Failed to analyze file.");
      } finally {
          setIsProcessing(false);
      }
  };

  const getStatusColor = (status: string) => {
      const s = status.toLowerCase();
      if (s.includes('shipped')) return 'bg-blue-100 text-blue-800 border-blue-200';
      if (s.includes('arrived')) return 'bg-green-100 text-green-800 border-green-200';
      if (s.includes('delivered')) return 'bg-gray-100 text-gray-800 border-gray-200';
      return 'bg-amber-100 text-amber-800 border-amber-200';
  };

  const renderChangeBadge = (c: ContainerSummary) => {
      if (c.changeType === 'DELAYED') {
          return (
              <span className="flex items-center gap-1 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded border border-red-200">
                  <TrendingDown className="w-3 h-3" />
                  Delayed (+{c.daysDiff}d)
              </span>
          );
      }
      if (c.changeType === 'EARLIER') {
          return (
              <span className="flex items-center gap-1 text-xs font-bold text-green-600 bg-green-50 px-2 py-1 rounded border border-green-200">
                  <TrendingUp className="w-3 h-3" />
                  Early ({c.daysDiff}d)
              </span>
          );
      }
      if (c.changeType === 'NEW') {
          return (
              <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-1 rounded border border-blue-200">
                  NEW
              </span>
          );
      }
      if (c.changeType === 'STATUS_CHANGE') {
          return (
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-200">
                  Status Updated
              </span>
          );
      }
      return <span className="text-[10px] text-gray-400 font-medium">No Change</span>;
  };

  const stats = useMemo(() => {
      return {
          delayed: containerSummaries.filter(c => c.changeType === 'DELAYED').length,
          early: containerSummaries.filter(c => c.changeType === 'EARLIER').length,
          new: containerSummaries.filter(c => c.changeType === 'NEW').length,
      };
  }, [containerSummaries]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[90vh]">
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
        
        <div className="p-6 flex-1 overflow-y-auto">
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
                <div className="space-y-6">
                    {/* High Level Stats */}
                    <div className="grid grid-cols-4 gap-4">
                        <div className="p-3 bg-gray-50 rounded-xl border border-gray-200">
                            <span className="text-xs text-gray-500 font-bold uppercase">Total Containers</span>
                            <div className="text-xl font-bold text-gray-900 mt-1">{containerSummaries.length}</div>
                        </div>
                        <div className={`p-3 rounded-xl border ${stats.delayed > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                            <span className={`text-xs font-bold uppercase ${stats.delayed > 0 ? 'text-red-600' : 'text-gray-500'}`}>Delayed</span>
                            <div className={`text-xl font-bold mt-1 ${stats.delayed > 0 ? 'text-red-700' : 'text-gray-900'}`}>{stats.delayed}</div>
                        </div>
                        <div className={`p-3 rounded-xl border ${stats.early > 0 ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'}`}>
                            <span className={`text-xs font-bold uppercase ${stats.early > 0 ? 'text-green-600' : 'text-gray-500'}`}>Early</span>
                            <div className={`text-xl font-bold mt-1 ${stats.early > 0 ? 'text-green-700' : 'text-gray-900'}`}>{stats.early}</div>
                        </div>
                        <div className={`p-3 rounded-xl border ${stats.new > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                            <span className={`text-xs font-bold uppercase ${stats.new > 0 ? 'text-blue-600' : 'text-gray-500'}`}>New</span>
                            <div className={`text-xl font-bold mt-1 ${stats.new > 0 ? 'text-blue-700' : 'text-gray-900'}`}>{stats.new}</div>
                        </div>
                    </div>

                    <div className="border border-gray-200 rounded-xl overflow-hidden shadow-sm max-h-[400px] overflow-y-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500 font-bold text-xs uppercase sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="px-4 py-3 w-1/4">Container ID</th>
                                    <th className="px-4 py-3 w-1/6">Update Type</th>
                                    <th className="px-4 py-3 w-1/4">Status Change</th>
                                    <th className="px-4 py-3 w-1/4">ETA</th>
                                    <th className="px-4 py-3 text-right">Qty</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {containerSummaries.map((c) => {
                                    const isStatusChanged = c.oldStatus && c.oldStatus !== c.status;
                                    const isEtaChanged = c.oldEta && c.eta !== c.oldEta;

                                    return (
                                        <tr key={c.id} className={`hover:bg-gray-50 transition-colors ${c.changeType === 'DELAYED' ? 'bg-red-50/10' : ''}`}>
                                            <td className="px-4 py-3">
                                                <div className="font-mono font-bold text-gray-900">{c.id}</div>
                                                <div className="text-xs text-gray-500">{c.skuCount} SKUs</div>
                                            </td>
                                            <td className="px-4 py-3">
                                                {renderChangeBadge(c)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <div className="flex flex-col gap-1">
                                                    <span className={`inline-block w-fit px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${getStatusColor(c.status)}`}>
                                                        {c.status}
                                                    </span>
                                                    {isStatusChanged && (
                                                        <div className="flex items-center gap-1 text-[10px] text-gray-400">
                                                            <span className="line-through">{c.oldStatus}</span>
                                                            <ArrowRight className="w-3 h-3" />
                                                        </div>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-4 py-3 text-sm">
                                                <div className="font-medium text-gray-900">{c.eta || 'Pending'}</div>
                                                {isEtaChanged && c.oldEta && (
                                                    <div className="text-xs text-gray-400 line-through">{c.oldEta}</div>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-gray-800 font-mono">
                                                {c.totalQty}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    
                    <div className="flex items-center gap-2 p-3 bg-blue-50 text-blue-700 rounded-lg text-xs">
                        <AlertCircle className="w-4 h-4 flex-shrink-0" />
                        <p>This update will overwrite shipment details for these <strong>{containerSummaries.length}</strong> containers. Unlisted containers remain unchanged.</p>
                    </div>
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
