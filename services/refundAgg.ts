import { RefundLog, ReturnDateBasis } from '../types';
import { asDateKey, getReturnDateKey } from './dateUtils';
import { VAT_MULTIPLIER } from '../constants';

export interface RefundAggregationOptions {
  salesMap?: Map<string, number>; // SKU -> Unit Sales Count
  revenueMap?: Map<string, number>; // SKU -> Revenue Amount
  productMap?: Map<string, { name: string }>; // SKU -> Product Info
  dateBasis?: ReturnDateBasis; // Mode for date attribution
  orderDateMap?: Map<string, string>; // Lookup for original order dates
}

export interface RefundSkuRow {
  sku: string;
  title: string;
  platform: string;
  refundCount: number;
  refundQty: number; // Sum of physical units
  refundValue: number; // Total Value (Item + Freight) Inc VAT
  itemValue: number; // Item Only Value Inc VAT
  freightValue: number; // Freight Only Value Inc VAT
  logisticsFeeValue: number;
  topReasons: { reason: string; count: number }[];
  refundRate: number | null; // %
  refundRateValue: number | null;
  flags: string[];
}

export interface RefundReasonRow {
  reason: string;
  count: number;
  value: number;
}

export interface RefundTimelineBucket {
  date: string;
  count: number;
  value: number;
}

export interface RefundOverview {
  kpis: {
    totalRefundCount: number;
    totalRefundQty: number;
    totalRefundValue: number;
    totalLogisticsFees: number;
    refundRateQty: number | null;
    refundRateValue: number | null;
  };
  skuRows: RefundSkuRow[];
  reasonRows: RefundReasonRow[];
  timeline: RefundTimelineBucket[];
  meta: {
    columnsUsed: string[];
  };
}

