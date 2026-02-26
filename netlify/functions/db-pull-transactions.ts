
import { neon } from '@netlify/neon';

/**
 * Netlify Function: db-pull-transactions
 * Retrieves all granular transaction history records from the Neon database.
 */
export default async (req: Request) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), {
            status: 405,
            headers: corsHeaders
        });
    }

    try {
        const databaseUrl = process.env.NETLIFY_DATABASE_URL;

        if (!databaseUrl) {
            throw new Error('NETLIFY_DATABASE_URL environment variable is not set');
        }

        const sql = neon(databaseUrl);

        const rows = await sql`
            SELECT id, sku, date, price, velocity, margin, profit,
                   ads_spend, raw_ads_spend, platform, order_id, 
                   postcode, logistic_partner, logistic_service,
                   real_postage, real_extra_freight
            FROM transaction_history
            ORDER BY date DESC
        `;

        const transactions = (rows || []).map(row => ({
            id: row.id,
            sku: row.sku,
            date: row.date,
            price: Number(row.price) || 0,
            velocity: Number(row.velocity) || 0,
            margin: Number(row.margin) || 0,
            profit: row.profit !== null ? Number(row.profit) : undefined,
            adsSpend: row.ads_spend !== null ? Number(row.ads_spend) : undefined,
            rawAdsSpend: row.raw_ads_spend !== null ? Number(row.raw_ads_spend) : undefined,
            platform: row.platform || undefined,
            orderId: row.order_id || undefined,
            postcode: row.postcode || undefined,
            logisticPartner: row.logistic_partner || undefined,
            logisticService: row.logistic_service || undefined,
            realPostage: row.real_postage !== null ? Number(row.real_postage) : undefined,
            realExtraFreight: row.real_extra_freight !== null ? Number(row.real_extra_freight) : undefined
        }));

        return new Response(JSON.stringify({
            success: true,
            transactions,
            count: transactions.length
        }), {
            status: 200,
            headers: corsHeaders
        });

    } catch (error: any) {
        console.error('db-pull-transactions error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal Server Error'
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
};
