
import { neon } from '@netlify/neon';
import bcrypt from 'bcryptjs';

/**
 * Netlify Function: db-push-transactions
 * Receives a chunk of transaction history and upserts it into the Neon database.
 * Uses a unique dedup_key based on SKU, OrderID, or Date/Platform.
 */
export default async (req: Request) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), {
            status: 405,
            headers: corsHeaders
        });
    }

    try {
        const body = await req.json();
        const { password, transactions, chunkIndex, totalChunks, clearAll } = body;

        if (!password || (!Array.isArray(transactions) && !clearAll)) {
            return new Response(JSON.stringify({ success: false, error: 'Missing password or transactions' }), {
                status: 400,
                headers: corsHeaders
            });
        }

        const databaseUrl = process.env.NETLIFY_DATABASE_URL;
        const adminHash = process.env.ADMIN_PASSWORD_HASH;

        if (!databaseUrl || !adminHash) {
            throw new Error('Server configuration error (NETLIFY_DATABASE_URL or ADMIN_PASSWORD_HASH missing)');
        }

        // 1. Authenticate
        const isValid = await bcrypt.compare(password, adminHash);
        if (!isValid) {
            return new Response(JSON.stringify({ success: false, error: 'Unauthorised' }), {
                status: 401,
                headers: corsHeaders
            });
        }

        const sql = neon(databaseUrl);

        // 2. Handle Clear All
        if (clearAll) {
            await sql`DELETE FROM transaction_history`;
            return new Response(JSON.stringify({
                success: true,
                message: 'All transactions cleared'
            }), {
                status: 200,
                headers: corsHeaders
            });
        }

        let upsertedCount = 0;

        // 3. Map and Upsert in a loop
        const dataToProcess = Array.isArray(transactions) ? transactions : [];
        for (const t of dataToProcess) {
            const sku = t.sku;
            const orderId = t.orderId || '';
            const dateStr = t.date.split('T')[0];
            const platform = t.platform || 'General';

            // Compute dedup_key
            const dedupKey = orderId
                ? `${sku}|${orderId}`
                : `${sku}|${dateStr}|${platform}`;

            const id = t.id || `t-${Math.random().toString(36).substr(2, 9)}`;

            await sql`
                INSERT INTO transaction_history (
                    id, sku, date, price, velocity, margin, profit,
                    ads_spend, raw_ads_spend, platform, order_id, postcode,
                    logistic_partner, logistic_service, real_postage,
                    real_extra_freight, dedup_key, updated_at
                ) VALUES (
                    ${id}, 
                    ${sku}, 
                    ${dateStr}, 
                    ${t.price || 0}, 
                    ${t.velocity || 0}, 
                    ${t.margin || 0}, 
                    ${t.profit || 0}, 
                    ${t.adsSpend || 0}, 
                    ${t.rawAdsSpend || 0}, 
                    ${platform}, 
                    ${orderId}, 
                    ${t.postcode || ''}, 
                    ${t.logisticPartner || ''}, 
                    ${t.logisticService || ''}, 
                    ${t.realPostage || 0}, 
                    ${t.realExtraFreight || 0}, 
                    ${dedupKey}, 
                    NOW()
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

        return new Response(JSON.stringify({
            success: true,
            chunkIndex,
            totalChunks,
            upsertedCount
        }), {
            status: 200,
            headers: corsHeaders
        });

    } catch (error: any) {
        console.error('db-push-transactions error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal Server Error'
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
};
