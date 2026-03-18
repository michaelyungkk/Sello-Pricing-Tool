
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, ZAxis, CartesianGrid, Tooltip, ReferenceLine, ReferenceArea, Cell, LabelList } from 'recharts';
import { ProductTrendData } from '../../../services/productTrendAgg';
import { formatMoney, formatSmartMoney, formatNumber, formatPct } from '../../../utils/format';
import { Search, Info, Filter, MousePointerClick, Scale, DollarSign, Percent, Plus, Minus, RotateCcw } from 'lucide-react';

interface BcgMatrixProps {
    data: ProductTrendData[];
    onDeepDive: (sku: string) => void;
}

type LimitPercent = 10 | 25 | 50 | 100;
type FilterMode = 'REVENUE' | 'BALANCED';
type XAxisMetric = 'REVENUE' | 'MARGIN';

export const BcgMatrix: React.FC<BcgMatrixProps> = ({ data, onDeepDive }) => {
    const [limitPct, setLimitPct] = useState<LimitPercent>(25); 
    const [filterMode, setFilterMode] = useState<FilterMode>('BALANCED');
    const [xAxisMetric, setXAxisMetric] = useState<XAxisMetric>('REVENUE');
    
    // Zoom & Pan State
    const [xDomain, setXDomain] = useState<[number, number] | null>(null);
    const [yDomain, setYDomain] = useState<[number, number] | null>(null);
    const [isDragging, setIsDragging] = useState(false);
    
    // References for interaction
    const containerRef = useRef<HTMLDivElement>(null);
    const dragRef = useRef<{ startX: number, startY: number, startXDom: [number, number], startYDom: [number, number] } | null>(null);
    const boundsRef = useRef<{ x: [number, number], y: [number, number] } | null>(null);

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

    // 2. Define Custom Tooltip
    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const d = payload[0].payload;
            return (
                <div className="bg-white/95 backdrop-blur-md border border-gray-200 p-3 rounded-xl shadow-xl text-xs z-50">
                    <div className="font-bold text-gray-900 mb-1 border-b border-gray-100 pb-1 flex justify-between gap-4">
                        <span className="font-mono">{d.sku}</span>
                        {d.isNew && <span className="text-[9px] bg-green-100 text-green-700 px-1.5 rounded-full">NEW</span>}
                    </div>
                    <div className="text-[10px] text-gray-500 mb-2 max-w-[200px] truncate">{d.name}</div>
                    <div className="space-y-1">
                        <div className="flex justify-between gap-4">
                            <span className="text-gray-500">Revenue:</span>
                            <span className="font-mono font-bold text-indigo-600">{formatSmartMoney(d.current.revenue)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-gray-500">Margin:</span>
                            <span className={`font-mono font-bold ${d.current.marginPct >= 10 ? 'text-green-600' : 'text-red-500'}`}>{formatPct(d.current.marginPct)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                            <span className="text-gray-500">Volume Growth:</span>
                            <span className={`font-mono font-bold ${d.vizGrowth > 0 ? 'text-green-600' : d.vizGrowth < 0 ? 'text-red-600' : 'text-gray-600'}`}>
                                {d.isNew ? 'New (∞)' : `${d.rawGrowth > 0 ? '+' : ''}${d.rawGrowth.toFixed(1)}%`}
                            </span>
                        </div>
                         <div className="flex justify-between gap-4">
                            <span className="text-gray-500">Net Profit:</span>
                            <span className={`font-mono font-bold ${d.current.netProfit > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                {formatSmartMoney(d.current.netProfit)}
                            </span>
                        </div>
                    </div>
                    <div className="mt-2 pt-1 border-t border-gray-100 text-[9px] text-indigo-500 font-medium flex items-center justify-center gap-1">
                        <Search className="w-3 h-3" /> Click to Deep Dive
                    </div>
                </div>
            );
        }
        return null;
    };

    if (totalCount === 0) {
        return (
            <div className="h-[500px] flex items-center justify-center text-gray-400 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                Not enough data to generate matrix.
            </div>
        )
    }

    const xLabel = xAxisMetric === 'REVENUE' ? 'Rev' : 'Margin';

    return (
        <div className="space-y-4">
            {/* Explanation / Legend */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="p-2.5 bg-white rounded-lg border border-gray-200 shadow-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-green-100 flex items-center justify-center text-lg">🌟</div>
                    <div>
                        <div className="text-[10px] font-bold text-green-700 uppercase">Stars</div>
                        <div className="text-[9px] text-gray-500">High {xLabel} / Growing</div>
                    </div>
                </div>
                <div className="p-2.5 bg-white rounded-lg border border-gray-200 shadow-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-yellow-100 flex items-center justify-center text-lg">🐄</div>
                    <div>
                        <div className="text-[10px] font-bold text-yellow-700 uppercase">Cash Cows</div>
                        <div className="text-[9px] text-gray-500">High {xLabel} / Stable</div>
                    </div>
                </div>
                <div className="p-2.5 bg-white rounded-lg border border-gray-200 shadow-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-indigo-100 flex items-center justify-center text-lg">❓</div>
                    <div>
                        <div className="text-[10px] font-bold text-indigo-700 uppercase">Questions</div>
                        <div className="text-[9px] text-gray-500">Low {xLabel} / Growing</div>
                    </div>
                </div>
                <div className="p-2.5 bg-white rounded-lg border border-gray-200 shadow-sm flex items-center gap-3">
                    <div className="w-8 h-8 rounded-md bg-red-100 flex items-center justify-center text-lg">🐕</div>
                    <div>
                        <div className="text-[10px] font-bold text-red-700 uppercase">Dogs</div>
                        <div className="text-[9px] text-gray-500">Low {xLabel} / Declining</div>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-200 p-4 h-[600px] relative flex flex-col">
                <div className="flex flex-wrap justify-between items-center mb-2 gap-3 relative z-0">
                    <div className="flex items-center gap-1.5 text-[9px] text-gray-400 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                        <Info className="w-3 h-3" />
                        <span>Showing <strong>{limitPct}%</strong> ({showingCount} products)</span>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2">
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
                                    ? 'bg-white text-indigo-600 shadow-sm' 
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
                                    ? 'bg-white text-indigo-600 shadow-sm' 
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
                                    ? 'bg-white text-indigo-600 shadow-sm' 
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
                                        ? 'bg-white text-indigo-600 shadow-sm' 
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
                    className={`flex-1 min-h-0 w-full relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                    ref={containerRef}
                    onMouseDown={handleMouseDown}
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    {/* Map Controls */}
                    <div className="absolute top-2 right-2 z-20 flex flex-col gap-1.5 bg-white/90 p-1.5 rounded-lg border border-gray-200 shadow-sm backdrop-blur-sm">
                         <button onClick={() => handleZoom('in')} className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded transition-colors" title="Zoom In"><Plus className="w-4 h-4" /></button>
                         <button onClick={() => handleZoom('out')} className="p-1 text-gray-500 hover:text-indigo-600 hover:bg-gray-100 rounded transition-colors" title="Zoom Out"><Minus className="w-4 h-4" /></button>
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
                                unit={xAxisMetric === 'REVENUE' ? "£" : "%"}
                                domain={xDomain ? xDomain : (xAxisMetric === 'REVENUE' ? [0, 'auto'] : ['auto', 'auto'])}
                                allowDataOverflow={true} 
                                tickFormatter={(val) => xAxisMetric === 'REVENUE' ? `£${formatNumber(val)}` : `${val.toFixed(0)}%`}
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
                                            fillOpacity={0.5} 
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
    );
};
