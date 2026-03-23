
import React from 'react';
import { StatusCardData } from '../types';

export const DefinitionCard: React.FC<StatusCardData> = ({ status, color, condition, desc }) => {
    const colorClasses = {
        red: 'bg-red-50 border-red-200 text-red-800',
        amber: 'bg-amber-50 border-amber-200 text-amber-800',
        green: 'bg-green-50 border-green-200 text-green-800',
        orange: 'bg-orange-50 border-orange-200 text-orange-800',
    };
    const badgeClasses = {
        red: 'bg-red-200 text-red-900',
        amber: 'bg-amber-200 text-amber-900',
        green: 'bg-green-200 text-green-900',
        orange: 'bg-orange-200 text-orange-900',
    };
    return (
        <div className={`p-4 rounded-lg border ${colorClasses[color]}`}>
            <div className="flex justify-between items-start mb-2">
                <span className="font-bold text-lg">{status}</span>
                <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${badgeClasses[color]}`}>
                    {condition}
                </span>
            </div>
            <p className="text-sm opacity-90 leading-relaxed">
                {desc}
            </p>
        </div>
    );
};
