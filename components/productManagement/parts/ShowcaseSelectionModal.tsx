import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckSquare, Clock, FileText, Loader2, Plus, Square, Stamp, X } from 'lucide-react';
import { CohortSnapshot, Product } from '../../../types';
import { formatSmartMoney } from '../../../utils/format';
import { SelectFilter } from '../../common/SelectFilter';

type CatalogueReportType = 'new_product_preview' | 'pitching_catalogue';
type Period = '1w' | '2w' | '4w' | '8w' | 'custom';
type GenerateState = 'idle' | 'generating' | 'success' | 'error';

interface GenerateStats {
    totalSelected: number;
    matchedCount: number;
    missingImage: number;
    missingDescription: number;
    missingCaPrice: number;
    estimatedPages?: number;
}

interface ShowcaseSelectionModalProps {
    products: Product[];
    cohortSnapshot: CohortSnapshot | null;
    onClose: () => void;
    onGenerate: (payload: {
        selectedSkus: string[];
        reportType: CatalogueReportType;
        stats?: GenerateStats;
    }) => Promise<void> | void;
    themeColor?: string;
    onStampLandedAt?: (skus: string[], date: string) => void;
}

const PERIOD_OPTIONS: { key: Period; label: string; days: number }[] = [
    { key: '1w', label: 'Last 1 week', days: 7 },
    { key: '2w', label: 'Last 2 weeks', days: 14 },
    { key: '4w', label: 'Last 4 weeks', days: 28 },
    { key: '8w', label: 'Last 8 weeks', days: 56 },
];

const CATALOGUE_MODAL_SESSION_KEY = 'sello:catalogue-modal:v1';

const parseSkuTokens = (raw: string): string[] =>
    Array.from(new Set(
        raw
            .split(/[\r\n\t,; ]+/)
            .map(token => token.trim().toUpperCase())
            .filter(Boolean)
    ));

