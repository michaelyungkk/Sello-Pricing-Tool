/**
 * services/adCampaignService.ts
 *
 * All business logic for the Ad Campaign Manager:
 *   - CSV parsing (summary + detail)
 *   - Metric derivation
 *   - Auto-flag logic
 *   - Funnel diagnosis
 *   - Summary text generation
 *   - Budget recommendations
 *   - Candidate scoring
 */

import {
    AdSnapshot,
    AdCampaign,
    AdGroupSnapshot,
    DailySkuRow,
    AdSkuWeeklySummary,
    AdSkuFlag,
    AdRosterChange,
    AdCandidate,
} from '../types';
import { Product, PriceLog } from '../types';

// ─────────────────────────────────────────────────────────────
//  CSV PARSING
// ─────────────────────────────────────────────────────────────

export interface ParsedCsvResult {
    type: 'summary' | 'detail' | 'unknown';
    rows: Record<string, string>[];
    headers: string[];
}

function parseCsv(raw: string): { headers: string[]; rows: Record<string, string>[] } {
    const lines = raw.trim().split('\n');
    if (lines.length < 2) return { headers: [], rows: [] };
    const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
        const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
        return row;
    });
    return { headers, rows };
}

function detectCsvType(headers: string[]): 'summary' | 'detail' | 'unknown' {
    const h = headers.map(x => x.toLowerCase());
    if ((h.some(x => x.includes('date')) || h.some(x => x === 'day')) && h.some(x => x.includes('offer'))) return 'detail';
    if (h.some(x => x.includes('ad group')) && h.some(x => x.includes('roas'))) return 'summary';
    return 'unknown';
}

export function detectAndParseCsv(raw: string): ParsedCsvResult {
    const { headers, rows } = parseCsv(raw);
    const type = detectCsvType(headers);
    return { type, rows, headers };
}

// ─────────────────────────────────────────────────────────────
//  SUMMARY CSV → AdGroupSnapshot[]
// ─────────────────────────────────────────────────────────────

function n(v: string | undefined | null): number {
    if (!v) return 0;
    const s = String(v).trim();
    if (!s) return 0;
    const num = Number(s);
    // Platform exports zero as "0E-17" or "0E-18" — these parse correctly via Number()
    return isNaN(num) ? 0 : Math.abs(num) < 1e-10 ? 0 : num;
}

export function parseSummaryCsv(
    rows: Record<string, string>[],
    budgets: Record<string, number>,
    platform: string
): AdCampaign[] {
    const campaignMap = new Map<string, { account: string; groups: AdGroupSnapshot[] }>();

    for (const row of rows) {
        const campaignName = row['Campaign'] ?? row['campaign'] ?? '';
        const adGroupName = row['Ad group'] ?? row['Ad Group'] ?? row['ad_group'] ?? '';
        const account = row['Account'] ?? '';

        if (!campaignName || !adGroupName) continue;

        const budgetKey = `${platform}::${adGroupName}`;
        const dailyBudget = budgets[budgetKey] ?? 0;

        const spend = n(row['Spend']);
        const sales = n(row['Sales']);
        const spendOptIn = n(row['Spend (Opt In only)']);
        const roasOptIn = n(row['ROAS (Opt In only)']);
        const acosOptIn = n(row['ACoS (Opt In only)']);
        const impressions = n(row['Impressions']);
        const clicks = n(row['Clicks']);
        const conversions = n(row['Conversions']);
        const orders = n(row['Orders']);

        // Direct metrics — from detail CSV if available, else 0
        const directSales = n(row['Direct Sales'] ?? row['direct_sales']);
        const directOrders = n(row['Direct Orders'] ?? row['direct_orders']);
        const directConversions = n(row['Direct Conversions'] ?? row['direct_conversions']);

        const group: AdGroupSnapshot = {
            name: adGroupName,
            dailyBudget,
            bidStrategy: 'auto',
            impressions,
            clicks,
            spend,
            spendOptIn,
            conversions,
            orders,
            sales,
            ctr: impressions > 0 ? clicks / impressions : 0,
            cpc: clicks > 0 ? spend / clicks : 0,
            acosOptIn,
            roasOptIn,
            directConversions,
            directOrders,
            directSales,
            directRoas: spend > 0 ? directSales / spend : 0,
            utilisation: dailyBudget > 0 ? spend / (dailyBudget * 7) : 0,
            spendToSalesRatio: sales > 0 ? spend / sales : 0,
            haloEffect: sales > 0 ? (sales - directSales) / sales : 0,
            memberSkus: [],
            weeklySummary: '',
        };

        if (!campaignMap.has(campaignName)) {
            campaignMap.set(campaignName, { account, groups: [] });
        }
        campaignMap.get(campaignName)!.groups.push(group);
    }

    return Array.from(campaignMap.entries()).map(([name, { account, groups }]) => ({
        name,
        account,
        adGroups: groups,
        weeklySummary: '',
    }));
}

// ─────────────────────────────────────────────────────────────
//  DETAIL CSV → DailySkuRow[]
// ─────────────────────────────────────────────────────────────

export function parseDetailCsv(
    rows: Record<string, string>[],
    learnedAliases: Record<string, string>
): DailySkuRow[] {
    return rows.map(row => {
        const offerSku = row['Offer SKU'] ?? row['offer_sku'] ?? row['SKU'] ?? '';
        const mappedSku = learnedAliases[offerSku.toUpperCase()] ?? offerSku;
        // Handle "Day" column and strip time/timezone suffix e.g. "2026-03-22 00:00:00+00:00"
        const rawDate = row['Day'] ?? row['Date'] ?? row['date'] ?? '';
        const date = rawDate.split(' ')[0].split('T')[0];
        return {
            date,
            campaign: row['Campaign'] ?? row['campaign'] ?? '',
            adGroup: row['Ad group'] ?? row['Ad Group'] ?? row['ad_group'] ?? '',
            offerSku,
            mappedSku,
            productName: row['Product name'] ?? row['Product Name'] ?? row['product_name'] ?? '',
            productCategory: row['Product category'] ?? row['Product Category'] ?? row['Category'] ?? row['category'] ?? '',
            brand: row['Brand'] ?? row['brand'] ?? '',
            impressions: n(row['Impressions']),
            clicks: n(row['Clicks']),
            spend: n(row['Spend']),
            conversions: n(row['Conversions']),
            orders: n(row['Orders']),
            sales: n(row['Sales']),
            directConversions: n(row['Direct Conversions'] ?? row['direct_conversions']),
            directOrders: n(row['Direct Orders'] ?? row['direct_orders']),
            directSales: n(row['Direct Sales'] ?? row['direct_sales']),
        };
    });
}

// ─────────────────────────────────────────────────────────────
//  WEEK DETECTION
// ─────────────────────────────────────────────────────────────

