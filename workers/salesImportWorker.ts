import * as XLSX from 'xlsx';
import { Product, PricingRules, HistoryPayload } from '../types';
import { asDateKeyNaive } from '../services/dateUtils';
import { getCanonicalSku } from '../services/skuNormalization';

function dateKeyToLocal(key: string): Date {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
}

interface ColumnMapping {
    sku: string;
    qty: string;
    revenue: string;
    date?: string;
    platform?: string;
    platformLevel2?: string;
    category?: string;
    cogs?: string;
    promoRebate?: string;
    sellingFee?: string;
    adsFee?: string;
    postage?: string;
    logisticsService?: string;
    extraFreight?: string;
    otherFee?: string;
    subscriptionFee?: string;
    wmsFee?: string;
    profitExclRn?: string;
    profitExclRnPercent?: string;
    outerOrderId?: string;
    orderType?: string;
    receivePostcode?: string;
    logisticPartner?: string;
}

type ProgressPhase = 'reading' | 'parsing' | 'mapping' | 'aggregating' | 'finalizing';

const postProgress = (phase: ProgressPhase, progress: number, message: string) => {
    self.postMessage({
        type: 'progress',
        phase,
        progress: Math.max(0, Math.min(100, Math.round(progress))),
        message
    });
};

const normalizeHeader = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');

