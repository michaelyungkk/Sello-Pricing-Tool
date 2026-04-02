import React, { useState, useMemo, useCallback } from 'react';
import {
    Calculator, Plus, X, ChevronDown, ChevronUp,
    TrendingDown, AlertTriangle, CheckCircle2, RefreshCw, Zap
} from 'lucide-react';
import { Product, FreightRate } from '../../../types';
import { calculateFreight, canCalculateFreight } from '../../../services/freightCalculator';

interface DealSimulatorToolProps {
    products?: Product[];
    freightRates?: FreightRate[];
    themeColor?: string;
}

interface SimRow {
    id: string;
    sku: string;
    productName: string;
    cogs: number;
    freight: number;        // manual override
    dimL: number; dimW: number; dimH: number;
    freightAuto: boolean;   // true = use dim-calculated freight
    caPrice: number;
    proposedPrice: number;
    postage: number;
    overheadPct: number;
    overheadMultiplier: number;
    caBaselinePct: number;
}

const makeRow = (overrides?: Partial<SimRow>): SimRow => ({
    id: Math.random().toString(36).slice(2),
    sku: '', productName: '', cogs: 0,
    freight: 0, dimL: 0, dimW: 0, dimH: 0, freightAuto: true,
    caPrice: 0, proposedPrice: 0, postage: 0,
    overheadPct: 8, overheadMultiplier: 1.2, caBaselinePct: 0.7,
    ...overrides,
});

function calcRow(r: SimRow) {
    // Freight: auto from dims if enabled and dims available
    const hasDims = canCalculateFreight({ length: r.dimL, width: r.dimW, height: r.dimH, weight: r.cogs > 0 ? 1 : 0 });
    // Weight for freight calc: use product weight — stored in freight field when not auto
    // We need actual product weight, approximated from cogs if not available
    // For auto freight, we need the product's physical weight — stored separately
    const physWeight = (r as any).physWeight || 0;
    const autoFreight = r.freightAuto && r.dimL > 0 && r.dimW > 0 && r.dimH > 0 && physWeight > 0
        ? calculateFreight({ length: r.dimL, width: r.dimW, height: r.dimH, weight: physWeight })
        : null;
    const effFreight  = autoFreight !== null ? autoFreight : r.freight;

    const caBaseline       = r.caPrice * r.caBaselinePct;
    const caBaselineMargin = caBaseline > 0 ? (caBaseline - r.cogs) / caBaseline : 0;
    const targetMargin     = caBaselineMargin < 0.4 ? 0.30 : caBaselineMargin < 0.5 ? 0.35 : 0.40;
    const baseCost         = (r.cogs + effFreight) * r.overheadMultiplier;
    const overheadFrac     = r.overheadPct / 100;
    const targetPrice      = targetMargin < 1 && baseCost > 0 ? baseCost / (1 - targetMargin) : 0;
    const actualMargin     = r.proposedPrice > 0
        ? (r.proposedPrice * (1 - overheadFrac) - baseCost) / r.proposedPrice : NaN;
    const floorPrice       = baseCost > 0 ? baseCost / 0.70 : 0;
    const netRevenue       = r.proposedPrice - r.postage;
    return { caBaseline, caBaselineMargin, targetMargin, baseCost, targetPrice,
             actualMargin, floorPrice, netRevenue, effFreight, autoFreight };
}

const f2 = (n: number) => `£${n.toFixed(2)}`;
const fp = (n: number) => `${(n * 100).toFixed(1)}%`;

const MarginBadge = ({ v, target }: { v: number; target?: number }) => {
    if (isNaN(v)) return null;
    const good = v >= (target ?? 0.35), warn = !good && v >= 0.25;
    const cls  = good ? 'badge-green' : warn ? 'badge-amber' : 'badge-red';
    const Icon = good ? CheckCircle2 : warn ? AlertTriangle : TrendingDown;
    return <span className={`sello-badge ${cls} flex items-center gap-1 text-[10px]`}><Icon className="w-3 h-3" />{fp(v)}</span>;
};

