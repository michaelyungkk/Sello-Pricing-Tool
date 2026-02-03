
import React from 'react';
import ProductList from '../../ProductList';
import { Product, PricingRules } from '../../../types';

interface MasterCatalogueTabProps {
    products: Product[];
    onEditAliases?: (product: Product) => void;
    onEditTags?: (product: Product) => void;
    onViewShipments?: (sku: string) => void;
    onViewElasticity?: (product: Product) => void;
    onDeepDive?: (sku: string) => void;
    dateLabels?: { current: string, last: string };
    pricingRules?: PricingRules;
    themeColor: string;
}

export const MasterCatalogueTab: React.FC<MasterCatalogueTabProps> = (props) => {
    return <ProductList {...props} />;
};
