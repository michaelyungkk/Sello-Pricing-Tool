
import React, { useState, useRef } from 'react';
import { Upload, X, Check, AlertCircle, Loader2, RotateCcw, Info, Link as LinkIcon, FileQuestion, Filter, Trash2, FileText, MessageSquare } from 'lucide-react';
import * as XLSX from 'xlsx';
import { RefundLog } from '../types';
import { VAT_MULTIPLIER } from '../constants';
import { asDateKeyNaive } from '../services/dateUtils';
import { getCanonicalSku } from '../services/skuNormalization';

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
  
  // File states
  const [detailsFile, setDetailsFile] = useState<File | null>(null);
  const [commentsFile, setCommentsFile] = useState<File | null>(null);

  const [parsedRefunds, setParsedRefunds] = useState<RefundLog[] | null>(null);
  const [stats, setStats] = useState({ count: 0, totalValue: 0, matchedOrders: 0, orphans: 0 });
  const [debugInfo, setDebugInfo] = useState<{ unmatchedSamples: string[], dbSamples: string[], mappedColumn: string }>({ unmatchedSamples: [], dbSamples: [], mappedColumn: '' });
  
  const [importStrategy, setImportStrategy] = useState<'ALL' | 'MATCHED_ONLY'>('ALL');
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  
  const detailsInputRef = useRef<HTMLInputElement>(null);
  const commentsInputRef = useRef<HTMLInputElement>(null);

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
        // For drop, we default to details if empty
        if (!detailsFile) setDetailsFile(e.dataTransfer.files[0]);
        else if (!commentsFile) setCommentsFile(e.dataTransfer.files[0]);
    }
  };

  const readExcel = (file: File): Promise<any[]> => {
      return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => {
              try {
                  const data = e.target?.result;
                  if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                      const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                      const sheet = workbook.Sheets[workbook.SheetNames[0]];
                      resolve(XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[]);
                  } else {
                      const text = data as string;
                      resolve(text.split('\n').map(l => l.split(',')));
                  }
              } catch (err) {
                  reject(err);
              }
          };
          if (file.name.endsWith('.xlsx')) reader.readAsArrayBuffer(file);
          else reader.readAsText(file);
      });
  };

  const processFiles = async () => {
    setIsProcessing(true);
    setError(null);

    try {
        if (!detailsFile || !commentsFile) throw new Error("Both files required for import");
        const detailsRows = await readExcel(detailsFile);
        const commentsRows = await readExcel(commentsFile);
        analyzeV2Rows(detailsRows, commentsRows);
    } catch (err: any) {
        setError(err.message || "Failed to process files");
        setIsProcessing(false);
    }
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

  const findColPriority = (headers: string[], terms: string[]) => {
      for (const term of terms) {
          const idx = headers.findIndex(h => h === term || h.includes(term));
          if (idx !== -1) return idx;
      }
      return -1;
  };

  const analyzeV2Rows = (detailsRows: any[][], commentsRows: any[][]) => {
      // 1. Map Comments by Order ID
      const commentMap = new Map<string, { cn: string, en: string }>();
      if (commentsRows.length > 1) {
          const cHeaders = commentsRows[0].map(h => String(h).trim().toLowerCase().replace(/[\s_\-\/]/g, ''));
          const cOrderIdx = findColPriority(cHeaders, ['outerorderid', 'orderid']);
          const cnIdx = findColPriority(cHeaders, ['commentcn', 'chinesememo']);
          const enIdx = findColPriority(cHeaders, ['commenten', 'englishmemo']);
          
          if (cOrderIdx !== -1) {
              for (let i = 1; i < commentsRows.length; i++) {
                  const row = commentsRows[i];
                  const oid = String(row[cOrderIdx] || '').trim();
                  if (oid) {
                      commentMap.set(oid, {
                          cn: cnIdx !== -1 ? String(row[cnIdx] || '') : '',
                          en: enIdx !== -1 ? String(row[enIdx] || '') : ''
                      });
                  }
              }
          }
      }

      // 2. Parse Details
      if (detailsRows.length < 2) throw new Error("Details file empty");
      const dHeaders = detailsRows[0].map(h => String(h).trim().toLowerCase().replace(/[\s_\-\/]/g, ''));
      
      const skuIdx = findColPriority(dHeaders, ['skucode', 'sku']);
      const orderIdx = findColPriority(dHeaders, ['outerorderid', 'orderid']);
      const amtIdx = findColPriority(dHeaders, ['returnamt', 'amount']);
      const qtyIdx = findColPriority(dHeaders, ['returnqty', 'qty']);
      const typeIdx = findColPriority(dHeaders, ['ordertype', 'type']);
      
      // Look for reason detail first, then fallback to general reason
      let reasonIdx = findColPriority(dHeaders, ['returnreasondetail', 'return_reason_detail']);
      if (reasonIdx === -1) reasonIdx = findColPriority(dHeaders, ['returnreason', 'reason']);
      
      // Update date columns to include order date and payment date candidates
      const dateIdx = findColPriority(dHeaders, ['ordertime', 'time', 'orderdate', 'date', 'refundtime', 'refund_time']);
      const platformIdx = findColPriority(dHeaders, ['platformname', 'platform']);

      const missingCols: string[] = [];
      if (skuIdx === -1) missingCols.push("SKU (sku_code)");
      if (orderIdx === -1) missingCols.push("Order ID (outer_order_id)");
      if (amtIdx === -1) missingCols.push("Refund Amount (return_amt)");

      if (missingCols.length > 0) {
         throw new Error(`Missing required columns in Details file: ${missingCols.join(', ')}`);
      }

      // Group by Order ID to handle Freight aggregation
      const orderGroups = new Map<string, { freight: number, items: any[] }>();

      for (let i = 1; i < detailsRows.length; i++) {
          const row = detailsRows[i];
          const oid = String(row[orderIdx] || '').trim();
          if (!oid) continue;

          if (!orderGroups.has(oid)) orderGroups.set(oid, { freight: 0, items: [] });
          const group = orderGroups.get(oid)!;

          const rawSku = String(row[skuIdx] || '').trim();
          const amt = parseFloat(String(row[amtIdx])) || 0; // V2 is Ex-VAT already
          
          if (rawSku.toLowerCase() === 'freight') {
              group.freight += amt;
          } else {
              const sku = getCanonicalSku(rawSku);
              group.items.push({ row, sku, amt });
          }
      }

      const refunds: RefundLog[] = [];
      let totalValue = 0;
      let matchedOrders = 0;
      let orphans = 0;
      const unmatchedSamples: string[] = [];

      orderGroups.forEach((group, oid) => {
          const totalItemVal = group.items.reduce((sum, it) => sum + it.amt, 0);
          
          group.items.forEach(it => {
              const { row, sku, amt } = it;
              
              // Allocate freight proportionally by value
              const allocatedFreight = totalItemVal > 0 
                  ? (amt / totalItemVal) * group.freight 
                  : (group.freight / group.items.length);

              let qty = 0;
              if (qtyIdx !== -1) {
                  const rawQty = row[qtyIdx];
                  if (rawQty === undefined || rawQty === null || String(rawQty).trim() === '') {
                      qty = 1; 
                  } else {
                      qty = parseFloat(String(rawQty)) || 0;
                  }
              } else {
                  qty = 1;
              }

              const oType = typeIdx !== -1 ? String(row[typeIdx]).toLowerCase() : 'refund';
              const reason = reasonIdx !== -1 ? String(row[reasonIdx]) : undefined;
              
              // Date
              let dateStr = new Date().toISOString();
              const rawDate = (dateIdx !== -1) ? row[dateIdx] : undefined;
              if (rawDate) {
                 const dKey = asDateKeyNaive(rawDate);
                 if (dKey) dateStr = new Date(dKey).toISOString();
              }

              // Platform Match
              let finalPlatform = platformIdx !== -1 ? String(row[platformIdx]) : undefined;
              if (existingOrders && existingOrders.size > 0) {
                  if (existingOrders.has(oid)) {
                      matchedOrders++;
                      finalPlatform = existingOrders.get(oid);
                  } else {
                      orphans++;
                      if (unmatchedSamples.length < 10) unmatchedSamples.push(`${oid} (SKU: ${sku})`);
                  }
              }

              const comments = commentMap.get(oid);
              const uniqueId = generateRefundId(sku, dateStr, amt, qty, reason);

              let resendBase = undefined;
              if (oType.includes('resend') || oid.includes('-resend')) {
                  resendBase = oid.replace(/-resend$/i, '');
              }

              refunds.push({
                  id: uniqueId,
                  sku,
                  date: dateStr,
                  amount: amt, // Ex-VAT
                  freightAmount: allocatedFreight, // Ex-VAT
                  quantity: qty,
                  platform: finalPlatform,
                  reason: reason, 
                  orderId: oid,
                  orderType: oType as any,
                  resendBaseOrderId: resendBase,
                  commentCn: comments?.cn,
                  commentEn: comments?.en
              });

              totalValue += ((amt + allocatedFreight) * VAT_MULTIPLIER); // Display Total Inc-VAT
          });
      });

      setParsedRefunds(refunds);
      setStats({ count: refunds.length, totalValue, matchedOrders, orphans });
      setDebugInfo({ unmatchedSamples, dbSamples: [], mappedColumn: 'outer_order_id' });
      setIsProcessing(false);
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
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-xl flex flex-col relative overflow-hidden max-h-[90vh]">
        
        {/* RESET CONFIRMATION OVERLAY */}
        {isResetConfirmOpen && (
            <div className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-8 animate-in fade-in duration-200">
                <div className="bg-red-50 p-4 rounded-full mb-6">
                    <AlertCircle className="w-12 h-12 text-red-600" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Clear Refund History?</h3>
                <p className="text-gray-500 text-center max-w-md mb-8">
                    This will <strong>permanently delete</strong> all existing refund records. This is recommended if your current data contains errors.
                </p>
                <div className="flex gap-4">
                    <button onClick={() => setIsResetConfirmOpen(false)} className="px-6 py-3 text-gray-700 font-medium hover:bg-gray-100 rounded-xl transition-colors">Cancel</button>
                    <button onClick={() => { if (onReset) onReset(); setIsResetConfirmOpen(false); }} className="px-6 py-3 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700 shadow-lg hover:shadow-red-500/30 transition-all flex items-center gap-2"><Trash2 className="w-4 h-4" />Yes, Wipe Everything</button>
                </div>
            </div>
        )}

        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg text-red-600"><RotateCcw className="w-5 h-5" /></div>
              <div><h2 className="text-xl font-bold text-gray-900">Import Refunds & Returns</h2><p className="text-xs text-gray-500">Upload the "Return Details" and "Comments" files from ERP.</p></div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
        </div>
        
        <div className="p-6 overflow-y-auto">
            {!parsedRefunds ? (
                <div className="space-y-6">
                    <div 
                        className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50/50'}`}
                        onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                    >
                        <div className="space-y-4 w-full max-w-sm">
                            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:border-indigo-300" onClick={() => detailsInputRef.current?.click()}>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-blue-50 text-blue-600 rounded"><FileText className="w-4 h-4" /></div>
                                    <div className="text-left"><span className="text-xs font-medium text-gray-700 block">Return Details.xlsx</span><span className="text-[10px] text-gray-400">{detailsFile ? detailsFile.name : 'Required'}</span></div>
                                </div>
                                {detailsFile ? <Check className="w-4 h-4 text-green-500" /> : <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Select</span>}
                            </div>
                            <input ref={detailsInputRef} type="file" className="hidden" onChange={(e) => e.target.files && setDetailsFile(e.target.files[0])} accept=".xlsx,.xls" />

                            <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:border-indigo-300" onClick={() => commentsInputRef.current?.click()}>
                                <div className="flex items-center gap-3">
                                    <div className="p-2 bg-amber-50 text-amber-600 rounded"><MessageSquare className="w-4 h-4" /></div>
                                    <div className="text-left"><span className="text-xs font-medium text-gray-700 block">Return Order Comment.xlsx</span><span className="text-[10px] text-gray-400">{commentsFile ? commentsFile.name : 'Required'}</span></div>
                                </div>
                                {commentsFile ? <Check className="w-4 h-4 text-green-500" /> : <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Select</span>}
                            </div>
                            <input ref={commentsInputRef} type="file" className="hidden" onChange={(e) => e.target.files && setCommentsFile(e.target.files[0])} accept=".xlsx,.xls" />
                        </div>
                        
                        <p className="text-xs text-gray-400 mt-4">Drag & drop files here or click boxes to browse.</p>
                    </div>

                    {error && <div className="p-3 bg-red-50 text-red-700 border border-red-100 rounded-lg text-xs flex items-center gap-2"><AlertCircle className="w-4 h-4"/>{error}</div>}
                    
                    <button 
                        onClick={processFiles} 
                        disabled={isProcessing || !detailsFile || !commentsFile}
                        className="w-full py-3 bg-indigo-600 text-white font-medium rounded-xl shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Process Files'}
                    </button>
                </div>
            ) : (
                <div className="space-y-6 text-center">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                            <div className="text-2xl font-bold text-red-700">{stats.count}</div>
                            <div className="text-xs text-red-600 font-medium uppercase">Refunds Found</div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="text-2xl font-bold text-gray-700">£{stats.totalValue.toFixed(2)}</div>
                            <div className="text-xs text-gray-600 font-medium uppercase">Total Value (Inc VAT)</div>
                        </div>
                    </div>

                    {existingOrders && existingOrders.size > 0 ? (
                        <div className={`p-4 rounded-xl border flex flex-col gap-3 text-left ${stats.orphans > 0 ? 'bg-amber-50 border-amber-200' : 'bg-green-50 border-green-200'}`}>
                            <div className="flex items-center gap-3">
                                {stats.orphans > 0 ? <AlertCircle className="w-6 h-6 text-amber-600 flex-shrink-0" /> : <LinkIcon className="w-6 h-6 text-green-600 flex-shrink-0" />}
                                <div>
                                    <h4 className={`text-sm font-bold ${stats.orphans > 0 ? 'text-amber-800' : 'text-green-800'}`}>{stats.orphans > 0 ? 'Order Linking Issues' : 'Linked Successfully'}</h4>
                                    <p className="text-xs text-gray-600 mt-1">Matched {stats.matchedOrders} orders. {stats.orphans > 0 && <span className="font-bold">{stats.orphans} unmatched.</span>}</p>
                                </div>
                            </div>

                            {stats.orphans > 0 && (
                                <div className="mt-2 pt-2 border-t border-amber-200 space-y-3">
                                    <div className="bg-white/60 p-2 rounded border border-amber-200/60">
                                        <div className="flex items-start gap-2">
                                            <div className="mt-0.5"><FileQuestion className="w-3.5 h-3.5 text-amber-600" /></div>
                                            <div className="flex-1">
                                                <p className="text-xs font-bold text-amber-800 mb-1">Mismatch Analysis (Top 10):</p>
                                                <ul className="text-[10px] text-amber-900 font-mono space-y-1 mb-2">
                                                    {debugInfo.unmatchedSamples.map((s, i) => (
                                                        <li key={i} className="flex items-center gap-1.5">
                                                            <span className="w-1 h-1 rounded-full bg-amber-400 flex-shrink-0"></span>
                                                            <span className="opacity-90">{s}</span>
                                                        </li>
                                                    ))}
                                                </ul>
                                                <p className="text-[10px] text-amber-700 italic leading-relaxed">
                                                    <strong>Likely Cause:</strong> Order IDs not found in Sales History. <br/>
                                                    Ensure sales data covers the dates for these returns.
                                                </p>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex flex-col gap-2">
                                        <p className="text-xs font-bold text-amber-900">Unmatched Strategy:</p>
                                        <div className="flex gap-3">
                                            <button onClick={() => setImportStrategy('ALL')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${importStrategy === 'ALL' ? 'bg-amber-600 text-white border-amber-700' : 'bg-white text-amber-800 border-amber-200'}`}>Keep All</button>
                                            <button onClick={() => setImportStrategy('MATCHED_ONLY')} className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg border text-xs font-bold transition-all ${importStrategy === 'MATCHED_ONLY' ? 'bg-green-600 text-white border-green-700' : 'bg-white text-green-800 border-green-200'}`}><Filter className="w-3 h-3" /> Exclude Unmatched</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="p-4 rounded-xl border bg-gray-50 border-gray-200 text-left text-xs text-gray-500">
                            <p><strong>Note:</strong> No sales history loaded. Validation skipped.</p>
                        </div>
                    )}
                    
                    <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-xs text-blue-800 text-left">
                        <Info className="w-4 h-4 inline mr-1 mb-0.5" />
                        <strong>VAT Handling:</strong> Values are stored Ex-VAT to align with ERP data. Displayed values are VAT-Inclusive. Freight costs have been allocated to items.
                    </div>
                </div>
            )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-between items-center rounded-b-2xl">
            <div>
                {onReset && (
                    <button onClick={() => setIsResetConfirmOpen(true)} className="text-xs font-medium text-red-500 hover:text-red-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-50 bg-white"><Trash2 className="w-4 h-4" /> Reset Data</button>
                )}
            </div>
            <div className="flex gap-3">
                <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors">Cancel</button>
                {parsedRefunds && parsedRefunds.length > 0 && (
                    <button onClick={handleConfirm} className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg shadow-md hover:bg-indigo-700 transition-colors flex items-center gap-2"><Check className="w-4 h-4" /> Import {recordsToImport} Refunds</button>
                )}
            </div>
        </div>
      </div>
    </div>
  );
};

export default ReturnsUploadModal;
