
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SelectFilter } from '../../common/SelectFilter';
import { Product, PricingRules, PriceLog, RefundLog } from '../../../types';
import { FilterBar } from '../../common/FilterBar';
import { Columns, ChevronDown, CheckSquare, Square, Download, GripVertical, Settings2, ArrowUp, ArrowDown, Plus, Trash2, ListFilter, Trophy } from 'lucide-react';
import { asDateKey, isDateKeyBetween } from '../../../services/dateUtils';
import { calcRevenue, calcProfit, calcUnits } from '../../../services/metrics';
import { formatPct, formatNumber, formatMoney, formatSmartMoney } from '../../../utils/format';
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
    isAuditVisible: boolean;
}

interface SortRule {
    key: string;
    dir: 'asc' | 'desc';
}

const SortConfigDropdown = ({ sortRules, setSortRules, availableColumns, platforms }: any) => {
    const [isOpen, setIsOpen] = useState(false);
    const [dropPos, setDropPos] = useState({ top: 0, left: 0 });
    const dropdownRef = useRef<HTMLDivElement>(null);
    const triggerRef = useRef<HTMLDivElement>(null);
    const portalRef = useRef<HTMLDivElement>(null);
    const [addKey, setAddKey] = useState('');

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)
                && triggerRef.current && !triggerRef.current.contains(event.target as Node)
                && portalRef.current && !portalRef.current.contains(event.target as Node)) {
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
            <div ref={triggerRef}>
                <button
                    onClick={() => {
                        if (!isOpen && triggerRef.current) {
                            const r = triggerRef.current.getBoundingClientRect();
                            setDropPos({ top: r.bottom + window.scrollY + 4, left: r.left + window.scrollX });
                        }
                        setIsOpen(!isOpen);
                    }}
                    className="px-3 h-8 text-xs font-bold rounded-lg border border-gray-200 bg-white text-gray-700 hover:bg-gray-50 shadow-sm flex items-center gap-2 transition-colors"
                >
                    <ListFilter className="w-3.5 h-3.5" />
                    Sort Priority
                    <ChevronDown className="w-3.5 h-3.5" />
                </button>
            </div>

            {isOpen && createPortal(
                <div ref={portalRef} style={{ position: 'fixed', top: dropPos.top, left: dropPos.left, zIndex: 9999 }} className="w-72 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden p-3">
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
                </div>,
                document.body
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
    dateWindow,
    isAuditVisible,
}) => {
    const [searchTags, setSearchTags] = useState<string[]>([]);
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
        if (metric === 'revenue' || metric === 'profit' || metric === 'avgPrice') displayVal = formatSmartMoney(maxVal);
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
                searchTags={searchTags}
                onSearchTagsChange={(tags) => { setSearchTags(tags); }}
                onSearchChange={(val) => { setSearchQuery(val); }}
                searchPlaceholder="Search SKU or Product Name…"
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
                        <SelectFilter
                            label="Columns"
                            options={availableColumns}
                            selected={visibleColumns}
                            onChange={setVisibleColumns}
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
                        distinctDaysCount={dateWindow.startKey && dateWindow.endKey ? Math.round((new Date(dateWindow.endKey).getTime() - new Date(dateWindow.startKey).getTime()) / 86400000) + 1 : 0}
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
                    <table className="sello-table">
                        <thead className="sticky top-0">
                            <tr>
                                {/* Sticky SKU Column */}
                                <th className="pin" style={{ minWidth: 200 }} onClick={(e) => handleSort('sku', e)}>
                                    <div className="flex items-center justify-between cursor-pointer">
                                        SKU
                                        {getSortIndicator('sku')}
                                    </div>
                                </th>
                                {/* Total Column */}
                                <th className="r" style={{ minWidth: 80 }} onClick={(e) => handleSort('totalQty', e)}>
                                    <div className="flex items-center justify-end cursor-pointer">
                                        Total QTY
                                        {getSortIndicator('totalQty')}
                                    </div>
                                </th>
                                {/* Platform Columns Grouped - Draggable */}
                                {selectedPlatforms.map(p => (
                                    <React.Fragment key={p}>
                                        <th
                                            className={`c group-start cursor-move hover:bg-gray-100/80 transition-colors ${draggedPlatform === p ? 'opacity-50 border-dashed border-2 border-indigo-300' : ''}`}
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
                            <tr>
                                <th className="pin" style={{ height: 32 }}></th>
                                <th style={{ height: 32 }}></th>
                                {selectedPlatforms.map(p => (
                                    <React.Fragment key={`${p}-sub`}>
                                        {visibleColumns.map((col, colIdx) => {
                                            const platformColor = pricingRules[p]?.color || '#9ca3af';
                                            const rgb = hexToRgb(platformColor);
                                            const headerBgStyle = rgb ? { backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.05)` } : {};

                                            return (
                                                <th
                                                    key={`${p}-${col}`}
                                                    className={`r metric-sub cursor-pointer hover:bg-gray-100/50 transition-colors${colIdx === 0 ? ' group-start' : ''}`}
                                                    style={{ minWidth: 80, ...headerBgStyle }}
                                                    onClick={(e) => handleSort(`${p}_${colConfig[col].key}`, e)}
                                                >
                                                    {colConfig[col].label} {getSortIndicator(`${p}_${colConfig[col].key}`)}
                                                </th>
                                            );
                                        })}
                                    </React.Fragment>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                            {processedData.length > 0 ? (
                                processedData.map((row) => (
                                    <tr
                                        key={row.id}
                                        className="group"
                                        onMouseEnter={(e) => { setHoveredRow(row); setCursorPos({ x: e.clientX, y: e.clientY }); }}
                                        onMouseMove={(e) => setCursorPos({ x: e.clientX, y: e.clientY })}
                                        onMouseLeave={() => setHoveredRow(null)}
                                    >
                                        {/* Sticky SKU Cell */}
                                        <td className="pin">
                                            <div className="flex items-center gap-2">
                                                <span className="font-bold text-gray-900 font-mono text-xs">{row.sku}</span>
                                                <GradeBadge gradeLevel={row.gradeLevel} />
                                            </div>
                                            <div className="text-[10px] text-gray-500 truncate max-w-[180px]">{row.name}</div>
                                        </td>

                                        {/* Total Qty */}
                                        <td className="r font-bold text-gray-800">
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
                                                        <td className={`r font-medium text-gray-700 text-xs${visibleColumns[0] === 'qty' ? ' group-start' : ''}`} style={bgStyle}>
                                                            {hasActivity ? qty : <span className="text-gray-300">-</span>}
                                                        </td>
                                                    )}
                                                    {visibleColumns.includes('share') && (
                                                        <td className={`r text-[10px] text-gray-500${visibleColumns[0] === 'share' ? ' group-start' : ''}`} style={bgStyle}>
                                                            {hasActivity ? `${row[`${p}_share`].toFixed(0)}%` : <span className="text-gray-300">-</span>}
                                                        </td>
                                                    )}
                                                    {visibleColumns.includes('pm') && (
                                                        <td
                                                            className={`r text-[10px] font-bold ${hasActivity ? pmClass : 'text-gray-300'}${visibleColumns[0] === 'pm' ? ' group-start' : ''}`}
                                                            style={hasPmBg ? {} : bgStyle}
                                                        >
                                                            {hasActivity ? `${pm.toFixed(0)}%` : '-'}
                                                        </td>
                                                    )}
                                                    {visibleColumns.includes('avgPrice') && (
                                                        <td className={`r text-[10px] text-gray-600${visibleColumns[0] === 'avgPrice' ? ' group-start' : ''}`} style={bgStyle}>
                                                            {hasActivity ? formatSmartMoney(row[`${p}_avgPrice`]) : '-'}
                                                        </td>
                                                    )}
                                                    {visibleColumns.includes('revenue') && (
                                                        <td className={`r text-[10px] text-indigo-600 font-medium${visibleColumns[0] === 'revenue' ? ' group-start' : ''}`} style={bgStyle}>
                                                            {hasActivity ? formatSmartMoney(row[`${p}_revenue`]) : '-'}
                                                        </td>
                                                    )}
                                                    {visibleColumns.includes('profit') && (
                                                        <td className={`r text-[10px] font-bold ${row[`${p}_profit`] >= 0 ? 'text-emerald-600' : 'text-red-500'}${visibleColumns[0] === 'profit' ? ' group-start' : ''}`} style={bgStyle}>
                                                            {hasActivity ? formatSmartMoney(row[`${p}_profit`]) : '-'}
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
