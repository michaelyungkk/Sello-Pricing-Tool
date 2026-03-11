import React from 'react';

type MetricValueProps = {
    value: number;
    type: 'percent' | 'currency' | 'multiplier' | 'number';
    neutral?: boolean;
    size?: 'sm' | 'md' | 'lg';
};

export const MetricValue: React.FC<MetricValueProps> = ({
    value,
    type,
    neutral = false,
    size = 'md'
}) => {
    const formatValue = () => {
        switch (type) {
            case 'percent':
                return `${value > 0 ? '+' : ''}${value.toFixed(1)}%`;
            case 'currency': {
                const isNegative = value < 0;
                const absoluteVal = Math.abs(value).toFixed(2);
                return `${isNegative ? '-' : ''}£${absoluteVal}`;
            }
            case 'multiplier':
                return `${value.toFixed(2)}x`;
            case 'number':
            default:
                return value.toString();
        }
    };

    const getColorClass = () => {
        if (neutral) return 'text-gray-700';
        if (value > 0) return 'text-emerald-600';
        if (value < 0) return 'text-red-500';
        return 'text-gray-400';
    };

    const getSizeClass = () => {
        switch (size) {
            case 'sm': return 'text-sm';
            case 'lg': return 'text-lg';
            case 'md':
            default: return 'text-base';
        }
    };

    return (
        <span className={`font-medium ${getColorClass()}`}>
            {formatValue()}
        </span>
    );
};
