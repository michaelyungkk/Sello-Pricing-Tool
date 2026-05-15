import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Product, PriceLog, RefundLog, PricingRules } from '../../types';
import { getReportLayouts, saveReportLayout, ReportLayout } from '../../services/persistenceService';
import { asDateKey, isDateKeyBetween, addDaysToDateKey, getTodayKeyMelbourne } from '../../services/dateUtils';
import { aggregateTransactionLedger } from '../../services/metrics';
import {
    Layout,
    Plus,
    GripVertical,
    X,
    Clock,
    BarChart3,
    Save,
    FileText,
    Play,
    Loader2,
    Download,
    ArrowUp,
    ArrowDown,
    ArrowLeftRight,
    Filter,
    Calculator,
    Settings2,
    FolderOpen,
    ChevronDown,
    CheckSquare,
    Square,
    Search,
    ListFilter,
    Trash2,
} from 'lucide-react';
import { formatMoney, formatSmartMoney, formatPct, formatNumber } from '../../utils/format';
import { GradeBadge } from '../common/GradeBadge';
import { SelectFilter } from '../common/SelectFilter';

// Local alias so existing usages inside this file need no changes
const MultiSelectDropdown = SelectFilter;

interface CustomReportPageProps {
    products: Product[];
    priceHistory: PriceLog[];
    refundHistory: RefundLog[];
    pricingRules: PricingRules;
    customReportPresets?: ReportLayout[];
    setCustomReportPresets?: React.Dispatch<React.SetStateAction<ReportLayout[]>>;
    isAdminMode?: boolean;
}

/** Derive a badge style from a hex colour stored in pricingRules */
function platformBadgeStyle(hex: string): React.CSSProperties {
    // Parse hex → rgb
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return {
        display: 'inline-flex',
        alignItems: 'center',
        padding: '2px 8px',
        borderRadius: 20,
        border: `1px solid rgba(${r},${g},${b},0.45)`,
        background: `rgba(${r},${g},${b},0.12)`,
        color: hex,
        fontSize: 9.5,
        fontWeight: 700,
        whiteSpace: 'nowrap' as const,
        lineHeight: '16px',
    };
}

/** Fallback colour for unknown platform */
function getPlatformHex(platform: string, rules: PricingRules): string {
    if (rules[platform]?.color) return rules[platform].color;
    const l = platform.toLowerCase();
    if (l.includes('amazon')) return '#b45309';
    if (l.includes('ebay'))   return '#1d4ed8';
    if (l.includes('etsy'))   return '#9a3412';
    return '#6b7280';
}

const DIMENSIONS = [
    { id: 'brand', label: 'Brand', icon: Layout },
    { id: 'category', label: 'Category', icon: Layout },
    { id: 'platform', label: 'Platform', icon: Layout },
    { id: 'sku', label: 'SKU', icon: FileText },
];

// Filter-only dimensions (not usable as row/column pivots)
const FILTER_ONLY_DIMS = [
    { id: 'grade', label: 'Grade', icon: Layout },
];

const GRADE_LABELS: Record<number, string> = { 1: 'G1', 2: 'G2', 3: 'G3', 4: 'G4', 5: 'G5' };

const METRICS = [
    { id: 'revenue', label: 'Revenue', icon: BarChart3, type: 'currency' },
    { id: 'cogs', label: 'COGS', icon: BarChart3, type: 'currency' },
    { id: 'profit', label: 'Profit', icon: BarChart3, type: 'currency' },
    { id: 'units', label: 'Units', icon: BarChart3, type: 'number' },
    { id: 'margin', label: 'Margin %', icon: BarChart3, type: 'percent' },
    { id: 'ad_spend', label: 'Ad Spend', icon: BarChart3, type: 'currency' },
    { id: 'tacos', label: 'TACoS %', icon: BarChart3, type: 'percent' },
    { id: 'asp', label: 'ASP', icon: BarChart3, type: 'currency' },
    { id: 'roi', label: 'ROI %', icon: BarChart3, type: 'percent' },
    { id: 'refund_rate', label: 'Refund Rate %', icon: BarChart3, type: 'percent' },
    { id: 'refund_value', label: 'Refund Value', icon: BarChart3, type: 'currency' },
    { id: 'stock', label: 'Stock Level', icon: Layout, type: 'number', isStatic: true },
    { id: 'runway', label: 'Days of Cover', icon: Clock, type: 'number', isStatic: true },
];

const formatPop = (val: number): string => {
    if (!isFinite(val)) return '—';
    const sign = val >= 0 ? '+' : '';
    const arrow = val >= 0 ? '↑' : '↓';
    return `${arrow} ${sign}${val.toFixed(1)}%`;
};

const PopBadge: React.FC<{ val: number }> = ({ val }) => {
    if (!isFinite(val)) return <span className="v-dim">—</span>;
    const isPos = val >= 0;
    const abs = Math.abs(val);
    const isBig = abs >= 20;
    return (
        <span
            className={`inline-flex items-center gap-0.5 font-bold ${isPos ? 'text-emerald-600' : 'text-red-500'}`}
            style={{ fontSize: isBig ? 11 : 10, fontWeight: isBig ? 900 : 700 }}
        >
            <span style={{ fontSize: isBig ? 12 : 10, lineHeight: 1 }}>{isPos ? '▲' : '▼'}</span>
            {isPos ? '+' : ''}{val.toFixed(1)}%
        </span>
    );
};

const TIME_RANGES = [
    { id: '7d', label: 'Last 7 Days' },
    { id: '30d', label: 'Last 30 Days' },
    { id: '90d', label: 'Last 90 Days' },
    { id: 'ytd', label: 'Year to Date' },
    { id: 'custom', label: 'Custom Range' },
];

interface SortRule {
    key: string;
    dir: 'asc' | 'desc';
}

interface FilterRule {
    id: string;
    type: 'dim' | 'metric';
    field: string;
    operator: 'equals' | 'contains' | 'gt' | 'lt' | 'top_n' | 'bottom_n';
    value: string | string[];
}

interface MetricInstance {
    id: string;
    metricId: string;
    timeRange: string;
    startDate?: string;
    endDate?: string;
    isHidden?: boolean;
    isPop?: boolean;
}

interface CustomMetric {
    id: string;
    label: string;
    formulaType: 'arithmetic' | 'share_of_total';
    // arithmetic operands — instance ids (Mode A) or metricIds (Mode B)
    metricA: string;
    metricB?: string;
    metricATime?: string; // Mode B standalone time
    metricBTime?: string;
    operator: '+' | '-' | '*' | '/' | '%change';
    // share_of_total operand
    shareMetric?: string;
    shareMetricTime?: string;
    type: 'currency' | 'percent' | 'number';
}

const PLATFORM_COMPARISON_PRESET: ReportLayout = {
    id: 'preset-platform-comparison',
    name: 'Platform Comparison',
    rowDims: ['sku'],
    colDims: ['platform'],
    metrics: [
        { id: 'pc_units_30d', metricId: 'units', timeRange: '30d' },
        { id: 'pc_units_share_30d', metricId: 'pc_units_share', timeRange: '30d' },
        { id: 'pc_margin_30d', metricId: 'margin', timeRange: '30d' },
        { id: 'pc_asp_30d', metricId: 'asp', timeRange: '30d' },
        { id: 'pc_revenue_30d', metricId: 'revenue', timeRange: '30d' },
        { id: 'pc_profit_30d', metricId: 'profit', timeRange: '30d' },
    ],
    filters: [],
    customMetrics: [
        {
            id: 'pc_units_share',
            label: 'Share %',
            formulaType: 'share_of_total',
            metricA: 'pc_units_30d',
            operator: '/',
            shareMetric: 'pc_units_30d',
            type: 'percent',
        }
    ],
    sortRules: [{ key: 'total_pc_units_30d', dir: 'desc' }],
    updatedAt: '2026-05-08T00:00:00.000Z',
} as unknown as ReportLayout;

const BUILT_IN_REPORT_PRESETS: ReportLayout[] = [PLATFORM_COMPARISON_PRESET];

// --- CUSTOM METRIC MODAL ---
interface CustomMetricModalProps {
    pendingMetrics: MetricInstance[];
    onClose: () => void;
    onCreate: (cm: CustomMetric) => void;
}

