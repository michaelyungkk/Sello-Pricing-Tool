import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, ChevronDown, X, Activity, SlidersHorizontal, Check } from 'lucide-react';

export interface FilterBarProps {
    // Search
    searchPlaceholder?: string;
    searchValue?: string;
    onSearchChange?: (val: string) => void;

    // Multi-select filters (platform, category, etc.)
    multiSelects?: Array<{
        key: string;
        label: string;
        icon?: React.ElementType;
        options: string[];
        selected: string[];
        onChange: (selected: string[]) => void;
    }>;

    // Single-select pill group (e.g. All / Increase / Decrease / Maintain)
    pillGroup?: {
        options: Array<{ key: string; label: string }>;
        active: string;
        onChange: (key: string) => void;
    };

    // Toggle buttons (e.g. OOS Hidden)
    toggles?: Array<{
        key: string;
        label: string;
        activeLabel?: string;
        icon?: React.ElementType;
        activeIcon?: React.ElementType;
        active: boolean;
        onChange: (active: boolean) => void;
    }>;

    // Audit button
    showAudit?: boolean;
    auditActive?: boolean;
    onAuditToggle?: () => void;

    // Right side slot for custom controls
    rightSlot?: React.ReactNode;
}

export const FilterBar: React.FC<FilterBarProps> = ({
    searchPlaceholder = 'Search...',
    searchValue,
    onSearchChange,
    multiSelects = [],
    pillGroup,
    toggles = [],
    showAudit,
    auditActive,
    onAuditToggle,
    rightSlot
}) => {
    const [openDropdownKey, setOpenDropdownKey] = useState<string | null>(null);
    const [dropdownSearch, setDropdownSearch] = useState<Record<string, string>>({});
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setOpenDropdownKey(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const activeFilterCount = useMemo(() => {
        let count = 0;
        if (searchValue) count++;
        multiSelects.forEach(m => {
            if (m.selected.length > 0) count++;
        });
        if (pillGroup && pillGroup.options.length > 0 && pillGroup.active !== pillGroup.options[0].key) count++;
        toggles.forEach(t => {
            if (t.active) count++;
        });
        return count;
    }, [searchValue, multiSelects, pillGroup, toggles]);

    const handleClearAll = () => {
        if (onSearchChange) onSearchChange('');
        multiSelects.forEach(m => m.onChange([]));
        if (pillGroup && pillGroup.options.length > 0) {
            pillGroup.onChange(pillGroup.options[0].key);
        }
        toggles.forEach(t => t.onChange(false));
    };

    const getDisplayText = (selected: string[]) => {
        if (!selected || selected.length === 0) return 'All';
        if (selected.length === 1) return selected[0];
        return `${selected.length} Selected`;
    };

    return (
        <div className="bg-custom-glass backdrop-blur-custom border border-custom-glass rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-3 z-30">
            {/* Search */}
            {onSearchChange && (
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder={searchPlaceholder}
                        value={searchValue || ''}
                        onChange={(e) => onSearchChange(e.target.value)}
                        className="pl-10 pr-4 py-1.5 text-xs border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none w-48 text-gray-700 font-medium bg-white/50"
                    />
                </div>
            )}

            {/* Pill Group */}
            {pillGroup && pillGroup.options.length > 0 && (
                <div className="bg-gray-100 p-1 rounded-lg flex gap-0.5 shadow-inner shrink-0">
                    {pillGroup.options.map(opt => (
                        <button
                            key={opt.key}
                            onClick={() => pillGroup.onChange(opt.key)}
                            className={`text-xs font-bold px-3 py-1.5 rounded-md transition-all ${pillGroup.active === opt.key
                                ? 'bg-white shadow text-indigo-600'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            )}

            {/* Toggles */}
            {toggles.map(t => {
                const Icon = t.active ? (t.activeIcon || t.icon) : t.icon;
                return (
                    <button
                        key={t.key}
                        onClick={() => t.onChange(!t.active)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-bold border text-xs transition-all shadow-sm shrink-0 ${t.active
                            ? 'bg-gray-800 text-white border-gray-900'
                            : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                            }`}
                    >
                        {Icon && <Icon className="w-3.5 h-3.5" />}
                        {t.active ? (t.activeLabel || t.label) : t.label}
                    </button>
                );
            })}

            {/* Multi Selects */}
            <div className="flex flex-wrap items-center gap-3 relative" ref={dropdownRef}>
                {multiSelects.map(m => {
                    const isOpen = openDropdownKey === m.key;
                    const searchKey = dropdownSearch[m.key] || '';
                    const filteredOptions = m.options.filter(opt => opt.toLowerCase().includes(searchKey.toLowerCase()));

                    return (
                        <div key={m.key} className="relative">
                            <button
                                onClick={() => setOpenDropdownKey(isOpen ? null : m.key)}
                                className="flex items-center border border-gray-200 rounded-lg shadow-sm bg-white overflow-hidden hover:border-indigo-300 transition-colors h-[34px]"
                            >
                                <div className="bg-gray-50 border-r border-gray-200 px-3 h-full flex items-center gap-1.5 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                    {m.icon && <m.icon className="w-3 h-3" />}
                                    {m.label}
                                </div>
                                <div className="px-3 h-full text-xs font-bold text-gray-700 flex items-center gap-2">
                                    {getDisplayText(m.selected)}
                                    <ChevronDown className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                </div>
                            </button>

                            {isOpen && (
                                <div className="absolute top-full left-0 mt-2 w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-50 animate-in fade-in slide-in-from-top-2 overflow-hidden">
                                    <div className="p-2 border-b border-gray-100 bg-gray-50/50">
                                        <div className="relative">
                                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                                            <input
                                                type="text"
                                                placeholder="Search..."
                                                value={searchKey}
                                                onChange={e => setDropdownSearch(prev => ({ ...prev, [m.key]: e.target.value }))}
                                                className="w-full pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                                onClick={e => e.stopPropagation()}
                                            />
                                        </div>
                                    </div>
                                    <div className="flex bg-gray-50 border-b border-gray-100 divide-x divide-gray-100">
                                        <button
                                            onClick={() => m.onChange(m.options)}
                                            className="flex-1 py-1.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 transition-colors uppercase"
                                        >
                                            Select All
                                        </button>
                                        <button
                                            onClick={() => m.onChange([])}
                                            className="flex-1 py-1.5 text-[10px] font-bold text-gray-500 hover:bg-gray-100 transition-colors uppercase"
                                        >
                                            Clear
                                        </button>
                                    </div>
                                    <div className="max-h-52 overflow-y-auto p-1 divide-y divide-gray-50">
                                        {filteredOptions.length > 0 ? filteredOptions.map(opt => {
                                            const isSelected = m.selected.includes(opt);
                                            return (
                                                <button
                                                    key={opt}
                                                    onClick={() => {
                                                        if (isSelected) {
                                                            m.onChange(m.selected.filter(s => s !== opt));
                                                        } else {
                                                            m.onChange([...m.selected, opt]);
                                                        }
                                                    }}
                                                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between rounded-md transition-colors ${isSelected ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-gray-700 hover:bg-gray-50 font-medium'
                                                        }`}
                                                >
                                                    {opt}
                                                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                                </button>
                                            );
                                        }) : (
                                            <div className="px-3 py-4 text-center text-xs text-gray-400 italic">No options found</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Filter Count & Clear */}
            {activeFilterCount > 0 && (
                <div className="flex items-center gap-3">
                    <div className="h-4 w-px bg-gray-200 mx-1 hidden sm:block"></div>
                    <div className="flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-lg">
                        <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-500" />
                        <span className="text-[10px] font-bold text-indigo-700">FILTERS:</span>
                        <span className="w-4 h-4 bg-indigo-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-sm">
                            {activeFilterCount}
                        </span>
                    </div>
                    <button
                        onClick={handleClearAll}
                        className="text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1 px-2 py-1 rounded-md hover:bg-red-50 transition-colors"
                    >
                        <X className="w-3.5 h-3.5" />
                        Clear All
                    </button>
                </div>
            )}

            <div className="flex-1 min-w-[10px]"></div>

            {/* Right Side Controls & Audit */}
            <div className="flex items-center gap-3 ml-auto shrink-0">
                {rightSlot}
                {showAudit && (
                    <button
                        onClick={onAuditToggle}
                        className={`flex items-center gap-2 px-3 h-8 rounded-lg font-bold border transition-all shadow-sm text-xs ${auditActive
                            ? 'bg-amber-500 text-white border-amber-600'
                            : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                            }`}
                        title="Toggle Audit Panel"
                    >
                        <Activity className="w-4 h-4" />
                        Audit{auditActive ? ': On' : ''}
                    </button>
                )}
            </div>
        </div>
    );
};
