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
        const { password, adSnapshots, adRosterChanges, adBudgets } = await req.json();
        const hash = process.env.ADMIN_PASSWORD_HASH;
        const dbUrl = process.env.NETLIFY_DATABASE_URL_UNPOOLED || process.env.NETLIFY_DATABASE_URL;
        if (!hash || !dbUrl) throw new Error('Server config error');
        const valid = await bcrypt.compare(password, hash);
        if (!valid)
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorised' }),
                { status: 401, headers: CORS }
            );

        const sql = neon(dbUrl);

        // ── Upsert ad_snapshots ──
        if (Array.isArray(adSnapshots) && adSnapshots.length > 0) {
            await sql`DELETE FROM ad_snapshots`;
            const BATCH = 50;
            for (let i = 0; i < adSnapshots.length; i += BATCH) {
                const batch = adSnapshots.slice(i, i + BATCH);
                for (const snap of batch) {
                    await sql`
                        INSERT INTO ad_snapshots (id, platform, week_start, week_end, data, updated_at)
                        VALUES (
                            ${snap.id},
                            ${snap.platform},
                            ${snap.weekStartDate},
                            ${snap.weekEndDate},
                            ${JSON.stringify(snap)},
                            NOW()
                        )
                        ON CONFLICT (id) DO UPDATE SET
                            data = EXCLUDED.data,
                            updated_at = NOW()
                    `;
                }
            }
            console.log(`[db-push-ad] ${adSnapshots.length} snapshots saved`);
        }

        // ── Upsert ad_roster_changes ──
        if (Array.isArray(adRosterChanges) && adRosterChanges.length > 0) {
            await sql`DELETE FROM ad_roster_changes`;
            for (const change of adRosterChanges) {
                await sql`
                    INSERT INTO ad_roster_changes (id, platform, week_of, campaign, ad_group, sku, action, reason, date, updated_at)
                    VALUES (
                        ${change.id},
                        ${change.platform ?? ''},
                        ${change.weekOf ?? ''},
                        ${change.campaign ?? ''},
                        ${change.adGroup ?? ''},
                        ${change.sku},
                        ${change.action},
                        ${change.reason ?? ''},
                        ${change.date ?? ''},
                        NOW()
                    )
                    ON CONFLICT (id) DO UPDATE SET
                        reason = EXCLUDED.reason,
                        updated_at = NOW()
                `;
            }
            console.log(`[db-push-ad] ${adRosterChanges.length} roster changes saved`);
        }

        // ── Upsert ad_budgets (single row, JSON) ──
        if (adBudgets && typeof adBudgets === 'object') {
            await sql`
                INSERT INTO ad_budgets (id, data, updated_at)
                VALUES (1, ${JSON.stringify(adBudgets)}, NOW())
                ON CONFLICT (id) DO UPDATE SET
                    data = EXCLUDED.data,
                    updated_at = NOW()
            `;
            console.log(`[db-push-ad] budgets saved`);
        }

        return new Response(
            JSON.stringify({
                success: true,
                snapshotCount: adSnapshots?.length || 0,
                rosterCount: adRosterChanges?.length || 0,
            }),
            { status: 200, headers: CORS }
        );
    } catch (error: any) {
        console.error('[db-push-ad] error:', error.message);
        return new Response(
            JSON.stringify({ success: false, error: error.message }),
            { status: 500, headers: CORS }
        );
    }
};
