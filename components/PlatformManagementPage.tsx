import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, PricingRules, PriceLog, PlatformConfig } from '../types';
import { LayoutDashboard, Coins, Globe, TrendingUp, Info, Activity, Package, User, Hash, ShoppingBag, Trophy, Megaphone, ReceiptText, BarChart3, ChevronRight, PieChart, TrendingDown as TrendingDownIcon, Target, Scale, Zap, Database, X, Wallet, HelpCircle, Wrench, ChevronUp, ChevronDown, Calendar, Plus, Check, Layers, Settings, CheckSquare, Square, ArrowUpRight, ArrowDownRight, BellRing, RotateCcw, BarChart as BarChartIcon } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SortState, sortRows } from '../utils/tableSort';
import { SortableHeader } from './common/SortableHeader';
import { formatMoney, formatPct, formatNumber } from '../utils/format';
import { calcRevenue, calcProfit, calcUnits, calcAdSpend } from '../services/metrics';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip as RechartsTooltip, Cell, ReferenceLine, LineChart, Line, Legend, ReferenceArea, BarChart, Bar } from 'recharts';
import { VAT_MULTIPLIER } from '../constants';
import { TAX_NOTE_SHORT } from '../services/taxPolicy';
import { aggregatePlatformTrends, PlatformTrendData } from '../services/platformTrendAgg';
import { buildWindow } from '../services/dateWindow';
import { asDateKey, isDateKeyBetween, getTodayKeyMelbourne } from '../services/dateUtils';
import { Tab3AlertRules, getTab3AlertRules, saveTab3AlertRules, DEFAULT_TAB3_ALERT_RULES } from '../services/platformAlertRules';

interface PlatformManagementPageProps {
  products: Product[];
  priceHistoryMap: Map<string, PriceLog[]>;
  pricingRules: PricingRules;
  themeColor: string;
  headerStyle: React.CSSProperties;
}

type PlatformKey = string;
type TimeWindow = '7D' | '14D' | '30D' | '60D' | 'ALL' | 'CUSTOM';

interface PlatformSummary {
  platform: PlatformKey;
  revenue: number;
  profit: number; // Gross
  netProfit: number; // Net After Ads
  orders: number;
  units: number;
  adSpend: number;
  marginPct: number;
  tacosPct: number | null;
  skuCount: number;
  hasAdData: boolean;
}

interface PlatformFeesRoi {
  platform: string;
  revenue: number;
  profit: number;
  marginPct: number | null;
  adSpend: number;
  tacosPct: number | null;
  orders: number;
  units: number;
  estMarketplaceFees?: number;
  netAfterAds?: number;
  roiAfterAds?: number | null;
  dataQuality: {
    hasAdData: boolean;
    hasProfit: boolean;
    profitIsEstimated: boolean;
  };
}

type PlatformSortKey = keyof PlatformSummary | keyof PlatformFeesRoi | 'manager' | 'name' | 'skus' | 'margin' | 'velocity';

type Tab = 'overview' | 'roi' | 'performance';

interface Flag {
    label: string;
    style: string;
    tooltip: string;
}

const SummaryCard = ({ title, platform, delta, value, type }: { title: string, platform?: string, delta?: number | null, value?: number, type: 'pos' | 'neg' | 'info' }) => {
    const Icon = type === 'pos' ? ArrowUpRight : type === 'neg' ? ArrowDownRight : Activity;
    const colorClass = type === 'pos' ? 'text-green-600' : type === 'neg' ? 'text-red-600' : 'text-indigo-600';
    const bgClass = type === 'pos' ? 'bg-green-50' : type === 'neg' ? 'bg-red-50' : 'bg-indigo-50';

    return (
        <div className="bg-white p-3.5 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between min-w-0">
            <div className="min-w-0 flex-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1 truncate">{title}</span>
                <div className="font-bold text-gray-900 truncate text-sm">
                    {platform || '—'}
                </div>
                <div className={`text-xs font-black mt-1 flex items-center gap-1 ${colorClass}`}>
                    {delta !== undefined && delta !== null ? (
                        <>
                            {delta > 0 ? '+' : ''}{delta.toFixed(1)}%
                        </>
                    ) : value !== undefined ? (
                        formatMoney(value, 0)
                    ) : '—'}
                </div>
            </div>
            <div className={`p-1.5 rounded-lg shrink-0 ml-3 ${bgClass} ${colorClass}`}>
                <Icon className="w-4 h-4" />
            </div>
        </div>
    );
};

