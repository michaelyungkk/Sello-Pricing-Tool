
export interface ChannelData {
  platform: string;
  manager: string;
  velocity: number;
  price?: number; // Specific average selling price for this channel (Gross)
}

export interface FeeBounds {
  min: number;
  max: number;
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  
  // Aggregated Data
  channels: ChannelData[]; // List of where this product is sold and who manages it
  currentPrice: number; // Weighted average price or master price
  oldPrice?: number; // Previous price for tracking changes
  platform?: string; // Optional: Primary platform for analysis context
  
  // Stock & Velocity
  stockLevel: number; // Total stock across warehouses
  averageDailySales: number; // Total velocity across all platforms
  leadTimeDays: number;
  
  // Costs & Fees
  costPrice?: number; // Cost of Goods Sold
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
  
  category: string;
  subcategory?: string; // Added subcategory field
  lastUpdated: string;
}

export interface PriceLog {
  id: string;
  sku: string;
  date: string;
  price: number;
  velocity: number; // Sales per day at this price
  margin: number; // Net % at this price
}

export interface AnalysisResult {
  productId: string;
  recommendedPrice: number;
  percentageChange: number;
  daysRemaining: number;
  status: 'Critical' | 'Warning' | 'Healthy' | 'Overstock';
  reasoning: string;
}

export interface ChartDataPoint {
  day: number;
  projectedStockCurrentPrice: number;
  projectedStockNewPrice: number | null;
  replenishmentThreshold: number;
}

export type Platform = string;

export interface PlatformConfig {
  markup: number;
  commission: number;
  manager: string;
  color?: string; // Hex color code for the platform badge
}

export type PricingRules = Record<Platform, PlatformConfig>;

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
