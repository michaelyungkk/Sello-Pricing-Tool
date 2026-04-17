
import React, { useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Upload, X, Loader2, Settings2, AlertCircle, Check, ChevronRight, ArrowRight } from 'lucide-react';
import * as XLSX from 'xlsx';
import { Product } from '../../../types';

export type UploadDiscountMode = 'FIXED_PRICE' | 'PERCENT_OFF' | 'FIXED_OFF';

interface PromoUploadModalProps {
    products: Product[];
    themeColor: string;
    onClose: () => void;
    onConfirm: (items: { sku: string; value: number }[], mode: UploadDiscountMode) => void;
}

interface ParsedRow {
    rawSku: string;
    rawValue: string;
    value: number;
    masterSku: string | null;    // resolved master SKU
    productName: string | null;
}

type Step = 'upload' | 'map-columns' | 'map-skus' | 'confirm';

// Controlled SKU autocomplete — replaces native datalist to avoid auto-close on selection
const SkuAutocomplete: React.FC<{
    value: string;
    products: { sku: string; name?: string }[];
    onChange: (val: string) => void;
    placeholder?: string;
}> = ({ value, products, onChange, placeholder }) => {
    const [open, setOpen] = useState(false);
    const [pos, setPos] = useState({ top: 0, left: 0, width: 0 });
    const inputRef = useRef<HTMLInputElement>(null);

    const matches = useMemo(() => {
        if (!value || value.length < 1) return [];
        const q = value.toUpperCase();
        return products
            .filter(p => p.sku.toUpperCase().includes(q))
            .slice(0, 8);
    }, [value, products]);

    const openDropdown = () => {
        if (inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + 2, left: rect.left, width: rect.width });
        }
        setOpen(true);
    };

    const selectOption = (sku: string) => {
        onChange(sku);
        setOpen(false);
    };

    return (
        <>
            <input
                ref={inputRef}
                type="text"
                value={value}
                onChange={e => { onChange(e.target.value.toUpperCase()); openDropdown(); }}
                onFocus={openDropdown}
                onBlur={() => setTimeout(() => setOpen(false), 150)}
                placeholder={placeholder || 'Type master SKU…'}
                className="w-full border border-gray-200 rounded-lg px-2 py-1 text-xs font-mono focus:outline-none focus:border-gray-400"
            />
            {open && matches.length > 0 && createPortal(
                <div
                    style={{ position: 'fixed', top: pos.top, left: pos.left, width: Math.max(pos.width, 220), zIndex: 9999 }}
                    className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
                    onMouseDown={e => e.preventDefault()}
                >
                    {matches.map(p => (
                        <button
                            key={p.sku}
                            onClick={() => selectOption(p.sku)}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0"
                        >
                            <div className="text-xs font-bold font-mono text-gray-800">{p.sku}</div>
                            {p.name && <div className="text-[10px] text-gray-400 truncate mt-0.5">{p.name}</div>}
                        </button>
                    ))}
                </div>,
                document.body
            )}
        </>
    );
};

