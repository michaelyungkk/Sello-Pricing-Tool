
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, PricingRules, PriceLog, RefundLog } from '../../../types';
import { FilterBar } from '../../common/FilterBar';
import { Columns, ChevronDown, CheckSquare, Square, Download, GripVertical, Settings2, ArrowUp, ArrowDown, Plus, Trash2, ListFilter, Trophy } from 'lucide-react';
import { asDateKey, isDateKeyBetween } from '../../../services/dateUtils';
import { calcRevenue, calcProfit, calcUnits } from '../../../services/metrics';
import { formatPct, formatNumber, formatMoney } from '../../../utils/format';
import { VAT_MULTIPLIER } from '../../../constants';
import { GradeBadge } from '../../GradeBadge';
import AuditPanel from '../../AuditPanel';
import { hexToRgb } from '../../../utils/color';
import * as XLSX from 'xlsx';

interface PlatformComparisonTabProps {
    products: Product[];
    priceHistoryMap: Map<string, PriceLog[]>;
    pricingRules: PricingRules;
    dateWindow: { startKey: string; endKey: string };
    themeColor: string;
    deductRefunds: boolean;
    refundHistory: RefundLog[];
}

interface SortRule {
    key: string;
    dir: 'asc' | 'desc';
}

const MultiSelectDropdown = ({ label, options, selected, onChange, icon: Icon = Columns }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleOption = (option: string) => {
        if (selected.includes(option)) {
            onChange(selected.filter((item: string) => item !== option));
        } else {
            onChange([...selected, option]);
        }
    };

    // Special rendering for column metric keys to show nice labels
    const getLabel = (opt: string) => {
        const map: Record<string, string> = {
            qty: 'Quantity',
            share: 'Share %',
            pm: 'PM %',
            avgPrice: 'Avg Price',
            revenue: 'Revenue',
            profit: 'Net Profit'
        };
        return map[opt] || opt;
    };

    const displayText = label === 'Columns'
        ? `${selected.length} Columns`
        : (selected.length === options.length ? 'All Platforms' : `${selected.length} Platforms`);

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-indigo-300 transition-colors shadow-sm min-w-[160px]"
            >
                <div className="flex items-center gap-2 truncate">
                    <Icon className="w-4 h-4 text-gray-400" />
                    <span className="truncate">{displayText}</span>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in duration-100">
                    <div className="p-2 border-b border-gray-100 flex justify-between bg-gray-50">
                        <button className="text-xs font-bold text-indigo-600 hover:text-indigo-800 px-2 py-1" onClick={() => onChange(options)}>Select All</button>
                        <button className="text-xs font-bold text-gray-500 hover:text-gray-700 px-2 py-1" onClick={() => onChange([])}>Clear</button>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-1">
                        {options.map((opt: string) => {
                            const isSelected = selected.includes(opt);
                            return (
                                <div key={opt} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer rounded-lg transition-colors" onClick={() => toggleOption(opt)}>
                                    {isSelected ? <CheckSquare className="w-4 h-4 text-indigo-600" /> : <Square className="w-4 h-4 text-gray-300" />}
                                    <span className={`text-xs ${isSelected ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{getLabel(opt)}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};

const SortConfigDropdown = ({ sortRules, setSortRules, availableColumns, platforms }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [addKey, setAddKey] = useState('');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const removeRule = (idx: number) => {
        setSortRules(sortRules.filter((_: any, i: number) => i !== idx));
    };

    const toggleDir = (idx: number) => {
        const newRules = [...sortRules];
        newRules[idx].dir = newRules[idx].dir === 'asc' ? 'desc' : 'asc';
        setSortRules(newRules);
    };

    const handleAdd = () => {
        if (!addKey) return;
        setSortRules([...sortRules, { key: addKey, dir: 'desc' }]);
        setAddKey('');
    };

    // Flatten available columns for the add dropdown
    const allOptions = [
        { label: 'Total QTY', value: 'totalQty' },
        { label: 'SKU', value: 'sku' },
        ...platforms.flatMap((p: string) => availableColumns.map((c: string) => ({
            label: `${p} ${c.toUpperCase()}`,
            value: `${p}_${c}`
        })))
    ];

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center justify-between gap-2 px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-700 hover:border-indigo-300 transition-colors shadow-sm min-w-[160px]"
            >
                <div className="flex items-center gap-2 truncate">
                    <ListFilter className="w-4 h-4 text-gray-400" />
                    <span className="truncate">Sort Priority</span>
                </div>
                <ChevronDown className="w-4 h-4 text-gray-400" />
            </button>

            {isOpen && (
                <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in duration-100 p-3">
                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-2">Active Sort Hierarchy</h4>
                    <div className="space-y-2 mb-3">
                        {sortRules.map((rule: SortRule, i: number) => (
                            <div key={i} className="flex items-center gap-2 bg-gray-50 p-2 rounded-lg border border-gray-100">
                                <span className="text-xs font-bold text-gray-400 w-4">{i + 1}.</span>
                                <span className="text-xs font-medium text-gray-800 flex-1 truncate" title={rule.key}>
                                    {rule.key.replace(/_/g, ' ')}
                                </span>
                                <button onClick={() => toggleDir(i)} className="p-1 hover:bg-gray-200 rounded text-gray-500">
                                    {rule.dir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />}
                                </button>
                                <button onClick={() => removeRule(i)} className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded">
                                    <Trash2 className="w-3.5 h-3.5" />
                                </button>
                            </div>
                        ))}
                        {sortRules.length === 0 && <div className="text-xs text-gray-400 italic text-center py-2">No sort rules active</div>}
                    </div>

                    <div className="flex gap-2 border-t border-gray-100 pt-3">
                        <select
                            value={addKey}
                            onChange={(e) => setAddKey(e.target.value)}
                            className="flex-1 text-xs border border-gray-300 rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">Add Criteria...</option>
                            {allOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                        </select>
                        <button
                            onClick={handleAdd}
                            disabled={!addKey}
                            className="p-1.5 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                        >
                            <Plus className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export const PlatformComparisonTab: React.FC<PlatformComparisonTabProps> = ({
    products,
    themeColor,
    deductRefunds,
    refundHistory,
    pricingRules,
    priceHistoryMap,
    dateWindow
}) => {
    const [isAuditVisible, setIsAuditVisible] = useState(false);
    const [searchTags] = useState<string[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);

    // Updated Sort State to support hierarchy
    const [sortRules, setSortRules] = useState<SortRule[]>([{ key: 'totalQty', dir: 'desc' }]);

    const [draggedPlatform, setDraggedPlatform] = useState<string | null>(null);
    const [visibleColumns, setVisibleColumns] = useState<string[]>(['qty', 'share', 'pm']);
    const availableColumns = ['qty', 'share', 'pm', 'avgPrice', 'revenue', 'profit'];

    // Hover State
    const [hoveredRow, setHoveredRow] = useState<any | null>(null);
    const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });

    const platformOptions = useMemo(() => Object.keys(pricingRules).sort(), [pricingRules]);

    useEffect(() => {
        if (selectedPlatforms.length === 0 && platformOptions.length > 0) {
            setSelectedPlatforms(platformOptions);
        }
    }, [platformOptions, selectedPlatforms.length]);

    const { processedData } = useMemo(() => {
        const { startKey, endKey } = dateWindow;

        // 1. Pre-process Refunds for lookup (Ex-VAT)
        const refundLookup = new Map<string, Map<string, number>>(); // SKU -> Platform -> TotalRefundAmount(ExVAT)
        if (deductRefunds) {
            refundHistory.forEach(r => {
                const dKey = asDateKey(r.date);
                if (dKey && isDateKeyBetween(dKey, startKey, endKey)) {
                    if (!refundLookup.has(r.sku)) refundLookup.set(r.sku, new Map());
                    const platMap = refundLookup.get(r.sku)!;
                    const pKey = r.platform || 'Unknown';
                    const val = (Number(r.amount) || 0) + (Number(r.freightAmount) || 0); // Ex-VAT
                    platMap.set(pKey, (platMap.get(pKey) || 0) + val);
                }
            });
        }

        const rows: any[] = [];

        products.forEach(product => {
            const matchesTerm = (term: string) => {
                const t = term.toLowerCase();
                return product.sku.toLowerCase().includes(t) ||
                    product.name.toLowerCase().includes(t) ||
                    product.channels.some(c => c.skuAlias?.toLowerCase().includes(t));
            };

            if (searchTags.length > 0) {
                if (!searchTags.some(tag => matchesTerm(tag))) return;
                if (searchQuery.trim().length > 0 && !matchesTerm(searchQuery)) return;
            } else if (searchQuery.trim().length > 0) {
                if (!matchesTerm(searchQuery)) return;
            }

            const skuLogs = priceHistoryMap.get(product.sku) || [];

            const platformStats: Record<string, { qty: number, revenue: number, profit: number }> = {};
            let productTotalQty = 0;

            selectedPlatforms.forEach(p => {
                platformStats[p] = { qty: 0, revenue: 0, profit: 0 };
            });

            skuLogs.forEach(log => {
                const pKey = log.platform || 'Unknown';
                if (!selectedPlatforms.includes(pKey)) return;

                const dKey = asDateKey(log.date);
                if (dKey && isDateKeyBetween(dKey, (dateWindow as any).startKey, (dateWindow as any).endKey)) {
                    const stats = platformStats[pKey];
                    stats.qty += calcUnits(log);
                    stats.revenue += calcRevenue(log);
                    stats.profit += calcProfit(log);
                    productTotalQty += calcUnits(log);
                }
            });


            // Deduct Refunds from Profit (Cost of Refund)
            if (deductRefunds && refundLookup.has(product.sku)) {
                const platMap = refundLookup.get(product.sku)!;
                selectedPlatforms.forEach(p => {
                    if (platMap.has(p)) {
                        const refundVal = platMap.get(p)!;
                        platformStats[p].profit -= refundVal;
                    }
                });
            }

            let productTotalRevenue = 0;
            let productTotalProfit = 0;
            selectedPlatforms.forEach(p => {
                const stats = platformStats[p];
                productTotalRevenue += (stats.revenue * VAT_MULTIPLIER);
                productTotalProfit += (stats.profit * VAT_MULTIPLIER);
            });

            if (productTotalQty === 0 && searchQuery === '' && searchTags.length === 0) return;

            const row: any = {
                id: product.id,
                sku: product.sku,
                name: product.name,
                gradeLevel: product.gradeLevel,
                totalQty: productTotalQty,
                totalRevenue: productTotalRevenue,
                totalProfit: productTotalProfit
            };

            selectedPlatforms.forEach(p => {
                const stats = platformStats[p];
                const revenueInc = stats.revenue * VAT_MULTIPLIER;
                const profitInc = stats.profit * VAT_MULTIPLIER;

                const share = productTotalQty > 0 ? (stats.qty / productTotalQty) * 100 : 0;
                const margin = revenueInc > 0 ? (profitInc / revenueInc) * 100 : 0;
                const avgPrice = stats.qty > 0 ? revenueInc / stats.qty : 0;

                row[`${p}_qty`] = stats.qty;
                row[`${p}_share`] = share;
                row[`${p}_pm`] = margin;
                row[`${p}_avgPrice`] = avgPrice;
                row[`${p}_revenue`] = revenueInc;
                row[`${p}_profit`] = profitInc;
            });

            rows.push(row);
        });

        // Multi-level sorting logic
        const sorted = rows.sort((a, b) => {
            for (const rule of sortRules) {
                const valA = a[rule.key];
                const valB = b[rule.key];

                // Handle non-existent keys safely
                if (valA === undefined && valB === undefined) continue;
                if (valA === undefined) return 1;
                if (valB === undefined) return -1;

                if (valA < valB) return rule.dir === 'asc' ? -1 : 1;
                if (valA > valB) return rule.dir === 'asc' ? 1 : -1;
            }
            return 0;
        });

        return { processedData: sorted };
    }, [products, priceHistoryMap, dateWindow, selectedPlatforms, searchTags, searchQuery, deductRefunds, sortRules, refundHistory]);

    const handleExport = () => {
        const headers = ['SKU', 'Name', 'Total Qty'];
        selectedPlatforms.forEach(p => {
            if (visibleColumns.includes('qty')) headers.push(`${p} QTY`);
            if (visibleColumns.includes('share')) headers.push(`${p} Share %`);
            if (visibleColumns.includes('pm')) headers.push(`${p} PM %`);
            if (visibleColumns.includes('avgPrice')) headers.push(`${p} Avg Price`);
            if (visibleColumns.includes('revenue')) headers.push(`${p} Revenue`);
            if (visibleColumns.includes('profit')) headers.push(`${p} Profit`);
        });

        const csvData = processedData.map(row => {
            const r = [row.sku, row.name, row.totalQty];
            selectedPlatforms.forEach(p => {
                if (visibleColumns.includes('qty')) r.push(row[`${p}_qty`]);
                if (visibleColumns.includes('share')) r.push(row[`${p}_share`].toFixed(1) + '%');
                if (visibleColumns.includes('pm')) r.push(row[`${p}_pm`].toFixed(1) + '%');
                if (visibleColumns.includes('avgPrice')) r.push(row[`${p}_avgPrice`].toFixed(2));
                if (visibleColumns.includes('revenue')) r.push(row[`${p}_revenue`].toFixed(2));
                if (visibleColumns.includes('profit')) r.push(row[`${p}_profit`].toFixed(2));
            });
            return r;
        });

        const ws = XLSX.utils.aoa_to_sheet([headers, ...csvData]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "PlatformComparison");
        XLSX.writeFile(wb, `platform_comparison_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // Header Sort Helper: Shift+Click appends, Click replaces
    const handleSort = (key: string, e?: React.MouseEvent) => {
        setSortRules(prev => {
            const existingIdx = prev.findIndex(r => r.key === key);

            // If Shift key is held, we are modifying the hierarchy
            if (e && e.shiftKey) {
                if (existingIdx >= 0) {
                    // Toggle direction
                    const newRules = [...prev];
                    newRules[existingIdx].dir = newRules[existingIdx].dir === 'asc' ? 'desc' : 'asc';
                    return newRules;
                } else {
                    // Append new rule
                    return [...prev, { key, dir: 'desc' }];
                }
            }

            // Single click: Clear others and sort by this
            if (prev.length === 1 && prev[0].key === key) {
                return [{ key, dir: prev[0].dir === 'asc' ? 'desc' : 'asc' }];
            }
            return [{ key, dir: 'desc' }];
        });
    };

    const handleDragStart = (e: React.DragEvent, platform: string) => {
        setDraggedPlatform(platform);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent, platform: string) => {
        e.preventDefault();
        if (draggedPlatform === platform) return;
        e.dataTransfer.dropEffect = "move";
    };

    const handleDrop = (e: React.DragEvent, targetPlatform: string) => {
        e.preventDefault();
        if (!draggedPlatform || draggedPlatform === targetPlatform) return;
        const currentIndex = selectedPlatforms.indexOf(draggedPlatform);
        const targetIndex = selectedPlatforms.indexOf(targetPlatform);
        if (currentIndex !== -1 && targetIndex !== -1) {
            const newOrder = [...selectedPlatforms];
            const [removed] = newOrder.splice(currentIndex, 1);
            newOrder.splice(targetIndex, 0, removed);
            setSelectedPlatforms(newOrder);
        }
        setDraggedPlatform(null);
    };

    const getWinnerInfo = React.useCallback((row: any) => {
        if (!row || sortRules.length === 0) return null;

        // Infer metric from primary sort key
        const primaryKey = sortRules[0].key;
        let metric = 'qty'; // Default

        if (primaryKey.includes('_revenue')) metric = 'revenue';
        else if (primaryKey.includes('_profit')) metric = 'profit';
        else if (primaryKey.includes('_pm')) metric = 'pm';
        else if (primaryKey.includes('_share')) metric = 'share';
        else if (primaryKey === 'totalQty') metric = 'qty'; // Default winner is Volume for Total Sort
        else if (primaryKey.includes('_avgPrice')) metric = 'avgPrice';

        let maxVal = -Infinity;
        let winner = null;

        selectedPlatforms.forEach(p => {
            const val = row[`${p}_${metric}`];
            if (val !== undefined && val > maxVal && val > 0) { // Only consider positive active platforms
                maxVal = val;
                winner = p;
            }
        });

        if (!winner) return null;

        let displayVal = '';
        if (metric === 'revenue' || metric === 'profit' || metric === 'avgPrice') displayVal = formatMoney(maxVal, 0);
        else if (metric === 'pm' || metric === 'share') displayVal = formatPct(maxVal);
        else displayVal = formatNumber(maxVal);

        return { winner, metric, value: displayVal };
    }, [selectedPlatforms, sortRules]);

    const hoveredWinner = useMemo(() => getWinnerInfo(hoveredRow), [hoveredRow, getWinnerInfo]);

    const colConfig: Record<string, { label: string, key: string, align: string }> = {
        qty: { label: 'QTY', key: 'qty', align: 'right' },
        share: { label: 'Share', key: 'share', align: 'right' },
        pm: { label: 'PM%', key: 'pm', align: 'right' },
        avgPrice: { label: 'Avg £', key: 'avgPrice', align: 'right' },
        revenue: { label: 'Rev £', key: 'revenue', align: 'right' },
        profit: { label: 'Net £', key: 'profit', align: 'right' },
    };

    // Sort Indicator Helper
    const getSortIndicator = (key: string) => {
        const index = sortRules.findIndex(r => r.key === key);
        if (index === -1) return null;
        const rule = sortRules[index];
        return (
            <span className="ml-1 inline-flex items-center text-indigo-600 text-[10px]">
                {rule.dir === 'asc' ? '▲' : '▼'}
                {sortRules.length > 1 && <span className="ml-0.5 text-[8px] opacity-70">({index + 1})</span>}
            </span>
        );
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Controls */}
            <FilterBar
                showAudit
                auditActive={isAuditVisible}
                onAuditToggle={() => setIsAuditVisible(v => !v)}
                searchValue={searchQuery}
                onSearchChange={setSearchQuery}
                searchPlaceholder="Search SKU or Product Name..."
                multiSelects={[
                    {
                        key: 'platform',
                        label: 'Platforms',
                        options: platformOptions,
                        selected: selectedPlatforms,
                        onChange: setSelectedPlatforms
                    }
                ]}
                rightSlot={
                    <div className="flex items-center gap-4">
                        <SortConfigDropdown
                            sortRules={sortRules}
                            setSortRules={setSortRules}
                            availableColumns={visibleColumns}
                            platforms={selectedPlatforms}
                            themeColor={themeColor}
                        />
                        <MultiSelectDropdown
                            label="Columns"
                            options={availableColumns}
                            selected={visibleColumns}
                            onChange={setVisibleColumns}
                            themeColor={themeColor}
                            icon={Settings2}
                        />
                        <button
                            onClick={handleExport}
                            className="px-3 h-8 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 shadow-sm flex items-center gap-2 transition-colors"
                        >
                            <Download className="w-4 h-4" /> Export
                        </button>
                    </div>
                }
            />

            {isAuditVisible && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <AuditPanel
                        title="Platform Comparison Audit"
                        startKey={dateWindow.startKey}
                        endKey={dateWindow.endKey}
                        rows={processedData}
                        getDateKey={() => null}
                        getRevenue={(row: any) => row.totalRevenue}
                        getQty={(row: any) => row.totalQty}
                        getProfit={(row: any) => row.totalProfit}
                        getAdSpend={() => 0}
                    />
                </div>
            )}

            {/* Tooltip Portal */}
            {hoveredWinner && createPortal(
                <div
                    className="fixed pointer-events-none z-[9999] bg-gray-900/90 backdrop-blur text-white px-3 py-1.5 rounded-lg shadow-xl text-xs flex items-center gap-2 animate-in fade-in zoom-in duration-200 border border-gray-700/50"
                    style={{
                        left: cursorPos.x,
                        top: cursorPos.y,
                        transform: `translate(${cursorPos.x > window.innerWidth - 300 ? 'calc(-100% - 12px)' : '12px'}, ${cursorPos.y > window.innerHeight - 100 ? 'calc(-100% - 12px)' : '12px'})`
                    }}
                >
                    <Trophy className="w-3 h-3 text-yellow-400" />
                    <span>Top {hoveredWinner.metric === 'qty' ? 'Volume' : hoveredWinner.metric === 'revenue' ? 'Revenue' : hoveredWinner.metric === 'profit' ? 'Profit' : 'Perf'}:</span>
                    <span className="font-bold text-yellow-300">{hoveredWinner.winner}</span>
                    <span className="font-mono opacity-80">({hoveredWinner.value})</span>
                </div>,
                document.body
            )}

            {/* Table */}
            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden flex-1 flex flex-col backdrop-blur-custom relative z-0">
                <div className="overflow-auto flex-1 relative">
                    <table className="w-full text-sm text-left whitespace-nowrap border-separate border-spacing-0">
                        <thead className="sticky top-0 z-20">
                            <tr className="bg-gray-50/80 border-b border-gray-200/50 text-xs uppercase tracking-wider text-gray-600 font-semibold backdrop-blur-sm shadow-sm transition-colors">
                                {/* Sticky SKU Column */}
                                        <th className="px-4 py-3 sticky left-0 z-30 bg-gray-50/80 border-b border-r border-gray-200/50 min-w-[200px]" onClick={(e) => handleSort('sku', e)}>
                                    <div className="flex items-center justify-between cursor-pointer">
                                        SKU
                                        {getSortIndicator('sku')}
                                    </div>
                                </th>
                                {/* Total Column */}
                                <th className="px-4 py-3 border-b border-r border-gray-200/50 text-right bg-gray-50/80 min-w-[80px]" onClick={(e) => handleSort('totalQty', e)}>
                                    <div className="flex items-center justify-end cursor-pointer">
                                        Total QTY
                                        {getSortIndicator('totalQty')}
                                    </div>
                                </th>
                                {/* Platform Columns Grouped - Draggable */}
                                {selectedPlatforms.map(p => (
                                    <React.Fragment key={p}>
                                        <th
                                            className={`px-4 py-3 border-b border-gray-200/50 text-center bg-gray-50/80 border-r border-gray-200/50 cursor-move hover:bg-gray-100/80 transition-colors ${draggedPlatform === p ? 'opacity-50 border-dashed border-2 border-indigo-300' : ''}`}
                                            colSpan={visibleColumns.length}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, p)}
                                            onDragOver={(e) => handleDragOver(e, p)}
                                            onDrop={(e) => handleDrop(e, p)}
                                        >
                                            <div className="flex items-center justify-center gap-2 text-indigo-700">
                                                <GripVertical className="w-3 h-3 text-gray-400" />
                                                {p}
                                            </div>
                                        </th>
                                    </React.Fragment>
                                ))}
                            </tr>
                            <tr className="bg-gray-50/80 border-b border-gray-200/30 text-[10px] uppercase tracking-wider text-gray-500 font-semibold backdrop-blur-sm transition-colors">
                                <th className="px-4 py-2 sticky left-0 z-30 bg-gray-50/80 border-r border-gray-200/50 border-b border-gray-200/30 h-8"></th>
                                <th className="px-4 py-2 border-r border-gray-200/50 bg-gray-50/80 border-b border-gray-200/30 h-8"></th>
                                {selectedPlatforms.map(p => (
                                    <React.Fragment key={`${p}-sub`}>
                                        {visibleColumns.map(col => {
                                            const platformColor = pricingRules[p]?.color || '#9ca3af';
                                            const rgb = hexToRgb(platformColor);
                                            const headerBgStyle = rgb ? { backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)` } : {};

                                            return (
                                                <th
                                                    key={`${p}-${col}`}
                                                    className="px-4 py-2 text-right border-b border-gray-200/30 bg-gray-50/30 text-gray-500 font-semibold cursor-pointer hover:bg-gray-100/50 min-w-[80px] border-r border-gray-100/50 last:border-gray-200 transition-colors uppercase text-[10px]"
                                                    onClick={(e) => handleSort(`${p}_${colConfig[col].key}`, e)}
                                                    style={headerBgStyle}
                                                >
                                                    {colConfig[col].label} {getSortIndicator(`${p}_${colConfig[col].key}`)}
                                                </th>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/50">
                            {processedData.length > 0 ? (
                                processedData.map((row) => (
                                    <tr
                                        key={row.id}
                                        className="even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors group"
                                        onMouseEnter={(e) => { setHoveredRow(row); setCursorPos({ x: e.clientX, y: e.clientY }); }}
                                        onMouseMove={(e) => setCursorPos({ x: e.clientX, y: e.clientY })}
                                        onMouseLeave={() => setHoveredRow(null)}
                                    >
                                        {/* Sticky SKU Cell */}
                                        <td className="px-4 py-3 sticky left-0 z-10 bg-white border-r border-gray-100/50 group-hover:bg-gray-50/50 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] transition-colors">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-gray-900 font-mono text-xs">{row.sku}</span>
                                                <GradeBadge gradeLevel={row.gradeLevel} />
                                            </div>
                                            <div className="text-[10px] text-gray-500 truncate max-w-[180px]">{row.name}</div>
                                        </td>

                                        {/* Total Qty */}
                                        <td className="px-4 py-3 text-right font-bold text-gray-800 border-r border-gray-100/50 bg-gray-50/10">
                                            {formatNumber(row.totalQty)}
                                        </td>

                                        {/* Platform Cells */}
                                        {selectedPlatforms.map(p => {
                                            const qty = row[`${p}_qty`];

                                            // Pre-calc visual states
                                            const pm = row[`${p}_pm`];
                                            const pmClass = pm < 0 ? 'text-red-500 bg-red-50' : pm >= 15 ? 'text-emerald-600 bg-emerald-50' : 'text-amber-500';
                                            const hasActivity = qty > 0;

                                            // Platform Tint
                                            const platformColor = pricingRules[p]?.color || '#9ca3af';
                                            const rgb = hexToRgb(platformColor);
                                            const bgStyle = rgb ? { backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.08)` } : {};

                                            const hasPmBg = pm < 0 || pm >= 15;

                                            return (
                                                <React.Fragment key={p}>
                                                    {visibleColumns.includes('qty') && (
                                                        <td className="px-4 py-3 text-right font-medium text-gray-700 border-gray-50 text-xs border-r border-gray-100/50" style={bgStyle}>
                                                            {hasActivity ? qty : <span className="text-gray-300">-</span>}
                                                        </td>
                                                    )}
                                                    {visibleColumns.includes('share') && (
                                                        <td className="px-4 py-3 text-right text-[10px] text-gray-500 border-gray-50 border-r border-gray-50" style={bgStyle}>
                                                            {hasActivity ? `${row[`${p}_share`].toFixed(0)}%` : <span className="text-gray-300">-</span>}
                                                        </td>
                                                    )}
                                                    {visibleColumns.includes('pm') && (
                                                        <td
                                                            className={`px-4 py-3 text-right text-[10px] font-bold border-r border-gray-50 ${hasActivity ? pmClass : 'text-gray-300'}`}
                                                            style={hasPmBg ? {} : bgStyle}
                                                        >
                                                            {hasActivity ? `${pm.toFixed(0)}%` : '-'}
                                                        </td>
                                                    )}
                                                    {visibleColumns.includes('avgPrice') && (
                                                        <td className="px-4 py-3 text-right text-[10px] text-gray-600 border-r border-gray-50" style={bgStyle}>
                                                            {hasActivity ? `£${row[`${p}_avgPrice`].toFixed(2)}` : '-'}
                                                        </td>
                                                    )}
                                                    {visibleColumns.includes('revenue') && (
                                                        <td className="px-4 py-3 text-right text-[10px] text-indigo-600 font-medium border-r border-gray-50" style={bgStyle}>
                                                            {hasActivity ? formatMoney(row[`${p}_revenue`], 0) : '-'}
                                                        </td>
                                                    )}
                                                    {visibleColumns.includes('profit') && (
                                                        <td className={`px-4 py-3 text-right text-[10px] font-bold border-r border-gray-100/50 ${row[`${p}_profit`] >= 0 ? 'text-emerald-600' : 'text-red-500'}`} style={bgStyle}>
                                                            {hasActivity ? formatMoney(row[`${p}_profit`], 0) : '-'}
                                                        </td>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={2 + (selectedPlatforms.length * visibleColumns.length)} className="p-12 text-center text-gray-400 italic">
                                        No sales data found for the selected period and filters.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
