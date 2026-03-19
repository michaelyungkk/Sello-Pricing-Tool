
import React, { useState, useMemo, useEffect } from 'react';
import { Product, PricingRules, SearchConfig, PriceChangeRecord, OptimalPriceResult } from '../../../types';
import { SearchIntent } from '../../../services/geminiService';
import { isAdsEnabled } from '../../../services/platformCapabilities';
import SkuDeepDivePage from '../../SkuDeepDivePage';
import { ThresholdConfig } from '../../../services/thresholdsConfig';
import { SearchHeader } from './parts/SearchHeader';
import { SearchResultPanels } from './parts/SearchResultPanels';
import { RotateCcw } from 'lucide-react';

interface SearchResultsPageContainerProps {
    data: { results: any[], query: string, params: SearchIntent, id?: string };
    products: Product[];
    pricingRules: PricingRules;
    themeColor: string;
    headerStyle: React.CSSProperties;
    timeLabel?: string;
    onRefine: (sessionId: string, newIntent: SearchIntent) => void;
    searchConfig: SearchConfig;
    priceChangeHistory?: PriceChangeRecord[];
    thresholds: ThresholdConfig;
    skuFamilies: any[];
    adGroups: any[];
    priceHistoryMap: Map<string, any[]>;
    optimalPriceResults?: Map<string, OptimalPriceResult>;
}

type GroupBy = 'platform' | 'sku';

