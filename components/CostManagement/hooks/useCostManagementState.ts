
import { useState, useMemo, useEffect } from 'react';
import { Product, SkuCostDetail } from '../../../types';
import { SortState, sortRows } from '../../../utils/tableSort';
import { SortKey, ViewMode } from '../types';

const VAT_RATE = 1.20;

export const useCostManagementState = (products: Product[]) => {
    const [search, setSearch] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [sortConfig, setSortConfig] = useState<SortState<SortKey> | null>(null);
    const [showInactive, setShowInactive] = useState(false);
    const [includeVat, setIncludeVat] = useState(true);
    const [showPercentPrimary, setShowPercentPrimary] = useState(false);
    const [viewMode, setViewMode] = useState<ViewMode>('ABSOLUTE');

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
                // CA Price is already Gross (includes VAT).
                return includeVat ? price : price / VAT_RATE;
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

    return {
        search, setSearch,
        searchTags, setSearchTags,
        sortConfig, setSortConfig,
        showInactive, setShowInactive,
        includeVat, setIncludeVat,
        showPercentPrimary, setShowPercentPrimary,
        viewMode, setViewMode,
        currentPage, setCurrentPage,
        itemsPerPage, setItemsPerPage,
        filteredAndSorted,
        paginatedProducts,
        totalPages
    };
};
