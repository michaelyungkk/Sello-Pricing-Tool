
import React, { useState, useMemo } from 'react';
import { RefundLog, Product, PricingRules, PriceLog, ReturnDateBasis } from '../../../types';
import { RotateCcw, DollarSign, Package, Info, ChevronDown, Calendar, AlertTriangle, Truck as TruckIcon, Search, ArrowRight, Layers, GitMerge, Clock, ChevronRight, Map as MapIcon, FileSearch, Clipboard } from 'lucide-react';
import { SortableHeader } from '../../common/SortableHeader';
import { formatPct, formatMoney } from '../../../utils/format';
import { MetricCard } from '../parts/MetricCard';
import { buildRefundOverview } from '../../../services/refundAgg';
import { sortRows, SortState } from '../../../utils/tableSort';
import { VAT_MULTIPLIER } from '../../../constants';
import { parseReturnsReason } from '../../../services/returnsReasonCodes';
import { aggregateRefundKeywords } from '../../../services/refundTextAgg';

interface ReturnsAndRefundsTabProps {
    refundHistory: RefundLog[];
    products: Product[];
    themeColor: string;
    pricingRules: PricingRules;
    onDeepDive: (sku: string) => void;
    priceHistoryMap?: Map<string, PriceLog[]>;
    startDate: string;
    endDate: string;
    onAnalyzeCarrier: (carrier: string) => void;
}

type ViewMode = 'reason' | 'product' | 'partner';

// Helper for fast date checking (avoids new Date() overhead in tight loops)
const isIsoDateInRange = (isoDate: string, start: string, end: string) => {
    if (!isoDate) return false;
    const datePart = isoDate.length > 10 ? isoDate.substring(0, 10) : isoDate;
    return datePart >= start && datePart <= end;
};

