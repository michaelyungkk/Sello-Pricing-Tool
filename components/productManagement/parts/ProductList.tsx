
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { formatSmartMoney } from '../../../utils/format';
import { createPortal } from 'react-dom';
import { Product, PricingRules, SkuFamily, PriceLog, OptimalPriceResult } from '../../../types';
import { VAT_MULTIPLIER } from '../../../constants';
import { getCanonicalSku } from '../../../services/skuNormalization';
import { TagSearchInput } from '../../common/TagSearchInput';
import { GradeBadge } from '../../common/GradeBadge';
import { Search, Filter, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Download, ImageOff, ArrowRight, ChevronDown, SlidersHorizontal, Star, EyeOff, Eye, X, Layers, Tag, Info, GitMerge, User, Globe, CheckSquare, Square, CornerDownLeft, List, Ship, LineChart, Zap } from 'lucide-react';
import { SortState, sortRows } from '../../../utils/tableSort';
import { SortableHeader } from '../../common/SortableHeader';

interface ProductListProps {
    products: Product[];
    skuFamilies?: SkuFamily[]; // Added
    onEditAliases?: (product: Product) => void;
    onEditTags?: (product: Product) => void;
    onViewShipments?: (sku: string) => void;
    onViewElasticity?: (product: Product, result?: OptimalPriceResult) => void;
    onDeepDive?: (sku: string) => void;
    pricingRules?: PricingRules;
    themeColor: string;
    priceHistoryMap: Map<string, PriceLog[]>;
    optimalPriceResults?: Map<string, OptimalPriceResult>;
}

