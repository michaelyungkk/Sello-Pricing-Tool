import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar } from 'lucide-react';

export interface TimeOption {
    key: string;       // e.g. '7D', '14D', '30D', '60D', 'ALL', 'CUSTOM', 'yesterday'
    label: string;     // e.g. '7D', 'All Time', 'Yesterday', 'Custom'
}

export interface ContextBarProps {
    timeOptions: TimeOption[];
    activeWindow: string;
    onWindowChange: (key: string) => void;
    periodLabel: string;
    customStart?: string;
    customEnd?: string;
    onCustomStartChange?: (val: string) => void;
    onCustomEndChange?: (val: string) => void;
    onCustomApply?: () => void;
    children?: React.ReactNode;
}

export const ContextBar: React.FC<ContextBarProps> = ({
    timeOptions,
    activeWindow,
    onWindowChange,
    periodLabel,
    customStart,
    customEnd,
    onCustomStartChange,
    onCustomEndChange,
    onCustomApply,
    children
}) => {
    const [isModalOpen, setIsModalOpen] = useState(false);

    const handleTabClick = (key: string) => {
        if (key === 'CUSTOM') {
            setIsModalOpen(true);
        } else {
            onWindowChange(key);
        }
    };

    const applyCustom = () => {
        if (onCustomApply) onCustomApply();
        onWindowChange('CUSTOM');
        setIsModalOpen(false);
    };

    return (
        <>
            <div className="bg-custom-glass backdrop-blur-custom border border-custom-glass rounded-xl shadow-sm p-3 block md:flex md:flex-row justify-between items-center gap-4">
                {/* LEFT */}
                <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap bg-gray-100 p-1 rounded-lg">
                        {timeOptions.map((opt) => {
                            const isActive = activeWindow === opt.key;
                            return (
                                <button
                                    key={opt.key}
                                    onClick={() => handleTabClick(opt.key)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all flex items-center gap-1.5 ${isActive ? 'bg-white shadow text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                                        }`}
                                >
                                    {opt.key === 'CUSTOM' && <Calendar className="w-3 h-3" />}
                                    {opt.label}
                                </button>
                            );
                        })}
                    </div>

                    <div className="hidden md:block h-6 border-l border-gray-200"></div>

                    <div className="flex flex-col">
                        <span className="text-[10px] font-bold text-gray-400 uppercase leading-none mb-0.5">Analyzing Period</span>
                        <span className="text-xs font-bold text-indigo-600 flex items-center gap-1.5">{periodLabel}</span>
                    </div>
                </div>

                {/* RIGHT */}
                {children && (
                    <div className="flex flex-wrap items-center gap-3 mt-4 md:mt-0">
                        {children}
                    </div>
                )}
            </div>

            {isModalOpen && createPortal(
                <div
                    className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/20 backdrop-blur-sm"
                    onClick={() => setIsModalOpen(false)}
                >
                    <div
                        className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in duration-200 border border-gray-200 p-6"
                        onClick={e => e.stopPropagation()}
                    >
                        <h3 className="text-lg font-bold text-gray-900 mb-4">Select Custom Range</h3>
                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Start Date</label>
                                <input
                                    type="date"
                                    value={customStart || ''}
                                    onChange={e => onCustomStartChange?.(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-1">End Date</label>
                                <input
                                    type="date"
                                    value={customEnd || ''}
                                    onChange={e => onCustomEndChange?.(e.target.value)}
                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                        <div className="mt-6 flex justify-end gap-3">
                            <button
                                onClick={() => setIsModalOpen(false)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={applyCustom}
                                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-md hover:bg-indigo-700"
                            >
                                Apply Range
                            </button>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
};
