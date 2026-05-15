import React from 'react';
import { Activity, Boxes, CalendarRange, ChevronDown, ChevronRight, Layers3, TrendingUp, X } from 'lucide-react';
import { SortState } from '../../../utils/tableSort';
import { SortableHeader } from '../../common/SortableHeader';
import { formatPct, formatSmartMoney, formatNumber } from '../../../utils/format';
import { TAX_NOTE_SHORT } from '../../../services/taxPolicy';
import { PlatformSummary } from '../platformManagement.types';
import { PricingRules } from '../../../types';
import AuditPanel from '../../common/AuditPanel';
import { FilterBar } from '../../common/FilterBar';
import {
    PlatformOverviewCategorySummary,
    PlatformOverviewContributor,
    PlatformOverviewFocusMetric,
    PlatformOverviewLedgerEntry,
    PlatformOverviewRowDetail,
    PlatformOverviewSummaryStrip,
    PlatformOverviewWeeklyRow
} from '../../../services/platformOverviewAnalysis';

type PlatformOverviewSortKey = 'platform' | 'weekStartKey' | PlatformOverviewFocusMetric | 'focusDelta';

interface PlatformOverviewTabProps {
    pricingRules: PricingRules;
    themeColor: string;
    summary: PlatformOverviewSummaryStrip;
    rows: PlatformOverviewWeeklyRow[];
    focusMetric: PlatformOverviewFocusMetric;
    setFocusMetric: (metric: PlatformOverviewFocusMetric) => void;
    sort: SortState<PlatformOverviewSortKey>;
    setSort: (sort: SortState<PlatformOverviewSortKey>) => void;
    platformOptions: string[];
    selectedPlatformKey: string | null;
    setSelectedPlatformKey: (key: string | null) => void;
    selectedRowId: string | null;
    setSelectedRowId: (id: string | null) => void;
    selectedRow: PlatformOverviewWeeklyRow | null;
    detail: PlatformOverviewRowDetail | null;
    auditRows: PlatformSummary[];
    startKey?: string;
    endKey?: string;
    isAuditVisible: boolean;
}

const METRIC_META: Array<{
    key: PlatformOverviewFocusMetric;
    label: string;
    align?: 'right';
    tint?: 'blue' | 'green' | 'red';
}> = [
    { key: 'revenue', label: 'Revenue', align: 'right', tint: 'blue' },
    { key: 'units', label: 'Units', align: 'right' },
    { key: 'cogs', label: 'COGS', align: 'right', tint: 'blue' },
    { key: 'cogsPct', label: 'COGS %', align: 'right', tint: 'blue' },
    { key: 'asp', label: 'ASP', align: 'right', tint: 'blue' },
    { key: 'adSpend', label: 'Ad Spend', align: 'right', tint: 'blue' },
    { key: 'tacosPct', label: 'Ad Spend %', align: 'right', tint: 'blue' },
    { key: 'refundAmountPct', label: 'Refund Amt %', align: 'right', tint: 'red' },
    { key: 'refundQtyPct', label: 'Refund Qty %', align: 'right', tint: 'red' },
    { key: 'refundImpact', label: 'Refund Impact', align: 'right', tint: 'red' },
    { key: 'netProfit', label: 'Net Profit', align: 'right', tint: 'green' },
    { key: 'marginPct', label: 'Margin %', align: 'right', tint: 'green' }
];

const FOCUS_LABELS: Record<PlatformOverviewFocusMetric, string> = {
    revenue: 'Revenue',
    units: 'Units',
    cogs: 'COGS',
    cogsPct: 'COGS %',
    asp: 'ASP',
    adSpend: 'Ad Spend',
    tacosPct: 'Ad Spend %',
    refundAmountPct: 'Refund Amount %',
    refundQtyPct: 'Refund QTY %',
    refundImpact: 'Refund Impact',
    netProfit: 'Net Profit',
    marginPct: 'Margin %'
};

const FOCUS_OPTIONS: Array<{ key: PlatformOverviewFocusMetric; label: string; hint: string }> = [
    { key: 'units', label: 'Units', hint: 'Volume movement and scale' },
    { key: 'cogsPct', label: 'COGS %', hint: 'Cost pressure vs sales' },
    { key: 'refundAmountPct', label: 'Refund Amount %', hint: 'Refund value pressure vs revenue' },
    { key: 'refundQtyPct', label: 'Refund QTY %', hint: 'Returned units vs sold units' },
    { key: 'tacosPct', label: 'Ad Spend %', hint: 'Ad pressure vs revenue' },
    { key: 'netProfit', label: 'Net Profit', hint: 'Absolute profit movement' },
    { key: 'marginPct', label: 'Margin %', hint: 'Profitability quality' }
];

