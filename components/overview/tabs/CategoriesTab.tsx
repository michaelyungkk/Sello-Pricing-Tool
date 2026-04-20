
import React, { useMemo, useState, useEffect, useRef } from 'react';
import { Product, PriceLog, CategoryPolicy, RefundLog } from '../../../types';
import { aggregateCategoryData, MainCategoryData, SubCategoryData, CategoryMetric } from '../../../services/categoryAgg';
import { getPolicyForProduct, upsertCategoryPolicy, getCategoryPolicies } from '../../../services/categoryPolicyService';
import { asDateKey, addDaysToDateKey, isDateKeyBetween } from '../../../services/dateUtils';
import { DollarSign, PieChart, Megaphone, ChevronRight, Layers, LayoutGrid, Coins, Target, Save, AlertCircle, Upload, X, TrendingUp, TrendingDown, Package, Table, Repeat } from 'lucide-react';
import { scaleLinear } from 'd3-scale';
import { Treemap, ResponsiveContainer, Tooltip as RechartsTooltip } from 'recharts';
import * as XLSX from 'xlsx';
import { SortState, sortRows } from '../../../utils/tableSort';
import { SortableHeader } from '../../common/SortableHeader';
import { VAT_MULTIPLIER } from '../../../constants';
import { MetricCard } from '../../productManagement/parts/MetricCard';

