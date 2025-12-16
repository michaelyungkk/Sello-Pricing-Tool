
import React, { useState, useMemo } from 'react';
import { Product, PricingRules, PromotionEvent, PromotionItem } from '../types';
import { Plus, ChevronRight, Search, Trash2, ArrowLeft, CheckCircle, Download, Calendar, Lock, LayoutDashboard, List, Calculator, Edit2, AlertCircle, Save, X, RotateCcw, Eye, EyeOff, ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';

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
type Tab = 'dashboard' | 'all_skus' | 'simulator';
type PromoSortKey = 'name' | 'platform' | 'startDate' | 'submissionDeadline' | 'items' | 'status';

// --- MAIN COMPONENT ---

const PromotionPage: React.FC<PromotionPageProps> = ({ products, pricingRules, promotions, onAddPromotion, onUpdatePromotion, themeColor, headerStyle }) => {
  const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
  const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');

  const selectedPromo = useMemo(() => 
    promotions.find(p => p.id === selectedPromoId), 
  [promotions, selectedPromoId]);

  const handleCreateEvent = (newEvent: PromotionEvent) => {
      onAddPromotion(newEvent);
      setSelectedPromoId(newEvent.id);
      setViewMode('event_detail'); 
      setActiveTab('dashboard'); // Ensure we stay on dashboard tab to see details
  };

  const handleUpdateEventMeta = (id: string, updates: Partial<PromotionEvent>) => {
      const promo = promotions.find(p => p.id === id);
      if (!promo) return;
      onUpdatePromotion({ ...promo, ...updates });
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

  const handleTabChange = (tab: Tab) => {
      setActiveTab(tab);
      // Reset view mode when switching tabs so we don't get stuck in detail view
      if (tab !== 'dashboard') {
          setViewMode('dashboard'); 
          setSelectedPromoId(null);
      }
  };

  // Tab Header Component
  const TabHeader = () => (
      <div className="flex gap-8 border-b border-gray-200 mb-6">
          <button 
            onClick={() => handleTabChange('dashboard')}
            className={`pb-3 text-sm font-medium flex items-center gap-2 transition-colors relative ${activeTab === 'dashboard' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            style={activeTab === 'dashboard' ? { color: themeColor } : {}}
          >
              <LayoutDashboard className="w-4 h-4" />
              Dashboard
              {activeTab === 'dashboard' && <div className="absolute bottom-0 left-0 w-full h-0.5 rounded-t-full" style={{ backgroundColor: themeColor }}></div>}
          </button>
          <button 
            onClick={() => handleTabChange('all_skus')}
            className={`pb-3 text-sm font-medium flex items-center gap-2 transition-colors relative ${activeTab === 'all_skus' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            style={activeTab === 'all_skus' ? { color: themeColor } : {}}
          >
              <List className="w-4 h-4" />
              All Promo SKUs
              {activeTab === 'all_skus' && <div className="absolute bottom-0 left-0 w-full h-0.5 rounded-t-full" style={{ backgroundColor: themeColor }}></div>}
          </button>
          <button 
            onClick={() => handleTabChange('simulator')}
            className={`pb-3 text-sm font-medium flex items-center gap-2 transition-colors relative ${activeTab === 'simulator' ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
            style={activeTab === 'simulator' ? { color: themeColor } : {}}
          >
              <Calculator className="w-4 h-4" />
              Simulator
              {activeTab === 'simulator' && <div className="absolute bottom-0 left-0 w-full h-0.5 rounded-t-full" style={{ backgroundColor: themeColor }}></div>}
          </button>
      </div>
  );

  return (
    <div className="max-w-full mx-auto h-full flex flex-col w-full min-w-0 pb-10">
        
        <TabHeader />

        {/* Content Area Based on Active Tab */}
        
        {activeTab === 'dashboard' && (
            <>
                {viewMode === 'dashboard' && (
                <PromotionDashboard 
                    promotions={promotions} 
                    pricingRules={pricingRules}
                    onSelectPromo={(id: string) => { setSelectedPromoId(id); setViewMode('event_detail'); }} 
                    onCreateEvent={handleCreateEvent}
                    themeColor={themeColor}
                />
                )}
                
                {viewMode === 'event_detail' && selectedPromo && (
                <EventDetailView 
                    promo={selectedPromo} 
                    products={products}
                    onBack={() => setViewMode('dashboard')} 
                    onAddProducts={() => setViewMode('add_products')}
                    onDeleteItem={handleDeleteItem}
                    onUpdateMeta={(updates: Partial<PromotionEvent>) => handleUpdateEventMeta(selectedPromo.id, updates)}
                    themeColor={themeColor}
                />
                )}

                {viewMode === 'add_products' && selectedPromo && (
                <ProductSelector 
                    products={products}
                    currentPromo={selectedPromo}
                    onCancel={() => setViewMode('event_detail')}
                    onConfirm={handleAddItems}
                    themeColor={themeColor}
                />
                )}
            </>
        )}

        {activeTab === 'all_skus' && (
            <AllPromoSkusView promotions={promotions} products={products} themeColor={themeColor} />
        )}

        {activeTab === 'simulator' && (
            <SimulatorView themeColor={themeColor} />
        )}

    </div>
  );
};

// --- SUB-COMPONENTS ---

// --- VIEW: All Promo SKUs (Flat Table) ---
const AllPromoSkusView = ({ promotions, products, themeColor }: { promotions: PromotionEvent[], products: Product[], themeColor: string }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [platformFilter, setPlatformFilter] = useState('All Platforms');

    // Flatten data
    const allRows = useMemo(() => {
        const rows: any[] = [];
        promotions.forEach(promo => {
            promo.items.forEach(item => {
                rows.push({
                    id: `${promo.id}-${item.sku}`,
                    sku: item.sku,
                    eventName: promo.name,
                    platform: promo.platform,
                    promoPrice: item.promoPrice,
                    startDate: new Date(promo.startDate),
                    endDate: new Date(promo.endDate),
                    status: promo.status
                });
            });
        });
        return rows.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    }, [promotions]);

    const filteredRows = allRows.filter(row => {
        const matchesSearch = row.sku.toLowerCase().includes(searchQuery.toLowerCase()) || 
                              row.eventName.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesPlatform = platformFilter === 'All Platforms' || row.platform === platformFilter;
        return matchesSearch && matchesPlatform;
    });

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-GB'); // dd/mm/yyyy
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-4">
                <div className="relative flex-1">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Filter by SKU or Event Name..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50"
                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                    />
                </div>
                <div className="w-48">
                    <select 
                        value={platformFilter}
                        onChange={(e) => setPlatformFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white"
                    >
                        <option>All Platforms</option>
                        {Array.from(new Set(promotions.map(p => p.platform))).sort().map(p => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-white text-gray-500 font-bold border-b border-gray-200">
                        <tr>
                            <th className="p-4">SKU</th>
                            <th className="p-4">Event</th>
                            <th className="p-4">Platform</th>
                            <th className="p-4 text-right">Promo Price</th>
                            <th className="p-4">Dates</th>
                            <th className="p-4">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                        {filteredRows.map(row => (
                            <tr key={row.id} className="hover:bg-gray-50">
                                <td className="p-4 font-bold text-gray-700">{row.sku}</td>
                                <td className="p-4 text-gray-600">{row.eventName}</td>
                                <td className="p-4">
                                    <span className="bg-gray-100 text-gray-700 px-2 py-1 rounded text-xs font-medium border border-gray-200">
                                        {row.platform}
                                    </span>
                                </td>
                                <td className="p-4 text-right font-bold" style={{ color: themeColor }}>
                                    £{row.promoPrice.toFixed(2)}
                                </td>
                                <td className="p-4 text-gray-500 text-xs">
                                    {formatDate(row.startDate)} - {formatDate(row.endDate)}
                                </td>
                                <td className="p-4">
                                    <StatusBadge status={row.status} />
                                </td>
                            </tr>
                        ))}
                        {filteredRows.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-gray-500">
                                    No records found.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- VIEW: Simulator (Placeholder) ---
const SimulatorView = ({ themeColor }: { themeColor: string }) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-gray-200 rounded-2xl bg-gray-50/50">
            <div className="text-center p-8">
                <div className="w-16 h-16 bg-gray-200 rounded-lg flex items-center justify-center mx-auto mb-4 text-gray-400">
                    <Calculator className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-bold text-gray-600 mb-2">Advanced Simulator</h3>
                <p className="text-gray-400 text-sm max-w-sm mx-auto">
                    Break-even velocity and sophisticated margin analysis coming soon.
                </p>
            </div>
        </div>
    );
};

// --- MODALS & DETAILS ---

const CreateEventModal = ({ pricingRules, onClose, onConfirm, themeColor }: any) => {
    const [formData, setFormData] = useState({ name: '', platform: Object.keys(pricingRules)[0] || 'Amazon', startDate: '', endDate: '', deadline: '', remark: '' });
    const [error, setError] = useState<string | null>(null);
    
    const handleSubmit = () => {
        if (!formData.name.trim()) {
            setError("Event Name is required.");
            return;
        }
        if (!formData.startDate) {
            setError("Start Date is required.");
            return;
        }
        if (!formData.endDate) {
            setError("End Date is required.");
            return;
        }
        
        onConfirm({ 
            id: `evt-${Date.now()}`, 
            name: formData.name, 
            platform: formData.platform, 
            startDate: formData.startDate, 
            endDate: formData.endDate, 
            submissionDeadline: formData.deadline || undefined, 
            remark: formData.remark, 
            status: 'UPCOMING', 
            items: [] 
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
                <h2 className="text-xl font-bold text-gray-900">Create New Event</h2>
                {error && (
                    <div className="flex items-center gap-2 text-red-700 bg-red-50 p-3 rounded-lg text-sm border border-red-100">
                        <AlertCircle className="w-4 h-4" />
                        {error}
                    </div>
                )}
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Event Name <span className="text-red-500">*</span></label>
                        <input type="text" placeholder="e.g. Summer Sale 2025" className="w-full border p-2 rounded-lg focus:ring-2 focus:ring-opacity-50" style={{ '--tw-ring-color': themeColor } as React.CSSProperties} value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Platform</label>
                        <select className="w-full border p-2 rounded-lg" value={formData.platform} onChange={e => setFormData({...formData, platform: e.target.value})}>
                            {Object.keys(pricingRules).map(p => <option key={p} value={p}>{p}</option>)}
                            <option value="All">All Platforms</option>
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date <span className="text-red-500">*</span></label>
                            <input type="date" className="w-full border p-2 rounded-lg" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">End Date <span className="text-red-500">*</span></label>
                            <input type="date" className="w-full border p-2 rounded-lg" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Submission Deadline</label>
                        <input type="date" className="w-full border p-2 rounded-lg" value={formData.deadline} onChange={e => setFormData({...formData, deadline: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Remark (Optional)</label>
                        <textarea 
                            placeholder="Add internal notes about this event..." 
                            className="w-full border p-2 rounded-lg text-sm h-20 resize-none"
                            value={formData.remark}
                            onChange={e => setFormData({...formData, remark: e.target.value})}
                        />
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 text-white rounded-lg shadow-sm hover:opacity-90 transition-opacity" style={{ backgroundColor: themeColor }}>Create Event</button>
                </div>
            </div>
        </div>
    );
}

const EditEventModal = ({ promo, onClose, onConfirm, themeColor }: { promo: PromotionEvent, onClose: () => void, onConfirm: (updates: Partial<PromotionEvent>) => void, themeColor: string }) => {
    const [formData, setFormData] = useState({ 
        name: promo.name, 
        startDate: promo.startDate, 
        endDate: promo.endDate, 
        submissionDeadline: promo.submissionDeadline || '',
        remark: promo.remark || '' 
    });
    const [error, setError] = useState<string | null>(null);

    const handleSubmit = () => {
        if (!formData.name.trim() || !formData.startDate || !formData.endDate) {
            setError("Required fields cannot be empty.");
            return;
        }
        onConfirm(formData);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 flex flex-col gap-4 animate-in fade-in zoom-in duration-200">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900">Edit Event Details</h2>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
                </div>
                
                {error && <div className="text-red-600 text-sm bg-red-50 p-2 rounded border border-red-100">{error}</div>}
                
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Event Name</label>
                        <input type="text" className="w-full border p-2 rounded-lg" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                            <input type="date" className="w-full border p-2 rounded-lg" value={formData.startDate} onChange={e => setFormData({...formData, startDate: e.target.value})} />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                            <input type="date" className="w-full border p-2 rounded-lg" value={formData.endDate} onChange={e => setFormData({...formData, endDate: e.target.value})} />
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Submission Deadline</label>
                        <input type="date" className="w-full border p-2 rounded-lg" value={formData.submissionDeadline} onChange={e => setFormData({...formData, submissionDeadline: e.target.value})} />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Remark</label>
                        <textarea className="w-full border p-2 rounded-lg text-sm h-24 resize-none" value={formData.remark} onChange={e => setFormData({...formData, remark: e.target.value})} />
                    </div>
                </div>

                <div className="flex justify-end gap-2 mt-4">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 text-white rounded-lg" style={{ backgroundColor: themeColor }}>Save Changes</button>
                </div>
            </div>
        </div>
    );
};

const EventDetailView = ({ promo, products, onBack, onAddProducts, onDeleteItem, onUpdateMeta, themeColor }: any) => {
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    
    // Logic: Allow adding/deleting only if event hasn't started yet (today < startDate)
    // Using simple string comparison for dates works for ISO YYYY-MM-DD
    const today = new Date().toISOString().split('T')[0];
    const isUpcoming = promo.startDate > today;

    const handleExport = () => {
        const headers = ['SKU', 'Master SKU', 'Product Name', 'Base Price', 'Promo Price', 'Discount %'];
        const rows = promo.items.map((item: any) => {
            const product = products.find((p: Product) => p.sku === item.sku);
            
            // Find platform-specific alias
            let exportSku = item.sku;
            if (product && promo.platform !== 'All') {
                const channel = product.channels.find((c: any) => c.platform === promo.platform);
                if (channel?.skuAlias) {
                    exportSku = channel.skuAlias;
                }
            }

            const discountPct = ((item.basePrice - item.promoPrice) / item.basePrice * 100).toFixed(2);

            return [
                exportSku,
                item.sku,
                `"${product?.name?.replace(/"/g, '""') || ''}"`,
                item.basePrice.toFixed(2),
                item.promoPrice.toFixed(2),
                `${discountPct}%`
            ];
        });

        const csvContent = [headers.join(','), ...rows.map((r: any[]) => r.join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', `promo_export_${promo.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6 h-full flex flex-col">
            {/* Header */}
            <div className="flex flex-col gap-4">
                <div className="flex items-start justify-between">
                    <div className="flex items-start gap-4">
                        <button onClick={onBack} className="p-2 bg-white rounded-full shadow-sm hover:bg-gray-50 border border-gray-200 transition-colors mt-1">
                            <ArrowLeft className="w-5 h-5 text-gray-600"/>
                        </button> 
                        <div>
                            <div className="flex items-center gap-3">
                                <h2 className="text-2xl font-bold text-gray-900">{promo.name}</h2>
                                <StatusBadge status={promo.status} />
                                <span className="inline-flex items-center justify-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200">
                                    {promo.items.length} SKUs
                                </span>
                                <button 
                                    onClick={() => setIsEditModalOpen(true)}
                                    className="p-1 text-gray-400 hover:text-indigo-600 transition-colors rounded hover:bg-gray-100"
                                    title="Edit Event Details"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </button>
                            </div>
                            <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4" />
                                    <span>{new Date(promo.startDate).toLocaleDateString()} - {new Date(promo.endDate).toLocaleDateString()}</span>
                                </div>
                                <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                <span className="font-medium text-gray-700">{promo.platform}</span>
                                {promo.remark && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                        <span className="text-gray-500 italic max-w-lg truncate">{promo.remark}</span>
                                    </>
                                )}
                                {promo.submissionDeadline && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                                        <span className="text-red-600 font-medium">Deadline: {new Date(promo.submissionDeadline).toLocaleDateString()}</span>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-3">
                        {promo.items.length > 0 && (
                            <button 
                                onClick={handleExport}
                                className="bg-white text-gray-700 border border-gray-300 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors flex items-center gap-2"
                            >
                                <Download className="w-4 h-4" />
                                Export List
                            </button>
                        )}
                        {isUpcoming ? (
                            <button 
                                onClick={onAddProducts} 
                                className="text-white px-4 py-2 rounded-lg flex items-center gap-2 shadow-md hover:opacity-90 transition-opacity text-sm font-medium" 
                                style={{ backgroundColor: themeColor }}
                            >
                                <Plus className="w-4 h-4"/> 
                                Add Products
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-500 rounded-lg text-sm border border-gray-200 cursor-not-allowed" title="Cannot add products to active or past events">
                                <Lock className="w-4 h-4" />
                                Event Locked
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Empty State or Table */}
            {promo.items.length === 0 ? (
                <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 border-dashed flex flex-col items-center justify-center p-12 text-center min-h-[400px]">
                    <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                        <CheckCircle className="w-8 h-8 text-gray-300" />
                    </div>
                    <h3 className="text-lg font-bold text-gray-900">No Products Yet</h3>
                    <p className="text-gray-500 max-w-sm mt-2 mb-6">
                        Start by adding products to this promotion event. You can filter by category and apply bulk discounts.
                    </p>
                    {isUpcoming && (
                        <button 
                            onClick={onAddProducts}
                            className="px-6 py-2.5 text-white font-medium rounded-lg shadow-md transition-all hover:opacity-90"
                            style={{ backgroundColor: themeColor }}
                        >
                            Create Promotion List
                        </button>
                    )}
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex-1 flex flex-col min-h-0">
                    <div className="overflow-auto">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-white text-gray-500 font-bold border-b border-gray-200">
                                <tr>
                                    <th className="p-4">SKU / Category</th>
                                    <th className="p-4 text-right">Base Price (Net)</th>
                                    <th className="p-4 text-right">Platform Price</th>
                                    <th className="p-4 text-right">Discount</th>
                                    <th className="p-4 text-right">Promo Price</th>
                                    <th className="p-4"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100 bg-white">
                                {promo.items.map((item: any, idx: number) => {
                                    const discountPercent = ((item.basePrice - item.promoPrice) / item.basePrice * 100).toFixed(0);
                                    // Find product details for category display
                                    const product = products.find((p: Product) => p.sku === item.sku);
                                    
                                    return (
                                        <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                            <td className="p-4">
                                                <div className="font-bold text-gray-900">{item.sku}</div>
                                                {product?.category && <div className="text-xs text-gray-500 mt-0.5">{product.category}</div>}
                                            </td>
                                            <td className="p-4 text-right text-gray-500">£{item.basePrice.toFixed(2)}</td>
                                            <td className="p-4 text-right text-gray-900 font-medium">£{item.basePrice.toFixed(2)}</td>
                                            <td className="p-4 text-right">
                                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-bold bg-red-50 text-red-600">
                                                    -{discountPercent}%
                                                </span>
                                            </td>
                                            <td className="p-4 text-right font-bold text-base text-gray-900">£{item.promoPrice.toFixed(2)}</td>
                                            <td className="p-4 text-right">
                                                {isUpcoming && (
                                                    <button onClick={() => onDeleteItem(item.sku)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors">
                                                        <Trash2 className="w-4 h-4"/>
                                                    </button>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {isEditModalOpen && (
                <EditEventModal 
                    promo={promo} 
                    onClose={() => setIsEditModalOpen(false)} 
                    onConfirm={onUpdateMeta}
                    themeColor={themeColor}
                />
            )}
        </div>
    );
};

// PRODUCT SELECTOR
const ProductSelector = ({ products, currentPromo, onCancel, onConfirm, themeColor }: { 
    products: Product[], 
    currentPromo: PromotionEvent,
    onCancel: () => void,
    onConfirm: (items: PromotionItem[]) => void,
    themeColor: string
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('All Categories');
    const [bulkRule, setBulkRule] = useState<{ type: 'PERCENTAGE' | 'FIXED', value: number }>({ type: 'PERCENTAGE', value: 10 });
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
    const [showInactive, setShowInactive] = useState(false); // New Toggle for Inactive Products

    const existingSkuSet = useMemo(() => new Set(currentPromo.items.map(i => i.sku)), [currentPromo]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            // 1. Exclude already added
            if (existingSkuSet.has(p.sku)) return false;
            
            // 2. Hide Inactive (Ghost) Logic
            if (!showInactive && p.stockLevel <= 0 && p.averageDailySales === 0) {
                return false;
            }

            // 3. Platform Filtering Logic
            if (currentPromo.platform !== 'All') {
                const isSoldOnPlatform = p.channels.some(c => c.platform === currentPromo.platform);
                if (!isSoldOnPlatform) return false;
            }

            // 4. Search & Category Filters
            const matchSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || p.sku.toLowerCase().includes(searchQuery.toLowerCase());
            const matchCat = selectedCategory === 'All Categories' || p.category === selectedCategory;
            
            return matchSearch && matchCat;
        });
    }, [products, searchQuery, selectedCategory, existingSkuSet, currentPromo.platform, showInactive]);

    const uniqueCategories = useMemo(() => {
        const cats = new Set(products.map(p => p.category || 'Uncategorized'));
        return Array.from(cats).filter(Boolean).sort();
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

    // Helper: Round to .95
    const roundTo95 = (price: number, originalPrice: number): number => {
        // Calculate floor + 0.95
        const candidate = Math.floor(price) + 0.95;
        // If candidate > price (e.g. 10.2 -> 10.95), we might want to round down to previous .95?
        // Logic: if calculated discount price is 10.10, selling at 10.95 is valid if discount % allows, 
        // BUT usually we want to stay *under* the target discount.
        // So if candidate > price, calculate floor - 0.05 (previous .95)
        if (candidate > price) {
            return Math.max(0.95, candidate - 1);
        }
        return Number(candidate.toFixed(2));
    };

    const calculatePromoPrice = (product: Product) => {
        // 1. Check override
        if (priceOverrides[product.sku] !== undefined) {
            return priceOverrides[product.sku];
        }

        // 2. Determine base platform price
        let price = product.currentPrice;
        if (currentPromo.platform !== 'All') {
             const channel = product.channels.find(c => c.platform === currentPromo.platform);
             // Ensure we use the Platform-specific price (channel.price) if available, falling back to global price.
             // Crucially, ignore optimalPrice.
             if (channel && channel.price) price = channel.price;
        }

        // 3. Apply Bulk Rule
        let targetPrice = price;
        if (bulkRule.type === 'PERCENTAGE') {
            targetPrice = price * (1 - bulkRule.value / 100);
        } else {
            targetPrice = Math.max(0, price - bulkRule.value);
        }

        // 4. Apply .95 ending rule
        const result = roundTo95(targetPrice, price);
        return Number(result.toFixed(2));
    };

    const handlePriceOverride = (sku: string, val: string) => {
        const num = parseFloat(val);
        if (isNaN(num)) {
            const newO = { ...priceOverrides };
            delete newO[sku];
            setPriceOverrides(newO);
        } else {
            setPriceOverrides({ ...priceOverrides, [sku]: num });
        }
    };

    const calculateMargin = (product: Product, promoPrice: number) => {
        const cost = (product.costPrice || 0) + (product.sellingFee || 0) + (product.postage || 0); 
        const margin = ((promoPrice - cost) / promoPrice) * 100;
        return margin;
    };

    const handleConfirm = () => {
        const items: PromotionItem[] = Array.from(selectedSkus).map((sku: string) => {
            const product = products.find(p => p.sku === sku)!;
            const promoPrice = calculatePromoPrice(product);
            return {
                sku,
                basePrice: product.currentPrice,
                discountType: bulkRule.type,
                discountValue: bulkRule.value,
                promoPrice
            };
        });
        onConfirm(items);
    };

    return (
        <div className="space-y-6 h-[calc(100vh-150px)] flex flex-col">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm font-medium transition-colors">
                        <ArrowLeft className="w-4 h-4" /> Cancel
                    </button>
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 ml-2">Add Products to {currentPromo.name}</h2>
                        {currentPromo.platform !== 'All' && (
                            <p className="text-xs text-indigo-600 ml-2 font-medium">Filtering for: {currentPromo.platform}</p>
                        )}
                    </div>
                </div>
                <button 
                    onClick={handleConfirm}
                    disabled={selectedSkus.size === 0}
                    className="px-6 py-2 text-white rounded-lg font-medium shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-all hover:opacity-90"
                    style={{ backgroundColor: themeColor }}
                >
                    <CheckCircle className="w-4 h-4" />
                    Add {selectedSkus.size} Products
                </button>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-wrap items-end gap-4">
                 <div className="flex-1 min-w-[200px]">
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Search</label>
                     <div className="relative">
                         <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                         <input 
                            type="text" 
                            placeholder="Search SKU..." 
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-opacity-50"
                            style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                         />
                     </div>
                 </div>
                 <div className="w-48">
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Category</label>
                     <select 
                        value={selectedCategory} 
                        onChange={(e) => setSelectedCategory(e.target.value)} 
                        className="w-full border border-gray-300 rounded-lg py-2 px-3 text-sm bg-white focus:ring-2 focus:ring-opacity-50"
                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                     >
                         <option>All Categories</option>
                         {uniqueCategories.map(c => <option key={c} value={c}>{c}</option>)}
                     </select>
                 </div>
                 
                 <div className="pl-4 border-l border-gray-200 flex flex-col justify-end">
                     <label className="text-xs font-bold text-indigo-600 uppercase tracking-wide mb-1 block">Bulk Discount Rule</label>
                     <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">% Off</span>
                        <input 
                            type="number" 
                            value={bulkRule.value}
                            onChange={(e) => {
                                setBulkRule({ ...bulkRule, value: parseFloat(e.target.value) });
                                // Clear overrides when bulk rule changes to encourage recalculation
                                setPriceOverrides({});
                            }}
                            className="w-16 border-gray-300 rounded-lg text-sm py-1.5 px-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                        />
                     </div>
                 </div>

                 {/* Inactive Toggle */}
                 <div className="flex flex-col justify-end">
                     <label className="text-xs font-bold text-gray-500 uppercase tracking-wide mb-1 block">Show Inactive</label>
                     <button
                        onClick={() => setShowInactive(!showInactive)}
                        className={`flex items-center justify-center w-10 h-9 rounded-lg border transition-colors ${showInactive ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-gray-300 text-gray-400'}`}
                        title="Show products with 0 stock and 0 sales"
                     >
                         {showInactive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                     </button>
                 </div>
            </div>

            <div className="flex-1 bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-0">
                <div className="overflow-auto flex-1">
                    <table className="w-full text-left text-sm select-none whitespace-nowrap">
                        <thead className="bg-gray-50 text-gray-700 font-bold sticky top-0 z-10 shadow-sm">
                            <tr>
                                <th className="p-4 w-10 border-b border-gray-200"><input type="checkbox" onChange={toggleAll} checked={selectedSkus.size > 0 && selectedSkus.size === filteredProducts.length} className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></th>
                                <th className="p-4 border-b border-gray-200">SKU / Category</th>
                                <th className="p-4 text-right border-b border-gray-200">Base Price (Net)</th>
                                <th className="p-4 text-right border-b border-gray-200">Platform Price</th>
                                <th className="p-4 text-right border-b border-gray-200">Optimal</th>
                                <th className="p-4 text-right border-b border-gray-200">Min Price</th>
                                <th className="p-4 text-right border-b border-gray-200 bg-indigo-50 text-indigo-900">Promo Price</th>
                                <th className="p-4 text-right border-b border-gray-200">Proj. Margin</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100 bg-white">
                            {filteredProducts.map((p) => {
                                const isSelected = selectedSkus.has(p.sku);
                                const promoPrice = calculatePromoPrice(p);
                                const isOverridden = priceOverrides[p.sku] !== undefined;
                                const margin = calculateMargin(p, promoPrice);
                                
                                return (
                                    <tr key={p.id} onClick={(e) => { 
                                        // Don't toggle row selection if clicking inside input
                                        if ((e.target as HTMLElement).tagName !== 'INPUT') {
                                            handleRowClick(p.sku);
                                        }
                                    }} className={`cursor-pointer hover:bg-gray-50 transition-colors`} style={isSelected ? { backgroundColor: `${themeColor}08` } : {}}>
                                        <td className="p-4"><input type="checkbox" checked={isSelected} readOnly className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500" /></td>
                                        <td className="p-4">
                                            <div className="font-bold text-gray-900">{p.sku}</div>
                                            <div className="inline-block mt-1 px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded border border-gray-200">{p.category || 'Uncategorized'}</div>
                                        </td>
                                        <td className="p-4 text-right text-gray-500">£{p.currentPrice.toFixed(2)}</td>
                                        <td className="p-4 text-right font-medium text-gray-900">£{p.currentPrice.toFixed(2)}</td>
                                        <td className="p-4 text-right text-indigo-600 font-medium">
                                            {p.optimalPrice ? `☆ £${p.optimalPrice.toFixed(2)}` : '-'}
                                        </td>
                                        <td className="p-4 text-right text-gray-400">{p.floorPrice ? `£${p.floorPrice}` : '-'}</td>
                                        <td className="p-4 text-right bg-indigo-50/30">
                                            <div className="flex items-center justify-end gap-1">
                                                <span className="text-gray-400 text-xs">£</span>
                                                <input 
                                                    type="number"
                                                    step="0.01"
                                                    value={promoPrice}
                                                    onClick={(e) => e.stopPropagation()} // Prevent row click
                                                    onChange={(e) => handlePriceOverride(p.sku, e.target.value)}
                                                    className={`w-20 px-1 py-1 text-right text-base font-bold bg-transparent border-b border-dashed focus:border-indigo-500 focus:outline-none focus:bg-white ${isOverridden ? 'text-indigo-600 border-indigo-300' : 'text-gray-900 border-gray-300'}`}
                                                />
                                                {isOverridden && (
                                                    <button 
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            const newO = { ...priceOverrides };
                                                            delete newO[p.sku];
                                                            setPriceOverrides(newO);
                                                        }}
                                                        className="text-gray-400 hover:text-indigo-600"
                                                        title="Reset to calculated price"
                                                    >
                                                        <RotateCcw className="w-3 h-3" />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <span className={`px-2 py-0.5 rounded text-xs font-bold ${margin > 15 ? 'bg-green-100 text-green-700' : margin > 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                                                {margin.toFixed(1)}%
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                            {filteredProducts.length === 0 && (
                                <tr>
                                    <td colSpan={8} className="p-12 text-center text-gray-500">
                                        {products.length > 0 
                                            ? `No products found. (Showing only products selling on ${currentPromo.platform})`
                                            : "No products available."}
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

const StatusBadge = ({status}: any) => {
    const styles = {
        'ACTIVE': 'bg-green-100 text-green-700 border-green-200',
        'UPCOMING': 'bg-blue-100 text-blue-700 border-blue-200',
        'ENDED': 'bg-gray-100 text-gray-600 border-gray-200'
    };
    return (
        <span className={`text-[10px] font-bold px-3 py-0.5 rounded-full border uppercase tracking-wide ${(styles as any)[status] || styles['ENDED']}`}>
            {status}
        </span>
    );
};

// --- MAIN DASHBOARD VIEW ---

const PromotionDashboard = ({ promotions, pricingRules, onSelectPromo, onCreateEvent, themeColor }: any) => {
    const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [sortConfig, setSortConfig] = useState<{ key: PromoSortKey; direction: 'asc' | 'desc' } | null>(null);

    const handleSort = (key: PromoSortKey) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const sortedPromotions = useMemo(() => {
        let filtered = promotions.filter((p: any) => 
            p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
            p.platform.toLowerCase().includes(searchQuery.toLowerCase())
        );

        if (sortConfig) {
            filtered.sort((a: any, b: any) => {
                let aValue: any = a[sortConfig.key];
                let bValue: any = b[sortConfig.key];

                if (sortConfig.key === 'items') {
                    aValue = a.items.length;
                    bValue = b.items.length;
                } else if (sortConfig.key === 'startDate' || sortConfig.key === 'submissionDeadline') {
                    // Handle missing deadlines (push to bottom usually, or treat as max date)
                    if (!aValue) return 1;
                    if (!bValue) return -1;
                    aValue = new Date(aValue).getTime();
                    bValue = new Date(bValue).getTime();
                } else if (typeof aValue === 'string') {
                    aValue = aValue.toLowerCase();
                    bValue = bValue.toLowerCase();
                }

                if (aValue < bValue) return sortConfig.direction === 'asc' ? -1 : 1;
                if (aValue > bValue) return sortConfig.direction === 'asc' ? 1 : -1;
                return 0;
            });
        } else {
            // Default Sort: Start Date (Ascending)
            filtered.sort((a: any, b: any) => new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
        }

        return filtered;
    }, [promotions, searchQuery, sortConfig]);

    const SortHeader = ({ label, sortKey, alignCenter = false }: { label: string, sortKey: PromoSortKey, alignCenter?: boolean }) => {
        const isActive = sortConfig?.key === sortKey;
        return (
            <th 
                className={`p-4 cursor-pointer select-none hover:bg-gray-100 transition-colors ${alignCenter ? 'text-center' : 'text-left'}`}
                onClick={() => handleSort(sortKey)}
            >
                <div className={`flex items-center gap-1 ${alignCenter ? 'justify-center' : 'justify-start'}`}>
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

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                    <input 
                        type="text" 
                        placeholder="Search event name or platform..." 
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-opacity-50"
                        style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
                    />
                </div>
                <button 
                    onClick={() => setIsCreateModalOpen(true)}
                    className="px-4 py-2 text-white rounded-lg flex items-center gap-2 text-sm font-medium shadow-sm whitespace-nowrap transition-colors hover:opacity-90"
                    style={{ backgroundColor: themeColor }}
                >
                    <Plus className="w-4 h-4" />
                    Create Event
                </button>
            </div>

             <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50 text-gray-700 font-bold border-b border-gray-200">
                        <tr>
                            <SortHeader label="Event Name" sortKey="name" />
                            <SortHeader label="Platform" sortKey="platform" />
                            <SortHeader label="Start Date" sortKey="startDate" />
                            <SortHeader label="Deadline" sortKey="submissionDeadline" />
                            <SortHeader label="SKUs" sortKey="items" alignCenter />
                            <SortHeader label="Status" sortKey="status" />
                            <th className="p-4"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                        {sortedPromotions.map((p: any) => (
                            <tr key={p.id} className="hover:bg-gray-50 group cursor-pointer transition-colors" onClick={() => onSelectPromo(p.id)}>
                                <td className="p-4 font-semibold text-gray-900">
                                    {p.name}
                                    {p.remark && <div className="text-xs text-gray-400 font-normal mt-0.5 truncate max-w-[200px]">{p.remark}</div>}
                                </td>
                                <td className="p-4">
                                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700 border border-gray-200">
                                        {p.platform}
                                    </span>
                                </td>
                                <td className="p-4 text-gray-500">
                                    <div className="flex flex-col text-xs">
                                        <span className="font-medium text-gray-900">{new Date(p.startDate).toLocaleDateString()}</span>
                                        <span className="text-gray-400">to {new Date(p.endDate).toLocaleDateString()}</span>
                                    </div>
                                </td>
                                <td className="p-4">
                                    {p.submissionDeadline ? (
                                        <span className={`text-xs font-bold ${new Date(p.submissionDeadline) < new Date() && p.status === 'UPCOMING' ? 'text-red-600' : 'text-gray-600'}`}>
                                            {new Date(p.submissionDeadline).toLocaleDateString()}
                                        </span>
                                    ) : '-'}
                                </td>
                                <td className="p-4 text-center">
                                    <span className="inline-flex items-center justify-center w-8 h-6 rounded bg-gray-100 text-gray-700 font-mono text-xs font-bold">
                                        {p.items.length}
                                    </span>
                                </td>
                                <td className="p-4">
                                    <StatusBadge status={p.status} />
                                </td>
                                <td className="p-4 text-right">
                                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-gray-600 transition-colors" />
                                </td>
                            </tr>
                        ))}
                        {sortedPromotions.length === 0 && (
                            <tr>
                                <td colSpan={7} className="p-8 text-center text-gray-500">
                                    No promotions found. Create one to get started.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
            {isCreateModalOpen && <CreateEventModal pricingRules={pricingRules} onClose={() => setIsCreateModalOpen(false)} onConfirm={onCreateEvent} themeColor={themeColor} />}
        </div>
    );
};

export default PromotionPage;
