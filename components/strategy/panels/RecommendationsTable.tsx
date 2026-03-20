
import React from 'react';
import { GradeBadge } from '../../common/GradeBadge';
import { FilterBar } from '../../common/FilterBar';
import { SortableHeader } from '../../common/SortableHeader';
import { SortState } from '../../../utils/tableSort';
import { Eye, EyeOff, AlertCircle, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight, Layers } from 'lucide-react';
import { formatMoney, formatSmartMoney, formatNumber, formatPct } from '../../../utils/format';
import { SkuFamily, Product, OptimalPriceResult } from '../../../types';
import { VAT_MULTIPLIER } from '../../../constants';

// ── Confidence Badge (inline — same pattern as Sessions 4 & 5)
const ConfidenceBadge: React.FC<{ confidence: number; source: string }> = ({ confidence, source }) => {
    if (source === 'COHORT' || confidence < 0.3) {
        return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded border border-gray-300 text-gray-500">Benchmark</span>;
    }
    if (confidence >= 0.9) {
        return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-emerald-100 text-emerald-700">High</span>;
    }
    if (confidence >= 0.5) {
        return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-amber-100 text-amber-700">Medium</span>;
    }
    return <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-gray-100 text-gray-500">Low</span>;
};

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
    optimalPriceResults?: Map<string, OptimalPriceResult>;
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
    products = [],
    optimalPriceResults,
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
                searchTags={searchTags}
                onSearchTagsChange={(tags) => { setSearchTags(tags); setCurrentPage(1); }}
                onSearchChange={(val) => { setSearchQuery(val); setCurrentPage(1); }}
                searchPlaceholder="Filter by SKU or Alias…"
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

            <div className="sello-table-scroll">
                <table className="sello-table">
                    <thead>
                        <tr>
                            <SortableHeader label="Product" sortKey="sku" sort={sort} onChange={setSort} />
                            <SortableHeader label="Runway / Velocity" sortKey="runway" sort={sort} onChange={setSort} align="right" />
                            <SortableHeader label="Inventory" sortKey="inventory" sort={sort} onChange={setSort} align="right" />
                            <SortableHeader label="Recent Avg Price" sortKey="avgPrice" sort={sort} onChange={setSort} align="right" tint="blue" />
                            <SortableHeader label="Recent Sales $" sortKey="sales" sort={sort} onChange={setSort} align="right" tint="blue" />
                            <SortableHeader label="Recent Qty" sortKey="qty" sort={sort} onChange={setSort} align="right" tint="blue" />
                            <SortableHeader label="Net PM%" sortKey="margin" sort={sort} onChange={setSort} align="right" tint="green" />
                            <SortableHeader label="Recent Changes (30D)" sortKey="recentChanges" sort={sort} onChange={setSort} align="center" />
                            <SortableHeader label="CA Price" sortKey="caPrice" sort={sort} onChange={setSort} align="right" tint="ca" />
                            <SortableHeader label="New Price" sortKey="newPrice" sort={sort} onChange={setSort} align="right" />
                            <SortableHeader label="Action" sortKey="action" sort={sort} onChange={setSort} align="center" />
                            <th>Reason</th>
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedData.map((row: any) => (
                            <tr key={row.id} className={row.safetyViolation ? 'row-warn' : ''}>
                                <td>
                                    <div className="flex items-center">
                                        <div className="font-bold text-gray-900">{row.sku}</div>
                                        <GradeBadge gradeLevel={row.gradeLevel} />

                                        {/* Family Group Badge */}
                                        {(() => {
                                            const family = skuFamilies.find(f => f.memberSkus.includes(row.sku));
                                            if (!family) return null;
                                            const siblings = family.memberSkus.filter(s => s !== row.sku);
                                            const currentResult = optimalPriceResults?.get(row.sku);
                                            const rowCurrentPrice = row.caPrice || (row.currentPrice * VAT_MULTIPLIER) || 0;
                                            const rowOptimalPrice = currentResult?.recommendedPrice;

                                            // Anomaly: sibling is currently cheaper but algorithm says it should be pricier
                                            const anomaly = siblings.some(s => {
                                                const sibProd = products.find(p => p.sku === s);
                                                const sibResult = optimalPriceResults?.get(s);
                                                if (!sibProd || !sibResult) return false;
                                                const sibCurrent = sibProd.caPrice || 0;
                                                return sibCurrent < rowCurrentPrice && sibResult.recommendedPrice > (rowOptimalPrice || 0);
                                            });

                                            return (
                                                <div className="group relative ml-2">
                                                    <div className="p-1 bg-theme-10 text-theme rounded-md border border-indigo-100/50 hover:bg-theme-10 transition-colors cursor-help">
                                                        <Layers className="w-3 h-3" />
                                                    </div>

                                                    {/* Tooltip */}
                                                    <div className="absolute bottom-full left-0 mb-2 w-80 p-3 bg-gray-900 text-white text-[11px] rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-[100] transform translate-y-1 group-hover:translate-y-0 border border-white/10 backdrop-blur-md">
                                                        <div className="font-bold mb-2 border-b border-gray-700 pb-1.5 flex items-center gap-2">
                                                            <Layers className="w-3.5 h-3.5 text-theme" />
                                                            Family: {family.name}
                                                        </div>

                                                        {/* Column headers */}
                                                        <div className="grid grid-cols-3 text-[9px] text-gray-500 uppercase tracking-wide mb-1 px-1.5">
                                                            <span>SKU</span>
                                                            <span className="text-right">Current</span>
                                                            <span className="text-right">Optimal</span>
                                                        </div>

                                                        {/* Current row — highlighted */}
                                                        <div className="grid grid-cols-3 items-center bg-theme/20 p-1 px-1.5 rounded border border-indigo-400/20 mb-1">
                                                            <span className="font-bold text-indigo-200">{row.sku} ★</span>
                                                            <span className="text-right font-bold text-gray-200">{formatSmartMoney(rowCurrentPrice)}</span>
                                                            <span className="text-right font-bold text-emerald-300">
                                                                {rowOptimalPrice ? formatSmartMoney(rowOptimalPrice) : '—'}
                                                            </span>
                                                        </div>

                                                        {/* Sibling rows */}
                                                        <div className="space-y-1">
                                                            {siblings.length > 0 ? siblings.map(s => {
                                                                const siblingProd = products.find(p => p.sku === s);
                                                                const sibResult = optimalPriceResults?.get(s);
                                                                const sibCurrentPrice = siblingProd ? (siblingProd.caPrice || (siblingProd.currentPrice * VAT_MULTIPLIER)) : 0;
                                                                return (
                                                                    <div key={s} className="grid grid-cols-3 items-center bg-white/5 p-1 px-1.5 rounded">
                                                                        <span className="font-medium text-gray-300">{s}</span>
                                                                        <span className="text-right text-gray-300">{formatSmartMoney(sibCurrentPrice)}</span>
                                                                        <span className="text-right font-bold text-emerald-300">
                                                                            {sibResult ? formatSmartMoney(sibResult.recommendedPrice) : '—'}
                                                                        </span>
                                                                    </div>
                                                                );
                                                            }) : (
                                                                <div className="text-gray-500 italic px-1.5">No sibling SKUs</div>
                                                            )}
                                                        </div>

                                                        {/* Anomaly hint */}
                                                        {anomaly && (
                                                            <div className="mt-2 pt-2 border-t border-gray-700 text-[10px] text-amber-300 flex items-start gap-1.5">
                                                                <span>⚠</span>
                                                                <span>Optimal prices may not reflect expected family hierarchy. Review siblings before applying.</span>
                                                            </div>
                                                        )}

                                                        <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                                                    </div>
                                                </div>
                                            );
                                        })()}
                                    </div>
                                    <div className="text-xs text-gray-500 truncate max-w-[200px]">{row.name}</div>
                                    <div className="flex flex-wrap items-center gap-1 mt-1.5">{row.subcategory && <span className="inline-block px-2 py-0.5 bg-gray-100 text-gray-600 text-[10px] rounded-full border border-gray-200">{row.subcategory}</span>}{row.seasonTags?.slice(0, 2).map((tag: string) => (<span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>))}{(row.seasonTags?.length || 0) > 2 && (<span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{(row.seasonTags?.length || 0) - 2}</span>)}{row.festivalTags?.slice(0, 2).map((tag: string) => (<span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>))}{(row.festivalTags?.length || 0) > 2 && (<span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{(row.festivalTags?.length || 0) - 2}</span>)}</div>
                                </td>
                                <td className="r">
                                    <div className="flex flex-col items-end gap-1.5">
                                        {(() => {
                                            const runwayBin = getRunwayBin(row.runwayDays, row.stockLevel, row.leadTimeDays);
                                            return (<span className={`inline-flex items-center px-2.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ${runwayBin.color}`}>{runwayBin.label}</span>);
                                        })()}
                                        <span className="text-[11px] font-semibold text-gray-700">{formatNumber(row.dailyVelocity, 1)} / day</span>
                                    </div>
                                </td>
                                <td className="r v-num">{row.stockLevel}</td>
                                <td className="r col-blue">{formatSmartMoney(row.averagePrice)}</td>
                                <td className="r col-blue">£{formatNumber(row.recentTotalSales, 2)}</td>
                                <td className="r col-blue v-num v-bold">{formatNumber(row.recentTotalQty, 0)}</td>
                                <td className="r col-green">
                                    <span title={`Profit: £${formatMoney(row.totalProfit, 4, '')} / Sales: £${formatNumber(row.recentTotalSales, 2)}`} className="cursor-help border-b border-dotted border-green-700/50">
                                        {formatPct(row.netPmPercent, 1)}
                                    </span>
                                </td>
                                <td className="c">
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
                                <td className="r v-ca">{row.caPrice ? formatSmartMoney(row.caPrice) : '-'}</td>
                                <td className="r v-num">
                                    {(() => {
                                        const optResult = optimalPriceResults?.get(row.sku);
                                        return (
                                            <div className="flex flex-col items-end gap-1">
                                                {row.action !== 'MAINTAIN' ? (
                                                    <div className="group relative">
                                                        <span style={{ color: themeColor }}>{formatSmartMoney(row.adjustedPrice)}</span>
                                                        {row.safetyViolation && <AlertCircle className="w-4 h-4 text-red-500 inline ml-1" />}
                                                        {/* Reasoning tooltip */}
                                                        {optResult && (
                                                            <div className="absolute bottom-full right-0 mb-2 w-72 p-3 bg-gray-900 text-white text-[11px] rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50 border border-white/10">
                                                                <p className="text-gray-300 leading-relaxed">
                                                                    {optResult.reasoning.split('. ').slice(0, 2).join('. ')}.
                                                                </p>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-gray-400">-</span>
                                                )}
                                                {optResult && (
                                                    <ConfidenceBadge confidence={optResult.confidence} source={optResult.source} />
                                                )}
                                            </div>
                                        );
                                    })()}
                                </td>
                                <td className="c">
                                    {row.action === 'INCREASE' && <span className="sello-badge badge-increase">INCREASE</span>}
                                    {row.action === 'DECREASE' && <span className="sello-badge badge-decrease">DECREASE</span>}
                                    {row.action === 'MAINTAIN' && <span className="sello-badge badge-maintain">MAINTAIN</span>}
                                </td>
                                <td className="max-w-[200px] truncate" title={row.reasoning}>
                                    {row.inPromotion && <span className="text-theme font-bold mr-1">[PROMO]</span>}
                                    {row.reasoning}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {totalCount > 0 && (
                <div className="sello-table-footer">
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                            <p className="text-sm text-gray-700">
                                Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, totalCount)}</span> of <span className="font-medium">{totalCount}</span> results
                            </p>
                            <select
                                value={itemsPerPage}
                                onChange={(e) => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                                className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer focus:ring-theme focus:border-theme"
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
