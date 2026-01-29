import React, { useMemo } from 'react';
import { ChipSelectionState, Suggestion, SuggestionPriority } from './types';
import { getSuggestions } from './suggestionEngine';
import { TrendingUp, AlertTriangle, Package, Search, Zap, TrendingDown, DollarSign, Activity, BarChart2, ShoppingBag, Clock, ArrowRight, Filter, Globe, Tag } from 'lucide-react';
import { Product } from '../../types';
import { useTranslation } from 'react-i18next';

interface SearchAssistantPopoverProps {
  state: ChipSelectionState;
  onApply: (suggestion: Suggestion) => void;
  onClear: () => void;
  isVisible: boolean;
  products?: Product[];
}

const PriorityIcon = ({ priority }: { priority: SuggestionPriority }) => {
  switch (priority) {
    case 'RISK': return <AlertTriangle className="w-3.5 h-3.5 text-red-500" />;
    case 'DECLINE': return <TrendingDown className="w-3.5 h-3.5 text-amber-500" />;
    case 'INVENTORY': return <Package className="w-3.5 h-3.5 text-blue-500" />;
    case 'OPPORTUNITY': return <TrendingUp className="w-3.5 h-3.5 text-green-500" />;
    default: return <Activity className="w-3.5 h-3.5 text-gray-400" />;
  }
};

const KindIcon = ({ kind }: { kind: string }) => {
    if (kind === 'metric') return <BarChart2 className="w-3.5 h-3.5 opacity-50" />;
    if (kind === 'shortcut') return <Zap className="w-3.5 h-3.5 text-yellow-500" />;
    if (kind === 'sku') return <Tag className="w-3.5 h-3.5 text-indigo-500" />;
    return null;
}

