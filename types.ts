
export interface ChannelData {
  platform: string;
  manager: string;
  velocity: number;
  price?: number; // Specific average selling price for this channel (Gross)
  skuAlias?: string; // The specific SKU used on this platform (e.g., SKU_1)
}

export interface FeeBounds {
  min: number;
  max: number;
}

export interface ShipmentDetail {
  containerId: string;
  status: string; // 'Shipped Out' | 'To Be Shipped'
  quantity: number;
  eta?: string; // Expected ETA
  customsDate?: string; // Custom Clearing Date
}

export interface RefundLog {
  id: string;
  sku: string;
  date: string;
  quantity: number;
  amount: number; // Ex-VAT value
  platform?: string;
  reason?: string; // Primary display reason (fallback/combined)
  orderId?: string;
  
  // Extended fields for deep-dive analysis
  customerReason?: string; // 'Reason for refund'
  platformReason?: string; // 'Platform after-sales reason'
  type?: string; // 'After-sales Type'
  status?: string; // 'After-sales status'
  remarks?: string; // 'Remarks'
  comments?: string; // 'Comments' - Added to distinguish from remarks
  
  // New Import Fields (v2)
  freightAmount?: number; // Ex-VAT
  orderType?: 'refund' | 'resend';
  resendBaseOrderId?: string;
  commentCn?: string;
  commentEn?: string;
  logisticPartner?: string; // New: To track return/complaint attribution to carrier
}

export type ReturnDateBasis = 'refundDate' | 'orderDate';

export interface PriceChangeRecord {
  id: string;
  sku: string;
  productName: string;
  date: string;          // ISO Date of the change detection (upload time)
  oldPrice: number;      // Previous CA Price
  newPrice: number;      // New CA Price
  changeType: 'INCREASE' | 'DECREASE';
  percentChange: number;
}

export interface CostChangeRecord {
  id: string;
  sku: string;
  productName: string;
  date: string;
  oldCost: number;
  newCost: number;
  changeType: 'INCREASE' | 'DECREASE';
  percentChange: number;
}

export interface InventoryChangeRecord {
  id: string;
  sku: string;
  productName: string;
  timestamp: number;
  date: string; // YYYY-MM-DD
  prevStock: number;
  newStock: number;
  deltaStock: number;
  source: string;
  uploadBatchId?: string;
  isStrategic?: boolean; // New: True if >5% increase or matched to shipment
  reason?: string; // New: Explanation for classification
}

export interface SkuCostDetail {
  unitPrice: number; // Derived: sales_amt / sku_qty
  salesAmt: number;
  skuQty: number; // Added to store sales quantity from report
  extraFreight: number;
  promoRebate: number;
  cogs: number;
  cogsPct: number;
  postage: number;
  postagePct: number;
  sellingFee: number;
  sellingFeePct: number;
  adsFee: number;
  adsFeePct: number;
  otherFee: number;
  otherFeePct: number;
  subscriptionFee: number;
  subscriptionFeePct: number;
  wmsFee: number;
  wmsFeePct: number;
  resendQty: number;
  resendAmt: number;
  refundQty: number;
  refundAmt: number;
  returnAmtPct: number;
  profitInclRn: number;
  profitInclRnPct: number;
  lastUpdated: string;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  imageUrl?: string; // Product Image URL

  // Aggregated Data
  channels: ChannelData[]; // List of where this product is sold and who manages it
  currentPrice: number; // Weighted average price or master price
  caPrice?: number; // Channel Advisor reference price (used as reference regardless of platform)
  oldPrice?: number; // Previous price for tracking changes
  platform?: string; // Optional: Primary platform for analysis context

  // Stock & Velocity
  stockLevel: number; // Total stock across warehouses (On Hand)
  agedStockQty?: number; // New: Quantity of stock older than threshold (e.g. 90 days)
  incomingStock?: number; // Total Incoming Stock (On Water/Booking)
  shipments?: ShipmentDetail[]; // List of active shipments

  averageDailySales: number; // Current Velocity (Week 0)
  previousDailySales?: number; // Previous Velocity (Week 1) for trend analysis
  leadTimeDays: number;
  gradeLevel?: number;
  dailyAverageSales: number; // ERP-provided daily average sales

  // Costs & Fees
  costPrice?: number; // Cost of Goods Sold (From Inventory Report)
  sellingFee?: number;
  adsFee?: number;
  postage?: number;
  extraFreight?: number; // Added Extra Freight (Income)
  otherFee?: number;
  subscriptionFee?: number;
  wmsFee?: number;

