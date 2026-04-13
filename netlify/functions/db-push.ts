import { neon } from '@netlify/neon';
import bcrypt from 'bcryptjs';

const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
};

const LIMIT = 6 * 1024 * 1024;

type PushAction = 'begin' | 'chunk' | 'finalize' | 'legacy';

const writeSnapshot = async (sql: any, snapshotJson: string, now: string) => {
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
        if (bodyBytes > LIMIT) {
            console.error(`[db-push] payload too large: ${(bodyBytes / 1024 / 1024).toFixed(2)}MB`);
            return new Response(
                JSON.stringify({ success: false, error: `Payload too large: ${(bodyBytes / 1024 / 1024).toFixed(2)}MB (limit 6MB)` }),
                { status: 413, headers: CORS }
            );
        }

        const parsed = JSON.parse(body);
        const { password } = parsed || {};
        if (!password)
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
        const action: PushAction = parsed.action || 'legacy';

        if (action === 'begin') {
            const uploadId = String(parsed.uploadId || '').trim();
            const totalChunks = Number(parsed.totalChunks || 0);
            if (!uploadId || !Number.isInteger(totalChunks) || totalChunks <= 0) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Invalid begin payload' }),
                    { status: 400, headers: CORS }
                );
            }

            await sql`DELETE FROM app_snapshot_chunks WHERE upload_id = ${uploadId}`;
            await sql`DELETE FROM app_snapshot_uploads WHERE upload_id = ${uploadId}`;
            await sql`
                INSERT INTO app_snapshot_uploads (upload_id, total_chunks, created_at, updated_at)
                VALUES (${uploadId}, ${totalChunks}, ${now}, ${now})
            `;

            return new Response(
                JSON.stringify({ success: true, uploadId, totalChunks }),
                { status: 200, headers: CORS }
            );
        }

        if (action === 'chunk') {
            const uploadId = String(parsed.uploadId || '').trim();
            const chunkIndex = Number(parsed.chunkIndex);
            const chunkData = typeof parsed.chunkData === 'string' ? parsed.chunkData : '';
            if (!uploadId || !Number.isInteger(chunkIndex) || chunkIndex < 0 || !chunkData) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Invalid chunk payload' }),
                    { status: 400, headers: CORS }
                );
            }

            const uploadRows = await sql`
                SELECT upload_id FROM app_snapshot_uploads WHERE upload_id = ${uploadId}
            `;
            if (!uploadRows || uploadRows.length === 0) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Upload session not found' }),
                    { status: 404, headers: CORS }
                );
            }

            await sql`
                INSERT INTO app_snapshot_chunks (upload_id, chunk_index, chunk_data, created_at)
                VALUES (${uploadId}, ${chunkIndex}, ${chunkData}, ${now})
                ON CONFLICT (upload_id, chunk_index) DO UPDATE
                SET chunk_data = EXCLUDED.chunk_data
            `;
            await sql`
                UPDATE app_snapshot_uploads
                SET updated_at = ${now}
                WHERE upload_id = ${uploadId}
            `;

            return new Response(
                JSON.stringify({ success: true, uploadId, chunkIndex }),
                { status: 200, headers: CORS }
            );
        }

        if (action === 'finalize') {
            const uploadId = String(parsed.uploadId || '').trim();
            if (!uploadId) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Missing uploadId' }),
                    { status: 400, headers: CORS }
                );
            }

            const metaRows = await sql`
                SELECT total_chunks FROM app_snapshot_uploads WHERE upload_id = ${uploadId}
            `;
            if (!metaRows || metaRows.length === 0) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Upload session not found' }),
                    { status: 404, headers: CORS }
                );
            }

            const expectedChunks = Number(metaRows[0].total_chunks || 0);
            const countRows = await sql`
                SELECT COUNT(*)::int AS count
                FROM app_snapshot_chunks
                WHERE upload_id = ${uploadId}
            `;
            const actualChunks = Number(countRows?.[0]?.count || 0);
            if (actualChunks !== expectedChunks) {
                return new Response(
                    JSON.stringify({
                        success: false,
                        error: `Chunk count mismatch (${actualChunks}/${expectedChunks})`
                    }),
                    { status: 400, headers: CORS }
                );
            }

            const assembledRows = await sql`
                SELECT STRING_AGG(chunk_data, '' ORDER BY chunk_index) AS snapshot_json
                FROM app_snapshot_chunks
                WHERE upload_id = ${uploadId}
            `;
            const snapshotJson = String(assembledRows?.[0]?.snapshot_json || '');
            if (!snapshotJson) {
                return new Response(
                    JSON.stringify({ success: false, error: 'No snapshot data found' }),
                    { status: 400, headers: CORS }
                );
            }

            // Validate assembled JSON before writing live snapshot
            JSON.parse(snapshotJson);

            console.log(`[db-push] finalizing upload ${uploadId}: ${(new TextEncoder().encode(snapshotJson).length / 1024).toFixed(0)}KB`);
            await writeSnapshot(sql, snapshotJson, now);
            await sql`DELETE FROM app_snapshot_chunks WHERE upload_id = ${uploadId}`;
            await sql`DELETE FROM app_snapshot_uploads WHERE upload_id = ${uploadId}`;

            console.log(`[db-push] success at ${now}`);
            return new Response(
                JSON.stringify({ success: true, pushedAt: now }),
                { status: 200, headers: CORS }
            );
        }

        // Legacy single-request push (kept for backward compatibility)
        const snapshot = parsed.snapshot;
        if (!snapshot) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing snapshot payload' }),
                { status: 400, headers: CORS }
            );
        }

        const snapshotJson = JSON.stringify(snapshot);
        console.log(`[db-push] writing snapshot (legacy): ${(new TextEncoder().encode(snapshotJson).length / 1024).toFixed(0)}KB`);
        await writeSnapshot(sql, snapshotJson, now);
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
