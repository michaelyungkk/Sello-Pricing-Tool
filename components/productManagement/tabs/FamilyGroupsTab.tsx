
import React, { useState } from 'react';
import { Layers, Check, X, Trash2, Edit2, Plus, AlertCircle, Search } from 'lucide-react';
import { SkuFamily, Product } from '../../../types';
import { motion, AnimatePresence } from 'motion/react';

interface FamilyGroupsTabProps {
    skuFamilies: SkuFamily[];
    pendingFamilySuggestions: SkuFamily[];
    products: Product[];
    onConfirmSuggestion: (family: SkuFamily) => void;
    onDismissSuggestion: (id: string) => void;
    onConfirmAllSuggestions: () => void;
    onAddFamily: (family: SkuFamily) => void;
    onEditFamily: (family: SkuFamily) => void;
    onRemoveFamily: (id: string) => void;
    themeColor: string;
}

export const FamilyGroupsTab: React.FC<FamilyGroupsTabProps> = ({
    skuFamilies,
    pendingFamilySuggestions,
    products,
    onConfirmSuggestion,
    onDismissSuggestion,
    onConfirmAllSuggestions,
    onAddFamily,
    onEditFamily,
    onRemoveFamily,
    themeColor
}) => {
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [editingFamily, setEditingFamily] = useState<SkuFamily | null>(null);
    const [newName, setNewName] = useState('');
    const [selectedSkus, setSelectedSkus] = useState<string[]>([]);
    const [skuSearch, setSkuSearch] = useState('');

    const handleOpenAddModal = () => {
        setNewName('');
        setSelectedSkus([]);
        setSkuSearch('');
        setIsAddModalOpen(true);
    };

    const handleOpenEditModal = (family: SkuFamily) => {
        setEditingFamily(family);
        setNewName(family.name);
        setSelectedSkus(family.memberSkus);
        setSkuSearch('');
        setIsEditModalOpen(true);
    };

    const handleSaveFamily = () => {
        if (!newName.trim() || selectedSkus.length === 0) {
            alert('Please provide a name and at least one SKU.');
            return;
        }

        if (editingFamily) {
            onEditFamily({
                ...editingFamily,
                name: newName,
                memberSkus: selectedSkus,
                updatedAt: new Date().toISOString()
            });
        } else {
            const newFamily: SkuFamily = {
                id: `family-${Date.now()}`,
                name: newName,
                memberSkus: selectedSkus,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            onAddFamily(newFamily);
        }
        setIsAddModalOpen(false);
        setIsEditModalOpen(false);
        setEditingFamily(null);
    };

    const filteredSkus = products
        .map(p => p.sku)
        .filter(sku => sku.toLowerCase().includes(skuSearch.toLowerCase()))
        .filter((sku, index, self) => self.indexOf(sku) === index); // Unique SKUs

    return (
        <div className="p-6 space-y-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Layers className="w-6 h-6" style={{ color: themeColor }} />
                        Family Groups
                    </h1>
                    <p className="text-gray-500 text-sm mt-1">Manage SKU families for grouped analytics and stock distribution.</p>
                </div>
                <button
                    onClick={handleOpenAddModal}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium transition-all hover:opacity-90 shadow-sm"
                    style={{ backgroundColor: themeColor }}
                >
                    <Plus className="w-4 h-4" />
                    Add Family
                </button>
            </div>

            {/* SECTION 1: Pending Suggestions */}
            <AnimatePresence>
                {pendingFamilySuggestions.length > 0 && (
                    <motion.div
                        initial={{ opacity: 0, y: -20 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -20 }}
                        className="space-y-4"
                    >
                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex justify-between items-center">
                            <div className="flex items-center gap-3">
                                <div className="p-2 bg-amber-100 rounded-lg text-amber-600">
                                    <AlertCircle className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-amber-900">{pendingFamilySuggestions.length} suggested family groups from your last inventory upload</h3>
                                    <p className="text-amber-700 text-sm">Review these groups based on SKU prefix matching.</p>
                                </div>
                            </div>
                            <button
                                onClick={onConfirmAllSuggestions}
                                className="px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
                            >
                                Confirm All
                            </button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {pendingFamilySuggestions.map(suggestion => (
                                <div key={suggestion.id} className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow-md transition-shadow">
                                    <div className="flex justify-between items-start mb-3">
                                        <h4 className="font-bold text-gray-900">{suggestion.name}</h4>
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => onConfirmSuggestion(suggestion)}
                                                className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                                title="Confirm"
                                            >
                                                <Check className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => onDismissSuggestion(suggestion.id)}
                                                className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Dismiss"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                        {suggestion.memberSkus.map(sku => (
                                            <span key={sku} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-md border border-gray-200">
                                                {sku}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* SECTION 2: Confirmed Family Groups */}
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-bottom border-gray-200">
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Family Name</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Member SKUs</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider">Date Created</th>
                                <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200">
                            {skuFamilies.length === 0 ? (
                                <tr>
                                    <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                        <Layers className="w-12 h-12 mx-auto mb-3 opacity-20" />
                                        <p>No family groups created yet.</p>
                                        <button 
                                            onClick={handleOpenAddModal}
                                            className="mt-4 text-sm font-medium"
                                            style={{ color: themeColor }}
                                        >
                                            Create your first family group
                                        </button>
                                    </td>
                                </tr>
                            ) : (
                                skuFamilies.map(family => (
                                    <tr key={family.id} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4">
                                            <span className="font-semibold text-gray-900">{family.name}</span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <div className="flex flex-wrap gap-1.5 max-w-md">
                                                {family.memberSkus.map(sku => (
                                                    <span key={sku} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs rounded-md border border-indigo-100 font-medium">
                                                        {sku}
                                                    </span>
                                                ))}
                                            </div>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-500">
                                            {new Date(family.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={() => handleOpenEditModal(family)}
                                                    className="p-2 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (window.confirm('Are you sure you want to remove this family group?')) {
                                                            onRemoveFamily(family.id);
                                                        }
                                                    }}
                                                    className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Add/Edit Modal */}
            <AnimatePresence>
                {(isAddModalOpen || isEditModalOpen) && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="bg-white rounded-2xl shadow-xl w-full max-w-2xl overflow-hidden"
                        >
                            <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                                <h2 className="text-xl font-bold text-gray-900">
                                    {isEditModalOpen ? 'Edit Family Group' : 'Add New Family Group'}
                                </h2>
                                <button onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                                    <X className="w-5 h-5 text-gray-500" />
                                </button>
                            </div>

                            <div className="p-6 space-y-6 max-h-[70vh] overflow-y-auto">
                                <div className="space-y-2">
                                    <label className="text-sm font-semibold text-gray-700">Family Name</label>
                                    <input
                                        type="text"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                        placeholder="e.g. MP1018-UK Series"
                                        className="w-full px-4 py-2 rounded-xl border border-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all"
                                    />
                                </div>

                                <div className="space-y-3">
                                    <div className="flex justify-between items-end">
                                        <label className="text-sm font-semibold text-gray-700">Member SKUs ({selectedSkus.length})</label>
                                        <div className="relative w-64">
                                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                type="text"
                                                value={skuSearch}
                                                onChange={(e) => setSkuSearch(e.target.value)}
                                                placeholder="Search SKUs..."
                                                className="w-full pl-9 pr-4 py-1.5 text-sm rounded-lg border border-gray-200 outline-none focus:ring-2 focus:ring-indigo-500"
                                            />
                                        </div>
                                    </div>

                                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                                        <div className="max-h-60 overflow-y-auto p-2 grid grid-cols-2 gap-2">
                                            {filteredSkus.map(sku => {
                                                const isSelected = selectedSkus.includes(sku);
                                                return (
                                                    <button
                                                        key={sku}
                                                        onClick={() => {
                                                            if (isSelected) {
                                                                setSelectedSkus(selectedSkus.filter(s => s !== sku));
                                                            } else {
                                                                setSelectedSkus([...selectedSkus, sku]);
                                                            }
                                                        }}
                                                        className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-all border ${
                                                            isSelected 
                                                                ? 'bg-indigo-50 border-indigo-200 text-indigo-700 font-medium' 
                                                                : 'bg-white border-gray-100 text-gray-600 hover:bg-gray-50'
                                                        }`}
                                                    >
                                                        <span className="truncate">{sku}</span>
                                                        {isSelected && <Check className="w-4 h-4" />}
                                                    </button>
                                                );
                                            })}
                                            {filteredSkus.length === 0 && (
                                                <div className="col-span-2 py-8 text-center text-gray-400 text-sm">
                                                    No SKUs found matching &quot;{skuSearch}&quot;
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {selectedSkus.length > 0 && (
                                    <div className="space-y-2">
                                        <label className="text-xs font-bold text-gray-400 uppercase tracking-wider">Selected Members</label>
                                        <div className="flex flex-wrap gap-2">
                                            {selectedSkus.map(sku => (
                                                <span key={sku} className="inline-flex items-center gap-1 px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold">
                                                    {sku}
                                                    <button onClick={() => setSelectedSkus(selectedSkus.filter(s => s !== sku))} className="hover:text-indigo-900">
                                                        <X className="w-3 h-3" />
                                                    </button>
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex justify-end gap-3">
                                <button
                                    onClick={() => { setIsAddModalOpen(false); setIsEditModalOpen(false); }}
                                    className="px-6 py-2 rounded-xl text-gray-600 font-medium hover:bg-gray-200 transition-all"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSaveFamily}
                                    className="px-6 py-2 rounded-xl text-white font-medium shadow-lg transition-all hover:scale-[1.02] active:scale-[0.98]"
                                    style={{ backgroundColor: themeColor }}
                                >
                                    {isEditModalOpen ? 'Save Changes' : 'Create Family'}
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};
