
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Product, FeeBounds, LogisticsRule } from '../types';
import { TagSearchInput } from './TagSearchInput';
import { Search, Save, Upload, ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, AlertCircle, Info, Download, X, Eye, EyeOff } from 'lucide-react';

interface CostUpdate {
    sku: string;
    costPrice?: number;
    floorPrice?: number;
    ceilingPrice?: number;
}

interface CostManagementPageProps {
    products: Product[];
    onUpdateCosts: (updates: CostUpdate[]) => void;
    onOpenUpload: () => void;
    logisticsRules?: LogisticsRule[];
    themeColor: string;
    headerStyle: React.CSSProperties;
}

type SortKey = keyof Product | 'margin' | 'grossMargin';

interface BreakdownData {
    type: 'gross' | 'net';
    sellPriceGross: number;
    vatAmount: number;
    netRevenue: number;
    cogs: number;
    wms: number;
    other: number;
    // Gross specific
    estLogistics?: number;
    // Net specific
    sellingFee?: number;
    adsFee?: number;
    postage?: number;
    subFee?: number;
    extraFreight?: number;

    profit: number;
    margin: number;
    grossMargin: number;
    netMargin: number;
    grossProfit: number;
    netProfit: number;
}

const VAT = 1.20;

const CostManagementPage: React.FC<CostManagementPageProps> = ({ products, onUpdateCosts, onOpenUpload, logisticsRules = [], themeColor, headerStyle }) => {
    const [search, setSearch] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [editedCosts, setEditedCosts] = useState<Record<string, Partial<CostUpdate>>>({});
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
    const [showInactive, setShowInactive] = useState(false);

    // Tooltip State
    const [activeTooltip, setActiveTooltip] = useState<{
        type: 'fee' | 'margin';
        rect: DOMRect;
        data: any;
    } | null>(null);

    // Modal State
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);

    // Pagination State
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 50;

    const handleInputChange = (sku: string, field: keyof Omit<CostUpdate, 'sku'>, val: string) => {
        const num = parseFloat(val);
        // COGS is now fixed, so we only handle Floor/Ceiling which are Gross inputs
        const internalVal = (field === 'floorPrice' || field === 'ceilingPrice') 
            ? (isNaN(num) ? 0 : num / VAT)
            : (isNaN(num) ? 0 : num);

        setEditedCosts(prev => {
            const currentItem = prev[sku];
            return {
                ...prev,
                [sku]: {
                    ...(currentItem || {}),
                    [field]: internalVal
                }
            };
        });
    };

    const handleSave = () => {
        const updates = Object.entries(editedCosts).map(([sku, changes]) => {
            const changeObj = changes ?? {};
            return {
                sku,
                ...(changeObj as Partial<CostUpdate>)
            };
        });
        onUpdateCosts(updates as CostUpdate[]);
        setEditedCosts({});
    };

    const getTotalCost = (product: Product, edits: Partial<CostUpdate> = {}) => {
        const cogs = edits.costPrice !== undefined ? edits.costPrice : (product.costPrice || 0);
        const selling = product.sellingFee || 0;
        const ads = product.adsFee || 0;
        const post = product.postage || 0;
        const other = product.otherFee || 0;
        const sub = product.subscriptionFee || 0;
        const wms = product.wmsFee || 0;
        return cogs + selling + ads + post + other + sub + wms;
    };

    const getEstimatedLogisticsCost = (product: Product) => {
        if (!logisticsRules || logisticsRules.length === 0) return product.postage || 0;
        const weight = product.cartonDimensions?.weight || 0;
        const valid = logisticsRules.filter(r =>
            r.price > 0 &&
            r.id !== 'pickup' &&
            r.id !== 'na' &&
            (!r.maxWeight || r.maxWeight >= weight) &&
            !r.name.includes('-Z') && !r.name.includes('-NI') && !r.name.includes('REMOTE')
        ).sort((a, b) => a.price - b.price);

        if (valid.length === 0) {
            const fallback = logisticsRules.filter(r =>
                r.price > 0 &&
                (!r.maxWeight || r.maxWeight >= weight)
            ).sort((a, b) => a.price - b.price);
            return fallback.length > 0 ? fallback[0].price : (product.postage || 0);
        }
        return valid[0].price;
    };

    const getMargin = (product: Product, edits: Partial<CostUpdate> = {}) => {
        const totalCost = getTotalCost(product, edits);
        const net = (product.currentPrice + (product.extraFreight || 0)) - totalCost;
        return product.currentPrice > 0 ? (net / product.currentPrice) * 100 : -100;
    };

    const getGrossMargin = (product: Product, edits: Partial<CostUpdate> = {}) => {
        const sellPrice = product.currentPrice || 0;
        const cogs = edits.costPrice !== undefined ? edits.costPrice : (product.costPrice || 0);
        const wms = product.wmsFee || 0;
        const other = product.otherFee || 0;
        const logistics = getEstimatedLogisticsCost(product);
        const grossProfit = sellPrice - cogs - wms - other - logistics;
        return sellPrice > 0 ? (grossProfit / sellPrice) * 100 : -100;
    };

    const handleSort = (key: SortKey) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredAndSorted = useMemo(() => {
        let result = products.filter(p => {
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
                let aValue: any = a[sortConfig.key as keyof Product];
                let bValue: any = b[sortConfig.key as keyof Product];
                if (sortConfig.key === 'margin') {
                    aValue = getMargin(a);
                    bValue = getMargin(b);
                }
                else if (sortConfig.key === 'grossMargin') {
                    aValue = getGrossMargin(a);
                    bValue = getGrossMargin(b);
                }
                if (typeof aValue === 'string') aValue = aValue.toLowerCase();
                if (typeof bValue === 'string') bValue = bValue.toLowerCase();
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return result;
    }, [products, search, searchTags, sortConfig, showInactive, logisticsRules]);

    useEffect(() => { setCurrentPage(1); }, [search, searchTags, showInactive]);

    const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
    const paginatedProducts = filteredAndSorted.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

    const SortHeader = ({ label, sortKey, alignRight = false }: { label: string, sortKey: SortKey, alignRight?: boolean }) => {
        const isActive = sortConfig?.key === sortKey;
        return (
            <th
                className={`px-2 py-3 sticky top-0 bg-gray-50/50 backdrop-blur-md z-10 shadow-sm cursor-pointer hover:bg-gray-100 transition-colors select-none ${alignRight ? 'text-right' : 'text-left'}`}
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

    const FeeCell = ({ value, bounds }: { value: number | undefined, bounds?: FeeBounds }) => {
        const val = (value || 0) * VAT;
        if (val === 0) return <span className="text-gray-300">-</span>;
        const isOutlier = bounds && (bounds.max * VAT) > 0 && val > ((bounds.max * VAT) * 1.05);

        const handleMouseEnter = (e: React.MouseEvent) => {
            if (bounds && (bounds.min > 0 || bounds.max > 0)) {
                const upliftedBounds = { min: bounds.min * VAT, max: bounds.max * VAT };
                setActiveTooltip({
                    type: 'fee',
                    rect: e.currentTarget.getBoundingClientRect(),
                    data: upliftedBounds
                });
            }
        };

        return (
            <div
                className="group cursor-help inline-block w-full h-full text-right"
                onMouseEnter={handleMouseEnter}
                onMouseLeave={() => setActiveTooltip(null)}
            >
                <div className="flex items-center justify-end gap-1">
                    {isOutlier && <Info className="w-3 h-3" style={{ color: themeColor }} />}
                    <span className={`font-mono ${isOutlier ? 'font-semibold' : 'text-gray-700'}`} style={isOutlier ? { color: themeColor } : {}}>
                        {val.toFixed(2)}
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="w-full space-y-4">
            <div className="flex justify-between items-center mb-2">
                <div>
                    <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Cost & Fees Management (Gross)</h2>
                    <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>All prices and costs now include 20% VAT for platform alignment.</p>
                </div>
                <div className="flex items-center gap-3">
                    <button onClick={() => setIsExportModalOpen(true)} className="px-4 py-2 bg-white/80 text-gray-700 border border-gray-300 rounded-lg hover:bg-white flex items-center gap-2 transition-colors"><Download className="w-4 h-4" />Export</button>
                    <button onClick={onOpenUpload} className="px-4 py-2 border rounded-lg hover:bg-opacity-10 flex items-center gap-2 transition-colors" style={{ backgroundColor: `${themeColor}10`, color: themeColor, borderColor: `${themeColor}40` }}><Upload className="w-4 h-4" />Import Manual Costs (CSV)</button>
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
                    <span className="text-xs font-bold text-gray-500 uppercase mr-2">Show Inactive</span>
                    <button onClick={() => setShowInactive(!showInactive)} className="text-gray-500 hover:text-indigo-600 focus:outline-none" style={showInactive ? { color: themeColor } : {}}>{showInactive ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}</button>
                </div>
                {Object.keys(editedCosts).length > 0 && (
                    <button onClick={handleSave} className="px-6 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 flex items-center gap-2 animate-in fade-in slide-in-from-right-2"><Save className="w-4 h-4" />Save {Object.keys(editedCosts).length} Updates</button>
                )}
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50/50 text-gray-500 uppercase text-xs">
                            <tr>
                                <th className="px-2 py-3 sticky left-0 top-0 bg-white/80 backdrop-blur-md z-20 shadow-sm cursor-pointer hover:bg-gray-100 transition-colors select-none" onClick={() => handleSort('sku')}><div className="flex items-center gap-1">Product{sortConfig?.key === 'sku' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" style={{ color: themeColor }} /> : <ChevronDown className="w-3 h-3" style={{ color: themeColor }} />) : <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50" />}</div></th>
                                <SortHeader label="Sell Price (Inc)" sortKey="currentPrice" alignRight />
                                <SortHeader label="CA Price (Inc)" sortKey="caPrice" alignRight />
                                <SortHeader label="COGS (Inc)" sortKey="costPrice" alignRight />
                                <SortHeader label="Min (Inc)" sortKey="floorPrice" alignRight />
                                <SortHeader label="Max (Inc)" sortKey="ceilingPrice" alignRight />
                                <th className="px-2 py-3 text-right min-w-[60px] text-xs bg-gray-50/50 backdrop-blur-md sticky top-0 z-10 shadow-sm">Sell Fee</th>
                                <th className="px-2 py-3 text-right min-w-[60px] text-xs bg-gray-50/50 backdrop-blur-md sticky top-0 z-10 shadow-sm">Ads</th>
                                <th className="px-2 py-3 text-right min-w-[60px] text-xs bg-gray-50/50 backdrop-blur-md sticky top-0 z-10 shadow-sm">Post</th>
                                <th className="px-2 py-3 text-right min-w-[60px] text-xs bg-green-50/50 backdrop-blur-md border-l border-green-100 text-green-700 font-semibold sticky top-0 z-10 shadow-sm">Ex. Freight</th>
                                <th className="px-2 py-3 text-right min-w-[60px] text-xs bg-gray-50/50 backdrop-blur-md border-l border-gray-100 sticky top-0 z-10 shadow-sm">Sub</th>
                                <th className="px-2 py-3 text-right min-w-[60px] text-xs bg-gray-50/50 backdrop-blur-md sticky top-0 z-10 shadow-sm">WMS</th>
                                <th className="px-2 py-3 text-right min-w-[60px] text-xs bg-gray-50/50 backdrop-blur-md sticky top-0 z-10 shadow-sm">Other</th>
                                <th className="px-2 py-3 text-right sticky right-[130px] top-0 w-[130px] min-w-[130px] bg-indigo-50/80 backdrop-blur-md z-30 shadow-sm cursor-pointer hover:bg-indigo-100 transition-colors select-none text-indigo-700 border-l border-indigo-200" onClick={() => handleSort('grossMargin')}><div className="flex items-center justify-end gap-1">Gross %{sortConfig?.key === 'grossMargin' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />) : <ArrowUpDown className="w-3 h-3 opacity-50" />}</div></th>
                                <th className="px-2 py-3 text-right sticky right-0 top-0 w-[130px] min-w-[130px] bg-white/80 backdrop-blur-md z-30 shadow-sm cursor-pointer hover:bg-gray-100 transition-colors select-none border-l border-gray-100" onClick={() => handleSort('margin')}><div className="flex items-center justify-end gap-1">Net %{sortConfig?.key === 'margin' ? (sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" style={{ color: themeColor }} /> : <ChevronDown className="w-3 h-3" style={{ color: themeColor }} />) : <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50" />}</div></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/50">
                            {paginatedProducts.map(product => {
                                const edits = editedCosts[product.sku] || {};
                                const cogs = edits.costPrice ?? product.costPrice ?? 0;
                                
                                const floor = (edits.floorPrice ?? product.floorPrice ?? 0) * VAT;
                                const ceiling = (edits.ceilingPrice ?? product.ceilingPrice ?? 0) * VAT;

                                const totalCost = getTotalCost(product, edits);
                                const netProfit = (product.currentPrice + (product.extraFreight || 0)) - totalCost;
                                const margin = product.currentPrice > 0 ? (netProfit / product.currentPrice) * 100 : 0;

                                const estLogistics = getEstimatedLogisticsCost(product);
                                const grossCosts = cogs + (product.wmsFee || 0) + (product.otherFee || 0) + estLogistics;
                                const grossProfit = product.currentPrice - grossCosts;
                                const grossMargin = product.currentPrice > 0 ? (grossProfit / product.currentPrice) * 100 : 0;

                                const renderInput = (field: keyof Omit<CostUpdate, 'sku'>, value: number, placeholder: string = "0.00") => (
                                    <input
                                        type="number" step="0.01" min="0" value={value === 0 ? '' : value.toFixed(2)} placeholder={placeholder}
                                        onChange={(e) => handleInputChange(product.sku, field, e.target.value)}
                                        className={`w-16 text-right border rounded px-1.5 py-1 focus:ring-2 focus:ring-opacity-50 text-xs bg-white/50 ${edits[field] !== undefined ? 'bg-opacity-10' : 'border-gray-200'}`}
                                        style={edits[field] !== undefined ? { borderColor: themeColor, backgroundColor: `${themeColor}10`, '--tw-ring-color': themeColor } as React.CSSProperties : { '--tw-ring-color': themeColor } as React.CSSProperties}
                                    />
                                );

                                const handleMouseEnterMargin = (e: React.MouseEvent, type: 'gross' | 'net') => {
                                    setActiveTooltip({
                                        type: 'margin',
                                        rect: e.currentTarget.getBoundingClientRect(),
                                        data: {
                                            type, sellPriceGross: product.currentPrice * VAT, vatAmount: product.currentPrice * 0.20,
                                            netRevenue: product.currentPrice, cogs, wms: product.wmsFee || 0, other: product.otherFee || 0,
                                            estLogistics, sellingFee: product.sellingFee, adsFee: product.adsFee, postage: product.postage,
                                            subFee: product.subscriptionFee, extraFreight: product.extraFreight,
                                            profit: type === 'gross' ? grossProfit : netProfit, margin: type === 'gross' ? grossMargin : margin,
                                            grossMargin, netMargin: margin, grossProfit, netProfit
                                        }
                                    });
                                };

                                return (
                                    <tr key={product.id} className="even:bg-gray-50/30 hover:bg-gray-100/50 group">
                                        <td className="px-2 py-2 sticky left-0 bg-white/50 backdrop-blur-sm group-hover:bg-white z-10 border-r border-gray-100">
                                            <div className="font-bold text-gray-900">{product.sku}</div>
                                            {product.subcategory && <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 mt-1">{product.subcategory}</span>}
                                        </td>
                                        <td className="px-2 py-2 text-right text-gray-600 font-medium">£{(product.currentPrice * VAT).toFixed(2)}</td>
                                        <td className="px-2 py-2 text-right">
                                            {product.caPrice ? (
                                                <span className="font-bold text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-100 text-xs">£{product.caPrice.toFixed(2)}</span>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </td>
                                        <td className="px-2 py-2 text-right text-gray-600 font-mono">£{(cogs * VAT).toFixed(2)}</td>
                                        <td className="px-2 py-2 text-right bg-blue-50/30">{renderInput('floorPrice', floor, '-')}</td>
                                        <td className="px-2 py-2 text-right bg-blue-50/30">{renderInput('ceilingPrice', ceiling, '-')}</td>
                                        <td className="px-2 py-2 text-right bg-gray-50/30"><FeeCell value={product.sellingFee} bounds={product.feeBounds?.sellingFee} /></td>
                                        <td className="px-2 py-2 text-right bg-gray-50/30"><FeeCell value={product.adsFee} bounds={product.feeBounds?.adsFee} /></td>
                                        <td className="px-2 py-2 text-right bg-gray-50/30"><FeeCell value={product.postage} bounds={product.feeBounds?.postage} /></td>
                                        <td className="px-2 py-2 text-right bg-green-50/30 border-l border-green-100 text-green-700"><FeeCell value={product.extraFreight} bounds={product.feeBounds?.extraFreight} /></td>
                                        <td className="px-2 py-2 text-right bg-gray-50/30 border-l border-gray-100"><FeeCell value={product.subscriptionFee} bounds={product.feeBounds?.subscriptionFee} /></td>
                                        <td className="px-2 py-2 text-right bg-gray-50/30"><FeeCell value={product.wmsFee} bounds={product.feeBounds?.wmsFee} /></td>
                                        <td className="px-2 py-2 text-right bg-gray-50/30"><FeeCell value={product.otherFee} bounds={product.feeBounds?.otherFee} /></td>
                                        <td className="px-2 py-2 text-right sticky right-[130px] bg-indigo-50/80 backdrop-blur-md z-20 border-l border-indigo-200 cursor-help min-w-[130px]" onMouseEnter={(e) => handleMouseEnterMargin(e, 'gross')} onMouseLeave={() => setActiveTooltip(null)}><div className="flex flex-col items-end"><span className={`font-mono font-bold ${grossMargin < 0 ? 'text-red-600' : grossMargin < 20 ? 'text-yellow-600' : 'text-indigo-600'}`}>{grossMargin.toFixed(1)}%</span><span className="text-[10px] text-indigo-400 font-medium">£{grossProfit.toFixed(2)}</span></div></td>
                                        <td className="px-2 py-2 text-right sticky right-0 bg-white/80 backdrop-blur-md group-hover:bg-white z-20 border-l border-gray-100 cursor-help min-w-[130px]" onMouseEnter={(e) => handleMouseEnterMargin(e, 'net')} onMouseLeave={() => setActiveTooltip(null)}><div className="flex flex-col items-end"><span className={`font-mono font-bold ${margin < 0 ? 'text-red-600' : margin < 15 ? 'text-yellow-600' : 'text-green-600'}`}>{margin.toFixed(1)}%</span><span className="text-[10px] text-gray-400">£{netProfit.toFixed(2)}</span></div></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                {filteredAndSorted.length > 0 && (
                    <div className="bg-gray-50/50 px-4 py-3 border-t border-gray-200/50 flex items-center justify-between sm:px-6 rounded-b-lg mt-0">
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                            <div><p className="text-sm text-gray-700">Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredAndSorted.length)}</span> of <span className="font-medium">{filteredAndSorted.length}</span> results</p></div>
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

            {activeTooltip?.type === 'fee' && <FeeTooltip data={activeTooltip} />}
            {activeTooltip?.type === 'margin' && <MarginBreakdownTooltip data={activeTooltip} />}
            {isExportModalOpen && <CostExportModal products={products} onClose={() => setIsExportModalOpen(false)} themeColor={themeColor} />}
        </div>
    );
};

const FeeTooltip = ({ data }: { data: { rect: DOMRect; data: FeeBounds } }) => {
    const { rect, data: bounds } = data;
    const style: React.CSSProperties = { position: 'fixed', top: `${rect.top}px`, left: `${rect.left + rect.width / 2}px`, transform: 'translate(-50%, -100%) translateY(-8px)', zIndex: 9999, pointerEvents: 'none' };
    return createPortal(
        <div style={style}>
            <div className="bg-gray-900 text-white px-3 py-2 rounded shadow-lg text-xs whitespace-nowrap">
                <div className="font-mono">Min (Inc): £{bounds.min.toFixed(2)}</div>
                <div className="font-mono">Max (Inc): £{bounds.max.toFixed(2)}</div>
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
        </div>, document.body
    );
};

const MarginBreakdownTooltip = ({ data }: { data: { rect: DOMRect; data: BreakdownData } }) => {
    const { rect, data: breakdown } = data;
    const style: React.CSSProperties = { position: 'fixed', top: `${rect.top}px`, left: `${rect.left}px`, transform: 'translate(-100%, -50%) translateX(-12px)', zIndex: 9999, pointerEvents: 'none' };
    const isGross = breakdown.type === 'gross';

    return createPortal(
        <div style={style} className="bg-gray-900 text-white p-4 rounded-xl shadow-xl w-64 text-xs z-50 animate-in fade-in zoom-in duration-200">
            <h4 className="font-bold text-gray-200 mb-2 border-b border-gray-700 pb-1 flex justify-between">
                {isGross ? 'Gross Analysis' : 'Net Analysis'}
                <span className={isGross ? 'text-indigo-400' : 'text-green-400'}>{isGross ? breakdown.grossMargin.toFixed(1) : breakdown.netMargin.toFixed(1)}%</span>
            </h4>
            <div className="space-y-1 mb-2">
                <div className="flex justify-between"><span className="text-gray-400">Sell Price (Gross)</span><span className="font-mono text-white">£{breakdown.sellPriceGross.toFixed(2)}</span></div>
                <div className="flex justify-between"><span className="text-red-400">- VAT (20%)</span><span className="font-mono text-red-400">£{breakdown.vatAmount.toFixed(2)}</span></div>
                <div className="flex justify-between border-t border-gray-700 pt-1 mt-1"><span className="text-gray-300">Net Revenue</span><span className="font-mono text-white">£{breakdown.netRevenue.toFixed(2)}</span></div>
            </div>
            <div className="space-y-1 mb-3 text-gray-400 border-t border-b border-gray-700 py-2 border-dashed">
                <div className="flex justify-between"><span>- COGS</span><span className="text-red-300">£{breakdown.cogs.toFixed(2)}</span></div>
                {isGross ? (
                    <div className="flex justify-between"><span>- Est. Logistics</span><span className="text-red-300">£{(breakdown.estLogistics || 0).toFixed(2)}</span></div>
                ) : (
                    <>
                        <div className="flex justify-between"><span>- Fees & Ads</span><span className="text-red-300">£{((breakdown.sellingFee || 0) + (breakdown.adsFee || 0)).toFixed(2)}</span></div>
                        <div className="flex justify-between"><span>- Postage (Avg)</span><span className="text-red-300">£{(breakdown.postage || 0).toFixed(2)}</span></div>
                    </>
                )}
            </div>
            <div className="flex justify-between items-center font-bold text-sm">
                <span className="text-gray-300">Net Profit</span>
                <span className={breakdown.profit > 0 ? 'text-white' : 'text-red-400'}>£{breakdown.profit.toFixed(2)}</span>
            </div>
        </div>, document.body
    );
};

const CostExportModal = ({ products, onClose, themeColor }: { products: Product[], onClose: () => void, themeColor: string }) => {
    const handleDownload = () => {
        const clean = (val: any) => { if (val === null || val === undefined) return ''; const str = String(val).replace(/[\r\n]+/g, ' '); return `"${str.replace(/"/g, '""')}"`; };
        const headers = ['SKU', 'Product Name', 'CA Price (Gross)', 'Cost Price (Gross)', 'Min Price (Gross)', 'Max Price (Gross)', 'Current Price (Gross)', 'Net Margin %'];
        const rows = products.map(p => {
            const totalCost = (p.costPrice || 0) + (p.sellingFee || 0) + (p.adsFee || 0) + (p.postage || 0) + (p.otherFee || 0) + (p.subscriptionFee || 0) + (p.wmsFee || 0);
            const net = (p.currentPrice + (p.extraFreight || 0)) - totalCost;
            const margin = p.currentPrice > 0 ? (net / p.currentPrice) * 100 : 0;
            return [clean(p.sku), clean(p.name), (p.caPrice || 0).toFixed(2), (p.costPrice ? p.costPrice * VAT : 0).toFixed(2), (p.floorPrice ? p.floorPrice * VAT : 0).toFixed(2), (p.ceilingPrice ? p.ceilingPrice * VAT : 0).toFixed(2), (p.currentPrice * VAT).toFixed(2), margin.toFixed(2) + '%'];
        });
        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\uFEFF', csvContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none'; link.href = url;
        link.download = `cost_structure_gross_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(link); link.click();
        setTimeout(() => { if (document.body.contains(link)) document.body.removeChild(link); URL.revokeObjectURL(url); }, 60000);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center"><h3 className="font-bold text-gray-900">Export Gross Cost Structure</h3><button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500" /></button></div>
                <div className="p-6 text-sm text-gray-600"><p>Download a CSV containing Gross Prices (inc 20% VAT) and net margin analysis for accounting alignment.</p></div>
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-xl"><button onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors">Cancel</button><button onClick={handleDownload} className="px-4 py-2 text-white font-medium rounded-lg flex items-center gap-2 transition-colors" style={{ backgroundColor: themeColor }}><Download className="w-4 h-4" />Download CSV</button></div>
            </div>
        </div>
    );
};

export default CostManagementPage;
