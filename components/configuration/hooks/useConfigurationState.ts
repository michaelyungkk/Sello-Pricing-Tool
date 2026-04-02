
import { useState, useEffect, useMemo, useRef } from 'react';
import { PricingRules, LogisticsRule, SearchConfig, VelocityLookback, Platform, PlatformConfig, FreightRate } from '../../../types';
import { ensureCapabilities } from '../../../services/platformCapabilities';
import { ConfigurationPageProps, ConfigTab } from '../types';

export const useConfigurationState = ({
    currentRules,
    logisticsRules,
    searchConfig: initialSearchConfig,
    velocityLookback: initialVelocityLookback,
    onSave,
    onSaveLogistics,
    products,
    extraData,
    freightRates,
    onFreightRatesUpload
}: ConfigurationPageProps) => {
    const [activeTab, setActiveTab] = useState<ConfigTab>('platforms');
    const [rules, setRules] = useState<PricingRules>(JSON.parse(JSON.stringify(currentRules)));
    const [logistics, setLogistics] = useState<LogisticsRule[]>(JSON.parse(JSON.stringify(logisticsRules || [])));
    const [searchConfig, setSearchConfig] = useState<SearchConfig>(initialSearchConfig ? JSON.parse(JSON.stringify(initialSearchConfig)) : { volumeBands: { topPercentile: 20, bottomPercentile: 20 }, minAbsoluteFloor: 10 });
    const [velocityLookback, setVelocityLookback] = useState<VelocityLookback>(initialVelocityLookback);
    const [freightUploadCount, setFreightUploadCount] = useState(0);

    const [newPlatformName, setNewPlatformName] = useState('');
    const [isSaved, setIsSaved] = useState(false);
    const [adsRefresh, setAdsRefresh] = useState(0);

    useEffect(() => {
        setRules(JSON.parse(JSON.stringify(currentRules)));
        setLogistics(JSON.parse(JSON.stringify(logisticsRules || [])));
        if (initialSearchConfig) setSearchConfig(JSON.parse(JSON.stringify(initialSearchConfig)));
    }, [currentRules, logisticsRules, initialSearchConfig]);

    useEffect(() => {
        setVelocityLookback(initialVelocityLookback);
    }, [initialVelocityLookback]);

    const discoveredPlatforms = useMemo(() => {
        const set = new Set<string>();
        products.forEach(p => p.channels.forEach(c => set.add(c.platform)));
        return Array.from(set).sort();
    }, [products]);

    useEffect(() => {
        if (Object.keys(rules).length > 0 && extraData?.priceHistory) {
            ensureCapabilities(Object.keys(rules), extraData.priceHistory);
            setAdsRefresh(prev => prev + 1);
        }
    }, [rules, extraData]);

    useEffect(() => {
        if (isSaved) {
            const timer = setTimeout(() => setIsSaved(false), 2000);
            return () => clearTimeout(timer);
        }
    }, [isSaved]);


    const handleFieldChange = (platform: Platform, field: keyof PlatformConfig, value: any) => {
        setRules(prev => {
            const updatedPlatform = { ...prev[platform], [field]: value };
            if (field === 'adsEnabled' && value === false) {
                updatedPlatform.adsAttribution = undefined;
            }
            updatedPlatform.updatedAt = new Date().toISOString();
            return { ...prev, [platform]: updatedPlatform };
        });
    };

    const toggleExclusion = (platform: Platform) => {
        handleFieldChange(platform, 'isExcluded', !rules[platform].isExcluded);
    };

    const toggleAdsSupported = (platform: Platform) => {
        const current = rules[platform].adsEnabled;
        handleFieldChange(platform, 'adsEnabled', !current);
        if (!current) {
            handleFieldChange(platform, 'adsAttribution', 'SKU_LEVEL');
        }
    };

    const handleAddPlatform = () => {
        const trimmedName = newPlatformName.trim();
        if (trimmedName && !rules[trimmedName]) {
            setRules(prev => ({
                ...prev,
                [trimmedName]: {
                    markup: 0,
                    commission: 0,
                    manager: 'Unassigned',
                    color: '#374151',
                    isExcluded: false,
                    pricingControl: 'MERCHANT',
                    feeModel: 'COMMISSION_PCT',
                    adsEnabled: false,
                    updatedAt: new Date().toISOString()
                }
            }));
            setNewPlatformName('');
        }
    };

    const handleDeletePlatform = (platform: Platform) => {
        const newRules = { ...rules };
        delete newRules[platform];
        setRules(newRules);
    };

    const handleSave = () => {
        onSave(rules, velocityLookback, searchConfig);
        if (onSaveLogistics) onSaveLogistics(logistics);
        setIsSaved(true);
    };

    const platformKeys = useMemo(() => Object.keys(rules).sort(), [rules]);

    return {
        activeTab,
        setActiveTab,
        rules,
        logistics,
        searchConfig,
        setSearchConfig,
        newPlatformName,
        setNewPlatformName,
        isSaved,
        discoveredPlatforms,
        platformKeys,
        handleFieldChange,
        toggleExclusion,
        toggleAdsSupported,
        handleAddPlatform,
        handleDeletePlatform,
        freightRates,
        freightUploadCount,
        handleSave
    };
};
