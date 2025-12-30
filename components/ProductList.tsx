
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, PricingRules } from '../types';
import { TagSearchInput } from './TagSearchInput';
import { Search, Filter, AlertCircle, CheckCircle, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Download, ArrowRight, Save, RotateCcw, ArrowUpDown, ChevronUp, ChevronDown, SlidersHorizontal, Clock, Star, EyeOff, Eye, X, Layers, Tag, Info, GitMerge, User, Globe, Lock, RefreshCw, Percent, CheckSquare, Square, CornerDownLeft, List, Ship } from 'lucide-react';

interface ProductListProps {
    products: Product[];
    onAnalyze: (product: Product) => void;
    onEditAliases?: (product: Product) => void;
    onViewShipments?: (sku: string) => void; // New Callback
    dateLabels?: { current: string, last: string };
    pricingRules?: PricingRules;
    themeColor: string;
}

type SortKey = keyof Product | 'estNewPrice';

const RecommendationTooltip = ({ product, rect }: { product: Product, rect: DOMRect }) => {
    const style: React.CSSProperties = {
        position: 'fixed',
        top: `${rect.top}px`,
        left: `${rect.left + rect.width / 2}px`,
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
                        <span className="text-right text-gray-200">{product.daysRemaining > 900 ? '> 2 Years' : `${product.daysRemaining.toFixed(0)} Days`}</span>

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
    onAnalyze: (p: Product) => void;
    onEditAliases?: (p: Product) => void;
    onViewShipments?: (sku: string) => void;
    hoveredProduct: { id: string; rect: DOMRect } | null;
    handleMouseEnter: (id: string, e: React.MouseEvent) => void;
    handleMouseLeave: () => void;
}

const ProductRow = React.memo(({
    product,
    themeColor,
    onAnalyze,
    onEditAliases,
    onViewShipments,
    handleMouseEnter,
    handleMouseLeave
}: ProductRowProps) => {
    const isOOS = product.recommendation === 'Out of Stock';
    const isMonitoring = product.status === 'Warning' && product.recommendation.includes('Monitor');

    // Apply 20% VAT Uplift for Display
    const VAT = 1.20;
    const currentPriceWithVat = (product.currentPrice || 0) * VAT;
    const oldPriceWithVat = product.oldPrice ? product.oldPrice * VAT : null;
    const optimalPriceWithVat = product.optimalPrice ? product.optimalPrice * VAT : null;

    const runwayBin = {
        label: product.daysRemaining > 730 ? '> 2 Years' : `${Math.round(product.daysRemaining)} Days`,
        color: product.status === 'Critical' ? 'bg-red-50 text-red-600 border-red-200' :
            product.status === 'Overstock' ? 'bg-orange-50 text-orange-600 border-orange-200' :
                product.status === 'Warning' ? 'bg-amber-50 text-amber-600 border-amber-200' : 'bg-green-50 text-green-600 border-green-200'
    };

    const isLowStock = product.stockLevel <= 10 && product.stockLevel > 0;
    const isHighReturns = product.returnRate !== undefined && product.returnRate > 5;

    return (
        <tr key={product.id} className="even:bg-gray-50/50 hover:bg-gray-100/50 transition-colors group text-sm border-b border-gray-50 last:border-none">
            <td className="px-4 py-3">
                <div>
                    <div className="font-bold text-gray-900 font-mono">{product.sku}</div>
                    <div className="text-gray-900 font-medium text-xs mt-1 truncate max-w-[240px] xl:max-w-[350px]" title={product.name}>{product.name}</div>
                    <div className="flex gap-2 mt-1.5">
                        {product.subcategory && (
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded border border-gray-200">{product.subcategory}</span>
                        )}
                    </div>
                </div>
            </td>
            <td className="px-4 py-3 text-right">
                {optimalPriceWithVat ? (
                    <div className="flex items-center justify-end gap-1 font-bold" style={{ color: themeColor }} title="Based on historical margin & velocity performance (VAT Inc)">
                        <Star className="w-3 h-3" style={{ fill: `${themeColor}20` }} />
                        £{optimalPriceWithVat.toFixed(2)}
                    </div>
                ) : (
                    <span className="text-gray-300">-</span>
                )}
            </td>
            <td className="px-4 py-3 text-right">
                <div className="text-gray-400 font-medium">
                    {oldPriceWithVat ? `£${oldPriceWithVat.toFixed(2)}` : '-'}
                </div>
            </td>
            <td className="px-4 py-3 text-right">
                <div className="font-bold text-gray-900">£{currentPriceWithVat.toFixed(2)}</div>
            </td>
            <td className="px-4 py-3 text-right">
                {product.caPrice ? (
                    <div className="flex items-center justify-end gap-1 font-bold text-purple-600" title="Channel Advisor Reference Price">
                        £{product.caPrice.toFixed(2)}
                    </div>
                ) : (
                    <span className="text-gray-300">—</span>
                )}
            </td>
            
            <td className="px-4 py-3 text-right">
                <div className="flex flex-col items-end gap-0.5">
                    <span className="font-bold text-gray-900">{product.stockLevel}</span>
                    {product.incomingStock && product.incomingStock > 0 ? (
                        <button 
                            onClick={(e) => {
                                e.stopPropagation();
                                if (onViewShipments) onViewShipments(product.sku);
                            }}
                            className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100 flex items-center gap-1 hover:bg-indigo-100 hover:border-indigo-300 transition-colors cursor-pointer" 
                            title="Click to view incoming shipments"
                        >
                            <Ship className="w-3 h-3" />
                            +{product.incomingStock}
                        </button>
                    ) : null}
                </div>
            </td>

            <td className="px-4 py-3 text-right">
                <div className="flex flex-col items-end gap-1.5">
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded border text-xs font-bold whitespace-nowrap ${runwayBin.color}`}>
                        {runwayBin.label}
                    </span>
                    <div className="flex items-center gap-1">
                        {(product as any)._trendData?.velocityChange < -0.2 && <TrendingDown className="w-3 h-3 text-red-400" />}
                        {(product as any)._trendData?.velocityChange > 0.2 && <TrendingUp className="w-3 h-3 text-green-400" />}
                        <span className="text-xs font-semibold text-gray-700">
                            {product.averageDailySales.toFixed(1)} / day
                        </span>
                    </div>
                </div>
            </td>
            <td className="px-4 py-3 text-right">
                {product.returnRate !== undefined ? (
                    <div className={`flex items-center justify-end gap-1 font-medium ${isHighReturns ? 'text-red-600 font-bold' : 'text-gray-500'}`}>
                        {isHighReturns && <CornerDownLeft className="w-3 h-3" />}
                        {product.returnRate.toFixed(1)}%
                    </div>
                ) : <span className="text-gray-300">-</span>}
            </td>
            <td
                className="px-4 py-3 cursor-help"
                onMouseEnter={(e) => handleMouseEnter(product.id, e)}
                onMouseLeave={handleMouseLeave}
            >
                <div className="flex flex-col gap-1">
                    <div className={`flex items-center gap-2 font-semibold ${isOOS ? 'text-gray-500' :
                        isMonitoring ? 'text-blue-600' :
                            product.status === 'Critical' ? 'text-red-600' :
                                product.status === 'Overstock' ? 'text-orange-600' : 'text-green-600'
                        }`}>
                        {isOOS && <AlertCircle className="w-4 h-4" />}
                        {isMonitoring && <Clock className="w-4 h-4" />}
                        {!isOOS && !isMonitoring && product.status === 'Critical' && <TrendingUp className="w-4 h-4" />}
                        {!isOOS && !isMonitoring && product.status === 'Overstock' && <TrendingDown className="w-4 h-4" />}
                        {!isOOS && !isMonitoring && product.status === 'Healthy' && <CheckCircle className="w-4 h-4" />}

                        <span className="border-b border-dashed border-current pb-0.5 text-xs truncate max-w-[160px]">
                            {product.recommendation}
                        </span>
                    </div>
                    {isLowStock && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 border border-red-200 self-start ml-6">
                            Low Stock ({product.stockLevel})
                        </span>
                    )}
                </div>
            </td>
            <td className="px-4 py-3 text-right">
                <div className="flex items-center justify-end gap-2">
                    {onEditAliases && (
                        <button
                            onClick={() => onEditAliases(product)}
                            className="text-gray-400 hover:text-amber-600 transition-colors p-1 rounded hover:bg-amber-50"
                            title="Edit Aliases / SKU Mapping"
                        >
                            <GitMerge className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
});

const ProductList: React.FC<ProductListProps> = ({ products, onAnalyze, onEditAliases, onViewShipments, dateLabels, pricingRules, themeColor }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('All');
    const [managerFilter, setManagerFilter] = useState('All');
    const [platformFilters, setPlatformFilters] = useState<string[]>([]); // Multi-select array

    // Debounce search input
    useEffect(() => {
        const timer = setTimeout(() => setDebouncedSearch(searchQuery), 300);
        return () => clearTimeout(timer);
    }, [searchQuery]);

    // New Filters
    const [brandFilter, setBrandFilter] = useState('All');
    const [mainCatFilter, setMainCatFilter] = useState('All');
    const [subCatFilter, setSubCatFilter] = useState('All');

    // Visibility Toggles
    const [showInactive, setShowInactive] = useState(false);
    const [showOOS, setShowOOS] = useState(true);

    // Advanced Filter State
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [velocityFilter, setVelocityFilter] = useState<{ min: string, max: string }>({ min: '', max: '' });
    const [runwayFilter, setRunwayFilter] = useState<{ min: string, max: string }>({ min: '', max: '' });

    // Export Menu State
    const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

    const [currentPage, setCurrentPage] = useState(1);
    const [itemsPerPage, setItemsPerPage] = useState(25);
    const [hoveredProduct, setHoveredProduct] = useState<{ id: string; rect: DOMRect } | null>(null);

    // Sorting State
    const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);

    // Helper to resolve manager from config if available (Dynamic Lookup)
    const getEffectiveManager = (platform: string, storedManager: string) => {
        if (pricingRules && pricingRules[platform]?.manager && pricingRules[platform].manager !== 'Unassigned') {
            return pricingRules[platform].manager;
        }
        return storedManager || 'Unassigned';
    };

    const uniqueManagers = useMemo(() => {
        const managerSet = new Set<string>();
        products.forEach(p => p.channels.forEach(c => {
            managerSet.add(getEffectiveManager(c.platform, c.manager));
        }));
        if (pricingRules) {
            Object.values(pricingRules).forEach((r: any) => {
                if (r.manager && r.manager !== 'Unassigned') managerSet.add(r.manager);
            });
        }
        return Array.from(managerSet).sort();
    }, [products, pricingRules]);

    const uniquePlatforms = useMemo(() => {
        const platformSet = new Set<string>();
        products.forEach(p => p.channels.forEach(c => platformSet.add(c.platform)));
        if (pricingRules) {
            Object.keys(pricingRules).forEach(k => platformSet.add(k));
        }
        return Array.from(platformSet).sort();
    }, [products, pricingRules]);

    const uniqueBrands = useMemo(() => {
        const brands = new Set(products.map(p => p.brand).filter(Boolean) as string[]);
        return Array.from(brands).sort();
    }, [products]);

    const uniqueMainCats = useMemo(() => {
        const cats = new Set(products.map(p => p.category).filter(Boolean) as string[]);
        return Array.from(cats).sort();
    }, [products]);

    const uniqueSubCats = useMemo(() => {
        let relevantProducts = products;
        if (mainCatFilter !== 'All') {
            relevantProducts = products.filter(p => p.category === mainCatFilter);
        }
        const subs = new Set(relevantProducts.map(p => p.subcategory).filter(Boolean) as string[]);
        return Array.from(subs).sort();
    }, [products, mainCatFilter]);

    const handleSort = (key: SortKey) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredProducts = useMemo(() => {
        const searchQueryLower = debouncedSearch.toLowerCase();
        let filtered = products.filter(p => {
            // Enhanced Search Logic with Tags
            if (searchTags.length > 0) {
                const matchesTag = searchTags.some(tag => {
                    const t = tag.toLowerCase();
                    return p.sku.toLowerCase().includes(t) || 
                           p.name.toLowerCase().includes(t) ||
                           p.channels.some(c => c.skuAlias?.toLowerCase().includes(t));
                });
                if (!matchesTag) return false;
            } else if (searchQueryLower) {
                if (!p.sku.toLowerCase().includes(searchQueryLower) && !p.name.toLowerCase().includes(searchQueryLower)) return false;
            }

            if (!showInactive && p.stockLevel <= 0 && p.averageDailySales === 0) return false;
            if (!showOOS && p.stockLevel <= 0) return false;
            if (brandFilter !== 'All' && p.brand !== brandFilter) return false;
            if (mainCatFilter !== 'All' && p.category !== mainCatFilter) return false;
            if (subCatFilter !== 'All' && p.subcategory !== subCatFilter) return false;
            return true;
        });

        const aggregatedData = filtered.map(p => {
            const isPlatformFiltered = platformFilters.length > 0;
            const matchingChannels = p.channels.filter(c => {
                const matchPlatform = !isPlatformFiltered || platformFilters.includes(c.platform);
                const effectiveManager = getEffectiveManager(c.platform, c.manager);
                const matchManager = managerFilter === 'All' || effectiveManager === managerFilter;
                return matchPlatform && matchManager;
            });

            const isFiltering = isPlatformFiltered || managerFilter !== 'All';
            let displayVelocity = p.averageDailySales;
            let displayPrice = p.currentPrice || 0;

            if (isFiltering) {
                const totalFilteredVelocity = matchingChannels.reduce((sum, c) => sum + c.velocity, 0);
                let weightedPriceSum = 0;
                let weightedDivisor = 0;

                matchingChannels.forEach(c => {
                    const price = c.price || p.currentPrice || 0;
                    weightedPriceSum += (price * c.velocity);
                    weightedDivisor += c.velocity;
                });

                if (weightedDivisor > 0) {
                    displayPrice = Number((weightedPriceSum / weightedDivisor).toFixed(2));
                } else if (matchingChannels.length > 0) {
                    const sumPrices = matchingChannels.reduce((sum, c) => sum + (c.price || p.currentPrice || 0), 0);
                    displayPrice = Number((sumPrices / matchingChannels.length).toFixed(2));
                }
                displayVelocity = totalFilteredVelocity;
            }

            const stock = p.stockLevel;
            const leadTime = p.leadTimeDays;
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

        if (sortConfig) {
            aggregatedData.sort((a, b) => {
                let aValue: any = a[sortConfig.key as keyof Product];
                let bValue: any = b[sortConfig.key as keyof Product];
                if (typeof aValue === 'string') aValue = aValue.toLowerCase();
                if (typeof bValue === 'string') bValue = bValue.toLowerCase();
                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        } else {
            aggregatedData.sort((a, b) => {
                if (a.status === 'Critical' && b.status !== 'Critical') return -1;
                if (a.status !== 'Critical' && b.status === 'Critical') return 1;
                return a.sku.localeCompare(b.sku);
            });
        }

        return aggregatedData;
    }, [products, debouncedSearch, searchTags, statusFilter, managerFilter, platformFilters, brandFilter, mainCatFilter, subCatFilter, sortConfig, showInactive, showOOS]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchQuery, searchTags, statusFilter, managerFilter, platformFilters, brandFilter, mainCatFilter, subCatFilter, showInactive, showOOS]);

    useEffect(() => {
        setSubCatFilter('All');
    }, [mainCatFilter]);

    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const paginatedProducts = filteredProducts.slice(
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

    const handleExport = (platform: string = 'All') => {
        const cleanChar = (val: any) => {
            if (val === null || val === undefined) return '';
            const str = String(val).replace(/[\r\n]+/g, ' ');
            return `"${str.replace(/"/g, '""')}"`;
        };

        const headers = ['SKU', 'Master SKU', 'Name', 'Brand', 'Category', 'Subcategory', 'Current Price', 'Stock', 'Velocity', 'Days Remaining', 'Status', 'Cost', 'Return Rate %'];
        const rows: (string | number)[][] = [];

        filteredProducts.forEach(p => {
            const commonData = [
                cleanChar(p.sku),
                cleanChar(p.name),
                cleanChar(p.brand || ''),
                cleanChar(p.category || ''),
                cleanChar(p.subcategory || ''),
                (p.currentPrice || 0).toFixed(2),
                p.stockLevel,
                p.averageDailySales.toFixed(2),
                p.daysRemaining.toFixed(0),
                cleanChar(p.status),
                p.costPrice ? p.costPrice.toFixed(2) : '0.00',
                (p.returnRate || 0).toFixed(2)
            ];

            if (platform === 'All') {
                rows.push([cleanChar(p.sku), ...commonData]);
            } else {
                const normalize = (s: string) => s.toLowerCase().trim();
                const targetPlatform = normalize(platform);
                let channel = p.channels.find(c => normalize(c.platform) === targetPlatform);
                if (!channel) {
                    channel = p.channels.find(c => normalize(c.platform).includes(targetPlatform) || targetPlatform.includes(normalize(c.platform)));
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

    const SortHeader = ({ label, sortKey, alignRight = false, subLabel, width }: { label: string, sortKey: SortKey, alignRight?: boolean, subLabel?: string, width?: string }) => {
        const isActive = sortConfig?.key === sortKey;
        return (
            <th
                className={`px-4 py-3 font-semibold cursor-pointer select-none hover:bg-gray-100/50 transition-colors ${alignRight ? 'text-right' : 'text-left'} ${width || ''}`}
                onClick={() => handleSort(sortKey)}
            >
                <div className={`flex items-center gap-1 ${alignRight ? 'justify-end' : 'justify-start'}`}>
                    {label}
                    <div className="flex flex-col">
                        {isActive ? (
                            sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" style={{ color: themeColor }} /> : <ChevronDown className="w-3 h-3" style={{ color: themeColor }} />
                        ) : (
                            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50" />
                        )}
                    </div>
                </div>
            </th>
        );
    };

    const isContextFiltered = platformFilters.length > 0 || managerFilter !== 'All';

    // Helper for filter pills
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
                    {options.map((opt: string) => (
                        <option key={opt} value={opt}>{opt}</option>
                    ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
        </div>
    );

    // Multi-Select Dropdown Component
    const MultiSelectDropdown = ({ label, icon: Icon, selected, onChange, options, themeColor }: any) => {
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

        const displayText = selected.length === 0 ? 'All' : selected.length === 1 ? selected[0] : `${selected.length} Selected`;

        return (
            <div className="relative" ref={dropdownRef}>
                <div
                    className="flex items-center border border-gray-300 rounded-lg bg-white overflow-hidden cursor-pointer"
                    onClick={() => setIsOpen(!isOpen)}
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

                {isOpen && (
                    <div className="absolute top-full left-0 mt-1 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 overflow-hidden animate-in fade-in zoom-in duration-100">
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
                            {options.map((opt: string) => {
                                const isSelected = selected.includes(opt);
                                return (
                                    <div
                                        key={opt}
                                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer rounded-md"
                                        onClick={() => toggleOption(opt)}
                                    >
                                        {isSelected ? (
                                            <CheckSquare className="w-4 h-4 text-indigo-600 flex-shrink-0" style={{ color: themeColor }} />
                                        ) : (
                                            <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                        )}
                                        <span className={`text-sm ${isSelected ? 'font-medium text-gray-900' : 'text-gray-600'}`}>{opt}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="space-y-4">
            {/* Simulation & Action Bar - Updated with bg-custom-glass */}
            <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm flex flex-col xl:flex-row items-center justify-between gap-4 relative overflow-hidden backdrop-blur-custom">
                <div className="flex items-center gap-6 w-full xl:w-auto">
                    <div className="flex items-center gap-2">
                        <List className="w-5 h-5 text-gray-400" />
                        <span className="text-sm font-bold text-gray-700 whitespace-nowrap">Master Catalogue</span>
                    </div>
                </div>

                <div className="w-full xl:w-auto flex justify-end relative">
                    <button
                        onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                        className="px-4 py-1.5 bg-white/50 border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-white transition-colors flex items-center gap-1.5"
                    >
                        <Download className="w-3.5 h-3.5" />
                        Export List
                        <ChevronDown className="w-3 h-3 text-gray-400" />
                    </button>

                    {/* Floating Modal for Export */}
                    {isExportMenuOpen && createPortal(
                        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setIsExportMenuOpen(false)}>
                            <div
                                className="bg-custom-glass-modal backdrop-blur-custom-modal rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-white/20"
                                onClick={e => e.stopPropagation()} // Prevent close on modal click
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

            {/* Filters Toolbar - Updated with bg-custom-glass */}
            <div className="bg-custom-glass rounded-xl border border-custom-glass shadow-lg flex flex-col backdrop-blur-custom relative z-20">
                <div className="p-4 space-y-4">
                    {/* Top Row: Search + Main Filters */}
                    <div className="flex flex-col lg:flex-row gap-4">
                        {/* Search - Flexible Width */}
                        <div className="flex-1 min-w-[250px]">
                            <TagSearchInput 
                                tags={searchTags}
                                onTagsChange={(tags) => { setSearchTags(tags); setCurrentPage(1); }}
                                onInputChange={(val) => { setSearchQuery(val); setCurrentPage(1); }}
                                placeholder="Search SKUs or Name..."
                                themeColor={themeColor}
                            />
                        </div>

                        {/* Primary Filters - Grid/Flex for neat alignment */}
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

                            {/* Advanced Toggle */}
                            <button
                                onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                                className={`px-3 py-2.5 border rounded-lg flex items-center gap-2 text-sm font-medium transition-colors ml-auto lg:ml-0`}
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

                {/* Collapsible Advanced Filters */}
                {showAdvancedFilters && (
                    <div className="px-4 pb-4 border-t border-gray-100/50 bg-gray-50/50 rounded-b-xl animate-in fade-in slide-in-from-top-2 duration-200 backdrop-blur-sm">
                        <div className="flex flex-col lg:flex-row gap-4 pt-4 items-start lg:items-center">

                            {/* Row 2 Filters */}
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

                                {/* Velocity Range */}
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

                            {/* Toggles Container */}
                            <div className="flex flex-wrap gap-3">
                                {/* Show OOS Toggle */}
                                <button
                                    onClick={() => setShowOOS(!showOOS)}
                                    className={`flex items-center justify-between gap-3 px-3 py-2 border rounded-lg text-sm font-medium transition-colors hover:bg-gray-50 ${showOOS ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 bg-white'}`}
                                    style={showOOS ? { borderColor: themeColor, backgroundColor: `${themeColor}10`, color: themeColor } : {}}
                                >
                                    <span className="text-xs font-bold uppercase">Show Out of Stock</span>
                                    {showOOS ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                                </button>

                                {/* Show Inactive (Ghost) Toggle */}
                                <button
                                    onClick={() => setShowInactive(!showInactive)}
                                    className={`flex items-center justify-between gap-3 px-3 py-2 border rounded-lg text-sm font-medium transition-colors hover:bg-gray-50 ${showInactive ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 bg-white'}`}
                                    style={showInactive ? { borderColor: themeColor, backgroundColor: `${themeColor}10`, color: themeColor } : {}}
                                >
                                    <span className="text-xs font-bold uppercase">Show Inactive</span>
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
                        {platformFilters.length > 0 && <strong> {platformFilters.length} Platform(s) </strong>}
                        {platformFilters.length > 0 && managerFilter !== 'All' && <span>and</span>}
                        {managerFilter !== 'All' && <strong> {managerFilter} </strong>}
                        only. Prices are recalculated weighted averages for this selection.
                    </span>
                </div>
            )}

            {/* Main Table - Updated with bg-custom-glass */}
            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50/80 border-b border-gray-200 text-xs uppercase tracking-wider text-gray-500 font-medium">
                                <SortHeader label="Product" sortKey="sku" width="min-w-[250px]" />
                                <SortHeader label="Optimal Ref." sortKey="optimalPrice" alignRight width="w-[110px]" />
                                <SortHeader label="Last Week" sortKey="oldPrice" alignRight subLabel={dateLabels?.last} width="w-[110px]" />
                                <SortHeader label={isContextFiltered ? "Current (Filt.)" : "Current"} sortKey="currentPrice" alignRight subLabel={dateLabels?.current} width="w-[110px]" />
                                <SortHeader label="CA Price" sortKey="caPrice" alignRight width="w-[100px]" />
                                <SortHeader label="Inventory" sortKey="stockLevel" alignRight width="w-[120px]" />
                                <SortHeader label={isContextFiltered ? "Runway (Filt.)" : "Runway"} sortKey="daysRemaining" alignRight width="w-[140px]" />
                                <SortHeader label="Returns" sortKey="returnRate" alignRight width="w-[100px]" />
                                <SortHeader label={isContextFiltered ? "Rec. (Filt.)" : "Recommendation"} sortKey="status" width="min-w-[180px]" />
                                <th className="px-4 py-3 font-semibold text-right w-[60px]">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100/50">
                            {paginatedProducts.map((product) =>
                                <ProductRow
                                    key={product.id}
                                    product={product}
                                    themeColor={themeColor}
                                    onAnalyze={onAnalyze}
                                    onEditAliases={onEditAliases}
                                    onViewShipments={onViewShipments} // Pass handler down
                                    hoveredProduct={hoveredProduct}
                                    handleMouseEnter={handleMouseEnter}
                                    handleMouseLeave={handleMouseLeave}
                                />
                            )}
                            {filteredProducts.length === 0 && (
                                <tr>
                                    <td colSpan={10} className="p-8 text-center text-gray-500">
                                        <div className="flex flex-col items-center justify-center gap-2">
                                            <p>No products found matching your filters.</p>
                                            {products.length > 0 && !showInactive && (
                                                <button
                                                    onClick={() => setShowInactive(true)}
                                                    className="text-indigo-600 text-sm font-medium hover:underline flex items-center gap-1"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                    Show {products.length - filteredProducts.length} hidden items (Inactive/Ghost)
                                                </button>
                                            )}
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                {filteredProducts.length > 0 && (
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
                                    <option value={20}>20</option>
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
                                            className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
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

            {hoveredProduct && (
                <RecommendationTooltip
                    product={filteredProducts.find(p => p.id === hoveredProduct.id)!}
                    rect={hoveredProduct.rect}
                />
            )}
        </div>
    );
};

export default ProductList;
