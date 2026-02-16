
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

    const handleExport = () => {
        const vatLabel = includeVat ? '(Inc VAT)' : '(Ex VAT)';
        const modeLabel = viewMode === 'PER_UNIT' ? 'Per Unit' : 'Absolute';
        
        const headers = [
            'SKU', 'Name', `CA Price ${vatLabel}`, `Unit Price ${vatLabel}`, `Sales Amt ${vatLabel}`,
            `COGS ${vatLabel}`, `Postage ${vatLabel}`, `Selling Fee ${vatLabel}`, `Ads Fee ${vatLabel}`,
            `Other Fee ${vatLabel}`, `Sub Fee ${vatLabel}`, `WMS Fee ${vatLabel}`, `Refunds ${vatLabel}`,
            `Net Profit ${vatLabel}`, 'Net Margin %', 'Sku Qty'
        ];

        const csvRows = filteredAndSorted.map(p => {
            const detail = p.costDetail;
            if (!detail) return [];

            const escape = (str: string) => `"${String(str || '').replace(/"/g, '""')}"`;
            
            const skuQty = detail.skuQty > 0 ? detail.skuQty : 1;
            
            // Helper to process values based on current view settings
            // isAlreadyPerUnit flag prevents double-division for metrics that are inherently per-unit (like Unit Price)
            const proc = (val: number, isAlreadyPerUnit = false) => {
                let v = val;
                if (viewMode === 'PER_UNIT' && !isAlreadyPerUnit) {
                    v = val / skuQty;
                }
                if (includeVat) v *= VAT_RATE;
                return v.toFixed(2);
            };

            const caPrice = p.caPrice ? (includeVat ? p.caPrice : p.caPrice / VAT_RATE) : 0;

            return [
                escape(p.sku),
                escape(p.name),
                caPrice.toFixed(2),
                proc(detail.unitPrice, true), // Unit Price is already per-unit, do not divide again
                proc(detail.salesAmt),
                proc(detail.cogs),
                proc(detail.postage),
                proc(detail.sellingFee),
                proc(detail.adsFee),
                proc(detail.otherFee),
                proc(detail.subscriptionFee),
                proc(detail.wmsFee),
                proc(detail.refundAmt),
                proc(detail.profitInclRn),
                (detail.profitInclRnPct || 0).toFixed(2) + '%',
                detail.skuQty.toString()
            ].join(',');
        });

        const csvContent = [headers.join(','), ...csvRows].filter(r => r.length > 0).join('\n');
        const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `cost_breakdown_${modeLabel}_${includeVat ? 'IncVAT' : 'ExVAT'}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

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
        totalPages,
        handleExport
    };
};
