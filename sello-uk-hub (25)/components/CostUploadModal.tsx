import React, { useState, useRef } from 'react';
import { Upload, X, FileText, Check, AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useTranslation } from 'react-i18next';

interface CostUploadModalProps {
  onClose: () => void;
  onConfirm: (data: { sku: string; cost: number }[]) => void;
}

const CostUploadModal: React.FC<CostUploadModalProps> = ({ onClose, onConfirm }) => {
  const { t } = useTranslation();
  const [dragActive, setDragActive] = useState(false);
  const [parsedItems, setParsedItems] = useState<{ sku: string; cost: number; status: 'valid' | 'error' }[] | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
        if (file.name.endsWith('.xlsx')) {
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
                    processRows(rows);
                } catch (err) {
                    setError("Failed to parse Excel file.");
                } finally {
                    setIsProcessing(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = (e) => {
                try {
                    const text = e.target?.result as string;
                    const rows = text.split('\n').map(l => l.split(','));
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

  const processRows = (rows: any[][]) => {
    if (rows.length < 2) {
        setError("File empty.");
        return;
    }
    const headers = rows[0].map(h => String(h).trim().toLowerCase());
    const skuIdx = headers.indexOf('sku');
    const costIdx = headers.indexOf('cost');
    const floorIdx = headers.indexOf('floor_price');
    const ceilingIdx = headers.indexOf('ceiling_price');

    if (skuIdx === -1) {
        setError("Missing required column: 'sku'");
        return;
    }

    const results = [];
    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row[skuIdx]) continue;
        const sku = String(row[skuIdx]).trim();
        
        // Parse optional fields
        const costVal = costIdx !== -1 ? parseFloat(String(row[costIdx])) : undefined;
        const floorVal = floorIdx !== -1 ? parseFloat(String(row[floorIdx])) : undefined;
        const ceilingVal = ceilingIdx !== -1 ? parseFloat(String(row[ceilingIdx])) : undefined;
        
        results.push({
            sku,
            cost: costVal !== undefined && !isNaN(costVal) ? costVal : undefined,
            floorPrice: floorVal !== undefined && !isNaN(floorVal) ? floorVal : undefined,
            ceilingPrice: ceilingVal !== undefined && !isNaN(ceilingVal) ? ceilingVal : undefined,
            status: !sku ? 'error' : 'valid'
        } as any);
    }
    setParsedItems(results);
  };

  const validItems = parsedItems?.filter(i => i.status === 'valid') || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center">
          <h2 className="text-xl font-bold">Import Product Costs</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        
        <div className="p-6">
           {isProcessing ? (
               <div className="flex flex-col items-center py-10">
                   <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
                   <span className="text-gray-500">Processing...</span>
               </div>
           ) : !parsedItems ? (
               <div 
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors ${
                  dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400'
                }`}
                onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
               >
                   <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".csv, .xlsx" />
                   <Upload className="w-8 h-8 text-gray-400 mb-4" />
                   <p className="text-sm font-medium text-gray-900">Drag & Drop or <button onClick={() => fileInputRef.current?.click()} className="text-indigo-600 underline">Browse</button></p>
                   
                   <div className="mt-4 text-left text-xs text-gray-500 bg-gray-50 p-3 rounded border border-gray-200 w-full">
                       <p className="font-semibold text-gray-700 mb-1">Column Requirements:</p>
                       <ul className="list-disc pl-4 space-y-1">
                           <li><code className="bg-indigo-50 text-indigo-700 px-1 rounded">sku</code> (Required)</li>
                           <li><code className="bg-gray-200 px-1 rounded">cost</code> (Optional - COGS)</li>
                           <li><code className="bg-gray-200 px-1 rounded">floor_price</code> (Optional - Min Limit)</li>
                           <li><code className="bg-gray-200 px-1 rounded">ceiling_price</code> (Optional - Max Limit)</li>
                       </ul>
                   </div>

                   {error && <p className="text-red-500 text-sm mt-3 flex items-center gap-1"><AlertCircle className="w-4 h-4" />{error}</p>}
               </div>
           ) : (
               <div className="space-y-4">
                   <div className="flex justify-between items-center">
                       <span className="text-sm font-medium text-green-600">{validItems.length} Valid Entries Found</span>
                       <button onClick={() => setParsedItems(null)} className="text-sm text-gray-500 flex items-center gap-1"><RefreshCw className="w-3 h-3"/> Reset</button>
                   </div>
                   <div className="max-h-60 overflow-y-auto border rounded-lg">
                       <table className="w-full text-sm text-left">
                           <thead className="bg-gray-50">
                               <tr>
                                   <th className="p-2">SKU</th>
                                   <th className="p-2 text-right">Cost</th>
                                   <th className="p-2 text-right">Min</th>
                                   <th className="p-2 text-right">Max</th>
                                </tr>
                           </thead>
                           <tbody>
                               {validItems.slice(0, 50).map((item: any, idx) => (
                                   <tr key={idx} className="border-t">
                                       <td className="p-2">{item.sku}</td>
                                       <td className="p-2 text-right">{item.cost !== undefined ? `£${item.cost.toFixed(2)}` : '-'}</td>
                                       <td className="p-2 text-right text-gray-400">{item.floorPrice !== undefined ? `£${item.floorPrice}` : '-'}</td>
                                       <td className="p-2 text-right text-gray-400">{item.ceilingPrice !== undefined ? `£${item.ceilingPrice}` : '-'}</td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
               </div>
           )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
            <button onClick={onClose} className="px-4 py-2 text-gray-700">{t('cancel')}</button>
            {validItems.length > 0 && (
                <button 
                    onClick={() => onConfirm(validItems)}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
                >
                    Update Costs
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default CostUploadModal;