export const ReturnsAndRefundsTab: React.FC<ReturnsAndRefundsTabProps> = ({ 
    refundHistory = [], 
    products, 
    themeColor, 
    pricingRules, 
    onDeepDive,
    priceHistoryMap = new Map(),
    startDate,
    endDate,
    onAnalyzeCarrier
}) => {
    // State for filters and view mode
    const [platformScope, setPlatformScope] = useState<string>('All');
    const [mainCategoryScope, setMainCategoryScope] = useState<string>('All');
    const [subCategoryScope, setSubCategoryScope] = useState<string>('All');
    const [includeResends, setIncludeResends] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('reason');
    const [returnDateBasis, setReturnDateBasis] = useState<ReturnDateBasis>('refundDate');
    
    // Sort state for the main detail table
    const [sortConfig, setSortConfig] = useState<SortState<string>>({ key: 'totalValue', dir: 'desc' });
    
    // Sort state for the triage table
    const [triageSortConfig, setTriageSortConfig] = useState<SortState<string>>({ key: 'refundQty', dir: 'desc' });

    // Expanded Carrier Row State
    const [expandedPartner, setExpandedPartner] = useState<string | null>(null);
    const [showSourceRecords, setShowSourceRecords] = useState<string | null>(null);

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(10);

    const productLookup = useMemo(() => new Map(products.map(p => [p.sku, p])), [products]);

    // Derived category lists
    const mainCategories = useMemo(() => {
        const cats = new Set<string>();
        products.forEach(p => { if (p.category) cats.add(p.category); });
        return Array.from(cats).sort();
    }, [products]);

    const subCategories = useMemo(() => {
        const subs = new Set<string>();
        products.forEach(p => {
            if (mainCategoryScope === 'All' || p.category === mainCategoryScope) {
                if (p.subcategory) subs.add(p.subcategory);
            }
        });
        return Array.from(subs).sort();
    }, [products, mainCategoryScope]);

    // Derive Order Context Map: OrderID -> { platform, partner, service, date }
    const orderContextMap = useMemo(() => {
        const map = new Map<string, { platform: string; partner?: string; service?: string; date: string }>();
        priceHistoryMap.forEach((logs) => {
            for (let i = 0; i < logs.length; i++) {
                const p = logs[i];
                if (p.orderId) {
                    const dKey = p.date.substring(0, 10); // Fast extraction
                    map.set(p.orderId, { 
                        platform: p.platform || 'Unknown', 
                        partner: p.logisticPartner,
                        service: p.logisticService,
                        date: dKey 
                    });
                }
            }
        });
        return map;
    }, [priceHistoryMap]);

    // Sales aggregation for KPI context
    const salesStats = useMemo(() => {
        const salesMap = new Map<string, number>();
        const revenueMap = new Map<string, number>();
        const productMap = new Map<string, {name: string}>();
        
        const targetSkus = new Set<string>();
        const isCatFilterActive = mainCategoryScope !== 'All' || subCategoryScope !== 'All';
        
        if (isCatFilterActive) {
            products.forEach(p => {
                if (mainCategoryScope !== 'All' && p.category !== mainCategoryScope) return;
                if (subCategoryScope !== 'All' && p.subcategory !== subCategoryScope) return;
                targetSkus.add(p.sku);
            });
        }

        const iterator = isCatFilterActive ? targetSkus : priceHistoryMap.keys();

        for (const sku of iterator) {
            const logs = priceHistoryMap.get(sku);
            if (!logs) continue;

            const product = productLookup.get(sku);
            if (!product) continue;

            let skuPeriodSales = 0;
            let skuPeriodRevenue = 0;
            const extraFreight = Number(product.extraFreight) || 0;

            for (let i = 0; i < logs.length; i++) {
                const log = logs[i];
                if (platformScope !== 'All' && log.platform !== platformScope) continue;
                
                if (isIsoDateInRange(log.date, startDate, endDate)) {
                    skuPeriodSales += log.velocity;
                    skuPeriodRevenue += (log.velocity * (log.price + extraFreight));
                }
            }

            if (skuPeriodSales > 0 || skuPeriodRevenue > 0) {
                salesMap.set(sku, skuPeriodSales);
                revenueMap.set(sku, skuPeriodRevenue * VAT_MULTIPLIER);
                productMap.set(sku, { name: product.name });
            }
        }

        return { salesMap, revenueMap, productMap };
    }, [priceHistoryMap, products, startDate, endDate, platformScope, mainCategoryScope, subCategoryScope, productLookup]);

    // Main data processing
    const { 
        totalValue, 
        totalCount, 
        byReason, 
        byProduct, 
        byPartner,
        triageOverview,
        topKeywords,
        topGripingPartner
    } = useMemo(() => {
        // Internal helper to resolve order context, handling Resend suffixes
        const resolveOrderContext = (r: RefundLog) => {
            if (!r.orderId) return null;
            // 1. Direct Lookup
            let ctx = orderContextMap.get(r.orderId);
            if (ctx) return ctx;

            // 2. Import-Mapped Resend Base
            if (r.resendBaseOrderId) {
                ctx = orderContextMap.get(r.resendBaseOrderId);
                if (ctx) return ctx;
            }

            // 3. Dynamic Regex (Catch cases like "DUX...-resend")
            // Matches -resend, _resend at end of string, case insensitive
            const resendMatch = r.orderId.match(/^(.*)[-_]resend$/i);
            if (resendMatch) {
                ctx = orderContextMap.get(resendMatch[1]);
            }
            return ctx || null;
        };

        const filteredRefunds = refundHistory.filter(r => {
            const context = resolveOrderContext(r);
            
            let dKey: string | null = null;
            if (returnDateBasis === 'orderDate' && context) {
                 dKey = context.date;
            } else {
                 dKey = r.date.substring(0, 10);
            }

            if (!dKey || dKey < startDate || dKey > endDate) return false;
            
            const pName = r.platform || context?.platform || 'Unknown';
            if (platformScope !== 'All' && pName !== platformScope) return false;
            
            const isResend = r.orderType === 'resend' || (r.id && r.id.toLowerCase().includes('resend'));
            if (!includeResends && isResend) return false;

            if (mainCategoryScope !== 'All' || subCategoryScope !== 'All') {
                if (!r.sku || r.sku.toLowerCase() === 'freight') return false;
                const p = productLookup.get(r.sku);
                if (!p) return false;
                if (mainCategoryScope !== 'All' && p.category !== mainCategoryScope) return false;
                if (subCategoryScope !== 'All' && p.subcategory !== subCategoryScope) return false;
            }

            return true;
        });

        const totalValue = filteredRefunds.reduce((sum, r) => sum + ((Number(r.amount) + Number(r.freightAmount || 0)) * VAT_MULTIPLIER), 0);
        const totalCount = filteredRefunds.length;

        const triageOverview = buildRefundOverview(filteredRefunds, {
            salesMap: salesStats.salesMap,
            revenueMap: salesStats.revenueMap,
            productMap: salesStats.productMap,
            dateBasis: returnDateBasis,
            orderDateMap: orderContextMap ? new Map(Array.from(orderContextMap.entries()).map(([k, v]) => [k, v.date])) : undefined
        });

        // Aggregation Maps
        const reasonMap = new Map<string, { totalValue: number, count: number, skus: Set<string> }>();
        const partnerMap = new Map<string, { 
            totalValue: number, 
            count: number, 
            skus: Set<string>, 
            reasons: Map<string, number>, 
            services: Map<string, { count: number, value: number }>,
            records: RefundLog[] // Track source records
        }>();
        
        const prodMap = new Map<string, { totalValue: number, count: number, reasons: Map<string, number> }>();

        for (const r of filteredRefunds) {
            const rowVal = (Number(r.amount) + Number(r.freightAmount || 0)) * VAT_MULTIPLIER;
            const rawReason = r.reason || r.platformReason || r.customerReason || 'Unknown Reason';
            const meta = parseReturnsReason(rawReason);
            const rKey = meta.description || meta.short;

            // 1. Reason Grouping
            if (!reasonMap.has(rKey)) reasonMap.set(rKey, { totalValue: 0, count: 0, skus: new Set() });
            const rEntry = reasonMap.get(rKey)!;
            rEntry.totalValue += rowVal;
            rEntry.count++;
            rEntry.skus.add(r.sku);

            // 2. Partner Grouping
            const context = resolveOrderContext(r);
            const pKey = context?.partner || r.logisticPartner || 'Unattributed Carrier';
            
            if (!partnerMap.has(pKey)) partnerMap.set(pKey, { totalValue: 0, count: 0, skus: new Set(), reasons: new Map(), services: new Map(), records: [] });
            const pEntry = partnerMap.get(pKey)!;
            pEntry.totalValue += rowVal;
            pEntry.count++;
            pEntry.skus.add(r.sku);
            pEntry.reasons.set(rKey, (pEntry.reasons.get(rKey) || 0) + 1);
            pEntry.records.push(r); // Push raw record

            // Service Breakdown
            const serviceKey = context?.service || 'Unknown Service';
            if (!pEntry.services.has(serviceKey)) pEntry.services.set(serviceKey, { count: 0, value: 0 });
            const sStats = pEntry.services.get(serviceKey)!;
            sStats.count++;
            sStats.value += rowVal;

            // 3. Product Grouping
            if (!prodMap.has(r.sku)) prodMap.set(r.sku, { totalValue: 0, count: 0, reasons: new Map() });
            const prEntry = prodMap.get(r.sku)!;
            prEntry.totalValue += rowVal;
            prEntry.count++;
            prEntry.reasons.set(rKey, (prEntry.reasons.get(rKey) || 0) + 1);
        }
        
        const byReason = Array.from(reasonMap.entries()).map(([reason, data]) => ({ reason, ...data }));
        const byProduct = Array.from(prodMap.entries()).map(([sku, data]) => {
            const topReason = [...data.reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
            return { sku, ...data, topReason };
        });
        const byPartner = Array.from(partnerMap.entries()).map(([partner, data]) => {
            const topReason = [...data.reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
            const countShare = totalCount > 0 ? (data.count / totalCount) * 100 : 0;
            const valueShare = totalValue > 0 ? (data.totalValue / totalValue) * 100 : 0;
            
            const servicesBreakdown = Array.from(data.services.entries())
                .map(([name, stats]) => ({ 
                    name, 
                    ...stats,
                    share: data.count > 0 ? (stats.count / data.count) * 100 : 0
                }))
                .sort((a, b) => b.count - a.count);

            return { partner, ...data, topReason, countShare, valueShare, servicesBreakdown };
        });

        const topGripingPartner = byPartner.sort((a, b) => b.count - a.count)[0];
        const topKeywords = aggregateRefundKeywords(filteredRefunds, 20);

        return { 
            totalValue, totalCount, byReason, byProduct, byPartner, triageOverview, 
            topKeywords,
            topGripingPartner
        };
    }, [refundHistory, startDate, endDate, platformScope, mainCategoryScope, subCategoryScope, productLookup, includeResends, returnDateBasis, orderContextMap, salesStats]);

    // Data for the Detail Explorer view
    const currentTableData = useMemo(() => {
        let data: any[] = [];
        if (viewMode === 'reason') data = byReason;
        else if (viewMode === 'product') data = byProduct;
        else data = byPartner;
        
        const getValue = (row: any, key: string) => row[key];
        return sortRows(data, sortConfig, getValue);
    }, [byReason, byProduct, byPartner, viewMode, sortConfig]);

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
        if (!sku || sku === 'Unknown' || sku === 'Freight') return;
        onDeepDive(sku);
    };

    const togglePartnerExpand = (partner: string) => {
        setExpandedPartner(prev => prev === partner ? null : partner);
        // Reset record view when collapsing/expanding
        setShowSourceRecords(null);
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 pb-12">
             <div className="flex flex-col md:flex-row justify-between items-center bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm gap-4 relative z-10">
                <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <select 
                                value={platformScope} 
                                onChange={(e) => setPlatformScope(e.target.value)}
                                className="appearance-none bg-indigo-50 border border-indigo-200 text-indigo-700 font-bold py-2 pl-4 pr-10 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                            >
                                <option value="All">Global (All Platforms)</option>
                                {Object.keys(pricingRules).map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-indigo-600 pointer-events-none" />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Layers className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            <select 
                                value={mainCategoryScope} 
                                onChange={(e) => { setMainCategoryScope(e.target.value); setSubCategoryScope('All'); }}
                                className="appearance-none bg-white border border-gray-300 text-gray-700 py-2 pl-9 pr-10 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                            >
                                <option value="All">All Categories</option>
                                {mainCategories.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <GitMerge className="absolute left-3 top-2.5 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            <select 
                                value={subCategoryScope} 
                                onChange={(e) => setSubCategoryScope(e.target.value)}
                                className="appearance-none bg-white border border-gray-300 text-gray-700 py-2 pl-9 pr-10 rounded-lg cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs"
                            >
                                <option value="All">All Sub-Categories</option>
                                {subCategories.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <ChevronDown className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                </div>
                
                <div className="flex items-center gap-4">
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setReturnDateBasis('refundDate')} 
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${returnDateBasis === 'refundDate' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Clock className="w-3 h-3" />
                            Refund Date
                        </button>
                        <button 
                            onClick={() => setReturnDateBasis('orderDate')} 
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${returnDateBasis === 'orderDate' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Calendar className="w-3 h-3" />
                            Order Date
                        </button>
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
            </div>

            {/* Refund Triage KPI Section */}
            <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4">
                    <MetricCard 
                        title="Refund Cases" 
                        value={triageOverview.kpis.totalRefundCount.toLocaleString()} 
                        icon={RotateCcw} 
                        color="orange" 
                        desc="Unique requests"
                    />
                    <MetricCard 
                        title="Loss Value" 
                        value={formatMoney(triageOverview.kpis.totalRefundValue)} 
                        icon={DollarSign} 
                        color="red" 
                        desc="Inc VAT & Freight"
                    />
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Return Rate (Qty)</span>
                            <Package className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                            {triageOverview.kpis.refundRateQty !== null ? formatPct(triageOverview.kpis.refundRateQty) : '—'}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tight">Units vs Sold</div>
                    </div>
                    
                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Return Rate (Val)</span>
                            <DollarSign className="w-4 h-4 text-rose-500" />
                        </div>
                        <div className="text-2xl font-bold text-gray-900">
                            {triageOverview.kpis.refundRateValue !== null ? formatPct(triageOverview.kpis.refundRateValue) : '—'}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tight">Value vs Revenue</div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between group">
                        <div className="flex justify-between items-start mb-2">
                            <span className="text-[10px] font-bold text-gray-500 uppercase">Worst Carrier</span>
                            <TruckIcon className="w-4 h-4 text-indigo-500" />
                        </div>
                        <div className="text-xl font-bold text-gray-900 truncate" title={topGripingPartner?.partner}>
                            {topGripingPartner?.partner || 'N/A'}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-1 uppercase font-bold tracking-tight">
                            {topGripingPartner ? `${topGripingPartner.count} complaints` : 'Complaints Source'}
                        </div>
                    </div>
                </div>

                {/* SKU Alerts Table */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col max-h-[500px]">
                    <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                        <h4 className="font-bold text-gray-800 text-sm uppercase flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-500" />
                            SKU Alerts
                        </h4>
                    </div>
                    <div className="overflow-auto flex-1">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 text-[10px] uppercase tracking-wider sticky top-0 z-10 shadow-sm">
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
                                            <tr key={row.sku} className="hover:bg-gray-50/80 transition-colors group even:bg-gray-50/20">
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
                                                        className={`px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-[10px] font-bold shadow-sm transition-all flex items-center gap-1 ml-auto ${isInvalidSku ? 'opacity-30 cursor-not-allowed grayscale' : 'hover:border-indigo-300 hover:text-indigo-600 text-gray-600'}`}
                                                    >
                                                        Deep Dive <ArrowRight className="w-3 h-3" />
                                                    </button>
                                                </td>
                                            </tr>
                                        )
                                    })
                                ) : (
                                    <tr><td colSpan={9} className="p-8 text-center text-gray-400 italic">No refund alerts found for this selection.</td></tr>
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
                        <button onClick={() => setViewMode('reason')} className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-md flex items-center gap-2 transition-all ${viewMode === 'reason' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            <Info className="w-3.5 h-3.5" /> By Reason
                        </button>
                        <button onClick={() => setViewMode('product')} className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-md flex items-center gap-2 transition-all ${viewMode === 'product' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            <Package className="w-3.5 h-3.5" /> By Product
                        </button>
                        <button onClick={() => setViewMode('partner')} className={`px-3 py-1.5 text-[10px] font-bold uppercase rounded-md flex items-center gap-2 transition-all ${viewMode === 'partner' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}>
                            <TruckIcon className="w-3.5 h-3.5" /> By Carrier
                        </button>
                    </div>
                </div>

                <div className="p-6">
                    <div className="overflow-auto border rounded-lg max-h-[400px]">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50/50 text-gray-500 font-bold border-b border-gray-200/50 text-[10px] uppercase tracking-wider sticky top-0 z-10 shadow-sm">
                                {viewMode === 'reason' ? (
                                    <tr>
                                        <SortableHeader label="Reason" sortKey="reason" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                                        <SortableHeader label="Count" sortKey="count" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right"/>
                                        <SortableHeader label="Value" sortKey="totalValue" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right"/>
                                        <th className="p-3 text-right">SKUs Affected</th>
                                    </tr>
                                ) : viewMode === 'product' ? (
                                    <tr>
                                        <SortableHeader label="SKU" sortKey="sku" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                                        <SortableHeader label="Count" sortKey="count" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right"/>
                                        <SortableHeader label="Value" sortKey="totalValue" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right"/>
                                        <th className="p-3">Top Reason</th>
                                        <th className="p-3 text-right w-12">Action</th>
                                    </tr>
                                ) : (
                                    <tr>
                                        <th className="w-8"></th>
                                        <SortableHeader label="Logistic Partner" sortKey="partner" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                                        <SortableHeader label="Complaint Count" sortKey="count" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right"/>
                                        <SortableHeader label="Share %" sortKey="countShare" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right"/>
                                        <SortableHeader label="Loss Value" sortKey="totalValue" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right"/>
                                        <th className="p-3">Primary Issue</th>
                                        <th className="p-3 text-right">Action</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {paginatedData.map((item: any) => {
                                    const isInvalidSku = viewMode === 'product' && (!item.sku || item.sku === 'Unknown' || item.sku === 'Freight');
                                    const isPartnerExpanded = viewMode === 'partner' && expandedPartner === item.partner;
                                    
                                    return (
                                        <React.Fragment key={viewMode === 'reason' ? item.reason : viewMode === 'product' ? item.sku : item.partner}>
                                            <tr className={`hover:bg-gray-50/50 transition-colors even:bg-gray-50/20 ${isPartnerExpanded ? 'bg-indigo-50/20 border-l-2 border-indigo-500' : ''}`} onClick={() => viewMode === 'partner' && togglePartnerExpand(item.partner)}>
                                                {viewMode === 'reason' ? (
                                                    <>
                                                        <td className="p-3 font-medium text-gray-700 truncate max-w-xs" title={item.reason}>{item.reason}</td>
                                                        <td className="p-3 text-right font-mono">{item.count}</td>
                                                        <td className="p-3 text-right font-mono font-bold text-red-600">£{item.totalValue.toFixed(2)}</td>
                                                        <td className="p-3 text-right font-mono">{item.skus.size}</td>
                                                    </>
                                                ) : viewMode === 'product' ? (
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
                                                                className={`p-1.5 bg-white border rounded transition-all ${isInvalidSku ? 'opacity-20 grayscale cursor-not-allowed' : 'border-gray-200 hover:border-indigo-300 text-gray-400 hover:text-indigo-600'}`} 
                                                            >
                                                                <Search className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="p-3 text-center cursor-pointer">
                                                            {isPartnerExpanded ? <ChevronDown className="w-4 h-4 text-indigo-500" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                                        </td>
                                                        <td className="p-3 font-bold text-gray-800 cursor-pointer">{item.partner}</td>
                                                        <td className="p-3 text-right font-mono">{item.count}</td>
                                                        <td className="p-3 text-right font-mono text-gray-600">
                                                            <div className="flex items-center justify-end gap-2">
                                                                <span>{item.countShare.toFixed(1)}%</span>
                                                                <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
                                                                    <div className="h-full bg-indigo-500 rounded-full" style={{ width: `${item.countShare}%` }}></div>
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-right font-mono font-bold text-red-600">£{item.totalValue.toFixed(2)}</td>
                                                        <td className="p-3 text-gray-600 truncate max-w-[200px]">
                                                            {item.topReason}
                                                        </td>
                                                        <td className="p-3 text-right">
                                                            <button
                                                                onClick={(e) => { e.stopPropagation(); onAnalyzeCarrier(item.partner); }}
                                                                className="p-1.5 bg-white border border-gray-200 rounded hover:border-indigo-300 text-gray-400 hover:text-indigo-600 transition-colors"
                                                                title="Analyze Carrier Performance on Map"
                                                            >
                                                                <MapIcon className="w-3.5 h-3.5" />
                                                            </button>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                            {isPartnerExpanded && viewMode === 'partner' && (
                                                <tr className="bg-gray-50/50">
                                                    <td colSpan={7} className="p-4">
                                                        <div className="flex flex-col gap-4">
                                                            <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
                                                                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 text-[10px] font-bold uppercase text-gray-500 flex justify-between">
                                                                    <span>Service Breakdown for {item.partner}</span>
                                                                    <span>Breakdown based on imported transaction log</span>
                                                                </div>
                                                                <table className="w-full text-xs text-left">
                                                                    <thead className="bg-gray-50/30 text-gray-400">
                                                                        <tr>
                                                                            <th className="px-3 py-1.5 font-medium">Service Name</th>
                                                                            <th className="px-3 py-1.5 font-medium text-right">Refunds</th>
                                                                            <th className="px-3 py-1.5 font-medium text-right">Share %</th>
                                                                            <th className="px-3 py-1.5 font-medium text-right">Value</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-gray-50">
                                                                        {item.servicesBreakdown.length > 0 ? (
                                                                            item.servicesBreakdown.map((srv: any, idx: number) => (
                                                                                <tr key={idx} className="hover:bg-indigo-50/10">
                                                                                    <td className="px-3 py-1.5 font-mono text-gray-700">{srv.name || 'Unknown / Not Mapped'}</td>
                                                                                    <td className="px-3 py-1.5 text-right font-bold">{srv.count}</td>
                                                                                    <td className="px-3 py-1.5 text-right text-gray-500">{srv.share.toFixed(1)}%</td>
                                                                                    <td className="px-3 py-1.5 text-right text-red-600">£{srv.value.toFixed(2)}</td>
                                                                                </tr>
                                                                            ))
                                                                        ) : (
                                                                            <tr><td colSpan={4} className="px-3 py-3 text-center text-gray-400 italic">No service detail available. Re-import Sales Report to capture logistics names.</td></tr>
                                                                        )}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                            
                                                            {/* Source Records Inspector */}
                                                            <div className="bg-white rounded border border-gray-200 shadow-sm overflow-hidden">
                                                                <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex justify-between items-center cursor-pointer hover:bg-gray-100"
                                                                     onClick={() => setShowSourceRecords(showSourceRecords === item.partner ? null : item.partner)}>
                                                                     <div className="flex items-center gap-2">
                                                                         <FileSearch className="w-3.5 h-3.5 text-gray-500"/>
                                                                         <span className="text-[10px] font-bold uppercase text-gray-600">Inspect Contributing Records ({item.records.length})</span>
                                                                     </div>
                                                                     <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${showSourceRecords === item.partner ? 'rotate-180' : ''}`} />
                                                                </div>
                                                                
                                                                {showSourceRecords === item.partner && (
                                                                    <div className="max-h-60 overflow-y-auto">
                                                                       {item.partner === 'Unattributed Carrier' && (
                                                                           <div className="px-3 py-2 bg-amber-50 text-[10px] text-amber-700 border-b border-amber-100 flex items-start gap-2">
                                                                               <AlertTriangle className="w-3.5 h-3.5 mt-0.5" />
                                                                               <div>
                                                                                   <strong>Diagnosis:</strong> These refunds could not be linked to a known carrier. 
                                                                                   <ul className="list-disc pl-3 mt-1 space-y-0.5">
                                                                                       <li>Check if the <strong>Order ID</strong> exists in your imported Sales History.</li>
                                                                                       <li>Check if the Sales History has a <strong>Logistic Partner</strong> column mapped.</li>
                                                                                   </ul>
                                                                               </div>
                                                                           </div>
                                                                       )}
                                                                       <table className="w-full text-xs text-left">
                                                                           <thead className="bg-gray-50/30 text-gray-400">
                                                                               <tr>
                                                                                   <th className="px-3 py-1.5 font-medium sticky top-0 bg-white">Date</th>
                                                                                   <th className="px-3 py-1.5 font-medium sticky top-0 bg-white">Order ID</th>
                                                                                   <th className="px-3 py-1.5 font-medium sticky top-0 bg-white">SKU</th>
                                                                                   <th className="px-3 py-1.5 font-medium text-right sticky top-0 bg-white">Refund Amt</th>
                                                                               </tr>
                                                                           </thead>
                                                                           <tbody className="divide-y divide-gray-50">
                                                                               {item.records.slice(0, 100).map((rec: RefundLog, rIdx: number) => (
                                                                                   <tr key={rec.id || rIdx} className="hover:bg-gray-50">
                                                                                       <td className="px-3 py-1.5 font-mono text-gray-600">{new Date(rec.date).toLocaleDateString()}</td>
                                                                                       <td className="px-3 py-1.5 font-mono text-indigo-600 font-medium select-all cursor-text flex items-center gap-1">
                                                                                          {rec.orderId || '—'}
                                                                                       </td>
                                                                                       <td className="px-3 py-1.5 font-mono text-gray-600">{rec.sku}</td>
                                                                                       <td className="px-3 py-1.5 text-right text-gray-800">£{((rec.amount || 0) + (rec.freightAmount || 0)).toFixed(2)}</td>
                                                                                   </tr>
                                                                               ))}
                                                                               {item.records.length > 100 && (
                                                                                   <tr><td colSpan={4} className="px-3 py-2 text-center text-gray-400 italic">...and {item.records.length - 100} more</td></tr>
                                                                               )}
                                                                           </tbody>
                                                                       </table>
                                                                    </div>
                                                                )}
                                                             </div>
                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                 {totalPages > 1 && (
                    <div className="bg-gray-50/50 px-4 py-3 border-t border-custom-glass flex items-center justify-end">
                         <div className="flex gap-1">
                            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2 py-1 border rounded bg-white text-xs font-bold">Prev</button>
                            <span className="px-2 py-1 text-xs text-gray-500">Page {currentPage} of {totalPages}</span>
                            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2 py-1 border rounded bg-white text-xs font-bold">Next</button>
                         </div>
                    </div>
                 )}
            </div>
        </div>
    );
};
