
import React, { useState, useMemo } from 'react';
import { LayoutDashboard, Activity, Zap, Archive, TrendingUp, Plus, Edit2, Trash2 } from 'lucide-react';
import { SelectFilter } from '../../common/SelectFilter';
import { MetricCard } from '../../productManagement/parts/MetricCard';
import { StatusBadge } from './StatusBadge';
import { CreateEventModal } from './CreateEventModal';
import { EditScheduleModal } from './EditScheduleModal';
import { SortState, sortRows } from '../../../utils/tableSort';
import { SortableHeader } from '../../common/SortableHeader';
import { PromotionEvent, Product, PricingRules, PriceLog, PriceChangeRecord } from '../../../types';
import { computePromoEffectiveness } from '../../../services/promotionAnalytics';
import { formatPct } from '../../../utils/format';
import { getTodayKeyMelbourne } from '../../../services/dateUtils';

interface PromotionDashboardProps {
    promotions: PromotionEvent[];
    pricingRules: PricingRules;
    onSelectPromo: (id: string) => void;
    onCreateEvent: (promo: PromotionEvent) => void;
    onDeletePromo: (id: string) => void;
    themeColor: string;
    products: Product[];
    priceHistoryMap?: Map<string, PriceLog[]>;
    priceChangeHistory?: PriceChangeRecord[];
    onUpdatePromo?: (promo: PromotionEvent) => void;
}

