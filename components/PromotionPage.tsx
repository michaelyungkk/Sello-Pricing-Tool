
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Product, PricingRules, PromotionEvent, PromotionItem, PriceLog, LogisticsRule } from '../types';
import { TagSearchInput } from './TagSearchInput';
import { Plus, ChevronRight, Search, Trash2, ArrowLeft, CheckCircle, Check, Download, Calendar, Lock, Unlock, LayoutDashboard, List, Calculator, Edit2, AlertCircle, Save, X, RotateCcw, Eye, EyeOff, ArrowUpDown, ChevronUp, ChevronDown, Upload, FileText, Loader2, RefreshCw, TrendingUp, TrendingDown, Target, ShoppingBag, Coins, Truck, Info, HelpCircle, Archive, Zap, Clock, Star, Filter } from 'lucide-react';
import * as XLSX from 'xlsx';

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
}

type ViewMode = 'dashboard' | 'event_detail' | 'add_products';
type Tab = 'dashboard' | 'all_skus' | 'simulator';

// Standard UK VAT
const VAT = 1.20;

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

const MarginTooltip = ({ details, marginStandard, promoPrice, rect }: any) => {
    const style: React.CSSProperties = {
        position: 'fixed',
        top: `${rect.top}px`,
        left: `${rect.left}px`,
        transform: 'translate(-100%, -50%) translateX(-12px)',
        zIndex: 9999,
        pointerEvents: 'none'
    };

    return createPortal(
        <div style={style} className="bg-gray-900 text-white p-4 rounded-xl shadow-xl w-64 text-xs z-50 animate-in fade-in zoom-in duration-200">
            <h4 className="font-bold text-gray-200 mb-2 border-b border-gray-700 pb-1 flex justify-between">
                Promo Analysis
                <span className={marginStandard > 0 ? 'text-green-400' : 'text-red-400'}>
                    {marginStandard.toFixed(1)}%
                </span>
            </h4>
            <div className="space-y-1 mb-2">
                <div className="flex justify-between">
                    <span className="text-gray-400">Promo Price (Gross)</span>
                    <span className="font-mono text-white">£{promoPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span>- Commission ({details?.commissionRate ?? 15}%)</span>
                    <span className="text-red-300">£{(details?.commissionCost ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span>- Postage (Est.)</span>
                    <span className="text-red-300">£{(details?.standardPostage ?? 0).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                    <span>- COGS & Fees</span>
                    <span className="text-red-300">£{(details?.otherCosts ?? 0).toFixed(2)}</span>
                </div>
            </div>
            <div className="flex justify-between items-center font-bold text-sm">
                <span className="text-gray-300">Net Profit</span>
                <span className={(details?.profitStandard ?? 0) > 0 ? 'text-white' : 'text-red-400'}>
                    £{(details?.profitStandard ?? 0).toFixed(2)}
                </span>
            </div>
        </div>,
        document.body
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
                    rows = text.split('\n').map(r => {
                        const [sku, price] = r.split(',');
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
    const [formData, setFormData] = useState({
        name: '',
        platform: 'All',
        startDate: '',
        endDate: '',
        submissionDeadline: '',
        remark: ''
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
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-900">Create New Campaign</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">
                            Campaign Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 ${errors.name ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                            value={formData.name}
                            onChange={e => { setFormData({ ...formData, name: e.target.value }); setErrors({ ...errors, name: false }); }}
                            placeholder="e.g. Black Friday Sale"
                        />
                        {errors.name && <p className="text-xs text-red-500 mt-1">Campaign name is required.</p>}
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Platform <span className="text-red-500">*</span></label>
                        <select
                            className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 border-gray-300"
                            value={formData.platform}
                            onChange={e => setFormData({ ...formData, platform: e.target.value })}
                        >
                            <option value="All">All Platforms</option>
                            {platforms.map((p: string) => <option key={p} value={p}>{p}</option>)}
                        </select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">
                                Start Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.startDate ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                value={formData.startDate}
                                onChange={e => { setFormData({ ...formData, startDate: e.target.value }); setErrors({ ...errors, startDate: false }); }}
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">
                                End Date <span className="text-red-500">*</span>
                            </label>
                            <input
                                type="date"
                                className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.endDate ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                value={formData.endDate}
                                onChange={e => { setFormData({ ...formData, endDate: e.target.value }); setErrors({ ...errors, endDate: false }); }}
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Submission Deadline (Optional)</label>
                        <input
                            type="date"
                            className="w-full border rounded-lg px-3 py-2 text-sm border-gray-300"
                            value={formData.submissionDeadline}
                            onChange={e => setFormData({ ...formData, submissionDeadline: e.target.value })}
                        />
                    </div>
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Remark (Optional)</label>
                        <textarea
                            className="w-full border rounded-lg px-3 py-2 text-sm border-gray-300 resize-none h-20"
                            value={formData.remark}
                            onChange={e => setFormData({ ...formData, remark: e.target.value })}
                            placeholder="Add internal notes or objectives..."
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-6">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button>
                    <button onClick={handleSubmit} className="px-4 py-2 text-white rounded-lg text-sm font-medium shadow-md" style={{ backgroundColor: themeColor }}>Create Campaign</button>
                </div>
            </div>
        </div>
    );
};

const PromotionDashboard = ({ promotions, pricingRules, onSelectPromo, onCreateEvent, onDeletePromo, themeColor }: any) => {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>({ key: 'startDate', direction: 'asc' });
    const [statusFilter, setStatusFilter] = useState('ALL');

    const handleDeleteClick = (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete campaign "${name}"?\nThis action cannot be undone.`)) {
            onDeletePromo(id);
        }
    };

    const getPlatformStyle = (platform: string) => {
        const rule = pricingRules[platform];
        if (rule?.color) {
            return {
                backgroundColor: `${rule.color}15`, // Low opacity background
                color: rule.color,
                borderColor: `${rule.color}30`
            };
        }
        return {
            backgroundColor: '#f3f4f6',
            color: '#374151',
            borderColor: '#e5e7eb'
        };
    };

    const handleSort = (key: string) => {
        let direction: 'asc' | 'desc' = 'asc';
        if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
            direction = 'desc';
        }
        setSortConfig({ key, direction });
    };

    const filteredPromotions = useMemo(() => {
        return promotions.filter((p: any) => {
            if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
            return true;
        });
    }, [promotions, statusFilter]);

    const sortedPromotions = useMemo(() => {
        return [...filteredPromotions].sort((a: any, b: any) => {
            if (!sortConfig) return 0;
            const { key, direction } = sortConfig;
            let valA = a[key];
            let valB = b[key];

            // Special handling for dates
            if (['startDate', 'endDate', 'submissionDeadline'].includes(key)) {
                valA = valA ? new Date(valA).getTime() : 0;
                valB = valB ? new Date(valB).getTime() : 0;
            } else if (typeof valA === 'string') {
                valA = valA.toLowerCase();
                valB = valB.toLowerCase();
            }

            if (valA < valB) return direction === 'asc' ? -1 : 1;
            if (valA > valB) return direction === 'asc' ? 1 : -1;
            return 0;
        });
    }, [filteredPromotions, sortConfig]);

    const SortIcon = ({ colKey }: { colKey: string }) => {
        if (sortConfig?.key !== colKey) return <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50" />;
        return sortConfig.direction === 'asc' 
            ? <ChevronUp className="w-3 h-3" style={{ color: themeColor }} /> 
            : <ChevronDown className="w-3 h-3" style={{ color: themeColor }} />;
    };

    const SortableHeader = ({ label, colKey, className = "" }: { label: string, colKey: string, className?: string }) => (
        <th 
            className={`p-4 cursor-pointer hover:bg-gray-100/50 transition-colors select-none group ${className}`}
            onClick={() => handleSort(colKey)}
        >
            <div className="flex items-center gap-1">
                {label}
                <SortIcon colKey={colKey} />
            </div>
        </th>
    );

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
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
                            <SortableHeader label="Campaign Name" colKey="name" />
                            <SortableHeader label="Platform" colKey="platform" />
                            <SortableHeader label="Start Date" colKey="startDate" />
                            <SortableHeader label="End Date" colKey="endDate" />
                            <SortableHeader label="Deadline" colKey="submissionDeadline" />
                            <th className="p-4 text-right">Items</th>
                            <th className="p-4 text-center">Status</th>
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
                                    {formatDate(promo.startDate)}
                                </td>
                                <td className="p-4 text-gray-600 text-xs font-mono">
                                    {formatDate(promo.endDate)}
                                </td>
                                <td className="p-4 text-gray-500 text-xs font-mono">
                                    {promo.submissionDeadline ? formatDate(promo.submissionDeadline) : '-'}
                                </td>
                                <td className="p-4 text-right">
                                    <span className="font-mono font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                        {promo.items.length}
                                    </span>
                                </td>
                                <td className="p-4 text-center">
                                    <StatusBadge status={promo.status} />
                                </td>
                                <td className="p-4 text-right">
                                    <button
                                        onClick={(e) => handleDeleteClick(e, promo.id, promo.name)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                        title="Delete Campaign"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                        {sortedPromotions.length === 0 && (
                            <tr>
                                <td colSpan={8} className="p-12 text-center text-gray-400">
                                    {statusFilter === 'ALL' ? 'No campaigns found. Create one to get started.' : `No ${statusFilter.toLowerCase()} campaigns found.`}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {isCreateOpen && (
                <CreateEventModal
                    onClose={() => setIsCreateOpen(false)}
                    onCreate={onCreateEvent}
                    platforms={Object.keys(pricingRules)}
                    themeColor={themeColor}
                />
            )}
        </div>
    );
};

const PromoPerformanceHeader = ({ promo, products, priceHistoryMap, themeColor }: { promo: PromotionEvent, products: Product[], priceHistoryMap: Map<string, PriceLog[]>, themeColor: string }) => {
    // ... [Content identical to original, omitted for brevity]
    const stats = useMemo(() => {
        let totalDailyProfitBase = 0;
        let totalDailyProfitPromo = 0;
        let totalBaseRevenue = 0;
        let totalActualSold = 0;
        let totalActualRevenue = 0;

        const startDate = new Date(promo.startDate);
        const now = new Date();
        const hasStarted = now >= startDate;

        const historyMap = priceHistoryMap || new Map();
        const items = promo.items || [];

        items.forEach(item => {
            const product = products.find(p => p.sku === item.sku);
            if (!product) return;

            const velocity = product.averageDailySales || 0;
            const cost = (product.costPrice || 0) + (product.wmsFee || 0) + (product.otherFee || 0) + (product.subscriptionFee || 0);

            const baseProfit = (item.basePrice / VAT) - cost;
            totalDailyProfitBase += (baseProfit * velocity);
            totalBaseRevenue += (item.basePrice * velocity);

            const promoProfit = (item.promoPrice / VAT) - cost;
            totalDailyProfitPromo += (promoProfit * velocity);

            if (hasStarted) {
                const logs = historyMap.get(item.sku) || [];
                const filteredLogs = logs.filter((l: any) => {
                    const d = l.date.split('T')[0];
                    const isDateMatch = d >= promo.startDate && d <= promo.endDate;
                    const isPlatformMatch = promo.platform === 'All' || l.platform === promo.platform;
                    return isDateMatch && isPlatformMatch;
                });

                filteredLogs.forEach((l: any) => {
                    totalActualSold += l.velocity;
                    totalActualRevenue += (l.price * l.velocity);
                });
            }
        });

        const profitGap = totalDailyProfitBase - totalDailyProfitPromo;
        const breakevenLift = totalDailyProfitPromo > 0
            ? ((totalDailyProfitBase / totalDailyProfitPromo) - 1) * 100
            : 0;

        return {
            totalDailyProfitBase,
            totalDailyProfitPromo,
            profitGap,
            breakevenLift,
            totalActualSold,
            totalActualRevenue,
            hasStarted
        };
    }, [promo, products, priceHistoryMap]);

    return (
        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass p-5 mb-6 animate-in fade-in slide-in-from-top-4 backdrop-blur-custom">
            <div className="flex items-center gap-2 mb-4">
                <div className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
                    <TrendingUp className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wide">Campaign Intelligence</h3>
                <span className="text-xs text-gray-400 ml-auto">Live Estimates</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x divide-gray-200/50">
                <div className="flex flex-col gap-1 pr-4">
                    <span className="text-xs text-gray-500 font-medium">Daily Profit Projection</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-gray-900">£{stats.totalDailyProfitPromo.toFixed(0)}</span>
                        <span className="text-xs text-gray-400">vs £{stats.totalDailyProfitBase.toFixed(0)} BAU</span>
                    </div>
                    <div className={`text-xs font-medium flex items-center gap-1 ${stats.profitGap > 0 ? 'text-red-500' : 'text-green-500'}`}>
                        {stats.profitGap > 0 ? <TrendingDown className="w-3 h-3" /> : <TrendingUp className="w-3 h-3" />}
                        {stats.profitGap > 0 ? `Sacrificing £${stats.profitGap.toFixed(0)} / day` : `Gaining £${Math.abs(stats.profitGap).toFixed(0)} / day`}
                    </div>
                </div>

                <div className="flex flex-col gap-1 md:px-4 pt-4 md:pt-0">
                    <span className="text-xs text-gray-500 font-medium">Breakeven Velocity Target</span>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-indigo-600">+{stats.breakevenLift.toFixed(0)}%</span>
                        <span className="text-xs text-gray-400">unit sales needed</span>
                    </div>
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                        <Target className="w-3 h-3" />
                        To match normal profit levels
                    </div>
                </div>

                <div className="flex flex-col gap-1 md:pl-4 pt-4 md:pt-0">
                    <span className="text-xs text-gray-500 font-medium">Real-time Performance</span>
                    {stats.hasStarted ? (
                        <>
                            <div className="flex items-baseline gap-2">
                                <span className="text-2xl font-bold text-gray-900">£{stats.totalActualRevenue.toFixed(0)}</span>
                                <span className="text-xs text-gray-400">Revenue</span>
                            </div>
                            <div className="text-xs text-green-600 font-medium flex items-center gap-1">
                                <ShoppingBag className="w-3 h-3" />
                                {stats.totalActualSold.toFixed(0)} Units Sold (Approx)
                            </div>
                        </>
                    ) : (
                        <div className="flex flex-col justify-center h-full">
                            <span className="text-sm font-medium text-gray-400 italic">Event has not started</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const EventDetailView = ({ promo, products, priceHistoryMap, onBack, onAddProducts, onDeleteItem, onUpdateMeta, themeColor }: any) => {
    const [isUploadOpen, setIsUploadOpen] = useState(false);

    const formatPromoDate = (dStr: string, withYear: boolean = true) => {
        return new Date(dStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: withYear ? 'numeric' : undefined });
    };

    const dateRangeStr = useMemo(() => {
        const sDate = new Date(promo.startDate);
        const eDate = new Date(promo.endDate);
        const sameYear = sDate.getFullYear() === eDate.getFullYear();
        return `${formatPromoDate(promo.startDate, !sameYear)} – ${formatPromoDate(promo.endDate, true)}`;
    }, [promo.startDate, promo.endDate]);

    return (
        <div className="space-y-6 pb-20 animate-in fade-in slide-in-from-right duration-300">
            <div className="flex items-center justify-between">
                <button onClick={onBack} className="text-gray-500 hover:text-gray-700 flex items-center gap-1 text-sm font-medium">
                    <ArrowLeft className="w-4 h-4" /> Back to Dashboard
                </button>
                <div className="flex gap-2">
                    <button
                        onClick={() => setIsUploadOpen(true)}
                        className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg text-sm font-medium shadow-sm hover:bg-gray-50 flex items-center gap-2"
                    >
                        <Upload className="w-4 h-4" /> Batch Upload Items
                    </button>
                    <button
                        onClick={onAddProducts}
                        className="px-4 py-2 text-white rounded-lg text-sm font-medium shadow-md hover:opacity-90 flex items-center gap-2"
                        style={{ backgroundColor: themeColor }}
                    >
                        <Plus className="w-4 h-4" /> Add Products
                    </button>
                </div>
            </div>

            <div className="bg-custom-glass p-6 rounded-xl border border-custom-glass shadow-sm">
                <div className="flex justify-between items-start mb-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <h2 className="text-2xl font-bold text-gray-900">{promo.name}</h2>
                            <StatusBadge status={promo.status} />
                        </div>
                        <div className="flex items-center gap-4 text-sm text-gray-500">
                            <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {dateRangeStr}</span>
                            <span className="flex items-center gap-1"><Target className="w-4 h-4" /> {promo.platform}</span>
                        </div>
                    </div>
                </div>

                <PromoPerformanceHeader promo={promo} products={products} priceHistoryMap={priceHistoryMap} themeColor={themeColor} />
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50/50 text-gray-500 font-bold border-b border-custom-glass">
                        <tr>
                            <th className="p-4">SKU</th>
                            <th className="p-4 text-right">CA Price</th>
                            <th className="p-4 text-right">Platform Price</th>
                            <th className="p-4 text-right">Promo Price</th>
                            <th className="p-4 text-right">Discount</th>
                            <th className="p-4 text-right">Proj. Margin</th>
                            <th className="p-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/50">
                        {promo.items.map((item: any) => {
                            const product = products.find((p: Product) => p.sku === item.sku);
                            const currentMargin = product ? ((item.promoPrice / VAT - (product.costPrice || 0)) / (item.promoPrice / VAT) * 100) : 0;
                            const discountPercent = item.basePrice > 0 ? ((item.basePrice - item.promoPrice) / item.basePrice * 100).toFixed(1) : "0.0";

                            let platformPrice = product ? (product.currentPrice * VAT) : 0;
                            if (product && promo.platform !== 'All') {
                                const channel = product.channels.find((c: any) => c.platform === promo.platform);
                                if (channel && channel.price) platformPrice = channel.price * VAT;
                            }

                            return (
                                <tr key={item.sku} className="even:bg-gray-50/30 hover:bg-gray-100/50">
                                    <td className="p-4 font-bold text-gray-900">{item.sku}</td>
                                    <td className="p-4 text-right">
                                        {product?.caPrice ? (
                                            <span className="font-bold text-purple-600 bg-purple-50 px-2 py-1 rounded border border-purple-100">£{product.caPrice.toFixed(2)}</span>
                                        ) : <span className="text-gray-300">-</span>}
                                    </td>
                                    <td className="p-4 text-right text-gray-500">£{platformPrice.toFixed(2)}</td>
                                    <td className="p-4 text-right font-bold" style={{ color: themeColor }}>£{item.promoPrice.toFixed(2)}</td>
                                    <td className="p-4 text-right">
                                        <span className="bg-red-50 text-red-700 px-2 py-1 rounded text-xs font-bold">
                                            {discountPercent}% OFF
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono">{currentMargin.toFixed(1)}%</td>
                                    <td className="p-4 text-right">
                                        <button
                                            onClick={() => onDeleteItem(item.sku)}
                                            className="text-gray-400 hover:text-red-600 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                </tr>
                            );
                        })}
                        {promo.items.length === 0 && (
                            <tr>
                                <td colSpan={6} className="p-8 text-center text-gray-400">
                                    No products in this campaign yet.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {isUploadOpen && (
                <PromoUploadModal
                    products={products}
                    themeColor={themeColor}
                    onClose={() => setIsUploadOpen(false)}
                    onConfirm={(items) => {
                        const newItems = items.map((i: any) => ({
                            sku: i.sku,
                            basePrice: (products.find((p: Product) => p.sku === i.sku)?.currentPrice || 0) * VAT,
                            promoPrice: i.price,
                            discountType: 'FIXED',
                            discountValue: 0
                        }));

                        const currentItems = promo.items;
                        const existing = new Set(currentItems.map((i: any) => i.sku));
                        const uniqueNew = newItems.filter((i: any) => !existing.has(i.sku));
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

    const allRows = useMemo(() => {
        const rows: any[] = [];
        promotions.forEach(promo => {
            const seenSkus = new Set<string>();
            promo.items.forEach(item => {
                if (seenSkus.has(item.sku)) return;
                seenSkus.add(item.sku);

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
        const product = products.find(p => p.sku === row.sku);
        
        const matchesTerm = (term: string) => {
            if (!term) return true; 
            const t = term.toLowerCase().trim();
            if (!t) return true; 

            if (row.sku.toLowerCase().includes(t)) return true;
            if (row.eventName.toLowerCase().includes(t)) return true;
            if (product && product.name.toLowerCase().includes(t)) return true;
            
            // Safe navigation for channels array
            if (product && Array.isArray(product.channels)) {
                return product.channels.some(c => {
                    const aliases = c.skuAlias || '';
                    return aliases.toLowerCase().includes(t);
                });
            }
            return false;
        };

        if (searchTags.length > 0) {
            const matchesTag = searchTags.some(tag => matchesTerm(tag));
            const matchesText = searchQuery.trim() ? matchesTerm(searchQuery) : true;
            
            if (!matchesTag) return false;
            if (!matchesText) return false;
        } else if (searchQuery.trim()) {
            if (!matchesTerm(searchQuery)) return false;
        }
            
        const matchesPlatform = platformFilter === 'All Platforms' || row.platform === platformFilter;
        return matchesPlatform;
    });

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    };

    const handleExport = () => {
        const clean = (val: any) => `"${String(val || '').replace(/"/g, '""')}"`;
        const headers = ['SKU', 'Event Name', 'Platform', 'Promo Price', 'Start Date', 'End Date', 'Status'];
        const rows = filteredRows.map(r => [
            clean(r.sku),
            clean(r.eventName),
            clean(r.platform),
            r.promoPrice.toFixed(2),
            formatDate(r.startDate),
            formatDate(r.endDate),
            clean(r.status)
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const blob = new Blob(['\uFEFF', csvContent], { type: 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.style.display = 'none';
        link.href = url;
        const filename = `all_promotions_export_${new Date().toISOString().slice(0, 10)}.csv`;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        setTimeout(() => { if (document.body.contains(link)) document.body.removeChild(link); URL.revokeObjectURL(url); }, 60000);
    };

    return (
        <div className="space-y-6">
            <div className="flex gap-4 bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm">
                <div className="relative flex-1">
                    <TagSearchInput 
                        tags={searchTags}
                        onTagsChange={setSearchTags}
                        onInputChange={setSearchQuery}
                        placeholder="Filter by SKU, Name, Alias or Event..."
                        themeColor={themeColor}
                    />
                </div>
                <div className="flex items-center gap-2">
                    <div className="w-48">
                        <select
                            value={platformFilter}
                            onChange={(e) => setPlatformFilter(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white/50"
                        >
                            <option>All Platforms</option>
                            {Array.from(new Set(promotions.map(p => p.platform))).sort().map(p => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                    </div>
                    <button
                        onClick={handleExport}
                        className="px-3 py-2 bg-white border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 flex items-center gap-2 transition-colors"
                        title="Export filtered list to CSV"
                    >
                        <Download className="w-4 h-4" />
                        Export
                    </button>
                </div>
            </div>

            <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden backdrop-blur-custom">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50/50 text-gray-500 font-bold border-b border-custom-glass">
                        <tr>
                            <th className="p-4">SKU</th>
                            <th className="p-4">Event</th>
                            <th className="p-4">Platform</th>
                            <th className="p-4 text-right">Promo Price</th>
                            <th className="p-4">Dates</th>
                            <th className="p-4">Status</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100/50">
                        {filteredRows.map(row => (
                            <tr key={row.id} className="even:bg-gray-50/30 hover:bg-gray-100/50">
                                <td className="p-4 font-bold text-gray-700">{row.sku}</td>
                                <td className="p-4 text-gray-600">{row.eventName}</td>
                                <td className="p-4">
                                    <span className="bg-gray-100/80 text-gray-700 px-2 py-1 rounded text-xs font-medium border border-gray-200">
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
                                <td colSpan={6} className="p-12 text-center text-gray-400">
                                    No promotions found matching your criteria.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// ... (Rest of component including SimulatorView, ProductSelector, and Main Page Component remains unchanged)
const SimulatorView = ({ themeColor }: { themeColor: string }) => {
    return (
        <div className="flex flex-col items-center justify-center min-h-[400px] border-2 border-dashed border-custom-glass rounded-2xl bg-custom-glass">
            <div className="text-center p-8">
                <div className="w-16 h-16 bg-gray-200/50 rounded-lg flex items-center justify-center mx-auto mb-4 text-gray-400">
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

const ProductSelector = ({ products, currentPromo, pricingRules, logisticsRules, onCancel, onConfirm, themeColor }: {
    products: Product[],
    currentPromo: PromotionEvent,
    pricingRules: PricingRules,
    logisticsRules?: LogisticsRule[],
    onCancel: () => void,
    onConfirm: (items: PromotionItem[]) => void,
    themeColor: string
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [selectedCategory, setSelectedCategory] = useState('All Categories');
    const [bulkRule, setBulkRule] = useState<{ type: 'PERCENTAGE' | 'FIXED', value: number }>({ type: 'PERCENTAGE', value: 10 });
    const [selectedSkus, setSelectedSkus] = useState<Set<string>>(new Set());
    const [priceOverrides, setPriceOverrides] = useState<Record<string, number>>({});
    const [showInactive, setShowInactive] = useState(false);
    const [hoveredMargin, setHoveredMargin] = useState<{ id: string, rect: DOMRect } | null>(null);

    const existingSkuSet = useMemo(() => new Set(currentPromo.items.map(i => i.sku)), [currentPromo]);

    const filteredProducts = useMemo(() => {
        return products.filter(p => {
            if (existingSkuSet.has(p.sku)) return false;
            if (!showInactive && p.stockLevel <= 0 && p.averageDailySales === 0) return false;
            if (currentPromo.platform !== 'All') {
                const isSoldOnPlatform = p.channels.some(c => c.platform === currentPromo.platform);
                if (!isSoldOnPlatform) return false;
            }
            
            const matchesTerm = (term: string) => {
                const t = term.toLowerCase();
                return p.sku.toLowerCase().includes(t) || 
                       p.name.toLowerCase().includes(t) || 
                       p.channels.some(c => c.skuAlias?.toLowerCase().includes(t));
            };

            let matchSearch = true;
            if (searchTags.length > 0) {
                const matchesTag = searchTags.some(tag => matchesTerm(tag));
                const matchesText = searchQuery ? matchesTerm(searchQuery) : true;
                matchSearch = matchesTag && matchesText;
            } else {
                matchSearch = matchesTerm(searchQuery);
            }

            const matchCat = selectedCategory === 'All Categories' || p.category === selectedCategory;
            return matchSearch && matchCat;
        }).map(p => {
            if (currentPromo.platform !== 'All') {
                const channel = p.channels.find(c => c.platform === currentPromo.platform);
                if (channel && channel.price) {
                    return { ...p, currentPrice: channel.price };
                }
            }
            return p;
        });
    }, [products, searchQuery, searchTags, selectedCategory, existingSkuSet, currentPromo.platform, showInactive]);

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

    const roundTo95 = (price: number, originalPrice: number): number => {
        const candidate = Math.floor(price) + 0.95;
        if (candidate > price) {
            return Math.max(0.95, candidate - 1);
        }
        return Number(candidate.toFixed(2));
    };

    const calculatePromoPrice = (product: Product) => {
        if (priceOverrides[product.sku] !== undefined) {
            return priceOverrides[product.sku];
        }

        let price = product.currentPrice * VAT;
        if (currentPromo.platform !== 'All') {
            const channel = product.channels.find(c => c.platform === currentPromo.platform);
            if (channel && channel.price) price = channel.price * VAT;
        }

        if (product.caPrice && product.caPrice > 0) {
            price = product.caPrice;
        }

        let targetPrice = price;
        if (bulkRule.type === 'PERCENTAGE') {
            targetPrice = price * (1 - bulkRule.value / 100);
        } else {
            targetPrice = Math.max(0, price - bulkRule.value);
        }
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

    const calculateDynamicMargin = (product: Product, promoPrice: number) => {
        const netRevenue = promoPrice / VAT;
        const platformKey = currentPromo.platform !== 'All' ? currentPromo.platform : (product.platform || 'Amazon(UK)');
        const rule = pricingRules[platformKey];
        const commissionRate = rule ? rule.commission : 15;
        const commissionCost = promoPrice * (commissionRate / 100);
        const weight = product.cartonDimensions?.weight || 0;
        let standardPostage = product.postage || 0;
        
        if (logisticsRules && logisticsRules.length > 0) {
            const isValidRule = (r: LogisticsRule) => {
                if (!r.price || r.price <= 0) return false;
                if (r.id === 'pickup' || r.name.toUpperCase() === 'PICKUP' || r.carrier.toUpperCase() === 'COLLECTION') return false;
                if (r.id === 'na' || r.name.toUpperCase() === 'NA') return false;
                if (r.maxWeight !== undefined && r.maxWeight < weight) return false;
                return true;
            };
            const validStandard = logisticsRules.filter(r =>
                isValidRule(r) &&
                !r.name.includes('-Z') && !r.name.includes('-NI') && !r.name.includes('REMOTE')
            ).sort((a, b) => a.price - b.price);

            if (validStandard.length > 0) standardPostage = validStandard[0].price;
        }

        const otherCosts = (product.costPrice || 0) + (product.adsFee || 0) + (product.otherFee || 0) + (product.subscriptionFee || 0) + (product.wmsFee || 0);
        
        const totalCosts = commissionCost + standardPostage + otherCosts;
        const netProfit = netRevenue - totalCosts;
        const margin = netRevenue > 0 ? (netProfit / netRevenue) * 100 : -100;
        
        return {
            margin,
            netProfit,
            netRevenue,
            commissionCost,
            standardPostage,
            otherCosts,
            commissionRate
        };
    };

    const handleConfirm = () => {
        const items = Array.from(selectedSkus).map(sku => {
            const product = products.find(p => p.sku === sku);
            if (!product) return null;
            const promoPrice = calculatePromoPrice(product);
            
            let basePrice = product.currentPrice * VAT;
            if (currentPromo.platform !== 'All') {
                const channel = product.channels.find(c => c.platform === currentPromo.platform);
                if (channel && channel.price) basePrice = channel.price * VAT;
            }
            if (product.caPrice) basePrice = product.caPrice;

            return {
                sku,
                basePrice: Number(basePrice.toFixed(2)),
                promoPrice,
                discountType: 'FIXED',
                discountValue: 0
            };
        }).filter(Boolean) as PromotionItem[];
        
        onConfirm(items);
    };

    return (
        <div className="space-y-6 pb-20 animate-in slide-in-from-right">
            <div className="flex items-center gap-2 mb-2">
                <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
                    <ArrowLeft className="w-5 h-5" />
                </button>
                <div>
                    <h2 className="text-xl font-bold text-gray-900">Add Products to {currentPromo.name}</h2>
                    <p className="text-sm text-indigo-600 font-medium">Filtering for: {currentPromo.platform}</p>
                </div>
                <div className="flex-1"></div>
                <button 
                    onClick={handleConfirm}
                    disabled={selectedSkus.size === 0}
                    className="px-6 py-2 text-white rounded-lg font-medium shadow-md hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    style={{ backgroundColor: themeColor }}
                >
                    <Check className="w-4 h-4" />
                    Add {selectedSkus.size} Products
                </button>
            </div>

            <div className="bg-white p-4 rounded-xl border border-gray-200 flex flex-col xl:flex-row gap-4 items-center justify-between shadow-sm">
                <div className="flex-1 flex flex-col md:flex-row gap-4 w-full">
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1">Search</label>
                        <TagSearchInput 
                            tags={searchTags}
                            onTagsChange={setSearchTags}
                            onInputChange={setSearchQuery}
                            placeholder="Search SKU, Name or Alias..."
                            themeColor={themeColor}
                        />
                    </div>

                    <div className="flex flex-col min-w-[200px]">
                        <label className="text-[10px] font-bold text-gray-500 uppercase mb-1">Category</label>
                        <select 
                            value={selectedCategory}
                            onChange={(e) => setSelectedCategory(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm"
                        >
                            <option>All Categories</option>
                            {uniqueCategories.map(c => <option key={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
                
                <div className="flex items-end gap-6 bg-gray-50/50 p-2 rounded-lg border border-gray-100">
                    <div className="flex flex-col">
                        <label className="text-[10px] font-bold text-indigo-600 uppercase mb-1">Bulk Discount Rule</label>
                        <div className="flex items-center">
                            <select 
                                value={bulkRule.type}
                                onChange={(e) => setBulkRule({...bulkRule, type: e.target.value as any})}
                                className="text-sm bg-transparent border-none focus:ring-0 font-medium pr-1 pl-0 text-gray-700"
                            >
                                <option value="PERCENTAGE">% Off</option>
                                <option value="FIXED">£ Off</option>
                            </select>
                            <input 
                                type="number" 
                                value={bulkRule.value}
                                onChange={(e) => setBulkRule({...bulkRule, value: parseFloat(e.target.value)})}
                                className="w-16 px-2 py-1 rounded border border-gray-300 text-center font-bold text-sm"
                            />
                        </div>
                    </div>

                    <div className="flex flex-col items-center pb-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1">Show Inactive</label>
                        <button 
                            onClick={() => setShowInactive(!showInactive)}
                            className={`p-1.5 rounded transition-colors ${showInactive ? 'bg-indigo-100 text-indigo-600' : 'bg-gray-100 text-gray-400'}`}
                        >
                            {showInactive ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-gray-50 font-bold border-b border-gray-200 text-gray-500 uppercase text-xs tracking-wider">
                        <tr>
                            <th className="p-4 w-10">
                                <input 
                                    type="checkbox" 
                                    checked={selectedSkus.size === filteredProducts.length && filteredProducts.length > 0}
                                    onChange={toggleAll}
                                    className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                            </th>
                            <th className="p-4">SKU / Title</th>
                            <th className="p-4 text-right">Platform Price</th>
                            <th className="p-4 text-right">Optimal</th>
                            <th className="p-4 text-right text-purple-600">CA Price</th>
                            <th className="p-4 text-right bg-indigo-50/30 border-l border-indigo-100 w-32">Promo Price</th>
                            <th className="p-4 text-right">Min Price</th>
                            <th className="p-4 text-right">Proj. Margin</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {filteredProducts.map(p => {
                            const promoPrice = calculatePromoPrice(p);
                            const marginDetails = calculateDynamicMargin(p, promoPrice);
                            
                            let basePrice = p.currentPrice * VAT;
                            if (currentPromo.platform !== 'All') {
                                const channel = p.channels.find(c => c.platform === currentPromo.platform);
                                if (channel && channel.price) basePrice = channel.price * VAT;
                            }

                            const optimal = p.optimalPrice ? p.optimalPrice * VAT : null;
                            const caPrice = p.caPrice;
                            const minPrice = p.floorPrice ? p.floorPrice * VAT : null;

                            return (
                                <tr 
                                    key={p.sku} 
                                    className={`group hover:bg-gray-50/80 transition-colors cursor-pointer ${selectedSkus.has(p.sku) ? 'bg-indigo-50/20' : ''}`}
                                    onClick={(e) => {
                                        const target = e.target as HTMLElement;
                                        if (['INPUT', 'BUTTON', 'TEXTAREA'].includes(target.tagName)) return;
                                        if (window.getSelection()?.toString()) return;
                                        handleRowClick(p.sku);
                                    }}
                                >
                                    <td className="p-4">
                                        <input 
                                            type="checkbox"
                                            checked={selectedSkus.has(p.sku)}
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                handleRowClick(p.sku);
                                            }}
                                            onChange={() => {}}
                                            className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                                        />
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold text-gray-900">{p.sku}</div>
                                        <div 
                                            className="text-xs text-gray-600 font-medium my-1 select-text"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {p.name}
                                        </div>
                                        {p.subcategory && (
                                            <span className="inline-block px-1.5 py-0.5 bg-gray-100 text-gray-500 text-[10px] rounded border border-gray-200">
                                                {p.subcategory}
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right font-medium text-gray-700">
                                        £{basePrice.toFixed(2)}
                                    </td>
                                    <td className="p-4 text-right">
                                        {optimal ? (
                                            <div className="flex items-center justify-end gap-1 text-indigo-600 font-medium">
                                                <Star className="w-3 h-3 fill-indigo-100" /> £{optimal.toFixed(2)}
                                            </div>
                                        ) : <span className="text-gray-300">-</span>}
                                    </td>
                                    <td className="p-4 text-right">
                                        {caPrice ? (
                                            <span className="text-purple-600 font-bold font-mono">
                                                £{caPrice.toFixed(2)}
                                            </span>
                                        ) : <span className="text-gray-300">-</span>}
                                    </td>
                                    <td className="p-4 text-right bg-indigo-50/30 border-l border-indigo-100">
                                        <div className="flex items-center justify-end gap-1">
                                            <span className="text-gray-400 text-xs">£</span>
                                            <input 
                                                type="number"
                                                value={priceOverrides[p.sku] || promoPrice}
                                                onChange={(e) => handlePriceOverride(p.sku, e.target.value)}
                                                className="w-20 text-right font-bold bg-transparent border-none focus:ring-0 p-0 text-gray-900"
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                        </div>
                                        <div className="h-px bg-gray-300 border-dashed w-full mt-1"></div>
                                    </td>
                                    <td className="p-4 text-right text-gray-400 text-xs">
                                        {minPrice ? `£${minPrice.toFixed(2)}` : '-'}
                                    </td>
                                    <td 
                                        className="p-4 text-right cursor-help"
                                        onMouseEnter={(e) => setHoveredMargin({ id: p.sku, rect: e.currentTarget.getBoundingClientRect() })}
                                        onMouseLeave={() => setHoveredMargin(null)}
                                    >
                                        <span className={`px-2 py-1 rounded text-xs font-bold border ${marginDetails.margin > 20 ? 'bg-green-100 text-green-700 border-green-200' : marginDetails.margin > 0 ? 'bg-green-50 text-green-600 border-green-100' : 'bg-red-50 text-red-600 border-red-100'}`}>
                                            {marginDetails.margin.toFixed(1)}%
                                        </span>
                                        {hoveredMargin?.id === p.sku && (
                                            <MarginTooltip 
                                                details={{
                                                    netRevenue: marginDetails.netRevenue,
                                                    commissionRate: marginDetails.commissionRate,
                                                    commissionCost: marginDetails.commissionCost,
                                                    standardPostage: marginDetails.standardPostage,
                                                    otherCosts: marginDetails.otherCosts,
                                                    profitStandard: marginDetails.netProfit,
                                                    netProfit: marginDetails.netProfit // Added for tooltip consistency
                                                }}
                                                marginStandard={marginDetails.margin}
                                                promoPrice={promoPrice}
                                                rect={hoveredMargin.rect}
                                            />
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

// --- MAIN PAGE COMPONENT ---

const PromotionPage: React.FC<PromotionPageProps> = ({ 
    products, 
    pricingRules, 
    logisticsRules,
    promotions, 
    priceHistoryMap,
    onAddPromotion, 
    onUpdatePromotion, 
    onDeletePromotion, 
    themeColor, 
    headerStyle 
}) => {
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
        setActiveTab('dashboard');
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
    };

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-20">
            {/* Header */}
            <div>
                <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>Promotion Manager</h2>
                <p className="mt-1 transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                    Plan, track, and optimize sales events across platforms.
                </p>
            </div>

            {/* Navigation */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                    onClick={() => handleTabChange('dashboard')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'dashboard' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <LayoutDashboard className="w-4 h-4" />
                    Campaigns
                </button>
                <button
                    onClick={() => handleTabChange('all_skus')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'all_skus' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <List className="w-4 h-4" />
                    All Promo SKUs
                </button>
                <button
                    onClick={() => handleTabChange('simulator')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'simulator' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Calculator className="w-4 h-4" />
                    Simulator
                </button>
            </div>

            {/* Content Area */}
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
                            pricingRules={pricingRules}
                            logisticsRules={logisticsRules || []}
                            onCancel={() => setViewMode('event_detail')}
                            onConfirm={handleAddItems}
                            themeColor={themeColor}
                        />
                    )}
                </div>

                <div style={{ display: activeTab === 'all_skus' ? 'block' : 'none' }}>
                    <AllPromoSkusView promotions={promotions} products={products} themeColor={themeColor} />
                </div>

                <div style={{ display: activeTab === 'simulator' ? 'block' : 'none' }}>
                    <SimulatorView themeColor={themeColor} />
                </div>
            </div>
        </div>
    );
};

export default PromotionPage;
