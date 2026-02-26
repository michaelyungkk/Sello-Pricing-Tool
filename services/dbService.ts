import { PriceLog } from '../types';

/**
 * dbService.ts
 *
 * Client-side service for communicating with Netlify Functions to persist and retrieve
 * application state from the Neon PostgreSQL database.
 */

const BASE_PATH = '/.netlify/functions';

export interface DbPushResponse {
    success: boolean;
    pushedAt?: string;
    error?: string;
}

export interface DbPullResponse {
    success: boolean;
    snapshot?: any;
    lastUpdatedAt?: string;
    error?: string;
}

export interface DbInitResponse {
    success: boolean;
    message?: string;
    error?: string;
}

/**
 * Pushes the full application state to the database.
 * Requires the admin password for bcrypt authentication on the server.
 */
export async function pushSnapshot(password: string, snapshot: object): Promise<DbPushResponse> {
    try {
        const response = await fetch(`${BASE_PATH}/db-push`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password, snapshot }),
        });

        return await response.json();
    } catch (error) {
        console.error('pushSnapshot network error:', error);
        return { success: false, error: 'Network error' };
    }
}

/**
 * Retrieves the latest persistent state snapshot from the database.
 */
export async function pullSnapshot(): Promise<DbPullResponse> {
    try {
        const response = await fetch(`${BASE_PATH}/db-pull`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok && response.status !== 404) {
            // Handle serious errors like 500
            const errorData = await response.json().catch(() => ({}));
            return { success: false, error: errorData.error || `Server error (${response.status})` };
        }

        return await response.json();
    } catch (error) {
        console.error('pullSnapshot network error:', error);
        return { success: false, error: 'Network error' };
    }
}

/**
 * Initialises the database schema. Should be called once during first setup.
 */
export async function initDatabase(): Promise<DbInitResponse> {
    try {
        const response = await fetch(`${BASE_PATH}/db-init`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        return await response.json();
    } catch (error) {
        console.error('initDatabase network error:', error);
        return { success: false, error: 'Network error' };
    }
}

/**
 * Verifies the admin password without pushing data.
 */
export async function verifyPassword(password: string): Promise<{ valid: boolean, error?: string }> {
    try {
        const response = await fetch(`${BASE_PATH}/db-verify`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password }),
        });

        return await response.json();
    } catch (error) {
        console.error('verifyPassword network error:', error);
        return { valid: false, error: 'Network error' };
    }
}

/**
 * Pushes transaction history in chunks to the database.
 */
export async function pushTransactions(password: string, transactions: any[]): Promise<{ success: boolean; totalUpserted: number; error?: string }> {
    const CHUNK_SIZE = 500;
    const totalChunks = Math.ceil(transactions.length / CHUNK_SIZE);
    let totalUpserted = 0;

    try {
        for (let i = 0; i < totalChunks; i++) {
            const chunk = transactions.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
            const response = await fetch(`${BASE_PATH}/db-push-transactions`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    password,
                    transactions: chunk,
                    chunkIndex: i,
                    totalChunks
                }),
            });

            const result = await response.json();
            if (!result.success) {
                return { success: false, totalUpserted, error: result.error || 'Failed at chunk ' + i };
            }
            totalUpserted += result.upsertedCount || 0;
        }

        return { success: true, totalUpserted };
    } catch (error) {
        console.error('pushTransactions network error:', error);
        return { success: false, totalUpserted, error: 'Network error during transaction sync' };
    }
}

/**
 * Retrieves granular transaction history from the database.
 */
export async function pullTransactions(): Promise<{ success: boolean; transactions?: any[]; error?: string }> {
    try {
        const response = await fetch(`${BASE_PATH}/db-pull-transactions`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            return { success: false, error: err.error || 'Server error' };
        }

        return await response.json();
    } catch (error) {
        console.error('pullTransactions network error:', error);
        return { success: false, error: 'Network error' };
    }
}

/**
 * Clears all transaction history from the database.
 */
export async function clearTransactions(password: string): Promise<{ success: boolean, error?: string }> {
    try {
        const response = await fetch(`${BASE_PATH}/db-push-transactions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ password, transactions: [], clearAll: true }),
        });

        const result = await response.json();
        return { success: result.success, error: result.error };
    } catch (error) {
        console.error('clearTransactions network error:', error);
        return { success: false, error: 'Network error' };
    }
}
