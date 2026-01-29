
import { CategoryPolicy } from '../types';

const KEY = "sello.categoryPolicies.v1";

export const getCategoryPolicies = (): CategoryPolicy[] => {
  try {
    const stored = localStorage.getItem(KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

export const saveCategoryPolicies = (policies: CategoryPolicy[]) => {
  localStorage.setItem(KEY, JSON.stringify(policies));
};

export const upsertCategoryPolicy = (policy: Omit<CategoryPolicy, 'id' | 'updatedAt'>) => {
  const policies = getCategoryPolicies();
  
  // Normalize strings for comparison (treat undefined/null as empty string)
  const normMain = policy.mainCategory;
  const normSub = policy.subCategory || '';
  const normPlat = policy.platform || '';

  const index = policies.findIndex(p => 
    p.mainCategory === normMain && 
    (p.subCategory || '') === normSub && 
    (p.platform || '') === normPlat
  );
  
  const now = new Date().toISOString();

  if (index >= 0) {
    policies[index] = { ...policies[index], ...policy, updatedAt: now };
  } else {
    policies.push({ 
      ...policy, 
      id: `pol-${Date.now()}-${Math.random().toString(36).substr(2,9)}`, 
      updatedAt: now 
    });
  }
  
  saveCategoryPolicies(policies);
};

export const getPolicyForProduct = (mainCat: string, subCat?: string, platform?: string): CategoryPolicy | undefined => {
  const policies = getCategoryPolicies();
  
  // Priority 1: Exact Match (Main + Sub + Platform)
  if (subCat && platform) {
    const match = policies.find(p => p.mainCategory === mainCat && p.subCategory === subCat && p.platform === platform);
    if (match) return match;
  }

  // Priority 2: Subcategory Global (Main + Sub)
  if (subCat) {
    const match = policies.find(p => p.mainCategory === mainCat && p.subCategory === subCat && !p.platform);
    if (match) return match;
  }

  // Priority 3: Platform Category Global (Main + Platform)
  if (platform) {
    const match = policies.find(p => p.mainCategory === mainCat && !p.subCategory && p.platform === platform);
    if (match) return match;
  }

  // Priority 4: Category Global (Main)
  return policies.find(p => p.mainCategory === mainCat && !p.subCategory && !p.platform);
};
