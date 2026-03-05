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
    try {
        const sql = neon(process.env.NETLIFY_DATABASE_URL!);

        const refundRows = await sql`
            SELECT id, sku, raw_sku, date, amount, freight_amount,
                   quantity, platform, reason, customer_reason,
                   platform_reason, comments, comment_en, comment_cn,
                   remarks, order_id, order_type, resend_base_order_id,
                   status, logistic_partner
            FROM refund_history
            ORDER BY date DESC
        `;

        const shipmentRows = await sql`
            SELECT id, sku, product_name, timestamp, date,
                   quantity, source, service, cost
            FROM shipment_history
            ORDER BY date DESC
        `;

        const refunds = refundRows.map((r: any) => ({
            id: r.id,
            sku: r.sku,
            rawSku: r.raw_sku ?? undefined,
            date: r.date,
            amount: Number(r.amount) || 0,
            freightAmount: r.freight_amount != null
                ? Number(r.freight_amount) : undefined,
            quantity: Number(r.quantity) || 0,
            platform: r.platform ?? undefined,
            reason: r.reason ?? undefined,
            customerReason: r.customer_reason ?? undefined,
            platformReason: r.platform_reason ?? undefined,
            comments: r.comments ?? undefined,
            commentEn: r.comment_en ?? undefined,
            commentCn: r.comment_cn ?? undefined,
            remarks: r.remarks ?? undefined,
            orderId: r.order_id ?? undefined,
            orderType: r.order_type ?? undefined,
            resendBaseOrderId: r.resend_base_order_id ?? undefined,
            status: r.status ?? undefined,
            logisticPartner: r.logistic_partner ?? undefined
        }));

        const shipments = shipmentRows.map((s: any) => ({
            id: s.id,
            sku: s.sku,
            productName: s.product_name ?? undefined,
            timestamp: s.timestamp ? Number(s.timestamp) : undefined,
            date: s.date,
            quantity: Number(s.quantity) || 0,
            source: s.source ?? '',
            service: s.service ?? undefined,
            cost: s.cost != null ? Number(s.cost) : undefined
        }));

        return new Response(
            JSON.stringify({ success: true, refunds, shipments }),
            { status: 200, headers: CORS }
        );
    } catch (error: any) {
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: CORS }
        );
    }
};
