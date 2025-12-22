
import { Product, PriceLog, PromotionEvent, PricingRules, LogisticsRule, StrategyConfig } from './types';

export const DEFAULT_PRICING_RULES: PricingRules = {
  'Amazon(UK) FBA': { markup: 0, commission: 15.0, manager: 'Bella Qin', color: '#FF9900' },
  'Amazon(UK) FBM': { markup: 0, commission: 15.0, manager: 'Bella Qin', color: '#E68A00' },
  'eBay': { markup: 0, commission: 10.0, manager: 'Sophie Nie', color: '#E53238' },
  'The Range': { markup: 0, commission: 12.0, manager: 'Queenie Wong', color: '#2C3E50' },
  'ManoMano': { markup: 0, commission: 18.0, manager: 'Queenie Wong', color: '#00D09C' },
  'Wayfair': { markup: 0, commission: 15.0, manager: 'Queenie Wong', color: '#7F187F' },
  'Onbuy': { markup: 0, commission: 9.0, manager: 'Queenie Wong', color: '#3B82F6' },
  'Groupon(UK)': { markup: 0, commission: 15.0, manager: 'Queenie Wong', color: '#53A318' },
  'Temu(UK)': { markup: 0, commission: 5.0, manager: 'Elaine Wang', color: '#FB7701' },
  'Tesco': { markup: 0, commission: 10.0, manager: 'Queenie Wong', color: '#00539F' },
  'Debenhams': { markup: 0, commission: 26.0, manager: 'Queenie Wong', color: '#1B4D3E' }
};

export const DEFAULT_LOGISTICS_RULES: LogisticsRule[] = [
    { id: 'evri', name: 'EVRI', carrier: 'Evri', price: 0 },
    { id: 'its-dx-z', name: 'ITS-DX-Z', carrier: 'DX', price: 0 },
    { id: 'its-dx', name: 'ITS-DX', carrier: 'DX', price: 0 },
    { id: 'its-rmt48', name: 'ITS-RMT48', carrier: 'Royal Mail', price: 0 },
    { id: 'xdp-econ', name: 'XDP-ECON', carrier: 'XDP', price: 0 },
    { id: 'xdp-econ-z', name: 'XDP-ECON-Z', carrier: 'XDP', price: 0 },
    { id: 'yodel-48-mini-ni', name: 'YODEL-48-MINI-NI', carrier: 'Yodel', price: 0 },
    { id: 'fba', name: 'FBA', carrier: 'Amazon', price: 0 },
    { id: 'na', name: 'NA', carrier: 'Other', price: 0 },
    { id: 'yodel-48-mini-uk', name: 'YODEL-48-MINI-UK', carrier: 'Yodel', price: 0 },
    { id: 'its-rmt48-z', name: 'ITS-RMT48-Z', carrier: 'Royal Mail', price: 0 },
    { id: 'its', name: 'ITS', carrier: 'ITS', price: 0 },
    { id: 'its-dpd', name: 'ITS-DPD', carrier: 'DPD', price: 0 },
    { id: 'pickup', name: 'PICKUP', carrier: 'Collection', price: 0 },
    { id: 'xdp-2man', name: 'XDP-2MAN', carrier: 'XDP', price: 0 },
    { id: 'yodel-48-lrg-uk', name: 'YODEL-48-LRG-UK', carrier: 'Yodel', price: 0 },
    { id: 'yodel-48-lrg-uk-z', name: 'YODEL-48-LRG-UK-Z', carrier: 'Yodel', price: 0 },
    { id: 'yodel-48-med-ni', name: 'YODEL-48-MED-NI', carrier: 'Yodel', price: 0 },
    { id: 'yodel-48-med-uk', name: 'YODEL-48-MED-UK', carrier: 'Yodel', price: 0 },
];

