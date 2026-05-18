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
    let errorContext: Record<string, any> = { stage: 'request_init' };
    try {
        const body = await req.json();
        const { password, transactions, removedKeys, clearAll, chunkIndex, totalChunks, action, uploadId } = body;
        errorContext = {
            action: action || (clearAll === true ? 'clear_all' : 'upsert_chunk'),
            uploadId: String(uploadId || '').trim() || null,
            chunkIndex: Number.isFinite(Number(chunkIndex)) ? Number(chunkIndex) : null,
            totalChunks: Number.isFinite(Number(totalChunks)) ? Number(totalChunks) : null,
            rowsInRequest: Array.isArray(transactions) ? transactions.length : null,
            stage: 'auth'
        };

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
        errorContext.stage = 'schema_guard';

        // Backward-safe schema guard for older environments.
        await sql`ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS cogs NUMERIC`;
        await sql`ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS selling_fee NUMERIC`;
        await sql`ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS ads_fee NUMERIC`;
        await sql`ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS postage NUMERIC`;
        await sql`ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS other_fee NUMERIC`;
        await sql`ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS subscription_fee NUMERIC`;
        await sql`ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS wms_fee NUMERIC`;
        await sql`ALTER TABLE transaction_history ADD COLUMN IF NOT EXISTS promo_rel NUMERIC`;
        await sql`
            CREATE TABLE IF NOT EXISTS transaction_history_replace_sessions (
                upload_id TEXT PRIMARY KEY,
                total_chunks INTEGER NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS transaction_history_replace_chunks (
                upload_id TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                row_count INTEGER NOT NULL DEFAULT 0,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (upload_id, chunk_index)
            )
        `;
        await sql`
            CREATE TABLE IF NOT EXISTS transaction_history_stage (
                upload_id TEXT NOT NULL,
                id TEXT NOT NULL,
                sku TEXT,
                date DATE,
                price NUMERIC,
                velocity NUMERIC,
                margin NUMERIC,
                profit NUMERIC,
                ads_spend NUMERIC,
                raw_ads_spend NUMERIC,
                platform TEXT,
                order_id TEXT,
                postcode TEXT,
                logistic_partner TEXT,
                logistic_service TEXT,
                real_postage NUMERIC,
                real_extra_freight NUMERIC,
                cogs NUMERIC,
                selling_fee NUMERIC,
                ads_fee NUMERIC,
                postage NUMERIC,
                other_fee NUMERIC,
                subscription_fee NUMERIC,
                wms_fee NUMERIC,
                promo_rel NUMERIC,
                dedup_key TEXT NOT NULL,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                PRIMARY KEY (upload_id, dedup_key)
            )
        `;
        await sql`DELETE FROM transaction_history_replace_sessions WHERE created_at < NOW() - INTERVAL '1 day'`;
        await sql`
            DELETE FROM transaction_history_replace_chunks
            WHERE upload_id NOT IN (SELECT upload_id FROM transaction_history_replace_sessions)
        `;
        await sql`
            DELETE FROM transaction_history_stage
            WHERE upload_id NOT IN (SELECT upload_id FROM transaction_history_replace_sessions)
        `;

        if (clearAll === true) {
            errorContext.stage = 'clear_all';
            await sql`DELETE FROM transaction_history`;
            return new Response(
                JSON.stringify({ success: true, cleared: true }),
                { status: 200, headers: CORS }
            );
        }

        if (action === 'begin_replace') {
            const safeUploadId = String(uploadId || '').trim();
            const expectedChunks = Number(totalChunks || 0);
            if (!safeUploadId)
                return new Response(
                    JSON.stringify({ success: false, error: 'uploadId is required' }),
                    { status: 400, headers: CORS }
                );
            if (!Number.isInteger(expectedChunks) || expectedChunks < 0)
                return new Response(
                    JSON.stringify({ success: false, error: 'totalChunks must be a non-negative integer' }),
                    { status: 400, headers: CORS }
                );

            errorContext.stage = 'begin_replace';
            await sql`DELETE FROM transaction_history_replace_chunks WHERE upload_id = ${safeUploadId}`;
            await sql`DELETE FROM transaction_history_stage WHERE upload_id = ${safeUploadId}`;
            await sql.query(
                `
                INSERT INTO transaction_history_replace_sessions (upload_id, total_chunks, created_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (upload_id) DO UPDATE
                SET total_chunks = EXCLUDED.total_chunks,
                    created_at = NOW()
                `,
                [safeUploadId, expectedChunks]
            );

            return new Response(
                JSON.stringify({ success: true, uploadId: safeUploadId, totalChunks: expectedChunks }),
                { status: 200, headers: CORS }
            );
        }

        if (action === 'abort_replace') {
            const safeUploadId = String(uploadId || '').trim();
            if (safeUploadId) {
                const abortStartedAt = Date.now();
                errorContext.stage = 'abort_replace';
                await sql`DELETE FROM transaction_history_replace_chunks WHERE upload_id = ${safeUploadId}`;
                await sql`DELETE FROM transaction_history_stage WHERE upload_id = ${safeUploadId}`;
                await sql`DELETE FROM transaction_history_replace_sessions WHERE upload_id = ${safeUploadId}`;
                console.log('[db-push-transactions][abort_replace]', {
                    uploadId: safeUploadId,
                    elapsedMs: Date.now() - abortStartedAt
                });
            }
            return new Response(
                JSON.stringify({ success: true, uploadId: safeUploadId }),
                { status: 200, headers: CORS }
            );
        }

        const requiresTransactions = action === 'upload_replace_chunk' || action === 'reconcile_upsert' || !action;
        if (requiresTransactions && !Array.isArray(transactions))
            return new Response(
                JSON.stringify({ success: false, error: 'transactions must be array' }),
                { status: 400, headers: CORS }
            );
        if (action === 'reconcile_delete' && !Array.isArray(removedKeys))
            return new Response(
                JSON.stringify({ success: false, error: 'removedKeys must be array' }),
                { status: 400, headers: CORS }
            );

        if (requiresTransactions && transactions.length === 0) {
            return new Response(
                JSON.stringify({ success: true, chunkIndex, totalChunks, upsertedCount: 0 }),
                { status: 200, headers: CORS }
            );
        }

        const rows = Array.isArray(transactions) ? transactions.map((tx: any) => {
            // Composite key must match salesImportWorker.ts dailyKey exactly:
            // sku|date|platform|orderId  (or sku|date|platform if no orderId)
            // This ensures DB dedup aligns with how records are bucketed in memory.
            // Old key (sku|orderId) was missing date+platform, causing collisions.
            const date = (tx.date || '').split('T')[0];
            const platform = tx.platform || 'General';
            const dedupKey = tx.orderId
                ? `${tx.sku}|${date}|${platform}|${tx.orderId}`
                : `${tx.sku}|${date}|${platform}`;
            return {
                id: dedupKey,  // always deterministic — never use random log-{ts} ids
                sku: tx.sku,
                date: (tx.date || '').split('T')[0],
                price: tx.price ?? null,
                velocity: tx.velocity ?? null,
                margin: tx.margin ?? null,
                profit: tx.profit ?? null,
                ads_spend: tx.adsSpend ?? null,
                raw_ads_spend: tx.rawAdsSpend ?? null,
                platform: tx.platform || 'General',
                order_id: tx.orderId ?? null,
                postcode: tx.postcode ?? null,
                logistic_partner: tx.logisticPartner ?? null,
                logistic_service: tx.logisticService ?? null,
                real_postage: tx.realPostage ?? null,
                real_extra_freight: tx.realExtraFreight ?? null,
                cogs: tx.cogs ?? null,
                selling_fee: tx.sellingFee ?? null,
                ads_fee: tx.adsFee ?? null,
                postage: tx.postage ?? null,
                other_fee: tx.otherFee ?? null,
                subscription_fee: tx.subscriptionFee ?? null,
                wms_fee: tx.wmsFee ?? null,
                promo_rel: tx.promoRel ?? null,
                dedup_key: dedupKey
            };
        }) : [];

        if (action === 'upload_replace_chunk') {
            const safeUploadId = String(uploadId || '').trim();
            const currentChunkIndex = Number(chunkIndex || 0);
            const expectedChunks = Number(totalChunks || 0);
            errorContext = {
                ...errorContext,
                action: 'upload_replace_chunk',
                uploadId: safeUploadId || null,
                chunkIndex: currentChunkIndex,
                totalChunks: expectedChunks,
                rowsInRequest: rows.length
            };
            if (!safeUploadId)
                return new Response(
                    JSON.stringify({ success: false, error: 'uploadId is required' }),
                    { status: 400, headers: CORS }
                );
            const sessionRows = await sql`
                SELECT total_chunks FROM transaction_history_replace_sessions WHERE upload_id = ${safeUploadId}
            `;
            errorContext.stage = 'upload_replace_chunk.session_lookup';
            if (!sessionRows || sessionRows.length === 0)
                return new Response(
                    JSON.stringify({ success: false, error: 'replace session not found' }),
                    { status: 400, headers: CORS }
                );
            const sessionTotalChunks = Number(sessionRows[0].total_chunks || 0);
            if (expectedChunks !== sessionTotalChunks)
                return new Response(
                    JSON.stringify({ success: false, error: 'replace session chunk count mismatch' }),
                    { status: 400, headers: CORS }
                );

            if (rows.length > 0) {
                const stageInsertStartedAt = Date.now();
                errorContext.stage = 'upload_replace_chunk.stage_insert';
                const placeholders = rows.map((_: any, i: number) => {
                    const b = i * 26;
                    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17},$${b + 18},$${b + 19},$${b + 20},$${b + 21},$${b + 22},$${b + 23},$${b + 24},$${b + 25},$${b + 26},NOW())`;
                }).join(',');

                const flatStageValues = rows.flatMap((r: any) => [
                    safeUploadId,
                    r.id, r.sku, r.date, r.price, r.velocity, r.margin, r.profit,
                    r.ads_spend, r.raw_ads_spend, r.platform, r.order_id,
                    r.postcode, r.logistic_partner, r.logistic_service,
                    r.real_postage, r.real_extra_freight,
                    r.cogs, r.selling_fee, r.ads_fee, r.postage, r.other_fee,
                    r.subscription_fee, r.wms_fee, r.promo_rel,
                    r.dedup_key
                ]);

                await sql.query(
                    `
                    INSERT INTO transaction_history_stage (
                        upload_id, id, sku, date, price, velocity, margin, profit,
                        ads_spend, raw_ads_spend, platform, order_id,
                        postcode, logistic_partner, logistic_service,
                        real_postage, real_extra_freight,
                        cogs, selling_fee, ads_fee, postage, other_fee,
                        subscription_fee, wms_fee, promo_rel,
                        dedup_key, created_at
                    ) VALUES ${placeholders}
                    ON CONFLICT (upload_id, dedup_key) DO UPDATE SET
                        id = EXCLUDED.id,
                        sku = EXCLUDED.sku,
                        date = EXCLUDED.date,
                        price = EXCLUDED.price,
                        velocity = EXCLUDED.velocity,
                        margin = EXCLUDED.margin,
                        profit = EXCLUDED.profit,
                        ads_spend = EXCLUDED.ads_spend,
                        raw_ads_spend = EXCLUDED.raw_ads_spend,
                        platform = EXCLUDED.platform,
                        order_id = EXCLUDED.order_id,
                        postcode = EXCLUDED.postcode,
                        logistic_partner = EXCLUDED.logistic_partner,
                        logistic_service = EXCLUDED.logistic_service,
                        real_postage = EXCLUDED.real_postage,
                        real_extra_freight = EXCLUDED.real_extra_freight,
                        cogs = EXCLUDED.cogs,
                        selling_fee = EXCLUDED.selling_fee,
                        ads_fee = EXCLUDED.ads_fee,
                        postage = EXCLUDED.postage,
                        other_fee = EXCLUDED.other_fee,
                        subscription_fee = EXCLUDED.subscription_fee,
                        wms_fee = EXCLUDED.wms_fee,
                        promo_rel = EXCLUDED.promo_rel,
                        created_at = NOW()
                    `,
                    flatStageValues
                );

                console.log('[db-push-transactions][stage_chunk]', {
                    uploadId: safeUploadId,
                    chunkIndex: currentChunkIndex + 1,
                    totalChunks: expectedChunks,
                    rows: rows.length,
                    insertMs: Date.now() - stageInsertStartedAt
                });
            }

            errorContext.stage = 'upload_replace_chunk.chunk_registry';
            await sql.query(
                `
                INSERT INTO transaction_history_replace_chunks (upload_id, chunk_index, row_count, created_at)
                VALUES ($1, $2, $3, NOW())
                ON CONFLICT (upload_id, chunk_index) DO UPDATE SET
                    row_count = EXCLUDED.row_count,
                    created_at = NOW()
                `,
                [safeUploadId, currentChunkIndex, rows.length]
            );

            console.log(`[db-push-transactions] staged replace chunk ${currentChunkIndex}/${expectedChunks} - ${rows.length} rows`);

            return new Response(
                JSON.stringify({ success: true, uploadId: safeUploadId, chunkIndex: currentChunkIndex, totalChunks: expectedChunks, stagedCount: rows.length }),
                { status: 200, headers: CORS }
            );
        }

        if (action === 'finalize_replace') {
            const safeUploadId = String(uploadId || '').trim();
            errorContext = {
                ...errorContext,
                action: 'finalize_replace',
                uploadId: safeUploadId || null,
                stage: 'finalize_replace.init'
            };
            if (!safeUploadId)
                return new Response(
                    JSON.stringify({ success: false, error: 'uploadId is required' }),
                    { status: 400, headers: CORS }
                );

            const sessionRows = await sql`
                SELECT total_chunks FROM transaction_history_replace_sessions WHERE upload_id = ${safeUploadId}
            `;
            errorContext.stage = 'finalize_replace.session_lookup';
            if (!sessionRows || sessionRows.length === 0)
                return new Response(
                    JSON.stringify({ success: false, error: 'replace session not found' }),
                    { status: 400, headers: CORS }
                );
            const expectedChunks = Number(sessionRows[0].total_chunks || 0);
            const chunkRows = await sql`
                SELECT COUNT(*)::INT AS uploaded_chunks
                FROM transaction_history_replace_chunks
                WHERE upload_id = ${safeUploadId}
            `;
            errorContext.stage = 'finalize_replace.chunk_count';
            const uploadedChunks = Number(chunkRows?.[0]?.uploaded_chunks || 0);
            if (uploadedChunks !== expectedChunks)
                return new Response(
                    JSON.stringify({ success: false, error: `replace session incomplete (${uploadedChunks}/${expectedChunks} chunks)` }),
                    { status: 400, headers: CORS }
                );

            const stageCountRows = await sql`
                SELECT COUNT(*)::INT AS staged_rows
                FROM transaction_history_stage
                WHERE upload_id = ${safeUploadId}
            `;
            errorContext.stage = 'finalize_replace.stage_count';
            const stagedRows = Number(stageCountRows?.[0]?.staged_rows || 0);
            const swapStartedAt = Date.now();
            errorContext = {
                ...errorContext,
                uploadedChunks,
                expectedChunks,
                stagedRows,
                stage: 'finalize_replace.swap'
            };

            await sql.query(
                `
                WITH deleted AS (
                    DELETE FROM transaction_history
                )
                INSERT INTO transaction_history (
                    id, sku, date, price, velocity, margin, profit,
                    ads_spend, raw_ads_spend, platform, order_id,
                    postcode, logistic_partner, logistic_service,
                    real_postage, real_extra_freight,
                    cogs, selling_fee, ads_fee, postage, other_fee,
                    subscription_fee, wms_fee, promo_rel,
                    dedup_key, updated_at
                )
                SELECT
                    id, sku, date, price, velocity, margin, profit,
                    ads_spend, raw_ads_spend, platform, order_id,
                    postcode, logistic_partner, logistic_service,
                    real_postage, real_extra_freight,
                    cogs, selling_fee, ads_fee, postage, other_fee,
                    subscription_fee, wms_fee, promo_rel,
                    dedup_key, NOW()
                FROM transaction_history_stage
                WHERE upload_id = $1
                `,
                [safeUploadId]
            );

            await sql`DELETE FROM transaction_history_replace_chunks WHERE upload_id = ${safeUploadId}`;
            await sql`DELETE FROM transaction_history_stage WHERE upload_id = ${safeUploadId}`;
            await sql`DELETE FROM transaction_history_replace_sessions WHERE upload_id = ${safeUploadId}`;

            console.log('[db-push-transactions][finalize_replace]', {
                uploadId: safeUploadId,
                uploadedChunks,
                expectedChunks,
                stagedRows,
                swapMs: Date.now() - swapStartedAt
            });
            console.log(`[db-push-transactions] finalized replace session ${safeUploadId} - ${uploadedChunks} chunks`);

            return new Response(
                JSON.stringify({ success: true, uploadId: safeUploadId, totalChunks: expectedChunks }),
                { status: 200, headers: CORS }
            );
        }

        if (action === 'reconcile_delete') {
            const keys = removedKeys
                .map((key: unknown) => String(key || '').trim())
                .filter(Boolean);
            const uniqueKeys = [...new Set(keys)];
            errorContext = {
                ...errorContext,
                action: 'reconcile_delete',
                rowsInRequest: uniqueKeys.length,
                stage: 'reconcile_delete'
            };
            if (uniqueKeys.length === 0) {
                return new Response(
                    JSON.stringify({ success: true, chunkIndex, totalChunks, deletedCount: 0 }),
                    { status: 200, headers: CORS }
                );
            }

            const deleteStartedAt = Date.now();
            const deletedRows = await sql.query(
                `
                WITH deleted AS (
                    DELETE FROM transaction_history
                    WHERE dedup_key = ANY($1::text[])
                    RETURNING dedup_key
                )
                SELECT COUNT(*)::INT AS deleted_count FROM deleted
                `,
                [uniqueKeys]
            );
            const deletedCount = Number(deletedRows?.[0]?.deleted_count || 0);

            console.log('[db-push-transactions][reconcile_delete]', {
                chunkIndex,
                totalChunks,
                requestedKeys: uniqueKeys.length,
                deletedCount,
                elapsedMs: Date.now() - deleteStartedAt
            });

            return new Response(
                JSON.stringify({ success: true, chunkIndex, totalChunks, deletedCount }),
                { status: 200, headers: CORS }
            );
        }

        errorContext.stage = action === 'reconcile_upsert' ? 'reconcile_upsert' : 'incremental_upsert';
        const placeholders = rows.map((_: any, i: number) => {
            const b = i * 25;
            return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17},$${b + 18},$${b + 19},$${b + 20},$${b + 21},$${b + 22},$${b + 23},$${b + 24},$${b + 25},NOW())`;
        }).join(',');

        const flatValues = rows.flatMap((r: any) => [
            r.id, r.sku, r.date, r.price, r.velocity, r.margin, r.profit,
            r.ads_spend, r.raw_ads_spend, r.platform, r.order_id,
            r.postcode, r.logistic_partner, r.logistic_service,
            r.real_postage, r.real_extra_freight,
            r.cogs, r.selling_fee, r.ads_fee, r.postage, r.other_fee,
            r.subscription_fee, r.wms_fee, r.promo_rel,
            r.dedup_key
        ]);

        await sql.query(`
            INSERT INTO transaction_history (
                id, sku, date, price, velocity, margin, profit,
                ads_spend, raw_ads_spend, platform, order_id,
                postcode, logistic_partner, logistic_service,
                real_postage, real_extra_freight,
                cogs, selling_fee, ads_fee, postage, other_fee,
                subscription_fee, wms_fee, promo_rel,
                dedup_key, updated_at
            ) VALUES ${placeholders}
            ON CONFLICT (dedup_key) DO UPDATE SET
                id = EXCLUDED.id,
                price = EXCLUDED.price,
                velocity = EXCLUDED.velocity,
                margin = EXCLUDED.margin,
                profit = EXCLUDED.profit,
                ads_spend = EXCLUDED.ads_spend,
                raw_ads_spend = EXCLUDED.raw_ads_spend,
                platform = EXCLUDED.platform,
                order_id = EXCLUDED.order_id,
                logistic_partner = EXCLUDED.logistic_partner,
                logistic_service = EXCLUDED.logistic_service,
                real_postage = EXCLUDED.real_postage,
                real_extra_freight = EXCLUDED.real_extra_freight,
                cogs = EXCLUDED.cogs,
                selling_fee = EXCLUDED.selling_fee,
                ads_fee = EXCLUDED.ads_fee,
                postage = EXCLUDED.postage,
                other_fee = EXCLUDED.other_fee,
                subscription_fee = EXCLUDED.subscription_fee,
                wms_fee = EXCLUDED.wms_fee,
                promo_rel = EXCLUDED.promo_rel,
                updated_at = NOW()
        `, flatValues);

        console.log(
            action === 'reconcile_upsert'
                ? `[db-push-transactions] reconcile chunk ${chunkIndex}/${totalChunks} - ${rows.length} rows upserted`
                : `[db-push-transactions] chunk ${chunkIndex}/${totalChunks} - ${rows.length} rows upserted`
        );

        return new Response(
            JSON.stringify({ success: true, chunkIndex, totalChunks, upsertedCount: rows.length }),
            { status: 200, headers: CORS }
        );
    } catch (error: any) {
        const errorPayload = {
            success: false,
            error: error?.message || 'Unknown server error',
            context: errorContext,
            dbError: {
                name: error?.name || null,
                code: error?.code || null,
                severity: error?.severity || null,
                detail: error?.detail || null,
                hint: error?.hint || null,
                where: error?.where || null,
                table: error?.table || null,
                column: error?.column || null,
                constraint: error?.constraint || null
            }
        };
        console.error('[db-push-transactions] error:', errorPayload);
        return new Response(
            JSON.stringify(errorPayload),
            { status: 500, headers: CORS }
        );
    }
};
