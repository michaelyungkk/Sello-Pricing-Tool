
import React, { useState, useRef } from 'react';
import { Product, PricingRules, ChannelData, FeeBounds } from '../types';
import { Upload, X, FileBarChart, Check, AlertCircle, Calendar, RefreshCw, TrendingUp, Loader2 } from 'lucide-react';
import * as XLSX from 'xlsx';

interface SalesImportModalProps {
  products: Product[];
  pricingRules?: PricingRules;
  onClose: () => void;
  onConfirm: (products: Product[], dateLabels?: { current: string, last: string }, historyPayload?: HistoryPayload[]) => void;
}

export interface HistoryPayload {
    sku: string;
    price: number;
    velocity: number;
    date: string;
    margin?: number; // Pre-calculated margin based on actual fees in report
}

interface SalesDataPoint {
  sku: string;
  quantity: number;
  date: Date;
  revenue: number;
  unitCost: number; // Added Cost Field
  platform: string;
  manager: string;
  subcategory?: string;
  // Fees
  sellingFee: number;
  adsFee: number;
  postage: number;
  extraFreight: number;
  otherFee: number;
  subscriptionFee: number;
  wmsFee: number;
}

interface WeeklyStat {
    weekIndex: number;
    startDate: Date;
    endDate: Date;
    revenue: number;
    sold: number;
    totalFees: number; // Sum of all fees for margin calc
    totalCostVolume: number; // Sum of (cost * qty) for accurate weekly margin
}

interface TempChannelStat {
    platform: string;
    manager: string;
    totalSold: number;
    totalRevenue: number;
}

interface AggregatedSku {
  sku: string;
  totalSold: number;
  totalRevenue: number;
  
  // Temporary storage for channel aggregation
  channelStats: Record<string, TempChannelStat>;
  
  velocity: number; // units per day (average over full period)
  subcategory?: string;
  
  // Aggregated Fees (Global Average)
  totalSellingFee: number;
  totalAdsFee: number;
  totalPostage: number;
  totalExtraFreight: number;
  totalOtherFee: number;
  totalSubFee: number;
  totalWmsFee: number;
  
  // Cost Aggregation
  totalCostVolume: number; // (unitCost * qty)

  // Fee Bounds
  feeBounds: {
    sellingFee: { min: number, max: number };
    adsFee: { min: number, max: number };
    postage: { min: number, max: number };
    extraFreight: { min: number, max: number };
    otherFee: { min: number, max: number };
    subscriptionFee: { min: number, max: number };
    wmsFee: { min: number, max: number };
  };

  // Dynamic Weekly Buckets
  weeklyStats: Record<number, WeeklyStat>;
}

