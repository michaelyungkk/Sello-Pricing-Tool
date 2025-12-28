import React, { useState, useRef, useMemo } from 'react';
import { Product } from '../types';
import { Upload, X, Check, AlertCircle, Loader2, RefreshCw, Link as LinkIcon, ArrowRight, Search, ChevronDown, ChevronRight, Edit2, GitMerge, Eraser } from 'lucide-react';
import * as XLSX from 'xlsx';

interface MappingUploadModalProps {
    products: Product[];
    platforms: string[];
    learnedAliases?: Record<string, string>;
    onClose: () => void;
    onConfirm: (mappings: SkuMapping[], mode: 'merge' | 'replace', platform: string) => void;
}

export interface SkuMapping {
    masterSku: string;
    platform: string;
    alias: string;
}

interface DetectedRow {
    fileSku: string;
    masterSku: string | null;
    method: 'exact' | 'fuzzy' | 'manual' | 'learned' | 'none';
}

const MappingUploadModal: React.FC<MappingUploadModalProps> = ({ products, platforms, learnedAliases = {}, onClose, onConfirm }) => {
    const [step, setStep] = useState<'upload' | 'preview'>('upload');
    const [selectedPlatform, setSelectedPlatform] = useState<string>(platforms[0] || '');
    const [importMode, setImportMode] = useState<'merge' | 'replace'>('merge');
    const [dragActive, setDragActive] = useState(false);
    const [detectedRows, setDetectedRows] = useState<DetectedRow[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showExact, setShowExact] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Create a set of valid master SKUs for quick validation
    const masterSkuSet = useMemo(() => new Set(products.map(p => p.sku)), [products]);

    // Create a normalized lookup map for case-insensitive matching
    const masterSkuLookup = useMemo(() => {
        const map: Record<string, string> = {};
        products.forEach(p => {
            const normalized = p.sku.toUpperCase().replace(/×/g, 'X').replace(/\*/g, 'X');
            map[normalized] = p.sku;
        });
        return map;
    }, [products]);

    // Create a lookup for existing aliases across all products
    const existingAliasLookup = useMemo(() => {
        const map: Record<string, string> = {};
        products.forEach(p => {
            p.channels.forEach(c => {
                if (c.skuAlias) {
                    c.skuAlias.split(',').forEach(a => {
                        map[a.trim()] = p.sku; // Map Alias -> Master SKU
                    });
                }
            });
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

        const results: DetectedRow[] = [];
        const processedSkus = new Set<string>();

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length <= skuIdx) continue;

            const rawSku = String(row[skuIdx]).trim();
            const fileSku = rawSku.replace(/^"|"$/g, '');

            if (!fileSku || processedSkus.has(fileSku)) continue;
            processedSkus.add(fileSku);

            let masterSku: string | null = null;
            let method: 'exact' | 'fuzzy' | 'manual' | 'learned' | 'none' = 'none';

            const normalize = (s: string) => s.toUpperCase().replace(/×/g, 'X').replace(/\*/g, 'X');
            const normalizedFileSku = normalize(fileSku);

            // 1. Check if this file SKU is ALREADY an alias for an existing master product
            if (existingAliasLookup[fileSku]) {
                masterSku = existingAliasLookup[fileSku];
                method = 'exact'; // Treating existing alias matches as exact/confirmed
            }
            // 2. Exact Master SKU Match
            else if (masterSkuSet.has(fileSku)) {
                masterSku = fileSku;
                method = 'exact';
            }
            // 3. Normalized Master SKU Match
            else if (masterSkuLookup[normalizedFileSku]) {
                masterSku = masterSkuLookup[normalizedFileSku];
                method = 'exact';
            }
            // 4. Global Learned Alias Match
            else if (learnedAliases[fileSku.toUpperCase()]) {
                masterSku = learnedAliases[fileSku.toUpperCase()];
                method = 'learned';
            }
            else {
                // Fuzzy Matching (Suffix Stripping)
                const stripped = fileSku.replace(/[_ -](UK|US|DE|FR|IT|ES|[0-9]+)$/i, '');
                const normalizedStripped = normalize(stripped);

                if (masterSkuSet.has(stripped)) {
                    masterSku = stripped;
                    method = 'fuzzy';
                } else if (masterSkuLookup[normalizedStripped]) {
                    masterSku = masterSkuLookup[normalizedStripped];
                    method = 'fuzzy';
                } else if (learnedAliases[stripped.toUpperCase()]) {
                    masterSku = learnedAliases[stripped.toUpperCase()];
                    method = 'learned';
                } else {
                    // Fuzzy Matching (Prefix Check)
                    let bestPrefixMatch = '';
                    for (const prod of products) {
                        if (fileSku.startsWith(prod.sku)) {
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

                    if (!masterSku) {
                        const candidates = products.filter(p => {
                            if (!p.sku.startsWith(fileSku)) return false;
                            if (p.sku.length <= fileSku.length) return false;
                            const separator = p.sku[fileSku.length];
                            return separator === '-' || separator === '_' || separator === ' ';
                        });

                        if (candidates.length > 0) {
                            const ukMatch = candidates.find(p => p.sku.toUpperCase().endsWith('-UK') || p.sku.toUpperCase().endsWith('_UK'));
                            masterSku = ukMatch ? ukMatch.sku : candidates[0].sku;
                            method = 'fuzzy';
                        }
                    }
                }
            }

            results.push({ fileSku, masterSku, method });
        }

        if (results.length === 0) {
            setError("No SKUs found in the file.");
            return;
        }

        setDetectedRows(results);
        setStep('preview');
    };

    const handleManualChange = (index: number, value: string) => {
        const newRows = [...detectedRows];
        const match = masterSkuSet.has(value);

        newRows[index] = {
            ...newRows[index],
            masterSku: value,
            method: match ? 'manual' : 'none'
        };
        setDetectedRows(newRows);
    };

    const handleSave = () => {
        const validMappings = detectedRows
            .filter(r => r.masterSku !== null && masterSkuSet.has(r.masterSku))
            .map(r => ({
                masterSku: r.masterSku!,
                platform: selectedPlatform,
                alias: r.fileSku
            }));

        onConfirm(validMappings, importMode, selectedPlatform);
    };

    const matchedCount = detectedRows.filter(r => r.masterSku && r.method !== 'none').length;
    const exactCount = detectedRows.filter(r => r.method === 'exact').length;
    const fuzzyCount = detectedRows.filter(r => r.method === 'fuzzy').length;
    const learnedCount = detectedRows.filter(r => r.method === 'learned').length;
    const manualCount = detectedRows.filter(r => r.method === 'manual').length;
    const missingCount = detectedRows.length - matchedCount;

    const rowsToDisplay = showExact
        ? detectedRows
        : detectedRows.filter(r => r.method !== 'exact');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className={`bg-white rounded-2xl shadow-2xl w-full flex flex-col max-h-[90vh] transition-all ${step === 'preview' ? 'max-w-6xl' : 'max-w-2xl'}`}>
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

                            {/* Import Mode */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">2. Choose Import Mode</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <button
                                        onClick={() => setImportMode('merge')}
                                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${importMode === 'merge'
                                            ? 'border-indigo-500 bg-indigo-50 text-indigo-700'
                                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                            }`}
                                    >
                                        <div className={`p-2 rounded-full ${importMode === 'merge' ? 'bg-indigo-200' : 'bg-gray-100'}`}>
                                            <GitMerge className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm">Merge / Append</div>
                                            <div className="text-[10px] opacity-80">Update only found SKUs. Keep others safe.</div>
                                        </div>
                                    </button>

                                    <button
                                        onClick={() => setImportMode('replace')}
                                        className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${importMode === 'replace'
                                            ? 'border-red-500 bg-red-50 text-red-700'
                                            : 'border-gray-200 hover:border-gray-300 text-gray-600'
                                            }`}
                                    >
                                        <div className={`p-2 rounded-full ${importMode === 'replace' ? 'bg-red-200' : 'bg-gray-100'}`}>
                                            <Eraser className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="font-bold text-sm">Replace All</div>
                                            <div className="text-[10px] opacity-80">Clear ALL old aliases for {selectedPlatform} first.</div>
                                        </div>
                                    </button>
                                </div>
                            </div>

                            {/* File Upload */}
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">3. Upload Platform Export</label>
                                <div
                                    className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-all ${dragActive ? 'border-indigo-500 bg-indigo-50 scale-[1.02]' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
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
                            <div className="flex flex-col md:flex-row justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-100 gap-4">
                                <div className="flex gap-6 items-center">
                                    <div className="flex flex-col">
                                        <span className="text-xs text-gray-500 uppercase font-bold">Total SKUs</span>
                                        <span className="text-lg font-bold text-gray-900">{detectedRows.length}</span>
                                    </div>
                                    <div className="w-px bg-gray-300 h-8"></div>
                                    <div className="flex flex-col">
                                        <span className="text-xs text-green-600 uppercase font-bold">Matched</span>
                                        <span className="text-lg font-bold text-green-600">{matchedCount}</span>
                                    </div>

                                    {/* Details */}
                                    <div className="flex gap-3 ml-4 text-xs text-gray-500 bg-white px-3 py-1 rounded border border-gray-200">
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500"></span> Exact: {exactCount}</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> Fuzzy: {fuzzyCount}</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500"></span> Learned: {learnedCount}</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500"></span> Manual: {manualCount}</span>
                                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-gray-300"></span> Missing: {missingCount}</span>
                                    </div>
                                </div>

                                <div className="flex items-center gap-3">
                                    {exactCount > 0 && (
                                        <button
                                            onClick={() => setShowExact(!showExact)}
                                            className={`text-xs font-medium px-3 py-1.5 rounded-lg border flex items-center gap-2 transition-colors ${showExact ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-gray-600 border-gray-300'}`}
                                        >
                                            {showExact ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                                            {showExact ? 'Hide Exact Matches' : `Show ${exactCount} Exact Matches`}
                                        </button>
                                    )}
                                    <button onClick={() => { setDetectedRows([]); setStep('upload'); setShowExact(false); }} className="text-sm text-gray-500 flex items-center gap-1 hover:text-gray-900 ml-2">
                                        <RefreshCw className="w-3 h-3" /> Reset
                                    </button>
                                </div>
                            </div>

                            <div className="max-h-[60vh] overflow-y-auto border border-gray-200 rounded-xl">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 shadow-sm z-10">
                                        <tr>
                                            <th className="p-3 w-1/3">Platform Alias (Imported)</th>
                                            <th className="p-3 w-1/3">Matched Master SKU (Inventory)</th>
                                            <th className="p-3 w-1/6 text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {rowsToDisplay.map((row, idx) => {
                                            // We need the original index to update state correctly
                                            const originalIndex = detectedRows.indexOf(row);

                                            return (
                                                <tr key={idx} className={row.method === 'none' ? 'bg-red-50/20' : row.method === 'fuzzy' ? 'bg-indigo-50/20' : row.method === 'learned' ? 'bg-purple-50/20' : row.method === 'manual' ? 'bg-blue-50/20' : ''}>
                                                    <td className="p-3 font-mono text-xs text-gray-700 align-middle">
                                                        {row.fileSku}
                                                    </td>
                                                    <td className="p-3 align-middle">
                                                        {row.method === 'exact' ? (
                                                            <div className="font-mono text-xs font-bold text-gray-900 py-2">{row.masterSku}</div>
                                                        ) : (
                                                            <div className="relative group">
                                                                <input
                                                                    type="text"
                                                                    list="masterSkuList"
                                                                    value={row.masterSku || ''}
                                                                    onChange={(e) => handleManualChange(originalIndex, e.target.value)}
                                                                    placeholder="Search Master SKU..."
                                                                    className={`w-full px-3 py-2 border rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500 transition-colors ${row.masterSku && row.method !== 'none' ? 'border-gray-300 text-gray-900' : 'border-red-300 text-red-600 bg-white'}`}
                                                                />
                                                                <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none">
                                                                    {row.method === 'manual' ? <Edit2 className="w-3 h-3" /> : <Search className="w-3 h-3" />}
                                                                </div>
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="p-3 text-right align-middle">
                                                        {row.method === 'exact' && <span className="inline-flex items-center px-2 py-1 rounded text-[10px] bg-green-100 text-green-700 font-medium">Exact</span>}
                                                        {row.method === 'fuzzy' && <span className="inline-flex items-center px-2 py-1 rounded text-[10px] bg-indigo-100 text-indigo-700 font-medium">Auto-Link</span>}
                                                        {row.method === 'learned' && <span className="inline-flex items-center px-2 py-1 rounded text-[10px] bg-purple-100 text-purple-700 font-medium">Learned</span>}
                                                        {row.method === 'manual' && <span className="inline-flex items-center px-2 py-1 rounded text-[10px] bg-blue-100 text-blue-700 font-medium">Manual</span>}
                                                        {row.method === 'none' && <span className="inline-flex items-center px-2 py-1 rounded text-[10px] bg-gray-200 text-gray-500">Ignored</span>}
                                                    </td>
                                                </tr>
                                            )
                                        })}
                                    </tbody>
                                </table>
                            </div>

                            {/* Datalist for autocomplete */}
                            <datalist id="masterSkuList">
                                {products.map(p => (
                                    <option key={p.id} value={p.sku} />
                                ))}
                            </datalist>

                            <div className="flex justify-between items-center text-xs text-gray-500 px-1">
                                <p>
                                    {rowsToDisplay.length < detectedRows.length ? `Showing ${rowsToDisplay.length} of ${detectedRows.length} rows (Exact matches hidden)` : `Showing all ${detectedRows.length} rows`}
                                </p>
                                <p>
                                    Rows without a valid Master SKU match will be skipped.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
                    <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
                    {step === 'preview' && matchedCount > 0 && (
                        <button
                            onClick={handleSave}
                            className={`px-6 py-2 text-white font-medium rounded-lg shadow-md flex items-center gap-2 ${importMode === 'replace' ? 'bg-red-600 hover:bg-red-700' : 'bg-indigo-600 hover:bg-indigo-700'}`}
                        >
                            {importMode === 'replace' ? <Eraser className="w-4 h-4" /> : <Check className="w-4 h-4" />}
                            Confirm {importMode === 'replace' ? 'Overwrite' : 'Merge'} {matchedCount} Mappings
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MappingUploadModal;