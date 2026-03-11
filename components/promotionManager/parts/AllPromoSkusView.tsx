
import React, { useState, useMemo } from 'react';
import { formatSmartMoney } from '../../../utils/format';
import { PromotionEvent, Product, PromotionItem } from '../../../types';
import { SortState, sortRows } from '../../../utils/tableSort';
import { SortableHeader } from '../../common/SortableHeader';
import { TagSearchInput } from '../../TagSearchInput';
import { GradeBadge } from '../../GradeBadge';
import { StatusBadge } from './StatusBadge';
import { getTodayKeyMelbourne } from '../../../services/dateUtils';
import { Download } from 'lucide-react';
import { SelectFilter } from '../../common/SelectFilter';

interface AllPromoSkusViewProps {
    promotions: PromotionEvent[];
    products: Product[];
    themeColor: string;
}

// Helper duplicating logic to avoid deep dependency
const calculateEffectivePrice = (baseline: number, type: string, value: number): number => {
    if (!value && type !== 'PERCENT_OFF') return 0;
    switch (type) {
        case 'PERCENT_OFF':
        case 'PERCENTAGE':
            return baseline * (1 - (value / 100));
        case 'FIXED_OFF':
            return Math.max(0, baseline - value);
        case 'FIXED_PRICE':
        default:
            return value;
    }
};

const getBaselineForProduct = (promo: PromotionEvent, product?: Product): number => {
    if (promo.baselineMode === 'MANUAL') return promo.baselineManualPrice || 0;
    if (!product) return 0;
    if (promo.baselineMode === 'CA_PRICE' && product.caPrice) return product.caPrice;
    return (product.currentPrice || 0) * 1.20; // VAT estimate
};

