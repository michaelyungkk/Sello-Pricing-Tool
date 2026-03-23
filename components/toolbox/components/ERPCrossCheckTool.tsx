import React, { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileCheck, AlertTriangle, CheckCircle, XCircle, ChevronDown, ChevronUp, RefreshCw, Info, X, Download } from 'lucide-react';
import { PriceLog, RefundLog, PricingRules, Product } from '../../../types';
import { asDateKeyNaive } from '../../../services/dateUtils';
import { formatMoney } from '../../../utils/format';

const VAT = 1.2;
const TOLERANCE = 2; // % variance threshold for warning

interface ERPCrossCheckToolProps {
    salesHistory: PriceLog[];
    refundHistory: RefundLog[];
    pricingRules: PricingRules;
    products: Product[];
    learnedAliases: Record<string, string>;
    themeColor: string;
}

interface PlatformRow {
    platform: string;
    file_units: number;
    file_revenue: number;
    file_profit_excl: number;
    file_profit_incl: number;
    file_ads: number;
    app_units: number;
    app_revenue: number;
    app_profit: number;
    app_ads: number;
    units_diff: number;
    revenue_diff: number;
    profit_diff: number;
    revenue_pct: number;
    profit_pct: number;
    status: 'ok' | 'warn' | 'error';
}

interface ParsedSalesData {
    dateRange: { start: string; end: string };
    platforms: Record<string, {
        units: number; sales: number; extra: number;
        profit_excl_rn: number; resend_amt: number; refund_amt: number; ads: number;
    }>;
    skuData: Record<string, { revenue: number; units: number; platforms: Set<string> }>;
    rowCount: number;
}

interface ParsedReturnData {
    platforms: Record<string, { qty: number; amt: number }>;
    rowCount: number;
    dateRange: { start: string; end: string };
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseSalesFile(buffer: ArrayBuffer): ParsedSalesData | null {
    try {
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (rows.length < 2) return null;

        const headers = rows[0].map((h: any) => String(h || '').trim().toLowerCase().replace(/[^a-z0-9%]/g, ''));
        const idx = (name: string) => headers.indexOf(name);

        const dateI    = idx('ordertime') !== -1 ? idx('ordertime') : idx('time');
        const l2I      = idx('platformnamelevel2');
        const typeI    = idx('ordertype');
        const skuI     = idx('skucode') !== -1 ? idx('skucode') : idx('sku');
        const qtyI     = idx('skuquantity');
        const revI     = idx('salesamt');
        const extraI   = idx('extrafreight');
        const profitI  = idx('profitexclrn');
        const resendI  = idx('resendamt');
        const refundI  = idx('refundamt');
        const adsI     = idx('adsfee');

        if (dateI === -1 || l2I === -1) return null;

        const platforms: ParsedSalesData['platforms'] = {};
        const skuData: ParsedSalesData['skuData'] = {};
        const dates: string[] = [];
        let rowCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;
            const rawDate = row[dateI];
            if (!rawDate) continue;
            const d = asDateKeyNaive(rawDate instanceof Date ? rawDate : rawDate);
            if (!d) continue;

            const otype = typeI !== -1 ? String(row[typeI] || '').trim().toLowerCase() : '';
            const plat  = String(row[l2I] || '').trim();
            if (!plat) continue;

            dates.push(d);

            if (!platforms[plat]) platforms[plat] = { units: 0, sales: 0, extra: 0, profit_excl_rn: 0, resend_amt: 0, refund_amt: 0, ads: 0 };
            const p = platforms[plat];

            // Always accumulate ads (including ad_only rows)
            p.ads += parseFloat(String(row[adsI] || 0)) || 0;

            if (otype === 'ad_only') continue;

            p.units          += parseFloat(String(row[qtyI]    || 0)) || 0;
            p.sales          += parseFloat(String(row[revI]    || 0)) || 0;
            p.extra          += parseFloat(String(row[extraI]  || 0)) || 0;
            p.profit_excl_rn += parseFloat(String(row[profitI] || 0)) || 0;
            p.resend_amt     += parseFloat(String(row[resendI] || 0)) || 0;
            p.refund_amt     += parseFloat(String(row[refundI] || 0)) || 0;
            rowCount++;

            // Track per-SKU revenue for unknown SKU detection
            if (skuI !== -1 && row[skuI]) {
                const skuKey = String(row[skuI]).trim().toUpperCase();
                if (!skuData[skuKey]) skuData[skuKey] = { revenue: 0, units: 0, platforms: new Set() };
                skuData[skuKey].revenue += parseFloat(String(row[revI] || 0)) || 0;
                skuData[skuKey].units   += parseFloat(String(row[qtyI] || 0)) || 0;
                skuData[skuKey].platforms.add(plat);
            }
        }

        if (dates.length === 0) return null;
        dates.sort();
        return { dateRange: { start: dates[0], end: dates[dates.length - 1] }, platforms, skuData, rowCount };
    } catch (e) {
        console.error('Sales parse error:', e);
        return null;
    }
}

