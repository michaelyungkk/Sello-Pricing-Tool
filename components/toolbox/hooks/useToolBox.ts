
import { useState } from 'react';

export type ToolTab = 'PROMO' | 'SYNC' | 'ERP' | 'PRICE' | 'SKU';

export const useToolBox = () => {
    const [activeTab, setActiveTab] = useState<ToolTab>('PROMO');
    return {
        activeTab,
        setActiveTab
    };
};
