
import React, { useState, useMemo } from 'react';
import { PriceChangeRecord } from '../../types';
import { ChevronDown, ChevronRight, History, TrendingUp, TrendingDown, ArrowRight } from 'lucide-react';
import { formatMoney, formatSmartMoney } from '../../utils/format';
import { asDateKey } from '../../services/dateUtils';

interface PriceChangeHistoryPanelProps {
  history: PriceChangeRecord[];
  sku: string;
  windowStart: string; // Kept for interface compatibility but unused for filtering
  windowEnd: string;   // Kept for interface compatibility but unused for filtering
  themeColor: string;
}

export const PriceChangeHistoryPanel: React.FC<PriceChangeHistoryPanelProps> = ({
  history,
  sku,
  windowStart,
  windowEnd,
  themeColor
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Filter and Sort
  const relevantHistory = useMemo(() => {
    const safeArr = Array.isArray(history) ? history : [];
    if (process.env.NODE_ENV === 'development' && history && !Array.isArray(history)) {
        console.warn('PriceChangeHistoryPanel: History prop is not an array', history);
    }
    
    // Normalize target SKU for comparison
    const targetSku = sku.trim().toUpperCase();

    return safeArr
      .filter(r => {
          // Robust SKU check (Case insensitive, trimmed)
          if (!r.sku || r.sku.trim().toUpperCase() !== targetSku) return false;
          
          // Date window filtering removed to show all history
          return true;
      })
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [history, sku]);

  const latest = relevantHistory.length > 0 ? relevantHistory[0] : null;

  const getSource = (id: string) => {
      if (id.startsWith('manual-')) return 'Manual';
      if (id.startsWith('ca-chg-')) return 'CA Import';
      if (id.startsWith('chg-')) return 'Strategy Engine';
      return 'System';
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden mb-6 animate-in fade-in slide-in-from-bottom-2">
      <div 
        className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-3">
          <div className={`p-1.5 rounded-lg ${relevantHistory.length > 0 ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
             <History className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-bold text-gray-800 flex items-center gap-2">
                Price Change History
                <span className="text-[10px] font-normal text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                    {relevantHistory.length} events
                </span>
            </h4>
            {!isExpanded && (
                <p className="text-xs text-gray-500 mt-0.5">
                    {latest 
                        ? `Last change: ${new Date(latest.date).toLocaleDateString('en-GB')} • ${formatSmartMoney(latest.oldPrice)} → ${formatSmartMoney(latest.newPrice)}`
                        : "No price changes recorded"
                    }
                </p>
            )}
          </div>
        </div>
        <div className="text-gray-400">
           {isExpanded ? <ChevronDown className="w-5 h-5" /> : <ChevronRight className="w-5 h-5" />}
        </div>
      </div>

      {isExpanded && (
          <div className="border-t border-gray-100">
             {relevantHistory.length === 0 ? (
                 <div className="p-8 text-center text-gray-500 text-sm italic">
                     No price changes recorded.
                 </div>
             ) : (
                 <div className="overflow-x-auto">
                     <table className="tbl w-full text-left text-xs whitespace-nowrap">
                         <thead>
                             <tr>
                                 <th className="p-3 pl-4">Date/Time</th>
                                 <th className="p-3">Platform</th>
                                 <th className="p-3">Change Type</th>
                                 <th className="p-3 text-right">Old Price</th>
                                 <th className="p-3 text-center"></th>
                                 <th className="p-3 text-right">New Price</th>
                                 <th className="p-3 text-right">Δ Impact</th>
                                 <th className="p-3 pr-4 text-right">Source</th>
                             </tr>
                         </thead>
                         <tbody>
                             {relevantHistory.map(record => {
                                 const delta = record.newPrice - record.oldPrice;
                                 const isIncrease = delta > 0;
                                 return (
                                     <tr key={record.id} className="">
                                         <td className="p-3 pl-4 font-mono text-gray-600">
                                             {new Date(record.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                         </td>
                                         <td className="p-3">
                                             <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100">
                                                 Master / CA
                                             </span>
                                         </td>
                                         <td className="p-3">
                                             <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold ${isIncrease ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                 {isIncrease ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                                                 {isIncrease ? 'INCREASE' : 'DECREASE'}
                                             </span>
                                         </td>
                                         <td className="p-3 text-right text-gray-500 line-through">
                                             {formatSmartMoney(record.oldPrice)}
                                         </td>
                                         <td className="p-3 text-center text-gray-400">
                                             <ArrowRight className="w-3 h-3 mx-auto" />
                                         </td>
                                         <td className="p-3 text-right font-bold text-gray-900">
                                             {formatSmartMoney(record.newPrice)}
                                         </td>
                                         <td className={`p-3 text-right font-bold ${isIncrease ? 'text-green-600' : 'text-red-600'}`}>
                                             {isIncrease ? '+' : ''}{formatSmartMoney(delta)} ({isIncrease ? '+' : ''}{record.percentChange.toFixed(1)}%)
                                         </td>
                                         <td className="p-3 pr-4 text-right">
                                             <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200">
                                                 {getSource(record.id)}
                                             </span>
                                         </td>
                                     </tr>
                                 );
                             })}
                         </tbody>
                     </table>
                 </div>
             )}
          </div>
      )}
    </div>
  );
};
