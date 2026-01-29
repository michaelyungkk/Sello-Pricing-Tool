
import React, { useState, KeyboardEvent, ClipboardEvent } from 'react';
import { Search, X } from 'lucide-react';

interface TagSearchInputProps {
    tags: string[];
    onTagsChange: (tags: string[]) => void;
    onInputChange: (value: string) => void;
    placeholder?: string;
    themeColor: string;
}

export const TagSearchInput: React.FC<TagSearchInputProps> = ({ tags, onTagsChange, onInputChange, placeholder, themeColor }) => {
    const [input, setInput] = useState('');

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter' && input.trim()) {
            e.preventDefault();
            // Split by comma, newline, or tab
            const newTags = input.split(/[\n,\t]+/).map(s => s.trim()).filter(Boolean);
            const unique = newTags.filter(t => !tags.includes(t));
            
            if (unique.length > 0) {
                onTagsChange([...tags, ...unique]);
            }
            
            setInput('');
            onInputChange('');
        } else if (e.key === 'Backspace' && !input && tags.length > 0) {
            onTagsChange(tags.slice(0, -1));
        }
    };

    const handlePaste = (e: ClipboardEvent<HTMLInputElement>) => {
        e.preventDefault();
        const text = e.clipboardData.getData('text');
        if (text) {
            const newTags = text.split(/[\n,\t]+/).map(s => s.trim()).filter(Boolean);
            const unique = newTags.filter(t => !tags.includes(t));
            
            if (unique.length > 0) {
                onTagsChange([...tags, ...unique]);
            }
            setInput('');
            onInputChange('');
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setInput(e.target.value);
        onInputChange(e.target.value);
    };

    return (
        <div 
            className="flex flex-wrap items-center gap-2 p-2 border border-gray-300 rounded-lg bg-white/50 focus-within:ring-2 focus-within:ring-indigo-500 min-h-[42px] relative transition-all" 
            style={{ '--tw-ring-color': themeColor } as React.CSSProperties}
            onClick={() => document.getElementById('tag-search-input')?.focus()}
        >
            <Search className="w-4 h-4 text-gray-400 ml-1 flex-shrink-0" />
            
            {tags.map(tag => (
                <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium bg-indigo-100 text-indigo-700 animate-in fade-in zoom-in duration-200 border border-indigo-200">
                    {tag} 
                    <button 
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); onTagsChange(tags.filter(t => t !== tag)); }}
                        className="hover:bg-indigo-200 rounded-full p-0.5 transition-colors"
                    >
                        <X className="w-3 h-3 text-indigo-500 hover:text-indigo-800" />
                    </button>
                </span>
            ))}
            
            <input
                id="tag-search-input"
                type="text"
                value={input}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                onPaste={handlePaste}
                className="flex-1 min-w-[120px] outline-none text-sm bg-transparent border-none focus:ring-0 p-0 text-gray-800 placeholder-gray-400"
                placeholder={tags.length === 0 ? placeholder || "Search SKU..." : ""}
            />
            
            {(tags.length > 0 || input.length > 0) && (
                <button 
                    onClick={(e) => { e.stopPropagation(); onTagsChange([]); setInput(''); onInputChange(''); }} 
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 p-1 hover:bg-gray-100 rounded-full transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            )}
        </div>
    );
};
