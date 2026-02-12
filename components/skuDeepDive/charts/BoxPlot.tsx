
import React from 'react';
import { createPortal } from 'react-dom';
import { Activity, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { ResponsiveContainer, ComposedChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip } from 'recharts';
import { formatMoney } from '../../../utils/format';

export const calculateQuantiles = (data: number[]) => {
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

export const BoxPlot = ({ title, stats7, stats30, stats90, format, color = '#6366f1', adOnly7, layout = 'horizontal', showAdOnlyFooter = false, setTooltip, tooltip }: any) => {
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
