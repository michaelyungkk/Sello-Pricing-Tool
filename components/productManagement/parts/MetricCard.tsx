import React from 'react';

/**
 * MetricCard — Canonical KPI / Summary Card
 * ==========================================
 * THE single source of truth for every KPI / summary card across the app.
 * Design matches the Decision tab AlertCard style (confirmed standard).
 *
 * Props
 * -----
 * title   string       Label (text-sm font-bold text-gray-500)
 * value   ReactNode    Primary value — plain string/number, or a
 *                      <span className="text-emerald-600">…</span> for conditional colour
 * icon    LucideIcon   Icon, shown top-right (no tinted box — plain icon only)
 * color   string       Icon colour token: blue | green | emerald | purple | orange |
 *                      red | amber | gray | indigo  (default: gray)
 * desc?   string       Optional descriptor beneath value (uppercase, tiny)
 */
export const MetricCard = ({ title, value, icon: Icon, color, desc }: {
    title: string;
    value: React.ReactNode;
    icon: React.ElementType;
    color?: string;
    desc?: string;
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

    return (
        <div className="p-3 rounded-xl shadow-sm bg-custom-glass backdrop-blur-custom border border-custom-glass flex flex-col items-start">
            <div className="flex justify-between w-full items-start mb-2">
                <span className="text-sm font-bold text-gray-500">{title}</span>
                <Icon className={`w-5 h-5 ${iconColors[color ?? 'gray'] ?? iconColors.gray}`} />
            </div>
            <div className="text-3xl font-bold text-gray-800 mb-1">{value}</div>
            {desc && <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">{desc}</div>}
        </div>
    );
};