export const SearchAssistantPopover: React.FC<SearchAssistantPopoverProps> = ({ state, onApply, onClear, isVisible, products = [] }) => {
  const { t } = useTranslation();
  const suggestions = useMemo(() => getSuggestions(state, products), [state, products]);

  if (!isVisible) return null;

  // --- SKU SEARCH MODE RENDER ---
  if (suggestions.skuSuggestions.length > 0 || (state.searchText.toLowerCase().startsWith('sku:') || state.searchText.toLowerCase().startsWith('sku '))) {
      return (
        <div className="absolute top-full left-0 mt-2 w-full max-w-3xl bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-[80vh] overflow-y-auto">
            <div className="p-4 bg-indigo-50/50 border-b border-indigo-100 flex items-center gap-2">
                <Tag className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-indigo-700 uppercase">{t('search_assistant_sku_mode')}</span>
            </div>
            <div className="p-2">
                {suggestions.skuSuggestions.length > 0 ? (
                    <div className="space-y-1">
                        {suggestions.skuSuggestions.map(s => (
                            <button
                                key={s.id}
                                onClick={() => onApply(s)}
                                className="w-full flex items-center gap-3 p-3 text-left bg-white hover:bg-indigo-50 border border-transparent hover:border-indigo-100 rounded-lg transition-all group"
                            >
                                <div className="font-mono font-bold text-sm text-gray-800">{s.label}</div>
                                <div className="text-xs text-gray-500 truncate flex-1">{s.description}</div>
                                <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-indigo-400" />
                            </button>
                        ))}
                    </div>
                ) : (
                    <div className="p-8 text-center text-gray-400 text-sm">
                        {t('search_assistant_no_products', { query: state.searchText.replace(/^sku[:\s]+/, '') })}
                    </div>
                )}
            </div>
        </div>
      );
  }

  // Only show platform suggestions if the user has typed something to refine scope
  // This effectively removes the static "preset" list while keeping search functionality
  const showPlatforms = state.searchText.trim().length > 0;

  return (
    <div className="absolute top-full left-0 mt-2 w-full max-w-3xl bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-gray-200 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200 max-h-[80vh] overflow-y-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-100">
        
        {/* LEFT COLUMN: Metrics & Conditions */}
        <div className="p-4 space-y-6">
          
          {/* Section 1: Metrics */}
          {suggestions.metricSuggestions.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                <Search className="w-3 h-3" /> {t('search_assistant_analyze')}
              </h4>
              <div className="grid grid-cols-2 gap-2">
                {suggestions.metricSuggestions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => onApply(s)}
                    className="flex items-center gap-2 px-3 py-2 text-left text-xs bg-gray-50 hover:bg-indigo-50 hover:text-indigo-700 border border-transparent hover:border-indigo-200 rounded-lg transition-all group"
                    title={s.description}
                  >
                    <KindIcon kind="metric" />
                    <span className="font-medium text-gray-700 group-hover:text-indigo-700 truncate">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section 2: Conditions */}
          {suggestions.conditionSuggestions.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                <Activity className="w-3 h-3" /> {t('search_assistant_condition')}
              </h4>
              <div className="flex flex-wrap gap-2">
                {suggestions.conditionSuggestions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => onApply(s)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-white border border-gray-200 hover:border-gray-300 hover:shadow-sm rounded-full transition-all"
                    title={s.description}
                  >
                    <PriorityIcon priority={s.priority} />
                    <span className="font-medium text-gray-700">{s.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: Shortcuts & Scope */}
        <div className="bg-gray-50/50 p-4 space-y-6">
          
          {/* Section 3: Shortcuts */}
          {suggestions.shortcutSuggestions.length > 0 && (
            <div>
              <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                <Zap className="w-3 h-3" /> {t('search_assistant_shortcuts')}
              </h4>
              <div className="space-y-2">
                {suggestions.shortcutSuggestions.map(s => (
                  <button
                    key={s.id}
                    onClick={() => onApply(s)}
                    className="w-full flex items-center justify-between p-3 text-left bg-white border border-gray-200 hover:border-indigo-300 hover:shadow-md rounded-xl transition-all group"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`p-1.5 rounded-lg ${s.priority === 'RISK' ? 'bg-red-50 text-red-600' : s.priority === 'OPPORTUNITY' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'}`}>
                        <KindIcon kind="shortcut" />
                      </div>
                      <span className="text-xs font-semibold text-gray-700 group-hover:text-indigo-700">{s.label}</span>
                    </div>
                    <ArrowRight className="w-3 h-3 text-gray-300 group-hover:text-indigo-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Section 4: Refine Scope (Time & Platform) */}
          {(suggestions.timeSuggestions.length > 0 || (showPlatforms && suggestions.platformSuggestions.length > 0)) && (
            <div>
                <h4 className="text-[10px] font-bold text-gray-400 uppercase mb-3 flex items-center gap-2">
                    <Filter className="w-3 h-3" /> {t('search_assistant_refine')}
                </h4>
                
                {/* Time */}
                {suggestions.timeSuggestions.length > 0 && (
                    <div className="mb-3">
                        <div className="flex flex-wrap gap-2">
                            {suggestions.timeSuggestions.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => onApply(s)}
                                    className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-100 hover:border-blue-300 hover:shadow-sm rounded-full transition-all"
                                >
                                    <Clock className="w-3 h-3" />
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}

                {/* Platforms - Only shown if searching */}
                {showPlatforms && suggestions.platformSuggestions.length > 0 && (
                    <div>
                        <div className="flex flex-wrap gap-2">
                            {suggestions.platformSuggestions.map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => onApply(s)}
                                    className="flex items-center gap-1.5 px-3 py-1 text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-100 hover:border-purple-300 hover:shadow-sm rounded-full transition-all"
                                >
                                    <Globe className="w-3 h-3" />
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-gray-200/50 flex justify-between items-center">
             <span className="text-[10px] text-gray-400">
               {t('search_assistant_footer')}
             </span>
             <button onClick={onClear} className="text-[10px] font-bold text-gray-500 hover:text-red-600 transition-colors">
               {t('search_assistant_clear')}
             </button>
          </div>
        </div>
      </div>
    </div>
  );
};