
import React, { useState, useMemo } from 'react';
import {
    Plus,
    Edit2,
    Trash2,
    RefreshCw,
    X,
    Info,
    Check,
    Search,
    AlertCircle,
    LayoutGrid,
    Target,
    SlidersHorizontal,
    ArrowUpDown,
    ChevronDown,
    Calendar,
    Filter,
    Clock,
    History
} from 'lucide-react';
import { AdGroup, SkuFamily, Product, PricingRules } from '../../../types';
import { formatMoney, formatSmartMoney } from '../../../utils/format';
import { MetricCard } from '../../productManagement/parts/MetricCard';
import { FilterBar } from '../../common/FilterBar';

interface AdGroupsTabProps {
    adGroups: AdGroup[];
    skuFamilies: SkuFamily[];
    products: Product[];
    onSyncFromFamilies: (platform: string) => void;
    onAddAdGroup: (group: AdGroup) => void;
    onEditAdGroup: (group: AdGroup) => void;
    onRemoveAdGroup: (id: string) => void;
    onSaveAdGroups: (groups: AdGroup[]) => { affectedTransactions: number, totalSpreadAmount: number, daysProcessed: number };
    themeColor: string;
    platforms: string[];
    pricingRules: PricingRules;
    lastRecalculationSummary?: { affectedTransactions: number, totalSpreadAmount: number, daysProcessed: number } | null;
}

type SortKey = 'name' | 'status' | 'dateRange';
type SortDirection = 'asc' | 'desc';