// Helper to determine text color based on background luminance
const getTextColorForBackground = (hexColor: string): string => {
    if (!hexColor || !hexColor.startsWith('#')) return '#0f172a'; // Default dark
    const hex = hexColor.substring(1);
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    const fullHex = hex.replace(shorthandRegex, (m, r, g, b) => r + r + g + g + b + b);

    if (fullHex.length !== 6) return '#0f172a';

    const r = parseInt(fullHex.substring(0, 2), 16);
    const g = parseInt(fullHex.substring(2, 4), 16);
    const b = parseInt(fullHex.substring(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b);

    return luminance > 150 ? '#020617' : '#f8fafc';
};

interface CategoryPerformanceSlideProps {
    products: Product[];
    priceHistoryMap: Map<string, PriceLog[]>;
    refundHistory: RefundLog[];
    dateRange: { start: Date; end: Date };
    themeColor: string;
    deductRefunds: boolean;
    platformScope?: string[];
}

type MetricType = 'REVENUE' | 'PROFIT' | 'MARGIN' | 'TACOS';
type TopCatMode = 'TOTAL' | 'PER_SKU' | 'PER_ORDER';
type PopMode = 'ABSOLUTE' | 'CHANGE';

const METRIC_CONFIG: Record<MetricType, { label: string, icon: any, format: (v: number) => string }> = {
    REVENUE: {
        label: 'Revenue',
        icon: DollarSign,
        format: (v) => `£${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    },
    PROFIT: {
        label: 'Profit',
        icon: Coins,
        format: (v) => `£${v.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
    },
    MARGIN: {
        label: 'Margin %',
        icon: PieChart,
        format: (v) => `${v.toFixed(1)}%`
    },
    TACOS: {
        label: 'TACoS %',
        icon: Megaphone,
        format: (v) => `${v.toFixed(1)}%`
    }
};

const createEmptyMetric = (): CategoryMetric => ({
    revenue: 0, units: 0, orders: 0, profit: 0, adSpend: 0, margin: 0, tacos: 0,
    prevRevenue: 0, prevUnits: 0, prevProfit: 0, prevAdSpend: 0, prevMargin: 0, prevTacos: 0
});

interface CellRendererProps {
    cat: MainCategoryData;
    plat: string;
    getCellValue: (cat: MainCategoryData, plat: string) => number;
    colorScale: (val: number) => string;
    resolveTargetMargin: (mainCat: string, subCat?: string, platform?: string) => number | null;
    metric: MetricType;
    mode: PopMode;
}

const CellRenderer = ({ cat, plat, getCellValue, colorScale, resolveTargetMargin, metric, mode }: CellRendererProps) => {
    const val = getCellValue(cat, plat);
    const m = plat === 'All' ? cat.total : cat.platforms[plat];
    const hasData = m && (m.revenue > 0 || m.prevRevenue > 0);

    const target = resolveTargetMargin(cat.name, undefined, plat === 'All' ? undefined : plat);
    const actualMargin = m?.margin || 0;
    const isBelow = hasData && metric === 'MARGIN' && target !== null && actualMargin < target;

    const renderPopContent = () => {
        let value, prevValue;
        switch (metric) {
            case 'REVENUE': value = m.revenue; prevValue = m.prevRevenue; break;
            case 'PROFIT': value = m.profit; prevValue = m.prevProfit; break;
            case 'MARGIN': value = m.margin; prevValue = m.prevMargin; break;
            case 'TACOS': value = m.tacos; prevValue = m.prevTacos; break;
            default: return null;
        }

        const deltaAbs = value - prevValue;
        const deltaPct = prevValue !== 0 ? (deltaAbs / Math.abs(prevValue)) * 100 : (value > 0 ? Infinity : 0);

        let primaryDisplay: string;
        let secondaryDisplay: string | null = null;

        const isTacos = metric === 'TACOS';
        const isImprovement = isTacos ? deltaAbs < 0 : deltaAbs > 0;

        if (metric === 'REVENUE' || metric === 'PROFIT') {
            primaryDisplay = `${deltaAbs >= 0 ? '+' : ''}${METRIC_CONFIG[metric].format(Math.abs(deltaAbs))}`;
            if (isFinite(deltaPct)) {
                secondaryDisplay = `(${(deltaPct >= 0 ? '+' : '')}${deltaPct.toFixed(1)}%)`;
            } else if (deltaPct === Infinity) {
                secondaryDisplay = '(New)';
            }
        } else {
            primaryDisplay = `${deltaAbs > 0 && !isTacos ? '+' : ''}${deltaAbs.toFixed(1)}pp`;
        }

        const colorClass = isImprovement ? 'text-emerald-600 font-semibold' : deltaAbs !== 0 ? 'text-red-500 font-semibold' : 'text-gray-500 font-medium';
        const secondaryColorClass = isImprovement ? 'text-emerald-600/80 font-medium' : deltaAbs !== 0 ? 'text-red-500/80 font-medium' : 'text-gray-400 font-medium';

        return (
            <div className="flex flex-col items-center justify-center gap-0.5">
                <span className={`text-xs relative z-10 flex items-center justify-center gap-1 ${colorClass}`}>
                    {deltaAbs !== 0 ? (isImprovement ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />) : null}
                    {primaryDisplay}
                </span>
                {secondaryDisplay && (
                    <span className={`text-[10px] z-10 ${secondaryColorClass}`}>
                        {secondaryDisplay}
                    </span>
                )}
            </div>
        );
    }

    return (
        <div className="w-full h-full p-3 text-center flex flex-col justify-center relative" style={{ backgroundColor: hasData ? colorScale(val) : 'transparent' }}>
            {hasData ? (
                mode === 'ABSOLUTE' ? (
                    <span className="font-bold text-gray-800 text-xs relative z-10">
                        {METRIC_CONFIG[metric].format(val)}
                    </span>
                ) : renderPopContent()
            ) : <span className="text-gray-300">-</span>}
            {isBelow && (
                <div className="absolute top-1 right-1 z-10" title={`Below Target! Actual: ${actualMargin.toFixed(1)}%, Target: ${target}%`}>
                    <AlertCircle className="w-3 h-3 text-red-500 fill-white" />
                </div>
            )}
        </div>
    );
};

export const CategoryPerformanceSlide: React.FC<CategoryPerformanceSlideProps> = ({
    products,
    priceHistoryMap,
    refundHistory = [],
    dateRange,
    themeColor,
    deductRefunds,
    platformScope = []
}) => {
    const [metric, setMetric] = useState<MetricType>('REVENUE');
    const [viewMode, setViewMode] = useState<'MATRIX' | 'TREEMAP'>('MATRIX');
    const [selectedCell, setSelectedCell] = useState<{ category: string, platform: string } | null>(null);
    const [topCatMode, setTopCatMode] = useState<TopCatMode>('TOTAL');
    const [mode, setMode] = useState<PopMode>('ABSOLUTE');
    const [drilldownSort, setDrilldownSort] = useState<SortState<string>>({ key: 'revenue', dir: 'desc' });

    const [activePlatform, setActivePlatform] = useState<string>('All');
    // Sync internal filter with global platformScope when it changes
    React.useEffect(() => {
        if (platformScope.length === 1) setActivePlatform(platformScope[0]);
        else setActivePlatform('All');
    }, [platformScope]);

    const [policyScope, setPolicyScope] = useState<string>('__MAIN__');
    const [targetMargin, setTargetMargin] = useState<string>('');
    const [baselinePrice, setBaselinePrice] = useState<string>('');
    const [policyLastUpdated, setPolicyLastUpdated] = useState<string | null>(null);
    const [allPolicies, setAllPolicies] = useState<CategoryPolicy[]>([]);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const getCellValue = React.useCallback((cat: MainCategoryData, plat: string): number => {
        const m = plat === 'All' ? cat.total : cat.platforms[plat]; if (!m) return 0;
        if (mode === 'ABSOLUTE') return metric === 'REVENUE' ? m.revenue : metric === 'PROFIT' ? m.profit : metric === 'MARGIN' ? m.margin : m.tacos;
        let value = 0, prevValue = 0;
        switch (metric) {
            case 'REVENUE': value = m.revenue; prevValue = m.prevRevenue; break;
            case 'PROFIT': value = m.profit; prevValue = m.prevProfit; break;
            case 'MARGIN': value = m.margin; prevValue = m.prevMargin; break;
            case 'TACOS': value = m.tacos; prevValue = m.prevTacos; break;
        }
        return value - prevValue;
    }, [mode, metric]);

    const { categories, platforms } = useMemo(() => {
        const baseAgg = aggregateCategoryData(products, priceHistoryMap, dateRange);
        if (!deductRefunds) return baseAgg;

        const { startKey, endKey } = { startKey: asDateKey(dateRange.start), endKey: asDateKey(dateRange.end) };
        const durationMs = new Date(endKey!).getTime() - new Date(startKey!).getTime();
        const durationDays = Math.round(durationMs / (1000 * 60 * 60 * 24)) + 1;
        const prevEndKey = addDaysToDateKey(startKey!, -1);
        const prevStartKey = addDaysToDateKey(prevEndKey, -(durationDays - 1));

        const skuToCatMap = new Map<string, { main: string, sub: string }>();
        products.forEach(p => skuToCatMap.set(p.sku, { main: p.category || 'Uncategorized', sub: p.subcategory || 'General' }));

        refundHistory.forEach(r => {
            const dKey = asDateKey(r.date);
            if (!dKey) return;
            const isCurrent = isDateKeyBetween(dKey, startKey!, endKey!);
            const isPrior = isDateKeyBetween(dKey, prevStartKey, prevEndKey);
            if (!isCurrent && !isPrior) return;
            const catInfo = skuToCatMap.get(r.sku);
            if (!catInfo) return;
            const catNode = baseAgg.categories.find(c => c.name === catInfo.main);
            if (!catNode) return;
            const subNode = catNode.subcategories[catInfo.sub];
            const plat = r.platform || 'Unknown';
            const refundValue = (Number(r.amount) + Number(r.freightAmount || 0)) * VAT_MULTIPLIER;
            const applyDeduction = (m: CategoryMetric) => {
                if (isCurrent) {
                    m.profit -= refundValue;
                    if (m.revenue > 0) m.margin = (m.profit / m.revenue) * 100;
                } else {
                    m.prevProfit -= refundValue;
                    if (m.prevRevenue > 0) m.prevMargin = (m.prevProfit / m.prevRevenue) * 100;
                }
            };
            applyDeduction(catNode.total);
            if (catNode.platforms[plat]) applyDeduction(catNode.platforms[plat]);
            if (subNode) {
                applyDeduction(subNode.total);
                if (subNode.platforms[plat]) applyDeduction(subNode.platforms[plat]);
            }
        });
        return baseAgg;
    }, [products, priceHistoryMap, refundHistory, dateRange, deductRefunds]);

    const kpiStats = useMemo(() => {
        const skuCounts: Record<string, number> = {};
        products.forEach(p => { const cat = p.category || 'Uncategorized'; skuCounts[cat] = (skuCounts[cat] || 0) + 1; });
        const totalRevenue = categories.reduce((sum, c) => sum + c.total.revenue, 0);
        const totalProfit = categories.reduce((sum, c) => sum + c.total.profit, 0);
        const totalMargin = totalRevenue > 0 ? (totalProfit / totalRevenue) * 100 : 0;
        const totalPrevRevenue = categories.reduce((sum, c) => sum + c.total.prevRevenue, 0);
        const totalRevenueChange = totalRevenue - totalPrevRevenue;
        const totalRevenueChangePct = totalPrevRevenue > 0 ? (totalRevenueChange / totalPrevRevenue) * 100 : (totalRevenue > 0 ? Infinity : 0);
        const totalPrevProfit = categories.reduce((sum, c) => sum + c.total.prevProfit, 0);
        const totalPrevMargin = totalPrevRevenue > 0 ? (totalPrevProfit / totalPrevRevenue) * 100 : 0;
        const totalMarginChange = totalMargin - totalPrevMargin;
        const topTotal = [...categories].sort((a, b) => b.total.revenue - a.total.revenue)[0];
        const topPerSku = [...categories].filter(c => c.total.revenue > 0).map(c => ({ name: c.name, val: c.total.revenue / (skuCounts[c.name] || 1) })).sort((a, b) => b.val - a.val)[0];
        const topPerOrder = [...categories].filter(c => c.total.revenue > 0 && c.total.orders > 5).map(c => ({ name: c.name, val: c.total.revenue / (c.total.orders || 1) })).sort((a, b) => b.val - a.val)[0];
        const lowMarginCat = [...categories].filter(c => c.total.revenue > 1000).sort((a, b) => a.total.margin - b.total.margin)[0];
        return { totalRevenue, totalMargin, totalRevenueChange, totalRevenueChangePct, totalMarginChange, topTotal: topTotal ? { name: topTotal.name, val: topTotal.total.revenue } : null, topPerSku, topPerOrder, lowMarginCat: lowMarginCat ? { name: lowMarginCat.name, val: lowMarginCat.total.margin } : null, skuCounts };
    }, [categories, products]);

    // FIX: Added helper to cycle through Top Category metrics
    const cycleTopCatMode = () => {
        setTopCatMode(prev => prev === 'TOTAL' ? 'PER_SKU' : prev === 'PER_SKU' ? 'PER_ORDER' : 'TOTAL');
    };

    // FIX: Added helper for Top Category section labels
    const getTopCatLabel = () => {
        if (topCatMode === 'TOTAL') return 'Top Category (Total)';
        if (topCatMode === 'PER_SKU') return 'Top Category (Per SKU)';
        return 'Top Category (Per Order)';
    };

    // FIX: Added helper for Top Category section units
    const getTopCatUnit = () => {
        if (topCatMode === 'TOTAL') return '';
        if (topCatMode === 'PER_SKU') return '/ SKU avg';
        return '/ Order avg';
    };

    // FIX: Calculated derived state for currently displayed top category
    const currentTopCat = topCatMode === 'TOTAL' ? kpiStats.topTotal : topCatMode === 'PER_SKU' ? kpiStats.topPerSku : kpiStats.topPerOrder;

    useEffect(() => { setAllPolicies(getCategoryPolicies()); }, [policyLastUpdated]);
    useEffect(() => { setPolicyScope('__MAIN__'); }, [selectedCell?.category]);
    useEffect(() => {
        if (!selectedCell) return;
        const policy = getPolicyForProduct(selectedCell.category, policyScope === '__MAIN__' ? undefined : policyScope, undefined);
        if (policy) {
            setTargetMargin(policy.targetMarginPct !== undefined && policy.targetMarginPct !== null ? policy.targetMarginPct.toString() : '');
            setBaselinePrice(policy.baselinePrice !== undefined && policy.baselinePrice !== null ? policy.baselinePrice.toString() : '');
            setPolicyLastUpdated(policy.updatedAt || null);
        } else {
            setTargetMargin(''); setBaselinePrice(''); setPolicyLastUpdated(null);
        }
    }, [selectedCell, policyScope]);

    const handleSavePolicy = () => {
        if (!selectedCell) return;
        const margin = targetMargin === '' ? null : parseFloat(targetMargin);
        const price = baselinePrice === '' ? null : parseFloat(baselinePrice);
        if (margin !== null && (margin < 0 || margin > 100)) { alert("Margin must be between 0 and 100"); return; }
        if (price !== null && price < 0) { alert("Price must be positive"); return; }
        upsertCategoryPolicy({ mainCategory: selectedCell.category, subCategory: policyScope === '__MAIN__' ? undefined : policyScope, platform: undefined, targetMarginPct: margin, baselinePrice: price, updatedBy: 'manual' });
        setPolicyLastUpdated(new Date().toISOString());
        alert("Targets saved. (Note: This does not affect live pricing automation yet)");
    };

    const handleImportPolicies = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]; if (!file) return;
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result; const wb = XLSX.read(bstr, { type: 'array' });
                const ws = wb.Sheets[wb.SheetNames[0]]; const data = XLSX.utils.sheet_to_json(ws);
                if (data.length === 0) throw new Error("Empty file");
                let count = 0;
                data.forEach((row: any) => {
                    const keys = Object.keys(row).reduce((acc, k) => { acc[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = k; return acc; }, {} as Record<string, string>);
                    const findVal = (candidates: string[]) => { for (const c of candidates) { if (keys[c]) return row[keys[c]]; } return undefined; };
                    const mainCat = findVal(['category', 'maincategory', 'main']); if (!mainCat) return;
                    const subCat = findVal(['subcategory', 'sub', 'subcat']);
                    const platform = findVal(['platform', 'channel']);
                    const marginVal = findVal(['targetmargin', 'margin', 'targetmarginpct', 'targetpct']);
                    const priceVal = findVal(['baselineprice', 'baseprice', 'price']);
                    let targetMarginPct = null; if (marginVal !== undefined) { const m = parseFloat(marginVal); if (!isNaN(m)) targetMarginPct = (m > 0 && m <= 1) ? m * 100 : m; }
                    let bPrice = null; if (priceVal !== undefined) { const p = parseFloat(priceVal); if (!isNaN(p)) bPrice = p; }
                    if (targetMarginPct !== null || bPrice !== null) { upsertCategoryPolicy({ mainCategory: String(mainCat).trim(), subCategory: subCat ? String(subCat).trim() : undefined, platform: platform ? String(platform).trim() : undefined, targetMarginPct, baselinePrice: bPrice, updatedBy: 'import' }); count++; }
                });
                setPolicyLastUpdated(new Date().toISOString()); alert(`Successfully imported targets for ${count} categories.`);
            } catch (err) { alert("Failed to parse file."); }
            if (fileInputRef.current) fileInputRef.current.value = '';
        };
        reader.readAsArrayBuffer(file);
    };

    const resolveTargetMargin = (mainCat: string, subCat?: string, platform?: string): number | null => {
        if (subCat && platform && platform !== 'All') { const match = allPolicies.find(p => p.mainCategory === mainCat && p.subCategory === subCat && p.platform === platform); if (match?.targetMarginPct !== undefined) return match.targetMarginPct; }
        if (subCat) { const match = allPolicies.find(p => p.mainCategory === mainCat && p.subCategory === subCat && !p.platform); if (match?.targetMarginPct !== undefined) return match.targetMarginPct; }
        if (platform && platform !== 'All') { const match = allPolicies.find(p => p.mainCategory === mainCat && !p.subCategory && p.platform === platform); if (match?.targetMarginPct !== undefined) return match.targetMarginPct; }
        const match = allPolicies.find(p => p.mainCategory === mainCat && !p.subCategory && !p.platform); return match?.targetMarginPct ?? null;
    };



    const colorScaleDomain = useMemo(() => {
        let min = Infinity, max = -Infinity;
        categories.forEach(cat => { [...platforms, 'All'].forEach(plat => { const val = getCellValue(cat, plat); if (isFinite(val)) { if (val < min) min = val; if (val > max) max = val; } }); });
        if (min === Infinity) { min = 0; max = 100; } if (min === max) { if (min === 0) max = 1; else max = min * 1.1; }
        return { min, max };
    }, [categories, platforms, getCellValue]);

    const colorScale = useMemo(() => {
        const { min, max } = colorScaleDomain;
        if (mode === 'CHANGE') { const isTacosInverted = metric === 'TACOS'; const colors = isTacosInverted ? ['#34d399', '#f1f5f9', '#f87171'] : ['#f87171', '#f1f5f9', '#34d399']; const absMax = Math.max(Math.abs(min), Math.abs(max)); return scaleLinear<string>().domain([-absMax, 0, absMax]).range(colors).clamp(true); }
        if (metric === 'MARGIN') return scaleLinear<string>().domain([0, 15, 30]).range(['#f87171', '#fcd34d', '#34d399']).clamp(true);
        if (metric === 'TACOS') return scaleLinear<string>().domain([8, 20, 35]).range(['#34d399', '#fcd34d', '#f87171']).clamp(true);
        return scaleLinear<string>().domain([0, max * 0.5, max]).range(['#dbeafe', '#60a5fa', '#1e40af']).clamp(true);
    }, [colorScaleDomain, metric, mode]);

    const drilldownData = useMemo(() => {
        if (!selectedCell) return null;
        const catData = categories.find(c => c.name === selectedCell.category); if (!catData) return null;
        const subs = (Object.values(catData.subcategories) as SubCategoryData[]).map(sub => { const m = selectedCell.platform === 'All' ? sub.total : sub.platforms[selectedCell.platform]; return { name: sub.name, metric: m || createEmptyMetric() }; });
        const getValue = (row: { name: string, metric: CategoryMetric }, key: string) => key === 'name' ? row.name : (row.metric as any)[key];
        return sortRows(subs, drilldownSort, getValue);
    }, [selectedCell, categories, drilldownSort]);

    const treemapData = useMemo(() => {
        return categories.map(cat => {
            const m = activePlatform === 'All' ? cat.total : cat.platforms[activePlatform];
            if (!m) return { name: cat.name, size: 0, revenue: 0, profit: 0, margin: 0, tacos: 0, rawVal: 0, skuCount: 0, prevRevenue: 0, prevProfit: 0, prevMargin: 0, prevTacos: 0 };
            let rawVal, size;
            if (mode === 'ABSOLUTE') {
                rawVal = metric === 'REVENUE' ? m.revenue : metric === 'PROFIT' ? m.profit : metric === 'MARGIN' ? m.margin : m.tacos;
                size = metric === 'REVENUE' ? Math.max(0, m.revenue) : metric === 'PROFIT' ? Math.abs(m.profit) : Math.max(0, m.revenue);
            } else {
                let value = 0, prevValue = 0;
                switch (metric) { case 'REVENUE': value = m.revenue; prevValue = m.prevRevenue; break; case 'PROFIT': value = m.profit; prevValue = m.prevProfit; break; case 'MARGIN': value = m.margin; prevValue = m.prevMargin; break; case 'TACOS': value = m.tacos; prevValue = m.prevTacos; break; }
                const deltaAbs = value - prevValue; rawVal = deltaAbs; const absChange = Math.abs(deltaAbs);
                size = (metric === 'MARGIN' || metric === 'TACOS') ? absChange * (m.revenue > 0 ? m.revenue / 100 : 1) : absChange;
            }
            return { name: cat.name, size: Math.max(1, size), revenue: m.revenue, profit: m.profit, margin: m.margin, tacos: m.tacos, prevRevenue: m.prevRevenue, prevProfit: m.prevProfit, prevMargin: m.prevMargin, prevTacos: m.prevTacos, rawVal, skuCount: kpiStats.skuCounts[cat.name] || 0 };
        }).filter(d => d.size > 0 && isFinite(d.size)).sort((a, b) => b.size - a.size);
    }, [categories, activePlatform, metric, kpiStats, mode]);

    const TreemapContent = (props: any) => {
        const { x, y, width, height, name, rawVal } = props; if (!name || width <= 0 || height <= 0) return null;
        const bgColor = colorScale(rawVal); const textColor = getTextColorForBackground(bgColor);
        return (<g onClick={(e) => { e.stopPropagation(); setSelectedCell({ category: name, platform: activePlatform }); }} className="cursor-pointer hover:opacity-90 transition-opacity"><rect x={x} y={y} width={width} height={height} style={{ fill: bgColor, stroke: selectedCell?.category === name ? themeColor : 'transparent', strokeWidth: selectedCell?.category === name ? 3 : 0 }} />{width > 60 && height > 30 && <text x={x + width / 2} y={y + height / 2 - 7} textAnchor="middle" fill={textColor} fontSize={12} fontWeight="bold">{name}</text>}{width > 60 && height > 50 && (<text x={x + width / 2} y={y + height / 2 + 11} textAnchor="middle" fill={textColor} fontSize={11}>{mode === 'ABSOLUTE' ? METRIC_CONFIG[metric].format(rawVal) : (metric === 'MARGIN' || metric === 'TACOS') ? `${rawVal > 0 ? '+' : ''}${rawVal.toFixed(1)}pp` : `${rawVal >= 0 ? '+' : ''}£${Math.abs(rawVal).toLocaleString(undefined, { maximumFractionDigits: 0 })}`}</text>)}</g>);
    };

    const CustomTreemapTooltip = ({ active, payload }: any) => {
        if (active && payload?.[0]?.payload) {
            const data = payload[0].payload;
            const ChangeDisplay = ({ cur, prev }: { cur: number, prev: number }) => { const change = cur - prev; const pct = prev > 0 ? (change / prev) * 100 : Infinity; return (<span className={`text-[10px] ml-2 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>({change >= 0 ? '+' : ''}£{Math.abs(change).toLocaleString(undefined, { maximumFractionDigits: 0 })} {isFinite(pct) && `| ${pct.toFixed(0)}%`})</span>); };
            const PpDisplay = ({ cur, prev }: { cur: number, prev: number }) => { const change = cur - prev; return (<span className={`text-[10px] ml-2 ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>({change >= 0 ? '+' : ''}{change.toFixed(1)}pp)</span>); };
            return (<div className="bg-gray-900 text-white p-3 rounded-lg shadow-xl text-xs z-50 border border-gray-700"><div className="font-bold mb-2 border-b border-gray-700 pb-1 flex justify-between gap-4"><span>{data.name}</span><span className="text-gray-400">{activePlatform}</span></div><div className="grid grid-cols-2 gap-x-4 gap-y-1"><span className="text-gray-400">Revenue:</span><span className="text-right font-mono">£{data.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}{mode === 'CHANGE' && <ChangeDisplay cur={data.revenue} prev={data.prevRevenue} />}</span><span className="text-gray-400">Profit:</span><span className="text-right font-mono">£{data.profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}{mode === 'CHANGE' && <ChangeDisplay cur={data.profit} prev={data.prevProfit} />}</span><span className="text-gray-400">Margin:</span><span className={`text-right font-mono font-bold ${data.margin < 15 ? 'text-red-400' : 'text-green-400'}`}>{data.margin.toFixed(1)}%{mode === 'CHANGE' && <PpDisplay cur={data.margin} prev={data.prevMargin} />}</span><span className="text-gray-400">TACoS:</span><span className="text-right font-mono">{data.tacos.toFixed(1)}%{mode === 'CHANGE' && <PpDisplay cur={data.tacos} prev={data.prevTacos} />}</span><span className="text-gray-400 mt-1 pt-1 border-t border-gray-700">SKU Count:</span><span className="text-right font-mono mt-1 pt-1 border-t border-gray-700">{data.skuCount}</span></div></div>);
        }
        return null;
    };

    return (
        <div className="flex flex-col h-auto">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <MetricCard
                    title="Total Revenue"
                    icon={DollarSign}
                    color="blue"
                    value={mode === 'ABSOLUTE' ? `£${kpiStats.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : <span className={kpiStats.totalRevenueChange >= 0 ? 'text-emerald-600' : 'text-red-500'}>{kpiStats.totalRevenueChange >= 0 ? '+' : ''}£{Math.abs(kpiStats.totalRevenueChange).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>}
                    desc={mode === 'ABSOLUTE' ? `Across ${categories.length} Categories` : (isFinite(kpiStats.totalRevenueChangePct) ? `${kpiStats.totalRevenueChangePct >= 0 ? '+' : ''}${kpiStats.totalRevenueChangePct.toFixed(1)}% vs prior period` : 'New Revenue vs prior period')}
                />
                <div className="bg-custom-glass backdrop-blur-custom border border-custom-glass p-4 rounded-xl shadow-sm cursor-pointer transition-colors hover:border-theme-20" onClick={cycleTopCatMode}>
                    <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                            <span className="text-sm font-bold text-gray-500">{getTopCatLabel()}</span>
                            <div className="text-2xl font-bold text-gray-800 mt-1 truncate">{currentTopCat ? currentTopCat.name : '—'}</div>
                            {currentTopCat && <div className={`text-[10px] text-gray-400 mt-1 ${topCatMode === 'TOTAL' ? 'text-emerald-600' : 'text-theme'}`}>£{currentTopCat.val.toLocaleString(undefined, { maximumFractionDigits: 0 })} {getTopCatUnit()}</div>}
                        </div>
                        <div className="p-2 rounded-lg flex-shrink-0 ml-3 bg-emerald-500/10 text-emerald-600">
                            <Repeat className="w-5 h-5" />
                        </div>
                    </div>
                </div>
                <div className="bg-custom-glass backdrop-blur-custom border border-custom-glass p-4 rounded-xl shadow-sm">
                    <div className="flex items-start justify-between">
                        <div className="min-w-0 flex-1">
                            <span className="text-sm font-bold text-gray-500">Lowest Margin</span>
                            <div className="text-2xl font-bold text-gray-800 mt-1 truncate">{kpiStats.lowMarginCat ? kpiStats.lowMarginCat.name : '—'}</div>
                            {kpiStats.lowMarginCat && <div className="text-[10px] text-amber-500 mt-1">{kpiStats.lowMarginCat.val.toFixed(1)}% Avg Margin</div>}
                        </div>
                        <div className="p-2 rounded-lg flex-shrink-0 ml-3 bg-amber-500/10 text-amber-500">
                            <AlertCircle className="w-5 h-5" />
                        </div>
                    </div>
                </div>
                <MetricCard
                    title="Product Count"
                    icon={Package}
                    color="gray"
                    value={<span>{products.length} <span className="text-xs font-normal text-gray-500">SKUs</span></span>}
                    desc={`Avg ${(products.length / (categories.length || 1)).toFixed(0)} per Category`}
                />
            </div>

            <div className="flex gap-4 items-start min-h-0">
                <div className={`flex flex-col bg-custom-glass backdrop-blur-custom rounded-xl border border-custom-glass shadow-sm overflow-hidden transition-all duration-300 ${selectedCell ? 'w-2/3' : 'w-full'}`}>
                    <div className="p-3 border-b border-white/10 flex justify-between items-center bg-white/10">
                        <div className="flex items-center gap-3"><div className="p-1.5 bg-theme/20 text-theme rounded-lg"><LayoutGrid className="w-4 h-4" /></div><h3 className="font-bold text-gray-800 text-sm">Category Matrix</h3></div>
                        <div className="flex items-center gap-4">
                            {selectedCell && <button onClick={() => setSelectedCell(null)} className="px-2 py-1 text-[10px] font-bold text-gray-500 bg-white/10 hover:bg-white/20 rounded-md flex items-center gap-1 transition-colors"><X className="w-3 h-3" /> Clear</button>}
                            <div className="flex bg-white/20 border border-white/30 p-0.5 rounded-lg"><button onClick={() => setViewMode('MATRIX')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 ${viewMode === 'MATRIX' ? 'bg-white/30 text-theme shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><Table className="w-3 h-3" /> Matrix</button><button onClick={() => setViewMode('TREEMAP')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 ${viewMode === 'TREEMAP' ? 'bg-white/30 text-theme shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}><LayoutGrid className="w-3 h-3" /> Treemap</button></div>

                            <div className="flex bg-white/20 border border-white/30 p-0.5 rounded-lg"><button onClick={() => setMode('ABSOLUTE')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${mode === 'ABSOLUTE' ? 'bg-white/30 text-theme shadow-sm' : 'text-gray-500'}`}>Absolute</button><button onClick={() => setMode('CHANGE')} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${mode === 'CHANGE' ? 'bg-white/30 text-theme shadow-sm' : 'text-gray-500'}`}>Change</button></div>
                            <div className="flex bg-white/20 border border-white/30 p-0.5 rounded-lg">{(Object.keys(METRIC_CONFIG) as MetricType[]).map(m => <button key={m} onClick={() => setMetric(m)} className={`px-2 py-1 text-[10px] font-bold rounded-md transition-all ${metric === m ? 'bg-white/30 text-theme shadow-sm' : 'text-gray-500'}`}>{METRIC_CONFIG[m].label}</button>)}</div>
                            <button onClick={() => fileInputRef.current?.click()} className="p-1.5 border border-white/20 rounded-lg hover:bg-white/10 transition-colors"><Upload className="w-3.5 h-3.5 text-gray-600" /></button>
                            <input ref={fileInputRef} type="file" hidden accept=".csv, .xlsx" onChange={handleImportPolicies} />
                        </div>
                    </div>

                    {viewMode === 'MATRIX' ? (
                        <div className="relative sello-table-scroll">
                            <table className="sello-table">
                                <thead className="sticky top-0">
                                    <tr>
                                        <th className="pin" style={{ minWidth: 150 }}>Category</th>
                                        <th className="c">Total</th>
                                        {(activePlatform === 'All' ? platforms : platforms.filter(p => p === activePlatform)).map(p => <th key={p} className="c" style={{ minWidth: 100 }}>{p}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {categories.map(cat => (
                                        <tr key={cat.name} className="divide-x divide-gray-100/50 border-b border-gray-100/50 group">
                                            <td className="pin font-bold text-gray-700 group-hover:bg-gray-100/50 transition-colors"><div className="flex items-center gap-2"><Layers className={`w-3 h-3 ${selectedCell?.category === cat.name ? 'text-theme' : 'text-gray-400'}`} /><div className="flex flex-col"><span className="text-xs truncate max-w-[120px] text-gray-800">{cat.name}</span><span className="text-[9px] text-gray-500 font-medium">{kpiStats.skuCounts[cat.name] || 0} SKUs</span></div></div></td>
                                            <td className={`p-0 relative cursor-pointer hover:ring-2 hover:ring-indigo-400 ${selectedCell?.category === cat.name && selectedCell?.platform === 'All' ? 'ring-2 ring-theme z-20' : ''}`} onClick={() => setSelectedCell({ category: cat.name, platform: 'All' })}>{<CellRenderer cat={cat} plat="All" getCellValue={getCellValue} colorScale={colorScale} resolveTargetMargin={resolveTargetMargin} metric={metric} mode={mode} />}</td>
                                            {(activePlatform === 'All' ? platforms : platforms.filter(p => p === activePlatform)).map(plat => <td key={plat} className={`p-0 relative cursor-pointer hover:ring-2 hover:ring-theme-20 ${selectedCell?.category === cat.name && selectedCell?.platform === plat ? 'ring-2 ring-theme z-20' : ''}`} onClick={() => cat.platforms[plat] && cat.platforms[plat].revenue > 0 && setSelectedCell({ category: cat.name, platform: plat })}>{<CellRenderer cat={cat} plat={plat} getCellValue={getCellValue} colorScale={colorScale} resolveTargetMargin={resolveTargetMargin} metric={metric} mode={mode} />}</td>)}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    ) : (
                        <div className="flex-1 min-h-0 bg-transparent relative">
                            <div className="w-full h-[620px]"><ResponsiveContainer width="100%" height="100%"><Treemap isAnimationActive={false} data={treemapData} dataKey="size" fill="#8884d8" content={<TreemapContent />}><RechartsTooltip content={<CustomTreemapTooltip />} /></Treemap></ResponsiveContainer></div>
                        </div>
                    )}
                </div>

                {selectedCell && (
                    <div className="w-1/3 bg-custom-glass backdrop-blur-custom rounded-xl border border-custom-glass shadow-lg flex flex-col overflow-hidden sticky top-24 h-fit max-h-[calc(100vh-140px)]">
                        <div className="p-4 border-b border-white/10 bg-white/10 flex justify-between items-center"><div><h4 className="font-bold text-gray-800 text-sm flex items-center gap-2">{selectedCell.category}<ChevronRight className="w-4 h-4 text-gray-400" /><span className="text-theme">{selectedCell.platform}</span></h4></div><button onClick={() => setSelectedCell(null)} className="p-1.5 hover:bg-white/10 rounded-full text-gray-500 transition-colors"><X className="w-4 h-4" /></button></div>
                        {drilldownData && (
                            <div className="flex-1 overflow-y-auto flex flex-col">
                                <div className="p-4 border-b border-white/10">
                                    <h5 className="text-[10px] font-medium text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1"><Target className="w-3 h-3" /> Target Settings</h5>
                                    <div className="space-y-3">
                                        <div><label className="text-[10px] text-gray-500 font-medium block mb-1">Scope</label><select value={policyScope} onChange={(e) => setPolicyScope(e.target.value)} className="w-full border border-white/20 rounded p-1.5 text-xs bg-white/5 text-gray-800"><option value="__MAIN__">All {selectedCell.category}</option>{drilldownData.map(sub => <option key={sub.name} value={sub.name}>{sub.name}</option>)}</select></div>
                                        <div className="grid grid-cols-2 gap-2"><div><label className="text-[10px] text-gray-500 font-medium block mb-1">Min Margin %</label><input type="number" placeholder="-" value={targetMargin} onChange={e => setTargetMargin(e.target.value)} className="w-full border border-white/20 rounded p-1.5 text-xs bg-white/5 text-gray-800" /></div><div><label className="text-[10px] text-gray-500 font-medium block mb-1">Base Price (£)</label><input type="number" placeholder="-" value={baselinePrice} onChange={e => setBaselinePrice(e.target.value)} className="w-full border border-white/20 rounded p-1.5 text-xs bg-white/5 text-gray-800" /></div></div>
                                        <button onClick={handleSavePolicy} className="w-full py-1.5 bg-theme text-white rounded text-xs font-bold hover:bg-theme transition-colors flex items-center justify-center gap-1 shadow-sm"><Save className="w-3 h-3" /> Save Target</button>
                                    </div>
                                </div>
                                <div className="p-2">
                                    <table className="sello-table">
                                        <thead className="sticky top-0">
                                            <tr>
                                                <SortableHeader sortKey="name" label="Subcat" sort={drilldownSort} onChange={setDrilldownSort} />
                                                <SortableHeader sortKey="revenue" label="Rev" sort={drilldownSort} onChange={setDrilldownSort} align="right" />
                                                <SortableHeader sortKey="margin" label="Margin" sort={drilldownSort} onChange={setDrilldownSort} align="right" />
                                                <SortableHeader sortKey="tacos" label="TACoS" sort={drilldownSort} onChange={setDrilldownSort} align="right" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {drilldownData.map(sub => (
                                                <tr key={sub.name} className="">
                                                    <td className="font-medium text-gray-700 truncate max-w-[100px]">{sub.name}</td>
                                                    <td className="r">£{sub.metric.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                                                    <td className={`r font-semibold ${sub.metric.margin < resolveTargetMargin(selectedCell.category, sub.name, selectedCell.platform === 'All' ? undefined : selectedCell.platform)! ? 'text-red-500' : 'text-emerald-600'}`}>{sub.metric.margin.toFixed(1)}%</td>
                                                    <td className="r">{sub.metric.tacos.toFixed(1)}%</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
};
