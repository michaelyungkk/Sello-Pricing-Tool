
import React, { useState, useMemo } from 'react';
import { PromotionDashboard } from '../parts/PromotionDashboard';
import { EventDetailView } from '../parts/EventDetailView';
import { ProductSelector } from '../parts/ProductSelector';
import { PromotionEvent, Product, PricingRules, PriceLog, PriceChangeRecord, PromotionItem } from '../../../types';

type ViewMode = 'dashboard' | 'event_detail' | 'add_products';

interface CampaignsTabProps {
    promotions: PromotionEvent[];
    pricingRules: PricingRules;
    onAddPromotion: (promo: PromotionEvent) => void;
    onUpdatePromotion: (promo: PromotionEvent) => void;
    onDeletePromotion: (id: string) => void;
    products: Product[];
    priceHistoryMap: Map<string, PriceLog[]>;
    priceChangeHistory?: PriceChangeRecord[];
    themeColor: string;
}

export const CampaignsTab: React.FC<CampaignsTabProps> = ({
    promotions,
    pricingRules,
    onAddPromotion,
    onUpdatePromotion,
    onDeletePromotion,
    products,
    priceHistoryMap,
    priceChangeHistory,
    themeColor
}) => {
    const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
    const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);

    const selectedPromo = useMemo(() =>
        (promotions || []).find(p => p && p.id === selectedPromoId),
        [promotions, selectedPromoId]);

    const handleCreateEvent = (newEvent: PromotionEvent) => {
        onAddPromotion(newEvent);
        setSelectedPromoId(newEvent.id);
        setViewMode('event_detail');
    };

    const handleUpdateEventMeta = (id: string, updates: Partial<PromotionEvent>) => {
        const promo = (promotions || []).find(p => p && p.id === id);
        if (!promo) return;
        onUpdatePromotion({ ...promo, ...updates });
    };

    const handleUpdateItem = (sku: string, updates: Partial<PromotionItem>) => {
        if (!selectedPromo) return;
        const updatedItems = (selectedPromo.items || []).map(i => {
            if (i && i.sku.toUpperCase() === sku.toUpperCase()) {
                const product = (products || []).find(p => p && p.sku.toUpperCase() === sku.toUpperCase());
                
                // Helper needed again...
                const getBaselineForProduct = (promo: PromotionEvent, p?: Product): number => {
                    if (promo.baselineMode === 'MANUAL') return promo.baselineManualPrice || 0;
                    if (!p) return 0;
                    if (promo.baselineMode === 'CA_PRICE' && p.caPrice) return p.caPrice;
                    return (p.currentPrice || 0) * 1.20;
                };

                const deriveDiscountedPrice = (base: number, type: string, val: number) => {
                    if (!val && type !== 'PERCENT_OFF') return 0;
                     switch (type) {
                        case 'PERCENT_OFF': return base * (1 - (val / 100));
                        case 'FIXED_OFF': return Math.max(0, base - val);
                        case 'FIXED_PRICE': return val;
                        default: return val;
                    }
                }

                const newItem = { ...i, ...updates };
                const baseline = getBaselineForProduct(selectedPromo, product);
                newItem.promoPrice = deriveDiscountedPrice(baseline, newItem.discountType || 'FIXED_PRICE', newItem.discountValue || 0);
                return newItem;
            }
            return i;
        });
        onUpdatePromotion({ ...selectedPromo, items: updatedItems });
    };

    const handleDeleteItem = (sku: string) => {
        if (!selectedPromo) return;
        const updatedItems = (selectedPromo.items || []).filter(i => i && i.sku.toUpperCase() !== sku.toUpperCase());
        onUpdatePromotion({ ...selectedPromo, items: updatedItems });
    };

    const handleNominateItems = (newItems: PromotionItem[]) => {
        if (!selectedPromo) return;
        onUpdatePromotion({
            ...selectedPromo,
            items: [...(selectedPromo.items || []), ...newItems]
        });
        setViewMode('event_detail');
    };

    if (viewMode === 'dashboard') {
        return (
            <PromotionDashboard 
                promotions={promotions} 
                pricingRules={pricingRules}
                onSelectPromo={(id: string) => { setSelectedPromoId(id); setViewMode('event_detail'); }} 
                onCreateEvent={handleCreateEvent}
                onDeletePromo={onDeletePromotion} 
                themeColor={themeColor}
                products={products}
                priceHistoryMap={priceHistoryMap}
                priceChangeHistory={priceChangeHistory}
                onUpdatePromo={onUpdatePromotion}
            />
        );
    }

    if (viewMode === 'event_detail' && selectedPromo) {
        return (
            <EventDetailView 
                promo={selectedPromo}
                allPromotions={promotions} // Pass full history
                products={products}
                priceHistoryMap={priceHistoryMap || new Map()}
                priceChangeHistory={priceChangeHistory}
                onBack={() => setViewMode('dashboard')}
                onAddProducts={() => setViewMode('add_products')}
                onDeleteItem={handleDeleteItem}
                onUpdateItem={handleUpdateItem}
                onUpdateMeta={(updates: Partial<PromotionEvent>) => handleUpdateEventMeta(selectedPromo.id, updates)}
                themeColor={themeColor}
            />
        );
    }

    if (viewMode === 'add_products' && selectedPromo) {
        return (
            <ProductSelector
                products={products}
                currentPromo={selectedPromo}
                onCancel={() => setViewMode('event_detail')}
                onConfirm={handleNominateItems}
                themeColor={themeColor}
            />
        );
    }

    return null;
};
