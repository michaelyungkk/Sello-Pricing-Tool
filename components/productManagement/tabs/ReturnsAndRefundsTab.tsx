import React, { useState, useMemo } from 'react';
import { RefundLog, Product, PricingRules, PriceLog } from '../../../types';
import { RotateCcw, DollarSign, Package, Info, ChevronDown, Calendar, AlertTriangle, Truck, Percent, Search, ArrowRight, Database } from 'lucide-react';
import { SortableHeader } from '../../common/SortableHeader';
import { formatPct, formatMoney } from '../../../utils/format';
import { MetricCard } from '../parts/MetricCard';
import { buildRefundOverview } from '../../../services/refundAgg';
import { sortRows, SortState } from '../../../utils/tableSort';
import { asDateKey } from '../../../services/dateUtils';
import { VAT_MULTIPLIER } from '../../../constants';
import { parseReturnsReason } from '../../../services/returnsReasonCodes';

interface ReturnsAndRefundsTabProps {
    refundHistory: RefundLog[];
    products: Product[];
    themeColor: string;
    pricingRules: PricingRules;
    onDeepDive: (sku: string) => void;
    priceHistoryMap?: Map<string, PriceLog[]>;
    startDate: string;
    endDate: string;
}

export const ReturnsAndRefundsTab: React.FC<ReturnsAndRefundsTabProps> = ({ 
    refundHistory = [], 
    products, 
    themeColor, 
    pricingRules, 
    onDeepDive,
    priceHistoryMap = new Map(),
    startDate,
    endDate
}) => {
    // State for filters and view mode
    const [platformScope, setPlatformScope] = useState<string>('All');
    const [includeResends, setIncludeResends] = useState(true);
    const [viewMode, setViewMode] = useState<'reason' | 'product'>('reason');
    
    // Sort state for the main detail table
    const [sortConfig, setSortConfig] = useState<SortState<string>>({ key: 'totalValue', dir: 'desc' });
    
    // Sort state for the triage table
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
        triageOverview
    } = useMemo(() => {
        const sStr = startDate;
        const eStr = endDate;

        // 1. Filter Refunds
        const filteredRefunds = refundHistory.filter(r => {
            const d = r.date.split('T')[0];
            if (d < sStr || d > eStr) return false;
            if (platformScope !== 'All' && r.platform !== platformScope) return false;
            
            // Handle Resend Logic
            const isResend = r.orderType === 'resend' || (r.id && r.id.toLowerCase().includes('resend'));
            if (!includeResends && isResend) return false;

            return true;
        });

        // 2. Aggregate FACTUAL Sales from priceHistoryMap (No Estimation)
        const salesMap = new Map<string, number>();
        const revenueMap = new Map<string, number>();
        const productMap = new Map<string, {name: string}>();

        priceHistoryMap.forEach((logs, sku) => {
            let skuPeriodSales = 0;
            let skuPeriodRevenue = 0;
            
            // Retrieve product for extra freight logic
            const product = productLookup.get(sku);
            const extraFreight = Number(product?.extraFreight) || 0;

            logs.forEach(log => {
                const logDate = asDateKey(log.date);
                if (!logDate) return;
                
                // Match window and platform
                if (logDate >= sStr && logDate <= eStr) {
                    if (platformScope === 'All' || log.platform === platformScope) {
                        skuPeriodSales += log.velocity;
                        skuPeriodRevenue += (log.velocity * (log.price + extraFreight) * VAT_MULTIPLIER);
                    }
                }
            });

            if (skuPeriodSales > 0 || skuPeriodRevenue > 0) {
                salesMap.set(sku, skuPeriodSales);
                revenueMap.set(sku, skuPeriodRevenue);
                const p = productLookup.get(sku);
                if (p) productMap.set(sku, { name: p.name });
            }
        });

        const totalValue = filteredRefunds.reduce((sum, r) => sum + ((Number(r.amount) + Number(r.freightAmount || 0)) * VAT_MULTIPLIER), 0);
        const totalCount = filteredRefunds.length;

        const triageOverview = buildRefundOverview(filteredRefunds, {
            salesMap,
            revenueMap,
            productMap
        });

        const reasonMap = new Map<string, { totalValue: number, count: number, skus: Set<string> }>();
        filteredRefunds.forEach(r => {
            const rawReason = r.reason || r.platformReason || r.customerReason || 'Unknown Reason';
            const meta = parseReturnsReason(rawReason);
            const key = meta.description || meta.short;
            
            if (!reasonMap.has(key)) {
                reasonMap.set(key, { totalValue: 0, count: 0, skus: new Set() });
            }
            const entry = reasonMap.get(key)!;
            const rowVal = (Number(r.amount) + Number(r.freightAmount || 0)) * VAT_MULTIPLIER;
            entry.totalValue += rowVal;
            entry.count++;
            entry.skus.add(r.sku);
        });

        const prodMap = new Map<string, { totalValue: number, count: number, reasons: Map<string, number> }>();
        filteredRefunds.forEach(r => {
            if (!prodMap.has(r.sku)) {
                prodMap.set(r.sku, { totalValue: 0, count: 0, reasons: new Map() });
            }
            const entry = prodMap.get(r.sku)!;
            const rowVal = (Number(r.amount) + Number(r.freightAmount || 0)) * VAT_MULTIPLIER;
            entry.totalValue += rowVal;
            entry.count++;
            
            const rawReason = r.reason || r.platformReason || r.customerReason || 'Unknown Reason';
            const meta = parseReturnsReason(rawReason);
            const key = meta.description || meta.short;

            entry.reasons.set(key, (entry.reasons.get(key) || 0) + 1);
        });
        
        const byReason = Array.from(reasonMap.entries()).map(([reason, data]) => ({ reason, ...data }));
        const byProduct = Array.from(prodMap.entries()).map(([sku, data]) => {
            const topReason = [...data.reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
            return { sku, ...data, topReason };
        });

        return { totalValue, totalCount, byReason, byProduct, triageOverview };
    }, [refundHistory, priceHistoryMap, startDate, endDate, platformScope, products, productLookup, includeResends]);

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

    const handleDeepDiveClick = (sku: string) => {
        try {
            if (!sku || sku === 'Unknown' || sku === 'Freight') {
                console.warn('[ReturnsAndRefundsTab] Invalid SKU for deep dive:', sku);
                alert(`Cannot deep dive into invalid SKU: "${sku || 'Empty'}"`);
                return;
            }

            if (!onDeepDive) {
                console.error('[ReturnsAndRefundsTab] onDeepDive prop is undefined');
                alert('Deep dive handler is missing. Please contact support.');
                return;
            }

            if (window.history && window.history.replaceState) {
                try {
                    const url = new URL(window.location.href);
                    url.searchParams.set('section', 'refunds');
                    const relativeUrl = window.location.protocol === 'blob:' 
                        ? url.search 
                        : url.pathname + url.search;
                    window.history.replaceState({}, '', relativeUrl);
                } catch (historyErr) {
                    console.warn('[ReturnsAndRefundsTab] Failed to set history state, proceeding with navigation only', historyErr);
                }
            }
            
            onDeepDive(sku);
        } catch (err) {
            console.error('[ReturnsAndRefundsTab] deep dive failed', err);
        }
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 pb-12">
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
                    <div className="flex items-center gap-4">
                        <div className="flex flex-col justify-center">
                            <span className="text-[10px] text-gray-400 font-medium uppercase leading-none mb-0.5">Data Coverage</span>
                            <span className="text-xs font-medium text-emerald-600 flex items-center gap-1.5">
                                <Database className="w-3 h-3" />
                                Actual History
                            </span>
                        </div>
                    </div>
                </div>
                
                <label className="flex items-center gap-2 text-xs font-bold text-gray-600 cursor-pointer select-none bg-white px-3 py-2 rounded-lg border border-gray-200 shadow-sm hover:border-indigo-300">
                    <input 
                        type="checkbox" 
                        checked={includeResends} 
                        onChange={e => setIncludeResends(e.target.checked)} 
                        className="rounded text-indigo-600 focus:ring-indigo-500 border-gray-300" 
                    />
                    Include Resends
                </label>
            </div>

            {/* Refund Triage KPI Section */}
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <MetricCard 
                        title="Refund Cases" 
                        value={triageOverview.kpis.totalRefundCount.toLocaleString()} 
                        icon={RotateCcw} 
                        color="orange" 
                        desc="Unique refund requests/cases"
                    />
                    <MetricCard 
                        title="Total Refund Value" 
                        value={formatMoney(triageOverview.kpis.totalRefundValue)} 
                        icon={DollarSign} 
                        color="red" 
                        desc="Total amount returned to customers (Inc VAT)"
                    />
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Avg Refund Rate (Qty)</span>
                            <div className="p-1.5 rounded-lg bg-indigo-50 text-indigo-600">
                                <Package className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                            {triageOverview.kpis.refundRateQty !== null ? formatPct(triageOverview.kpis.refundRateQty) : '—'}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tight">Units Returned / Actual Sold Units</div>
                    </div>
                    
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase">Avg Refund Rate (Value)</span>
                            <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600">
                                <DollarSign className="w-4 h-4" />
                            </div>
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                            {triageOverview.kpis.refundRateValue !== null ? formatPct(triageOverview.kpis.refundRateValue) : '—'}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tight">Amount Refunded / Actual Revenue</div>
                    </div>
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
                                    <SortableHeader label="Item Val" sortKey="itemValue" sort={triageSortConfig} onChange={setTriageSortConfig} themeColor={themeColor} align="right" />
                                    <SortableHeader label="Total Val" sortKey="refundValue" sort={triageSortConfig} onChange={setTriageSortConfig} themeColor={themeColor} align="right" />
                                    <SortableHeader label="Rate %" sortKey="refundRate" sort={triageSortConfig} onChange={setTriageSortConfig} themeColor={themeColor} align="right" />
                                    <th className="p-3">Top Reason</th>
                                    <th className="p-3">Flags</th>
                                    <th className="p-3 text-right pr-4">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {sortedTriageRows.length > 0 ? (
                                    sortedTriageRows.map((row) => {
                                        const isInvalidSku = !row.sku || row.sku === 'Unknown' || row.sku === 'Freight';
                                        return (
                                            <tr key={row.sku} className="hover:bg-gray-50/80 transition-colors group">
                                                <td className="p-3 pl-4">
                                                    <div className="font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">{row.sku}</div>
                                                    <div className="text-[10px] text-gray-500 truncate max-w-[200px]">{row.title}</div>
                                                </td>
                                                <td className="p-3 text-right font-medium text-gray-500">{row.refundCount}</td>
                                                <td className="p-3 text-right font-bold text-indigo-700 bg-indigo-50/30">{row.refundQty}</td>
                                                <td className="p-3 text-right font-medium text-gray-600">{formatMoney(row.itemValue)}</td>
                                                <td className="p-3 text-right font-bold text-red-600">{formatMoney(row.refundValue)}</td>
                                                <td className="p-3 text-right font-mono">
                                                    {row.refundRate !== null 
                                                        ? <span className={row.refundRate > 10 ? 'text-red-600 font-bold' : 'text-gray-600'}>{row.refundRate.toFixed(1)}%</span>
                                                        : <span className="text-gray-300">-</span>
                                                    }
                                                </td>
                                                <td className="p-3 text-gray-600 truncate max-w-[180px]">
                                                    {parseReturnsReason(row.topReasons[0]?.reason).description || 'Unknown'}
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
                                                        onClick={() => !isInvalidSku && handleDeepDiveClick(row.sku)}
                                                        disabled={isInvalidSku}
                                                        title={isInvalidSku ? "No catalogue metadata for this entry." : "Analyze detailed performance logs."}
                                                        className={`px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold shadow-sm transition-all flex items-center gap-1 ml-auto ${isInvalidSku ? 'opacity-30 cursor-not-allowed grayscale' : 'hover:border-indigo-300 hover:text-indigo-600 text-gray-600'}`}
                                                    >
                                                        Deep Dive <ArrowRight className="w-3 h-3" />
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })
                                ) : (
                                    <tr>
                                        <td colSpan={9} className="p-8 text-center text-gray-400 italic">No refund alerts found for this period.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
                
                <div className="flex justify-end text-[10px] text-gray-400 italic px-2">
                    Refund amounts displayed VAT-inclusive. Source file stores EX-VAT.
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                <div className="p-4 border-b border-custom-glass flex justify-between items-center bg-gray-50/50">
                    <h3 className="font-bold text-gray-800 text-sm uppercase">Refund Details Explorer</h3>
                    <div className="flex bg-white border border-gray-200 p-0.5 rounded-lg">
                        <button onClick={() => setViewMode('reason')} className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${viewMode === 'reason' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            <Info className="w-3.5 h-3.5" /> By Reason
                        </button>
                        <button onClick={() => setViewMode('product')} className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${viewMode === 'product' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            <Package className="w-3.5 h-3.5" /> By Product
                        </button>
                    </div>
                </div>

                <div className="p-6 pb-12">
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
                                {paginatedData.map((item: any) => {
                                    const isInvalidSku = viewMode === 'product' && (!item.sku || item.sku === 'Unknown' || item.sku === 'Freight');
                                    return (
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
                                                    <td className="p-3 truncate max-w-[150px] text-gray-600">
                                                        {parseReturnsReason(item.topReason).description || item.topReason}
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <button 
                                                            onClick={() => !isInvalidSku && handleDeepDiveClick(item.sku)}
                                                            disabled={isInvalidSku}
                                                            className={`p-1.5 bg-white border rounded transition-all ${isInvalidSku ? 'opacity-20 grayscale cursor-not-allowed' : 'border-gray-200 hover:border-indigo-300 text-gray-400 hover:text-indigo-600'}`} 
                                                            title={isInvalidSku ? "No catalogue metadata." : "Deep Dive"}
                                                        >
                                                            <Search className="w-3.5 h-3.5" />
                                                        </button>
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    )
                                })}
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