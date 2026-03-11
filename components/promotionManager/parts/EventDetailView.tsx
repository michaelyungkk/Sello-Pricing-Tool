
import React, { useMemo, useState } from 'react';
import { ArrowLeft, Upload, Zap, Activity, BarChart3, Target, RotateCcw, AlertCircle, Trash2, Download, Star, TrendingUp, Info, Sparkles } from 'lucide-react';
import { PromotionEvent, Product, PriceLog, PriceChangeRecord, PromotionItem } from '../../../types';
import { SortState, sortRows } from '../../../utils/tableSort';
import { SortableHeader } from '../../common/SortableHeader';
import { GradeBadge } from '../../GradeBadge';
import { asDateKey, getTodayKeyMelbourne } from '../../../services/dateUtils';
import { computePromoWindows, computePromoEffectiveness, deriveDiscountedPrice } from '../../../services/promotionAnalytics';
import { formatMoney, formatSmartMoney, formatNumber, formatPct } from '../../../utils/format';
import { PromoUploadModal, UploadDiscountMode } from './PromoUploadModal';

// Local helper to ensure price consistency
const getBaselineForProduct = (promo: PromotionEvent, product?: Product): number => {
    if (promo.baselineMode === 'MANUAL') return promo.baselineManualPrice || 0;
    if (!product) return 0;
    if (promo.baselineMode === 'CA_PRICE' && product.caPrice) return product.caPrice;
    return (product.currentPrice || 0) * 1.20;
};

interface EventDetailViewProps {
    promo: PromotionEvent;
    allPromotions?: PromotionEvent[]; // New prop for historical context
    products: Product[];
    priceHistoryMap: Map<string, PriceLog[]>;
    priceChangeHistory?: PriceChangeRecord[];
    onBack: () => void;
    onAddProducts: () => void;
    onDeleteItem: (sku: string) => void;
    onUpdateMeta: (updates: Partial<PromotionEvent>) => void;
    onUpdateItem: (sku: string, updates: Partial<PromotionItem>) => void;
    themeColor: string;
}

