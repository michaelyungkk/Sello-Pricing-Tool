import React, { useState, useMemo, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Calculator, Plus, X, TrendingDown, AlertTriangle, CheckCircle2, RefreshCw, ClipboardPaste } from 'lucide-react';
import { Product, FreightRate } from '../../../types';

interface DealSimulatorToolProps {
    products?: Product[];
    freightRates?: FreightRate[];
    themeColor?: string;
}

interface SimRow {
    id: string;
    sku: string;
    cogs: number;
    freight: number;
    caPrice: number;
    proposedPrice: number;
    overheadPct: number;
    overheadMultiplier: number;
    caBaselinePct: number;
    wildcardCost: number;           // extra cost to add
    wildcardType: 'fixed' | 'pct'; // fixed £ or % of COGS
    proposedMarginPct: number;      // margin % field (0-100 scale)
    lastEdited: 'price' | 'margin'; // which field was last typed — drives the other
}

const makeRow = (overrides?: Partial<SimRow>): SimRow => ({
    id: Math.random().toString(36).slice(2),
    sku: '', cogs: 0, freight: 0, caPrice: 0, proposedPrice: 0,
    overheadPct: 8, overheadMultiplier: 1.2, caBaselinePct: 0.7,
    wildcardCost: 0, wildcardType: 'fixed',
    proposedMarginPct: 0, lastEdited: 'price',
    ...overrides,
});

function calcRow(r: SimRow) {
    const caBaseline       = r.caPrice * r.caBaselinePct;
    const caBaselineMargin = caBaseline > 0 ? (caBaseline - r.cogs) / caBaseline : 0;
    const targetMargin     = caBaselineMargin < 0.4 ? 0.30 : caBaselineMargin < 0.5 ? 0.35 : 0.40;
    const wildcardAbs     = r.wildcardType === 'pct' ? r.cogs * (r.wildcardCost / 100) : r.wildcardCost;
    const baseCost         = (r.cogs + r.freight + wildcardAbs) * r.overheadMultiplier;
    const overheadFrac     = r.overheadPct / 100;
    const targetPrice      = targetMargin < 1 && baseCost > 0 ? baseCost / (1 - targetMargin) : 0;
    const targetPriceMargin = targetPrice > 0
        ? (targetPrice * (1 - overheadFrac) - baseCost) / targetPrice : NaN;
    // Whichever field was last typed drives the other
    const effectiveProposedPrice = r.lastEdited === 'price'
        ? r.proposedPrice
        : (r.proposedMarginPct > 0
            ? baseCost / (1 - r.proposedMarginPct / 100 - overheadFrac)
            : 0);
    const derivedMarginPct = r.lastEdited === 'margin'
        ? r.proposedMarginPct
        : (effectiveProposedPrice > 0
            ? (effectiveProposedPrice * (1 - overheadFrac) - baseCost) / effectiveProposedPrice * 100
            : 0);
    const actualMargin = effectiveProposedPrice > 0
        ? (effectiveProposedPrice * (1 - overheadFrac) - baseCost) / effectiveProposedPrice : NaN;
    const floorPrice       = baseCost > 0 ? baseCost / 0.70 : 0;
    return { caBaseline, caBaselineMargin, targetMargin, baseCost, targetPrice, targetPriceMargin, actualMargin, floorPrice, effectiveProposedPrice, derivedMarginPct };
}

const fp = (n: number) => `${(n * 100).toFixed(1)}%`;

const MarginBadge = ({ v, target }: { v: number; target?: number }) => {
    if (isNaN(v)) return <span className="v-dim">—</span>;
    const good = v >= (target ?? 0.35), warn = !good && v >= 0.25;
    const cls  = good ? 'badge-green' : warn ? 'badge-amber' : 'badge-red';
    const Icon = good ? CheckCircle2 : warn ? AlertTriangle : TrendingDown;
    return <span className={`sello-badge ${cls} flex items-center gap-1`}><Icon className="w-3 h-3" />{fp(v)}</span>;
};

