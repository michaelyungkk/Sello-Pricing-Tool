
import React from 'react';
import ProductList from '../../ProductList';
import { Product, PricingRules, SkuFamily, PriceLog } from '../../../types';

interface MasterCatalogueTabProps {
    products: Product[];
    skuFamilies: SkuFamily[]; // Added
    onEditAliases?: (product: Product) => void;
    onEditTags?: (product: Product) => void;
    onViewShipments?: (sku: string) => void;
    onViewElasticity?: (product: Product) => void;
    onDeepDive?: (sku: string) => void;
    dateLabels?: { current: string, last: string };
    pricingRules?: PricingRules;
    themeColor: string;
    priceHistoryMap: Map<string, PriceLog[]>;
}

export const MasterCatalogueTab: React.FC<MasterCatalogueTabProps> = (props) => {
    return <ProductList {...props} />;
};