export const AdGroupsTab: React.FC<AdGroupsTabProps> = ({
    adGroups = [],
    skuFamilies = [],
    products = [],
    onSyncFromFamilies,
    onAddAdGroup,
    onEditAdGroup,
    onRemoveAdGroup,
    onSaveAdGroups,
    themeColor,
    platforms = [],
    pricingRules = {}
}) => {
    // --- STATE ---
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [editingGroup, setEditingGroup] = useState<AdGroup | null>(null);
    const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
    const [selectedSyncPlatform, setSelectedSyncPlatform] = useState<string>(platforms[0] || 'Amazon');

    // Filters
    const [searchQuery, setSearchQuery] = useState('');
    const [searchTags, setSearchTags] = useState<string[]>([]);
    const [platformFilter, setPlatformFilter] = useState('All Platforms');
    const [statusFilter, setStatusFilter] = useState('All Status');

    // Sorting
    const [sort, setSort] = useState<{ key: SortKey, direction: SortDirection }>({ key: 'name', direction: 'asc' });

    // Selection
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

    // Bulk Modals
    const [isBulkEndDateModalOpen, setIsBulkEndDateModalOpen] = useState(false);
    const [bulkEndDate, setBulkEndDate] = useState('');

    // Modal Form State
    const [modalData, setModalData] = useState<Partial<AdGroup>>({
        name: '',
        platform: platforms[0] || 'Amazon',
        memberSkus: [],
        startDate: new Date().toISOString().split('T')[0],
        endDate: ''
    });
    const [skuSearch, setSkuSearch] = useState('');

    // --- HELPERS ---
    const todayStr = new Date().toISOString().split('T')[0];

    const getStatus = (group: AdGroup) => {
        if (group.startDate > todayStr) return 'Scheduled';
        if (group.endDate && group.endDate < todayStr) return 'Ended';
        return 'Ongoing';
    };

    const formatDate = (dateStr: string) => {
        if (!dateStr) return '';
        const d = new Date(dateStr);
        return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
    };

    const formatDateRangeText = (group: AdGroup) => {
        const start = formatDate(group.startDate);
        const status = getStatus(group);
        if (status === 'Scheduled') return `Starts ${start}`;
        if (status === 'Ended') return `${start} → ${formatDate(group.endDate!)}`;
        return `${start} → Ongoing`;
    };

    // --- DERIVED DATA ---
    const stats = useMemo(() => {
        let total = adGroups.length;
        let ongoing = 0;
        let ended = 0;
        let scheduled = 0;
        adGroups.forEach(g => {
            const s = getStatus(g);
            if (s === 'Ongoing') ongoing++;
            else if (s === 'Ended') ended++;
            else if (s === 'Scheduled') scheduled++;
        });
        return { total, ongoing, ended, scheduled };
    }, [adGroups, todayStr]);

    const platformOptions = useMemo(() => Array.from(new Set(adGroups.map(g => g.platform))).sort(), [adGroups]);

    const filteredAndSortedGroups = useMemo(() => {
        let result = adGroups.filter(g => {
            const matchesTerm = (term: string) =>
                g.name.toLowerCase().includes(term.toLowerCase()) ||
                g.memberSkus.some(s => s.toLowerCase().includes(term.toLowerCase()));
            const matchesSearch = searchTags.length > 0
                ? searchTags.some(t => matchesTerm(t))
                : !searchQuery || matchesTerm(searchQuery);
            const matchesPlatform = platformFilter === 'All Platforms' || g.platform === platformFilter;
            const matchesStatus = statusFilter === 'All Status' || getStatus(g) === statusFilter;
            return matchesSearch && matchesPlatform && matchesStatus;
        });

        result.sort((a, b) => {
            let valA: any, valB: any;
            if (sort.key === 'name') {
                valA = a.name.toLowerCase();
                valB = b.name.toLowerCase();
            } else if (sort.key === 'status') {
                valA = getStatus(a);
                valB = getStatus(b);
            } else if (sort.key === 'dateRange') {
                valA = a.startDate;
                valB = b.startDate;
            }

            if (valA < valB) return sort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return result;
    }, [adGroups, searchQuery, searchTags, platformFilter, statusFilter, sort, todayStr]);

    const filteredProducts = useMemo(() => {
        if (!skuSearch) return products.slice(0, 50);
        return products.filter(p =>
            p.sku.toLowerCase().includes(skuSearch.toLowerCase()) ||
            p.name.toLowerCase().includes(skuSearch.toLowerCase())
        ).slice(0, 50);
    }, [products, skuSearch]);

    const overlapWarnings = useMemo(() => {
        if (!modalData.memberSkus?.length || !modalData.startDate) return [];

        const warnings: string[] = [];
        const currentId = editingGroup?.id;
        const s1 = modalData.startDate;
        const e1 = modalData.endDate || '9999-12-31';

        modalData.memberSkus.forEach(sku => {
            const overlappingGroup = adGroups.find(g => {
                if (g.id === currentId) return false;
                if (!g.memberSkus.includes(sku)) return false;

                const s2 = g.startDate;
                const e2 = g.endDate || '9999-12-31';

                // Overlap: s1 <= e2 AND s2 <= e1
                return s1 <= e2 && s2 <= e1;
            });

            if (overlappingGroup) {
                warnings.push(`SKU ${sku} overlaps with group ${overlappingGroup.name} (${formatDate(overlappingGroup.startDate)} → ${overlappingGroup.endDate ? formatDate(overlappingGroup.endDate) : 'Ongoing'}).`);
            }
        });

        return warnings;
    }, [modalData.memberSkus, modalData.startDate, modalData.endDate, adGroups, editingGroup]);

    // --- HANDLERS ---
    const handleSync = () => {
        onSyncFromFamilies(selectedSyncPlatform);
        setIsSyncModalOpen(false);
    };

    const handleSort = (key: SortKey) => {
        if (sort.key === key) {
            setSort({ key, direction: sort.direction === 'asc' ? 'desc' : 'asc' });
        } else {
            setSort({ key, direction: key === 'dateRange' ? 'desc' : 'asc' });
        }
    };

    const toggleSelectAll = () => {
        if (selectedIds.size === filteredAndSortedGroups.length) {
            setSelectedIds(new Set());
        } else {
            setSelectedIds(new Set(filteredAndSortedGroups.map(g => g.id)));
        }
    };

    const toggleSelect = (id: string) => {
        const next = new Set(selectedIds);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        setSelectedIds(next);
    };

    const openAddModal = () => {
        setModalData({
            name: '',
            platform: platforms[0] || 'Amazon',
            memberSkus: [],
            startDate: todayStr,
            endDate: ''
        });
        setEditingGroup(null);
        setIsAddModalOpen(true);
    };

    const openEditModal = (group: AdGroup) => {
        setEditingGroup(group);
        setModalData({ ...group });
        setIsAddModalOpen(true);
    };

    const handleSave = () => {
        if (!modalData.name || !modalData.memberSkus?.length || !modalData.platform || !modalData.startDate) {
            alert("Please provide all required fields.");
            return;
        }

        if (modalData.endDate && modalData.startDate > modalData.endDate) {
            alert("Start date must be before end date.");
            return;
        }

        const now = new Date().toISOString();
        let nextGroups = [...adGroups];
        if (editingGroup) {
            nextGroups = adGroups.map(g => g.id === editingGroup.id ? { ...editingGroup, ...modalData, updatedAt: now } as AdGroup : g);
        } else {
            nextGroups.push({
                id: `ag-${Date.now()}`,
                name: modalData.name as string,
                platform: modalData.platform as string,
                memberSkus: modalData.memberSkus || [],
                startDate: modalData.startDate as string,
                endDate: modalData.endDate || undefined,
                createdAt: now,
                updatedAt: now
            });
        }

        onSaveAdGroups(nextGroups);
        setIsAddModalOpen(false);
    };

    const handleDeleteSelected = () => {
        if (window.confirm(`Are you sure you want to delete ${selectedIds.size} ad groups? This will trigger a full ad spend recalculation.`)) {
            let nextGroups = adGroups.filter(g => !selectedIds.has(g.id));
            onSaveAdGroups(nextGroups);
            setSelectedIds(new Set());
        }
    };

    const handleBulkSetEndDate = () => {
        if (!bulkEndDate) return;
        let nextGroups = adGroups.map(g => selectedIds.has(g.id) ? { ...g, endDate: bulkEndDate, updatedAt: new Date().toISOString() } : g);
        onSaveAdGroups(nextGroups);
        setIsBulkEndDateModalOpen(false);
        setBulkEndDate('');
        setSelectedIds(new Set());
    };

    // --- RENDER HELPERS ---
    const renderStatusBadge = (status: string) => {
        switch (status) {
            case 'Ongoing':
                return <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-[10px] font-bold">Ongoing</span>;
            case 'Ended':
                return <span className="px-2 py-0.5 bg-gray-50 text-gray-500 border border-gray-200 rounded-full text-[10px] font-bold">Ended</span>;
            case 'Scheduled':
                return <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px] font-bold">Scheduled</span>;
            default:
                return null;
        }
    };

    const renderPlatformBadge = (platform: string) => {
        const rule = pricingRules[platform];
        const color = rule?.color || '#6366f1';
        return (
            <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md flex items-center justify-center text-[8px] font-black text-white shadow-sm" style={{ backgroundColor: color }}>
                    {platform[0].toUpperCase()}
                </div>
                <span className="text-xs font-bold text-gray-700">{platform}</span>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                        <Target className="w-5 h-5 text-theme" />
                        Ad Spend Groups
                    </h2>
                    <div className="mt-1 flex items-start gap-2 max-w-2xl bg-theme-10/50 border border-indigo-100 p-2 rounded-lg">
                        <Info className="w-4 h-4 text-theme mt-0.5 shrink-0" />
                        <p className="text-[11px] text-theme leading-relaxed font-medium">
                            Ad spend is redistributed equally across all group members
                            for transactions within each group's active date range.
                            Applied to full history on every upload.
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setIsSyncModalOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg text-sm font-bold shadow-sm hover:bg-gray-50 transition-all group"
                    >
                        <RefreshCw className="w-4 h-4 text-theme group-hover:rotate-180 transition-transform duration-500" />
                        Sync from Family Groups
                    </button>
                    <button
                        onClick={openAddModal}
                        className="flex items-center gap-2 px-4 py-2 text-white rounded-lg text-sm font-bold shadow-lg hover:brightness-110 transition-all"
                        style={{ backgroundColor: themeColor }}
                    >
                        <Plus className="w-4 h-4" />
                        Add Ad Group
                    </button>
                </div>
            </div>

            {/* Stats Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard title="Total Groups" value={stats.total} icon={Target} color="indigo" />
                <MetricCard title="Ongoing" value={stats.ongoing} icon={Clock} color="emerald" />
                <MetricCard title="Ended" value={stats.ended} icon={History} color="gray" />
                <MetricCard title="Scheduled" value={stats.scheduled} icon={Calendar} color="blue" />
            </div>

            {/* Filters Bar */}
            <FilterBar
                searchTags={searchTags}
                onSearchTagsChange={(tags) => { setSearchTags(tags); }}
                onSearchChange={(val) => { setSearchQuery(val); }}
                searchPlaceholder="Search by group name or SKU…"
                multiSelects={[
                    {
                        key: 'platform',
                        label: 'Platform',
                        options: platformOptions,
                        selected: platformFilter === 'All Platforms' ? [] : [platformFilter],
                        onChange: (selected) => setPlatformFilter(selected.length > 0 ? selected[0] : 'All Platforms')
                    }
                ]}
                pillGroup={{
                    options: [
                        { key: 'All Status', label: 'All Status' },
                        { key: 'Ongoing', label: 'Ongoing' },
                        { key: 'Ended', label: 'Ended' },
                        { key: 'Scheduled', label: 'Scheduled' }
                    ],
                    active: statusFilter,
                    onChange: setStatusFilter
                }}
            />

            {/* Table Container */}
            <div className="bg-custom-glass backdrop-blur-custom rounded-xl shadow-sm border border-custom-glass overflow-hidden relative">
                {/* Bulk Actions Bar */}
                {selectedIds.size > 0 && (
                    <div className="absolute top-0 left-0 right-0 h-14 bg-theme px-6 flex items-center justify-between text-white z-20">
                        <div className="flex items-center gap-4">
                            <span className="text-sm font-bold">{selectedIds.size} groups selected</span>
                            <div className="h-4 w-px bg-white/30" />
                            <button
                                onClick={() => setSelectedIds(new Set())}
                                className="text-xs font-bold text-white/80 hover:text-white"
                            >
                                Deselect All
                            </button>
                        </div>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setIsBulkEndDateModalOpen(true)}
                                className="px-4 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-lg text-xs font-bold border border-white/20 transition-all flex items-center gap-2"
                            >
                                <Calendar className="w-3.5 h-3.5" />
                                Set End Date
                            </button>
                            <button
                                onClick={handleDeleteSelected}
                                className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-xs font-bold shadow-sm transition-all flex items-center gap-2"
                            >
                                <Trash2 className="w-3.5 h-3.5" />
                                Delete Selected
                            </button>
                        </div>
                    </div>
                )}

                <div className="overflow-x-auto">
                    <table className="tbl w-full text-left text-sm">
                        <thead>
                            <tr>
                                <th className="p-4 w-10">
                                    <input
                                        type="checkbox"
                                        className="rounded border-gray-300 text-theme focus:ring-theme cursor-pointer"
                                        checked={selectedIds.size === filteredAndSortedGroups.length && filteredAndSortedGroups.length > 0}
                                        onChange={toggleSelectAll}
                                    />
                                </th>
                                <th
                                    className="p-4 cursor-pointer hover:text-theme transition-colors"
                                    onClick={() => handleSort('name')}
                                >
                                    <div className="flex items-center gap-2">
                                        Group Name
                                        <ArrowUpDown className={`w-3 h-3 ${sort.key === 'name' ? 'text-theme' : 'text-gray-300'}`} />
                                    </div>
                                </th>
                                <th className="p-4">Member SKUs</th>
                                <th className="p-4">Platform</th>
                                <th
                                    className="p-4 cursor-pointer hover:text-theme transition-colors"
                                    onClick={() => handleSort('status')}
                                >
                                    <div className="flex items-center gap-2 text-center justify-center">
                                        Status
                                        <ArrowUpDown className={`w-3 h-3 ${sort.key === 'status' ? 'text-theme' : 'text-gray-300'}`} />
                                    </div>
                                </th>
                                <th
                                    className="p-4 cursor-pointer hover:text-theme transition-colors"
                                    onClick={() => handleSort('dateRange')}
                                >
                                    <div className="flex items-center gap-2 text-right justify-end">
                                        Date Range
                                        <ArrowUpDown className={`w-3 h-3 ${sort.key === 'dateRange' ? 'text-theme' : 'text-gray-300'}`} />
                                    </div>
                                </th>
                                <th className="p-4 text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {filteredAndSortedGroups.length > 0 ? filteredAndSortedGroups.map(group => {
                                const isSelected = selectedIds.has(group.id);
                                return (
                                    <tr key={group.id} className={`${isSelected ? 'bg-theme-10/30' : ''}`}>
                                        <td className="p-4">
                                            <input
                                                type="checkbox"
                                                className="rounded border-gray-300 text-theme focus:ring-theme cursor-pointer"
                                                checked={isSelected}
                                                onChange={() => toggleSelect(group.id)}
                                            />
                                        </td>
                                        <td className="p-4">
                                            <div className="font-bold text-gray-900">{group.name}</div>
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-wrap gap-1 max-w-sm">
                                                {group.memberSkus.map(sku => (
                                                    <span key={sku} className="px-1.5 py-0.5 bg-theme-10 text-theme rounded text-[9px] font-bold border border-indigo-100">
                                                        {sku}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="p-4">
                                            {renderPlatformBadge(group.platform)}
                                        </td>
                                        <td className="p-4 text-center">
                                            {renderStatusBadge(getStatus(group))}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="text-[11px] font-bold text-gray-700 font-mono">
                                                {formatDateRangeText(group)}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex justify-end gap-1">
                                                <button
                                                    onClick={() => openEditModal(group)}
                                                    className="p-1.5 text-gray-400 hover:text-theme hover:bg-theme-10 rounded-lg transition-all"
                                                    title="Edit"
                                                >
                                                    <Edit2 className="w-3.5 h-3.5" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm("Removing this ad group will trigger a full ad spend recalculation. Continue?")) {
                                                            onRemoveAdGroup(group.id);
                                                        }
                                                    }}
                                                    className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all"
                                                    title="Remove"
                                                >
                                                    <Trash2 className="w-3.5 h-3.5" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            }) : (
                                <tr>
                                    <td colSpan={7} className="p-12 text-center">
                                        <div className="flex flex-col items-center justify-center text-gray-400">
                                            <LayoutGrid className="w-12 h-12 opacity-10 mb-2" />
                                            <p className="italic">No ad groups found matching active filters.</p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Modal: Add / Edit Ad Group */}
            {isAddModalOpen && (
                <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm ">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <Target className="w-5 h-5 text-theme" />
                                {editingGroup ? 'Edit Ad Group' : 'Create New Ad Group'}
                            </h3>
                            <button onClick={() => setIsAddModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full text-gray-400 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase px-1">Group Name <span className="text-red-500">*</span></label>
                                    <input
                                        type="text"
                                        value={modalData.name || ''}
                                        onChange={e => setModalData({ ...modalData, name: e.target.value })}
                                        placeholder="e.g. Memory Foam Pillows"
                                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-theme outline-none transition-all font-medium text-sm"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase px-1">Platform <span className="text-red-500">*</span></label>
                                    <select
                                        value={modalData.platform || ''}
                                        onChange={e => setModalData({ ...modalData, platform: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-theme outline-none transition-all font-medium text-sm"
                                    >
                                        <option value="" disabled>Select Platform</option>
                                        {platforms.map(p => (
                                            <option key={p} value={p}>{p}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1.5">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase px-1">Start Date <span className="text-red-500">*</span></label>
                                    <input
                                        type="date"
                                        value={modalData.startDate || ''}
                                        onChange={e => setModalData({ ...modalData, startDate: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-theme outline-none transition-all font-medium text-sm"
                                    />
                                </div>
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between px-1">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase">End Date (Optional)</label>
                                        <div className="flex gap-2">
                                            {modalData.endDate && (
                                                <button onClick={() => setModalData({ ...modalData, endDate: '' })} className="text-[9px] font-bold text-theme hover:text-theme">Set as Ongoing</button>
                                            )}
                                            <button onClick={() => setModalData({ ...modalData, endDate: todayStr })} className="text-[9px] font-bold text-gray-500 hover:text-gray-700">End Today</button>
                                        </div>
                                    </div>
                                    <input
                                        type="date"
                                        value={modalData.endDate || ''}
                                        onChange={e => setModalData({ ...modalData, endDate: e.target.value })}
                                        className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-theme outline-none transition-all font-medium text-sm"
                                    />
                                </div>
                            </div>

                            {/* Overlap Warnings */}
                            {overlapWarnings.length > 0 && (
                                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl space-y-2">
                                    {overlapWarnings.map((warning, i) => (
                                        <div key={i} className="flex gap-2 text-[11px] text-amber-800 font-medium">
                                            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                            <span>{warning}</span>
                                        </div>
                                    ))}
                                    <p className="text-[10px] text-amber-600 font-bold px-6">Overlapping dates may split ad spend unpredictably. Review before saving.</p>
                                </div>
                            )}

                            {/* SKU Selector */}
                            <div className="space-y-3">
                                <div className="flex items-center justify-between">
                                    <label className="text-[10px] font-bold text-gray-400 uppercase px-1">Member SKUs ({modalData.memberSkus?.length || 0} selected) <span className="text-red-500">*</span></label>
                                    <div className="relative w-48">
                                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                        <input
                                            type="text"
                                            value={skuSearch}
                                            onChange={e => setSkuSearch(e.target.value)}
                                            placeholder="Search SKUs..."
                                            className="w-full pl-9 pr-3 py-1.5 border border-gray-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-theme"
                                        />
                                    </div>
                                </div>

                                <div className="border border-gray-100 rounded-xl overflow-hidden bg-gray-50/30">
                                    <div className="max-h-52 overflow-y-auto divide-y divide-gray-50">
                                        {filteredProducts.map(product => {
                                            const isSelected = modalData.memberSkus?.includes(product.sku);
                                            return (
                                                <div
                                                    key={product.sku}
                                                    onClick={() => {
                                                        const current = modalData.memberSkus || [];
                                                        setModalData({
                                                            ...modalData,
                                                            memberSkus: isSelected ? current.filter(s => s !== product.sku) : [...current, product.sku]
                                                        });
                                                    }}
                                                    className={`p-3 flex items-center justify-between cursor-pointer transition-colors ${isSelected ? 'bg-theme-10' : 'hover:bg-white'}`}
                                                >
                                                    <div className="flex flex-col">
                                                        <span className="text-xs font-bold text-gray-900">{product.sku}</span>
                                                        <span className="text-[10px] text-gray-500 truncate max-w-[300px]">{product.name}</span>
                                                    </div>
                                                    {isSelected && <Check className="w-4 h-4 text-theme" />}
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Active Selection Badges */}
                                {modalData.memberSkus && modalData.memberSkus.length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 p-2 bg-theme-10/50 rounded-xl border border-indigo-100">
                                        {modalData.memberSkus.map(sku => (
                                            <span key={sku} className="flex items-center gap-1.5 pl-2 pr-1.5 py-0.5 bg-white text-theme rounded text-[10px] font-bold border border-theme-20 shadow-sm">
                                                {sku}
                                                <button
                                                    onClick={() => setModalData({ ...modalData, memberSkus: modalData.memberSkus?.filter(s => s !== sku) })}
                                                    className="hover:text-red-500 transition-colors"
                                                >
                                                    <X className="w-3 h-3" />
                                                </button>
                                            </span>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                            <button
                                onClick={() => setIsAddModalOpen(false)}
                                className="px-6 py-2.5 text-gray-600 hover:bg-gray-200 rounded-xl text-sm font-bold transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSave}
                                className="px-8 py-2.5 text-white rounded-xl text-sm font-bold shadow-lg hover:brightness-110 transition-all flex items-center gap-2"
                                style={{ backgroundColor: themeColor }}
                            >
                                <Check className="w-4 h-4" />
                                {editingGroup ? 'Save Changes' : 'Create Ad Group'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Bulk Set End Date */}
            {isBulkEndDateModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="p-6 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                            <h3 className="text-lg font-bold text-gray-900">Set End Date</h3>
                            <button onClick={() => setIsBulkEndDateModalOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
                        </div>
                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-600">Setting end date for <strong>{selectedIds.size}</strong> groups.</p>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase px-1">New End Date</label>
                                <input
                                    type="date"
                                    value={bulkEndDate}
                                    onChange={e => setBulkEndDate(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-theme outline-none transition-all font-medium text-sm"
                                />
                            </div>
                        </div>
                        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                            <button onClick={() => setIsBulkEndDateModalOpen(false)} className="px-5 py-2 text-gray-500 font-bold text-sm">Cancel</button>
                            <button
                                onClick={handleBulkSetEndDate}
                                disabled={!bulkEndDate}
                                className="px-6 py-2 bg-theme text-white rounded-xl text-sm font-bold disabled:opacity-50"
                            >
                                Apply to Selected
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Modal: Sync Platforms */}
            {isSyncModalOpen && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden border border-gray-100">
                        <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-gray-50/50">
                            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                                <RefreshCw className="w-5 h-5 text-theme" />
                                Sync Platforms
                            </h3>
                            <button onClick={() => setIsSyncModalOpen(false)} className="p-2 hover:bg-gray-200 rounded-full text-gray-400 transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="p-6 space-y-4">
                            <p className="text-sm text-gray-600 italic">
                                This will create Ad Groups for all SKU Families that don't already have one for the selected platform. New groups start today and are ongoing.
                            </p>

                            <div className="space-y-1.5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase px-1">Target Platform</label>
                                <select
                                    value={selectedSyncPlatform}
                                    onChange={e => setSelectedSyncPlatform(e.target.value)}
                                    className="w-full px-4 py-2 border border-gray-200 rounded-xl focus:ring-2 focus:ring-theme outline-none transition-all font-medium text-sm"
                                >
                                    {platforms.map(p => (
                                        <option key={p} value={p}>{p}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 bg-gray-50/50 flex justify-end gap-3">
                            <button
                                onClick={() => setIsSyncModalOpen(false)}
                                className="px-6 py-2.5 text-gray-600 hover:bg-gray-200 rounded-xl text-sm font-bold transition-all"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSync}
                                className="px-8 py-2.5 text-white rounded-xl text-sm font-bold shadow-lg hover:brightness-110 transition-all flex items-center gap-2"
                                style={{ backgroundColor: themeColor }}
                            >
                                <Check className="w-4 h-4" />
                                Start Sync
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