const SkuDropdown = ({ value, products, freightMap, onChange, onSelect }: {
    value: string;
    products: Product[];
    freightMap: Map<string, number>;
    onChange: (v: string) => void;
    onSelect: (p: Product, freight: number) => void;
}) => {
    const [open, setOpen] = React.useState(false);
    const [pos, setPos]   = React.useState({ top: 0, left: 0 });
    const inputRef        = React.useRef<HTMLInputElement>(null);

    const matches = React.useMemo(() => {
        if (!value || value.length < 2) return [];
        const q = value.toLowerCase();
        return products.filter(p =>
            p.sku.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q)
        ).slice(0, 8);
    }, [value, products]);

    const openDropdown = () => {
        if (inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            setPos({ top: rect.bottom + 2, left: rect.left });
        }
        setOpen(true);
    };

    const portal = open && matches.length > 0 ? createPortal(
        <div style={{ position: 'fixed', top: pos.top, left: pos.left, width: 320, zIndex: 9999 }}
            className="bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden">
            {matches.map(p => {
                const freight = freightMap.get(p.sku.toUpperCase()) ?? 0;
                return (
                    <button key={p.sku}
                        onMouseDown={() => { onSelect(p, freight); setOpen(false); }}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                        <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-bold font-mono text-gray-800">{p.sku}</span>
                            {freight > 0 && <span className="text-[10px] text-teal-600 font-mono">freight £{freight.toFixed(2)}</span>}
                        </div>
                        <div className="text-[10px] text-gray-400 truncate mt-0.5">{p.name}</div>
                        {p.costPrice ? (
                            <div className="text-[9px] text-gray-300 mt-0.5 font-mono">
                                COGS £{p.costPrice.toFixed(2)}{p.caPrice ? ` · CA £${p.caPrice.toFixed(2)}` : ''}
                            </div>
                        ) : null}
                    </button>
                );
            })}
        </div>,
        document.body
    ) : null;

    return (
        <>
            <input
                ref={inputRef}
                value={value}
                onChange={e => { onChange(e.target.value); if (open) openDropdown(); }}
                onFocus={openDropdown}
                onBlur={() => setTimeout(() => setOpen(false), 200)}
                placeholder="SKU or name…"
                className="w-full h-9 px-3 text-xs font-mono font-bold text-gray-800 bg-transparent outline-none placeholder-gray-300 hover:bg-blue-50/30 focus:bg-blue-50/40"
            />
            {portal}
        </>
    );
};