export const DEFAULT_STRATEGY_RULES: StrategyConfig = {
    increase: {
        minRunwayWeeks: 6,
        minStock: 0,
        minVelocity7Days: 2,
        adjustmentPercent: 5,
        adjustmentFixed: 1
    },
    decrease: {
        highStockWeeks: 48,
        medStockWeeks: 24,
        minMarginPercent: 25,
        adjustmentPercent: 5,
        includeNewProducts: false
    },
    safety: {
        minMarginPercent: 10
    }
};

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'sku-001',
    name: 'Skylos Dog Kennels (Large)',
    sku: 'PT1337-75-UK',
    channels: [
      { platform: 'eBay', manager: 'Sophie Nie', velocity: 4.0 },
      { platform: 'Debenhams', manager: 'Queenie Wong', velocity: 1.2 }
    ],
    currentPrice: 39.15,
    costPrice: 22.50,
    stockLevel: 42,
    averageDailySales: 5.2,
    leadTimeDays: 25,
    status: 'Critical',
    recommendation: 'Increase Price',
    daysRemaining: 8,
    category: 'Pet Supplies',
    subcategory: 'Kennels',
    lastUpdated: '2025-12-09'
  },
  {
    id: 'sku-002',
    name: 'Skylos Pet Bed (Grey 60cm)',
    sku: 'PT1298-GY-60-UK',
    channels: [
      { platform: 'eBay', manager: 'Sophie Nie', velocity: 6.5 },
      { platform: 'Amazon(UK) FBA', manager: 'Bella Qin', velocity: 4.0 },
      { platform: 'Temu(UK)', manager: 'Elaine Wang', velocity: 8.0 }
    ],
    currentPrice: 11.65,
    costPrice: 4.50,
    stockLevel: 450,
    averageDailySales: 18.5,
    leadTimeDays: 15,
    status: 'Healthy',
    recommendation: 'Maintain',
    daysRemaining: 24,
    category: 'Pet Supplies',
    subcategory: 'Bedding',
    lastUpdated: '2025-12-09'
  },
  {
    id: 'sku-003',
    name: 'Carriers & Totes (Grey)',
    sku: 'PT1343-GY-UK',
    channels: [
      { platform: 'Amazon(UK) FBM', manager: 'Bella Qin', velocity: 5.5 },
      { platform: 'Temu(UK)', manager: 'Elaine Wang', velocity: 9.0 },
      { platform: 'Debenhams', manager: 'Queenie Wong', velocity: 2.1 }
    ],
    currentPrice: 18.32,
    costPrice: 9.00,
    stockLevel: 1200,
    averageDailySales: 16.6,
    leadTimeDays: 30,
    status: 'Overstock',
    recommendation: 'Decrease Price',
    daysRemaining: 72,
    category: 'Pet Supplies',
    subcategory: 'Travel',
    lastUpdated: '2025-12-09'
  },
  {
    id: 'sku-004',
    name: 'Lavio Memory Foam Pillow',
    sku: 'PILO1014-GY-UK',
    channels: [
      { platform: 'Amazon(UK) FBA', manager: 'Bella Qin', velocity: 3.2 },
      { platform: 'Debenhams', manager: 'Queenie Wong', velocity: 1.5 }
    ],
    currentPrice: 29.02,
    costPrice: 12.00,
    stockLevel: 210,
    averageDailySales: 4.7,
    leadTimeDays: 14,
    status: 'Healthy',
    recommendation: 'Maintain',
    daysRemaining: 44,
    category: 'Bedding',
    subcategory: 'Pillows',
    lastUpdated: '2025-12-09'
  },
  {
    id: 'sku-005',
    name: 'Portable Fridge 5L',
    sku: 'FRDG1007-5L-UK',
    channels: [
      { platform: 'eBay', manager: 'Sophie Nie', velocity: 3.0 },
      { platform: 'Wayfair', manager: 'Queenie Wong', velocity: 1.2 },
      { platform: 'The Range', manager: 'Queenie Wong', velocity: 0.8 }
    ],
    currentPrice: 24.99,
    costPrice: 15.00,
    stockLevel: 18,
    averageDailySales: 5.0,
    leadTimeDays: 20,
    status: 'Critical',
    recommendation: 'Increase Price',
    daysRemaining: 3,
    category: 'Home Appliances',
    subcategory: 'Kitchen',
    lastUpdated: '2025-12-09'
  }
];

