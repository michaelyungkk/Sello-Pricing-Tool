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
        const { password, promotions, forceClear } = await req.json();
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

        // Ensure table exists
        await sql`
            CREATE TABLE IF NOT EXISTS promotions (
                id          TEXT PRIMARY KEY,
                data        JSONB NOT NULL,
                updated_at  TIMESTAMPTZ DEFAULT NOW()
            )
        `;

        const incomingPromotions = Array.isArray(promotions) ? promotions : [];
        console.log(`[db-push-promotions] received: ${incomingPromotions.length} promotions`);

        if (incomingPromotions.length === 0 && forceClear !== true) {
            return new Response(
                JSON.stringify({ success: false, error: 'Refusing empty promotions payload without forceClear=true' }),
                { status: 400, headers: CORS }
            );
        }

        // Full replace — delete all then insert (promotions list is owned by admin)
        // Run as a transaction so partial failures cannot leave the table empty.
        await sql`BEGIN`;
        try {
            await sql`DELETE FROM promotions`;

            if (incomingPromotions.length > 0) {
                const BATCH = 100;
                for (let i = 0; i < incomingPromotions.length; i += BATCH) {
                    const batch = incomingPromotions.slice(i, i + BATCH);
                    for (const promo of batch) {
                        const promoId = String(promo?.id || '').trim();
                        if (!promoId) throw new Error('Promotion is missing required id');
                        await sql`
                            INSERT INTO promotions (id, data, updated_at)
                            VALUES (${promoId}, ${JSON.stringify(promo)}, NOW())
                            ON CONFLICT (id) DO UPDATE
                            SET data = EXCLUDED.data, updated_at = NOW()
                        `;
                    }
                }
            }
            await sql`COMMIT`;
        } catch (txError: any) {
            await sql`ROLLBACK`;
            throw txError;
        }

        console.log(`[db-push-promotions] ${incomingPromotions.length} promotions saved`);

        return new Response(
            JSON.stringify({ success: true, count: incomingPromotions.length }),
            { status: 200, headers: CORS }
        );
    } catch (error: any) {
        console.error('[db-push-promotions] error:', error.message);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: CORS }
        );
    }
};
