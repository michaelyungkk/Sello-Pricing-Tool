
import React, { useState } from 'react';
import { DefinitionTabId, StatusCardData, ManualSectionData } from '../types';
import {
    Globe, Zap, Database, Package, Info, DollarSign, TrendingUp,
    ShieldCheck, Tag, Wrench, Link, ShieldAlert,
    Save, Layout, Cpu, Search, RotateCcw, Upload,
    FileBarChart, Ship, Hash, BarChart2, Settings, BookOpen
} from 'lucide-react';

export const useDefinitions = () => {
    const [activeTab, setActiveTab] = useState<DefinitionTabId>('operational');

    const statusCards: StatusCardData[] = [
        {
            status: 'Critical',
            color: 'red',
            condition: 'Runway < Lead Time',
            desc: 'Stock will likely run out before new stock arrives. Immediate price increase is recommended to slow velocity.'
        },
        {
            status: 'Warning',
            color: 'amber',
            condition: 'Runway < 1.5× Lead Time',
            desc: 'Stock is getting low. Reordering should be in progress. Monitor closely.'
        },
        {
            status: 'Healthy',
            color: 'green',
            condition: 'Balanced Supply',
            desc: 'Inventory levels are sufficient to cover the lead time with a comfortable buffer.'
        },
        {
            status: 'Overstock',
            color: 'orange',
            condition: 'Runway > 120 Days',
            desc: 'Too much capital tied up in stock. Consider price decreases or promotions to boost velocity.'
        }
    ];

    const manualSections: ManualSectionData[] = [
        {
            id: 'ecosystem',
            title: '1. Ecosystem & Philosophy',
            desc: 'The core principles of Sello UK Hub.',
            icon: Globe,
            color: 'indigo',
            content: (
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                        <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                            <Zap className="w-4 h-4 text-amber-500" /> Browser-Native Design
                        </h4>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            Sello runs entirely in your browser. All data is stored locally — nothing is sent to
                            any server unless you explicitly sync. This means it works offline, is fast, and your
                            sensitive business data stays private.
                        </p>
                    </div>
                    <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                        <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                            <Database className="w-4 h-4 text-blue-500" /> Inventory First
                        </h4>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            The system anchors everything to a <strong>Master SKU</strong> from your ERP
                            Inventory Report. Without a verified inventory layer, sales data is just noise.
                            Always upload your Inventory Report before uploading sales.
                        </p>
                    </div>
                    <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                        <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                            <BarChart2 className="w-4 h-4 text-emerald-500" /> What It Does
                        </h4>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            Sello is a business intelligence and pricing engine. It aggregates sales across
                            platforms, tracks inventory health, calculates real margin, and surfaces
                            data-backed price recommendations — all without manual spreadsheet work.
                        </p>
                    </div>
                    <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                        <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                            <Settings className="w-4 h-4 text-gray-500" /> What It Does Not Do
                        </h4>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            It does not push price changes to platforms automatically. All recommendations
                            are advisory — you review, approve, and apply them yourself. It does not manage
                            listings, orders, or fulfilment.
                        </p>
                    </div>
                </div>
            )
        },
        {
            id: 'getting-started',
            title: '2. Getting Started: Upload Order',
            desc: 'The correct sequence to get the app fully populated.',
            icon: Upload,
            color: 'blue',
            content: (
                <div className="space-y-4">
                    <p className="text-sm text-gray-600">
                        The app has 7 data upload types. Follow this sequence — each step builds on the previous one.
                    </p>
                    <div className="space-y-3">
                        {[
                            {
                                step: 1, icon: '📦', label: 'ERP Inventory Report', required: true,
                                desc: 'Creates the Master SKU catalogue. Required columns: SKU, Name, Stock Qty, Cost, Lead Time Days. Optional: Brand, Category, Daily Average Sales, Aged Stock, Grade Level, Inventory Status.',
                                note: 'Without this, no other upload will work.'
                            },
                            {
                                step: 2, icon: '🔗', label: 'SKU Mapping (Aliases)', required: true,
                                desc: 'Maps platform SKU codes back to Master SKUs. Upload one file per platform, or use the Alias Generator in Toolbox. Required columns: platform SKU, Master SKU.',
                                note: 'Required if your platform SKU codes differ from your ERP SKU codes.'
                            },
                            {
                                step: 3, icon: '💰', label: 'CA Report (Reference Prices)', required: true,
                                desc: 'Sets the CA Price (Competitor/Channel Average price) for each SKU. Required columns: SKU, Price. Optional: Image URL.',
                                note: 'The CA Price is the reference anchor for all pricing guardrails.'
                            },
                            {
                                step: 4, icon: '📊', label: 'Sales Transaction Report', required: true,
                                desc: 'Imports all sales transactions. The app uses a column mapper — match your file\'s columns to: SKU, Qty, Revenue, Date, Platform, Ad Spend.',
                                note: 'This is what drives velocity, revenue, and margin calculations.'
                            },
                            {
                                step: 5, icon: '↩️', label: 'Refund Report', required: false,
                                desc: 'Imports return and refund data. Required columns: SKU, Refund Qty, Refund Amount, Date.',
                                note: 'Without this, refund rates will show as 0% and net revenue will be overstated.'
                            },
                            {
                                step: 6, icon: '📋', label: 'SKU Detail Report', required: false,
                                desc: 'Provides per-unit cost breakdown: COGS, Postage, Selling Fee, Ads Fee, WMS Fee, Other Fees, Subscription Fee. Can express each as absolute £ or % of sales.',
                                note: 'Overrides cost fields from the Inventory Report where more granular data is available.'
                            },
                            {
                                step: 7, icon: '🚢', label: 'Shipment Report', required: false,
                                desc: 'Tracks inbound shipments and incoming stock. Updates the Incoming Stock figure used in runway calculations.',
                                note: 'Required for the "Incoming Included" runway toggle to work.'
                            },
                        ].map(({ step, icon, label, required, desc, note }) => (
                            <div key={step} className="flex gap-4 p-4 bg-custom-glass rounded-xl border border-custom-glass">
                                <div className="shrink-0 w-7 h-7 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center font-bold text-xs">{step}</div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 mb-1">
                                        <span className="font-bold text-sm text-gray-900">{icon} {label}</span>
                                        {required
                                            ? <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-red-100 text-red-700 rounded">Required</span>
                                            : <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded">Optional</span>
                                        }
                                    </div>
                                    <p className="text-xs text-gray-600 leading-relaxed">{desc}</p>
                                    <p className="text-[11px] text-indigo-600 mt-1 font-medium italic">{note}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )
        },
        {
            id: 'data-arch',
            title: '3. Data Architecture: Master SKU & Aliases',
            desc: 'How products are organised and linked across platforms.',
            icon: Package,
            color: 'amber',
            content: (
                <div className="space-y-6">
                    <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                        <div className="grid md:grid-cols-3 gap-8">
                            <div className="space-y-3">
                                <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wider">Master SKU</h4>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Defined by your ERP Inventory Report. The single source of truth for a
                                    physical product — its name, category, brand, COGS, lead time, and
                                    warehouse stock level.
                                </p>
                            </div>
                            <div className="space-y-3">
                                <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wider">Platform Aliases</h4>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Amazon, eBay, and Etsy each assign their own SKU codes to your listings.
                                    Aliases tell the system: &quot;this Amazon SKU <code>AMZ-SP1057</code> is
                                    the same physical product as Master SKU <code>SP1057-UK</code>.&quot;
                                </p>
                            </div>
                            <div className="space-y-3">
                                <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wider">Aggregation</h4>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    All sales for every alias are summed into the Master SKU. One product
                                    gets one velocity, one P&amp;L, one recommendation — regardless of how
                                    many platforms it sells on.
                                </p>
                            </div>
                        </div>
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100">
                            <h5 className="font-bold text-amber-900 text-sm flex items-center gap-2 mb-2">
                                <Info className="w-4 h-4" /> Grade Levels (G1–G5)
                            </h5>
                            <p className="text-xs text-amber-800 leading-relaxed">
                                Products can have a Grade Level (G1–G5) imported from the ERP report.
                                G1/G2 are high performers; G4/G5 flag underperformers. Grades are
                                displayed as colour-coded badges across Product Management and Strategy tables.
                            </p>
                        </div>
                        <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100">
                            <h5 className="font-bold text-amber-900 text-sm flex items-center gap-2 mb-2">
                                <Info className="w-4 h-4" /> Inventory Status Tags
                            </h5>
                            <p className="text-xs text-amber-800 leading-relaxed">
                                Products can carry status tags from the ERP: <strong>New Product</strong>,
                                <strong> Clearance</strong>, etc. These influence Strategy Engine behaviour —
                                e.g. New Products are excluded from decrease recommendations by default
                                (configurable via the Fresh Stock Guard setting).
                            </p>
                        </div>
                    </div>
                </div>
            )
        },
        {
            id: 'financial',
            title: '4. Financial Logic & P&L Depth',
            desc: 'Understanding the math behind your margins.',
            icon: DollarSign,
            color: 'emerald',
            content: (
                <div className="space-y-6">
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                            <h4 className="font-bold text-sm text-gray-900 mb-4 border-b border-gray-100 pb-2">Full P&amp;L Components</h4>
                            <div className="space-y-2 text-xs">
                                <div className="flex justify-between py-1 border-b border-gray-100"><span className="text-gray-600">Selling Price</span><span className="font-bold text-gray-900">From transaction</span></div>
                                <div className="flex justify-between py-1 border-b border-gray-100"><span className="text-gray-600">+ Extra Freight Income</span><span className="font-bold text-gray-900">Platform surcharge</span></div>
                                <div className="flex justify-between py-1 border-b border-gray-100"><span className="text-gray-600">− COGS</span><span className="font-bold text-gray-900">From ERP / SKU Detail</span></div>
                                <div className="flex justify-between py-1 border-b border-gray-100"><span className="text-gray-600">− Platform Commission</span><span className="font-bold text-gray-900">Fee %</span></div>
                                <div className="flex justify-between py-1 border-b border-gray-100"><span className="text-gray-600">− Ad Spend</span><span className="font-bold text-gray-900">From transaction</span></div>
                                <div className="flex justify-between py-1 border-b border-gray-100"><span className="text-gray-600">− Postage</span><span className="font-bold text-gray-900">Weighted carrier cost</span></div>
                                <div className="flex justify-between py-1 border-b border-gray-100"><span className="text-gray-600">− WMS Fee</span><span className="font-bold text-gray-900">Per item handling</span></div>
                                <div className="flex justify-between py-1"><span className="text-gray-600">− Other Fees</span><span className="font-bold text-gray-900">Subscription, misc</span></div>
                            </div>
                        </div>
                        <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass space-y-4">
                            <div>
                                <h4 className="font-bold text-sm text-gray-900 mb-2">Net Profit</h4>
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                                    (Selling Price + Extra Freight) − (COGS + Fees + Ads + Postage + WMS)
                                </code>
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-gray-900 mb-2">Net Margin %</h4>
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                                    (Net Profit ÷ Selling Price) × 100
                                </code>
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-gray-900 mb-2">Return-Adjusted Revenue</h4>
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                                    Gross Revenue − (Refund Amount + Resend Cost)
                                </code>
                                <p className="text-[10px] text-gray-400 mt-1">Return = Refund Amount + Resend Cost. Both are deducted from gross revenue. Sourced from the Refund Report or embedded resend_amt/refund_amt columns in the Sales Report.</p>
                            </div>
                            <div>
                                <h4 className="font-bold text-sm text-gray-900 mb-2">TACoS</h4>
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                                    (Total Ad Spend ÷ Total Revenue) × 100
                                </code>
                                <p className="text-[10px] text-gray-400 mt-1">Total Advertising Cost of Sales — primary ad efficiency metric.</p>
                            </div>
                        </div>
                    </div>
                    <div className="bg-custom-glass rounded-xl p-5 border border-custom-glass">
                        <h4 className="font-bold text-sm text-gray-900 mb-3">Volume-Weighted Averages</h4>
                        <p className="text-xs text-gray-600 mb-3">
                            All price and fee averages are volume-weighted, not simple means. This prevents
                            a few high-volume low-price orders from skewing the numbers.
                        </p>
                        <div className="grid md:grid-cols-2 gap-4">
                            <div>
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Weighted Avg Price</span>
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded block mt-1">Sum(Revenue) ÷ Sum(Units Sold)</code>
                            </div>
                            <div>
                                <span className="text-[10px] font-bold text-gray-500 uppercase">Weighted Avg Fee</span>
                                <code className="text-xs bg-gray-100 px-2 py-1 rounded block mt-1">Sum(Fee Costs) ÷ Sum(Units Sold)</code>
                            </div>
                        </div>
                    </div>
                </div>
            )
        },
        {
            id: 'strategy',
            title: '5. Strategy Engine & Optimal Price Engine',
            desc: 'Two separate systems — one for stock-driven actions, one for profit-maximising price discovery.',
            icon: Cpu,
            color: 'purple',
            content: (
                <div className="space-y-5">

                    {/* Two systems callout */}
                    <div className="bg-amber-50/50 p-4 rounded-xl border border-amber-200">
                        <p className="font-bold text-amber-900 text-sm mb-2">⚠ These are two separate systems</p>
                        <div className="grid md:grid-cols-2 gap-4 text-xs text-amber-800">
                            <div>
                                <p className="font-bold mb-1">Strategy Engine</p>
                                <p>Stock-health rules engine. Looks at runway vs configurable thresholds and recommends INCREASE, DECREASE, or MAINTAIN with a fixed adjustment amount. Lives in the Strategy page table.</p>
                            </div>
                            <div>
                                <p className="font-bold mb-1">Optimal Price Engine</p>
                                <p>3-layer profit-maximisation algorithm. Analyses price-velocity history to find the price that maximises daily profit. Runs automatically on sales import. Results appear as confidence badges and tooltips on the Strategy table — they do not drive the INCREASE/DECREASE action.</p>
                            </div>
                        </div>
                    </div>

                    {/* Strategy Engine */}
                    <div className="bg-custom-glass rounded-xl p-5 border border-custom-glass">
                        <h4 className="font-bold text-sm text-gray-900 mb-3">Strategy Engine — How It Works</h4>
                        <p className="text-xs text-gray-600 leading-relaxed mb-3">
                            The Strategy Engine evaluates each SKU's runway and applies configured rules to
                            decide whether to increase, decrease, or maintain the current CA price:
                        </p>
                        <div className="space-y-2 mb-4">
                            <div className="flex gap-2 text-xs">
                                <span className="px-2 py-0.5 bg-green-100 text-green-700 font-bold rounded text-[10px] shrink-0">INCREASE</span>
                                <span className="text-gray-600">Runway &lt; minimum runway weeks AND last 7-day qty &gt; minimum velocity threshold</span>
                            </div>
                            <div className="flex gap-2 text-xs">
                                <span className="px-2 py-0.5 bg-red-100 text-red-700 font-bold rounded text-[10px] shrink-0">DECREASE</span>
                                <span className="text-gray-600">Runway &gt; high stock weeks, OR runway &gt; medium stock weeks AND margin &gt; minimum margin %</span>
                            </div>
                            <div className="flex gap-2 text-xs">
                                <span className="px-2 py-0.5 bg-gray-100 text-gray-600 font-bold rounded text-[10px] shrink-0">MAINTAIN</span>
                                <span className="text-gray-600">Neither condition met, or product is in Fresh Stock Guard period, or off-season seasonal item</span>
                            </div>
                        </div>
                        <p className="text-xs text-gray-600 mb-2">The adjusted price is calculated as:</p>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded block">
                            New Price = Current CA Price ± max(price × adjustment%, fixed £ adjustment)
                        </code>
                        <p className="text-[10px] text-gray-400 mt-2">
                            All thresholds (runway weeks, velocity minimum, adjustment %) are configurable in
                            <strong> Configuration → Strategy Rules</strong>. Recommendations are generated
                            on demand — trigger via the Recalculate button or by changing the velocity lookback.
                        </p>
                    </div>

                    {/* Optimal Price Engine */}
                    <div className="bg-custom-glass rounded-xl p-5 border border-custom-glass">
                        <h4 className="font-bold text-sm text-gray-900 mb-3">Optimal Price Engine — How It Works</h4>
                        <p className="text-xs text-gray-600 leading-relaxed mb-4">
                            Runs automatically when sales are imported or when a cohort rebuild is triggered.
                            Results are displayed as a confidence badge on each row and as the &quot;Optimal&quot;
                            column in the family group tooltip. The engine uses three layers:
                        </p>
                        <div className="grid md:grid-cols-3 gap-4">
                            <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100">
                                <div className="text-[10px] font-bold uppercase text-purple-600 mb-2">Layer 1 — SKU Evidence</div>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Builds a price-velocity curve from the SKU's own history, segmented into
                                    Price Eras defined by CA price change events. Within each era, velocity =
                                    <strong> median weekly units ÷ 7</strong>. Selects the price point with
                                    the highest <strong>Daily Profit = Margin × Velocity</strong>.
                                </p>
                            </div>
                            <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100">
                                <div className="text-[10px] font-bold uppercase text-blue-600 mb-2">Layer 2 — Cohort Benchmark</div>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    When a SKU has fewer than 30 eligible transactions, the engine blends in
                                    a cohort benchmark from similar SKUs in the same category and log-scale
                                    price bucket. The confidence score (0–100%) determines how much weight
                                    SKU data vs cohort data gets in the final price.
                                </p>
                            </div>
                            <div className="bg-red-50/50 p-4 rounded-xl border border-red-100">
                                <div className="text-[10px] font-bold uppercase text-red-600 mb-2">Layer 3 — Guardrails</div>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Three hard constraints applied in order: (1) Cost × 1.05 absolute floor,
                                    (2) category margin floor, (3) CA Price × 1.5 ceiling. Final price snaps
                                    to £X.99 psychological pricing.
                                </p>
                            </div>
                        </div>
                        <div className="mt-3 bg-blue-50/50 p-3 rounded-lg border border-blue-100">
                            <p className="text-xs text-blue-800">
                                <strong>Promotions as Elasticity Signals:</strong> Promotional transactions are
                                not excluded — they are tagged as <code className="bg-white px-1 rounded border text-[10px]">source: 'promo'</code> and
                                modelled as separate price points. This lets the engine learn from promo-period
                                velocity without distorting organic recommendations.
                            </p>
                        </div>
                    </div>
                </div>
            )
        },
        {
                        id: 'search',
            title: '6. Natural Language Search',
            desc: 'Querying your data without building filters.',
            icon: Search,
            color: 'blue',
            content: (
                <div className="space-y-5">
                    <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                        <h4 className="font-bold text-gray-900 mb-3">How It Works</h4>
                        <p className="text-sm text-gray-600 leading-relaxed mb-4">
                            Type a plain-language question into the Global Search bar at the top. The AI
                            parser converts your query into structured filters and returns matching SKUs.
                            No need to manually set dropdowns or filter columns.
                        </p>
                        <div className="space-y-2">
                            <div className="text-xs bg-indigo-50/60 border border-indigo-100 p-2 rounded font-mono text-indigo-700">&quot;Healthy SKUs with margin &gt; 40% on Amazon&quot;</div>
                            <div className="text-xs bg-indigo-50/60 border border-indigo-100 p-2 rounded font-mono text-indigo-700">&quot;Critical stock under £10 in Home Category&quot;</div>
                            <div className="text-xs bg-indigo-50/60 border border-indigo-100 p-2 rounded font-mono text-indigo-700">&quot;Top 20% products by units sold last week&quot;</div>
                            <div className="text-xs bg-indigo-50/60 border border-indigo-100 p-2 rounded font-mono text-indigo-700">&quot;Overstock items with return rate above 5%&quot;</div>
                        </div>
                        <p className="text-xs text-gray-500 mt-3">
                            Prefix with <code className="bg-gray-100 px-1 rounded">sku:</code> to jump directly
                            to a specific product deep dive. e.g. <code className="bg-gray-100 px-1 rounded">sku: SP1057-UK</code>
                        </p>
                    </div>
                    <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                        <h4 className="font-bold text-gray-900 mb-3 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-purple-500" /> Price Elasticity Insights
                        </h4>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            Open any SKU Deep Dive and select the <strong>Elasticity</strong> tab to see a
                            scatter chart of observed price points vs daily velocity. The engine highlights the
                            <strong> Profit Sweet Spot</strong> — the price where margin × velocity is
                            maximised. The chart also shows confidence level and which data points came from
                            organic vs promotional periods.
                        </p>
                    </div>
                </div>
            )
        },
        {
            id: 'ops',
            title: '7. Operations, Promotions & Toolbox',
            desc: 'Day-to-day operational tools.',
            icon: Tag,
            color: 'pink',
            content: (
                <div className="space-y-5">
                    <div className="grid md:grid-cols-2 gap-5">
                        <div className="bg-custom-glass rounded-xl p-5 border border-custom-glass">
                            <h4 className="font-bold text-gray-900 mb-3">Promotion Planner</h4>
                            <p className="text-xs text-gray-600 leading-relaxed mb-3">
                                Create promotion events per platform and SKU group. Each event has a date
                                range, discount type (% off), and scope (specific SKUs or whole shop).
                            </p>
                            <ul className="space-y-1.5 text-[11px] text-gray-500">
                                <li>• Active promotions appear as a <strong>[PROMO]</strong> tag in the Strategy table</li>
                                <li>• Completed promotions feed back into the pricing algorithm as elasticity signals</li>
                                <li>• Post-event velocity uplift vs BAU is visible in the Promotions page</li>
                            </ul>
                        </div>
                        <div className="bg-custom-glass rounded-xl p-5 border border-custom-glass">
                            <h4 className="font-bold text-gray-900 mb-3">Toolbox</h4>
                            <ul className="space-y-3 text-xs text-gray-600">
                                <li className="flex gap-2">
                                    <Wrench className="w-3.5 h-3.5 shrink-0 text-indigo-500 mt-0.5" />
                                    <div><strong>Inventory Sync</strong> — generates platform-ready stock update files (CSV/XLSX) from your current stock levels, formatted for Amazon, eBay, etc.</div>
                                </li>
                                <li className="flex gap-2">
                                    <Link className="w-3.5 h-3.5 shrink-0 text-amber-500 mt-0.5" />
                                    <div><strong>Alias Generator</strong> — bulk-maps platform SKU codes to Master SKU IDs. Paste a platform export and it auto-suggests matches.</div>
                                </li>
                                <li className="flex gap-2">
                                    <Search className="w-3.5 h-3.5 shrink-0 text-blue-500 mt-0.5" />
                                    <div><strong>ERP Cross-Check</strong> — compares your ERP stock figures against the system's records to surface any discrepancies before they cause runway miscalculations.</div>
                                </li>
                            </ul>
                        </div>
                    </div>
                    <div className="bg-custom-glass rounded-xl p-5 border border-custom-glass">
                        <h4 className="font-bold text-gray-900 mb-3">Custom Reports</h4>
                        <p className="text-xs text-gray-600 leading-relaxed">
                            Build ad-hoc pivot reports using drag-and-drop dimensions (SKU, Category, Brand,
                            Platform) and metrics (Revenue, Profit, Margin %, Units, Refund Rate, Ad Spend,
                            TACoS, ASP, Stock, Days Cover). Set date ranges, apply filters, and export to XLSX.
                            Layouts can be saved and re-run on fresh data.
                        </p>
                    </div>
                </div>
            )
        },
        {
            id: 'maint',
            title: '8. Maintenance & Personalisation',
            desc: 'Keeping your Hub healthy and configured correctly.',
            icon: ShieldAlert,
            color: 'gray',
            content: (
                <div className="space-y-5">
                    <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                        <div className="grid md:grid-cols-2 gap-10">
                            <div className="space-y-3">
                                <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                                    <Save className="w-4 h-4 text-emerald-500" /> Backup &amp; Restore
                                </h4>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    All data is stored in browser local storage. <strong>Clearing your browser
                                    cache will wipe it permanently.</strong> Back up daily using the
                                    <strong> Backup Database</strong> button — it exports a <code>.json</code> file.
                                    Store it in SharePoint or OneDrive. Use <strong>Restore Database</strong> to
                                    reload from any prior backup.
                                </p>
                                <div className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                                    ⚠ If you switch browsers or devices, you must restore from a backup — data does not sync between browsers automatically.
                                </div>
                            </div>
                            <div className="space-y-3">
                                <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2">
                                    <Layout className="w-4 h-4 text-blue-500" /> Personalisation
                                </h4>
                                <p className="text-xs text-gray-600 leading-relaxed mb-2">
                                    Open <strong>User Profile</strong> (top-right avatar) to adjust the visual environment:
                                </p>
                                <ul className="space-y-1 text-[11px] text-gray-500">
                                    <li><strong>Theme colour</strong> — accent colour across all UI elements</li>
                                    <li><strong>Background image</strong> — custom wallpaper behind glass panels</li>
                                    <li><strong>Glass mode</strong> — light or dark glass surface</li>
                                    <li><strong>Glass opacity &amp; blur</strong> — panel transparency and frosted depth</li>
                                    <li><strong>Ambient glass</strong> — subtle colour tint that picks up the background</li>
                                </ul>
                            </div>
                        </div>
                    </div>
                    <div className="bg-custom-glass rounded-xl p-5 border border-custom-glass">
                        <h4 className="font-bold text-sm text-gray-900 mb-3 flex items-center gap-2">
                            <Settings className="w-4 h-4 text-gray-500" /> Configuration Reference
                        </h4>
                        <div className="grid md:grid-cols-2 gap-4 text-xs text-gray-600">
                            <div>
                                <p className="font-bold text-gray-800 mb-1">Platform Rules</p>
                                <p>Set per-platform selling fee %, minimum margin %, and whether a platform is excluded from pricing calculations (e.g. wholesale channels).</p>
                            </div>
                            <div>
                                <p className="font-bold text-gray-800 mb-1">System Behaviour</p>
                                <p>Set the default velocity lookback window (7 / 30 / 90 / 180 / 365 / All Time) and trigger a full product recalculation.</p>
                            </div>
                            <div>
                                <p className="font-bold text-gray-800 mb-1">Alert Settings</p>
                                <p>Customise diagnostic thresholds: return rate alert %, margin below target %, velocity crash %, overstock days, dead stock minimum value.</p>
                            </div>
                            <div>
                                <p className="font-bold text-gray-800 mb-1">Strategy Rules</p>
                                <p>Set increase/decrease thresholds: minimum runway weeks to trigger an increase, overstock weeks to trigger a decrease, safety margin floor, fresh stock guard days.</p>
                            </div>
                        </div>
                    </div>
                </div>
            )
        }
    ];

    return {
        activeTab,
        setActiveTab,
        statusCards,
        manualSections
    };
};
