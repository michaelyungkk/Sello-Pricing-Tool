import React, { useMemo, useState } from 'react';
import { Activity, Calendar, Search, Info, Rows, MapPin, ChevronDown, ChevronRight } from 'lucide-react';
import { SelectFilter } from '../../common/SelectFilter';
import AuditPanel from '../../common/AuditPanel';
import { formatSmartMoney, formatNumber, formatPct } from '../../../utils/format';
import { asDateKey } from '../../../services/dateUtils';
import { VAT_MULTIPLIER } from '../../../constants';
import { Product } from '../../../types';
import { ReturnDateBasis } from '../../../types';

interface TransactionLedgerSectionProps {
    ledgerStats: any;
    previousLedgerStats?: any;
    platformSubtotals: any[];
    previousPlatformSubtotalsMap?: Map<string, any>;
    paginatedTransactions: any[];
    filteredTransactionsLength: number;
    txLimit: number;
    setTxLimit: (n: number | ((prev: number) => number)) => void;
    isAuditPanelVisible: boolean;
    setIsAuditPanelVisible: (b: boolean) => void;
    ledgerWindowPreset: '7d' | '14d' | '30d' | '90d' | 'all' | 'custom';
    setLedgerWindowPreset: (preset: '7d' | '14d' | '30d' | '90d' | 'all' | 'custom') => void;
    ledgerCustomStart: string;
    setLedgerCustomStart: (value: string) => void;
    ledgerCustomEnd: string;
    setLedgerCustomEnd: (value: string) => void;
    returnDateBasis: ReturnDateBasis;
    setReturnDateBasis: (b: ReturnDateBasis) => void;
    txFilterPlatform: string;
    setTxFilterPlatform: (s: string) => void;
    txFilterType: string;
    setTxFilterType: (s: string) => void;
    txPostcodeArea: string;
    setTxPostcodeArea: (s: string) => void;
    txPostcodeAreas: string[];
    showRedistributedOnly: boolean;
    setShowRedistributedOnly: (value: boolean) => void;
    platforms: string[];
    startKey: string;
    endKey: string;
    filteredTransactions: any[];
    thresholds: any;
    calcRevenue: (row: any) => number;
    calcUnits: (row: any) => number;
    calcProfit: (row: any) => number;
    calcAdSpend: (row: any) => number;
    marginPct: (profit: number, revenue: number) => number | null;
    product: Product;
    adRedistributionSummary: {
        active: boolean;
        groupName: string;
        groupMemberCount: number;
        rawSpend: number;
        adjustedSpend: number;
        delta: number;
        rowsRedistributed: number;
    } | null;
}

