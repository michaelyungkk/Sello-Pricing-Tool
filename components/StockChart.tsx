import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';

interface StockChartProps {
  currentStock: number;
  dailySalesCurrent: number;
  dailySalesProjected?: number; // Lower velocity if price increased
  leadTimeDays: number;
}

const StockChart: React.FC<StockChartProps> = ({ currentStock, dailySalesCurrent, dailySalesProjected, leadTimeDays }) => {
  
  // Generate projection data
  const data = [];
  const simulationDays = Math.max(leadTimeDays + 14, 60); // Show at least lead time + buffer

  for (let i = 0; i <= simulationDays; i += 5) {
    const stockCurrentPace = Math.max(0, currentStock - (dailySalesCurrent * i));
    const stockProjectedPace = dailySalesProjected 
      ? Math.max(0, currentStock - (dailySalesProjected * i)) 
      : null;

    data.push({
      day: i,
      "Current Pace": Math.round(stockCurrentPace),
      ...(stockProjectedPace !== null && { "Adjusted Pace": Math.round(stockProjectedPace) }),
    });
  }

  return (
    <div className="h-64 w-full bg-white p-4 rounded-lg border border-gray-100 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Projected Stock Depletion</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis 
            dataKey="day" 
            label={{ value: 'Days', position: 'insideBottomRight', offset: -5 }} 
            tick={{fontSize: 12}}
          />
          <YAxis label={{ value: 'Stock', angle: -90, position: 'insideLeft' }} tick={{fontSize: 12}} />
          <Tooltip 
            contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}
          />
          <Legend />
          <ReferenceLine x={leadTimeDays} stroke="red" strokeDasharray="3 3" label={{ position: 'top', value: 'Restock Arrival', fill: 'red', fontSize: 10 }} />
          <Line type="monotone" dataKey="Current Pace" stroke="#6366f1" strokeWidth={2} dot={false} />
          {dailySalesProjected && (
            <Line type="monotone" dataKey="Adjusted Pace" stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="5 5" />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default StockChart;