export function detectWeekFromDetailRows(rows: DailySkuRow[]): {
    weekStartDate: string;
    weekEndDate: string;
} {
    // Use actual date range from data — no Mon-Sun snapping
    const dates = rows
        .map(r => r.date)
        .filter(d => d && d.length >= 10)
        .sort();

    if (dates.length === 0) {
        // Fallback: last 7 days
        const now = new Date();
        const end = new Date(now);
        end.setDate(now.getDate() - 1);
        const start = new Date(end);
        start.setDate(end.getDate() - 6);
        return {
            weekStartDate: start.toISOString().split('T')[0],
            weekEndDate: end.toISOString().split('T')[0],
        };
    }

    return {
        weekStartDate: dates[0],
        weekEndDate: dates[dates.length - 1],
    };
}

export function weekLabel(startDate: string): string {
    const d = new Date(startDate);
    const end = new Date(d);
    end.setDate(d.getDate() + 6);
    const fmt = (dt: Date) => dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    return `${fmt(d)} – ${fmt(end)}`;
}

// ─────────────────────────────────────────────────────────────
//  POAS
// ─────────────────────────────────────────────────────────────

export function calculatePoas(
    sku: string,
    adSpend: number,
    adSales: number,
    products: Product[]
): number {
    const product = products.find(p => p.sku === sku);
    if (!product || adSpend === 0 || adSales === 0) return 0;
    const marginPct = (product as any).netProfitMargin ?? (product as any).periodMargin ?? 0;
    const estimatedProfit = adSales * (marginPct / 100);
    return estimatedProfit / adSpend;
}

// ─────────────────────────────────────────────────────────────
//  GRACE PERIOD
// ─────────────────────────────────────────────────────────────

export function shouldFlagZeroSales(
    sku: AdSkuWeeklySummary
): 'ZERO_SALES' | 'MONITORING' | null {
    if (sku.sales > 0 || sku.spend === 0) return null;
    if (sku.weeksInGroup <= 2) {
        if (sku.impressions > 200 && sku.clicks === 0) return 'ZERO_SALES';
        return 'MONITORING';
    }
    return 'ZERO_SALES';
}

// ─────────────────────────────────────────────────────────────
//  AUTO-FLAG
// ─────────────────────────────────────────────────────────────

export function flagSku(
    sku: AdSkuWeeklySummary,
    adGroupTotalSpend: number,
    groupAvgCtr: number,
    product: Product | undefined,
    prevWeeks: AdSkuWeeklySummary[]
): AdSkuFlag[] {
    const flags: AdSkuFlag[] = [];

    const zeroFlag = shouldFlagZeroSales(sku);
    if (zeroFlag) flags.push(zeroFlag);

    if (prevWeeks.length >= 2) {
        const recent = [
            ...prevWeeks.slice(-2).map(w => w.sales),
            sku.sales,
        ];
        if (recent[2] < recent[1] && recent[1] < recent[0] && recent[0] > 0) {
            flags.push('DOWNTREND');
        }
    }

    if (sku.spendShare > 0.30) {
        if (sku.roas < 2) flags.push('BUDGET_HOG_LOW_ROAS');
        else if (sku.roas > 3) flags.push('BUDGET_HOG_HIGH_ROAS');
    }

    if (product?.gradeLevel !== undefined) {
        if (product.gradeLevel < 4 || product.gradeLevel > 7) {
            flags.push('GRADE_CHANGED');
        }
    }

    if (product) {
        const runway = product.daysRemaining / 7;
        if (runway < 4 && product.stockLevel < 10) flags.push('LOW_STOCK');
    }

    if (sku.impressions > 100 && sku.ctrVsGroupAvg < 0.5) flags.push('LOW_CTR');

    if (sku.clicks > 10 && sku.conversions === 0 && sku.spend > 0) {
        flags.push('HIGH_CLICKS_NO_CONVERSION');
    }

    if (sku.sales > 0 && sku.directSales === 0) flags.push('HALO_ONLY');

    return flags;
}

// ─────────────────────────────────────────────────────────────
//  FUNNEL DIAGNOSIS
// ─────────────────────────────────────────────────────────────

export type FunnelDiagnosis = 'LISTING_ISSUE' | 'PRODUCT_PAGE_ISSUE' | 'HALO_TRAFFIC' | 'HEALTHY' | 'UNDERPERFORMING' | 'INSUFFICIENT_DATA';

export function diagnoseSkuFunnel(
    sku: AdSkuWeeklySummary,
    groupAvgCtr: number,
    groupAvgConvRate: number
): FunnelDiagnosis {
    const ctr = sku.impressions > 0 ? sku.clicks / sku.impressions : 0;
    const convRate = sku.clicks > 0 ? sku.conversions / sku.clicks : 0;

    if (sku.impressions < 50) return 'INSUFFICIENT_DATA';
    if (sku.impressions > 100 && ctr < groupAvgCtr * 0.5) return 'LISTING_ISSUE';
    if (sku.clicks > 10 && convRate === 0) return 'PRODUCT_PAGE_ISSUE';
    if (sku.conversions > 0 && sku.directConversions === 0) return 'HALO_TRAFFIC';
    if (sku.directConversions > 0 && sku.directRoas > 1) return 'HEALTHY';
    return 'UNDERPERFORMING';
}

export const FUNNEL_DIAGNOSIS_LABELS: Record<FunnelDiagnosis, { label: string; color: string }> = {
    LISTING_ISSUE: { label: 'Listing Issue', color: 'b-amber' },
    PRODUCT_PAGE_ISSUE: { label: 'Page Issue', color: 'b-orange' },
    HALO_TRAFFIC: { label: 'Halo Only', color: 'b-blue' },
    HEALTHY: { label: 'Healthy', color: 'b-green' },
    UNDERPERFORMING: { label: 'Underperforming', color: 'b-red' },
    INSUFFICIENT_DATA: { label: 'Low Data', color: 'b-gray' },
};

// ─────────────────────────────────────────────────────────────
//  SUMMARY TEXT GENERATION
// ─────────────────────────────────────────────────────────────

