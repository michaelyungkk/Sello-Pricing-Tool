
import React, { useMemo } from 'react';
import { formatSmartMoney } from '../utils/format';
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
import { GradeBadge } from './GradeBadge';
import { useTranslation } from 'react-i18next';

interface PriceElasticityModalProps {
  product: Product;
  priceHistory: PriceLog[];
  priceChangeHistory: PriceChangeRecord[];
  onClose: () => void;
}

const PriceElasticityModal: React.FC<PriceElasticityModalProps> = ({ product, priceHistory, priceChangeHistory, onClose }) => {
  const { t } = useTranslation();

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
      entry.count += 1;
    });

    return Array.from(dailyMap.values()).map(d => ({
      date: d.date,
      price: d.qty > 0 ? d.price / d.qty : 0,
      qty: d.qty
    })).map(d => {
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
              <span className="px-2 py-0.5 text-xs font-medium bg-indigo-100 text-indigo-700 rounded uppercase tracking-wide">
                {t('elasticity_analysis')}
              </span>
              <div className="flex items-center">
                <span className="text-sm text-gray-500 font-mono">{product.sku}</span>
                <GradeBadge gradeLevel={product.gradeLevel} />
              </div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{product.name}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200/50 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto space-y-6">

          {/* Impact Analysis Card */}
          {impactStats ? (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-600" />
                  {t('latest_price_event')}
                </h3>
                <span className="text-xs text-gray-500 flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  {new Date(impactStats.date).toLocaleDateString()}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">Price Change</div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 line-through text-sm">{formatSmartMoney(impactStats.oldPrice)}</span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span className="text-xl font-bold text-gray-900">{formatSmartMoney(impactStats.newPrice)}</span>
                    </div>
                    <div className={`text-sm font-bold ${(impactStats.priceChangePct || 0) > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {(impactStats.priceChangePct || 0) > 0 ? '+' : ''}{(impactStats.priceChangePct || 0).toFixed(1)}%
                    </div>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-4 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-gray-500 uppercase font-bold mb-1">{t('velocity_impact')}</div>
                    <div className="flex items-center gap-3">
                      <span className="text-gray-400 text-sm">{impactStats.preQty.toFixed(1)}/d</span>
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span className="text-xl font-bold text-gray-900">{impactStats.postQty.toFixed(1)}/d</span>
                    </div>
                  </div>
                  <div className={`text-sm font-bold ${impactStats.qtyChangePct > 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {impactStats.qtyChangePct > 0 ? '+' : ''}{impactStats.qtyChangePct.toFixed(1)}%
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gray-50 p-6 rounded-xl border border-gray-200 text-center text-gray-500">
              No recent price changes detected to analyze elasticity.
            </div>
          )}

          {/* Elasticity Chart */}
          <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                <XAxis
                  dataKey="date"
                  tickFormatter={(val) => new Date(val).toLocaleDateString('en-GB', { month: 'short', day: 'numeric' })}
                  tick={{ fontSize: 11 }}
                />
                <YAxis yAxisId="left" label={{ value: 'Units Sold', angle: -90, position: 'insideLeft' }} />
                <YAxis yAxisId="right" orientation="right" label={{ value: 'Price (£)', angle: 90, position: 'insideRight' }} domain={['auto', 'auto']} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#fff', borderRadius: '8px', border: '1px solid #e5e7eb' }}
                  labelFormatter={(label) => new Date(label).toLocaleDateString('en-GB', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                />
                <Legend />
                <Bar yAxisId="left" dataKey="qty" name="Units Sold" fill="#8b5cf6" barSize={20} radius={[4, 4, 0, 0]} />
                <Line yAxisId="right" type="stepAfter" dataKey="price" name="Avg Price" stroke="#10b981" strokeWidth={2} dot={false} />

                {relevantChanges.map((change) => (
                  <ReferenceLine
                    key={change.id}
                    x={change.date}
                    stroke="#ef4444"
                    strokeDasharray="3 3"
                    yAxisId="left"
                    label={{ position: 'top', value: 'Price Change', fill: '#ef4444', fontSize: 10 }}
                  />
                ))}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="p-6 border-t border-gray-100/50 bg-gray-50/50 rounded-b-2xl flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm font-bold hover:bg-gray-50 rounded-lg transition-colors shadow-sm"
          >
            Close Analysis
          </button>
        </div>
      </div>
    </div>
  );
};

export default PriceElasticityModal;
