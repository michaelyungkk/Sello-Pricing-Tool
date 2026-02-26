
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

export interface ShipmentLog {
  id: string;
  sku: string;
  service: string;
  cost: number;
  date: string;
}

export interface PriceChangeRecord {
  id: string;
  sku: string;
  productName?: string;
  date: string;
  oldPrice: number;
  newPrice: number;
  changeType: 'INCREASE' | 'DECREASE';
  percentChange: number;
  preVel?: number;
  postVel?: number;
  velocityChange?: number;
}

export interface CostChangeRecord {
  id: string;
  sku: string;
  productName?: string;
  date: string;
  oldCost: number;
  newCost: number;
  changeType: 'INCREASE' | 'DECREASE';
  percentChange: number;
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
