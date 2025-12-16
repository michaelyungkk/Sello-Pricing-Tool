
import React from 'react';
import { Product, AnalysisResult } from '../types';
import StockChart from './StockChart';
import { Check, AlertTriangle, X, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';

interface AnalysisModalProps {
  product: Product;
  analysis: AnalysisResult | null;
  isLoading: boolean;
  onClose: () => void;
  onApplyPrice: (productId: string, newPrice: number) => void;
  themeColor: string;
}

const AnalysisModal: React.FC<AnalysisModalProps> = ({ product, analysis, isLoading, onClose, onApplyPrice, themeColor }) => {
  if (!product) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50 rounded-t-2xl">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 text-xs font-semibold bg-gray-200 text-gray-700 rounded uppercase tracking-wide">
                {product.platform || (product.channels?.[0]?.platform) || 'Multi-Channel'}
              </span>
              <span className="text-sm text-gray-500">{product.sku}</span>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">{product.name}</h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-20 space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2" style={{ borderColor: themeColor }}></div>
              <p className="text-gray-500 animate-pulse">Consulting Gemini AI...</p>
            </div>
          ) : analysis ? (
            <div className="space-y-8">
              {/* Top Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                  <p className="text-sm text-blue-600 mb-1 font-medium">Current Status</p>
                  <div className="flex items-end gap-2">
                    <span className="text-2xl font-bold text-blue-900">{analysis.daysRemaining.toFixed(0)} Days</span>
                    <span className="text-sm text-blue-700 mb-1">stock remaining</span>
                  </div>
                  <p className="text-xs text-blue-500 mt-2">Restock in {product.leadTimeDays} days</p>
                </div>

                <div className={`p-4 rounded-xl border ${
                  analysis.status === 'Critical' ? 'bg-red-50 border-red-100' :
                  analysis.status === 'Warning' ? 'bg-amber-50 border-amber-100' :
                  analysis.status === 'Overstock' ? 'bg-orange-50 border-orange-100' :
                  'bg-green-50 border-green-100'
                }`}>
                  <p className={`text-sm mb-1 font-medium ${
                    analysis.status === 'Critical' ? 'text-red-600' :
                    analysis.status === 'Warning' ? 'text-amber-600' :
                    analysis.status === 'Overstock' ? 'text-orange-600' :
                    'text-green-600'
                  }`}>Health Assessment</p>
                  <div className="flex items-center gap-2">
                    {analysis.status === 'Critical' && <AlertTriangle className="w-6 h-6 text-red-600" />}
                    <span className={`text-2xl font-bold ${
                      analysis.status === 'Critical' ? 'text-red-900' :
                      analysis.status === 'Warning' ? 'text-amber-900' :
                      analysis.status === 'Overstock' ? 'text-orange-900' :
                      'text-green-900'
                    }`}>{analysis.status}</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border flex flex-col justify-between" style={{ backgroundColor: `${themeColor}10`, borderColor: `${themeColor}20` }}>
                  <p className="text-sm font-medium" style={{ color: themeColor }}>Recommended Action</p>
                  <div className="flex items-center gap-3 mt-1">
                    <div>
                      <span className="text-2xl font-bold text-gray-900">£{analysis.recommendedPrice.toFixed(2)}</span>
                      <span className="text-xs text-gray-500 ml-2">Currently £{product.currentPrice}</span>
                    </div>
                  </div>
                  <div className={`text-sm mt-2 font-semibold flex items-center gap-1 ${
                    analysis.percentageChange > 0 ? 'text-emerald-600' : analysis.percentageChange < 0 ? 'text-red-600' : 'text-gray-500'
                  }`}>
                    {analysis.percentageChange > 0 ? <TrendingUp className="w-4 h-4" /> : analysis.percentageChange < 0 ? <TrendingDown className="w-4 h-4" /> : null}
                    {analysis.percentageChange > 0 ? '+' : ''}{analysis.percentageChange}% Adjustment
                  </div>
                </div>
              </div>

              {/* Reasoning */}
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm">
                <h3 className="font-semibold text-gray-900 mb-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: themeColor }}></span>
                  AI Strategy Reasoning
                </h3>
                <p className="text-gray-600 leading-relaxed">{analysis.reasoning}</p>
              </div>

              {/* Chart */}
              <StockChart 
                currentStock={product.stockLevel}
                dailySalesCurrent={product.averageDailySales}
                dailySalesProjected={
                  // Simple heuristic for chart visualization: Price up 5% = Sales down 10% (elasticity assumption for visual)
                  // In a real app, AI would return projected velocity.
                  analysis.percentageChange > 0 
                    ? product.averageDailySales * 0.85 
                    : analysis.percentageChange < 0 
                      ? product.averageDailySales * 1.2 
                      : product.averageDailySales
                }
                leadTimeDays={product.leadTimeDays}
              />

            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          {analysis && (
            <button 
              onClick={() => onApplyPrice(product.id, analysis.recommendedPrice)}
              className="px-6 py-2 text-white font-medium rounded-lg shadow-md transition-all flex items-center gap-2"
              style={{ backgroundColor: themeColor, boxShadow: `0 4px 6px -1px ${themeColor}40` }}
            >
              <Check className="w-4 h-4" />
              Apply New Price
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AnalysisModal;
