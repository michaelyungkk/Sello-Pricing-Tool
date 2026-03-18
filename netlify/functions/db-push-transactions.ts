import { neon } from '@netlify/neon';
import bcrypt from 'bcryptjs';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

export default async (req: Request) => {
    if (req.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'POST')
        return new Response(
            JSON.stringify({ success: false, error: 'Method not allowed' }),
            { status: 405, headers: CORS }
        );
    try {
        const body = await req.json();
        const { password, transactions, clearAll, chunkIndex, totalChunks } = body;

        const hash = process.env.ADMIN_PASSWORD_HASH;
        const dbUrl = process.env.NETLIFY_DATABASE_URL_UNPOOLED || process.env.NETLIFY_DATABASE_URL;
        if (!hash || !dbUrl) throw new Error('Server config error');

        const valid = await bcrypt.compare(password, hash);
        if (!valid)
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorised' }),
                { status: 401, headers: CORS }
            );

        const sql = neon(dbUrl);

        if (clearAll === true) {
            await sql`DELETE FROM transaction_history`;
            return new Response(
                JSON.stringify({ success: true, cleared: true }),
                { status: 200, headers: CORS }
            );
        }

        if (!Array.isArray(transactions))
            return new Response(
                JSON.stringify({ success: false, error: 'transactions must be array' }),
                { status: 400, headers: CORS }
            );

        if (transactions.length === 0) {
            return new Response(
                JSON.stringify({ success: true, chunkIndex, totalChunks, upsertedCount: 0 }),
                { status: 200, headers: CORS }
            );
        }

        const rows = transactions.map((tx: any) => {
            // Composite key must match salesImportWorker.ts dailyKey exactly:
            // sku|date|platform|orderId  (or sku|date|platform if no orderId)
            // This ensures DB dedup aligns with how records are bucketed in memory.
            // Old key (sku|orderId) was missing date+platform, causing collisions.
            const date = (tx.date || '').split('T')[0];
            const platform = tx.platform || 'General';
            const dedupKey = tx.orderId
                ? `${tx.sku}|${date}|${platform}|${tx.orderId}`
                : `${tx.sku}|${date}|${platform}`;
            return {
                id: dedupKey,  // always deterministic — never use random log-{ts} ids
                sku: tx.sku,
                date: (tx.date || '').split('T')[0],
                price: tx.price ?? null,
                velocity: tx.velocity ?? null,
                margin: tx.margin ?? null,
                profit: tx.profit ?? null,
                ads_spend: tx.adsSpend ?? null,
                raw_ads_spend: tx.rawAdsSpend ?? null,
                platform: tx.platform || 'General',
                order_id: tx.orderId ?? null,
                postcode: tx.postcode ?? null,
                logistic_partner: tx.logisticPartner ?? null,
                logistic_service: tx.logisticService ?? null,
                real_postage: tx.realPostage ?? null,
                real_extra_freight: tx.realExtraFreight ?? null,
                dedup_key: dedupKey
            };
        });

        const placeholders = rows.map((_: any, i: number) => {
            const b = i * 17;
            return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17},NOW())`;
        }).join(',');

        const flatValues = rows.flatMap((r: any) => [
            r.id, r.sku, r.date, r.price, r.velocity, r.margin, r.profit,
            r.ads_spend, r.raw_ads_spend, r.platform, r.order_id,
            r.postcode, r.logistic_partner, r.logistic_service,
            r.real_postage, r.real_extra_freight, r.dedup_key
        ]);

        await sql.query(`
            INSERT INTO transaction_history (
                id, sku, date, price, velocity, margin, profit,
                ads_spend, raw_ads_spend, platform, order_id,
                postcode, logistic_partner, logistic_service,
                real_postage, real_extra_freight, dedup_key, updated_at
            ) VALUES ${placeholders}
            ON CONFLICT (dedup_key) DO UPDATE SET
                id = EXCLUDED.id,
                price = EXCLUDED.price,
                velocity = EXCLUDED.velocity,
                margin = EXCLUDED.margin,
                profit = EXCLUDED.profit,
                ads_spend = EXCLUDED.ads_spend,
                raw_ads_spend = EXCLUDED.raw_ads_spend,
                platform = EXCLUDED.platform,
                order_id = EXCLUDED.order_id,
                logistic_partner = EXCLUDED.logistic_partner,
                logistic_service = EXCLUDED.logistic_service,
                real_postage = EXCLUDED.real_postage,
                real_extra_freight = EXCLUDED.real_extra_freight,
                updated_at = NOW()
        `, flatValues);

        console.log(`[db-push-transactions] chunk ${chunkIndex}/${totalChunks} — ${rows.length} rows upserted`);

        return new Response(
            JSON.stringify({ success: true, chunkIndex, totalChunks, upsertedCount: rows.length }),
            { status: 200, headers: CORS }
        );
    } catch (error: any) {
        console.error('[db-push-transactions] error:', error.message);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: CORS }
        );
    }
};