export function generateAdGroupSummary(
    group: AdGroupSnapshot,
    prevGroup: AdGroupSnapshot | null,
    skuSummaries: AdSkuWeeklySummary[]
): string {
    const parts: string[] = [];

    parts.push(
        `${group.name}: Broad ROAS ${group.roasOptIn.toFixed(2)} | Direct ROAS ${group.directRoas.toFixed(2)}.`
    );

    if (group.haloEffect > 0.5) {
        parts.push(
            `${Math.round(group.haloEffect * 100)}% of sales are cross-sell — ads driving store traffic, not product-level sales. Evaluate on CTR and total store contribution.`
        );
    } else if (group.haloEffect > 0.2) {
        parts.push(`${Math.round(group.haloEffect * 100)}% cross-sell effect. Mix of direct and halo sales.`);
    } else if (group.sales > 0) {
        parts.push(`Strong direct attribution — ads are selling the promoted products.`);
    }

    if (group.utilisation > 0.95) {
        parts.push(`Budget fully utilised (${Math.round(group.utilisation * 100)}%) — consider increasing if ROAS supports it.`);
    } else if (group.utilisation < 0.65 && group.dailyBudget > 0) {
        parts.push(`Low utilisation (${Math.round(group.utilisation * 100)}%) — remaining SKUs not absorbing budget. Lower budget or add more qualifying SKUs.`);
    }

    if (prevGroup) {
        if (group.sales > prevGroup.sales * 1.0 && prevGroup.sales > 0) {
            const pct = ((group.sales - prevGroup.sales) / prevGroup.sales * 100).toFixed(0);
            if (Number(pct) > 5) {
                parts.push(`Sales up ${pct}% week-over-week (£${prevGroup.sales.toFixed(0)} → £${group.sales.toFixed(0)}).`);
            }
        } else if (prevGroup.sales > 0 && group.sales < prevGroup.sales * 0.8) {
            const pct = Math.abs((group.sales - prevGroup.sales) / prevGroup.sales * 100).toFixed(0);
            parts.push(`⚠ Sales dropped ${pct}% (£${prevGroup.sales.toFixed(0)} → £${group.sales.toFixed(0)}). Review composition.`);
        }
    }

    if (group.sales > 0 && group.spendToSalesRatio > 0.05) {
        parts.push(`⚠ Ad spend is ${(group.spendToSalesRatio * 100).toFixed(1)}% of sales — above 5% target.`);
    }

    if (group.sales === 0 && group.spend > 0) {
        parts.push(`🔴 Zero conversions on £${group.spend.toFixed(2)} spend. Overhaul roster or pause group.`);
    }

    const flagCounts: Record<string, number> = {};
    skuSummaries.forEach(s => s.flags.forEach(f => { flagCounts[f] = (flagCounts[f] || 0) + 1; }));
    const flagParts: string[] = [];
    if (flagCounts['ZERO_SALES']) flagParts.push(`${flagCounts['ZERO_SALES']} zero-sales`);
    if (flagCounts['DOWNTREND']) flagParts.push(`${flagCounts['DOWNTREND']} downtrending`);
    if (flagCounts['BUDGET_HOG_LOW_ROAS']) flagParts.push(`${flagCounts['BUDGET_HOG_LOW_ROAS']} budget hog (low ROAS)`);
    if (flagCounts['GRADE_CHANGED']) flagParts.push(`${flagCounts['GRADE_CHANGED']} grade changed`);
    if (flagCounts['LOW_CTR']) flagParts.push(`${flagCounts['LOW_CTR']} low CTR`);
    if (flagParts.length > 0) parts.push(`Action items: ${flagParts.join(', ')}.`);

    return parts.join(' ');
}

export interface CampaignSummaryData {
    headline: { spend: number; sales: number; roas: number; directRoas: number };
    spendRatio: { value: number; isOk: boolean };
    trend: { direction: 'up' | 'down' | 'flat'; pct: number } | null;
    bestGroup: { name: string; roas: number } | null;
    worstGroup: { name: string; roas: number } | null;
}

export function getCampaignSummaryData(
    campaign: AdCampaign,
    prevCampaign: AdCampaign | null
): CampaignSummaryData {
    const totalSpend = campaign.adGroups.reduce((s, g) => s + g.spend, 0);
    const totalSales = campaign.adGroups.reduce((s, g) => s + g.sales, 0);
    const totalDirectSales = campaign.adGroups.reduce((s, g) => s + g.directSales, 0);
    const roas = totalSpend > 0 ? totalSales / totalSpend : 0;
    const directRoas = totalSpend > 0 ? totalDirectSales / totalSpend : 0;
    const spendRatio = totalSales > 0 ? totalSpend / totalSales : 0;

    let trend: CampaignSummaryData['trend'] = null;
    if (prevCampaign) {
        const prevSales = prevCampaign.adGroups.reduce((s, g) => s + g.sales, 0);
        if (prevSales > 0) {
            const pct = ((totalSales - prevSales) / prevSales) * 100;
            trend = { direction: pct > 5 ? 'up' : pct < -5 ? 'down' : 'flat', pct };
        }
    }

    const sorted = [...campaign.adGroups].filter(g => g.spend > 0).sort((a, b) => b.roasOptIn - a.roasOptIn);

    return {
        headline: { spend: totalSpend, sales: totalSales, roas, directRoas },
        spendRatio: { value: spendRatio, isOk: spendRatio <= 0.05 },
        trend,
        bestGroup: sorted.length > 1 ? { name: sorted[0].name, roas: sorted[0].roasOptIn } : null,
        worstGroup: sorted.length > 1 ? { name: sorted[sorted.length - 1].name, roas: sorted[sorted.length - 1].roasOptIn } : null,
    };
}

export function generateCampaignSummary(
    campaign: AdCampaign,
    prevCampaign: AdCampaign | null
): string {
    const parts: string[] = [];

    const totalSpend = campaign.adGroups.reduce((s, g) => s + g.spend, 0);
    const totalSales = campaign.adGroups.reduce((s, g) => s + g.sales, 0);
    const totalDirectSales = campaign.adGroups.reduce((s, g) => s + g.directSales, 0);
    const overallRoas = totalSpend > 0 ? totalSales / totalSpend : 0;
    const overallDirectRoas = totalSpend > 0 ? totalDirectSales / totalSpend : 0;
    const spendRatio = totalSales > 0 ? totalSpend / totalSales : 0;

    parts.push(
        `Weekly spend: £${totalSpend.toFixed(2)} | Sales: £${totalSales.toFixed(2)} | ROAS: ${overallRoas.toFixed(2)} (Direct: ${overallDirectRoas.toFixed(2)}).`
    );

    if (spendRatio <= 0.05) {
        parts.push(`✅ Spend-to-sales ratio ${(spendRatio * 100).toFixed(1)}% — within 5% target.`);
    } else if (totalSales > 0) {
        parts.push(`⚠ Spend-to-sales ratio ${(spendRatio * 100).toFixed(1)}% — exceeds 5% target. Tighten budgets.`);
    }

    if (prevCampaign) {
        const prevSales = prevCampaign.adGroups.reduce((s, g) => s + g.sales, 0);
        if (prevSales > 0) {
            if (totalSales > prevSales * 1.1) {
                parts.push(`Sales up ${((totalSales / prevSales - 1) * 100).toFixed(0)}% week-over-week.`);
            } else if (totalSales < prevSales * 0.9) {
                parts.push(`Sales down ${((1 - totalSales / prevSales) * 100).toFixed(0)}% week-over-week.`);
            }
        }
    }

    const sorted = [...campaign.adGroups].sort((a, b) => b.roasOptIn - a.roasOptIn);
    if (sorted.length > 1) {
        const best = sorted[0];
        const worst = sorted[sorted.length - 1];
        parts.push(`Best: ${best.name} (ROAS ${best.roasOptIn.toFixed(2)}). Worst: ${worst.name} (ROAS ${worst.roasOptIn.toFixed(2)}).`);
    }

    return parts.join(' ');
}


