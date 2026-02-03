
import React from 'react';
import { Product, PricingRules, PriceLog } from '../../types';

export interface PlatformManagementPageProps {
  products: Product[];
  priceHistoryMap: Map<string, PriceLog[]>;
  pricingRules: PricingRules;
  themeColor: string;
  headerStyle: React.CSSProperties;
}

export type PlatformKey = string;
export type TimeWindow = '7D' | '14D' | '30D' | '60D' | 'ALL' | 'CUSTOM';

export interface PlatformSummary {
  platform: PlatformKey;
  revenue: number;
  profit: number; // Gross
  netProfit: number; // Net After Ads
  orders: number;
  units: number;
  adSpend: number;
  marginPct: number;
  tacosPct: number | null;
  skuCount: number;
  hasAdData: boolean;
}

export interface PlatformFeesRoi {
  platform: string;
  revenue: number;
  profit: number;
  marginPct: number | null;
  adSpend: number;
  tacosPct: number | null;
  orders: number;
  units: number;
  estMarketplaceFees?: number;
  netAfterAds?: number;
  roiAfterAds?: number | null;
  dataQuality: {
    hasAdData: boolean;
    hasProfit: boolean;
    profitIsEstimated: boolean;
  };
}

export type PlatformSortKey = keyof PlatformSummary | keyof PlatformFeesRoi | 'manager' | 'name' | 'skus' | 'margin' | 'velocity';

export type Tab = 'overview' | 'roi' | 'performance';

export interface Flag {
    label: string;
    style: string;
    tooltip: string;
}
