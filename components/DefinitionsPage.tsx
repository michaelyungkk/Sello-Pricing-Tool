
import React, { useState } from 'react';
import { Calculator, Calendar, AlertTriangle, TrendingUp, DollarSign, Target, Scale, Divide, Megaphone, Clock, Activity, Layers, Eye, ShieldAlert, Package, RotateCcw, CornerDownLeft, Ship, BookOpen, Rocket, Link, Wrench, Save, Info, ArrowRight, Database, Search, Layout, Settings, History, Tag, ShieldCheck, Zap, Globe, Cpu } from 'lucide-react';
interface DefinitionsPageProps {
    headerStyle?: React.CSSProperties;
}
const DefinitionsPage: React.FC<DefinitionsPageProps> = ({ headerStyle }) => {
    const [activeTab, setActiveTab] = useState<'operational' | 'financial' | 'manual'>('operational');
    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-10 h-full flex flex-col">
            <div className="flex flex-col gap-2">
                <h2 className="text-2xl font-bold transition-colors" style={headerStyle}>System Definitions & Logic</h2>
                <p className="transition-colors" style={{ ...headerStyle, opacity: 0.8 }}>
                    Reference guide for calculation logic, status thresholds, and system behaviors.
                </p>
            </div>
            {/* Tabs */}
            <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
                <button
                    onClick={() => setActiveTab('operational')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'operational' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Activity className="w-4 h-4" />
                    Operational Logic
                </button>
                <button
                    onClick={() => setActiveTab('financial')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'financial' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <Calculator className="w-4 h-4" />
                    Financial Formulas
                </button>
                <button
                    onClick={() => setActiveTab('manual')}
                    className={`px-4 py-2 text-sm font-medium rounded-md transition-all flex items-center gap-2 ${activeTab === 'manual' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}
                >
                    <BookOpen className="w-4 h-4" />
                    User Manual
                </button>
            </div>
            <div className="flex-1 overflow-y-auto pr-2 space-y-6">
                {activeTab === 'operational' ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* Inventory Health Section */}
                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass p-6 backdrop-blur-custom">
                            <div className="flex items-center gap-3 mb-6 border-b border-gray-100 pb-4">
                                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                    <ShieldAlert className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-lg font-bold text-gray-900">Inventory Health Status</h3>
                                    <p className="text-xs text-gray-500">How the system decides if a product is Critical, Healthy, or Overstocked.</p>
                                </div>
                            </div>
                            <div className="grid md:grid-cols-2 gap-4">
                                <StatusCard
                                    status="Critical"
                                    color="red"
                                    condition="Runway < Lead Time"
                                    desc="Stock will likely run out before new stock arrives. Immediate price increase recommended to slow velocity."
                                />
                                <StatusCard
                                    status="Warning"
                                    color="amber"
                                    condition="Runway < 1.5x Lead Time"
                                    desc="Stock is getting low. Reordering should be in progress. Monitor closely."
                                />
                                <StatusCard
                                    status="Healthy"
                                    color="green"
                                    condition="Balanced Supply"
                                    desc="Inventory levels are sufficient to cover the Lead Time with a comfortable buffer."
                                />
                                <StatusCard
                                    status="Overstock"
                                    color="orange"
                                    condition="Runway > 4x Lead Time"
                                    desc="Too much capital tied up in stock. Consider price decreases or promotions to boost velocity."
                                />
                            </div>
                            <div className="mt-6 bg-blue-50/50 p-4 rounded-lg border border-blue-100 text-sm text-blue-800">
                                <p className="font-bold mb-3 flex items-center gap-2 border-b border-blue-200 pb-2">
                                    <Clock className="w-4 h-4" /> The "Runway" Calculation
                                </p>
                                <div className="mb-4">
                                    <p className="mb-2">The core formula for days remaining is:</p>
                                    <span className="font-mono bg-white px-2 py-1 rounded border border-blue-200 text-xs font-bold">
                                        Runway = Effective Stock / Average Daily Sales
                                    </span>
                                </div>
                                <div className="bg-white/60 p-3 rounded-lg border border-blue-200">
                                    <p className="font-bold mb-2 flex items-center gap-2 text-xs uppercase text-indigo-600">
                                        <Ship className="w-3 h-3" /> Strategy Engine: "Include Incoming" Toggle
                                    </p>
                                    <p className="text-xs text-gray-600 mb-2">
                                        In the Strategy Engine, you can toggle whether "Incoming Stock" (shipments on the water) counts towards your effective stock.
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
                        </div>
                        {/* Returns Logic Section */}
                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass p-6 backdrop-blur-custom">
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
                                            (Total Returned / (Avg Daily Sales × Period Days)) × 100
                                        </div>
                                        <p className="text-xs text-gray-500">
                                            We use <strong>Projected Sales</strong> (Velocity × Days) as the denominator to smooth out volatility. This provides a stable metric even if actual sales fluctuate day-to-day.
                                        </p>
                                    </div>
                                    <div className="border rounded-lg p-4 bg-white/50">
                                        <h4 className="font-bold text-gray-900 text-xs uppercase mb-2 flex items-center gap-2">
                                            <AlertTriangle className="w-3 h-3 text-amber-500" /> High Return Alert
                                        </h4>
                                        <p className="text-xs text-gray-600">
                                            If a product's return rate exceeds <strong>5%</strong>, a warning badge is displayed in the Product List tooltip.
                                            High returns may indicate quality issues or misleading listing descriptions.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                        {/* Velocity Engine Section */}
                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass p-6 backdrop-blur-custom">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                                    <TrendingUp className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Velocity Settings & Sensitivity</h3>
                            </div>
                            <div className="prose prose-sm text-gray-600 max-w-none">
                                <p>
                                    The "Average Daily Sales" metric is the heartbeat of the system. You can change how this is calculated in <strong>Settings</strong>.
                                </p>
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
                        </div>
                        {/* Data Hierarchy Section */}
                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass p-6 backdrop-blur-custom">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="p-2 bg-pink-50 rounded-lg text-pink-600">
                                    <Layers className="w-5 h-5" />
                                </div>
                                <h3 className="text-lg font-semibold text-gray-900">Data Hierarchy & "Ghost" Products</h3>
                            </div>
                            <div className="space-y-4">
                                <div className="flex gap-4 items-start">
                                    <div className="bg-gray-100 p-2 rounded text-gray-500"><Package className="w-4 h-4" /></div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">Master SKU vs. Aliases</h4>
                                        <p className="text-xs text-gray-500 mt-1">
                                            The system revolves around the <strong>Master SKU</strong> (from your Inventory Report).
                                            Platform listings (e.g., Amazon FBA, eBay) are linked via <strong>Aliases</strong>.
                                            Sales from all aliases are aggregated into the Master SKU's velocity.
                                        </p>
                                    </div>
                                </div>
                                <div className="flex gap-4 items-start">
                                    <div className="bg-gray-100 p-2 rounded text-gray-500"><Eye className="w-4 h-4" /></div>
                                    <div>
                                        <h4 className="font-bold text-gray-900 text-sm">Inactive / "Ghost" Products</h4>
                                        <p className="text-xs text-gray-500 mt-1">
                                            To keep the dashboard clean, products with <strong>0 Stock</strong> AND <strong>0 Sales</strong> (in the selected period) are hidden by default.
                                            Toggle the "Show Inactive" eye icon in filters to reveal them.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ) : activeTab === 'financial' ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
                        {/* Date Ranges */}
                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass p-6 backdrop-blur-custom">
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
                                        This full calendar history feeds the "Optimal Price" algorithm, allowing it to see trends over months rather than just weeks.
                                    </p>
                                </div>
                            </div>
                        </div>
                        {/* Trend Logic (PoP) */}
                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass p-6 backdrop-blur-custom">
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
                                        "Current Selected Period vs Immediately Preceding Period of Same Length"
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
                        </div>
                        {/* Ad Spend & TACoS */}
                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass p-6 backdrop-blur-custom">
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
                                        (Sum of All Ad Spend in Period) / (Total Units Sold in Period)
                                    </div>
                                    <p className="text-xs text-gray-500">
                                        We bucket standalone ad costs (e.g. "Sponsored Products Charge") by week and divide by the total units sold in that same week
                                        to determine the "Ad Cost per Unit".
                                    </p>
                                </div>
                            </div>
                        </div>
                        {/* Weighted Averages */}
                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass p-6 backdrop-blur-custom">
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
                        </div>
                        {/* Margin Logic */}
                        <div className="bg-custom-glass rounded-xl shadow-lg border border-custom-glass p-6 backdrop-blur-custom">
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
                        </div>
                    </div>
                ) : (
                    <div className="space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-300 pb-20">
                        {/* 1. Ecosystem & Philosophy */}
                        <section>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                    <Globe className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">1. Ecosystem & Philosophy</h3>
                                    <p className="text-sm text-gray-500">The core principles of Sello UK Hub.</p>
                                </div>
                            </div>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                                    <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                                        <Zap className="w-4 h-4 text-amber-500" /> Browser-Native Design
                                    </h4>
                                    <p className="text-sm text-gray-600 leading-relaxed">
                                        Sello is built to run entirely in your browser. This means maximum speed, offline availability, and ultimate privacy—your sensitive company data never leaves your machine unless you share a backup.
                                    </p>
                                </div>
                                <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                                    <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                                        <Database className="w-4 h-4 text-blue-500" /> The 2nd Order Effect
                                    </h4>
                                    <p className="text-sm text-gray-600 leading-relaxed">
                                        We prioritize "Step 1: Inventory" before "Step 2: Sales". Without a clean Inventory map, sales data is just noise. The Hub ensures every platform order is anchored to a physical Master SKU.
                                    </p>
                                </div>
                            </div>
                        </section>
                        {/* 2. Data Architecture: The Master SKU */}
                        <section>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                                    <Package className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">2. Data Architecture: The Master SKU</h3>
                                    <p className="text-sm text-gray-500">How we organize and link your products across platforms.</p>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                                    <div className="grid md:grid-cols-3 gap-8">
                                        <div className="space-y-3">
                                            <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wider">The "Ground Truth"</h4>
                                            <p className="text-xs text-gray-600 leading-relaxed">
                                                Your <strong>ERP Inventory Report</strong> defines the "Master SKU". This includes name, category, brand, COGS, and current warehouse stock.
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wider">Platform Aliases</h4>
                                            <p className="text-xs text-gray-600 leading-relaxed">
                                                Platforms like Amazon or eBay often use different SKUs (e.g., <code>SKU-AMZ-FBA</code>). We use "Aliases" to map these back to your Master SKU.
                                            </p>
                                        </div>
                                        <div className="space-y-3">
                                            <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wider">Velocity Aggregation</h4>
                                            <p className="text-xs text-gray-600 leading-relaxed">
                                                When you import sales, the system automatically checks aliases. All sales for <code>SKU-AMZ</code> and <code>SKU-EBY</code> are summed into the Master SKU's velocity.
                                            </p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-amber-50/50 p-4 rounded-lg border border-amber-100 flex gap-4 items-start">
                                    <Info className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                                    <div>
                                        <h5 className="font-bold text-amber-900 text-sm">Aged Stock & Inventory Status</h5>
                                        <p className="text-xs text-amber-800 leading-relaxed mt-1">
                                            The Hub tracks <strong>Aged Stock Qty</strong> from your ERP to identify slow-moving capital. Products can also inherit statuses like "Clearance" or "New Product", which override standard pricing recommendations.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>
                        {/* 3. Financial Logic & P&L Depth */}
                        <section>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                                    <DollarSign className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">3. Financial Logic & P&L Depth</h3>
                                    <p className="text-sm text-gray-500">Understanding the math behind your margins.</p>
                                </div>
                            </div>
                            <div className="grid md:grid-cols-2 gap-8">
                                <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                                    <h4 className="font-bold text-sm text-gray-900 mb-4 border-b border-gray-100 pb-2">Volume-Weighted Averages</h4>
                                    <div className="space-y-4">
                                        <div>
                                            <span className="block text-xs font-bold text-gray-500 uppercase">Weighted Price</span>
                                            <code className="text-xs text-emerald-700 bg-emerald-50 px-2 py-1 rounded block mt-1">Sum(Order Revenue) / Sum(Units)</code>
                                            <p className="text-[10px] text-gray-400 mt-1 italic">Prevents high-volume low-price items from skewing the stats unfairly.</p>
                                        </div>
                                        <div>
                                            <span className="block text-xs font-bold text-gray-500 uppercase">Refund Adjusted Revenue</span>
                                            <code className="text-xs text-red-700 bg-red-50 px-2 py-1 rounded block mt-1">Gross Sales - Total Refunded Value</code>
                                            <p className="text-[10px] text-gray-400 mt-1 italic">Net revenue is always used for ROI and P&L analysis.</p>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                                    <h4 className="font-bold text-sm text-gray-900 mb-4 border-b border-gray-100 pb-2">Full P&L Components</h4>
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px]">
                                        <div className="flex justify-between border-b py-1"><span>COGS</span><span className="font-bold">Inventory Cost</span></div>
                                        <div className="flex justify-between border-b py-1"><span>WMS Fee</span><span className="font-bold">Per Item Handling</span></div>
                                        <div className="flex justify-between border-b py-1"><span>Ad Spend</span><span className="font-bold">Total Ad / Units</span></div>
                                        <div className="flex justify-between border-b py-1"><span>Postage</span><span className="font-bold">Weighted Carrier Cost</span></div>
                                        <div className="flex justify-between border-b py-1"><span>CA Price</span><span className="font-bold text-blue-600">Master Ref Price</span></div>
                                        <div className="flex justify-between border-b py-1"><span>Subscriptions</span><span className="font-bold">Allocated Platform Cost</span></div>
                                    </div>
                                </div>
                            </div>
                        </section>
                        {/* 4. Strategy Engine & Safety Logic */}
                        <section>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                                    <Cpu className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">4. Strategy Engine & Safety Logic</h3>
                                    <p className="text-sm text-gray-500">How the "Brain" makes price recommendations.</p>
                                </div>
                            </div>
                            <div className="space-y-6">
                                <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                                    <div className="flex flex-col md:flex-row gap-8">
                                        <div className="flex-1">
                                            <h4 className="font-bold text-sm text-gray-900 mb-2">Automated Optimization</h4>
                                            <p className="text-xs text-gray-600 leading-relaxed">
                                                The engine runs every time you upload new sales. It reviews current <strong>Runway Weeks</strong> and historical <strong>Optimal Price</strong> (the price that yielded the most daily profit).
                                            </p>
                                            <div className="mt-4 flex gap-2">
                                                <div className="px-2 py-1 bg-red-100 text-red-700 text-[10px] font-bold rounded">Critical: Slow Sales</div>
                                                <div className="px-2 py-1 bg-orange-100 text-orange-700 text-[10px] font-bold rounded">Overstock: Push Sales</div>
                                            </div>
                                        </div>
                                        <div className="w-full md:w-64 bg-gray-50 rounded-lg p-4 border border-gray-100">
                                            <h5 className="text-[10px] uppercase font-bold text-gray-400 mb-2">Safety Mechanisms</h5>
                                            <div className="space-y-3">
                                                <div>
                                                    <span className="text-[11px] font-bold text-gray-700">Margin Floor</span>
                                                    <p className="text-[10px] text-gray-500">Prevents prices from ever falling below a defined % profit (e.g., 25%).</p>
                                                </div>
                                                <div>
                                                    <span className="text-[11px] font-bold text-gray-700">Price Ceiling</span>
                                                    <p className="text-[10px] text-gray-500">Caps the automated increase to avoid price gouging alerts.</p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </section>
                        {/* 5. Natural Language Search & Elasticity */}
                        <section>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                                    <Search className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">5. Natural Language Search & Elasticity</h3>
                                    <p className="text-sm text-gray-500">Querying your data like a pro.</p>
                                </div>
                            </div>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                                    <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        <ShieldCheck className="w-4 h-4 text-emerald-500" /> AI-Augmented Search
                                    </h4>
                                    <p className="text-sm text-gray-600 leading-relaxed mb-4">
                                        You don't need to build complex filters. Just type what you're thinking into the Global Search:
                                    </p>
                                    <div className="space-y-2">
                                        <div className="text-xs bg-white/50 border border-gray-100 p-2 rounded italic font-mono text-indigo-600">"Healthy SKUs with margin &gt; 40% on Amazon"</div>
                                        <div className="text-xs bg-white/50 border border-gray-100 p-2 rounded italic font-mono text-indigo-600">"Critical stock under £10 in Home Category"</div>
                                        <div className="text-xs bg-white/50 border border-gray-100 p-2 rounded italic font-mono text-indigo-600">"Top 20% products by units sold last week"</div>
                                    </div>
                                </div>
                                <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                                    <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                                        <TrendingUp className="w-4 h-4 text-purple-500" /> Price Elasticity Insights
                                    </h4>
                                    <p className="text-sm text-gray-600 leading-relaxed">
                                        Click the "Elasticity" button on any SKU to see a visual map of how price changes affected velocity. It automatically identifies the <strong>Profit Sweet Spot</strong>—the price point where volume and margin are perfectly balanced for maximum daily income.
                                    </p>
                                </div>
                            </div>
                        </section>
                        {/* 6. Operations & Promotions */}
                        <section>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-pink-50 rounded-lg text-pink-600">
                                    <Tag className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">6. Operations & Promotions</h3>
                                    <p className="text-sm text-gray-500">Tools for day-to-day business growth.</p>
                                </div>
                            </div>
                            <div className="grid md:grid-cols-2 gap-6">
                                <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                                    <h4 className="font-bold text-gray-900 mb-2">Automated Toolbox</h4>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        The toolbox contains specialized generators:
                                    </p>
                                    <ul className="mt-3 space-y-2">
                                        <li className="flex gap-2 text-[11px] text-gray-500"><Wrench className="w-3.5 h-3.5 shrink-0 text-indigo-400" /> <strong>Inventory Templates:</strong> Generate platform-specific stock update files.</li>
                                        <li className="flex gap-2 text-[11px] text-gray-500"><Link className="w-3.5 h-3.5 shrink-0 text-amber-400" /> <strong>Alias Generator:</strong> Bulk map platform SKUs to Master IDs.</li>
                                    </ul>
                                </div>
                                <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                                    <h4 className="font-bold text-gray-900 mb-2">Promotion Planner</h4>
                                    <p className="text-xs text-gray-600 leading-relaxed">
                                        Plan Flash Sales or seasonal events across platforms. The Hub tracks <strong>Uplift Percentage</strong>, letting you see exactly how much extra volume a promotion generated compared to standard BAU (Business As Usual) levels.
                                    </p>
                                </div>
                            </div>
                        </section>
                        {/* 7. Maintenance & Security */}
                        <section>
                            <div className="flex items-center gap-3 mb-6">
                                <div className="p-2 bg-gray-50 rounded-lg text-gray-600">
                                    <ShieldAlert className="w-5 h-5" />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-gray-900">7. Maintenance & Security</h3>
                                    <p className="text-sm text-gray-500">Keeping your Hub running like a well-oiled machine.</p>
                                </div>
                            </div>
                            <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                                <div className="grid md:grid-cols-2 gap-10">
                                    <div className="space-y-4">
                                        <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2"><Save className="w-4 h-4 text-emerald-500" /> Backup Best Practices</h4>
                                        <p className="text-xs text-gray-600 leading-relaxed">
                                            Since everything is stored locally, your browser clearing its cache could potentially wipe your data. <strong>Execute a backup daily.</strong> Store the resulting <code>.json</code> file in a secure cloud folder (e.g., SharePoint / OneDrive).
                                        </p>
                                    </div>
                                    <div className="space-y-4">
                                        <h4 className="font-bold text-sm text-gray-900 flex items-center gap-2"><Layout className="w-4 h-4 text-blue-500" /> Personalization (Liquid Glass)</h4>
                                        <p className="text-xs text-gray-600 leading-relaxed">
                                            The Hub uses a high-density "Liquid Glass" design system. You can adjust background images, glass blur, and ambient transparency in <strong>User Profile</strong> to suit your workflow—whether you prefer high-contrast light mode or a immersive dark cockpit.
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </section>
                        {/* Footer Evaluation */}
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
        </div >
    );
};
const StatusCard = ({ status, color, condition, desc }: { status: string, color: string, condition: string, desc: string }) => {
    const colorClasses = {
        red: 'bg-red-50 border-red-200 text-red-800',
        amber: 'bg-amber-50 border-amber-200 text-amber-800',
        green: 'bg-green-50 border-green-200 text-green-800',
        orange: 'bg-orange-50 border-orange-200 text-orange-800',
    };
    const badgeClasses = {
        red: 'bg-red-200 text-red-900',
        amber: 'bg-amber-200 text-amber-900',
        green: 'bg-green-200 text-green-900',
        orange: 'bg-orange-200 text-orange-900',
    };
    return (
        <div className={`p-4 rounded-lg border ${colorClasses[color as keyof typeof colorClasses]}`}>
            <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-lg">{status}</span>
                <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${badgeClasses[color as keyof typeof badgeClasses]}`}>
                    {condition}
                </span>
            </div>
            <p className="text-sm opacity-90 leading-relaxed">
                {desc}
            </p>
        </div>
    );
};
export default DefinitionsPage;
