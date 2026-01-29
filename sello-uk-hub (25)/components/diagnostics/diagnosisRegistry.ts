import { ConditionId } from '../search/types';

/**
 * Canonical Source of Truth for Diagnoses.
 * Uses existing Search ConditionId as the primary key.
 */
export type CanonicalDiagnosisId = ConditionId;

/**
 * Registry of threshold keys for UI binding.
 */
export type ThresholdsByCondition = Partial<Record<CanonicalDiagnosisId, Record<string, number>>>;

export interface DiagnosisMetadata {
  id: CanonicalDiagnosisId;
  label: string;
  shortLabel: string;
  description: string;
  priority: 'High' | 'Medium' | 'Low';
  defaultThresholds?: Record<string, number>;
  contextLabels?: {
    dashboard?: string;
    deepDive?: string;
  };
}

/**
 * Registry defining metadata for all diagnosable conditions.
 */
export const DIAGNOSIS_REGISTRY: Partial<Record<CanonicalDiagnosisId, DiagnosisMetadata>> = {
  STOCKOUT_RISK: {
    id: 'STOCKOUT_RISK',
    label: 'Stockout Risk',
    shortLabel: 'Stockout',
    description: 'Inventory levels are insufficient to cover the lead time. (Threshold configurable)',
    priority: 'High',
    defaultThresholds: { coverDays: 14 }
  },
  OVERSTOCK_RISK: {
    id: 'OVERSTOCK_RISK',
    label: 'Overstock Risk',
    shortLabel: 'Overstock',
    description: 'Inventory levels significantly exceed sales velocity requirements. (Threshold configurable)',
    priority: 'Medium',
    defaultThresholds: { coverDays: 120 }
  },
  HIGH_RETURN_RATE: {
    id: 'HIGH_RETURN_RATE',
    label: 'Elevated Returns',
    shortLabel: 'High Returns',
    description: 'Product return rate exceeds the acceptable threshold configured in settings.',
    priority: 'High',
    defaultThresholds: { returnRatePct: 5 }
  },
  HIGH_AD_DEPENDENCY: {
    id: 'HIGH_AD_DEPENDENCY',
    label: 'High Ad Dependency',
    shortLabel: 'Ad Heavy',
    description: 'A significant portion of sales revenue is consumed by advertising costs based on configured limit.',
    priority: 'Medium',
    defaultThresholds: { tacosPct: 15 }
  },
  VELOCITY_DROP_WOW: {
    id: 'VELOCITY_DROP_WOW',
    label: 'Velocity Drop (PoP)',
    shortLabel: 'Vel. Drop',
    description: 'Significant decline in sales volume compared to the previous period.',
    priority: 'High',
    defaultThresholds: { dropPct: 20 }
  },
  MARGIN_DROP_WOW: {
    id: 'MARGIN_DROP_WOW',
    label: 'Margin Drop (PoP)',
    shortLabel: 'Margin Drop',
    description: 'Profit margins are shrinking compared to the previous period.',
    priority: 'High',
    defaultThresholds: { dropPct: 0 }
  },
  NEGATIVE_LOSS: {
    id: 'NEGATIVE_LOSS',
    label: 'Unprofitable',
    shortLabel: 'Loss',
    description: 'Product is generating a net loss.',
    priority: 'High',
    defaultThresholds: { margin: 0 }
  },
  BELOW_TARGET: {
    id: 'BELOW_TARGET',
    label: 'Below Target',
    shortLabel: 'Low Margin',
    description: 'Performance metrics are below target thresholds configured in settings.',
    priority: 'Medium',
    defaultThresholds: { margin: 10 },
    contextLabels: {
      dashboard: 'Margin Thieves'
    }
  },
  DORMANT_NO_SALES: {
    id: 'DORMANT_NO_SALES',
    label: 'Dead Stock',
    shortLabel: 'Dormant',
    description: 'No sales recorded in the current period despite having significant stock value.',
    priority: 'Medium',
    defaultThresholds: { velocity: 0 }
  }
};

/**
 * Normalizes input strings for robust matching.
 * Trims, lowercases, collapses spaces, and removes punctuation.
 */
const normalizeLabel = (input: string): string => {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ') // Replace multiple spaces with single space
    .replace(/[-/:()]/g, ''); // Remove punctuation characters
};

/**
 * Maps the legacy Dashboard AlertType strings to canonical ConditionIds.
 */
export const mapDashboardAlertTypeToConditions = (alertType: 'margin' | 'velocity' | 'stock' | 'dead' | null): ConditionId[] => {
  if (!alertType) return [];
  switch (alertType) {
    case 'margin':
      // 'Margin Thieves' context
      return ['NEGATIVE_LOSS', 'BELOW_TARGET'];
    case 'velocity':
      // 'Velocity Crashes' context
      return ['VELOCITY_DROP_WOW'];
    case 'stock':
      // 'Stockout Risk' context
      return ['STOCKOUT_RISK'];
    case 'dead':
      // 'Dead Stock' context
      return ['DORMANT_NO_SALES'];
    default:
      return [];
  }
};

/**
 * Maps the legacy SkuDeepDive generated labels to canonical ConditionIds.
 * Uses normalized fuzzy matching to support synonyms.
 * 
 * MISSING CONDITION REPORT:
 * - 'Momentum Spike' (Positive Velocity Change) does not have a direct ConditionId.
 *   Recommendation: Add 'VELOCITY_SPIKE_WOW' or 'POSITIVE_MOMENTUM' to ConditionId type.
 */
export const mapDeepDiveSignalLabelToConditionId = (label: string): ConditionId | null => {
  const normalized = normalizeLabel(label);
  
  const lookup: Record<string, ConditionId> = {
    'stockout risk': 'STOCKOUT_RISK',
    'stockout': 'STOCKOUT_RISK',
    
    'overstock': 'OVERSTOCK_RISK',
    'overstock risk': 'OVERSTOCK_RISK',
    
    'elevated returns': 'HIGH_RETURN_RATE',
    'high returns': 'HIGH_RETURN_RATE',
    'return rate': 'HIGH_RETURN_RATE',
    
    'high ad dependency': 'HIGH_AD_DEPENDENCY',
    'ad dependency': 'HIGH_AD_DEPENDENCY',
    'ad heavy': 'HIGH_AD_DEPENDENCY',
    
    'margin compression': 'BELOW_TARGET', // Corrected semantic mapping
    'margin drop': 'MARGIN_DROP_WOW',
    
    'velocity drop': 'VELOCITY_DROP_WOW',
    'volume drop': 'VELOCITY_DROP_WOW',
    
    'dead stock': 'DORMANT_NO_SALES',
    'dormant': 'DORMANT_NO_SALES'
  };

  return lookup[normalized] || null;
};

/**
 * Helper to retrieve metadata for a given diagnosis ID.
 * Returns a fallback object if ID is missing from registry to ensure runtime safety.
 */
export const getDiagnosisMeta = (id: ConditionId): DiagnosisMetadata => {
  const meta = DIAGNOSIS_REGISTRY[id];
  if (meta) return meta;

  return {
    id,
    label: id.replace(/_/g, ' '),
    shortLabel: id,
    description: 'Diagnostic condition detected.',
    priority: 'Medium'
  };
};