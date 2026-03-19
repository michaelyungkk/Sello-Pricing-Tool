
import React, { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface KeywordCloudProps {
    items: { text: string; value: number }[];
}

export const KeywordCloud: React.FC<KeywordCloudProps> = ({ items }) => {
    const [highlightedWord, setHighlightedWord] = useState<string | null>(null);
    const [showAll, setshowAll] = useState(false);

    const displayedItems = useMemo(() => {
        return showAll ? items.slice(0, 40) : items.slice(0, 20);
    }, [items, showAll]);

    const { minVal, maxVal } = useMemo(() => {
        if (items.length === 0) return { minVal: 0, maxVal: 0 };
        const values = items.map(i => i.value);
        return { minVal: Math.min(...values), maxVal: Math.max(...values) };
    }, [items]);

    if (items.length === 0) {
        return <div className="py-8 text-center text-xs text-gray-400 italic">No significant keywords found for this selection.</div>;
    }

    const getStyles = (val: number, text: string) => {
        const range = maxVal - minVal || 1;
        const normalized = (val - minVal) / range;
        
        const fontSize = 11 + normalized * 17; // Slightly smaller base for better density (11px to 28px)
        const opacity = 0.5 + normalized * 0.5; 
        const isHighlighted = highlightedWord === text;
        const hasSelection = highlightedWord !== null;

        const color = normalized > 0.7 ? 'var(--theme)' : normalized > 0.4 ? '#6366f1' : '#64748b';

        return {
            fontSize: `${fontSize}px`,
            opacity: hasSelection ? (isHighlighted ? 1 : 0.2) : opacity,
            fontWeight: fontSize >= 18 ? 700 : 500,
            color: isHighlighted ? '#1e1b4b' : color,
            transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
            transform: isHighlighted ? 'scale(1.1)' : 'scale(1)',
            zIndex: isHighlighted ? 10 : 1,
            lineHeight: '1.2',
            margin: '1px 3px'
        };
    };

    return (
        <div className="flex flex-col">
            <div 
                className="flex flex-wrap gap-x-1 gap-y-1 justify-center items-center overflow-hidden transition-all duration-500 relative min-h-[100px] px-2"
                style={{ maxHeight: showAll ? 'none' : '200px' }}
            >
                {displayedItems.map((w, i) => (
                    <span 
                        key={i} 
                        className="cursor-pointer select-none py-0.5 px-1 hover:text-indigo-900 inline-block text-center"
                        style={getStyles(w.value, w.text)}
                        title={`${w.value} occurrences`}
                        onClick={() => setHighlightedWord(highlightedWord === w.text ? null : w.text)}
                    >
                        {w.text}
                    </span>
                ))}
            </div>
            
            {items.length > 20 && (
                <button 
                    onClick={() => setshowAll(!showAll)}
                    className="mt-5 flex items-center gap-1 text-[10px] font-bold text-theme hover:text-indigo-800 self-center uppercase tracking-widest bg-theme-10/50 hover:bg-theme-10 px-3 py-1.5 rounded-full border border-indigo-100/50 transition-all shadow-sm"
                >
                    {showAll ? <><ChevronUp className="w-3 h-3"/> Show Less</> : <><ChevronDown className="w-3 h-3"/> Show All Keywords ({items.length})</>}
                </button>
            )}
        </div>
    );
};
