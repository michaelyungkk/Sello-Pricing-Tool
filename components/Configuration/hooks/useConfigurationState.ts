
import { useState, useEffect, useMemo } from 'react';
import { PricingRules, LogisticsRule, SearchConfig, VelocityLookback, Platform, PlatformConfig } from '../../../types';
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
    shipmentHistory
}: ConfigurationPageProps) => {
    const [activeTab, setActiveTab] = useState<ConfigTab>('platforms');
    const [rules, setRules] = useState<PricingRules>(JSON.parse(JSON.stringify(currentRules)));
    const [logistics, setLogistics] = useState<LogisticsRule[]>(JSON.parse(JSON.stringify(logisticsRules || [])));
    const [searchConfig, setSearchConfig] = useState<SearchConfig>(initialSearchConfig ? JSON.parse(JSON.stringify(initialSearchConfig)) : { volumeBands: { topPercentile: 20, bottomPercentile: 20 }, minAbsoluteFloor: 10 });
    const [velocityLookback, setVelocityLookback] = useState<VelocityLookback>(initialVelocityLookback);

    const [newPlatformName, setNewPlatformName] = useState('');
    const [isSaved, setIsSaved] = useState(false);
    const [adsRefresh, setAdsRefresh] = useState(0);
    
    // Ads capabilities refresh trigger

    // Sync state with props
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

    const handleLogisticsChange = (id: string, field: keyof LogisticsRule, value: string) => {
        const numValue = parseFloat(value);
        setLogistics(prev => prev.map(rule =>
            rule.id === id ? { ...rule, [field]: isNaN(numValue) ? 0 : numValue } : rule
        ));
    };

    const handleAutoCalibrate = () => {
        if (!shipmentHistory || shipmentHistory.length === 0) {
            alert("No shipping history found. Please import a Transaction Report with 'Logistics Service' mapped first.");
            return;
        }

        const serviceStats: Record<string, { costs: number[], maxWeight: number, maxLength: number }> = {};

        shipmentHistory.forEach(log => {
            const product = products.find(p => p.sku === log.sku);
            if (!product) return;

            const normalizedService = log.service.toUpperCase();
            if (!serviceStats[normalizedService]) serviceStats[normalizedService] = { costs: [], maxWeight: 0, maxLength: 0 };

            const stats = serviceStats[normalizedService];
            stats.costs.push(log.cost);

            if (product.cartonDimensions) {
                if (product.cartonDimensions.weight > stats.maxWeight) stats.maxWeight = product.cartonDimensions.weight;
                if (product.cartonDimensions.length > stats.maxLength) stats.maxLength = product.cartonDimensions.length;
            }
        });

        const newRules = [...logistics];
        let updatesCount = 0;

        Object.entries(serviceStats).forEach(([serviceName, stats]) => {
            stats.costs.sort((a, b) => a - b);
            const mid = Math.floor(stats.costs.length / 2);
            const medianCost = stats.costs.length % 2 !== 0 ? stats.costs[mid] : (stats.costs[mid - 1] + stats.costs[mid]) / 2;

            const existingIdx = newRules.findIndex(r => r.name.trim().toUpperCase() === serviceName);

            const ruleUpdate = {
                price: Number(medianCost.toFixed(2)),
                maxWeight: stats.maxWeight > 0 ? Number(stats.maxWeight.toFixed(2)) : undefined,
                maxLength: stats.maxLength > 0 ? Number(stats.maxLength.toFixed(2)) : undefined
            };

            if (existingIdx >= 0) {
                const existing = newRules[existingIdx];
                newRules[existingIdx] = {
                    ...existing,
                    price: ruleUpdate.price,
                    maxWeight: ruleUpdate.maxWeight || existing.maxWeight,
                    maxLength: ruleUpdate.maxLength || existing.maxLength
                };
                updatesCount++;
            } else {
                newRules.push({
                    id: `auto-${serviceName.toLowerCase().replace(/\s/g, '-')}`,
                    name: serviceName,
                    carrier: 'Auto-Detected',
                    price: ruleUpdate.price,
                    maxWeight: ruleUpdate.maxWeight,
                    maxLength: ruleUpdate.maxLength
                });
                updatesCount++;
            }
        });

        setLogistics(newRules);
        alert(`Calibration complete. Updated rates for ${updatesCount} services based on ${shipmentHistory.length} shipments.`);
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
        handleLogisticsChange,
        handleAutoCalibrate,
        handleSave
    };
};
