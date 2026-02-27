import { neon } from '@netlify/neon';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

export default async (req: Request) => {
    if (req.method === 'OPTIONS')
        return new Response(null, { status: 204, headers: CORS });
    if (req.method !== 'GET')
        return new Response(
            JSON.stringify({ success: false, error: 'Method not allowed' }),
            { status: 405, headers: CORS }
        );
    try {
        const url = new URL(req.url);
        const page = parseInt(url.searchParams.get('page') || '0');
        const pageSize = parseInt(url.searchParams.get('pageSize') || '2000');
        const offset = page * pageSize;

        const sql = neon(process.env.NETLIFY_DATABASE_URL!);

        // Get total count on first page only
        let totalRows = 0;
        if (page === 0) {
            const countRes = await sql`
                SELECT COUNT(*) as total FROM transaction_history
            `;
            totalRows = Number(countRes[0]?.total || 0);
        }

        const rows = await sql`
            SELECT id, sku, date, price, velocity, margin, profit,
                   ads_spend, raw_ads_spend, platform, order_id,
                   postcode, logistic_partner, logistic_service,
                   real_postage, real_extra_freight
            FROM transaction_history
            ORDER BY date DESC, id DESC
            LIMIT ${pageSize} OFFSET ${offset}
        `;

        const transactions = rows.map(r => ({
            id: r.id,
            sku: r.sku,
            date: r.date,
            price: Number(r.price) || 0,
            velocity: Number(r.velocity) || 0,
            margin: Number(r.margin) || 0,
            profit: r.profit != null ? Number(r.profit) : undefined,
            adsSpend: r.ads_spend != null ? Number(r.ads_spend) : undefined,
            rawAdsSpend: r.raw_ads_spend != null ? Number(r.raw_ads_spend) : undefined,
            platform: r.platform ?? undefined,
            orderId: r.order_id ?? undefined,
            postcode: r.postcode ?? undefined,
            logisticPartner: r.logistic_partner ?? undefined,
            logisticService: r.logistic_service ?? undefined,
            realPostage: r.real_postage != null ? Number(r.real_postage) : undefined,
            realExtraFreight: r.real_extra_freight != null
                ? Number(r.real_extra_freight) : undefined
        }));

        return new Response(
            JSON.stringify({
                success: true,
                transactions,
                page,
                pageSize,
                totalRows,
                hasMore: rows.length === pageSize
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
