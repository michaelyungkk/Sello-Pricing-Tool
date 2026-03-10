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
        const body = await req.text();
        const bodyBytes = new TextEncoder().encode(body).length;
        console.log(`[db-push] incoming payload: ${(bodyBytes / 1024 / 1024).toFixed(2)}MB`);

        // Hard reject oversized payloads before attempting parse
        const LIMIT = 6 * 1024 * 1024;
        if (bodyBytes > LIMIT) {
            console.error(`[db-push] payload too large: ${(bodyBytes / 1024 / 1024).toFixed(2)}MB`);
            return new Response(
                JSON.stringify({ success: false, error: `Payload too large: ${(bodyBytes / 1024 / 1024).toFixed(2)}MB (limit 6MB)` }),
                { status: 413, headers: CORS }
            );
        }

        const { password, snapshot } = JSON.parse(body);
        if (!password || !snapshot)
            return new Response(
                JSON.stringify({ success: false, error: 'Missing fields' }),
                { status: 400, headers: CORS }
            );

        const hash = process.env.ADMIN_PASSWORD_HASH;
        const dbUrl = process.env.NETLIFY_DATABASE_URL_UNPOOLED || process.env.NETLIFY_DATABASE_URL;
        if (!hash || !dbUrl) {
            console.error('[db-push] missing env vars — ADMIN_PASSWORD_HASH or NETLIFY_DATABASE_URL not set');
            throw new Error('Server config error: missing environment variables');
        }

        const valid = await bcrypt.compare(password, hash);
        if (!valid)
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorised' }),
                { status: 401, headers: CORS }
            );

        const sql = neon(dbUrl);
        const now = new Date().toISOString();
        const snapshotJson = JSON.stringify(snapshot);

        console.log(`[db-push] writing snapshot: ${(new TextEncoder().encode(snapshotJson).length / 1024).toFixed(0)}KB`);

        await sql`
            INSERT INTO app_snapshot (id, data, updated_at, updated_by)
            VALUES (1, ${snapshotJson}, ${now}, 'admin')
            ON CONFLICT (id) DO UPDATE
            SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at
        `;
        await sql`
            INSERT INTO sync_metadata (id, last_push_at, push_count)
            VALUES (1, ${now}, 1)
            ON CONFLICT (id) DO UPDATE
            SET last_push_at = EXCLUDED.last_push_at,
                push_count = sync_metadata.push_count + 1
        `;

        console.log(`[db-push] success at ${now}`);

        return new Response(
            JSON.stringify({ success: true, pushedAt: now }),
            { status: 200, headers: CORS }
        );
    } catch (error: any) {
        console.error('[db-push] error:', error.message, error.stack);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: CORS }
        );
    }
};
