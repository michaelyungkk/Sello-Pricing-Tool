
import React from 'react';

export const PromoKpiCard = ({ title, value, subValue, icon: Icon, color, tooltip }: any) => {
    const colorStyles = {
        gray: 'bg-gray-50 text-gray-600',
        green: 'bg-green-50 text-green-600',
        blue: 'bg-blue-50 text-blue-600',
        indigo: 'bg-indigo-50 text-indigo-600',
        red: 'bg-red-50 text-red-600',
    };

    return (
        <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative group">
            <div className="flex justify-between items-start mb-2">
                <span className="text-[10px] font-bold text-gray-400 uppercase">{title}</span>
                <div className={`p-1.5 rounded-lg ${colorStyles[color as keyof typeof colorStyles] || colorStyles.gray}`}>
                    <Icon className="w-4 h-4" />
                </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{value}</div>
            {subValue && <div className="text-[10px] text-gray-500 mt-1">{subValue}</div>}
            {tooltip && (
                 <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-48 p-2 bg-gray-900 text-white text-[10px] rounded shadow-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 text-center">
                    {tooltip}
                 </div>
            )}
        </div>
    );
};
