
import React from 'react';
import { PlatformManagementPageContainer } from './platformManagement/PlatformManagementPageContainer';
import { Product, PricingRules, PriceLog } from '../types';

interface PlatformManagementPageProps {
  products: Product[];
  priceHistoryMap: Map<string, PriceLog[]>;
  pricingRules: PricingRules;
  themeColor: string;
  headerStyle: React.CSSProperties;
}

const PlatformManagementPage: React.FC<PlatformManagementPageProps> = (props) => {
  return <PlatformManagementPageContainer {...props} />;
};

export default PlatformManagementPage;
