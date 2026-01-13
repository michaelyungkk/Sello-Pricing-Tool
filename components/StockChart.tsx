import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { useTranslation } from 'react-i18next';

interface StockChartProps {
  currentStock: number;
  dailySalesCurrent: number;
  dailySalesProjected?: number; // Lower velocity if price increased
  leadTimeDays: number;
}

const StockChart: React.FC<StockChartProps> = ({ currentStock, dailySalesCurrent, dailySalesProjected, leadTimeDays }) => {
  const { t } = useTranslation();
  
  // Generate projection data
  const data = [];
  const simulationDays = Math.max(leadTimeDays + 14, 60); // Show at least lead time + buffer

  const currentPaceKey = t('chart_current_pace');
  const adjustedPaceKey = t('chart_adjusted_pace');

  for (let i = 0; i <= simulationDays; i += 5) {
    const stockCurrentPace = Math.max(0, currentStock - (dailySalesCurrent * i));
    const stockProjectedPace = dailySalesProjected 
      ? Math.max(0, currentStock - (dailySalesProjected * i)) 
      : null;

    const dataPoint: any = {
      day: i,
      [currentPaceKey]: Math.round(stockCurrentPace),
    };

    if (stockProjectedPace !== null) {
      dataPoint[adjustedPaceKey] = Math.round(stockProjectedPace);
    }
    
    data.push(dataPoint);
  }

  return (
    <div className="h-64 w-full bg-white p-4 rounded-lg border border-gray-100 shadow-sm flex flex-col">
      <h3 className="text-sm font-semibold text-gray-700 mb-4 flex-shrink-0">{t('analysis_stock_depletion')}</h3>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <LineChart data={data} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis 
              dataKey="day" 
              label={{ value: t('chart_days'), position: 'insideBottomRight', offset: -5 }} 
              tick={{fontSize: 12}}
            />
            <YAxis label={{ value: t('chart_stock'), angle: -90, position: 'insideLeft' }} tick={{fontSize: 12}} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}
            />
            <Legend />
            <ReferenceLine x={leadTimeDays} stroke="red" strokeDasharray="3 3" label={{ position: 'top', value: t('chart_restock_arrival'), fill: 'red', fontSize: 10 }} />
            <Line type="monotone" dataKey={currentPaceKey} stroke="#6366f1" strokeWidth={2} dot={false} />
            {dailySalesProjected && (
              <Line type="monotone" dataKey={adjustedPaceKey} stroke="#10b981" strokeWidth={2} dot={false} strokeDasharray="5 5" />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default StockChart;
