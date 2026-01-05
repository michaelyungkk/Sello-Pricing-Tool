
import React, { useState, useRef } from 'react';
import { Upload, X, Check, AlertCircle, Loader2, Database, Info } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product, SkuCostDetail } from '../types';

interface SkuDetailUploadModalProps {
  products: Product[];
  onClose: () => void;
  onConfirm: (data: { masterSku: string; detail: SkuCostDetail }[]) => void;
}

const SkuDetailUploadModal: React.FC<SkuDetailUploadModalProps> = ({ products, onClose, onConfirm }) => {
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [parsedData, setParsedData] = useState<{ masterSku: string; detail: SkuCostDetail }[] | null>(null);
  const [stats, setStats] = useState({ matched: 0, unmatched: 0 });
  
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
                 const workbook = XLSX.read(content, { type: 'array' });
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

        // Normalize headers
        const headers = rows[0].map(h => String(h).trim().toLowerCase());
        const findCol = (name: string) => headers.indexOf(name);

        // Required columns based on user request
        const colMap = {
            sku_code: findCol('sku_code'),
            sku_qty: findCol('sku_qty'),
            sales_amt: findCol('sales_amt'),
            extra_freight: findCol('extra_freight'),
            promo_rebate: findCol('promo_rebate'),
            cogs: findCol('cogs'),
            cogs_pct: findCol('cogs%'),
            postage: findCol('postage'),
            postage_pct: findCol('postage%'),
            selling_fee: findCol('selling_fee'),
            selling_fee_pct: findCol('selling_fee%'),
            ads_fee: findCol('ads_fee'),
            ads_fee_pct: findCol('ads_fee%'),
            other_fee: findCol('other_fee'),
            other_fee_pct: findCol('other_fee%'),
            subscription_fee: findCol('subscription_fee'),
            subscription_fee_pct: findCol('subscription_fee%'),
            wms_fee: findCol('wms_fee'),
            wms_fee_pct: findCol('wms_fee%'),
            resend_qty: findCol('resend_qty'),
            resend_amt: findCol('resend_amt'),
            refund_qty: findCol('refund_qty'),
            refund_amt: findCol('refund_amt'),
            return_amt_pct: findCol('return_amt%'),
            profit_incl_rn: findCol('profit_incl_rn'),
            profit_incl_rn_pct: findCol('profit_incl_rn%'),
        };

        if (colMap.sku_code === -1) throw new Error("Missing 'sku_code' column.");

        // Create Alias Map from Products
        const aliasMap = new Map<string, string>();
        products.forEach(p => {
            aliasMap.set(p.sku.toLowerCase(), p.sku);
            p.channels.forEach(c => {
                if (c.skuAlias) {
                    c.skuAlias.split(',').forEach(a => aliasMap.set(a.trim().toLowerCase(), p.sku));
                }
            });
        });

        const results: { masterSku: string; detail: SkuCostDetail }[] = [];
        let matched = 0;
        let unmatched = 0;
        const now = new Date().toISOString();

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const skuRaw = row[colMap.sku_code];
            if (!skuRaw) continue;

            const sku = String(skuRaw).trim();
            const masterSku = aliasMap.get(sku.toLowerCase());

            if (masterSku) {
                const getVal = (idx: number) => {
                    if (idx === -1) return 0;
                    const val = parseFloat(String(row[idx]));
                    return isNaN(val) ? 0 : val;
                };

                const getPercent = (idx: number) => {
                    if (idx === -1) return 0;
                    let val = row[idx];
                    // Remove % sign if present
                    if (typeof val === 'string') {
                        val = val.replace('%', '');
                    }
                    const num = parseFloat(String(val));
                    if (isNaN(num)) return 0;
                    
                    // Heuristic: If it's a small decimal (<= 1.0) and not 0, assume it's a decimal format (e.g. 0.0421 -> 4.21%)
                    // Standard retail margins usually aren't < 1% in whole numbers unless they are loss leaders, 
                    // but Excel exports typically use 0-1 range for percentages.
                    if (Math.abs(num) <= 1.0 && num !== 0) {
                        return num * 100;
                    }
                    return num;
                };

                const salesAmt = getVal(colMap.sales_amt);
                const skuQty = getVal(colMap.sku_qty);
                const unitPrice = skuQty !== 0 ? salesAmt / skuQty : 0;

                const detail: SkuCostDetail = {
                    unitPrice,
                    salesAmt,
                    skuQty: skuQty, 
                    extraFreight: getVal(colMap.extra_freight),
                    promoRebate: getVal(colMap.promo_rebate),
                    cogs: getVal(colMap.cogs),
                    cogsPct: getPercent(colMap.cogs_pct),
                    postage: getVal(colMap.postage),
                    postagePct: getPercent(colMap.postage_pct),
                    sellingFee: getVal(colMap.selling_fee),
                    sellingFeePct: getPercent(colMap.selling_fee_pct),
                    adsFee: getVal(colMap.ads_fee),
                    adsFeePct: getPercent(colMap.ads_fee_pct),
                    otherFee: getVal(colMap.other_fee),
                    otherFeePct: getPercent(colMap.other_fee_pct),
                    subscriptionFee: getVal(colMap.subscription_fee),
                    subscriptionFeePct: getPercent(colMap.subscription_fee_pct),
                    wmsFee: getVal(colMap.wms_fee),
                    wmsFeePct: getPercent(colMap.wms_fee_pct),
                    resendQty: getVal(colMap.resend_qty),
                    resendAmt: getVal(colMap.resend_amt),
                    refundQty: getVal(colMap.refund_qty),
                    refundAmt: getVal(colMap.refund_amt),
                    returnAmtPct: getPercent(colMap.return_amt_pct),
                    profitInclRn: getVal(colMap.profit_incl_rn),
                    profitInclRnPct: getPercent(colMap.profit_incl_rn_pct),
                    lastUpdated: now
                };

                results.push({ masterSku, detail });
                matched++;
            } else {
                unmatched++;
            }
        }

        setParsedData(results);
        setStats({ matched, unmatched });

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
              <div className="p-2 bg-blue-100 rounded-lg text-blue-600">
                  <Database className="w-5 h-5" />
              </div>
              <div>
                  <h2 className="text-xl font-bold text-gray-900">Import SKU Detail Report</h2>
                  <p className="text-xs text-gray-500">Update detailed cost breakdowns</p>
              </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
        </div>
        
        <div className="p-6">
            {!parsedData ? (
                 <div 
                    className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all ${
                    dragActive ? 'border-blue-500 bg-blue-50 scale-[1.02]' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                    }`}
                    onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                >
                    <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".csv, .xlsx, .xls" />
                    {isProcessing ? (
                        <div className="flex flex-col items-center py-4">
                            <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-2" />
                            <p className="text-blue-600 font-medium">Processing Report...</p>
                        </div>
                    ) : (
                        <>
                            <div className="w-14 h-14 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mb-4">
                                <Upload className="w-7 h-7" />
                            </div>
                            <p className="text-gray-900 font-medium text-lg">Upload SKU Detail Report</p>
                            <p className="text-sm text-gray-500 mt-1">Supports CSV or Excel</p>
                            
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
                        <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                            <div className="text-2xl font-bold text-green-700">{stats.matched}</div>
                            <div className="text-xs text-green-600 font-bold uppercase">Matched SKUs</div>
                        </div>
                        <div className="p-4 bg-gray-50 rounded-xl border border-gray-100">
                            <div className="text-2xl font-bold text-gray-700">{stats.unmatched}</div>
                            <div className="text-xs text-gray-600 font-bold uppercase">Unmatched (Skipped)</div>
                        </div>
                    </div>
                    
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 text-left flex gap-2">
                        <Info className="w-4 h-4 text-blue-600 mt-0.5" />
                        <p className="text-xs text-blue-800">
                            This will update cost and fee structures for {stats.matched} products. 
                            Unit Prices will be calculated based on Sales Amount / SKU Qty.
                        </p>
                    </div>
                </div>
            )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium transition-colors">Cancel</button>
            {parsedData && parsedData.length > 0 && (
                <button 
                    onClick={() => onConfirm(parsedData)}
                    className="px-6 py-2 bg-blue-600 text-white font-bold rounded-lg shadow-md hover:bg-blue-700 transition-colors flex items-center gap-2"
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

export default SkuDetailUploadModal;
