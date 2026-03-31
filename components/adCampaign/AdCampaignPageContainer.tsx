import React, { useState, useMemo, useCallback } from 'react';
import {
    Upload, ArrowUp, ArrowDown, Minus, BarChart2, Users, Plus, X,
    MessageSquare, Download, TrendingUp, AlertTriangle, CheckCircle2,
    DollarSign, Target, Gauge, BarChart3, ClipboardList, Percent,
    CalendarDays, Table2, ChevronUp, ChevronDown, StickyNote,
} from 'lucide-react';
import {
    AdSnapshot, AdGroupSnapshot, AdCampaign,
    AdSkuWeeklySummary, AdSkuFlag, AdRosterChange, AdCandidate,
} from '../../types';
import {
    generateCampaignSummary, getCampaignSummaryData, getBudgetRecommendation,
    findAdCandidates, weekLabel, diagnoseSkuFunnel,
    FUNNEL_DIAGNOSIS_LABELS, exportCampaignMasterXlsx,
} from '../../services/adCampaignService';
import { Product, PriceLog } from '../../types';
import { MetricCard } from '../common/MetricCard';
import { SelectFilter } from '../common/SelectFilter';
import { SortableHeader } from '../common/SortableHeader';
import { SortState, toggleSort } from '../../utils/tableSort';

// ─────────────────────────────────────────────────────────────
//  PROPS
// ─────────────────────────────────────────────────────────────

interface AdCampaignPageProps {
    products: Product[];
    salesHistory: PriceLog[];
    learnedAliases: Record<string, string>;
    adSnapshots: AdSnapshot[];
    adRosterChanges: AdRosterChange[];
    adBudgets: Record<string, number>;
    onImport: (snapshot: AdSnapshot, budgets: Record<string, number>) => void;
    onRosterChange: (change: AdRosterChange) => void;
}

// ─────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────

const fmt = (n: number, dp = 2) => n.toFixed(dp);
const fmtGBP = (n: number) => `£${n.toFixed(2)}`;
const fmtPct = (n: number) => `${(n * 100).toFixed(1)}%`;
const roasColor = (r: number) => r >= 3 ? 'text-emerald-600' : r >= 1.5 ? 'text-amber-600' : 'text-red-600';
const utilColor = (u: number) => u > 1.0 ? 'text-red-600' : u > 0.95 ? 'text-amber-600' : u >= 0.65 ? 'text-emerald-600' : 'text-red-600';

type SkuSortKey = 'impressions' | 'clicks' | 'ctr' | 'spend' | 'spendShare' |
    'sales' | 'directSales' | 'roas' | 'directRoas' | 'poas' | 'orders';

const FLAG_META: Record<AdSkuFlag, { label: string; color: string }> = {
    ZERO_SALES:                { label: 'Zero Sales',      color: 'badge-red' },
    MONITORING:                { label: 'Monitoring',      color: 'badge-blue' },
    DOWNTREND:                 { label: 'Downtrend',       color: 'badge-amber' },
    BUDGET_HOG_LOW_ROAS:       { label: 'Hog ↓ROAS',      color: 'badge-red' },
    BUDGET_HOG_HIGH_ROAS:      { label: 'Hog ↑ROAS',      color: 'badge-green' },
    GRADE_CHANGED:             { label: 'Grade Changed',   color: 'badge-orange' },
    LOW_STOCK:                 { label: 'Low Stock',       color: 'badge-amber' },
    HIGH_PERFORMER:            { label: 'Top Performer',   color: 'badge-green' },
    LOW_CTR:                   { label: 'Low CTR',         color: 'badge-amber' },
    HIGH_CLICKS_NO_CONVERSION: { label: 'Clicks→No Sale', color: 'badge-orange' },
    HALO_ONLY:                 { label: 'Halo Only',       color: 'badge-blue' },
};

const REMOVE_REASONS = [
    'No Sales',
    'Low ROAS',
    'Grade Level Changed',
    'Low Stock / Out of Stock',
    'Budget Hog — Low Return',
    'Seasonal — End of Season',
    'Downtrend — Declining Sales',
    'Listing Quality Issue — Low CTR',
];

// ─────────────────────────────────────────────────────────────
//  SMALL SHARED UI
// ─────────────────────────────────────────────────────────────

const KpiInline = ({ label, value, color }: { label: string; value: string; color?: string }) => (
    <div>
        <div className="text-[9px] text-gray-600 uppercase font-bold tracking-wide">{label}</div>
        <div className={`text-sm font-bold ${color || 'text-gray-900'}`}>{value}</div>
    </div>
);

function BudgetBadge({ action }: { action: 'INCREASE' | 'DECREASE' | 'MAINTAIN' }) {
    const cfg = {
        INCREASE: { cls: 'badge-green', icon: <ArrowUp className="w-2.5 h-2.5" />,  label: 'Increase' },
        DECREASE: { cls: 'badge-red',   icon: <ArrowDown className="w-2.5 h-2.5" />, label: 'Decrease' },
        MAINTAIN: { cls: 'badge-gray',  icon: <Minus className="w-2.5 h-2.5" />,     label: 'Maintain' },
    }[action];
    return <span className={`sello-badge ${cfg.cls} flex items-center gap-1`}>{cfg.icon}{cfg.label}</span>;
}

function GradeBadge({ grade }: { grade: number }) {
    const cls = grade <= 2 ? 'g12' : grade === 3 ? 'g3' : grade <= 5 ? 'g4' : 'g5';
    return <span className={`gb ${cls}`}>G{grade}</span>;
}


// ─────────────────────────────────────────────────────────────
//  FOLDER TABS — browser-style, visually distinct from page tabs
// ─────────────────────────────────────────────────────────────

interface FolderTab {
    key: string;
    label: string;
    badge?: string | number;
}

