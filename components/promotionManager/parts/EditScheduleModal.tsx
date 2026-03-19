
import React, { useState } from 'react';
import { PromotionEvent } from '../../../types';
import { StatusBadge } from './StatusBadge';

interface EditScheduleModalProps {
    promo: PromotionEvent;
    onClose: () => void;
    onSave: (start: string, end: string, status: 'UPCOMING' | 'ACTIVE' | 'ENDED') => void;
    themeColor: string;
}

export const EditScheduleModal: React.FC<EditScheduleModalProps> = ({ promo, onClose, onSave, themeColor }) => {
    const [startDate, setStartDate] = useState(promo.startDate);
    const [endDate, setEndDate] = useState(promo.endDate);
    
    const deriveStatus = (s: string, e: string): 'UPCOMING' | 'ACTIVE' | 'ENDED' => {
        const today = new Date().toISOString().split('T')[0];
        
        if (s > today) return 'UPCOMING';
        if (e < today) return 'ENDED';
        return 'ACTIVE';
    };

    const newStatus = deriveStatus(startDate, endDate);

    const handleSave = () => {
        if (startDate > endDate) {
            alert("End date must be after start date");
            return;
        }
        onSave(startDate, endDate, newStatus);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6">
                <h3 className="text-lg font-bold text-gray-900 mb-4">Edit Campaign Schedule</h3>
                
                <div className="space-y-4">
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Start Date</label>
                        <input 
                            type="date" 
                            value={startDate} 
                            onChange={(e) => setStartDate(e.target.value)} 
                            className="w-full border rounded-lg px-3 py-2 text-sm border-gray-300 focus:ring-2 focus:ring-theme"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">End Date</label>
                        <input 
                            type="date" 
                            value={endDate} 
                            onChange={(e) => setEndDate(e.target.value)} 
                            className="w-full border rounded-lg px-3 py-2 text-sm border-gray-300 focus:ring-2 focus:ring-theme"
                        />
                    </div>
                    
                    <div className="bg-gray-50 p-3 rounded-lg border border-gray-100 flex justify-between items-center">
                        <span className="text-xs text-gray-500 font-medium">Projected Status:</span>
                        <StatusBadge status={newStatus} />
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button>
                    <button 
                        onClick={handleSave} 
                        className="px-4 py-2 text-white rounded-lg text-sm font-bold shadow-md hover:opacity-90"
                        style={{ backgroundColor: themeColor }}
                    >
                        Save Changes
                    </button>
                </div>
            </div>
        </div>
    );
};
