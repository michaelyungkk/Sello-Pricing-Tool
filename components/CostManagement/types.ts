
import React from 'react';
import { Product, SkuCostDetail } from '../../types';

export interface CostManagementPageProps {
    products: Product[];
    themeColor: string;
    headerStyle: React.CSSProperties;
}

export type SortKey = keyof SkuCostDetail | 'sku' | 'caPrice';

export type ViewMode = 'ABSOLUTE' | 'PER_UNIT';
