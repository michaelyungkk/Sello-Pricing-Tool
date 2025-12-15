
import React, { useState, useMemo } from 'react';
import { Product, PricingRules, PromotionEvent, PromotionItem } from '../types';
import { Calendar, Tag, Plus, ChevronRight, Save, X, Search, Filter, Trash2, Download, ArrowLeft, MoreHorizontal, Calculator, List, Edit3, CheckCircle, AlertTriangle, Lock, Star, AlertCircle as AlertIcon } from 'lucide-react';

interface PromotionPageProps {
  products: Product[];
  pricingRules: PricingRules;
  promotions: PromotionEvent[];
  onAddPromotion: (promo: PromotionEvent) => void;
  onUpdatePromotion: (promo: PromotionEvent) => void;
}

type ViewMode = 'dashboard' | 'event_detail' | 'add_products';

const PromotionPage: React.FC<PromotionPageProps> = ({ products, pricingRules, promotions, onAddPromotion, onUpdatePromotion }) => {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'all_skus' | 'simulator'>('dashboard');
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);

  const selectedPromo = useMemo(() => 
    promotions.find(p => p.id === selectedPromoId), 
  [promotions, selectedPromoId]);

  const handleCreateEvent = (newEvent: PromotionEvent) => {
      onAddPromotion(newEvent);
      setSelectedPromoId(newEvent.id);
      setViewMode('event_detail'); // Auto-navigate to details to add SKUs
  };

  const handleDeleteItem = (sku: string) => {
      if (!selectedPromo) return;
      const updatedItems = selectedPromo.items.filter(i => i.sku !== sku);
      onUpdatePromotion({ ...selectedPromo, items: updatedItems });
  };

  const handleAddItems = (newItems: PromotionItem[]) => {
      if (!selectedPromo) return;
      // Merge new items, avoiding duplicates
      const existingSkus = new Set(selectedPromo.items.map(i => i.sku));
      const filteredNew = newItems.filter(i => !existingSkus.has(i.sku));
      
      onUpdatePromotion({ 
          ...selectedPromo, 
          items: [...selectedPromo.items, ...filteredNew] 
      });
      setViewMode('event_detail');
  };

  return (
    <div className="max-w-7xl mx-auto h-full flex flex-col w-full min-w-0">
      {/* Tab Navigation */}
      <div className="flex items-center gap-2 mb-6 border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => { setActiveTab('dashboard'); setViewMode('dashboard'); setSelectedPromoId(null); }}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'dashboard' 
              ? 'border-indigo-600 text-indigo-700' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Dashboard
        </button>
        <button
          onClick={() => { setActiveTab('all_skus'); setViewMode('dashboard'); }}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'all_skus' 
              ? 'border-indigo-600 text-indigo-700' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <List className="w-4 h-4" />
          All Promo SKUs
        </button>
        <button
          onClick={() => setActiveTab('simulator')}
          className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'simulator' 
              ? 'border-indigo-600 text-indigo-700' 
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <Calculator className="w-4 h-4" />
          Simulator
        </button>
      </div>

      {/* Content Area */}
      <div className="flex-1 min-w-0">
        
        {/* VIEW 1: DASHBOARD (LEDGER) */}
        {activeTab === 'dashboard' && viewMode === 'dashboard' && (
          <PromotionDashboard 
            promotions={promotions} 
            pricingRules={pricingRules}
            onSelectPromo={(id) => { setSelectedPromoId(id); setViewMode('event_detail'); }} 
            onCreateEvent={handleCreateEvent}
          />
        )}
        
        {/* VIEW 2: EVENT DETAILS */}
        {activeTab === 'dashboard' && viewMode === 'event_detail' && selectedPromo && (
           <EventDetailView 
             promo={selectedPromo} 
             products={products}
             onBack={() => setViewMode('dashboard')} 
             onAddProducts={() => setViewMode('add_products')}
             onDeleteItem={handleDeleteItem}
           />
        )}

        {/* VIEW 3: ADD PRODUCTS (BULK CREATOR) */}
        {activeTab === 'dashboard' && viewMode === 'add_products' && selectedPromo && (
          <ProductSelector 
            products={products}
            currentPromo={selectedPromo}
            onCancel={() => setViewMode('event_detail')}
            onConfirm={handleAddItems}
          />
        )}

        {/* VIEW 4: ALL PROMO SKUS */}
        {activeTab === 'all_skus' && (
           <AllPromoSkusView promotions={promotions} products={products} />
        )}

        {/* VIEW 5: SIMULATOR PLACEHOLDER */}
        {activeTab === 'simulator' && (
            <div className="flex flex-col items-center justify-center h-96 text-gray-400 border-2 border-dashed border-gray-200 rounded-xl">
                <Calculator className="w-12 h-12 mb-4 text-gray-300" />
                <h3 className="text-lg font-medium text-gray-500">Advanced Simulator</h3>
                <p className="text-sm">Break-even velocity and sophisticated margin analysis coming soon.</p>
            </div>
        )}
      </div>
    </div>
  );
};

