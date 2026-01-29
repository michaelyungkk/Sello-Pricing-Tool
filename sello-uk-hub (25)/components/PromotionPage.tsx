import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, PricingRules, PromotionEvent, PromotionItem, PriceLog, LogisticsRule, PriceChangeRecord } from '../types';
import { TagSearchInput } from './TagSearchInput';
import { GradeBadge } from './GradeBadge';
import { Plus, ChevronRight, Search, Trash2, ArrowLeft, CheckCircle, Check, Download, Calendar, Lock, Unlock, LayoutDashboard, List, Calculator, Edit2, AlertCircle, Save, X, RotateCcw, Eye, EyeOff, ArrowUpDown, ChevronUp, ChevronDown, Upload, FileText, Loader2, RefreshCw, TrendingUp, TrendingDown, Target, ShoppingBag, Coins, Truck, Info, HelpCircle, Archive, Zap, Clock, Star, Filter, BarChart3, PieChart as PieIcon, Activity } from 'lucide-react';
import * as XLSX from 'xlsx';
import { SortState, sortRows } from '../utils/tableSort';
import { SortableHeader } from './common/SortableHeader';
import { asDateKey } from '../services/dateUtils';
import { computePromoWindows, computePromoEffectiveness, PromoPhase, deriveDiscountedPrice } from '../services/promotionAnalytics';
import { formatMoney, formatPct, formatNumber } from '../utils/format';

interface PromotionPageProps {
    products: Product[];
    pricingRules: PricingRules;
    logisticsRules?: LogisticsRule[];
    promotions: PromotionEvent[];
    priceHistoryMap?: Map<string, PriceLog[]>;
    onAddPromotion: (promo: PromotionEvent) => void;
    onUpdatePromotion: (promo: PromotionEvent) => void;
    onDeletePromotion: (id: string) => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
    priceChangeHistory?: PriceChangeRecord[];
}

type ViewMode = 'dashboard' | 'event_detail' | 'add_products';
type Tab = 'dashboard' | 'all_skus' | 'simulator';

// Standard UK VAT
const VAT = 1.20;

// --- HELPERS ---

const calculateEffectivePrice = (baseline: number, type: string, value: number): number => {
    if (!value && type !== 'PERCENT_OFF') return 0;
    switch (type) {
        case 'PERCENT_OFF':
        case 'PERCENTAGE':
            return baseline * (1 - (value / 100));
        case 'FIXED_OFF':
            return Math.max(0, baseline - value);
        case 'FIXED_PRICE':
        default:
            return value;
    }
};

const getBaselineForProduct = (promo: PromotionEvent, product?: Product): number => {
    if (promo.baselineMode === 'MANUAL') return promo.baselineManualPrice || 0;
    if (!product) return 0;
    if (promo.baselineMode === 'CA_PRICE' && product.caPrice) return product.caPrice;
    // Fallback: Pre-event average (VAT Inc)
    return (product.currentPrice || 0) * VAT;
};

// --- HELPER COMPONENTS ---

