
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { ArrowLeft, Info, AlertTriangle, Package, RotateCcw, Megaphone, DollarSign, TrendingDown, TrendingUp } from 'lucide-react';
import { Product, PriceLog, PriceChangeRecord, RefundLog, ReturnDateBasis, PricingRules } from '../types';
import { ThresholdConfig } from '../services/thresholdsConfig';
import { calcProfit, calcRevenue, calcAdSpend, marginPct, calcTACoSPct, calcUnits } from '../services/metrics';
import { buildWindow } from '../services/dateWindow';
import { asDateKey, isDateKeyBetween, getTodayKeyMelbourne, getReturnDateKey } from '../services/dateUtils';
import { VAT_MULTIPLIER } from '../constants';
import { buildRefundOverview } from '../services/refundAgg';
import { parseReturnsReason } from '../services/returnsReasonCodes';
import { sortRows, SortState } from '../utils/tableSort';
import { aggregateRefundKeywords } from '../services/refundTextAgg';
import { calculateQuantiles } from './skuDeepDive/charts/BoxPlot';

// Section Components
import { SkuOverviewSection } from './skuDeepDive/sections/SkuOverviewSection';
import { DiagnosticSignalsSection } from './skuDeepDive/sections/DiagnosticSignalsSection';
import { DistributionAnalysisSection } from './skuDeepDive/sections/DistributionAnalysisSection';
import { PricingHistorySection } from './skuDeepDive/sections/PricingHistorySection';
import { TransactionLedgerSection } from './skuDeepDive/sections/TransactionLedgerSection';
import { ReturnsAnalysisSection } from './skuDeepDive/sections/ReturnsAnalysisSection';

interface SkuDeepDivePageProps {
    data: {
        product: Product;
        allTimeSales: number;
        allTimeQty: number;
        transactions?: PriceLog[];
        refunds?: RefundLog[];
    };
    themeColor: string;
    onBack?: () => void;
    priceChangeHistory?: PriceChangeRecord[];
    initialTimeWindow?: 'yesterday' | '7d' | '30d' | 'custom';
    focus?: string;
    thresholds: ThresholdConfig;
    pricingRules?: PricingRules;
    skuFamilies: any[];
    products: Product[];
    adGroups: any[];
    priceHistoryMap: Map<string, any[]>;
}

// Helper to read URL params
const getActiveSectionFromUrl = () => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('section');
};

