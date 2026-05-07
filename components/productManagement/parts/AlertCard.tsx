import React from 'react';

export const AlertCard = ({ title, count, icon: Icon, color, isActive, onClick, desc }: any) => {
    const activeBorderStyles = {
        red: '!border-l-red-500',
        amber: '!border-l-amber-500',
        green: '!border-l-emerald-500',
        purple: '!border-l-purple-500',
        gray: '!border-l-gray-400',
    };

    const activeIconStyles = {
        red: 'text-red-500',
        amber: 'text-amber-500',
        green: 'text-emerald-500',
        purple: 'text-purple-500',
        gray: 'text-gray-500',
    };

    const currentBorderStyle = isActive
        ? activeBorderStyles[color as keyof typeof activeBorderStyles]
        : '!border-l-transparent';

    const currentIconColor = isActive
        ? activeIconStyles[color as keyof typeof activeIconStyles]
        : 'text-gray-400';

    const hoverClass = !isActive ? 'hover:-translate-y-1 hover:shadow-md' : '';

    return (
        <button
            onClick={onClick}
            className={`p-3 rounded-xl shadow-sm transition-all duration-200 flex flex-col items-start text-left w-full bg-custom-glass backdrop-blur-custom border border-custom-glass border-l-4 ${currentBorderStyle} ${hoverClass}`}
        >
            <div className="flex justify-between w-full items-start mb-2">
                <span className="text-sm font-bold text-gray-500">{title}</span>
                <Icon className={`w-5 h-5 ${currentIconColor}`} />
            </div>
            <div className="text-3xl font-bold text-gray-800 mb-1">{count}</div>
            <div className="text-[10px] font-medium uppercase tracking-wide text-gray-500">
                {desc}
            </div>
        </button>
    );
};
