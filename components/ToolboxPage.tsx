
import React, { useState, useRef, useMemo } from 'react';
import { PromotionEvent, PricingRules, InventoryTemplate, Product } from '../types';
import { Upload, X, Check, AlertCircle, Loader2, RefreshCw, FileText, Download, Tag, Calendar, CheckSquare, ShieldCheck, ArrowRight, Database, FileSpreadsheet, Settings, AlertTriangle, Play, Save, ChevronDown, Link as LinkIcon, Filter, Trash2, Edit, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';

interface ToolboxPageProps {
    promotions: PromotionEvent[];
    pricingRules: PricingRules;
    inventoryTemplates: InventoryTemplate[]; // From App State
    onSaveTemplates: (templates: InventoryTemplate[]) => void; // To App State
    products?: Product[]; // Added to access alias map
    themeColor: string;
    headerStyle: React.CSSProperties;
}

interface UploadedItem {
    sku: string;
    price: number;
}

interface ProcessedResult extends UploadedItem {
    status: 'On Promotion' | 'Safe to Update' | 'Skipped';
    promoName?: string;
    masterSku?: string; // Debug info
    matchedVia?: string; // Debug info
}

// --- SUB-COMPONENT: PROMO CHECKER ---
const PromoCheckerTool = ({ promotions, pricingRules, products = [], themeColor }: { promotions: PromotionEvent[], pricingRules: PricingRules, products: Product[], themeColor: string }) => {
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

                    const uploadedItems: UploadedItem[] = json.map(row => {
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

                        // FILTER 2: Product must be active/sold on the selected platform
                        if (platform !== 'All') {
                            const channel = product.channels.find(c => 
                                c.platform.toLowerCase() === platform.toLowerCase()
                            );
                            
                            // 2a. Product level check: Is it sold on this platform at all?
                            if (!channel) return;

                            // 2b. Validity Check: Is this specific alias valid for this platform?
                            const validPlatformSkus = new Set<string>();
                            validPlatformSkus.add(product.sku.toUpperCase().trim()); // Master SKU is always valid
                            if (channel.skuAlias) {
                                channel.skuAlias.split(',').forEach(a => validPlatformSkus.add(a.trim().toUpperCase()));
                            }
                            
                            const isAliasValid = validPlatformSkus.has(lookupKey);
                            
                            // CHECK: Is the Master SKU on promotion?
                            const promoName = masterSkuPromoMap.get(product.sku);

                            if (promoName) {
                                // CASE A: On Promotion.
                                // We report it regardless of alias validity so user knows there's a promo conflict.
                                processedResults.push({ 
                                    ...item, 
                                    status: 'On Promotion', 
                                    promoName, 
                                    masterSku: product.sku,
                                    matchedVia: !isAliasValid ? 'Cross-Platform Alias' : (product.sku !== item.sku ? 'Alias Match' : undefined)
                                });
                            } else {
                                // CASE B: No Promotion. 
                                // Only mark "Safe" if the alias is actually valid for this platform.
                                if (isAliasValid) {
                                    processedResults.push({ 
                                        ...item, 
                                        status: 'Safe to Update',
                                        masterSku: product.sku
                                    });
                                } else {
                                    // CASE C: Invalid Alias & No Promo.
                                    // Mark as Skipped. It won't appear in the Safe List export.
                                    processedResults.push({
                                        ...item,
                                        status: 'Skipped',
                                        masterSku: product.sku,
                                        matchedVia: 'Invalid Alias for Platform'
                                    });
                                }
                            }
                        } else {
                            // "All" Platforms mode - simpler logic
                            const promoName = masterSkuPromoMap.get(product.sku);
                            processedResults.push({ 
                                ...item, 
                                status: promoName ? 'On Promotion' : 'Safe to Update',
                                promoName,
                                masterSku: product.sku
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
                        <div className="p-3 bg-indigo-100 text-indigo-600 rounded-lg shadow-sm border border-indigo-200">
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="" disabled>Choose a platform...</option>
                            {Object.keys(pricingRules).sort().map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <p className="text-[10px] text-gray-400 mt-1">
                            Logic: SKUs valid for this platform will be checked. Invalid aliases will be marked as Skipped.
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
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    
                    <div>
                        <h4 className="font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <span className="w-6 h-6 flex items-center justify-center bg-gray-200 text-gray-600 rounded-full text-xs font-bold">3</span>
                            Upload Price Change File
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
                        {isProcessing ? <><Loader2 className="w-5 h-5 animate-spin" /> Analyzing...</> : 'Run Cross-Check'}
                    </button>
                </div>
            </div>

            {results && (
                <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden animate-in fade-in slide-in-from-bottom-4 backdrop-blur-custom">
                    <div className="p-6 border-b border-custom-glass bg-gray-50/50 flex flex-col md:flex-row justify-between items-start gap-4">
                        <div>
                            <h3 className="text-lg font-bold text-gray-900">Analysis Complete</h3>
                            <div className="flex items-center gap-4 text-sm mt-2">
                                <span className="flex items-center gap-2 font-medium text-green-600"><ShieldCheck className="w-4 h-4" /> {safeCount} Safe to Update</span>
                                <span className="flex items-center gap-2 font-medium text-amber-600"><Tag className="w-4 h-4" /> {promoCount} On Promotion</span>
                                {skippedCount > 0 && <span className="flex items-center gap-2 font-medium text-gray-500"><Filter className="w-4 h-4" /> {skippedCount} Skipped (Invalid Alias)</span>}
                            </div>
                            <div className="text-xs text-gray-400 mt-1 italic">
                                * "Safe to Update" list will automatically exclude aliases not valid for {platform}.
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
                                    <th className="p-3">Uploaded SKU</th>
                                    <th className="p-3">Master SKU</th>
                                    <th className="p-3 text-right">New Price</th>
                                    <th className="p-3">Status</th>
                                    <th className="p-3">Info</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100/50">
                                {results.map((item, idx) => (
                                    <tr key={idx} className={item.status === 'On Promotion' ? 'bg-amber-50/30' : item.status === 'Skipped' ? 'bg-gray-50 text-gray-400' : ''}>
                                        <td className="p-3 font-mono font-medium">
                                            {item.sku}
                                            {item.matchedVia && item.status !== 'Skipped' && <span className="ml-2 text-[10px] text-gray-400 border rounded px-1">Alias</span>}
                                        </td>
                                        <td className="p-3 font-mono text-xs">{item.masterSku}</td>
                                        <td className="p-3 text-right font-mono">£{item.price.toFixed(2)}</td>
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

// --- SUB-COMPONENT: INVENTORY SYNC TOOL ---
const InventorySyncTool = ({ 
    templates, 
    onSaveTemplates, 
    themeColor,
    pricingRules // Added
}: { 
    templates: InventoryTemplate[], 
    onSaveTemplates: (t: InventoryTemplate[]) => void, 
    themeColor: string,
    pricingRules: PricingRules
}) => {
    const [masterFile, setMasterFile] = useState<File | null>(null);
    const [platformFile, setPlatformFile] = useState<File | null>(null);
    const [templateFile, setTemplateFile] = useState<File | null>(null);
    
    // New: Step 2 Platform Selection
    const [targetPlatform, setTargetPlatform] = useState<string>('');
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    
    // Parsed Data
    const [masterInventory, setMasterInventory] = useState<Map<string, number> | null>(null);
    const [platformRows, setPlatformRows] = useState<any[] | null>(null);
    
    // Template Config State
    const [newTemplateHeaders, setNewTemplateHeaders] = useState<string[]>([]);
    const [newTemplateMeta, setNewTemplateMeta] = useState<any[][]>([]); // Capture Meta Rows
    const [newTemplateSkuCol, setNewTemplateSkuCol] = useState('');
    const [newTemplateStockCol, setNewTemplateStockCol] = useState('');
    const [newTemplateName, setNewTemplateName] = useState('');
    const [isMappingTemplate, setIsMappingTemplate] = useState(false);
    
    // New: Template Header Row Selection
    const [headerRowIndex, setHeaderRowIndex] = useState(0);
    const [previewRows, setPreviewRows] = useState<any[][]>([]);

    // Pending state for upload
    const [pendingPlatformUpload, setPendingPlatformUpload] = useState<string | null>(null);

    // Processing State
    const [isProcessing, setIsProcessing] = useState(false);
    const [syncStats, setSyncStats] = useState<{ matched: number, unmatched: number, totalStock: number } | null>(null);
    const [error, setError] = useState<string | null>(null);

    const masterRef = useRef<HTMLInputElement>(null);
    const platformRef = useRef<HTMLInputElement>(null);
    const templateRef = useRef<HTMLInputElement>(null);

    const platformOptions = useMemo(() => Object.keys(pricingRules).sort(), [pricingRules]);

    // Calculate Platform Template Statuses
    const platformTemplateStatus = useMemo(() => {
        return platformOptions.map(p => {
            const t = templates.find(temp => temp.name === p);
            return {
                name: p,
                template: t,
                isMapped: !!t
            };
        });
    }, [platformOptions, templates]);

    const triggerPlatformUpload = (pName: string) => {
        setPendingPlatformUpload(pName);
        if (templateRef.current) {
            templateRef.current.value = ''; // Reset
            templateRef.current.click();
        }
    };

    const triggerEditTemplate = (t: InventoryTemplate) => {
        setNewTemplateName(t.name);
        setNewTemplateHeaders(t.headers);
        setNewTemplateMeta(t.metaRows || []);
        setNewTemplateSkuCol(t.skuColumn);
        setNewTemplateStockCol(t.stockColumn);
        setHeaderRowIndex(t.metaRows ? t.metaRows.length + 1 : 1);
        setIsMappingTemplate(true);
        setSelectedTemplateId(t.id);
        // Important: We cannot show previewRows correctly here without re-uploading the file.
        // We will disable row index editing in this mode.
        setPreviewRows([]); 
    };

    // --- PARSING HELPERS ---
    const readExcel = (file: File): Promise<any[]> => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    const json = XLSX.utils.sheet_to_json(sheet, { header: 1 }); // Array of arrays
                    resolve(json as any[]);
                } catch (err) {
                    reject(err);
                }
            };
            reader.readAsArrayBuffer(file);
        });
    };

    const normalizeSku = (sku: string): string => {
        if (!sku) return '';
        // Remove common suffixes: _uk, -uk, _1, etc.
        return sku.trim().toUpperCase()
            .replace(/[-_]UK$/i, '')
            .replace(/[-_]ALL$/i, '')
            .replace(/_\d+$/, '') // Remove _1, _2
            .trim();
    };

    // --- HEADER DETECTION LOGIC ---
    const detectHeaderRow = (rows: any[][]): { index: number, headers: string[] } => {
        const keywords = ['sku', 'stock', 'quantity', 'qty', 'price', 'reference', 'ean', 'title', 'id', 'supplier'];
        let bestRowIdx = 0;
        let maxScore = -1;

        // Scan first 10 rows
        for (let i = 0; i < Math.min(rows.length, 10); i++) {
            const row = rows[i];
            let score = 0;
            let nonEmpty = 0;
            if (!row) continue;

            row.forEach(cell => {
                if (cell !== undefined && cell !== null && cell !== '') {
                    nonEmpty++;
                    const val = String(cell).toLowerCase();
                    if (keywords.some(k => val.includes(k))) score += 2; // Keyword match weighted higher
                }
            });

            const finalScore = score + (nonEmpty > 0 ? 1 : 0);
            if (finalScore > maxScore) {
                maxScore = finalScore;
                bestRowIdx = i;
            }
        }

        const headers = rows[bestRowIdx]?.map(c => String(c || '').trim()) || [];
        return { index: bestRowIdx, headers };
    };

    // --- HANDLERS ---

    const handleMasterUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const f = e.target.files[0];
            setMasterFile(f);
            try {
                const rows = await readExcel(f);
                if (rows.length < 2) throw new Error("Empty master file");
                
                // Auto-detect columns
                const { index: headerRowIdx, headers } = detectHeaderRow(rows); 
                
                const lowerHeaders = headers.map(h => h.toLowerCase());
                const skuIdx = lowerHeaders.findIndex((h) => h.includes('sku') || h.includes('reference'));
                
                // Look for 'stock', 'qty', 'quantity' but prefer 'total' or 'available' if ambiguous
                const stockIdx = lowerHeaders.findIndex((h) => h.includes('total') && (h.includes('stock') || h.includes('qty'))) !== -1 
                    ? lowerHeaders.findIndex((h) => h.includes('total') && (h.includes('stock') || h.includes('qty')))
                    : lowerHeaders.findIndex((h) => h.includes('stock') || h.includes('qty') || h.includes('quantity') || h.includes('available'));

                if (skuIdx === -1 || stockIdx === -1) throw new Error("Could not detect SKU or Stock columns in Master file.");

                // --- SMART AGGREGATION LOGIC ---
                // Problem: Master file might contain multiple rows for aliases (e.g. Item & Item_1).
                // Solution: Group by Normalized SKU.
                // - If multiple DIFFERENT Raw SKUs map to one Master -> Assume Virtual Aliases -> Take MAX stock.
                // - If multiple SAME Raw SKUs map to one Master -> Assume Split Locations -> Take SUM stock.

                const tempMap = new Map<string, { rawSkus: Set<string>, sum: number, max: number }>();

                for (let i = headerRowIdx + 1; i < rows.length; i++) {
                    const r = rows[i];
                    if (!r) continue;
                    
                    const skuVal = String(r[skuIdx] || '').trim();
                    if (!skuVal) continue;

                    const normalizedSku = normalizeSku(skuVal); 
                    const stock = parseFloat(r[stockIdx]) || 0;
                    
                    if (!tempMap.has(normalizedSku)) {
                        tempMap.set(normalizedSku, { rawSkus: new Set(), sum: 0, max: 0 });
                    }

                    const entry = tempMap.get(normalizedSku)!;
                    entry.rawSkus.add(skuVal); // Track raw string to detect aliases vs splits
                    entry.sum += Math.max(0, stock);
                    entry.max = Math.max(entry.max, stock); 
                }

                // Finalize Inventory Map
                const invMap = new Map<string, number>();
                tempMap.forEach((data, masterSku) => {
                    // If Raw SKUs set size > 1, it means we found 'SKU' and 'SKU_1' etc.
                    // This implies the file lists aliases separately with full stock. Use MAX.
                    if (data.rawSkus.size > 1) {
                        invMap.set(masterSku, data.max);
                    } else {
                        // If only 1 Raw SKU found (even if multiple rows), implies split inventory. Use SUM.
                        invMap.set(masterSku, data.sum);
                    }
                });

                setMasterInventory(invMap);
                setError(null);
            } catch (err: any) {
                setError("Master File Error: " + err.message);
                setMasterFile(null);
            }
        }
    };

    const handlePlatformUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const f = e.target.files[0];
            setPlatformFile(f);
            try {
                const rows = await readExcel(f);
                if (rows.length < 2) throw new Error("Empty platform file");
                
                const { index, headers } = detectHeaderRow(rows);
                
                // Convert to objects starting from index + 1
                const data = rows.slice(index + 1).map(row => {
                    const obj: any = {};
                    headers.forEach((h: any, i: number) => {
                        obj[h] = row[i];
                    });
                    return obj;
                });
                
                setPlatformRows(data);
                setError(null);
            } catch (err: any) {
                setError("Platform File Error: " + err.message);
                setPlatformFile(null);
            }
        }
    };

    // Helper for robust column finding
    const findHeader = (headers: string[], keywords: string[]) => {
        return headers.find(h => {
            const lower = h.toLowerCase();
            return keywords.some(k => lower.includes(k));
        }) || '';
    };

    const handleTemplateUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) {
            const f = e.target.files[0];
            setTemplateFile(f);
            try {
                const rows = await readExcel(f);
                if (rows.length < 1) throw new Error("Empty template file");
                
                setPreviewRows(rows.slice(0, 5)); // Save preview for manual override if needed
                
                const { index, headers } = detectHeaderRow(rows);
                setHeaderRowIndex(index + 1); // 1-based for UI display
                
                // Capture everything BEFORE the header row
                const meta = rows.slice(0, index);
                setNewTemplateMeta(meta);
                
                setNewTemplateHeaders(headers);
                
                // Improved Heuristic
                const skuGuess = findHeader(headers, ['sku', 'reference', 'code', 'item', 'id', 'product']);
                const stockGuess = findHeader(headers, ['stock', 'qty', 'quantity', 'inventory', 'available', 'count']);
                
                setNewTemplateSkuCol(skuGuess);
                setNewTemplateStockCol(stockGuess);
                
                // If this was triggered from the "Upload Template" button for a specific platform
                if (pendingPlatformUpload) {
                    setNewTemplateName(pendingPlatformUpload);
                    setPendingPlatformUpload(null);
                } 
                // Else if user selected a platform in Step 2 drop-down
                else if (targetPlatform) {
                    setNewTemplateName(targetPlatform);
                } else {
                    setNewTemplateName(f.name.split('.')[0]); 
                }
                
                setIsMappingTemplate(true);
                setSelectedTemplateId(''); 
            } catch (err: any) {
                setError("Template File Error: " + err.message);
            }
        }
    };

    const handleHeaderRowChange = (rowIndexOneBased: number) => {
        const idx = rowIndexOneBased - 1;
        if (previewRows[idx]) {
            const headers = previewRows[idx].map(c => String(c || '').trim());
            setNewTemplateHeaders(headers);
            setHeaderRowIndex(rowIndexOneBased);
            
            // Recalculate guesses when header row changes
            const skuGuess = findHeader(headers, ['sku', 'reference', 'code', 'item', 'id', 'product']);
            const stockGuess = findHeader(headers, ['stock', 'qty', 'quantity', 'inventory', 'available', 'count']);
            
            setNewTemplateSkuCol(skuGuess);
            setNewTemplateStockCol(stockGuess);
        }
    };

    const saveTemplate = () => {
        if (!newTemplateName || !newTemplateSkuCol || !newTemplateStockCol) {
            setError("Please complete all template fields.");
            return;
        }
        
        // Remove existing template with same name to avoid dupe clutter
        const cleanList = templates.filter(t => t.name !== newTemplateName);
        
        const newTemplate: InventoryTemplate = {
            id: selectedTemplateId || `tpl-${Date.now()}`, // Keep ID if editing
            name: newTemplateName,
            headers: newTemplateHeaders,
            skuColumn: newTemplateSkuCol,
            stockColumn: newTemplateStockCol,
            metaRows: newTemplateMeta // Save detected pre-header data
        };
        const updated = [...cleanList, newTemplate];
        onSaveTemplates(updated);
        setSelectedTemplateId(newTemplate.id);
        setIsMappingTemplate(false);
        setTemplateFile(null); 
    };

    const handleDeleteTemplate = (id: string) => {
        if (confirm("Delete this template?")) {
            const updated = templates.filter(t => t.id !== id);
            onSaveTemplates(updated);
            if (selectedTemplateId === id) setSelectedTemplateId('');
        }
    };

    const runReconciliation = () => {
        if (!masterInventory || !platformRows) return;
        
        let matchedCount = 0;
        let unmatchedCount = 0;
        let totalDistributed = 0;

        const groupedMap = new Map<string, any[]>();
        
        if (platformRows.length === 0) return;
        const firstRow = platformRows[0];
        // Heuristic to find SKU column in Platform Data if not explicit
        const platSkuKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('sku')) || Object.keys(firstRow)[0]; 

        platformRows.forEach(row => {
            const pSku = String(row[platSkuKey]).trim();
            const masterKey = normalizeSku(pSku);
            
            if (!groupedMap.has(masterKey)) {
                groupedMap.set(masterKey, []);
            }
            groupedMap.get(masterKey)!.push(row);
        });

        groupedMap.forEach((rows, masterKey) => {
            if (masterInventory.has(masterKey)) {
                matchedCount += rows.length;
                totalDistributed += masterInventory.get(masterKey) || 0;
            } else {
                unmatchedCount += rows.length;
            }
        });

        setSyncStats({ matched: matchedCount, unmatched: unmatchedCount, totalStock: totalDistributed });
    };

    const handleExport = () => {
        if (!masterInventory || !platformRows || !selectedTemplateId) {
            setError("Missing data or template selection.");
            return;
        }

        const template = templates.find(t => t.id === selectedTemplateId);
        if (!template) return;

        const firstRow = platformRows[0];
        const platSkuKey = Object.keys(firstRow).find(k => k.toLowerCase().includes('sku')) || Object.keys(firstRow)[0];
        
        const groupedMap = new Map<string, any[]>();
        platformRows.forEach(row => {
            const pSku = String(row[platSkuKey]).trim();
            const masterKey = normalizeSku(pSku);
            if (!groupedMap.has(masterKey)) groupedMap.set(masterKey, []);
            groupedMap.get(masterKey)!.push(row);
        });

        const outputRows: any[] = [];

        groupedMap.forEach((rows, masterKey) => {
            let stockToDistribute = 0;
            
            if (masterInventory.has(masterKey)) {
                stockToDistribute = masterInventory.get(masterKey)!;
            } else {
                stockToDistribute = 0; 
            }

            const count = rows.length;
            const perUnit = Math.floor(stockToDistribute / count); 

            rows.forEach(row => {
                const newRow: any[] = [];
                // Map based on header position
                template.headers.forEach(h => {
                    if (h === template.skuColumn) {
                        newRow.push(row[platSkuKey]);
                    } else if (h === template.stockColumn) {
                        newRow.push(perUnit);
                    } else {
                        newRow.push(""); // Empty string for unmapped cols
                    }
                });
                outputRows.push(newRow);
            });
        });

        // RECONSTRUCT FILE: Meta Rows + Headers + Data
        const finalData = [
            ...(template.metaRows || []), // Add pre-header rows if they exist
            template.headers,
            ...outputRows
        ];

        const ws = XLSX.utils.aoa_to_sheet(finalData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "InventoryUpdate");
        XLSX.writeFile(wb, `${template.name}_InventoryUpdate_${new Date().toISOString().slice(0,10)}.csv`);
    };

    return (
        <div className="space-y-6 animate-in fade-in">
            {/* 0. Platform Templates Grid (NEW) */}
            <div className="bg-custom-glass p-6 rounded-xl border border-custom-glass shadow-sm backdrop-blur-custom">
                <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-indigo-500" />
                    Platform Templates
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                    {platformTemplateStatus.map(status => (
                        <div key={status.name} className={`relative group p-3 rounded-lg border flex flex-col justify-between h-24 transition-all ${status.isMapped ? 'bg-green-50/50 border-green-200' : 'bg-gray-50 border-gray-200 hover:border-indigo-300 hover:bg-white'}`}>
                            <div className="flex justify-between items-start">
                                <span className="text-xs font-bold text-gray-700 truncate" title={status.name}>{status.name}</span>
                                {status.isMapped ? (
                                    <Check className="w-3.5 h-3.5 text-green-600" />
                                ) : (
                                    <div className="w-3.5 h-3.5 rounded-full bg-gray-200" />
                                )}
                            </div>
                            
                            {status.isMapped ? (
                                <div className="flex gap-2 mt-auto">
                                    <button 
                                        onClick={() => triggerEditTemplate(status.template!)}
                                        className="flex-1 text-[10px] bg-white border border-green-200 text-green-700 py-1 rounded font-medium hover:bg-green-50"
                                    >
                                        Edit
                                    </button>
                                    <button 
                                        onClick={() => handleDeleteTemplate(status.template!.id)}
                                        className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded"
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ) : (
                                <button 
                                    onClick={() => triggerPlatformUpload(status.name)}
                                    className="mt-auto w-full text-[10px] bg-white border border-gray-300 text-gray-500 py-1 rounded font-medium hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200 flex items-center justify-center gap-1"
                                >
                                    <Upload className="w-3 h-3" /> Upload
                                </button>
                            )}
                        </div>
                    ))}
                </div>
                {/* Hidden File Input for Template Uploads */}
                <input ref={templateRef} type="file" hidden accept=".csv,.xlsx" onChange={handleTemplateUpload} />
            </div>

            {/* Template Mapping Modal (Inline) - UPDATED */}
            {isMappingTemplate && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-6 animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-start mb-4">
                        <h4 className="font-bold text-amber-800 flex items-center gap-2">
                            <Settings className="w-4 h-4"/> 
                            {selectedTemplateId ? 'Edit Template Mapping' : 'Configure New Template'}
                        </h4>
                        {selectedTemplateId && (
                            <span className="text-xs text-amber-600 bg-amber-100 px-2 py-1 rounded border border-amber-200">
                                Editing Existing
                            </span>
                        )}
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
                        {/* Column 1: Name */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Template Name</label>
                            <div className="relative">
                                <input 
                                    type="text" 
                                    list="platform-list"
                                    value={newTemplateName} 
                                    onChange={e => setNewTemplateName(e.target.value)}
                                    className="w-full border rounded p-2 text-sm"
                                    placeholder="e.g. Amazon Loader"
                                    readOnly={!!selectedTemplateId && platformOptions.includes(newTemplateName)} // Lock name if editing a platform standard
                                />
                                <datalist id="platform-list">
                                    {platformOptions.map(p => <option key={p} value={p} />)}
                                </datalist>
                            </div>
                        </div>

                        {/* Column 2: Header Row Detection */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Header Row #</label>
                            <input 
                                type="number" 
                                min="1"
                                max="10"
                                value={headerRowIndex} 
                                onChange={e => handleHeaderRowChange(parseInt(e.target.value))}
                                className={`w-full border rounded p-2 text-sm ${previewRows.length === 0 ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''}`}
                                disabled={previewRows.length === 0} // Disable if no file content available to re-parse
                                title={previewRows.length === 0 ? "Cannot change row index without re-uploading file" : ""}
                            />
                            {newTemplateMeta.length > 0 && (
                                <p className="text-[9px] text-green-600 mt-1 flex items-center gap-1">
                                    <Check className="w-3 h-3" /> {newTemplateMeta.length} pre-header rows detected
                                </p>
                            )}
                        </div>

                        {/* Column 3: SKU Map */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">SKU Column</label>
                            <select 
                                value={newTemplateSkuCol} 
                                onChange={e => setNewTemplateSkuCol(e.target.value)}
                                className={`w-full border rounded p-2 text-sm bg-white ${!newTemplateSkuCol ? 'text-gray-400' : 'text-gray-900'}`}
                            >
                                <option value="" disabled>-- Select Column --</option>
                                {newTemplateHeaders.map(h => <option key={h} value={h} className="text-gray-900">{h}</option>)}
                            </select>
                        </div>

                        {/* Column 4: Stock Map */}
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Stock Column</label>
                            <select 
                                value={newTemplateStockCol} 
                                onChange={e => setNewTemplateStockCol(e.target.value)}
                                className={`w-full border rounded p-2 text-sm bg-white ${!newTemplateStockCol ? 'text-gray-400' : 'text-gray-900'}`}
                            >
                                <option value="" disabled>-- Select Column --</option>
                                {newTemplateHeaders.map(h => <option key={h} value={h} className="text-gray-900">{h}</option>)}
                            </select>
                        </div>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button onClick={() => { setIsMappingTemplate(false); setPendingPlatformUpload(null); }} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Cancel</button>
                        <button onClick={saveTemplate} className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-amber-700">Save Template</button>
                    </div>
                </div>
            )}

            {/* Top Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* 1. Master Inventory */}
                <div className={`p-6 rounded-xl border flex flex-col justify-between h-56 transition-all ${masterFile ? 'bg-green-50 border-green-200' : 'bg-custom-glass border-custom-glass shadow-sm'}`}>
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600"><Database className="w-5 h-5"/></div>
                            <h4 className="font-bold text-gray-800">1. Master Inventory</h4>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">Upload the source of truth (ERP export) with total stock levels.</p>
                        {masterInventory && (
                            <div className="text-sm font-medium text-green-700 flex items-center gap-1">
                                <Check className="w-4 h-4"/> {masterInventory.size} SKUs Loaded
                            </div>
                        )}
                    </div>
                    <button onClick={() => masterRef.current?.click()} className="w-full py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50">
                        {masterFile ? 'Replace File' : 'Upload Master'}
                    </button>
                    <input ref={masterRef} type="file" hidden accept=".csv,.xlsx" onChange={handleMasterUpload} />
                </div>

                {/* 2. Platform Data (Modified) */}
                <div className={`p-6 rounded-xl border flex flex-col justify-between h-56 transition-all ${platformFile && targetPlatform ? 'bg-green-50 border-green-200' : 'bg-custom-glass border-custom-glass shadow-sm'}`}>
                    <div>
                        <div className="flex items-center gap-2 mb-2">
                            <div className="bg-purple-100 p-2 rounded-lg text-purple-600"><FileSpreadsheet className="w-5 h-5"/></div>
                            <h4 className="font-bold text-gray-800">2. Platform Data</h4>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">Select platform and upload current active listings report.</p>
                        
                        {/* Platform Dropdown */}
                        <div className="mb-2">
                            <select 
                                value={targetPlatform}
                                onChange={(e) => setTargetPlatform(e.target.value)}
                                className="w-full border rounded p-2 text-sm bg-white focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="" disabled>Select Target Platform</option>
                                {platformOptions.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>

                        {platformRows && (
                            <div className="text-sm font-medium text-green-700 flex items-center gap-1">
                                <Check className="w-4 h-4"/> {platformRows.length} Rows Loaded
                            </div>
                        )}
                    </div>
                    <button onClick={() => platformRef.current?.click()} className="w-full py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 disabled:opacity-50" disabled={!targetPlatform}>
                        {platformFile ? 'Replace File' : 'Upload Listings'}
                    </button>
                    <input ref={platformRef} type="file" hidden accept=".csv,.xlsx" onChange={handlePlatformUpload} />
                </div>

                {/* 3. Export Template (Modified) */}
                <div className="p-6 rounded-xl border border-custom-glass bg-custom-glass shadow-sm flex flex-col justify-between h-56 relative">
                    <div>
                        <div className="flex items-center justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2">
                                <div className="bg-amber-100 p-2 rounded-lg text-amber-600"><Settings className="w-5 h-5"/></div>
                                <h4 className="font-bold text-gray-800">3. Export Template</h4>
                            </div>
                        </div>
                        <p className="text-xs text-gray-500 mb-4">Choose output format for update file.</p>

                        <div className="relative">
                            <select 
                                className="w-full border rounded p-2 text-sm mb-2 appearance-none bg-white"
                                value={selectedTemplateId}
                                onChange={(e) => setSelectedTemplateId(e.target.value)}
                            >
                                <option value="" disabled>Select Output Template</option>
                                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
                                {/* Smart Suggestion: If matching name exists */}
                                {!selectedTemplateId && targetPlatform && templates.some(t => t.name === targetPlatform) && (
                                    <option value="suggested" disabled>--- Suggested ---</option>
                                )}
                            </select>
                            <ChevronDown className="absolute right-3 top-3 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                    
                    {/* The primary management is now via the Header Grid, but we keep this button for ad-hoc custom templates */}
                    <button onClick={() => templateRef.current?.click()} className="w-full py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50">
                        Upload Custom Template
                    </button>
                </div>
            </div>

            {/* Error Display */}
            {error && (
                <div className="p-4 bg-red-50 text-red-700 border border-red-200 rounded-lg flex items-center gap-2">
                    <AlertCircle className="w-5 h-5"/>
                    <span className="text-sm font-medium">{error}</span>
                </div>
            )}

            {/* Action Bar */}
            {masterInventory && platformRows && selectedTemplateId && !isMappingTemplate && (
                <div className="bg-white p-6 rounded-xl shadow-lg border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-6 animate-in slide-in-from-bottom-4">
                    <div className="flex-1">
                        <h3 className="font-bold text-gray-900 text-lg">Ready to Reconcile</h3>
                        <p className="text-sm text-gray-500">The system will map Platform Aliases to Master SKUs and distribute stock evenly.</p>
                        
                        {syncStats ? (
                            <div className="flex gap-4 mt-3">
                                <div className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-xs font-bold border border-green-200">
                                    {syncStats.matched} Aliases Matched
                                </div>
                                {syncStats.unmatched > 0 && (
                                    <div className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-xs font-bold border border-red-200 flex items-center gap-1">
                                        <AlertTriangle className="w-3 h-3"/> {syncStats.unmatched} Unmatched
                                    </div>
                                )}
                                <div className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold border border-blue-200">
                                    Total Stock: {syncStats.totalStock}
                                </div>
                            </div>
                        ) : (
                            <button 
                                onClick={runReconciliation}
                                className="mt-3 text-indigo-600 text-sm font-bold hover:underline flex items-center gap-1"
                            >
                                <Play className="w-3 h-3 fill-current"/> Preview Stats
                            </button>
                        )}
                    </div>

                    <button 
                        onClick={handleExport}
                        className="px-8 py-4 bg-indigo-600 text-white rounded-xl shadow-xl hover:bg-indigo-700 hover:shadow-2xl transition-all font-bold text-lg flex items-center gap-3"
                        style={{ backgroundColor: themeColor }}
                    >
                        <Download className="w-6 h-6" />
                        Generate Update File
                    </button>
                </div>
            )}
        </div>
    );
};

const ToolboxPage: React.FC<ToolboxPageProps> = ({ 
    promotions, 
    pricingRules, 
    inventoryTemplates, 
    onSaveTemplates, 
    products, // Now available
    themeColor, 
    headerStyle 
}) => {
    const [activeTab, setActiveTab] = useState<'PROMO' | 'SYNC'>('PROMO');

    return (
        <div className="space-y-6">
            {/* Header / Tabs */}
            <div>
                <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Automation Toolbox</h2>
                <p className="mt-1 transition-colors opacity-80 mb-6" style={headerStyle}>
                    Specialized tools for bulk operations and data integrity.
                </p>
                
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
                    <button
                        onClick={() => setActiveTab('PROMO')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'PROMO' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <Tag className="w-4 h-4" />
                        Promo Cross-Check
                    </button>
                    <button
                        onClick={() => setActiveTab('SYNC')}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'SYNC' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        <RefreshCw className="w-4 h-4" />
                        Inventory Sync
                    </button>
                </div>
            </div>

            {/* Content Area */}
            {activeTab === 'PROMO' && (
                <PromoCheckerTool 
                    promotions={promotions} 
                    pricingRules={pricingRules} 
                    products={products || []} // Pass products down
                    themeColor={themeColor} 
                />
            )}

            {activeTab === 'SYNC' && (
                <InventorySyncTool 
                    templates={inventoryTemplates} 
                    onSaveTemplates={onSaveTemplates} 
                    themeColor={themeColor}
                    pricingRules={pricingRules}
                />
            )}
        </div>
    );
};

export default ToolboxPage;
