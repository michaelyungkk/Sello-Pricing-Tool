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
        const since = url.searchParams.get('since') || null; // ISO date string for incremental sync
        const afterDate = url.searchParams.get('afterDate') || null;
        const afterId = url.searchParams.get('afterId') || null;
        const offset = page * pageSize;

        const dbUrl = process.env.NETLIFY_DATABASE_URL_UNPOOLED || process.env.NETLIFY_DATABASE_URL;
        if (!dbUrl) throw new Error('Server config error');
        const sql = neon(dbUrl);

        // Get total count on first page only
        let totalRows = 0;
        if (page === 0) {
            const countRes = since
                ? await sql`SELECT COUNT(*) as total FROM transaction_history WHERE date > ${since}`
                : await sql`SELECT COUNT(*) as total FROM transaction_history`;
            totalRows = Number(countRes[0]?.total || 0);
        }

        const useCursor = Boolean(afterDate && afterId);
        const rows = useCursor
            ? (
                since
                    ? await sql`
                        SELECT id, sku, date, price, velocity, margin, profit,
                               ads_spend, raw_ads_spend, platform, order_id,
                               postcode, logistic_partner, logistic_service,
                               real_postage, real_extra_freight,
                               cogs, selling_fee, ads_fee, postage, other_fee,
                               subscription_fee, wms_fee, promo_rel
                        FROM transaction_history
                        WHERE date > ${since}
                          AND (
                            date < ${afterDate}
                            OR (date = ${afterDate} AND id < ${afterId})
                          )
                        ORDER BY date DESC, id DESC
                        LIMIT ${pageSize}
                      `
                    : await sql`
                        SELECT id, sku, date, price, velocity, margin, profit,
                               ads_spend, raw_ads_spend, platform, order_id,
                               postcode, logistic_partner, logistic_service,
                               real_postage, real_extra_freight,
                               cogs, selling_fee, ads_fee, postage, other_fee,
                               subscription_fee, wms_fee, promo_rel
                        FROM transaction_history
                        WHERE (
                            date < ${afterDate}
                            OR (date = ${afterDate} AND id < ${afterId})
                        )
                        ORDER BY date DESC, id DESC
                        LIMIT ${pageSize}
                      `
            )
            : (
                since
                    ? await sql`
                        SELECT id, sku, date, price, velocity, margin, profit,
                               ads_spend, raw_ads_spend, platform, order_id,
                               postcode, logistic_partner, logistic_service,
                               real_postage, real_extra_freight,
                               cogs, selling_fee, ads_fee, postage, other_fee,
                               subscription_fee, wms_fee, promo_rel
                        FROM transaction_history
                        WHERE date > ${since}
                        ORDER BY date DESC, id DESC
                        LIMIT ${pageSize} OFFSET ${offset}
                      `
                    : await sql`
                        SELECT id, sku, date, price, velocity, margin, profit,
                               ads_spend, raw_ads_spend, platform, order_id,
                               postcode, logistic_partner, logistic_service,
                               real_postage, real_extra_freight,
                               cogs, selling_fee, ads_fee, postage, other_fee,
                               subscription_fee, wms_fee, promo_rel
                        FROM transaction_history
                        ORDER BY date DESC, id DESC
                        LIMIT ${pageSize} OFFSET ${offset}
                      `
            );

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
                ? Number(r.real_extra_freight) : undefined,
            cogs: r.cogs != null ? Number(r.cogs) : undefined,
            sellingFee: r.selling_fee != null ? Number(r.selling_fee) : undefined,
            adsFee: r.ads_fee != null ? Number(r.ads_fee) : undefined,
            postage: r.postage != null ? Number(r.postage) : undefined,
            otherFee: r.other_fee != null ? Number(r.other_fee) : undefined,
            subscriptionFee: r.subscription_fee != null ? Number(r.subscription_fee) : undefined,
            wmsFee: r.wms_fee != null ? Number(r.wms_fee) : undefined,
            promoRel: r.promo_rel != null ? Number(r.promo_rel) : undefined
        }));

        const lastRow = rows.length > 0 ? rows[rows.length - 1] : null;
        const nextCursor = rows.length === pageSize && lastRow
            ? {
                afterDate: lastRow.date,
                afterId: lastRow.id
            }
            : null;

        return new Response(
            JSON.stringify({
                success: true,
                transactions,
                page,
                pageSize,
                totalRows,
                hasMore: rows.length === pageSize,
                nextCursor
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
