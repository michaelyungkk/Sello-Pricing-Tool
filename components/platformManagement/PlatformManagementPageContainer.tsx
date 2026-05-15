
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { ContextBar } from '../common/ContextBar';
import { Product, PricingRules, PriceLog, RefundLog, ReturnDateBasis } from '../../types';
import { LayoutDashboard, Coins, Activity, Calendar, RotateCcw, Clock, BarChart2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SortState, sortRows } from '../../utils/tableSort';
import { aggregateTransactionLedger } from '../../services/metrics';
import { aggregatePlatformTrends } from '../../services/platformTrendAgg';
import { buildWindow } from '../../services/dateWindow';
import { asDateKey, isDateKeyBetween, getTodayKeyMelbourne, addDaysToDateKey } from '../../services/dateUtils';
import { Tab3AlertRules, getTab3AlertRules } from '../../services/platformAlertRules';
import { PlatformManagementPageProps, Tab, PlatformSortKey, PlatformSummary, PlatformFeesRoi, TimeWindow } from './platformManagement.types';
import { PlatformOverviewTab } from './tabs/PlatformOverviewTab';
import { FeesAndRoiTab } from './tabs/FeesAndRoiTab';
import { PerformanceTrendTab } from './tabs/PerformanceTrendTab';
import { AdGroupsTab } from './tabs/AdGroupsTab';
import { TabSwitcher } from '../common/TabSwitcher';
import { getPopComparison } from '../../services/popComparison';
import {
  buildPlatformOverviewRowDetail,
  buildPlatformOverviewWeeklyAnalysis,
  getLastCompleteWeekStartKey,
  getPlatformOverviewDataRange,
  PlatformOverviewFocusMetric,
  PlatformOverviewWeeklyRow
} from '../../services/platformOverviewAnalysis';

