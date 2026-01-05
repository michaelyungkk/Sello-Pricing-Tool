
import { QueryPlan, MetricId, TimePreset } from './queryPlan';
import { PLATFORM_MAPPING } from './suggestionConfig';

interface Context {
  selectedPlatforms: string[];
  timePreset?: string; 
}

/**
 * Deterministic rules-based parser to simulate AI intent understanding.
 * This ensures "High Ad Dependency" maps strictly to a TACoS filter.
 */
export function buildQueryPlanFromText(text: string, context: Context): QueryPlan {
  const lowerText = text.toLowerCase();
  
  // 1. Resolve Time: Use Context First, then Text, then Default
  let selectedTime: TimePreset = "LAST_30_DAYS";
  if (context.timePreset) {
      selectedTime = context.timePreset as TimePreset;
  } else if (lowerText.includes('last 7')) {
      selectedTime = "LAST_7_DAYS";
  } else if (lowerText.includes('last 30')) {
      selectedTime = "LAST_30_DAYS";
  } else if (lowerText.includes('this month')) {
      selectedTime = "THIS_MONTH";
  } else if (lowerText.includes('last month')) {
      selectedTime = "LAST_MONTH";
  }

  // 2. Resolve Platforms: Map ID -> Data Name
  let resolvedPlatforms: string[] | undefined = undefined;
  if (context.selectedPlatforms && context.selectedPlatforms.length > 0) {
      resolvedPlatforms = context.selectedPlatforms.map(p => PLATFORM_MAPPING[p] || p);
  }

  // Default Plan Structure
  const plan: QueryPlan = {
    metrics: ["REVENUE", "UNITS", "NET_MARGIN_PCT", "PROFIT"],
    primaryMetric: "REVENUE",
    groupBy: "PLATFORM",
    timePreset: selectedTime,
    platforms: resolvedPlatforms,
    filters: [],
    sort: { field: "REVENUE", direction: "DESC" },
    limit: 50,
    viewHint: "SUMMARY_CARDS",
    explain: "Showing overview based on revenue."
  };

  // --- 3. Detect Grouping ---
  if (lowerText.includes('sku') || lowerText.includes('product') || lowerText.includes('item')) {
      plan.groupBy = "SKU";
      plan.viewHint = "TABLE"; // Tables are better for SKU lists
  }

  // --- 4. Detect Intent / Metrics ---
  
  // A) TACoS / Ad Dependency / Ad Spend
  if (lowerText.includes('tacos') || lowerText.includes('ad dependency') || lowerText.includes('advertising cost') || lowerText.includes('ad spend')) {
      plan.primaryMetric = "TACOS_PCT";
      plan.metrics = ["TACOS_PCT", "ADS_SPEND", "REVENUE", "MER"];
      plan.sort = { field: "TACOS_PCT", direction: "DESC" };
      plan.viewHint = "RANKED_LIST"; // Ranked list is good for identifying "Top Offenders"
      plan.explain = "Analyzing Total Advertising Cost of Sales (TACoS).";

      // Filter: Only show items with valid ad spend activity
      plan.filters.push({ field: "ADS_SPEND", op: "GT", value: 0 });

      // High Dependency Logic
      if (lowerText.includes('high') || lowerText.includes('dependency')) {
          const threshold = lowerText.includes('very high') ? 25 : 15; // Percent values stored as 0-100 in app
          plan.filters.push({ field: "TACOS_PCT", op: "GTE", value: threshold });
          plan.explain = `Showing items with high ad dependency (TACoS >= ${threshold}%).`;
      }
  } 
  // B) Profit / Margin / Loss
  else if (lowerText.includes('profit') || lowerText.includes('margin') || lowerText.includes('loss')) {
      plan.primaryMetric = "NET_MARGIN_PCT";
      plan.metrics = ["NET_MARGIN_PCT", "PROFIT", "REVENUE", "UNITS"];
      plan.sort = { field: "PROFIT", direction: "DESC" };
      
      if (lowerText.includes('low') || lowerText.includes('negative') || lowerText.includes('loss')) {
          plan.filters.push({ field: "NET_MARGIN_PCT", op: "LT", value: 5 }); // Warning threshold
          plan.sort = { field: "NET_MARGIN_PCT", direction: "ASC" }; // Show worst first
          plan.explain = "Highlighting low margin or unprofitable items.";
          plan.viewHint = "RANKED_LIST";
      } else {
          plan.explain = "Analyzing profitability.";
      }
  }
  // C) Inventory / Stock / Cover / Runway
  else if (lowerText.includes('stock') || lowerText.includes('inventory') || lowerText.includes('runway') || lowerText.includes('cover')) {
      plan.primaryMetric = "STOCK_COVER_DAYS";
      plan.metrics = ["STOCK_COVER_DAYS", "STOCK_LEVEL", "DAILY_VELOCITY", "REVENUE"];
      plan.groupBy = "SKU";
      plan.viewHint = "TABLE";
      
      if (lowerText.includes('stockout') || lowerText.includes('out of stock') || lowerText.includes('low')) {
          // Explicit OOS Intent: "Out of stock" OR "Stockout" (without "Risk")
          if (lowerText.includes('out of stock') || (lowerText.includes('stockout') && !lowerText.includes('risk'))) {
              plan.sort = { field: "DAILY_VELOCITY", direction: "DESC" }; // Prioritize high velocity items
              plan.filters.push({ field: "STOCK_LEVEL", op: "LTE", value: 0 });
              plan.explain = "Showing items currently Out of Stock.";
          } else {
              // Risk / Low Stock Intent
              plan.sort = { field: "STOCK_COVER_DAYS", direction: "ASC" };
              // Add default filter for stockout risk (< 14 days)
              plan.filters.push({ field: "STOCK_COVER_DAYS", op: "LT", value: 14 });
              // Important: Exclude 0 stock items from "Risk" view
              plan.filters.push({ field: "STOCK_LEVEL", op: "GT", value: 0 });
              plan.explain = "Highlighting items at risk of stocking out (< 14 days cover), excluding OOS.";
          }
      } else if (lowerText.includes('overstock') || lowerText.includes('excess') || lowerText.includes('high')) {
          plan.sort = { field: "STOCK_COVER_DAYS", direction: "DESC" };
          // Add default filter for overstock (> 120 days)
          plan.filters.push({ field: "STOCK_COVER_DAYS", op: "GT", value: 120 });
          plan.explain = "Highlighting potential overstock (> 120 days cover).";
      } else {
          // Generic Inventory View
          plan.sort = { field: "STOCK_COVER_DAYS", direction: "ASC" };
          plan.explain = "Inventory health overview.";
      }
  }
  // D) Opportunity / Scale / Winning
  else if (lowerText.includes('scale') || lowerText.includes('winning') || lowerText.includes('best') || lowerText.includes('top')) {
      plan.primaryMetric = "PROFIT"; // Focus on contribution
      plan.metrics = ["PROFIT", "REVENUE", "UNITS", "NET_MARGIN_PCT"];
      plan.sort = { field: "PROFIT", direction: "DESC" };
      plan.explain = "Highlighting top performing products.";
      plan.viewHint = "RANKED_LIST";
  }
  // E) Returns
  else if (lowerText.includes('return') || lowerText.includes('refund')) {
      // Assuming a RETURN_RATE_PCT metric might be added later, for now fallback to standard but note logic
      // Note: Current schema doesn't have RETURN_RATE_PCT, defaulting to TABLE view of revenue
      plan.viewHint = "TABLE";
      plan.explain = "Returns analysis (Standard View)";
  }

  // Override view hint if specific structure requested
  if (lowerText.includes('table') || lowerText.includes('list')) {
      plan.viewHint = "TABLE";
  }

  return plan;
}
