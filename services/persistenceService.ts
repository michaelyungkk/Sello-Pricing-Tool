
/**
 * services/persistenceService.ts
 * Handles saving and loading custom report layouts to localStorage.
 */

export interface ReportLayout {
    id: string;
    name: string;
    rows: string[];      // e.g., ['brand', 'category']
    columns: Array<{
        metric: string;  // e.g., 'revenue', 'profit'
        timeRange: string; // e.g., '7d', '30d'
    }>;
    updatedAt: string;
}

const STORAGE_KEY = 'sello_custom_reports';

export const saveReportLayout = (layout: ReportLayout): void => {
    try {
        const existing = getReportLayouts();
        const index = existing.findIndex(l => l.id === layout.id);
        
        if (index >= 0) {
            existing[index] = { ...layout, updatedAt: new Date().toISOString() };
        } else {
            existing.push({ ...layout, updatedAt: new Date().toISOString() });
        }
        
        localStorage.setItem(STORAGE_KEY, JSON.stringify(existing));
    } catch (error) {
        console.error('Failed to save report layout:', error);
    }
};

export const getReportLayouts = (): ReportLayout[] => {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Failed to load report layouts:', error);
        return [];
    }
};

export const deleteReportLayout = (id: string): void => {
    try {
        const existing = getReportLayouts();
        const filtered = existing.filter(l => l.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
    } catch (error) {
        console.error('Failed to delete report layout:', error);
    }
};