function parseReturnsFile(buffer: ArrayBuffer, startKey: string, endKey: string): ParsedReturnData | null {
    try {
        const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
        if (rows.length < 2) return null;

        const headers = rows[0].map((h: any) => String(h || '').trim().toLowerCase().replace(/[^a-z0-9]/g, ''));
        const idx = (name: string) => headers.indexOf(name);

        // Return_Details columns
        const dateI   = idx('ordertime') !== -1 ? idx('ordertime') : idx('day') !== -1 ? -1 : idx('time');
        const l2I     = idx('platformnamelevel2') !== -1 ? idx('platformnamelevel2') : idx('platformname');
        const amtI    = idx('returnamt') !== -1 ? idx('returnamt') : idx('amount');
        const qtyI    = idx('returnqty') !== -1 ? idx('returnqty') : idx('qty');
        const skuI    = idx('sku') !== -1 ? idx('sku') : idx('skucode');
        const typeI   = idx('ordertype') !== -1 ? idx('ordertype') : idx('type');
        const orderI  = idx('outerorderid') !== -1 ? idx('outerorderid') : idx('orderid');

        if (l2I === -1 || amtI === -1) return null;

        // Try to use Year/Month/Day columns if ordertime not available
        const yearI  = idx('year');
        const monthI = idx('month');
        const dayI   = idx('day');

        // Single pass: ERP now exports correct qty/amt per SKU line (fixed Mar 2026)
        // The old two-pass correction for multi-SKU resend orders is no longer needed
        const platforms: ParsedReturnData['platforms'] = {};
        const dates: string[] = [];
        let rowCount = 0;

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0) continue;

            let d: string | null = null;
            if (dateI !== -1 && row[dateI]) {
                d = asDateKeyNaive(row[dateI] instanceof Date ? row[dateI] : row[dateI]);
            } else if (yearI !== -1 && monthI !== -1 && dayI !== -1 && row[yearI] && row[monthI] && row[dayI]) {
                const y = String(row[yearI]).padStart(4, '0');
                const m = String(row[monthI]).padStart(2, '0');
                const dd = String(row[dayI]).padStart(2, '0');
                d = `${y}-${m}-${dd}`;
            }
            if (!d || d < startKey || d > endKey) continue;

            const plat = String(row[l2I] || '').trim();
            const sku  = skuI !== -1 ? String(row[skuI] || '').trim().toLowerCase() : '';
            const amt  = parseFloat(String(row[amtI] || 0)) || 0;
            const qty  = parseFloat(String(row[qtyI] || 0)) || 0;

            if (sku === 'freight' || sku === 'addfreight') continue;
            if (!plat || amt === 0) continue;

            dates.push(d);
            if (!platforms[plat]) platforms[plat] = { qty: 0, amt: 0 };
            platforms[plat].amt += amt;
            platforms[plat].qty += qty;
            rowCount++;
        }

        dates.sort();
        return {
            platforms,
            rowCount,
            dateRange: dates.length > 0
                ? { start: dates[0], end: dates[dates.length - 1] }
                : { start: startKey, end: endKey }
        };
    } catch (e) {
        console.error('Returns parse error:', e);
        return null;
    }
}

// ── App aggregation ───────────────────────────────────────────────────────────