const isPercentMetric = (metric: PlatformOverviewFocusMetric) => (
    metric === 'cogsPct' || metric === 'tacosPct' || metric === 'refundAmountPct' || metric === 'refundQtyPct' || metric === 'marginPct'
);

const isCostPressureMetric = (metric: PlatformOverviewFocusMetric) => (
    metric === 'cogs' || metric === 'cogsPct' || metric === 'adSpend' || metric === 'tacosPct' || metric === 'refundAmountPct' || metric === 'refundQtyPct' || metric === 'refundImpact'
);

const formatMetricValue = (metric: PlatformOverviewFocusMetric, value: number | null): string => {
    if (value === null) return 'N/A';
    if (metric === 'units') return formatNumber(value);
    if (metric === 'cogsPct' || metric === 'tacosPct' || metric === 'refundAmountPct' || metric === 'refundQtyPct' || metric === 'marginPct') return formatPct(value);
    return formatSmartMoney(value);
};

const formatDeltaValue = (metric: PlatformOverviewFocusMetric, value: number | null): string => {
    if (value === null) return 'N/A';
    const sign = value > 0 ? '+' : '';
    if (metric === 'units') return `${sign}${formatNumber(value)}`;
    if (isPercentMetric(metric)) return `${sign}${value.toFixed(1)}pp`;
    return `${sign}${formatSmartMoney(value)}`;
};

const deltaClassName = (metric: PlatformOverviewFocusMetric, value: number | null): string => {
    if (value === null || Math.abs(value) < 0.0001) return 'text-gray-500';
    const isPositive = value > 0;
    if (isCostPressureMetric(metric)) {
        return isPositive ? 'text-red-600' : 'text-emerald-600';
    }
    return isPositive ? 'text-emerald-600' : 'text-red-600';
};

const getFocusDriverNote = (focusMetric: PlatformOverviewFocusMetric): string => {
    switch (focusMetric) {
        case 'units':
            return 'Track which SKUs and categories drove the weekly volume shift, then compare their revenue and ASP quality.';
        case 'cogsPct':
            return 'COGS % rises when cost grows faster than revenue. Compare cost-heavy SKUs against revenue, ASP, and margin quality.';
        case 'refundAmountPct':
            return 'Focus on refund value against revenue. Large refund-impact SKUs can pressure platform performance even at low unit counts.';
        case 'refundQtyPct':
            return 'Focus on returned units against sold units. This helps surface defect or customer-expectation issues early.';
        case 'tacosPct':
            return 'Ad spend % rises when ad cost grows faster than revenue. Compare ad-heavy SKUs against their revenue contribution.';
        case 'netProfit':
            return 'Review the SKUs and categories causing the largest profit drag or lift in the selected week.';
        case 'marginPct':
            return 'Margin % falls when cost, ads, or refunds outpace revenue. Use the driver tables to isolate where that pressure came from.';
        default:
            return 'Use the contributor and category tables to isolate the main weekly driver.';
    }
};

const getFocusContributionLabel = (focusMetric: PlatformOverviewFocusMetric): string => {
    switch (focusMetric) {
        case 'cogsPct':
            return 'COGS % pressure';
        case 'refundAmountPct':
            return 'Refund amount pressure';
        case 'refundQtyPct':
            return 'Refund quantity pressure';
        case 'tacosPct':
            return 'Ad spend pressure';
        case 'netProfit':
            return 'Net profit movement';
        case 'marginPct':
            return 'Margin quality movement';
        default:
            return `${FOCUS_LABELS[focusMetric]} movement`;
    }
};