const SalesImportModal: React.FC<SalesImportModalProps> = ({ products, pricingRules, onClose, onConfirm }) => {
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [analysis, setAnalysis] = useState<{
    dateRange: { start: Date; end: Date } | null;
    totalOrders: number;
    skuCounts: Record<string, AggregatedSku>;
    newProductCount: number;
    weekLabels: { current: string; last: string };
    totalWeeksFound: number;
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      processFile(e.target.files[0]);
    }
    if (fileInputRef.current) {
        fileInputRef.current.value = '';
    }
  };

  const processFile = (file: File) => {
    setIsProcessing(true);
    setError(null);

    setTimeout(() => {
        const reader = new FileReader();
        
        if (file.name.endsWith('.xlsx')) {
            reader.onload = (e) => {
                try {
                    const data = e.target?.result;
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const firstSheetName = workbook.SheetNames[0];
                    const worksheet = workbook.Sheets[firstSheetName];
                    const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                    processRows(rows);
                } catch (err) {
                    console.error("Excel parse error:", err);
                    setError("Failed to parse Excel file. Ensure it is a valid .xlsx file.");
                } finally {
                    setIsProcessing(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = (event) => {
                try {
                    const text = event.target?.result as string;
                    const rows = text.split('\n').map(line => line.split(','));
                    processRows(rows);
                } catch (err) {
                    setError("Failed to parse CSV file.");
                } finally {
                    setIsProcessing(false);
                }
            };
            reader.onerror = () => {
                setError("Error reading file.");
                setIsProcessing(false);
            };
            reader.readAsText(file);
        }
    }, 100);
  };

  const parseDate = (val: any): Date | null => {
    if (!val) return null;
    if (val instanceof Date) return val;
    const dateStr = String(val).trim();
    const parts = dateStr.split('/');
    if (parts.length === 3) {
      return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
    }
    const isoDate = new Date(dateStr);
    if (!isNaN(isoDate.getTime())) return isoDate;
    return null;
  };

  const formatDateLabel = (d1: Date, d2: Date) => {
      const opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };
      return `${d1.toLocaleDateString('en-GB', opts)} - ${d2.toLocaleDateString('en-GB', opts)}`;
  };

  // Helper: Snap any date to the Friday that started the week
  const getFridayPeriodStart = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    // JS Day: 0=Sun, 1=Mon, 2=Tue, 3=Wed, 4=Thu, 5=Fri, 6=Sat
    // We want the previous Friday (or today if it's Friday)
    // Diff to subtract:
    // Fri(5) -> 0
    // Sat(6) -> 1
    // Sun(0) -> 2
    // Mon(1) -> 3
    // Tue(2) -> 4
    // Wed(3) -> 5
    // Thu(4) -> 6
    const day = d.getDay();
    const diff = (day + 2) % 7; 
    d.setDate(d.getDate() - diff);
    return d;
  };

  const processRows = (rows: any[][]) => {
    if (rows.length < 2) {
        setError("File is empty.");
        return;
    }

    const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, '_'));
    const skuIndex = headers.indexOf('sku_code');
    const qtyIndex = headers.indexOf('sku_quantity');
    const dateIndex = headers.indexOf('order_time');
    
    // Optional Fields
    const typeIndex = headers.findIndex(h => h === 'order_type');
    const amtIndex = headers.findIndex(h => h === 'sales_amt' || h === 'revenue');
    const platformIndex = headers.findIndex(h => h === 'platform_name_level1' || h === 'platform');
    const managerIndex = headers.findIndex(h => h === 'account_manager_name' || h === 'manager');
    const subcatIndex = headers.findIndex(h => h === 'subcategory' || h === 'sub_category');
    
    // Detect Cost Column
    const costIndex = headers.findIndex(h => h.includes('cost') || h.includes('cogs') || h.includes('purchase_price') || h === 'unit_cost');

    // Fees
    const sellingFeeIndex = headers.findIndex(h => h.includes('selling_fee') || h.includes('commission'));
    const adsFeeIndex = headers.findIndex(h => h.includes('ads_fee') || h.includes('ad_fee'));
    const postageIndex = headers.findIndex(h => h.includes('postage') || h.includes('shipping_fee'));
    const extraFreightIndex = headers.findIndex(h => h.includes('extra_freight'));
    const otherFeeIndex = headers.findIndex(h => h.includes('other_fee'));
    const subFeeIndex = headers.findIndex(h => h.includes('subscription_fee'));
    const wmsFeeIndex = headers.findIndex(h => h.includes('wms_fee') || h.includes('fulfillment'));

    if (skuIndex === -1 || dateIndex === -1) {
      setError("Format not recognized. Required columns: sku_code, order_time");
      return;
    }

    const salesPoints: SalesDataPoint[] = [];
    let minDate = new Date(8640000000000000);
    let maxDate = new Date(-8640000000000000);

    // Pass 1: Parse & find Date Range
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (row.length < 2) continue; 

      const sku = String(row[skuIndex] || '').trim();
      
      // Handle Quantity: Treat empty/missing as 0 (important for Ad Spend only rows)
      let qty = 0;
      const qtyRaw = row[qtyIndex];
      if (qtyRaw !== undefined && qtyRaw !== null && String(qtyRaw).trim() !== '') {
         const parsed = parseFloat(String(qtyRaw));
         if (!isNaN(parsed)) qty = parsed;
      }

      const dateVal = row[dateIndex];
      const amt = parseFloat(String(row[amtIndex] || 0));
      
      // IMPORTANT: Allow qty = 0 (e.g. Ad Spend Rows), but skip if SKU is missing.
      if (!sku) continue;

      const date = parseDate(dateVal);
      if (date) {
        if (date < minDate) minDate = date;
        if (date > maxDate) maxDate = date;
        
        const getFee = (idx: number) => {
            if (idx === -1) return 0;
            const val = parseFloat(String(row[idx] || 0));
            return isNaN(val) ? 0 : Math.abs(val);
        };

        // Cost parsing
        const unitCost = costIndex !== -1 ? parseFloat(String(row[costIndex] || 0)) : 0;

        salesPoints.push({ 
            sku, 
            quantity: qty, 
            date, 
            revenue: amt, 
            unitCost: isNaN(unitCost) ? 0 : Math.abs(unitCost),
            platform: platformIndex !== -1 ? String(row[platformIndex] || 'Unknown').trim() : 'Unknown', 
            manager: managerIndex !== -1 ? String(row[managerIndex] || 'Unassigned').trim() : 'Unassigned',
            subcategory: subcatIndex !== -1 ? String(row[subcatIndex] || '').trim() : undefined,
            sellingFee: getFee(sellingFeeIndex),
            adsFee: getFee(adsFeeIndex),
            postage: getFee(postageIndex),
            extraFreight: getFee(extraFreightIndex),
            otherFee: getFee(otherFeeIndex),
            subscriptionFee: getFee(subFeeIndex),
            wmsFee: getFee(wmsFeeIndex)
        });
      }
    }

    if (salesPoints.length === 0) {
      setError("No valid sales data found.");
      return;
    }

    // Determine Anchor (Last Friday) based on MaxDate found in file
    const maxPeriodStart = getFridayPeriodStart(maxDate);
    
    // We can also find minPeriodStart to determine total weeks
    const minPeriodStart = getFridayPeriodStart(minDate);
    const diffTime = maxPeriodStart.getTime() - minPeriodStart.getTime();
    const totalWeeks = Math.ceil(diffTime / (7 * 24 * 3600 * 1000)) + 1;

    // Helper: Calculate week index relative to maxPeriodStart (Index 0 = current week)
    const getWeekIndex = (date: Date) => {
        const periodStart = getFridayPeriodStart(date);
        const diff = maxPeriodStart.getTime() - periodStart.getTime();
        // Return 0 for current week, 1 for last week, etc.
        return Math.round(diff / (7 * 24 * 3600 * 1000)); 
    };

    const getWeekDateRange = (index: number) => {
        // Start date = maxPeriodStart - (index * 7 days)
        const start = new Date(maxPeriodStart);
        start.setDate(maxPeriodStart.getDate() - (index * 7));
        
        // End date = Start + 6 days
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        
        return { start, end };
    };

    const skuCounts: Record<string, AggregatedSku> = {};
    
    // Pass 2: Aggregate
    salesPoints.forEach(pt => {
      if (!skuCounts[pt.sku]) {
        skuCounts[pt.sku] = {
          sku: pt.sku,
          totalSold: 0,
          totalRevenue: 0,
          channelStats: {},
          velocity: 0,
          totalSellingFee: 0,
          totalAdsFee: 0,
          totalPostage: 0,
          totalExtraFreight: 0,
          totalOtherFee: 0,
          totalSubFee: 0,
          totalWmsFee: 0,
          totalCostVolume: 0,
          subcategory: pt.subcategory,
          feeBounds: {
            sellingFee: { min: Infinity, max: -Infinity },
            adsFee: { min: Infinity, max: -Infinity },
            postage: { min: Infinity, max: -Infinity },
            extraFreight: { min: Infinity, max: -Infinity },
            otherFee: { min: Infinity, max: -Infinity },
            subscriptionFee: { min: Infinity, max: -Infinity },
            wmsFee: { min: Infinity, max: -Infinity },
          },
          weeklyStats: {}
        };
      }
      
      const skuData = skuCounts[pt.sku];
      
      // Global Totals
      skuData.totalSold += pt.quantity;
      skuData.totalRevenue += pt.revenue;
      if (pt.unitCost > 0) {
          skuData.totalCostVolume += (pt.unitCost * pt.quantity);
      }

      if (!skuData.subcategory && pt.subcategory) skuData.subcategory = pt.subcategory;
      
      // Fees - Sum ALL fees (even if qty is 0)
      skuData.totalSellingFee += pt.sellingFee;
      skuData.totalAdsFee += pt.adsFee;
      skuData.totalPostage += pt.postage;
      skuData.totalExtraFreight += pt.extraFreight;
      skuData.totalOtherFee += pt.otherFee;
      skuData.totalSubFee += pt.subscriptionFee;
      skuData.totalWmsFee += pt.wmsFee;

      // Fee Bounds - Only update MIN/MAX per order if quantity > 0 (to avoid infinity)
      const updateBounds = (key: keyof typeof skuData.feeBounds, val: number) => {
          skuData.feeBounds[key].min = Math.min(skuData.feeBounds[key].min, val);
          skuData.feeBounds[key].max = Math.max(skuData.feeBounds[key].max, val);
      };
      
      if (pt.quantity > 0) {
        if (pt.sellingFee > 0) updateBounds('sellingFee', pt.sellingFee / pt.quantity);
        if (pt.adsFee > 0) updateBounds('adsFee', pt.adsFee / pt.quantity);
        if (pt.postage > 0) updateBounds('postage', pt.postage / pt.quantity);
      }

      // Channel Aggregation (with revenue tracking for price calc)
      const chanKey = `${pt.platform}::${pt.manager}`;
      if (!skuData.channelStats[chanKey]) {
          skuData.channelStats[chanKey] = {
              platform: pt.platform,
              manager: pt.manager,
              totalSold: 0,
              totalRevenue: 0
          };
      }
      skuData.channelStats[chanKey].totalSold += pt.quantity;
      skuData.channelStats[chanKey].totalRevenue += pt.revenue;

      // Weekly Bucketing (Strict Friday-Thursday)
      const weekIdx = getWeekIndex(pt.date);
      
      if (!skuData.weeklyStats[weekIdx]) {
          const { start, end } = getWeekDateRange(weekIdx);
          skuData.weeklyStats[weekIdx] = {
              weekIndex: weekIdx,
              startDate: start,
              endDate: end,
              revenue: 0,
              sold: 0,
              totalFees: 0,
              totalCostVolume: 0
          };
      }
      
      const weekStat = skuData.weeklyStats[weekIdx];
      weekStat.revenue += pt.revenue;
      weekStat.sold += pt.quantity;
      // Capture ALL fees into this week's bucket
      weekStat.totalFees += (pt.sellingFee + pt.adsFee + pt.postage + pt.otherFee + pt.subscriptionFee + pt.wmsFee);
      if (pt.unitCost > 0) {
          weekStat.totalCostVolume += (pt.unitCost * pt.quantity);
      }
    });

    // Cleanup Infinity & Calculate Averages
    const totalDurationDays = Math.max(1, Math.ceil((maxDate.getTime() - minDate.getTime()) / (1000 * 3600 * 24)) + 1);

    Object.values(skuCounts).forEach(item => {
      item.velocity = item.totalSold / totalDurationDays;
      
      const fixBounds = (b: FeeBounds) => {
          if (b.min === Infinity) b.min = 0;
          if (b.max === -Infinity) b.max = 0;
      };
      Object.values(item.feeBounds).forEach(fixBounds);
    });

    const existingSkus = new Set(products.map(p => p.sku));
    const newCount = Object.keys(skuCounts).filter(s => !existingSkus.has(s)).length;
    
    // Labels based on strict Friday Start
    const w0 = getWeekDateRange(0);
    const w1 = getWeekDateRange(1);

    setAnalysis({
      dateRange: { start: minDate, end: maxDate },
      totalOrders: salesPoints.length,
      skuCounts,
      newProductCount: newCount,
      weekLabels: {
          current: formatDateLabel(w0.start, w0.end),
          last: formatDateLabel(w1.start, w1.end)
      },
      totalWeeksFound: totalWeeks
    });
  };

  const handleConfirmImport = () => {
    if (!analysis) return;

    const updatedProducts = [...products];
    const newProducts: Product[] = [];
    const historyPayload: HistoryPayload[] = [];

    // Basic calculator with VAT uplift (Net -> Gross)
    const calcPrice = (revenue: number, qty: number, fallback: number) => {
        if (qty <= 0) return fallback;
        const exVat = revenue / qty;
        return Number((exVat * 1.2).toFixed(2));
    };

    Object.values(analysis.skuCounts).forEach((agg: AggregatedSku) => {
      const existingIndex = updatedProducts.findIndex(p => p.sku === agg.sku);
      const existingProduct = existingIndex !== -1 ? updatedProducts[existingIndex] : null;
      
      // Calculate Total Average Price from the entire file as a fallback
      const fileAvgPrice = calcPrice(agg.totalRevenue, agg.totalSold, 0);

      // Determine Cost from file (Weighted Average)
      const fileAvgCost = agg.totalSold > 0 && agg.totalCostVolume > 0 
          ? agg.totalCostVolume / agg.totalSold 
          : 0;

      // Current State Stats (Week 0)
      const w0 = agg.weeklyStats[0];
      const w1 = agg.weeklyStats[1];

      // Fallback Chain
      const w0Fallback = existingProduct ? existingProduct.currentPrice : fileAvgPrice;
      const w1Fallback = existingProduct ? (existingProduct.oldPrice || existingProduct.currentPrice) : fileAvgPrice;

      const currentWeekPrice = w0 ? calcPrice(w0.revenue, w0.sold, w0Fallback) : w0Fallback;
      const lastWeekPrice = w1 ? calcPrice(w1.revenue, w1.sold, w1Fallback) : w1Fallback;

      const dailyVelocity = Number(agg.velocity.toFixed(2));
      // Standard Weighted Average for global Product Stats: (Total Fee / Total Units)
      const avgFee = (total: number) => agg.totalSold > 0 ? Number((total / agg.totalSold).toFixed(2)) : 0;

      // Transform TempChannelStats to Final ChannelData with Prices
      const totalDurationDays = Math.max(1, analysis.totalWeeksFound * 7); // Approx days
      const finalChannels: ChannelData[] = Object.values(agg.channelStats).map(cs => ({
          platform: cs.platform,
          manager: cs.manager,
          velocity: Number((cs.totalSold / totalDurationDays).toFixed(2)),
          price: calcPrice(cs.totalRevenue, cs.totalSold, fileAvgPrice)
      }));

      // --- GENERATE FULL HISTORY ---
      Object.values(agg.weeklyStats).forEach(stat => {
          if (stat.sold > 0) {
              const price = calcPrice(stat.revenue, stat.sold, 0);
              const weeklyVelocity = Number((stat.sold / 7).toFixed(2));
              
              // Use weekly specific cost if available, else global file avg, else existing DB cost
              const weeklyAvgCost = stat.totalCostVolume > 0 ? stat.totalCostVolume / stat.sold : fileAvgCost;
              const cogs = weeklyAvgCost > 0 ? weeklyAvgCost : (existingProduct?.costPrice || 0);
              
              const totalCost = stat.totalFees + (cogs * stat.sold);
              const netProfit = stat.revenue - totalCost;
              const margin = stat.revenue > 0 ? (netProfit / stat.revenue) * 100 : 0;

              historyPayload.push({
                  sku: agg.sku,
                  price,
                  velocity: weeklyVelocity,
                  date: stat.endDate.toISOString(),
                  margin: Number(margin.toFixed(2))
              });
          }
      });

      // Product Health Logic
      const leadTime = existingProduct ? existingProduct.leadTimeDays : 30;
      const currentStock = existingProduct ? existingProduct.stockLevel : 0;
      const daysRemaining = dailyVelocity > 0 ? currentStock / dailyVelocity : 999;
      
      let status: 'Critical' | 'Warning' | 'Healthy' | 'Overstock' = 'Healthy';
      let recommendation = 'Maintain';

      if (daysRemaining < leadTime) {
          status = 'Critical';
          recommendation = 'Increase Price';
      } else if (daysRemaining > leadTime * 4) {
          status = 'Overstock';
          recommendation = 'Decrease Price';
      } else if (daysRemaining < leadTime * 1.5) {
          status = 'Warning';
          recommendation = 'Maintain';
      }

      const productData = {
          averageDailySales: dailyVelocity,
          channels: finalChannels,
          currentPrice: currentWeekPrice > 0 ? currentWeekPrice : (existingProduct?.currentPrice || 0),
          oldPrice: lastWeekPrice > 0 ? lastWeekPrice : (existingProduct?.oldPrice || 0),
          lastUpdated: new Date().toISOString().split('T')[0],
          status,
          recommendation,
          daysRemaining: Math.floor(daysRemaining),
          subcategory: agg.subcategory,
          sellingFee: avgFee(agg.totalSellingFee),
          adsFee: avgFee(agg.totalAdsFee),
          postage: avgFee(agg.totalPostage),
          extraFreight: avgFee(agg.totalExtraFreight),
          otherFee: avgFee(agg.totalOtherFee),
          subscriptionFee: avgFee(agg.totalSubFee),
          wmsFee: avgFee(agg.totalWmsFee),
          feeBounds: agg.feeBounds
      };
      
      const finalCost = fileAvgCost > 0 ? Number(fileAvgCost.toFixed(2)) : undefined;

      if (existingIndex !== -1) {
        updatedProducts[existingIndex] = {
          ...updatedProducts[existingIndex],
          ...productData,
          subcategory: productData.subcategory || updatedProducts[existingIndex].subcategory,
          costPrice: finalCost !== undefined ? finalCost : updatedProducts[existingIndex].costPrice 
        };
      } else {
        newProducts.push({
          id: `new-${agg.sku}-${Math.random().toString(36).substr(2, 9)}`,
          name: `${agg.sku}`,
          sku: agg.sku,
          stockLevel: 0, 
          leadTimeDays: 30, 
          category: 'Uncategorized',
          costPrice: finalCost || 0,
          ...productData,
        });
      }
    });

    onConfirm([...updatedProducts, ...newProducts], analysis.weekLabels, historyPayload);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
              <FileBarChart className="w-5 h-5 text-indigo-600" />
              Import Sales History & Auto-Analyze
            </h2>
            <p className="text-sm text-gray-500 mt-1">Aggregates sales by SKU and builds historical weekly performance data.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {isProcessing ? (
             <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                <p className="text-gray-600 font-medium">Analyzing sales history...</p>
                <p className="text-sm text-gray-400">Partitioning data into weekly performance buckets.</p>
             </div>
          ) : !analysis ? (
            <div className="space-y-6">
              <div 
                className={`border-2 border-dashed rounded-xl p-10 flex flex-col items-center justify-center text-center transition-colors ${
                  dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                }`}
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
              >
                <input ref={fileInputRef} type="file" accept=".csv, .xlsx" className="hidden" onChange={handleFileChange} />
                <div className="w-16 h-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-4 pointer-events-none">
                  <Upload className="w-8 h-8" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 pointer-events-none">Upload Sales Master CSV or XLSX</h3>
                <p className="text-sm text-gray-500 mt-1 mb-4 pointer-events-none">Drag and drop or click to select file</p>
                
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-white border border-gray-300 shadow-sm text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                    Select File
                </button>
              </div>

              {error && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3 text-red-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0" />
                    <span className="text-sm">{error}</span>
                </div>
              )}

              <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-800">
                  <strong>Smart Historical Analysis:</strong><br/>
                  The system will automatically split your file into weekly buckets (ending on the report's max date) to capture price/velocity trends over time. This data feeds the optimal price algorithm.
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                  <div className="flex items-center gap-2 text-gray-500 mb-1">
                    <Calendar className="w-4 h-4" />
                    <span className="text-xs font-medium uppercase">Total Date Range</span>
                  </div>
                  <div className="font-semibold text-gray-900">
                    {analysis.dateRange && `${formatDate(analysis.dateRange.start)} - ${formatDate(analysis.dateRange.end)}`}
                  </div>
                </div>
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <div className="flex items-center gap-2 text-gray-500 mb-1">
                        <TrendingUp className="w-4 h-4" />
                        <span className="text-xs font-medium uppercase">Data Depth</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                         <span className="font-bold text-2xl text-indigo-600">{analysis.totalWeeksFound}</span>
                         <span className="text-sm text-gray-600">Weeks of history identified</span>
                    </div>
                </div>
              </div>

              <div>
                <h4 className="text-sm font-semibold text-gray-900 mb-3">Preview Aggregated Data</h4>
                <div className="border border-gray-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0">
                      <tr>
                        <th className="p-3">SKU</th>
                        <th className="p-3">Avg Daily Sales</th>
                        <th className="p-3 text-right">Weeks w/ Sales</th>
                        <th className="p-3 text-right">Avg Fee/Unit</th>
                        <th className="p-3 text-right">Avg Cost</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {Object.values(analysis.skuCounts).slice(0, 20).map((item: AggregatedSku, idx) => {
                          const activeWeeks = Object.values(item.weeklyStats).filter(w => w.sold > 0).length;
                          const totalFees = item.totalSellingFee + item.totalAdsFee + item.totalPostage + item.totalWmsFee + item.totalOtherFee + item.totalExtraFreight;
                          const avgFee = item.totalSold > 0 ? totalFees / item.totalSold : 0;
                          const avgCost = item.totalSold > 0 ? item.totalCostVolume / item.totalSold : 0;
                          
                          return (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="p-3 font-mono text-xs font-medium">{item.sku}</td>
                              <td className="p-3 text-indigo-600 font-semibold">{item.velocity.toFixed(2)}</td>
                              <td className="p-3 text-right">{activeWeeks}</td>
                              <td className="p-3 text-right font-mono text-xs text-gray-500">${avgFee.toFixed(2)}</td>
                              <td className="p-3 text-right font-mono text-xs text-gray-700">${avgCost.toFixed(2)}</td>
                            </tr>
                          );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-green-700 bg-green-50 p-3 rounded-lg border border-green-100">
                <Check className="w-4 h-4" />
                <span>Ready to import! Pricing history will be generated for {analysis.totalWeeksFound} weeks.</span>
              </div>
            </div>
          )}
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
           <button 
            onClick={() => { setAnalysis(null); setDragActive(false); setError(null); }}
            className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors"
          >
            Reset
          </button>
          {analysis && (
            <button 
              onClick={handleConfirmImport}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-md shadow-indigo-200 transition-all flex items-center gap-2"
            >
              <Check className="w-4 h-4" />
              Apply Updates
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesImportModal;
