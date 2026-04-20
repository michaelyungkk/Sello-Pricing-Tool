
import React from 'react';
import { Activity, Calendar, Search, Info, Rows } from 'lucide-react';
import { SelectFilter } from '../../common/SelectFilter';
import AuditPanel from '../../common/AuditPanel';
import { formatSmartMoney, formatNumber, formatPct } from '../../../utils/format';
import { asDateKey } from '../../../services/dateUtils';
import { VAT_MULTIPLIER } from '../../../constants';
import { Product } from '../../../types';

interface TransactionLedgerSectionProps {
    ledgerStats: any;
    platformSubtotals: any[];
    paginatedTransactions: any[];
    filteredTransactionsLength: number;
    txLimit: number;
    setTxLimit: (n: number | ((prev: number) => number)) => void;
    isAuditPanelVisible: boolean;
    setIsAuditPanelVisible: (b: boolean) => void;
    txDays: number;
    setTxDays: (n: number) => void;
    txFilterPlatform: string;
    setTxFilterPlatform: (s: string) => void;
    txFilterType: string;
    setTxFilterType: (s: string) => void;
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
        rawSpend: number;
        adjustedSpend: number;
    } | null;
}

export const TransactionLedgerSection: React.FC<TransactionLedgerSectionProps> = ({
    ledgerStats,
    platformSubtotals,
    paginatedTransactions,
    filteredTransactionsLength,
    txLimit,
    setTxLimit,
    isAuditPanelVisible,
    setIsAuditPanelVisible,
    txDays,
    setTxDays,
    txFilterPlatform,
    setTxFilterPlatform,
    txFilterType,
    setTxFilterType,
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
                        value={txDays}
                        onChange={e => setTxDays(Number(e.target.value))}
                        className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-theme"
                    >
                        <option value={7}>Last 7 Days</option>
                        <option value={14}>Last 14 Days</option>
                        <option value={30}>Last 30 Days</option>
                        <option value={90}>Last 90 Days</option>
                    </select>
                    <Calendar className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
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
                <button
                    onClick={() => setIsAuditPanelVisible(!isAuditPanelVisible)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border flex items-center gap-2 ${isAuditPanelVisible ? 'bg-theme-10 border-theme-20 text-theme' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
                >
                    <Activity className="w-4 h-4" />
                    {isAuditPanelVisible ? 'Hide Audit' : 'Audit Reconciliation'}
                </button>
            </div>
            {adRedistributionSummary?.active && (
                <p className="text-[11px] text-gray-400 flex items-center gap-1.5 -mt-2 opacity-80">
                    <Info className="w-3 h-3 flex-shrink-0" />
                    Ad spend redistributed across family members
                    &nbsp;·&nbsp;
                    Raw: {formatSmartMoney(adRedistributionSummary.rawSpend)}
                    &nbsp;→&nbsp;
                    Adjusted: {formatSmartMoney(adRedistributionSummary.adjustedSpend)}
                </p>
            )}
            <p className="text-xs text-gray-400 -mt-2">
                Viewing {Math.min(txLimit, filteredTransactionsLength)} of {filteredTransactionsLength} records for the selected period.
            </p>

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
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 uppercase font-medium">Total Units</span>
                    <div className="text-xl font-bold text-emerald-600">{ledgerStats.totalUnits}</div>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 uppercase font-medium flex items-center gap-1">
                        Ad-Only Spend
                        <span title="Includes daily PPC costs not attributed to specific orders. Pooled into total TACoS.">
                            <Info className="w-3 h-3 text-gray-400" />
                        </span>
                    </span>
                    <div className="text-xl font-bold text-amber-500">{formatSmartMoney(ledgerStats.adOnlySpend)}</div>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 uppercase font-medium">Refunds (Detected)</span>
                    <div className="text-xl font-bold text-red-500 flex items-center gap-1">
                        {ledgerStats.refundCount}
                        {ledgerStats.refundValue > 0 && <span className="text-sm font-medium opacity-70">(-{formatSmartMoney(ledgerStats.refundValue)})</span>}
                    </div>
                </div>
            </div>

            <div className="bg-custom-glass backdrop-blur-custom rounded-xl border border-custom-glass shadow-sm overflow-hidden animate-in fade-in">
                <div className="p-3 bg-white/10 border-b border-custom-glass">
                    <h4 className="text-xs font-bold text-gray-500 uppercase">Platform Subtotals (for period)</h4>
                </div>
                <div className="divide-y divide-gray-100">
                    {platformSubtotals.map(sub => (
                        <div key={sub.platform} className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50">
                            <span className="font-bold text-sm text-gray-800 w-1/5">{sub.platform}</span>
                            <div className="flex items-center justify-end gap-4 text-xs w-4/5">
                                <div className="text-right w-20">
                                    <div className="text-gray-400">Qty Sold</div>
                                    <div className="font-mono font-bold text-gray-700">{formatNumber(sub.soldQty)}</div>
                                </div>
                                <div className="text-right w-24">
                                    <div className="text-gray-400">Ad Spend</div>
                                    <div className="font-mono font-bold text-orange-600">{formatSmartMoney(sub.adSpend)}</div>
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
                                    <div className="text-gray-400">Profit</div>
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
                            </div>
                        </div>
                    ))}
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

                                // USE REAL DATA FROM IMPORT (WITH VAT SCALING)
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
                                                <span className={`sello-badge ${isAdRow ? 'badge-orange' : isRefund ? 'badge-red' : tx.platform === 'Amazon' ? 'badge-amazon' : tx.platform === 'eBay' ? 'badge-ebay' : tx.platform === 'Etsy' ? 'badge-etsy' : 'badge-gray'}`}>
                                                    {tx.platform}
                                                </span>
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
                                        <td className="r text-orange-600 font-medium">
                                            {(tx.adsSpend || 0) > 0 ? formatSmartMoney(tx.adsSpend * VAT_MULTIPLIER) : '-'}
                                        </td>
                                        <td className={`r font-bold ${(margin || 0) < 10 && margin !== null ? 'text-red-500' : 'text-emerald-600'}`}>
                                            {!isAdRow && !isRefund ? formatPct(margin) : isAdRow ? '—' : '-'}
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
