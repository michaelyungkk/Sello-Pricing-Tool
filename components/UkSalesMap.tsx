
import React, { useState, useMemo } from 'react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { scaleLinear } from 'd3-scale';
import { Product, PriceLog } from '../types';
import { POSTCODE_COORDS } from './UkPostcodeMapCoords';
import { UK_POSTCODE_AREA_NAME } from '../ukPostcodeAreaNames';
import { Filter, Layers, Map as MapIcon, Info, TrendingUp, DollarSign, Package, CornerDownLeft, X, BarChart2, ShoppingBag, PieChart, TrendingDown as TrendingDownIcon } from 'lucide-react';

// Use reliable World Atlas via jsDelivr instead of raw GitHub content which might be flaky or CORS blocked
const UK_TOPO_JSON = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";

interface UkSalesMapProps {
  products: Product[];
  priceHistoryMap: Map<string, PriceLog[]>;
  dateRange: { start: Date, end: Date };
  selectedPlatform: string;
  themeColor: string;
}

// Region Labels
const regions = [
  { name: 'Scotland', coordinates: [-4.2, 57.0] as [number, number] },
  { name: 'England', coordinates: [-1.5, 52.8] as [number, number] },
  { name: 'Wales', coordinates: [-3.8, 52.3] as [number, number] },
  { name: 'N. Ireland', coordinates: [-6.5, 54.6] as [number, number] },
];

// In-component type for aggregated data
interface AreaData {
    code: string;
    revenue: number;
    volume: number;
    profit: number;
    margin: number;
    returnRate: number;
    coordinates: [number, number];
    platformBreakdown: { platform: string; revenue: number; volume: number; profit: number }[];
    topSkus: { sku: string; name: string; profit: number; volume: number }[];
    prevRevenue: number;
    prevVolume: number;
    revenueDelta: number;
    volumeDelta: number;
    revenueDeltaPct: number;
    volumeDeltaPct: number;
}


