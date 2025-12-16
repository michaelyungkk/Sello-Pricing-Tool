
import React, { useState, useMemo } from 'react';
import { Product, PricingRules, PromotionEvent, PromotionItem } from '../types';
import { Calendar, Tag, Plus, ChevronRight, Save, X, Search, Filter, Trash2, Download, ArrowLeft, MoreHorizontal, Calculator, List, Edit3, CheckCircle, AlertTriangle, Lock, Star, AlertCircle as AlertIcon } from 'lucide-react';

interface PromotionPageProps {
  products: Product[];
  pricingRules: PricingRules;
  promotions: PromotionEvent[];
  onAddPromotion: (promo: PromotionEvent) => void;
  onUpdatePromotion: (promo: PromotionEvent) => void;
  themeColor: string;
  headerStyle: React.CSSProperties;
}

type ViewMode = 'dashboard' | 'event_detail' | 'add_products';

const PromotionPage: React.FC<PromotionPageProps> = ({ products, pricingRules, promotions, onAddPromotion, onUpdatePromotion, themeColor, headerStyle }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'all_skus' | 'simulator'>('dashboard');
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);

  const selectedPromo = useMemo(() => 
    promotions.find(p => p.id === selectedPromoId), 
  [promotions, selectedPromoId]);

  const handleCreateEvent = (newEvent: PromotionEvent) => {
      onAddPromotion(newEvent);
      setSelectedPromoId(newEvent.id);
      setViewMode('event_detail'); 
  };

  const handleDeleteItem = (sku: string) => {
      if (!selectedPromo) return;
      const updatedItems = selectedPromo.items.filter(i => i.sku !== sku);
      onUpdatePromotion({ ...selectedPromo, items: updatedItems });
  };

  const handleAddItems = (newItems: PromotionItem[]) => {
      if (!selectedPromo) return;
      const existingSkus = new Set(selectedPromo.items.map(i => i.sku));
      const filteredNew = newItems.filter(i => !existingSkus.has(i.sku));
      
      onUpdatePromotion({ 
          ...selectedPromo, 
          items: [...selectedPromo.items, ...filteredNew] 
      });
      setViewMode('event_detail');
  };

  // Dynamic Style Logic
  const isDarkBackground = headerStyle.color === '#ffffff';
  
  // Tab Text Color: If Dark BG -> Active is White, Inactive is White/60. If Light BG -> Active is Theme, Inactive is Gray.
  const getTabColor = (isActive: boolean) => {
      if (isDarkBackground) {
          return isActive ? '#ffffff' : 'rgba(255, 255, 255, 0.6)';
      }
      return isActive ? themeColor : '#6b7280';
  };

  // Tab Border Color (Bottom Line): If Dark BG -> White/20. If Light BG -> Gray-200.
  const containerBorderColor = isDarkBackground ? 'rgba(255, 255, 255, 0.2)' : '#e5e7eb';

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col w-full min-w-0">
      {/* Tab Navigation */}
      <div 
        className="flex items-center gap-2 mb-6 border-b overflow-x-auto"
        style={{ borderColor: containerBorderColor }}
      >
        <button
          onClick={() => { setActiveTab('dashboard'); setViewMode('dashboard'); setSelectedPromoId(null); }}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap`}
          style={{ 
              borderColor: activeTab === 'dashboard' ? themeColor : 'transparent', 
              color: getTabColor(activeTab === 'dashboard'),
              textShadow: headerStyle.textShadow // Apply same shadow as header for readability
          }}
        >
          <Calendar className="w-4 h-4" />
          Dashboard
        </button>
        <button
          onClick={() => { setActiveTab('all_skus'); setViewMode('dashboard'); }}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap`}
          style={{ 
              borderColor: activeTab === 'all_skus' ? themeColor : 'transparent', 
              color: getTabColor(activeTab === 'all_skus'),
              textShadow: headerStyle.textShadow
          }}
        >
          <List className="w-4 h-4" />
          All Promo SKUs
        </button>
        <button
          onClick={() => setActiveTab('simulator')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap`}
          style={{ 
              borderColor: activeTab === 'simulator' ? themeColor : 'transparent', 
              color: getTabColor(activeTab === 'simulator'),
              textShadow: headerStyle.textShadow
          }}
        >
          <Calculator className="w-4 h-4" />
          Simulator
        </button>
      </div>

      <div className="flex-1 min-w-0">
        
        {activeTab === 'dashboard' && viewMode === 'dashboard' && (
          <PromotionDashboard 
            promotions={promotions} 
            pricingRules={pricingRules}
            onSelectPromo={(id) => { setSelectedPromoId(id); setViewMode('event_detail'); }} 
            onCreateEvent={handleCreateEvent}
            themeColor={themeColor}
          />
        )}
        
        {activeTab === 'dashboard' && viewMode === 'event_detail' && selectedPromo && (
           <EventDetailView 
             promo={selectedPromo} 
             products={products}
             onBack={() => setViewMode('dashboard')} 
             onAddProducts={() => setViewMode('add_products')}
             onDeleteItem={handleDeleteItem}
             themeColor={themeColor}
           />
        )}

        {activeTab === 'dashboard' && viewMode === 'add_products' && selectedPromo && (
          <ProductSelector 
            products={products}
            currentPromo={selectedPromo}
            onCancel={() => setViewMode('event_detail')}
            onConfirm={handleAddItems}
            themeColor={themeColor}
          />
        )}

        {activeTab === 'all_skus' && (
           <AllPromoSkusView promotions={promotions} products={products} />
        )}

        {activeTab === 'simulator' && (
            <div className="flex flex-col items-center justify-center h-96 border-2 border-dashed rounded-xl" style={{ borderColor: containerBorderColor }}>
                <Calculator className="w-12 h-12 mb-4 opacity-50" style={{ color: getTabColor(false) }} />
                <h3 className="text-lg font-medium" style={{ color: getTabColor(true) }}>Advanced Simulator</h3>
                <p className="text-sm mt-2" style={{ color: getTabColor(false) }}>Break-even velocity and sophisticated margin analysis coming soon.</p>
            </div>
        )}
      </div>
    </div>
  );
};

const PromotionDashboard = ({ promotions, pricingRules, onSelectPromo, onCreateEvent, themeColor }: any) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredPromotions = promotions.filter((p: any) => 
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        p.platform.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div className="relative max-w-sm w-full">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Search event name or platform..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-opacity-50"
                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                    />
                </div>
                <button 
                    onClick={() => setIsCreateModalOpen(true)}
                    className="px-4 py-2 text-white rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm"
                    style={{ backgroundColor: themeColor }}
                >
                    <Plus className="w-4 h-4" />
                    Create Event
                </button>
            </div>
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-100">
                            <tr>
                                <th className="p-4 w-[25%]">Event Name</th>
                                <th className="p-4">Platform</th>
                                <th className="p-4">Duration</th>
                                <th className="p-4">Deadline</th>
                                <th className="p-4 text-center">SKUs</th>
                                <th className="p-4">Status</th>
                                <th className="p-4"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {filteredPromotions.map((p: any) => (
                                <tr key={p.id} className="hover:bg-gray-50 group cursor-pointer transition-colors" onClick={() => onSelectPromo(p.id)}>
                                    <td className="p-4">
                                        <div className="font-semibold text-gray-900">{p.name}</div>
                                        {p.remark && <div className="text-xs text-gray-400 mt-1 truncate max-w-[200px]">{p.remark}</div>}
                                    </td>
                                    <td className="p-4">
                                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                                            p.platform === 'All' ? 'bg-gray-100 text-gray-800 border-gray-200' : 'bg-white text-gray-700 border-gray-200'
                                        }`}>
                                            {p.platform}
                                        </span>
                                    </td>
                                    <td className="p-4 text-gray-500">
                                        <div className="flex flex-col text-xs">
                                            <span className="font-medium text-gray-900">{new Date(p.startDate).toLocaleDateString()}</span>
                                            <span className="text-gray-400">to {new Date(p.endDate).toLocaleDateString()}</span>
                                        </div>
                                    </td>
                                    <td className="p-4 text-gray-500">
                                        {p.submissionDeadline ? (
                                            <span className={`text-xs ${new Date(p.submissionDeadline) < new Date() && p.status === 'UPCOMING' ? 'text-red-600 font-bold' : ''}`}>
                                                {new Date(p.submissionDeadline).toLocaleDateString()}
                                            </span>
                                        ) : '-'}
                                    </td>
                                    <td className="p-4 text-center">
                                        <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-gray-100 text-gray-700 font-mono text-xs">
                                            {p.items.length}
                                        </span>
                                    </td>
                                    <td className="p-4">
                                        <StatusBadge status={p.status} />
                                    </td>
                                    <td className="p-4 text-right">
                                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-current transition-colors" style={{ color: 'inherit' }} />
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
            {isCreateModalOpen && <CreateEventModal pricingRules={pricingRules} onClose={() => setIsCreateModalOpen(false)} onConfirm={onCreateEvent} themeColor={themeColor} />}
        </div>
    );
};

