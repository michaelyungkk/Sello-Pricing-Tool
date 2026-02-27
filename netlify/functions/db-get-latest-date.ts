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
        const sql = neon(process.env.NETLIFY_DATABASE_URL!);
        const rows = await sql`
            SELECT MAX(date) as latest_date, COUNT(*) as total_rows
            FROM transaction_history
        `;
        const latestDate = rows[0]?.latest_date || null;
        const totalRows = Number(rows[0]?.total_rows || 0);
        return new Response(
            JSON.stringify({ success: true, latestDate, totalRows }),
            { status: 200, headers: CORS }
        );
    } catch (error: any) {
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: CORS }
        );
    }
};
