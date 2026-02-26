
import React from 'react';
import { PlatformManagementPageContainer } from './platformManagement/PlatformManagementPageContainer';
import { Product, PricingRules, PriceLog, RefundLog, AdGroup, SkuFamily } from '../types';

interface PlatformManagementPageProps {
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

const PlatformManagementPage: React.FC<PlatformManagementPageProps> = (props) => {
  return <PlatformManagementPageContainer {...props} />;
};

export default PlatformManagementPage;
