export interface CategoryPolicy {
    id: string;
    mainCategory: string;
    subCategory?: string; // Optional subcategory override
    platform?: string; // Optional platform override
    targetMarginPct?: number | null;
    baselinePrice?: number | null;
    notes?: string;
    updatedAt?: string;
    updatedBy?: 'manual' | 'import';
}

export type AttributeMap = Record<string, string>; // Key: Raw Value (lowercase), Value: Canonical Value

export interface ChannelData {
    platform: string;
    manager: string;
    velocity: number;
    price?: number;
    skuAlias?: string;
}

export interface CartonDimensions {
    weight: number;
    length: number;
    height: number;
    width: number;
}

export interface ShipmentDetail {
    containerId: string;
    quantity: number;
    status: string; // 'Delivered' | 'Pending' etc
    eta?: string;
}

export interface SkuCostDetail {
    unitPrice: number;
    salesAmt: number;
    skuQty: number;
    extraFreight?: number;
    promoRebate?: number;
    cogs: number;
    cogsPct?: number;
    postage: number;
    postagePct?: number;
    sellingFee: number;
    sellingFeePct?: number;
    adsFee: number;
    adsFeePct?: number;
    otherFee: number;
    otherFeePct?: number;
    subscriptionFee: number;
    subscriptionFeePct?: number;
    wmsFee: number;
    wmsFeePct?: number;
    resendQty?: number;
    resendAmt?: number;
    refundQty?: number;
    refundAmt?: number;
    returnAmtPct?: number;
    profitInclRn: number;
    profitInclRnPct: number;
    lastUpdated: string;
}

export interface Product {
    id: string;
    name: string;
    sku: string;
    channels: ChannelData[];
    currentPrice: number;
    costPrice?: number;
    stockLevel: number;
    averageDailySales: number;
    dailyAverageSales?: number;
    leadTimeDays: number;
    status: 'Critical' | 'Healthy' | 'Overstock' | 'Warning';
    recommendation: string;
    daysRemaining: number;
    category?: string;
    subcategory?: string;
    lastUpdated?: string;
    brand?: string;

    // Optional / Calculated
    oldPrice?: number;
    optimalPrice?: number;
    maxVelocityPrice?: number;
    caPrice?: number;
    incomingStock?: number;
    returnRate?: number;
    _trendData?: { velocityChange: number };
    seasonTags?: string[];
    festivalTags?: string[];
    sellingFee?: number;
    adsFee?: number;
    postage?: number;
    extraFreight?: number;
    wmsFee?: number;
    otherFee?: number;
    subscriptionFee?: number;
    costDetail?: SkuCostDetail;
    shipments?: ShipmentDetail[];
    imageUrl?: string;
    inventoryStatus?: string; // 'New Product'

    // Listing content — populated via CA Upload or dedicated description upload
    description?: string;        // Full product content (title + desc + features + specs)

    // Listing speed tracking
    landedAt?: string;           // ISO date — set ONCE when product first appears via inventory upload
    listingReadyAt?: string;     // ISO date — set ONCE when both imageUrl AND description are populated
    agedStockQty?: number;
    cartonDimensions?: CartonDimensions;
    gradeLevel?: number;
    previousDailySales?: number;

    // Derived in aggregations - optional
    periodUnits?: number;
    periodRevenue?: number;
    periodProfit?: number;
    periodAdSpend?: number;
    periodMargin?: number;
    periodRunway?: number;
    displayPrice?: number;
    [key: string]: any; // Allow for dynamic properties from aggregation
}

export interface PriceLog {
    id?: string;
    sku: string;
    rawSku?: string;
    date: string;
    price: number;
    velocity: number;
    margin?: number;
    profit?: number;
    platform?: string;
    adsSpend?: number;
    rawAdsSpend?: number;

    // Order context
    orderId?: string;
    postcode?: string;
    logisticPartner?: string;
    logisticService?: string;

    realPostage?: number;
    realExtraFreight?: number;
}

export interface RefundLog {
    id: string;
    sku: string;
    rawSku?: string;
    date: string;
    amount: number;
    freightAmount?: number;
    quantity: number;
    platform?: string;
    reason?: string;
    customerReason?: string;
    platformReason?: string;
    comments?: string;
    commentEn?: string;
    commentCn?: string;
    remarks?: string;

    orderId?: string;
    orderType?: 'refund' | 'resend';
    resendBaseOrderId?: string;
    status?: string;

    logisticPartner?: string;
}

export interface FreightRate {
    sku: string;
    rate: number;
}

