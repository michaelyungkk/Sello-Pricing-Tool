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
        const dbUrl = process.env.NETLIFY_DATABASE_URL_UNPOOLED || process.env.NETLIFY_DATABASE_URL;
        if (!dbUrl) throw new Error('Server config error');

        const sql = neon(dbUrl);

        // Ensure table exists (safe to call repeatedly)
        await sql`
            CREATE TABLE IF NOT EXISTS promotions (
                id          TEXT PRIMARY KEY,
                data        JSONB NOT NULL,
                updated_at  TIMESTAMPTZ DEFAULT NOW()
            )
        `;

        const rows = await sql`SELECT data FROM promotions ORDER BY updated_at DESC`;
        const promotions = rows.map((r: any) => r.data);

        console.log(`[db-pull-promotions] returning ${promotions.length} promotions`);

        return new Response(
            JSON.stringify({ success: true, promotions }),
            { status: 200, headers: CORS }
        );
    } catch (error: any) {
        console.error('[db-pull-promotions] error:', error.message);
        return new Response(
            JSON.stringify({ success: false, promotions: [], error: error.message }),
            { status: 500, headers: CORS }
        );
    }
};
