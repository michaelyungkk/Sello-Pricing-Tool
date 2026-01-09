import React, { useState, useMemo, useEffect } from 'react';
import { Product, SkuCostDetail } from '../types';
import { TagSearchInput } from './TagSearchInput';
import { ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, Eye, EyeOff, Percent, Hash } from 'lucide-react';

interface CostManagementPageProps {
    products: Product[];
    themeColor: string;
    headerStyle: React.CSSProperties;
}

type SortKey = keyof SkuCostDetail | 'sku' | 'caPrice' | 'currentPrice';

const VAT_RATE = 1.20;

const CostManagementPage: React.FC<CostManagementPageProps> = ({ products, themeColor, headerStyle }) => {
    const [search, setSearch] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
    const [showInactive, setShowInactive] = useState(false);
    const [includeVat, setIncludeVat] = useState(true);
    const [showPercentPrimary, setShowPercentPrimary] = useState(false);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);

    const handleSort = (key: SortKey) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

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

        if (sortConfig) {
            result.sort((a, b) => {
                let aValue: any = a.costDetail ? (a.costDetail as any)[sortConfig.key] : 0;
                let bValue: any = b.costDetail ? (b.costDetail as any)[sortConfig.key] : 0;

                // Handle derived/root keys
                if (sortConfig.key === 'sku') { aValue = a.sku; bValue = b.sku; }
                if (sortConfig.key === 'caPrice') { aValue = a.caPrice || 0; bValue = b.caPrice || 0; }
                if (sortConfig.key === 'currentPrice') { aValue = a.currentPrice || 0; bValue = b.currentPrice || 0; }

                if (typeof aValue === 'string') aValue = aValue.toLowerCase();
                if (typeof bValue === 'string') bValue = bValue.toLowerCase();
                
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [products, search, searchTags, sortConfig, showInactive]);

    useEffect(() => { setCurrentPage(1); }, [search, searchTags, showInactive]);

    const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
    const paginatedProducts = filteredAndSorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const SortHeader = ({ label, sortKey, alignRight = false, minWidth, className }: { label: string, sortKey: SortKey, alignRight?: boolean, minWidth?: string, className?: string }) => {
        const isActive = sortConfig?.key === sortKey;
        return (
            <th
                className={`px-3 py-3 sticky top-0 bg-gray-50/90 backdrop-blur-md z-10 shadow-sm cursor-pointer hover:bg-gray-100 transition-colors select-none ${alignRight ? 'text-right' : 'text-left'} ${minWidth || ''} ${className || ''}`}
                onClick={() => handleSort(sortKey)}
            >
                <div className={`flex items-center gap-1 ${alignRight ? 'justify-end' : 'justify-start'}`}>
                    {label}
                    <div className="flex flex-col">
                        {isActive ? (
                            sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" style={{ color: themeColor }} /> : <ChevronDown className="w-3 h-3" style={{ color: themeColor }} />
                        ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50" />
                        )}
                    </div>
                </div>
            </th>
        );
    };

    const CombinedCell = ({ value, percent, isCurrency = true, highlight = false }: { value: number, percent?: number, isCurrency?: boolean, highlight?: boolean }) => {
        const safeValue = value ?? 0;
        const displayVal = includeVat && isCurrency ? safeValue * VAT_RATE : safeValue;
        
        // Logic for flipping: 
        // Normal: Top = Absolute, Bottom = %
        // Flipped: Top = %, Bottom = Absolute
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
        <div className="w-full space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-center mb-2 gap-4">
                <div>
                    <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>SKU Profitability Analysis</h2>
                    <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>Detailed cost breakdown from SKU Detail Report.</p>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Toggles */}
                    <button 
                        onClick={() => setIncludeVat(!includeVat)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${includeVat ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                        {includeVat ? 'VAT Included (20%)' : 'VAT Excluded'}
                    </button>

                    <button 
                        onClick={() => setShowPercentPrimary(!showPercentPrimary)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${showPercentPrimary ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                        {showPercentPrimary ? <Percent className="w-3 h-3" /> : <Hash className="w-3 h-3" />}
                        {showPercentPrimary ? 'Primary: %' : 'Primary: Value'}
                    </button>
                </div>
            </div>

            {/* Search Bar */}
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
                    <span className="text-xs font-bold text-gray-500 uppercase mr-2">Show Inactive</span>
                    <button onClick={() => setShowInactive(!showInactive)} className="text-gray-500 hover:text-indigo-600 focus:outline-none" style={showInactive ? { color: themeColor } : {}}>{showInactive ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}</button>
                </div>
            </div>

            {/* Table */}
            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50/50 text-gray-500 uppercase text-xs font-semibold">
                            <tr>
                                <th className="px-3 py-3 sticky left-0 top-0 bg-white/90 backdrop-blur-md z-20 shadow-sm cursor-pointer hover:bg-gray-100 transition-colors select-none min-w-[200px] border-r border-gray-100" onClick={() => handleSort('sku')}>
                                    SKU / Name
                                </th>
                                <SortHeader label="CA Price" sortKey="caPrice" alignRight />
                                <SortHeader label="Unit Price" sortKey="unitPrice" alignRight />
                                <SortHeader label="Sales Amt" sortKey="salesAmt" alignRight />
                                <SortHeader label="COGS" sortKey="cogs" alignRight />
                                <SortHeader label="Postage" sortKey="postage" alignRight />
                                <SortHeader label="Sell Fee" sortKey="sellingFee" alignRight />
                                <SortHeader label="Ads Fee" sortKey="adsFee" alignRight />
                                <SortHeader label="Other Fee" sortKey="otherFee" alignRight />
                                <SortHeader label="Sub Fee" sortKey="subscriptionFee" alignRight />
                                <SortHeader label="WMS Fee" sortKey="wmsFee" alignRight />
                                <SortHeader label="Refunds" sortKey="refundAmt" alignRight />
                                <SortHeader 
                                    label="Net Profit" 
                                    sortKey="profitInclRn" 
                                    alignRight 
                                    minWidth="min-w-[100px]" 
                                    className="sticky right-0 z-20 bg-gray-50 border-l border-gray-200"
                                />
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/50">
                            {paginatedProducts.map(product => {
                                const detail = product.costDetail;
                                if (!detail) return null;

                                return (
                                    <tr key={product.id} className="even:bg-gray-50/30 hover:bg-gray-100/50 group">
                                        <td className="px-3 py-2 sticky left-0 bg-white/50 backdrop-blur-sm group-hover:bg-white z-10 border-r border-gray-100">
                                            <div className="font-bold text-gray-900">{product.sku}</div>
                                            <div className="text-xs text-gray-500 truncate max-w-[180px]">{product.name}</div>
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            {product.caPrice ? (
                                                <span className="font-bold text-purple-600 font-mono">£{product.caPrice.toFixed(2)}</span>
                                            ) : '-'}
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <CombinedCell value={detail.unitPrice} />
                                        </td>
                                        <td className="px-3 py-2 text-right bg-blue-50/20">
                                            <CombinedCell value={detail.salesAmt} />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <CombinedCell value={detail.cogs} percent={detail.cogsPct} />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <CombinedCell value={detail.postage} percent={detail.postagePct} />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <CombinedCell value={detail.sellingFee} percent={detail.sellingFeePct} />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <CombinedCell value={detail.adsFee} percent={detail.adsFeePct} />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <CombinedCell value={detail.otherFee} percent={detail.otherFeePct} />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <CombinedCell value={detail.subscriptionFee} percent={detail.subscriptionFeePct} />
                                        </td>
                                        <td className="px-3 py-2 text-right">
                                            <CombinedCell value={detail.wmsFee} percent={detail.wmsFeePct} />
                                        </td>
                                        <td className="px-3 py-2 text-right text-red-600">
                                            <CombinedCell value={detail.refundAmt} percent={detail.returnAmtPct} />
                                        </td>
                                        <td className="px-3 py-2 text-right sticky right-0 bg-white/90 backdrop-blur-md group-hover:bg-white z-20 border-l border-gray-100 min-w-[100px]">
                                            <div className={(detail.profitInclRn || 0) >= 0 ? 'text-green-700' : 'text-red-600'}>
                                                <CombinedCell value={detail.profitInclRn} percent={detail.profitInclRnPct} highlight />
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

                {/* Pagination Footer */}
                {filteredAndSorted.length > 0 && (
                    <div className="bg-gray-50/50 px-4 py-3 border-t border-gray-200/50 flex items-center justify-between sm:px-6">
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                            <div className="flex items-center gap-4">
                                <p className="text-sm text-gray-700">
                                    Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredAndSorted.length)}</span> of <span className="font-medium">{filteredAndSorted.length}</span> results
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
                                        <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">Page {currentPage} of {totalPages}</span>
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