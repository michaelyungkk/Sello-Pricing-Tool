
import React from 'react';
import { Package, Activity, Warehouse, Ship, Box, BarChart2, History, FileText, RotateCcw } from 'lucide-react';
import { Product } from '../../../types';
import { GradeBadge } from '../../GradeBadge';
import { formatMoney, formatSmartMoney, formatNumber, formatPct } from '../../../utils/format';

interface SkuOverviewSectionProps {
    product: Product;
    allTimeSales: number;
    allTimeQty: number;
    allTimeMarginStats: any;
    allTimeReturnStats: any;
    thresholds: any;
    hasTransactions: boolean;
    onScrollToSection: (section: 'analysis' | 'pricing' | 'ledger' | 'refunds') => void;
}

export const SkuOverviewSection: React.FC<SkuOverviewSectionProps> = ({
    product,
    allTimeSales,
    allTimeQty,
    allTimeMarginStats,
    allTimeReturnStats,
    thresholds,
    hasTransactions,
    onScrollToSection
}) => {
    return (
        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom p-6">
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-theme/10 text-theme rounded-lg">
                        <Package className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">SKU Overview</h3>
                </div>

                {hasTransactions && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-gray-400 uppercase mr-1 hidden sm:block select-none">Quick Access:</span>
                        <button onClick={() => onScrollToSection('analysis')} className="px-3 py-1.5 bg-custom-glass border border-custom-glass rounded-lg text-xs font-medium text-gray-600 hover:border-theme-20 hover:text-theme hover:shadow-sm transition-all flex items-center gap-1.5 backdrop-blur-custom">
                            <BarChart2 className="w-3.5 h-3.5" /> Distribution
                        </button>
                        <button onClick={() => onScrollToSection('pricing')} className="px-3 py-1.5 bg-custom-glass border border-custom-glass rounded-lg text-xs font-medium text-gray-600 hover:border-theme-20 hover:text-theme hover:shadow-sm transition-all flex items-center gap-1.5 backdrop-blur-custom">
                            <History className="w-3.5 h-3.5" /> Pricing
                        </button>
                        <button onClick={() => onScrollToSection('ledger')} className="px-3 py-1.5 bg-custom-glass border border-custom-glass rounded-lg text-xs font-medium text-gray-600 hover:border-theme-20 hover:text-theme hover:shadow-sm transition-all flex items-center gap-1.5 backdrop-blur-custom">
                            <FileText className="w-3.5 h-3.5" /> Ledger
                        </button>
                        <button onClick={() => onScrollToSection('refunds')} className="px-3 py-1.5 bg-custom-glass border border-custom-glass rounded-lg text-xs font-medium text-gray-600 hover:border-theme-20 hover:text-theme hover:shadow-sm transition-all flex items-center gap-1.5 backdrop-blur-custom">
                            <RotateCcw className="w-3.5 h-3.5" /> Refunds
                        </button>
                    </div>
                )}
            </div>

            <div className="flex flex-col xl:flex-row gap-8">
                <div className="flex-1 min-0 flex gap-6">
                    {product.imageUrl && (
                        <div className="w-[120px] h-[120px] flex-shrink-0 rounded-xl overflow-hidden bg-white/60 shadow-sm">
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain" />
                        </div>
                    )}
                    <div className="flex-1 min-0">
                        <div className="mb-2 flex items-center">
                            <span className="font-mono text-sm font-bold text-theme bg-theme/10 px-2 py-1 rounded border border-indigo-100 inline-block">
                                {product.sku}
                            </span>
                            <GradeBadge gradeLevel={product.gradeLevel} />
                        </div>
                        
                        <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-4 break-words">
                            {product.name}
                        </h1>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2 text-xs text-gray-500 bg-white/10 px-2 py-1 rounded border border-custom-glass">
                                <Activity className="w-3.5 h-3.5" />
                                <span>{product.category || 'Uncategorized'}</span>
                            </div>
                            {product.subcategory && (
                                <div className="flex items-center gap-2 text-xs text-gray-500 bg-white/10 px-2 py-1 rounded border border-custom-glass">
                                    <Activity className="w-3.5 h-3.5" />
                                    <span>{product.subcategory}</span>
                                </div>
                            )}
                            {product.seasonTags?.slice(0, 2).map(tag => (
                                <span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>
                            ))}
                            {(product.seasonTags?.length || 0) > 2 && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{ (product.seasonTags?.length || 0) - 2 }</span>
                            )}
                            {product.festivalTags?.slice(0, 2).map(tag => (
                                <span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>
                            ))}
                            {(product.festivalTags?.length || 0) > 2 && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{ (product.festivalTags?.length || 0) - 2 }</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-shrink-0 w-full xl:w-[600px]">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        
                        <div className="space-y-1">
                            <span className="text-[10px] font-medium text-gray-500 uppercase flex items-center gap-1">
                                <Activity className="w-3 h-3"/> Velocity
                            </span>
                            <div className="text-xl font-bold text-gray-800">
                                {formatNumber(product.averageDailySales, 1)} <span className="text-xs font-normal text-gray-400">/day</span>
                            </div>
                        </div>

                        <div className="space-y-1">
                            <span className="text-[10px] font-medium text-gray-500 uppercase flex items-center gap-1">
                                <Warehouse className="w-3 h-3"/> On Hand
                            </span>
                            <div className="text-xl font-bold text-gray-800">
                                {formatNumber(product.stockLevel)} <span className="text-xs font-normal text-gray-400">units</span>
                            </div>
                        </div>

                        {/* INBOUND TOOLTIP */}
                        <div className="space-y-1 group relative cursor-help">
                            <span className="text-[10px] font-medium text-gray-500 uppercase flex items-center gap-1">
                                <Ship className="w-3 h-3"/> Inbound
                            </span>
                            <div className="text-xl font-bold text-gray-800">
                                {formatNumber(product.incomingStock)} <span className="text-xs font-normal text-gray-400">units</span>
                            </div>
                            
                            {product.shipments && product.shipments.length > 0 && (
                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-3 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50">
                                    <div className="font-bold border-b border-gray-700 pb-1 mb-1">Active Shipments</div>
                                    <div className="space-y-1">
                                        {product.shipments.map((s, i) => (
                                            <div key={i} className="flex justify-between gap-2">
                                                <span className="truncate">{s.containerId}</span>
                                                <span className="font-bold text-indigo-300">{s.eta || 'TBA'}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="space-y-1">
                            <span className="text-[10px] font-medium text-gray-500 uppercase flex items-center gap-1">
                                <Box className="w-3 h-3"/> Lifetime Qty
                            </span>
                            <div className="text-xl font-bold text-gray-800">
                                {formatNumber(allTimeQty)}
                            </div>
                        </div>

                        {/* Row 2 - Summary Statistics */}
                        <div className="col-span-2 sm:col-span-1 p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom">
                            <span className="text-[10px] font-medium text-gray-500 uppercase block mb-1">CA Reference Price</span>
                            <div className="text-lg font-bold text-purple-600 font-mono">
                                {formatSmartMoney(product.caPrice)}
                            </div>
                        </div>

                        <div className="col-span-2 sm:col-span-1 p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom">
                            <span className="text-[10px] font-medium text-gray-500 uppercase block mb-1">All-Time Sales</span>
                            <div className="text-lg font-bold text-gray-800">
                                {formatSmartMoney(allTimeSales)}
                            </div>
                        </div>

                        <div className="col-span-2 sm:col-span-1 p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom group relative cursor-help">
                            <span className="text-[10px] font-medium text-gray-500 uppercase block mb-1">Lifetime Net Margin</span>
                            <div className={`text-lg font-bold ${allTimeMarginStats.pct >= 15 ? 'text-emerald-600' : allTimeMarginStats.pct > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {formatPct(allTimeMarginStats.pct, 1)}
                            </div>
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                                <div className="font-bold border-b border-gray-700 pb-1 mb-2">Calculation Detail (Inc VAT)</div>
                                <div className="space-y-1 font-mono">
                                    <div className="flex justify-between"><span>Gross Sales:</span><span>{formatSmartMoney(allTimeMarginStats.grossSales)}</span></div>
                                    <div className="flex justify-between text-green-400"><span>Tx Profit:</span><span>{formatSmartMoney(allTimeMarginStats.rawProfit)}</span></div>
                                    <div className="flex justify-between text-red-400"><span>Refunds:</span><span>-{formatSmartMoney(allTimeMarginStats.refundVal)}</span></div>
                                    <div className="border-t border-gray-700 pt-1 mt-1 flex justify-between font-bold"><span>Net Profit:</span><span>{formatSmartMoney(allTimeMarginStats.netProfit)}</span></div>
                                    <div className="flex justify-between font-bold"><span>Net Sales:</span><span>{formatSmartMoney(allTimeMarginStats.netSales)}</span></div>
                                    <div className="border-t border-gray-700 pt-1 mt-1 text-center text-gray-400 italic">
                                        (Net Profit / Net Sales) * 100
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Return & Refund Stats - Stacked for column economy */}
                        <div className="col-span-2 sm:col-span-1 p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom flex flex-col justify-between">
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center group relative cursor-help">
                                    <span className="text-[9px] text-gray-500 font-medium">Return QTY %</span>
                                    <span className={`text-sm font-bold ${allTimeReturnStats.returnRate > thresholds.returnRatePct ? 'text-red-500' : 'text-gray-700'}`}>
                                        {formatPct(allTimeReturnStats.returnRate)}
                                    </span>
                                    {/* Tooltip for Qty% */}
                                    <div className="absolute bottom-full right-0 mb-2 w-56 p-3 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                                        <div className="font-bold border-b border-gray-700 pb-1 mb-2">Return Qty Math</div>
                                        <div className="space-y-1 font-mono text-right">
                                            <div className="flex justify-between"><span>Total Returns:</span><span>{formatNumber(allTimeReturnStats.totalRefundQty)}</span></div>
                                            <div className="flex justify-between"><span>Lifetime Sold:</span><span>{formatNumber(allTimeQty)}</span></div>
                                            <div className="border-t border-gray-700 pt-1 mt-1 text-center text-gray-400 italic">
                                                (Returns / Sales) * 100
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div className="flex justify-between items-center border-t border-gray-100 pt-1 group relative cursor-help">
                                    <span className="text-[9px] text-gray-500 font-medium">Return AMT %</span>
                                    <span className="text-sm font-bold text-gray-700">
                                        {formatPct(allTimeReturnStats.refundRate)}
                                    </span>
                                    {/* Tooltip for Amt% */}
                                    <div className="absolute bottom-full right-0 mb-2 w-56 p-3 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                                        <div className="font-bold border-b border-gray-700 pb-1 mb-2">Return Value Math (Inc VAT)</div>
                                        <div className="space-y-1 font-mono text-right">
                                            <div className="flex justify-between"><span>Total Returns Val:</span><span>{formatSmartMoney(allTimeReturnStats.totalRefundVal)}</span></div>
                                            <div className="flex justify-between"><span>Lifetime Gross:</span><span>{formatSmartMoney(allTimeSales)}</span></div>
                                            <div className="border-t border-gray-700 pt-1 mt-1 text-center text-gray-400 italic">
                                                (Returns Val / Gross Sales) * 100
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};
