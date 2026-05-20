import { PriceLog } from '../types';
import { logRuntimeDebug } from './runtimeDebug';

const BASE = '/.netlify/functions';

// Chunked snapshot upload handles large payloads.
// Do not trim history logs: they are critical app data.
const SNAPSHOT_CHUNK_BYTES = 350 * 1024; // keep each request comfortably below 6MB function limit

function sizeOf(obj: any): number {
    return new TextEncoder().encode(JSON.stringify(obj)).length;
}

function chunkUtf8String(input: string, maxBytes: number): string[] {
    if (!input) return [''];
    const encoder = new TextEncoder();
    const chunks: string[] = [];
    let start = 0;

    while (start < input.length) {
        let low = start + 1;
        let high = input.length;
        let bestEnd = start + 1;

        while (low <= high) {
            const mid = Math.floor((low + high) / 2);
            const candidate = input.slice(start, mid);
            const candidateBytes = encoder.encode(candidate).length;
            if (candidateBytes <= maxBytes) {
                bestEnd = mid;
                low = mid + 1;
            } else {
                high = mid - 1;
            }
        }

        const chunk = input.slice(start, bestEnd);
        if (!chunk) {
            throw new Error('Failed to create non-empty snapshot chunk within byte limit');
        }
        chunks.push(chunk);
        start = bestEnd;
    }

    return chunks;
}

function trimSnapshot(snapshot: Record<string, any>): Record<string, any> {
    const trimmed = { ...snapshot };

    // Promotions now live in their own DB table — strip from snapshot entirely
    delete trimmed.promotions;
    const finalBytes = sizeOf(trimmed);
    logRuntimeDebug(`[pushSnapshot] payload size: ${(finalBytes / 1024 / 1024).toFixed(2)}MB`);

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
        const snapshotChunks = chunkUtf8String(snapshotJson, SNAPSHOT_CHUNK_BYTES);
        const totalChunks = snapshotChunks.length;
        const uploadId = `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        logRuntimeDebug(
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
            const chunkData = snapshotChunks[i];
            const chunkBytes = new TextEncoder().encode(chunkData).length;
            logRuntimeDebug(
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

        logRuntimeDebug('[pushSnapshot] finalizing chunked upload');
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
    shipments: any[],
    forceClear: boolean = false
): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-push-refunds`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, refunds, shipments, forceClear })
        });
        return await res.json();
    } catch {
        return { success: false, error: 'Network error' };
    }
}

export async function pullRefundsAndShipments(since?: string):
    Promise<{
        success: boolean;
        refunds?: any[];
        shipments?: any[];
        incremental?: boolean;
        latestUpdatedAt?: string | null;
        error?: string
    }> {
    try {
        const qs = since ? `?since=${encodeURIComponent(since)}` : '';
        const res = await fetch(`${BASE}/db-pull-refunds${qs}`);
        return await res.json();
    } catch {
        return { success: false, error: 'Network error' };
    }
}

export async function pullRefundSignatures():
    Promise<{
        success: boolean;
        signatures?: { id: string; rowHash: string }[];
        totalRows?: number;
        latestUpdatedAt?: string | null;
        error?: string;
    }> {
    try {
        const res = await fetch(`${BASE}/db-pull-refunds?signaturesOnly=1`);
        return await res.json();
    } catch {
        return { success: false, signatures: [], error: 'Network error' };
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
    pageSize: number = 2000,
    cursor?: { afterDate: string; afterId: string } | null
): Promise<{
    success: boolean;
    transactions?: PriceLog[];
    totalRows?: number;
    hasMore?: boolean;
    nextCursor?: { afterDate: string; afterId: string } | null;
    error?: string
}> {
    try {
        const cursorQs = cursor?.afterDate && cursor?.afterId
            ? `&afterDate=${encodeURIComponent(cursor.afterDate)}&afterId=${encodeURIComponent(cursor.afterId)}`
            : '';
        const res = await fetch(
            `${BASE}/db-pull-transactions?page=${page}&pageSize=${pageSize}${cursorQs}`
        );
        return await res.json();
    } catch {
        return { success: false, error: 'Network error' };
    }
}

export async function pullTransactionPageSince(
    since: string,
    page: number,
    pageSize: number = 2000,
    cursor?: { afterDate: string; afterId: string } | null
): Promise<{
    success: boolean;
    transactions?: PriceLog[];
    totalRows?: number;
    hasMore?: boolean;
    nextCursor?: { afterDate: string; afterId: string } | null;
    error?: string
}> {
    try {
        const cursorQs = cursor?.afterDate && cursor?.afterId
            ? `&afterDate=${encodeURIComponent(cursor.afterDate)}&afterId=${encodeURIComponent(cursor.afterId)}`
            : '';
        const res = await fetch(
            `${BASE}/db-pull-transactions?page=${page}&pageSize=${pageSize}&since=${encodeURIComponent(since)}${cursorQs}`
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
    promotions: any[],
    forceClear: boolean = false
): Promise<{ success: boolean; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-push-promotions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, promotions, forceClear })
        });
        return await res.json();
    } catch { return { success: false, error: 'Network error' }; }
}

export async function pullPromotions():
    Promise<{ success: boolean; promotions?: any[]; incremental?: boolean; latestUpdatedAt?: string | null; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-pull-promotions`);
        return await res.json();
    } catch { return { success: false, promotions: [], error: 'Network error' }; }
}

export async function pullPromotionsSince(since?: string):
    Promise<{ success: boolean; promotions?: any[]; incremental?: boolean; latestUpdatedAt?: string | null; error?: string }> {
    try {
        const qs = since ? `?since=${encodeURIComponent(since)}` : '';
        const res = await fetch(`${BASE}/db-pull-promotions${qs}`);
        return await res.json();
    } catch { return { success: false, promotions: [], error: 'Network error' }; }
}

export async function pullPromotionSignatures():
    Promise<{
        success: boolean;
        signatures?: { id: string; rowHash: string }[];
        totalRows?: number;
        latestUpdatedAt?: string | null;
        error?: string;
    }> {
    try {
        const res = await fetch(`${BASE}/db-pull-promotions?signaturesOnly=1`);
        return await res.json();
    } catch {
        return { success: false, signatures: [], error: 'Network error' };
    }
}


