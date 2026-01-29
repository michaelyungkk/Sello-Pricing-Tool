export interface Tab3AlertRules {
  revenueDropPctThreshold: number;
  netAfterAdsNegativeMinAdSpend: number;
  tacosHighThreshold: number;
  marginLowThreshold: number;
}

export const DEFAULT_TAB3_ALERT_RULES: Tab3AlertRules = {
  revenueDropPctThreshold: 20,
  netAfterAdsNegativeMinAdSpend: 500,
  tacosHighThreshold: 20,
  marginLowThreshold: 10
};

export const getTab3AlertRules = (): Tab3AlertRules => {
  try {
    const stored = localStorage.getItem("tab3:alertRules");
    if (!stored) return DEFAULT_TAB3_ALERT_RULES;
    const parsed = JSON.parse(stored);
    
    // Validation
    const isValid = (
      typeof parsed.revenueDropPctThreshold === 'number' && parsed.revenueDropPctThreshold >= 0 &&
      typeof parsed.netAfterAdsNegativeMinAdSpend === 'number' && parsed.netAfterAdsNegativeMinAdSpend >= 0 &&
      typeof parsed.tacosHighThreshold === 'number' && parsed.tacosHighThreshold >= 0 &&
      typeof parsed.marginLowThreshold === 'number' && parsed.marginLowThreshold >= 0
    );

    return isValid ? { ...DEFAULT_TAB3_ALERT_RULES, ...parsed } : DEFAULT_TAB3_ALERT_RULES;
  } catch {
    return DEFAULT_TAB3_ALERT_RULES;
  }
};

export const saveTab3AlertRules = (rules: Tab3AlertRules) => {
  localStorage.setItem("tab3:alertRules", JSON.stringify(rules));
};
