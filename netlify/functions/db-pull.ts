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
    if (req.method !== 'GET')
        return new Response(
            JSON.stringify({ success: false, error: 'Method not allowed' }),
            { status: 405, headers: CORS }
        );
    try {
        const url = new URL(req.url);
        const ifUpdatedSince = url.searchParams.get('ifUpdatedSince');
        const sql = neon(process.env.NETLIFY_DATABASE_URL!);
        const rows = await sql`
            SELECT data, updated_at FROM app_snapshot WHERE id = 1
        `;
        if (!rows || rows.length === 0)
            return new Response(
                JSON.stringify({ success: false, error: 'No data yet' }),
                { status: 404, headers: CORS }
            );
        const { data, updated_at } = rows[0];
        let parsed = {};
        try { parsed = typeof data === 'string' ? JSON.parse(data) : data; }
        catch { parsed = {}; }
        const forceFullPullToken = String((parsed as any)?.sync_control?.forceFullPullToken || '').trim();
        if (ifUpdatedSince && updated_at) {
            const clientTs = new Date(ifUpdatedSince);
            const serverTs = new Date(updated_at);
            if (!Number.isNaN(clientTs.getTime()) && !Number.isNaN(serverTs.getTime()) && serverTs <= clientTs) {
                return new Response(
                    JSON.stringify({ success: true, unchanged: true, lastUpdatedAt: updated_at, forceFullPullToken }),
                    { status: 200, headers: CORS }
                );
            }
        }
        return new Response(
            JSON.stringify({ success: true, snapshot: parsed, unchanged: false, lastUpdatedAt: updated_at, forceFullPullToken }),
            { status: 200, headers: CORS }
        );
    } catch (error: any) {
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: CORS }
        );
    }
};
