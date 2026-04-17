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
        const url = new URL(req.url);
        const signaturesOnly = url.searchParams.get('signaturesOnly') === '1';
        const since = (url.searchParams.get('since') || '').trim();
        const hasSince = since.length > 0;

        const buildStableString = (value: any): string => {
            if (value === null || value === undefined) return 'null';
            if (Array.isArray(value)) return `[${value.map(buildStableString).join(',')}]`;
            if (typeof value === 'object') {
                const keys = Object.keys(value).sort();
                return `{${keys.map((k) => `${JSON.stringify(k)}:${buildStableString(value[k])}`).join(',')}}`;
            }
            return JSON.stringify(value);
        };
        const toHash = (raw: string): string => {
            let h1 = 0xdeadbeef;
            let h2 = 0x41c6ce57;
            for (let i = 0; i < raw.length; i++) {
                const ch = raw.charCodeAt(i);
                h1 = Math.imul(h1 ^ ch, 2654435761);
                h2 = Math.imul(h2 ^ ch, 1597334677);
            }
            h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
            h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
            return `${(h2 >>> 0).toString(16).padStart(8, '0')}${(h1 >>> 0).toString(16).padStart(8, '0')}`;
        };
        const normalizeRefund = (r: any) => ({
            id: r.id,
            sku: r.sku,
            rawSku: r.raw_sku ?? null,
            date: (r.date || '').split('T')[0],
            amount: r.amount == null ? null : Number(r.amount),
            freightAmount: r.freight_amount == null ? null : Number(r.freight_amount),
            quantity: r.quantity == null ? null : Number(r.quantity),
            platform: r.platform ?? null,
            reason: r.reason ?? null,
            customerReason: r.customer_reason ?? null,
            platformReason: r.platform_reason ?? null,
            comments: r.comments ?? null,
            commentEn: r.comment_en ?? null,
            commentCn: r.comment_cn ?? null,
            remarks: r.remarks ?? null,
            orderId: r.order_id ?? null,
            orderType: r.order_type ?? null,
            resendBaseOrderId: r.resend_base_order_id ?? null,
            status: r.status ?? null,
            logisticPartner: r.logistic_partner ?? null
        });
        const hashRefund = (r: any): string => (
            toHash(buildStableString(normalizeRefund(r)))
        );

        const latestRows = await sql`SELECT MAX(updated_at) AS latest_updated_at FROM refund_history`;
        const latestUpdatedAt = latestRows?.[0]?.latest_updated_at
            ? new Date(latestRows[0].latest_updated_at).toISOString()
            : null;

        if (signaturesOnly) {
            const rows = await sql`
                SELECT id, sku, raw_sku, date, amount, freight_amount,
                       quantity, platform, reason, customer_reason,
                       platform_reason, comments, comment_en, comment_cn,
                       remarks, order_id, order_type, resend_base_order_id,
                       status, logistic_partner
                FROM refund_history
            `;
            const signatures = rows.map((r: any) => ({
                id: String(r.id),
                rowHash: hashRefund(r)
            }));
            return new Response(
                JSON.stringify({
                    success: true,
                    signatures,
                    totalRows: signatures.length,
                    latestUpdatedAt
                }),
                { status: 200, headers: CORS }
            );
        }

        const refundRows = hasSince
            ? await sql`
                SELECT id, sku, raw_sku, date, amount, freight_amount,
                       quantity, platform, reason, customer_reason,
                       platform_reason, comments, comment_en, comment_cn,
                       remarks, order_id, order_type, resend_base_order_id,
                       status, logistic_partner
                FROM refund_history
                WHERE updated_at > ${since}::timestamptz
                ORDER BY date DESC
            `
            : await sql`
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
            JSON.stringify({
                success: true,
                refunds,
                shipments,
                incremental: hasSince,
                latestUpdatedAt
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
