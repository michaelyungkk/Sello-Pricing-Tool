
import React, { useState } from 'react';
import { PricingRules, Platform } from '../types';
import { X, Save, Percent, Coins } from 'lucide-react';

interface SettingsModalProps {
  currentRules: PricingRules;
  onClose: () => void;
  onSave: (rules: PricingRules) => void;
}

const PLATFORMS: Platform[] = ['Amazon', 'eBay', 'The Range', 'ManoMano', 'Mirikal'];

const SettingsModal: React.FC<SettingsModalProps> = ({ currentRules, onClose, onSave }) => {
  const [rules, setRules] = useState<PricingRules>(JSON.parse(JSON.stringify(currentRules)));

  const handleMarkupChange = (platform: Platform, value: string) => {
    const numValue = parseFloat(value);
    setRules(prev => ({
      ...prev,
      [platform]: { ...prev[platform], markup: isNaN(numValue) ? 0 : numValue }
    }));
  };

  const handleCommissionChange = (platform: Platform, value: string) => {
    const numValue = parseFloat(value);
    setRules(prev => ({
      ...prev,
      [platform]: { ...prev[platform], commission: isNaN(numValue) ? 0 : Math.max(0, numValue) }
    }));
  };

  const handleSave = () => {
    onSave(rules);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Platform Settings</h2>
            <p className="text-sm text-gray-500 mt-1">Configure fees and strategic adjustments per marketplace.</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-full transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 flex-1 overflow-y-auto">
          <div className="bg-indigo-50 border border-indigo-100 rounded-lg p-4 mb-6">
            <p className="text-sm text-indigo-800">
              <strong>Tip:</strong> Accurate commission rates help the AI protect your margins while optimizing for sales velocity.
            </p>
          </div>

          <div className="space-y-4">
            <div className="grid grid-cols-12 gap-4 px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
               <div className="col-span-4">Platform</div>
               <div className="col-span-4 text-center">Commission Fee (%)</div>
               <div className="col-span-4 text-center">Strategy Markup (%)</div>
            </div>

            {PLATFORMS.map((platform) => (
              <div key={platform} className="grid grid-cols-12 gap-4 items-center p-3 bg-gray-50 rounded-lg border border-gray-200">
                
                {/* Platform Name */}
                <div className="col-span-4 flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                     platform === 'Amazon' ? 'bg-yellow-100 text-yellow-800' :
                     platform === 'eBay' ? 'bg-blue-100 text-blue-800' :
                     'bg-gray-200 text-gray-700'
                  }`}>
                    {platform[0]}
                  </div>
                  <span className="font-medium text-gray-700">{platform}</span>
                </div>

                {/* Commission Input */}
                <div className="col-span-4 flex items-center justify-center gap-2">
                   <div className="relative w-24">
                    <input
                      type="number"
                      min="0"
                      step="0.5"
                      value={rules[platform].commission}
                      onChange={(e) => handleCommissionChange(platform, e.target.value)}
                      className="w-full pl-8 pr-3 py-1.5 text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono"
                    />
                    <Coins className="w-3.5 h-3.5 text-gray-400 absolute left-2.5 top-2.5" />
                  </div>
                </div>

                {/* Markup Input */}
                <div className="col-span-4 flex items-center justify-center gap-2">
                  <div className="relative w-24">
                    <input
                      type="number"
                      step="0.5"
                      value={rules[platform].markup}
                      onChange={(e) => handleMarkupChange(platform, e.target.value)}
                      className="w-full pl-3 pr-7 py-1.5 text-right border border-gray-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm font-mono"
                    />
                    <Percent className="w-3 h-3 text-gray-400 absolute right-2 top-2.5" />
                  </div>
                </div>

              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-gray-100 bg-gray-50 flex justify-end gap-3">
          <button 
            onClick={onClose}
            className="px-4 py-2 text-gray-700 font-medium hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-md shadow-indigo-200 transition-all flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            Save Rules
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
