
export type MetricId =
  | "CMA_PCT" // Contribution Margin %
  | "NET_PROFIT"
  | "PROFIT_PER_UNIT"
  | "SALES_QTY"
  | "REVENUE"
  | "DAILY_VELOCITY"
  | "STOCK_LEVEL"
  | "STOCK_COVER_DAYS"
  | "AGED_STOCK_PCT"
  | "INBOUND_QTY_30D"
  | "ADS_SPEND_PCT"
  | "RETURN_RATE_PCT"
  | "ORGANIC_SHARE_PCT";

export type ConditionId =
  | "NEGATIVE_LOSS"
  | "BELOW_TARGET"
  | "HIGH_AD_DEPENDENCY"
  | "HIGH_RETURN_RATE"
  | "STOCKOUT_RISK"
  | "OVERSTOCK_RISK"
  | "VOLUME_DROP_WOW"
  | "REVENUE_DROP_WOW"
  | "VELOCITY_DROP_WOW"
  | "MARGIN_DROP_WOW"
  | "SCALE_CANDIDATE"
  | "STRONG_ORGANIC"
  | "DORMANT_NO_SALES";

export type PlatformId =
  | "AMAZON_UK_FBA"
  | "AMAZON_UK_FBM"
  | "EBAY"
  | "THE_RANGE"
  | "MANOMANO"
  | "WAYFAIR"
  | "ONBUY"
  | "GROUPON_UK";

export type TimePresetId =
  | "LAST_7_DAYS"
  | "LAST_30_DAYS"
  | "LAST_90_DAYS"
  | "LAST_180_DAYS"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_YEAR"
  | "ALL_TIME";

export type SuggestionPriority = "RISK" | "DECLINE" | "INVENTORY" | "OPPORTUNITY" | "HYGIENE";

export interface ChipSelectionState {
  metrics: MetricId[];
  conditions: ConditionId[];
  platforms: PlatformId[];
  timePreset: TimePresetId | null;
  searchText: string;
}

export interface Suggestion {
  id: string;
  label: string;
  kind: "metric" | "condition" | "shortcut" | "platform" | "time";
  priority: SuggestionPriority;
  groupLabel?: string;
  description?: string;
  score: number;
  // If this suggestion is clicked, what chips should be added?
  applies?: {
    metrics?: MetricId[];
    conditions?: ConditionId[];
    platforms?: PlatformId[];
    timePreset?: TimePresetId;
  };
}

export interface MetricConfig {
  id: MetricId;
  label: string;
  group: string;
  defaultPriority: SuggestionPriority;
  description: string;
}

export interface ConditionConfig {
  id: ConditionId;
  label: string;
  group: string;
  defaultPriority: SuggestionPriority;
  description: string;
}
