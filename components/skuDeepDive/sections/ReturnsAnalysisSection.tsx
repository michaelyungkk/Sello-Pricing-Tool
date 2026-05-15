
import React from 'react';
import { RotateCcw, Calendar, Brain, CloudOff, Sparkles, Smile, MessageSquare, AlertTriangle, Hash, ExternalLink, Clock } from 'lucide-react';
import { formatMoney, formatSmartMoney, formatNumber, formatPct } from '../../../utils/format';
import { parseReturnsReason } from '../../../services/returnsReasonCodes';
import ReturnsReasonTimelineChart from '../returns/ReturnsReasonTimelineChart';
import { KeywordCloud } from '../parts/KeywordCloud';
import { SortableHeader } from '../../common/SortableHeader';
import { TablePagination } from '../../common/TablePagination';
import { getReturnDateKey } from '../../../services/dateUtils';
import { ReturnDateBasis } from '../../../types';

interface ReturnsAnalysisSectionProps {
    refundAnalysis: any;
    refunds: any[];
    returnDateBasis: ReturnDateBasis;
    setReturnDateBasis: (b: ReturnDateBasis) => void;
    showAiInsights: boolean;
    setShowAiInsights: (b: boolean) => void;
    kwMode: 'All' | 'Reason';
    setKwMode: (m: 'All' | 'Reason') => void;
    kwReason: string | null;
    setKwReason: (r: string | null) => void;
    availableReasonCodes: string[];
    refundSort: any;
    setRefundSort: (s: any) => void;
    paginatedRefunds: any[];
    filteredRefundsLength: number;
    refundPage: number;
    setRefundPage: (page: number | ((prev: number) => number)) => void;
    totalRefundPages: number;
    refundItemsPerPage: number;
    setRefundItemsPerPage: (n: number) => void;
    themeColor: string;
    orderDateMap: Map<string, string>;
    thresholds: any;
}

const cleanDisplayCommentValue = (value?: string): string => (
    String(value || '').replace(/\u807D/g, ' ').replace(/\s+/g, ' ').trim()
);

const hasCjkText = (value?: string): boolean => /[\u3400-\u9FFF]/.test(cleanDisplayCommentValue(value).replace(/\u807D/g, ''));

const looksLikeMojibake = (value?: string): boolean => {
    const text = value || '';
    return !hasCjkText(text) && /[\u00C3\u00C2\uFFFD]|(?:[\u00E6\u00E8\u00E5\u00E7][\u0080-\u00FF\u0152\u0153])/.test(text);
};

const getRefundDisplayComment = (refund: any): string => {
    const candidates = [
        refund.commentCn,
        refund.comments,
        refund.customerReason,
        refund.commentEn,
        refund.remarks
    ].map((value) => cleanDisplayCommentValue(value)).filter(Boolean);

    return candidates.find(hasCjkText)
        || candidates.find(value => !looksLikeMojibake(value))
        || candidates[0]
        || '-';
};

