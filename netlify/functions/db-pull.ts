
import { neon } from '@netlify/neon';

/**
 * Netlify Function: db-pull
 * Retrieves the latest persistent application state from the Neon database.
 * This is publicly accessible (read-only) to allow clients to sync local state with the global Truth.
 */
export default async (req: Request) => {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (req.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    if (req.method !== 'GET') {
        return new Response(JSON.stringify({ success: false, error: 'Method Not Allowed' }), {
            status: 405,
            headers: corsHeaders
        });
    }

    try {
        const databaseUrl = process.env.NETLIFY_DATABASE_URL;

        if (!databaseUrl) {
            throw new Error('NETLIFY_DATABASE_URL environment variable is not set');
        }

        const sql = neon(databaseUrl);

        // Fetch the singleton snapshot row
        const rows = await sql`
            SELECT data, updated_at 
            FROM app_snapshot 
            WHERE id = 1
        `;

        if (!rows || rows.length === 0) {
            return new Response(JSON.stringify({
                success: false,
                error: 'No data available yet'
            }), {
                status: 404,
                headers: corsHeaders
            });
        }

        const { data, updated_at } = rows[0];

        // The data column is stored as a JSON string in our schema
        let parsedData = {};
        try {
            parsedData = JSON.parse(data);
        } catch (e) {
            console.error('Failed to parse snapshot data:', e);
            // If it's already an object (Neon sometimes returns JSON columns as objects depending on driver config), use as is
            parsedData = typeof data === 'object' ? data : {};
        }

        return new Response(JSON.stringify({
            success: true,
            snapshot: parsedData,
            lastUpdatedAt: updated_at
        }), {
            status: 200,
            headers: corsHeaders
        });

    } catch (error: any) {
        console.error('db-pull error:', error);
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Internal Server Error'
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
};