const RecommendationTooltip = ({ product, rect }: { product: Product, rect: DOMRect }) => {
    // Add Scroll Offset to ensure fixed position works correctly on scrolled pages
    const scrollY = window.scrollY;
    const scrollX = window.scrollX;

    const style: React.CSSProperties = {
        position: 'absolute',
        top: `${rect.top + scrollY}px`,
        left: `${rect.left + rect.width / 2 + scrollX}px`,
        transform: 'translate(-50%, -100%) translateY(-8px)',
        zIndex: 9999,
        pointerEvents: 'none'
    };

    return createPortal(
        <div style={style} className="animate-in fade-in zoom-in duration-200">
            <div className="bg-gray-900 text-white p-3 rounded-lg shadow-xl text-xs max-w-xs z-50 border border-gray-700 backdrop-blur-md bg-opacity-95">
                <div className="font-bold mb-2 border-b border-gray-700 pb-1 flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${product.status === 'Critical' ? 'bg-red-500' :
                        product.status === 'Overstock' ? 'bg-orange-500' :
                            product.status === 'Warning' ? 'bg-amber-500' : 'bg-green-500'
                        }`}></span>
                    Inventory Intelligence
                </div>
                <div className="space-y-1.5">
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                        <span className="text-gray-400">Status:</span>
                        <span className={`font-bold text-right ${product.status === 'Critical' ? 'text-red-400' :
                            product.status === 'Overstock' ? 'text-orange-400' :
                                product.status === 'Warning' ? 'text-amber-400' : 'text-green-400'
                            }`}>{product.status}</span>

                        <span className="text-gray-400">Action:</span>
                        <span className="text-right text-gray-200">{product.recommendation}</span>

                        <span className="text-gray-400">Runway:</span>
                        <span className="text-right text-gray-200">{product.daysRemaining > 730 ? '> 2 Years' : `${(product.daysRemaining / 7).toFixed(1)} Weeks`}</span>

                        <span className="text-gray-400">Lead Time:</span>
                        <span className="text-right text-gray-200">{product.leadTimeDays} Days</span>
                    </div>

                    {product.returnRate !== undefined && product.returnRate > 5 && (
                        <div className="mt-2 pt-2 border-t border-gray-700">
                            <div className="flex justify-between items-center text-red-400">
                                <span className="font-bold flex items-center gap-1"><CornerDownLeft className="w-3 h-3" /> High Returns</span>
                                <span>{product.returnRate.toFixed(1)}%</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
        </div>,
        document.body
    );
};

interface ProductRowProps {
    product: Product;
    themeColor: string;
    onEditAliases?: (p: Product) => void;
    onEditTags?: (p: Product) => void;
    onViewShipments?: (sku: string) => void;
    onViewElasticity?: (p: Product, result?: OptimalPriceResult) => void;
    onDeepDive?: (sku: string) => void;
    hoveredProduct: { id: string; rect: DOMRect } | null;
    handleMouseEnter: (id: string, e: React.MouseEvent) => void;
    handleMouseLeave: () => void;
    priceHistoryMap: Map<string, PriceLog[]>;
    optimalPriceResults?: Map<string, OptimalPriceResult>;
}

const ProductRow = React.memo(({
    product,
    themeColor,
    onEditAliases,
    onEditTags,
    onViewShipments,
    onViewElasticity,
    onDeepDive,
    handleMouseEnter,
    handleMouseLeave,
    priceHistoryMap,
    optimalPriceResults,
}: ProductRowProps) => {

    const { totalAdSpend, acos } = useMemo(() => {
        if (!priceHistoryMap || !priceHistoryMap.get) return { totalAdSpend: 0, acos: null };
        const logs = priceHistoryMap.get(product.sku) || [];
        const adSpend = logs.reduce((sum, l) => sum + (l.adsSpend || 0), 0);
        const revenue = logs.reduce((sum, l) =>
            sum + (l.price * (l.velocity || 0) * VAT_MULTIPLIER), 0);
        const acosVal = revenue > 0 ? (adSpend / revenue) * 100 : null;
        return { totalAdSpend: adSpend, acos: acosVal };
    }, [product.sku, priceHistoryMap]);

    // Apply 20% VAT Uplift for Display using shared constant
    const currentPriceWithVat = (product.currentPrice || 0) * VAT_MULTIPLIER;
    const oldPriceWithVat = product.oldPrice ? product.oldPrice * VAT_MULTIPLIER : null;

    // Optimal Price Logic (Profit)
    const optimalPriceWithVat = product.optimalPrice ? product.optimalPrice * VAT_MULTIPLIER : null;

    // Max Velocity Price Logic (Volume Fallback)
    const volumePriceWithVat = product.maxVelocityPrice ? product.maxVelocityPrice * VAT_MULTIPLIER : null;

    const runwayWeeks = (product.daysRemaining || 0) / 7;
    const runwayBin = {
        label: runwayWeeks > 104 ? '> 2 Years' : `${runwayWeeks.toFixed(1)} Weeks`,
        color: product.status === 'Critical' ? 'badge-red' :
            product.status === 'Overstock' ? 'badge-orange' :
                product.status === 'Warning' ? 'badge-amber' : 'badge-green'
    };

    const isHighReturns = product.returnRate !== undefined && product.returnRate > 5;

    return (
        <tr key={product.id} className="group text-sm border-b border-gray-100/50 last:border-none">
            <td className="px-4 py-4 text-center w-[80px]">
                <div className="grid grid-cols-2 gap-1.5 w-fit mx-auto">
                    {onDeepDive && (
                        <button
                            onClick={() => onDeepDive(product.sku)}
                            className="text-gray-400 hover:text-theme transition-colors p-1.5 rounded hover:bg-theme-10 border border-transparent hover:border-indigo-100"
                            title="Deep Dive SKU Analysis"
                        >
                            <Search className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onViewElasticity && (
                        <button
                            onClick={() => onViewElasticity(product, optimalPriceResults?.get(getCanonicalSku(product.sku)))}
                            className="text-gray-400 hover:text-theme transition-colors p-1.5 rounded hover:bg-theme-10 border border-transparent hover:border-indigo-100"
                            title="View Price Curve"
                        >
                            <LineChart className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onEditTags && (
                        <button
                            onClick={() => onEditTags(product)}
                            className="text-gray-400 hover:text-sky-600 transition-colors p-1.5 rounded hover:bg-sky-50 border border-transparent hover:border-sky-100"
                            title="Edit Seasonal/Event Tags"
                        >
                            <Tag className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onEditAliases && (
                        <button
                            onClick={() => onEditAliases(product)}
                            className="text-gray-400 hover:text-amber-600 transition-colors p-1.5 rounded hover:bg-amber-50 border border-transparent hover:border-amber-100"
                            title="Edit Aliases / SKU Mapping"
                        >
                            <GitMerge className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </td>
            <td className="px-4 py-4">
                <div>
                    <div className="flex items-center">
                        <div className="font-bold text-gray-900 font-mono">{product.sku}</div>
                        <GradeBadge gradeLevel={product.gradeLevel} />
                    </div>
                    <div className="text-gray-900 font-medium text-xs mt-1 truncate max-w-[240px] xl:max-w-[350px]" title={product.name}>{product.name}</div>
                    <div className="flex gap-2 mt-1.5">
                        {product.subcategory && (
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200">{product.subcategory}</span>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-1 mt-1.5">
                        {product.seasonTags?.slice(0, 2).map(tag => (
                            <span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>
                        ))}
                        {(product.seasonTags?.length || 0) > 2 && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{(product.seasonTags?.length || 0) - 2}</span>
                        )}
                        {product.festivalTags?.slice(0, 2).map(tag => (
                            <span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>
                        ))}
                        {(product.festivalTags?.length || 0) > 2 && (
                            <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{(product.festivalTags?.length || 0) - 2}</span>
                        )}
                    </div>
                </div>
            </td>
            <td className="px-4 py-4 text-right">
                {(() => {
                    const result = optimalPriceResults?.get(getCanonicalSku(product.sku));
                    if (!result) {
                        // Fallback to old optimalPrice if no new result yet
                        return optimalPriceWithVat ? (
                            <div className="flex items-center justify-end gap-1 font-bold text-gray-400" title="Legacy optimal reference (recalculate benchmarks to update)">
                                <Star className="w-3 h-3" style={{ fill: 'rgba(156,163,175,0.2)' }} />
                                {formatSmartMoney(optimalPriceWithVat)}
                            </div>
                        ) : (
                            <span className="text-gray-300">-</span>
                        );
                    }
                    const isStale = Date.now() - new Date(result.calculatedAt).getTime() > 30 * 24 * 60 * 60 * 1000;
                    const delta = result.recommendedPrice - result.currentPrice;
                    const confidenceBadge = (() => {
                        if (result.source === 'COHORT' || result.confidence < 0.3)
                            return <span className="px-1 py-0.5 text-[8px] font-bold rounded border border-gray-200 text-gray-400">Bench</span>;
                        if (result.confidence >= 0.9)
                            return <span className="px-1 py-0.5 text-[8px] font-bold rounded bg-emerald-100 text-emerald-700">High</span>;
                        if (result.confidence >= 0.5)
                            return <span className="px-1 py-0.5 text-[8px] font-bold rounded bg-amber-100 text-amber-700">Med</span>;
                        return <span className="px-1 py-0.5 text-[8px] font-bold rounded bg-gray-100 text-gray-500">Low</span>;
                    })();
                    return (
                        <div className="group relative flex flex-col items-end gap-0.5">
                            <div className="flex items-center gap-1">
                                <span className="font-bold text-gray-900" style={{ fontSize: 13 }}>
                                    {formatSmartMoney(result.recommendedPrice)}
                                </span>
                                {isStale && <span title={`Last calculated ${new Date(result.calculatedAt).toLocaleDateString()}`} className="text-gray-400 text-[10px]">🕐</span>}
                            </div>
                            {Math.abs(delta) >= 0.01 && (
                                <span className={`text-[10px] font-bold ${delta > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                    {delta > 0 ? '+' : ''}{formatSmartMoney(delta)}
                                </span>
                            )}
                            {confidenceBadge}
                            {/* Inline reasoning tooltip */}
                            <div className="absolute bottom-full right-0 mb-2 w-72 p-3 bg-gray-900 text-white text-[11px] rounded-xl shadow-2xl opacity-0 group-hover:opacity-100 invisible group-hover:visible transition-all pointer-events-none z-[60]">
                                <p className="leading-relaxed">{result.reasoning.split('. ').slice(0, 2).join('. ')}.</p>
                                <div className="mt-1.5 text-gray-400 text-[10px]">
                                    Last calculated: {new Date(result.calculatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                                </div>
                                <div className="absolute top-full right-4 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                            </div>
                        </div>
                    );
                })()}
            </td>
            <td className="px-4 py-4 text-right">
                <div className="text-gray-400 font-medium">
                    {oldPriceWithVat ? formatSmartMoney(oldPriceWithVat) : '-'}
                </div>
            </td>
            <td className="px-4 py-4 text-right">
                <div className="font-bold text-gray-900">{formatSmartMoney(currentPriceWithVat)}</div>
            </td>
            <td className="px-4 py-4 text-right">
                {product.caPrice ? (
                    <div className="font-bold text-purple-600 font-mono" title="Channel Advisor Reference Price">
                        {formatSmartMoney(product.caPrice)}
                    </div>
                ) : (
                    <span className="text-gray-300">—</span>
                )}
            </td>

            <td className="px-4 py-4 text-right">
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-bold text-gray-900">{product.stockLevel}</span>
                    {product.incomingStock && product.incomingStock > 0 ? (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onViewShipments) onViewShipments(product.sku);
                            }}
                            className="text-[10px] font-semibold text-theme bg-theme-10 px-1.5 py-0.5 rounded border border-indigo-100 flex items-center gap-1 hover:bg-theme-10 hover:border-theme-20 transition-colors cursor-pointer"
                            title="Click to view incoming shipments"
                        >
                            <Ship className="w-3 h-3" />
                            +{product.incomingStock}
                        </button>
                    ) : null}
                </div>
            </td>

            <td
                className="px-4 py-4 text-right cursor-help"
                onMouseEnter={(e) => handleMouseEnter(product.id, e)}
                onMouseLeave={handleMouseLeave}
            >
                <div className="flex flex-col items-end gap-1.5">
                    <span className={`sello-badge ${runwayBin.color}`}>
                        {runwayBin.label}
                    </span>
                    <div className="flex items-center gap-1">
                        {!!product._trendData?.velocityChange && product._trendData.velocityChange < -0.2 && <TrendingDown className="w-3 h-3 text-red-400" />}
                        {!!product._trendData?.velocityChange && product._trendData.velocityChange > 0.2 && <TrendingUp className="w-3 h-3 text-green-400" />}
                        <span className="text-xs font-semibold text-gray-700">
                            {(product.averageDailySales || 0).toFixed(1)} / day
                        </span>
                    </div>
                </div>
            </td>
            <td className="px-4 py-4 text-right">
                {product.returnRate !== undefined ? (
                    <div className={`flex items-center justify-end gap-1 font-medium ${isHighReturns ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                        {isHighReturns && <CornerDownLeft className="w-3 h-3" />}
                        {product.returnRate.toFixed(1)}%
                    </div>
                ) : <span className="text-gray-300">-</span>}
            </td>
            <td className="px-4 py-4 text-right">
                <div className="flex flex-col items-end">
                    <span className="text-orange-600 font-bold">
                        £{(totalAdSpend || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </span>
                    {totalAdSpend > 0 ? (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-bold mt-1 ${acos === null ? 'text-gray-400 italic' :
                            acos < 15 ? 'text-green-600 bg-green-50' :
                                acos <= 30 ? 'text-amber-600 bg-amber-50' : 'text-red-600 bg-red-50'
                            }`}>
                            {acos !== null ? `${acos.toFixed(1)}%` : 'No revenue'}
                        </span>
                    ) : (
                        <span className="text-[10px] text-gray-400 italic">No spend</span>
                    )}
                </div>
            </td>
        </tr>
    );
});
ProductRow.displayName = 'ProductRow';

