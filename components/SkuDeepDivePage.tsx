

import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Package, Tag, Layers, DollarSign, Box, ArrowLeft, Warehouse, Ship, AlertTriangle, RotateCcw, Megaphone, TrendingDown, TrendingUp, Activity, BarChart2, Calendar, Filter, Search, Info, HelpCircle, CheckCircle, XCircle, LayoutGrid, Rows, Bookmark, History, FileText } from 'lucide-react';
import { Product, PriceLog, PriceChangeRecord, RefundLog } from '../types';
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ScatterChart, Scatter, ZAxis, ReferenceLine, ReferenceArea, ComposedChart, Bar } from 'recharts';
import { ThresholdConfig } from '../services/thresholdsConfig';
import { GradeBadge } from './GradeBadge';
import { calcProfit, calcRevenue, calcUnits, calcAdSpend, marginPct, calcTACoSPct } from '../services/metrics';
import { buildWindow } from '../services/dateWindow';
import { asDateKey, isDateKeyBetween, getTodayKeyMelbourne } from '../services/dateUtils';
import AuditPanel from './AuditPanel';
import { formatMoney, formatPct, formatNumber } from '../utils/format';
import { VAT_MULTIPLIER } from '../constants';
import { PriceChangeHistoryPanel } from './strategy/PriceChangeHistoryPanel';
import { createPortal } from 'react-dom';

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
    thresholds: ThresholdConfig;
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

const BoxPlotTooltip = ({ content, x, y, format }: any) => {
    if (!content) return null;
    const style: React.CSSProperties = {
        position: 'fixed',
        top: y,
        left: x,
        transform: 'translate(-50%, -100%) translateY(-8px)',
        zIndex: 9999,
        pointerEvents: 'none'
    };
    return createPortal(
        <div style={style} className="bg-gray-900 text-white p-3 rounded-lg shadow-xl text-xs max-w-xs z-50 border border-gray-700 backdrop-blur-md bg-opacity-95 animate-in fade-in zoom-in duration-200">
            <div className="font-bold mb-2 border-b border-gray-700 pb-1">{content.label} (n={content.n})</div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                <span>Max:</span><span className="text-right font-mono">{format(content.max)}</span>
                <span>Q3:</span><span className="text-right font-mono">{format(content.q3)}</span>
                <span className="font-bold">Median:</span><span className="text-right font-mono font-bold">{format(content.median)}</span>
                <span>Q1:</span><span className="text-right font-mono">{format(content.q1)}</span>
                <span>Min:</span><span className="text-right font-mono">{format(content.min)}</span>
            </div>
        </div>,
        document.body
    );
};


