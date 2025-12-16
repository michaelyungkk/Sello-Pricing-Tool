
import React, { useState, useRef } from 'react';
import { Product, PricingRules, ChannelData, FeeBounds } from '../types';
import { Upload, X, FileBarChart, Check, AlertCircle, Calendar, RefreshCw, TrendingUp, Loader2, Link as LinkIcon, Unlink, ArrowRight } from 'lucide-react';
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
  sku: string; // The MASTER SKU
  totalSold: number;
  totalRevenue: number;
  
  // Map of Platform -> Alias (e.g. Amazon -> SKU_1)
  detectedAliases: Record<string, string>;

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

// Mapping Candidate for Review
interface MappingCandidate {
    importSku: string;
    masterSku: string;
    platform: string; // Context where this alias was found
}

const SalesImportModal: React.FC<SalesImportModalProps> = ({ products, pricingRules, onClose, onConfirm }) => {
  const [dragActive, setDragActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Steps: 'upload' -> 'review_mappings' -> 'confirm'
  const [currentStep, setCurrentStep] = useState<'upload' | 'review_mappings' | 'confirm'>('upload');
  
  const [mappingCandidates, setMappingCandidates] = useState<MappingCandidate[]>([]);
  const [confirmedMappings, setConfirmedMappings] = useState<Record<string, string>>({}); // importSku -> masterSku
  
  // Temporary storage of raw points to re-aggregate after mapping
  const [rawSalesPoints, setRawSalesPoints] = useState<SalesDataPoint[]>([]);

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

  const getFridayPeriodStart = (date: Date) => {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const day = d.getDay();
    const diff = (day + 2) % 7; 
    d.setDate(d.getDate() - diff);
    return d;
  };

  const processFile = (file: File) => {
    setIsProcessing(true);
    setError(null);
    setConfirmedMappings({});
    setMappingCandidates([]);
    setRawSalesPoints([]);

    setTimeout(() => {
        const reader = new FileReader();
        
        const handleData = (data: any) => {
            let rows: any[][] = [];
            if (file.name.endsWith('.xlsx')) {
                const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];
                rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
            } else {
                const text = data as string;
                rows = text.split('\n').map(line => line.split(','));
            }
            initialScan(rows);
        };

        if (file.name.endsWith('.xlsx')) {
            reader.onload = (e) => {
                try {
                    handleData(e.target?.result);
                } catch (err) {
                    console.error("Excel parse error:", err);
                    setError("Failed to parse Excel file.");
                } finally {
                    setIsProcessing(false);
                }
            };
            reader.readAsArrayBuffer(file);
        } else {
            reader.onload = (e) => {
                try {
                    handleData(e.target?.result);
                } catch (err) {
                    setError("Failed to parse CSV file.");
                } finally {
                    setIsProcessing(false);
                }
            };
            reader.readAsText(file);
        }
    }, 100);
  };

  // Phase 1: Parse Rows and Identify Mappings
  const initialScan = (rows: any[][]) => {
      if (rows.length < 2) {
          setError("File is empty.");
          return;
      }

      const headers = rows[0].map(h => String(h).trim().toLowerCase().replace(/\s+/g, '_'));
      const skuIndex = headers.indexOf('sku_code');
      const qtyIndex = headers.indexOf('sku_quantity');
      const dateIndex = headers.indexOf('order_time');
      
      const typeIndex = headers.findIndex(h => h === 'order_type');
      const amtIndex = headers.findIndex(h => h === 'sales_amt' || h === 'revenue');
      const platformIndex = headers.findIndex(h => h === 'platform_name_level1' || h === 'platform');
      const managerIndex = headers.findIndex(h => h === 'account_manager_name' || h === 'manager');
      const subcatIndex = headers.findIndex(h => h === 'subcategory' || h === 'sub_category');
      const costIndex = headers.findIndex(h => h.includes('cost') || h.includes('cogs') || h.includes('purchase_price') || h === 'unit_cost');
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

      const points: SalesDataPoint[] = [];
      const distinctSkus = new Set<string>();
      const existingSkuSet = new Set(products.map(p => p.sku));

      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.length < 2) continue; 
        const sku = String(row[skuIndex] || '').trim();
        if (!sku) continue;

        let qty = 0;
        const qtyRaw = row[qtyIndex];
        if (qtyRaw !== undefined && qtyRaw !== null && String(qtyRaw).trim() !== '') {
            const parsed = parseFloat(String(qtyRaw));
            if (!isNaN(parsed)) qty = parsed;
        }

        const dateVal = row[dateIndex];
        const date = parseDate(dateVal);

        if (date) {
            const getFee = (idx: number) => {
                if (idx === -1) return 0;
                const val = parseFloat(String(row[idx] || 0));
                return isNaN(val) ? 0 : Math.abs(val);
            };
            const unitCost = costIndex !== -1 ? parseFloat(String(row[costIndex] || 0)) : 0;
            const platform = platformIndex !== -1 ? String(row[platformIndex] || 'Unknown').trim() : 'Unknown';

            points.push({ 
                sku, 
                quantity: qty, 
                date, 
                revenue: parseFloat(String(row[amtIndex] || 0)), 
                unitCost: isNaN(unitCost) ? 0 : Math.abs(unitCost),
                platform,
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
            distinctSkus.add(sku);
        }
      }

      if (points.length === 0) {
        setError("No valid data found.");
        return;
      }

      setRawSalesPoints(points);

      // Detect Mapping Candidates
      const candidates: MappingCandidate[] = [];
      const seenCandidates = new Set<string>();

      distinctSkus.forEach(importSku => {
          if (existingSkuSet.has(importSku)) return; // Exact match, no mapping needed

          // Try to find a master SKU match
          // Logic: Does Import SKU start with a Master SKU?
          // Common patterns: MASTER_1, MASTER-UK, MASTER_UK_2
          let bestMatch: string | null = null;
          
          // Heuristic 1: Stripping common suffixes
          const stripped = importSku.replace(/[_ -](UK|US|DE|FR|IT|ES|[0-9]+)$/i, '');
          
          if (existingSkuSet.has(stripped)) {
              bestMatch = stripped;
          } else {
              // Heuristic 2: Check if Master is a strict prefix of Import
              for (const master of products) {
                  if (importSku.startsWith(master.sku) && importSku.length > master.sku.length) {
                      // Ensure separator exists to avoid BF10 matching BF100
                      const separator = importSku[master.sku.length];
                      if (separator === '_' || separator === '-') {
                          // Prefer longer matches (e.g. Master BF10-UK matching BF10-UK_1 vs Master BF10 matching BF10-UK_1)
                          if (!bestMatch || master.sku.length > bestMatch.length) {
                              bestMatch = master.sku;
                          }
                      }
                  }
              }
          }

          if (bestMatch && !seenCandidates.has(importSku)) {
              // Find the platform context for this SKU
              const sample = points.find(p => p.sku === importSku);
              candidates.push({
                  importSku,
                  masterSku: bestMatch,
                  platform: sample?.platform || 'Unknown'
              });
              seenCandidates.add(importSku);
          }
      });

      if (candidates.length > 0) {
          setMappingCandidates(candidates);
          setCurrentStep('review_mappings');
      } else {
          // No aliases detected, proceed to aggregation
          aggregateData(points, {});
          setCurrentStep('confirm');
      }
  };

  const handleMappingDecision = (candidate: MappingCandidate, approved: boolean) => {
      if (approved) {
          setConfirmedMappings(prev => ({ ...prev, [candidate.importSku]: candidate.masterSku }));
      } else {
          // If rejected, remove from mappings (it will be treated as new product)
          setConfirmedMappings(prev => {
              const copy = { ...prev };
              delete copy[candidate.importSku];
              return copy;
          });
      }
      // Remove from candidate list
      setMappingCandidates(prev => prev.filter(c => c.importSku !== candidate.importSku));
  };

  const finishMappingReview = () => {
      aggregateData(rawSalesPoints, confirmedMappings);
      setCurrentStep('confirm');
  };

  // Phase 2: Aggregation (Merging Aliases)
  const aggregateData = (points: SalesDataPoint[], map: Record<string, string>) => {
      let minDate = new Date(8640000000000000);
      let maxDate = new Date(-8640000000000000);

      points.forEach(p => {
          if (p.date < minDate) minDate = p.date;
          if (p.date > maxDate) maxDate = p.date;
      });

      const maxPeriodStart = getFridayPeriodStart(maxDate);
      const minPeriodStart = getFridayPeriodStart(minDate);
      const diffTime = maxPeriodStart.getTime() - minPeriodStart.getTime();
      const totalWeeks = Math.ceil(diffTime / (7 * 24 * 3600 * 1000)) + 1;

      const getWeekIndex = (date: Date) => {
          const periodStart = getFridayPeriodStart(date);
          const diff = maxPeriodStart.getTime() - periodStart.getTime();
          return Math.round(diff / (7 * 24 * 3600 * 1000)); 
      };

      const getWeekDateRange = (index: number) => {
        const start = new Date(maxPeriodStart);
        start.setDate(maxPeriodStart.getDate() - (index * 7));
        const end = new Date(start);
        end.setDate(start.getDate() + 6);
        end.setHours(23, 59, 59, 999);
        return { start, end };
      };

      const skuCounts: Record<string, AggregatedSku> = {};

      points.forEach(pt => {
          // Resolve Master SKU
          const masterSku = map[pt.sku] || pt.sku;
          
          if (!skuCounts[masterSku]) {
              skuCounts[masterSku] = {
                  sku: masterSku,
                  totalSold: 0,
                  totalRevenue: 0,
                  detectedAliases: {},
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

          const skuData = skuCounts[masterSku];
          
          // Record Alias if used
          if (pt.sku !== masterSku) {
              skuData.detectedAliases[pt.platform] = pt.sku;
          }

          skuData.totalSold += pt.quantity;
          skuData.totalRevenue += pt.revenue;
          if (pt.unitCost > 0) skuData.totalCostVolume += (pt.unitCost * pt.quantity);
          if (!skuData.subcategory && pt.subcategory) skuData.subcategory = pt.subcategory;

          skuData.totalSellingFee += pt.sellingFee;
          skuData.totalAdsFee += pt.adsFee;
          skuData.totalPostage += pt.postage;
          skuData.totalExtraFreight += pt.extraFreight;
          skuData.totalOtherFee += pt.otherFee;
          skuData.totalSubFee += pt.subscriptionFee;
          skuData.totalWmsFee += pt.wmsFee;

          const updateBounds = (key: keyof typeof skuData.feeBounds, val: number) => {
            skuData.feeBounds[key].min = Math.min(skuData.feeBounds[key].min, val);
            skuData.feeBounds[key].max = Math.max(skuData.feeBounds[key].max, val);
          };
          
          if (pt.quantity > 0) {
            if (pt.sellingFee > 0) updateBounds('sellingFee', pt.sellingFee / pt.quantity);
            if (pt.adsFee > 0) updateBounds('adsFee', pt.adsFee / pt.quantity);
            if (pt.postage > 0) updateBounds('postage', pt.postage / pt.quantity);
          }

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
          weekStat.totalFees += (pt.sellingFee + pt.adsFee + pt.postage + pt.otherFee + pt.subscriptionFee + pt.wmsFee);
          if (pt.unitCost > 0) weekStat.totalCostVolume += (pt.unitCost * pt.quantity);
      });

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
      const w0 = getWeekDateRange(0);
      const w1 = getWeekDateRange(1);

      setAnalysis({
          dateRange: { start: minDate, end: maxDate },
          totalOrders: points.length,
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
    const calcPrice = (revenue: number, qty: number, fallback: number) => {
        if (qty <= 0) return fallback;
        const exVat = revenue / qty;
        return Number((exVat * 1.2).toFixed(2));
    };

    Object.values(analysis.skuCounts).forEach((agg: AggregatedSku) => {
      const existingIndex = updatedProducts.findIndex(p => p.sku === agg.sku);
      const existingProduct = existingIndex !== -1 ? updatedProducts[existingIndex] : null;
      
      const fileAvgPrice = calcPrice(agg.totalRevenue, agg.totalSold, 0);
      const fileAvgCost = agg.totalSold > 0 && agg.totalCostVolume > 0 ? agg.totalCostVolume / agg.totalSold : 0;

      const w0 = agg.weeklyStats[0];
      const w1 = agg.weeklyStats[1];
      const w0Fallback = existingProduct ? existingProduct.currentPrice : fileAvgPrice;
      const w1Fallback = existingProduct ? (existingProduct.oldPrice || existingProduct.currentPrice) : fileAvgPrice;
      const currentWeekPrice = w0 ? calcPrice(w0.revenue, w0.sold, w0Fallback) : w0Fallback;
      const lastWeekPrice = w1 ? calcPrice(w1.revenue, w1.sold, w1Fallback) : w1Fallback;
      const dailyVelocity = Number(agg.velocity.toFixed(2));
      const avgFee = (total: number) => agg.totalSold > 0 ? Number((total / agg.totalSold).toFixed(2)) : 0;

      const totalDurationDays = Math.max(1, analysis.totalWeeksFound * 7);
      
      const finalChannels: ChannelData[] = Object.values(agg.channelStats).map(cs => {
          // If this channel used a specific alias, capture it.
          // Note: Aggregation grouped by Master SKU, but we stored aliases in `detectedAliases` by platform.
          const alias = agg.detectedAliases[cs.platform];
          
          return {
            platform: cs.platform,
            manager: cs.manager,
            velocity: Number((cs.totalSold / totalDurationDays).toFixed(2)),
            price: calcPrice(cs.totalRevenue, cs.totalSold, fileAvgPrice),
            skuAlias: alias
          };
      });

      // Preserve existing aliases if no new one found for a platform
      if (existingProduct) {
          existingProduct.channels.forEach(oldC => {
              const newC = finalChannels.find(nc => nc.platform === oldC.platform && nc.manager === oldC.manager);
              if (newC && !newC.skuAlias && oldC.skuAlias) {
                  newC.skuAlias = oldC.skuAlias;
              }
          });
      }

      // History Generation
      Object.values(agg.weeklyStats).forEach(stat => {
          if (stat.sold > 0) {
              const price = calcPrice(stat.revenue, stat.sold, 0);
              const weeklyVelocity = Number((stat.sold / 7).toFixed(2));
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
            <p className="text-sm text-gray-500 mt-1">
                {currentStep === 'review_mappings' ? 'Review & Merge SKU Aliases' : 'Aggregates sales by SKU and builds historical weekly performance data.'}
            </p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto">
          {isProcessing ? (
             <div className="flex flex-col items-center justify-center h-64 space-y-4">
                <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
                <p className="text-gray-600 font-medium">Processing report...</p>
             </div>
          ) : currentStep === 'upload' ? (
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
            </div>
          ) : currentStep === 'review_mappings' ? (
              <div className="space-y-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <div>
                          <p className="font-bold">Alias Detection</p>
                          <p>We found {mappingCandidates.length} SKUs that look like variations of existing products. Please review the suggested mappings below.</p>
                      </div>
                  </div>

                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-gray-50 text-gray-500 font-medium">
                              <tr>
                                  <th className="p-3">Imported SKU (Alias)</th>
                                  <th className="p-3">Platform</th>
                                  <th className="p-3">Master SKU Match</th>
                                  <th className="p-3 text-right">Action</th>
                              </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                              {mappingCandidates.map((cand, idx) => (
                                  <tr key={idx} className="hover:bg-gray-50">
                                      <td className="p-3 font-mono text-gray-600">{cand.importSku}</td>
                                      <td className="p-3">
                                          <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">{cand.platform}</span>
                                      </td>
                                      <td className="p-3">
                                          <div className="flex items-center gap-2 font-bold text-gray-900">
                                              <ArrowRight className="w-4 h-4 text-gray-400" />
                                              {cand.masterSku}
                                          </div>
                                      </td>
                                      <td className="p-3 text-right">
                                          <div className="flex justify-end gap-2">
                                              <button 
                                                onClick={() => handleMappingDecision(cand, true)}
                                                className="p-1.5 bg-green-100 text-green-700 rounded hover:bg-green-200 transition-colors"
                                                title="Confirm: Merge sales into Master SKU"
                                              >
                                                  <LinkIcon className="w-4 h-4" />
                                              </button>
                                              <button 
                                                onClick={() => handleMappingDecision(cand, false)}
                                                className="p-1.5 bg-gray-100 text-gray-500 rounded hover:bg-gray-200 transition-colors"
                                                title="Reject: Create as separate product"
                                              >
                                                  <Unlink className="w-4 h-4" />
                                              </button>
                                          </div>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              </div>
          ) : analysis ? (
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
                              <td className="p-3 font-mono text-xs font-medium">
                                  {item.sku}
                                  {Object.keys(item.detectedAliases).length > 0 && (
                                      <span className="ml-2 px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded text-[10px]">
                                          {Object.keys(item.detectedAliases).length} Alias
                                      </span>
                                  )}
                              </td>
                              <td className="p-3 text-indigo-600 font-semibold">{item.velocity.toFixed(2)}</td>
                              <td className="p-3 text-right">{activeWeeks}</td>
                              <td className="p-3 text-right font-mono text-xs text-gray-500">£{avgFee.toFixed(2)}</td>
                              <td className="p-3 text-right font-mono text-xs text-gray-700">£{avgCost.toFixed(2)}</td>
                            </tr>
                          );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
           <button 
            onClick={() => { setAnalysis(null); setDragActive(false); setError(null); setCurrentStep('upload'); }}
            className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors"
          >
            Reset
          </button>
          
          {currentStep === 'review_mappings' && (
              <button 
                onClick={finishMappingReview}
                className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-md transition-all flex items-center gap-2"
              >
                  Continue
                  <ArrowRight className="w-4 h-4" />
              </button>
          )}

          {currentStep === 'confirm' && analysis && (
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
