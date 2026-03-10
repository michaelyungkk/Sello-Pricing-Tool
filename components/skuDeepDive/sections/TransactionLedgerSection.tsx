
import React from 'react';
import { Layers, Activity, Calendar, Search, Info, Rows } from 'lucide-react';
import { SelectFilter } from '../../common/SelectFilter';
import AuditPanel from '../../AuditPanel';
import { GradeBadge } from '../../GradeBadge';
import { formatMoney, formatNumber, formatPct } from '../../../utils/format';
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
    ledgerStats, platformSubtotals, paginatedTransactions,
    filteredTransactionsLength, txLimit, setTxLimit,
    isAuditPanelVisible, setIsAuditPanelVisible,
    txDays, setTxDays, txFilterPlatform, setTxFilterPlatform,
    txFilterType, setTxFilterType, platforms,
    startKey, endKey, filteredTransactions, thresholds,
    calcRevenue, calcUnits, calcProfit, calcAdSpend, marginPct,
    product, adRedistributionSummary
}) => {
    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2 mr-auto">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <Rows className="w-5 h-5 text-indigo-600" />
                        Transaction Ledger
                        <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded ml-1">Recent Logs</span>
                    </h3>
                </div>
                <div className="relative">
                    <select value={txDays} onChange={e => setTxDays(Number(e.target.value))}
                        className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-indigo-500">
                        <option value={7}>Last 7 Days</option>
                        <option value={14}>Last 14 Days</option>
                        <option value={30}>Last 30 Days</option>
                        <option value={90}>Last 90 Days</option>
                    </select>
                    <Calendar className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
                <SelectFilter label="Platform" options={platforms}
                    selected={txFilterPlatform === 'All' ? [] : [txFilterPlatform]}
                    onChange={sel => setTxFilterPlatform(sel.length === 0 ? 'All' : sel[0])}
                    singleSelect allLabel="All Platforms" />
                <div className="relative">
                    <select value={txFilterType} onChange={e => setTxFilterType(e.target.value)}
                        className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-indigo-500">
                        <option value="All">All Types</option>
                        <option value="Sale">Sale (Price {'>'} 0)</option>
                        <option value="Ad Cost">Ad Cost (Ads {'>'} 0)</option>
                        <option value="Refund">Refunds Only</option>
                    </select>
                    <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
                <button onClick={() => setIsAuditPanelVisible(!isAuditPanelVisible)}
                    className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all border flex items-center gap-2 ${isAuditPanelVisible ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                    <Activity className="w-4 h-4" />
                    {isAuditPanelVisible ? 'Hide Audit' : 'Audit Reconciliation'}
                </button>
            </div>

            {adRedistributionSummary?.active && (
                <p className="text-[11px] text-gray-400 flex items-center gap-1.5 -mt-2 opacity-80">
                    <Info className="w-3 h-3 flex-shrink-0" />
                    Ad spend redistributed across family members &nbsp;·&nbsp;
                    Raw: £{adRedistributionSummary.rawSpend.toFixed(2)} &nbsp;→&nbsp;
                    Adjusted: £{adRedistributionSummary.adjustedSpend.toFixed(2)}
                </p>
            )}
            <p className="text-xs text-gray-400 -mt-2">
                Viewing {Math.min(txLimit, filteredTransactionsLength)} of {filteredTransactionsLength} records for the selected period.
            </p>

            {isAuditPanelVisible && (
                <div className="sello-glass p-4 rounded-xl animate-in fade-in zoom-in-95 duration-200">
                    <AuditPanel title="Ledger Reconciliation"
                        startKey={startKey} endKey={endKey} rows={filteredTransactions}
                        getDateKey={(row: any) => asDateKey(row.date)}
                        getRevenue={(row: any) => calcRevenue(row)}
                        getQty={(row: any) => calcUnits(row)}
                        getProfit={(row: any) => calcProfit(row)}
                        getAdSpend={(row: any) => calcAdSpend(row)} />
                </div>
            )}

            {/* Summary stat cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 sello-glass rounded-xl text-sm">
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
                    <div className="text-xl font-bold text-amber-500">{formatMoney(ledgerStats.adOnlySpend)}</div>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 uppercase font-medium">Refunds (Detected)</span>
                    <div className="text-xl font-bold text-red-500 flex items-center gap-1">
                        {ledgerStats.refundCount}
                        {ledgerStats.refundValue > 0 && <span className="text-sm font-medium opacity-70">(-{formatMoney(ledgerStats.refundValue, 0)})</span>}
                    </div>
                </div>
            </div>

            {/* Platform subtotals */}
            <div className="sello-glass rounded-xl overflow-hidden">
                <div style={{ padding: '8px 12px', borderBottom: '1px solid var(--glass-divider)' }}>
                    <h4 className="text-xs font-bold text-gray-500 uppercase">Platform Subtotals (for period)</h4>
                </div>
                <div className="divide-y divide-gray-100">
                    {platformSubtotals.map(sub => (
                        <div key={sub.platform} className="flex items-center justify-between px-4 py-3.5 hover:bg-gray-50">
                            <span className="font-bold text-sm text-gray-800 w-1/5">{sub.platform}</span>
                            <div className="flex items-center justify-end gap-4 text-xs w-4/5">
                                <div className="text-right w-20">
                                    <div className="text-gray-400">Qty Sold</div>
                                    <div className="v-num">{formatNumber(sub.soldQty)}</div>
                                </div>
                                <div className="text-right w-24">
                                    <div className="text-gray-400">Ad Spend</div>
                                    <div className="v-num" style={{ color: '#d97706' }}>{formatMoney(sub.adSpend)}</div>
                                </div>
                                <div className="text-right w-24">
                                    <div className="text-gray-400">Revenue</div>
                                    <div className="v-num" style={{ color: '#4f46e5' }}>{formatMoney(sub.revenue)}</div>
                                </div>
                                <div className="text-right w-20">
                                    <div className="text-gray-400">Sales Share %</div>
                                    <div className="v-num">{'>'} {formatPct(sub.revenueSharePct, 1)}</div>
                                </div>
                                <div className="text-right w-24">
                                    <div className="text-gray-400">Profit</div>
                                    <div className={sub.profit >= 0 ? 'v-num' : 'v-neg'}>{formatMoney(sub.profit)}</div>
                                </div>
                                <div className="text-right w-20">
                                    <div className="text-gray-400">Margin %</div>
                                    <div className={`v-num ${sub.margin !== null && sub.margin >= thresholds.marginBelowTargetPct ? '' : sub.margin !== null && sub.margin >= 0 ? '' : 'v-neg'}`}
                                        style={{ color: sub.margin !== null && sub.margin >= thresholds.marginBelowTargetPct ? '#059669' : sub.margin !== null && sub.margin >= 0 ? '#d97706' : undefined }}>
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

            {/* Transaction table */}
            <div className="sello-glass rounded-xl overflow-hidden">
                <div className="sello-table-scroll">
                    <table className="sello-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Platform</th>
                                <th className="r col-blue">Price</th>
                                <th className="r">Qty</th>
                                <th className="r col-blue">Revenue</th>
                                <th className="r col-green">Ex. Freight</th>
                                <th className="r">Postage</th>
                                <th className="r">Ads</th>
                                <th className="r col-green">Margin</th>
                            </tr>
                        </thead>
                        <tbody>
                            {paginatedTransactions.map((tx: any, idx: number) => {
                                const isRefund = tx._type === 'REFUND_LOG' || tx.velocity < 0;
                                const isAdRow = tx.price === 0 && (tx.adsSpend || 0) > 0 && !isRefund;
                                const isZeroRev = Math.abs(tx.price * tx.velocity) < 0.01 && !isAdRow && !isRefund;
                                const margin = marginPct(calcProfit(tx), calcRevenue(tx));
                                const totalExtraFreight = !isRefund && !isAdRow ? (tx.realExtraFreight || 0) * VAT_MULTIPLIER : 0;
                                const totalPostage = !isRefund && !isAdRow ? (tx.realPostage || 0) * VAT_MULTIPLIER : 0;
                                return (
                                    <tr key={idx} style={{
                                        background: isAdRow ? 'rgba(255,237,213,0.3)' : isRefund ? 'rgba(254,226,226,0.3)' : undefined,
                                        opacity: isZeroRev ? 0.6 : 1,
                                    }}>
                                        <td><span className="v-dim">{new Date(tx.date).toLocaleDateString('en-GB')}</span></td>
                                        <td>
                                            <div className="flex flex-col">
                                                <span style={{
                                                    padding: '1px 6px', borderRadius: 4, fontSize: 10, fontWeight: 700,
                                                    border: '1px solid',
                                                    background: isAdRow ? '#fed7aa' : isRefund ? '#fee2e2' : '#f3f4f6',
                                                    color: isAdRow ? '#9a3412' : isRefund ? '#991b1b' : '#4b5563',
                                                    borderColor: isAdRow ? '#fdba74' : isRefund ? '#fca5a5' : '#e5e7eb',
                                                    width: 'fit-content',
                                                }}>
                                                    {tx.platform}
                                                </span>
                                                {isRefund && tx.reason && (
                                                    <span style={{ fontSize: 9, color: '#dc2626', marginTop: 2, maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tx.reason}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="r col-blue">
                                            {isAdRow ? <span style={{ fontSize: 10, color: '#d97706', fontWeight: 700 }}>Ad Cost</span> : <span className="v-num">£{formatMoney(tx.price * VAT_MULTIPLIER, 2, '')}</span>}
                                        </td>
                                        <td className="r"><span className="v-num v-bold">{formatNumber(tx.velocity)}</span></td>
                                        <td className="r col-blue">
                                            <span className={isRefund ? 'v-neg' : 'v-num'} style={isZeroRev ? { color: '#9ca3af' } : undefined}>
                                                {formatMoney(tx.price * tx.velocity * VAT_MULTIPLIER)}
                                            </span>
                                        </td>
                                        <td className="r col-green">
                                            <span className="v-num">{totalExtraFreight > 0 ? formatMoney(totalExtraFreight) : <span className="v-dim">—</span>}</span>
                                        </td>
                                        <td className="r">
                                            <span className="v-num" style={{ color: '#d97706' }}>{totalPostage > 0 ? formatMoney(totalPostage) : <span className="v-dim">—</span>}</span>
                                        </td>
                                        <td className="r">
                                            <span className="v-num" style={{ color: '#d97706' }}>{(tx.adsSpend || 0) > 0 ? formatMoney(tx.adsSpend * VAT_MULTIPLIER) : <span className="v-dim">—</span>}</span>
                                        </td>
                                        <td className="r col-green">
                                            {!isAdRow && !isRefund
                                                ? <span className={(margin || 0) < 10 && margin !== null ? 'v-neg' : 'v-num'}>{formatPct(margin)}</span>
                                                : <span className="v-dim">—</span>}
                                        </td>
                                    </tr>
                                );
                            })}
                            {paginatedTransactions.length === 0 && (
                                <tr><td colSpan={9} style={{ padding: 32, textAlign: 'center', color: '#9ca3af' }}>No transactions match filters</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {filteredTransactionsLength >= txLimit && (
                    <div style={{ padding: 12, textAlign: 'center', borderTop: '1px solid var(--glass-divider)' }}>
                        <button onClick={() => setTxLimit(prev => prev + 50)} style={{ fontSize: 12, color: '#4f46e5', fontWeight: 600, cursor: 'pointer' }}>
                            Load More ({filteredTransactionsLength - txLimit} remaining)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
