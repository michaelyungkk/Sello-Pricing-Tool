
import React from 'react';
import { SearchResultsPageContainer } from './search/searchResults/SearchResultsPageContainer';
import { Product, PricingRules, SearchConfig, PriceChangeRecord, OptimalPriceResult } from '../types';
import { SearchIntent } from '../services/geminiService';
import { ThresholdConfig } from '../services/thresholdsConfig';

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
  priceHistoryMap: Map<string, any[]>;
  optimalPriceResults?: Map<string, OptimalPriceResult>;
}

const SearchResultsPage: React.FC<SearchResultsPageProps> = (props) => {
  return <SearchResultsPageContainer {...props} />;
};

export default SearchResultsPage;
