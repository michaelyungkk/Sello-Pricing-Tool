
import React, { useState, useMemo } from 'react';
import { Product, PromotionEvent, PromotionItem } from '../../../types';
import { TagSearchInput } from '../../TagSearchInput';
import { ArrowLeft, Check, Minus } from 'lucide-react';

interface ProductSelectorProps {
    products: Product[];
    currentPromo: PromotionEvent;
    onCancel: () => void;
    onConfirm: (items: PromotionItem[]) => void;
    themeColor: string;
}

// Simple local helper to prevent circular dependency issues if not imported from analytics
// In a real app, you might import this from services/promotionAnalytics
const getBaselineForProduct = (promo: PromotionEvent, product?: Product): number => {
    if (promo.baselineMode === 'MANUAL') return promo.baselineManualPrice || 0;
    if (!product) return 0;
    if (promo.baselineMode === 'CA_PRICE' && product.caPrice) return product.caPrice;
    // Fallback: Pre-event average (VAT Inc) - Approximation for selector
    return (product.currentPrice || 0) * 1.20; 
};

export const ProductSelector: React.FC<ProductSelectorProps> = ({ 
    products,
    currentPromo,
    onCancel,
    onConfirm,
    themeColor
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());

    const existingSkuSet = useMemo(() => new Set((currentPromo?.items || []).map(i => i.sku.toUpperCase())), [currentPromo]);

    const filteredProducts = useMemo(() => {
        return (products || []).filter(p => {
            if (!p) return false;
            if (existingSkuSet.has(p.sku.toUpperCase())) return false;
            if ((p.stockLevel || 0) <= 0 && (p.averageDailySales || 0) === 0) return false;
            const matchesTerm = (term: string) => {
                const t = term.toLowerCase();
                return (p.sku || '').toLowerCase().includes(t) || (p.name || '').toLowerCase().includes(t);
            };
            if (searchTags && searchTags.length > 0) return searchTags.some(tag => matchesTerm(tag));
            return matchesTerm(searchQuery);
        });
    }, [products, searchQuery, searchTags, existingSkuSet]);

    const allSelected = filteredProducts.length > 0 && filteredProducts.every(p => selectedSkus.has(p.sku));
    const isIndeterminate = !allSelected && filteredProducts.some(p => selectedSkus.has(p.sku));

    const toggleSelectAll = () => {
        const newSet = new Set(selectedSkus);
        if (allSelected) {
            filteredProducts.forEach(p => newSet.delete(p.sku));
        } else {
            filteredProducts.forEach(p => newSet.add(p.sku));
        }
        setSelectedSkus(newSet);
    };

    const handleRowClick = (sku: string) => {
        const newSet = new Set(selectedSkus);
        if (newSet.has(sku)) newSet.delete(sku);
        else newSet.add(sku);
        setSelectedSkus(newSet);
    };

    const handleConfirm = () => {
        const items = Array.from(selectedSkus).map(sku => {
            const product = (products || []).find(p => p.sku === sku);
            const basePrice = getBaselineForProduct(currentPromo, product);
            return {
                sku,
                basePrice: Number(basePrice.toFixed(2)),
                discountType: 'FIXED_PRICE',
                discountValue: 0,
                promoPrice: 0
            } as PromotionItem;
        });
        onConfirm(items);
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5" /></button>
                    <h2 className="text-xl font-bold text-gray-900">Nominate SKUs for {currentPromo?.name || 'Campaign'}</h2>
                </div>
                <button 
                    onClick={handleConfirm} 
                    disabled={selectedSkus.size === 0}
                    className="px-6 py-2 text-white rounded-lg font-bold shadow-md hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: themeColor }}
                >
                    Add {selectedSkus.size} SKUs
                </button>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <TagSearchInput 
                    tags={searchTags}
                    onTagsChange={setSearchTags}
                    onInputChange={setSearchQuery}
                    placeholder="Search SKU or Name..."
                    themeColor={themeColor}
                />
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 font-bold border-b border-gray-200 text-gray-500 uppercase text-[10px] tracking-wider sticky top-0 z-10">
                        <tr>
                            <th className="p-4 w-10">
                                <div 
                                    className={`w-5 h-5 rounded border flex items-center justify-center cursor-pointer transition-all ${allSelected || isIndeterminate ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'}`}
                                    onClick={toggleSelectAll}
                                >
                                    {allSelected && <Check className="w-3.5 h-3.5 text-white" />}
                                    {isIndeterminate && <Minus className="w-3.5 h-3.5 text-white" />}
                                </div>
                            </th>
                            <th className="p-4">SKU / Title</th>
                            <th className="p-4 text-right">CA Price</th>
                            <th className="p-4 text-right">Current Stock</th>
                            <th className="p-4 text-right">Daily Vel.</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredProducts.map(p => (
                            <tr 
                                key={p.sku} 
                                className={`group hover:bg-gray-50 cursor-pointer ${selectedSkus.has(p.sku) ? 'bg-indigo-50/30' : ''}`}
                                onClick={() => handleRowClick(p.sku)}
                            >
                                <td className="p-4">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${selectedSkus.has(p.sku) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'}`}>
                                        {selectedSkus.has(p.sku) && <Check className="w-3.5 h-3.5 text-white" />}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="font-bold text-gray-900">{p.sku}</div>
                                    <div className="text-xs text-gray-500 truncate max-w-[300px]">{p.name}</div>
                                </td>
                                <td className="p-4 text-right font-mono text-indigo-600 font-bold">£{p.caPrice?.toFixed(2) || '0.00'}</td>
                                <td className="p-4 text-right text-gray-500 font-mono">{p.stockLevel}</td>
                                <td className="p-4 text-right text-gray-500 font-mono">{(p.averageDailySales || 0).toFixed(1)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};
