
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Package, Tag, Layers, DollarSign, Box, ArrowLeft, Warehouse, Ship, AlertTriangle, RotateCcw, Megaphone, TrendingDown, TrendingUp, Activity, BarChart2, Calendar, Filter, Search, Info, HelpCircle, CheckCircle, XCircle } from 'lucide-react';
import { Product, PriceLog, PriceChangeRecord, RefundLog } from '../types';
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip, ScatterChart, Scatter, ZAxis, ReferenceLine, ReferenceArea } from 'recharts';
import { ThresholdConfig } from '../services/thresholdsConfig';

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
    onViewShipments?: (sku: string) => void;
    priceChangeHistory?: PriceChangeRecord[];
    initialTimeWindow?: 'yesterday' | '7d' | '30d' | 'custom';
    focus?: string;
    thresholds: ThresholdConfig; // REQUIRED: Passed from App state
}

const calculateQuantiles = (data: number[]) => {
    if (data.length === 0) return null;
    const sorted = [...data].sort((a, b) => a - b);
    const n = sorted.length;
    const q1Pos = (n - 1) * 0.25;
    const q2Pos = (n - 1) * 0.5;
    const q3Pos = (n - 1) * 0.75;
    
    const getVal = (pos: number) => {
        const base = Math.floor(pos);
        const rest = pos - base;
        if (sorted[base + 1] !== undefined) {
            return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        }
        return sorted[base];
    };

    return {
        min: sorted[0],
        q1: getVal(q1Pos),
        median: getVal(q2Pos),
        q3: getVal(q3Pos),
        max: sorted[n - 1],
        n
    };
};