// --- SUB-COMPONENT: PROMOTION DASHBOARD ---

const PromotionDashboard = ({ promotions, pricingRules, onSelectPromo, onCreateEvent }: { 
    promotions: PromotionEvent[], 
    pricingRules: PricingRules,
    onSelectPromo: (id: string) => void,
    onCreateEvent: (e: PromotionEvent) => void
}) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');

    const filteredPromotions = promotions.filter(p => 
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
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                </div>
                <button 
                    onClick={() => setIsCreateModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm font-medium shadow-sm shadow-indigo-200"
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
                            {filteredPromotions.map(p => (
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
                                        <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-indigo-600 transition-colors" />
                                    </td>
                                </tr>
                            ))}
                            {filteredPromotions.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-8 text-center text-gray-500">
                                        No events found. Click "Create Event" to start.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {isCreateModalOpen && (
                <CreateEventModal 
                    pricingRules={pricingRules} 
                    onClose={() => setIsCreateModalOpen(false)} 
                    onConfirm={onCreateEvent} 
                />
            )}
        </div>
    );
};

// --- SUB-COMPONENT: CREATE EVENT MODAL ---

const CreateEventModal = ({ pricingRules, onClose, onConfirm }: { 
    pricingRules: PricingRules, 
    onClose: () => void, 
    onConfirm: (e: PromotionEvent) => void 
}) => {
    const [formData, setFormData] = useState({
        name: '',
        platform: Object.keys(pricingRules)[0] || 'Amazon',
        startDate: '',
        endDate: '',
        deadline: '',
        remark: ''
    });
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = () => {
        if (!formData.name || !formData.startDate || !formData.endDate) {
            setError("Please fill in all required fields (Name, Start Date, End Date).");
            return;
        }

        const newEvent: PromotionEvent = {
            id: `evt-${Date.now()}`,
            name: formData.name,
            platform: formData.platform,
            startDate: formData.startDate,
            endDate: formData.endDate,
            submissionDeadline: formData.deadline || undefined,
            remark: formData.remark,
            status: 'UPCOMING',
            items: []
        };
        onConfirm(newEvent);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-900">Create Promotion Event</h2>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
                </div>
                <div className="p-6 space-y-4">
                    {error && (
                        <div className="bg-red-50 text-red-700 p-3 rounded-lg text-sm flex items-center gap-2 border border-red-100">
                            <AlertIcon className="w-4 h-4 flex-shrink-0" />
                            {error}
                        </div>
                    )}
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Platform <span className="text-red-500">*</span></label>
                        <select 
                            value={formData.platform}
                            onChange={e => setFormData({...formData, platform: e.target.value})}
                            className="w-full border-gray-300 rounded-lg text-sm"
                        >
                            {Object.keys(pricingRules).map(p => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Event Name <span className="text-red-500">*</span></label>
                        <input 
                            type="text" 
                            value={formData.name}
                            onChange={e => setFormData({...formData, name: e.target.value})}
                            placeholder="e.g. Summer Flash Sale"
                            className="w-full border-gray-300 rounded-lg text-sm"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">Start Date <span className="text-red-500">*</span></label>
                            <input type="date" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} className="w-full border-gray-300 rounded-lg text-sm" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-gray-700 mb-1">End Date <span className="text-red-500">*</span></label>
                            <input type="date" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} className="w-full border-gray-300 rounded-lg text-sm" />
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Submission Deadline (Optional)</label>
                        <input type="date" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} className="w-full border-gray-300 rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-700 mb-1">Remark (Optional)</label>
                        <textarea 
                            value={formData.remark}
                            onChange={e => setFormData({...formData, remark: e.target.value})}
                            className="w-full border-gray-300 rounded-lg text-sm h-20 resize-none"
                            placeholder="Internal notes..."
                        />
                    </div>
                </div>
                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 shadow-sm">Create</button>
                </div>
            </div>
        </div>
    );
};

