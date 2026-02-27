import { PriceLog } from '../types';

const BASE = '/.netlify/functions';

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
        const res = await fetch(`${BASE}/db-push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password, snapshot })
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
