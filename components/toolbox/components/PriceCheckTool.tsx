import React, { useState, useRef, useMemo } from 'react';
import { Upload, Check, AlertTriangle, Download, Settings, X, ChevronDown, ChevronUp, Search } from 'lucide-react';
import * as XLSX from 'xlsx';
import { PriceCheckToolProps, PriceCheckTemplate } from '../types';
import { localDateStamp } from '../../../utils/format';

// ─────────────────────────────────────────────────────────────
//  TYPES
// ─────────────────────────────────────────────────────────────

interface PriceError {
    platformSku: string;
    masterSku: string;
    uploadedPrice: number;
    caPrice: number;
    difference: number;
    pctDiff: number;
    productName: string;
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────

const fmtGBP = (n: number) => `£${Math.abs(n).toFixed(2)}`;
const fmtPct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;

const detectHeaderRow = (rows: any[][]): { index: number; headers: string[] } => {
    const keywords = ['sku', 'price', 'reference', 'code', 'id', 'product', 'listing', 'offer'];
    let bestIdx = 0; let maxScore = -1;
    for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i] || [];
        let score = 0;
        row.forEach(cell => {
            if (cell !== undefined && cell !== null && cell !== '') {
                const v = String(cell).toLowerCase();
                if (keywords.some(k => v.includes(k))) score += 2;
                else score += 0.5;
            }
        });
        if (score > maxScore) { maxScore = score; bestIdx = i; }
    }
    const headers = (rows[bestIdx] || []).map((c: any) => String(c || '').trim());
    return { index: bestIdx, headers };
};

const findHeader = (headers: string[], keywords: string[]) =>
    headers.find(h => keywords.some(k => h.toLowerCase().includes(k))) || '';

const readExcel = (file: File): Promise<any[][]> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => {
            try {
                const wb = XLSX.read(e.target?.result, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]];
                resolve(XLSX.utils.sheet_to_json(ws, { header: 1 }) as any[][]);
            } catch (err) { reject(err); }
        };
        reader.readAsArrayBuffer(file);
    });

// ─────────────────────────────────────────────────────────────
//  COMPONENT
// ─────────────────────────────────────────────────────────────

