import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown, Search, CheckSquare, Square, Check } from 'lucide-react';

export interface SelectFilterProps {
    /** Label shown in the left badge of the trigger */
    label: string;
    /** Optional Lucide icon shown alongside the label */
    icon?: React.ElementType;
    /** All available options */
    options: string[];
    /** Currently selected values */
    selected: string[];
    /** Called with the new selected array whenever the selection changes */
    onChange: (selected: string[]) => void;
    /**
     * When true, behaves as a single-select: clicking an option selects it and
     * immediately closes the dropdown. "Select All" is hidden; only "Clear" shows.
     * Default: false (multi-select)
     */
    singleSelect?: boolean;
    /**
     * Text shown in the trigger when nothing is selected.
     * Default: 'All'
     */
    allLabel?: string;
    /** Accent colour used for the active border and selected-item indicator */
    themeColor?: string;
}

/**
 * Standard filter dropdown used throughout the app.
 * Supports both multi-select (default) and single-select modes.
 * Uses a portal so the dropdown always renders above all other elements.
 *
 * Usage — multi-select:
 *   <SelectFilter label="Platform" options={platforms} selected={sel} onChange={setSel} />
 *
 * Usage — single-select:
 *   <SelectFilter label="Platform" options={platforms} singleSelect
 *     selected={value === 'All' ? [] : [value]}
 *     onChange={sel => setValue(sel[0] ?? 'All')} />
 */
export const SelectFilter: React.FC<SelectFilterProps> = ({
    label,
    icon: Icon,
    options,
    selected,
    onChange,
    singleSelect = false,
    allLabel = 'All',
    themeColor = '#4f46e5',
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState('');
    const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
    const triggerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const currentSelected = selected || [];

    // Position the portal dropdown below the trigger
    const openDropdown = () => {
        if (triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setDropdownPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
        }
        setIsOpen(true);
    };

    useEffect(() => {
        if (!isOpen) return;
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (
                triggerRef.current && !triggerRef.current.contains(target) &&
                dropdownRef.current && !dropdownRef.current.contains(target)
            ) {
                setIsOpen(false);
                setSearchTerm('');
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const toggleOption = (option: string) => {
        if (singleSelect) {
            if (currentSelected.includes(option)) {
                onChange([]);
            } else {
                onChange([option]);
                setIsOpen(false);
                setSearchTerm('');
            }
        } else {
            if (currentSelected.includes(option)) {
                onChange(currentSelected.filter(item => item !== option));
            } else {
                onChange([...currentSelected, option]);
            }
        }
    };

    const displayText =
        currentSelected.length === 0
            ? allLabel
            : currentSelected.length === 1
            ? currentSelected[0]
            : `${currentSelected.length} Selected`;

    const filteredOptions = options
        ? options.filter(opt => opt.toLowerCase().includes(searchTerm.toLowerCase()))
        : [];

    return (
        <>
            {/* Trigger */}
            <div ref={triggerRef} className="relative">
                <div
                    className="flex items-center border rounded-lg bg-white overflow-hidden cursor-pointer h-8"
                    onClick={() => isOpen ? (setIsOpen(false), setSearchTerm('')) : openDropdown()}
                    style={{ borderColor: isOpen ? themeColor : '#d1d5db' }}
                >
                    <div className="flex items-center gap-1 px-2 py-1 bg-gray-50 border-r border-gray-200 min-w-fit h-full">
                        {Icon && <Icon className="w-3 h-3 text-gray-400" />}
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
                    </div>
                    <div className="flex-1 min-w-[100px] px-2 py-1 flex items-center justify-between h-full">
                        <span className="text-[10px] text-gray-900 truncate max-w-[120px]">{displayText}</span>
                        <ChevronDown className={`w-3 h-3 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                    </div>
                </div>
            </div>

            {/* Dropdown panel — rendered via portal to escape stacking contexts */}
            {isOpen && createPortal(
                <div
                    ref={dropdownRef}
                    className="fixed w-64 bg-white border border-gray-200 rounded-lg shadow-xl z-[9999] overflow-hidden animate-in fade-in zoom-in duration-100"
                    style={{ top: dropdownPos.top, left: dropdownPos.left }}
                >
                    {/* Header: search + actions */}
                    <div className="p-2 border-b border-gray-100 space-y-2">
                        <div className="relative">
                            <Search className="w-3 h-3 text-gray-400 absolute left-2 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Search..."
                                className="w-full pl-7 pr-2 py-1 text-[10px] border border-gray-200 rounded bg-gray-50 focus:bg-white focus:ring-1 focus:ring-indigo-500 transition-all"
                                autoFocus
                                onClick={e => e.stopPropagation()}
                            />
                        </div>
                        <div className="flex justify-between">
                            {!singleSelect && (
                                <button
                                    className="text-[10px] text-gray-500 hover:text-gray-800 font-medium"
                                    onClick={e => { e.stopPropagation(); onChange(options); }}
                                >Select All</button>
                            )}
                            <button
                                className="text-[10px] text-gray-500 hover:text-gray-800 font-medium ml-auto"
                                onClick={e => { e.stopPropagation(); onChange([]); if (singleSelect) setIsOpen(false); }}
                            >Clear</button>
                        </div>
                    </div>

                    {/* Options list */}
                    <div className="max-h-60 overflow-y-auto p-1">
                        {filteredOptions.length > 0 ? (
                            filteredOptions.map(opt => {
                                const isSelected = currentSelected.includes(opt);
                                return (
                                    <div
                                        key={opt}
                                        className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer rounded-md transition-colors"
                                        onClick={() => toggleOption(opt)}
                                    >
                                        {singleSelect ? (
                                            <Check
                                                className="w-3.5 h-3.5 flex-shrink-0 transition-opacity"
                                                style={{ color: isSelected ? themeColor : 'transparent' }}
                                            />
                                        ) : isSelected ? (
                                            <CheckSquare className="w-4 h-4 flex-shrink-0" style={{ color: themeColor }} />
                                        ) : (
                                            <Square className="w-4 h-4 text-gray-300 flex-shrink-0" />
                                        )}
                                        <span className={`text-[10px] truncate ${isSelected ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                                            {opt}
                                        </span>
                                    </div>
                                );
                            })
                        ) : (
                            <div className="p-4 text-center text-[10px] text-gray-400 italic">No matches found</div>
                        )}
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
