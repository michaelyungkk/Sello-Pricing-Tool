
import React from 'react';
import AuditPanel from '../../AuditPanel';
import { VAT_MULTIPLIER } from '../../../constants';

interface AuditReconciliationPanelProps {
    isVisible: boolean;
    auditStats: any;
    startKey: string;
    endKey: string;
    rows: any[];
}

export const AuditReconciliationPanel: React.FC<AuditReconciliationPanelProps> = ({ isVisible, auditStats, startKey, endKey, rows }) => {
    if (!isVisible || !auditStats) return null;

    return (
        <div className="bg-gray-50/50 p-4 rounded-xl border border-gray-200/80 space-y-4 animate-in fade-in slide-in-from-top-2">
            <AuditPanel
                title={`Audit & Reconciliation Panel (${auditStats.productCount} Products)`}
                startKey={startKey}
                endKey={endKey}
                rows={rows}
                getDateKey={(row: any) => null} // Pre-filtered, date key check redundant
                getRevenue={(row: any) => row.recentTotalSales / VAT_MULTIPLIER}
                getQty={(row: any) => row.recentTotalQty}
                getProfit={(row: any) => row.totalProfit}
                getAdSpend={(row: any) => 0}
                distinctDaysCount={auditStats.local.distinctDaysCount}
            />
        </div>
    );
};
