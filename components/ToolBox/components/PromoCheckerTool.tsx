
import React, { useState, useRef, useMemo } from 'react';
import { formatSmartMoney } from '../../../utils/format';
import { Upload, X, Check, AlertCircle, Loader2, CheckSquare, ShieldCheck, Tag, Filter, Download } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product, PromotionItem } from '../../../types';
import { PromoCheckerToolProps, UploadedItem, ProcessedResult } from '../types';

export const PromoCheckerTool: React.FC<PromoCheckerToolProps> = ({ promotions, pricingRules, products = [], themeColor }) => {
    const [file, setFile] = useState<File | null>(null);
    const [platform, setPlatform] = useState<string>('');
    const [checkDate, setCheckDate] = useState<string>(new Date().toISOString().split('T')[0]);
    
    const [results, setResults] = useState<ProcessedResult[] | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // 1. Build Lookup Map: Any Alias/SKU -> Master SKU Object
    const skuLookup = useMemo(() => {
        const map = new Map<string, Product>();
        products.forEach(p => {
            // Map Master SKU
            map.set(p.sku.toUpperCase().trim(), p);
            
            // Map Aliases
            p.channels.forEach(c => {
                if (c.skuAlias) {
                    c.skuAlias.split(',').forEach(alias => {
                        map.set(alias.toUpperCase().trim(), p);
                    });
                }
            });
        });
        return map;
    }, [products]);

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

                    const uploadedItems: UploadedItem[] = json.map((row: any) => {
                        // Intelligent column finding
                        const keys = Object.keys(row);
                        const skuKey = keys.find(k => k.toLowerCase().includes('sku')) || keys[0];
                        const priceKey = keys.find(k => k.toLowerCase().includes('price')) || keys[1];
                        
                        return {
                            sku: skuKey ? String(row[skuKey]).trim() : '',
                            price: priceKey ? parseFloat(String(row[priceKey])) : 0
                        };
                    }).filter(item => item.sku && !isNaN(item.price));

                    if (uploadedItems.length === 0) {
                        throw new Error("No valid SKU/Price data found in the file. Check headers.");
                    }

                    // 2. Build Promo Map: Master SKU -> Promo Name
                    // We must resolve promo items to Master SKUs first to catch aliases
                    const relevantPromos = promotions.filter(p => 
                        (p.platform === platform || p.platform === 'All') && 
                        new Date(p.endDate) >= new Date(checkDate) &&
                        p.status !== 'ENDED'
                    );
                    
                    const masterSkuPromoMap = new Map<string, string>();
                    
                    relevantPromos.forEach(p => {
                        p.items.forEach(item => {
                            const product = skuLookup.get(item.sku.toUpperCase().trim());
                            if (product) {
                                masterSkuPromoMap.set(product.sku, p.name);
                            } else {
                                // Fallback if promo item is not in known products (unlikely but safe)
                                masterSkuPromoMap.set(item.sku, p.name);
                            }
                        });
                    });

                    // 3. Process Rows
                    const processedResults: ProcessedResult[] = [];

                    uploadedItems.forEach(item => {
                        const lookupKey = item.sku.toUpperCase().trim();
                        const product = skuLookup.get(lookupKey);

                        // FILTER 1: Must resolve to a known product
                        if (!product) return; 

                        // Resolve Platform Specific Alias
                        let resolvedPlatformSku = product.sku; // Default to Master
                        let channel = null;
                        
                        if (platform !== 'All') {
                            channel = product.channels.find(c => 
                                c.platform.toLowerCase() === platform.toLowerCase()
                            );
                            
                            // 2a. Product level check: Is it sold on this platform at all?
                            if (!channel) return;

                            // Resolve correct Platform SKU
                            if (channel.skuAlias) {
                                const aliases = channel.skuAlias.split(',').map(s => s.trim());
                                // If the UPLOADED sku matches an alias for this platform, use it (user intent).
                                // Otherwise, fallback to the first alias listed for this platform.
                                if (aliases.some(a => a.toUpperCase() === lookupKey)) {
                                    resolvedPlatformSku = item.sku;
                                } else {
                                    resolvedPlatformSku = aliases[0];
                                }
                            }
                        }

                        // FILTER 2: Product must be active/sold on the selected platform (Redundant check if platform != All but good for safety)
                        if (platform !== 'All' && !channel) return;

                        // 2b. Validity Check: Is the *lookup key* (what they uploaded) valid for this platform?
                        // If they uploaded "MasterSKU" but platform only accepts "AliasA", we should warn them 
                        // UNLESS we auto-mapped it to "AliasA" in resolvedPlatformSku above.
                        
                        // However, the previous logic marked "Skipped" if alias wasn't valid.
                        // Let's refine: We accept Master SKU -> Alias conversion as valid.
                        // We only skip if the product is NOT on the platform.
                        
                        const isAliasValid = true; // Since we resolved the platform SKU above, we assume the mapping is valid
                        
                        // CHECK: Is the Master SKU on promotion?
                        const promoName = masterSkuPromoMap.get(product.sku);

                        if (promoName) {
                            // CASE A: On Promotion.
                            processedResults.push({ 
                                ...item, 
                                status: 'On Promotion', 
                                promoName, 
                                masterSku: product.sku,
                                matchedVia: product.sku !== item.sku ? 'Alias Match' : undefined,
                                platformSku: resolvedPlatformSku
                            });
                        } else {
                            // CASE B: No Promotion. 
                            processedResults.push({ 
                                ...item, 
                                status: 'Safe to Update',
                                masterSku: product.sku,
                                platformSku: resolvedPlatformSku
                            });
                        }
                    });

                    setResults(processedResults);

                } catch (err: any) {
                    setError("Failed to parse the uploaded file. " + err.message);
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
            const row: any = { 
                'Platform SKU (Target)': item.platformSku || item.sku,
                'Uploaded SKU': item.sku, 
                'New Price': item.price,
                'Master SKU': item.masterSku
            };
            if (type === 'full') {
                row.Status = item.status;
                row['Promotion Name'] = item.promoName || '';
                row['Match Type'] = item.matchedVia || 'Direct';
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
    const skippedCount = useMemo(() => results?.filter(r => r.status === 'Skipped').length || 0, [results]);

    return (
        <div className="space-y-6">
            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                <div className="p-6 border-b border-custom-glass bg-gray-50/50">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-theme-10 text-theme rounded-lg shadow-sm border border-theme-20">
                            <CheckSquare className="w-6 h-6" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-gray-900">Promotion Cross-Check</h3>
                            <p className="text-sm text-gray-500">Verify SKUs (including aliases) against active promotions on target platforms.</p>
                        </div>
                    </div>
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
                    <div>
                        <h4 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <span className="w-6 h-6 flex items-center justify-center bg-gray-200 text-gray-600 rounded-full text-xs font-bold">1</span>
                            Select Target Platform
                        </h4>
                        <select
                            value={platform}
                            onChange={e => { setPlatform(e.target.value); setResults(null); }}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-theme"
                        >
                            <option value="" disabled>Choose a platform...</option>
                            {Object.keys(pricingRules).sort().map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <p className="text-[10px] text-gray-400 mt-1">
                            Logic: The system will auto-resolve the correct Alias for this platform in the export.
                        </p>
                    </div>

                    <div>
                        <h4 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <span className="w-6 h-6 flex items-center justify-center bg-gray-200 text-gray-600 rounded-full text-xs font-bold">2</span>
                            Check on or after date
                        </h4>
                        <input
                            type="date"
                            value={checkDate}
                            onChange={e => setCheckDate(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-theme"
                        />
                    </div>
                    
                    <div>
                        <h4 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <span className="w-6 h-6 flex items-center justify-center bg-gray-200 text-gray-600 rounded-full text-xs font-bold">3</span>
                            Upload Price Change File
                        </h4>
                        <div 
                            className={`border-2 border-dashed rounded-lg p-4 flex items-center justify-center text-center transition-all cursor-pointer ${file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-indigo-400 bg-white hover:bg-theme-10/50'}`}
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
                        className="px-6 py-3 bg-theme text-white font-bold rounded-lg shadow-md hover:bg-theme disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                        style={{ backgroundColor: themeColor }}
                    >
                        {isProcessing ? <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing...</> : 'Run Cross-Check'}
                    </button>
                </div>
            </div>

            {results && (
                <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                    <div className="p-6 border-b border-custom-glass bg-gray-50/50 flex flex-col md:flex-row justify-between items-start gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Analysis Complete</h3>
                            <div className="flex items-center gap-4 text-sm mt-2">
                                <span className="flex items-center gap-2 font-medium text-green-600"><ShieldCheck className="w-4 h-4" /> {safeCount} Safe to Update</span>
                                <span className="flex items-center gap-2 font-medium text-amber-600"><Tag className="w-4 h-4" /> {promoCount} On Promotion</span>
                                {skippedCount > 0 && <span className="flex items-center gap-2 font-medium text-gray-500"><Filter className="w-4 h-4" /> {skippedCount} Skipped (Invalid Alias)</span>}
                            </div>
                            <div className="text-xs text-gray-400 mt-1 italic">
                                * Export includes the specific Platform SKU (Alias) for {platform}.
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <button onClick={() => handleDownload('full')} className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium flex items-center gap-2"><Download className="w-4 h-4"/> Full Report</button>
                            <button onClick={() => handleDownload('safe')} className="px-4 py-2 bg-green-600 text-white border border-green-700 rounded-lg hover:bg-green-700 text-sm font-medium flex items-center gap-2"><Download className="w-4 h-4"/> Safe-to-Update List</button>
                        </div>
                    </div>
                    <div className="max-h-96 overflow-y-auto">
                        <table className="tbl tbl-compact w-full text-sm text-left">
                            <thead className="sticky top-0">
                                <tr>
                                    <th className="p-3">Platform SKU (Target)</th>
                                    <th className="p-3">Uploaded SKU</th>
                                    <th className="p-3">Master SKU</th>
                                    <th className="p-3 text-right">New Price</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3">Info</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((item, idx) => (
                                    <tr key={idx} className={item.status === 'On Promotion' ? 'bg-amber-50/30' : item.status === 'Skipped' ? 'bg-gray-50 text-gray-400' : ''}>
                                        <td className="p-3 font-mono font-bold text-theme">
                                            {item.platformSku || item.sku}
                                        </td>
                                        <td className="p-3 font-mono text-xs text-gray-500">
                                            {item.sku}
                                            {item.matchedVia && item.status !== 'Skipped' && <span className="ml-2 text-[10px] border rounded px-1">Alias</span>}
                                        </td>
                                        <td className="p-3 font-mono text-xs">{item.masterSku}</td>
                                        <td className="p-3 text-right font-mono">{formatSmartMoney(item.price)}</td>
                                        <td className="p-3">
                                            {item.status === 'Safe to Update' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-green-700 bg-green-100 rounded-full border border-green-200">
                                                    <ShieldCheck className="w-3 h-3"/> Safe
                                                </span>
                                            ) : item.status === 'On Promotion' ? (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-amber-700 bg-amber-100 rounded-full border border-amber-200">
                                                    <Tag className="w-3 h-3"/> On Promotion
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-bold text-gray-600 bg-gray-100 rounded-full border border-gray-200">
                                                    <Filter className="w-3 h-3"/> Skipped
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-3 text-xs">
                                            {item.promoName ? <span className="text-gray-700">{item.promoName}</span> : null}
                                            {item.status === 'Skipped' && <span className="italic text-gray-400">Invalid Alias for Platform</span>}
                                        </td>
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
