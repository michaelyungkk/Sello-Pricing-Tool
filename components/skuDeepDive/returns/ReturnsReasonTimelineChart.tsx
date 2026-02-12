
import React, { useMemo } from 'react';
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import { Activity, Info } from 'lucide-react';
import { parseReturnsReason } from '../../../services/returnsReasonCodes';
import { asDateKey } from '../../../services/dateUtils';

interface ReturnsReasonTimelineChartProps {
  data: any[];
  getDate: (row: any) => string | Date | null | undefined;
  getReason: (row: any) => string | null | undefined;
  title?: string;
}

const COLORS = [
  '#6366f1', // Indigo
  '#ec4899', // Pink
  '#10b981', // Emerald
  '#f59e0b', // Amber
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#ef4444', // Red
  '#14b8a6', // Teal
  '#f97316', // Orange
  '#64748b'  // Slate (Fallback)
];

interface RefundPoint {
    date: number; // Timestamp for correct X-Axis sorting
    dateStr: string; // Original string for display consistency
    count: number;
    reasonCode: string;
    reasonDesc: string;
}

const ReturnsReasonTimelineChart: React.FC<ReturnsReasonTimelineChartProps> = ({
  data,
  getDate,
  getReason,
  title = "Refund Reason Timeline"
}) => {
  // 1. Process Data into Scatter Points
  const { chartPoints, reasonMetaMap, reasonKeys, xDomain } = useMemo(() => {
    const pointMap = new Map<string, number>(); // Key: "date|reasonCode"
    const metaMap = new Map<string, string>(); // short -> description
    const keysSet = new Set<string>();

    data.forEach((row) => {
      const dateStr = asDateKey(getDate(row));
      if (!dateStr) return;

      const rawReason = getReason(row);
      const { short, description } = parseReturnsReason(rawReason);
      
      if (!metaMap.has(short)) {
        metaMap.set(short, description);
        keysSet.add(short);
      }

      const key = `${dateStr}|${short}`;
      pointMap.set(key, (pointMap.get(key) || 0) + 1);
    });

    const points: RefundPoint[] = Array.from(pointMap.entries()).map(([key, count]) => {
        const [dateStr, reasonCode] = key.split('|');
        return {
            date: new Date(dateStr).getTime(),
            dateStr,
            count,
            reasonCode,
            reasonDesc: metaMap.get(reasonCode) || reasonCode
        };
    }).sort((a, b) => a.date - b.date);

    // Domain Logic: Auto-scale but ensure we show "Today" if data is recent
    let domain: [number | 'auto', number | 'auto'] = ['auto', 'auto'];
    
    if (points.length > 0) {
        const minTs = points[0].date;
        const maxTs = points[points.length - 1].date;
        const nowTs = new Date().getTime();

        // If the latest data point is within the last 90 days, extend the chart to "Today"
        const isRecent = (nowTs - maxTs) < (90 * 24 * 60 * 60 * 1000);
        
        // Add a small buffer (3 days) to start/end so dots aren't cut off at the edge
        const dayBuffer = 3 * 86400000;
        const finalMax = isRecent ? Math.max(maxTs, nowTs) : maxTs;
        
        domain = [minTs - dayBuffer, finalMax + dayBuffer];
    }

    return {
      chartPoints: points,
      reasonMetaMap: metaMap,
      reasonKeys: Array.from(keysSet).sort(),
      xDomain: domain
    };
  }, [data, getDate, getReason]);

  if (!chartPoints || chartPoints.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center h-[380px] text-gray-400">
        <Activity className="w-8 h-8 mb-2 opacity-50" />
        <span className="text-sm">No return data available for timeline.</span>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-3 border border-gray-200 shadow-xl rounded-lg text-xs z-50">
          <div className="font-bold text-gray-900 mb-1 border-b border-gray-100 pb-1">
            {new Date(data.date).toLocaleDateString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })}
          </div>
          <div className="space-y-1 mt-1">
             <div className="flex items-center gap-2">
                <span className="font-bold text-indigo-600">{data.reasonCode}</span>
                <span className="text-gray-500">{data.reasonDesc}</span>
             </div>
             <div className="flex justify-between font-bold text-gray-900">
                <span>Refund Count:</span>
                <span>{data.count}</span>
             </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col h-auto">
      <div className="flex items-center gap-2 mb-4">
        <div className="p-1.5 bg-red-50 text-red-600 rounded-lg">
          <Activity className="w-4 h-4" />
        </div>
        <h3 className="text-sm font-bold text-gray-800">{title}</h3>
      </div>

      <div className="h-[320px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ScatterChart
            margin={{ top: 20, right: 20, bottom: 20, left: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            {/* Major Axis (Data-bound) */}
            <XAxis
              xAxisId={0}
              dataKey="date"
              type="number"
              domain={xDomain}
              tickFormatter={(val) =>
                new Date(val).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short'
                })
              }
              tick={{ fontSize: 11, fill: '#4b5563', dy: 5 }}
              tickCount={8}
              axisLine={{ stroke: '#e5e7eb' }}
              tickLine={{ stroke: '#d1d5db', height: 6 }}
            />
            {/* Minor Axis (Visual only) */}
            <XAxis
              xAxisId="minor"
              dataKey="date"
              type="number"
              domain={xDomain}
              tickCount={32}
              tick={false}
              axisLine={false}
              tickLine={{ stroke: '#e5e7eb', height: 3 }}
              orientation="bottom"
              mirror={false}
            />
            <YAxis
              dataKey="count"
              name="Refunds"
              tick={{ fontSize: 11, fill: '#4b5563' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
              label={{
                value: 'Refund count',
                angle: -90,
                position: 'insideLeft',
                style: { fontSize: 10, fill: '#9ca3af', fontWeight: 'bold' }
              }}
            />
            <ZAxis range={[60, 400]} />
            <Tooltip content={<CustomTooltip />} cursor={{ strokeDasharray: '3 3' }} />
            
            {reasonKeys.map((key, index) => (
              <Scatter
                key={key}
                name={key}
                xAxisId={0}
                data={chartPoints.filter(p => p.reasonCode === key)}
                fill={COLORS[index % COLORS.length]}
                shape="circle"
              />
            ))}
          </ScatterChart>
        </ResponsiveContainer>
      </div>

      {/* Reason Code Key */}
      <div className="mt-4 pt-4 border-t border-gray-100">
        <h4 className="text-xs font-bold text-gray-500 uppercase mb-2 flex items-center gap-1">
          <Info className="w-3.5 h-3.5" /> Reason Code Key
        </h4>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
          {reasonKeys.map((key, index) => (
            <div key={key} className="flex items-start gap-2 text-xs">
              <span
                className="flex-shrink-0 w-2.5 h-2.5 rounded-full mt-0.5"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <div className="min-w-0">
                <span className="font-bold text-gray-800 mr-1">{key}:</span>
                <span className="text-gray-600 block leading-tight">
                  {reasonMetaMap.get(key)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ReturnsReasonTimelineChart;