const getContributorSupport = (item: PlatformOverviewContributor, focusMetric: PlatformOverviewFocusMetric): string => {
    const caPriceText = item.caPrice !== null ? formatSmartMoney(item.caPrice) : '-';
    switch (focusMetric) {
        case 'units':
            return `Revenue ${formatSmartMoney(item.revenue)} | CA ${caPriceText} | ASP ${formatMetricValue('asp', item.asp)}`;
        case 'cogsPct':
            return `COGS ${formatSmartMoney(item.cogs)} | Revenue ${formatSmartMoney(item.revenue)} | CA ${caPriceText}`;
        case 'refundAmountPct':
            return `Refund ${formatSmartMoney(item.refundImpact)} | Revenue ${formatSmartMoney(item.revenue)} | CA ${caPriceText}`;
        case 'refundQtyPct':
            return `Returned ${formatNumber(item.refundUnits)} | Sold ${formatNumber(item.units)} | CA ${caPriceText}`;
        case 'tacosPct':
            return `Ad ${formatSmartMoney(item.adSpend)} | Revenue ${formatSmartMoney(item.revenue)} | CA ${caPriceText}`;
        case 'netProfit':
            return `Margin ${formatMetricValue('marginPct', item.marginPct)} | Revenue ${formatSmartMoney(item.revenue)} | CA ${caPriceText}`;
        case 'marginPct':
            return `Net Profit ${formatSmartMoney(item.netProfit)} | COGS ${formatMetricValue('cogsPct', item.cogsPct)}`;
        default:
            return `Revenue ${formatSmartMoney(item.revenue)} | CA ${caPriceText} | Units ${formatNumber(item.units)}`;
    }
};

const getContributorTableHeaders = (focusMetric: PlatformOverviewFocusMetric): Array<{ key: string; label: string; align?: 'right' }> => {
    return [
        { key: 'sku', label: 'SKU' },
        { key: 'product', label: 'Product' },
        { key: 'delta', label: `Delta ${FOCUS_LABELS[focusMetric]}`, align: 'right' },
        { key: 'metric', label: FOCUS_LABELS[focusMetric], align: 'right' },
        { key: 'context', label: 'Context', align: 'right' }
    ];
};

const formatLedgerCell = (value: number | null): string => value === null ? '-' : formatSmartMoney(value);

const formatLedgerUnits = (value: number | null): string => value === null ? '-' : formatNumber(value);

const LedgerRow: React.FC<{ entry: PlatformOverviewLedgerEntry }> = ({ entry }) => (
    <tr className="border-b border-gray-100 last:border-b-0">
        <td className="p-2 text-gray-700">{entry.dateKey}</td>
        <td className="p-2 text-gray-700">{entry.type}</td>
        <td className="p-2 text-gray-500">{entry.orderId || '-'}</td>
        <td className="p-2 text-right text-gray-700">{formatLedgerCell(entry.revenue)}</td>
        <td className="p-2 text-right text-gray-700">{formatLedgerCell(entry.caPrice)}</td>
        <td className="p-2 text-right text-gray-700">{formatLedgerUnits(entry.units)}</td>
        <td className="p-2 text-right text-gray-700">{formatLedgerCell(entry.cogs)}</td>
        <td className="p-2 text-right text-gray-700">{formatLedgerCell(entry.adSpend)}</td>
        <td className="p-2 text-right text-gray-700">{formatLedgerCell(entry.refundImpact)}</td>
        <td className="p-2 text-gray-500">{entry.note || '-'}</td>
    </tr>
);