export const AllPromoSkusView: React.FC<AllPromoSkusViewProps> = ({ promotions, products, themeColor }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [platformFilter, setPlatformFilter] = useState('All Platforms');
    const [sortConfig, setSortConfig] = useState<SortState<string> | null>({ key: 'startDate', dir: 'asc' });

    const productMap = useMemo(() => {
        const map = new Map<string, Product>();
        (products || []).forEach(p => map.set(p.sku.toUpperCase(), p));
        return map;
    }, [products]);

    const allRows = useMemo(() => {
        const today = getTodayKeyMelbourne();
        const rows: any[] = [];
        const seenKeys = new Set<string>();

        (promotions || []).forEach(promo => {
            if (!promo) return;

            // Dynamic Status
            let status: 'UPCOMING' | 'ACTIVE' | 'ENDED' = 'ACTIVE';
            if (promo.startDate > today) status = 'UPCOMING';
            else if (promo.endDate < today) status = 'ENDED';

            (promo.items || []).forEach(item => {
                if (!item || !item.sku) return;

                // Prevent duplicates: Ensure distinct SKU per Promo ID
                const uniqueKey = `${promo.id}|${item.sku.toUpperCase()}`;
                if (seenKeys.has(uniqueKey)) return;
                seenKeys.add(uniqueKey);

                const product = productMap.get(item.sku.toUpperCase());
                const baseline = getBaselineForProduct(promo, product);

                let computed = 0;
                if (promo.promotionScope === 'SHOP') {
                    computed = calculateEffectivePrice(baseline, promo.shopDiscountType || 'PERCENT_OFF', promo.shopDiscountValue || 0);
                } else {
                    computed = calculateEffectivePrice(baseline, item.discountType || 'FIXED_PRICE', item.discountValue || 0);
                }

                const resolved = (computed > 0) ? computed : (item.promoPrice > 0 ? item.promoPrice : 0);

                rows.push({
                    id: uniqueKey,
                    sku: item.sku,
                    eventName: promo.name,
                    platform: promo.platform,
                    promoPrice: resolved,
                    startDate: new Date(promo.startDate),
                    endDate: new Date(promo.endDate),
                    status: status // Use derived
                });
            });
        });
        return rows.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    }, [promotions, productMap]);

    const sortedRows = useMemo(() => {
        const currentSearchTags = searchTags || [];
        const currentSearchQuery = searchQuery || '';

        const filtered = allRows.filter(row => {
            const product = productMap.get(row.sku.toUpperCase());

            const matchesTerm = (term: string) => {
                if (!term) return true;
                const t = term.toLowerCase().trim();
                if (!t) return true;

                if ((row.sku || '').toLowerCase().includes(t)) return true;
                if ((row.eventName || '').toLowerCase().includes(t)) return true;
                if (product && (product.name || '').toLowerCase().includes(t)) return true;
                return false;
            };

            if (currentSearchTags.length > 0) {
                const matchesTag = currentSearchTags.some(tag => matchesTerm(tag));
                const matchesText = currentSearchQuery.trim() ? matchesTerm(currentSearchQuery) : true;
                if (!matchesTag || !matchesText) return false;
            } else if (currentSearchQuery.trim()) {
                if (!matchesTerm(currentSearchQuery)) return false;
            }

            return platformFilter === 'All Platforms' || row.platform === platformFilter;
        });

        const getValue = (row: any, key: string) => {
            if (key === 'startDate' || key === 'endDate') return new Date((row as any)[key]).getTime();
            if (key === 'status') {
                const priority = { 'ACTIVE': 3, 'UPCOMING': 2, 'ENDED': 1 };
                return priority[row.status as keyof typeof priority] || 0;
            }
            return (row as any)[key];
        };
        return sortRows(filtered, sortConfig, getValue);

    }, [allRows, productMap, searchQuery, searchTags, platformFilter, sortConfig]);

    const formatDate = (date: Date) => {
        if (!date || isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const handleExport = () => {
        const headers = ['Platform SKU (Alias)', 'Master SKU', 'Product Name', 'Event Name', 'Platform', 'Promo Price', 'Start Date', 'End Date', 'Status'];

        const csvRows = sortedRows.map(row => {
            const product = productMap.get(row.sku.toUpperCase());
            const escape = (str: string) => `"${String(str || '').replace(/"/g, '""')}"`;

            let platformSku = row.sku;
            if (product) {
                const channel = product.channels.find(c => c.platform.toLowerCase() === row.platform.toLowerCase());
                if (channel && channel.skuAlias) {
                    platformSku = channel.skuAlias;
                }
            }

            return [
                escape(platformSku),
                escape(row.sku),
                escape(product?.name || ''),
                escape(row.eventName),
                escape(row.platform),
                row.promoPrice.toFixed(2),
                row.startDate instanceof Date ? row.startDate.toISOString().split('T')[0] : row.startDate,
                row.endDate instanceof Date ? row.endDate.toISOString().split('T')[0] : row.endDate,
                row.status
            ].join(',');
        });

        const csvContent = [headers.join(','), ...csvRows].join('\n');
        const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `master_promo_log_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-4 bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm">
                <div className="relative flex-1">
                    <TagSearchInput
                        tags={searchTags}
                        onTagsChange={setSearchTags}
                        onInputChange={setSearchQuery}
                        placeholder="Filter by SKU, Name or Event..."
                        themeColor={themeColor}
                    />
                </div>
                <SelectFilter
                    label="Platform"
                    options={Array.from(new Set((promotions || []).filter(Boolean).map(p => p.platform))).sort()}
                    selected={platformFilter === 'All Platforms' ? [] : [platformFilter]}
                    onChange={sel => setPlatformFilter(sel.length === 0 ? 'All Platforms' : sel[0])}
                    singleSelect
                    allLabel="All Platforms"
                    themeColor={themeColor}
                />
                <button
                    onClick={handleExport}
                    className="px-3 h-8 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 shadow-sm flex items-center gap-2 transition-colors"
                >
                    <Download className="w-4 h-4" /> Export CSV
                </button>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                <table className="tbl w-full text-left text-sm whitespace-nowrap">
                    <thead>
                        <tr>
                            <SortableHeader label="SKU" sortKey="sku" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                            <SortableHeader label="Event" sortKey="eventName" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                            <SortableHeader label="Platform" sortKey="platform" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                            <SortableHeader label="Promo Price" sortKey="promoPrice" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader label="Dates" sortKey="startDate" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                            <SortableHeader label="Status" sortKey="status" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                        </tr>
                    </thead>
                    <tbody>
                        {sortedRows.map(row => {
                            const product = productMap.get(row.sku.toUpperCase());
                            return (
                                <tr key={row.id} className="">
                                    <td className="p-4">
                                        <div className="flex items-center">
                                            <div className="font-bold text-gray-700">{row.sku}</div>
                                            <GradeBadge gradeLevel={product?.gradeLevel} />
                                        </div>
                                        {product && <div className="text-[10px] text-gray-500 truncate max-w-[200px] mt-0.5">{product.name}</div>}
                                    </td>
                                    <td className="p-4 text-gray-600">{row.eventName}</td>
                                    <td className="p-4">
                                        <span className="bg-gray-100/80 text-gray-700 px-2 py-1 rounded text-xs font-medium border border-gray-200">{row.platform}</span>
                                    </td>
                                    <td className="p-4 text-right font-black" style={{ color: themeColor }}>{formatSmartMoney(row.promoPrice)}</td>
                                    <td className="p-4 text-gray-500 text-xs">{formatDate(row.startDate)} - {formatDate(row.endDate)}</td>
                                    <td className="p-4"><StatusBadge status={row.status} /></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
