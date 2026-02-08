
import React from 'react';
import { PlatformManagementPageContainer } from './platformManagement/PlatformManagementPageContainer';
import { Product, PricingRules, PriceLog, RefundLog } from '../types';

interface PlatformManagementPageProps {
  products: Product[];
  priceHistoryMap: Map<string, PriceLog[]>;
  refundHistory: RefundLog[];
  deductRefunds: boolean;
  setDeductRefunds: (v: boolean) => void;
  pricingRules: PricingRules;
  themeColor: string;
  headerStyle: React.CSSProperties;
}

const PlatformManagementPage: React.FC<PlatformManagementPageProps> = (props) => {
  return <PlatformManagementPageContainer {...props} />;
};

export default PlatformManagementPage;
