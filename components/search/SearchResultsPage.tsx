
import React from 'react';
import { SearchResultsPageContainer } from './searchResults/SearchResultsPageContainer';
import { Product, PricingRules, SearchConfig, PriceChangeRecord, OptimalPriceResult, PromotionEvent, NavigationIntent } from '../../types';
import { SearchIntent } from '../../services/searchIntentService';
import { ThresholdConfig } from '../../services/thresholdsConfig';

interface SearchResultsPageProps {
  data: { results: any[], query: string, params: SearchIntent, id?: string };
  products: Product[];
  pricingRules: PricingRules;
  themeColor: string;
  headerStyle: React.CSSProperties;
  timeLabel?: string;
  onRefine: (sessionId: string, newIntent: SearchIntent) => void;
  searchConfig: SearchConfig;
  priceChangeHistory?: PriceChangeRecord[];
  thresholds: ThresholdConfig;
  skuFamilies: any[];
  adGroups: any[];
  promotions: PromotionEvent[];
  priceHistoryMap: Map<string, any[]>;
  optimalPriceResults?: Map<string, OptimalPriceResult>;
  navigateToEntity?: (intent: Omit<NavigationIntent, 'createdAt'>) => void;
}

const SearchResultsPage: React.FC<SearchResultsPageProps> = (props) => {
  return <SearchResultsPageContainer {...props} />;
};

export default SearchResultsPage;
