
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
  let customDays: number | undefined = undefined;

  const daysMatch = lowerText.match(/last\s+(\d+)\s+days?/);

  if (context.timePreset) {
      selectedTime = context.timePreset as TimePreset;
  } else if (daysMatch) {
      // Arbitrary day support
      customDays = parseInt(daysMatch[1]);
      selectedTime = "LAST_30_DAYS"; // Placeholder, will be overridden by customDays in adapter
  } else if (lowerText.includes('last 7')) {
      selectedTime = "LAST_7_DAYS";
  } else if (lowerText.includes('last 30')) {
      selectedTime = "LAST_30_DAYS";
  } else if (lowerText.includes('last 90')) {
      selectedTime = "LAST_90_DAYS";
  } else if (lowerText.includes('last 180') || lowerText.includes('6 months')) {
      selectedTime = "LAST_180_DAYS";
  } else if (lowerText.includes('this month')) {
      selectedTime = "THIS_MONTH";
  } else if (lowerText.includes('last month')) {
      selectedTime = "LAST_MONTH";
  } else if (lowerText.includes('this year') || lowerText.includes('ytd') || lowerText.includes('year to date')) {
      selectedTime = "THIS_YEAR";
  } else if (lowerText.includes('all time') || lowerText.includes('total history')) {
      selectedTime = "ALL_TIME";
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
    customDays: customDays,
    platforms: resolvedPlatforms,
    filters: [],
    sort: { field: "REVENUE", direction: "DESC" },
    limit: 100, // Increased default from 50 to 100
    viewHint: "SUMMARY_CARDS",
    explain: "Showing overview based on revenue."
  };

  // --- 3. Detect Grouping ---
  if (lowerText.includes('sku') || lowerText.includes('product') || lowerText.includes('item')) {
      plan.groupBy = "SKU";
      plan.viewHint = "TABLE"; // Tables are better for SKU lists
  }

  // --- 4. Detect Text Search Term (The Fix) ---
  // We identify keywords used for logic/commands. Any text NOT matching these is considered a search term.
  const commandKeywords = [
      'tacos', 'ad dependency', 'advertising', 'ad spend', 'ads',
      'profit', 'margin', 'loss', 'negative', 'low', 'high', 'gross', 'net', 'contribution',
      'stock', 'inventory', 'runway', 'cover', 'days', 'remaining', 'overstock', 'stockout', 'risk', 'excess',
      'scale', 'winning', 'best', 'top', 'limit', 'show', 'worst', 'bad', 'drop', 'decline', 'wow', 'trend',
      'return', 'returns', 'refund', 'refunds', 'rate', 'rates', 'rr', // Updated to include plurals
      'sku', 'product', 'item', 'list', 'table',
      'last', 'month', 'year', 'ytd', 'this', 'all time', 'history',
      'amazon', 'ebay', 'range', 'manomano', 'wayfair', 'onbuy', 'groupon', 'tiktok', 'volume', 'sales', 'revenue',
      // EXPANDED KEYWORDS LIST
      'velocity', 'daily', 'candidate', 'average', 'avg', 'ratio', 'percent', 'pct', 
      'per', 'unit', 'qty', 'level', 'aged', 'inbound', 'below', 'target', 'dependency', 
      'strong', 'organic', 'dormant', 'no', 'old', 'long term', 'stale',
      // UPDATED: Include new terms to prevent accidental text filtering
      'share', 'natural', 'change', 'pop', 'growth', 'spike', 'improvement', 'fall', 'down', 'up', 'rise'
  ];

  let potentialSearchTerm = lowerText;
  commandKeywords.forEach(k => {
      // Remove keywords safely
      try {
        potentialSearchTerm = potentialSearchTerm.replace(new RegExp(`\\b${k}\\b`, 'gi'), '');
      } catch(e) {
        potentialSearchTerm = potentialSearchTerm.replace(k, '');
      }
  });
  
  // Clean up numbers often associated with time/limit
  potentialSearchTerm = potentialSearchTerm.replace(/\b\d+\b/g, '').trim();
  // Remove special chars often used in logic but allow hyphens/underscores/spaces for SKUs/Names
  potentialSearchTerm = potentialSearchTerm.replace(/[><=%]/g, '').replace(/\s+/g, ' ').trim();

  // If there is significant text left, apply it as a filter
  if (potentialSearchTerm.length > 2) {
      plan.filters.push({ field: "name", op: "CONTAINS", value: potentialSearchTerm });
      plan.groupBy = "SKU"; // Text search implies specific items, not platform summaries
      plan.viewHint = "TABLE";
      plan.explain = `Searching for "${potentialSearchTerm}".`;
  }

  // --- 5. Detect Intent / Metrics ---
  
  // A) TREND / CHANGE LOGIC (Drop, Decline, Growth, Change, PoP)
  const isNegativeTrend = lowerText.includes('drop') || lowerText.includes('decline') || lowerText.includes('down') || lowerText.includes('fall') || lowerText.includes('loss');
  const isPositiveTrend = lowerText.includes('growth') || lowerText.includes('spike') || lowerText.includes('up') || lowerText.includes('increase') || lowerText.includes('rise');
  const isGeneralTrend = lowerText.includes('trend') || lowerText.includes('change') || lowerText.includes('pop') || lowerText.includes('wow');

  if (isNegativeTrend || isPositiveTrend || isGeneralTrend) {
      
      // A1. Volume / Revenue / Sales / Velocity Trends
      if (lowerText.includes('volume') || lowerText.includes('revenue') || lowerText.includes('sales') || lowerText.includes('velocity')) {
          plan.primaryMetric = "VELOCITY_CHANGE";
          plan.metrics = ["VELOCITY_CHANGE", "REVENUE", "UNITS"];
          plan.viewHint = "RANKED_LIST";
          
          if (isNegativeTrend) {
              plan.sort = { field: "VELOCITY_CHANGE", direction: "ASC" };
              plan.filters.push({ field: "VELOCITY_CHANGE", op: "LT", value: 0 }); 
              if (!plan.explain.includes("Searching")) plan.explain = "Analyzing negative sales trends (Period-over-Period).";
          } else if (isPositiveTrend) {
              plan.sort = { field: "VELOCITY_CHANGE", direction: "DESC" };
              plan.filters.push({ field: "VELOCITY_CHANGE", op: "GT", value: 0 }); 
              if (!plan.explain.includes("Searching")) plan.explain = "Analyzing sales growth (Period-over-Period).";
          } else {
              // Neutral "Change" or "Trend" - Default to seeing big moves (Growth first usually)
              plan.sort = { field: "VELOCITY_CHANGE", direction: "DESC" };
              if (!plan.explain.includes("Searching")) plan.explain = "Analyzing sales velocity trends (Period-over-Period).";
          }
      }
      
      // A2. Margin Trends
      else if (lowerText.includes('margin') || lowerText.includes('profit') || lowerText.includes('contribution')) {
          // KEY FIX: Use MARGIN_CHANGE_PCT instead of NET_MARGIN_PCT for sorting limits
          const metric = lowerText.includes('contribution') ? "CMA_PCT" : "MARGIN_CHANGE_PCT";
          plan.primaryMetric = metric;
          plan.metrics = [metric, "PROFIT", "REVENUE", "NET_MARGIN_PCT"];
          plan.viewHint = "RANKED_LIST";

          if (isNegativeTrend) {
              plan.sort = { field: metric, direction: "ASC" };
              // For margin change, LT 0 means decline
              plan.filters.push({ field: metric, op: "LT", value: 0 }); 
              if (!plan.explain.includes("Searching")) plan.explain = "Highlighting products with declining margins.";
          } else if (isPositiveTrend) {
              plan.sort = { field: metric, direction: "DESC" };
              plan.filters.push({ field: metric, op: "GT", value: 0 });
              if (!plan.explain.includes("Searching")) plan.explain = "Highlighting products with improving margins.";
          } else {
              // General Margin Change/Trend
              plan.sort = { field: metric, direction: "DESC" };
              if (!plan.explain.includes("Searching")) plan.explain = "Analyzing margin trends (Period-over-Period).";
          }
      }
  }

  // B) TACoS / Ad Dependency / Ad Spend
  else if (lowerText.includes('tacos') || lowerText.includes('ad dependency') || lowerText.includes('advertising') || lowerText.includes('ad spend')) {
      plan.primaryMetric = "TACOS_PCT";
      plan.metrics = ["TACOS_PCT", "ADS_SPEND", "REVENUE", "MER"];
      plan.sort = { field: "TACOS_PCT", direction: "DESC" };
      plan.viewHint = "RANKED_LIST"; 
      if (!plan.explain.includes("Searching")) plan.explain = "Analyzing Total Advertising Cost of Sales (TACoS).";

      // Filter: Only show items with valid ad spend activity
      plan.filters.push({ field: "ADS_SPEND", op: "GT", value: 0 });

      // High Dependency Logic
      if (lowerText.includes('high') || lowerText.includes('dependency')) {
          const threshold = lowerText.includes('very high') ? 25 : 15; 
          plan.filters.push({ field: "TACOS_PCT", op: "GTE", value: threshold });
          if (!plan.explain.includes("Searching")) plan.explain = `Showing items with high ad dependency (TACoS >= ${threshold}%).`;
      }
  } 
  // C) Contribution Margin Specific (General)
  else if (lowerText.includes('contribution')) {
      plan.primaryMetric = "CMA_PCT";
      plan.metrics = ["CMA_PCT", "PROFIT", "REVENUE", "UNITS"];
      plan.sort = { field: "CMA_PCT", direction: "DESC" }; // Default to highest contribution
      
      if (lowerText.includes('low') || lowerText.includes('bad') || lowerText.includes('negative')) {
          plan.sort = { field: "CMA_PCT", direction: "ASC" };
          // Active Logic for "Low"
          plan.filters.push({ field: "CMA_PCT", op: "LT", value: 10 });
          if (!plan.explain.includes("Searching")) plan.explain = "Highlighting low contribution margin items.";
      } else {
          if (!plan.explain.includes("Searching")) plan.explain = "Analyzing Contribution Margin.";
      }
  }
  // D) Profit / Margin / Loss (General)
  else if (lowerText.includes('profit') || lowerText.includes('margin') || lowerText.includes('loss')) {
      plan.primaryMetric = "NET_MARGIN_PCT";
      plan.metrics = ["NET_MARGIN_PCT", "PROFIT", "REVENUE", "UNITS"];
      plan.sort = { field: "PROFIT", direction: "DESC" };
      
      if (lowerText.includes('low') || lowerText.includes('negative') || lowerText.includes('loss')) {
          plan.sort = { field: "NET_MARGIN_PCT", direction: "ASC" }; 
          if (lowerText.includes('loss')) {
             plan.filters.push({ field: "NET_MARGIN_PCT", op: "LT", value: 0 });
          } else {
             plan.filters.push({ field: "NET_MARGIN_PCT", op: "LT", value: 10 });
          }
          plan.viewHint = "RANKED_LIST";
          if (!plan.explain.includes("Searching")) plan.explain = "Highlighting profitability issues.";
      } else {
          if (!plan.explain.includes("Searching")) plan.explain = "Analyzing profitability.";
      }
  }
  // E) Aged Stock / Old Stock
  else if (lowerText.includes('aged') || lowerText.includes('old') || lowerText.includes('long term') || lowerText.includes('stale')) {
      plan.primaryMetric = "AGED_STOCK_PCT";
      plan.metrics = ["AGED_STOCK_PCT", "STOCK_LEVEL", "DAILY_VELOCITY", "REVENUE"];
      plan.groupBy = "SKU";
      plan.viewHint = "TABLE";
      plan.sort = { field: "AGED_STOCK_PCT", direction: "DESC" };
      
      if (lowerText.includes('high') || lowerText.includes('risk') || lowerText.includes('heavy') || lowerText.includes('bad')) {
          plan.filters.push({ field: "AGED_STOCK_PCT", op: "GTE", value: 20 });
          if (!plan.explain.includes("Searching")) plan.explain = "Highlighting high aged stock (> 20%).";
      } else {
          // General view, ensure we only show items WITH aged stock
          plan.filters.push({ field: "AGED_STOCK_PCT", op: "GT", value: 0 });
          if (!plan.explain.includes("Searching")) plan.explain = "Analyzing Aged Stock levels.";
      }
  }
  // F) Inventory / Stock / Cover / Runway
  else if (lowerText.includes('stock') || lowerText.includes('inventory') || lowerText.includes('runway') || lowerText.includes('cover')) {
      plan.primaryMetric = "STOCK_COVER_DAYS";
      plan.metrics = ["STOCK_COVER_DAYS", "STOCK_LEVEL", "DAILY_VELOCITY", "REVENUE"];
      plan.groupBy = "SKU";
      plan.viewHint = "TABLE";
      
      if (lowerText.includes('stockout') || lowerText.includes('out of stock') || lowerText.includes('low')) {
          // Explicit OOS Intent
          if (lowerText.includes('out of stock') || (lowerText.includes('stockout') && !lowerText.includes('risk'))) {
              plan.sort = { field: "DAILY_VELOCITY", direction: "DESC" }; 
              plan.filters.push({ field: "STOCK_LEVEL", op: "LTE", value: 0 });
              if (!plan.explain.includes("Searching")) plan.explain = "Showing items currently Out of Stock.";
          } else {
              // Risk / Low Stock Intent
              plan.sort = { field: "STOCK_COVER_DAYS", direction: "ASC" };
              plan.filters.push({ field: "STOCK_COVER_DAYS", op: "LT", value: 14 });
              plan.filters.push({ field: "STOCK_LEVEL", op: "GT", value: 0 });
              if (!plan.explain.includes("Searching")) plan.explain = "Highlighting items at risk of stocking out (< 14 days cover).";
          }
      } else if (lowerText.includes('overstock') || lowerText.includes('excess') || lowerText.includes('high')) {
          plan.sort = { field: "STOCK_COVER_DAYS", direction: "DESC" };
          plan.filters.push({ field: "STOCK_COVER_DAYS", op: "GT", value: 120 });
          if (!plan.explain.includes("Searching")) plan.explain = "Highlighting potential overstock (> 120 days cover).";
      } else {
          // Generic Inventory View
          plan.sort = { field: "STOCK_COVER_DAYS", direction: "ASC" };
          if (!plan.explain.includes("Searching")) plan.explain = "Inventory health overview.";
      }
  }
  // G) Opportunity / Scale / Winning
  else if (lowerText.includes('scale') || lowerText.includes('winning') || lowerText.includes('best') || lowerText.includes('top')) {
      plan.primaryMetric = "PROFIT"; // Focus on contribution
      plan.metrics = ["PROFIT", "REVENUE", "UNITS", "NET_MARGIN_PCT"];
      plan.sort = { field: "PROFIT", direction: "DESC" };
      plan.viewHint = "RANKED_LIST";
      if (!plan.explain.includes("Searching")) plan.explain = "Highlighting top performing products.";
  }
  // H) Returns
  else if (lowerText.includes('return') || lowerText.includes('refund') || lowerText.includes('rr')) {
      plan.primaryMetric = "RETURN_RATE_PCT";
      plan.viewHint = "TABLE";
      plan.sort = { field: "RETURN_RATE_PCT", direction: "DESC" };
      
      // Default Filter Logic: High vs Normal
      const isHigh = lowerText.includes('high');
      const threshold = isHigh ? 10 : 5;
      
      plan.filters.push({ field: "RETURN_RATE_PCT", op: "GT", value: threshold });
      
      if (!plan.explain.includes("Searching")) {
          plan.explain = isHigh 
            ? "Analyzing High Returns (> 10%)." 
            : "Returns analysis (> 5%).";
      }
  }
  // I) Organic / Natural Sales
  else if (lowerText.includes('organic') || lowerText.includes('natural')) {
      plan.primaryMetric = "ORGANIC_SHARE_PCT";
      plan.metrics = ["ORGANIC_SHARE_PCT", "REVENUE", "TACOS_PCT", "ADS_SPEND"];
      plan.sort = { field: "ORGANIC_SHARE_PCT", direction: "DESC" };
      plan.viewHint = "RANKED_LIST";
      
      if (lowerText.includes('strong') || lowerText.includes('high') || lowerText.includes('good')) {
          plan.filters.push({ field: "ORGANIC_SHARE_PCT", op: "GTE", value: 70 });
          if (!plan.explain.includes("Searching")) plan.explain = "Showing products with strong organic sales (> 70% share).";
      } else if (lowerText.includes('low') || lowerText.includes('weak') || lowerText.includes('bad')) {
          plan.sort = { field: "ORGANIC_SHARE_PCT", direction: "ASC" };
          plan.filters.push({ field: "ORGANIC_SHARE_PCT", op: "LT", value: 30 });
          if (!plan.explain.includes("Searching")) plan.explain = "Highlighting products with weak organic share.";
      } else {
          if (!plan.explain.includes("Searching")) plan.explain = "Analyzing Organic Share %.";
      }
  }

  // --- 6. Extract Explicit Limit ---
  const limitMatch = lowerText.match(/(?:top|limit|show)\s+(\d+)/);
  if (limitMatch) {
      plan.limit = parseInt(limitMatch[1]);
  } else if (
      lowerText.includes('all products') || 
      lowerText.includes('all skus') || 
      lowerText.includes('show all') || 
      lowerText.includes('list all') ||
      lowerText.includes('unlimited')
  ) {
      plan.limit = 0; 
      plan.explain = plan.explain.replace('overview', 'complete list');
  }

  // Override view hint if specific structure requested
  if (lowerText.includes('table') || lowerText.includes('list')) {
      plan.viewHint = "TABLE";
  }

  return plan;
}