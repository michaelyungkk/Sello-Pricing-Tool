
import React from 'react';
import { Calculator, Calendar, AlertTriangle, TrendingUp, DollarSign, Target, Scale, Divide, Megaphone } from 'lucide-react';

const DefinitionsPage: React.FC = () => {
  return (
    <div className="max-w-4xl mx-auto space-y-8 pb-10">
      <div>
        <h2 className="text-2xl font-bold text-gray-900">System Definitions & Formulas</h2>
        <p className="text-gray-500 mt-1">Reference guide for calculations used in the EcomPulse dashboard.</p>
      </div>

      {/* Date Ranges */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                  <Calendar className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Weekly Reporting Cycles</h3>
          </div>
          <div className="prose prose-sm text-gray-600 max-w-none">
              <p>
                  The system automatically detects the latest date in your uploaded sales report and establishes a 
                  <strong> Friday-to-Thursday</strong> reporting cycle. It then partitions your entire sales file into weekly buckets based on this cycle.
              </p>
              <div className="grid md:grid-cols-2 gap-6 mt-4">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                      <h4 className="font-semibold text-gray-900 mb-2">Example Week</h4>
                      <p className="mb-2">A standard pricing week starts on a Friday and ends on the following Thursday.</p>
                      <code className="bg-white px-2 py-1 rounded border text-xs">Fri 28 Nov - Thu 04 Dec</code>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                      <h4 className="font-semibold text-gray-900 mb-2">Usage</h4>
                      <p className="mb-2">This full calendar history feeds the "Optimal Price" algorithm, allowing it to see trends over months rather than just weeks.</p>
                  </div>
              </div>
          </div>
      </div>

      {/* Ad Spend & TACoS */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                  <Megaphone className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Ad Spend & TACoS Logic</h3>
          </div>
          <div className="prose prose-sm text-gray-600 max-w-none">
              <p>
                  Advertising costs often appear in reports as standalone line items with a cost but <strong>0 quantity</strong> (e.g., "Sponsored Products Charge"). 
                  Simply averaging "per order" costs would ignore these line items.
              </p>
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 mt-3">
                  <h4 className="font-semibold text-gray-900 mb-2">TACoS Formula (Total Advertising Cost of Sales)</h4>
                  <div className="font-mono text-xs bg-white p-2 rounded border border-gray-200 mb-2">
                      (Sum of All Ad Spend in Period) / (Total Units Sold in Period)
                  </div>
                  <p className="text-xs text-gray-500">
                      We bucket these standalone costs by date (weekly) and divide by the total units sold in that same week. 
                      This distributes the general ad spend across the units that were actually sold to give a true "Ad Cost per Unit".
                  </p>
              </div>
          </div>
      </div>

      {/* Weighted Averages */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-pink-50 rounded-lg text-pink-600">
                  <Scale className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Weighted Average Logic</h3>
          </div>
          
          <p className="text-sm text-gray-600 mb-4">
              When processing transaction reports, the system always uses a <strong>Volume-Weighted Average</strong> rather than a simple average. 
              This ensures that a single small order at a weird price doesn't skew your data if you have hundreds of normal orders.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
              {/* Formula */}
              <div className="space-y-4">
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                      <h4 className="font-semibold text-gray-900 mb-2 text-sm">Price Formula</h4>
                      <div className="font-mono text-xs bg-white p-2 rounded border border-gray-200 mb-2">
                          (Sum of Revenue across all orders) / (Total Units Sold)
                      </div>
                      <p className="text-xs text-gray-500">
                          We sum the total money made and divide by total units, rather than averaging the "price per unit" of each row.
                      </p>
                  </div>
                  <div className="bg-gray-50 p-4 rounded-lg border border-gray-100">
                      <h4 className="font-semibold text-gray-900 mb-2 text-sm">Cost Formula</h4>
                      <div className="font-mono text-xs bg-white p-2 rounded border border-gray-200 mb-2">
                          Sum(Unit Cost × Qty) / Total Units Sold
                      </div>
                      <p className="text-xs text-gray-500">
                          Ensures that if you sold 100 units at low cost and 1 unit at high cost, the dashboard shows the low cost.
                      </p>
                  </div>
              </div>

              {/* Example */}
              <div className="bg-slate-900 text-slate-300 p-5 rounded-lg text-sm border border-slate-700 flex flex-col justify-center">
                  <h4 className="text-white font-bold mb-3 border-b border-slate-700 pb-2">Why this matters (Example)</h4>
                  
                  <div className="space-y-3 font-mono text-xs">
                      <div className="flex justify-between">
                          <span>Order A:</span>
                          <span className="text-white">100 units sold @ $10.00 each</span>
                      </div>
                      <div className="flex justify-between">
                          <span>Order B:</span>
                          <span className="text-white">1 unit sold @ $50.00 each</span>
                      </div>

                      <div className="border-t border-slate-700 my-2"></div>

                      <div className="flex justify-between text-red-300 opacity-75">
                          <span>Simple Average:</span>
                          <span>($10 + $50) / 2 = $30.00</span>
                      </div>
                      <div className="text-[10px] text-red-400 mb-2">Wrong. This assumes both orders are equally important.</div>

                      <div className="flex justify-between text-green-400 font-bold">
                          <span>Weighted Average:</span>
                          <span>$1050 / 101 = $10.39</span>
                      </div>
                      <div className="text-[10px] text-green-500">Correct. The price is mostly $10, slightly pulled up by the $50 sale.</div>
                  </div>
              </div>
          </div>
      </div>

      {/* Optimal Reference Price */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                  <Target className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Optimal Reference Price</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
              The system analyzes your historical sales data (Price, Margin, and Velocity) to identify the price point that historically generated the <strong>highest total daily profit</strong>.
          </p>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 space-y-2 text-sm text-gray-700">
              <p><strong>Daily Profit</strong> = (Unit Price × Margin %) × Daily Velocity</p>
              <p className="text-xs text-gray-500 mt-2">
                  The algorithm scans all recorded price points for a SKU and selects the one where this value was maximized.
              </p>
          </div>
      </div>

      {/* Price & Tax */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-green-50 rounded-lg text-green-600">
                  <Calculator className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Price & VAT Calculation</h3>
          </div>
          <p className="text-sm text-gray-600 mb-4">
              The dashboard assumes uploaded revenue figures are <strong>Net (Excluding VAT)</strong>. It automatically uplifts 
              the calculated unit price to display a <strong>Gross (Inc. VAT)</strong> price on the dashboard.
          </p>
          <div className="bg-slate-900 text-slate-200 p-4 rounded-lg font-mono text-sm overflow-x-auto">
              Gross Price = (Total Revenue / Total Units Sold) × 1.20
          </div>
          <p className="text-xs text-gray-500 mt-2 italic">
              * The multiplier 1.20 adds a standard 20% VAT rate.
          </p>
      </div>

      {/* Inventory Health */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                  <AlertTriangle className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Inventory Health & Runway</h3>
          </div>
          
          <div className="grid md:grid-cols-2 gap-6">
              {/* Strategic Status */}
              <div>
                  <h4 className="font-semibold text-gray-900 mb-3 text-sm border-b pb-2">Strategic Status (Recommendation)</h4>
                  <div className="space-y-3">
                      <div className="flex items-start gap-2">
                          <span className="px-1.5 py-0.5 bg-red-100 text-red-700 font-bold text-[10px] rounded uppercase mt-0.5">Critical</span>
                          <div className="text-xs">
                              <span className="font-semibold">Runway &lt; Lead Time</span>
                              <p className="text-gray-500">Stockout Risk. Recommendation: Increase Price.</p>
                          </div>
                      </div>
                      <div className="flex items-start gap-2">
                          <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 font-bold text-[10px] rounded uppercase mt-0.5">Warning</span>
                          <div className="text-xs">
                              <span className="font-semibold">Runway &lt; 1.5 × Lead Time</span>
                              <p className="text-gray-500">Approaching reorder point.</p>
                          </div>
                      </div>
                      <div className="flex items-start gap-2">
                          <span className="px-1.5 py-0.5 bg-green-100 text-green-700 font-bold text-[10px] rounded uppercase mt-0.5">Healthy</span>
                          <div className="text-xs">
                              <span className="font-semibold">Optimal Range</span>
                              <p className="text-gray-500">Supply meets demand.</p>
                          </div>
                      </div>
                       <div className="flex items-start gap-2">
                          <span className="px-1.5 py-0.5 bg-orange-100 text-orange-700 font-bold text-[10px] rounded uppercase mt-0.5">Overstock</span>
                          <div className="text-xs">
                              <span className="font-semibold">Runway &gt; 4 × Lead Time</span>
                              <p className="text-gray-500">Excess Inventory. Recommendation: Decrease Price.</p>
                          </div>
                      </div>
                  </div>
              </div>

              {/* Visual Bins */}
              <div>
                  <h4 className="font-semibold text-gray-900 mb-3 text-sm border-b pb-2">Visual Runway Bins (Conservative)</h4>
                  <div className="space-y-2 text-xs">
                       <div className="flex justify-between items-center p-2 bg-red-50 rounded border border-red-100 text-red-800">
                           <span>2 Weeks</span>
                           <span className="font-mono font-bold">0 - 14 Days</span>
                       </div>
                       <div className="flex justify-between items-center p-2 bg-amber-50 rounded border border-amber-100 text-amber-800">
                           <span>4 Weeks</span>
                           <span className="font-mono font-bold">15 - 28 Days</span>
                       </div>
                       <div className="flex justify-between items-center p-2 bg-green-50 rounded border border-green-100 text-green-800">
                           <span>12 Weeks</span>
                           <span className="font-mono font-bold">29 - 84 Days</span>
                       </div>
                       <div className="flex justify-between items-center p-2 bg-teal-50 rounded border border-teal-100 text-teal-800">
                           <span>24 Weeks</span>
                           <span className="font-mono font-bold">85 - 168 Days</span>
                       </div>
                       <div className="flex justify-between items-center p-2 bg-blue-50 rounded border border-blue-100 text-blue-800">
                           <span>24 Weeks +</span>
                           <span className="font-mono font-bold">169+ Days</span>
                       </div>
                  </div>
              </div>
          </div>
      </div>

      {/* Net Margin */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                  <DollarSign className="w-5 h-5" />
              </div>
              <h3 className="text-lg font-semibold text-gray-900">Net Margin Formula</h3>
          </div>
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-100 space-y-2 text-sm text-gray-700">
              <p><strong>Total Cost</strong> = COGS + Selling Fee + Ads Fee + Postage + Other + Subscription + WMS</p>
              <p><strong>Net Profit</strong> = (Current Price + Extra Freight Income) - Total Cost</p>
              <p><strong>Net Margin %</strong> = (Net Profit / Current Price) × 100</p>
          </div>
      </div>

    </div>
  );
};

export default DefinitionsPage;
