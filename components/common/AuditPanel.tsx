import React, { useMemo } from 'react';
import { Activity } from 'lucide-react';
import { marginPct, tacosPct, toNumber } from '../../services/metrics';

interface AuditPanelProps<T> {
  title: string;
  startKey: string;
  endKey: string;
  rows: T[];
  getDateKey: (row: T) => string | null | undefined;
  getRevenue: (row: T) => number | null | undefined;
  getQty: (row: T) => number | null | undefined;
  getProfit: (row: T) => number | null | undefined;
  getAdSpend: (row: T) => number | null | undefined;
  distinctDaysCount?: number;
}

const AuditPanel = <T,>({
  title,
  startKey,
  endKey,
  rows,
  getDateKey,
  getRevenue,
  getQty,
  getProfit,
  getAdSpend,
  distinctDaysCount: overrideDistinctDays
}: AuditPanelProps<T>) => {
    
    const stats = useMemo(() => {
        const distinctDays = new Set<string>();
        let totalRevenue = 0;
        let totalQty = 0;
        let totalProfit = 0;
        let totalAdSpend = 0;
        let profitPresentCount = 0;

        for (const row of rows) {
            const dateKey = getDateKey(row);
            if (dateKey) distinctDays.add(dateKey);

            totalRevenue += toNumber(getRevenue(row));
            totalQty += toNumber(getQty(row));
            
            const profit = getProfit(row);
            if (profit !== undefined && profit !== null && !Number.isNaN(profit)) {
                totalProfit += toNumber(profit);
                profitPresentCount++;
            }
            
            totalAdSpend += toNumber(getAdSpend(row));
        }

        const profitCoverage = rows.length > 0 ? (profitPresentCount / rows.length) * 100 : 0;
        const effectiveMargin = marginPct(totalProfit, totalRevenue);
        const effectiveTacos = tacosPct(totalAdSpend, totalRevenue);

        return {
            rowCount: rows.length,
            distinctDaysCount: overrideDistinctDays !== undefined ? overrideDistinctDays : distinctDays.size,
            totalRevenue,
            totalQty,
            totalProfit,
            totalAdSpend,
            profitPresentCount,
            profitCoverage,
            effectiveMargin,
            effectiveTacos
        };
    }, [rows, getDateKey, getRevenue, getQty, getProfit, getAdSpend, overrideDistinctDays]);
    
    const format = (val: number, isCurrency = false) => {
        if (isCurrency) return `£${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        return val.toLocaleString();
    };

    return (
        <div className="space-y-2 bg-white/50 p-3 rounded-lg border border-gray-200">
            <h4 className="font-semibold text-theme flex items-center gap-2"><Activity className="w-4 h-4" /> {title}</h4>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-gray-600">
                <dt>Date Range:</dt><dd className="font-mono font-medium text-gray-900">{startKey} → {endKey}</dd>
                <dt>Row Count:</dt><dd className="font-mono font-medium text-gray-900">{stats.rowCount}</dd>
                <dt>Distinct Days:</dt><dd className="font-mono font-medium text-gray-900">{stats.distinctDaysCount}</dd>
                
                <dt className="mt-1 border-t pt-1">Revenue Sum:</dt><dd className="font-mono font-medium text-gray-900 mt-1 border-t pt-1">{format(stats.totalRevenue, true)}</dd>
                <dt>Qty Sum:</dt><dd className="font-mono font-medium text-gray-900">{format(stats.totalQty)}</dd>
                <dt>Profit Sum:</dt><dd className="font-mono font-medium text-gray-900">{format(stats.totalProfit, true)}</dd>
                <dt>Ad Spend Sum:</dt><dd className="font-mono font-medium text-gray-900">{format(stats.totalAdSpend, true)}</dd>

                <dt className="mt-1 border-t pt-1">Profit Coverage:</dt><dd className="font-mono font-medium text-gray-900 mt-1 border-t pt-1">{stats.profitPresentCount} / {stats.rowCount} ({stats.profitCoverage.toFixed(0)}%)</dd>
                <dt>Effective Margin:</dt><dd className="font-mono font-medium text-gray-900">{stats.effectiveMargin !== null ? `${stats.effectiveMargin.toFixed(1)}%` : '—'}</dd>
                <dt>Effective TACoS:</dt><dd className="font-mono font-medium text-gray-900">{stats.effectiveTacos !== null ? `${stats.effectiveTacos.toFixed(1)}%` : '—'}</dd>
            </dl>
        </div>
    );
};

export default AuditPanel;