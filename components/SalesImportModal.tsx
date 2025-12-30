
import React, { useState, useRef, useMemo } from 'react';
import { Product, PricingRules, HistoryPayload, ShipmentLog } from '../types';
import { Upload, X, FileBarChart, AlertCircle, Check, Loader2, RefreshCw, Calendar, ArrowRight, HelpCircle, Settings2, DollarSign, Tag, Truck, RotateCcw, Search } from 'lucide-react';
import * as XLSX from 'xlsx';

export type { HistoryPayload };

interface SalesImportModalProps {
    products: Product[];
    pricingRules: PricingRules;
    learnedAliases?: Record<string, string>;
    onClose: () => void;
    onResetData?: () => void;
    onConfirm: (
        updatedProducts: Product[],
        dateLabels?: { current: string, last: string },
        historyPayload?: HistoryPayload[],
        shipmentLogs?: ShipmentLog[],
        discoveredPlatforms?: string[]
    ) => void;
}

interface ColumnMapping {
    sku: string;
    qty: string;
    revenue: string;
    date?: string;
    platform?: string;
    platformLevel2?: string; // New: Detect FBA/FBM distinction
    // Extended ERP Columns
    category?: string;
    cogs?: string;
    sellingFee?: string;
    adsFee?: string;
    postage?: string;
    logisticsService?: string; // New field for rate calibration
    extraFreight?: string;
    otherFee?: string;
    subscriptionFee?: string;
    wmsFee?: string;
    profitExclRn?: string; // New: Absolute Profit currency
    profitExclRnPercent?: string; // New: Net PM%
    outerOrderId?: string; // New: Unique Order ID
}

