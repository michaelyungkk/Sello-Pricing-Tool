
import React from 'react';
import { Layers, Activity, Calendar, Filter, Search, Info } from 'lucide-react';
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
    product: Product; // Keeping product prop for potential future context, but not using for calc
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
    product
}) => {
    return (
        <div className="space-y-6">
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <Layers className="w-5 h-5 text-indigo-600" />
                            Transaction Ledger
                        </h3>
                        <button
                            onClick={() => setIsAuditPanelVisible(!isAuditPanelVisible)}
                            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg font-medium border transition-all shadow-sm text-xs ${isAuditPanelVisible ? 'bg-amber-500 text-white border-amber-600' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                            title="Show Data Audit"
                        >
                            <Activity className="w-3 h-3" />
                            Audit
                        </button>
                    </div>
                    <div className="flex gap-2">
                        <div className="relative">
                            <select 
                                value={txDays}
                                onChange={e => setTxDays(Number(e.target.value))}
                                className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value={7}>Last 7 Days</option>
                                <option value={30}>Last 30 Days</option>
                                <option value={90}>Last 90 Days</option>
                            </select>
                            <Calendar className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        </div>
                        <div className="relative">
                            <select 
                                value={txFilterPlatform}
                                onChange={e => setTxFilterPlatform(e.target.value)}
                                className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="All">All Platforms</option>
                                {platforms.map(p => <option key={p} value={p}>{p}</option>)}
                            </select>
                            <Filter className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        </div>
                        <div className="relative">
                            <select 
                                value={txFilterType}
                                onChange={e => setTxFilterType(e.target.value)}
                                className="pl-8 pr-4 py-1.5 border border-gray-300 rounded-lg text-sm appearance-none bg-white focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="All">All Types</option>
                                <option value="Sale">Sale (Price {'>'} 0)</option>
                                <option value="Ad Cost">Ad Cost (Ads {'>'} 0)</option>
                                <option value="Refund">Refunds Only</option>
                            </select>
                            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                        </div>
                    </div>
                </div>

                {isAuditPanelVisible && (
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
                )}
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200 shadow-sm text-sm">
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 uppercase font-medium">Sales Rows</span>
                    <div className="text-xl font-bold text-gray-800">{ledgerStats.salesRows}</div>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 uppercase font-medium">Total Units</span>
                    <div className="text-xl font-bold text-green-700">{ledgerStats.totalUnits}</div>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 uppercase font-medium flex items-center gap-1">
                        Ad-Only Spend 
                        <span title="Includes daily PPC costs not attributed to specific orders. Pooled into total TACoS.">
                            <Info className="w-3 h-3 text-gray-400" />
                        </span>
                    </span>
                    <div className="text-xl font-bold text-orange-700">{formatMoney(ledgerStats.adOnlySpend)}</div>
                </div>
                <div className="flex flex-col">
                    <span className="text-xs text-gray-500 uppercase font-medium">Refunds (Detected)</span>
                    <div className="text-xl font-bold text-red-700 flex items-center gap-1">
                        {ledgerStats.refundCount}
                        {ledgerStats.refundValue > 0 && <span className="text-sm font-medium opacity-70">(-{formatMoney(ledgerStats.refundValue, 0)})</span>}
                    </div>
                </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden animate-in fade-in">
                <div className="p-3 bg-gray-50/50 border-b border-gray-100">
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
                                    <div className="font-mono font-bold text-orange-600">{formatMoney(sub.adSpend)}</div>
                                </div>
                                <div className="text-right w-24">
                                    <div className="text-gray-400">Revenue</div>
                                    <div className="font-mono font-bold text-indigo-600">{formatMoney(sub.revenue)}</div>
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
                                        {formatMoney(sub.profit)}
                                    </div>
                                </div>
                                <div className="text-right w-20">
                                    <div className="text-gray-400">Margin %</div>
                                    <div className={`font-mono font-bold ${sub.margin !== null && sub.margin >= thresholds.marginBelowTargetPct ? 'text-green-600' : sub.margin !== null && sub.margin >= 0 ? 'text-amber-600' : 'text-red-600'}`}>
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

            <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm text-left whitespace-nowrap">
                        <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                            <tr>
                                <th className="p-3">Date</th>
                                <th className="p-3">Platform</th>
                                <th className="p-3 text-right">Price</th>
                                <th className="p-3 text-right">Qty</th>
                                <th className="p-3 text-right">Revenue</th>
                                <th className="p-3 text-right">Ex. Freight</th>
                                <th className="p-3 text-right">Postage</th>
                                <th className="p-3 text-right">Ads</th>
                                <th className="p-3 text-right">Margin</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                            {paginatedTransactions.map((tx: any, idx: number) => {
                                const isRefund = tx._type === 'REFUND_LOG' || tx.velocity < 0;
                                const isAdRow = tx.price === 0 && (tx.adsSpend || 0) > 0 && !isRefund;
                                const isZeroRev = Math.abs(tx.price * tx.velocity) < 0.01 && !isAdRow && !isRefund;
                                const margin = marginPct(calcProfit(tx), calcRevenue(tx));
                                
                                // USE REAL DATA FROM IMPORT (WITH VAT SCALING)
                                const totalExtraFreight = !isRefund && !isAdRow ? (tx.realExtraFreight || 0) * VAT_MULTIPLIER : 0;
                                const totalPostage = !isRefund && !isAdRow ? (tx.realPostage || 0) * VAT_MULTIPLIER : 0;

                                return (
                                    <tr key={idx} className={`hover:bg-gray-50/50 transition-colors ${
                                        isAdRow ? 'bg-orange-50/40 text-orange-900' : 
                                        isRefund ? 'bg-red-50/40 text-red-900' : 
                                        isZeroRev ? 'opacity-60 bg-gray-50/30' : ''
                                    }`}>
                                        <td className="p-3 font-mono text-xs opacity-80">{new Date(tx.date).toLocaleDateString('en-GB')}</td>
                                        <td className="p-3">
                                            <div className="flex flex-col">
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold border w-fit ${isAdRow ? 'bg-orange-100 border-orange-200 text-orange-800' : isRefund ? 'bg-red-100 border-red-200 text-red-800' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                                                    {tx.platform}
                                                </span>
                                                {isRefund && tx.reason && (
                                                    <span className="text-[9px] text-red-500 mt-0.5 max-w-[120px] truncate">{tx.reason}</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-3 text-right font-medium">
                                            {isAdRow ? <span className="text-xs text-orange-600 font-bold">Ad Cost</span> : formatMoney(tx.price * VAT_MULTIPLIER)}
                                        </td>
                                        <td className="p-3 text-right font-bold opacity-90">{formatNumber(tx.velocity)}</td>
                                        <td className={`p-3 text-right ${isZeroRev ? 'text-gray-400 italic' : isRefund ? 'text-red-600' : 'text-indigo-600'}`}>
                                            {formatMoney(tx.price * tx.velocity * VAT_MULTIPLIER)}
                                        </td>
                                        <td className="p-3 text-right text-green-600 font-medium">
                                            {totalExtraFreight > 0 ? formatMoney(totalExtraFreight) : '-'}
                                        </td>
                                        <td className="p-3 text-right text-orange-600 font-medium">
                                            {totalPostage > 0 ? formatMoney(totalPostage) : '-'}
                                        </td>
                                        <td className="p-3 text-right text-orange-600 font-medium">
                                            {(tx.adsSpend || 0) > 0 ? formatMoney(tx.adsSpend * VAT_MULTIPLIER) : '-'}
                                        </td>
                                        <td className={`p-3 text-right font-bold ${(margin || 0) < 10 && margin !== null ? 'text-red-600' : 'text-green-600'}`}>
                                            {!isAdRow && !isRefund ? formatPct(margin) : isAdRow ? '—' : '-'}
                                        </td>
                                    </tr>
                                );
                            })}
                            {paginatedTransactions.length === 0 && (
                                <tr><td colSpan={9} className="p-8 text-center text-gray-400">No transactions match filters</td></tr>
                            )}
                        </tbody>
                    </table>
                </div>
                {filteredTransactionsLength >= txLimit && (
                    <div className="p-3 text-center border-t border-gray-100">
                        <button onClick={() => setTxLimit(prev => prev + 50)} className="text-xs text-indigo-600 font-medium hover:underline">
                            Load More ({filteredTransactionsLength - txLimit} remaining)
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};