  // Fee Statistics (Min/Max from import)
  feeBounds?: {
    sellingFee?: FeeBounds;
    adsFee?: FeeBounds;
    postage?: FeeBounds;
    extraFreight?: FeeBounds;
    otherFee?: FeeBounds;
    subscriptionFee?: FeeBounds;
    wmsFee?: FeeBounds;
  };

  // Strategic Bounds & Intelligence
  floorPrice?: number;   // Minimum allowable price
  ceilingPrice?: number; // Maximum allowable price
  optimalPrice?: number; // Calculated "Sweet Spot" based on history (Max Profit)
  maxVelocityPrice?: number; // Calculated price based on history (Max Volume)

  // Analysis Fields (Populated during import)
  status: 'Critical' | 'Warning' | 'Healthy' | 'Overstock';
  recommendation: string;
  daysRemaining: number;

  category: string; // Main Category
  subcategory?: string; // Subcategory
  brand?: string; // Brand
  inventoryStatus?: string; // e.g. "New Product", "Active", "Clearance" from ERP

  // Dimensions (Stored from ERP)
  cartonDimensions?: {
    length: number;
    width: number;
    height: number;
    weight: number;
  };

  lastUpdated: string;

  // Dynamic Metrics (Calculated on the fly)
  returnRate?: number; // % of units returned vs sold
  totalRefunded?: number; // Total value refunded in current period
  
  // New: Cost Detail Report Data
  costDetail?: SkuCostDetail;

  // New: Seasonal/Festival Tags
  seasonTags?: string[];
  festivalTags?: string[];

  // Transient Data
  _trendData?: { velocityChange: number };
}

// FIX: Added missing AnalysisResult interface for Gemini service responses.
export interface AnalysisResult {
  productId: string;
  recommendedPrice: number;
  percentageChange: number;
  daysRemaining: number;
  status: 'Critical' | 'Warning' | 'Healthy' | 'Overstock';
  reasoning: string;
}

export interface PriceLog {
  id: string;
  sku: string;
  date: string;
  price: number;
  velocity: number; // Sales per day at this price
  margin: number; // Net % at this price
  profit?: number; // Absolute profit value
  adsSpend?: number; // Optional: Daily Ad Spend specifically for this SKU/Date
  platform?: string; // Platform specific tag (optional to support legacy data)
  orderId?: string; // Optional: Unique Order ID for transaction-level tracking
  postcode?: string; // New: Receive Postcode
  logisticPartner?: string; // New: For carrier performance analysis (label_provider)
  logisticService?: string; // New: Granular service level (e.g. Yodel 24, Evri Next Day)
  realPostage?: number; // Actual Postage cost from transaction
  realExtraFreight?: number; // Actual Extra Freight income from transaction
}

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
  postcode?: string; // New: Receive Postcode
  logisticPartner?: string; // New: Label Provider
  logisticService?: string; // New: Service Name
  realPostage?: number; // Actual Postage cost from transaction
  realExtraFreight?: number; // Actual Extra Freight income from transaction
}

export interface ShipmentLog {
  id: string;
  sku: string;
  service: string;
  cost: number;
  date: string;
}

export type Platform = string;

export interface PlatformConfig {
  markup: number;
  commission: number;
  fixedFee?: number; // Added to support FIXED_PER_ORDER fee model
  manager: string;
  color?: string; // Hex color code for the platform badge
  isExcluded?: boolean; // If true, exclude from Global Weighted Averages
  
  // New configuration fields for Strategy Engine
  pricingControl: 'MERCHANT' | 'PLATFORM_COST_BASED' | 'HYBRID';
  feeModel: 'COMMISSION_PCT' | 'FIXED_PER_ORDER' | 'NONE' | 'COST_BASED_MARKUP';
  adsEnabled: boolean;
  adsAttribution?: 'SKU_LEVEL' | 'LUMP_SUM';
  updatedAt?: string; // ISO timestamp of last update
  updatedBy?: string; // Optional identifier of who made the update
}

export type PricingRules = Record<Platform, PlatformConfig>;

// --- STRATEGY ENGINE TYPES ---

export interface StrategyConfig {
  increase: {
    minRunwayWeeks: number; // e.g. 6
    minStock: number; // e.g. 0
    minVelocity7Days: number; // e.g. 2 units
    adjustmentPercent: number; // e.g. 5
    adjustmentFixed: number; // e.g. 1 (GBP)
  };
  decrease: {
    highStockWeeks: number; // e.g. 48
    medStockWeeks: number; // e.g. 24
    minMarginPercent: number; // e.g. 25
    adjustmentPercent: number; // e.g. 5
    adjustmentFixed?: number; // e.g. 1 (GBP) - Added for fixed decrease
    includeNewProducts?: boolean; // Override to include new products in decrease logic
    freshStockGuardDays?: number; // Days to wait before considering price decrease after restock
  };
  safety: {
    minMarginPercent: number; // e.g. 10 (Cost * 1.10)
  };
}

