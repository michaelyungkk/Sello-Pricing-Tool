import React, { useState, useRef, useCallback } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, X } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product } from '../../../types';

interface DescriptionUploadToolProps {
    products: Product[];
    onImport: (data: { sku: string; description: string }[]) => void;
    themeColor?: string;
}

interface ParsedRow {
    sku: string;
    description: string;
    matched: boolean;
    productName?: string;
}

export const DescriptionUploadTool: React.FC<DescriptionUploadToolProps> = ({
    products,
    onImport,
    themeColor = '#134E4A',
}) => {
    const [dragActive, setDragActive] = useState(false);
    const [parsedRows, setParsedRows] = useState<ParsedRow[] | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmed, setConfirmed] = useState(false);
    const fileRef = useRef<HTMLInputElement>(null);

    const processFile = useCallback(async (file: File) => {
        setIsProcessing(true);
        setError(null);
        setParsedRows(null);
        setConfirmed(false);

        try {
            const buffer = await file.arrayBuffer();
            const wb = XLSX.read(buffer, { type: 'array' });
            const ws = wb.Sheets[wb.SheetNames[0]];
            const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

            if (raw.length < 2) {
                setError('File appears empty or has no data rows.');
                setIsProcessing(false);
                return;
            }

            const headers = raw[0].map((h: any) => String(h || '').trim().toLowerCase());
            const skuIdx = headers.findIndex(h =>
                h === 'sku' || h === 'master sku' || h === 'product sku'
            );
            const descIdx = headers.findIndex(h =>
                h.includes('description') || h === 'desc' ||
                h.includes('product_desc') || h.includes('product description')
            );

            if (skuIdx === -1) {
                setError('Could not find a SKU column. Expected a column named "sku" or "master sku".');
                setIsProcessing(false);
                return;
            }
            if (descIdx === -1) {
                setError('Could not find a description column. Expected a column named "description" or "desc".');
                setIsProcessing(false);
                return;
            }

            // Build product lookup (case-insensitive, strip -UK suffix for matching)
            const productMap = new Map<string, Product>();
            products.forEach(p => {
                productMap.set(p.sku.toUpperCase(), p);
                // Also map without -UK suffix
                productMap.set(p.sku.toUpperCase().replace(/-UK$/i, ''), p);
            });

            const rows: ParsedRow[] = [];
            for (let i = 1; i < raw.length; i++) {
                const row = raw[i];
                const sku = String(row[skuIdx] || '').trim();
                const desc = String(row[descIdx] || '').trim();
                if (!sku || !desc || desc.length < 10) continue;

                const matchedProduct =
                    productMap.get(sku.toUpperCase()) ||
                    productMap.get(sku.toUpperCase().replace(/-UK$/i, ''));

                rows.push({
                    sku,
                    description: desc,
                    matched: !!matchedProduct,
                    productName: matchedProduct?.name,
                });
            }

            if (rows.length === 0) {
                setError('No valid rows found. Ensure the file has SKU and description data.');
                setIsProcessing(false);
                return;
            }

            setParsedRows(rows);
        } catch (e) {
            setError('Could not parse file. Please ensure it is a valid XLSX or CSV.');
        }

        setIsProcessing(false);
    }, [products]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setDragActive(false);
        const file = e.dataTransfer.files[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    }, [processFile]);

    const handleConfirm = useCallback(() => {
        if (!parsedRows) return;
        const matched = parsedRows.filter(r => r.matched);
        onImport(matched.map(r => ({ sku: r.sku, description: r.description })));
        setConfirmed(true);
    }, [parsedRows, onImport]);

    const handleReset = () => {
        setParsedRows(null);
        setError(null);
        setConfirmed(false);
        if (fileRef.current) fileRef.current.value = '';
    };

    const matchedCount = parsedRows?.filter(r => r.matched).length ?? 0;
    const totalCount = parsedRows?.length ?? 0;

    return (
        <div className="max-w-2xl mx-auto space-y-5">
            {/* Header */}
            <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl" style={{ background: `${themeColor}12` }}>
                    <FileText className="w-5 h-5" style={{ color: themeColor }} />
                </div>
                <div>
                    <h2 className="text-base font-bold text-gray-900">Product Description Upload</h2>
                    <p className="text-xs text-gray-500">Bulk-import descriptions from XLSX for the Weekly Showcase report</p>
                </div>
            </div>

            {/* Success state */}
            {confirmed && (
                <div className="flex items-center gap-3 p-4 rounded-xl border border-green-100 bg-green-50">
                    <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                    <div>
                        <p className="text-sm font-bold text-green-800">Import complete</p>
                        <p className="text-xs text-green-600">{matchedCount} product descriptions updated successfully.</p>
                    </div>
                    <button onClick={handleReset} className="ml-auto p-1.5 hover:bg-green-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-green-600" />
                    </button>
                </div>
            )}

            {/* Drop zone (show when no file loaded) */}
            {!parsedRows && !confirmed && (
                <div
                    onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={handleDrop}
                    onClick={() => fileRef.current?.click()}
                    className={`relative border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all ${
                        dragActive
                            ? 'border-opacity-100 bg-opacity-5'
                            : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                    }`}
                    style={dragActive ? { borderColor: themeColor, background: `${themeColor}05` } : {}}
                >
                    <input
                        ref={fileRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        className="hidden"
                        onChange={handleFileChange}
                    />
                    {isProcessing ? (
                        <div className="flex flex-col items-center gap-2">
                            <div className="w-8 h-8 border-2 border-gray-300 rounded-full animate-spin" style={{ borderTopColor: themeColor }} />
                            <p className="text-sm text-gray-500">Processing file…</p>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center gap-3">
                            <Upload className="w-8 h-8 text-gray-300" />
                            <div>
                                <p className="text-sm font-bold text-gray-700">Drop file or click to upload</p>
                                <p className="text-xs text-gray-400 mt-1">XLSX or CSV</p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Error */}
            {error && (
                <div className="flex items-start gap-2 p-3 rounded-xl border border-red-100 bg-red-50">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto">
                        <X className="w-3.5 h-3.5 text-red-400" />
                    </button>
                </div>
            )}

            {/* Expected columns help */}
            {!parsedRows && !confirmed && (
                <div className="p-4 rounded-xl border border-gray-100 bg-gray-50 text-xs text-gray-500 space-y-1.5">
                    <p className="font-bold text-gray-700 text-sm">Expected columns</p>
                    <p><code className="bg-gray-200 px-1 rounded">sku</code> — required, matches master SKU</p>
                    <p><code className="bg-gray-200 px-1 rounded">description</code> (or <code className="bg-gray-200 px-1 rounded">desc</code>) — required, full product content including FEATURES and SPECS sections for best bullet extraction</p>
                </div>
            )}

            {/* Results preview */}
            {parsedRows && !confirmed && (
                <div className="space-y-4">
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-3">
                        <div className="p-3 rounded-xl border text-center" style={{ background: `${themeColor}08`, borderColor: `${themeColor}20` }}>
                            <div className="text-xl font-bold" style={{ color: themeColor }}>{totalCount}</div>
                            <div className="text-[10px] font-bold uppercase text-gray-400 mt-0.5">Total rows</div>
                        </div>
                        <div className="p-3 rounded-xl border border-green-100 bg-green-50 text-center">
                            <div className="text-xl font-bold text-green-700">{matchedCount}</div>
                            <div className="text-[10px] font-bold uppercase text-gray-400 mt-0.5">Matched</div>
                        </div>
                        <div className="p-3 rounded-xl border border-amber-100 bg-amber-50 text-center">
                            <div className="text-xl font-bold text-amber-700">{totalCount - matchedCount}</div>
                            <div className="text-[10px] font-bold uppercase text-gray-400 mt-0.5">No match</div>
                        </div>
                    </div>

                    {/* Row preview */}
                    <div className="border border-gray-100 rounded-xl overflow-hidden max-h-64 overflow-y-auto">
                        <table className="w-full text-xs">
                            <thead className="sticky top-0 bg-gray-50 border-b border-gray-100">
                                <tr>
                                    <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">SKU</th>
                                    <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">Product</th>
                                    <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">Description (preview)</th>
                                    <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {parsedRows.map((row, i) => (
                                    <tr key={i} className={`border-t border-gray-50 ${!row.matched ? 'opacity-50' : ''}`}>
                                        <td className="px-3 py-2 font-mono font-bold text-gray-700">{row.sku}</td>
                                        <td className="px-3 py-2 text-gray-500 truncate max-w-[150px]">
                                            {row.productName || <span className="italic text-gray-300">No match</span>}
                                        </td>
                                        <td className="px-3 py-2 text-gray-400 truncate max-w-[200px]">
                                            {row.description.slice(0, 60)}…
                                        </td>
                                        <td className="px-3 py-2">
                                            {row.matched
                                                ? <span className="flex items-center gap-1 text-green-600"><CheckCircle className="w-3 h-3" /> Matched</span>
                                                : <span className="flex items-center gap-1 text-amber-500"><AlertTriangle className="w-3 h-3" /> No match</span>
                                            }
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Action buttons */}
                    <div className="flex items-center justify-between">
                        <button
                            onClick={handleReset}
                            className="px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={handleConfirm}
                            disabled={matchedCount === 0}
                            className="px-5 py-2 text-sm font-bold text-white rounded-xl transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: themeColor }}
                        >
                            Confirm Import — Update {matchedCount} Products
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
