import { PriceLog } from '../types';

const BASE = '/.netlify/functions';

// Netlify function body limit is 6MB. We stay well under by trimming
// history arrays (audit logs) to the most recent entries before pushing.
// Products + config alone are ~1-2MB; histories can grow to 10MB+ unchecked.
const MAX_HISTORY_RECORDS = 500;
const MAX_PAYLOAD_BYTES   = 5 * 1024 * 1024; // 5MB hard ceiling
const SNAPSHOT_CHUNK_BYTES = 350 * 1024; // keep each request comfortably below 6MB function limit

function sizeOf(obj: any): number {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
}

function trimSnapshot(snapshot: Record<string, any>): Record<string, any> {
    const trimmed = { ...snapshot };

    // Promotions now live in their own DB table — strip from snapshot entirely
    delete trimmed.promotions;

    // Step 1: Trim unbounded audit history arrays to most recent N records
    if (Array.isArray(trimmed.priceChangeHistory)) {
        trimmed.priceChangeHistory = trimmed.priceChangeHistory.slice(0, MAX_HISTORY_RECORDS);
    }
    if (Array.isArray(trimmed.costChangeHistory)) {
        trimmed.costChangeHistory = trimmed.costChangeHistory.slice(0, MAX_HISTORY_RECORDS);
    }
    if (Array.isArray(trimmed.inventoryChangeHistory)) {
        trimmed.inventoryChangeHistory = trimmed.inventoryChangeHistory.slice(0, MAX_HISTORY_RECORDS);
    }
    // Step 2: If still over limit, strip histories entirely
    if (sizeOf(trimmed) > MAX_PAYLOAD_BYTES) {
        console.warn(`[pushSnapshot] still large — stripping histories entirely`);
        trimmed.priceChangeHistory     = [];
        trimmed.costChangeHistory      = [];
        trimmed.inventoryChangeHistory = [];
    }

    const finalBytes = sizeOf(trimmed);
    console.log(`[pushSnapshot] payload size: ${(finalBytes / 1024 / 1024).toFixed(2)}MB`);

    return trimmed;
}

export async function verifyPassword(password: string):
    Promise<{ valid: boolean; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-verify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
        });
        return await res.json();
    } catch { return { valid: false, error: 'Network error' }; }
}

export async function pushSnapshot(password: string, snapshot: object):
    Promise<{ success: boolean; pushedAt?: string; error?: string }> {
    try {
        const safe = trimSnapshot(snapshot as Record<string, any>);
        const snapshotJson = JSON.stringify(safe);
        const bytes = new TextEncoder().encode(snapshotJson).length;
        const totalChunks = Math.max(1, Math.ceil(bytes / SNAPSHOT_CHUNK_BYTES));
        const uploadId = `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        console.log(
            `[pushSnapshot] chunked upload start: ${(
                bytes / 1024 / 1024
            ).toFixed(2)}MB total, ${totalChunks} chunks @ ~${Math.round(SNAPSHOT_CHUNK_BYTES / 1024)}KB`
        );

        const beginRes = await fetch(`${BASE}/db-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, action: 'begin', uploadId, totalChunks })
        });
        const beginData = await beginRes.json();
        if (!beginData.success) return beginData;

        for (let i = 0; i < totalChunks; i++) {
            const start = i * SNAPSHOT_CHUNK_BYTES;
            const end = start + SNAPSHOT_CHUNK_BYTES;
            const chunkData = snapshotJson.slice(start, end);
            const chunkBytes = new TextEncoder().encode(chunkData).length;
            console.log(
                `[pushSnapshot] uploading chunk ${i + 1}/${totalChunks} (${(chunkBytes / 1024).toFixed(1)}KB)`
            );
            const chunkRes = await fetch(`${BASE}/db-push`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ password, action: 'chunk', uploadId, chunkIndex: i, chunkData })
            });
            const chunkResult = await chunkRes.json();
            if (!chunkResult.success) return chunkResult;
        }

        console.log('[pushSnapshot] finalizing chunked upload');
        const finalizeRes = await fetch(`${BASE}/db-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, action: 'finalize', uploadId })
        });
        return await finalizeRes.json();
    } catch { return { success: false, error: 'Network error' }; }
}

export async function pullSnapshot():
    Promise<{ success: boolean; snapshot?: any; unchanged?: boolean; lastUpdatedAt?: string; error?: string }> {
    return pullSnapshotIfUpdated();
}

export async function pullSnapshotIfUpdated(ifUpdatedSince?: string):
    Promise<{ success: boolean; snapshot?: any; unchanged?: boolean; lastUpdatedAt?: string; error?: string }> {
    try {
        const qs = ifUpdatedSince ? `?ifUpdatedSince=${encodeURIComponent(ifUpdatedSince)}` : '';
        const res = await fetch(`${BASE}/db-pull${qs}`);
        return await res.json();
    } catch { return { success: false, error: 'Network error' }; }
}

export async function pushTransactions(
    password: string,
    allTransactions: PriceLog[]
): Promise<{ success: boolean; totalChunks: number; error?: string }> {
    const CHUNK_SIZE = 50;
    const chunks: PriceLog[][] = [];
    for (let i = 0; i < allTransactions.length; i += CHUNK_SIZE) {
        chunks.push(allTransactions.slice(i, i + CHUNK_SIZE));
    }
    const totalChunks = chunks.length;
    try {
        for (let i = 0; i < chunks.length; i++) {
            const res = await fetch(`${BASE}/db-push-transactions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    password,
                    transactions: chunks[i],
                    chunkIndex: i,
                    totalChunks
                })
            });
            const data = await res.json();
            if (!data.success) return { success: false, totalChunks, error: data.error };
        }
        return { success: true, totalChunks };
    } catch (e: any) {
        return { success: false, totalChunks, error: e.message };
    }
}