const FocusPlatformDropdown = ({ 
    platforms = [], 
    selected = [], 
    onChange 
}: { 
    platforms?: string[], 
    selected?: string[], 
    onChange: (p: string[]) => void 
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const togglePlatform = (p: string) => {
        if (selected.includes(p)) {
            onChange(selected.filter(s => s !== p));
        } else {
            onChange([...selected, p]);
        }
    };

    const handleReset = () => {
        onChange(platforms);
    };

    const handleClear = () => {
        onChange([]);
    };

    let label = "Select Platforms";
    if (selected.length === platforms.length && platforms.length > 0) label = "All Platforms Visible";
    else if (selected.length === 0) label = "Hidden (None)";
    else if (selected.length === 1) label = selected[0];
    else label = `${selected.length} Platforms Visible`;

    return (
        <div className="relative" ref={dropdownRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex items-center justify-between px-4 py-2.5 bg-white border border-gray-300 rounded-xl text-sm font-bold text-gray-700 shadow-sm hover:border-indigo-300 transition-all"
            >
                <div className="flex items-center gap-2 truncate">
                    <Layers className="w-4 h-4 text-indigo-500" />
                    <span className="truncate">{label}</span>
                </div>
                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-2 w-72 bg-white border border-gray-200 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100 origin-top-left">
                    <div className="p-3 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-wide">Visibility</span>
                        <div className="flex gap-3">
                            <button onClick={handleClear} className="text-[10px] font-bold text-gray-500 hover:text-red-600">Clear</button>
                            <button onClick={handleReset} className="text-[10px] font-bold text-indigo-600 hover:text-indigo-700 hover:underline">All</button>
                        </div>
                    </div>
                    <div className="max-h-64 overflow-y-auto p-1">
                        {platforms.map(p => {
                            const isSelected = selected.includes(p);
                            return (
                                <button 
                                    key={p} 
                                    onClick={() => togglePlatform(p)}
                                    className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 rounded-lg transition-colors text-left group"
                                >
                                    <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all flex-shrink-0 ${isSelected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white group-hover:border-gray-400'}`}>
                                        {isSelected && <Check className="w-3 h-3 text-white" />}
                                    </div>
                                    <span className={`text-xs truncate ${isSelected ? 'font-bold text-gray-900' : 'font-medium text-gray-600'}`}>{p}</span>
                                </button>
                            )
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

export const PlatformManagementPage: React.FC<PlatformManagementPageProps> = ({
  products = [],
  priceHistoryMap = new Map(),
  pricingRules = {},
  themeColor,
  headerStyle
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [sort, setSort] = useState<SortState<PlatformSortKey>>({ key: 'revenue', dir: 'desc' });
  const [selectedPlatformKey, setSelectedPlatformKey] = useState<PlatformKey | null>(null);
  const [showDebug, setShowDebug] = useState(false);
  
  // Time Window State
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30D');
  const [customStart, setCustomStart] = useState<string>(getTodayKeyMelbourne());
  const [customEnd, setCustomEnd] = useState<string>(getTodayKeyMelbourne());
  const [isCustomDateModalOpen, setIsCustomDateModalOpen] = useState(false);

  type PerformanceTrendMetric = 'NET_PROFIT' | 'MARGIN_PCT' | 'AVG_ORDER_VALUE' | 'UNITS_SOLD';
  const [trendMetric, setTrendMetric] = useState<PerformanceTrendMetric>('NET_PROFIT');

  // Series visibility state for chart legend
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());

  // --- Alert Rules State ---
  const [alertRules, setAlertRules] = useState<Tab3AlertRules>(getTab3AlertRules());
  const [isAlertRulesOpen, setIsAlertRulesOpen] = useState(false);

  // --- Date Window Calculation ---
  const dateWindow = useMemo(() => {
      let mode: 'days' | 'custom' | 'all' = 'days';
      let days = 30;

      if (timeWindow === 'ALL') mode = 'all';
      else if (timeWindow === 'CUSTOM') mode = 'custom';
      else days = parseInt(timeWindow.replace('D', ''));

      return buildWindow({
          mode,
          days,
          startKey: customStart,
          endKey: customEnd,
          excludeToday: true 
      });
  }, [timeWindow, customStart, customEnd]);

  // Format label for UI
  const periodLabel = useMemo(() => {
      const start = new Date(dateWindow.startKey);
      const end = new Date(dateWindow.endKey);
      const format = (d: Date, withYear: boolean) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined, timeZone: 'UTC' });
      const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
      return `${format(start, !sameYear)} – ${format(end, true)}`;
  }, [dateWindow]);

  // --- Filtered History ---
  const filteredPriceHistoryMap = useMemo(() => {
      if (timeWindow === 'ALL') return priceHistoryMap;

      const filteredMap = new Map<string, PriceLog[]>();
      const { startKey, endKey } = dateWindow;

      priceHistoryMap.forEach((logs, sku) => {
          const filteredLogs = logs.filter(log => {
              const dKey = asDateKey(log.date);
              return dKey && isDateKeyBetween(dKey, startKey, endKey);
          });
          if (filteredLogs.length > 0) {
              filteredMap.set(sku, filteredLogs);
          }
      });
      return filteredMap;
  }, [priceHistoryMap, dateWindow, timeWindow]);

  // Full history for trends (needs context outside window)
  const allPriceLogs = useMemo(() => Array.from(priceHistoryMap.values()).flat(), [priceHistoryMap]);

  // --- Aggregations based on Filtered Data ---

  const platformSummaries = useMemo<PlatformSummary[]>(() => {
    const dataMap: Record<PlatformKey, {
      revenue: number;
      profit: number;
      units: number;
      adSpend: number;
      orderIds: Set<string>;
      nonOrderRows: number;
      skus: Set<string>;
      adRowsCount: number;
    }> = {};

    filteredPriceHistoryMap.forEach((logs, sku) => {
      logs.forEach((log) => {
        const pKey = log.platform || 'Unknown';
        if (!dataMap[pKey]) {
          dataMap[pKey] = {
            revenue: 0,
            profit: 0,
            units: 0,
            adSpend: 0,
            orderIds: new Set<string>(),
            nonOrderRows: 0,
            skus: new Set<string>(),
            adRowsCount: 0,
          };
        }
        const stats = dataMap[pKey];
        stats.revenue += calcRevenue(log);
        stats.profit += calcProfit(log);
        stats.units += calcUnits(log);
        stats.adSpend += calcAdSpend(log);
        stats.skus.add(sku);

        if (log.adsSpend !== undefined && log.adsSpend !== null) {
          stats.adRowsCount++;
        }

        if (log.orderId) {
          stats.orderIds.add(log.orderId);
        } else {
          stats.nonOrderRows += 1;
        }
      });
    });

    return Object.entries(dataMap).map(([platform, stats]): PlatformSummary => {
      const revenue = stats.revenue * VAT_MULTIPLIER;
      const adSpend = stats.adSpend * VAT_MULTIPLIER;
      const netProfit = stats.profit * VAT_MULTIPLIER;
      const grossProfit = netProfit + adSpend;
      const hasAdData = stats.adRowsCount > 0;

      return {
        platform,
        revenue,
        profit: grossProfit, 
        netProfit: netProfit,
        units: stats.units,
        adSpend,
        orders: stats.orderIds.size + stats.nonOrderRows,
        marginPct: revenue > 0 ? (netProfit / revenue) * 100 : 0,
        tacosPct: (revenue > 0 && hasAdData) ? (adSpend / revenue) * 100 : null,
        skuCount: stats.skus.size,
        hasAdData
      };
    });
  }, [filteredPriceHistoryMap]);

  const roiData = useMemo<PlatformFeesRoi[]>(() => {
    const dataMap: Record<PlatformKey, {
      revenue: number;
      profit: number;
      units: number;
      adSpend: number;
      orderCount: number;
      explicitProfitRows: number;
      explicitAdRows: number;
      totalRows: number;
    }> = {};

    filteredPriceHistoryMap.forEach((logs) => {
      logs.forEach((log) => {
        const pKey = log.platform || 'Unknown';
        if (!dataMap[pKey]) {
          dataMap[pKey] = {
            revenue: 0,
            profit: 0,
            units: 0,
            adSpend: 0,
            orderCount: 0,
            explicitProfitRows: 0,
            explicitAdRows: 0,
            totalRows: 0
          };
        }
        const stats = dataMap[pKey];
        stats.revenue += calcRevenue(log);
        stats.profit += calcProfit(log);
        stats.units += calcUnits(log);
        stats.adSpend += calcAdSpend(log);
        stats.totalRows += 1;
        stats.orderCount += 1;

        if (log.profit !== undefined && log.profit !== null) {
          stats.explicitProfitRows += 1;
        }
        if (log.adsSpend !== undefined && log.adsSpend !== null) {
          stats.explicitAdRows += 1;
        }
      });
    });

    return Object.entries(dataMap).map(([platform, stats]): PlatformFeesRoi => {
      const revenue = stats.revenue * VAT_MULTIPLIER;
      const adSpend = stats.adSpend * VAT_MULTIPLIER;
      const netProfit = stats.profit * VAT_MULTIPLIER;
      const grossProfit = netProfit + adSpend;
      const hasAdData = stats.explicitAdRows > 0;
      
      const marginPctVal = revenue > 0 ? (netProfit / revenue) * 100 : null;
      const tacosPctVal = (revenue > 0 && hasAdData) ? (adSpend / revenue) * 100 : null;
      
      const config = pricingRules[platform];
      const netAfterAds = netProfit;
      const roiAfterAds = adSpend > 0 ? (netAfterAds / adSpend) : null;

      return {
        platform,
        revenue,
        profit: grossProfit,
        marginPct: marginPctVal,
        adSpend,
        tacosPct: tacosPctVal,
        orders: stats.orderCount,
        units: stats.units,
        estMarketplaceFees: config ? (revenue * (config.commission / 100)) : undefined,
        netAfterAds,
        roiAfterAds,
        dataQuality: {
          hasAdData,
          hasProfit: stats.totalRows > 0,
          profitIsEstimated: stats.explicitProfitRows < stats.totalRows
        }
      };
    });
  }, [filteredPriceHistoryMap, pricingRules]);

  const uniquePlatforms = useMemo(() => (pricingRules ? Object.keys(pricingRules).sort() : []), [pricingRules]);

  // -- UPDATED STATE LOGIC FOR TREND CHART --
  const [selectedChartPlatforms, setSelectedChartPlatforms] = useState<string[]>([]);
  const isSelectionInitialized = useRef(false);

  const [platformGroups, setPlatformGroups] = useState<Array<{ id: string; name: string; platformKeys: string[] }>>(() => {
      try {
          const stored = localStorage.getItem("platformTrend:platformGroups");
          if (stored) {
              const parsed = JSON.parse(stored);
              if (Array.isArray(parsed) && parsed.every(item => item && typeof item === 'object' && Array.isArray(item.platformKeys))) {
                  return parsed;
              }
          }
          return [];
      } catch { return []; }
  });

  const [isGroupCreatorOpen, setIsGroupCreatorOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupPlatforms, setNewGroupPlatforms] = useState<string[]>([]);

  useEffect(() => {
    if (!isSelectionInitialized.current && uniquePlatforms.length > 0) {
      const stored = localStorage.getItem("platformTrend:selectedPlatforms");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            setSelectedChartPlatforms(parsed);
          } else {
            setSelectedChartPlatforms(uniquePlatforms);
          }
        } catch {
          setSelectedChartPlatforms(uniquePlatforms);
        }
      } else {
        setSelectedChartPlatforms(uniquePlatforms);
      }
      isSelectionInitialized.current = true;
    }
  }, [uniquePlatforms]);

  useEffect(() => {
    if (isSelectionInitialized.current) {
      localStorage.setItem("platformTrend:selectedPlatforms", JSON.stringify(selectedChartPlatforms));
    }
  }, [selectedChartPlatforms]);

  useEffect(() => {
      localStorage.setItem("platformTrend:platformGroups", JSON.stringify(platformGroups));
  }, [platformGroups]);

  const handleCreateGroup = () => {
      if (!newGroupName.trim() || newGroupPlatforms.length === 0) return;
      const newGroup = {
          id: `grp-${Date.now()}`,
          name: newGroupName.trim(),
          platformKeys: newGroupPlatforms
      };
      setPlatformGroups([...platformGroups, newGroup]);
      setIsGroupCreatorOpen(false);
      setNewGroupName("");
      setNewGroupPlatforms([]);
  };

  const deleteGroup = (id: string) => {
      setPlatformGroups(platformGroups.filter(g => g.id !== id));
  };

  const toggleNewGroupPlatform = (p: string) => {
      if (newGroupPlatforms.includes(p)) {
          setNewGroupPlatforms(newGroupPlatforms.filter(x => x !== p));
      } else {
          setNewGroupPlatforms([...newGroupPlatforms, p]);
      }
  };

  const handleLegendClick = (o: any) => {
    if (!o || !o.dataKey) return;
    const name = o.dataKey.replace(`_${trendMetric}`, '');
    setHiddenSeries(prev => {
        const next = new Set(prev);
        if (next.has(name)) next.delete(name);
        else next.add(name);
        return next;
    });
  };

  const trendData = useMemo(() => {
    return aggregatePlatformTrends(allPriceLogs, { startKey: dateWindow.startKey, endKey: dateWindow.endKey }, uniquePlatforms);
  }, [allPriceLogs, uniquePlatforms, dateWindow]);

  const performanceSummary = useMemo(() => {
      if (trendData.length === 0) return null;
      const validDeltas = trendData.filter(d => d.deltas.revenueDeltaPct !== null);
      const gainer = [...validDeltas].sort((a, b) => (b.deltas.revenueDeltaPct! - a.deltas.revenueDeltaPct!) || (b.current.revenue - a.current.revenue))[0];
      const loser = [...validDeltas].sort((a, b) => (a.deltas.revenueDeltaPct! - b.deltas.revenueDeltaPct!) || (b.current.revenue - a.current.revenue))[0];
      const improvedNet = trendData.filter(d => d.deltas.netProfitDeltaPct !== null).sort((a, b) => (b.deltas.netProfitDeltaPct! - a.deltas.netProfitDeltaPct!) || (b.current.revenue - a.current.revenue))[0];
      const worstNet = [...trendData].sort((a, b) => (a.current.netProfit - b.current.netProfit) || (a.current.revenue - b.current.revenue))[0];
      return { gainer, loser, improvedNet, worstNet };
  }, [trendData]);

  const dailyTrendData = useMemo(() => {
    const { startKey, endKey } = dateWindow;
    const daysMap = new Map<string, any>();
    const activePlatforms = new Set<string>();

    filteredPriceHistoryMap.forEach((logs) => {
        logs.forEach(log => {
            const dKey = asDateKey(log.date);
            if (!dKey || !isDateKeyBetween(dKey, startKey, endKey)) return;
            const platform = log.platform || 'Unknown';
            activePlatforms.add(platform);
            if (!daysMap.has(dKey)) daysMap.set(dKey, { date: dKey });
            const entry = daysMap.get(dKey);
            if (!entry._acc) entry._acc = {};
            if (!entry._acc[platform]) entry._acc[platform] = { revenue: 0, net: 0, orders: 0, units: 0, orderIds: new Set() };
            const pAcc = entry._acc[platform];
            const rev = calcRevenue(log) * VAT_MULTIPLIER;
            const net = calcProfit(log) * VAT_MULTIPLIER;
            pAcc.revenue += rev;
            pAcc.net += net;
            pAcc.units += calcUnits(log);
            if (log.orderId) {
                if (!pAcc.orderIds.has(log.orderId)) {
                    pAcc.orderIds.add(log.orderId);
                    pAcc.orders += 1;
                }
            } else pAcc.orders += 1;
        });
    });

    const result = Array.from(daysMap.values()).map(day => {
        const flatDay: any = { date: day.date, _sort: new Date(day.date).getTime() };
        if (day._acc) {
            Object.entries(day._acc).forEach(([plat, stats]: [string, any]) => {
                flatDay[`${plat}_NET_PROFIT`] = stats.net;
                flatDay[`${plat}_MARGIN_PCT`] = stats.revenue > 0 ? (stats.net / stats.revenue) * 100 : 0;
                flatDay[`${plat}_AVG_ORDER_VALUE`] = stats.orders > 0 ? (stats.revenue / stats.orders) : 0;
                flatDay[`${plat}_UNITS_SOLD`] = stats.units;
                // Add revenue and orders mapping for group summation logic below
                flatDay[`${plat}_RAW_REVENUE`] = stats.revenue;
                flatDay[`${plat}_RAW_ORDERS`] = stats.orders;
            });
        }
        return flatDay;
    }).sort((a, b) => a._sort - b._sort);

    return { data: result, platforms: Array.from(activePlatforms).sort() };
  }, [filteredPriceHistoryMap, dateWindow]);

  const chartDataWithGroups = useMemo(() => {
      return dailyTrendData.data.map(day => {
          const enhancedDay = { ...day };
          platformGroups.forEach(group => {
              if (!group || !Array.isArray(group.platformKeys)) return;
              let sumNetProfit = 0; let sumRevenue = 0; let sumOrders = 0; let sumUnits = 0;
              group.platformKeys.forEach(platform => {
                  sumNetProfit += (enhancedDay[`${platform}_NET_PROFIT`] as number) || 0;
                  sumRevenue += (enhancedDay[`${platform}_RAW_REVENUE`] as number) || 0;
                  sumOrders += (enhancedDay[`${platform}_RAW_ORDERS`] as number) || 0;
                  sumUnits += (enhancedDay[`${platform}_UNITS_SOLD`] as number) || 0;
              });
              enhancedDay[`${group.name}_NET_PROFIT`] = sumNetProfit;
              enhancedDay[`${group.name}_MARGIN_PCT`] = sumRevenue > 0 ? (sumNetProfit / sumRevenue) * 100 : 0;
              enhancedDay[`${group.name}_AVG_ORDER_VALUE`] = sumOrders > 0 ? (sumRevenue / sumOrders) : 0;
              enhancedDay[`${group.name}_UNITS_SOLD`] = sumUnits;
          });
          return enhancedDay;
      });
  }, [dailyTrendData.data, platformGroups]);

  const barChartData = useMemo(() => {
    // Individual Platforms
    const platformsData = trendData
        .filter(d => selectedChartPlatforms.includes(d.platform))
        .map(d => {
            let currentVal = 0; let priorVal = 0;
            switch(trendMetric) {
                case 'NET_PROFIT': currentVal = d.current.netProfit; priorVal = d.prior.netProfit; break;
                case 'MARGIN_PCT': currentVal = d.current.marginPct; priorVal = d.prior.marginPct; break;
                case 'AVG_ORDER_VALUE': currentVal = d.current.avgOrderValue; priorVal = d.prior.avgOrderValue; break;
                case 'UNITS_SOLD': currentVal = d.current.unitsSold; priorVal = d.prior.unitsSold; break;
            }
            return { 
                platform: d.platform, 
                current: currentVal, 
                prior: priorVal,
                color: pricingRules[d.platform]?.color || '#9ca3af'
            };
        });

    // Custom Groups
    const groupsData = platformGroups.map((group, i) => {
        const groupMembers = trendData.filter(d => group.platformKeys.includes(d.platform));
        
        let currentVal = 0;
        let priorVal = 0;

        const sumCurrRev = groupMembers.reduce((s, m) => s + m.current.revenue, 0);
        const sumCurrProfit = groupMembers.reduce((s, m) => s + m.current.netProfit, 0);
        const sumCurrOrders = groupMembers.reduce((s, m) => s + m.current.orders, 0);
        const sumCurrUnits = groupMembers.reduce((s, m) => s + m.current.unitsSold, 0);

        const sumPriorRev = groupMembers.reduce((s, m) => s + m.prior.revenue, 0);
        const sumPriorProfit = groupMembers.reduce((s, m) => s + m.prior.netProfit, 0);
        const sumPriorOrders = groupMembers.reduce((s, m) => s + m.prior.orders, 0);
        const sumPriorUnits = groupMembers.reduce((s, m) => s + m.prior.unitsSold, 0);

        switch(trendMetric) {
            case 'NET_PROFIT': 
                currentVal = sumCurrProfit; 
                priorVal = sumPriorProfit; 
                break;
            case 'MARGIN_PCT': 
                currentVal = sumCurrRev > 0 ? (sumCurrProfit / sumCurrRev) * 100 : 0; 
                priorVal = sumPriorRev > 0 ? (sumPriorProfit / sumPriorRev) * 100 : 0; 
                break;
            case 'AVG_ORDER_VALUE': 
                currentVal = sumCurrOrders > 0 ? (sumCurrRev / sumCurrOrders) : 0; 
                priorVal = sumPriorOrders > 0 ? (sumPriorRev / sumPriorOrders) : 0; 
                break;
            case 'UNITS_SOLD': 
                currentVal = sumCurrUnits; 
                priorVal = sumPriorUnits; 
                break;
        }

        return { 
            platform: group.name, 
            current: currentVal, 
            prior: priorVal,
            color: ['#ec4899', '#8b5cf6', '#14b8a6', '#f59e0b', '#6366f1'][i % 5]
        };
    });

    const combined = [...platformsData, ...groupsData]
        .filter(d => !hiddenSeries.has(d.platform));

    // Find absolute max for Y axis to draw background bars
    const maxVal = combined.reduce((max, d) => Math.max(max, d.current, d.prior), 0);
    const bgHeight = maxVal * 1.2; // Headroom

    return combined.map(d => ({ ...d, bgValue: bgHeight }))
        .sort((a, b) => b.current - a.current);
  }, [trendData, selectedChartPlatforms, trendMetric, platformGroups, hiddenSeries, pricingRules]);

  const [zoomState, setZoomState] = useState({ startIndex: 0, endIndex: 0, isZoomed: false, lastDataLen: 0 });
  const [refAreaLeft, setRefAreaLeft] = useState<string>('');
  const [refAreaRight, setRefAreaRight] = useState<string>('');

  useEffect(() => {
    const len = chartDataWithGroups.length;
    if (len !== zoomState.lastDataLen) {
        setZoomState({ startIndex: 0, endIndex: Math.max(0, len - 1), lastDataLen: len, isZoomed: false });
    }
  }, [chartDataWithGroups.length]);

  const handleResetZoom = () => {
    setZoomState(prev => ({ ...prev, startIndex: 0, endIndex: Math.max(0, prev.lastDataLen - 1), isZoomed: false }));
    setRefAreaLeft(''); setRefAreaRight('');
  };

  const zoom = () => {
    if (!chartDataWithGroups.length || refAreaLeft === refAreaRight || refAreaRight === '') {
        setRefAreaLeft(''); setRefAreaRight('');
        return;
    }
    let leftIndex = chartDataWithGroups.findIndex(d => d.date === refAreaLeft);
    let rightIndex = chartDataWithGroups.findIndex(d => d.date === refAreaRight);
    if (leftIndex > rightIndex) [leftIndex, rightIndex] = [rightIndex, leftIndex];
    if (leftIndex < 0) leftIndex = 0;
    if (rightIndex < 0) rightIndex = Math.max(0, chartDataWithGroups.length - 1);
    setZoomState({ startIndex: leftIndex, endIndex: rightIndex, isZoomed: true, lastDataLen: chartDataWithGroups.length });
    setRefAreaLeft(''); setRefAreaRight('');
  };

  const visibleChartData = useMemo(() => {
      if (!chartDataWithGroups || chartDataWithGroups.length === 0) return [];
      return chartDataWithGroups.slice(zoomState.startIndex, Math.min(zoomState.endIndex + 1, chartDataWithGroups.length));
  }, [chartDataWithGroups, zoomState.startIndex, zoomState.endIndex]);

  const topPlatformKey = useMemo(() => {
    if (platformSummaries.length === 0) return null;
    return [...platformSummaries].sort((a, b) => b.netProfit - a.netProfit)[0].platform;
  }, [platformSummaries]);

  useEffect(() => {
    if (platformSummaries.length > 0 && !selectedPlatformKey) {
      const top = [...platformSummaries].sort((a, b) => b.netProfit - a.netProfit)[0];
      setSelectedPlatformKey(top.platform);
    }
  }, [platformSummaries, selectedPlatformKey]);

  const sortedSummaries = useMemo(() => {
    const getValue = (row: PlatformSummary, key: PlatformSortKey) => {
      if (key === 'name') return row.platform;
      if (key === 'manager') return pricingRules[row.platform]?.manager || 'Unassigned';
      if (key === 'skus') return row.skuCount;
      if (key === 'margin') return row.marginPct;
      if (key === 'velocity') return row.units;
      if (key in row) return (row as any)[key];
      return 0;
    };
    return sortRows(platformSummaries, sort as SortState<string>, getValue as any);
  }, [platformSummaries, sort, pricingRules]);

  const sortedRoiData = useMemo(() => {
    const getValue = (row: PlatformFeesRoi, key: PlatformSortKey) => {
      if (key === 'name') return row.platform;
      if (key === 'margin') return row.marginPct;
      if (key === 'velocity') return row.units;
      if (key in row) return (row as any)[key];
      return 0;
    };
    return sortRows(roiData, sort as SortState<string>, getValue as any);
  }, [roiData, sort]);

  const selectedSummary = useMemo(() => 
    platformSummaries.find(s => s.platform === selectedPlatformKey),
    [platformSummaries, selectedPlatformKey]
  );

  const categoryBreakdown = useMemo(() => {
    if (!selectedPlatformKey) return [];
    const skuToCategoryMap = new Map<string, string>();
    products.forEach(p => { if (p.category) skuToCategoryMap.set(p.sku, p.category); });
    const catMap: Record<string, number> = {};
    const platformLogs = filteredPriceHistoryMap;
    platformLogs.forEach((logs, sku) => {
      const category = skuToCategoryMap.get(sku) || 'Uncategorized';
      logs.forEach(log => { if (log.platform === selectedPlatformKey) catMap[category] = (catMap[category] || 0) + (calcRevenue(log) * VAT_MULTIPLIER); });
    });
    return Object.entries(catMap).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [selectedPlatformKey, filteredPriceHistoryMap, products]);

  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-10">
      <div>
          <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Marketplace Management</h2>
          <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>Monitor sales, profitability, and advertising efficiency across channels.</p>
      </div>

      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit overflow-x-auto no-scrollbar">
        <button onClick={() => setActiveTab('overview')} className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'overview' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><LayoutDashboard className="w-4 h-4" />Platform Overview</button>
        <button onClick={() => setActiveTab('roi')} className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'roi' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><Coins className="w-4 h-4" />Fees & ROI</button>
        <button onClick={() => setActiveTab('performance')} className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 whitespace-nowrap ${activeTab === 'performance' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}><Activity className="w-4 h-4" />Performance Trend</button>
      </div>

      <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Time Window</span>
              <div className="flex bg-gray-100 p-1 rounded-lg">{(['7D', '14D', '30D', '60D'] as const).map(w => (<button key={w} onClick={() => { setTimeWindow(w); setIsCustomDateModalOpen(false); }} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${timeWindow === w ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>{w}</button>))}<button onClick={() => { setTimeWindow('ALL'); setIsCustomDateModalOpen(false); }} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${timeWindow === 'ALL' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>All Time</button><button onClick={() => setIsCustomDateModalOpen(true)} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${timeWindow === 'CUSTOM' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}><Calendar className="w-3 h-3" /> Custom</button></div>
          </div>
          <div className="flex items-center gap-2 pl-4 border-l border-gray-200"><span className="text-xs text-gray-400 font-medium">Analyzing:</span><span className="text-sm font-bold text-indigo-600">{periodLabel}</span></div>
      </div>

      {isCustomDateModalOpen && createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setIsCustomDateModalOpen(false)}><div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-gray-200 p-6" onClick={e => e.stopPropagation()}><h3 className="text-lg font-bold text-gray-900 mb-4">Select Custom Range</h3><div className="space-y-4"><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">Start Date</label><input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" /></div><div><label className="block text-xs font-bold text-gray-500 uppercase mb-1">End Date</label><input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500" /></div></div><div className="mt-6 flex justify-end gap-3"><button onClick={() => setIsCustomDateModalOpen(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button><button onClick={() => { setTimeWindow('CUSTOM'); setIsCustomDateModalOpen(false); }} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700">Apply Range</button></div></div></div>, document.body
      )}

      <div className="min-h-[500px]">
        {activeTab === 'overview' && (
            <OverviewTab sortedSummaries={sortedSummaries} selectedPlatformKey={selectedPlatformKey} setSelectedPlatformKey={setSelectedPlatformKey} pricingRules={pricingRules} themeColor={themeColor} selectedSummary={selectedSummary} categoryBreakdown={categoryBreakdown} sort={sort} setSort={setSort} topPlatformKey={topPlatformKey} />
        )}
        {activeTab === 'roi' && (
            <RoiTab roiData={roiData} pricingRules={pricingRules} themeColor={themeColor} sort={sort} setSort={setSort} />
        )}
        {activeTab === 'performance' && (
            <PerformanceTab trendData={trendData} performanceSummary={performanceSummary} timeWindow={timeWindow} alertRules={alertRules} setAlertRules={setAlertRules} uniquePlatforms={uniquePlatforms} selectedChartPlatforms={selectedChartPlatforms} setSelectedChartPlatforms={setSelectedChartPlatforms} platformGroups={platformGroups} setPlatformGroups={setPlatformGroups} isGroupCreatorOpen={isGroupCreatorOpen} setIsGroupCreatorOpen={setIsGroupCreatorOpen} newGroupName={newGroupName} setNewGroupName={setNewGroupName} newGroupPlatforms={newGroupPlatforms} setNewGroupPlatforms={setNewGroupPlatforms} handleCreateGroup={handleCreateGroup} deleteGroup={deleteGroup} toggleNewGroupPlatform={toggleNewGroupPlatform} trendMetric={trendMetric} setTrendMetric={setTrendMetric} zoomState={zoomState} handleResetZoom={handleResetZoom} visibleChartData={visibleChartData} setRefAreaLeft={setRefAreaLeft} setRefAreaRight={setRefAreaRight} refAreaLeft={refAreaLeft} refAreaRight={refAreaRight} zoom={zoom} handleLegendClick={handleLegendClick} hiddenSeries={hiddenSeries} pricingRules={pricingRules} barChartData={barChartData} />
        )}
      </div>

      {showDebug && (<AuditSection roiData={roiData} pricingRules={pricingRules} />)}
    </div>
  );
};

const OverviewTab = ({ sortedSummaries, selectedPlatformKey, setSelectedPlatformKey, pricingRules, themeColor, selectedSummary, categoryBreakdown, sort, setSort, topPlatformKey }: any) => (
    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{sortedSummaries.map((summary: any) => (<PlatformKPICard key={summary.platform} summary={summary} isTop={summary.platform === topPlatformKey} isSelected={selectedPlatformKey === summary.platform} onSelect={() => setSelectedPlatformKey(summary.platform)} rule={pricingRules[summary.platform]} themeColor={themeColor} />))}</div>
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          <div className={`bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden transition-all duration-300 ${selectedPlatformKey ? 'lg:w-2/3' : 'w-full'}`}><div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center"><h3 className="font-bold text-gray-800 flex items-center gap-2"><Globe className="w-4 h-4 text-indigo-500" />Performance Matrix</h3><div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest bg-white/50 px-2 py-1 rounded border border-gray-100">{TAX_NOTE_SHORT}</div></div><div className="overflow-x-auto"><table className="w-full text-left text-sm whitespace-nowrap"><thead className="bg-gray-50/50 text-gray-500 font-semibold border-b border-gray-200/50"><tr><SortableHeader label="Platform" sortKey="name" sort={sort} onChange={setSort as any} themeColor={themeColor} />{!selectedPlatformKey && <SortableHeader label="Manager" sortKey="manager" sort={sort} onChange={setSort as any} themeColor={themeColor} />}<SortableHeader label="SKUs" sortKey="skus" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" /><SortableHeader label="Revenue" sortKey="revenue" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" /><SortableHeader label="Profit (Gross)" sortKey="profit" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" /><SortableHeader label="Net Profit" sortKey="netProfit" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" className="bg-green-50/20" /><SortableHeader label="Margin %" sortKey="margin" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" /><SortableHeader label="Units" sortKey="velocity" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" /></tr></thead><tbody className="divide-y divide-gray-100/50">{sortedSummaries.map((summary: any) => { const rule = pricingRules[summary.platform]; const isSelected = selectedPlatformKey === summary.platform; return (<tr key={summary.platform} className={`even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors cursor-pointer ${isSelected ? 'bg-indigo-50/50' : ''}`} onClick={() => setSelectedPlatformKey(isSelected ? null : summary.platform)}><td className="p-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white shadow-sm" style={{ backgroundColor: rule?.color || '#6366f1' }}>{summary.platform[0]}</div><span className="font-bold text-gray-900">{summary.platform}</span></div></td>{!selectedPlatformKey && (<td className="p-4"><div className="flex items-center gap-2 text-gray-600"><User className="w-3.5 h-3.5" />{rule?.manager || 'Unassigned'}</div></td>)}<td className="p-4 text-right font-medium">{summary.skuCount}</td><td className="p-4 text-right font-bold text-indigo-600">{formatMoney(summary.revenue, 0)}</td><td className="p-4 text-right font-medium text-gray-700">{formatMoney(summary.profit, 0)}</td><td className="p-4 text-right font-bold text-green-700 bg-green-50/10">{formatMoney(summary.netProfit, 0)}</td><td className="p-4 text-right"><span className={`font-bold ${summary.marginPct >= 15 ? 'text-green-600' : summary.marginPct >= 0 ? 'text-amber-600' : 'text-red-600'}`}>{formatPct(summary.marginPct)}</span></td><td className="p-4 text-right text-gray-500">{formatNumber(summary.units)}</td></tr>); })}</tbody></table></div></div>
          {selectedPlatformKey && selectedSummary && (
            <div className="lg:w-1/3 space-y-6 animate-in slide-in-from-right duration-300"><div className="bg-custom-glass rounded-xl border border-custom-glass shadow-lg overflow-hidden"><div className="p-4 border-b border-custom-glass bg-gray-50/50 flex items-center justify-between"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-black text-white shadow-sm" style={{ backgroundColor: pricingRules[selectedPlatformKey]?.color || themeColor }}>{selectedPlatformKey[0]}</div><h3 className="font-bold text-gray-900 text-sm">{selectedPlatformKey} Details</h3></div><button onClick={() => setSelectedPlatformKey(null)} className="p-1 hover:bg-gray-200 rounded-full text-gray-400 transition-colors"><X className="w-4 h-4" /></button></div><div className="p-5 space-y-5"><div className="grid grid-cols-2 gap-4"><div><span className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">Revenue</span><div className="text-xl font-bold text-gray-900">{formatMoney(selectedSummary.revenue, 0)}</div></div><div><span className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">Net Profit</span><div className={`text-xl font-bold ${selectedSummary.netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>{formatMoney(selectedSummary.netProfit, 0)}</div></div></div><div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-100"><div className="space-y-1"><span className="text-[10px] font-bold text-gray-400 uppercase block">Performance</span><div className={`text-sm font-black ${selectedSummary.marginPct >= 15 ? 'text-green-600' : 'text-amber-600'}`}><span className="text-gray-400 font-normal mr-1">Margin:</span> {formatPct(selectedSummary.marginPct)}</div><div className="text-sm font-black text-gray-700"><span className="text-gray-400 font-normal mr-1">TACoS:</span> {formatPct(selectedSummary.tacosPct)}</div></div><div className="space-y-1 text-right"><span className="text-[10px] font-bold text-gray-400 uppercase block">Scale</span><div className="text-sm font-black text-gray-700">{formatNumber(selectedSummary.orders)} <span className="text-gray-400 font-normal ml-1">Orders</span></div><div className="text-sm font-black text-gray-700">{formatNumber(selectedSummary.units)} <span className="text-gray-400 font-normal ml-1">Units</span></div></div></div><div className="pt-4 border-t border-gray-100"><span className="text-[10px] font-bold text-gray-400 uppercase block mb-0.5">Gross Profit (Before Ads)</span><div className="text-sm font-medium text-gray-600">{formatMoney(selectedSummary.profit, 0)}</div></div></div></div><div className="bg-custom-glass rounded-xl border border-custom-glass shadow-lg overflow-hidden"><div className="p-4 border-b border-custom-glass bg-gray-50/50 flex items-center justify-between"><h3 className="font-bold text-gray-900 text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-indigo-500" />Top Categories</h3><span className="text-[9px] font-bold text-gray-400 uppercase">by Revenue</span></div><div className="p-5">{categoryBreakdown.length > 0 ? (<div className="space-y-4">{categoryBreakdown.map((cat: any, i: number) => (<div key={cat.name} className="space-y-1"><div className="flex justify-between items-center text-[11px]"><div className="flex items-center gap-2"><span className="w-3.5 h-3.5 rounded bg-gray-100 flex items-center justify-center text-[8px] font-black text-gray-400">{i + 1}</span><span className="font-semibold text-gray-700 truncate max-w-[140px]">{cat.name}</span></div><span className="font-bold text-gray-900">{formatMoney(cat.revenue, 0)}</span></div><div className="w-full h-1 bg-gray-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-500 rounded-full transition-all duration-1000 ease-out" style={{ width: `${(cat.revenue / categoryBreakdown[0].revenue) * 100}%` }}/></div></div>))}</div>) : (<div className="py-6 text-center text-xs text-gray-400 italic">No breakdown available.</div>)}</div></div></div>
          )}
        </div>
    </div>
);

const RoiTab = ({ roiData, pricingRules, themeColor, sort, setSort }: any) => {
    const totalAdSpend = roiData.reduce((sum: number, d: any) => sum + d.adSpend, 0);
    const totalRevenueForAds = roiData.reduce((sum: number, d: any) => (d.dataQuality.hasAdData && d.revenue > 0) ? sum + d.revenue : sum, 0);
    const avgTacos = totalRevenueForAds > 0 ? (totalAdSpend / totalRevenueForAds) * 100 : 0;
    const totalNetProfit = roiData.reduce((sum: number, d: any) => d.dataQuality.hasAdData ? (sum + d.netAfterAds) : sum, 0);
    const avgRoi = totalAdSpend > 0 ? (totalNetProfit / totalAdSpend) : 0;
    const filteredForLeaderboard = [...roiData].filter(d => d.dataQuality.hasAdData && d.adSpend > 0);

    return (
      <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">{roiData.map((roi: any) => (<PlatformRoiCard key={roi.platform} roi={roi} rule={pricingRules[roi.platform]} themeColor={themeColor} />))}</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4"><div className="p-3 bg-orange-50 text-orange-600 rounded-lg"><Megaphone className="w-6 h-6" /></div><div><span className="text-xs font-bold text-gray-400 uppercase">Total Ad Spend</span><div className="text-2xl font-black text-gray-900">{formatMoney(totalAdSpend, 0)}</div></div></div><div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4"><div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg"><PieChart className="w-6 h-6" /></div><div><span className="text-xs font-bold text-gray-400 uppercase">Average TACoS</span><div className={`text-2xl font-black ${avgTacos > 15 ? 'text-red-600' : 'text-gray-900'}`}>{formatPct(avgTacos)}</div></div></div><div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4"><div className="p-3 bg-green-50 text-green-600 rounded-lg"><Zap className="w-6 h-6" /></div><div><span className="text-xs font-bold text-gray-400 uppercase">Global Ad ROI</span><div className={`text-2xl font-black ${avgRoi < 0 ? 'text-red-600' : 'text-green-700'}`}>{avgRoi.toFixed(2)}x</div></div></div></div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6"><div className="lg:col-span-2 bg-white rounded-xl border border-gray-200 shadow-sm p-6"><div className="flex items-center justify-between mb-6"><div><h3 className="font-bold text-gray-900 flex items-center gap-2"><Target className="w-4 h-4 text-indigo-500" />Efficiency Map</h3></div></div><div className="h-[300px] w-full"><ResponsiveContainer width="100%" height="100%"><ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 0 }}><CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" /><XAxis type="number" dataKey="marginPct" name="Margin" unit="%" tick={{ fontSize: 10 }} /><YAxis type="number" dataKey="tacosPct" name="TACoS" unit="%" tick={{ fontSize: 10 }} /><ZAxis type="number" dataKey="revenue" range={[100, 1000]} /><RechartsTooltip cursor={{ strokeDasharray: '3 3' }} /><Scatter data={roiData.filter((d: any) => d.dataQuality.hasAdData)}>{roiData.filter((d: any) => d.dataQuality.hasAdData).map((entry: any, index: number) => (<Cell key={`cell-${index}`} fill={pricingRules[entry.platform]?.color || themeColor} />))}</Scatter></ScatterChart></ResponsiveContainer></div></div><div className="lg:col-span-1 bg-indigo-900 rounded-xl shadow-lg p-6 text-white overflow-hidden relative"><h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Trophy className="w-5 h-5 text-yellow-400" />ROI Leaderboard</h3><div className="space-y-4">{filteredForLeaderboard.sort((a: any, b: any) => (b.roiAfterAds || 0) - (a.roiAfterAds || 0)).slice(0, 3).map((d: any, i: number) => (<div key={d.platform} className="flex items-center justify-between"><div className="font-bold text-sm">{d.platform}</div><div className="text-lg font-black">{d.roiAfterAds?.toFixed(2)}x</div></div>))}</div></div></div>
        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden"><div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center"><h3 className="font-bold text-gray-800 text-sm flex items-center gap-2"><Coins className="w-4 h-4 text-amber-500" />Fees Table</h3></div><div className="overflow-x-auto"><table className="w-full text-left text-sm whitespace-nowrap"><thead className="bg-gray-50/50 text-gray-500 font-semibold border-b border-gray-200/50"><tr><SortableHeader label="Platform" sortKey="name" sort={sort} onChange={setSort as any} themeColor={themeColor} /><SortableHeader label="Revenue" sortKey="revenue" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" /><th className="px-4 py-3 text-right">Profit (Gross)</th><SortableHeader label="Margin %" sortKey="margin" sort={sort} onChange={setSort as any} themeColor={themeColor} align="right" /><th className="px-4 py-3 text-right">Ad Spend</th><th className="px-4 py-3 text-right">TACoS %</th><th className="px-4 py-3 text-right bg-green-50/30">Net Profit</th><th className="px-4 py-3 text-right bg-green-50/30">ROI After Ads</th></tr></thead><tbody className="divide-y divide-gray-100/50">{sortRows(roiData, sort as any, (row: any, key: string) => row[key] || 0).map((d: any) => (<tr key={d.platform} className="even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors"><td className="p-4 font-bold text-gray-900">{d.platform}</td><td className="p-4 text-right">{formatMoney(d.revenue, 0)}</td><td className="p-4 text-right">{formatMoney(d.profit, 0)}</td><td className="p-4 text-right font-bold">{formatPct(d.marginPct)}</td><td className="p-4 text-right text-orange-700">{formatMoney(d.adSpend, 0)}</td><td className="p-4 text-right">{formatPct(d.tacosPct)}</td><td className="p-4 text-right font-bold text-green-700">{formatMoney(d.netAfterAds, 0)}</td><td className="p-4 text-right font-black text-indigo-700">{d.roiAfterAds?.toFixed(2)}x</td></tr>))}</tbody></table></div></div>
      </div>
    );
};

const PerformanceTab = ({ trendData, performanceSummary, timeWindow, alertRules, setAlertRules, uniquePlatforms, selectedChartPlatforms, setSelectedChartPlatforms, platformGroups, setPlatformGroups, isGroupCreatorOpen, setIsGroupCreatorOpen, newGroupName, setNewGroupName, newGroupPlatforms, setNewGroupPlatforms, handleCreateGroup, deleteGroup, toggleNewGroupPlatform, trendMetric, setTrendMetric, zoomState, handleResetZoom, visibleChartData, setRefAreaLeft, setRefAreaRight, refAreaLeft, refAreaRight, zoom, handleLegendClick, hiddenSeries, pricingRules, barChartData }: any) => {
    const [isAlertRulesOpen, setIsAlertRulesOpen] = useState(false);

    const CustomTrendTooltip = ({ active, payload, label }: any) => {
        if (!active || !payload || !payload.length) return null;
        return (
            <div className="bg-gray-900/95 backdrop-blur-md border border-gray-700 p-3 rounded-xl shadow-2xl text-white min-w-[220px] pointer-events-none animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between border-b border-gray-700 pb-2 mb-2"><span className="font-bold text-xs">{new Date(label).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</span><span className="text-[9px] text-gray-400 font-black uppercase tracking-widest bg-white/50 px-1.5 py-0.5 rounded">{trendMetric.replace(/_/g, ' ')}</span></div>
                <div className="space-y-2">
                    {[...payload].sort((a: any, b: any) => b.value - a.value).map((entry: any, i: number) => {
                        const platformName = entry.name; const color = entry.color; const value = entry.value;
                        const platformTrend = trendData.find((t: any) => t.platform === platformName);
                        let delta = null;
                        if (platformTrend) {
                            if (trendMetric === 'NET_PROFIT') delta = platformTrend.deltas.netProfitDeltaPct;
                            if (trendMetric === 'UNITS_SOLD') delta = platformTrend.deltas.unitsDeltaPct;
                            if (trendMetric === 'MARGIN_PCT') delta = platformTrend.deltas.marginDeltaPp;
                            if (trendMetric === 'AVG_ORDER_VALUE') delta = platformTrend.deltas.avgOrderValueDeltaPct;
                        }
                        return (
                            <div key={i} className="flex items-center justify-between gap-4"><div className="flex items-center gap-2 min-w-0"><div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} /><span className="text-[11px] font-bold truncate opacity-90">{platformName}</span></div><div className="flex items-center gap-2 shrink-0"><span className="text-[11px] font-mono font-bold">{trendMetric === 'MARGIN_PCT' ? value.toFixed(1) + '%' : trendMetric === 'UNITS_SOLD' ? formatNumber(value) : formatMoney(value, 0)}</span>{delta !== null && isFinite(delta) && (<span className={`text-[9px] font-black px-1 rounded-sm ${delta >= 0 ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>{trendMetric === 'MARGIN_PCT' ? (delta > 0 ? '+' : '') : (delta > 0 ? '↑' : '↓')}{Math.abs(delta).toFixed(0)}{trendMetric === 'MARGIN_PCT' ? 'pp' : '%'}</span>)}</div></div>
                        );
                    })}
                </div>
                <div className="mt-2 pt-2 border-t border-gray-700/50 flex justify-center"><span className="text-[8px] text-gray-500 italic uppercase">Percentages represent period delta</span></div>
            </div>
        );
    };

    const metricLabels: Record<string, string> = {
        NET_PROFIT: 'Net Profit',
        MARGIN_PCT: 'Profit Margin',
        AVG_ORDER_VALUE: 'Average Order Amount',
        UNITS_SOLD: 'Unit Sold'
    };

    const formatYAxis = (val: number) => {
        if (trendMetric === 'MARGIN_PCT') return `${val}%`;
        if (trendMetric === 'UNITS_SOLD') return formatNumber(val);
        return `£${val.toLocaleString()}`;
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div>
                <div className="flex items-center gap-2 mb-1"><h3 className="text-lg font-bold text-gray-900">Summary</h3><span className="text-xs text-gray-400 font-medium">Latest vs prior period</span></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-3">
                    <SummaryCard title="Biggest Revenue Gainer" platform={performanceSummary?.gainer?.platform} delta={performanceSummary?.gainer?.deltas.revenueDeltaPct} type="pos" />
                    <SummaryCard title="Biggest Revenue Loser" platform={performanceSummary?.loser?.platform} delta={performanceSummary?.loser?.deltas.revenueDeltaPct} type="neg" />
                    <SummaryCard title="Most Improved Net Profit" platform={performanceSummary?.improvedNet?.platform} delta={performanceSummary?.improvedNet?.deltas.netProfitDeltaPct} type="pos" />
                    <SummaryCard title="Worst Net Profit" platform={performanceSummary?.worstNet?.platform} value={performanceSummary?.worstNet?.current.netProfit} type="info" />
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center"><h3 className="font-bold text-gray-800 flex items-center gap-2"><Trophy className="w-4 h-4 text-amber-500" />Comparison Matrix</h3><div className="relative"><button onClick={() => setIsAlertRulesOpen(!isAlertRulesOpen)} className="px-3 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-bold hover:bg-gray-50 flex items-center gap-1.5 shadow-sm transition-all"><BellRing className="w-3.5 h-3.5 text-indigo-500" />Alert Rules</button>{isAlertRulesOpen && (<div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl border border-gray-200 p-4 z-50 animate-in fade-in zoom-in-95 duration-150 origin-top-right"><div className="flex justify-between items-center mb-4 border-b border-gray-100 pb-2"><h4 className="font-bold text-gray-900 text-sm">Alert Thresholds</h4><button onClick={() => setIsAlertRulesOpen(false)}><X className="w-4 h-4 text-gray-400" /></button></div><div className="space-y-4"><div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-gray-400">Revenue Drop Threshold (%)</label><input type="number" value={alertRules.revenueDropPctThreshold} onChange={e => setAlertRules({...alertRules, revenueDropPctThreshold: parseFloat(e.target.value) || 0})} className="w-full border rounded px-3 py-1.5 text-sm font-bold bg-gray-50" /></div><div className="space-y-1.5"><label className="text-[10px] font-black uppercase text-gray-400">Low Margin Threshold (%)</label><input type="number" value={alertRules.marginLowThreshold} onChange={e => setAlertRules({...alertRules, marginLowThreshold: parseFloat(e.target.value) || 0})} className="w-full border rounded px-3 py-1.5 text-sm font-bold bg-gray-50" /></div></div><div className="mt-6 flex gap-2"><button onClick={() => setIsAlertRulesOpen(false)} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg font-bold text-xs">Save</button></div></div>)}</div></div>
                <div className="overflow-x-auto"><table className="w-full text-left text-sm whitespace-nowrap"><thead className="bg-gray-50/50 text-gray-500 font-semibold border-b border-gray-200/50"><tr><th className="px-4 py-3">Platform</th><th className="px-4 py-3 text-right">Revenue (Current)</th><th className="px-4 py-3 text-right">Net Profit</th><th className="px-4 py-3 text-right">Margin %</th><th className="px-4 py-3 text-center">Health Flags</th></tr></thead><tbody className="divide-y divide-gray-100/50">{trendData.map((row: any) => { const rule = pricingRules[row.platform]; const revDelta = row.deltas.revenueDeltaPct; const flags: Flag[] = []; if (revDelta !== null && revDelta <= -alertRules.revenueDropPctThreshold) flags.push({ label: "Revenue Drop", style: "bg-red-100 text-red-800 border-red-200", tooltip: `Revenue ${revDelta.toFixed(1)}% vs prior period` }); if (row.current.netProfit < 0) flags.push({ label: "Negative Net", style: "bg-red-900 text-white border-red-950", tooltip: "Net Profit is below £0" }); return (<tr key={row.platform} className="even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors"><td className="p-4"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white" style={{ backgroundColor: rule?.color || '#6366f1' }}>{row.platform[0]}</div><div className="font-bold text-gray-900">{row.platform}</div></div></td><td className="p-4 text-right"><div className="font-bold text-gray-900">{formatMoney(row.current.revenue, 0)}</div></td><td className="p-4 text-right bg-green-50/10"><div className="font-bold text-indigo-700">{formatMoney(row.current.netProfit, 0)}</div></td><td className="p-4 text-right"><div className="font-bold text-gray-800">{formatPct(row.current.marginPct)}</div></td><td className="p-4 text-center"><div className="flex justify-center gap-1 flex-wrap">{flags.map((flag, idx) => <span key={idx} className={`px-2 py-1 rounded text-[10px] font-black border cursor-help ${flag.style}`} title={flag.tooltip}>{flag.label}</span>)}</div></td></tr>); })}</tbody></table></div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center"><div className="flex items-center gap-2"><Settings className="w-4 h-4 text-indigo-500" /><h4 className="font-bold text-gray-800 text-sm">Chart Configuration</h4></div><button onClick={() => setIsGroupCreatorOpen(!isGroupCreatorOpen)} className="text-xs font-bold px-3 py-1.5 rounded-lg border bg-white text-gray-600 border-gray-200 hover:border-gray-300 transition-all flex items-center gap-1"><Plus className="w-3 h-3" /> Create Group</button></div>
                <div className="p-6">
                    {isGroupCreatorOpen && (<div className="bg-indigo-50/50 p-4 rounded-lg border border-indigo-100 animate-in fade-in slide-in-from-top-2 mb-6"><div className="flex gap-4 mb-3"><div className="flex-1"><label className="text-[10px] font-bold text-indigo-400 uppercase block mb-1">Group Name</label><input type="text" value={newGroupName} onChange={(e) => setNewGroupName(e.target.value)} placeholder="e.g. Amazon Combined" className="w-full text-sm border border-indigo-200 rounded-md px-3 py-1.5 bg-white" /></div></div><div className="mb-4"><label className="text-[10px] font-bold text-indigo-400 uppercase block mb-1">Select Platforms</label><div className="flex flex-wrap gap-2">{uniquePlatforms.map((p: string) => <button key={p} onClick={() => toggleNewGroupPlatform(p)} className={`px-2 py-1 text-xs rounded border transition-all ${newGroupPlatforms.includes(p) ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}>{p}</button>)}</div></div><div className="flex justify-end gap-2"><button onClick={() => setIsGroupCreatorOpen(false)} className="text-xs text-gray-500 px-3 py-1.5">Cancel</button><button onClick={handleCreateGroup} disabled={!newGroupName || newGroupPlatforms.length < 2} className="text-xs bg-indigo-600 text-white font-bold px-4 py-1.5 rounded-md disabled:opacity-50">Save Group</button></div></div>)}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8"><div><span className="text-[10px] font-bold text-gray-400 uppercase block mb-3 tracking-widest">Focus Platforms</span><FocusPlatformDropdown platforms={uniquePlatforms} selected={selectedChartPlatforms} onChange={setSelectedChartPlatforms} /></div><div><span className="text-[10px] font-bold text-gray-400 uppercase block mb-3 tracking-widest">Custom Groups</span>{platformGroups.length > 0 ? (<div className="flex flex-wrap gap-2">{platformGroups.map((g: any) => (<div key={g.id} className="flex items-center gap-2 px-3 py-2 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-lg border border-indigo-100 shadow-sm"><Layers className="w-3.5 h-3.5" />{g.name}<button onClick={() => deleteGroup(g.id)} className="ml-1 hover:text-red-500"><X className="w-3 h-3" /></button></div>))}</div>) : (<div className="p-3 border-2 border-dashed border-gray-100 rounded-lg text-xs text-gray-400 text-center">No custom groups defined.</div>)}</div></div>
                    <div className="border-t border-gray-100 my-8"></div>
                    <div className="flex flex-col md:flex-row items-center justify-between mb-6 gap-4"><h3 className="font-bold text-gray-800 flex items-center gap-2 text-lg"><TrendingUp className="w-5 h-5 text-indigo-600" />Performance Trend</h3><div className="flex bg-gray-100 p-1 rounded-lg">{(['NET_PROFIT', 'MARGIN_PCT', 'AVG_ORDER_VALUE', 'UNITS_SOLD'] as const).map(m => (<button key={m} onClick={() => setTrendMetric(m)} className={`px-4 py-2 text-[10px] font-black uppercase tracking-wider rounded-md transition-all ${trendMetric === m ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}>{metricLabels[m]}</button>))}</div></div>
                    <div className="h-[450px] w-full relative group/chart select-none">
                        {zoomState.isZoomed && (<button onClick={handleResetZoom} className="absolute top-4 right-12 z-20 px-3 py-1.5 bg-white/90 backdrop-blur-sm border border-indigo-100 text-indigo-600 rounded-lg shadow-lg hover:bg-indigo-50 transition-all flex items-center gap-1.5 text-xs font-bold animate-in fade-in slide-in-from-top-2"><RotateCcw className="w-3.5 h-3.5" />Reset View</button>)}
                        {visibleChartData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={visibleChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }} onMouseDown={(e: any) => e?.activeLabel && setRefAreaLeft(e.activeLabel)} onMouseMove={(e: any) => refAreaLeft && e?.activeLabel && setRefAreaRight(e.activeLabel)} onMouseUp={zoom}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={true} stroke="#f1f5f9" />
                                    <XAxis dataKey="date" tickFormatter={(val) => new Date(val).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={true} />
                                    <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={true} domain={['auto', 'auto']} />
                                    <RechartsTooltip shared={true} cursor={{ stroke: '#6366f1', strokeWidth: 1, strokeDasharray: '3 3' }} content={<CustomTrendTooltip />} />
                                    <Legend wrapperStyle={{ paddingTop: '20px' }} onClick={handleLegendClick} formatter={(value) => (<span className={`text-xs font-medium cursor-pointer transition-opacity ${hiddenSeries.has(value) ? 'opacity-30' : 'opacity-100'}`}>{value}</span>)} />
                                    {refAreaLeft && refAreaRight && (<ReferenceArea x1={refAreaLeft} x2={refAreaRight} strokeOpacity={0.3} fill="#8884d8" fillOpacity={0.3} />)}
                                    {selectedChartPlatforms.map((platform: string) => (<Line key={platform} type="monotone" dataKey={`${platform}_${trendMetric}`} name={platform} stroke={pricingRules[platform]?.color || '#9ca3af'} strokeWidth={2} dot={false} hide={hiddenSeries.has(platform)} isAnimationActive={false} />))}
                                    {platformGroups.map((group: any, i: number) => (<Line key={group.id} type="monotone" dataKey={`${group.name}_${trendMetric}`} name={group.name} stroke={['#ec4899', '#8b5cf6', '#14b8a6', '#f59e0b', '#6366f1'][i % 5]} strokeWidth={3} strokeDasharray="5 5" dot={false} hide={hiddenSeries.has(group.name)} isAnimationActive={false} />))}
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (<div className="h-full w-full flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-200 rounded-xl text-gray-400 italic">No sales data available for the selected period.</div>)}
                    </div>
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden mt-6">
                <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-center"><div className="flex items-center gap-2"><BarChartIcon className="w-4 h-4 text-indigo-500" /><h3 className="font-bold text-gray-800 text-sm uppercase tracking-wide">{metricLabels[trendMetric]} Comparison by Platform</h3></div></div>
                <div className="p-6 h-[400px]">
                    {barChartData.length > 0 ? (
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barChartData} margin={{ top: 20, right: 30, left: 20, bottom: 20 }} barGap={8}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="platform" tick={{ fontSize: 10, fill: '#64748b' }} axisLine={false} tickLine={false} />
                                {/* Hidden Axis for background overlapping */}
                                <XAxis dataKey="platform" hide xAxisId="bg" />
                                <YAxis tickFormatter={formatYAxis} tick={{ fontSize: 10, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                                <RechartsTooltip cursor={{ fill: 'transparent' }} content={({ active, payload, label }) => (active && payload && payload.length) ? (<div className="bg-gray-900 text-white p-3 rounded-xl shadow-2xl border border-gray-700 text-xs"><div className="font-bold border-b border-gray-700 pb-1 mb-2">{label}</div><div className="space-y-1"><div className="flex justify-between gap-6"><span className="text-gray-400">Current:</span><span className="font-mono font-bold text-white">{trendMetric === 'MARGIN_PCT' ? (payload[0].value as number).toFixed(1) + '%' : trendMetric === 'UNITS_SOLD' ? formatNumber(payload[0].value as number) : formatMoney(payload[0].value as number)}</span></div><div className="flex justify-between gap-6"><span className="text-gray-400">Prior:</span><span className="font-mono font-bold text-blue-300">{trendMetric === 'MARGIN_PCT' ? (payload[1].value as number).toFixed(1) + '%' : trendMetric === 'UNITS_SOLD' ? formatNumber(payload[1].value as number) : formatMoney(payload[1].value as number)}</span></div>{payload[0].value !== undefined && payload[1].value !== undefined && (<div className="pt-1 border-t border-gray-700 mt-1 flex justify-between gap-4"><span className="text-gray-400">Change:</span><span className={`font-bold ${(payload[0].value as number) >= (payload[1].value as number) ? 'text-green-400' : 'text-red-400'}`}>{((payload[0].value as number) - (payload[1].value as number) >= 0 ? '+' : '')}{trendMetric === 'MARGIN_PCT' ? ((payload[0].value as number) - (payload[1].value as number)).toFixed(1) + 'pp' : (((((payload[0].value as number) - (payload[1].value as number)) / (Math.abs(payload[1].value as number) || 1)) * 100).toFixed(1) + '%')}</span></div>)}</div></div>) : null} />
                                <Legend verticalAlign="bottom" align="center" wrapperStyle={{ paddingTop: '20px' }} iconType="rect" />
                                
                                {/* Background Tinted Bars */}
                                <Bar xAxisId="bg" dataKey="bgValue" barSize={64} isAnimationActive={false} legendType="none">
                                    {barChartData.map((entry: any, index: number) => (
                                        <Cell key={`cell-bg-${index}`} fill={entry.color} fillOpacity={0.06} />
                                    ))}
                                </Bar>

                                <Bar dataKey="current" name="Current" fill="#1f2937" radius={[4, 4, 0, 0]} barSize={24} isAnimationActive={false} />
                                <Bar dataKey="prior" name="Prior" fill="#94a3b8" radius={[4, 4, 0, 0]} barSize={24} isAnimationActive={false} />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (<div className="h-full w-full flex flex-col items-center justify-center bg-gray-50 border border-dashed border-gray-200 rounded-xl text-gray-400 italic text-sm">No comparative data available.</div>)}
                </div>
            </div>
        </div>
    );
};

const AuditSection = ({ roiData, pricingRules }: any) => (
    <div className="mt-4 p-4 bg-gray-900 rounded-xl border border-gray-800 shadow-2xl animate-in slide-in-from-top-2 duration-300">
        <div className="flex items-center gap-2 mb-4 text-indigo-400 border-b border-gray-800 pb-2"><Activity className="w-4 h-4" /><h4 className="text-xs font-black uppercase tracking-wider">Raw Aggregation Audit (Tax Inclusive)</h4></div>
        <div className="overflow-x-auto">
            <table className="w-full text-[10px] text-left border-collapse">
                <thead><tr className="text-gray-500 uppercase font-black border-b border-gray-800"><th className="p-2">Platform</th><th className="p-2 text-right">Revenue (Sum)</th><th className="p-2 text-right">Net Profit</th><th className="p-2 text-right">Ad Spend (Sum)</th><th className="p-2 text-right"># Trans</th><th className="p-2 text-center">Excl?</th></tr></thead>
                <tbody className="divide-y divide-gray-800">
                    {roiData.map((roi: any) => {
                        const isExcluded = pricingRules[roi.platform]?.isExcluded || false;
                        return (
                            <tr key={roi.platform} className="hover:bg-white/5">
                                <td className="p-2 text-gray-300 font-bold">{roi.platform}</td>
                                <td className="p-2 text-right text-gray-400 font-mono">£{roi.revenue.toLocaleString()}</td>
                                <td className="p-2 text-right text-indigo-300 font-mono font-bold">£{roi.netAfterAds?.toLocaleString() || 0}</td>
                                <td className="p-2 text-right text-gray-400 font-mono">£{roi.adSpend.toLocaleString()}</td>
                                <td className="p-2 text-right text-gray-400 font-mono">{roi.orders}</td>
                                <td className="p-2 text-center">{isExcluded ? (<span className="px-1.5 py-0.5 rounded bg-red-900/30 text-red-400 border border-red-900/50 font-black">EXCL</span>) : (<span className="px-1.5 py-0.5 rounded bg-green-900/30 text-green-400 border border-green-900/50 font-black">INCL</span>)}</td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    </div>
);

interface PlatformRoiCardProps {
    roi: PlatformFeesRoi;
    rule?: PlatformConfig;
    themeColor: string;
}

const PlatformRoiCard: React.FC<PlatformRoiCardProps> = ({ roi, rule, themeColor }) => {
    const hasAdData = roi.dataQuality.hasAdData;
    const isEstimated = roi.dataQuality.profitIsEstimated;

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col hover:border-indigo-300 transition-all group">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2.5">
                    <div 
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-sm"
                        style={{ backgroundColor: rule?.color || themeColor }}
                    >
                        {roi.platform[0]}
                    </div>
                    <div className="flex flex-col min-w-0">
                        <h4 className="font-bold text-gray-900 text-sm truncate leading-tight" title={roi.platform}>{roi.platform}</h4>
                        <span className="text-[9px] text-gray-400 uppercase font-medium tracking-tight truncate leading-tight">{rule?.manager || 'Unassigned'}</span>
                    </div>
                </div>
                {(!hasAdData || isEstimated) && (
                    <div className="flex items-center gap-1">
                        <span className="text-[8px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded uppercase flex items-center gap-1 border border-slate-200">
                           <Database className="w-2.5 h-2.5" />
                           {!hasAdData ? "No ads data" : "Data gap"}
                        </span>
                    </div>
                )}
            </div>

            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Revenue</span>
                        <div className="text-sm font-bold text-gray-900">{formatMoney(roi.revenue, 0)}</div>
                    </div>
                    <div className="space-y-0.5 text-right">
                        <div className="flex items-center justify-end gap-1" title="Profit excluding ad spend.">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Profit (Gross)</span>
                          <HelpCircle className="w-2.5 h-2.5 opacity-30" />
                        </div>
                        <div className={`text-sm font-bold ${roi.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatMoney(roi.profit, 0)}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Margin %</span>
                        <div className={`text-sm font-bold ${roi.marginPct && roi.marginPct >= 10 ? 'text-green-600' : 'text-amber-600'}`}>
                            {formatPct(roi.marginPct)}
                        </div>
                    </div>
                    <div className="space-y-0.5 text-right">
                        <div className="flex items-center justify-end gap-1" title="Total advertising costs (Aggregated).">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Ad Spend</span>
                          <HelpCircle className="w-2.5 h-2.5 opacity-30" />
                        </div>
                        <div className="text-sm font-bold text-orange-600">
                            {hasAdData ? formatMoney(roi.adSpend, 0) : '—'}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <div className="space-y-0.5">
                        <div className="flex items-center gap-1" title="Ad Spend / Revenue.">
                          <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">TACoS %</span>
                          <HelpCircle className="w-2.5 h-2.5 opacity-30" />
                        </div>
                        <div className="text-sm font-bold text-gray-700">
                            {hasAdData ? formatPct(roi.tacosPct) : '—'}
                        </div>
                    </div>
                    <div className="space-y-0.5 text-right bg-indigo-50/50 -m-1 p-1 rounded">
                        <div className="flex items-center justify-end gap-1" title="Final profit after all deductions including ads.">
                          <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-tight">Net Profit</span>
                          <HelpCircle className="w-2.5 h-2.5 opacity-30 text-indigo-300" />
                        </div>
                        <div className={`text-sm font-black ${roi.netAfterAds && roi.netAfterAds >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                            {roi.netAfterAds !== undefined ? formatMoney(roi.netAfterAds, 0) : '—'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

interface PlatformKPICardProps {
    summary: PlatformSummary;
    isTop: boolean;
    isSelected: boolean;
    onSelect: () => void;
    rule?: PlatformConfig;
    themeColor: string;
}

const PlatformKPICard: React.FC<PlatformKPICardProps> = ({ summary, isTop, isSelected, onSelect, rule, themeColor }) => {
    return (
        <div 
            onClick={onSelect}
            className={`bg-white p-4 rounded-xl border shadow-sm flex flex-col relative overflow-hidden group hover:border-indigo-300 transition-all hover:shadow-md h-full cursor-pointer ${isSelected ? 'ring-2 ring-indigo-500 border-indigo-500' : 'border-gray-200'}`}
        >
            {isTop && (
                <div className="absolute top-0 right-0 bg-yellow-400 text-yellow-900 px-2 py-0.5 rounded-bl-lg flex items-center gap-1 shadow-sm animate-in fade-in slide-in-from-top-1 z-10">
                    <Trophy className="w-3 h-3" />
                    <span className="text-[9px] font-black uppercase tracking-widest">Top</span>
                </div>
            )}
            
            <div className="flex items-center gap-2.5 mb-4">
                <div 
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black text-white shadow-sm transition-transform group-hover:scale-105 shrink-0"
                    style={{ backgroundColor: rule?.color || themeColor }}
                >
                    {summary.platform[0]}
                </div>
                <div className="flex flex-col min-w-0">
                    <h4 className="font-bold text-gray-900 text-sm truncate leading-tight" title={summary.platform}>{summary.platform}</h4>
                    <span className="text-[9px] text-gray-400 uppercase font-medium tracking-tight truncate leading-tight">{rule?.manager || 'Unassigned'}</span>
                </div>
            </div>

            <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Revenue</span>
                        <div className="text-sm font-bold text-gray-900 leading-none">{formatMoney(summary.revenue, 0)}</div>
                    </div>
                    <div className="space-y-0.5 text-right bg-indigo-50/50 -m-1 p-1 rounded">
                        <span className="text-[9px] font-bold text-indigo-500 uppercase tracking-tight">Net Profit</span>
                        <div className={`text-sm font-black leading-none ${summary.netProfit >= 0 ? 'text-indigo-700' : 'text-red-600'}`}>
                            {formatMoney(summary.netProfit, 0)}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Margin %</span>
                        <div className={`text-sm font-bold ${summary.marginPct >= 15 ? 'text-green-600' : summary.marginPct >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                            {formatPct(summary.marginPct)}
                        </div>
                    </div>
                    <div className="space-y-0.5 text-right">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">TACoS %</span>
                        <div className={`text-sm font-bold ${summary.tacosPct !== null ? (summary.tacosPct > 15 ? 'text-red-600' : 'text-gray-800') : 'text-gray-400'}`}>
                            {formatPct(summary.tacosPct)}
                        </div>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4 pt-2 border-t border-gray-100">
                    <div className="space-y-0.5">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Orders</span>
                        <div className="text-sm font-bold text-gray-700 leading-none">{formatNumber(summary.orders)}</div>
                    </div>
                    <div className="space-y-0.5 text-right">
                        <span className="text-[9px] font-bold text-gray-400 uppercase tracking-tight">Units</span>
                        <div className="text-sm font-bold text-gray-700 leading-none">{formatNumber(summary.units)}</div>
                    </div>
                </div>
            </div>

            <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[9px] text-gray-400 font-medium">
                <div className="flex items-center gap-1 truncate opacity-75">
                    <Hash className="w-2 h-2 shrink-0" />
                    {summary.skuCount} SKUs
                </div>
                <div className="flex items-center gap-1 shrink-0 opacity-75">
                    {!summary.hasAdData && (
                        <span className="flex items-center gap-1 text-slate-400 uppercase font-black tracking-tighter">
                            <Database className="w-2 h-2" /> Gap
                        </span>
                    )}
                    <span className="ml-1">
                        <Wallet className="w-2 h-2 shrink-0 inline mr-0.5" />
                        Gross: {formatMoney(summary.profit, 0)}
                    </span>
                </div>
            </div>
            
            {isSelected && (
                <div className="absolute bottom-1 right-1 opacity-50">
                    <ChevronRight className="w-3 h-3 text-indigo-500" />
                </div>
            )}
        </div>
    );
};

export default PlatformManagementPage;