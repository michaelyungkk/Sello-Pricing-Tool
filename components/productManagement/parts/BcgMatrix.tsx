
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, Cell } from 'recharts';
import { ProductTrendData } from '../../../services/productTrendAgg';
import { formatSmartMoney, formatNumber, formatPct } from '../../../utils/format';
import { Search, Info, Scale, DollarSign, Percent, Plus, Minus, RotateCcw, X } from 'lucide-react';

interface BcgMatrixProps {
    data: ProductTrendData[];
    onDeepDive: (sku: string) => void;
    hideLegend?: boolean;
    embedded?: boolean;
    selectedQuadrants?: QuadrantKey[];
    onToggleQuadrant?: (quadrant: QuadrantKey) => void;
}

type LimitPercent = 10 | 25 | 50 | 100;
type FilterMode = 'REVENUE' | 'BALANCED';
type XAxisMetric = 'REVENUE' | 'MARGIN';
export type QuadrantKey = 'STARS' | 'CASH_COWS' | 'QUESTIONS' | 'DOGS';

export const BcgMatrix: React.FC<BcgMatrixProps> = ({ data, onDeepDive, hideLegend = false, embedded = false, selectedQuadrants, onToggleQuadrant }) => {
    const [limitPct, setLimitPct] = useState<LimitPercent>(25); 
    const [filterMode, setFilterMode] = useState<FilterMode>('BALANCED');
    const [xAxisMetric, setXAxisMetric] = useState<XAxisMetric>('REVENUE');
    const [showMatrixInfo, setShowMatrixInfo] = useState(false);
    const [localSelectedQuadrants, setLocalSelectedQuadrants] = useState<QuadrantKey[]>([]);
    const [hoveredTableSku, setHoveredTableSku] = useState<string | null>(null);
    const [hoveredTableRow, setHoveredTableRow] = useState<any | null>(null);
    
    // Zoom & Pan State
    const [xDomain, setXDomain] = useState<[number, number] | null>(null);
    const [yDomain, setYDomain] = useState<[number, number] | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    
    // References for interaction
    const containerRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ startX: number, startY: number, startXDom: [number, number], startYDom: [number, number] } | null>(null);
    const boundsRef = useRef<{ x: [number, number], y: [number, number] } | null>(null);
    const activeQuadrants = selectedQuadrants ?? localSelectedQuadrants;

    const toggleQuadrant = (quadrant: QuadrantKey) => {
        if (onToggleQuadrant) {
            onToggleQuadrant(quadrant);
            return;
        }
        setLocalSelectedQuadrants(prev => prev.includes(quadrant) ? prev.filter(q => q !== quadrant) : [...prev, quadrant]);
    };

    const getQuadrant = (item: any, xMed: number): QuadrantKey => {
        const isHighX = item.xValue >= xMed;
        const isGrowing = item.vizGrowth >= 0;
        if (isHighX && isGrowing) return 'STARS';
        if (isHighX && !isGrowing) return 'CASH_COWS';
        if (!isHighX && isGrowing) return 'QUESTIONS';
        return 'DOGS';
    };

    // 1. Prepare Data & Calculate Thresholds
    const { displayData, xMedian, showingCount, totalCount } = useMemo(() => {
        // Filter out zero-revenue items to keep chart relevant
        const validItems = data
            .filter(p => (p.current.revenue || 0) > 0)
            .map(p => {
                // Parse and sanitize growth
                const rawGrowth = p.deltas.unitsDeltaPct;
                
                let effectiveGrowth = 0;
                let isNew = false;

                if (rawGrowth === null) {
                    effectiveGrowth = 200; // New products go to top
                    isNew = true;
                } else if (!isFinite(rawGrowth)) {
                    effectiveGrowth = 0;
                } else {
                    effectiveGrowth = rawGrowth;
                }

                // Strict Visual Clamping for Y-Axis
                const vizGrowth = Math.max(-100, Math.min(effectiveGrowth, 200));

                return {
                    ...p,
                    vizGrowth,
                    isNew,
                    rawGrowth,
                    xValue: xAxisMetric === 'REVENUE' ? p.current.revenue : p.current.marginPct
                };
            });
        
        // Calculate Median for X-Axis using ALL valid data (Global Context)
        const xValues = validItems.map(p => p.xValue).sort((a, b) => a - b);
        
        const getMedian = (arr: number[]) => {
            if (arr.length === 0) return 0;
            const mid = Math.floor(arr.length / 2);
            return arr.length % 2 !== 0 ? arr[mid] : (arr[mid - 1] + arr[mid]) / 2;
        };

        const xMed = getMedian(xValues);
        const yMed = 0; // Standard BCG growth split

        // Logic Selection
        const totalItems = validItems.length;
        const targetCount = limitPct === 100 ? totalItems : Math.ceil(totalItems * (limitPct / 100));
        
        let finalData = [];

        if (filterMode === 'REVENUE' || limitPct === 100) {
            // Dynamic Top N based on current X Axis Metric (Revenue or Margin)
            finalData = [...validItems]
                .sort((a, b) => b.xValue - a.xValue)
                .slice(0, targetCount);
        } else {
            // BALANCED: Try to get equal representation from all quadrants based on CURRENT AXIS
            // Sort by Revenue (Importance) within quadrants to keep the most relevant items visible
            const stars = validItems.filter(i => i.xValue >= xMed && i.vizGrowth >= yMed).sort((a,b) => b.current.revenue - a.current.revenue);
            const cows = validItems.filter(i => i.xValue >= xMed && i.vizGrowth < yMed).sort((a,b) => b.current.revenue - a.current.revenue);
            const questions = validItems.filter(i => i.xValue < xMed && i.vizGrowth >= yMed).sort((a,b) => b.current.revenue - a.current.revenue); 
            const dogs = validItems.filter(i => i.xValue < xMed && i.vizGrowth < yMed).sort((a,b) => b.current.revenue - a.current.revenue);

            const quotaPerQuad = Math.ceil(targetCount / 4);
            
            const take = (arr: any[], limit: number) => {
                const taken = arr.slice(0, limit);
                return { taken, remainder: Math.max(0, limit - arr.length) };
            };

            const r1 = take(stars, quotaPerQuad);
            const r2 = take(cows, quotaPerQuad);
            const r3 = take(questions, quotaPerQuad);
            const r4 = take(dogs, quotaPerQuad);

            let pooled = [...r1.taken, ...r2.taken, ...r3.taken, ...r4.taken];
            
            // If we haven't met the total target count, fill with top revenue from remaining
            if (pooled.length < targetCount) {
                const usedIds = new Set(pooled.map(x => x.sku));
                const remainingItems = validItems
                    .filter(x => !usedIds.has(x.sku))
                    .sort((a, b) => b.current.revenue - a.current.revenue);
                
                const needed = targetCount - pooled.length;
                pooled = [...pooled, ...remainingItems.slice(0, needed)];
            }
            
            finalData = pooled;
        }

        return {
            displayData: finalData, // Actual rendered dots
            xMedian: xMed,
            showingCount: finalData.length,
            totalCount: totalItems
        };
    }, [data, limitPct, filterMode, xAxisMetric]);

    // Update domains when data view changes
    useEffect(() => {
        if (displayData.length > 0) {
            const xValues = displayData.map(d => d.xValue);
            const minX = Math.min(...xValues);
            const maxX = Math.max(...xValues);
            const paddingX = (maxX - minX) * 0.05 || (maxX * 0.05) || 10;
            
            const newXDom: [number, number] = [Math.max(0, minX - paddingX), maxX + paddingX];
            // Base Y Domain matching visual design [-100, 220]
            const newYDom: [number, number] = [-100, 220]; 

            setXDomain(newXDom);
            setYDomain(newYDom);
            
            // Store bounds for clamping
            boundsRef.current = { x: newXDom, y: newYDom };
        }
    }, [displayData, xAxisMetric]);

    const handleZoom = (direction: 'in' | 'out') => {
        if (!xDomain || !yDomain) return;
        const factor = direction === 'in' ? 0.8 : 1.25;
        
        const xRange = xDomain[1] - xDomain[0];
        const yRange = yDomain[1] - yDomain[0];
        const newXRange = xRange * factor;
        const newYRange = yRange * factor;
        
        const xCenter = (xDomain[0] + xDomain[1]) / 2;
        const yCenter = (yDomain[0] + yDomain[1]) / 2;

        const nextX: [number, number] = [xCenter - newXRange / 2, xCenter + newXRange / 2];
        const nextY: [number, number] = [yCenter - newYRange / 2, yCenter + newYRange / 2];
        
        // Clamp Zoom Out to max bounds
        if (direction === 'out' && boundsRef.current) {
            const bx = boundsRef.current.x;
            const by = boundsRef.current.y;
            if (nextX[0] < bx[0]) nextX[0] = bx[0];
            if (nextX[1] > bx[1]) nextX[1] = bx[1];
            if (nextY[0] < by[0]) nextY[0] = by[0];
            if (nextY[1] > by[1]) nextY[1] = by[1];
        }

        setXDomain(nextX);
        setYDomain(nextY);
    };

    const handleReset = () => {
        if (boundsRef.current) {
            setXDomain(boundsRef.current.x);
            setYDomain(boundsRef.current.y);
        }
    };

    const handleMouseDown = (e: React.MouseEvent) => {
        // Prevent pan start if clicking on a point
        if ((e.target as Element).closest('.recharts-scatter-symbol')) return;
        
        if (xDomain && yDomain) {
            setIsDragging(true);
            dragRef.current = {
                startX: e.clientX,
                startY: e.clientY,
                startXDom: xDomain,
                startYDom: yDomain
            };
        }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !dragRef.current || !containerRef.current) return;
        e.preventDefault();

        const { startX, startY, startXDom, startYDom } = dragRef.current;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        
        // Chart plotting area approx dimensions (container size - margins)
        const { width, height } = containerRef.current.getBoundingClientRect();
        const plotW = width - 80; // left 60 + right 20
        const plotH = height - 60; // top 20 + bottom 40
        
        const xRange = startXDom[1] - startXDom[0];
        const yRange = startYDom[1] - startYDom[0];
        
        const xShift = -(dx / plotW) * xRange;
        const yShift = (dy / plotH) * yRange; 
        
        let nextX: [number, number] = [startXDom[0] + xShift, startXDom[1] + xShift];
        let nextY: [number, number] = [startYDom[0] + yShift, startYDom[1] + yShift];

        // Clamp to bounds
        if (boundsRef.current) {
            const bx = boundsRef.current.x;
            const by = boundsRef.current.y;
            
            if (nextX[0] < bx[0]) nextX = [bx[0], bx[0] + (nextX[1] - nextX[0])];
            if (nextX[1] > bx[1]) nextX = [bx[1] - (nextX[1] - nextX[0]), bx[1]];
            
            if (nextY[0] < by[0]) nextY = [by[0], by[0] + (nextY[1] - nextY[0])];
            if (nextY[1] > by[1]) nextY = [by[1] - (nextY[1] - nextY[0]), by[1]];
        }

        setXDomain(nextX);
        setYDomain(nextY);
    };
    
    const handleMouseUp = () => setIsDragging(false);

    const renderHoverTooltip = (d: any, showClickHint = true) => (
        <div className="bg-white/95 backdrop-blur-md border border-gray-200 p-3 rounded-xl shadow-xl text-xs z-50">
            <div className="font-bold text-gray-900 mb-1 border-b border-gray-100 pb-1 flex justify-between gap-4">
                <span className="font-mono">{d.sku}</span>
                {d.isNew && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 rounded-full">NEW</span>}
            </div>
            <div className="text-[10px] text-gray-500 mb-2 max-w-[200px] truncate">{d.name}</div>
            <div className="space-y-1">
                <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Revenue:</span>
                    <span className="font-mono font-bold text-theme">{formatSmartMoney(d.current.revenue)}</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Margin:</span>
                    <span className={`font-mono font-bold ${d.current.marginPct >= 10 ? 'text-green-600' : 'text-red-500'}`}>{formatPct(d.current.marginPct)}</span>
                </div>
                <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Volume Growth:</span>
                    <span className={`font-mono font-bold ${d.vizGrowth > 0 ? 'text-green-600' : d.vizGrowth < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                        {d.isNew ? `New (${'\u221E'})` : `${d.rawGrowth > 0 ? '+' : ''}${d.rawGrowth.toFixed(1)}%`}
                    </span>
                </div>
                 <div className="flex justify-between gap-4">
                    <span className="text-gray-500">Net Profit:</span>
                    <span className={`font-mono font-bold ${d.current.netProfit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatSmartMoney(d.current.netProfit)}
                    </span>
                </div>
            </div>
            {showClickHint && (
                <div className="mt-2 pt-1 border-t border-gray-100 text-[9px] text-theme font-medium flex items-center justify-center gap-1">
                    <Search className="w-3 h-3" /> Click to Deep Dive
                </div>
            )}
        </div>
    );

    // 2. Define Custom Tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload;
            return renderHoverTooltip(d, true);
        }
        return null;
    };

    const xLabel = xAxisMetric === 'REVENUE' ? 'Rev' : 'Margin';
    const selectedRows = activeQuadrants.length > 0
        ? displayData
            .filter(item => activeQuadrants.includes(getQuadrant(item, xMedian)))
            .sort((a, b) => b.current.revenue - a.current.revenue)
        : [];
    const tableHoverTooltipPos = useMemo(() => {
        if (!hoveredTableRow || !containerRef.current) return null;
        const rect = containerRef.current.getBoundingClientRect();
        const xDom = xDomain ?? [0, Math.max(1, ...displayData.map(d => d.xValue))];
        const yDom = yDomain ?? [-100, 220];
        const marginLeft = 60;
        const marginRight = 20;
        const marginTop = 20;
        const marginBottom = 40;
        const plotW = rect.width - marginLeft - marginRight;
        const plotH = rect.height - marginTop - marginBottom;
        if (plotW <= 0 || plotH <= 0 || xDom[1] <= xDom[0] || yDom[1] <= yDom[0]) return null;

        const tooltipWidth = 250;
        const tooltipHeight = 190;
        const spacing = 12;
        const xRatio = (hoveredTableRow.xValue - xDom[0]) / (xDom[1] - xDom[0]);
        const yRatio = (hoveredTableRow.vizGrowth - yDom[0]) / (yDom[1] - yDom[0]);
        const anchorLeft = marginLeft + Math.max(0, Math.min(1, xRatio)) * plotW;
        const anchorTop = marginTop + (1 - Math.max(0, Math.min(1, yRatio))) * plotH;

        const preferRight = anchorLeft + spacing + tooltipWidth <= rect.width - 8;
        const left = preferRight
            ? anchorLeft + spacing
            : Math.max(8, anchorLeft - spacing - tooltipWidth);
        const top = Math.max(8, Math.min(rect.height - tooltipHeight - 8, anchorTop - tooltipHeight / 2));

        return { left, top };
    }, [hoveredTableRow, xDomain, yDomain, displayData]);

    if (totalCount === 0) {
        return (
            <div className="h-[500px] flex items-center justify-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                Not enough data to generate matrix.
            </div>
        )
    }

    return (
        <div className={hideLegend ? '' : 'space-y-4'}>
            {!hideLegend && (
            <div className="flex flex-wrap items-center justify-start gap-2">
                <button onClick={() => toggleQuadrant('STARS')} className={`h-[34px] px-2.5 rounded-md border inline-flex items-center gap-1.5 transition-colors ${activeQuadrants.includes('STARS') ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'}`}>
                    <span className="w-2 h-2 rounded-full bg-green-500"></span>
                    <span className="text-[10px] font-bold text-green-700 uppercase">Stars</span>
                    <span className="text-[9px] text-gray-500">High {xLabel} / Growing</span>
                </button>
                <button onClick={() => toggleQuadrant('CASH_COWS')} className={`h-[34px] px-2.5 rounded-md border inline-flex items-center gap-1.5 transition-colors ${activeQuadrants.includes('CASH_COWS') ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'}`}>
                    <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                    <span className="text-[10px] font-bold text-yellow-700 uppercase">Cash Cows</span>
                    <span className="text-[9px] text-gray-500">High {xLabel} / Stable</span>
                </button>
                <button onClick={() => toggleQuadrant('QUESTIONS')} className={`h-[34px] px-2.5 rounded-md border inline-flex items-center gap-1.5 transition-colors ${activeQuadrants.includes('QUESTIONS') ? 'border-[#8B5CF6] bg-purple-50' : 'border-gray-200 bg-white'}`}>
                    <span className="w-2 h-2 rounded-full bg-[#5B21B6]"></span>
                    <span className="text-[10px] font-bold text-[#5B21B6] uppercase">Questions</span>
                    <span className="text-[9px] text-gray-500">Low {xLabel} / Growing</span>
                </button>
                <button onClick={() => toggleQuadrant('DOGS')} className={`h-[34px] px-2.5 rounded-md border inline-flex items-center gap-1.5 transition-colors ${activeQuadrants.includes('DOGS') ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-white'}`}>
                    <span className="w-2 h-2 rounded-full bg-red-500"></span>
                    <span className="text-[10px] font-bold text-red-700 uppercase">Dogs</span>
                    <span className="text-[9px] text-gray-500">Low {xLabel} / Declining</span>
                </button>
            </div>
            )}

            <div className={`${embedded ? '' : 'bg-white rounded-xl shadow-lg border border-gray-200 '}p-4 h-[600px] relative`}>
                <div className="h-full min-h-0 w-full flex gap-3">
                    {activeQuadrants.length > 0 && (
                        <div className="w-[360px] min-w-[320px] h-full min-h-0 bg-white/70 border border-gray-200 rounded-lg overflow-hidden flex flex-col">
                            <div className="px-3 py-2 border-b border-gray-200 text-[11px] font-bold text-gray-600 uppercase tracking-wider">
                                Selected Quadrant SKUs ({selectedRows.length})
                            </div>
                            <div className="flex-1 min-h-0 overflow-auto">
                                <table className="w-full text-xs">
                                    <thead className="sticky top-0 bg-gray-50 z-10">
                                        <tr>
                                            <th className="text-left px-3 py-2 font-semibold text-gray-500">SKU</th>
                                            <th className="text-left px-3 py-2 font-semibold text-gray-500">Type</th>
                                            <th className="text-right px-3 py-2 font-semibold text-gray-500">Revenue</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {selectedRows.map(row => (
                                            <tr
                                                key={row.sku}
                                                onMouseEnter={() => { setHoveredTableSku(row.sku); setHoveredTableRow(row); }}
                                                onMouseLeave={() => { setHoveredTableSku(null); setHoveredTableRow(null); }}
                                                onClick={() => onDeepDive(row.sku)}
                                                className={`border-t border-gray-100 cursor-pointer ${hoveredTableSku === row.sku ? 'bg-theme-10' : 'hover:bg-gray-50'}`}
                                            >
                                                <td className="px-3 py-2 font-mono text-gray-800">{row.sku}</td>
                                                <td className="px-3 py-2 text-gray-500">{getQuadrant(row, xMedian).replace('_', ' ')}</td>
                                                <td className="px-3 py-2 text-right font-semibold text-gray-700">{formatSmartMoney(row.current.revenue)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                    <div className="flex-1 min-h-0 flex flex-col">
                        <div className="flex flex-wrap justify-end items-center mb-2 gap-3 relative z-40">
                            <div className="flex flex-wrap items-center gap-2">
                                <div className="relative">
                                    <div className="flex bg-gray-100 p-0.5 rounded-lg">
                                        <button
                                            onClick={() => setShowMatrixInfo(!showMatrixInfo)}
                                            className="h-7 w-7 inline-flex items-center justify-center rounded-md bg-white text-gray-500 hover:text-theme transition-colors"
                                            title="How to read this chart"
                                        >
                                            <Info className="w-3.5 h-3.5" />
                                        </button>
                                    </div>
                                    {showMatrixInfo && (
                                        <div className="absolute right-0 top-full mt-2 w-72 bg-white rounded-xl shadow-xl border border-gray-200 p-4 z-[120]">
                                            <div className="flex justify-between items-center mb-2">
                                                <h4 className="font-bold text-gray-900 text-xs uppercase">House vs. Classic BCG</h4>
                                                <button onClick={() => setShowMatrixInfo(false)}>
                                                    <X className="w-3 h-3 text-gray-400" />
                                                </button>
                                            </div>
                                            <p className="text-[11px] text-gray-600 leading-relaxed mb-3">
                                                The traditional BCG Matrix uses <strong>Relative Market Share</strong> vs. <strong>Market Growth Rate</strong> to categorize products.
                                            </p>
                                            <p className="text-[11px] text-gray-600 leading-relaxed border-t border-gray-100 pt-2">
                                                This <strong>Internal Adaptation</strong> uses:
                                                <br />
                                                • <strong>Revenue</strong> as a proxy for Market Share.
                                                <br />
                                                • <strong>Volume Growth (PoP)</strong> as a proxy for Market Growth.
                                            </p>
                                            <div className="mt-2 text-[10px] text-theme font-bold bg-theme-10 px-2 py-1 rounded">
                                                Goal: Identify internal cash cows without external competitor data.
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 text-[9px] text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                                    <Info className="w-3 h-3" />
                                    <span>Showing <strong>{limitPct}%</strong> ({showingCount} products)</span>
                                </div>

                                 {/* X-Axis Toggle */}
                                 <div className="flex bg-gray-100 p-0.5 rounded-lg">
                                    <button
                                        onClick={() => setXAxisMetric('REVENUE')}
                                        className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 ${
                                            xAxisMetric === 'REVENUE' 
                                            ? 'bg-white text-green-700 shadow-sm' 
                                            : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                        title="X-Axis: Revenue"
                                    >
                                        <DollarSign className="w-3 h-3" /> Revenue
                                    </button>
                                    <button
                                        onClick={() => setXAxisMetric('MARGIN')}
                                        className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 ${
                                            xAxisMetric === 'MARGIN' 
                                            ? 'bg-white text-theme shadow-sm' 
                                            : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                        title="X-Axis: Margin %"
                                    >
                                        <Percent className="w-3 h-3" /> Margin
                                    </button>
                                </div>
                                
                                <div className="h-4 w-px bg-gray-200"></div>

                                {/* Sampling Mode Toggle */}
                                <div className="flex bg-gray-100 p-0.5 rounded-lg">
                                    <button
                                        onClick={() => setFilterMode('REVENUE')}
                                        className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 ${
                                            filterMode === 'REVENUE' 
                                            ? 'bg-white text-theme shadow-sm' 
                                            : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                        title={xAxisMetric === 'REVENUE' ? "Always show top products by Revenue" : "Always show top products by Margin"}
                                    >
                                        {xAxisMetric === 'REVENUE' ? <DollarSign className="w-3 h-3" /> : <Percent className="w-3 h-3" />}
                                        {xAxisMetric === 'REVENUE' ? 'Top Rev' : 'Top Margin'}
                                    </button>
                                    <button
                                        onClick={() => setFilterMode('BALANCED')}
                                        className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 ${
                                            filterMode === 'BALANCED' 
                                            ? 'bg-white text-theme shadow-sm' 
                                            : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                        title="Equal representation from Stars, Cows, Questions, Dogs"
                                    >
                                        <Scale className="w-3 h-3" /> Balanced
                                    </button>
                                </div>
                                
                                <div className="h-4 w-px bg-gray-200"></div>

                                {/* Limit Toggle */}
                                <div className="flex bg-gray-100 p-0.5 rounded-lg">
                                    {([10, 25, 50, 100] as const).map((opt) => (
                                        <button
                                            key={opt}
                                            onClick={() => setLimitPct(opt)}
                                            className={`px-3 py-1 text-[10px] font-bold rounded-md transition-all ${
                                                limitPct === opt 
                                                ? 'bg-white text-theme shadow-sm' 
                                                : 'text-gray-500 hover:text-gray-700'
                                            }`}
                                        >
                                            {opt === 100 ? 'All' : `Top ${opt}%`}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div
                            className={`flex-1 min-h-0 relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                            ref={containerRef}
                            onMouseDown={handleMouseDown}
                            onMouseMove={handleMouseMove}
                            onMouseUp={handleMouseUp}
                            onMouseLeave={handleMouseUp}
                        >
                    {hoveredTableRow && tableHoverTooltipPos && (
                        <div
                            className="absolute z-[1100] pointer-events-none"
                            style={{
                                left: `${tableHoverTooltipPos.left}px`,
                                top: `${tableHoverTooltipPos.top}px`,
                                maxWidth: '250px'
                            }}
                        >
                            {renderHoverTooltip(hoveredTableRow, false)}
                        </div>
                    )}
                    {/* Map Controls */}
                    <div className="absolute top-2 right-2 z-20 flex flex-col gap-1.5 bg-white/90 p-1.5 rounded-lg border border-gray-200 shadow-sm backdrop-blur-sm">
                         <button onClick={() => handleZoom('in')} className="p-1 text-gray-500 hover:text-theme hover:bg-gray-100 rounded transition-colors" title="Zoom In"><Plus className="w-4 h-4" /></button>
                         <button onClick={() => handleZoom('out')} className="p-1 text-gray-500 hover:text-theme hover:bg-gray-100 rounded transition-colors" title="Zoom Out"><Minus className="w-4 h-4" /></button>
                         <div className="w-full h-px bg-gray-200 my-0.5"></div>
                         <button onClick={handleReset} className="p-1 text-gray-500 hover:text-red-600 hover:bg-gray-100 rounded transition-colors" title="Reset View"><RotateCcw className="w-4 h-4" /></button>
                    </div>

                    {limitPct === 100 && totalCount > 2000 && (
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none bg-red-50 text-red-600 px-4 py-2 rounded-lg border border-red-100 shadow-lg text-xs font-bold ">
                            Warning: Rendering {totalCount} items may cause lag.
                        </div>
                    )}
                    
                    <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 60 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                            
                            {/* X Axis: Revenue OR Margin */}
                            <XAxis 
                                type="number" 
                                dataKey="xValue" 
                                name={xAxisMetric === 'REVENUE' ? "Revenue" : "Margin"}
                                unit={xAxisMetric === 'REVENUE' ? '\u00A3' : "%"}
                                domain={xDomain ? xDomain : (xAxisMetric === 'REVENUE' ? [0, 'auto'] : ['auto', 'auto'])}
                                allowDataOverflow={true} 
                                tickFormatter={(val) => xAxisMetric === 'REVENUE' ? `${'\u00A3'}${formatNumber(val)}` : `${val.toFixed(0)}%`}
                                label={{ value: xAxisMetric === 'REVENUE' ? 'Revenue (Relative Market Share)' : 'Net Profit Margin %', position: 'bottom', offset: 0, fontSize: 11, fill: '#6b7280' }}
                                tick={{ fontSize: 10, fill: '#9ca3af' }}
                            />
                            
                            {/* Y Axis: Growth % (Using clamped vizGrowth for display) */}
                            <YAxis 
                                type="number" 
                                dataKey="vizGrowth" 
                                name="Growth" 
                                unit="%" 
                                domain={yDomain ? yDomain : [-100, 220]} 
                                allowDataOverflow={true}
                                label={{ value: 'Volume Growth % (PoP)', angle: -90, position: 'left', offset: 0, fontSize: 11, fill: '#6b7280' }}
                                tick={{ fontSize: 10, fill: '#9ca3af' }}
                                ticks={[-100, -50, 0, 50, 100, 150, 200]}
                            />
                            
                            {/* Z Axis: Profit Size */}
                            <ZAxis type="number" dataKey="current.netProfit" range={[60, 800]} name="Profit" />
                            
                            {/* Tooltip with high Z-Index to stay above filters */}
                            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} wrapperStyle={{ zIndex: 1000 }} />

                            {/* Reference Lines for Quadrants */}
                            <ReferenceLine x={xMedian} stroke="#9ca3af" strokeDasharray="3 3" label={{ value: `Median ${xLabel}`, position: 'insideTopRight', fill: '#9ca3af', fontSize: 10, angle: 90 }} />
                            <ReferenceLine y={0} stroke="#9ca3af" strokeWidth={2} label={{ value: "No Growth", position: 'insideRight', fill: '#9ca3af', fontSize: 10 }} />

                            {/* Quadrant Backgrounds (Subtle) */}
                            {/* Q1: Stars (High X, High Growth) */}
                            <ReferenceArea x1={xMedian} y1={0} y2={220} fill="#22c55e" fillOpacity={0.03} />
                            {/* Q2: Questions (Low X, High Growth) */}
                            <ReferenceArea x2={xMedian} y1={0} y2={220} fill="#6366f1" fillOpacity={0.03} />
                            {/* Q3: Dogs (Low X, Neg Growth) */}
                            <ReferenceArea x2={xMedian} y1={-100} y2={0} fill="#ef4444" fillOpacity={0.03} />
                            {/* Q4: Cows (High X, Neg Growth) */}
                            <ReferenceArea x1={xMedian} y1={-100} y2={0} fill="#eab308" fillOpacity={0.03} />

                            <Scatter name="Products" data={displayData} onClick={(p) => onDeepDive(p.sku)}>
                                {displayData.map((entry, index) => {
                                    const isHighX = entry.xValue >= xMedian;
                                    const isGrowing = entry.vizGrowth >= 0;

                                    let color = '#9ca3af';
                                    if (isHighX && isGrowing) color = '#22c55e'; // Star
                                    else if (isHighX && !isGrowing) color = '#eab308'; // Cow
                                    else if (!isHighX && isGrowing) color = '#6366f1'; // Question
                                    else color = '#ef4444'; // Dog

                                    return (
                                        <Cell 
                                            key={`cell-${index}`} 
                                            fill={color} 
                                            stroke={color} 
                                            fillOpacity={hoveredTableSku ? (hoveredTableSku === entry.sku ? 0.95 : 0.18) : 0.5}
                                            strokeWidth={hoveredTableSku === entry.sku ? 3 : 1}
                                            className="cursor-pointer hover:opacity-100 transition-opacity duration-200" 
                                        />
                                    );
                                })}
                            </Scatter>
                        </ScatterChart>
                    </ResponsiveContainer>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

