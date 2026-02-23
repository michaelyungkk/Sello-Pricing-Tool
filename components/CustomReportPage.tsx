
import React, { useState, useMemo } from 'react';
import { Product, PriceLog, RefundLog } from '../types';
import { getReportLayouts, saveReportLayout, ReportLayout } from '../services/persistenceService';
import { 
    Layout, 
    Plus, 
    GripVertical, 
    X, 
    Clock, 
    BarChart3, 
    Table as TableIcon, 
    Save, 
    FileText,
    Play,
    Loader2,
    Download,
    ArrowUp,
    ArrowDown,
    ListFilter,
    Filter,
    Calculator,
    Settings2
} from 'lucide-react';
import { formatMoney, formatPct, formatNumber } from '../utils/format';
import { GradeBadge } from './GradeBadge';
import * as XLSX from 'xlsx';

interface CustomReportPageProps {
    products: Product[];
    priceHistory: PriceLog[];
    refundHistory: RefundLog[];
    headerStyle: React.CSSProperties;
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
    value: string;
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
    headerStyle
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
    const [draggedItem, setDraggedItem] = useState<{ id: string; type: string; sourceZone?: string } | null>(null);
    
    const [isGenerating, setIsGenerating] = useState(false);
    const [reportResult, setReportResult] = useState<{
        rows: any[];
        colHeaders: any[];
        rowHeaders: string[];
    } | null>(null);
    const [needsGeneration, setNeedsGeneration] = useState(true);

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

    const handleAddRowDim = (id: string) => {
        if (!rowDims.includes(id)) {
            setRowDims([...rowDims, id]);
            setNeedsGeneration(true);
        }
    };

    const handleAddColDim = (id: string) => {
        if (!colDims.includes(id)) {
            setColDims([...colDims, id]);
            setNeedsGeneration(true);
        }
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
        setFilters([...pendingFilters]);
        setNeedsGeneration(true);
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
        setDraggedItem({ id, type, sourceZone });
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
        setDraggedItem(null);
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
        setDraggedItem(null);
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
        setDraggedItem(null);
    };

    const onDropFilter = (e: React.DragEvent) => {
        e.preventDefault();
        const id = e.dataTransfer.getData('id');
        const type = e.dataTransfer.getData('type');
        if (type === 'dim' || type === 'metric') {
            handleAddFilter(id, type);
        }
        setDraggedItem(null);
    };