export const MOCK_CHART_DATA = [
  { name: 'Week 1', sales: 400 },
  { name: 'Week 2', sales: 300 },
  { name: 'Week 3', sales: 200 },
  { name: 'Week 4', sales: 278 },
  { name: 'Week 5', sales: 189 },
];

export const MOCK_PRICE_HISTORY: PriceLog[] = [
    // SKU 001: Dog Kennels (Current: 39.15, Vel: 5.2, Profit/Unit approx 10) -> Daily ~52
    { id: 'h1', sku: 'PT1337-75-UK', date: '2024-11-20', price: 39.15, velocity: 5.2, margin: 35 },
    { id: 'h2', sku: 'PT1337-75-UK', date: '2024-11-13', price: 42.50, velocity: 3.1, margin: 40 }, // High price, low vol -> Daily Profit lower
    { id: 'h3', sku: 'PT1337-75-UK', date: '2024-11-06', price: 36.00, velocity: 7.8, margin: 25 }, // Low price, high vol -> Daily Profit might be higher? 36*0.25=9 * 7.8 = 70. Winner.
    
    // SKU 002: Pet Bed (Current: 11.65, Vel: 18.5)
    { id: 'h4', sku: 'PT1298-GY-60-UK', date: '2024-11-20', price: 11.65, velocity: 18.5, margin: 45 },
    { id: 'h5', sku: 'PT1298-GY-60-UK', date: '2024-11-13', price: 13.00, velocity: 12.0, margin: 50 },
    { id: 'h6', sku: 'PT1298-GY-60-UK', date: '2024-11-06', price: 10.50, velocity: 22.0, margin: 35 },

    // SKU 003: Carriers (Overstock, Needs lower price)
    { id: 'h7', sku: 'PT1343-GY-UK', date: '2024-11-20', price: 18.32, velocity: 16.6, margin: 40 },
    { id: 'h8', sku: 'PT1343-GY-UK', date: '2024-11-13', price: 21.00, velocity: 8.0, margin: 48 },
    { id: 'h9', sku: 'PT1343-GY-UK', date: '2024-11-06', price: 17.00, velocity: 20.0, margin: 35 },

    // SKU 005: Fridge (Critical, Needs higher price)
    { id: 'h10', sku: 'FRDG1007-5L-UK', date: '2024-11-20', price: 24.99, velocity: 5.0, margin: 30 },
    { id: 'h11', sku: 'FRDG1007-5L-UK', date: '2024-11-13', price: 28.00, velocity: 3.0, margin: 38 },
    { id: 'h12', sku: 'FRDG1007-5L-UK', date: '2024-11-06', price: 22.00, velocity: 8.0, margin: 20 },
];

