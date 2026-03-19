
import React from 'react';
import { Filter, Calendar, ShoppingBag, Megaphone, Activity, Clock, DollarSign, Package, TrendingDown, TrendingUp, Layers, RotateCcw } from 'lucide-react';
import { SearchIntent } from '../../../../services/geminiService';
import { FilterChip } from './FilterChip';

interface SearchHeaderProps {
    data: { results: any[], query: string, params: SearchIntent, id?: string };
    themeColor: string;
    timeLabel?: string;
    context: {
        isVolume: boolean;
        isAd: boolean;
        isOrganic: boolean;
        isAged: boolean;
        isMargin: boolean;
        isInventory: boolean;
        isTrend: boolean;
        isReturn: boolean;
    };
    onRefine: (sessionId: string, newIntent: SearchIntent) => void;
    handleSortUpdate: (field: string, direction: 'asc' | 'desc') => void;
    groupBy: 'platform' | 'sku';
    setGroupBy: (g: 'platform' | 'sku') => void;
}

export const SearchHeader: React.FC<SearchHeaderProps> = ({ 
    data, themeColor, timeLabel, context, onRefine, handleSortUpdate, groupBy, setGroupBy 
}) => {

    const handleFilterUpdate = (index: number, newFilter: any) => {
        const newFilters = [...(data.params.filters || [])];
        newFilters[index] = newFilter;
        const newIntent: SearchIntent = { ...data.params, filters: newFilters };
        if (data.id) onRefine(data.id, newIntent);
    };
  
    const handleFilterDelete = (index: number) => {
        const newFilters = (data.params.filters || []).filter((_, i) => i !== index);
        const newIntent: SearchIntent = { ...data.params, filters: newFilters };
        if (data.id) onRefine(data.id, newIntent);
    };

    return (
        <div className="space-y-4">
            {data.params && data.params.filters && data.params.filters.length > 0 && (
                <div className="bg-theme-10/50 border-b border-indigo-100 p-3 rounded-lg flex flex-wrap items-center gap-2">
                    <span className="text-[10px] font-medium text-theme uppercase tracking-wide flex items-center gap-1">
                        <Filter className="w-3 h-3" /> Active Logic:
                    </span>
                    {data.params.filters.map((filter: any, idx: number) => (
                        <FilterChip 
                            key={idx} 
                            filter={filter} 
                            onUpdate={(f) => handleFilterUpdate(idx, f)}
                            onDelete={() => handleFilterDelete(idx)}
                            themeColor={themeColor}
                        />
                    ))}
                    {data.params.timeRange && (
                        <div className="px-3 py-1 bg-white border border-gray-200 rounded-full text-xs font-medium text-gray-600">
                            Time: {data.params.timeRange.value}
                        </div>
                    )}
                </div>
            )}

            <div className="mb-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <p className="text-sm text-gray-500 flex items-center gap-1">Search results for:</p>
                    <div className="flex items-center gap-2">
                        <h2 className="text-xl font-bold text-gray-800">&quot;{data.query}&quot;</h2>
                        {data.results.length > 0 && (
                            <span className="bg-theme-10 text-theme px-2 py-0.5 rounded-full text-xs font-medium">
                                {data.results.length} hits
                            </span>
                        )}
                    </div>
                </div>
                
                <div className="flex items-center gap-3">
                    {/* Context Pills */}
                    {timeLabel && (<div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 text-gray-600 text-xs font-medium rounded-lg border border-gray-200"><Calendar className="w-3.5 h-3.5" />{timeLabel}</div>)}
                    {context.isVolume && (<div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 text-xs font-medium rounded-lg border border-blue-100"><ShoppingBag className="w-3.5 h-3.5" />Volume View</div>)}
                    {context.isAd && (<div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-700 text-xs font-medium rounded-lg border border-orange-100"><Megaphone className="w-3.5 h-3.5" />Ad Performance</div>)}
                    {context.isOrganic && (<div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg border border-green-100"><Activity className="w-3.5 h-3.5" />Organic Share</div>)}
                    {context.isAged && (<div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 text-amber-700 text-xs font-medium rounded-lg border border-amber-100"><Clock className="w-3.5 h-3.5" />Aged Inventory</div>)}
                    {context.isMargin && (<div className="flex items-center gap-2 px-3 py-1.5 bg-green-50 text-green-700 text-xs font-medium rounded-lg border border-green-100"><DollarSign className="w-3.5 h-3.5" />Profit Analysis</div>)}
                    
                    {context.isInventory && (
                        <div className="flex items-center gap-2 px-3 py-1.5 bg-orange-50 text-orange-700 text-xs font-medium rounded-lg border border-orange-100">
                            <Package className="w-3.5 h-3.5" />
                            Inventory Health
                        </div>
                    )}
                    {context.isInventory && (
                         <div className="text-[10px] text-gray-400 italic hidden lg:block">
                            * Runway based on current Velocity Lookback setting.
                         </div>
                    )}

                    {context.isTrend && (<div className="flex items-center gap-2 px-3 py-1.5 bg-cyan-50 text-cyan-700 text-xs font-medium rounded-lg border border-cyan-100"><TrendingDown className="w-3.5 h-3.5" />Trend Analysis</div>)}
                    {context.isReturn && (<div className="flex items-center gap-2 px-3 py-1.5 bg-red-50 text-red-700 text-xs font-medium rounded-lg border border-red-100"><RotateCcw className="w-3.5 h-3.5" />Returns</div>)}
                    
                    <div className="flex items-center gap-2 bg-white p-1 rounded-lg border border-gray-200 shadow-sm">
                        {/* Add Trend Sort Controls */}
                        {context.isTrend && (
                            <div className="flex border-r border-gray-200 pr-2 mr-2">
                                <button
                                    onClick={() => handleSortUpdate(data.params.primaryMetric || 'VELOCITY_CHANGE', 'desc')}
                                    className={`px-2 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${data.params.sort?.direction === 'desc' ? 'bg-green-50 text-green-700' : 'text-gray-500 hover:text-green-600'}`}
                                    title="Sort by Top Risers (Growth)"
                                >
                                    <TrendingUp className="w-3 h-3" /> Risers
                                </button>
                                <button
                                    onClick={() => handleSortUpdate(data.params.primaryMetric || 'VELOCITY_CHANGE', 'asc')}
                                    className={`px-2 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${data.params.sort?.direction === 'asc' ? 'bg-red-50 text-red-700' : 'text-gray-500 hover:text-red-600'}`}
                                    title="Sort by Top Fallers (Decline)"
                                >
                                    <TrendingDown className="w-3 h-3" /> Fallers
                                </button>
                            </div>
                        )}

                        <span className="text-[10px] font-medium text-gray-400 pl-1 uppercase">Group by</span>
                        <div className="flex">
                            <button 
                                onClick={() => !context.isInventory && !context.isAged && setGroupBy('platform')} 
                                disabled={context.isInventory || context.isAged}
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${groupBy === 'platform' ? 'bg-theme-10 text-theme shadow-sm border border-indigo-100' : 'text-gray-500 hover:text-gray-700'} ${(context.isInventory || context.isAged) ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <Layers className="w-3 h-3" /> Platform
                            </button>
                            <button 
                                onClick={() => setGroupBy('sku')} 
                                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all flex items-center gap-1 ${groupBy === 'sku' ? 'bg-theme-10 text-theme shadow-sm border border-indigo-100' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Package className="w-3 h-3" /> SKU
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
