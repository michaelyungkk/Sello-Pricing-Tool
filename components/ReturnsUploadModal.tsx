
import React, { useState, useRef } from 'react';
import { Upload, X, Check, AlertCircle, Loader2, RotateCcw, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { RefundLog } from '../types';

interface ReturnsUploadModalProps {
  onClose: () => void;
  onConfirm: (refunds: RefundLog[]) => void;
}

const ReturnsUploadModal: React.FC<ReturnsUploadModalProps> = ({ onClose, onConfirm }) => {
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedRefunds, setParsedRefunds] = useState<RefundLog[] | null>(null);
  const [stats, setStats] = useState({ count: 0, totalValue: 0 });
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

  // Helper to generate a deterministic ID based on row content (Without Order ID)
  const generateRefundId = (sku: string, date: string, amount: number, qty: number, reason: string | undefined) => {
      // Create a composite key using available data points
      // We rely on SKU + Date + Amount + Qty + Reason to be unique enough for a refund line item
      const safeReason = (reason || 'unknown').trim().toLowerCase().substring(0, 20); // First 20 chars of reason
      const signature = `${sku.trim().toUpperCase()}|${date}|${amount.toFixed(2)}|${qty}|${safeReason}`;
      
      // Simple hash function to create a short unique string
      let hash = 0;
      for (let i = 0; i < signature.length; i++) {
          const char = signature.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash |= 0; // Convert to 32bit integer
      }
      // Return a base36 string of the absolute hash
      return `ref-${Math.abs(hash).toString(36)}`;
  };

  const analyzeRows = (rows: any[][]) => {
      try {
        if (rows.length < 2) throw new Error("File empty.");

        // Headers cleaning
        const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/[\s_\-\/]/g, ''));
        
        // --- Column Mapping (Based on user screenshot) ---
        const findCol = (terms: string[]) => headers.findIndex(h => terms.some(t => h === t || h.includes(t)));

        const skuIdx = findCol(['productsku', 'sku']);
        const amountIdx = findCol(['refundamount', 'refundvalue']);
        const qtyIdx = findCol(['refundqty', 'quantity', 'returnqty']);
        
        // Explicitly look for "creationtime" as requested
        const dateIdx = findCol(['creationtime', 'date', 'applicationtime']);
        
        const platformIdx = findCol(['channel', 'platform']);
        const reasonIdx = findCol(['platformafter-salesreason', 'reason', 'after-salesreason', 'returnreason']); // Matches "Platform after-sales reason"

        if (skuIdx === -1) throw new Error("Could not detect 'Product SKU' column.");
        if (amountIdx === -1) throw new Error("Could not detect 'Refund Amount' column.");
        if (dateIdx === -1) throw new Error("Could not detect 'Creation Time' column.");

        const refunds: RefundLog[] = [];
        let totalValue = 0;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length <= skuIdx) continue;
            
            const sku = String(row[skuIdx]).trim();
            if (!sku) continue;

            const parseDate = (val: any) => {
                if (!val) return new Date().toISOString();
                
                // Handle Excel Date Object
                if (val instanceof Date) return val.toISOString();
                
                const dateStr = String(val).trim();
                
                // --- UK Date Format Parsing (DD/MM/YYYY) ---
                // Matches 22/12/2025
                const ukRegex = /^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/;
                const match = dateStr.match(ukRegex);
                
                if (match) {
                    const day = match[1];
                    const month = match[2];
                    const year = match[3];
                    // Reconstruct as ISO YYYY-MM-DD
                    const isoDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
                    
                    // If time is present in the string (e.g. 12:32), try to preserve it
                    if (dateStr.includes(':')) {
                        const timePart = dateStr.split(/\s+/).slice(1).join(' ');
                        const d = new Date(`${isoDate}T${timePart}`);
                        if (!isNaN(d.getTime())) return d.toISOString();
                    }
                    
                    const d = new Date(isoDate);
                    // Set to noon to avoid timezone rolling date back
                    d.setHours(12,0,0,0);
                    if (!isNaN(d.getTime())) return d.toISOString();
                }

                // Fallback to standard JS parsing
                const d = new Date(dateStr);
                return !isNaN(d.getTime()) ? d.toISOString() : new Date().toISOString();
            };

            const parsedDate = parseDate(row[dateIdx]);
            const amount = parseFloat(String(row[amountIdx])) || 0;
            const quantity = qtyIdx !== -1 ? (parseFloat(String(row[qtyIdx])) || 1) : 1;
            const reason = reasonIdx !== -1 ? String(row[reasonIdx]) : undefined;

            // Generate deterministic ID using SKU + Date + Amount + Qty + Reason
            // This replaces the need for an Order ID
            const uniqueId = generateRefundId(sku, parsedDate, amount, quantity, reason);

            refunds.push({
                id: uniqueId,
                sku,
                date: parsedDate,
                amount,
                quantity,
                platform: platformIdx !== -1 ? String(row[platformIdx]) : undefined,
                reason: reason,
                orderId: undefined // Not available in report
            });

            totalValue += amount;
        }
        
        setParsedRefunds(refunds);
        setStats({ count: refunds.length, totalValue });

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
        
        <div className="p-6">
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
                           <strong>File Handling:</strong>
                           <ul className="list-disc pl-4 mt-1 space-y-0.5">
                               <li>Date Column: <strong>Creation Time</strong> (Format: <code>DD/MM/YYYY</code>)</li>
                               <li>Duplicate Detection: Uses <strong>SKU + Date + Amount + Reason</strong> to identify unique refunds (since Order ID is missing).</li>
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
                    
                    <p className="text-sm text-gray-500">
                        These refunds will be aggregated by SKU and date. Any records that already exist in the database (based on exact match of data) will be skipped automatically.
                    </p>
                </div>
            )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors">Cancel</button>
            {parsedRefunds && parsedRefunds.length > 0 && (
                <button 
                    onClick={() => onConfirm(parsedRefunds)}
                    className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 transition-colors flex items-center gap-2"
                >
                    <Check className="w-4 h-4" />
                    Import Refunds
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default ReturnsUploadModal;
