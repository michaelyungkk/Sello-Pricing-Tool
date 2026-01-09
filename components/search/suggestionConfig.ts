
import { MetricConfig, ConditionConfig, MetricId, ConditionId, PlatformId, Suggestion, ChipSelectionState, TimePresetId } from './types';

// --- A) METRIC DEFINITIONS ---
export const METRICS: MetricConfig[] = [
  // Profit & Value
  { id: "CMA_PCT", label: "Contribution Margin %", group: "Profit", defaultPriority: "RISK", description: "Net margin after Ad Spend" },
  { id: "NET_PROFIT", label: "Net Profit (£)", group: "Profit", defaultPriority: "RISK", description: "True bottom line profit" },
  { id: "PROFIT_PER_UNIT", label: "Profit Per Unit", group: "Profit", defaultPriority: "DECLINE", description: "Unit economics health" },
  
  // Demand
  { id: "SALES_QTY", label: "Sales Qty", group: "Demand", defaultPriority: "OPPORTUNITY", description: "Total units sold" },
  { id: "REVENUE", label: "Revenue", group: "Demand", defaultPriority: "OPPORTUNITY", description: "Gross Sales" },
  { id: "DAILY_VELOCITY", label: "Daily Velocity", group: "Demand", defaultPriority: "INVENTORY", description: "Avg units sold per day" },
  
  // Inventory
  { id: "STOCK_LEVEL", label: "Stock Level", group: "Inventory", defaultPriority: "INVENTORY", description: "Units on hand" },
  { id: "STOCK_COVER_DAYS", label: "Stock Cover (Days)", group: "Inventory", defaultPriority: "RISK", description: "Days until stockout" },
  { id: "AGED_STOCK_PCT", label: "Aged Stock %", group: "Inventory", defaultPriority: "RISK", description: "% of stock older than 90 days" },
  { id: "INBOUND_QTY_30D", label: "Inbound (30d)", group: "Inventory", defaultPriority: "INVENTORY", description: "Stock arriving soon" },
  
  // Health
  { id: "ADS_SPEND_PCT", label: "TACoS %", group: "Health", defaultPriority: "RISK", description: "Total Ad Cost of Sales" },
  { id: "RETURN_RATE_PCT", label: "Return Rate %", group: "Health", defaultPriority: "RISK", description: "Refunds / Sales" },
  { id: "ORGANIC_SHARE_PCT", label: "Organic Share %", group: "Health", defaultPriority: "OPPORTUNITY", description: "100% - TACoS%" },

  // Trends
  { id: "MARGIN_CHANGE_PCT", label: "Margin Trend %", group: "Trend", defaultPriority: "DECLINE", description: "Change in margin vs previous period" },
  { id: "VELOCITY_CHANGE", label: "Velocity Trend %", group: "Trend", defaultPriority: "DECLINE", description: "Change in sales qty vs previous period" },
];

// --- B) CONDITION DEFINITIONS ---
export const CONDITIONS: ConditionConfig[] = [
  // Loss & Risk
  { id: "NEGATIVE_LOSS", label: "Negative / Loss", group: "Risk", defaultPriority: "RISK", description: "Products losing money" },
  { id: "BELOW_TARGET", label: "Below Target", group: "Risk", defaultPriority: "RISK", description: "Underperforming KPIs" },
  { id: "HIGH_AD_DEPENDENCY", label: "High Ad Dependency", group: "Risk", defaultPriority: "RISK", description: "Sales driven mostly by ads" },
  { id: "HIGH_RETURN_RATE", label: "High Returns", group: "Risk", defaultPriority: "RISK", description: "Return rate > 5%" },
  
  // Inventory Risk
  { id: "STOCKOUT_RISK", label: "Stockout Risk", group: "Inventory", defaultPriority: "RISK", description: "Less than 14 days cover" },
  { id: "OVERSTOCK_RISK", label: "Overstock Risk", group: "Inventory", defaultPriority: "INVENTORY", description: "More than 120 days cover" },
  
  // Performance Decline
  { id: "VOLUME_DROP_WOW", label: "Volume Change (PoP)", group: "Decline", defaultPriority: "DECLINE", description: "Sales qty change vs previous period" },
  { id: "REVENUE_DROP_WOW", label: "Revenue Change (PoP)", group: "Decline", defaultPriority: "DECLINE", description: "Revenue change vs previous period" },
  { id: "MARGIN_DROP_WOW", label: "Margin Change (PoP)", group: "Decline", defaultPriority: "DECLINE", description: "Profitability decreasing" },
  
  // Opportunity
  { id: "SCALE_CANDIDATE", label: "Scale Candidate", group: "Opportunity", defaultPriority: "OPPORTUNITY", description: "High margin, high velocity" },
  { id: "STRONG_ORGANIC", label: "Strong Organic", group: "Opportunity", defaultPriority: "OPPORTUNITY", description: "Low ad dependency" },
  
  // Hygiene
  { id: "DORMANT_NO_SALES", label: "Dormant / No Sales", group: "Hygiene", defaultPriority: "HYGIENE", description: "Zero sales in period" },
];

