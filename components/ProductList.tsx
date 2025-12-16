
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Product } from '../types';
import { Activity, Search, Filter, AlertCircle, CheckCircle, TrendingUp, TrendingDown, ChevronLeft, ChevronRight, Download, ArrowRight, Save, RotateCcw, ArrowUpDown, ChevronUp, ChevronDown, SlidersHorizontal, Clock, Star, EyeOff, Eye, X, Layers, Tag, Info, GitMerge, User, Globe } from 'lucide-react';

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
  const [subCatFilter, setSubCatFilter] = useState('All');
  
  // Visibility Toggles
  const [showInactive, setShowInactive] = useState(false); // Toggle for "Ghost" products (0 stock, 0 sales)
  const [showOOS, setShowOOS] = useState(false); // Toggle for Out of Stock products (stock <= 0)

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

  const uniqueSubCats = useMemo(() => {
      let relevantProducts = products;
      if (mainCatFilter !== 'All') {
          relevantProducts = products.filter(p => p.category === mainCatFilter);
      }
      const subs = new Set(relevantProducts.map(p => p.subcategory).filter(Boolean) as string[]);
      return Array.from(subs).sort();
  }, [products, mainCatFilter]);

  const getSimulatedPrice = (product: Product): number => {
      if (priceOverrides[product.id] !== undefined) {
          return priceOverrides[product.id];
      }
      if (product.stockLevel <= 0 && !allowOutOfStockAdjustment) {
          return product.currentPrice;
      }
      let multiplier = 1;
      // Use the *displayed* status (Trend Aware) to decide if bulk adjustment applies
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
        // --- VISIBILITY LOGIC ---
        // 1. Ghost Products (Inactive)
        if (!showInactive && p.stockLevel <= 0 && p.averageDailySales === 0) {
            return { ...p, _isVisible: false };
        }
        // 2. Out of Stock (Active but 0 stock)
        // If showOOS is false, hide items with 0 stock (unless they are ghost items already handled above, this handles active OOS)
        if (!showOOS && p.stockLevel <= 0) {
             return { ...p, _isVisible: false };
        }

        const matchingChannels = p.channels.filter(c => {
             const matchPlatform = platformFilter === 'All' || c.platform === platformFilter;
             const matchManager = managerFilter === 'All' || c.manager === managerFilter;
             return matchPlatform && matchManager;
        });

        const isFiltering = platformFilter !== 'All' || managerFilter !== 'All';
        
        // Base metrics (Global or Filtered)
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
        
        // --- TREND AWARE RECOMMENDATION LOGIC ---
        // Calculate Deltas
        const priceChange = (p.oldPrice && p.oldPrice > 0) 
            ? (p.currentPrice - p.oldPrice) / p.oldPrice 
            : 0;
            
        const velocityChange = (p.previousDailySales && p.previousDailySales > 0)
            ? (p.averageDailySales - p.previousDailySales) / p.previousDailySales
            : 0;
        
        // Default Logic (Snapshot based)
        let displayStatus: 'Critical' | 'Warning' | 'Healthy' | 'Overstock' = 'Healthy';
        let displayRec = 'Maintain';

        if (stock <= 0) {
            displayStatus = 'Critical';
            displayRec = 'Out of Stock';
        } else if (displayRunway < leadTime) {
            // STOCK IS CRITICAL
            // Check Trend: Did we recently increase price (>3%) and did velocity drop (>20%)?
            if (priceChange > 0.03 && velocityChange < -0.20) {
                displayStatus = 'Warning'; // Downgrade from Critical
                displayRec = 'Monitor (Trend Effective)';
            } else {
                displayStatus = 'Critical';
                displayRec = 'Increase Price';
            }
        } else if (displayRunway > leadTime * 4) {
            // STOCK IS HIGH
            // Check Trend: Did we recently decrease price (<-3%) and did velocity rise (>20%)?
            if (priceChange < -0.03 && velocityChange > 0.20) {
                displayStatus = 'Warning'; // Downgrade from Overstock/Action needed
                displayRec = 'Monitor (Trend Effective)';
            } else {
                displayStatus = 'Overstock';
                displayRec = 'Decrease Price';
            }
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
            recommendation: displayRec,
            _trendData: {
                priceChange,
                velocityChange
            }
        };
    }).filter(p => p._isVisible); 

    let result = aggregatedData.filter(p => {
        const matchesSearch = p.sku.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              p.name.toLowerCase().includes(searchQuery.toLowerCase());
        
        const matchesStatus = statusFilter === 'All' || p.status === statusFilter;
        const matchesBrand = brandFilter === 'All' || p.brand === brandFilter;
        const matchesMainCat = mainCatFilter === 'All' || p.category === mainCatFilter;
        const matchesSubCat = subCatFilter === 'All' || p.subcategory === subCatFilter;
        
        const vel = p.averageDailySales;
        const matchesVelocityMin = velocityFilter.min === '' || vel >= parseFloat(velocityFilter.min);
        const matchesVelocityMax = velocityFilter.max === '' || vel <= parseFloat(velocityFilter.max);

        const runway = p.daysRemaining;
        const matchesRunwayMin = runwayFilter.min === '' || runway >= parseFloat(runwayFilter.min);
        const matchesRunwayMax = runwayFilter.max === '' || runway <= parseFloat(runwayFilter.max);

        return matchesSearch && matchesStatus && matchesBrand && matchesMainCat && matchesSubCat && matchesVelocityMin && matchesVelocityMax && matchesRunwayMin && matchesRunwayMax;
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
  }, [products, searchQuery, statusFilter, managerFilter, platformFilter, brandFilter, mainCatFilter, subCatFilter, sortConfig, priceOverrides, adjustmentIntensity, velocityFilter, runwayFilter, allowOutOfStockAdjustment, showInactive, showOOS]);

  useEffect(() => {
      setCurrentPage(1);
  }, [searchQuery, statusFilter, managerFilter, platformFilter, brandFilter, mainCatFilter, subCatFilter, showInactive, showOOS]);

  // Reset subcat filter if main cat changes
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
            p.sku, 
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
        onApplyChanges(Object.entries(newOverrides).map(([productId, newPrice]) => ({ productId, newPrice })));
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

              {/* Floating Modal for Export */}
              {isExportMenuOpen && createPortal(
                  <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm" onClick={() => setIsExportMenuOpen(false)}>
                    <div 
                        className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200"
                        onClick={e => e.stopPropagation()} // Prevent close on modal click
                    >
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                            <h3 className="font-bold text-gray-900">Export Options</h3>
                            <button onClick={() => setIsExportMenuOpen(false)} className="p-1 hover:bg-gray-200 rounded-full transition-colors">
                                <X className="w-4 h-4 text-gray-500" />
                            </button>
                        </div>
                        
                        <div className="p-2">
                            <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Select Format</div>
                            <button 
                                onClick={() => handleExport('All')}
                                className="w-full text-left px-4 py-3 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between group rounded-lg transition-colors"
                            >
                                <span className="font-medium">Standard (Master SKUs)</span>
                                <ArrowRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600" />
                            </button>
                            
                            <div className="my-2 border-t border-gray-100"></div>
                            
                            <div className="px-3 py-2 text-xs font-bold text-gray-400 uppercase tracking-wider">Export for Platform</div>
                            <div className="max-h-60 overflow-y-auto">
                                {uniquePlatforms.map(platform => (
                                    <button 
                                        key={platform}
                                        onClick={() => handleExport(platform)}
                                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 flex items-center justify-between rounded-lg transition-colors"
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

      {/* Filters Toolbar */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm flex flex-col">
          <div className="p-4 space-y-4">
            {/* Top Row: Search + Main Filters */}
            <div className="flex flex-col lg:flex-row gap-4">
                {/* Search - Flexible Width */}
                <div className="flex-1 relative min-w-[250px]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Search SKU or Product Name..." 
                        value={searchQuery}
                        onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                        className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50 text-sm"
                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
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
                            backgroundColor: showAdvancedFilters ? `${themeColor}10` : '#ffffff',
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
            <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50 rounded-b-xl animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="flex flex-col lg:flex-row gap-4 pt-4 items-start lg:items-center">
                     
                     {/* Row 2 Filters */}
                     <div className="flex flex-wrap gap-3 flex-1">
                        <FilterDropdown 
                            label="Platform" 
                            icon={Globe} 
                            value={platformFilter} 
                            onChange={(e: any) => { setPlatformFilter(e.target.value); setCurrentPage(1); }} 
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
                            className={`flex items-center justify-between gap-3 px-3 py-2 border rounded-lg text-sm font-medium transition-colors bg-white hover:bg-gray-50 ${showOOS ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600'}`}
                            style={showOOS ? { borderColor: themeColor, backgroundColor: `${themeColor}10`, color: themeColor } : {}}
                        >
                            <span className="text-xs font-bold uppercase">Show Out of Stock</span>
                            {showOOS ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>

                        {/* Show Inactive (Ghost) Toggle */}
                        <button 
                            onClick={() => setShowInactive(!showInactive)}
                            className={`flex items-center justify-between gap-3 px-3 py-2 border rounded-lg text-sm font-medium transition-colors bg-white hover:bg-gray-50 ${showInactive ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600'}`}
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
                // Determine if we should be alarmed
                const isCritical = product.status === 'Critical';
                const isOverstock = product.status === 'Overstock';
                const isOOS = product.recommendation === 'Out of Stock';
                const isMonitoring = product.status === 'Warning' && product.recommendation.includes('Monitor');

                const overrideValue = priceOverrides[product.id];
                const simulatedPrice = getSimulatedPrice(product);
                const displayValue = simulatedPrice;
                const isModified = Math.abs(displayValue - product.currentPrice) > 0.001;
                const isOverridden = overrideValue !== undefined;
                const violatesFloor = product.floorPrice && displayValue < product.floorPrice;
                const violatesCeiling = product.ceilingPrice && displayValue > product.ceilingPrice;
                const isViolation = violatesFloor || violatesCeiling;
                const runwayBin = getRunwayBin(product.daysRemaining, product.stockLevel);

                // --- Low Stock Tag Logic ---
                const isLowStock = product.stockLevel <= 10 && product.stockLevel > 0;

                return (
                  <tr key={product.id} className="hover:bg-gray-50 transition-colors group text-sm">
                    <td className="p-2.5">
                      <div>
                        <div className="font-bold text-gray-900 font-mono">{product.sku}</div>
                        <div className="text-gray-900 font-medium text-xs mt-0.5 truncate max-w-[200px]" title={product.name}>{product.name}</div>
                        <div className="flex gap-2 mt-1">
                            {product.subcategory && (
                                <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">{product.subcategory}</span>
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
                        <div className="flex items-center gap-1">
                             {/* Trend Indicator for Velocity */}
                             {(product as any)._trendData?.velocityChange < -0.2 && <TrendingDown className="w-3 h-3 text-red-400" />}
                             {(product as any)._trendData?.velocityChange > 0.2 && <TrendingUp className="w-3 h-3 text-green-400" />}
                             <span className="text-xs font-semibold text-gray-700">
                                {product.averageDailySales.toFixed(1)} / day
                             </span>
                        </div>
                      </div>
                    </td>
                    <td 
                        className="p-2.5 cursor-help"
                        onMouseEnter={(e) => handleMouseEnter(product.id, e)}
                        onMouseLeave={handleMouseLeave}
                    >
                        <div className="flex flex-col gap-1">
                            <div className={`flex items-center gap-2 font-semibold ${
                                isOOS ? 'text-gray-500' :
                                isMonitoring ? 'text-blue-600' :
                                product.status === 'Critical' ? 'text-red-600' :
                                product.status === 'Overstock' ? 'text-orange-600' : 'text-green-600'
                            }`}>
                                {isOOS && <AlertCircle className="w-4 h-4" />}
                                {isMonitoring && <Clock className="w-4 h-4" />}
                                {!isOOS && !isMonitoring && product.status === 'Critical' && <TrendingUp className="w-4 h-4" />}
                                {!isOOS && !isMonitoring && product.status === 'Overstock' && <TrendingDown className="w-4 h-4" />}
                                {!isOOS && !isMonitoring && product.status === 'Healthy' && <CheckCircle className="w-4 h-4" />}
                                
                                <span className="border-b border-dashed border-current pb-0.5 text-xs">
                                    {product.recommendation}
                                </span>
                            </div>
                            
                            {/* Low Stock Tag */}
                            {isLowStock && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-600 border border-red-200 self-start ml-6">
                                    Low Stock ({product.stockLevel})
                                </span>
                            )}
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
    
    // Trend Data (Accessing dynamic prop added in render loop)
    const trendData = (product as any)._trendData || { priceChange: 0, velocityChange: 0 };
    const priceChangePct = (trendData.priceChange * 100).toFixed(1);
    const velocityChangePct = (trendData.velocityChange * 100).toFixed(1);
    
    let triggerFormula = "";
    let reason = "";
    let colorClass = "text-green-300";

    if (product.recommendation === 'Out of Stock') {
        triggerFormula = `Stock (${product.stockLevel}) <= 0`;
        reason = "Inventory is completely depleted.";
        colorClass = "text-gray-300";
    } else if (product.recommendation.includes('Monitor')) {
        colorClass = "text-blue-300";
        if (product.status === 'Warning' && runway < leadTime) {
             // Critical Stock but Monitoring
             triggerFormula = `Runway < Lead Time BUT Trend Effective`;
             reason = `Price increased by ${priceChangePct}% and velocity dropped by ${Math.abs(Number(velocityChangePct))}% (>20%). Strategy working.`;
        } else {
             // Overstock but Monitoring
             triggerFormula = `Runway > 4x Lead Time BUT Trend Effective`;
             reason = `Price decreased by ${Math.abs(Number(priceChangePct))}% and velocity rose by ${velocityChangePct}% (>20%). Strategy working.`;
        }
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
            <div className="bg-slate-900 text-white p-4 rounded-xl shadow-2xl w-80 border border-slate-700 animate-in fade-in zoom-in duration-200">
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
                        <span>Current Velocity:</span>
                        <span className="text-right text-white font-mono">{product.averageDailySales.toFixed(1)} /day</span>
                    </div>
                    {product.previousDailySales !== undefined && (
                         <div className="grid grid-cols-2 gap-2 text-slate-400">
                            <span>Previous Velocity:</span>
                            <span className="text-right text-gray-400 font-mono">{product.previousDailySales.toFixed(1)} /day</span>
                        </div>
                    )}
                    
                    <div className="mt-2 pt-2 border-t border-slate-700">
                         <div className="flex justify-between items-center mb-1">
                            <span className="text-indigo-300 font-semibold">Calculated Runway:</span>
                            <span className="font-mono text-indigo-300">{product.recommendation === 'Out of Stock' ? '0' : runway.toFixed(1)} days</span>
                         </div>
                         <div className="bg-slate-800 p-2 rounded border border-slate-600 font-mono text-[10px] text-center mb-2 leading-tight">
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
