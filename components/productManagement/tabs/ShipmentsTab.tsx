import React, { useState, useMemo, useEffect } from 'react';
import { Product, InventoryChangeRecord } from '../../../types';
import { Ship, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, Pencil, Plus, Trash2 } from 'lucide-react';
import { TagSearchInput } from '../../common/TagSearchInput';

interface ShipmentsTabProps {
    products: Product[];
    inventoryChangeHistory?: InventoryChangeRecord[];
    themeColor: string;
    initialTags?: string[];
    onTagsChange?: (tags: string[]) => void;
    onConfirmContainersArrived?: (payload: { containerId: string; confirmedQty?: number; confirmedSkuQtys?: Record<string, number>; mode?: 'INFERRED' | 'MANUAL' }[]) => void;
    onEditContainerShipments?: (payload: { containerId: string; status?: string; eta?: string; items: { sku: string; quantity: number }[] }) => void;
}

type ContainerGroup = 'needs-confirmation' | 'in-transit' | 'arrived';
type ArrivalConfirmMode = 'INFERRED' | 'MANUAL';
type ConfirmDialogItem = { sku: string; plannedQty: number };
type EditDialogItem = { id: string; sku: string; quantity: string };

export const ShipmentsTab: React.FC<ShipmentsTabProps> = ({
    products,
    inventoryChangeHistory = [],
    themeColor,
    initialTags = [],
    onTagsChange,
    onConfirmContainersArrived,
    onEditContainerShipments
}) => {
    const [inputValue, setInputValue] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [showReplenishmentTable, setShowReplenishmentTable] = useState(false);
    const [confirmDialog, setConfirmDialog] = useState<{ containerId: string; mode: 'INFERRED' | 'MANUAL'; items: ConfirmDialogItem[] } | null>(null);
    const [confirmSkuQtyInputs, setConfirmSkuQtyInputs] = useState<Record<string, string>>({});
    const [editDialog, setEditDialog] = useState<{ containerId: string; status: string; eta: string; items: EditDialogItem[] } | null>(null);
    const itemsPerPage = 25;
    const searchTags = initialTags;
    const updateTags = (newTags: string[]) => { if (onTagsChange) onTagsChange(newTags); };

    const normalizedShipmentStatus = (status?: string): string => {
        const raw = String(status || '').trim();
        if (!raw) return 'Pending';
        const first = raw.includes('/') ? raw.split('/')[0].trim() : raw;
        const cleaned = first.replace(/[\u4E00-\u9FFF]/g, '').trim();
        return cleaned || 'Pending';
    };

    const isArrivedLikeStatus = (status?: string): boolean => {
        const s = normalizedShipmentStatus(status).toLowerCase();
        return s.includes('arrived') || s.includes('delivered') || s.includes('cleared') || s.includes('received') || s.includes('landed');
    };

    const containerMap = useMemo(() => {
        const map: Record<string, any> = {};
        products.forEach(p => {
            if (p.shipments) {
                p.shipments.forEach(s => {
                    const containerId = String(s.containerId || '').trim();
                    if (!containerId) return;
                    if (!map[containerId]) {
                        map[containerId] = {
                            id: containerId,
                            eta: s.eta || '',
                            status: s.status,
                            totalQty: 0,
                            items: [],
                            itemQtyBySku: new Map<string, number>()
                        };
                    }
                    const qty = Number(s.quantity) || 0;
                    map[containerId].totalQty += qty;
                    const skuKey = String(p.sku || '').trim();
                    if (skuKey) {
                        const prev = map[containerId].itemQtyBySku.get(skuKey) || 0;
                        map[containerId].itemQtyBySku.set(skuKey, prev + qty);
                    }
                    if (s.eta) map[containerId].eta = s.eta;
                    if (s.status) map[containerId].status = s.status;
                });
            }
        });
        return Object.values(map).map((container: any) => {
            const itemEntries = Array.from(container.itemQtyBySku.entries()) as Array<[string, number]>;
            const items = itemEntries
                .map(([sku, qty]) => ({ sku, qty }))
                .sort((a, b) => a.sku.localeCompare(b.sku));
            return { ...container, items };
        }).sort((a: any, b: any) => {
            if (!a.eta && !b.eta) return 0;
            if (!a.eta) return 1;
            if (!b.eta) return -1;
            return a.eta.localeCompare(b.eta);
        });
    }, [products]);

    const todayKey = useMemo(() => new Date().toISOString().split('T')[0], []);

    const inventoryLogsBySku = useMemo(() => {
        const bySku = new Map<string, InventoryChangeRecord[]>();
        (inventoryChangeHistory || []).forEach((log) => {
            if (!log?.sku) return;
            if (!bySku.has(log.sku)) bySku.set(log.sku, []);
            bySku.get(log.sku)!.push(log);
        });
        bySku.forEach((logs) => logs.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0)));
        return bySku;
    }, [inventoryChangeHistory]);

    const inventorySignalsBySku = useMemo(() => {
        const msInDay = 24 * 60 * 60 * 1000;
        const bySku = new Map<string, { pos: Array<{ ts: number; day: number; delta: number; strategic: boolean; reason: string }>; negByDay: Map<number, number> }>();
        inventoryLogsBySku.forEach((logs, sku) => {
            const pos: Array<{ ts: number; day: number; delta: number; strategic: boolean; reason: string }> = [];
            const negByDay = new Map<number, number>();
            logs.forEach((log) => {
                const ts = Number(log.timestamp) || new Date(`${log.date}T00:00:00Z`).getTime();
                if (!Number.isFinite(ts)) return;
                const delta = Number(log.deltaStock) || 0;
                const day = Math.floor(ts / msInDay);
                if (delta > 0) {
                    pos.push({ ts, day, delta, strategic: !!log.isStrategic, reason: String(log.reason || '').toLowerCase() });
                } else if (delta < 0) {
                    const prev = negByDay.get(day) || 0;
                    negByDay.set(day, prev + Math.abs(delta));
                }
            });
            bySku.set(sku, { pos, negByDay });
        });
        return bySku;
    }, [inventoryLogsBySku]);

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

    const inferredArrivalByContainer = useMemo(() => {
        const result = new Map<string, { evidenceQty: number; plannedQty: number; ratio: number; strategicSignals: number }>();
        const msInDay = 24 * 60 * 60 * 1000;
        const todayTs = new Date(`${todayKey}T23:59:59Z`).getTime();

        containerMap.forEach((container: any) => {
            if (!container?.id || !container?.eta) return;
            if (container.eta >= todayKey) return;
            if (isArrivedLikeStatus(container.status)) return;

            const etaTs = new Date(`${container.eta}T00:00:00Z`).getTime();
            if (!Number.isFinite(etaTs)) return;

            const plannedQty = Number(container.totalQty) || 0;
            if (plannedQty <= 0) return;

            let evidenceQty = 0;
            let strategicSignals = 0;

            (container.items || []).forEach((item: any) => {
                const sku = String(item?.sku || '').trim();
                if (!sku) return;
                const skuPlan = Number(item?.qty) || 0;
                if (skuPlan <= 0) return;

                const signals = inventorySignalsBySku.get(sku);
                const posLogs = signals?.pos || [];
                const negByDay = signals?.negByDay;
                let skuEvidence = 0;
                for (let i = 0; i < posLogs.length; i++) {
                    const log = posLogs[i];
                    if (log.ts < (etaTs - 3 * msInDay) || log.ts > todayTs) continue;
                    let weight = log.strategic ? 1 : 0.35;
                    if (log.strategic) strategicSignals++;
                    if (log.reason.includes('return') || log.reason.includes('correction') || log.reason.includes('noise')) {
                        weight *= 0.4;
                    }
                    let nearNegative = 0;
                    if (negByDay) {
                        for (let day = log.day - 5; day <= log.day + 5; day++) {
                            nearNegative += negByDay.get(day) || 0;
                        }
                    }
                    if (nearNegative >= log.delta * 0.7) weight *= 0.25;
                    skuEvidence += log.delta * weight;
                }

                evidenceQty += Math.min(skuPlan, skuEvidence);
            });

            const ratio = plannedQty > 0 ? evidenceQty / plannedQty : 0;
            const meetsEvidenceFloor = evidenceQty >= Math.max(1, plannedQty * 0.2);
            if (ratio >= 0.6 && meetsEvidenceFloor) {
                result.set(container.id, { evidenceQty, plannedQty, ratio, strategicSignals });
            }
        });

        return result;
    }, [containerMap, inventorySignalsBySku, todayKey]);

    const containers = useMemo(() => {
        return containerMap.map((c: any) => {
            const inferredMeta = inferredArrivalByContainer.get(c.id);
            const arrived = isArrivedLikeStatus(c.status);
            const displayStatus = inferredMeta ? 'Arrived (Inferred)' : normalizedShipmentStatus(c.status);
            let group: ContainerGroup = 'in-transit';
            if (arrived) group = 'arrived';
            else if (inferredMeta) group = 'needs-confirmation';
            return { ...c, inferredMeta, displayStatus, group };
        });
    }, [containerMap, inferredArrivalByContainer]);

    const inferredContainerIds = useMemo(() => containers.filter(c => c.group === 'needs-confirmation').map(c => c.id), [containers]);
    const inTransitContainers = useMemo(() => containers.filter(c => c.group === 'in-transit'), [containers]);
    const arrivedContainers = useMemo(() => containers.filter(c => c.group === 'arrived'), [containers]);

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

    const replenishmentKpiRows = useMemo(() => {
        return products
            .map((p) => ({
                sku: p.sku,
                reorderPlacedDate: p.reorderPlacedDate || '',
                productionScheduledQty: Number(p.productionScheduledQty) || 0,
                toBeShippedQty: Number(p.toBeShippedQty) || 0,
                shippedOutQty: Number(p.shippedOutQty) || 0,
            }))
            .filter((r) =>
                !!r.reorderPlacedDate ||
                r.productionScheduledQty > 0 ||
                r.toBeShippedQty > 0 ||
                r.shippedOutQty > 0
            );
    }, [products]);

    const replenishmentRows = useMemo(() => {
        return products
            .map((p) => ({
                sku: p.sku,
                reorderPlacedDate: p.reorderPlacedDate || '',
                hasShipment: Array.isArray(p.shipments) && p.shipments.length > 0,
                productionScheduledQty: Number(p.productionScheduledQty) || 0,
                toBeShippedQty: Number(p.toBeShippedQty) || 0,
                shippedOutQty: Number(p.shippedOutQty) || 0,
                shipmentStatus: 'In Production',
            }))
            .filter((r) => {
                const inProductionOnly = r.productionScheduledQty > 0;
                if (!inProductionOnly) return false;
                if (!r.hasShipment && !r.reorderPlacedDate) return false;
                if (r.toBeShippedQty > 0 || r.shippedOutQty > 0) return false;
                return true;
            });
    }, [products]);

    const replenishmentSummary = useMemo(() => {
        const totals = replenishmentKpiRows.reduce((acc, row) => {
            acc.production += row.productionScheduledQty;
            acc.toBeShipped += row.toBeShippedQty;
            acc.shippedOut += row.shippedOutQty;
            return acc;
        }, { production: 0, toBeShipped: 0, shippedOut: 0 });
        return {
            ...totals,
            skuCount: replenishmentKpiRows.length
        };
    }, [replenishmentKpiRows]);

    const filteredReplenishmentRows = useMemo(() => {
        if (searchTags.length === 0 && !inputValue.trim()) {
            return replenishmentRows;
        }
        const terms = [
            ...searchTags.map(t => t.toLowerCase().trim()).filter(Boolean),
            inputValue.toLowerCase().trim()
        ].filter(Boolean);
        return replenishmentRows.filter((row) => {
            const hay = [
                row.sku,
                row.reorderPlacedDate || '',
                row.shipmentStatus || '',
                String(row.productionScheduledQty || 0),
                String(row.toBeShippedQty || 0),
                String(row.shippedOutQty || 0)
            ].join(' ').toLowerCase();
            return terms.some(term => hay.includes(term));
        });
    }, [replenishmentRows, searchTags, inputValue]);

    const handleExportReplenishmentRows = () => {
        if (!filteredReplenishmentRows.length) return;
        const escapeCsv = (value: string | number) => {
            const str = String(value ?? '');
            if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`;
            return str;
        };
        const lines = [
            ['SKU', 'Reorder Date', 'Production'].join(','),
            ...filteredReplenishmentRows.map((row) => [
                escapeCsv(row.sku),
                escapeCsv(row.reorderPlacedDate || ''),
                escapeCsv(row.productionScheduledQty),
            ].join(','))
        ];
        const csv = lines.join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `replenishment-ordered-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        URL.revokeObjectURL(url);
    };

    const getStatusStyle = (status: string) => {
        if (!status) return { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' };
        const s = normalizedShipmentStatus(status).toLowerCase();
        if (s.includes('shipped') && !s.includes('to be')) return { background: '#dbeafe', color: '#1e40af', border: '1px solid #bfdbfe' };
        if (s.includes('arrived') || s.includes('delivered') || s.includes('cleared')) return { background: '#d1fae5', color: '#065f46', border: '1px solid #a7f3d0' };
        if (s.includes('pending') || s.includes('to be')) return { background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' };
        return { background: '#f3f4f6', color: '#374151', border: '1px solid #e5e7eb' };
    };

    const openConfirmDialog = (containerId: string, mode: ArrivalConfirmMode) => {
        const c = containers.find(x => x.id === containerId);
        const items: ConfirmDialogItem[] = Array.isArray(c?.items)
            ? c.items
                .map((i: any) => ({ sku: String(i?.sku || '').trim(), plannedQty: Math.max(0, Math.round(Number(i?.qty) || 0)) }))
                .filter((i: ConfirmDialogItem) => !!i.sku)
            : [];
        setConfirmDialog({ containerId, mode, items });
        setConfirmSkuQtyInputs({});
    };

    const closeConfirmDialog = () => {
        setConfirmDialog(null);
        setConfirmSkuQtyInputs({});
    };

    const handleSubmitConfirmWithoutEdits = () => {
        if (!confirmDialog || !onConfirmContainersArrived) return;
        onConfirmContainersArrived([{
            containerId: confirmDialog.containerId,
            mode: confirmDialog.mode,
        }]);
        closeConfirmDialog();
    };

    const handleSubmitConfirmWithEdits = () => {
        if (!confirmDialog || !onConfirmContainersArrived) return;
        const confirmedSkuQtys: Record<string, number> = {};
        for (let i = 0; i < confirmDialog.items.length; i++) {
            const item = confirmDialog.items[i];
            const raw = String(confirmSkuQtyInputs[item.sku] ?? '').trim();
            if (!raw) continue;
            const parsed = Number(raw);
            if (!Number.isFinite(parsed) || parsed < 0) continue;
            const rounded = Math.round(parsed);
            if (rounded !== item.plannedQty) {
                confirmedSkuQtys[item.sku] = rounded;
            }
        }
        onConfirmContainersArrived([{
            containerId: confirmDialog.containerId,
            mode: confirmDialog.mode,
            confirmedSkuQtys: Object.keys(confirmedSkuQtys).length > 0 ? confirmedSkuQtys : undefined
        }]);
        closeConfirmDialog();
    };

    const handleConfirmOne = (containerId: string, mode: ArrivalConfirmMode) => {
        if (!onConfirmContainersArrived) return;
        openConfirmDialog(containerId, mode);
    };

    const handleConfirmAll = () => {
        if (!onConfirmContainersArrived || inferredContainerIds.length === 0) return;
        const payload = inferredContainerIds.map((id) => {
            const c = containers.find(x => x.id === id);
            const suggestedQty = Math.max(
                0,
                Math.round(Number(c?.inferredMeta?.evidenceQty) || Number(c?.totalQty) || 0)
            );
            return { containerId: id, mode: 'INFERRED' as const, confirmedQty: suggestedQty };
        });
        onConfirmContainersArrived(payload);
    };

    const openEditDialog = (containerId: string) => {
        const c = containers.find(x => x.id === containerId);
        if (!c) return;
        const qtyBySku = new Map<string, number>();
        (c.items || []).forEach((item: any) => {
            const sku = String(item?.sku || '').trim();
            if (!sku) return;
            const qty = Math.max(0, Math.round(Number(item?.qty) || 0));
            qtyBySku.set(sku, (qtyBySku.get(sku) || 0) + qty);
        });
        const items: EditDialogItem[] = Array.from(qtyBySku.entries())
            .map(([sku, quantity], idx) => ({ id: `${sku}-${idx}`, sku, quantity: String(quantity) }))
            .sort((a, b) => a.sku.localeCompare(b.sku));
        setEditDialog({
            containerId,
            status: normalizedShipmentStatus(c.status),
            eta: String(c.eta || ''),
            items: items.length > 0 ? items : [{ id: `new-${Date.now()}`, sku: '', quantity: '' }]
        });
    };

    const closeEditDialog = () => setEditDialog(null);

    const handleEditItemChange = (id: string, field: 'sku' | 'quantity', value: string) => {
        setEditDialog(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                items: prev.items.map((it) => it.id === id ? { ...it, [field]: value } : it)
            };
        });
    };

    const handleAddEditItem = () => {
        setEditDialog(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                items: [...prev.items, { id: `new-${Date.now()}-${Math.random()}`, sku: '', quantity: '' }]
            };
        });
    };

    const handleRemoveEditItem = (id: string) => {
        setEditDialog(prev => {
            if (!prev) return prev;
            const next = prev.items.filter((it) => it.id !== id);
            return { ...prev, items: next.length > 0 ? next : [{ id: `new-${Date.now()}`, sku: '', quantity: '' }] };
        });
    };

    const handleSaveEditDialog = () => {
        if (!editDialog || !onEditContainerShipments) return;
        const mergedBySku = new Map<string, number>();
        for (let i = 0; i < editDialog.items.length; i++) {
            const row = editDialog.items[i];
            const sku = String(row.sku || '').trim();
            const qty = Math.round(Number(row.quantity));
            if (!sku || !Number.isFinite(qty) || qty <= 0) continue;
            mergedBySku.set(sku, (mergedBySku.get(sku) || 0) + qty);
        }
        onEditContainerShipments({
            containerId: editDialog.containerId,
            status: normalizedShipmentStatus(editDialog.status),
            eta: String(editDialog.eta || '').trim() || undefined,
            items: Array.from(mergedBySku.entries()).map(([sku, quantity]) => ({ sku, quantity }))
        });
        closeEditDialog();
    };

    const renderContainerCard = (c: any) => (
        <div key={c.id} className="sello-glass rounded-xl overflow-hidden flex flex-col hover:shadow-md transition-shadow">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--glass-divider)', background: 'rgba(249,250,251,0.5)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', minWidth: 0 }}>
                        <h3 style={{ fontWeight: 700, fontSize: 13, color: '#111827', display: 'flex', alignItems: 'center', gap: 6, margin: 0 }}>
                            <Ship style={{ width: 14, height: 14, color: 'var(--theme)' }} />{c.id}
                        </h3>
                        <div style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 6px', borderRadius: 4, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                            <span style={{ fontSize: 9, color: '#0f172a', fontWeight: 500, letterSpacing: '0.01em', lineHeight: 1 }}>ETA: {c.eta || 'Pending'}</span>
                        </div>
                    </div>
                    <span style={{ ...getStatusStyle(c.displayStatus), fontSize: 9, fontWeight: 700, padding: '3px 6px', borderRadius: 4, textTransform: 'uppercase', flexShrink: 0 }}>
                        {c.displayStatus}
                    </span>
                </div>
                {c.inferredMeta && (
                    <div style={{ fontSize: 10, color: '#065f46', marginTop: 4, fontWeight: 700, letterSpacing: '0.02em' }}>
                        Inferred via inventory change signals
                    </div>
                )}
            </div>
            <div style={{ padding: 16, flex: 1, maxHeight: 160, overflowY: 'auto' }}>
                {c.items.map((item: any, idx: number) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, paddingBottom: 4, marginBottom: 4, borderBottom: '1px solid var(--glass-divider)' }}>
                        <span className="v-num">{item.sku}</span>
                        <span className="v-num v-bold">{item.qty}</span>
                    </div>
                ))}
            </div>
            {(onEditContainerShipments || ((c.inferredMeta || c.group === 'in-transit') && onConfirmContainersArrived)) && (
                <div style={{ padding: '10px 12px', borderTop: '1px solid var(--glass-divider)', background: '#f0fdf4' }}>
                    <div className="flex items-center gap-2">
                        {onEditContainerShipments && (
                            <button
                                onClick={() => openEditDialog(c.id)}
                                className="flex-1 px-3 py-1.5 text-xs font-bold rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 transition-colors inline-flex items-center justify-center gap-1"
                            >
                                <Pencil className="w-3 h-3" /> Edit Container
                            </button>
                        )}
                        {(c.inferredMeta || c.group === 'in-transit') && onConfirmContainersArrived && (
                            (() => {
                                const isManual = !c.inferredMeta;
                                const btnClass = isManual
                                    ? 'flex-1 px-3 py-1.5 text-xs font-bold rounded border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 transition-colors'
                                    : 'flex-1 px-3 py-1.5 text-xs font-bold rounded border border-green-300 bg-white text-green-700 hover:bg-green-50 transition-colors';
                                return (
                                    <button
                                        onClick={() => handleConfirmOne(c.id, c.inferredMeta ? 'INFERRED' : 'MANUAL')}
                                        className={btnClass}
                                    >
                                        {c.inferredMeta ? 'Confirm Arrival' : 'Manual Confirm Arrival'}
                                    </button>
                                );
                            })()
                        )}
                    </div>
                </div>
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="sello-glass p-4 rounded-xl">
                <label style={{ fontSize: 10, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 8 }}>Filter Shipments</label>
                <TagSearchInput tags={searchTags} onTagsChange={updateTags} onInputChange={setInputValue}
                    placeholder="Search SKUs, Aliases, or Container IDs..." themeColor={themeColor} />
            </div>

            <div className="sello-glass rounded-xl p-4">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-gray-900 uppercase tracking-wide">Replenishment Plan</h3>
                    <span className="text-xs text-gray-500">{replenishmentSummary.skuCount} SKUs tracked</span>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <div className="bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
                        <div className="flex items-center justify-between gap-2">
                            <div className="text-[10px] uppercase tracking-wide text-gray-500 font-bold">Production Scheduled</div>
                            <button
                                onClick={() => setShowReplenishmentTable(v => !v)}
                                className="px-2 py-0.5 rounded border border-gray-200 text-[10px] font-bold text-gray-600 hover:bg-gray-100 transition-colors"
                            >
                                {showReplenishmentTable ? 'Hide' : 'Show'}
                            </button>
                        </div>
                        <div className="text-lg font-bold text-gray-900">{replenishmentSummary.production.toLocaleString()}</div>
                    </div>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-amber-700 font-bold">To Be Shipped</div>
                        <div className="text-lg font-bold text-amber-800">{replenishmentSummary.toBeShipped.toLocaleString()}</div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-lg px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-blue-700 font-bold">Shipped Out</div>
                        <div className="text-lg font-bold text-blue-800">{replenishmentSummary.shippedOut.toLocaleString()}</div>
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                        <div className="text-[10px] uppercase tracking-wide text-green-700 font-bold">Coverage</div>
                        <div className="text-lg font-bold text-green-800">
                            {replenishmentSummary.production > 0
                                ? `${Math.round((replenishmentSummary.shippedOut / replenishmentSummary.production) * 100)}%`
                                : '0%'}
                        </div>
                    </div>
                </div>
            </div>

            <div className="sello-glass rounded-xl overflow-hidden">
                <div className="px-4 py-3 border-b border-custom-glass flex items-center justify-between">
                    <h4 className="text-xs font-bold uppercase tracking-wide text-gray-700">Replenishment SKU Detail</h4>
                    <div className="flex items-center gap-3">
                        <span className="text-[11px] text-gray-500">
                            {filteredReplenishmentRows.length} SKUs in production • {filteredReplenishmentRows.reduce((sum, row) => sum + row.productionScheduledQty, 0).toLocaleString()} units
                        </span>
                        <button
                            onClick={handleExportReplenishmentRows}
                            disabled={filteredReplenishmentRows.length === 0}
                            className="px-2.5 py-1 rounded border border-gray-200 text-[11px] font-bold text-gray-700 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                        >
                            Export
                        </button>
                    </div>
                </div>
                {showReplenishmentTable && (
                    <div className="sello-table-scroll max-h-[260px]">
                        <div className="mx-auto w-full max-w-[980px]">
                            <table className="sello-table table-fixed">
                                <colgroup>
                                    <col style={{ width: '56%' }} />
                                    <col style={{ width: '26%' }} />
                                    <col style={{ width: '18%' }} />
                                </colgroup>
                                <thead>
                                    <tr>
                                        <th>SKU</th>
                                        <th>Reorder Date</th>
                                        <th className="r">Production</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredReplenishmentRows.map((row) => (
                                        <tr key={row.sku}>
                                            <td><span className="v-num v-bold">{row.sku}</span></td>
                                            <td><span className="v-num">{row.reorderPlacedDate || '-'}</span></td>
                                            <td className="r"><span className="v-num v-bold">{row.productionScheduledQty.toLocaleString()}</span></td>
                                        </tr>
                                    ))}
                                    {filteredReplenishmentRows.length === 0 && (
                                        <tr>
                                            <td colSpan={3} style={{ padding: 24, textAlign: 'center', color: '#9ca3af' }}>
                                                No replenishment rows found for current filter.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
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
                            <table className="sello-table">
                                <thead>
                                    <tr>
                                        <th>SKU</th>
                                        <th>Container</th>
                                        <th>Status</th>
                                        <th className="col-blue">ETA</th>
                                        <th className="r">Qty</th>
                                        <th className="r">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedTableData.map(row => {
                                        const inferred = inferredArrivalByContainer.has(row.containerId);
                                        const displayStatus = inferred ? 'Arrived (Inferred)' : normalizedShipmentStatus(row.status);
                                        return (
                                            <tr key={row.id}>
                                                <td><span className="v-num v-bold">{row.sku}</span></td>
                                                <td><span className="v-num" style={{ color: 'var(--theme)' }}>{row.containerId}</span></td>
                                                <td>
                                                    <span style={{ ...getStatusStyle(displayStatus), padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', display: 'inline-block' }}>
                                                        {displayStatus}
                                                    </span>
                                                </td>
                                                <td className="col-blue"><span className="v-num">{row.eta || <span className="v-dim">Pending</span>}</span></td>
                                                <td className="r"><span className="v-num v-bold">{row.quantity}</span></td>
                                                <td className="r">
                                                    {inferred && onConfirmContainersArrived ? (
                                                        <button
                                                            onClick={() => handleConfirmOne(row.containerId, 'INFERRED')}
                                                            className="px-2 py-1 text-[10px] font-bold rounded border border-green-300 bg-white text-green-700 hover:bg-green-50 transition-colors"
                                                        >
                                                            Confirm
                                                        </button>
                                                    ) : onConfirmContainersArrived && !isArrivedLikeStatus(row.status) ? (
                                                        <div className="inline-flex items-center gap-1">
                                                            <button
                                                                onClick={() => handleConfirmOne(row.containerId, 'MANUAL')}
                                                                className="px-2 py-1 text-[10px] font-bold rounded border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 transition-colors"
                                                            >
                                                                Manual
                                                            </button>
                                                            {onEditContainerShipments && (
                                                                <button
                                                                    onClick={() => openEditDialog(row.containerId)}
                                                                    className="px-2 py-1 text-[10px] font-bold rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 transition-colors"
                                                                >
                                                                    Edit
                                                                </button>
                                                            )}
                                                        </div>
                                                    ) : onEditContainerShipments ? (
                                                        <button
                                                            onClick={() => openEditDialog(row.containerId)}
                                                            className="px-2 py-1 text-[10px] font-bold rounded border border-amber-300 bg-white text-amber-700 hover:bg-amber-50 transition-colors"
                                                        >
                                                            Edit
                                                        </button>
                                                    ) : (
                                                        <span className="v-dim">-</span>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {filteredTableData.length === 0 && (
                                        <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No shipments found matching your search.</td></tr>
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
                <div className="space-y-5">
                    <div className="sello-glass rounded-xl p-4 border border-custom-glass">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                                <span className="px-2.5 py-1 rounded-full bg-green-50 border border-green-200 text-green-700 text-xs font-bold">
                                    Needs Confirmation: {inferredContainerIds.length}
                                </span>
                                <span className="px-2.5 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold">
                                    In Transit: {inTransitContainers.length}
                                </span>
                                <span className="px-2.5 py-1 rounded-full bg-gray-100 border border-gray-200 text-gray-700 text-xs font-bold">
                                    Arrived: {arrivedContainers.length}
                                </span>
                            </div>
                            {onConfirmContainersArrived && inferredContainerIds.length > 0 && (
                                <button
                                    onClick={handleConfirmAll}
                                    className="px-3 py-1.5 rounded-lg border border-green-300 bg-white text-green-700 text-xs font-bold hover:bg-green-50 transition-colors"
                                >
                                    Confirm All Inferred ({inferredContainerIds.length})
                                </button>
                            )}
                        </div>
                    </div>

                    {inferredContainerIds.length > 0 && (
                        <section className="space-y-3">
                            <div className="px-1 text-xs font-bold uppercase tracking-wide text-green-700">Needs Confirmation</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                                {containers.filter(c => c.group === 'needs-confirmation').map(renderContainerCard)}
                            </div>
                        </section>
                    )}

                    {inTransitContainers.length > 0 && (
                        <section className="space-y-3">
                            <div className="px-1 text-xs font-bold uppercase tracking-wide text-blue-700">In Transit</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                                {containers.filter(c => c.group === 'in-transit').map(renderContainerCard)}
                            </div>
                        </section>
                    )}

                    {arrivedContainers.length > 0 && (
                        <section className="space-y-3">
                            <div className="px-1 text-xs font-bold uppercase tracking-wide text-gray-700">Arrived</div>
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
                                {containers.filter(c => c.group === 'arrived').map(renderContainerCard)}
                            </div>
                        </section>
                    )}

                    {containers.length === 0 && (
                        <div className="sello-glass rounded-xl p-8 text-center text-gray-400">No containers found.</div>
                    )}
                </div>
            )}

            {confirmDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-[620px] max-w-[95vw] p-4">
                        <div className="text-sm font-bold text-gray-900">Confirm Container Arrival</div>
                        <div className="text-xs text-gray-600 mt-1">
                            Container <span className="font-bold">{confirmDialog.containerId}</span> ({confirmDialog.mode})
                        </div>
                        <div className="mt-3 text-[11px] text-gray-500">
                            Edit only mismatched SKU quantities. Empty field means no change (uses original shipment quantity).
                        </div>
                        <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden">
                            <div className="max-h-[280px] overflow-y-auto">
                                <table className="sello-table">
                                    <thead>
                                        <tr>
                                            <th>SKU</th>
                                            <th className="r">Original Qty</th>
                                            <th className="r">Confirmed Qty</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {confirmDialog.items.map((item) => (
                                            <tr key={item.sku}>
                                                <td><span className="v-num v-bold">{item.sku}</span></td>
                                                <td className="r"><span className="v-num">{item.plannedQty.toLocaleString()}</span></td>
                                                <td className="r">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={confirmSkuQtyInputs[item.sku] ?? ''}
                                                        placeholder={String(item.plannedQty)}
                                                        onChange={(e) => {
                                                            const v = e.target.value;
                                                            setConfirmSkuQtyInputs(prev => ({ ...prev, [item.sku]: v }));
                                                        }}
                                                        className="w-28 border border-gray-300 rounded px-2 py-1 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-theme/20 text-right"
                                                    />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                onClick={closeConfirmDialog}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSubmitConfirmWithoutEdits}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-blue-300 bg-white text-blue-700 hover:bg-blue-50"
                            >
                                Confirm (No Qty Change)
                            </button>
                            <button
                                onClick={handleSubmitConfirmWithEdits}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-green-300 bg-green-600 text-white hover:bg-green-700"
                            >
                                Confirm with Edits
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {editDialog && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
                    <div className="bg-white rounded-xl border border-gray-200 shadow-xl w-[760px] max-w-[96vw] p-4">
                        <div className="text-sm font-bold text-gray-900">Edit Container</div>
                        <div className="text-xs text-gray-600 mt-1">
                            Container <span className="font-bold">{editDialog.containerId}</span>
                        </div>
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div>
                                <label className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">Status</label>
                                <input
                                    type="text"
                                    value={editDialog.status}
                                    onChange={(e) => setEditDialog(prev => prev ? { ...prev, status: e.target.value } : prev)}
                                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-theme/20"
                                />
                            </div>
                            <div>
                                <label className="text-[11px] uppercase tracking-wide text-gray-500 font-bold">ETA</label>
                                <input
                                    type="date"
                                    value={editDialog.eta}
                                    onChange={(e) => setEditDialog(prev => prev ? { ...prev, eta: e.target.value } : prev)}
                                    className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-theme/20"
                                />
                            </div>
                        </div>
                        <div className="mt-3 border border-gray-200 rounded-lg overflow-hidden">
                            <div className="max-h-[320px] overflow-y-auto">
                                <table className="sello-table">
                                    <thead>
                                        <tr>
                                            <th>SKU</th>
                                            <th className="r">Qty</th>
                                            <th className="r">Action</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {editDialog.items.map((item) => (
                                            <tr key={item.id}>
                                                <td>
                                                    <input
                                                        type="text"
                                                        value={item.sku}
                                                        onChange={(e) => handleEditItemChange(item.id, 'sku', e.target.value)}
                                                        className="w-full border border-gray-300 rounded px-2 py-1 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-theme/20"
                                                    />
                                                </td>
                                                <td className="r">
                                                    <input
                                                        type="number"
                                                        min={0}
                                                        value={item.quantity}
                                                        onChange={(e) => handleEditItemChange(item.id, 'quantity', e.target.value)}
                                                        className="w-24 border border-gray-300 rounded px-2 py-1 text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-theme/20 text-right"
                                                    />
                                                </td>
                                                <td className="r">
                                                    <button
                                                        onClick={() => handleRemoveEditItem(item.id)}
                                                        className="px-2 py-1 text-[10px] font-bold rounded border border-red-300 bg-white text-red-700 hover:bg-red-50 transition-colors inline-flex items-center gap-1"
                                                    >
                                                        <Trash2 className="w-3 h-3" /> Remove
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                        <div className="mt-3">
                            <button
                                onClick={handleAddEditItem}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 inline-flex items-center gap-1"
                            >
                                <Plus className="w-3.5 h-3.5" /> Add SKU Row
                            </button>
                        </div>
                        <div className="mt-4 flex items-center justify-end gap-2">
                            <button
                                onClick={closeEditDialog}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleSaveEditDialog}
                                className="px-3 py-1.5 text-xs font-bold rounded-lg border border-amber-300 bg-amber-600 text-white hover:bg-amber-700"
                            >
                                Save Container Changes
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