// --- C) PLATFORMS & TIME ---
export const PLATFORMS_LIST: { id: PlatformId; label: string }[] = [
  { id: "AMAZON_UK_FBA", label: "Amazon FBA" },
  { id: "AMAZON_UK_FBM", label: "Amazon FBM" },
  { id: "EBAY", label: "eBay" },
  { id: "THE_RANGE", label: "The Range" },
  { id: "MANOMANO", label: "ManoMano" },
  { id: "WAYFAIR", label: "Wayfair" },
  { id: "ONBUY", label: "OnBuy" },
  { id: "GROUPON_UK", label: "Groupon" }
];

// MAPPING: UI ID -> Actual Data Value (Exact match to priceHistory logs)
export const PLATFORM_MAPPING: Record<string, string> = {
  "AMAZON_UK_FBA": "Amazon(UK) FBA",
  "AMAZON_UK_FBM": "Amazon(UK) FBM",
  "EBAY": "eBay",
  "THE_RANGE": "The Range",
  "MANOMANO": "ManoMano",
  "WAYFAIR": "Wayfair",
  "ONBUY": "Onbuy",
  "GROUPON_UK": "Groupon(UK)"
};

export const TIME_PRESETS_LIST: { id: TimePresetId; label: string }[] = [
  { id: "LAST_7_DAYS", label: "Last 7 Days" },
  { id: "LAST_30_DAYS", label: "Last 30 Days" },
  { id: "LAST_90_DAYS", label: "Last 90 Days" },
  { id: "LAST_180_DAYS", label: "Last 180 Days" },
  { id: "THIS_MONTH", label: "This Month" },
  { id: "THIS_YEAR", label: "This Year (YTD)" },
  { id: "ALL_TIME", label: "All Time" }
];

// --- D) SMART PAIRINGS (Context -> Recommendation) ---
export const SMART_PAIRINGS: Record<MetricId, ConditionId[]> = {
  CMA_PCT: ["NEGATIVE_LOSS", "BELOW_TARGET", "HIGH_AD_DEPENDENCY", "MARGIN_DROP_WOW"],
  NET_PROFIT: ["NEGATIVE_LOSS", "MARGIN_DROP_WOW", "BELOW_TARGET"],
  PROFIT_PER_UNIT: ["BELOW_TARGET", "NEGATIVE_LOSS"],
  SALES_QTY: ["VOLUME_DROP_WOW", "DORMANT_NO_SALES", "SCALE_CANDIDATE"],
  REVENUE: ["REVENUE_DROP_WOW", "SCALE_CANDIDATE", "BELOW_TARGET"],
  DAILY_VELOCITY: ["VELOCITY_DROP_WOW", "SCALE_CANDIDATE", "DORMANT_NO_SALES"],
  STOCK_LEVEL: ["STOCKOUT_RISK", "OVERSTOCK_RISK", "DORMANT_NO_SALES"],
  STOCK_COVER_DAYS: ["STOCKOUT_RISK", "OVERSTOCK_RISK"],
  AGED_STOCK_PCT: ["OVERSTOCK_RISK", "DORMANT_NO_SALES"],
  INBOUND_QTY_30D: ["STOCKOUT_RISK"], 
  ADS_SPEND_PCT: ["HIGH_AD_DEPENDENCY", "NEGATIVE_LOSS", "BELOW_TARGET", "MARGIN_DROP_WOW"],
  RETURN_RATE_PCT: ["HIGH_RETURN_RATE", "NEGATIVE_LOSS"],
  ORGANIC_SHARE_PCT: ["STRONG_ORGANIC", "HIGH_AD_DEPENDENCY"],
  MARGIN_CHANGE_PCT: ["MARGIN_DROP_WOW"],
  VELOCITY_CHANGE: ["VELOCITY_DROP_WOW", "SCALE_CANDIDATE"]
};

