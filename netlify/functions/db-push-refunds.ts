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
        const { password, refunds, forceClear } = await req.json();
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
        console.log(`[db-push-refunds] received: ${refunds?.length ?? 0} refunds`);

        if (forceClear === true) {
            await sql`DELETE FROM refund_history`;
        }
        if (Array.isArray(refunds) && refunds.length > 0) {
            const BATCH = 200;
            for (let i = 0; i < refunds.length; i += BATCH) {
                const batch = refunds.slice(i, i + BATCH);
                const placeholders = batch.map((_: any, j: number) => {
                    const b = j * 20;
                    return `($${b+1},$${b+2},$${b+3},$${b+4},$${b+5},$${b+6},$${b+7},$${b+8},$${b+9},$${b+10},$${b+11},$${b+12},$${b+13},$${b+14},$${b+15},$${b+16},$${b+17},$${b+18},$${b+19},$${b+20},NOW())`;
                }).join(',');
                const values = batch.flatMap((r: any) => [
                    r.id || `${r.sku}|${r.orderId || r.date}`,
                    r.sku, r.rawSku ?? null,
                    (r.date || '').split('T')[0],
                    r.amount ?? null, r.freightAmount ?? null,
                    r.quantity ?? null, r.platform ?? null,
                    r.reason ?? null, r.customerReason ?? null,
                    r.platformReason ?? null, r.comments ?? null,
                    r.commentEn ?? null, r.commentCn ?? null,
                    r.remarks ?? null, r.orderId ?? null,
                    r.orderType ?? null, r.resendBaseOrderId ?? null,
                    r.status ?? null, r.logisticPartner ?? null
                ]);
                await sql.query(`
                    INSERT INTO refund_history (
                        id, sku, raw_sku, date, amount, freight_amount,
                        quantity, platform, reason, customer_reason,
                        platform_reason, comments, comment_en, comment_cn,
                        remarks, order_id, order_type, resend_base_order_id,
                        status, logistic_partner, updated_at
                    ) VALUES ${placeholders}
                    ON CONFLICT (id) DO UPDATE SET
                        sku = EXCLUDED.sku,
                        amount = EXCLUDED.amount,
                        quantity = EXCLUDED.quantity,
                        raw_sku = EXCLUDED.raw_sku,
                        date = EXCLUDED.date,
                        freight_amount = EXCLUDED.freight_amount,
                        platform = EXCLUDED.platform,
                        reason = EXCLUDED.reason,
                        customer_reason = EXCLUDED.customer_reason,
                        platform_reason = EXCLUDED.platform_reason,
                        comments = EXCLUDED.comments,
                        comment_en = EXCLUDED.comment_en,
                        comment_cn = EXCLUDED.comment_cn,
                        remarks = EXCLUDED.remarks,
                        order_id = EXCLUDED.order_id,
                        order_type = EXCLUDED.order_type,
                        resend_base_order_id = EXCLUDED.resend_base_order_id,
                        status = EXCLUDED.status,
                        logistic_partner = EXCLUDED.logistic_partner,
                        updated_at = NOW()
                `, values);
            }
        }
        console.log(`[db-push-refunds] ${refunds?.length ?? 0} refunds saved`);

        return new Response(
            JSON.stringify({ success: true, refundCount: refunds?.length || 0 }),
            { status: 200, headers: CORS }
        );
    } catch (error: any) {
        console.error('[db-push-refunds] error:', error.message);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: CORS }
        );
    }
};