export const ReturnsAnalysisSection: React.FC<ReturnsAnalysisSectionProps> = ({
    refundAnalysis,
    refunds,
    returnDateBasis,
    setReturnDateBasis,
    showAiInsights,
    setShowAiInsights,
    kwMode,
    setKwMode,
    kwReason,
    setKwReason,
    availableReasonCodes,
    refundSort,
    setRefundSort,
    paginatedRefunds,
    filteredRefundsLength,
    refundPage,
    setRefundPage,
    totalRefundPages,
    refundItemsPerPage,
    setRefundItemsPerPage,
    themeColor,
    orderDateMap,
    thresholds
}) => {
    // VAT MULTIPLIER is used internally in refund analysis but here we just render
    const VAT_MULTIPLIER = 1.20;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <div className="flex items-center gap-2">
                    <div className="p-2 bg-red-50 text-red-600 rounded-lg"><RotateCcw className="w-5 h-5" /></div>
                    <h3 className="text-lg font-bold text-gray-900">Returns Analysis</h3>
                </div>
                
                <div className="flex items-center gap-4">
                    {/* RETURN DATE BASIS TOGGLE */}
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setReturnDateBasis('refundDate')} 
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${returnDateBasis === 'refundDate' ? 'bg-white shadow text-theme' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Clock className="w-3 h-3" />
                            Refund Date
                        </button>
                        <button 
                            onClick={() => setReturnDateBasis('orderDate')} 
                            className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${returnDateBasis === 'orderDate' ? 'bg-white shadow text-theme' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            <Calendar className="w-3 h-3" />
                            Order Date
                        </button>
                    </div>

                    <label className="text-xs font-medium text-gray-500 uppercase flex items-center gap-1 cursor-pointer">
                        <Brain className={`w-4 h-4 ${showAiInsights ? 'text-purple-600' : 'text-gray-400'}`} />
                        AI Insights
                        <div className="relative inline-block w-10 h-5 align-middle select-none transition duration-200 ease-in ml-2">
                            <input 
                                type="checkbox" 
                                name="toggle" 
                                id="ai-toggle" 
                                className="toggle-checkbox absolute block w-5 h-5 rounded-full bg-white border-4 appearance-none cursor-pointer"
                                checked={showAiInsights}
                                onChange={() => setShowAiInsights(!showAiInsights)}
                                style={{ right: showAiInsights ? 0 : 'auto', left: showAiInsights ? 'auto' : 0, borderColor: showAiInsights ? '#8b5cf6' : '#d1d5db' }}
                            />
                            <label 
                                htmlFor="ai-toggle" 
                                className={`toggle-label block overflow-hidden h-5 rounded-full cursor-pointer ${showAiInsights ? 'bg-purple-600' : 'bg-gray-300'}`}
                            ></label>
                        </div>
                    </label>
                </div>
            </div>

            {refundAnalysis ? (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Timeline & Summary Cards */}
                        <div className="lg:col-span-2 space-y-6">
                                {/* High-Level Breakdown (VAT Inclusive) */}
                                <div className="grid grid-cols-4 gap-4">
                                <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                                    <span className="text-[10px] font-bold text-red-600 uppercase block mb-1">Total Refunds</span>
                                    <div className="text-xl font-bold text-red-800">{refundAnalysis.refundCount} cases</div>
                                </div>
                                <div className="p-4 bg-orange-50 rounded-xl border border-orange-100">
                                    <span className="text-[10px] font-bold text-orange-600 uppercase block mb-1">Resends</span>
                                    <div className="text-xl font-bold text-orange-800">{refundAnalysis.resendCount} cases</div>
                                </div>
                                <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 col-span-2">
                                    <div className="flex justify-between items-center mb-1">
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">Total Freight Refunded (Inc VAT)</span>
                                    </div>
                                    <div className="text-xl font-bold text-gray-700">{formatSmartMoney(refundAnalysis.totalFreight * VAT_MULTIPLIER)}</div>
                                </div>
                                </div>

                                <ReturnsReasonTimelineChart 
                                data={refunds}
                                getDate={(r) => getReturnDateKey(r, returnDateBasis, orderDateMap)}
                                getReason={(r) => r.platformReason || r.reason}
                                title={`Refund Timeline (${returnDateBasis === 'orderDate' ? 'By Order Date' : 'By Refund Date'})`}
                                />
                        </div>

                        <div className="space-y-6">
                                {/* Top Reasons */}
                                <div className="bg-custom-glass backdrop-blur-custom p-5 rounded-xl border border-custom-glass shadow-sm flex flex-col h-[250px]">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2"><AlertTriangle className="w-3 h-3 text-amber-500" /> Top Reasons</h4>
                                    <div className="flex-1 overflow-auto pr-1">
                                        <div className="space-y-2">
                                            {refundAnalysis.overview.reasonRows.slice(0, 5).map((r: any, i: number) => (
                                                <div key={i} className="flex justify-between items-center text-xs p-2 bg-gray-50 rounded border border-gray-100">
                                                    <span className="font-medium text-gray-700 truncate max-w-[150px]" title={r.reason}>{r.reason}</span>
                                                    <div className="text-right">
                                                        <div className="font-bold text-red-600">{r.count}</div>
                                                        <div className="text-[10px] text-gray-400">{formatSmartMoney(r.value)}</div>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                                
                                {/* AI Insights / Sentiment Panel */}
                                {showAiInsights ? (
                                <div className="bg-purple-50 p-5 rounded-xl border border-purple-200 shadow-sm animate-in fade-in zoom-in duration-300">
                                    <div className="flex items-center gap-2 mb-3 border-b border-purple-200 pb-2">
                                        <span className="p-1 bg-white rounded-lg">
                                            <Sparkles className="w-4 h-4 text-purple-600" />
                                        </span>
                                        <h4 className="text-xs font-bold text-purple-800 uppercase">AI Sentiment Summary</h4>
                                    </div>
                                    <div className="flex flex-col items-center justify-center py-6 text-center text-purple-700 gap-2">
                                        <CloudOff className="w-8 h-8 opacity-50" />
                                        <p className="text-xs font-medium">Cloud AI analysis disabled.</p>
                                        <p className="text-[10px] opacity-70">Enable API key to unlock deep sentiment analysis.</p>
                                    </div>
                                </div>
                                ) : (
                                <div className="bg-custom-glass backdrop-blur-custom p-5 rounded-xl border border-custom-glass shadow-sm animate-in fade-in">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase mb-4 flex items-center gap-2"><Smile className="w-3 h-3 text-purple-500" /> Sentiment (Local)</h4>
                                    
                                    <div className="space-y-3">
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="w-16 text-gray-500">Negative</span>
                                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-red-400" style={{ width: `${(refundAnalysis.sentimentStats.negative / (refunds.length || 1)) * 100}%` }}></div>
                                            </div>
                                            <span className="text-red-600 font-bold">{refundAnalysis.sentimentStats.negative}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="w-16 text-gray-500">Neutral</span>
                                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-gray-400" style={{ width: `${(refundAnalysis.sentimentStats.neutral / (refunds.length || 1)) * 100}%` }}></div>
                                            </div>
                                            <span className="text-gray-600 font-bold">{refundAnalysis.sentimentStats.neutral}</span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs">
                                            <span className="w-16 text-gray-500">Positive</span>
                                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-green-400" style={{ width: `${(refundAnalysis.sentimentStats.positive / (refunds.length || 1)) * 100}%` }}></div>
                                            </div>
                                            <span className="text-green-600 font-bold">{refundAnalysis.sentimentStats.positive}</span>
                                        </div>
                                    </div>
                                    <p className="text-[9px] text-gray-400 mt-4 italic text-center">Based on keyword matching.</p>
                                </div>
                                )}

                                {/* Word Cloud */}
                                <div className="bg-custom-glass backdrop-blur-custom p-5 rounded-xl border border-custom-glass shadow-sm">
                                    <div className="flex justify-between items-center mb-4">
                                        <h4 className="text-xs font-bold text-gray-500 uppercase flex items-center gap-2">
                                            <MessageSquare className="w-3 h-3 text-blue-500" /> Keyword Cloud
                                        </h4>
                                        <div className="flex bg-gray-100 p-0.5 rounded-lg">
                                            <button 
                                                onClick={() => setKwMode('All')} 
                                                className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${kwMode === 'All' ? 'bg-white shadow text-theme' : 'text-gray-500 hover:text-theme'}`}
                                            >
                                                All
                                            </button>
                                            <button 
                                                onClick={() => setKwMode('Reason')} 
                                                className={`px-2 py-1 text-[10px] font-medium rounded-md transition-all ${kwMode === 'Reason' ? 'bg-white shadow text-theme' : 'text-gray-500 hover:text-theme'}`}
                                            >
                                                By Reason
                                            </button>
                                        </div>
                                    </div>
                                    {kwMode === 'Reason' && availableReasonCodes.length > 0 && (
                                        <div className="mb-5 flex flex-wrap gap-1 border-b border-gray-100 pb-3 animate-in fade-in slide-in-from-top-1">
                                            {availableReasonCodes.map(code => (
                                                <button 
                                                    key={code} 
                                                    onClick={() => setKwReason(kwReason === code ? null : code)}
                                                    className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-all ${kwReason === code ? 'bg-theme text-white border-indigo-700' : 'bg-white text-gray-600 border-gray-200 hover:border-theme-20'}`}
                                                >
                                                    {code}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    <div className="mt-2">
                                    <KeywordCloud items={refundAnalysis.topWords} />
                                    </div>
                                </div>
                        </div>
                    </div>

                    {/* Refund Detail Table - Extended full width */}
                    <div className="bg-custom-glass backdrop-blur-custom rounded-xl border border-custom-glass shadow-sm overflow-hidden flex flex-col animate-in fade-in">
                        <div className="p-4 border-b border-custom-glass bg-white/10 flex justify-between items-center">
                            <h4 className="font-bold text-gray-800 text-sm uppercase flex items-center gap-2">
                                <Hash className="w-4 h-4 text-red-500" />
                                Refund Return Records (Full History)
                            </h4>
                            <span className="text-[10px] text-gray-400 font-bold uppercase italic">* Aligned with chart history</span>
                        </div>
                        <div className="sello-table-scroll">
                            <table className="sello-table">
                                <thead className="sticky top-0 whitespace-nowrap">
                                    <tr>
                                        <SortableHeader label="Date" sortKey="date" sort={refundSort} onChange={setRefundSort} />
                                        <SortableHeader label="Order ID" sortKey="orderId" sort={refundSort} onChange={setRefundSort} />
                                        <SortableHeader label="Platform" sortKey="platform" sort={refundSort} onChange={setRefundSort} />
                                        <SortableHeader label="Qty" sortKey="quantity" sort={refundSort} onChange={setRefundSort} align="right" />
                                        <SortableHeader label="Amount" sortKey="amount" sort={refundSort} onChange={setRefundSort} align="right" />
                                        <SortableHeader label="Reason" sortKey="reason" sort={refundSort} onChange={setRefundSort} />
                                        <th className="r">Comments</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {paginatedRefunds.length > 0 ? (
                                        paginatedRefunds.map((r: any, i: number) => {
                                            const reasonMeta = parseReturnsReason(r.platformReason || r.reason);
                                            // Value stored is Ex-VAT, display Inc-VAT. Include freight here for total transaction value.
                                            const displayAmount = (Number(r.amount || 0) + Number(r.freightAmount || 0)) * VAT_MULTIPLIER;
                                            const displayComment = getRefundDisplayComment(r);
                                            
                                            // Determine Date to show based on basis
                                            const displayDateKey = getReturnDateKey(r, returnDateBasis, orderDateMap);
                                            const isFallbackDate = returnDateBasis === 'orderDate' && !displayDateKey && r.date;
                                            
                                            return (
                                                <tr key={`${r.id || 'ref'}-${i}`} className="">
                                                    <td className="font-mono opacity-80 whitespace-nowrap">
                                                        {displayDateKey ? new Date(displayDateKey).toLocaleDateString('en-GB') : (r.date ? new Date(r.date).toLocaleDateString('en-GB') : '-')}
                                                        {isFallbackDate && <span className="text-red-400 ml-1 text-[9px] font-bold" title="Order date unavailable, using refund date">*</span>}
                                                    </td>
                                                    <td className="font-mono font-medium text-theme whitespace-nowrap">
                                                        {r.orderId ? (
                                                            <span className="flex items-center gap-1">
                                                                {r.orderId}
                                                                <ExternalLink className="w-2.5 h-2.5 opacity-30" />
                                                            </span>
                                                        ) : '—'}
                                                    </td>
                                                    <td className="whitespace-nowrap">
                                                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded border border-gray-200 text-[10px] font-bold">
                                                            {r.platform || 'Unknown'}
                                                        </span>
                                                    </td>
                                                    <td className="r font-bold text-gray-900 whitespace-nowrap">{r.quantity}</td>
                                                    <td className="r font-bold text-red-600 whitespace-nowrap">{formatSmartMoney(displayAmount)}</td>
                                                    <td className="whitespace-normal min-w-[150px]">
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-gray-700">{reasonMeta.short}</span>
                                                            <span className="text-[10px] text-gray-400">{reasonMeta.full}</span>
                                                        </div>
                                                    </td>
                                                    <td className="r text-gray-400 italic whitespace-normal min-w-[200px] break-words" title={displayComment}>
                                                        {displayComment}
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={7} className="c p-10 text-gray-400 italic">No refund records found for this product.</td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        <TablePagination
                            currentPage={refundPage}
                            itemsPerPage={refundItemsPerPage}
                            totalCount={filteredRefundsLength}
                            totalPages={totalRefundPages}
                            setCurrentPage={setRefundPage}
                            setItemsPerPage={setRefundItemsPerPage}
                        />
                        </div>
                        
                        <div className="text-right text-[10px] text-gray-400 italic mt-2">
                        Refund amounts displayed VAT-inclusive. Source file stores EX-VAT.
                        </div>
                </div>
            ) : (
                    <div className="p-10 text-center text-gray-400 bg-gray-50 rounded-xl border border-gray-100">
                    No refund data available for this SKU.
                    </div>
            )}
        </div>
    );
};
