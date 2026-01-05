
import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Search, Loader2, X } from 'lucide-react';
import { SearchChip } from '../types';
import { SearchAssistantPopover } from './search/SearchAssistantPopover';
import { ChipSelectionState, Suggestion, MetricId, ConditionId, PlatformId, TimePresetId } from './search/types';
import { METRICS, CONDITIONS } from './search/suggestionConfig';

interface GlobalSearchProps {
  onSearch: (query: string | SearchChip[]) => void;
  isLoading: boolean;
  platforms?: string[];
}

const GlobalSearch: React.FC<GlobalSearchProps> = ({ onSearch, isLoading, platforms = [] }) => {
    const [chips, setChips] = useState<SearchChip[]>([]);
    const [inputValue, setInputValue] = useState('');
    const [isFocused, setIsFocused] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    // --- MAPPING LOGIC: UI Chips <-> Engine State ---
    const selectionState = useMemo<ChipSelectionState>(() => {
        return {
            metrics: chips.filter(c => c.type === 'METRIC').map(c => c.value as MetricId),
            conditions: chips.filter(c => c.type === 'CONDITION').map(c => c.value as ConditionId),
            platforms: chips.filter(c => c.type === 'PLATFORM').map(c => c.value as PlatformId),
            timePreset: chips.find(c => c.type === 'TIME')?.value as TimePresetId || null,
            searchText: inputValue
        };
    }, [chips, inputValue]);

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
        inputRef.current?.focus();
    };

    const removeChip = (index: number) => {
        setChips(chips.filter((_, i) => i !== index));
    };

    const handleSuggestionApply = (suggestion: Suggestion) => {
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

    const handleSearch = () => {
        let currentInput = inputValue.trim();
        let currentChips = [...chips];

        if (currentInput) {
            currentChips.push({ type: 'TEXT', value: currentInput, label: currentInput });
            setInputValue('');
        }

        if (currentChips.length > 0) {
            onSearch(currentChips);
            setChips([]);
            setIsFocused(false);
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            handleSearch();
        } else if (e.key === 'Backspace' && inputValue === '' && chips.length > 0) {
            removeChip(chips.length - 1);
        }
    };

    return (
        <div className="relative w-full" ref={containerRef}>
            <div 
                className="relative flex flex-wrap items-center gap-x-2 gap-y-1 p-2 border border-gray-300 rounded-xl bg-white/80 focus-within:ring-2 focus-within:ring-indigo-500 transition-all shadow-sm min-h-[50px] cursor-text"
                onClick={() => inputRef.current?.focus()}
            >
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400 pointer-events-none z-0" style={{ display: chips.length > 0 || inputValue ? 'none' : 'block' }} />

                {chips.map((chip, index) => (
                    <div 
                        key={index} 
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border animate-in fade-in zoom-in-90 ${
                            chip.type === 'METRIC' ? 'bg-indigo-100 text-indigo-700 border-indigo-200' :
                            chip.type === 'TIME' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                            chip.type === 'PLATFORM' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                            chip.type === 'CONDITION' ? 'bg-amber-100 text-amber-700 border-amber-200' :
                            'bg-gray-100 text-gray-700 border-gray-200'
                        }`}
                    >
                        <span>{chip.label}</span>
                        <button onClick={(e) => { e.stopPropagation(); removeChip(index); }} className="hover:bg-black/10 rounded-full p-0.5">
                            <X className="w-3 h-3" />
                        </button>
                    </div>
                ))}
                
                <input
                    ref={inputRef}
                    type="text"
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onFocus={() => setIsFocused(true)}
                    onKeyDown={handleKeyDown}
                    placeholder={chips.length === 0 ? "Ask a question..." : ""}
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
            />
        </div>
    );
};

export default GlobalSearch;
