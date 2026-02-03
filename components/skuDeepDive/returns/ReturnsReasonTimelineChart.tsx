
import React, { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend
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

const ReturnsReasonTimelineChart: React.FC<ReturnsReasonTimelineChartProps> = ({
  data,
  getDate,
  getReason,
  title = "Refund Reason Timeline"
}) => {
  // 1. Process Data
  const { chartData, reasonMetaMap, reasonKeys } = useMemo(() => {
    const groupedData = new Map<string, Record<string, number>>();
    const metaMap = new Map<string, string>(); // short -> full
    const keysSet = new Set<string>();

    data.forEach((row) => {
      const dateStr = asDateKey(getDate(row));
      if (!dateStr) return;

      const rawReason = getReason(row);
      const { short, full } = parseReturnsReason(rawReason);
      
      // Store metadata
      if (!metaMap.has(short)) {
        metaMap.set(short, full);
        keysSet.add(short);
      }

      // Aggregate
      if (!groupedData.has(dateStr)) {
        groupedData.set(dateStr, {});
      }
      const dayEntry = groupedData.get(dateStr)!;
      dayEntry[short] = (dayEntry[short] || 0) + 1; // Count records
    });

    // Convert to Array and Sort by Date
    const result = Array.from(groupedData.entries())
      .map(([date, counts]) => ({
        date,
        ...counts,
        _total: Object.values(counts).reduce((a, b) => a + b, 0)
      }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return {
      chartData: result,
      reasonMetaMap: metaMap,
      reasonKeys: Array.from(keysSet).sort()
    };
  }, [data, getDate, getReason]);

  if (!chartData || chartData.length === 0) {
    return (
      <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex flex-col items-center justify-center h-[380px] text-gray-400">
        <Activity className="w-8 h-8 mb-2 opacity-50" />
        <span className="text-sm">No return data available for timeline.</span>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      // Sort payload by value descending
      const sortedPayload = [...payload].sort((a: any, b: any) => b.value - a.value);

      return (
        <div className="bg-white p-3 border border-gray-200 shadow-xl rounded-lg text-xs z-50 max-w-[280px]">
          <div className="font-bold text-gray-900 mb-2 border-b border-gray-100 pb-1">
            {new Date(label).toLocaleDateString('en-GB', {
              weekday: 'short',
              day: 'numeric',
              month: 'short'
            })}
          </div>
          <div className="space-y-1.5">
            {sortedPayload.map((entry: any, idx: number) => {
              const shortCode = entry.dataKey;
              const fullReason = reasonMetaMap.get(shortCode) || shortCode;
              return (
                <div key={idx} className="flex flex-col">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-1.5">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: entry.color }}
                      />
                      <span className="font-bold text-gray-700">{shortCode}</span>
                    </div>
                    <span className="font-mono font-bold text-gray-900">
                      {Math.round(Number(entry.value))}
                    </span>
                  </div>
                  <div className="text-[10px] text-gray-500 pl-3.5 leading-tight">
                    {fullReason}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      );
    }
    return null;
  };

  const renderCustomLabel = (props: any, key: string) => {
    const { x, y, width, height, value } = props;
    // Only show label if count >= 3 AND bar is tall enough to fit text
    if (value < 3 || height < 14) return null;

    return (
      <text
        x={x + width / 2}
        y={y + height / 2}
        fill="#fff"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={10} // Increased from 9
        fontWeight="700"
        style={{ pointerEvents: 'none', textShadow: '0px 1px 2px rgba(0,0,0,0.6)' }}
      >
        {key}
      </text>
    );
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
          <BarChart
            data={chartData}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
          >
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              tickFormatter={(val) =>
                new Date(val).toLocaleDateString('en-GB', {
                  day: 'numeric',
                  month: 'short'
                })
              }
              // Increased font size and contrast
              tick={{ fontSize: 11, fill: '#4b5563' }}
              axisLine={false}
              tickLine={false}
              minTickGap={30}
            />
            <YAxis
              // Increased font size and contrast
              tick={{ fontSize: 11, fill: '#4b5563' }}
              axisLine={false}
              tickLine={false}
              allowDecimals={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: '#f9fafb' }} />
            {reasonKeys.map((key, index) => (
              <Bar
                key={key}
                dataKey={key}
                stackId="a"
                fill={COLORS[index % COLORS.length]}
                maxBarSize={40}
                label={(props) => renderCustomLabel(props, key)}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* External Legend */}
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
