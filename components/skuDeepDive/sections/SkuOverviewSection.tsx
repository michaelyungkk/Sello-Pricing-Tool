
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Package, Activity, Warehouse, Ship, Box, BarChart2, History, FileText, RotateCcw, Tag } from 'lucide-react';
import { Product } from '../../../types';
import { GradeBadge } from '../../common/GradeBadge';
import { formatMoney, formatSmartMoney, formatNumber, formatPct } from '../../../utils/format';
import { createPortal } from 'react-dom';
import { MetricDefinitionTooltip } from '../../common/MetricDefinitionTooltip';
import { getMetricDefinition } from '../../../services/metricDefinitions';

interface SkuOverviewSectionProps {
    product: Product;
    allTimeSales: number;
    allTimeQty: number;
    allTimeMarginStats: any;
    allTimeReturnStats: any;
    thresholds: any;
    hasTransactions: boolean;
    onScrollToSection: (section: 'analysis' | 'pricing' | 'promotion' | 'ledger' | 'refunds') => void;
}

interface CompactMetricTooltipProps {
    title: string;
    lines: Array<{ label: string; value: string }>;
    formula?: string;
}

const CompactMetricTooltip: React.FC<CompactMetricTooltipProps> = ({ title, lines, formula }) => {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const popRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if (buttonRef.current?.contains(target) || popRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onEsc);
        };
    }, [open]);

    const popStyle = useMemo(() => {
        if (!open || !buttonRef.current) return null;
        const rect = buttonRef.current.getBoundingClientRect();
        const width = 280;
        const margin = 8;
        let left = rect.right - width;
        left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
        let top = rect.bottom + 8;
        const estimatedHeight = 170;
        if (top + estimatedHeight > window.innerHeight - margin) {
            top = rect.top - estimatedHeight - 8;
        }
        return { position: 'fixed' as const, top, left, width };
    }, [open]);

    return (
        <span className="inline-flex items-center">
            <button
                ref={buttonRef}
                type="button"
                className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-[10px] font-bold text-gray-600 bg-white hover:bg-gray-50 transition-colors"
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(prev => !prev);
                }}
                aria-label={`Explain ${title}`}
                title={`Explain ${title}`}
            >
                ?
            </button>
            {open && popStyle && createPortal(
                <div
                    ref={popRef}
                    style={popStyle}
                    className="z-[9999] rounded-xl border border-gray-200 bg-white p-3 text-left text-[11px] leading-4 text-gray-700 shadow-xl"
                >
                    <div className="mb-1.5 font-bold text-gray-900">{title}</div>
                    <div className="space-y-1">
                        {lines.map((line) => (
                            <div key={`${line.label}-${line.value}`} className="flex justify-between gap-3">
                                <span className="text-gray-500">{line.label}</span>
                                <span className="font-semibold text-gray-900 text-right">{line.value}</span>
                            </div>
                        ))}
                    </div>
                    {formula && (
                        <div className="mt-2 border-t border-gray-100 pt-2 text-[10px] text-gray-500">
                            {formula}
                        </div>
                    )}
                </div>,
                document.body
            )}
        </span>
    );
};

