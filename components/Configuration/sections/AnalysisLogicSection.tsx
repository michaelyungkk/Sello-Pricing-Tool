
import React from 'react';
import { SearchConfig } from '../../../types';
import AlertThresholdSettings from '../../AlertThresholdSettings';
import { BarChart2, Scale } from 'lucide-react';

interface AnalysisLogicSectionProps {
    subSection: 'thresholds' | 'search';
    searchConfig: SearchConfig;
    setSearchConfig: (config: SearchConfig) => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
    onRefreshThresholds?: () => void;
}

export const AnalysisLogicSection: React.FC<AnalysisLogicSectionProps> = ({
    subSection, searchConfig, setSearchConfig, themeColor, headerStyle, onRefreshThresholds
}) => {
    if (subSection === 'thresholds') {
        return <AlertThresholdSettings themeColor={themeColor} onSaveComplete={onRefreshThresholds} />;
    }

    return (
        <div className="space-y-6">
            <div>
                <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Search Result Settings</h2>
                <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                    Fine-tune how search results are visualized and banded.
                </p>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 bg-theme-10 rounded-lg text-theme">
                                <BarChart2 className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-gray-900">Volume Distribution Bands</h3>
                        </div>
                        <p className="text-sm text-gray-500 mb-4">
                            Configure the percentile thresholds used to classify sales volume into Top, Middle, and Bottom tiers in the Volume View.
                        </p>
                        
                        <div className="space-y-4">
                            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Top Band Threshold (%)</label>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="number" 
                                        min="1" max="99" 
                                        value={searchConfig.volumeBands.topPercentile}
                                        onChange={e => setSearchConfig({...searchConfig, volumeBands: {...searchConfig.volumeBands, topPercentile: parseFloat(e.target.value)}})}
                                        className="w-20 border rounded p-2 text-sm font-bold text-gray-900"
                                    />
                                    <span className="text-sm text-gray-600">The top {searchConfig.volumeBands.topPercentile}% of products by volume</span>
                                </div>
                            </div>

                            <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                                <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Bottom Band Threshold (%)</label>
                                <div className="flex items-center gap-3">
                                    <input 
                                        type="number" 
                                        min="1" max="99" 
                                        value={searchConfig.volumeBands.bottomPercentile}
                                        onChange={e => setSearchConfig({...searchConfig, volumeBands: {...searchConfig.volumeBands, bottomPercentile: parseFloat(e.target.value)}})}
                                        className="w-20 border rounded p-2 text-sm font-bold text-gray-900"
                                    />
                                    <span className="text-sm text-gray-600">The bottom {searchConfig.volumeBands.bottomPercentile}% of products by volume</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div>
                        <div className="flex items-center gap-2 mb-4">
                            <div className="p-2 bg-gray-100 rounded-lg text-gray-600">
                                <Scale className="w-5 h-5" />
                            </div>
                            <h3 className="font-bold text-gray-900">Minimum Volume Floor</h3>
                        </div>
                        <p className="text-sm text-gray-500 mb-4">
                            Define the absolute minimum sales quantity required to enable scale coloring. If the max volume in a result set is below this, distribution bands are disabled.
                        </p>

                        <div className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-2">Absolute Floor (Units)</label>
                            <div className="flex items-center gap-3">
                                <input 
                                    type="number" 
                                    min="0"
                                    value={searchConfig.minAbsoluteFloor}
                                    onChange={e => setSearchConfig({...searchConfig, minAbsoluteFloor: parseFloat(e.target.value)})}
                                    className="w-20 border rounded p-2 text-sm font-bold text-gray-900"
                                />
                                <span className="text-sm text-gray-600">units</span>
                            </div>
                            <p className="text-xs text-gray-400 mt-2">
                                Prevents misleading &quot;Top Performer&quot; badges on low-volume data sets (e.g. daily views).
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
