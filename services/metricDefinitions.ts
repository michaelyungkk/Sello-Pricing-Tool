export interface MetricDefinition {
    title: string;
    formula: string;
    source: string;
    windowLabel?: string;
}

export type MetricDefinitionKey =
    | 'optimalPriceTarget'
    | 'lifetimeNetMargin'
    | 'returnQtyRate'
    | 'returnAmountRate'
    | 'runway'
    | 'tacos'
    | 'totalAdSpend'
    | 'adSales'
    | 'broadRoas'
    | 'directRoas'
    | 'spendSalesRatio'
    | 'avgUtilisation'
    | 'globalAdRoi'
    | 'adDelta'
    | 'reconciliation'
    | 'trueNetProfit';

export const getMetricDefinition = (key: MetricDefinitionKey, windowLabel?: string): MetricDefinition => {
    const w = windowLabel || 'Selected period';
    const defs: Record<MetricDefinitionKey, MetricDefinition> = {
        optimalPriceTarget: {
            title: 'Optimal Price Target',
            formula: 'Price that maximizes estimated daily profit from observed price-performance history.',
            source: 'Transaction history and benchmark blending',
            windowLabel: 'All available eligible history'
        },
        lifetimeNetMargin: {
            title: 'Lifetime Net Margin',
            formula: '(Net Profit / Net Sales) * 100',
            source: 'All-time sales and refund-adjusted profit',
            windowLabel: 'Lifetime'
        },
        returnQtyRate: {
            title: 'Return QTY %',
            formula: '(Total Returns / Lifetime Sold) * 100',
            source: 'Refund log quantities matched to SKU',
            windowLabel: 'Lifetime'
        },
        returnAmountRate: {
            title: 'Return AMT %',
            formula: '(Total Return Value / Lifetime Gross Sales) * 100',
            source: 'Refund values plus freight against gross sales',
            windowLabel: 'Lifetime'
        },
        runway: {
            title: 'Runway',
            formula: 'On-hand inventory / daily velocity',
            source: 'Inventory snapshot and sales velocity',
            windowLabel: w
        },
        tacos: {
            title: 'TACoS %',
            formula: '(Ad Spend / Revenue) * 100',
            source: 'Sales ledger revenue and ad spend totals',
            windowLabel: w
        },
        totalAdSpend: {
            title: 'Total Ad Spend',
            formula: 'Sum of ad spend fields including ad-only rows',
            source: 'Sales ledger ad spend columns',
            windowLabel: w
        },
        adSales: {
            title: 'Ad Sales',
            formula: 'Sum of sales attributed to ad activity',
            source: 'Ad campaign performance rows',
            windowLabel: w
        },
        broadRoas: {
            title: 'Broad ROAS',
            formula: 'Attributed Sales / Ad Spend',
            source: 'Ad campaign performance rows',
            windowLabel: w
        },
        directRoas: {
            title: 'Direct ROAS',
            formula: 'Direct Conversion Sales / Ad Spend',
            source: 'Ad campaign direct conversion fields',
            windowLabel: w
        },
        spendSalesRatio: {
            title: 'Spend / Sales',
            formula: '(Ad Spend / Sales) * 100',
            source: 'Ad campaign performance rows',
            windowLabel: w
        },
        avgUtilisation: {
            title: 'Avg Utilisation',
            formula: 'Average budget utilisation across campaign groups',
            source: 'Campaign-level utilisation fields',
            windowLabel: w
        },
        globalAdRoi: {
            title: 'Global Ad ROI',
            formula: 'Net Profit after ads / Ad Spend',
            source: 'Platform ROI rollup',
            windowLabel: w
        },
        adDelta: {
            title: 'Ad Delta',
            formula: 'Adjusted Ad Spend - Raw Ad Spend',
            source: 'Transaction-level ad redistribution logic',
            windowLabel: w
        },
        reconciliation: {
            title: 'Reconciliation',
            formula: 'Residual needed so waterfall closes to reported net profit',
            source: 'Order-level uploaded net profit and tracked cost fields',
            windowLabel: w
        },
        trueNetProfit: {
            title: 'True Net Profit',
            formula: 'Revenue minus tracked costs and refunds',
            source: 'Sales and refund ledgers',
            windowLabel: w
        }
    };
    return defs[key];
};
