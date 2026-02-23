
import React, { useState } from 'react';
import { DefinitionTabId, StatusCardData, ManualSectionData } from '../types';
import { 
    Globe, Zap, Database, Package, Info, DollarSign, Calendar, TrendingUp, 
    Megaphone, Scale, Cpu, Search, ShieldCheck, Tag, Wrench, Link, ShieldAlert, 
    Save, Layout, Check
} from 'lucide-react';

export const useDefinitions = () => {
    const [activeTab, setActiveTab] = useState<DefinitionTabId>('operational');

    const statusCards: StatusCardData[] = [
        {
            status: "Critical",
            color: "red",
            condition: "Runway < Lead Time",
            desc: "Stock will likely run out before new stock arrives. Immediate price increase recommended to slow velocity."
        },
        {
            status: "Warning",
            color: "amber",
            condition: "Runway < 1.5x Lead Time",
            desc: "Stock is getting low. Reordering should be in progress. Monitor closely."
        },
        {
            status: "Healthy",
            color: "green",
            condition: "Balanced Supply",
            desc: "Inventory levels are sufficient to cover the Lead Time with a comfortable buffer."
        },
        {
            status: "Overstock",
            color: "orange",
            condition: "Runway > 4x Lead Time",
            desc: "Too much capital tied up in stock. Consider price decreases or promotions to boost velocity."
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
                            Sello is built to run entirely in your browser. This means maximum speed, offline availability, and ultimate privacy—your sensitive company data never leaves your machine unless you share a backup.
                        </p>
                    </div>
                    <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                        <h4 className="font-bold text-gray-900 mb-2 flex items-center gap-2">
                            <Database className="w-4 h-4 text-blue-500" /> The 2nd Order Effect
                        </h4>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            We prioritize &quot;Step 1: Inventory&quot; before &quot;Step 2: Sales&quot;. Without a clean Inventory map, sales data is just noise. The Hub ensures every platform order is anchored to a physical Master SKU.
                        </p>
                    </div>
                </div>
            )
        },
        {
            id: 'data-arch',
            title: '2. Data Architecture: The Master SKU',
            desc: 'How we organize and link your products across platforms.',
            icon: Package,
            color: 'amber',
            content: (
                <div className="space-y-6">
                    <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                        <div className="grid md:grid-cols-3 gap-8">
                            <div className="space-y-3">
                                <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wider">The &quot;Ground Truth&quot;</h4>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Your <strong>ERP Inventory Report</strong> defines the &quot;Master SKU&quot;. This includes name, category, brand, COGS, and current warehouse stock.
                                </p>
                            </div>
                            <div className="space-y-3">
                                <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wider">Platform Aliases</h4>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    Platforms like Amazon or eBay often use different SKUs (e.g., <code>SKU-AMZ-FBA</code>). We use &quot;Aliases&quot; to map these back to your Master SKU.
                                </p>
                            </div>
                            <div className="space-y-3">
                                <h4 className="font-bold text-sm text-gray-900 uppercase tracking-wider">Velocity Aggregation</h4>
                                <p className="text-xs text-gray-600 leading-relaxed">
                                    When you import sales, the system automatically checks aliases. All sales for <code>SKU-AMZ</code> and <code>SKU-EBY</code> are summed into the Master SKU&apos;s velocity.
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
            )
        },
        {
            id: 'financial',
            title: '3. Financial Logic & P&L Depth',
            desc: 'Understanding the math behind your margins.',
            icon: DollarSign,
            color: 'emerald',
            content: (
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
            )
        },
        {
            id: 'strategy',
            title: '4. Strategy Engine & Safety Logic',
            desc: 'How the &quot;Brain&quot; makes price recommendations.',
            icon: Cpu,
            color: 'purple',
            content: (
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
            )
        },
        {
            id: 'search',
            title: '5. Natural Language Search & Elasticity',
            desc: 'Querying your data like a pro.',
            icon: Search,
            color: 'blue',
            content: (
                <div className="grid md:grid-cols-2 gap-6">
                    <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                        <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <ShieldCheck className="w-4 h-4 text-emerald-500" /> AI-Augmented Search
                        </h4>
                        <p className="text-sm text-gray-600 leading-relaxed mb-4">
                            You don&apos;t need to build complex filters. Just type what you&apos;re thinking into the Global Search:
                        </p>
                        <div className="space-y-2">
                            <div className="text-xs bg-white/50 border border-gray-100 p-2 rounded italic font-mono text-indigo-600">&quot;Healthy SKUs with margin &gt; 40% on Amazon&quot;</div>
                            <div className="text-xs bg-white/50 border border-gray-100 p-2 rounded italic font-mono text-indigo-600">&quot;Critical stock under £10 in Home Category&quot;</div>
                            <div className="text-xs bg-white/50 border border-gray-100 p-2 rounded italic font-mono text-indigo-600">&quot;Top 20% products by units sold last week&quot;</div>
                        </div>
                    </div>
                    <div className="bg-custom-glass rounded-xl p-6 border border-custom-glass">
                        <h4 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-purple-500" /> Price Elasticity Insights
                        </h4>
                        <p className="text-sm text-gray-600 leading-relaxed">
                            Click the &quot;Elasticity&quot; button on any SKU to see a visual map of how price changes affected velocity. It automatically identifies the <strong>Profit Sweet Spot</strong>—the price point where volume and margin are perfectly balanced for maximum daily income.
                        </p>
                    </div>
                </div>
            )
        },
        {
            id: 'ops',
            title: '6. Operations & Promotions',
            desc: 'Tools for day-to-day business growth.',
            icon: Tag,
            color: 'pink',
            content: (
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
            )
        },
        {
            id: 'maint',
            title: '7. Maintenance & Security',
            desc: 'Keeping your Hub running like a well-oiled machine.',
            icon: ShieldAlert,
            color: 'gray',
            content: (
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
                                The Hub uses a high-density &quot;Liquid Glass&quot; design system. You can adjust background images, glass blur, and ambient transparency in <strong>User Profile</strong> to suit your workflow—whether you prefer high-contrast light mode or a immersive dark cockpit.
                            </p>
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