export async function pullTransactions():
    Promise<{ success: boolean; transactions?: PriceLog[]; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-pull-transactions`);
        return await res.json();
    } catch { return { success: false, error: 'Network error' }; }
}

export async function clearTransactions(password: string):
    Promise<{ success: boolean; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-push-transactions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, clearAll: true, transactions: [] })
        });
        return await res.json();
    } catch { return { success: false, error: 'Network error' }; }
}

export async function pushRefundsAndShipments(
    password: string,
    refunds: any[],
    shipments: any[]
): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-push-refunds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, refunds, shipments })
        });
        return await res.json();
    } catch {
        return { success: false, error: 'Network error' };
    }
}

export async function pullRefundsAndShipments():
    Promise<{
        success: boolean;
        refunds?: any[];
        shipments?: any[];
        error?: string
    }> {
    try {
        const res = await fetch(`${BASE}/db-pull-refunds`);
        return await res.json();
    } catch {
        return { success: false, error: 'Network error' };
    }
}

export async function initDatabase():
    Promise<{ success: boolean; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-init`);
        return await res.json();
    } catch { return { success: false, error: 'Network error' }; }
}

export async function getLatestTransactionDate():
    Promise<{ success: boolean; latestDate: string | null; totalRows: number; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-get-latest-date`);
        return await res.json();
    } catch { return { success: false, latestDate: null, totalRows: 0, error: 'Network error' }; }
}

export async function pullTransactionPage(
    page: number,
    pageSize: number = 2000
): Promise<{
    success: boolean;
    transactions?: PriceLog[];
    totalRows?: number;
    hasMore?: boolean;
    error?: string
}> {
    try {
        const res = await fetch(
            `${BASE}/db-pull-transactions?page=${page}&pageSize=${pageSize}`
        );
        return await res.json();
    } catch {
        return { success: false, error: 'Network error' };
    }
}

export async function pullTransactionPageSince(
    since: string,
    page: number,
    pageSize: number = 2000
): Promise<{
    success: boolean;
    transactions?: PriceLog[];
    totalRows?: number;
    hasMore?: boolean;
    error?: string
}> {
    try {
        const res = await fetch(
            `${BASE}/db-pull-transactions?page=${page}&pageSize=${pageSize}&since=${encodeURIComponent(since)}`
        );
        return await res.json();
    } catch {
        return { success: false, error: 'Network error' };
    }
}

export async function checkVersion():
    Promise<{ success: boolean; lastPushAt: string | null; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-check-version`);
        return await res.json();
    } catch {
        return { success: false, lastPushAt: null, error: 'Network error' };
    }
}

export async function pushAdData(
    password: string,
    adSnapshots: any[],
    adRosterChanges: any[],
    adBudgets: Record<string, number>
): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-push-ad`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, adSnapshots, adRosterChanges, adBudgets })
        });
        return await res.json();
    } catch { return { success: false, error: 'Network error' }; }
}

export async function pullAdData():
    Promise<{
        success: boolean;
        adSnapshots?: any[];
        adRosterChanges?: any[];
        adBudgets?: Record<string, number>;
        error?: string;
    }> {
    try {
        const res = await fetch(`${BASE}/db-pull-ad`);
        return await res.json();
    } catch { return { success: false, error: 'Network error' }; }
}

export async function pushPromotions(
    password: string,
    promotions: any[]
): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-push-promotions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, promotions })
        });
        return await res.json();
    } catch { return { success: false, error: 'Network error' }; }
}

export async function pullPromotions():
    Promise<{ success: boolean; promotions?: any[]; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-pull-promotions`);
        return await res.json();
    } catch { return { success: false, promotions: [], error: 'Network error' }; }
}

