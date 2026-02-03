
import React from 'react';
import { AllPromoSkusView } from '../parts/AllPromoSkusView';
import { PromotionEvent, Product } from '../../../types';

interface MasterPromoLogTabProps {
  promotions: PromotionEvent[];
  products: Product[];
  themeColor: string;
}

export const MasterPromoLogTab: React.FC<MasterPromoLogTabProps> = (props) => {
  return <AllPromoSkusView {...props} />;
};
