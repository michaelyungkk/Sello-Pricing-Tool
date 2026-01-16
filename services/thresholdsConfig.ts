export interface ThresholdConfig {
  marginBelowTargetPct: number;
  velocityCrashPct: number;
  velocityDropPct: number;
  stockoutRunwayMultiplier: number;
  overstockDays: number;
  deadStockMinValueGBP: number;
  returnRatePct: number;
  highAdDependencyPct: number;
  currentSeason?: 'Summer' | 'Autumn' | 'Winter' | 'Spring' | 'None';
}

export const DEFAULT_THRESHOLDS: ThresholdConfig = {
  marginBelowTargetPct: 10,
  velocityCrashPct: 30,
  velocityDropPct: 20,
  stockoutRunwayMultiplier: 1,
  overstockDays: 120,
  deadStockMinValueGBP: 200,
  returnRatePct: 5,
  highAdDependencyPct: 15,
  currentSeason: 'None'
};

const KEY = "ukhub.alertDiagnosticThresholds.v1";

export const getThresholdConfig = (): ThresholdConfig => {
  try {
    const stored = localStorage.getItem(KEY);
    if (!stored) return DEFAULT_THRESHOLDS;
    return { ...DEFAULT_THRESHOLDS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_THRESHOLDS;
  }
};

export const saveThresholdConfig = (config: ThresholdConfig) => {
  localStorage.setItem(KEY, JSON.stringify(config));
};

export const resetThresholdConfig = (): ThresholdConfig => {
  localStorage.removeItem(KEY);
  return DEFAULT_THRESHOLDS;
};