
import React, { useState } from 'react';
import { User, Globe, BarChart3, X } from 'lucide-react';
import { SortState } from '../../../utils/tableSort';
import { SortableHeader } from '../../common/SortableHeader';
import { formatMoney, formatSmartMoney, formatPct, formatNumber } from '../../../utils/format';
import { TAX_NOTE_SHORT } from '../../../services/taxPolicy';
import { PlatformSummary, PlatformSortKey } from '../platformManagement.types';
import { PricingRules } from '../../../types';
import { PlatformMetricCard } from '../parts/PlatformMetricCard';
import AuditPanel from '../../AuditPanel';
import { FilterBar } from '../../common/FilterBar';

interface PlatformOverviewTabProps {
    sortedSummaries: PlatformSummary[];
    selectedPlatformKey: string | null;
    setSelectedPlatformKey: (key: string | null) => void;
    pricingRules: PricingRules;
    themeColor: string;
    selectedSummary?: PlatformSummary;
    categoryBreakdown: { name: string; revenue: number }[];
    sort: SortState<PlatformSortKey>;
    setSort: (sort: SortState<PlatformSortKey>) => void;
    topPlatformKey: string | null;
    startKey?: string;
    endKey?: string;
    isAuditVisible: boolean;
}

export const PlatformOverviewTab: React.FC<PlatformOverviewTabProps> = ({
    sortedSummaries,
    selectedPlatformKey,
    setSelectedPlatformKey,
    pricingRules,
    themeColor,
    selectedSummary,
    categoryBreakdown,
    sort,
    setSort,
    topPlatformKey,
    startKey = '',
    endKey = '',
    isAuditVisible,
}) => {
    return (
        <div className="space-y-6">
            {isAuditVisible && (
                <div className="">
                    <AuditPanel
                        title="Platform Overview Audit"
                        startKey={startKey}
                        endKey={endKey}
                        rows={sortedSummaries}
                        getDateKey={() => null}
                        getRevenue={(row) => row.revenue}
                        getQty={(row) => row.units}
                        getProfit={(row) => row.profit}
                        getAdSpend={(row) => row.adSpend}
                        distinctDaysCount={startKey && endKey
                            ? Math.round((new Date(endKey).getTime() - new Date(startKey).getTime()) / 86400000) + 1
                            : 0}
                    />
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedSummaries.map((summary) => (
                    <PlatformMetricCard
                        key={summary.platform}
                        summary={summary}
                        isTop={summary.platform === topPlatformKey}
                        isSelected={selectedPlatformKey === summary.platform}
                        onSelect={() => setSelectedPlatformKey(summary.platform)}
                        rule={pricingRules[summary.platform]}
                        themeColor={themeColor}
                    />
                ))}
            </div>
            <div className="flex flex-col lg:flex-row gap-6 items-start">
                <div className={`bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden transition-all duration-300 ${selectedPlatformKey ? 'lg:w-2/3' : 'w-full'}`}>
                    <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center">
                        <h3 className="font-bold text-gray-800 flex items-center gap-2">
                            <Globe className="w-4 h-4 text-theme" />Performance Matrix
                        </h3>
                        <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white/50 px-2 py-1 rounded border border-gray-100">{TAX_NOTE_SHORT}</div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="tbl w-full text-left text-sm whitespace-nowrap">
                            <thead className="sticky top-0">
                                <tr>
                                    <SortableHeader label="Platform" sortKey="name" sort={sort} onChange={setSort as any} themeColor={themeColor} />
                                    {!selectedPlatformKey && <SortableHeader label="Manager" sortKey="manager" sort={sort} onChange={setSort as any} themeColor={themeColor} />}
                                    <SortableHeader label="SKUs" sortKey="skus" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" />
                                    <SortableHeader label="Revenue" sortKey="revenue" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" />
                                    <SortableHeader label="Profit (Gross)" sortKey="profit" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" />
                                    <SortableHeader label="Net Profit" sortKey="netProfit" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" className="bg-green-50/20" />
                                    <SortableHeader label="Margin %" sortKey="margin" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" />
                                    <SortableHeader label="Units" sortKey="velocity" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" />
                                </tr>
                            </thead>
                            <tbody>
                                {sortedSummaries.map((summary) => {
                                    const rule = pricingRules[summary.platform];
                                    const isSelected = selectedPlatformKey === summary.platform;
                                    const isCostBased = rule?.pricingControl === 'PLATFORM_COST_BASED';
                                    return (
                                        <tr key={summary.platform} className={`cursor-pointer ${isSelected ? 'bg-theme-10/50' : ''}`} onClick={() => setSelectedPlatformKey(isSelected ? null : summary.platform)}>
                                            <td className="p-4">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-sm" style={{ backgroundColor: rule?.color || '#6366f1' }}>{summary.platform[0]}</div>
                                                    <span className="font-bold text-gray-900">{summary.platform}</span>
                                                </div>
                                            </td>
                                            {!selectedPlatformKey && (<td className="p-4"><div className="flex items-center gap-2 text-gray-600"><User className="w-3.5 h-3.5" />{rule?.manager || 'Unassigned'}</div></td>)}
                                            <td className="p-4 text-right font-medium">{summary.skuCount}</td>
                                            <td className="p-4 text-right font-bold text-theme">
                                                {formatSmartMoney(summary.revenue)}
                                                {isCostBased && <span className="block text-[8px] text-slate-400 font-normal uppercase mt-0.5">Cost Basis</span>}
                                            </td>
                                            <td className="p-4 text-right font-medium text-gray-700">{formatSmartMoney(summary.profit)}</td>
                                            <td className="p-4 text-right font-bold text-emerald-600 bg-emerald-50/10">{formatSmartMoney(summary.netProfit)}</td>
                                            <td className="p-4 text-right"><span className={`font-bold ${summary.marginPct >= 15 ? 'text-emerald-600' : summary.marginPct >= 0 ? 'text-amber-500' : 'text-red-500'}`}>{formatPct(summary.marginPct)}</span></td>
                                            <td className="p-4 text-right text-gray-500">{formatNumber(summary.units)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
                {selectedPlatformKey && selectedSummary && (
                    <div className="lg:w-1/3 space-y-6">
                        <div className="bg-custom-glass rounded-xl border border-custom-glass shadow-lg overflow-hidden">
                            <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black text-white shadow-sm" style={{ backgroundColor: pricingRules[selectedPlatformKey]?.color || themeColor }}>{selectedPlatformKey[0]}</div>
                                    <h3 className="font-bold text-gray-900 text-sm">{selectedPlatformKey} Details</h3>
                                </div>
                                <button onClick={() => setSelectedPlatformKey(null)} className="p-1 hover:bg-gray-200 rounded-full text-gray-400 transition-colors"><X className="w-4 h-4" /></button>
                            </div>
                            <div className="p-5 space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">
                                            Revenue
                                            {pricingRules[selectedPlatformKey]?.pricingControl === 'PLATFORM_COST_BASED' && <span className="ml-1 text-[8px] bg-slate-100 text-slate-500 px-1 rounded">Cost Basis</span>}
                                        </span>
                                        <div className="text-xl font-bold text-gray-900">{formatSmartMoney(selectedSummary.revenue)}</div>
                                    </div>
                                    <div><span className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">Net Profit</span><div className={`text-xl font-bold ${selectedSummary.netProfit >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>{formatSmartMoney(selectedSummary.netProfit)}</div></div>
                                </div>
                                <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100">
                                    <div className="space-y-1">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Performance</span>
                                        <div className={`text-sm font-black ${selectedSummary.marginPct >= 15 ? 'text-emerald-600' : 'text-amber-500'}`}><span className="text-gray-400 font-normal mr-1">Margin:</span> {formatPct(selectedSummary.marginPct)}</div>
                                        <div className="text-sm font-black text-gray-700"><span className="text-gray-400 font-normal mr-1">TACoS:</span> {formatPct(selectedSummary.tacosPct)}</div>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <span className="text-[10px] font-bold text-gray-400 uppercase block">Scale</span>
                                        <div className="text-sm font-black text-gray-700">{formatNumber(selectedSummary.orders)} <span className="text-gray-400 font-normal ml-1">Orders</span></div>
                                        <div className="text-sm font-black text-gray-700">{formatNumber(selectedSummary.units)} <span className="text-gray-400 font-normal ml-1">Units</span></div>
                                    </div>
                                </div>
                                <div className="pt-4 border-t border-gray-100">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">Gross Profit (Before Ads)</span>
                                    <div className="text-sm font-medium text-gray-600">{formatSmartMoney(selectedSummary.profit)}</div>
                                </div>
                            </div>
                        </div>
                        <div className="bg-custom-glass rounded-xl border border-custom-glass shadow-lg overflow-hidden">
                            <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex items-center justify-between">
                                <h3 className="font-bold text-gray-900 text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-theme" />Top Categories</h3>
                                <span className="text-[9px] font-bold text-gray-400 uppercase">by Revenue</span>
                            </div>
                            <div className="p-5">
                                {categoryBreakdown.length > 0 ? (
                                    <div className="space-y-4">
                                        {categoryBreakdown.map((cat: any, i: number) => (
                                            <div key={cat.name} className="space-y-1">
                                                <div className="flex justify-between items-center text-[11px]">
                                                    <div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded bg-gray-100 flex items-center justify-center text-[8px] font-black text-gray-400">{i + 1}</span><span className="font-semibold text-gray-700 truncate max-w-[140px]">{cat.name}</span></div>
                                                    <span className="font-bold text-gray-900">{formatSmartMoney(cat.revenue)}</span>
                                                </div>
                                                <div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-theme rounded-full transition-all duration-1000 ease-out" style={{ width: `${(cat.revenue / categoryBreakdown[0].revenue) * 100}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="py-6 text-center text-xs text-gray-400 italic">No breakdown available.</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
