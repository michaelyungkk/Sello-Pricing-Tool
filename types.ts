

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
  amount: number;
  platform?: string;
  reason?: string;
  orderId?: string;
}

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

export interface Product {
  id: string;
  name: string;
  sku: string;

  // Aggregated Data
  channels: ChannelData[]; // List of where this product is sold and who manages it
  currentPrice: number; // Weighted average price or master price
  caPrice?: number; // Channel Advisor reference price (used as reference regardless of platform)
  oldPrice?: number; // Previous price for tracking changes
  platform?: string; // Optional: Primary platform for analysis context

  // Stock & Velocity
  stockLevel: number; // Total stock across warehouses (On Hand)
  incomingStock?: number; // Total Incoming Stock (On Water/Booking)
  shipments?: ShipmentDetail[]; // List of active shipments

  averageDailySales: number; // Current Velocity (Week 0)
  previousDailySales?: number; // Previous Velocity (Week 1) for trend analysis
  leadTimeDays: number;

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
  optimalPrice?: number; // Calculated "Sweet Spot" based on history

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
  manager: string;
  color?: string; // Hex color code for the platform badge
  isExcluded?: boolean; // New: If true, exclude from Global Weighted Averages
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
  };
  safety: {
    minMarginPercent: number; // e.g. 10 (Cost * 1.10)
  };
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
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  promoPrice: number;
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