export const MOCK_PROMOTIONS: PromotionEvent[] = [
    {
        id: 'promo-001',
        platform: 'The Range',
        name: 'BFCM Phase 2 & 3',
        startDate: '2025-11-13',
        endDate: '2025-12-10',
        submissionDeadline: '2025-11-07',
        status: 'ACTIVE',
        items: []
    },
    {
        id: 'promo-002',
        platform: 'Wayfair',
        name: 'UK/IE Deal of the Day - December 9 2025',
        startDate: '2025-12-09',
        endDate: '2025-12-10',
        submissionDeadline: '2025-12-03',
        status: 'ACTIVE',
        items: []
    },
    {
        id: 'promo-003',
        platform: 'Wayfair',
        name: 'UK/IE Deal of the Day - December 10 2025',
        startDate: '2025-12-10',
        endDate: '2025-12-11',
        submissionDeadline: '2025-12-04',
        status: 'UPCOMING',
        items: []
    },
    {
        id: 'promo-004',
        platform: 'The Range',
        name: 'Winter Sale 2025',
        startDate: '2025-12-11',
        endDate: '2026-01-28',
        submissionDeadline: '2025-12-05',
        status: 'UPCOMING',
        items: []
    },
    {
        id: 'promo-005',
        platform: 'Wayfair',
        name: 'UK/IE Deal of the Day - December 11 2025',
        startDate: '2025-12-11',
        endDate: '2025-12-12',
        submissionDeadline: '2025-12-04',
        status: 'UPCOMING',
        items: []
    },
    {
        id: 'promo-006',
        platform: 'The Range',
        name: 'GREAT BIG FURNITURE EVENT! - WEEK 8',
        startDate: '2025-12-11',
        endDate: '2025-12-24',
        submissionDeadline: '2025-12-08',
        status: 'UPCOMING',
        items: []
    },
    {
        id: 'promo-007',
        platform: 'Debenhams',
        name: 'Christmas & Boxing Day Offer',
        startDate: '2025-12-11',
        endDate: '2026-01-06',
        status: 'UPCOMING',
        items: []
    },
    {
        id: 'promo-008',
        platform: 'Wayfair',
        name: 'UK/IE Deal of the Day - December 12 2025',
        startDate: '2025-12-12',
        endDate: '2025-12-13',
        submissionDeadline: '2025-12-04',
        status: 'UPCOMING',
        items: []
    },
    {
        id: 'promo-009',
        platform: 'Tesco',
        name: 'January sale campaign',
        startDate: '2025-12-23',
        endDate: '2026-02-03',
        submissionDeadline: '2025-12-03',
        status: 'UPCOMING',
        items: []
    },
    {
        id: 'promo-010',
        platform: 'The Range',
        name: 'Healthy Living Event 2025',
        startDate: '2025-12-24',
        endDate: '2026-01-28',
        submissionDeadline: '2025-12-10',
        status: 'UPCOMING',
        items: []
    },
    {
        id: 'promo-011',
        platform: 'The Range',
        name: 'Cleaning Essentials',
        startDate: '2025-12-25',
        endDate: '2026-01-28',
        submissionDeadline: '2025-12-15',
        status: 'UPCOMING',
        items: []
    },
    {
        id: 'promo-012',
        platform: 'ManoMano',
        name: 'Winter Sales',
        startDate: '2026-01-07',
        endDate: '2026-02-03',
        submissionDeadline: '2026-01-07',
        status: 'UPCOMING',
        items: []
    },
    {
        id: 'promo-013',
        platform: 'Tesco',
        name: "Valentine's Day",
        startDate: '2026-01-22',
        endDate: '2026-02-14',
        submissionDeadline: '2025-12-08',
        status: 'UPCOMING',
        items: []
    },
    {
        id: 'promo-014',
        platform: 'Wayfair',
        name: 'UK/IE Winter Clearance 2026',
        startDate: '2026-01-26',
        endDate: '2026-02-03',
        submissionDeadline: '2025-12-12',
        status: 'UPCOMING',
        items: []
    },
    {
        id: 'promo-015',
        platform: 'Wayfair',
        name: 'UK/IE Weekend Sale - February 2026',
        startDate: '2026-02-12',
        endDate: '2026-02-17',
        submissionDeadline: '2025-12-12',
        status: 'UPCOMING',
        items: []
    },
    {
        id: 'promo-016',
        platform: 'Wayfair',
        name: 'UK/IE Boxing Day Sale (UK) / Winter Sale (IE) 2025',
        startDate: '2025-12-23',
        endDate: '2025-12-31',
        submissionDeadline: '2025-12-12',
        status: 'UPCOMING',
        items: []
    }
];
