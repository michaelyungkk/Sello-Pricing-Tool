import React, { useState, useMemo } from 'react';
import { RefundLog, Product, PricingRules } from '../../../types';
import { RotateCcw, DollarSign, Package, Info, ChevronDown, Calendar, AlertTriangle, Truck, Percent, Search, ArrowRight } from 'lucide-react';
import { SortableHeader } from '../../common/SortableHeader';
import { formatPct, formatMoney } from '../../../utils/format';
import { MetricCard } from '../parts/MetricCard';
import { buildRefundOverview } from '../../../services/refundAgg';
import { sortRows, SortState } from '../../../utils/tableSort';

interface ReturnsAndRefundsTabProps {
    refundHistory: RefundLog[];
    products: Product[];
    themeColor: string;
    pricingRules: PricingRules;
    onDeepDive: (sku: string) => void;
}

type DateRange = 'yesterday' | '7d' | '30d' | 'custom';

export const ReturnsAndRefundsTab: React.FC<ReturnsAndRefundsTabProps> = ({ refundHistory = [], products, themeColor, pricingRules, onDeepDive }) => {
    // State for filters and view mode
    const [range, setRange] = useState<DateRange>('30d');
    const [customStart, setCustomStart] = useState(new Date().toISOString().split('T')[0]);
    const [customEnd, setCustomEnd] = useState(new Date().toISOString().split('T')[0]);
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [platformScope, setPlatformScope] = useState<string>('All');
    const [viewMode, setViewMode] = useState<'reason' | 'product'>('reason');
    
    // Sort state for the main detail table
    const [sortConfig, setSortConfig] = useState<SortState<string>>({ key: 'totalValue', dir: 'desc' });
    
    // Sort state for the triage table (Task specific)
    const [triageSortConfig, setTriageSortConfig] = useState<SortState<string>>({ key: 'refundQty', dir: 'desc' });

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const productLookup = useMemo(() => new Map(products.map(p => [p.sku, p])), [products]);

    // Main data processing memo
    const { 
        totalValue, 
        totalCount, 
        byReason, 
        byProduct, 
        periodLabel,
        triageOverview
    } = useMemo(() => {
        let startDate = new Date();
        let endDate = new Date();

        if (range === 'yesterday') {
            startDate.setDate(startDate.getDate() - 1);
            endDate.setDate(endDate.getDate() - 1);
        } else if (range === '7d') {
            startDate.setDate(startDate.getDate() - 7);
            endDate.setDate(endDate.getDate() - 1);
        } else if (range === '30d') {
            startDate.setDate(startDate.getDate() - 30);
            endDate.setDate(endDate.getDate() - 1);
        } else if (range === 'custom') {
            startDate = new Date(customStart);
            endDate = new Date(customEnd);
        }

        const format = (d: Date, withYear: boolean) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined });
        const sameYear = startDate.getFullYear() === endDate.getFullYear();
        const label = `${format(startDate, !sameYear)} – ${format(endDate, true)}`;
        
        const sStr = startDate.toISOString().split('T')[0];
        const eStr = endDate.toISOString().split('T')[0];

        const filtered = refundHistory.filter(r => {
            const d = r.date.split('T')[0];
            if (d < sStr || d > eStr) return false;
            if (platformScope !== 'All' && r.platform !== platformScope) return false;
            return true;
        });

        const totalValue = filtered.reduce((sum, r) => sum + r.amount, 0);
        const totalCount = filtered.length;

        // --- NEW: Refund Aggregation Service Call ---
        const durationMs = endDate.getTime() - startDate.getTime();
        const days = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)) + 1);
        
        const salesMap = new Map<string, number>();
        const productMap = new Map<string, {name: string}>();
        
        products.forEach(p => {
             // Estimate total period sales from averageDailySales
             salesMap.set(p.sku, (p.averageDailySales || 0) * days);
             productMap.set(p.sku, { name: p.name });
        });

        const triageOverview = buildRefundOverview(filtered, {
            salesMap,
            productMap
        });

        // --- LEGACY AGGREGATION (Keep for Table compatibility) ---
        const reasonMap = new Map<string, { totalValue: number, count: number, skus: Set<string> }>();
        filtered.forEach(r => {
            const reason = r.reason || r.platformReason || r.customerReason || 'Unknown Reason';
            if (!reasonMap.has(reason)) {
                reasonMap.set(reason, { totalValue: 0, count: 0, skus: new Set() });
            }
            const entry = reasonMap.get(reason)!;
            entry.totalValue += r.amount;
            entry.count++;
            entry.skus.add(r.sku);
        });

        const prodMap = new Map<string, { totalValue: number, count: number, reasons: Map<string, number> }>();
        filtered.forEach(r => {
            if (!prodMap.has(r.sku)) {
                prodMap.set(r.sku, { totalValue: 0, count: 0, reasons: new Map() });
            }
            const entry = prodMap.get(r.sku)!;
            entry.totalValue += r.amount;
            entry.count++;
            const reason = r.reason || r.platformReason || r.customerReason || 'Unknown Reason';
            entry.reasons.set(reason, (entry.reasons.get(reason) || 0) + 1);
        });
        
        const byReason = Array.from(reasonMap.entries()).map(([reason, data]) => ({ reason, ...data }));
        const byProduct = Array.from(prodMap.entries()).map(([sku, data]) => {
            const topReason = [...data.reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
            return { sku, ...data, topReason };
        });

        return { totalValue, totalCount, byReason, byProduct, periodLabel: label, triageOverview };
    }, [refundHistory, range, customStart, customEnd, platformScope, products]);

    // Data for the Detail Explorer view
    const currentTableData = useMemo(() => {
        const data = viewMode === 'reason' ? byReason : byProduct;
        const getValue = (row: any, key: string) => row[key];
        return sortRows(data, sortConfig, getValue);
    }, [byReason, byProduct, viewMode, sortConfig]);

    // Data for the Triage table (Sorted)
    const sortedTriageRows = useMemo(() => {
        const getValue = (row: any, key: string) => {
            if (key === 'refundQty') return row.refundQty;
            if (key === 'refundCount') return row.refundCount;
            if (key === 'refundValue') return row.refundValue;
            if (key === 'refundRate') return row.refundRate || 0;
            return row[key];
        };
        return sortRows(triageOverview.skuRows, triageSortConfig, getValue);
    }, [triageOverview.skuRows, triageSortConfig]);

    const paginatedData = currentTableData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalPages = Math.ceil(currentTableData.length / itemsPerPage);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
             <div className="flex flex-col md:flex-row justify-between items-center bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm gap-4 relative z-10">
                <div className="flex items-center gap-2">
                    <div className="relative">
                        <select 
                            value={platformScope} 
                            onChange={(e) => setPlatformScope(e.target.value)}
                            className="appearance-none bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold py-2 pl-4 pr-10 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="All">Global View (All)</option>
                            {Object.keys(pricingRules).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                        <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-indigo-600 pointer-events-none" />
                    </div>
                    <div className="h-8 w-px bg-gray-300 mx-2"></div>
                    <div className="relative">
                        <button
                            onClick={() => setShowDatePicker(!showDatePicker)}
                            className={`p-2 border rounded-lg hover:bg-gray-50 transition-colors ${showDatePicker || range === 'custom' ? 'border-indigo-300 text-indigo-600 bg-indigo-50' : 'border-gray-200 text-gray-600 bg-white/50'}`}
                        >
                            <Calendar className="w-5 h-5" />
                        </button>
                        {showDatePicker && (
                            <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-xl p-4 z-50 animate-in fade-in slide-in-from-top-2 w-64">
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-3">Custom Range</label>
                                <div className="space-y-3">
                                    <input type="date" value={customStart} onChange={(e) => { setCustomStart(e.target.value); setRange('custom'); }} className="border rounded px-2 py-1.5 text-sm w-full" />
                                    <input type="date" value={customEnd} onChange={(e) => { setCustomEnd(e.target.value); setRange('custom'); }} min={customStart} className="border rounded px-2 py-1.5 text-sm w-full" />
                                </div>
                                <div className="mt-3 flex justify-end"><button onClick={() => setShowDatePicker(false)} className="text-xs text-indigo-600 font-bold">Close</button></div>
                            </div>
                        )}
                    </div>
                    <div className="flex bg-gray-100 p-1 rounded-lg overflow-x-auto no-scrollbar">
                        {['yesterday', '7d', '30d'].map((r: any) => (
                            <button
                                key={r}
                                onClick={() => setRange(r)}
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${range === r ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                {r === 'yesterday' ? 'Yesterday' : r === '7d' ? '7 Days' : '30 Days'}
                            </button>
                        ))}
                    </div>
                    <div className="ml-3 flex flex-col justify-center pl-2 border-l border-gray-200">
                        <span className="text-[10px] text-gray-400 font-bold uppercase leading-none mb-0.5">Analyzing Period</span>
                        <span className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">
                            <Calendar className="w-3 h-3" />
                            {periodLabel}
                        </span>
                    </div>
                </div>
            </div>

            {/* Refund Triage Section */}
            <div className="space-y-4">
                <div className="flex items-center gap-2 mb-2">
                    <div className="p-2 bg-orange-100 rounded-lg text-orange-600">
                        <AlertTriangle className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-gray-900">Refund Triage</h3>
                        <p className="text-xs text-gray-500">High priority items requiring attention.</p>
                    </div>
                </div>
                
                <div className="bg-blue-50 border border-blue-200 p-3 rounded-lg flex items-start gap-3 animate-in fade-in">
                    <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-xs text-blue-800 leading-relaxed">
                        <strong>Data Definition:</strong> <span className="font-bold">Count</span> indicates the number of unique refund records (cases). <span className="font-bold">Qty</span> indicates the total physical units returned. Table is sorted by <span className="font-bold text-indigo-700">Qty</span> by default.
                    </p>
                </div>
                
                {/* KPIs */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <MetricCard 
                        title="Refund Count" 
                        value={triageOverview.kpis.totalRefundCount.toLocaleString()} 
                        icon={RotateCcw} 
                        color="orange" 
                        desc="Total units returned in period"
                    />
                    <MetricCard 
                        title="Refund Value" 
                        value={formatMoney(triageOverview.kpis.totalRefundValue)} 
                        icon={DollarSign} 
                        color="red" 
                        desc="Total refunded amount"
                    />
                    <MetricCard 
                        title="Est. Logistics Fees" 
                        value={formatMoney(triageOverview.kpis.totalLogisticsFees)} 
                        icon={Truck} 
                        color="gray" 
                        desc="Estimated shipping loss (if tracked)"
                    />
                    <MetricCard 
                        title="Avg Refund Rate" 
                        value={triageOverview.kpis.refundRate !== null ? formatPct(triageOverview.kpis.refundRate) : '—'} 
                        icon={Percent} 
                        color="purple" 
                        desc="% of Sales Volume Returned"
                    />
                </div>

                {/* SKU Alerts Table */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col max-h-[500px]">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h4 className="font-bold text-gray-800 text-sm uppercase flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            SKU Alerts
                        </h4>
                        <span className="text-xs text-gray-400 font-medium">Click headers to sort</span>
                    </div>
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                            <thead className="bg-white text-gray-500 font-semibold border-b border-gray-100 sticky top-0 z-10">
                                <tr>
                                    <SortableHeader label="SKU / Product" sortKey="sku" sort={triageSortConfig} onChange={setTriageSortConfig} themeColor={themeColor} />
                                    <SortableHeader label="Count" sortKey="refundCount" sort={triageSortConfig} onChange={setTriageSortConfig} themeColor={themeColor} align="right" />
                                    <SortableHeader label="Qty" sortKey="refundQty" sort={triageSortConfig} onChange={setTriageSortConfig} themeColor={themeColor} align="right" />
                                    <SortableHeader label="Value" sortKey="refundValue" sort={triageSortConfig} onChange={setTriageSortConfig} themeColor={themeColor} align="right" />
                                    <SortableHeader label="Rate %" sortKey="refundRate" sort={triageSortConfig} onChange={setTriageSortConfig} themeColor={themeColor} align="right" />
                                    <th className="p-3">Top Reason</th>
                                    <th className="p-3">Flags</th>
                                    <th className="p-3 text-right pr-4">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {sortedTriageRows.length > 0 ? (
                                    sortedTriageRows.map((row) => (
                                        <tr key={row.sku} className="hover:bg-gray-50/80 transition-colors group">
                                            <td className="p-3 pl-4">
                                                <div className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{row.sku}</div>
                                                <div className="text-[10px] text-gray-500 truncate max-w-[200px]">{row.title}</div>
                                            </td>
                                            <td className="p-3 text-right font-medium text-gray-500">{row.refundCount}</td>
                                            <td className="p-3 text-right font-bold text-indigo-700 bg-indigo-50/30">{row.refundQty}</td>
                                            <td className="p-3 text-right font-bold text-red-600">{formatMoney(row.refundValue)}</td>
                                            <td className="p-3 text-right font-mono">
                                                {row.refundRate !== null 
                                                    ? <span className={row.refundRate > 10 ? 'text-red-600 font-bold' : 'text-gray-600'}>{row.refundRate.toFixed(1)}%</span>
                                                    : <span className="text-gray-300">-</span>
                                                }
                                            </td>
                                            <td className="p-3 text-gray-600 truncate max-w-[180px]">
                                                {row.topReasons[0]?.reason || 'Unknown'}
                                                {row.topReasons[0] && <span className="text-gray-400 ml-1 text-[10px]">({row.topReasons[0].count})</span>}
                                            </td>
                                            <td className="p-3">
                                                <div className="flex gap-1 flex-wrap">
                                                    {row.flags.map(flag => (
                                                        <span key={flag} className="px-1.5 py-0.5 bg-red-100 text-red-700 text-[9px] rounded border border-red-200 font-bold uppercase whitespace-nowrap">
                                                            {flag}
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>
                                            <td className="p-3 pr-4 text-right">
                                                <button 
                                                    onClick={() => onDeepDive(row.sku)}
                                                    className="px-3 py-1.5 bg-white border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 text-gray-600 rounded-lg text-[10px] font-bold shadow-sm transition-all flex items-center gap-1 ml-auto"
                                                >
                                                    Deep Dive <ArrowRight className="w-3 h-3" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={8} className="p-8 text-center text-gray-400 italic">No refund alerts found for this period.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                <div className="p-4 border-b border-custom-glass flex justify-between items-center bg-gray-50/50">
                    <h3 className="font-bold text-gray-800 text-sm uppercase">Refund Details Explorer</h3>
                    <div className="flex bg-white border border-gray-200 p-0.5 rounded-lg">
                        <button onClick={() => setViewMode('reason')} className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${viewMode === 'reason' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            <Info className="w-3.5 h-3.5" /> By Reason
                        </button>
                        <button onClick={() => setViewMode('product')} className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${viewMode === 'product' ? 'bg-indigo-50 text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            <Package className="w-3.5 h-3.5" /> By Product
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    <div className="overflow-auto border rounded-lg max-h-[400px]">
                        <table className="w-full text-left text-xs whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-500 uppercase font-medium sticky top-0 z-10 shadow-sm">
                                {viewMode === 'reason' ? (
                                    <tr>
                                        <SortableHeader label="Reason" sortKey="reason" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                                        <SortableHeader label="Count" sortKey="count" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right"/>
                                        <SortableHeader label="Value" sortKey="totalValue" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right"/>
                                        <th className="p-3 text-right">SKUs Affected</th>
                                    </tr>
                                ) : (
                                    <tr>
                                        <SortableHeader label="SKU" sortKey="sku" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                                        <SortableHeader label="Count" sortKey="count" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right"/>
                                        <SortableHeader label="Value" sortKey="totalValue" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right"/>
                                        <th className="p-3">Top Reason</th>
                                        <th className="p-3 text-right w-12">Action</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {paginatedData.map((item: any) => (
                                    <tr key={viewMode === 'reason' ? item.reason : item.sku} className="hover:bg-gray-50/50 transition-colors">
                                        {viewMode === 'reason' ? (
                                            <>
                                                <td className="p-3 font-medium text-gray-700 truncate max-w-xs" title={item.reason}>{item.reason}</td>
                                                <td className="p-3 text-right font-mono">{item.count}</td>
                                                <td className="p-3 text-right font-mono font-bold text-red-600">£{item.totalValue.toFixed(2)}</td>
                                                <td className="p-3 text-right font-mono">{item.skus.size}</td>
                                            </>
                                        ) : (
                                            <>
                                                <td className="p-3">
                                                    <div className="font-mono font-bold text-gray-800">{item.sku}</div>
                                                    <div className="text-gray-500 truncate max-w-[150px]">{productLookup.get(item.sku)?.name || ''}</div>
                                                </td>
                                                <td className="p-3 text-right font-mono">{item.count}</td>
                                                <td className="p-3 text-right font-mono font-bold text-red-600">£{item.totalValue.toFixed(2)}</td>
                                                <td className="p-3 truncate max-w-[150px] text-gray-600">{item.topReason}</td>
                                                <td className="p-3 text-right">
                                                    <button onClick={() => onDeepDive(item.sku)} className="p-1.5 bg-white border border-gray-200 rounded hover:border-indigo-300 text-gray-400 hover:text-indigo-600 transition-colors" title="Deep Dive">
                                                        <Search className="w-3.5 h-3.5" />
                                                    </button>
                                                </td>
                                            </>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {paginatedData.length === 0 && <div className="p-4 text-center text-gray-400 italic">No refunds in this period.</div>}
                    </div>
                </div>
                 {totalPages > 1 && (
                    <div className="bg-gray-50/50 px-4 py-3 border-t border-custom-glass flex items-center justify-end">
                         <div className="flex gap-1">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2 py-1 border rounded bg-white disabled:opacity-50 text-xs font-bold text-gray-600 hover:bg-gray-50">Prev</button>
                            <span className="px-2 py-1 text-xs text-gray-500 font-medium">Page {currentPage} of {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2 py-1 border rounded bg-white disabled:opacity-50 text-xs font-bold text-gray-600 hover:bg-gray-50">Next</button>
                         </div>
                    </div>
                 )}
            </div>
        </div>
    );
};