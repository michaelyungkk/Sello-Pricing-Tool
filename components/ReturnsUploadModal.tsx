
import React, { useState, useRef } from 'react';
import { Upload, X, Check, AlertCircle, Loader2, RotateCcw, Info, Link as LinkIcon, FileQuestion, Filter, Trash2 } from 'lucide-react';
import * as XLSX from 'xlsx';
import { RefundLog } from '../types';

interface ReturnsUploadModalProps {
  onClose: () => void;
  onConfirm: (refunds: RefundLog[]) => void;
  onReset?: () => void;
  existingOrders?: Map<string, string>; // OrderID -> Platform
}

const ReturnsUploadModal: React.FC<ReturnsUploadModalProps> = ({ onClose, onConfirm, onReset, existingOrders }) => {
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedRefunds, setParsedRefunds] = useState<RefundLog[] | null>(null);
  const [stats, setStats] = useState({ count: 0, totalValue: 0, matchedOrders: 0, orphans: 0 });
  const [debugInfo, setDebugInfo] = useState<{ unmatchedSamples: string[], dbSamples: string[], mappedColumn: string }>({ unmatchedSamples: [], dbSamples: [], mappedColumn: '' });
  
  // New State for Handling Strategy
  const [importStrategy, setImportStrategy] = useState<'ALL' | 'MATCHED_ONLY'>('ALL');
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  
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

  // Helper to generate a deterministic ID based on row content
  const generateRefundId = (sku: string, date: string, amount: number, qty: number, reason: string | undefined) => {
      const safeReason = (reason || 'unknown').trim().toLowerCase().substring(0, 20); 
      const signature = `${sku.trim().toUpperCase()}|${date}|${amount.toFixed(2)}|${qty}|${safeReason}`;
      
      let hash = 0;
      for (let i = 0; i < signature.length; i++) {
          const char = signature.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash |= 0; 
      }
      return `ref-${Math.abs(hash).toString(36)}`;
  };

  const analyzeRows = (rows: any[][]) => {
      try {
        if (rows.length < 2) throw new Error("File empty.");

        const originalHeaders = rows[0].map(h => String(h).trim());
        const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/[\s_\-\/]/g, ''));
        
        const findColPriority = (terms: string[]) => {
            for (const term of terms) {
                const idx = headers.findIndex(h => h === term || h.includes(term));
                if (idx !== -1) return idx;
            }
            return -1;
        };

        // --- CORE FIELDS ---
        const skuIdx = findColPriority(['productsku', 'sku']);
        const amountIdx = findColPriority(['refundamount', 'refundvalue', 'amount']);
        const qtyIdx = findColPriority(['refundqty', 'quantity', 'returnqty']);
        const dateIdx = findColPriority(['creationtime', 'date', 'applicationtime']);
        const platformIdx = findColPriority(['channel', 'platform']); // Fallback platform column
        
        // --- DETAILED FIELDS FOR DEEP DIVE ---
        const typeIdx = findColPriority(['after-salestype', 'servicetype', 'type']);
        const statusIdx = findColPriority(['after-salesstatus', 'status']);
        const custReasonIdx = findColPriority(['reasonforrefund', 'reasonforreturn', 'buyerreason', 'returnreason']);
        // Updated priority to ensure 'platform' is part of the name
        const platReasonIdx = findColPriority(['platformafter-salesreason', 'platformreason', 'platform_after_sales_reason']);
        const remarksIdx = findColPriority(['remarks', 'memo', 'comments']);
        
        // --- STRICT ORDER ID MAPPING ---
        let orderIdIdx = findColPriority([
            'thirdpartyordernumber', 
            'thirdpartyorderno', 
            '3rdpartyordernumber',
            'externalordernumber'
        ]);

        if (orderIdIdx === -1) {
            orderIdIdx = findColPriority(['ordernumber', 'orderid', 'order_id']);
        }

        if (skuIdx === -1) throw new Error("Could not detect 'Product SKU' column.");
        if (amountIdx === -1) throw new Error("Could not detect 'Refund Amount' column.");
        if (dateIdx === -1) throw new Error("Could not detect 'Creation Time' column.");

        const detectedOrderColumn = orderIdIdx !== -1 ? originalHeaders[orderIdIdx] : 'Not Found';

        const refunds: RefundLog[] = [];
        let totalValue = 0;
        let matchedOrders = 0;
        let orphans = 0;
        const unmatchedSamples: string[] = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length <= skuIdx) continue;
            
            const sku = String(row[skuIdx]).trim();
            if (!sku) continue;

            const parseDate = (val: any) => {
                if (!val) return new Date().toISOString();
                if (val instanceof Date) return val.toISOString();
                
                const dateStr = String(val).trim();
                const ukRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
                const match = dateStr.match(ukRegex);
                
                if (match) {
                    const day = match[1];
                    const month = match[2];
                    const year = match[3];
                    const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    if (dateStr.includes(':')) {
                        const timePart = dateStr.split(/\s+/).slice(1).join(' ');
                        const d = new Date(`${isoDate}T${timePart}`);
                        if (!isNaN(d.getTime())) return d.toISOString();
                    }
                    const d = new Date(isoDate);
                    d.setHours(12,0,0,0);
                    if (!isNaN(d.getTime())) return d.toISOString();
                }
                const d = new Date(dateStr);
                return !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
            };

            const parsedDate = parseDate(row[dateIdx]);
            const amount = parseFloat(String(row[amountIdx])) || 0;
            const quantity = qtyIdx !== -1 ? (parseFloat(String(row[qtyIdx])) || 1) : 1;
            
            // Extract Detailed Info
            const type = typeIdx !== -1 ? String(row[typeIdx]).trim() : undefined;
            const status = statusIdx !== -1 ? String(row[statusIdx]).trim() : undefined;
            const customerReason = custReasonIdx !== -1 ? String(row[custReasonIdx]).trim() : undefined;
            const platformReason = platReasonIdx !== -1 ? String(row[platReasonIdx]).trim() : undefined;
            const remarks = remarksIdx !== -1 ? String(row[remarksIdx]).trim() : undefined;

            // Updated Priority: Platform Reason first, as requested
            const displayReason = platformReason || customerReason || undefined;

            // Order Match Logic
            const orderId = orderIdIdx !== -1 ? String(row[orderIdIdx]).trim() : undefined;
            
            // Platform Logic: Transaction Record Priority -> File Fallback -> Unknown
            let finalPlatform = platformIdx !== -1 ? String(row[platformIdx]) : undefined;

            // FIX: 'Mirakl' is an operating system, not a consumer marketplace.
            // If the file explicitly lists it (often in Channel column), ignore it.
            if (finalPlatform && finalPlatform.toLowerCase() === 'mirakl') {
                finalPlatform = undefined;
            }

            if (existingOrders && existingOrders.size > 0 && orderId) {
                if (existingOrders.has(orderId)) {
                    matchedOrders++;
                    // Override with trusted platform from transaction history
                    finalPlatform = existingOrders.get(orderId);
                } else {
                    orphans++;
                    if (unmatchedSamples.length < 3) unmatchedSamples.push(orderId);
                }
            }

            const uniqueId = generateRefundId(sku, parsedDate, amount, quantity, displayReason);

            refunds.push({
                id: uniqueId,
                sku,
                date: parsedDate,
                amount,
                quantity,
                platform: finalPlatform,
                reason: displayReason,
                orderId: orderId,
                
                // Captured detailed fields
                type,
                status,
                customerReason,
                platformReason,
                remarks
            });

            totalValue += amount;
        }
        
        setParsedRefunds(refunds);
        setStats({ count: refunds.length, totalValue, matchedOrders, orphans });
        
        const dbSamples = existingOrders ? Array.from(existingOrders.keys()).slice(0, 3) : [];
        setDebugInfo({ unmatchedSamples, dbSamples, mappedColumn: detectedOrderColumn });

      } catch (err: any) {
          setError(err.message || "Failed to analyze file.");
      } finally {
          setIsProcessing(false);
      }
  };

  const handleConfirm = () => {
      if (!parsedRefunds) return;
      
      let finalData = parsedRefunds;
      
      if (importStrategy === 'MATCHED_ONLY' && existingOrders) {
          finalData = parsedRefunds.filter(r => r.orderId && existingOrders.has(r.orderId));
      }
      
      onConfirm(finalData);
  };

  const recordsToImport = importStrategy === 'ALL' ? stats.count : stats.matchedOrders;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col relative overflow-hidden">
        
        {/* RESET CONFIRMATION OVERLAY */}
        {isResetConfirmOpen && (
            <div className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-8 animate-in fade-in duration-200">
                <div className="bg-red-50 p-4 rounded-full mb-6">
                    <AlertCircle className="w-12 h-12 text-red-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Clear Refund History?</h3>
                <p className="text-gray-500 text-center max-w-md mb-8">
                    This will <strong>permanently delete</strong> all existing refund records. This is recommended if your current data contains errors (e.g. incorrect 'Mirakl' platforms).
                </p>
                <div className="flex gap-4">
                    <button
                        onClick={() => setIsResetConfirmOpen(false)}
                        className="px-6 py-3 text-gray-700 font-bold hover:bg-gray-100 rounded-xl transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => {
                            if (onReset) onReset();
                            setIsResetConfirmOpen(false);
                        }}
                        className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg hover:shadow-red-500/30 transition-all flex items-center gap-2"
                    >
                        <Trash2 className="w-4 h-4" />
                        Yes, Wipe Everything
                    </button>
                </div>
            </div>
        )}

        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg text-red-600">
                  <RotateCcw className="w-5 h-5" />
              </div>
              <div>
                  <h2 className="text-xl font-bold text-gray-900">Import Refunds & Returns</h2>
                  <p className="text-xs text-gray-500">Analyze return rates and calculate net sales</p>
              </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
        </div>
        
        <div className="p-6 max-h-[60vh] overflow-y-auto">
            {!parsedRefunds ? (
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
                            <p className="text-indigo-600 font-medium">Processing Report...</p>
                        </div>
                    ) : (
                        <>
                            <div className="w-14 h-14 bg-red-50 text-red-500 rounded-full flex items-center justify-center mb-4">
                                <RotateCcw className="w-7 h-7" />
                            </div>
                            <p className="text-gray-900 font-medium text-lg">Upload Refund/Return Report</p>
                            <p className="text-sm text-gray-500 mt-1">Supports your standard After-sales export (XLSX)</p>
                            
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

                   {/* Date Format Warning */}
                   <div className="mt-4 bg-amber-50 p-3 rounded-lg border border-amber-200 text-xs text-amber-800 text-left flex items-start gap-2">
                       <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                       <div>
                           <strong>Requirements:</strong>
                           <ul className="list-disc pl-4 mt-1 space-y-0.5">
                               <li>Date Column: <strong>Creation Time</strong> (Format: <code>DD/MM/YYYY</code>)</li>
                               <li>Validation Column: <strong>Third-Party Order Number</strong> (Exact match preferred).</li>
                           </ul>
                       </div>
                   </div>
                </div>
            ) : (
                <div className="space-y-6 text-center">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                            <div className="text-2xl font-bold text-red-700">{stats.count}</div>
                            <div className="text-xs text-red-600 font-bold uppercase">Refunds Found</div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="text-2xl font-bold text-gray-700">£{stats.totalValue.toFixed(2)}</div>
                            <div className="text-xs text-gray-600 font-bold uppercase">Total Value</div>
                        </div>
                    </div>

                    {/* Order ID Validation Results */}
                    {existingOrders && existingOrders.size > 0 ? (
                        <div className={`p-4 rounded-xl border flex flex-col gap-3 text-left ${stats.orphans > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                            <div className="flex items-center gap-3">
                                {stats.orphans > 0 ? (
                                    <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" />
                                ) : (
                                    <LinkIcon className="w-6 h-6 text-green-600 flex-shrink-0" />
                                )}
                                <div>
                                    <h4 className={`text-sm font-bold ${stats.orphans > 0 ? 'text-amber-800' : 'text-green-800'}`}>
                                        {stats.orphans > 0 ? 'Order Linking Issues Found' : 'All Refunds Linked Successfully'}
                                    </h4>
                                    <p className="text-xs text-gray-600 mt-1">
                                        Matched {stats.matchedOrders} orders. 
                                        {stats.orphans > 0 && <span className="font-bold"> {stats.orphans} refunds could not be linked to a known order ID.</span>}
                                    </p>
                                </div>
                            </div>

                            {/* Handling Strategy for Orphans */}
                            {stats.orphans > 0 && (
                                <div className="mt-2 pt-2 border-t border-amber-200">
                                    <div className="flex flex-col gap-2">
                                        <p className="text-xs font-bold text-amber-900">How to handle these {stats.orphans} unmatched refunds?</p>
                                        <div className="flex gap-3">
                                            <button 
                                                onClick={() => setImportStrategy('ALL')}
                                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                                                    importStrategy === 'ALL' 
                                                    ? 'bg-amber-600 text-white border-amber-700 shadow-sm' 
                                                    : 'bg-white text-amber-800 border-amber-200 hover:bg-amber-50'
                                                }`}
                                            >
                                                <div className={`w-3 h-3 rounded-full border border-current ${importStrategy === 'ALL' ? 'bg-white' : 'bg-transparent'}`}></div>
                                                Keep All
                                            </button>
                                            <button 
                                                onClick={() => setImportStrategy('MATCHED_ONLY')}
                                                className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${
                                                    importStrategy === 'MATCHED_ONLY' 
                                                    ? 'bg-green-600 text-white border-green-700 shadow-sm' 
                                                    : 'bg-white text-green-800 border-green-200 hover:bg-green-50'
                                                }`}
                                            >
                                                <Filter className="w-3 h-3" />
                                                Exclude Unmatched
                                            </button>
                                        </div>
                                        <p className="text-[10px] text-amber-700 mt-1 italic">
                                            * Recommended: "Exclude Unmatched" to ignore pre-fulfillment cancellations that don't have a corresponding sales record.
                                        </p>
                                    </div>
                                </div>
                            )}

                            {/* Debugging Info for Mismatches */}
                            <div className="mt-2 p-3 bg-white rounded border border-amber-100 text-xs">
                                <div className="flex items-center gap-2 mb-2 text-amber-700 font-bold border-b border-amber-50 pb-1">
                                    <FileQuestion className="w-3 h-3" /> Data Mismatch Diagnostics
                                </div>
                                <div className="mb-3 p-2 bg-gray-50 rounded border border-gray-200 flex items-center gap-2">
                                    <span className="text-gray-500 uppercase text-[10px] font-bold">Mapped Order ID Column:</span>
                                    <span className={`font-mono font-bold ${debugInfo.mappedColumn.toLowerCase().includes('third') ? 'text-green-600' : 'text-amber-600'}`}>
                                        {debugInfo.mappedColumn || 'None Detected'}
                                    </span>
                                    {!debugInfo.mappedColumn.toLowerCase().includes('third') && (
                                        <span className="text-[10px] text-red-500 ml-auto flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" /> Warning: Not Third-Party
                                        </span>
                                    )}
                                </div>
                                
                                {stats.orphans > 0 && (
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <span className="block text-gray-500 uppercase text-[10px] mb-1">IDs in Refund File (Example)</span>
                                            <ul className="list-disc pl-4 space-y-0.5 text-gray-700 font-mono">
                                                {debugInfo.unmatchedSamples.map(id => <li key={id}>{id}</li>)}
                                                {debugInfo.unmatchedSamples.length === 0 && <li className="italic text-gray-400">None detected</li>}
                                            </ul>
                                        </div>
                                        <div>
                                            <span className="block text-gray-500 uppercase text-[10px] mb-1">IDs in Sales Database (Example)</span>
                                            <ul className="list-disc pl-4 space-y-0.5 text-gray-700 font-mono">
                                                {debugInfo.dbSamples.map(id => <li key={id}>{id}</li>)}
                                                {debugInfo.dbSamples.length === 0 && <li className="italic text-gray-400">Database is empty</li>}
                                            </ul>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        <div className="p-4 rounded-xl border bg-gray-50 border-gray-200 text-left text-xs text-gray-500">
                            <p><strong>Note:</strong> No sales history loaded (or no Order IDs mapped in Sales). Validation skipped.</p>
                        </div>
                    )}
                    
                    <p className="text-sm text-gray-500">
                        These refunds will be aggregated by SKU and date. Any records that already exist in the database (based on exact match of data) will be skipped automatically.
                    </p>
                </div>
            )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-between items-center rounded-b-2xl">
            <div>
                {onReset && (
                    <button
                        onClick={() => setIsResetConfirmOpen(true)}
                        title="Delete all refund history"
                        className="text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-50 transition-all shadow-sm bg-white"
                    >
                        <Trash2 className="w-3 h-3" />
                        Reset Data
                    </button>
                )}
            </div>
            <div className="flex gap-3">
                <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors">Cancel</button>
                {parsedRefunds && parsedRefunds.length > 0 && (
                    <button 
                        onClick={handleConfirm}
                        className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition-colors flex items-center gap-2"
                    >
                        <Check className="w-4 h-4" />
                        Import {recordsToImport} Refunds
                    </button>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default ReturnsUploadModal;
