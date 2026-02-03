
import React from 'react';
import { Layers, Package, MapPin, TrendingDown, TrendingUp, Info, ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';
import { GradeBadge } from '../../../GradeBadge';
import { formatNumber, formatMoney, formatPct } from '../../../../utils/format';
import { calcRevenue, calcProfit, calcUnits, calcAdSpend, calcMarginPct } from '../../../../services/metrics';
import { ThresholdConfig } from '../../../../services/thresholdsConfig';
import { Product } from '../../../../types';
import { SortableHeader } from '../../../common/SortableHeader';

interface SearchResultPanelsProps {
    data: { results: any[] };
    hierarchicalData: any[];
    groupBy: 'platform' | 'sku';
    expandedGroup: string | null;
    expandedSubGroup: string | null;
    handleGroupToggle: (key: string, e?: React.MouseEvent) => void;
    handleSubGroupToggle: (key: string, e: React.MouseEvent) => void;
    volumeContextStats: any;
    context: {
        isVolume: boolean;
        isAd: boolean;
        isMargin: boolean;
        isInventory: boolean;
        isTrend: boolean;
        isReturn: boolean;
        isOrganic: boolean;
        isAged: boolean;
        isPostcode: boolean;
    };
    thresholds: ThresholdConfig;
    liveProductMap: Map<string, Product>;
}

export const SearchResultPanels: React.FC<SearchResultPanelsProps> = ({ 
    data, hierarchicalData, groupBy, expandedGroup, expandedSubGroup, 
    handleGroupToggle, handleSubGroupToggle, volumeContextStats, context, thresholds, liveProductMap 
}) => {
    
    if (data.results.length === 0) {
      return (
        <div className="text-center py-20 bg-custom-glass rounded-xl border border-custom-glass">
          <h3 className="text-lg font-bold text-gray-800">No Results Found</h3>
          <p className="text-gray-500 mt-2">Your query did not return any results. Try adjusting the filters above.</p>
        </div>
      );
    }

    // Helper to format top districts for display
    const getTopDistricts = (stats: Record<string, number> | undefined) => {
        if (!stats) return null;
        const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
        if (sorted.length === 0) return null;
        
        const top3 = sorted.slice(0, 3).map(([code, count]) => `${code} (${count})`).join(', ');
        return top3;
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2 px-3 py-2 bg-blue-50/50 border border-blue-100 rounded-lg text-[10px] text-blue-700 mb-2">
            <Info className="w-3 h-3 flex-shrink-0" />
            <span>
                <strong>Data Basis:</strong> Some metrics are proxies (from Product Master), others are exact (from Transactions). 
                Hover over values for calculation details. "—" indicates insufficient data.
            </span>
        </div>
        {hierarchicalData.map(group => {
            // Volume Context Visuals
            let volumeBadge = null;
            if (volumeContextStats) {
                if (volumeContextStats.isLowVolume) {
                    volumeBadge = <span className="text-[9px] bg-gray-50 text-gray-400 px-1 rounded border border-gray-100">Low Vol</span>;
                } else if (volumeContextStats.getBand) {
                    const band = volumeContextStats.getBand(group.totalQty);
                    if (band === 'Top') volumeBadge = <span className="text-[9px] bg-slate-200 text-slate-700 px-1 rounded border border-slate-300 font-medium">Top 20%</span>;
                    if (band === 'Middle') volumeBadge = <span className="text-[9px] bg-gray-100 text-gray-600 px-1 rounded border border-gray-200">Mid 60%</span>;
                    if (band === 'Bottom') volumeBadge = <span className="text-[9px] bg-white text-gray-400 px-1 rounded border border-gray-200">Bot 20%</span>;
                }
            }

            // Calculate Trends for Top Group
            const revDiff = group.totalRevenue - group.totalPrevRevenue;
            const revDiffPct = group.totalPrevRevenue > 0 ? (revDiff / group.totalPrevRevenue) * 100 : (group.totalRevenue > 0 ? 100 : 0);
            
            const volDiff = group.totalQty - group.totalPrevQty;
            const volDiffPct = group.totalPrevQty > 0 ? (volDiff / group.totalPrevQty) * 100 : (group.totalQty > 0 ? 100 : 0);

            // Postcode Context Summary
            const topDistricts = context.isPostcode ? getTopDistricts(group.districtStats) : null;
            
            const productForGroup = groupBy === 'sku' ? liveProductMap.get(group.key) : null;

            return (
              <div key={group.key} className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                <div
                  className={`w-full p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors cursor-pointer select-text ${expandedGroup === group.key ? 'bg-gray-50/30' : ''}`}
                  onClick={(e) => handleGroupToggle(group.key, e)}
                >
                  <div className="flex items-center gap-4">
                     <div className={`p-2 rounded-lg text-gray-600 ${groupBy === 'platform' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {groupBy === 'platform' ? <Layers className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                     </div>
                     <div>
                        <h3 className="font-bold text-gray-900 flex items-center">
                            {group.label}
                            {productForGroup && <GradeBadge gradeLevel={productForGroup.gradeLevel} />}
                        </h3>
                        {group.productName && <p className="text-xs text-gray-500">{group.productName}</p>}
                        {topDistricts && (
                            <p className="text-[10px] text-indigo-600 mt-1 flex items-center gap-1 font-medium">
                                <MapPin className="w-3 h-3" /> Top Districts: {topDistricts}
                            </p>
                        )}
                     </div>
                  </div>
                  
                  <div className="flex items-center gap-8">
                    {/* UNITS COLUMN */}
                    <div className={`text-right hidden sm:block ${context.isVolume ? 'scale-110 transform origin-right' : 'opacity-70'}`}>
                        <div className={`text-xs ${context.isVolume ? 'text-indigo-600 font-bold' : 'text-gray-500'}`}>
                            {context.isInventory || context.isAged ? 'Total Stock' : context.isTrend ? 'Vol. Change (PoP)' : 'Units Sold'}
                        </div>
                        
                        {context.isTrend ? (
                            <div className="flex flex-col items-end">
                                <span className="font-bold text-gray-900 text-sm">{formatNumber(group.totalQty)}</span>
                                <div className={`flex items-center gap-1 text-xs font-bold ${volDiff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {volDiff < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                    {volDiff > 0 ? '+' : ''}{formatNumber(volDiff)} ({volDiffPct.toFixed(1)}%)
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-end">
                                <div className={`font-bold text-lg ${context.isVolume ? 'text-indigo-700' : 'text-gray-800'}`}>
                                    {formatNumber(group.totalQty)}
                                </div>
                                {volumeBadge}
                            </div>
                        )}
                    </div>

                    {/* REVENUE COLUMN */}
                    <div className="text-right hidden sm:block">
                        <div className="text-xs text-gray-500">
                            {context.isInventory || context.isAged ? 'Global Velocity' : context.isTrend ? 'Rev. Change (PoP)' : 'Total Revenue'}
                        </div>
                        
                        {context.isTrend ? (
                            <div className="flex flex-col items-end">
                                <span className="font-bold text-gray-900 text-sm">{formatMoney(group.totalRevenue, 0)}</span>
                                <div className={`flex items-center gap-1 text-xs font-bold ${revDiff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {revDiff < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                    {revDiff > 0 ? '+' : '-'}{formatMoney(Math.abs(revDiff), 0)} ({revDiffPct.toFixed(1)}%)
                                </div>
                            </div>
                        ) : (
                            <div className="font-bold text-lg text-gray-800">
                                {context.isInventory || context.isAged
                                    ? `${(group.globalVelocity || 0).toFixed(1)}/day`
                                    : formatMoney(group.totalRevenue, 0)
                                }
                            </div>
                        )}
                    </div>

                    {/* ADDITIONAL COLUMNS ... */}
                    {context.isReturn && (
                        <div className="text-right hidden sm:block">
                            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">
                                Return Health
                            </div>
                            <div className="flex items-center gap-4 bg-gray-50 px-3 py-1 rounded border border-gray-200">
                                <div className="text-right">
                                    <span className="block text-[9px] text-gray-400 uppercase">Period (Qty)</span>
                                    <span className={`block font-bold ${(group.periodReturnRate || 0) > thresholds.returnRatePct ? 'text-red-600' : 'text-gray-800'}`}>
                                        {formatPct(group.periodReturnRate)}
                                    </span>
                                </div>
                                <div className="w-px h-6 bg-gray-300"></div>
                                <div className="text-right">
                                    <span className="block text-[9px] text-gray-400 uppercase">All Time</span>
                                    <span className="block font-medium text-gray-600">
                                        {(group.allTimeReturnRate || 0).toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {!context.isReturn && (
                        <div className="text-right hidden md:block group relative">
                            <div className="text-xs text-gray-500 flex items-center justify-end gap-1">
                                {context.isInventory ? 'Global Cover' 
                                : context.isAd ? 'TACoS' 
                                : context.isOrganic ? 'Organic Share (Ad-enabled)' 
                                : context.isAged ? 'Aged Stock %' 
                                : context.isMargin && context.isTrend ? 'Margin Change (PoP)'
                                : context.isMargin ? 'Net Contribution' 
                                : 'Sales Share'}
                                
                                {context.isOrganic && (
                                    <div className="group/tooltip relative">
                                        <Info className="w-3 h-3 text-gray-400 cursor-help" />
                                        <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 pointer-events-none z-50">
                                            Calculated only on ad-enabled platforms (currently Amazon/eBay/Temu).
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {context.isMargin ? (
                                <div className="flex flex-col items-end">
                                    <div className={`font-bold text-lg ${group.totalProfit < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                        {formatMoney(group.totalProfit, 0)}
                                    </div>
                                    <div className={`text-xs flex items-center gap-1 ${group.weightedMargin !== null && group.weightedMargin < thresholds.marginBelowTargetPct ? 'text-red-400' : 'text-gray-400'}`} title="Net Profit / Revenue. Shows '—' if no revenue recorded.">
                                        {formatPct(group.weightedMargin)} 
                                        {context.isTrend && (
                                            <span className={`font-bold ${group.weightedMarginChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                ({group.weightedMarginChange > 0 ? '+' : ''}{group.weightedMarginChange.toFixed(1)}%)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className={`font-bold text-lg ${
                                    context.isInventory
                                        ? ((group.globalCover || 999) < 14 ? 'text-red-600' : (group.globalCover || 0) > thresholds.overstockDays ? 'text-orange-600' : 'text-green-600')
                                        : context.isAd 
                                            ? (group.tacos !== null && group.tacos > thresholds.highAdDependencyPct ? 'text-red-600' : 'text-gray-800')
                                            : context.isOrganic
                                                ? (group.organicShare !== null && group.organicShare > 80 ? 'text-green-600' : group.organicShare !== null && group.organicShare < 40 ? 'text-red-600' : 'text-gray-800')
                                            : context.isAged
                                                ? (group.agedStockPct > 20 ? 'text-red-600' : group.agedStockPct > 10 ? 'text-orange-600' : 'text-green-600')
                                            : 'text-indigo-600'
                                }`} title={context.isAd ? "Ad Spend / Ad-Enabled Revenue. Shows '—' if no revenue on ad platforms." : undefined}>
                                    {context.isInventory 
                                        ? `${(group.globalCover || 0) > 730 ? '>2y' : (group.globalCover || 0).toFixed(0) + ' days'}`
                                        : context.isAd ? formatPct(group.tacos)
                                        : context.isOrganic 
                                            ? (group.organicShare !== null ? `${group.organicShare.toFixed(1)}%` : <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded">N/A <span className="hidden group-hover:inline">- Ads not enabled</span></span>)
                                        : context.isAged ? `${group.agedStockPct.toFixed(1)}%`
                                        : `${group.contribution.toFixed(1)}%`}
                                </div>
                            )}
                        </div>
                    )}

                    <div className={`transition-transform duration-200 ${expandedGroup === group.key ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                </div>

                {/* --- EXPANDED SUBGROUPS --- */}
                {expandedGroup === group.key && (
                    <div className="border-t border-gray-200/50 bg-gray-50/10">
                        <div className="px-4 py-2 bg-gray-100/50 text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                            <ArrowRight className="w-3 h-3" />
                            {groupBy === 'platform' ? 'Products (SKUs) in this Platform' : 'Platforms for this Product'}
                        </div>

                        <div className="divide-y divide-gray-100">
                            {(Object.values(group.subGroups) as any[])
                                .sort((a: any, b: any) => {
                                    return b.contribution - a.contribution;
                                })
                                .map((sub: any) => {
                                    const compositeKey = `${group.key}|${sub.key}`;
                                    const isSubExpanded = expandedSubGroup === compositeKey;
                                    
                                    // Calculate SubGroup Trends
                                    const subRevDiff = sub.totalRevenue - sub.totalPrevRevenue;
                                    const subRevDiffPct = sub.totalPrevRevenue > 0 ? (subRevDiff / sub.totalPrevRevenue) * 100 : (sub.totalRevenue > 0 ? 100 : 0);
                                    
                                    const subVolDiff = sub.totalQty - sub.totalPrevQty;
                                    const subVolDiffPct = sub.totalPrevQty > 0 ? (subVolDiff / sub.totalPrevQty) * 100 : (sub.totalQty > 0 ? 100 : 0);

                                    const productForSubgroup = groupBy === 'platform' ? liveProductMap.get(sub.key) : null;

                                    return (
                                        <div key={sub.key} className="bg-white/40">
                                            {/* ... Subgroup Header Row ... */}
                                            <div 
                                                className="w-full flex items-center justify-between px-6 py-3 hover:bg-white/80 transition-colors text-left cursor-pointer select-text"
                                                onClick={(e) => handleSubGroupToggle(compositeKey, e)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {isSubExpanded ? <ChevronDown className="w-4 h-4 text-indigo-500" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                                    <div className="p-1.5 bg-gray-200 rounded text-gray-500">
                                                        {groupBy === 'platform' ? <Package className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                                                    </div>
                                                    <div>
                                                        <div className="font-mono text-sm font-bold text-gray-700 flex items-center">
                                                            {sub.label}
                                                            {productForSubgroup && <GradeBadge gradeLevel={productForSubgroup.gradeLevel} />}
                                                        </div>
                                                        {sub.productName && <div className="text-xs text-gray-500">{sub.productName}</div>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-6">
                                                    {/* ... Subgroup Metrics ... */}
                                                    {context.isInventory || context.isAged ? (
                                                        <>
                                                            <div className="text-right">
                                                                <div className="text-xs text-gray-400">Plat. Velocity</div>
                                                                <div className="text-sm font-bold text-indigo-600">{(sub.platformVelocity || 0).toFixed(2)}/d</div>
                                                            </div>
                                                            {!context.isAged && <div className="text-right w-24">
                                                                <div className="text-xs text-gray-400">Plat. Cover</div>
                                                                <div className={`text-sm font-bold ${(sub.platformCover || 999) < 28 ? 'text-red-600' : 'text-green-600'}`}>
                                                                    {(sub.platformCover || 0).toFixed(0)} days
                                                                </div>
                                                            </div>}
                                                            {context.isAged && <div className="text-right w-24">
                                                                <div className="text-xs text-gray-400">Aged %</div>
                                                                <div className={`text-sm font-bold ${(sub.agedStockPct || 0) > 20 ? 'text-red-600' : 'text-green-600'}`}>
                                                                    {(sub.agedStockPct || 0).toFixed(1)}%
                                                                </div>
                                                            </div>}
                                                        </>
                                                    ) : context.isReturn ? (
                                                        <>
                                                            <div className="text-right w-16">
                                                                <div className="text-xs text-gray-400">Units</div>
                                                                <div className="text-sm font-bold text-gray-700">{formatNumber(sub.totalQty)}</div>
                                                            </div>
                                                            <div className="text-right w-16">
                                                                <div className="text-xs text-gray-400">Refunded</div>
                                                                <div className="text-sm font-bold text-red-600">{sub.totalRefundQty}</div>
                                                            </div>
                                                            <div className="text-right w-20">
                                                                <div className="text-xs text-gray-400">Period RR</div>
                                                                <div className={`text-sm font-bold ${(sub.periodReturnRate || 0) > thresholds.returnRatePct ? 'text-red-600' : 'text-gray-800'}`}>
                                                                    {formatPct(sub.periodReturnRate)}
                                                                </div>
                                                            </div>
                                                            <div className="text-right w-20">
                                                                <div className="text-xs text-gray-400">All Time</div>
                                                                <div className="text-sm font-medium text-gray-600">
                                                                    {(sub.allTimeReturnRate || 0).toFixed(1)}%
                                                                </div>
                                                            </div>
                                                        </>
                                                    ) : context.isTrend ? (
                                                        <>
                                                            <div className="text-right">
                                                                <div className="text-xs text-gray-400">Vol. Trend</div>
                                                                <div className={`text-xs font-bold ${subVolDiff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                    {subVolDiff > 0 ? '+' : ''}{subVolDiff} ({subVolDiffPct.toFixed(0)}%)
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-xs text-gray-400">Rev. Trend</div>
                                                                <div className={`text-xs font-bold ${subRevDiff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                    {subRevDiff > 0 ? '+' : ''}£{Math.abs(subRevDiff).toFixed(0)} ({subRevDiffPct.toFixed(0)}%)
                                                                </div>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="text-right w-16">
                                                                <div className="text-xs text-gray-400">Qty</div>
                                                                <div className="text-sm font-bold text-gray-700">{formatNumber(sub.totalQty)}</div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-xs text-gray-400">Revenue</div>
                                                                <div className="text-sm font-medium text-gray-700">{formatMoney(sub.totalRevenue, 0)}</div>
                                                            </div>
                                                            {(context.isMargin || context.isAd || context.isOrganic) && (
                                                                <div className="text-right">
                                                                    <div className="text-xs text-gray-400">Ad Spent</div>
                                                                    <div className="text-sm font-medium text-orange-700">{formatMoney(sub.totalAdSpend, 0)}</div>
                                                                </div>
                                                            )}
                                                            <div className="text-right w-24">
                                                                <div className="text-xs text-gray-400">
                                                                    {context.isAd ? 'TACoS' : context.isOrganic ? 'Organic (Ads)' : context.isMargin ? 'Net Profit' : 'Share %'}
                                                                </div>
                                                                <span className={`text-sm font-bold ${
                                                                    context.isAd ? (sub.tacos !== null && sub.tacos > thresholds.highAdDependencyPct ? 'text-red-600' : 'text-gray-700') :
                                                                    context.isOrganic ? (sub.organicShare !== null && sub.organicShare > 80 ? 'text-green-600' : sub.organicShare !== null && sub.organicShare < 40 ? 'text-red-600' : 'text-gray-700') :
                                                                    context.isMargin ? (sub.totalProfit < 0 ? 'text-red-600' : 'text-green-600') :
                                                                    'text-indigo-600'
                                                                }`}>
                                                                    {context.isAd ? formatPct(sub.tacos) :
                                                                     context.isOrganic ? (sub.organicShare !== null ? `${sub.organicShare.toFixed(1)}%` : <span className="text-xs text-gray-400 font-medium">N/A</span>) :
                                                                     context.isMargin ? formatMoney(sub.totalProfit, 0) :
                                                                     `${sub.contribution.toFixed(1)}%`}
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* ... Subgroup Transactions Table ... */}
                                            {isSubExpanded && (
                                                <div className="px-6 pb-4 animate-in fade-in slide-in-from-top-1">
                                                    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                                        <table className="w-full text-xs text-left">
                                                            <thead className="bg-gray-50 text-gray-500 font-medium">
                                                                {context.isReturn ? (
                                                                    <tr>
                                                                        <th className="p-2 pl-3">Date</th>
                                                                        <th className="p-2 text-right">Refund Amount</th>
                                                                        <th className="p-2 text-right">Qty</th>
                                                                        <th className="p-2">Reason / Note</th>
                                                                        <th className="p-2 text-right">Platform</th>
                                                                    </tr>
                                                                ) : (
                                                                    <tr>
                                                                        <th className="p-2 pl-3">Date</th>
                                                                        <th className="p-2 text-right">Unit Price</th>
                                                                        <th className="p-2 text-right">
                                                                            {context.isInventory || context.isAged ? 'Velocity' : 'Qty'}
                                                                        </th>
                                                                        <th className="p-2 text-right">
                                                                            {context.isInventory || context.isAged ? 'Est. Daily Rev' : 'Revenue'}
                                                                        </th>
                                                                        {(context.isAd || context.isMargin || context.isOrganic) && <th className="p-2 text-right">Ad Spend</th>}
                                                                        {context.isAd && <th className="p-2 text-right">TACoS</th>}
                                                                        {context.isOrganic && <th className="p-2 text-right">Organic % (Ads)</th>}
                                                                        {(context.isInventory || context.isAged) && <th className="p-2 text-right">Stock</th>}
                                                                        {context.isAged && <th className="p-2 text-right">Aged Qty</th>}
                                                                        {context.isAged && <th className="p-2 text-right">Aged %</th>}
                                                                        {!context.isAged && context.isInventory && <th className="p-2 text-right">Stock Cover</th>}
                                                                        {context.isTrend && <th className="p-2 text-right">Trend</th>}
                                                                        {context.isPostcode && <th className="p-2 text-right">Postcode</th>}
                                                                        <th className="p-2 text-right">Profit</th>
                                                                        <th className="p-2 text-right">Margin %</th>
                                                                        <th className="p-2 text-right">Share %</th>
                                                                    </tr>
                                                                )}
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {sub.items
                                                                    .filter((item: any) => context.isReturn ? item.type === 'REFUND' : true)
                                                                    .slice(0, 50) 
                                                                    .map((tx: any, idx: number) => {
                                                                        const revenue = calcRevenue(tx);
                                                                        const profit = calcProfit(tx);
                                                                        const margin = revenue !== 0 ? calcMarginPct(revenue, profit) : null;
                                                                        const isAdRow = tx.type === 'AD_COST';
                                                                        
                                                                        return (
                                                                        <tr key={idx} className="hover:bg-indigo-50/30">
                                                                            <td className="p-2 pl-3 font-mono text-gray-600">
                                                                                {new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                            </td>
                                                                            
                                                                            {context.isReturn ? (
                                                                                <>
                                                                                    <td className="p-2 text-right font-medium text-red-600">
                                                                                        -{formatMoney(Math.abs(tx.refundAmount || tx.profit || 0))}
                                                                                    </td>
                                                                                    <td className="p-2 text-right font-bold text-gray-800">{tx.velocity}</td>
                                                                                    <td className="p-2 text-gray-600 truncate max-w-[200px]" title={tx.platformReason || tx.customerReason || tx.reason}>
                                                                                        {tx.platformReason || tx.customerReason || tx.reason || 'Unknown Reason'}
                                                                                    </td>
                                                                                    <td className="p-2 text-right text-xs text-gray-500">{tx.platform}</td>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <td className={`p-2 text-right font-medium ${tx.type === 'AD_COST' ? 'text-orange-600' : tx.type === 'REFUND' ? 'text-red-600' : 'text-gray-900'}`}>
                                                                                        {tx.type === 'AD_COST' ? (
                                                                                            <span className="text-[9px] bg-orange-50 text-orange-700 px-1 rounded border border-orange-100 uppercase font-bold">Ad Spend</span>
                                                                                        ) : (
                                                                                            formatMoney(Math.abs(tx.price || 0))
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="p-2 text-right text-gray-900 font-bold">
                                                                                        {context.isInventory || context.isAged ? tx.velocity.toFixed(3) : formatNumber(tx.velocity)}
                                                                                    </td>
                                                                                    <td className="p-2 text-right text-gray-700">{formatMoney(tx.revenue)}</td>
                                                                                    {(context.isAd || context.isMargin || context.isOrganic) && (
                                                                                        <td className="p-2 text-right text-orange-700">
                                                                                            {tx.adsSpend > 0 ? formatMoney(tx.adsSpend) : '-'}
                                                                                        </td>
                                                                                    )}
                                                                                    {context.isAd && (
                                                                                        <td className="p-2 text-right">
                                                                                            {tx.tacos > 0 ? (
                                                                                                <span className={`${tx.tacos > thresholds.highAdDependencyPct ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                                                                                    {formatPct(tx.tacos)}
                                                                                                </span>
                                                                                            ) : '-'}
                                                                                        </td>
                                                                                    )}
                                                                                    {context.isOrganic && (
                                                                                        <td className="p-2 text-right">
                                                                                            {tx.organicShare !== null ? (
                                                                                                <span className={`${tx.organicShare < 40 ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                                                                                                    {tx.organicShare.toFixed(1)}%
                                                                                                </span>
                                                                                            ) : <span className="text-gray-400 italic">N/A</span>}
                                                                                        </td>
                                                                                    )}
                                                                                    
                                                                                    {(context.isInventory || context.isAged) && (
                                                                                        <>
                                                                                            <td className="p-2 text-right text-gray-800 font-medium">
                                                                                                {tx.stockLevel !== undefined ? tx.stockLevel : '-'}
                                                                                            </td>
                                                                                            {context.isAged && <td className="p-2 text-right text-amber-700 font-medium">{tx.agedStockQty || '-'}</td>}
                                                                                            {context.isAged && <td className="p-2 text-right font-bold">{(tx.agedStockPct || 0).toFixed(1)}%</td>}
                                                                                            
                                                                                            {!context.isAged && <td className="p-2 text-right">
                                                                                                {tx.daysRemaining !== undefined ? (
                                                                                                    <span className={`${tx.daysRemaining < 14 ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                                                                                                        {tx.daysRemaining.toFixed(0)}d
                                                                                                    </span>
                                                                                                ) : '-'}
                                                                                            </td>}
                                                                                        </>
                                                                                    )}
                                                                                    {context.isTrend && (
                                                                                        <td className="p-2 text-right">
                                                                                            {tx.velocityChange !== undefined ? (
                                                                                                <span className={`${tx.velocityChange < -thresholds.velocityDropPct ? 'text-red-600' : tx.velocityChange > 20 ? 'text-green-600' : 'text-gray-500'}`}>
                                                                                                    {tx.velocityChange > 0 ? '+' : ''}{tx.velocityChange.toFixed(0)}%
                                                                                                </span>
                                                                                            ) : '-'}
                                                                                        </td>
                                                                                    )}
                                                                                    {context.isPostcode && (
                                                                                        <td className="p-2 text-right text-gray-600 font-mono text-[10px]">
                                                                                            {tx.postcode || '-'}
                                                                                        </td>
                                                                                    )}
                                                                                    
                                                                                    <td className={`p-2 text-right font-medium ${tx.profit < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                                        {formatMoney(tx.profit)}
                                                                                    </td>
                                                                                    <td className="p-2 text-right font-bold">
                                                                                        {tx.type === 'REFUND' ? (
                                                                                            <span className="text-red-500 text-[10px] uppercase bg-red-50 px-1 rounded border border-red-100">Refund</span>
                                                                                        ) : tx.margin === -Infinity || (Math.abs(tx.revenue) < 0.01 && tx.adsSpend > 0) ? (
                                                                                            <span className="text-gray-900 font-normal cursor-help" title="Margin N/A (No Revenue)">
                                                                                                N/A
                                                                                            </span>
                                                                                        ) : (
                                                                                            <span className={`${(margin || 0) < thresholds.marginBelowTargetPct ? 'text-red-600' : 'text-green-600'}`}>
                                                                                                {margin !== null ? formatPct(margin) : isAdRow ? '—' : '-'}
                                                                                            </span>
                                                                                        )}
                                                                                    </td>
                                                                                    <td className="p-2 text-right text-xs text-gray-400 font-medium">
                                                                                        {tx.contribution ? `${tx.contribution.toFixed(1)}%` : '-'}
                                                                                    </td>
                                                                                </>
                                                                            )}
                                                                        </tr>
                                                                    )})}
                                                            </tbody>
                                                        </table>
                                                        {sub.items.length > 50 && <div className="p-2 text-center text-xs text-gray-400 bg-gray-50 border-t border-gray-100">...and {sub.items.length - 50} more records</div>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            }
                        </div>
                    </div>
                )}
              </div>
            );
        })}
      </div>
    );
};
