
import React from 'react';
import {
    Activity, Calculator, BookOpen, ShieldAlert, Clock, Ship,
    RotateCcw, CornerDownLeft, AlertTriangle, TrendingUp, Megaphone,
    Scale, DollarSign, Layers, Package, Eye, Info, ShieldCheck, Hash
} from 'lucide-react';
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

                {/* ═══════════════════════════════════════════════════
                    TAB 1 — OPERATIONAL LOGIC
                ═══════════════════════════════════════════════════ */}
                {activeTab === 'operational' && (
                    <div className="space-y-6">

                        {/* Inventory Health */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                    <ShieldAlert className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Inventory Health Status</h3>
                                    <p className="text-xs text-gray-500">
                                        How the system classifies each product. All thresholds are configurable in{' '}
                                        <strong>Configuration → Alert Settings</strong>.
                                    </p>
                                </div>
                            </div>
                            <DefinitionGrid>
                                {statusCards.map((card, idx) => (
                                    <DefinitionCard key={idx} {...card} />
                                ))}
                            </DefinitionGrid>

                            {/* Runway calculation */}
                            <div className="mt-6 bg-blue-50/50 p-4 rounded-lg border border-blue-100">
                                <p className="font-bold mb-3 flex items-center gap-2 border-b border-blue-200 pb-2 text-blue-800">
                                    <Clock className="w-4 h-4" /> The &quot;Runway&quot; Calculation
                                </p>
                                <div className="mb-4">
                                    <p className="mb-2 text-xs text-blue-800">Core formula:</p>
                                    <span className="font-mono bg-white px-3 py-1.5 rounded border border-blue-200 text-xs font-bold text-blue-900 block w-fit">
                                        Runway (days) = Effective Stock ÷ Effective Daily Velocity
                                    </span>
                                </div>

                                {/* Velocity resolution */}
                                <div className="bg-white/70 p-3 rounded-lg border border-blue-200 mb-3">
                                    <p className="font-bold mb-2 text-xs uppercase text-blue-700 flex items-center gap-1">
                                        <Hash className="w-3 h-3" /> Effective Daily Velocity — Resolution Priority
                                    </p>
                                    <ol className="space-y-2">
                                        <li className="flex gap-2 text-xs text-gray-700">
                                            <span className="shrink-0 font-bold text-blue-600 w-4">1.</span>
                                            <span><strong>ERP dailyAverageSales field</strong> — if your Inventory Report includes this column, it is used unconditionally and overrides all calculations. This ensures runway stays consistent with your ERP system.</span>
                                        </li>
                                        <li className="flex gap-2 text-xs text-gray-700">
                                            <span className="shrink-0 font-bold text-blue-600 w-4">2.</span>
                                            <span><strong>Weighted calculation from imported sales</strong> — if no ERP value exists, the system calculates a weighted average from transaction history over the selected lookback window.</span>
                                        </li>
                                        <li className="flex gap-2 text-xs text-gray-700">
                                            <span className="shrink-0 font-bold text-blue-600 w-4">3.</span>
                                            <span><strong>Stored averageDailySales</strong> — last resort fallback from the product record if no other source is available.</span>
                                        </li>
                                    </ol>
                                </div>

                                {/* Include Incoming toggle */}
                                <div className="bg-white/60 p-3 rounded-lg border border-blue-200">
                                    <p className="font-bold mb-2 flex items-center gap-2 text-xs uppercase text-indigo-600">
                                        <Ship className="w-3 h-3" /> Strategy Engine: &quot;Include Incoming&quot; Toggle
                                    </p>
                                    <p className="text-xs text-gray-600 mb-2">
                                        In the Strategy Engine toolbar, toggle <strong>Incoming Included</strong> to
                                        add in-transit stock to your effective stock figure for more aggressive runway planning.
                                    </p>
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-white p-2 rounded border border-gray-200">
                                            <span className="block text-[10px] uppercase font-bold text-gray-500 mb-1">Standard (Conservative)</span>
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

                        {/* Returns */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-red-50 rounded-lg text-red-600">
                                    <RotateCcw className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Returns &amp; Quality Control</h3>
                            </div>
                            <div className="prose prose-sm text-gray-600 max-w-none">
                                <p>
                                    Refunds are imported via the <strong>Refund Report</strong> upload. Data is
                                    aggregated by SKU and matched against the selected date period.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
                                    <div className="border rounded-lg p-4 bg-white/50">
                                        <h4 className="font-bold text-gray-900 text-xs uppercase mb-2 flex items-center gap-2">
                                            <CornerDownLeft className="w-3 h-3" /> Return Rate Formula
                                        </h4>
                                        <div className="font-mono text-xs bg-white px-2 py-2 rounded border border-gray-200 mb-2">
                                            (Returned Units ÷ Sold Units) × 100
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            Calculated within the same period. Used to flag quality and listing issues.
                                        </p>
                                    </div>
                                    <div className="border rounded-lg p-4 bg-white/50">
                                        <h4 className="font-bold text-gray-900 text-xs uppercase mb-2 flex items-center gap-2">
                                            <AlertTriangle className="w-3 h-3 text-amber-500" /> High Return Alert
                                        </h4>
                                        <p className="text-xs text-gray-600">
                                            Return rate exceeding <strong>5%</strong> (default, configurable in
                                            Configuration → Alert Settings) triggers a warning badge. Common
                                            causes: misleading listing description, packaging or QC issues.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </DefinitionSection>

                        {/* Velocity Settings */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Velocity Lookback Settings</h3>
                            </div>
                            <div className="prose prose-sm text-gray-600 max-w-none">
                                <p>
                                    Average Daily Sales is calculated from imported transaction history over
                                    the selected lookback window. Change the default in{' '}
                                    <strong>Configuration → System Behaviour</strong>. A per-session override
                                    is also available in the Strategy Engine toolbar.
                                </p>
                                <div className="bg-amber-50/50 p-3 rounded-lg border border-amber-200 my-4">
                                    <p className="font-bold flex items-center gap-2 text-amber-800 text-xs"><Info className="w-4 h-4" /> ERP Override</p>
                                    <p className="mt-1 text-xs text-amber-700">
                                        If your Inventory Report includes a <code>dailyAverageSales</code> column,
                                        that value overrides the lookback calculation entirely for that SKU.
                                    </p>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-2">
                                    {[
                                        { label: '7 Days', desc: 'Highly reactive. Use during peak seasons to catch velocity spikes immediately.' },
                                        { label: '30 Days', desc: 'Standard. Smooths out weekend dips and short anomalies.' },
                                        { label: '90 Days', desc: 'Conservative. Best for stable, long-tail product restocking decisions.' },
                                        { label: '180 Days', desc: 'Long-range smoothing for products with multi-month seasonal cycles.' },
                                        { label: '365 Days', desc: 'Full-year average. Use for annual restocking and planning targets.' },
                                        { label: 'All Time', desc: 'Uses every imported transaction. Most stable, least responsive to recent trends.' },
                                    ].map(({ label, desc }) => (
                                        <div key={label} className="border rounded-lg p-3 bg-white/50">
                                            <span className="font-bold text-gray-900 block mb-1 text-sm">{label}</span>
                                            <span className="text-xs text-gray-500">{desc}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </DefinitionSection>

                        {/* Data Hierarchy */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-pink-50 rounded-lg text-pink-600">
                                    <Layers className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Data Hierarchy &amp; &quot;Ghost&quot; Products</h3>
                            </div>
                            <div className="space-y-4">
                                <div className="flex gap-4 items-start">
                                    <div className="bg-gray-100 p-2 rounded text-gray-500 shrink-0"><Package className="w-4 h-4" /></div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">Master SKU vs. Aliases</h4>
                                        <p className="text-xs text-gray-500 mt-1">
                                            The system revolves around the <strong>Master SKU</strong> from your Inventory
                                            Report. Platform listings are linked via <strong>Aliases</strong>. Sales from
                                            all aliases aggregate into the Master SKU&apos;s velocity and P&amp;L.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4 items-start">
                                    <div className="bg-gray-100 p-2 rounded text-gray-500 shrink-0"><Eye className="w-4 h-4" /></div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">Inactive / &quot;Ghost&quot; Products</h4>
                                        <p className="text-xs text-gray-500 mt-1">
                                            Products with <strong>0 Stock</strong> AND <strong>0 Sales</strong> in the
                                            selected period are hidden by default. Toggle the eye icon in the filter bar
                                            to reveal them.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </DefinitionSection>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════
                    TAB 2 — FINANCIAL FORMULAS
                ═══════════════════════════════════════════════════ */}
                {activeTab === 'financial' && (
                    <div className="space-y-6">

                        {/* Tax Basis */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-teal-50 rounded-lg text-teal-600">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Tax Basis</h3>
                            </div>
                            <p className="text-sm text-gray-600">
                                All monetary values are shown <strong>inc. VAT</strong> by default across the app.
                                Metrics explicitly labelled &quot;ex tax&quot; are the exception — mainly in the
                                Cost Management view when analysing COGS and fee structures.
                            </p>
                        </DefinitionSection>

                        {/* Core P&L Formulas */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-green-50 rounded-lg text-green-600">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Core P&amp;L Formulas</h3>
                            </div>
                            <div className="space-y-4">
                                <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Net Profit (per unit)</h4>
                                    <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200 overflow-x-auto">
                                        (Selling Price + Extra Freight) − (COGS + Platform Fee + Ad Spend + Postage + WMS + Other Fees)
                                    </div>
                                </div>
                                <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Net Margin %</h4>
                                    <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200">
                                        (Net Profit ÷ Selling Price) × 100
                                    </div>
                                </div>
                                <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase flex items-center gap-2">
                                        <RotateCcw className="w-3 h-3" /> Return-Adjusted Revenue
                                    </h4>
                                    <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200">
                                        Gross Revenue − (Refund Amount + Resend Cost)
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-2">Return = Refund Amount + Resend Cost. Both are deducted from gross revenue. Sourced from the Refund Report or embedded resend_amt/refund_amt columns in the Sales Report.</p>
                                </div>
                                <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">TACoS (Total Advertising Cost of Sales)</h4>
                                    <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200">
                                        (Total Ad Spend ÷ Total Revenue) × 100
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-2">Primary measure of advertising efficiency. Ad costs are imported via the Sales Transaction Report.</p>
                                </div>
                            </div>
                        </DefinitionSection>

                        {/* Optimal Price Formulas */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Optimal Price Engine Formulas</h3>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">
                                The <strong>Optimal Price Engine</strong> is separate from the Strategy Engine.
                                It runs automatically on sales import and cohort rebuild, and surfaces
                                profit-maximising price suggestions as confidence badges and tooltips in
                                the Strategy table. The formulas below define how it works internally.
                            </p>
                            <div className="p-4 bg-indigo-50/50 rounded-lg border border-indigo-100 mb-4">
                                <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Layman Explanation (Step by Step)</h4>
                                <ol className="space-y-2 text-xs text-gray-700 list-decimal pl-4">
                                    <li>Collect valid sales rows for this SKU (correct platform, valid price, valid quantity).</li>
                                    <li>Group sales by observed price and estimate speed per price using median weekly units (then divide by 7). Example: weekly units [5, 6, 7, 6, 40] gives median 6, so daily velocity is 0.86/day.</li>
                                    <li>For each observed price, calculate expected daily profit from margin and velocity.</li>
                                    <li>Choose the best observed SKU price as the SKU-layer optimum, then calculate a cohort-layer optimum from similar SKUs (same category, same price bucket/bin).</li>
                                    <li>Calculate confidence from sample size and price variation. High confidence means trust SKU history more; low confidence means trust cohort benchmark more.</li>
                                    <li>Blend SKU optimum and cohort optimum using confidence as the weight.</li>
                                    <li>Apply safety guardrails (cost floor, margin floor, max cap), then round to a customer-facing ending (X.99).</li>
                                </ol>
                            </div>
                            <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100 mb-4">
                                <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Formula Chain (Compact)</h4>
                                <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200">
                                    dailyVelocity = medianWeeklyUnits / 7
                                </div>
                                <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200 mt-2">
                                    dailyProfit(price) = (price - unitCost) * dailyVelocity
                                </div>
                                <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200 mt-2">
                                    skuOptimal = argmax(dailyProfit(observedPrice))
                                </div>
                                <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200 mt-2">
                                    cohortOptimal = bestPrice(category, priceBin)
                                </div>
                                <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200 mt-2">
                                    blended = confidence * skuOptimal + (1 - confidence) * cohortOptimal
                                </div>
                                <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200 mt-2">
                                    final = snapTo99(applyGuardrails(blended))
                                </div>
                            </div>
                            <div className="space-y-4">
                                <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Daily Profit (per price point)</h4>
                                    <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200">
                                        Daily Profit = (CA Price − Total Costs) × Median Daily Velocity
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-2">
                                        The price point with the highest Daily Profit is selected as the SKU-level optimal.
                                        Velocity is median weekly units ÷ 7 (not mean — suppresses spike weeks).
                                    </p>
                                </div>
                                <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Confidence Score</h4>
                                    <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200">
                                        Base = min(1.0, eligible transactions ÷ 30)
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-2">
                                        Capped at 0.3 if only 1 distinct price point observed.
                                        Boosted ×1.2 (max 1.0) if 3+ distinct price points observed.
                                    </p>
                                </div>
                                <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Blended Price</h4>
                                    <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200">
                                        Blended = (confidence × skuOptimal) + ((1 − confidence) × cohortOptimal)
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-2">
                                        At ≥90% confidence: pure SKU data. At &lt;30%: pure cohort benchmark.
                                        Between 30–90%: proportional blend.
                                    </p>
                                </div>
                                <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Final Recommended Price</h4>
                                    <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200">
                                        snapTo99(applyGuardrails(blendedPrice))
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-2">
                                        Guardrails applied first (see below), then snapped to nearest £X.99.
                                        e.g. £108.34 → £107.99
                                    </p>
                                </div>
                            </div>
                        </DefinitionSection>

                        {/* Guardrail Formulas */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-red-50 rounded-lg text-red-600">
                                    <ShieldCheck className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Strategy Guardrail Formulas</h3>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">
                                Applied in order after blending. The first constraint that fires wins.
                            </p>
                            <div className="space-y-3">
                                <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">1. Absolute Cost Floor</h4>
                                    <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200">
                                        Min Price = Total Costs × 1.05
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-2">Hard stop. The engine will never recommend a selling price that results in a loss. Always enforced regardless of other settings.</p>
                                </div>
                                <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">2. Category Minimum Margin Floor</h4>
                                    <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200">
                                        Min Price = Total Costs ÷ (1 − categoryMinMargin%)
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-2">Set per platform/category in Configuration → Platform Rules. Prevents recommendations that would breach your target margin threshold.</p>
                                </div>
                                <div className="p-4 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">3. Maximum Price Ceiling</h4>
                                    <div className="font-mono text-xs bg-white px-3 py-2 rounded border border-gray-200">
                                        Max Price = CA Reference Price × 1.5
                                    </div>
                                    <p className="text-[10px] text-gray-500 mt-2">Prevents runaway increases. The recommended price can never exceed 150% of the current CA reference price.</p>
                                </div>
                            </div>
                        </DefinitionSection>

                        {/* Weighted Averages */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-pink-50 rounded-lg text-pink-600">
                                    <Scale className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Weighted Average Logic</h3>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">
                                All price and fee averages use a <strong>volume-weighted mean</strong> — not a
                                simple average. This prevents a few high-volume, low-price orders from skewing results.
                            </p>
                            <div className="grid md:grid-cols-2 gap-4">
                                <div className="bg-gray-50/50 p-4 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Weighted Avg Price</h4>
                                    <div className="font-mono text-xs bg-white px-2 py-2 rounded border border-gray-200">
                                        Sum(Order Revenue) ÷ Total Units Sold
                                    </div>
                                </div>
                                <div className="bg-gray-50/50 p-4 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-2 text-xs uppercase">Weighted Avg Fee</h4>
                                    <div className="font-mono text-xs bg-white px-2 py-2 rounded border border-gray-200">
                                        Sum(Fee Costs) ÷ Total Units Sold
                                    </div>
                                </div>
                            </div>
                        </DefinitionSection>

                        {/* Trend Analysis */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-cyan-50 rounded-lg text-cyan-600">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Trend Analysis (Period-over-Period)</h3>
                            </div>
                            <p className="text-sm text-gray-600 mb-3">
                                All trend indicators use <strong>PoP</strong> logic — the current selected window
                                compared against the immediately preceding window of identical length.
                            </p>
                            <div className="bg-gray-50/50 p-4 rounded-lg border border-gray-100">
                                <div className="grid sm:grid-cols-2 gap-4">
                                    <div>
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">Last 7 Days</span>
                                        <p className="text-xs text-gray-700 mt-1">Compares [Today−7 → Yesterday] vs [Today−14 → Today−8]</p>
                                    </div>
                                    <div>
                                        <span className="text-[10px] font-bold text-gray-500 uppercase">Last 30 Days</span>
                                        <p className="text-xs text-gray-700 mt-1">Compares last 30 days vs the 30 days immediately prior</p>
                                    </div>
                                </div>
                            </div>
                        </DefinitionSection>

                        {/* Cohort Benchmark */}
                        <DefinitionSection>
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                    <Megaphone className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Cohort Benchmark (Layer 2)</h3>
                            </div>
                            <p className="text-sm text-gray-600 mb-4">
                                When a SKU has fewer than 30 eligible transactions, the algorithm blends in a
                                cohort benchmark from similar products. Here&apos;s how cohorts are built:
                            </p>
                            <div className="space-y-3">
                                <div className="p-3 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-1 text-xs uppercase">Log-Scale Price Buckets</h4>
                                    <p className="text-xs text-gray-600">
                                        Within each category, SKUs are grouped into price buckets using a log scale
                                        (so the £5–15 range and the £100–150 range each get a bucket, rather than
                                        cheap products dominating). Buckets with fewer than 3 SKUs are merged into
                                        their nearest neighbour.
                                    </p>
                                </div>
                                <div className="p-3 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-1 text-xs uppercase">Cohort Stats per Bucket</h4>
                                    <p className="text-xs text-gray-600">
                                        For each bucket: median velocity, median margin %, and price elasticity are
                                        computed. The cohort optimal price is the point on the elasticity curve
                                        that maximises estimated daily profit for the bucket midpoint.
                                    </p>
                                </div>
                                <div className="p-3 bg-gray-50/50 rounded-lg border border-gray-100">
                                    <h4 className="font-semibold text-gray-900 mb-1 text-xs uppercase">Benchmark Refresh</h4>
                                    <p className="text-xs text-gray-600">
                                        Cohort benchmarks are rebuilt when new SKUs are added or when a SKU&apos;s
                                        CA price shifts it into a different price bucket. The app will prompt you
                                        when a rebuild is recommended after an import.
                                    </p>
                                </div>
                            </div>
                        </DefinitionSection>
                    </div>
                )}

                {/* ═══════════════════════════════════════════════════
                    TAB 3 — USER MANUAL
                ═══════════════════════════════════════════════════ */}
                {activeTab === 'manual' && (
                    <div className="space-y-12 pb-20">
                        {manualSections.map(section => {
                            const iconColorMap: Record<string, string> = {
                                indigo:  'bg-indigo-50 text-indigo-600',
                                amber:   'bg-amber-50 text-amber-600',
                                emerald: 'bg-emerald-50 text-emerald-600',
                                purple:  'bg-purple-50 text-purple-600',
                                blue:    'bg-blue-50 text-blue-600',
                                pink:    'bg-pink-50 text-pink-600',
                                gray:    'bg-gray-100 text-gray-600',
                            };
                            const colorClass = iconColorMap[section.color] ?? 'bg-gray-100 text-gray-600';
                            return (
                                <section key={section.id}>
                                    <div className="flex items-center gap-3 mb-6">
                                        <div className={`p-2 rounded-lg ${colorClass}`}>
                                            <section.icon className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h3 className="text-xl font-bold text-gray-900">{section.title}</h3>
                                            <p className="text-sm text-gray-500">{section.desc}</p>
                                        </div>
                                    </div>
                                    {section.content}
                                </section>
                            );
                        })}

                        <div className="text-center pt-10">
                            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-full text-[10px] font-bold text-gray-500 border border-gray-200">
                                <ShieldCheck className="w-3 h-3 text-emerald-500" /> DOCUMENTATION CURRENT AS OF V2.0.0
                            </div>
                            <p className="text-[10px] text-gray-400 mt-2 italic">
                                All modules verified for logical consistency and financial accuracy.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="text-[10px] text-gray-400 text-center pt-4 border-t border-gray-100">
                Sello UK Hub • Documentation v2.0.0
            </div>
        </div>
    );
};

export default DefinitionsPage;
