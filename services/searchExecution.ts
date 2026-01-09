
import { Product, PriceLog, PricingRules, RefundLog } from '../types';
import { SearchIntent } from './geminiService';
import { isAdsEnabled } from './platformCapabilities';

export const safeCalculateMargin = (p: Product | undefined, price: number): number => {
    if (!p || !price || isNaN(price)) return 0;
    const totalCost = (Number(p.costPrice) || 0) +
        (Number(p.sellingFee) || 0) +
        (Number(p.adsFee) || 0) +
        (Number(p.postage) || 0) +
        (Number(p.otherFee) || 0) +
        (Number(p.subscriptionFee) || 0) +
        (Number(p.wmsFee) || 0);

    const totalIncome = price + (Number(p.extraFreight) || 0);
    const netProfit = totalIncome - totalCost;
    const margin = price > 0 ? (netProfit / price) * 100 : 0;
    return isNaN(margin) ? 0 : margin;
};

export const processDataForSearch = (intent: SearchIntent, products: Product[], priceHistory: PriceLog[], pricingRules: PricingRules, refundHistory: RefundLog[]) => {
    
    // --- DEEP DIVE HANDLER ---
    if (intent.primaryMetric === 'DEEP_DIVE') {
        const skuQuery = String(intent.filters[0].value).trim().toLowerCase();
        // Case-insensitive exact match
        const product = products.find(p => p.sku.toLowerCase() === skuQuery);
        
        if (product) {
            let allTimeSales = 0;
            let allTimeQty = 0;
            const transactions: PriceLog[] = [];
            
            priceHistory.forEach(l => {
                if (l.sku === product.sku) {
                    allTimeSales += (l.price * l.velocity);
                    allTimeQty += l.velocity;
                    transactions.push(l);
                }
            });

            const productRefunds = refundHistory.filter(r => r.sku === product.sku);

            return {
                results: [{
                    type: 'DEEP_DIVE',
                    product,
                    allTimeSales,
                    allTimeQty,
                    transactions, // Pass transaction history to Deep Dive
                    refunds: productRefunds // Pass refunds
                }],
                timeLabel: 'All Time'
            };
        }
        // Fallback if not found, return empty or standard search
        return { results: [], timeLabel: 'All Time' };
    }

    const productMap = new Map(products.map(p => [p.sku, p]));
    
    if (intent.targetData === 'refunds') {
        const results: any[] = [];
        refundHistory.forEach(r => {
            const p = productMap.get(r.sku);
            results.push({ sku: r.sku, productName: p?.name || 'Unknown', platform: r.platform || 'Unknown', date: r.date, price: -r.amount, velocity: r.quantity, margin: -100, type: 'REFUND' });
        });
        return { results, timeLabel: 'All Refunds' };
    }

    if (intent.targetData === 'inventory') {
        const results: any[] = [];
        products.forEach(p => {
            const agedStockPct = p.stockLevel > 0 && p.agedStockQty ? (p.agedStockQty / p.stockLevel) * 100 : 0;
            const derivedMetrics: any = { 
                daysRemaining: p.averageDailySales > 0 ? p.stockLevel / p.averageDailySales : 999, 
                velocityChange: p.previousDailySales && p.previousDailySales > 0 ? ((p.averageDailySales - p.previousDailySales) / p.previousDailySales) * 100 : 0,
                agedStockPct: agedStockPct
            };
            const pass = intent.filters.every(f => {
                let val = (p as any)[f.field];
                if (val === undefined) val = derivedMetrics[f.field];
                const criteria = Number(f.value) || f.value;
                if (f.field === 'name' && f.operator === 'CONTAINS') {
                    const strCriteria = String(f.value).toLowerCase();
                    const nameMatch = p.name.toLowerCase().includes(strCriteria);
                    const skuMatch = p.sku.toLowerCase().includes(strCriteria);
                    const aliasMatch = p.channels.some(c => c.skuAlias && c.skuAlias.toLowerCase().includes(strCriteria));
                    return nameMatch || skuMatch || aliasMatch;
                }
                if (f.operator === 'CONTAINS') return String(val).toLowerCase().includes(String(criteria).toLowerCase());
                if (f.operator === '=') return String(val).toLowerCase() === String(criteria).toLowerCase();
                if (f.operator === '>') return val > criteria;
                if (f.operator === '<') return val < criteria;
                if (f.operator === '>=') return val >= criteria;
                if (f.operator === '<=') return val <= criteria;
                return val == criteria;
            });
            if (!pass) return;
            results.push({ 
                sku: p.sku, 
                productName: p.name, 
                platform: p.channels.length > 0 ? p.channels[0].platform : 'General', 
                channels: p.channels,
                date: new Date().toISOString(), 
                price: p.currentPrice, 
                velocity: p.stockLevel, 
                revenue: p.stockLevel * p.currentPrice, 
                margin: safeCalculateMargin(p, p.currentPrice), 
                stockLevel: p.stockLevel, 
                agedStockQty: p.agedStockQty,
                agedStockPct: derivedMetrics.agedStockPct,
                averageDailySales: p.averageDailySales, 
                daysRemaining: derivedMetrics.daysRemaining, 
                velocityChange: derivedMetrics.velocityChange, 
                type: 'INVENTORY' 
            });
        });
        if (intent.sort) {
            results.sort((a, b) => {
                const field = intent.sort!.field;
                const valA = a[field] || 0;
                const valB = b[field] || 0;
                return intent.sort!.direction === 'asc' ? valA - valB : valB - valA;
            });
        }
        if (intent.limit && intent.limit > 0) { return { results: results.slice(0, intent.limit), timeLabel: 'Current Snapshot' }; }
        return { results, timeLabel: 'Current Snapshot' };
    }

    let startTime = 0; let endTime = Number.MAX_SAFE_INTEGER; let timeLabel = "All Time";
    if (intent.timeRange) {
        const now = new Date();
        if (intent.timeRange.type === 'relative' && intent.timeRange.value.endsWith('d')) { const days = parseInt(intent.timeRange.value); const start = new Date(); start.setDate(now.getDate() - days); startTime = start.getTime(); endTime = now.getTime(); timeLabel = `Last ${days} Days`; } 
        else if (intent.timeRange.type === 'absolute') { const val = intent.timeRange.value; const date = new Date(val); if (!isNaN(date.getTime())) { startTime = date.getTime(); timeLabel = `Since ${val}`; } }
    } else { const start = new Date(); start.setDate(start.getDate() - 30); startTime = start.getTime(); endTime = Date.now(); timeLabel = "Last 30 Days (Default)"; }

    // --- TREND ANALYSIS: PREVIOUS PERIOD CALCULATION ---
    let prevStartTime = 0;
    let prevEndTime = 0;
    if (startTime > 0 && endTime < Number.MAX_SAFE_INTEGER) {
        const duration = endTime - startTime;
        prevEndTime = startTime; // Ends where current starts
        prevStartTime = startTime - duration; // Shift back by duration
    }

    const skuPeriodStats = new Map<string, { 
        revenue: number, refunds: number, organicQty: number, adEnabledQty: number,
        // New Trend Fields
        qty: number, prevRevenue: number, prevQty: number, prevProfit: number
    }>();
    
    // Pass 1: Aggregate stats for Refund Rate, Organic Share, and Trend comparison
    refundHistory.forEach(r => {
        const rTime = new Date(r.date).getTime();
        if (rTime >= startTime && rTime <= endTime) {
            if (!skuPeriodStats.has(r.sku)) skuPeriodStats.set(r.sku, { revenue: 0, refunds: 0, organicQty: 0, adEnabledQty: 0, qty: 0, prevRevenue: 0, prevQty: 0, prevProfit: 0 });
            skuPeriodStats.get(r.sku)!.refunds += r.amount;
        }
    });
    priceHistory.forEach(l => {
        const lTime = new Date(l.date).getTime();
        
        // Ensure map entry exists
        if (!skuPeriodStats.has(l.sku)) skuPeriodStats.set(l.sku, { revenue: 0, refunds: 0, organicQty: 0, adEnabledQty: 0, qty: 0, prevRevenue: 0, prevQty: 0, prevProfit: 0 });
        const stats = skuPeriodStats.get(l.sku)!;

        // Current Period Aggregation
        if (lTime >= startTime && lTime <= endTime) {
            stats.revenue += (l.price * l.velocity);
            stats.qty += l.velocity;
            
            // Organic Share Accumulation
            const p = productMap.get(l.sku);
            const adsSpend = l.adsSpend !== undefined ? l.adsSpend : (p?.adsFee || 0) * l.velocity;
            
            if (isAdsEnabled(l.platform || '')) {
                stats.adEnabledQty += l.velocity;
                if (adsSpend === 0) {
                    stats.organicQty += l.velocity;
                }
            }
        }

        // Previous Period Aggregation (For Trends)
        if (lTime >= prevStartTime && lTime < prevEndTime) {
            stats.prevRevenue += (l.price * l.velocity);
            stats.prevQty += l.velocity;
            
            // Calculate Previous Profit
            let logProfit = 0;
            if (l.profit !== undefined) {
                logProfit = l.profit;
            } else {
                const margin = l.margin || 0;
                logProfit = l.price * l.velocity * (margin / 100);
            }
            stats.prevProfit += logProfit;
        }
    });

    const candidates: any[] = [];
    const skuTotals: Record<string, number> = {};
    let grandTotalRevenue = 0;

    // Pass 2: Filter and Build Candidates
    priceHistory.forEach(log => {
        const product = productMap.get(log.sku);
        if (!product) return;
        const logTime = new Date(log.date).getTime();
        if (logTime < startTime || logTime > endTime) return;

        let margin = log.margin;
        let type = 'TRANSACTION';
        const revenue = log.price * log.velocity;
        const adsSpend = log.adsSpend !== undefined ? log.adsSpend : (product.adsFee || 0) * log.velocity;

        if (log.price === 0 && adsSpend > 0) {
            type = 'AD_COST';
            margin = -Infinity;
        } else if (margin === undefined || margin === null) {
            margin = safeCalculateMargin(product, log.price);
        }

        const tacos = revenue > 0 ? (adsSpend / revenue) * 100 : 0;
        
        // Stats for current SKU
        const pStats = skuPeriodStats.get(log.sku) || { revenue: 0, refunds: 0, organicQty: 0, adEnabledQty: 0, qty: 0, prevRevenue: 0, prevQty: 0, prevProfit: 0 };
        const periodReturnRate = pStats.revenue > 0 ? (pStats.refunds / pStats.revenue) * 100 : 0;
        const organicShare = pStats.adEnabledQty > 0 ? (pStats.organicQty / pStats.adEnabledQty) * 100 : null;

        // Calculate Dynamic Trends
        const revenueChange = pStats.revenue - pStats.prevRevenue;
        const revenueChangePct = pStats.prevRevenue > 0 ? (revenueChange / pStats.prevRevenue) * 100 : (pStats.revenue > 0 ? 100 : 0);
        
        const velocityChange = pStats.qty - pStats.prevQty; // Absolute change
        const velocityChangePct = pStats.prevQty > 0 ? (velocityChange / pStats.prevQty) * 100 : (pStats.qty > 0 ? 100 : 0);

        // Calculate Margin Trend - KEY FIX
        const prevMargin = pStats.prevRevenue > 0 ? (pStats.prevProfit / pStats.prevRevenue) * 100 : 0;
        const marginChange = (margin || 0) - prevMargin;
        
        const agedStockPct = product.stockLevel > 0 && product.agedStockQty ? (product.agedStockQty / product.stockLevel) * 100 : 0;

        const calculatedMetrics: any = {
            revenue, margin, adsSpend, tacos, 
            organicShare: organicShare !== null ? organicShare : 0,
            profit: log.profit || (revenue * ((margin || 0)/100)),
            returnRate: product.returnRate || 0,
            periodReturnRate: periodReturnRate,
            stockLevel: product.stockLevel,
            agedStockQty: product.agedStockQty,
            agedStockPct: agedStockPct,
            daysRemaining: product.averageDailySales > 0 ? product.stockLevel / product.averageDailySales : 999,
            
            velocityChange: velocityChangePct,
            velocityChangeAbs: velocityChange,
            revenueChangeAbs: revenueChange,
            revenueChangePct: revenueChangePct,
            marginChange: marginChange // Add for sorting limit
        };

        if (log.price === 0 && adsSpend > 0) {
            calculatedMetrics.profit = -adsSpend;
        }

        const pass = intent.filters.every(f => {
            let val: any = (log as any)[f.field];
            
            // Map Margin Change special filter
            if (f.field === 'MARGIN_CHANGE_PCT') {
                val = marginChange;
            } else if (calculatedMetrics[f.field] !== undefined) {
                val = calculatedMetrics[f.field];
            } else if (val === undefined) {
                val = (product as any)[f.field];
            }
            
            if (val === null && (f.field === 'organicShare' || f.field === 'ORGANIC_SHARE_PCT')) {
                 val = 0; 
            }

            const criteria = Number(f.value);
            const strCriteria = String(f.value).toLowerCase();
            const valStr = String(val).toLowerCase();

            if (f.field === 'name' && f.operator === 'CONTAINS') {
                const nameMatch = product.name.toLowerCase().includes(strCriteria);
                const skuMatch = product.sku.toLowerCase().includes(strCriteria);
                const aliasMatch = product.channels.some(c => c.skuAlias && c.skuAlias.toLowerCase().includes(strCriteria));
                return nameMatch || skuMatch || aliasMatch;
            }
            if (f.operator === 'CONTAINS') return valStr.includes(strCriteria);
            if (f.operator === '=') return valStr === strCriteria || val == f.value;
            if (f.operator === '>') return val > criteria;
            if (f.operator === '<') return val < criteria;
            if (f.operator === '>=') return val >= criteria;
            if (f.operator === '<=') return val <= criteria;
            return true;
        });

        if (pass) {
            grandTotalRevenue += revenue;
            const sortField = intent.sort?.field || 'revenue';
            
            // Handle special mapping for MARGIN_CHANGE_PCT
            let sortVal = calculatedMetrics[sortField] || revenue;
            if (sortField === 'MARGIN_CHANGE_PCT') {
                sortVal = marginChange * log.velocity; 
            }

            if (!skuTotals[log.sku]) skuTotals[log.sku] = 0;
            skuTotals[log.sku] += sortVal;
            
            candidates.push({
                sku: product.sku,
                productName: product.name,
                platform: log.platform || 'Unknown',
                date: log.date,
                price: log.price,
                velocity: log.velocity,
                revenue: calculatedMetrics.revenue,
                profit: calculatedMetrics.profit,
                margin: calculatedMetrics.margin,
                adsSpend: calculatedMetrics.adsSpend,
                tacos: calculatedMetrics.tacos,
                organicShare: calculatedMetrics.organicShare,
                stockLevel: calculatedMetrics.stockLevel,
                agedStockQty: calculatedMetrics.agedStockQty,
                agedStockPct: calculatedMetrics.agedStockPct,
                daysRemaining: calculatedMetrics.daysRemaining,
                
                // Trend Metrics
                velocityChange: calculatedMetrics.velocityChange,
                velocityChangeAbs: calculatedMetrics.velocityChangeAbs,
                revenueChangeAbs: calculatedMetrics.revenueChangeAbs,
                revenueChangePct: calculatedMetrics.revenueChangePct,
                
                returnRate: calculatedMetrics.returnRate,
                periodReturnRate: calculatedMetrics.periodReturnRate,
                allTimeReturnRate: product.returnRate || 0,
                type: type,
                
                // Pass previous values for aggregation in UI
                prevRevenue: pStats.prevRevenue || 0,
                prevQty: pStats.prevQty || 0,
                prevProfit: pStats.prevProfit || 0 // New: Passed for Margin Trend calc
            });
        }
    });

    refundHistory.forEach(r => {
        const logTime = new Date(r.date).getTime();
        if (logTime < startTime || logTime > endTime) return;
        const product = productMap.get(r.sku);
        if (!product) return;
        const pStats = skuPeriodStats.get(r.sku) || { revenue: 0, refunds: 0, organicQty: 0, adEnabledQty: 0, qty: 0, prevRevenue: 0, prevQty: 0, prevProfit: 0 };
        const derivedMetrics: any = {
            revenue: 0, profit: -r.amount, margin: 0, returnRate: product.returnRate || 0,
            periodReturnRate: pStats.revenue > 0 ? (pStats.refunds / pStats.revenue) * 100 : 0,
            stockLevel: product.stockLevel, velocity: r.quantity, adsSpend: 0, tacos: 0, organicShare: 0, agedStockPct: 0
        };
        const pass = intent.filters.every(f => {
            let val: any = (r as any)[f.field];
            if (derivedMetrics[f.field] !== undefined) val = derivedMetrics[f.field];
            else if (val === undefined) val = (product as any)[f.field];
            const criteria = Number(f.value);
            const strCriteria = String(f.value).toLowerCase();
            const valStr = String(val).toLowerCase();
            if (f.field === 'name' && f.operator === 'CONTAINS') {
                const nameMatch = product.name.toLowerCase().includes(strCriteria);
                const skuMatch = product.sku.toLowerCase().includes(strCriteria);
                const aliasMatch = product.channels.some(c => c.skuAlias && c.skuAlias.toLowerCase().includes(strCriteria));
                return nameMatch || skuMatch || aliasMatch;
            }
            if (f.operator === 'CONTAINS') return valStr.includes(strCriteria);
            if (f.operator === '=') return valStr === strCriteria || val == f.value;
            if (f.operator === '>') return val > criteria;
            if (f.operator === '<') return val < criteria;
            if (f.operator === '>=') return val >= criteria;
            if (f.operator === '<=') return val <= criteria;
            return true;
        });
        if (pass) {
            if (!skuTotals[product.sku]) skuTotals[product.sku] = 0;
            candidates.push({
                sku: product.sku, productName: product.name, platform: r.platform || 'Unknown',
                date: r.date, price: 0, velocity: r.quantity, revenue: 0, 
                profit: -r.amount, margin: 0, periodReturnRate: derivedMetrics.periodReturnRate,
                allTimeReturnRate: product.returnRate || 0, type: 'REFUND', reason: r.reason, refundAmount: r.amount, status: r.status
            });
        }
    });

    let validSkus = new Set<string>();
    if (intent.limit && intent.limit > 0) {
        const sortedSkus = Object.entries(skuTotals).sort(([, a], [, b]) => (intent.sort?.direction === 'asc' ? a - b : b - a)).slice(0, intent.limit).map(([sku]) => sku);
        validSkus = new Set(sortedSkus);
    } else { validSkus = new Set(Object.keys(skuTotals)); }

    const results: any[] = [];
    candidates.forEach(cand => {
        if (validSkus.has(cand.sku)) {
            const contribution = grandTotalRevenue > 0 ? (cand.revenue / grandTotalRevenue) * 100 : 0;
            results.push({ ...cand, contribution: contribution });
        }
    });

    if (intent.sort) {
        results.sort((a, b) => {
            const field = intent.sort!.field;
            const valA = a[field] || 0;
            const valB = b[field] || 0;
            return intent.sort!.direction === 'asc' ? valA - valB : valB - valA;
        });
    }

    return { results, timeLabel };
};
