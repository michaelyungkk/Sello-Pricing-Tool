
import React, { useState, useMemo, useEffect } from 'react';
import { Product, PricingRules, SearchConfig } from '../types';
import { Layers, ListFilter, TrendingDown, ArrowRight, X, ChevronDown, Package, Activity, ChevronRight, RotateCcw, AlertTriangle, Coins, Calendar, ShoppingBag, Megaphone, PieChart, DollarSign, Filter, Edit2, Check, Clock } from 'lucide-react';
import { SearchIntent } from '../services/geminiService';

interface SearchResultsPageProps {
  data: { results: any[], query: string, params: SearchIntent, id?: string };
  products: Product[];
  pricingRules: PricingRules;
  themeColor: string;
  headerStyle: React.CSSProperties;
  timeLabel?: string;
  onRefine: (sessionId: string, newIntent: SearchIntent) => void;
  searchConfig: SearchConfig;
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
    tacos: number;
    contribution: number; 
    items: any[];
    // Inventory Context Specific
    platformVelocity?: number;
    platformCover?: number;
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
    tacos: number;
    contribution: number; 
    subGroups: Record<string, SubGroup>;
    // Inventory Context Specific
    globalVelocity?: number;
    globalCover?: number;
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
    velocityChange: 'Trend',
    netPmPercent: 'Net Margin',
    qty: 'Qty',
    name: 'Name',
    platform: 'Platform'
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
    const logicString = `${displayField} ${filter.operator} ${displayValue}`;
    
    const displayContent = filter.label 
        ? <><span className="font-bold">{filter.label}:</span> <span className="opacity-80 ml-1 font-mono text-[10px]">{logicString}</span></>
        : <span className="font-mono text-xs font-medium">{logicString}</span>;

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
            title="Click to edit filter criteria"
        >
            {displayContent}
            <button 
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-indigo-50 rounded-full text-indigo-400 hover:text-red-500 transition-all"
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    );
};

