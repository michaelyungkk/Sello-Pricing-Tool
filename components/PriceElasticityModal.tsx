
import React, { useMemo } from 'react';
import { Product, PriceLog, PriceChangeRecord } from '../types';
import { X, TrendingUp, TrendingDown, Activity, Calendar, ArrowRight } from 'lucide-react';
import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine
} from 'recharts';

interface PriceElasticityModalProps {
  product: Product;
  priceHistory: PriceLog[];
  priceChangeHistory: PriceChangeRecord[];
  onClose: () => void;
}

const PriceElasticityModal: React.FC<PriceElasticityModalProps> = ({ product, priceHistory, priceChangeHistory, onClose }) => {
  
  // 1. Filter history for this product and sort by date
  const productHistory = useMemo(() => {
    return priceHistory
      .filter(h => h.sku === product.sku)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [priceHistory, product.sku]);

  // 2. Aggregate Daily Data (Combine multiple platform logs for same day into one)
  const chartData = useMemo(() => {
    const dailyMap = new Map<string, { date: string, price: number, qty: number, count: number }>();
    
    productHistory.forEach(log => {
      const dateStr = new Date(log.date).toISOString().split('T')[0];
      if (!dailyMap.has(dateStr)) {
        dailyMap.set(dateStr, { date: dateStr, price: 0, qty: 0, count: 0 });
      }
      const entry = dailyMap.get(dateStr)!;
      entry.price += log.price * log.velocity; // Weighted sum for avg price
      entry.qty += log.velocity;
      entry.count += 1; // Actually we want to weigh price by qty, if qty 0, we take price as is
    });

    return Array.from(dailyMap.values()).map(d => ({
        date: d.date,
        // Calculate Weighted Avg Price. If qty 0, avg is tricky, use simple avg of logs? 
        // Logic: if total qty > 0, price = sum(price*qty)/totalQty. else avg of recorded prices?
        // Simplified: The logs usually come pre-aggregated. Let's assume dailyMap accumulation works for weighted revenue.
        price: d.qty > 0 ? d.price / d.qty : 0, // This logic assumes `d.price` accumulated revenue. Wait, log.price is unit price.
        qty: d.qty
    })).map(d => {
        // Fix Price Calculation: 
        // Refetch logs for day to be sure or fix accumulator above.
        // Let's fix above: log.price is Unit Price. log.velocity is Qty.
        // So entry.price accumulated Revenue.
        // Thus d.price = Revenue / Qty. Correct.
        // Fallback if qty is 0: find a log for that day and use its price.
        if (d.qty === 0) {
             const log = productHistory.find(l => new Date(l.date).toISOString().split('T')[0] === d.date);
             return { ...d, price: log ? log.price : 0 };
        }
        return d;
    }).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [productHistory]);

  // 3. Get Relevant Price Changes
  const relevantChanges = useMemo(() => {
    return priceChangeHistory
        .filter(c => c.sku === product.sku)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [priceChangeHistory, product.sku]);

  // 4. Calculate Impact Stats for the *Latest* Change
  const impactStats = useMemo(() => {
      if (relevantChanges.length === 0) return null;
      
      const latest = relevantChanges[relevantChanges.length - 1];
      const changeDate = new Date(latest.date);
      
      // Defined window (e.g. 7 days before, 7 days after)
      const beforeStart = new Date(changeDate); beforeStart.setDate(changeDate.getDate() - 7);
      const afterEnd = new Date(changeDate); afterEnd.setDate(changeDate.getDate() + 7);
      
      const preData = chartData.filter(d => {
          const t = new Date(d.date);
          return t >= beforeStart && t < changeDate;
      });
      
      const postData = chartData.filter(d => {
          const t = new Date(d.date);
          return t > changeDate && t <= afterEnd;
      });

      const avgPreQty = preData.reduce((acc, c) => acc + c.qty, 0) / (preData.length || 1);
      const avgPostQty = postData.reduce((acc, c) => acc + c.qty, 0) / (postData.length || 1);
      
      const qtyChangePct = avgPreQty > 0 ? ((avgPostQty - avgPreQty) / avgPreQty) * 100 : 0;
      
      return {
          date: latest.date,
          oldPrice: latest.oldPrice,
          newPrice: latest.newPrice,
          priceChangePct: latest.percentChange,
          preQty: avgPreQty,
          postQty: avgPostQty,
          qtyChangePct
      };
  }, [relevantChanges, chartData]);

  if (!product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-custom-glass-modal backdrop-blur-custom-modal rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-y-auto flex flex-col border border-white/20">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100/50 flex justify-between items-start bg-gray-50/50">
          <div>
            <div className="flex items-center gap-2 mb-1">
               <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-100 text-indigo-700 rounded uppercase tracking-wide">
                  Elasticity Analysis
               </span>
               <span className="text-sm text-gray-500 font-mono">{product.sku}</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{product.name}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200/50 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">
            
            {/* Impact Summary Card */}
            {impactStats ? (
                <div className="bg-white/60 border border-indigo-100 rounded-xl p-5 shadow-sm flex flex-col md:flex-row gap-6 items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-indigo-50 text-indigo-600 rounded-full">
                            <Activity className="w-6 h-6" />
                        </div>
                        <div>
                            <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide">Latest Price Event</h4>
                            <p className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                {new Date(impactStats.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                <span className={`text-xs px-2 py-0.5 rounded-full border ${impactStats.priceChangePct > 0 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-red-100 text-red-700 border-red-200'}`}>
                                    {impactStats.priceChangePct > 0 ? 'Increased' : 'Decreased'} {Math.abs(impactStats.priceChangePct).toFixed(1)}%
                                </span>
                            </p>
                            <div className="text-sm text-gray-600 mt-1">
                                Price: <strong>£{impactStats.oldPrice.toFixed(2)}</strong> <ArrowRight className="inline w-3 h-3 mx-1"/> <strong>£{impactStats.newPrice.toFixed(2)}</strong>
                            </div>
                        </div>
                    </div>

                    <div className="h-10 w-px bg-gray-200 hidden md:block"></div>

                    <div className="flex flex-col items-end">
                        <h4 className="text-sm font-bold text-gray-500 uppercase tracking-wide text-right">Velocity Impact (7-Day Avg)</h4>
                        <div className="flex items-center gap-3 mt-1">
                            <div className="text-right">
                                <div className="text-xs text-gray-400">Before</div>
                                <div className="font-mono font-bold text-gray-700">{impactStats.preQty.toFixed(1)}/day</div>
                            </div>
                            <ArrowRight className="w-4 h-4 text-gray-300" />
                            <div className="text-right">
                                <div className="text-xs text-gray-400">After</div>
                                <div className={`font-mono font-bold ${impactStats.qtyChangePct > 0 ? 'text-green-600' : 'text-red-600'}`}>
                                    {impactStats.postQty.toFixed(1)}/day
                                </div>
                            </div>
                        </div>
                        <div className={`text-xs font-bold mt-1 flex items-center gap-1 ${impactStats.qtyChangePct > 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {impactStats.qtyChangePct > 0 ? <TrendingUp className="w-3 h-3"/> : <TrendingDown className="w-3 h-3"/>}
                            {Math.abs(impactStats.qtyChangePct).toFixed(1)}% Volume Change
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-6 text-center text-gray-500">
                    No recent price changes detected for this product.
                </div>
            )}

            {/* Chart */}
            <div className="h-[400px] w-full bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-700 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-gray-400" /> 
                        Sales Velocity vs. Price History
                    </h3>
                    <div className="flex gap-4 text-xs">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-indigo-500 rounded-sm"></div> Price (£)</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-400 rounded-sm"></div> Daily Sales (Qty)</div>
                    </div>
                </div>
                
                <div className="flex-1 min-h-0">
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={chartData} margin={{ top: 10, right: 10, bottom: 0, left: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                            <XAxis 
                                dataKey="date" 
                                tickFormatter={(val) => new Date(val).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                                tick={{fontSize: 10, fill: '#9ca3af'}}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis 
                                yAxisId="left" 
                                orientation="left" 
                                tick={{fontSize: 10, fill: '#6366f1'}} 
                                axisLine={false}
                                tickLine={false}
                                label={{ value: 'Price (£)', angle: -90, position: 'insideLeft', fill: '#6366f1', fontSize: 10 }}
                                domain={['auto', 'auto']}
                            />
                            <YAxis 
                                yAxisId="right" 
                                orientation="right" 
                                tick={{fontSize: 10, fill: '#10b981'}} 
                                axisLine={false}
                                tickLine={false}
                                label={{ value: 'Qty Sold', angle: 90, position: 'insideRight', fill: '#10b981', fontSize: 10 }}
                            />
                            <Tooltip 
                                contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb', fontSize: '12px' }}
                                labelFormatter={(label) => new Date(label).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                            />
                            
                            {/* Render Price Change Vertical Lines */}
                            {relevantChanges.map((change, idx) => (
                                <ReferenceLine 
                                    key={idx} 
                                    x={change.date.split('T')[0]} 
                                    yAxisId="left" 
                                    stroke="#9ca3af" 
                                    strokeDasharray="3 3"
                                    label={{ 
                                        position: 'insideTop', 
                                        value: 'Price Change', 
                                        fill: '#6b7280', 
                                        fontSize: 10,
                                        angle: 90 
                                    }} 
                                />
                            ))}

                            <Bar yAxisId="right" dataKey="qty" fill="#34d399" barSize={20} radius={[4, 4, 0, 0]} opacity={0.6} name="Quantity Sold" />
                            <Line yAxisId="left" type="stepAfter" dataKey="price" stroke="#6366f1" strokeWidth={3} dot={false} name="Price (£)" />
                        </ComposedChart>
                    </ResponsiveContainer>
                </div>
            </div>

        </div>
      </div>
    </div>
  );
};

export default PriceElasticityModal;
