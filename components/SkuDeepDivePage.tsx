
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Package, Tag, Layers, DollarSign, Box, ArrowLeft, Warehouse, Ship, AlertTriangle, RotateCcw, Megaphone, TrendingDown, TrendingUp, Activity, BarChart2, Calendar, Filter, Search, Info, HelpCircle, CheckCircle, XCircle, LayoutGrid, Rows, Bookmark, History, FileText, MessageSquare, Smile, Frown, Meh, Brain, Sparkles, CloudOff, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ExternalLink, Hash, Clock } from 'lucide-react';
import { Product, PriceLog, PriceChangeRecord, RefundLog, ReturnDateBasis } from '../types';
import { ResponsiveContainer, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ScatterChart, Scatter, ZAxis, ReferenceLine, ReferenceArea, ComposedChart, Bar, BarChart, Cell, PieChart, Pie } from 'recharts';
import { ThresholdConfig } from '../services/thresholdsConfig';
import { GradeBadge } from './GradeBadge';
import { calcProfit, calcRevenue, calcUnits, calcAdSpend, marginPct, calcTACoSPct } from '../services/metrics';
import { buildWindow } from '../services/dateWindow';
import { asDateKey, isDateKeyBetween, getTodayKeyMelbourne, getReturnDateKey } from '../services/dateUtils';
import AuditPanel from './AuditPanel';
import { formatMoney, formatPct, formatNumber } from '../utils/format';
import { VAT_MULTIPLIER } from '../constants';
import { PriceChangeHistoryPanel } from './strategy/PriceChangeHistoryPanel';
import { createPortal } from 'react-dom';
import { buildRefundOverview } from '../services/refundAgg';
import ReturnsReasonTimelineChart from './skuDeepDive/returns/ReturnsReasonTimelineChart';
import { parseReturnsReason } from '../services/returnsReasonCodes';
import { SortableHeader } from './common/SortableHeader';
import { sortRows, SortState } from '../utils/tableSort';
import { aggregateRefundKeywords } from '../services/refundTextAgg';

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

// --- KEYWORD CLOUD COMPONENT ---
const KeywordCloud = ({ items }: { items: { text: string; value: number }[] }) => {
    const [highlightedWord, setHighlightedWord] = useState<string | null>(null);
    const [showAll, setshowAll] = useState(false);

    const displayedItems = useMemo(() => {
        return showAll ? items.slice(0, 40) : items.slice(0, 20);
    }, [items, showAll]);

    const { minVal, maxVal } = useMemo(() => {
        if (items.length === 0) return { minVal: 0, maxVal: 0 };
        const values = items.map(i => i.value);
        return { minVal: Math.min(...values), maxVal: Math.max(...values) };
    }, [items]);

    if (items.length === 0) {
        return <div className="py-8 text-center text-xs text-gray-400 italic">No significant keywords found for this selection.</div>;
    }

    const getStyles = (val: number, text: string) => {
        const range = maxVal - minVal || 1;
        const normalized = (val - minVal) / range;
        
        const fontSize = 11 + normalized * 17; // Slightly smaller base for better density (11px to 28px)
        const opacity = 0.5 + normalized * 0.5; 
        const isHighlighted = highlightedWord === text;
        const hasSelection = highlightedWord !== null;

        const color = normalized > 0.7 ? '#4f46e5' : normalized > 0.4 ? '#6366f1' : '#64748b';

        return {
            fontSize: `${fontSize}px`,
            opacity: hasSelection ? (isHighlighted ? 1 : 0.2) : opacity,
            fontWeight: fontSize >= 18 ? 700 : 500,
            color: isHighlighted ? '#1e1b4b' : color,
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isHighlighted ? 'scale(1.1)' : 'scale(1)',
            zIndex: isHighlighted ? 10 : 1,
            lineHeight: '1.2',
            margin: '1px 3px'
        };
    };

    return (
        <div className="flex flex-col">
            <div 
                className="flex flex-wrap gap-x-1 gap-y-1 justify-center items-center overflow-hidden transition-all duration-500 relative min-h-[100px] px-2"
                style={{ maxHeight: showAll ? 'none' : '200px' }}
            >
                {displayedItems.map((w, i) => (
                    <span 
                        key={i} 
                        className="cursor-pointer select-none py-0.5 px-1 hover:text-indigo-900 inline-block text-center"
                        style={getStyles(w.value, w.text)}
                        title={`${w.value} occurrences`}
                        onClick={() => setHighlightedWord(highlightedWord === w.text ? null : w.text)}
                    >
                        {w.text}
                    </span>
                ))}
            </div>
            
            {items.length > 20 && (
                <button 
                    onClick={() => setshowAll(!showAll)}
                    className="mt-5 flex items-center gap-1 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 self-center uppercase tracking-widest bg-indigo-50/50 hover:bg-indigo-100 px-3 py-1.5 rounded-full border border-indigo-100/50 transition-all shadow-sm"
                >
                    {showAll ? <><ChevronUp className="w-3 h-3"/> Show Less</> : <><ChevronDown className="w-3 h-3"/> Show All Keywords ({items.length})</>}
                </button>
            )}
        </div>
    );
};