export const SkuOverviewSection: React.FC<SkuOverviewSectionProps> = ({
    product,
    allTimeSales,
    allTimeQty,
    allTimeMarginStats,
    allTimeReturnStats,
    thresholds,
    hasTransactions,
    onScrollToSection
}) => {
    const latestCogs = Number(product.costPrice ?? product.costDetail?.cogs ?? 0);
    const latestFreight = Number(product.postage ?? product.costDetail?.postage ?? 0);
    const marginDef = getMetricDefinition('lifetimeNetMargin');
    const returnQtyDef = getMetricDefinition('returnQtyRate');
    const returnAmtDef = getMetricDefinition('returnAmountRate');

    return (
        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-visible backdrop-blur-custom p-6">
            <div className="flex justify-between items-center mb-6 border-b border-gray-100 pb-4">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-theme/10 text-theme rounded-lg">
                        <Package className="w-5 h-5" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">SKU Overview</h3>
                </div>

                {hasTransactions && (
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-medium text-gray-400 uppercase mr-1 hidden sm:block select-none">Quick Access:</span>
                        <button onClick={() => onScrollToSection('analysis')} className="px-3 py-1.5 bg-custom-glass border border-custom-glass rounded-lg text-xs font-medium text-gray-600 hover:border-theme-20 hover:text-theme hover:shadow-sm transition-all flex items-center gap-1.5 backdrop-blur-custom">
                            <BarChart2 className="w-3.5 h-3.5" /> Distribution
                        </button>
                        <button onClick={() => onScrollToSection('pricing')} className="px-3 py-1.5 bg-custom-glass border border-custom-glass rounded-lg text-xs font-medium text-gray-600 hover:border-theme-20 hover:text-theme hover:shadow-sm transition-all flex items-center gap-1.5 backdrop-blur-custom">
                            <History className="w-3.5 h-3.5" /> Pricing
                        </button>
                        <button onClick={() => onScrollToSection('promotion')} className="px-3 py-1.5 bg-custom-glass border border-custom-glass rounded-lg text-xs font-medium text-gray-600 hover:border-theme-20 hover:text-theme hover:shadow-sm transition-all flex items-center gap-1.5 backdrop-blur-custom">
                            <Tag className="w-3.5 h-3.5" /> Promotion
                        </button>
                        <button onClick={() => onScrollToSection('ledger')} className="px-3 py-1.5 bg-custom-glass border border-custom-glass rounded-lg text-xs font-medium text-gray-600 hover:border-theme-20 hover:text-theme hover:shadow-sm transition-all flex items-center gap-1.5 backdrop-blur-custom">
                            <FileText className="w-3.5 h-3.5" /> Ledger
                        </button>
                        <button onClick={() => onScrollToSection('refunds')} className="px-3 py-1.5 bg-custom-glass border border-custom-glass rounded-lg text-xs font-medium text-gray-600 hover:border-theme-20 hover:text-theme hover:shadow-sm transition-all flex items-center gap-1.5 backdrop-blur-custom">
                            <RotateCcw className="w-3.5 h-3.5" /> Refunds
                        </button>
                    </div>
                )}
            </div>

            <div className="flex flex-col xl:flex-row gap-8">
                <div className="flex-1 min-0 flex gap-6">
                    {product.imageUrl && (
                        <div className="w-[120px] h-[120px] flex-shrink-0 rounded-xl overflow-hidden bg-white/60 shadow-sm">
                            <img src={product.imageUrl} alt={product.name} className="w-full h-full object-contain" />
                        </div>
                    )}
                    <div className="flex-1 min-0">
                        <div className="mb-2 flex items-center">
                            <span className="font-mono text-sm font-bold text-theme bg-theme/10 px-2 py-1 rounded border border-indigo-100 inline-block">
                                {product.sku}
                            </span>
                            <GradeBadge gradeLevel={product.gradeLevel} />
                        </div>
                        
                        <h1 className="text-3xl font-bold text-gray-900 leading-tight mb-4 break-words">
                            {product.name}
                        </h1>

                        <div className="flex flex-wrap items-center gap-3">
                            <div className="flex items-center gap-2 text-xs text-gray-500 bg-white/10 px-2 py-1 rounded border border-custom-glass">
                                <Activity className="w-3.5 h-3.5" />
                                <span>{product.category || 'Uncategorized'}</span>
                            </div>
                            {product.subcategory && (
                                <div className="flex items-center gap-2 text-xs text-gray-500 bg-white/10 px-2 py-1 rounded border border-custom-glass">
                                    <Activity className="w-3.5 h-3.5" />
                                    <span>{product.subcategory}</span>
                                </div>
                            )}
                            {product.seasonTags?.slice(0, 2).map(tag => (
                                <span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>
                            ))}
                            {(product.seasonTags?.length || 0) > 2 && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{ (product.seasonTags?.length || 0) - 2 }</span>
                            )}
                            {product.festivalTags?.slice(0, 2).map(tag => (
                                <span key={tag} className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">{tag}</span>
                            ))}
                            {(product.festivalTags?.length || 0) > 2 && (
                                <span className="text-[10px] bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full border border-slate-200">+{ (product.festivalTags?.length || 0) - 2 }</span>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex-shrink-0 w-full xl:w-[700px]">
                    <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
                        
                        <div className="p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom space-y-1">
                            <span className="text-[10px] font-medium text-gray-500 uppercase flex items-center gap-1">
                                <Activity className="w-3 h-3"/> Velocity
                            </span>
                            <div className="text-xl font-bold text-gray-800">
                                {formatNumber(product.averageDailySales, 1)} <span className="text-xs font-normal text-gray-400">/day</span>
                            </div>
                        </div>

                        <div className="p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom space-y-1">
                            <span className="text-[10px] font-medium text-gray-500 uppercase flex items-center gap-1">
                                <Warehouse className="w-3 h-3"/> On Hand
                            </span>
                            <div className="text-xl font-bold text-gray-800">
                                {formatNumber(product.stockLevel)} <span className="text-xs font-normal text-gray-400">units</span>
                            </div>
                        </div>

                        <div className="p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom space-y-1">
                            <span className="text-[10px] font-medium text-gray-500 uppercase flex items-center gap-1">
                                <Ship className="w-3 h-3"/> Inbound
                                {product.shipments && product.shipments.length > 0 && (
                                    <CompactMetricTooltip
                                        title="Active Shipments"
                                        lines={product.shipments.map((shipment: any) => ({
                                            label: shipment.containerId || 'Container',
                                            value: shipment.eta || 'TBA'
                                        }))}
                                    />
                                )}
                            </span>
                            <div className="text-xl font-bold text-gray-800">
                                {formatNumber(product.incomingStock)} <span className="text-xs font-normal text-gray-400">units</span>
                            </div>
                        </div>

                        <div className="p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom space-y-1">
                            <span className="text-[10px] font-medium text-gray-500 uppercase flex items-center gap-1">
                                <Box className="w-3 h-3"/> Lifetime Qty
                            </span>
                            <div className="text-xl font-bold text-gray-800">
                                {formatNumber(allTimeQty)}
                            </div>
                        </div>

                        {/* Row 2 - Summary Statistics */}
                        <div className="p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom">
                            <span className="text-[10px] font-medium text-gray-500 uppercase block mb-1">CA Reference Price</span>
                            <div className="text-lg font-bold text-purple-600 font-mono">
                                {formatSmartMoney(product.caPrice)}
                            </div>
                        </div>

                        <div className="p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom">
                            <span className="text-[10px] font-medium text-gray-500 uppercase block mb-1">All-Time Sales</span>
                            <div className="text-lg font-bold text-gray-800">
                                {formatSmartMoney(allTimeSales)}
                            </div>
                        </div>

                        <div className="p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom">
                            <span className="text-[10px] font-medium text-gray-500 uppercase block mb-1">COGS</span>
                            <div className="text-lg font-bold text-gray-800 font-mono">
                                {formatSmartMoney(latestCogs)}
                            </div>
                        </div>

                        <div className="p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom">
                            <span className="text-[10px] font-medium text-gray-500 uppercase block mb-1">Freight</span>
                            <div className="text-lg font-bold text-gray-800 font-mono">
                                {formatSmartMoney(latestFreight)}
                            </div>
                        </div>

                        <div className="p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom">
                            <span className="text-[10px] font-medium text-gray-500 uppercase mb-1 inline-flex items-center gap-1">Lifetime Net Margin
                                <MetricDefinitionTooltip title={marginDef.title} formula={marginDef.formula} source={marginDef.source} windowLabel={marginDef.windowLabel} />
                            </span>
                            <div className={`text-lg font-bold ${allTimeMarginStats.pct >= 15 ? 'text-emerald-600' : allTimeMarginStats.pct > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                {formatPct(allTimeMarginStats.pct, 1)}
                            </div>
                        </div>

                        {/* Return & Refund Stats - Stacked for column economy */}
                        <div className="p-3 bg-custom-glass rounded-xl border border-custom-glass backdrop-blur-custom flex flex-col justify-between">
                            <div className="flex flex-col gap-1">
                                <div className="flex justify-between items-center">
                                    <span className="text-[9px] text-gray-500 font-medium inline-flex items-center gap-1">Return QTY %
                                        <MetricDefinitionTooltip title={returnQtyDef.title} formula={returnQtyDef.formula} source={returnQtyDef.source} windowLabel={returnQtyDef.windowLabel} />
                                    </span>
                                    <span className={`text-sm font-bold ${allTimeReturnStats.returnRate > thresholds.returnRatePct ? 'text-red-500' : 'text-gray-700'}`}>
                                        {formatPct(allTimeReturnStats.returnRate)}
                                    </span>
                                </div>
                                <div className="flex justify-between items-center border-t border-gray-100 pt-1">
                                    <span className="text-[9px] text-gray-500 font-medium inline-flex items-center gap-1">Return AMT %
                                        <MetricDefinitionTooltip title={returnAmtDef.title} formula={returnAmtDef.formula} source={returnAmtDef.source} windowLabel={returnAmtDef.windowLabel} />
                                    </span>
                                    <span className="text-sm font-bold text-gray-700">
                                        {formatPct(allTimeReturnStats.refundRate)}
                                    </span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    );
};
