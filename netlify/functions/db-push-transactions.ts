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
        const dbUrl = process.env.NETLIFY_DATABASE_URL;
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

        const BATCH_SIZE = 50;
        let upsertedCount = 0;

        for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
            const batch = transactions.slice(i, i + BATCH_SIZE);

            try {
                // Build rows with dedup keys
                const rows = batch.map(tx => ({
                    id: tx.id || (tx.orderId
                        ? `${tx.sku}|${tx.orderId}`
                        : `${tx.sku}|${(tx.date || '').split('T')[0]}|${tx.platform || 'General'}`),
                    sku: tx.sku,
                    date: (tx.date || '').split('T')[0],
                    price: tx.price ?? null,
                    velocity: tx.velocity ?? null,
                    margin: tx.margin ?? null,
                    profit: tx.profit ?? null,
                    ads_spend: tx.adsSpend ?? null,
                    raw_ads_spend: tx.rawAdsSpend ?? null,
                    platform: tx.platform ?? null,
                    order_id: tx.orderId ?? null,
                    postcode: tx.postcode ?? null,
                    logistic_partner: tx.logisticPartner ?? null,
                    logistic_service: tx.logisticService ?? null,
                    real_postage: tx.realPostage ?? null,
                    real_extra_freight: tx.realExtraFreight ?? null,
                    dedup_key: tx.orderId
                        ? `${tx.sku}|${tx.orderId}`
                        : `${tx.sku}|${(tx.date || '').split('T')[0]}|${tx.platform || 'General'}`
                }));

                for (const row of rows) {
                    await sql`
                        INSERT INTO transaction_history (
                            id, sku, date, price, velocity, margin, profit,
                            ads_spend, raw_ads_spend, platform, order_id,
                            postcode, logistic_partner, logistic_service,
                            real_postage, real_extra_freight, dedup_key, updated_at
                        ) VALUES (
                            ${row.id}, ${row.sku}, ${row.date},
                            ${row.price}, ${row.velocity}, ${row.margin}, ${row.profit},
                            ${row.ads_spend}, ${row.raw_ads_spend}, ${row.platform},
                            ${row.order_id}, ${row.postcode}, ${row.logistic_partner},
                            ${row.logistic_service}, ${row.real_postage}, 
                            ${row.real_extra_freight}, ${row.dedup_key}, NOW()
                        )
                        ON CONFLICT (dedup_key) DO UPDATE SET
                            price = EXCLUDED.price,
                            velocity = EXCLUDED.velocity,
                            margin = EXCLUDED.margin,
                            profit = EXCLUDED.profit,
                            ads_spend = EXCLUDED.ads_spend,
                            raw_ads_spend = EXCLUDED.raw_ads_spend,
                            updated_at = NOW()
                    `;
                    upsertedCount++;
                }
            } catch (batchErr) {
                console.error(`Batch ${i}-${i + BATCH_SIZE} error:`, batchErr);
            }
        }

        return new Response(
            JSON.stringify({
                success: true,
                chunkIndex,
                totalChunks,
                upsertedCount
            }),
            { status: 200, headers: CORS }
        );
    } catch (error: any) {
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: CORS }
        );
    }
};
