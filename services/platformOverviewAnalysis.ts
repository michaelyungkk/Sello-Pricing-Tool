import { PriceLog, Product, RefundLog, ReturnDateBasis } from '../types';
import { addDaysToDateKey, asDateKey, getTodayKeyMelbourne } from './dateUtils';
import { aggregateTransactionLedger, calcAdSpend, calcRevenue, calcUnits, toNumber, TransactionLedgerPlatformMetrics } from './metrics';
import { VAT_MULTIPLIER } from '../constants';

export type PlatformOverviewFocusMetric =
    | 'revenue'
    | 'units'
    | 'cogs'
    | 'cogsPct'
    | 'asp'
    | 'adSpend'
    | 'tacosPct'
    | 'refundAmountPct'
    | 'refundQtyPct'
    | 'refundImpact'
    | 'netProfit'
    | 'marginPct';

export interface PlatformOverviewMetricSnapshot {
    revenue: number;
    units: number;
    cogs: number;
    cogsPct: number | null;
    asp: number | null;
    adSpend: number;
    tacosPct: number | null;
    refundUnits: number;
    refundAmountPct: number | null;
    refundQtyPct: number | null;
    refundImpact: number;
    netProfit: number;
    marginPct: number | null;
}

export interface PlatformOverviewWeeklyRow extends PlatformOverviewMetricSnapshot {
    id: string;
    platform: string;
    weekStartKey: string;
    weekEndKey: string;
    naturalWeekStartKey: string;
    naturalWeekEndKey: string;
    previousWeekStartKey: string;
    previousWeekEndKey: string;
    weekLabel: string;
    isCurrentWeek: boolean;
    isCompleteWeek: boolean;
    delta: Record<PlatformOverviewFocusMetric, number | null>;
}

export interface PlatformOverviewSummaryStrip {
    platformCount: number;
    weekCount: number;
    revenue: number;
    netProfit: number;
    marginPct: number | null;
    units: number;
    cogsPct: number | null;
}

export interface PlatformOverviewAnalysisResult {
    rows: PlatformOverviewWeeklyRow[];
    summary: PlatformOverviewSummaryStrip;
}

export interface PlatformOverviewContributor extends PlatformOverviewMetricSnapshot {
    sku: string;
    productName: string;
    category: string;
    caPrice: number | null;
    deltaValue: number | null;
    ledgerEntries: PlatformOverviewLedgerEntry[];
}

export interface PlatformOverviewCategorySummary extends PlatformOverviewMetricSnapshot {
    name: string;
    caPrice: number | null;
    deltaValue: number | null;
}

export interface PlatformOverviewLedgerEntry {
    id: string;
    dateKey: string;
    type: 'Sale' | 'Ad Cost' | 'Refund' | 'Resend';
    orderId: string | null;
    revenue: number | null;
    caPrice: number | null;
    units: number | null;
    cogs: number | null;
    adSpend: number | null;
    refundImpact: number | null;
    note: string | null;
}

export interface PlatformOverviewRowDetail {
    contributors: PlatformOverviewContributor[];
    categories: PlatformOverviewCategorySummary[];
}

interface AnalysisBaseOptions {
    priceLogs: PriceLog[];
    refundLogs: RefundLog[];
    startKey: string;
    endKey: string;
    returnDateBasis: ReturnDateBasis;
    orderDateMap?: Map<string, string>;
    deductRefunds: boolean;
    platformFilter?: string[] | string | null;
}

const FOCUS_KEYS: PlatformOverviewFocusMetric[] = [
    'revenue',
    'units',
    'cogs',
    'cogsPct',
    'asp',
    'adSpend',
    'tacosPct',
    'refundAmountPct',
    'refundQtyPct',
    'refundImpact',
    'netProfit',
    'marginPct'
];

