
import React, { useState, useMemo } from 'react';
import { ComposableMap, Geographies, Geography, Marker, ZoomableGroup } from 'react-simple-maps';
import { scaleLinear } from 'd3-scale';
import { Product, PriceLog } from '../types';
import { POSTCODE_COORDS } from './UkPostcodeMapCoords';
import { Filter, Layers, Map as MapIcon, Info, TrendingUp, DollarSign, Package } from 'lucide-react';

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

const UkSalesMap: React.FC<UkSalesMapProps> = ({ 
  products, 
  priceHistoryMap, 
  dateRange, 
  selectedPlatform, 
  themeColor 
}) => {
  const [metric, setMetric] = useState<'REVENUE' | 'VOLUME'>('REVENUE');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedSubcategory, setSelectedSubcategory] = useState<string>('All');
  const [hoveredArea, setHoveredArea] = useState<any | null>(null);
  const [pinnedArea, setPinnedArea] = useState<any | null>(null);

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
  const mapData = useMemo(() => {
    const areaStats: Record<string, { revenue: number, volume: number, topSku: string, topSkuRev: number }> = {};
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

        logs.forEach(log => {
            // Apply Global Filters
            if (selectedPlatform !== 'All' && log.platform !== selectedPlatform) return;
            const logDate = new Date(log.date);
            if (logDate < dateRange.start || logDate > dateRange.end) return;

            // Extract Postcode Area
            if (!log.postcode) return;
            // Matches start of string, 1 or 2 letters (e.g. 'SW1A' -> 'SW', 'B1' -> 'B')
            const match = log.postcode.match(/^([A-Z]{1,2})/i); 
            if (!match) return;
            
            const areaCode = match[1].toUpperCase();
            
            if (!areaStats[areaCode]) {
                areaStats[areaCode] = { revenue: 0, volume: 0, topSku: '', topSkuRev: 0 };
            }

            const rev = log.price * log.velocity;
            areaStats[areaCode].revenue += rev;
            areaStats[areaCode].volume += log.velocity;

            if (rev > areaStats[areaCode].topSkuRev) {
                areaStats[areaCode].topSkuRev = rev;
                areaStats[areaCode].topSku = skuMap.get(sku)?.name || sku;
            }
        });
    }

    return Object.entries(areaStats).map(([code, stats]) => ({
        code,
        revenue: stats.revenue,
        volume: stats.volume,
        topSku: stats.topSku,
        coordinates: POSTCODE_COORDS[code]
    })).filter(d => d.coordinates); // Only keep known coords
  }, [products, priceHistoryMap, dateRange, selectedPlatform, selectedCategory, selectedSubcategory]);

  // 3. Rank data and calculate shares
  const rankedMapData = useMemo(() => {
      const dataWithValues = mapData.map(d => ({
          ...d,
          value: metric === 'REVENUE' ? d.revenue : d.volume,
      }));
  
      const totalValue = dataWithValues.reduce((sum, d) => sum + d.value, 0);
  
      return dataWithValues
          .map(d => ({
              ...d,
              share: totalValue > 0 ? (d.value / totalValue) * 100 : 0
          }))
          .sort((a, b) => b.value - a.value)
          .map((d, index) => ({
              ...d,
              rank: index + 1
          }));
  }, [mapData, metric]);
  
  // 4. Scales
  const maxValue = useMemo(() => {
      return Math.max(...rankedMapData.map(d => d.value), 0);
  }, [rankedMapData]);

  const sizeScale = scaleLinear()
    .domain([0, maxValue])
    .range([4, 20]); // Min bubble size 4, Max 20

  const colorScale = scaleLinear<string>()
    .domain([0, maxValue])
    .range(["#c7d2fe", themeColor]); // Light Indigo to Theme Color

  const sortedAreas = rankedMapData.slice(0, 5);

  const areaToShow = useMemo(() => {
    const areaCode = pinnedArea?.code || hoveredArea?.code;
    if (!areaCode) return null;
    return rankedMapData.find(d => d.code === areaCode);
  }, [pinnedArea, hoveredArea, rankedMapData]);


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
                            if (d.value <= 0) return null;
                            const isPinned = pinnedArea && pinnedArea.code === d.code;
                            
                            return (
                                <Marker key={d.code} coordinates={d.coordinates}>
                                    <circle
                                        r={sizeScale(d.value)}
                                        fill={colorScale(d.value)}
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
                    <div className="absolute top-4 right-4 bg-white/95 backdrop-blur shadow-lg rounded-lg p-3 border border-gray-100 w-56 animate-in fade-in zoom-in duration-200 pointer-events-none z-10">
                        <div className="flex justify-between items-center mb-2 pb-1 border-b border-gray-100">
                            <span className="font-bold text-gray-900 text-lg">{areaToShow.code} Area</span>
                            <span className="text-xs font-bold text-gray-500">#{areaToShow.rank}</span>
                        </div>
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span className="text-gray-500">Revenue</span>
                                <span className="font-bold text-indigo-600">£{areaToShow.revenue.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-500">Volume</span>
                                <span className="font-bold text-gray-800">{areaToShow.volume} units</span>
                            </div>
                             <div className="flex justify-between text-xs">
                                <span className="text-gray-500">Share</span>
                                <span className="font-medium text-gray-700">{areaToShow.share.toFixed(2)}%</span>
                            </div>
                            <div className="border-t border-gray-100 my-1 pt-1">
                                <span className="text-[10px] text-gray-400 uppercase font-bold">Top Seller</span>
                                <div className="text-xs text-gray-700 truncate">{areaToShow.topSku}</div>
                            </div>
                        </div>
                    </div>
                )}
                
                <div className="absolute bottom-4 left-4 bg-white/80 p-3 rounded-lg text-xs text-gray-600 pointer-events-none shadow-md border border-gray-100">
                    <div className="font-bold mb-2 text-gray-700">Legend</div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-12 text-right text-gray-500">Size:</span>
                        <div className="flex items-center gap-1">
                            <div className="w-2 h-2 rounded-full bg-gray-400"></div>
                            <div className="w-2.5 h-2.5 rounded-full bg-gray-400"></div>
                            <div className="w-3 h-3 rounded-full bg-gray-400"></div>
                            <div className="w-4 h-4 rounded-full bg-gray-400"></div>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="w-12 text-right text-gray-500">Value:</span>
                        <div className="w-16 h-3 rounded" style={{ background: `linear-gradient(to right, #c7d2fe, ${themeColor})` }}></div>
                    </div>
                    <div className="text-[10px] text-gray-400 mt-3 border-t border-gray-200 pt-2">
                        Click bubble or list item to pin details.
                    </div>
                </div>
            </div>

            {/* Leaderboard Panel */}
            <div className="w-full lg:w-80 flex flex-col gap-4">
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex-1">
                    <h4 className="font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <TrendingUp className="w-4 h-4 text-green-600" /> Top Performing Areas
                    </h4>
                    <div className="space-y-3">
                        {sortedAreas.length > 0 ? sortedAreas.map((area, i) => (
                            <div 
                                key={area.code} 
                                onClick={() => setPinnedArea(area)}
                                className={`flex items-center justify-between p-2 rounded-lg transition-colors cursor-pointer ${pinnedArea?.code === area.code ? 'bg-indigo-100' : 'hover:bg-gray-50 border border-transparent hover:border-gray-100'}`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className={`w-6 h-6 flex items-center justify-center rounded-full text-xs font-bold ${i === 0 ? 'bg-yellow-100 text-yellow-700' : 'bg-gray-100 text-gray-600'}`}>
                                        {i + 1}
                                    </div>
                                    <div>
                                        <div className="font-bold text-gray-900 text-sm">{area.code}</div>
                                        <div className="text-[10px] text-gray-500">{metric === 'REVENUE' ? `${area.volume} units` : `£${area.revenue.toLocaleString()}`}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="font-bold text-indigo-600 text-sm">
                                        {metric === 'REVENUE' ? `£${area.revenue.toLocaleString()}` : area.volume}
                                    </div>
                                    <div className="w-16 h-1 bg-gray-100 rounded-full mt-1 ml-auto overflow-hidden">
                                        <div 
                                            className="h-full bg-indigo-500 rounded-full" 
                                            style={{ width: `${(area.value / sortedAreas[0].value) * 100}%` }}
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
                                The <strong>{sortedAreas[0].code}</strong> area is your strongest market, contributing 
                                <strong> {sortedAreas[0].share.toFixed(1)}%</strong> of total revenue in this view.
                            </>
                        ) : "Adjust filters to see distribution insights."}
                    </p>
                </div>
            </div>
        </div>
    </div>
  );
};

export default UkSalesMap;
