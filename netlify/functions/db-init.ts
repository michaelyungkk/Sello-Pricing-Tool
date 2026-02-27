import { neon } from '@netlify/neon';

export default async (req: Request) => {
    try {
        const sql = neon(process.env.NETLIFY_DATABASE_URL!);

        await sql`
            CREATE TABLE IF NOT EXISTS app_snapshot (
                id INTEGER PRIMARY KEY,
                data TEXT,
                updated_at TIMESTAMPTZ,
                updated_by TEXT
            )
        `;

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
            CREATE INDEX IF NOT EXISTS idx_tx_sku 
            ON transaction_history(sku)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_tx_date 
            ON transaction_history(date)
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS sync_metadata (
                id INTEGER PRIMARY KEY,
                last_push_at TIMESTAMPTZ,
                push_count INTEGER DEFAULT 0
            )
        `;

        await sql`
            INSERT INTO app_snapshot (id, data, updated_at, updated_by)
            VALUES (1, '{}', NOW(), 'system')
            ON CONFLICT (id) DO NOTHING
        `;

        await sql`
            INSERT INTO sync_metadata (id, last_push_at, push_count)
            VALUES (1, NOW(), 0)
            ON CONFLICT (id) DO NOTHING
        `;

        return new Response(
            JSON.stringify({ success: true, message: 'Schema ready' }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
    } catch (error: any) {
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