function FolderTabs({ tabs, active, onChange }: {
    tabs: FolderTab[]; active: string; onChange: (k: string) => void;
}) {
    return (
        <div className="flex items-end gap-0.5 px-4 pt-3">
            {tabs.map(tab => {
                const isActive = tab.key === active;
                return (
                    <button
                        key={tab.key}
                        onClick={() => onChange(tab.key)}
                        className={`
                            relative px-4 py-2 text-xs font-semibold rounded-t-lg transition-all
                            flex items-center gap-1.5 whitespace-nowrap
                            ${isActive
                                ? 'bg-white/90 text-gray-900 shadow-sm z-10 border border-b-0 border-gray-200/80 -mb-px pb-[9px]'
                                : 'bg-gray-100/70 text-gray-500 hover:bg-gray-200/60 hover:text-gray-700 border border-transparent mb-0'
                            }
                        `}
                        style={isActive ? { backdropFilter: 'blur(8px)' } : {}}
                    >
                        {tab.label}
                        {tab.badge !== undefined && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full
                                ${isActive ? 'text-white' : 'bg-gray-200 text-gray-500'}`}
                style={isActive ? { background: 'var(--theme)' } : {}}>
                                {tab.badge}
                            </span>
                        )}
                    </button>
                );
            })}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  SUMMARY TAB — weekly comparison table (Excel master style)
// ─────────────────────────────────────────────────────────────

function SummaryTab({ campaign, platformSnapshots, prevCampaign, notes, onNotesChange, campaignNotes, setCampaignNotes, salesHistory, snapshot, budgets }: {
    campaign: AdCampaign;
    platformSnapshots: AdSnapshot[];
    prevCampaign: AdCampaign | null;
    notes: string;
    onNotesChange: (v: string) => void;
    campaignNotes: Record<string, string>;
    setCampaignNotes: React.Dispatch<React.SetStateAction<Record<string, string>>>;
    salesHistory: import('../../types').PriceLog[];
    snapshot: AdSnapshot;
    budgets: Record<string, number>;
}) {
    // Show up to last 6 weeks, newest first for header but oldest→newest for Δ calc
    const weeks = platformSnapshots.slice(0, 6).reverse(); // oldest → newest
    const weeksDesc = [...weeks].reverse(); // newest first for display

    // Get all ad group names across all weeks
    const allGroupNames = [...new Set(
        platformSnapshots.flatMap(s =>
            s.campaigns.find(c => c.name === campaign.name)?.adGroups.map(g => g.name) ?? []
        )
    )];

    // Helper: find group data for a given snapshot
    const groupData = (snap: AdSnapshot, groupName: string) =>
        snap.campaigns.find(c => c.name === campaign.name)?.adGroups.find(g => g.name === groupName) ?? null;

    // Totals for a snapshot
    const snapTotals = (snap: AdSnapshot) => {
        const groups = snap.campaigns.find(c => c.name === campaign.name)?.adGroups ?? [];
        const spend = groups.reduce((s, g) => s + g.spend, 0);
        const sales = groups.reduce((s, g) => s + g.sales, 0);
        return { spend, sales, roas: spend > 0 ? sales / spend : 0 };
    };

    const delta = (curr: number, prev: number) => {
        if (!prev) return null;
        return (curr - prev) / prev;
    };

    const DeltaCell = ({ curr, prev, isRoas = false }: { curr: number; prev: number | null; isRoas?: boolean }) => {
        if (prev === null) return <span className="v-dim">—</span>;
        const d = delta(curr, prev);
        if (d === null) return <span className="v-dim">—</span>;
        const pct = `${d >= 0 ? '+' : ''}${(d * 100).toFixed(0)}%`;
        const cls = isRoas
            ? d >= 0 ? 'text-emerald-600' : 'text-red-500'
            : d >= 0.05 ? 'text-emerald-600' : d <= -0.05 ? 'text-red-500' : 'text-gray-500';
        return (
            <span className={`text-[10px] font-bold ${cls}`}>
                {d >= 0.05 ? '▲' : d <= -0.05 ? '▼' : ''}{pct}
            </span>
        );
    };

    return (
        <div className="p-4 space-y-5">
            {/* Campaign summary — structured card */}
            {(() => {
                const data = getCampaignSummaryData(campaign, prevCampaign);
                const [noteOpen, setNoteOpen] = React.useState(false);
                return (
                    <div className="bg-custom-glass rounded-xl border border-custom-glass overflow-hidden">
                        {/* Top row: name + headline metrics */}
                        <div className="flex items-center gap-4 px-4 py-3 border-b border-gray-100/50 flex-wrap">
                            <div className="flex items-center gap-2">
                                <span className="font-bold text-sm text-gray-900">{campaign.name}</span>
                                <span className="text-[10px] text-gray-400">{campaign.account}</span>
                            </div>
                            <div className="ml-auto flex items-center gap-5 text-xs">
                                <span className="text-gray-500">Spend <span className="font-bold text-gray-900">{fmtGBP(data.headline.spend)}</span></span>
                                <span className="text-gray-500">Ad Sales <span className="font-bold text-gray-900">{fmtGBP(data.headline.sales)}</span></span>
                                {(() => {
                                    const totalSales = salesHistory
                                        .filter(l =>
                                            l.date >= snapshot.weekStartDate &&
                                            l.date <= snapshot.weekEndDate &&
                                            (!l.platform || l.platform === snapshot.platform)
                                        )
                                        .reduce((s, l) => s + ((l.price || 0) * (l.velocity || 0)), 0);
                                    if (totalSales <= 0) return null;
                                    const adPct = (data.headline.sales / totalSales * 100).toFixed(1);
                                    return (
                                        <span className="text-gray-500">Total Sales <span className="font-bold text-gray-900">{fmtGBP(totalSales)}</span>
                                            <span className="text-[10px] text-gray-400 ml-1">({adPct}% ad-driven)</span>
                                        </span>
                                    );
                                })()}
                                <span className="text-gray-500">ROAS <span className={`font-bold ${roasColor(data.headline.roas)}`}>{fmt(data.headline.roas)}</span></span>
                                <span className="text-gray-500">Direct <span className={`font-bold ${roasColor(data.headline.directRoas)}`}>{fmt(data.headline.directRoas)}</span></span>
                            </div>
                        </div>
                        {/* Bottom row: status badges */}
                        <div className="flex items-center gap-2 px-4 py-2.5 flex-wrap">
                            <span className={`sello-badge ${data.spendRatio.isOk ? 'badge-green' : 'badge-red'}`}>
                                Ad Spend / Sales: {(data.spendRatio.value * 100).toFixed(1)}%{data.spendRatio.isOk ? ' — within target' : ' — above 5% target'}
                            </span>
                            {data.trend && data.trend.direction !== 'flat' && (
                                <span className={`sello-badge ${data.trend.direction === 'up' ? 'badge-green' : 'badge-red'}`}>
                                    {data.trend.direction === 'up' ? '↑' : '↓'} Ad Sales {data.trend.direction === 'up' ? '+' : ''}{data.trend.pct.toFixed(0)}% vs last week
                                </span>
                            )}
                            {data.bestGroup && (
                                <span className="sello-badge badge-green">Best ROAS: {data.bestGroup.name} · {fmt(data.bestGroup.roas)}×</span>
                            )}
                            {data.worstGroup && (
                                <span className={`sello-badge ${data.worstGroup.roas < 1 ? 'badge-red' : 'badge-amber'}`}>
                                    Lowest ROAS: {data.worstGroup.name} · {fmt(data.worstGroup.roas)}×
                                </span>
                            )}
                            <button onClick={() => setNoteOpen(v => !v)}
                                className="ml-auto flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors">
                                <StickyNote className="w-3 h-3" />
                                {campaignNotes[campaign.name] ? 'Edit note' : 'Add note'}
                            </button>
                        </div>
                        {/* Notes field — shown inline when open */}
                        {noteOpen && (
                            <div className="px-4 pb-3 border-t border-gray-100/50 pt-2">
                                <NotesField value={campaignNotes[campaign.name] ?? ''}
                                    onChange={v => setCampaignNotes(prev => ({ ...prev, [campaign.name]: v }))}
                                    placeholder="Campaign-level notes — external factors, algorithm changes..." />
                            </div>
                        )}
                    </div>
                );
            })()}

            {/* Weekly comparison table */}
            <div className="sello-table-wrap">
                <div className="px-4 py-2 border-b border-custom-glass flex items-center gap-2">
                    <Table2 className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs font-bold text-gray-600">Weekly Comparison</span>
                    <span className="text-xs text-gray-400">Ad group performance across weeks</span>
                </div>
                <div className="sello-table-scroll">
                    <table className="sello-table">
                        <thead>
                            {/* Week header row */}
                            <tr>
                                <th className="pin" style={{ minWidth: 180, background: 'rgba(255,255,255,0.97)' }}>Ad Group</th>
                                {weeksDesc.map((snap, i) => {
                                    const prevSnap = weeksDesc[i + 1] ?? null;
                                    return (
                                        <th key={snap.id} colSpan={prevSnap ? 6 : 5} className="c cb"
                                            style={{ borderLeft: '2px solid rgba(219,234,254,0.5)' }}>
                                            {snap.weekStartDate} → {snap.weekEndDate}
                                        </th>
                                    );
                                })}
                            </tr>
                            {/* Metric sub-header */}
                            <tr>
                                <th className="pin" style={{ background: 'rgba(255,255,255,0.97)' }}></th>
                                {weeksDesc.map((snap, i) => {
                                    const hasPrev = !!weeksDesc[i + 1];
                                    return (
                                        <React.Fragment key={snap.id}>
                                            <th className="r" style={{ borderLeft: '2px solid rgba(219,234,254,0.5)' }}>Budget/d</th>
                                            <th className="r cb">Spend</th>
                                            <th className="r">Util</th>
                                            <th className="r cb">Sales</th>
                                            <th className="r cg">ROAS</th>
                                            {hasPrev && <th className="c">Δ Sales</th>}
                                        </React.Fragment>
                                    );
                                })}
                            </tr>
                        </thead>
                        <tbody>
                            {/* Campaign totals row */}
                            <tr style={{ background: 'rgba(79,70,229,0.04)' }}>
                                <td className="pin" style={{ fontWeight: 800, color: '#111827', fontSize: 12, background: 'rgba(255,255,255,0.97)' }}>
                                    {campaign.name} <span style={{ fontWeight: 400, color: '#9ca3af', fontSize: 10 }}>(total)</span>
                                </td>
                                {weeksDesc.map((snap, i) => {
                                    const t = snapTotals(snap);
                                    const prevSnap = weeksDesc[i + 1] ?? null;
                                    const pt = prevSnap ? snapTotals(prevSnap) : null;
                                    const hasPrev = !!prevSnap;
                                    return (
                                        <React.Fragment key={snap.id}>
                                            <td className="r" style={{ borderLeft: '2px solid rgba(219,234,254,0.5)' }}>
                                                <span className="v-dim">—</span>
                                            </td>
                                            <td className="r cb"><span className="v-num">{fmtGBP(t.spend)}</span></td>
                                            <td className="r"><span className="v-dim">—</span></td>
                                            <td className="r cb"><span className="v-num" style={{ fontWeight: 800 }}>{fmtGBP(t.sales)}</span></td>
                                            <td className="r cg"><span className={`v-num ${roasColor(t.roas)}`} style={{ fontWeight: 800 }}>{t.roas.toFixed(2)}</span></td>
                                            {hasPrev && <td className="c"><DeltaCell curr={t.sales} prev={pt?.sales ?? null} /></td>}
                                        </React.Fragment>
                                    );
                                })}
                            </tr>

                            {/* Per ad group rows */}
                            {allGroupNames.map(groupName => {
                                const firstSnap = weeksDesc.find(s => groupData(s, groupName));
                                if (!firstSnap) return null;
                                // Current week group — check if inactive (zero spend or flagged inactive)
                                const currentGroup = groupData(weeksDesc[0], groupName);
                                const isInactive = currentGroup
                                    ? ((currentGroup as any).inactive === true || (currentGroup.spend === 0 && currentGroup.impressions === 0))
                                    : true;
                                return (
                                    <tr key={groupName} style={isInactive ? { opacity: 0.4 } : {}}>
                                        <td className="pin" style={{ background: 'rgba(255,255,255,0.97)' }}>
                                            <span className="v-num" style={{ paddingLeft: 12 }}>
                                                {groupName}
                                                {isInactive && <span className="text-[9px] text-gray-400 ml-1 font-normal italic">(inactive)</span>}
                                            </span>
                                        </td>
                                        {weeksDesc.map((snap, i) => {
                                            const g = groupData(snap, groupName);
                                            const prevSnap = weeksDesc[i + 1] ?? null;
                                            const pg = prevSnap ? groupData(prevSnap, groupName) : null;
                                            const hasPrev = !!prevSnap;
                                            if (!g) return (
                                                <React.Fragment key={snap.id}>
                                                    <td className="r" style={{ borderLeft: '2px solid rgba(219,234,254,0.5)' }}><span className="v-dim">—</span></td>
                                                    <td className="r cb"><span className="v-dim">—</span></td>
                                                    <td className="r"><span className="v-dim">—</span></td>
                                                    <td className="r cb"><span className="v-dim">—</span></td>
                                                    <td className="r cg"><span className="v-dim">—</span></td>
                                                    {hasPrev && <td className="c"><span className="v-dim">—</span></td>}
                                                </React.Fragment>
                                            );
                                            return (
                                                <React.Fragment key={snap.id}>
                                                    <td className="r" style={{ borderLeft: '2px solid rgba(219,234,254,0.5)' }}>
                                                        <span className="v-num">{fmtGBP(g.dailyBudget)}</span>
                                                    </td>
                                                    <td className="r cb"><span className="v-num">{fmtGBP(g.spend)}</span></td>
                                                    <td className="r">
                                                        {(() => {
                                                                const budget = budgets[`${snap.weekStartDate}::${g.name}`] ?? g.dailyBudget;
                                                                const days = (() => { const s = new Date(snap.weekStartDate); const e = new Date(snap.weekEndDate); return Math.max(1, Math.round((e.getTime()-s.getTime())/86400000)+1); })();
                                                                const util = budget > 0 ? g.spend / (budget * days) : 0;
                                                                return <span className={`v-num ${utilColor(util)}`}>{fmtPct(util)}</span>;
                                                            })()}
                                                    </td>
                                                    <td className="r cb"><span className="v-num">{fmtGBP(g.sales)}</span></td>
                                                    <td className="r cg">
                                                        <span className={`v-num ${roasColor(g.roasOptIn)}`}>{g.roasOptIn.toFixed(2)}</span>
                                                    </td>
                                                    {hasPrev && (
                                                        <td className="c">
                                                            <DeltaCell curr={g.sales} prev={pg?.sales ?? null} />
                                                        </td>
                                                    )}
                                                </React.Fragment>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="sello-table-footer">
                    <span>{weeksDesc.length} weeks · {allGroupNames.length} ad groups</span>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  NOTES FIELD
// ─────────────────────────────────────────────────────────────

function NotesField({ value, onChange, placeholder }: {
    value: string; onChange: (v: string) => void; placeholder?: string;
}) {
    const [editing, setEditing] = useState(false);
    const [draft, setDraft] = useState(value);
    if (!editing && !value) return (
        <button onClick={() => setEditing(true)}
            className="flex items-center gap-1 text-[10px] text-gray-400 hover:text-gray-600 transition-colors mt-1">
            <MessageSquare className="w-3 h-3" /> Add note
        </button>
    );
    if (!editing) return (
        <div onClick={() => { setDraft(value); setEditing(true); }}
            className="flex items-start gap-1.5 cursor-pointer group mt-1">
            <MessageSquare className="w-3 h-3 text-gray-400 mt-0.5 shrink-0" />
            <p className="text-[10px] text-gray-500 italic leading-relaxed group-hover:text-gray-700">{value}</p>
        </div>
    );
    return (
        <div className="space-y-1 mt-1">
            <textarea autoFocus value={draft} onChange={e => setDraft(e.target.value)}
                placeholder={placeholder ?? 'Add a note...'}
                className="w-full text-xs border border-indigo-200 rounded-lg p-2 h-14 resize-none focus:outline-none focus:ring-1 focus:ring-indigo-300 bg-white/80" />
            <div className="flex gap-1.5">
                <button onClick={() => { onChange(draft); setEditing(false); }}
                    className="px-3 py-1 text-[10px] font-bold text-white rounded-md hover:opacity-90" style={{ background: 'var(--theme)' }}>Save</button>
                <button onClick={() => { setDraft(value); setEditing(false); }}
                    className="px-3 py-1 text-[10px] font-bold text-gray-500 bg-gray-100 rounded-md hover:bg-gray-200">Cancel</button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  REMOVE SKU MODAL
// ─────────────────────────────────────────────────────────────

function RemoveSkuModal({ sku, onConfirm, onClose }: {
    sku: string; onConfirm: (reason: string) => void; onClose: () => void;
}) {
    const [reason, setReason] = useState('');
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl p-6 w-96 border border-gray-100 space-y-4" onClick={e => e.stopPropagation()}>
                <div>
                    <h4 className="font-bold text-gray-900">Remove SKU from Ad Group</h4>
                    <p className="text-xs text-gray-500 mt-0.5">SKU: <span className="font-mono font-bold text-gray-800">{sku}</span></p>
                </div>
                <div className="flex flex-wrap gap-2">
                    {REMOVE_REASONS.map(r => (
                        <button key={r} onClick={() => setReason(r)}
                            className={`text-[10px] px-2.5 py-1 rounded-lg border transition-all font-medium
                                ${reason === r ? 'text-white border-transparent' : 'border-gray-200 text-gray-600'}`}
                                style={reason === r ? { background: 'var(--theme)' } : {}}>
                            {r}
                        </button>
                    ))}
                </div>
                <textarea value={reason} onChange={e => setReason(e.target.value)}
                    placeholder="Or type a custom reason..."
                    className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 h-14 resize-none" />
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                    <button onClick={() => { if (reason.trim()) { onConfirm(reason); onClose(); } }}
                        disabled={!reason.trim()}
                        className="flex-1 py-2 text-xs font-bold text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-40">
                        Log Removal
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  ADD CANDIDATE MODAL
// ─────────────────────────────────────────────────────────────

function AddCandidateModal({ candidate, adGroups, platform, weekOf, onConfirm, onClose }: {
    candidate: AdCandidate; adGroups: string[]; platform: string; weekOf: string;
    onConfirm: (c: AdRosterChange) => void; onClose: () => void;
}) {
    const [selectedGroup, setSelectedGroup] = useState(adGroups[0] ?? '');
    const [reason, setReason] = useState(candidate.reasons[0] ?? '');
    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/20 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white rounded-xl shadow-2xl p-6 w-96 border border-gray-100 space-y-4" onClick={e => e.stopPropagation()}>
                <div>
                    <h4 className="font-bold text-gray-900">Add SKU to Ad Group</h4>
                    <p className="text-xs font-mono font-bold text-gray-800">{candidate.sku}</p>
                    {candidate.productName && <p className="text-xs text-gray-400">{candidate.productName}</p>}
                </div>
                <div className="bg-gray-50 rounded-lg p-3 space-y-1">
                    {candidate.reasons.map((r, i) => (
                        <div key={i} className="flex items-center gap-1.5 text-xs text-gray-600">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500 shrink-0" />{r}
                        </div>
                    ))}
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">Ad Group</label>
                    <select value={selectedGroup} onChange={e => setSelectedGroup(e.target.value)}
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2">
                        {adGroups.map(g => <option key={g}>{g}</option>)}
                    </select>
                </div>
                <div>
                    <label className="text-xs font-bold text-gray-600 block mb-1">Reason</label>
                    <textarea value={reason} onChange={e => setReason(e.target.value)}
                        placeholder="e.g. Top seller, good stock, Grade 4-7..."
                        className="w-full text-xs border border-gray-200 rounded-lg px-3 py-2 h-14 resize-none" />
                </div>
                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">Cancel</button>
                    <button onClick={() => {
                        if (!selectedGroup) return;
                        onConfirm({
                            id: `rc-${Date.now()}`, date: new Date().toISOString().split('T')[0],
                            weekOf, platform, campaign: '', adGroup: selectedGroup,
                            sku: candidate.sku, action: 'ADD',
                            reason: reason || candidate.reasons.join(', '),
                        });
                        onClose();
                    }} disabled={!selectedGroup}
                        className="flex-1 py-2 text-xs font-bold text-white rounded-lg hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-1.5" style={{ background: 'var(--theme)' }}>
                        <Plus className="w-3.5 h-3.5" /> Log Addition
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  AD GROUP HEADER
// ─────────────────────────────────────────────────────────────

function AdGroupHeader({ group, prevGroup, notes, onNotesChange, budget: savedBudget, onBudgetChange }: {
    group: AdGroupSnapshot; prevGroup: AdGroupSnapshot | null;
    notes: string; onNotesChange: (v: string) => void;
    budget: number; onBudgetChange: (v: number) => void;
}) {
    const budget = getBudgetRecommendation(group, prevGroup);
    const wow = prevGroup && prevGroup.sales > 0
        ? (group.sales - prevGroup.sales) / prevGroup.sales : null;

    return (
        <div className="bg-custom-glass rounded-xl border border-custom-glass px-4 py-3 space-y-2">
            {/* Title row */}
            <div className="flex items-start justify-between gap-4">
                {/* Left: name + meta */}
                <div className="flex items-center gap-3 shrink-0">
                    <span className="font-bold text-gray-900">{group.name}</span>
                    <span className="text-xs text-gray-400">
                        <span className="inline-flex items-center gap-1">
                            £<input
                                type="number"
                                min="0"
                                step="0.01"
                                value={savedBudget || group.dailyBudget}
                                onChange={e => onBudgetChange(parseFloat(e.target.value) || 0)}
                                className="w-16 border-0 border-b border-gray-300 bg-transparent text-xs font-medium text-gray-700 focus:outline-none focus:border-theme text-center"
                                title="Edit daily budget"
                            />/day
                        </span>
                        {' · '}{group.bidStrategy} bid
                        {group.memberSkus.length > 0 && ` · ${group.memberSkus.length} SKUs`}
                    </span>
                    {wow !== null && (
                        <span className={`text-[10px] font-bold ${wow > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                            {wow > 0 ? '▲' : '▼'}{Math.abs(wow * 100).toFixed(0)}% WoW
                        </span>
                    )}
                </div>
                {/* Centre: summary text — takes all remaining space */}
                {group.weeklySummary && (
                    <p className="text-[11px] text-gray-500 leading-relaxed flex-1 min-w-0">
                        {group.weeklySummary}
                    </p>
                )}
                {/* Right: budget badge */}
                <div className="flex items-center gap-2 shrink-0">
                    <BudgetBadge action={budget.action} />
                </div>
            </div>
            {/* Notes */}
            <NotesField value={notes} onChange={onNotesChange}
                placeholder="Note external factors, observations, or actions taken..." />
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  SKU TABLE
// ─────────────────────────────────────────────────────────────

function SkuTable({ group, snapshot, prevSnapshot, products, salesHistory, adRosterChanges, onRemove }: {
    group: AdGroupSnapshot; snapshot: AdSnapshot; prevSnapshot: AdSnapshot | null; products: Product[];
    salesHistory: import('../../types').PriceLog[];
    adRosterChanges: import('../../types').AdRosterChange[];
    onRemove: (sku: string, reason: string) => void;
}) {
    const [sort, setSort] = useState<SortState<SkuSortKey>>({ key: 'spend', dir: 'desc' });
    const [removeTarget, setRemoveTarget] = useState<string | null>(null);

    // Prev week metrics per SKU from prevSnapshot
    const prevSkuMap = useMemo(() => {
        const map = new Map<string, { spend: number; sales: number; roas: number; orders: number; poas: number }>();
        if (!prevSnapshot) return map;
        const rows = prevSnapshot.dailySkuData.filter(r => r.adGroup === group.name);
        const skuMap = new Map<string, typeof rows>();
        rows.forEach(r => {
            const key = r.mappedSku || r.offerSku;
            if (!skuMap.has(key)) skuMap.set(key, []);
            skuMap.get(key)!.push(r);
        });
        skuMap.forEach((skuRows, sku) => {
            const spend = skuRows.reduce((s, r) => s + r.spend, 0);
            const sales = skuRows.reduce((s, r) => s + r.sales, 0);
            const orders = skuRows.reduce((s, r) => s + r.orders, 0);
            const mapped = (skuRows[0]?.mappedSku || sku).toUpperCase();
            const profit = salesHistory
                .filter(l => {
                    const lSku = (l.sku || '').toUpperCase();
                    const inRange = l.date >= prevSnapshot.weekStartDate && l.date <= prevSnapshot.weekEndDate;
                    const matchPlatform = !l.platform || l.platform === prevSnapshot.platform;
                    return (lSku === sku.toUpperCase() || lSku === mapped) && inRange && matchPlatform;
                })
                .reduce((s, l) => s + (l.profit || 0), 0);
            map.set(sku, { spend, sales, roas: spend > 0 ? sales / spend : 0, orders, poas: spend > 0 ? profit / spend : 0 });
        });
        return map;
    }, [prevSnapshot, group, salesHistory]);

    // SKUs removed from this group per roster log
    const removedSkus = useMemo(() => {
        const removed = new Set<string>();
        adRosterChanges
            .filter(r => r.adGroup === group.name && r.platform === snapshot.platform && r.action === 'REMOVE')
            .forEach(r => removed.add(r.sku.toUpperCase()));
        return removed;
    }, [adRosterChanges, group, snapshot]);

    const summaries = useMemo(() => {
        const rows = snapshot.dailySkuData.filter(r => r.adGroup === group.name);
        const skuMap = new Map<string, typeof rows>();
        rows.forEach(r => {
            const key = r.mappedSku || r.offerSku;
            if (!skuMap.has(key)) skuMap.set(key, []);
            skuMap.get(key)!.push(r);
        });
        const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
        const totalImpr = rows.reduce((s, r) => s + r.impressions, 0);
        const totalClicks = rows.reduce((s, r) => s + r.clicks, 0);
        const totalConv = rows.reduce((s, r) => s + r.conversions, 0);
        const groupAvgCtr = totalImpr > 0 ? totalClicks / totalImpr : 0;
        const groupAvgConvRate = totalClicks > 0 ? totalConv / totalClicks : 0;

        const result: (AdSkuWeeklySummary & { groupAvgCtr: number; groupAvgConvRate: number })[] = [];
        for (const [sku, skuRows] of skuMap.entries()) {
            const impressions = skuRows.reduce((s, r) => s + r.impressions, 0);
            const clicks = skuRows.reduce((s, r) => s + r.clicks, 0);
            const spend = skuRows.reduce((s, r) => s + r.spend, 0);
            const sales = skuRows.reduce((s, r) => s + r.sales, 0);
            const orders = skuRows.reduce((s, r) => s + r.orders, 0);
            const conversions = skuRows.reduce((s, r) => s + r.conversions, 0);
            const directSales = skuRows.reduce((s, r) => s + r.directSales, 0);
            const directOrders = skuRows.reduce((s, r) => s + r.directOrders, 0);
            const directConversions = skuRows.reduce((s, r) => s + r.directConversions, 0);
            const product = products.find(p => p.sku === sku);
            const roas = spend > 0 ? sales / spend : 0;
            const ctr = impressions > 0 ? clicks / impressions : 0;
            // POAS: sum profit from salesHistory for this SKU within the snapshot week
            const mapped = (skuRows[0]?.mappedSku || sku).toUpperCase();
            const skuProfit = salesHistory
                .filter(l => {
                    const lSku = (l.sku || '').toUpperCase();
                    const inDateRange = l.date >= snapshot.weekStartDate && l.date <= snapshot.weekEndDate;
                    const matchesPlatform = !l.platform || l.platform === snapshot.platform;
                    return (lSku === sku.toUpperCase() || lSku === mapped) && inDateRange && matchesPlatform;
                })
                .reduce((s, l) => s + (l.profit || 0), 0);
            const poas = spend > 0 ? skuProfit / spend : 0;
            result.push({
                sku, offerSku: skuRows[0]?.offerSku ?? sku,
                adGroup: group.name, campaign: skuRows[0]?.campaign ?? '',
                productName: skuRows[0]?.productName ?? product?.name ?? sku,
                brand: skuRows[0]?.brand ?? product?.brand ?? '',
                category: skuRows[0]?.productCategory ?? product?.category ?? '',
                impressions, clicks, spend, sales, orders, conversions, roas, ctr,
                cpc: clicks > 0 ? spend / clicks : 0,
                spendShare: totalSpend > 0 ? spend / totalSpend : 0,
                directSales, directOrders, directConversions,
                directRoas: spend > 0 ? directSales / spend : 0,
                haloSales: sales - directSales, poas,
                gradeLevel: product?.gradeLevel ?? 0,
                stockQty: product?.stockLevel ?? 0,
                runway: (product?.daysRemaining ?? 0) / 7,
                isLowStock: false,
                prevWeekSales: 0, prevWeekSpend: 0, prevWeekOrders: 0,
                salesTrend: 'no-data', salesDelta: '', ordersDelta: '',
                ctrVsGroupAvg: groupAvgCtr > 0 ? ctr / groupAvgCtr : 1,
                weeksInGroup: 1, flags: [],
                groupAvgCtr, groupAvgConvRate,
            });
        }
        return result;
    }, [snapshot, group, products, salesHistory]);

    const sorted = useMemo(() => {
        if (!sort) return summaries;
        return [...summaries].sort((a, b) => {
            const aRemoved = removedSkus.has(a.sku.toUpperCase());
            const bRemoved = removedSkus.has(b.sku.toUpperCase());
            if (aRemoved !== bRemoved) return aRemoved ? 1 : -1;
            const v = (s: typeof a) => s[sort.key as keyof typeof s] as number ?? 0;
            return sort.dir === 'desc' ? v(b) - v(a) : v(a) - v(b);
        });
    }, [summaries, sort, removedSkus]);

    const handleExport = useCallback(() => {
        const headers = ['SKU','Product','Impressions','Clicks','CTR%','Spend','Spend%',
            'Broad Sales','Direct Sales','Broad ROAS','Direct ROAS','Orders','Flags'];
        const rows = sorted.map(s => [
            s.sku, `"${s.productName}"`, s.impressions, s.clicks,
            (s.ctr * 100).toFixed(2), s.spend.toFixed(2),
            (s.spendShare * 100).toFixed(1), s.sales.toFixed(2), s.directSales.toFixed(2),
            s.roas.toFixed(2), s.directRoas.toFixed(2), s.orders, s.flags.join('|'),
        ]);
        const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `${group.name}-${snapshot.weekStartDate}.csv`; a.click();
        URL.revokeObjectURL(url);
    }, [sorted, group, snapshot]);

    if (summaries.length === 0) return (
        <div className="sello-table-wrap">
            <div className="p-8 text-center text-gray-400 text-sm">
                No daily SKU data for this ad group. Upload a detail CSV to see SKU performance.
            </div>
        </div>
    );

    return (
        <>
            <div className="sello-table-wrap">
                <div className="sello-table-scroll" style={{ maxHeight: '460px' }}>
                    <table className="sello-table">
                        <thead>
                            <tr>
                                <th className="pin">SKU / Product</th>
                                <SortableHeader label="Impr." sortKey="impressions" sort={sort} onChange={setSort} align="right" />
                                <SortableHeader label="Clicks" sortKey="clicks" sort={sort} onChange={setSort} align="right" />
                                <SortableHeader label="CTR" sortKey="ctr" sort={sort} onChange={setSort} align="right" />
                                <SortableHeader label="Spend" sortKey="spend" sort={sort} onChange={setSort} align="right" tint="blue" />
                                <SortableHeader label="Spend%" sortKey="spendShare" sort={sort} onChange={setSort} align="right" />
                                <SortableHeader label="Units Sold" sortKey="sales" sort={sort} onChange={setSort} align="right" tint="blue" />
                                <SortableHeader label="Broad ROAS" sortKey="roas" sort={sort} onChange={setSort} align="right" tint="green" />
                                <SortableHeader label="Direct ROAS" sortKey="directRoas" sort={sort} onChange={setSort} align="right" tint="green" />
                                <SortableHeader label="POAS" sortKey="poas" sort={sort} onChange={setSort} align="right" tint="green" />
                                <SortableHeader label="Orders" sortKey="orders" sort={sort} onChange={setSort} align="right" />
                                <th>Diagnosis</th>
                                <th>Flags &amp; Action</th>
                            </tr>
                            {/* ── TOTALS ROW — shares exact column widths ── */}
                            <tr style={{ borderTop: '1px solid rgba(229,231,235,0.8)', borderBottom: '2px solid rgba(229,231,235,0.6)' }}>
                                <th className="pin" style={{ fontWeight: 600, color: '#6b7280', fontSize: 10, fontStyle: 'italic', letterSpacing: '0.03em' }}>
                                    {summaries.length} SKUs · total
                                </th>
                                <th className="r"><span className="sello-badge badge-gray text-[10px]">{group.impressions.toLocaleString()}</span></th>
                                <th className="r"><span className="sello-badge badge-gray text-[10px]">{group.clicks.toLocaleString()}</span></th>
                                <th className="r"><span className="sello-badge badge-gray text-[10px]">{(group.ctr * 100).toFixed(2)}%</span></th>
                                <th className="r cb"><span className="sello-badge badge-blue text-[10px]">{fmtGBP(group.spend)}</span></th>
                                <th className="r"><span className="sello-badge badge-gray text-[10px]">100%</span></th>
                                <th className="r cb"><span className="sello-badge badge-blue text-[10px]">{fmtGBP(group.sales)}</span></th>
                                <th className="r cg">
                                    <span className={`sello-badge text-[10px] ${group.roasOptIn >= 3 ? 'badge-green' : group.roasOptIn >= 1.5 ? 'badge-amber' : 'badge-red'}`}>
                                        {fmt(group.roasOptIn)}
                                    </span>
                                </th>
                                <th className="r cg">
                                    <span className={`sello-badge text-[10px] ${group.directRoas >= 3 ? 'badge-green' : group.directRoas >= 1.5 ? 'badge-amber' : 'badge-red'}`}>
                                        {fmt(group.directRoas)}
                                    </span>
                                </th>
                                <th className="r cg"><span className="v-dim">—</span></th>
                                <th className="r"><span className="sello-badge badge-gray text-[10px]">{group.orders}</span></th>
                                <th className="r">
                                    {(() => {
                                    const util = group.dailyBudget > 0 ? group.spend / (group.dailyBudget * 7) : 0;
                                    const cls = utilColor(util).replace('text-','badge-').replace('emerald-600','green').replace('amber-600','amber').replace('red-600','red');
                                    return <span className={`sello-badge text-[10px] ${cls}`}>{fmtPct(util)}</span>;
                                })()}
                                </th>
                                <th>
                                    <span className={`sello-badge text-[10px] ${group.spendToSalesRatio > 0.05 ? 'badge-red' : 'badge-green'}`}>
                                        S/S {fmtPct(group.spendToSalesRatio)}{group.spendToSalesRatio <= 0.05 ? ' ✓' : ''}
                                    </span>
                                </th>
                                <th className="r">
                                    <button onClick={handleExport} className="tbtn text-[10px] px-2 py-1 flex items-center gap-1">
                                        <Download className="w-3 h-3" />
                                    </button>
                                </th>
                            </tr>
                        </thead>
                        <tbody>
                            {sorted.map(sku => {
                                const diagnosis = diagnoseSkuFunnel(sku, sku.groupAvgCtr, sku.groupAvgConvRate);
                                const diagMeta = FUNNEL_DIAGNOSIS_LABELS[diagnosis];
                                const isRemoved = removedSkus.has(sku.sku.toUpperCase());
                                const rowClass = isRemoved ? '' : sku.flags.includes('ZERO_SALES') ? 'row-neg'
                                    : sku.flags.includes('MONITORING') ? 'row-warn' : '';
                                return (
                                    <tr key={sku.sku} className={rowClass} style={isRemoved ? { opacity: 0.35, background: 'rgba(243,244,246,0.5)' } : {}}>
                                        <td className="pin">
                                            <div className="prod-normal">
                                                <div className="row1">
                                                    <span className="sku">{sku.sku}</span>
                                                    {sku.gradeLevel > 0 && <GradeBadge grade={sku.gradeLevel} />}
                                                </div>
                                                <span className="pname">{sku.productName}</span>
                                            </div>
                                        </td>
                                        <td className="r"><span className="v-num">{sku.impressions.toLocaleString()}</span></td>
                                        <td className="r"><span className="v-num">{sku.clicks}</span></td>
                                        <td className="r"><span className="v-num">{(sku.ctr * 100).toFixed(2)}%</span></td>
<td className="r cb">
                                            <span className="v-num">{fmtGBP(sku.spend)}</span>
                                            {prevSkuMap.has(sku.sku) && (() => {
                                                const prev = prevSkuMap.get(sku.sku)!;
                                                const pct = prev.spend > 0 ? (sku.spend - prev.spend) / prev.spend * 100 : null;
                                                return pct !== null ? <div className={`text-[9px] font-bold ${pct > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{pct > 0 ? '▲' : '▼'}{Math.abs(pct).toFixed(0)}%</div> : null;
                                            })()}
                                        </td>
                                        <td className="r">
                                            <span className={`v-num ${sku.spendShare > 0.3 ? 'v-warn' : ''}`}>{fmtPct(sku.spendShare)}</span>
                                        </td>
                                        {(() => {
                                            const totalSkuSales = salesHistory
                                                .filter(l => {
                                                    const lSku = (l.sku || '').toUpperCase();
                                                    const mapped = (sku.offerSku || sku.sku).toUpperCase();
                                                    return (lSku === sku.sku.toUpperCase() || lSku === mapped)
                                                        && l.date >= snapshot.weekStartDate
                                                        && l.date <= snapshot.weekEndDate
                                                        && (!l.platform || l.platform === snapshot.platform);
                                                })
                                                .reduce((s, l) => s + (l.velocity || 0), 0);
                                            const prevTotalSales = prevSkuMap.has(sku.sku)
                                                ? salesHistory
                                                    .filter(l => {
                                                        const lSku = (l.sku || '').toUpperCase();
                                                        return lSku === sku.sku.toUpperCase()
                                                            && prevSnapshot
                                                            && l.date >= prevSnapshot.weekStartDate
                                                            && l.date <= prevSnapshot.weekEndDate
                                                            && (!l.platform || l.platform === snapshot.platform);
                                                    })
                                                    .reduce((s, l) => s + (l.velocity || 0), 0)
                                                : null;
                                            const pct = prevTotalSales !== null && prevTotalSales > 0
                                                ? (totalSkuSales - prevTotalSales) / prevTotalSales * 100 : null;
                                            return (
                                                <td className="r cb">
                                                    <span className="v-num">{Math.round(totalSkuSales)}</span>
                                                    {pct !== null && <div className={`text-[9px] font-bold ${pct > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{pct > 0 ? '▲' : '▼'}{Math.abs(pct).toFixed(0)}%</div>}
                                                </td>
                                            );
                                        })()}
<td className="r cg">
                                            <span className={`v-num ${roasColor(sku.roas)}`}>{fmt(sku.roas)}</span>
                                            {prevSkuMap.has(sku.sku) && (() => {
                                                const prev = prevSkuMap.get(sku.sku)!;
                                                const pct = prev.roas > 0 ? (sku.roas - prev.roas) / prev.roas * 100 : null;
                                                return pct !== null ? <div className={`text-[9px] font-bold ${pct > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{pct > 0 ? '▲' : '▼'}{Math.abs(pct).toFixed(0)}%</div> : null;
                                            })()}
                                        </td>
                                        <td className="r cg">
                                            <span className={`v-num ${roasColor(sku.directRoas)}`}>{fmt(sku.directRoas)}</span>
                                        </td>
<td className="r cg">
                                            <span className={`v-num ${sku.poas >= 1 ? 'text-emerald-600' : 'text-red-600'}`}>{fmt(sku.poas)}</span>
                                            {prevSkuMap.has(sku.sku) && (() => {
                                                const prev = prevSkuMap.get(sku.sku)!;
                                                const pct = prev.poas > 0 ? (sku.poas - prev.poas) / prev.poas * 100 : null;
                                                return pct !== null ? <div className={`text-[9px] font-bold ${pct > 0 ? 'text-emerald-600' : 'text-red-500'}`}>{pct > 0 ? '▲' : '▼'}{Math.abs(pct).toFixed(0)}%</div> : null;
                                            })()}
                                        </td>
                                        <td className="r"><span className="v-num">{sku.orders}</span></td>
                                        <td>
                                            <span className={`sello-badge ${diagMeta.color} text-[9px]`}>{diagMeta.label}</span>
                                        </td>
                                        <td>
                                            <div className="flex flex-wrap items-center gap-1">
                                                {sku.flags.map(f => (
                                                    <span key={f} className={`sello-badge ${FLAG_META[f].color} text-[9px]`}>{FLAG_META[f].label}</span>
                                                ))}
                                                <button onClick={() => setRemoveTarget(sku.sku)} className="tbtn del text-[10px] px-2 py-1 ml-1">
                                                    Remove
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
                <div className="sello-table-footer">
                    <span>{summaries.length} SKUs · {snapshot.weekStartDate}</span>
                </div>
            </div>

            {removeTarget && (
                <RemoveSkuModal sku={removeTarget}
                    onConfirm={reason => { onRemove(removeTarget, reason); setRemoveTarget(null); }}
                    onClose={() => setRemoveTarget(null)} />
            )}
        </>
    );
}

// ─────────────────────────────────────────────────────────────
//  CANDIDATES PANEL
// ─────────────────────────────────────────────────────────────

function CandidatesPanel({ candidates, adGroups, platform, weekOf, onAdd }: {
    candidates: AdCandidate[]; adGroups: string[]; platform: string;
    weekOf: string; onAdd: (c: AdRosterChange) => void;
}) {
    const [adding, setAdding] = useState<AdCandidate | null>(null);
    const [filter, setFilter] = useState('');
    const filtered = candidates.filter(c =>
        !filter || c.sku.toLowerCase().includes(filter.toLowerCase()) ||
        c.productName.toLowerCase().includes(filter.toLowerCase())
    );
    return (
        <>
            <div className="sello-table-wrap">
                <div className="flex items-center gap-3 px-4 py-2 border-b border-custom-glass">
                    <span className="text-xs font-bold text-gray-600">Ad Group Candidates</span>
                    <span className="text-xs text-gray-400">Top {platform} sellers not yet in any ad group</span>
                    <input value={filter} onChange={e => setFilter(e.target.value)}
                        placeholder="Filter..." className="ml-auto w-48 text-xs border border-gray-200 rounded-lg px-3 py-1 focus:outline-none focus:border-gray-400" />
                </div>
                <div className="sello-table-scroll" style={{ maxHeight: '320px' }}>
                    <table className="sello-table">
                        <thead><tr>
                            <th>SKU / Product</th>
                            <th>Brand</th>
                            <th className="c">Grade</th>
                            <th className="r">Stock</th>
                            <th className="r">Runway</th>
                            <th className="r cb">30d Sales</th>
                            <th className="r">Share</th>
                            <th className="r">Score</th>
                            <th></th>
                        </tr></thead>
                        <tbody>
                            {filtered.slice(0, 25).map(c => (
                                <tr key={c.sku}>
                                    <td>
                                        <div className="prod-normal">
                                            <div className="row1"><span className="sku">{c.sku}</span></div>
                                            <span className="pname">{c.productName}</span>
                                        </div>
                                    </td>
                                    <td><span className="v-dim">{c.brand}</span></td>
                                    <td className="c">{c.gradeLevel > 0 && <GradeBadge grade={c.gradeLevel} />}</td>
                                    <td className="r"><span className="v-num">{c.stockQty}</span></td>
                                    <td className="r">
                                        <span className={`v-num ${c.runway < 4 ? 'v-warn' : ''}`}>{c.runway.toFixed(1)}w</span>
                                    </td>
                                    <td className="r cb"><span className="v-num">{fmtGBP(c.platformSales30d)}</span></td>
                                    <td className="r"><span className="v-num">{fmtPct(c.platformSalesShare)}</span></td>
                                    <td className="r">
                                        <div className="flex items-center justify-end gap-1.5">
                                            <div className="w-10 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full" style={{ background: 'var(--theme)' }} style={{ width: `${c.score * 100}%` }} />
                                            </div>
                                            <span className="v-num text-[10px]">{(c.score * 100).toFixed(0)}</span>
                                        </div>
                                    </td>
                                    <td>
                                        {c.isAlreadyInAdGroup
                                            ? <span className="v-dim text-[10px] italic">In group</span>
                                            : <button onClick={() => setAdding(c)} className="tbtn text-[10px] px-2 py-1 flex items-center gap-1">
                                                <Plus className="w-3 h-3" /> Add
                                              </button>
                                        }
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                <div className="sello-table-footer">
                    <span>{filtered.length} candidates</span>
                </div>
            </div>
            {adding && (
                <AddCandidateModal candidate={adding} adGroups={adGroups} platform={platform} weekOf={weekOf}
                    onConfirm={c => { onAdd(c); setAdding(null); }} onClose={() => setAdding(null)} />
            )}
        </>
    );
}

// ─────────────────────────────────────────────────────────────
//  ROSTER LOG
// ─────────────────────────────────────────────────────────────

function RosterLog({ log, platform }: { log: AdRosterChange[]; platform: string }) {
    const filtered = log.filter(r => r.platform === platform);
    return (
        <div className="sello-table-wrap">
            <div className="px-4 py-2 border-b border-custom-glass">
                <span className="text-xs font-bold text-gray-600">Roster Change Log — {platform}</span>
            </div>
            {filtered.length === 0
                ? <div className="p-6 text-center text-sm text-gray-400">No roster changes logged yet.</div>
                : <div className="sello-table-scroll" style={{ maxHeight: '280px' }}>
                    <table className="sello-table">
                        <thead><tr>
                            <th>Date</th><th>Week</th><th>SKU</th><th>Ad Group</th><th>Action</th><th>Reason</th>
                        </tr></thead>
                        <tbody>
                            {filtered.map(r => (
                                <tr key={r.id}>
                                    <td><span className="v-dim font-mono">{r.date}</span></td>
                                    <td><span className="v-dim">{r.weekOf}</span></td>
                                    <td><span className="sku">{r.sku}</span></td>
                                    <td><span className="v-num">{r.adGroup || '—'}</span></td>
                                    <td>
                                        <span className={`sello-badge ${r.action === 'ADD' ? 'badge-green' : 'badge-red'}`}>{r.action}</span>
                                    </td>
                                    <td><span className="v-dim">{r.reason}</span></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                  </div>
            }
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
//  INLINE UPLOAD
// ─────────────────────────────────────────────────────────────

function InlineUpload({ platform, learnedAliases, budgets, existingSnapshots, products, onImport, onClose }: {
    platform: string; learnedAliases: Record<string, string>; budgets: Record<string, number>;
    existingSnapshots: AdSnapshot[]; products: Product[];
    onImport: (s: AdSnapshot, b: Record<string, number>) => void; onClose: () => void;
}) {
    // 3-step flow: drop files → configure dates + mode → done
    const [step, setStep] = useState<'drop' | 'configure' | 'done'>('drop');
    const [dragging, setDragging] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [parsing, setParsing] = useState(false);
    const fileRef = React.useRef<HTMLInputElement>(null);

    // Parsed CSV rows
    const [summaryRows, setSummaryRows] = useState<Record<string, string>[]>([]);
    const [detailRows, setDetailRows]   = useState<Record<string, string>[]>([]);
    const [fileNames, setFileNames]     = useState<string[]>([]);

    // User-defined date range
    const [dateStart, setDateStart] = useState('');
    const [dateEnd, setDateEnd]     = useState('');

    // Create new or overwrite existing week
    const [mode, setMode] = useState<'new' | 'update'>('new');
    const [targetWeek, setTargetWeek] = useState<string>('');

    // Budget entry per ad group (detected from parsed CSV)
    const [detectedGroups, setDetectedGroups] = useState<{campaign: string; name: string}[]>([]);
    const [groupBudgets, setGroupBudgets] = useState<Record<string, number>>({});
    const [inactiveGroups, setInactiveGroups] = useState<Set<string>>(new Set());

    const platformSnapshots = existingSnapshots
        .filter(s => s.platform === platform)
        .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate));

    const parseFiles = useCallback(async (files: FileList) => {
        setError(null); setParsing(true);
        const names: string[] = [];
        let sRows: Record<string, string>[] = [];
        let dRows: Record<string, string>[] = [];
        try {
            const { detectAndParseCsv, parseDetailCsv, detectWeekFromDetailRows } =
                await import('../../services/adCampaignService');
            for (const file of Array.from(files)) {
                names.push(file.name);
                const text = await file.text();
                const result = detectAndParseCsv(text);
                if (result.type === 'summary') sRows = result.rows;
                else if (result.type === 'detail') dRows = result.rows;
            }
            if (!sRows.length && !dRows.length) {
                setError('Could not recognise file format. Expected an ad group summary or detail CSV.');
                setParsing(false); return;
            }
            // Pre-fill dates from detail rows if available
            if (dRows.length > 0) {
                const daily = parseDetailCsv(dRows, learnedAliases);
                const { weekStartDate, weekEndDate } = detectWeekFromDetailRows(daily);
                setDateStart(weekStartDate);
                setDateEnd(weekEndDate);
            } else {
                const now = new Date();
                const end = new Date(now); end.setDate(now.getDate() - 1);
                const start = new Date(end); start.setDate(end.getDate() - 6);
                setDateStart(start.toISOString().split('T')[0]);
                setDateEnd(end.toISOString().split('T')[0]);
            }
            setSummaryRows(sRows);
            setDetailRows(dRows);
            setFileNames(names);
            setMode('new');
            if (platformSnapshots.length > 0) setTargetWeek(platformSnapshots[0].id);
            // Detect ad groups and pre-fill budgets from existing budgets state
            const groups: {campaign: string; name: string}[] = [];
            const seen = new Set<string>();
            for (const row of sRows) {
                const campaign = row['Campaign'] ?? row['campaign'] ?? '';
                const name = row['Ad group'] ?? row['Ad Group'] ?? row['ad_group'] ?? '';
                if (campaign && name && !seen.has(name)) {
                    seen.add(name);
                    groups.push({ campaign, name });
                }
            }
            setDetectedGroups(groups);
            // Pre-fill from any existing budget for this group (latest week key)
            const prefilled: Record<string, number> = {};
            groups.forEach(g => {
                // Try to find the most recent budget for this group across any week
                const existingKey = Object.keys(budgets).filter(k => k.endsWith('::' + g.name)).sort().reverse()[0];
                if (existingKey) prefilled[g.name] = budgets[existingKey];
            });
            setGroupBudgets(prefilled);
            setInactiveGroups(new Set());
            setStep('configure');
        } catch (e: any) { setError(e.message || 'Parse failed'); }
        setParsing(false);
    }, [learnedAliases, platformSnapshots]);

    const handleConfirm = useCallback(async () => {
        if (!dateStart || !dateEnd) { setError('Please set a date range.'); return; }
        setError(null);
        try {
            const { parseSummaryCsv, parseDetailCsv, buildSnapshot } =
                await import('../../services/adCampaignService');
            // Build week-specific budget map from groupBudgets
            const weekBudgetMap: Record<string, number> = { ...budgets };
            detectedGroups.forEach(g => {
                if (!inactiveGroups.has(g.name)) {
                    weekBudgetMap[`${dateStart}::${g.name}`] = groupBudgets[g.name] ?? 0;
                }
            });
            const campaigns = parseSummaryCsv(summaryRows, weekBudgetMap, platform);
            const daily = parseDetailCsv(detailRows, learnedAliases);
            const prev = platformSnapshots[0] ?? null;
            const snapshot = buildSnapshot(platform, campaigns, daily, dateStart, dateEnd, prev, products);
            // Mark inactive groups in snapshot
            if (inactiveGroups.size > 0) {
                snapshot.campaigns.forEach(camp => {
                    camp.adGroups.forEach(g => {
                        if (inactiveGroups.has(g.name)) (g as any).inactive = true;
                    });
                });
            }
            // For update mode: preserve the existing snapshot's id so useAppState replaces it
            if (mode === 'update' && targetWeek) {
                (snapshot as any).id = targetWeek;
            }
            onImport(snapshot, weekBudgetMap);
            setStep('done');
        } catch (e: any) { setError(e.message || 'Import failed'); }
    }, [dateStart, dateEnd, summaryRows, detailRows, budgets, platform, learnedAliases,
        mode, targetWeek, platformSnapshots, products, onImport]);

    const dayCount = dateStart && dateEnd
        ? Math.round((new Date(dateEnd).getTime() - new Date(dateStart).getTime()) / 86400000) + 1
        : null;

    // ── Step 1: Drop files ──
    if (step === 'drop') return (
        <div className="bg-custom-glass rounded-xl border border-custom-glass p-4 space-y-3">
            <div className="flex items-center justify-between">
                <div>
                    <span className="text-xs font-bold text-gray-700">Upload Campaign Data</span>
                    <span className="text-xs text-gray-400 ml-2">— {platform}</span>
                </div>
                <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X className="w-4 h-4 text-gray-400" />
                </button>
            </div>
            <div
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
                    ${dragging ? 'border-gray-400 bg-gray-50/30' : 'border-gray-200 hover:border-gray-400'}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setDragging(true); }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); parseFiles(e.dataTransfer.files); }}>
                <Upload className="w-6 h-6 text-gray-300 mx-auto mb-2" />
                <p className="text-sm font-semibold text-gray-600">Drop CSV files here or click to browse</p>
                <p className="text-xs text-gray-400 mt-1">Ad group summary CSV · Daily detail CSV (optional)</p>
                {parsing && <p className="text-xs mt-2 font-medium" style={{ color: 'var(--theme)' }}>Parsing files…</p>}
                {error && <p className="text-xs text-red-500 mt-2">{error}</p>}
            </div>
            <input ref={fileRef} type="file" accept=".csv" multiple className="hidden"
                onChange={e => e.target.files && parseFiles(e.target.files)} />
        </div>
    );

    // ── Step 2: Configure ──
    if (step === 'configure') return (
        <div className="bg-custom-glass rounded-xl border border-custom-glass p-5 space-y-5">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-gray-700">Configure Import — {platform}</span>
                <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg">
                    <X className="w-4 h-4 text-gray-400" />
                </button>
            </div>

            {/* Files parsed */}
            <div className="flex flex-wrap items-center gap-2">
                {fileNames.map(n => (
                    <span key={n} className="sello-badge badge-indigo text-[10px]">{n}</span>
                ))}
                <button onClick={() => { setStep('drop'); setError(null); }}
                    className="text-[10px] text-gray-400 underline" style={{ cursor: 'pointer' }}>
                    Change files
                </button>
            </div>

            {/* Date range */}
            <div>
                <label className="text-xs font-bold text-gray-600 block mb-1.5">
                    Date Range
                    <span className="font-normal text-gray-400 ml-1">— the period this data covers</span>
                </label>
                <div className="flex items-center gap-3">
                    <input type="date" value={dateStart} onChange={e => setDateStart(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-gray-400" />
                    <span className="text-gray-400 text-xs">→</span>
                    <input type="date" value={dateEnd} onChange={e => setDateEnd(e.target.value)}
                        className="text-xs border border-gray-200 rounded-lg px-3 py-2 font-mono focus:outline-none focus:border-gray-400" />
                    {dayCount !== null && (
                        <span className="text-xs text-gray-500">{dayCount} day{dayCount !== 1 ? 's' : ''}</span>
                    )}
                </div>
                <p className="text-[10px] text-gray-400 mt-1">Pre-filled from your file dates — adjust if needed.</p>
            </div>

            {/* Action: new vs update */}
            <div>
                <label className="text-xs font-bold text-gray-600 block mb-2">Action</label>
                <div className="flex gap-3">
                    <button onClick={() => setMode('new')}
                        className={`flex-1 py-3 text-xs font-semibold rounded-xl border transition-all text-left px-4
                            ${mode === 'new'
                                ? 'text-white border-transparent'
                                : 'bg-white text-gray-600 border-gray-200'}`}
                        style={mode === 'new' ? { background: 'var(--theme)' } : {}}>
                        <div>＋ Create new week</div>
                        <div className="text-[10px] font-normal mt-0.5 opacity-70">Add a new entry for this date range</div>
                    </button>
                    <button onClick={() => setMode('update')} disabled={platformSnapshots.length === 0}
                        className={`flex-1 py-3 text-xs font-semibold rounded-xl border transition-all disabled:opacity-40 text-left px-4
                            ${mode === 'update'
                                ? 'bg-amber-500 text-white border-amber-500'
                                : 'bg-white text-gray-600 border-gray-200 hover:border-amber-300 hover:text-amber-600'}`}>
                        <div>↺ Update existing week</div>
                        <div className="text-[10px] font-normal mt-0.5 opacity-70">Replace a previously imported week</div>
                    </button>
                </div>

                {mode === 'update' && platformSnapshots.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                        <label className="text-[10px] text-gray-500 font-bold uppercase tracking-wide block">
                            Week to replace
                        </label>
                        <select value={targetWeek} onChange={e => setTargetWeek(e.target.value)}
                            className="w-full text-xs border border-amber-200 rounded-lg px-3 py-2 bg-amber-50/40 focus:outline-none focus:border-amber-400">
                            {platformSnapshots.map(s => (
                                <option key={s.id} value={s.id}>
                                    {s.weekStartDate} → {s.weekEndDate}
                                    {s.campaigns.map(c => c.name).join(' / ')}
                                </option>
                            ))}
                        </select>
                        <p className="text-[10px] text-amber-600">
                            This will replace the selected week's data with your new upload.
                        </p>
                    </div>
                )}
            </div>

            {/* Budget entry per ad group */}
            {detectedGroups.length > 0 && (
                <div>
                    <label className="text-xs font-bold text-gray-600 block mb-2">
                        Ad Group Budgets
                        <span className="font-normal text-gray-400 ml-1">— set daily budget or mark inactive</span>
                    </label>
                    <div className="space-y-2">
                        {detectedGroups.map(g => {
                            const isInactive = inactiveGroups.has(g.name);
                            return (
                                <div key={g.name} className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${isInactive ? 'bg-gray-50 border-gray-200 opacity-50' : 'bg-white border-gray-200'}`}>
                                    <div className="flex-1 min-w-0">
                                        <div className="text-xs font-bold text-gray-800 truncate">{g.name}</div>
                                        <div className="text-[10px] text-gray-400">{g.campaign}</div>
                                    </div>
                                    {!isInactive && (
                                        <div className="flex items-center gap-1">
                                            <span className="text-xs text-gray-500">£</span>
                                            <input
                                                type="number" min="0" step="0.01"
                                                value={groupBudgets[g.name] ?? ''}
                                                onChange={e => setGroupBudgets(prev => ({ ...prev, [g.name]: parseFloat(e.target.value) || 0 }))}
                                                placeholder="0.00"
                                                className="w-20 border border-gray-300 rounded px-2 py-1 text-xs text-center focus:outline-none focus:border-theme"
                                            />
                                            <span className="text-[10px] text-gray-400">/day</span>
                                        </div>
                                    )}
                                    <button
                                        onClick={() => setInactiveGroups(prev => {
                                            const next = new Set(prev);
                                            next.has(g.name) ? next.delete(g.name) : next.add(g.name);
                                            return next;
                                        })}
                                        className={`text-[10px] font-bold px-2 py-1 rounded border transition-all ${isInactive ? 'bg-gray-200 text-gray-500 border-gray-300' : 'bg-white text-gray-500 border-gray-200 hover:border-red-300 hover:text-red-500'}`}
                                    >
                                        {isInactive ? '↺ Activate' : 'Inactive'}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {error && <p className="text-xs text-red-500">{error}</p>}

            <div className="flex gap-2 pt-1">
                <button onClick={() => setStep('drop')}
                    className="flex-1 py-2 text-xs font-bold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50">
                    ← Back
                </button>
                <button
                    onClick={handleConfirm}
                    disabled={!dateStart || !dateEnd || (mode === 'update' && !targetWeek)}
                    className={`flex-1 py-2 text-xs font-bold text-white rounded-lg disabled:opacity-40 transition-all
                        ${mode === 'update' ? 'bg-amber-500 hover:bg-amber-600' : 'bg-theme hover:opacity-90'}`}>
                    {mode === 'update' ? '↺ Update Week' : '＋ Import New Week'}
                </button>
            </div>
        </div>
    );

    // ── Step 3: Done ──
    return (
        <div className="bg-custom-glass rounded-xl border border-custom-glass p-6 text-center space-y-2">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <span className="text-emerald-600 text-lg font-bold">✓</span>
            </div>
            <p className="text-sm font-bold text-gray-900">
                {mode === 'update' ? 'Week Updated' : 'Week Imported'}
            </p>
            <p className="text-xs text-gray-500">{dateStart} → {dateEnd}</p>
            <button onClick={onClose} className="mt-2 sello-btn cta text-xs px-6">Done</button>
        </div>
    );
}


// ─────────────────────────────────────────────────────────────
//  EXPORT — Campaign report CSV
// ─────────────────────────────────────────────────────────────

function exportCampaignReport(snapshot: AdSnapshot) {
    const lines: string[] = [
        `Ad Campaign Report — ${snapshot.platform} — ${snapshot.weekStartDate} to ${snapshot.weekEndDate}`,
        `Exported: ${new Date().toLocaleDateString('en-GB')}`, '',
    ];
    for (const campaign of snapshot.campaigns) {
        lines.push(`Campaign: ${campaign.name}`, campaign.weeklySummary || '', '');
        lines.push('Ad Group,Daily Budget,Spend,Utilisation,Sales,Broad ROAS,Direct ROAS,Halo%,S/S%,SKU Count,Budget Rec');
        for (const g of campaign.adGroups) {
            const b = getBudgetRecommendation(g, null);
            lines.push([`"${g.name}"`, g.dailyBudget, g.spend.toFixed(2),
                (g.utilisation * 100).toFixed(0) + '%', g.sales.toFixed(2),
                g.roasOptIn.toFixed(2), g.directRoas.toFixed(2),
                (g.haloEffect * 100).toFixed(0) + '%',
                (g.spendToSalesRatio * 100).toFixed(1) + '%',
                g.memberSkus.length, b.action].join(','));
        }
        lines.push('', '--- Weekly Summaries ---');
        for (const g of campaign.adGroups) lines.push(`"${g.name}": "${g.weeklySummary || 'No summary'}"`);
        lines.push('');
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `AdCampaign-${snapshot.platform}-${snapshot.weekStartDate}.csv`; a.click();
    URL.revokeObjectURL(url);
}

// ─────────────────────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────────────────────

const AdCampaignPageContainer: React.FC<AdCampaignPageProps> = ({
    products, salesHistory, learnedAliases,
    adSnapshots, adRosterChanges, adBudgets, onImport, onRosterChange,
}) => {
    const [platform, setPlatform] = useState('The Range');
    const [selectedWeekIdx, setSelectedWeekIdx] = useState(0);
    const [activeAdGroup, setActiveAdGroup] = useState<string>('');
    const [activeMainTab, setActiveMainTab] = useState<string>('summary');
    const [activeCampaignName, setActiveCampaignName] = useState<string>('');
    const [showCandidates, setShowCandidates] = useState(false);
    const [showUpload, setShowUpload] = useState(false);
    const [showRosterLog, setShowRosterLog] = useState(false);
    const [notes, setNotes] = useState<Record<string, string>>({});
    const [campaignNotes, setCampaignNotes] = useState<Record<string, string>>({});

    const platformSnapshots = useMemo(() =>
        (adSnapshots || []).filter(s => s.platform === platform)
            .sort((a, b) => b.weekStartDate.localeCompare(a.weekStartDate)),
        [adSnapshots, platform]);

    const snapshot = platformSnapshots[selectedWeekIdx] ?? null;
    const prevSnapshot = platformSnapshots[selectedWeekIdx + 1] ?? null;

    // Select active campaign — default to first
    const campaign = (snapshot?.campaigns.find(c => c.name === activeCampaignName) ?? snapshot?.campaigns[0]) ?? null;
    const prevCampaign = (prevSnapshot?.campaigns.find(c => c.name === campaign?.name) ?? prevSnapshot?.campaigns[0]) ?? null;

    // Auto-select first ad group when campaign changes
    const firstGroup = campaign?.adGroups[0]?.name ?? '';
    const effectiveActiveGroup = activeAdGroup || firstGroup;
    const activeGroup = campaign?.adGroups.find(g => g.name === effectiveActiveGroup) ?? campaign?.adGroups[0] ?? null;
    const prevGroup = prevCampaign?.adGroups.find(g => g.name === activeGroup?.name) ?? null;

    const totals = useMemo(() => {
        if (!campaign || !snapshot) return null;
        const all = campaign.adGroups;
        const spend = all.reduce((s, g) => s + g.spend, 0);
        const sales = all.reduce((s, g) => s + g.sales, 0);
        const directSales = all.reduce((s, g) => s + g.directSales, 0);
        // Recompute utilAvg using live budget values
        const utilAvg = all.length > 0 ? all.reduce((s, g) => {
            const budget = adBudgets[`${snapshot.weekStartDate}::${g.name}`] ?? g.dailyBudget;
            const util = budget > 0 ? g.spend / (budget * 7) : 0;
            return s + util;
        }, 0) / all.length : 0;
        // Total platform sales from salesHistory for the week (not just ad-attributed sales)
        const totalPlatformSales = salesHistory
            .filter(l =>
                l.date >= snapshot.weekStartDate &&
                l.date <= snapshot.weekEndDate &&
                (!l.platform || l.platform === snapshot.platform)
            )
            .reduce((s, l) => s + ((l.price || 0) * (l.velocity || 0)), 0);
        return {
            spend, sales, directSales, utilAvg,
            broadRoas: spend > 0 ? sales / spend : 0,
            directRoas: spend > 0 ? directSales / spend : 0,
            spendRatio: totalPlatformSales > 0 ? spend / totalPlatformSales : (sales > 0 ? spend / sales : 0),
        };
    }, [campaign, snapshot, adBudgets, salesHistory]);

    const existingAdSkus = useMemo(() => {
        const set = new Set<string>();
        (adSnapshots || []).filter(s => s.platform === platform)
            .forEach(s => s.campaigns.forEach(c => c.adGroups.forEach(g => g.memberSkus.forEach(sku => set.add(sku)))));
        return set;
    }, [adSnapshots, platform]);

    const allAdGroups = useMemo(() =>
        campaign?.adGroups.map(g => g.name) ?? [], [campaign]);

    const candidates = useMemo(() =>
        findAdCandidates(products, salesHistory, existingAdSkus, platform),
        [products, salesHistory, existingAdSkus, platform]);

    const platforms = useMemo(() => {
        const from = [...new Set((adSnapshots || []).map(s => s.platform))];
        return from.includes('The Range') ? from : ['The Range', ...from];
    }, [adSnapshots]);

    const weekOptions = platformSnapshots.map((s, i) => ({
        label: `${s.weekStartDate} → ${s.weekEndDate}`,
        value: i,
    }));

    const noteKey = (g: string) => `${platform}::${snapshot?.weekStartDate ?? ''}::${g}`;

    return (
        <div className="max-w-[1600px] mx-auto space-y-4 pb-10">

            {/* ── TOOLBAR ── */}
            <div className="flex flex-wrap gap-3 items-center justify-between">
                <div className="flex items-center gap-3">
                    <SelectFilter label="Platform" options={platforms} singleSelect
                        selected={[platform]}
                        onChange={sel => { setPlatform(sel[0] ?? 'The Range'); setSelectedWeekIdx(0); setActiveAdGroup(''); }} />
                    {platformSnapshots.length > 0 && (
                        <SelectFilter label="Week"
                            options={platformSnapshots.map(s => `${s.weekStartDate} → ${s.weekEndDate}`)}
                            singleSelect
                            selected={[`${platformSnapshots[selectedWeekIdx]?.weekStartDate} → ${platformSnapshots[selectedWeekIdx]?.weekEndDate}`]}
                            onChange={sel => {
                                const idx = platformSnapshots.findIndex(s => `${s.weekStartDate} → ${s.weekEndDate}` === sel[0]);
                                if (idx >= 0) { setSelectedWeekIdx(idx); setActiveAdGroup(''); }
                            }} />
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {snapshot && (
                        <button onClick={() => exportCampaignMasterXlsx(adSnapshots, platform)} className="sello-btn flex items-center gap-1.5">
                            <Download className="w-3.5 h-3.5" /> Export XLSX
                        </button>
                    )}
                    <button onClick={() => setShowRosterLog(v => !v)}
                        className={`sello-btn flex items-center gap-1.5 ${showRosterLog ? 'active' : ''}`}>
                        <ClipboardList className="w-3.5 h-3.5" /> Roster Log
                        {(adRosterChanges || []).filter(r => r.platform === platform).length > 0 && (
                            <span className="sello-badge badge-gray ml-1">{(adRosterChanges || []).filter(r => r.platform === platform).length}</span>
                        )}
                    </button>
                    <button onClick={() => setShowCandidates(v => !v)}
                        className={`sello-btn flex items-center gap-1.5 ${showCandidates ? 'active' : ''}`}>
                        <Users className="w-3.5 h-3.5" /> Candidates
                        {candidates.length > 0 && <span className="sello-badge badge-indigo ml-1">{candidates.length}</span>}
                    </button>
                    <button onClick={() => setShowUpload(v => !v)} className="sello-btn cta flex items-center gap-1.5">
                        <Upload className="w-3.5 h-3.5" /> Upload Data
                    </button>
                </div>
            </div>

            {/* ── UPLOAD ── */}
            {showUpload && (
                <InlineUpload platform={platform} learnedAliases={learnedAliases}
                    budgets={adBudgets} existingSnapshots={adSnapshots} products={products}
                    onImport={(snap, b) => { onImport(snap, b); setSelectedWeekIdx(0); }}
                    onClose={() => setShowUpload(false)} />
            )}

            {/* ── EMPTY STATE ── */}
            {!snapshot && !showUpload && (
                <div className="bg-custom-glass rounded-xl border border-custom-glass p-12 text-center">
                    <BarChart2 className="w-12 h-12 text-gray-200 mx-auto mb-4" />
                    <p className="text-lg font-bold text-gray-900 mb-2">No Campaign Data</p>
                    <p className="text-sm text-gray-500 mb-6 max-w-sm mx-auto">
                        Upload your ad group summary CSV from {platform} to get started.
                    </p>
                    <button onClick={() => setShowUpload(true)} className="sello-btn cta flex items-center gap-2 mx-auto">
                        <Upload className="w-4 h-4" /> Upload Campaign Data
                    </button>
                </div>
            )}

            {snapshot && campaign && (<>

                {/* ── CAMPAIGN SELECTOR — shown only when multiple campaigns ── */}
                {snapshot.campaigns.length > 1 && (
                    <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wide">Campaign</span>
                        {snapshot.campaigns.map(c => (
                            <button key={c.name} onClick={() => { setActiveCampaignName(c.name); setActiveAdGroup(''); setActiveMainTab('summary'); }}
                                className={`text-xs px-3 py-1.5 rounded-lg border font-medium transition-all
                                    ${(activeCampaignName || snapshot.campaigns[0].name) === c.name
                                        ? 'bg-theme text-white border-theme'
                                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'}`}>
                                {c.name}
                                <span className="ml-1.5 text-[10px] opacity-70">{c.adGroups.length} groups</span>
                            </button>
                        ))}
                    </div>
                )}

                {/* ── KPI BAR ── */}
                {totals && (
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                        <MetricCard title="Total Spend" value={fmtGBP(totals.spend)} icon={DollarSign} color="orange" />
                        <MetricCard title="Ad Sales" value={fmtGBP(totals.sales)} icon={TrendingUp} color="blue"
                            desc="Campaign attributed sales" />
                        <MetricCard
                            title="Broad ROAS"
                            value={<span className={roasColor(totals.broadRoas)}>{fmt(totals.broadRoas)}</span>}
                            icon={BarChart3} color="emerald"
                            desc={`Direct: ${fmt(totals.directRoas)}`}
                        />
                        <MetricCard
                            title="Direct ROAS"
                            value={<span className={roasColor(totals.directRoas)}>{fmt(totals.directRoas)}</span>}
                            icon={Target} color="purple"
                        />
                        <MetricCard
                            title="Spend / Sales"
                            value={<span className={totals.spendRatio <= 0.05 ? 'text-emerald-600' : 'text-red-600'}>{fmtPct(totals.spendRatio)}</span>}
                            icon={Percent} color={totals.spendRatio <= 0.05 ? 'emerald' : 'red'}
                            desc="Target: ≤ 5%"
                        />
                        <MetricCard
                            title="Avg Utilisation"
                            value={<span className={utilColor(totals.utilAvg)}>{fmtPct(totals.utilAvg)}</span>}
                            icon={Gauge} color="indigo"
                        />
                    </div>
                )}

                {/* ── FOLDER-TAB PANEL ── */}
                <div className="relative">
                    {/* Tab strip */}
                    <FolderTabs
                        tabs={[
                            { key: 'summary', label: 'Summary', badge: undefined },
                            ...campaign.adGroups.map(g => ({
                                key: g.name,
                                label: g.name,
                                badge: g.memberSkus.length > 0 ? g.memberSkus.length : undefined,
                            })),
                        ]}
                        active={activeMainTab in { summary: 1, ...Object.fromEntries(campaign.adGroups.map(g => [g.name, 1])) }
                            ? activeMainTab : 'summary'}
                        onChange={key => { setActiveMainTab(key); if (key !== 'summary') setActiveAdGroup(key); }}
                    />

                    {/* Panel body — sits below the tabs with a connected border */}
                    <div className="bg-white/90 border border-gray-200/80 rounded-b-xl rounded-tr-xl overflow-hidden"
                        style={{ backdropFilter: 'blur(8px)' }}>

                        {/* ── SUMMARY TAB ── */}
                        {(activeMainTab === 'summary' || !campaign.adGroups.some(g => g.name === activeMainTab)) && (
                            <SummaryTab
                                campaign={campaign}
                                platformSnapshots={platformSnapshots}
                                prevCampaign={prevCampaign}
                                notes={notes[noteKey('__campaign__')] ?? ''}
                                onNotesChange={v => setNotes(prev => ({ ...prev, [noteKey('__campaign__')]: v }))}
                                campaignNotes={campaignNotes}
                                setCampaignNotes={setCampaignNotes}
                                salesHistory={salesHistory}
                                snapshot={snapshot}
                                budgets={adBudgets}
                            />
                        )}

                        {/* ── AD GROUP TABS ── */}
                        {campaign.adGroups.map(group => {
                            if (activeMainTab !== group.name) return null;
                            const pg = prevCampaign?.adGroups.find(g => g.name === group.name) ?? null;
                            return (
                                <div key={group.name} className="p-4 space-y-4">
                                    <AdGroupHeader
                                        group={group}
                                        prevGroup={pg}
                                        notes={notes[noteKey(group.name)] ?? ''}
                                        onNotesChange={v => setNotes(prev => ({ ...prev, [noteKey(group.name)]: v }))}
                                        budget={adBudgets[`${snapshot.weekStartDate}::${group.name}`] ?? group.dailyBudget}
                                        onBudgetChange={v => {
                                            const key = `${snapshot.weekStartDate}::${group.name}`;
                                            const updated = { ...adBudgets, [key]: v };
                                            onImport({ ...snapshot, campaigns: snapshot.campaigns.map(camp => ({
                                                ...camp,
                                                adGroups: camp.adGroups.map(g => g.name === group.name ? { ...g, dailyBudget: v } : g)
                                            })) }, updated);
                                        }}
                                    />
                                    <SkuTable
                                        group={group}
                                        snapshot={snapshot}
                                        prevSnapshot={prevSnapshot}
                                        products={products}
                                        salesHistory={salesHistory}
                                        adRosterChanges={adRosterChanges}
                                        onRemove={(sku, reason) => onRosterChange({
                                            id: `rc-${Date.now()}`,
                                            date: new Date().toISOString().split('T')[0],
                                            weekOf: snapshot.weekStartDate,
                                            platform: snapshot.platform,
                                            campaign: campaign.name,
                                            adGroup: group.name,
                                            sku, action: 'REMOVE', reason,
                                        })}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* ── CANDIDATES ── */}
                {showCandidates && (
                    <CandidatesPanel
                        candidates={candidates}
                        adGroups={allAdGroups}
                        platform={platform}
                        weekOf={snapshot.weekStartDate}
                        onAdd={onRosterChange}
                    />
                )}

                {/* ── ROSTER LOG ── */}
                {showRosterLog && (
                    <RosterLog log={adRosterChanges || []} platform={platform} />
                )}

            </>)}
        </div>
    );
};

export default AdCampaignPageContainer;
