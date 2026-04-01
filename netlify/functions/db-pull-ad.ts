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
        const sql = neon(process.env.NETLIFY_DATABASE_URL!);

        // Pull all three ad tables in parallel
        const [snapshotRows, rosterRows, budgetRows] = await Promise.all([
            sql`SELECT data FROM ad_snapshots ORDER BY week_start DESC`,
            sql`SELECT id, platform, week_of, campaign, ad_group, sku, action, reason, date FROM ad_roster_changes ORDER BY date DESC`,
            sql`SELECT data FROM ad_budgets WHERE id = 1`,
        ]);

        // ad_snapshots: each row stores the full snapshot object in the data JSONB column
        const adSnapshots = snapshotRows.map(r =>
            typeof r.data === 'string' ? JSON.parse(r.data) : r.data
        );

        // ad_roster_changes: stored as individual columns, reconstruct objects
        const adRosterChanges = rosterRows.map(r => ({
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

        // ad_budgets: single row, JSON blob
        const adBudgets: Record<string, number> =
            budgetRows.length > 0
                ? (typeof budgetRows[0].data === 'string'
                    ? JSON.parse(budgetRows[0].data)
                    : budgetRows[0].data) ?? {}
                : {};

        console.log(`[db-pull-ad] ${adSnapshots.length} snapshots, ${adRosterChanges.length} roster changes`);

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
