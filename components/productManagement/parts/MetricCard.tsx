
import React from 'react';

export const MetricCard = ({ title, value, icon: Icon, color, desc }: any) => {
    const colorStyles = {
        blue: 'bg-blue-50 text-blue-700',
        green: 'bg-green-50 text-green-700',
        purple: 'bg-purple-50 text-purple-700',
        orange: 'bg-orange-50 text-orange-700',
        red: 'bg-red-50 text-red-700',
        gray: 'bg-gray-50 text-gray-700'
    };

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-start justify-between">
            <div>
                <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">{title}</span>
                <div className="text-2xl font-bold text-gray-900 mt-1">{value}</div>
                {desc && <div className="text-[10px] text-gray-400 mt-1">{desc}</div>}
            </div>
            <div className={`p-2 rounded-lg ${colorStyles[color as keyof typeof colorStyles] || colorStyles.gray}`}>
                <Icon className="w-5 h-5" />
            </div>
        </div>
    );
};
