
import React, { useState, useMemo, useEffect } from 'react';
import { Product, PricingRules, SearchConfig, PriceChangeRecord } from '../types';
import { Layers, ListFilter, TrendingDown, ArrowRight, X, ChevronDown, Package, Activity, ChevronRight, RotateCcw, AlertTriangle, Coins, Calendar, ShoppingBag, Megaphone, PieChart, DollarSign, Filter, Edit2, Check, Clock, Info, TrendingUp, MapPin } from 'lucide-react';
import { SearchIntent } from '../services/geminiService';
import { isAdsEnabled } from '../services/platformCapabilities';
import SkuDeepDivePage from './SkuDeepDivePage';
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
  thresholds: ThresholdConfig; // REQUIRED: Passed from App state
}

type GroupBy = 'platform' | 'sku';

interface SubGroup {
    key: string;
    label: string;
    productName?: string;
    count: number;
    weightedMargin: number;
    totalRevenue: number;
    totalProfit: number;
    totalQty: number;
    totalAdSpend: number;
    totalRefundAmount: number;
    totalRefundQty: number;
    tacos: number;
    organicShare: number | null; 
    contribution: number; 
    agedStockPct: number;
    items: any[];
    // Inventory Context Specific
    platformVelocity?: number;
    platformCover?: number;
    // Return Context Specific
    periodReturnRate?: number;
    allTimeReturnRate?: number;
    // Ad Context
    adEnabledRevenue: number;
    // Trend Context
    totalPrevRevenue: number;
    totalPrevQty: number;
    totalPrevProfit: number;
    weightedMarginChange: number;
    // Postcode Context
    districtStats?: Record<string, number>;
}

interface TopGroup {
    key: string;
    label: string;
    productName?: string;
    count: number;
    weightedMargin: number;
    totalRevenue: number;
    totalProfit: number;
    totalQty: number;
    totalAdSpend: number;
    totalRefundAmount: number;
    totalRefundQty: number;
    tacos: number;
    organicShare: number | null;
    contribution: number; 
    agedStockPct: number;
    subGroups: Record<string, SubGroup>;
    // Inventory Context Specific
    globalVelocity?: number;
    globalCover?: number;
    // Return Context Specific
    periodReturnRate?: number;
    allTimeReturnRate?: number;
    // Ad Context
    adEnabledRevenue: number;
    // Trend Context
    totalPrevRevenue: number;
    totalPrevQty: number;
    totalPrevProfit: number;
    weightedMarginChange: number;
    // Postcode Context
    districtStats?: Record<string, number>;
}

interface FilterChipProps {
    filter: any;
    onUpdate: (f: any) => void;
    onDelete: () => void;
    themeColor: string;
}

const FIELD_LABELS: Record<string, string> = {
    stockLevel: 'Stock',
    averageDailySales: 'Velocity',
    daysRemaining: 'Stock Cover',
    margin: 'Margin',
    profit: 'Profit',
    tacos: 'TACoS',
    adsSpend: 'Ad Spend',
    returnRate: 'Return %',
    revenue: 'Revenue',
    velocity: 'Qty',
    velocityChange: 'Trend % (PoP)',
    netPmPercent: 'Net Margin',
    qty: 'Qty',
    name: 'Name',
    platform: 'Platform',
    periodReturnRate: 'Period RR%',
    organicShare: 'Organic (Ad-enabled)',
    agedStockPct: 'Aged Stock %',
    MARGIN_CHANGE_PCT: 'Margin Change (PoP)',
    postcode: 'Postcode Area'
};

const FilterChip: React.FC<FilterChipProps> = ({ filter, onUpdate, onDelete, themeColor }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(filter.value);
    const [editOperator, setEditOperator] = useState(filter.operator);

    const handleSave = () => {
        onUpdate({ ...filter, value: editValue, operator: editOperator, label: undefined });
        setIsEditing(false);
    };

    const displayField = FIELD_LABELS[filter.field] || filter.field;
    const displayValue = typeof filter.value === 'number' ? filter.value.toLocaleString() : filter.value;
    
    // Special handling for Postcode Area to reassure users about strict matching
    const logicString = filter.field === 'postcode'
        ? `Area: ${displayValue}`
        : `${displayField} ${filter.operator} ${displayValue}`;
    
    // Explicit override for Trend < 0 to make it clear
    const finalContent = filter.field === 'velocityChange' && filter.value === 0 && filter.operator === 'LT'
        ? <span className="font-mono text-xs font-medium">Negative Trend (Period-over-Period)</span>
        : filter.label 
            ? <><span className="font-bold">{filter.label}:</span> <span className="opacity-80 ml-1 font-mono text-[10px]">{logicString}</span></>
            : <span className="font-mono text-xs font-medium">{logicString}</span>;

    const icon = filter.field === 'postcode' ? <MapPin className="w-3 h-3 text-indigo-500" /> : null;

    if (isEditing) {
        return (
            <div className="flex items-center gap-1 bg-white border border-indigo-300 rounded-lg p-1 shadow-sm animate-in fade-in zoom-in duration-200">
                <span className="text-[10px] font-bold text-gray-500 uppercase px-1">{displayField}</span>
                <select 
                    value={editOperator} 
                    onChange={e => setEditOperator(e.target.value)}
                    className="text-xs border-gray-200 rounded py-0.5 px-1 bg-gray-50"
                >
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&ge;</option>
                    <option value="<=">&le;</option>
                    <option value="=">=</option>
                    <option value="CONTAINS">has</option>
                </select>
                <input 
                    type={typeof filter.value === 'number' ? 'number' : 'text'}
                    value={editValue}
                    onChange={e => setEditValue(typeof filter.value === 'number' ? parseFloat(e.target.value) : e.target.value)}
                    className="w-16 text-xs border-gray-200 rounded py-0.5 px-1"
                    autoFocus
                />
                <button onClick={handleSave} className="p-1 text-green-600 hover:bg-green-50 rounded">
                    <Check className="w-3 h-3" />
                </button>
                <button onClick={() => setIsEditing(false)} className="p-1 text-gray-400 hover:bg-gray-50 rounded">
                    <X className="w-3 h-3" />
                </button>
            </div>
        )
    }

    return (
        <div 
            className="group flex items-center gap-1 px-3 py-1.5 bg-white border border-indigo-100 rounded-full text-xs text-indigo-700 shadow-sm hover:border-indigo-300 transition-all cursor-pointer hover:shadow-md"
            onClick={() => setIsEditing(true)}
            title={filter.field === 'postcode' ? "Strict Area Match (e.g. 'B' matches 'B1' but not 'BN1')" : "Click to edit filter criteria"}
        >
            {icon}
            {finalContent}
            <button 
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-indigo-50 rounded-full text-indigo-400 hover:text-red-500 transition-all"
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    );
};

