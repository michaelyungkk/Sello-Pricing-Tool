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
        const hashPromotion = (promotion: any): string => (
            toHash(buildStableString(promotion))
        );

        // Ensure table exists (safe to call repeatedly)
        await sql`
            CREATE TABLE IF NOT EXISTS promotions (
                id          TEXT PRIMARY KEY,
                data        JSONB NOT NULL,
                updated_at  TIMESTAMPTZ DEFAULT NOW()
            )
        `;

        const latestRows = await sql`SELECT MAX(updated_at) AS latest_updated_at FROM promotions`;
        const latestUpdatedAt = latestRows?.[0]?.latest_updated_at
            ? new Date(latestRows[0].latest_updated_at).toISOString()
            : null;

        if (signaturesOnly) {
            const rows = await sql`SELECT id, data FROM promotions`;
            const signatures = rows.map((r: any) => ({
                id: String(r.id),
                rowHash: hashPromotion(r.data)
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

        const rows = hasSince
            ? await sql`
                SELECT data
                FROM promotions
                WHERE updated_at > ${since}::timestamptz
                ORDER BY updated_at DESC
            `
            : await sql`
                SELECT data
                FROM promotions
                ORDER BY updated_at DESC
            `;
        const promotions = rows.map((r: any) => r.data);

        console.log(`[db-pull-promotions] returning ${promotions.length} promotions`);

        return new Response(
            JSON.stringify({
                success: true,
                promotions,
                incremental: hasSince,
                latestUpdatedAt
            }),
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