const getCategoryColumns = (focusMetric: PlatformOverviewFocusMetric): Array<{ label: string; align?: 'right'; render: (item: PlatformOverviewCategorySummary) => string }> => {
    switch (focusMetric) {
        case 'units':
            return [
                { label: 'Units', align: 'right', render: (item) => formatNumber(item.units) },
                { label: 'Revenue', align: 'right', render: (item) => formatSmartMoney(item.revenue) },
                { label: 'CA Price', align: 'right', render: (item) => item.caPrice !== null ? formatSmartMoney(item.caPrice) : '-' },
                { label: 'ASP', align: 'right', render: (item) => formatMetricValue('asp', item.asp) }
            ];
        case 'cogsPct':
            return [
                { label: 'COGS %', align: 'right', render: (item) => formatMetricValue('cogsPct', item.cogsPct) },
                { label: 'COGS', align: 'right', render: (item) => formatSmartMoney(item.cogs) },
                { label: 'Revenue', align: 'right', render: (item) => formatSmartMoney(item.revenue) },
                { label: 'CA Price', align: 'right', render: (item) => item.caPrice !== null ? formatSmartMoney(item.caPrice) : '-' }
            ];
        case 'refundAmountPct':
            return [
                { label: 'Refund Amt %', align: 'right', render: (item) => formatMetricValue('refundAmountPct', item.refundAmountPct) },
                { label: 'Refund Impact', align: 'right', render: (item) => formatSmartMoney(item.refundImpact) },
                { label: 'Revenue', align: 'right', render: (item) => formatSmartMoney(item.revenue) },
                { label: 'CA Price', align: 'right', render: (item) => item.caPrice !== null ? formatSmartMoney(item.caPrice) : '-' }
            ];
        case 'refundQtyPct':
            return [
                { label: 'Refund Qty %', align: 'right', render: (item) => formatMetricValue('refundQtyPct', item.refundQtyPct) },
                { label: 'Returned', align: 'right', render: (item) => formatNumber(item.refundUnits) },
                { label: 'Sold', align: 'right', render: (item) => formatNumber(item.units) }
            ];
        case 'tacosPct':
            return [
                { label: 'Ad Spend %', align: 'right', render: (item) => formatMetricValue('tacosPct', item.tacosPct) },
                { label: 'Ad Spend', align: 'right', render: (item) => formatSmartMoney(item.adSpend) },
                { label: 'Revenue', align: 'right', render: (item) => formatSmartMoney(item.revenue) },
                { label: 'CA Price', align: 'right', render: (item) => item.caPrice !== null ? formatSmartMoney(item.caPrice) : '-' }
            ];
        case 'netProfit':
            return [
                { label: 'Net Profit', align: 'right', render: (item) => formatSmartMoney(item.netProfit) },
                { label: 'Margin %', align: 'right', render: (item) => formatMetricValue('marginPct', item.marginPct) },
                { label: 'Revenue', align: 'right', render: (item) => formatSmartMoney(item.revenue) },
                { label: 'CA Price', align: 'right', render: (item) => item.caPrice !== null ? formatSmartMoney(item.caPrice) : '-' }
            ];
        case 'marginPct':
            return [
                { label: 'Margin %', align: 'right', render: (item) => formatMetricValue('marginPct', item.marginPct) },
                { label: 'Net Profit', align: 'right', render: (item) => formatSmartMoney(item.netProfit) },
                { label: 'COGS %', align: 'right', render: (item) => formatMetricValue('cogsPct', item.cogsPct) }
            ];
        default:
            return [
                { label: 'Revenue', align: 'right', render: (item) => formatSmartMoney(item.revenue) },
                { label: 'CA Price', align: 'right', render: (item) => item.caPrice !== null ? formatSmartMoney(item.caPrice) : '-' },
                { label: 'Units', align: 'right', render: (item) => formatNumber(item.units) },
                { label: 'Net Profit', align: 'right', render: (item) => formatSmartMoney(item.netProfit) }
            ];
    }
};

const getFocusDetailMetrics = (row: PlatformOverviewWeeklyRow, focusMetric: PlatformOverviewFocusMetric) => {
    switch (focusMetric) {
        case 'units':
            return [
                { label: 'Units', metric: 'units' as PlatformOverviewFocusMetric, value: row.units, deltaValue: row.delta.units },
                { label: 'Revenue', metric: 'revenue' as PlatformOverviewFocusMetric, value: row.revenue },
                { label: 'ASP', metric: 'asp' as PlatformOverviewFocusMetric, value: row.asp },
                { label: 'Net Profit', metric: 'netProfit' as PlatformOverviewFocusMetric, value: row.netProfit }
            ];
        case 'cogsPct':
            return [
                { label: 'COGS %', metric: 'cogsPct' as PlatformOverviewFocusMetric, value: row.cogsPct, deltaValue: row.delta.cogsPct },
                { label: 'COGS', metric: 'cogs' as PlatformOverviewFocusMetric, value: row.cogs },
                { label: 'Revenue', metric: 'revenue' as PlatformOverviewFocusMetric, value: row.revenue },
                { label: 'ASP', metric: 'asp' as PlatformOverviewFocusMetric, value: row.asp }
            ];
        case 'refundAmountPct':
            return [
                { label: 'Refund Amount %', metric: 'refundAmountPct' as PlatformOverviewFocusMetric, value: row.refundAmountPct, deltaValue: row.delta.refundAmountPct },
                { label: 'Refund Impact', metric: 'refundImpact' as PlatformOverviewFocusMetric, value: row.refundImpact },
                { label: 'Revenue', metric: 'revenue' as PlatformOverviewFocusMetric, value: row.revenue },
                { label: 'Units', metric: 'units' as PlatformOverviewFocusMetric, value: row.units }
            ];
        case 'refundQtyPct':
            return [
                { label: 'Refund Qty %', metric: 'refundQtyPct' as PlatformOverviewFocusMetric, value: row.refundQtyPct, deltaValue: row.delta.refundQtyPct },
                { label: 'Returned Units', metric: 'units' as PlatformOverviewFocusMetric, value: row.refundUnits },
                { label: 'Sold Units', metric: 'units' as PlatformOverviewFocusMetric, value: row.units },
                { label: 'Refund Impact', metric: 'refundImpact' as PlatformOverviewFocusMetric, value: row.refundImpact }
            ];
        case 'tacosPct':
            return [
                { label: 'Ad Spend %', metric: 'tacosPct' as PlatformOverviewFocusMetric, value: row.tacosPct, deltaValue: row.delta.tacosPct },
                { label: 'Ad Spend', metric: 'adSpend' as PlatformOverviewFocusMetric, value: row.adSpend },
                { label: 'Revenue', metric: 'revenue' as PlatformOverviewFocusMetric, value: row.revenue },
                { label: 'Net Profit', metric: 'netProfit' as PlatformOverviewFocusMetric, value: row.netProfit }
            ];
        case 'netProfit':
            return [
                { label: 'Net Profit', metric: 'netProfit' as PlatformOverviewFocusMetric, value: row.netProfit, deltaValue: row.delta.netProfit },
                { label: 'Margin %', metric: 'marginPct' as PlatformOverviewFocusMetric, value: row.marginPct },
                { label: 'Revenue', metric: 'revenue' as PlatformOverviewFocusMetric, value: row.revenue },
                { label: 'COGS %', metric: 'cogsPct' as PlatformOverviewFocusMetric, value: row.cogsPct }
            ];
        case 'marginPct':
            return [
                { label: 'Margin %', metric: 'marginPct' as PlatformOverviewFocusMetric, value: row.marginPct, deltaValue: row.delta.marginPct },
                { label: 'Net Profit', metric: 'netProfit' as PlatformOverviewFocusMetric, value: row.netProfit },
                { label: 'Revenue', metric: 'revenue' as PlatformOverviewFocusMetric, value: row.revenue },
                { label: 'COGS %', metric: 'cogsPct' as PlatformOverviewFocusMetric, value: row.cogsPct }
            ];
        default:
            return [
                { label: FOCUS_LABELS[focusMetric], metric: focusMetric, value: row[focusMetric], deltaValue: row.delta[focusMetric] },
                { label: 'Revenue', metric: 'revenue' as PlatformOverviewFocusMetric, value: row.revenue },
                { label: 'Units', metric: 'units' as PlatformOverviewFocusMetric, value: row.units },
                { label: 'Net Profit', metric: 'netProfit' as PlatformOverviewFocusMetric, value: row.netProfit }
            ];
    }
};