export const EventDetailView = ({ promo, allPromotions = [], products, priceHistoryMap, priceChangeHistory, onBack, onAddProducts, onDeleteItem, onUpdateMeta, onUpdateItem, themeColor }: EventDetailViewProps) => {
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<SortState<string> | null>({ key: 'startDate', dir: 'asc' });
    const [activeSection, setActiveSection] = useState<'nomination' | 'analytics'>('nomination');
    
    // Lifecycle windows & effectiveness
    const nowKey = useMemo(() => asDateKey(new Date())!, []);
    const windows = useMemo(() => computePromoWindows(promo, nowKey), [promo, nowKey]);
    
    const derivedStatus = useMemo(() => {
        const today = getTodayKeyMelbourne();
        if (promo.startDate > today) return 'UPCOMING';
        if (promo.endDate < today) return 'ENDED';
        return 'ACTIVE';
    }, [promo.startDate, promo.endDate]);

    const aggregatedEffectiveness = useMemo(() => {
        const results = (promo?.items || []).map((item: any) => {
            const product = products.find(p => p.sku.toUpperCase() === item.sku.toUpperCase());
            return computePromoEffectiveness(promo, item.sku, Array.from((priceHistoryMap || new Map()).values()).flat(), priceChangeHistory || [], product);
        });
        
        const totals = {
            baselineDailyUnits: results.reduce((sum, r) => sum + (r.baselineDailyUnits || 0), 0),
            forecastUnits: results.reduce((sum, r) => sum + (r.forecastUnits || 0), 0),
            actualUnits: results.reduce((sum, r) => sum + (r.actualUnits || 0), 0),
            actualRevenue: results.reduce((sum, r) => sum + (r.actualRevenue || 0), 0),
            actualProfit: results.reduce((sum, r) => sum + (r.actualProfit || 0), 0),
            upliftUnits: results.reduce((sum, r) => sum + (r.upliftUnits || 0), 0),
            upliftRevenue: results.reduce((sum, r) => sum + (r.upliftRevenue || 0), 0),
            upliftProfit: results.reduce((sum, r) => sum + (r.upliftProfit || 0), 0),
            baselineRevenue: results.reduce((sum, r) => sum + ((r.baselineDailyUnits || 0) * (windows.event?.days || 0) * (r.baselinePrice || 0)), 0)
        };
        
        return { items: results, totals };
    }, [promo, priceHistoryMap, priceChangeHistory, windows.event.days, products]);

    const formatPromoDate = (dStr: string, withYear: boolean = true) => {
        if (!dStr) return '-';
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return dStr;
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined });
    };

    const dateRangeStr = useMemo(() => {
        if (!promo?.startDate || !promo?.endDate) return '-';
        const sDate = new Date(promo.startDate);
        const eDate = new Date(promo.endDate);
        const sameYear = sDate.getFullYear() === eDate.getFullYear();
        return `${formatPromoDate(promo.startDate, !sameYear)} – ${formatPromoDate(promo.endDate, true)}`;
    }, [promo?.startDate, promo?.endDate]);

    const isSkuScope = promo?.promotionScope === 'SKU';

    const sortedItems = useMemo(() => {
        const itemsWithData = (aggregatedEffectiveness.items || []).map((item: any) => {
            const product = (products || []).find((p: Product) => p.sku.toUpperCase() === item.sku.toUpperCase());
            const rawItem = (promo?.items || []).find(i => i.sku.toUpperCase() === item.sku.toUpperCase());

            const resolvedPrice = (item.promoPrice > 0) 
                ? item.promoPrice 
                : (rawItem?.promoPrice && rawItem.promoPrice > 0) 
                    ? rawItem.promoPrice 
                    : 0;

            let projMargin = item.marginPctDuring;
            if (product && resolvedPrice > 0) {
                const totalCost = (Number(product.costPrice) || 0) +
                    (Number(product.sellingFee) || 0) +
                    (Number(product.adsFee) || 0) +
                    (Number(product.postage) || 0) +
                    (Number(product.otherFee) || 0) +
                    (Number(product.subscriptionFee) || 0) +
                    (Number(product.wmsFee) || 0);

                const totalIncome = resolvedPrice + (Number(product.extraFreight) || 0);
                const netProfit = totalIncome - totalCost;
                projMargin = (netProfit / resolvedPrice) * 100;
            }

            return {
                ...item,
                product,
                promoPrice: resolvedPrice,
                discountPercent: item.baselinePrice > 0 ? ((item.baselinePrice - resolvedPrice) / item.baselinePrice * 100) : 0,
                isIncomplete: isSkuScope && resolvedPrice <= 0,
                projectedMargin: projMargin
            };
        });
        const getValue = (row: any, key: string) => (row as any)[key];
        return sortRows(itemsWithData, sortConfig, getValue);
    }, [aggregatedEffectiveness, products, sortConfig, promo, isSkuScope]);

    // SMART LIFT SUGGESTION (Data Driven)
    const suggestedLiftData = useMemo(() => {
        if (!sortedItems || sortedItems.length === 0) return { val: 0, source: 'None' };
        
        // 1. Calculate Average Discount Depth for Current Promo
        const validItems = sortedItems.filter(i => i.discountPercent > 0);
        if (validItems.length === 0) return { val: 0, source: 'None' };
        
        const avgCurrentDiscount = validItems.reduce((sum, i) => sum + i.discountPercent, 0) / validItems.length;

        // 2. Look for Historical Campaigns on same Platform
        const today = getTodayKeyMelbourne();
        const pastPromos = allPromotions.filter(p => 
            p.id !== promo.id && 
            p.platform === promo.platform &&
            p.endDate < today // Only look at ended promos
        );

        const elasticities: number[] = [];
        let campaignsUsed = 0;

        if (pastPromos.length > 0) {
            // Calculate actual realized elasticity for each past promo
            pastPromos.forEach(pastP => {
                let pastTotalUplift = 0;
                let pastTotalBaseline = 0;
                let pastTotalDiscount = 0;
                let pastDiscountCount = 0;

                (pastP.items || []).forEach(item => {
                    const product = products.find(prod => prod.sku === item.sku);
                    // Heavy computation, but necessary for data-driven insights
                    const metrics = computePromoEffectiveness(pastP, item.sku, Array.from((priceHistoryMap || new Map()).values()).flat(), priceChangeHistory || [], product);
                    
                    const baseline = metrics.actualUnits - metrics.upliftUnits;
                    if (baseline > 1) { // Filter out noise
                        pastTotalUplift += metrics.upliftUnits;
                        pastTotalBaseline += baseline;
                        
                        // Approximate discount calc for past items
                        const pctOff = metrics.baselinePrice > 0 ? ((metrics.baselinePrice - metrics.promoPrice) / metrics.baselinePrice) * 100 : 0;
                        if (pctOff > 0) {
                            pastTotalDiscount += pctOff;
                            pastDiscountCount++;
                        }
                    }
                });

                if (pastTotalBaseline > 10 && pastDiscountCount > 0) {
                    const actualLiftPct = (pastTotalUplift / pastTotalBaseline) * 100;
                    const avgPastDiscount = pastTotalDiscount / pastDiscountCount;
                    
                    // Elasticity = Lift % / Discount %
                    // e.g. 50% Lift from 20% Discount = 2.5 Elasticity
                    if (avgPastDiscount > 0) {
                        const elasticity = actualLiftPct / avgPastDiscount;
                        // Filter out crazy outliers (e.g. 5% discount causing 500% lift = 100x elasticity, likely external factor)
                        if (elasticity > -10 && elasticity < 20) { 
                             elasticities.push(elasticity);
                             campaignsUsed++;
                        }
                    }
                }
            });
        }

        let elasticityToUse = 2.0; // Default Conservative
        let sourceLabel = "Standard Estimate";

        if (elasticities.length > 0) {
            // Average the historical elasticities
            const avgHistoricalElasticity = elasticities.reduce((a,b) => a+b, 0) / elasticities.length;
            elasticityToUse = Math.max(0.5, avgHistoricalElasticity); // Safety floor
            sourceLabel = `Based on ${campaignsUsed} past campaigns`;
        } else {
             // Fallback to platform heuristics if no data
            const p = promo.platform.toLowerCase();
            if (p.includes('amazon')) elasticityToUse = 3.0;
            if (p.includes('temu')) elasticityToUse = 2.5;
        }
        
        // 3. Prediction: Current Discount * Derived Elasticity
        const prediction = avgCurrentDiscount * elasticityToUse;
        
        return { 
            val: Math.round(prediction), 
            source: sourceLabel,
            elasticity: elasticityToUse
        };

    }, [sortedItems, promo.platform, allPromotions, priceHistoryMap]);

    const handleExportPostMortem = () => {
        const { totals } = aggregatedEffectiveness;
        
        const summary = [
            ['CAMPAIGN PERFORMANCE REPORT', ''],
            ['Campaign Name', promo.name],
            ['Platform', promo.platform],
            ['Date Range', dateRangeStr],
            ['Days Active', windows.event.days],
            ['Status', derivedStatus], // Export derived status
            [''],
            ['FINANCIAL AGGREGATES', ''],
            ['Total Units Sold', totals.actualUnits],
            ['Total Net Revenue', formatSmartMoney(totals.actualRevenue)],
            ['Total Net Profit', formatSmartMoney(totals.actualProfit)],
            ['Unit Uplift vs Baseline', `+${totals.upliftUnits.toFixed(0)} units`],
            ['Revenue Delta vs Baseline', formatSmartMoney(totals.upliftRevenue)],
            ['Profit Delta vs Baseline', formatSmartMoney(totals.upliftProfit)],
            ['Overall ROI (Uplift/Sacrifice)', totals.upliftProfit > 0 ? 'Profitable' : 'Margin Sacrificed'],
            [''],
            ['SKU PERFORMANCE DEEP DIVE', '']
        ];

        const headers = [
            'SKU', 'Product Name', 'Baseline Price', 'Promo Price', 'Discount %',
            'Baseline Daily Units', 'Actual Units Sold',
            'Actual Revenue', 'Actual Profit', 'Uplift Units', 'Uplift Profit',
            'Margin % During', 'Management Insight'
        ];

        const rows = sortedItems.map(item => {
            const upliftUnits = item.upliftUnits || 0;
            const upliftProfit = item.upliftProfit || 0;
            const actualUnits = item.actualUnits || 0;

            let comment = "Stable";
            if (actualUnits === 0) {
                comment = "No Impact: Item had zero sales activity.";
            } else if (upliftUnits > 0) {
                if (upliftProfit > 0) comment = "Winner: Profitable volume uplift.";
                else comment = "Review: Volume gain did not cover margin sacrifice.";
            } else {
                comment = "Ineffective: No significant volume growth detected vs baseline.";
            }

            return [
                item.sku,
                item.product?.name || 'Unknown',
                item.baselinePrice.toFixed(2),
                item.promoPrice.toFixed(2),
                item.discountPercent.toFixed(1) + '%',
                item.baselineDailyUnits.toFixed(2),
                item.actualUnits.toFixed(0),
                item.actualRevenue.toFixed(2),
                item.actualProfit.toFixed(2),
                item.upliftUnits.toFixed(0),
                item.upliftProfit.toFixed(2),
                (item.marginPctDuring || 0).toFixed(1) + '%',
                comment
            ];
        });

        const grandTotalsRow = [
            'GRAND TOTALS', '', '', '', '', '',
            totals.actualUnits.toFixed(0),
            totals.actualRevenue.toFixed(2),
            totals.actualProfit.toFixed(2),
            totals.upliftUnits.toFixed(0),
            totals.upliftProfit.toFixed(2),
            '',
            ''
        ];

        const csvContent = [
            ...summary.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
            headers.map(v => `"${v}"`).join(','),
            ...rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')),
            grandTotalsRow.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')
        ].join('\n');

        const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `Post_Mortem_${promo.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const getRecommendation = () => {
        const { totals } = aggregatedEffectiveness;
        if (totals.actualUnits === 0 && windows.phase === 'POST') return { label: "Zero Impact", style: "text-gray-500", desc: "No sales recorded during this event." };
        if (totals.upliftUnits < (totals.baselineDailyUnits * 0.1) && windows.phase === 'POST') return { label: "Inefficient", style: "text-red-600", desc: "Uplift was negligible compared to baseline." };
        if (totals.upliftUnits > 0 && windows.phase === 'POST') return { label: "Successful Uplift", style: "text-green-600", desc: "Promotion generated meaningful volume growth." };
        return { label: "Monitoring", style: "text-indigo-600", desc: "Performance tracking in progress." };
    };

    const getStrategicRecommendation = () => {
        const { totals } = aggregatedEffectiveness;
        if (windows.phase !== 'POST') return null;

        if (totals.upliftUnits > 0) {
            if (totals.upliftProfit > 0) {
                return { 
                    label: "Repeat similar promotion", 
                    explanation: "Event was profitable with positive sales uplift. This is a winning configuration.", 
                    style: "bg-green-50 border-green-200 text-green-800" 
                };
            } else {
                return { 
                    label: "Reduce discount depth next time", 
                    explanation: "Uplift was positive but profit decreased vs baseline. Margin sacrifice was too high.", 
                    style: "bg-amber-50 border-amber-200 text-amber-800" 
                };
            }
        }
        return { 
            label: "Do not repeat promotion", 
            explanation: "No significant unit uplift detected. Customer response did not justify the discount.", 
            style: "bg-red-50 border-red-200 text-red-800" 
        };
    };

    const recommendation = getRecommendation();
    const stratRec = getStrategicRecommendation();

    const varianceStats = useMemo(() => {
        const { totals } = aggregatedEffectiveness;
        
        const forecastDiff = totals.actualUnits - totals.forecastUnits;
        const forecastDiffPct = totals.forecastUnits > 0 ? (forecastDiff / totals.forecastUnits) * 100 : 0;
        
        const baselineTotal = totals.actualUnits - totals.upliftUnits;
        const baselineDiff = totals.upliftUnits;
        const baselineDiffPct = baselineTotal > 0 ? (baselineDiff / baselineTotal) * 100 : 0;

        const getColor = (pct: number) => {
            if (pct > 5) return 'text-green-600';
            if (pct < -5) return 'text-red-600';
            return 'text-gray-500';
        };

        return {
            forecastDiff, forecastDiffPct, forecastColor: getColor(forecastDiffPct),
            baselineDiff, baselineDiffPct, baselineColor: getColor(baselineDiffPct)
        };
    }, [aggregatedEffectiveness]);

    return (
        <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between">
                <button onClick={onBack} className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm font-medium">
                    <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                </button>
                <div className="flex gap-2">
                    {isSkuScope && (
                        <button
                            onClick={() => setIsUploadOpen(true)}
                            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium shadow-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                            <Upload className="w-4 h-4" /> Batch Upload Items
                        </button>
                    )}
                    <button
                        onClick={onAddProducts}
                        className="px-4 py-2 text-white rounded-lg text-sm font-medium shadow-md hover:opacity-90 flex items-center gap-2"
                        style={{ backgroundColor: themeColor }}
                    >
                        <Zap className="w-4 h-4" /> Add SKUs
                    </button>
                </div>
            </div>

            {/* Lifecycle Banner */}
            <div className={`p-4 rounded-xl border flex items-center justify-between shadow-sm animate-in zoom-in duration-300 ${
                windows.phase === 'PRE' ? 'bg-blue-50 border-blue-100 text-blue-800' :
                windows.phase === 'LIVE' ? 'bg-green-50 border-green-100 text-green-800' :
                'bg-indigo-50 border-indigo-100 text-indigo-800'
            }`}>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-white/60`}>
                        {windows.phase === 'PRE' ? <Activity className="w-5 h-5" /> : windows.phase === 'LIVE' ? <Activity className="w-5 h-5" /> : <BarChart3 className="w-5 h-5" />}
                    </div>
                    <div>
                        <h4 className="font-bold uppercase text-xs tracking-widest">
                            {windows.phase === 'PRE' ? 'Pre-Event Forecast' : windows.phase === 'LIVE' ? 'Live Tracking' : 'Post-Event Analysis'}
                        </h4>
                        <p className="text-sm opacity-80">{dateRangeStr}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-[10px] uppercase font-black opacity-40">Status</div>
                        <div className="font-bold flex items-center gap-2">
                            {windows.phase === 'LIVE' && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                            {derivedStatus}
                        </div>
                    </div>
                    <div className="h-8 w-px bg-current opacity-10" />
                    <div className="flex bg-white/40 p-1 rounded-lg border border-current/5">
                        <button onClick={() => setActiveSection('nomination')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeSection === 'nomination' ? 'bg-white shadow text-gray-900' : 'opacity-60 hover:opacity-100'}`}>Nomination</button>
                        <button onClick={() => setActiveSection('analytics')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeSection === 'analytics' ? 'bg-white shadow text-gray-900' : 'opacity-60 hover:opacity-100'}`}>Analytics</button>
                    </div>
                </div>
            </div>

            {activeSection === 'nomination' ? (
                <div className="space-y-6">
                    {/* Meta Editor Card */}
                    <div className="bg-custom-glass p-6 rounded-xl border border-custom-glass shadow-sm">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">{promo.name}</h2>
                                <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                    <span className="flex items-center gap-1 font-medium"><Target className="w-4 h-4" /> {promo.platform}</span>
                                    <span className="text-xs font-black uppercase bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100">{promo.promotionScope || 'SKU'} SCOPE</span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                                    BASELINE: <span className="text-gray-900">{promo.baselineMode?.replace(/_/g, ' ')}</span>
                                    {promo.baselineMode === 'MANUAL' && <span className="text-indigo-600"> (£{promo.baselineManualPrice})</span>}
                                </div>
                            </div>
                        </div>

                        {!isSkuScope && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6 animate-in slide-in-from-top-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="font-bold text-indigo-900 text-sm">Shop-Wide Discount Rule</h4>
                                        <p className="text-xs text-indigo-700 mt-0.5">All nominated SKUs will inherit this rule based on their individual baseline prices.</p>
                                    </div>
                                    <div className="flex gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-400 uppercase block mb-1">Type</label>
                                            <select 
                                                value={promo.shopDiscountType}
                                                onChange={(e) => onUpdateMeta({ shopDiscountType: e.target.value })}
                                                className="text-sm font-bold border-indigo-200 rounded-lg py-1.5 px-3 bg-white focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value="PERCENT_OFF">% Off</option>
                                                <option value="FIXED_OFF">£ Off</option>
                                                <option value="FIXED_PRICE">Fixed Price</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-400 uppercase block mb-1">Value</label>
                                            <input 
                                                type="number"
                                                value={promo.shopDiscountValue}
                                                onChange={(e) => onUpdateMeta({ shopDiscountValue: parseFloat(e.target.value) || 0 })}
                                                className="w-24 text-sm font-bold border-indigo-200 rounded-lg py-1.5 px-3 bg-white focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <table className="tbl w-full text-left text-sm whitespace-nowrap bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                            <thead>
                                <tr>
                                    <SortableHeader label="SKU" sortKey="sku" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                                    <th className="p-4 text-right">Baseline Price</th>
                                    <th className="p-4">{isSkuScope ? 'Discount Type' : 'Rule Status'}</th>
                                    <th className="p-4 text-right">{isSkuScope ? 'Value' : ''}</th>
                                    <th className="p-4 text-right">Effective Promo Price</th>
                                    <th className="p-4 text-right">Proj. Margin</th>
                                    <th className="p-4 text-right w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedItems.map((item: any) => (
                                    <tr key={item.sku} className="group">
                                        <td className="p-4">
                                            <div className="flex items-center gap-1">
                                                <div className="font-bold text-gray-900">{item.sku}</div>
                                                <GradeBadge gradeLevel={item.product?.gradeLevel} />
                                                {item.isIncomplete && (
                                                    <span className="ml-2 text-[8px] bg-red-100 text-red-700 px-1 py-0.5 rounded-full font-black uppercase flex items-center gap-1 border border-red-200">
                                                        <AlertCircle className="w-2.5 h-2.5" /> Incomplete
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[150px]">{item.product?.name}</div>
                                        </td>
                                        <td className="p-4 text-right text-gray-500 font-medium">{formatSmartMoney(item.baselinePrice)}</td>
                                        <td className="p-4">
                                            {isSkuScope ? (
                                                <select 
                                                    value={item.discountType || 'FIXED_PRICE'}
                                                    onChange={(e) => onUpdateItem(item.sku, { discountType: e.target.value })}
                                                    className="text-xs font-bold border-gray-200 rounded-lg p-1.5 bg-white group-hover:border-indigo-300 transition-colors focus:ring-2 focus:ring-indigo-500"
                                                >
                                                    <option value="PERCENT_OFF">% Off</option>
                                                    <option value="FIXED_OFF">£ Off</option>
                                                    <option value="FIXED_PRICE">Fixed Price</option>
                                                </select>
                                            ) : (
                                                <span className="text-[10px] font-bold text-indigo-500 flex items-center gap-1.5 italic">
                                                    <RotateCcw className="w-3 h-3" /> Inherits shop rule
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            {isSkuScope && (
                                                <input 
                                                    type="number"
                                                    value={item.discountValue || ''}
                                                    onChange={(e) => onUpdateItem(item.sku, { discountValue: parseFloat(e.target.value) || 0 })}
                                                    placeholder="0.00"
                                                    className="w-20 text-right text-xs font-bold border-gray-200 rounded-lg p-1.5 bg-white group-hover:border-indigo-300 transition-colors focus:ring-2 focus:ring-indigo-500"
                                                />
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-sm font-black text-gray-900">{formatSmartMoney(item.promoPrice)}</span>
                                                <span className="text-[9px] font-bold text-red-500">-{item.discountPercent.toFixed(1)}% OFF</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <span className={`px-2 py-1 rounded text-xs font-bold border ${item.projectedMargin > 20 ? 'bg-green-100 text-green-700 border-green-200' : item.projectedMargin > 0 ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                                {item.projectedMargin !== null && item.projectedMargin !== undefined ? item.projectedMargin.toFixed(1) : '0.0'}%
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button
                                                onClick={() => onDeleteItem(item.sku)}
                                                className="text-gray-300 hover:text-red-600 transition-colors p-1"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {(!promo?.items || promo.items.length === 0) && (
                                    <tr><td colSpan={7} className="p-12 text-center text-gray-400 italic">No SKUs nominated for this campaign.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-in slide-in-from-left duration-300">
                    {/* Panel A: Forecast */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-indigo-600" />
                                Pre-Event Forecast
                            </h4>
                            <div className="flex items-center gap-2">
                                {suggestedLiftData.val > 0 && Math.abs(suggestedLiftData.val - (promo.expectedLiftPct || 0)) > 1 && (
                                    <button
                                        onClick={() => onUpdateMeta({ expectedLiftPct: suggestedLiftData.val })}
                                        className="flex items-center gap-1 text-[9px] font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-full border border-indigo-100 hover:bg-indigo-100 hover:border-indigo-200 transition-all animate-in fade-in"
                                        title={`${suggestedLiftData.source}. Calculated Sensitivity: ${suggestedLiftData.elasticity.toFixed(1)}`}
                                    >
                                        <Sparkles className="w-2.5 h-2.5" />
                                        Sugg: {suggestedLiftData.val}%
                                    </button>
                                )}
                                <div className="flex items-center gap-1">
                                    <span className="text-[9px] font-black text-gray-400 uppercase">Lift %</span>
                                    <input 
                                        type="number"
                                        value={promo.expectedLiftPct || 0}
                                        onChange={(e) => onUpdateMeta({ expectedLiftPct: parseFloat(e.target.value) || 0 })}
                                        className="w-12 text-right text-[9px] font-bold border border-gray-200 rounded p-0.5 bg-white"
                                    />
                                </div>
                            </div>
                        </div>
                        <div className="p-6 space-y-6">
                            <p className="text-sm text-gray-600 italic">If nothing unusual happens, this promotion is expected to generate:</p>

                            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-indigo-800">Forecast Totals</span>
                                    <span className="text-lg font-black text-indigo-700">{formatNumber(aggregatedEffectiveness.totals.forecastUnits, 0)} <span className="text-xs font-normal">units</span></span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-indigo-800">Expected Revenue</span>
                                    <span className="text-lg font-bold text-indigo-900">{formatSmartMoney(aggregatedEffectiveness.totals.forecastUnits * (aggregatedEffectiveness.totals.baselineRevenue / (aggregatedEffectiveness.totals.baselineDailyUnits * (windows.event?.days || 1) || 1)), 0)}</span>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Baseline Units</div>
                                    <div className="text-xl font-black text-gray-900">{formatNumber(aggregatedEffectiveness.totals.baselineDailyUnits, 1)} <span className="text-[10px] font-normal">/day</span></div>
                                </div>
                                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Days in Window</div>
                                    <div className="text-xl font-black text-gray-900">{windows.event?.days || 0}</div>
                                </div>
                            </div>
                            
                            <div className="bg-blue-50/50 p-3 rounded-lg text-[11px] text-blue-700 flex gap-2">
                                <Info className="w-4 h-4 shrink-0" />
                                <p>Baseline calculated using weighted performance from {windows.pre?.days || 0} days prior to event start.</p>
                            </div>
                        </div>
                    </div>

                    {/* Panel B: Live Tracking */}
                    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col ${windows.phase === 'PRE' ? 'opacity-40 grayscale' : ''}`}>
                        <div className="p-4 border-b border-gray-100 bg-gray-50">
                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-green-600" />
                                Live Performance
                            </h4>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Units to Date</div>
                                    <div className="text-3xl font-black text-gray-900">{formatNumber(aggregatedEffectiveness.totals.actualUnits)}</div>
                                    
                                    {/* Variance Indicators */}
                                    <div className="mt-3 space-y-1">
                                        <div className={`text-[11px] font-bold flex items-center gap-1 ${varianceStats.forecastColor}`}>
                                            {varianceStats.forecastDiff >= 0 ? '+' : ''}{formatNumber(varianceStats.forecastDiff)} vs forecast ({varianceStats.forecastDiffPct >= 0 ? '+' : ''}{varianceStats.forecastDiffPct.toFixed(0)}%)
                                        </div>
                                        <div className={`text-[11px] font-bold flex items-center gap-1 ${varianceStats.baselineColor}`}>
                                            {varianceStats.baselineDiff >= 0 ? '+' : ''}{formatNumber(varianceStats.baselineDiff)} vs baseline ({varianceStats.baselineDiffPct >= 0 ? '+' : ''}{varianceStats.baselineDiffPct.toFixed(0)}%)
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    {aggregatedEffectiveness.totals.upliftUnits > 0 ? (
                                        <div className="flex items-center gap-1 text-green-600 font-bold animate-in slide-in-from-bottom-1">
                                            <TrendingUp className="w-4 h-4" />
                                            {formatNumber(aggregatedEffectiveness.totals.upliftUnits)} units uplift
                                        </div>
                                    ) : (
                                        <div className="text-gray-400 text-xs font-medium italic">Pending tracking...</div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-gray-50 rounded-xl">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase">Revenue</div>
                                    <div className="text-lg font-bold text-gray-900">{formatSmartMoney(aggregatedEffectiveness.totals.actualRevenue)}</div>
                                </div>
                                <div className="p-3 bg-gray-50 rounded-xl">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase">Profit</div>
                                    <div className="text-lg font-bold text-gray-900">{formatSmartMoney(aggregatedEffectiveness.totals.actualProfit)}</div>
                                </div>
                            </div>
                            
                            <div className="pt-2">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Goal Progress</span>
                                    <span className="text-[10px] font-bold text-indigo-600">{Math.min(100, (aggregatedEffectiveness.totals.actualUnits / (aggregatedEffectiveness.totals.forecastUnits || 1) * 100)).toFixed(0)}%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                                        style={{ width: `${Math.min(100, (aggregatedEffectiveness.totals.actualUnits / (aggregatedEffectiveness.totals.forecastUnits || 1) * 100))}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Panel C: Post-Analysis */}
                    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col ${windows.phase !== 'POST' ? 'opacity-40 grayscale' : ''}`}>
                        <div className="p-4 border-b border-gray-100 bg-gray-50">
                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-purple-600" />
                                Campaign Efficiency
                            </h4>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="space-y-4">
                                <div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Rule-Based Assessment</div>
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className={`font-black text-sm flex items-center gap-2 ${recommendation.style}`}>
                                            <Star className="w-4 h-4 fill-current" />
                                            {recommendation.label}
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{recommendation.desc}</p>
                                    </div>
                                </div>

                                {/* Strategic Recommendation Block */}
                                {stratRec && (
                                    <div>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Strategic Recommendation</div>
                                        <div className={`p-3 rounded-xl border ${stratRec.style} animate-in fade-in slide-in-from-top-1`}>
                                            <div className="font-black text-xs uppercase flex items-center gap-2 mb-1">
                                                <Target className="w-3.5 h-3.5" />
                                                {stratRec.label}
                                            </div>
                                            <p className="text-[10px] opacity-90 leading-normal">{stratRec.explanation}</p>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-xs text-gray-500">Total Unit Uplift</span>
                                        <span className={`text-sm font-black ${aggregatedEffectiveness.totals.upliftUnits > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {aggregatedEffectiveness.totals.upliftUnits > 0 ? '+' : ''}{formatNumber(aggregatedEffectiveness.totals.upliftUnits)} u
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-xs text-gray-500">Revenue Yield Change</span>
                                        <span className={`text-sm font-black ${aggregatedEffectiveness.totals.upliftRevenue > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {aggregatedEffectiveness.totals.upliftRevenue > 0 ? '+' : ''}{formatSmartMoney(aggregatedEffectiveness.totals.upliftRevenue)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-xs text-gray-500">Profit Yield Change</span>
                                        <span className={`text-sm font-black ${aggregatedEffectiveness.totals.upliftProfit > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {aggregatedEffectiveness.totals.upliftProfit > 0 ? '+' : ''}{formatSmartMoney(aggregatedEffectiveness.totals.upliftProfit)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            {windows.phase === 'POST' && (
                                <button 
                                    onClick={handleExportPostMortem}
                                    className="w-full py-2 bg-gray-900 text-white rounded-lg text-xs font-bold shadow-md hover:bg-gray-800 transition-colors flex items-center justify-center gap-2"
                                >
                                    <Download className="w-3.5 h-3.5" />
                                    Export Post-Mortem CSV
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isUploadOpen && (
                <PromoUploadModal
                    products={products}
                    themeColor={themeColor}
                    onClose={() => setIsUploadOpen(false)}
                    onConfirm={(items, mode) => {
                        const newItems: PromotionItem[] = items.map((i: any) => {
                            const product = (products || []).find(p => p.sku.toUpperCase() === i.sku.toUpperCase());
                            const basePrice = getBaselineForProduct(promo, product);
                            
                            let discountType: UploadDiscountMode | 'FIXED_PRICE' = 'FIXED_PRICE';
                            let discountValue = 0;
                            let promoPrice = 0;

                            if (mode === 'PERCENT_OFF') {
                                discountType = 'PERCENT_OFF';
                                discountValue = i.value;
                                promoPrice = deriveDiscountedPrice(basePrice, 'PERCENT_OFF', i.value);
                            } else if (mode === 'FIXED_OFF') {
                                discountType = 'FIXED_OFF';
                                discountValue = i.value;
                                promoPrice = deriveDiscountedPrice(basePrice, 'FIXED_OFF', i.value);
                            } else {
                                // FIXED_PRICE mode (default)
                                discountType = 'FIXED_PRICE';
                                discountValue = i.value;
                                promoPrice = i.value;
                            }

                            return {
                                sku: i.sku,
                                basePrice: Number(basePrice.toFixed(2)),
                                discountType: discountType as any,
                                discountValue: discountValue,
                                promoPrice: promoPrice
                            };
                        });

                        const currentItems = promo.items || [];
                        const existing = new Set(currentItems.map((i: any) => i.sku.toUpperCase()));
                        const uniqueNew = newItems.filter((i: any) => !existing.has(i.sku.toUpperCase()));
                        onUpdateMeta({ items: [...currentItems, ...uniqueNew] });
                        setIsUploadOpen(false);
                    }}
                />
            )}
        </div>
    );
};
