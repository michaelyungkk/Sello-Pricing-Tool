
import React from 'react';
import { Product } from '../../../types';
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
            <div className={`flex flex-col items-end`}>
                <span className={`v-num${highlight ? ' v-bold' : ''}`}>{top}</span>
                {bottom && <span style={{ fontSize: 10, color: '#9ca3af' }}>{bottom}</span>}
            </div>
        );
    };

    return (
        <div className="sello-glass rounded-xl overflow-hidden">
            <div className="sello-table-scroll" style={{ maxHeight: 600 }}>
                <table className="sello-table">
                    <thead>
                        <tr>
                            <th className="sticky left-0 z-20" style={{ minWidth: 200, borderRight: '1px solid var(--glass-divider)' }}
                                onClick={() => setSortConfig({ key: 'sku', dir: sortConfig?.key === 'sku' && sortConfig.dir === 'desc' ? 'asc' : 'desc' })}>
                                SKU / Name
                            </th>
                            <SortableHeader<SortKey> label={`CA Price${taxLabel}`} sortKey="caPrice" sort={sortConfig} onChange={setSortConfig} tint="ca" align="right" />
                            <SortableHeader<SortKey> label={`Unit Price${taxLabel}`} sortKey="unitPrice" sort={sortConfig} onChange={setSortConfig} tint="blue" align="right" />
                            <SortableHeader<SortKey> label={(viewMode === 'PER_UNIT' ? 'Avg Price' : 'Sales Amt') + taxLabel} sortKey={viewMode === 'PER_UNIT' ? 'unitPrice' : 'salesAmt'} sort={sortConfig} onChange={setSortConfig} tint="blue" align="right" />
                            <SortableHeader<SortKey> label={`COGS${taxLabel}`} sortKey="cogs" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`Postage${taxLabel}`} sortKey="postage" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`Sell Fee${taxLabel}`} sortKey="sellingFee" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`Ads Fee${taxLabel}`} sortKey="adsFee" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`Other Fee${taxLabel}`} sortKey="otherFee" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`Sub Fee${taxLabel}`} sortKey="subscriptionFee" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`WMS Fee${taxLabel}`} sortKey="wmsFee" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader<SortKey> label={`Refunds${taxLabel}`} sortKey="refundAmt" sort={sortConfig} onChange={setSortConfig} tint="red" align="right" />
                            <SortableHeader<SortKey>
                                label={`Net Profit${taxLabel}`}
                                sortKey="profitInclRn"
                                sort={sortConfig} onChange={setSortConfig}
                                tint="green" align="right"
                                className="sticky right-0 z-20"
                            />
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedProducts.map(product => {
                            const detail = product.costDetail;
                            if (!detail) return null;
                            const skuQty = detail.skuQty > 0 ? detail.skuQty : 1;
                            const perUnit = (value: number) => viewMode === 'PER_UNIT' ? value / skuQty : value;
                            const isProfit = (detail.profitInclRn || 0) >= 0;
                            return (
                                <tr key={product.id}>
                                    <td className="sticky left-0 z-10" style={{ borderRight: '1px solid var(--glass-divider)' }}>
                                        <div className="flex items-center gap-1">
                                            <span style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{product.sku}</span>
                                            <GradeBadge gradeLevel={product.gradeLevel} />
                                        </div>
                                        <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{product.name}</div>
                                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                                            <Hash style={{ width: 10, height: 10 }} />
                                            {detail.skuQty.toLocaleString()} units sold
                                        </div>
                                    </td>
                                    <td className="r col-ca">
                                        {product.caPrice
                                            ? <span className="v-ca v-bold">£{(includeVat ? product.caPrice : product.caPrice / VAT_RATE).toFixed(2)}</span>
                                            : <span className="v-dim">—</span>}
                                    </td>
                                    <td className="r col-blue"><CombinedCell value={detail.unitPrice} /></td>
                                    <td className="r col-blue"><CombinedCell value={perUnit(detail.salesAmt)} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.cogs)} percent={detail.cogsPct} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.postage)} percent={detail.postagePct} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.sellingFee)} percent={detail.sellingFeePct} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.adsFee)} percent={detail.adsFeePct} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.otherFee)} percent={detail.otherFeePct} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.subscriptionFee)} percent={detail.subscriptionFeePct} /></td>
                                    <td className="r"><CombinedCell value={perUnit(detail.wmsFee)} percent={detail.wmsFeePct} /></td>
                                    <td className="r col-red">
                                        <span className="v-neg"><CombinedCell value={perUnit(detail.refundAmt)} percent={detail.returnAmtPct} /></span>
                                    </td>
                                    <td className="r col-green sticky right-0 z-10" style={{ borderLeft: '1px solid var(--glass-divider)', minWidth: 100 }}>
                                        <span className={isProfit ? 'v-num v-bold' : 'v-neg v-bold'}>
                                            <CombinedCell value={perUnit(detail.profitInclRn)} percent={detail.profitInclRnPct} highlight />
                                        </span>
                                    </td>
                                </tr>
                            );
                        })}
                        {paginatedProducts.length === 0 && (
                            <tr>
                                <td colSpan={13} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>
                                    No cost details found. Please upload the SKU Detail Report.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {filteredCount > 0 && (
                <div className="sello-table-footer">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontSize: 12, color: '#6b7280' }}>
                            {t('pagination_showing', { start: (currentPage - 1) * itemsPerPage + 1, end: Math.min(currentPage * itemsPerPage, filteredCount), total: filteredCount })}
                        </span>
                        <select value={itemsPerPage} onChange={e => { setItemsPerPage(Number(e.target.value)); setCurrentPage(1); }}
                            className="sello-dd-btn" style={{ paddingRight: 24 }}>
                            {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                        </select>
                    </div>
                    {totalPages > 1 && (
                        <div className="sello-pagination">
                            <button className="sello-page-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft style={{ width: 14, height: 14 }} /></button>
                            <span style={{ fontSize: 12, color: '#374151', padding: '0 8px' }}>{t('pagination_page', { current: currentPage, total: totalPages })}</span>
                            <button className="sello-page-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight style={{ width: 14, height: 14 }} /></button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
