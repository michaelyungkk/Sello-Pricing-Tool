
import { Product, PricingRules, HistoryPayload } from '../types';
import { asDateKeyNaive } from '../services/dateUtils';
import { getCanonicalSku } from '../services/skuNormalization';

// Parse a YYYY-MM-DD string as LOCAL midnight (not UTC) so date comparisons
// are not shifted by the Melbourne UTC+11 offset.
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
    receivePostcode?: string;
    logisticPartner?: string;
}

self.onmessage = (e: MessageEvent) => {
    const { headers, rows, mapping, products, pricingRules, learnedAliases, extraAliases } = e.data;

    try {
        const getIdx = (col?: string) => col ? headers.indexOf(col) : -1;

        const skuIdx = getIdx(mapping.sku);
        const qtyIdx = getIdx(mapping.qty);
        const revIdx = getIdx(mapping.revenue);
        const dateIdx = getIdx(mapping.date);
        const platIdx = getIdx(mapping.platform);
        const plat2Idx = getIdx(mapping.platformLevel2);

        // Fee Indices
        const cogsIdx = getIdx(mapping.cogs);
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
        const postcodeIdx = getIdx(mapping.receivePostcode);
        const partnerIdx = getIdx(mapping.logisticPartner);

        const aggregated: Record<string, {
            qty: number,
            revenue: number,
            count: number,
            dates: Set<string>,
            fees: { selling: number, ads: number, postage: number, extra: number, other: number, sub: number, wms: number, cogs: number },
            netPmSum: number,
            profitSum: number,
            category: string,
            platformStats: Record<string, { qty: number, revenue: number }>
        }> = {};

        const dailyAggregated: Record<string, {
            sku: string,
            date: string,
            totalQty: number,
            totalRevenue: number,
            netPmSum: number,
            totalProfit: number,
            totalAds: number,
            platform: string,
            orderId?: string;
            postcode?: string;
            logisticPartner?: string;
            logisticService?: string;
            totalPostage: number;
            totalExtraFreight: number;
        }> = {};

        const discoveredPlatforms = new Set<string>();
        let orderIdsDetectedCount = 0;

        let minDate = new Date(9999, 11, 31); // far future
        let maxDate = new Date(0);            // far past
        let hasDates = false;

        const shipmentLogs: any[] = [];

        const aliasMap: Record<string, string> = {};
        products.forEach((p: Product) => {
            aliasMap[p.sku.toUpperCase()] = p.sku;
            p.channels.forEach(c => {
                if (c.skuAlias) {
                    c.skuAlias.split(',').forEach(a => aliasMap[a.trim().toUpperCase()] = p.sku);
                }
            });
        });

        (Object.entries(learnedAliases) as [string, string][]).forEach(([alias, master]) => {
            const aliasUpper = alias.toUpperCase();
            if (!aliasMap[aliasUpper]) aliasMap[aliasUpper] = master;
        });

        (Object.entries(extraAliases) as [string, string][]).forEach(([alias, master]) => {
            const aliasUpper = alias.toUpperCase();
            if (!aliasMap[aliasUpper]) aliasMap[aliasUpper] = master;
        });

        const currentUnknownSkus: Record<string, { count: number, revenue: number, masterSku: string | null }> = {};
        let matchCount = 0;
        let skipCount = 0;

        rows.forEach((row: any[]) => {
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
                const directMatch = products.find((p: Product) => p.sku.toUpperCase() === rawSkuUpper);
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
                    if (Math.abs(val) > 0 && Math.abs(val) <= 1.0) {
                        return val * 100;
                    }
                    return val;
                }
                const str = String(val).replace('%', '').replace(/[^\d.-]/g, '').trim();
                const v = parseFloat(str);
                return isNaN(v) ? 0 : v;
            };

            const profit = parseVal(profitIdx);
            const netPm = parsePercent(netPmIdx);

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

            const orderId = (orderIdIdx !== -1 && row[orderIdIdx]) ? String(row[orderIdIdx]).trim() : '';
            const postcode = (postcodeIdx !== -1 && row[postcodeIdx]) ? String(row[postcodeIdx]).trim() : undefined;
            const partner = (partnerIdx !== -1 && row[partnerIdx]) ? String(row[partnerIdx]).trim() : undefined;
            const serviceName = (logNameIdx !== -1 && row[logNameIdx]) ? String(row[logNameIdx]).trim() : undefined;

            if (orderId) orderIdsDetectedCount++;
            discoveredPlatforms.add(platformName);

            if (!aggregated[masterSku]) aggregated[masterSku] = {
                qty: 0, revenue: 0, count: 0, dates: new Set(),
                fees: { selling: 0, ads: 0, postage: 0, extra: 0, other: 0, sub: 0, wms: 0, cogs: 0 },
                netPmSum: 0,
                profitSum: 0,
                category: '',
                platformStats: {}
            };

            const item = aggregated[masterSku];
            item.qty += qty;
            item.revenue += rev;
            item.count++;

            const weight = Math.abs(qty) || 1;
            item.netPmSum += (netPm * weight);
            item.profitSum += profit;

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

            if (!item.platformStats[platformName]) {
                item.platformStats[platformName] = { qty: 0, revenue: 0 };
            }
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
                        totalExtraFreight: 0
                    };
                }
                dailyAggregated[dailyKey].totalQty += qty;
                dailyAggregated[dailyKey].totalRevenue += rev;
                dailyAggregated[dailyKey].totalAds += adsCost;
                dailyAggregated[dailyKey].totalPostage += postageCost;
                dailyAggregated[dailyKey].totalExtraFreight += extraFreightInc;

                const dailyWeight = Math.abs(qty) || 0;
                dailyAggregated[dailyKey].netPmSum += (netPm * dailyWeight);

                if (profit === 0 && netPm !== 0 && rev !== 0) {
                    dailyAggregated[dailyKey].totalProfit += rev * (netPm / 100);
                } else {
                    dailyAggregated[dailyKey].totalProfit += profit;
                }

                item.dates.add(dateKey);
            }
        });

        let calculatedPeriod = 30; // Will be set by periodDays if no dates
        let dateLabel = "Manual Period";

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
            if (profitIdx !== -1 && bucket.totalRevenue > 0) {
                finalMargin = (bucket.totalProfit / bucket.totalRevenue) * 100;
            } else {
                finalMargin = weight > 0 ? bucket.netPmSum / weight : 0;
            }

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
                    realExtraFreight: Number(bucket.totalExtraFreight.toFixed(4))
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

        Object.entries(aggregated).forEach(([sku, data]) => {
            const product = products.find((p: Product) => p.sku === sku);
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
                    updatedChannels[channelIdx] = {
                        ...updatedChannels[channelIdx],
                        velocity: channelVelocity,
                        price: channelPrice
                    };
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

        const features = {
            ads: mapping.adsFee && updates.some(u => u.adsFee && u.adsFee > 0),
            fees: mapping.sellingFee && updates.some(u => u.sellingFee && u.sellingFee > 0),
            logistics: (mapping.postage || mapping.wmsFee) && updates.some(u => (u.postage || 0) + (u.wmsFee || 0) > 0),
            category: mapping.category && updates.some(u => u.category !== products.find((p: Product) => p.sku === u.sku)?.category)
        };

        self.postMessage({
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
        });

    } catch (err: any) {
        self.postMessage({ success: false, error: err.message });
    }
};
