
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, PricingRules, PriceLog } from '../../types';
import { LayoutDashboard, Coins, Activity, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SortState, sortRows } from '../../utils/tableSort';
import { calcRevenue, calcProfit, calcUnits, calcAdSpend } from '../../services/metrics';
import { VAT_MULTIPLIER } from '../../constants';
import { aggregatePlatformTrends } from '../../services/platformTrendAgg';
import { buildWindow } from '../../services/dateWindow';
import { asDateKey, isDateKeyBetween, getTodayKeyMelbourne } from '../../services/dateUtils';
import { Tab3AlertRules, getTab3AlertRules } from '../../services/platformAlertRules';
import { PlatformManagementPageProps, Tab, PlatformSortKey, PlatformSummary, PlatformFeesRoi, TimeWindow } from './platformManagement.types';
import { PlatformOverviewTab } from './tabs/PlatformOverviewTab';
import { FeesAndRoiTab } from './tabs/FeesAndRoiTab';
import { PerformanceTrendTab } from './tabs/PerformanceTrendTab';

export const PlatformManagementPageContainer: React.FC<PlatformManagementPageProps> = ({
  products = [],
  priceHistoryMap = new Map(),
  pricingRules = {},
  themeColor,
  headerStyle
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [sort, setSort] = useState<SortState<PlatformSortKey>>({ key: 'revenue', dir: 'desc' });
  const [selectedPlatformKey, setSelectedPlatformKey] = useState<string | null>(null);
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
    const dataMap: Record<string, {
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
    const dataMap: Record<string, {
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
            <PlatformOverviewTab sortedSummaries={sortedSummaries} selectedPlatformKey={selectedPlatformKey} setSelectedPlatformKey={setSelectedPlatformKey} pricingRules={pricingRules} themeColor={themeColor} selectedSummary={selectedSummary} categoryBreakdown={categoryBreakdown} sort={sort} setSort={setSort} topPlatformKey={topPlatformKey} />
        )}
        {activeTab === 'roi' && (
            <FeesAndRoiTab roiData={sortedRoiData} pricingRules={pricingRules} themeColor={themeColor} sort={sort} setSort={setSort} />
        )}
        {activeTab === 'performance' && (
            <PerformanceTrendTab trendData={trendData} performanceSummary={performanceSummary} timeWindow={timeWindow} alertRules={alertRules} setAlertRules={setAlertRules} uniquePlatforms={uniquePlatforms} selectedChartPlatforms={selectedChartPlatforms} setSelectedChartPlatforms={setSelectedChartPlatforms} platformGroups={platformGroups} setPlatformGroups={setPlatformGroups} isGroupCreatorOpen={isGroupCreatorOpen} setIsGroupCreatorOpen={setIsGroupCreatorOpen} newGroupName={newGroupName} setNewGroupName={setNewGroupName} newGroupPlatforms={newGroupPlatforms} setNewGroupPlatforms={setNewGroupPlatforms} handleCreateGroup={handleCreateGroup} deleteGroup={deleteGroup} toggleNewGroupPlatform={toggleNewGroupPlatform} trendMetric={trendMetric} setTrendMetric={setTrendMetric} zoomState={zoomState} handleResetZoom={handleResetZoom} visibleChartData={visibleChartData} setRefAreaLeft={setRefAreaLeft} setRefAreaRight={setRefAreaRight} refAreaLeft={refAreaLeft} refAreaRight={refAreaRight} zoom={zoom} handleLegendClick={handleLegendClick} hiddenSeries={hiddenSeries} pricingRules={pricingRules} barChartData={barChartData} />
        )}
      </div>

      {showDebug && (<AuditSection roiData={roiData} pricingRules={pricingRules} />)}
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
