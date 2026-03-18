
import React, { useState, useMemo } from 'react';
import { Product, AttributeMap } from '../../../types';
import { getUniqueRawValues, addMapping, removeMapping } from '../../../services/mappingService';
import { Tag, Trash2, Plus, CheckCircle2, AlertCircle, Search } from 'lucide-react';

interface DataNormalizationSectionProps {
    products: Product[];
    brandMap: AttributeMap;
    categoryMap: AttributeMap;
    onSaveBrandMap: (map: AttributeMap) => void;
    onSaveCategoryMap: (map: AttributeMap) => void;
    themeColor: string;
    headerStyle: React.CSSProperties;
}

export const DataNormalizationSection: React.FC<DataNormalizationSectionProps> = ({
    products,
    brandMap,
    categoryMap,
    onSaveBrandMap,
    onSaveCategoryMap,
    themeColor,
    headerStyle
}) => {
    const [activeTab, setActiveTab] = useState<'brand' | 'category'>('brand');
    const [selectedRaws, setSelectedRaws] = useState<string[]>([]);
    const [targetValue, setTargetValue] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    const currentMap = activeTab === 'brand' ? brandMap : categoryMap;
    const onSaveMap = activeTab === 'brand' ? onSaveBrandMap : onSaveCategoryMap;

    const uniqueRaws = useMemo(() => {
        return getUniqueRawValues(products, activeTab);
    }, [products, activeTab]);

    const filteredRaws = useMemo(() => {
        const term = searchTerm.toLowerCase().trim();
        if (!term) return uniqueRaws;
        return uniqueRaws.filter(r => r.toLowerCase().includes(term));
    }, [uniqueRaws, searchTerm]);

    const handleToggleSelect = (raw: string) => {
        setSelectedRaws(prev => 
            prev.includes(raw) ? prev.filter(r => r !== raw) : [...prev, raw]
        );
    };

    const handleCreateRule = () => {
        if (selectedRaws.length === 0 || !targetValue.trim()) return;

        let updatedMap = { ...currentMap };
        selectedRaws.forEach(raw => {
            updatedMap = addMapping(updatedMap, raw, targetValue);
        });

        onSaveMap(updatedMap);
        setSelectedRaws([]);
        setTargetValue('');
    };

    const handleDeleteRule = (rawKey: string) => {
        const updatedMap = removeMapping(currentMap, rawKey);
        onSaveMap(updatedMap);
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold" style={headerStyle}>
                    Data Normalization
                </h2>
                <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => { setActiveTab('brand'); setSelectedRaws([]); }}
                        className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all ${activeTab === 'brand' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Brand Mapping
                    </button>
                    <button
                        onClick={() => { setActiveTab('category'); setSelectedRaws([]); }}
                        className={`px-4 py-1.5 text-xs font-bold uppercase tracking-wide rounded-md transition-all ${activeTab === 'category' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                    >
                        Category Mapping
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Left Side: Raw Values List */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[600px]">
                    <div className="p-4 border-bottom border-gray-50 space-y-3">
                        <div className="flex items-center justify-between">
                            <h3 className="font-bold text-gray-900 flex items-center gap-2">
                                <Search className="w-4 h-4 text-gray-400" />
                                Raw {activeTab === 'brand' ? 'Brands' : 'Categories'}
                            </h3>
                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                                {selectedRaws.length} Selected
                            </span>
                        </div>
                        <div className="relative">
                            <input
                                type="text"
                                placeholder={`Search raw ${activeTab}s...`}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2 bg-gray-50 border-none rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 transition-all"
                            />
                            <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-2 space-y-1">
                        {filteredRaws.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-full text-gray-400 space-y-2">
                                <AlertCircle className="w-8 h-8 opacity-20" />
                                <p className="text-xs">No values found</p>
                            </div>
                        ) : (
                            filteredRaws.map(raw => {
                                const isSelected = selectedRaws.includes(raw);
                                const isMapped = !!currentMap[raw.toLowerCase()];
                                return (
                                    <button
                                        key={raw}
                                        onClick={() => handleToggleSelect(raw)}
                                        className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all ${
                                            isSelected 
                                                ? 'bg-indigo-50 text-indigo-700 border border-indigo-100' 
                                                : 'text-gray-600 hover:bg-gray-50 border border-transparent'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                                isSelected ? 'bg-indigo-600 border-indigo-600' : 'bg-white border-gray-300'
                                            }`}>
                                                {isSelected && <CheckCircle2 className="w-3 h-3 text-white" />}
                                            </div>
                                            <span className={isMapped ? 'font-medium' : ''}>{raw}</span>
                                        </div>
                                        {isMapped && (
                                            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded font-bold uppercase">
                                                Mapped
                                            </span>
                                        )}
                                    </button>
                                );
                            })
                        )}
                    </div>

                    <div className="p-4 bg-gray-50 border-t border-gray-100 rounded-b-xl space-y-3">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">
                                Target Canonical Value
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. Levede"
                                value={targetValue}
                                onChange={(e) => setTargetValue(e.target.value)}
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500/20 transition-all"
                            />
                        </div>
                        <button
                            onClick={handleCreateRule}
                            disabled={selectedRaws.length === 0 || !targetValue.trim()}
                            className="w-full py-2.5 rounded-lg font-bold text-sm text-white shadow-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            style={{ backgroundColor: themeColor }}
                        >
                            <Plus className="w-4 h-4" />
                            Create Mapping Rule
                        </button>
                    </div>
                </div>

                {/* Right Side: Active Rules */}
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-[600px]">
                    <div className="p-4 border-bottom border-gray-50 flex items-center justify-between">
                        <h3 className="font-bold text-gray-900 flex items-center gap-2">
                            <Tag className="w-4 h-4 text-gray-400" />
                            Active Rules
                        </h3>
                        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
                            {Object.keys(currentMap).length} Rules
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto">
                        <table className="tbl w-full text-left border-collapse">
                            <thead className="sticky top-0">
                                <tr>
                                    <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">Raw Value</th>
                                    <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100">Target Value</th>
                                    <th className="px-4 py-2 text-[10px] font-bold text-gray-400 uppercase tracking-widest border-b border-gray-100 w-10"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {Object.entries(currentMap).length === 0 ? (
                                    <tr>
                                        <td colSpan={3} className="px-4 py-12 text-center text-gray-400 text-sm italic">
                                            No active rules for {activeTab === 'brand' ? 'brands' : 'categories'}.
                                        </td>
                                    </tr>
                                ) : (
                                    Object.entries(currentMap).map(([raw, target]) => (
                                        <tr key={raw} className="group">
                                            <td className="px-4 py-3 text-sm text-gray-600 font-mono">{raw}</td>
                                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{target}</td>
                                            <td className="px-4 py-3">
                                                <button
                                                    onClick={() => handleDeleteRule(raw)}
                                                    className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md transition-all opacity-0 group-hover:opacity-100"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
};
