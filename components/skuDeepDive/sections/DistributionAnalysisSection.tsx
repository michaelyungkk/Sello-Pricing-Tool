
import React from 'react';
import { BarChart2, Rows, LayoutGrid, Megaphone } from 'lucide-react';
import { BoxPlot } from '../charts/BoxPlot';

interface DistributionAnalysisSectionProps {
    analytics: any;
    tacosStats: any;
    chartLayout: 'horizontal' | 'vertical';
    setChartLayout: (l: 'horizontal' | 'vertical') => void;
    tooltip: any;
    setTooltip: (t: any) => void;
    thresholds: any;
    themeColor: string;
}

export const DistributionAnalysisSection: React.FC<DistributionAnalysisSectionProps> = ({
    analytics,
    tacosStats,
    chartLayout,
    setChartLayout,
    tooltip,
    setTooltip,
    thresholds
}) => {
    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                    <BarChart2 className="w-5 h-5 text-indigo-600" />
                    Distribution Analysis
                    <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded ml-2">Performance Distributions</span>
                </h3>
                <div className="flex bg-gray-100 p-1 rounded-lg">
                    <button
                        onClick={() => setChartLayout('horizontal')}
                        className={`px-3 py-1.5 text-[10px] font-bold rounded-md transition-all flex items-center gap-1 ${chartLayout === 'horizontal' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                    >
                        <Rows className="w-3 h-3" /> Horizontal
                    </button>
                    <button
                        onClick={() => setChartLayout('vertical')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${chartLayout === 'vertical' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                    >
                        <LayoutGrid className="w-3 h-3" /> Vertical
                    </button>
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <div className={chartLayout === 'vertical' ? 'h-96' : ''}>
                    <BoxPlot
                        title="Revenue per Order"
                        stats7={analytics.revenue.d7}
                        stats30={analytics.revenue.d30}
                        stats90={analytics.revenue.d90}
                        format={(v: number) => `£${v.toFixed(0)}`}
                        color="#3b82f6"
                        layout={chartLayout}
                        tooltip={tooltip}
                        setTooltip={setTooltip}
                    />
                </div>
                <div className={chartLayout === 'vertical' ? 'h-96' : ''}>
                    <BoxPlot
                        title="Net Profit Margin"
                        stats7={analytics.margin.d7}
                        stats30={analytics.margin.d30}
                        stats90={analytics.margin.d90}
                        format={(v: number) => `${v.toFixed(1)}%`}
                        color="#10b981"
                        layout={chartLayout}
                        tooltip={tooltip}
                        setTooltip={setTooltip}
                    />
                </div>
                <div className={chartLayout === 'vertical' ? 'h-96' : ''}>
                    <BoxPlot
                        title="Daily Units Sold"
                        stats7={analytics.qty.d7}
                        stats30={analytics.qty.d30}
                        stats90={analytics.qty.d90}
                        format={(v: number) => v.toFixed(0)}
                        color="#8b5cf6"
                        layout={chartLayout}
                        tooltip={tooltip}
                        setTooltip={setTooltip}
                    />
                </div>
                <div className={chartLayout === 'vertical' ? 'h-96' : ''}>
                    <BoxPlot
                        title="Ad Spend / TACoS"
                        stats7={analytics.tacos.d7}
                        stats30={analytics.tacos.d30}
                        stats90={analytics.tacos.d90}
                        format={(v: number) => `${v.toFixed(1)}%`}
                        color="#f97316"
                        layout={chartLayout}
                        showAdOnlyFooter={true}
                        adOnly7={tacosStats.d7.adOnlySpend}
                        tooltip={tooltip}
                        setTooltip={setTooltip}
                    />
                </div>
            </div>

            <div className="bg-custom-glass backdrop-blur-custom p-4 rounded-xl border border-custom-glass shadow-sm select-none">
                <h4 className="text-xs font-bold text-gray-500 uppercase mb-3 flex items-center gap-2">
                    <Megaphone className="w-3 h-3 text-orange-500" /> Advertising Efficiency (TACoS)
                </h4>
                <div className="grid grid-cols-3 gap-4 text-center divide-x divide-gray-100">
                    <div>
                        <div className={`text-xl font-bold ${typeof tacosStats.d7.tacosPct === 'number' && tacosStats.d7.tacosPct > thresholds.highAdDependencyPct ? 'text-red-500' : 'text-gray-800'}`}>
                            {typeof tacosStats.d7.tacosPct === 'number' ? `${tacosStats.d7.tacosPct.toFixed(1)}%` : tacosStats.d7.tacosPct}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">7 Days</div>
                    </div>
                    <div>
                        <div className={`text-xl font-bold ${typeof tacosStats.d30.tacosPct === 'number' && tacosStats.d30.tacosPct > thresholds.highAdDependencyPct ? 'text-red-500' : 'text-gray-800'}`}>
                            {typeof tacosStats.d30.tacosPct === 'number' ? `${tacosStats.d30.tacosPct.toFixed(1)}%` : tacosStats.d30.tacosPct}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">30 Days</div>
                    </div>
                    <div>
                        <div className={`text-xl font-bold ${typeof tacosStats.d90.tacosPct === 'number' && tacosStats.d90.tacosPct > thresholds.highAdDependencyPct ? 'text-red-500' : 'text-gray-800'}`}>
                            {typeof tacosStats.d90.tacosPct === 'number' ? `${tacosStats.d90.tacosPct.toFixed(1)}%` : tacosStats.d90.tacosPct}
                        </div>
                        <div className="text-xs text-gray-500 mt-1">90 Days</div>
                    </div>
                </div>
                <p className="text-[10px] text-gray-400 mt-3 text-center italic">
                    Total Ad Spend / Total Sales Revenue. Includes ad-only spend.
                </p>
            </div>
        </div>
    );
};
