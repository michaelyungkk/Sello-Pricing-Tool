
import React from 'react';
import { ConfigurationPageProps } from './types';
import { useConfigurationState } from './hooks/useConfigurationState';
import { PlatformConfigSection } from './sections/PlatformConfigSection';
import { SystemBehaviorSection } from './sections/SystemBehaviorSection';
import { AnalysisLogicSection } from './sections/AnalysisLogicSection';
import { PersonalizationSection } from './sections/PersonalizationSection';
import { Globe, Truck, AlertTriangle, Search, Save } from 'lucide-react';

export const ConfigurationPage: React.FC<ConfigurationPageProps> = (props) => {
    const {
        activeTab, setActiveTab, rules, logistics, searchConfig, setSearchConfig,
        newPlatformName, setNewPlatformName, isSaved, discoveredPlatforms, platformKeys,
        handleFieldChange, toggleExclusion, toggleAdsSupported, handleAddPlatform, handleDeletePlatform,
        handleLogisticsChange, handleAutoCalibrate, handleSave
    } = useConfigurationState(props);

    return (
        <div className="max-w-[1600px] mx-auto pb-10 flex flex-col">

            {/* Tab Navigation */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
                <button
                    onClick={() => setActiveTab('platforms')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'platforms' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Globe className="w-4 h-4" />
                    Platform Rules
                </button>

                <button
                    onClick={() => setActiveTab('logistics')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'logistics' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Truck className="w-4 h-4" />
                    Logistics Rates
                </button>

                <button
                    onClick={() => setActiveTab('thresholds')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'thresholds' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <AlertTriangle className="w-4 h-4" />
                    Alerts & Diagnostics
                </button>

                <button
                    onClick={() => setActiveTab('search')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'search' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Search className="w-4 h-4" />
                    Search Settings
                </button>
            </div>

            <div className="pr-2">
                {activeTab === 'platforms' && (
                    <PlatformConfigSection
                        rules={rules}
                        platformKeys={platformKeys}
                        discoveredPlatforms={discoveredPlatforms}
                        newPlatformName={newPlatformName}
                        setNewPlatformName={setNewPlatformName}
                        handleAddPlatform={handleAddPlatform}
                        handleFieldChange={handleFieldChange}
                        toggleExclusion={toggleExclusion}
                        toggleAdsSupported={toggleAdsSupported}
                        handleDeletePlatform={handleDeletePlatform}
                        themeColor={props.themeColor}
                        headerStyle={props.headerStyle}
                    />
                )}

                {activeTab === 'logistics' && (
                    <SystemBehaviorSection
                        logistics={logistics}
                        handleLogisticsChange={handleLogisticsChange}
                        handleAutoCalibrate={handleAutoCalibrate}
                        shipmentHistory={props.shipmentHistory}
                        themeColor={props.themeColor}
                        headerStyle={props.headerStyle}
                    />
                )}

                {(activeTab === 'thresholds' || activeTab === 'search') && (
                    <AnalysisLogicSection
                        subSection={activeTab}
                        searchConfig={searchConfig}
                        setSearchConfig={setSearchConfig}
                        themeColor={props.themeColor}
                        headerStyle={props.headerStyle}
                        onRefreshThresholds={props.onRefreshThresholds}
                    />
                )}
                
                <PersonalizationSection />
            </div>

            {/* Footer Actions (Sticky) */}
            <div className="pt-6 border-t border-custom-glass flex justify-end">
                {activeTab !== 'thresholds' && (
                    <button
                        onClick={handleSave}
                        disabled={isSaved}
                        className={`px-8 py-3 rounded-lg font-medium shadow-md transition-all flex items-center gap-2 text-white`}
                        style={{ backgroundColor: isSaved ? '#16a34a' : props.themeColor }}
                    >
                        {isSaved ? (
                            <>Saved Successfully</>
                        ) : (
                            <>
                                <Save className="w-5 h-5" />
                                Save All Changes
                            </>
                        )}
                    </button>
                )}
            </div>

        </div>
    );
};

export default ConfigurationPage;
