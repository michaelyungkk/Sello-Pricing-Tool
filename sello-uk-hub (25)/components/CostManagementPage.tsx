import React, { useState, useMemo, useEffect } from 'react';
import { Product, SkuCostDetail } from '../types';
import { TagSearchInput } from './TagSearchInput';
import { ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Percent, Hash, Divide } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { GradeBadge } from './GradeBadge';
import { SortState, sortRows } from '../utils/tableSort';
import { SortableHeader } from './common/SortableHeader';

interface CostManagementPageProps {
    products: Product[];
    themeColor: string;
    headerStyle: React.CSSProperties;
}

type SortKey = keyof SkuCostDetail | 'sku' | 'caPrice';

const VAT_RATE = 1.20;

const CostManagementPage: React.FC<CostManagementPageProps> = ({ products, themeColor, headerStyle }) => {
    const { t } = useTranslation();
    const [search, setSearch] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<SortState<SortKey> | null>(null);
    const [showInactive, setShowInactive] = useState(false);
    const [includeVat, setIncludeVat] = useState(true);
    const [showPercentPrimary, setShowPercentPrimary] = useState(false);
    const [viewMode, setViewMode] = useState<'ABSOLUTE' | 'PER_UNIT'>('ABSOLUTE');

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    const filteredAndSorted = useMemo(() => {
        let result = products.filter(p => {
            if (!p.costDetail) return false; // Only show products with cost details uploaded
            if (!showInactive && p.stockLevel <= 0 && p.averageDailySales === 0) return false;
            
            const matchesTerm = (term: string) => {
                const t = term.toLowerCase();
                return p.sku.toLowerCase().includes(t) || 
                       p.name.toLowerCase().includes(t) ||
                       p.channels.some(c => c.skuAlias?.toLowerCase().includes(t));
            };

            if (searchTags.length > 0) {
                return searchTags.some(tag => matchesTerm(tag));
            }
            return matchesTerm(search);
        });

        const getValue = (p: Product, key: string): string | number => {
            if (key === 'sku') return p.sku;
            if (key === 'caPrice') {
                const price = p.caPrice || 0;
                return includeVat ? price * VAT_RATE : price;
            }
            
            const detail = p.costDetail;
            if (!detail) return 0;
            
            const skuQty = detail.skuQty > 0 ? detail.skuQty : 1;
            const perUnit = (value: number) => viewMode === 'PER_UNIT' ? value / skuQty : value;

            let val: any;
            if (key in detail) {
                val = perUnit((detail as any)[key]);
            } else {
                return 0; // Fallback for keys not in detail
            }

            const currencyKeys: (keyof SkuCostDetail)[] = ['unitPrice', 'salesAmt', 'cogs', 'postage', 'sellingFee', 'adsFee', 'otherFee', 'subscriptionFee', 'wmsFee', 'refundAmt', 'profitInclRn', 'extraFreight', 'promoRebate', 'resendAmt'];
            if (includeVat && currencyKeys.includes(key as keyof SkuCostDetail)) {
                return val * VAT_RATE;
            }
            return val;
        };

        return sortRows(result, sortConfig, getValue);
    }, [products, search, searchTags, sortConfig, showInactive, includeVat, viewMode]);

    useEffect(() => { setCurrentPage(1); }, [search, searchTags, showInactive, includeVat, viewMode]);

    const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
    const paginatedProducts = filteredAndSorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

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

    const taxLabel = !includeVat ? ' (ex tax)' : '';

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-center mb-2 gap-4">
                <div>
                    <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>{t('cost_management_title')}</h2>
                    <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>{t('cost_management_desc')}</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setIncludeVat(!includeVat)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${includeVat ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                        {includeVat ? t('vat_included') : t('vat_excluded')}
                    </button>

                    <button 
                        onClick={() => setShowPercentPrimary(!showPercentPrimary)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${showPercentPrimary ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                        {showPercentPrimary ? <Percent className="w-3 h-3" /> : <Hash className="w-3 h-3" />}
                        {showPercentPrimary ? t('primary_percent') : t('primary_value')}
                    </button>
                    <button 
                        onClick={() => setViewMode(prev => prev === 'ABSOLUTE' ? 'PER_UNIT' : 'ABSOLUTE')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${viewMode === 'PER_UNIT' ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                        {viewMode === 'PER_UNIT' ? <Divide className="w-3 h-3" /> : <Hash className="w-3 h-3" />}
                        {viewMode === 'PER_UNIT' ? 'Per Unit' : 'Absolute'}
                    </button>
                </div>
            </div>

            <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex items-center gap-4 relative z-20">
                <div className="relative flex-1">
                    <TagSearchInput 
                        tags={searchTags}
                        onTagsChange={(tags) => { setSearchTags(tags); setCurrentPage(1); }}
                        onInputChange={(val) => { setSearch(val); setCurrentPage(1); }}
                        placeholder="Search SKU or Alias..."
                        themeColor={themeColor}
                    />
                </div>
                <div className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 min-w-[180px]">
                    <span className="text-xs font-bold text-gray-500 uppercase mr-2">{t('show_inactive')}</span>
                    <button onClick={() => setShowInactive(!showInactive)} className="text-gray-500 hover:text-indigo-600 focus:outline-none" style={showInactive ? { color: themeColor } : {}}>{showInactive ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}</button>
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50/50 text-gray-500 uppercase text-xs font-semibold">
                            <tr>
                                <th className="px-3 py-3 sticky left-0 top-0 bg-white/90 backdrop-blur-md z-20 shadow-sm cursor-pointer hover:bg-gray-100 transition-colors select-none min-w-[200px] border-r border-gray-100" onClick={() => setSortConfig(prev => ({ key: 'sku', dir: prev?.key === 'sku' && prev.dir === 'desc' ? 'asc' : 'desc' }))}>
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
                                {/* FIX: Moved 'minWidth' value to 'className' prop. */}
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
                                                <span className="font-bold text-purple-600 font-mono">£{(includeVat ? product.caPrice * VAT_RATE : product.caPrice).toFixed(2)}</span>
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

                {filteredAndSorted.length > 0 && (
                    <div className="bg-gray-50/50 px-4 py-3 border-t border-gray-200/50 flex items-center justify-between sm:px-6">
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                            <div className="flex items-center gap-4">
                                <p className="text-sm text-gray-700">
                                    {t('pagination_showing', { start: (currentPage - 1) * itemsPerPage + 1, end: Math.min(currentPage * itemsPerPage, filteredAndSorted.length), total: filteredAndSorted.length })}
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
        </div>
    );
};

export default CostManagementPage;
