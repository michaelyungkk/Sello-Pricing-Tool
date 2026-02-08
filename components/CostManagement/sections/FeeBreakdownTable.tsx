
import React from 'react';
import { Product, SkuCostDetail } from '../../../types';
import { SortState } from '../../../utils/tableSort';
import { SortKey, ViewMode } from '../types';
import { SortableHeader } from '../../common/SortableHeader';
import { GradeBadge } from '../../GradeBadge';
import { Hash, ChevronLeft, ChevronRight } from 'lucide-react';
import { useTranslation } from 'react-i18next';

const VAT_RATE = 1.20;

interface FeeBreakdownTableProps {
    paginatedProducts: Product[];
    sortConfig: SortState<SortKey> | null;
    setSortConfig: (s: SortState<SortKey> | null) => void;
    themeColor: string;
    includeVat: boolean;
    showPercentPrimary: boolean;
    viewMode: ViewMode;
    currentPage: number;
    itemsPerPage: number;
    setItemsPerPage: (n: number) => void;
    setCurrentPage: (n: number | ((prev: number) => number)) => void;
    totalPages: number;
    filteredCount: number;
}

export const FeeBreakdownTable: React.FC<FeeBreakdownTableProps> = ({
    paginatedProducts, sortConfig, setSortConfig, themeColor,
    includeVat, showPercentPrimary, viewMode,
    currentPage, itemsPerPage, setItemsPerPage, setCurrentPage, totalPages, filteredCount
}) => {
    const { t } = useTranslation();
    const taxLabel = !includeVat ? ' (ex tax)' : '';

    const CombinedCell = ({ value, percent, isCurrency = true, highlight = false }: { value: number, percent?: number, isCurrency?: boolean, highlight?: boolean }) => {
        const safeValue = value ?? 0;
        const displayVal = includeVat && isCurrency ? safeValue * VAT_RATE : safeValue;
        
        const top = showPercentPrimary && percent !== undefined ? `${(percent ?? 0).toFixed(2)}%` : (isCurrency ? `£${displayVal.toFixed(2)}` : displayVal.toFixed(2));
        const bottom = showPercentPrimary && percent !== undefined ? (isCurrency ? `£${displayVal.toFixed(2)}` : displayVal.toFixed(2)) : (percent !== undefined ? `${(percent ?? 0).toFixed(2)}%` : null);

        return (
            <div className={`flex flex-col items-end ${highlight ? 'font-bold' : ''}`}>
                <span className="text-sm text-gray-900">{top}</span>
                {bottom && <span className="text-[10px] text-gray-500">{bottom}</span>}
            </div>
        );
    };

    return (
        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
            <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50/50 text-gray-500 uppercase text-xs font-semibold">
                        <tr>
                            <th className="px-3 py-3 sticky left-0 top-0 bg-white/90 backdrop-blur-md z-20 shadow-sm cursor-pointer hover:bg-gray-100 transition-colors select-none min-w-[200px] border-r border-gray-100" onClick={() => setSortConfig({ key: 'sku', dir: sortConfig?.key === 'sku' && sortConfig.dir === 'desc' ? 'asc' : 'desc' })}>
                                SKU / Name
                            </th>
                            <SortableHeader<SortKey> label={`CA Price${taxLabel}`} sortKey="caPrice" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader<SortKey> label={`Unit Price${taxLabel}`} sortKey="unitPrice" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader<SortKey> label={(viewMode === 'PER_UNIT' ? "Avg Price" : "Sales Amt") + taxLabel} sortKey={viewMode === 'PER_UNIT' ? "unitPrice" : "salesAmt"} sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader<SortKey> label={`COGS${taxLabel}`} sortKey="cogs" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader<SortKey> label={`Postage${taxLabel}`} sortKey="postage" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader<SortKey> label={`Sell Fee${taxLabel}`} sortKey="sellingFee" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader<SortKey> label={`Ads Fee${taxLabel}`} sortKey="adsFee" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader<SortKey> label={`Other Fee${taxLabel}`} sortKey="otherFee" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader<SortKey> label={`Sub Fee${taxLabel}`} sortKey="subscriptionFee" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader<SortKey> label={`WMS Fee${taxLabel}`} sortKey="wmsFee" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader<SortKey> label={`Refunds${taxLabel}`} sortKey="refundAmt" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader<SortKey> 
                                label={`Net Profit${taxLabel}`} 
                                sortKey="profitInclRn" 
                                sort={sortConfig} onChange={setSortConfig} themeColor={themeColor}
                                align="right"
                                className="sticky right-0 z-20 bg-gray-50 border-l border-gray-200 min-w-[100px]"
                            />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/50">
                        {paginatedProducts.map(product => {
                            const detail = product.costDetail;
                            if (!detail) return null;
                            
                            const skuQty = detail.skuQty > 0 ? detail.skuQty : 1;
                            const perUnit = (value: number) => viewMode === 'PER_UNIT' ? value / skuQty : value;

                            return (
                                <tr key={product.id} className="even:bg-gray-50/30 hover:bg-gray-100/50 group">
                                    <td className="px-3 py-2 sticky left-0 bg-white/50 backdrop-blur-sm group-hover:bg-white z-10 border-r border-gray-100">
                                        <div className="flex items-center">
                                            <div className="font-bold text-gray-900">{product.sku}</div>
                                            <GradeBadge gradeLevel={product.gradeLevel} />
                                        </div>
                                        <div className="text-xs text-gray-500 truncate max-w-[180px]">{product.name}</div>
                                        <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1 font-medium">
                                            <Hash className="w-3 h-3" />
                                            {detail.skuQty.toLocaleString()} units sold
                                        </div>
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        {product.caPrice ? (
                                            <span className="font-bold text-purple-600 font-mono">£{(includeVat ? product.caPrice : product.caPrice / VAT_RATE).toFixed(2)}</span>
                                        ) : '-'}
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <CombinedCell value={detail.unitPrice} />
                                    </td>
                                    <td className="px-3 py-2 text-right bg-blue-50/20">
                                        <CombinedCell value={perUnit(detail.salesAmt)} />
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <CombinedCell value={perUnit(detail.cogs)} percent={detail.cogsPct} />
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <CombinedCell value={perUnit(detail.postage)} percent={detail.postagePct} />
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <CombinedCell value={perUnit(detail.sellingFee)} percent={detail.sellingFeePct} />
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <CombinedCell value={perUnit(detail.adsFee)} percent={detail.adsFeePct} />
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <CombinedCell value={perUnit(detail.otherFee)} percent={detail.otherFeePct} />
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <CombinedCell value={perUnit(detail.subscriptionFee)} percent={detail.subscriptionFeePct} />
                                    </td>
                                    <td className="px-3 py-2 text-right">
                                        <CombinedCell value={perUnit(detail.wmsFee)} percent={detail.wmsFeePct} />
                                    </td>
                                    <td className="px-3 py-2 text-right text-red-600">
                                        <CombinedCell value={perUnit(detail.refundAmt)} percent={detail.returnAmtPct} />
                                    </td>
                                    <td className="px-3 py-2 text-right sticky right-0 bg-white/90 backdrop-blur-md group-hover:bg-white z-20 border-l border-gray-100 min-w-[100px]">
                                        <div className={(detail.profitInclRn || 0) >= 0 ? 'text-green-700' : 'text-red-600'}>
                                            <CombinedCell value={perUnit(detail.profitInclRn)} percent={detail.profitInclRnPct} highlight />
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                        {paginatedProducts.length === 0 && (
                            <tr>
                                <td colSpan={13} className="p-8 text-center text-gray-400">
                                    No cost details found. Please upload the SKU Detail Report.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {filteredCount > 0 && (
                <div className="bg-gray-50/50 px-4 py-3 border-t border-gray-200/50 flex items-center justify-between sm:px-6">
                    <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                        <div className="flex items-center gap-4">
                            <p className="text-sm text-gray-700">
                                {t('pagination_showing', { start: (currentPage - 1) * itemsPerPage + 1, end: Math.min(currentPage * itemsPerPage, filteredCount), total: filteredCount })}
                            </p>
                            <select
                                value={itemsPerPage}
                                onChange={(e) => {
                                    setItemsPerPage(Number(e.target.value));
                                    setCurrentPage(1);
                                }}
                                className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer"
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
                                    <button onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))} disabled={currentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-5 w-5" /></button>
                                    <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">{t('pagination_page', { current: currentPage, total: totalPages })}</span>
                                    <button onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))} disabled={currentPage === totalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-5 w-5" /></button>
                                </nav>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
