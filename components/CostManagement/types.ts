
import React from 'react';
import { Product, SkuCostDetail } from '../../types';

export interface CostManagementPageProps {
    products: Product[];
    themeColor: string;
    headerStyle: React.CSSProperties;
}

export type SortKey = keyof SkuCostDetail | 'sku' | 'caPrice';

export type ViewMode = 'ABSOLUTE' | 'PER_UNIT';

export interface CostSummarySectionProps {
    themeColor: string;
    headerStyle: React.CSSProperties;
    includeVat: boolean;
    setIncludeVat: (v: boolean) => void;
    showPercentPrimary: boolean;
    setShowPercentPrimary: (v: boolean) => void;
    viewMode: ViewMode;
    setViewMode: (v: any) => void;
    searchTags: string[];
    setSearchTags: (t: string[]) => void;
    setSearch: (s: string) => void;
    setCurrentPage: (p: number) => void;
    showInactive: boolean;
    setShowInactive: (v: boolean) => void;
    onExport: () => void;
}
