
import React from 'react';
import { ConfigurationPageProps } from './types';
import { useConfigurationState } from './hooks/useConfigurationState';
import { PlatformConfigSection } from './sections/PlatformConfigSection';
import { SystemBehaviorSection } from './sections/SystemBehaviorSection';
import { AnalysisLogicSection } from './sections/AnalysisLogicSection';
import { PersonalizationSection } from './sections/PersonalizationSection';
import { DataNormalizationSection } from './sections/DataNormalizationSection';
import { Globe, Truck, AlertTriangle, Search, Save, Database } from 'lucide-react';
import { TabSwitcher } from '../common/TabSwitcher';
export const ConfigurationPage: React.FC<ConfigurationPageProps> = (props) => {
    const {
        activeTab, setActiveTab, rules, logistics, searchConfig, setSearchConfig,
        newPlatformName, setNewPlatformName, isSaved, discoveredPlatforms, platformKeys,
        handleFieldChange, toggleExclusion, toggleAdsSupported, handleAddPlatform, handleDeletePlatform,
        handleLogisticsChange, handleFreightFileUpload, freightRates,
        freightUploadStatus, freightUploadCount, handleSave
    } = useConfigurationState(props);

    return (
        <div className="max-w-[1600px] mx-auto pb-10 flex flex-col">

            {/* Tab Navigation */}
            <TabSwitcher
                tabs={[
                    { key: 'platforms', label: 'Platform Rules', icon: Globe },
                    { key: 'logistics', label: 'Logistics Rates', icon: Truck },
                    { key: 'thresholds', label: 'Alerts & Diagnostics', icon: AlertTriangle },
                    { key: 'search', label: 'Search Settings', icon: Search },
                    { key: 'normalization', label: 'Data Normalization', icon: Database },
                ]}
                activeTab={activeTab}
                onChange={(key) => setActiveTab(key as any)}
                size="sm"
            />

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
                        handleFreightFileUpload={handleFreightFileUpload}
                        freightRates={freightRates}
                        freightUploadStatus={freightUploadStatus}
                        freightUploadCount={freightUploadCount}
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

                {activeTab === 'normalization' && (
                    <DataNormalizationSection
                        products={props.products}
                        brandMap={props.brandMap}
                        categoryMap={props.categoryMap}
                        onSaveBrandMap={props.onSaveBrandMap}
                        onSaveCategoryMap={props.onSaveCategoryMap}
                        themeColor={props.themeColor}
                        headerStyle={props.headerStyle}
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
