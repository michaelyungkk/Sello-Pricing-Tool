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
                cogs NUMERIC,
                selling_fee NUMERIC,
                ads_fee NUMERIC,
                postage NUMERIC,
                other_fee NUMERIC,
                subscription_fee NUMERIC,
                wms_fee NUMERIC,
                promo_rel NUMERIC,
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
            CREATE TABLE IF NOT EXISTS app_snapshot_uploads (
                upload_id TEXT PRIMARY KEY,
                total_chunks INTEGER NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS app_snapshot_chunks (
                upload_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                chunk_data TEXT NOT NULL,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                PRIMARY KEY (upload_id, chunk_index),
                FOREIGN KEY (upload_id) REFERENCES app_snapshot_uploads(upload_id) ON DELETE CASCADE
            )
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_snapshot_chunks_upload
            ON app_snapshot_chunks(upload_id)
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS refund_history (
                id TEXT PRIMARY KEY,
                sku TEXT NOT NULL,
                raw_sku TEXT,
                date TEXT NOT NULL,
                amount NUMERIC,
                freight_amount NUMERIC,
                quantity NUMERIC,
                platform TEXT,
                reason TEXT,
                customer_reason TEXT,
                platform_reason TEXT,
                comments TEXT,
                comment_en TEXT,
                comment_cn TEXT,
                remarks TEXT,
                order_id TEXT,
                order_type TEXT,
                resend_base_order_id TEXT,
                status TEXT,
                logistic_partner TEXT,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS shipment_history (
                id TEXT PRIMARY KEY,
                sku TEXT NOT NULL,
                product_name TEXT,
                timestamp BIGINT,
                date TEXT NOT NULL,
                quantity NUMERIC,
                source TEXT,
                service TEXT,
                cost NUMERIC,
                updated_at TIMESTAMPTZ DEFAULT NOW()
            )
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_refund_sku 
            ON refund_history(sku)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_refund_date 
            ON refund_history(date)
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_shipment_sku 
            ON shipment_history(sku)
        `;

        // ── Ad Campaign tables ──
        await sql`
            CREATE TABLE IF NOT EXISTS ad_snapshots (
                id          TEXT PRIMARY KEY,
                platform    TEXT NOT NULL,
                week_start  TEXT NOT NULL,
                week_end    TEXT NOT NULL,
                data        JSONB NOT NULL,
                updated_at  TIMESTAMPTZ DEFAULT NOW()
            )
        `;

        await sql`
            CREATE INDEX IF NOT EXISTS idx_ad_snapshots_platform
            ON ad_snapshots(platform)
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS ad_roster_changes (
                id          TEXT PRIMARY KEY,
                platform    TEXT,
                week_of     TEXT,
                campaign    TEXT,
                ad_group    TEXT,
                sku         TEXT NOT NULL,
                action      TEXT NOT NULL,
                reason      TEXT,
                date        TEXT,
                updated_at  TIMESTAMPTZ DEFAULT NOW()
            )
        `;

        await sql`
            CREATE TABLE IF NOT EXISTS ad_budgets (
                id          INTEGER PRIMARY KEY,
                data        JSONB NOT NULL DEFAULT '{}',
                updated_at  TIMESTAMPTZ DEFAULT NOW()
            )
        `;

        await sql`
            INSERT INTO ad_budgets (id, data, updated_at)
            VALUES (1, '{}', NOW())
            ON CONFLICT (id) DO NOTHING
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