export const DealSimulatorTool: React.FC<DealSimulatorToolProps> = ({
    products = [], freightRates = [], themeColor = '#134E4A',
}) => {
    const [rows, setRows]           = useState<SimRow[]>([makeRow()]);
    const [gOverhead, setGOverhead] = useState(8);
    const [gVat, setGVat]           = useState(20);
    const [gBase, setGBase]         = useState(0.7);
    const [gWildcard, setGWildcard]     = useState(0);
    const [gWildcardType, setGWildcardType] = useState<'fixed' | 'pct'>('fixed');
    const pasteRef = useRef<HTMLTextAreaElement>(null);

    const gMult = gVat > 0 ? 1 + gVat / 100 : 1.0;

    const productMap = useMemo(() => {
        const m = new Map<string, Product>();
        products.forEach(p => m.set(p.sku.toUpperCase(), p));
        return m;
    }, [products]);

    const freightMap = useMemo(() => {
        const m = new Map<string, number>();
        freightRates.forEach(r => m.set(r.sku.toUpperCase(), r.rate));
        return m;
    }, [freightRates]);

    const update = useCallback((id: string, patch: Partial<SimRow>) => {
        setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    }, []);

    const addRow = useCallback(() => {
        setRows(prev => [...prev, makeRow({ overheadPct: gOverhead, overheadMultiplier: gMult, caBaselinePct: gBase, wildcardCost: gWildcard, wildcardType: gWildcardType })]);
    }, [gOverhead, gMult, gBase]);

    const removeRow = useCallback((id: string) => {
        setRows(prev => prev.length > 1 ? prev.filter(r => r.id !== id) : prev);
    }, []);

    const applyGlobal = useCallback(() => {
        setRows(prev => prev.map(r => ({ ...r, overheadPct: gOverhead, overheadMultiplier: gMult, caBaselinePct: gBase, wildcardCost: gWildcard, wildcardType: gWildcardType })));
    }, [gOverhead, gMult, gBase]);

    const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text');
        const lines = text.trim().split(/\r?\n/).filter(Boolean);
        if (!lines.length) return;
        const newRows: SimRow[] = lines.map(line => {
            const cols = line.split('\t').map(c => c.trim());
            const sku  = cols[0] || '';
            const p    = productMap.get(sku.toUpperCase());
            const erpFreight = freightMap.get(sku.toUpperCase()) ?? 0;
            const n = (idx: number) => {
                const v = parseFloat((cols[idx] || '').replace(/[£,]/g, ''));
                return isNaN(v) ? 0 : v;
            };
            if (cols.length === 1) {
                return makeRow({ sku, cogs: p?.costPrice || 0, caPrice: p?.caPrice || 0, freight: erpFreight, overheadPct: gOverhead, overheadMultiplier: gMult, caBaselinePct: gBase, wildcardCost: gWildcard, wildcardType: gWildcardType });
            }
            return makeRow({ sku, cogs: cols[1] ? n(1) : (p?.costPrice || 0), freight: cols[2] ? n(2) : erpFreight, caPrice: cols[3] ? n(3) : (p?.caPrice || 0), proposedPrice: n(4), overheadPct: gOverhead, overheadMultiplier: gMult, caBaselinePct: gBase, wildcardCost: gWildcard, wildcardType: gWildcardType });
        });
        setRows(prev => {
            const hasEmpty = prev.length === 1 && !prev[0].sku && !prev[0].cogs;
            return hasEmpty ? newRows : [...prev, ...newRows];
        });
    }, [productMap, freightMap, gOverhead, gMult, gBase]);

    const rows_calc = useMemo(() => rows.map(r => ({ ...r, ...calcRow({ ...r, overheadMultiplier: gMult }) })), [rows, gMult]);

    const summary = useMemo(() => {
        const v = rows_calc.filter(r => r.effectiveProposedPrice > 0 && !isNaN(r.actualMargin));
        return {
            count: v.length,
            avgMargin: v.length ? v.reduce((s, r) => s + r.actualMargin, 0) / v.length : NaN,
            atTarget: v.filter(r => r.actualMargin >= r.targetMargin).length,
            hasData: v.length > 0,
        };
    }, [rows_calc]);

    const belowFloor = rows_calc.filter(r => r.effectiveProposedPrice > 0 && r.floorPrice > 0 && r.effectiveProposedPrice < r.floorPrice).length;

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${themeColor}15` }}>
                        <Calculator className="w-4 h-4" style={{ color: themeColor }} />
                    </div>
                    <div>
                        <div className="font-bold text-gray-900 text-sm">Deal Price Simulator</div>
                        <div className="text-xs text-gray-400">Paste SKU lists from Excel · freight auto-applied from ERP upload</div>
                    </div>
                </div>
                <button onClick={addRow} className="sello-btn cta flex items-center gap-1.5 text-white border-transparent" style={{ background: themeColor }}>
                    <Plus className="w-3.5 h-3.5" /> Add Row
                </button>
            </div>

            {/* Global defaults */}
            <div className="flex items-center flex-wrap gap-4 px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50/60 text-xs">
                <span className="font-bold text-gray-400 uppercase tracking-wide text-[10px]">Defaults</span>
                <label className="flex items-center gap-2">
                    <span className="text-gray-500">CA Baseline</span>
                    <select value={gBase} onChange={e => setGBase(parseFloat(e.target.value))}
                        className="border border-gray-200 rounded-lg px-2 py-1 bg-white font-mono text-xs">
                        {[0.60, 0.65, 0.70, 0.75, 0.80].map(v => (
                            <option key={v} value={v}>{(v * 100).toFixed(0)}% of CA</option>
                        ))}
                    </select>
                </label>
                <label className="flex items-center gap-2">
                    <span className="text-gray-500">Overhead</span>
                    <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden">
                        <input type="number" value={gOverhead} step={0.5} min={0} max={30}
                            onChange={e => setGOverhead(parseFloat(e.target.value) || 0)}
                            className="w-12 px-2 py-1 text-xs font-mono outline-none" />
                        <span className="px-1.5 text-[10px] text-gray-400 border-l border-gray-100 bg-gray-50">%</span>
                    </div>
                </label>
                <label className="flex items-center gap-2">
                    <span className="text-gray-500">VAT</span>
                    <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden">
                        <input type="number" value={gVat} step={1} min={0} max={30}
                            onChange={e => setGVat(parseFloat(e.target.value) || 0)}
                            className="w-12 px-2 py-1 text-xs font-mono outline-none" />
                        <span className="px-1.5 text-[10px] text-gray-400 border-l border-gray-100 bg-gray-50">%</span>
                    </div>
                    <span className="text-[10px] text-gray-400 font-mono">(x{gMult.toFixed(2)})</span>
                </label>
                <label className="flex items-center gap-2">
                    <span className="text-gray-500">Extra Cost</span>
                    <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden">
                        <input type="number" value={gWildcard || ''} step={gWildcardType === 'pct' ? 0.5 : 0.01} min={0}
                            onChange={e => setGWildcard(parseFloat(e.target.value) || 0)}
                            placeholder="0"
                            className="w-14 px-2 py-1 text-xs font-mono outline-none" />
                        <button
                            onClick={() => setGWildcardType(t => t === 'fixed' ? 'pct' : 'fixed')}
                            className="px-1.5 text-[10px] font-bold border-l border-gray-100 bg-gray-50 hover:bg-gray-100 transition-colors min-w-[28px] text-center"
                            style={{ color: gWildcard > 0 ? themeColor : '#9ca3af' }}
                            title="Toggle between fixed £ and % of COGS"
                        >
                            {gWildcardType === 'fixed' ? '£' : '%'}
                        </button>
                    </div>
                    {gWildcard > 0 && (
                        <span className="text-[10px] text-gray-400">
                            {gWildcardType === 'pct' ? `% of COGS` : `per unit`}
                        </span>
                    )}
                </label>
                <button onClick={applyGlobal} className="sello-btn flex items-center gap-1 ml-auto">
                    <RefreshCw className="w-3 h-3" /> Apply to all
                </button>
            </div>

            {/* Paste area */}
            <div className="relative">
                <textarea
                    ref={pasteRef}
                    onPaste={handlePaste}
                    placeholder="Paste SKU list from Excel here (SKU | COGS | Freight | CA Price | Proposed Price) — or paste SKUs only to auto-fill from app data"
                    rows={2}
                    className="w-full text-xs font-mono border border-dashed border-gray-300 rounded-xl px-3 py-2.5 text-gray-600 placeholder-gray-300 resize-none bg-gray-50/50 focus:outline-none focus:border-gray-400 focus:bg-white transition-colors"
                />
                <ClipboardPaste className="w-3.5 h-3.5 text-gray-300 absolute right-3 top-3" />
            </div>

            {/* Table */}
            <div className="sello-table-wrap">
                <style>{`
                    .deal-sim-table td, .deal-sim-table th {
                        border-right: 1px solid rgba(229,231,235,0.7);
                    }
                    .deal-sim-table td:last-child, .deal-sim-table th:last-child {
                        border-right: none;
                    }
                `}</style>
                <div className="sello-table-scroll">
                    <table className="sello-table deal-sim-table" style={{ tableLayout: 'fixed', width: '100%', minWidth: 860 }}>
                        <colgroup>
                            <col style={{ width: 32 }} />   {/* # */}
                            <col style={{ width: '20%', minWidth: 160 }} />  {/* SKU — flexible */}
                            <col style={{ width: 110 }} />  {/* COGS */}
                            <col style={{ width: 110 }} />  {/* Freight */}
                            <col style={{ width: 110 }} />  {/* CA Price */}
                            <col style={{ width: 120 }} />  {/* Target Price */}
                            <col style={{ width: 120 }} />  {/* Target Margin */}
                            <col style={{ width: 130 }} />  {/* Proposed Price */}
                            <col style={{ width: 130 }} />  {/* Proposed Margin */}
                            <col style={{ width: 32 }} />   {/* × */}
                        </colgroup>
                        <thead>
                            <tr>
                                <th className="c">#</th>
                                <th>SKU</th>
                                <th className="r">COGS</th>
                                <th className="r">Freight</th>
                                <th className="r cb">CA Price</th>
                                <th className="r" style={{ color: themeColor }}>Target Price</th>
                                <th className="r cg">Target Margin</th>
                                <th className="r cb">Proposed Price</th>
                                <th className="c cg">Proposed Margin</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            {rows_calc.map((row, idx) => {
                                const hasPrice   = row.effectiveProposedPrice > 0;
                                const belowFloorRow = hasPrice && row.floorPrice > 0 && row.effectiveProposedPrice < row.floorPrice;
                                const rowCls = !hasPrice ? '' :
                                    !isNaN(row.actualMargin) && row.actualMargin >= row.targetMargin ? 'tr-sel' :
                                    !isNaN(row.actualMargin) && row.actualMargin >= 0.25 ? 'tr-warn' : 'tr-neg';

                                return (
                                    <tr key={row.id} className={rowCls}>
                                        <td className="c">
                                            <span className="v-dim text-[10px]">{idx + 1}</span>
                                        </td>
                                        <td className="p-0" style={{ maxWidth: 0, overflow: 'hidden' }}>
                                            <SkuDropdown
                                                value={row.sku}
                                                products={products}
                                                freightMap={freightMap}
                                                onChange={v => update(row.id, { sku: v })}
                                                onSelect={(p, freight) => update(row.id, {
                                                    sku: p.sku,
                                                    cogs: p.costPrice || 0,
                                                    caPrice: p.caPrice || 0,
                                                    freight,
                                                })}
                                            />
                                        </td>
                                        {(['cogs','freight'] as (keyof SimRow)[]).map(field => (
                                            <td key={field} className="p-0" style={{ maxWidth: 0, overflow: 'hidden' }}>
                                                <div className="flex items-center h-9 px-2 bg-white overflow-hidden hover:bg-blue-50/30 focus-within:bg-blue-50/40">
                                                    <span className="text-gray-400 text-[10px] mr-0.5 select-none">£</span>
                                                    <input type="number" value={(row[field] as number) || ''} step={0.01} min={0}
                                                        onChange={e => update(row.id, { [field]: parseFloat(e.target.value) || 0 })}
                                                        className="flex-1 text-xs font-mono text-right text-gray-800 bg-transparent outline-none min-w-0"
                                                        placeholder="0.00" />
                                                </div>
                                            </td>
                                        ))}
                                        <td className="p-0 cb" style={{ maxWidth: 0, overflow: 'hidden' }}>
                                            <div className="flex items-center h-9 px-2 overflow-hidden hover:bg-blue-50/30 focus-within:bg-blue-50/40">
                                                <span className="text-gray-400 text-[10px] mr-0.5 select-none">£</span>
                                                <input type="number" value={row.caPrice || ''} step={0.01} min={0}
                                                    onChange={e => update(row.id, { caPrice: parseFloat(e.target.value) || 0 })}
                                                    className="flex-1 text-xs font-mono text-right text-gray-800 bg-transparent outline-none min-w-0"
                                                    placeholder="0.00" />
                                            </div>
                                        </td>
<td className="r p-0">
                                            <div className="flex items-center justify-end h-9 px-3 bg-gray-50">
                                                <span className="v-num text-xs" style={{ color: row.targetPrice > 0 ? themeColor : '#9ca3af' }}>
                                                    {row.targetPrice > 0 ? `£${row.targetPrice.toFixed(2)}` : '—'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="c p-0 cg">
                                            <div className="flex items-center justify-center h-9 px-2 bg-gray-50">
                                                {row.targetPrice > 0 ? <MarginBadge v={row.targetPriceMargin} /> : <span className="v-dim">—</span>}
                                            </div>
                                        </td>
                                        {/* Proposed Price — type here to derive margin */}
                                        <td className="p-0 cb" style={{ maxWidth: 0, overflow: 'hidden' }}>
                                            <div className={`flex items-center h-9 px-2 overflow-hidden hover:bg-blue-50/30 focus-within:bg-blue-50/40${belowFloorRow ? ' bg-red-50/50' : ''}`}>
                                                <span className="text-gray-400 text-[10px] mr-0.5 select-none">£</span>
                                                <input
                                                    type="number" step={0.01} min={0}
                                                    value={row.lastEdited === 'price'
                                                        ? (row.proposedPrice || '')
                                                        : (row.effectiveProposedPrice > 0 ? parseFloat(row.effectiveProposedPrice.toFixed(2)) : '')}
                                                    onChange={e => {
                                                        const v = parseFloat(e.target.value) || 0;
                                                        update(row.id, {
                                                            proposedPrice: v,
                                                            lastEdited: 'price',
                                                            // keep margin in sync so switching back is smooth
                                                            proposedMarginPct: 0,
                                                        });
                                                    }}
                                                    className="flex-1 text-xs font-mono text-right font-bold text-gray-800 bg-transparent outline-none min-w-0"
                                                    placeholder="0.00" />
                                            </div>
                                        </td>
                                        {/* Proposed Margin — type here to derive price */}
                                        <td className="p-0 cg" style={{ maxWidth: 0, overflow: 'hidden' }}>
                                            <div className="flex items-center h-9 px-2 overflow-hidden hover:bg-blue-50/30 focus-within:bg-blue-50/40">
                                                <input
                                                    type="number" step={0.5} min={0} max={99}
                                                    value={row.lastEdited === 'margin'
                                                        ? (row.proposedMarginPct || '')
                                                        : (row.derivedMarginPct > 0 ? parseFloat(row.derivedMarginPct.toFixed(1)) : '')}
                                                    onChange={e => {
                                                        const v = parseFloat(e.target.value) || 0;
                                                        update(row.id, {
                                                            proposedMarginPct: v,
                                                            lastEdited: 'margin',
                                                            proposedPrice: 0,
                                                        });
                                                    }}
                                                    className="flex-1 text-xs font-mono text-right font-bold text-gray-800 bg-transparent outline-none min-w-0"
                                                    placeholder="0.0" />
                                                <span className="text-gray-400 text-[10px] ml-0.5 select-none">%</span>
                                            </div>
                                        </td>
                                        <td className="c p-0">
                                            <button onClick={() => removeRow(row.id)}
                                                className="w-full h-9 flex items-center justify-center text-gray-200 hover:text-red-400 transition-colors">
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                                <tr className="border-t-2 border-gray-200" style={{ background: `${themeColor}06` }}>
                                    <td className="c p-0" colSpan={3}>
                                        <div className="flex items-center h-9 px-3">
                                            <span className="text-[10px] font-bold uppercase tracking-wide" style={{ color: themeColor }}>
                                                {summary.hasData ? `${summary.count} SKUs` : `${rows.length} SKU${rows.length !== 1 ? 's' : ''}`}
                                            </span>
                                        </div>
                                    </td>
                                    <td colSpan={5} className="p-0">
                                        <div className="flex items-center h-9 px-3 text-[10px] text-gray-500">
                                            {summary.hasData
                                                ? <span>At/above target: <strong className="text-gray-700">{summary.atTarget}/{summary.count}</strong></span>
                                                : <span className="text-gray-300 italic">Enter proposed prices to see summary</span>
                                            }
                                        </div>
                                    </td>
                                    <td className="c p-0">
                                        <div className="flex items-center justify-center h-9 px-2">
                                            {summary.hasData ? <MarginBadge v={summary.avgMargin} /> : <span className="v-dim">—</span>}
                                        </div>
                                    </td>
                                    <td className="p-0" />
                                </tr>
                            </tfoot>
                    </table>
                </div>
            </div>

            {/* Add row */}
            <button onClick={addRow}
                className="w-full py-2.5 rounded-xl border-2 border-dashed border-gray-200 text-xs font-bold text-gray-400 hover:border-gray-300 hover:text-gray-500 flex items-center justify-center gap-2 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add another row
            </button>

            {/* Formula hint */}
            <div className="flex items-center flex-wrap gap-x-4 gap-y-1 px-4 py-2 rounded-xl text-[10px] text-gray-400 border border-gray-100 bg-gray-50/40">
                <span className="font-bold text-gray-500">Formula</span>
                <span>Base = (COGS + Freight{gWildcard > 0 ? (gWildcardType === 'fixed' ? ` + £${gWildcard.toFixed(2)} extra` : ` + ${gWildcard}% of COGS`) : ''}) x {gMult.toFixed(2)}{gVat === 0 ? ' (ex-VAT)' : ` (${gVat}% VAT)`}</span>
                <span>Margin = (Price x {((1 - gOverhead / 100) * 100).toFixed(0)}% - Base) / Price</span>
                <span>Target: &lt;40% baseline = 30% / &lt;50% = 35% / &gt;=50% = 40%</span>
                {belowFloor > 0 && (
                    <span className="ml-auto text-red-500 font-bold">{belowFloor} SKU{belowFloor > 1 ? 's' : ''} below floor</span>
                )}
            </div>
        </div>
    );
};