export interface PriceChangeRecord {
    id: string;
    sku: string;
    productName?: string;
    timestamp?: number;
    date: string;
    platform: string;
    oldPrice: number;
    newPrice: number;
    delta?: number;
    source?: string;
    appliedBy?: string;
    changeType?: 'INCREASE' | 'DECREASE';
    percentChange?: number;
    preVel?: number;
    postVel?: number;
    velocityChange?: number;
}

export interface CostChangeRecord {
    id: string;
    sku: string;
    productName?: string;
    timestamp?: number;
    date: string;
    oldCost: number;
    newCost: number;
    delta?: number;
    source?: string;
    changeType?: 'INCREASE' | 'DECREASE';
    percentChange?: number;
}

export interface InventoryChangeRecord {
    id: string;
    sku: string;
    productName?: string;
    timestamp: number;
    date: string;
    prevStock: number;
    newStock: number;
    deltaStock: number;
    source: string;
    uploadBatchId?: string;
    isStrategic: boolean;
    reason?: string;
}

export interface PromotionItem {
    sku: string;
    basePrice?: number;
    promoPrice: number;
    discountType?: 'PERCENT_OFF' | 'FIXED_OFF' | 'FIXED_PRICE';
    discountValue?: number;

    // Derived/Display
    product?: Product;
    discountPercent?: number;
    isIncomplete?: boolean;
    projectedMargin?: number;

    // Analytics
    baselineDailyUnits?: number;
    forecastUnits?: number;
    actualUnits?: number;
    actualRevenue?: number;
    actualProfit?: number;
    upliftUnits?: number;
    upliftRevenue?: number;
    upliftProfit?: number;
    marginPctDuring?: number;
    baselinePrice?: number;
}

export interface PromotionEvent {
    id: string;
    name: string;
    platform: string;
    startDate: string;
    endDate: string;
    submissionDeadline?: string;
    status: 'UPCOMING' | 'ACTIVE' | 'ENDED';
    items: PromotionItem[];
    remark?: string;
    promotionScope?: 'SKU' | 'SHOP';
    baselineMode?: 'CA_PRICE' | 'PRE_EVENT_AVG_PRICE' | 'MANUAL';
    baselineManualPrice?: number;
    shopDiscountType?: 'PERCENT_OFF' | 'FIXED_OFF' | 'FIXED_PRICE';
    shopDiscountValue?: number;
    expectedLiftPct?: number;
    lift?: number | null;
    schemaVersion?: number;
}

export interface PlatformConfig {
    markup: number;
    commission: number;
    manager: string;
    color: string;
    isExcluded?: boolean;
    pricingControl?: string; // 'MERCHANT' | 'PLATFORM_COST_BASED' | 'HYBRID'
    feeModel?: string; // 'COMMISSION_PCT' | 'FIXED_PER_ORDER' | 'COST_BASED_MARKUP' | 'NONE'
    adsEnabled: boolean;
    adsAttribution?: string; // 'SKU_LEVEL' | 'LUMP_SUM'
    fixedFee?: number;
    updatedAt?: string;
}

export type PricingRules = Record<string, PlatformConfig>;

export interface LogisticsRule {
    id: string;
    name: string;
    carrier: string;
    price: number;
    maxWeight?: number;
    maxLength?: number;
}

export interface StrategyConfig {
    increase: {
        minRunwayWeeks: number;
        minStock: number;
        minVelocity7Days: number;
        adjustmentPercent: number;
        adjustmentFixed: number;
    };
    decrease: {
        highStockWeeks: number;
        medStockWeeks: number;
        minMarginPercent: number;
        adjustmentPercent: number;
        adjustmentFixed: number;
        includeNewProducts: boolean;
        freshStockGuardDays: number;
    };
    safety: {
        minMarginPercent: number;
    };
}

export interface SearchConfig {
    volumeBands: {
        topPercentile: number;
        bottomPercentile: number;
    };
    minAbsoluteFloor: number;
}

export interface AnalysisResult {
    productId: string;
    recommendedPrice: number;
    percentageChange: number;
    daysRemaining: number;
    status: 'Critical' | 'Warning' | 'Healthy' | 'Overstock';
    reasoning: string;
}

export interface SearchChip {
    type: 'METRIC' | 'CONDITION' | 'PLATFORM' | 'TIME' | 'TEXT';
    value: string;
    label: string;
}

export interface SearchSession {
    id: string;
    query: string;
    results: any[];
    params: any; // SearchIntent
    explanation?: string;
    timeLabel?: string;
    timestamp: number;
}

export interface SingleBufferRule {
    id: string;
    operator: 'EQ' | 'LT' | 'GT' | 'LTE' | 'GTE' | 'RANGE' | string;
    trigger: string;
    value: string;
}

