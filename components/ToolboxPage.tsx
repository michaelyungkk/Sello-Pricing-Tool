import React, { useState, useRef, useMemo } from 'react';
import { PromotionEvent, PricingRules } from '../types';
import { Upload, X, Check, AlertCircle, Loader2, RefreshCw, FileText, Download, Tag, Calendar, CheckSquare, ShieldCheck, ArrowRight } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ToolboxPageProps {
    promotions: PromotionEvent[];
    pricingRules: PricingRules;
    themeColor: string;
    headerStyle: React.CSSProperties;
}

interface UploadedItem {
    sku: string;
    price: number;
}

interface ProcessedResult extends UploadedItem {
    status: 'On Promotion' | 'Safe to Update';
    promoName?: string;
}

const ToolboxPage: React.FC<ToolboxPageProps> = ({ promotions, pricingRules, themeColor, headerStyle }) => {
    const [file, setFile] = useState<File | null>(null);
    const [platform, setPlatform] = useState<string>('');
    const [checkDate, setCheckDate] = useState<string>(new Date().toISOString().split('T')[0]);
    
    const [results, setResults] = useState<ProcessedResult[] | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            setFile(e.target.files[0]);
            setResults(null);
            setError(null);
        }
    };

    const handleProcess = async () => {
        if (!file || !platform) {
            setError("Please select a platform and upload a file.");
            return;
        }

        setIsProcessing(true);
        setError(null);
        setResults(null);

        // Simulate async processing for better UX
        await new Promise(resolve => setTimeout(resolve, 300));

        try {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json(worksheet) as any[];

                    const uploadedItems: UploadedItem[] = json.map(row => {
                        const skuKey = Object.keys(row).find(k => k.toLowerCase().includes('sku'));
                        const priceKey = Object.keys(row).find(k => k.toLowerCase().includes('price'));
                        
                        return {
                            sku: skuKey ? String(row[skuKey]).trim() : '',
                            price: priceKey ? parseFloat(String(row[priceKey])) : 0
                        };
                    }).filter(item => item.sku && !isNaN(item.price));

                    if (uploadedItems.length === 0) {
                        throw new Error("No valid SKU/Price data found in the file. Check headers.");
                    }

                    // Cross-check logic
                    const relevantPromos = promotions.filter(p => 
                        (p.platform === platform || p.platform === 'All') && 
                        new Date(p.endDate) >= new Date(checkDate)
                    );
                    
                    const promoSkuMap = new Map<string, string>();
                    relevantPromos.forEach(p => {
                        p.items.forEach(item => {
                            if (!promoSkuMap.has(item.sku)) {
                                promoSkuMap.set(item.sku, p.name);
                            }
                        });
                    });

                    const processedResults: ProcessedResult[] = uploadedItems.map(item => {
                        const promoName = promoSkuMap.get(item.sku);
                        if (promoName) {
                            return { ...item, status: 'On Promotion', promoName };
                        }
                        return { ...item, status: 'Safe to Update' };
                    });

                    setResults(processedResults);

                } catch (err) {
                    setError("Failed to parse the uploaded file.");
                    console.error(err);
                } finally {
                    setIsProcessing(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } catch (err) {
            setError("Could not read the file.");
            setIsProcessing(false);
        }
    };

    const handleDownload = (type: 'full' | 'safe') => {
        if (!results) return;

        let dataToExport = results;
        let filename = `promo_crosscheck_full_${platform}.xlsx`;

        if (type === 'safe') {
            dataToExport = results.filter(r => r.status === 'Safe to Update');
            filename = `safe_to_update_${platform}.xlsx`;
        }

        const worksheetData = dataToExport.map(item => {
            const row: any = { SKU: item.sku, 'New Price': item.price };
            if (type === 'full') {
                row.Status = item.status;
                row['Promotion Name'] = item.promoName || '';
            }
            return row;
        });

        const worksheet = XLSX.utils.json_to_sheet(worksheetData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Cross-Check Results');
        XLSX.writeFile(workbook, filename);
    };

    const safeCount = useMemo(() => results?.filter(r => r.status === 'Safe to Update').length || 0, [results]);
    const promoCount = useMemo(() => results?.filter(r => r.status === 'On Promotion').length || 0, [results]);

    return (
        <div className="space-y-6">
            {/* Tool Card */}
            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                <div className="p-6 border-b border-custom-glass bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg shadow-sm border border-indigo-200">
                            <CheckSquare className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900">Promotion Cross-Check</h3>
                            <p className="text-sm text-gray-500">Verify SKUs against active/upcoming promotions before applying price changes.</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    {/* Step 1: Platform */}
                    <div>
                        <h4 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <span className="w-6 h-6 flex items-center justify-center bg-gray-200 text-gray-600 rounded-full text-xs font-bold">1</span>
                            Select Platform
                        </h4>
                        <select
                            value={platform}
                            onChange={e => { setPlatform(e.target.value); setResults(null); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="" disabled>Choose a platform...</option>
                            {Object.keys(pricingRules).sort().map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>

                    {/* Step 2: Date */}
                    <div>
                        <h4 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <span className="w-6 h-6 flex items-center justify-center bg-gray-200 text-gray-600 rounded-full text-xs font-bold">2</span>
                            Check on or after date
                        </h4>
                        <input
                            type="date"
                            value={checkDate}
                            onChange={e => setCheckDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    
                    {/* Step 3: Upload */}
                    <div>
                        <h4 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <span className="w-6 h-6 flex items-center justify-center bg-gray-200 text-gray-600 rounded-full text-xs font-bold">3</span>
                            Upload Price File
                        </h4>
                        <div 
                            className={`border-2 border-dashed rounded-lg p-4 flex items-center justify-center text-center transition-all cursor-pointer ${file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-indigo-400 bg-white hover:bg-indigo-50/50'}`}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <input ref={fileInputRef} type="file" className="hidden" accept=".csv, .xlsx" onChange={handleFileChange} />
                            {file ? (
                                <div className="flex items-center gap-2 text-green-700">
                                    <Check className="w-5 h-5" />
                                    <span className="text-sm font-medium truncate max-w-xs">{file.name}</span>
                                </div>
                            ) : (
                                <div className="text-gray-500">
                                    <Upload className="w-6 h-6 mx-auto mb-1" />
                                    <span className="text-sm font-medium">Click to upload</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
                
                <div className="p-6 border-t border-custom-glass flex justify-between items-center">
                    {error && (
                        <div className="flex items-center gap-2 text-red-600">
                            <AlertCircle className="w-4 h-4" />
                            <span className="text-sm">{error}</span>
                        </div>
                    )}
                    <div className="flex-1"></div>
                    <button
                        onClick={handleProcess}
                        disabled={!file || !platform || isProcessing}
                        className="px-6 py-3 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        style={{ backgroundColor: themeColor }}
                    >
                        {isProcessing ? <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</> : 'Run Cross-Check'}
                    </button>
                </div>
            </div>

            {/* Results Section */}
            {results && (
                <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden animate-in fade-in slide-in-from-bottom-4 backdrop-blur-custom">
                    <div className="p-6 border-b border-custom-glass bg-gray-50/50 flex flex-col md:flex-row justify-between items-start gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Analysis Complete</h3>
                            <div className="flex items-center gap-4 text-sm mt-2">
                                <span className="flex items-center gap-2 font-medium text-green-600"><ShieldCheck className="w-4 h-4" /> {safeCount} SKUs are safe to update.</span>
                                <span className="flex items-center gap-2 font-medium text-amber-600"><Tag className="w-4 h-4" /> {promoCount} SKUs are on promotion.</span>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => handleDownload('full')} className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium flex items-center gap-2"><Download className="w-4 h-4"/> Full Report</button>
                            <button onClick={() => handleDownload('safe')} className="px-4 py-2 bg-green-600 text-white border border-green-700 rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2"><Download className="w-4 h-4"/> Safe-to-Update List</button>
                        </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100/80 text-gray-500 font-semibold sticky top-0 z-10">
                                <tr>
                                    <th className="p-3">SKU</th>
                                    <th className="p-3 text-right">New Price</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3">Promotion Details</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100/50">
                                {results.map((item, idx) => (
                                    <tr key={idx} className={item.status === 'On Promotion' ? 'bg-amber-50/30' : ''}>
                                        <td className="p-3 font-mono font-medium text-gray-700">{item.sku}</td>
                                        <td className="p-3 text-right font-mono text-gray-600">£{item.price.toFixed(2)}</td>
                                        <td className="p-3">
                                            {item.status === 'Safe to Update' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-green-700 bg-green-100 rounded-full border border-green-200">
                                                    <ShieldCheck className="w-3 h-3"/> Safe
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-amber-700 bg-amber-100 rounded-full border border-amber-200">
                                                    <Tag className="w-3 h-3"/> On Promotion
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 text-xs text-gray-500">{item.promoName || '-'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ToolboxPage;