export const PriceCheckTool: React.FC<PriceCheckToolProps> = ({
    products,
    learnedAliases,
    pricingRules,
    priceCheckTemplates,
    onSaveTemplates,
}) => {
    const [targetPlatform, setTargetPlatform] = useState('');
    const [fileRows, setFileRows] = useState<any[][] | null>(null);
    const [headers, setHeaders] = useState<string[]>([]);
    const [skuCol, setSkuCol] = useState('');
    const [priceCol, setPriceCol] = useState('');
    const [isMappingTemplate, setIsMappingTemplate] = useState(false);
    const [errors, setErrors] = useState<PriceError[] | null>(null);
    const [allChecked, setAllChecked] = useState<{ total: number; matched: number } | null>(null);
    const [fileError, setFileError] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [sortKey, setSortKey] = useState<'pctDiff' | 'difference' | 'uploadedPrice'>('pctDiff');
    const fileRef = useRef<HTMLInputElement>(null);

    const platformOptions = useMemo(() => Object.keys(pricingRules).sort(), [pricingRules]);

    // Build global alias map: alias → masterSku (same as InventorySyncTool)
    const aliasMap = useMemo(() => {
        const map = new Map<string, string>();
        products.forEach(p => {
            const master = p.sku.toUpperCase();
            map.set(master, master);
            p.channels?.forEach(c => {
                c.skuAlias?.split(',').forEach(a => {
                    const alias = a.trim().toUpperCase();
                    if (alias) map.set(alias, master);
                });
            });
        });
        Object.entries(learnedAliases).forEach(([alias, master]) => {
            map.set(alias.toUpperCase(), master.toUpperCase());
        });
        return map;
    }, [products, learnedAliases]);

    // Product lookup: masterSku → { caPrice, name }
    const productMap = useMemo(() => {
        const map = new Map<string, { caPrice: number; name: string }>();
        products.forEach(p => {
            if (p.caPrice) map.set(p.sku.toUpperCase(), { caPrice: p.caPrice, name: p.name });
        });
        return map;
    }, [products]);

    // Template for the selected platform
    const currentTemplate = useMemo(() =>
        priceCheckTemplates?.find(t => t.platform === targetPlatform) ?? null,
        [priceCheckTemplates, targetPlatform]
    );

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setFileError(null); setErrors(null); setAllChecked(null);
        try {
            const rows = await readExcel(file);
            if (rows.length < 2) throw new Error('File is empty');
            const { index, headers: hdrs } = detectHeaderRow(rows);
            const dataRows = rows.slice(index + 1).filter(r => r.some(c => c !== undefined && c !== ''));
            setFileRows(dataRows);
            setHeaders(hdrs);

            // Auto-fill from saved template or heuristic
            if (currentTemplate) {
                setSkuCol(currentTemplate.skuColumn);
                setPriceCol(currentTemplate.priceColumn);
                runCheck(dataRows, hdrs, currentTemplate.skuColumn, currentTemplate.priceColumn);
            } else {
                const skuGuess = findHeader(hdrs, ['sku', 'reference', 'code', 'offer', 'id']);
                const priceGuess = findHeader(hdrs, ['price', 'sale price', 'listing price', 'cost']);
                setSkuCol(skuGuess);
                setPriceCol(priceGuess);
                setIsMappingTemplate(true);
            }
        } catch (err: any) {
            setFileError('File error: ' + err.message);
        }
        e.target.value = '';
    };

    const runCheck = (
        rows: any[][],
        hdrs: string[],
        skuColumn: string,
        priceColumn: string
    ) => {
        const skuIdx = hdrs.indexOf(skuColumn);
        const priceIdx = hdrs.indexOf(priceColumn);
        if (skuIdx < 0 || priceIdx < 0) {
            setFileError('Could not find mapped columns in file');
            return;
        }

        const errs: PriceError[] = [];
        let matched = 0;

        rows.forEach(row => {
            const rawSku = String(row[skuIdx] || '').trim();
            if (!rawSku) return;
            const uploadedPrice = parseFloat(String(row[priceIdx] || '')) || 0;
            const masterSku = aliasMap.get(rawSku.toUpperCase()) ?? rawSku.toUpperCase();
            const product = productMap.get(masterSku);
            if (!product) return; // not in our catalogue, skip
            matched++;
            const caPrice = product.caPrice;
            const difference = uploadedPrice - caPrice;
            const pctDiff = caPrice > 0 ? (difference / caPrice) * 100 : 0;
            if (Math.abs(difference) > 0.01) {
                errs.push({
                    platformSku: rawSku,
                    masterSku,
                    uploadedPrice,
                    caPrice,
                    difference,
                    pctDiff,
                    productName: product.name,
                });
            }
        });

        setErrors(errs);
        setAllChecked({ total: rows.filter(r => r[skuIdx]).length, matched });
        setIsMappingTemplate(false);
    };

    const saveTemplate = () => {
        if (!skuCol || !priceCol || !targetPlatform) return;
        const newTemplate: PriceCheckTemplate = {
            id: currentTemplate?.id ?? `pct-${Date.now()}`,
            platform: targetPlatform,
            skuColumn: skuCol,
            priceColumn: priceCol,
        };
        const updated = [
            ...(priceCheckTemplates || []).filter(t => t.platform !== targetPlatform),
            newTemplate,
        ];
        onSaveTemplates(updated);
        if (fileRows) runCheck(fileRows, headers, skuCol, priceCol);
    };

    const handleSort = (key: typeof sortKey) => {
        if (sortKey === key) setSortDir(d => d === 'desc' ? 'asc' : 'desc');
        else { setSortKey(key); setSortDir('desc'); }
    };

    const filteredErrors = useMemo(() => {
        if (!errors) return [];
        const q = search.toLowerCase();
        return [...errors]
            .filter(e => !q || e.platformSku.toLowerCase().includes(q) || e.masterSku.toLowerCase().includes(q) || e.productName.toLowerCase().includes(q))
            .sort((a, b) => {
                const mul = sortDir === 'desc' ? -1 : 1;
                return (Math.abs(a[sortKey]) - Math.abs(b[sortKey])) * mul;
            });
    }, [errors, search, sortKey, sortDir]);

    const exportErrors = () => {
        if (!filteredErrors.length) return;
        const rows = [
            ['Platform SKU', 'Master SKU', 'Product Name', 'Uploaded Price', 'CA Price', 'Difference', '% Diff'],
            ...filteredErrors.map(e => [
                e.platformSku, e.masterSku, e.productName,
                e.uploadedPrice, e.caPrice,
                e.difference.toFixed(2), e.pctDiff.toFixed(1) + '%'
            ])
        ];
        const ws = XLSX.utils.aoa_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Price Errors');
        XLSX.writeFile(wb, `price_check_${targetPlatform}_${localDateStamp()}.xlsx`);
    };

    const SortIcon = ({ k }: { k: typeof sortKey }) =>
        sortKey === k
            ? sortDir === 'desc' ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />
            : <ChevronDown className="w-3 h-3 opacity-20" />;

    return (
        <div className="space-y-6">
            {/* ── STEP 1: Platform + Upload ── */}
            <div className="bg-custom-glass rounded-xl border border-custom-glass p-6 space-y-4 backdrop-blur-custom shadow-sm">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <Settings className="w-4 h-4 text-theme" />
                    Platform Price Check
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {/* Platform selector */}
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Target Platform</label>
                        <select
                            value={targetPlatform}
                            onChange={e => { setTargetPlatform(e.target.value); setErrors(null); setFileRows(null); setIsMappingTemplate(false); }}
                            className="w-full border border-gray-200 rounded-lg p-2 text-sm bg-white focus:ring-2 focus:ring-theme"
                        >
                            <option value="" disabled>Select platform…</option>
                            {platformOptions.map(p => (
                                <option key={p} value={p}>
                                    {p}{priceCheckTemplates?.find(t => t.platform === p) ? ' ✓' : ''}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Upload */}
                    <div className="md:col-span-2 flex items-end gap-3">
                        <button
                            onClick={() => fileRef.current?.click()}
                            disabled={!targetPlatform}
                            className="flex items-center gap-2 px-4 py-2 bg-theme text-white rounded-lg text-sm font-bold disabled:opacity-40 hover:opacity-90"
                        >
                            <Upload className="w-4 h-4" />
                            Upload Platform Price File
                        </button>
                        <input ref={fileRef} type="file" hidden accept=".csv,.xlsx" onChange={handleFileUpload} />
                        {currentTemplate && (
                            <div className="flex items-center gap-3">
                                <span className="text-xs text-green-600 flex items-center gap-1">
                                    <Check className="w-3.5 h-3.5" />
                                    Template saved — SKU: <strong>{currentTemplate.skuColumn}</strong>, Price: <strong>{currentTemplate.priceColumn}</strong>
                                </span>
                                <button
                                    onClick={() => {
                                        setSkuCol(currentTemplate.skuColumn);
                                        setPriceCol(currentTemplate.priceColumn);
                                        setIsMappingTemplate(true);
                                    }}
                                    className="text-xs text-gray-400 hover:text-theme underline"
                                >
                                    Edit
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {fileError && (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 shrink-0" /> {fileError}
                    </div>
                )}
            </div>

            {/* ── STEP 2: Column mapping ── */}
            {isMappingTemplate && (headers.length > 0 || currentTemplate) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 space-y-4">
                    <div className="flex items-center justify-between">
                        <h4 className="font-bold text-amber-800 flex items-center gap-2">
                            <Settings className="w-4 h-4" /> Map Columns
                        </h4>
                        <button onClick={() => setIsMappingTemplate(false)}>
                            <X className="w-4 h-4 text-gray-400 hover:text-gray-600" />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">SKU Column</label>
                            {headers.length > 0 ? (
                                <select value={skuCol} onChange={e => setSkuCol(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white">
                                    <option value="" disabled>Select column…</option>
                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                            ) : (
                                <input value={skuCol} onChange={e => setSkuCol(e.target.value)}
                                    placeholder="e.g. SKU"
                                    className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
                            )}
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Price Column</label>
                            {headers.length > 0 ? (
                                <select value={priceCol} onChange={e => setPriceCol(e.target.value)}
                                    className="w-full border border-gray-300 rounded-lg p-2 text-sm bg-white">
                                    <option value="" disabled>Select column…</option>
                                    {headers.map(h => <option key={h} value={h}>{h}</option>)}
                                </select>
                            ) : (
                                <input value={priceCol} onChange={e => setPriceCol(e.target.value)}
                                    placeholder="e.g. Price"
                                    className="w-full border border-gray-300 rounded-lg p-2 text-sm" />
                            )}
                        </div>
                    </div>

                    <div className="flex gap-3">
                        <button
                            onClick={saveTemplate}
                            disabled={!skuCol || !priceCol}
                            className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-bold hover:bg-amber-700 disabled:opacity-40"
                        >
                            Save Template & Run Check
                        </button>
                        <button
                            onClick={() => { if (fileRows) runCheck(fileRows, headers, skuCol, priceCol); }}
                            disabled={!skuCol || !priceCol}
                            className="px-4 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg text-sm font-bold hover:bg-gray-50 disabled:opacity-40"
                        >
                            Run Without Saving
                        </button>
                    </div>
                    <p className="text-[10px] text-amber-600">
                        Saving the template means next time you upload for <strong>{targetPlatform}</strong>, columns will be auto-detected.
                    </p>
                </div>
            )}

            {/* ── RESULTS ── */}
            {allChecked && errors && (
                <div className="space-y-4">
                    {/* Summary bar */}
                    <div className="bg-custom-glass rounded-xl border border-custom-glass p-4 flex items-center gap-6 flex-wrap backdrop-blur-custom shadow-sm">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-theme/10 flex items-center justify-center">
                                <Check className="w-4 h-4 text-theme" />
                            </div>
                            <div>
                                <div className="text-lg font-bold text-gray-900">{allChecked.matched}</div>
                                <div className="text-[10px] text-gray-400 uppercase">SKUs Matched</div>
                            </div>
                        </div>
                        <div className="w-px h-8 bg-gray-200" />
                        <div className="flex items-center gap-2">
                            <div className={`w-8 h-8 rounded-full flex items-center justify-center ${errors.length > 0 ? 'bg-red-100' : 'bg-green-100'}`}>
                                {errors.length > 0
                                    ? <AlertTriangle className="w-4 h-4 text-red-600" />
                                    : <Check className="w-4 h-4 text-green-600" />
                                }
                            </div>
                            <div>
                                <div className={`text-lg font-bold ${errors.length > 0 ? 'text-red-600' : 'text-green-600'}`}>{errors.length}</div>
                                <div className="text-[10px] text-gray-400 uppercase">Price Mismatches</div>
                            </div>
                        </div>
                        <div className="w-px h-8 bg-gray-200" />
                        <div>
                            <div className="text-lg font-bold text-gray-900">{allChecked.total - allChecked.matched}</div>
                            <div className="text-[10px] text-gray-400 uppercase">Unrecognised SKUs</div>
                        </div>
                        {errors.length === 0 && (
                            <div className="ml-auto flex items-center gap-2 text-green-600 font-bold text-sm">
                                <Check className="w-5 h-5" /> All prices match CA — no errors found
                            </div>
                        )}
                        {errors.length > 0 && (
                            <button
                                onClick={exportErrors}
                                className="ml-auto flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50"
                            >
                                <Download className="w-3.5 h-3.5" /> Export Errors
                            </button>
                        )}
                    </div>

                    {/* Error table */}
                    {errors.length > 0 && (
                        <div className="sello-table-wrap">
                            <div className="flex items-center gap-3 px-4 py-2.5 border-b border-custom-glass">
                                <div className="relative">
                                    <Search className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                    <input
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        placeholder="Search SKU or product…"
                                        className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-theme/40 w-52"
                                    />
                                </div>
                                <span className="text-xs text-gray-400">{filteredErrors.length} mismatches</span>
                            </div>
                            <div className="sello-table-scroll" style={{ maxHeight: 480 }}>
                                <table className="sello-table">
                                    <thead>
                                        <tr>
                                            <th className="pin">SKU / Product</th>
                                            <th className="r" onClick={() => handleSort('uploadedPrice')} style={{ cursor: 'pointer' }}>
                                                <div className="flex items-center justify-end gap-1">Uploaded Price <SortIcon k="uploadedPrice" /></div>
                                            </th>
                                            <th className="r cb">CA Price</th>
                                            <th className="r cr" onClick={() => handleSort('difference')} style={{ cursor: 'pointer' }}>
                                                <div className="flex items-center justify-end gap-1">Difference <SortIcon k="difference" /></div>
                                            </th>
                                            <th className="r cr" onClick={() => handleSort('pctDiff')} style={{ cursor: 'pointer' }}>
                                                <div className="flex items-center justify-end gap-1">% Diff <SortIcon k="pctDiff" /></div>
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {filteredErrors.map((e, i) => (
                                            <tr key={i} className={Math.abs(e.pctDiff) > 10 ? 'row-neg' : 'row-warn'}>
                                                <td className="pin">
                                                    <div className="prod-normal">
                                                        <div className="row1">
                                                            <span className="sku">{e.platformSku}</span>
                                                            {e.masterSku !== e.platformSku && (
                                                                <span className="text-[9px] text-gray-400">→ {e.masterSku}</span>
                                                            )}
                                                        </div>
                                                        <span className="pname">{e.productName}</span>
                                                    </div>
                                                </td>
                                                <td className="r">
                                                    <span className="v-num">{fmtGBP(e.uploadedPrice)}</span>
                                                </td>
                                                <td className="r cb">
                                                    <span className="v-num">{fmtGBP(e.caPrice)}</span>
                                                </td>
                                                <td className="r cr">
                                                    <span className={e.difference > 0 ? 'v-num text-emerald-600' : 'v-neg'}>
                                                        {e.difference > 0 ? '+' : ''}{fmtGBP(e.difference)}
                                                    </span>
                                                </td>
                                                <td className="r cr">
                                                    <span className={`sello-badge text-[10px] ${Math.abs(e.pctDiff) > 10 ? 'badge-red' : 'badge-amber'}`}>
                                                        {fmtPct(e.pctDiff)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            <div className="sello-table-footer">
                                <span>{filteredErrors.length} mismatches · {targetPlatform}</span>
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