type PlatformOverviewSortKey = 'platform' | 'weekStartKey' | PlatformOverviewFocusMetric | 'focusDelta';
const PlatformManagementPageContainerInner: React.FC<PlatformManagementPageProps> = ({
  products = [],
  priceHistoryMap = new Map<string, PriceLog[]>(),
  refundHistory = [],
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
  const [overviewSort, setOverviewSort] = useState<SortState<PlatformOverviewSortKey>>({ key: 'focusDelta', dir: 'desc' });
  const [overviewFocusMetric, setOverviewFocusMetric] = useState<PlatformOverviewFocusMetric>('cogsPct');
  const [overviewPlatformKey, setOverviewPlatformKey] = useState<string | null>(null);
  const [selectedOverviewRowId, setSelectedOverviewRowId] = useState<string | null>(null);

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
  const [deductRefunds, setDeductRefunds] = React.useState<boolean>(() => {
    const saved = localStorage.getItem('sello_deduct_refunds_platform');
    return saved === null ? true : saved === 'true';
  });
  React.useEffect(() => {
    localStorage.setItem('sello_deduct_refunds_platform', deductRefunds.toString());
  }, [deductRefunds]);

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
    else if (timeWindow === 'YESTERDAY') { mode = 'days'; days = 1; }
    else days = parseInt(timeWindow.replace('D', ''));

    return buildWindow({
      mode,
      days,
      startKey: customStart,
      endKey: customEnd,
      excludeToday: timeWindow !== 'CUSTOM' && timeWindow !== 'ALL'
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

  const previousDateWindow = useMemo(() => {
    const prevEndKey = addDaysToDateKey(dateWindow.startKey, -1);
    const prevStartKey = addDaysToDateKey(prevEndKey, -(dateWindow.expectedDays - 1));
    return { startKey: prevStartKey, endKey: prevEndKey };
  }, [dateWindow.startKey, dateWindow.expectedDays]);

  const filteredPrevPriceHistoryMap = useMemo(() => {
    const filteredMap = new Map<string, PriceLog[]>();
    const { startKey, endKey } = previousDateWindow;
    priceHistoryMap.forEach((logs, sku) => {
      const filteredLogs = logs.filter(log => {
        const dKey = asDateKey(log.date);
        return dKey && isDateKeyBetween(dKey, startKey, endKey);
      });
      if (filteredLogs.length > 0) filteredMap.set(sku, filteredLogs);
    });
    return filteredMap;
  }, [priceHistoryMap, previousDateWindow]);

  // Full history for trends (needs context outside window)
  const allPriceLogs = useMemo(() => Array.from(priceHistoryMap.values()).flat(), [priceHistoryMap]);
  const filteredPriceLogs = useMemo(() => Array.from(filteredPriceHistoryMap.values()).flat(), [filteredPriceHistoryMap]);
  const filteredPrevPriceLogs = useMemo(() => Array.from(filteredPrevPriceHistoryMap.values()).flat(), [filteredPrevPriceHistoryMap]);

  // Platform Summaries (Overview Tab)
  const platformSummaries = useMemo<PlatformSummary[]>(() => {
    const ledger = aggregateTransactionLedger({
      priceLogs: filteredPriceLogs,
      refundLogs: refundHistory,
      startKey: dateWindow.startKey,
      endKey: dateWindow.endKey,
      returnDateBasis,
      orderDateMap,
      deductRefunds
    });

    return ledger.platforms.map((stats): PlatformSummary => {
      const hasAdData = stats.adRowsCount > 0;
      return {
        platform: stats.platform,
        revenue: stats.revenue,
        profit: stats.netProfit + stats.adjustedAdSpend,
        netProfit: stats.netProfit,
        units: stats.units,
        adSpend: stats.adjustedAdSpend,
        orders: stats.orders,
        marginPct: stats.margin ?? 0,
        tacosPct: (stats.revenue > 0 && hasAdData) ? (stats.adjustedAdSpend / stats.revenue) * 100 : null,
        skuCount: stats.skuCount,
        hasAdData
      };
    });
  }, [filteredPriceLogs, refundHistory, dateWindow, returnDateBasis, orderDateMap, deductRefunds]);

  // Fees & ROI Data (ROI Tab)
  const roiData = useMemo<PlatformFeesRoi[]>(() => {
    const ledger = aggregateTransactionLedger({
      priceLogs: filteredPriceLogs,
      refundLogs: refundHistory,
      startKey: dateWindow.startKey,
      endKey: dateWindow.endKey,
      returnDateBasis,
      orderDateMap,
      deductRefunds
    });

    return ledger.platforms.map((stats): PlatformFeesRoi => {
      const revenue = stats.revenue;
      const adSpend = stats.adjustedAdSpend;
      const netProfit = stats.netProfit;
      const grossProfit = netProfit + adSpend;
      const hasAdData = stats.adRowsCount > 0;
      const marginPctVal = stats.margin;
      const tacosPctVal = (revenue > 0 && hasAdData) ? (adSpend / revenue) * 100 : null;
      const config = pricingRules[stats.platform];
      const netAfterAds = netProfit;
      const roiAfterAds = adSpend > 0 ? (netAfterAds / adSpend) : null;

      return {
        platform: stats.platform,
        revenue,
        profit: grossProfit,
        marginPct: marginPctVal,
        adSpend,
        tacosPct: tacosPctVal,
        orders: stats.orders,
        units: stats.units,
        estMarketplaceFees: config ? (revenue * (config.commission / 100)) : undefined,
        netAfterAds,
        roiAfterAds,
        dataQuality: {
          hasAdData,
          hasProfit: stats.salesRows > 0 || stats.adRowsCount > 0,
          profitIsEstimated: false
        }
      };
    });
  }, [filteredPriceLogs, refundHistory, dateWindow, returnDateBasis, orderDateMap, deductRefunds, pricingRules]);

  const previousByPlatform = useMemo(() => {
    const map = new Map<string, {
      revenue: number;
      grossProfit: number;
      netProfit: number;
      marginPct: number | null;
      units: number;
      adSpend: number;
      tacosPct: number | null;
      roiAfterAds: number | null;
    }>();

    const ledger = aggregateTransactionLedger({
      priceLogs: filteredPrevPriceLogs,
      refundLogs: refundHistory,
      startKey: previousDateWindow.startKey,
      endKey: previousDateWindow.endKey,
      returnDateBasis,
      orderDateMap,
      deductRefunds
    });

    ledger.platforms.forEach(stats => {
      const revenue = stats.revenue;
      const adSpend = stats.adjustedAdSpend;
      const netProfit = stats.netProfit;
      const grossProfit = netProfit + adSpend;
      const hasAdData = stats.adRowsCount > 0;
      const marginPctVal = stats.margin;
      const tacosPctVal = (revenue > 0 && hasAdData) ? (adSpend / revenue) * 100 : null;
      const roiAfterAds = adSpend > 0 ? (netProfit / adSpend) : null;
      map.set(stats.platform, {
        revenue,
        grossProfit,
        netProfit,
        marginPct: marginPctVal,
        units: stats.units,
        adSpend,
        tacosPct: tacosPctVal,
        roiAfterAds
      });
    });

    return map;
  }, [filteredPrevPriceLogs, refundHistory, previousDateWindow, returnDateBasis, orderDateMap, deductRefunds]);

  const roiPopByKey = useMemo(() => {
    const out = new Map<string, Record<string, ReturnType<typeof getPopComparison>>>();
    roiData.forEach(row => {
      const prev = previousByPlatform.get(row.platform);
      out.set(row.platform, {
        revenue: getPopComparison(row.revenue, prev?.revenue ?? 0),
        grossProfit: getPopComparison(row.profit ?? 0, prev?.grossProfit ?? 0),
        margin: getPopComparison(row.marginPct ?? 0, prev?.marginPct ?? 0),
        adSpend: getPopComparison(row.adSpend ?? 0, prev?.adSpend ?? 0),
        tacos: getPopComparison(row.tacosPct ?? 0, prev?.tacosPct ?? 0),
        netProfit: getPopComparison(row.netAfterAds ?? 0, prev?.netProfit ?? 0),
        roi: getPopComparison(row.roiAfterAds ?? 0, prev?.roiAfterAds ?? 0)
      });
    });
    return out;
  }, [roiData, previousByPlatform]);

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
    const dayKeys = new Set<string>();
    const activePlatforms = new Set<string>();

    filteredPriceLogs.forEach(log => {
      const dKey = asDateKey(log.date);
      if (dKey && isDateKeyBetween(dKey, startKey, endKey)) dayKeys.add(dKey);
    });
    refundHistory.forEach(refund => {
      const dKey = returnDateBasis === 'orderDate' && orderDateMap && refund.orderId
        ? asDateKey(orderDateMap.get(refund.resendBaseOrderId || refund.orderId.replace(/-resend$/i, '')))
        : asDateKey(refund.date);
      if (dKey && isDateKeyBetween(dKey, startKey, endKey)) dayKeys.add(dKey);
    });

    const result = Array.from(dayKeys).sort().map(day => {
      const ledger = aggregateTransactionLedger({
        priceLogs: filteredPriceLogs,
        refundLogs: refundHistory,
        startKey: day,
        endKey: day,
        returnDateBasis,
        orderDateMap,
        deductRefunds
      });
      const flatDay: any = { date: day, _sort: new Date(day).getTime() };
      ledger.platforms.forEach(stats => {
        activePlatforms.add(stats.platform);
        flatDay[`${stats.platform}_NET_PROFIT`] = stats.netProfit;
        flatDay[`${stats.platform}_MARGIN_PCT`] = stats.margin ?? 0;
        flatDay[`${stats.platform}_AVG_ORDER_VALUE`] = stats.orders > 0 ? (stats.revenue / stats.orders) : 0;
        flatDay[`${stats.platform}_UNITS_SOLD`] = stats.units;
        flatDay[`${stats.platform}_RAW_REVENUE`] = stats.revenue;
        flatDay[`${stats.platform}_RAW_ORDERS`] = stats.orders;
      });
      return flatDay;
    });

    return { data: result, platforms: Array.from(activePlatforms).sort() };
  }, [filteredPriceLogs, refundHistory, dateWindow, deductRefunds, returnDateBasis, orderDateMap]);

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

  const sortedRoiData = useMemo(() => {
    const getValue = (row: PlatformFeesRoi, key: PlatformSortKey) => {
      if (key === 'name') return row.platform;
      if (key === 'margin') return row.marginPct;
      if (key === 'velocity') return row.units;
      return (row as any)[key] ?? 0;
    };
    return sortRows(roiData, sort as SortState<string>, getValue as any);
  }, [roiData, sort]);

  const overviewDataRange = useMemo(() => {
    return getPlatformOverviewDataRange({
      priceLogs: allPriceLogs,
      refundLogs: refundHistory,
      returnDateBasis,
      orderDateMap
    });
  }, [allPriceLogs, refundHistory, returnDateBasis, orderDateMap]);

  const overviewAllWeeksAnalysis = useMemo(() => {
    if (!overviewDataRange) {
      return { rows: [], summary: { platformCount: 0, weekCount: 0, revenue: 0, netProfit: 0, marginPct: null, units: 0, cogsPct: null } };
    }
    return buildPlatformOverviewWeeklyAnalysis({
      priceLogs: allPriceLogs,
      refundLogs: refundHistory,
      startKey: overviewDataRange.startKey,
      endKey: overviewDataRange.endKey,
      returnDateBasis,
      orderDateMap,
      deductRefunds,
      platformFilter: overviewPlatformKey || null
    });
  }, [allPriceLogs, refundHistory, overviewDataRange, returnDateBasis, orderDateMap, deductRefunds, overviewPlatformKey]);

  const lastCompleteWeekStartKey = useMemo(() => {
    return getLastCompleteWeekStartKey(overviewAllWeeksAnalysis.rows);
  }, [overviewAllWeeksAnalysis.rows]);

  const overviewVisibleRows = useMemo(() => {
    if (overviewPlatformKey) {
      return overviewAllWeeksAnalysis.rows;
    }
    const fallbackWeekStartKey = overviewAllWeeksAnalysis.rows
      .map(row => row.naturalWeekStartKey)
      .sort()
      .slice(-1)[0] || null;
    const targetWeekStartKey = lastCompleteWeekStartKey || fallbackWeekStartKey;
    if (!targetWeekStartKey) return [];
    return overviewAllWeeksAnalysis.rows.filter(row => row.naturalWeekStartKey === targetWeekStartKey);
  }, [overviewAllWeeksAnalysis.rows, overviewPlatformKey, lastCompleteWeekStartKey]);

  const overviewSummary = useMemo(() => {
    if (overviewVisibleRows.length === 0) {
      return { platformCount: 0, weekCount: 0, revenue: 0, netProfit: 0, marginPct: null, units: 0, cogsPct: null };
    }
    const revenue = overviewVisibleRows.reduce((sum, row) => sum + row.revenue, 0);
    const netProfit = overviewVisibleRows.reduce((sum, row) => sum + row.netProfit, 0);
    const units = overviewVisibleRows.reduce((sum, row) => sum + row.units, 0);
    const cogs = overviewVisibleRows.reduce((sum, row) => sum + row.cogs, 0);
    return {
      platformCount: new Set(overviewVisibleRows.map(row => row.platform)).size,
      weekCount: new Set(overviewVisibleRows.map(row => row.naturalWeekStartKey)).size,
      revenue,
      netProfit,
      marginPct: revenue > 0 ? (netProfit / revenue) * 100 : null,
      units,
      cogsPct: revenue > 0 ? (cogs / revenue) * 100 : null
    };
  }, [overviewVisibleRows]);

  const sortedOverviewRows = useMemo(() => {
    const getValue = (row: PlatformOverviewWeeklyRow, key: PlatformOverviewSortKey) => {
      if (key === 'platform') return row.platform;
      if (key === 'weekStartKey') return row.weekStartKey;
      if (key === 'focusDelta') return row.delta[overviewFocusMetric] ?? Number.NEGATIVE_INFINITY;
      return row[key] ?? 0;
    };
    return sortRows(overviewVisibleRows, overviewSort as SortState<string>, getValue as any);
  }, [overviewVisibleRows, overviewSort, overviewFocusMetric]);

  useEffect(() => {
    if (selectedOverviewRowId === null) return;
    const hasSelection = sortedOverviewRows.some(row => row.id === selectedOverviewRowId);
    if (!hasSelection) {
      setSelectedOverviewRowId(null);
    }
  }, [sortedOverviewRows, selectedOverviewRowId]);

  useEffect(() => {
    setSelectedOverviewRowId(null);
    setOverviewSort(overviewPlatformKey
      ? { key: 'weekStartKey', dir: 'desc' }
      : { key: 'focusDelta', dir: 'desc' });
  }, [overviewPlatformKey]);

  const selectedOverviewRow = useMemo(() => {
    return sortedOverviewRows.find(row => row.id === selectedOverviewRowId) || null;
  }, [sortedOverviewRows, selectedOverviewRowId]);

  const overviewRowDetail = useMemo(() => {
    if (!selectedOverviewRow) return null;
    return buildPlatformOverviewRowDetail({
      products,
      priceLogs: allPriceLogs,
      refundLogs: refundHistory,
      row: selectedOverviewRow,
      focusMetric: overviewFocusMetric,
      returnDateBasis,
      orderDateMap,
      deductRefunds
    });
  }, [products, allPriceLogs, refundHistory, selectedOverviewRow, overviewFocusMetric, returnDateBasis, orderDateMap, deductRefunds]);

  const overviewVisibleRange = useMemo(() => {
    if (sortedOverviewRows.length === 0) return null;
    const starts = sortedOverviewRows.map(row => row.weekStartKey).sort();
    const ends = sortedOverviewRows.map(row => row.weekEndKey).sort();
    return { startKey: starts[0], endKey: ends[ends.length - 1] };
  }, [sortedOverviewRows]);

  const overviewAuditRows = useMemo<PlatformSummary[]>(() => {
    if (!overviewVisibleRange) return [];
    const ledger = aggregateTransactionLedger({
      priceLogs: allPriceLogs,
      refundLogs: refundHistory,
      startKey: overviewVisibleRange.startKey,
      endKey: overviewVisibleRange.endKey,
      returnDateBasis,
      orderDateMap,
      deductRefunds,
      platformFilter: overviewPlatformKey || null
    });

    return ledger.platforms.map((stats): PlatformSummary => {
      const hasAdData = stats.adRowsCount > 0;
      return {
        platform: stats.platform,
        revenue: stats.revenue,
        profit: stats.netProfit + stats.adjustedAdSpend,
        netProfit: stats.netProfit,
        units: stats.units,
        adSpend: stats.adjustedAdSpend,
        orders: stats.orders,
        marginPct: stats.margin ?? 0,
        tacosPct: (stats.revenue > 0 && hasAdData) ? (stats.adjustedAdSpend / stats.revenue) * 100 : null,
        skuCount: stats.skuCount,
        hasAdData
      };
    });
  }, [overviewVisibleRange, allPriceLogs, refundHistory, returnDateBasis, orderDateMap, deductRefunds, overviewPlatformKey]);

  const overviewScopeLabel = useMemo(() => {
    if (overviewPlatformKey) {
      return `${overviewPlatformKey} • All Available Weeks`;
    }
    return 'All Platforms • Last Complete Week';
  }, [overviewPlatformKey]);

  const sharedHeaderControls = (
    <>
      <div className="flex bg-gray-100 p-0.5 rounded-lg h-8 items-center">
        <button
          onClick={() => setReturnDateBasis('refundDate')}
          className={`px-3 h-7 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${returnDateBasis === 'refundDate' ? 'bg-white shadow text-theme' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Clock className="w-3 h-3" />
          Refund Date
        </button>
        <button
          onClick={() => setReturnDateBasis('orderDate')}
          className={`px-3 h-7 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${returnDateBasis === 'orderDate' ? 'bg-white shadow text-theme' : 'text-gray-500 hover:text-gray-700'}`}
        >
          <Calendar className="w-3 h-3" />
          Order Date
        </button>
      </div>
      <label className="flex items-center h-8 gap-2 px-3 bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:border-theme-20 transition-colors">
        <input
          type="checkbox"
          checked={deductRefunds}
          onChange={e => setDeductRefunds(e.target.checked)}
          className="w-4 h-4 text-theme rounded focus:ring-theme border-gray-300"
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
    </>
  );

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
        />

      </div>

      {activeTab === 'overview' ? (
        <div className="bg-custom-glass backdrop-blur-custom border border-custom-glass rounded-xl shadow-sm p-3 block md:flex md:flex-row justify-between items-center gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col">
              <span className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-0.5">Overview Scope</span>
              <span className="text-xs font-bold text-theme flex items-center gap-1.5">{overviewScopeLabel}</span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4 md:mt-0 h-8">
            {sharedHeaderControls}
          </div>
        </div>
      ) : (
        <ContextBar
          timeOptions={[
            { key: 'YESTERDAY', label: 'Yesterday' },
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
          {activeTab !== 'ad-groups' && sharedHeaderControls}
        </ContextBar>
      )}

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
            pricingRules={pricingRules}
            themeColor={themeColor}
            summary={overviewSummary}
            rows={sortedOverviewRows}
            focusMetric={overviewFocusMetric}
            setFocusMetric={setOverviewFocusMetric}
            sort={overviewSort}
            setSort={setOverviewSort}
            platformOptions={uniquePlatforms}
            selectedPlatformKey={overviewPlatformKey}
            setSelectedPlatformKey={setOverviewPlatformKey}
            selectedRowId={selectedOverviewRowId}
            setSelectedRowId={setSelectedOverviewRowId}
            selectedRow={selectedOverviewRow}
            detail={overviewRowDetail}
            auditRows={overviewAuditRows}
            startKey={overviewVisibleRange?.startKey}
            endKey={overviewVisibleRange?.endKey}
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
            popByPlatform={roiPopByKey}
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
