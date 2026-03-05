
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
    const [freightUploadStatus, setFreightUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
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

    useEffect(() => {
        if (freightUploadStatus === 'success' || freightUploadStatus === 'error') {
            const timer = setTimeout(() => setFreightUploadStatus('idle'), 3000);
            return () => clearTimeout(timer);
        }
    }, [freightUploadStatus]);

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

    const handleFreightFileUpload = (file: File) => {
        if (!onFreightRatesUpload) return;
        import('xlsx').then(XLSX => {
            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const wb = XLSX.read(data, { type: 'array' });
                    const ws = wb.Sheets[wb.SheetNames[0]];
                    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

                    if (rows.length < 2) {
                        setFreightUploadStatus('error');
                        return;
                    }

                    // Find SKU and rate columns (case-insensitive)
                    const headers = (rows[0] as string[]).map(h => String(h || '').toLowerCase().trim());
                    const skuCol = headers.findIndex(h => h.includes('sku'));
                    const rateCol = headers.findIndex(h =>
                        h.includes('rate') || h.includes('freight') || h.includes('postage') || h.includes('cost')
                    );

                    if (skuCol === -1 || rateCol === -1) {
                        setFreightUploadStatus('error');
                        alert(`Could not find SKU and rate columns. Found headers: ${rows[0].join(', ')}`);
                        return;
                    }

                    const rates: FreightRate[] = [];
                    for (let i = 1; i < rows.length; i++) {
                        const row = rows[i];
                        const sku = String(row[skuCol] || '').trim();
                        const rate = parseFloat(String(row[rateCol] || '0'));
                        if (sku && !isNaN(rate) && rate >= 0) {
                            rates.push({ sku, rate });
                        }
                    }

                    if (rates.length === 0) {
                        setFreightUploadStatus('error');
                        return;
                    }

                    onFreightRatesUpload(rates);
                    setFreightUploadCount(rates.length);
                    setFreightUploadStatus('success');
                } catch (err) {
                    setFreightUploadStatus('error');
                }
            };
            reader.readAsArrayBuffer(file);
        });
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
        handleFreightFileUpload,
        freightRates,
        freightUploadStatus,
        freightUploadCount,
        handleSave
    };
};
