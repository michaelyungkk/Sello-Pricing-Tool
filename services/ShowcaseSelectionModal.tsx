import React, { useState, useMemo, useEffect } from 'react';
import { X, FileText, CheckSquare, Square, AlertTriangle, Clock } from 'lucide-react';
import { Product, CohortSnapshot } from '../../../types';
import { formatSmartMoney } from '../../../utils/format';

interface ShowcaseSelectionModalProps {
    products: Product[];
    cohortSnapshot: CohortSnapshot | null;
    onClose: () => void;
    onGenerate: (selectedSkus: string[]) => void;
    themeColor?: string;
}

type Period = '1w' | '2w' | '4w' | '8w' | 'custom';

const PERIOD_OPTIONS: { key: Period; label: string; days: number }[] = [
    { key: '1w', label: 'Last 1 week', days: 7 },
    { key: '2w', label: 'Last 2 weeks', days: 14 },
    { key: '4w', label: 'Last 4 weeks', days: 28 },
    { key: '8w', label: 'Last 8 weeks', days: 56 },
];

export const ShowcaseSelectionModal: React.FC<ShowcaseSelectionModalProps> = ({
    products,
    cohortSnapshot,
    onClose,
    onGenerate,
    themeColor = '#134E4A',
}) => {
    const [period, setPeriod] = useState<Period>('2w');
    const [customDays, setCustomDays] = useState(21);
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [includeNotReady, setIncludeNotReady] = useState(false);
    const [initialized, setInitialized] = useState(false);

    const cutoffDate = useMemo(() => {
        const days = period === 'custom'
            ? customDays
            : PERIOD_OPTIONS.find(o => o.key === period)?.days ?? 14;
        const d = new Date();
        d.setDate(d.getDate() - days);
        return d.toISOString().split('T')[0];
    }, [period, customDays]);

    const { suggested, notReady } = useMemo(() => {
        const recent = products
            .filter(p => p.landedAt && p.landedAt >= cutoffDate)
            .sort((a, b) => (b.landedAt || '').localeCompare(a.landedAt || ''));

        const sug = recent.filter(p => p.imageUrl && p.description);
        const not = recent.filter(p => !p.imageUrl || !p.description);
        return { suggested: sug, notReady: not };
    }, [products, cutoffDate]);

    // Auto-select all suggested on first load / period change
    useEffect(() => {
        setSelectedSkus(new Set(suggested.map(p => p.sku)));
        setInitialized(true);
    }, [suggested]);

    const allSuggestedSelected = suggested.length > 0 && suggested.every(p => selectedSkus.has(p.sku));

    const toggleSku = (sku: string) => {
        setSelectedSkus(prev => {
            const next = new Set(prev);
            next.has(sku) ? next.delete(sku) : next.add(sku);
            return next;
        });
    };

    const toggleAllSuggested = () => {
        if (allSuggestedSelected) {
            setSelectedSkus(prev => {
                const next = new Set(prev);
                suggested.forEach(p => next.delete(p.sku));
                return next;
            });
        } else {
            setSelectedSkus(prev => {
                const next = new Set(prev);
                suggested.forEach(p => next.add(p.sku));
                return next;
            });
        }
    };

    const toggleNotReady = (sku: string) => {
        setSelectedSkus(prev => {
            const next = new Set(prev);
            next.has(sku) ? next.delete(sku) : next.add(sku);
            return next;
        });
    };

    const estimatedPages = Math.ceil(selectedSkus.size / 4);

    const formatDate = (iso?: string) => {
        if (!iso) return '—';
        return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };

    const getMissing = (p: Product) => [
        !p.imageUrl ? 'No image' : null,
        !p.description ? 'No description' : null,
        !p.caPrice ? 'No CA price' : null,
    ].filter(Boolean).join(', ');

    return (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100" style={{ background: `${themeColor}08` }}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg" style={{ background: `${themeColor}15` }}>
                            <FileText className="w-4 h-4" style={{ color: themeColor }} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900">Generate New Product Showcase</h2>
                            <p className="text-xs text-gray-500">Select products to feature in the weekly PDF report</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                </div>

                {/* Period selector */}
                <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Period:</span>
                    {PERIOD_OPTIONS.map(opt => (
                        <button
                            key={opt.key}
                            onClick={() => setPeriod(opt.key)}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${period === opt.key ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                            style={period === opt.key ? { background: themeColor, borderColor: themeColor } : {}}
                        >
                            {opt.label}
                        </button>
                    ))}
                    <button
                        onClick={() => setPeriod('custom')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${period === 'custom' ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                        style={period === 'custom' ? { background: themeColor, borderColor: themeColor } : {}}
                    >
                        Custom
                    </button>
                    {period === 'custom' && (
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                value={customDays}
                                onChange={e => setCustomDays(Math.max(1, parseInt(e.target.value) || 1))}
                                className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1 text-center"
                                min={1}
                                max={365}
                            />
                            <span className="text-xs text-gray-500">days</span>
                        </div>
                    )}
                    <span className="ml-auto text-xs text-gray-500">
                        <span className="font-bold text-gray-700">{suggested.length + notReady.length}</span> products found
                    </span>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto">

                    {/* Suggested section */}
                    <div className="px-6 pt-4 pb-2">
                        <div className="flex items-center gap-2 mb-2">
                            <div className="h-px flex-1 bg-gray-100" />
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                                Suggested — has image + description ({suggested.length})
                            </span>
                            <div className="h-px flex-1 bg-gray-100" />
                        </div>

                        {suggested.length === 0 ? (
                            <p className="text-sm text-gray-400 italic py-3 text-center">No products with both image and description in this period.</p>
                        ) : (
                            <>
                                {/* Select all toggle */}
                                <button
                                    onClick={toggleAllSuggested}
                                    className="flex items-center gap-2 text-xs font-bold mb-2 hover:opacity-80 transition-opacity"
                                    style={{ color: themeColor }}
                                >
                                    {allSuggestedSelected
                                        ? <CheckSquare className="w-4 h-4" />
                                        : <Square className="w-4 h-4" />
                                    }
                                    {allSuggestedSelected ? 'Deselect all' : 'Select all'} suggested ({suggested.length})
                                </button>

                                <div className="border border-gray-100 rounded-xl overflow-hidden">
                                    {suggested.map((p, i) => (
                                        <div
                                            key={p.sku}
                                            onClick={() => toggleSku(p.sku)}
                                            className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${i > 0 ? 'border-t border-gray-50' : ''} ${selectedSkus.has(p.sku) ? '' : 'opacity-60'} hover:bg-gray-50`}
                                        >
                                            {selectedSkus.has(p.sku)
                                                ? <CheckSquare className="w-4 h-4 shrink-0" style={{ color: themeColor }} />
                                                : <Square className="w-4 h-4 shrink-0 text-gray-300" />
                                            }
                                            {p.imageUrl && (
                                                <img src={p.imageUrl} alt="" className="w-8 h-8 object-cover rounded border border-gray-100 shrink-0" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                                            )}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-xs font-bold text-gray-800 font-mono">{p.sku}</span>
                                                    {p.caPrice && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${themeColor}12`, color: themeColor }}>{formatSmartMoney(p.caPrice)}</span>}
                                                </div>
                                                <p className="text-[11px] text-gray-500 truncate">{p.name}</p>
                                            </div>
                                            <div className="flex items-center gap-1 text-[10px] text-gray-400 shrink-0">
                                                <Clock className="w-3 h-3" />
                                                {formatDate(p.landedAt)}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {/* Not Ready section */}
                    {notReady.length > 0 && (
                        <div className="px-6 pt-2 pb-4">
                            <div className="flex items-center gap-2 mb-2 mt-2">
                                <div className="h-px flex-1 bg-gray-100" />
                                <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest whitespace-nowrap">
                                    Not ready — missing data ({notReady.length})
                                </span>
                                <div className="h-px flex-1 bg-gray-100" />
                            </div>

                            <div className="border border-amber-100 rounded-xl overflow-hidden bg-amber-50/40">
                                <table className="w-full text-xs">
                                    <thead>
                                        <tr className="border-b border-amber-100">
                                            <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">SKU</th>
                                            <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">Name</th>
                                            <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">Added</th>
                                            <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">Missing</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {notReady.map((p, i) => (
                                            <tr key={p.sku} className={`${i > 0 ? 'border-t border-amber-100/50' : ''}`}>
                                                <td className="px-3 py-2 font-mono font-bold text-gray-700">{p.sku}</td>
                                                <td className="px-3 py-2 text-gray-500 truncate max-w-[180px]">{p.name}</td>
                                                <td className="px-3 py-2 text-gray-400 whitespace-nowrap">{formatDate(p.landedAt)}</td>
                                                <td className="px-3 py-2">
                                                    <span className="flex items-center gap-1 text-amber-600">
                                                        <AlertTriangle className="w-3 h-3 shrink-0" />
                                                        {getMissing(p)}
                                                    </span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <label className="flex items-center gap-2 mt-2 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={includeNotReady}
                                    onChange={e => {
                                        setIncludeNotReady(e.target.checked);
                                        if (e.target.checked) {
                                            setSelectedSkus(prev => {
                                                const next = new Set(prev);
                                                notReady.forEach(p => next.add(p.sku));
                                                return next;
                                            });
                                        } else {
                                            setSelectedSkus(prev => {
                                                const next = new Set(prev);
                                                notReady.forEach(p => next.delete(p.sku));
                                                return next;
                                            });
                                        }
                                    }}
                                    className="rounded"
                                />
                                <span className="text-xs text-gray-600">Include not-ready products (placeholder image)</span>
                            </label>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
                    <div className="text-sm text-gray-600">
                        <span className="font-bold text-gray-900">{selectedSkus.size}</span> products selected
                        {selectedSkus.size > 0 && (
                            <span className="text-gray-400"> · ~{estimatedPages} page{estimatedPages !== 1 ? 's' : ''}</span>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        >
                            Cancel
                        </button>
                        <button
                            onClick={() => selectedSkus.size > 0 && onGenerate(Array.from(selectedSkus))}
                            disabled={selectedSkus.size === 0}
                            className="px-5 py-2 text-sm font-bold text-white rounded-lg transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: themeColor }}
                        >
                            Generate PDF
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
