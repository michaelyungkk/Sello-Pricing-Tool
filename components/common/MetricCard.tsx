import React from 'react';
import { MetricDefinitionTooltip } from './MetricDefinitionTooltip';
import { getMetricDefinition, MetricDefinitionKey } from '../../services/metricDefinitions';

/**
 * MetricCard — Canonical KPI / Summary Card
 * ==========================================
 * Single source of truth for all KPI/summary cards across the app.
 * Lives in components/common/ so every page imports from the same place.
 *
 * Props
 * -----
 * title   string       Label (text-sm font-bold text-gray-500)
 * value   ReactNode    Primary value — plain string/number, or JSX for coloured values
 * icon    LucideIcon   Icon shown top-right
 * color   string       Icon colour: blue | green | emerald | purple | orange |
 *                      red | amber | gray | indigo  (default: gray)
 * desc?   string       Optional descriptor beneath value (uppercase, tiny)
 */
export const MetricCard = ({ title, value, icon: Icon, color, desc, metricKey, metricWindowLabel }: {
    title: string;
    value: React.ReactNode;
    icon: React.ElementType;
    color?: string;
    desc?: string;
    metricKey?: MetricDefinitionKey;
    metricWindowLabel?: string;
}) => {
    const iconColors: Record<string, string> = {
        blue:    'text-blue-500',
        green:   'text-green-500',
        emerald: 'text-emerald-600',
        purple:  'text-purple-500',
        orange:  'text-orange-500',
        red:     'text-red-500',
        amber:   'text-amber-500',
        gray:    'text-gray-400',
        indigo:  'text-indigo-500',
    };

    // Scale value font size so long currency strings don't push card height
    const valueStr = typeof value === 'string' ? value : '';
    const valueSizeClass =
        valueStr.length > 10 ? 'text-xl'  :
        valueStr.length > 7  ? 'text-2xl' :
                                'text-3xl';
    const metricDef = metricKey ? getMetricDefinition(metricKey, metricWindowLabel) : null;

    return (
        <div className="p-3 rounded-xl shadow-sm bg-custom-glass backdrop-blur-custom border border-custom-glass flex flex-col items-start">
            <div className="flex justify-between w-full items-start mb-2">
                <span className="text-sm font-bold text-gray-500 inline-flex items-center gap-1">
                    {title}
                    {metricDef && (
                        <MetricDefinitionTooltip
                            title={metricDef.title}
                            formula={metricDef.formula}
                            source={metricDef.source}
                            windowLabel={metricDef.windowLabel}
                        />
                    )}
                </span>
                <Icon className={`w-5 h-5 ${iconColors[color ?? 'gray'] ?? iconColors.gray}`} />
            </div>
            <div className={`${valueSizeClass} font-bold text-gray-800 mb-1`}>{value}</div>
            {desc && <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{desc}</div>}
        </div>
    );
};
