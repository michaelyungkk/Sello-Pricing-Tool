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

        const [snapshotRows, rosterRows, budgetRows] = await Promise.all([
            sql`SELECT data FROM ad_snapshots ORDER BY week_start DESC`,
            sql`SELECT id, platform, week_of, campaign, ad_group, sku, action, reason, date FROM ad_roster_changes ORDER BY date DESC`,
            sql`SELECT data FROM ad_budgets WHERE id = 1`,
        ]);

        const adSnapshots = snapshotRows.map((r: any) => {
            try { return typeof r.data === 'string' ? JSON.parse(r.data) : r.data; }
            catch { return null; }
        }).filter(Boolean);

        const adRosterChanges = rosterRows.map((r: any) => ({
            id: r.id,
            platform: r.platform,
            weekOf: r.week_of,
            campaign: r.campaign,
            adGroup: r.ad_group,
            sku: r.sku,
            action: r.action,
            reason: r.reason,
            date: r.date,
        }));

        let adBudgets: Record<string, number> = {};
        if (budgetRows.length > 0) {
            try { adBudgets = typeof budgetRows[0].data === 'string' ? JSON.parse(budgetRows[0].data) : budgetRows[0].data; }
            catch {}
        }

        return new Response(
            JSON.stringify({ success: true, adSnapshots, adRosterChanges, adBudgets }),
            { status: 200, headers: CORS }
        );
    } catch (error: any) {
        console.error('[db-pull-ad] error:', error.message);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: CORS }
        );
    }
};
