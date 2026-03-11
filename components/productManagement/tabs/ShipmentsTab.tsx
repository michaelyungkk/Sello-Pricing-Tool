
import React, { useState, useMemo, useEffect } from 'react';
import { Product } from '../../../types';
import { Ship, CheckCircle, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
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
        return Object.values(map).sort((a: any, b: any) => {
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
                    items.push({ id: `${p.sku}-${s.containerId}`, sku: p.sku, name: p.name, containerId: s.containerId, status: s.status, eta: s.eta, quantity: s.quantity, aliases });
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
                return item.containerId.toLowerCase().includes(t) || item.sku.toLowerCase().includes(t) || (item.aliases && item.aliases.some((a: string) => a.includes(t)));
            };
            return (searchTags.length > 0 && searchTags.some(tag => checkTerm(tag))) || (inputValue.trim().length > 0 && checkTerm(inputValue));
        });
    }, [allShipmentItems, searchTags, inputValue]);

    useEffect(() => { setCurrentPage(1); }, [searchTags, inputValue]);

    const paginatedTableData = useMemo(() => filteredTableData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage), [filteredTableData, currentPage]);
    const totalPages = Math.ceil(filteredTableData.length / itemsPerPage);

    const foundTagsCount = useMemo(() => {
        if (searchTags.length === 0) return 0;
        return searchTags.map(t => t.toLowerCase().trim()).filter(tag =>
            allShipmentItems.some(item => item.sku.toLowerCase().includes(tag) || item.containerId.toLowerCase().includes(tag) || (item.aliases && item.aliases.some((a: string) => a.includes(tag))))
        ).length;
    }, [searchTags, allShipmentItems]);

    const getStatusStyle = (status: string) => {
        if (!status) return { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' };
        const s = status.toLowerCase();
        if (s.includes('shipped') && !s.includes('to be')) return { background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' };
        if (s.includes('arrived') || s.includes('delivered') || s.includes('cleared')) return { background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' };
        if (s.includes('pending') || s.includes('to be')) return { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' };
        return { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' };
    };

    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
            <div className="sello-glass p-4 rounded-xl">
                <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Filter Shipments</label>
                <TagSearchInput tags={searchTags} onTagsChange={updateTags} onInputChange={setInputValue}
                    placeholder="Search SKUs, Aliases, or Container IDs..." themeColor={themeColor} />
            </div>

            {(searchTags.length > 0 || inputValue.trim().length > 0) ? (
                <div className="space-y-3">
                    {searchTags.length > 0 && (
                        <div className="flex items-center px-1">
                            <div style={{
                                fontSize: 12, fontWeight: 600, padding: '6px 12px', borderRadius: 8, border: '1px solid',
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                background: foundTagsCount === searchTags.length ? '#f0fdf4' : '#fffbeb',
                                color: foundTagsCount === searchTags.length ? '#166534' : '#92400e',
                                borderColor: foundTagsCount === searchTags.length ? '#bbf7d0' : '#fde68a',
                            }}>
                                {foundTagsCount === searchTags.length ? <CheckCircle style={{ width: 14, height: 14 }} /> : <AlertCircle style={{ width: 14, height: 14 }} />}
                                Found shipments for <strong>{foundTagsCount}</strong> of <strong>{searchTags.length}</strong> searched items
                            </div>
                        </div>
                    )}
                    <div className="sello-glass rounded-xl overflow-hidden">
                        <div className="sello-table-scroll">
                            <table className="tbl sello-table">
                                <thead>
                                    <tr>
                                        <th>SKU</th>
                                        <th>Container</th>
                                        <th>Status</th>
                                        <th className="col-blue">ETA</th>
                                        <th className="r">Qty</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedTableData.map(row => (
                                        <tr key={row.id}>
                                            <td><span className="v-num v-bold">{row.sku}</span></td>
                                            <td><span className="v-num" style={{ color: '#4f46e5' }}>{row.containerId}</span></td>
                                            <td>
                                                <span style={{ ...getStatusStyle(row.status), padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', display: 'inline-block' }}>
                                                    {row.status}
                                                </span>
                                            </td>
                                            <td className="col-blue"><span className="v-num">{row.eta || <span className="v-dim">Pending</span>}</span></td>
                                            <td className="r"><span className="v-num v-bold">{row.quantity}</span></td>
                                        </tr>
                                    ))}
                                    {filteredTableData.length === 0 && (
                                        <tr><td colSpan={5} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No shipments found matching your search.</td></tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        {filteredTableData.length > 0 && totalPages > 1 && (
                            <div className="sello-table-footer">
                                <span style={{ fontSize: 12, color: '#6b7280' }}>Page {currentPage} of {totalPages}</span>
                                <div className="sello-pagination">
                                    <button className="sello-page-btn" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}><ChevronLeft style={{ width: 14, height: 14 }} /></button>
                                    <button className="sello-page-btn" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}><ChevronRight style={{ width: 14, height: 14 }} /></button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {containerMap.map((c: any) => (
                        <div key={c.id} className="sello-glass rounded-xl overflow-hidden flex flex-col hover:shadow-md transition-shadow">
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--glass-divider)', background: 'rgba(249,250,251,0.5)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                                <div>
                                    <h3 style={{ fontWeight: 700, fontSize: 13, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}>
                                        <Ship style={{ width: 14, height: 14, color: '#4f46e5' }} />{c.id}
                                    </h3>
                                    <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.04em' }}>ETA: {c.eta || 'Pending'}</div>
                                </div>
                                <span style={{ ...getStatusStyle(c.status), fontSize: 9, fontWeight: 700, padding: '3px 6px', borderRadius: 4, textTransform: 'uppercase' }}>{c.status}</span>
                            </div>
                            <div style={{ padding: 16, flex: 1, maxHeight: 160, overflowY: 'auto' }}>
                                {c.items.map((item: any, idx: number) => (
                                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingBottom: 4, marginBottom: 4, borderBottom: '1px solid var(--glass-divider)' }}>
                                        <span className="v-dim">{item.sku}</span>
                                        <span className="v-num v-bold">{item.qty}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
