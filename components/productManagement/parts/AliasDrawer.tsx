
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Product, PricingRules } from '../../../types';

interface AliasDrawerProps {
    product: Product;
    pricingRules: PricingRules;
    onClose: () => void;
    onSave: (p: Product) => void;
    themeColor: string;
}

export const AliasDrawer: React.FC<AliasDrawerProps> = ({ product, pricingRules, onClose, onSave, themeColor }) => {
    const [platformTags, setPlatformTags] = useState<{ platform: string; tags: string[] }[]>(() => {
        const existing = product.channels.map((c:any) => ({ platform: c.platform, tags: c.skuAlias ? c.skuAlias.split(',').map((s:string) => s.trim()).filter(Boolean) : [] }));
        Object.keys(pricingRules).forEach(pKey => { if (!existing.find((e:any) => e.platform === pKey)) existing.push({ platform: pKey, tags: [] }); });
        return existing;
    });
    const [inputValues, setInputValues] = useState<Record<string, string>>({});

    const addTags = (platform: string, newTags: string[]) => {
        setPlatformTags(prev => prev.map(p => p.platform === platform ? { ...p, tags: [...new Set([...p.tags, ...newTags])] } : p));
    };
    
    const handleSave = () => {
        const updatedChannels = [...product.channels];
        platformTags.forEach(pt => {
            const aliasString = pt.tags.join(', ');
            const idx = updatedChannels.findIndex(c => c.platform === pt.platform);
            if (idx >= 0) updatedChannels[idx] = { ...updatedChannels[idx], skuAlias: aliasString };
            else if (aliasString) updatedChannels.push({ platform: pt.platform, manager: 'Unassigned', velocity: 0, skuAlias: aliasString });
        });
        onSave({ ...product, channels: updatedChannels });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex justify-end">
            <div className="fixed inset-0 bg-black/20 backdrop-blur-sm" onClick={onClose}></div>
            <div className="bg-white w-full max-w-md h-full shadow-2xl relative flex flex-col animate-in slide-in-from-right">
                <div className="p-6 border-b flex justify-between items-center bg-gray-50">
                    <h3 className="font-bold text-lg">Manage Aliases</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>
                <div className="p-6 flex-1 overflow-y-auto space-y-6">
                    {platformTags.map(item => (
                        <div key={item.platform}>
                            <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">{item.platform}</label>
                            <div className="flex flex-wrap gap-2 p-2 border rounded-lg mt-1 focus-within:ring-2 focus-within:ring-indigo-500">
                                {item.tags.map((tag:string, i:number) => (
                                    <span key={i} className="px-2 py-1 bg-indigo-50 text-indigo-700 rounded text-xs flex items-center gap-1">
                                        {tag} <button onClick={() => setPlatformTags(prev => prev.map(p => p.platform === item.platform ? { ...p, tags: p.tags.filter((_, idx) => idx !== i) } : p))}><X className="w-3 h-3" /></button>
                                    </span>
                                ))}
                                <input 
                                    type="text" 
                                    className="flex-1 min-w-[80px] outline-none text-sm" 
                                    placeholder="Add alias..." 
                                    value={inputValues[item.platform] || ''}
                                    onChange={e => setInputValues({...inputValues, [item.platform]: e.target.value})}
                                    onKeyDown={e => {
                                        if (e.key === 'Enter' && inputValues[item.platform]) {
                                            addTags(item.platform, [inputValues[item.platform]]);
                                            setInputValues({...inputValues, [item.platform]: ''});
                                        }
                                    }}
                                />
                            </div>
                        </div>
                    ))}
                </div>
                <div className="p-4 border-t flex justify-end gap-2">
                    <button onClick={onClose} className="px-4 py-2 border rounded hover:bg-gray-50">Cancel</button>
                    <button onClick={handleSave} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700">Save</button>
                </div>
            </div>
        </div>
    );
};
