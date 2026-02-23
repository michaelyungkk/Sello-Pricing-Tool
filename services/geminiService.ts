

import { Product, AnalysisResult, PlatformConfig } from "../types";
import { buildQueryPlanFromText } from "../components/search/aiParser";
import { QueryPlan } from "../components/search/queryPlan";
import { ThresholdConfig, DEFAULT_THRESHOLDS } from "../services/thresholdsConfig";
import { VAT_MULTIPLIER } from "../constants";

/**
 * Placeholder for price adjustment analysis.
 * The AI-driven analysis has been removed as requested.
 */
export const analyzePriceAdjustment = async (product: Product, _platformRule: PlatformConfig, _context?: string, _thresholds: ThresholdConfig = DEFAULT_THRESHOLDS): Promise<AnalysisResult> => {
  const currentPriceWithVat = (product.currentPrice || 0) * VAT_MULTIPLIER;
  const velocity = product.averageDailySales || 0.1;
  const stock = product.stockLevel;
  const daysRemaining = stock / velocity;

  // Simple deterministic logic as a placeholder
  return {
    productId: product.id,
    recommendedPrice: currentPriceWithVat,
    percentageChange: 0,
    daysRemaining: Math.floor(daysRemaining),
    status: daysRemaining < 14 ? 'Critical' : 'Healthy',
    reasoning: "Analysis functionality has been disabled. This is a placeholder result based on current stock cover."
  };
};

// --- SEARCH PARSER ---

export interface SearchIntent {
  targetData: 'inventory' | 'transactions' | 'refunds';
  filters: Array<{
    field: string;
    operator: '>' | '<' | '>=' | '<=' | '=' | 'CONTAINS';
    value: string | number;
    label?: string; // Friendly label for UI
  }>;
  sort?: {
    field: string;
    direction: 'asc' | 'desc';
  };
  limit?: number; 
  timeRange?: {
    type: 'relative' | 'absolute';
    value: string; // '30d' or ISO string
  };
  explanation?: string;
  primaryMetric?: string;
}

/**
 * Adapter: QueryPlan -> SearchIntent
 * Converts the new high-level Query Plan into the legacy SearchIntent format
 * expected by the SearchResultsPage engine.
 */
