import React, { useState, useMemo } from 'react';
import {
    ClipboardPaste, Copy, CheckCircle2, XCircle, ArrowLeftRight,
    X, Tag, AlertTriangle, GitMerge, ChevronDown, ChevronUp
} from 'lucide-react';
import { Product, PromotionEvent } from '../../../types';

interface SkuScreenToolProps {
    products?: Product[];
    promotions?: PromotionEvent[];
    learnedAliases?: Record<string, string>;
    themeColor?: string;
}

type ResultMode = 'in-both' | 'a-only' | 'b-only';
type QuickList = 'active-promos' | 'oos' | null;

function parsePaste(raw: string): string[] {
    return raw
        .split(/[\n\r\t,;]+/)
        .map(s => s.trim().toUpperCase())
        .filter(Boolean);
}

function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text).catch(() => {});
}

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    return (
        <button
            onClick={() => { copyToClipboard(text); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
            className="sello-btn flex items-center gap-1"
        >
            {copied ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy'}
        </button>
    );
}

export const SkuScreenTool: React.FC<SkuScreenToolProps> = ({
    products = [],
    promotions = [],
    learnedAliases = {},
    themeColor = '#134E4A',
}) => {
    const [listA, setListA]           = useState('');
    const [listB, setListB]           = useState('');
    const [mode, setMode]             = useState<ResultMode>('in-both');
    const [quickList, setQuickList]   = useState<QuickList>(null);
    const [useAliases, setUseAliases] = useState(false);
    const [showQuick, setShowQuick]   = useState(false);

    // ── Alias resolution map ──────────────────────────────────
    const aliasToMaster = useMemo(() => {
        const m = new Map<string, string>(); // alias UPPER → master UPPER
        // From learnedAliases
        Object.entries(learnedAliases).forEach(([alias, master]) => {
            m.set(alias.toUpperCase(), master.toUpperCase());
        });
        // From product channels
        products.forEach(p => {
            (p.channels || []).forEach(ch => {
                (ch.skuAlias || '').split(',').forEach(a => {
                    const alias = a.trim().toUpperCase();
                    if (alias) m.set(alias, p.sku.toUpperCase());
                });
            });
            m.set(p.sku.toUpperCase(), p.sku.toUpperCase()); // self
        });
        return m;
    }, [products, learnedAliases]);

    const resolve = (sku: string): string => {
        if (!useAliases) return sku;
        return aliasToMaster.get(sku) ?? sku;
    };

    // ── Product lookup ────────────────────────────────────────
    const productMap = useMemo(() => {
        const m = new Map<string, Product>();
        products.forEach(p => m.set(p.sku.toUpperCase(), p));
        return m;
    }, [products]);

    // ── Quick app lists ───────────────────────────────────────
    const activePromoSkus = useMemo(() => {
        const today = new Date().toISOString().split('T')[0];
        const set = new Set<string>();
        promotions
            .filter(p => p.startDate <= today && p.endDate >= today)
            .forEach(p => (p.items || []).forEach(i => set.add(i.sku.toUpperCase())));
        return set;
    }, [promotions]);

    const oosSkus = useMemo(() => {
        const set = new Set<string>();
        products.filter(p => (p.stockLevel ?? 0) <= 0).forEach(p => set.add(p.sku.toUpperCase()));
        return set;
    }, [products]);

    const quickListB = useMemo(() => {
        if (quickList === 'active-promos') return [...activePromoSkus].join('\n');
        if (quickList === 'oos')           return [...oosSkus].join('\n');
        return '';
    }, [quickList, activePromoSkus, oosSkus]);

    const effectiveListB = quickList ? quickListB : listB;

    // ── Set computation ───────────────────────────────────────
    const rawA = useMemo(() => parsePaste(listA), [listA]);
    const rawB = useMemo(() => parsePaste(effectiveListB), [effectiveListB]);

    const setA = useMemo(() => new Set(rawA.map(resolve)), [rawA, useAliases, aliasToMaster]);
    const setB = useMemo(() => new Set(rawB.map(resolve)), [rawB, useAliases, aliasToMaster]);

    // ── Duplicate detection (within raw A) ───────────────────
    const duplicatesInA = useMemo(() => {
        const seen = new Map<string, number>();
        rawA.forEach(s => seen.set(s, (seen.get(s) ?? 0) + 1));
        return new Map([...seen].filter(([, count]) => count > 1));
    }, [rawA]);

    // ── Results ───────────────────────────────────────────────
    const inBoth = useMemo(() => [...setA].filter(s => setB.has(s)).sort(), [setA, setB]);
    const aOnly  = useMemo(() => [...setA].filter(s => !setB.has(s)).sort(), [setA, setB]);
    const bOnly  = useMemo(() => [...setB].filter(s => !setA.has(s)).sort(), [setA, setB]);

    const results = mode === 'in-both' ? inBoth : mode === 'a-only' ? aOnly : bOnly;
    const hasInput = rawA.length > 0 || rawB.length > 0;
    const resultText = results.join('\n');

    const MODES: { key: ResultMode; label: string; count: number; badge: string }[] = [
        { key: 'in-both', label: 'In Both',   count: inBoth.length, badge: 'badge-green' },
        { key: 'a-only',  label: 'A only',    count: aOnly.length,  badge: 'badge-amber' },
        { key: 'b-only',  label: 'B only',    count: bOnly.length,  badge: 'badge-blue'  },
    ];

    const QUICK_OPTIONS = [
        { key: 'active-promos' as QuickList, label: 'Active Promotions', icon: Tag,          count: activePromoSkus.size },
        { key: 'oos'           as QuickList, label: 'Out of Stock SKUs', icon: AlertTriangle, count: oosSkus.size        },
    ];

    const TextArea = ({ value, onChange, label, locked }: {
        value: string; onChange: (v: string) => void; label: string; locked?: boolean;
    }) => (
        <div className="flex flex-col gap-2 flex-1">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wide">{label}</span>
                <div className="flex items-center gap-2">
                    {value && (
                        <span className="sello-badge badge-gray text-[10px]">
                            {parsePaste(value).length} SKUs
                        </span>
                    )}
                    {duplicatesInA.size > 0 && label === 'List A' && (
                        <span className="sello-badge badge-red text-[10px]" title="Duplicates found in List A">
                            {duplicatesInA.size} dupes
                        </span>
                    )}
                    {value && !locked && (
                        <button onClick={() => onChange('')} className="text-gray-300 hover:text-gray-500 transition-colors">
                            <X className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>
            <textarea
                value={value}
                onChange={e => !locked && onChange(e.target.value)}
                readOnly={locked}
                placeholder={locked ? '' : `Paste SKUs from Excel…\nOne per line, tab or comma separated`}
                className={`w-full h-48 resize-none rounded-xl border px-3 py-2.5 text-xs font-mono text-gray-700 placeholder-gray-300 focus:outline-none focus:border-gray-400 transition-colors leading-5 ${
                    locked ? 'bg-gray-50 border-gray-100 text-gray-400 cursor-default' : 'bg-gray-50/50 border-gray-200 focus:bg-white'
                }`}
                spellCheck={false}
            />
        </div>
    );

    return (
        <div className="space-y-5">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${themeColor}15` }}>
                        <ArrowLeftRight className="w-4 h-4" style={{ color: themeColor }} />
                    </div>
                    <div>
                        <div className="font-bold text-gray-900 text-sm">SKU Screen</div>
                        <div className="text-xs text-gray-400">Compare two SKU lists — find matches, gaps, and duplicates</div>
                    </div>
                </div>

                {/* Controls */}
                <div className="flex items-center gap-3">
                    {/* Alias toggle */}
                    <label className="flex items-center gap-2 cursor-pointer select-none" title="Resolve platform aliases before comparing">
                        <div
                            onClick={() => setUseAliases(v => !v)}
                            className={`w-8 h-4 rounded-full transition-colors relative ${useAliases ? 'bg-teal-600' : 'bg-gray-200'}`}
                            style={useAliases ? { background: themeColor } : {}}
                        >
                            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${useAliases ? 'translate-x-4' : 'translate-x-0.5'}`} />
                        </div>
                        <div className="flex items-center gap-1 text-xs text-gray-500">
                            <GitMerge className="w-3.5 h-3.5" />
                            Resolve aliases
                        </div>
                    </label>

                    {/* Quick list picker */}
                    <div className="relative">
                        <button
                            onClick={() => setShowQuick(v => !v)}
                            className={`sello-btn flex items-center gap-1.5 ${quickList ? 'text-white border-transparent' : ''}`}
                            style={quickList ? { background: themeColor } : {}}
                        >
                            <Tag className="w-3.5 h-3.5" />
                            {quickList ? QUICK_OPTIONS.find(o => o.key === quickList)?.label : 'Quick List B'}
                            {showQuick ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                        {showQuick && (
                            <div className="absolute right-0 top-full mt-1 z-50 w-52 bg-white rounded-xl border border-gray-200 shadow-lg overflow-hidden">
                                {quickList && (
                                    <button
                                        onClick={() => { setQuickList(null); setShowQuick(false); }}
                                        className="w-full text-left px-3 py-2 text-xs text-gray-500 hover:bg-gray-50 flex items-center gap-2 border-b border-gray-100"
                                    >
                                        <X className="w-3 h-3" /> Clear quick list
                                    </button>
                                )}
                                {QUICK_OPTIONS.map(opt => (
                                    <button
                                        key={opt.key}
                                        onClick={() => { setQuickList(opt.key); setShowQuick(false); setListB(''); }}
                                        className={`w-full text-left px-3 py-2.5 text-xs hover:bg-gray-50 flex items-center justify-between ${quickList === opt.key ? 'font-bold' : ''}`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <opt.icon className="w-3.5 h-3.5 text-gray-400" />
                                            {opt.label}
                                        </div>
                                        <span className="sello-badge badge-gray text-[10px]">{opt.count}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Alias notice */}
            {useAliases && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs" style={{ background: `${themeColor}10`, color: themeColor }}>
                    <GitMerge className="w-3.5 h-3.5 shrink-0" />
                    Alias resolution on — platform SKU aliases and learned aliases are resolved to master SKUs before comparison
                </div>
            )}

            {/* Duplicate warning */}
            {duplicatesInA.size > 0 && (
                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-50 border border-red-100 text-xs text-red-700">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <div>
                        <strong>{duplicatesInA.size} duplicate{duplicatesInA.size > 1 ? 's' : ''} in List A:</strong>{' '}
                        {[...duplicatesInA.entries()].map(([sku, count]) => `${sku} (×${count})`).join(', ')}
                    </div>
                </div>
            )}

            {/* Input panels */}
            <div className="flex gap-4">
                <TextArea value={listA} onChange={setListA} label="List A" />

                <div className="flex flex-col items-center justify-center gap-1.5 pt-7 flex-shrink-0">
                    <div className="w-px h-8 bg-gray-200" />
                    <div className="w-7 h-7 rounded-full border border-gray-200 bg-white flex items-center justify-center">
                        <ArrowLeftRight className="w-3.5 h-3.5 text-gray-400" />
                    </div>
                    <div className="w-px h-8 bg-gray-200" />
                </div>

                <TextArea
                    value={effectiveListB}
                    onChange={setListB}
                    label={quickList ? `List B — ${QUICK_OPTIONS.find(o => o.key === quickList)?.label}` : 'List B'}
                    locked={!!quickList}
                />
            </div>

            {/* Mode tabs + clear */}
            {hasInput && (
                <div className="flex items-center gap-2 flex-wrap">
                    {MODES.map(m => (
                        <button
                            key={m.key}
                            onClick={() => setMode(m.key)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${
                                mode === m.key
                                    ? 'text-white border-transparent shadow-sm'
                                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                            }`}
                            style={mode === m.key ? { background: themeColor } : {}}
                        >
                            {m.label}
                            <span className={`sello-badge ${m.badge} text-[10px] ${mode === m.key ? 'bg-white/20 border-white/30 text-white' : ''}`}>
                                {m.count}
                            </span>
                        </button>
                    ))}
                    <button
                        onClick={() => { setListA(''); setListB(''); setQuickList(null); }}
                        className="ml-auto text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                    >
                        <X className="w-3 h-3" /> Clear all
                    </button>
                </div>
            )}

            {/* Results table */}
            {hasInput && (
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-200">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wide">
                                {MODES.find(m => m.key === mode)?.label}
                            </span>
                            <span className="sello-badge badge-gray text-[10px]">{results.length} SKUs</span>
                        </div>
                        {results.length > 0 && <CopyButton text={resultText} />}
                    </div>

                    {results.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                            <XCircle className="w-8 h-8 mb-2 text-gray-200" />
                            <p className="text-sm font-medium">No SKUs match this filter</p>
                        </div>
                    ) : (
                        <div className="max-h-80 overflow-y-auto">
                            <table className="sello-table">
                                <thead>
                                    <tr>
                                        <th style={{ width: 28 }}>#</th>
                                        <th>SKU</th>
                                        {useAliases && <th>Resolved To</th>}
                                        <th>Product Name</th>
                                        <th className="c" style={{ width: 48 }}>In A</th>
                                        <th className="c" style={{ width: 48 }}>In B</th>
                                        {duplicatesInA.size > 0 && <th className="c" style={{ width: 52 }}>Dupes</th>}
                                    </tr>
                                </thead>
                                <tbody>
                                    {results.map((resolvedSku, i) => {
                                        const product = productMap.get(resolvedSku);
                                        const inA = setA.has(resolvedSku);
                                        const inB = setB.has(resolvedSku);
                                        // Find original raw SKU for dupe check
                                        const rawSku = rawA.find(s => resolve(s) === resolvedSku) ?? resolvedSku;
                                        const dupeCount = duplicatesInA.get(rawSku);
                                        const wasResolved = useAliases && resolvedSku !== rawSku;
                                        return (
                                            <tr key={resolvedSku} className={dupeCount ? 'row-warn' : ''}>
                                                <td className="v-dim text-[10px]">{i + 1}</td>
                                                <td><span className="sku">{wasResolved ? rawSku : resolvedSku}</span></td>
                                                {useAliases && (
                                                    <td>
                                                        {wasResolved
                                                            ? <span className="sku text-[10px]" style={{ color: themeColor }}>{resolvedSku}</span>
                                                            : <span className="v-dim">—</span>
                                                        }
                                                    </td>
                                                )}
                                                <td>
                                                    {product
                                                        ? <span className="pname">{product.name}</span>
                                                        : <span className="v-dim text-[10px] italic">Not in Master Catalogue</span>
                                                    }
                                                </td>
                                                <td className="c">
                                                    {inA ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : <span className="v-dim">—</span>}
                                                </td>
                                                <td className="c">
                                                    {inB ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 mx-auto" /> : <span className="v-dim">—</span>}
                                                </td>
                                                {duplicatesInA.size > 0 && (
                                                    <td className="c">
                                                        {dupeCount
                                                            ? <span className="sello-badge badge-red text-[10px]">×{dupeCount}</span>
                                                            : <span className="v-dim">—</span>
                                                        }
                                                    </td>
                                                )}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Summary footer */}
                    <div className="px-4 py-2 bg-gray-50 border-t border-gray-200 flex items-center gap-4 text-[10px] text-gray-400 flex-wrap">
                        <span>A: <strong className="text-gray-600">{setA.size}</strong></span>
                        <span>B: <strong className="text-gray-600">{setB.size}</strong></span>
                        <span className="text-emerald-600 font-bold">✓ {inBoth.length} in both</span>
                        <span className="text-amber-600 font-bold">{aOnly.length} only in A</span>
                        <span className="text-blue-600 font-bold">{bOnly.length} only in B</span>
                        {duplicatesInA.size > 0 && (
                            <span className="text-red-600 font-bold">{duplicatesInA.size} dupes in A</span>
                        )}
                        {useAliases && (
                            <span className="ml-auto" style={{ color: themeColor }}>
                                <GitMerge className="w-3 h-3 inline mr-1" />Alias resolution active
                            </span>
                        )}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!hasInput && (
                <div className="rounded-xl border-2 border-dashed border-gray-200 flex flex-col items-center justify-center py-16 text-gray-400">
                    <ClipboardPaste className="w-10 h-10 mb-3 text-gray-200" />
                    <p className="text-sm font-medium text-gray-500">Paste SKU lists above to get started</p>
                    <p className="text-xs text-gray-400 mt-1">Or use Quick List B to compare against live app data</p>
                </div>
            )}
        </div>
    );
};
