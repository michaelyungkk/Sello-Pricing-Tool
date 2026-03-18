
import React from 'react';
import { Product, PricingRules, PriceLog, RefundLog, AdGroup, SkuFamily } from '../../types';

export interface PlatformManagementPageProps {
  products: Product[];
  priceHistoryMap: Map<string, PriceLog[]>;
  refundHistory: RefundLog[];
  deductRefunds: boolean;
  setDeductRefunds: (v: boolean) => void;
  pricingRules: PricingRules;
  themeColor: string;
  headerStyle: React.CSSProperties;

  // Ad Groups
  adGroups: AdGroup[];
  skuFamilies: SkuFamily[];
  onSyncFromFamilies: (platform: string) => void;
  onAddAdGroup: (group: AdGroup) => void;
  onEditAdGroup: (group: AdGroup) => void;
  onRemoveAdGroup: (id: string) => void;
  onSaveAdGroups: (groups: AdGroup[]) => { affectedTransactions: number; totalSpreadAmount: number; daysProcessed: number };
  lastRecalculationSummary: { affectedTransactions: number; totalSpreadAmount: number; daysProcessed: number } | null;
}

export type PlatformKey = string;
export type TimeWindow = 'YESTERDAY' | '7D' | '14D' | '30D' | '60D' | 'ALL' | 'CUSTOM';

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

export type Tab = 'overview' | 'roi' | 'performance' | 'ad-groups';

export interface Flag {
  label: string;
  style: string;
  tooltip: string;
}