const FilterDropdown = ({ label, icon: Icon, value, onChange, options, themeColor }: any) => (
    <div
        className="flex items-center border border-gray-300 rounded-lg bg-white overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-opacity-50"
        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
    >
        <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-r border-gray-200 min-w-fit">
            {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
            <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
        </div>
        <div className="relative flex-1 min-w-[120px]">
            <select
                value={value}
                onChange={onChange}
                className="w-full px-3 py-2 bg-transparent text-sm text-gray-900 border-none focus:ring-0 cursor-pointer appearance-none pr-8 truncate"
            >
                <option value="All">All</option>
                {options && options.map((opt: string) => (
                    <option key={opt} value={opt}>{opt}</option>
                ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
    </div>
);

const MultiSelectDropdown = ({ label, icon: Icon, selected, onChange, options, themeColor }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const dropdownRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const currentSelected = selected || [];

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
                && triggerRef.current && !triggerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (option: string) => {
        if (currentSelected.includes(option)) {
            onChange(currentSelected.filter((item: string) => item !== option));
        } else {
            onChange([...currentSelected, option]);
        }
    };

    const displayText = currentSelected.length === 0 ? 'All' : currentSelected.length === 1 ? currentSelected[0] : `${currentSelected.length} Selected`;

    const handleOpen = () => {
        if (!isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
        }
        setIsOpen(!isOpen);
    };

    return (
        <div className="relative">
            <div ref={triggerRef}
                className="flex items-center border border-gray-300 rounded-lg bg-white overflow-hidden cursor-pointer"
                onClick={handleOpen}
                style={{ borderColor: isOpen ? themeColor : '#d1d5db' }}
            >
                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-r border-gray-200 min-w-fit">
                    {Icon && <Icon className="w-3.5 h-3.5 text-gray-400" />}
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
                </div>
                <div className="flex-1 min-w-[120px] px-3 py-2 flex items-center justify-between">
                    <span className="text-sm text-gray-900 truncate max-w-[140px]">{displayText}</span>
                    <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
                </div>
            </div>

            {isOpen && createPortal(
                <div ref={dropdownRef} style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, zIndex: 9999 }}
                    className="w-64 bg-white border border-gray-200 rounded-lg shadow-xl overflow-hidden">
                    <div className="p-2 border-b border-gray-100 flex justify-between">
                        <button
                            className="text-[10px] text-gray-500 hover:text-gray-800"
                            onClick={() => onChange(options)}
                        >Select All</button>
                        <button
                            className="text-[10px] text-gray-500 hover:text-gray-800"
                            onClick={() => onChange([])}
                        >Clear</button>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1">
                        {options && options.map((opt: string) => {
                            const isSelected = currentSelected.includes(opt);
                            return (
                                <div
                                    key={opt}
                                    className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer rounded-md"
                                    onClick={() => toggleOption(opt)}
                                >
                                    {isSelected ? (
                                        <CheckSquare className="w-4 h-4 text-theme flex-shrink-0" style={{ color: themeColor }} />
                                    ) : (
                                        <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                    )}
                                    <span className={`text-sm ${isSelected ? 'font-medium text-gray-900' : 'text-gray-600'}`}>{opt}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>,
                document.body
            )}
        </div>
    );
};

const FamilyGridView = ({
    products,
    skuFamilies,
    themeColor,
    collapsedFamilies,
    setCollapsedFamilies,
    onEditAliases,
    onEditTags,
    onViewShipments,
    onViewElasticity,
    onDeepDive,
    hoveredProduct,
    handleMouseEnter,
    handleMouseLeave,
    priceHistoryMap,
    optimalPriceResults,
}: any) => {
    const familiesWithProducts = useMemo(() => {
        const familyMap = new Map<string, { family: SkuFamily, items: Product[] }>();
        const ungrouped: Product[] = [];

        if (!skuFamilies) return { families: [], ungrouped: products || [] };

        const skuToFamily = new Map<string, SkuFamily>();
        skuFamilies.forEach((f: SkuFamily) => {
            if (!f || !f.memberSkus) return;
            f.memberSkus.forEach((sku: string) => {
                skuToFamily.set(sku, f);
            });
        });

        (products || []).forEach((p: Product) => {
            if (!p) return;
            const family = skuToFamily.get(p.sku);
            if (family) {
                if (!familyMap.has(family.id)) {
                    familyMap.set(family.id, { family, items: [] });
                }
                familyMap.get(family.id)!.items.push(p);
            } else {
                ungrouped.push(p);
            }
        });

        return {
            families: Array.from(familyMap.values()),
            ungrouped
        };
    }, [products, skuFamilies]);

    const toggleFamily = (id: string) => {
        const next = new Set(collapsedFamilies);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setCollapsedFamilies(next);
    };

    return (
        <tbody>
            {familiesWithProducts.families.map(({ family, items }) => {
                const totalStock = items.reduce((sum, p) => sum + (p.stockLevel || 0), 0);
                const avgVelocity = items.reduce((sum, p) => sum + (p.averageDailySales || 0), 0) / (items.length || 1);
                const lastUpdates = items.map(p => p.lastUpdated).filter(Boolean).map(d => new Date(d!).getTime());
                let updateRange = '-';
                if (lastUpdates.length > 0) {
                    const minUpdate = new Date(Math.min(...lastUpdates)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                    const maxUpdate = new Date(Math.max(...lastUpdates)).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
                    updateRange = minUpdate === maxUpdate ? maxUpdate : `${minUpdate} - ${maxUpdate}`;
                }
                const isCollapsed = collapsedFamilies.has(family.id);

                return (
                    <React.Fragment key={family.id}>
                        <tr className="bg-gray-50/80 border-y border-gray-200/50 cursor-pointer group"
                            onClick={() => toggleFamily(family.id)}
                        >
                            <td className="px-4 py-4" colSpan={2}>
                                <div className="flex items-center gap-3">
                                    <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${isCollapsed ? '-rotate-90' : ''}`} />
                                    <div className="flex items-center gap-2">
                                        <Layers className="w-4 h-4 text-theme" />
                                        <span className="font-bold text-gray-900">{family.name}</span>
                                        <span className="text-xs bg-theme-10 text-theme px-2 py-0.5 rounded-full border border-theme-20">{items.length} SKUs</span>
                                    </div>
                                </div>
                            </td>
                            <td colSpan={3} className="px-4 py-3">
                                <div className="flex items-center gap-6 text-xs font-medium text-gray-500">
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase text-gray-400">Total Stock</span>
                                        <span className="font-bold text-gray-700">{totalStock}</span>
                                    </div>
                                    <div className="flex flex-col">
                                        <span className="text-[10px] uppercase text-gray-400">Avg. Velocity</span>
                                        <span className="font-bold text-gray-700">{avgVelocity.toFixed(1)}/day</span>
                                    </div>
                                </div>
                            </td>
                            <td colSpan={5} className="px-4 py-3 text-right">
                                <div className="flex flex-col items-end pr-4">
                                    <span className="text-[10px] uppercase text-gray-400">Last Synced</span>
                                    <span className="font-bold text-gray-700">{updateRange}</span>
                                </div>
                            </td>
                        </tr>
                        {!isCollapsed && items.map(p => (
                            <ProductRow
                                key={p.id}
                                product={p}
                                themeColor={themeColor}
                                onEditAliases={onEditAliases}
                                onEditTags={onEditTags}
                                onViewShipments={onViewShipments}
                                onViewElasticity={onViewElasticity}
                                onDeepDive={onDeepDive}
                                hoveredProduct={hoveredProduct}
                                handleMouseEnter={handleMouseEnter}
                                handleMouseLeave={handleMouseLeave}
                                priceHistoryMap={priceHistoryMap}
                                optimalPriceResults={optimalPriceResults}
                            />
                        ))}
                    </React.Fragment>
                );
            })}

            {familiesWithProducts.ungrouped.length > 0 && (
                <React.Fragment key="ungrouped">
                    <tr className="bg-gray-50 border-y border-gray-200 cursor-pointer"
                        onClick={() => toggleFamily('ungrouped')}
                    >
                        <td className="px-4 py-3" colSpan={10}>
                            <div className="flex items-center gap-3">
                                <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-200 ${collapsedFamilies.has('ungrouped') ? '-rotate-90' : ''}`} />
                                <span className="font-bold text-gray-600 italic">Ungrouped ({familiesWithProducts.ungrouped.length} SKUs)</span>
                            </div>
                        </td>
                    </tr>
                    {!collapsedFamilies.has('ungrouped') && familiesWithProducts.ungrouped.map((p: Product) => (
                        <ProductRow
                            key={p.id}
                            product={p}
                            themeColor={themeColor}
                            onEditAliases={onEditAliases}
                            onEditTags={onEditTags}
                            onViewShipments={onViewShipments}
                            onViewElasticity={onViewElasticity}
                            onDeepDive={onDeepDive}
                            hoveredProduct={hoveredProduct}
                            handleMouseEnter={handleMouseEnter}
                            handleMouseLeave={handleMouseLeave}
                            priceHistoryMap={priceHistoryMap}
                            optimalPriceResults={optimalPriceResults}
                        />
                    ))}
                </React.Fragment>
            )}
        </tbody>
    );
};

const ProductList: React.FC<ProductListProps> = ({ products = [], skuFamilies = [], onEditAliases, onEditTags, onViewShipments, onViewElasticity, onDeepDive, pricingRules, themeColor, priceHistoryMap, optimalPriceResults }) => {
    const [viewMode, setViewMode] = useState<'LIST' | 'FAMILY'>('LIST');
    const [collapsedFamilies, setCollapsedFamilies] = useState<Set<string>>(new Set(['ungrouped']));
    const [searchQuery, setSearchQuery] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [managerFilter, setManagerFilter] = useState('All');
    const [platformFilters, setPlatformFilters] = useState<string[]>([]);

    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    const [brandFilter, setBrandFilter] = useState('All');
    const [mainCatFilter, setMainCatFilter] = useState('All');
    const [subCatFilter, setSubCatFilter] = useState('All');

    const [showInactive, setShowInactive] = useState(false);
    const [showOOS, setShowOOS] = useState(true);

    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [velocityFilter, setVelocityFilter] = useState<{ min: string, max: string }>({ min: '', max: '' });


    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [hoveredProduct, setHoveredProduct] = useState<{ id: string; rect: DOMRect } | null>(null);

    const [sortConfig, setSortConfig] = useState<SortState<string> | null>({ key: 'status', dir: 'desc' });

    const getEffectiveManager = React.useCallback((platform: string, storedManager: string) => {
        if (pricingRules && pricingRules[platform]?.manager && pricingRules[platform].manager !== 'Unassigned') {
            return pricingRules[platform].manager;
        }
        return storedManager || 'Unassigned';
    }, [pricingRules]);

    const uniqueManagers = useMemo(() => {
        const managerSet = new Set<string>();
        (products || []).forEach(p => (p.channels || []).forEach(c => {
            managerSet.add(getEffectiveManager(c.platform, c.manager));
        }));
        if (pricingRules) {
            Object.values(pricingRules).forEach((r: any) => {
                if (r && r.manager && r.manager !== 'Unassigned') managerSet.add(r.manager);
            });
        }
        return Array.from(managerSet).sort();
    }, [products, pricingRules, getEffectiveManager]);

    const uniquePlatforms = useMemo(() => {
        const platformSet = new Set<string>();
        (products || []).forEach(p => (p.channels || []).forEach(c => platformSet.add(c.platform)));
        if (pricingRules) {
            Object.keys(pricingRules).forEach(k => platformSet.add(k));
        }
        return Array.from(platformSet).sort();
    }, [products, pricingRules]);

    const uniqueBrands = useMemo(() => {
        const brands = new Set((products || []).map(p => p.brand).filter(Boolean) as string[]);
        return Array.from(brands).sort();
    }, [products]);

    const uniqueMainCats = useMemo(() => {
        const cats = new Set((products || []).map(p => p.category).filter(Boolean) as string[]);
        return Array.from(cats).sort();
    }, [products]);

    const uniqueSubCats = useMemo(() => {
        let relevantProducts = products || [];
        if (mainCatFilter !== 'All') {
            relevantProducts = (products || []).filter(p => p.category === mainCatFilter);
        }
        const subs = new Set(relevantProducts.map(p => p.subcategory).filter(Boolean) as string[]);
        return Array.from(subs).sort();
    }, [products, mainCatFilter]);

    const filteredProducts = useMemo(() => {
        const searchQueryLower = (debouncedSearch || '').toLowerCase();
        const filtered = (products || []).filter(p => {
            if (searchTags && searchTags.length > 0) {
                const matchesTag = searchTags.some(tag => {
                    const t = tag.toLowerCase();
                    return (p.sku || '').toLowerCase().includes(t) ||
                        (p.name || '').toLowerCase().includes(t) ||
                        (p.channels || []).some(c => c.skuAlias?.toLowerCase().includes(t));
                });
                if (!matchesTag) return false;
            } else if (searchQueryLower) {
                if (!(p.sku || '').toLowerCase().includes(searchQueryLower) && !(p.name || '').toLowerCase().includes(searchQueryLower)) return false;
            }

            if (!showInactive && (p.stockLevel || 0) <= 0 && (p.averageDailySales || 0) === 0) return false;
            if (!showOOS && (p.stockLevel || 0) <= 0) return false;
            if (brandFilter !== 'All' && p.brand !== brandFilter) return false;
            if (mainCatFilter !== 'All' && p.category !== mainCatFilter) return false;
            if (subCatFilter !== 'All' && p.subcategory !== subCatFilter) return false;
            return true;
        });

        let aggregatedData = filtered.map(p => {
            const currentPlatformFilters = platformFilters || [];
            const isPlatformFiltered = currentPlatformFilters.length > 0;
            const matchingChannels = (p.channels || []).filter(c => {
                const matchPlatform = !isPlatformFiltered || currentPlatformFilters.includes(c.platform);
                const effectiveManager = getEffectiveManager(c.platform, c.manager);
                const matchManager = managerFilter === 'All' || effectiveManager === managerFilter;
                return matchPlatform && matchManager;
            });

            const isFiltering = isPlatformFiltered || managerFilter !== 'All';
            let displayVelocity = p.averageDailySales || 0;
            let displayPrice = p.currentPrice || 0;

            if (isFiltering) {
                const totalFilteredVelocity = matchingChannels.reduce((sum, c) => sum + (c.velocity || 0), 0);
                let weightedPriceSum = 0;
                let weightedDivisor = 0;

                matchingChannels.forEach(c => {
                    const price = c.price || p.currentPrice || 0;
                    weightedPriceSum += (price * (c.velocity || 0));
                    weightedDivisor += (c.velocity || 0);
                });

                if (weightedDivisor > 0) {
                    displayPrice = Number((weightedPriceSum / weightedDivisor).toFixed(2));
                } else if (matchingChannels.length > 0) {
                    const sumPrices = matchingChannels.reduce((sum, c) => sum + (c.price || p.currentPrice || 0), 0);
                    displayPrice = Number((sumPrices / matchingChannels.length).toFixed(2));
                }
                displayVelocity = totalFilteredVelocity;
            }

            const stock = p.stockLevel || 0;
            const leadTime = p.leadTimeDays || 30;
            const displayRunway = stock <= 0 ? 0 : (displayVelocity > 0 ? stock / displayVelocity : 999);

            let displayStatus: 'Critical' | 'Warning' | 'Healthy' | 'Overstock' = 'Healthy';
            let displayRec = 'Maintain';

            if (stock <= 0) {
                displayStatus = 'Critical';
                displayRec = 'Out of Stock';
            } else if (displayRunway < leadTime) {
                displayStatus = 'Critical';
                displayRec = 'Increase Price';
            } else if (displayRunway > leadTime * 4) {
                displayStatus = 'Overstock';
                displayRec = 'Decrease Price';
            } else if (displayRunway < leadTime * 1.5) {
                displayStatus = 'Warning';
                displayRec = 'Maintain';
            }

            const shouldShow = !isFiltering || matchingChannels.length > 0;

            return {
                ...p,
                _isVisible: shouldShow,
                averageDailySales: displayVelocity,
                currentPrice: displayPrice,
                daysRemaining: displayRunway,
                status: displayStatus,
                recommendation: displayRec
            };
        }).filter(p => p._isVisible);

        // Apply Velocity Filter
        const minVel = parseFloat(velocityFilter.min);
        const maxVel = parseFloat(velocityFilter.max);
        if (!isNaN(minVel)) {
            aggregatedData = aggregatedData.filter(p => p.averageDailySales >= minVel);
        }
        if (!isNaN(maxVel)) {
            aggregatedData = aggregatedData.filter(p => p.averageDailySales <= maxVel);
        }

        // Apply Status Filter (Context Aware)
        if (statusFilter !== 'All') {
            aggregatedData = aggregatedData.filter(p => p.status === statusFilter);
        }

        const getValue = (row: any, key: string) => {
            if (key === 'status') {
                const priority = { 'Critical': 4, 'Overstock': 3, 'Warning': 2, 'Healthy': 1 };
                return priority[row.status as keyof typeof priority] || 0;
            }
            return (row as any)[key];
        };

        return sortRows(aggregatedData, sortConfig, getValue);

    }, [products, debouncedSearch, searchTags, statusFilter, managerFilter, platformFilters, brandFilter, mainCatFilter, subCatFilter, sortConfig, showInactive, showOOS, velocityFilter, getEffectiveManager]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, searchTags, statusFilter, managerFilter, platformFilters, brandFilter, mainCatFilter, subCatFilter, showInactive, showOOS, velocityFilter]);

    useEffect(() => {
        setSubCatFilter('All');
    }, [mainCatFilter]);

    const totalPages = Math.ceil((filteredProducts || []).length / itemsPerPage);
    const paginatedProducts = (filteredProducts || []).slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handlePageChange = (newPage: number) => {
        if (newPage >= 1 && newPage <= totalPages) {
            setCurrentPage(newPage);
        }
    };

    const handleMouseEnter = (id: string, event: React.MouseEvent) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setHoveredProduct({ id, rect });
    };

    const handleMouseLeave = () => {
        setHoveredProduct(null);
    };

    const isContextFiltered = (platformFilters && platformFilters.length > 0) || managerFilter !== 'All';

    const handleExport = (platform: string = 'All') => {
        const cleanChar = (val: any) => {
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/[\r\n]+/g, ' ');
            return `"${str.replace(/"/g, '""')}"`;
        };

        const headers = ['SKU', 'Master SKU', 'Name', 'Brand', 'Category', 'Subcategory', 'Optimal Price', 'Current Price', 'Stock', 'Velocity', 'Days Remaining', 'Status', 'Cost', 'Return Rate %'];
        const rows: (string | number)[][] = [];

        (filteredProducts || []).forEach(p => {
            const effectiveOptimal = p.optimalPrice || p.maxVelocityPrice;

            const commonData = [
                cleanChar(p.sku),
                cleanChar(p.name),
                cleanChar(p.brand || ''),
                cleanChar(p.category || ''),
                cleanChar(p.subcategory || ''),
                effectiveOptimal ? effectiveOptimal.toFixed(2) : '',
                (p.currentPrice || 0).toFixed(2),
                p.stockLevel || 0,
                (p.averageDailySales || 0).toFixed(2),
                (p.daysRemaining || 0).toFixed(0),
                cleanChar(p.status),
                p.costPrice ? p.costPrice.toFixed(2) : '0.00',
                (p.returnRate || 0).toFixed(2)
            ];

            if (platform === 'All') {
                rows.push([cleanChar(p.sku), ...commonData]);
            } else {
                const normalize = (s: string) => (s || '').toLowerCase().trim();
                const targetPlatform = normalize(platform);
                let channel = (p.channels || []).find(c => normalize(c.platform) === targetPlatform);
                if (!channel) {
                    channel = (p.channels || []).find(c => normalize(c.platform).includes(targetPlatform) || targetPlatform.includes(normalize(c.platform)));
                }

                if (channel && channel.skuAlias) {
                    const aliases = channel.skuAlias.split(',').map(s => s.trim()).filter(Boolean);
                    if (aliases.length > 0) {
                        aliases.forEach(alias => {
                            rows.push([cleanChar(alias), ...commonData]);
                        });
                    } else {
                        rows.push([cleanChar(p.sku), ...commonData]);
                    }
                } else {
                    rows.push([cleanChar(p.sku), ...commonData]);
                }
            }
        });

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\uFEFF', csvContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        const filename = platform === 'All' ? 'inventory_export_master.csv' : `inventory_export_${platform.toLowerCase().replace(/\s+/g, '_')}.csv`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
            if (document.body.contains(link)) document.body.removeChild(link);
            URL.revokeObjectURL(url);
        }, 60000);
        setIsExportMenuOpen(false);
    };

    const handleExportMissingImages = () => {
        const missing = (filteredProducts || []).filter(p => !p.imageUrl || p.imageUrl.trim() === '');
        if (missing.length === 0) {
            alert('All products have image URLs — nothing to export.');
            return;
        }
        const headers = ['SKU', 'Name', 'Brand', 'Category'];
        const rows = missing.map(p => [
            `"${(p.sku || '').replace(/"/g, '""')}"`,
            `"${(p.name || '').replace(/"/g, '""')}"`,
            `"${(p.brand || '').replace(/"/g, '""')}"`,
            `"${(p.category || '').replace(/"/g, '""')}"`,
        ]);
        const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\uFEFF', csv], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        link.download = 'missing_images.csv';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { if (document.body.contains(link)) document.body.removeChild(link); URL.revokeObjectURL(url); }, 60000);
    };

    const tooltipProduct = hoveredProduct ? (filteredProducts || []).find(p => p.id === hoveredProduct.id) : null;

    return (
        <div className="space-y-4">
            <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex flex-col xl:flex-row items-center justify-between gap-4 relative overflow-hidden backdrop-blur-custom">
                <div className="flex items-center justify-between w-full xl:w-auto gap-6">
                    <div className="flex items-center gap-2">
                        <List className="w-5 h-5 text-gray-400" />
                        <span className="text-sm font-bold text-gray-700 whitespace-nowrap">Master Catalogue</span>
                    </div>

                    {skuFamilies.length > 0 && (
                        <div className="flex bg-gray-100/50 p-1 rounded-lg border border-gray-200">
                            <button
                                onClick={() => setViewMode('LIST')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${viewMode === 'LIST' ? 'bg-white shadow-sm text-theme' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <List className="w-3.5 h-3.5" />
                                List View
                            </button>
                            <button
                                onClick={() => setViewMode('FAMILY')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-2 ${viewMode === 'FAMILY' ? 'bg-white shadow-sm text-theme' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                <Layers className="w-3.5 h-3.5" />
                                Family View
                            </button>
                        </div>
                    )}
                </div>

                <div className="w-full xl:w-auto flex justify-end gap-2 relative">
                    <button
                        onClick={handleExportMissingImages}
                        className="sello-btn"
                        title={`Export SKUs missing image URL`}
                    >
                        <ImageOff className="w-3.5 h-3.5" />
                        Missing Images
                        {(() => {
                            const count = (filteredProducts || []).filter(p => !p.imageUrl || p.imageUrl.trim() === '').length;
                            return count > 0 ? <span className="sello-badge badge-amber text-[10px] ml-1">{count}</span> : null;
                        })()}
                    </button>
                    <button
                        onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                        className="sello-btn"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Export List
                        <ChevronDown className="w-3 h-3 text-gray-400" />
                    </button>

                    {isExportMenuOpen && createPortal(
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setIsExportMenuOpen(false)}>
                            <div
                                className="bg-custom-glass-modal backdrop-blur-custom-modal rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-white/20"
                                onClick={e => e.stopPropagation()}
                            >
                                <div className="p-4 border-b border-gray-100/50 flex justify-between items-center bg-gray-50/50">
                                    <h3 className="font-bold text-gray-900">Export Options</h3>
                                    <button onClick={() => setIsExportMenuOpen(false)} className="p-1 hover:bg-gray-200/50 rounded-full transition-colors">
                                        <X className="w-4 h-4 text-gray-500" />
                                    </button>
                                </div>

                                <div className="p-2">
                                    <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Select Format</div>
                                    <button
                                        onClick={() => handleExport('All')}
                                        className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50/50 flex items-center justify-between group rounded-lg transition-colors"
                                    >
                                        <span className="font-medium">Standard (Master SKUs)</span>
                                        <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600" />
                                    </button>

                                    <div className="my-2 border-t border-gray-100/50"></div>

                                    <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Export for Platform</div>
                                    <div className="max-h-60 overflow-y-auto">
                                        {uniquePlatforms.map(platform => (
                                            <button
                                                key={platform}
                                                onClick={() => handleExport(platform)}
                                                className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50/50 flex items-center justify-between rounded-lg transition-colors"
                                            >
                                                <span>{platform}</span>
                                                <span className="text-[10px] bg-gray-100 text-gray-500 px-2 py-0.5 rounded border border-gray-200">Alias Mode</span>
                                            </button>
                                        ))}
                                        {uniquePlatforms.length === 0 && (
                                            <div className="px-4 py-2 text-xs text-gray-400 italic">No platforms detected</div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        </div>,
                        document.body
                    )}
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl border border-custom-glass shadow-lg flex flex-col backdrop-blur-custom relative z-20">
                <div className="p-4 space-y-4">
                    <div className="flex flex-col lg:flex-row gap-4">
                        <div className="flex-1 min-w-[250px]">
                            <TagSearchInput
                                tags={searchTags}
                                onTagsChange={(tags) => { setSearchTags(tags); setCurrentPage(1); }}
                                onInputChange={(val) => { setSearchQuery(val); setCurrentPage(1); }}
                                placeholder="Search SKUs or Name..."
                                themeColor={themeColor}
                            />
                        </div>

                        <div className="flex flex-wrap gap-3 items-center">
                            <FilterDropdown
                                label="Brand"
                                icon={Tag}
                                value={brandFilter}
                                onChange={(e: any) => { setBrandFilter(e.target.value); setCurrentPage(1); }}
                                options={uniqueBrands}
                                themeColor={themeColor}
                            />
                            <FilterDropdown
                                label="Category"
                                icon={Layers}
                                value={mainCatFilter}
                                onChange={(e: any) => { setMainCatFilter(e.target.value); setCurrentPage(1); }}
                                options={uniqueMainCats}
                                themeColor={themeColor}
                            />
                            <FilterDropdown
                                label="Subcat"
                                icon={GitMerge}
                                value={subCatFilter}
                                onChange={(e: any) => { setSubCatFilter(e.target.value); setCurrentPage(1); }}
                                options={uniqueSubCats}
                                themeColor={themeColor}
                            />
                            <div className="flex items-center border border-gray-300 rounded-lg bg-white overflow-hidden transition-shadow focus-within:ring-2 focus-within:ring-opacity-50" style={{ '--tw-ring-color': themeColor } as React.CSSProperties}>
                                <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border-r border-gray-200 min-w-fit">
                                    <Filter className="w-3.5 h-3.5 text-gray-400" />
                                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Status</span>
                                </div>
                                <div className="relative min-w-[140px]">
                                    <select
                                        value={statusFilter}
                                        onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                                        className="w-full px-3 py-2 bg-transparent text-sm text-gray-900 border-none focus:ring-0 cursor-pointer appearance-none pr-8"
                                    >
                                        <option value="All">All Statuses</option>
                                        <option value="Critical">Critical</option>
                                        <option value="Overstock">Overstock</option>
                                        <option value="Healthy">Healthy</option>
                                        <option value="Warning">Warning</option>
                                    </select>
                                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                                </div>
                            </div>

                            <button
                                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                                className={`px-3 py-1.5 border rounded-lg flex items-center gap-2 text-xs font-bold transition-colors ml-auto lg:ml-0`}
                                style={{
                                    backgroundColor: showAdvancedFilters ? `${themeColor}10` : 'rgba(255,255,255,0.5)',
                                    borderColor: showAdvancedFilters ? themeColor : '#d1d5db',
                                    color: showAdvancedFilters ? themeColor : '#4b5563'
                                }}
                            >
                                <SlidersHorizontal className="w-4 h-4" />
                                <span className="hidden sm:inline">Filters</span>
                            </button>
                        </div>
                    </div>
                </div>

                {showAdvancedFilters && (
                    <div className="px-4 pb-4 border-t border-gray-100/50 bg-gray-50/50 rounded-b-xl animate-in fade-in slide-in-from-top-2 duration-200 backdrop-blur-sm">
                        <div className="flex flex-col lg:flex-row gap-4 pt-4 items-start lg:items-center">
                            <div className="flex flex-wrap gap-3 flex-1">
                                <MultiSelectDropdown
                                    label="Platform"
                                    icon={Globe}
                                    selected={platformFilters}
                                    onChange={(selected: string[]) => { setPlatformFilters(selected); setCurrentPage(1); }}
                                    options={uniquePlatforms}
                                    themeColor={themeColor}
                                />
                                <FilterDropdown
                                    label="Manager"
                                    icon={User}
                                    value={managerFilter}
                                    onChange={(e: any) => { setManagerFilter(e.target.value); setCurrentPage(1); }}
                                    options={uniqueManagers}
                                    themeColor={themeColor}
                                />

                                <div className="flex items-center border border-gray-300 rounded-lg bg-white overflow-hidden h-[38px]">
                                    <div className="px-3 py-2 bg-gray-50 border-r border-gray-200 text-[10px] font-bold text-gray-500 uppercase">Velocity</div>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="Min"
                                        value={velocityFilter.min}
                                        onChange={(e) => setVelocityFilter(prev => ({ ...prev, min: e.target.value }))}
                                        className="w-16 px-2 py-1 text-sm border-none focus:ring-0 text-center"
                                    />
                                    <span className="text-gray-400 px-1">-</span>
                                    <input
                                        type="number"
                                        min="0"
                                        placeholder="Max"
                                        value={velocityFilter.max}
                                        onChange={(e) => setVelocityFilter(prev => ({ ...prev, max: e.target.value }))}
                                        className="w-16 px-2 py-1 text-sm border-none focus:ring-0 text-center"
                                    />
                                </div>
                            </div>

                            <div className="flex flex-wrap gap-3">
                                <button
                                    onClick={() => setShowOOS(!showOOS)}
                                    className={`flex items-center justify-between gap-3 px-3 py-1.5 border rounded-lg text-xs font-bold transition-colors hover:bg-gray-50 ${showOOS ? 'border-theme-20 bg-theme-10 text-theme' : 'border-gray-200 text-gray-600 bg-white'}`}
                                    style={showOOS ? { borderColor: themeColor, backgroundColor: `${themeColor}10`, color: themeColor } : {}}
                                >
                                    <span className="text-[10px] uppercase">Show Out of Stock</span>
                                    {showOOS ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </button>

                                <button
                                    onClick={() => setShowInactive(!showInactive)}
                                    className={`flex items-center justify-between gap-3 px-3 py-1.5 border rounded-lg text-xs font-bold transition-colors hover:bg-gray-50 ${showInactive ? 'border-theme-20 bg-theme-10 text-theme' : 'border-gray-200 text-gray-600 bg-white'}`}
                                    style={showInactive ? { borderColor: themeColor, backgroundColor: `${themeColor}10`, color: themeColor } : {}}
                                >
                                    <span className="text-[10px] uppercase">Show Inactive</span>
                                    {showInactive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {isContextFiltered && (
                <div
                    className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm animate-in fade-in slide-in-from-top-2 backdrop-blur-sm"
                    style={{ backgroundColor: `${themeColor}10`, borderColor: `${themeColor}30`, color: themeColor }}
                >
                    <Info className="w-4 h-4" />
                    <span>
                        Showing data aggregated for
                        {platformFilters && platformFilters.length > 0 && <strong> {platformFilters.length} Platform(s) </strong>}
                        {platformFilters && platformFilters.length > 0 && managerFilter !== 'All' && <span>and</span>}
                        {managerFilter !== 'All' && <strong> {managerFilter} </strong>}
                        only. Prices are recalculated weighted averages for this selection.
                    </span>
                </div>
            )}

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                <div className="overflow-x-auto">
                    <table className="tbl w-full text-left border-separate border-spacing-0">
                        <thead className="sticky top-0">
                            <tr className="bg-gray-50/80 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-semibold backdrop-blur-sm shadow-sm">
                                <th className="px-4 py-3 font-semibold text-center w-[80px] text-xs uppercase text-gray-600 tracking-wider">Actions</th>
                                <SortableHeader label="Product" sortKey="sku" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} className="min-w-[250px]" />
                                <SortableHeader label="Optimal Price" sortKey="optimalPrice" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" className="w-[120px]" />
                                <SortableHeader label="Last Week" sortKey="oldPrice" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" className="w-[110px]" />
                                <SortableHeader label={isContextFiltered ? "Current (Filt.)" : "Current"} sortKey="currentPrice" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" className="w-[110px]" />
                                <SortableHeader label="CA Price" sortKey="caPrice" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" className="w-[100px]" />
                                <SortableHeader label="Inventory" sortKey="stockLevel" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" className="w-[120px]" />
                                <SortableHeader label={isContextFiltered ? "Runway (Filt.)" : "Runway"} sortKey="daysRemaining" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" className="w-[140px]" />
                                <SortableHeader label="Returns" sortKey="returnRate" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" className="w-[100px]" />
                                <th className="px-4 py-3 text-right text-[10px] font-bold text-gray-500 uppercase tracking-wider w-[120px]" title="All-time ad spend and ACOS. ACOS = Ad Spend / Revenue × 100">
                                    Ad Spend / ACOS
                                </th>
                            </tr>
                        </thead>
                        {viewMode === 'LIST' ? (
                            <tbody>
                                {paginatedProducts.map((product) =>
                                    <ProductRow
                                        key={product.id}
                                        product={product}
                                        themeColor={themeColor}
                                        onEditAliases={onEditAliases}
                                        onEditTags={onEditTags}
                                        onViewShipments={onViewShipments}
                                        onViewElasticity={onViewElasticity}
                                        onDeepDive={onDeepDive}
                                        hoveredProduct={hoveredProduct}
                                        handleMouseEnter={handleMouseEnter}
                                        handleMouseLeave={handleMouseLeave}
                                        priceHistoryMap={priceHistoryMap}
                                        optimalPriceResults={optimalPriceResults}
                                    />
                                )}
                                {(!filteredProducts || filteredProducts.length === 0) && (
                                    <tr>
                                        <td colSpan={10} className="p-8 text-center text-gray-500">
                                            <div className="flex flex-col items-center justify-center gap-2">
                                                <p>No products found matching your filters.</p>
                                                {products && products.length > 0 && !showInactive && (
                                                    <button
                                                        onClick={() => setShowInactive(true)}
                                                        className="text-theme text-sm font-medium hover:underline flex items-center gap-1"
                                                    >
                                                        <Eye className="w-4 h-4" />
                                                        Show {products.length - (filteredProducts?.length || 0)} hidden items (Inactive/Ghost)
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        ) : (
                            <FamilyGridView
                                products={filteredProducts}
                                skuFamilies={skuFamilies}
                                themeColor={themeColor}
                                collapsedFamilies={collapsedFamilies}
                                setCollapsedFamilies={setCollapsedFamilies}
                                onEditAliases={onEditAliases}
                                onEditTags={onEditTags}
                                onViewShipments={onViewShipments}
                                onViewElasticity={onViewElasticity}
                                onDeepDive={onDeepDive}
                                hoveredProduct={hoveredProduct}
                                handleMouseEnter={handleMouseEnter}
                                handleMouseLeave={handleMouseLeave}
                                priceHistoryMap={priceHistoryMap}
                                optimalPriceResults={optimalPriceResults}
                            />
                        )}
                    </table>
                </div>

                {filteredProducts && filteredProducts.length > 0 && (
                    <div className="bg-gray-50/50 px-4 py-3 border-t border-gray-200/50 flex items-center justify-between sm:px-6">
                        <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                            <div className="flex items-center gap-4">
                                <p className="text-sm text-gray-700">
                                    Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredProducts.length)}</span> of <span className="font-medium">{filteredProducts.length}</span> results
                                </p>
                                <select
                                    value={itemsPerPage}
                                    onChange={(e) => {
                                        setItemsPerPage(Number(e.target.value));
                                        setCurrentPage(1);
                                    }}
                                    className="text-sm border-gray-300 rounded-md shadow-sm bg-white py-1 pl-2 pr-6 cursor-pointer"
                                >
                                    <option value={10}>10</option>
                                    <option value={25}>25</option>
                                    <option value={50}>50</option>
                                    <option value={100}>100</option>
                                </select>
                            </div>
                            <div>
                                {totalPages > 1 && (
                                    <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px">
                                        <button
                                            onClick={() => handlePageChange(currentPage - 1)}
                                            disabled={currentPage === 1}
                                            className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                        >
                                            <ChevronLeft className="h-5 w-5" />
                                        </button>
                                        <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                            Page {currentPage} of {totalPages}
                                        </span>
                                        <button
                                            onClick={() => handlePageChange(currentPage + 1)}
                                            disabled={currentPage === totalPages}
                                            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-700"
                                        >
                                            <ChevronRight className="h-5 w-5" />
                                        </button>
                                    </nav>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {tooltipProduct && hoveredProduct && (
                <RecommendationTooltip
                    product={tooltipProduct}
                    rect={hoveredProduct.rect}
                />
            )}
        </div>
    );
};

export default ProductList;