const ZERO_METRICS: PlatformOverviewMetricSnapshot = {
    revenue: 0,
    units: 0,
    cogs: 0,
    cogsPct: null,
    asp: null,
    adSpend: 0,
    tacosPct: null,
    refundUnits: 0,
    refundAmountPct: null,
    refundQtyPct: null,
    refundImpact: 0,
    netProfit: 0,
    marginPct: null
};

const parseDateKeyUtc = (dateKey: string): Date => new Date(`${dateKey}T00:00:00Z`);

const formatDateKeyUtc = (date: Date): string => {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

const isoWeekStart = (dateKey: string): string => {
    const date = parseDateKeyUtc(dateKey);
    const day = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() - day + 1);
    return formatDateKeyUtc(date);
};

const isoWeekEnd = (dateKey: string): string => addDaysToDateKey(isoWeekStart(dateKey), 6);

const maxDateKey = (a: string, b: string): string => (a > b ? a : b);
const minDateKey = (a: string, b: string): string => (a < b ? a : b);

const formatWeekLabel = (startKey: string, endKey: string): string => `${startKey} to ${endKey}`;

const getCurrentWeekStartKey = (todayKey: string = getTodayKeyMelbourne()): string => isoWeekStart(todayKey);

const getRefundScopeDateKey = (
    refund: RefundLog,
    returnDateBasis: ReturnDateBasis,
    orderDateMap?: Map<string, string>
): string | null => {
    if (returnDateBasis === 'orderDate' && orderDateMap && refund.orderId) {
        const lookupKey = refund.resendBaseOrderId || refund.orderId.replace(/-resend$/i, '');
        return asDateKey(orderDateMap.get(lookupKey));
    }
    return asDateKey(refund.date);
};

const getCostValue = (stats: TransactionLedgerPlatformMetrics, label: string): number => {
    return stats.costs.find(cost => cost.label === label)?.value ?? 0;
};

const toMetricSnapshot = (stats?: TransactionLedgerPlatformMetrics): PlatformOverviewMetricSnapshot => {
    if (!stats) return ZERO_METRICS;
    const cogs = getCostValue(stats, 'COGS');
    return {
        revenue: stats.revenue,
        units: stats.units,
        cogs,
        cogsPct: stats.revenue > 0 ? (cogs / stats.revenue) * 100 : null,
        asp: stats.units > 0 ? stats.revenue / stats.units : null,
        adSpend: stats.adjustedAdSpend,
        tacosPct: stats.revenue > 0 ? (stats.adjustedAdSpend / stats.revenue) * 100 : null,
        refundUnits: stats.refundUnits,
        refundAmountPct: stats.revenue > 0 ? (stats.refundImpact / stats.revenue) * 100 : null,
        refundQtyPct: stats.units > 0 ? (stats.refundUnits / stats.units) * 100 : null,
        refundImpact: stats.refundImpact,
        netProfit: stats.netProfit,
        marginPct: stats.margin
    };
};

const metricDelta = (
    key: PlatformOverviewFocusMetric,
    current: PlatformOverviewMetricSnapshot,
    previous: PlatformOverviewMetricSnapshot
): number | null => {
    const currentValue = current[key];
    const previousValue = previous[key];
    if (currentValue === null || previousValue === null) return null;
    return Number(currentValue) - Number(previousValue);
};

const collectRelevantDateKeys = ({
    priceLogs,
    refundLogs,
    startKey,
    endKey,
    returnDateBasis,
    orderDateMap
}: AnalysisBaseOptions): string[] => {
    const keys: string[] = [];
    for (const log of priceLogs) {
        const dateKey = asDateKey(log.date);
        if (dateKey && dateKey >= startKey && dateKey <= endKey) keys.push(dateKey);
    }
    for (const refund of refundLogs) {
        const dateKey = getRefundScopeDateKey(refund, returnDateBasis, orderDateMap);
        if (dateKey && dateKey >= startKey && dateKey <= endKey) keys.push(dateKey);
    }
    return keys.sort();
};