// --- SEARCH CONFIGURATION TYPE ---
export interface SearchConfig {
  volumeBands: {
    topPercentile: number; // e.g. 20 (Top 20%)
    bottomPercentile: number; // e.g. 20 (Bottom 20%)
  };
  minAbsoluteFloor: number; // e.g. 10 units
}

// --- LOGISTICS MODULE TYPES ---

export interface LogisticsRule {
  id: string;
  name: string; // The service code e.g. YODEL-48-MED-UK
  carrier: string; // e.g. Yodel, Evri
  price: number;
  maxWeight?: number; // kg
  maxVolume?: number; // m3
  maxLength?: number; // cm
}

// --- PROMOTION MODULE TYPES ---

export interface PromotionItem {
  sku: string;
  basePrice: number;
  discountType: 'PERCENTAGE' | 'FIXED' | 'FIXED_PRICE' | 'PERCENT_OFF' | 'FIXED_OFF';
  discountValue: number;
  promoPrice: number;
  discountedPrice?: number; // New for FIXED_PRICE alias
  discountPrice?: number; // Legacy/Migration compatibility
}

export interface PromotionEvent {
  id: string;
  name: string;
  platform: string;
  startDate: string;
  endDate: string;
  submissionDeadline?: string;
  remark?: string; // Added remark field
  status: 'UPCOMING' | 'ACTIVE' | 'ENDED';
  items: PromotionItem[];
  performance?: {
    unitsSold: number;
    revenue: number;
    upliftPercentage: number; // Sales uplift vs BAU
  };
  // Task 2: Extended Promotion Meta
  promotionScope?: 'SKU' | 'SHOP';
  baselineMode?: 'CA_PRICE' | 'PRE_EVENT_AVG_PRICE' | 'MANUAL';
  baselineManualPrice?: number;
  expectedLiftPct?: number;
  notes?: string;
  shopDiscountType?: 'PERCENT_OFF' | 'FIXED_OFF' | 'FIXED_PRICE';
  shopDiscountValue?: number;
}

export interface UserProfile {
  name: string;
  themeColor: string; // Hex
  backgroundImage: string; // URL or 'none'
  backgroundColor: string; // Hex fallback
  textColor?: string; // Optional: Auto-detected optimal text color

  // Liquid Glass Aesthetics
  glassMode?: 'light' | 'dark';
  glassOpacity?: number; // 0-100
  glassBlur?: number;    // 0-40px
  ambientGlass?: boolean;
  ambientGlassOpacity?: number; // 0-100
}

export interface User {
  id: string;
  name: string;
  email: string;
  avatar?: string;
}

export type VelocityLookback = '7' | '30' | '60' | '90' | 'ALL';

// --- GLOBAL SEARCH TYPES ---

export type ChipType = 'METRIC' | 'TIME' | 'RANK' | 'FILTER' | 'TEXT' | 'PLATFORM' | 'CONDITION';

export interface SearchChip {
  type: ChipType;
  value: string; // The internal value, e.g., 'margin_percent'
  label: string; // The display label, e.g., 'Margin %'
}

// --- INVENTORY TOOL TYPES ---
export interface SingleBufferRule {
  id: string;
  operator: string; // 'EQ' | 'LT' | 'GT' | 'LTE' | 'GTE' | 'RANGE'
  trigger: string;
  value: string;
}

export interface BufferRules {
  operatorA?: string;
  triggerA?: string;
  valueA?: string;
  operatorB?: string;
  triggerB?: string;
  valueB?: string;
  rules?: SingleBufferRule[];
}

export interface InventoryTemplate {
  id: string;
  name: string; // Platform name
  headers: string[]; // Full header row from template file
  skuColumn: string; // Mapped header name for SKU
  stockColumn: string; // Mapped header name for Stock
  metaRows?: any[][]; // Store rows appearing BEFORE headers (e.g. Amazon version info)
  bufferRules?: BufferRules; // Save buffer settings per template
  exportFormat?: 'csv' | 'xlsx'; // Output file format preference
}

export interface SearchSession {
  id: string;
  query: string;
  results: any[];
  params: any; 
  explanation?: string;
  timeLabel?: string;
  timestamp: number;
}

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
