
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ContextBar } from '../common/ContextBar';
import { Product, PricingRules, PriceLog, RefundLog, ReturnDateBasis } from '../../types';
import { LayoutDashboard, Coins, Activity, Calendar, RotateCcw, Clock, BarChart2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SortState, sortRows } from '../../utils/tableSort';
import { calcRevenue, calcProfit, calcUnits, calcAdSpend } from '../../services/metrics';
import { VAT_MULTIPLIER } from '../../constants';
import { aggregatePlatformTrends } from '../../services/platformTrendAgg';
import { buildWindow } from '../../services/dateWindow';
import { asDateKey, isDateKeyBetween, getTodayKeyMelbourne, addDaysToDateKey, getReturnDateKey } from '../../services/dateUtils';
import { Tab3AlertRules, getTab3AlertRules } from '../../services/platformAlertRules';
import { PlatformManagementPageProps, Tab, PlatformSortKey, PlatformSummary, PlatformFeesRoi, TimeWindow } from './platformManagement.types';
import { PlatformOverviewTab } from './tabs/PlatformOverviewTab';
import { FeesAndRoiTab } from './tabs/FeesAndRoiTab';
import { PerformanceTrendTab } from './tabs/PerformanceTrendTab';
import { AdGroupsTab } from './tabs/AdGroupsTab';
import { TabSwitcher } from '../common/TabSwitcher';
const PlatformManagementPageContainerInner: React.FC<PlatformManagementPageProps> = ({
  products = [],
  priceHistoryMap = new Map<string, PriceLog[]>(),
  refundHistory = [],
  deductRefunds,
  setDeductRefunds,
  pricingRules = {},
  themeColor,
  headerStyle,

  // Ad Groups
  adGroups = [],
  skuFamilies = [],
  onSyncFromFamilies,
  onAddAdGroup,
  onEditAdGroup,
  onRemoveAdGroup,
  onSaveAdGroups,
  lastRecalculationSummary
}) => {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('performance');
  const [sort, setSort] = useState<SortState<PlatformSortKey>>({ key: 'revenue', dir: 'desc' });
  const [selectedPlatformKey, setSelectedPlatformKey] = useState<string | null>(null);

  // Time Window State
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('30D');
  const [customStart, setCustomStart] = useState<string>(getTodayKeyMelbourne());
  const [customEnd, setCustomEnd] = useState<string>(getTodayKeyMelbourne());

  // Return Logic State
  const [returnDateBasis, setReturnDateBasis] = useState<ReturnDateBasis>('refundDate');

  // Performance Trend State
  type PerformanceTrendMetric = 'NET_PROFIT' | 'MARGIN_PCT' | 'AVG_ORDER_VALUE' | 'UNITS_SOLD';
  const [trendMetric, setTrendMetric] = useState<PerformanceTrendMetric>('NET_PROFIT');
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const [refAreaLeft, setRefAreaLeft] = useState<string>('');
  const [refAreaRight, setRefAreaRight] = useState<string>('');
  const [zoomState, setZoomState] = useState({ startIndex: 0, endIndex: 0, isZoomed: false, lastDataLen: 0 });

  // Alert Rules State
  const [alertRules, setAlertRules] = useState<Tab3AlertRules>(getTab3AlertRules());
  const [isAuditVisible, setIsAuditVisible] = useState(false);

  // Date Window Calculation
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

  // Derive Order Date Map for Order Date Basis logic
  const orderDateMap = useMemo(() => {
    const map = new Map<string, string>();
    priceHistoryMap.forEach((logs) => {
      logs.forEach(p => {
        if (p.orderId) {
          const dKey = asDateKey(p.date);
          if (dKey) map.set(p.orderId, dKey);
        }
      });
    });
    return map;
  }, [priceHistoryMap]);

  // Filtered History
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

  const filteredRefunds = useMemo(() => {
    const { startKey, endKey } = dateWindow;
    return refundHistory.filter(r => {
      const dKey = getReturnDateKey(r, returnDateBasis, orderDateMap);
      return dKey && isDateKeyBetween(dKey, startKey, endKey);
    });
  }, [refundHistory, dateWindow, returnDateBasis, orderDateMap]);

  // Full history for trends (needs context outside window)
  const allPriceLogs = useMemo(() => Array.from(priceHistoryMap.values()).flat(), [priceHistoryMap]);

  // Platform Summaries (Overview Tab)
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

    if (deductRefunds) {
      filteredRefunds.forEach(r => {
        const pKey = r.platform || 'Unknown';
        if (dataMap[pKey]) {
          const refundAmount = Number(r.amount) || 0;
          const freightAmount = Number(r.freightAmount) || 0;
          dataMap[pKey].profit -= (refundAmount + freightAmount);
        }
      });
    }

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
  }, [filteredPriceHistoryMap, filteredRefunds, deductRefunds]);

  // Fees & ROI Data (ROI Tab)
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

    if (deductRefunds) {
      filteredRefunds.forEach(r => {
        const pKey = r.platform || 'Unknown';
        if (dataMap[pKey]) {
          const refundAmount = Number(r.amount) || 0;
          const freightAmount = Number(r.freightAmount) || 0;
          dataMap[pKey].profit -= (refundAmount + freightAmount);
        }
      });
    }

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
  }, [filteredPriceHistoryMap, pricingRules, filteredRefunds, deductRefunds]);

  // Trend Data for Comparison Cards
  const trendData = useMemo(() => {
    return aggregatePlatformTrends(
      allPriceLogs,
      { startKey: dateWindow.startKey, endKey: dateWindow.endKey },
      Object.keys(pricingRules),
      refundHistory,
      deductRefunds,
      returnDateBasis,
      orderDateMap
    );
  }, [allPriceLogs, pricingRules, dateWindow, refundHistory, deductRefunds, returnDateBasis, orderDateMap]);

  const performanceSummary = useMemo(() => {
    if (trendData.length === 0) return null;
    const validDeltas = trendData.filter(d => d.deltas.revenueDeltaPct !== null);
    const gainer = [...validDeltas].sort((a, b) => (b.deltas.revenueDeltaPct! - a.deltas.revenueDeltaPct!) || (b.current.revenue - a.current.revenue))[0];
    const loser = [...validDeltas].sort((a, b) => (a.deltas.revenueDeltaPct! - b.deltas.revenueDeltaPct!) || (b.current.revenue - a.current.revenue))[0];
    const improvedNet = trendData.filter(d => d.deltas.netProfitDeltaPct !== null).sort((a, b) => (b.deltas.netProfitDeltaPct! - a.deltas.netProfitDeltaPct!) || (b.current.revenue - a.current.revenue))[0];
    const worstNet = [...trendData].sort((a, b) => (a.current.netProfit - b.current.netProfit) || (a.current.revenue - b.current.revenue))[0];
    return { gainer, loser, improvedNet, worstNet };
  }, [trendData]);

  // Daily Trend Data for Chart
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

    if (deductRefunds) {
      filteredRefunds.forEach(r => {
        const dKey = getReturnDateKey(r, returnDateBasis, orderDateMap);
        if (dKey && daysMap.has(dKey)) {
          const entry = daysMap.get(dKey);
          const platform = r.platform || 'Unknown';
          if (entry._acc[platform]) {
            const refundVal = (Number(r.amount) + Number(r.freightAmount || 0)) * VAT_MULTIPLIER;
            entry._acc[platform].net -= refundVal;
          }
        }
      });
    }

    const result = Array.from(daysMap.values()).map(day => {
      const flatDay: any = { date: day.date, _sort: new Date(day.date).getTime() };
      if (day._acc) {
        Object.entries(day._acc).forEach(([plat, stats]: [string, any]) => {
          flatDay[`${plat}_NET_PROFIT`] = stats.net;
          flatDay[`${plat}_MARGIN_PCT`] = stats.revenue > 0 ? (stats.net / stats.revenue) * 100 : 0;
          flatDay[`${plat}_AVG_ORDER_VALUE`] = stats.orders > 0 ? (stats.revenue / stats.orders) : 0;
          flatDay[`${plat}_UNITS_SOLD`] = stats.units;
          flatDay[`${plat}_RAW_REVENUE`] = stats.revenue;
          flatDay[`${plat}_RAW_ORDERS`] = stats.orders;
        });
      }
      return flatDay;
    }).sort((a, b) => a._sort - b._sort);

    return { data: result, platforms: Array.from(activePlatforms).sort() };
  }, [filteredPriceHistoryMap, dateWindow, deductRefunds, filteredRefunds, returnDateBasis, orderDateMap]);

  // Custom Groups & Chart Aggregation logic
  const [platformGroups, setPlatformGroups] = useState<Array<{ id: string; name: string; platformKeys: string[] }>>(() => {
    try {
      const stored = localStorage.getItem("platformTrend:platformGroups");
      if (stored) return JSON.parse(stored);
      return [];
    } catch { return []; }
  });

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

  const visibleChartData = useMemo(() => {
    if (!chartDataWithGroups.length) return [];
    return chartDataWithGroups.slice(zoomState.startIndex, zoomState.endIndex + 1);
  }, [chartDataWithGroups, zoomState.startIndex, zoomState.endIndex]);

  // -- LOGIC FOR SELECTION & GROUPS --
  const uniquePlatforms = useMemo(() => (pricingRules ? Object.keys(pricingRules).sort() : []), [pricingRules]);
  const [selectedChartPlatforms, setSelectedChartPlatforms] = useState<string[]>([]);
  const isSelectionInitialized = useRef(false);

  useEffect(() => {
    if (!isSelectionInitialized.current && uniquePlatforms.length > 0) {
      const stored = localStorage.getItem("platformTrend:selectedPlatforms");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          setSelectedChartPlatforms(Array.isArray(parsed) ? parsed : uniquePlatforms);
        } catch { setSelectedChartPlatforms(uniquePlatforms); }
      } else { setSelectedChartPlatforms(uniquePlatforms); }
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

  // Zoom logic
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

  // Bar Chart Data Calculation
  const barChartData = useMemo(() => {
    const platformsData = trendData
      .filter(d => selectedChartPlatforms.includes(d.platform))
      .map(d => {
        let currentVal = 0; let priorVal = 0;
        switch (trendMetric) {
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

    const groupsData = platformGroups.map((group, i) => {
      const groupMembers = trendData.filter(d => group.platformKeys.includes(d.platform));
      let currentVal = 0; let priorVal = 0;
      const sumCurrRev = groupMembers.reduce((s, m) => s + m.current.revenue, 0);
      const sumCurrProfit = groupMembers.reduce((s, m) => s + m.current.netProfit, 0);
      const sumCurrOrders = groupMembers.reduce((s, m) => s + m.current.orders, 0);
      const sumCurrUnits = groupMembers.reduce((s, m) => s + m.current.unitsSold, 0);
      const sumPriorRev = groupMembers.reduce((s, m) => s + m.prior.revenue, 0);
      const sumPriorProfit = groupMembers.reduce((s, m) => s + m.prior.netProfit, 0);
      const sumPriorOrders = groupMembers.reduce((s, m) => s + m.prior.orders, 0);
      const sumPriorUnits = groupMembers.reduce((s, m) => s + m.prior.unitsSold, 0);

      switch (trendMetric) {
        case 'NET_PROFIT': currentVal = sumCurrProfit; priorVal = sumPriorProfit; break;
        case 'MARGIN_PCT': currentVal = sumCurrRev > 0 ? (sumCurrProfit / sumCurrRev) * 100 : 0; priorVal = sumPriorRev > 0 ? (sumPriorProfit / sumPriorRev) * 100 : 0; break;
        case 'AVG_ORDER_VALUE': currentVal = sumCurrOrders > 0 ? (sumCurrRev / sumCurrOrders) : 0; priorVal = sumPriorOrders > 0 ? (sumPriorRev / sumPriorOrders) : 0; break;
        case 'UNITS_SOLD': currentVal = sumCurrUnits; priorVal = sumPriorUnits; break;
      }

      return {
        platform: group.name,
        current: currentVal,
        prior: priorVal,
        color: ['#ec4899', '#8b5cf6', '#14b8a6', '#f59e0b', '#6366f1'][i % 5]
      };
    });

    const combined = [...platformsData, ...groupsData].filter(d => !hiddenSeries.has(d.platform));
    const maxVal = combined.length > 0 ? combined.reduce((max, d) => Math.max(max, d.current, d.prior), 0) : 0;
    return combined.map(d => ({ ...d, bgValue: maxVal * 1.2 })).sort((a, b) => b.current - a.current);
  }, [trendData, selectedChartPlatforms, trendMetric, platformGroups, hiddenSeries, pricingRules]);

  // Overview Data Sorting
  const sortedSummaries = useMemo(() => {
    const getValue = (row: PlatformSummary, key: PlatformSortKey) => {
      if (key === 'name') return row.platform;
      if (key === 'manager') return pricingRules[row.platform]?.manager || 'Unassigned';
      if (key === 'skus') return row.skuCount;
      if (key === 'margin') return row.marginPct;
      if (key === 'velocity') return row.units;
      return (row as any)[key] ?? 0;
    };
    return sortRows(platformSummaries, sort as SortState<string>, getValue as any);
  }, [platformSummaries, sort, pricingRules]);

  const sortedRoiData = useMemo(() => {
    const getValue = (row: PlatformFeesRoi, key: PlatformSortKey) => {
      if (key === 'name') return row.platform;
      if (key === 'margin') return row.marginPct;
      if (key === 'velocity') return row.units;
      return (row as any)[key] ?? 0;
    };
    return sortRows(roiData, sort as SortState<string>, getValue as any);
  }, [roiData, sort]);

  const topPlatformKey = useMemo(() => {
    if (platformSummaries.length === 0) return null;
    return [...platformSummaries].sort((a, b) => b.netProfit - a.netProfit)[0].platform;
  }, [platformSummaries]);

  useEffect(() => {
    if (platformSummaries.length > 0 && !selectedPlatformKey) {
      setSelectedPlatformKey(topPlatformKey);
    }
  }, [platformSummaries, topPlatformKey]);

  const categoryBreakdown = useMemo(() => {
    if (!selectedPlatformKey) return [];
    const catMap: Record<string, number> = {};
    products.forEach(p => {
      const cat = p.category || 'Uncategorized';
      const logs = filteredPriceHistoryMap.get(p.sku) || [];
      logs.forEach(log => {
        if (log.platform === selectedPlatformKey) {
          catMap[cat] = (catMap[cat] || 0) + (calcRevenue(log) * VAT_MULTIPLIER);
        }
      });
    });
    return Object.entries(catMap).map(([name, revenue]) => ({ name, revenue })).sort((a, b) => b.revenue - a.revenue).slice(0, 10);
  }, [selectedPlatformKey, filteredPriceHistoryMap, products]);

  // Render Logic
  return (
    <div className="max-w-[1600px] mx-auto space-y-6 pb-10">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <TabSwitcher
          tabs={[
            { key: 'performance', label: 'Performance Trend', icon: Activity },
            { key: 'overview', label: 'Platform Overview', icon: LayoutDashboard },
            { key: 'roi', label: 'Fees & ROI', icon: Coins },
            { key: 'ad-groups', label: 'Ad Groups', icon: BarChart2 },
          ]}
          activeTab={activeTab}
          onChange={(key) => { setActiveTab(key as Tab); setIsAuditVisible(false); }}
          size="sm"
        />

      </div>

      <ContextBar
        timeOptions={[
          { key: '7D', label: '7D' },
          { key: '14D', label: '14D' },
          { key: '30D', label: '30D' },
          { key: '60D', label: '60D' },
          { key: 'ALL', label: 'All Time' },
          { key: 'CUSTOM', label: 'Custom' }
        ]}
        activeWindow={timeWindow}
        onWindowChange={(key) => setTimeWindow(key as any)}
        periodLabel={periodLabel}
        customStart={customStart}
        customEnd={customEnd}
        onCustomStartChange={setCustomStart}
        onCustomEndChange={setCustomEnd}
      >
        {activeTab !== 'ad-groups' && (<>
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setReturnDateBasis('refundDate')}
              className={`px-3 h-8 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${returnDateBasis === 'refundDate' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Clock className="w-3 h-3" />
              Refund Date
            </button>
            <button
              onClick={() => setReturnDateBasis('orderDate')}
              className={`px-3 h-8 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${returnDateBasis === 'orderDate' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
            >
              <Calendar className="w-3 h-3" />
              Order Date
            </button>
          </div>
          <label className="flex items-center h-8 gap-2 px-3 bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:border-indigo-300 transition-colors">
            <input
              type="checkbox"
              checked={deductRefunds}
              onChange={e => setDeductRefunds(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 border-gray-300"
            />
            <div className="flex items-center gap-1.5">
              <RotateCcw className={`w-3.5 h-3.5 ${deductRefunds ? 'text-red-500' : 'text-gray-400'}`} />
              <span className={`text-[10px] font-bold uppercase tracking-tight ${deductRefunds ? 'text-gray-900' : 'text-gray-500'}`}>Deduct Returns</span>
            </div>
          </label>
          {(activeTab === 'performance' || activeTab === 'overview' || activeTab === 'roi') && (
            <button
              onClick={() => setIsAuditVisible(v => !v)}
              className={`flex items-center gap-2 px-3 h-8 rounded-lg font-bold border transition-all shadow-sm text-xs ${isAuditVisible ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
              title="Toggle Audit Panel"
            >
              <Activity className="w-4 h-4" />
              Audit{isAuditVisible ? ': On' : ''}
            </button>
          )}
        </>)}
      </ContextBar>

      <div className="min-h-[500px]">
        {activeTab === 'performance' && (
          <PerformanceTrendTab
            trendData={trendData}
            performanceSummary={performanceSummary}
            timeWindow={timeWindow}
            alertRules={alertRules}
            setAlertRules={setAlertRules}
            uniquePlatforms={uniquePlatforms}
            selectedChartPlatforms={selectedChartPlatforms}
            setSelectedChartPlatforms={setSelectedChartPlatforms}
            platformGroups={platformGroups}
            setPlatformGroups={setPlatformGroups}
            isGroupCreatorOpen={false}
            setIsGroupCreatorOpen={() => { }}
            newGroupName=""
            setNewGroupName={() => { }}
            newGroupPlatforms={[]}
            setNewGroupPlatforms={() => { }}
            handleCreateGroup={() => { }}
            deleteGroup={() => { }}
            toggleNewGroupPlatform={() => { }}
            trendMetric={trendMetric}
            setTrendMetric={setTrendMetric}
            zoomState={zoomState}
            handleResetZoom={handleResetZoom}
            visibleChartData={visibleChartData}
            setRefAreaLeft={setRefAreaLeft}
            setRefAreaRight={setRefAreaRight}
            refAreaLeft={refAreaLeft}
            refAreaRight={refAreaRight}
            zoom={zoom}
            handleLegendClick={handleLegendClick}
            hiddenSeries={hiddenSeries}
            pricingRules={pricingRules}
            barChartData={barChartData}
            startKey={dateWindow.startKey}
            endKey={dateWindow.endKey}
            isAuditVisible={isAuditVisible}
          />
        )}
        {activeTab === 'overview' && (
          <PlatformOverviewTab
            sortedSummaries={sortedSummaries}
            selectedPlatformKey={selectedPlatformKey}
            setSelectedPlatformKey={setSelectedPlatformKey}
            pricingRules={pricingRules}
            themeColor={themeColor}
            selectedSummary={platformSummaries.find(s => s.platform === selectedPlatformKey)}
            categoryBreakdown={categoryBreakdown}
            sort={sort}
            setSort={setSort}
            topPlatformKey={topPlatformKey}
            startKey={dateWindow.startKey}
            endKey={dateWindow.endKey}
            isAuditVisible={isAuditVisible}
          />
        )}
        {activeTab === 'roi' && (
          <FeesAndRoiTab
            roiData={sortedRoiData}
            pricingRules={pricingRules}
            themeColor={themeColor}
            sort={sort}
            setSort={setSort}
            startKey={dateWindow.startKey}
            endKey={dateWindow.endKey}
            isAuditVisible={isAuditVisible}
          />
        )}
        {activeTab === 'ad-groups' && (
          <AdGroupsTab
            adGroups={adGroups}
            skuFamilies={skuFamilies}
            products={products}
            onSyncFromFamilies={onSyncFromFamilies}
            onAddAdGroup={onAddAdGroup}
            onEditAdGroup={onEditAdGroup}
            onRemoveAdGroup={onRemoveAdGroup}
            onSaveAdGroups={onSaveAdGroups}
            lastRecalculationSummary={lastRecalculationSummary}
            themeColor={themeColor}
            platforms={uniquePlatforms}
            pricingRules={pricingRules}
          />
        )}
      </div>
    </div>
  );
};

export const PlatformManagementPageContainer = React.memo(PlatformManagementPageContainerInner);