export const buildPlatformOverviewWeeklyAnalysis = ({
    priceLogs,
    refundLogs,
    startKey,
    endKey,
    returnDateBasis,
    orderDateMap,
    deductRefunds,
    platformFilter = null
}: AnalysisBaseOptions): PlatformOverviewAnalysisResult => {
    const todayKey = getTodayKeyMelbourne();
    const currentWeekStartKey = getCurrentWeekStartKey(todayKey);
    const relevantDateKeys = collectRelevantDateKeys({
        priceLogs,
        refundLogs,
        startKey,
        endKey,
        returnDateBasis,
        orderDateMap,
        deductRefunds,
        platformFilter
    });

    const totalsLedger = aggregateTransactionLedger({
        priceLogs,
        refundLogs,
        startKey,
        endKey,
        returnDateBasis,
        orderDateMap,
        deductRefunds,
        platformFilter
    });
    const totals = toMetricSnapshot(totalsLedger.totals);

    if (relevantDateKeys.length === 0) {
        return {
            rows: [],
            summary: {
                platformCount: 0,
                weekCount: 0,
                revenue: totals.revenue,
                netProfit: totals.netProfit,
                marginPct: totals.marginPct,
                units: totals.units,
                cogsPct: totals.cogsPct
            }
        };
    }

    const effectiveStart = maxDateKey(startKey, relevantDateKeys[0]);
    const effectiveEnd = minDateKey(endKey, relevantDateKeys[relevantDateKeys.length - 1]);
    const firstWeekStart = isoWeekStart(effectiveStart);
    const lastWeekStart = isoWeekStart(effectiveEnd);
    const rows: PlatformOverviewWeeklyRow[] = [];

    for (let weekStart = firstWeekStart; weekStart <= lastWeekStart; weekStart = addDaysToDateKey(weekStart, 7)) {
        const weekEnd = isoWeekEnd(weekStart);
        const clippedStart = maxDateKey(weekStart, startKey);
        const clippedEnd = minDateKey(weekEnd, endKey);
        if (clippedStart > clippedEnd) continue;
        const isCurrentWeek = weekStart === currentWeekStartKey;
        const isCompleteWeek = clippedStart === weekStart && clippedEnd === weekEnd;

        const currentLedger = aggregateTransactionLedger({
            priceLogs,
            refundLogs,
            startKey: clippedStart,
            endKey: clippedEnd,
            returnDateBasis,
            orderDateMap,
            deductRefunds,
            platformFilter
        });

        if (currentLedger.platforms.length === 0) continue;

        const previousStart = addDaysToDateKey(clippedStart, -7);
        const previousEnd = addDaysToDateKey(clippedEnd, -7);
        const previousLedger = aggregateTransactionLedger({
            priceLogs,
            refundLogs,
            startKey: previousStart,
            endKey: previousEnd,
            returnDateBasis,
            orderDateMap,
            deductRefunds,
            platformFilter
        });

        currentLedger.platforms.forEach(stats => {
            const current = toMetricSnapshot(stats);
            const previous = toMetricSnapshot(previousLedger.byPlatform[stats.platform]);
            const delta = FOCUS_KEYS.reduce((acc, key) => {
                acc[key] = metricDelta(key, current, previous);
                return acc;
            }, {} as Record<PlatformOverviewFocusMetric, number | null>);

            rows.push({
                id: `${stats.platform}::${clippedStart}`,
                platform: stats.platform,
                weekStartKey: clippedStart,
                weekEndKey: clippedEnd,
                naturalWeekStartKey: weekStart,
                naturalWeekEndKey: weekEnd,
                previousWeekStartKey: previousStart,
                previousWeekEndKey: previousEnd,
                weekLabel: isCurrentWeek && !isCompleteWeek ? 'Current' : formatWeekLabel(clippedStart, clippedEnd),
                isCurrentWeek,
                isCompleteWeek,
                ...current,
                delta
            });
        });
    }

    return {
        rows,
        summary: {
            platformCount: totalsLedger.platforms.length,
            weekCount: new Set(rows.map(row => row.weekStartKey)).size,
            revenue: totals.revenue,
            netProfit: totals.netProfit,
            marginPct: totals.marginPct,
            units: totals.units,
            cogsPct: totals.cogsPct
        }
    };
};

