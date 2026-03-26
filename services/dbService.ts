import { PriceLog } from '../types';

const BASE = '/.netlify/functions';

// Netlify function body limit is 6MB. We stay well under by trimming
// history arrays (audit logs) to the most recent entries before pushing.
// Products + config alone are ~1-2MB; histories can grow to 10MB+ unchecked.
const MAX_HISTORY_RECORDS = 500;
const MAX_PAYLOAD_BYTES   = 5 * 1024 * 1024; // 5MB hard ceiling

function trimSnapshot(snapshot: Record<string, any>): Record<string, any> {
    const trimmed = { ...snapshot };

    // Trim unbounded audit history arrays to most recent N records
    if (Array.isArray(trimmed.priceChangeHistory)) {
        trimmed.priceChangeHistory = trimmed.priceChangeHistory.slice(0, MAX_HISTORY_RECORDS);
    }
    if (Array.isArray(trimmed.costChangeHistory)) {
        trimmed.costChangeHistory = trimmed.costChangeHistory.slice(0, MAX_HISTORY_RECORDS);
    }
    if (Array.isArray(trimmed.inventoryChangeHistory)) {
        trimmed.inventoryChangeHistory = trimmed.inventoryChangeHistory.slice(0, MAX_HISTORY_RECORDS);
    }

    // Verify final payload is under limit
    const json = JSON.stringify(trimmed);
    const bytes = new TextEncoder().encode(json).length;
    if (bytes > MAX_PAYLOAD_BYTES) {
        console.warn(`[pushSnapshot] payload ${(bytes / 1024 / 1024).toFixed(2)}MB still large after trim — stripping histories entirely`);
        trimmed.priceChangeHistory    = [];
        trimmed.costChangeHistory     = [];
        trimmed.inventoryChangeHistory = [];
    }

    const finalBytes = new TextEncoder().encode(JSON.stringify(trimmed)).length;
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
        const res = await fetch(`${BASE}/db-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, snapshot: safe })
        });
        return await res.json();
    } catch { return { success: false, error: 'Network error' }; }
}

export async function pullSnapshot():
    Promise<{ success: boolean; snapshot?: any; lastUpdatedAt?: string; error?: string }> {
    try {
        const res = await fetch(`${BASE}/db-pull`);
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
