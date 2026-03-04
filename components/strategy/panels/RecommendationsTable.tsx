
import React from 'react';
import { GradeBadge } from '../../GradeBadge';
import { FilterBar } from '../../common/FilterBar';
import { SortableHeader } from '../../common/SortableHeader';
import { SortState } from '../../../utils/tableSort';
import { Eye, EyeOff, AlertCircle, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';
import { formatMoney, formatNumber, formatPct } from '../../../utils/format';
import { SkuFamily, Product } from '../../../types';
import { VAT_MULTIPLIER } from '../../../constants';

interface RecommendationsTableProps {
    paginatedData: any[];
    totalCount: number;
    currentPage: number;
    setCurrentPage: (p: number | ((prev: number) => number)) => void;
    itemsPerPage: number;
    setItemsPerPage: (n: number) => void;
    totalPages: number;
    sort: SortState<string> | null;
    setSort: (s: SortState<string> | null) => void;
    filterTab: string;
    setFilterTab: (t: any) => void;
    showOOS: boolean;
    setShowOOS: (b: boolean) => void;
    searchTags: string[];
    setSearchTags: (t: string[]) => void;
    setSearchQuery: (q: string) => void;
    themeColor: string;
    showAudit?: boolean;
    auditActive?: boolean;
    onAuditToggle?: () => void;
    skuFamilies: SkuFamily[];
    products: Product[];
}

export const RecommendationsTable: React.FC<RecommendationsTableProps> = ({
    paginatedData,
    totalCount,
    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,
    totalPages,
    sort,
    setSort,
    filterTab,
    setFilterTab,
    showOOS,
    setShowOOS,
    searchTags,
    setSearchTags,
    setSearchQuery,
    themeColor,
    showAudit,
    auditActive,
    onAuditToggle,
    skuFamilies = [],
    products = []
}) => {

    const getRunwayBin = (days: number, stockLevel: number, leadTime: number) => {
        if (stockLevel <= 0) return { label: 'Out of Stock', color: 'bg-red-50 text-red-600 border-red-200' };

        if (days > 730) return { label: '> 2 Years', color: 'bg-green-50 text-green-600 border-green-200' };

        let status = 'Healthy';
        let color = 'bg-green-50 text-green-600 border-green-200';

        if (days < leadTime) {
            status = 'Critical';
            color = 'bg-red-50 text-red-600 border-red-200';
        } else if (days < leadTime * 1.5) {
            status = 'Warning';
            color = 'bg-amber-50 text-amber-600 border-amber-200';
        } else if (days > leadTime * 4) {
            status = 'Overstock';
            color = 'bg-orange-50 text-orange-600 border-orange-200';
        }

        const weeks = days / 7;
        const label = `${weeks.toFixed(1)} Weeks`;

        return { label, color };
    };

    return (
        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
            <FilterBar
                searchValue={searchTags[0] || ''}
                onSearchChange={(val) => { setSearchTags([val]); setSearchQuery(val); setCurrentPage(1); }}
                searchPlaceholder="Filter by SKU or Alias..."
                pillGroup={{
                    options: [
                        { key: 'All', label: 'All' },
                        { key: 'INCREASE', label: 'Increase' },
                        { key: 'DECREASE', label: 'Decrease' },
                        { key: 'MAINTAIN', label: 'Maintain' }
                    ],
                    active: filterTab,
                    onChange: setFilterTab
                }}
                toggles={[
                    {
                        key: 'oos',
                        label: 'OOS Hidden',
                        activeLabel: 'OOS Shown',
                        icon: EyeOff,
                        activeIcon: Eye,
                        active: showOOS,
                        onChange: setShowOOS
                    }
                ]}
                showAudit={showAudit}
                auditActive={auditActive}
                onAuditToggle={onAuditToggle}
                rightSlot={
                    <div className="text-xs text-gray-500 mr-2">Showing <strong>{totalCount}</strong> SKUs</div>
                }
            />

            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50/50 text-gray-600 font-semibold border-b border-gray-200/50">
                        <tr>
                            <SortableHeader label="Product" sortKey="sku" sort={sort} onChange={setSort} themeColor={themeColor} />
                            <SortableHeader label="Runway / Velocity" sortKey="runway" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                            <SortableHeader label="Inventory" sortKey="inventory" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                            <SortableHeader label="Recent Avg Price" sortKey="avgPrice" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="bg-blue-50/50" />
                            <SortableHeader label="Recent Sales $" sortKey="sales" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="bg-blue-50/50" />
                            <SortableHeader label="Recent Qty" sortKey="qty" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="bg-blue-50/50" />
                            <SortableHeader label="Net PM%" sortKey="margin" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="bg-green-50/50" />
                            <SortableHeader label="Recent Changes (30D)" sortKey="recentChanges" sort={sort} onChange={setSort} themeColor={themeColor} align="center" />
                            <SortableHeader label="CA Price" sortKey="caPrice" sort={sort} onChange={setSort} themeColor={themeColor} align="right" className="text-purple-600" />
                            <SortableHeader label="New Price" sortKey="newPrice" sort={sort} onChange={setSort} themeColor={themeColor} align="right" />
                            <SortableHeader label="Action" sortKey="action" sort={sort} onChange={setSort} themeColor={themeColor} align="center" />
                            <th className="p-4">Reason</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/50">
                        {paginatedData.map((row: any) => (
                            <tr key={row.id} className={`even:bg-gray-50/30 hover:bg-gray-100/50 ${row.safetyViolation ? 'bg-amber-50/30' : ''}`}>
                                <td className="p-4">
                                    <div className="flex items-center">
                                        <div className="font-bold text-gray-900">{row.sku}</div>
                                        <GradeBadge gradeLevel={row.gradeLevel} />

                                        {/* Family Group Badge */}
                                        {(() => {
                                            const family = skuFamilies.find(f => f.memberSkus.includes(row.sku));
                                            if (!family) return null;
                                            const siblings = family.memberSkus.filter(s => s !== row.sku);

                                            return (
                                                <div className="group relative ml-2">
                                                    <div className="p-1 bg-indigo-50 text-indigo-500 rounded-md border border-indigo-100/50 hover:bg-indigo-100 transition-colors cursor-help">
                                                        <Layers className="w-3 h-3" />
                                                    </div>

                                                    {/* Tooltip */}
                                                    <div className="absolute bottom-full left-0 mb-2 w-72 p-3 bg-gray-900 text-white text-[11px] rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-[100] transform translate-y-1 group-hover:translate-y-0 border border-white/10 backdrop-blur-md">
                                                        <div className="font-bold mb-2 border-b border-gray-700 pb-1.5 flex items-center gap-2">
                                                            <Layers className="w-3.5 h-3.5 text-indigo-400" />
                                                            Family Group: {family.name}
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            {siblings.length > 0 ? siblings.map(s => {
                                                                const siblingProd = products.find(p => p.sku === s);
                                                                const price = siblingProd ? (siblingProd.caPrice || (siblingProd.currentPrice * VAT_MULTIPLIER)) : 0;
                                                                return (
                                                                    <div key={s} className="flex justify-between items-center bg-white/5 p-1 px-1.5 rounded">
                                                                        <span className="font-medium text-gray-300">{s}</span>
                                                                        <span className="font-bold text-indigo-300">{formatMoney(price)}</span>
                                                                    </div>
                                                                );
                                                            }) : (
                                                                <div className="text-gray-500 italic">No sibling SKUs</div>
                                                            )}
                                                        </div>
                                                        <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate max-w-[200px]">{row.name}</div>
                                    <div className="flex flex-wrap items-center gap-1 mt-1.5">{row.subcategory && <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full border border-gray-200">{row.subcategory}</span>}{row.seasonTags?.slice(0, 2).map((tag: string) => (<span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>))}{(row.seasonTags?.length || 0) > 2 && (<span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{(row.seasonTags?.length || 0) - 2}</span>)}{row.festivalTags?.slice(0, 2).map((tag: string) => (<span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>))}{(row.festivalTags?.length || 0) > 2 && (<span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{(row.festivalTags?.length || 0) - 2}</span>)}</div>
                                </td>
                                <td className="p-4 text-right">
                                    <div className="flex flex-col items-end gap-1.5">
                                        {(() => {
                                            const runwayBin = getRunwayBin(row.runwayDays, row.stockLevel, row.leadTimeDays);
                                            return (<span className={`inline-flex items-center px-2.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${runwayBin.color}`}>{runwayBin.label}</span>);
                                        })()}
                                        <span className="text-[11px] font-semibold text-gray-700">{formatNumber(row.dailyVelocity, 1)} / day</span>
                                    </div>
                                </td>
                                <td className="p-4 text-right font-mono font-bold text-gray-700">{row.stockLevel}</td>
                                <td className="p-4 text-right bg-blue-50/30">£{formatMoney(row.averagePrice, 2, '')}</td>
                                <td className="p-4 text-right bg-blue-50/30">£{formatNumber(row.recentTotalSales, 2)}</td>
                                <td className="p-4 text-right bg-blue-50/30 font-bold">{formatNumber(row.recentTotalQty, 0)}</td>
                                <td className="p-4 text-right bg-green-50/30 font-bold text-emerald-600">
                                    <span title={`Profit: £${formatMoney(row.totalProfit, 4, '')} / Sales: £${formatNumber(row.recentTotalSales, 2)}`} className="cursor-help border-b border-dotted border-green-700/50">
                                        {formatPct(row.netPmPercent, 1)}
                                    </span>
                                </td>
                                <td className="p-4 text-center">
                                    {row.recentChanges && Array.isArray(row.recentChanges) && row.recentChanges.length > 0 ? (
                                        <div className="flex items-center justify-center gap-1.5" title="History (30D): Oldest → Newest (4 Weeks)">
                                            {row.recentChanges.map((type: string | null, idx: number) => {
                                                if (type === 'INCREASE') {
                                                    return <span key={idx} title="Price Increase" className="inline-flex"><ArrowUpRight className="w-4 h-4 text-green-600 stroke-[3]" /></span>;
                                                }
                                                if (type === 'DECREASE') {
                                                    return <span key={idx} title="Price Decrease" className="inline-flex"><ArrowDownRight className="w-4 h-4 text-red-500 stroke-[3]" /></span>;
                                                }
                                                return <span key={idx} className="text-gray-300 font-mono text-xs select-none" title="No change">-</span>;
                                            })}
                                        </div>
                                    ) : (
                                        <span className="text-gray-300">-</span>
                                    )}
                                </td>
                                <td className="p-4 text-right font-bold text-purple-600 font-mono">{row.caPrice ? `£${formatMoney(row.caPrice, 2, '')}` : '-'}</td>
                                <td className="p-4 text-right font-mono font-bold">
                                    {row.action !== 'MAINTAIN' ? (
                                        <span style={{ color: themeColor }}>£{formatMoney(row.adjustedPrice, 2, '')}</span>
                                    ) : '-'}
                                    {row.safetyViolation && <AlertCircle className="w-4 h-4 text-red-500 inline ml-1" />}
                                </td>
                                <td className="p-4 text-center">
                                    {row.action === 'INCREASE' && <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-xs font-bold">INCREASE</span>}
                                    {row.action === 'DECREASE' && <span className="px-2 py-1 bg-red-100 text-red-800 rounded text-xs font-bold">DECREASE</span>}
                                    {row.action === 'MAINTAIN' && <span className="text-gray-400 text-xs shadow-sm border px-2 py-1 rounded">MAINTAIN</span>}
                                </td>
                                <td className="p-4 text-xs text-gray-500 max-w-[200px] truncate" title={row.reasoning}>
                                    {row.inPromotion && <span className="text-indigo-600 font-bold mr-1">[PROMO]</span>}
                                    {row.reasoning}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalCount > 0 && (
                <div className="bg-gray-50/50 px-4 py-3 border-t border-custom-glass flex items-center justify-between sm:px-6">
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                            <p className="text-sm text-gray-700">
                                Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, totalCount)}</span> of <span className="font-medium">{totalCount}</span> results
                            </p>
                            <select
                                value={itemsPerPage}
                                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer focus:ring-indigo-500 focus:border-indigo-500"
                            >
                                <option value={10}>10</option>
                                <option value={25}>25</option>
                                <option value={50}>50</option>
                                <option value={100}>100</option>
                            </select>
                        </div>
                        <div>
                            {totalPages > 1 && (
                                <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                        disabled={currentPage === 1}
                                        className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                    >
                                        <ChevronLeft className="h-5 w-5" />
                                    </button>
                                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                        Page {currentPage} of {totalPages}
                                    </span>
                                    <button
                                        onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                        disabled={currentPage === totalPages}
                                        className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 transition-colors"
                                    >
                                        <ChevronRight className="h-5 w-5" />
                                    </button>
                                </nav>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
