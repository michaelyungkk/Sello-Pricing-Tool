
import React from 'react';
import { TagSearchInput } from '../../TagSearchInput';
import { Percent, Hash, Divide, Eye, EyeOff } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ViewMode } from '../types';

interface CostSummarySectionProps {
    themeColor: string;
    headerStyle: React.CSSProperties;
    includeVat: boolean;
    setIncludeVat: (v: boolean) => void;
    showPercentPrimary: boolean;
    setShowPercentPrimary: (v: boolean) => void;
    viewMode: ViewMode;
    setViewMode: (v: any) => void;
    searchTags: string[];
    setSearchTags: (t: string[]) => void;
    setSearch: (s: string) => void;
    setCurrentPage: (p: number) => void;
    showInactive: boolean;
    setShowInactive: (v: boolean) => void;
}

export const CostSummarySection: React.FC<CostSummarySectionProps> = ({
    themeColor, headerStyle,
    includeVat, setIncludeVat,
    showPercentPrimary, setShowPercentPrimary,
    viewMode, setViewMode,
    searchTags, setSearchTags, setSearch, setCurrentPage,
    showInactive, setShowInactive
}) => {
    const { t } = useTranslation();

    return (
        <div className="w-full space-y-4">
            <div className="flex flex-col md:flex-row justify-between items-center mb-2 gap-4">
                <div>
                    <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>{t('cost_management_title')}</h2>
                    <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>{t('cost_management_desc')}</p>
                </div>
                
                <div className="flex items-center gap-3">
                    <button 
                        onClick={() => setIncludeVat(!includeVat)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${includeVat ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                        {includeVat ? t('vat_included') : t('vat_excluded')}
                    </button>

                    <button 
                        onClick={() => setShowPercentPrimary(!showPercentPrimary)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${showPercentPrimary ? 'bg-purple-50 text-purple-700 border-purple-200' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                        {showPercentPrimary ? <Percent className="w-3 h-3" /> : <Hash className="w-3 h-3" />}
                        {showPercentPrimary ? t('primary_percent') : t('primary_value')}
                    </button>
                    <button 
                        onClick={() => setViewMode((prev: ViewMode) => prev === 'ABSOLUTE' ? 'PER_UNIT' : 'ABSOLUTE')}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-colors ${viewMode === 'PER_UNIT' ? 'bg-teal-50 text-teal-700 border-teal-200' : 'bg-white text-gray-500 border-gray-200'}`}
                    >
                        {viewMode === 'PER_UNIT' ? <Divide className="w-3 h-3" /> : <Hash className="w-3 h-3" />}
                        {viewMode === 'PER_UNIT' ? 'Per Unit' : 'Absolute'}
                    </button>
                </div>
            </div>

            <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex items-center gap-4 relative z-20">
                <div className="relative flex-1">
                    <TagSearchInput 
                        tags={searchTags}
                        onTagsChange={(tags) => { setSearchTags(tags); setCurrentPage(1); }}
                        onInputChange={(val) => { setSearch(val); setCurrentPage(1); }}
                        placeholder="Search SKU or Alias..."
                        themeColor={themeColor}
                    />
                </div>
                <div className="flex items-center justify-between px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 min-w-[180px]">
                    <span className="text-xs font-bold text-gray-500 uppercase mr-2">{t('show_inactive')}</span>
                    <button onClick={() => setShowInactive(!showInactive)} className="text-gray-500 hover:text-indigo-600 focus:outline-none" style={showInactive ? { color: themeColor } : {}}>{showInactive ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}</button>
                </div>
            </div>
        </div>
    );
};