const SearchResultsPage: React.FC<SearchResultsPageProps> = ({ data, products, pricingRules, themeColor, headerStyle, timeLabel, onRefine, searchConfig, priceChangeHistory = [], thresholds }) => {
  const [groupBy, setGroupBy] = useState<GroupBy>('platform');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedSubGroup, setExpandedSubGroup] = useState<string | null>(null);

  const isDeepDive = data.params.primaryMetric === 'DEEP_DIVE' && data.results.length > 0;

  // --- LIVE DATA HYDRATION ---
  // Map live products for instant lookup to respect global setting changes
  const liveProductMap = useMemo(() => {
      const map = new Map<string, Product>();
      products.forEach(p => map.set(p.sku, p));
      return map;
  }, [products]);

  const handleFilterUpdate = (index: number, newFilter: any) => {
      const newFilters = [...(data.params.filters || [])];
      newFilters[index] = newFilter;
      const newIntent: SearchIntent = { ...data.params, filters: newFilters };
      if (data.id) onRefine(data.id, newIntent);
  };

  const handleFilterDelete = (index: number) => {
      const newFilters = (data.params.filters || []).filter((_, i) => i !== index);
      const newIntent: SearchIntent = { ...data.params, filters: newFilters };
      if (data.id) onRefine(data.id, newIntent);
  };

  const handleSortUpdate = (field: string, direction: 'asc' | 'desc') => {
      const newIntent: SearchIntent = { 
          ...data.params, 
          sort: { field, direction } 
      };
      if (data.id) onRefine(data.id, newIntent);
  };

  useMemo(() => {
      setExpandedGroup(null);
      setExpandedSubGroup(null);
  }, [groupBy]);

  const checkContext = (keywords: string[], fields: string[]) => {
      const q = data.query.toLowerCase();
      const p = data.params;
      const matchesKeyword = keywords.some(k => q.includes(k));
      const hasFilter = p?.filters?.some((f: any) => fields.includes(f.field));
      const hasSort = p?.sort?.field ? fields.includes(p.sort.field) : false;
      return matchesKeyword || hasFilter || hasSort;
  };

  const isVolumeContext = useMemo(() => checkContext(
      ['qty', 'quantity', 'unit', 'sold', 'volume', 'velocity', 'count', 'traffic', 'winning', 'scale'], 
      ['velocity', 'qty']
  ), [data]);

  const isAdContext = useMemo(() => checkContext(
      ['ad', 'tacos', 'ppc', 'marketing', 'spend', 'cost'], 
      ['tacos', 'adsSpend']
  ), [data]);

  const isMarginContext = useMemo(() => checkContext(
      ['margin', 'profit', 'loss', 'negative', 'net', 'winning', 'scale'], 
      ['margin', 'profit', 'netPmPercent', 'MARGIN_CHANGE_PCT']
  ), [data]);

  const isInventoryContext = useMemo(() => checkContext(
      ['stock', 'inventory', 'runway', 'cover', 'days remaining', 'days cover', 'overstock', 'out of stock', 'level'], 
      ['stockLevel', 'daysRemaining']
  ), [data]);

  const isTrendContext = useMemo(() => checkContext(
      ['drop', 'decline', 'growth', 'change', 'trend', 'wow', 'spike'], 
      ['velocityChange', 'MARGIN_CHANGE_PCT']
  ), [data]);

  const isReturnContext = useMemo(() => checkContext(
      ['return', 'refund', 'rate', 'rr'], 
      ['returnRate', 'periodReturnRate']
  ), [data]);

  const isOrganicContext = useMemo(() => checkContext(
      ['organic', 'natural'], 
      ['organicShare', 'ORGANIC_SHARE_PCT']
  ), [data]);

  const isAgedContext = useMemo(() => checkContext(
      ['aged', 'old', 'long term', 'stale'], 
      ['agedStockPct', 'AGED_STOCK_PCT']
  ), [data]);

  const isPostcodeContext = useMemo(() => checkContext(
      ['postcode', 'area', 'region'], 
      ['postcode']
  ), [data]);

  useEffect(() => {
      if (isInventoryContext || isAgedContext) {
          setGroupBy('sku');
      }
  }, [isInventoryContext, isAgedContext]);


  const hierarchicalData = useMemo<TopGroup[]>(() => {
    if (!data.results || isDeepDive) return [];
    
    const groups: Record<string, TopGroup> = {};

    data.results.forEach(item => {
      const mainKey = groupBy === 'platform' ? (item.platform || 'Unknown') : item.sku;
      
      // --- HYDRATION STEP: Lookup Live Metrics ---
      // We look up the live product to get current settings-dependent values (Velocity, Stock Cover)
      // This overrides the static snapshot data for these specific fields.
      const liveProduct = liveProductMap.get(item.sku);
      if (liveProduct && item.type === 'INVENTORY') {
          item.averageDailySales = liveProduct.averageDailySales;
          item.daysRemaining = liveProduct.averageDailySales > 0 ? liveProduct.stockLevel / liveProduct.averageDailySales : 999;
          item.stockLevel = liveProduct.stockLevel; // In case stock updated via upload
          item.agedStockPct = liveProduct.stockLevel > 0 && liveProduct.agedStockQty ? (liveProduct.agedStockQty / liveProduct.stockLevel) * 100 : 0;
      }
      
      if (!groups[mainKey]) {
        groups[mainKey] = {
          key: mainKey,
          label: mainKey,
          productName: groupBy === 'sku' ? item.productName : undefined,
          count: 0,
          weightedMargin: 0,
          totalRevenue: 0,
          totalProfit: 0,
          totalQty: 0,
          totalAdSpend: 0,
          totalRefundAmount: 0,
          totalRefundQty: 0,
          tacos: 0,
          organicShare: null,
          contribution: 0,
          agedStockPct: 0,
          subGroups: {},
          globalVelocity: 0,
          globalCover: 0,
          periodReturnRate: 0,
          allTimeReturnRate: 0,
          adEnabledRevenue: 0,
          totalPrevRevenue: 0,
          totalPrevQty: 0,
          totalPrevProfit: 0,
          weightedMarginChange: 0,
          districtStats: {}
        };
      }

      const topGroup = groups[mainKey];
      topGroup.count++;
      
      if (item.type !== 'REFUND') {
          topGroup.totalRevenue += (item.revenue || 0);
          topGroup.totalProfit += (item.profit || 0);
          topGroup.totalQty += (item.velocity || 0); 
          topGroup.totalAdSpend += (item.adsSpend || 0);
          topGroup.contribution += (item.contribution || 0);
          
          if (isAdsEnabled(item.platform || '')) {
              topGroup.adEnabledRevenue += (item.revenue || 0);
          }
      } else {
          topGroup.totalRefundAmount += Math.abs(item.refundAmount || 0);
          topGroup.totalRefundQty += Math.abs(item.velocity || 0);
      }

      if ((isInventoryContext || isAgedContext) && item.type === 'INVENTORY' && groupBy === 'sku') {
          // Use hydrated values for grouping logic
          const gVel = item.averageDailySales || 0;
          topGroup.globalVelocity = gVel;
          topGroup.totalQty = item.stockLevel;
          topGroup.globalCover = gVel > 0 ? (item.stockLevel / gVel) : 999;
          
          if (item.agedStockQty) {
              topGroup.agedStockPct = item.agedStockPct || 0;
          }

          if (item.channels && Array.isArray(item.channels)) {
              item.channels.forEach((ch: any) => {
                  const subKey = ch.platform;
                  if (!topGroup.subGroups[subKey]) {
                      topGroup.subGroups[subKey] = {
                          key: subKey,
                          label: subKey,
                          productName: undefined,
                          count: 1,
                          weightedMargin: 0,
                          totalRevenue: 0,
                          totalProfit: 0,
                          totalQty: 0,
                          totalAdSpend: 0,
                          totalRefundAmount: 0,
                          totalRefundQty: 0,
                          tacos: 0,
                          organicShare: null,
                          contribution: 0,
                          agedStockPct: 0,
                          items: [],
                          platformVelocity: ch.velocity,
                          platformCover: ch.velocity > 0 ? (item.stockLevel / ch.velocity) : 999,
                          adEnabledRevenue: 0,
                          totalPrevRevenue: 0,
                          totalPrevQty: 0,
                          totalPrevProfit: 0,
                          weightedMarginChange: 0,
                          districtStats: {}
                      };
                  }
                  const estRevenue = ch.velocity * (ch.price || item.price);
                  topGroup.subGroups[subKey].items.push({
                      date: item.date,
                      price: ch.price || item.price,
                      velocity: ch.velocity,
                      revenue: estRevenue, 
                      stockLevel: item.stockLevel, 
                      type: 'INVENTORY_CHANNEL',
                      postcode: item.postcode // Pass if available
                  });
              });
          }
      } 
      else {
          const subKey = groupBy === 'platform' ? item.sku : (item.platform || 'Unknown');
          
          if (!topGroup.subGroups[subKey]) {
            topGroup.subGroups[subKey] = {
              key: subKey,
              label: subKey,
              productName: groupBy === 'platform' ? item.productName : undefined,
              count: 0,
              weightedMargin: 0,
              totalRevenue: 0,
              totalProfit: 0,
              totalQty: 0,
              totalAdSpend: 0,
              totalRefundAmount: 0,
              totalRefundQty: 0,
              tacos: 0,
              organicShare: null,
              contribution: 0,
              agedStockPct: 0,
              items: [],
              periodReturnRate: 0,
              allTimeReturnRate: item.allTimeReturnRate || 0,
              adEnabledRevenue: 0,
              totalPrevRevenue: 0,
              totalPrevQty: 0,
              totalPrevProfit: 0,
              weightedMarginChange: 0,
              districtStats: {}
            };
          }

          const subGroup = topGroup.subGroups[subKey];
          subGroup.count++;
          if (item.type !== 'REFUND') {
              subGroup.totalRevenue += (item.revenue || 0);
              subGroup.totalProfit += (item.profit || 0);
              subGroup.totalQty += (item.velocity || 0);
              subGroup.totalAdSpend += (item.adsSpend || 0);
              subGroup.contribution += (item.contribution || 0);
              
              if (isAdsEnabled(item.platform || '')) {
                  subGroup.adEnabledRevenue += (item.revenue || 0);
              }
          } else {
              subGroup.totalRefundAmount += Math.abs(item.refundAmount || 0);
              subGroup.totalRefundQty += Math.abs(item.velocity || 0);
          }
          subGroup.items.push(item);

          // Postcode District Aggregation
          if (item.postcode) {
              const district = item.postcode.split(' ')[0];
              if (district) {
                  // Top Group Stats
                  if (!topGroup.districtStats) topGroup.districtStats = {};
                  topGroup.districtStats[district] = (topGroup.districtStats[district] || 0) + (item.velocity || 0);
                  
                  // Sub Group Stats
                  if (!subGroup.districtStats) subGroup.districtStats = {};
                  subGroup.districtStats[district] = (subGroup.districtStats[district] || 0) + (item.velocity || 0);
              }
          }
      }
    });

    // Calculate aggregations & Trend Summation
    Object.keys(groups).forEach(key => {
        const g = groups[key];
        g.weightedMargin = g.totalRevenue > 0 ? (g.totalProfit / g.totalRevenue) * 100 : 0;
        
        // --- PREV STATS AGGREGATION ---
        const skuSet = new Set<string>();
        
        Object.values(g.subGroups).forEach(sg => {
            if (groupBy === 'sku') {
                // If group is SKU, subGroups are platforms.
                // Take values from first item (they represent the SKU total)
                if (sg.items.length > 0 && !skuSet.has(g.key)) {
                    g.totalPrevRevenue = sg.items[0].prevRevenue || 0;
                    g.totalPrevQty = sg.items[0].prevQty || 0;
                    g.totalPrevProfit = sg.items[0].prevProfit || 0;
                    skuSet.add(g.key);
                }
            } else {
                // Group is Platform. SubGroups are SKUs.
                if (sg.items.length > 0) {
                    const item = sg.items[0];
                    if (!skuSet.has(sg.key)) {
                        g.totalPrevRevenue += (item.prevRevenue || 0);
                        g.totalPrevQty += (item.prevQty || 0);
                        g.totalPrevProfit += (item.prevProfit || 0);
                        
                        sg.totalPrevRevenue = item.prevRevenue || 0;
                        sg.totalPrevQty = item.prevQty || 0;
                        sg.totalPrevProfit = item.prevProfit || 0;
                        
                        skuSet.add(sg.key);
                    }
                }
            }

            if (!sg.platformVelocity) { 
                sg.weightedMargin = sg.totalRevenue > 0 ? (sg.totalProfit / sg.totalRevenue) * 100 : 0;
                // Calculate SubGroup Margin Change
                const sgPrevMargin = sg.totalPrevRevenue > 0 ? (sg.totalPrevProfit / sg.totalPrevRevenue) * 100 : 0;
                sg.weightedMarginChange = sg.weightedMargin - sgPrevMargin;
                
                if (sg.adEnabledRevenue > 0) {
                    sg.tacos = (sg.totalAdSpend / sg.adEnabledRevenue) * 100;
                    sg.organicShare = Math.max(0, 100 - sg.tacos);
                } else {
                    sg.tacos = 0;
                    sg.organicShare = null;
                }

                sg.periodReturnRate = sg.totalQty > 0 ? (sg.totalRefundQty / sg.totalQty) * 100 : 0;
            }
        });
        
        // Calculate Top Group Margin Change
        const prevGroupMargin = g.totalPrevRevenue > 0 ? (g.totalPrevProfit / g.totalPrevRevenue) * 100 : 0;
        g.weightedMarginChange = g.weightedMargin - prevGroupMargin;

        if (g.adEnabledRevenue > 0) {
            g.tacos = (g.totalAdSpend / g.adEnabledRevenue) * 100;
            g.organicShare = Math.max(0, 100 - g.tacos);
        } else {
            g.tacos = 0;
            g.organicShare = null;
        }
        
        g.periodReturnRate = g.totalQty > 0 ? (g.totalRefundQty / g.totalQty) * 100 : 0;
        
        if (groupBy === 'sku') {
            const firstSub = Object.values(g.subGroups)[0];
            g.allTimeReturnRate = firstSub?.allTimeReturnRate || 0;
        } else {
            const subs = Object.values(g.subGroups);
            const sumAllTime = subs.reduce((acc, sub) => acc + (sub.allTimeReturnRate || 0), 0);
            g.allTimeReturnRate = subs.length > 0 ? sumAllTime / subs.length : 0;
        }
    });

    return Object.values(groups).sort((a, b) => {
        if (data.params && data.params.sort) {
            const { field, direction } = data.params.sort;
            const dirMult = direction === 'asc' ? 1 : -1;
            
            // Explicit Margin Change Sort
            if (field === 'MARGIN_CHANGE_PCT') {
                return (a.weightedMarginChange - b.weightedMarginChange) * dirMult;
            }

            if (field === 'margin' || field === 'net_margin_pct' || field === 'netPmPercent') {
                // SMART SORT: If Trend Context is active, sort by Margin Change
                if (isTrendContext) {
                    return (a.weightedMarginChange - b.weightedMarginChange) * dirMult;
                }
                return (a.totalProfit - b.totalProfit) * dirMult;
            }
            if (field === 'profit' || field === 'net_profit') return (a.totalProfit - b.totalProfit) * dirMult;
            if (field === 'revenue') return (a.totalRevenue - b.totalRevenue) * dirMult;
            if (field === 'velocity' || field === 'qty' || field === 'sales_qty') return (a.totalQty - b.totalQty) * dirMult;
            if (field === 'tacos' || field === 'tacos_pct' || field === 'adsSpend') return (a.tacos - b.tacos) * dirMult;
            if (field === 'stockLevel') return (a.totalQty - b.totalQty) * dirMult;
            if (field === 'daysRemaining' || field === 'stock_cover_days') return ((a.globalCover || 0) - (b.globalCover || 0)) * dirMult;
            if (field === 'periodReturnRate' || field === 'returnRate' || field === 'RETURN_RATE_PCT') return ((a.periodReturnRate || 0) - (b.periodReturnRate || 0)) * dirMult;
            if (field === 'organicShare' || field === 'ORGANIC_SHARE_PCT') return ((a.organicShare || 0) - (b.organicShare || 0)) * dirMult;
            if (field === 'agedStockPct' || field === 'AGED_STOCK_PCT') return ((a.agedStockPct || 0) - (b.agedStockPct || 0)) * dirMult;
            if (field === 'VELOCITY_CHANGE') {
                const aTrend = a.totalPrevQty > 0 ? ((a.totalQty - a.totalPrevQty) / a.totalPrevQty) : 0;
                const bTrend = b.totalPrevQty > 0 ? ((b.totalQty - b.totalPrevQty) / b.totalPrevQty) : 0;
                return (aTrend - bTrend) * dirMult;
            }
        }

        if (isAgedContext) return (b.agedStockPct || 0) - (a.agedStockPct || 0);
        if (isOrganicContext) return (b.organicShare || 0) - (a.organicShare || 0);
        if (isReturnContext) return (b.periodReturnRate || 0) - (a.periodReturnRate || 0);
        if (isInventoryContext) return a.totalQty - b.totalQty;
        if (isVolumeContext) return b.totalQty - a.totalQty;
        if (isAdContext) return b.tacos - a.tacos;
        if (isMarginContext) return b.totalProfit - a.totalProfit;
        return b.totalRevenue - a.totalRevenue;
    });
  }, [data.results, groupBy, isVolumeContext, isAdContext, isMarginContext, isInventoryContext, isReturnContext, isOrganicContext, isAgedContext, isTrendContext, isPostcodeContext, data.params, isDeepDive, liveProductMap]); 

  const volumeContextStats = useMemo(() => {
      const quantities = hierarchicalData.map(g => g.totalQty).sort((a, b) => a - b);
      const count = quantities.length;
      if (count === 0) return null;

      const max = quantities[count - 1] || 0;

      if (max < searchConfig.minAbsoluteFloor) {
          return { isLowVolume: true };
      }

      const bottomCutoffIndex = Math.floor(count * (searchConfig.volumeBands.bottomPercentile / 100));
      const topCutoffIndex = Math.floor(count * (1 - searchConfig.volumeBands.topPercentile / 100));

      const bottomVal = quantities[bottomCutoffIndex];
      const topVal = quantities[topCutoffIndex];

      const getBand = (qty: number) => {
          if (qty >= topVal) return 'Top';
          if (qty <= bottomVal) return 'Bottom';
          return 'Middle';
      };

      return { isLowVolume: false, getBand };
  }, [hierarchicalData, searchConfig]);

  const handleGroupToggle = (groupKey: string, e?: React.MouseEvent) => {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;
      setExpandedGroup(prev => prev === groupKey ? null : groupKey);
      setExpandedSubGroup(null);
  };

  const handleSubGroupToggle = (compositeKey: string, e: React.MouseEvent) => {
      const selection = window.getSelection();
      if (selection && selection.toString().length > 0) return;
      e.stopPropagation();
      setExpandedSubGroup(prev => prev === compositeKey ? null : compositeKey);
  };

  // Helper to format top districts for display
  const getTopDistricts = (stats: Record<string, number> | undefined) => {
      if (!stats) return null;
      const sorted = Object.entries(stats).sort((a, b) => b[1] - a[1]);
      if (sorted.length === 0) return null;
      
      const top3 = sorted.slice(0, 3).map(([code, count]) => `${code} (${count})`).join(', ');
      return top3;
  };

  if (!data) return null;

  // --- DEEP DIVE EARLY RETURN ---
  if (isDeepDive) {
      // FIX: Hydrate Deep Dive data with live product metrics
      // This ensures that if the user changes Velocity Lookback in settings,
      // the Deep Dive view reflects the new runway/velocity immediately without re-searching.
      const resultSnapshot = data.results[0];
      const liveProduct = liveProductMap.get(resultSnapshot.product.sku);
      
      const hydratedData = liveProduct ? {
          ...resultSnapshot,
          product: liveProduct
      } : resultSnapshot;

      return <SkuDeepDivePage data={hydratedData} themeColor={themeColor} priceChangeHistory={priceChangeHistory} thresholds={thresholds} />;
  }

  const renderContent = () => {
    if (data.results.length === 0) {
      return (
        <div className="text-center py-20 bg-custom-glass rounded-xl border border-custom-glass">
          <h3 className="text-lg font-bold text-gray-800">No Results Found</h3>
          <p className="text-gray-500 mt-2">Your query did not return any results. Try adjusting the filters above.</p>
        </div>
      );
    }

    return (
      <div className="space-y-4">
        {hierarchicalData.map(group => {
            // Volume Context Visuals
            let volumeBadge = null;
            if (volumeContextStats) {
                if (volumeContextStats.isLowVolume) {
                    volumeBadge = <span className="text-[9px] bg-gray-50 text-gray-400 px-1 rounded border border-gray-100">Low Vol</span>;
                } else if (volumeContextStats.getBand) {
                    const band = volumeContextStats.getBand(group.totalQty);
                    if (band === 'Top') volumeBadge = <span className="text-[9px] bg-slate-200 text-slate-700 px-1 rounded border border-slate-300 font-medium">Top 20%</span>;
                    if (band === 'Middle') volumeBadge = <span className="text-[9px] bg-gray-100 text-gray-600 px-1 rounded border border-gray-200">Mid 60%</span>;
                    if (band === 'Bottom') volumeBadge = <span className="text-[9px] bg-white text-gray-400 px-1 rounded border border-gray-200">Bot 20%</span>;
                }
            }

            // Calculate Trends for Top Group
            const revDiff = group.totalRevenue - group.totalPrevRevenue;
            const revDiffPct = group.totalPrevRevenue > 0 ? (revDiff / group.totalPrevRevenue) * 100 : (group.totalRevenue > 0 ? 100 : 0);
            
            const volDiff = group.totalQty - group.totalPrevQty;
            const volDiffPct = group.totalPrevQty > 0 ? (volDiff / group.totalPrevQty) * 100 : (group.totalQty > 0 ? 100 : 0);

            // Postcode Context Summary
            const topDistricts = isPostcodeContext ? getTopDistricts(group.districtStats) : null;

            return (
              <div key={group.key} className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                <div
                  className={`w-full p-4 flex items-center justify-between hover:bg-gray-50/50 transition-colors cursor-pointer select-text ${expandedGroup === group.key ? 'bg-gray-50/30' : ''}`}
                  onClick={(e) => handleGroupToggle(group.key, e)}
                >
                  <div className="flex items-center gap-4">
                     <div className={`p-2 rounded-lg text-gray-600 ${groupBy === 'platform' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {groupBy === 'platform' ? <Layers className="w-5 h-5" /> : <Package className="w-5 h-5" />}
                     </div>
                     <div>
                        <h3 className="font-bold text-gray-900">{group.label}</h3>
                        {group.productName && <p className="text-xs text-gray-500">{group.productName}</p>}
                        {topDistricts && (
                            <p className="text-[10px] text-indigo-600 mt-1 flex items-center gap-1 font-medium">
                                <MapPin className="w-3 h-3" /> Top Districts: {topDistricts}
                            </p>
                        )}
                     </div>
                  </div>
                  
                  <div className="flex items-center gap-8">
                    {/* UNITS COLUMN */}
                    <div className={`text-right hidden sm:block ${isVolumeContext ? 'scale-110 transform origin-right' : 'opacity-70'}`}>
                        <div className={`text-xs ${isVolumeContext ? 'text-indigo-600 font-bold' : 'text-gray-500'}`}>
                            {isInventoryContext || isAgedContext ? 'Total Stock' : isTrendContext ? 'Vol. Change (PoP)' : 'Units Sold'}
                        </div>
                        
                        {isTrendContext ? (
                            <div className="flex flex-col items-end">
                                <span className="font-bold text-gray-900 text-sm">{group.totalQty.toLocaleString()}</span>
                                <div className={`flex items-center gap-1 text-xs font-bold ${volDiff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {volDiff < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                    {volDiff > 0 ? '+' : ''}{volDiff.toLocaleString()} ({volDiffPct.toFixed(1)}%)
                                </div>
                            </div>
                        ) : (
                            <div className="flex flex-col items-end">
                                <div className={`font-bold text-lg ${isVolumeContext ? 'text-indigo-700' : 'text-gray-800'}`}>
                                    {group.totalQty.toLocaleString()}
                                </div>
                                {volumeBadge}
                            </div>
                        )}
                    </div>

                    {/* REVENUE COLUMN */}
                    <div className="text-right hidden sm:block">
                        <div className="text-xs text-gray-500">
                            {isInventoryContext || isAgedContext ? 'Global Velocity' : isTrendContext ? 'Rev. Change (PoP)' : 'Total Revenue'}
                        </div>
                        
                        {isTrendContext ? (
                            <div className="flex flex-col items-end">
                                <span className="font-bold text-gray-900 text-sm">£{group.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}</span>
                                <div className={`flex items-center gap-1 text-xs font-bold ${revDiff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                    {revDiff < 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                                    {revDiff > 0 ? '+' : '-'}£{Math.abs(revDiff).toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})} ({revDiffPct.toFixed(1)}%)
                                </div>
                            </div>
                        ) : (
                            <div className="font-bold text-lg text-gray-800">
                                {isInventoryContext || isAgedContext
                                    ? `${(group.globalVelocity || 0).toFixed(1)}/day`
                                    : `£${group.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`
                                }
                            </div>
                        )}
                    </div>

                    {/* ADDITIONAL COLUMNS ... */}
                    {isReturnContext && (
                        <div className="text-right hidden sm:block">
                            <div className="text-xs text-gray-500 font-bold uppercase tracking-wider mb-1">
                                Return Health
                            </div>
                            <div className="flex items-center gap-4 bg-gray-50 px-3 py-1 rounded border border-gray-200">
                                <div className="text-right">
                                    <span className="block text-[9px] text-gray-400 uppercase">Period (Qty)</span>
                                    <span className={`block font-bold ${(group.periodReturnRate || 0) > thresholds.returnRatePct ? 'text-red-600' : 'text-gray-800'}`}>
                                        {(group.periodReturnRate || 0).toFixed(1)}%
                                    </span>
                                </div>
                                <div className="w-px h-6 bg-gray-300"></div>
                                <div className="text-right">
                                    <span className="block text-[9px] text-gray-400 uppercase">All Time</span>
                                    <span className="block font-medium text-gray-600">
                                        {(group.allTimeReturnRate || 0).toFixed(1)}%
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {!isReturnContext && (
                        <div className="text-right hidden md:block group relative">
                            <div className="text-xs text-gray-500 flex items-center justify-end gap-1">
                                {isInventoryContext ? 'Global Cover' 
                                : isAdContext ? 'TACoS' 
                                : isOrganicContext ? 'Organic Share (Ad-enabled)' 
                                : isAgedContext ? 'Aged Stock %' 
                                : isMarginContext && isTrendContext ? 'Margin Change (PoP)'
                                : isMarginContext ? 'Net Contribution' 
                                : 'Sales Share'}
                                
                                {isOrganicContext && (
                                    <div className="group/tooltip relative">
                                        <Info className="w-3 h-3 text-gray-400 cursor-help" />
                                        <div className="absolute bottom-full right-0 mb-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded shadow-lg opacity-0 group-hover/tooltip:opacity-100 pointer-events-none z-50">
                                            Calculated only on ad-enabled platforms (currently Amazon/eBay/Temu).
                                        </div>
                                    </div>
                                )}
                            </div>
                            
                            {isMarginContext ? (
                                <div className="flex flex-col items-end">
                                    <div className={`font-bold text-lg ${group.totalProfit < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                        £{group.totalProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                                    </div>
                                    <div className={`text-xs flex items-center gap-1 ${group.weightedMargin < thresholds.marginBelowTargetPct ? 'text-red-400' : 'text-gray-400'}`}>
                                        {group.weightedMargin.toFixed(1)}% 
                                        {isTrendContext && (
                                            <span className={`font-bold ${group.weightedMarginChange > 0 ? 'text-green-500' : 'text-red-500'}`}>
                                                ({group.weightedMarginChange > 0 ? '+' : ''}{group.weightedMarginChange.toFixed(1)}%)
                                            </span>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className={`font-bold text-lg ${
                                    isInventoryContext
                                        ? ((group.globalCover || 999) < 14 ? 'text-red-600' : (group.globalCover || 0) > thresholds.overstockDays ? 'text-orange-600' : 'text-green-600')
                                        : isAdContext 
                                            ? (group.tacos > thresholds.highAdDependencyPct ? 'text-red-600' : 'text-gray-800')
                                            : isOrganicContext
                                                ? (group.organicShare !== null && group.organicShare > 80 ? 'text-green-600' : group.organicShare !== null && group.organicShare < 40 ? 'text-red-600' : 'text-gray-800')
                                            : isAgedContext
                                                ? (group.agedStockPct > 20 ? 'text-red-600' : group.agedStockPct > 10 ? 'text-orange-600' : 'text-green-600')
                                            : 'text-indigo-600'
                                }`}>
                                    {isInventoryContext 
                                        ? `${(group.globalCover || 0) > 730 ? '>2y' : (group.globalCover || 0).toFixed(0) + ' days'}`
                                        : isAdContext ? `${group.tacos.toFixed(1)}%` 
                                        : isOrganicContext 
                                            ? (group.organicShare !== null ? `${group.organicShare.toFixed(1)}%` : <span className="text-xs text-gray-400 font-medium bg-gray-100 px-2 py-0.5 rounded">N/A <span className="hidden group-hover:inline">- Ads not enabled</span></span>)
                                        : isAgedContext ? `${group.agedStockPct.toFixed(1)}%`
                                        : `${group.contribution.toFixed(1)}%`}
                                </div>
                            )}
                        </div>
                    )}

                    <div className={`transition-transform duration-200 ${expandedGroup === group.key ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                </div>

                {/* --- EXPANDED SUBGROUPS --- */}
                {expandedGroup === group.key && (
                    <div className="border-t border-gray-200/50 bg-gray-50/10">
                        <div className="px-4 py-2 bg-gray-100/50 text-[10px] font-bold text-gray-500 uppercase tracking-wide flex items-center gap-2">
                            <ArrowRight className="w-3 h-3" />
                            {groupBy === 'platform' ? 'Products (SKUs) in this Platform' : 'Platforms for this Product'}
                        </div>

                        <div className="divide-y divide-gray-100">
                            {(Object.values(group.subGroups) as SubGroup[])
                                .sort((a, b) => {
                                    if (data.params && data.params.sort) {
                                        const { field, direction } = data.params.sort;
                                        const dirMult = direction === 'asc' ? 1 : -1;
                                        
                                        // Explicit Change Sort
                                        if (field === 'MARGIN_CHANGE_PCT') {
                                            return (a.weightedMarginChange - b.weightedMarginChange) * dirMult;
                                        }

                                        if (field === 'margin' || field === 'net_margin_pct' || field === 'netPmPercent') {
                                            if (isTrendContext) {
                                                return (a.weightedMarginChange - b.weightedMarginChange) * dirMult;
                                            }
                                            return (a.totalProfit - b.totalProfit) * dirMult;
                                        }
                                        if (field === 'profit' || field === 'net_profit') return (a.totalProfit - b.totalProfit) * dirMult;
                                        if (field === 'revenue') return (a.totalRevenue - b.totalRevenue) * dirMult;
                                        if (field === 'velocity' || field === 'qty' || field === 'sales_qty') return (a.totalQty - b.totalQty) * dirMult;
                                        if (field === 'tacos' || field === 'tacos_pct' || field === 'adsSpend') return (a.tacos - b.tacos) * dirMult;
                                        if (field === 'periodReturnRate' || field === 'returnRate') return ((a.periodReturnRate || 0) - (b.periodReturnRate || 0)) * dirMult;
                                        if (field === 'organicShare' || field === 'ORGANIC_SHARE_PCT') return ((a.organicShare || 0) - (b.organicShare || 0)) * dirMult;
                                        if (field === 'agedStockPct' || field === 'AGED_STOCK_PCT') return ((a.agedStockPct || 0) - (b.agedStockPct || 0)) * dirMult;
                                        if (field === 'VELOCITY_CHANGE') {
                                            const aTrend = a.totalPrevQty > 0 ? ((a.totalQty - a.totalPrevQty) / a.totalPrevQty) : 0;
                                            const bTrend = b.totalPrevQty > 0 ? ((b.totalQty - b.totalPrevQty) / b.totalPrevQty) : 0;
                                            return (aTrend - bTrend) * dirMult;
                                        }
                                    }

                                    return isReturnContext ? (b.periodReturnRate || 0) - (a.periodReturnRate || 0)
                                    : isInventoryContext ? (b.platformVelocity || 0) - (a.platformVelocity || 0)
                                    : isVolumeContext ? b.totalQty - a.totalQty 
                                    : isAdContext ? b.tacos - a.tacos
                                    : isOrganicContext ? (b.organicShare || 0) - (a.organicShare || 0)
                                    : isAgedContext ? b.agedStockPct - a.agedStockPct
                                    : isMarginContext ? b.totalProfit - a.totalProfit
                                    : b.contribution - a.contribution
                                })
                                .map(sub => {
                                    const compositeKey = `${group.key}|${sub.key}`;
                                    const isSubExpanded = expandedSubGroup === compositeKey;
                                    
                                    // Calculate SubGroup Trends
                                    const subRevDiff = sub.totalRevenue - sub.totalPrevRevenue;
                                    const subRevDiffPct = sub.totalPrevRevenue > 0 ? (subRevDiff / sub.totalPrevRevenue) * 100 : (sub.totalRevenue > 0 ? 100 : 0);
                                    
                                    const subVolDiff = sub.totalQty - sub.totalPrevQty;
                                    const subVolDiffPct = sub.totalPrevQty > 0 ? (subVolDiff / sub.totalPrevQty) * 100 : (sub.totalQty > 0 ? 100 : 0);

                                    return (
                                        <div key={sub.key} className="bg-white/40">
                                            {/* ... Subgroup Header Row ... */}
                                            <div 
                                                className="w-full flex items-center justify-between px-6 py-3 hover:bg-white/80 transition-colors text-left cursor-pointer select-text"
                                                onClick={(e) => handleSubGroupToggle(compositeKey, e)}
                                            >
                                                <div className="flex items-center gap-3">
                                                    {isSubExpanded ? <ChevronDown className="w-4 h-4 text-indigo-500" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                                    <div className="p-1.5 bg-gray-200 rounded text-gray-500">
                                                        {groupBy === 'platform' ? <Package className="w-3 h-3" /> : <Layers className="w-3 h-3" />}
                                                    </div>
                                                    <div>
                                                        <div className="font-mono text-sm font-bold text-gray-700">{sub.label}</div>
                                                        {sub.productName && <div className="text-xs text-gray-500">{sub.productName}</div>}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-6">
                                                    {/* ... Subgroup Metrics ... */}
                                                    {isInventoryContext || isAgedContext ? (
                                                        <>
                                                            <div className="text-right">
                                                                <div className="text-xs text-gray-400">Plat. Velocity</div>
                                                                <div className="text-sm font-bold text-indigo-600">{(sub.platformVelocity || 0).toFixed(2)}/d</div>
                                                            </div>
                                                            {!isAgedContext && <div className="text-right w-24">
                                                                <div className="text-xs text-gray-400">Plat. Cover</div>
                                                                <div className={`text-sm font-bold ${(sub.platformCover || 999) < 28 ? 'text-red-600' : 'text-green-600'}`}>
                                                                    {(sub.platformCover || 0).toFixed(0)} days
                                                                </div>
                                                            </div>}
                                                            {isAgedContext && <div className="text-right w-24">
                                                                <div className="text-xs text-gray-400">Aged %</div>
                                                                <div className={`text-sm font-bold ${(sub.agedStockPct || 0) > 20 ? 'text-red-600' : 'text-green-600'}`}>
                                                                    {(sub.agedStockPct || 0).toFixed(1)}%
                                                                </div>
                                                            </div>}
                                                        </>
                                                    ) : isReturnContext ? (
                                                        <>
                                                            <div className="text-right w-16">
                                                                <div className="text-xs text-gray-400">Units</div>
                                                                <div className="text-sm font-bold text-gray-700">{sub.totalQty}</div>
                                                            </div>
                                                            <div className="text-right w-16">
                                                                <div className="text-xs text-gray-400">Refunded</div>
                                                                <div className="text-sm font-bold text-red-600">{sub.totalRefundQty}</div>
                                                            </div>
                                                            <div className="text-right w-20">
                                                                <div className="text-xs text-gray-400">Period RR</div>
                                                                <div className={`text-sm font-bold ${(sub.periodReturnRate || 0) > thresholds.returnRatePct ? 'text-red-600' : 'text-gray-800'}`}>
                                                                    {(sub.periodReturnRate || 0).toFixed(1)}%
                                                                </div>
                                                            </div>
                                                            <div className="text-right w-20">
                                                                <div className="text-xs text-gray-400">All Time</div>
                                                                <div className="text-sm font-medium text-gray-600">
                                                                    {(sub.allTimeReturnRate || 0).toFixed(1)}%
                                                                </div>
                                                            </div>
                                                        </>
                                                    ) : isTrendContext ? (
                                                        <>
                                                            <div className="text-right">
                                                                <div className="text-xs text-gray-400">Vol. Trend</div>
                                                                <div className={`text-xs font-bold ${subVolDiff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                    {subVolDiff > 0 ? '+' : ''}{subVolDiff} ({subVolDiffPct.toFixed(0)}%)
                                                                </div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-xs text-gray-400">Rev. Trend</div>
                                                                <div className={`text-xs font-bold ${subRevDiff < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                    {subRevDiff > 0 ? '+' : ''}£{Math.abs(subRevDiff).toFixed(0)} ({subRevDiffPct.toFixed(0)}%)
                                                                </div>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="text-right w-16">
                                                                <div className="text-xs text-gray-400">Qty</div>
                                                                <div className="text-sm font-bold text-gray-700">{sub.totalQty}</div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-xs text-gray-400">Revenue</div>
                                                                <div className="text-sm font-medium text-gray-700">£{sub.totalRevenue.toFixed(0)}</div>
                                                            </div>
                                                            {(isMarginContext || isAdContext || isOrganicContext) && (
                                                                <div className="text-right">
                                                                    <div className="text-xs text-gray-400">Ad Spent</div>
                                                                    <div className="text-sm font-medium text-orange-700">£{sub.totalAdSpend.toFixed(0)}</div>
                                                                </div>
                                                            )}
                                                            <div className="text-right w-24">
                                                                <div className="text-xs text-gray-400">
                                                                    {isAdContext ? 'TACoS' : isOrganicContext ? 'Organic (Ads)' : isMarginContext ? 'Net Profit' : 'Share %'}
                                                                </div>
                                                                <span className={`text-sm font-bold ${
                                                                    isAdContext ? (sub.tacos > thresholds.highAdDependencyPct ? 'text-red-600' : 'text-gray-700') :
                                                                    isOrganicContext ? (sub.organicShare !== null && sub.organicShare > 80 ? 'text-green-600' : sub.organicShare !== null && sub.organicShare < 40 ? 'text-red-600' : 'text-gray-700') :
                                                                    isMarginContext ? (sub.totalProfit < 0 ? 'text-red-600' : 'text-green-600') :
                                                                    'text-indigo-600'
                                                                }`}>
                                                                    {isAdContext ? `${sub.tacos.toFixed(1)}%` :
                                                                     isOrganicContext ? (sub.organicShare !== null ? `${sub.organicShare.toFixed(1)}%` : <span className="text-xs text-gray-400 font-medium">N/A</span>) :
                                                                     isMarginContext ? `£${sub.totalProfit.toFixed(0)}` :
                                                                     `${sub.contribution.toFixed(1)}%`}
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {/* ... Subgroup Transactions Table ... */}
                                            {isSubExpanded && (
                                                <div className="px-6 pb-4 animate-in fade-in slide-in-from-top-1">
                                                    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                                        <table className="w-full text-xs text-left">
                                                            <thead className="bg-gray-50 text-gray-500 font-medium">
                                                                {isReturnContext ? (
                                                                    <tr>
                                                                        <th className="p-2 pl-3">Date</th>
                                                                        <th className="p-2 text-right">Refund Amount</th>
                                                                        <th className="p-2 text-right">Qty</th>
                                                                        <th className="p-2">Reason / Note</th>
                                                                        <th className="p-2 text-right">Platform</th>
                                                                    </tr>
                                                                ) : (
                                                                    <tr>
                                                                        <th className="p-2 pl-3">Date</th>
                                                                        <th className="p-2 text-right">Unit Price</th>
                                                                        <th className="p-2 text-right">
                                                                            {isInventoryContext || isAgedContext ? 'Velocity' : 'Qty'}
                                                                        </th>
                                                                        <th className="p-2 text-right">
                                                                            {isInventoryContext || isAgedContext ? 'Est. Daily Rev' : 'Revenue'}
                                                                        </th>
                                                                        {(isAdContext || isMarginContext || isOrganicContext) && <th className="p-2 text-right">Ad Spend</th>}
                                                                        {isAdContext && <th className="p-2 text-right">TACoS</th>}
                                                                        {isOrganicContext && <th className="p-2 text-right">Organic % (Ads)</th>}
                                                                        {(isInventoryContext || isAgedContext) && <th className="p-2 text-right">Stock</th>}
                                                                        {isAgedContext && <th className="p-2 text-right">Aged Qty</th>}
                                                                        {isAgedContext && <th className="p-2 text-right">Aged %</th>}
                                                                        {!isAgedContext && isInventoryContext && <th className="p-2 text-right">Stock Cover</th>}
                                                                        {isTrendContext && <th className="p-2 text-right">Trend</th>}
                                                                        {isPostcodeContext && <th className="p-2 text-right">Postcode</th>}
                                                                        <th className="p-2 text-right">Profit</th>
                                                                        <th className="p-2 text-right">Margin %</th>
                                                                        <th className="p-2 text-right">Share %</th>
                                                                    </tr>
                                                                )}
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {sub.items
                                                                    .filter(item => isReturnContext ? item.type === 'REFUND' : true)
                                                                    .sort((a,b) => {
                                                                        if (isAdContext && (a.tacos !== b.tacos)) return (b.tacos || 0) - (a.tacos || 0);
                                                                        if (isOrganicContext && (a.organicShare !== b.organicShare)) return (b.organicShare || 0) - (a.organicShare || 0);
                                                                        if (isAgedContext && (a.agedStockPct !== b.agedStockPct)) return (b.agedStockPct || 0) - (a.agedStockPct || 0);
                                                                        if (isMarginContext && (a.profit !== b.profit)) return (b.profit || 0) - (a.profit || 0); 
                                                                        const tA = new Date(a.date).getTime();
                                                                        const tB = new Date(b.date).getTime();
                                                                        if (isNaN(tA) || isNaN(tB)) return 0;
                                                                        return tB - tA;
                                                                    })
                                                                    .slice(0, 50) 
                                                                    .map((tx, idx) => (
                                                                    <tr key={idx} className="hover:bg-indigo-50/30">
                                                                        <td className="p-2 pl-3 font-mono text-gray-600">
                                                                            {new Date(tx.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                                        </td>
                                                                        
                                                                        {isReturnContext ? (
                                                                            <>
                                                                                <td className="p-2 text-right font-medium text-red-600">
                                                                                    -£{Math.abs(tx.refundAmount || tx.profit || 0).toFixed(2)}
                                                                                </td>
                                                                                <td className="p-2 text-right font-bold text-gray-800">{tx.velocity}</td>
                                                                                <td className="p-2 text-gray-600 truncate max-w-[200px]" title={tx.platformReason || tx.customerReason || tx.reason}>
                                                                                    {tx.platformReason || tx.customerReason || tx.reason || 'Unknown Reason'}
                                                                                </td>
                                                                                <td className="p-2 text-right text-xs text-gray-500">{tx.platform}</td>
                                                                            </>
                                                                        ) : (
                                                                            <>
                                                                                <td className={`p-2 text-right font-medium ${tx.type === 'AD_COST' ? 'text-orange-600' : tx.type === 'REFUND' ? 'text-red-600' : 'text-gray-900'}`}>
                                                                                    {tx.type === 'AD_COST' ? (
                                                                                        <span className="text-[9px] bg-orange-50 text-orange-700 px-1 rounded border border-orange-100 uppercase font-bold">Ad Spend</span>
                                                                                    ) : (
                                                                                        `£${Math.abs(tx.price || 0).toFixed(2)}`
                                                                                    )}
                                                                                </td>
                                                                                <td className="p-2 text-right text-gray-900 font-bold">
                                                                                    {isInventoryContext || isAgedContext ? tx.velocity.toFixed(3) : tx.velocity}
                                                                                </td>
                                                                                <td className="p-2 text-right text-gray-700">£{(tx.revenue || 0).toFixed(2)}</td>
                                                                                {(isAdContext || isMarginContext || isOrganicContext) && (
                                                                                    <td className="p-2 text-right text-orange-700">
                                                                                        {tx.adsSpend > 0 ? `£${tx.adsSpend.toFixed(2)}` : '-'}
                                                                                    </td>
                                                                                )}
                                                                                {isAdContext && (
                                                                                    <td className="p-2 text-right">
                                                                                        {tx.tacos > 0 ? (
                                                                                            <span className={`${tx.tacos > thresholds.highAdDependencyPct ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                                                                                {tx.tacos.toFixed(1)}%
                                                                                            </span>
                                                                                        ) : '-'}
                                                                                    </td>
                                                                                )}
                                                                                {isOrganicContext && (
                                                                                    <td className="p-2 text-right">
                                                                                        {tx.organicShare !== null ? (
                                                                                            <span className={`${tx.organicShare < 40 ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                                                                                                {tx.organicShare.toFixed(1)}%
                                                                                            </span>
                                                                                        ) : <span className="text-gray-400 italic">N/A</span>}
                                                                                    </td>
                                                                                )}
                                                                                
                                                                                {(isInventoryContext || isAgedContext) && (
                                                                                    <>
                                                                                        <td className="p-2 text-right text-gray-800 font-medium">
                                                                                            {tx.stockLevel !== undefined ? tx.stockLevel : '-'}
                                                                                        </td>
                                                                                        {isAgedContext && <td className="p-2 text-right text-amber-700 font-medium">{tx.agedStockQty || '-'}</td>}
                                                                                        {isAgedContext && <td className="p-2 text-right font-bold">{(tx.agedStockPct || 0).toFixed(1)}%</td>}
                                                                                        
                                                                                        {!isAgedContext && <td className="p-2 text-right">
                                                                                            {tx.daysRemaining !== undefined ? (
                                                                                                <span className={`${tx.daysRemaining < 14 ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                                                                                                    {tx.daysRemaining.toFixed(0)}d
                                                                                                </span>
                                                                                            ) : '-'}
                                                                                        </td>}
                                                                                    </>
                                                                                )}
                                                                                {isTrendContext && (
                                                                                    <td className="p-2 text-right">
                                                                                        {tx.velocityChange !== undefined ? (
                                                                                            <span className={`${tx.velocityChange < -thresholds.velocityDropPct ? 'text-red-600' : tx.velocityChange > 20 ? 'text-green-600' : 'text-gray-500'}`}>
                                                                                                {tx.velocityChange > 0 ? '+' : ''}{tx.velocityChange.toFixed(0)}%
                                                                                            </span>
                                                                                        ) : '-'}
                                                                                    </td>
                                                                                )}
                                                                                {isPostcodeContext && (
                                                                                    <td className="p-2 text-right text-gray-600 font-mono text-[10px]">
                                                                                        {tx.postcode || '-'}
                                                                                    </td>
                                                                                )}
                                                                                
                                                                                <td className={`p-2 text-right font-medium ${tx.profit < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                                    £{(tx.profit || 0).toFixed(2)}
                                                                                </td>
                                                                                <td className="p-2 text-right font-bold">
                                                                                    {tx.type === 'REFUND' ? (
                                                                                        <span className="text-red-500 text-[10px] uppercase bg-red-50 px-1 rounded border border-red-100">Refund</span>
                                                                                    ) : tx.margin === -Infinity || (Math.abs(tx.revenue) < 0.01 && tx.adsSpend > 0) ? (
                                                                                        <span className="text-gray-900 font-normal cursor-help" title="Margin N/A (No Revenue)">
                                                                                            N/A
                                                                                        </span>
                                                                                    ) : (
                                                                                        <span className={`${(tx.margin || 0) < thresholds.marginBelowTargetPct ? 'text-red-600' : 'text-green-600'}`}>
                                                                                            {(tx.margin || 0).toFixed(1)}%
                                                                                        </span>
                                                                                    )}
                                                                                </td>
                                                                                <td className="p-2 text-right text-xs text-gray-400 font-medium">
                                                                                    {tx.contribution ? `${tx.contribution.toFixed(1)}%` : '-'}
                                                                                </td>
                                                                            </>
                                                                        )}
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                        {sub.items.length > 50 && <div className="p-2 text-center text-xs text-gray-400 bg-gray-50 border-t border-gray-100">...and {sub.items.length - 50} more records</div>}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            }
                        </div>
                    </div>
                )}
              </div>
            );
        })}
      </div>
    );
  };
  
  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 space-y-4">
        {data.params && data.params.filters && data.params.filters.length > 0 && !isDeepDive && (
            <div className="bg-indigo-50/50 border-b border-indigo-100 p-3 rounded-lg flex flex-wrap items-center gap-2">
                <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wide flex items-center gap-1">
                    <Filter className="w-3 h-3" /> Active Logic:
                </span>
                {data.params.filters.map((filter, idx) => (
                    <FilterChip 
                        key={idx} 
                        filter={filter} 
                        onUpdate={(f) => handleFilterUpdate(idx, f)}
                        onDelete={() => handleFilterDelete(idx)}
                        themeColor={themeColor}
                    />
                ))}
                {data.params.timeRange && (
                    <div className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600">
                        Time: {data.params.timeRange.value}
                    </div>
                )}
            </div>
        )}

        {!isDeepDive && (
        <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
                <p className="text-sm text-gray-500 flex items-center gap-1">Search results for:</p>
                <div className="flex items-center gap-2">
                    <h2 className="text-xl font-bold text-gray-800">"{data.query}"</h2>
                    {data.results.length > 0 && (
                        <span className="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full text-xs font-bold">
                            {data.results.length} hits
                        </span>
                    )}
                </div>
            </div>
            
            <div className="flex items-center gap-3">
                {/* Context Pills */}
                {timeLabel && (<div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-bold rounded-lg border border-gray-200"><Calendar className="w-3.5 h-3.5" />{timeLabel}</div>)}
                {isVolumeContext && (<div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-bold rounded-lg border border-blue-100"><ShoppingBag className="w-3.5 h-3.5" />Volume View</div>)}
                {isAdContext && (<div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-700 text-xs font-bold rounded-lg border border-orange-100"><Megaphone className="w-3.5 h-3.5" />Ad Performance</div>)}
                {isOrganicContext && (<div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-bold rounded-lg border border-green-100"><Activity className="w-3.5 h-3.5" />Organic Share</div>)}
                {isAgedContext && (<div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 text-xs font-bold rounded-lg border border-amber-100"><Clock className="w-3.5 h-3.5" />Aged Inventory</div>)}
                {isMarginContext && (<div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-bold rounded-lg border border-green-100"><DollarSign className="w-3.5 h-3.5" />Profit Analysis</div>)}
                
                {isInventoryContext && (
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-700 text-xs font-bold rounded-lg border border-orange-100">
                        <Package className="w-3.5 h-3.5" />
                        Inventory Health
                    </div>
                )}
                {isInventoryContext && (
                     <div className="text-[10px] text-gray-400 italic hidden lg:block">
                        * Runway based on current Velocity Lookback setting.
                     </div>
                )}

                {isTrendContext && (<div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-50 text-cyan-700 text-xs font-bold rounded-lg border border-cyan-100"><TrendingDown className="w-3.5 h-3.5" />Trend Analysis</div>)}
                {isReturnContext && (<div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 text-xs font-bold rounded-lg border border-red-100"><RotateCcw className="w-3.5 h-3.5" />Returns</div>)}
                
                <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                    {/* Add Trend Sort Controls */}
                    {isTrendContext && (
                        <div className="flex border-r border-gray-200 pr-2 mr-2">
                            <button
                                onClick={() => handleSortUpdate(data.params.primaryMetric || 'VELOCITY_CHANGE', 'desc')}
                                className={`px-2 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${data.params.sort?.direction === 'desc' ? 'bg-green-50 text-green-700' : 'text-gray-500 hover:text-green-600'}`}
                                title="Sort by Top Risers (Growth)"
                            >
                                <TrendingUp className="w-3 h-3" /> Risers
                            </button>
                            <button
                                onClick={() => handleSortUpdate(data.params.primaryMetric || 'VELOCITY_CHANGE', 'asc')}
                                className={`px-2 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${data.params.sort?.direction === 'asc' ? 'bg-red-50 text-red-700' : 'text-gray-500 hover:text-red-600'}`}
                                title="Sort by Top Fallers (Decline)"
                            >
                                <TrendingDown className="w-3 h-3" /> Fallers
                            </button>
                        </div>
                    )}

                    <span className="text-xs font-bold text-gray-400 pl-1 uppercase">Group by</span>
                    <div className="flex">
                        <button 
                            onClick={() => !isInventoryContext && !isAgedContext && setGroupBy('platform')} 
                            disabled={isInventoryContext || isAgedContext}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${groupBy === 'platform' ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100' : 'text-gray-500 hover:text-gray-700'} ${(isInventoryContext || isAgedContext) ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <Layers className="w-3 h-3" /> Platform
                        </button>
                        <button 
                            onClick={() => setGroupBy('sku')} 
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${groupBy === 'sku' ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Package className="w-3 h-3" /> SKU
                        </button>
                    </div>
                </div>
            </div>
        </div>
        )}
      {renderContent()}
    </div>
  );
};

export default SearchResultsPage;