export const getPlatformOverviewDataRange = ({
    priceLogs,
    refundLogs,
    returnDateBasis,
    orderDateMap
}: Pick<AnalysisBaseOptions, 'priceLogs' | 'refundLogs' | 'returnDateBasis' | 'orderDateMap'>): { startKey: string; endKey: string } | null => {
    const keys = collectRelevantDateKeys({
        priceLogs,
        refundLogs,
        startKey: '1900-01-01',
        endKey: '9999-12-31',
        returnDateBasis,
        orderDateMap,
        deductRefunds: true
    });
    if (keys.length === 0) return null;
    return { startKey: keys[0], endKey: keys[keys.length - 1] };
};

export const getLastCompleteWeekStartKey = (rows: PlatformOverviewWeeklyRow[]): string | null => {
    const candidates = rows
        .filter(row => row.isCompleteWeek)
        .map(row => row.naturalWeekStartKey)
        .sort();
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
};

const buildSkuMetrics = (
    logs: PriceLog[],
    refunds: RefundLog[],
    options: AnalysisBaseOptions,
    platform: string,
    startKey: string,
    endKey: string
): PlatformOverviewMetricSnapshot => {
    const ledger = aggregateTransactionLedger({
        priceLogs: logs,
        refundLogs: refunds,
        startKey,
        endKey,
        returnDateBasis: options.returnDateBasis,
        orderDateMap: options.orderDateMap,
        deductRefunds: options.deductRefunds,
        platformFilter: platform
    });
    return toMetricSnapshot(ledger.byPlatform[platform] || ledger.totals);
};

const buildLedgerEntries = ({
    sku,
    caPrice,
    priceLogs,
    refundLogs,
    platform,
    startKey,
    endKey,
    returnDateBasis,
    orderDateMap
}: {
    sku: string;
    caPrice: number | null;
    priceLogs: PriceLog[];
    refundLogs: RefundLog[];
    platform: string;
    startKey: string;
    endKey: string;
    returnDateBasis: ReturnDateBasis;
    orderDateMap?: Map<string, string>;
}): PlatformOverviewLedgerEntry[] => {
    const salesEntries = priceLogs
        .filter(log => {
            const dateKey = asDateKey(log.date);
            return log.sku === sku && log.platform === platform && !!dateKey && dateKey >= startKey && dateKey <= endKey;
        })
        .map(log => {
            const dateKey = asDateKey(log.date)!;
            const units = calcUnits(log);
            const adSpend = calcAdSpend(log) * VAT_MULTIPLIER;
            const isAdOnly = toNumber(log.price) === 0 && adSpend > 0;
            const revenue = !isAdOnly ? calcRevenue(log) * VAT_MULTIPLIER : null;
            const cogs = toNumber(log.cogs) !== 0 ? toNumber(log.cogs) * VAT_MULTIPLIER : null;
            return {
                id: `sale::${log.id || `${sku}-${dateKey}-${log.orderId || 'na'}`}`,
                dateKey,
                type: isAdOnly ? 'Ad Cost' : 'Sale',
                orderId: log.orderId || null,
                revenue,
                caPrice,
                units: units > 0 ? units : null,
                cogs,
                adSpend: adSpend > 0 ? adSpend : null,
                refundImpact: null,
                note: log.postcode || log.logisticPartner || null
            } satisfies PlatformOverviewLedgerEntry;
        })
        .filter(entry => entry.revenue !== null || entry.units !== null || entry.cogs !== null || entry.adSpend !== null);

    const refundEntries = refundLogs
        .filter(refund => {
            const dateKey = getRefundScopeDateKey(refund, returnDateBasis, orderDateMap);
            return refund.sku === sku && refund.platform === platform && !!dateKey && dateKey >= startKey && dateKey <= endKey;
        })
        .map(refund => {
            const dateKey = getRefundScopeDateKey(refund, returnDateBasis, orderDateMap)!;
            const refundImpact = (toNumber(refund.amount) + toNumber(refund.freightAmount)) * VAT_MULTIPLIER;
            return {
                id: `refund::${refund.id}`,
                dateKey,
                type: refund.orderType === 'resend' ? 'Resend' : 'Refund',
                orderId: refund.orderId || null,
                revenue: null,
                caPrice,
                units: toNumber(refund.quantity) > 0 ? toNumber(refund.quantity) : null,
                cogs: null,
                adSpend: null,
                refundImpact: refundImpact > 0 ? refundImpact : null,
                note: refund.reason || refund.platformReason || refund.comments || refund.commentEn || null
            } satisfies PlatformOverviewLedgerEntry;
        });

    return [...salesEntries, ...refundEntries].sort((a, b) => {
        if (a.dateKey !== b.dateKey) return b.dateKey.localeCompare(a.dateKey);
        return a.type.localeCompare(b.type);
    });
};

