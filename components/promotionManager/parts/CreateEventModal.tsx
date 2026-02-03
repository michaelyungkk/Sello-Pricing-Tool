
import React, { useState } from 'react';
import { X } from 'lucide-react';
import { PromotionEvent } from '../../../types';

export const CreateEventModal = ({ onClose, onCreate, platforms, themeColor }: any) => {
    const [formData, setFormData] = useState<Partial<PromotionEvent>>({
        name: '',
        platform: 'All',
        startDate: '',
        endDate: '',
        submissionDeadline: '',
        remark: '',
        promotionScope: 'SKU',
        baselineMode: 'CA_PRICE',
        baselineManualPrice: 0,
        shopDiscountType: 'PERCENT_OFF',
        shopDiscountValue: 0
    });
    const [errors, setErrors] = useState<Record<string, boolean>>({});

    const handleSubmit = () => {
        const newErrors: Record<string, boolean> = {};
        if (!formData.name) newErrors.name = true;
        if (!formData.startDate) newErrors.startDate = true;
        if (!formData.endDate) newErrors.endDate = true;

        if (Object.keys(newErrors).length > 0) {
            setErrors(newErrors);
            return;
        }

        onCreate({
            id: `promo-${Date.now()}`,
            ...formData,
            status: 'UPCOMING',
            items: []
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-xl p-6 max-h-[90vh] overflow-y-auto">
                <div className="flex justify-between items-center mb-6">
                    <h3 className="text-xl font-bold text-gray-900">Create New Campaign</h3>
                    <button onClick={onClose}><X className="w-5 h-5 text-gray-500 hover:text-gray-700" /></button>
                </div>
                <div className="space-y-5">
                    {/* Basic Info */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="col-span-2">
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Campaign Name <span className="text-red-500">*</span></label>
                            <input
                                type="text"
                                className={`w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 ${errors.name ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                value={formData.name}
                                onChange={e => { setFormData({ ...formData, name: e.target.value }); setErrors({ ...errors, name: false }); }}
                                placeholder="e.g. Winter Clearance"
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Platform <span className="text-red-500">*</span></label>
                            <select
                                className="w-full border rounded-lg px-3 py-2 text-sm border-gray-300 bg-white"
                                value={formData.platform}
                                onChange={e => setFormData({ ...formData, platform: e.target.value })}
                            >
                                <option value="All">All Platforms</option>
                                {(platforms || []).map((p: string) => <option key={p} value={p}>{p}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Promotion Scope</label>
                            <select
                                className="w-full border rounded-lg px-3 py-2 text-sm border-gray-300 bg-white"
                                value={formData.promotionScope}
                                onChange={e => setFormData({ ...formData, promotionScope: e.target.value as any })}
                            >
                                <option value="SKU">SKU (Individual Pricing)</option>
                                <option value="SHOP">SHOP (Global Shop Rule)</option>
                            </select>
                        </div>
                    </div>

                    {/* Baseline Settings */}
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 grid grid-cols-2 gap-4">
                        <div className={formData.baselineMode === 'MANUAL' ? 'col-span-1' : 'col-span-2'}>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Baseline Mode</label>
                            <select
                                className="w-full border rounded-lg px-3 py-2 text-sm border-gray-300 bg-white"
                                value={formData.baselineMode}
                                onChange={e => setFormData({ ...formData, baselineMode: e.target.value as any })}
                            >
                                <option value="CA_PRICE">Channel Advisor Price</option>
                                <option value="PRE_EVENT_AVG_PRICE">Pre-Event Avg Selling Price</option>
                                <option value="MANUAL">Manual Baseline Price</option>
                            </select>
                        </div>
                        {formData.baselineMode === 'MANUAL' && (
                            <div>
                                <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Manual Baseline (£)</label>
                                <input
                                    type="number"
                                    className="w-full border rounded-lg px-3 py-2 text-sm border-gray-300"
                                    value={formData.baselineManualPrice}
                                    onChange={e => setFormData({ ...formData, baselineManualPrice: parseFloat(e.target.value) || 0 })}
                                />
                            </div>
                        )}
                    </div>

                    {/* Shop Discount Settings - ONLY if scope is SHOP */}
                    {formData.promotionScope === 'SHOP' && (
                        <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 animate-in zoom-in-95 duration-200">
                            <h4 className="text-[10px] font-black text-indigo-500 uppercase mb-3 tracking-widest">Global Shop Discount Rule</h4>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Discount Type</label>
                                    <select
                                        className="w-full border rounded-lg px-3 py-2 text-sm border-indigo-200 bg-white"
                                        value={formData.shopDiscountType}
                                        onChange={e => setFormData({ ...formData, shopDiscountType: e.target.value as any })}
                                    >
                                        <option value="PERCENT_OFF">% Off Baseline</option>
                                        <option value="FIXED_OFF">Fixed Amount Off Baseline</option>
                                        <option value="FIXED_PRICE">Set Fixed Promo Price</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">
                                        Value {formData.shopDiscountType === 'PERCENT_OFF' ? '(%)' : '(£)'}
                                    </label>
                                    <input
                                        type="number"
                                        className="w-full border rounded-lg px-3 py-2 text-sm border-indigo-200"
                                        value={formData.shopDiscountValue}
                                        onChange={e => setFormData({ ...formData, shopDiscountValue: parseFloat(e.target.value) || 0 })}
                                    />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Schedule */}
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Start Date <span className="text-red-500">*</span></label>
                            <input
                                type="date"
                                className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.startDate ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                value={formData.startDate}
                                onChange={e => { setFormData({ ...formData, startDate: e.target.value }); setErrors({ ...errors, startDate: false }); }}
                            />
                        </div>
                        <div>
                            <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">End Date <span className="text-red-500">*</span></label>
                            <input
                                type="date"
                                className={`w-full border rounded-lg px-3 py-2 text-sm ${errors.endDate ? 'border-red-500 bg-red-50' : 'border-gray-300'}`}
                                value={formData.endDate}
                                onChange={e => { setFormData({ ...formData, endDate: e.target.value }); setErrors({ ...errors, endDate: false }); }}
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Internal Remark</label>
                        <textarea
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none h-20"
                            value={formData.remark}
                            onChange={e => setFormData({ ...formData, remark: e.target.value })}
                            placeholder="Objectives, requirements, or notes..."
                        />
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-8 pt-6 border-t border-gray-100">
                    <button onClick={onClose} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium">Cancel</button>
                    <button onClick={handleSubmit} className="px-6 py-2 text-white rounded-lg text-sm font-bold shadow-md hover:opacity-90" style={{ backgroundColor: themeColor }}>Create Campaign</button>
                </div>
            </div>
        </div>
    );
};