    // --- PIVOT ENGINE ---
    const generateReport = async () => {
        if (rowDims.length === 0 || metrics.length === 0) return;
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
            const colValueSets = colDims.map(() => new Set<string>());

            // Helper to process a record (Sale or Refund)
            const processRecord = (item: any, type: 'SALE' | 'REFUND') => {
                const p = productMap.get(item.sku);
                if (!p) return;

                const rowKeyParts = rowDims.map(dim => {
                    if (dim === 'brand') return p.brand || 'Unbranded';
                    if (dim === 'category') return p.category || 'Uncategorized';
                    if (dim === 'platform') return item.platform || 'General';
                    if (dim === 'sku') return item.rawSku || item.sku;
                    return 'Unknown';
                });
                const rowKey = rowKeyParts.join('|');

                const colKeyParts = colDims.map((dim, idx) => {
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
                        metadata: rowDims.reduce((acc, dim, idx) => {
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
            if (colDims.length > 0) {
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

                    const getBaseValue = (mId: string) => {
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
                                    const valA = getBaseValue(custom.metricA);
                                    const valB = getBaseValue(custom.metricB);
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
                rowHeaders: rowDims
            });
            setIsGenerating(false);
            setNeedsGeneration(false);
        }, 100);
    };

    const processedData = useMemo(() => {
        if (!reportResult) return null;
        
        let rows = [...reportResult.rows];

        // Apply Filters
        if (filters.length > 0) {
            rows = rows.filter(row => {
                return filters.every(f => {
                    let val: any;
                    if (f.type === 'dim') {
                        const dimIdx = rowDims.indexOf(f.field);
                        val = row.rowKeyParts[dimIdx] || '';
                    } else {
                        val = row[`total_${f.field}`] || 0;
                    }

                    const targetVal = f.value;
                    switch (f.operator) {
                        case 'equals': return String(val).toLowerCase() === targetVal.toLowerCase();
                        case 'contains': return String(val).toLowerCase().includes(targetVal.toLowerCase());
                        case 'gt': return Number(val) > Number(targetVal);
                        case 'lt': return Number(val) < Number(targetVal);
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
    }, [reportResult, filters, sortRules, rowDims]);

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

        const data = processedData.map(row => {
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
        <div className="flex flex-col h-full space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                        <TableIcon className="w-6 h-6 text-indigo-600" />
                    </div>
                    <div>
                        <input 
                            type="text" 
                            value={reportName}
                            onChange={(e) => setReportName(e.target.value)}
                            className="text-2xl font-bold bg-transparent border-none focus:ring-0 p-0 w-64"
                            style={headerStyle}
                        />
                        <p className="text-xs text-gray-400">Advanced Pivot Report Builder v2.0</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {needsGeneration && (
                        <button 
                            onClick={generateReport}
                            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition-all shadow-lg animate-pulse"
                        >
                            <Play className="w-4 h-4 fill-current" />
                            Generate Report
                        </button>
                    )}
                    <button 
                        onClick={handleExport}
                        disabled={!reportResult}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm disabled:opacity-50"
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                    <button 
                        onClick={handleSave}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all shadow-sm"
                    >
                        <Save className="w-4 h-4" />
                        Save Layout
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-12 gap-6 flex-1 min-h-0">
                {/* Left Sidebar: Palette */}
                <div className="col-span-3 space-y-6 overflow-y-auto pr-2">
                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Dimensions</h3>
                        <div className="grid gap-2">
                            {DIMENSIONS.map(dim => (
                                <div
                                    key={dim.id}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, dim.id, 'dim')}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-50 hover:border-indigo-200 hover:bg-indigo-50 transition-all group cursor-grab active:cursor-grabbing"
                                >
                                    <dim.icon className="w-4 h-4 text-gray-400 group-hover:text-indigo-600" />
                                    <span className="text-sm font-medium text-gray-700">{dim.label}</span>
                                    <div className="flex gap-1 ml-auto">
                                        <button onClick={() => handleAddRowDim(dim.id)} className="p-1 hover:bg-indigo-100 rounded text-indigo-400 hover:text-indigo-600" title="Add to Rows">
                                            <ArrowDown className="w-3 h-3" />
                                        </button>
                                        <button onClick={() => handleAddColDim(dim.id)} className="p-1 hover:bg-indigo-100 rounded text-indigo-400 hover:text-indigo-600" title="Add to Columns">
                                            <ArrowUp className="w-3 h-3 rotate-90" />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Metrics</h3>
                            <button 
                                onClick={() => setIsCustomMetricModalOpen(true)}
                                className="p-1 hover:bg-emerald-50 text-emerald-600 rounded transition-colors"
                                title="Create Custom Metric"
                            >
                                <Plus className="w-4 h-4" />
                            </button>
                        </div>
                        <div className="grid gap-2">
                            {METRICS.map(metric => (
                                <button
                                    key={metric.id}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, metric.id, 'metric')}
                                    onClick={() => handleAddMetric(metric.id)}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-gray-50 hover:border-emerald-200 hover:bg-emerald-50 transition-all group cursor-grab active:cursor-grabbing"
                                >
                                    <metric.icon className="w-4 h-4 text-gray-400 group-hover:text-emerald-600" />
                                    <span className="text-sm font-medium text-gray-700">{metric.label}</span>
                                    <Plus className="w-3 h-3 ml-auto text-gray-300 group-hover:text-emerald-600" />
                                </button>
                            ))}
                            {customMetrics.map(metric => (
                                <button
                                    key={metric.id}
                                    draggable
                                    onDragStart={(e) => onDragStart(e, metric.id, 'metric')}
                                    onClick={() => handleAddMetric(metric.id)}
                                    className="flex items-center gap-3 p-3 rounded-lg border border-emerald-100 bg-emerald-50/30 hover:bg-emerald-50 transition-all group cursor-grab active:cursor-grabbing"
                                >
                                    <Calculator className="w-4 h-4 text-emerald-600" />
                                    <span className="text-sm font-medium text-emerald-700">{metric.label}</span>
                                    <Plus className="w-3 h-3 ml-auto text-emerald-300 group-hover:text-emerald-600" />
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 space-y-4">
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest">Saved Layouts</h3>
                        <div className="space-y-2">
                            {savedLayouts.length === 0 ? (
                                <p className="text-xs text-gray-400 italic">No saved reports yet.</p>
                            ) : (
                                savedLayouts.map(layout => (
                                    <div key={layout.id} className="flex items-center justify-between group">
                                        <button 
                                            onClick={() => handleLoadLayout(layout)}
                                            className="text-xs font-medium text-gray-600 hover:text-indigo-600 truncate flex-1 text-left"
                                        >
                                            {layout.name}
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Main Area: Drop Zones & Table */}
                <div className="col-span-9 flex flex-col space-y-6 min-h-0">
                    {/* Config Bar */}
                    <div className="bg-white/50 backdrop-blur-md border border-gray-100 rounded-2xl p-4 shadow-sm space-y-4">
                        <div className="flex items-center gap-4">
                            <div className="flex items-center gap-2">
                                <ListFilter className="w-4 h-4 text-gray-400" />
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Active Sorting:</span>
                                <div className="flex gap-1">
                                    {sortRules.map((rule, i) => (
                                        <div key={i} className="px-2 py-1 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold flex items-center gap-1">
                                            {rule.key.replace(/_/g, ' ')}
                                            {rule.dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5" /> : <ArrowDown className="w-2.5 h-2.5" />}
                                            <button onClick={() => { setSortRules(sortRules.filter((_, idx) => idx !== i)); }}>
                                                <X className="w-2.5 h-2.5" />
                                            </button>
                                        </div>
                                    ))}
                                    {sortRules.length === 0 && <span className="text-[10px] text-gray-400 italic">No sorting applied</span>}
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-4 gap-4">
                            {/* Rows Drop Zone */}
                            <div 
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDropRow(e)}
                                className="bg-gray-50/50 border border-dashed border-gray-200 rounded-xl p-3 min-h-[60px]"
                            >
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Rows</span>
                                <div className="flex flex-wrap gap-1.5">
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
                                    {rowDims.length === 0 && <span className="text-[10px] text-gray-400 italic">Drop dimensions...</span>}
                                </div>
                            </div>

                            {/* Columns Drop Zone */}
                            <div 
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDropCol(e)}
                                className="bg-gray-50/50 border border-dashed border-gray-200 rounded-xl p-3 min-h-[60px]"
                            >
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Columns</span>
                                <div className="flex flex-wrap gap-1.5">
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
                                    {colDims.length === 0 && <span className="text-[10px] text-gray-400 italic">Drop dimensions...</span>}
                                </div>
                            </div>

                            {/* Metrics Drop Zone */}
                            <div 
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDropMetric(e)}
                                className="bg-gray-50/50 border border-dashed border-gray-200 rounded-xl p-3 min-h-[60px]"
                            >
                                <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block mb-2">Metrics</span>
                                <div className="flex flex-wrap gap-1.5">
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
                                    {metrics.length === 0 && <span className="text-[10px] text-gray-400 italic">Drop metrics...</span>}
                                </div>
                            </div>

                            {/* Filters Drop Zone */}
                            <div 
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={onDropFilter}
                                className="bg-gray-50/50 border border-dashed border-gray-200 rounded-xl p-3 min-h-[60px]"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[9px] font-bold text-gray-400 uppercase tracking-widest block">Filters</span>
                                    {pendingFilters.length > 0 && (
                                        <button 
                                            onClick={applyFilters}
                                            className="text-[8px] font-bold text-indigo-600 hover:underline"
                                        >
                                            Apply Filters
                                        </button>
                                    )}
                                </div>
                                <div className="flex flex-col gap-2">
                                    {pendingFilters.map((f, idx) => (
                                        <div key={f.id} className="flex items-center gap-2 bg-white p-1.5 border border-gray-100 rounded shadow-sm">
                                            <span className="text-[9px] font-bold text-gray-500 w-16 truncate">
                                                {f.type === 'dim' ? getDimLabel(f.field) : getMetricLabel(f.field)}
                                            </span>
                                            <select 
                                                value={f.operator}
                                                onChange={(e) => {
                                                    const next = [...pendingFilters];
                                                    next[idx].operator = e.target.value as any;
                                                    setPendingFilters(next);
                                                }}
                                                className="text-[9px] border-none bg-gray-50 rounded p-0.5 focus:ring-0"
                                            >
                                                {f.type === 'dim' ? (
                                                    <>
                                                        <option value="contains">Contains</option>
                                                        <option value="equals">Equals</option>
                                                    </>
                                                ) : (
                                                    <>
                                                        <option value="gt">&gt;</option>
                                                        <option value="lt">&lt;</option>
                                                        <option value="equals">=</option>
                                                    </>
                                                )}
                                            </select>
                                            <input 
                                                type="text" 
                                                value={f.value}
                                                onChange={(e) => {
                                                    const next = [...pendingFilters];
                                                    next[idx].value = e.target.value;
                                                    setPendingFilters(next);
                                                }}
                                                placeholder="Value..."
                                                className="text-[9px] border-none bg-gray-50 rounded p-0.5 w-full focus:ring-0"
                                            />
                                            <button onClick={() => handleRemoveFilter(f.id)}><X className="w-2.5 h-2.5 text-gray-400" /></button>
                                        </div>
                                    ))}
                                    {pendingFilters.length === 0 && <span className="text-[10px] text-gray-400 italic">Drop items to filter...</span>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Table Container */}
                    <div className="flex-1 bg-white rounded-2xl border border-gray-100 shadow-xl overflow-hidden flex flex-col relative">
                        {needsGeneration && !isGenerating && !reportResult && (
                            <div className="absolute inset-0 z-30 bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
                                <button 
                                    onClick={generateReport}
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
                                <table className="w-full text-left border-collapse table-fixed min-w-max">
                                    <thead className="bg-gray-50 text-gray-600 text-[10px] uppercase font-bold sticky top-0 z-20 shadow-sm">
                                        <tr>
                                            {reportResult.rowHeaders.map(rh => (
                                                <th key={rh} rowSpan={2} className="sticky left-0 z-30 bg-gray-100 border-b border-r border-gray-200 px-6 py-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest min-w-[200px]">
                                                    <div className="flex items-center justify-between cursor-pointer" onClick={() => handleSort(rh)}>
                                                        {getDimLabel(rh)}
                                                        {sortRules[0]?.key === rh && (
                                                            sortRules[0].dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-indigo-600" /> : <ArrowDown className="w-2.5 h-2.5 text-indigo-600" />
                                                        )}
                                                    </div>
                                                </th>
                                            ))}
                                            {reportResult.colHeaders.map(ch => (
                                                <th key={ch.id} colSpan={metrics.length} className="px-4 py-3 text-center border-b border-r border-gray-200 bg-indigo-50/50 text-[10px] font-bold text-indigo-700 uppercase tracking-wider">
                                                    {ch.label}
                                                </th>
                                            ))}
                                            <th colSpan={metrics.length} className="px-4 py-3 text-center border-b border-gray-200 bg-gray-100 text-[10px] font-bold text-gray-700 uppercase tracking-wider">
                                                Grand Total
                                            </th>
                                        </tr>
                                        <tr>
                                            {reportResult.colHeaders.map(ch => (
                                                metrics.map(m => (
                                                    <th 
                                                        key={`${ch.id}_${m.id}`} 
                                                        onClick={(e) => handleSort(`${ch.id}_${m.id}`, e)}
                                                        className="px-4 py-2 text-right border-b border-r border-gray-100 bg-white text-[9px] font-bold text-gray-400 uppercase cursor-pointer hover:bg-gray-50 transition-colors min-w-[110px]"
                                                    >
                                                        <div className="flex items-center justify-end gap-1">
                                                            <div className="flex flex-col items-end">
                                                                <span>{getMetricLabel(m.metricId)}</span>
                                                                <span className="text-[7px] opacity-60">({m.timeRange})</span>
                                                            </div>
                                                            {sortRules[0]?.key === `${ch.id}_${m.id}` && (
                                                                sortRules[0].dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-indigo-600" /> : <ArrowDown className="w-2.5 h-2.5 text-indigo-600" />
                                                            )}
                                                        </div>
                                                    </th>
                                                ))
                                            ))}
                                            {metrics.map(m => (
                                                <th 
                                                    key={`total_${m.id}`} 
                                                    onClick={(e) => handleSort(`total_${m.id}`, e)}
                                                    className="px-4 py-2 text-right border-b border-gray-100 bg-gray-50 text-[9px] font-bold text-gray-600 uppercase cursor-pointer hover:bg-gray-100 transition-colors min-w-[110px]"
                                                >
                                                    <div className="flex items-center justify-end gap-1">
                                                        <div className="flex flex-col items-end">
                                                            <span>{getMetricLabel(m.metricId)}</span>
                                                            <span className="text-[7px] opacity-60">({m.timeRange})</span>
                                                        </div>
                                                        {sortRules[0]?.key === `total_${m.id}` && (
                                                            sortRules[0].dir === 'asc' ? <ArrowUp className="w-2.5 h-2.5 text-indigo-600" /> : <ArrowDown className="w-2.5 h-2.5 text-indigo-600" />
                                                        )}
                                                    </div>
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100 bg-white">
                                        {processedData.map((row, idx) => (
                                            <tr key={idx} className="hover:bg-gray-50 transition-colors group">
                                                {row.rowKeyParts.map((part: string, pIdx: number) => {
                                                    const dim = reportResult.rowHeaders[pIdx];
                                                    const meta = row.metadata[dim];
                                                    
                                                    if (dim === 'sku' && meta) {
                                                        return (
                                                            <td key={pIdx} className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 border-r border-gray-100 px-6 py-4 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-gray-900 font-mono text-xs">{meta.sku}</span>
                                                                    <GradeBadge gradeLevel={meta.gradeLevel} />
                                                                </div>
                                                                <div className="text-[10px] text-gray-500 truncate max-w-[180px]">{meta.name}</div>
                                                            </td>
                                                        );
                                                    }

                                                    return (
                                                        <td key={pIdx} className="sticky left-0 z-10 bg-white group-hover:bg-gray-50 border-r border-gray-100 px-6 py-4 text-xs font-bold text-gray-900 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">
                                                            {part}
                                                        </td>
                                                    );
                                                })}
                                                {reportResult.colHeaders.map(ch => (
                                                    metrics.map(m => {
                                                        const val = row[`${ch.id}_${m.id}`];
                                                        const mConfig = getMetricConfig(m.metricId);
                                                        
                                                        let cellClass = "px-4 py-4 text-right text-xs font-medium border-r border-gray-50";
                                                        if (m.metricId === 'margin' || m.metricId === 'roi' || m.metricId === 'profit') {
                                                            if (val < 0) cellClass += " text-red-600 bg-red-50/50";
                                                            else if (val >= 15 && m.metricId !== 'profit') cellClass += " text-green-600 bg-green-50/50";
                                                            else if (val >= 0) cellClass += " text-gray-700";
                                                        } else {
                                                            cellClass += " text-gray-600";
                                                        }

                                                        return (
                                                            <td key={`${ch.id}_${m.id}`} className={cellClass}>
                                                                {val === 0 && mConfig?.type !== 'percent' ? (
                                                                    <span className="text-gray-300">-</span>
                                                                ) : (
                                                                    mConfig?.type === 'currency' ? formatMoney(val, 0) : 
                                                                    mConfig?.type === 'percent' ? formatPct(val) : 
                                                                    formatNumber(val)
                                                                )}
                                                            </td>
                                                        );
                                                    })
                                                ))}
                                                {metrics.map(m => {
                                                    const val = row[`total_${m.id}`];
                                                    const mConfig = getMetricConfig(m.metricId);
                                                    
                                                    let cellClass = "px-4 py-4 text-right text-xs font-bold bg-gray-50/30";
                                                    if (m.metricId === 'margin' || m.metricId === 'roi' || m.metricId === 'profit') {
                                                        if (val < 0) cellClass += " text-red-600";
                                                        else if (val >= 15 && m.metricId !== 'profit') cellClass += " text-green-600";
                                                        else cellClass += " text-gray-900";
                                                    } else {
                                                        cellClass += " text-gray-900";
                                                    }

                                                    return (
                                                        <td key={`total_${m.id}`} className={cellClass}>
                                                            {val === 0 && mConfig?.type !== 'percent' ? (
                                                                <span className="text-gray-300">-</span>
                                                            ) : (
                                                                mConfig?.type === 'currency' ? formatMoney(val, 0) : 
                                                                mConfig?.type === 'percent' ? formatPct(val) : 
                                                                formatNumber(val)
                                                            )}
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


