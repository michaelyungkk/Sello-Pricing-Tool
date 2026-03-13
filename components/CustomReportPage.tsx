
import React, { useState, useMemo, useRef } from 'react';
import { Product, PriceLog, RefundLog, PricingRules } from '../types';
import { getReportLayouts, saveReportLayout, ReportLayout } from '../services/persistenceService';
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
} from 'lucide-react';
import { formatMoney, formatSmartMoney, formatPct, formatNumber } from '../utils/format';
import { GradeBadge } from './GradeBadge';
import { SelectFilter } from './common/SelectFilter';
import * as XLSX from 'xlsx';

// Local alias so existing usages inside this file need no changes
const MultiSelectDropdown = SelectFilter;

interface CustomReportPageProps {
    products: Product[];
    priceHistory: PriceLog[];
    refundHistory: RefundLog[];
    pricingRules: PricingRules;
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

const METRICS = [
    { id: 'revenue', label: 'Revenue', icon: BarChart3, type: 'currency' },
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
    operator: 'equals' | 'contains' | 'gt' | 'lt';
    value: string | string[];
}

interface CustomMetric {
    id: string;
    label: string;
    metricA: string;
    metricB: string;
    operator: '+' | '-' | '*' | '/';
    type: 'currency' | 'percent' | 'number';
}

export const CustomReportPage: React.FC<CustomReportPageProps> = ({
    products,
    priceHistory,
    refundHistory,
    pricingRules,
}) => {
    // --- STATE ---
    const [rowDims, setRowDims] = useState<string[]>(['sku']);
    const [colDims, setColDims] = useState<string[]>(['platform']);
    const [metrics, setMetrics] = useState<Array<{ id: string; metricId: string; timeRange: string; startDate?: string; endDate?: string }>>([
        { id: Math.random().toString(36).substr(2, 9), metricId: 'units', timeRange: '30d' },
        { id: Math.random().toString(36).substr(2, 9), metricId: 'revenue', timeRange: '30d' },
        { id: Math.random().toString(36).substr(2, 9), metricId: 'profit', timeRange: '30d' }
    ]);

    const [filters, setFilters] = useState<FilterRule[]>([]);
    const [pendingFilters, setPendingFilters] = useState<FilterRule[]>([]);
    const [customMetrics, setCustomMetrics] = useState<CustomMetric[]>([]);
    const [isCustomMetricModalOpen, setIsCustomMetricModalOpen] = useState(false);

    const [reportName, setReportName] = useState('New Custom Report');
    const [savedLayouts, setSavedLayouts] = useState<ReportLayout[]>(getReportLayouts());
    const [sortRules, setSortRules] = useState<SortRule[]>([{ key: 'total_units', dir: 'desc' }]);
    const [activePopover, setActivePopover] = useState<string | null>(null);

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
    const [colOrder, setColOrder] = useState<string[]>([]);
    const [dragOverCol, setDragOverCol] = useState<string | null>(null);
    const dragColRef = useRef<string | null>(null);
    const dragOverColRef = useRef<string | null>(null);

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
        setNeedsGeneration(true);
        // Trigger immediate generation with new dims
        setTimeout(() => {
            generateReport(newRowDims, newColDims);
        }, 0);
    };

    const handleAddMetric = (metricId: string) => {
        setMetrics([...metrics, {
            id: Math.random().toString(36).substr(2, 9),
            metricId,
            timeRange: '30d'
        }]);
        setNeedsGeneration(true);
    };