// --- SUB-COMPONENT: EVENT DETAIL VIEW ---

const EventDetailView = ({ promo, products, onBack, onAddProducts, onDeleteItem }: { 
    promo: PromotionEvent, 
    products: Product[],
    onBack: () => void,
    onAddProducts: () => void,
    onDeleteItem: (sku: string) => void
}) => {
    const isStarted = new Date() >= new Date(promo.startDate);

    const handleExport = () => {
        const headers = ['SKU', 'Product Name', 'Base Price', 'Discount Type', 'Discount Value', 'Promo Price', 'Start Date', 'End Date'];
        const rows = promo.items.map(item => {
            const product = products.find(p => p.sku === item.sku);
            return [
                item.sku,
                `"${product?.name.replace(/"/g, '""') || ''}"`,
                item.basePrice,
                item.discountType,
                item.discountValue,
                item.promoPrice,
                promo.startDate,
                promo.endDate
            ];
        });

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `${promo.name.replace(/\s+/g, '_')}_list.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right duration-200 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500">
                        <ArrowLeft className="w-5 h-5" />
                    </button>
                    <div>
                        <div className="flex items-center gap-2">
                             <h2 className="text-xl font-bold text-gray-900">{promo.name}</h2>
                             <StatusBadge status={promo.status} />
                             {/* VISUAL STATUS INDICATOR FOR EDITING */}
                             {!isStarted ? (
                                <span className="text-xs text-green-700 flex items-center gap-1 bg-green-50 border border-green-100 px-2 py-0.5 rounded font-medium">
                                    <Edit3 className="w-3 h-3" />
                                    Editable
                                </span>
                            ) : (
                                <span className="text-xs text-gray-500 flex items-center gap-1 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded font-medium">
                                    <Lock className="w-3 h-3" />
                                    Locked
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                            <span>{new Date(promo.startDate).toLocaleDateString()} - {new Date(promo.endDate).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>{promo.platform}</span>
                            {promo.remark && (
                                <>
                                    <span>•</span>
                                    <span className="italic">{promo.remark}</span>
                                </>
                            )}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {promo.items.length > 0 && (
                        <button 
                            onClick={handleExport}
                            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 flex items-center gap-2 text-sm font-medium"
                        >
                            <Download className="w-4 h-4" />
                            Export List
                        </button>
                    )}
                    {!isStarted && (
                        <button 
                            onClick={onAddProducts}
                            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2 text-sm font-medium shadow-sm"
                        >
                            <Plus className="w-4 h-4" />
                            {promo.items.length === 0 ? 'Create Promotion List' : 'Add More Products'}
                        </button>
                    )}
                </div>
            </div>

            {/* Empty State */}
            {promo.items.length === 0 ? (
                <div className="bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl p-12 flex flex-col items-center justify-center text-center flex-1">
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                        <Tag className="w-8 h-8 text-gray-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900">No Products Yet</h3>
                    <p className="text-gray-500 mt-1 max-w-sm">Start by adding products to this promotion event. You can filter by category and apply bulk discounts.</p>
                    <button 
                        onClick={onAddProducts}
                        className="mt-6 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium"
                    >
                        Create Promotion List
                    </button>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col min-h-0">
                    <div className="overflow-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 z-10 shadow-sm">
                                <tr>
                                    <th className="p-4">SKU / Category</th>
                                    {/* Removed Product Name Header */}
                                    <th className="p-4 text-right">Base Price (Net)</th>
                                    <th className="p-4 text-right">Platform Price</th>
                                    <th className="p-4 text-right">Discount</th>
                                    <th className="p-4 text-right">Promo Price</th>
                                    {!isStarted && <th className="p-4 w-10"></th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {promo.items.map((item, idx) => {
                                    const product = products.find(p => p.sku === item.sku);
                                    
                                    // Default: Global Price or fallback logic
                                    let platformPrice = product ? product.currentPrice : item.basePrice * 1.2;

                                    // Specific Platform Price Logic
                                    if (product && promo.platform !== 'All') {
                                        // 1. Try to find direct channel price match
                                        const exactChannel = product.channels.find(c => c.platform === promo.platform);
                                        if (exactChannel && exactChannel.price) {
                                            platformPrice = exactChannel.price;
                                        } 
                                        // 2. Fallback: If multiple managers for same platform, calculate weighted avg
                                        else {
                                            const platformChannels = product.channels.filter(c => c.platform === promo.platform);
                                            if (platformChannels.length > 0) {
                                                const weightedSum = platformChannels.reduce((sum, c) => sum + ((c.price || product.currentPrice) * c.velocity), 0);
                                                const totalVel = platformChannels.reduce((sum, c) => sum + c.velocity, 0);
                                                if (totalVel > 0) {
                                                    platformPrice = weightedSum / totalVel;
                                                }
                                            }
                                        }
                                    }

                                    return (
                                        <tr key={idx} className="hover:bg-gray-50">
                                            <td className="p-4">
                                                <div className="font-mono text-gray-600 font-bold">{item.sku}</div>
                                                {product?.subcategory && <div className="text-xs text-gray-400">{product.subcategory}</div>}
                                            </td>
                                            {/* Removed Product Name Cell */}
                                            <td className="p-4 text-right text-gray-500 font-medium">
                                                ${item.basePrice.toFixed(2)}
                                            </td>
                                            <td className="p-4 text-right text-gray-900 font-medium">
                                                ${platformPrice.toFixed(2)}
                                            </td>
                                            <td className="p-4 text-right">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
                                                    {item.discountType === 'PERCENTAGE' ? `-${item.discountValue}%` : `-$${item.discountValue}`}
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-bold text-gray-900">${item.promoPrice.toFixed(2)}</td>
                                            {!isStarted && (
                                                <td className="p-4 text-right">
                                                    <button 
                                                        onClick={() => onDeleteItem(item.sku)}
                                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                                                        title="Remove from event"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- SUB-COMPONENT: PRODUCT SELECTOR (BULK CREATOR) ---

const ProductSelector = ({ products, currentPromo, onCancel, onConfirm }: { 
    products: Product[], 
    currentPromo: PromotionEvent,
    onCancel: () => void,
    onConfirm: (items: PromotionItem[]) => void
}) => {
    // 1. Filter State
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All');
    
    // 2. Selection State
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [lastSelectedIndex, setLastSelectedIndex] = useState<number>(-1);
    
    // 3. Draft Config State (SKU -> Override Price)
    const [manualPrices, setManualPrices] = useState<Record<string, number>>({});
    
    // 4. Bulk Rule State
    const [bulkRule, setBulkRule] = useState<{ type: 'PERCENTAGE' | 'FIXED', value: number }>({ type: 'PERCENTAGE', value: 10 });

    const existingSkuSet = useMemo(() => new Set(currentPromo.items.map(i => i.sku)), [currentPromo]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            // Exclude already added
            if (existingSkuSet.has(p.sku)) return false;
            
            const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku.toLowerCase().includes(searchQuery.toLowerCase());
            // Updated: Match Subcategory instead of Category
            const matchCat = selectedCategory === 'All' || p.subcategory === selectedCategory;
            
            return matchSearch && matchCat;
        });
    }, [products, searchQuery, selectedCategory, existingSkuSet]);

    // Updated: Use subcategory for dropdown
    const uniqueCategories = useMemo(() => {
        const cats = new Set(products.map(p => p.subcategory || 'Uncategorized'));
        return Array.from(cats).filter(Boolean).sort();
    }, [products]);

    const handleRowClick = (sku: string, index: number, e: React.MouseEvent) => {
        if (e.shiftKey) {
             window.getSelection()?.removeAllRanges();
        }

        const newSet = new Set(selectedSkus);
        const isSelected = newSet.has(sku);

        if (e.shiftKey && lastSelectedIndex !== -1) {
             const start = Math.min(lastSelectedIndex, index);
             const end = Math.max(lastSelectedIndex, index);
             const subset = filteredProducts.slice(start, end + 1);
             subset.forEach(p => newSet.add(p.sku));
        } else {
             // Normal Click or Ctrl Click -> Toggle
             if (isSelected) newSet.delete(sku);
             else newSet.add(sku);
             setLastSelectedIndex(index);
        }
        
        setSelectedSkus(newSet);
    };

    const toggleAll = () => {
        if (selectedSkus.size === filteredProducts.length) {
            setSelectedSkus(new Set());
        } else {
            setSelectedSkus(new Set(filteredProducts.map(p => p.sku)));
        }
    };

    const applyBulkRule = () => {
        // Just triggers re-render, logic is in calculatePromoPrice
        // In a real app, you might want to "freeze" the bulk rule into state per item
    };

    const calculatePromoPrice = (product: Product) => {
        // If manual override exists, prioritize it
        if (manualPrices[product.sku] !== undefined) return manualPrices[product.sku];
        
        // Else use bulk rule
        // Use Platform Price if available for context
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
        return Number(price.toFixed(2));
    };

    const handleConfirm = () => {
        const items: PromotionItem[] = Array.from(selectedSkus).map(sku => {
            const product = products.find(p => p.sku === sku)!;
            const promoPrice = calculatePromoPrice(product);
            
            // Determine Reference Price for discount calculation
            let refPrice = product.currentPrice;
            if (currentPromo.platform !== 'All') {
                 const channel = product.channels.find(c => c.platform === currentPromo.platform);
                 if (channel && channel.price) refPrice = channel.price;
            }

            // Reverse engineer discount if manual
            let discountValue = bulkRule.value;
            let discountType = bulkRule.type;
            
            if (manualPrices[sku] !== undefined) {
                 discountType = 'FIXED';
                 discountValue = Number((refPrice - promoPrice).toFixed(2));
            }

            return {
                sku,
                basePrice: product.currentPrice, // Base is usually Net or Global, keeping as is for now or could switch to refPrice
                discountType,
                discountValue,
                promoPrice
            };
        });
        onConfirm(items);
    };

    return (
        <div className="space-y-4 h-[calc(100vh-200px)] flex flex-col">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 font-medium text-sm flex items-center gap-1">
                        <ArrowLeft className="w-4 h-4" /> Cancel
                    </button>
                    <h2 className="text-xl font-bold text-gray-900">Add Products to {currentPromo.name}</h2>
                </div>
                <button 
                    onClick={handleConfirm}
                    disabled={selectedSkus.size === 0}
                    className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
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
                 <div className="w-48 min-w-[150px]">
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wide">Category</label>
                     <select 
                        value={selectedCategory} 
                        onChange={(e) => setSelectedCategory(e.target.value)}
                        className="w-full mt-1 border border-gray-300 rounded-lg py-2 px-3 text-sm"
                     >
                         <option value="All">All Categories</option>
                         {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                     </select>
                 </div>
                 
                 {/* Bulk Rule Config */}
                 <div className="pl-4 border-l border-gray-200 flex flex-col gap-1 min-w-[200px]">
                     <label className="text-xs font-bold text-indigo-600 uppercase tracking-wide">Bulk Discount Rule</label>
                     <div className="flex items-center gap-2">
                        <select 
                            value={bulkRule.type}
                            onChange={(e) => setBulkRule({ ...bulkRule, type: e.target.value as any })}
                            className="border-gray-300 rounded-lg text-sm py-1.5"
                        >
                            <option value="PERCENTAGE">% Off</option>
                            <option value="FIXED">$ Off</option>
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
                                <th className="p-4 w-10">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedSkus.size > 0 && selectedSkus.size === filteredProducts.length}
                                        onChange={toggleAll}
                                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                    />
                                </th>
                                <th className="p-4">SKU / Category</th>
                                {/* Removed Product Name */}
                                <th className="p-4 text-right">Base Price (Net)</th>
                                <th className="p-4 text-right">Platform Price</th>
                                <th className="p-4 text-right">Optimal</th>
                                <th className="p-4 text-right">Min Price</th>
                                <th className="p-4 text-right bg-indigo-50 text-indigo-900 border-l border-indigo-100">Promo Price</th>
                                <th className="p-4 text-right">Proj. Margin</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {filteredProducts.map((p, index) => {
                                const isSelected = selectedSkus.has(p.sku);
                                const promoPrice = calculatePromoPrice(p);
                                const isManual = manualPrices[p.sku] !== undefined;
                                
                                // Dynamic Platform Price for Display
                                let platformPrice = p.currentPrice;
                                if (currentPromo.platform !== 'All') {
                                     const channel = p.channels.find(c => c.platform === currentPromo.platform);
                                     if (channel && channel.price) platformPrice = channel.price;
                                }

                                // Calc Margin
                                const fees = (p.sellingFee||0) + (p.adsFee||0) + (p.postage||0); // simplified
                                const net = promoPrice - ((p.costPrice||0) + fees);
                                const margin = promoPrice > 0 ? (net / promoPrice) * 100 : 0;

                                return (
                                    <tr 
                                        key={p.id} 
                                        className={`cursor-pointer transition-colors ${isSelected ? 'bg-indigo-50/30' : 'hover:bg-gray-50'}`}
                                        onClick={(e) => handleRowClick(p.sku, index, e)}
                                    >
                                        <td className="p-4" onClick={(e) => e.stopPropagation()}>
                                            <input 
                                                type="checkbox" 
                                                checked={isSelected}
                                                // We use onClick to handle consistent logic with row click (e.g. modifier keys)
                                                // onChange is just to suppress React warning
                                                onChange={() => {}}
                                                onClick={(e) => handleRowClick(p.sku, index, e)}
                                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                            />
                                        </td>
                                        <td className="p-4">
                                            <div className="font-mono text-gray-900 font-medium">{p.sku}</div>
                                            {/* Removed Product Name as requested */}
                                            {p.subcategory && (
                                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600 mt-1">
                                                    {p.subcategory}
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right text-gray-600">${p.currentPrice.toFixed(2)}</td>
                                        <td className="p-4 text-right text-gray-900 font-semibold">${platformPrice.toFixed(2)}</td>
                                        <td className="p-4 text-right">
                                            {p.optimalPrice ? (
                                                <span className="text-xs font-semibold text-indigo-600 flex items-center justify-end gap-1">
                                                    <Star className="w-3 h-3 fill-indigo-100" />
                                                    ${p.optimalPrice.toFixed(2)}
                                                </span>
                                            ) : <span className="text-gray-300">-</span>}
                                        </td>
                                        <td className="p-4 text-right">
                                            {p.floorPrice ? <span className="text-xs text-gray-500">${p.floorPrice.toFixed(2)}</span> : <span className="text-gray-300">-</span>}
                                        </td>
                                        <td className="p-4 text-right border-l border-gray-100">
                                            {isSelected ? (
                                                <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                                                    <input 
                                                        type="number" 
                                                        step="0.01"
                                                        value={promoPrice}
                                                        onChange={(e) => setManualPrices({...manualPrices, [p.sku]: parseFloat(e.target.value)})}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') {
                                                                e.currentTarget.blur();
                                                            }
                                                        }}
                                                        className={`w-24 text-right px-2 py-1 rounded border text-sm font-bold ${
                                                            isManual ? 'border-indigo-500 text-indigo-700 bg-white' : 'border-transparent bg-transparent text-gray-900 hover:border-gray-300'
                                                        }`}
                                                    />
                                                </div>
                                            ) : (
                                                <span className="text-gray-300">-</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            {isSelected && (
                                                <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                                                    margin < 10 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                                                }`}>
                                                    {margin.toFixed(1)}%
                                                </span>
                                            )}
                                        </td>
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