export const SearchResultsPageContainer: React.FC<SearchResultsPageContainerProps> = ({
    data, products, pricingRules, themeColor, headerStyle, timeLabel, onRefine, searchConfig, priceChangeHistory, thresholds,
    skuFamilies, adGroups, priceHistoryMap, optimalPriceResults
}) => {
    const [groupBy, setGroupBy] = useState<GroupBy>('platform');
    const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
    const [expandedSubGroup, setExpandedSubGroup] = useState<string | null>(null);
    const [deductRefunds, setDeductRefunds] = useState<boolean>(() => {
        return localStorage.getItem('sello_search_deduct_refunds') === 'true';
    });

    useEffect(() => {
        localStorage.setItem('sello_search_deduct_refunds', deductRefunds.toString());
    }, [deductRefunds]);

    const isDeepDive = data.params.primaryMetric === 'DEEP_DIVE' && data.results.length > 0;

    // --- LIVE DATA HYDRATION ---
    const liveProductMap = useMemo(() => {
        const map = new Map<string, Product>();
        products.forEach(p => map.set(p.sku, p));
        return map;
    }, [products]);

    useEffect(() => {
        setExpandedGroup(null);
        setExpandedSubGroup(null);
    }, [groupBy]);

    const checkContext = (keywords: string[], fields: string[]) => {
        const q = data.query.toLowerCase();
        const p = data.params;
        const matchesKeyword = keywords.some(k => q.includes(k));
        const hasFilter = p?.filters?.some((f: any) => fields.includes(f.field));
        const hasSort = p?.sort?.field ? fields.includes(p.sort.field) : false;
        return matchesKeyword || hasFilter || hasSort;
    };

    const isVolumeContext = useMemo(() => checkContext(
        ['qty', 'quantity', 'unit', 'sold', 'volume', 'velocity', 'count', 'traffic', 'winning', 'scale'],
        ['velocity', 'qty']
    ), [data]);

    const isAdContext = useMemo(() => checkContext(
        ['ad', 'tacos', 'ppc', 'marketing', 'spend', 'cost'],
        ['tacos', 'adsSpend']
    ), [data]);

    const isMarginContext = useMemo(() => checkContext(
        ['margin', 'profit', 'loss', 'negative', 'net', 'winning', 'scale'],
        ['margin', 'profit', 'netPmPercent', 'MARGIN_CHANGE_PCT']
    ), [data]);

    const isInventoryContext = useMemo(() => checkContext(
        ['stock', 'inventory', 'runway', 'cover', 'days remaining', 'days cover', 'overstock', 'out of stock', 'level'],
        ['stockLevel', 'daysRemaining']
    ), [data]);

    const isTrendContext = useMemo(() => checkContext(
        ['drop', 'decline', 'growth', 'change', 'trend', 'wow', 'spike'],
        ['velocityChange', 'MARGIN_CHANGE_PCT']
    ), [data]);

    const isReturnContext = useMemo(() => checkContext(
        ['return', 'refund', 'rate', 'rr'],
        ['returnRate', 'periodReturnRate']
    ), [data]);

    const isOrganicContext = useMemo(() => checkContext(
        ['organic', 'natural'],
        ['organicShare', 'ORGANIC_SHARE_PCT']
    ), [data]);

    const isAgedContext = useMemo(() => checkContext(
        ['aged', 'old', 'long term', 'stale'],
        ['agedStockPct', 'AGED_STOCK_PCT']
    ), [data]);

    const isPostcodeContext = useMemo(() => checkContext(
        ['postcode', 'area', 'region'],
        ['postcode']
    ), [data]);

    useEffect(() => {
        if (isInventoryContext || isAgedContext) {
            setGroupBy('sku');
        }
    }, [isInventoryContext, isAgedContext]);

    // Hierarchical Data Calculation moved here
    const hierarchicalData = useMemo(() => {
        if (!data.results || isDeepDive) return [];

        const groups: Record<string, any> = {};

        data.results.forEach(item => {
            const mainKey = groupBy === 'platform' ? (item.platform || 'Unknown') : item.sku;

            const liveProduct = liveProductMap.get(item.sku);
            if (liveProduct && item.type === 'INVENTORY') {
                item.averageDailySales = liveProduct.averageDailySales;
                item.daysRemaining = liveProduct.averageDailySales > 0 ? liveProduct.stockLevel / liveProduct.averageDailySales : 999;
                item.stockLevel = liveProduct.stockLevel;
                item.agedStockPct = liveProduct.stockLevel > 0 && liveProduct.agedStockQty ? (liveProduct.agedStockQty / liveProduct.stockLevel) * 100 : 0;
            }

            if (!groups[mainKey]) {
                groups[mainKey] = {
                    key: mainKey,
                    label: mainKey,
                    productName: groupBy === 'sku' ? item.productName : undefined,
                    count: 0,
                    weightedMargin: null,
                    totalRevenue: 0,
                    totalProfit: 0,
                    totalQty: 0,
                    totalAdSpend: 0,
                    totalRefundAmount: 0,
                    totalRefundQty: 0,
                    tacos: null,
                    organicShare: null,
                    contribution: 0,
                    agedStockPct: 0,
                    subGroups: {},
                    globalVelocity: 0,
                    globalCover: 0,
                    periodReturnRate: null,
                    allTimeReturnRate: 0,
                    adEnabledRevenue: 0,
                    totalPrevRevenue: 0,
                    totalPrevQty: 0,
                    totalPrevProfit: 0,
                    weightedMarginChange: 0,
                    districtStats: {}
                };
            }

            const topGroup = groups[mainKey];
            topGroup.count++;

            if (item.type !== 'REFUND') {
                topGroup.totalRevenue += (item.revenue || 0);
                topGroup.totalProfit += (item.profit || 0);
                topGroup.totalQty += (item.velocity || 0);
                topGroup.totalAdSpend += (item.adsSpend || 0);
                topGroup.contribution += (item.contribution || 0);

                if (isAdsEnabled(item.platform || '')) {
                    topGroup.adEnabledRevenue += (item.revenue || 0);
                }
            } else {
                topGroup.totalRefundAmount += Math.abs(item.refundAmount || 0);
                topGroup.totalRefundQty += Math.abs(item.velocity || 0);
                if (deductRefunds) {
                    topGroup.totalProfit += (item.profit || 0); // Refunds have negative profit
                }
            }

            if ((isInventoryContext || isAgedContext) && item.type === 'INVENTORY' && groupBy === 'sku') {
                const gVel = item.averageDailySales || 0;
                topGroup.globalVelocity = gVel;
                topGroup.totalQty = item.stockLevel;
                topGroup.globalCover = gVel > 0 ? (item.stockLevel / gVel) : 999;

                if (item.agedStockQty) {
                    topGroup.agedStockPct = item.agedStockPct || 0;
                }

                if (item.channels && Array.isArray(item.channels)) {
                    item.channels.forEach((ch: any) => {
                        const subKey = ch.platform;
                        if (!topGroup.subGroups[subKey]) {
                            topGroup.subGroups[subKey] = {
                                key: subKey,
                                label: subKey,
                                productName: undefined,
                                count: 1,
                                weightedMargin: null,
                                totalRevenue: 0,
                                totalProfit: 0,
                                totalQty: 0,
                                totalAdSpend: 0,
                                totalRefundAmount: 0,
                                totalRefundQty: 0,
                                tacos: null,
                                organicShare: null,
                                contribution: 0,
                                agedStockPct: 0,
                                items: [],
                                platformVelocity: ch.velocity,
                                platformCover: ch.velocity > 0 ? (item.stockLevel / ch.velocity) : 999,
                                periodReturnRate: null,
                                adEnabledRevenue: 0,
                                totalPrevRevenue: 0,
                                totalPrevQty: 0,
                                totalPrevProfit: 0,
                                weightedMarginChange: 0,
                                districtStats: {}
                            };
                        }
                        const estRevenue = ch.velocity * (ch.price || item.price);
                        topGroup.subGroups[subKey].items.push({
                            date: item.date,
                            price: ch.price || item.price,
                            velocity: ch.velocity,
                            revenue: estRevenue,
                            stockLevel: item.stockLevel,
                            type: 'INVENTORY_CHANNEL',
                            postcode: item.postcode
                        });
                    });
                }
            }
            else {
                const subKey = groupBy === 'platform' ? item.sku : (item.platform || 'Unknown');

                if (!topGroup.subGroups[subKey]) {
                    topGroup.subGroups[subKey] = {
                        key: subKey,
                        label: subKey,
                        productName: groupBy === 'platform' ? item.productName : undefined,
                        count: 0,
                        weightedMargin: null,
                        totalRevenue: 0,
                        totalProfit: 0,
                        totalQty: 0,
                        totalAdSpend: 0,
                        totalRefundAmount: 0,
                        totalRefundQty: 0,
                        tacos: null,
                        organicShare: null,
                        contribution: 0,
                        agedStockPct: 0,
                        items: [],
                        periodReturnRate: null,
                        allTimeReturnRate: item.allTimeReturnRate || 0,
                        adEnabledRevenue: 0,
                        totalPrevRevenue: 0,
                        totalPrevQty: 0,
                        totalPrevProfit: 0,
                        weightedMarginChange: 0,
                        districtStats: {}
                    };
                }

                const subGroup = topGroup.subGroups[subKey];
                subGroup.count++;
                if (item.type !== 'REFUND') {
                    subGroup.totalRevenue += (item.revenue || 0);
                    subGroup.totalProfit += (item.profit || 0);
                    subGroup.totalQty += (item.velocity || 0);
                    subGroup.totalAdSpend += (item.adsSpend || 0);
                    subGroup.contribution += (item.contribution || 0);

                    if (isAdsEnabled(item.platform || '')) {
                        subGroup.adEnabledRevenue += (item.revenue || 0);
                    }
                } else {
                    subGroup.totalRefundAmount += Math.abs(item.refundAmount || 0);
                    subGroup.totalRefundQty += Math.abs(item.velocity || 0);
                    if (deductRefunds) {
                        subGroup.totalProfit += (item.profit || 0);
                    }
                }
                subGroup.items.push(item);

                if (item.postcode) {
                    const district = item.postcode.split(' ')[0];
                    if (district) {
                        if (!topGroup.districtStats) topGroup.districtStats = {};
                        topGroup.districtStats[district] = (topGroup.districtStats[district] || 0) + (item.velocity || 0);
                        if (!subGroup.districtStats) subGroup.districtStats = {};
                        subGroup.districtStats[district] = (subGroup.districtStats[district] || 0) + (item.velocity || 0);
                    }
                }
            }
        });

        // Aggregation Step
        Object.keys(groups).forEach(key => {
            const g = groups[key];
            g.weightedMargin = g.totalRevenue > 0 ? (g.totalProfit / g.totalRevenue) * 100 : null;

            const skuSet = new Set<string>();

            Object.values(g.subGroups).forEach((sg: any) => {
                if (groupBy === 'sku') {
                    if (sg.items.length > 0 && !skuSet.has(g.key)) {
                        g.totalPrevRevenue = sg.items[0].prevRevenue || 0;
                        g.totalPrevQty = sg.items[0].prevQty || 0;
                        g.totalPrevProfit = sg.items[0].prevProfit || 0;
                        skuSet.add(g.key);
                    }
                } else {
                    if (sg.items.length > 0) {
                        const item = sg.items[0];
                        if (!skuSet.has(sg.key)) {
                            g.totalPrevRevenue += (item.prevRevenue || 0);
                            g.totalPrevQty += (item.prevQty || 0);
                            g.totalPrevProfit += (item.prevProfit || 0);

                            sg.totalPrevRevenue = item.prevRevenue || 0;
                            sg.totalPrevQty = item.prevQty || 0;
                            sg.totalPrevProfit = item.prevProfit || 0;

                            skuSet.add(sg.key);
                        }
                    }
                }

                if (!sg.platformVelocity) {
                    sg.weightedMargin = sg.totalRevenue > 0 ? (sg.totalProfit / sg.totalRevenue) * 100 : null;
                    const sgPrevMargin = sg.totalPrevRevenue > 0 ? (sg.totalPrevProfit / sg.totalPrevRevenue) * 100 : 0;
                    sg.weightedMarginChange = (sg.weightedMargin || 0) - sgPrevMargin;

                    if (sg.adEnabledRevenue > 0) {
                        sg.tacos = (sg.totalAdSpend / sg.adEnabledRevenue) * 100;
                        sg.organicShare = Math.max(0, 100 - sg.tacos);
                    } else {
                        sg.tacos = null;
                        sg.organicShare = null;
                    }

                    sg.periodReturnRate = sg.totalQty > 0 ? (sg.totalRefundQty / sg.totalQty) * 100 : null;
                }
            });

            const prevGroupMargin = g.totalPrevRevenue > 0 ? (g.totalPrevProfit / g.totalPrevRevenue) * 100 : 0;
            g.weightedMarginChange = (g.weightedMargin || 0) - prevGroupMargin;

            if (g.adEnabledRevenue > 0) {
                g.tacos = (g.totalAdSpend / g.adEnabledRevenue) * 100;
                g.organicShare = Math.max(0, 100 - g.tacos);
            } else {
                g.tacos = null;
                g.organicShare = null;
            }

            g.periodReturnRate = g.totalQty > 0 ? (g.totalRefundQty / g.totalQty) * 100 : null;

            if (groupBy === 'sku') {
                const firstSub: any = Object.values(g.subGroups)[0];
                g.allTimeReturnRate = firstSub?.allTimeReturnRate || 0;
            } else {
                const subs: any[] = Object.values(g.subGroups);
                const sumAllTime = subs.reduce((acc, sub) => acc + (sub.allTimeReturnRate || 0), 0);
                g.allTimeReturnRate = subs.length > 0 ? sumAllTime / subs.length : 0;
            }
        });

        // Sorting
        return Object.values(groups).sort((a: any, b: any) => {
            if (data.params && data.params.sort) {
                const { field, direction } = data.params.sort;
                const dirMult = direction === 'asc' ? 1 : -1;

                if (field === 'MARGIN_CHANGE_PCT') {
                    return (a.weightedMarginChange - b.weightedMarginChange) * dirMult;
                }

                if (field === 'margin' || field === 'net_margin_pct' || field === 'netPmPercent') {
                    if (isTrendContext) {
                        return (a.weightedMarginChange - b.weightedMarginChange) * dirMult;
                    }
                    return (a.totalProfit - b.totalProfit) * dirMult;
                }
                if (field === 'profit' || field === 'net_profit') return (a.totalProfit - b.totalProfit) * dirMult;
                if (field === 'revenue') return (a.totalRevenue - b.totalRevenue) * dirMult;
                if (field === 'velocity' || field === 'qty' || field === 'sales_qty') return (a.totalQty - b.totalQty) * dirMult;
                if (field === 'tacos' || field === 'tacos_pct' || field === 'adsSpend') return ((a.tacos || 0) - (b.tacos || 0)) * dirMult;
                if (field === 'stockLevel') return (a.totalQty - b.totalQty) * dirMult;
                if (field === 'daysRemaining' || field === 'stock_cover_days') return ((a.globalCover || 0) - (b.globalCover || 0)) * dirMult;
                if (field === 'periodReturnRate' || field === 'returnRate' || field === 'RETURN_RATE_PCT') return ((a.periodReturnRate || 0) - (b.periodReturnRate || 0)) * dirMult;
                if (field === 'organicShare' || field === 'ORGANIC_SHARE_PCT') return ((a.organicShare || 0) - (b.organicShare || 0)) * dirMult;
                if (field === 'agedStockPct' || field === 'AGED_STOCK_PCT') return ((a.agedStockPct || 0) - (b.agedStockPct || 0)) * dirMult;
                if (field === 'VELOCITY_CHANGE') {
                    const aTrend = a.totalPrevQty > 0 ? ((a.totalQty - a.totalPrevQty) / a.totalPrevQty) : 0;
                    const bTrend = b.totalPrevQty > 0 ? ((b.totalQty - b.totalPrevQty) / b.totalPrevQty) : 0;
                    return (aTrend - bTrend) * dirMult;
                }
            }

            if (isAgedContext) return (b.agedStockPct || 0) - (a.agedStockPct || 0);
            if (isOrganicContext) return (b.organicShare || 0) - (a.organicShare || 0);
            if (isReturnContext) return (b.periodReturnRate || 0) - (a.periodReturnRate || 0);
            if (isInventoryContext) return a.totalQty - b.totalQty;
            if (isVolumeContext) return b.totalQty - a.totalQty;
            if (isAdContext) return (b.tacos || 0) - (a.tacos || 0);
            if (isMarginContext) return b.totalProfit - a.totalProfit;
            return b.totalRevenue - a.totalRevenue;
        });

    }, [data.results, groupBy, deductRefunds, isVolumeContext, isAdContext, isMarginContext, isInventoryContext, isReturnContext, isOrganicContext, isAgedContext, isTrendContext, isPostcodeContext, data.params, isDeepDive, liveProductMap]);

    const volumeContextStats = useMemo(() => {
        const quantities = hierarchicalData.map((g: any) => g.totalQty).sort((a: number, b: number) => a - b);
        const count = quantities.length;
        if (count === 0) return null;

        const max = quantities[count - 1] || 0;

        if (max < searchConfig.minAbsoluteFloor) {
            return { isLowVolume: true };
        }

        const bottomCutoffIndex = Math.floor(count * (searchConfig.volumeBands.bottomPercentile / 100));
        const topCutoffIndex = Math.floor(count * (1 - searchConfig.volumeBands.topPercentile / 100));

        const bottomVal = quantities[bottomCutoffIndex];
        const topVal = quantities[topCutoffIndex];

        const getBand = (qty: number) => {
            if (qty >= topVal) return 'Top';
            if (qty <= bottomVal) return 'Bottom';
            return 'Middle';
        };

        return { isLowVolume: false, getBand };
    }, [hierarchicalData, searchConfig]);

    const handleGroupToggle = (groupKey: string, e?: React.MouseEvent) => {
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;
        setExpandedGroup(prev => prev === groupKey ? null : groupKey);
        setExpandedSubGroup(null);
    };

    const handleSubGroupToggle = (compositeKey: string, e: React.MouseEvent) => {
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;
        e.stopPropagation();
        setExpandedSubGroup(prev => prev === compositeKey ? null : compositeKey);
    };

    const handleSortUpdate = (field: string, direction: 'asc' | 'desc') => {
        const newIntent: SearchIntent = {
            ...data.params,
            sort: { field, direction }
        };
        if (data.id) onRefine(data.id, newIntent);
    };

    if (isDeepDive) {
        const resultSnapshot = data.results[0];
        const liveProduct = liveProductMap.get(resultSnapshot.product.sku);
        const hydratedData = liveProduct ? { ...resultSnapshot, product: liveProduct } : resultSnapshot;
        return <SkuDeepDivePage
            data={hydratedData}
            themeColor={themeColor}
            priceChangeHistory={priceChangeHistory}
            thresholds={thresholds}
            pricingRules={pricingRules}
            skuFamilies={skuFamilies}
            products={products}
            adGroups={adGroups}
            priceHistoryMap={priceHistoryMap}
            optimalPriceResults={optimalPriceResults}
        />;
    }

    return (
        <div className="space-y-4">
            <div className="flex justify-end pr-2">
                <label className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-gray-200 shadow-sm cursor-pointer hover:border-theme-20 transition-colors">
                    <input
                        type="checkbox"
                        checked={deductRefunds}
                        onChange={e => setDeductRefunds(e.target.checked)}
                        className="w-4 h-4 text-theme rounded focus:ring-theme border-gray-300"
                    />
                    <div className="flex items-center gap-1.5">
                        <RotateCcw className={`w-3.5 h-3.5 ${deductRefunds ? 'text-red-500' : 'text-gray-400'}`} />
                        <span className={`text-[10px] font-bold uppercase tracking-tight ${deductRefunds ? 'text-gray-900' : 'text-gray-500'}`}>Deduct Returns</span>
                    </div>
                </label>
            </div>

            <SearchHeader
                data={data}
                themeColor={themeColor}
                timeLabel={timeLabel}
                context={{
                    isVolume: isVolumeContext,
                    isAd: isAdContext,
                    isMargin: isMarginContext,
                    isInventory: isInventoryContext,
                    isTrend: isTrendContext,
                    isReturn: isReturnContext,
                    isOrganic: isOrganicContext,
                    isAged: isAgedContext,
                }}
                onRefine={onRefine}
                handleSortUpdate={handleSortUpdate}
                groupBy={groupBy}
                setGroupBy={setGroupBy}
            />

            <SearchResultPanels
                data={data}
                hierarchicalData={hierarchicalData}
                groupBy={groupBy}
                expandedGroup={expandedGroup}
                expandedSubGroup={expandedSubGroup}
                handleGroupToggle={handleGroupToggle}
                handleSubGroupToggle={handleSubGroupToggle}
                volumeContextStats={volumeContextStats}
                context={{
                    isVolume: isVolumeContext,
                    isAd: isAdContext,
                    isMargin: isMarginContext,
                    isInventory: isInventoryContext,
                    isTrend: isTrendContext,
                    isReturn: isReturnContext,
                    isOrganic: isOrganicContext,
                    isAged: isAgedContext,
                    isPostcode: isPostcodeContext
                }}
                thresholds={thresholds}
                liveProductMap={liveProductMap}
            />
        </div>
    );
};
