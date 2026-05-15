import * as XLSX from 'xlsx';
import { RefundLog } from '../types';
import { VAT_MULTIPLIER } from '../constants';
import { asDateKeyNaive } from '../services/dateUtils';
import { getCanonicalSku } from '../services/skuNormalization';

const postProgress = (progress: number, message: string) => {
    self.postMessage({
        type: 'progress',
        progress,
        message
    });
};

const parseRefundQty = (rawQty: unknown): number => {
    if (rawQty === undefined || rawQty === null) return 1;
    if (rawQty instanceof Date) return 1;
    const text = String(rawQty).trim();
    if (!text) return 1;
    const parsed = Number(text);
    if (!Number.isFinite(parsed)) return 1;
    return parsed > 0 ? parsed : 1;
};

const generateRefundId = (sku: string, date: string, amount: number, qty: number, reason: string | undefined, orderId: string) => {
    const safeReason = (reason || 'unknown').trim().toLowerCase().substring(0, 20);
    const signature = `${sku.trim().toUpperCase()}|${orderId}|${date}|${amount.toFixed(2)}|${qty}|${safeReason}`;

    let hash = 0;
    for (let i = 0; i < signature.length; i++) {
        const char = signature.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash |= 0;
    }
    return `ref-${Math.abs(hash).toString(36)}`;
};

const findColPriority = (headers: string[], terms: string[]) => {
    for (const term of terms) {
        const idx = headers.findIndex(h => h === term || h.includes(term));
        if (idx !== -1) return idx;
    }
    return -1;
};

const hasCjkText = (value: string): boolean => /[\u3400-\u9FFF]/.test(value.replace(/\u807D/g, ''));

const looksLikeMojibake = (value: string): boolean => (
    !hasCjkText(value) && /[\u00C3\u0192\u00C3\u201A\u00EF\u00BF\u00BD]|(?:[\u00E3\u00A6\u00E3\u00A8\u00E3\u00A5\u00E3\u00A7][\u0080-\u00FF\u0152\u0153])/.test(value)
);

const repairMojibake = (value: string): string => {
    if (!looksLikeMojibake(value) || typeof TextDecoder === 'undefined') return value;
    const windows1252Bytes: Record<number, number> = {
        0x20AC: 0x80, 0x201A: 0x82, 0x0192: 0x83, 0x201E: 0x84, 0x2026: 0x85,
        0x2020: 0x86, 0x2021: 0x87, 0x02C6: 0x88, 0x2030: 0x89, 0x0160: 0x8A,
        0x2039: 0x8B, 0x0152: 0x8C, 0x017D: 0x8E, 0x2018: 0x91, 0x2019: 0x92,
        0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2013: 0x96, 0x2014: 0x97,
        0x02DC: 0x98, 0x2122: 0x99, 0x0161: 0x9A, 0x203A: 0x9B, 0x0153: 0x9C,
        0x017E: 0x9E, 0x0178: 0x9F
    };
    try {
        const bytes = Array.from(value, ch => {
            const code = ch.charCodeAt(0);
            return windows1252Bytes[code] ?? (code <= 0xFF ? code : 0x3F);
        });
        const repaired = new TextDecoder('utf-8', { fatal: false }).decode(new Uint8Array(bytes)).trim();
        return repaired && !looksLikeMojibake(repaired) ? repaired : value;
    } catch {
        return value;
    }
};

const cleanCommentValue = (value: unknown): string => (
    repairMojibake(String(value || '').replace(/\u807D/g, ' ').replace(/\s+/g, ' ').trim())
);

const normalizeCommentPair = (rawCn: unknown, rawEn: unknown): { cn: string, en: string } => {
    const values = [cleanCommentValue(rawCn), cleanCommentValue(rawEn)].filter(Boolean);
    const cn = values.find(hasCjkText) || '';
    const en = values.find(v => !hasCjkText(v) && !looksLikeMojibake(v)) || '';
    return { cn, en };
};

const parseSpreadsheetPayload = (
    fileName: string,
    fileBuffer?: ArrayBuffer,
    fileText?: string
): any[][] => {
    const lowerName = (fileName || '').toLowerCase();
    if ((lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) && fileBuffer) {
        const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: false, dense: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        return XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
    }
    const text = fileText || '';
    return text.split('\n').map(l => l.split(','));
};