// --- E) PLATFORM RULES ---
export const PLATFORM_BOOSTS: Record<PlatformId, ConditionId[]> = {
  AMAZON_UK_FBA: ["HIGH_AD_DEPENDENCY", "BELOW_TARGET", "MARGIN_DROP_WOW", "STOCKOUT_RISK"],
  AMAZON_UK_FBM: ["HIGH_AD_DEPENDENCY", "BELOW_TARGET"],
  EBAY: ["VOLUME_DROP_WOW", "MARGIN_DROP_WOW"],
  THE_RANGE: ["OVERSTOCK_RISK", "DORMANT_NO_SALES"],
  MANOMANO: ["BELOW_TARGET", "HIGH_RETURN_RATE"],
  WAYFAIR: ["OVERSTOCK_RISK"],
  ONBUY: ["DORMANT_NO_SALES"],
  GROUPON_UK: ["DORMANT_NO_SALES"]
};

// --- SHORTCUT LIBRARY ---
// Helper to create shortcut objects easily
const createShortcut = (
  label: string, 
  priority: Suggestion["priority"], 
  applies: Suggestion["applies"]
): Omit<Suggestion, "id" | "score" | "kind"> => ({
  label,
  priority,
  applies
});

export const SHORTCUTS_LIBRARY = [
  // Profit Protection
  createShortcut("Negative Contribution Margin", "RISK", { 
    metrics: ["CMA_PCT"], conditions: ["NEGATIVE_LOSS"] 
  }),
  createShortcut("Profit Bleeders (High Sales, Low Profit)", "RISK", { 
    metrics: ["NET_PROFIT", "SALES_QTY"], conditions: ["NEGATIVE_LOSS"] 
  }),
  createShortcut("High Ad Spend, Low Margin", "RISK", {
    metrics: ["ADS_SPEND_PCT", "CMA_PCT"], conditions: ["HIGH_AD_DEPENDENCY", "BELOW_TARGET"]
  }),

  // Inventory
  createShortcut("Stockout Risk (< 14 Days)", "RISK", {
    metrics: ["STOCK_COVER_DAYS"], conditions: ["STOCKOUT_RISK"]
  }),
  createShortcut("Overstock (> 120 Days) with Inbound", "INVENTORY", {
    metrics: ["STOCK_COVER_DAYS", "INBOUND_QTY_30D"], conditions: ["OVERSTOCK_RISK"]
  }),

  // Scale
  createShortcut("Winning Products (High Margin & Vel)", "OPPORTUNITY", {
    metrics: ["CMA_PCT", "DAILY_VELOCITY"], conditions: ["SCALE_CANDIDATE"]
  }),

  // Cleanup
  createShortcut("Dormant (0 Sales This Month)", "HYGIENE", {
    metrics: ["SALES_QTY"], conditions: ["DORMANT_NO_SALES"], timePreset: "THIS_MONTH"
  }),
  createShortcut("High Returns (> 5%)", "HYGIENE", {
    metrics: ["RETURN_RATE_PCT"], conditions: ["HIGH_RETURN_RATE"]
  })
];
