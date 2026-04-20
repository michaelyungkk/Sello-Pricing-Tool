
import React from 'react';
import { PromotionEvent, PricingRules, InventoryTemplate, PriceCheckTemplate, Product } from '../../types';

export interface ERPCrossCheckToolProps {
    salesHistory: import('../../types').PriceLog[];
    refundHistory: import('../../types').RefundLog[];
    pricingRules: import('../../types').PricingRules;
    products: Product[];
    learnedAliases: Record<string, string>;
    themeColor: string;
}

export interface ToolboxPageProps {
    promotions: PromotionEvent[];
    pricingRules: PricingRules;
    inventoryTemplates: InventoryTemplate[]; // From App State
    onSaveTemplates: (templates: InventoryTemplate[]) => void; // To App State
    learnedAliases: Record<string, string>;
    onSaveLearnedAliases: (aliases: Record<string, string>) => void; // Persist manual SKU matches
    products?: Product[]; // Added to access alias map
    themeColor: string;
    headerStyle: React.CSSProperties;
    salesHistory: import('../../types').PriceLog[];
    refundHistory: import('../../types').RefundLog[];
    priceCheckTemplates: PriceCheckTemplate[];
    onSavePriceCheckTemplates: (templates: PriceCheckTemplate[]) => void;
    freightRates?: import('../../types').FreightRate[];
    onDescriptionImport?: (data: { sku: string; description: string }[]) => void;
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
    platformSku?: string; // New: The specific alias for the target platform
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
    learnedAliases: Record<string, string>;
    onSaveLearnedAliases: (aliases: Record<string, string>) => void;
    themeColor: string;
    pricingRules: PricingRules;
    products?: Product[];
}

export interface PriceCheckToolProps {
    products: Product[];
    learnedAliases: Record<string, string>;
    pricingRules: PricingRules;
    priceCheckTemplates: PriceCheckTemplate[];
    onSaveTemplates: (templates: PriceCheckTemplate[]) => void;
}
