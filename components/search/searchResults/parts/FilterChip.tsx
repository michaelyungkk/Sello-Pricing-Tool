
import React, { useState } from 'react';
import { X, Check, MapPin } from 'lucide-react';

interface FilterChipProps {
    filter: any;
    onUpdate: (f: any) => void;
    onDelete: () => void;
    themeColor: string;
}

const FIELD_LABELS: Record<string, string> = {
    stockLevel: 'Stock',
    averageDailySales: 'Velocity',
    daysRemaining: 'Stock Cover',
    margin: 'Margin',
    profit: 'Profit',
    tacos: 'TACoS',
    adsSpend: 'Ad Spend',
    returnRate: 'Return %',
    revenue: 'Revenue',
    velocity: 'Qty',
    velocityChange: 'Trend % (PoP)',
    netPmPercent: 'Net Margin',
    qty: 'Qty',
    name: 'Name',
    platform: 'Platform',
    periodReturnRate: 'Period RR%',
    organicShare: 'Organic (Ad-enabled)',
    agedStockPct: 'Aged Stock %',
    MARGIN_CHANGE_PCT: 'Margin Change (PoP)',
    postcode: 'Postcode Area'
};

export const FilterChip: React.FC<FilterChipProps> = ({ filter, onUpdate, onDelete, themeColor }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editValue, setEditValue] = useState(filter.value);
    const [editOperator, setEditOperator] = useState(filter.operator);

    const handleSave = () => {
        onUpdate({ ...filter, value: editValue, operator: editOperator, label: undefined });
        setIsEditing(false);
    };

    const displayField = FIELD_LABELS[filter.field] || filter.field;
    const displayValue = typeof filter.value === 'number' ? filter.value.toLocaleString() : filter.value;
    
    // Special handling for Postcode Area to reassure users about strict matching
    const logicString = filter.field === 'postcode'
        ? `Area: ${displayValue}`
        : `${displayField} ${filter.operator} ${displayValue}`;
    
    // Explicit override for Trend < 0 to make it clear
    const finalContent = filter.field === 'velocityChange' && filter.value === 0 && filter.operator === 'LT'
        ? <span className="font-mono text-xs font-medium">Negative Trend (Period-over-Period)</span>
        : filter.label 
            ? <><span className="font-medium">{filter.label}:</span> <span className="opacity-80 ml-1 font-mono text-[10px]">{logicString}</span></>
            : <span className="font-mono text-xs font-medium">{logicString}</span>;

    const icon = filter.field === 'postcode' ? <MapPin className="w-3 h-3 text-indigo-500" /> : null;

    if (isEditing) {
        return (
            <div className="flex items-center gap-1 bg-white border border-indigo-300 rounded-lg p-1 shadow-sm animate-in fade-in zoom-in duration-200">
                <span className="text-[10px] font-bold text-gray-500 uppercase px-1">{displayField}</span>
                <select 
                    value={editOperator} 
                    onChange={e => setEditOperator(e.target.value)}
                    className="text-xs border-gray-200 rounded py-0.5 px-1 bg-gray-50"
                >
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&ge;</option>
                    <option value="<=">&le;</option>
                    <option value="=">=</option>
                    <option value="CONTAINS">has</option>
                </select>
                <input 
                    type={typeof filter.value === 'number' ? 'number' : 'text'}
                    value={editValue}
                    onChange={e => setEditValue(typeof filter.value === 'number' ? parseFloat(e.target.value) : e.target.value)}
                    className="w-16 text-xs border-gray-200 rounded py-0.5 px-1"
                    autoFocus
                />
                <button onClick={handleSave} className="p-1 text-green-600 hover:bg-green-50 rounded">
                    <Check className="w-3 h-3" />
                </button>
                <button onClick={() => setIsEditing(false)} className="p-1 text-gray-400 hover:bg-gray-50 rounded">
                    <X className="w-3 h-3" />
                </button>
            </div>
        )
    }

    return (
        <div 
            className="group flex items-center gap-1 px-3 py-1.5 bg-white border border-indigo-100 rounded-full text-xs text-indigo-700 shadow-sm hover:border-indigo-300 transition-all cursor-pointer hover:shadow-md"
            onClick={() => setIsEditing(true)}
            title={filter.field === 'postcode' ? "Strict Area Match (e.g. 'B' matches 'B1' but not 'BN1')" : "Click to edit filter criteria"}
        >
            {icon}
            {finalContent}
            <button 
                onClick={(e) => { e.stopPropagation(); onDelete(); }}
                className="opacity-0 group-hover:opacity-100 p-0.5 hover:bg-indigo-50 rounded-full text-indigo-400 hover:text-red-500 transition-all"
            >
                <X className="w-3 h-3" />
            </button>
        </div>
    );
};
