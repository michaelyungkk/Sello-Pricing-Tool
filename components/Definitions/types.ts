
import { ReactNode } from 'react';
import { LucideIcon } from 'lucide-react';

export type DefinitionTabId = 'operational' | 'financial' | 'manual';

export interface StatusCardData {
    status: string;
    color: 'red' | 'amber' | 'green' | 'orange';
    condition: string;
    desc: string;
}

export interface ManualSectionData {
    id: string;
    title: string;
    desc: string;
    icon: LucideIcon;
    color: string; // e.g. "indigo", "amber" - used for bg-color-50 and text-color-600
    content: ReactNode;
}
