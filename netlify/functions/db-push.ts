
import { neon } from '@netlify/neon';
import bcrypt from 'bcryptjs';

/**
 * Netlify Function: db-push
 * Receives the full app state snapshot and persists it to the Neon database.
 * Requires admin authentication via bcrypt password verification.
 */
export default async (req: Request) => {
    // 1. Handle CORS (Optional but good practice for API consistency)
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    // 2. Filter Request Method
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), {
            status: 405,
            headers: corsHeaders
        });
    }

    try {
        const body = await req.json();
        const { password, snapshot } = body;

        // 3. Validation
        if (!password || !snapshot) {
            return new Response(JSON.stringify({ success: false, error: 'Missing password or snapshot' }), {
                status: 400,
                headers: corsHeaders
            });
        }

        const databaseUrl = process.env.NETLIFY_DATABASE_URL;
        const adminHash = process.env.ADMIN_PASSWORD_HASH;

        if (!databaseUrl || !adminHash) {
            throw new Error('Server configuration error (NETLIFY_DATABASE_URL or ADMIN_PASSWORD_HASH missing)');
        }

        // 4. Authenticate
        const isValid = await bcrypt.compare(password, adminHash);
        if (!isValid) {
            return new Response(JSON.stringify({ success: false, error: 'Unauthorised' }), {
                status: 401,
                headers: corsHeaders
            });
        }

        const sql = neon(databaseUrl);
        const snapshotStr = JSON.stringify(snapshot);
        const now = new Date().toISOString();

        // 5. Update Database
        // We use a transaction-like approach or sequential awaits
        // Upsert the snapshot
        await sql`
            INSERT INTO app_snapshot (id, data, updated_at, updated_by)
            VALUES (1, ${snapshotStr}, ${now}, 'admin')
            ON CONFLICT (id) DO UPDATE 
            SET data = EXCLUDED.data, 
                updated_at = EXCLUDED.updated_at
        `;

        // Update metadata
        await sql`
            INSERT INTO sync_metadata (id, last_push_at, push_count)
            VALUES (1, ${now}, 1)
            ON CONFLICT (id) DO UPDATE 
            SET last_push_at = EXCLUDED.last_push_at, 
                push_count = sync_metadata.push_count + 1
        `;

        return new Response(JSON.stringify({
            success: true,
            pushedAt: now
        }), {
            status: 200,
            headers: corsHeaders
        });

    } catch (error: any) {
        console.error('db-push error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal Server Error'
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
};
