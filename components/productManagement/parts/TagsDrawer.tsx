
import React, { useState, useEffect, useMemo } from 'react';
import { Tag, X, Info } from 'lucide-react';
import { Product } from '../../../types';

interface TagsDrawerProps {
  product: Product;
  products: Product[];
  onClose: () => void;
  onSave: (p: Product) => void;
  themeColor: string;
}

export const TagsDrawer: React.FC<TagsDrawerProps> = ({ product, products, onClose, onSave, themeColor }) => {
    const [seasonTags, setSeasonTags] = useState<string[]>([]);
    const [festivalTags, setFestivalTags] = useState<string[]>([]);
    const [seasonInput, setSeasonInput] = useState('');
    const [festivalInput, setFestivalInput] = useState('');

    useEffect(() => {
        setSeasonTags(product.seasonTags || []);
        setFestivalTags(product.festivalTags || []);
    }, [product]);

    const allSeasonTags = useMemo(() => Array.from(new Set(products.flatMap(p => p.seasonTags || []))), [products]);
    const allFestivalTags = useMemo(() => Array.from(new Set(products.flatMap(p => p.festivalTags || []))), [products]);

    const handleSave = () => {
        onSave({ ...product, seasonTags, festivalTags });
        onClose();
    };
    
    const addTags = (tagsToAdd: string[], type: 'season' | 'festival') => {
        const uniqueNewTags = tagsToAdd.map(t => t.trim()).filter(Boolean);
        if (type === 'season') {
            setSeasonTags(prev => [...new Set([...prev, ...uniqueNewTags])]);
        } else {
            setFestivalTags(prev => [...new Set([...prev, ...uniqueNewTags])]);
        }
    };

    const removeTag = (index: number, type: 'season' | 'festival') => {
        if (type === 'season') {
            setSeasonTags(prev => prev.filter((_, i) => i !== index));
        } else {
            setFestivalTags(prev => prev.filter((_, i) => i !== index));
        }
    };
    
    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, type: 'season' | 'festival') => {
        const inputVal = type === 'season' ? seasonInput : festivalInput;
        if ((e.key === 'Enter' || e.key === ',') && inputVal) {
            e.preventDefault();
            addTags([inputVal], type);
            if (type === 'season') setSeasonInput('');
            else setFestivalInput('');
        }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>, type: 'season' | 'festival') => {
        e.preventDefault();
        const pasteText = e.clipboardData.getData('text');
        const tagsFromPaste = pasteText.split(/[\n,]+/).filter(Boolean);
        addTags(tagsFromPaste, type);
    };

    const renderTagInput = (
        type: 'season' | 'festival',
        label: string,
        tags: string[],
        inputValue: string,
        setInputValue: (val: string) => void,
        suggestions: string[]
    ) => (
        <div>
            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{label}</label>
            <div className="flex flex-wrap items-center gap-2 p-2 border rounded-lg mt-1 focus-within:ring-2 focus-within:ring-theme bg-white">
                {tags.map((tag, index) => (
                    <span key={`${type}-${index}`} className="flex items-center gap-1.5 px-2 py-1 bg-theme-10 text-theme rounded text-xs font-medium border border-theme-20 animate-in fade-in zoom-in-95 duration-200">
                        {tag}
                        <button onClick={() => removeTag(index, type)} className="hover:bg-indigo-200 rounded-full p-0.5">
                            <X className="w-3 h-3 text-theme" />
                        </button>
                    </span>
                ))}
                <input
                    type="text"
                    list={`${type}-suggestions`}
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={e => handleKeyDown(e, type)}
                    onPaste={handlePaste}
                    placeholder={`Add a ${type} tag...`}
                    className="flex-1 min-w-[120px] outline-none text-sm bg-transparent border-none focus:ring-0 p-1"
                />
                <datalist id={`${type}-suggestions`}>
                    {suggestions.filter(s => !tags.includes(s)).map(s => <option key={s} value={s} />)}
                </datalist>
            </div>
        </div>
    );

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white w-full max-w-md h-full shadow-2xl relative flex flex-col animate-in slide-in-from-right">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-lg flex items-center gap-2"><Tag className="w-5 h-5 text-gray-500" /> Manage Tags</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                    <div>
                        <div className="font-mono text-sm font-bold text-theme bg-theme-10 px-2 py-1 rounded border border-indigo-100 inline-block">
                            {product.sku}
                        </div>
                        <p className="text-lg font-semibold text-gray-800 mt-1">{product.name}</p>
                    </div>
                    
                    <div className="bg-blue-50/50 p-3 rounded-lg border border-blue-100 text-xs text-blue-800 flex items-start gap-2">
                        <Info className="w-4 h-4 mt-0.5 shrink-0" />
                        <span>Tags help the strategy engine identify seasonal demand patterns. Use comma or Enter to add a tag.</span>
                    </div>

                    {renderTagInput('season', 'Season Tags', seasonTags, seasonInput, setSeasonInput, allSeasonTags)}
                    {renderTagInput('festival', 'Festival / Event Tags', festivalTags, festivalInput, setFestivalInput, allFestivalTags)}
                </div>
                <div className="p-4 border-t flex justify-end gap-2 bg-gray-50">
                    <button onClick={onClose} className="px-4 py-2 border rounded-lg hover:bg-gray-100 text-sm font-medium">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 text-white rounded-lg text-sm font-medium shadow-md" style={{ backgroundColor: themeColor }}>
                        Save Tags
                    </button>
                </div>
            </div>
        </div>
    );
};
