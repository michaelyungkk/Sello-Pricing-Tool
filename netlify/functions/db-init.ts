
import { neon } from '@netlify/neon';

/**
 * Netlify Function: db-init
 * Initialises the database schema for the Sello Pricing Tool on Neon.
 * This should be called once after setting up the DATABASE_URL environment variable.
 */
export default async (req: Request) => {
    try {
        const databaseUrl = process.env.NETLIFY_DATABASE_URL;

        if (!databaseUrl) {
            throw new Error('NETLIFY_DATABASE_URL environment variable is not set');
        }

        const sql = neon(databaseUrl);

        // 1. Create app_snapshot table
        // This table stores the full application state as a JSON blob.
        // We only use id=1 to ensure we only ever have one persistent snapshot.
        await sql`
            CREATE TABLE IF NOT EXISTS app_snapshot (
                id INTEGER PRIMARY KEY,
                data TEXT,
                updated_at TIMESTAMPTZ,
                updated_by TEXT
            )
        `;

        // 2. Create sync_metadata table
        // Tracks synchronization statistics and timing.
        await sql`
            CREATE TABLE IF NOT EXISTS sync_metadata (
                id INTEGER PRIMARY KEY,
                last_push_at TIMESTAMPTZ,
                push_count INTEGER DEFAULT 0
            )
        `;

        // 3. Create transaction_history table
        // Stores individual daily transaction buckets for deep historical analysis.
        await sql`
            CREATE TABLE IF NOT EXISTS transaction_history (
                id TEXT PRIMARY KEY,
                sku TEXT NOT NULL,
                date TEXT NOT NULL,
                price NUMERIC,
                velocity NUMERIC,
                margin NUMERIC,
                profit NUMERIC,
                ads_spend NUMERIC,
                raw_ads_spend NUMERIC,
                platform TEXT,
                order_id TEXT,
                postcode TEXT,
                logistic_partner TEXT,
                logistic_service TEXT,
                real_postage NUMERIC,
                real_extra_freight NUMERIC,
                dedup_key TEXT UNIQUE NOT NULL,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_transaction_history_sku 
            ON transaction_history(sku)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_transaction_history_date 
            ON transaction_history(date)
        `;

        // 4. Initialise default rows if they don't exist
        await sql`
            INSERT INTO app_snapshot (id, data, updated_at, updated_by)
            VALUES (1, '{}', NOW(), 'admin')
            ON CONFLICT (id) DO NOTHING
        `;

        await sql`
            INSERT INTO sync_metadata (id, last_push_at, push_count)
            VALUES (1, NOW(), 0)
            ON CONFLICT (id) DO NOTHING
        `;

        return new Response(JSON.stringify({
            success: true,
            message: 'Schema initialised successfully'
        }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error: any) {
        console.error('Database initialisation error:', error);

        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal Server Error'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        });
    }
};