// ─────────────────────────────────────────────────────────────
//  EXCEL EXPORT — Campaign Master format
// ─────────────────────────────────────────────────────────────

export async function exportCampaignMasterXlsx(
    snapshots: AdSnapshot[],
    platform: string
): Promise<void> {
    const XLSX = await import('xlsx');

    // Sort weeks oldest → newest for columns
    const sorted = [...snapshots]
        .filter(s => s.platform === platform)
        .sort((a, b) => a.weekStartDate.localeCompare(b.weekStartDate));

    if (sorted.length === 0) return;

    const wb = XLSX.utils.book_new();

    // ── Colour helpers (ARGB) ──
    const TEAL       = 'FF134E4A';
    const TEAL_LIGHT = 'FFD1FAE5';
    const BLUE_H     = 'FFDBEAFE';
    const GREEN_H    = 'FFD1FAE5';
    const GRAY_H     = 'FFF3F4F6';
    const WHITE      = 'FFFFFFFF';
    const RED        = 'FFDC2626';
    const GREEN      = 'FF047857';
    const AMBER      = 'FFB45309';
    const GRAY_F     = 'FF6B7280';
    const DARK       = 'FF111827';

    const hFont = (bold = false, sz = 10, color = DARK, italic = false) => ({
        name: 'Arial', bold, sz, color: { rgb: color }, italic
    });
    const hFill = (rgb: string) => ({ patternType: 'solid' as const, fgColor: { rgb } });
    const hAlign = (horizontal: string, wrapText = false) => ({ horizontal, vertical: 'center', wrapText });
    const fmtGBP  = '£#,##0.00';
    const fmtPct  = '0.0%';
    const fmtROAS = '0.00"×"';
    const fmtInt  = '#,##0';

    const roasColor = (r: number) => r >= 3 ? GREEN : r >= 1.5 ? AMBER : RED;
    const utilColor = (u: number) => u >= 0.65 ? GREEN : u >= 0.5 ? AMBER : u > 0 ? RED : GRAY_F;

    // ══════════════════════════════════════════════════
    //  SHEET 1 — MASTER
    // ══════════════════════════════════════════════════
    const WEEK_COLS = 5; // Budget/d · Spend · Util · Sales · ROAS
    const STATIC_COLS = 4; // Campaign · Ad Group · Bid · Launch

    // Collect all unique ad group names per campaign across all snapshots
    const campaignNames = [...new Set(sorted.flatMap(s => s.campaigns.map(c => c.name)))];

    const aoa: any[][] = [];
    const styles: { r: number; c: number; s: any }[] = [];

    const addStyle = (r: number, c: number, s: any) => styles.push({ r, c, s });

    // Row 0: title
    aoa.push([`${platform} — Ad Campaign Master`, ...Array(STATIC_COLS - 1 + sorted.length * WEEK_COLS).fill('')]);
    addStyle(0, 0, { font: hFont(true, 13, TEAL), fill: hFill(TEAL_LIGHT), alignment: hAlign('left') });

    // Row 1: week spans
    const weekRow: any[] = ['', '', '', ''];
    sorted.forEach(snap => {
        weekRow.push(`${snap.weekStartDate} → ${snap.weekEndDate}`);
        for (let i = 1; i < WEEK_COLS; i++) weekRow.push('');
    });
    aoa.push(weekRow);
    sorted.forEach((_, wi) => {
        addStyle(1, STATIC_COLS + wi * WEEK_COLS, { font: hFont(true, 9, DARK), fill: hFill(BLUE_H), alignment: hAlign('center') });
    });

    // Row 2: sub-headers
    const subHdr = ['Campaign', 'Ad Group', 'Bid', 'Launch'];
    sorted.forEach(() => { subHdr.push('Daily Budget', 'Spend', 'Utilise', 'Sales', 'ROAS'); });
    aoa.push(subHdr);
    subHdr.forEach((_, ci) => {
        const bg = ci >= STATIC_COLS ? BLUE_H : GRAY_H;
        addStyle(2, ci, { font: hFont(true, 8, GRAY_F), fill: hFill(bg), alignment: hAlign('center') });
    });

    let dataRowStart = 3;

    for (const campName of campaignNames) {
        const campTotalRow: any[] = [campName, '', 'Auto', ''];
        const groupRowIndices: number[] = [];

        // Campaign total row (will reference group rows)
        const campRowIdx = aoa.length;
        aoa.push(campTotalRow);
        addStyle(campRowIdx, 0, { font: hFont(true, 10, TEAL), fill: hFill(TEAL_LIGHT), alignment: hAlign('left') });

        // Collect all group names for this campaign across snapshots
        const groupNames = [...new Set(
            sorted.flatMap(s => s.campaigns.find(c => c.name === campName)?.adGroups.map(g => g.name) ?? [])
        )];

        for (const groupName of groupNames) {
            const groupRowIdx = aoa.length;
            groupRowIndices.push(groupRowIdx);
            const row: any[] = ['', groupName, 'Auto', ''];

            let firstSpend = '';
            sorted.forEach((snap, wi) => {
                const g = snap.campaigns.find(c => c.name === campName)?.adGroups.find(g => g.name === groupName);
                if (g && g.spend > 0 && !firstSpend) firstSpend = snap.weekStartDate;
                row.push(g?.dailyBudget ?? 0);
                row.push(g?.spend ?? 0);
                row.push(g?.utilisation ?? 0);
                row.push(g?.sales ?? 0);
                row.push(g && g.spend > 0 ? g.roasOptIn : 0);
            });
            row[3] = firstSpend;
            aoa.push(row);

            // Style group row
            addStyle(groupRowIdx, 1, { font: hFont(false, 9, DARK), fill: hFill(WHITE), alignment: hAlign('left') });
            addStyle(groupRowIdx, 2, { font: hFont(false, 8, GRAY_F), alignment: hAlign('center') });
            addStyle(groupRowIdx, 3, { font: hFont(false, 8, GRAY_F), alignment: hAlign('center') });
            sorted.forEach((snap, wi) => {
                const g = snap.campaigns.find(c => c.name === campName)?.adGroups.find(g => g.name === groupName);
                const baseC = STATIC_COLS + wi * WEEK_COLS;
                // Budget
                addStyle(groupRowIdx, baseC,     { font: hFont(false, 9), fill: hFill(WHITE), alignment: hAlign('right'), numFmt: fmtGBP });
                // Spend
                addStyle(groupRowIdx, baseC + 1, { font: hFont(true,  9), fill: hFill(BLUE_H), alignment: hAlign('right'), numFmt: fmtGBP });
                // Util
                const uc = utilColor(g?.utilisation ?? 0);
                addStyle(groupRowIdx, baseC + 2, { font: hFont(false, 9, uc), alignment: hAlign('right'), numFmt: fmtPct });
                // Sales
                addStyle(groupRowIdx, baseC + 3, { font: hFont(true, 9), fill: hFill(BLUE_H), alignment: hAlign('right'), numFmt: fmtGBP });
                // ROAS
                const rc = roasColor(g?.roasOptIn ?? 0);
                addStyle(groupRowIdx, baseC + 4, { font: hFont(true, 9, rc), alignment: hAlign('right'), numFmt: fmtROAS });
            });
        }

        // Fill campaign total row with sums
        sorted.forEach((snap, wi) => {
            const camp = snap.campaigns.find(c => c.name === campName);
            const totalSpend = camp?.adGroups.reduce((s, g) => s + g.spend, 0) ?? 0;
            const totalSales = camp?.adGroups.reduce((s, g) => s + g.sales, 0) ?? 0;
            const baseC = STATIC_COLS + wi * WEEK_COLS;
            campTotalRow.push('—', totalSpend, '—', totalSales, totalSpend > 0 ? totalSales / totalSpend : 0);
            addStyle(campRowIdx, baseC,     { font: hFont(true, 9, TEAL), fill: hFill(TEAL_LIGHT), alignment: hAlign('center') });
            addStyle(campRowIdx, baseC + 1, { font: hFont(true, 9, TEAL), fill: hFill(GREEN_H), alignment: hAlign('right'), numFmt: fmtGBP });
            addStyle(campRowIdx, baseC + 2, { font: hFont(true, 9, TEAL), fill: hFill(TEAL_LIGHT), alignment: hAlign('center') });
            addStyle(campRowIdx, baseC + 3, { font: hFont(true, 9, TEAL), fill: hFill(GREEN_H), alignment: hAlign('right'), numFmt: fmtGBP });
            addStyle(campRowIdx, baseC + 4, { font: hFont(true, 9, TEAL), fill: hFill(TEAL_LIGHT), alignment: hAlign('right'), numFmt: fmtROAS });
        });

        // Blank separator row
        aoa.push(Array(STATIC_COLS + sorted.length * WEEK_COLS).fill(''));
    }

    const ws1 = XLSX.utils.aoa_to_sheet(aoa);

    // Apply styles
    for (const { r, c, s } of styles) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (!ws1[cellRef]) ws1[cellRef] = { t: 'z', v: '' };
        ws1[cellRef].s = s;
    }

    // Merge cells: title row, week spans
    ws1['!merges'] = [
        { s: { r: 0, c: 0 }, e: { r: 0, c: STATIC_COLS + sorted.length * WEEK_COLS - 1 } },
        ...sorted.map((_, wi) => ({
            s: { r: 1, c: STATIC_COLS + wi * WEEK_COLS },
            e: { r: 1, c: STATIC_COLS + wi * WEEK_COLS + WEEK_COLS - 1 }
        }))
    ];

    // Column widths
    ws1['!cols'] = [
        { wch: 20 }, { wch: 24 }, { wch: 8 }, { wch: 12 },
        ...sorted.flatMap(() => [{ wch: 13 }, { wch: 13 }, { wch: 10 }, { wch: 13 }, { wch: 10 }])
    ];
    ws1['!rows'] = [{ hpx: 22 }, { hpx: 18 }, { hpx: 14 }];

    XLSX.utils.book_append_sheet(wb, ws1, 'Master');

    // ══════════════════════════════════════════════════
    //  SHEETS 2+ — ONE PER AD GROUP (all campaigns)
    // ══════════════════════════════════════════════════
    const STATIC_SKU = 5; // SKU | Product | Brand | Grade | Stock
    const WEEK_SKU   = 9; // Impr | Clicks | CTR | Spend | Spend% | Broad Sales | Direct Sales | Broad ROAS | Direct ROAS

    const allGroupNames = [...new Set(
        sorted.flatMap(s => s.campaigns.flatMap(c => c.adGroups.map(g => ({ camp: c.name, group: g.name }))))
            .map(x => `${x.camp}||${x.group}`)
    )];

    for (const key of allGroupNames) {
        const [campName, groupName] = key.split('||');
        const sheetName = `${groupName}`.slice(0, 31).replace(/[*/\?[\]:]/g, '-');

        const aoa2: any[][] = [];
        const styles2: { r: number; c: number; s: any }[] = [];
        const addStyle2 = (r: number, c: number, s: any) => styles2.push({ r, c, s });

        // Row 0: title
        aoa2.push([`${campName} — ${groupName}`, ...Array(STATIC_SKU - 1 + sorted.length * WEEK_SKU).fill('')]);
        addStyle2(0, 0, { font: hFont(true, 12, TEAL), fill: hFill(TEAL_LIGHT), alignment: hAlign('left') });

        // Row 1: group summary
        const latestGroup = sorted.slice().reverse().flatMap(s =>
            s.campaigns.find(c => c.name === campName)?.adGroups.filter(g => g.name === groupName) ?? []
        )[0];
        const summaryText = latestGroup
            ? `Spend: £${latestGroup.spend.toFixed(2)} | Sales: £${latestGroup.sales.toFixed(2)} | ROAS: ${latestGroup.roasOptIn.toFixed(2)}× | Util: ${(latestGroup.utilisation * 100).toFixed(0)}% | ${latestGroup.weeklySummary ?? ''}`
            : '';
        aoa2.push([summaryText, ...Array(STATIC_SKU - 1 + sorted.length * WEEK_SKU).fill('')]);
        addStyle2(1, 0, { font: hFont(false, 8, GRAY_F, true), alignment: hAlign('left', true) });

        // Row 2: week spans
        const weekRow2 = Array(STATIC_SKU).fill('');
        sorted.forEach(snap => {
            weekRow2.push(`${snap.weekStartDate} → ${snap.weekEndDate}`);
            for (let i = 1; i < WEEK_SKU; i++) weekRow2.push('');
        });
        aoa2.push(weekRow2);
        sorted.forEach((_, wi) => {
            addStyle2(2, STATIC_SKU + wi * WEEK_SKU, { font: hFont(true, 9, DARK), fill: hFill(BLUE_H), alignment: hAlign('center') });
        });

        // Row 3: headers
        const hdr3 = ['SKU', 'Product Name', 'Brand', 'Grade', 'Stock'];
        sorted.forEach(() => { hdr3.push('Impressions', 'Clicks', 'CTR', 'Spend', 'Spend%', 'Broad Sales', 'Direct Sales', 'Broad ROAS', 'Direct ROAS'); });
        aoa2.push(hdr3);
        hdr3.forEach((_, ci) => {
            const bg = ci >= STATIC_SKU ? BLUE_H : GRAY_H;
            addStyle2(3, ci, { font: hFont(true, 8, GRAY_F), fill: hFill(bg), alignment: hAlign('center') });
        });

        // Group total row (row 4)
        const totalRow2: any[] = ['TOTAL', groupName, '', '', ''];
        sorted.forEach(snap => {
            const g = snap.campaigns.find(c => c.name === campName)?.adGroups.find(g => g.name === groupName);
            const totalImpr  = g?.impressions ?? 0;
            const totalClicks = g?.clicks ?? 0;
            const totalSpend = g?.spend ?? 0;
            const totalSales = g?.sales ?? 0;
            const totalDirect = g?.directSales ?? 0;
            totalRow2.push(
                totalImpr, totalClicks,
                totalImpr > 0 ? totalClicks / totalImpr : 0,
                totalSpend,
                1.0,
                totalSales, totalDirect,
                totalSpend > 0 ? totalSales / totalSpend : 0,
                totalSpend > 0 ? totalDirect / totalSpend : 0
            );
        });
        aoa2.push(totalRow2);
        addStyle2(4, 0, { font: hFont(true, 9, TEAL), fill: hFill(TEAL_LIGHT), alignment: hAlign('left') });
        sorted.forEach((_, wi) => {
            const bc = STATIC_SKU + wi * WEEK_SKU;
            addStyle2(4, bc,     { font: hFont(true, 9, DARK), fill: hFill(GRAY_H), alignment: hAlign('right'), numFmt: fmtInt });      // Impr
            addStyle2(4, bc + 1, { font: hFont(true, 9, DARK), fill: hFill(GRAY_H), alignment: hAlign('right'), numFmt: fmtInt });      // Clicks
            addStyle2(4, bc + 2, { font: hFont(true, 9, DARK), fill: hFill(GRAY_H), alignment: hAlign('right'), numFmt: fmtPct });      // CTR
            addStyle2(4, bc + 3, { font: hFont(true, 9, TEAL), fill: hFill(BLUE_H), alignment: hAlign('right'), numFmt: fmtGBP });     // Spend
            addStyle2(4, bc + 4, { font: hFont(true, 9, DARK), fill: hFill(GRAY_H), alignment: hAlign('right'), numFmt: fmtPct });      // Spend%
            addStyle2(4, bc + 5, { font: hFont(true, 9, TEAL), fill: hFill(BLUE_H), alignment: hAlign('right'), numFmt: fmtGBP });     // Broad Sales
            addStyle2(4, bc + 6, { font: hFont(true, 9, TEAL), fill: hFill(BLUE_H), alignment: hAlign('right'), numFmt: fmtGBP });     // Direct Sales
            addStyle2(4, bc + 7, { font: hFont(true, 9, TEAL), fill: hFill(GREEN_H), alignment: hAlign('right'), numFmt: fmtROAS });   // Broad ROAS
            addStyle2(4, bc + 8, { font: hFont(true, 9, TEAL), fill: hFill(GREEN_H), alignment: hAlign('right'), numFmt: fmtROAS });   // Direct ROAS
        });

        // SKU rows from daily data
        const skuSet = new Map<string, { name: string; brand: string; category: string }>();
        sorted.forEach(snap => {
            snap.dailySkuData
                .filter(r => r.adGroup === groupName && (r.mappedSku || r.offerSku))
                .forEach(r => {
                    const sku = r.mappedSku || r.offerSku;
                    if (!skuSet.has(sku)) skuSet.set(sku, { name: r.productName ?? '', brand: r.brand ?? '', category: r.productCategory ?? '' });
                });
        });

        // Aggregate per SKU per week
        [...skuSet.entries()].forEach(([sku, meta], si) => {
            const skuRow: any[] = [sku, meta.name, meta.brand, '', ''];
            sorted.forEach(snap => {
                const rows = snap.dailySkuData.filter(r =>
                    r.adGroup === groupName && (r.mappedSku === sku || r.offerSku === sku));
                const impr    = rows.reduce((a, r) => a + r.impressions, 0);
                const clicks  = rows.reduce((a, r) => a + r.clicks, 0);
                const spend   = rows.reduce((a, r) => a + r.spend, 0);
                const sales   = rows.reduce((a, r) => a + r.sales, 0);
                const direct  = rows.reduce((a, r) => a + r.directSales, 0);
                const totalGroupSpend = snap.campaigns.find(c => c.name === campName)
                    ?.adGroups.find(g => g.name === groupName)?.spend ?? 0;
                skuRow.push(
                    impr, clicks,
                    impr > 0 ? clicks / impr : 0,
                    spend,
                    totalGroupSpend > 0 ? spend / totalGroupSpend : 0,
                    sales, direct,
                    spend > 0 ? sales / spend : 0,
                    spend > 0 ? direct / spend : 0
                );
            });
            const skuRowIdx = aoa2.length;
            aoa2.push(skuRow);

            addStyle2(skuRowIdx, 0, { font: hFont(true, 9, DARK), alignment: hAlign('left') });
            addStyle2(skuRowIdx, 1, { font: hFont(false, 8, GRAY_F), alignment: hAlign('left') });
            sorted.forEach((_, wi) => {
                const bc = STATIC_SKU + wi * WEEK_SKU;
                const row2 = aoa2[skuRowIdx];
                const sp  = row2[bc + 3] as number;  // Spend
                const sa  = row2[bc + 5] as number;  // Broad Sales
                const rB  = row2[bc + 7] as number;  // Broad ROAS
                const rD  = row2[bc + 8] as number;  // Direct ROAS
                addStyle2(skuRowIdx, bc,     { font: hFont(false, 9), alignment: hAlign('right'), numFmt: fmtInt });       // Impr
                addStyle2(skuRowIdx, bc + 1, { font: hFont(false, 9), alignment: hAlign('right'), numFmt: fmtInt });       // Clicks
                addStyle2(skuRowIdx, bc + 2, { font: hFont(false, 9), alignment: hAlign('right'), numFmt: fmtPct });       // CTR
                addStyle2(skuRowIdx, bc + 3, { font: hFont(false, 9), fill: hFill(sp > 0 ? 'FFDBEAFE' : WHITE), alignment: hAlign('right'), numFmt: fmtGBP }); // Spend
                addStyle2(skuRowIdx, bc + 4, { font: hFont(false, 9), alignment: hAlign('right'), numFmt: fmtPct });       // Spend%
                addStyle2(skuRowIdx, bc + 5, { font: hFont(sa > 0, 9, sa > 0 ? GREEN : GRAY_F), fill: hFill(sa > 0 ? 'FFD1FAE5' : WHITE), alignment: hAlign('right'), numFmt: fmtGBP }); // Broad Sales
                addStyle2(skuRowIdx, bc + 6, { font: hFont(false, 9), alignment: hAlign('right'), numFmt: fmtGBP });      // Direct Sales
                addStyle2(skuRowIdx, bc + 7, { font: hFont(true, 9, roasColor(rB)), fill: hFill('FFD1FAE5'), alignment: hAlign('right'), numFmt: fmtROAS }); // Broad ROAS
                addStyle2(skuRowIdx, bc + 8, { font: hFont(true, 9, roasColor(rD)), fill: hFill('FFD1FAE5'), alignment: hAlign('right'), numFmt: fmtROAS }); // Direct ROAS
            });
        });

        if (skuSet.size === 0) {
            aoa2.push(['Upload detail CSV to see SKU-level data', ...Array(STATIC_SKU - 1 + sorted.length * WEEK_SKU).fill('')]);
            addStyle2(aoa2.length - 1, 0, { font: hFont(false, 9, GRAY_F, true), alignment: hAlign('left') });
        }

        const ws2 = XLSX.utils.aoa_to_sheet(aoa2);
        for (const { r, c, s } of styles2) {
            const cellRef = XLSX.utils.encode_cell({ r, c });
            if (!ws2[cellRef]) ws2[cellRef] = { t: 'z', v: '' };
            ws2[cellRef].s = s;
        }

        ws2['!merges'] = [
            { s: { r: 0, c: 0 }, e: { r: 0, c: STATIC_SKU + sorted.length * WEEK_SKU - 1 } },
            { s: { r: 1, c: 0 }, e: { r: 1, c: STATIC_SKU + sorted.length * WEEK_SKU - 1 } },
            ...sorted.map((_, wi) => ({
                s: { r: 2, c: STATIC_SKU + wi * WEEK_SKU },
                e: { r: 2, c: STATIC_SKU + wi * WEEK_SKU + WEEK_SKU - 1 }
            }))
        ];
        ws2['!cols'] = [
            { wch: 18 }, { wch: 32 }, { wch: 14 }, { wch: 8 }, { wch: 8 },
            ...sorted.flatMap(() => [{ wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 12 }, { wch: 8 }, { wch: 13 }, { wch: 13 }, { wch: 11 }, { wch: 11 }])
        ];
        ws2['!rows'] = [{ hpx: 22 }, { hpx: 30 }, { hpx: 16 }, { hpx: 14 }];

        XLSX.utils.book_append_sheet(wb, ws2, sheetName);
    }

    // ── Write & download ──
    const filename = `CampaignMaster_${platform.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    XLSX.writeFile(wb, filename, { bookType: 'xlsx', type: 'binary', cellStyles: true });
}

// ─────────────────────────────────────────────────────────────
//  BUDGET RECOMMENDATIONS
// ─────────────────────────────────────────────────────────────

export interface BudgetRecommendation {
    action: 'INCREASE' | 'DECREASE' | 'MAINTAIN';
    reason: string;
    suggestedBudget?: number;
}

export function getBudgetRecommendation(
    group: AdGroupSnapshot,
    prevGroup: AdGroupSnapshot | null,
    targetSpendToSalesRatio = 0.05
): BudgetRecommendation {
    if (group.roasOptIn > 3 && group.utilisation > 0.9) {
        return {
            action: 'INCREASE',
            reason: `Strong ROAS (${group.roasOptIn.toFixed(1)}) and fully utilised (${Math.round(group.utilisation * 100)}%). Increase to capture more sales.`,
            suggestedBudget: Math.ceil(group.dailyBudget * 1.25),
        };
    }

    if (group.spendToSalesRatio > targetSpendToSalesRatio && group.sales > 0) {
        return {
            action: 'DECREASE',
            reason: `Spend/sales ${(group.spendToSalesRatio * 100).toFixed(1)}% exceeds ${(targetSpendToSalesRatio * 100).toFixed(0)}% target.`,
            suggestedBudget: Math.floor(group.dailyBudget * 0.8),
        };
    }

    if (prevGroup && group.utilisation < 0.65 && prevGroup.utilisation > 0.85) {
        return {
            action: 'DECREASE',
            reason: `Utilisation dropped from ${Math.round(prevGroup.utilisation * 100)}% to ${Math.round(group.utilisation * 100)}% — remaining SKUs not absorbing budget.`,
            suggestedBudget: Math.floor(group.dailyBudget * (group.utilisation / 0.85)),
        };
    }

    if (prevGroup && prevGroup.sales > 0 && group.sales < prevGroup.sales * 0.8) {
        return {
            action: 'DECREASE',
            reason: `Sales dropped ${Math.round((1 - group.sales / prevGroup.sales) * 100)}% WoW.`,
        };
    }

    if (group.sales === 0 && group.spend > 0) {
        return {
            action: 'DECREASE',
            reason: `Zero sales on £${group.spend.toFixed(2)} spend. Pause or overhaul.`,
            suggestedBudget: Math.max(5, Math.floor(group.dailyBudget * 0.5)),
        };
    }

    return { action: 'MAINTAIN', reason: 'Performance within targets.' };
}

// ─────────────────────────────────────────────────────────────
//  CANDIDATE SUGGESTIONS
// ─────────────────────────────────────────────────────────────

export function findAdCandidates(
    products: Product[],
    salesHistory: PriceLog[],
    existingAdSkus: Set<string>,
    platform: string
): AdCandidate[] {
    // Aggregate last 30 days for this platform
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = cutoff.toISOString().split('T')[0];

    const skuTotals = new Map<string, { sales: number; units: number }>();
    for (const log of salesHistory) {
        if (log.platform !== platform) continue;
        if (log.date < cutoffStr) continue;
        const existing = skuTotals.get(log.sku) ?? { sales: 0, units: 0 };
        existing.sales += (log.price ?? 0) * (log.velocity ?? 0);
        existing.units += log.velocity ?? 0;
        skuTotals.set(log.sku, existing);
    }

    const totalSales = Array.from(skuTotals.values()).reduce((s, v) => s + v.sales, 0);

    const sorted = Array.from(skuTotals.entries())
        .sort((a, b) => b[1].sales - a[1].sales)
        .slice(0, 100);

    const candidates: AdCandidate[] = [];

    for (let i = 0; i < sorted.length; i++) {
        const [sku, data] = sorted[i];
        const product = products.find(p => p.sku === sku);
        if (!product) continue;

        const grade = product.gradeLevel ?? 0;
        const stock = product.stockLevel ?? 0;
        const runway = product.daysRemaining / 7;

        if (grade < 4 || grade > 7) continue;
        if (stock < 10) continue;

        const salesShare = totalSales > 0 ? data.sales / totalSales : 0;
        const reasons: string[] = [];
        reasons.push(`Top ${i + 1} seller on ${platform} (last 30 days)`);
        reasons.push(`Grade ${grade}`);
        reasons.push(`Stock: ${stock} units (${runway.toFixed(1)}w runway)`);

        const score =
            salesShare * 0.40 +
            Math.min(1, stock / 100) * 0.25 +
            ((grade - 3) / 4) * 0.20 +
            (existingAdSkus.has(sku) ? 0 : 0.15);

        const isAlready = existingAdSkus.has(sku);

        candidates.push({
            sku,
            productName: product.name,
            brand: product.brand ?? '',
            category: product.category ?? '',
            gradeLevel: grade,
            stockQty: stock,
            runway,
            platformSales30d: data.sales,
            platformUnits30d: data.units,
            platformSalesShare: salesShare,
            score,
            reasons,
            isAlreadyInAdGroup: isAlready,
        });
    }

    return candidates.sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────
//  SNAPSHOT BUILDER
// ─────────────────────────────────────────────────────────────

export function buildSnapshot(
    platform: string,
    campaigns: AdCampaign[],
    dailySkuData: DailySkuRow[],
    weekStartDate: string,
    weekEndDate: string,
    prevSnapshot: AdSnapshot | null,
    products: Product[]
): AdSnapshot {
    // Generate summaries
    const enrichedCampaigns = campaigns.map(campaign => {
        const prevCampaign = prevSnapshot?.campaigns.find(c => c.name === campaign.name) ?? null;

        const adGroups = campaign.adGroups.map(group => {
            const prevGroup = prevCampaign?.adGroups.find(g => g.name === group.name) ?? null;
            const skuSummaries: AdSkuWeeklySummary[] = buildSkuSummaries(
                group.name,
                campaign.name,
                dailySkuData,
                prevSnapshot,
                products
            );

            // Derive memberSkus from detail CSV data
            const groupDetailRows = dailySkuData.filter(
                r => r.adGroup === group.name && r.campaign === campaign.name
            );
            const memberSkus = [...new Set(
                groupDetailRows
                    .map(r => r.mappedSku || r.offerSku)
                    .filter(Boolean)
            )];

            // Aggregate direct metrics from detail CSV (more accurate than summary-level zeros)
            const totalDirectSales = groupDetailRows.reduce((s, r) => s + r.directSales, 0);
            const totalDirectOrders = groupDetailRows.reduce((s, r) => s + r.directOrders, 0);
            const totalDirectConversions = groupDetailRows.reduce((s, r) => s + r.directConversions, 0);
            const directRoas = group.spend > 0 ? totalDirectSales / group.spend : 0;
            const haloEffect = group.sales > 0 ? (group.sales - totalDirectSales) / group.sales : 0;

            const weeklySummary = generateAdGroupSummary(group, prevGroup, skuSummaries);
            return {
                ...group,
                memberSkus,
                weeklySummary,
                directSales: totalDirectSales,
                directOrders: totalDirectOrders,
                directConversions: totalDirectConversions,
                directRoas,
                haloEffect,
            };
        });

        const campaignWithGroups = { ...campaign, adGroups };
        const weeklySummary = generateCampaignSummary(campaignWithGroups, prevCampaign);
        return { ...campaignWithGroups, weeklySummary };
    });

    return {
        id: `adcampaign-${platform}-${weekStartDate}-${Date.now()}`,
        platform,
        weekStartDate,
        weekEndDate,
        importedAt: new Date().toISOString(),
        campaigns: enrichedCampaigns,
        dailySkuData,
    };
}

function buildSkuSummaries(
    adGroupName: string,
    campaignName: string,
    dailySkuData: DailySkuRow[],
    prevSnapshot: AdSnapshot | null,
    products: Product[]
): AdSkuWeeklySummary[] {
    const groupRows = dailySkuData.filter(r => r.adGroup === adGroupName && r.campaign === campaignName);
    const skuMap = new Map<string, DailySkuRow[]>();
    for (const row of groupRows) {
        const key = row.mappedSku || row.offerSku;
        if (!skuMap.has(key)) skuMap.set(key, []);
        skuMap.get(key)!.push(row);
    }

    const totalGroupSpend = groupRows.reduce((s, r) => s + r.spend, 0);
    const groupAvgCtr = (() => {
        const totalImpr = groupRows.reduce((s, r) => s + r.impressions, 0);
        const totalClicks = groupRows.reduce((s, r) => s + r.clicks, 0);
        return totalImpr > 0 ? totalClicks / totalImpr : 0;
    })();
    const groupAvgConvRate = (() => {
        const totalClicks = groupRows.reduce((s, r) => s + r.clicks, 0);
        const totalConv = groupRows.reduce((s, r) => s + r.conversions, 0);
        return totalClicks > 0 ? totalConv / totalClicks : 0;
    })();

    const summaries: AdSkuWeeklySummary[] = [];

    for (const [sku, rows] of skuMap.entries()) {
        const impressions = rows.reduce((s, r) => s + r.impressions, 0);
        const clicks = rows.reduce((s, r) => s + r.clicks, 0);
        const spend = rows.reduce((s, r) => s + r.spend, 0);
        const sales = rows.reduce((s, r) => s + r.sales, 0);
        const orders = rows.reduce((s, r) => s + r.orders, 0);
        const conversions = rows.reduce((s, r) => s + r.conversions, 0);
        const directSales = rows.reduce((s, r) => s + r.directSales, 0);
        const directOrders = rows.reduce((s, r) => s + r.directOrders, 0);
        const directConversions = rows.reduce((s, r) => s + r.directConversions, 0);

        const product = products.find(p => p.sku === sku);
        const roas = spend > 0 ? sales / spend : 0;
        const directRoas = spend > 0 ? directSales / spend : 0;
        const poas = calculatePoas(sku, spend, sales, products);
        const ctr = impressions > 0 ? clicks / impressions : 0;
        const cpc = clicks > 0 ? spend / clicks : 0;
        const spendShare = totalGroupSpend > 0 ? spend / totalGroupSpend : 0;
        const ctrVsGroupAvg = groupAvgCtr > 0 ? ctr / groupAvgCtr : 1;
        const runway = product ? product.daysRemaining / 7 : 0;

        const summary: AdSkuWeeklySummary = {
            sku,
            offerSku: rows[0]?.offerSku ?? sku,
            adGroup: adGroupName,
            campaign: campaignName,
            productName: rows[0]?.productName ?? product?.name ?? sku,
            brand: rows[0]?.brand ?? product?.brand ?? '',
            category: rows[0]?.productCategory ?? product?.category ?? '',
            impressions,
            clicks,
            spend,
            sales,
            orders,
            conversions,
            roas,
            ctr,
            cpc,
            spendShare,
            directSales,
            directOrders,
            directConversions,
            directRoas,
            haloSales: sales - directSales,
            poas,
            gradeLevel: product?.gradeLevel ?? 0,
            stockQty: product?.stockLevel ?? 0,
            runway,
            isLowStock: runway < 4 && (product?.stockLevel ?? 0) < 10,
            prevWeekSales: 0,
            prevWeekSpend: 0,
            prevWeekOrders: 0,
            salesTrend: 'no-data',
            salesDelta: '',
            ordersDelta: '',
            ctrVsGroupAvg,
            weeksInGroup: 1,
            flags: [],
        };

        summary.flags = flagSku(summary, totalGroupSpend, groupAvgCtr, product, []);
        summaries.push(summary);
    }

    return summaries;
}