const CreateEventModal = ({ pricingRules, onClose, onConfirm, themeColor }: any) => {
    const [formData, setFormData] = useState({ name: '', platform: Object.keys(pricingRules)[0] || 'Amazon', startDate: '', endDate: '', deadline: '', remark: '' });
    const [error, setError] = useState<string | null>(null);
    const handleSubmit = () => {
        if (!formData.name || !formData.startDate || !formData.endDate) { setError("Required fields missing"); return; }
        onConfirm({ id: `evt-${Date.now()}`, name: formData.name, platform: formData.platform, startDate: formData.startDate, endDate: formData.endDate, submissionDeadline: formData.deadline || undefined, remark: formData.remark, status: 'UPCOMING', items: [] });
        onClose();
    };
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4">
                <h2 className="text-xl font-bold">Create Event</h2>
                {error && <div className="text-red-600 text-sm">{error}</div>}
                <input type="text" placeholder="Event Name" className="border p-2 rounded" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                <div className="grid grid-cols-2 gap-4">
                    <input type="date" className="border p-2 rounded" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                    <input type="date" className="border p-2 rounded" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                </div>
                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 text-white rounded" style={{ backgroundColor: themeColor }}>Create</button>
                </div>
            </div>
        </div>
    );
}

const EventDetailView = ({ promo, products, onBack, onAddProducts, onDeleteItem, themeColor }: any) => {
    return (
        <div className="space-y-6 h-full flex flex-col">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <button onClick={onBack} className="p-1 bg-white rounded-full shadow hover:bg-gray-50"><ArrowLeft/></button> 
                    <h2 className="text-xl font-bold text-white drop-shadow-md" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>{promo.name}</h2>
                </div>
                <button onClick={onAddProducts} className="text-white px-4 py-2 rounded flex gap-2 shadow-lg" style={{ backgroundColor: themeColor }}><Plus className="w-4 h-4"/> Add Products</button>
            </div>
             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col min-h-0">
                    <div className="overflow-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-4">SKU / Category</th>
                                    <th className="p-4 text-right">Base Price</th>
                                    <th className="p-4 text-right">Promo Price</th>
                                    <th className="p-4 w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {promo.items.map((item: any, idx: number) => (
                                    <tr key={idx}>
                                        <td className="p-4">{item.sku}</td>
                                        <td className="p-4 text-right">£{item.basePrice}</td>
                                        <td className="p-4 text-right font-bold" style={{ color: themeColor }}>£{item.promoPrice}</td>
                                        <td className="p-4"><button onClick={() => onDeleteItem(item.sku)}><Trash2 className="w-4 h-4 text-gray-400"/></button></td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
            </div>
        </div>
    );
};