const findMappedHeader = (headers: string[], candidates: string[], fuzzy = false): string => {
    const normalizedHeaders = headers.map(h => ({ original: h, normalized: normalizeHeader(h) }));

    for (const rawCand of candidates) {
        const cand = normalizeHeader(rawCand);
        const isPercentCand = rawCand.includes('%') || rawCand.toLowerCase().includes('percent');
        const strictMatch = normalizedHeaders.find(h => {
            const hasPercentSymbol = h.original.includes('%') || h.original.toLowerCase().includes('percent');
            if (isPercentCand && !hasPercentSymbol) return false;
            if (!isPercentCand && hasPercentSymbol) return false;
            return h.normalized === cand;
        });
        if (strictMatch) return strictMatch.original;
    }

    for (const rawCand of candidates) {
        const cand = normalizeHeader(rawCand);
        const isPercentCand = rawCand.includes('%') || rawCand.toLowerCase().includes('percent');
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

    for (const rawCand of candidates) {
        const cand = normalizeHeader(rawCand);
        const match = headers.find(h => normalizeHeader(h) === cand);
        if (match) return match;
    }

    return '';
};

const autoDetectMapping = (headers: string[]): ColumnMapping => {
    return {
        sku: findMappedHeader(headers, ['skucode', 'sku', 'sellersku', 'itemnumber']),
        qty: findMappedHeader(headers, ['sold_qty', 'sku_quantity', 'skuquantity', 'qty', 'quantity', 'units', 'sold']),
        revenue: findMappedHeader(headers, ['salesamt', 'revenue', 'totalprice', 'price', 'grosssales']),
        date: findMappedHeader(headers, ['ordertime', 'date', 'orderdate', 'created']),
        platform: findMappedHeader(headers, ['platformnamelevel1', 'platform', 'source', 'channel', 'marketplace']),
        platformLevel2: findMappedHeader(headers, ['platformnamelevel2', 'fulfillment', 'subsource']),
        category: findMappedHeader(headers, ['category', 'maincategory']),
        cogs: findMappedHeader(headers, ['cogs', 'cost', 'unitcost']),
        promoRebate: findMappedHeader(headers, ['promo_rebate', 'promorebate', 'promotion_rebate', 'discount_amount']),
        sellingFee: findMappedHeader(headers, ['sellingfee', 'commission', 'referralfee']),
        adsFee: findMappedHeader(headers, ['adsfee', 'adspend', 'ppc', 'sponsored']),
        postage: findMappedHeader(headers, ['postage', 'shipping', 'freight', 'delivery']),
        logisticsService: findMappedHeader(headers, ['logisticsname', 'logistics_name', 'service', 'courier', 'shippingmethod']),
        extraFreight: findMappedHeader(headers, ['extrafreight', 'shippingincome', 'shippingcharge']),
        otherFee: findMappedHeader(headers, ['otherfee']),
        subscriptionFee: findMappedHeader(headers, ['subscriptionfee']),
        wmsFee: findMappedHeader(headers, ['wmsfee', 'fulfillment', 'pickpack']),
        profitExclRn: findMappedHeader(headers, ['profit_excl_rn', 'netprofit', 'profitamount'], false),
        profitExclRnPercent: findMappedHeader(headers, ['profit_excl_rn%', 'netpm', 'profit%', 'margin%'], true),
        outerOrderId: findMappedHeader(headers, ['outer_order_id', 'order_id', 'orderid', 'order_no', 'ordernumber', 'transaction_id'], false),
        orderType: findMappedHeader(headers, ['ordertype', 'order_type', 'type'], false),
        receivePostcode: findMappedHeader(headers, ['receive_postcode', 'postcode', 'zip', 'postalcode', 'ship_to_zip'], false),
        logisticPartner: findMappedHeader(headers, ['label_provider', 'shipping_partner', 'logistic_partner', 'carrier_partner'], false)
    };
};

const parseSpreadsheetPayload = (
    fileName: string,
    fileBuffer?: ArrayBuffer,
    fileText?: string
): { headers: string[]; rows: any[][] } => {
    const lowerName = (fileName || '').toLowerCase();

    if ((lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')) && fileBuffer) {
        const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
        if (!rows.length) return { headers: [], rows: [] };
        const headers = rows[0].map(h => String(h ?? '').trim());
        return { headers, rows: rows.slice(1) };
    }

    const text = fileText || '';
    const parsed = text.split('\n').map(l => l.split(','));
    if (!parsed.length) return { headers: [], rows: [] };
    const headers = parsed[0].map(h => String(h ?? '').trim());
    return { headers, rows: parsed.slice(1) };
};

const processRows = (
    headers: string[],
    rows: any[][],
    mapping: ColumnMapping,
    products: Product[],
    pricingRules: PricingRules,
    learnedAliases: Record<string, string>,
    extraAliases: Record<string, string>
) => {
    const getIdx = (col?: string) => col ? headers.indexOf(col) : -1;

    const skuIdx = getIdx(mapping.sku);
    const qtyIdx = getIdx(mapping.qty);
    const revIdx = getIdx(mapping.revenue);
    const dateIdx = getIdx(mapping.date);
    const platIdx = getIdx(mapping.platform);
    const plat2Idx = getIdx(mapping.platformLevel2);

    const cogsIdx = getIdx(mapping.cogs);
    const promoRebateIdx = getIdx(mapping.promoRebate);
    const catIdx = getIdx(mapping.category);
    const sellingIdx = getIdx(mapping.sellingFee);
    const adsIdx = getIdx(mapping.adsFee);
    const postIdx = getIdx(mapping.postage);
    const logNameIdx = getIdx(mapping.logisticsService);
    const extraIdx = getIdx(mapping.extraFreight);
    const otherIdx = getIdx(mapping.otherFee);
    const subIdx = getIdx(mapping.subscriptionFee);
    const wmsIdx = getIdx(mapping.wmsFee);
    const profitIdx = getIdx(mapping.profitExclRn);
    const netPmIdx = getIdx(mapping.profitExclRnPercent);
    const orderIdIdx = getIdx(mapping.outerOrderId);
    const orderTypeIdx = getIdx(mapping.orderType);
    const postcodeIdx = getIdx(mapping.receivePostcode);
    const partnerIdx = getIdx(mapping.logisticPartner);

    const aggregated: Record<string, {
        qty: number;
        revenue: number;
        count: number;
        dates: Set<string>;
        fees: { selling: number; ads: number; postage: number; extra: number; other: number; sub: number; wms: number; cogs: number };
        netPmSum: number;
        profitSum: number;
        category: string;
        platformStats: Record<string, { qty: number; revenue: number }>;
    }> = {};

    const dailyAggregated: Record<string, {
        sku: string;
        date: string;
        totalQty: number;
        totalRevenue: number;
        netPmSum: number;
        totalProfit: number;
        totalAds: number;
        platform: string;
        orderId?: string;
        postcode?: string;
        logisticPartner?: string;
        logisticService?: string;
        totalPostage: number;
        totalExtraFreight: number;
        totalCogs: number;
        totalSellingFee: number;
        totalAdsFee: number;
        totalOtherFee: number;
        totalSubscriptionFee: number;
        totalWmsFee: number;
        totalPromoRel: number;
    }> = {};

    const discoveredPlatforms = new Set<string>();
    let orderIdsDetectedCount = 0;
    let minDate = new Date(9999, 11, 31);
    let maxDate = new Date(0);
    let hasDates = false;
    const shipmentLogs: any[] = [];

    const productBySku = new Map<string, Product>();
    const productByUpperSku = new Map<string, Product>();
    products.forEach((p: Product) => {
        productBySku.set(p.sku, p);
        productByUpperSku.set(p.sku.toUpperCase(), p);
    });

    const aliasMap: Record<string, string> = {};
    products.forEach((p: Product) => {
        aliasMap[p.sku.toUpperCase()] = p.sku;
        p.channels.forEach(c => {
            if (c.skuAlias) {
                c.skuAlias.split(',').forEach(a => {
                    aliasMap[a.trim().toUpperCase()] = p.sku;
                });
            }
        });
    });

    Object.entries(learnedAliases).forEach(([alias, master]) => {
        const aliasUpper = alias.toUpperCase();
        if (!aliasMap[aliasUpper]) aliasMap[aliasUpper] = master;
    });
    Object.entries(extraAliases).forEach(([alias, master]) => {
        const aliasUpper = alias.toUpperCase();
        if (!aliasMap[aliasUpper]) aliasMap[aliasUpper] = master;
    });

    const currentUnknownSkus: Record<string, { count: number; revenue: number; masterSku: string | null }> = {};
    let matchCount = 0;
    let skipCount = 0;
    const totalRows = rows.length || 1;
    let nextProgressRow = 0;

    rows.forEach((row: any[], index: number) => {
        if (index >= nextProgressRow) {
            const pct = 30 + (index / totalRows) * 55;
            postProgress('aggregating', pct, `Processing rows ${index}/${rows.length}`);
            nextProgressRow = index + 5000;
        }

        if (!row[skuIdx]) return;

        const parseVal = (idx: number) => {
            if (idx === -1 || row[idx] === undefined || row[idx] === null || row[idx] === '') return 0;
            const val = row[idx];
            if (typeof val === 'number') return val;
            const str = String(val).replace(/[^\d.-]/g, '').trim();
            const v = parseFloat(str);
            return isNaN(v) ? 0 : v;
        };

        const rev = parseVal(revIdx);
        const adsCost = parseVal(adsIdx);
        const qty = parseVal(qtyIdx);
        if (rev <= 0.001 && adsCost <= 0.001 && qty <= 0) return;

        const rawSku = String(row[skuIdx]).trim();
        const canonicalRawSku = getCanonicalSku(rawSku);
        const rawSkuUpper = canonicalRawSku.toUpperCase();

        let masterSku = aliasMap[rawSkuUpper];
        if (!masterSku) {
            const directMatch = productByUpperSku.get(rawSkuUpper);
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

        const parsePercent = (idx: number) => {
            if (idx === -1 || row[idx] === undefined || row[idx] === null || row[idx] === '') return 0;
            const val = row[idx];
            if (typeof val === 'number') {
                // Guard against Excel date-serial values accidentally mapped into % columns
                if (Math.abs(val) > 200) return 0;
                if (Math.abs(val) > 0 && Math.abs(val) <= 1.0) return val * 100;
                return val;
            }
            if (val instanceof Date) return 0;
            const raw = String(val).trim();
            if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) return 0;
            const str = String(val).replace('%', '').replace(/[^\d.-]/g, '').trim();
            const v = parseFloat(str);
            if (!isNaN(v) && Math.abs(v) > 200) return 0;
            return isNaN(v) ? 0 : v;
        };

        const profit = parseVal(profitIdx);
        const netPm = parsePercent(netPmIdx);

        let platformName = 'Unknown';
        const p1 = (platIdx !== -1 && row[platIdx]) ? String(row[platIdx]).trim() : '';
        const p2 = (plat2Idx !== -1 && row[plat2Idx]) ? String(row[plat2Idx]).trim() : '';
        if (p2 && p2 !== '-' && p2.toLowerCase() !== 'unknown') {
            if (p1 && !p2.toLowerCase().includes(p1.toLowerCase()) && p2.length < 5) platformName = `${p1} ${p2}`;
            else platformName = p2;
        } else if (p1) {
            platformName = p1;
        }

        const orderId = (orderIdIdx !== -1 && row[orderIdIdx]) ? String(row[orderIdIdx]).trim() : '';
        const orderType = (orderTypeIdx !== -1 && row[orderTypeIdx]) ? String(row[orderTypeIdx]).trim().toLowerCase() : '';
        const isAdOnly = orderType === 'ad_only';
        const postcode = (postcodeIdx !== -1 && row[postcodeIdx]) ? String(row[postcodeIdx]).trim() : undefined;
        const partner = (partnerIdx !== -1 && row[partnerIdx]) ? String(row[partnerIdx]).trim() : undefined;
        const serviceName = (logNameIdx !== -1 && row[logNameIdx]) ? String(row[logNameIdx]).trim() : undefined;

        if (orderId) orderIdsDetectedCount++;
        discoveredPlatforms.add(platformName);

        if (!aggregated[masterSku]) {
            aggregated[masterSku] = {
                qty: 0, revenue: 0, count: 0, dates: new Set(),
                fees: { selling: 0, ads: 0, postage: 0, extra: 0, other: 0, sub: 0, wms: 0, cogs: 0 },
                netPmSum: 0, profitSum: 0, category: '', platformStats: {}
            };
        }

        const platformConfig = pricingRules[platformName];
        const isCostBased = platformConfig?.pricingControl === 'PLATFORM_COST_BASED' || platformConfig?.isExcluded === true;
        const item = aggregated[masterSku];

        if (!isCostBased && !isAdOnly) {
            item.qty += qty;
            item.revenue += rev;
        }
        if (!isAdOnly) item.count++;

        const weight = Math.abs(qty) || 1;
        if (!isCostBased && !isAdOnly) {
            item.netPmSum += (netPm * weight);
            item.profitSum += profit;
        }

        const postageCost = parseVal(postIdx);
        const extraFreightInc = parseVal(extraIdx);

        item.fees.selling += parseVal(sellingIdx);
        item.fees.ads += adsCost;
        item.fees.postage += postageCost;
        item.fees.extra += extraFreightInc;
        item.fees.other += parseVal(otherIdx);
        item.fees.sub += parseVal(subIdx);
        item.fees.wms += parseVal(wmsIdx);
        item.fees.cogs += parseVal(cogsIdx);

        if (catIdx !== -1 && row[catIdx]) item.category = String(row[catIdx]).trim();

        const dLog = (() => {
            if (dateIdx !== -1 && row[dateIdx]) {
                const dk = asDateKeyNaive(row[dateIdx]);
                if (dk) return dateKeyToLocal(dk);
            }
            return new Date();
        })();
        if (qty === 1 && serviceName && postageCost > 0) {
            shipmentLogs.push({
                id: Math.random().toString(36).substr(2, 9),
                sku: masterSku,
                service: serviceName,
                cost: postageCost,
                date: dLog.toISOString()
            });
        }

        if (!item.platformStats[platformName]) item.platformStats[platformName] = { qty: 0, revenue: 0 };
        item.platformStats[platformName].qty += qty;
        item.platformStats[platformName].revenue += rev;

        const rawDateVal = (dateIdx !== -1) ? row[dateIdx] : undefined;
        const dateKey = asDateKeyNaive(rawDateVal);
        if (dateKey) {
            hasDates = true;
            const d = dateKeyToLocal(dateKey);
            if (d < minDate) minDate = d;
            if (d > maxDate) maxDate = d;

            const dailyKey = orderId
                ? `${masterSku}|${dateKey}|${platformName}|${orderId}`
                : `${masterSku}|${dateKey}|${platformName}`;

            if (!dailyAggregated[dailyKey]) {
                dailyAggregated[dailyKey] = {
                    sku: masterSku,
                    date: dateKey,
                    totalQty: 0,
                    totalRevenue: 0,
                    netPmSum: 0,
                    totalProfit: 0,
                    totalAds: 0,
                    platform: platformName,
                    orderId: orderId || undefined,
                    postcode: postcode || undefined,
                    logisticPartner: partner || undefined,
                    logisticService: serviceName || undefined,
                    totalPostage: 0,
                    totalExtraFreight: 0,
                    totalCogs: 0,
                    totalSellingFee: 0,
                    totalAdsFee: 0,
                    totalOtherFee: 0,
                    totalSubscriptionFee: 0,
                    totalWmsFee: 0,
                    totalPromoRel: 0
                };
            }
            if (!isAdOnly) {
                dailyAggregated[dailyKey].totalQty += qty;
                dailyAggregated[dailyKey].totalRevenue += rev;
                dailyAggregated[dailyKey].totalPostage += postageCost;
                dailyAggregated[dailyKey].totalExtraFreight += extraFreightInc;
                dailyAggregated[dailyKey].totalCogs += parseVal(cogsIdx);
                dailyAggregated[dailyKey].totalSellingFee += parseVal(sellingIdx);
                dailyAggregated[dailyKey].totalAdsFee += adsCost;
                dailyAggregated[dailyKey].totalOtherFee += parseVal(otherIdx);
                dailyAggregated[dailyKey].totalSubscriptionFee += parseVal(subIdx);
                dailyAggregated[dailyKey].totalWmsFee += parseVal(wmsIdx);
                dailyAggregated[dailyKey].totalPromoRel += parseVal(promoRebateIdx);

                const dailyWeight = Math.abs(qty) || 0;
                dailyAggregated[dailyKey].netPmSum += (netPm * dailyWeight);

                if (profit === 0 && netPm !== 0 && rev !== 0) dailyAggregated[dailyKey].totalProfit += rev * (netPm / 100);
                else dailyAggregated[dailyKey].totalProfit += profit;
            }
            dailyAggregated[dailyKey].totalAds += adsCost;
            if (!isAdOnly) item.dates.add(dateKey);
        }
    });

    postProgress('finalizing', 88, 'Building transaction payload');

    let calculatedPeriod = 30;
    let dateLabel = 'Manual Period';
    if (hasDates && maxDate > minDate) {
        const diffTime = Math.abs(maxDate.getTime() - minDate.getTime());
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        calculatedPeriod = diffDays;
        const formatDate = (d: Date) => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        dateLabel = `${formatDate(minDate)} – ${formatDate(maxDate)}`;
    }

    const updates: Product[] = [];
    const history: HistoryPayload[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    Object.values(dailyAggregated).forEach(bucket => {
        const weight = bucket.totalQty;
        const avgPrice = weight > 0 ? bucket.totalRevenue / weight : 0;

        let finalMargin = 0;
        if (profitIdx !== -1 && bucket.totalRevenue > 0) finalMargin = (bucket.totalProfit / bucket.totalRevenue) * 100;
        else finalMargin = weight > 0 ? bucket.netPmSum / weight : 0;

        if (bucket.totalQty !== 0 || bucket.totalAds > 0) {
            const payload: HistoryPayload = {
                sku: bucket.sku,
                date: bucket.date,
                price: isNaN(avgPrice) ? 0 : avgPrice,
                velocity: isNaN(bucket.totalQty) ? 0 : bucket.totalQty,
                platform: bucket.platform,
                orderId: bucket.orderId,
                postcode: bucket.postcode,
                logisticPartner: bucket.logisticPartner,
                logisticService: bucket.logisticService,
                adsSpend: Number(bucket.totalAds.toFixed(4)),
                realPostage: Number(bucket.totalPostage.toFixed(4)),
                realExtraFreight: Number(bucket.totalExtraFreight.toFixed(4)),
                cogs: Number(bucket.totalCogs.toFixed(4)),
                sellingFee: Number(bucket.totalSellingFee.toFixed(4)),
                adsFee: Number(bucket.totalAdsFee.toFixed(4)),
                postage: Number(bucket.totalPostage.toFixed(4)),
                otherFee: Number(bucket.totalOtherFee.toFixed(4)),
                subscriptionFee: Number(bucket.totalSubscriptionFee.toFixed(4)),
                wmsFee: Number(bucket.totalWmsFee.toFixed(4)),
                promoRel: Number(bucket.totalPromoRel.toFixed(4))
            };
            if (!isNaN(finalMargin)) payload.margin = Number(finalMargin.toFixed(4));
            if (profitIdx !== -1) payload.profit = Number(bucket.totalProfit.toFixed(4));
            history.push(payload);
        }
    });

    postProgress('finalizing', 93, 'Updating SKU metrics');

    Object.entries(aggregated).forEach(([sku, data]) => {
        const product = productBySku.get(sku);
        if (!product) return;

        const validQty = data.qty > 0 ? data.qty : 1;
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

        const updatedChannels = [...product.channels];
        Object.entries(data.platformStats).forEach(([platform, stats]) => {
            const channelIdx = updatedChannels.findIndex(c => c.platform === platform);
            const channelVelocity = stats.qty / calculatedPeriod;
            const channelPrice = stats.qty > 0 ? stats.revenue / stats.qty : 0;
            if (channelIdx >= 0) {
                updatedChannels[channelIdx] = { ...updatedChannels[channelIdx], velocity: channelVelocity, price: channelPrice };
            } else {
                const defaultManager = pricingRules[platform]?.manager || 'Unassigned';
                updatedChannels.push({
                    platform,
                    manager: defaultManager,
                    velocity: channelVelocity,
                    price: channelPrice,
                    skuAlias: ''
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
            channels: updatedChannels
        });

        if (!hasDates && newVelocity > 0) {
            const primaryPlatform = Object.keys(data.platformStats)[0] || 'General';
            history.push({
                sku,
                date: todayStr,
                price: avgPrice,
                velocity: newVelocity,
                margin: 0,
                platform: primaryPlatform,
                adsSpend: data.fees.ads
            });
        }
    });

    postProgress('finalizing', 98, 'Finalizing import summary');

    const features = {
        ads: mapping.adsFee && updates.some(u => u.adsFee && u.adsFee > 0),
        fees: mapping.sellingFee && updates.some(u => u.sellingFee && u.sellingFee > 0),
        logistics: (mapping.postage || mapping.wmsFee) && updates.some(u => (u.postage || 0) + (u.wmsFee || 0) > 0),
        category: mapping.category && updates.some(u => u.category !== productBySku.get(u.sku)?.category)
    };

    return {
        success: true,
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
            discoveredPlatforms: Array.from(discoveredPlatforms),
            orderIdsCount: orderIdsDetectedCount
        },
        unknownSkus: currentUnknownSkus,
        resolvedAliases: extraAliases
    };
};

self.onmessage = (e: MessageEvent) => {
    const {
        fileName,
        fileBuffer,
        fileText,
        headers,
        rows,
        mapping,
        products,
        pricingRules,
        learnedAliases = {},
        extraAliases = {}
    } = e.data || {};

    try {
        let workingHeaders: string[] = headers || [];
        let workingRows: any[][] = rows || [];
        let workingMapping: ColumnMapping = mapping;

        if ((!workingHeaders.length || !workingRows.length) && (fileBuffer || fileText)) {
            postProgress('reading', 5, 'Reading file');
            postProgress('parsing', 12, 'Parsing spreadsheet');
            const parsed = parseSpreadsheetPayload(fileName || 'upload.csv', fileBuffer, fileText);
            workingHeaders = parsed.headers;
            workingRows = parsed.rows;
            postProgress('parsing', 22, `Parsed ${workingRows.length} rows`);
        }

        if (!workingHeaders.length || workingRows.length === 0) {
            self.postMessage({ success: false, error: 'File empty or missing headers' });
            return;
        }

        if (!workingMapping || !workingMapping.sku || !workingMapping.qty || !workingMapping.revenue) {
            postProgress('mapping', 26, 'Detecting column mapping');
            workingMapping = autoDetectMapping(workingHeaders);
        }

        const canAutoProcess = !!(workingMapping.sku && workingMapping.qty && workingMapping.revenue);
        if (!canAutoProcess) {
            self.postMessage({
                type: 'parsed',
                success: true,
                headers: workingHeaders,
                rows: workingRows,
                detectedMapping: workingMapping
            });
            return;
        }

        postProgress('aggregating', 30, 'Preparing aggregation');
        const result = processRows(
            workingHeaders,
            workingRows,
            workingMapping,
            products || [],
            pricingRules || {},
            learnedAliases || {},
            extraAliases || {}
        );

        postProgress('finalizing', 100, 'Import ready');
        const hasUnknownSkus = !!(result.unknownSkus && Object.keys(result.unknownSkus).length > 0);
        self.postMessage({
            ...result,
            headers: hasUnknownSkus ? workingHeaders : undefined,
            rows: hasUnknownSkus ? workingRows : undefined,
            detectedMapping: workingMapping
        });
    } catch (err: any) {
        self.postMessage({ success: false, error: err.message });
    }
};