export interface BufferRules {
    rules: SingleBufferRule[];
    // Legacy support
    triggerA?: string;
    operatorA?: 'EQ'; // etc
    valueA?: string;
    triggerB?: string;
    operatorB?: 'EQ';
    valueB?: string;
}

export interface PriceCheckTemplate {
    id: string;
    platform: string;
    skuColumn: string;
    priceColumn: string;
}

export interface InventoryTemplate {
    id: string;
    name: string;
    headers: string[];
    skuColumn: string;
    stockColumn: string;
    metaRows?: any[][];
    bufferRules: BufferRules;
    exportFormat?: 'csv' | 'xlsx';
}

export interface AdGroup {
    id: string;
    name: string;
    memberSkus: string[];
    platform: string;
    startDate: string;
    endDate?: string;
    createdAt: string;
    updatedAt: string;
}

export interface SkuFamily {
    id: string;
    name: string;
    memberSkus: string[];
    createdAt: string;
    updatedAt: string;
}

export interface UserProfile {
    name?: string;
    themeColor: string;
    backgroundImage?: string;
    backgroundColor?: string;
    glassMode?: 'light' | 'dark';
    glassOpacity?: number;
    glassBlur?: number;
    ambientGlass?: boolean;
    ambientGlassOpacity?: number;
    textColor?: string;
}

export type Platform = string;

export type VelocityLookback = string;

export type ReturnDateBasis = 'refundDate' | 'orderDate';

export interface HistoryPayload {
    sku: string;
    date: string;
    price: number;
    velocity: number;
    margin?: number;
    profit?: number;
    adsSpend?: number;
    platform?: string;
    orderId?: string;
    postcode?: string;
    logisticPartner?: string;
    logisticService?: string;
    realPostage?: number;
    realExtraFreight?: number;
}
// =============================================================================
// OPTIMAL PRICE ALGORITHM — Types (added Session 1)
// =============================================================================

export interface PriceBucket {
    category: string;
    bucketIndex: number;
    priceMin: number;
    priceMax: number;
    label: string;   // e.g. "£80–120"
    skuCount: number;
}

export interface CohortStats {
    bucketKey: string;
    category: string;
    bucket: PriceBucket;
    skuCount: number;
    totalEligibleTx: number;
    medianVelocity: number;
    medianMarginPct: number;
    priceElasticity: number;
    optimalPriceRatio: number;
    optimalDailyProfit: number;
}

export interface CohortSnapshot {
    computedAt: string;
    categoryBuckets: Map<string, PriceBucket[]>;
    cohortStats: Map<string, CohortStats>;  // bucketKey → stats
    skuAssignments: Map<string, string>;    // canonicalSku → bucketKey
    version: number;
}

export interface BenchmarkUpdateNotice {
    category: string;
    reason: 'new_sku' | 'price_bucket_shift';
    skuCount: number;       // how many SKUs triggered this in the category
    detectedAt: string;     // ISO timestamp
}

export interface PriceEra {
    eraId: string;
    sku: string;        // canonical SKU
    caPrice: number;
    startDate: string;
    endDate: string;
}

export type TransactionSource = 'organic' | 'promo';

export interface TaggedTransaction extends PriceLog {
    canonicalSku: string;       // resolved canonical SKU
    rawSku: string;             // original SKU from data (for transparency)
    source: TransactionSource;
    effectivePrice: number;
    promoDiscountPct?: number;
    eraId: string;
}

export interface PricePoint {
    price: number;
    source: 'organic' | 'promo';
    eraId: string;
    totalUnits: number;
    weekCount: number;
    velocity: number;
    margin: number;
    dailyProfit: number;
    promoDiscountPct?: number;
}

export interface OptimalPriceResult {
    sku: string;                    // canonical SKU
    currentPrice: number;
    recommendedPrice: number;

    // Confidence & source
    confidence: number;             // 0.0–1.0
    source: 'SKU_DATA' | 'BLENDED' | 'COHORT' | 'GUARDRAIL';

    // Expected impact
    currentDailyProfit: number;
    expectedDailyProfit: number;
    profitUplift: number;           // % change
    expectedVelocityChange: number;
    expectedMarginChange: number;   // pp change

    // Cohort context
    cohort: {
        category: string;
        bucket: string;
        skusInBucket: number;
        medianMarginPct: number;
        medianVelocity: number;
        elasticity: number;
    };

    // SKU-level data
    skuPricePoints: PricePoint[];
    organicPointCount: number;
    promoPointCount: number;