// UPDATED PRODUCT SELECTOR WITH BRAND FILTER
const ProductSelector = ({ products, currentPromo, onCancel, onConfirm, themeColor }: { 
    products: Product[], 
    currentPromo: PromotionEvent,
    onCancel: () => void,
    onConfirm: (items: PromotionItem[]) => void,
    themeColor: string
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    const [selectedBrand, setSelectedBrand] = useState('All'); 
    
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [manualPrices, setManualPrices] = useState<Record<string, number>>({});
    const [bulkRule, setBulkRule] = useState<{ type: 'PERCENTAGE' | 'FIXED', value: number }>({ type: 'PERCENTAGE', value: 10 });

    const existingSkuSet = useMemo(() => new Set(currentPromo.items.map(i => i.sku)), [currentPromo]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            if (existingSkuSet.has(p.sku)) return false;
            
            const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku.toLowerCase().includes(searchQuery.toLowerCase());
            const matchCat = selectedCategory === 'All' || p.category === selectedCategory || p.subcategory === selectedCategory;
            const matchBrand = selectedBrand === 'All' || p.brand === selectedBrand;
            
            return matchSearch && matchCat && matchBrand;
        });
    }, [products, searchQuery, selectedCategory, selectedBrand, existingSkuSet]);

    const uniqueCategories = useMemo(() => {
        const cats = new Set(products.map(p => p.category || 'Uncategorized'));
        return Array.from(cats).filter(Boolean).sort();
    }, [products]);

    const uniqueBrands = useMemo(() => {
        const brands = new Set(products.map(p => p.brand).filter(Boolean) as string[]);
        return Array.from(brands).sort();
    }, [products]);

    const handleRowClick = (sku: string) => {
        const newSet = new Set(selectedSkus);
        if (newSet.has(sku)) newSet.delete(sku);
        else newSet.add(sku);
        setSelectedSkus(newSet);
    };

    const toggleAll = () => {
        if (selectedSkus.size === filteredProducts.length) setSelectedSkus(new Set());
        else setSelectedSkus(new Set(filteredProducts.map(p => p.sku)));
    };

    const calculatePromoPrice = (product: Product) => {
        if (manualPrices[product.sku] !== undefined) return manualPrices[product.sku];
        let price = product.currentPrice;
        if (currentPromo.platform !== 'All') {
             const channel = product.channels.find(c => c.platform === currentPromo.platform);
             if (channel && channel.price) price = channel.price;
        }
        if (bulkRule.type === 'PERCENTAGE') {
            price = price * (1 - bulkRule.value / 100);
        } else {
            price = Math.max(0, price - bulkRule.value);
        }
        let finalPrice = Math.ceil(price) - 0.05;
        if (finalPrice < 0) finalPrice = 0.95;
        return Number(finalPrice.toFixed(2));
    };

    const handleConfirm = () => {
        const items: PromotionItem[] = Array.from(selectedSkus).map((sku: string) => {
            const product = products.find(p => p.sku === sku)!;
            const promoPrice = calculatePromoPrice(product);
            return {
                sku,
                basePrice: product.currentPrice,
                discountType: bulkRule.type,
                discountValue: bulkRule.value, // Simplification
                promoPrice
            };
        });
        onConfirm(items);
    };

    return (
        <div className="space-y-4 h-[calc(100vh-200px)] flex flex-col">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={onCancel} className="p-1 bg-white rounded-full shadow hover:bg-gray-50 flex items-center justify-center">
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>
                    <h2 className="text-xl font-bold text-white drop-shadow-md" style={{ textShadow: '0 2px 4px rgba(0,0,0,0.5)' }}>Add Products to {currentPromo.name}</h2>
                </div>
                <button 
                    onClick={handleConfirm}
                    disabled={selectedSkus.size === 0}
                    className="px-6 py-2 text-white rounded-lg font-medium shadow-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    style={{ backgroundColor: themeColor }}
                >
                    <CheckCircle className="w-4 h-4" />
                    Add {selectedSkus.size} Products
                </button>
            </div>

            <div className="flex gap-4 items-end bg-white p-4 rounded-xl border border-gray-200 shadow-sm overflow-x-auto">
                 <div className="flex-1 min-w-[200px]">
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Search</label>
                     <div className="relative mt-1">
                         <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                         <input 
                            type="text" 
                            placeholder="Search SKU..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
                         />
                     </div>
                 </div>
                 <div className="w-40 min-w-[150px]">
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Category</label>
                     <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg py-2 px-3 text-sm">
                         <option value="All">All</option>
                         {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                     </select>
                 </div>
                 <div className="w-40 min-w-[150px]">
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Brand</label>
                     <select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="w-full mt-1 border border-gray-300 rounded-lg py-2 px-3 text-sm">
                         <option value="All">All</option>
                         {uniqueBrands.map(b => <option key={b} value={b}>{b}</option>)}
                     </select>
                 </div>
                 
                 <div className="pl-4 border-l border-gray-200 flex flex-col gap-1 min-w-[200px]">
                     <label className="text-xs font-bold uppercase tracking-wide" style={{ color: themeColor }}>Bulk Discount Rule</label>
                     <div className="flex items-center gap-2">
                        <select 
                            value={bulkRule.type}
                            onChange={(e) => setBulkRule({ ...bulkRule, type: e.target.value as any })}
                            className="border-gray-300 rounded-lg text-sm py-1.5"
                        >
                            <option value="PERCENTAGE">% Off</option>
                            <option value="FIXED">£ Off</option>
                        </select>
                        <input 
                            type="number" 
                            value={bulkRule.value}
                            onChange={(e) => setBulkRule({ ...bulkRule, value: parseFloat(e.target.value) })}
                            className="w-20 border-gray-300 rounded-lg text-sm py-1.5"
                        />
                     </div>
                 </div>
            </div>

            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-0">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left text-sm select-none whitespace-nowrap">
                        <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 w-10"><input type="checkbox" onChange={toggleAll} checked={selectedSkus.size > 0 && selectedSkus.size === filteredProducts.length} /></th>
                                <th className="p-4">SKU / Info</th>
                                <th className="p-4 text-right">Price</th>
                                <th className="p-4 text-right border-l border-indigo-100" style={{ backgroundColor: `${themeColor}10`, color: themeColor }}>Promo Price</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {filteredProducts.map((p) => {
                                const isSelected = selectedSkus.has(p.sku);
                                const promoPrice = calculatePromoPrice(p);
                                return (
                                    <tr key={p.id} onClick={() => handleRowClick(p.sku)} className={`cursor-pointer hover:bg-gray-50`} style={isSelected ? { backgroundColor: `${themeColor}10` } : {}}>
                                        <td className="p-4"><input type="checkbox" checked={isSelected} readOnly /></td>
                                        <td className="p-4">
                                            <div className="font-bold text-gray-900">{p.sku}</div>
                                            <div className="text-xs text-gray-500">{p.brand} • {p.category}</div>
                                        </td>
                                        <td className="p-4 text-right">£{p.currentPrice.toFixed(2)}</td>
                                        <td className="p-4 text-right font-bold border-l border-gray-100" style={{ color: themeColor }}>£{promoPrice.toFixed(2)}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const AllPromoSkusView = ({promotions}: any) => <div>All SKUs View Placeholder</div>; 
const StatusBadge = ({status}: any) => <span className="text-xs border px-2 py-0.5 rounded">{status}</span>;

export default PromotionPage;