function adaptPlanToIntent(plan: QueryPlan): SearchIntent {
    let targetData: 'inventory' | 'transactions' | 'refunds' = 'transactions';
    
    // 1. Determine Target Data
    if (plan.primaryMetric === 'STOCK_LEVEL' || plan.primaryMetric === 'STOCK_COVER_DAYS' || plan.primaryMetric === 'AGED_STOCK_PCT') {
        targetData = 'inventory';
    } else if (plan.primaryMetric === 'RETURN_RATE_PCT') {
        // While returns are conceptually "refunds", often we want transaction data with return rate context
        targetData = 'transactions';
    }

    // 2. Map Filters
    const filters = plan.filters.map(f => {
        let op: any = '=';
        if (f.op === 'GT') op = '>';
        if (f.op === 'LT') op = '<';
        if (f.op === 'GTE') op = '>=';
        if (f.op === 'LTE') op = '<=';
        if (f.op === 'CONTAINS') op = 'CONTAINS';
        
        // Map Field Names if needed (Plan ID -> Data Field)
        let field = f.field;
        if (field === 'NET_MARGIN_PCT') field = 'margin';
        if (field === 'CMA_PCT') field = 'margin'; 
        if (field === 'TACOS_PCT') field = 'tacos';
        if (field === 'ADS_SPEND') field = 'adsSpend';
        if (field === 'SALES_QTY') field = 'velocity';
        if (field === 'REVENUE') field = 'revenue';
        if (field === 'NET_PROFIT') field = 'profit';
        if (field === 'STOCK_COVER_DAYS') field = 'daysRemaining';
        if (field === 'STOCK_LEVEL') field = 'stockLevel';
        // Add velocity change mapping
        if (field === 'VELOCITY_CHANGE') field = 'velocityChange';
        if (field === 'MARGIN_CHANGE_PCT') field = 'MARGIN_CHANGE_PCT'; // Keep special key
        if (field === 'RETURN_RATE_PCT') field = 'periodReturnRate'; // Map filter to dynamic period rate
        if (field === 'ORGANIC_SHARE_PCT') field = 'organicShare'; // Map filter to organic share
        if (field === 'AGED_STOCK_PCT') field = 'agedStockPct'; // Map filter to aged stock
        
        return {
            field,
            operator: op,
            value: f.value
        };
    });

    // 3. Map Time
    // Updated to support extended range logic
    let timeValue = '30d'; // Default
    
    if (plan.customDays) {
        timeValue = `${plan.customDays}d`;
    } else if (plan.timePreset === 'LAST_7_DAYS') {
        timeValue = '7d';
    } else if (plan.timePreset === 'LAST_MONTH') {
        timeValue = '60d'; // Approx
    } else if (plan.timePreset === 'LAST_90_DAYS') {
        timeValue = '90d';
    } else if (plan.timePreset === 'LAST_180_DAYS') {
        timeValue = '180d';
    } else if (plan.timePreset === 'ALL_TIME') {
        timeValue = '3650d'; 
    } else if (plan.timePreset === 'THIS_YEAR') {
        const now = new Date();
        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const diffTime = Math.abs(now.getTime() - startOfYear.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
        timeValue = `${diffDays}d`;
    }

    // 4. Map Sort
    let sortField = plan.sort.field.toLowerCase();
    if (sortField === 'revenue') sortField = 'revenue';
    if (sortField === 'net_margin_pct') sortField = 'margin';
    if (sortField === 'cma_pct') sortField = 'margin';
    if (sortField === 'tacos_pct') sortField = 'tacos';
    if (sortField === 'stock_cover_days') sortField = 'daysRemaining';
    if (sortField === 'daily_velocity') sortField = 'averageDailySales';
    if (sortField === 'velocity_change') sortField = 'velocityChange';
    if (sortField === 'margin_change_pct') sortField = 'MARGIN_CHANGE_PCT'; // Correct mapping for execution engine
    if (sortField === 'return_rate_pct') sortField = 'periodReturnRate';
    if (sortField === 'organic_share_pct') sortField = 'organicShare';
    if (sortField === 'aged_stock_pct') sortField = 'agedStockPct';
    
    return {
        targetData,
        filters,
        sort: {
            field: sortField,
            direction: plan.sort.direction.toLowerCase() as 'asc' | 'desc'
        },
        limit: plan.limit,
        timeRange: { type: 'relative', value: timeValue },
        explanation: plan.explain,
        primaryMetric: plan.primaryMetric
    };
}

/**
 * Local Search Parser
 * Uses the deterministic `aiParser` logic to build a structured query plan,
 * then adapts it to the existing `SearchIntent` format.
 */
export const parseSearchQuery = async (query: string): Promise<SearchIntent> => {
  // Simulate minor network delay for UX consistency
  await new Promise(resolve => setTimeout(resolve, 150));

  // --- DEEP DIVE INTERCEPT ---
  if (query.trim().toUpperCase().startsWith('SKU:')) {
      const sku = query.trim().substring(4).trim();
      return {
          targetData: 'inventory',
          filters: [{ field: 'sku', operator: '=', value: sku }],
          primaryMetric: 'DEEP_DIVE',
          limit: 1,
          explanation: 'SKU Deep Dive Analysis'
      };
  }

  // Extract Context from Query String
  const context = {
      selectedPlatforms: [], 
      timePreset: undefined
  };

  try {
      const plan = buildQueryPlanFromText(query, context);
      return adaptPlanToIntent(plan);
  } catch (e) {
      console.warn("AI Parser failed, falling back to legacy heuristics", e);
      return legacyParseSearchQuery(query);
  }
};

/**
 * Legacy Parser (Backup)
 * Kept for stability if specific edge cases fail in the new parser.
 */
const legacyParseSearchQuery = (query: string): SearchIntent => {
  const lower = query.toLowerCase().trim();
  const intent: SearchIntent = {
    targetData: 'inventory', // Default context
    filters: [],
    limit: 50,
    explanation: 'Legacy Rule-Based Search'
  };

  // ... (Preserve the exact legacy logic from previous version for fallback)
  // --- 1. DETERMINE DATA SOURCE ---
  if (lower.includes('return') || lower.includes('refund')) {
    intent.targetData = 'refunds';
    intent.explanation = "Searching Refunds database.";
  } else if (
    lower.includes('sold') || lower.includes('sales') || lower.includes('revenue') ||
    lower.includes('profit') || lower.includes('margin') || lower.includes('ads') ||
    lower.includes('spend') || lower.includes('tacos') || lower.includes('history') ||
    lower.includes('transaction')
  ) {
    intent.targetData = 'transactions';
    intent.explanation = "Searching Sales Transaction history.";
  }

  // --- 2. EXTRACT LIMIT ---
  const limitMatch = lower.match(/(?:top|limit)\s+(\d+)/);
  if (limitMatch) {
    intent.limit = parseInt(limitMatch[1]);
  }

  // --- 3. EXTRACT TIME RANGE ---
  const daysMatch = lower.match(/last\s+(\d+)\s+days?/);
  if (daysMatch) {
    intent.timeRange = { type: 'relative', value: `${daysMatch[1]}d` };
  } else if (lower.includes('yesterday')) {
    intent.timeRange = { type: 'relative', value: '1d' };
  } else if (lower.includes('month')) {
    intent.timeRange = { type: 'relative', value: '30d' };
  }

  // --- 4. APPLY BUSINESS LOGIC FILTERS ---
  // Explicit "Out of Stock" (stock <= 0)
  if (lower.includes('out of stock') || (lower.includes('stockout') && !lower.includes('risk'))) {
    intent.targetData = 'inventory';
    intent.filters.push({ field: 'stockLevel', operator: '<=', value: 0, label: 'Out of Stock' });
    intent.sort = { field: 'averageDailySales', direction: 'desc' }; 
    intent.explanation = "Filtering for Out of Stock items.";
  } 
  // "Risk" implies low stock but NOT dead stock
  else if (lower.includes('low stock') || lower.includes('risk') || lower.includes('stockout')) {
    intent.targetData = 'inventory';
    intent.filters.push({ field: 'daysRemaining', operator: '<', value: 14, label: 'Low Stock Risk' });
    intent.filters.push({ field: 'stockLevel', operator: '>', value: 0, label: 'In Stock' }); // Exclude 0
    intent.sort = { field: 'daysRemaining', direction: 'asc' };
    intent.explanation = "Filtering for Low Stock Risk (< 14 days, excluding OOS).";
  } else if (lower.includes('overstock')) {
    intent.targetData = 'inventory';
    intent.filters.push({ field: 'daysRemaining', operator: '>', value: 120, label: 'Overstock' });
    intent.sort = { field: 'daysRemaining', direction: 'desc' };
    intent.explanation = "Filtering for Overstock (> 120 days).";
  } else if (lower.includes('dormant') || lower.includes('dead')) {
    intent.targetData = 'inventory';
    intent.filters.push({ field: 'averageDailySales', operator: '=', value: 0, label: 'Zero Velocity' });
    intent.filters.push({ field: 'stockLevel', operator: '>', value: 0, label: 'Has Stock' });
    intent.explanation = "Filtering for Dead Stock (Stock > 0 but Velocity = 0).";
  }

  if (lower.includes('loss') || lower.includes('negative')) {
    intent.targetData = 'transactions';
    intent.filters.push({ field: 'margin', operator: '<', value: 0, label: 'Unprofitable' });
    intent.sort = { field: 'margin', direction: 'asc' };
    intent.explanation = "Filtering for Unprofitable items.";
  } else if (lower.includes('high ad') || lower.includes('high tacos') || lower.includes('dependency')) {
    intent.targetData = 'transactions';
    intent.filters.push({ field: 'tacos', operator: '>', value: 15, label: 'High Ad Dependency' });
    intent.sort = { field: 'tacos', direction: 'desc' };
    intent.explanation = "Filtering for High Ad Dependency (TACoS > 15%).";
  }

  // --- 5. SORTING HINTS ---
  if (!intent.sort) {
    if (lower.includes('best') || lower.includes('top') || lower.includes('highest')) {
      if (lower.includes('margin')) intent.sort = { field: 'margin', direction: 'desc' };
      else if (lower.includes('profit')) intent.sort = { field: 'profit', direction: 'desc' };
      else if (lower.includes('velocity') || lower.includes('sales')) intent.sort = { field: 'velocity', direction: 'desc' };
      else intent.sort = { field: 'revenue', direction: 'desc' };
    } else if (lower.includes('worst') || lower.includes('lowest')) {
      if (lower.includes('margin')) intent.sort = { field: 'margin', direction: 'asc' };
      else intent.sort = { field: 'margin', direction: 'asc' };
    }
  }

  // --- 6. PLATFORM FILTER ---
  const platforms = ['amazon', 'ebay', 'wayfair', 'range', 'manomano', 'onbuy', 'groupon', 'tiktok', 'wowcher', 'kaufland', 'tesco', 'debenhams'];
  platforms.forEach(p => {
    if (lower.includes(p)) {
      intent.filters.push({ field: 'platform', operator: 'CONTAINS', value: p, label: `Platform: ${p}` });
    }
  });

  // --- 7. TEXT MATCHING ---
  const hasLogicFilters = intent.filters.some(f => f.field !== 'platform');
  if (!hasLogicFilters) {
      const keywords = [
          ...platforms, 
          'return', 'refund', 'sales', 'revenue', 'profit', 'margin', 'ads', 'spend', 'tacos', 'history', 
          'top', 'limit', 'stock', 'inventory', 'runway', 'velocity', 'sku', 'product', 'days', 'last', 
          'low', 'high', 'overstock', 'loss', 'negative', 'best', 'worst', 'lowest', 'highest', 'dead', 'dormant', 'risk',
          'cover',
          // UPDATED KEYWORDS FOR ROBUSTNESS
          'velocity', 'daily', 'candidate', 'average', 'avg', 'ratio', 'percent', 'pct', 
          'per', 'unit', 'qty', 'level', 'aged', 'inbound', 'below', 'target', 'dependency', 
          'strong', 'organic', 'dormant', 'no', 'winning', 'scale', 'contribution', 'net', 'gross'
      ];
      let remainingText = lower;
      keywords.forEach(k => { 
          const regex = new RegExp(`\\b${k}\\b`, 'g');
          remainingText = remainingText.replace(regex, ''); 
      });
      remainingText = remainingText.replace(/\b\d+(d| days?)\b/g, '').replace(/\btop\s+\d+\b/g, '').replace(/[()]/g, '').trim();

      if (remainingText.length > 2) {
         const cleanQuery = remainingText.replace(/\s+/g, ' ').trim();
         intent.filters.push({ field: 'name', operator: 'CONTAINS', value: cleanQuery, label: `Text: "${cleanQuery}"` });
      }
  }

  return intent;
};
