import React, { useState, useRef, useMemo } from 'react';
import { Upload, X, CheckCircle2, AlertCircle, Loader2, Truck, Package, Weight, Zap } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product, FreightRate } from '../../../types';
import { calculateFreight, canCalculateFreight } from '../../../services/freightCalculator';

interface FreightUploadModalProps {
    products: Product[];
    onClose: () => void;
    onConfirm: (rates: FreightRate[]) => void;
}

interface ParsedRow {
    sku: string;
    length?: number;
    width?: number;
    height?: number;
    weight?: number;
    cubicWeight?: number;
    totalCharge: number;
    source: 'erp' | 'formula';  // erp = from file, formula = fallback calculated
    matched: boolean;            // matched to a master product
    status: 'valid' | 'error' | 'unmatched';
}

const fmt = (n: number) => `£${n.toFixed(2)}`;

const FreightUploadModal: React.FC<FreightUploadModalProps> = ({ products, onClose, onConfirm }) => {
    const [dragActive, setDragActive]     = useState(false);
    const [parsed, setParsed]             = useState<ParsedRow[] | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError]               = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // Product map for fast lookup
    const productMap = useMemo(() => {
        const m = new Map<string, Product>();
        products.forEach(p => m.set(p.sku.toUpperCase(), p));
        return m;
    }, [products]);

    const handleDrag = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setDragActive(e.type === 'dragenter' || e.type === 'dragover');
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault(); e.stopPropagation();
        setDragActive(false);
        if (e.dataTransfer.files?.[0]) processFile(e.dataTransfer.files[0]);
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) processFile(e.target.files[0]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const processFile = (file: File) => {
        setIsProcessing(true);
        setError(null);
        setParsed(null);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                const wb   = XLSX.read(data, { type: 'binary' });
                const ws   = wb.Sheets[wb.SheetNames[0]];
                const rows = XLSX.utils.sheet_to_json<any>(ws, { defval: '' });

                if (!rows.length) { setError('File appears to be empty.'); setIsProcessing(false); return; }

                // Detect columns — supports ERP format and simple sku/freight format
                const first = rows[0];
                const keys  = Object.keys(first).map(k => k.toLowerCase().trim());

                const col = (candidates: string[]): string | null => {
                    for (const candidate of candidates) {
                        const found = Object.keys(first).find(k => k.toLowerCase().trim() === candidate);
                        if (found) return found;
                    }
                    return null;
                };

                const skuCol    = col(['sku_code', 'sku', 'sku code', 'item', 'product_code', 'productcode']);
                const chargeCol = col(['totalcharge', 'total_charge', 'total charge', 'freight', 'freight_cost', 'freightcost', 'cost', 'rate', 'charge']);
                const lengthCol = col(['length', 'len', 'l']);
                const widthCol  = col(['width', 'wid', 'w']);
                const heightCol = col(['height', 'hgt', 'h']);
                const weightCol = col(['weight', 'wgt', 'actual_weight', 'actualweight']);
                const cubicCol  = col(['cubicweight', 'cubic_weight', 'cubic weight', 'vol_weight']);

                if (!skuCol) { setError("Could not find SKU column. Expected 'sku_code', 'sku', or 'item'."); setIsProcessing(false); return; }
                if (!chargeCol) { setError("Could not find charge column. Expected 'totalCharge', 'freight', or 'rate'."); setIsProcessing(false); return; }

                const results: ParsedRow[] = [];

                rows.forEach((row: any) => {
                    const sku = String(row[skuCol!] || '').trim();
                    if (!sku) return;

                    const charge = parseFloat(row[chargeCol!]);
                    if (isNaN(charge) || charge <= 0) return;  // skip rows with no charge

                    const length = lengthCol ? parseFloat(row[lengthCol]) || 0 : 0;
                    const width  = widthCol  ? parseFloat(row[widthCol])  || 0 : 0;
                    const height = heightCol ? parseFloat(row[heightCol]) || 0 : 0;
                    const weight = weightCol ? parseFloat(row[weightCol]) || 0 : 0;
                    const cubicWeight = cubicCol ? parseFloat(row[cubicCol]) || 0 : 0;

                    const matched = productMap.has(sku.toUpperCase());

                    results.push({
                        sku, length, width, height, weight, cubicWeight,
                        totalCharge: charge,
                        source: 'erp',
                        matched,
                        status: 'valid',
                    });
                });

                // For products NOT in file → calculate fallback using freightCalculator
                // (shown in stats but not uploaded — user confirms only ERP data)
                const inFile  = new Set(results.map(r => r.sku.toUpperCase()));
                let formulaCount = 0;
                products.forEach(p => {
                    if (inFile.has(p.sku.toUpperCase())) return;
                    const pAny = p as any;
                    if (canCalculateFreight({ length: pAny.length, width: pAny.width, height: pAny.height, weight: pAny.weight })) {
                        const rate = calculateFreight({ length: pAny.length, width: pAny.width, height: pAny.height, weight: pAny.weight });
                        results.push({ sku: p.sku, totalCharge: rate, source: 'formula', matched: true, status: 'valid' });
                        formulaCount++;
                    }
                });

                setParsed(results);
                setIsProcessing(false);
            } catch (err) {
                setError('Failed to parse file. Please check it matches the ERP export format.');
                setIsProcessing(false);
            }
        };
        reader.readAsBinaryString(file);
    };

    const stats = useMemo(() => {
        if (!parsed) return null;
        const erp     = parsed.filter(r => r.source === 'erp');
        const formula = parsed.filter(r => r.source === 'formula');
        const matched = erp.filter(r => r.matched);
        return { total: parsed.length, erp: erp.length, formula: formula.length, matched: matched.length };
    }, [parsed]);

    const handleConfirm = () => {
        if (!parsed) return;
        const rates: FreightRate[] = parsed
            .filter(r => r.status === 'valid')
            .map(r => ({ sku: r.sku, rate: r.totalCharge }));
        onConfirm(rates);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)' }}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-teal-50">
                            <Truck className="w-5 h-5 text-teal-700" />
                        </div>
                        <div>
                            <div className="font-bold text-gray-900">Freight Cost Upload</div>
                            <div className="text-xs text-gray-400">ERP shipping cost export · updates postage for all margin calculations</div>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                    {/* File format reference */}
                    <div className="rounded-xl border border-gray-200 overflow-hidden">
                        <div className="flex items-center gap-2 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                            <Package className="w-3.5 h-3.5 text-gray-400" />
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Expected File Format (ERP Export)</span>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="sello-table text-[10px]">
                                <thead>
                                    <tr>
                                        {['sku_code','length','width','height','weight','cubicWeight','weightSurcharge','sizeSurcharge','totalCharge'].map(colName => (
                                            <th key={colName} className={colName === 'totalCharge' ? 'r' : ''}>
                                                <span className={colName === 'totalCharge' ? 'text-teal-700 font-bold' : ''}>{colName}</span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {[
                                        ['AI1005-BK-UK','28','21','19','1.50','2.23','0','0','1.71'],
                                        ['AI1010-WH-UK','33','25','51','9.85','8.42','0','0','3.40'],
                                        ['AP0029-BK-UK','35','22','30','3.60','4.62','0','0','1.71'],
                                    ].map((row, i) => (
                                        <tr key={i}>
                                            {row.map((cell, j) => (
                                                <td key={j} className={j === 8 ? 'r' : ''}>
                                                    <span className={j === 8 ? 'v-num font-bold text-teal-700' : j === 0 ? 'sku' : 'v-dim'}>{cell}</span>
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-[10px] text-gray-400">
                            Only <strong className="text-teal-700">sku_code</strong> and <strong className="text-teal-700">totalCharge</strong> are required. Other columns are informational.
                            SKUs not in the file will use the freight formula as fallback.
                        </div>
                    </div>

                    {/* Drop zone */}
                    {!parsed && !isProcessing && (
                        <div
                            onDragEnter={handleDrag} onDragLeave={handleDrag}
                            onDragOver={handleDrag} onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                            className={`rounded-xl border-2 border-dashed cursor-pointer transition-colors flex flex-col items-center justify-center py-12 gap-3 ${
                                dragActive ? 'border-teal-400 bg-teal-50' : 'border-gray-200 hover:border-gray-300'
                            }`}
                        >
                            <Upload className={`w-8 h-8 ${dragActive ? 'text-teal-500' : 'text-gray-300'}`} />
                            <div className="text-sm font-medium text-gray-500">Drop ERP freight export here</div>
                            <div className="text-xs text-gray-400">or click to browse · CSV or XLSX</div>
                            <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
                        </div>
                    )}

                    {/* Processing */}
                    {isProcessing && (
                        <div className="flex flex-col items-center justify-center py-12 gap-3">
                            <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
                            <div className="text-sm text-gray-500">Parsing freight file…</div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="flex items-start gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-100 text-red-700">
                            <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                            <div className="text-sm">{error}</div>
                        </div>
                    )}

                    {/* Results */}
                    {parsed && stats && (
                        <div className="space-y-4">
                            {/* Summary cards */}
                            <div className="grid grid-cols-4 gap-3">
                                {[
                                    { label: 'From ERP', value: stats.erp, icon: Truck, color: 'text-teal-700', bg: 'bg-teal-50' },
                                    { label: 'Matched to master', value: stats.matched, icon: CheckCircle2, color: 'text-emerald-700', bg: 'bg-emerald-50' },
                                    { label: 'Formula fallback', value: stats.formula, icon: Zap, color: 'text-amber-700', bg: 'bg-amber-50' },
                                    { label: 'Total to apply', value: stats.erp + stats.formula, icon: Weight, color: 'text-blue-700', bg: 'bg-blue-50' },
                                ].map(({ label, value, icon: Icon, color, bg }) => (
                                    <div key={label} className={`rounded-xl border border-gray-200 p-3 flex flex-col items-center gap-1 ${bg}`}>
                                        <Icon className={`w-4 h-4 ${color}`} />
                                        <div className={`text-xl font-bold ${color}`}>{value}</div>
                                        <div className="text-[10px] text-gray-500 text-center">{label}</div>
                                    </div>
                                ))}
                            </div>

                            {/* Preview table — ERP rows only */}
                            <div className="rounded-xl border border-gray-200 overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">ERP Rates Preview</span>
                                    <span className="sello-badge badge-gray text-[10px]">{stats.erp} rows</span>
                                </div>
                                <div className="max-h-52 overflow-y-auto">
                                    <table className="sello-table">
                                        <thead>
                                            <tr>
                                                <th>SKU</th>
                                                <th className="c">Matched</th>
                                                <th className="r">Freight Cost</th>
                                                {parsed[0]?.weight ? <th className="r">Weight</th> : null}
                                                <th>Source</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {parsed.filter(r => r.source === 'erp').slice(0, 100).map(r => (
                                                <tr key={r.sku}>
                                                    <td><span className="sku text-[10px]">{r.sku}</span></td>
                                                    <td className="c">
                                                        {r.matched
                                                            ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" />
                                                            : <span className="sello-badge badge-amber text-[9px]">not found</span>
                                                        }
                                                    </td>
                                                    <td className="r"><span className="v-num font-bold text-teal-700">{fmt(r.totalCharge)}</span></td>
                                                    {parsed[0]?.weight ? <td className="r"><span className="v-dim">{r.weight ? `${r.weight}kg` : '—'}</span></td> : null}
                                                    <td><span className="sello-badge badge-green text-[9px]">ERP</span></td>
                                                </tr>
                                            ))}
                                            {stats.formula > 0 && (
                                                <tr className="bg-amber-50/50">
                                                    <td colSpan={5} className="text-[10px] text-amber-700 font-medium px-4 py-2">
                                                        + {stats.formula} SKUs will use formula fallback (not in ERP file but have dimensions)
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* Try again */}
                            <button onClick={() => { setParsed(null); setError(null); }}
                                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1">
                                Upload a different file
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
                    <div className="text-xs text-gray-400">
                        Applying updates <strong>product.postage</strong> — used in all margin, profit and strategy calculations
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="sello-btn">Cancel</button>
                        {parsed && stats && (
                            <button onClick={handleConfirm}
                                className="sello-btn cta flex items-center gap-1.5 text-white border-transparent"
                                style={{ background: '#134E4A' }}>
                                <CheckCircle2 className="w-4 h-4" />
                                Apply {stats.erp + stats.formula} Rates
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default FreightUploadModal;
