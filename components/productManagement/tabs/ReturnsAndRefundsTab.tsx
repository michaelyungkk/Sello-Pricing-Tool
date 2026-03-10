
import React, { useState, useMemo } from 'react';
import { RefundLog, Product, PricingRules, PriceLog, ReturnDateBasis } from '../../../types';
import { RotateCcw, DollarSign, Package, Info, ChevronDown, AlertTriangle, Truck as TruckIcon, Search, Layers, GitMerge, ChevronRight, Map as MapIcon, FileSearch } from 'lucide-react';
import { FilterBar } from '../../common/FilterBar';
import { SortableHeader } from '../../common/SortableHeader';
import { formatPct, formatMoney } from '../../../utils/format';
import { MetricCard } from '../parts/MetricCard';
import { buildRefundOverview } from '../../../services/refundAgg';
import { sortRows, SortState } from '../../../utils/tableSort';
import { VAT_MULTIPLIER } from '../../../constants';
import { parseReturnsReason } from '../../../services/returnsReasonCodes';
import AuditPanel from '../../AuditPanel';

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

const isIsoDateInRange = (isoDate: string, start: string, end: string) => {
    if (!isoDate) return false;
    const datePart = isoDate.length > 10 ? isoDate.substring(0, 10) : isoDate;
    return datePart >= start && datePart <= end;
};

