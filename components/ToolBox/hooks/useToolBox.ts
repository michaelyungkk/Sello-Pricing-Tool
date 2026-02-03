
import { useState } from 'react';

export type ToolTab = 'PROMO' | 'SYNC';

export const useToolBox = () => {
    const [activeTab, setActiveTab] = useState<ToolTab>('PROMO');
    return {
        activeTab,
        setActiveTab
    };
};