const UkSalesMap: React.FC<UkSalesMapProps> = ({ 
  products, 
  priceHistoryMap, 
  dateRange, 
  selectedPlatform, 
  themeColor 
}) => {
  const [metric, setMetric] = useState<'REVENUE' | 'VOLUME'>('REVENUE');
  const [mode, setMode] = useState<'ABSOLUTE' | 'CHANGE'>('ABSOLUTE');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('All');
  const [hoveredArea, setHoveredArea] = useState<any | null>(null);
  const [pinnedArea, setPinnedArea] = useState<any | null>(null);

  const getAreaDisplayName = (code: string) => {
    const name = UK_POSTCODE_AREA_NAME[code];
    return name ? `${name} (${code})` : `${code} (Unknown Area)`;
  };

  // 1. Extract Unique Categories for Filter
  const categories = useMemo(() => {
    const cats = new Set<string>();
    products.forEach(p => {
        if (p.category) cats.add(p.category);
    });
    return Array.from(cats).sort();
  }, [products]);

  const subcategories = useMemo(() => {
    const subs = new Set<string>();
    products.forEach(p => {
        if (selectedCategory === 'All' || p.category === selectedCategory) {
            if (p.subcategory) subs.add(p.subcategory);
        }
    });
    return Array.from(subs).sort();
  }, [products, selectedCategory]);

  // 2. Aggregate Data by Postcode Area
  const mapData: AreaData[] = useMemo(() => {
    const duration = dateRange.end.getTime() - dateRange.start.getTime();
    const prevEnd = new Date(dateRange.start.getTime());
    prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd.getTime() - duration);

    const areaStats: Record<string, { 
        revenue: number, 
        volume: number, 
        profit: number, 
        prevRevenue: number;
        prevVolume: number;
        prevProfit: number;
        weightedReturnRate: number,
        platforms: Record<string, { revenue: number, volume: number, profit: number }>,
        skus: Record<string, { name: string, profit: number, volume: number, revenue: number }>
    }> = {};

    const skuMap = new Map<string, Product>();
    
    // Pre-filter products to optimize loop
    const relevantProducts = products.filter(p => {
        if (selectedCategory !== 'All' && p.category !== selectedCategory) return false;
        if (selectedSubcategory !== 'All' && p.subcategory !== selectedSubcategory) return false;
        return true;
    });

    relevantProducts.forEach(p => skuMap.set(p.sku, p));
    const validSkus = new Set(relevantProducts.map(p => p.sku));

    // Iterate through all history logs
    for (const [sku, logs] of priceHistoryMap.entries()) {
        if (!validSkus.has(sku)) continue;
        const product = skuMap.get(sku);
        if (!product) continue;

        logs.forEach(log => {
            // Apply Global Filters
            if (selectedPlatform !== 'All' && log.platform !== selectedPlatform) return;
            const logDate = new Date(log.date);
            
            // Extract Postcode Area
            if (!log.postcode) return;
            const match = log.postcode.match(/^([A-Z]{1,2})/i); 
            if (!match) return;
            
            const areaCode = match[1].toUpperCase();
            
            if (!areaStats[areaCode]) {
                areaStats[areaCode] = { revenue: 0, volume: 0, profit: 0, prevRevenue: 0, prevVolume: 0, prevProfit: 0, weightedReturnRate: 0, platforms: {}, skus: {} };
            }

            const area = areaStats[areaCode];
            const rev = log.price * log.velocity;
            const profit = log.profit !== undefined ? log.profit : rev * ((log.margin || 0) / 100);
            const platform = log.platform || 'Unknown';
            
            if (logDate >= dateRange.start && logDate <= dateRange.end) {
                // Top level stats
                area.revenue += rev;
                area.volume += log.velocity;
                area.profit += profit;
                area.weightedReturnRate += (product.returnRate || 0) * log.velocity;
                
                // Platform breakdown
                if (!area.platforms[platform]) area.platforms[platform] = { revenue: 0, volume: 0, profit: 0 };
                area.platforms[platform].revenue += rev;
                area.platforms[platform].volume += log.velocity;
                area.platforms[platform].profit += profit;

                // SKU breakdown
                if (!area.skus[sku]) area.skus[sku] = { name: product.name, profit: 0, volume: 0, revenue: 0 };
                area.skus[sku].profit += profit;
                area.skus[sku].volume += log.velocity;
                area.skus[sku].revenue += rev;

            } else if (logDate >= prevStart && logDate <= prevEnd) {
                area.prevRevenue += rev;
                area.prevVolume += log.velocity;
                area.prevProfit += profit;
            }
        });
    }

    return Object.entries(areaStats).map(([code, stats]) => {
        const platformBreakdown = Object.entries(stats.platforms)
            .map(([platform, data]) => ({ platform, ...data }))
            .sort((a, b) => b.revenue - a.revenue);
        
        const topSkus = Object.entries(stats.skus)
            .map(([sku, data]) => ({ sku, ...data }))
            .sort((a, b) => b.profit - a.profit)
            .slice(0, 3);

        const revenueDelta = stats.revenue - stats.prevRevenue;
        const volumeDelta = stats.volume - stats.prevVolume;

        return {
            code,
            revenue: stats.revenue,
            volume: stats.volume,
            profit: stats.profit,
            margin: stats.revenue > 0 ? (stats.profit / stats.revenue) * 100 : 0,
            returnRate: stats.volume > 0 ? stats.weightedReturnRate / stats.volume : 0,
            coordinates: POSTCODE_COORDS[code],
            platformBreakdown,
            topSkus,
            prevRevenue: stats.prevRevenue,
            prevVolume: stats.prevVolume,
            revenueDelta,
            volumeDelta,
            revenueDeltaPct: stats.prevRevenue > 0 ? (revenueDelta / stats.prevRevenue) * 100 : (revenueDelta > 0 ? Infinity : 0),
            volumeDeltaPct: stats.prevVolume > 0 ? (volumeDelta / stats.prevVolume) * 100 : (volumeDelta > 0 ? Infinity : 0),
        };
    }).filter(d => d.coordinates);
  }, [products, priceHistoryMap, dateRange, selectedPlatform, selectedCategory, selectedSubcategory]);

  // 3. Rank data and calculate shares
  const rankedMapData = useMemo(() => {
      const dataWithValues = mapData.map(d => ({
          ...d,
          value: mode === 'ABSOLUTE' 
              ? (metric === 'REVENUE' ? d.revenue : d.volume)
              : (metric === 'REVENUE' ? d.revenueDelta : d.volumeDelta),
          sizeValue: mode === 'ABSOLUTE'
              ? (metric === 'REVENUE' ? d.revenue : d.volume)
              : (metric === 'REVENUE' ? Math.abs(d.revenueDelta) : Math.abs(d.volumeDelta)),
      }));
  
      const totalValue = dataWithValues.reduce((sum, d) => sum + d.value, 0);
  
      return dataWithValues
          .map(d => ({
              ...d,
              share: totalValue > 0 ? (d.value / totalValue) * 100 : 0
          }))
          .sort((a, b) => b.sizeValue - a.sizeValue)
          .map((d, index) => ({
              ...d,
              rank: index + 1
          }));
  }, [mapData, metric, mode]);
  
  // 4. Scales
  const maxValue = useMemo(() => {
      return Math.max(...rankedMapData.map(d => d.sizeValue), 0);
  }, [rankedMapData]);

  const sizeScale = scaleLinear()
    .domain([0, maxValue])
    .range([4, 20]); // Min bubble size 4, Max 20

  const marginDomain = useMemo(() => {
    const margins = rankedMapData.map(d => d.margin).filter(m => isFinite(m));
    if (margins.length === 0) return [-10, 0, 30]; // Default domain
    
    const min = Math.min(...margins);
    const max = Math.max(...margins);
    
    if (min < 0 && max > 0) return [min, 0, max];
    if (max <= 0) return [min, min / 2, 0];
    return [0, max / 2, max];
  }, [rankedMapData]);

  const colorScale = scaleLinear<string>()
    .domain(marginDomain)
    .range(["#ef4444", "#facc15", "#22c55e"]); // Red -> Yellow -> Green
  
  const deltaColor = (value: number) => {
      if (value > 0) return "#22c55e"; // green
      if (value < 0) return "#ef4444"; // red
      return "#9ca3af"; // gray for no change
  };


  const sortedAreas = rankedMapData.slice(0, 5);

  const areaToShow = useMemo(() => {
    // Tooltip should only show on hover, not pin
    if (!hoveredArea) return null;
    return rankedMapData.find(d => d.code === hoveredArea.code);
  }, [hoveredArea, rankedMapData]);


  return (
    <div className="flex flex-col h-full animate-in fade-in slide-in-from-right-4">
        {/* Controls Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-4 gap-4 p-4 bg-white/50 rounded-xl border border-gray-200">
            <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
                    <MapIcon className="w-5 h-5" />
                </div>
                <div>
                    <h3 className="font-bold text-gray-900">UK Sales Distribution</h3>
                    <p className="text-xs text-gray-500">Geographic performance by Postcode Area</p>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
                {/* Mode Toggle */}
                <div className="flex bg-gray-200 p-1 rounded-lg">
                    <button 
                        onClick={() => setMode('ABSOLUTE')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${mode === 'ABSOLUTE' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                    >
                        <BarChart2 className="w-3 h-3" /> Absolute
                    </button>
                    <button 
                        onClick={() => setMode('CHANGE')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${mode === 'CHANGE' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                    >
                        <TrendingUp className="w-3 h-3" /> Change (PoP)
                    </button>
                </div>

                {/* Metric Toggle */}
                <div className="flex bg-gray-200 p-1 rounded-lg">
                    <button 
                        onClick={() => setMetric('REVENUE')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${metric === 'REVENUE' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                    >
                        <DollarSign className="w-3 h-3" /> Revenue
                    </button>
                    <button 
                        onClick={() => setMetric('VOLUME')}
                        className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1 ${metric === 'VOLUME' ? 'bg-white shadow text-indigo-600' : 'text-gray-500'}`}
                    >
                        <Package className="w-3 h-3" /> Volume
                    </button>
                </div>

                <div className="h-6 w-px bg-gray-300"></div>

                {/* Filters */}
                <div className="relative">
                    <select 
                        value={selectedCategory}
                        onChange={e => { setSelectedCategory(e.target.value); setSelectedSubcategory('All'); }}
                        className="pl-8 pr-8 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium appearance-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="All">All Categories</option>
                        {categories.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <Filter className="absolute left-2.5 top-2 w-3 h-3 text-gray-400 pointer-events-none" />
                </div>

                <div className="relative">
                    <select 
                        value={selectedSubcategory}
                        onChange={e => setSelectedSubcategory(e.target.value)}
                        className="pl-3 pr-8 py-1.5 bg-white border border-gray-300 rounded-lg text-xs font-medium appearance-none focus:ring-2 focus:ring-indigo-500"
                        disabled={selectedCategory === 'All'}
                    >
                        <option value="All">All Subcategories</option>
                        {subcategories.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                </div>
            </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 h-[500px]">
            {/* Map Visualization */}
            <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm relative overflow-hidden" onClick={() => setPinnedArea(null)}>
                <ComposableMap 
                    projection="geoAzimuthalEqualArea"
                    projectionConfig={{
                        rotate: [2.5, -54.0, 0], // Center on UK roughly
                        scale: 3000
                    }}
                    className="w-full h-full"
                >
                    <ZoomableGroup>
                        <Geographies geography={UK_TOPO_JSON}>
                            {({ geographies }) =>
                                geographies
                                    .filter(geo => {
                                        const id = String(geo.id);
                                        return id === "826" || id === "372";
                                    })
                                    .map((geo) => (
                                    <Geography
                                        key={geo.rsmKey}
                                        geography={geo}
                                        fill="#e5e7eb"
                                        stroke="#d1d5db"
                                        strokeWidth={0.5}
                                        style={{
                                            default: { outline: "none" },
                                            hover: { fill: "#d1d5db", outline: "none" },
                                            pressed: { outline: "none" },
                                        }}
                                    />
                                ))
                            }
                        </Geographies>
                        {regions.map(({ name, coordinates }) => (
                            <Marker key={name} coordinates={coordinates}>
                                <text
                                textAnchor="middle"
                                style={{
                                    fontFamily: 'system-ui, sans-serif',
                                    fontSize: '18px',
                                    fontWeight: 'bold',
                                    fill: '#cbd5e1', // A light grey color
                                    pointerEvents: 'none',
                                    opacity: 0.5,
                                }}
                                >
                                {name}
                                </text>
                            </Marker>
                        ))}
                        {rankedMapData.map((d) => {
                            if (d.sizeValue <= 0) return null;
                            const isPinned = pinnedArea && pinnedArea.code === d.code;
                            
                            return (
                                <Marker key={d.code} coordinates={d.coordinates}>
                                    <circle
                                        r={sizeScale(d.sizeValue)}
                                        fill={mode === 'ABSOLUTE' ? colorScale(d.margin) : deltaColor(d.value)}
                                        stroke={isPinned ? themeColor : '#fff'}
                                        strokeWidth={isPinned ? 2.5 : 1}
                                        className="cursor-pointer hover:opacity-80 transition-all"
                                        onMouseEnter={() => setHoveredArea(d)}
                                        onMouseLeave={() => setHoveredArea(null)}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setPinnedArea(d);
                                        }}
                                    />
                                </Marker>
                            );
                        })}
                    </ZoomableGroup>
                </ComposableMap>

                {/* Floating Tooltip */}
                {areaToShow && (
                    <div className="absolute top-4 right-4 bg-white/95 backdrop-blur shadow-lg rounded-lg p-3 border border-gray-100 w-60 animate-in fade-in zoom-in duration-200 pointer-events-none z-10">
                        <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-100">
                            <span className="font-bold text-gray-900 text-lg">{getAreaDisplayName(areaToShow.code)}</span>
                            <span className="text-xs font-bold text-gray-500">#{areaToShow.rank}</span>
                        </div>
                        <div className="space-y-1.5 text-sm">
                            {mode === 'ABSOLUTE' ? (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Revenue</span>
                                        <span className="font-bold text-indigo-600">£{areaToShow.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Volume</span>
                                        <span className="font-bold text-gray-800">{areaToShow.volume} units</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Profit</span>
                                        <span className={`font-bold ${areaToShow.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>£{areaToShow.profit.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Margin</span>
                                        <span className={`font-bold ${areaToShow.margin >= 15 ? 'text-green-600' : areaToShow.margin > 0 ? 'text-amber-600' : 'text-red-600'}`}>{areaToShow.margin.toFixed(1)}%</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500 flex items-center gap-1"><CornerDownLeft className="w-3 h-3"/>Return Rate</span>
                                        <span className={`font-bold ${areaToShow.returnRate > 5 ? 'text-red-600' : 'text-gray-800'}`}>{areaToShow.returnRate.toFixed(1)}%</span>
                                    </div>
                                </>
                            ) : (
                                <>
                                    <div className="flex justify-between">
                                        <span className="text-gray-500">Current</span>
                                        <span className="font-bold text-indigo-600">{metric === 'REVENUE' ? `£${areaToShow.revenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `${areaToShow.volume} u`}</span>
                                    </div>
                                     <div className="flex justify-between">
                                        <span className="text-gray-500">Previous</span>
                                        <span className="font-bold text-gray-600">{metric === 'REVENUE' ? `£${areaToShow.prevRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `${areaToShow.prevVolume} u`}</span>
                                    </div>
                                    <div className="flex justify-between font-bold" style={{ color: deltaColor(areaToShow.value) }}>
                                        <span>Change</span>
                                        <span className="flex items-center gap-1">
                                            {areaToShow.value > 0 ? <TrendingUp className="w-3 h-3"/> : <TrendingDownIcon className="w-3 h-3"/>}
                                            {areaToShow.value > 0 ? '+' : ''}{metric === 'REVENUE' ? `£${Math.abs(areaToShow.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `${Math.abs(areaToShow.value)} u`}
                                            ({isFinite(areaToShow.revenueDeltaPct) ? `${areaToShow.value > 0 ? '+' : ''}${(metric === 'REVENUE' ? areaToShow.revenueDeltaPct : areaToShow.volumeDeltaPct).toFixed(0)}%` : 'New'})
                                        </span>
                                    </div>
                                </>
                            )}
                            <div className="border-t border-gray-100 my-1 pt-1 mt-2">
                                <span className="text-[10px] text-gray-400 uppercase font-bold">Top Seller (by Profit)</span>
                                <div className="text-xs text-gray-700 truncate">{areaToShow.topSkus?.[0]?.name || 'N/A'}</div>
                            </div>
                        </div>
                    </div>
                )}
                
                <div className="absolute bottom-4 left-4 bg-white/80 p-3 rounded-lg text-xs text-gray-600 pointer-events-none shadow-md border border-gray-100 w-48">
                    <div className="font-bold mb-2 text-gray-700">Legend</div>
                    <div className="space-y-3">
                        <div>
                            <div className="flex items-center justify-between text-[10px] text-gray-500 font-medium">
                                <span>Size: {mode === 'ABSOLUTE' ? (metric === 'REVENUE' ? 'Revenue' : 'Volume') : 'Abs. Change'}</span>
                                <span>(Low to High)</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                                <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                                <div className="w-4 h-4 rounded-full bg-gray-400"></div>
                                <div className="w-5 h-5 rounded-full bg-gray-400"></div>
                            </div>
                        </div>
                        {mode === 'ABSOLUTE' ? (
                            <div>
                                <div className="text-[10px] text-gray-500 font-medium">Color: Margin %</div>
                                <div className="w-full h-3 rounded mt-1" style={{ background: `linear-gradient(to right, ${colorScale(marginDomain[0])}, ${colorScale(marginDomain[1])}, ${colorScale(marginDomain[2])})` }}></div>
                                <div className="flex justify-between text-[9px] font-mono mt-0.5">
                                    <span>{marginDomain[0].toFixed(0)}%</span>
                                    <span>{marginDomain[2].toFixed(0)}%</span>
                                </div>
                            </div>
                        ) : (
                            <div>
                                <div className="text-[10px] text-gray-500 font-medium">Color: Change (PoP)</div>
                                <div className="flex items-center gap-2 mt-1">
                                    <div className="w-3 h-3 rounded-full" style={{backgroundColor: deltaColor(-1)}}></div>
                                    <span className="text-xs">Decrease</span>
                                    <div className="w-3 h-3 rounded-full" style={{backgroundColor: deltaColor(1)}}></div>
                                    <span className="text-xs">Increase</span>
                                </div>
                            </div>
                        )}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-3 border-t border-gray-200 pt-2">
                        Click bubble or list item to pin details.
                    </div>
                </div>
            </div>

            {/* Right Panel: Conditional Leaderboard or Snapshot */}
            <div className="w-full lg:w-80 flex flex-col gap-4">
                {pinnedArea ? (
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex-1 animate-in fade-in">
                        <div className="flex justify-between items-center mb-4">
                            <h4 className="font-bold text-gray-800 text-lg">{getAreaDisplayName(pinnedArea.code)} Snapshot</h4>
                            <button onClick={() => setPinnedArea(null)} className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-full">
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                        
                        {/* High Level Stats */}
                        <div className="grid grid-cols-2 gap-3 text-center mb-4">
                            <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-2">
                                <div className="text-xs text-indigo-700 font-bold uppercase">Revenue</div>
                                <div className="text-lg font-bold text-indigo-900">£{pinnedArea.revenue.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                            </div>
                             <div className="bg-green-50 border border-green-100 rounded-lg p-2">
                                <div className="text-xs text-green-700 font-bold uppercase">Profit</div>
                                <div className="text-lg font-bold text-green-900">£{pinnedArea.profit.toLocaleString(undefined, {maximumFractionDigits: 0})}</div>
                            </div>
                             <div className="bg-gray-50 border border-gray-100 rounded-lg p-2">
                                <div className="text-xs text-gray-600 font-bold uppercase">Units</div>
                                <div className="text-lg font-bold text-gray-800">{pinnedArea.volume.toLocaleString()}</div>
                            </div>
                            <div className="bg-amber-50 border border-amber-100 rounded-lg p-2">
                                <div className="text-xs text-amber-700 font-bold uppercase">Margin</div>
                                <div className="text-lg font-bold text-amber-900">{pinnedArea.margin.toFixed(1)}%</div>
                            </div>
                        </div>
                        
                        {/* Platform Breakdown */}
                        <div className="mb-4">
                            <h5 className="font-bold text-gray-600 text-xs uppercase mb-2 flex items-center gap-2"><PieChart className="w-3 h-3"/> Platform Mix</h5>
                            <div className="space-y-2">
                                {pinnedArea.platformBreakdown.slice(0, 4).map((plat: any, i: number) => (
                                    <div key={i} className="flex justify-between items-center text-xs">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-gray-700">{plat.platform}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-mono text-gray-500">£{plat.revenue.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                                            <div className="w-12 h-1 bg-gray-100 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-400" style={{width: `${(plat.revenue / pinnedArea.revenue) * 100}%`}}></div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Top SKUs */}
                        <div>
                            <h5 className="font-bold text-gray-600 text-xs uppercase mb-2 flex items-center gap-2"><ShoppingBag className="w-3 h-3"/> Top Products (by Profit)</h5>
                            <div className="space-y-2">
                                {pinnedArea.topSkus.map((sku: any, i: number) => (
                                    <div key={i} className="text-xs p-2 rounded bg-gray-50/50 border border-gray-100">
                                        <div className="font-bold text-gray-800 truncate">{sku.name}</div>
                                        <div className="flex justify-between items-center mt-1">
                                            <span className="text-green-600 font-bold">Profit: £{sku.profit.toLocaleString(undefined, {maximumFractionDigits: 0})}</span>
                                            <span className="text-gray-500">{sku.volume} units</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </div>
                ) : (
                    <>
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex-1">
                            <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4 text-green-600" /> Top Performing Areas
                            </h4>
                            <div className="space-y-3">
                                {sortedAreas.length > 0 ? sortedAreas.map((area, i) => (
                                    <div 
                                        key={area.code} 
                                        onClick={() => setPinnedArea(area)}
                                        className={`flex items-center justify-between p-2 rounded-lg transition-colors cursor-pointer hover:bg-gray-50 border border-transparent hover:border-gray-100`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                                                {i + 1}
                                            </div>
                                            <div>
                                                <div className="font-bold text-gray-900 text-sm">{getAreaDisplayName(area.code)}</div>
                                                <div className="text-[10px] text-gray-500">{metric === 'REVENUE' ? `${area.volume} units` : `£${area.revenue.toLocaleString()}`}</div>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-bold text-indigo-600 text-sm">
                                                {mode === 'ABSOLUTE'
                                                  ? (metric === 'REVENUE' ? `£${area.revenue.toLocaleString()}` : area.volume)
                                                  : (area.value > 0 ? '+' : '') + (metric === 'REVENUE' ? `£${Math.abs(area.value).toLocaleString(undefined, { maximumFractionDigits: 0 })}` : `${area.value}`)
                                                }
                                            </div>
                                            <div className="w-16 h-1 bg-gray-100 rounded-full mt-1 ml-auto overflow-hidden">
                                                <div 
                                                    className="h-full bg-indigo-500 rounded-full" 
                                                    style={{ width: `${(area.sizeValue / sortedAreas[0].sizeValue) * 100}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                )) : (
                                    <div className="text-center py-8 text-gray-400 text-xs">
                                        No sales data found for current filters.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl">
                            <h5 className="font-bold text-indigo-800 text-xs uppercase mb-2 flex items-center gap-2">
                                <Info className="w-3 h-3" /> Insight
                            </h5>
                            <p className="text-xs text-indigo-700 leading-relaxed">
                                {sortedAreas.length > 0 ? (
                                    <>
                                        The <strong>{getAreaDisplayName(sortedAreas[0].code)}</strong> is your strongest market, contributing 
                                        <strong> {sortedAreas[0].share.toFixed(1)}%</strong> of total {metric.toLowerCase()} in this view.
                                    </>
                                ) : "Adjust filters to see distribution insights."}
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    </div>
  );
};

export default UkSalesMap;
