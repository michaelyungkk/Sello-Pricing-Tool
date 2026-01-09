import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Loader2, X, Tag } from 'lucide-react';
import { SearchChip, Product } from '../types';
import { SearchAssistantPopover } from './search/SearchAssistantPopover';
import { ChipSelectionState, Suggestion, MetricId, ConditionId, PlatformId, TimePresetId } from './search/types';
import { METRICS, CONDITIONS } from './search/suggestionConfig';

interface GlobalSearchProps {
  onSearch: (query: string | SearchChip[]) => void;
  isLoading: boolean;
  platforms?: string[];
  products?: Product[];
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ onSearch, isLoading, platforms = [], products = [] }) => {
    const [chips, setChips] = useState<SearchChip[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [searchMode, setSearchMode] = useState<'GLOBAL' | 'SKU'>('GLOBAL');
    const [isFocused, setIsFocused] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // --- MAPPING LOGIC: UI Chips <-> Engine State ---
    const selectionState = useMemo<ChipSelectionState>(() => {
        // Inject prefix if in SKU mode so the engine detects it
        const effectiveText = searchMode === 'SKU' ? `sku: ${inputValue}` : inputValue;

        return {
            metrics: chips.filter(c => c.type === 'METRIC').map(c => c.value as MetricId),
            conditions: chips.filter(c => c.type === 'CONDITION').map(c => c.value as ConditionId),
            platforms: chips.filter(c => c.type === 'PLATFORM').map(c => c.value as PlatformId),
            timePreset: chips.find(c => c.type === 'TIME')?.value as TimePresetId || null,
            searchText: effectiveText
        };
    }, [chips, inputValue, searchMode]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsFocused(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const addChip = (chip: SearchChip) => {
        // Prevent dupes
        if (chips.some(c => c.type === chip.type && c.value === chip.value)) return;
        setChips([...chips, chip]);
        setInputValue('');
        setSearchMode('GLOBAL'); // Reset mode after selection
        inputRef.current?.focus();
    };

    const removeChip = (index: number) => {
        setChips(chips.filter((_, i) => i !== index));
    };

    const handleSuggestionApply = (suggestion: Suggestion) => {
        // Handle SKU suggestion explicitly
        if (suggestion.kind === 'sku') {
            // Format as SKU chip
            const val = `SKU: ${suggestion.id}`;
            addChip({ type: 'TEXT', value: val, label: val });
            return;
        }

        if (!suggestion.applies) return;

        const newChips: SearchChip[] = [];

        // Helper to find label from config ID
        const getMetricLabel = (id: string) => METRICS.find(m => m.id === id)?.label || id;
        const getConditionLabel = (id: string) => CONDITIONS.find(c => c.id === id)?.label || id;

        if (suggestion.applies.metrics) {
            suggestion.applies.metrics.forEach(m => {
                newChips.push({ type: 'METRIC', value: m, label: getMetricLabel(m) });
            });
        }
        if (suggestion.applies.conditions) {
            suggestion.applies.conditions.forEach(c => {
                newChips.push({ type: 'CONDITION', value: c, label: getConditionLabel(c) });
            });
        }
        if (suggestion.applies.platforms) {
            suggestion.applies.platforms.forEach(p => {
                newChips.push({ type: 'PLATFORM', value: p, label: p.replace(/_/g, ' ') });
            });
        }
        if (suggestion.applies.timePreset) {
            newChips.push({ type: 'TIME', value: suggestion.applies.timePreset, label: suggestion.applies.timePreset.replace(/_/g, ' ') });
        }

        // Add all distinct new chips
        const uniqueNew = newChips.filter(nc => !chips.some(ec => ec.type === nc.type && ec.value === nc.value));
        
        if (uniqueNew.length > 0) {
            setChips(prev => [...prev, ...uniqueNew]);
        }
        
        // Keep focus for more selecting
        inputRef.current?.focus();
    };

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = e.target.value;
        
        // Detect "sku:" trigger to switch modes visually
        // Matches "sku:" or "sku " at start of string
        const skuTriggerRegex = /^sku[:\s]/i;
        if (searchMode === 'GLOBAL' && skuTriggerRegex.test(val)) {
            setSearchMode('SKU');
            // Remove the trigger text from input so user just types the ID
            setInputValue(val.replace(skuTriggerRegex, '').trimStart());
            return;
        }

        setInputValue(val);
    };

    const handleSearch = () => {
        let currentInput = inputValue.trim();
        let currentChips = [...chips];

        if (searchMode === 'SKU' && currentInput) {
             const formatted = `SKU: ${currentInput}`;
             currentChips.push({ type: 'TEXT', value: formatted, label: formatted });
        } else if (currentInput) {
            // Fallback: Detect manual SKU entry if mode wasn't triggered
            if (currentInput.toLowerCase().startsWith('sku:') || currentInput.toLowerCase().startsWith('sku ')) {
                const skuVal = currentInput.substring(3).replace(/^[:\s]+/, '').trim();
                if (skuVal) {
                    const formatted = `SKU: ${skuVal}`;
                    currentChips.push({ type: 'TEXT', value: formatted, label: formatted });
                }
            } else {
                currentChips.push({ type: 'TEXT', value: currentInput, label: currentInput });
            }
        }

        // Clear state before notifying parent to prevent flicker
        setInputValue('');
        setSearchMode('GLOBAL');
        setChips([]);
        setIsFocused(false);

        if (currentChips.length > 0) {
            onSearch(currentChips);
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSearch();
        } else if (e.key === 'Backspace' && inputValue === '') {
            // If in SKU mode, backspace exits mode first
            if (searchMode === 'SKU') {
                setSearchMode('GLOBAL');
                e.preventDefault();
            } else if (chips.length > 0) {
                removeChip(chips.length - 1);
            }
        }
    };

    const placeholderText = searchMode === 'SKU' 
        ? "Type SKU ID..." 
        : chips.length === 0 
            ? "Ask a question (or type 'sku:' for products)..." 
            : "";

    return (
        <div className="relative w-full" ref={containerRef}>
            <div 
                className={`relative flex flex-wrap items-center gap-x-2 gap-y-1 p-2 border rounded-xl bg-white/80 transition-all shadow-sm min-h-[50px] cursor-text ${searchMode === 'SKU' ? 'ring-2 ring-teal-500 border-teal-500' : 'border-gray-300 focus-within:ring-2 focus-within:ring-indigo-500'}`}
                onClick={() => inputRef.current?.focus()}
            >
                <Search 
                    className="w-5 h-5 text-gray-400 pointer-events-none ml-2" 
                    style={{ display: (chips.length > 0 || inputValue || searchMode === 'SKU') ? 'none' : 'block' }} 
                />

                {chips.map((chip, index) => {
                    const isSku = chip.label.startsWith('SKU:');
                    return (
                        <div 
                            key={index} 
                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border animate-in fade-in zoom-in-90 ${
                                chip.type === 'METRIC' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                                chip.type === 'TIME' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                                chip.type === 'PLATFORM' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                                chip.type === 'CONDITION' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                                isSku ? 'bg-teal-100 text-teal-800 border-teal-200' :
                                'bg-gray-100 text-gray-700 border-gray-200'
                            }`}
                        >
                            {isSku && <Tag className="w-3 h-3 text-teal-600" />}
                            <span>{chip.label}</span>
                            <button onClick={(e) => { e.stopPropagation(); removeChip(index); }} className="hover:bg-black/10 rounded-full p-0.5">
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    );
                })}

                {/* SKU Mode Visual Indicator */}
                {searchMode === 'SKU' && (
                    <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border bg-teal-100 text-teal-800 border-teal-200 animate-in fade-in zoom-in-90 select-none">
                        <Tag className="w-3 h-3" />
                        <span>SKU Search:</span>
                    </div>
                )}
                
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={handleInputChange}
                    onFocus={() => setIsFocused(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={placeholderText}
                    className="flex-1 min-w-[120px] bg-transparent border-none focus:ring-0 p-1 text-sm placeholder:text-gray-400"
                />

                {isLoading && (
                    <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-600 animate-spin" />
                )}
            </div>

            {/* Smart Suggestion Engine */}
            <SearchAssistantPopover 
                state={selectionState}
                onApply={handleSuggestionApply}
                onClear={() => setChips([])}
                isVisible={isFocused}
                products={products}
            />
        </div>
    );
};

export default GlobalSearch;