export const ReturnsAndRefundsTab: React.FC<ReturnsAndRefundsTabProps> = ({
    refundHistory = [], products, themeColor, pricingRules, onDeepDive,
    priceHistoryMap = new Map(), startDate, endDate, onAnalyzeCarrier
}) => {
    const [isAuditVisible, setIsAuditVisible] = useState(false);
    const [platformScope, setPlatformScope] = useState<string>('All');
    const [mainCategoryScope, setMainCategoryScope] = useState<string>('All');
    const [subCategoryScope, setSubCategoryScope] = useState<string>('All');
    const [includeResends, setIncludeResends] = useState(true);
    const [viewMode, setViewMode] = useState<ViewMode>('reason');
    const [returnDateBasis, setReturnDateBasis] = useState<ReturnDateBasis>('refundDate');
    const [sortConfig, setSortConfig] = useState<SortState<string>>({ key: 'totalValue', dir: 'desc' });
    const [triageSortConfig, setTriageSortConfig] = useState<SortState<string>>({ key: 'refundValue', dir: 'desc' });
    const [expandedPartner, setExpandedPartner] = useState<string | null>(null);
    const [showSourceRecords, setShowSourceRecords] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    const productLookup = useMemo(() => new Map(products.map(p => [p.sku, p])), [products]);
    const platformOptions = useMemo(() => Object.keys(pricingRules), [pricingRules]);
    const mainCategories = useMemo(() => { const cats = new Set<string>(); products.forEach(p => { if (p.category) cats.add(p.category); }); return Array.from(cats).sort(); }, [products]);
    const subCategories = useMemo(() => { const subs = new Set<string>(); products.forEach(p => { if (mainCategoryScope === 'All' || p.category === mainCategoryScope) { if (p.subcategory) subs.add(p.subcategory); } }); return Array.from(subs).sort(); }, [products, mainCategoryScope]);

    const orderContextMap = useMemo(() => {
        const map = new Map<string, { platform: string; partner?: string; service?: string; date: string }>();
        priceHistoryMap.forEach(logs => {
            for (const p of logs) {
                if (p.orderId) map.set(p.orderId, { platform: p.platform || 'Unknown', partner: p.logisticPartner, service: p.logisticService, date: p.date.substring(0, 10) });
            }
        });
        return map;
    }, [priceHistoryMap]);

    const salesStats = useMemo(() => {
        const salesMap = new Map<string, number>(); const revenueMap = new Map<string, number>(); const productMap = new Map<string, { name: string }>();
        const targetSkus = new Set<string>(); const isCatFilterActive = mainCategoryScope !== 'All' || subCategoryScope !== 'All';
        if (isCatFilterActive) products.forEach(p => { if (mainCategoryScope !== 'All' && p.category !== mainCategoryScope) return; if (subCategoryScope !== 'All' && p.subcategory !== subCategoryScope) return; targetSkus.add(p.sku); });
        for (const sku of (isCatFilterActive ? targetSkus : priceHistoryMap.keys())) {
            const logs = priceHistoryMap.get(sku); if (!logs) continue;
            const product = productLookup.get(sku); if (!product) continue;
            let skuSales = 0, skuRev = 0; const ef = Number(product.extraFreight) || 0;
            for (const log of logs) { if (platformScope !== 'All' && log.platform !== platformScope) continue; if (isIsoDateInRange(log.date, startDate, endDate)) { skuSales += log.velocity; skuRev += log.velocity * (log.price + ef); } }
            if (skuSales > 0 || skuRev > 0) { salesMap.set(sku, skuSales); revenueMap.set(sku, skuRev * VAT_MULTIPLIER); productMap.set(sku, { name: product.name }); }
        }
        return { salesMap, revenueMap, productMap };
    }, [priceHistoryMap, products, startDate, endDate, platformScope, mainCategoryScope, subCategoryScope, productLookup]);

    const { byReason, byProduct, byPartner, triageOverview, topGripingPartner } = useMemo(() => {
        const resolveOrderContext = (r: RefundLog) => {
            if (!r.orderId) return null;
            let ctx = orderContextMap.get(r.orderId); if (ctx) return ctx;
            if (r.resendBaseOrderId) { ctx = orderContextMap.get(r.resendBaseOrderId); if (ctx) return ctx; }
            const m = r.orderId.match(/^(.*)[-_]resend$/i); if (m) ctx = orderContextMap.get(m[1]);
            return ctx || null;
        };
        const filteredRefunds = refundHistory.filter(r => {
            const context = resolveOrderContext(r);
            const dKey = returnDateBasis === 'orderDate' && context ? context.date : r.date.substring(0, 10);
            if (!dKey || dKey < startDate || dKey > endDate) return false;
            const pName = r.platform || context?.platform || 'Unknown';
            if (platformScope !== 'All' && pName !== platformScope) return false;
            const isResend = r.orderType === 'resend' || (r.id && r.id.toLowerCase().includes('resend'));
            if (!includeResends && isResend) return false;
            if (mainCategoryScope !== 'All' || subCategoryScope !== 'All') {
                if (!r.sku || r.sku.toLowerCase() === 'freight') return false;
                const p = productLookup.get(r.sku); if (!p) return false;
                if (mainCategoryScope !== 'All' && p.category !== mainCategoryScope) return false;
                if (subCategoryScope !== 'All' && p.subcategory !== subCategoryScope) return false;
            }
            return true;
        });
        const totalValue = filteredRefunds.reduce((s, r) => s + ((Number(r.amount) + Number(r.freightAmount || 0)) * VAT_MULTIPLIER), 0);
        const totalCount = filteredRefunds.length;
        const triageOverview = buildRefundOverview(filteredRefunds, { salesMap: salesStats.salesMap, revenueMap: salesStats.revenueMap, productMap: salesStats.productMap, dateBasis: returnDateBasis, orderDateMap: orderContextMap ? new Map(Array.from(orderContextMap.entries()).map(([k, v]) => [k, v.date])) : undefined });
        const reasonMap = new Map<string, { totalValue: number, count: number, skus: Set<string> }>();
        const partnerMap = new Map<string, { totalValue: number, count: number, skus: Set<string>, reasons: Map<string, number>, services: Map<string, { count: number, value: number }>, records: RefundLog[] }>();
        const prodMap = new Map<string, { totalValue: number, count: number, reasons: Map<string, number> }>();
        for (const r of filteredRefunds) {
            const rowVal = (Number(r.amount) + Number(r.freightAmount || 0)) * VAT_MULTIPLIER;
            const rawReason = r.reason || r.platformReason || r.customerReason || 'Unknown Reason';
            const meta = parseReturnsReason(rawReason); const rKey = meta.description || meta.short;
            if (!reasonMap.has(rKey)) reasonMap.set(rKey, { totalValue: 0, count: 0, skus: new Set() });
            const rEntry = reasonMap.get(rKey)!; rEntry.totalValue += rowVal; rEntry.count++; rEntry.skus.add(r.sku);
            const context = resolveOrderContext(r); const pKey = context?.partner || r.logisticPartner || 'Unattributed Carrier';
            if (!partnerMap.has(pKey)) partnerMap.set(pKey, { totalValue: 0, count: 0, skus: new Set(), reasons: new Map(), services: new Map(), records: [] });
            const pEntry = partnerMap.get(pKey)!; pEntry.totalValue += rowVal; pEntry.count++; pEntry.skus.add(r.sku); pEntry.reasons.set(rKey, (pEntry.reasons.get(rKey) || 0) + 1); pEntry.records.push(r);
            const serviceKey = context?.service || 'Unknown Service';
            if (!pEntry.services.has(serviceKey)) pEntry.services.set(serviceKey, { count: 0, value: 0 });
            const sStats = pEntry.services.get(serviceKey)!; sStats.count++; sStats.value += rowVal;
            if (!prodMap.has(r.sku)) prodMap.set(r.sku, { totalValue: 0, count: 0, reasons: new Map() });
            const prEntry = prodMap.get(r.sku)!; prEntry.totalValue += rowVal; prEntry.count++; prEntry.reasons.set(rKey, (prEntry.reasons.get(rKey) || 0) + 1);
        }
        const byReason = Array.from(reasonMap.entries()).map(([reason, data]) => ({ reason, ...data }));
        const byProduct = Array.from(prodMap.entries()).map(([sku, data]) => { const topReason = [...data.reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A'; return { sku, ...data, topReason }; });
        const byPartner = Array.from(partnerMap.entries()).map(([partner, data]) => {
            const topReason = [...data.reasons.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || 'N/A';
            return { partner, ...data, topReason, countShare: totalCount > 0 ? (data.count / totalCount) * 100 : 0, valueShare: totalValue > 0 ? (data.totalValue / totalValue) * 100 : 0, servicesBreakdown: Array.from(data.services.entries()).map(([name, stats]) => ({ name, ...stats, share: data.count > 0 ? (stats.count / data.count) * 100 : 0 })).sort((a, b) => b.count - a.count) };
        });
        const topGripingPartner = [...byPartner].sort((a, b) => b.count - a.count)[0];
        return { byReason, byProduct, byPartner, triageOverview, topGripingPartner };
    }, [refundHistory, startDate, endDate, platformScope, mainCategoryScope, subCategoryScope, productLookup, includeResends, returnDateBasis, orderContextMap, salesStats]);

    const currentTableData = useMemo(() => {
        const data: any[] = viewMode === 'reason' ? byReason : viewMode === 'product' ? byProduct : byPartner;
        return sortRows(data, sortConfig, (row, key) => row[key]);
    }, [byReason, byProduct, byPartner, viewMode, sortConfig]);

    const sortedTriageRows = useMemo(() => sortRows(triageOverview.skuRows, triageSortConfig, (row, key) => row[key] || 0), [triageOverview.skuRows, triageSortConfig]);
    const paginatedData = currentTableData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    const totalPages = Math.ceil(currentTableData.length / itemsPerPage);
    const togglePartnerExpand = (partner: string) => { setExpandedPartner(prev => prev === partner ? null : partner); setShowSourceRecords(null); };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 pb-12">
            <FilterBar
                showAudit auditActive={isAuditVisible} onAuditToggle={() => setIsAuditVisible(v => !v)}
                multiSelects={[
                    { key: 'platform', label: 'Platform', icon: MapIcon, options: platformOptions, selected: platformScope === 'All' ? [] : [platformScope], onChange: sel => setPlatformScope(sel.length > 0 ? sel[0] : 'All') },
                    { key: 'mainCategory', label: 'Main Category', icon: Layers, options: mainCategories, selected: mainCategoryScope === 'All' ? [] : [mainCategoryScope], onChange: sel => { setMainCategoryScope(sel.length > 0 ? sel[0] : 'All'); setSubCategoryScope('All'); } },
                    { key: 'subCategory', label: 'Sub Category', icon: GitMerge, options: subCategories, selected: subCategoryScope === 'All' ? [] : [subCategoryScope], onChange: sel => setSubCategoryScope(sel.length > 0 ? sel[0] : 'All') }
                ]}
                pillGroup={{ options: [{ key: 'refundDate', label: 'Refund Date' }, { key: 'orderDate', label: 'Order Date' }], active: returnDateBasis, onChange: key => setReturnDateBasis(key as ReturnDateBasis) }}
                toggles={[{ key: 'includeResends', label: 'Include Resends', active: includeResends, onChange: setIncludeResends }]}
            />

            {isAuditVisible && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <AuditPanel title="Returns & Refunds Audit" startKey={startDate} endKey={endDate}
                        rows={triageOverview.skuRows} getDateKey={() => null}
                        getRevenue={(row: any) => row.refundValue} getQty={(row: any) => row.refundQty}
                        getProfit={() => 0} getAdSpend={() => 0} />
                </div>
            )}

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4">
                <MetricCard title="Refund Cases" value={triageOverview.kpis.totalRefundCount.toLocaleString()} icon={RotateCcw} color="orange" desc="Unique requests" />
                <MetricCard title="Loss Value" value={formatMoney(triageOverview.kpis.totalRefundValue)} icon={DollarSign} color="red" desc="Inc VAT & Freight" />
                <div className="sello-glass p-4 rounded-xl flex flex-col justify-between">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Return Rate (Qty)</span>
                        <Package style={{ width: 16, height: 16, color: '#4f46e5' }} />
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>{triageOverview.kpis.refundRateQty !== null ? formatPct(triageOverview.kpis.refundRateQty) : '—'}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, textTransform: 'uppercase', fontWeight: 700 }}>Units vs Sold</div>
                </div>
                <div className="sello-glass p-4 rounded-xl flex flex-col justify-between">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Return Rate (Val)</span>
                        <DollarSign style={{ width: 16, height: 16, color: '#f43f5e' }} />
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 700, color: '#111827' }}>{triageOverview.kpis.refundRateValue !== null ? formatPct(triageOverview.kpis.refundRateValue) : '—'}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, textTransform: 'uppercase', fontWeight: 700 }}>Value vs Revenue</div>
                </div>
                <div className="sello-glass p-4 rounded-xl flex flex-col justify-between">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>Worst Carrier</span>
                        <TruckIcon style={{ width: 16, height: 16, color: '#4f46e5' }} />
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={topGripingPartner?.partner}>{topGripingPartner?.partner || 'N/A'}</div>
                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 4, textTransform: 'uppercase', fontWeight: 700 }}>{topGripingPartner ? `${topGripingPartner.count} complaints` : 'Complaints Source'}</div>
                </div>
            </div>

            {/* SKU Alerts Table */}
            <div className="sello-glass rounded-xl overflow-hidden" style={{ maxHeight: 500, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--glass-divider)', background: 'var(--glass-head-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ fontWeight: 700, fontSize: 13, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 6, textTransform: 'uppercase' }}>
                        <AlertTriangle style={{ width: 14, height: 14, color: '#dc2626' }} />SKU Alerts
                    </h4>
                </div>
                <div style={{ overflowY: 'auto', flex: 1 }}>
                    <div className="sello-table-scroll">
                        <table className="sello-table">
                            <thead>
                                <tr>
                                    <th style={{ textAlign: 'center', width: 40 }}>Detail</th>
                                    <SortableHeader label="SKU / Product" sortKey="sku" sort={triageSortConfig} onChange={setTriageSortConfig} />
                                    <SortableHeader label="Return QTY" sortKey="refundQty" sort={triageSortConfig} onChange={setTriageSortConfig} align="right" />
                                    <SortableHeader label="Return QTY%" sortKey="refundRate" sort={triageSortConfig} onChange={setTriageSortConfig} tint="red" align="right" />
                                    <SortableHeader label="Return AMT" sortKey="refundValue" sort={triageSortConfig} onChange={setTriageSortConfig} tint="red" align="right" />
                                    <SortableHeader label="Return AMT%" sortKey="refundRateValue" sort={triageSortConfig} onChange={setTriageSortConfig} tint="red" align="right" />
                                    <th>Top Reason</th>
                                    <th>Flags</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedTriageRows.length > 0 ? sortedTriageRows.map((row: any) => {
                                    const isInvalidSku = !row.sku || row.sku === 'Unknown' || row.sku === 'Freight';
                                    return (
                                        <tr key={row.sku}>
                                            <td style={{ textAlign: 'center' }}>
                                                <button onClick={() => !isInvalidSku && handleDeepDiveClick(row.sku)}
                                                    style={{ padding: 6, borderRadius: 6, color: isInvalidSku ? '#d1d5db' : '#9ca3af', cursor: isInvalidSku ? 'not-allowed' : 'pointer', display: 'inline-flex' }}
                                                    className={isInvalidSku ? '' : 'hover:text-indigo-600'} disabled={isInvalidSku} title="Deep Dive SKU">
                                                    <Search style={{ width: 14, height: 14 }} />
                                                </button>
                                            </td>
                                            <td>
                                                <div style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{row.sku}</div>
                                                <div style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200 }}>{row.title}</div>
                                            </td>
                                            <td className="r"><span className="v-num v-bold">{row.refundQty}</span></td>
                                            <td className="r col-red"><span className="v-num">{row.refundRate !== null ? `${row.refundRate.toFixed(1)}%` : <span className="v-dim">—</span>}</span></td>
                                            <td className="r col-red"><span className="v-neg v-bold">{formatMoney(row.refundValue)}</span></td>
                                            <td className="r col-red"><span className="v-num">{row.refundRateValue !== null ? `${(row.refundRateValue || 0).toFixed(1)}%` : <span className="v-dim">—</span>}</span></td>
                                            <td style={{ maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={parseReturnsReason(row.topReasons[0]?.reason).description || 'Unknown'}>
                                                <span style={{ fontSize: 11, color: '#6b7280' }}>{parseReturnsReason(row.topReasons[0]?.reason).description || 'Unknown'}</span>
                                                {row.topReasons[0] && <span style={{ color: '#9ca3af', fontSize: 11, marginLeft: 4 }}>({row.topReasons[0].count})</span>}
                                            </td>
                                            <td>
                                                <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
                                                    {row.flags.map((flag: string) => (
                                                        <span key={flag} style={{ padding: '1px 6px', background: '#fee2e2', color: '#b91c1c', fontSize: 9, borderRadius: 3, border: '1px solid #fca5a5', fontWeight: 700, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{flag}</span>
                                                    ))}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                }) : (
                                    <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontStyle: 'italic' }}>No refund alerts found for this selection.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Refund Details Explorer */}
            <div className="sello-glass rounded-xl overflow-hidden">
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--glass-divider)', background: 'var(--glass-head-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h3 style={{ fontWeight: 700, fontSize: 13, color: '#1f2937', textTransform: 'uppercase' }}>Refund Details Explorer</h3>
                    <div style={{ display: 'flex', background: 'rgba(255,255,255,0.7)', border: '1px solid var(--glass-divider)', padding: 3, borderRadius: 8 }}>
                        {(['reason', 'product', 'partner'] as ViewMode[]).map((mode, i) => (
                            <button key={mode} onClick={() => setViewMode(mode)}
                                style={{ padding: '5px 10px', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 5, transition: 'all 0.15s', background: viewMode === mode ? 'rgba(79,70,229,0.1)' : 'transparent', color: viewMode === mode ? '#4f46e5' : '#6b7280' }}>
                                {i === 0 ? <Info style={{ width: 12, height: 12 }} /> : i === 1 ? <Package style={{ width: 12, height: 12 }} /> : <TruckIcon style={{ width: 12, height: 12 }} />}
                                {mode === 'reason' ? 'By Reason' : mode === 'product' ? 'By Product' : 'By Carrier'}
                            </button>
                        ))}
                    </div>
                </div>

                <div style={{ padding: 24 }}>
                    <div style={{ border: '1px solid var(--glass-divider)', borderRadius: 8, overflow: 'auto', maxHeight: 400 }}>
                        <table className="sello-table" style={{ borderRadius: 0 }}>
                            <thead>
                                {viewMode === 'reason' ? (
                                    <tr>
                                        <SortableHeader label="Reason" sortKey="reason" sort={sortConfig} onChange={setSortConfig} />
                                        <SortableHeader label="Count" sortKey="count" sort={sortConfig} onChange={setSortConfig} align="right" />
                                        <SortableHeader label="Value" sortKey="totalValue" sort={sortConfig} onChange={setSortConfig} tint="red" align="right" />
                                        <th className="r">SKUs Affected</th>
                                    </tr>
                                ) : viewMode === 'product' ? (
                                    <tr>
                                        <SortableHeader label="SKU" sortKey="sku" sort={sortConfig} onChange={setSortConfig} />
                                        <SortableHeader label="Count" sortKey="count" sort={sortConfig} onChange={setSortConfig} align="right" />
                                        <SortableHeader label="Value" sortKey="totalValue" sort={sortConfig} onChange={setSortConfig} tint="red" align="right" />
                                        <th>Top Reason</th>
                                        <th className="r" style={{ width: 48 }}>Action</th>
                                    </tr>
                                ) : (
                                    <tr>
                                        <th style={{ width: 32 }}></th>
                                        <SortableHeader label="Logistic Partner" sortKey="partner" sort={sortConfig} onChange={setSortConfig} />
                                        <SortableHeader label="Complaints" sortKey="count" sort={sortConfig} onChange={setSortConfig} align="right" />
                                        <SortableHeader label="Share %" sortKey="countShare" sort={sortConfig} onChange={setSortConfig} align="right" />
                                        <SortableHeader label="Loss Value" sortKey="totalValue" sort={sortConfig} onChange={setSortConfig} tint="red" align="right" />
                                        <th>Primary Issue</th>
                                        <th className="r">Action</th>
                                    </tr>
                                )}
                            </thead>
                            <tbody>
                                {paginatedData.map((item: any) => {
                                    const isInvalidSku = viewMode === 'product' && (!item.sku || item.sku === 'Unknown' || item.sku === 'Freight');
                                    const isPartnerExpanded = viewMode === 'partner' && expandedPartner === item.partner;
                                    return (
                                        <React.Fragment key={viewMode === 'reason' ? item.reason : viewMode === 'product' ? item.sku : item.partner}>
                                            <tr style={{ background: isPartnerExpanded ? 'var(--theme-10)' : undefined, borderLeft: isPartnerExpanded ? '2px solid var(--theme)' : undefined, cursor: viewMode === 'partner' ? 'pointer' : undefined }}
                                                onClick={() => viewMode === 'partner' && togglePartnerExpand(item.partner)}>
                                                {viewMode === 'reason' ? (
                                                    <>
                                                        <td style={{ maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.reason}><span style={{ fontSize: 12, color: '#374151' }}>{item.reason}</span></td>
                                                        <td className="r"><span className="v-num">{item.count}</span></td>
                                                        <td className="r col-red"><span className="v-neg v-bold">{formatMoney(item.totalValue)}</span></td>
                                                        <td className="r"><span className="v-num">{item.skus.size}</span></td>
                                                    </>
                                                ) : viewMode === 'product' ? (
                                                    <>
                                                        <td>
                                                            <div style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{item.sku}</div>
                                                            <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 150 }}>{productLookup.get(item.sku)?.name || ''}</div>
                                                        </td>
                                                        <td className="r"><span className="v-num">{item.count}</span></td>
                                                        <td className="r col-red"><span className="v-neg v-bold">{formatMoney(item.totalValue)}</span></td>
                                                        <td style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ fontSize: 11, color: '#6b7280' }}>{parseReturnsReason(item.topReason).description || item.topReason}</span></td>
                                                        <td className="r">
                                                            <button onClick={() => !isInvalidSku && handleDeepDiveClick(item.sku)}
                                                                style={{ padding: 6, border: '1px solid', borderRadius: 4, borderColor: isInvalidSku ? '#e5e7eb' : '#e5e7eb', background: '#fff', cursor: isInvalidSku ? 'not-allowed' : 'pointer', opacity: isInvalidSku ? 0.3 : 1, display: 'inline-flex', color: '#9ca3af' }}
                                                                className={isInvalidSku ? '' : 'hover:border-indigo-300 hover:text-indigo-600'}>
                                                                <Search style={{ width: 12, height: 12 }} />
                                                            </button>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td style={{ textAlign: 'center' }}>{isPartnerExpanded ? <ChevronDown style={{ width: 14, height: 14, color: '#4f46e5' }} /> : <ChevronRight style={{ width: 14, height: 14, color: '#9ca3af' }} />}</td>
                                                        <td><span style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{item.partner}</span></td>
                                                        <td className="r"><span className="v-num">{item.count}</span></td>
                                                        <td className="r">
                                                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                                                                <span className="v-num">{item.countShare.toFixed(1)}%</span>
                                                                <div style={{ width: 48, height: 4, background: '#f3f4f6', borderRadius: 2, overflow: 'hidden' }}>
                                                                    <div style={{ height: '100%', background: '#4f46e5', width: `${item.countShare}%` }} />
                                                                </div>
                                                            </div>
                                                        </td>
                                                        <td className="r col-red"><span className="v-neg v-bold">{formatMoney(item.totalValue)}</span></td>
                                                        <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><span style={{ fontSize: 11, color: '#6b7280' }}>{item.topReason}</span></td>
                                                        <td className="r">
                                                            <button onClick={e => { e.stopPropagation(); onAnalyzeCarrier(item.partner); }}
                                                                style={{ padding: 6, border: '1px solid #e5e7eb', borderRadius: 4, background: '#fff', cursor: 'pointer', display: 'inline-flex', color: '#9ca3af' }}
                                                                className="hover:border-indigo-300 hover:text-indigo-600" title="Analyze Carrier">
                                                                <MapIcon style={{ width: 12, height: 12 }} />
                                                            </button>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                            {isPartnerExpanded && viewMode === 'partner' && (
                                                <tr style={{ background: 'rgba(249,250,251,0.5)' }}>
                                                    <td colSpan={7} style={{ padding: 16 }}>
                                                        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                                                            {/* Service Breakdown */}
                                                            <div style={{ background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                                                                <div style={{ padding: '6px 12px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#6b7280', display: 'flex', justifyContent: 'space-between' }}>
                                                                    <span>Service Breakdown for {item.partner}</span>
                                                                    <span>From imported transaction log</span>
                                                                </div>
                                                                <table className="sello-table" style={{ borderRadius: 0 }}>
                                                                    <thead><tr><th>Service Name</th><th className="r">Refunds</th><th className="r">Share %</th><th className="r col-red">Value</th></tr></thead>
                                                                    <tbody>
                                                                        {item.servicesBreakdown.length > 0 ? item.servicesBreakdown.map((srv: any, idx: number) => (
                                                                            <tr key={idx}>
                                                                                <td><span className="v-dim">{srv.name || 'Unknown / Not Mapped'}</span></td>
                                                                                <td className="r"><span className="v-num v-bold">{srv.count}</span></td>
                                                                                <td className="r"><span className="v-num">{srv.share.toFixed(1)}%</span></td>
                                                                                <td className="r col-red"><span className="v-neg">{formatMoney(srv.value)}</span></td>
                                                                            </tr>
                                                                        )) : <tr><td colSpan={4} style={{ padding: '12px 16px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', fontSize: 11 }}>No service detail available. Re-import Sales Report.</td></tr>}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                            {/* Source Records */}
                                                            <div style={{ background: '#fff', borderRadius: 6, border: '1px solid #e5e7eb', overflow: 'hidden' }}>
                                                                <div style={{ padding: '6px 12px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                                                                    className="hover:bg-gray-100" onClick={() => setShowSourceRecords(showSourceRecords === item.partner ? null : item.partner)}>
                                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                                        <FileSearch style={{ width: 12, height: 12, color: '#6b7280' }} />
                                                                        <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#374151' }}>Inspect Contributing Records ({item.records.length})</span>
                                                                    </div>
                                                                    <ChevronDown style={{ width: 12, height: 12, color: '#9ca3af', transform: showSourceRecords === item.partner ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
                                                                </div>
                                                                {showSourceRecords === item.partner && (
                                                                    <div style={{ maxHeight: 240, overflowY: 'auto' }}>
                                                                        {item.partner === 'Unattributed Carrier' && (
                                                                            <div style={{ padding: '8px 12px', background: '#fffbeb', fontSize: 10, color: '#92400e', borderBottom: '1px solid #fde68a', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                                                                                <AlertTriangle style={{ width: 12, height: 12, marginTop: 1, flexShrink: 0 }} />
                                                                                <div><strong>Diagnosis:</strong> These refunds could not be linked to a known carrier. Check if the Order ID exists in imported Sales History and that Logistic Partner column is mapped.</div>
                                                                            </div>
                                                                        )}
                                                                        <table className="sello-table" style={{ borderRadius: 0 }}>
                                                                            <thead><tr><th>Date</th><th>Order ID</th><th>SKU</th><th className="r col-red">Refund Amt</th></tr></thead>
                                                                            <tbody>
                                                                                {item.records.slice(0, 100).map((rec: RefundLog, rIdx: number) => (
                                                                                    <tr key={rec.id || rIdx}>
                                                                                        <td><span className="v-dim">{new Date(rec.date).toLocaleDateString()}</span></td>
                                                                                        <td><span className="v-num" style={{ color: '#4f46e5', userSelect: 'all', cursor: 'text' }}>{rec.orderId || '—'}</span></td>
                                                                                        <td><span className="v-dim">{rec.sku}</span></td>
                                                                                        <td className="r col-red"><span className="v-neg">{formatMoney((rec.amount || 0) + (rec.freightAmount || 0))}</span></td>
                                                                                    </tr>
                                                                                ))}
                                                                                {item.records.length > 100 && <tr><td colSpan={4} style={{ padding: '8px 12px', textAlign: 'center', color: '#9ca3af', fontStyle: 'italic', fontSize: 11 }}>...and {item.records.length - 100} more</td></tr>}
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
                    <div className="sello-table-footer">
                        <span style={{ fontSize: 12, color: '#6b7280' }}>Page {currentPage} of {totalPages}</span>
                        <div className="sello-pagination">
                            <button className="sello-page-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>Prev</button>
                            <button className="sello-page-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>Next</button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );

    function handleDeepDiveClick(sku: string) { if (!sku || sku === 'Unknown' || sku === 'Freight') return; onDeepDive(sku); }
};