export const PromoUploadModal: React.FC<PromoUploadModalProps> = ({ products, themeColor, onClose, onConfirm }) => {
    const [step, setStep] = useState<Step>('upload');
    const [dragActive, setDragActive] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [uploadMode, setUploadMode] = useState<UploadDiscountMode>('FIXED_PRICE');

    // Raw parsed data from file
    const [rawRows, setRawRows] = useState<Record<string, any>[]>([]);
    const [columns, setColumns] = useState<string[]>([]);

    // Column mapping
    const [skuCol, setSkuCol] = useState('');
    const [valueCol, setValueCol] = useState('');

    // Manual SKU overrides for unmatched rows
    const [skuOverrides, setSkuOverrides] = useState<Record<string, string>>({});

    const fileInputRef = useRef<HTMLInputElement>(null);

    // Build alias map from product channels
    const aliasMap = useMemo(() => {
        const map = new Map<string, string>();
        products.forEach(p => {
            map.set(p.sku.toUpperCase(), p.sku);
            p.channels?.forEach(c => {
                c.skuAlias?.split(',').map(a => a.trim()).filter(Boolean).forEach(a => {
                    const alias = a.trim().toUpperCase();
                    if (alias) map.set(alias, p.sku);
                });
            });
        });
        return map;
    }, [products]);

    const productMap = useMemo(() => {
        const map = new Map<string, Product>();
        products.forEach(p => map.set(p.sku.toUpperCase(), p));
        return map;
    }, [products]);

    const resolveSku = (raw: string): string | null => {
        const upper = raw.trim().toUpperCase();
        if (aliasMap.has(upper)) return aliasMap.get(upper)!;
        return null;
    };

    // ── After column mapping, build parsed rows ──
    const parsedRows = useMemo((): ParsedRow[] => {
        if (!skuCol || !valueCol || rawRows.length === 0) return [];
        return rawRows.map(r => {
            const rawSku = String(r[skuCol] || '').trim();
            const rawValue = String(r[valueCol] || '').trim();
            const value = parseFloat(rawValue.replace(/[^0-9.]/g, '')) || 0;
            const override = skuOverrides[rawSku];
            const masterSku = override ? override : resolveSku(rawSku);
            const product = masterSku ? productMap.get(masterSku.toUpperCase()) ?? null : null;
            return {
                rawSku, rawValue, value,
                masterSku: masterSku || null,
                productName: product?.name ?? null,
            };
        }).filter(r => r.rawSku);
    }, [rawRows, skuCol, valueCol, skuOverrides, aliasMap, productMap]);

    const matched = parsedRows.filter(r => r.masterSku && r.value > 0);
    const unmatched = parsedRows.filter(r => !r.masterSku);

    // ── File parsing ──
    const handleFile = (file: File) => {
        setIsProcessing(true);
        setError(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                let rows: Record<string, any>[] = [];
                if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                    const wb = XLSX.read(e.target?.result, { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
                } else {
                    const lines = (e.target?.result as string).split('\n').filter(Boolean);
                    const headers = lines[0].split(',').map(h => h.trim());
                    rows = lines.slice(1).map(line => {
                        const vals = line.split(',');
                        const obj: Record<string, any> = {};
                        headers.forEach((h, i) => { obj[h] = vals[i]?.trim() ?? ''; });
                        return obj;
                    });
                }

                if (rows.length === 0) throw new Error('File appears empty.');
                const cols = Object.keys(rows[0]);
                setRawRows(rows);
                setColumns(cols);

                // Auto-detect columns
                const autoSku = cols.find(k => /sku|item|product|ref/i.test(k)) ?? cols[0];
                const autoVal = cols.find(k => /price|value|discount|%|off/i.test(k)) ?? cols[1] ?? cols[0];
                setSkuCol(autoSku);
                setValueCol(autoVal);
                setSkuOverrides({});
                setStep('map-columns');
            } catch (err: any) {
                setError(err.message || 'Failed to parse file.');
            } finally {
                setIsProcessing(false);
            }
        };
        if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    };

    const handleConfirmMapping = () => {
        if (unmatched.length > 0) {
            setStep('map-skus');
        } else if (matched.length > 0) {
            setStep('confirm');
        } else {
            setError('No valid rows found after mapping. Check your column selection.');
        }
    };

    const handleFinalConfirm = () => {
        const items = matched.map(r => ({ sku: r.masterSku!, value: r.value }));
        onConfirm(items, uploadMode);
    };

    const labelCls = "text-[10px] font-bold text-gray-500 uppercase block mb-1";
    const selectCls = "w-full border border-gray-200 rounded-lg px-3 py-2 text-xs bg-white focus:outline-none focus:border-gray-400";

    // ── STEP: upload ──
    if (step === 'upload') return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-900">Batch Upload Items</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
                </div>

                {/* Mode selector */}
                <div className="mb-5 bg-gray-50 p-4 rounded-lg border border-gray-100">
                    <label className={`${labelCls} flex items-center gap-1`}><Settings2 className="w-3 h-3" /> Column Interpretation</label>
                    <div className="space-y-2 mt-1">
                        {([['FIXED_PRICE', 'Column 2 is Target Price (£)'], ['PERCENT_OFF', 'Column 2 is Percentage Off (%) — e.g. "25" = 25%'], ['FIXED_OFF', 'Column 2 is Amount Off (£)']] as const).map(([val, label]) => (
                            <label key={val} className="flex items-center gap-2 cursor-pointer">
                                <input type="radio" name="mode" checked={uploadMode === val} onChange={() => setUploadMode(val)} className="text-theme focus:ring-theme" />
                                <span className="text-sm text-gray-700" dangerouslySetInnerHTML={{ __html: label.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                            </label>
                        ))}
                    </div>
                </div>

                <div
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center text-center transition-all cursor-pointer ${dragActive ? 'border-gray-400 bg-gray-50' : 'border-gray-300 hover:bg-gray-50'}`}
                    style={dragActive ? { borderColor: 'var(--theme)', background: 'rgba(var(--theme-rgb),0.04)' } : {}}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={e => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                >
                    <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.xlsx,.xls" onChange={e => e.target.files && handleFile(e.target.files[0])} />
                    {isProcessing
                        ? <><Loader2 className="w-8 h-8 animate-spin mb-2" style={{ color: 'var(--theme)' }} /><p className="text-sm font-medium" style={{ color: 'var(--theme)' }}>Processing...</p></>
                        : <><Upload className="w-8 h-8 text-gray-400 mb-2" /><p className="text-sm font-medium text-gray-900">Drop file here or <span className="underline" style={{ color: 'var(--theme)' }}>Browse</span></p><p className="text-xs text-gray-400 mt-1">CSV or Excel — SKU + Price columns</p></>
                    }
                </div>
                {error && <div className="mt-3 p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100 flex gap-2"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{error}</div>}
                <div className="flex justify-end mt-4"><button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-900 px-4 py-2">Cancel</button></div>
            </div>
        </div>
    );

    // ── STEP: map-columns ──
    if (step === 'map-columns') return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6 animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-900">Map Columns</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                        <label className={labelCls}>SKU Column</label>
                        <select value={skuCol} onChange={e => setSkuCol(e.target.value)} className={selectCls}>
                            {columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={labelCls}>Price / Value Column</label>
                        <select value={valueCol} onChange={e => setValueCol(e.target.value)} className={selectCls}>
                            {columns.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>

                {/* Preview */}
                {parsedRows.length > 0 && (
                    <div className="border border-gray-100 rounded-lg overflow-hidden mb-4">
                        <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Preview — {parsedRows.length} rows</span>
                            <div className="flex items-center gap-3 text-[10px]">
                                <span className="text-emerald-600 font-bold">✓ {matched.length} matched</span>
                                {unmatched.length > 0 && <span className="text-amber-600 font-bold">⚠ {unmatched.length} unmatched</span>}
                            </div>
                        </div>
                        <div className="max-h-48 overflow-y-auto">
                            <table className="sello-table text-[11px]">
                                <thead><tr><th>Raw SKU</th><th className="r">Value</th><th>Match</th></tr></thead>
                                <tbody>
                                    {parsedRows.slice(0, 8).map((r, i) => (
                                        <tr key={i} className={!r.masterSku ? 'row-warn' : ''}>
                                            <td><span className="sku text-[10px]">{r.rawSku}</span></td>
                                            <td className="r"><span className="v-num">{r.rawValue}</span></td>
                                            <td>
                                                {r.masterSku
                                                    ? <span className="text-emerald-600 text-[10px] font-bold">✓ {r.masterSku !== r.rawSku ? r.masterSku : ''}</span>
                                                    : <span className="text-amber-500 text-[10px] font-bold">— unmatched</span>
                                                }
                                            </td>
                                        </tr>
                                    ))}
                                    {parsedRows.length > 8 && <tr><td colSpan={3} className="text-center text-gray-400 text-[10px] py-1">+{parsedRows.length - 8} more rows</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}

                {error && <div className="mb-3 p-2 bg-red-50 text-red-600 text-xs rounded border border-red-100 flex gap-2"><AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />{error}</div>}

                <div className="flex gap-2">
                    <button onClick={() => setStep('upload')} className="flex-1 py-2 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">← Back</button>
                    <button
                        onClick={handleConfirmMapping}
                        disabled={matched.length === 0 && unmatched.length === 0}
                        className="flex-1 py-2 text-xs font-bold text-white rounded-lg disabled:opacity-40 hover:opacity-90"
                        style={{ background: 'var(--theme)' }}
                    >
                        {unmatched.length > 0 ? `Fix ${unmatched.length} Unmatched →` : `Confirm ${matched.length} Items →`}
                    </button>
                </div>
            </div>
        </div>
    );

    // ── STEP: map-skus (manual matching for unresolved) ──
    if (step === 'map-skus') return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="font-bold text-gray-900">Map Unmatched SKUs</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">{unmatched.length} SKUs from your file couldn't be auto-matched. Map them manually or skip.</p>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <table className="sello-table">
                        <thead>
                            <tr>
                                <th>File SKU</th>
                                <th className="r">Value</th>
                                <th>Map to Master SKU <span className="font-normal text-gray-400">(leave blank to skip)</span></th>
                                <th className="c">Status</th>
                            </tr>
                        </thead>
                        <tbody>
                            {unmatched.map((r, i) => {
                                const override = skuOverrides[r.rawSku] ?? '';
                                const resolved = override ? productMap.get(override.toUpperCase()) : null;
                                return (
                                    <tr key={i}>
                                        <td><span className="sku">{r.rawSku}</span></td>
                                        <td className="r"><span className="v-num">{r.rawValue}</span></td>
                                        <td>
                                            <SkuAutocomplete
                                                value={override}
                                                products={products}
                                                onChange={val => setSkuOverrides(prev => ({ ...prev, [r.rawSku]: val }))}
                                                placeholder="Type master SKU…"
                                            />
                                        </td>
                                        <td className="c">
                                            {resolved
                                                ? <span className="text-emerald-600 text-[10px] font-bold">✓</span>
                                                : override
                                                    ? <span className="text-red-500 text-[10px] font-bold">✗ Not found</span>
                                                    : <span className="text-gray-300 text-[10px]">—</span>
                                            }
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between gap-3">
                    <div className="text-xs text-gray-400">
                        {matched.length} matched · {unmatched.filter(r => !skuOverrides[r.rawSku]).length} will be skipped
                    </div>
                    <div className="flex gap-2">
                        <button onClick={() => setStep('map-columns')} className="px-4 py-2 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">← Back</button>
                        <button
                            onClick={() => setStep('confirm')}
                            disabled={matched.length === 0}
                            className="px-4 py-2 text-xs font-bold text-white rounded-lg disabled:opacity-40 hover:opacity-90"
                            style={{ background: 'var(--theme)' }}
                        >
                            Continue with {matched.length} Items →
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );

    // ── STEP: confirm ──
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-200">
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-100">
                    <div>
                        <h3 className="font-bold text-gray-900">Confirm Upload</h3>
                        <p className="text-[11px] text-gray-400 mt-0.5">{matched.length} items ready to add · Mode: <strong>{uploadMode === 'FIXED_PRICE' ? 'Fixed Price' : uploadMode === 'PERCENT_OFF' ? '% Off' : 'Amount Off'}</strong></p>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    <table className="sello-table">
                        <thead><tr><th>SKU</th><th>Product</th><th className="r">Value</th></tr></thead>
                        <tbody>
                            {matched.map((r, i) => (
                                <tr key={i}>
                                    <td><span className="sku">{r.masterSku}</span>{r.masterSku !== r.rawSku && <span className="text-[9px] text-gray-400 ml-1">← {r.rawSku}</span>}</td>
                                    <td><span className="pname">{r.productName}</span></td>
                                    <td className="r"><span className="v-num">{uploadMode === 'FIXED_PRICE' ? `£${r.value.toFixed(2)}` : uploadMode === 'PERCENT_OFF' ? `${r.value}%` : `£${r.value.toFixed(2)} off`}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>

                <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
                    <button onClick={() => setStep(unmatched.length > 0 ? 'map-skus' : 'map-columns')} className="flex-1 py-2 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">← Back</button>
                    <button
                        onClick={handleFinalConfirm}
                        className="flex-1 py-2 text-xs font-bold text-white rounded-lg hover:opacity-90"
                        style={{ background: 'var(--theme)' }}
                    >
                        <Check className="w-3.5 h-3.5 inline mr-1" />Add {matched.length} Items
                    </button>
                </div>
            </div>
        </div>
    );
};