// Helper to read URL params
const getActiveSectionFromUrl = () => {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    return params.get('section');
};

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


const BoxPlot = ({ title, stats7, stats30, stats90, format, color = '#6366f1', adOnly7, layout = 'horizontal', showAdOnlyFooter = false, setTooltip, tooltip }: any) => {
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
            return y + ((getValInRange(q3, 0.0001) - value) / (getValInRange(iqrRange, 0.0001))) * iqrHeight;
        };

        const getValInRange = (val: number, min: number) => val === 0 ? min : val;
        
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
            <text x={0} y={0} dy={16} textAnchor="middle" fill="#666" fontSize={10} fontWeight="500" style={{ userSelect: 'none' }}>
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
            { name: '7 Days', ...(stats7 || {}) },
            { name: '30 Days', ...(stats30 || {}) },
            { name: '90 Days', ...(stats90 || {}) },
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
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
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
                        <span className="text-[10px] font-medium text-gray-500">{label} (n={stats.n})</span>
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
                    <span className="text-gray-700 font-medium bg-white px-1 rounded shadow-sm border border-gray-100">{format(stats.median)}</span>
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
                {renderBar(stats7, '7 Days', stats90?.median)}
                {renderBar(stats30, '30 Days', stats90?.median)}
                {renderBar(stats90, '90 Days')}
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

    // Available Reason Codes for Filtering (Task C)
    const availableReasonCodes = useMemo(() => {
        const codes = new Set<string>();
        refunds.forEach(r => {
            const { short } = parseReturnsReason(r.platformReason || r.reason);
            if (short && short !== 'UNK') codes.add(short);
        });
        return Array.from(codes).sort();
    }, [refunds]);

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
        // Note: Summary stats use default refund date aggregation logic internally unless we pass dateBasis options. 
        // For general stats like counts and keyword clouds, this is fine. 
        // The Chart uses specific date basis explicitly.
        const overview = buildRefundOverview(refunds);
        
        // Separate totals for display
        const totalFreight = refunds.reduce((sum, r) => sum + (Number(r.freightAmount || 0)), 0);
        const resendCount = refunds.filter(r => r.orderType === 'resend').length;
        const refundCount = refunds.filter(r => r.orderType === 'refund' || !r.orderType).length;

        // Filter refunds based on selection (Task C)
        const filteredRefundsForKeywords = kwMode === 'Reason' && kwReason 
            ? refunds.filter(r => parseReturnsReason(r.platformReason || r.reason).short === kwReason)
            : refunds;

        // --- KEYWORD EXTRACTION CONSTANTS ---
        const TOP_N = 60;
        const STOPWORDS = new Set([
            "the","and","for","with","from","this","that","have","has","was","were","are","but","not","you","your","they","them",
            "item","order","return","refund","customer","issue","problem","received","delivery","courier","seller","platform",
            "like","wrong","asked","sent","transit","lost","address","described","broken","quality","change","mind",
            "because", "did", "had", "can", "into", "been", "will", "would", "about", "there", "what", "which", "their", "when",
            "one", "two", "also", "some", "other", "than", "then", "just", "could", "should", "very", "more", "most", "only",
            "any", "been", "being", "here", "it", "its", "me", "my", "our", "she", "so", "than", "these", "up", "very", "we", "who"
        ]);
        const NOISE_WORDS = new Set(["http", "https", "www", "com", "dropbox", "jpg", "jpeg", "png", "webp", "pdf", "httpswww", "html", "php", "scl", "rlkey"]);
        const NOISE_PATTERN = /\d/; // Block words containing digits (SKUs, IDs, Dates)

        // Word frequency computation (Local only)
        const wordMap = new Map<string, number>();
        
        // Local Sentiment Tracking
        const sentimentStats = { negative: 0, neutral: 0, positive: 0 };
        const negatives = ['broken', 'damage', 'defect', 'poor', 'bad', 'terrible', 'worst', 'awful', 'useless', 'dirty', 'rubbish', 'faulty', 'fake', 'counterfeit'];
        const positives = ['great', 'good', 'love', 'excellent', 'perfect', 'nice'];

        filteredRefundsForKeywords.forEach(r => {
             const rawText = `${r.reason || ''} ${r.customerReason || ''} ${r.remarks || ''} ${r.comments || ''}`.toLowerCase();
             
             // --- Word Cloud Calc with Normalization Pipeline ---
             const words = rawText.split(/[^a-z0-9]+/);
             words.forEach(w => {
                 // 1. Garbage Filter: Numeric check & IDs
                 if (NOISE_PATTERN.test(w)) return;
                 // 2. Length Filter: Regular words title usually > 3 chars
                 if (w.length < 4 || w.length >= 18) return;
                 // 3. Stopword & Noise Filter
                 if (STOPWORDS.has(w) || NOISE_WORDS.has(w)) return;
                 
                 wordMap.set(w, (wordMap.get(w) || 0) + 1);
             });

             // Sentiment Calc
             let score = 0;
             negatives.forEach(w => { if (rawText.includes(w)) score--; });
             positives.forEach(w => { if (rawText.includes(w)) score++; });

             if (score < 0) sentimentStats.negative++;
             else if (score > 0) sentimentStats.positive++;
             else sentimentStats.neutral++;
        });
        
        const topWords = Array.from(wordMap.entries())
             .sort((a, b) => b[1] - a[1])
             .slice(0, TOP_N)
             .map(([text, value]) => ({ text, value }));
             
        return {
            overview,
            topWords,
            sentimentStats,
            totalFreight,
            resendCount,
            refundCount
        };
    }, [refunds, kwMode, kwReason]);

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
                
                // @ts-ignore
                const isSale = t._type !== 'REFUND_LOG' && t.price > 0 && t.velocity > 0;
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
                // t.price is raw (Ex-VAT) now. Scale it for deviation check vs Ref Price.
                const scaledPrice = t.price * VAT_MULTIPLIER;
                const rawDelta = scaledPrice - effectiveRef;
                const band = (Math.round(rawDelta / BAND_SIZE) * BAND_SIZE).toFixed(2);
                
                if (!groups[band]) groups[band] = { totalQty: 0, totalRev: 0, sumDelta: 0, sumPrice: 0 };
                groups[band].totalQty += t.velocity;
                groups[band].totalRev += (scaledPrice * t.velocity);
                groups[band].sumDelta += (rawDelta * t.velocity);
                groups[band].sumPrice += (scaledPrice * t.velocity);

                totalPeriodQty += t.velocity;
                totalPeriodDelta += (rawDelta * t.velocity);

                if (bucket.days === 90) {
                    const p = Number(scaledPrice.toFixed(2));
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
            const rev = t.price * t.velocity * VAT_MULTIPLIER;
            if (t.velocity > 0) {
                salesRows++;
                totalUnits += t.velocity;
            } else if (t.price === 0 && (t.adsSpend || 0) > 0) {
                adOnlySpend += ((t.adsSpend || 0) * VAT_MULTIPLIER);
            } else if (t.velocity < 0 || t.price < 0) {
                refundCount++;
                // t.profit for refund type items in sortedTransactions is -((amount + freightAmount)).
                // Scale once here.
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
                            <span className="text-[10px] font-medium text-gray-400 uppercase mr-1 hidden sm:block select-none">Quick Access:</span>
                            <button onClick={() => scrollTo(analysisRef)} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-sm transition-all flex items-center gap-1.5">
                                <BarChart2 className="w-3.5 h-3.5" /> Distribution
                            </button>
                            <button onClick={() => scrollTo(pricingRef)} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-sm transition-all flex items-center gap-1.5">
                                <History className="w-3.5 h-3.5" /> Pricing
                            </button>
                             <button onClick={() => scrollTo(ledgerRef)} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-sm transition-all flex items-center gap-1.5">
                                <FileText className="w-3.5 h-3.5" /> Ledger
                            </button>
                            <button onClick={() => scrollTo(refundsRef)} className="px-3 py-1.5 bg-white border border-gray-200 rounded-lg text-xs font-medium text-gray-600 hover:border-indigo-300 hover:text-indigo-600 hover:shadow-sm transition-all flex items-center gap-1.5">
                                <RotateCcw className="w-3.5 h-3.5" /> Refunds
                            </button>
                        </div>
                    )}
                </div>

                <div className="flex flex-col xl:flex-row gap-8">
                    <div className="flex-1 min-0 flex gap-6">
                        {product.imageUrl && (
                            <div className="w-[120px] h-[120px] flex-shrink-0 rounded-xl overflow-hidden bg-white shadow-sm">
                                <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain" />
                            </div>
                        )}
                        <div className="flex-1 min-0">
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
                    </div>

                    <div className="flex-shrink-0 w-full xl:w-[600px]">
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            
                            <div className="space-y-1">
                                <span className="text-[10px] font-medium text-gray-400 uppercase flex items-center gap-1">
                                    <Activity className="w-3 h-3"/> Velocity
                                </span>
                                <div className="text-xl font-bold text-gray-900">
                                    {formatNumber(product.averageDailySales, 1)} <span className="text-xs font-normal text-gray-400">/day</span>
                                </div>
                            </div>

                            <div className="space-y-1">
                                <span className="text-[10px] font-medium text-gray-400 uppercase flex items-center gap-1">
                                    <Warehouse className="w-3 h-3"/> On Hand
                                </span>
                                <div className="text-xl font-bold text-gray-900">
                                    {formatNumber(product.stockLevel)} <span className="text-xs font-normal text-gray-400">units</span>
                                </div>
                            </div>

                            {/* INBOUND TOOLTIP */}
                            <div className="space-y-1 group relative cursor-help">
                                <span className="text-[10px] font-medium text-gray-400 uppercase flex items-center gap-1">
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
                                <span className="text-[10px] font-medium text-gray-400 uppercase flex items-center gap-1">
                                    <Box className="w-3 h-3"/> Lifetime Qty
                                </span>
                                <div className="text-xl font-bold text-gray-900">
                                    {formatNumber(allTimeQty)}
                                </div>
                            </div>

                            {/* Row 2 - Summary Statistics */}
                            <div className="col-span-2 sm:col-span-1 p-3 bg-white/60 rounded-xl border border-gray-200">
                                <span className="text-[10px] font-medium text-gray-400 uppercase block mb-1">CA Reference Price</span>
                                <div className="text-lg font-bold text-purple-600 font-mono">
                                    {formatMoney(product.caPrice)}
                                </div>
                            </div>

                            <div className="col-span-2 sm:col-span-1 p-3 bg-white/60 rounded-xl border border-gray-200">
                                <span className="text-[10px] font-medium text-gray-400 uppercase block mb-1">All-Time Sales</span>
                                <div className="text-lg font-bold text-gray-900">
                                    {formatMoney(allTimeSales, 0)}
                                </div>
                            </div>

                            <div className="col-span-2 sm:col-span-1 p-3 bg-white/60 rounded-xl border border-gray-200 group relative cursor-help">
                                <span className="text-[10px] font-medium text-gray-400 uppercase block mb-1">Lifetime Net Margin</span>
                                <div className={`text-lg font-bold ${allTimeMarginStats.pct >= 15 ? 'text-green-600' : allTimeMarginStats.pct > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {formatPct(allTimeMarginStats.pct, 1)}
                                </div>
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                                    <div className="font-bold border-b border-gray-700 pb-1 mb-2">Calculation Detail (Inc VAT)</div>
                                    <div className="space-y-1 font-mono">
                                        <div className="flex justify-between"><span>Gross Sales:</span><span>{formatMoney(allTimeMarginStats.grossSales, 0)}</span></div>
                                        <div className="flex justify-between text-green-400"><span>Tx Profit:</span><span>{formatMoney(allTimeMarginStats.rawProfit, 0)}</span></div>
                                        <div className="flex justify-between text-red-400"><span>Refunds:</span><span>-{formatMoney(allTimeMarginStats.refundVal, 0)}</span></div>
                                        <div className="border-t border-gray-700 pt-1 mt-1 flex justify-between font-bold"><span>Net Profit:</span><span>{formatMoney(allTimeMarginStats.netProfit, 0)}</span></div>
                                        <div className="flex justify-between font-bold"><span>Net Sales:</span><span>{formatMoney(allTimeMarginStats.netSales, 0)}</span></div>
                                        <div className="border-t border-gray-700 pt-1 mt-1 text-center text-gray-400 italic">
                                            (Net Profit / Net Sales) * 100
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Return & Refund Stats - Stacked for column economy */}
                            <div className="col-span-2 sm:col-span-1 p-3 bg-white/60 rounded-xl border border-gray-200 flex flex-col justify-between">
                                <div className="flex flex-col gap-1">
                                    <div className="flex justify-between items-center group relative cursor-help">
                                        <span className="text-[9px] text-gray-500 font-medium">Return QTY %</span>
                                        <span className={`text-sm font-bold ${allTimeReturnStats.returnRate > thresholds.returnRatePct ? 'text-red-600' : 'text-gray-900'}`}>
                                            {formatPct(allTimeReturnStats.returnRate)}
                                        </span>
                                        {/* Tooltip for Qty% */}
                                        <div className="absolute bottom-full right-0 mb-2 w-56 p-3 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                                            <div className="font-bold border-b border-gray-700 pb-1 mb-2">Return Qty Math</div>
                                            <div className="space-y-1 font-mono text-right">
                                                <div className="flex justify-between"><span>Total Returns:</span><span>{formatNumber(allTimeReturnStats.totalRefundQty)}</span></div>
                                                <div className="flex justify-between"><span>Lifetime Sold:</span><span>{formatNumber(allTimeQty)}</span></div>
                                                <div className="border-t border-gray-700 pt-1 mt-1 text-center text-gray-400 italic">
                                                    (Returns / Sales) * 100
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex justify-between items-center border-t border-gray-100 pt-1 group relative cursor-help">
                                        <span className="text-[9px] text-gray-500 font-medium">Return AMT %</span>
                                        <span className="text-sm font-bold text-gray-900">
                                            {formatPct(allTimeReturnStats.refundRate)}
                                        </span>
                                        {/* Tooltip for Amt% */}
                                        <div className="absolute bottom-full right-0 mb-2 w-56 p-3 bg-gray-900 text-white text-[10px] rounded-lg shadow-xl opacity-0 group-hover:opacity-100 transition-opacity z-50 pointer-events-none">
                                            <div className="font-bold border-b border-gray-700 pb-1 mb-2">Return Value Math (Inc VAT)</div>
                                            <div className="space-y-1 font-mono text-right">
                                                <div className="flex justify-between"><span>Total Returns Val:</span><span>{formatMoney(allTimeReturnStats.totalRefundVal, 0)}</span></div>
                                                <div className="flex justify-between"><span>Lifetime Gross:</span><span>{formatMoney(allTimeSales, 0)}</span></div>
                                                <div className="border-t border-gray-700 pt-1 mt-1 text-center text-gray-400 italic">
                                                    (Returns Val / Gross Sales) * 100
                                                </div>
                                            </div>
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
                                className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${signal.color} shadow-sm group relative cursor-help transition-all duration-500 hover:scale-105 ${signal.id === focus ? 'ring-2 ring-offset-2 ring-indigo-50? scale-105 bg-opacity-100' : ''}`}
                            >
                                <div className="p-1.5 bg-white/50 rounded-md">
                                    <signal.icon className="w-4 h-4" />
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-[10px] font-medium uppercase opacity-70 tracking-wide">{signal.severity} Priority</span>
                                    <span className="text-sm font-medium leading-tight">{signal.label}</span>
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
                            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded ml-2">Performance Distributions</span>
                        </h3>
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button 
                                onClick={() => setChartLayout('horizontal')}
                                className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 ${chartLayout === 'horizontal' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
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
                                stats7={analytics.revenue.d7} 
                                stats30={analytics.revenue.d30} 
                                stats90={analytics.revenue.d90}
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
                                stats7={analytics.margin.d7} 
                                stats30={analytics.margin.d30} 
                                stats90={analytics.margin.d90}
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
                                stats7={analytics.qty.d7} 
                                stats30={analytics.qty.d30} 
                                stats90={analytics.qty.d90}
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
                                stats7={analytics.tacos.d7}
                                stats30={analytics.tacos.d30} 
                                stats90={analytics.tacos.d90}
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
                                        <span className="font-medium text-gray-900 bg-white px-2 py-0.5 rounded shadow-sm border border-gray-200">{hoveredBubble.period}</span>
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

                        <PriceChangeHistoryPanel 
                            history={priceChangeHistory} 
                            sku={product.sku}
                            windowStart={startKey}
                            windowEnd={endKey}
                            themeColor={themeColor}
                        />
                    </div>

                    <div className="space-y-4">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Tag className="w-5 h-5 text-purple-600" />
                            Price Points (90d)
                        </h3>
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden h-[400px] overflow-y-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100 sticky top-0">
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
                                                            <span className="text-[9px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded border border-amber-200 font-medium uppercase tracking-wide flex items-center gap-1">
                                                                <TrendingDown className="w-2.5 h-2.5" /> Lowest
                                                            </span>
                                                        )}
                                                        {isHighest && (
                                                            <span className="text-[9px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded border border-indigo-100 font-medium uppercase tracking-wide flex items-center gap-1">
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
                                    className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium border transition-all shadow-sm text-xs ${isAuditPanelVisible ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
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
                    
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 shadow-sm text-sm">
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-500 uppercase font-medium">Sales Rows</span>
                            <div className="text-xl font-bold text-gray-800">{ledgerStats.salesRows}</div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-500 uppercase font-medium">Total Units</span>
                            <div className="text-xl font-bold text-green-700">{ledgerStats.totalUnits}</div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-500 uppercase font-medium flex items-center gap-1">
                                Ad-Only Spend 
                                <span title="Includes daily PPC costs not attributed to specific orders. Pooled into total TACoS.">
                                    <Info className="w-3 h-3 text-gray-400" />
                                </span>
                            </span>
                            <div className="text-xl font-bold text-orange-700">{formatMoney(ledgerStats.adOnlySpend)}</div>
                        </div>
                        <div className="flex flex-col">
                            <span className="text-xs text-gray-500 uppercase font-medium">Refunds (Detected)</span>
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
                                <div className="p-4 text-center text-gray-400 text-xs italic">No breakdown available.</div>
                            )}
                        </div>
                    </div>

                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto border rounded-lg">
                            <table className="w-full text-sm text-left whitespace-nowrap">
                                <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
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
                                                    {isAdRow ? <span className="text-xs text-orange-600 font-bold">Ad Cost</span> : formatMoney(tx.price * VAT_MULTIPLIER)}
                                                </td>
                                                <td className="p-3 text-right font-bold opacity-90">{formatNumber(tx.velocity)}</td>
                                                <td className={`p-3 text-right ${isZeroRev ? 'text-gray-400 italic' : isRefund ? 'text-red-600' : 'text-indigo-600'}`}>
                                                    {formatMoney(tx.price * tx.velocity * VAT_MULTIPLIER)}
                                                </td>
                                                <td className="p-3 text-right text-orange-600 font-medium">
                                                    {(tx.adsSpend || 0) > 0 ? formatMoney(tx.adsSpend * VAT_MULTIPLIER) : '-'}
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
                        </div>
                        {filteredTransactions.length >= txLimit && (
                            <div className="p-3 text-center border-t border-gray-100">
                                <button onClick={() => setTxLimit(prev => prev + 50)} className="text-xs text-indigo-600 font-medium hover:underline">
                                    Load More ({filteredTransactions.length - txLimit} remaining)
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            )}
            
            <div ref={refundsRef} className="space-y-6">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-2">
                        <div className="p-2 bg-red-50 text-red-600 rounded-lg"><RotateCcw className="w-5 h-5" /></div>
                        <h3 className="text-lg font-bold text-gray-900">Returns Analysis</h3>
                    </div>
                    
                    <div className="flex items-center gap-4">
                        {/* RETURN DATE BASIS TOGGLE */}
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button 
                                onClick={() => setReturnDateBasis('refundDate')} 
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${returnDateBasis === 'refundDate' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Clock className="w-3 h-3" />
                                Refund Date
                            </button>
                            <button 
                                onClick={() => setReturnDateBasis('orderDate')} 
                                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${returnDateBasis === 'orderDate' ? 'bg-white shadow text-indigo-700' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Calendar className="w-3 h-3" />
                                Order Date
                            </button>
                        </div>

                        <label className="text-xs font-medium text-gray-500 uppercase flex items-center gap-1 cursor-pointer">
                            <Brain className={`w-4 h-4 ${showAiInsights ? 'text-purple-600' : 'text-gray-400'}`} />
                            AI Insights
                            <div className="relative inline-block w-10 h-5 align-middle select-none transition duration-200 ease-in ml-2">
                                <input 
                                    type="checkbox" 
                                    name="toggle" 
                                    id="ai-toggle" 
                                    className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                    checked={showAiInsights}
                                    onChange={() => setShowAiInsights(!showAiInsights)}
                                    style={{ right: showAiInsights ? 0 : 'auto', left: showAiInsights ? 'auto' : 0, borderColor: showAiInsights ? '#8b5cf6' : '#d1d5db' }}
                                />
                                <label 
                                    htmlFor="ai-toggle" 
                                    className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${showAiInsights ? 'bg-purple-600' : 'bg-gray-300'}`}
                                ></label>
                            </div>
                        </label>
                    </div>
                </div>

                {refundAnalysis ? (
                    <div className="space-y-6">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {/* Timeline & Summary Cards */}
                            <div className="lg:col-span-2 space-y-6">
                                 {/* High-Level Breakdown (VAT Inclusive) */}
                                 <div className="grid grid-cols-4 gap-4">
                                    <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                                        <span className="text-[10px] font-bold text-red-600 uppercase block mb-1">Total Refunds</span>
                                        <div className="text-xl font-bold text-red-800">{refundAnalysis.refundCount} cases</div>
                                    </div>
                                    <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                                        <span className="text-[10px] font-bold text-orange-600 uppercase block mb-1">Resends</span>
                                        <div className="text-xl font-bold text-orange-800">{refundAnalysis.resendCount} cases</div>
                                    </div>
                                    <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 col-span-2">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] font-bold text-gray-500 uppercase">Total Freight Refunded (Inc VAT)</span>
                                        </div>
                                        <div className="text-xl font-bold text-gray-700">{formatMoney(refundAnalysis.totalFreight * VAT_MULTIPLIER)}</div>
                                    </div>
                                 </div>

                                 <ReturnsReasonTimelineChart 
                                    data={refunds}
                                    getDate={(r) => getReturnDateKey(r, returnDateBasis, orderDateMap)}
                                    getReason={(r) => r.platformReason || r.reason}
                                    title={`Refund Timeline (${returnDateBasis === 'orderDate' ? 'By Order Date' : 'By Refund Date'})`}
                                 />
                            </div>

                            <div className="space-y-6">
                                 {/* Top Reasons */}
                                 <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm flex flex-col h-[250px]">
                                     <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-amber-500" /> Top Reasons</h4>
                                     <div className="flex-1 overflow-auto pr-1">
                                         <div className="space-y-2">
                                             {refundAnalysis.overview.reasonRows.slice(0, 5).map((r, i) => (
                                                 <div key={i} className="flex justify-between items-center text-xs p-2 bg-gray-50 rounded border border-gray-100">
                                                     <span className="font-medium text-gray-700 truncate max-w-[150px]" title={r.reason}>{r.reason}</span>
                                                     <div className="text-right">
                                                         <div className="font-bold text-red-600">{r.count}</div>
                                                         <div className="text-[10px] text-gray-400">{formatMoney(r.value, 0)}</div>
                                                     </div>
                                                 </div>
                                             ))}
                                         </div>
                                     </div>
                                 </div>
                                 
                                 {/* AI Insights / Sentiment Panel */}
                                 {showAiInsights ? (
                                    <div className="bg-purple-50 p-5 rounded-xl border border-purple-200 shadow-sm animate-in fade-in zoom-in duration-300">
                                        <div className="flex items-center gap-2 mb-3 border-b border-purple-200 pb-2">
                                            <span className="p-1 bg-white rounded-lg">
                                                <Sparkles className="w-4 h-4 text-purple-600" />
                                            </span>
                                            <h4 className="text-xs font-bold text-purple-800 uppercase">AI Sentiment Summary</h4>
                                        </div>
                                        <div className="flex flex-col items-center justify-center py-6 text-center text-purple-700 gap-2">
                                            <CloudOff className="w-8 h-8 opacity-50" />
                                            <p className="text-xs font-medium">Cloud AI analysis disabled.</p>
                                            <p className="text-[10px] opacity-70">Enable API key to unlock deep sentiment analysis.</p>
                                        </div>
                                    </div>
                                 ) : (
                                    <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm animate-in fade-in">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase mb-4 flex items-center gap-2"><Smile className="w-3 h-3 text-purple-500" /> Sentiment (Local)</h4>
                                        
                                        <div className="space-y-3">
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="w-16 text-gray-500">Negative</span>
                                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-red-400" style={{ width: `${(refundAnalysis.sentimentStats.negative / (refunds.length || 1)) * 100}%` }}></div>
                                                </div>
                                                <span className="text-red-600 font-bold">{refundAnalysis.sentimentStats.negative}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="w-16 text-gray-500">Neutral</span>
                                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-gray-400" style={{ width: `${(refundAnalysis.sentimentStats.neutral / (refunds.length || 1)) * 100}%` }}></div>
                                                </div>
                                                <span className="text-gray-600 font-bold">{refundAnalysis.sentimentStats.neutral}</span>
                                            </div>
                                            <div className="flex items-center gap-2 text-xs">
                                                <span className="w-16 text-gray-500">Positive</span>
                                                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-green-400" style={{ width: `${(refundAnalysis.sentimentStats.positive / (refunds.length || 1)) * 100}%` }}></div>
                                                </div>
                                                <span className="text-green-600 font-bold">{refundAnalysis.sentimentStats.positive}</span>
                                            </div>
                                        </div>
                                        <p className="text-[9px] text-gray-400 mt-4 italic text-center">Based on keyword matching.</p>
                                    </div>
                                 )}

                                 {/* Word Cloud */}
                                 <div className="bg-white p-5 rounded-xl border border-gray-200 shadow-sm">
                                     <div className="flex justify-between items-center mb-4">
                                         <h4 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                                             <MessageSquare className="w-3 h-3 text-blue-500" /> Keyword Cloud
                                         </h4>
                                         <div className="flex bg-gray-100 p-0.5 rounded-lg">
                                             <button 
                                                 onClick={() => setKwMode('All')} 
                                                 className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${kwMode === 'All' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}
                                             >
                                                 All
                                             </button>
                                             <button 
                                                 onClick={() => setKwMode('Reason')} 
                                                 className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${kwMode === 'Reason' ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-indigo-600'}`}
                                             >
                                                 By Reason
                                             </button>
                                         </div>
                                     </div>
                                     {kwMode === 'Reason' && availableReasonCodes.length > 0 && (
                                         <div className="mb-5 flex flex-wrap gap-1 border-b border-gray-100 pb-3 animate-in fade-in slide-in-from-top-1">
                                             {availableReasonCodes.map(code => (
                                                 <button 
                                                     key={code} 
                                                     onClick={() => setKwReason(kwReason === code ? null : code)}
                                                     className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${kwReason === code ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200 hover:border-indigo-300'}`}
                                                 >
                                                     {code}
                                                 </button>
                                             ))}
                                         </div>
                                     )}
                                     <div className="mt-2">
                                        <KeywordCloud items={refundAnalysis.topWords} />
                                     </div>
                                 </div>
                            </div>
                        </div>

                        {/* Refund Detail Table - Extended full width */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col animate-in fade-in">
                            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex justify-between items-center">
                                <h4 className="font-bold text-gray-800 text-sm uppercase flex items-center gap-2">
                                    <Hash className="w-4 h-4 text-red-500" />
                                    Refund Return Records (Full History)
                                </h4>
                                <span className="text-[10px] text-gray-400 font-bold uppercase italic">* Aligned with chart history</span>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100 sticky top-0 z-10 whitespace-nowrap">
                                        <tr>
                                            <SortableHeader label="Date" sortKey="date" sort={refundSort} onChange={setRefundSort} themeColor={themeColor} />
                                            <SortableHeader label="Order ID" sortKey="orderId" sort={refundSort} onChange={setRefundSort} themeColor={themeColor} />
                                            <SortableHeader label="Platform" sortKey="platform" sort={refundSort} onChange={setRefundSort} themeColor={themeColor} />
                                            <SortableHeader label="Qty" sortKey="quantity" sort={refundSort} onChange={setRefundSort} themeColor={themeColor} align="right" />
                                            <SortableHeader label="Amount" sortKey="amount" sort={refundSort} onChange={setRefundSort} themeColor={themeColor} align="right" />
                                            <SortableHeader label="Reason" sortKey="reason" sort={refundSort} onChange={setRefundSort} themeColor={themeColor} />
                                            <th className="p-3 text-right">Comments</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-50">
                                        {paginatedRefunds.length > 0 ? (
                                            paginatedRefunds.map((r, i) => {
                                                const reasonMeta = parseReturnsReason(r.platformReason || r.reason);
                                                // Value stored is Ex-VAT, display Inc-VAT. Include freight here for total transaction value.
                                                const displayAmount = (Number(r.amount || 0) + Number(r.freightAmount || 0)) * VAT_MULTIPLIER;
                                                
                                                // Determine Date to show based on basis
                                                const displayDateKey = getReturnDateKey(r, returnDateBasis, orderDateMap);
                                                const isFallbackDate = returnDateBasis === 'orderDate' && !displayDateKey && r.date;
                                                
                                                return (
                                                    <tr key={r.id || i} className="hover:bg-gray-50/80 transition-colors">
                                                        <td className="p-3 font-mono opacity-80 whitespace-nowrap">
                                                            {displayDateKey ? new Date(displayDateKey).toLocaleDateString('en-GB') : (r.date ? new Date(r.date).toLocaleDateString('en-GB') : '-')}
                                                            {isFallbackDate && <span className="text-red-400 ml-1 text-[9px] font-bold" title="Order date unavailable, using refund date">*</span>}
                                                        </td>
                                                        <td className="p-3 font-mono font-medium text-indigo-600 whitespace-nowrap">
                                                            {r.orderId ? (
                                                                <span className="flex items-center gap-1">
                                                                    {r.orderId}
                                                                    <ExternalLink className="w-2.5 h-2.5 opacity-30" />
                                                                </span>
                                                            ) : '—'}
                                                        </td>
                                                        <td className="p-3 whitespace-nowrap">
                                                            <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200 text-[10px] font-bold">
                                                                {r.platform || 'Unknown'}
                                                            </span>
                                                        </td>
                                                        <td className="p-3 text-right font-bold text-gray-900 whitespace-nowrap">{r.quantity}</td>
                                                        <td className="p-3 text-right font-bold text-red-600 whitespace-nowrap">{formatMoney(displayAmount)}</td>
                                                        <td className="p-3 whitespace-normal min-w-[150px]">
                                                            <div className="flex flex-col">
                                                                <span className="font-bold text-gray-700">{reasonMeta.short}</span>
                                                                <span className="text-[10px] text-gray-400">{reasonMeta.full}</span>
                                                            </div>
                                                        </td>
                                                        <td className="p-3 text-right text-gray-400 italic whitespace-normal min-w-[200px] break-words" title={r.commentEn || r.comments || r.customerReason}>
                                                            {r.commentEn || r.comments || r.customerReason || '—'}
                                                        </td>
                                                    </tr>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td colSpan={7} className="p-10 text-center text-gray-400 italic">No refund records found for this product.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {totalRefundPages > 1 && (
                                <div className="bg-gray-50/50 px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
                                    <span className="text-[10px] text-gray-400 font-bold uppercase">
                                        Page {refundPage} of {totalRefundPages} ({filteredRefundsForTable.length} items)
                                    </span>
                                    <div className="flex gap-1">
                                        <button 
                                            onClick={() => setRefundPage(p => Math.max(1, p - 1))} 
                                            disabled={refundPage === 1}
                                            className="p-1 border border-gray-300 rounded hover:bg-white disabled:opacity-30"
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <button 
                                            onClick={() => setRefundPage(p => Math.min(totalRefundPages, p + 1))} 
                                            disabled={refundPage === totalRefundPages}
                                            className="p-1 border border-gray-300 rounded hover:bg-white disabled:opacity-30"
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                    </div>
                                </div>
                            )}
                         </div>
                         
                         <div className="text-right text-[10px] text-gray-400 italic mt-2">
                            Refund amounts displayed VAT-inclusive. Source file stores EX-VAT.
                         </div>
                    </div>
                ) : (
                     <div className="p-10 text-center text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
                        No refund data available for this SKU.
                     </div>
                )}
            </div>
        </div>
    );
};

export default SkuDeepDivePage;