const NumInput = ({ value, onChange, placeholder = '0.00', highlight }: {
    value: number; onChange: (v: number) => void; placeholder?: string; highlight?: boolean;
}) => (
    <div className={`flex items-center border rounded-lg bg-white overflow-hidden focus-within:border-gray-400 ${highlight ? 'border-teal-300 bg-teal-50/30' : 'border-gray-200'}`}>
        <span className="px-1.5 text-[10px] text-gray-400 border-r border-gray-100 bg-gray-50">£</span>
        <input type="number" value={value || ''} step={0.01} min={0} placeholder={placeholder}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            className="w-full px-2 py-1.5 text-xs font-mono text-gray-700 bg-transparent outline-none" />
    </div>
);

const DimInput = ({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) => (
    <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden focus-within:border-gray-400">
        <span className="px-1 text-[9px] text-gray-400 border-r border-gray-100 bg-gray-50 w-5 text-center">{label}</span>
        <input type="number" value={value || ''} step={1} min={0}
            onChange={e => onChange(parseFloat(e.target.value) || 0)}
            className="w-full px-1.5 py-1.5 text-xs font-mono text-gray-700 bg-transparent outline-none" />
    </div>
);

const SkuDropdown = ({ value, products, onChange, onSelect }: {
    value: string; products: Product[];
    onChange: (v: string) => void; onSelect: (p: Product) => void;
}) => {
    const [open, setOpen] = useState(false);
    const matches = useMemo(() => {
        if (!value || value.length < 2) return [];
        const q = value.toLowerCase();
        return products.filter(p =>
            p.sku.toLowerCase().includes(q) || (p.name || '').toLowerCase().includes(q)
        ).slice(0, 6);
    }, [value, products]);
    return (
        <div className="relative">
            <input value={value} onChange={e => { onChange(e.target.value); setOpen(true); }}
                onFocus={() => setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 200)}
                placeholder="SKU…"
                className="w-full px-2 py-1.5 text-xs font-mono border border-gray-200 rounded-lg bg-white outline-none focus:border-gray-400" />
            {open && matches.length > 0 && (
                <div className="absolute left-0 top-full mt-1 z-50 w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden">
                    {matches.map(p => (
                        <button key={p.sku} onMouseDown={() => { onSelect(p); setOpen(false); }}
                            className="w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-50 last:border-0">
                            <div className="text-xs font-bold font-mono text-gray-800">{p.sku}</div>
                            <div className="text-[10px] text-gray-400 truncate">{p.name}</div>
                            <div className="text-[9px] text-gray-300 mt-0.5">
                                {(p as any).length && (p as any).weight
                                    ? `${(p as any).length}×${(p as any).width}×${(p as any).height}cm · ${(p as any).weight}kg → £${calculateFreight({length:(p as any).length,width:(p as any).width,height:(p as any).height,weight:(p as any).weight}).toFixed(2)} freight`
                                    : 'No dimensions'}
                            </div>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
};

export const DealSimulatorTool: React.FC<DealSimulatorToolProps> = ({
    products = [], freightRates = [], themeColor = '#134E4A',
}) => {
    const [rows, setRows]    = useState<SimRow[]>([makeRow()]);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [gOverhead, setGOverhead]     = useState(8);
    const [gMultiplier, setGMultiplier] = useState(1.2);
    const [gBaseline, setGBaseline]     = useState(0.7);

    // Uploaded ERP rates take priority over formula
    const freightRatesMap = useMemo(() => {
        const m = new Map<string, number>();
        freightRates.forEach(r => m.set(r.sku.toUpperCase(), r.rate));
        return m;
    }, [freightRates]);

    const update = useCallback((id: string, patch: Partial<SimRow & { physWeight?: number }>) => {
        setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r));
    }, []);

    const addRow = useCallback(() => {
        setRows(prev => [...prev, makeRow({ overheadPct: gOverhead, overheadMultiplier: gMultiplier, caBaselinePct: gBaseline })]);
    }, [gOverhead, gMultiplier, gBaseline]);

    const applyGlobal = useCallback(() => {
        setRows(prev => prev.map(r => ({ ...r, overheadPct: gOverhead, overheadMultiplier: gMultiplier, caBaselinePct: gBaseline })));
    }, [gOverhead, gMultiplier, gBaseline]);

    const rows_calc = useMemo(() => rows.map(r => ({ ...r, ...calcRow(r) })), [rows]);

    const summary = useMemo(() => {
        const v = rows_calc.filter(r => r.proposedPrice > 0);
        if (!v.length) return null;
        const validMargins = v.filter(r => !isNaN(r.actualMargin));
        return {
            count: v.length,
            avgMargin: validMargins.length ? validMargins.reduce((s, r) => s + r.actualMargin, 0) / validMargins.length : NaN,
            totalNet: v.reduce((s, r) => s + r.netRevenue, 0),
            atTarget: v.filter(r => !isNaN(r.actualMargin) && r.actualMargin >= r.targetMargin).length,
        };
    }, [rows_calc]);

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${themeColor}15` }}>
                        <Calculator className="w-4 h-4" style={{ color: themeColor }} />
                    </div>
                    <div>
                        <div className="font-bold text-gray-900 text-sm">Deal Price Simulator</div>
                        <div className="text-xs text-gray-400">Cost-based margin · freight auto-calculated from dimensions</div>
                    </div>
                </div>
                <button onClick={addRow} className="sello-btn flex items-center gap-1.5 text-white border-transparent"
                    style={{ background: themeColor }}>
                    <Plus className="w-3.5 h-3.5" /> Add SKU
                </button>
            </div>

            {/* Formula bar */}
            <div className="flex items-center gap-4 px-4 py-2.5 rounded-xl text-[10px] text-gray-500"
                style={{ background: `${themeColor}08`, border: `1px solid ${themeColor}20` }}>
                <span className="font-bold" style={{ color: themeColor }}>Formula</span>
                <span>Base cost = (COGS + Freight) × {gMultiplier.toFixed(2)}</span>
                <span className="text-gray-300">·</span>
                <span>Margin = (Price × {((1-gOverhead/100)*100).toFixed(0)}% − Base) ÷ Price</span>
                <span className="text-gray-300">·</span>
                <span>Freight = max(weight, L×W×H÷10,000) → rate card</span>
            </div>

            {/* Global settings */}
            <div className="flex items-center flex-wrap gap-4 px-4 py-3 rounded-xl border border-gray-200 bg-gray-50/60">
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">Global Defaults</span>
                <label className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">CA Baseline</span>
                    <select value={gBaseline} onChange={e => setGBaseline(parseFloat(e.target.value))}
                        className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white font-mono">
                        {[0.60,0.65,0.70,0.75,0.80].map(v => (
                            <option key={v} value={v}>{(v*100).toFixed(0)}% of CA</option>
                        ))}
                    </select>
                </label>
                <label className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">Overhead</span>
                    <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden">
                        <input type="number" value={gOverhead} step={0.5} min={0} max={30}
                            onChange={e => setGOverhead(parseFloat(e.target.value) || 0)}
                            className="w-12 px-2 py-1 text-xs font-mono outline-none" />
                        <span className="px-1.5 text-[10px] text-gray-400 border-l border-gray-100 bg-gray-50">%</span>
                    </div>
                </label>
                <label className="flex items-center gap-2">
                    <span className="text-[10px] text-gray-500">Cost ×</span>
                    <input type="number" value={gMultiplier} step={0.05} min={1} max={2}
                        onChange={e => setGMultiplier(parseFloat(e.target.value) || 1)}
                        className="w-16 px-2 py-1 text-xs font-mono border border-gray-200 rounded-lg bg-white outline-none" />
                </label>
                <button onClick={applyGlobal} className="sello-btn flex items-center gap-1 ml-auto">
                    <RefreshCw className="w-3 h-3" /> Apply to all rows
                </button>
            </div>

            {/* Summary */}
            {summary && (
                <div className="flex items-center gap-6 px-4 py-2.5 rounded-xl border border-gray-200 bg-white text-[10px]">
                    <span className="font-bold text-gray-400">{summary.count} SKUs</span>
                    <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">Avg margin</span>
                        {!isNaN(summary.avgMargin) && <MarginBadge v={summary.avgMargin} />}
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">Total net rev</span>
                        <span className="font-mono font-bold text-gray-800">{f2(summary.totalNet)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-gray-400">At or above target</span>
                        <span className={`sello-badge ${summary.atTarget === summary.count ? 'badge-green' : 'badge-amber'} text-[10px]`}>
                            {summary.atTarget}/{summary.count}
                        </span>
                    </div>
                </div>
            )}

            {/* Rows */}
            <div className="space-y-3">
                {rows_calc.map((row, idx) => {
                    const hasPrice  = row.proposedPrice > 0;
                    const belowFloor = hasPrice && row.floorPrice > 0 && row.proposedPrice < row.floorPrice;
                    const borderCls  = !hasPrice ? 'border-gray-200' :
                        !isNaN(row.actualMargin) && row.actualMargin >= row.targetMargin ? 'border-emerald-200' :
                        !isNaN(row.actualMargin) && row.actualMargin >= 0.25 ? 'border-amber-200' : 'border-red-200';
                    const bgCls = !hasPrice ? 'bg-gray-50/40' :
                        !isNaN(row.actualMargin) && row.actualMargin >= row.targetMargin ? 'bg-emerald-50/40' :
                        !isNaN(row.actualMargin) && row.actualMargin >= 0.25 ? 'bg-amber-50/30' : 'bg-red-50/20';
                    const physWeight = (row as any).physWeight || 0;

                    return (
                        <div key={row.id} className={`rounded-xl border overflow-hidden ${borderCls}`}>
                            {/* Header bar */}
                            <div className={`flex items-center gap-3 px-4 py-2.5 ${bgCls}`}>
                                <span className="text-[10px] font-bold text-gray-400 w-5 flex-shrink-0">{idx + 1}</span>
                                <div className="w-44 flex-shrink-0">
                                    <SkuDropdown value={row.sku} products={products}
                                        onChange={v => update(row.id, { sku: v })}
                                        onSelect={p => {
                                            const pAny = p as any;
                                            const hasDims = !!(pAny.length && pAny.width && pAny.height && pAny.weight);
                                            const erpRate = freightRatesMap.get(p.sku.toUpperCase());
                                            update(row.id, {
                                                sku: p.sku, productName: p.name || '',
                                                cogs: p.costPrice || 0, caPrice: p.caPrice || 0,
                                                dimL: pAny.length || 0, dimW: pAny.width || 0, dimH: pAny.height || 0,
                                                physWeight: pAny.weight || 0,
                                                // Priority: 1) ERP uploaded rate (exact), 2) formula from dims, 3) manual
                                                freight: erpRate ?? 0,
                                                freightAuto: erpRate === undefined && hasDims,
                                            });
                                        }}
                                    />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <input value={row.productName} onChange={e => update(row.id, { productName: e.target.value })}
                                        placeholder="Product name…"
                                        className="w-full text-xs text-gray-500 bg-transparent outline-none placeholder-gray-300 truncate" />
                                </div>
                                {hasPrice && !isNaN(row.actualMargin) && <MarginBadge v={row.actualMargin} target={row.targetMargin} />}
                                <button onClick={() => setExpanded(expanded === row.id ? null : row.id)}
                                    className="text-gray-300 hover:text-gray-500 transition-colors">
                                    {expanded === row.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                </button>
                                <button onClick={() => setRows(prev => prev.filter(r => r.id !== row.id))}
                                    className="text-gray-300 hover:text-red-400 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            {/* Main inputs */}
                            <div className="px-4 py-3 bg-white border-t border-gray-100 space-y-3">
                                {/* Row 1: COGS, Freight, CA Price, Proposed, Postage, Target, Net */}
                                <div className="grid grid-cols-7 gap-2">
                                    <div>
                                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">COGS</div>
                                        <NumInput value={row.cogs} onChange={v => update(row.id, { cogs: v })} />
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-1 mb-1">
                                            <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Freight</span>
                                            {row.autoFreight !== null && (
                                                <span className="flex items-center gap-0.5 text-[8px] font-bold text-teal-600">
                                                    <Zap className="w-2.5 h-2.5" />auto
                                                </span>
                                            )}
                                        </div>
                                        {row.freightAuto && row.autoFreight !== null ? (
                                            <div className="px-2 py-1.5 text-xs font-mono font-bold rounded-lg border border-teal-200 bg-teal-50/50 text-teal-700 flex items-center gap-1">
                                                <Zap className="w-3 h-3" />{f2(row.effFreight)}
                                            </div>
                                        ) : (
                                            <NumInput value={row.freight} onChange={v => update(row.id, { freight: v })} />
                                        )}
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">CA Price</div>
                                        <NumInput value={row.caPrice} onChange={v => update(row.id, { caPrice: v })} />
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Proposed Price</div>
                                        <NumInput value={row.proposedPrice} onChange={v => update(row.id, { proposedPrice: v })}
                                            highlight={hasPrice && belowFloor} />
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Postage</div>
                                        <NumInput value={row.postage} onChange={v => update(row.id, { postage: v })} />
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Target Price</div>
                                        <div className="px-2 py-1.5 text-xs font-mono font-bold rounded-lg bg-gray-50 border border-gray-100"
                                            style={{ color: row.targetPrice > 0 ? themeColor : '#9ca3af' }}>
                                            {row.targetPrice > 0 ? f2(row.targetPrice) : '—'}
                                        </div>
                                    </div>
                                    <div>
                                        <div className="text-[9px] font-bold text-gray-400 uppercase tracking-wide mb-1">Net Revenue</div>
                                        <div className={`px-2 py-1.5 text-xs font-mono font-bold rounded-lg border ${
                                            row.netRevenue > 0 ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-gray-50 border-gray-100 text-gray-400'
                                        }`}>{hasPrice ? f2(row.netRevenue) : '—'}</div>
                                    </div>
                                </div>

                                {/* Row 2: Dimensions + weight (compact) */}
                                <div className="flex items-center gap-3 pt-1 border-t border-gray-50">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide flex-shrink-0">Dimensions</span>
                                    <div className="flex items-center gap-1.5">
                                        <DimInput value={row.dimL} onChange={v => update(row.id, { dimL: v })} label="L" />
                                        <span className="text-gray-300 text-xs">×</span>
                                        <DimInput value={row.dimW} onChange={v => update(row.id, { dimW: v })} label="W" />
                                        <span className="text-gray-300 text-xs">×</span>
                                        <DimInput value={row.dimH} onChange={v => update(row.id, { dimH: v })} label="H" />
                                        <span className="text-[9px] text-gray-400">cm</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 border-l border-gray-100 pl-3">
                                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-wide">Weight</span>
                                        <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden focus-within:border-gray-400 w-20">
                                            <input type="number" value={physWeight || ''} step={0.1} min={0}
                                                onChange={e => update(row.id, { physWeight: parseFloat(e.target.value) || 0 } as any)}
                                                className="w-full px-2 py-1.5 text-xs font-mono text-gray-700 bg-transparent outline-none" />
                                            <span className="px-1.5 text-[9px] text-gray-400 border-l border-gray-100 bg-gray-50">kg</span>
                                        </div>
                                    </div>
                                    {/* Auto freight toggle */}
                                    <div className="flex items-center gap-2 border-l border-gray-100 pl-3">
                                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                                            <div onClick={() => update(row.id, { freightAuto: !row.freightAuto })}
                                                className={`w-7 h-3.5 rounded-full transition-colors relative flex-shrink-0 ${row.freightAuto ? '' : 'bg-gray-200'}`}
                                                style={row.freightAuto ? { background: themeColor } : {}}>
                                                <div className={`absolute top-0.5 w-2.5 h-2.5 rounded-full bg-white shadow transition-transform ${row.freightAuto ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                                            </div>
                                            <span className="text-[9px] text-gray-500">Auto freight</span>
                                        </label>
                                        {row.freightAuto && row.autoFreight === null && row.dimL > 0 && (
                                            <span className="text-[9px] text-amber-500">Add weight to calculate</span>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Metrics strip */}
                            {hasPrice && (
                                <div className="flex items-center flex-wrap gap-x-5 gap-y-1 px-4 py-2 bg-gray-50/80 border-t border-gray-100 text-[10px]">
                                    <div className="flex items-center gap-1.5 text-gray-500">
                                        CA baseline <span className="font-mono font-bold text-gray-700">{f2(row.caBaseline)}</span>
                                        · <span className="font-mono font-bold text-gray-700">{fp(row.caBaselineMargin)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-gray-500">
                                        Target tier <span className="font-bold" style={{ color: themeColor }}>{fp(row.targetMargin)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-gray-500">
                                        Base cost <span className="font-mono font-bold text-gray-700">{f2(row.baseCost)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5 text-gray-500">
                                        Floor <span className={`font-mono font-bold ${belowFloor ? 'text-red-600' : 'text-gray-700'}`}>{f2(row.floorPrice)}</span>
                                        {belowFloor && <span className="sello-badge badge-red text-[9px]">below floor</span>}
                                    </div>
                                    {!isNaN(row.actualMargin) && row.actualMargin < row.targetMargin && (
                                        <div className="text-gray-400 ml-auto">gap to target: {fp(row.targetMargin - row.actualMargin)}</div>
                                    )}
                                </div>
                            )}

                            {/* Per-row overrides */}
                            {expanded === row.id && (
                                <div className="flex items-center flex-wrap gap-4 px-4 py-3 bg-white border-t border-dashed border-gray-200 text-[10px]">
                                    <span className="font-bold text-gray-400 uppercase tracking-wide">Row overrides</span>
                                    <label className="flex items-center gap-1.5">
                                        <span className="text-gray-500">CA Baseline %</span>
                                        <select value={row.caBaselinePct}
                                            onChange={e => update(row.id, { caBaselinePct: parseFloat(e.target.value) })}
                                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white font-mono">
                                            {[0.60,0.65,0.70,0.75,0.80].map(v => (
                                                <option key={v} value={v}>{(v*100).toFixed(0)}%</option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className="flex items-center gap-1.5">
                                        <span className="text-gray-500">Overhead %</span>
                                        <div className="flex items-center border border-gray-200 rounded-lg bg-white overflow-hidden">
                                            <input type="number" value={row.overheadPct} step={0.5} min={0} max={30}
                                                onChange={e => update(row.id, { overheadPct: parseFloat(e.target.value) || 0 })}
                                                className="w-12 px-2 py-1 text-xs font-mono outline-none" />
                                            <span className="px-1.5 text-[10px] text-gray-400 border-l border-gray-100 bg-gray-50">%</span>
                                        </div>
                                    </label>
                                    <label className="flex items-center gap-1.5">
                                        <span className="text-gray-500">Cost ×</span>
                                        <input type="number" value={row.overheadMultiplier} step={0.05} min={1} max={2}
                                            onChange={e => update(row.id, { overheadMultiplier: parseFloat(e.target.value) || 1 })}
                                            className="w-16 px-2 py-1 text-xs font-mono border border-gray-200 rounded-lg bg-white outline-none" />
                                    </label>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <button onClick={addRow}
                className="w-full py-3 rounded-xl border-2 border-dashed border-gray-200 text-xs font-bold text-gray-400 hover:border-gray-300 hover:text-gray-500 flex items-center justify-center gap-2 transition-colors">
                <Plus className="w-3.5 h-3.5" /> Add another SKU
            </button>
        </div>
    );
};
