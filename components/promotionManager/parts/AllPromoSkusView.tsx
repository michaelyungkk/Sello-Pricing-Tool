
import React, { useState, useMemo } from 'react';
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

const calculateEffectivePrice = (baseline: number, type: string, value: number): number => {
    if (!value && type !== 'PERCENT_OFF') return 0;
    switch (type) {
        case 'PERCENT_OFF': case 'PERCENTAGE': return baseline * (1 - (value / 100));
        case 'FIXED_OFF': return Math.max(0, baseline - value);
        case 'FIXED_PRICE': default: return value;
    }
};

const getBaselineForProduct = (promo: PromotionEvent, product?: Product): number => {
    if (promo.baselineMode === 'MANUAL') return promo.baselineManualPrice || 0;
    if (!product) return 0;
    if (promo.baselineMode === 'CA_PRICE' && product.caPrice) return product.caPrice;
    return (product.currentPrice || 0) * 1.20;
};

export const AllPromoSkusView: React.FC<AllPromoSkusViewProps> = ({ promotions, products, themeColor }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [platformFilter, setPlatformFilter] = useState('All Platforms');
    const [sortConfig, setSortConfig] = useState<SortState<string> | null>({ key: 'startDate', dir: 'asc' });

    const productMap = useMemo(() => { const m = new Map<string, Product>(); (products || []).forEach(p => m.set(p.sku.toUpperCase(), p)); return m; }, [products]);

    const allRows = useMemo(() => {
        const today = getTodayKeyMelbourne(); const rows: any[] = []; const seenKeys = new Set<string>();
        (promotions || []).forEach(promo => {
            if (!promo) return;
            let status: 'UPCOMING' | 'ACTIVE' | 'ENDED' = 'ACTIVE';
            if (promo.startDate > today) status = 'UPCOMING'; else if (promo.endDate < today) status = 'ENDED';
            (promo.items || []).forEach(item => {
                if (!item || !item.sku) return;
                const uniqueKey = `${promo.id}|${item.sku.toUpperCase()}`;
                if (seenKeys.has(uniqueKey)) return; seenKeys.add(uniqueKey);
                const product = productMap.get(item.sku.toUpperCase()); const baseline = getBaselineForProduct(promo, product);
                let computed = promo.promotionScope === 'SHOP' ? calculateEffectivePrice(baseline, promo.shopDiscountType || 'PERCENT_OFF', promo.shopDiscountValue || 0) : calculateEffectivePrice(baseline, item.discountType || 'FIXED_PRICE', item.discountValue || 0);
                const resolved = computed > 0 ? computed : (item.promoPrice > 0 ? item.promoPrice : 0);
                rows.push({ id: uniqueKey, sku: item.sku, eventName: promo.name, platform: promo.platform, promoPrice: resolved, startDate: new Date(promo.startDate), endDate: new Date(promo.endDate), status });
            });
        });
        return rows.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    }, [promotions, productMap]);

    const sortedRows = useMemo(() => {
        const filtered = allRows.filter(row => {
            const product = productMap.get(row.sku.toUpperCase());
            const matchesTerm = (term: string) => { if (!term?.trim()) return true; const t = term.toLowerCase(); return (row.sku||'').toLowerCase().includes(t) || (row.eventName||'').toLowerCase().includes(t) || (product && (product.name||'').toLowerCase().includes(t)); };
            if (searchTags.length > 0) { if (!searchTags.some(tag => matchesTerm(tag)) || (searchQuery.trim() && !matchesTerm(searchQuery))) return false; }
            else if (searchQuery.trim() && !matchesTerm(searchQuery)) return false;
            return platformFilter === 'All Platforms' || row.platform === platformFilter;
        });
        const getValue = (row: any, key: string) => {
            if (key === 'startDate' || key === 'endDate') return new Date(row[key]).getTime();
            if (key === 'status') return ({ 'ACTIVE': 3, 'UPCOMING': 2, 'ENDED': 1 }[row.status as string] || 0);
            return row[key];
        };
        return sortRows(filtered, sortConfig, getValue);
    }, [allRows, productMap, searchQuery, searchTags, platformFilter, sortConfig]);

    const formatDate = (date: Date) => { if (!date || isNaN(date.getTime())) return '-'; return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); };

    const handleExport = () => {
        const headers = ['Platform SKU (Alias)', 'Master SKU', 'Product Name', 'Event Name', 'Platform', 'Promo Price', 'Start Date', 'End Date', 'Status'];
        const csvRows = sortedRows.map(row => {
            const product = productMap.get(row.sku.toUpperCase()); const escape = (s: string) => `"${String(s||'').replace(/"/g,'""')}"`;
            const channel = product?.channels.find((c:any) => c.platform.toLowerCase() === row.platform.toLowerCase());
            const platformSku = channel?.skuAlias || row.sku;
            return [escape(platformSku), escape(row.sku), escape(product?.name||''), escape(row.eventName), escape(row.platform), row.promoPrice.toFixed(2), row.startDate instanceof Date ? row.startDate.toISOString().split('T')[0] : row.startDate, row.endDate instanceof Date ? row.endDate.toISOString().split('T')[0] : row.endDate, row.status].join(',');
        });
        const blob = new Blob(['\uFEFF', [headers.join(','), ...csvRows].join('\n')], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.setAttribute('download', `master_promo_log_${new Date().toISOString().split('T')[0]}.csv`); document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6">
            <div className="sello-glass p-4 rounded-xl flex gap-4">
                <div className="flex-1">
                    <TagSearchInput tags={searchTags} onTagsChange={setSearchTags} onInputChange={setSearchQuery} placeholder="Filter by SKU, Name or Event..." themeColor={themeColor} />
                </div>
                <SelectFilter label="Platform" options={Array.from(new Set((promotions||[]).filter(Boolean).map(p => p.platform))).sort()}
                    selected={platformFilter === 'All Platforms' ? [] : [platformFilter]}
                    onChange={sel => setPlatformFilter(sel.length === 0 ? 'All Platforms' : sel[0])}
                    singleSelect allLabel="All Platforms" themeColor={themeColor} />
                <button onClick={handleExport} style={{ padding: '0 12px', height: 32, fontSize: 11, fontWeight: 700, borderRadius: 8, border: '1px solid var(--glass-divider)', background: '#fff', color: '#374151', display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                    <Download style={{ width: 14, height: 14 }} /> Export CSV
                </button>
            </div>

            <div className="sello-glass rounded-xl overflow-hidden">
                <div className="sello-table-scroll">
                    <table className="sello-table">
                        <thead>
                            <tr>
                                <SortableHeader label="SKU" sortKey="sku" sort={sortConfig} onChange={setSortConfig} />
                                <SortableHeader label="Event" sortKey="eventName" sort={sortConfig} onChange={setSortConfig} />
                                <SortableHeader label="Platform" sortKey="platform" sort={sortConfig} onChange={setSortConfig} />
                                <SortableHeader label="Promo Price" sortKey="promoPrice" sort={sortConfig} onChange={setSortConfig} tint="ca" align="right" />
                                <SortableHeader label="Dates" sortKey="startDate" sort={sortConfig} onChange={setSortConfig} tint="blue" />
                                <SortableHeader label="Status" sortKey="status" sort={sortConfig} onChange={setSortConfig} />
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRows.map(row => {
                                const product = productMap.get(row.sku.toUpperCase());
                                return (
                                    <tr key={row.id}>
                                        <td>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                                <span style={{ fontWeight: 700, fontSize: 12, color: '#374151' }}>{row.sku}</span>
                                                <GradeBadge gradeLevel={product?.gradeLevel} />
                                            </div>
                                            {product && <div style={{ fontSize: 10, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 200, marginTop: 2 }}>{product.name}</div>}
                                        </td>
                                        <td><span style={{ fontSize: 12, color: '#6b7280' }}>{row.eventName}</span></td>
                                        <td>
                                            <span style={{ background: 'rgba(243,244,246,0.8)', color: '#374151', padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 500, border: '1px solid #e5e7eb' }}>{row.platform}</span>
                                        </td>
                                        <td className="r col-ca"><span className="v-ca v-bold">£{row.promoPrice.toFixed(2)}</span></td>
                                        <td className="col-blue"><span style={{ fontSize: 11, color: '#6b7280' }}>{formatDate(row.startDate)} – {formatDate(row.endDate)}</span></td>
                                        <td><StatusBadge status={row.status} /></td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
