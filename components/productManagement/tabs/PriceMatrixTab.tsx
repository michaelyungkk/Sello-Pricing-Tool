
import React, { useState, useMemo, useEffect } from 'react';
import { Product, PricingRules, PromotionEvent } from '../../../types';
import { TagSearchInput } from '../../TagSearchInput';
import { Download, Info, DollarSign, Activity, ChevronLeft, ChevronRight, Tag } from 'lucide-react';
import { VAT_MULTIPLIER } from '../../../constants';
import { getTodayKeyMelbourne } from '../../../services/dateUtils';
import { formatSmartMoney } from '../../../utils/format';

interface PriceMatrixTabProps {
    products: Product[];
    pricingRules: PricingRules;
    promotions: PromotionEvent[];
    themeColor: string;
}

const VAT = VAT_MULTIPLIER;

export const PriceMatrixTab: React.FC<PriceMatrixTabProps> = ({ products, pricingRules, promotions, themeColor }) => {
    const [search, setSearch] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const platforms = Object.keys(pricingRules);

    const filtered = useMemo(() => products.filter(p => {
        const matchesTerm = (term: string) => {
            const t = term.toLowerCase();
            return p.sku.toLowerCase().includes(t) ||
                p.name.toLowerCase().includes(t) ||
                p.channels.some(c => c.skuAlias?.toLowerCase().includes(t));
        };

        if (searchTags.length > 0) {
            const matchesTag = searchTags.some(tag => matchesTerm(tag));
            const matchesText = search.trim().length > 0 ? matchesTerm(search) : true;
            return matchesTag && matchesText;
        }
        return matchesTerm(search);
    }), [products, search, searchTags]);

    useEffect(() => { setCurrentPage(1); }, [search, searchTags]);

    const paginatedProducts = useMemo(() => {
        return filtered.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    }, [filtered, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filtered.length / itemsPerPage);

    const getActivePromo = (sku: string, platform: string) => {
        const targetSku = sku.toUpperCase();
        const targetPlatform = platform.toLowerCase().trim();
        const today = getTodayKeyMelbourne();

        return promotions.find(p => {
            // Dynamic Date Check: Promo must be currently valid
            if (p.startDate > today || p.endDate < today) return false;

            // Platform Check
            if (p.platform.toLowerCase().trim() !== targetPlatform) return false;

            // SKU Check
            return p.items.some(i => i.sku.toUpperCase() === targetSku);
        });
    };

    const calculatePromoPrice = (product: Product, promo: PromotionEvent, promoItem: any) => {
        if (!promo || !promoItem) return 0;

        let type = promoItem.discountType;
        let value = promoItem.discountValue;

        if (promo.promotionScope === 'SHOP') {
            type = promo.shopDiscountType;
            value = promo.shopDiscountValue || 0;
        }

        // Fixed prices don't need a baseline
        if (type === 'FIXED_PRICE') {
            return value > 0 ? value : (promoItem.promoPrice || 0);
        }

        // 1. Determine Baseline for relative discounts
        let baseline = 0;
        if (promo.baselineMode === 'MANUAL') {
            baseline = promo.baselineManualPrice || 0;
        } else if (promo.baselineMode === 'CA_PRICE') {
            baseline = product.caPrice || (product.currentPrice * VAT);
        } else {
            baseline = product.currentPrice * VAT;
        }

        if (baseline <= 0) return promoItem.promoPrice || 0;

        // 2. Calculate
        let calculated = 0;
        if (type === 'PERCENT_OFF' || type === 'PERCENTAGE') {
            calculated = baseline * (1 - (value / 100));
        } else if (type === 'FIXED_OFF' || type === 'FIXED') {
            calculated = Math.max(0, baseline - value);
        } else {
            calculated = promoItem.promoPrice || 0;
        }

        // 3. Final Fallback
        if (calculated <= 0.01 && (promoItem.promoPrice || 0) > 0) {
            return promoItem.promoPrice;
        }

        return calculated;
    };

    const handleExport = () => {
        const clean = (val: any) => {
            if (val === null || val === undefined) return '';
            return `"${String(val).replace(/"/g, '""')}"`;
        };

        const headers = ['SKU', 'Name', 'CA Price'];
        platforms.forEach(p => {
            headers.push(`${p} Price (Inc VAT)`);
            headers.push(`${p} Velocity`);
        });

        const rows = filtered.map(p => {
            const rowData = [
                clean(p.sku),
                clean(p.name),
                p.caPrice ? p.caPrice.toFixed(2) : ''
            ];

            platforms.forEach(platform => {
                const channel = p.channels.find(c => c.platform === platform);
                const rawPrice = channel?.price || p.currentPrice;
                const displayPrice = rawPrice * VAT;
                const velocity = channel?.velocity || 0;

                const promo = getActivePromo(p.sku, platform);
                const promoItem = promo?.items.find(i => i.sku.toUpperCase() === p.sku.toUpperCase());
                const effectivePromoPrice = (promo && promoItem) ? calculatePromoPrice(p, promo, promoItem) : 0;

                const finalExportPrice = effectivePromoPrice > 0 ? effectivePromoPrice : displayPrice;

                rowData.push(finalExportPrice.toFixed(2));
                rowData.push(velocity.toFixed(2));
            });

            return rowData.join(',');
        });

        const csvContent = [headers.join(','), ...rows].join('\n');
        const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `price_matrix_export_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-4 h-full flex flex-col">
            <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between z-40">
                <div className="flex-1 w-full flex items-center gap-3">
                    <div className="flex-1">
                        <TagSearchInput
                            tags={searchTags}
                            onTagsChange={setSearchTags}
                            onInputChange={setSearch}
                            placeholder="Search matrix (SKU or Alias)..."
                            themeColor={themeColor}
                        />
                    </div>

                    <div className="group relative flex items-center justify-center z-50">
                        <button className="p-2.5 rounded-lg hover:bg-white/50 text-gray-400 hover:text-indigo-600 transition-colors border border-transparent hover:border-gray-200">
                            <Info className="w-5 h-5" />
                        </button>
                        <div className="absolute right-0 top-full mt-2 w-80 p-4 bg-gray-900/95 backdrop-blur-md shadow-2xl rounded-xl text-white text-xs opacity-0 group-hover:opacity-100 transition-all pointer-events-none transform translate-y-2 group-hover:translate-y-0 border border-gray-700/50 z-[100]">
                            <div className="absolute -top-1.5 right-3 w-3 h-3 bg-gray-900 rotate-45 border-t border-l border-gray-700/50"></div>
                            <h4 className="font-bold text-sm mb-2 text-indigo-300 flex items-center gap-2">
                                <DollarSign className="w-4 h-4" /> Price Logic
                            </h4>
                            <div className="space-y-3">
                                <p className="leading-relaxed text-gray-300">
                                    Display prices are <span className="font-bold text-white">VAT Inclusive (x1.20)</span>.
                                    Platform prices are derived based on the following priority:
                                </p>
                                <div className="bg-gray-800/50 p-2 rounded border border-gray-700">
                                    <ol className="list-decimal pl-4 space-y-1 text-gray-300">
                                        <li><span className="text-red-400 font-bold">Active Promo</span> (if currently live)</li>
                                        <li>
                                            <span className="text-white font-bold">Channel Price</span> (VWAP from your most recently imported transaction report)
                                        </li>
                                        <li><span className="text-gray-400">Master Price</span> (Global default)</li>
                                    </ol>
                                </div>
                                <div className="pt-2 border-t border-gray-700">
                                    <span className="text-[10px] uppercase font-bold text-gray-500 mb-1 block">Deviation from CA Price</span>
                                    <div className="grid grid-cols-2 gap-2">
                                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]"></div> <span className="text-gray-300">Higher</span></div>
                                        <div className="flex items-center gap-1.5"><div className="w-2 h-2 rounded-full bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]"></div> <span className="text-gray-300">Lower</span></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                </div>
                <button onClick={handleExport} className="sello-btn cta">
                    <Download className="w-4 h-4" /> Export CSV
                </button>
            </div>
            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-auto flex-1">
                <table className="sello-table">
                    <thead className="sticky top-0">
                        <tr>
                            <th className="pin" style={{ minWidth: 150 }}>Product Reference</th>
                            <th className="pin r col-ca" style={{ left: 150, minWidth: 80 }}>CA Price</th>
                            {platforms.map(p => <th key={p} className="c" style={{ minWidth: 120 }}>{p}</th>)}
                        </tr>
                    </thead>
                    <tbody>
                        {paginatedProducts.map(p => (
                            <tr key={p.id} className="group">
                                <td className="pin">
                                    <div className="font-mono font-bold text-gray-900 truncate max-w-[134px]">{p.sku}</div>
                                    <div className="text-[10px] text-gray-500 truncate max-w-[134px]">{p.name}</div>
                                </td>
                                <td className="pin r v-ca" style={{ left: 150 }}>
                                    {p.caPrice ? formatSmartMoney(p.caPrice) : '-'}
                                </td>
                                {platforms.map(platform => {
                                    const channel = p.channels.find(c => c.platform === platform);
                                    const promo = getActivePromo(p.sku, platform);
                                    const promoItem = promo?.items.find(i => i.sku.toUpperCase() === p.sku.toUpperCase());

                                    const rawPrice = channel?.price || p.currentPrice;
                                    const displayPrice = rawPrice * VAT;
                                    const velocity = channel?.velocity || 0;

                                    // Dynamic Promo Price Calculation
                                    const effectivePromoPrice = (promo && promoItem) ? calculatePromoPrice(p, promo, promoItem) : 0;
                                    const isPromoActive = effectivePromoPrice > 0;

                                    // Deviation Logic
                                    const refPrice = p.caPrice;
                                    let priceStyle = "font-bold text-gray-900";

                                    if (!isPromoActive && refPrice) {
                                        if (displayPrice > refPrice + 0.01) {
                                            priceStyle = "font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200";
                                        } else if (displayPrice < refPrice - 0.01) {
                                            priceStyle = "font-bold text-red-500 bg-red-50 px-1.5 py-0.5 rounded border border-red-200";
                                        }
                                    }

                                    return (
                                        <td key={platform} className="c" style={{ verticalAlign: 'top' }}>
                                            {(channel || promo) ? (
                                                <div className="flex flex-col items-center gap-1">
                                                    {isPromoActive ? (
                                                        <div className="flex items-center gap-1 justify-center relative group/promo cursor-help bg-red-50 px-1.5 py-0.5 rounded border border-red-100 shadow-sm" title={`Active Promo: ${promo?.name}\nRegular Price: ${formatSmartMoney(displayPrice)}`}>
                                                            <span className="font-bold text-red-500">{formatSmartMoney(effectivePromoPrice)}</span>
                                                            <Tag className="w-3 h-3 text-red-500" />
                                                        </div>
                                                    ) : (
                                                        <div className="flex items-center gap-1">
                                                            <span className={priceStyle}>{formatSmartMoney(displayPrice)}</span>
                                                            {promo && <span className="text-[8px] bg-gray-100 text-gray-400 px-1 rounded border border-gray-200" title="Promo detected but calc = 0. Check data.">P?</span>}
                                                        </div>
                                                    )}

                                                    {velocity > 0 && (
                                                        <span className="text-[10px] text-gray-500 flex items-center gap-1 mt-0.5 bg-gray-50/80 px-1.5 py-0.5 rounded border border-gray-100">
                                                            <Activity className="w-2.5 h-2.5 text-indigo-500" /> {velocity.toFixed(1)}/d
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </td>
                                    )
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filtered.length > itemsPerPage && (
                    <div className="sello-table-footer" style={{ position: 'sticky', bottom: 0 }}>
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                            <div className="flex items-center gap-4">
                                <p className="text-sm text-gray-700">
                                    Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filtered.length)}</span> of <span className="font-medium">{filtered.length}</span> results
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
                                        <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronLeft className="h-5 w-5" /></button>
                                        <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">Page {currentPage} of {totalPages}</span>
                                        <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"><ChevronRight className="h-5 w-5" /></button>
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