function getAppAggregates(
    salesHistory: PriceLog[],
    refundHistory: RefundLog[],
    uploadedReturns: ParsedReturnData | null,
    startKey: string,
    endKey: string,
    deductReturns: boolean
): Record<string, { units: number; revenue: number; profit: number; ads: number }> {
    const result: Record<string, { units: number; revenue: number; profit: number; ads: number }> = {};

    for (const log of salesHistory) {
        const d = (log.date || '').split('T')[0];
        if (d < startKey || d > endKey) continue;
        const plat = log.platform || 'Unknown';
        if (!result[plat]) result[plat] = { units: 0, revenue: 0, profit: 0, ads: 0 };
        result[plat].units   += log.velocity || 0;
        result[plat].revenue += ((log.price || 0) * (log.velocity || 0) + (log.realExtraFreight || 0)) * VAT;
        result[plat].profit  += (log.profit ?? ((log.price || 0) * (log.velocity || 0) * ((log.margin || 0) / 100))) * VAT;
        result[plat].ads     += (log.adsSpend || 0) * VAT;
    }

    if (deductReturns) {
        if (uploadedReturns) {
            // Use uploaded returns file — same source as ERP
            for (const [plat, ret] of Object.entries(uploadedReturns.platforms)) {
                if (result[plat]) {
                    result[plat].profit -= ret.amt * VAT;
                }
            }
        } else {
            // Fall back to app stored refund history
            for (const r of refundHistory) {
                const d = (r.date || '').split('T')[0];
                if (d < startKey || d > endKey) continue;
                const plat = r.platform || 'Unknown';
                if (result[plat]) {
                    result[plat].profit -= (Number(r.amount) + Number(r.freightAmount || 0)) * VAT;
                }
            }
        }
    }

    return result;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function classify(pct: number): 'ok' | 'warn' | 'error' {
    const abs = Math.abs(pct);
    if (abs <= TOLERANCE) return 'ok';
    if (abs <= 10) return 'warn';
    return 'error';
}

const StatusIcon = ({ status }: { status: 'ok' | 'warn' | 'error' }) => {
    if (status === 'ok')   return <CheckCircle   className="w-4 h-4 text-emerald-500" />;
    if (status === 'warn') return <AlertTriangle  className="w-4 h-4 text-amber-500" />;
    return <XCircle className="w-4 h-4 text-red-500" />;
};

const DiffCell = ({ val, pct }: { val: number; pct: number }) => {
    const abs = Math.abs(pct);
    const color = abs <= TOLERANCE ? 'text-emerald-600' : abs <= 10 ? 'text-amber-600' : 'text-red-600';
    const sign = val >= 0 ? '+' : '';
    return (
        <div className={`text-right ${color} text-xs font-mono`}>
            <div>{sign}{formatMoney(val)}</div>
            <div className="text-[10px] opacity-70">{sign}{pct.toFixed(1)}%</div>
        </div>
    );
};

// ── Upload zone (reusable) ────────────────────────────────────────────────────

const UploadZone = ({ label, hint, fileName, isProcessing, error, onFile, onClear }: {
    label: string; hint: string; fileName: string; isProcessing: boolean;
    error?: string; onFile: (f: File) => void; onClear: () => void;
}) => {
    const ref = useRef<HTMLInputElement>(null);
    const [dragging, setDragging] = useState(false);

    if (fileName) {
        return (
            <div className="flex items-center justify-between bg-theme-10 border border-indigo-100 rounded-xl px-4 py-3">
                <div className="flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-theme" />
                    <span className="text-xs font-bold text-theme">{fileName}</span>
                </div>
                <button onClick={onClear} className="text-gray-400 hover:text-red-500 transition-colors">
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>
        );
    }

    return (
        <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); }}
            onClick={() => ref.current?.click()}
            className={`border-2 border-dashed rounded-xl px-5 py-4 text-center cursor-pointer transition-all ${
                dragging ? 'border-indigo-400 bg-theme-10' : 'border-gray-200 hover:border-theme-20 hover:bg-gray-50/50'
            }`}
        >
            <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden"
                onChange={e => e.target.files?.[0] && onFile(e.target.files[0])} />
            {isProcessing ? (
                <div className="flex items-center justify-center gap-2">
                    <RefreshCw className="w-4 h-4 text-theme animate-spin" />
                    <span className="text-xs text-gray-400">Parsing...</span>
                </div>
            ) : (
                <div className="flex items-center gap-3">
                    <Upload className="w-4 h-4 text-gray-300 shrink-0" />
                    <div className="text-left">
                        <p className="text-xs font-semibold text-gray-600">{label}</p>
                        <p className="text-[10px] text-gray-400">{hint}</p>
                    </div>
                </div>
            )}
            {error && <p className="mt-2 text-[10px] text-red-500">{error}</p>}
        </div>
    );
};


