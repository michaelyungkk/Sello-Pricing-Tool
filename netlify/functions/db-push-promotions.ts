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
        const { password, promotions } = await req.json();
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

        console.log(`[db-push-promotions] received: ${promotions?.length ?? 0} promotions`);

        // Full replace — delete all then insert (promotions list is owned by admin)
        await sql`DELETE FROM promotions`;

        if (Array.isArray(promotions) && promotions.length > 0) {
            const BATCH = 100;
            for (let i = 0; i < promotions.length; i += BATCH) {
                const batch = promotions.slice(i, i + BATCH);
                for (const promo of batch) {
                    await sql`
                        INSERT INTO promotions (id, data, updated_at)
                        VALUES (${promo.id}, ${JSON.stringify(promo)}, NOW())
                        ON CONFLICT (id) DO UPDATE
                        SET data = EXCLUDED.data, updated_at = NOW()
                    `;
                }
            }
        }

        console.log(`[db-push-promotions] ${promotions?.length ?? 0} promotions saved`);

        return new Response(
            JSON.stringify({ success: true, count: promotions?.length || 0 }),
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
