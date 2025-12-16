
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Product } from '../types';
import { Activity, Search, Filter, AlertCircle, CheckCircle, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Users, Info, ShoppingBag, Download, ArrowRight, Save, RotateCcw, ArrowUpDown, ChevronUp, ChevronDown, SlidersHorizontal, Clock, Star, ToggleLeft, ToggleRight, Tag, Layers, EyeOff, Eye } from 'lucide-react';

interface ProductListProps {
  products: Product[];
  onAnalyze: (product: Product) => void;
  onApplyChanges: (updates: { productId: string, newPrice: number }[]) => void;
  dateLabels?: { current: string, last: string };
  themeColor: string;
}

type SortKey = keyof Product | 'estNewPrice';

const ProductList: React.FC<ProductListProps> = ({ products, onAnalyze, onApplyChanges, dateLabels, themeColor }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [managerFilter, setManagerFilter] = useState('All');
  const [platformFilter, setPlatformFilter] = useState('All');
  
  // New Filters
  const [brandFilter, setBrandFilter] = useState('All');
  const [mainCatFilter, setMainCatFilter] = useState('All');
  const [showInactive, setShowInactive] = useState(false); // Toggle for "Ghost" products

  // Advanced Filter State
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [velocityFilter, setVelocityFilter] = useState<{min: string, max: string}>({min: '', max: ''});
  const [runwayFilter, setRunwayFilter] = useState<{min: string, max: string}>({min: '', max: ''});

  // Export Menu State
  const [isExportMenuOpen, setIsExportMenuOpen] = useState(false);

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [hoveredProduct, setHoveredProduct] = useState<{ id: string; rect: DOMRect } | null>(null);
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
  
  // Bulk Adjustment State
  const [adjustmentIntensity, setAdjustmentIntensity] = useState(0); 
  const [allowOutOfStockAdjustment, setAllowOutOfStockAdjustment] = useState(false); 
  
  // Individual Overrides: Map of productId -> manualNewPrice
  const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
  
  // UI Feedback
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false); 

  // Extract unique options for dropdowns
  const uniqueManagers = useMemo(() => {
    const managers = new Set<string>();
    products.forEach(p => p.channels.forEach(c => managers.add(c.manager)));
    return Array.from(managers).sort();
  }, [products]);

  const uniquePlatforms = useMemo(() => {
    const platforms = new Set<string>();
    products.forEach(p => p.channels.forEach(c => platforms.add(c.platform)));
    return Array.from(platforms).sort();
  }, [products]);

  const uniqueBrands = useMemo(() => {
      const brands = new Set(products.map(p => p.brand).filter(Boolean) as string[]);
      return Array.from(brands).sort();
  }, [products]);

  const uniqueMainCats = useMemo(() => {
      const cats = new Set(products.map(p => p.category).filter(Boolean) as string[]);
      return Array.from(cats).sort();
  }, [products]);

  const getSimulatedPrice = (product: Product): number => {
      if (priceOverrides[product.id] !== undefined) {
          return priceOverrides[product.id];
      }
      if (product.stockLevel <= 0 && !allowOutOfStockAdjustment) {
          return product.currentPrice;
      }
      let multiplier = 1;
      if (product.status === 'Critical') {
          multiplier = 1 + (adjustmentIntensity / 100);
      } else if (product.status === 'Overstock') {
          multiplier = 1 - (adjustmentIntensity / 100);
      }
      return Number((product.currentPrice * multiplier).toFixed(2));
  };

  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredProducts = useMemo(() => {
    const aggregatedData = products.map(p => {
        // --- VISIBILITY LOGIC (Ghost Products) ---
        // If showInactive is FALSE, hide products with 0 stock AND 0 sales.
        if (!showInactive && p.stockLevel <= 0 && p.averageDailySales === 0) {
            return { ...p, _isVisible: false };
        }

        const matchingChannels = p.channels.filter(c => {
             const matchPlatform = platformFilter === 'All' || c.platform === platformFilter;
             const matchManager = managerFilter === 'All' || c.manager === managerFilter;
             return matchPlatform && matchManager;
        });

        const isFiltering = platformFilter !== 'All' || managerFilter !== 'All';
        
        let displayVelocity = p.averageDailySales;
        let displayPrice = p.currentPrice;
        
        if (isFiltering) {
            const totalFilteredVelocity = matchingChannels.reduce((sum, c) => sum + c.velocity, 0);
            
            let weightedPriceSum = 0;
            let weightedDivisor = 0;

            matchingChannels.forEach(c => {
                const price = c.price || p.currentPrice;
                weightedPriceSum += (price * c.velocity);
                weightedDivisor += c.velocity;
            });

            if (weightedDivisor > 0) {
                displayPrice = Number((weightedPriceSum / weightedDivisor).toFixed(2));
            } else if (matchingChannels.length > 0) {
                const sumPrices = matchingChannels.reduce((sum, c) => sum + (c.price || p.currentPrice), 0);
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

    let result = aggregatedData.filter(p => {
        const matchesSearch = p.sku.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              p.name.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
        const matchesBrand = brandFilter === 'All' || p.brand === brandFilter;
        const matchesMainCat = mainCatFilter === 'All' || p.category === mainCatFilter;
        
        const vel = p.averageDailySales;
        const matchesVelocityMin = velocityFilter.min === '' || vel >= parseFloat(velocityFilter.min);
        const matchesVelocityMax = velocityFilter.max === '' || vel <= parseFloat(velocityFilter.max);

        const runway = p.daysRemaining;
        const matchesRunwayMin = runwayFilter.min === '' || runway >= parseFloat(runwayFilter.min);
        const matchesRunwayMax = runwayFilter.max === '' || runway <= parseFloat(runwayFilter.max);

        return matchesSearch && matchesStatus && matchesBrand && matchesMainCat && matchesVelocityMin && matchesVelocityMax && matchesRunwayMin && matchesRunwayMax;
    });

    if (sortConfig) {
      result.sort((a, b) => {
        let aValue: any = a[sortConfig.key as keyof Product];
        let bValue: any = b[sortConfig.key as keyof Product];

        if (sortConfig.key === 'estNewPrice') {
          aValue = getSimulatedPrice(a);
          bValue = getSimulatedPrice(b);
        }

        if (typeof aValue === 'string') aValue = aValue.toLowerCase();
        if (typeof bValue === 'string') bValue = bValue.toLowerCase();

        if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    } else {
      result.sort((a, b) => {
        if (a.status === 'Critical' && b.status !== 'Critical') return -1;
        if (a.status !== 'Critical' && b.status === 'Critical') return 1;
        return a.sku.localeCompare(b.sku);
      });
    }

    return result;
  }, [products, searchQuery, statusFilter, managerFilter, platformFilter, brandFilter, mainCatFilter, sortConfig, priceOverrides, adjustmentIntensity, velocityFilter, runwayFilter, allowOutOfStockAdjustment, showInactive]);

  useEffect(() => {
      setCurrentPage(1);
  }, [searchQuery, statusFilter, managerFilter, platformFilter, brandFilter, mainCatFilter, showInactive]);

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

  const handleIntensityChange = (val: number) => {
    setAdjustmentIntensity(Math.min(50, Math.max(0, val)));
    setIsConfirmed(false); 
    if (Object.keys(priceOverrides).length > 0) {
        setPriceOverrides({});
    }
  };

  const handleOverrideChange = (productId: string, value: string) => {
      setIsConfirmed(false);
      const num = parseFloat(value);
      if (isNaN(num)) {
        const newOverrides = { ...priceOverrides };
        delete newOverrides[productId];
        setPriceOverrides(newOverrides);
      } else {
        setPriceOverrides(prev => ({ ...prev, [productId]: num }));
      }
  };

  const handleExport = (platform: string = 'All') => {
    const headers = ['SKU', 'Master SKU', 'Name', 'Brand', 'Category', 'Subcategory', 'Current Price', 'Est. New Price', 'Stock', 'Velocity', 'Days Remaining', 'Status', 'Cost'];
    const rows = filteredProducts.map(p => {
        const simulatedPrice = getSimulatedPrice(p);
        const exportNewPrice = Math.abs(simulatedPrice - p.currentPrice) > 0.001 ? simulatedPrice.toFixed(2) : '';

        // Alias Logic
        let exportSku = p.sku;
        if (platform !== 'All') {
            const channel = p.channels.find(c => c.platform === platform);
            if (channel && channel.skuAlias) {
                exportSku = channel.skuAlias;
            }
        }

        return [
            exportSku,
            p.sku, // Keep Master SKU reference column
            `"${p.name.replace(/"/g, '""')}"`,
            p.brand || '',
            p.category || '',
            p.subcategory || '',
            p.currentPrice.toFixed(2),
            exportNewPrice,
            p.stockLevel,
            p.averageDailySales.toFixed(2),
            p.daysRemaining.toFixed(0),
            p.status,
            p.costPrice ? p.costPrice.toFixed(2) : '0.00'
        ];
    });

    const csvContent = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = platform === 'All' ? 'inventory_export_master.csv' : `inventory_export_${platform.toLowerCase().replace(/\s+/g, '_')}.csv`;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setIsExportMenuOpen(false);
  };

  const handleApply = () => {
    const newOverrides = { ...priceOverrides };
    let hasChanges = false;

    filteredProducts.forEach(p => {
        const simulatedPrice = getSimulatedPrice(p);
        const isOverridden = priceOverrides[p.id] !== undefined;
        let finalPrice = simulatedPrice;
        
        if (!isOverridden) {
            if (Math.abs(simulatedPrice - p.currentPrice) > 0.001) {
                finalPrice = Math.ceil(simulatedPrice) - 0.01;
                if (finalPrice < 0) finalPrice = 0.99;
            } else {
                finalPrice = p.currentPrice;
            }
        }

        if (Math.abs(finalPrice - p.currentPrice) > 0.001) {
            newOverrides[p.id] = Number(finalPrice.toFixed(2));
            hasChanges = true;
        }
    });

    if (hasChanges || Object.keys(priceOverrides).length > 0) {
        setPriceOverrides(newOverrides);
        setAdjustmentIntensity(0);
        setIsConfirmed(true);
        setShowSuccessMessage(true);
        setTimeout(() => setShowSuccessMessage(false), 2000);
    } else {
        alert("No changes detected to confirm.");
    }
  };

  const changedCount = useMemo(() => {
     let count = 0;
     filteredProducts.forEach(p => {
         const final = getSimulatedPrice(p);
         if (Math.abs(final - p.currentPrice) > 0.001) count++;
     });
     return count;
  }, [filteredProducts, priceOverrides, adjustmentIntensity, allowOutOfStockAdjustment]);

  const getRunwayBin = (days: number, stockLevel: number) => {
      if (stockLevel <= 0) return { label: 'Out of Stock', color: 'bg-slate-100 text-slate-500 border-slate-200' };
      if (days <= 14) return { label: '2 Weeks', color: 'bg-red-100 text-red-800 border-red-200' };
      if (days <= 28) return { label: '4 Weeks', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      if (days <= 84) return { label: '12 Weeks', color: 'bg-green-100 text-green-800 border-green-200' };
      if (days <= 168) return { label: '24 Weeks', color: 'bg-teal-100 text-teal-800 border-teal-200' };
      return { label: '24 Weeks +', color: 'bg-blue-100 text-blue-800 border-blue-200' };
  };

  const SortHeader = ({ label, sortKey, alignRight = false, subLabel, width }: { label: string, sortKey: SortKey, alignRight?: boolean, subLabel?: string, width?: string }) => {
    const isActive = sortConfig?.key === sortKey;
    return (
      <th 
        className={`p-2.5 font-semibold cursor-pointer select-none hover:bg-gray-100 transition-colors ${alignRight ? 'text-right' : 'text-left'} ${width || ''}`}
        onClick={() => handleSort(sortKey)}
      >
        <div className={`flex flex-col ${alignRight ? 'items-end' : 'items-start'}`}>
            <div className={`flex items-center gap-1`}>
            {label}
            <div className="flex flex-col">
                {isActive ? (
                sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3" style={{ color: themeColor }} /> : <ChevronDown className="w-3 h-3" style={{ color: themeColor }} />
                ) : (
                <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50" />
                )}
            </div>
            </div>
            {subLabel && (
                <span className="text-[10px] text-gray-400 font-mono font-normal mt-0.5 whitespace-nowrap">{subLabel}</span>
            )}
        </div>
      </th>
    );
  };

  const isContextFiltered = platformFilter !== 'All' || managerFilter !== 'All';
  const isButtonDisabled = showSuccessMessage || (isConfirmed && changedCount > 0) || (changedCount === 0 && Object.keys(priceOverrides).length === 0);

  return (
    <div className="space-y-4">
      
      {/* Simulation & Action Bar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col xl:flex-row items-center justify-between gap-4 relative overflow-hidden">
          
          <div className="flex items-center gap-6 w-full xl:w-auto">
              <div className="flex items-center gap-2">
                 <TrendingUp className="w-5 h-5" style={{ color: themeColor }} />
                 <span className="text-sm font-bold text-gray-700 whitespace-nowrap">Bulk Simulator</span>
              </div>
              
              <div className="flex items-center gap-4 flex-1">
                  <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Adjustment Intensity (%):</span>
                  <div className="flex items-center gap-3">
                      <div className="relative">
                        <input
                            type="number"
                            min="0"
                            max="50"
                            value={adjustmentIntensity}
                            onChange={(e) => handleIntensityChange(Number(e.target.value))}
                            className="w-16 pl-2 pr-1 py-1 border border-gray-300 rounded text-sm font-mono focus:ring-2 focus:ring-opacity-50"
                            style={{ borderColor: adjustmentIntensity > 0 ? themeColor : undefined }}
                        />
                      </div>
                      <input 
                        type="range" 
                        min="0" 
                        max="50" 
                        step="1"
                        value={adjustmentIntensity}
                        onChange={(e) => handleIntensityChange(Number(e.target.value))}
                        className="w-32 md:w-48 h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                        style={{ accentColor: themeColor }}
                      />
                  </div>
              </div>

              <div className="flex items-center gap-2 border-l border-gray-200 pl-4">
                  <button 
                    onClick={() => { setAllowOutOfStockAdjustment(!allowOutOfStockAdjustment); setIsConfirmed(false); }}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none`}
                    style={{ backgroundColor: allowOutOfStockAdjustment ? themeColor : '#e5e7eb' }}
                  >
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${allowOutOfStockAdjustment ? 'translate-x-5' : 'translate-x-1'}`} />
                  </button>
                  <span 
                    className={`text-xs font-medium cursor-pointer select-none`} 
                    style={{ color: allowOutOfStockAdjustment ? themeColor : '#6b7280' }}
                    onClick={() => { setAllowOutOfStockAdjustment(!allowOutOfStockAdjustment); setIsConfirmed(false); }}
                  >
                      Include Out of Stock
                  </span>
              </div>

              <button 
                onClick={handleApply}
                disabled={isButtonDisabled}
                className={`px-4 py-1.5 text-sm font-medium rounded-lg shadow flex items-center gap-1.5 transition-all duration-200 min-w-[120px] justify-center text-white`}
                style={{ 
                    backgroundColor: showSuccessMessage ? '#10b981' : isButtonDisabled ? '#f3f4f6' : themeColor,
                    color: isButtonDisabled ? '#9ca3af' : '#ffffff',
                    cursor: isButtonDisabled ? 'not-allowed' : 'pointer'
                }}
              >
                  {showSuccessMessage ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        Saved
                      </>
                  ) : isConfirmed && changedCount > 0 ? (
                      <>
                        <CheckCircle className="w-3.5 h-3.5" />
                        Confirmed
                      </>
                  ) : (
                      <>
                        <Save className="w-3.5 h-3.5" />
                        Confirm {changedCount > 0 && `(${changedCount})`}
                      </>
                  )}
              </button>
          </div>

          <div className="w-full xl:w-auto flex justify-end relative">
              <button 
                  onClick={() => setIsExportMenuOpen(!isExportMenuOpen)}
                  className="px-4 py-1.5 bg-white border border-gray-300 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 flex items-center gap-1.5 transition-colors"
              >
                  <Download className="w-3.5 h-3.5" />
                  Export List
                  <ChevronDown className="w-3 h-3 text-gray-400" />
              </button>

              {isExportMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-10" onClick={() => setIsExportMenuOpen(false)}></div>
                    <div className="absolute right-0 top-full mt-2 w-56 bg-white rounded-lg shadow-xl border border-gray-100 z-20 py-1 animate-in fade-in slide-in-from-top-2 duration-200">
                        <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider border-b border-gray-50">Select Format</div>
                        <button 
                            onClick={() => handleExport('All')}
                            className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between group"
                        >
                            Standard (Master SKUs)
                            <ArrowRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-600" />
                        </button>
                        <div className="border-t border-gray-50"></div>
                        <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Export for Platform</div>
                        {uniquePlatforms.map(platform => (
                             <button 
                                key={platform}
                                onClick={() => handleExport(platform)}
                                className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between"
                             >
                                {platform}
                                <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">Alias</span>
                             </button>
                        ))}
                        {uniquePlatforms.length === 0 && (
                            <div className="px-4 py-2 text-xs text-gray-400 italic">No platforms detected</div>
                        )}
                    </div>
                  </>
              )}
          </div>
      </div>

      {/* Filters Toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
        <div className="flex flex-col xl:flex-row gap-4 p-4">
            <div className="flex-1 relative min-w-[250px]">
                <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                <input 
                    type="text" 
                    placeholder="Search SKU or Product Name..." 
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50"
                    style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                />
            </div>
            
            <div className="flex flex-wrap gap-3">
                 {/* Brand Filter */}
                 <div className="relative min-w-[140px]">
                    <span className="absolute left-3 top-2.5 text-gray-500 text-xs font-bold uppercase tracking-wider z-10 pointer-events-none">Brand</span>
                    <select 
                        value={brandFilter}
                        onChange={(e) => { setBrandFilter(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-16 pr-8 py-2 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-opacity-50 font-medium text-gray-900 cursor-pointer hover:bg-gray-50 text-sm"
                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                    >
                        <option value="All">All</option>
                        {uniqueBrands.map(b => (
                            <option key={b} value={b}>{b}</option>
                        ))}
                    </select>
                    <Tag className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Main Category Filter */}
                 <div className="relative min-w-[140px]">
                    <span className="absolute left-3 top-2.5 text-gray-500 text-xs font-bold uppercase tracking-wider z-10 pointer-events-none">Category</span>
                    <select 
                        value={mainCatFilter}
                        onChange={(e) => { setMainCatFilter(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-20 pr-8 py-2 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-opacity-50 font-medium text-gray-900 cursor-pointer hover:bg-gray-50 text-sm"
                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                    >
                        <option value="All">All</option>
                        {uniqueMainCats.map(c => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                    </select>
                    <Layers className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Status Filter */}
                <div className="relative min-w-[160px]">
                    <span className="absolute left-3 top-2.5 text-gray-500 text-xs font-bold uppercase tracking-wider z-10 pointer-events-none">Status</span>
                    <select 
                        value={statusFilter}
                        onChange={(e) => { setStatusFilter(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-16 pr-8 py-2 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-2 focus:ring-opacity-50 font-medium text-gray-900 cursor-pointer hover:bg-gray-50 text-sm"
                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                    >
                        <option value="All">All</option>
                        <option value="Critical">Critical</option>
                        <option value="Overstock">Overstock</option>
                        <option value="Healthy">Healthy</option>
                    </select>
                    <Filter className="absolute right-3 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Advanced Filter Toggle */}
                <button
                    onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                    className={`px-3 py-2 border rounded-lg flex items-center gap-2 text-sm font-medium transition-colors`}
                    style={{ 
                        backgroundColor: showAdvancedFilters ? `${themeColor}10` : '#ffffff',
                        borderColor: showAdvancedFilters ? themeColor : '#d1d5db',
                        color: showAdvancedFilters ? themeColor : '#4b5563'
                    }}
                >
                    <SlidersHorizontal className="w-4 h-4" />
                </button>
            </div>
        </div>

        {/* Collapsible Advanced Filters */}
        {showAdvancedFilters && (
            <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50 rounded-b-xl animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-4">
                     {/* Platform Filter (Moved to Advanced to save space) */}
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-500 text-xs font-bold uppercase tracking-wider z-10 pointer-events-none">Platform</span>
                        <select 
                            value={platformFilter}
                            onChange={(e) => { setPlatformFilter(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-20 pr-8 py-2 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-1 focus:ring-indigo-500 text-sm"
                        >
                            <option value="All">All</option>
                            {uniquePlatforms.map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>

                    {/* Manager Filter */}
                    <div className="relative">
                        <span className="absolute left-3 top-2.5 text-gray-500 text-xs font-bold uppercase tracking-wider z-10 pointer-events-none">Manager</span>
                        <select 
                            value={managerFilter}
                            onChange={(e) => { setManagerFilter(e.target.value); setCurrentPage(1); }}
                            className="w-full pl-20 pr-8 py-2 border border-gray-300 rounded-lg appearance-none bg-white focus:ring-1 focus:ring-indigo-500 text-sm"
                        >
                            <option value="All">All</option>
                            {uniqueManagers.map(m => <option key={m} value={m}>{m}</option>)}
                        </select>
                    </div>

                    {/* Velocity Filter */}
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-500 uppercase">Velocity</span>
                        <input
                            type="number"
                            min="0"
                            placeholder="Min"
                            value={velocityFilter.min}
                            onChange={(e) => setVelocityFilter(prev => ({ ...prev, min: e.target.value }))}
                            className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                        <span className="text-gray-400">-</span>
                        <input
                            type="number"
                            min="0"
                            placeholder="Max"
                            value={velocityFilter.max}
                            onChange={(e) => setVelocityFilter(prev => ({ ...prev, max: e.target.value }))}
                            className="w-20 px-2 py-1.5 border border-gray-300 rounded text-sm"
                        />
                    </div>

                    {/* Show Inactive (Ghost) Products Toggle */}
                    <div className="flex items-center justify-between p-2 border border-gray-200 rounded-lg bg-white">
                        <span className="text-xs font-bold text-gray-500 uppercase">Show Inactive (No Stock/Sales)</span>
                        <button 
                            onClick={() => setShowInactive(!showInactive)}
                            className="text-gray-500 hover:text-indigo-600 focus:outline-none"
                            style={{ color: showInactive ? themeColor : undefined }}
                        >
                            {showInactive ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                        </button>
                    </div>
                </div>
            </div>
        )}
      </div>
      
      {isContextFiltered && (
          <div 
             className="flex items-center gap-2 px-4 py-2 rounded-lg border text-sm animate-in fade-in slide-in-from-top-2"
             style={{ backgroundColor: `${themeColor}10`, borderColor: `${themeColor}30`, color: themeColor }}
          >
             <Info className="w-4 h-4" />
             <span>
                Showing data aggregated for 
                {platformFilter !== 'All' && <strong> {platformFilter} </strong>}
                {platformFilter !== 'All' && managerFilter !== 'All' && <span>and</span>}
                {managerFilter !== 'All' && <strong> {managerFilter} </strong>}
                only. Prices are recalculated weighted averages for this selection.
             </span>
          </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-xs uppercase tracking-wider text-gray-500">
                <SortHeader label="Product" sortKey="sku" />
                <SortHeader label="Optimal Ref." sortKey="optimalPrice" alignRight width="w-[100px]" />
                <SortHeader label="Last Week Price" sortKey="oldPrice" alignRight subLabel={dateLabels?.last} width="w-[120px]" />
                <SortHeader label={isContextFiltered ? "Cur. Price (Filt.)" : "Current Price"} sortKey="currentPrice" alignRight subLabel={dateLabels?.current} width="w-[120px]" />
                <SortHeader label="Est. New Price" sortKey="estNewPrice" alignRight width="w-[120px]" />
                <SortHeader label={isContextFiltered ? "Runway (Filtered)" : "Runway"} sortKey="daysRemaining" alignRight width="min-w-[140px]" />
                <SortHeader label={isContextFiltered ? "Rec. (Filtered)" : "Recommendation"} sortKey="status" width="w-[150px]" />
                <th className="p-4 font-semibold text-right w-12"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {paginatedProducts.map((product) => {
                const isCritical = product.status === 'Critical';
                const isOverstock = product.status === 'Overstock';
                const isOOS = product.recommendation === 'Out of Stock';
                const overrideValue = priceOverrides[product.id];
                const simulatedPrice = getSimulatedPrice(product);
                const displayValue = simulatedPrice;
                const isModified = Math.abs(displayValue - product.currentPrice) > 0.001;
                const isOverridden = overrideValue !== undefined;
                const violatesFloor = product.floorPrice && displayValue < product.floorPrice;
                const violatesCeiling = product.ceilingPrice && displayValue > product.ceilingPrice;
                const isViolation = violatesFloor || violatesCeiling;
                const runwayBin = getRunwayBin(product.daysRemaining, product.stockLevel);

                return (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors group text-sm">
                    <td className="p-2.5">
                      <div>
                        <div className="font-bold text-gray-900 font-mono">{product.sku}</div>
                        <div className="text-gray-900 font-medium text-xs mt-0.5 truncate max-w-[200px]" title={product.name}>{product.name}</div>
                        <div className="flex gap-2 mt-1">
                            {/* REMOVED BRAND TAG AS REQUESTED */}
                            {product.category && (
                                <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">{product.category}</span>
                            )}
                        </div>
                      </div>
                    </td>
                    <td className="p-2.5 text-right">
                       {product.optimalPrice ? (
                           <div className="flex items-center justify-end gap-1 font-bold" style={{ color: themeColor }} title="Based on historical margin & velocity performance">
                               <Star className="w-3 h-3" style={{ fill: `${themeColor}20` }} />
                               £{product.optimalPrice.toFixed(2)}
                           </div>
                       ) : (
                           <span className="text-gray-300">-</span>
                       )}
                    </td>
                    <td className="p-2.5 text-right">
                       <div className="text-gray-400 font-medium">
                         {product.oldPrice ? `£${product.oldPrice.toFixed(2)}` : '-'}
                       </div>
                    </td>
                    <td className="p-2.5 text-right">
                       <div className="font-bold text-gray-900">£{product.currentPrice.toFixed(2)}</div>
                    </td>
                    <td className="p-2.5 text-right">
                       <div className="flex items-center justify-end gap-2 relative">
                          <input 
                            type="number"
                            step="0.01"
                            value={isModified || isOverridden ? displayValue : ''}
                            placeholder="-"
                            disabled={isOOS && !allowOutOfStockAdjustment && !isOverridden}
                            onChange={(e) => handleOverrideChange(product.id, e.target.value)}
                            className={`w-24 text-right px-2 py-1 border rounded text-sm font-mono focus:ring-2 transition-colors ${
                                isViolation 
                                  ? 'border-red-500 bg-red-50 text-red-700 font-bold ring-1 ring-red-500'
                                  : isOverridden 
                                    ? 'bg-opacity-10 text-opacity-100 font-bold' 
                                    : isModified 
                                      ? 'border-gray-300 text-gray-900 bg-white' 
                                      : 'border-transparent bg-transparent text-gray-400 hover:border-gray-200 placeholder-gray-300'
                            } ${isOOS && !allowOutOfStockAdjustment && !isOverridden ? 'opacity-50 cursor-not-allowed bg-gray-100' : ''}`}
                            style={isOverridden && !isViolation ? { borderColor: themeColor, backgroundColor: `${themeColor}10`, color: themeColor } : {}}
                          />
                          {isViolation && (
                              <div className="absolute -right-5 top-1/2 -translate-y-1/2 group/violation">
                                  <AlertCircle className="w-4 h-4 text-red-500" />
                              </div>
                          )}
                          {!isOverridden && isModified && !isViolation && (
                             <div className="absolute -right-4 top-1/2 -translate-y-1/2">
                                {displayValue > product.currentPrice ? (
                                    <TrendingUp className="w-3 h-3 text-green-500" />
                                ) : (
                                    <TrendingDown className="w-3 h-3 text-red-500" />
                                )}
                             </div>
                          )}
                          {isOverridden && !isViolation && (
                              <button 
                                onClick={() => {
                                    const newOverrides = { ...priceOverrides };
                                    delete newOverrides[product.id];
                                    setPriceOverrides(newOverrides);
                                }}
                                className="absolute -right-6 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                              >
                                  <RotateCcw className="w-3 h-3" />
                              </button>
                          )}
                       </div>
                    </td>
                    <td className="p-2.5 text-right">
                      <div className="flex flex-col items-end gap-1.5">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded border text-xs font-bold whitespace-nowrap ${runwayBin.color}`}>
                          {runwayBin.label}
                        </span>
                        <span className="text-xs font-semibold text-gray-700">
                            {product.averageDailySales.toFixed(1)} / day
                        </span>
                      </div>
                    </td>
                    <td 
                        className="p-2.5 cursor-help"
                        onMouseEnter={(e) => handleMouseEnter(product.id, e)}
                        onMouseLeave={handleMouseLeave}
                    >
                        <div className={`flex items-center gap-2 font-semibold ${
                            isOOS ? 'text-gray-500' :
                            product.status === 'Critical' ? 'text-red-600' :
                            product.status === 'Overstock' ? 'text-orange-600' : 'text-green-600'
                        }`}>
                            {isOOS && <AlertCircle className="w-4 h-4" />}
                            {!isOOS && product.status === 'Critical' && <TrendingUp className="w-4 h-4" />}
                            {!isOOS && product.status === 'Overstock' && <TrendingDown className="w-4 h-4" />}
                            {!isOOS && product.status === 'Healthy' && <CheckCircle className="w-4 h-4" />}
                            <span className="border-b border-dashed border-current pb-0.5">{product.recommendation}</span>
                        </div>
                    </td>
                    <td className="p-2.5 text-right">
                      <button 
                        onClick={() => onAnalyze(product)}
                        className="text-gray-400 hover:text-indigo-600 transition-colors"
                        style={{ ':hover': { color: themeColor } } as React.CSSProperties}
                      >
                        <Activity className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredProducts.length === 0 && (
                  <tr>
                      <td colSpan={8} className="p-8 text-center text-gray-500">
                          No products found matching your filters.
                      </td>
                  </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Footer */}
        {filteredProducts.length > 0 && (
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between sm:px-6">
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

const RecommendationTooltip = ({ product, rect }: { product: Product; rect: DOMRect }) => {
    const style: React.CSSProperties = {
        position: 'fixed',
        top: `${rect.top - 8}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translate(-50%, -100%)',
        zIndex: 9999,
    };
    const runway = product.averageDailySales > 0 ? product.stockLevel / product.averageDailySales : 999;
    const leadTime = product.leadTimeDays;
    
    let triggerFormula = "";
    let reason = "";
    let colorClass = "text-green-300";

    if (product.recommendation === 'Out of Stock') {
        triggerFormula = `Stock (${product.stockLevel}) <= 0`;
        reason = "Inventory is completely depleted.";
        colorClass = "text-gray-300";
    } else if (product.status === 'Critical') {
        triggerFormula = `Runway (${runway.toFixed(1)}d) < Lead Time (${leadTime}d)`;
        reason = "Stock will run out before replenishment arrives.";
        colorClass = "text-red-300";
    } else if (product.status === 'Overstock') {
        triggerFormula = `Runway (${runway.toFixed(1)}d) > 4x Lead Time (${leadTime * 4}d)`;
        reason = "Holding too much inventory relative to sales velocity.";
        colorClass = "text-orange-300";
    } else {
        triggerFormula = `Lead Time ≤ Runway ≤ 4x Lead Time`;
        reason = "Supply meets demand within optimal range.";
    }

    return createPortal(
        <div style={style} className="pointer-events-none">
            <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl w-72 border border-slate-700 animate-in fade-in zoom-in duration-200">
                <div className="flex items-center justify-between mb-3 border-b border-slate-700 pb-2">
                    <span className="font-bold text-sm">Logic Breakdown</span>
                    <span className={`text-xs font-mono px-1.5 py-0.5 rounded bg-white/10 ${colorClass}`}>{product.recommendation === 'Out of Stock' ? 'OOS' : product.status}</span>
                </div>
                
                <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-2 gap-2 text-slate-400">
                        <span>Total Stock:</span>
                        <span className="text-right text-white font-mono">{product.stockLevel} units</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-slate-400">
                        <span>Filtered Velocity:</span>
                        <span className="text-right text-white font-mono">{product.averageDailySales.toFixed(1)} /day</span>
                    </div>
                    
                    <div className="mt-2 pt-2 border-t border-slate-700">
                         <div className="flex justify-between items-center mb-1">
                            <span className="text-indigo-300 font-semibold">Calculated Runway:</span>
                            <span className="font-mono text-indigo-300">{product.recommendation === 'Out of Stock' ? '0' : runway.toFixed(1)} days</span>
                         </div>
                         <div className="bg-slate-800 p-2 rounded border border-slate-600 font-mono text-[10px] text-center mb-2">
                             {triggerFormula}
                         </div>
                         <p className="text-slate-400 italic leading-relaxed">
                            "{reason}"
                         </p>
                    </div>
                </div>
                
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-8 border-transparent border-t-slate-700"></div>
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[2px] border-8 border-transparent border-t-slate-900"></div>
            </div>
        </div>,
        document.body
    );
};

export default ProductList;