// --- SUB-COMPONENT: ALL PROMO SKUS VIEW ---

const AllPromoSkusView = ({ promotions, products }: { promotions: PromotionEvent[], products: Product[] }) => {
    const [filterQuery, setFilterQuery] = useState('');
    const [platformFilter, setPlatformFilter] = useState('All');

    // Flatten SKUs
    const allItems = useMemo(() => {
        return promotions.flatMap(promo => 
            promo.items.map(item => ({
                ...item,
                eventName: promo.name,
                eventPlatform: promo.platform,
                startDate: promo.startDate,
                endDate: promo.endDate,
                status: promo.status
            }))
        );
    }, [promotions]);

    const filteredItems = allItems.filter(i => {
        const matchesSearch = i.sku.toLowerCase().includes(filterQuery.toLowerCase()) || i.eventName.toLowerCase().includes(filterQuery.toLowerCase());
        const matchesPlatform = platformFilter === 'All' || i.eventPlatform === platformFilter;
        return matchesSearch && matchesPlatform;
    });

    const uniquePlatforms = Array.from(new Set(promotions.map(p => p.platform))).sort();

    return (
        <div className="space-y-4">
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Filter by SKU or Event Name..." 
                        value={filterQuery}
                        onChange={(e) => setFilterQuery(e.target.value)}
                        className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm"
                    />
                </div>
                <select 
                    value={platformFilter}
                    onChange={(e) => setPlatformFilter(e.target.value)}
                    className="border border-gray-300 rounded-lg px-4 py-2 text-sm"
                >
                    <option value="All">All Platforms</option>
                    {uniquePlatforms.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                        <thead className="bg-gray-50 text-gray-500 font-medium">
                            <tr>
                                <th className="p-4">SKU</th>
                                <th className="p-4">Event</th>
                                <th className="p-4">Platform</th>
                                <th className="p-4">Promo Price</th>
                                <th className="p-4">Dates</th>
                                <th className="p-4">Status</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {filteredItems.map((item, idx) => (
                                <tr key={idx} className="hover:bg-gray-50">
                                    <td className="p-4 font-mono font-medium text-gray-900">{item.sku}</td>
                                    <td className="p-4 text-gray-700">{item.eventName}</td>
                                    <td className="p-4">
                                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-800">
                                            {item.eventPlatform}
                                        </span>
                                    </td>
                                    <td className="p-4 font-bold text-indigo-600">${item.promoPrice.toFixed(2)}</td>
                                    <td className="p-4 text-xs text-gray-500">
                                        {new Date(item.startDate).toLocaleDateString()} - {new Date(item.endDate).toLocaleDateString()}
                                    </td>
                                    <td className="p-4">
                                        <StatusBadge status={item.status} />
                                    </td>
                                </tr>
                            ))}
                            {filteredItems.length === 0 && (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-500">No promo SKUs found.</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};

const StatusBadge = ({ status }: { status: string }) => {
    const styles = {
        'ACTIVE': 'bg-green-100 text-green-800 border-green-200',
        'UPCOMING': 'bg-blue-100 text-blue-800 border-blue-200',
        'ENDED': 'bg-gray-100 text-gray-800 border-gray-200',
    };
    return (
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${styles[status as keyof typeof styles] || styles['ENDED']}`}>
            {status}
        </span>
    );
};

export default PromotionPage;