    // Alias transparency
    aliasesUsed: string[];          // raw alias SKUs merged into this result

    // Transparency
    reasoning: string;              // full human-readable explanation
    wasConstrained: boolean;
    constraintReason?: string;

    // Metadata
    calculatedAt: string;           // ISO timestamp

    // Data quality
    warnings: string[];
}


// ════════════════════════════════════════════════════════════
//  AD CAMPAIGN TYPES
//  Append these to the bottom of types.ts
// ════════════════════════════════════════════════════════════

export type AdSkuFlag =
    | 'ZERO_SALES'
    | 'MONITORING'
    | 'DOWNTREND'
    | 'BUDGET_HOG_LOW_ROAS'
    | 'BUDGET_HOG_HIGH_ROAS'
    | 'GRADE_CHANGED'
    | 'LOW_STOCK'
    | 'HIGH_PERFORMER'
    | 'LOW_CTR'
    | 'HIGH_CLICKS_NO_CONVERSION'
    | 'HALO_ONLY';

export interface AdGroupSnapshot {
    name: string;
    adGroupId?: string;

    // Config
    dailyBudget: number;
    bidStrategy: 'auto' | 'manual';
    bidPrice?: number;

    // Broad metrics
    impressions: number;
    clicks: number;
    spend: number;
    spendOptIn: number;
    conversions: number;
    orders: number;
    sales: number;
    ctr: number;
    cpc: number;
    acosOptIn: number;
    roasOptIn: number;

    // Direct metrics
    directConversions: number;
    directOrders: number;
    directSales: number;
    directRoas: number;

    // Derived
    utilisation: number;
    spendToSalesRatio: number;
    haloEffect: number;

    // Member SKUs this week
    memberSkus: string[];

    // Auto-generated summary
    weeklySummary: string;

    // Free-text notes
    notes?: string;
}

export interface AdCampaign {
    name: string;
    campaignId?: string;
    account: string;
    adGroups: AdGroupSnapshot[];
    weeklySummary: string;
    notes?: string;
}

export interface DailySkuRow {
    date: string;
    campaign: string;
    adGroup: string;
    offerSku: string;
    mappedSku: string;
    productName: string;
    productCategory: string;
    brand: string;
    impressions: number;
    clicks: number;
    spend: number;
    conversions: number;
    orders: number;
    sales: number;
    directConversions: number;
    directOrders: number;
    directSales: number;
}

export interface AdSnapshot {
    id: string;
    platform: string;
    weekStartDate: string;
    weekEndDate: string;
    importedAt: string;
    campaigns: AdCampaign[];
    dailySkuData: DailySkuRow[];
}

export interface AdSkuWeeklySummary {
    sku: string;
    offerSku: string;
    adGroup: string;
    campaign: string;
    productName: string;
    brand: string;
    category: string;

    // Broad
    impressions: number;
    clicks: number;
    spend: number;
    sales: number;
    orders: number;
    conversions: number;
    roas: number;
    ctr: number;
    cpc: number;
    spendShare: number;

    // Direct
    directSales: number;
    directOrders: number;
    directConversions: number;
    directRoas: number;
    haloSales: number;

    // Profit
    poas: number;

    // Product context
    gradeLevel: number;
    stockQty: number;
    runway: number;
    isLowStock: boolean;

    // WoW
    prevWeekSales: number;
    prevWeekSpend: number;
    prevWeekOrders: number;
    salesTrend: 'up' | 'down' | 'flat' | 'new' | 'no-data';
    salesDelta: string;
    ordersDelta: string;

    // CTR benchmark
    ctrVsGroupAvg: number;

    // Grace period
    weeksInGroup: number;
    addedDate?: string;

    // Flags
    flags: AdSkuFlag[];
}

export interface AdRosterChange {
    id: string;
    date: string;
    weekOf: string;
    platform: string;
    campaign: string;
    adGroup: string;
    sku: string;
    action: 'ADD' | 'REMOVE';
    reason: string;
    performedBy?: string;
}

export interface AdCandidate {
    sku: string;
    productName: string;
    brand: string;
    category: string;
    gradeLevel: number;
    stockQty: number;
    runway: number;
    platformSales30d: number;
    platformUnits30d: number;
    platformSalesShare: number;
    score: number;
    reasons: string[];
    isAlreadyInAdGroup: boolean;
    currentAdGroup?: string;
}

// Stored in useAppState
export interface AdCampaignState {
    snapshots: AdSnapshot[];
    rosterChanges: AdRosterChange[];
    // budgets persisted per adGroup name, per platform
    budgets: Record<string, number>; // key: `${platform}::${adGroupName}`
}
