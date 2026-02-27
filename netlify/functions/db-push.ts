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
        const { password, snapshot } = await req.json();
        if (!password || !snapshot)
            return new Response(
                JSON.stringify({ success: false, error: 'Missing fields' }),
                { status: 400, headers: CORS }
            );
        const hash = process.env.ADMIN_PASSWORD_HASH;
        const dbUrl = process.env.NETLIFY_DATABASE_URL;
        if (!hash || !dbUrl) throw new Error('Server config error');
        const valid = await bcrypt.compare(password, hash);
        if (!valid)
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorised' }),
                { status: 401, headers: CORS }
            );
        const sql = neon(dbUrl);
        const now = new Date().toISOString();
        await sql`
            INSERT INTO app_snapshot (id, data, updated_at, updated_by)
            VALUES (1, ${JSON.stringify(snapshot)}, ${now}, 'admin')
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
        return new Response(
            JSON.stringify({ success: true, pushedAt: now }),
            { status: 200, headers: CORS }
        );
    } catch (error: any) {
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: CORS }
        );
    }
};
