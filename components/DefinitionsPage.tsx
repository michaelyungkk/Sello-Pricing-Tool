
import React, { useState } from 'react';
import { Calculator, Calendar, AlertTriangle, TrendingUp, DollarSign, Target, Scale, Divide, Megaphone, Clock, Activity, Layers, Eye, ShieldAlert, Package, RotateCcw, CornerDownLeft } from 'lucide-react';

interface DefinitionsPageProps {
    headerStyle?: React.CSSProperties;
}

const DefinitionsPage: React.FC<DefinitionsPageProps> = ({ headerStyle }) => {
  const [activeTab, setActiveTab] = useState<'operational' | 'financial'>('operational');

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
                        <p className="font-bold mb-1 flex items-center gap-2"><Clock className="w-4 h-4"/> The "Runway" Calculation</p>
                        <p className="mb-2">
                            Runway (Days Remaining) = <span className="font-mono bg-white px-1 rounded border border-blue-200">Current Stock / Average Daily Sales</span>
                        </p>
                        <p className="text-xs opacity-80">
                            * Note: Incoming stock (shipments) is excluded by default for a conservative view, but can be toggled ON in the Strategy Engine.
                        </p>
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
        ) : (
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
                                <RotateCcw className="w-3 h-3"/> Net Revenue (Refund Adjusted)
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
        )}
      </div>
    </div>
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
