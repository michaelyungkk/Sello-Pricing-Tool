
import React, { useState, useRef, useMemo } from 'react';
import { Product } from '../types';
import { Upload, X, Check, AlertCircle, Loader2, RefreshCw, Link as LinkIcon, ArrowRight, Search } from 'lucide-react';
import * as XLSX from 'xlsx';

interface MappingUploadModalProps {
  products: Product[];
  platforms: string[];
  onClose: () => void;
  onConfirm: (mappings: SkuMapping[]) => void;
}

export interface SkuMapping {
  masterSku: string;
  platform: string;
  alias: string;
}

interface DetectedRow {
    fileSku: string;
    masterSku: string | null;
    method: 'exact' | 'fuzzy' | 'none';
}

const MappingUploadModal: React.FC<MappingUploadModalProps> = ({ products, platforms, onClose, onConfirm }) => {
  const [step, setStep] = useState<'upload' | 'preview'>('upload');
  const [selectedPlatform, setSelectedPlatform] = useState<string>(platforms[0] || '');
  const [dragActive, setDragActive] = useState(false);
  const [detectedRows, setDetectedRows] = useState<DetectedRow[]>([]);
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
    if (!selectedPlatform) {
        setError("Please select a platform first.");
        return;
    }
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
                catch (err) { setError("Failed to parse Excel file."); } 
                finally { setIsProcessing(false); }
            };
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = (e) => {
                try { handleContent(e.target?.result); } 
                catch (err) { setError("Failed to parse CSV file."); } 
                finally { setIsProcessing(false); }
            };
            reader.readAsText(file);
        }
    }, 100);
  };

  const analyzeRows = (rows: any[][]) => {
    if (rows.length < 2) {
        setError("File appears empty.");
        return;
    }

    // 1. Find the SKU column automatically
    const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/[\s_-]/g, ''));
    
    // Heuristics for platform export headers
    const skuKeywords = ['sellersku', 'sku', 'merchantlinesku', 'customlabel', 'itemnumber', 'productcode', 'referenceno'];
    
    let skuIdx = -1;
    for (const kw of skuKeywords) {
        skuIdx = headers.findIndex(h => h === kw || h.includes(kw));
        if (skuIdx !== -1) break;
    }

    if (skuIdx === -1) {
        setError("Could not auto-detect a SKU column. Please ensure the file has a header like 'Seller SKU', 'SKU', or 'Custom Label'.");
        return;
    }

    // 2. Extract and Match
    const results: DetectedRow[] = [];
    const existingSkuSet = new Set(products.map(p => p.sku));
    const processedSkus = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.length <= skuIdx) continue;
        
        const rawSku = String(row[skuIdx]).trim();
        // Remove quotes if CSV parsing left them
        const fileSku = rawSku.replace(/^"|"$/g, '');

        if (!fileSku || processedSkus.has(fileSku)) continue;
        processedSkus.add(fileSku);

        // MATCHING LOGIC
        let masterSku: string | null = null;
        let method: 'exact' | 'fuzzy' | 'none' = 'none';

        if (existingSkuSet.has(fileSku)) {
            masterSku = fileSku;
            method = 'exact';
        } else {
            // Fuzzy Match: Strip suffixes like _1, _UK, -UK, etc.
            const stripped = fileSku.replace(/[_ -](UK|US|DE|FR|IT|ES|[0-9]+)$/i, '');
            
            if (existingSkuSet.has(stripped)) {
                masterSku = stripped;
                method = 'fuzzy';
            } else {
                // Try Prefix Match (Longest prefix wins)
                let bestPrefixMatch = '';
                for (const prod of products) {
                    if (fileSku.startsWith(prod.sku)) {
                        // Check if separator follows (avoid matching BF10 to BF100)
                        const remaining = fileSku.slice(prod.sku.length);
                        if ((remaining.startsWith('-') || remaining.startsWith('_') || remaining === '') && prod.sku.length > bestPrefixMatch.length) {
                            bestPrefixMatch = prod.sku;
                        }
                    }
                }
                if (bestPrefixMatch) {
                    masterSku = bestPrefixMatch;
                    method = 'fuzzy';
                }
            }
        }

        // Only add if it's a useful mapping (Alias exists) or we found a match to confirm
        // If exact match, it technically doesn't need an alias stored, but good for validation. 
        // We will filter out 'none' matches from final save.
        results.push({ fileSku, masterSku, method });
    }

    if (results.length === 0) {
        setError("No SKUs found in the file.");
        return;
    }

    setDetectedRows(results);
    setStep('preview');
  };

  const handleSave = () => {
      const validMappings = detectedRows
        .filter(r => r.masterSku !== null)
        .map(r => ({
            masterSku: r.masterSku!,
            platform: selectedPlatform,
            alias: r.fileSku
        }));
      
      onConfirm(validMappings);
  };

  const matchedCount = detectedRows.filter(r => r.masterSku).length;
  const fuzzyCount = detectedRows.filter(r => r.method === 'fuzzy').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-2xl">
          <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg text-indigo-600">
                  <LinkIcon className="w-5 h-5" />
              </div>
              <div>
                  <h2 className="text-xl font-bold text-gray-900">Platform Alias Import</h2>
                  <p className="text-xs text-gray-500">Upload a platform export to auto-link aliases</p>
              </div>
          </div>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
        </div>
        
        <div className="p-6 flex-1 overflow-y-auto">
           {isProcessing ? (
               <div className="flex flex-col items-center py-12">
                   <Loader2 className="w-10 h-10 animate-spin text-indigo-600 mb-3" />
                   <span className="text-gray-600 font-medium">Analyzing file & matching SKUs...</span>
               </div>
           ) : step === 'upload' ? (
               <div className="space-y-6">
                   {/* Platform Select */}
                   <div>
                       <label className="block text-sm font-semibold text-gray-700 mb-2">1. Select Platform Source</label>
                       <div className="relative">
                           <select 
                                value={selectedPlatform}
                                onChange={(e) => setSelectedPlatform(e.target.value)}
                                className="w-full pl-4 pr-10 py-3 border border-gray-300 rounded-xl appearance-none focus:ring-2 focus:ring-indigo-500 bg-white"
                           >
                               <option value="" disabled>Choose a platform...</option>
                               {platforms.map(p => <option key={p} value={p}>{p}</option>)}
                               <option value="Other">Other / Custom</option>
                           </select>
                           <div className="absolute inset-y-0 right-0 flex items-center px-3 pointer-events-none text-gray-500">
                               <ArrowRight className="w-4 h-4 rotate-90" />
                           </div>
                       </div>
                       {selectedPlatform === 'Other' && (
                           <input 
                                type="text" 
                                placeholder="Type platform name..." 
                                className="mt-2 w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                onChange={(e) => setSelectedPlatform(e.target.value)}
                           />
                       )}
                   </div>

                   {/* File Upload */}
                   <div>
                       <label className="block text-sm font-semibold text-gray-700 mb-2">2. Upload Platform Export</label>
                       <div 
                            className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all ${
                            dragActive ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                            }`}
                            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                        >
                            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".csv, .xlsx, .xls" />
                            <div className="w-14 h-14 bg-indigo-50 text-indigo-500 rounded-full flex items-center justify-center mb-3">
                                <Upload className="w-7 h-7" />
                            </div>
                            <p className="text-gray-900 font-medium">Click to upload or drag and drop</p>
                            <p className="text-xs text-gray-500 mt-1">Accepts CSV or Excel exports from Amazon, eBay, etc.</p>
                            
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="mt-4 px-5 py-2 bg-white border border-gray-200 shadow-sm text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50"
                            >
                                Browse Files
                            </button>
                        </div>
                   </div>

                   {error && (
                       <div className="flex items-center gap-3 p-4 bg-red-50 text-red-700 rounded-xl border border-red-100">
                           <AlertCircle className="w-5 h-5 flex-shrink-0" />
                           <p className="text-sm">{error}</p>
                       </div>
                   )}
               </div>
           ) : (
               <div className="space-y-4">
                   <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100">
                       <div className="flex gap-4">
                           <div className="flex flex-col">
                               <span className="text-xs text-gray-500 uppercase font-bold">Total SKUs</span>
                               <span className="text-lg font-bold text-gray-900">{detectedRows.length}</span>
                           </div>
                           <div className="w-px bg-gray-300 h-full"></div>
                           <div className="flex flex-col">
                               <span className="text-xs text-green-600 uppercase font-bold">Matched</span>
                               <span className="text-lg font-bold text-green-600">{matchedCount}</span>
                           </div>
                           <div className="flex flex-col">
                               <span className="text-xs text-indigo-600 uppercase font-bold">Auto-Linked</span>
                               <span className="text-lg font-bold text-indigo-600">{fuzzyCount}</span>
                           </div>
                       </div>
                       <button onClick={() => { setDetectedRows([]); setStep('upload'); }} className="text-sm text-gray-500 flex items-center gap-1 hover:text-gray-900">
                           <RefreshCw className="w-3 h-3"/> Start Over
                       </button>
                   </div>

                   <div className="max-h-80 overflow-y-auto border border-gray-200 rounded-xl">
                       <table className="w-full text-sm text-left">
                           <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 shadow-sm">
                               <tr>
                                   <th className="p-3">Platform Alias (Imported)</th>
                                   <th className="p-3">Matched Master SKU (Inventory)</th>
                                   <th className="p-3 text-right">Status</th>
                                </tr>
                           </thead>
                           <tbody className="divide-y divide-gray-100">
                               {detectedRows.map((row, idx) => (
                                   <tr key={idx} className={!row.masterSku ? 'opacity-50 bg-gray-50' : row.method === 'fuzzy' ? 'bg-indigo-50/30' : ''}>
                                       <td className="p-3 font-mono text-xs text-gray-700">{row.fileSku}</td>
                                       <td className="p-3 font-mono text-xs font-bold text-gray-900">
                                           {row.masterSku || <span className="text-gray-400 italic">No match found</span>}
                                       </td>
                                       <td className="p-3 text-right">
                                           {row.method === 'exact' && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-green-100 text-green-700 font-medium">Exact</span>}
                                           {row.method === 'fuzzy' && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-indigo-100 text-indigo-700 font-medium">Linked</span>}
                                           {row.method === 'none' && <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] bg-gray-200 text-gray-500">Ignored</span>}
                                       </td>
                                   </tr>
                               ))}
                           </tbody>
                       </table>
                   </div>
                   
                   {detectedRows.length - matchedCount > 0 && (
                       <p className="text-xs text-gray-500 text-center">
                           {detectedRows.length - matchedCount} rows without a match will be ignored.
                       </p>
                   )}
               </div>
           )}
        </div>

        <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
            <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
            {step === 'preview' && matchedCount > 0 && (
                <button 
                    onClick={handleSave}
                    className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-md flex items-center gap-2"
                >
                    <Check className="w-4 h-4" />
                    Confirm {matchedCount} Mappings
                </button>
            )}
        </div>
      </div>
    </div>
  );
};

export default MappingUploadModal;