self.onmessage = (event: MessageEvent<{
    detailsFileName: string;
    detailsBuffer?: ArrayBuffer;
    detailsText?: string;
    commentsFileName: string;
    commentsBuffer?: ArrayBuffer;
    commentsText?: string;
    existingOrdersEntries?: [string, string][];
}>) => {
    try {
        postProgress(10, 'Parsing return files...');
        const detailsRows = parseSpreadsheetPayload(
            event.data?.detailsFileName || 'details.xlsx',
            event.data?.detailsBuffer,
            event.data?.detailsText
        );
        const commentsRows = parseSpreadsheetPayload(
            event.data?.commentsFileName || 'comments.xlsx',
            event.data?.commentsBuffer,
            event.data?.commentsText
        );
        const existingOrders = new Map<string, string>(event.data?.existingOrdersEntries || []);

        postProgress(30, 'Building comment map...');
        const commentMap = new Map<string, { cn: string, en: string }>();
        if (commentsRows.length > 1) {
            const cHeaders = commentsRows[0].map(h => String(h).trim().toLowerCase().replace(/[\s_\-/]/g, ''));
            const cOrderIdx = findColPriority(cHeaders, ['outerorderid', 'orderid']);
            const cnIdx = findColPriority(cHeaders, ['commentcn', 'chinesememo']);
            const enIdx = findColPriority(cHeaders, ['commenten', 'englishmemo']);

            if (cOrderIdx !== -1) {
                for (let i = 1; i < commentsRows.length; i++) {
                    const row = commentsRows[i];
                    const oid = String(row[cOrderIdx] || '').trim();
                    if (!oid) continue;
                    const normalizedComments = normalizeCommentPair(
                        cnIdx !== -1 ? row[cnIdx] : '',
                        enIdx !== -1 ? row[enIdx] : ''
                    );
                    if (normalizedComments.cn || normalizedComments.en) {
                        commentMap.set(oid, normalizedComments);
                    }
                }
            }
        }

        postProgress(45, 'Analyzing refund details...');
        if (detailsRows.length < 2) throw new Error('Details file empty');
        const dHeaders = detailsRows[0].map(h => String(h).trim().toLowerCase().replace(/[\s_\-/]/g, ''));

        const skuIdx = findColPriority(dHeaders, ['skucode', 'sku']);
        const orderIdx = findColPriority(dHeaders, ['outerorderid', 'orderid']);
        const amtIdx = findColPriority(dHeaders, ['returnamt', 'amount']);
        const qtyIdx = findColPriority(dHeaders, ['returnqty', 'qty']);
        const typeIdx = findColPriority(dHeaders, ['ordertype', 'type']);
        let reasonIdx = findColPriority(dHeaders, ['returnreasondetail', 'return_reason_detail']);
        if (reasonIdx === -1) reasonIdx = findColPriority(dHeaders, ['returnreason', 'reason']);
        const dateIdx = findColPriority(dHeaders, ['ordertime', 'time', 'orderdate', 'date', 'refundtime', 'refund_time']);
        const platformIdx = findColPriority(dHeaders, ['platformnamelevel1', 'platformname', 'platform']);
        const platform2Idx = findColPriority(dHeaders, ['platformnamelevel2']);

        const missingCols: string[] = [];
        if (skuIdx === -1) missingCols.push('SKU (sku_code)');
        if (orderIdx === -1) missingCols.push('Order ID (outer_order_id)');
        if (amtIdx === -1) missingCols.push('Refund Amount (return_amt)');
        if (missingCols.length > 0) {
            throw new Error(`Missing required columns in Details file: ${missingCols.join(', ')}`);
        }

        const orderGroups = new Map<string, { freight: number, items: any[] }>();
        const totalRows = Math.max(detailsRows.length - 1, 1);
        let nextProgressIndex = 1;

        for (let i = 1; i < detailsRows.length; i++) {
            if (i >= nextProgressIndex) {
                const progress = 45 + (i / totalRows) * 25;
                postProgress(progress, `Grouping refund rows ${i}/${detailsRows.length - 1}...`);
                nextProgressIndex = i + 500;
            }
            const row = detailsRows[i];
            const oid = String(row[orderIdx] || '').trim();
            if (!oid) continue;

            if (!orderGroups.has(oid)) orderGroups.set(oid, { freight: 0, items: [] });
            const group = orderGroups.get(oid)!;

            const rawSku = String(row[skuIdx] || '').trim();
            const amt = parseFloat(String(row[amtIdx])) || 0;

            if (rawSku.toLowerCase() === 'freight') {
                group.freight += amt;
            } else {
                const sku = getCanonicalSku(rawSku);
                group.items.push({ row, sku, amt, rawSku });
            }
        }

        postProgress(75, 'Building refund snapshot...');
        const refunds: RefundLog[] = [];
        let totalValue = 0;
        let matchedOrders = 0;
        let orphans = 0;
        const unmatchedSamples: string[] = [];

        orderGroups.forEach((group, oid) => {
            const totalItemVal = group.items.reduce((sum, it) => sum + it.amt, 0);

            group.items.forEach(it => {
                const { row, sku, rawSku } = it;
                const amt = it.amt;

                let qty = 1;
                if (qtyIdx !== -1) qty = parseRefundQty(row[qtyIdx]);

                const allocatedFreight = totalItemVal > 0
                    ? (amt / totalItemVal) * group.freight
                    : (group.freight / group.items.length);

                const oType = typeIdx !== -1 ? String(row[typeIdx]).toLowerCase() : 'refund';
                const reason = reasonIdx !== -1 ? String(row[reasonIdx]) : undefined;

                let dateStr = new Date().toISOString();
                const rawDate = dateIdx !== -1 ? row[dateIdx] : undefined;
                if (rawDate) {
                    const dKey = asDateKeyNaive(rawDate);
                    if (dKey) dateStr = new Date(dKey).toISOString();
                }

                let finalPlatform: string | undefined = undefined;
                if (platformIdx !== -1 || platform2Idx !== -1) {
                    const p1 = platformIdx !== -1 ? String(row[platformIdx] || '').trim() : '';
                    const p2 = platform2Idx !== -1 ? String(row[platform2Idx] || '').trim() : '';
                    if (p2 && p2 !== '-' && p2.toLowerCase() !== 'unknown') {
                        if (p1 && !p2.toLowerCase().includes(p1.toLowerCase()) && p2.length < 5) {
                            finalPlatform = `${p1} ${p2}`;
                        } else {
                            finalPlatform = p2;
                        }
                    } else if (p1) {
                        finalPlatform = p1;
                    }
                }
                if (existingOrders.size > 0) {
                    if (existingOrders.has(oid)) {
                        matchedOrders++;
                        finalPlatform = existingOrders.get(oid);
                    } else {
                        orphans++;
                        if (unmatchedSamples.length < 10) unmatchedSamples.push(`${oid} (SKU: ${sku})`);
                    }
                }

                const comments = commentMap.get(oid);
                const uniqueId = generateRefundId(rawSku, dateStr, amt, qty, reason, oid);

                let resendBase = undefined;
                if (oType.includes('resend') || oid.toLowerCase().includes('-resend')) {
                    let base = oid;
                    while (/-resend$/i.test(base)) base = base.replace(/-resend$/i, '');
                    resendBase = base;
                }

                refunds.push({
                    id: uniqueId,
                    sku,
                    rawSku,
                    date: dateStr,
                    amount: amt,
                    freightAmount: allocatedFreight,
                    quantity: qty,
                    platform: finalPlatform,
                    reason,
                    orderId: oid,
                    orderType: oType as any,
                    resendBaseOrderId: resendBase,
                    commentCn: comments?.cn,
                    commentEn: comments?.en
                });

                totalValue += ((amt + allocatedFreight) * VAT_MULTIPLIER);
            });
        });

        postProgress(100, 'Refund import ready');
        self.postMessage({
            type: 'success',
            refunds,
            stats: { count: refunds.length, totalValue, matchedOrders, orphans },
            debugInfo: { unmatchedSamples, dbSamples: [], mappedColumn: 'outer_order_id' }
        });
    } catch (error: any) {
        self.postMessage({
            type: 'error',
            error: error?.message || 'Failed to process refund files'
        });
    }
};