const StatusBadge = ({ status }: { status: 'UPCOMING' | 'ACTIVE' | 'ENDED' }) => {
    const styles = {
        UPCOMING: 'bg-blue-100 text-blue-700 border-blue-200',
        ACTIVE: 'bg-green-100 text-green-700 border-green-200',
        ENDED: 'bg-gray-100 text-gray-600 border-gray-200'
    };
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${styles[status]}`}>
            {status === 'UPCOMING' && <Clock className="w-3 h-3 mr-1" />}
            {status === 'ACTIVE' && <Zap className="w-3 h-3 mr-1" />}
            {status === 'ENDED' && <Archive className="w-3 h-3 mr-1" />}
            {status}
        </span>
    );
};

// --- MODALS ---

const PromoUploadModal = ({ products, themeColor, onClose, onConfirm }: { products: Product[], themeColor: string, onClose: () => void, onConfirm: (items: any[]) => void }) => {
    const [dragActive, setDragActive] = useState(false);
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFile = (file: File) => {
        setIsProcessing(true);
        setError(null);
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                let rows: any[] = [];
                if (file.name.endsWith('.xlsx')) {
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    rows = XLSX.utils.sheet_to_json(sheet);
                } else {
                    const text = data as string;
                    rows = text.split('\n').map(l => {
                        const [sku, price] = l.split(',');
                        return { sku: sku?.trim(), price: price?.trim() };
                    }).filter(r => r.sku);
                }

                const parsed = rows.map((r: any) => {
                    const skuKey = Object.keys(r).find(k => k.toLowerCase().includes('sku'));
                    const priceKey = Object.keys(r).find(k => k.toLowerCase().includes('price'));
                    
                    const sku = skuKey ? r[skuKey] : r[0] || r['sku'] || r['SKU'];
                    const price = priceKey ? r[priceKey] : r[1] || r['price'] || r['Price'];

                    return {
                        sku: String(sku).trim(),
                        price: parseFloat(String(price).replace(/[^0-9.]/g, '')) || 0
                    };
                }).filter(i => i.sku && i.price > 0 && products.some(p => p.sku === i.sku));

                if (parsed.length === 0) throw new Error("No valid products found in file.");
                onConfirm(parsed);
            } catch (err: any) {
                setError(err.message || "Failed to parse file.");
            } finally {
                setIsProcessing(false);
            }
        };
        if (file.name.endsWith('.xlsx')) reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="font-bold text-gray-900">Batch Upload Items</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>
                
                <div 
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center transition-all ${dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:bg-gray-50'}`}
                    onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
                    onDragLeave={() => setDragActive(false)}
                    onDrop={(e) => { e.preventDefault(); setDragActive(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
                >
                    <input ref={fileInputRef} type="file" className="hidden" accept=".csv,.xlsx" onChange={(e) => e.target.files && handleFile(e.target.files[0])} />
                    {isProcessing ? (
                        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
                    ) : (
                        <>
                            <Upload className="w-8 h-8 text-gray-400 mb-2" />
                            <p className="text-sm font-medium text-gray-900">Drag & Drop or <button onClick={() => fileInputRef.current?.click()} className="text-indigo-600 hover:underline">Browse</button></p>
                            <p className="text-xs text-gray-500 mt-1">Columns: SKU, Promo Price</p>
                        </>
                    )}
                </div>
                {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
                
                <div className="flex justify-end mt-4">
                    <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-900">Cancel</button>
                </div>
            </div>
        </div>
    );
};

const CreateEventModal = ({ onClose, onCreate, platforms, themeColor }: any) => {
    const [formData, setFormData] = useState<Partial<PromotionEvent>>({
        name: '',
        platform: 'All',
        startDate: '',
        endDate: '',
        submissionDeadline: '',
        remark: '',
        promotionScope: 'SKU',
        baselineMode: 'CA_PRICE',
        baselineManualPrice: 0,
        shopDiscountType: 'PERCENT_OFF',
        shopDiscountValue: 0
    });
    const [errors, setErrors] = useState<Record<string, boolean>>({});

    const handleSubmit = () => {
        const newErrors: Record<string, boolean> = {};
        if (!formData.name) newErrors.name = true;
        if (!formData.startDate) newErrors.startDate = true;
        if (!formData.endDate) newErrors.endDate = true;

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        onCreate({
            id: `promo-${Date.now()}`,
            ...formData,
            status: 'UPCOMING',
            items: []
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-900">Create New Campaign</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
                </div>
                <div className="space-y-5">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Campaign Name <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 ${errors.name ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                value={formData.name}
                                onChange={e => { setFormData({ ...formData, name: e.target.value }); setErrors({ ...errors, name: false }); }}
                                placeholder="e.g. Winter Clearance"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Platform <span className="text-red-500">*</span></label>
                            <select
                                className="w-full border rounded-lg px-3 py-2 text-sm border-gray-300 bg-white"
                                value={formData.platform}
                                onChange={e => setFormData({ ...formData, platform: e.target.value })}
                            >
                                <option value="All">All Platforms</option>
                                {(platforms || []).map((p: string) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Promotion Scope</label>
                            <select
                                className="w-full border rounded-lg px-3 py-2 text-sm border-gray-300 bg-white"
                                value={formData.promotionScope}
                                onChange={e => setFormData({ ...formData, promotionScope: e.target.value as any })}
                            >
                                <option value="SKU">SKU (Individual Pricing)</option>
                                <option value="SHOP">SHOP (Global Shop Rule)</option>
                            </select>
                        </div>
                    </div>

                    {/* Baseline Settings */}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 grid grid-cols-2 gap-4">
                        <div className={formData.baselineMode === 'MANUAL' ? 'col-span-1' : 'col-span-2'}>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Baseline Mode</label>
                            <select
                                className="w-full border rounded-lg px-3 py-2 text-sm border-gray-300 bg-white"
                                value={formData.baselineMode}
                                onChange={e => setFormData({ ...formData, baselineMode: e.target.value as any })}
                            >
                                <option value="CA_PRICE">Channel Advisor Price</option>
                                <option value="PRE_EVENT_AVG_PRICE">Pre-Event Avg Selling Price</option>
                                <option value="MANUAL">Manual Baseline Price</option>
                            </select>
                        </div>
                        {formData.baselineMode === 'MANUAL' && (
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Manual Baseline (£)</label>
                                <input
                                    type="number"
                                    className="w-full border rounded-lg px-3 py-2 text-sm border-gray-300"
                                    value={formData.baselineManualPrice}
                                    onChange={e => setFormData({ ...formData, baselineManualPrice: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        )}
                    </div>

                    {/* Shop Discount Settings - ONLY if scope is SHOP */}
                    {formData.promotionScope === 'SHOP' && (
                        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 animate-in zoom-in-95 duration-200">
                            <h4 className="text-[10px] font-black text-indigo-500 uppercase mb-3 tracking-widest">Global Shop Discount Rule</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Discount Type</label>
                                    <select
                                        className="w-full border rounded-lg px-3 py-2 text-sm border-indigo-200 bg-white"
                                        value={formData.shopDiscountType}
                                        onChange={e => setFormData({ ...formData, shopDiscountType: e.target.value as any })}
                                    >
                                        <option value="PERCENT_OFF">% Off Baseline</option>
                                        <option value="FIXED_OFF">Fixed Amount Off Baseline</option>
                                        <option value="FIXED_PRICE">Set Fixed Promo Price</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                                        Value {formData.shopDiscountType === 'PERCENT_OFF' ? '(%)' : '(£)'}
                                    </label>
                                    <input
                                        type="number"
                                        className="w-full border rounded-lg px-3 py-2 text-sm border-indigo-200"
                                        value={formData.shopDiscountValue}
                                        onChange={e => setFormData({ ...formData, shopDiscountValue: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Schedule */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Start Date <span className="text-red-500">*</span></label>
                            <input
                                type="date"
                                className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.startDate ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                value={formData.startDate}
                                onChange={e => { setFormData({ ...formData, startDate: e.target.value }); setErrors({ ...errors, startDate: false }); }}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">End Date <span className="text-red-500">*</span></label>
                            <input
                                type="date"
                                className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.endDate ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                value={formData.endDate}
                                onChange={e => { setFormData({ ...formData, endDate: e.target.value }); setErrors({ ...errors, endDate: false }); }}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Internal Remark</label>
                        <textarea
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none h-20"
                            value={formData.remark}
                            onChange={e => setFormData({ ...formData, remark: e.target.value })}
                            placeholder="Objectives, requirements, or notes..."
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2 text-white rounded-lg text-sm font-bold shadow-md hover:opacity-90" style={{ backgroundColor: themeColor }}>Create Campaign</button>
                </div>
            </div>
        </div>
    );
};

const PromotionDashboard = ({ promotions, pricingRules, onSelectPromo, onCreateEvent, onDeletePromo, themeColor }: any) => {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<SortState<string> | null>({ key: 'startDate', dir: 'asc' });
    const [statusFilter, setStatusFilter] = useState('ALL');

    const handleDeleteClick = (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete campaign "${name}"?\nThis action cannot be undone.`)) {
            onDeletePromo(id);
        }
    };

    const getPlatformStyle = (platform: string) => {
        const rule = pricingRules && pricingRules[platform];
        if (rule?.color) {
            return {
                backgroundColor: `${rule.color}15`,
                color: rule.color,
                borderColor: `${rule.color}30`
            };
        }
        return { backgroundColor: '#f3f4f6', color: '#374151', borderColor: '#e5e7eb' };
    };

    const filteredPromotions = useMemo(() => {
        return (promotions || []).filter((p: any) => {
            if (!p) return false;
            if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
            return true;
        });
    }, [promotions, statusFilter]);

    const sortedPromotions = useMemo(() => {
        const getValue = (promo: PromotionEvent, key: string) => {
            if (!promo) return 0;
            switch (key) {
                case 'startDate':
                case 'endDate':
                    const dateVal = (promo as any)[key];
                    return dateVal ? new Date(dateVal).getTime() : 0;
                case 'items':
                    return (promo.items || []).length;
                case 'status':
                    const priority = { 'ACTIVE': 3, 'UPCOMING': 2, 'ENDED': 1 };
                    return priority[promo.status as keyof typeof priority] || 0;
                default:
                    return (promo as any)[key];
            }
        };
        return sortRows(filteredPromotions, sortConfig, getValue);
    }, [filteredPromotions, sortConfig]);

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '-';
        const d = new Date(dateStr);
        if (isNaN(d.getTime())) return dateStr;
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex justify-between items-center bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Active Campaigns</h3>
                    <p className="text-sm text-gray-500">Manage sales events and pricing overrides.</p>
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="appearance-none bg-white border border-gray-300 text-gray-700 py-2 pl-3 pr-8 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="ALL">All Statuses</option>
                            <option value="UPCOMING">Upcoming</option>
                            <option value="ACTIVE">Active</option>
                            <option value="ENDED">Ended</option>
                        </select>
                        <Filter className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
                    </div>
                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium shadow-md hover:bg-indigo-700 transition-colors flex items-center gap-2"
                        style={{ backgroundColor: themeColor }}
                    >
                        <Plus className="w-4 h-4" />
                        New Campaign
                    </button>
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50/50 text-gray-500 font-bold border-b border-custom-glass">
                        <tr>
                            <SortableHeader label="Campaign Name" sortKey="name" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                            <SortableHeader label="Platform" sortKey="platform" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                            <SortableHeader label="Dates" sortKey="startDate" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                            <th className="p-4">Scope</th>
                            <SortableHeader label="Items" sortKey="items" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader label="Status" sortKey="status" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="center" />
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/50">
                        {sortedPromotions.map((promo: any) => (
                            <tr 
                                key={promo.id} 
                                className="even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors cursor-pointer group"
                                onClick={() => onSelectPromo(promo.id)}
                            >
                                <td className="p-4 font-bold text-gray-900">
                                    {promo.name}
                                    {promo.remark && <div className="text-[10px] text-gray-400 font-normal mt-0.5 truncate max-w-[200px]">{promo.remark}</div>}
                                </td>
                                <td className="p-4">
                                    <span 
                                        className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border"
                                        style={getPlatformStyle(promo.platform)}
                                    >
                                        {promo.platform}
                                    </span>
                                </td>
                                <td className="p-4 text-gray-600 text-xs font-mono">
                                    {formatDate(promo.startDate)} - {formatDate(promo.endDate)}
                                </td>
                                <td className="p-4">
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${promo.promotionScope === 'SHOP' ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-white text-gray-500 border-gray-200'}`}>
                                        {promo.promotionScope || 'SKU'}
                                    </span>
                                </td>
                                <td className="p-4 text-right">
                                    <span className="font-mono font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                        {(promo.items || []).length}
                                    </span>
                                </td>
                                <td className="p-4 text-center">
                                    <StatusBadge status={promo.status} />
                                </td>
                                <td className="p-4 text-right">
                                    <button
                                        onClick={(e) => handleDeleteClick(e, promo.id, promo.name)}
                                        className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Delete Campaign"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            {isCreateOpen && (
                <CreateEventModal
                    onClose={() => setIsCreateOpen(false)}
                    onCreate={onCreateEvent}
                    platforms={pricingRules ? Object.keys(pricingRules) : []}
                    themeColor={themeColor}
                />
            )}
        </div>
    );
};

interface EventDetailViewProps {
    promo: PromotionEvent;
    products: Product[];
    priceHistoryMap: Map<string, PriceLog[]>;
    priceChangeHistory?: PriceChangeRecord[];
    onBack: () => void;
    onAddProducts: () => void;
    onDeleteItem: (sku: string) => void;
    onUpdateMeta: (updates: Partial<PromotionEvent>) => void;
    onUpdateItem: (sku: string, updates: Partial<PromotionItem>) => void;
    themeColor: string;
}

const EventDetailView = ({ promo, products, priceHistoryMap, priceChangeHistory, onBack, onAddProducts, onDeleteItem, onUpdateMeta, onUpdateItem, themeColor }: EventDetailViewProps) => {
    const [isUploadOpen, setIsUploadOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<SortState<string> | null>({ key: 'startDate', dir: 'asc' });
    const [activeSection, setActiveSection] = useState<'nomination' | 'analytics'>('nomination');
    
    // Lifecycle windows & effectiveness
    const nowKey = useMemo(() => asDateKey(new Date())!, []);
    const windows = useMemo(() => computePromoWindows(promo, nowKey), [promo, nowKey]);
    
    const aggregatedEffectiveness = useMemo(() => {
        const results = (promo?.items || []).map((item: any) => {
            const product = products.find(p => p.sku.toUpperCase() === item.sku.toUpperCase());
            return computePromoEffectiveness(promo, item.sku, Array.from((priceHistoryMap || new Map()).values()).flat(), priceChangeHistory || [], product);
        });
        
        const totals = {
            baselineDailyUnits: results.reduce((sum, r) => sum + (r.baselineDailyUnits || 0), 0),
            forecastUnits: results.reduce((sum, r) => sum + (r.forecastUnits || 0), 0),
            actualUnits: results.reduce((sum, r) => sum + (r.actualUnits || 0), 0),
            actualRevenue: results.reduce((sum, r) => sum + (r.actualRevenue || 0), 0),
            actualProfit: results.reduce((sum, r) => sum + (r.actualProfit || 0), 0),
            upliftUnits: results.reduce((sum, r) => sum + (r.upliftUnits || 0), 0),
            upliftRevenue: results.reduce((sum, r) => sum + (r.upliftRevenue || 0), 0),
            upliftProfit: results.reduce((sum, r) => sum + (r.upliftProfit || 0), 0),
            baselineRevenue: results.reduce((sum, r) => sum + ((r.baselineDailyUnits || 0) * (windows.event?.days || 0) * (r.baselinePrice || 0)), 0)
        };
        
        return { items: results, totals };
    }, [promo, priceHistoryMap, priceChangeHistory, windows.event.days, products]);

    const formatPromoDate = (dStr: string, withYear: boolean = true) => {
        if (!dStr) return '-';
        const d = new Date(dStr);
        if (isNaN(d.getTime())) return dStr;
        return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined });
    };

    const dateRangeStr = useMemo(() => {
        if (!promo?.startDate || !promo?.endDate) return '-';
        const sDate = new Date(promo.startDate);
        const eDate = new Date(promo.endDate);
        const sameYear = sDate.getFullYear() === eDate.getFullYear();
        return `${formatPromoDate(promo.startDate, !sameYear)} – ${formatPromoDate(promo.endDate, true)}`;
    }, [promo?.startDate, promo?.endDate]);

    const isSkuScope = promo?.promotionScope === 'SKU';

    const sortedItems = useMemo(() => {
        const itemsWithData = (aggregatedEffectiveness.items || []).map((item: any) => {
            const product = (products || []).find((p: Product) => p.sku.toUpperCase() === item.sku.toUpperCase());
            const rawItem = (promo?.items || []).find(i => i.sku.toUpperCase() === item.sku.toUpperCase());

            const resolvedPrice = (item.promoPrice > 0) 
                ? item.promoPrice 
                : (rawItem?.promoPrice && rawItem.promoPrice > 0) 
                    ? rawItem.promoPrice 
                    : 0;

            let projMargin = item.marginPctDuring;
            if (product && resolvedPrice > 0) {
                const totalCost = (Number(product.costPrice) || 0) +
                    (Number(product.sellingFee) || 0) +
                    (Number(product.adsFee) || 0) +
                    (Number(product.postage) || 0) +
                    (Number(product.otherFee) || 0) +
                    (Number(product.subscriptionFee) || 0) +
                    (Number(product.wmsFee) || 0);

                const totalIncome = resolvedPrice + (Number(product.extraFreight) || 0);
                const netProfit = totalIncome - totalCost;
                projMargin = (netProfit / resolvedPrice) * 100;
            }

            return {
                ...item,
                product,
                promoPrice: resolvedPrice,
                discountPercent: item.baselinePrice > 0 ? ((item.baselinePrice - resolvedPrice) / item.baselinePrice * 100) : 0,
                isIncomplete: isSkuScope && resolvedPrice <= 0,
                projectedMargin: projMargin
            };
        });
        const getValue = (row: any, key: string) => (row as any)[key];
        return sortRows(itemsWithData, sortConfig, getValue);
    }, [aggregatedEffectiveness, products, sortConfig, promo, isSkuScope]);

    const getRecommendation = () => {
        const { totals } = aggregatedEffectiveness;
        if (totals.actualUnits === 0 && windows.phase === 'POST') return { label: "Zero Impact", style: "text-gray-500", desc: "No sales recorded during this event." };
        if (totals.upliftUnits < (totals.baselineDailyUnits * 0.1) && windows.phase === 'POST') return { label: "Inefficient", style: "text-red-600", desc: "Uplift was negligible compared to baseline." };
        if (totals.upliftUnits > 0 && windows.phase === 'POST') return { label: "Successful Uplift", style: "text-green-600", desc: "Promotion generated meaningful volume growth." };
        return { label: "Monitoring", style: "text-indigo-600", desc: "Performance tracking in progress." };
    };

    const getStrategicRecommendation = () => {
        const { totals } = aggregatedEffectiveness;
        if (windows.phase !== 'POST') return null;

        if (totals.upliftUnits > 0) {
            if (totals.upliftProfit > 0) {
                return { 
                    label: "Repeat similar promotion", 
                    explanation: "Event was profitable with positive sales uplift. This is a winning configuration.", 
                    style: "bg-green-50 border-green-200 text-green-800" 
                };
            } else {
                return { 
                    label: "Reduce discount depth next time", 
                    explanation: "Uplift was positive but profit decreased vs baseline. Margin sacrifice was too high.", 
                    style: "bg-amber-50 border-amber-200 text-amber-800" 
                };
            }
        }
        return { 
            label: "Do not repeat promotion", 
            explanation: "No significant unit uplift detected. Customer response did not justify the discount.", 
            style: "bg-red-50 border-red-200 text-red-800" 
        };
    };

    const recommendation = getRecommendation();
    const stratRec = getStrategicRecommendation();

    // VARIANCE CALCULATIONS FOR LIVE PANEL
    const varianceStats = useMemo(() => {
        const { totals } = aggregatedEffectiveness;
        
        // Forecast Variance
        const forecastDiff = totals.actualUnits - totals.forecastUnits;
        const forecastDiffPct = totals.forecastUnits > 0 ? (forecastDiff / totals.forecastUnits) * 100 : 0;
        
        // Baseline Variance (Actual vs what would have sold at baseline rate)
        const baselineTotal = totals.actualUnits - totals.upliftUnits;
        const baselineDiff = totals.upliftUnits;
        const baselineDiffPct = baselineTotal > 0 ? (baselineDiff / baselineTotal) * 100 : 0;

        const getColor = (pct: number) => {
            if (pct > 5) return 'text-green-600';
            if (pct < -5) return 'text-red-600';
            return 'text-gray-500';
        };

        return {
            forecastDiff, forecastDiffPct, forecastColor: getColor(forecastDiffPct),
            baselineDiff, baselineDiffPct, baselineColor: getColor(baselineDiffPct)
        };
    }, [aggregatedEffectiveness]);

    return (
        <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between">
                <button onClick={onBack} className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm font-medium">
                    <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                </button>
                <div className="flex gap-2">
                    {isSkuScope && (
                        <button
                            onClick={() => setIsUploadOpen(true)}
                            className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium shadow-sm hover:bg-gray-50 flex items-center gap-2"
                        >
                            <Upload className="w-4 h-4" /> Batch Upload Items
                        </button>
                    )}
                    <button
                        onClick={onAddProducts}
                        className="px-4 py-2 text-white rounded-lg text-sm font-medium shadow-md hover:opacity-90 flex items-center gap-2"
                        style={{ backgroundColor: themeColor }}
                    >
                        <Plus className="w-4 h-4" /> Add SKUs
                    </button>
                </div>
            </div>

            {/* Lifecycle Banner */}
            <div className={`p-4 rounded-xl border flex items-center justify-between shadow-sm animate-in zoom-in duration-300 ${
                windows.phase === 'PRE' ? 'bg-blue-50 border-blue-100 text-blue-800' :
                windows.phase === 'LIVE' ? 'bg-green-50 border-green-100 text-green-800' :
                'bg-indigo-50 border-indigo-100 text-indigo-800'
            }`}>
                <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-lg bg-white/60`}>
                        {windows.phase === 'PRE' ? <Calendar className="w-5 h-5" /> : windows.phase === 'LIVE' ? <Activity className="w-5 h-5" /> : <BarChart3 className="w-5 h-5" />}
                    </div>
                    <div>
                        <h4 className="font-bold uppercase text-xs tracking-widest">
                            {windows.phase === 'PRE' ? 'Pre-Event Forecast' : windows.phase === 'LIVE' ? 'Live Tracking' : 'Post-Event Analysis'}
                        </h4>
                        <p className="text-sm opacity-80">{dateRangeStr}</p>
                    </div>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <div className="text-[10px] uppercase font-black opacity-40">Status</div>
                        <div className="font-bold flex items-center gap-2">
                            {windows.phase === 'LIVE' && <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />}
                            {promo.status}
                        </div>
                    </div>
                    <div className="h-8 w-px bg-current opacity-10" />
                    <div className="flex bg-white/40 p-1 rounded-lg border border-current/5">
                        <button onClick={() => setActiveSection('nomination')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeSection === 'nomination' ? 'bg-white shadow text-gray-900' : 'opacity-60 hover:opacity-100'}`}>Nomination</button>
                        <button onClick={() => setActiveSection('analytics')} className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeSection === 'analytics' ? 'bg-white shadow text-gray-900' : 'opacity-60 hover:opacity-100'}`}>Analytics</button>
                    </div>
                </div>
            </div>

            {activeSection === 'nomination' ? (
                <div className="space-y-6">
                    {/* Meta Editor Card */}
                    <div className="bg-custom-glass p-6 rounded-xl border border-custom-glass shadow-sm">
                        <div className="flex justify-between items-start mb-6">
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900">{promo.name}</h2>
                                <div className="flex items-center gap-4 text-sm text-gray-500 mt-1">
                                    <span className="flex items-center gap-1 font-medium"><Target className="w-4 h-4" /> {promo.platform}</span>
                                    <span className="text-xs font-black uppercase bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100">{promo.promotionScope || 'SKU'} SCOPE</span>
                                </div>
                            </div>
                            <div className="flex flex-col items-end gap-2">
                                <div className="flex items-center gap-2 text-xs font-bold text-gray-400">
                                    BASELINE: <span className="text-gray-900">{promo.baselineMode?.replace(/_/g, ' ')}</span>
                                    {promo.baselineMode === 'MANUAL' && <span className="text-indigo-600"> (£{promo.baselineManualPrice})</span>}
                                </div>
                            </div>
                        </div>

                        {!isSkuScope && (
                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5 mb-6 animate-in slide-in-from-top-2">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <h4 className="font-bold text-indigo-900 text-sm">Shop-Wide Discount Rule</h4>
                                        <p className="text-xs text-indigo-700 mt-0.5">All nominated SKUs will inherit this rule based on their individual baseline prices.</p>
                                    </div>
                                    <div className="flex gap-4">
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-400 uppercase block mb-1">Type</label>
                                            <select 
                                                value={promo.shopDiscountType}
                                                onChange={(e) => onUpdateMeta({ shopDiscountType: e.target.value })}
                                                className="text-sm font-bold border-indigo-200 rounded-lg py-1.5 px-3 bg-white focus:ring-2 focus:ring-indigo-500"
                                            >
                                                <option value="PERCENT_OFF">% Off</option>
                                                <option value="FIXED_OFF">£ Off</option>
                                                <option value="FIXED_PRICE">Fixed Price</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-[10px] font-bold text-indigo-400 uppercase block mb-1">Value</label>
                                            <input 
                                                type="number"
                                                value={promo.shopDiscountValue}
                                                onChange={(e) => onUpdateMeta({ shopDiscountValue: parseFloat(e.target.value) || 0 })}
                                                className="w-24 text-sm font-bold border-indigo-200 rounded-lg py-1.5 px-3 bg-white focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}

                        <table className="w-full text-left text-sm whitespace-nowrap bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                            <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200 uppercase text-[10px] tracking-wider">
                                <tr>
                                    <SortableHeader label="SKU" sortKey="sku" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                                    <th className="p-4 text-right">Baseline Price</th>
                                    <th className="p-4">{isSkuScope ? 'Discount Type' : 'Rule Status'}</th>
                                    <th className="p-4 text-right">{isSkuScope ? 'Value' : ''}</th>
                                    <th className="p-4 text-right">Effective Promo Price</th>
                                    <th className="p-4 text-right">Proj. Margin</th>
                                    <th className="p-4 text-right w-10"></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {sortedItems.map((item: any) => (
                                    <tr key={item.sku} className="hover:bg-gray-50 transition-colors group">
                                        <td className="p-4">
                                            <div className="flex items-center gap-1">
                                                <div className="font-bold text-gray-900">{item.sku}</div>
                                                <GradeBadge gradeLevel={item.product?.gradeLevel} />
                                                {item.isIncomplete && (
                                                    <span className="ml-2 text-[8px] bg-red-100 text-red-700 px-1 py-0.5 rounded-full font-black uppercase flex items-center gap-1 border border-red-200">
                                                        <AlertCircle className="w-2.5 h-2.5" /> Incomplete
                                                    </span>
                                                )}
                                            </div>
                                            <div className="text-[10px] text-gray-400 mt-0.5 truncate max-w-[150px]">{item.product?.name}</div>
                                        </td>
                                        <td className="p-4 text-right text-gray-500 font-medium">£{item.baselinePrice.toFixed(2)}</td>
                                        <td className="p-4">
                                            {isSkuScope ? (
                                                <select 
                                                    value={item.discountType || 'FIXED_PRICE'}
                                                    onChange={(e) => onUpdateItem(item.sku, { discountType: e.target.value })}
                                                    className="text-xs font-bold border-gray-200 rounded-lg p-1.5 bg-white group-hover:border-indigo-300 transition-colors focus:ring-2 focus:ring-indigo-500"
                                                >
                                                    <option value="PERCENT_OFF">% Off</option>
                                                    <option value="FIXED_OFF">£ Off</option>
                                                    <option value="FIXED_PRICE">Fixed Price</option>
                                                </select>
                                            ) : (
                                                <span className="text-[10px] font-bold text-indigo-500 flex items-center gap-1.5 italic">
                                                    <RotateCcw className="w-3 h-3" /> Inherits shop rule
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            {isSkuScope && (
                                                <input 
                                                    type="number"
                                                    value={item.discountValue || ''}
                                                    onChange={(e) => onUpdateItem(item.sku, { discountValue: parseFloat(e.target.value) || 0 })}
                                                    placeholder="0.00"
                                                    className="w-20 text-right text-xs font-bold border-gray-200 rounded-lg p-1.5 bg-white group-hover:border-indigo-300 transition-colors focus:ring-2 focus:ring-indigo-500"
                                                />
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex flex-col items-end">
                                                <span className="text-sm font-black text-gray-900">£{item.promoPrice.toFixed(2)}</span>
                                                <span className="text-[9px] font-bold text-red-500">-{item.discountPercent.toFixed(1)}% OFF</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <span className={`px-2 py-1 rounded text-xs font-bold border ${item.projectedMargin > 20 ? 'bg-green-100 text-green-700 border-green-200' : item.projectedMargin > 0 ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                                {item.projectedMargin !== null && item.projectedMargin !== undefined ? item.projectedMargin.toFixed(1) : '0.0'}%
                                            </span>
                                        </td>
                                        <td className="p-4 text-right">
                                            <button
                                                onClick={() => onDeleteItem(item.sku)}
                                                className="text-gray-300 hover:text-red-600 transition-colors p-1"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                                {(!promo?.items || promo.items.length === 0) && (
                                    <tr><td colSpan={7} className="p-12 text-center text-gray-400 italic">No SKUs nominated for this campaign.</td></tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 animate-in slide-in-from-left duration-300">
                    {/* Panel A: Forecast */}
                    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col">
                        <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                <Zap className="w-4 h-4 text-indigo-600" />
                                Pre-Event Forecast
                            </h4>
                            <div className="flex items-center gap-1">
                                <span className="text-[9px] font-black text-gray-400 uppercase">Lift %</span>
                                <input 
                                    type="number"
                                    value={promo.expectedLiftPct || 0}
                                    onChange={(e) => onUpdateMeta({ expectedLiftPct: parseFloat(e.target.value) || 0 })}
                                    className="w-12 text-right text-[10px] font-bold border border-gray-200 rounded p-0.5 bg-white"
                                />
                            </div>
                        </div>
                        <div className="p-6 space-y-6">
                            <p className="text-sm text-gray-600 italic">If nothing unusual happens, this promotion is expected to generate:</p>

                            <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100 space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-indigo-800">Forecast Totals</span>
                                    <span className="text-lg font-black text-indigo-700">{formatNumber(aggregatedEffectiveness.totals.forecastUnits, 0)} <span className="text-xs font-normal">units</span></span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-sm font-medium text-indigo-800">Expected Revenue</span>
                                    <span className="text-lg font-bold text-indigo-900">{formatMoney(aggregatedEffectiveness.totals.forecastUnits * (aggregatedEffectiveness.totals.baselineRevenue / (aggregatedEffectiveness.totals.baselineDailyUnits * (windows.event?.days || 1) || 1)), 0)}</span>
                                </div>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Baseline Units</div>
                                    <div className="text-xl font-black text-gray-900">{formatNumber(aggregatedEffectiveness.totals.baselineDailyUnits, 1)} <span className="text-[10px] font-normal">/day</span></div>
                                </div>
                                <div className="p-3 bg-gray-50 rounded-xl border border-gray-100 text-center">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Days in Window</div>
                                    <div className="text-xl font-black text-gray-900">{windows.event?.days || 0}</div>
                                </div>
                            </div>
                            
                            <div className="bg-blue-50/50 p-3 rounded-lg text-[11px] text-blue-700 flex gap-2">
                                <Info className="w-4 h-4 shrink-0" />
                                <p>Baseline calculated using weighted performance from {windows.pre?.days || 0} days prior to event start.</p>
                            </div>
                        </div>
                    </div>

                    {/* Panel B: Live Tracking */}
                    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col ${windows.phase === 'PRE' ? 'opacity-40 grayscale' : ''}`}>
                        <div className="p-4 border-b border-gray-100 bg-gray-50">
                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                <Activity className="w-4 h-4 text-green-600" />
                                Live Performance
                            </h4>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="flex justify-between items-start">
                                <div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-1">Units to Date</div>
                                    <div className="text-3xl font-black text-gray-900">{formatNumber(aggregatedEffectiveness.totals.actualUnits)}</div>
                                    
                                    {/* Variance Indicators */}
                                    <div className="mt-3 space-y-1">
                                        <div className={`text-[11px] font-bold flex items-center gap-1 ${varianceStats.forecastColor}`}>
                                            {varianceStats.forecastDiff >= 0 ? '+' : ''}{formatNumber(varianceStats.forecastDiff)} vs forecast ({varianceStats.forecastDiffPct >= 0 ? '+' : ''}{varianceStats.forecastDiffPct.toFixed(0)}%)
                                        </div>
                                        <div className={`text-[11px] font-bold flex items-center gap-1 ${varianceStats.baselineColor}`}>
                                            {varianceStats.baselineDiff >= 0 ? '+' : ''}{formatNumber(varianceStats.baselineDiff)} vs baseline ({varianceStats.baselineDiffPct >= 0 ? '+' : ''}{varianceStats.baselineDiffPct.toFixed(0)}%)
                                        </div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    {aggregatedEffectiveness.totals.upliftUnits > 0 ? (
                                        <div className="flex items-center gap-1 text-green-600 font-bold animate-in slide-in-from-bottom-1">
                                            <TrendingUp className="w-4 h-4" />
                                            {formatNumber(aggregatedEffectiveness.totals.upliftUnits)} units uplift
                                        </div>
                                    ) : (
                                        <div className="text-gray-400 text-xs font-medium italic">Pending tracking...</div>
                                    )}
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="p-3 bg-gray-50 rounded-xl">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase">Revenue</div>
                                    <div className="text-lg font-bold text-gray-900">{formatMoney(aggregatedEffectiveness.totals.actualRevenue, 0)}</div>
                                </div>
                                <div className="p-3 bg-gray-50 rounded-xl">
                                    <div className="text-[10px] font-bold text-gray-400 uppercase">Profit</div>
                                    <div className="text-lg font-bold text-gray-900">{formatMoney(aggregatedEffectiveness.totals.actualProfit, 0)}</div>
                                </div>
                            </div>
                            
                            <div className="pt-2">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Goal Progress</span>
                                    <span className="text-[10px] font-bold text-indigo-600">{Math.min(100, (aggregatedEffectiveness.totals.actualUnits / (aggregatedEffectiveness.totals.forecastUnits || 1) * 100)).toFixed(0)}%</span>
                                </div>
                                <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                                    <div 
                                        className="h-full bg-indigo-500 rounded-full transition-all duration-1000"
                                        style={{ width: `${Math.min(100, (aggregatedEffectiveness.totals.actualUnits / (aggregatedEffectiveness.totals.forecastUnits || 1) * 100))}%` }}
                                    />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Panel C: Post-Analysis */}
                    <div className={`bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden flex flex-col ${windows.phase !== 'POST' ? 'opacity-40 grayscale' : ''}`}>
                        <div className="p-4 border-b border-gray-100 bg-gray-50">
                            <h4 className="font-bold text-gray-800 flex items-center gap-2">
                                <BarChart3 className="w-4 h-4 text-purple-600" />
                                Campaign Efficiency
                            </h4>
                        </div>
                        <div className="p-6 space-y-5">
                            <div className="space-y-4">
                                <div>
                                    <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Rule-Based Assessment</div>
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <div className={`font-black text-sm flex items-center gap-2 ${recommendation.style}`}>
                                            <Star className="w-4 h-4 fill-current" />
                                            {recommendation.label}
                                        </div>
                                        <p className="text-[11px] text-gray-500 mt-1 leading-relaxed">{recommendation.desc}</p>
                                    </div>
                                </div>

                                {/* Strategic Recommendation Block */}
                                {stratRec && (
                                    <div>
                                        <div className="text-[10px] font-bold text-gray-400 uppercase mb-2">Strategic Recommendation</div>
                                        <div className={`p-3 rounded-xl border ${stratRec.style} animate-in fade-in slide-in-from-top-1`}>
                                            <div className="font-black text-xs uppercase flex items-center gap-2 mb-1">
                                                <Target className="w-3.5 h-3.5" />
                                                {stratRec.label}
                                            </div>
                                            <p className="text-[10px] opacity-90 leading-normal">{stratRec.explanation}</p>
                                        </div>
                                    </div>
                                )}
                                
                                <div className="grid grid-cols-1 gap-3">
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-xs text-gray-500">Total Unit Uplift</span>
                                        <span className={`text-sm font-black ${aggregatedEffectiveness.totals.upliftUnits > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {aggregatedEffectiveness.totals.upliftUnits > 0 ? '+' : ''}{formatNumber(aggregatedEffectiveness.totals.upliftUnits)} u
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-xs text-gray-500">Revenue Yield Change</span>
                                        <span className={`text-sm font-black ${aggregatedEffectiveness.totals.upliftRevenue > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {aggregatedEffectiveness.totals.upliftRevenue > 0 ? '+' : ''}{formatMoney(aggregatedEffectiveness.totals.upliftRevenue, 0)}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center py-2 border-b border-gray-100">
                                        <span className="text-xs text-gray-500">Profit Yield Change</span>
                                        <span className={`text-sm font-black ${aggregatedEffectiveness.totals.upliftProfit > 0 ? 'text-green-600' : 'text-red-500'}`}>
                                            {aggregatedEffectiveness.totals.upliftProfit > 0 ? '+' : ''}{formatMoney(aggregatedEffectiveness.totals.upliftProfit, 0)}
                                        </span>
                                    </div>
                                </div>
                            </div>
                            
                            {windows.phase === 'POST' && (
                                <button className="w-full py-2 bg-gray-900 text-white rounded-lg text-xs font-bold shadow-md hover:bg-gray-800 transition-colors flex items-center justify-center gap-2">
                                    <Download className="w-3.5 h-3.5" />
                                    Export Post-Mortem CSV
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {isUploadOpen && (
                <PromoUploadModal
                    products={products}
                    themeColor={themeColor}
                    onClose={() => setIsUploadOpen(false)}
                    onConfirm={(items) => {
                        const newItems: PromotionItem[] = items.map((i: any) => {
                            const product = (products || []).find(p => p.sku.toUpperCase() === i.sku.toUpperCase());
                            const basePrice = getBaselineForProduct(promo, product);
                            return {
                                sku: i.sku,
                                basePrice,
                                discountType: 'FIXED_PRICE',
                                discountValue: i.price,
                                promoPrice: i.price
                            };
                        });

                        const currentItems = promo.items || [];
                        const existing = new Set(currentItems.map((i: any) => i.sku.toUpperCase()));
                        const uniqueNew = newItems.filter((i: any) => !existing.has(i.sku.toUpperCase()));
                        onUpdateMeta({ items: [...currentItems, ...uniqueNew] });
                        setIsUploadOpen(false);
                    }}
                />
            )}
        </div>
    );
};

const AllPromoSkusView = ({ promotions, products, themeColor }: { promotions: PromotionEvent[], products: Product[], themeColor: string }) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [platformFilter, setPlatformFilter] = useState('All Platforms');
    const [sortConfig, setSortConfig] = useState<SortState<string> | null>({ key: 'startDate', dir: 'asc' });

    const productMap = useMemo(() => {
        const map = new Map<string, Product>();
        (products || []).forEach(p => map.set(p.sku.toUpperCase(), p));
        return map;
    }, [products]);

    const allRows = useMemo(() => {
        const rows: any[] = [];
        (promotions || []).forEach(promo => {
            if (!promo) return;
            (promo.items || []).forEach(item => {
                if (!item) return;
                const product = productMap.get(item.sku.toUpperCase());
                const baseline = getBaselineForProduct(promo, product);
                
                let computed = 0;
                if (promo.promotionScope === 'SHOP') {
                    computed = calculateEffectivePrice(baseline, promo.shopDiscountType || 'PERCENT_OFF', promo.shopDiscountValue || 0);
                } else {
                    computed = calculateEffectivePrice(baseline, item.discountType || 'FIXED_PRICE', item.discountValue || 0);
                }
                
                const resolved = (computed > 0) ? computed : (item.promoPrice > 0 ? item.promoPrice : 0);

                rows.push({
                    id: `${promo.id}-${item.sku}`,
                    sku: item.sku,
                    eventName: promo.name,
                    platform: promo.platform,
                    promoPrice: resolved,
                    startDate: new Date(promo.startDate),
                    endDate: new Date(promo.endDate),
                    status: promo.status
                });
            });
        });
        return rows.sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
    }, [promotions, productMap]);

    const sortedRows = useMemo(() => {
        const currentSearchTags = searchTags || [];
        const currentSearchQuery = searchQuery || '';

        const filtered = allRows.filter(row => {
            const product = productMap.get(row.sku.toUpperCase());
            
            const matchesTerm = (term: string) => {
                if (!term) return true; 
                const t = term.toLowerCase().trim();
                if (!t) return true; 

                if ((row.sku || '').toLowerCase().includes(t)) return true;
                if ((row.eventName || '').toLowerCase().includes(t)) return true;
                if (product && (product.name || '').toLowerCase().includes(t)) return true;
                return false;
            };

            if (currentSearchTags.length > 0) {
                const matchesTag = currentSearchTags.some(tag => matchesTerm(tag));
                const matchesText = currentSearchQuery.trim() ? matchesTerm(currentSearchQuery) : true;
                if (!matchesTag || !matchesText) return false;
            } else if (currentSearchQuery.trim()) {
                if (!matchesTerm(currentSearchQuery)) return false;
            }
                
            return platformFilter === 'All Platforms' || row.platform === platformFilter;
        });

        const getValue = (row: any, key: string) => {
            if (key === 'startDate' || key === 'endDate') return new Date((row as any)[key]).getTime();
            if (key === 'status') {
                const priority = { 'ACTIVE': 3, 'UPCOMING': 2, 'ENDED': 1 };
                return priority[row.status as keyof typeof priority] || 0;
            }
            return (row as any)[key];
        };
        return sortRows(filtered, sortConfig, getValue);

    }, [allRows, productMap, searchQuery, searchTags, platformFilter, sortConfig]);

    const formatDate = (date: Date) => {
        if (!date || isNaN(date.getTime())) return '-';
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-4 bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm">
                <div className="relative flex-1">
                    <TagSearchInput 
                        tags={searchTags}
                        onTagsChange={setSearchTags}
                        onInputChange={setSearchQuery}
                        placeholder="Filter by SKU, Name or Event..."
                        themeColor={themeColor}
                    />
                </div>
                <div className="w-48">
                    <select
                        value={platformFilter}
                        onChange={(e) => setPlatformFilter(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white/50 text-sm font-medium"
                    >
                        <option>All Platforms</option>
                        {Array.from(new Set((promotions || []).filter(Boolean).map(p => p.platform))).sort().map(p => (
                            <option key={p} value={p}>{p}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50/50 text-gray-500 font-bold border-b border-custom-glass text-[10px] uppercase tracking-wider">
                        <tr>
                            <SortableHeader label="SKU" sortKey="sku" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                            <SortableHeader label="Event" sortKey="eventName" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                            <SortableHeader label="Platform" sortKey="platform" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                            <SortableHeader label="Promo Price" sortKey="promoPrice" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} align="right" />
                            <SortableHeader label="Dates" sortKey="startDate" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                            <SortableHeader label="Status" sortKey="status" sort={sortConfig} onChange={setSortConfig} themeColor={themeColor} />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/50">
                        {sortedRows.map(row => {
                            const product = productMap.get(row.sku.toUpperCase());
                            return (
                                <tr key={row.id} className="even:bg-gray-50/30 hover:bg-gray-100/50">
                                    <td className="p-4">
                                        <div className="flex items-center">
                                            <div className="font-bold text-gray-700">{row.sku}</div>
                                            <GradeBadge gradeLevel={product?.gradeLevel} />
                                        </div>
                                    </td>
                                    <td className="p-4 text-gray-600">{row.eventName}</td>
                                    <td className="p-4">
                                        <span className="bg-gray-100/80 text-gray-700 px-2 py-1 rounded text-xs font-medium border border-gray-200">{row.platform}</span>
                                    </td>
                                    <td className="p-4 text-right font-black" style={{ color: themeColor }}>£{row.promoPrice.toFixed(2)}</td>
                                    <td className="p-4 text-gray-500 text-xs">{formatDate(row.startDate)} - {formatDate(row.endDate)}</td>
                                    <td className="p-4"><StatusBadge status={row.status} /></td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const ProductSelector = ({ products, currentPromo, onCancel, onConfirm, themeColor }: {
    products: Product[],
    currentPromo: PromotionEvent,
    onCancel: () => void,
    onConfirm: (items: PromotionItem[]) => void,
    themeColor: string
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());

    const existingSkuSet = useMemo(() => new Set((currentPromo?.items || []).map(i => i.sku.toUpperCase())), [currentPromo]);

    const filteredProducts = useMemo(() => {
        return (products || []).filter(p => {
            if (!p) return false;
            if (existingSkuSet.has(p.sku.toUpperCase())) return false;
            if ((p.stockLevel || 0) <= 0 && (p.averageDailySales || 0) === 0) return false;
            const matchesTerm = (term: string) => {
                const t = term.toLowerCase();
                return (p.sku || '').toLowerCase().includes(t) || (p.name || '').toLowerCase().includes(t);
            };
            if (searchTags && searchTags.length > 0) return searchTags.some(tag => matchesTerm(tag));
            return matchesTerm(searchQuery);
        });
    }, [products, searchQuery, searchTags, existingSkuSet]);

    const handleRowClick = (sku: string) => {
        const newSet = new Set(selectedSkus);
        if (newSet.has(sku)) newSet.delete(sku);
        else newSet.add(sku);
        setSelectedSkus(newSet);
    };

    const handleConfirm = () => {
        const items = Array.from(selectedSkus).map(sku => {
            const product = (products || []).find(p => p.sku === sku);
            const basePrice = getBaselineForProduct(currentPromo, product);
            return {
                sku,
                basePrice: Number(basePrice.toFixed(2)),
                discountType: 'FIXED_PRICE',
                discountValue: 0,
                promoPrice: 0
            } as PromotionItem;
        });
        onConfirm(items);
    };

    return (
        <div className="space-y-6 animate-in slide-in-from-right">
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                    <button onClick={onCancel} className="p-2 hover:bg-gray-100 rounded-full"><ArrowLeft className="w-5 h-5" /></button>
                    <h2 className="text-xl font-bold text-gray-900">Nominate SKUs for {currentPromo?.name || 'Campaign'}</h2>
                </div>
                <button 
                    onClick={handleConfirm} 
                    disabled={selectedSkus.size === 0}
                    className="px-6 py-2 text-white rounded-lg font-bold shadow-md hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: themeColor }}
                >
                    Add {selectedSkus.size} SKUs
                </button>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm">
                <TagSearchInput 
                    tags={searchTags}
                    onTagsChange={setSearchTags}
                    onInputChange={setSearchQuery}
                    placeholder="Search SKU or Name..."
                    themeColor={themeColor}
                />
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden max-h-[60vh] overflow-y-auto">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-50 font-bold border-b border-gray-200 text-gray-500 uppercase text-[10px] tracking-wider sticky top-0 z-10">
                        <tr>
                            <th className="p-4 w-10"></th>
                            <th className="p-4">SKU / Title</th>
                            <th className="p-4 text-right">CA Price</th>
                            <th className="p-4 text-right">Current Stock</th>
                            <th className="p-4 text-right">Daily Vel.</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredProducts.map(p => (
                            <tr 
                                key={p.sku} 
                                className={`group hover:bg-gray-50 cursor-pointer ${selectedSkus.has(p.sku) ? 'bg-indigo-50/30' : ''}`}
                                onClick={() => handleRowClick(p.sku)}
                            >
                                <td className="p-4">
                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-all ${selectedSkus.has(p.sku) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'}`}>
                                        {selectedSkus.has(p.sku) && <Check className="w-3.5 h-3.5 text-white" />}
                                    </div>
                                </td>
                                <td className="p-4">
                                    <div className="font-bold text-gray-900">{p.sku}</div>
                                    <div className="text-xs text-gray-500 truncate max-w-[300px]">{p.name}</div>
                                </td>
                                <td className="p-4 text-right font-mono text-indigo-600 font-bold">£{p.caPrice?.toFixed(2) || '0.00'}</td>
                                <td className="p-4 text-right text-gray-500 font-mono">{p.stockLevel}</td>
                                <td className="p-4 text-right text-gray-500 font-mono">{(p.averageDailySales || 0).toFixed(1)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

const PromotionPage: React.FC<PromotionPageProps> = ({ 
    products = [], 
    pricingRules = {}, 
    logisticsRules = [],
    promotions = [], 
    priceHistoryMap,
    onAddPromotion, 
    onUpdatePromotion, 
    onDeletePromotion, 
    themeColor, 
    headerStyle,
    priceChangeHistory
}) => {
    const [viewMode, setViewMode] = useState<ViewMode>('dashboard');
    const [selectedPromoId, setSelectedPromoId] = useState<string | null>(null);
    const [activeTab, setActiveTab] = useState<Tab>('dashboard');

    const selectedPromo = useMemo(() =>
        (promotions || []).find(p => p && p.id === selectedPromoId),
        [promotions, selectedPromoId]);

    const handleCreateEvent = (newEvent: PromotionEvent) => {
        onAddPromotion(newEvent);
        setSelectedPromoId(newEvent.id);
        setViewMode('event_detail');
        setActiveTab('dashboard');
    };

    const handleUpdateEventMeta = (id: string, updates: Partial<PromotionEvent>) => {
        const promo = (promotions || []).find(p => p && p.id === id);
        if (!promo) return;
        onUpdatePromotion({ ...promo, ...updates });
    };

    const handleUpdateItem = (sku: string, updates: Partial<PromotionItem>) => {
        if (!selectedPromo) return;
        const updatedItems = (selectedPromo.items || []).map(i => {
            if (i && i.sku.toUpperCase() === sku.toUpperCase()) {
                const newItem = { ...i, ...updates };
                const baseline = getBaselineForProduct(selectedPromo, (products || []).find(p => p && p.sku.toUpperCase() === sku.toUpperCase()));
                newItem.promoPrice = deriveDiscountedPrice(baseline, newItem.discountType || 'FIXED_PRICE', newItem.discountValue || 0);
                return newItem;
            }
            return i;
        });
        onUpdatePromotion({ ...selectedPromo, items: updatedItems });
    };

    const handleDeleteItem = (sku: string) => {
        if (!selectedPromo) return;
        const updatedItems = (selectedPromo.items || []).filter(i => i && i.sku.toUpperCase() !== sku.toUpperCase());
        onUpdatePromotion({ ...selectedPromo, items: updatedItems });
    };

    const handleNominateItems = (newItems: PromotionItem[]) => {
        if (!selectedPromo) return;
        onUpdatePromotion({
            ...selectedPromo,
            items: [...(selectedPromo.items || []), ...newItems]
        });
        setViewMode('event_detail');
    };

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
            <div>
                <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Promotion Manager</h2>
                <p className="mt-1 transition-colors opacity-80" style={headerStyle}>
                    Plan, nominate SKUs, and manage cross-platform discount rules.
                </p>
            </div>

            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <LayoutDashboard className="w-4 h-4" />
                    Campaigns
                </button>
                <button
                    onClick={() => setActiveTab('all_skus')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'all_skus' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <List className="w-4 h-4" />
                    Master Promo Log
                </button>
            </div>

            <div className="min-h-[500px]">
                <div style={{ display: activeTab === 'dashboard' ? 'block' : 'none' }}>
                    {viewMode === 'dashboard' && (
                        <PromotionDashboard 
                            promotions={promotions} 
                            pricingRules={pricingRules}
                            onSelectPromo={(id: string) => { setSelectedPromoId(id); setViewMode('event_detail'); }} 
                            onCreateEvent={handleCreateEvent}
                            onDeletePromo={onDeletePromotion} 
                            themeColor={themeColor}
                        />
                    )}

                    {viewMode === 'event_detail' && selectedPromo && (
                        <EventDetailView 
                            promo={selectedPromo}
                            products={products}
                            priceHistoryMap={priceHistoryMap || new Map()}
                            priceChangeHistory={priceChangeHistory}
                            onBack={() => setViewMode('dashboard')}
                            onAddProducts={() => setViewMode('add_products')}
                            onDeleteItem={handleDeleteItem}
                            onUpdateItem={handleUpdateItem}
                            onUpdateMeta={(updates: Partial<PromotionEvent>) => handleUpdateEventMeta(selectedPromo.id, updates)}
                            themeColor={themeColor}
                        />
                    )}

                    {viewMode === 'add_products' && selectedPromo && (
                        <ProductSelector
                            products={products}
                            currentPromo={selectedPromo}
                            onCancel={() => setViewMode('event_detail')}
                            onConfirm={handleNominateItems}
                            themeColor={themeColor}
                        />
                    )}
                </div>

                <div style={{ display: activeTab === 'all_skus' ? 'block' : 'none' }}>
                    <AllPromoSkusView promotions={promotions} products={products} themeColor={themeColor} />
                </div>
            </div>
        </div>
    );
};

export default PromotionPage;