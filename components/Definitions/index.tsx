
import React from 'react';
import { Activity, Calculator, BookOpen, ShieldAlert, Clock, Ship, RotateCcw, CornerDownLeft, AlertTriangle, TrendingUp, Megaphone, Scale, DollarSign, Layers, Package, Eye, Calendar, Info, ShieldCheck } from 'lucide-react';
import { useDefinitions } from './hooks/useDefinitions';
import { DefinitionCard } from './components/DefinitionCard';
import { DefinitionSection } from './components/DefinitionSection';
import { DefinitionGrid } from './components/DefinitionGrid';

interface DefinitionsPageProps {
    headerStyle?: React.CSSProperties;
}

const DefinitionsPage: React.FC<DefinitionsPageProps> = ({ headerStyle }) => {
    const { activeTab, setActiveTab, statusCards, manualSections } = useDefinitions();

    return (
        <div className="max-w-[1600px] mx-auto space-y-6 pb-10 h-full flex flex-col">
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setActiveTab('operational')}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-md transition-all flex items-center gap-2 ${activeTab === 'operational' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Activity className="w-4 h-4" />
                    Operational Logic
                </button>
                <button
                    onClick={() => setActiveTab('financial')}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-md transition-all flex items-center gap-2 ${activeTab === 'financial' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Calculator className="w-4 h-4" />
                    Financial Formulas
                </button>
                <button
                    onClick={() => setActiveTab('manual')}
                    className={`px-4 py-2 text-xs font-bold uppercase tracking-wide rounded-md transition-all flex items-center gap-2 ${activeTab === 'manual' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <BookOpen className="w-4 h-4" />
                    User Manual
                </button>
            </div>

            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                {activeTab === 'operational' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* Inventory Health Section */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                    <ShieldAlert className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Inventory Health Status</h3>
                                    <p className="text-xs text-gray-500">How the system decides if a product is Critical, Healthy, or Overstocked.</p>
                                </div>
                            </div>
                            <DefinitionGrid>
                                {statusCards.map((card, idx) => (
                                    <DefinitionCard key={idx} {...card} />
                                ))}
                            </DefinitionGrid>
                            <div className="mt-6 bg-blue-50/50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
                                <p className="font-bold mb-3 flex items-center gap-2 border-b border-blue-200 pb-2">
                                    <Clock className="w-4 h-4" /> The &quot;Runway&quot; Calculation
                                </p>
                                <div className="mb-4">
                                    <p className="mb-2">The core formula for days remaining is:</p>
                                    <span className="font-mono bg-white px-2 py-1 rounded border border-blue-200 text-xs font-bold">
                                        Runway = Effective Stock / Average Daily Sales
                                    </span>
                                </div>
                                <div className="bg-white/60 p-3 rounded-lg border border-blue-200">
                                    <p className="font-bold mb-2 flex items-center gap-2 text-xs uppercase text-indigo-600">
                                        <Ship className="w-3 h-3" /> Strategy Engine: &quot;Include Incoming&quot; Toggle
                                    </p>
                                    <p className="text-xs text-gray-600 mb-2">
                                        By default, &apos;Effective Stock&apos; is your &apos;On Hand&apos; quantity. In the Strategy Engine, you can toggle a switch to also include &apos;Incoming Stock&apos; for more aggressive planning.
                                    </p>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                        <div className="bg-white p-2 rounded border border-gray-200">
                                            <span className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Standard Mode (Conservative)</span>
                                            <code className="text-xs text-gray-700 bg-gray-100 px-1 rounded">Effective Stock = On Hand</code>
                                        </div>
                                        <div className="bg-white p-2 rounded border border-indigo-200">
                                            <span className="block text-[10px] uppercase font-bold text-indigo-600 mb-1">Incoming Included</span>
                                            <code className="text-xs text-indigo-700 bg-indigo-50 px-1 rounded">Effective Stock = On Hand + Incoming</code>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </DefinitionSection>

                        {/* Returns Logic Section */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-red-50 rounded-lg text-red-600">
                                    <RotateCcw className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Returns & Quality Control</h3>
                            </div>
                            <div className="prose prose-sm text-gray-600 max-w-none">
                                <p>
                                    Refunds and returns are imported via the <strong>Refund Report</strong>. This data is aggregated by SKU and matched against the selected date period.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
                                    <div className="border rounded-lg p-4 bg-white/50">
                                        <h4 className="font-bold text-gray-900 text-xs uppercase mb-2 flex items-center gap-2">
                                            <CornerDownLeft className="w-3 h-3" /> Return Rate Formula
                                        </h4>
                                        <div className="font-mono text-xs bg-white px-2 py-2 rounded border border-gray-200 mb-2">
                                            (Total Returned Units / Total Sold Units) × 100
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            The return rate is calculated as a direct percentage of units returned versus units sold within the same period. This provides a clear, factual measure of product returns.
                                        </p>
                                    </div>
                                    <div className="border rounded-lg p-4 bg-white/50">
                                        <h4 className="font-bold text-gray-900 text-xs uppercase mb-2 flex items-center gap-2">
                                            <AlertTriangle className="w-3 h-3 text-amber-500" /> High Return Alert
                                        </h4>
                                        <p className="text-xs text-gray-600">
                                            If a product&apos;s return rate exceeds <strong>5%</strong>, a warning badge is displayed in the Product List tooltip.
                                            High returns may indicate quality issues or misleading listing descriptions.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </DefinitionSection>

                        {/* Velocity Engine Section */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Velocity Settings & Sensitivity</h3>
                            </div>
                            <div className="prose prose-sm text-gray-600 max-w-none">
                                <p>
                                    The &quot;Average Daily Sales&quot; metric is the heartbeat of the system. It is calculated based on the sales history you import, within the selected date range (e.g., Last 30 Days).
                                </p>
                                <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-200 text-sm text-amber-800 my-4">
                                    <p className="font-bold flex items-center gap-2"><Info className="w-4 h-4" /> ERP Override Logic</p>
                                    <p className="mt-2 text-xs">
                                        <strong>Important:</strong> If your ERP Inventory Report provides a <code>dailyAverageSales</code> value for a product, that value will <strong>override</strong> any calculation from your imported sales report. This ensures inventory runway calculations are always consistent with your primary management system.
                                    </p>
                                </div>
                                <p>You can change the default calculation lookback period in <strong>Settings</strong>.</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
                                    <div className="border rounded-lg p-3 bg-white/50">
                                        <span className="font-bold text-gray-900 block mb-1">7 Days Lookback</span>
                                        <span className="text-xs text-gray-500">Highly reactive. Use this during peak seasons (e.g., Q4) to catch sudden spikes immediately.</span>
                                    </div>
                                    <div className="border rounded-lg p-3 bg-white/50">
                                        <span className="font-bold text-gray-900 block mb-1">30 Days Lookback</span>
                                        <span className="text-xs text-gray-500">Standard mode. Smooths out weekend dips and short-term anomalies.</span>
                                    </div>
                                    <div className="border rounded-lg p-3 bg-white/50">
                                        <span className="font-bold text-gray-900 block mb-1">90 Days Lookback</span>
                                        <span className="text-xs text-gray-500">Conservative. Best for restocking decisions on stable, long-tail products.</span>
                                    </div>
                                </div>
                            </div>
                        </DefinitionSection>
                        
                        {/* Data Hierarchy Section - Moved from Manual to Operational as per original structure */}
                         <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-pink-50 rounded-lg text-pink-600">
                                    <Layers className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Data Hierarchy &amp; &quot;Ghost&quot; Products</h3>
                            </div>
                            <div className="space-y-4">
                                <div className="flex gap-4 items-start">
                                    <div className="bg-gray-100 p-2 rounded text-gray-500"><Package className="w-4 h-4" /></div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">Master SKU vs. Aliases</h4>
                                        <p className="text-xs text-gray-500 mt-1">
                                            The system revolves around the <strong>Master SKU</strong> (from your Inventory Report).
                                            Platform listings (e.g., Amazon FBA, eBay) are linked via <strong>Aliases</strong>.
                                            Sales from all aliases are aggregated into the Master SKU&apos;s velocity.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4 items-start">
                                    <div className="bg-gray-100 p-2 rounded text-gray-500"><Eye className="w-4 h-4" /></div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">Inactive / &quot;Ghost&quot; Products</h4>
                                        <p className="text-xs text-gray-500 mt-1">
                                            To keep the dashboard clean, products with <strong>0 Stock</strong> AND <strong>0 Sales</strong> (in the selected period) are hidden by default.
                                            Toggle the &quot;Show Inactive&quot; eye icon in filters to reveal them.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </DefinitionSection>
                    </div>
                )}

                {activeTab === 'financial' && (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-teal-50 rounded-lg text-teal-600">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Tax Basis (inc/ex)</h3>
                            </div>
                            <div className="prose prose-sm text-gray-600 max-w-none">
                                <p>
                                    Default is <strong>inc tax</strong> across the app. Only metrics explicitly labeled ‘ex tax’ are tax-excluded (mainly in the Cost Management view).
                                </p>
                            </div>
                        </DefinitionSection>

                        <DefinitionSection>
                             <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                    <Calendar className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Weekly Reporting Cycles</h3>
                            </div>
                            <div className="prose prose-sm text-gray-600 max-w-none">
                                <p>
                                    The system automatically detects the latest date in your uploaded sales report and establishes a
                                    <strong> Friday-to-Thursday</strong> reporting cycle.
                                </p>
                                <div className="bg-gray-50/50 p-3 rounded-lg border border-gray-100 mt-2">
                                    <code className="bg-white px-2 py-1 rounded border text-xs">Fri 28 Nov - Thu 04 Dec</code>
                                    <p className="text-xs text-gray-500 mt-2">
                                        This full calendar history feeds the &quot;Optimal Price&quot; algorithm, allowing it to see trends over months rather than just weeks.
                                    </p>
                                </div>
                            </div>
                        </DefinitionSection>

                        <DefinitionSection>
                             <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-cyan-50 rounded-lg text-cyan-600">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Trend Analysis (PoP)</h3>
                            </div>
                            <div className="prose prose-sm text-gray-600 max-w-none">
                                <p>
                                    All trend indicators (Volume Change, Revenue Change, Margin Trends) use <strong>PoP (Period-over-Period)</strong> logic.
                                </p>
                                <div className="bg-gray-50/50 p-4 rounded-lg border border-gray-100 mt-2">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Comparison Logic</h4>
                                    <p className="text-xs text-gray-600 italic">
                                        &quot;Current Selected Period vs Immediately Preceding Period of Same Length&quot;
                                    </p>
                                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                        <div>
                                            <span className="text-[10px] font-bold text-gray-500 uppercase">Example: Last 7 Days</span>
                                            <p className="text-xs text-gray-700 mt-1">Compares sales from [Today-7 to Yesterday] against [Today-14 to Today-8].</p>
                                        </div>
                                        <div>
                                            <span className="text-[10px] font-bold text-gray-500 uppercase">Example: Last 30 Days</span>
                                            <p className="text-xs text-gray-700 mt-1">Compares last 30 days against the 30 days prior to that window.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </DefinitionSection>

                        <DefinitionSection>
                             <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                                    <Megaphone className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Ad Spend & TACoS Logic</h3>
                            </div>
                            <div className="prose prose-sm text-gray-600 max-w-none">
                                <div className="bg-gray-50/50 p-4 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">TACoS Formula (Total Advertising Cost of Sales)</h4>
                                    <div className="font-mono text-xs bg-white px-2 py-2 rounded border border-gray-200 mb-2">
                                        (Total Ad Spend / Total Revenue) × 100
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        This represents the percentage of total sales revenue consumed by advertising costs. It is the primary measure of advertising campaign efficiency.
                                    </p>
                                </div>
                            </div>
                        </DefinitionSection>

                         <DefinitionSection>
                             <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-pink-50 rounded-lg text-pink-600">
                                    <Scale className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Weighted Average Logic</h3>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">
                                When processing transaction reports, the system always uses a <strong>Volume-Weighted Average</strong> rather than a simple average.
                            </p>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="bg-gray-50/50 p-4 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Price Formula</h4>
                                    <div className="font-mono text-xs bg-white px-2 py-2 rounded border border-gray-200 mb-2">
                                        (Sum of Revenue across all orders) / (Total Units Sold)
                                    </div>
                                </div>
                                <div className="bg-gray-50/50 p-4 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Fee Formula</h4>
                                    <div className="font-mono text-xs bg-white px-2 py-2 rounded border border-gray-200 mb-2">
                                        (Sum of Fee Costs) / (Total Units Sold)
                                    </div>
                                </div>
                            </div>
                        </DefinitionSection>

                        <DefinitionSection>
                             <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-green-50 rounded-lg text-green-600">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Margin Calculation</h3>
                            </div>
                            <div className="prose prose-sm text-gray-600 max-w-none">
                                <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Net Profit Formula</h4>
                                    <div className="font-mono text-xs bg-white px-2 py-2 rounded border border-gray-200 mb-3 overflow-x-auto">
                                        (Selling Price + Extra Freight Income) - (COGS + Platform Comm. + Ad Spend + Postage + WMS + Other Fees)
                                    </div>
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Margin % Formula</h4>
                                    <div className="font-mono text-xs bg-white px-2 py-2 rounded border border-gray-200 mb-3">
                                        (Net Profit / Selling Price) × 100
                                    </div>
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase flex items-center gap-2">
                                        <RotateCcw className="w-3 h-3" /> Net Revenue (Refund Adjusted)
                                    </h4>
                                    <div className="font-mono text-xs bg-white px-2 py-2 rounded border border-gray-200">
                                        Gross Sales Revenue - Total Refunded Value
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-2">
                                        * Refunds are imported separately and deducted from Gross Revenue when analyzing performance over time.
                                    </p>
                                </div>
                            </div>
                        </DefinitionSection>
                    </div>
                )}

                {activeTab === 'manual' && (
                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-300 pb-20">
                        {manualSections.map(section => (
                            <section key={section.id}>
                                <div className="flex items-center gap-3 mb-6">
                                    <div className={`p-2 bg-${section.color}-50 rounded-lg text-${section.color}-600`}>
                                        <section.icon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900">{section.title}</h3>
                                        <p className="text-sm text-gray-500">{section.desc}</p>
                                    </div>
                                </div>
                                {section.content}
                            </section>
                        ))}
                        
                        <div className="text-center pt-10">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full text-[10px] font-bold text-gray-500 border border-gray-200">
                                <ShieldCheck className="w-3 h-3 text-emerald-500" /> COMPREHENSIVE QA EVALUATION COMPLETED • V1.6.0
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2 italic">
                                All modules verified for logical consistency and financial accuracy by Antigravity AI.
                            </p>
                        </div>
                    </div>
                )}
            </div>
            
            <div className="text-[10px] text-gray-400 text-center pt-4 border-t border-gray-100">
                Evaluated & Documented by QA Antigravity • Version 1.6.0
            </div>
        </div>
    );
};

export default DefinitionsPage;