export const PromotionDashboard: React.FC<PromotionDashboardProps> = ({ 
    promotions, 
    pricingRules, 
    onSelectPromo, 
    onCreateEvent, 
    onDeletePromo, 
    themeColor, 
    products, 
    priceHistoryMap, 
    priceChangeHistory, 
    onUpdatePromo 
}) => {
    const [isCreateOpen, setIsCreateOpen] = useState(false);
    const [sortConfig, setSortConfig] = useState<SortState<string> | null>({ key: 'startDate', dir: 'asc' });
    const [statusFilter, setStatusFilter] = useState('ALL');
    const [editingPromo, setEditingPromo] = useState<PromotionEvent | null>(null);

    // Dynamic Status & Lift Calculation
    // Build product lookup Map once to avoid O(n) find per item
    const productMap = useMemo(() => {
        const m = new Map<string, Product>();
        (products || []).forEach(p => m.set(p.sku.toUpperCase(), p));
        return m;
    }, [products]);

    const txMap = priceHistoryMap || new Map<string, PriceLog[]>();

    const effectivePromotions = useMemo(() => {
        const today = getTodayKeyMelbourne();
        return (promotions || []).map(p => {
            let derivedStatus: 'UPCOMING' | 'ACTIVE' | 'ENDED' = 'ACTIVE';
            if (p.startDate > today) derivedStatus = 'UPCOMING';
            else if (p.endDate < today) derivedStatus = 'ENDED';

            let lift: number | null = null;
            // Calculate lift for Active and Ended campaigns if data available
            if (derivedStatus !== 'UPCOMING' && p.items && p.items.length > 0) {
                let totalUplift = 0;
                let totalBaseline = 0;

                p.items.forEach(item => {
                    const product = productMap.get(item.sku.toUpperCase());
                    // Pass the Map directly — computePromoEffectiveness does O(1) SKU lookup
                    const metrics = computePromoEffectiveness(p, item.sku, txMap, priceChangeHistory, product);
                    
                    const baseline = metrics.actualUnits - metrics.upliftUnits;
                    
                    if (baseline > 0.001) {
                        totalUplift += metrics.upliftUnits;
                        totalBaseline += baseline;
                    }
                });

                if (totalBaseline > 0.001) {
                    lift = totalUplift / totalBaseline;
                }
            }

            return { ...p, status: derivedStatus, lift };
        });
    }, [promotions, productMap, txMap, priceChangeHistory]);

    const handleDeleteClick = (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        if (window.confirm(`Are you sure you want to delete campaign "${name}"?\nThis action cannot be undone.`)) {
            onDeletePromo(id);
        }
    };

    const handleUpdateSchedule = (start: string, end: string, status: 'UPCOMING' | 'ACTIVE' | 'ENDED') => {
        if (editingPromo && onUpdatePromo) {
            onUpdatePromo({
                ...editingPromo,
                startDate: start,
                endDate: end,
                status: status
            });
            setEditingPromo(null);
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
        return effectivePromotions.filter((p: any) => {
            if (!p) return false;
            if (statusFilter !== 'ALL' && p.status !== statusFilter) return false;
            return true;
        });
    }, [effectivePromotions, statusFilter]);

    const sortedPromotions = useMemo(() => {
        const getValue = (promo: any, key: string) => {
            if (!promo) return 0;
            switch (key) {
                case 'startDate':
                case 'endDate': {
                    const dateVal = promo[key];
                    return dateVal ? new Date(dateVal).getTime() : 0;
                }
                case 'items':
                    return (promo.items || []).length;
                case 'status': {
                    const priority = { 'ACTIVE': 3, 'UPCOMING': 2, 'ENDED': 1 };
                    return priority[promo.status as keyof typeof priority] || 0;
                }
                case 'lift':
                    return promo.lift ?? -9999;
                default:
                    return promo[key];
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

    const performanceStats = useMemo(() => {
        let totalCount = 0;
        let activeCount = 0;
        let endedCount = 0;
        const lifts: number[] = [];
    
        effectivePromotions.forEach(p => {
            if (!p) return;
            totalCount++;
            if (p.status === 'ACTIVE') activeCount++;
            if (p.status === 'ENDED') {
                endedCount++;
                if (p.lift !== null) {
                    lifts.push(p.lift);
                }
            }
        });
    
        const hasLifts = lifts.length > 0;
        const avgLift = hasLifts ? lifts.reduce((a,b) => a + b, 0) / lifts.length : 0;
        
        // Stats
        const bestLift = hasLifts ? Math.max(...lifts) : 0;
        const positiveLifts = lifts.filter(l => l > 0).length;
        const positivePct = hasLifts ? (positiveLifts / lifts.length) * 100 : 0;
    
        return {
            totalCount,
            activeCount,
            endedCount,
            avgLift,
            bestLift,
            positivePct,
            hasLifts
        };
    }, [effectivePromotions]);

    return (
        <div className="space-y-6">
            {/* Promotion Performance Overview */}
            <div>
                <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Activity className="w-5 h-5 text-theme" />
                    Promotion Performance Overview
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                  <MetricCard title="Total Campaigns" value={performanceStats.totalCount} icon={LayoutDashboard} color="gray" />
                  <MetricCard title="Active Now" value={performanceStats.activeCount} icon={Zap} color="green" />
                  <MetricCard title="Completed" value={performanceStats.endedCount} icon={Archive} color="blue" />
                  <MetricCard
                      title="Avg Lift (Ended)"
                      value={performanceStats.hasLifts ? <span className={performanceStats.avgLift > 0 ? 'v-num' : performanceStats.avgLift < 0 ? 'v-neg' : 'v-num'}>{formatPct(performanceStats.avgLift * 100)}</span> : '—'}
                      icon={TrendingUp}
                      color="indigo"
                      desc={performanceStats.hasLifts ? `Max: ${formatPct(performanceStats.bestLift * 100)} · Pos: ${formatPct(performanceStats.positivePct)}` : undefined}
                  />
                </div>
            </div>

            <div className="sello-glass p-4 rounded-xl flex justify-between items-center">
                <div>
                    <h3 className="text-lg font-bold text-gray-900">Active Campaigns</h3>
                    <p className="text-sm text-gray-500">Manage sales events and pricing overrides.</p>
                </div>
                <div className="flex items-center gap-3">
                    <SelectFilter
                        label="Status"
                        options={['UPCOMING', 'ACTIVE', 'ENDED']}
                        selected={statusFilter === 'ALL' ? [] : [statusFilter]}
                        onChange={sel => setStatusFilter(sel.length === 0 ? 'ALL' : sel[0])}
                        singleSelect
                        allLabel="All Statuses"
                    />
                    <button
                        onClick={() => setIsCreateOpen(true)}
                        className="px-4 py-2 bg-theme text-white rounded-lg font-medium shadow-md hover:bg-theme transition-colors flex items-center gap-2"
                        style={{ backgroundColor: themeColor }}
                    >
                        <Plus className="w-4 h-4" />
                        New Campaign
                    </button>
                </div>
            </div>

            <div className="sello-glass rounded-xl overflow-hidden">
                <table className="tbl sello-table">
                    <thead >
                        <tr>
                            <SortableHeader label="Campaign Name" sortKey="name" sort={sortConfig} onChange={setSortConfig} />
                            <SortableHeader label="Platform" sortKey="platform" sort={sortConfig} onChange={setSortConfig} />
                            <SortableHeader label="Dates" sortKey="startDate" sort={sortConfig} onChange={setSortConfig} />
                            <th>Scope</th>
                            <SortableHeader label="Items" sortKey="items" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader label="Lift" sortKey="lift" sort={sortConfig} onChange={setSortConfig} align="right" />
                            <SortableHeader label="Status" sortKey="status" sort={sortConfig} onChange={setSortConfig} align="center" />
                            <th className="r">Actions</th>
                        </tr>
                    </thead>
                    <tbody >
                        {sortedPromotions.map((promo: any) => (
                            <tr 
                                key={promo.id} 
                                style={{cursor:"pointer"}}
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
                                <td className="p-4 text-gray-600 text-xs font-mono group/date relative">
                                    {formatDate(promo.startDate)} - {formatDate(promo.endDate)}
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); setEditingPromo(promo); }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-white border border-gray-200 rounded-lg text-gray-400 hover:text-theme hover:border-theme-20 shadow-sm opacity-0 transition-all"
                                        title="Edit Schedule"
                                    >
                                        <Edit2 className="w-3 h-3" />
                                    </button>
                                </td>
                                <td className="p-4">
                                    <span className={`text-[10px] font-black px-1.5 py-0.5 rounded border ${promo.promotionScope === 'SHOP' ? 'bg-theme-10 text-theme border-theme-20' : 'bg-white text-gray-500 border-gray-200'}`}>
                                        {promo.promotionScope || 'SKU'}
                                    </span>
                                </td>
                                <td className="p-4 text-right">
                                    <span className="font-mono font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">
                                        {(promo.items || []).length}
                                    </span>
                                </td>
                                <td className="p-4 text-right">
                                    {promo.lift !== null ? (
                                        <span className={`font-bold ${promo.lift > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                                            {promo.lift > 0 ? '+' : ''}{formatPct(promo.lift * 100)}
                                        </span>
                                    ) : (
                                        <span className="text-gray-300">-</span>
                                    )}
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

            {editingPromo && (
                <EditScheduleModal 
                    promo={editingPromo}
                    onClose={() => setEditingPromo(null)}
                    onSave={handleUpdateSchedule}
                   
                />
            )}
        </div>
    );
};
