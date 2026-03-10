
import React from 'react';
import { User, Globe, BarChart3, X } from 'lucide-react';
import { SortState } from '../../../utils/tableSort';
import { SortableHeader } from '../../common/SortableHeader';
import { formatMoney, formatPct, formatNumber } from '../../../utils/format';
import { TAX_NOTE_SHORT } from '../../../services/taxPolicy';
import { PlatformSummary, PlatformSortKey } from '../platformManagement.types';
import { PricingRules } from '../../../types';
import { PlatformMetricCard } from '../parts/PlatformMetricCard';
import AuditPanel from '../../AuditPanel';
import { FilterBar } from '../../common/FilterBar';

interface PlatformOverviewTabProps {
    sortedSummaries: PlatformSummary[];
    selectedPlatformKey: string | null;
    setSelectedPlatformKey: (key: string | null) => void;
    pricingRules: PricingRules;
    themeColor: string;
    selectedSummary?: PlatformSummary;
    categoryBreakdown: { name: string; revenue: number }[];
    sort: SortState<PlatformSortKey>;
    setSort: (sort: SortState<PlatformSortKey>) => void;
    topPlatformKey: string | null;
    startKey?: string;
    endKey?: string;
    isAuditVisible: boolean;
}

export const PlatformOverviewTab: React.FC<PlatformOverviewTabProps> = ({
    sortedSummaries, selectedPlatformKey, setSelectedPlatformKey,
    pricingRules, themeColor, selectedSummary, categoryBreakdown,
    sort, setSort, topPlatformKey, startKey = '', endKey = '', isAuditVisible,
}) => {
    return (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {isAuditVisible && (
                <div className="animate-in fade-in slide-in-from-top-2 duration-300">
                    <AuditPanel title="Platform Overview Audit" startKey={startKey} endKey={endKey}
                        rows={sortedSummaries} getDateKey={() => null}
                        getRevenue={r => r.revenue} getQty={r => r.units}
                        getProfit={r => r.profit} getAdSpend={r => r.adSpend} />
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {sortedSummaries.map(summary => (
                    <PlatformMetricCard key={summary.platform} summary={summary}
                        isTop={summary.platform === topPlatformKey}
                        isSelected={selectedPlatformKey === summary.platform}
                        onSelect={() => setSelectedPlatformKey(summary.platform)}
                        rule={pricingRules[summary.platform]} themeColor={themeColor} />
                ))}
            </div>

            <div className="flex flex-col lg:flex-row gap-6 items-start">
                <div className={`sello-glass rounded-xl overflow-hidden transition-all duration-300 ${selectedPlatformKey ? 'lg:w-2/3' : 'w-full'}`}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--glass-divider)', background: 'var(--glass-head-bg)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h3 style={{ fontWeight: 700, fontSize: 14, color: '#1f2937', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <Globe style={{ width: 14, height: 14, color: '#4f46e5' }} />Performance Matrix
                        </h3>
                        <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.1em', background: 'rgba(255,255,255,0.5)', padding: '2px 8px', borderRadius: 4, border: '1px solid var(--glass-divider)' }}>{TAX_NOTE_SHORT}</span>
                    </div>
                    <div className="sello-table-scroll">
                        <table className="sello-table">
                            <thead>
                                <tr>
                                    <SortableHeader label="Platform" sortKey="name" sort={sort} onChange={setSort as any} />
                                    {!selectedPlatformKey && <SortableHeader label="Manager" sortKey="manager" sort={sort} onChange={setSort as any} />}
                                    <SortableHeader label="SKUs" sortKey="skus" sort={sort} onChange={setSort as any} align="right" />
                                    <SortableHeader label="Revenue" sortKey="revenue" sort={sort} onChange={setSort as any} tint="blue" align="right" />
                                    <SortableHeader label="Profit (Gross)" sortKey="profit" sort={sort} onChange={setSort as any} align="right" />
                                    <SortableHeader label="Net Profit" sortKey="netProfit" sort={sort} onChange={setSort as any} tint="green" align="right" />
                                    <SortableHeader label="Margin %" sortKey="margin" sort={sort} onChange={setSort as any} align="right" />
                                    <SortableHeader label="Units" sortKey="velocity" sort={sort} onChange={setSort as any} align="right" />
                                </tr>
                            </thead>
                            <tbody>
                                {sortedSummaries.map(summary => {
                                    const rule = pricingRules[summary.platform];
                                    const isSelected = selectedPlatformKey === summary.platform;
                                    const isCostBased = rule?.pricingControl === 'PLATFORM_COST_BASED';
                                    return (
                                        <tr key={summary.platform}
                                            style={{ background: isSelected ? 'var(--theme-10)' : undefined, cursor: 'pointer' }}
                                            onClick={() => setSelectedPlatformKey(isSelected ? null : summary.platform)}>
                                            <td>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                                    <div style={{ width: 28, height: 28, borderRadius: 6, background: rule?.color || '#6366f1', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff' }}>{summary.platform[0]}</div>
                                                    <span style={{ fontWeight: 700, fontSize: 12, color: '#111827' }}>{summary.platform}</span>
                                                </div>
                                            </td>
                                            {!selectedPlatformKey && (
                                                <td><div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6b7280' }}><User style={{ width: 12, height: 12 }} />{rule?.manager || 'Unassigned'}</div></td>
                                            )}
                                            <td className="r"><span className="v-num">{summary.skuCount}</span></td>
                                            <td className="r col-blue">
                                                <span className="v-num v-bold">{formatMoney(summary.revenue, 0)}</span>
                                                {isCostBased && <span style={{ display: 'block', fontSize: 8, color: '#94a3b8', textTransform: 'uppercase', marginTop: 1 }}>Cost Basis</span>}
                                            </td>
                                            <td className="r"><span className="v-num">{formatMoney(summary.profit, 0)}</span></td>
                                            <td className="r col-green"><span className="v-num v-bold">{formatMoney(summary.netProfit, 0)}</span></td>
                                            <td className="r">
                                                <span className={summary.marginPct >= 15 ? 'v-num v-bold' : summary.marginPct >= 0 ? 'v-num v-bold' : 'v-neg v-bold'}
                                                    style={{ color: summary.marginPct >= 15 ? '#059669' : summary.marginPct >= 0 ? '#d97706' : undefined }}>
                                                    {formatPct(summary.marginPct)}
                                                </span>
                                            </td>
                                            <td className="r"><span className="v-dim">{formatNumber(summary.units)}</span></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {selectedPlatformKey && selectedSummary && (
                    <div className="lg:w-1/3 space-y-6 animate-in slide-in-from-right duration-300">
                        <div className="sello-glass rounded-xl overflow-hidden">
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--glass-divider)', background: 'var(--glass-head-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ width: 22, height: 22, borderRadius: 4, background: pricingRules[selectedPlatformKey]?.color || themeColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 900, color: '#fff' }}>{selectedPlatformKey[0]}</div>
                                    <span style={{ fontWeight: 700, fontSize: 13, color: '#111827' }}>{selectedPlatformKey} Details</span>
                                </div>
                                <button onClick={() => setSelectedPlatformKey(null)} style={{ padding: 4, borderRadius: '50%', color: '#9ca3af', display: 'flex' }} className="hover:bg-gray-200 transition-colors"><X style={{ width: 14, height: 14 }} /></button>
                            </div>
                            <div style={{ padding: 20 }} className="space-y-5">
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>
                                            Revenue
                                            {pricingRules[selectedPlatformKey]?.pricingControl === 'PLATFORM_COST_BASED' && <span style={{ marginLeft: 4, fontSize: 8, background: '#f1f5f9', color: '#64748b', padding: '1px 4px', borderRadius: 2 }}>Cost Basis</span>}
                                        </span>
                                        <div style={{ fontSize: 20, fontWeight: 700, color: '#111827' }}>{formatMoney(selectedSummary.revenue, 0)}</div>
                                    </div>
                                    <div>
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Net Profit</span>
                                        <div style={{ fontSize: 20, fontWeight: 700, color: selectedSummary.netProfit >= 0 ? '#059669' : '#dc2626' }}>{formatMoney(selectedSummary.netProfit, 0)}</div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4" style={{ paddingTop: 16, borderTop: '1px solid var(--glass-divider)' }}>
                                    <div className="space-y-1">
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'block' }}>Performance</span>
                                        <div style={{ fontSize: 13, fontWeight: 900, color: selectedSummary.marginPct >= 15 ? '#059669' : '#d97706' }}><span style={{ color: '#9ca3af', fontWeight: 400, marginRight: 4 }}>Margin:</span>{formatPct(selectedSummary.marginPct)}</div>
                                        <div style={{ fontSize: 13, fontWeight: 900, color: '#374151' }}><span style={{ color: '#9ca3af', fontWeight: 400, marginRight: 4 }}>TACoS:</span>{formatPct(selectedSummary.tacosPct)}</div>
                                    </div>
                                    <div className="space-y-1 text-right">
                                        <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'block' }}>Scale</span>
                                        <div style={{ fontSize: 13, fontWeight: 900, color: '#374151' }}>{formatNumber(selectedSummary.orders)} <span style={{ color: '#9ca3af', fontWeight: 400 }}>Orders</span></div>
                                        <div style={{ fontSize: 13, fontWeight: 900, color: '#374151' }}>{formatNumber(selectedSummary.units)} <span style={{ color: '#9ca3af', fontWeight: 400 }}>Units</span></div>
                                    </div>
                                </div>
                                <div style={{ paddingTop: 16, borderTop: '1px solid var(--glass-divider)' }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', display: 'block', marginBottom: 2 }}>Gross Profit (Before Ads)</span>
                                    <div style={{ fontSize: 13, color: '#6b7280' }}>{formatMoney(selectedSummary.profit, 0)}</div>
                                </div>
                            </div>
                        </div>

                        <div className="sello-glass rounded-xl overflow-hidden">
                            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--glass-divider)', background: 'var(--glass-head-bg)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <h3 style={{ fontWeight: 700, fontSize: 13, color: '#111827', display: 'flex', alignItems: 'center', gap: 6 }}><BarChart3 style={{ width: 14, height: 14, color: '#4f46e5' }} />Top Categories</h3>
                                <span style={{ fontSize: 9, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase' }}>by Revenue</span>
                            </div>
                            <div style={{ padding: 20 }}>
                                {categoryBreakdown.length > 0 ? (
                                    <div className="space-y-4">
                                        {categoryBreakdown.map((cat: any, i: number) => (
                                            <div key={cat.name} className="space-y-1">
                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 11 }}>
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                                        <span style={{ width: 14, height: 14, borderRadius: 4, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, fontWeight: 900, color: '#9ca3af' }}>{i + 1}</span>
                                                        <span style={{ fontWeight: 600, color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{cat.name}</span>
                                                    </div>
                                                    <span style={{ fontWeight: 700, color: '#111827' }}>{formatMoney(cat.revenue, 0)}</span>
                                                </div>
                                                <div style={{ width: '100%', height: 4, background: '#f3f4f6', borderRadius: 2, overflow: 'hidden' }}>
                                                    <div style={{ height: '100%', background: '#4f46e5', borderRadius: 2, transition: 'width 1s ease-out', width: `${(cat.revenue / categoryBreakdown[0].revenue) * 100}%` }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div style={{ padding: '24px 0', textAlign: 'center', fontSize: 12, color: '#9ca3af', fontStyle: 'italic' }}>No breakdown available.</div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