export const ShowcaseSelectionModal: React.FC<ShowcaseSelectionModalProps> = ({
    products,
    cohortSnapshot: _cohortSnapshot,
    onClose,
    onGenerate,
    themeColor = '#134E4A',
    onStampLandedAt,
}) => {
    const [reportType, setReportType] = useState<CatalogueReportType>('new_product_preview');
    const [period, setPeriod] = useState<Period>('2w');
    const [customDays, setCustomDays] = useState(21);
    const [includeNotReady, setIncludeNotReady] = useState(false);

    const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
    const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

    const [pickedSkus, setPickedSkus] = useState<Set<string>>(new Set());
    const [generationSkus, setGenerationSkus] = useState<Set<string>>(new Set());

    const [pastedSkuInput, setPastedSkuInput] = useState('');
    const [lastPasteMatchCount, setLastPasteMatchCount] = useState(0);
    const [lastPasteMissing, setLastPasteMissing] = useState<string[]>([]);
    const [lastPasteApplied, setLastPasteApplied] = useState(false);

    const [stampDate, setStampDate] = useState(new Date().toISOString().split('T')[0]);
    const [stampConfirmed, setStampConfirmed] = useState(false);

    const [generateState, setGenerateState] = useState<GenerateState>('idle');
    const [statusMessage, setStatusMessage] = useState('');
    const [statusKind, setStatusKind] = useState<'neutral' | 'success' | 'error'>('neutral');

    const restoredFromSessionRef = useRef(false);
    const previewSeededRef = useRef(false);

    const cutoffDate = useMemo(() => {
        const days = period === 'custom'
            ? customDays
            : PERIOD_OPTIONS.find(option => option.key === period)?.days ?? 14;
        const date = new Date();
        date.setDate(date.getDate() - days);
        return date.toISOString().split('T')[0];
    }, [period, customDays]);

    const aliasLookup = useMemo(() => {
        const map = new Map<string, string>();
        products.forEach(product => {
            if (!product?.sku) return;
            map.set(product.sku.toUpperCase(), product.sku);
            (product.channels || []).forEach(channel => {
                (channel.skuAlias || '')
                    .split(',')
                    .map(alias => alias.trim().toUpperCase())
                    .filter(Boolean)
                    .forEach(alias => {
                        if (!map.has(alias)) map.set(alias, product.sku);
                    });
            });
        });
        return map;
    }, [products]);

    const { suggested, notReady } = useMemo(() => {
        const recent = products
            .filter(product => !!product.landedAt && product.landedAt >= cutoffDate)
            .sort((a, b) => (b.landedAt || '').localeCompare(a.landedAt || ''));
        return {
            suggested: recent.filter(product => product.imageUrl && product.description),
            notReady: recent.filter(product => !product.imageUrl || !product.description),
        };
    }, [products, cutoffDate]);

    const uniqueBrands = useMemo(
        () => Array.from(new Set(products.map(product => product.brand).filter(Boolean) as string[])).sort(),
        [products]
    );
    const uniqueCategories = useMemo(
        () => Array.from(new Set(products.map(product => product.category).filter(Boolean) as string[])).sort(),
        [products]
    );

    const pitchingPool = useMemo(() => {
        const hasFilter = selectedBrands.length > 0 || selectedCategories.length > 0;
        if (!hasFilter) return [] as Product[];
        return products
            .filter(product => {
                const brandMatch = selectedBrands.length === 0 || (!!product.brand && selectedBrands.includes(product.brand));
                const categoryMatch = selectedCategories.length === 0 || (!!product.category && selectedCategories.includes(product.category));
                return brandMatch && categoryMatch;
            })
            .sort((a, b) => (a.sku || '').localeCompare(b.sku || ''));
    }, [products, selectedBrands, selectedCategories]);

    const previewMatchedSkus = useMemo(
        () => Array.from(new Set([...suggested, ...notReady].map(product => product.sku))),
        [suggested, notReady]
    );
    const pitchingMatchedSkus = useMemo(() => pitchingPool.map(product => product.sku), [pitchingPool]);
    const matchedSkus = reportType === 'pitching_catalogue' ? pitchingMatchedSkus : previewMatchedSkus;
    const matchedCount = matchedSkus.length;

    const allSuggestedPicked = suggested.length > 0 && suggested.every(product => pickedSkus.has(product.sku));

    const generationProducts = useMemo(
        () => products.filter(product => generationSkus.has(product.sku)),
        [products, generationSkus]
    );

    const generationSummary = useMemo(() => {
        let missingImage = 0;
        let missingDescription = 0;
        let missingCaPrice = 0;
        generationProducts.forEach(product => {
            if (!product.imageUrl) missingImage += 1;
            if (!product.description) missingDescription += 1;
            if (typeof product.caPrice !== 'number' || !Number.isFinite(product.caPrice)) missingCaPrice += 1;
        });
        return { missingImage, missingDescription, missingCaPrice };
    }, [generationProducts]);

    const estimatedPages = Math.ceil(generationSkus.size / 4);
    const unstamped = useMemo(() => products.filter(product => !product.landedAt), [products]);
    const previewFoundCount = suggested.length + notReady.length;

    useEffect(() => {
        if (restoredFromSessionRef.current) return;
        try {
            const raw = sessionStorage.getItem(CATALOGUE_MODAL_SESSION_KEY);
            if (!raw) {
                restoredFromSessionRef.current = true;
                return;
            }
            const parsed = JSON.parse(raw) as {
                reportType?: CatalogueReportType;
                period?: Period;
                customDays?: number;
                selectedBrands?: string[];
                selectedCategories?: string[];
                pastedSkuInput?: string;
            };
            if (parsed.reportType === 'new_product_preview' || parsed.reportType === 'pitching_catalogue') {
                setReportType(parsed.reportType);
            }
            if (parsed.period && (['1w', '2w', '4w', '8w', 'custom'] as string[]).includes(parsed.period)) {
                setPeriod(parsed.period);
            }
            if (typeof parsed.customDays === 'number' && Number.isFinite(parsed.customDays)) {
                setCustomDays(Math.max(1, Math.min(365, Math.round(parsed.customDays))));
            }
            if (Array.isArray(parsed.selectedBrands)) setSelectedBrands(parsed.selectedBrands.filter(v => typeof v === 'string'));
            if (Array.isArray(parsed.selectedCategories)) setSelectedCategories(parsed.selectedCategories.filter(v => typeof v === 'string'));
            if (typeof parsed.pastedSkuInput === 'string') setPastedSkuInput(parsed.pastedSkuInput.slice(0, 4000));
        } catch {
            // Ignore malformed session payload
        } finally {
            restoredFromSessionRef.current = true;
        }
    }, []);

    useEffect(() => {
        if (!restoredFromSessionRef.current) return;
        try {
            sessionStorage.setItem(CATALOGUE_MODAL_SESSION_KEY, JSON.stringify({
                reportType,
                period,
                customDays,
                selectedBrands,
                selectedCategories,
                pastedSkuInput: pastedSkuInput.slice(0, 4000),
            }));
        } catch {
            // Ignore session storage errors
        }
    }, [reportType, period, customDays, selectedBrands, selectedCategories, pastedSkuInput]);

    useEffect(() => {
        if (reportType !== 'new_product_preview') return;
        if (!restoredFromSessionRef.current) return;
        if (previewSeededRef.current) return;
        if (pickedSkus.size > 0 || generationSkus.size > 0) {
            previewSeededRef.current = true;
            return;
        }
        const autoSkus = new Set(suggested.map(product => product.sku));
        setPickedSkus(autoSkus);
        setGenerationSkus(autoSkus);
        previewSeededRef.current = true;
    }, [reportType, suggested, pickedSkus.size, generationSkus.size]);

    useEffect(() => {
        if (!statusMessage) return;
        const timer = window.setTimeout(() => {
            if (generateState === 'generating') return;
            setStatusMessage('');
            setStatusKind('neutral');
            setGenerateState('idle');
        }, 3000);
        return () => window.clearTimeout(timer);
    }, [statusMessage, generateState]);

    const pushStatus = (message: string, kind: 'neutral' | 'success' | 'error' = 'neutral') => {
        setStatusMessage(message);
        setStatusKind(kind);
    };

    const addToSet = (
        setState: React.Dispatch<React.SetStateAction<Set<string>>>,
        skus: string[],
        label: string,
        verb: 'picked' | 'added'
    ) => {
        if (skus.length === 0) return;
        let added = 0;
        let duplicate = 0;
        setState(prev => {
            const next = new Set(prev);
            skus.forEach(sku => {
                if (next.has(sku)) duplicate += 1;
                else {
                    next.add(sku);
                    added += 1;
                }
            });
            return next;
        });
        pushStatus(`${label}: ${added} ${verb}${duplicate > 0 ? `, ${duplicate} already selected` : ''}`, 'neutral');
    };

    const removeMatchedFromGeneration = (skus: string[], label: string) => {
        if (skus.length === 0) return;
        const matched = new Set(skus);
        let removed = 0;
        setGenerationSkus(prev => {
            const next = new Set<string>();
            Array.from(prev).forEach(sku => {
                if (matched.has(sku)) removed += 1;
                else next.add(sku);
            });
            return next;
        });
        pushStatus(`${label}: ${removed} removed from generation list`, 'neutral');
    };

    const excludeMissingFromGeneration = (kind: 'image' | 'description' | 'caPrice') => {
        const skuToRemove = generationProducts
            .filter(product => {
                if (kind === 'image') return !product.imageUrl;
                if (kind === 'description') return !product.description;
                return !(typeof product.caPrice === 'number' && Number.isFinite(product.caPrice));
            })
            .map(product => product.sku);

        const label = kind === 'image'
            ? 'Exclude missing image'
            : kind === 'description'
                ? 'Exclude missing description'
                : 'Exclude missing CA price';
        removeMatchedFromGeneration(skuToRemove, label);
    };

    const togglePickedSku = (sku: string) => {
        setPickedSkus(prev => {
            const next = new Set(prev);
            if (next.has(sku)) next.delete(sku);
            else next.add(sku);
            return next;
        });
    };

    const applyPastedSkus = () => {
        const tokens = parseSkuTokens(pastedSkuInput);
        if (tokens.length === 0) {
            setLastPasteApplied(false);
            setLastPasteMatchCount(0);
            setLastPasteMissing([]);
            return;
        }
        const matched: string[] = [];
        const missing: string[] = [];
        tokens.forEach(token => {
            const resolved = aliasLookup.get(token);
            if (resolved) matched.push(resolved);
            else missing.push(token);
        });
        addToSet(setPickedSkus, matched, 'Paste add', 'picked');
        setLastPasteApplied(true);
        setLastPasteMatchCount(matched.length);
        setLastPasteMissing(missing.slice(0, 12));
    };

    const resetModalState = () => {
        setReportType('new_product_preview');
        setPeriod('2w');
        setCustomDays(21);
        setIncludeNotReady(false);
        setSelectedBrands([]);
        setSelectedCategories([]);
        setPickedSkus(new Set());
        setGenerationSkus(new Set());
        setPastedSkuInput('');
        setLastPasteApplied(false);
        setLastPasteMatchCount(0);
        setLastPasteMissing([]);
        setGenerateState('idle');
        setStatusMessage('');
        setStatusKind('neutral');
        previewSeededRef.current = false;
        try {
            sessionStorage.removeItem(CATALOGUE_MODAL_SESSION_KEY);
        } catch {
            // Ignore session storage errors
        }
    };

    const handleGenerate = async () => {
        if (generationSkus.size === 0 || generateState === 'generating') return;
        setGenerateState('generating');
        pushStatus('Generating catalogue...', 'neutral');
        try {
            await Promise.resolve(onGenerate({
                selectedSkus: Array.from(generationSkus),
                reportType,
                stats: {
                    totalSelected: generationSkus.size,
                    matchedCount,
                    missingImage: generationSummary.missingImage,
                    missingDescription: generationSummary.missingDescription,
                    missingCaPrice: generationSummary.missingCaPrice,
                    estimatedPages: reportType === 'new_product_preview' ? estimatedPages : undefined,
                },
            }));
            setGenerateState('success');
            pushStatus(`Generated ${generationSkus.size} SKU(s) successfully.`, 'success');
        } catch (error: any) {
            setGenerateState('error');
            const message = typeof error?.message === 'string' ? error.message : 'Generation failed. Please try again.';
            pushStatus(message, 'error');
        }
    };

    const statusClassName = statusKind === 'error'
        ? 'border-red-100 bg-red-50 text-red-700'
        : statusKind === 'success'
            ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
            : 'border-gray-100 bg-gray-50 text-gray-700';

    const formatDate = (iso?: string) => {
        if (!iso) return '-';
        return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    };

    const getMissing = (product: Product) => [
        !product.imageUrl ? 'No image' : null,
        !product.description ? 'No description' : null,
        !product.caPrice ? 'No CA price' : null,
    ].filter(Boolean).join(', ');

    return (
        <div className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100" style={{ background: `${themeColor}08` }}>
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg" style={{ background: `${themeColor}15` }}>
                            <FileText className="w-4 h-4" style={{ color: themeColor }} />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-gray-900">Generate Product Catalogue</h2>
                            <p className="text-xs text-gray-500">Choose report type, pick SKUs, then confirm generation list</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-4 h-4 text-gray-400" />
                    </button>
                </div>

                <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-500 uppercase tracking-wider mr-1">Report type:</span>
                    <button
                        onClick={() => setReportType('new_product_preview')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${reportType === 'new_product_preview' ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                        style={reportType === 'new_product_preview' ? { background: themeColor, borderColor: themeColor } : {}}
                    >
                        New Product Preview
                    </button>
                    <button
                        onClick={() => setReportType('pitching_catalogue')}
                        className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${reportType === 'pitching_catalogue' ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                        style={reportType === 'pitching_catalogue' ? { background: themeColor, borderColor: themeColor } : {}}
                    >
                        Pitching Catalogue
                    </button>
                    <button
                        onClick={resetModalState}
                        className="ml-auto px-3 py-1 rounded-lg text-xs font-bold border border-gray-200 text-gray-600 hover:bg-gray-50"
                    >
                        Reset
                    </button>
                </div>

                {statusMessage && (
                    <div className={`px-6 py-2 border-b text-xs ${statusClassName}`}>
                        {statusMessage}
                    </div>
                )}

                {reportType === 'new_product_preview' && (
                    <div className="px-6 py-3 border-b border-gray-100 flex items-center gap-3 flex-wrap">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Period:</span>
                        {PERIOD_OPTIONS.map(option => (
                            <button
                                key={option.key}
                                onClick={() => setPeriod(option.key)}
                                className={`px-3 py-1 rounded-lg text-xs font-bold transition-all border ${period === option.key ? 'text-white border-transparent' : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'}`}
                                style={period === option.key ? { background: themeColor, borderColor: themeColor } : {}}
                            >
                                {option.label}
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
                                    onChange={event => setCustomDays(Math.max(1, parseInt(event.target.value, 10) || 1))}
                                    className="w-16 text-xs border border-gray-200 rounded-lg px-2 py-1 text-center"
                                    min={1}
                                    max={365}
                                />
                                <span className="text-xs text-gray-500">days</span>
                            </div>
                        )}
                        <span className="ml-auto text-xs text-gray-500">
                            <span className="font-bold text-gray-700">{previewFoundCount}</span> products found
                        </span>
                    </div>
                )}

                {reportType === 'pitching_catalogue' && (
                    <div className="px-6 py-3 border-b border-gray-100 space-y-3">
                        <div className="text-xs font-bold text-gray-500 uppercase tracking-wider">Pick by brand or category</div>
                        <div className="flex flex-wrap items-center gap-2">
                            <SelectFilter label="BRAND" selected={selectedBrands} onChange={setSelectedBrands} options={uniqueBrands} />
                            <SelectFilter label="CATEGORY" selected={selectedCategories} onChange={setSelectedCategories} options={uniqueCategories} />
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                            <button
                                onClick={() => addToSet(setGenerationSkus, pitchingMatchedSkus, 'Add all matched', 'added')}
                                disabled={pitchingMatchedSkus.length === 0}
                                className="px-3 py-1.5 text-xs font-bold text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ background: themeColor }}
                            >
                                Add All Matched
                            </button>
                            <button
                                onClick={() => removeMatchedFromGeneration(pitchingMatchedSkus, 'Remove matched')}
                                disabled={pitchingMatchedSkus.length === 0}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Remove Matched
                            </button>
                            <span className="text-xs text-gray-500">
                                {pitchingPool.length > 0
                                    ? `${pitchingPool.length} SKU(s) matched`
                                    : 'Select at least one brand or category to start picking SKUs'}
                            </span>
                        </div>
                    </div>
                )}

                <div className="px-6 py-3 border-b border-gray-100 bg-white">
                    <div className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Paste SKUs or aliases (Excel)</div>
                    <div className="flex gap-2 items-start">
                        <textarea
                            value={pastedSkuInput}
                            onChange={event => setPastedSkuInput(event.target.value)}
                            placeholder="Paste SKU / alias list (newline, tab, comma, space supported)"
                            className="flex-1 min-h-[68px] max-h-36 resize-y text-xs border border-gray-200 rounded-lg px-3 py-2 text-gray-700"
                        />
                        <button
                            onClick={applyPastedSkus}
                            className="px-3 py-1.5 text-xs font-bold text-white rounded-lg shadow-sm"
                            style={{ background: themeColor }}
                        >
                            Add to pick list
                        </button>
                    </div>
                    {lastPasteApplied && (
                        <div className="mt-2 text-[11px] text-gray-600">
                            Matched <span className="font-bold text-gray-900">{lastPasteMatchCount}</span> token(s)
                            {lastPasteMissing.length > 0 && (
                                <span className="text-amber-600"> | Not found: {lastPasteMissing.join(', ')}{parseSkuTokens(pastedSkuInput).length - lastPasteMatchCount > lastPasteMissing.length ? ' ...' : ''}</span>
                            )}
                        </div>
                    )}
                </div>

                <div className="px-6 py-2 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                    <div className="text-xs text-gray-600">
                        Pick list: <span className="font-bold text-gray-900">{pickedSkus.size}</span> | Matched: <span className="font-bold text-gray-900">{matchedCount}</span> | Generation: <span className="font-bold text-gray-900">{generationSkus.size}</span>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={() => removeMatchedFromGeneration(matchedSkus, 'Remove matched')}
                            disabled={matchedSkus.length === 0}
                            className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                            Remove Matched
                        </button>
                        <button
                            onClick={() => addToSet(setGenerationSkus, Array.from(pickedSkus), 'Add picked', 'added')}
                            disabled={pickedSkus.size === 0}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
                            style={{ background: themeColor }}
                        >
                            <Plus className="w-3.5 h-3.5" />
                            Add picked to generation
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto">
                    {reportType === 'new_product_preview' && (
                        <div className="px-6 pt-4 pb-2">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="h-px flex-1 bg-gray-100" />
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest whitespace-nowrap">
                                    Suggested - has image + description ({suggested.length})
                                </span>
                                <div className="h-px flex-1 bg-gray-100" />
                            </div>

                            {suggested.length === 0 ? (
                                <p className="text-sm text-gray-400 italic py-3 text-center">No products with both image and description in this period.</p>
                            ) : (
                                <>
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                        <button
                                            onClick={() => {
                                                if (allSuggestedPicked) {
                                                    setPickedSkus(prev => {
                                                        const next = new Set(prev);
                                                        suggested.forEach(product => next.delete(product.sku));
                                                        return next;
                                                    });
                                                } else {
                                                    setPickedSkus(prev => {
                                                        const next = new Set(prev);
                                                        suggested.forEach(product => next.add(product.sku));
                                                        return next;
                                                    });
                                                }
                                            }}
                                            className="flex items-center gap-2 text-xs font-bold hover:opacity-80 transition-opacity"
                                            style={{ color: themeColor }}
                                        >
                                            {allSuggestedPicked ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                                            {allSuggestedPicked ? 'Unpick all' : 'Pick all'} suggested ({suggested.length})
                                        </button>
                                        <button
                                            onClick={() => addToSet(setGenerationSkus, suggested.map(product => product.sku), 'Add suggested', 'added')}
                                            disabled={suggested.length === 0}
                                            className="px-3 py-1 text-xs font-bold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                        >
                                            Add Suggested
                                        </button>
                                        <button
                                            onClick={() => addToSet(setGenerationSkus, notReady.map(product => product.sku), 'Add not ready', 'added')}
                                            disabled={notReady.length === 0}
                                            className="px-3 py-1 text-xs font-bold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40"
                                        >
                                            Add Not Ready
                                        </button>
                                    </div>

                                    <div className="border border-gray-100 rounded-xl overflow-hidden">
                                        {suggested.map((product, index) => (
                                            <div
                                                key={product.sku}
                                                onClick={() => togglePickedSku(product.sku)}
                                                className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer transition-colors ${index > 0 ? 'border-t border-gray-50' : ''} ${pickedSkus.has(product.sku) ? '' : 'opacity-60'} hover:bg-gray-50`}
                                            >
                                                {pickedSkus.has(product.sku)
                                                    ? <CheckSquare className="w-4 h-4 shrink-0" style={{ color: themeColor }} />
                                                    : <Square className="w-4 h-4 shrink-0 text-gray-300" />
                                                }
                                                {product.imageUrl && (
                                                    <img
                                                        src={product.imageUrl}
                                                        alt=""
                                                        className="w-8 h-8 object-cover rounded border border-gray-100 shrink-0"
                                                        onError={event => { (event.target as HTMLImageElement).style.display = 'none'; }}
                                                    />
                                                )}
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-bold text-gray-800 font-mono">{product.sku}</span>
                                                        {product.caPrice && (
                                                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: `${themeColor}12`, color: themeColor }}>
                                                                {formatSmartMoney(product.caPrice)}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <p className="text-[11px] text-gray-500 truncate">{product.name}</p>
                                                </div>
                                                <div className="flex items-center gap-1 text-[10px] text-gray-400 shrink-0">
                                                    <Clock className="w-3 h-3" />
                                                    {formatDate(product.landedAt)}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}

                            {notReady.length > 0 && (
                                <div className="mt-4">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="h-px flex-1 bg-gray-100" />
                                        <span className="text-[10px] font-bold text-amber-500 uppercase tracking-widest whitespace-nowrap">
                                            Not ready - missing data ({notReady.length})
                                        </span>
                                        <div className="h-px flex-1 bg-gray-100" />
                                    </div>
                                    <div className="border border-amber-100 rounded-xl overflow-hidden bg-amber-50/40">
                                        <table className="w-full text-xs">
                                            <thead>
                                                <tr className="border-b border-amber-100">
                                                    <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">Pick</th>
                                                    <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">SKU</th>
                                                    <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">Name</th>
                                                    <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">Missing</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {notReady.map((product, index) => (
                                                    <tr key={product.sku} className={index > 0 ? 'border-t border-amber-100/50' : ''}>
                                                        <td className="px-3 py-2">
                                                            <button onClick={() => togglePickedSku(product.sku)} className="text-gray-500 hover:text-gray-700">
                                                                {pickedSkus.has(product.sku)
                                                                    ? <CheckSquare className="w-4 h-4" style={{ color: themeColor }} />
                                                                    : <Square className="w-4 h-4" />
                                                                }
                                                            </button>
                                                        </td>
                                                        <td className="px-3 py-2 font-mono font-bold text-gray-700">{product.sku}</td>
                                                        <td className="px-3 py-2 text-gray-500 truncate max-w-[180px]">{product.name}</td>
                                                        <td className="px-3 py-2">
                                                            <span className="flex items-center gap-1 text-amber-600">
                                                                <AlertTriangle className="w-3 h-3 shrink-0" />
                                                                {getMissing(product)}
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
                                            onChange={event => {
                                                setIncludeNotReady(event.target.checked);
                                                if (event.target.checked) {
                                                    setPickedSkus(prev => {
                                                        const next = new Set(prev);
                                                        notReady.forEach(product => next.add(product.sku));
                                                        return next;
                                                    });
                                                } else {
                                                    setPickedSkus(prev => {
                                                        const next = new Set(prev);
                                                        notReady.forEach(product => next.delete(product.sku));
                                                        return next;
                                                    });
                                                }
                                            }}
                                            className="rounded"
                                        />
                                        <span className="text-xs text-gray-600">Pick all not-ready products too</span>
                                    </label>
                                </div>
                            )}
                        </div>
                    )}

                    {reportType === 'pitching_catalogue' && (
                        <div className="px-6 pt-4 pb-2">
                            {pitchingPool.length === 0 ? (
                                <p className="text-sm text-gray-400 italic py-3 text-center">No SKU pool yet. Choose brand or category above.</p>
                            ) : (
                                <div className="border border-gray-100 rounded-xl overflow-hidden">
                                    <table className="w-full text-xs">
                                        <thead>
                                            <tr className="border-b border-gray-100 bg-gray-50">
                                                <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">Pick</th>
                                                <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">SKU</th>
                                                <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">Product Title</th>
                                                <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">Brand</th>
                                                <th className="text-left px-3 py-2 font-bold text-gray-500 text-[10px] uppercase tracking-wider">Category</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {pitchingPool.map((product, index) => (
                                                <tr key={product.sku} className={index > 0 ? 'border-t border-gray-100' : ''}>
                                                    <td className="px-3 py-2">
                                                        <button onClick={() => togglePickedSku(product.sku)} className="text-gray-500 hover:text-gray-700">
                                                            {pickedSkus.has(product.sku)
                                                                ? <CheckSquare className="w-4 h-4" style={{ color: themeColor }} />
                                                                : <Square className="w-4 h-4" />
                                                            }
                                                        </button>
                                                    </td>
                                                    <td className="px-3 py-2 font-mono font-bold text-gray-700">{product.sku}</td>
                                                    <td className="px-3 py-2 text-gray-700">{product.name}</td>
                                                    <td className="px-3 py-2 text-gray-500">{product.brand || '-'}</td>
                                                    <td className="px-3 py-2 text-gray-500">{product.category || '-'}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {unstamped.length > 0 && reportType === 'new_product_preview' && onStampLandedAt && (
                    <div className="mx-6 mb-3 p-3 rounded-xl border border-amber-200 bg-amber-50 flex items-center gap-3">
                        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <div className="text-xs font-bold text-amber-800">{unstamped.length} SKU(s) missing landed date</div>
                            <div className="text-[10px] text-amber-600 mt-0.5">Stamp once so weekly preset works accurately.</div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                            <input
                                type="date"
                                value={stampDate}
                                onChange={event => { setStampDate(event.target.value); setStampConfirmed(false); }}
                                className="text-xs border border-amber-300 rounded-lg px-2 py-1 bg-white"
                            />
                            {!stampConfirmed ? (
                                <button
                                    onClick={() => { onStampLandedAt(unstamped.map(product => product.sku), stampDate); setStampConfirmed(true); }}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-bold text-white rounded-lg whitespace-nowrap"
                                    style={{ background: themeColor }}
                                >
                                    <Stamp className="w-3 h-3" />
                                    Stamp dates
                                </button>
                            ) : (
                                <span className="text-xs font-bold text-emerald-600">Stamped</span>
                            )}
                        </div>
                    </div>
                )}

                <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/50">
                    <div className="mb-3 grid grid-cols-2 md:grid-cols-3 gap-2 text-[11px]">
                        <div className="px-2 py-1 rounded border border-gray-200 bg-white text-gray-600">Generation: <span className="font-bold text-gray-900">{generationSkus.size}</span></div>
                        <div className="px-2 py-1 rounded border border-gray-200 bg-white text-gray-600">Matched: <span className="font-bold text-gray-900">{matchedCount}</span></div>
                        <button
                            type="button"
                            onClick={() => excludeMissingFromGeneration('image')}
                            disabled={generationSummary.missingImage === 0}
                            className="px-2 py-1 rounded border border-gray-200 bg-white text-left text-gray-600 hover:bg-red-50 hover:border-red-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 transition-colors"
                            title="Exclude SKUs missing image from generation list"
                        >
                            Missing image: <span className="font-bold text-gray-900">{generationSummary.missingImage}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => excludeMissingFromGeneration('description')}
                            disabled={generationSummary.missingDescription === 0}
                            className="px-2 py-1 rounded border border-gray-200 bg-white text-left text-gray-600 hover:bg-red-50 hover:border-red-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 transition-colors"
                            title="Exclude SKUs missing description from generation list"
                        >
                            Missing description: <span className="font-bold text-gray-900">{generationSummary.missingDescription}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => excludeMissingFromGeneration('caPrice')}
                            disabled={generationSummary.missingCaPrice === 0}
                            className="px-2 py-1 rounded border border-gray-200 bg-white text-left text-gray-600 hover:bg-red-50 hover:border-red-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white disabled:hover:border-gray-200 transition-colors"
                            title="Exclude SKUs missing CA price from generation list"
                        >
                            Missing CA price: <span className="font-bold text-gray-900">{generationSummary.missingCaPrice}</span>
                        </button>
                        {reportType === 'new_product_preview' && (
                            <div className="px-2 py-1 rounded border border-gray-200 bg-white text-gray-600">Estimated pages: <span className="font-bold text-gray-900">{estimatedPages}</span></div>
                        )}
                    </div>

                    <div className="mb-3">
                        <div className="text-[11px] font-bold text-gray-500 uppercase tracking-wider mb-1">Generation list ({generationSkus.size})</div>
                        {generationProducts.length === 0 ? (
                            <div className="text-xs text-gray-400">No SKU added yet.</div>
                        ) : (
                            <div className="max-h-24 overflow-y-auto flex flex-wrap gap-1.5">
                                {generationProducts.map(product => (
                                    <span key={product.sku} className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-white border border-gray-200 text-[11px]">
                                        <span className="font-mono text-gray-700">{product.sku}</span>
                                        <button onClick={() => removeMatchedFromGeneration([product.sku], 'Remove item')} className="text-gray-400 hover:text-red-500">x</button>
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="flex items-center justify-between">
                        <div className="text-sm text-gray-600">
                            <span className="font-bold text-gray-900">{generationSkus.size}</span> SKU(s) ready
                            {generationSkus.size > 0 && reportType === 'new_product_preview' && (
                                <span className="text-gray-400"> | ~{estimatedPages} page{estimatedPages !== 1 ? 's' : ''}</span>
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
                                onClick={handleGenerate}
                                disabled={generationSkus.size === 0 || generateState === 'generating'}
                                className="px-5 py-2 text-sm font-bold text-white rounded-lg transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                                style={{ background: themeColor }}
                            >
                                {generateState === 'generating' ? (
                                    <span className="inline-flex items-center gap-1.5">
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Generating...
                                    </span>
                                ) : 'Generate PDF'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
