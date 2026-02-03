
import React from 'react';
import { PromotionEvent, PricingRules, InventoryTemplate, Product } from '../../types';

export interface ToolboxPageProps {
    promotions: PromotionEvent[];
    pricingRules: PricingRules;
    inventoryTemplates: InventoryTemplate[]; // From App State
    onSaveTemplates: (templates: InventoryTemplate[]) => void; // To App State
    products?: Product[]; // Added to access alias map
    themeColor: string;
    headerStyle: React.CSSProperties;
}

export interface UploadedItem {
    sku: string;
    price: number;
}

export interface ProcessedResult extends UploadedItem {
    status: 'On Promotion' | 'Safe to Update' | 'Skipped';
    promoName?: string;
    masterSku?: string; // Debug info
    matchedVia?: string; // Debug info
}

export interface PromoCheckerToolProps {
    promotions: PromotionEvent[];
    pricingRules: PricingRules;
    products: Product[];
    themeColor: string;
}

export interface InventorySyncToolProps {
    templates: InventoryTemplate[];
    onSaveTemplates: (t: InventoryTemplate[]) => void;
    themeColor: string;
    pricingRules: PricingRules;
}