const SearchResultsPage: React.FC<SearchResultsPageProps> = ({ data, products, pricingRules, themeColor, headerStyle, timeLabel, onRefine, searchConfig }) => {
  const [groupBy, setGroupBy] = useState<GroupBy>('platform');
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [expandedSubGroup, setExpandedSubGroup] = useState<string | null>(null);

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

  useMemo(() => {
      setExpandedGroup(null);
      setExpandedSubGroup(null);
  }, [groupBy]);

  const checkContext = (keywords: string[], fields: string[]) => {
      const q = data.query.toLowerCase();
      const p = data.params;
      const matchesKeyword = keywords.some(k => q.includes(k));
      const hasFilter = p?.filters?.some((f: any) => fields.includes(f.field));
      // Fix: Guard against undefined sort field for strict null checks
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
      ['margin', 'profit', 'netPmPercent']
  ), [data]);

  const isInventoryContext = useMemo(() => checkContext(
      ['stock', 'inventory', 'runway', 'cover', 'days remaining', 'days cover', 'overstock', 'out of stock', 'level'], 
      ['stockLevel', 'daysRemaining']
  ), [data]);

  const isTrendContext = useMemo(() => checkContext(
      ['drop', 'decline', 'growth', 'change', 'trend', 'wow', 'spike'], 
      ['velocityChange']
  ), [data]);

  const isReturnContext = useMemo(() => checkContext(
      ['return', 'refund', 'rate'], 
      ['returnRate']
  ), [data]);

  // Force SKU view in Inventory Context
  useEffect(() => {
      if (isInventoryContext) {
          setGroupBy('sku');
      }
  }, [isInventoryContext]);


  const hierarchicalData = useMemo<TopGroup[]>(() => {
    if (!data.results) return [];
    
    const groups: Record<string, TopGroup> = {};

    data.results.forEach(item => {
      const mainKey = groupBy === 'platform' ? (item.platform || 'Unknown') : item.sku;
      
      // Initialize Top Group if missing
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
          tacos: 0,
          contribution: 0,
          subGroups: {},
          globalVelocity: 0,
          globalCover: 0
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
      }

      // --- INVENTORY CONTEXT LOGIC (With Hierarchical Channels) ---
      if (isInventoryContext && item.type === 'INVENTORY' && groupBy === 'sku') {
          // In Inventory Search, item is a Product Snapshot row.
          // totalQty is essentially the Stock Level in this context aggregation from search processor.
          // item.averageDailySales is the Global Velocity.
          
          const gVel = item.averageDailySales || 0;
          topGroup.globalVelocity = gVel;
          topGroup.totalQty = item.stockLevel; // Force Stock Level as Qty
          // Cover = Stock / Global Velocity
          topGroup.globalCover = gVel > 0 ? (item.stockLevel / gVel) : 999;

          // Build Sub-Groups from Channel Data attached to the item
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
                          tacos: 0,
                          contribution: 0,
                          items: [],
                          platformVelocity: ch.velocity,
                          // Platform Cover = GLOBAL STOCK / PLATFORM VELOCITY
                          platformCover: ch.velocity > 0 ? (item.stockLevel / ch.velocity) : 999
                      };
                  }
                  
                  // For Channel rows, velocity is avg daily sales. 
                  // Calculate estimated daily revenue for this platform
                  const estRevenue = ch.velocity * (ch.price || item.price);

                  topGroup.subGroups[subKey].items.push({
                      date: item.date,
                      price: ch.price || item.price,
                      velocity: ch.velocity,
                      revenue: estRevenue, // Added calculated revenue
                      stockLevel: item.stockLevel, // Contextual stock
                      type: 'INVENTORY_CHANNEL'
                  });
              });
          }
      } 
      // --- STANDARD TRANSACTION LOGIC ---
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
              tacos: 0,
              contribution: 0,
              items: []
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
          }
          subGroup.items.push(item);
      }
    });

    // Calculate aggregations for standard groups (Inventory pre-calc handled above)
    Object.values(groups).forEach(g => {
        g.weightedMargin = g.totalRevenue > 0 ? (g.totalProfit / g.totalRevenue) * 100 : 0;
        g.tacos = g.totalRevenue > 0 ? (g.totalAdSpend / g.totalRevenue) * 100 : 0;
        
        Object.values(g.subGroups).forEach(sg => {
            if (!sg.platformVelocity) { // Only calc if not already set by inventory logic
                sg.weightedMargin = sg.totalRevenue > 0 ? (sg.totalProfit / sg.totalRevenue) * 100 : 0;
                sg.tacos = sg.totalRevenue > 0 ? (sg.totalAdSpend / sg.totalRevenue) * 100 : 0;
            }
        });
    });

    return Object.values(groups).sort((a, b) => {
        // Priority: Explicit Sort from Intent
        if (data.params && data.params.sort) {
            const { field, direction } = data.params.sort;
            const dirMult = direction === 'asc' ? 1 : -1;
            
            // Map intent field to aggregated properties
            if (field === 'margin' || field === 'net_margin_pct' || field === 'netPmPercent') {
                return (a.totalProfit - b.totalProfit) * dirMult;
            }
            if (field === 'profit' || field === 'net_profit') {
                return (a.totalProfit - b.totalProfit) * dirMult;
            }
            if (field === 'revenue') {
                return (a.totalRevenue - b.totalRevenue) * dirMult;
            }
            if (field === 'velocity' || field === 'qty' || field === 'sales_qty') {
                return (a.totalQty - b.totalQty) * dirMult;
            }
            if (field === 'tacos' || field === 'tacos_pct' || field === 'adsSpend') {
                return (a.tacos - b.tacos) * dirMult;
            }
            if (field === 'stockLevel') {
                return (a.totalQty - b.totalQty) * dirMult;
            }
            if (field === 'daysRemaining' || field === 'stock_cover_days') {
                return ((a.globalCover || 0) - (b.globalCover || 0)) * dirMult;
            }
        }

        if (isInventoryContext) return a.totalQty - b.totalQty;
        if (isVolumeContext) return b.totalQty - a.totalQty;
        if (isAdContext) return b.tacos - a.tacos;
        if (isMarginContext) return b.totalProfit - a.totalProfit;
        return b.totalRevenue - a.totalRevenue;
    });
  }, [data.results, groupBy, isVolumeContext, isAdContext, isMarginContext, isInventoryContext, data.params]);

  // --- Volume Distribution Bands Logic ---
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

  if (!data) return null;

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

            return (
              <div key={group.key} className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                {/* Top Level Group Header */}
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
                     </div>
                  </div>
                  
                  <div className="flex items-center gap-8">
                    {/* Metric 1: Volume / Stock */}
                    <div className={`text-right hidden sm:block ${isVolumeContext ? 'scale-110 transform origin-right' : 'opacity-70'}`}>
                        <div className={`text-xs ${isVolumeContext ? 'text-indigo-600 font-bold' : 'text-gray-500'}`}>
                            {isInventoryContext ? 'Total Stock' : 'Units Sold'}
                        </div>
                        <div className="flex flex-col items-end">
                            <div className={`font-bold text-lg ${isVolumeContext ? 'text-indigo-700' : 'text-gray-800'}`}>
                                {group.totalQty.toLocaleString()}
                            </div>
                            {volumeBadge}
                        </div>
                    </div>

                    {/* Metric 2: Revenue OR Global Velocity */}
                    <div className="text-right hidden sm:block">
                        <div className="text-xs text-gray-500">
                            {isInventoryContext ? 'Global Velocity' : 'Total Revenue'}
                        </div>
                        <div className="font-bold text-lg text-gray-800">
                            {isInventoryContext 
                                ? `${(group.globalVelocity || 0).toFixed(1)}/day`
                                : `£${group.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}`
                            }
                        </div>
                    </div>

                    {/* Metric 2.5: Ad Spend (For Profit/Ad Context) */}
                    {(isMarginContext || isAdContext) && (
                        <div className="text-right hidden sm:block">
                            <div className="text-xs text-gray-500">
                                Total Ad Spend
                            </div>
                            <div className="font-bold text-lg text-orange-700">
                                £{group.totalAdSpend.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                            </div>
                        </div>
                    )}

                    {/* Metric 3: Dynamic (Margin / TACoS / Share / Global Cover) */}
                    <div className="text-right hidden md:block">
                        <div className="text-xs text-gray-500">
                            {isInventoryContext ? 'Global Cover' : isAdContext ? 'TACoS' : isMarginContext ? 'Net Contribution' : 'Sales Share'}
                        </div>
                        
                        {isMarginContext ? (
                            <div className="flex flex-col items-end">
                                <div className={`font-bold text-lg ${group.totalProfit < 0 ? 'text-red-600' : 'text-green-700'}`}>
                                    £{group.totalProfit.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 0})}
                                </div>
                                <div className={`text-xs ${group.weightedMargin < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                                    {group.weightedMargin.toFixed(1)}% Avg Margin
                                </div>
                            </div>
                        ) : (
                            <div className={`font-bold text-lg ${
                                isInventoryContext
                                    ? ((group.globalCover || 999) < 14 ? 'text-red-600' : (group.globalCover || 0) > 120 ? 'text-orange-600' : 'text-green-600')
                                    : isAdContext 
                                        ? (group.tacos > 25 ? 'text-red-600' : 'text-gray-800') 
                                        : 'text-indigo-600'
                            }`}>
                                {isInventoryContext 
                                    ? `${(group.globalCover || 0) > 730 ? '>2y' : (group.globalCover || 0).toFixed(0) + ' days'}`
                                    : isAdContext ? `${group.tacos.toFixed(1)}%` 
                                    : `${group.contribution.toFixed(1)}%`}
                            </div>
                        )}
                    </div>

                    <div className={`transition-transform duration-200 ${expandedGroup === group.key ? 'rotate-180' : ''}`}>
                        <ChevronDown className="w-5 h-5 text-gray-400" />
                    </div>
                  </div>
                </div>

                {/* Expanded Content (Sub-Groups) */}
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
                                        if (field === 'margin' || field === 'net_margin_pct' || field === 'netPmPercent') return (a.totalProfit - b.totalProfit) * dirMult;
                                        if (field === 'profit' || field === 'net_profit') return (a.totalProfit - b.totalProfit) * dirMult;
                                        if (field === 'revenue') return (a.totalRevenue - b.totalRevenue) * dirMult;
                                        if (field === 'velocity' || field === 'qty' || field === 'sales_qty') return (a.totalQty - b.totalQty) * dirMult;
                                        if (field === 'tacos' || field === 'tacos_pct' || field === 'adsSpend') return (a.tacos - b.tacos) * dirMult;
                                    }

                                    return isInventoryContext ? (b.platformVelocity || 0) - (a.platformVelocity || 0)
                                    : isVolumeContext ? b.totalQty - a.totalQty 
                                    : isAdContext ? b.tacos - a.tacos 
                                    : isMarginContext ? b.totalProfit - a.totalProfit
                                    : b.contribution - a.contribution
                                })
                                .map(sub => {
                                    const compositeKey = `${group.key}|${sub.key}`;
                                    const isSubExpanded = expandedSubGroup === compositeKey;

                                    return (
                                        <div key={sub.key} className="bg-white/40">
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
                                                    {/* INVENTORY CONTEXT SUB-COLUMNS */}
                                                    {isInventoryContext ? (
                                                        <>
                                                            <div className="text-right">
                                                                <div className="text-xs text-gray-400">Plat. Velocity</div>
                                                                <div className="text-sm font-bold text-indigo-600">{(sub.platformVelocity || 0).toFixed(2)}/d</div>
                                                            </div>
                                                            <div className="text-right w-24">
                                                                <div className="text-xs text-gray-400">Plat. Cover</div>
                                                                <div className={`text-sm font-bold ${(sub.platformCover || 999) < 28 ? 'text-red-600' : 'text-green-600'}`}>
                                                                    {(sub.platformCover || 0).toFixed(0)} days
                                                                </div>
                                                            </div>
                                                        </>
                                                    ) : (
                                                        /* TRANSACTION CONTEXT SUB-COLUMNS */
                                                        <>
                                                            <div className="text-right w-16">
                                                                <div className="text-xs text-gray-400">Qty</div>
                                                                <div className="text-sm font-bold text-gray-700">{sub.totalQty}</div>
                                                            </div>
                                                            <div className="text-right">
                                                                <div className="text-xs text-gray-400">Revenue</div>
                                                                <div className="text-sm font-medium text-gray-700">£{sub.totalRevenue.toFixed(0)}</div>
                                                            </div>
                                                            {(isMarginContext || isAdContext) && (
                                                                <div className="text-right">
                                                                    <div className="text-xs text-gray-400">Ad Spent</div>
                                                                    <div className="text-sm font-medium text-orange-700">£{sub.totalAdSpend.toFixed(0)}</div>
                                                                </div>
                                                            )}
                                                            <div className="text-right w-24">
                                                                <div className="text-xs text-gray-400">
                                                                    {isAdContext ? 'TACoS' : isMarginContext ? 'Net Profit' : 'Share %'}
                                                                </div>
                                                                <span className={`text-sm font-bold ${
                                                                    isAdContext ? (sub.tacos > 20 ? 'text-red-600' : 'text-gray-700') :
                                                                    isMarginContext ? (sub.totalProfit < 0 ? 'text-red-600' : 'text-green-600') :
                                                                    'text-indigo-600'
                                                                }`}>
                                                                    {isAdContext ? `${sub.tacos.toFixed(1)}%` :
                                                                     isMarginContext ? `£${sub.totalProfit.toFixed(0)}` :
                                                                     `${sub.contribution.toFixed(1)}%`}
                                                                </span>
                                                            </div>
                                                        </>
                                                    )}
                                                </div>
                                            </div>

                                            {isSubExpanded && (
                                                <div className="px-6 pb-4 animate-in fade-in slide-in-from-top-1">
                                                    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
                                                        <table className="w-full text-xs text-left">
                                                            <thead className="bg-gray-50 text-gray-500 font-medium">
                                                                <tr>
                                                                    <th className="p-2 pl-3">Date</th>
                                                                    <th className="p-2 text-right">Unit Price</th>
                                                                    <th className="p-2 text-right">
                                                                        {isInventoryContext ? 'Velocity' : 'Qty'}
                                                                    </th>
                                                                    <th className="p-2 text-right">
                                                                        {isInventoryContext ? 'Est. Daily Rev' : 'Revenue'}
                                                                    </th>
                                                                    {(isAdContext || isMarginContext) && <th className="p-2 text-right">Ad Spend</th>}
                                                                    {isAdContext && <th className="p-2 text-right">TACoS</th>}
                                                                    {isInventoryContext && <th className="p-2 text-right">Stock</th>}
                                                                    {isInventoryContext && <th className="p-2 text-right">Stock Cover</th>}
                                                                    {isTrendContext && <th className="p-2 text-right">Trend</th>}
                                                                    {isReturnContext && <th className="p-2 text-right">Return %</th>}
                                                                    <th className="p-2 text-right">Profit</th>
                                                                    <th className="p-2 text-right">Margin %</th>
                                                                    <th className="p-2 text-right">Share %</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-gray-100">
                                                                {sub.items
                                                                    .sort((a,b) => {
                                                                        if (isAdContext && (a.tacos !== b.tacos)) return (b.tacos || 0) - (a.tacos || 0);
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
                                                                            {new Date(tx.date).toLocaleDateString()}
                                                                        </td>
                                                                        <td className={`p-2 text-right font-medium ${tx.type === 'AD_COST' ? 'text-orange-600' : tx.type === 'REFUND' ? 'text-red-600' : 'text-gray-900'}`}>
                                                                            {tx.type === 'AD_COST' ? (
                                                                                <span className="text-[9px] bg-orange-50 text-orange-700 px-1 rounded border border-orange-100 uppercase font-bold">Ad Spend</span>
                                                                            ) : (
                                                                                `£${Math.abs(tx.price || 0).toFixed(2)}`
                                                                            )}
                                                                        </td>
                                                                        <td className="p-2 text-right text-gray-900 font-bold">
                                                                            {isInventoryContext ? tx.velocity.toFixed(3) : tx.velocity}
                                                                        </td>
                                                                        <td className="p-2 text-right text-gray-700">£{(tx.revenue || 0).toFixed(2)}</td>
                                                                        {(isAdContext || isMarginContext) && (
                                                                            <td className="p-2 text-right text-orange-700">
                                                                                {tx.adsSpend > 0 ? `£${tx.adsSpend.toFixed(2)}` : '-'}
                                                                            </td>
                                                                        )}
                                                                        {isAdContext && (
                                                                            <td className="p-2 text-right">
                                                                                {tx.tacos > 0 ? (
                                                                                    <span className={`${tx.tacos > 15 ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                                                                        {tx.tacos.toFixed(1)}%
                                                                                    </span>
                                                                                ) : '-'}
                                                                            </td>
                                                                        )}
                                                                        
                                                                        {isInventoryContext && (
                                                                            <>
                                                                                <td className="p-2 text-right text-gray-800 font-medium">
                                                                                    {tx.stockLevel !== undefined ? tx.stockLevel : '-'}
                                                                                </td>
                                                                                <td className="p-2 text-right">
                                                                                    {tx.daysRemaining !== undefined ? (
                                                                                        <span className={`${tx.daysRemaining < 14 ? 'text-red-600 font-bold' : 'text-green-600'}`}>
                                                                                            {tx.daysRemaining.toFixed(0)}d
                                                                                        </span>
                                                                                    ) : '-'}
                                                                                </td>
                                                                            </>
                                                                        )}
                                                                        {isTrendContext && (
                                                                            <td className="p-2 text-right">
                                                                                {tx.velocityChange !== undefined ? (
                                                                                    <span className={`${tx.velocityChange < -20 ? 'text-red-600' : tx.velocityChange > 20 ? 'text-green-600' : 'text-gray-500'}`}>
                                                                                        {tx.velocityChange > 0 ? '+' : ''}{tx.velocityChange.toFixed(0)}%
                                                                                    </span>
                                                                                ) : '-'}
                                                                            </td>
                                                                        )}
                                                                        {isReturnContext && (
                                                                            <td className="p-2 text-right">
                                                                                {tx.returnRate !== undefined ? (
                                                                                    <span className={`${tx.returnRate > 5 ? 'text-red-600 font-bold' : 'text-gray-600'}`}>
                                                                                        {tx.returnRate.toFixed(1)}%
                                                                                    </span>
                                                                                ) : '-'}
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
                                                                                <span className={`${(tx.margin || 0) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                                                                                    {(tx.margin || 0).toFixed(1)}%
                                                                                </span>
                                                                            )}
                                                                        </td>
                                                                        <td className="p-2 text-right text-xs text-gray-400 font-medium">
                                                                            {tx.contribution ? `${tx.contribution.toFixed(1)}%` : '-'}
                                                                        </td>
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
        {data.params && data.params.filters && data.params.filters.length > 0 && (
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
                    <span className="text-xs font-bold text-gray-400 pl-2 uppercase">Group by</span>
                    <div className="flex">
                        <button 
                            onClick={() => !isInventoryContext && setGroupBy('platform')} 
                            disabled={isInventoryContext}
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${groupBy === 'platform' ? 'bg-indigo-50 text-indigo-700 shadow-sm border border-indigo-100' : 'text-gray-500 hover:text-gray-700'} ${isInventoryContext ? 'opacity-50 cursor-not-allowed' : ''}`}
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
      {renderContent()}
    </div>
  );
};

export default SearchResultsPage;
