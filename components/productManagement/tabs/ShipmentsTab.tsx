
import React, { useState, useMemo, useEffect } from 'react';
import { Product } from '../../../types';
import { Ship, CheckCircle, AlertCircle } from 'lucide-react';
import { TagSearchInput } from '../../TagSearchInput';

interface ShipmentsTabProps {
    products: Product[];
    themeColor: string;
    initialTags?: string[];
    onTagsChange?: (tags: string[]) => void;
}

export const ShipmentsTab: React.FC<ShipmentsTabProps> = ({ products, themeColor, initialTags = [], onTagsChange }) => {
    const [inputValue, setInputValue] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 25;
    const searchTags = initialTags;
    const updateTags = (newTags: string[]) => { if (onTagsChange) onTagsChange(newTags); };

    const containerMap = useMemo(() => {
        const map: Record<string, any> = {};
        products.forEach(p => {
            if (p.shipments) {
                p.shipments.forEach(s => {
                    if (!map[s.containerId]) map[s.containerId] = { id: s.containerId, eta: s.eta || '', status: s.status, totalQty: 0, items: [] };
                    map[s.containerId].totalQty += s.quantity;
                    map[s.containerId].items.push({ sku: p.sku, qty: s.quantity });
                    if (s.eta) map[s.containerId].eta = s.eta;
                    if (s.status) map[s.containerId].status = s.status;
                });
            }
        });
        return Object.values(map).sort((a:any, b:any) => {
            if (!a.eta && !b.eta) return 0;
            if (!a.eta) return 1;
            if (!b.eta) return -1;
            return a.eta.localeCompare(b.eta);
        });
    }, [products]);

    const allShipmentItems = useMemo(() => {
        const items: any[] = [];
        products.forEach(p => {
            if (p.shipments) {
                const aliases = p.channels.flatMap(c => c.skuAlias ? c.skuAlias.split(',') : []).map(a => a.trim().toLowerCase());
                p.shipments.forEach(s => {
                    items.push({ 
                        id: `${p.sku}-${s.containerId}`, 
                        sku: p.sku, 
                        name: p.name, 
                        containerId: s.containerId, 
                        status: s.status, 
                        eta: s.eta, 
                        quantity: s.quantity,
                        aliases 
                    });
                });
            }
        });
        return items;
    }, [products]);

    const filteredTableData = useMemo(() => {
        if (searchTags.length === 0 && !inputValue.trim()) return [];
        return allShipmentItems.filter(item => {
            const checkTerm = (term: string) => {
                const t = term.toLowerCase();
                return item.containerId.toLowerCase().includes(t) || 
                       item.sku.toLowerCase().includes(t) ||
                       (item.aliases && item.aliases.some((a: string) => a.includes(t)));
            };
            const matchesTag = searchTags.length > 0 && searchTags.some(tag => checkTerm(tag));
            const matchesInput = inputValue.trim().length > 0 && checkTerm(inputValue);
            return matchesTag || matchesInput;
        });
    }, [allShipmentItems, searchTags, inputValue]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTags, inputValue]);
    
    const paginatedTableData = useMemo(() => {
        return filteredTableData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
    }, [filteredTableData, currentPage, itemsPerPage]);

    const totalPages = Math.ceil(filteredTableData.length / itemsPerPage);

    const foundTagsCount = useMemo(() => {
        if (searchTags.length === 0) return 0;
        const lowerTags = searchTags.map(t => t.toLowerCase().trim());
        return lowerTags.filter(tag => 
            allShipmentItems.some(item => 
                item.sku.toLowerCase().includes(tag) || 
                item.containerId.toLowerCase().includes(tag) ||
                (item.aliases && item.aliases.some((a: string) => a.includes(tag)))
            )
        ).length;
    }, [searchTags, allShipmentItems]);

    const getStatusStyle = (status: string) => {
        if (!status) return 'bg-gray-100 text-gray-800 border-gray-200';
        const s = status.toLowerCase();
        if (s.includes('shipped') && !s.includes('to be')) return 'bg-blue-100 text-blue-800 border-blue-200';
        if (s.includes('arrived') || s.includes('delivered') || s.includes('cleared')) return 'bg-green-100 text-green-800 border-green-200';
        if (s.includes('pending') || s.includes('to be')) return 'bg-amber-100 text-amber-800 border-amber-200';
        return 'bg-gray-100 text-gray-800 border-gray-200';
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="bg-custom-glass p-4 rounded-xl border border-custom-glass shadow-sm">
                <label className="text-[10px] font-medium text-gray-400 uppercase block mb-2 tracking-wide">Filter Shipments</label>
                <TagSearchInput 
                    tags={searchTags}
                    onTagsChange={updateTags}
                    onInputChange={setInputValue}
                    placeholder="Search SKUs, Aliases, or Container IDs..."
                    themeColor={themeColor}
                />
            </div>
            {(searchTags.length > 0 || inputValue.trim().length > 0) ? (
                <div className="space-y-3">
                    {searchTags.length > 0 && (
                        <div className="flex items-center justify-between px-1">
                            <div className={`text-xs font-medium px-3 py-1.5 rounded-lg border inline-flex items-center gap-2 shadow-sm ${foundTagsCount === searchTags.length ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200'}`}>
                                {foundTagsCount === searchTags.length ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                <span>Found shipments for <strong>{foundTagsCount}</strong> of <strong>{searchTags.length}</strong> searched items</span>
                            </div>
                        </div>
                    )}
                    <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden">
                        <table className="w-full text-left text-sm whitespace-nowrap border-separate border-spacing-0">
                            <thead className="bg-gray-50/50 border-b border-gray-200/50 sticky top-0 z-10 backdrop-blur-sm shadow-sm transition-colors">
                                <tr className="bg-gray-50/50 text-gray-600 font-semibold border-b border-gray-200/50 text-xs uppercase tracking-wider">
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">SKU</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Container</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider">ETA</th>
                                    <th className="px-4 py-3 text-xs font-semibold text-gray-600 uppercase tracking-wider text-right">Qty</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100/50">
                                {paginatedTableData.map(row => (
                                    <tr key={row.id} className="even:bg-gray-50/30 hover:bg-gray-100/50 transition-colors group">
                                        <td className="px-4 py-4 font-mono font-bold text-gray-700">{row.sku}</td>
                                        <td className="px-4 py-4 text-indigo-600 font-medium">{row.containerId}</td>
                                        <td className="px-4 py-4"><span className={`px-2 py-1 rounded border text-[10px] uppercase font-bold ${getStatusStyle(row.status)}`}>{row.status}</span></td>
                                        <td className="px-4 py-4 text-gray-600">{row.eta || <span className="text-gray-400 italic">Pending</span>}</td>
                                        <td className="px-4 py-4 text-right font-bold text-gray-800">{row.quantity}</td>
                                    </tr>
                                ))}
                                {filteredTableData.length === 0 && (
                                    <tr>
                                        <td colSpan={5} className="p-8 text-center text-gray-400">
                                            No shipments found matching your search.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                         {filteredTableData.length > 0 && (
                            <div className="bg-gray-50/50 px-4 py-3 border-t border-gray-200/50 flex items-center justify-between sm:px-6">
                                <div className="flex gap-2">
                                    <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1} className="px-2 py-1 bg-white border rounded text-xs text-gray-600 font-medium disabled:opacity-50">Prev</button>
                                    <span className="text-xs text-gray-500 pt-1 font-medium">Page {currentPage} of {totalPages}</span>
                                    <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages} className="px-2 py-1 bg-white border rounded text-xs text-gray-600 font-medium disabled:opacity-50">Next</button>
                                </div>
                            </div>
                         )}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {containerMap.map((c:any) => (
                        <div key={c.id} className="bg-custom-glass rounded-xl border border-custom-glass shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                            <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex justify-between items-start">
                                <div>
                                    <h3 className="font-bold text-gray-900 flex items-center gap-2 text-sm"><Ship className="w-4 h-4 text-indigo-600"/>{c.id}</h3>
                                    <div className="text-[10px] text-gray-500 mt-1 font-medium uppercase tracking-wide">ETA: {c.eta || 'Pending'}</div>
                                </div>
                                <span className={`text-[9px] font-bold px-2 py-1 rounded border uppercase ${getStatusStyle(c.status)}`}>{c.status}</span>
                            </div>
                            <div className="p-4 flex-1 space-y-1 max-h-40 overflow-y-auto">
                                {c.items.map((item:any, idx:number) => (
                                    <div key={idx} className="flex justify-between text-xs py-1 border-b border-gray-50 last:border-0"><span className="font-mono text-gray-600 font-medium">{item.sku}</span><span className="font-bold text-gray-800">{item.qty}</span></div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