export const buildPlatformOverviewRowDetail = ({
    products,
    priceLogs,
    refundLogs,
    row,
    focusMetric,
    returnDateBasis,
    orderDateMap,
    deductRefunds
}: {
    products: Product[];
    priceLogs: PriceLog[];
    refundLogs: RefundLog[];
    row: PlatformOverviewWeeklyRow;
    focusMetric: PlatformOverviewFocusMetric;
    returnDateBasis: ReturnDateBasis;
    orderDateMap?: Map<string, string>;
    deductRefunds: boolean;
}): PlatformOverviewRowDetail => {
    const productMap = new Map(products.map(product => [product.sku, product]));
    const currentWeekLogs = priceLogs.filter(log => {
        const dateKey = asDateKey(log.date);
        return log.platform === row.platform && !!dateKey && dateKey >= row.weekStartKey && dateKey <= row.weekEndKey;
    });
    const currentWeekRefunds = refundLogs.filter(refund => {
        const dateKey = getRefundScopeDateKey(refund, returnDateBasis, orderDateMap);
        return refund.platform === row.platform && !!dateKey && dateKey >= row.weekStartKey && dateKey <= row.weekEndKey;
    });
    const relevantRefunds = refundLogs.filter(refund => {
        const dateKey = getRefundScopeDateKey(refund, returnDateBasis, orderDateMap);
        return refund.platform === row.platform && !!dateKey && dateKey >= row.previousWeekStartKey && dateKey <= row.weekEndKey;
    });
    const relevantLogs = priceLogs.filter(log => {
        const dateKey = asDateKey(log.date);
        return log.platform === row.platform && !!dateKey && dateKey >= row.previousWeekStartKey && dateKey <= row.weekEndKey;
    });

    const skuSet = new Set<string>();
    relevantLogs.forEach(log => { if (log.sku) skuSet.add(log.sku); });
    relevantRefunds.forEach(refund => { if (refund.sku) skuSet.add(refund.sku); });

    const analysisOptions: AnalysisBaseOptions = {
        priceLogs,
        refundLogs,
        startKey: row.weekStartKey,
        endKey: row.weekEndKey,
        returnDateBasis,
        orderDateMap,
        deductRefunds,
        platformFilter: row.platform
    };

    const allContributors = Array.from(skuSet).map(sku => {
        const skuLogs = relevantLogs.filter(log => log.sku === sku);
        const skuRefunds = relevantRefunds.filter(refund => refund.sku === sku);
        const current = buildSkuMetrics(skuLogs, skuRefunds, analysisOptions, row.platform, row.weekStartKey, row.weekEndKey);
        const previous = buildSkuMetrics(skuLogs, skuRefunds, analysisOptions, row.platform, row.previousWeekStartKey, row.previousWeekEndKey);
        const product = productMap.get(sku);
        const caPrice = typeof product?.caPrice === 'number' && Number.isFinite(product.caPrice)
            ? product.caPrice
            : null;
        return {
            sku,
            productName: product?.name || sku,
            category: product?.category || 'Uncategorized',
            caPrice,
            deltaValue: metricDelta(focusMetric, current, previous),
            ledgerEntries: buildLedgerEntries({
                sku,
                caPrice,
                priceLogs: currentWeekLogs,
                refundLogs: currentWeekRefunds,
                platform: row.platform,
                startKey: row.weekStartKey,
                endKey: row.weekEndKey,
                returnDateBasis,
                orderDateMap
            }),
            ...current
        };
    }).filter(contributor => {
        return contributor.revenue !== 0 ||
            contributor.units !== 0 ||
            contributor.cogs !== 0 ||
            contributor.adSpend !== 0 ||
            contributor.refundImpact !== 0 ||
            contributor.netProfit !== 0;
    });

    const contributors = [...allContributors].sort((a, b) => {
        const deltaA = a.deltaValue === null ? -1 : Math.abs(a.deltaValue);
        const deltaB = b.deltaValue === null ? -1 : Math.abs(b.deltaValue);
        if (deltaB !== deltaA) return deltaB - deltaA;
        return b.revenue - a.revenue;
    }).slice(0, 12);

    const categoryMap = new Map<string, PlatformOverviewCategorySummary>();
    const categoryCaTotals = new Map<string, { weightedTotal: number; weight: number }>();
    allContributors.forEach(contributor => {
        const category = contributor.category || 'Uncategorized';
        const existing = categoryMap.get(category) || { name: category, caPrice: null, ...ZERO_METRICS, deltaValue: 0 };
        existing.revenue += contributor.revenue;
        existing.units += contributor.units;
        existing.cogs += contributor.cogs;
        existing.adSpend += contributor.adSpend;
        existing.refundUnits += contributor.refundUnits;
        existing.refundImpact += contributor.refundImpact;
        existing.netProfit += contributor.netProfit;
        existing.deltaValue = (existing.deltaValue ?? 0) + (contributor.deltaValue ?? 0);
        categoryMap.set(category, existing);
        if (contributor.caPrice !== null) {
            const priceWeight = contributor.units > 0 ? contributor.units : 1;
            const existingCa = categoryCaTotals.get(category) || { weightedTotal: 0, weight: 0 };
            existingCa.weightedTotal += contributor.caPrice * priceWeight;
            existingCa.weight += priceWeight;
            categoryCaTotals.set(category, existingCa);
        }
    });

    categoryMap.forEach((value, key) => {
        const revenue = value.revenue;
        const units = value.units;
        value.cogsPct = revenue > 0 ? (value.cogs / revenue) * 100 : null;
        value.asp = units > 0 ? value.revenue / units : null;
        value.tacosPct = revenue > 0 ? (value.adSpend / revenue) * 100 : null;
        value.refundAmountPct = revenue > 0 ? (value.refundImpact / revenue) * 100 : null;
        value.refundQtyPct = units > 0 ? (value.refundUnits / units) * 100 : null;
        value.marginPct = revenue > 0 ? (value.netProfit / revenue) * 100 : null;
        const caTotals = categoryCaTotals.get(key);
        value.caPrice = caTotals && caTotals.weight > 0 ? caTotals.weightedTotal / caTotals.weight : null;
        categoryMap.set(key, value);
    });

    return {
        contributors,
        categories: Array.from(categoryMap.values())
            .sort((a, b) => Math.abs(b.deltaValue ?? 0) - Math.abs(a.deltaValue ?? 0) || b.revenue - a.revenue)
            .slice(0, 8)
    };
};