const SummaryTile: React.FC<{ label: string; value: string; icon: React.ReactNode }> = ({ label, value, icon }) => (
    <div className="bg-custom-glass backdrop-blur-custom border border-custom-glass rounded-xl px-4 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-3">
            <div>
                <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{label}</div>
                <div className="text-lg font-black text-gray-900 mt-1">{value}</div>
            </div>
            <div className="text-gray-400">{icon}</div>
        </div>
    </div>
);

const CategoryRow: React.FC<{
    item: PlatformOverviewCategorySummary;
    focusMetric: PlatformOverviewFocusMetric;
}> = ({ item, focusMetric }) => {
    const columns = getCategoryColumns(focusMetric);
    return (
        <tr>
            <td className="p-3 font-semibold text-gray-800">{item.name}</td>
            {columns.map(column => (
                <td key={column.label} className={`p-3 ${column.align === 'right' ? 'text-right' : ''} text-gray-700`}>
                    {column.render(item)}
                </td>
            ))}
        </tr>
    );
};

export const PlatformOverviewTab: React.FC<PlatformOverviewTabProps> = ({
    pricingRules,
    themeColor,
    summary,
    rows,
    focusMetric,
    setFocusMetric,
    sort,
    setSort,
    platformOptions,
    selectedPlatformKey,
    setSelectedPlatformKey,
    selectedRowId,
    setSelectedRowId,
    selectedRow,
    detail,
    auditRows,
    startKey = '',
    endKey = '',
    isAuditVisible
}) => {
    const handleMetricSort = (metric: PlatformOverviewFocusMetric) => (nextSort: SortState<PlatformOverviewSortKey>) => {
        setFocusMetric(metric);
        setSort(nextSort);
    };
    const focusDetailMetrics = selectedRow ? getFocusDetailMetrics(selectedRow, focusMetric) : [];
    const categoryColumns = getCategoryColumns(focusMetric);
    const contributorHeaders = getContributorTableHeaders(focusMetric);
    const [expandedContributorSku, setExpandedContributorSku] = React.useState<string | null>(null);

    React.useEffect(() => {
        setExpandedContributorSku(null);
    }, [selectedRowId, focusMetric, detail]);

    return (
        <div className="space-y-6">
            {isAuditVisible && (
                <AuditPanel
                    title="Platform Overview Audit"
                    startKey={startKey}
                    endKey={endKey}
                    rows={auditRows}
                    getDateKey={() => null}
                    getRevenue={(row) => row.revenue}
                    getQty={(row) => row.units}
                    getProfit={(row) => row.profit}
                    getAdSpend={(row) => row.adSpend}
                    distinctDaysCount={startKey && endKey
                        ? Math.round((new Date(endKey).getTime() - new Date(startKey).getTime()) / 86400000) + 1
                        : 0}
                />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-3">
                <SummaryTile label="Revenue" value={formatSmartMoney(summary.revenue)} icon={<TrendingUp className="w-4 h-4" />} />
                <SummaryTile label="Net Profit" value={formatSmartMoney(summary.netProfit)} icon={<Activity className="w-4 h-4" />} />
                <SummaryTile label="Margin %" value={summary.marginPct === null ? 'N/A' : formatPct(summary.marginPct)} icon={<Layers3 className="w-4 h-4" />} />
                <SummaryTile label="COGS %" value={summary.cogsPct === null ? 'N/A' : formatPct(summary.cogsPct)} icon={<Boxes className="w-4 h-4" />} />
                <SummaryTile label="Platforms x Weeks" value={`${summary.platformCount} x ${summary.weekCount}`} icon={<CalendarRange className="w-4 h-4" />} />
            </div>

            <FilterBar
                multiSelects={[
                    {
                        key: 'platform-focus',
                        label: 'Platform Focus',
                        options: platformOptions,
                        selected: selectedPlatformKey ? [selectedPlatformKey] : [],
                        onChange: (selected) => setSelectedPlatformKey(selected.length > 0 ? selected[selected.length - 1] : null)
                    }
                ]}
                rightSlot={(
                    <div className="text-xs font-bold text-gray-500">
                        {selectedPlatformKey ? 'All available weeks, current included' : 'All platforms, last complete week'}
                    </div>
                )}
            />

            <div className="flex flex-col xl:flex-row gap-6 items-start">
                <div className={`bg-custom-glass rounded-xl shadow-lg border border-custom-glass overflow-hidden ${selectedRow ? 'w-full xl:w-[176px] xl:flex-none' : 'w-full'}`}>
                    <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex items-center justify-between gap-4">
                        <div>
                            <h3 className="font-bold text-gray-800">Weekly Platform Analysis</h3>
                            <p className="text-xs text-gray-500 mt-1">Choose a deep-dive focus from the side panel or click a metric header to retarget the delta column. {TAX_NOTE_SHORT}</p>
                        </div>
                        <div className="text-right">
                            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Focused Delta</div>
                            <div className="text-sm font-black text-gray-900">{FOCUS_LABELS[focusMetric]}</div>
                        </div>
                    </div>

                    <div className={selectedRow ? 'overflow-x-auto xl:max-h-[860px]' : 'overflow-x-auto'}>
                        <table className="tbl w-full text-left text-sm whitespace-nowrap">
                            <thead className="sticky top-0">
                                <tr>
                                    <SortableHeader label="Week" sortKey="weekStartKey" sort={sort} onChange={setSort as any} />
                                    <SortableHeader label="Platform" sortKey="platform" sort={sort} onChange={setSort as any} />
                                    {METRIC_META.map(metric => (
                                        <SortableHeader
                                            key={metric.key}
                                            label={metric.label}
                                            sortKey={metric.key}
                                            sort={sort}
                                            onChange={handleMetricSort(metric.key) as any}
                                            align={metric.align}
                                            tint={metric.tint}
                                        />
                                    ))}
                                    <SortableHeader
                                        label={`Delta ${FOCUS_LABELS[focusMetric]}`}
                                        sortKey="focusDelta"
                                        sort={sort}
                                        onChange={setSort as any}
                                        align="right"
                                    />
                                </tr>
                            </thead>
                            <tbody>
                                {rows.map(row => {
                                    const rule = pricingRules[row.platform];
                                    const isSelected = selectedRowId === row.id;
                                    return (
                                        <tr
                                            key={row.id}
                                            className={`cursor-pointer ${isSelected ? 'bg-theme-10/60' : ''}`}
                                            onClick={() => setSelectedRowId(isSelected ? null : row.id)}
                                        >
                                            <td className="p-3">
                                                <div className="font-semibold text-gray-800">{row.weekLabel}</div>
                                                <div className="text-[11px] text-gray-400">ISO week</div>
                                            </td>
                                            <td className="p-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-black text-white shadow-sm" style={{ backgroundColor: rule?.color || themeColor }}>
                                                        {row.platform[0]}
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="font-bold text-gray-900 truncate">{row.platform}</div>
                                                        <div className="text-[11px] text-gray-400 truncate">{rule?.manager || 'Unassigned'}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            {METRIC_META.map(metric => (
                                                <td key={metric.key} className="p-3 text-right text-gray-700">
                                                    <span className={metric.key === 'netProfit' ? 'font-bold text-gray-900' : ''}>
                                                        {formatMetricValue(metric.key, row[metric.key])}
                                                    </span>
                                                </td>
                                            ))}
                                            <td className={`p-3 text-right font-bold ${deltaClassName(focusMetric, row.delta[focusMetric])}`}>
                                                {formatDeltaValue(focusMetric, row.delta[focusMetric])}
                                            </td>
                                        </tr>
                                    );
                                })}
                                {rows.length === 0 && (
                                    <tr>
                                        <td className="p-6 text-center text-sm text-gray-400" colSpan={METRIC_META.length + 3}>
                                            No weekly platform data in the selected scope.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>

                {selectedRow && (
                    <div className="w-full xl:flex-1 space-y-6">
                        <div className="bg-custom-glass rounded-xl border border-custom-glass shadow-lg overflow-hidden">
                            <div className="p-4 border-b border-custom-glass bg-gray-50/50 flex items-center justify-between">
                                <div>
                                    <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{selectedRow.platform}</div>
                                    <h3 className="font-bold text-gray-900 text-sm mt-1">Deep Dive Focus</h3>
                                    <p className="text-xs text-gray-500 mt-1">{selectedRow.weekLabel}</p>
                                </div>
                                <button onClick={() => setSelectedRowId(null)} className="p-1 hover:bg-gray-200 rounded-full text-gray-400 transition-colors">
                                    <X className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="p-4 space-y-4">
                                <div className="grid grid-cols-2 gap-2">
                                    {FOCUS_OPTIONS.map(option => {
                                        const isActive = option.key === focusMetric;
                                        return (
                                            <button
                                                key={option.key}
                                                onClick={() => setFocusMetric(option.key)}
                                                className={`text-left rounded-lg border px-3 py-2 transition-colors ${isActive ? 'bg-theme-10 border-theme-20 shadow-sm' : 'bg-white/70 border-gray-200 hover:bg-white'}`}
                                            >
                                                <div className={`text-xs font-black ${isActive ? 'text-theme' : 'text-gray-800'}`}>{option.label}</div>
                                                <div className="text-[10px] text-gray-500 mt-1 leading-tight">{option.hint}</div>
                                            </button>
                                        );
                                    })}
                                </div>

                                <div className="pt-4 border-t border-gray-100">
                                    <div className="flex items-center justify-between gap-3">
                                        <div>
                                            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Selected Investigation</div>
                                            <div className="text-sm font-black text-gray-900 mt-1">{FOCUS_LABELS[focusMetric]}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Weekly Delta</div>
                                            <div className={`text-sm font-black mt-1 ${deltaClassName(focusMetric, selectedRow.delta[focusMetric])}`}>
                                                {formatDeltaValue(focusMetric, selectedRow.delta[focusMetric])}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-xs text-gray-500 mt-3 leading-relaxed">{getFocusDriverNote(focusMetric)}</p>
                                </div>

                                <div className="grid grid-cols-2 gap-3 pt-4 border-t border-gray-100">
                                    {focusDetailMetrics.map(item => (
                                        <div key={item.label}>
                                            <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{item.label}</div>
                                            <div className="text-sm font-bold text-gray-700 mt-1">{formatMetricValue(item.metric, item.value as number | null)}</div>
                                            {item.deltaValue !== undefined && (
                                                <div className={`text-[11px] font-bold mt-1 ${deltaClassName(item.metric, item.deltaValue)}`}>
                                                    {formatDeltaValue(item.metric, item.deltaValue)}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="bg-custom-glass rounded-xl border border-custom-glass shadow-lg overflow-hidden">
                            <div className="p-4 border-b border-custom-glass bg-gray-50/50">
                                <h3 className="font-bold text-gray-900 text-sm">Top SKU Contributors</h3>
                                <p className="text-xs text-gray-500 mt-1">Ranked by {getFocusContributionLabel(focusMetric)} for the selected week.</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="tbl w-full text-sm">
                                    <thead>
                                        <tr>
                                            {contributorHeaders.map(header => (
                                                <th key={header.key} className={header.align === 'right' ? 'r' : ''}>{header.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail && detail.contributors.length > 0 ? (
                                            detail.contributors.map(item => {
                                                const isExpanded = expandedContributorSku === item.sku;
                                                return (
                                                    <React.Fragment key={item.sku}>
                                                        <tr
                                                            className={`border-b border-gray-100 cursor-pointer transition-colors ${isExpanded ? 'bg-theme-10/40' : 'hover:bg-gray-50/70'}`}
                                                            onClick={() => setExpandedContributorSku(isExpanded ? null : item.sku)}
                                                        >
                                                            <td className="p-3">
                                                                <div className="flex items-center gap-2 text-left text-gray-900 transition-colors">
                                                                    {isExpanded ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
                                                                    <span className="font-black">{item.sku}</span>
                                                                </div>
                                                            </td>
                                                            <td className="p-3 text-gray-600 min-w-[240px]">
                                                                <div className="font-medium text-gray-800">{item.productName}</div>
                                                                <div className="text-[11px] text-gray-400 mt-1">{item.category}</div>
                                                            </td>
                                                            <td className={`p-3 text-right font-bold ${deltaClassName(focusMetric, item.deltaValue)}`}>
                                                                {formatDeltaValue(focusMetric, item.deltaValue)}
                                                            </td>
                                                            <td className="p-3 text-right font-semibold text-gray-700">
                                                                {formatMetricValue(focusMetric, item[focusMetric])}
                                                            </td>
                                                            <td className="p-3 text-right text-[11px] text-gray-500">
                                                                {getContributorSupport(item, focusMetric)}
                                                            </td>
                                                        </tr>
                                                        {isExpanded && (
                                                            <tr>
                                                                <td className="p-0 bg-gray-50/70" colSpan={contributorHeaders.length}>
                                                                    <div className="px-3 py-3 border-b border-gray-100">
                                                                        <div className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mb-2">Current Week Ledger</div>
                                                                        <div className="overflow-x-auto">
                                                                            <table className="w-full text-xs">
                                                                                <thead>
                                                                                    <tr className="text-gray-400">
                                                                                        <th className="p-2 text-left font-bold">Date</th>
                                                                                        <th className="p-2 text-left font-bold">Type</th>
                                                                                        <th className="p-2 text-left font-bold">Order ID</th>
                                                                                        <th className="p-2 text-right font-bold">Revenue</th>
                                                                                        <th className="p-2 text-right font-bold">CA Price</th>
                                                                                        <th className="p-2 text-right font-bold">Units</th>
                                                                                        <th className="p-2 text-right font-bold">COGS</th>
                                                                                        <th className="p-2 text-right font-bold">Ad Spend</th>
                                                                                        <th className="p-2 text-right font-bold">Refund</th>
                                                                                        <th className="p-2 text-left font-bold">Note</th>
                                                                                    </tr>
                                                                                </thead>
                                                                                <tbody>
                                                                                    {item.ledgerEntries.length > 0 ? (
                                                                                        item.ledgerEntries.map(entry => <LedgerRow key={entry.id} entry={entry} />)
                                                                                    ) : (
                                                                                        <tr>
                                                                                            <td className="p-2 text-gray-400 italic" colSpan={10}>No ledger rows in the selected week.</td>
                                                                                        </tr>
                                                                                    )}
                                                                                </tbody>
                                                                            </table>
                                                                        </div>
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                    </React.Fragment>
                                                );
                                            })
                                        ) : (
                                            <tr>
                                                <td className="p-4 text-xs text-gray-400 italic" colSpan={contributorHeaders.length}>No SKU contributors in this week.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <div className="bg-custom-glass rounded-xl border border-custom-glass shadow-lg overflow-hidden">
                            <div className="p-4 border-b border-custom-glass bg-gray-50/50">
                                <h3 className="font-bold text-gray-900 text-sm">Top Categories</h3>
                                <p className="text-xs text-gray-500 mt-1">Category view tuned to {FOCUS_LABELS[focusMetric]}.</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="tbl w-full text-sm">
                                    <thead>
                                        <tr>
                                            <th>Category</th>
                                            {categoryColumns.map(column => (
                                                <th key={column.label} className={column.align === 'right' ? 'r' : ''}>{column.label}</th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {detail && detail.categories.length > 0 ? (
                                            detail.categories.map(item => <CategoryRow key={item.name} item={item} focusMetric={focusMetric} />)
                                        ) : (
                                            <tr>
                                                <td className="p-4 text-xs text-gray-400 italic" colSpan={categoryColumns.length + 1}>No category data in this week.</td>
                                            </tr>
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