const CustomMetricModal: React.FC<CustomMetricModalProps> = ({ pendingMetrics, onClose, onCreate }) => {
    const [label, setLabel] = useState('');
    const [formulaType, setFormulaType] = useState<'arithmetic' | 'share_of_total'>('arithmetic');
    const [mode, setMode] = useState<'table' | 'standalone'>('table');
    const [metricA, setMetricA] = useState(pendingMetrics[0]?.id || METRICS[0].id);
    const [metricB, setMetricB] = useState(pendingMetrics[1]?.id || METRICS[1].id);
    const [metricAStandalone, setMetricAStandalone] = useState(METRICS[0].id);
    const [metricATime, setMetricATime] = useState('30d');
    const [metricBStandalone, setMetricBStandalone] = useState(METRICS[1].id);
    const [metricBTime, setMetricBTime] = useState('30d');
    const [shareMetric, setShareMetric] = useState(pendingMetrics[0]?.id || METRICS[0].id);
    const [shareMetricStandalone, setShareMetricStandalone] = useState(METRICS[0].id);
    const [shareMetricTime, setShareMetricTime] = useState('30d');
    const [operator, setOperator] = useState<'+' | '-' | '*' | '/' | '%change'>('/');
    const [displayType, setDisplayType] = useState<'currency' | 'percent' | 'number'>('number');

    const labelCls = "text-[10px] font-bold text-gray-400 uppercase mb-1 block";
    const selectCls = "w-full p-2 border border-gray-200 rounded-lg text-xs";

    const handleCreate = () => {
        if (!label.trim()) return;
        const id = Math.random().toString(36).substr(2, 9);
        if (formulaType === 'share_of_total') {
            onCreate({
                id, label, formulaType,
                metricA: mode === 'table' ? shareMetric : shareMetricStandalone,
                operator: '/',
                shareMetric: mode === 'table' ? shareMetric : shareMetricStandalone,
                shareMetricTime: mode === 'standalone' ? shareMetricTime : undefined,
                type: displayType,
            });
        } else {
            onCreate({
                id, label, formulaType,
                metricA: mode === 'table' ? metricA : metricAStandalone,
                metricATime: mode === 'standalone' ? metricATime : undefined,
                metricB: mode === 'table' ? metricB : metricBStandalone,
                metricBTime: mode === 'standalone' ? metricBTime : undefined,
                operator,
                type: operator === '%change' ? 'percent' : displayType,
            });
        }
    };

    return (
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-100 rounded-lg">
                        <Calculator className="w-5 h-5 text-emerald-600" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">Custom Metric</h3>
                </div>
                <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
            </div>
            <div className="p-6 space-y-4">
                {/* Label */}
                <div>
                    <label className={labelCls}>Label</label>
                    <input
                        type="text"
                        value={label}
                        onChange={e => setLabel(e.target.value)}
                        placeholder="e.g. Contribution Margin"
                        className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                    />
                </div>

                {/* Formula Type */}
                <div>
                    <label className={labelCls}>Formula Type</label>
                    <div className="flex gap-2">
                        {(['arithmetic', 'share_of_total'] as const).map(ft => (
                            <button
                                key={ft}
                                onClick={() => setFormulaType(ft)}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${formulaType === ft ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-gray-600 border-gray-200 hover:border-emerald-300'}`}
                            >
                                {ft === 'arithmetic' ? 'Arithmetic' : 'Share of Total'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Mode */}
                <div>
                    <label className={labelCls}>Mode</label>
                    <div className="flex gap-2">
                        {(['table', 'standalone'] as const).map(m => (
                            <button
                                key={m}
                                onClick={() => setMode(m)}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-colors ${mode === m ? 'bg-theme text-white border-theme' : 'bg-white text-gray-600 border-gray-200 hover:border-theme-20'}`}
                            >
                                {m === 'table' ? 'From Table' : 'Standalone'}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Arithmetic fields */}
                {formulaType === 'arithmetic' && (
                    <div className="space-y-3">
                        {mode === 'table' ? (
                            <div className="grid grid-cols-3 gap-2 items-end">
                                <div>
                                    <label className={labelCls}>Metric A</label>
                                    <select value={metricA} onChange={e => setMetricA(e.target.value)} className={selectCls}>
                                        {pendingMetrics.map(m => (
                                            <option key={m.id} value={m.id}>{METRICS.find(x => x.id === m.metricId)?.label || m.metricId} ({m.timeRange === 'custom' && m.startDate && m.endDate ? `${m.startDate.slice(5)} → ${m.endDate.slice(5)}` : TIME_RANGES.find(t => t.id === m.timeRange)?.label || m.timeRange})</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Op</label>
                                    <select value={operator} onChange={e => setOperator(e.target.value as any)} className={selectCls}>
                                        <option value="+">+</option><option value="-">-</option>
                                        <option value="*">×</option><option value="/">/</option>
                                        <option value="%change">% Change (PoP)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Metric B</label>
                                    <select value={metricB} onChange={e => setMetricB(e.target.value)} className={selectCls}>
                                        {pendingMetrics.map(m => (
                                            <option key={m.id} value={m.id}>{METRICS.find(x => x.id === m.metricId)?.label || m.metricId} ({m.timeRange === 'custom' && m.startDate && m.endDate ? `${m.startDate.slice(5)} → ${m.endDate.slice(5)}` : TIME_RANGES.find(t => t.id === m.timeRange)?.label || m.timeRange})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className={labelCls}>Metric A</label>
                                        <select value={metricAStandalone} onChange={e => setMetricAStandalone(e.target.value)} className={selectCls}>
                                            {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Time Range</label>
                                        <select value={metricATime} onChange={e => setMetricATime(e.target.value)} className={selectCls}>
                                            {TIME_RANGES.filter(t => t.id !== 'custom').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                                <div className="flex justify-center">
                                    <select value={operator} onChange={e => setOperator(e.target.value as any)} className="p-2 border border-gray-200 rounded-lg text-xs w-20 text-center">
                                        <option value="+">+</option><option value="-">-</option>
                                        <option value="*">×</option><option value="/">/</option>
                                        <option value="%change">% Change (PoP)</option>
                                    </select>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <label className={labelCls}>Metric B</label>
                                        <select value={metricBStandalone} onChange={e => setMetricBStandalone(e.target.value)} className={selectCls}>
                                            {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                        </select>
                                    </div>
                                    <div>
                                        <label className={labelCls}>Time Range</label>
                                        <select value={metricBTime} onChange={e => setMetricBTime(e.target.value)} className={selectCls}>
                                            {TIME_RANGES.filter(t => t.id !== 'custom').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                        </select>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Share of Total fields */}
                {formulaType === 'share_of_total' && (
                    <div>
                        {mode === 'table' ? (
                            <div>
                                <label className={labelCls}>Metric</label>
                                <select value={shareMetric} onChange={e => setShareMetric(e.target.value)} className={selectCls}>
                                    {pendingMetrics.map(m => (
                                        <option key={m.id} value={m.id}>{METRICS.find(x => x.id === m.metricId)?.label || m.metricId} ({m.timeRange === 'custom' && m.startDate && m.endDate ? `${m.startDate.slice(5)} → ${m.endDate.slice(5)}` : TIME_RANGES.find(t => t.id === m.timeRange)?.label || m.timeRange})</option>
                                    ))}
                                </select>
                            </div>
                        ) : (
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className={labelCls}>Metric</label>
                                    <select value={shareMetricStandalone} onChange={e => setShareMetricStandalone(e.target.value)} className={selectCls}>
                                        {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className={labelCls}>Time Range</label>
                                    <select value={shareMetricTime} onChange={e => setShareMetricTime(e.target.value)} className={selectCls}>
                                        {TIME_RANGES.filter(t => t.id !== 'custom').map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Display As */}
                <div>
                    <label className={labelCls}>Display As</label>
                    <select value={displayType} onChange={e => setDisplayType(e.target.value as any)} className={selectCls}>
                        <option value="currency">Currency</option>
                        <option value="percent">Percent</option>
                        <option value="number">Number</option>
                    </select>
                </div>
            </div>
            <div className="p-6 bg-gray-50 flex gap-3">
                <button onClick={onClose} className="flex-1 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">
                    Cancel
                </button>
                <button
                    onClick={handleCreate}
                    disabled={!label.trim()}
                    className="flex-1 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors disabled:opacity-50"
                >
                    Create Metric
                </button>
            </div>
        </div>
    );
};

// ─── Sort Priority Dropdown ──────────────────────────────────────────────────
// Shows active sort rules and lets users manage them.
// New sorts are added by clicking column headers (Shift+Click for multi-sort).
interface SortPriorityDropdownProps {
    sortRules: SortRule[];
    setSortRules: (rules: SortRule[]) => void;
    getSortKeyLabel: (key: string) => string;
    disabled?: boolean;
    iconOnly?: boolean;
}

const SortPriorityDropdown: React.FC<SortPriorityDropdownProps> = ({
    sortRules, setSortRules, getSortKeyLabel, disabled, iconOnly
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const portalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (triggerRef.current && !triggerRef.current.contains(e.target as Node)
                && portalRef.current && !portalRef.current.contains(e.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleDir = (idx: number) => {
        const next = [...sortRules];
        next[idx] = { ...next[idx], dir: next[idx].dir === 'asc' ? 'desc' : 'asc' };
        setSortRules(next);
    };

    const removeRule = (idx: number) => {
        setSortRules(sortRules.filter((_, i) => i !== idx));
    };

    const clearAll = () => {
        setSortRules([]);
        setIsOpen(false);
    };

    return (
        <div ref={triggerRef} className="relative">
            <button
                onClick={() => {
                    if (disabled) return;
                    if (!isOpen && triggerRef.current) {
                        const r = triggerRef.current.getBoundingClientRect();
                        setDropPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX });
                    }
                    setIsOpen(!isOpen);
                }}
                disabled={disabled}
                className={iconOnly
                    ? "relative p-1.5 rounded-md border bg-white hover:bg-theme-10 disabled:opacity-40 transition-all"
                    : "flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold text-gray-600 bg-white hover:bg-gray-50 shadow-sm disabled:opacity-40 transition-all"
                }
                style={{ borderColor: sortRules.length > 0 ? 'var(--theme)' : 'rgba(209,213,219,0.8)', color: sortRules.length > 0 ? 'var(--theme)' : undefined }}
                title="Sort Priority"
            >
                <ListFilter className="w-3.5 h-3.5" />
                {!iconOnly && <>
                    Sort Priority
                    {sortRules.length > 0 && (
                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-black"
                            style={{ background: 'var(--theme)', color: 'white' }}>
                            {sortRules.length}
                        </span>
                    )}
                    <ChevronDown className="w-3 h-3" />
                </>}
                {iconOnly && sortRules.length > 0 && (
                    <span className="absolute -top-1 -right-1 inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[8px] font-black"
                        style={{ background: 'var(--theme)', color: 'white' }}>
                        {sortRules.length}
                    </span>
                )}
            </button>

            {isOpen && createPortal(
                <div ref={portalRef} style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 9999 }}
                    className="w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden p-3">
                    <div className="flex items-center justify-between mb-2">
                        <h4 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Active Sort Rules</h4>
                        {sortRules.length > 0 && (
                            <button onClick={clearAll} className="text-[10px] text-red-400 hover:text-red-600 font-bold">Clear All</button>
                        )}
                    </div>

                    {sortRules.length === 0 ? (
                        <div className="text-[11px] text-gray-400 italic text-center py-3">No sort rules active</div>
                    ) : (
                        <div className="space-y-1.5 mb-3">
                            {sortRules.map((rule, i) => (
                                <div key={i} className="flex items-center gap-2 bg-gray-50 px-2 py-1.5 rounded-lg border border-gray-100">
                                    <span className="text-[10px] font-bold text-gray-400 w-4">{i + 1}.</span>
                                    <span className="text-[11px] font-medium text-gray-800 flex-1 truncate" title={getSortKeyLabel(rule.key)}>
                                        {getSortKeyLabel(rule.key)}
                                    </span>
                                    <button onClick={() => toggleDir(i)} className="p-1 hover:bg-gray-200 rounded text-gray-500" title="Toggle direction">
                                        {rule.dir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                                    </button>
                                    <button onClick={() => removeRule(i)} className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded" title="Remove">
                                        <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="border-t border-gray-100 pt-2">
                        <p className="text-[10px] text-gray-400 text-center leading-relaxed">
                            Click any column header to sort.<br />
                            <span className="font-bold">Shift+Click</span> to add to sort hierarchy.
                        </p>
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

const CustomReportPageInner: React.FC<CustomReportPageProps> = ({
    products,
    priceHistory,
    refundHistory,
    pricingRules,
    customReportPresets = [],
    setCustomReportPresets,
    isAdminMode = false,
}) => {
    // --- STATE ---

    // pendingMetrics = staging; metrics = last committed (used by generateReport)
    const mkInst = (metricId: string): MetricInstance => ({ id: Math.random().toString(36).substr(2, 9), metricId, timeRange: '30d' });

    // Lazy initialisers — read from localStorage once on mount, fall back to defaults
    const [rowDims, setRowDims] = useState<string[]>(() => {
        try { const d = JSON.parse(localStorage.getItem('sello_custom_report_draft') || '{}'); if (d.rowDims?.length) return d.rowDims; } catch { /* ignore invalid draft JSON */ }
        return ['sku'];
    });
    const [colDims, setColDims] = useState<string[]>(() => {
        try { const d = JSON.parse(localStorage.getItem('sello_custom_report_draft') || '{}'); if (d.colDims?.length) return d.colDims; } catch { /* ignore invalid draft JSON */ }
        return ['platform'];
    });
    const [pendingMetrics, setPendingMetrics] = useState<MetricInstance[]>(() => {
        try { const d = JSON.parse(localStorage.getItem('sello_custom_report_draft') || '{}'); if (d.pendingMetrics?.length) return d.pendingMetrics; } catch { /* ignore invalid draft JSON */ }
        return [mkInst('units'), mkInst('revenue'), mkInst('profit')];
    });
    const [pendingFilters, setPendingFilters] = useState<FilterRule[]>(() => {
        try { const d = JSON.parse(localStorage.getItem('sello_custom_report_draft') || '{}'); if (d.pendingFilters?.length) return d.pendingFilters; } catch { /* ignore invalid draft JSON */ }
        return [];
    });
    const [reportName, setReportName] = useState<string>(() => {
        try { const d = JSON.parse(localStorage.getItem('sello_custom_report_draft') || '{}'); if (d.reportName) return d.reportName; } catch { /* ignore invalid draft JSON */ }
        return 'New Custom Report';
    });
    const [sortRules, setSortRules] = useState<SortRule[]>(() => {
        try { const d = JSON.parse(localStorage.getItem('sello_custom_report_draft') || '{}'); if (d.sortRules?.length) return d.sortRules; } catch { /* ignore invalid draft JSON */ }
        return [{ key: 'total_units', dir: 'desc' }];
    });

    const [metrics, setMetrics] = useState<MetricInstance[]>([]);

    // filters = applied; pendingFilters = staging
    const [filters, setFilters] = useState<FilterRule[]>([]);
    const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>([]);
    const [isCustomMetricModalOpen, setIsCustomMetricModalOpen] = useState(false);
    const [cmMode, setCmMode] = useState<'table' | 'standalone'>('table');
    const [cmFormula, setCmFormula] = useState<'arithmetic' | 'share_of_total'>('arithmetic');

    const [savedLayouts, setSavedLayouts] = useState<ReportLayout[]>(getReportLayouts());
    const [presetLayouts, setPresetLayouts] = useState<ReportLayout[]>(customReportPresets || []);
    const [isSaveNaming, setIsSaveNaming] = useState(false);
    const [saveTarget, setSaveTarget] = useState<'local' | 'preset'>('local');
    const [saveNameInput, setSaveNameInput] = useState('');
    const saveNameRef = React.useRef<HTMLInputElement>(null);
    const [activePopover, setActivePopover] = useState<string | null>(null);
    const [popoverPos, setPopoverPos] = useState<{top:number,left:number}>({top:0,left:0});

    const [isGenerating, setIsGenerating] = useState(false);
    const [reportResult, setReportResult] = useState<{
        rows: any[];
        colHeaders: any[];
        rowHeaders: string[];
    } | null>(null);
    const [needsGeneration, setNeedsGeneration] = useState(true);
    const [showBuilder, setShowBuilder] = useState(true);
    const [isFilterMenuOpen, setIsFilterMenuOpen] = useState(false);
    const [skuSearchTags, setSkuSearchTags] = useState<string[]>([]);
    const [skuSearchInput, setSkuSearchInput] = useState('');
    const [skuSearchDebounced, setSkuSearchDebounced] = useState('');
    useEffect(() => {
        const t = setTimeout(() => setSkuSearchDebounced(skuSearchInput), 200);
        return () => clearTimeout(t);
    }, [skuSearchInput]);
    const [colOrder, setColOrder] = useState<string[]>([]);
    const [dragOverCol, setDragOverCol] = useState<string | null>(null);
    const [isReorderOpen, setIsReorderOpen] = useState(false);
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);
    const [barChartEnabled, setBarChartEnabled] = useState(true);
    const [draftOrder, setDraftOrder] = useState<string[]>([]);
    const [dragPanelOver, setDragPanelOver] = useState<number | null>(null);
    const dragPanelIdx = useRef<number | null>(null);
    const dragColRef = useRef<string | null>(null);
    const dragOverColRef = useRef<string | null>(null);
    const filtersRef = useRef<FilterRule[]>([]);

    // ── Virtualised table ──────────────────────────────────────────────────
    const VIRT_ROW_H   = 52;   // px — matches two-line SKU row height
    const VIRT_OVERSCAN = 8;   // extra rows above/below viewport
    const tableScrollRef = useRef<HTMLDivElement>(null);
    const [virtRange, setVirtRange] = useState<{ start: number; end: number }>({ start: 0, end: 60 });

    useEffect(() => {
        const el = tableScrollRef.current;
        if (!el) return;
        const onScroll = () => {
            const scrollTop = el.scrollTop;
            const viewH    = el.clientHeight;
            const start = Math.max(0, Math.floor(scrollTop / VIRT_ROW_H) - VIRT_OVERSCAN);
            const end   = Math.ceil((scrollTop + viewH) / VIRT_ROW_H) + VIRT_OVERSCAN;
            setVirtRange(prev => (prev.start === start && prev.end === end) ? prev : { start, end });
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        onScroll(); // initialise
        return () => el.removeEventListener('scroll', onScroll);
    }, [reportResult]); // re-attach when report changes

    // Auto-save draft to localStorage whenever config changes
    React.useEffect(() => {
        try {
            const draft = { rowDims, colDims, pendingMetrics, pendingFilters, reportName, sortRules };
            localStorage.setItem('sello_custom_report_draft', JSON.stringify(draft));
        } catch { /* ignore localStorage write failures */ }
    }, [rowDims, colDims, pendingMetrics, pendingFilters, reportName, sortRules]);

    useEffect(() => {
        setPresetLayouts(customReportPresets || []);
    }, [customReportPresets]);

    const availablePresetLayouts = useMemo(() => {
        const builtInIds = new Set(BUILT_IN_REPORT_PRESETS.map(layout => layout.id));
        const userPresets = (presetLayouts || []).filter(layout => !builtInIds.has(layout.id));
        return [...BUILT_IN_REPORT_PRESETS, ...userPresets];
    }, [presetLayouts]);



    // Auto-generate report when changes occur and report already exists
    // REMOVED: Auto-refresh disabled per user request
    // React.useEffect(() => {
    //     if (needsGeneration && reportResult && !isGenerating) {
    //         generateReport();
    //     }
    //     // eslint-disable-next-line react-hooks/exhaustive-deps
    // }, [needsGeneration, reportResult, isGenerating]);

    // --- HELPERS ---
    const getDimLabel = (id: string) => DIMENSIONS.find(d => d.id === id)?.label || id;

    // Converts a sort key (e.g. "amazon_revenue", "total_profit", "brand") to a human label
    const getSortKeyLabel = (key: string): string => {
        // Row dimension key e.g. "brand", "category"
        const dim = DIMENSIONS.find(d => d.id === key);
        if (dim) return dim.label;
        // total_metricId
        if (key.startsWith('total_')) {
            const metricId = key.replace('total_', '');
            const inst = metrics.find(m => m.id === metricId);
            return inst ? `Total — ${getMetricLabel(inst.metricId)}` : key;
        }
        // colHeaderId_metricId
        const parts = key.split('_');
        if (parts.length >= 2 && reportResult) {
            const metricId = parts[parts.length - 1];
            const colId = parts.slice(0, -1).join('_');
            const colHeader = reportResult.colHeaders?.find((ch: any) => ch.id === colId);
            const inst = metrics.find(m => m.id === metricId);
            if (colHeader && inst) return `${colHeader.label} — ${getMetricLabel(inst.metricId)}`;
        }
        return key.replace(/_/g, ' ');
    };
    const getMetricLabel = (id: string) => {
        const standard = METRICS.find(m => m.id === id);
        if (standard) return standard.label;
        const custom = customMetrics.find(m => m.id === id);
        return custom?.label || id;
    };
    const getMetricConfig = (id: string) => {
        const standard = METRICS.find(m => m.id === id);
        if (standard) return standard;
        const custom = customMetrics.find(m => m.id === id);
        if (custom) return { id: custom.id, label: custom.label, type: custom.type, icon: Calculator };
        return undefined;
    };

    const handleSwapDims = () => {
        const newRowDims = [...colDims];
        const newColDims = [...rowDims];
        setRowDims(newRowDims);
        setColDims(newColDims);
        generateReport(newRowDims, newColDims);
    };

    const handleAddMetric = (metricId: string) => {
        setPendingMetrics(prev => [...prev, {
            id: Math.random().toString(36).substr(2, 9),
            metricId,
            timeRange: '30d'
        }]);
    };

    const handleAddFilter = (field: string, type: 'dim' | 'metric') => {
        const newFilter: FilterRule = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            field, // dim: field name; metric: metric instance id
            operator: type === 'dim' ? 'contains' : 'gt',
            value: ''
        };
        setPendingFilters(prev => [...prev, newFilter]);
    };

    const isPreAggregationFilter = (filter: FilterRule): boolean => {
        if (filter.type !== 'dim') return false;
        if (filter.field === 'grade') return false;
        if (colDims.includes(filter.field)) return true;
        return !rowDims.includes(filter.field);
    };

    const getPreAggregationFilterSignature = (filterList: FilterRule[]): string => (
        JSON.stringify(filterList.filter(isPreAggregationFilter))
    );

    const applyFilters = () => {
        const newFilters = [...pendingFilters];
        const prevFilters = filtersRef.current;
        filtersRef.current = newFilters;
        setFilters(newFilters);
        setShowBuilder(false);
        if (getPreAggregationFilterSignature(prevFilters) !== getPreAggregationFilterSignature(newFilters)) {
            setTimeout(() => generateReport(undefined, undefined, newFilters), 0);
        }
    };

    const handleRemoveRowDim = (id: string) => {
        setRowDims(rowDims.filter(r => r !== id));
        setNeedsGeneration(true);
    };

    const handleRemoveColDim = (id: string) => {
        setColDims(colDims.filter(c => c !== id));
        setNeedsGeneration(true);
    };

    const handleRemoveMetric = (id: string) => {
        setPendingMetrics(prev => prev.filter(m => m.id !== id));
        // Also remove any pending filters referencing this metric instance
        setPendingFilters(prev => prev.filter(f => f.field !== id));
    };

    const handleRemoveFilter = (id: string) => {
        const updated = pendingFilters.filter(f => f.id !== id);
        setPendingFilters(updated);
        // Immediately apply so table reflects the removal without needing Apply Filters click
        const prevFilters = filtersRef.current;
        filtersRef.current = updated;
        setFilters(updated);
        if (getPreAggregationFilterSignature(prevFilters) !== getPreAggregationFilterSignature(updated)) {
            setTimeout(() => generateReport(undefined, undefined, updated), 0);
        }
    };

    const buildLayoutPayload = (name: string): ReportLayout => {
        const payload: any = {
            id: Math.random().toString(36).substr(2, 9),
            name,
            rowDims,
            colDims,
            metrics: pendingMetrics,
            filters: pendingFilters,
            customMetrics,
            sortRules,
            updatedAt: new Date().toISOString()
        };
        return payload as ReportLayout;
    };

    const handleSave = (nameOverride?: string) => {
        const name = (nameOverride || saveNameInput || reportName || 'My Report').trim();
        const layout = buildLayoutPayload(name);
        saveReportLayout(layout);
        setSavedLayouts(getReportLayouts());
        setReportName(name);
        setIsSaveNaming(false);
        setSaveNameInput('');
    };

    const handleSavePreset = (nameOverride?: string) => {
        if (!setCustomReportPresets) return;
        const name = (nameOverride || saveNameInput || reportName || 'Preset Template').trim();
        const layout = buildLayoutPayload(name);
        const next = [...presetLayouts, layout];
        setPresetLayouts(next);
        setCustomReportPresets(next);
        setReportName(name);
        setIsSaveNaming(false);
        setSaveNameInput('');
    };

    const handleLoadLayout = (layout: any) => {
        setRowDims(layout.rowDims || ['sku']);
        setColDims(layout.colDims || []);
        setPendingMetrics(layout.metrics || []);
        setMetrics(layout.metrics || []);
        setFilters(layout.filters || []);
        setPendingFilters(layout.filters || []);
        setCustomMetrics(layout.customMetrics || []);
        setReportName(layout.name);
        setNeedsGeneration(true);
    };

    // --- DRAG AND DROP ---
    const onDragStart = (e: React.DragEvent, id: string, type: string, sourceZone?: string) => {
        e.dataTransfer.setData('id', id);
        e.dataTransfer.setData('type', type);
        if (sourceZone) e.dataTransfer.setData('sourceZone', sourceZone);
    };

    const onDropRow = (e: React.DragEvent, targetIdx?: number) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('id');
        const type = e.dataTransfer.getData('type');
        const sourceZone = e.dataTransfer.getData('sourceZone');

        if (type === 'dim') {
            if (sourceZone === 'rows') {
                const next = [...rowDims];
                const oldIdx = next.indexOf(id);
                next.splice(oldIdx, 1);
                const insertIdx = targetIdx !== undefined ? targetIdx : next.length;
                next.splice(insertIdx, 0, id);
                setRowDims(next);
            } else {
                if (!rowDims.includes(id)) {
                    const next = [...rowDims];
                    const insertIdx = targetIdx !== undefined ? targetIdx : next.length;
                    next.splice(insertIdx, 0, id);
                    setRowDims(next);
                }
            }
            setNeedsGeneration(true);
        }
    };

    const onDropCol = (e: React.DragEvent, targetIdx?: number) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('id');
        const type = e.dataTransfer.getData('type');
        const sourceZone = e.dataTransfer.getData('sourceZone');

        if (type === 'dim') {
            if (sourceZone === 'cols') {
                const next = [...colDims];
                const oldIdx = next.indexOf(id);
                next.splice(oldIdx, 1);
                const insertIdx = targetIdx !== undefined ? targetIdx : next.length;
                next.splice(insertIdx, 0, id);
                setColDims(next);
            } else {
                if (!colDims.includes(id)) {
                    const next = [...colDims];
                    const insertIdx = targetIdx !== undefined ? targetIdx : next.length;
                    next.splice(insertIdx, 0, id);
                    setColDims(next);
                }
            }
            setNeedsGeneration(true);
        }
    };

    const onDropMetric = (e: React.DragEvent, targetIdx?: number) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('id');
        const type = e.dataTransfer.getData('type');
        const sourceZone = e.dataTransfer.getData('sourceZone');

        if (type === 'metric') {
            if (sourceZone === 'metrics') {
                setPendingMetrics(prev => {
                    const next = [...prev];
                    const oldIdx = next.findIndex(m => m.id === id);
                    if (oldIdx < 0) return prev;
                    const item = next[oldIdx];
                    next.splice(oldIdx, 1);
                    const insertIdx = targetIdx !== undefined ? targetIdx : next.length;
                    next.splice(insertIdx, 0, item);
                    return next;
                });
            } else {
                setPendingMetrics(prev => {
                    const next = [...prev];
                    const insertIdx = targetIdx !== undefined ? targetIdx : next.length;
                    next.splice(insertIdx, 0, {
                        id: Math.random().toString(36).substr(2, 9),
                        metricId: id,
                        timeRange: '30d'
                    });
                    return next;
                });
            }
        }
    };

    const onDropFilter = (e: React.DragEvent) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('id');
        const type = e.dataTransfer.getData('type');
        if (type === 'dim' || type === 'metric') {
            handleAddFilter(id, type);
        }
    };

    // --- PIVOT ENGINE ---
    const generateReport = async (overrideRowDims?: string[], overrideColDims?: string[], overrideFilters?: FilterRule[]) => {
        const effectiveRowDims = overrideRowDims || rowDims;
        const effectiveColDims = overrideColDims || colDims;

        // Commit pendingMetrics → metrics on every generate
        const committedMetrics = pendingMetrics.length > 0 ? pendingMetrics : metrics;
        setMetrics(committedMetrics);

        // Reset pending filters back to last applied (discard unapplied changes)
        setPendingFilters([...filtersRef.current]);

        const effectiveFilters = overrideFilters || filtersRef.current;

        if (effectiveRowDims.length === 0 || committedMetrics.filter(m => !m.isHidden).length === 0) return;
        setReportResult(null);  // free old result for GC before building new one
        setIsGenerating(true);

        setTimeout(() => {
            const now = new Date();

            // Helper to get start/end date keys (YYYY-MM-DD strings) for a time range
            const todayKey = getTodayKeyMelbourne(now);
            const getDates = (range: string, customStart?: string, customEnd?: string): { startKey: string | null; endKey: string } => {
                if (range === 'custom' && customStart) {
                    return {
                        startKey: customStart.slice(0, 10),
                        endKey: (customEnd || todayKey).slice(0, 10),
                    };
                }
                let startKey: string | null = null;
                if (range === '7d')  startKey = addDaysToDateKey(todayKey, -7);
                else if (range === '30d') startKey = addDaysToDateKey(todayKey, -30);
                else if (range === '90d') startKey = addDaysToDateKey(todayKey, -90);
                else if (range === 'ytd') startKey = `${now.getFullYear()}-01-01`;
                return { startKey, endKey: todayKey };
            };

            // Returns the previous equivalent period as date keys
            const getPrevDates = (range: string, customStart?: string, customEnd?: string) => {
                const { startKey, endKey } = getDates(range, customStart, customEnd);
                if (!startKey) return { prevStartKey: null, prevEndKey: null };
                // Count days in period (inclusive)
                const startMs = new Date(startKey).getTime();
                const endMs   = new Date(endKey).getTime();
                const days = Math.round((endMs - startMs) / 86400000) + 1;
                // Previous period ends the day before startKey
                const prevEndKey   = addDaysToDateKey(startKey, -1);
                const prevStartKey = addDaysToDateKey(prevEndKey, -(days - 1));
                return { prevStartKey, prevEndKey };
            };

            // 2. Create product lookup
            const productMap = new Map<string, Product>();
            products.forEach(p => productMap.set(p.sku, p));

            // 3. Aggregate
            const rowMap = new Map<string, any>();
            const colValueSets = effectiveColDims.map(() => new Set<string>());

            const dimFilters = effectiveFilters.filter(f => (
                f.type === 'dim'
                && f.field !== 'grade'
                && (effectiveColDims.includes(f.field) || !effectiveRowDims.includes(f.field))
            ));

            // Helper to process a record (Sale or Refund)
            const processRecord = (item: any, type: 'SALE' | 'REFUND') => {
                const p = productMap.get(item.sku);
                if (!p) return;

                // Apply Dimension Filters (Pre-Aggregation)
                if (dimFilters.length > 0) {
                    const pass = dimFilters.every(f => {
                        let val: any;
                        if (f.field === 'brand') val = p.brand || '';
                        else if (f.field === 'category') val = p.category || '';
                        else if (f.field === 'platform') val = item.platform || '';
                        else if (f.field === 'sku') val = item.rawSku || item.sku;
                        else val = '';

                        const targetVal = f.value;
                        if (Array.isArray(targetVal)) {
                            if (targetVal.length === 0) return true;
                            return targetVal.includes(String(val));
                        }

                        switch (f.operator) {
                            case 'equals': return String(val).toLowerCase() === String(targetVal).toLowerCase();
                            case 'contains': return String(val).toLowerCase().includes(String(targetVal).toLowerCase());
                            default: return true;
                        }
                    });
                    if (!pass) return;
                }

                const rowKeyParts = effectiveRowDims.map(dim => {
                    if (dim === 'brand') return p.brand || 'Unbranded';
                    if (dim === 'category') return p.category || 'Uncategorized';
                    if (dim === 'platform') return item.platform || 'General';
                    if (dim === 'sku') return item.rawSku || item.sku;
                    return 'Unknown';
                });
                const rowKey = rowKeyParts.join('|');

                const colKeyParts = effectiveColDims.map((dim, idx) => {
                    let val = 'Unknown';
                    if (dim === 'brand') val = p.brand || 'Unbranded';
                    else if (dim === 'category') val = p.category || 'Uncategorized';
                    else if (dim === 'platform') val = item.platform || 'General';
                    else if (dim === 'sku') val = item.rawSku || item.sku;
                    else if (dim === 'grade') {
                        const g = p.gradeLevel;
                        val = g != null ? (GRADE_LABELS[g] || `G${g}`) : 'No Grade';
                    }
                    colValueSets[idx].add(val);
                    return val;
                });
                const colKey = colKeyParts.join('|');

                if (!rowMap.has(rowKey)) {
                    rowMap.set(rowKey, {
                        rowKeyParts,
                        cells: new Map<string, any[]>(),
                        totals: [] as any[],
                        skus: new Set<string>(),
                        metadata: effectiveRowDims.reduce((acc, dim, idx) => {
                            if (dim === 'sku') {
                                const rawSku = rowKeyParts[idx];
                                let gLevel = p.gradeLevel;
                                if (gLevel === undefined || gLevel === null) {
                                    if (rawSku.includes('-A-')) gLevel = 1;
                                    else if (rawSku.includes('-B-')) gLevel = 2;
                                    else if (rawSku.includes('-C-')) gLevel = 3;
                                    else if (rawSku.includes('-D-')) gLevel = 4;
                                    else if (rawSku.includes('-E-')) gLevel = 5;
                                }
                                acc[dim] = {
                                    sku: rawSku,
                                    name: p.name,
                                    gradeLevel: gLevel
                                };
                            }
                            return acc;
                        }, {} as any)
                    });
                }
                const rowData = rowMap.get(rowKey);
                rowData.skus.add(item.sku);
                if (!rowData.cells.has(colKey)) rowData.cells.set(colKey, []);
                rowData.cells.get(colKey).push({ ...item, _type: type });
                rowData.totals.push({ ...item, _type: type });
            };

            priceHistory.forEach(log => processRecord(log, 'SALE'));
            refundHistory.forEach(log => processRecord(log, 'REFUND'));

            // 4. Build Column Headers — supports multiple column dims via cartesian product
            let colHeaders: any[] = [];
            if (effectiveColDims.length > 0) {
                // Build cartesian product of all column dimension value sets
                const dimArrays = colValueSets.map(s => Array.from(s).sort());
                const cartesian = (arrays: string[][]): string[][] => {
                    if (arrays.length === 0) return [[]];
                    return arrays.reduce<string[][]>((acc, curr) =>
                        acc.flatMap(a => curr.map(b => [...a, b])), [[]]
                    );
                };
                const combos = cartesian(dimArrays);
                colHeaders = combos.map(parts => ({
                    id: parts.join('|'),
                    label: parts.join(' · '),
                    parts,
                    metrics: metrics
                }));
            } else {
                colHeaders = [{ id: 'total', label: 'Total', metrics: metrics }];
            }

            // 5. Finalize Rows
            const finalRows = Array.from(rowMap.values()).map(row => {
                const data: any = { ...row };

                const calculateMetricValue = (items: any[], mConfig: MetricInstance, rowSkus: Set<string>) => {
                    const { startKey, endKey } = getDates(mConfig.timeRange, mConfig.startDate, mConfig.endDate);
                    const filtered = items.filter(l => {
                        const dk = asDateKey(l.date) || '';
                        return (!startKey || isDateKeyBetween(dk, startKey, endKey));
                    });

                    const ledger = aggregateTransactionLedger({
                        priceLogs: filtered.filter(l => l._type === 'SALE'),
                        refundLogs: filtered.filter(l => l._type === 'REFUND'),
                        deductRefunds: true
                    });
                    const units = ledger.totals.units;
                    const rev = ledger.totals.revenue;
                    const prof = ledger.totals.netProfit;
                    const ads = ledger.totals.adjustedAdSpend;
                    const refundQty = ledger.totals.refundUnits;
                    const refundVal = ledger.totals.refundImpact;

                    const getBaseValue = (mId: string): number => {
                        switch (mId) {
                            case 'units': return units;
                            case 'revenue': return rev;
                            case 'cogs': return filtered.filter(l => l._type === 'SALE').reduce((sum, l) => sum + (Number(l.cogs) || 0), 0);
                            case 'profit': return prof;
                            case 'ad_spend': return ads;
                            case 'margin': return ledger.totals.margin ?? 0;
                            case 'tacos': return rev > 0 ? (ads / rev) * 100 : 0;
                            case 'asp': return units > 0 ? rev / units : 0;
                            case 'roi': {
                                const cogs = rev - prof;
                                return cogs > 0 ? (prof / cogs) * 100 : 0;
                            }
                            case 'refund_rate': return units > 0 ? (refundQty / units) * 100 : 0;
                            case 'refund_value': return refundVal;
                            case 'stock': {
                                return Array.from(rowSkus).reduce((sum, sku) => {
                                    const p = productMap.get(sku);
                                    return sum + (p?.stockLevel || 0);
                                }, 0);
                            }
                            case 'runway': {
                                const totalStock = Array.from(rowSkus).reduce((sum, sku) => {
                                    const p = productMap.get(sku);
                                    return sum + (p?.stockLevel || 0);
                                }, 0);
                                const dailyVelocity = Array.from(rowSkus).reduce((sum, sku) => {
                                    const p = productMap.get(sku);
                                    return sum + (p?.averageDailySales || 0);
                                }, 0);
                                return dailyVelocity > 0 ? totalStock / dailyVelocity : 0;
                            }
                            default: {
                                // Check custom metrics
                                const custom = customMetrics.find(cm => cm.id === mId);
                                if (custom) {
                                    if (custom.formulaType === 'share_of_total') {
                                        const shareInst = committedMetrics.find(mi => mi.id === custom.shareMetric);
                                        if (shareInst) {
                                            const cellVal = calculateMetricValue(items, shareInst, rowSkus);
                                            const totalVal = calculateMetricValue(row.totals, shareInst, rowSkus);
                                            return totalVal !== 0 ? (cellVal / totalVal) * 100 : 0;
                                        }
                                        if (custom.shareMetricTime) {
                                            const tempInst: MetricInstance = { id: '__temp__', metricId: custom.shareMetric!, timeRange: custom.shareMetricTime };
                                            const cellVal = calculateMetricValue(items, tempInst, rowSkus);
                                            const totalVal = calculateMetricValue(row.totals, tempInst, rowSkus);
                                            return totalVal !== 0 ? (cellVal / totalVal) * 100 : 0;
                                        }
                                        return 0;
                                    } else {
                                        // arithmetic
                                        const resolveOperand = (instId: string, standaloneTime?: string): number => {
                                            if (standaloneTime) {
                                                const tempInst: MetricInstance = { id: '__temp__', metricId: instId, timeRange: standaloneTime };
                                                return calculateMetricValue(items, tempInst, rowSkus);
                                            }
                                            const inst = committedMetrics.find(mi => mi.id === instId);
                                            return inst ? calculateMetricValue(items, inst, rowSkus) : 0;
                                        };
                                        const valA = resolveOperand(custom.metricA, custom.metricATime);
                                        const valB = custom.metricB ? resolveOperand(custom.metricB, custom.metricBTime) : 0;
                                        switch (custom.operator) {
                                            case '+': return valA + valB;
                                            case '-': return valA - valB;
                                            case '*': return valA * valB;
                                            case '/': return valB !== 0 ? valA / valB : 0;
                                            case '%change':
                                                if (valB === 0) return valA > 0 ? 100 : 0;
                                                return ((valA - valB) / Math.abs(valB)) * 100;
                                        }
                                    }
                                }
                                return 0;
                            }
                        }
                    };

                    const currentVal = getBaseValue(mConfig.metricId);

                    // PoP: compute previous period and return % change
                    if (mConfig.isPop) {
                        const { prevStartKey, prevEndKey } = getPrevDates(mConfig.timeRange, mConfig.startDate, mConfig.endDate);
                        if (!prevStartKey) return 0;
                        const prevFiltered = items.filter(l => {
                            const dk = asDateKey(l.date) || '';
                            return isDateKeyBetween(dk, prevStartKey, prevEndKey);
                        });
                        const prevLedger = aggregateTransactionLedger({
                            priceLogs: prevFiltered.filter(l => l._type === 'SALE'),
                            refundLogs: prevFiltered.filter(l => l._type === 'REFUND'),
                            deductRefunds: true
                        });
                        const prevUnits = prevLedger.totals.units;
                        const prevRev = prevLedger.totals.revenue;
                        const prevProf = prevLedger.totals.netProfit;
                        const prevAds = prevLedger.totals.adjustedAdSpend;
                        const prevRefundQty = prevLedger.totals.refundUnits;
                        const prevRefundVal = prevLedger.totals.refundImpact;
                        const getPrevBase = (mId: string): number => {
                            switch (mId) {
                                case 'units':       return prevUnits;
                                case 'revenue':     return prevRev;
                                case 'cogs':        return prevFiltered.filter(l => l._type === 'SALE').reduce((sum, l) => sum + (Number(l.cogs) || 0), 0);
                                case 'profit':      return prevProf;
                                case 'ad_spend':    return prevAds;
                                case 'margin':      return prevLedger.totals.margin ?? 0;
                                case 'tacos':       return prevRev > 0 ? (prevAds / prevRev) * 100 : 0;
                                case 'asp':         return prevUnits > 0 ? prevRev / prevUnits : 0;
                                case 'roi':         { const cogs = prevRev - prevProf; return cogs > 0 ? (prevProf / cogs) * 100 : 0; }
                                case 'refund_rate': return prevUnits > 0 ? (prevRefundQty / prevUnits) * 100 : 0;
                                case 'refund_value':return prevRefundVal;
                                default: return 0;
                            }
                        };
                        const prevVal = getPrevBase(mConfig.metricId);
                        if (prevVal === 0 && currentVal === 0) return NaN; // both zero → renders as —
                        if (prevVal === 0) return currentVal > 0 ? 100 : -100; // rose from / dropped to zero
                        return ((currentVal - prevVal) / Math.abs(prevVal)) * 100;
                    }

                    return currentVal;
                };

                colHeaders.forEach(ch => {
                    const cellLogs = row.cells.get(ch.id) || [];
                    committedMetrics.forEach(m => {
                        data[`${ch.id}_${m.id}`] = calculateMetricValue(cellLogs, m, row.skus);
                    });
                });

                // Grand Totals
                committedMetrics.forEach(m => {
                    data[`total_${m.id}`] = calculateMetricValue(row.totals, m, row.skus);
                });

                return data;
            });

            setReportResult({
                rows: finalRows,
                colHeaders,
                rowHeaders: effectiveRowDims
            });
            setColOrder(colHeaders.map((ch: any) => ch.id));
            setIsGenerating(false);
            setNeedsGeneration(false);
        }, 100);
    };

    const processedData = useMemo(() => {
        if (!reportResult) return null;

        let rows = [...reportResult.rows];

        // Apply SKU tag search (matches against any row key part)
        if (skuSearchTags.length > 0 || skuSearchDebounced.trim()) {
            rows = rows.filter(row => {
                const keyStr = (row.rowKey || row.rowKeyParts?.join(' ') || '').toLowerCase();
                const skuMeta = row.metadata?.sku;
                const skuName = (skuMeta?.name || '').toLowerCase();
                if (skuSearchTags.length > 0) {
                    return skuSearchTags.some(tag => {
                        const t = tag.toLowerCase();
                        return keyStr.includes(t) || skuName.includes(t);
                    });
                }
                const q = skuSearchDebounced.trim().toLowerCase();
                return keyStr.includes(q) || skuName.includes(q);
            });
        }

        // Apply Filters
        if (filters.length > 0) {
            rows = rows.filter(row => {
                return filters.every(f => {
                    if (f.type === 'dim') {
                        // Grade filter — applied post-generation
                        if (f.field === 'grade') {
                            const g = row.metadata?.sku?.gradeLevel;
                            const gradeStr = g != null ? (GRADE_LABELS[g] || `G${g}`) : 'No Grade';
                            const selected = Array.isArray(f.value) ? f.value : [f.value as string];
                            return selected.length === 0 || selected.includes(gradeStr);
                        }
                        const dimIdx = reportResult.rowHeaders.indexOf(f.field);
                        if (dimIdx >= 0) {
                            const val = row.rowKeyParts?.[dimIdx] ?? '';
                            const selected = Array.isArray(f.value) ? f.value : [f.value as string];
                            return selected.length === 0 || selected.includes(String(val));
                        }
                        return true;
                    }
                    // top_n / bottom_n are handled separately below (need full row set)
                    if (f.operator === 'top_n' || f.operator === 'bottom_n') return true;
                    // f.field is the metric instance id — maps directly to total_${id}
                    const val = row[`total_${f.field}`] ?? 0;
                    const targetVal = f.value;
                    switch (f.operator) {
                        case 'gt': return Number(val) > Number(targetVal);
                        case 'lt': return Number(val) < Number(targetVal);
                        case 'equals': return Number(val) === Number(targetVal);
                        default: return true;
                    }
                });
            });
        }

        // Apply Sorting
        if (sortRules.length > 0 && reportResult) {
            rows.sort((a, b) => {
                for (const rule of sortRules) {
                    let valA: any, valB: any;
                    // Check if this is a dimension key (sku, brand, category, etc.)
                    const dimIdx = reportResult.rowHeaders.indexOf(rule.key);
                    if (dimIdx >= 0) {
                        // Sort by grade level for SKU, otherwise by string value
                        if (rule.key === 'sku') {
                            const gradeA = a.metadata?.sku?.gradeLevel ?? 99;
                            const gradeB = b.metadata?.sku?.gradeLevel ?? 99;
                            if (gradeA !== gradeB) {
                                const cmp = gradeA - gradeB;
                                if (cmp !== 0) return rule.dir === 'asc' ? cmp : -cmp;
                            }
                        } else if (rule.key === 'grade') {
                            const gradeA = a.metadata?.sku?.gradeLevel ?? 99;
                            const gradeB = b.metadata?.sku?.gradeLevel ?? 99;
                            const cmp = gradeA - gradeB;
                            if (cmp !== 0) return rule.dir === 'asc' ? cmp : -cmp;
                        }
                        valA = a.rowKeyParts?.[dimIdx] ?? '';
                        valB = b.rowKeyParts?.[dimIdx] ?? '';
                        const cmp = String(valA).localeCompare(String(valB));
                        if (cmp !== 0) return rule.dir === 'asc' ? cmp : -cmp;
                    } else {
                        valA = a[rule.key] ?? 0;
                        valB = b[rule.key] ?? 0;
                        if (valA < valB) return rule.dir === 'asc' ? -1 : 1;
                        if (valA > valB) return rule.dir === 'asc' ? 1 : -1;
                    }
                }
                return 0;
            });
        }

        // Apply Top-N / Bottom-N filters (operate on the already-filtered set)
        for (const f of filters) {
            if (f.type !== 'metric') continue;
            if (f.operator !== 'top_n' && f.operator !== 'bottom_n') continue;
            const n = Math.max(1, parseInt(String(f.value)) || 10);
            // Sort by this metric to determine top/bottom
            const sorted = [...rows].sort((a, b) => {
                const va = a[`total_${f.field}`] ?? 0;
                const vb = b[`total_${f.field}`] ?? 0;
                return vb - va; // descending
            });
            const topIds = new Set(
                f.operator === 'top_n'
                    ? sorted.slice(0, n).map(r => r.rowKeyParts?.join('|'))
                    : sorted.slice(-n).map(r => r.rowKeyParts?.join('|'))
            );
            rows = rows.filter(r => topIds.has(r.rowKeyParts?.join('|')));
        }

        return rows;
    }, [reportResult, filters, sortRules, skuSearchTags, skuSearchDebounced]);

    // ── In-cell bar chart: max value per metricId across all platform columns ──
    const metricMaxValues = useMemo(() => {
        if (!barChartEnabled || !processedData || processedData.length === 0 || !reportResult) return null;
        const maxByMetricId: Record<string, number> = {};
        processedData.forEach(row => {
            metrics.forEach(m => {
                reportResult.colHeaders.forEach((ch: any) => {
                    const val = typeof row[`${ch.id}_${m.id}`] === 'number' ? Math.abs(row[`${ch.id}_${m.id}`]) : 0;
                    if (val > (maxByMetricId[m.metricId] || 0)) maxByMetricId[m.metricId] = val;
                });
                const totalVal = typeof row[`total_${m.id}`] === 'number' ? Math.abs(row[`total_${m.id}`]) : 0;
                if (totalVal > (maxByMetricId[m.metricId] || 0)) maxByMetricId[m.metricId] = totalVal;
            });
        });
        return maxByMetricId;
    }, [barChartEnabled, processedData, reportResult, metrics]);

    const getBarStyle = (val: number, metricId: string, isPop?: boolean): React.CSSProperties | undefined => {
        if (!barChartEnabled || !metricMaxValues || isPop) return undefined;
        const absVal = Math.abs(val);
        const max = metricMaxValues[metricId];
        if (!max || max === 0 || absVal === 0) return undefined;
        const pct = Math.min(100, (absVal / max) * 100);
        const barColor = ['revenue','cogs','ad_spend','asp'].includes(metricId)
            ? 'rgba(147,197,253,0.35)'
            : ['profit','margin','roi'].includes(metricId)
                ? 'rgba(110,231,183,0.35)'
                : ['refund_rate','refund_value'].includes(metricId)
                    ? 'rgba(252,165,165,0.35)'
                    : 'rgba(209,213,219,0.30)';
        return {
            backgroundImage: `linear-gradient(to right, ${barColor} ${pct}%, transparent ${pct}%)`,
            backgroundSize: '100% 100%',
            backgroundRepeat: 'no-repeat',
        };
    };

    // ── Sticky grand total row ──────────────────────────────────────────────
    const grandTotalRow = useMemo(() => {
        if (!processedData || processedData.length === 0 || !reportResult) return null;
        const totals: Record<string, number> = {};
        processedData.forEach(row => {
            Object.entries(row).forEach(([key, val]) => {
                if (typeof val === 'number' && !key.startsWith('_') && key !== '__idx') {
                    totals[key] = (totals[key] || 0) + val;
                }
            });
        });
        // Recalculate ratio/percentage metrics from summed components
        const allPrefixes = [
            ...(reportResult?.colHeaders || []).map((ch: any) => `${ch.id}_`),
            'total_'
        ];
        allPrefixes.forEach(prefix => {
            metrics.forEach(m => {
                const key = `${prefix}${m.id}`;
                if (m.isPop) { delete totals[key]; return; }
                const findSibling = (targetId: string) => {
                    const sib = metrics.find(x => x.metricId === targetId);
                    return sib ? totals[`${prefix}${sib.id}`] : undefined;
                };
                if (m.metricId === 'margin') {
                    const profit = findSibling('profit'), rev = findSibling('revenue');
                    if (rev && rev !== 0 && profit !== undefined) totals[key] = (profit / rev) * 100; else delete totals[key];
                } else if (m.metricId === 'tacos') {
                    const ads = findSibling('ad_spend'), rev = findSibling('revenue');
                    if (rev && rev !== 0 && ads !== undefined) totals[key] = (ads / rev) * 100; else delete totals[key];
                } else if (m.metricId === 'asp') {
                    const rev = findSibling('revenue'), units = findSibling('units');
                    if (units && units !== 0 && rev !== undefined) totals[key] = rev / units; else delete totals[key];
                } else if (m.metricId === 'roi') {
                    const profit = findSibling('profit'), ads = findSibling('ad_spend');
                    if (ads && ads !== 0 && profit !== undefined) totals[key] = (profit / ads) * 100; else delete totals[key];
                } else if (m.metricId === 'refund_rate') {
                    const refVal = findSibling('refund_value'), rev = findSibling('revenue');
                    if (rev && rev !== 0 && refVal !== undefined) totals[key] = (Math.abs(refVal) / rev) * 100; else delete totals[key];
                }
            });
        });
        return totals;
    }, [processedData, reportResult, metrics]);

    // Ordered col headers — respects user drag-reorder
    const orderedColHeaders = useMemo(() => {
        if (!reportResult) return [];
        if (colOrder.length === 0) return reportResult.colHeaders;
        const map = new Map(reportResult.colHeaders.map((ch: any) => [ch.id, ch]));
        const ordered = colOrder.map((id: string) => map.get(id)).filter(Boolean);
        // append any new cols not yet in colOrder
        reportResult.colHeaders.forEach((ch: any) => { if (!colOrder.includes(ch.id)) ordered.push(ch); });
        return ordered;
    }, [reportResult, colOrder]);

    const handleColDragStart = (colId: string) => { dragColRef.current = colId; };
    const handleColDragOver = (e: React.DragEvent, colId: string) => {
        e.preventDefault();
        dragOverColRef.current = colId;
        setDragOverCol(colId);
    };
    const handleColDrop = () => {
        setDragOverCol(null);
        const from = dragColRef.current;
        const to = dragOverColRef.current;
        if (!from || !to || from === to) return;
        setColOrder(prev => {
            const order = prev.length > 0 ? [...prev] : orderedColHeaders.map((ch: any) => ch.id);
            const fromIdx = order.indexOf(from);
            const toIdx = order.indexOf(to);
            if (fromIdx < 0 || toIdx < 0) return prev;
            const next = [...order];
            next.splice(fromIdx, 1);
            next.splice(toIdx, 0, from);
            return next;
        });
        dragColRef.current = null;
        dragOverColRef.current = null;
    };

    const uniquePlatforms = useMemo(() => {
        const s = new Set<string>();
        products.forEach(p => p.channels?.forEach(ch => { if (ch.platform) s.add(ch.platform); }));
        return Array.from(s).sort();
    }, [products]);

    const getUniqueValues = (field: string) => {
        const values = new Set<string>();
        products.forEach(p => {
            if (field === 'brand') values.add(p.brand || '');
            else if (field === 'category') values.add(p.category || '');
            else if (field === 'platform') {
                p.channels?.forEach(c => values.add(c.platform));
            }
            else if (field === 'sku') values.add(p.sku);
            else if (field === 'grade') {
                const g = p.gradeLevel;
                values.add(g != null ? (GRADE_LABELS[g] || `G${g}`) : 'No Grade');
            }
        });
        return Array.from(values).filter(Boolean).sort();
    };

    const handleSort = (key: string, e?: React.MouseEvent) => {
        setSortRules(prev => {
            const existingIdx = prev.findIndex(r => r.key === key);
            if (e?.shiftKey) {
                if (existingIdx >= 0) {
                    const next = [...prev];
                    next[existingIdx].dir = next[existingIdx].dir === 'asc' ? 'desc' : 'asc';
                    return next;
                }
                return [...prev, { key, dir: 'desc' }];
            }
            if (prev.length === 1 && prev[0].key === key) {
                return [{ key, dir: prev[0].dir === 'asc' ? 'desc' : 'asc' }];
            }
            return [{ key, dir: 'desc' }];
        });
    };

    const handleExport = async (targetPlatform: string = 'All') => {
        if (!reportResult) return;
        const XLSX = await import('xlsx-js-style');

        // ── Build product name lookup ──────────────────────────────────────
        const skuNameMap = new Map<string, string>();
        products.forEach(p => skuNameMap.set(p.sku, p.name || ''));

        // ── Build alias lookup for target platform ────────────────────────
        const normalize = (s: string) => (s || '').toLowerCase().trim();
        const aliasMap = new Map<string, string>(); // masterSku → alias
        if (targetPlatform !== 'All') {
            products.forEach(p => {
                const ch = p.channels?.find(c => normalize(c.platform) === normalize(targetPlatform))
                    || p.channels?.find(c => normalize(c.platform).includes(normalize(targetPlatform)));
                const aliases = ch?.skuAlias ? ch.skuAlias.split(',').map((s: string) => s.trim()).filter(Boolean) : [];
                if (aliases.length > 0) aliasMap.set(p.sku, aliases[0]);
            });
        }

        // ── Metric type lookup for number formatting ───────────────────────
        const getMetricType = (metricId: string): string => {
            return getMetricConfig(metricId)?.type || 'number';
        };

        // ── Human-readable time range label ───────────────────────────────
        const getTimeLabel = (m: MetricInstance): string => {
            const base = m.timeRange === 'custom' && m.startDate && m.endDate
                ? `${m.startDate.slice(5)} → ${m.endDate.slice(5)}`
                : TIME_RANGES.find(t => t.id === m.timeRange)?.label || m.timeRange;
            return m.isPop ? `${base} PoP %` : base;
        };

        // ── Row 1: platform group header (merged cells) ────────────────────
        // ── Row 2: metric sub-headers ──────────────────────────────────────
        // ── Row 3+: data ──────────────────────────────────────────────────
        const hasSku = reportResult.rowHeaders.includes('sku');
        const dimHeaders = reportResult.rowHeaders.map(getDimLabel);
        // Insert "Name" column after SKU column if SKU is a row dim
        const skuIdx = reportResult.rowHeaders.indexOf('sku');

        // Build group row (row 1) and metric row (row 2)
        const groupRow: (string | null)[] = [...dimHeaders.map(() => null)];
        if (hasSku) groupRow.splice(skuIdx + 1, 0, null); // Name column placeholder
        const metricRow: string[] = [...dimHeaders];
        if (hasSku) metricRow.splice(skuIdx + 1, 0, 'Name');

        const allColGroups: { label: string; metricCount: number }[] = [];

        orderedColHeaders.forEach(ch => {
            groupRow.push(ch.label);
            metrics.forEach((m, mi) => {
                if (mi > 0) groupRow.push(null); // null = part of merged group
                metricRow.push(`${getMetricLabel(m.metricId)} | ${getTimeLabel(m)}`);
            });
            allColGroups.push({ label: ch.label, metricCount: metrics.length });
        });
        // Grand Total group
        groupRow.push('Grand Total');
        metrics.forEach((m, mi) => {
            if (mi > 0) groupRow.push(null);
            metricRow.push(`${getMetricLabel(m.metricId)} | ${getTimeLabel(m)}`);
        });
        allColGroups.push({ label: 'Grand Total', metricCount: metrics.length });

        // ── Data rows ─────────────────────────────────────────────────────
        const dataRows = (processedData || []).map(row => {
            const r: any[] = [...row.rowKeyParts];
            if (hasSku) {
                // Resolve alias for target platform if selected
                const skuVal = row.rowKeyParts[skuIdx] || '';
                if (aliasMap.has(skuVal)) r[skuIdx] = aliasMap.get(skuVal)!;
                // Insert product name after SKU
                const name = row.metadata?.sku?.name || skuNameMap.get(skuVal) || '';
                r.splice(skuIdx + 1, 0, name);
            }
            orderedColHeaders.forEach(ch => {
                metrics.forEach(m => r.push(row[`${ch.id}_${m.id}`]));
            });
            metrics.forEach(m => r.push(row[`total_${m.id}`]));
            return r;
        });

        // ── Build worksheet ───────────────────────────────────────────────
        const aoa = [groupRow, metricRow, ...dataRows];
        const ws = XLSX.utils.aoa_to_sheet(aoa);

        // ── Merge platform group header cells ─────────────────────────────
        const dimColCount = dimHeaders.length + (hasSku ? 1 : 0); // +1 for Name col
        let colCursor = dimColCount;
        if (!ws['!merges']) ws['!merges'] = [];
        allColGroups.forEach(grp => {
            if (grp.metricCount > 1) {
                ws['!merges']!.push({
                    s: { r: 0, c: colCursor },
                    e: { r: 0, c: colCursor + grp.metricCount - 1 }
                });
            }
            colCursor += grp.metricCount;
        });
        // Merge dim header cells vertically (row 1 + row 2)
        for (let c = 0; c < dimColCount; c++) {
            ws['!merges']!.push({ s: { r: 0, c }, e: { r: 1, c } });
        }

        // ── Number formatting ─────────────────────────────────────────────
        const totalCols = dimColCount + allColGroups.reduce((s, g) => s + g.metricCount, 0);
        const totalRows = aoa.length;
        // Build metric type array in column order
        const metricTypes: string[] = [];
        [...orderedColHeaders.map(() => metrics), [metrics]].flat().forEach(mArr => {
            (Array.isArray(mArr) ? mArr : [mArr]).forEach((m: MetricInstance) => {
                metricTypes.push(getMetricType(m.metricId));
            });
        });
        // Actually build flat list properly
        const flatMetricTypes: string[] = [];
        orderedColHeaders.forEach(() => metrics.forEach(m => flatMetricTypes.push(m.isPop ? 'pop' : getMetricType(m.metricId))));
        metrics.forEach(m => flatMetricTypes.push(m.isPop ? 'pop' : getMetricType(m.metricId)));

        for (let r = 2; r < totalRows; r++) {
            for (let ci = 0; ci < flatMetricTypes.length; ci++) {
                const colIdx = dimColCount + ci;
                const cellAddr = XLSX.utils.encode_cell({ r, c: colIdx });
                if (!ws[cellAddr] || ws[cellAddr].v == null) continue;
                const typ = flatMetricTypes[ci];
                if (typ === 'currency') {
                    ws[cellAddr].t = 'n';
                    ws[cellAddr].z = '£#,##0.00';
                } else if (typ === 'percent') {
                    // Values are already 0–100 scale, display as e.g. 12.3%
                    ws[cellAddr].t = 'n';
                    ws[cellAddr].z = '0.0"%"';
                } else if (typ === 'pop') {
                    // PoP % — show with sign e.g. +12.3% or -8.1%
                    ws[cellAddr].t = 'n';
                    ws[cellAddr].z = '+0.0"%";-0.0"%";0.0"%"';
                } else {
                    ws[cellAddr].t = 'n';
                    ws[cellAddr].z = '#,##0';
                }
            }
        }

        // ── Cell colours + alignment ──────────────────────────────────────
        // Colour per metric matches the on-screen table: blue=revenue/asp/ad_spend,
        // green=profit/margin/roi, red=refund_rate/refund_value, none=everything else
        const getMetricColor = (metricId: string): string | null => {
        if (['revenue', 'cogs', 'ad_spend', 'asp'].includes(metricId)) return 'DBEAFE';        // blue-100
            if (['profit', 'margin', 'roi'].includes(metricId)) return 'D1FAE5';           // green-100
            if (['refund_rate', 'refund_value'].includes(metricId)) return 'FEE2E2';       // red-100
            return null;
        };

        // Header row colours (slightly darker shade for headers)
        const getHeaderColor = (metricId: string): string | null => {
        if (['revenue', 'cogs', 'ad_spend', 'asp'].includes(metricId)) return 'BFDBFE';        // blue-200
            if (['profit', 'margin', 'roi'].includes(metricId)) return 'A7F3D0';           // green-200
            if (['refund_rate', 'refund_value'].includes(metricId)) return 'FECACA';       // red-200
            return null;
        };

        // Build flat metric id list in column order (parallel to flatMetricTypes)
        const flatMetricIds: string[] = [];
        orderedColHeaders.forEach(() => metrics.forEach(m => flatMetricIds.push(m.metricId)));
        metrics.forEach(m => flatMetricIds.push(m.metricId));

        const centerAlign = { horizontal: 'center' as const, vertical: 'middle' as const };
        const leftAlign   = { horizontal: 'left'   as const, vertical: 'middle' as const };

        // Style all cells
        for (let r = 0; r < totalRows; r++) {
            for (let ci = 0; ci < totalCols; ci++) {
                const cellAddr = XLSX.utils.encode_cell({ r, c: ci });
                if (!ws[cellAddr]) {
                    // Create empty cell so we can still style it
                    ws[cellAddr] = { t: 'z', v: undefined };
                }
                const cell = ws[cellAddr];
                const isDimCol = ci < dimColCount;
                const metricColIdx = ci - dimColCount;
                const metricId = !isDimCol ? flatMetricIds[metricColIdx] : null;

                // Alignment
                cell.s = cell.s || {};
                cell.s.alignment = isDimCol ? leftAlign : centerAlign;

                // Background colour
                if (r <= 1) {
                    // Header rows
                    const hColor = metricId ? getHeaderColor(metricId) : null;
                    if (hColor) {
                        cell.s.fill = { patternType: 'solid', fgColor: { rgb: hColor } };
                    } else if (r === 0 || r === 1) {
                        // Dim header — light grey
                        cell.s.fill = { patternType: 'solid', fgColor: { rgb: 'F3F4F6' } };
                    }
                    // Bold header text
                    cell.s.font = { bold: true, sz: 9 };
                } else {
                    // Data rows
                    const dColor = metricId ? getMetricColor(metricId) : null;
                    if (dColor) {
                        cell.s.fill = { patternType: 'solid', fgColor: { rgb: dColor } };
                    }
                    cell.s.font = { sz: 9 };
                }

                // Thin border on all cells
                const thinBorder = { style: 'thin' as const, color: { rgb: 'E5E7EB' } };
                cell.s.border = {
                    top: thinBorder, bottom: thinBorder,
                    left: thinBorder, right: thinBorder
                };
            }
        }

        // ── Column widths ─────────────────────────────────────────────────
        const colWidths: { wch: number }[] = [];
        for (let ci = 0; ci < dimColCount; ci++) {
            colWidths.push({ wch: ci === skuIdx ? 18 : ci === skuIdx + 1 && hasSku ? 32 : 14 });
        }
        flatMetricTypes.forEach(typ => {
            colWidths.push({ wch: typ === 'currency' ? 12 : (typ === 'percent' || typ === 'pop') ? 10 : 8 });
        });
        ws['!cols'] = colWidths;

        // ── Freeze panes: lock dim columns + 2 header rows ────────────────
        ws['!freeze'] = { xSplit: dimColCount, ySplit: 2 } as any;

        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Report');
        XLSX.writeFile(wb, `${reportName}.xlsx`, { cellStyles: true });
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] space-y-4 ">
            {/* Builder Panel */}
            <div className="relative z-30 bg-custom-glass rounded-xl border border-custom-glass shadow-md shrink-0 p-4" style={{backdropFilter:'var(--glass-blur)',WebkitBackdropFilter:'var(--glass-blur)'}}>

                {/* Top row: Report Builder label + name + actions */}
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                        <span className="text-[10px] font-bold uppercase tracking-widest text-gray-400">Report Builder</span>
                        <span className="text-[11px] font-semibold text-gray-900 px-2.5 py-1 rounded-lg border" style={{background:'rgba(var(--theme-rgb), 0.07)',borderColor:'rgba(var(--theme-rgb), 0.18)',color:'var(--theme)'}}>
                            {reportName || 'Untitled Report'}
                        </span>

                    </div>
                    <div className="flex items-center gap-2">
                        {/* Load template */}
                        {(savedLayouts.length > 0 || availablePresetLayouts.length > 0) && (
                            <div className="relative group">
                                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold text-gray-600 bg-white hover:bg-gray-50 shadow-sm transition-all" style={{borderColor:'rgba(209,213,219,0.8)'}}>
                                    <FolderOpen className="w-3.5 h-3.5" /> Load
                                </button>
                                <div className="absolute top-full right-0 mt-2 w-56 bg-white border border-gray-100 rounded-lg shadow-xl z-[9999] p-2 opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all">
                                    {availablePresetLayouts.length > 0 && (
                                        <>
                                            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">Preset Templates</div>
                                            {availablePresetLayouts.map(layout => (
                                                <button key={`preset-${layout.id}`} onClick={() => handleLoadLayout(layout)} className="w-full text-left px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded truncate">{layout.name}</button>
                                            ))}
                                        </>
                                    )}
                                    {savedLayouts.length > 0 && (
                                        <>
                                            {availablePresetLayouts.length > 0 && <div className="my-1 border-t border-gray-100" />}
                                            <div className="px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">My Templates</div>
                                            {savedLayouts.map(layout => (
                                                <button key={`local-${layout.id}`} onClick={() => handleLoadLayout(layout)} className="w-full text-left px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded truncate">{layout.name}</button>
                                            ))}
                                        </>
                                    )}
                                </div>
                            </div>
                        )}

                        {/* Save template — inline naming */}
                        {isSaveNaming ? (
                            <div className="flex items-center gap-1.5">
                                <input
                                    ref={saveNameRef}
                                    type="text"
                                    value={saveNameInput}
                                    onChange={e => setSaveNameInput(e.target.value)}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter') {
                                            if (saveTarget === 'preset') handleSavePreset();
                                            else handleSave();
                                        }
                                        if (e.key === 'Escape') { setIsSaveNaming(false); setSaveNameInput(''); }
                                    }}
                                    placeholder="Template name…"
                                    autoFocus
                                    className="px-2.5 py-1.5 rounded-lg border text-[11px] bg-white focus:outline-none focus:ring-1 w-36"
                                    style={{borderColor:'rgba(var(--theme-rgb),0.4)',boxShadow:'0 0 0 2px rgba(var(--theme-rgb),0.08)'}}
                                />
                                <button
                                    onClick={() => {
                                        if (saveTarget === 'preset') handleSavePreset();
                                        else handleSave();
                                    }}
                                    disabled={!saveNameInput.trim()}
                                    className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold text-white bg-theme disabled:opacity-40 transition-all"
                                >Save</button>
                                <button
                                    onClick={() => { setIsSaveNaming(false); setSaveNameInput(''); }}
                                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-all"
                                ><X className="w-3.5 h-3.5" /></button>
                            </div>
                        ) : (
                            <>
                                <button
                                    onClick={() => {
                                        setSaveTarget('local');
                                        setIsSaveNaming(true);
                                        setSaveNameInput(reportName !== 'New Custom Report' ? reportName : '');
                                    }}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold text-gray-600 bg-white hover:bg-gray-50 shadow-sm transition-all"
                                    style={{borderColor:'rgba(209,213,219,0.8)'}}
                                >
                                    <Save className="w-3.5 h-3.5" /> Save Template
                                </button>
                                {isAdminMode && (
                                    <button
                                        onClick={() => {
                                            setSaveTarget('preset');
                                            setIsSaveNaming(true);
                                            setSaveNameInput(reportName !== 'New Custom Report' ? reportName : '');
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold text-indigo-700 bg-white hover:bg-indigo-50 shadow-sm transition-all"
                                        style={{borderColor:'rgba(99,102,241,0.35)'}}
                                    >
                                        <Save className="w-3.5 h-3.5" /> Save Preset
                                    </button>
                                )}
                            </>
                        )}

                        <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">
                            All values Ex VAT
                        </span>

                        {/* Export */}
                        <div className="relative">
                            <button
                                onClick={() => { if (reportResult) setIsExportMenuOpen(v => !v); }}
                                disabled={!reportResult}
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold text-gray-600 bg-white hover:bg-gray-50 shadow-sm disabled:opacity-40 transition-all"
                                style={{borderColor:'rgba(209,213,219,0.8)'}}
                            >
                                <Download className="w-3.5 h-3.5" /> Export XLSX
                            </button>
                            {isExportMenuOpen && createPortal(
                                <>
                                    <div className="fixed inset-0 z-[9998]" onClick={() => setIsExportMenuOpen(false)} />
                                    <div className="fixed z-[9999] bg-white rounded-xl shadow-2xl w-56 overflow-hidden border border-gray-200"
                                        style={{top: 100, right: 16}}>
                                        <div className="p-2">
                                            <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Select Format</div>
                                            <button onClick={() => { handleExport('All'); setIsExportMenuOpen(false); }}
                                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg">
                                                Standard (Master SKUs)
                                            </button>
                                            <div className="my-1 border-t border-gray-100" />
                                            <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Export for Platform</div>
                                            <div className="max-h-48 overflow-y-auto">
                                                {uniquePlatforms.map(platform => (
                                                    <button key={platform} onClick={() => { handleExport(platform); setIsExportMenuOpen(false); }}
                                                        className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between rounded-lg">
                                                        <span>{platform}</span>
                                                        <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded">Alias Mode</span>
                                                    </button>
                                                ))}
                                                {uniquePlatforms.length === 0 && (
                                                    <div className="px-4 py-2 text-xs text-gray-400 italic">No platforms detected</div>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </>,
                                document.body
                            )}
                        </div>

                        {/* Bar chart toggle */}
                        <button
                            onClick={() => setBarChartEnabled(v => !v)}
                            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-[11px] font-bold shadow-sm transition-all ${barChartEnabled ? 'bg-theme-10 text-theme border-theme-20' : 'text-gray-400 bg-white border-gray-200 hover:bg-gray-50'}`}
                            title={barChartEnabled ? 'Hide in-cell bar charts' : 'Show in-cell bar charts'}
                        >
                            <BarChart3 className="w-3.5 h-3.5" />
                        </button>

                        {/* Collapse */}
                        <button
                            onClick={() => setShowBuilder(!showBuilder)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[11px] font-bold text-gray-600 bg-white hover:bg-gray-50 shadow-sm transition-all"
                            style={{borderColor:'rgba(209,213,219,0.8)'}}
                        >
                            {showBuilder
                                ? <><ChevronDown className="w-3.5 h-3.5 rotate-180" /> Collapse</>
                                : <><ChevronDown className="w-3.5 h-3.5" /> Expand</>
                            }
                        </button>

                        {/* Generate — primary action, always far right */}
                        <button
                            onClick={() => generateReport()}
                            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-[11px] font-bold shadow-sm transition-all ${
                                (() => {
                                    const needsNewGenerate = pendingMetrics.length !== metrics.length ||
                                        pendingMetrics.some((m, i) => metrics[i]?.id !== m.id || metrics[i]?.timeRange !== m.timeRange);
                                    return needsNewGenerate
                                        ? 'bg-amber-500 text-white hover:bg-amber-600 animate-pulse'
                                        : needsGeneration
                                            ? 'bg-theme text-white hover:bg-theme'
                                            : 'bg-gray-100 text-gray-400 cursor-not-allowed';
                                })()
                            }`}
                        >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            {reportResult ? 'Up to date' : 'Generate Report'}
                        </button>
                    </div>
                </div>

                {/* Builder grid */}
                {showBuilder && (
                <div className="grid gap-4" style={{gridTemplateColumns:'400px 1fr 300px'}}>

                    {/* LEFT: palette */}
                    <div className="pr-4" style={{borderRight:'1px solid var(--glass-divider)'}}>
                        {/* Dimensions */}
                        <div className="text-[9.5px] font-bold uppercase tracking-widest mb-2" style={{color:'var(--c-dim,#9ca3af)'}}>Dimensions</div>
                        <div className="flex flex-wrap gap-1.5 mb-4">
                            {DIMENSIONS.map(dim => {
                                const inUse = rowDims.includes(dim.id) || colDims.includes(dim.id);
                                return (
                                    <div
                                        key={dim.id}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, dim.id, 'dim')}
                                        onClick={() => { if (!rowDims.includes(dim.id)) setRowDims(prev => [...prev, dim.id]); }}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg border text-[10px] font-bold cursor-grab active:cursor-grabbing transition-all"
                                        style={inUse
                                            ? {background:'rgba(var(--theme-rgb), 0.08)',borderColor:'rgba(var(--theme-rgb), 0.2)',color:'var(--theme)'}
                                            : {background:'rgba(255,255,255,0.6)',borderColor:'rgba(209,213,219,0.7)',color:'#374151'}}
                                    >
                                        <dim.icon className="w-2.5 h-2.5" style={{opacity:0.6}} />
                                        {dim.label}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Metrics */}
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-[9.5px] font-bold uppercase tracking-widest" style={{color:'var(--c-dim,#9ca3af)'}}>Metrics</div>
                            <button onClick={() => setIsCustomMetricModalOpen(true)} className="text-emerald-600 hover:bg-emerald-50 p-0.5 rounded"><Plus className="w-3 h-3" /></button>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto">
                            {METRICS.map(metric => {
                                const inUse = pendingMetrics.some(m => m.metricId === metric.id);
                                const isRed = ['refund_rate','refund_value'].includes(metric.id);
                    const isGreen = ['revenue','cogs','profit','margin','roi'].includes(metric.id);
                                return (
                                    <div
                                        key={metric.id}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, metric.id, 'metric')}
                                        onClick={() => handleAddMetric(metric.id)}
                                        className="px-2 py-1 rounded-lg border text-[10px] font-bold cursor-grab active:cursor-grabbing transition-all"
                                        style={inUse
                                            ? (isRed ? {background:'rgba(254,242,242,0.9)',borderColor:'rgba(220,38,38,0.25)',color:'#b91c1c'} : {background:'rgba(236,253,245,0.9)',borderColor:'rgba(5,150,105,0.25)',color:'#047857'})
                                            : (isRed ? {background:'rgba(254,242,242,0.6)',borderColor:'rgba(220,38,38,0.15)',color:'#dc2626'} : isGreen ? {background:'rgba(236,253,245,0.6)',borderColor:'rgba(5,150,105,0.18)',color:'#059669'} : {background:'rgba(255,255,255,0.6)',borderColor:'rgba(209,213,219,0.7)',color:'#6b7280'})}
                                    >
                                        {metric.label}
                                    </div>
                                );
                            })}
                            {customMetrics.map(metric => (
                                <div
                                    key={metric.id}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, metric.id, 'metric')}
                                    onClick={() => handleAddMetric(metric.id)}
                                    className="px-2 py-1 rounded-lg text-[10px] font-bold cursor-grab transition-all"
                                    style={{background:'rgba(236,253,245,0.6)',borderColor:'rgba(5,150,105,0.18)',border:'1px solid',color:'#047857'}}
                                >
                                    <Calculator className="w-2.5 h-2.5 inline mr-1 opacity-60" />{metric.label}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* MIDDLE: axes */}
                    <div className="flex flex-col gap-2">

                        {/* Rows */}
                        <div>
                            <div className="text-[9.5px] font-bold uppercase tracking-widest mb-1.5" style={{color:'var(--c-dim,#9ca3af)'}}>Rows</div>
                            <div
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDropRow(e)}
                                className="flex items-center flex-wrap gap-2 px-2.5 py-2 rounded-xl min-h-[38px]"
                                style={{border:'1.5px dashed rgba(var(--theme-rgb), 0.25)',background:'rgba(var(--theme-rgb), 0.03)'}}
                            >
                                {rowDims.map((id, idx) => (
                                    <div
                                        key={id}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, id, 'dim', 'rows')}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => { e.stopPropagation(); onDropRow(e, idx); }}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold cursor-move"
                                        style={{background:'rgba(var(--theme-rgb), 0.08)',border:'1px solid rgba(var(--theme-rgb), 0.2)',color:'var(--theme)'}}
                                    >
                                        {(() => { const d = DIMENSIONS.find(x => x.id === id); return d ? <d.icon className="w-2.5 h-2.5 opacity-60" /> : null; })()}
                                        {getDimLabel(id)}
                                        <button onClick={() => handleRemoveRowDim(id)} className="opacity-40 hover:opacity-100 ml-0.5"><X className="w-2.5 h-2.5" /></button>
                                    </div>
                                ))}
                                {rowDims.length === 0 && <span className="text-[10px] italic" style={{color:'rgba(156,163,175,0.8)'}}>Drop dimensions here…</span>}
                            </div>
                        </div>

                        {/* Columns */}
                        <div>
                            <div className="text-[9.5px] font-bold uppercase tracking-widest mb-1.5" style={{color:'var(--c-dim,#9ca3af)'}}>Columns</div>
                            <div
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDropCol(e)}
                                className="flex items-center flex-wrap gap-2 px-2.5 py-2 rounded-xl min-h-[38px]"
                                style={{border:'1.5px dashed rgba(var(--theme-rgb), 0.25)',background:'rgba(var(--theme-rgb), 0.03)'}}
                            >
                                {colDims.map((id, idx) => (
                                    <div
                                        key={id}
                                        draggable
                                        onDragStart={(e) => onDragStart(e, id, 'dim', 'cols')}
                                        onDragOver={(e) => e.preventDefault()}
                                        onDrop={(e) => { e.stopPropagation(); onDropCol(e, idx); }}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold cursor-move"
                                        style={{background:'rgba(var(--theme-rgb), 0.08)',border:'1px solid rgba(var(--theme-rgb), 0.2)',color:'var(--theme)'}}
                                    >
                                        {(() => { const d = DIMENSIONS.find(x => x.id === id); return d ? <d.icon className="w-2.5 h-2.5 opacity-60" /> : null; })()}
                                        {getDimLabel(id)}
                                        <button onClick={() => handleRemoveColDim(id)} className="opacity-40 hover:opacity-100 ml-0.5"><X className="w-2.5 h-2.5" /></button>
                                    </div>
                                ))}
                                {colDims.length === 0 && <span className="text-[10px] italic" style={{color:'rgba(156,163,175,0.8)'}}>Drop dimensions here…</span>}
                                {colDims.length > 0 && (
                                    <button
                                        onClick={handleSwapDims}
                                        className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold transition-all"
                                        style={{background:'white',border:'1px solid rgba(209,213,219,0.6)',color:'#6b7280'}}
                                    >
                                        <ArrowLeftRight className="w-2.5 h-2.5" /> Swap
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Values */}
                        <div>
                            <div className="text-[9.5px] font-bold uppercase tracking-widest mb-1.5" style={{color:'var(--c-dim,#9ca3af)'}}>
                                Values
                                {pendingMetrics.length > 0 && <span className="ml-1 text-[9px] font-normal normal-case" style={{color:'var(--c-dim,#9ca3af)'}}>({pendingMetrics[0]?.timeRange === pendingMetrics[pendingMetrics.length-1]?.timeRange ? `Last ${pendingMetrics[0]?.timeRange}` : 'mixed range'})</span>}
                            </div>
                            <div
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDropMetric(e)}
                                className="flex items-center flex-wrap gap-2 px-2.5 py-2 rounded-xl min-h-[38px]"
                                style={{border:'1.5px dashed rgba(5,150,105,0.2)',background:'rgba(5,150,105,0.02)'}}
                            >
                                {pendingMetrics.map((m, idx) => {
                                    const isRed = ['refund_rate','refund_value'].includes(m.metricId);
                                    const chipStyle = isRed
                                        ? {background:'rgba(254,242,242,0.9)',border:'1px solid rgba(220,38,38,0.2)',color:'#b91c1c'}
                                        : {background:'rgba(236,253,245,0.9)',border:'1px solid rgba(5,150,105,0.25)',color:'#047857'};
                                    return (
                                        <div
                                            key={m.id}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, m.id, 'metric', 'metrics')}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => { e.stopPropagation(); onDropMetric(e, idx); }}
                                            className="relative flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold cursor-move"
                                            style={chipStyle}
                                        >
                                            {getMetricLabel(m.metricId)}
                                            <button
                                                onClick={(e) => {
                                                    if (activePopover === m.id) { setActivePopover(null); return; }
                                                    const r = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                                                    setPopoverPos({ top: r.bottom + 4, left: r.left });
                                                    setActivePopover(m.id);
                                                }}
                                                className="text-[9px] font-bold opacity-60 hover:opacity-100 transition-opacity px-1 py-0.5 rounded bg-black/10"
                                            >{m.timeRange === 'custom' && m.startDate && m.endDate
                                                ? `${m.startDate.slice(5)} → ${m.endDate.slice(5)}`
                                                : TIME_RANGES.find(t => t.id === m.timeRange)?.label || m.timeRange
                                            }{m.isPop ? ' PoP' : ''}</button>
                                            <button onClick={() => handleRemoveMetric(m.id)} className="opacity-40 hover:opacity-100 ml-0.5"><X className="w-2.5 h-2.5" /></button>

                                            {activePopover === m.id && createPortal(
                                                <>
                                                    <div className="fixed inset-0 z-[9998]" onClick={() => setActivePopover(null)} />
                                                    <div className="fixed w-44 bg-white border border-gray-100 rounded-lg shadow-xl z-[9999] p-2" style={{top: popoverPos.top, left: popoverPos.left}}>
                                                        <div className="space-y-1">
                                                            {TIME_RANGES.map(tr => (
                                                                <button
                                                                    key={tr.id}
                                                                    onClick={(e) => {
                                                                        e.stopPropagation();
                                                                        setPendingMetrics(prev => { const next=[...prev]; next[idx]={...next[idx],timeRange:tr.id}; return next; });
                                                                        if (tr.id !== 'custom') setActivePopover(null);
                                                                    }}
                                                                    className={`w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors ${m.timeRange === tr.id ? 'bg-theme-10 text-theme font-bold' : 'text-gray-600 hover:bg-gray-50'}`}
                                                                >{tr.label}</button>
                                                            ))}
                                                        </div>
                                                        {m.timeRange === 'custom' && (
                                                            <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
                                                                <input type="date" value={m.startDate||''} onChange={(e) => { e.stopPropagation(); setPendingMetrics(prev => { const next=[...prev]; next[idx]={...next[idx],startDate:e.target.value}; return next; }); }} className="w-full text-[9px] p-1 border border-gray-200 rounded" />
                                                                <input type="date" value={m.endDate||''} onChange={(e) => { e.stopPropagation(); setPendingMetrics(prev => { const next=[...prev]; next[idx]={...next[idx],endDate:e.target.value}; return next; }); }} className="w-full text-[9px] p-1 border border-gray-200 rounded" />
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); setActivePopover(null); }}
                                                                    className="w-full py-1 bg-theme text-white text-[10px] font-bold rounded-md"
                                                                >Done</button>
                                                            </div>
                                                        )}
                                                        <div className="mt-2 pt-2 border-t border-gray-100">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); setPendingMetrics(prev => { const next=[...prev]; next[idx]={...next[idx],isPop:!next[idx].isPop}; return next; }); }}
                                                                className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-[10px] font-bold transition-colors ${m.isPop ? 'bg-theme-10 text-theme' : 'text-gray-500 hover:bg-gray-50'}`}
                                                            >
                                                                <span>Period over Period</span>
                                                                <span className={`w-3.5 h-3.5 rounded-full border flex-shrink-0 ${m.isPop ? 'bg-theme border-theme' : 'border-gray-300'}`} />
                                                            </button>
                                                            {m.isPop && <p className="text-[9px] text-gray-400 mt-1 px-1">Shows % change vs the previous equivalent period</p>}
                                                        </div>
                                                    </div>
                                                </>,
                                                document.body
                                            )}
                                        </div>
                                    );
                                })}
                                <button
                                    onClick={() => setIsCustomMetricModalOpen(true)}
                                    className="px-2 py-1 rounded-lg text-[10px] font-bold transition-all"
                                    style={{border:'1px dashed rgba(5,150,105,0.3)',background:'transparent',color:'#059669'}}
                                >+ Add metric</button>
                                {pendingMetrics.length === 0 && <span className="text-[10px] italic" style={{color:'rgba(156,163,175,0.8)'}}>Drop metrics here…</span>}
                            </div>
                        </div>
                    </div>

                    {/* RIGHT: filters */}
                    <div className="pl-4" style={{borderLeft:'1px solid var(--glass-divider)'}}>
                        <div className="text-[9.5px] font-bold uppercase tracking-widest mb-2" style={{color:'var(--c-dim,#9ca3af)'}}>Filters</div>
                        <div className="flex flex-col gap-2">

                            {/* Applied filter cards */}
                            {pendingFilters.map((f, idx) => (
                                <div key={f.id} className="px-3 py-2 rounded-lg text-[10px]" style={{border:'1px solid rgba(209,213,219,0.6)',background:'rgba(249,250,251,0.8)'}}>
                                    <div className="text-[9px] font-bold uppercase tracking-wide mb-1.5" style={{color:'var(--c-dim,#9ca3af)'}}>
                                        {f.type === 'dim' ? getDimLabel(f.field) : (() => { const inst = metrics.find(m => m.id === f.field); return inst ? `${getMetricLabel(inst.metricId)} (${inst.timeRange})` : f.field; })()}
                                    </div>
                                    {f.type === 'dim' ? (
                                        <MultiSelectDropdown
                                            label={getDimLabel(f.field)}
                                            icon={DIMENSIONS.find(d => d.id === f.field)?.icon}
                                            selected={Array.isArray(f.value) ? f.value : []}
                                            onChange={(newVal: string[]) => setPendingFilters(prev => prev.map((pf, i) => i === idx ? { ...pf, value: newVal } : pf))}
                                            options={getUniqueValues(f.field)}
                                        />
                                    ) : (
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <select
                                                value={f.operator}
                                                onChange={(e) => setPendingFilters(prev => prev.map((pf, i) => i === idx ? { ...pf, operator: e.target.value as any, value: '' } : pf))}
                                                className="text-[10px] border rounded px-1 py-0.5 bg-white focus:ring-0"
                                                style={{borderColor:'rgba(209,213,219,0.7)'}}
                                            >
                                                <option value="gt">&gt; Greater than</option>
                                                <option value="lt">&lt; Less than</option>
                                                <option value="equals">= Equals</option>
                                                <option value="top_n">↑ Top N</option>
                                                <option value="bottom_n">↓ Bottom N</option>
                                            </select>
                                            <input
                                                type="number"
                                                value={f.value as string}
                                                onChange={(e) => setPendingFilters(prev => prev.map((pf, i) => i === idx ? { ...pf, value: e.target.value } : pf))}
                                                placeholder={f.operator === 'top_n' || f.operator === 'bottom_n' ? 'N…' : 'Value…'}
                                                className="text-[10px] border rounded px-1.5 py-0.5 w-14 bg-white focus:ring-0"
                                                style={{borderColor:'rgba(209,213,219,0.7)'}}
                                                min="1"
                                            />
                                            {(f.operator === 'top_n' || f.operator === 'bottom_n') && f.value && (
                                                <span className="text-[10px] font-bold text-theme">
                                                    {f.operator === 'top_n' ? '↑' : '↓'} {f.value}
                                                </span>
                                            )}
                                            <button onClick={() => handleRemoveFilter(f.id)} className="ml-auto opacity-40 hover:opacity-100"><X className="w-3 h-3" /></button>
                                        </div>
                                    )}
                                    {f.type === 'dim' && (
                                        <button onClick={() => handleRemoveFilter(f.id)} className="mt-1 opacity-30 hover:opacity-80 float-right"><X className="w-3 h-3" /></button>
                                    )}
                                </div>
                            ))}

                            {/* Add filter button */}
                            <div className="relative z-30">
                                <button
                                    onClick={() => setIsFilterMenuOpen(v => !v)}
                                    className="w-full text-left px-3 py-2 rounded-lg text-[10px] font-bold transition-all"
                                    style={{border:'1px dashed rgba(209,213,219,0.8)',background:'transparent',color:'#6b7280'}}
                                >+ Add filter</button>
                                {isFilterMenuOpen && (
                                    <>
                                        <div className="fixed inset-0 z-[9998]" onClick={() => setIsFilterMenuOpen(false)} />
                                        <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-100 rounded-lg shadow-xl z-[9999] p-2">
                                            <div className="text-[9px] font-bold text-gray-400 uppercase mb-1 px-2">Dimensions</div>
                                            {[...DIMENSIONS, ...FILTER_ONLY_DIMS].map(d => (
                                                <button key={d.id} onClick={() => { handleAddFilter(d.id, 'dim'); setIsFilterMenuOpen(false); }} className="w-full text-left px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-50 rounded">{d.label}</button>
                                            ))}
                                            {reportResult && metrics.length > 0 && (
                                                <>
                                                    <div className="border-t border-gray-100 my-1"></div>
                                                    <div className="text-[9px] font-bold text-gray-400 uppercase mb-1 px-2">Metrics</div>
                                                    {metrics.filter(m => !m.isHidden).map(m => (
                                                        <button key={m.id} onClick={() => { handleAddFilter(m.id, 'metric'); setIsFilterMenuOpen(false); }} className="w-full text-left px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-50 rounded">
                                                            {getMetricLabel(m.metricId)} ({m.timeRange === 'custom' && m.startDate && m.endDate ? `${m.startDate.slice(5)} → ${m.endDate.slice(5)}` : TIME_RANGES.find(t => t.id === m.timeRange)?.label || m.timeRange})
                                                        </button>
                                                    ))}
                                                </>
                                            )}
                                        </div>
                                    </>
                                )}
                            </div>

                            {/* Apply filters */}
                            {pendingFilters.length > 0 && JSON.stringify(pendingFilters) !== JSON.stringify(filters) && (
                                <button
                                    onClick={applyFilters}
                                    className="w-full py-1.5 rounded-lg text-[10px] font-bold text-white transition-all"
                                    style={{background:'var(--theme)'}}
                                >Apply Filters</button>
                            )}

                            {/* Time window */}
                           {/* <div className="mt-1">
                                <select className="w-full text-[10px] rounded-lg px-2 py-1.5 bg-white font-medium" style={{border:'1px solid rgba(209,213,219,0.7)',color:'#374151',fontFamily:'inherit'}}>
                                    <option>Last 30 Days</option>
                                    <option>Last 7 Days</option>
                                    <option>Last 90 Days</option>
                                    <option>YTD</option>
                                </select>
                            </div>*/}
                        </div>
                    </div>

                </div>
                )}
            </div>

            {/* Table Container */}
            <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col relative">
                {needsGeneration && !isGenerating && !reportResult && (
                    <div className="absolute inset-0 z-30 bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
                        <button
                            onClick={() => generateReport()}
                            className="flex items-center gap-3 px-10 py-5 bg-theme text-white rounded-2xl font-bold shadow-2xl hover:bg-theme hover:scale-105 transition-all "
                        >
                            <Play className="w-6 h-6 fill-current" />
                            Generate Pivot Report
                        </button>
                    </div>
                )}

                {isGenerating && (
                    <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="w-12 h-12 text-theme animate-spin" />
                        <p className="text-lg font-bold text-gray-900">Crunching Data...</p>
                        <p className="text-xs text-gray-400">Aggregating dimensions and calculating metrics</p>
                    </div>
                )}

                {/* Reorder Columns Panel */}
                {isReorderOpen && orderedColHeaders.length > 0 && (
                    <div className="absolute inset-y-0 right-0 z-40 w-64 bg-white border-l border-gray-200 shadow-2xl flex flex-col">
                        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
                            <span className="text-xs font-bold text-gray-700 uppercase tracking-wide">Reorder Columns</span>
                            <button onClick={() => setIsReorderOpen(false)} className="p-1 hover:bg-gray-100 rounded">
                                <X className="w-4 h-4 text-gray-400" />
                            </button>
                        </div>
                        <div className="flex-1 overflow-y-auto p-3 space-y-1">
                            {draftOrder.map((colId, idx) => {
                                const ch = orderedColHeaders.find((c: any) => c.id === colId);
                                if (!ch) return null;
                                const hex = getPlatformHex(ch.label, pricingRules);
                                const isDragOver = dragPanelOver === idx;
                                return (
                                    <div
                                        key={colId}
                                        draggable
                                        onDragStart={() => { dragPanelIdx.current = idx; }}
                                        onDragOver={(e) => { e.preventDefault(); setDragPanelOver(idx); }}
                                        onDragLeave={() => setDragPanelOver(null)}
                                        onDrop={() => {
                                            const from = dragPanelIdx.current;
                                            if (from === null || from === idx) { setDragPanelOver(null); return; }
                                            setDraftOrder(prev => {
                                                const next = [...prev];
                                                const [moved] = next.splice(from, 1);
                                                next.splice(idx, 0, moved);
                                                return next;
                                            });
                                            dragPanelIdx.current = null;
                                            setDragPanelOver(null);
                                        }}
                                        onDragEnd={() => { dragPanelIdx.current = null; setDragPanelOver(null); }}
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-all cursor-grab active:cursor-grabbing ${isDragOver ? 'bg-theme-10 border-theme-20 scale-[1.02]' : 'bg-gray-50 border-gray-100'}`}
                                    >
                                        <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                                        <span style={platformBadgeStyle(hex)} className="flex-1 text-[11px] truncate">{ch.label}</span>
                                        <button
                                            disabled={idx === 0}
                                            onClick={() => setDraftOrder(prev => {
                                                const next = [...prev];
                                                [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                                                return next;
                                            })}
                                            className="p-1 rounded hover:bg-theme-10 disabled:opacity-20 disabled:cursor-not-allowed"
                                        >
                                            <ArrowUp className="w-3.5 h-3.5 text-theme" />
                                        </button>
                                        <button
                                            disabled={idx === draftOrder.length - 1}
                                            onClick={() => setDraftOrder(prev => {
                                                const next = [...prev];
                                                [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                                                return next;
                                            })}
                                            className="p-1 rounded hover:bg-theme-10 disabled:opacity-20 disabled:cursor-not-allowed"
                                        >
                                            <ArrowDown className="w-3.5 h-3.5 text-theme" />
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                        <div className="px-4 py-3 border-t border-gray-100 flex flex-col gap-2">
                            <button
                                onClick={() => { setColOrder([...draftOrder]); setIsReorderOpen(false); }}
                                className="w-full py-1.5 bg-theme text-white text-[11px] font-bold rounded-lg hover:bg-theme transition-colors"
                            >
                                Apply Order
                            </button>
                            <button
                                onClick={() => { setDraftOrder(orderedColHeaders.map((c: any) => c.id)); setColOrder([]); }}
                                className="w-full text-[10px] text-gray-400 hover:text-red-500 transition-colors"
                            >
                                Reset to default
                            </button>
                        </div>
                    </div>
                )}

                <div className="flex-1 overflow-auto" ref={tableScrollRef}>
                    {!reportResult ? (
                        <div className="h-full flex flex-col items-center justify-center text-gray-400 space-y-4 p-12 text-center">
                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center">
                                <Layout className="w-10 h-10 opacity-20" />
                            </div>
                            <div>
                                <p className="text-xl font-bold text-gray-900">Build your view</p>
                                <p className="text-sm max-w-[320px] mt-2">Drag dimensions to rows/columns and metrics to values to start your analysis.</p>
                            </div>
                        </div>
                    ) : (
                        <>
                        <table className="sello-table">
                            <thead className="sticky top-0 z-20">
                                <tr>
                                    {reportResult.rowHeaders.map((rh, idx) => (
                                        <th key={rh} rowSpan={2} className="pin truncate" style={{ left: idx === 0 ? 0 : 220 + (idx - 1) * 160, width: idx === 0 ? 220 : 160, minWidth: idx === 0 ? 220 : 160, maxWidth: idx === 0 ? 220 : 160, cursor: 'pointer', background: 'rgba(248,250,252,0.98)' }}
                                            onClick={() => handleSort(rh)}
                                        >
                                            <div className="flex items-center justify-between w-full">
                                                <div className="flex items-center gap-1.5">
                                                    <span className="truncate">{getDimLabel(rh)}</span>
                                                    {sortRules[0]?.key === rh
                                                        ? (sortRules[0].dir === 'asc'
                                                            ? <ArrowUp className="w-2.5 h-2.5 text-theme flex-shrink-0" />
                                                            : <ArrowDown className="w-2.5 h-2.5 text-theme flex-shrink-0" />)
                                                        : <ArrowDown className="w-2.5 h-2.5 text-gray-300 flex-shrink-0" />
                                                    }
                                                </div>
                                                {idx === 0 && (
                                                    <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                                        <SortPriorityDropdown
                                                            sortRules={sortRules}
                                                            setSortRules={setSortRules}
                                                            getSortKeyLabel={getSortKeyLabel}
                                                            disabled={!reportResult}
                                                            iconOnly
                                                        />
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleSwapDims(); }}
                                                            disabled={colDims.length > 1 || rowDims.length > 1}
                                                            className="p-1.5 bg-white hover:bg-theme-10 text-gray-400 hover:text-theme rounded-md transition-all shadow-sm border border-gray-200 hover:border-theme-20 group disabled:opacity-30 disabled:cursor-not-allowed"
                                                            title={colDims.length > 1 || rowDims.length > 1 ? "Swap only works with single row and column dimensions" : "Swap Rows/Columns"}
                                                        >
                                                            <ArrowLeftRight className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                                                        </button>
                                                        {orderedColHeaders.length > 1 && (
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); if (!isReorderOpen) { setDraftOrder(colOrder.length > 0 ? [...colOrder] : orderedColHeaders.map((c: any) => c.id)); } setIsReorderOpen(v => !v); }}
                                                                title="Reorder columns"
                                                                className={`p-1.5 rounded-md transition-all shadow-sm border ${isReorderOpen ? 'bg-theme-10 text-theme border-theme-20' : 'bg-white text-gray-400 hover:text-theme hover:bg-theme-10 border-gray-200 hover:border-theme-20'}`}
                                                            >
                                                                <GripVertical className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </th>
                                    ))}
                                    {orderedColHeaders.map((ch: any, chIdx: number) => {
                                        const hex = getPlatformHex(ch.label, pricingRules);
                                        return (
                                            <th
                                                key={ch.id}
                                                colSpan={metrics.length}
                                                className="c"
                                                draggable
                                                onDragStart={() => handleColDragStart(ch.id)}
                                                onDragOver={e => handleColDragOver(e, ch.id)}
                                                onDragLeave={() => setDragOverCol(null)}
                                                onDrop={handleColDrop}
                                                style={{ borderLeft: dragOverCol === ch.id ? '2px solid var(--theme)' : '2px solid rgba(209,213,219,0.7)', borderBottom: '1px solid var(--glass-divider)', padding: '12px 14px', cursor: 'grab', userSelect: 'none', opacity: dragColRef.current === ch.id ? 0.4 : 1, transition: 'border-color 0.1s' }}
                                            >
                                                <span style={platformBadgeStyle(hex)}>{ch.label}</span>
                                            </th>
                                        );
                                    })}
                                    {orderedColHeaders.length > 1 && (
                                        <th colSpan={metrics.length} className="c" style={{ borderLeft: '2px solid rgba(var(--theme-rgb), 0.15)', borderBottom: '1px solid var(--glass-divider)', padding: '6px 14px', color: 'var(--theme)', fontWeight: 800 }}>
                                            <div className="flex items-center gap-2">
                                                <span>Grand Total</span>
                                            </div>
                                        </th>
                                    )}
                                </tr>
                                <tr>
                                    {orderedColHeaders.map((ch: any, chIdx: number) => (
                                        metrics.map((m, mIdx) => {
                                    const colClass = m.metricId === 'revenue' || m.metricId === 'cogs' || m.metricId === 'ad_spend' || m.metricId === 'asp' ? 'cb'
                                                : m.metricId === 'profit' || m.metricId === 'margin' || m.metricId === 'roi' ? 'cg'
                                                : m.metricId === 'refund_rate' || m.metricId === 'refund_value' ? 'cr'
                                                : '';
                                            const isSorted = sortRules[0]?.key === `${ch.id}_${m.id}`;
                                            return (
                                                <th
                                                    key={`${ch.id}_${m.id}`}
                                                    onClick={(e) => handleSort(`${ch.id}_${m.id}`, e)}
                                                    className={`r metric-sub ${colClass} ${isSorted ? 'sorted' : ''}`}
                                                    style={{ borderLeft: mIdx === 0 ? '2px solid rgba(209,213,219,0.7)' : undefined, minWidth: 80 }}
                                                >
                                                    <div className="sw r" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                            <span>{getMetricLabel(m.metricId)}</span>
                                                            <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                                {isSorted && sortRules[0].dir === 'asc'
                                                                    ? <path d="M5 12l7-7 7 7"/>
                                                                    : <path d="M7 15l5 5 5-5M7 9l5-5 5 5"/>}
                                                            </svg>
                                                        </div>
                                                        <span style={{ fontSize: 8, opacity: 0.4, lineHeight: 1 }}>{m.isPop ? `${TIME_RANGES.find(t => t.id === m.timeRange)?.label || m.timeRange} PoP %` : m.timeRange === 'custom' && m.startDate && m.endDate ? `${m.startDate.slice(5)} → ${m.endDate.slice(5)}` : TIME_RANGES.find(t => t.id === m.timeRange)?.label || m.timeRange}</span>
                                                    </div>
                                                </th>
                                            );
                                        })
                                    ))}
                                    {orderedColHeaders.length > 1 && metrics.map((m, mIdx) => {
                                const colClass = m.metricId === 'revenue' || m.metricId === 'cogs' || m.metricId === 'ad_spend' || m.metricId === 'asp' ? 'cb'
                                            : m.metricId === 'profit' || m.metricId === 'margin' || m.metricId === 'roi' ? 'cg'
                                            : m.metricId === 'refund_rate' || m.metricId === 'refund_value' ? 'cr'
                                            : '';
                                        const isSorted = sortRules[0]?.key === `total_${m.id}`;
                                        return (
                                            <th
                                                key={`total_${m.id}`}
                                                onClick={(e) => handleSort(`total_${m.id}`, e)}
                                                className={`r metric-sub ${colClass} ${isSorted ? 'sorted' : ''}`}
                                                style={{ borderLeft: mIdx === 0 ? '2px solid rgba(var(--theme-rgb), 0.15)' : undefined, minWidth: 80 }}
                                            >
                                                <div className="sw r" style={{ flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                                        <span>{getMetricLabel(m.metricId)}</span>
                                                        <svg className="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                                            {isSorted && sortRules[0].dir === 'asc'
                                                                ? <path d="M5 12l7-7 7 7"/>
                                                                : <path d="M7 15l5 5 5-5M7 9l5-5 5 5"/>}
                                                        </svg>
                                                    </div>
                                                    <span style={{ fontSize: 8, opacity: 0.4, lineHeight: 1 }}>{m.isPop ? `${TIME_RANGES.find(t => t.id === m.timeRange)?.label || m.timeRange} PoP %` : m.timeRange === 'custom' && m.startDate && m.endDate ? `${m.startDate.slice(5)} → ${m.endDate.slice(5)}` : TIME_RANGES.find(t => t.id === m.timeRange)?.label || m.timeRange}</span>
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {/* Spacer row above visible rows */}
                                {(processedData?.length ?? 0) > 0 && virtRange.start > 0 && (
                                    <tr style={{ height: virtRange.start * VIRT_ROW_H }} aria-hidden="true"><td /></tr>
                                )}
                                {processedData?.slice(virtRange.start, virtRange.end).map((row, relIdx) => {
                                    const idx = virtRange.start + relIdx;
                                    return (
                                    <tr key={idx} className="group">
                                        {row.rowKeyParts.map((part: string, pIdx: number) => {
                                            const dim = reportResult.rowHeaders[pIdx];
                                            const meta = row.metadata[dim];

                                            if (dim === 'sku' && meta) {
                                                return (
                                                    <td key={pIdx} className="pin whitespace-nowrap" style={{ left: pIdx === 0 ? 0 : 220 + (pIdx - 1) * 160, width: pIdx === 0 ? 220 : 160, minWidth: pIdx === 0 ? 220 : 160, maxWidth: pIdx === 0 ? 220 : 160, background: 'rgba(255,255,255,0.98)' }}>
                                                        <div className="flex items-center gap-2 truncate">
                                                            <span className="font-bold text-gray-900 font-mono text-xs truncate">{meta.sku}</span>
                                                            <GradeBadge gradeLevel={meta.gradeLevel} />
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 truncate max-w-full">{meta.name}</div>
                                                    </td>
                                                );
                                            }

                                            return (
                                                <td key={pIdx} className="pin text-xs font-bold text-gray-900 whitespace-nowrap truncate" style={{ left: pIdx === 0 ? 0 : 220 + (pIdx - 1) * 160, width: pIdx === 0 ? 220 : 160, minWidth: pIdx === 0 ? 220 : 160, maxWidth: pIdx === 0 ? 220 : 160, background: 'rgba(255,255,255,0.98)' }}>
                                                    {part}
                                                </td>
                                            );
                                        })}
                                        {orderedColHeaders.map((ch: any, chIdx: number) => (
                                            metrics.map((m, mIdx) => {
                                                const val = row[`${ch.id}_${m.id}`];
                                                const mConfig = getMetricConfig(m.metricId);
                                    const colClass = m.metricId === 'revenue' || m.metricId === 'cogs' || m.metricId === 'ad_spend' || m.metricId === 'asp' ? 'cb'
                                                    : m.metricId === 'profit' || m.metricId === 'margin' || m.metricId === 'roi' ? 'cg'
                                                    : m.metricId === 'refund_rate' || m.metricId === 'refund_value' ? 'cr'
                                                    : '';
                                                const isNeg = typeof val === 'number' && val < 0;
                                                const isEmpty = val === 0 && !m.isPop && mConfig?.type !== 'percent';
                                                const formatted = isEmpty ? null
                                                    : m.isPop ? formatPop(val)
                                                    : mConfig?.type === 'currency' ? formatSmartMoney(val)
                                                    : mConfig?.type === 'percent' ? formatPct(val)
                                                    : formatNumber(val);

                                                return (
                                                    <td key={`${ch.id}_${m.id}`} className={`r ${colClass}`} style={{ borderLeft: mIdx === 0 ? '2px solid rgba(209,213,219,0.7)' : undefined, ...(!isEmpty ? getBarStyle(val, m.metricId, m.isPop) : {}) }}>
                                                        {isEmpty
                                                            ? <span className="v-dim">—</span>
                                                            : m.isPop
                                                                ? <PopBadge val={val} />
                                                                : <span className={isNeg ? 'v-neg' : 'v-num'}>{formatted}</span>
                                                        }
                                                    </td>
                                                );
                                            })
                                        ))}
                                        {orderedColHeaders.length > 1 && metrics.map((m, mIdx) => {
                                            const val = row[`total_${m.id}`];
                                            const mConfig = getMetricConfig(m.metricId);
                                const colClass = m.metricId === 'revenue' || m.metricId === 'cogs' || m.metricId === 'ad_spend' || m.metricId === 'asp' ? 'cb'
                                                : m.metricId === 'profit' || m.metricId === 'margin' || m.metricId === 'roi' ? 'cg'
                                                : m.metricId === 'refund_rate' || m.metricId === 'refund_value' ? 'cr'
                                                : '';
                                            const isNeg = typeof val === 'number' && val < 0;
                                            const isEmpty = val === 0 && !m.isPop && mConfig?.type !== 'percent';
                                            const formatted = isEmpty ? null
                                                : m.isPop ? formatPop(val)
                                                : mConfig?.type === 'currency' ? formatSmartMoney(val)
                                                : mConfig?.type === 'percent' ? formatPct(val)
                                                : formatNumber(val);

                                            return (
                                                <td key={`total_${m.id}`} className={`r ${colClass}`} style={{ borderLeft: mIdx === 0 ? '2px solid rgba(var(--theme-rgb), 0.15)' : undefined, fontWeight: 800, ...(!isEmpty && !m.isPop ? getBarStyle(val, m.metricId) : {}) }}>
                                                    {isEmpty
                                                        ? <span className="v-dim">—</span>
                                                        : m.isPop
                                                            ? <span className="v-dim">—</span>
                                                            : <span className={isNeg ? 'v-neg' : 'v-num'} style={{ fontWeight: 800 }}>{formatted}</span>
                                                    }
                                                </td>
                                            );
                                        })}
                                    </tr>
                                    );
                                })}
                                {/* Spacer row below visible rows */}
                                {(processedData?.length ?? 0) > virtRange.end && (
                                    <tr style={{ height: ((processedData?.length ?? 0) - virtRange.end) * VIRT_ROW_H }} aria-hidden="true"><td /></tr>
                                )}
                            </tbody>
                            {grandTotalRow && reportResult && (
                                <tfoot>
                                    <tr>
                                        {reportResult.rowHeaders.map((_: any, pIdx: number) => (
                                            <td key={`gt-dim-${pIdx}`} className="pin" style={{
                                                left: pIdx === 0 ? 0 : 220 + (pIdx - 1) * 160,
                                                width: pIdx === 0 ? 220 : 160, minWidth: pIdx === 0 ? 220 : 160, maxWidth: pIdx === 0 ? 220 : 160,
                                                fontWeight: 800, color: 'var(--theme)', fontSize: 11,
                                                background: 'rgba(248,250,252,0.98)',
                                                backdropFilter: 'blur(8px)',
                                            }}>
                                                {pIdx === 0 ? 'Grand Total' : ''}
                                            </td>
                                        ))}
                                        {orderedColHeaders.map((ch: any) => (
                                            metrics.filter(m => !m.isHidden).map((m, mIdx) => {
                                                const key = `${ch.id}_${m.id}`;
                                                const val = grandTotalRow[key];
                                                const mConfig = getMetricConfig(m.metricId);
                                    const colClass = ['revenue','cogs','ad_spend','asp'].includes(m.metricId) ? 'cb'
                                                    : ['profit','margin','roi'].includes(m.metricId) ? 'cg'
                                                    : ['refund_rate','refund_value'].includes(m.metricId) ? 'cr' : '';
                                                const formatted = val === undefined ? '—'
                                                    : m.isPop ? '—'
                                                    : mConfig?.type === 'currency' ? formatSmartMoney(val)
                                                    : mConfig?.type === 'percent' ? formatPct(val)
                                                    : formatNumber(val);
                                                const isNeg = typeof val === 'number' && val < 0;
                                                return (
                                                    <td key={key} className={`r ${colClass}`} style={{ borderLeft: mIdx === 0 ? '2px solid rgba(209,213,219,0.7)' : undefined, fontWeight: 800 }}>
                                                        <span className={val === undefined || m.isPop ? 'v-dim' : isNeg ? 'v-neg' : 'v-num'} style={{ fontWeight: 800 }}>
                                                            {formatted}
                                                        </span>
                                                    </td>
                                                );
                                            })
                                        ))}
                                        {orderedColHeaders.length > 1 && metrics.filter(m => !m.isHidden).map((m, mIdx) => {
                                            const key = `total_${m.id}`;
                                            const val = grandTotalRow[key];
                                            const mConfig = getMetricConfig(m.metricId);
                                const colClass = ['revenue','cogs','ad_spend','asp'].includes(m.metricId) ? 'cb'
                                                : ['profit','margin','roi'].includes(m.metricId) ? 'cg'
                                                : ['refund_rate','refund_value'].includes(m.metricId) ? 'cr' : '';
                                            const formatted = val === undefined ? '—'
                                                : m.isPop ? '—'
                                                : mConfig?.type === 'currency' ? formatSmartMoney(val)
                                                : mConfig?.type === 'percent' ? formatPct(val)
                                                : formatNumber(val);
                                            const isNeg = typeof val === 'number' && val < 0;
                                            return (
                                                <td key={key} className={`r ${colClass}`} style={{ borderLeft: mIdx === 0 ? '2px solid rgba(var(--theme-rgb), 0.15)' : undefined, fontWeight: 800 }}>
                                                    <span className={val === undefined || m.isPop ? 'v-dim' : isNeg ? 'v-neg' : 'v-num'} style={{ fontWeight: 800 }}>
                                                        {formatted}
                                                    </span>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                        </>
                    )}
                </div>

                {/* ── Summary bar ─────────────────────────────────────── */}
                {reportResult && processedData && processedData.length > 0 && (() => {
                    // Pull summary stats from grandTotalRow or compute inline
                    const rowLabel = reportResult.rowHeaders.map((rh: string) => {
                        if (rh === 'sku') return 'SKUs';
                        if (rh === 'category') return 'Categories';
                        if (rh === 'brand') return 'Brands';
                        if (rh === 'platform') return 'Platforms';
                        return rh;
                    }).join(' · ');

                    const colCount = orderedColHeaders.length > 1 ? orderedColHeaders.length : 0;
                    const colLabel = colCount > 0 ? `${colCount} ${reportResult.rowHeaders.includes('platform') ? 'platforms' : 'columns'}` : null;

                    // Find revenue, profit, units, margin metrics from current metric instances
                    const revM   = metrics.find(m => m.metricId === 'revenue');
                    const profM  = metrics.find(m => m.metricId === 'profit');
                    const unitsM = metrics.find(m => m.metricId === 'units');
                    const margM  = metrics.find(m => m.metricId === 'margin');

                    const getTotalVal = (m: MetricInstance | undefined) => {
                        if (!m || !grandTotalRow) return null;
                        // prefer grand total column, fallback to sum of first col
                        const totalKey = `total_${m.id}`;
                        if (grandTotalRow[totalKey] !== undefined) return grandTotalRow[totalKey];
                        // if only one col group, use that
                        if (orderedColHeaders.length === 1) {
                            const key = `${orderedColHeaders[0].id}_${m.id}`;
                            return grandTotalRow[key] ?? null;
                        }
                        return null;
                    };

                    const totalRev   = getTotalVal(revM);
                    const totalProf  = getTotalVal(profM);
                    const totalUnits = getTotalVal(unitsM);
                    const avgMarg    = getTotalVal(margM);

                    const pills: { label: string; value: string; highlight?: boolean }[] = [];
                    if (totalRev   !== null) pills.push({ label: 'Total Revenue', value: formatSmartMoney(totalRev), highlight: false });
                    if (totalProf  !== null) pills.push({ label: 'Net Profit',    value: formatSmartMoney(totalProf), highlight: totalProf < 0 });
                    if (avgMarg    !== null) pills.push({ label: 'Avg Margin',    value: formatPct(avgMarg) });
                    if (totalUnits !== null) pills.push({ label: 'Total Units',   value: formatNumber(totalUnits) });

                    return (
                        <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/70 text-[11px] text-gray-500 flex-shrink-0 gap-4" style={{backdropFilter:'blur(8px)'}}>
                            {/* Left: row/col counts */}
                            <div className="flex items-center gap-1.5 font-medium text-gray-400 whitespace-nowrap">
                                <span className="font-bold text-gray-600">{processedData.length}</span> {rowLabel}
                                {colLabel && <><span className="text-gray-300">·</span><span className="font-bold text-gray-600">{colLabel}</span></>}
                            </div>

                            {/* Centre: summary stats */}
                            {pills.length > 0 && (
                                <div className="flex items-center gap-4 overflow-x-auto flex-1 justify-center">
                                    {pills.map((p, i) => (
                                        <React.Fragment key={p.label}>
                                            {i > 0 && <span className="text-gray-200">|</span>}
                                            <span className="whitespace-nowrap">
                                                {p.label}{' '}
                                                <span className={`font-bold ${p.highlight ? 'text-red-500' : 'text-gray-800'}`}>{p.value}</span>
                                            </span>
                                        </React.Fragment>
                                    ))}
                                </div>
                            )}

                            {/* Right: scroll position indicator */}
                            <div className="flex items-center gap-3 flex-shrink-0">
                                <span className="text-gray-400 whitespace-nowrap">
                                    Showing <span className="font-bold text-gray-600">{Math.min(virtRange.end, processedData.length)}</span> of <span className="font-bold text-gray-600">{processedData.length}</span> rows
                                </span>
                                <button
                                    onClick={() => { if (tableScrollRef.current) tableScrollRef.current.scrollTop = 0; }}
                                    className="p-1 rounded hover:bg-gray-200 transition-colors text-gray-400 hover:text-gray-600"
                                    title="Scroll to top"
                                >
                                    <ArrowUp className="w-3 h-3" />
                                </button>
                            </div>
                        </div>
                    );
                })()}
            </div>
            {isCustomMetricModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <CustomMetricModal
                        pendingMetrics={pendingMetrics}
                        onClose={() => setIsCustomMetricModalOpen(false)}
                        onCreate={(cm) => {
                            setCustomMetrics([...customMetrics, cm]);
                            setIsCustomMetricModalOpen(false);
                        }}
                    />
                </div>
            )}
        </div>
    );
};



export const CustomReportPage = React.memo(CustomReportPageInner);
export default CustomReportPage;
