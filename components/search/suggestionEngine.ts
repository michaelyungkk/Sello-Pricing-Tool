
import { ChipSelectionState, Suggestion, SuggestionPriority, MetricId, ConditionId, PlatformId } from './types';
import { METRICS, CONDITIONS, SMART_PAIRINGS, PLATFORM_BOOSTS, SHORTCUTS_LIBRARY, PLATFORMS_LIST, TIME_PRESETS_LIST } from './suggestionConfig';

// Base scores for priorities (Decision-First Ranking)
const PRIORITY_SCORES: Record<SuggestionPriority, number> = {
  RISK: 100,
  DECLINE: 80,
  INVENTORY: 60,
  OPPORTUNITY: 40,
  HYGIENE: 20
};

// Boost constants - Updated for stronger context awareness
const BOOSTS = {
  TEXT_MATCH_EXACT: 3000,
  TEXT_MATCH_START: 2000,
  TEXT_MATCH_PARTIAL: 1000,
  CONTEXT_MATCH: 200, // Sufficient to override base priority differences (e.g. Opportunity vs Risk)
  PLATFORM_MATCH: 100, 
  TIME_MATCH: 50,     
  ALREADY_SELECTED_PENALTY: -9999 
};

/**
 * Main Engine Function
 */
export function getSuggestions(state: ChipSelectionState): {
  metricSuggestions: Suggestion[];
  conditionSuggestions: Suggestion[];
  shortcutSuggestions: Suggestion[];
  platformSuggestions: Suggestion[];
  timeSuggestions: Suggestion[];
} {
  const searchLower = state.searchText.toLowerCase().trim();

  // Helper to score based on text match
  const getTextScore = (label: string, description?: string) => {
      if (!searchLower) return 0;
      const labelLower = label.toLowerCase();
      
      // 1. Exact Match
      if (labelLower === searchLower) return BOOSTS.TEXT_MATCH_EXACT;
      
      // 2. Starts With
      if (labelLower.startsWith(searchLower)) return BOOSTS.TEXT_MATCH_START;
      
      // 3. Contains
      if (labelLower.includes(searchLower)) return BOOSTS.TEXT_MATCH_PARTIAL;
      
      // 4. Description Match (Lower priority)
      if (description && description.toLowerCase().includes(searchLower)) return BOOSTS.TEXT_MATCH_PARTIAL / 2;
      
      return -9999; // Filter out if searching and no match
  };

  // 1. Calculate Metric Suggestions
  const metricSuggestions = METRICS.map((m): Suggestion | null => {
    let score = PRIORITY_SCORES[m.defaultPriority];
    
    // Text Search Logic
    if (searchLower) {
        const matchScore = getTextScore(m.label, m.description);
        if (matchScore === -9999) return null; // Explicit filter
        score += matchScore;
    }

    // Penalize if already selected
    if (state.metrics.includes(m.id)) score += BOOSTS.ALREADY_SELECTED_PENALTY;

    return {
      id: m.id,
      label: m.label,
      kind: "metric" as const,
      priority: m.defaultPriority,
      groupLabel: m.group,
      description: m.description,
      score,
      applies: { metrics: [m.id] }
    };
  })
  .filter((s): s is Suggestion => s !== null && s.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 8); 

  // 2. Calculate Condition Suggestions
  const conditionSuggestions = CONDITIONS.map((c): Suggestion | null => {
    let score = PRIORITY_SCORES[c.defaultPriority];

    // Text Search Logic
    if (searchLower) {
        const matchScore = getTextScore(c.label, c.description);
        if (matchScore === -9999) return null;
        score += matchScore;
    }

    // Boost based on selected Metrics (Smart Pairings)
    state.metrics.forEach(selectedMetric => {
      const pairedConditions = SMART_PAIRINGS[selectedMetric];
      if (pairedConditions && pairedConditions.includes(c.id)) {
        score += BOOSTS.CONTEXT_MATCH;
      }
    });

    // Boost based on selected Platforms
    state.platforms.forEach(selectedPlatform => {
      const platformConditions = PLATFORM_BOOSTS[selectedPlatform];
      if (platformConditions && platformConditions.includes(c.id)) {
        score += BOOSTS.PLATFORM_MATCH;
      }
    });

    // Boost based on Time Preset
    if (state.timePreset === 'LAST_7_DAYS') {
      if (c.defaultPriority === 'DECLINE' || c.id === 'STOCKOUT_RISK') score += BOOSTS.TIME_MATCH;
    }
    if (state.timePreset === 'LAST_30_DAYS' || state.timePreset === 'THIS_MONTH') {
      if (c.defaultPriority === 'INVENTORY' || c.defaultPriority === 'HYGIENE') score += BOOSTS.TIME_MATCH;
    }

    // Penalize if already selected
    if (state.conditions.includes(c.id)) score += BOOSTS.ALREADY_SELECTED_PENALTY;

    return {
      id: c.id,
      label: c.label,
      kind: "condition" as const,
      priority: c.defaultPriority,
      groupLabel: c.group,
      description: c.description,
      score,
      applies: { conditions: [c.id] }
    };
  })
  .filter((s): s is Suggestion => s !== null && s.score > 0)
  .sort((a, b) => b.score - a.score)
  .slice(0, 10); 

  // 3. Calculate Shortcut Suggestions
  const shortcutSuggestions = SHORTCUTS_LIBRARY.map((s, index): Suggestion | null => {
    let score = PRIORITY_SCORES[s.priority];
    
    // Text Search Logic
    if (searchLower) {
        // Shortcuts don't have descriptions in config usually, just label
        if (s.label.toLowerCase().includes(searchLower)) score += BOOSTS.TEXT_MATCH_PARTIAL;
        else return null; 
    }

    // Context Boost: If the shortcut involves a metric that is currently selected
    if (state.metrics.length > 0 && s.applies?.metrics) {
        const hasMetricOverlap = s.applies.metrics.some(m => state.metrics.includes(m));
        if (hasMetricOverlap) score += BOOSTS.CONTEXT_MATCH;
    }

    // Context Boost: If the shortcut matches conditions relevant to selected metrics
    if (state.metrics.length > 0 && s.applies?.conditions) {
        state.metrics.forEach(m => {
            const pairs = SMART_PAIRINGS[m] || [];
            if (s.applies?.conditions?.some(c => pairs.includes(c))) {
                score += BOOSTS.CONTEXT_MATCH;
            }
        });
    }

    // Boost if platform matches logic
    const isAmazon = state.platforms.some(p => p.includes('AMAZON'));
    if (isAmazon && s.label.toLowerCase().includes('ad')) score += BOOSTS.PLATFORM_MATCH;

    score -= index; // Stable sort fallback

    return {
      id: `shortcut-${index}`,
      label: s.label,
      kind: "shortcut" as const,
      priority: s.priority,
      score,
      applies: s.applies
    };
  })
  .filter((s): s is Suggestion => s !== null)
  .sort((a, b) => b.score - a.score)
  .slice(0, 6);

  // 4. Calculate Platform Suggestions
  const platformSuggestions = PLATFORMS_LIST.map((p): Suggestion | null => {
    if (state.platforms.includes(p.id)) return null;
    
    let score = 30;
    if (searchLower) {
        if (p.label.toLowerCase().includes(searchLower)) score += BOOSTS.TEXT_MATCH_PARTIAL;
        else return null;
    }

    return {
        id: p.id,
        label: p.label,
        kind: 'platform' as const,
        priority: 'INVENTORY' as SuggestionPriority,
        score,
        applies: { platforms: [p.id] }
    };
  }).filter((s): s is Suggestion => s !== null).sort((a, b) => b.score - a.score);

  // 5. Calculate Time Suggestions
  const timeSuggestions = TIME_PRESETS_LIST.map((t): Suggestion | null => {
    if (state.timePreset) return null;

    let score = 35;
    if (searchLower) {
        if (t.label.toLowerCase().includes(searchLower)) score += BOOSTS.TEXT_MATCH_PARTIAL;
        else return null;
    }

    return {
        id: t.id,
        label: t.label,
        kind: 'time' as const,
        priority: 'OPPORTUNITY' as SuggestionPriority,
        score,
        applies: { timePreset: t.id }
    };
  }).filter((s): s is Suggestion => s !== null).sort((a, b) => b.score - a.score);

  return {
    metricSuggestions,
    conditionSuggestions,
    shortcutSuggestions,
    platformSuggestions,
    timeSuggestions
  };
}