export const TransactionLedgerSection: React.FC<TransactionLedgerSectionProps> = ({
    ledgerStats,
    previousLedgerStats = {},
    platformSubtotals,
    previousPlatformSubtotalsMap = new Map(),
    paginatedTransactions,
    filteredTransactionsLength,
    txLimit,
    setTxLimit,
    isAuditPanelVisible,
    setIsAuditPanelVisible,
    ledgerWindowPreset,
    setLedgerWindowPreset,
    ledgerCustomStart,
    setLedgerCustomStart,
    ledgerCustomEnd,
    setLedgerCustomEnd,
    returnDateBasis,
    setReturnDateBasis,
    txFilterPlatform,
    setTxFilterPlatform,
    txFilterType,
    setTxFilterType,
    txPostcodeArea,
    setTxPostcodeArea,
    txPostcodeAreas,
    showRedistributedOnly,
    setShowRedistributedOnly,
    platforms,
    startKey,
    endKey,
    filteredTransactions,
    thresholds,
    calcRevenue,
    calcUnits,
    calcProfit,
    calcAdSpend,
    marginPct,
    product,
    adRedistributionSummary
}) => {
    void product;
    const [expandedPlatform, setExpandedPlatform] = useState<string | null>(null);
    const [showPop, setShowPop] = useState(false);
    const popAvailable = ledgerWindowPreset !== 'all';
    const formatAxisLabel = (label: string) => {
        if (label === 'Profit Before Refund') return 'Profit Before\nRefund';
        if (label === 'Residual Adjustment') return 'Residual\nAdjustment';
        if (label === 'Refund Impact') return 'Refund\nImpact';
        return label;
    };

    React.useEffect(() => {
        if (!popAvailable && showPop) setShowPop(false);
    }, [popAvailable, showPop]);

    const platformCostBreakdowns = useMemo(() => {
        const getNum = (row: any, keys: string[]) => {
            for (const key of keys) {
                const value = row?.[key];
                if (typeof value === 'number' && Number.isFinite(value)) return value;
                if (typeof value === 'string') {
                    const parsed = Number(value);
                    if (Number.isFinite(parsed)) return parsed;
                }
            }
            return 0;
        };

        const byPlatform = new Map<string, any[]>();
        for (const row of filteredTransactions) {
            const platform = String(row?.platform || 'Unknown');
            if (!byPlatform.has(platform)) byPlatform.set(platform, []);
            byPlatform.get(platform)?.push(row);
        }

        const result = new Map<string, {
            revenue: number;
            netProfit: number;
            costs: Array<{ label: string; value: number }>;
            reconciliation: number;
            reconciliationLabel: string;
            maxBarAbs: number;
        }>();

        for (const sub of platformSubtotals) {
            const rows = byPlatform.get(sub.platform) || [];
            const hasAnyField = (keys: string[]) => rows.some(row => keys.some(key => row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== ''));
            const soldUnits = rows.reduce((sum, row) => {
                const units = getNum(row, ['velocity']);
                return sum + (units > 0 ? units : 0);
            }, 0);
            const refundImpact = rows.reduce((sum, row) => {
                const isRefund = row?._type === 'REFUND_LOG' || (getNum(row, ['velocity']) < 0);
                if (!isRefund) return sum;
                return sum + Math.abs(getNum(row, ['profit']) * VAT_MULTIPLIER);
            }, 0);

            const promoRelRowTotal = rows.reduce((sum, row) => sum + getNum(row, ['promo_rel', 'promoRel', 'promoRebate']), 0);
            const cogsRowTotal = rows.reduce((sum, row) => sum + getNum(row, ['cogs', 'costPrice']), 0);
            const sellingRowTotal = rows.reduce((sum, row) => sum + getNum(row, ['selling_fee', 'sellingFee']), 0);
            const adsFeeRowTotal = rows.reduce((sum, row) => {
                const rawAdSpend = getNum(row, ['rawAdsSpend', 'adsSpend']);
                return sum + rawAdSpend;
            }, 0);
            const postageRowTotal = rows.reduce((sum, row) => sum + getNum(row, ['postage', 'realPostage']), 0);
            const otherRowTotal = rows.reduce((sum, row) => sum + getNum(row, ['other_fee', 'otherFee']), 0);
            const subscriptionRowTotal = rows.reduce((sum, row) => sum + getNum(row, ['subscription_fee', 'subscription', 'subscriptionFee']), 0);
            const wmsRowTotal = rows.reduce((sum, row) => sum + getNum(row, ['wms_fee', 'wmsFee']), 0);

            const hasRowPromoRelief = hasAnyField(['promoRel', 'promo_rel', 'promoRebate']);
            const promoRel = (hasRowPromoRelief ? promoRelRowTotal : 0) * VAT_MULTIPLIER;
            const cogs = (hasAnyField(['cogs', 'costPrice']) ? cogsRowTotal : 0) * VAT_MULTIPLIER;
            const sellingFee = (hasAnyField(['sellingFee', 'selling_fee']) ? sellingRowTotal : 0) * VAT_MULTIPLIER;
            const adsFee = (hasAnyField(['rawAdsSpend', 'adsSpend']) ? adsFeeRowTotal : 0) * VAT_MULTIPLIER;
            const postage = (hasAnyField(['postage', 'realPostage']) ? postageRowTotal : 0) * VAT_MULTIPLIER;
            const otherFee = (hasAnyField(['otherFee', 'other_fee']) ? otherRowTotal : 0) * VAT_MULTIPLIER;
            const subscription = (hasAnyField(['subscription_fee', 'subscriptionFee', 'subscription']) ? subscriptionRowTotal : 0) * VAT_MULTIPLIER;
            const wmsFee = (hasAnyField(['wmsFee', 'wms_fee']) ? wmsRowTotal : 0) * VAT_MULTIPLIER;

            const costs = [
                { label: 'Promo Relief', value: promoRel },
                { label: 'COGS', value: cogs },
                { label: 'Selling Fee', value: sellingFee },
                { label: 'Ads Fee', value: adsFee },
                { label: 'Postage', value: postage },
                { label: 'Other Fee', value: otherFee },
                { label: 'Subscription', value: subscription },
                { label: 'WMS Fee', value: wmsFee },
                { label: 'Refund Impact', value: refundImpact }
            ].filter(item => Math.abs(item.value) > 0.0001);

            const revenue = sub.revenue || 0;
            const netProfit = sub.profit || 0;
            const isRefundOnlyPlatform = soldUnits <= 0.0001 && Math.abs(revenue) <= 0.0001 && netProfit < -0.0001;
            const normalizedCosts = isRefundOnlyPlatform
                ? (costs.some(c => c.label === 'Refund Impact') ? costs : [...costs, { label: 'Refund Impact', value: Math.abs(netProfit) }])
                : costs;
            const computedProfit = revenue - normalizedCosts.reduce((sum, cost) => sum + cost.value, 0);
            const reconciliation = isRefundOnlyPlatform ? 0 : (netProfit - computedProfit);
            const reconciliationLabel = refundImpact > 0.0001 ? 'Residual Adjustment' : 'Reconciliation';
            const maxBarAbs = Math.max(
                Math.abs(revenue),
                Math.abs(netProfit),
                ...normalizedCosts.map(cost => Math.abs(cost.value)),
                Math.abs(reconciliation)
            );

            result.set(sub.platform, { revenue, netProfit, costs: normalizedCosts, reconciliation, reconciliationLabel, maxBarAbs });
        }

        return result;
    }, [filteredTransactions, platformSubtotals, product]);

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 mr-auto">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Rows className="w-5 h-5 text-theme" />
                        Transaction Ledger
                        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded ml-1">Recent Logs</span>
                    </h3>
                </div>
                <div className="relative">
                    <select
                        value={ledgerWindowPreset}
                        onChange={e => setLedgerWindowPreset(e.target.value as '7d' | '14d' | '30d' | '90d' | 'all' | 'custom')}
                        className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-theme"
                    >
                        <option value="7d">Last 7 Days</option>
                        <option value="14d">Last 14 Days</option>
                        <option value="30d">Last 30 Days</option>
                        <option value="90d">Last 90 Days</option>
                        <option value="all">All Time</option>
                        <option value="custom">Custom Date</option>
                    </select>
                    <Calendar className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
                {ledgerWindowPreset === 'custom' && (
                    <div className="flex items-center gap-2">
                        <input
                            type="date"
                            value={ledgerCustomStart}
                            onChange={e => setLedgerCustomStart(e.target.value)}
                            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-theme"
                        />
                        <span className="text-xs text-gray-500">to</span>
                        <input
                            type="date"
                            value={ledgerCustomEnd}
                            onChange={e => setLedgerCustomEnd(e.target.value)}
                            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-theme"
                        />
                    </div>
                )}
                <SelectFilter
                    label="Platform"
                    options={platforms}
                    selected={txFilterPlatform === 'All' ? [] : [txFilterPlatform]}
                    onChange={sel => setTxFilterPlatform(sel.length === 0 ? 'All' : sel[0])}
                    singleSelect
                    allLabel="All Platforms"
                />
                <div className="relative">
                    <select
                        value={txFilterType}
                        onChange={e => setTxFilterType(e.target.value)}
                        className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-theme"
                    >
                        <option value="All">All Types</option>
                        <option value="Sale">Sale (Price {'>'} 0)</option>
                        <option value="Ad Cost">Ad Cost (Ads {'>'} 0)</option>
                        <option value="Refund">Refunds Only</option>
                    </select>
                    <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
                <div className="relative">
                    <select
                        value={txPostcodeArea}
                        onChange={e => setTxPostcodeArea(e.target.value)}
                        className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-theme"
                    >
                        <option value="All">All Areas</option>
                        {txPostcodeAreas.map(area => <option key={area} value={area}>{area}</option>)}
                    </select>
                    <MapPin className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
                <button
                    onClick={() => setShowRedistributedOnly(!showRedistributedOnly)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border ${showRedistributedOnly ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                    {showRedistributedOnly ? 'Redistributed Only: On' : 'Redistributed Only'}
                </button>
                <button
                    onClick={() => setIsAuditPanelVisible(!isAuditPanelVisible)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border flex items-center gap-2 ${isAuditPanelVisible ? 'bg-theme-10 border-theme-20 text-theme' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                    <Activity className="w-4 h-4" />
                    {isAuditPanelVisible ? 'Hide Audit' : 'Audit Reconciliation'}
                </button>
            </div>

            {adRedistributionSummary && (
                <div className="flex flex-wrap items-center gap-2 -mt-2">
                    <span className="text-[11px] text-gray-500 flex items-center gap-1.5 mr-2">
                        <Info className="w-3 h-3 flex-shrink-0" />
                        Group {adRedistributionSummary.groupName} ({adRedistributionSummary.groupMemberCount} SKUs)
                    </span>
                    <span className="sello-badge badge-gray">Raw {formatSmartMoney(adRedistributionSummary.rawSpend)}</span>
                    <span className="sello-badge badge-theme">Adjusted {formatSmartMoney(adRedistributionSummary.adjustedSpend)}</span>
                    <span className={`sello-badge ${Math.abs(adRedistributionSummary.delta) <= 0.01 ? 'badge-green' : 'badge-red'}`}>
                        Net Delta {adRedistributionSummary.delta > 0 ? '+' : ''}{formatSmartMoney(adRedistributionSummary.delta)}
                    </span>
                    <span className="sello-badge badge-amber">Rows Redistributed {adRedistributionSummary.rowsRedistributed}</span>
                </div>
            )}

            <p className="text-xs text-gray-400 -mt-2">
                Viewing {Math.min(txLimit, filteredTransactionsLength)} of {filteredTransactionsLength} records for the selected period.
            </p>
            {txPostcodeArea !== 'All' && (
                <p className="text-xs text-gray-500 -mt-2">
                    Postcode filter is active ({txPostcodeArea}). This filtered view includes sales rows with matching postcode area.
                </p>
            )}
            {!popAvailable && (
                <p className="text-xs text-gray-500 -mt-2">
                    PoP is unavailable for All Time. Select 7/14/30/90 days or Custom.
                </p>
            )}

            {isAuditPanelVisible && (
                <div className="bg-custom-glass backdrop-blur-custom p-4 rounded-xl border border-custom-glass shadow-sm animate-in fade-in zoom-in-95 duration-200">
                    <AuditPanel
                        title="Ledger Reconciliation"
                        startKey={startKey}
                        endKey={endKey}
                        rows={filteredTransactions}
                        getDateKey={(row: any) => asDateKey(row.date)}
                        getRevenue={(row: any) => calcRevenue(row)}
                        getQty={(row: any) => calcUnits(row)}
                        getProfit={(row: any) => calcProfit(row)}
                        getAdSpend={(row: any) => calcAdSpend(row)}
                    />
                </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-custom-glass backdrop-blur-custom rounded-xl border border-custom-glass shadow-sm text-sm">
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 uppercase font-medium">Sales Rows</span>
                    <div className="text-xl font-bold text-gray-800">{ledgerStats.salesRows}</div>
                    {showPop && popAvailable && <div className="text-[10px] text-gray-500 mt-1">PoP {ledgerStats.salesRows - (previousLedgerStats.salesRows || 0) >= 0 ? '+' : ''}{formatNumber((ledgerStats.salesRows - (previousLedgerStats.salesRows || 0)))}</div>}
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 uppercase font-medium">Total Units</span>
                    <div className="text-xl font-bold text-emerald-600">{ledgerStats.totalUnits}</div>
                    {showPop && popAvailable && <div className="text-[10px] text-gray-500 mt-1">PoP {ledgerStats.totalUnits - (previousLedgerStats.totalUnits || 0) >= 0 ? '+' : ''}{formatNumber((ledgerStats.totalUnits - (previousLedgerStats.totalUnits || 0)))}</div>}
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 uppercase font-medium flex items-center gap-1">
                        Ad-Only Spend
                        <span title="Includes daily PPC costs not attributed to specific orders. Pooled into total TACoS.">
                            <Info className="w-3 h-3 text-gray-400" />
                        </span>
                    </span>
                    <div className="text-xl font-bold text-amber-500">{formatSmartMoney(ledgerStats.adOnlySpend)}</div>
                    {showPop && popAvailable && <div className="text-[10px] text-gray-500 mt-1">PoP {(ledgerStats.adOnlySpend - (previousLedgerStats.adOnlySpend || 0)) >= 0 ? '+' : ''}{formatSmartMoney((ledgerStats.adOnlySpend - (previousLedgerStats.adOnlySpend || 0)))}</div>}
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 uppercase font-medium">Refunds (Detected)</span>
                    <div className="text-xl font-bold text-red-500 flex items-center gap-1">
                        {ledgerStats.refundCount}
                        {ledgerStats.refundValue > 0 && <span className="text-sm font-medium opacity-70">(-{formatSmartMoney(ledgerStats.refundValue)})</span>}
                    </div>
                    {showPop && popAvailable && <div className="text-[10px] text-gray-500 mt-1">PoP {(ledgerStats.refundCount - (previousLedgerStats.refundCount || 0)) >= 0 ? '+' : ''}{formatNumber((ledgerStats.refundCount - (previousLedgerStats.refundCount || 0)))}</div>}
                </div>
            </div>

            <div className="bg-custom-glass backdrop-blur-custom rounded-xl border border-custom-glass shadow-sm overflow-hidden animate-in fade-in">
                <div className="p-3 bg-white/10 border-b border-custom-glass flex items-center justify-between">
                    <h4 className="text-xs font-bold text-gray-500 uppercase">Platform Subtotals (for period)</h4>
                    <div className="flex items-center gap-2">
                        <div className="flex bg-gray-100 p-1 rounded-lg">
                            <button
                                onClick={() => setReturnDateBasis('refundDate')}
                                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${returnDateBasis === 'refundDate' ? 'bg-white shadow text-theme' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Refund Date
                            </button>
                            <button
                                onClick={() => setReturnDateBasis('orderDate')}
                                className={`px-2.5 py-1 text-[10px] font-bold rounded-md transition-all ${returnDateBasis === 'orderDate' ? 'bg-white shadow text-theme' : 'text-gray-500 hover:text-gray-700'}`}
                            >
                                Order Date
                            </button>
                        </div>
                        <button
                            onClick={() => popAvailable && setShowPop(v => !v)}
                            disabled={!popAvailable}
                            className={`px-2 py-1 text-[10px] font-bold rounded border transition-colors ${!popAvailable ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed' : showPop ? 'bg-theme-10 text-theme border-theme-20' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}
                        >
                            PoP
                        </button>
                    </div>
                </div>
                <div className="divide-y divide-gray-100">
                    {platformSubtotals.map(sub => {
                        const rowBreakdown = platformCostBreakdowns.get(sub.platform);
                        const rowRefundImpact = rowBreakdown?.costs.find(cost => cost.label === 'Refund Impact')?.value || 0;
                        const rowProfitBeforeRefund = (sub.profit || 0) + rowRefundImpact;
                        return (
                        <div key={sub.platform}>
                            <button
                                type="button"
                                className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-gray-50 text-left"
                                onClick={() => setExpandedPlatform(prev => prev === sub.platform ? null : sub.platform)}
                            >
                                <span className="font-bold text-sm text-gray-800 w-[14%] flex items-center gap-2">
                                    {expandedPlatform === sub.platform ? <ChevronDown className="w-3.5 h-3.5 text-gray-500" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-500" />}
                                    {sub.platform}
                                </span>
                                <div className="flex items-center justify-end gap-3 text-xs w-[86%]">
                                    <div className="text-right w-20">
                                        <div className="text-gray-400">Qty Sold</div>
                                        <div className="font-mono font-bold text-gray-700">{formatNumber(sub.soldQty)}</div>
                                    </div>
                                    <div className="text-right w-24">
                                        <div className="text-gray-400">Raw Ad</div>
                                        <div className="font-mono font-bold text-gray-700">{formatSmartMoney(sub.rawAdSpend)}</div>
                                    </div>
                                    <div className="text-right w-24">
                                        <div className="text-gray-400">Adj. Ad</div>
                                        <div className="font-mono font-bold text-orange-600">{formatSmartMoney(sub.adjustedAdSpend)}</div>
                                    </div>
                                    <div className="text-right w-24">
                                        <div className="text-gray-400">Ad Delta</div>
                                        <div className={`font-mono font-bold ${sub.adDelta > 0 ? 'text-emerald-600' : sub.adDelta < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                                            {sub.adDelta > 0 ? '+' : ''}{formatSmartMoney(sub.adDelta)}
                                        </div>
                                    </div>
                                    <div className="text-right w-24">
                                        <div className="text-gray-400">Revenue</div>
                                        <div className="font-mono font-bold text-theme">{formatSmartMoney(sub.revenue)}</div>
                                    </div>
                                    <div className="text-right w-20">
                                        <div className="text-gray-400">Sales Share %</div>
                                        <div className="font-mono font-bold text-gray-700">
                                            {'>'} {formatPct(sub.revenueSharePct, 1)}
                                        </div>
                                    </div>
                                    <div className="text-right w-24">
                                        <div className="text-gray-400">Profit B4 Refund</div>
                                        <div className="font-mono font-bold text-sky-600">
                                            {formatSmartMoney(rowProfitBeforeRefund)}
                                        </div>
                                    </div>
                                    <div className="text-right w-24">
                                        <div className="text-gray-400">Net Profit</div>
                                        <div className={`font-mono font-bold ${sub.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            {formatSmartMoney(sub.profit)}
                                        </div>
                                    </div>
                                    <div className="text-right w-20">
                                        <div className="text-gray-400">Margin %</div>
                                        <div className={`font-mono font-bold ${sub.margin !== null && sub.margin >= thresholds.marginBelowTargetPct ? 'text-emerald-600' : sub.margin !== null && sub.margin >= 0 ? 'text-amber-500' : 'text-red-600'}`}>
                                            {formatPct(sub.margin)}
                                        </div>
                                    </div>
                                    {showPop && popAvailable && (() => {
                                        const prev = previousPlatformSubtotalsMap.get(sub.platform) || {};
                                        const revenueDelta = sub.revenue - (prev.revenue || 0);
                                        const unitDelta = sub.soldQty - (prev.soldQty || 0);
                                        const marginDelta = (sub.margin || 0) - (prev.margin || 0);
                                        return (
                                            <>
                                                <div className="text-right w-24 pop-col-current rounded px-2 py-1">
                                                    <div className="text-gray-400">PoP Revenue</div>
                                                    <div className="font-mono font-bold text-gray-700">{revenueDelta >= 0 ? '+' : ''}{formatSmartMoney(revenueDelta)}</div>
                                                </div>
                                                <div className="text-right w-20 pop-col-prev rounded px-2 py-1">
                                                    <div className="text-gray-400">PoP Units</div>
                                                    <div className="font-mono font-bold text-gray-700">{unitDelta >= 0 ? '+' : ''}{formatNumber(unitDelta)}</div>
                                                </div>
                                                <div className="text-right w-20 pop-col-delta-pct rounded px-2 py-1">
                                                    <div className="text-gray-400">PoP Margin</div>
                                                    <div className="font-mono font-bold text-gray-700">{marginDelta >= 0 ? '+' : ''}{marginDelta.toFixed(1)}%</div>
                                                </div>
                                            </>
                                        );
                                    })()}
                                </div>
                            </button>
                            {expandedPlatform === sub.platform && (() => {
                                const breakdown = platformCostBreakdowns.get(sub.platform);
                                if (!breakdown) return null;
                                const refundCost = breakdown.costs.find(cost => cost.label === 'Refund Impact');
                                const nonRefundCosts = breakdown.costs.filter(cost => cost.label !== 'Refund Impact');
                                const preRefundProfit = breakdown.revenue - nonRefundCosts.reduce((sum, cost) => sum + cost.value, 0);
                                const waterfallSteps = [
                                    { label: 'Revenue', amount: breakdown.revenue, running: breakdown.revenue, type: 'start' as const },
                                    ...nonRefundCosts.map((cost, idx) => {
                                        const prev = idx === 0 ? breakdown.revenue : (breakdown.revenue - nonRefundCosts.slice(0, idx).reduce((sum, item) => sum + item.value, 0));
                                        const next = prev - cost.value;
                                        return { label: cost.label, amount: cost.value, running: next, type: 'cost' as const };
                                    }),
                                    { label: 'Profit Before Refund', amount: preRefundProfit, running: preRefundProfit, type: 'checkpoint' as const },
                                    ...(refundCost ? [{
                                        label: 'Refund Impact',
                                        amount: refundCost.value,
                                        running: preRefundProfit - refundCost.value,
                                        type: 'cost' as const
                                    }] : []),
                                    ...(Math.abs(breakdown.reconciliation) > 0.01 ? [{
                                        label: breakdown.reconciliationLabel,
                                        amount: breakdown.reconciliation,
                                        running: breakdown.netProfit,
                                        type: 'recon' as const
                                    }] : []),
                                    { label: 'Net Profit', amount: breakdown.netProfit, running: breakdown.netProfit, type: 'end' as const }
                                ];

                                const runningPoints: number[] = [0];
                                waterfallSteps.forEach((step, idx) => {
                                    const prevRunning = idx === 0 ? 0 : waterfallSteps[idx - 1].running;
                                    runningPoints.push(prevRunning, step.running);
                                });
                                const domainMin = Math.min(...runningPoints);
                                const domainMax = Math.max(...runningPoints);
                                const domainSpan = Math.max(1, domainMax - domainMin);
                                const toYPct = (value: number) => ((value - domainMin) / domainSpan) * 100;
                                const zeroYPct = toYPct(0);
                                const showZeroLine = zeroYPct >= 0 && zeroYPct <= 100;
                                return (
                                    <div className="px-5 pb-4">
                                        <div className="rounded-lg border border-gray-100 bg-gray-50/70 p-3">
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Waterfall Breakdown</div>
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-theme font-semibold">Revenue</span>
                                                        <span className="font-mono font-bold text-theme">{formatSmartMoney(breakdown.revenue)}</span>
                                                    </div>
                                                    {nonRefundCosts.map(cost => (
                                                        <div key={cost.label} className="flex items-center justify-between text-xs">
                                                            <span className="text-gray-600">{cost.label}</span>
                                                            <span className="font-mono font-semibold text-red-600">-{formatSmartMoney(cost.value)}</span>
                                                        </div>
                                                    ))}
                                                    <div className="flex items-center justify-between text-xs">
                                                        <span className="text-gray-700 font-semibold">Profit Before Refund</span>
                                                        <span className="font-mono font-semibold text-sky-600">
                                                            {formatSmartMoney(preRefundProfit)}
                                                        </span>
                                                    </div>
                                                    {refundCost && (
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="text-gray-600">Refund Impact</span>
                                                            <span className="font-mono font-semibold text-red-600">-{formatSmartMoney(refundCost.value)}</span>
                                                        </div>
                                                    )}
                                                    {Math.abs(breakdown.reconciliation) > 0.01 && (
                                                        <div className="flex items-center justify-between text-xs">
                                                            <span className="text-gray-500">{breakdown.reconciliationLabel}</span>
                                                            <span className={`font-mono font-semibold ${breakdown.reconciliation >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                                {breakdown.reconciliation > 0 ? '+' : ''}{formatSmartMoney(breakdown.reconciliation)}
                                                            </span>
                                                        </div>
                                                    )}
                                                    <div className="pt-1 border-t border-gray-200 flex items-center justify-between text-sm">
                                                        <span className="text-gray-700 font-bold">Net Profit</span>
                                                        <span className={`font-mono font-bold ${breakdown.netProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                                            {formatSmartMoney(breakdown.netProfit)}
                                                        </span>
                                                    </div>
                                                </div>
                                                <div className="space-y-2">
                                                    <div className="text-[11px] font-bold uppercase tracking-wide text-gray-500">Waterfall (Running Total)</div>
                                                    <div>
                                                        <div>
                                                            <div className="relative h-56 rounded-lg border border-gray-200 bg-white p-3">
                                                                {[0, 1, 2, 3, 4].map(grid => (
                                                                    <div
                                                                        key={`grid-${grid}`}
                                                                        className="absolute left-3 right-3 border-t border-dashed border-gray-100"
                                                                        style={{ top: `${12 + grid * 22}%` }}
                                                                    />
                                                                ))}
                                                                {showZeroLine && (
                                                                    <div className="absolute left-3 right-3 bottom-10 top-5 pointer-events-none">
                                                                        <div
                                                                            className="absolute left-0 right-0 border-t-2 border-gray-400"
                                                                            style={{ bottom: `${zeroYPct}%` }}
                                                                        />
                                                                    </div>
                                                                )}
                                                                <div className="absolute left-3 right-3 bottom-10 top-5 flex items-end gap-2">
                                                                    {waterfallSteps.map((step, idx) => {
                                                                        const prevRunning = idx === 0 ? 0 : waterfallSteps[idx - 1].running;
                                                                        const currentRunning = step.running;
                                                                        const high = Math.max(prevRunning, currentRunning);
                                                                        const low = Math.min(prevRunning, currentRunning);
                                                                        const topPct = toYPct(high);
                                                                        const bottomPct = toYPct(low);
                                                                        const barHeightPct = Math.max(2, topPct - bottomPct);
                                                                        const colorClass = step.type === 'start' || step.type === 'end'
                                                                            ? 'bg-emerald-500'
                                                                            : step.type === 'checkpoint'
                                                                                ? 'bg-sky-500'
                                                                            : step.type === 'cost'
                                                                                ? 'bg-red-400'
                                                                                : step.amount >= 0
                                                                                    ? 'bg-emerald-400'
                                                                                    : 'bg-red-400';
                                                                        return (
                                                                            <div key={`${step.label}-${idx}`} className="relative flex-1 min-w-[30px] h-full">
                                                                                {idx > 0 && (
                                                                                    <div
                                                                                        className="absolute border-t border-gray-300 border-dashed"
                                                                                        style={{
                                                                                            left: '-50%',
                                                                                            right: '50%',
                                                                                            bottom: `${toYPct(prevRunning)}%`
                                                                                        }}
                                                                                    />
                                                                                )}
                                                                                <div
                                                                                    className={`absolute left-1 right-1 rounded-sm ${colorClass}`}
                                                                                    style={{
                                                                                        bottom: `${bottomPct}%`,
                                                                                        height: `${barHeightPct}%`
                                                                                    }}
                                                                                />
                                                                                <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-mono text-gray-700 whitespace-nowrap">
                                                                                    {step.type === 'start' || step.type === 'end' || step.type === 'checkpoint'
                                                                                        ? formatSmartMoney(step.running)
                                                                                        : `${step.type === 'cost' ? '-' : step.amount > 0 ? '+' : ''}${formatSmartMoney(Math.abs(step.amount))}`}
                                                                                </div>
                                                                                <div
                                                                                    className="absolute -bottom-9 left-1/2 -translate-x-1/2 text-[9px] leading-tight text-gray-500 text-center whitespace-pre-line"
                                                                                    style={{ width: '72px' }}
                                                                                >
                                                                                    {formatAxisLabel(step.label)}
                                                                                </div>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                            <div className="mt-2 flex items-center gap-3 text-[10px] text-gray-500">
                                                                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-emerald-500" />Total / positive step</span>
                                                                <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-red-400" />Cost decrease</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })()}
                        </div>
                    )})}
                    {platformSubtotals.length === 0 && (
                        <div className="p-4 text-center text-gray-400 text-xs italic">No breakdown available.</div>
                    )}
                </div>
            </div>

            <div className="bg-custom-glass backdrop-blur-custom rounded-xl border border-custom-glass shadow-sm overflow-hidden">
                <div className="sello-table-scroll">
                    <table className="sello-table">
                        <thead className="sticky top-0">
                            <tr>
                                <th>Date</th>
                                <th>Platform</th>
                                <th className="r">Price</th>
                                <th className="r">Qty</th>
                                <th className="r">Revenue</th>
                                <th className="r">Ex. Freight</th>
                                <th className="r">Postage</th>
                                <th className="r">Ads</th>
                                <th className="r">Margin</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedTransactions.map((tx: any, idx: number) => {
                                const isRefund = tx._type === 'REFUND_LOG' || tx.velocity < 0;
                                const isAdRow = tx.price === 0 && (tx.adsSpend || 0) > 0 && !isRefund;
                                const isZeroRev = Math.abs(tx.price * tx.velocity) < 0.01 && !isAdRow && !isRefund;
                                const margin = marginPct(calcProfit(tx), calcRevenue(tx));
                                const rawAds = (tx.rawAdsSpend ?? tx.adsSpend ?? 0) * VAT_MULTIPLIER;
                                const adjustedAds = (tx.adsSpend || 0) * VAT_MULTIPLIER;
                                const adDelta = adjustedAds - rawAds;
                                const isRedistributed = tx.rawAdsSpend !== undefined && tx.rawAdsSpend !== null && Math.abs((tx.adsSpend || 0) - (tx.rawAdsSpend || 0)) > 0.0001;
                                const adsColorClass = isRedistributed
                                    ? (adDelta >= 0 ? 'text-blue-600' : 'text-violet-700')
                                    : 'text-gray-900';
                                const adsColor = isRedistributed
                                    ? (adDelta >= 0 ? '#2563eb' : '#5B21B6')
                                    : '#111827';

                                const totalExtraFreight = !isRefund && !isAdRow ? (tx.realExtraFreight || 0) * VAT_MULTIPLIER : 0;
                                const totalPostage = !isRefund && !isAdRow ? (tx.realPostage || 0) * VAT_MULTIPLIER : 0;

                                return (
                                    <tr key={idx} className={`${
                                        isAdRow ? 'bg-orange-50/40 text-orange-900' :
                                        isRefund ? 'bg-red-50/40 text-red-900' :
                                        isZeroRev ? 'opacity-60 bg-gray-50/30' : ''
                                    }`}>
                                        <td className="font-mono text-xs opacity-80">{new Date(tx.date).toLocaleDateString('en-GB')}</td>
                                        <td>
                                            <div className="flex flex-col">
                                                <div className="flex items-center gap-1.5">
                                                    <span className={`sello-badge ${isAdRow ? 'badge-orange' : isRefund ? 'badge-red' : tx.platform === 'Amazon' ? 'badge-amazon' : tx.platform === 'eBay' ? 'badge-ebay' : tx.platform === 'Etsy' ? 'badge-etsy' : 'badge-gray'}`}>
                                                        {tx.platform}
                                                    </span>
                                                    <span
                                                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${isRedistributed ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}
                                                        title={isRedistributed ? `Raw ${formatSmartMoney(rawAds)} -> Adjusted ${formatSmartMoney(adjustedAds)} (Delta ${adDelta > 0 ? '+' : ''}${formatSmartMoney(adDelta)})` : 'No ad redistribution on this row'}
                                                    >
                                                        {isRedistributed ? 'Redistributed' : 'Raw'}
                                                    </span>
                                                </div>
                                                {isRefund && tx.reason && (
                                                    <span className="text-[9px] text-red-500 mt-0.5 max-w-[120px] truncate">{tx.reason}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="r font-medium">
                                            {isAdRow ? <span className="text-xs text-orange-600 font-bold">Ad Cost</span> : formatSmartMoney(tx.price * VAT_MULTIPLIER)}
                                        </td>
                                        <td className="r font-bold opacity-90">{formatNumber(tx.velocity)}</td>
                                        <td className={`r ${isZeroRev ? 'text-gray-400 italic' : isRefund ? 'text-red-600' : 'text-theme'}`}>
                                            {formatSmartMoney(tx.price * tx.velocity * VAT_MULTIPLIER)}
                                        </td>
                                        <td className="r text-green-600 font-medium">
                                            {totalExtraFreight > 0 ? formatSmartMoney(totalExtraFreight) : '-'}
                                        </td>
                                        <td className="r text-orange-600 font-medium">
                                            {totalPostage > 0 ? formatSmartMoney(totalPostage) : '-'}
                                        </td>
                                        <td
                                            className={`r font-medium ${adsColorClass}`}
                                            style={{ color: adsColor }}
                                            title={`Raw ${formatSmartMoney(rawAds)} | Adjusted ${formatSmartMoney(adjustedAds)} | Delta ${adDelta > 0 ? '+' : ''}${formatSmartMoney(adDelta)}`}
                                        >
                                            {adjustedAds > 0 ? formatSmartMoney(adjustedAds) : '-'}
                                        </td>
                                        <td className={`r font-bold ${(margin || 0) < 10 && margin !== null ? 'text-red-500' : 'text-emerald-600'}`}>
                                            {!isAdRow && !isRefund ? formatPct(margin) : isAdRow ? '\u2014' : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                            {paginatedTransactions.length === 0 && (
                                <tr><td colSpan={9} className="c p-8 text-gray-400">No transactions match filters</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {filteredTransactionsLength >= txLimit && (
                    <div className="p-3 text-center border-t border-gray-100">
                        <button onClick={() => setTxLimit(prev => prev + 50)} className="text-xs text-theme font-medium hover:underline">
                            Load More ({filteredTransactionsLength - txLimit} remaining)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
