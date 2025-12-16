
import React, { useState, useMemo } from 'react';
import { Product, PricingRules } from '../types';
import { Search, Upload, Link as LinkIcon, Download, Package, ArrowRight, Copy } from 'lucide-react';

interface ProductManagementPageProps {
  products: Product[];
  pricingRules: PricingRules;
  onOpenMappingModal: () => void;
  themeColor: string;
  headerStyle: React.CSSProperties;
}

const ProductManagementPage: React.FC<ProductManagementPageProps> = ({ 
  products, 
  pricingRules, 
  onOpenMappingModal, 
  themeColor, 
  headerStyle 
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  
  const platforms = useMemo(() => Object.keys(pricingRules).sort(), [pricingRules]);

  const filteredProducts = useMemo(() => {
    return products.filter(p => 
      p.sku.toLowerCase().includes(searchQuery.toLowerCase()) || 
      p.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  // Helper to find ALL aliases for a specific platform
  const getAliasesForPlatform = (product: Product, platform: string): string[] => {
      const matchingChannels = product.channels.filter(c => c.platform === platform && c.skuAlias);
      // Use Set to remove duplicates if multiple channel entries (e.g. different managers) use the same alias
      const uniqueAliases = new Set(matchingChannels.map(c => c.skuAlias as string));
      return Array.from(uniqueAliases);
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-10">
      
      {/* Header Section */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
            <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Product Management</h2>
            <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                Manage Master SKUs and their platform-specific aliases.
            </p>
        </div>
        <button 
            onClick={onOpenMappingModal}
            className="px-6 py-2.5 bg-indigo-600 text-white font-medium rounded-lg shadow hover:bg-indigo-700 transition-colors flex items-center gap-2 whitespace-nowrap"
            style={{ backgroundColor: themeColor }}
        >
            <LinkIcon className="w-4 h-4" />
            Map Aliases (Import CSV)
        </button>
      </div>

      {/* Toolbar */}
      <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row items-center gap-4">
           <div className="relative flex-1 w-full">
               <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
               <input 
                    type="text" 
                    placeholder="Search by Master SKU or Name..." 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50"
                    style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
               />
           </div>
           <div className="text-sm text-gray-500 font-medium">
               {filteredProducts.length} Products Found
           </div>
      </div>

      {/* Matrix Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                  <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                      <tr>
                          <th className="p-4 sticky left-0 bg-gray-50 z-10 border-r border-gray-200 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">Master SKU Identity</th>
                          {platforms.map(platform => (
                              <th key={platform} className="p-4 text-center min-w-[180px]">
                                  <div className="flex flex-col items-center gap-1">
                                      <span>{platform}</span>
                                      <span className="text-[10px] font-normal text-gray-400 uppercase tracking-wide">Aliases</span>
                                  </div>
                              </th>
                          ))}
                      </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                      {filteredProducts.map(product => (
                          <tr key={product.id} className="hover:bg-gray-50 transition-colors">
                              <td className="p-4 sticky left-0 bg-white border-r border-gray-100 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)] align-top">
                                  <div className="flex items-start gap-3">
                                      <div className="p-2 bg-gray-100 rounded text-gray-500 mt-1">
                                          <Package className="w-5 h-5" />
                                      </div>
                                      <div>
                                          <div className="font-bold text-gray-900 font-mono text-base">{product.sku}</div>
                                          <div className="text-xs text-gray-500 truncate max-w-[200px] mt-0.5" title={product.name}>{product.name}</div>
                                          <div className="flex gap-2 mt-2">
                                              <span className="text-[10px] bg-gray-100 border border-gray-200 px-1.5 py-0.5 rounded text-gray-600">
                                                  {product.channels.length} Channels
                                              </span>
                                          </div>
                                      </div>
                                  </div>
                              </td>
                              {platforms.map(platform => {
                                  const aliases = getAliasesForPlatform(product, platform);
                                  return (
                                      <td key={platform} className="p-4 text-center border-l border-dashed border-gray-100 align-top">
                                          {aliases.length > 0 ? (
                                              <div className="flex flex-col gap-2 items-center">
                                                  {aliases.map((alias, idx) => (
                                                      <span 
                                                        key={idx} 
                                                        className="inline-flex items-center px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100 font-mono text-xs max-w-[160px] truncate"
                                                        title={alias}
                                                      >
                                                          {alias}
                                                      </span>
                                                  ))}
                                              </div>
                                          ) : (
                                              <span className="text-gray-300 block py-1">-</span>
                                          )}
                                      </td>
                                  );
                              })}
                          </tr>
                      ))}
                      {filteredProducts.length === 0 && (
                          <tr>
                              <td colSpan={platforms.length + 1} className="p-12 text-center text-gray-500">
                                  No products found matching your search.
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

export default ProductManagementPage;