const SalesImportModal: React.FC<SalesImportModalProps> = ({ products, pricingRules, learnedAliases = {}, onClose, onResetData, onConfirm }) => {
    const [step, setStep] = useState<'upload' | 'mapping' | 'resolution' | 'preview'>('upload');
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);

    const [rawHeaders, setRawHeaders] = useState<string[]>([]);
    const [rawRows, setRawRows] = useState<any[][]>([]);

    const [mapping, setMapping] = useState<ColumnMapping>({ sku: '', qty: '', revenue: '' });
    const [periodDays, setPeriodDays] = useState<number>(30); // Default to 30 days calculation if no dates
    const [showAdvancedMapping, setShowAdvancedMapping] = useState(false);

    const [previewData, setPreviewData] = useState<any>(null);
    const [unknownSkus, setUnknownSkus] = useState<Record<string, { count: number, revenue: number, masterSku: string | null }>>({});

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files?.[0]) processFile(e.target.files[0]);
    };

    const processFile = (file: File) => {
        setIsProcessing(true);
        setError(null);

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = e.target?.result;
                let rows: any[][] = [];
                if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
                    const workbook = XLSX.read(data, { type: 'array', cellDates: true });
                    const sheet = workbook.Sheets[workbook.SheetNames[0]];
                    rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });
                } else {
                    const text = data as string;
                    rows = text.split('\n').map(l => l.split(','));
                }

                if (rows.length < 2) throw new Error("File empty or missing headers");

                // Clean headers
                const headers = rows[0].map(h => String(h).trim());
                setRawHeaders(headers);
                setRawRows(rows.slice(1));

                // --- AUTO DETECT MAPPING ---
                const normalize = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
                const findMapped = (candidates: string[], fuzzy = false) => {
                    const normalizedHeaders = headers.map(h => ({ original: h, normalized: normalize(h) }));

                    for (const rawCand of candidates) {
                        const cand = normalize(rawCand);
                        const isPercentCand = rawCand.includes('%') || rawCand.toLowerCase().includes('percent');

                        // Pass 1: Strict match with symbol requirement
                        const strictMatch = normalizedHeaders.find(h => {
                            const hasPercentSymbol = h.original.includes('%') || h.original.toLowerCase().includes('percent');
                            if (isPercentCand && !hasPercentSymbol) return false;
                            // If it's NOT a percent candidate, but the header IS a percent header, avoid it
                            if (!isPercentCand && hasPercentSymbol) return false;
                            return h.normalized === cand;
                        });
                        if (strictMatch) return strictMatch.original;
                    }

                    for (const rawCand of candidates) {
                        const cand = normalize(rawCand);
                        const isPercentCand = rawCand.includes('%') || rawCand.toLowerCase().includes('percent');

                        // Pass 2: Fuzzy match with symbol requirement
                        if (fuzzy) {
                            const fuzzyMatch = normalizedHeaders.find(h => {
                                const hasPercentSymbol = h.original.includes('%') || h.original.toLowerCase().includes('percent');
                                if (isPercentCand && !hasPercentSymbol) return false;
                                if (!isPercentCand && hasPercentSymbol) return false;
                                return h.normalized.includes(cand);
                            });
                            if (fuzzyMatch) return fuzzyMatch.original;
                        }
                    }

                    // Pass 3: Last resort Fallback
                    for (const rawCand of candidates) {
                        const cand = normalize(rawCand);
                        const match = headers.find(h => normalize(h) === cand);
                        if (match) return match;
                    }

                    return '';
                };

                const detectedMapping: ColumnMapping = {
                    sku: findMapped(['skucode', 'sku', 'sellersku', 'itemnumber']),
                    qty: findMapped(['skuquantity', 'qty', 'quantity', 'units', 'sold']),
                    revenue: findMapped(['salesamt', 'revenue', 'totalprice', 'price', 'grosssales']),
                    date: findMapped(['ordertime', 'date', 'orderdate', 'created']),
                    platform: findMapped(['platformnamelevel1', 'platform', 'source', 'channel', 'marketplace']),
                    platformLevel2: findMapped(['platformnamelevel2', 'fulfillment', 'subsource']),

                    // ERP Specific
                    category: findMapped(['category', 'maincategory']),
                    cogs: findMapped(['cogs', 'cost', 'unitcost']),
                    sellingFee: findMapped(['sellingfee', 'commission', 'referralfee']),
                    adsFee: findMapped(['adsfee', 'adspend', 'ppc', 'sponsored']),
                    postage: findMapped(['postage', 'shipping', 'freight', 'delivery']),
                    logisticsService: findMapped(['logisticsname', 'logistics_name', 'service', 'courier', 'shippingmethod']),
                    extraFreight: findMapped(['extrafreight', 'shippingincome', 'shippingcharge']),
                    otherFee: findMapped(['otherfee']),
                    subscriptionFee: findMapped(['subscriptionfee']),
                    wmsFee: findMapped(['wmsfee', 'fulfillment', 'pickpack']),
                    profitExclRn: findMapped(['profit_excl_rn', 'netprofit', 'profitamount'], false),
                    profitExclRnPercent: findMapped(['profit_excl_rn%', 'netpm', 'profit%', 'margin%'], true),
                    outerOrderId: findMapped(['outer_order_id', 'order_id', 'orderid', 'order_no', 'ordernumber'], false)
                };

                setMapping(detectedMapping);

                // ** AUTO-SKIP LOGIC **
                // If we found the big 3 (SKU, Qty, Revenue), skip the mapping screen!
                if (detectedMapping.sku && detectedMapping.qty && detectedMapping.revenue) {
                    analyzeData(headers, rows.slice(1), detectedMapping);
                } else {
                    setStep('mapping');
                }

            } catch (err) {
                console.error(err);
                setError("Failed to parse file.");
            } finally {
                setIsProcessing(false);
            }
        };

        if (file.name.endsWith('.xlsx')) reader.readAsArrayBuffer(file);
        else reader.readAsText(file);
    };

    const getFridayWeekStart = (date: Date) => {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const day = d.getDay(); // 0 Sun, 1 Mon, 2 Tue, 3 Wed, 4 Thu, 5 Fri, 6 Sat
        // Target: Friday (5).
        const diff = (day + 2) % 7;
        d.setDate(d.getDate() - diff);
        return d.toISOString().split('T')[0];
    };

    const analyzeData = (headers: string[], rows: any[][], map: ColumnMapping) => {
        try {
            const getIdx = (col?: string) => col ? headers.indexOf(col) : -1;

            const skuIdx = getIdx(map.sku);
            const qtyIdx = getIdx(map.qty);
            const revIdx = getIdx(map.revenue);
            const dateIdx = getIdx(map.date);
            const platIdx = getIdx(map.platform);
            const plat2Idx = getIdx(map.platformLevel2);

            // Fee Indices
            const cogsIdx = getIdx(map.cogs);
            const catIdx = getIdx(map.category);
            const sellingIdx = getIdx(map.sellingFee);
            const adsIdx = getIdx(map.adsFee);
            const postIdx = getIdx(map.postage);
            const logNameIdx = getIdx(map.logisticsService); // Logistics Name Index
            const extraIdx = getIdx(map.extraFreight);
            const otherIdx = getIdx(map.otherFee);
            const subIdx = getIdx(map.subscriptionFee);
            const wmsIdx = getIdx(map.wmsFee);
            const profitIdx = getIdx(map.profitExclRn);
            const netPmIdx = getIdx(map.profitExclRnPercent);
            const orderIdIdx = getIdx(map.outerOrderId); // Index for Order ID

            // 1. Overall Aggregation (For Product Updates - Snapshot)
            const aggregated: Record<string, {
                qty: number,
                revenue: number,
                count: number,
                dates: Set<string>,
                fees: { selling: number, ads: number, postage: number, extra: number, other: number, sub: number, wms: number, cogs: number },
                netPmSum: number,
                profitSum: number, // Absolute profit
                category: string,
                platformStats: Record<string, { qty: number, revenue: number }>
            }> = {};

            // 2. Daily Aggregation (For History Payload)
            // Key: SKU + Date + Platform
            const dailyAggregated: Record<string, {
                sku: string,
                date: string,
                totalQty: number,
                totalRevenue: number,
                netPmSum: number,
                totalProfit: number, // New: Absolute profit for this daily bucket
                platform: string,
                orderId?: string; // New: optional orderId
            }> = {};

            const discoveredPlatforms = new Set<string>();

            let minDate = new Date();
            let maxDate = new Date(0);
            let hasDates = false;

            // Collections for Logs
            const shipmentLogs: ShipmentLog[] = [];

            // Alias Map
            const aliasMap: Record<string, string> = {};
            products.forEach(p => {
                aliasMap[p.sku.toUpperCase()] = p.sku;
                p.channels.forEach(c => {
                    if (c.skuAlias) {
                        c.skuAlias.split(',').forEach(a => aliasMap[a.trim().toUpperCase()] = p.sku);
                    }
                });
            });

            // Add Learned Aliases to lookup
            /* FIX: Explicitly cast entries of learnedAliases to avoid 'unknown' type assignment issues */
            (Object.entries(learnedAliases) as [string, string][]).forEach(([alias, master]) => {
                const aliasUpper = alias.toUpperCase();
                if (!aliasMap[aliasUpper]) aliasMap[aliasUpper] = master;
            });

            const currentUnknownSkus: Record<string, { count: number, revenue: number, masterSku: string | null }> = {};
            let matchCount = 0;
            let skipCount = 0;

            rows.forEach(row => {
                if (!row[skuIdx]) return;

                const parseVal = (idx: number) => {
                    if (idx === -1 || row[idx] === undefined || row[idx] === null || row[idx] === '') return 0;
                    const val = row[idx];
                    if (typeof val === 'number') return val;
                    // Robust numeric parsing
                    const str = String(val).replace(/[^\d.-]/g, '').trim();
                    const v = parseFloat(str);
                    return isNaN(v) ? 0 : v;
                };

                const rev = parseVal(revIdx);

                // --- CRITICAL FIX: IGNORE ZERO/NEGATIVE REVENUE ---
                // Strictly ignore non-sales (replacements, transfers) to fix Weighted Average Price.
                if (rev <= 0.001) return;

                const rawSku = String(row[skuIdx]).trim();
                const rawSkuUpper = rawSku.toUpperCase();

                // Robust Alias Matching: Try exact, then alias, then handle potential suffixes
                let masterSku = aliasMap[rawSkuUpper];
                if (!masterSku) {
                    // Try case-insensitive exact match in products
                    const directMatch = products.find(p => p.sku.toUpperCase() === rawSkuUpper);
                    if (directMatch) masterSku = directMatch.sku;
                }

                if (!masterSku) {
                    if (!currentUnknownSkus[rawSku]) {
                        currentUnknownSkus[rawSku] = { count: 0, revenue: 0, masterSku: null };
                    }
                    currentUnknownSkus[rawSku].count++;
                    currentUnknownSkus[rawSku].revenue += rev;
                    skipCount++;
                    return;
                }

                matchCount++;

                // Helper for Percentage Parsing (handles "31.45%", "-1.88%", 0.05)
                const parsePercent = (idx: number) => {
                    if (idx === -1 || row[idx] === undefined || row[idx] === null || row[idx] === '') return 0;
                    const val = row[idx];
                    if (typeof val === 'number') {
                        // If it's in the range (-1, 1] and not 0, it's likely a decimal fraction (e.g. 0.317 -> 31.7%)
                        // Most retail margins imported from Excel "Percentage" cells arrive as decimals.
                        if (Math.abs(val) > 0 && Math.abs(val) <= 1.0) {
                            return val * 100;
                        }
                        return val;
                    }
                    const str = String(val).replace('%', '').replace(/[^\d.-]/g, '').trim();
                    const v = parseFloat(str);
                    return isNaN(v) ? 0 : v;
                };

                const qty = parseVal(qtyIdx);
                // rev is already parsed above
                const profit = parseVal(profitIdx);
                const netPm = parsePercent(netPmIdx);

                // Capture Platform Logic (Prioritize Level 2, but provide context if needed)
                let platformName = 'Unknown';

                const p1 = (platIdx !== -1 && row[platIdx]) ? String(row[platIdx]).trim() : '';
                const p2 = (plat2Idx !== -1 && row[plat2Idx]) ? String(row[plat2Idx]).trim() : '';

                if (p2 && p2 !== '-' && p2.toLowerCase() !== 'unknown') {
                    if (p1 && !p2.toLowerCase().includes(p1.toLowerCase()) && p2.length < 5) {
                        platformName = `${p1} ${p2}`;
                    } else {
                        platformName = p2;
                    }
                } else if (p1) {
                    platformName = p1;
                }

                // Capture Order ID if available
                const orderId = (orderIdIdx !== -1 && row[orderIdIdx])
                    ? String(row[orderIdIdx]).trim()
                    : '';

                discoveredPlatforms.add(platformName);

                // Check Exclusion Rules (Robust & Case-Insensitive)
                let isExcluded = false;
                if (pricingRules[platformName]?.isExcluded) {
                    isExcluded = true;
                } else {
                    const normPlat = platformName.toLowerCase().trim();
                    const matchedKey = Object.keys(pricingRules).find(k => k.toLowerCase().trim() === normPlat);
                    if (matchedKey && pricingRules[matchedKey].isExcluded) {
                        isExcluded = true;
                    }
                }

                // --- Overall Aggregation ---
                if (!aggregated[masterSku]) aggregated[masterSku] = {
                    qty: 0, revenue: 0, count: 0, dates: new Set(),
                    fees: { selling: 0, ads: 0, postage: 0, extra: 0, other: 0, sub: 0, wms: 0, cogs: 0 },
                    netPmSum: 0,
                    profitSum: 0,
                    category: '',
                    platformStats: {}
                };

                const item = aggregated[masterSku];

                // Only add to GLOBAL Totals if NOT excluded
                if (!isExcluded) {
                    item.qty += qty;
                    item.revenue += rev;
                    item.count++;

                    const weight = Math.abs(qty) || 1;
                    item.netPmSum += (netPm * weight);
                    item.profitSum += profit;

                    // Aggregating Fees (only for included retail channels)
                    const postageCost = parseVal(postIdx);
                    item.fees.selling += parseVal(sellingIdx);
                    item.fees.ads += parseVal(adsIdx);
                    item.fees.postage += postageCost;
                    item.fees.extra += parseVal(extraIdx);
                    item.fees.other += parseVal(otherIdx);
                    item.fees.sub += parseVal(subIdx);
                    item.fees.wms += parseVal(wmsIdx);
                    item.fees.cogs += parseVal(cogsIdx);
                    
                    if (catIdx !== -1 && row[catIdx]) item.category = String(row[catIdx]).trim();

                    // --- LOGISTICS CALIBRATION ---
                    const serviceName = (logNameIdx !== -1 && row[logNameIdx]) ? String(row[logNameIdx]).trim() : '';
                    const dLog = (dateIdx !== -1 && row[dateIdx]) ? new Date(row[dateIdx]) : new Date();
                    if (qty === 1 && serviceName && postageCost > 0) {
                        shipmentLogs.push({
                            id: Math.random().toString(36).substr(2, 9),
                            sku: masterSku,
                            service: serviceName,
                            cost: postageCost,
                            date: dLog.toISOString()
                        });
                    }
                }

                // ALWAYS Aggregate Platform Stats for Channel update
                if (!item.platformStats[platformName]) {
                    item.platformStats[platformName] = { qty: 0, revenue: 0 };
                }
                item.platformStats[platformName].qty += qty;
                item.platformStats[platformName].revenue += rev;

                const d = (dateIdx !== -1 && row[dateIdx]) ? new Date(row[dateIdx]) : new Date();
                if (dateIdx !== -1 && row[dateIdx] && !isNaN(d.getTime())) {
                    hasDates = true;
                    if (d < minDate) minDate = d;
                    if (d > maxDate) maxDate = d;

                    const formatDateYmd = (date: Date) => {
                        const y = date.getFullYear();
                        const m = String(date.getMonth() + 1).padStart(2, '0');
                        const day = String(date.getDate()).padStart(2, '0');
                        return `${y}-${m}-${day}`;
                    };

                    const dateStr = formatDateYmd(d);

                    // --- Daily Aggregation for History (INCLUSIVE: show all platforms) ---
                    // If Order ID exists, include it in key to prevent aggregation (keep transaction level)
                    const dailyKey = orderId
                        ? `${masterSku}|${dateStr}|${platformName}|${orderId}`
                        : `${masterSku}|${dateStr}|${platformName}`;

                    if (!dailyAggregated[dailyKey]) {
                        dailyAggregated[dailyKey] = {
                            sku: masterSku,
                            date: dateStr,
                            totalQty: 0,
                            totalRevenue: 0,
                            netPmSum: 0,
                            totalProfit: 0,
                            platform: platformName,
                            orderId: orderId || undefined // Store orderId if present
                        };
                    }
                    dailyAggregated[dailyKey].totalQty += qty;
                    dailyAggregated[dailyKey].totalRevenue += rev;
                    const dailyWeight = Math.abs(qty) || 0;
                    dailyAggregated[dailyKey].netPmSum += (netPm * dailyWeight);

                    // Improved Logic: If profit is missing but NetPM exists, derive profit immediately
                    if (profit === 0 && netPm !== 0 && rev !== 0) {
                        dailyAggregated[dailyKey].totalProfit += rev * (netPm / 100);
                    } else {
                        dailyAggregated[dailyKey].totalProfit += profit;
                    }

                    if (!isExcluded) {
                        item.dates.add(dateStr);
                    }
                }
            });

            // Calculate Period
            let calculatedPeriod = periodDays;
            let dateLabel = "Manual Period";

            if (hasDates && maxDate > minDate) {
                const diffTime = Math.abs(maxDate.getTime() - minDate.getTime());
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // inclusive
                calculatedPeriod = diffDays;
                dateLabel = `${minDate.toLocaleDateString()} - ${maxDate.toLocaleDateString()}`;
            }

            // Build Updates & History
            const updates: Product[] = [];
            const history: HistoryPayload[] = [];
            const todayStr = new Date().toISOString().split('T')[0];

            // Create History Logs (Daily Units)
            Object.values(dailyAggregated).forEach(bucket => {
                const weight = bucket.totalQty;
                const avgPrice = weight > 0 ? bucket.totalRevenue / weight : 0;

                // NEW LOGIC: Calculate Margin based on Total Profit / Total Revenue if available
                let finalMargin = 0;
                if (profitIdx !== -1 && bucket.totalRevenue > 0) {
                    finalMargin = (bucket.totalProfit / bucket.totalRevenue) * 100;
                } else {
                    // Fallback: Weighted Averages of the % column
                    finalMargin = weight > 0 ? bucket.netPmSum / weight : 0;
                }

                if (bucket.totalQty !== 0) {
                    const payload: HistoryPayload = {
                        sku: bucket.sku,
                        date: bucket.date,
                        price: isNaN(avgPrice) ? 0 : avgPrice,
                        velocity: isNaN(bucket.totalQty) ? 0 : bucket.totalQty,
                        platform: bucket.platform,
                        orderId: bucket.orderId
                    };

                    if (!isNaN(finalMargin)) {
                        payload.margin = Number(finalMargin.toFixed(4));
                    }

                    if (profitIdx !== -1) {
                        payload.profit = Number(bucket.totalProfit.toFixed(4));
                    }

                    history.push(payload);
                }
            });

            // 2. Generate Product Updates (Global Stats)
            Object.entries(aggregated).forEach(([sku, data]) => {
                const product = products.find(p => p.sku === sku);
                if (!product) return;

                const validQty = data.qty > 0 ? data.qty : 1;
                // Note: averageDailySales here is purely RETAIL velocity if exclusion logic applied
                const newVelocity = data.qty / calculatedPeriod;
                const currentPrice = product.currentPrice || 0;
                const rawAvg = data.qty > 0 ? data.revenue / data.qty : currentPrice;
                const avgPrice = Number((rawAvg || 0).toFixed(2));

                const unitFees = {
                    selling: (Number(data.fees.selling) || 0) / validQty,
                    ads: (Number(data.fees.ads) || 0) / validQty,
                    postage: (Number(data.fees.postage) || 0) / validQty,
                    extra: (Number(data.fees.extra) || 0) / validQty,
                    other: (Number(data.fees.other) || 0) / validQty,
                    sub: (Number(data.fees.sub) || 0) / validQty,
                    wms: (Number(data.fees.wms) || 0) / validQty,
                };

                // Rebuild Channels based on report data (ALL CHANNELS, including Excluded)
                const updatedChannels = [...product.channels];
                Object.entries(data.platformStats).forEach(([platform, stats]) => {
                    const channelIdx = updatedChannels.findIndex(c => c.platform === platform);
                    const channelVelocity = stats.qty / calculatedPeriod;
                    const channelPrice = stats.qty > 0 ? stats.revenue / stats.qty : 0;

                    if (channelIdx >= 0) {
                        updatedChannels[channelIdx] = {
                            ...updatedChannels[channelIdx],
                            velocity: channelVelocity,
                            price: channelPrice
                        };
                    } else {
                        // Add new channel if discovered
                        const defaultManager = pricingRules[platform]?.manager || 'Unassigned';
                        updatedChannels.push({
                            platform,
                            manager: defaultManager,
                            velocity: channelVelocity,
                            price: channelPrice,
                            skuAlias: '' // Will be populated if aliases are imported separately
                        });
                    }
                });

                updates.push({
                    ...product,
                    averageDailySales: newVelocity,
                    previousDailySales: product.averageDailySales,
                    currentPrice: avgPrice,
                    oldPrice: currentPrice,
                    lastUpdated: todayStr,
                    sellingFee: unitFees.selling || product.sellingFee,
                    adsFee: unitFees.ads || product.adsFee,
                    postage: unitFees.postage || product.postage,
                    extraFreight: unitFees.extra || product.extraFreight,
                    otherFee: unitFees.other || product.otherFee,
                    subscriptionFee: unitFees.sub || product.subscriptionFee,
                    wmsFee: unitFees.wms || product.wmsFee,
                    category: data.category || product.category,
                    channels: updatedChannels // Update the channels list!
                });

                // Fallback: If no dates were found in file, push a single 'today' history entry
                if (!hasDates && newVelocity > 0) {
                    // Find primary platform
                    const primaryPlatform = Object.keys(data.platformStats)[0] || 'General';
                    history.push({
                        sku,
                        date: todayStr,
                        price: avgPrice,
                        velocity: newVelocity,
                        margin: 0,
                        platform: primaryPlatform
                    });
                }
            });

            const features = {
                ads: map.adsFee && updates.some(u => u.adsFee && u.adsFee > 0),
                fees: map.sellingFee && updates.some(u => u.sellingFee && u.sellingFee > 0),
                logistics: (map.postage || map.wmsFee) && updates.some(u => (u.postage || 0) + (u.wmsFee || 0) > 0),
                category: map.category && updates.some(u => u.category !== products.find(p => p.sku === u.sku)?.category)
            };

            setPreviewData({
                updates,
                history,
                shipmentLogs,
                features,
                stats: {
                    matchedSkus: updates.length,
                    totalRevenue: Object.values(aggregated).reduce((a, b) => a + b.revenue, 0),
                    period: calculatedPeriod,
                    dateLabel,
                    shipmentCount: shipmentLogs.length,
                    discoveredPlatforms: Array.from(discoveredPlatforms)
                }
            });

            // --- RESOLUTION STEP TRIGGER ---
            if (Object.keys(currentUnknownSkus).length > 0 && step !== 'resolution') {
                setUnknownSkus(currentUnknownSkus);
                setStep('resolution');
                return;
            }

            setStep('preview');

        } catch (err) {
            console.error(err);
            setError("Analysis failed. Please check column mappings.");
        }
    };

    const handleManualAnalyze = () => {
        if (!mapping.sku || !mapping.qty || !mapping.revenue) {
            setError("Please map at least SKU, Quantity, and Revenue.");
            return;
        }
        setIsProcessing(true);
        setTimeout(() => {
            analyzeData(rawHeaders, rawRows, mapping);
            setIsProcessing(false);
        }, 500);
    };

    const mapField = (field: keyof ColumnMapping, value: string) => {
        setMapping(prev => ({ ...prev, [field]: value }));
    };

    const analyzeWithResolutions = () => {
        setIsProcessing(true);
        setTimeout(() => {
            analyzeData(rawHeaders, rawRows, mapping);
            setIsProcessing(false);
        }, 500);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]">
                <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50 rounded-t-xl">
                    <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                            <FileBarChart className="w-5 h-5" />
                        </div>
                        <h2 className="text-xl font-bold text-gray-900">Import Sales Transaction Report</h2>
                    </div>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500" /></button>
                </div>

                <div className="p-6 flex-1 overflow-y-auto relative">
                    {/* RESET CONFIRMATION OVERLAY */}
                    {isResetConfirmOpen && (
                        <div className="absolute inset-0 z-10 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-8 animate-in fade-in duration-200">
                            <div className="bg-red-50 p-4 rounded-full mb-6">
                                <AlertCircle className="w-12 h-12 text-red-600" />
                            </div>
                            <h3 className="text-2xl font-bold text-gray-900 mb-2">Are you sure?</h3>
                            <p className="text-gray-500 text-center max-w-md mb-8">
                                This will <strong>permanently delete</strong> all imported sales history, custom product limits, and derived metrics. This action cannot be undone.
                            </p>
                            <div className="flex gap-4">
                                <button
                                    onClick={() => setIsResetConfirmOpen(false)}
                                    className="px-6 py-3 text-gray-700 font-bold hover:bg-gray-100 rounded-xl transition-colors"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={() => {
                                        onResetData?.();
                                        setIsResetConfirmOpen(false);
                                    }}
                                    className="px-6 py-3 bg-red-600 text-white font-bold rounded-xl hover:bg-red-700 shadow-lg hover:shadow-red-500/30 transition-all flex items-center gap-2"
                                >
                                    <RotateCcw className="w-4 h-4" />
                                    Yes, Wipe Everything
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'upload' && (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div
                                className="border-2 border-dashed border-gray-300 rounded-xl p-10 flex flex-col items-center justify-center hover:bg-gray-50 transition-colors cursor-pointer"
                                onClick={() => fileInputRef.current?.click()}
                            >
                                <input ref={fileInputRef} type="file" className="hidden" accept=".csv, .xlsx" onChange={handleFileChange} />
                                {isProcessing ? (
                                    <div className="flex flex-col items-center animate-in fade-in zoom-in">
                                        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin mb-3" />
                                        <p className="font-medium text-indigo-600">Auto-detecting Columns...</p>
                                    </div>
                                ) : (
                                    <>
                                        <Upload className="w-10 h-10 text-gray-400 mb-4" />
                                        <p className="font-medium text-gray-700">Click to upload Transaction Report</p>
                                        <p className="text-sm text-gray-500 mt-1">Supports CSV or Excel from ERP</p>
                                    </>
                                )}
                                {error && <p className="text-red-500 mt-4 text-sm flex items-center gap-1"><AlertCircle className="w-4 h-4" /> {error}</p>}
                            </div>

                            {/* Reset button moved to footer for better global visibility */}
                        </div>
                    )}

                    {step === 'mapping' && (
                        <div className="space-y-6 animate-in slide-in-from-right duration-300">
                            <div className="flex items-center justify-between">
                                <p className="text-sm text-gray-600">We couldn't auto-match everything. Please confirm columns.</p>
                                <button
                                    onClick={() => setShowAdvancedMapping(!showAdvancedMapping)}
                                    className="text-xs text-indigo-600 font-medium flex items-center gap-1 hover:underline"
                                >
                                    <Settings2 className="w-3 h-3" />
                                    {showAdvancedMapping ? 'Hide Advanced Fees' : 'Show Advanced Fees'}
                                </button>
                            </div>

                            <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                <MappingSelect label="SKU (sku_code)" value={mapping.sku} onChange={(v: string) => mapField('sku', v)} options={rawHeaders} required />
                                <MappingSelect label="Quantity (sku_quantity)" value={mapping.qty} onChange={(v: string) => mapField('qty', v)} options={rawHeaders} required />
                                <MappingSelect label="Revenue (sales_amt)" value={mapping.revenue} onChange={(v: string) => mapField('revenue', v)} options={rawHeaders} required />
                                <MappingSelect label="Date (order_time)" value={mapping.date} onChange={(v: string) => mapField('date', v)} options={rawHeaders} />
                                <MappingSelect label="Platform Level 1" value={mapping.platform} onChange={(v: string) => mapField('platform', v)} options={rawHeaders} />
                                <MappingSelect label="Platform Level 2 (Subsource)" value={mapping.platformLevel2} onChange={(v: string) => mapField('platformLevel2', v)} options={rawHeaders} />
                            </div>

                            {showAdvancedMapping && (
                                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-4 animate-in fade-in slide-in-from-top-2">
                                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wide">Fees & Logistics (Optional)</h4>
                                    <div className="grid grid-cols-2 gap-x-6 gap-y-4">
                                        <MappingSelect label="Selling Fee" value={mapping.sellingFee} onChange={(v: string) => mapField('sellingFee', v)} options={rawHeaders} />
                                        <MappingSelect label="Ad Spend / PPC" value={mapping.adsFee} onChange={(v: string) => mapField('adsFee', v)} options={rawHeaders} />
                                        <MappingSelect label="Postage Cost" value={mapping.postage} onChange={(v: string) => mapField('postage', v)} options={rawHeaders} />
                                        <MappingSelect label="Logistics Name (Service)" value={mapping.logisticsService} onChange={(v: string) => mapField('logisticsService', v)} options={rawHeaders} />
                                        <MappingSelect label="WMS Fee" value={mapping.wmsFee} onChange={(v: string) => mapField('wmsFee', v)} options={rawHeaders} />
                                        <MappingSelect label="Extra Freight (Income)" value={mapping.extraFreight} onChange={(v: string) => mapField('extraFreight', v)} options={rawHeaders} />
                                        <MappingSelect label="Category" value={mapping.category} onChange={(v: string) => mapField('category', v)} options={rawHeaders} />
                                        <MappingSelect label="Net PM% (profit_excl_rn%)" value={mapping.profitExclRnPercent} onChange={(v: string) => mapField('profitExclRnPercent', v)} options={rawHeaders} />
                                    </div>
                                </div>
                            )}

                            {!mapping.date && (
                                <div className="bg-yellow-50 p-3 rounded border border-yellow-100 flex items-center gap-3">
                                    <Calendar className="w-4 h-4 text-yellow-600" />
                                    <div className="flex-1">
                                        <label className="block text-xs font-bold text-yellow-800 uppercase mb-1">Manual Period (Days)</label>
                                        <input
                                            type="number"
                                            value={periodDays}
                                            onChange={e => setPeriodDays(parseInt(e.target.value) || 1)}
                                            className="border rounded p-1 w-20 text-sm"
                                        />
                                    </div>
                                </div>
                            )}
                            {error && <p className="text-red-500 text-sm">{error}</p>}
                        </div>
                    )}

                    {step === 'resolution' && (
                        <div className="space-y-6 animate-in slide-in-from-right duration-300">
                            <div className="flex items-center gap-3 p-4 bg-indigo-50 text-indigo-700 rounded-xl border border-indigo-100">
                                <HelpCircle className="w-5 h-5 flex-shrink-0" />
                                <div className="text-sm">
                                    <p className="font-bold">Unknown SKUs Detected</p>
                                    <p className="opacity-80">These codes aren't in your inventory yet. Map them to a Master SKU to include them.</p>
                                </div>
                            </div>

                            <div className="max-h-[50vh] overflow-y-auto border border-gray-200 rounded-xl">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-medium sticky top-0 shadow-sm z-10">
                                        <tr>
                                            <th className="p-3">Unknown Code (In File)</th>
                                            <th className="p-3 text-center">Qty / Orders</th>
                                            <th className="p-3">Map to Master SKU</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {/* FIX: Explicitly cast entries of unknownSkus to avoid 'unknown' type access issues */}
                                        {(Object.entries(unknownSkus) as [string, { count: number, revenue: number, masterSku: string | null }][]).map(([fileSku, data]) => (
                                            <tr key={fileSku}>
                                                <td className="p-3 font-mono text-xs text-gray-700">{fileSku}</td>
                                                <td className="p-3 text-center text-gray-500">{data.count}</td>
                                                <td className="p-3">
                                                    <div className="relative">
                                                        <input
                                                            type="text"
                                                            list="masterSkuList"
                                                            value={data.masterSku || ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setUnknownSkus(prev => ({
                                                                    ...prev,
                                                                    [fileSku]: { ...prev[fileSku], masterSku: val }
                                                                }));
                                                            }}
                                                            placeholder="Search inventory..."
                                                            className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg text-xs font-mono focus:ring-2 focus:ring-indigo-500"
                                                        />
                                                        <Search className="w-4 h-4 text-gray-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            {/* Datalist for inventory autocomplete */}
                            <datalist id="masterSkuList">
                                {products.map(p => <option key={p.id} value={p.sku}>{p.name}</option>)}
                            </datalist>

                            <div className="flex justify-between items-center bg-gray-50 p-4 rounded-xl border border-gray-100">
                                <div className="text-xs text-gray-500">
                                    Mapped SKUs will be remembered globally for future imports.
                                </div>
                                <button
                                    onClick={() => {
                                        // Re-analyze with new mappings
                                        // We basically take the manual mappings and append them to transient aliasMap
                                        const resolvedAliases = { ...learnedAliases };
                                        /* FIX: Explicitly cast entries of unknownSkus to avoid 'unknown' type access issues */
                                        (Object.entries(unknownSkus) as [string, { count: number, revenue: number, masterSku: string | null }][]).forEach(([fileSku, data]) => {
                                            if (data.masterSku && products.some(p => p.sku === data.masterSku)) {
                                                resolvedAliases[fileSku.toUpperCase()] = data.masterSku;
                                            }
                                        });

                                        analyzeWithResolutions();
                                    }}
                                    className="px-6 py-2 bg-indigo-600 text-white font-bold rounded-lg hover:bg-indigo-700 shadow-md transition-all flex items-center gap-2"
                                >
                                    <Check className="w-4 h-4" />
                                    Continue Analysis
                                </button>
                            </div>
                        </div>
                    )}

                    {step === 'preview' && previewData && (
                        <div className="space-y-6 animate-in zoom-in duration-300">
                            {/* Stats */}
                            <div className="grid grid-cols-3 gap-4 text-center">
                                <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                                    <div className="text-2xl font-bold text-green-700">{previewData.stats.matchedSkus}</div>
                                    <div className="text-xs text-green-600 uppercase font-bold">Products Matched</div>
                                </div>
                                <div className="p-4 bg-indigo-50 rounded-xl border border-indigo-100">
                                    <div className="text-2xl font-bold text-indigo-700">£{previewData.stats.totalRevenue.toLocaleString()}</div>
                                    <div className="text-xs text-indigo-600 uppercase font-bold">Total Revenue</div>
                                </div>
                                <div className="p-4 bg-blue-50 rounded-xl border border-blue-100">
                                    <div className="text-2xl font-bold text-blue-700">{previewData.stats.period} Days</div>
                                    <div className="text-xs text-blue-600 uppercase font-bold">{previewData.stats.dateLabel}</div>
                                </div>
                            </div>

                            {/* Detected Features Badges */}
                            <div className="flex flex-wrap gap-2 justify-center">
                                {previewData.features?.ads && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200">
                                        <Check className="w-3 h-3" /> Ad Data Detected
                                    </span>
                                )}
                                {previewData.features?.logistics && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-orange-100 text-orange-700 text-xs font-bold border border-orange-200">
                                        <Check className="w-3 h-3" /> Logistics Costs Detected
                                    </span>
                                )}
                                {previewData.stats.shipmentCount > 0 && (
                                    <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-teal-100 text-teal-700 text-xs font-bold border border-teal-200">
                                        <Truck className="w-3 h-3" /> {previewData.stats.shipmentCount} Shipments Logged
                                    </span>
                                )}
                            </div>

                            {/* Preview Table */}
                            <div className="border rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-gray-50 text-gray-500 font-bold sticky top-0">
                                        <tr>
                                            <th className="p-3">SKU</th>
                                            <th className="p-3 text-right">Old Vel.</th>
                                            <th className="p-3 text-right">New Vel.</th>
                                            <th className="p-3 text-right">Unit Price</th>
                                            <th className="p-3 text-right">Unit Fees</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {previewData.updates.slice(0, 50).map((u: any, i: number) => {
                                            const totalFees = (u.sellingFee || 0) + (u.adsFee || 0) + (u.postage || 0) + (u.wmsFee || 0);
                                            return (
                                                <tr key={i}>
                                                    <td className="p-3 font-mono text-xs">{u.sku}</td>
                                                    <td className="p-3 text-right text-gray-400">{u.previousDailySales?.toFixed(1) || '-'}</td>
                                                    <td className="p-3 text-right font-bold text-indigo-600">{u.averageDailySales.toFixed(1)}</td>
                                                    <td className="p-3 text-right">£{(u.currentPrice || 0).toFixed(2)}</td>
                                                    <td className="p-3 text-right text-xs text-gray-500">
                                                        {totalFees > 0 ? `£${totalFees.toFixed(2)}` : '-'}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-between items-center rounded-b-xl">
                    <div>
                        {onResetData && (
                            <button
                                onClick={() => setIsResetConfirmOpen(true)} // Trigger Custom UI
                                title="Delete all sales logs and start fresh"
                                className="text-xs font-bold text-red-500 hover:text-red-600 flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-100 hover:bg-red-50 transition-all shadow-sm bg-white"
                            >
                                <RotateCcw className="w-3 h-3" />
                                Reset Data
                            </button>
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button onClick={onClose} className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg">Cancel</button>
                        {step === 'mapping' && (
                            <button
                                onClick={handleManualAnalyze}
                                disabled={isProcessing}
                                className="px-6 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center gap-2"
                            >
                                {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                                Analyze Data
                            </button>
                        )}
                        {step === 'preview' && (
                            <button
                                onClick={() => onConfirm(previewData.updates, { current: previewData.stats.dateLabel, last: "Previous" }, previewData.history, previewData.shipmentLogs, previewData.stats.discoveredPlatforms)}
                                className="px-6 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 flex items-center gap-2 shadow-lg hover:shadow-xl transition-all"
                            >
                                <Check className="w-4 h-4" />
                                Confirm Import
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const MappingSelect = ({ label, value, onChange, options, required }: any) => (
    <div>
        <label className="block text-xs font-bold text-gray-500 uppercase mb-1">
            {label} {required && <span className="text-red-500">*</span>}
        </label>
        <div className="relative">
            <select
                value={value || ''}
                onChange={e => onChange(e.target.value)}
                className={`w-full border rounded-lg py-2 px-3 text-sm appearance-none bg-white focus:ring-2 focus:ring-indigo-500 ${required && !value ? 'border-red-300' : 'border-gray-300'}`}
            >
                <option value="">-- Ignore --</option>
                {options.map((h: string) => <option key={h} value={h}>{h}</option>)}
            </select>
            <div className="absolute right-3 top-2.5 pointer-events-none text-gray-400">
                <ArrowRight className="w-4 h-4 rotate-90" />
            </div>
        </div>
    </div>
);

export default SalesImportModal;
