
import React from 'react';
import { formatSmartMoney } from '../../../utils/format';
import { Product } from '../../../types';
import { SortState } from '../../../utils/tableSort';
import { SortKey, ViewMode } from '../types';
import { SortableHeader } from '../../common/SortableHeader';
import { GradeBadge } from '../../common/GradeBadge';
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

    const CombinedCell = ({ value, percent, isCurrency = true, highlight = false }: {
        value: number; percent?: number; isCurrency?: boolean; highlight?: boolean;
    }) => {
        const safeValue = value ?? 0;
        const displayVal = includeVat && isCurrency ? safeValue * VAT_RATE : safeValue;
        const top = showPercentPrimary && percent !== undefined
            ? `${(percent ?? 0).toFixed(2)}%`
            : (isCurrency ? formatSmartMoney(displayVal) : displayVal.toFixed(2));
        const bottom = showPercentPrimary && percent !== undefined
            ? (isCurrency ? formatSmartMoney(displayVal) : displayVal.toFixed(2))
            : (percent !== undefined ? `${(percent ?? 0).toFixed(2)}%` : null);

        return (
            <div className="flex flex-col items-end">
                <span className={`v-num${safeValue < 0 ? ' v-neg' : ''}${highlight ? ' v-bold' : ''}`}>{top}</span>
                {bottom && <span className="v-dim" style={{ fontSize: 10 }}>{bottom}</span>}
            </div>
        );
    };

    return (
        <div className="sello-table-wrap" style={{ borderTop: '1px solid var(--glass-border)', borderRadius: 'var(--radius)' }}>
            <div className="sello-table-scroll" style={{ maxHeight: 600 }}>
                <table className="sello-table">
                    <thead>
                        <tr>
                            <SortableHeader<SortKey>
                                label="SKU / Name"
                                sortKey="sku"
                                sort={sortConfig}
                                onChange={setSortConfig}
                                className="pin"
                            />
                            <SortableHeader<SortKey> label={`CA Price${taxLabel}`} sortKey="caPrice" sort={sortConfig} onChange={setSortConfig} align="right" tint="ca" />
                            <SortableHeader<SortKey> label={`Unit Price${taxLabel}`} sortKey="unitPrice" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={(viewMode === 'PER_UNIT' ? 'Avg Price' : 'Sales Amt') + taxLabel} sortKey={viewMode === 'PER_UNIT' ? 'unitPrice' : 'salesAmt'} sort={sortConfig} onChange={setSortConfig} align="right" tint="blue" />
                            <SortableHeader<SortKey> label={`COGS${taxLabel}`} sortKey="cogs" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`Postage${taxLabel}`} sortKey="postage" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`Sell Fee${taxLabel}`} sortKey="sellingFee" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`Ads Fee${taxLabel}`} sortKey="adsFee" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`Other Fee${taxLabel}`} sortKey="otherFee" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`Sub Fee${taxLabel}`} sortKey="subscriptionFee" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`WMS Fee${taxLabel}`} sortKey="wmsFee" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`Refunds${taxLabel}`} sortKey="refundAmt" sort={sortConfig} onChange={setSortConfig} align="right" tint="red" />
                            <SortableHeader<SortKey>
                                label={`Net Profit${taxLabel}`}
                                sortKey="profitInclRn"
                                sort={sortConfig}
                                onChange={setSortConfig}
                                align="right"
                                tint="green"
                                className="sticky right-0 z-20 border-l border-gray-200 min-w-[100px]"
                            />
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedProducts.map(product => {
                            const detail = product.costDetail;
                            if (!detail) return null;
                            const skuQty = detail.skuQty > 0 ? detail.skuQty : 1;
                            const perUnit = (v?: number) => {
                                const safeValue = Number(v) || 0;
                                return viewMode === 'PER_UNIT' ? safeValue / skuQty : safeValue;
                            };
                            const isNegProfit = (detail.profitInclRn || 0) < 0;

                            return (
                                <tr key={product.id} className={isNegProfit ? 'row-neg' : ''}>
                                    <td className="pin">
                                        <div className="flex items-center gap-1">
                                            <span className="font-bold text-gray-900">{product.sku}</span>
                                            <GradeBadge gradeLevel={product.gradeLevel} />
                                        </div>
                                        <div className="text-[11px] text-gray-500 truncate max-w-[180px]">{product.name}</div>
                                        <div className="v-dim mt-0.5 flex items-center gap-1" style={{ fontSize: 10 }}>
                                            <Hash className="w-2.5 h-2.5" />
                                            {detail.skuQty.toLocaleString()} units sold
                                        </div>
                                    </td>
                                    <td className="r col-ca">
                                        {product.caPrice
                                            ? <span className="v-ca v-bold">{formatSmartMoney(includeVat ? product.caPrice : product.caPrice / VAT_RATE)}</span>
                                            : <span className="v-dim">—</span>}
                                    </td>
                                    <td className="r"><CombinedCell value={detail.unitPrice} /></td>
                                    <td className="r col-blue"><CombinedCell value={perUnit(detail.salesAmt)} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.cogs)} percent={detail.cogsPct} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.postage)} percent={detail.postagePct} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.sellingFee)} percent={detail.sellingFeePct} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.adsFee)} percent={detail.adsFeePct} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.otherFee)} percent={detail.otherFeePct} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.subscriptionFee)} percent={detail.subscriptionFeePct} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.wmsFee)} percent={detail.wmsFeePct} /></td>
                                    <td className="r col-red"><CombinedCell value={perUnit(detail.refundAmt)} percent={detail.returnAmtPct} /></td>
                                    <td className="r col-green sticky right-0 border-l border-gray-200 min-w-[100px]">
                                        <CombinedCell value={perUnit(detail.profitInclRn)} percent={detail.profitInclRnPct} highlight />
                                    </td>
                                </tr>
                            );
                        })}
                        {paginatedProducts.length === 0 && (
                            <tr>
                                <td colSpan={13} className="c" style={{ padding: 32, color: 'var(--c-dim)', fontStyle: 'italic' }}>
                                    No cost details found. Please upload the SKU Detail Report.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {filteredCount > 0 && (
                <div className="sello-table-footer">
                    <div className="summary">
                        <span>{t('pagination_showing', { start: (currentPage - 1) * itemsPerPage + 1, end: Math.min(currentPage * itemsPerPage, filteredCount), total: filteredCount })}</span>
                        <span className="summary-divider">·</span>
                        <select
                            className="sello-per-page"
                            value={itemsPerPage}
                            onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                        >
                            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n} / page</option>)}
                        </select>
                    </div>
                    {totalPages > 1 && (
                        <nav className="sello-pagination">
                            <button className="sello-page-btn" onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} disabled={currentPage === 1}>
                                <ChevronLeft className="w-3.5 h-3.5" />
                            </button>
                            {Array.from({ length: totalPages }, (_, i) => i + 1)
                                .filter(p => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
                                .reduce<(number | '...')[]>((acc, p, i, arr) => {
                                    if (i > 0 && p - (arr[i - 1] as number) > 1) acc.push('...');
                                    acc.push(p);
                                    return acc;
                                }, [])
                                .map((p, i) => p === '...'
                                    ? <span key={`ellipsis-${i}`} className="sello-page-btn" style={{ cursor: 'default' }}>…</span>
                                    : <button key={p} className={`sello-page-btn${currentPage === p ? ' active' : ''}`} onClick={() => setCurrentPage(p as number)}>{p}</button>
                                )}
                            <button className="sello-page-btn" onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} disabled={currentPage === totalPages}>
                                <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                        </nav>
                    )}
                </div>
            )}
        </div>
    );
};