const BoxPlot = ({ title, data7, data30, data90, format, color = '#6366f1', footerContent }: any) => {
    const renderBar = (stats: any, label: string, baselineMedian?: number) => {
        if (!stats) return <div className="h-8 flex items-center text-xs text-gray-400 pl-2">No data</div>;
        
        const range = stats.max - stats.min;
        const width = (val: number) => range === 0 ? 0 : ((val - stats.min) / range) * 100;
        
        // Calculate delta vs 90d baseline
        let deltaInfo = null;
        if (baselineMedian !== undefined && stats.median !== undefined && baselineMedian !== 0) {
            const diff = ((stats.median - baselineMedian) / baselineMedian) * 100;
            const isPositive = diff > 0;
            const isZero = diff === 0;
            
            if (!isZero) {
                deltaInfo = (
                    <span className={`ml-2 text-[9px] font-medium px-1.5 py-0.5 rounded flex items-center gap-0.5 ${isPositive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {isPositive ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                        {Math.abs(diff).toFixed(1)}% vs 90d
                    </span>
                );
            }
        }

        return (
            <div className="mb-3">
                <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center">
                        <span className="text-[10px] font-bold text-gray-500">{label} (n={stats.n})</span>
                        {deltaInfo}
                    </div>
                    {stats.n < 10 && <span className="text-[9px] text-amber-600 flex items-center gap-1 bg-amber-50 px-1 rounded"><AlertTriangle className="w-2.5 h-2.5"/> Low Data</span>}
                </div>
                <div className="relative h-6 bg-gray-50 rounded border border-gray-100">
                    {/* Range Line */}
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-300"></div>
                    
                    {/* Box */}
                    <div 
                        className="absolute top-1 bottom-1 bg-opacity-20 border"
                        style={{ 
                            left: `${width(stats.q1)}%`, 
                            width: `${width(stats.q3) - width(stats.q1)}%`,
                            backgroundColor: color,
                            borderColor: color
                        }} 
                    />
                    
                    {/* Median */}
                    <div 
                        className="absolute top-0 bottom-0 w-0.5 bg-gray-800"
                        style={{ left: `${width(stats.median)}%` }} 
                    />

                    {/* Whiskers */}
                    <div className="absolute top-1 bottom-1 w-px bg-gray-400" style={{ left: '0%' }} />
                    <div className="absolute top-1 bottom-1 w-px bg-gray-400" style={{ right: '0%' }} />
                </div>
                <div className="flex justify-between text-[9px] text-gray-400 mt-0.5 font-mono">
                    <span>{format(stats.min)}</span>
                    <span className="text-gray-700 font-bold bg-white px-1 rounded shadow-sm border border-gray-100">{format(stats.median)}</span>
                    <span>{format(stats.max)}</span>
                </div>
            </div>
        );
    };

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between">
            <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                    <Activity className="w-3 h-3" /> {title}
                </h4>
                {renderBar(data7, '7 Days', data90?.median)}
                {renderBar(data30, '30 Days', data90?.median)}
                {renderBar(data90, '90 Days')}
            </div>
            {footerContent}
        </div>
    );
};

const SkuDeepDivePage: React.FC<SkuDeepDivePageProps> = ({ data, themeColor, onBack, onViewShipments, priceChangeHistory = [], initialTimeWindow, focus, thresholds }) => {
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
    const [chartPeriod, setChartPeriod] = useState<string>('30 Days'); // New: Chart filter state
    
    // Focus Ref for scrolling
    const activeSignalRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (focus && activeSignalRef.current) {
            // Short delay to ensure rendering is complete
            setTimeout(() => {
                activeSignalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }, [focus]);

    // Merge transactions and refunds for unified view
    const sortedTransactions = useMemo(() => {
        const sales = transactions.map(t => ({ ...t, _type: 'SALE' }));
        const refundLogs = refunds.map(r => ({
            id: r.id,
            sku: r.sku,
            date: r.date,
            // Negative velocity for refunds
            velocity: r.quantity > 0 ? -r.quantity : 0, 
            price: r.amount > 0 ? (r.quantity > 0 ? r.amount/r.quantity : r.amount) : 0,
            platform: r.platform,
            margin: 0,
            profit: -r.amount,
            adsSpend: 0,
            _type: 'REFUND_LOG',
            reason: r.reason
        } as unknown as PriceLog)); // Casting to compatible shape

        return [...sales, ...refundLogs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [transactions, refunds]);

    // Calculate actual sales within the selected period for diagnostics
    const periodSalesQty = useMemo(() => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - txDays);
        cutoff.setHours(0, 0, 0, 0);
        return sortedTransactions
            .filter(t => new Date(t.date) >= cutoff && t.velocity > 0)
            .reduce((acc, t) => acc + t.velocity, 0);
    }, [sortedTransactions, txDays]);

    // Calculate All-Time Net Margin
    const allTimeMarginPct = useMemo(() => {
        if (!transactions || transactions.length === 0) return 0;
        
        let totalProfit = 0;
        // Sum profit from sales
        transactions.forEach(t => {
             const rev = t.price * t.velocity;
             if (t.profit !== undefined) totalProfit += t.profit;
             else if (t.margin !== undefined) totalProfit += rev * (t.margin / 100);
        });
        
        // Subtract refunds from profit
        if (refunds) {
            refunds.forEach(r => totalProfit -= r.amount);
        }

        // Net Sales = Gross Sales (allTimeSales passed in) - Refunds
        const totalRefundValue = refunds ? refunds.reduce((sum, r) => sum + r.amount, 0) : 0;
        const netSales = allTimeSales - totalRefundValue;

        return netSales > 0 ? (totalProfit / netSales) * 100 : 0;
    }, [transactions, refunds, allTimeSales]);

    const diagnostics = useMemo(() => {
        const signals = [];

        // 1. Stock Health
        if (product.stockLevel > 0) {
            if (product.daysRemaining < (product.leadTimeDays * thresholds.stockoutRunwayMultiplier)) {
                signals.push({ 
                    id: 'STOCKOUT_RISK',
                    label: 'Stockout Risk', 
                    severity: 'High',
                    color: 'text-red-700 bg-red-50 border-red-200', 
                    icon: AlertTriangle, 
                    desc: `Stock covers ${product.daysRemaining.toFixed(0)} days, which is less than the lead time buffer (${(product.leadTimeDays * thresholds.stockoutRunwayMultiplier).toFixed(0)} days).` 
                });
            } else if (product.daysRemaining > thresholds.overstockDays) {
                signals.push({ 
                    id: 'OVERSTOCK_RISK',
                    label: 'Overstock', 
                    severity: 'Medium', 
                    color: 'text-orange-700 bg-orange-50 border-orange-200', 
                    icon: Package, 
                    desc: `Stock covers ${product.daysRemaining.toFixed(0)} days, exceeding the ${thresholds.overstockDays}-day efficiency target.` 
                });
            }
        }

        // 2. Returns
        if (product.returnRate && product.returnRate > thresholds.returnRatePct) {
            signals.push({ 
                id: 'HIGH_RETURN_RATE',
                label: 'Elevated Returns', 
                severity: 'High',
                color: 'text-red-700 bg-red-50 border-red-200', 
                icon: RotateCcw, 
                desc: `Return rate is ${product.returnRate.toFixed(1)}%, which is above the ${thresholds.returnRatePct}% alert threshold.` 
            });
        }

        // 3. Ad Dependency
        const adPct = product.costDetail?.adsFeePct ?? (product.currentPrice > 0 ? ((product.adsFee || 0) / product.currentPrice * 100) : 0);
        if (adPct > thresholds.highAdDependencyPct) {
            signals.push({ 
                id: 'HIGH_AD_DEPENDENCY',
                label: 'High Ad Dependency', 
                severity: 'Medium', 
                color: 'text-amber-700 bg-amber-50 border-amber-200', 
                icon: Megaphone, 
                desc: `Advertising costs consume ${adPct.toFixed(1)}% of the selling price (Target: < ${thresholds.highAdDependencyPct}%).` 
            });
        }

        // 4. Margin Compression
        const margin = product.costDetail?.profitInclRnPct;
        if (margin !== undefined && margin < thresholds.marginBelowTargetPct) {
            signals.push({ 
                id: 'BELOW_TARGET',
                label: 'Margin Compression', 
                severity: 'High',
                color: 'text-red-700 bg-red-50 border-red-200', 
                icon: DollarSign, 
                desc: `Net profit margin is ${margin.toFixed(1)}%, falling below the ${thresholds.marginBelowTargetPct}% sustainability target.` 
            });
        }

        // 5. Velocity Trend
        const trend = product._trendData?.velocityChange;
        if (trend !== undefined) {
            if (trend < -thresholds.velocityDropPct) {
                signals.push({ 
                    id: 'VELOCITY_DROP_WOW',
                    label: 'Velocity Drop', 
                    severity: 'High',
                    color: 'text-red-700 bg-red-50 border-red-200', 
                    icon: TrendingDown, 
                    desc: `Sales velocity has declined by ${Math.abs(trend).toFixed(0)}% compared to the prior period.` 
                });
            } else if (trend > 20) {
                signals.push({ 
                    id: 'POSITIVE_MOMENTUM',
                    label: 'Momentum Spike', 
                    severity: 'Low',
                    color: 'text-green-700 bg-green-50 border-green-200', 
                    icon: TrendingUp, 
                    desc: `Sales velocity has increased by ${trend.toFixed(0)}% compared to the prior period.` 
                });
            }
        }

        // 6. Dead Stock (Matches Dashboard Logic)
        const stockValue = product.stockLevel * (product.costPrice || 0);
        // Uses local window periodSalesQty instead of global averageDailySales to respect date filter
        if (stockValue > thresholds.deadStockMinValueGBP && periodSalesQty === 0) {
            signals.push({ 
                id: 'DORMANT_NO_SALES',
                label: 'Dead Stock', 
                severity: 'High',
                color: 'text-gray-700 bg-gray-50 border-gray-200', 
                icon: Package, 
                desc: `High value dormant stock (£${stockValue.toFixed(0)}) with 0 sales in the last ${txDays} days.` 
            });
        }

        return signals;
    }, [product, periodSalesQty, txDays, thresholds]);

    const platforms = useMemo(() => Array.from(new Set(sortedTransactions.map(t => t.platform || 'Unknown'))).sort(), [sortedTransactions]);

    // Box Plot Data Generators
    const getStats = (days: number, valueFn: (t: PriceLog) => number | null) => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);
        const filtered = sortedTransactions
            .filter(t => new Date(t.date) >= cutoff && t.velocity > 0) // Only sales for stats
            .map(valueFn)
            .filter((v): v is number => v !== null);
        return calculateQuantiles(filtered);
    };

    const analytics = useMemo(() => {
        const getDailyQtyStats = (days: number) => {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - days);
            const dailyMap: Record<string, number> = {};
            
            sortedTransactions.forEach(t => {
                const tDate = new Date(t.date);
                if (tDate >= cutoff && t.velocity > 0) {
                    const d = t.date.split('T')[0];
                    dailyMap[d] = (dailyMap[d] || 0) + t.velocity;
                }
            });
            
            return calculateQuantiles(Object.values(dailyMap));
        };

        return {
            revenue: {
                d7: getStats(7, t => { const r = t.price * t.velocity; return r > 0.01 ? r : null; }),
                d30: getStats(30, t => { const r = t.price * t.velocity; return r > 0.01 ? r : null; }),
                d90: getStats(90, t => { const r = t.price * t.velocity; return r > 0.01 ? r : null; })
            },
            margin: {
                d7: getStats(7, t => (t.price * t.velocity) > 0.01 ? t.margin : null),
                d30: getStats(30, t => (t.price * t.velocity) > 0.01 ? t.margin : null),
                d90: getStats(90, t => (t.price * t.velocity) > 0.01 ? t.margin : null)
            },
            qty: {
                d7: getDailyQtyStats(7),
                d30: getDailyQtyStats(30),
                d90: getDailyQtyStats(90)
            },
            ads: {
                // Correctly exclude ad-only rows (price === 0) from Per-Order distribution analysis
                d7: getStats(7, t => t.price > 0 ? (t.adsSpend || 0) : null),
                d30: getStats(30, t => t.price > 0 ? (t.adsSpend || 0) : null),
                d90: getStats(90, t => t.price > 0 ? (t.adsSpend || 0) : null)
            }
        };
    }, [sortedTransactions]);

    // Dedicated Stats for Ad Distribution Overlay (Respects Date + Platform, Ignores "Sale/Ad" type toggle)
    const adStats = useMemo(() => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - txDays);
        
        let list = sortedTransactions.filter(t => new Date(t.date) >= cutoff);
        if (txFilterPlatform !== 'All') {
            list = list.filter(t => t.platform === txFilterPlatform);
        }

        let total = 0;
        let adOnly = 0;

        list.forEach(t => {
            const val = t.adsSpend || 0;
            total += val;
            if (t.price === 0 && val > 0) adOnly += val;
        });

        return { total, adOnly, pct: total > 0 ? (adOnly / total) * 100 : 0 };
    }, [sortedTransactions, txDays, txFilterPlatform]);

    // Price-Volume Analysis (Aggregated Bands)
    const priceVolumeAnalysis = useMemo(() => {
        const validTx = sortedTransactions.filter(t => t.velocity > 0 && t.price > 0);
        const refPrice = product.caPrice || product.currentPrice || 1; // Base for % calcs

        // Thresholds for visuals
        const thresholdAmber = -(refPrice * 0.05); // -5%
        const thresholdRed = -(refPrice * 0.15);   // -15%

        const buckets = [
            { label: '90 Days', days: 90 },
            { label: '30 Days', days: 30 },
            { label: '7 Days', days: 7 }
        ];

        const chartData: any[] = [];
        const periodStats: any[] = []; // Aggregated averages per period
        const aggregatedPrices: Record<number, number> = {}; // for table

        // Helper for Effective CA Price
        const getEffectiveCA = (dateStr: string) => {
            const txDate = new Date(dateStr).getTime();
            const changes = priceChangeHistory
                .filter(c => c.sku === product.sku)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            
            const match = changes.find(c => new Date(c.date).getTime() <= txDate);
            if (match) return match.newPrice;
            if (changes.length > 0) return changes[changes.length - 1].oldPrice;
            return refPrice;
        };

        buckets.forEach(bucket => {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - bucket.days);
            
            const bucketTx = validTx.filter(t => new Date(t.date) >= cutoff);
            
            // Banding Logic: Group by delta rounded to nearest 0.50 (or 0.25 if price low?)
            // Let's use 0.50 fixed for simplicity as requested
            const BAND_SIZE = 0.5;
            const groups: Record<string, { totalQty: number, totalRev: number, sumDelta: number, sumPrice: number }> = {};
            
            let totalPeriodQty = 0;
            let totalPeriodDelta = 0;

            bucketTx.forEach(t => {
                const effectiveRef = getEffectiveCA(t.date);
                const rawDelta = t.price - effectiveRef;
                // Snap to band
                const band = (Math.round(rawDelta / BAND_SIZE) * BAND_SIZE).toFixed(2);
                
                if (!groups[band]) groups[band] = { totalQty: 0, totalRev: 0, sumDelta: 0, sumPrice: 0 };
                groups[band].totalQty += t.velocity;
                groups[band].totalRev += (t.price * t.velocity);
                groups[band].sumDelta += (rawDelta * t.velocity);
                groups[band].sumPrice += (t.price * t.velocity);

                totalPeriodQty += t.velocity;
                totalPeriodDelta += (rawDelta * t.velocity);

                // Accumulate for table (only for 90d to catch all points)
                if (bucket.days === 90) {
                    const p = Number(t.price.toFixed(2));
                    aggregatedPrices[p] = (aggregatedPrices[p] || 0) + t.velocity;
                }
            });

            // Push Bands to Chart
            Object.entries(groups).forEach(([b, stats]) => {
                chartData.push({
                    period: bucket.label,
                    delta: parseFloat(b),
                    totalQty: stats.totalQty,
                    actualAvgDelta: stats.sumDelta / stats.totalQty,
                    tooltipPrice: stats.totalQty > 0 ? (stats.sumPrice / stats.totalQty).toFixed(2) : 0
                });
            });

            // Push Aggregate Indicator (Weighted Avg Delta for period)
            if (totalPeriodQty > 0) {
                periodStats.push({
                    period: bucket.label,
                    avgDelta: totalPeriodDelta / totalPeriodQty,
                    totalQty: 1 // Dummy size for the star
                });
            }
        });

        const pointsTable = Object.entries(aggregatedPrices)
            .map(([price, qty]) => ({ price: parseFloat(price), qty }))
            .sort((a, b) => b.qty - a.qty);

        return { chartData, pointsTable, periodStats, thresholds: { amber: thresholdAmber, red: thresholdRed } };
    }, [sortedTransactions, priceChangeHistory, product]);

    // Filter Chart Data based on selection
    const filteredChartData = useMemo(() => {
        if (chartPeriod === 'All') return priceVolumeAnalysis.chartData;
        return priceVolumeAnalysis.chartData.filter(d => d.period === chartPeriod);
    }, [priceVolumeAnalysis, chartPeriod]);

    const filteredAvgStats = useMemo(() => {
        if (chartPeriod === 'All') return priceVolumeAnalysis.periodStats;
        return priceVolumeAnalysis.periodStats.filter(d => d.period === chartPeriod);
    }, [priceVolumeAnalysis, chartPeriod]);

    // Filtered Transaction List
    const filteredTransactions = useMemo(() => {
        let list = sortedTransactions;
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - txDays);
        list = list.filter(t => new Date(t.date) >= cutoff);

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
    }, [sortedTransactions, txFilterPlatform, txFilterType, txDays]);

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
            const rev = t.price * t.velocity;
            if (t.velocity > 0) {
                salesRows++;
                totalUnits += t.velocity;
            } else if (t.price === 0 && (t.adsSpend || 0) > 0) {
                adOnlySpend += (t.adsSpend || 0);
            } else if (t.velocity < 0 || t.price < 0) {
                refundCount++;
                // If it's a refund log with separate amount/qty, revenue is negative.
                refundValue += Math.abs(rev);
            }
        });

        return { salesRows, totalUnits, adOnlySpend, refundCount, refundValue };
    }, [filteredTransactions]);

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-right duration-300 pb-20">
            {/* Header / Nav */}
            <div className="flex items-center gap-2">
                {onBack && (
                    <button onClick={onBack} className="text-gray-500 hover:text-gray-700 transition-colors p-2 rounded-full hover:bg-gray-100">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                )}
                <div>
                    <h2 className="text-xl font-bold text-gray-900">SKU Deep Dive</h2>
                    {initialTimeWindow && (
                        <div className="text-xs text-indigo-600 font-medium flex items-center gap-1 mt-0.5 bg-indigo-50 px-2 py-0.5 rounded w-fit border border-indigo-100">
                            <Info className="w-3 h-3" />
                            Dashboard window: Last {txDays} days
                        </div>
                    )}
                </div>
            </div>

            {/* SKU Overview Card - REDESIGNED */}
            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom p-6">
                <div className="flex items-center gap-2 mb-6 border-b border-gray-100 pb-4">
                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                        <Package className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">SKU Overview</h3>
                </div>

                <div className="flex flex-col xl:flex-row gap-8">
                    {/* LEFT: Identity (Expanded Width) */}
                    <div className="flex-1 min-w-0">
                        <div className="mb-2">
                            <span className="font-mono text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 inline-block">
                                {product.sku}
                            </span>
                        </div>
                        
                        <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-4 break-words">
                            {product.name}
                        </h1>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                                <Layers className="w-3.5 h-3.5" />
                                <span>{product.category || 'Uncategorized'}</span>
                            </div>
                            {product.subcategory && (
                                <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                                    <Tag className="w-3.5 h-3.5" />
                                    <span>{product.subcategory}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* RIGHT: Metrics Grid */}
                    <div className="flex-shrink-0 w-full xl:w-[600px]">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            
                            {/* 1. Velocity */}
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                                    <Activity className="w-3 h-3"/> Velocity
                                </span>
                                <div className="text-xl font-bold text-gray-900">
                                    {product.averageDailySales.toFixed(1)} <span className="text-xs font-normal text-gray-400">/day</span>
                                </div>
                            </div>

                            {/* 2. On Hand */}
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                                    <Warehouse className="w-3 h-3"/> On Hand
                                </span>
                                <div className="text-xl font-bold text-gray-900">
                                    {product.stockLevel.toLocaleString()} <span className="text-xs font-normal text-gray-400">units</span>
                                </div>
                            </div>

                            {/* 3. Inbound */}
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                                    <Ship className="w-3 h-3"/> Inbound
                                </span>
                                <div className="text-xl font-bold text-gray-900">
                                    {product.incomingStock || 0} <span className="text-xs font-normal text-gray-400">units</span>
                                </div>
                            </div>

                            {/* 4. Qty */}
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                                    <Box className="w-3 h-3"/> Lifetime Qty
                                </span>
                                <div className="text-xl font-bold text-gray-900">
                                    {allTimeQty.toLocaleString()}
                                </div>
                            </div>

                            {/* 5. Sales Card (Full Width of Grid) */}
                            <div className="col-span-2 sm:col-span-2 p-3 bg-white/60 rounded-xl border border-gray-200">
                                <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">All-Time Sales</span>
                                <div className="text-2xl font-bold text-gray-900">
                                    £{allTimeSales.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                </div>
                            </div>

                            {/* 6. Margin Card (Full Width of Grid) */}
                            <div className="col-span-2 sm:col-span-2 p-3 bg-white/60 rounded-xl border border-gray-200">
                                <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Lifetime Net Margin</span>
                                <div className={`text-2xl font-bold ${allTimeMarginPct >= 15 ? 'text-green-600' : allTimeMarginPct > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {allTimeMarginPct.toFixed(1)}%
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>

            {/* Diagnostic Signals Strip */}
            {diagnostics.length > 0 && (
                <div className="bg-white/50 border border-gray-200 rounded-xl p-4 backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
                    <div className="flex justify-between items-center mb-3">
                        <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                            <Activity className="w-4 h-4 text-indigo-500" />
                            Diagnostic Signals
                        </h3>
                        <span className="text-[10px] text-gray-400 italic">Thresholds based on global configuration</span>
                    </div>
                    <div className="flex flex-wrap gap-3">
                        {diagnostics.map((signal, idx) => (
                            <div 
                                key={idx} 
                                ref={signal.id === focus ? activeSignalRef : null}
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${signal.color} shadow-sm group relative cursor-help transition-all duration-500 hover:scale-105 ${signal.id === focus ? 'ring-2 ring-offset-2 ring-indigo-500 scale-105 bg-opacity-100' : ''}`}
                            >
                                <div className="p-1.5 bg-white/50 rounded-md">
                                    <signal.icon className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-bold uppercase opacity-70 tracking-wide">{signal.severity} Priority</span>
                                    <span className="text-sm font-bold leading-tight">{signal.label}</span>
                                </div>
                                
                                {/* Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 text-center transform translate-y-2 group-hover:translate-y-0">
                                    <div className="font-semibold mb-1 border-b border-gray-700 pb-1">{signal.label}</div>
                                    <div className="leading-relaxed opacity-90">{signal.desc}</div>
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ANALYTICS SECTION 1: Distributions */}
            {sortedTransactions.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <BarChart2 className="w-5 h-5 text-indigo-600" />
                        Distribution Analysis
                        <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded ml-2">Performance Distributions</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                        <BoxPlot 
                            title="Revenue per Order" 
                            data7={analytics.revenue.d7} 
                            data30={analytics.revenue.d30} 
                            data90={analytics.revenue.d90}
                            format={(v: number) => `£${v.toFixed(2)}`}
                            color="#3b82f6"
                        />
                        <BoxPlot 
                            title="Net Profit Margin" 
                            data7={analytics.margin.d7} 
                            data30={analytics.margin.d30} 
                            data90={analytics.margin.d90}
                            format={(v: number) => `${v.toFixed(1)}%`}
                            color="#10b981"
                        />
                        <BoxPlot 
                            title="Daily Units Sold" 
                            data7={analytics.qty.d7} 
                            data30={analytics.qty.d30} 
                            data90={analytics.qty.d90}
                            format={(v: number) => v.toFixed(0)}
                            color="#8b5cf6"
                        />
                        <BoxPlot 
                            title="Ad Spend (Per Order)" 
                            data7={analytics.ads.d7} 
                            data30={analytics.ads.d30} 
                            data90={analytics.ads.d90}
                            format={(v: number) => `£${v.toFixed(2)}`}
                            color="#f59e0b"
                            footerContent={
                                <div className="mt-3 text-[10px] text-gray-500 border-t border-gray-100 pt-2 flex justify-between items-center bg-orange-50/30 -mx-4 -mb-4 px-4 py-2 rounded-b-xl">
                                    <span className="font-medium">Ad-Only Spend ({txDays}d):</span>
                                    <span className="font-mono font-bold text-orange-700">£{adStats.adOnly.toFixed(2)}</span>
                                </div>
                            }
                        />
                    </div>
                </div>
            )}

            {/* ANALYTICS SECTION 2: Price Intelligence (Redesigned) */}
            {sortedTransactions.length > 0 && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <DollarSign className="w-5 h-5 text-green-600" />
                                Price Deviation vs Volume
                            </h3>
                            {/* Period Toggle */}
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                {['7 Days', '30 Days', '90 Days', 'All'].map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setChartPeriod(p)}
                                        className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${chartPeriod === p ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col h-auto">
                            <div className="flex justify-between items-start mb-4">
                                <h4 className="text-xs font-bold text-gray-500 uppercase">
                                    Aggregated Volume by Price Delta
                                </h4>
                                <div className="text-[10px] text-gray-400 flex items-center gap-2">
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 opacity-20 rounded-full"></div> Safe ({'>'}-5%)</span>
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-500 opacity-20 rounded-full"></div> Moderate (-5% to -15%)</span>
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 opacity-20 rounded-full"></div> Severe ({'<'}-15%)</span>
                                </div>
                            </div>

                            <div className="w-full h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis type="category" dataKey="period" name="Period" allowDuplicatedCategory={false} tick={{fontSize: 12}} />
                                        <YAxis type="number" dataKey="delta" name="Price Deviation" unit="£" domain={['auto', 'auto']} tick={{fontSize: 12}} />
                                        <ZAxis type="number" dataKey="totalQty" range={[60, 600]} name="Volume" />
                                        
                                        {/* Guardrail Zones */}
                                        <ReferenceArea y1={priceVolumeAnalysis.thresholds.amber} y2={1000} fill="green" fillOpacity={0.05} />
                                        <ReferenceArea y1={priceVolumeAnalysis.thresholds.red} y2={priceVolumeAnalysis.thresholds.amber} fill="orange" fillOpacity={0.05} />
                                        <ReferenceArea y1={-1000} y2={priceVolumeAnalysis.thresholds.red} fill="red" fillOpacity={0.05} />
                                        
                                        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" label={{ value: 'Ref Price', position: 'right', fill: '#6b7280', fontSize: 10 }} />
                                        
                                        {/* Aggregated Bubbles */}
                                        <Scatter 
                                            name="Price Bands" 
                                            data={filteredChartData} 
                                            fill="#8884d8" 
                                            fillOpacity={0.7} 
                                            onMouseEnter={(data) => setHoveredBubble(data.payload)}
                                            onMouseLeave={() => setHoveredBubble(null)}
                                        />

                                        {/* Weighted Average Indicator */}
                                        <Scatter 
                                            name="Weighted Avg" 
                                            data={filteredAvgStats} 
                                            shape="star" 
                                            fill="#be185d" 
                                            legendType="star"
                                        />
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </div>
                            
                            {/* Detail Bar */}
                            <div className="mt-2 h-10 bg-gray-50 rounded-lg border border-gray-100 flex items-center px-4 text-xs">
                                {hoveredBubble ? (
                                    <div className="flex flex-wrap items-center gap-4 w-full animate-in fade-in duration-200">
                                        <span className="font-bold text-gray-900 bg-white px-2 py-0.5 rounded shadow-sm border border-gray-200">{hoveredBubble.period}</span>
                                        <div className="h-4 w-px bg-gray-300 hidden sm:block"></div>
                                        <span className="text-gray-600">Band: <strong>{hoveredBubble.delta > 0 ? '+' : ''}£{hoveredBubble.delta.toFixed(2)}</strong></span>
                                        <span className="text-gray-600">Avg Selling Price: <strong>£{hoveredBubble.tooltipPrice}</strong></span>
                                        <span className="text-gray-600">Vol: <strong className="text-gray-900">{hoveredBubble.totalQty}</strong></span>
                                    </div>
                                ) : (
                                    <span className="text-gray-400 italic flex items-center gap-2">
                                        <Info className="w-4 h-4"/> Hover over a bubble to see aggregated volume details
                                    </span>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Tag className="w-5 h-5 text-purple-600" />
                            Price Points (90d)
                        </h3>
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-[400px] overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100 sticky top-0">
                                    <tr>
                                        <th className="p-3">Price Point</th>
                                        <th className="p-3 text-right">Total Qty</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-100">
                                    {priceVolumeAnalysis.pointsTable.map((pt, i) => (
                                        <tr key={i} className="hover:bg-gray-50">
                                            <td className="p-3 font-mono font-bold text-gray-700">£{pt.price.toFixed(2)}</td>
                                            <td className="p-3 text-right">{pt.qty}</td>
                                        </tr>
                                    ))}
                                    {priceVolumeAnalysis.pointsTable.length === 0 && (
                                        <tr><td colSpan={2} className="p-4 text-center text-gray-400">No data</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* ANALYTICS SECTION 3: Transaction Table (Unchanged) */}
            {sortedTransactions.length > 0 && (
                <div className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Layers className="w-5 h-5 text-indigo-600" />
                            Transaction Ledger
                        </h3>
                        <div className="flex gap-2">
                            <div className="relative">
                                <select 
                                    value={txDays}
                                    onChange={e => setTxDays(Number(e.target.value))}
                                    className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value={7}>Last 7 Days</option>
                                    <option value={30}>Last 30 Days</option>
                                    <option value={90}>Last 90 Days</option>
                                </select>
                                <Calendar className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            </div>
                            <div className="relative">
                                <select 
                                    value={txFilterPlatform}
                                    onChange={e => setTxFilterPlatform(e.target.value)}
                                    className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="All">All Platforms</option>
                                    {platforms.map(p => <option key={p} value={p}>{p}</option>)}
                                </select>
                                <Filter className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            </div>
                            <div className="relative">
                                <select 
                                    value={txFilterType}
                                    onChange={e => setTxFilterType(e.target.value)}
                                    className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="All">All Types</option>
                                    <option value="Sale">Sale (Price {'>'} 0)</option>
                                    <option value="Ad Cost">Ad Cost (Ads {'>'} 0)</option>
                                    <option value="Refund">Refunds Only</option>
                                </select>
                                <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                            </div>
                        </div>
                    </div>

                    {/* Transaction Summary Bar */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 shadow-sm text-sm">
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-500 uppercase font-bold">Sales Rows</span>
                            <div className="text-xl font-bold text-gray-800">{ledgerStats.salesRows}</div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-500 uppercase font-bold">Total Units</span>
                            <div className="text-xl font-bold text-green-700">{ledgerStats.totalUnits}</div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-500 uppercase font-bold flex items-center gap-1">
                                Ad-Only Spend 
                                <span title="Includes daily PPC costs not attributed to specific orders. Pooled into total TACoS.">
                                    <Info className="w-3 h-3 text-gray-400" />
                                </span>
                            </span>
                            <div className="text-xl font-bold text-orange-700">£{ledgerStats.adOnlySpend.toFixed(2)}</div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-500 uppercase font-bold">Refunds (Detected)</span>
                            <div className="text-xl font-bold text-red-700 flex items-center gap-1">
                                {ledgerStats.refundCount}
                                {ledgerStats.refundValue > 0 && <span className="text-sm font-medium opacity-70">(-£{ledgerStats.refundValue.toFixed(0)})</span>}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <table className="w-full text-sm text-left whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-100">
                                <tr>
                                    <th className="p-3">Date</th>
                                    <th className="p-3">Platform</th>
                                    <th className="p-3 text-right">Price</th>
                                    <th className="p-3 text-right">Qty</th>
                                    <th className="p-3 text-right">Revenue</th>
                                    <th className="p-3 text-right">Ads</th>
                                    <th className="p-3 text-right">Margin</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {paginatedTransactions.map((tx, idx) => {
                                    // Robust Type detection using new mapped fields
                                    // @ts-ignore
                                    const isRefund = tx._type === 'REFUND_LOG' || tx.velocity < 0;
                                    // @ts-ignore
                                    const isAdRow = tx.price === 0 && (tx.adsSpend || 0) > 0 && !isRefund;
                                    const isZeroRev = Math.abs(tx.price * tx.velocity) < 0.01 && !isAdRow && !isRefund;

                                    return (
                                        <tr key={idx} className={`hover:bg-gray-50/50 transition-colors ${
                                            isAdRow ? 'bg-orange-50/40 text-orange-900' : 
                                            isRefund ? 'bg-red-50/40 text-red-900' : 
                                            isZeroRev ? 'opacity-60 bg-gray-50/30' : ''
                                        }`}>
                                            <td className="p-3 font-mono text-xs opacity-80">{new Date(tx.date).toLocaleDateString('en-GB')}</td>
                                            <td className="p-3">
                                                <div className="flex flex-col">
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border w-fit ${isAdRow ? 'bg-orange-100 border-orange-200 text-orange-800' : isRefund ? 'bg-red-100 border-red-200 text-red-800' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                        {tx.platform}
                                                    </span>
                                                    {/* @ts-ignore */}
                                                    {isRefund && tx.reason && (
                                                        // @ts-ignore
                                                        <span className="text-[9px] text-red-500 mt-0.5 max-w-[120px] truncate">{tx.reason}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 text-right font-medium">
                                                {isAdRow ? <span className="text-xs text-orange-600 font-bold">Ad Cost</span> : `£${tx.price.toFixed(2)}`}
                                            </td>
                                            <td className="p-3 text-right font-bold opacity-90">{tx.velocity}</td>
                                            <td className={`p-3 text-right ${isZeroRev ? 'text-gray-400 italic' : isRefund ? 'text-red-600' : 'text-indigo-600'}`}>
                                                £{(tx.price * tx.velocity).toFixed(2)}
                                            </td>
                                            <td className="p-3 text-right text-orange-600 font-medium">
                                                {(tx.adsSpend || 0) > 0 ? `£${tx.adsSpend?.toFixed(2)}` : '-'}
                                            </td>
                                            <td className={`p-3 text-right font-bold ${(tx.margin || 0) < 10 ? 'text-red-600' : 'text-green-600'}`}>
                                                {tx.margin !== undefined && !isAdRow && !isRefund ? `${tx.margin.toFixed(1)}%` : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {paginatedTransactions.length === 0 && (
                                    <tr><td colSpan={7} className="p-8 text-center text-gray-400">No transactions match filters</td></tr>
                                )}
                            </tbody>
                        </table>
                        {filteredTransactions.length >= txLimit && (
                            <div className="p-3 text-center border-t border-gray-100">
                                <button onClick={() => setTxLimit(prev => prev + 50)} className="text-xs text-indigo-600 font-bold hover:underline">
                                    Load More ({filteredTransactions.length - txLimit} remaining)
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SkuDeepDivePage;