const BoxPlot = ({ title, data7, data30, data90, format, color = '#6366f1', adOnly7, layout = 'horizontal', showAdOnlyFooter = false, setTooltip, tooltip }: any) => {
    
    const CustomRechartsTooltip = ({ active, payload, label, formatFn }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            const content = {
                label,
                n: data.n,
                max: data.max,
                q3: data.q3,
                median: data.median,
                q1: data.q1,
                min: data.min,
            };
            return (
                <div className="bg-gray-900 text-white p-3 rounded-lg shadow-xl text-xs max-w-xs z-50 border border-gray-700 backdrop-blur-md bg-opacity-95">
                    <div className="font-bold mb-2 border-b border-gray-700 pb-1">{content.label} (n={content.n})</div>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-[10px]">
                        <span>Max:</span><span className="text-right font-mono">{formatFn(content.max)}</span>
                        <span>Q3:</span><span className="text-right font-mono">{formatFn(content.q3)}</span>
                        <span className="font-bold">Median:</span><span className="text-right font-mono font-bold">{formatFn(content.median)}</span>
                        <span>Q1:</span><span className="text-right font-mono">{formatFn(content.q1)}</span>
                        <span>Min:</span><span className="text-right font-mono">{formatFn(content.min)}</span>
                    </div>
                </div>
            );
        }
        return null;
    };

    const BoxAndWhisker = (props: any) => {
        const { x, y, width, height, payload, color } = props;
        const { min, q1, median, q3, max } = payload;
        
        const iqrHeight = Math.abs(height);
        const iqrRange = q3 - q1;

        if (iqrRange <= 0 && height === 0) return null;

        const scale = (value: number) => {
            if (iqrRange <= 0) return y + iqrHeight / 2;
            return y + ((q3 - value) / iqrRange) * iqrHeight;
        };
        
        const medianY = scale(median);
        const minY = scale(min);
        const maxY = scale(max);

        const whiskerX = x + width / 2;
        const tickWidth = width / 2;

        return (
            <g>
                <rect x={x} y={y} width={width} height={height} fill={`${color}20`} stroke={color} />
                <line x1={x} y1={medianY} x2={x + width} y2={medianY} stroke={color} strokeWidth={2} />
                <line x1={whiskerX} y1={y} x2={whiskerX} y2={maxY} stroke="gray" />
                <line x1={whiskerX} y1={y + height} x2={whiskerX} y2={minY} stroke="gray" />
                <line x1={whiskerX - tickWidth} y1={maxY} x2={whiskerX + tickWidth} y2={maxY} stroke="gray" />
                <line x1={whiskerX - tickWidth} y1={minY} x2={whiskerX + tickWidth} y2={minY} stroke="gray" />
            </g>
        );
    };

    const CustomizedAxisTick = (props: any) => {
        const { x, y, payload, data } = props;
        const dataPoint = data.find((d: any) => d.name === payload.value);
      
        return (
          <g transform={`translate(${x},${y})`}>
            <text x={0} y={0} dy={16} textAnchor="middle" fill="#666" fontSize={10} fontWeight="bold" style={{ userSelect: 'none' }}>
              {payload.value}
            </text>
            {dataPoint && (
                <text x={0} y={28} dy={0} textAnchor="middle" fill="#666" fontSize={10} style={{ userSelect: 'none' }}>
                    (n={dataPoint.n})
                </text>
            )}
            {dataPoint && dataPoint.n < 10 && (
                 <text x={0} y={42} dy={0} textAnchor="middle" fill="#92400e" fontSize={9} fontWeight="bold" style={{ userSelect: 'none' }}>
                    (Low Data)
                 </text>
            )}
          </g>
        );
    };

    if (layout === 'vertical') {
        const chartData = [
            { name: '7 Days', ...(data7 || {}) },
            { name: '30 Days', ...(data30 || {}) },
            { name: '90 Days', ...(data90 || {}) },
        ].filter(d => d.min !== undefined && d.min !== null);

        if (chartData.length === 0) {
            return (
                <div className="bg-white py-4 px-4 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col items-center justify-center">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                        <Activity className="w-3 h-3" /> {title}
                    </h4>
                    <div className="text-xs text-gray-400">No data available for this period.</div>
                </div>
            );
        }

        const allValues = chartData.flatMap(d => [d.min, d.max]);
        const globalMin = Math.min(...allValues);
        const globalMax = Math.max(...allValues);
        const range = globalMax - globalMin;
        const padding = range > 0 ? range * 0.15 : Math.max(Math.abs(globalMin) * 0.2, 1);
        const yDomain: [number, number] = [globalMin - padding, globalMax + padding];

        return (
            <div className="bg-white py-4 px-2 rounded-xl border border-gray-200 shadow-sm h-full flex flex-col select-none">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2 px-2">
                    <Activity className="w-3 h-3" /> {title}
                </h4>
                <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis dataKey="name" tick={<CustomizedAxisTick data={chartData} />} height={55} tickLine={false} axisLine={false} />
                            <YAxis 
                                domain={yDomain} 
                                tickFormatter={format} 
                                tick={{fontSize: 10, style: { userSelect: 'none' }}}
                                width={45}
                                tickLine={false}
                                axisLine={false}
                            />
                            <RechartsTooltip 
                              content={<CustomRechartsTooltip formatFn={format} />} 
                              cursor={{ fill: `${color}10` }} 
                            />
                            <Bar 
                                dataKey={(d) => [d.q1, d.q3]} 
                                shape={<BoxAndWhisker color={color} />} 
                                barSize={40}
                            />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>
        );
    }
    
    // Default Horizontal Layout
    const renderBar = (stats: any, label: string, baselineMedian?: number) => {
        if (!stats) return <div className="h-8 flex items-center text-xs text-gray-400 pl-2">No data</div>;
        
        const range = stats.max - stats.min;
        const width = (val: number) => range === 0 ? 0 : ((val - stats.min) / range) * 100;
        
        let deltaInfo = null;
        if (baselineMedian !== undefined && stats.median !== undefined && baselineMedian !== 0) {
            const diff = ((stats.median - baselineMedian) / baselineMedian) * 100;
            const isPositive = diff > 0;
            const isZero = Math.abs(diff) < 0.1;
            
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
            <div 
                className="mb-3"
                onMouseEnter={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    setTooltip({
                        visible: true,
                        source: title,
                        content: { label, ...stats },
                        x: rect.left + rect.width / 2,
                        y: rect.top,
                    });
                }}
                onMouseLeave={() => {
                    setTooltip(null);
                }}
            >
                <div className="flex justify-between items-center mb-1">
                    <div className="flex items-center">
                        <span className="text-[10px] font-bold text-gray-500">{label} (n={stats.n})</span>
                        {deltaInfo}
                    </div>
                    {stats.n < 10 && <span className="text-[9px] text-amber-600 flex items-center gap-1 bg-amber-50 px-1 rounded"><AlertTriangle className="w-2.5 h-2.5"/> Low Data</span>}
                </div>
                <div className="relative h-6 rounded border border-gray-100">
                    <div className="absolute top-1/2 left-0 right-0 h-px bg-gray-300"></div>
                    <div 
                        className="absolute top-1 bottom-1 border"
                        style={{ 
                            left: `${width(stats.q1)}%`, 
                            width: `${width(stats.q3) - width(stats.q1)}%`,
                            backgroundColor: `${color}20`,
                            borderColor: color
                        }} 
                    />
                    <div 
                        className="absolute top-0 bottom-0 w-0.5"
                        style={{ left: `${width(stats.median)}%`, backgroundColor: color }} 
                    />
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
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col justify-between h-full select-none">
            <div>
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                    <Activity className="w-3 h-3" /> {title}
                </h4>
                {renderBar(data7, '7 Days', data90?.median)}
                {renderBar(data30, '30 Days', data90?.median)}
                {renderBar(data90, '90 Days')}
            </div>
            {showAdOnlyFooter && adOnly7 !== undefined && (
                <div className="mt-auto pt-2 border-t border-gray-100 bg-orange-50/50 -m-4 mt-2 px-4 py-2 rounded-b-xl">
                    <div className="flex justify-between items-center text-sm">
                        <span className="text-gray-600 font-medium">Ad-Only Spend (7d):</span>
                        <span className="font-bold text-orange-700">{formatMoney(adOnly7)}</span>
                    </div>
                </div>
            )}
            {tooltip?.visible && tooltip.source === title && <BoxPlotTooltip content={tooltip.content} x={tooltip.x} y={tooltip.y} format={format} />}
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
    const [chartPeriod, setChartPeriod] = useState<string>('30 Days');
    const [chartLayout, setChartLayout] = useState<'horizontal' | 'vertical'>('horizontal');
    const [tooltip, setTooltip] = useState<{ visible: boolean, content: any, x: number, y: number, source?: string } | null>(null);
    const [isAuditPanelVisible, setIsAuditPanelVisible] = useState(false);
    
    const activeSignalRef = useRef<HTMLDivElement>(null);

    // Refs for quick access scrolling
    const overviewRef = useRef<HTMLDivElement>(null);
    const signalsRef = useRef<HTMLDivElement>(null);
    const analysisRef = useRef<HTMLDivElement>(null);
    const pricingRef = useRef<HTMLDivElement>(null);
    const ledgerRef = useRef<HTMLDivElement>(null);

    const scrollTo = (ref: React.RefObject<HTMLDivElement>) => {
        if (ref.current) {
            ref.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    // Calculate Date Window Keys
    const { startKey, endKey, expectedDays } = useMemo(() => buildWindow({
        mode: 'days',
        days: txDays,
        excludeToday: true 
    }), [txDays]);
    
    // For Price History, we extend to Today to show recent actions
    // This handles the user case where they just lodged a price change today and expect to see it immediately
    const todayKey = getTodayKeyMelbourne();
    const historyEndKey = todayKey > endKey ? todayKey : endKey;

    useEffect(() => {
        if (focus && activeSignalRef.current) {
            setTimeout(() => {
                activeSignalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 100);
        }
    }, [focus]);

    const sortedTransactions = useMemo(() => {
        const safeTx = Array.isArray(transactions) ? transactions : [];
        const safeRefunds = Array.isArray(refunds) ? refunds : [];

        if (process.env.NODE_ENV === 'development') {
             if (transactions && !Array.isArray(transactions)) console.warn('SkuDeepDive: transactions is not array');
             if (refunds && !Array.isArray(refunds)) console.warn('SkuDeepDive: refunds is not array');
        }

        const sales = safeTx.map(t => ({ ...t, _type: 'SALE' }));
        const refundLogs = safeRefunds.map(r => ({
            id: r.id,
            sku: r.sku,
            date: r.date,
            velocity: r.quantity > 0 ? -r.quantity : 0, 
            price: r.amount > 0 ? (r.quantity > 0 ? r.amount/r.quantity : r.amount) : 0,
            platform: r.platform,
            margin: 0,
            profit: -r.amount,
            adsSpend: 0,
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

    const periodSalesQty = useMemo(() => {
        return filteredTransactions
            .filter(t => t.velocity > 0)
            .reduce((acc, t) => acc + t.velocity, 0);
    }, [filteredTransactions]);

    const allTimeMarginPct = useMemo(() => {
        if (!transactions || transactions.length === 0) return 0;
        
        let totalProfit = 0;
        transactions.forEach(t => {
            totalProfit += calcProfit(t);
        });
        
        if (refunds) {
            refunds.forEach(r => totalProfit -= r.amount);
        }
    
        const totalRefundValue = refunds ? refunds.reduce((sum, r) => sum + r.amount, 0) : 0;
        const netSales = allTimeSales - totalRefundValue;
    
        return marginPct(totalProfit, netSales) || 0;
    }, [transactions, refunds, allTimeSales]);

    // NEW: Calculate All-Time Return & Refund Rate
    const allTimeReturnStats = useMemo(() => {
        if (allTimeQty === 0) return { returnRate: 0, refundRate: 0 };
        const totalRefundQty = refunds.reduce((sum, r) => sum + r.quantity, 0);
        const totalRefundVal = refunds.reduce((sum, r) => sum + r.amount, 0);
        
        return {
            returnRate: (totalRefundQty / allTimeQty) * 100,
            refundRate: allTimeSales > 0 ? (totalRefundVal / allTimeSales) * 100 : 0
        };
    }, [refunds, allTimeQty, allTimeSales]);

    const diagnostics = useMemo(() => {
        const signals = [];

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

        const margin = product.costDetail?.profitInclRnPct;
        if (margin !== undefined && margin < thresholds.marginBelowTargetPct) {
            signals.push({ 
                id: 'BELOW_TARGET',
                label: 'Margin Compression', 
                severity: 'High',
                color: 'text-red-700 bg-red-50 border-red-200', 
                icon: DollarSign, 
                desc: `Net margin is ${margin.toFixed(1)}%, below the ${thresholds.marginBelowTargetPct}% target.` 
            });
        }

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

        const stockValue = product.stockLevel * (product.costPrice || 0);
        const globalVelocity = product.dailyAverageSales || product.averageDailySales || 0;
        
        if (stockValue > thresholds.deadStockMinValueGBP && globalVelocity === 0) {
            signals.push({ 
                id: 'DORMANT_NO_SALES',
                label: 'Dead Stock', 
                severity: 'High',
                color: 'text-gray-700 bg-gray-50 border-gray-200', 
                icon: Package, 
                desc: `High value dormant stock (£${stockValue.toFixed(0)}) with 0 velocity detected.` 
            });
        }

        return signals;
    }, [product, periodSalesQty, txDays, thresholds]);

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
                d90: getStats(90, t => { const r = calcRevenue(t); return r > 0.01 ? r : null; })
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
            
            let totalAdSpend = 0;
            let totalRevenue = 0;
            let adOnlySpend = 0;
            
            periodTx.forEach(t => {
                const currentAdSpend = calcAdSpend(t);
                totalAdSpend += currentAdSpend;
                
                // @ts-ignore
                const isSale = t._type !== 'REFUND_LOG' && t.price > 0 && t.velocity > 0;
                if (isSale) {
                    totalRevenue += calcRevenue(t);
                } else if (currentAdSpend > 0 && t.price === 0) {
                    adOnlySpend += currentAdSpend;
                }
            });
            
            const tacosPct = calcTACoSPct(totalAdSpend, totalRevenue);
            
            return { totalAdSpend, totalRevenue, tacosPct, adOnlySpend };
        };
        
        return {
            d7: calculateForDays(7),
            d30: calculateForDays(30),
            d90: calculateForDays(90)
        };
    }, [sortedTransactions]);

    const priceVolumeAnalysis = useMemo(() => {
        const validTx = sortedTransactions.filter(t => t.velocity > 0 && t.price > 0);
        // Fix refPrice to be VAT inclusive for comparison with scaled transaction prices
        const refPrice = product.caPrice || (product.currentPrice * VAT_MULTIPLIER) || 1; 

        const thresholdAmber = -(refPrice * 0.05); 
        const thresholdRed = -(refPrice * 0.15);   

        // REORDERED: 7, 30, 90
        const buckets = [
            { label: '7 Days', days: 7 },
            { label: '30 Days', days: 30 },
            { label: '90 Days', days: 90 }
        ];

        const chartData: any[] = [];
        const periodStats: any[] = []; 
        const aggregatedPrices: Record<number, number> = {}; 
        
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
                const rawDelta = t.price - effectiveRef;
                const band = (Math.round(rawDelta / BAND_SIZE) * BAND_SIZE).toFixed(2);
                
                if (!groups[band]) groups[band] = { totalQty: 0, totalRev: 0, sumDelta: 0, sumPrice: 0 };
                groups[band].totalQty += t.velocity;
                groups[band].totalRev += (t.price * t.velocity);
                groups[band].sumDelta += (rawDelta * t.velocity);
                groups[band].sumPrice += (t.price * t.velocity);

                totalPeriodQty += t.velocity;
                totalPeriodDelta += (rawDelta * t.velocity);

                if (bucket.days === 90) {
                    const p = Number(t.price.toFixed(2));
                    aggregatedPrices[p] = (aggregatedPrices[p] || 0) + t.velocity;
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

        const pointsTable = Object.entries(aggregatedPrices)
            .map(([price, qty]) => ({ price: parseFloat(price), qty }))
            .sort((a, b) => b.qty - a.qty);

        return { chartData, pointsTable, periodStats, thresholds: { amber: thresholdAmber, red: thresholdRed } };
    }, [sortedTransactions, priceChangeHistory, product]);

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
    
            // @ts-ignore
            const isRefund = tx._type === 'REFUND_LOG' || tx.velocity < 0;
            // @ts-ignore
            const isAdRow = tx.price === 0 && calcAdSpend(tx) > 0 && !isRefund;
    
            if (!isRefund && !isAdRow) {
                const txRevenue = calcRevenue(tx);
                group.soldQty += calcUnits(tx);
                group.revenue += txRevenue;
                totalRevenueAllPlatforms += txRevenue;
            }
    
            group.adSpend += calcAdSpend(tx);
            group.profit += calcProfit(tx);
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
            const rev = t.price * t.velocity;
            if (t.velocity > 0) {
                salesRows++;
                totalUnits += t.velocity;
            } else if (t.price === 0 && (t.adsSpend || 0) > 0) {
                adOnlySpend += (t.adsSpend || 0);
            } else if (t.velocity < 0 || t.price < 0) {
                refundCount++;
                refundValue += Math.abs(rev);
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
                            <div className="text-xs text-indigo-600 font-medium flex items-center gap-1 mt-0.5 bg-indigo-50 px-2 py-0.5 rounded w-fit border border-indigo-100">
                                <Info className="w-3 h-3" />
                                Dashboard window: Last {txDays} days
                            </div>
                        )}
                    </div>
                </div>
            </div>

            <div ref={overviewRef} className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom p-6">
                <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                            <Package className="w-5 h-5" />
                        </div>
                        <h3 className="text-lg font-bold text-gray-900">SKU Overview</h3>
                    </div>

                    {sortedTransactions.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-400 uppercase mr-1 hidden sm:block select-none">Quick Access:</span>
                            <button onClick={() => scrollTo(analysisRef)} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-sm transition-all flex items-center gap-1.5">
                                <BarChart2 className="w-3.5 h-3.5" /> Distribution
                            </button>
                            <button onClick={() => scrollTo(pricingRef)} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-sm transition-all flex items-center gap-1.5">
                                <History className="w-3.5 h-3.5" /> Pricing
                            </button>
                             <button onClick={() => scrollTo(ledgerRef)} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-sm transition-all flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5" /> Ledger
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex flex-col xl:flex-row gap-8">
                    <div className="flex-1 min-w-0">
                        <div className="mb-2 flex items-center">
                            <span className="font-mono text-sm font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded border border-indigo-100 inline-block">
                                {product.sku}
                            </span>
                            <GradeBadge gradeLevel={product.gradeLevel} />
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
                            {product.seasonTags?.slice(0, 2).map(tag => (
                                <span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>
                            ))}
                            {(product.seasonTags?.length || 0) > 2 && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{ (product.seasonTags?.length || 0) - 2 }</span>
                            )}
                            {product.festivalTags?.slice(0, 2).map(tag => (
                                <span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>
                            ))}
                            {(product.festivalTags?.length || 0) > 2 && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{ (product.festivalTags?.length || 0) - 2 }</span>
                            )}
                        </div>
                    </div>

                    <div className="flex-shrink-0 w-full xl:w-[600px]">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            
                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                                    <Activity className="w-3 h-3"/> Velocity
                                </span>
                                <div className="text-xl font-bold text-gray-900">
                                    {formatNumber(product.averageDailySales, 1)} <span className="text-xs font-normal text-gray-400">/day</span>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                                    <Warehouse className="w-3 h-3"/> On Hand
                                </span>
                                <div className="text-xl font-bold text-gray-900">
                                    {formatNumber(product.stockLevel)} <span className="text-xs font-normal text-gray-400">units</span>
                                </div>
                            </div>

                            {/* INBOUND TOOLTIP */}
                            <div className="space-y-1 group relative cursor-help">
                                <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                                    <Ship className="w-3 h-3"/> Inbound
                                </span>
                                <div className="text-xl font-bold text-gray-900">
                                    {formatNumber(product.incomingStock)} <span className="text-xs font-normal text-gray-400">units</span>
                                </div>
                                
                                {product.shipments && product.shipments.length > 0 && (
                                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-3 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-50">
                                        <div className="font-bold border-b border-gray-700 pb-1 mb-1">Active Shipments</div>
                                        <div className="space-y-1">
                                            {product.shipments.map((s, i) => (
                                                <div key={i} className="flex justify-between gap-2">
                                                    <span className="truncate">{s.containerId}</span>
                                                    <span className="font-bold text-indigo-300">{s.eta || 'TBA'}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-1">
                                <span className="text-[10px] font-bold text-gray-400 uppercase flex items-center gap-1">
                                    <Box className="w-3 h-3"/> Lifetime Qty
                                </span>
                                <div className="text-xl font-bold text-gray-900">
                                    {formatNumber(allTimeQty)}
                                </div>
                            </div>

                            {/* UPDATED: Summary Cards Row to Include Return Stats */}
                            <div className="col-span-2 sm:col-span-1 p-3 bg-white/60 rounded-xl border border-gray-200">
                                <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">All-Time Sales</span>
                                <div className="text-lg font-bold text-gray-900">
                                    {formatMoney(allTimeSales, 0)}
                                </div>
                            </div>

                            <div className="col-span-2 sm:col-span-1 p-3 bg-white/60 rounded-xl border border-gray-200">
                                <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">Lifetime Net Margin</span>
                                <div className={`text-lg font-bold ${allTimeMarginPct >= 15 ? 'text-green-600' : allTimeMarginPct > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatPct(allTimeMarginPct, 1)}
                                </div>
                            </div>

                            <div className="col-span-2 sm:col-span-2 p-3 bg-white/60 rounded-xl border border-gray-200">
                                <span className="text-[10px] font-bold text-gray-400 uppercase block mb-1">All-Time Return & Refund Rate</span>
                                <div className="flex items-center gap-4">
                                    <div>
                                        <div className="text-xs text-gray-500 font-medium">Return (Qty)</div>
                                        <div className={`text-lg font-bold ${allTimeReturnStats.returnRate > thresholds.returnRatePct ? 'text-red-600' : 'text-gray-900'}`}>
                                            {formatPct(allTimeReturnStats.returnRate)}
                                        </div>
                                    </div>
                                    <div className="w-px h-8 bg-gray-200"></div>
                                    <div>
                                        <div className="text-xs text-gray-500 font-medium">Refund (Value)</div>
                                        <div className="text-lg font-bold text-gray-900">
                                            {formatPct(allTimeReturnStats.refundRate)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                        </div>
                    </div>
                </div>
            </div>

            {diagnostics.length > 0 && (
                <div ref={signalsRef} className="bg-white/50 border border-gray-200 rounded-xl p-4 backdrop-blur-sm animate-in fade-in slide-in-from-top-2">
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

            {sortedTransactions.length > 0 && (
                <div ref={analysisRef} className="space-y-4">
                    <div className="flex justify-between items-center">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <BarChart2 className="w-5 h-5 text-indigo-600" />
                            Distribution Analysis
                            <span className="text-xs font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded ml-2">Performance Distributions</span>
                        </h3>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button 
                                onClick={() => setChartLayout('horizontal')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${chartLayout === 'horizontal' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                            >
                                <Rows className="w-3 h-3" /> Horizontal
                            </button>
                            <button 
                                onClick={() => setChartLayout('vertical')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${chartLayout === 'vertical' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                            >
                                <LayoutGrid className="w-3 h-3" /> Vertical
                            </button>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                        <div className={chartLayout === 'vertical' ? 'h-96' : ''}>
                            <BoxPlot 
                                title="Revenue per Order" 
                                data7={analytics.revenue.d7} 
                                data30={analytics.revenue.d30} 
                                data90={analytics.revenue.d90}
                                format={(v: number) => `£${v.toFixed(0)}`}
                                color="#3b82f6"
                                layout={chartLayout}
                                tooltip={tooltip}
                                setTooltip={setTooltip}
                            />
                        </div>
                        <div className={chartLayout === 'vertical' ? 'h-96' : ''}>
                            <BoxPlot 
                                title="Net Profit Margin" 
                                data7={analytics.margin.d7} 
                                data30={analytics.margin.d30} 
                                data90={analytics.margin.d90}
                                format={(v: number) => `${v.toFixed(1)}%`}
                                color="#10b981"
                                layout={chartLayout}
                                tooltip={tooltip}
                                setTooltip={setTooltip}
                            />
                        </div>
                        <div className={chartLayout === 'vertical' ? 'h-96' : ''}>
                            <BoxPlot 
                                title="Daily Units Sold" 
                                data7={analytics.qty.d7} 
                                data30={analytics.qty.d30} 
                                data90={analytics.qty.d90}
                                format={(v: number) => v.toFixed(0)}
                                color="#8b5cf6"
                                layout={chartLayout}
                                tooltip={tooltip}
                                setTooltip={setTooltip}
                            />
                        </div>
                        <div className={chartLayout === 'vertical' ? 'h-96' : ''}>
                           <BoxPlot
                                title="Ad Spend / TACoS"
                                data7={analytics.tacos.d7}
                                data30={analytics.tacos.d30}
                                data90={analytics.tacos.d90}
                                format={(v: number) => `${v.toFixed(1)}%`}
                                color="#f97316"
                                layout={chartLayout}
                                showAdOnlyFooter={true}
                                adOnly7={tacosStats.d7.adOnlySpend}
                                tooltip={tooltip}
                                setTooltip={setTooltip}
                            />
                        </div>
                    </div>

                    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm select-none">
                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                            <Megaphone className="w-3 h-3 text-orange-500" /> Advertising Efficiency (TACoS)
                        </h4>
                        <div className="grid grid-cols-3 gap-4 text-center divide-x divide-gray-100">
                            <div>
                                <div className={`text-xl font-bold ${typeof tacosStats.d7.tacosPct === 'number' && tacosStats.d7.tacosPct > thresholds.highAdDependencyPct ? 'text-red-600' : 'text-gray-800'}`}>
                                    {typeof tacosStats.d7.tacosPct === 'number' ? `${tacosStats.d7.tacosPct.toFixed(1)}%` : tacosStats.d7.tacosPct}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">7 Days</div>
                            </div>
                            <div>
                                <div className={`text-xl font-bold ${typeof tacosStats.d30.tacosPct === 'number' && tacosStats.d30.tacosPct > thresholds.highAdDependencyPct ? 'text-red-600' : 'text-gray-800'}`}>
                                    {typeof tacosStats.d30.tacosPct === 'number' ? `${tacosStats.d30.tacosPct.toFixed(1)}%` : tacosStats.d30.tacosPct}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">30 Days</div>
                            </div>
                            <div>
                                <div className={`text-xl font-bold ${typeof tacosStats.d90.tacosPct === 'number' && tacosStats.d90.tacosPct > thresholds.highAdDependencyPct ? 'text-red-600' : 'text-gray-800'}`}>
                                    {typeof tacosStats.d90.tacosPct === 'number' ? `${tacosStats.d90.tacosPct.toFixed(1)}%` : tacosStats.d90.tacosPct}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">90 Days</div>
                            </div>
                        </div>
                        <p className="text-[10px] text-gray-400 mt-3 text-center italic">
                            Total Ad Spend / Total Sales Revenue. Includes ad-only spend.
                        </p>
                    </div>
                </div>
            )}

            {sortedTransactions.length > 0 && (
                <div ref={pricingRef} className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2 space-y-4">
                        <div className="flex justify-between items-center">
                            <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                <DollarSign className="w-5 h-5 text-green-600" />
                                Price Deviation vs Volume
                            </h3>
                            <div className="flex bg-gray-100 p-1 rounded-lg">
                                {['7 Days', '30 Days', '90 Days', 'All'].map(p => (
                                    <button
                                        key={p}
                                        onClick={() => setChartPeriod(p)}
                                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${chartPeriod === p ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                                    >
                                        {p}
                                    </button>
                                ))}
                            </div>
                        </div>
                        
                        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col h-auto select-none">
                            <div className="flex justify-between items-start mb-4">
                                <h4 className="text-xs font-bold text-gray-500 uppercase">
                                    Aggregated Volume by Price Delta
                                </h4>
                                <div className="text-[10px] text-gray-400 flex items-center gap-2">
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 opacity-20 rounded-full"></div> Safe ({'>'} -5%)</span>
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-500 opacity-20 rounded-full"></div> Moderate (-5% to -15%)</span>
                                    <span className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 opacity-20 rounded-full"></div> Severe ({'<'} -15%)</span>
                                </div>
                            </div>

                            <div className="w-full h-[300px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <ScatterChart margin={{ top: 20, right: 20, bottom: 20, left: 20 }}>
                                        <CartesianGrid strokeDasharray="3 3" />
                                        <XAxis type="category" dataKey="period" name="Period" allowDuplicatedCategory={false} tick={{fontSize: 12, style: { userSelect: 'none' }}} />
                                        <YAxis type="number" dataKey="delta" name="Price Deviation" unit="£" domain={['auto', 'auto']} tick={{fontSize: 12, style: { userSelect: 'none' }}} label={{ value: 'Price Deviation (£)', angle: -90, position: 'insideLeft' }} />
                                        <ZAxis type="number" dataKey="totalQty" range={[60, 600]} name="Volume" />
                                        
                                        <ReferenceArea y1={priceVolumeAnalysis.thresholds.amber} y2={1000} fill="green" fillOpacity={0.05} />
                                        <ReferenceArea y1={priceVolumeAnalysis.thresholds.red} y2={priceVolumeAnalysis.thresholds.amber} fill="orange" fillOpacity={0.05} />
                                        <ReferenceArea y1={-1000} y2={priceVolumeAnalysis.thresholds.red} fill="red" fillOpacity={0.05} />
                                        
                                        <ReferenceLine y={0} stroke="#9ca3af" strokeDasharray="3 3" label={{ value: 'Ref Price', position: 'right', fill: '#6b7280', fontSize: 10 }} />
                                        
                                        <Scatter 
                                            name="Price Bands" 
                                            data={filteredChartData} 
                                            fill="#8884d8" 
                                            fillOpacity={0.7} 
                                            onMouseEnter={(data) => setHoveredBubble(data.payload)}
                                            onMouseLeave={() => setHoveredBubble(null)}
                                        />

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
                                    {priceVolumeAnalysis.pointsTable.map((pt, i) => {
                                        const isLowest = minPricePoint !== null && pt.price === minPricePoint;
                                        const isHighest = maxPricePoint !== null && pt.price === maxPricePoint;
                                        return (
                                            <tr key={i} className={`hover:bg-gray-50 ${isLowest ? 'bg-amber-50/30' : isHighest ? 'bg-indigo-50/30' : ''}`}>
                                                <td className="p-3 font-mono font-bold text-gray-700">
                                                    <div className="flex items-center gap-2">
                                                        £{pt.price.toFixed(2)}
                                                        {isLowest && (
                                                            <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 font-bold uppercase tracking-wide flex items-center gap-1">
                                                                <TrendingDown className="w-2.5 h-2.5" /> Lowest
                                                            </span>
                                                        )}
                                                        {isHighest && (
                                                            <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-200 font-bold uppercase tracking-wide flex items-center gap-1">
                                                                <TrendingUp className="w-2.5 h-2.5" /> Highest
                                                            </span>
                                                        )}
                                                    </div>
                                                </td>
                                                <td className="p-3 text-right">{pt.qty}</td>
                                            </tr>
                                        );
                                    })}
                                    {priceVolumeAnalysis.pointsTable.length === 0 && (
                                        <tr><td colSpan={2} className="p-4 text-center text-gray-400">No data</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {sortedTransactions.length > 0 && (
                <div ref={ledgerRef} className="space-y-6">
                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                                    <Layers className="w-5 h-5 text-indigo-600" />
                                    Transaction Ledger
                                </h3>
                                <button
                                    onClick={() => setIsAuditPanelVisible(!isAuditPanelVisible)}
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-bold border transition-all shadow-sm text-xs ${isAuditPanelVisible ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                                    title="Show Data Audit"
                                >
                                    <Activity className="w-3 h-3" />
                                    Audit
                                </button>
                            </div>
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

                        {isAuditPanelVisible && (
                            <AuditPanel
                                title="Ledger Reconciliation"
                                startKey={startKey}
                                endKey={endKey}
                                rows={filteredTransactions}
                                getDateKey={(row: any) => asDateKey(row.date)}
                                getRevenue={(row: any) => calcRevenue(row)}
                                getQty={(row: any) => calcUnits(row)}
                                getProfit={(row: any) => calcProfit(row)}
                                getAdSpend={(row: any) => calcAdSpend(row)}
                            />
                        )}
                    </div>
                    
                    {/* Price History Panel Component */}
                    <PriceChangeHistoryPanel 
                        history={priceChangeHistory} 
                        sku={product.sku}
                        windowStart={startKey} // Passed for potential future filtering
                        windowEnd={endKey}     // Passed for potential future filtering
                        themeColor={themeColor}
                    />

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
                            <div className="text-xl font-bold text-orange-700">{formatMoney(ledgerStats.adOnlySpend)}</div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-500 uppercase font-bold">Refunds (Detected)</span>
                            <div className="text-xl font-bold text-red-700 flex items-center gap-1">
                                {ledgerStats.refundCount}
                                {ledgerStats.refundValue > 0 && <span className="text-sm font-medium opacity-70">(-{formatMoney(ledgerStats.refundValue, 0)})</span>}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in">
                        <div className="p-3 bg-gray-50/50 border-b border-gray-100">
                            <h4 className="text-xs font-bold text-gray-500 uppercase">Platform Subtotals (for period)</h4>
                        </div>
                        <div className="divide-y divide-gray-100">
                            {platformSubtotals.map(sub => (
                                <div key={sub.platform} className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50">
                                    <span className="font-bold text-sm text-gray-800 w-1/5">{sub.platform}</span>
                                    <div className="flex items-center justify-end gap-4 text-xs w-4/5">
                                        <div className="text-right w-20">
                                            <div className="text-gray-400">Qty Sold</div>
                                            <div className="font-mono font-bold text-gray-700">{formatNumber(sub.soldQty)}</div>
                                        </div>
                                        <div className="text-right w-24">
                                            <div className="text-gray-400">Ad Spend</div>
                                            <div className="font-mono font-bold text-orange-600">{formatMoney(sub.adSpend)}</div>
                                        </div>
                                        <div className="text-right w-24">
                                            <div className="text-gray-400">Revenue</div>
                                            <div className="font-mono font-bold text-indigo-600">{formatMoney(sub.revenue)}</div>
                                        </div>
                                        <div className="text-right w-20">
                                            <div className="text-gray-400">Sales Share %</div>
                                            <div className="font-mono font-bold text-gray-700">
                                                {'>'} {formatPct(sub.revenueSharePct, 1)}
                                            </div>
                                        </div>
                                        <div className="text-right w-24">
                                            <div className="text-gray-400">Profit</div>
                                            <div className={`font-mono font-bold ${sub.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                                {formatMoney(sub.profit)}
                                            </div>
                                        </div>
                                        <div className="text-right w-20">
                                            <div className="text-gray-400">Margin %</div>
                                            <div className={`font-mono font-bold ${sub.margin !== null && sub.margin >= thresholds.marginBelowTargetPct ? 'text-green-600' : sub.margin !== null && sub.margin >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
                                                {formatPct(sub.margin)}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {platformSubtotals.length === 0 && (
                                <div className="p-4 text-center text-gray-400 text-xs italic">No sales data for this period.</div>
                            )}
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
                                {paginatedTransactions.map((tx: any, idx: number) => {
                                    const isRefund = tx._type === 'REFUND_LOG' || tx.velocity < 0;
                                    const isAdRow = tx.price === 0 && (tx.adsSpend || 0) > 0 && !isRefund;
                                    const isZeroRev = Math.abs(tx.price * tx.velocity) < 0.01 && !isAdRow && !isRefund;
                                    const margin = marginPct(calcProfit(tx), calcRevenue(tx));

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
                                                    {isRefund && tx.reason && (
                                                        <span className="text-[9px] text-red-500 mt-0.5 max-w-[120px] truncate">{tx.reason}</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="p-3 text-right font-medium">
                                                {isAdRow ? <span className="text-xs text-orange-600 font-bold">Ad Cost</span> : formatMoney(tx.price)}
                                            </td>
                                            <td className="p-3 text-right font-bold opacity-90">{formatNumber(tx.velocity)}</td>
                                            <td className={`p-3 text-right ${isZeroRev ? 'text-gray-400 italic' : isRefund ? 'text-red-600' : 'text-indigo-600'}`}>
                                                {formatMoney(tx.price * tx.velocity)}
                                            </td>
                                            <td className="p-3 text-right text-orange-600 font-medium">
                                                {(tx.adsSpend || 0) > 0 ? formatMoney(tx.adsSpend) : '-'}
                                            </td>
                                            <td className={`p-3 text-right font-bold ${(margin || 0) < 10 && margin !== null ? 'text-red-600' : 'text-green-600'}`}>
                                                {!isAdRow && !isRefund ? formatPct(margin) : isAdRow ? '—' : '-'}
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
