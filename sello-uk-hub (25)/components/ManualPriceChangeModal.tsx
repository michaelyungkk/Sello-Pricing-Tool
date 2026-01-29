import React, { useState, useMemo, useEffect } from 'react';
import { Product, PriceChangeRecord } from '../types';
import { X, Save, DollarSign, Search, Tag } from 'lucide-react';

interface ManualPriceChangeModalProps {
    products: Product[];
    onClose: () => void;
    onConfirm: (data: Omit<PriceChangeRecord, 'id' | 'changeType' | 'percentChange'>) => void;
}

const ManualPriceChangeModal: React.FC<ManualPriceChangeModalProps> = ({ products, onClose, onConfirm }) => {
    const [sku, setSku] = useState('');
    const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [oldPrice, setOldPrice] = useState('');
    const [newPrice, setNewPrice] = useState('');
    const [error, setError] = useState('');

    const productMap = useMemo(() => {
        const map = new Map<string, Product>();
        products.forEach(p => map.set(p.sku.toUpperCase(), p));
        return map;
    }, [products]);

    useEffect(() => {
        const product = productMap.get(sku.toUpperCase());
        if (product) {
            setSelectedProduct(product);
            // Pre-fill old price if CA price exists
            if (product.caPrice) {
                setOldPrice(product.caPrice.toFixed(2));
            }
            setError('');
        } else {
            setSelectedProduct(null);
            setOldPrice('');
        }
    }, [sku, productMap]);

    const handleSubmit = () => {
        if (!selectedProduct || !date || oldPrice === '' || newPrice === '') {
            setError('Please fill all fields and select a valid product.');
            return;
        }

        const oldPriceNum = parseFloat(oldPrice);
        const newPriceNum = parseFloat(newPrice);

        if (isNaN(oldPriceNum) || isNaN(newPriceNum)) {
            setError('Prices must be valid numbers.');
            return;
        }

        onConfirm({
            sku: selectedProduct.sku,
            productName: selectedProduct.name,
            date,
            oldPrice: oldPriceNum,
            newPrice: newPriceNum,
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                    <h2 className="text-xl font-bold text-gray-900">Lodge Manual Price Change</h2>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
                </div>
                <div className="p-6 space-y-4">
                    {error && <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-lg text-sm">{error}</div>}
                    
                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Product SKU</label>
                        <div className="relative">
                            <input
                                type="text"
                                list="sku-list"
                                value={sku}
                                onChange={e => setSku(e.target.value)}
                                placeholder="Start typing SKU..."
                                className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 ${selectedProduct ? 'border-green-300 focus:ring-green-500' : 'border-gray-300 focus:ring-indigo-500'}`}
                            />
                            <datalist id="sku-list">
                                {products.map(p => <option key={p.id} value={p.sku} />)}
                            </datalist>
                            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                                <Search className="w-4 h-4" />
                            </div>
                        </div>
                    </div>

                    {selectedProduct && (
                        <div className="p-3 bg-gray-50 border border-gray-200 rounded-lg animate-in fade-in">
                            <div className="text-xs text-gray-500 flex items-center gap-1"><Tag className="w-3 h-3"/>Product Name</div>
                            <p className="font-medium text-gray-800">{selectedProduct.name}</p>
                        </div>
                    )}

                    <div>
                        <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Change Date</label>
                        <input
                            type="date"
                            value={date}
                            onChange={e => setDate(e.target.value)}
                            className="w-full border rounded-lg px-3 py-2 text-sm border-gray-300 focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">Old Price (£)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    value={oldPrice}
                                    onChange={e => setOldPrice(e.target.value)}
                                    placeholder="e.g. 29.99"
                                    className="w-full border rounded-lg pl-8 pr-3 py-2 text-sm font-mono border-gray-300 focus:ring-2 focus:ring-indigo-500"
                                />
                                <DollarSign className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-bold text-gray-500 uppercase block mb-1">New Price (£)</label>
                            <div className="relative">
                                <input
                                    type="number"
                                    step="0.01"
                                    value={newPrice}
                                    onChange={e => setNewPrice(e.target.value)}
                                    placeholder="e.g. 24.99"
                                    className="w-full border rounded-lg pl-8 pr-3 py-2 text-sm font-mono border-gray-300 focus:ring-2 focus:ring-indigo-500"
                                />
                                <DollarSign className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
                            </div>
                        </div>
                    </div>
                </div>
                <div className="p-6 border-t bg-gray-50 flex justify-end gap-3">
                    <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg font-medium">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={!selectedProduct}
                        className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg shadow-md hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                    >
                        <Save className="w-4 h-4" />
                        Lodge Change
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ManualPriceChangeModal;