export const buildRefundOverview = (
  refundRows: RefundLog[],
  opts: RefundAggregationOptions = {}
): RefundOverview => {
  const kpis = {
    totalRefundCount: 0,
    totalRefundQty: 0,
    totalRefundValue: 0,
    totalLogisticsFees: 0,
    refundRateQty: null as number | null,
    refundRateValue: null as number | null,
  };

  const skuMap = new Map<string, {
    count: number;
    qty: number;
    value: number;
    itemVal: number;
    freight: number;
    logistics: number;
    reasons: Map<string, number>;
    platform: string;
    timestamps: number[];
  }>();

  const reasonMap = new Map<string, { count: number; value: number }>();
  const timelineMap = new Map<string, { count: number; value: number }>();
  
  // Track which optional fields we actually encountered
  const columnsSeen = new Set<string>(['sku', 'amount', 'date', 'quantity']);

  for (const row of refundRows) {
    // --- Global KPI Aggregation ---
    kpis.totalRefundCount += 1;
    
    // Amounts stored Ex-VAT. Scale to Inc-VAT for display.
    const amountExVat = Number(row.amount) || 0;
    const freightExVat = Number(row.freightAmount) || 0;
    
    const itemIncVat = amountExVat * VAT_MULTIPLIER;
    const freightIncVat = freightExVat * VAT_MULTIPLIER;
    const totalIncVat = itemIncVat + freightIncVat;

    const quantity = Number(row.quantity) || 1;
    
    kpis.totalRefundValue += totalIncVat;
    kpis.totalRefundQty += quantity;
    
    // Metadata tracking
    if (row.platform) columnsSeen.add('platform');
    if (row.orderId) columnsSeen.add('orderId');
    if (row.reason) columnsSeen.add('reason');
    if (row.orderType) columnsSeen.add('type');
    if (row.customerReason) columnsSeen.add('customerReason');

    // --- SKU Aggregation ---
    const sku = row.sku || 'Unknown';
    if (!skuMap.has(sku)) {
      skuMap.set(sku, {
        count: 0,
        qty: 0,
        value: 0,
        itemVal: 0,
        freight: 0,
        logistics: 0,
        reasons: new Map(),
        platform: row.platform || 'Unknown',
        timestamps: []
      });
    }
    const entry = skuMap.get(sku)!;
    entry.count += 1;
    entry.qty += quantity;
    entry.value += totalIncVat;
    entry.itemVal += itemIncVat;
    entry.freight += freightIncVat;

    // --- Timeline Aggregation ---
    const dateBasis = opts.dateBasis || 'refundDate';
    const dateKey = getReturnDateKey(row, dateBasis, opts.orderDateMap);
    if (dateKey) {
      const ts = new Date(dateKey).getTime();
      if (!isNaN(ts)) {
        entry.timestamps.push(ts);
        
        if (!timelineMap.has(dateKey)) {
          timelineMap.set(dateKey, { count: 0, value: 0 });
        }
        const tBucket = timelineMap.get(dateKey)!;
        tBucket.count += 1;
        tBucket.value += totalIncVat;
      }
    }

    // --- Reason Aggregation ---
    // Priority: reason -> customerReason -> platformReason -> 'Unknown'
    const reason = row.reason || row.customerReason || row.platformReason || 'Unknown';
    
    entry.reasons.set(reason, (entry.reasons.get(reason) || 0) + 1);

    if (!reasonMap.has(reason)) {
      reasonMap.set(reason, { count: 0, value: 0 });
    }
    const rBucket = reasonMap.get(reason)!;
    rBucket.count += 1;
    rBucket.value += totalIncVat;
  }

  // --- Finalize SKU Rows ---
  const skuRows: RefundSkuRow[] = [];
  
  skuMap.forEach((data, sku) => {
    // Top 3 Reasons
    const topReasons = Array.from(data.reasons.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([r, c]) => ({ reason: r, count: c }));

    // Flags Computation
    const flags: string[] = [];
    
    // 1. High Cost
    if (data.value > 300) flags.push("High Cost");

    // 2. Rising Trend (Simple)
    if (data.timestamps.length >= 2) {
      data.timestamps.sort((a, b) => a - b);
      const minT = data.timestamps[0];
      const maxT = data.timestamps[data.timestamps.length - 1];
      const span = maxT - minT;
      if (span > 0) {
        const mid = minT + (span / 2);
        const firstHalf = data.timestamps.filter(t => t < mid).length;
        const secondHalf = data.timestamps.filter(t => t >= mid).length;
        if (secondHalf > (firstHalf * 1.5) && secondHalf > 2) {
          flags.push("Rising Trend");
        }
      }
    }

    // 3. Refund Rate
    let refundRate: number | null = null;
    let refundRateValue: number | null = null;
    if (opts.salesMap && opts.salesMap.has(sku)) {
      const sales = opts.salesMap.get(sku) || 0;
      if (sales > 0) {
        refundRate = (data.qty / sales) * 100;
        if (refundRate > 10) flags.push("High Rate");
      }
    }
    if (opts.revenueMap && opts.revenueMap.has(sku)) {
        const revenue = opts.revenueMap.get(sku) || 0;
        if (revenue > 0) {
            refundRateValue = (data.value / revenue) * 100;
        }
    }

    // Title resolution
    let title = sku;
    if (opts.productMap && opts.productMap.has(sku)) {
      title = opts.productMap.get(sku)!.name;
    }

    skuRows.push({
      sku,
      title,
      platform: data.platform,
      refundCount: data.count,
      refundQty: data.qty,
      refundValue: data.value,
      itemValue: data.itemVal,
      freightValue: data.freight,
      logisticsFeeValue: data.logistics,
      topReasons,
      refundRate,
      refundRateValue,
      flags
    });
  });

  // --- Finalize Global KPIs ---
  if (opts.salesMap) {
    let totalUnitsSold = 0;
    for (const val of opts.salesMap.values()) totalUnitsSold += val;
    if (totalUnitsSold > 0) {
      kpis.refundRateQty = (kpis.totalRefundQty / totalUnitsSold) * 100;
    }
  }

  if (opts.revenueMap) {
    let totalRevenueSold = 0;
    for (const val of opts.revenueMap.values()) totalRevenueSold += val;
    if (totalRevenueSold > 0) {
      kpis.refundRateValue = (kpis.totalRefundValue / totalRevenueSold) * 100;
    }
  }

  // --- Sort Outputs ---
  const sortedSkuRows = skuRows.sort((a, b) => b.refundValue - a.refundValue);
  const sortedReasonRows = Array.from(reasonMap.entries())
    .map(([r, d]) => ({ reason: r, ...d }))
    .sort((a, b) => b.count - a.count);
  const sortedTimeline = Array.from(timelineMap.entries())
    .map(([d, val]) => ({ date: d, ...val }))
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    kpis,
    skuRows: sortedSkuRows,
    reasonRows: sortedReasonRows,
    timeline: sortedTimeline,
    meta: {
      columnsUsed: Array.from(columnsSeen)
    }
  };
};
