
import React from 'react';

export const AlertCard = ({ title, count, icon: Icon, color, isActive, onClick, desc }: any) => {
    const colorStyles = {
        red: isActive ? 'bg-red-600 text-white border-red-700' : 'bg-white hover:border-red-300 border-transparent',
        amber: isActive ? 'bg-amber-500 text-white border-amber-600' : 'bg-white hover:border-amber-300 border-transparent',
        purple: isActive ? 'bg-purple-600 text-white border-purple-700' : 'bg-white hover:border-purple-300 border-transparent',
        gray: isActive ? 'bg-gray-700 text-white border-gray-800' : 'bg-white hover:border-gray-300 border-transparent',
    };

    const textStyles = {
        red: isActive ? 'text-red-100' : 'text-red-600',
        amber: isActive ? 'text-amber-100' : 'text-amber-600',
        purple: isActive ? 'text-purple-100' : 'text-purple-600',
        gray: isActive ? 'text-gray-300' : 'text-gray-500',
    };

    return (
        <button 
            onClick={onClick}
            className={`p-4 rounded-xl shadow-sm border transition-all duration-200 flex flex-col items-start text-left ${colorStyles[color as keyof typeof colorStyles]} ${!isActive && 'hover:shadow-md hover:-translate-y-1'}`}
        >
            <div className="flex justify-between w-full items-start mb-2">
                <span className={`font-bold text-sm ${isActive ? 'text-white' : 'text-gray-600'}`}>{title}</span>
                <Icon className={`w-5 h-5 ${textStyles[color as keyof typeof textStyles]}`} />
            </div>
            <div className="text-3xl font-bold mb-1">{count}</div>
            <div className={`text-[10px] font-medium uppercase tracking-wide opacity-80 ${isActive ? 'text-white' : 'text-gray-400'}`}>
                {desc}
            </div>
        </button>
    );
};