// ── Export ────────────────────────────────────────────────────────────────────

function exportResults(
    rows: PlatformRow[],
    startKey: string,
    endKey: string,
    deductReturns: boolean,
    returnsSource: string
) {
    const headers = [
        'Platform',
        'ERP Units', 'App Units', 'Units Diff',
        'ERP Revenue (inc)', 'App Revenue (inc)', 'Revenue Diff', 'Revenue Var%',
        'ERP Profit Excl Returns (inc)', 'ERP Profit Incl Returns (inc)',
        'App Profit (inc)', 'Profit Diff', 'Profit Var%',
        'ERP Ads (inc)', 'App Ads (inc)',
        'Status',
        'Date Range', 'Deduct Returns', 'Returns Source'
    ];

    const dataRows = rows.map(r => [
        r.platform,
        r.file_units, r.app_units, r.units_diff,
        r.file_revenue.toFixed(2), r.app_revenue.toFixed(2),
        r.revenue_diff.toFixed(2), r.revenue_pct.toFixed(2) + '%',
        r.file_profit_excl.toFixed(2), r.file_profit_incl.toFixed(2),
        r.app_profit.toFixed(2), r.profit_diff.toFixed(2), r.profit_pct.toFixed(2) + '%',
        r.file_ads.toFixed(2), r.app_ads.toFixed(2),
        r.status.toUpperCase(),
        `${startKey} → ${endKey}`,
        deductReturns ? 'Yes' : 'No',
        returnsSource
    ]);

    const csv = [headers, ...dataRows]
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `sello_erp_crosscheck_${startKey}_${endKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);
}

// ── Unknown SKU Export ───────────────────────────────────────────────────────

function exportUnknownSkus(
    skuData: Record<string, { revenue: number; units: number; platforms: Set<string> }>,
    products: Product[],
    learnedAliases: Record<string, string>,
    startKey: string,
    endKey: string
) {
    // Build lookup matching exactly what salesImportWorker uses:
    // p.sku + p.channels[].skuAlias + learnedAliases
    const knownSkus = new Set<string>();
    for (const p of (products || [])) {
        knownSkus.add(p.sku.toUpperCase());
        if (p.channels) {
            for (const ch of (p.channels as any[])) {
                if (ch.skuAlias) {
                    String(ch.skuAlias).split(',').forEach((a: string) => knownSkus.add(a.trim().toUpperCase()));
                }
            }
        }
    }
    // Also add learnedAliases (same as worker)
    for (const alias of Object.keys(learnedAliases || {})) {
        knownSkus.add(alias.trim().toUpperCase());
    }

    // Find SKUs in file but not in products
    const unknown: { sku: string; revenue: number; units: number; platforms: string }[] = [];
    for (const [sku, data] of Object.entries(skuData)) {
        if (!knownSkus.has(sku)) {
            unknown.push({
                sku,
                revenue: data.revenue * VAT,
                units: data.units,
                platforms: Array.from(data.platforms).join(', ')
            });
        }
    }

    // Sort by revenue descending
    unknown.sort((a, b) => b.revenue - a.revenue);

    const totalUnknownRev = unknown.reduce((s, r) => s + r.revenue, 0);
    const headers = ['SKU (in file)', 'Revenue (inc-VAT)', 'Units', 'Platform(s)', 'Action needed'];
    const rows = unknown.map(r => [
        r.sku,
        r.revenue.toFixed(2),
        r.units.toString(),
        r.platforms,
        'Add to Master Catalogue or map via Inventory Sync'
    ]);

    // Add summary row
    rows.push(['--- TOTAL UNMATCHED ---', totalUnknownRev.toFixed(2), '', '', `${unknown.length} SKUs`]);

    const csv = [headers, ...rows]
        .map(row => row.map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
        .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `unmatched_skus_${startKey}_${endKey}.csv`;
    a.click();
    URL.revokeObjectURL(url);

    return unknown.length;
}

// ── Main component ────────────────────────────────────────────────────────────

export const ERPCrossCheckTool: React.FC<ERPCrossCheckToolProps> = ({
    salesHistory, refundHistory, pricingRules, products, learnedAliases, themeColor
}) => {
    // Sales file state
    const [salesData, setSalesData] = useState<ParsedSalesData | null>(null);
    const [salesFileName, setSalesFileName] = useState('');
    const [salesProcessing, setSalesProcessing] = useState(false);
    const [salesError, setSalesError] = useState('');

    // Returns file state
    const [returnsData, setReturnsData] = useState<ParsedReturnData | null>(null);
    const [returnsFileName, setReturnsFileName] = useState('');
    const [returnsProcessing, setReturnsProcessing] = useState(false);
    const [returnsError, setReturnsError] = useState('');

    // Controls
    const [deductReturns, setDeductReturns] = useState(true);
    const [expandedRow, setExpandedRow] = useState<string | null>(null);
    const [customStart, setCustomStart] = useState('');
    const [customEnd, setCustomEnd] = useState('');
    const [useCustomRange, setUseCustomRange] = useState(false);
    const [unknownCount, setUnknownCount] = useState<number | null>(null);

    const handleSalesFile = useCallback((file: File) => {
        setSalesProcessing(true); setSalesError('');
        const reader = new FileReader();
        reader.onload = (e) => {
            const parsed = parseSalesFile(e.target?.result as ArrayBuffer);
            if (!parsed) {
                setSalesError('Could not parse. Ensure it is a valid Daily_Sales_Details.xlsx with platform_name_level2 and order_time columns.');
                setSalesProcessing(false);
                return;
            }
            setSalesData(parsed);
            setSalesFileName(file.name);
            setCustomStart(parsed.dateRange.start);
            setCustomEnd(parsed.dateRange.end);
            setSalesProcessing(false);
        };
        reader.onerror = () => { setSalesError('Failed to read file.'); setSalesProcessing(false); };
        reader.readAsArrayBuffer(file);
    }, []);

    const handleReturnsFile = useCallback((file: File) => {
        setReturnsProcessing(true); setReturnsError('');
        const reader = new FileReader();
        reader.onload = (e) => {
            const start = useCustomRange ? customStart : salesData?.dateRange.start || '';
            const end   = useCustomRange ? customEnd   : salesData?.dateRange.end   || '';
            const parsed = parseReturnsFile(e.target?.result as ArrayBuffer, start, end);
            if (!parsed) {
                setReturnsError('Could not parse. Ensure it is a valid Return_Details.xlsx with platform_name_level2 and return_amt columns.');
                setReturnsProcessing(false);
                return;
            }
            setReturnsData(parsed);
            setReturnsFileName(file.name);
            setReturnsProcessing(false);
        };
        reader.onerror = () => { setReturnsError('Failed to read file.'); setReturnsProcessing(false); };
        reader.readAsArrayBuffer(file);
    }, [salesData, useCustomRange, customStart, customEnd]);

    const startKey = useCustomRange ? customStart : salesData?.dateRange.start || '';
    const endKey   = useCustomRange ? customEnd   : salesData?.dateRange.end   || '';

    // Expensive: iterates all salesHistory/refundHistory — only re-runs when data or date range changes
    // deductReturns is intentionally excluded — it doesn't affect aggregation, only final assembly
    const appAgg = React.useMemo(() => {
        return getAppAggregates(salesHistory, refundHistory, returnsData, startKey, endKey, true);
    }, [salesHistory, refundHistory, returnsData, startKey, endKey]);

    // Cheap: assembles rows from pre-computed aggregates — re-runs instantly on deductReturns toggle
    const rows: PlatformRow[] = React.useMemo(() => {
        if (!salesData) return [];
        const allPlatforms = new Set([...Object.keys(salesData.platforms), ...Object.keys(appAgg)]);

        return Array.from(allPlatforms).map(plat => {
            const f = salesData.platforms[plat];
            const a = appAgg[plat];

            const file_revenue     = f ? (f.sales + f.extra) * VAT : 0;
            const file_profit_excl = f ? f.profit_excl_rn * VAT : 0;
            // If returns file uploaded, use it; otherwise use embedded resend_amt/refund_amt from sales file
            const returns_deduction = (deductReturns && returnsData)
                ? (returnsData.platforms[plat]?.amt || 0) * VAT
                : f ? (f.resend_amt + f.refund_amt) * VAT : 0;
            const file_profit_incl = file_profit_excl - (deductReturns ? returns_deduction : 0);
            const file_ads         = f ? f.ads * VAT : 0;
            const file_units       = f ? f.units : 0;

            const file_profit_compare = deductReturns ? file_profit_incl : file_profit_excl;

            const app_revenue = a?.revenue || 0;
            const app_profit  = a?.profit  || 0;
            const app_units   = a?.units   || 0;
            const app_ads     = a?.ads     || 0;

            const revenue_diff = app_revenue - file_revenue;
            const profit_diff  = app_profit  - file_profit_compare;
            const units_diff   = app_units   - file_units;

            const revenue_pct = file_revenue         > 0 ? (revenue_diff / file_revenue)         * 100 : 0;
            const profit_pct  = Math.abs(file_profit_compare) > 0 ? (profit_diff / Math.abs(file_profit_compare)) * 100 : 0;

            const worst = Math.max(Math.abs(revenue_pct), Math.abs(profit_pct));
            return {
                platform: plat,
                file_units, file_revenue, file_profit_excl, file_profit_incl, file_ads,
                app_units, app_revenue, app_profit, app_ads,
                units_diff, revenue_diff, profit_diff, revenue_pct, profit_pct,
                status: classify(worst)
            } as PlatformRow;
        }).sort((a, b) => b.file_revenue - a.file_revenue);
    }, [salesData, returnsData, appAgg, startKey, endKey, deductReturns]);

    const summary = React.useMemo(() => ({
        ok:    rows.filter(r => r.status === 'ok').length,
        warn:  rows.filter(r => r.status === 'warn').length,
        error: rows.filter(r => r.status === 'error').length,
    }), [rows]);

    return (
        <div className="space-y-4">

            {/* ── File Upload Section ─────────────────────────────────────── */}
            <div className="grid grid-cols-2 gap-3">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                        Sales File <span className="text-red-400">*</span>
                    </p>
                    <UploadZone
                        label="Daily_Sales_Details.xlsx"
                        hint="Required — platform_name_level2 + order_time"
                        fileName={salesFileName}
                        isProcessing={salesProcessing}
                        error={salesError}
                        onFile={handleSalesFile}
                        onClear={() => { setSalesData(null); setSalesFileName(''); setReturnsData(null); setReturnsFileName(''); }}
                    />
                </div>
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-1.5">
                        Returns File <span className="text-gray-300">(optional)</span>
                    </p>
                    <UploadZone
                        label="Return_Details.xlsx"
                        hint={salesData ? "Upload for accurate returns deduction" : "Upload sales file first"}
                        fileName={returnsFileName}
                        isProcessing={returnsProcessing}
                        error={returnsError}
                        onFile={salesData ? handleReturnsFile : () => {}}
                        onClear={() => { setReturnsData(null); setReturnsFileName(''); }}
                    />
                    {!salesData && !returnsFileName && (
                        <p className="text-[10px] text-gray-400 mt-1 pl-1">Upload sales file first</p>
                    )}
                    {salesData && !returnsFileName && (
                        <p className="text-[10px] text-gray-400 mt-1 pl-1">
                            Without returns file, uses app stored refund data
                        </p>
                    )}
                </div>
            </div>

            {salesData && (
                <>
                    {/* ── Controls ───────────────────────────────────────────── */}
                    <div className="flex flex-wrap items-center gap-4 bg-white border border-gray-100 rounded-xl px-4 py-3">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-gray-500">DATE RANGE</span>
                            <button
                                onClick={() => setUseCustomRange(false)}
                                className={`text-xs px-2 py-1 rounded-md font-medium transition-colors ${!useCustomRange ? 'bg-theme-10 text-theme' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Full File ({salesData.dateRange.start} → {salesData.dateRange.end})
                            </button>
                            <button
                                onClick={() => setUseCustomRange(true)}
                                className={`text-xs px-2 py-1 rounded-md font-medium transition-colors ${useCustomRange ? 'bg-theme-10 text-theme' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Custom
                            </button>
                        </div>
                        {useCustomRange && (
                            <div className="flex items-center gap-2">
                                <input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)}
                                    className="text-xs border border-gray-200 rounded-lg px-2 py-1" />
                                <span className="text-xs text-gray-400">→</span>
                                <input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)}
                                    className="text-xs border border-gray-200 rounded-lg px-2 py-1" />
                            </div>
                        )}
                        <label className="flex items-center gap-2 ml-auto cursor-pointer">
                            <input type="checkbox" checked={deductReturns} onChange={e => setDeductReturns(e.target.checked)}
                                className="w-3.5 h-3.5 rounded" />
                            <span className="text-xs font-medium text-gray-600">
                                Deduct Returns
                                {returnsData && <span className="ml-1 text-theme font-bold">(from file)</span>}
                                {!returnsData && <span className="ml-1 text-gray-400">(from app)</span>}
                            </span>
                        </label>
                    </div>

                    {/* ── Summary badges ─────────────────────────────────────── */}
                    {rows.length > 0 && (
                        <div className="flex items-center gap-3">
                            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-100 rounded-lg">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
                                <span className="text-xs font-bold text-emerald-700">{summary.ok} Match</span>
                            </div>
                            {summary.warn > 0 && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 border border-amber-100 rounded-lg">
                                    <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
                                    <span className="text-xs font-bold text-amber-700">{summary.warn} Warning</span>
                                </div>
                            )}
                            {summary.error > 0 && (
                                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 border border-red-100 rounded-lg">
                                    <XCircle className="w-3.5 h-3.5 text-red-500" />
                                    <span className="text-xs font-bold text-red-700">{summary.error} Mismatch</span>
                                </div>
                            )}
                            <div className="flex items-center gap-1.5 ml-auto text-xs text-gray-400">
                                <Info className="w-3 h-3" />
                                <span>±{TOLERANCE}% tolerance · {salesData.rowCount.toLocaleString()} rows · {returnsData ? `${returnsData.rowCount} return rows` : 'no returns file'}</span>
                            </div>
                            {rows.length > 0 && (
                                <>
                                <button
                                    onClick={() => exportResults(rows, startKey, endKey, deductReturns, returnsData ? returnsFileName : 'app stored')}
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-xs font-bold text-gray-600 hover:bg-gray-50 shadow-sm transition-colors"
                                >
                                    <Download className="w-3.5 h-3.5" /> Export CSV
                                </button>
                                {salesData?.skuData && (
                                    <button
                                        onClick={() => {
                                            if (!products || products.length === 0) {
                                                alert('Product catalogue not loaded yet. Please wait a moment and try again.');
                                                return;
                                            }
                                            const count = exportUnknownSkus(salesData.skuData, products, learnedAliases, startKey, endKey);
                                            setUnknownCount(count);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-amber-200 bg-amber-50 text-xs font-bold text-amber-700 hover:bg-amber-100 shadow-sm transition-colors"
                                    >
                                        <AlertTriangle className="w-3.5 h-3.5" />
                                        {unknownCount !== null
                                            ? `${unknownCount} Unmatched SKUs`
                                            : `Export Unmatched SKUs${products?.length ? ` (${products.length} in catalogue)` : ' (catalogue not loaded)'}`}
                                    </button>
                                )}
                                </>
                            )}
                        </div>
                    )}

                    {/* ── Comparison table ───────────────────────────────────── */}
                    <div className="bg-white border border-gray-100 rounded-xl overflow-hidden">
                        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_28px] bg-gray-50 border-b border-gray-100 px-4 py-2.5">
                            {['Platform', 'Units', 'ERP Revenue', 'App Revenue', 'Rev Variance', 'Profit Variance', ''].map((h, i) => (
                                <div key={i} className={`text-[10px] font-bold uppercase tracking-wider text-gray-400 ${i > 0 ? 'text-right' : ''}`}>{h}</div>
                            ))}
                        </div>

                        {rows.map(row => (
                            <div key={row.platform}>
                                <div
                                    className={`grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_28px] px-4 py-3 border-b border-gray-50 hover:bg-gray-50/50 cursor-pointer transition-colors ${
                                        row.status === 'error' ? 'bg-red-50/30' : row.status === 'warn' ? 'bg-amber-50/20' : ''
                                    }`}
                                    onClick={() => setExpandedRow(expandedRow === row.platform ? null : row.platform)}
                                >
                                    <div className="flex items-center gap-2">
                                        <StatusIcon status={row.status} />
                                        <span className="text-sm font-semibold text-gray-800">{row.platform}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-xs font-mono text-gray-700">{row.file_units.toLocaleString()}</div>
                                        {row.units_diff !== 0 && (
                                            <div className={`text-[10px] font-mono ${row.units_diff > 0 ? 'text-blue-500' : 'text-orange-500'}`}>
                                                {row.units_diff > 0 ? '+' : ''}{row.units_diff}
                                            </div>
                                        )}
                                    </div>
                                    <div className="text-right text-xs font-mono text-gray-700">{formatMoney(row.file_revenue)}</div>
                                    <div className="text-right text-xs font-mono text-gray-700">{formatMoney(row.app_revenue)}</div>
                                    <DiffCell val={row.revenue_diff} pct={row.revenue_pct} />
                                    <DiffCell val={row.profit_diff}  pct={row.profit_pct}  />
                                    <div className="flex items-center justify-center">
                                        {expandedRow === row.platform
                                            ? <ChevronUp className="w-3.5 h-3.5 text-gray-400" />
                                            : <ChevronDown className="w-3.5 h-3.5 text-gray-400" />}
                                    </div>
                                </div>

                                {expandedRow === row.platform && (
                                    <div className="bg-gray-50 border-b border-gray-100 px-6 py-4 grid grid-cols-2 gap-6">
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">ERP File</p>
                                            <div className="space-y-1.5">
                                                {[
                                                    ['Revenue', formatMoney(row.file_revenue)],
                                                    ['Profit (excl. returns)', formatMoney(row.file_profit_excl)],
                                                    ['Profit (incl. returns)', formatMoney(row.file_profit_incl)],
                                                    ['Ad Spend', formatMoney(row.file_ads)],
                                                    ['Units', row.file_units.toLocaleString()],
                                                ].map(([label, val]) => (
                                                    <div key={label} className="flex justify-between text-xs">
                                                        <span className="text-gray-500">{label}</span>
                                                        <span className="font-mono font-semibold text-gray-700">{val}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">
                                                App {deductReturns ? `(Returns ${returnsData ? 'from file' : 'from app'})` : '(Gross)'}
                                            </p>
                                            <div className="space-y-1.5">
                                                {[
                                                    ['Revenue', formatMoney(row.app_revenue)],
                                                    ['Profit', formatMoney(row.app_profit)],
                                                    ['Ad Spend', formatMoney(row.app_ads)],
                                                    ['Units', row.app_units.toLocaleString()],
                                                ].map(([label, val]) => (
                                                    <div key={label} className="flex justify-between text-xs">
                                                        <span className="text-gray-500">{label}</span>
                                                        <span className="font-mono font-semibold text-gray-700">{val}</span>
                                                    </div>
                                                ))}
                                            </div>
                                            {row.status !== 'ok' && (
                                                <div className={`mt-3 p-2 rounded-lg text-[10px] leading-relaxed ${
                                                    row.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700'
                                                }`}>
                                                    {row.units_diff < -5
                                                        ? `⚠ App has ${Math.abs(row.units_diff)} fewer units — possible deduplication gap or missing import.`
                                                        : Math.abs(row.profit_diff) > Math.abs(row.revenue_diff) * 0.5
                                                            ? `⚠ Profit gap larger than revenue gap — ${!returnsData ? 'upload returns file for accurate comparison.' : 'check returns data matches ERP.'}`
                                                            : '⚠ Revenue gap — verify all daily files for this date range have been uploaded.'}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        {rows.length === 0 && (
                            <div className="px-4 py-8 text-center text-xs text-gray-400">
                                No data found for this date range.
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};
