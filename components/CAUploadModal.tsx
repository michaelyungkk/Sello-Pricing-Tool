
import React, { useState, useRef, useMemo, useEffect } from 'react';
import { formatSmartMoney } from '../utils/format';
import { Upload, X, Check, AlertCircle, Loader2, RefreshCw, Calendar, TrendingUp, Hash, ArrowRight, Image as ImageIcon } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product } from '../types';

interface CAUploadModalProps {
    products: Product[];
    onClose: () => void;
    onConfirm: (data: { sku: string; caPrice: number; imageUrl?: string }[], reportDate: string) => void;
}

const CAUploadModal: React.FC<CAUploadModalProps> = ({ products, onClose, onConfirm }) => {
    const [dragActive, setDragActive] = useState(false);
    const [parsedItems, setParsedItems] = useState<{ sku: string; caPrice: number; imageUrl?: string; status: 'valid' | 'error' | 'skipped' }[] | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [stats, setStats] = useState({ valid: 0, skipped: 0, matched: 0, changes: 0, images: 0 });
    const [reportDate, setReportDate] = useState(new Date().toISOString().split('T')[0]); // Default to today
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
        const priceIdx = headers.indexOf('price');

        // Image URL Column Detection (Optional)
        const imageIdx = headers.findIndex(h => h.includes('image') || h === 'pic' || h === 'picture' || h === 'url');

        if (skuIdx === -1) {
            setError("Missing required column: 'sku'");
            return;
        }

        if (priceIdx === -1) {
            setError("Missing required column: 'price'");
            return;
        }

        const results = [];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row[skuIdx]) continue;
            const sku = String(row[skuIdx]).trim();

            // Skip parent SKUs matching pattern *-UK-ALL
            if (sku.match(/-UK-ALL$/i)) {
                results.push({
                    sku,
                    caPrice: 0,
                    status: 'skipped' as const
                });
                continue;
            }

            // Parse price
            const priceVal = priceIdx !== -1 ? parseFloat(String(row[priceIdx])) : undefined;
            const imageUrl = imageIdx !== -1 ? String(row[imageIdx]).trim() : undefined;

            results.push({
                sku,
                caPrice: priceVal !== undefined && !isNaN(priceVal) ? priceVal : 0,
                imageUrl: imageUrl && imageUrl.startsWith('http') ? imageUrl : undefined,
                status: (!sku || priceVal === undefined || isNaN(priceVal)) ? 'error' as const : 'valid' as const
            });
        }

        setParsedItems(results);
    };

    // Calculate detailed stats when parsedItems updates
    useEffect(() => {
        if (!parsedItems) return;

        const validItems = parsedItems.filter(i => i.status === 'valid');
        const skippedCount = parsedItems.filter(i => i.status === 'skipped').length;

        // Build Map of Uploaded Data
        const caDataMap = new Map<string, number>();
        validItems.forEach(d => caDataMap.set(d.sku.toUpperCase().trim(), d.caPrice));

        let matchedCount = 0;
        let changeCount = 0;
        let imageCount = 0;

        products.forEach(p => {
            const masterSku = p.sku.toUpperCase().trim();
            let newPrice = caDataMap.get(masterSku);

            // Logic mirroring App.tsx for suffix fallback
            if (newPrice === undefined) {
                const stripped = masterSku.replace(/[-_]UK$/i, '');
                newPrice = caDataMap.get(stripped);
            }

            if (newPrice !== undefined) {
                matchedCount++;
                const oldPrice = p.caPrice || 0;
                // Count as a "Recorded Change" if old price exists and difference is significant
                if (oldPrice > 0 && Math.abs(oldPrice - newPrice) > 0.02) {
                    changeCount++;
                }
            }
        });

        imageCount = validItems.filter(i => i.imageUrl).length;

        setStats({
            valid: validItems.length,
            skipped: skippedCount,
            matched: matchedCount,
            changes: changeCount,
            images: imageCount
        });

    }, [parsedItems, products]);

    // NEW: Computed property for displaying ONLY changed items in the table
    const displayedChanges = useMemo(() => {
        if (!parsedItems) return [];

        // Lookup map for current product prices
        const priceMap = new Map<string, number>();
        products.forEach(p => {
            priceMap.set(p.sku.toUpperCase().trim(), p.caPrice || 0);
        });

        return parsedItems.filter(item => {
            if (item.status !== 'valid') return false;

            const skuUpper = item.sku.toUpperCase().trim();
            let oldPrice = priceMap.get(skuUpper);

            // Mirror suffix fallback logic
            if (oldPrice === undefined) {
                const stripped = skuUpper.replace(/[-_]UK$/i, '');
                oldPrice = priceMap.get(stripped);
            }

            // Only include in preview if it's an actual change from a known price
            if (oldPrice === undefined || oldPrice === 0) return false;
            return Math.abs(item.caPrice - oldPrice) > 0.02;
        }).map(item => {
            const skuUpper = item.sku.toUpperCase().trim();
            let oldPrice = priceMap.get(skuUpper);
            if (oldPrice === undefined) {
                const stripped = skuUpper.replace(/[-_]UK$/i, '');
                oldPrice = priceMap.get(stripped);
            }
            return { ...item, oldPrice };
        });
    }, [parsedItems, products]);

    const validItems = parsedItems?.filter(i => i.status === 'valid') || [];

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h2 className="text-xl font-bold">Import CA Prices</h2>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>

                <div className="p-6 space-y-6">
                    {/* Date Selection */}
                    <div>
                        <label className="block text-sm font-bold text-gray-700 mb-2 flex items-center gap-2">
                            <Calendar className="w-4 h-4 text-theme" />
                            Report Date
                        </label>
                        <input
                            type="date"
                            value={reportDate}
                            onChange={(e) => setReportDate(e.target.value)}
                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-theme"
                        />
                        <p className="text-xs text-gray-500 mt-1">
                            Set this to the date the file was generated. This date will be recorded in the Price Change Log.
                        </p>
                    </div>

                    {isProcessing ? (
                        <div className="flex flex-col items-center py-10">
                            <Loader2 className="w-8 h-8 animate-spin text-theme mb-2" />
                            <span className="text-gray-500">Processing...</span>
                        </div>
                    ) : !parsedItems ? (
                        <div
                            className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-colors ${dragActive ? 'border-theme bg-theme-10' : 'border-gray-300 hover:border-gray-400'
                                }`}
                            onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}
                        >
                            <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} accept=".csv, .xlsx" />
                            <Upload className="w-8 h-8 text-gray-400 mb-4" />
                            <p className="text-sm font-medium text-gray-900">Drag & Drop or <button onClick={() => fileInputRef.current?.click()} className="text-theme underline">Browse</button></p>

                            <div className="mt-4 text-left text-xs text-gray-500 bg-gray-50 p-3 rounded border border-gray-200 w-full">
                                <p className="font-semibold text-gray-700 mb-1">Column Requirements:</p>
                                <ul className="list-disc pl-4 space-y-1">
                                    <li><code className="bg-theme-10 text-theme px-1 rounded">sku</code> (Required)</li>
                                    <li><code className="bg-theme-10 text-theme px-1 rounded">price</code> (Required - CA Price)</li>
                                    <li><code className="bg-gray-200 px-1 rounded">image</code> (Optional - Product Image URL)</li>
                                </ul>
                                <p className="mt-2 text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                                    <strong>Note:</strong> Parent SKUs matching pattern *-UK-ALL will be automatically skipped.
                                </p>
                            </div>

                            {error && <p className="text-red-500 text-sm mt-3 flex items-center gap-1"><AlertCircle className="w-4 h-4" />{error}</p>}
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {/* Summary Stats Grid */}
                            <div className="grid grid-cols-4 gap-3">
                                <div className="p-3 bg-gray-50 rounded-xl border border-gray-200 text-center">
                                    <span className="text-[10px] text-gray-500 font-medium uppercase flex items-center justify-center gap-1">
                                        <Hash className="w-3 h-3" /> Found
                                    </span>
                                    <div className="text-xl font-bold text-gray-900 mt-1">{stats.valid}</div>
                                </div>
                                <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-center">
                                    <span className="text-[10px] text-blue-700 font-medium uppercase flex items-center justify-center gap-1">
                                        <Check className="w-3 h-3" /> Matched
                                    </span>
                                    <div className="text-xl font-bold text-blue-900 mt-1">{stats.matched}</div>
                                </div>
                                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl text-center">
                                    <span className="text-[10px] text-amber-700 font-medium uppercase flex items-center justify-center gap-1">
                                        <TrendingUp className="w-3 h-3" /> Changes
                                    </span>
                                    <div className="text-xl font-bold text-amber-900 mt-1">{stats.changes}</div>
                                </div>
                                <div className="p-3 bg-teal-50 border border-teal-100 rounded-xl text-center">
                                    <span className="text-[10px] text-teal-700 font-medium uppercase flex items-center justify-center gap-1">
                                        <ImageIcon className="w-3 h-3" /> Images
                                    </span>
                                    <div className="text-xl font-bold text-teal-900 mt-1">{stats.images}</div>
                                </div>
                            </div>

                            <div className="flex justify-between items-center px-1">
                                <div className="flex flex-col gap-1">
                                    <h3 className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                                        <TrendingUp className="w-3 h-3" /> Price Changes Detected
                                    </h3>
                                    {stats.skipped > 0 && (
                                        <span className="text-[9px] text-amber-600 font-medium">
                                            ({stats.skipped} parents ignored)
                                        </span>
                                    )}
                                </div>
                                <button onClick={() => setParsedItems(null)} className="text-[10px] text-gray-400 flex items-center gap-1 hover:text-gray-600 transition-colors uppercase font-bold"><RefreshCw className="w-2.5 h-2.5" /> Reset</button>
                            </div>

                            <div className="max-h-40 overflow-y-auto border rounded-lg shadow-inner bg-gray-50/30">
                                <table className="tbl tbl-compact w-full text-xs text-left">
                                    <thead className="sticky top-0">
                                        <tr>
                                            <th className="p-2 uppercase font-medium text-gray-500">SKU</th>
                                            <th className="p-2 text-right uppercase font-medium text-gray-500">Old</th>
                                            <th className="p-2 text-center"></th>
                                            <th className="p-2 text-right uppercase font-medium text-theme">New</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {displayedChanges.length > 0 ? (
                                            displayedChanges.slice(0, 50).map((item, idx) => (
                                                <tr key={idx} className="border-t bg-white group hover:bg-theme-10/30">
                                                    <td className="p-2 font-mono text-gray-700 font-medium">{item.sku}</td>
                                                    <td className="p-2 text-right text-gray-400 font-mono">{formatSmartMoney(item.oldPrice)}</td>
                                                    <td className="p-2 text-center text-gray-300">
                                                        <ArrowRight className="w-3 h-3 mx-auto" />
                                                    </td>
                                                    <td className="p-2 text-right font-bold text-theme font-mono">{formatSmartMoney(item.caPrice)}</td>
                                                </tr>
                                            ))
                                        ) : (
                                            <tr>
                                                <td colSpan={4} className="p-8 text-center text-gray-400 italic">
                                                    {validItems.length > 0
                                                        ? "Prices in file match current database values."
                                                        : "No valid SKU data parsed from file."}
                                                </td>
                                            </tr>
                                        )}
                                        {displayedChanges.length > 50 && (
                                            <tr className="bg-gray-50">
                                                <td colSpan={4} className="p-2 text-center text-[10px] text-gray-400 font-medium italic">
                                                    ...and {displayedChanges.length - 50} more changes
                                                </td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t bg-gray-50 flex justify-end gap-3 rounded-b-2xl">
                    <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-bold transition-colors">Cancel</button>
                    {validItems.length > 0 && (
                        <button
                            onClick={() => onConfirm(validItems, reportDate)}
                            className="px-4 py-2 bg-theme text-white text-sm font-bold rounded-lg shadow-md hover:bg-theme transition-colors"
                        >
                            Update Prices & Images
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
};

export default CAUploadModal;