const SkuDeepDivePage: React.FC<SkuDeepDivePageProps> = ({
    data, themeColor, onBack, priceChangeHistory = [], initialTimeWindow, focus, thresholds, pricingRules,
    skuFamilies, products, adGroups, priceHistoryMap
}) => {
    const { product, allTimeSales, allTimeQty, transactions = [], refunds = [] } = data;

    // Analytics State
    const [txFilterPlatform, setTxFilterPlatform] = useState('All');
    const [txFilterType, setTxFilterType] = useState('All');
    const [txLimit, setTxLimit] = useState(50);
    const [txDays, setTxDays] = useState(() => {
        if (initialTimeWindow === 'yesterday') return 1;
        if (initialTimeWindow === '7d') return 7;
        if (initialTimeWindow === '30d') return 30;
        return 7; // Default
    });
    const [hoveredBubble, setHoveredBubble] = useState<any>(null);
    const [chartPeriod, setChartPeriod] = useState<string>('30 Days');
    const [chartLayout, setChartLayout] = useState<'horizontal' | 'vertical'>('horizontal');
    const [tooltip, setTooltip] = useState<{ visible: boolean, content: any, x: number, y: number, source?: string } | null>(null);
    const [isAuditPanelVisible, setIsAuditPanelVisible] = useState(false);

    // AI Toggle
    const [showAiInsights, setShowAiInsights] = useState(false);

    // Keyword Cloud State (Task C)
    const [kwMode, setKwMode] = useState<'All' | 'Reason'>('All');
    const [kwReason, setKwReason] = useState<string | null>(null);

    // Refund Table Sorting & Pagination
    const [refundSort, setRefundSort] = useState<SortState<string>>({ key: 'date', dir: 'desc' });
    const [refundPage, setRefundPage] = useState(1);
    const refundItemsPerPage = 10;

    // Return Date Basis Toggle
    const [returnDateBasis, setReturnDateBasis] = useState<ReturnDateBasis>('refundDate');

    const activeSignalRef = useRef<HTMLDivElement>(null);
    const refundsRef = useRef<HTMLDivElement>(null);

    // Refs for quick access scrolling
    const overviewRef = useRef<HTMLDivElement>(null);
    const signalsRef = useRef<HTMLDivElement>(null);
    const analysisRef = useRef<HTMLDivElement>(null);
    const pricingRef = useRef<HTMLDivElement>(null);
    const ledgerRef = useRef<HTMLDivElement>(null);

    const scrollToSection = (section: 'analysis' | 'pricing' | 'ledger' | 'refunds') => {
        const refMap = {
            analysis: analysisRef,
            pricing: pricingRef,
            ledger: ledgerRef,
            refunds: refundsRef
        };
        const targetRef = refMap[section];
        if (targetRef && targetRef.current) {
            targetRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Calculate Date Window Keys
    const { startKey, endKey, expectedDays } = useMemo(() => buildWindow({
        mode: 'days',
        days: txDays,
        excludeToday: true
    }), [txDays]);

    // For Price History, we extend to Today to show recent actions
    const todayKey = getTodayKeyMelbourne();
    const historyEndKey = todayKey > endKey ? todayKey : endKey;

    useEffect(() => {
        if (focus && activeSignalRef.current) {
            setTimeout(() => {
                activeSignalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }

        // Deep linking for refunds
        const section = getActiveSectionFromUrl();
        if (section === 'refunds' && refundsRef.current) {
            setTimeout(() => {
                refundsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 300);
        }
    }, [focus]);

    // Derive Order Date Map for Order Date Basis logic
    const orderDateMap = useMemo(() => {
        const map = new Map<string, string>();
        (transactions || []).forEach(t => {
            if (t.orderId) {
                const dKey = asDateKey(t.date);
                if (dKey) map.set(t.orderId, dKey);
            }
        });
        return map;
    }, [transactions]);

    // Family Logic
    const myFamily = useMemo(() => skuFamilies.find((f: any) => f.memberSkus.includes(product.sku)), [skuFamilies, product.sku]);
    const isInFamily = !!myFamily;
    const siblings = useMemo(() =>
        myFamily
            ? products.filter(p => myFamily.memberSkus.includes(p.sku) && p.sku !== product.sku)
            : []
        , [myFamily, products, product.sku]);

    const sortedTransactions = useMemo(() => {
        const safeTx = Array.isArray(transactions) ? transactions : [];
        const safeRefunds = Array.isArray(refunds) ? refunds : [];

        const sales = safeTx.map(t => ({ ...t, _type: 'SALE' }));
        const refundLogs = safeRefunds.map(r => ({
            id: r.id,
            sku: r.sku,
            date: r.date,
            velocity: r.quantity > 0 ? -r.quantity : 0,
            price: r.amount > 0 ? (r.quantity > 0 ? r.amount / r.quantity : r.amount) : 0,
            platform: r.platform,
            margin: 0,
            // Consistency Fix: profit must be scaled by VAT since transactions.profit from searchExecution is scaled.
            profit: -((Number(r.amount || 0) + Number(r.freightAmount || 0))),
            _type: 'REFUND_LOG',
            reason: r.reason
        } as unknown as PriceLog));

        return [...sales, ...refundLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, refunds]);

    const filteredTransactions = useMemo(() => {
        let list = sortedTransactions;

        // Date Filter
        list = list.filter(t => {
            const dKey = asDateKey(t.date);
            return dKey && isDateKeyBetween(dKey, startKey, endKey);
        });

        if (txFilterPlatform !== 'All') {
            list = list.filter(t => t.platform === txFilterPlatform);
        }
        if (txFilterType !== 'All') {
            list = list.filter(t => {
                if (txFilterType === 'Sale') return t.velocity > 0;
                if (txFilterType === 'Ad Cost') return t.price === 0 && (t.adsSpend || 0) > 0;
                if (txFilterType === 'Refund') return t.velocity < 0;
                return true;
            });
        }
        return list;
    }, [sortedTransactions, txFilterPlatform, txFilterType, startKey, endKey]);

    const activeAdGroupInFamily = useMemo(() => adGroups.find((g: any) =>
        g.isActive && g.memberSkus.includes(product.sku)
    ), [adGroups, product.sku]);


    const adRedistributionSummary = useMemo(() => {
        if (!activeAdGroupInFamily || !isInFamily) return null;

        const redistributedLogs = filteredTransactions.filter(l =>
            l.rawAdsSpend !== undefined && l.rawAdsSpend !== null
        );

        const rawSpend = redistributedLogs.reduce((sum, l) => sum + (l.rawAdsSpend || 0), 0);
        const adjustedSpend = redistributedLogs.reduce((sum, l) => sum + (l.adsSpend || 0), 0);

        const active = redistributedLogs.length > 0 && Math.abs(rawSpend - adjustedSpend) > 0.01;

        if (!active) return null;

        return {
            active: true,
            groupName: activeAdGroupInFamily.name,
            rawSpend: rawSpend * VAT_MULTIPLIER,
            adjustedSpend: adjustedSpend * VAT_MULTIPLIER
        };
    }, [activeAdGroupInFamily, isInFamily, filteredTransactions]);

    // Available Reason Codes for Filtering (Task C)
    const availableReasonCodes = useMemo(() => {
        const codes = new Set<string>();
        refunds.forEach(r => {
            const { short } = parseReturnsReason(r.platformReason || r.reason);
            if (short && short !== 'UNK') codes.add(short);
        });
        return Array.from(codes).sort();
    }, [refunds]);

    const periodSalesQty = useMemo(() => {
        return filteredTransactions
            .filter(t => t.velocity > 0)
            .reduce((acc, t) => acc + t.velocity, 0);
    }, [filteredTransactions]);

    const allTimeMarginStats = useMemo(() => {
        if (!transactions || transactions.length === 0) return { pct: 0, rawProfit: 0, refundVal: 0, netSales: 0, netProfit: 0, grossSales: 0 };

        let rawProfit = 0;
        transactions.forEach(t => {
            // calcProfit uses t.profit if present. 
            // Since we reverted scaling in searchExecution for DEEP_DIVE, t.profit is Ex-VAT raw.
            rawProfit += calcProfit(t);
        });

        // Scale rawProfit to Inc-VAT once for comparison
        const rawProfitIncVat = rawProfit * VAT_MULTIPLIER;

        // refunds[i].amount and freightAmount are raw Ex-VAT (reverted in searchExecution). 
        // Scale exactly once here.
        const refundVal = refunds ? refunds.reduce((sum, r) => sum + ((Number(r.amount || 0) + Number(r.freightAmount || 0)) * VAT_MULTIPLIER), 0) : 0;
        const netProfit = rawProfitIncVat - refundVal;

        const netSales = allTimeSales; // already scaled in searchExecution summary

        const pct = marginPct(netProfit, netSales) || 0;

        return { pct, rawProfit: rawProfitIncVat, refundVal, netSales, netProfit, grossSales: allTimeSales };
    }, [transactions, refunds, allTimeSales]);

    // NEW: Calculate All-Time Return & Refund Rate
    const allTimeReturnStats = useMemo(() => {
        if (allTimeQty === 0) return { returnRate: 0, refundRate: 0, totalRefundQty: 0, totalRefundVal: 0 };

        // --- FORMULA REFINEMENT ---
        // 1. Return Rate (Qty): Includes Refunds AND Resends (Total Returns)
        const totalRefundQty = refunds.reduce((sum, r) => sum + r.quantity, 0);

        // 2. Refund Rate (Val): Includes Refunds AND Resends
        // Scaling exactly once.
        const totalRefundVal = refunds.reduce((sum, r) => {
            return sum + ((Number(r.amount || 0) + Number(r.freightAmount || 0)) * VAT_MULTIPLIER);
        }, 0);

        return {
            returnRate: (totalRefundQty / allTimeQty) * 100,
            refundRate: allTimeSales > 0 ? (totalRefundVal / allTimeSales) * 100 : 0,
            totalRefundQty,
            totalRefundVal
        };
    }, [refunds, allTimeQty, allTimeSales]);

    // Refund Detail Table Data - MODIFIED: Removed date filtering to align with timeline chart
    const filteredRefundsForTable = useMemo(() => {
        const getValue = (row: RefundLog, key: string) => {
            if (key === 'date') {
                const d = getReturnDateKey(row, returnDateBasis, orderDateMap);
                return d ? new Date(d).getTime() : 0;
            }
            if (key === 'reason') return parseReturnsReason(row.platformReason || row.reason).short;
            return (row as any)[key];
        };

        return sortRows(refunds || [], refundSort, getValue);
    }, [refunds, refundSort, returnDateBasis, orderDateMap]);

    const paginatedRefunds = useMemo(() => {
        return filteredRefundsForTable.slice((refundPage - 1) * refundItemsPerPage, refundPage * refundItemsPerPage);
    }, [filteredRefundsForTable, refundPage]);

    const totalRefundPages = Math.ceil(filteredRefundsForTable.length / refundItemsPerPage);

    // Refunds Analysis (Task A + Task C + Garbage Filtering)
    const refundAnalysis = useMemo(() => {
        if (!refunds || refunds.length === 0) return null;

        // Use central aggregation service for consistent logic (which now includes freight scaling)
        const overview = buildRefundOverview(refunds);

        // Separate totals for display
        const totalFreight = refunds.reduce((sum, r) => sum + (Number(r.freightAmount || 0)), 0);
        const resendCount = refunds.filter(r => r.orderType === 'resend').length;
        const refundCount = refunds.filter(r => r.orderType === 'refund' || !r.orderType).length;

        // Filter refunds based on selection (Task C)
        const filteredRefundsForKeywords = kwMode === 'Reason' && kwReason
            ? refunds.filter(r => parseReturnsReason(r.platformReason || r.reason).short === kwReason)
            : refunds;

        const topKeywords = aggregateRefundKeywords(filteredRefundsForKeywords, 60);

        // Local Sentiment Tracking (Simplified for now, relying on aggregateRefundKeywords or custom logic if needed)
        // Re-implementing sentiment stats locally as it was inside the hook previously
        const sentimentStats = { negative: 0, neutral: 0, positive: 0 };
        const negatives = ['broken', 'damage', 'defect', 'poor', 'bad', 'terrible', 'worst', 'awful', 'useless', 'dirty', 'rubbish', 'faulty', 'fake', 'counterfeit'];
        const positives = ['great', 'good', 'love', 'excellent', 'perfect', 'nice'];

        filteredRefundsForKeywords.forEach(r => {
            const rawText = `${r.reason || ''} ${r.customerReason || ''} ${r.remarks || ''} ${r.comments || ''}`.toLowerCase();
            let score = 0;
            negatives.forEach(w => { if (rawText.includes(w)) score--; });
            positives.forEach(w => { if (rawText.includes(w)) score++; });

            if (score < 0) sentimentStats.negative++;
            else if (score > 0) sentimentStats.positive++;
            else sentimentStats.neutral++;
        });

        return {
            overview,
            topWords: topKeywords.map(w => ({ text: w.text, value: w.count })),
            sentimentStats,
            totalFreight,
            resendCount,
            refundCount
        };
    }, [refunds, kwMode, kwReason]);

    const diagnostics = useMemo(() => {
        // ... (Diagnostics logic unchanged, reusing existing code)
        // Copying existing logic for signals
        const signals = [];
        if (product.stockLevel > 0) {
            if (product.daysRemaining < (product.leadTimeDays * thresholds.stockoutRunwayMultiplier)) {
                signals.push({ id: 'STOCKOUT_RISK', label: 'Stockout Risk', severity: 'High', color: 'text-red-700 bg-red-50 border-red-200', icon: AlertTriangle, desc: `Stock covers ${product.daysRemaining.toFixed(0)} days, which is less than the lead time buffer (${(product.leadTimeDays * thresholds.stockoutRunwayMultiplier).toFixed(0)} days).` });
            } else if (product.daysRemaining > thresholds.overstockDays) {
                signals.push({ id: 'OVERSTOCK_RISK', label: 'Overstock', severity: 'Medium', color: 'text-orange-700 bg-orange-50 border-orange-200', icon: Package, desc: `Stock covers ${product.daysRemaining.toFixed(0)} days, exceeding the ${thresholds.overstockDays}-day efficiency target.` });
            }
        }
        if (product.returnRate && product.returnRate > thresholds.returnRatePct) {
            signals.push({ id: 'HIGH_RETURN_RATE', label: 'Elevated Returns', severity: 'High', color: 'text-red-700 bg-red-50 border-red-200', icon: RotateCcw, desc: `Return rate is ${product.returnRate.toFixed(1)}%, which is above the ${thresholds.returnRatePct}% alert threshold.` });
        }
        const adPct = product.costDetail?.adsFeePct ?? (product.currentPrice > 0 ? ((product.adsFee || 0) / product.currentPrice * 100) : 0);
        if (adPct > thresholds.highAdDependencyPct) {
            signals.push({ id: 'HIGH_AD_DEPENDENCY', label: 'High Ad Dependency', severity: 'Medium', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: Megaphone, desc: `Advertising costs consume ${adPct.toFixed(1)}% of the selling price (Target: < ${thresholds.highAdDependencyPct}%).` });
        }
        const margin = product.costDetail?.profitInclRnPct;
        if (margin !== undefined && margin < thresholds.marginBelowTargetPct) {
            signals.push({ id: 'BELOW_TARGET', label: 'Margin Compression', severity: 'High', color: 'text-red-700 bg-red-50 border-red-200', icon: DollarSign, desc: `Net margin is ${margin.toFixed(1)}%, below the ${thresholds.marginBelowTargetPct}% target.` });
        }
        const trend = product._trendData?.velocityChange;
        if (trend !== undefined) {
            if (trend < -thresholds.velocityDropPct) {
                signals.push({ id: 'VELOCITY_DROP_WOW', label: 'Velocity Drop', severity: 'High', color: 'text-red-700 bg-red-50 border-red-200', icon: TrendingDown, desc: `Sales velocity has declined by ${Math.abs(trend).toFixed(0)}% compared to the prior period.` });
            } else if (trend > 20) {
                signals.push({ id: 'POSITIVE_MOMENTUM', label: 'Momentum Spike', severity: 'Low', color: 'text-green-700 bg-green-50 border-green-200', icon: TrendingUp, desc: `Sales velocity has increased by ${trend.toFixed(0)}% compared to the prior period.` });
            }
        }
        const stockValue = product.stockLevel * (product.costPrice || 0);
        const globalVelocity = product.dailyAverageSales || product.averageDailySales || 0;
        if (stockValue > thresholds.deadStockMinValueGBP && globalVelocity === 0) {
            signals.push({ id: 'DORMANT_NO_SALES', label: 'Dead Stock', severity: 'High', color: 'text-gray-700 bg-gray-50 border-gray-200', icon: Package, desc: `High value dormant stock (£${stockValue.toFixed(0)}) with 0 velocity detected.` });
        }
        return signals;
    }, [product, periodSalesQty, thresholds]);

    const platforms = useMemo(() => Array.from(new Set(sortedTransactions.map(t => t.platform || 'Unknown'))).sort(), [sortedTransactions]);

    const getStats = (days: number, valueFn: (t: PriceLog) => number | null) => {
        const { startKey, endKey } = buildWindow({ mode: 'days', days, excludeToday: true });
        const filtered = sortedTransactions
            .filter(t => {
                const dKey = asDateKey(t.date);
                if (!dKey || !isDateKeyBetween(dKey, startKey, endKey)) return false;
                return t.velocity > 0;
            })
            .map(valueFn)
            .filter((v): v is number => v !== null);
        return calculateQuantiles(filtered);
    };

    const analytics = useMemo(() => {
        const getDailyQtyStats = (days: number) => {
            const { startKey, endKey } = buildWindow({ mode: 'days', days, excludeToday: true });
            const dailyMap: Record<string, number> = {};
            sortedTransactions.forEach(t => {
                const dKey = asDateKey(t.date);
                if (dKey && isDateKeyBetween(dKey, startKey, endKey) && t.velocity > 0) {
                    dailyMap[dKey] = (dailyMap[dKey] || 0) + t.velocity;
                }
            });
            return calculateQuantiles(Object.values(dailyMap));
        };

        return {
            revenue: {
                d7: getStats(7, t => { const r = calcRevenue(t); return r > 0.01 ? r : null; }),
                d30: getStats(30, t => { const r = calcRevenue(t); return r > 0.01 ? r : null; }),
                d90: getStats(90, t => { const r = calcRevenue(t); if (r > 0.01) return r; return null; })
            },
            margin: {
                d7: getStats(7, t => { const rev = calcRevenue(t); if (rev > 0.01) { const profit = calcProfit(t); return marginPct(profit, rev); } return null; }),
                d30: getStats(30, t => { const rev = calcRevenue(t); if (rev > 0.01) { const profit = calcProfit(t); return marginPct(profit, rev); } return null; }),
                d90: getStats(90, t => { const rev = calcRevenue(t); if (rev > 0.01) { const profit = calcProfit(t); return marginPct(profit, rev); } return null; })
            },
            qty: {
                d7: getDailyQtyStats(7),
                d30: getDailyQtyStats(30),
                d90: getDailyQtyStats(90)
            },
            tacos: {
                d7: getStats(7, t => { const revenue = calcRevenue(t); if (revenue > 0) { const adSpend = calcAdSpend(t); const tacos = calcTACoSPct(adSpend, revenue); return Math.min(tacos, 300); } return null; }),
                d30: getStats(30, t => { const revenue = calcRevenue(t); if (revenue > 0) { const adSpend = calcAdSpend(t); const tacos = calcTACoSPct(adSpend, revenue); return Math.min(tacos, 300); } return null; }),
                d90: getStats(90, t => { const revenue = calcRevenue(t); if (revenue > 0) { const adSpend = calcAdSpend(t); const tacos = calcTACoSPct(adSpend, revenue); return Math.min(tacos, 300); } return null; })
            },
        };
    }, [sortedTransactions]);

    const tacosStats = useMemo(() => {
        const calculateForDays = (days: number) => {
            const { startKey, endKey } = buildWindow({ mode: 'days', days, excludeToday: true });
            const periodTx = sortedTransactions.filter(t => {
                const dKey = asDateKey(t.date);
                return dKey && isDateKeyBetween(dKey, startKey, endKey);
            });
            let totalAdSpend = 0; let totalRevenue = 0; let adOnlySpend = 0;
            periodTx.forEach(t => {
                const currentAdSpend = calcAdSpend(t);
                totalAdSpend += currentAdSpend;
                const isSale = (t as any)._type !== 'REFUND_LOG' && t.price > 0 && t.velocity > 0;
                if (isSale) {
                    totalRevenue += calcRevenue(t);
                } else if (currentAdSpend > 0 && t.price === 0) {
                    adOnlySpend += currentAdSpend;
                }
            });
            const tacosPct = calcTACoSPct(totalAdSpend, totalRevenue);
            return { totalAdSpend: totalAdSpend * VAT_MULTIPLIER, totalRevenue: totalRevenue * VAT_MULTIPLIER, tacosPct, adOnlySpend: adOnlySpend * VAT_MULTIPLIER };
        };
        return {
            d7: calculateForDays(7),
            d30: calculateForDays(30),
            d90: calculateForDays(90)
        };
    }, [sortedTransactions]);

    const priceVolumeAnalysis = useMemo(() => {
        const validTx = sortedTransactions.filter(t => t.velocity > 0 && t.price > 0);
        const refPrice = product.caPrice || (product.currentPrice * VAT_MULTIPLIER) || 1;
        const thresholdAmber = -(refPrice * 0.05);
        const thresholdRed = -(refPrice * 0.15);

        // --- 1. Global Price Point Aggregation (All Time) ---
        const aggregatedPoints: Record<number, { qty: number, costBasedCount: number }> = {};

        validTx.forEach(t => {
            const scaledPrice = t.price * VAT_MULTIPLIER;
            const p = Number(scaledPrice.toFixed(2));

            const rule = pricingRules ? pricingRules[t.platform || ''] : undefined;
            const isCostBased = rule?.pricingControl === 'PLATFORM_COST_BASED';

            if (!aggregatedPoints[p]) aggregatedPoints[p] = { qty: 0, costBasedCount: 0 };
            aggregatedPoints[p].qty += t.velocity;

            if (isCostBased) {
                aggregatedPoints[p].costBasedCount += t.velocity;
            }
        });

        // --- 2. Chart Buckets ---
        const buckets = [
            { label: '7 Days', days: 7 },
            { label: '14 Days', days: 14 },
            { label: '30 Days', days: 30 },
            { label: '90 Days', days: 90 },
            { label: 'All', days: 36500 }
        ];

        const chartData: any[] = [];
        const periodStats: any[] = [];
        const safeChanges = Array.isArray(priceChangeHistory) ? priceChangeHistory : [];

        const getEffectiveCA = (dateStr: string) => {
            const txDate = new Date(dateStr).getTime();
            const changes = safeChanges
                .filter(c => c.sku === product.sku)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            const match = changes.find(c => new Date(c.date).getTime() <= txDate);
            if (match) return match.newPrice;
            if (changes.length > 0) return changes[changes.length - 1].oldPrice;
            return refPrice;
        };

        buckets.forEach(bucket => {
            const { startKey, endKey } = buildWindow({ mode: 'days', days: bucket.days, excludeToday: true });
            const bucketTx = validTx.filter(t => {
                const dKey = asDateKey(t.date);
                return dKey && isDateKeyBetween(dKey, startKey, endKey);
            });
            const BAND_SIZE = 0.5;
            const groups: Record<string, { totalQty: number, totalRev: number, sumDelta: number, sumPrice: number }> = {};
            let totalPeriodQty = 0;
            let totalPeriodDelta = 0;

            bucketTx.forEach(t => {
                const effectiveRef = getEffectiveCA(t.date);
                const scaledPrice = t.price * VAT_MULTIPLIER;
                const rawDelta = scaledPrice - effectiveRef;
                const band = (Math.round(rawDelta / BAND_SIZE) * BAND_SIZE).toFixed(2);

                const rule = pricingRules ? pricingRules[t.platform || ''] : undefined;
                const isCostBased = rule?.pricingControl === 'PLATFORM_COST_BASED';

                // Exclude cost-based platforms from Chart Data: ERP sales recorded at agreed cost price; not comparable for sell-price deviation.
                if (!isCostBased) {
                    if (!groups[band]) groups[band] = { totalQty: 0, totalRev: 0, sumDelta: 0, sumPrice: 0 };
                    groups[band].totalQty += t.velocity;
                    groups[band].totalRev += (scaledPrice * t.velocity);
                    groups[band].sumDelta += (rawDelta * t.velocity);
                    groups[band].sumPrice += (scaledPrice * t.velocity);
                    totalPeriodQty += t.velocity;
                    totalPeriodDelta += (rawDelta * t.velocity);
                }
            });

            Object.entries(groups).forEach(([b, stats]) => {
                chartData.push({
                    period: bucket.label,
                    delta: parseFloat(b),
                    totalQty: stats.totalQty,
                    actualAvgDelta: stats.sumDelta / stats.totalQty,
                    tooltipPrice: stats.totalQty > 0 ? (stats.sumPrice / stats.totalQty).toFixed(2) : 0
                });
            });

            if (totalPeriodQty > 0) {
                periodStats.push({
                    period: bucket.label,
                    avgDelta: totalPeriodDelta / totalPeriodQty,
                    totalQty: 1
                });
            }
        });

        const pointsTable = Object.entries(aggregatedPoints)
            .map(([price, data]) => ({
                price: parseFloat(price),
                qty: data.qty,
                isCostBased: data.costBasedCount > 0
            }))
            .sort((a, b) => b.qty - a.qty);

        return { chartData, pointsTable, periodStats, thresholds: { amber: thresholdAmber, red: thresholdRed } };
    }, [sortedTransactions, priceChangeHistory, product, pricingRules]);

    const minPricePoint = useMemo(() => {
        if (priceVolumeAnalysis.pointsTable.length === 0) return null;
        return Math.min(...priceVolumeAnalysis.pointsTable.map(p => p.price));
    }, [priceVolumeAnalysis.pointsTable]);

    const maxPricePoint = useMemo(() => {
        if (priceVolumeAnalysis.pointsTable.length === 0) return null;
        return Math.max(...priceVolumeAnalysis.pointsTable.map(p => p.price));
    }, [priceVolumeAnalysis.pointsTable]);

    const filteredChartData = useMemo(() => {
        if (chartPeriod === 'All') return priceVolumeAnalysis.chartData;
        return priceVolumeAnalysis.chartData.filter(d => d.period === chartPeriod);
    }, [priceVolumeAnalysis, chartPeriod]);

    const filteredAvgStats = useMemo(() => {
        if (chartPeriod === 'All') return priceVolumeAnalysis.periodStats;
        return priceVolumeAnalysis.periodStats.filter(d => d.period === chartPeriod);
    }, [priceVolumeAnalysis, chartPeriod]);

    const platformSubtotals = useMemo(() => {
        const subtotals: Record<string, {
            platform: string;
            soldQty: number;
            adSpend: number;
            revenue: number;
            profit: number;
        }> = {};
        let totalRevenueAllPlatforms = 0;
        filteredTransactions.forEach(tx => {
            const platform = tx.platform || 'Unknown';
            if (!subtotals[platform]) {
                subtotals[platform] = {
                    platform,
                    soldQty: 0,
                    adSpend: 0,
                    revenue: 0,
                    profit: 0
                };
            }
            const group = subtotals[platform];
            const isRefund = (tx as any)._type === 'REFUND_LOG' || tx.velocity < 0;
            const isAdRow = tx.price === 0 && calcAdSpend(tx) > 0 && !isRefund;
            if (!isRefund && !isAdRow) {
                const txRevenue = calcRevenue(tx) * VAT_MULTIPLIER;
                group.soldQty += calcUnits(tx);
                group.revenue += txRevenue;
                totalRevenueAllPlatforms += txRevenue;
            }
            group.adSpend += calcAdSpend(tx) * VAT_MULTIPLIER;
            group.profit += calcProfit(tx) * VAT_MULTIPLIER;
        });
        return Object.values(subtotals).map(group => ({
            ...group,
            margin: marginPct(group.profit, group.revenue),
            revenueSharePct: totalRevenueAllPlatforms > 0 ? (group.revenue / totalRevenueAllPlatforms) * 100 : 0,
        })).sort((a, b) => b.revenue - a.revenue);
    }, [filteredTransactions]);

    const paginatedTransactions = useMemo(() => {
        return filteredTransactions.slice(0, txLimit);
    }, [filteredTransactions, txLimit]);

    const ledgerStats = useMemo(() => {
        let salesRows = 0;
        let totalUnits = 0;
        let adOnlySpend = 0;
        let refundCount = 0;
        let refundValue = 0;
        filteredTransactions.forEach(t => {
            if (t.velocity > 0) {
                salesRows++;
                totalUnits += t.velocity;
            } else if (t.price === 0 && (t.adsSpend || 0) > 0) {
                adOnlySpend += ((t.adsSpend || 0) * VAT_MULTIPLIER);
            } else if (t.velocity < 0 || t.price < 0) {
                refundCount++;
                refundValue += Math.abs(calcProfit(t) * VAT_MULTIPLIER);
            }
        });
        return { salesRows, totalUnits, adOnlySpend, refundCount, refundValue };
    }, [filteredTransactions]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300 pb-20">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    {onBack && (
                        <button onClick={onBack} className="text-gray-500 hover:text-gray-700 transition-colors p-2 rounded-full hover:bg-gray-100">
                            <ArrowLeft className="w-5 h-5" />
                        </button>
                    )}
                    <div>
                        <h2 className="text-xl font-bold text-gray-900">SKU Deep Dive</h2>
                        {initialTimeWindow && (
                            <div className="text-[10px] text-indigo-600 font-medium flex items-center gap-1 mt-0.5 bg-indigo-50 px-2 py-0.5 rounded w-fit border border-indigo-100">
                                <Info className="w-3 h-3" />
                                Dashboard window: Last {txDays} days
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div ref={overviewRef}>
                <SkuOverviewSection
                    product={product}
                    allTimeSales={allTimeSales}
                    allTimeQty={allTimeQty}
                    allTimeMarginStats={allTimeMarginStats}
                    allTimeReturnStats={allTimeReturnStats}
                    thresholds={thresholds}
                    hasTransactions={sortedTransactions.length > 0}
                    onScrollToSection={scrollToSection}
                />
            </div>

            {diagnostics.length > 0 && (
                <div ref={signalsRef}>
                    <DiagnosticSignalsSection
                        diagnostics={diagnostics}
                        focus={focus}
                        activeSignalRef={activeSignalRef}
                    />
                </div>
            )}

            {sortedTransactions.length > 0 && (
                <div ref={analysisRef}>
                    <DistributionAnalysisSection
                        analytics={analytics}
                        tacosStats={tacosStats}
                        chartLayout={chartLayout}
                        setChartLayout={setChartLayout}
                        tooltip={tooltip}
                        setTooltip={setTooltip}
                        thresholds={thresholds}
                        themeColor={themeColor}
                    />
                </div>
            )}

            {sortedTransactions.length > 0 && (
                <div ref={pricingRef}>
                    <PricingHistorySection
                        priceVolumeAnalysis={priceVolumeAnalysis}
                        minPricePoint={minPricePoint}
                        maxPricePoint={maxPricePoint}
                        filteredChartData={filteredChartData}
                        filteredAvgStats={filteredAvgStats}
                        chartPeriod={chartPeriod}
                        setChartPeriod={setChartPeriod}
                        hoveredBubble={hoveredBubble}
                        setHoveredBubble={setHoveredBubble}
                        priceChangeHistory={priceChangeHistory}
                        productSku={product.sku}
                        startKey={startKey}
                        endKey={endKey}
                        themeColor={themeColor}
                        // Use optimal price (Profit) as priority, fallback to maxVelocity (Velocity) if not set.
                        // Ensure VAT scaling is applied as it is raw in source.
                        optimalPrice={(product.optimalPrice || product.maxVelocityPrice || 0) * VAT_MULTIPLIER}
                        currentPrice={product.currentPrice * VAT_MULTIPLIER}
                        siblings={siblings}
                        isInFamily={isInFamily}
                        priceHistoryMap={priceHistoryMap}
                    />
                </div>
            )}

            {sortedTransactions.length > 0 && (
                <div ref={ledgerRef}>
                    <TransactionLedgerSection
                        ledgerStats={ledgerStats}
                        platformSubtotals={platformSubtotals}
                        paginatedTransactions={paginatedTransactions}
                        filteredTransactionsLength={filteredTransactions.length}
                        txLimit={txLimit}
                        setTxLimit={setTxLimit}
                        isAuditPanelVisible={isAuditPanelVisible}
                        setIsAuditPanelVisible={setIsAuditPanelVisible}
                        txDays={txDays}
                        setTxDays={setTxDays}
                        txFilterPlatform={txFilterPlatform}
                        setTxFilterPlatform={setTxFilterPlatform}
                        txFilterType={txFilterType}
                        setTxFilterType={setTxFilterType}
                        platforms={platforms}
                        startKey={startKey}
                        endKey={endKey}
                        filteredTransactions={filteredTransactions}
                        thresholds={thresholds}
                        calcRevenue={calcRevenue}
                        calcUnits={calcUnits}
                        calcProfit={calcProfit}
                        calcAdSpend={calcAdSpend}
                        marginPct={marginPct}
                        product={product}
                        adRedistributionSummary={adRedistributionSummary}
                    />
                </div>
            )}

            <div ref={refundsRef}>
                <ReturnsAnalysisSection
                    refundAnalysis={refundAnalysis}
                    refunds={refunds}
                    returnDateBasis={returnDateBasis}
                    setReturnDateBasis={setReturnDateBasis}
                    showAiInsights={showAiInsights}
                    setShowAiInsights={setShowAiInsights}
                    kwMode={kwMode}
                    setKwMode={setKwMode}
                    kwReason={kwReason}
                    setKwReason={setKwReason}
                    availableReasonCodes={availableReasonCodes}
                    refundSort={refundSort}
                    setRefundSort={setRefundSort}
                    paginatedRefunds={paginatedRefunds}
                    filteredRefundsLength={filteredRefundsForTable.length}
                    refundPage={refundPage}
                    setRefundPage={setRefundPage}
                    totalRefundPages={totalRefundPages}
                    refundItemsPerPage={refundItemsPerPage}
                    themeColor={themeColor}
                    orderDateMap={orderDateMap}
                    thresholds={thresholds}
                />
            </div>
        </div>
    );
};

export default SkuDeepDivePage;