    const handleAddFilter = (field: string, type: 'dim' | 'metric') => {
        const newFilter: FilterRule = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            field,
            operator: type === 'dim' ? 'contains' : 'gt',
            value: ''
        };
        setPendingFilters([...pendingFilters, newFilter]);
    };

    const applyFilters = () => {
        const newFilters = [...pendingFilters];
        setFilters(newFilters);
        setNeedsGeneration(true);
        // Trigger immediate generation with new filters
        setTimeout(() => {
            generateReport(undefined, undefined, newFilters);
        }, 0);
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
        setMetrics(metrics.filter(m => m.id !== id));
        setNeedsGeneration(true);
    };

    const handleRemoveFilter = (id: string) => {
        setPendingFilters(pendingFilters.filter(f => f.id !== id));
    };

    const handleSave = () => {
        const layout: any = {
            id: Math.random().toString(36).substr(2, 9),
            name: reportName,
            rowDims,
            colDims,
            metrics,
            updatedAt: new Date().toISOString()
        };
        saveReportLayout(layout);
        setSavedLayouts(getReportLayouts());
    };

    const handleLoadLayout = (layout: any) => {
        setRowDims(layout.rowDims || ['sku']);
        setColDims(layout.colDims || []);
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
                const next = [...metrics];
                const oldIdx = next.findIndex(m => m.id === id);
                const item = next[oldIdx];
                next.splice(oldIdx, 1);
                const insertIdx = targetIdx !== undefined ? targetIdx : next.length;
                next.splice(insertIdx, 0, item);
                setMetrics(next);
            } else {
                const next = [...metrics];
                const insertIdx = targetIdx !== undefined ? targetIdx : next.length;
                next.splice(insertIdx, 0, {
                    id: Math.random().toString(36).substr(2, 9),
                    metricId: id,
                    timeRange: '30d'
                });
                setMetrics(next);
            }
            setNeedsGeneration(true);
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
        const effectiveFilters = overrideFilters || filters;

        if (effectiveRowDims.length === 0 || metrics.length === 0) return;
        setIsGenerating(true);

        setTimeout(() => {
            const now = new Date();

            // Helper to get start/end dates for a specific time range
            const getDates = (range: string, customStart?: string, customEnd?: string) => {
                let start: Date | null = null;
                let end: Date = now;
                if (range === 'custom' && customStart) {
                    start = new Date(customStart);
                    if (customEnd) end = new Date(customEnd);
                } else {
                    start = new Date();
                    if (range === '7d') start.setDate(now.getDate() - 7);
                    else if (range === '30d') start.setDate(now.getDate() - 30);
                    else if (range === '90d') start.setDate(now.getDate() - 90);
                    else if (range === 'ytd') start = new Date(now.getFullYear(), 0, 1);
                    else start = null;
                }
                return { start, end };
            };

            // 2. Create product lookup
            const productMap = new Map<string, Product>();
            products.forEach(p => productMap.set(p.sku, p));

            // 3. Aggregate
            const rowMap = new Map<string, any>();
            const colValueSets = effectiveColDims.map(() => new Set<string>());

            const dimFilters = effectiveFilters.filter(f => f.type === 'dim');

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

            // 4. Build Column Headers
            let colHeaders: any[] = [];
            if (effectiveColDims.length > 0) {
                const values = Array.from(colValueSets[0]).sort();
                colHeaders = values.map(v => ({
                    id: v,
                    label: v,
                    metrics: metrics
                }));
            } else {
                colHeaders = [{ id: 'total', label: 'Total', metrics: metrics }];
            }

            // 5. Finalize Rows
            const finalRows = Array.from(rowMap.values()).map(row => {
                const data: any = { ...row };

                const calculateMetricValue = (items: any[], mConfig: typeof metrics[0], rowSkus: Set<string>) => {
                    const { start, end } = getDates(mConfig.timeRange, mConfig.startDate, mConfig.endDate);
                    const filtered = items.filter(l => {
                        const d = new Date(l.date);
                        return (!start || d >= start) && d <= end;
                    });

                    const sales = filtered.filter(l => l._type === 'SALE');
                    const refunds = filtered.filter(l => l._type === 'REFUND');

                    const units = sales.reduce((sum, l) => sum + (l.velocity || 0), 0);
                    const rev = sales.reduce((sum, l) => sum + ((l.price || 0) * (l.velocity || 0)), 0);
                    const prof = sales.reduce((sum, l) => sum + (l.profit || 0), 0);
                    const ads = sales.reduce((sum, l) => sum + (l.adsSpend || 0), 0);

                    const refundQty = refunds.reduce((sum, l) => sum + (l.quantity || 0), 0);
                    const refundVal = refunds.reduce((sum, l) => sum + (l.amount || 0), 0);

                    const getBaseValue = (mId: string): number => {
                        switch (mId) {
                            case 'units': return units;
                            case 'revenue': return rev;
                            case 'profit': return prof;
                            case 'ad_spend': return ads;
                            case 'margin': return rev > 0 ? (prof / rev) * 100 : 0;
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
                                    const valA: number = getBaseValue(custom.metricA);
                                    const valB: number = getBaseValue(custom.metricB);
                                    switch (custom.operator) {
                                        case '+': return valA + valB;
                                        case '-': return valA - valB;
                                        case '*': return valA * valB;
                                        case '/': return valB !== 0 ? valA / valB : 0;
                                    }
                                }
                                return 0;
                            }
                        }
                    };

                    return getBaseValue(mConfig.metricId);
                };

                colHeaders.forEach(ch => {
                    const cellLogs = row.cells.get(ch.id) || [];
                    metrics.forEach(m => {
                        data[`${ch.id}_${m.id}`] = calculateMetricValue(cellLogs, m, row.skus);
                    });
                });

                // Grand Totals
                metrics.forEach(m => {
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
        if (skuSearchTags.length > 0 || skuSearchInput.trim()) {
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
                const q = skuSearchInput.trim().toLowerCase();
                return keyStr.includes(q) || skuName.includes(q);
            });
        }

        // Apply Filters
        if (filters.length > 0) {
            rows = rows.filter(row => {
                return filters.every(f => {
                    if (f.type === 'dim') return true; // Handled in generation

                    const val = row[`total_${f.field}`] || 0;
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
        if (sortRules.length > 0) {
            rows.sort((a, b) => {
                for (const rule of sortRules) {
                    const valA = a[rule.key] ?? 0;
                    const valB = b[rule.key] ?? 0;
                    if (valA < valB) return rule.dir === 'asc' ? -1 : 1;
                    if (valA > valB) return rule.dir === 'asc' ? 1 : -1;
                }
                return 0;
            });
        }

        return rows;
    }, [reportResult, filters, sortRules, skuSearchTags, skuSearchInput]);

    // Ordered col headers — respects user drag-reorder
    const orderedColHeaders = useMemo(() => {
        if (!reportResult) return [];
        if (colOrder.length === 0) return reportResult.colHeaders;
        const map = new Map(reportResult.colHeaders.map((ch: any) => [ch.id, ch]));
        const ordered = colOrder.map(id => map.get(id)).filter(Boolean);
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

    const getUniqueValues = (field: string) => {
        const values = new Set<string>();
        products.forEach(p => {
            if (field === 'brand') values.add(p.brand || '');
            else if (field === 'category') values.add(p.category || '');
            else if (field === 'platform') {
                p.channels?.forEach(c => values.add(c.platform));
            }
            else if (field === 'sku') values.add(p.sku);
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

    const handleExport = () => {
        if (!reportResult) return;
        const headers = [...reportResult.rowHeaders.map(getDimLabel)];
        reportResult.colHeaders.forEach(ch => {
            metrics.forEach(m => headers.push(`${ch.label} - ${getMetricLabel(m.metricId)} (${m.timeRange})`));
        });
        metrics.forEach(m => headers.push(`Grand Total - ${getMetricLabel(m.metricId)} (${m.timeRange})`));

        const data = (processedData || []).map(row => {
            const r = [...row.rowKeyParts];
            reportResult.colHeaders.forEach(ch => {
                metrics.forEach(m => r.push(row[`${ch.id}_${m.id}`]));
            });
            metrics.forEach(m => r.push(row[`total_${m.id}`]));
            return r;
        });

        const ws = XLSX.utils.aoa_to_sheet([headers, ...data]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Report");
        XLSX.writeFile(wb, `${reportName}.xlsx`);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-140px)] space-y-4 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-end shrink-0">
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowBuilder(!showBuilder)}
                        className={`flex items-center gap-2 px-3 h-8 border rounded-lg text-xs font-bold transition-all shadow-sm ${showBuilder ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                    >
                        <Settings2 className="w-4 h-4" />
                        {showBuilder ? 'Hide Builder' : 'Show Builder'}
                    </button>
                    <button
                        onClick={() => generateReport()}
                        disabled={!needsGeneration}
                        className={`flex items-center gap-2 px-4 h-8 rounded-lg text-xs font-bold transition-all shadow-sm ${needsGeneration
                            ? 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md'
                            : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }`}
                    >
                        <Play className="w-4 h-4 fill-current" />
                        Generate Report
                    </button>
                    {savedLayouts.length > 0 && (
                        <div className="relative group">
                            <button className="flex items-center gap-2 px-4 h-8 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm">
                                <FolderOpen className="w-4 h-4" />
                                Load
                            </button>
                            <div className="absolute top-full right-0 mt-2 w-48 bg-white border border-gray-100 rounded-lg shadow-xl z-50 p-2 opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all animate-in slide-in-from-top-1">
                                {savedLayouts.map(layout => (
                                    <button
                                        key={layout.id}
                                        onClick={() => handleLoadLayout(layout)}
                                        className="w-full text-left px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 rounded truncate"
                                    >
                                        {layout.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                    <button
                        onClick={handleExport}
                        disabled={!reportResult}
                        className="flex items-center gap-2 px-4 h-8 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50"
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                    <button
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 h-8 bg-white border border-gray-200 rounded-lg text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm"
                    >
                        <Save className="w-4 h-4" />
                        Save Layout
                    </button>
                </div>
            </div>

            {/* Builder Section (Top) */}
            {showBuilder && (
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 shrink-0 transition-all">
                    <div className="grid grid-cols-12 gap-6">
                        {/* Source Palette */}
                        <div className="col-span-4 border-r border-gray-100 pr-6 space-y-4">
                            <div>
                                <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Dimensions</h3>
                                <div className="flex flex-wrap gap-2">
                                    {DIMENSIONS.map(dim => (
                                        <div
                                            key={dim.id}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, dim.id, 'dim')}
                                            className="flex items-center gap-2 px-2 py-1.5 rounded border border-gray-100 bg-gray-50 hover:border-indigo-200 hover:bg-indigo-50 transition-all cursor-grab active:cursor-grabbing"
                                        >
                                            <dim.icon className="w-3 h-3 text-gray-400" />
                                            <span className="text-xs font-medium text-gray-700">{dim.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div>
                                <div className="flex items-center justify-between mb-2">
                                    <h3 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Metrics</h3>
                                    <button onClick={() => setIsCustomMetricModalOpen(true)} className="text-emerald-600 hover:bg-emerald-50 p-0.5 rounded"><Plus className="w-3 h-3" /></button>
                                </div>
                                <div className="flex flex-wrap gap-2 max-h-[80px] overflow-y-auto">
                                    {METRICS.map(metric => (
                                        <div
                                            key={metric.id}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, metric.id, 'metric')}
                                            onClick={() => handleAddMetric(metric.id)}
                                            className="flex items-center gap-2 px-2 py-1.5 rounded border border-gray-100 bg-gray-50 hover:border-emerald-200 hover:bg-emerald-50 transition-all cursor-grab active:cursor-grabbing"
                                        >
                                            <metric.icon className="w-3 h-3 text-gray-400" />
                                            <span className="text-xs font-medium text-gray-700">{metric.label}</span>
                                        </div>
                                    ))}
                                    {customMetrics.map(metric => (
                                        <div
                                            key={metric.id}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, metric.id, 'metric')}
                                            onClick={() => handleAddMetric(metric.id)}
                                            className="flex items-center gap-2 px-2 py-1.5 rounded border border-emerald-100 bg-emerald-50/30 hover:bg-emerald-50 transition-all cursor-grab active:cursor-grabbing"
                                        >
                                            <Calculator className="w-3 h-3 text-emerald-600" />
                                            <span className="text-xs font-medium text-emerald-700">{metric.label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Drop Zones */}
                        <div className="col-span-8 space-y-3">
                            {/* Rows */}
                            <div
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDropRow(e)}
                                className="flex items-center gap-3 bg-gray-50/50 border border-dashed border-gray-200 rounded-lg p-2 min-h-[44px]"
                            >
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest w-16 shrink-0">Rows</span>
                                <div className="flex flex-wrap gap-2 flex-1">
                                    {rowDims.map((id, idx) => (
                                        <div
                                            key={id}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, id, 'dim', 'rows')}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => { e.stopPropagation(); onDropRow(e, idx); }}
                                            className="px-2 py-1 bg-white border border-indigo-100 rounded text-[10px] font-bold text-indigo-700 flex items-center gap-1.5 shadow-sm cursor-move"
                                        >
                                            <GripVertical className="w-3 h-3 text-gray-300" />
                                            {getDimLabel(id)}
                                            <button onClick={() => handleRemoveRowDim(id)}><X className="w-3 h-3" /></button>
                                        </div>
                                    ))}
                                    {rowDims.length === 0 && <span className="text-[10px] text-gray-400 italic">Drop dimensions here...</span>}
                                </div>
                            </div>

                            {/* Columns */}
                            <div
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDropCol(e)}
                                className="flex items-center gap-3 bg-gray-50/50 border border-dashed border-gray-200 rounded-lg p-2 min-h-[44px]"
                            >
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest w-16 shrink-0">Columns</span>
                                <div className="flex flex-wrap gap-2 flex-1">
                                    {colDims.map((id, idx) => (
                                        <div
                                            key={id}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, id, 'dim', 'cols')}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => { e.stopPropagation(); onDropCol(e, idx); }}
                                            className="px-2 py-1 bg-white border border-indigo-100 rounded text-[10px] font-bold text-indigo-700 flex items-center gap-1.5 shadow-sm cursor-move"
                                        >
                                            <GripVertical className="w-3 h-3 text-gray-300" />
                                            {getDimLabel(id)}
                                            <button onClick={() => handleRemoveColDim(id)}><X className="w-3 h-3" /></button>
                                        </div>
                                    ))}
                                    {colDims.length === 0 && <span className="text-[10px] text-gray-400 italic">Drop dimensions here...</span>}
                                </div>
                            </div>

                            {/* Metrics */}
                            <div
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDropMetric(e)}
                                className="flex items-center gap-3 bg-gray-50/50 border border-dashed border-gray-200 rounded-lg p-2 min-h-[44px]"
                            >
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest w-16 shrink-0">Values</span>
                                <div className="flex flex-wrap gap-2 flex-1">
                                    {metrics.map((m, idx) => (
                                        <div
                                            key={m.id}
                                            draggable
                                            onDragStart={(e) => onDragStart(e, m.id, 'metric', 'metrics')}
                                            onDragOver={(e) => e.preventDefault()}
                                            onDrop={(e) => { e.stopPropagation(); onDropMetric(e, idx); }}
                                            className="relative"
                                        >
                                            <div className="px-2 py-1 bg-white border border-emerald-100 rounded text-[10px] font-bold text-emerald-700 flex items-center gap-1.5 shadow-sm cursor-move">
                                                <GripVertical className="w-3 h-3 text-gray-300" />
                                                <div className="flex flex-col">
                                                    <span>{getMetricLabel(m.metricId)}</span>
                                                    <button
                                                        onClick={() => setActivePopover(activePopover === m.id ? null : m.id)}
                                                        className="text-[8px] text-gray-400 flex items-center gap-0.5 hover:text-indigo-600"
                                                    >
                                                        <Clock className="w-2 h-2" />
                                                        {m.timeRange}
                                                    </button>
                                                </div>
                                                <button onClick={() => handleRemoveMetric(m.id)}><X className="w-3 h-3" /></button>
                                            </div>

                                            {activePopover === m.id && (
                                                <div className="absolute top-full left-0 mt-1 w-40 bg-white border border-gray-100 rounded-lg shadow-xl z-50 p-2 animate-in slide-in-from-top-1">
                                                    <div className="space-y-1">
                                                        {TIME_RANGES.map(tr => (
                                                            <button
                                                                key={tr.id}
                                                                onClick={() => {
                                                                    const next = [...metrics];
                                                                    next[idx].timeRange = tr.id;
                                                                    setMetrics(next);
                                                                    if (tr.id !== 'custom') {
                                                                        setActivePopover(null);
                                                                        setNeedsGeneration(true);
                                                                    }
                                                                }}
                                                                className={`w-full text-left px-2 py-1.5 rounded text-[10px] transition-colors ${m.timeRange === tr.id ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-600 hover:bg-gray-50'}`}
                                                            >
                                                                {tr.label}
                                                            </button>
                                                        ))}
                                                    </div>
                                                    {m.timeRange === 'custom' && (
                                                        <div className="mt-2 pt-2 border-t border-gray-100 space-y-2">
                                                            <input
                                                                type="date"
                                                                value={m.startDate || ''}
                                                                onChange={(e) => {
                                                                    const next = [...metrics];
                                                                    next[idx].startDate = e.target.value;
                                                                    setMetrics(next);
                                                                }}
                                                                className="w-full text-[9px] p-1 border border-gray-200 rounded"
                                                            />
                                                            <input
                                                                type="date"
                                                                value={m.endDate || ''}
                                                                onChange={(e) => {
                                                                    const next = [...metrics];
                                                                    next[idx].endDate = e.target.value;
                                                                    setMetrics(next);
                                                                }}
                                                                className="w-full text-[9px] p-1 border border-gray-200 rounded"
                                                            />
                                                            <button
                                                                onClick={() => { setActivePopover(null); setNeedsGeneration(true); }}
                                                                className="w-full py-1 bg-indigo-600 text-white text-[9px] font-bold rounded"
                                                            >
                                                                Apply
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                    {metrics.length === 0 && <span className="text-[10px] text-gray-400 italic">Drop metrics here...</span>}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Filter Bar */}
            <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={onDropFilter}
                className="bg-white border border-gray-200 rounded-lg p-2 flex items-center gap-3 shrink-0 shadow-sm"
            >
                <div className="flex items-center gap-2 px-2 border-r border-gray-100">
                    <Filter className="w-4 h-4 text-gray-400" />
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Filters</span>
                </div>
                <div className="flex flex-wrap gap-2 flex-1">
                    {pendingFilters.map((f, idx) => (
                        <div key={f.id} className="flex items-center gap-2 bg-gray-50 p-1.5 border border-gray-200 rounded shadow-sm">
                            {f.type === 'dim' ? (
                                <MultiSelectDropdown
                                    label={getDimLabel(f.field)}
                                    icon={DIMENSIONS.find(d => d.id === f.field)?.icon}
                                    selected={Array.isArray(f.value) ? f.value : []}
                                    onChange={(newVal: string[]) => {
                                        const next = [...pendingFilters];
                                        next[idx].value = newVal;
                                        setPendingFilters(next);
                                    }}
                                    options={getUniqueValues(f.field)}
                                />
                            ) : (
                                <>
                                    <span className="text-[10px] font-bold text-gray-600">
                                        {getMetricLabel(f.field)}
                                    </span>
                                    <select
                                        value={f.operator}
                                        onChange={(e) => {
                                            const next = [...pendingFilters];
                                            next[idx].operator = e.target.value as any;
                                            setPendingFilters(next);
                                        }}
                                        className="text-[10px] border-none bg-white rounded p-0.5 focus:ring-0 shadow-sm"
                                    >
                                        <option value="gt">&gt;</option>
                                        <option value="lt">&lt;</option>
                                        <option value="equals">=</option>
                                    </select>
                                    <input
                                        type="text"
                                        value={f.value as string}
                                        onChange={(e) => {
                                            const next = [...pendingFilters];
                                            next[idx].value = e.target.value;
                                            setPendingFilters(next);
                                        }}
                                        placeholder="Value..."
                                        className="text-[10px] border-none bg-white rounded p-0.5 w-20 focus:ring-0 shadow-sm"
                                    />
                                </>
                            )}
                            <button onClick={() => handleRemoveFilter(f.id)}><X className="w-3 h-3 text-gray-400 hover:text-red-500" /></button>
                        </div>
                    ))}

                    {/* Add Filter Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setIsFilterMenuOpen(v => !v)}
                            className="flex items-center gap-1 px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold hover:bg-indigo-100 transition-colors"
                        >
                            <Plus className="w-3 h-3" />
                            Add Filter
                        </button>
                        {isFilterMenuOpen && (
                            <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsFilterMenuOpen(false)} />
                                <div className="absolute top-full left-0 mt-1 w-48 bg-white border border-gray-100 rounded-lg shadow-xl z-50 p-2 animate-in slide-in-from-top-1">
                                    <div className="text-[9px] font-bold text-gray-400 uppercase mb-1 px-2">Dimensions</div>
                                    {DIMENSIONS.map(d => (
                                        <button
                                            key={d.id}
                                            onClick={() => { handleAddFilter(d.id, 'dim'); setIsFilterMenuOpen(false); }}
                                            className="w-full text-left px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-50 rounded"
                                        >
                                            {d.label}
                                        </button>
                                    ))}
                                    <div className="border-t border-gray-100 my-1"></div>
                                    <div className="text-[9px] font-bold text-gray-400 uppercase mb-1 px-2">Metrics</div>
                                    {METRICS.map(m => (
                                        <button
                                            key={m.id}
                                            onClick={() => { handleAddFilter(m.id, 'metric'); setIsFilterMenuOpen(false); }}
                                            className="w-full text-left px-2 py-1 text-[10px] text-gray-600 hover:bg-gray-50 rounded"
                                        >
                                            {m.label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>

                    {pendingFilters.length > 0 && (
                        <button
                            onClick={applyFilters}
                            className="ml-auto px-3 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold hover:bg-indigo-700 shadow-sm"
                        >
                            Apply Filters
                        </button>
                    )}
                </div>
            </div>

            {/* Table Container */}
            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden flex-1 flex flex-col backdrop-blur-custom relative">
                {needsGeneration && !isGenerating && !reportResult && (
                    <div className="absolute inset-0 z-30 bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
                        <button
                            onClick={() => generateReport()}
                            className="flex items-center gap-3 px-10 py-5 bg-indigo-600 text-white rounded-2xl font-bold shadow-2xl hover:bg-indigo-700 hover:scale-105 transition-all animate-in zoom-in-95"
                        >
                            <Play className="w-6 h-6 fill-current" />
                            Generate Pivot Report
                        </button>
                    </div>
                )}

                {isGenerating && (
                    <div className="absolute inset-0 z-30 bg-white/80 backdrop-blur-md flex flex-col items-center justify-center space-y-4">
                        <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                        <p className="text-lg font-bold text-gray-900">Crunching Data...</p>
                        <p className="text-xs text-gray-400">Aggregating dimensions and calculating metrics</p>
                    </div>
                )}

                <div className="flex-1 overflow-auto">
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
                        <table className="sello-table">
                            <thead className="sticky top-0 z-20">
                                <tr>
                                    {reportResult.rowHeaders.map((rh, idx) => (
                                        <th key={rh} rowSpan={2} className="pin truncate" style={{ left: idx * 160, width: 160, minWidth: 160, maxWidth: 160 }}>
                                            <div className="flex items-center justify-between cursor-pointer w-full">
                                                <div className="flex items-center gap-2" onClick={() => handleSort(rh)}>
                                                    <span className="truncate">{getDimLabel(rh)}</span>
                                                    {sortRules[0]?.key === rh && (
                                                        sortRules[0].dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-indigo-600 flex-shrink-0 ml-1" /> : <ArrowDown className="w-2.5 h-2.5 text-indigo-600 flex-shrink-0 ml-1" />
                                                    )}
                                                </div>
                                                {idx === 0 && (
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); handleSwapDims(); }}
                                                        className="p-1.5 bg-white hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 rounded-md transition-all shadow-sm border border-gray-200 hover:border-indigo-200 group"
                                                        title="Swap Rows/Columns"
                                                    >
                                                        <ArrowLeftRight className="w-3.5 h-3.5 group-hover:scale-110 transition-transform" />
                                                    </button>
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
                                                style={{ borderLeft: dragOverCol === ch.id ? '2px solid var(--theme)' : '2px solid rgba(209,213,219,0.7)', borderBottom: '1px solid var(--glass-divider)', padding: '6px 14px', cursor: 'grab', userSelect: 'none', opacity: dragColRef.current === ch.id ? 0.4 : 1, transition: 'border-color 0.1s' }}
                                            >
                                                <span style={platformBadgeStyle(hex)}>{ch.label}</span>
                                            </th>
                                        );
                                    })}
                                    <th colSpan={metrics.length} className="c" style={{ borderLeft: '2px solid rgba(79,70,229,0.15)', borderBottom: '1px solid var(--glass-divider)', padding: '6px 14px', color: '#4f46e5', fontWeight: 800 }}>
                                        Grand Total
                                    </th>
                                </tr>
                                <tr>
                                    {orderedColHeaders.map((ch: any, chIdx: number) => (
                                        metrics.map((m, mIdx) => {
                                            const colClass = m.metricId === 'revenue' || m.metricId === 'ad_spend' || m.metricId === 'asp' ? 'cb'
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
                                                        <span style={{ fontSize: 8, opacity: 0.4, lineHeight: 1 }}>{m.timeRange}</span>
                                                    </div>
                                                </th>
                                            );
                                        })
                                    ))}
                                    {metrics.map((m, mIdx) => {
                                        const colClass = m.metricId === 'revenue' || m.metricId === 'ad_spend' || m.metricId === 'asp' ? 'cb'
                                            : m.metricId === 'profit' || m.metricId === 'margin' || m.metricId === 'roi' ? 'cg'
                                            : m.metricId === 'refund_rate' || m.metricId === 'refund_value' ? 'cr'
                                            : '';
                                        const isSorted = sortRules[0]?.key === `total_${m.id}`;
                                        return (
                                            <th
                                                key={`total_${m.id}`}
                                                onClick={(e) => handleSort(`total_${m.id}`, e)}
                                                className={`r metric-sub ${colClass} ${isSorted ? 'sorted' : ''}`}
                                                style={{ borderLeft: mIdx === 0 ? '2px solid rgba(79,70,229,0.15)' : undefined, minWidth: 80 }}
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
                                                    <span style={{ fontSize: 8, opacity: 0.4, lineHeight: 1 }}>{m.timeRange}</span>
                                                </div>
                                            </th>
                                        );
                                    })}
                                </tr>
                            </thead>
                            <tbody>
                                {processedData?.map((row, idx) => (
                                    <tr key={idx} className="group">
                                        {row.rowKeyParts.map((part: string, pIdx: number) => {
                                            const dim = reportResult.rowHeaders[pIdx];
                                            const meta = row.metadata[dim];

                                            if (dim === 'sku' && meta) {
                                                return (
                                                    <td key={pIdx} className="pin whitespace-nowrap" style={{ left: pIdx * 160, width: 160, minWidth: 160, maxWidth: 160 }}>
                                                        <div className="flex items-center gap-2 truncate">
                                                            <span className="font-bold text-gray-900 font-mono text-xs truncate">{meta.sku}</span>
                                                            <GradeBadge gradeLevel={meta.gradeLevel} />
                                                        </div>
                                                        <div className="text-[10px] text-gray-500 truncate max-w-full">{meta.name}</div>
                                                    </td>
                                                );
                                            }

                                            return (
                                                <td key={pIdx} className="pin text-xs font-bold text-gray-900 whitespace-nowrap truncate" style={{ left: pIdx * 160, width: 160, minWidth: 160, maxWidth: 160 }}>
                                                    {part}
                                                </td>
                                            );
                                        })}
                                        {orderedColHeaders.map((ch: any, chIdx: number) => (
                                            metrics.map((m, mIdx) => {
                                                const val = row[`${ch.id}_${m.id}`];
                                                const mConfig = getMetricConfig(m.metricId);
                                                const colClass = m.metricId === 'revenue' || m.metricId === 'ad_spend' || m.metricId === 'asp' ? 'cb'
                                                    : m.metricId === 'profit' || m.metricId === 'margin' || m.metricId === 'roi' ? 'cg'
                                                    : m.metricId === 'refund_rate' || m.metricId === 'refund_value' ? 'cr'
                                                    : '';
                                                const isNeg = typeof val === 'number' && val < 0;
                                                const isEmpty = val === 0 && mConfig?.type !== 'percent';
                                                const formatted = isEmpty ? null
                                                    : mConfig?.type === 'currency' ? formatSmartMoney(val)
                                                    : mConfig?.type === 'percent' ? formatPct(val)
                                                    : formatNumber(val);

                                                return (
                                                    <td key={`${ch.id}_${m.id}`} className={`r ${colClass}`} style={{ borderLeft: mIdx === 0 ? '2px solid rgba(209,213,219,0.7)' : undefined }}>
                                                        {isEmpty
                                                            ? <span className="v-dim">—</span>
                                                            : <span className={isNeg ? 'v-neg' : 'v-num'}>{formatted}</span>
                                                        }
                                                    </td>
                                                );
                                            })
                                        ))}
                                        {metrics.map((m, mIdx) => {
                                            const val = row[`total_${m.id}`];
                                            const mConfig = getMetricConfig(m.metricId);
                                            const colClass = m.metricId === 'revenue' || m.metricId === 'ad_spend' || m.metricId === 'asp' ? 'cb'
                                                : m.metricId === 'profit' || m.metricId === 'margin' || m.metricId === 'roi' ? 'cg'
                                                : m.metricId === 'refund_rate' || m.metricId === 'refund_value' ? 'cr'
                                                : '';
                                            const isNeg = typeof val === 'number' && val < 0;
                                            const isEmpty = val === 0 && mConfig?.type !== 'percent';
                                            const formatted = isEmpty ? null
                                                : mConfig?.type === 'currency' ? formatSmartMoney(val)
                                                : mConfig?.type === 'percent' ? formatPct(val)
                                                : formatNumber(val);

                                            return (
                                                <td key={`total_${m.id}`} className={`r ${colClass}`} style={{ borderLeft: mIdx === 0 ? '2px solid rgba(79,70,229,0.15)' : undefined, fontWeight: 800 }}>
                                                    {isEmpty
                                                        ? <span className="v-dim">—</span>
                                                        : <span className={isNeg ? 'v-neg' : 'v-num'} style={{ fontWeight: 800 }}>{formatted}</span>
                                                    }
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
            {isCustomMetricModalOpen && (
                <div className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-emerald-100 rounded-lg">
                                    <Calculator className="w-5 h-5 text-emerald-600" />
                                </div>
                                <h3 className="text-lg font-bold text-gray-900">Custom Metric</h3>
                            </div>
                            <button onClick={() => setIsCustomMetricModalOpen(false)}><X className="w-5 h-5 text-gray-400" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Label</label>
                                <input
                                    type="text"
                                    id="cm-label"
                                    placeholder="e.g. Contribution Margin"
                                    className="w-full p-2 border border-gray-200 rounded-lg text-sm"
                                />
                            </div>
                            <div className="grid grid-cols-3 gap-2 items-end">
                                <div className="col-span-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Metric A</label>
                                    <select id="cm-a" className="w-full p-2 border border-gray-200 rounded-lg text-xs">
                                        {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                    </select>
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Op</label>
                                    <select id="cm-op" className="w-full p-2 border border-gray-200 rounded-lg text-xs">
                                        <option value="+">+</option>
                                        <option value="-">-</option>
                                        <option value="*">*</option>
                                        <option value="/">/</option>
                                    </select>
                                </div>
                                <div className="col-span-1">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Metric B</label>
                                    <select id="cm-b" className="w-full p-2 border border-gray-200 rounded-lg text-xs">
                                        {METRICS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                    </select>
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">Display As</label>
                                <select id="cm-type" className="w-full p-2 border border-gray-200 rounded-lg text-xs">
                                    <option value="currency">Currency</option>
                                    <option value="percent">Percent</option>
                                    <option value="number">Number</option>
                                </select>
                            </div>
                        </div>
                        <div className="p-6 bg-gray-50 flex gap-3">
                            <button
                                onClick={() => setIsCustomMetricModalOpen(false)}
                                className="flex-1 py-2 text-sm font-bold text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={() => {
                                    const label = (document.getElementById('cm-label') as HTMLInputElement).value;
                                    const metricA = (document.getElementById('cm-a') as HTMLSelectElement).value;
                                    const metricB = (document.getElementById('cm-b') as HTMLSelectElement).value;
                                    const operator = (document.getElementById('cm-op') as HTMLSelectElement).value as any;
                                    const type = (document.getElementById('cm-type') as HTMLSelectElement).value as any;

                                    if (label) {
                                        setCustomMetrics([...customMetrics, {
                                            id: Math.random().toString(36).substr(2, 9),
                                            label, metricA, metricB, operator, type
                                        }]);
                                        setIsCustomMetricModalOpen(false);
                                    }
                                }}
                                className="flex-1 py-2 text-sm font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
                            >
                                Create Metric
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};


