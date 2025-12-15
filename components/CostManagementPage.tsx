
import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Product, FeeBounds } from '../types';
import { Search, Save, Upload, ArrowUpDown, ChevronUp, ChevronDown, ChevronLeft, ChevronRight, AlertCircle, Info, Download, X, CheckSquare, Square } from 'lucide-react';

interface CostUpdate {
  sku: string;
  costPrice?: number;
  floorPrice?: number;
  ceilingPrice?: number;
}

interface CostManagementPageProps {
  products: Product[];
  onUpdateCosts: (updates: CostUpdate[]) => void;
  onOpenUpload: () => void;
}

type SortKey = keyof Product | 'margin';

const CostManagementPage: React.FC<CostManagementPageProps> = ({ products, onUpdateCosts, onOpenUpload }) => {
  const [search, setSearch] = useState('');
  const [editedCosts, setEditedCosts] = useState<Record<string, Partial<CostUpdate>>>({});
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; direction: 'asc' | 'desc' } | null>(null);
  
  // Tooltip State
  const [hoveredFee, setHoveredFee] = useState<{ 
      rect: DOMRect; 
      value: number; 
      bounds: FeeBounds; 
      isOutlier: boolean 
  } | null>(null);

  // Modal State
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const handleInputChange = (sku: string, field: keyof Omit<CostUpdate, 'sku'>, val: string) => {
      const num = parseFloat(val);
      setEditedCosts(prev => {
          const currentItem = prev[sku];
          return {
              ...prev,
              [sku]: {
                  ...(currentItem || {}),
                  [field]: isNaN(num) ? 0 : num
              }
          };
      });
  };

  const handleSave = () => {
      const updates = Object.entries(editedCosts).map(([sku, changes]) => {
          const changeObj = changes ?? {};
          return {
            sku,
            ...changeObj
          };
      });
      onUpdateCosts(updates as CostUpdate[]);
      setEditedCosts({});
      alert("Costs and limits updated successfully.");
  };

  const getTotalCost = (product: Product, edits: Partial<CostUpdate> = {}) => {
      const cogs = edits.costPrice !== undefined ? edits.costPrice : (product.costPrice || 0);
      
      const selling = product.sellingFee || 0;
      const ads = product.adsFee || 0;
      const post = product.postage || 0;
      // Extra freight is Income, so excluded from Cost here. It is handled in Net Calc.
      const other = product.otherFee || 0;
      const sub = product.subscriptionFee || 0;
      const wms = product.wmsFee || 0;
      
      return cogs + selling + ads + post + other + sub + wms;
  };

  const getMargin = (product: Product, edits: Partial<CostUpdate> = {}) => {
      const totalCost = getTotalCost(product, edits);
      // Net = (Price + ExtraFreight) - TotalCost
      const net = (product.currentPrice + (product.extraFreight || 0)) - totalCost;
      
      if (product.currentPrice <= 0) return -100;
      return (net / product.currentPrice) * 100;
  };

  const handleSort = (key: SortKey) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const filteredAndSorted = useMemo(() => {
    let result = products.filter(p => 
        p.sku.toLowerCase().includes(search.toLowerCase()) || 
        p.name.toLowerCase().includes(search.toLowerCase())
    );

    if (sortConfig) {
        result.sort((a, b) => {
            let aValue: any = a[sortConfig.key as keyof Product];
            let bValue: any = b[sortConfig.key as keyof Product];

            if (sortConfig.key === 'margin') {
                aValue = getMargin(a);
                bValue = getMargin(b);
            }

            if (typeof aValue === 'string') aValue = aValue.toLowerCase();
            if (typeof bValue === 'string') bValue = bValue.toLowerCase();

            if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
            if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
            return 0;
        });
    }

    return result;
  }, [products, search, sortConfig]);

  // Reset pagination when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Calculate Pagination
  const totalPages = Math.ceil(filteredAndSorted.length / itemsPerPage);
  const paginatedProducts = filteredAndSorted.slice(
      (currentPage - 1) * itemsPerPage, 
      currentPage * itemsPerPage
  );

  const SortHeader = ({ label, sortKey, alignRight = false }: { label: string, sortKey: SortKey, alignRight?: boolean }) => {
    const isActive = sortConfig?.key === sortKey;
    return (
      <th 
        className={`p-3 sticky top-0 bg-gray-50 z-10 shadow-sm cursor-pointer hover:bg-gray-100 transition-colors select-none ${alignRight ? 'text-right' : 'text-left'}`}
        onClick={() => handleSort(sortKey)}
      >
        <div className={`flex items-center gap-1 ${alignRight ? 'justify-end' : 'justify-start'}`}>
          {label}
          <div className="flex flex-col">
             {isActive ? (
               sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
             ) : (
               <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50" />
             )}
          </div>
        </div>
      </th>
    );
  };

  const FeeCell = ({ value, bounds }: { value: number | undefined, bounds?: FeeBounds }) => {
      const val = value || 0;
      if (val === 0) return <span className="text-gray-300">-</span>;

      // Check if the average is significantly higher than the max bound (e.g., due to 0-qty cost rows)
      // We use a small buffer (1.05) to ignore floating point noise
      const isOutlier = bounds && bounds.max > 0 && val > (bounds.max * 1.05);

      const handleMouseEnter = (e: React.MouseEvent) => {
          if (bounds && (bounds.min > 0 || bounds.max > 0)) {
              setHoveredFee({
                  rect: e.currentTarget.getBoundingClientRect(),
                  value: val,
                  bounds,
                  isOutlier: !!isOutlier
              });
          }
      };

      const handleMouseLeave = () => {
          setHoveredFee(null);
      };

      return (
          <div 
            className="group cursor-help inline-block w-full h-full text-right"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
          >
              <div className="flex items-center justify-end gap-1">
                  {isOutlier && <Info className="w-3 h-3 text-indigo-400" />}
                  <span className={`font-mono ${isOutlier ? 'text-indigo-700 font-semibold' : 'text-gray-700'}`}>
                      {val.toFixed(2)}
                  </span>
              </div>
          </div>
      );
  };

  return (
    <div className="max-w-7xl mx-auto space-y-4">
       {/* Page Header */}
       <div className="flex justify-between items-center mb-2">
           <div>
               <h2 className="text-2xl font-bold text-gray-900">Cost & Fees Management</h2>
               <p className="text-gray-500 mt-1">Track comprehensive costs and set minimum/maximum price guardrails per SKU.</p>
           </div>
           <div className="flex items-center gap-3">
               <button 
                 onClick={() => setIsExportModalOpen(true)}
                 className="px-4 py-2 bg-white text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors"
               >
                   <Download className="w-4 h-4" />
                   Export
               </button>
               <button 
                 onClick={onOpenUpload}
                 className="px-4 py-2 bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg hover:bg-indigo-100 flex items-center gap-2 transition-colors"
               >
                   <Upload className="w-4 h-4" />
                   Import Manual Costs (CSV)
               </button>
           </div>
       </div>

       {/* Toolbar Bubble */}
       <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
           <div className="relative flex-1">
               <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
               <input 
                    type="text" 
                    placeholder="Search SKU..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
               />
           </div>
           {Object.keys(editedCosts).length > 0 && (
               <button 
                onClick={handleSave}
                className="px-6 py-2 bg-green-600 text-white rounded-lg shadow hover:bg-green-700 flex items-center gap-2 animate-in fade-in slide-in-from-right-2"
               >
                   <Save className="w-4 h-4" />
                   Save {Object.keys(editedCosts).length} Updates
               </button>
           )}
       </div>

       {/* Table Bubble */}
       <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
           <div className="overflow-x-auto max-h-[600px] overflow-y-auto relative">
               <table className="w-full text-left text-sm whitespace-nowrap">
                   <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                       <tr>
                           {/* Custom Sticky Header for Product Name handled manually for sticky behavior conflict with th component */}
                           <th 
                                className="p-3 sticky left-0 top-0 bg-gray-50 z-20 shadow-sm cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                onClick={() => handleSort('sku')}
                           >
                               <div className="flex items-center gap-1">
                                  Product
                                  {sortConfig?.key === 'sku' ? (
                                    sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                                  ) : <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50" />}
                               </div>
                           </th>

                           <SortHeader label="Sell Price" sortKey="currentPrice" alignRight />
                           <SortHeader label="COGS" sortKey="costPrice" alignRight />
                           <SortHeader label="Min" sortKey="floorPrice" alignRight />
                           <SortHeader label="Max" sortKey="ceilingPrice" alignRight />
                           
                           {/* Updated: Sticky Headers for Fee Columns */}
                           <th className="p-3 text-right min-w-[60px] text-xs bg-gray-50 sticky top-0 z-10 shadow-sm">Sell Fee</th>
                           <th className="p-3 text-right min-w-[60px] text-xs bg-gray-50 sticky top-0 z-10 shadow-sm">Ads</th>
                           <th className="p-3 text-right min-w-[60px] text-xs bg-gray-50 sticky top-0 z-10 shadow-sm">Post</th>
                           <th className="p-3 text-right min-w-[60px] text-xs bg-green-50 border-l border-green-100 text-green-700 font-semibold sticky top-0 z-10 shadow-sm" title="Income">Ex. Freight</th>
                           <th className="p-3 text-right min-w-[60px] text-xs bg-gray-50 border-l border-gray-100 sticky top-0 z-10 shadow-sm">Sub</th>
                           <th className="p-3 text-right min-w-[60px] text-xs bg-gray-50 sticky top-0 z-10 shadow-sm">WMS</th>
                           <th className="p-3 text-right min-w-[60px] text-xs bg-gray-50 sticky top-0 z-10 shadow-sm">Other</th>
                           
                           {/* Sticky Right Margin Column */}
                           <th 
                                className="p-3 text-right sticky right-0 top-0 bg-gray-50 z-20 shadow-sm cursor-pointer hover:bg-gray-100 transition-colors select-none"
                                onClick={() => handleSort('margin')}
                           >
                               <div className="flex items-center justify-end gap-1">
                                  Net Margin
                                  {sortConfig?.key === 'margin' ? (
                                    sortConfig.direction === 'asc' ? <ChevronUp className="w-3 h-3 text-indigo-600" /> : <ChevronDown className="w-3 h-3 text-indigo-600" />
                                  ) : <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50" />}
                               </div>
                           </th>
                       </tr>
                   </thead>
                   <tbody className="divide-y divide-gray-100">
                       {paginatedProducts.map(product => {
                           const edits = editedCosts[product.sku] || {};
                           
                           const cogs = edits.costPrice ?? product.costPrice ?? 0;
                           const floor = edits.floorPrice ?? product.floorPrice ?? 0;
                           const ceiling = edits.ceilingPrice ?? product.ceilingPrice ?? 0;

                           const totalCost = getTotalCost(product, edits);
                           // Net Profit = (Price + ExtraFreight) - TotalCost
                           const netProfit = (product.currentPrice + (product.extraFreight || 0)) - totalCost;
                           const margin = product.currentPrice > 0 
                              ? (netProfit / product.currentPrice) * 100 
                              : 0;
                           
                           const renderInput = (field: keyof Omit<CostUpdate, 'sku'>, value: number, placeholder: string = "0.00") => (
                               <input 
                                    type="number" 
                                    step="0.01"
                                    min="0"
                                    value={value === 0 ? '' : value}
                                    placeholder={placeholder}
                                    onChange={(e) => handleInputChange(product.sku, field, e.target.value)}
                                    className={`w-16 text-right border rounded px-1.5 py-1 focus:ring-2 focus:ring-indigo-500 text-xs ${
                                        edits[field] !== undefined ? 'border-indigo-500 bg-indigo-50' : 'border-gray-200'
                                    }`}
                               />
                           );

                           return (
                               <tr key={product.id} className="hover:bg-gray-50">
                                   <td className="p-3 sticky left-0 bg-white group-hover:bg-gray-50 z-10 border-r border-gray-100">
                                       <div className="font-bold text-gray-900">{product.sku}</div>
                                       {/* Removed Product Name as requested */}
                                       {product.subcategory && (
                                           <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 mt-1">
                                               {product.subcategory}
                                           </span>
                                       )}
                                   </td>
                                   <td className="p-3 text-right text-gray-600 font-medium">
                                       ${product.currentPrice.toFixed(2)}
                                   </td>
                                   
                                   <td className="p-3 text-right">{renderInput('costPrice', cogs)}</td>
                                   <td className="p-3 text-right bg-blue-50/30">{renderInput('floorPrice', floor, '-')}</td>
                                   <td className="p-3 text-right bg-blue-50/30">{renderInput('ceilingPrice', ceiling, '-')}</td>

                                   {/* Read Only Fees - extracted from reports with Tooltips */}
                                   <td className="p-3 text-right bg-gray-50/30">
                                       <FeeCell value={product.sellingFee} bounds={product.feeBounds?.sellingFee} />
                                   </td>
                                   <td className="p-3 text-right bg-gray-50/30">
                                       <FeeCell value={product.adsFee} bounds={product.feeBounds?.adsFee} />
                                   </td>
                                   <td className="p-3 text-right bg-gray-50/30">
                                       <FeeCell value={product.postage} bounds={product.feeBounds?.postage} />
                                   </td>
                                   <td className="p-3 text-right bg-green-50/30 border-l border-green-100 text-green-700">
                                       <FeeCell value={product.extraFreight} bounds={product.feeBounds?.extraFreight} />
                                   </td>
                                   <td className="p-3 text-right bg-gray-50/30 border-l border-gray-100">
                                       <FeeCell value={product.subscriptionFee} bounds={product.feeBounds?.subscriptionFee} />
                                   </td>
                                   <td className="p-3 text-right bg-gray-50/30">
                                       <FeeCell value={product.wmsFee} bounds={product.feeBounds?.wmsFee} />
                                   </td>
                                   <td className="p-3 text-right bg-gray-50/30">
                                       <FeeCell value={product.otherFee} bounds={product.feeBounds?.otherFee} />
                                   </td>

                                   <td className="p-3 text-right sticky right-0 bg-white group-hover:bg-gray-50 z-10 border-l border-gray-100">
                                       <div className="flex flex-col items-end">
                                            <span className={`font-mono font-bold ${
                                                margin < 0 ? 'text-red-600' : 
                                                margin < 15 ? 'text-yellow-600' : 
                                                'text-green-600'
                                            }`}>
                                                {margin.toFixed(1)}%
                                            </span>
                                            <span className="text-[10px] text-gray-400" title="Net = (Price + ExtraFreight) - TotalCosts">
                                                Net: ${netProfit.toFixed(2)}
                                            </span>
                                       </div>
                                   </td>
                               </tr>
                           );
                       })}
                       {paginatedProducts.length === 0 && (
                           <tr>
                               <td colSpan={13} className="p-8 text-center text-gray-500">
                                   No products found.
                               </td>
                           </tr>
                       )}
                   </tbody>
               </table>
           </div>

           {/* Pagination Footer */}
           {filteredAndSorted.length > 0 && (
            <div className="bg-gray-50 px-4 py-3 border-t border-gray-200 flex items-center justify-between sm:px-6 rounded-b-lg mt-0">
                <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
                    <div>
                        <p className="text-sm text-gray-700">
                            Showing <span className="font-medium">{(currentPage - 1) * itemsPerPage + 1}</span> to <span className="font-medium">{Math.min(currentPage * itemsPerPage, filteredAndSorted.length)}</span> of <span className="font-medium">{filteredAndSorted.length}</span> results
                        </p>
                    </div>
                    <div>
                        {totalPages > 1 && (
                            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                                <button
                                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                                    disabled={currentPage === 1}
                                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    <span className="sr-only">Previous</span>
                                    <ChevronLeft className="h-5 w-5" aria-hidden="true" />
                                </button>
                                <span className="relative inline-flex items-center px-4 py-2 border border-gray-300 bg-white text-sm font-medium text-gray-700">
                                    Page {currentPage} of {totalPages}
                                </span>
                                <button
                                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                                    disabled={currentPage === totalPages}
                                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
                                >
                                    <span className="sr-only">Next</span>
                                    <ChevronRight className="h-5 w-5" aria-hidden="true" />
                                </button>
                            </nav>
                        )}
                    </div>
                </div>
            </div>
        )}

       </div>

       {/* Portal Tooltip - Minimal Version */}
       {hoveredFee && <FeeTooltip data={hoveredFee} />}

       {/* Export Modal */}
       {isExportModalOpen && (
           <CostExportModal products={products} onClose={() => setIsExportModalOpen(false)} />
       )}
    </div>
  );
};

const FeeTooltip = ({ data }: { data: { rect: DOMRect; value: number; bounds: FeeBounds; isOutlier: boolean } }) => {
    const { rect, value, bounds, isOutlier } = data;
    
    const style: React.CSSProperties = {
        position: 'fixed',
        top: `${rect.top}px`,
        left: `${rect.left + rect.width / 2}px`,
        transform: 'translate(-50%, -100%) translateY(-8px)',
        zIndex: 9999,
        pointerEvents: 'none'
    };
  
    return createPortal(
        <div style={style}>
            <div className="bg-slate-900 text-white p-3 rounded-lg shadow-xl text-xs w-48 animate-in fade-in zoom-in duration-200 border border-slate-700">
                <div className="flex justify-between items-center mb-2 border-b border-slate-700 pb-1">
                    <span className="font-semibold text-slate-300">Fee Analysis</span>
                    {isOutlier && <span className="bg-red-500 text-white px-1 rounded text-[10px] font-bold">High</span>}
                </div>
                <div className="space-y-1">
                    <div className="flex justify-between">
                        <span className="text-slate-400">Current:</span>
                        <span className="font-mono font-bold">${value.toFixed(2)}</span>
                    </div>
                    {bounds && (
                        <>
                            <div className="flex justify-between text-[10px] text-slate-500">
                                <span>Historical Min:</span>
                                <span>${bounds.min.toFixed(2)}</span>
                            </div>
                            <div className="flex justify-between text-[10px] text-slate-500">
                                <span>Historical Max:</span>
                                <span>${bounds.max.toFixed(2)}</span>
                            </div>
                        </>
                    )}
                </div>
                
                {/* Arrow */}
                <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-[1px] border-4 border-transparent border-t-slate-900"></div>
            </div>
        </div>,
        document.body
    );
};

const CostExportModal = ({ products, onClose }: { products: Product[], onClose: () => void }) => {
    const handleDownload = () => {
        const headers = ['SKU', 'Product Name', 'Cost Price (COGS)', 'Min Price', 'Max Price', 'Current Price', 'Net Margin %'];
        const rows = products.map(p => {
             // Calculate Net Margin for export context
             const totalCost = (p.costPrice || 0) + (p.sellingFee || 0) + (p.adsFee || 0) + (p.postage || 0) + (p.otherFee || 0) + (p.subscriptionFee || 0) + (p.wmsFee || 0);
             const net = (p.currentPrice + (p.extraFreight || 0)) - totalCost;
             const margin = p.currentPrice > 0 ? (net / p.currentPrice) * 100 : 0;
            
             return [
                 p.sku,
                 `"${p.name.replace(/"/g, '""')}"`,
                 p.costPrice?.toFixed(2) || '',
                 p.floorPrice?.toFixed(2) || '',
                 p.ceilingPrice?.toFixed(2) || '',
                 p.currentPrice.toFixed(2),
                 margin.toFixed(2) + '%'
             ];
        });

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `cost_structure_export_${new Date().toISOString().slice(0,10)}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-900">Export Cost Structure</h3>
                    <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-full transition-colors"><X className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="p-6 text-sm text-gray-600">
                    <p>Download a CSV containing all cost prices (COGS), floor/ceiling limits, and current margin analysis.</p>
                </div>
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3 rounded-b-xl">
                    <button onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors">Cancel</button>
                    <button onClick={handleDownload} className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 flex items-center gap-2 transition-colors">
                        <Download className="w-4 h-4" />
                        Download CSV
                    </button>
                </div>
            </div>
        </div>
    );
};

export default CostManagementPage;
