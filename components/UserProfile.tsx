
import React, { useState, useRef, useEffect } from 'react';
import { UserProfile as UserProfileType } from '../types';
import { User, Settings, Palette, Image as ImageIcon, X, Check, Upload, Wand2, Sun, Moon, Type, PaintBucket, LayoutTemplate } from 'lucide-react';

interface UserProfileProps {
  profile: UserProfileType;
  onUpdate: (profile: UserProfileType) => void;
}

const GRADIENTS = [
    'linear-gradient(to right, #ff7e5f, #feb47b)', // Sunset
    'linear-gradient(120deg, #a1c4fd 0%, #c2e9fb 100%)', // Winter Neva
    'linear-gradient(to top, #cfd9df 0%, #e2ebf0 100%)', // Cloud
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)', // Plum Plate
    'linear-gradient(to right, #43e97b 0%, #38f9d7 100%)', // Green
    'linear-gradient(to top, #30cfd0 0%, #330867 100%)', // Deep Blue
    'linear-gradient(to right, #b8cbb8 0%, #b8cbb8 0%, #b465da 0%, #cf6cc9 33%, #ee609c 66%, #ee609c 100%)', // Unicorn
    'linear-gradient(to right, #8360c3, #2ebf91)' // Kye Meh
];

const UserProfile: React.FC<UserProfileProps> = ({ profile, onUpdate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [tempProfile, setTempProfile] = useState(profile);
  const [activeTab, setActiveTab] = useState<'image' | 'solid' | 'gradient'>('image');
  
  // Custom Gradient State
  const [customGradientColors, setCustomGradientColors] = useState(['#6366f1', '#ec4899']);
  const [customGradientAngle, setCustomGradientAngle] = useState('to right');
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      setTempProfile(profile);
      
      // Determine active tab based on current profile
      if (profile.backgroundImage) {
          if (profile.backgroundImage.startsWith('linear-gradient') || profile.backgroundImage.startsWith('radial-gradient')) {
              setActiveTab('gradient');
          } else {
              setActiveTab('image');
          }
      } else {
          setActiveTab('solid');
      }
  }, [profile]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
      // If auto-detect is valid (image URL exists)
      const isUrl = profile.backgroundImage && (profile.backgroundImage.startsWith('http') || profile.backgroundImage.startsWith('data:') || profile.backgroundImage.startsWith('/'));
      if (isUrl && !profile.textColor) {
          analyzeImageBrightness(profile.backgroundImage, true);
      }
  }, []);

  const handleSave = () => {
    onUpdate(tempProfile);
    setIsOpen(false);
  };

  const analyzeImageBrightness = (imageSrc: string, autoSave: boolean = false) => {
      if (!imageSrc.startsWith('http') && !imageSrc.startsWith('data:')) return;

      const img = new Image();
      img.src = imageSrc;
      img.crossOrigin = "Anonymous"; 
      
      img.onload = () => {
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          canvas.width = 1;
          canvas.height = 1;
          ctx.drawImage(img, 0, 0, 1, 1);
          
          try {
            const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
            const brightness = (r * 299 + g * 587 + b * 114) / 1000;
            const optimalTextColor = brightness < 128 ? '#ffffff' : '#111827';
            
            if (autoSave) {
                onUpdate({ ...profile, textColor: optimalTextColor });
            } else {
                setTempProfile(prev => ({
                    ...prev,
                    textColor: optimalTextColor
                }));
            }
          } catch (e) {
              console.warn("Could not analyze image due to CORS or format", e);
          }
      };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              const result = reader.result as string;
              setTempProfile(prev => ({ ...prev, backgroundImage: result }));
              analyzeImageBrightness(result, false);
          };
          reader.readAsDataURL(file);
      }
  };

  const handleSolidColorChange = (color: string) => {
      setTempProfile(prev => ({
          ...prev,
          backgroundColor: color,
          backgroundImage: '' // Clear image/gradient
      }));
  };

  const handleGradientSelect = (gradient: string) => {
      setTempProfile(prev => ({
          ...prev,
          backgroundImage: gradient
      }));
  };

  const handleCustomColorChange = (index: number, val: string) => {
      const newColors = [...customGradientColors];
      newColors[index] = val;
      setCustomGradientColors(newColors);
  };

  const applyCustomGradient = () => {
      const grad = `linear-gradient(${customGradientAngle}, ${customGradientColors[0]}, ${customGradientColors[1]})`;
      setTempProfile(prev => ({ ...prev, backgroundImage: grad }));
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 pl-3 pr-2 bg-white/80 backdrop-blur-sm border border-gray-200 rounded-full shadow-sm hover:shadow-md transition-all group"
      >
        <div className="flex flex-col items-end mr-1">
             <span className="text-xs font-bold text-gray-700 leading-none">
                {profile.name || 'Guest User'}
             </span>
             <span className="text-[10px] text-gray-500">Settings</span>
        </div>
        <div 
            className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-inner"
            style={{ backgroundColor: profile.themeColor }}
        >
             <User className="w-4 h-4" />
        </div>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-xl shadow-xl border border-gray-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                <h3 className="font-bold text-gray-900">Personalize</h3>
                <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4"/></button>
            </div>
            
            <div className="p-4 space-y-5">
                {/* Name Input */}
                <div className="space-y-1">
                    <label className="text-xs font-semibold text-gray-500 uppercase">Display Name</label>
                    <input 
                        type="text" 
                        value={tempProfile.name}
                        onChange={(e) => setTempProfile({...tempProfile, name: e.target.value})}
                        placeholder="Enter your name"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500"
                    />
                </div>

                {/* Theme Color (Color Wheel) */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                        <Palette className="w-3 h-3" /> Theme Color
                    </label>
                    <div className="flex items-center gap-3">
                        <div className="relative w-10 h-10 rounded-full overflow-hidden shadow-sm border border-gray-200 hover:scale-105 transition-transform">
                            <input 
                                type="color" 
                                value={tempProfile.themeColor}
                                onChange={(e) => setTempProfile({...tempProfile, themeColor: e.target.value})}
                                className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
                            />
                        </div>
                        <span className="text-sm font-mono text-gray-600 uppercase bg-gray-50 px-2 py-1 rounded border border-gray-100">
                            {tempProfile.themeColor}
                        </span>
                        <span className="text-xs text-gray-400">Click circle to pick</span>
                    </div>
                </div>

                {/* Background Selector */}
                <div className="space-y-2">
                    <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                        <ImageIcon className="w-3 h-3" /> Background
                    </label>
                    
                    {/* Tabs */}
                    <div className="flex bg-gray-100 p-1 rounded-lg mb-2">
                        {[
                            { id: 'image', icon: Upload, label: 'Image' },
                            { id: 'solid', icon: PaintBucket, label: 'Color' },
                            { id: 'gradient', icon: LayoutTemplate, label: 'Gradient' }
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id as any)}
                                className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold rounded-md transition-all ${
                                    activeTab === tab.id 
                                    ? 'bg-white text-gray-900 shadow-sm' 
                                    : 'text-gray-500 hover:text-gray-700'
                                }`}
                            >
                                <tab.icon className="w-3 h-3" />
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    {/* Content based on Tab */}
                    {activeTab === 'image' && (
                        <div className="space-y-2">
                            <div className="flex gap-2">
                                <button 
                                    onClick={() => fileInputRef.current?.click()}
                                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-xs font-medium text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-2"
                                >
                                    <Upload className="w-3 h-3" />
                                    Upload Photo
                                </button>
                                <input 
                                    ref={fileInputRef}
                                    type="file" 
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleFileUpload}
                                />
                            </div>
                            {tempProfile.backgroundImage && !tempProfile.backgroundImage.startsWith('linear-gradient') && (
                                <div className="text-[10px] text-green-600 flex items-center gap-1">
                                    <Check className="w-3 h-3" /> Custom Image Active
                                </div>
                            )}
                        </div>
                    )}

                    {activeTab === 'solid' && (
                        <div className="flex items-center gap-3 p-2 border border-gray-100 rounded-lg">
                             <div className="relative w-10 h-10 rounded-full overflow-hidden shadow-sm border border-gray-200">
                                <input 
                                    type="color" 
                                    value={tempProfile.backgroundColor}
                                    onChange={(e) => handleSolidColorChange(e.target.value)}
                                    className="absolute -top-2 -left-2 w-16 h-16 cursor-pointer"
                                />
                            </div>
                            <div className="flex flex-col">
                                <span className="text-xs font-medium text-gray-700">Solid Background</span>
                                <span className="text-[10px] text-gray-400">Pick a color</span>
                            </div>
                        </div>
                    )}

                    {activeTab === 'gradient' && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-4 gap-2">
                                {GRADIENTS.map((grad, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleGradientSelect(grad)}
                                        className={`w-full h-8 rounded-md shadow-sm border border-gray-200 transition-transform hover:scale-105 ${tempProfile.backgroundImage === grad ? 'ring-2 ring-offset-1 ring-gray-400' : ''}`}
                                        style={{ background: grad }}
                                        title={`Preset ${i+1}`}
                                    />
                                ))}
                            </div>

                            {/* Custom Gradient Builder */}
                            <div className="pt-3 border-t border-gray-100">
                                <div className="flex justify-between items-center mb-2">
                                    <label className="text-[10px] font-bold text-gray-500 uppercase">Custom Gradient</label>
                                </div>
                                <div className="flex items-center gap-2 mb-2">
                                    {/* Color 1 */}
                                    <div className="flex-1 relative h-8 rounded-lg overflow-hidden border border-gray-200 shadow-sm group">
                                         <input 
                                            type="color" 
                                            value={customGradientColors[0]}
                                            onChange={(e) => handleCustomColorChange(0, e.target.value)}
                                            className="absolute -top-4 -left-4 w-24 h-24 cursor-pointer"
                                         />
                                    </div>
                                    
                                    {/* Direction */}
                                    <select 
                                        value={customGradientAngle}
                                        onChange={(e) => setCustomGradientAngle(e.target.value)}
                                        className="w-16 h-8 text-xs border border-gray-200 bg-gray-50 rounded-lg text-center cursor-pointer focus:ring-2 focus:ring-indigo-500 outline-none"
                                    >
                                        <option value="to right">⮕</option>
                                        <option value="to bottom">⬇</option>
                                        <option value="to bottom right">↘</option>
                                        <option value="to top right">↗</option>
                                        <option value="45deg">45°</option>
                                        <option value="135deg">135°</option>
                                    </select>

                                    {/* Color 2 */}
                                    <div className="flex-1 relative h-8 rounded-lg overflow-hidden border border-gray-200 shadow-sm group">
                                         <input 
                                            type="color" 
                                            value={customGradientColors[1]}
                                            onChange={(e) => handleCustomColorChange(1, e.target.value)}
                                            className="absolute -top-4 -left-4 w-24 h-24 cursor-pointer"
                                         />
                                    </div>
                                </div>
                                
                                <button
                                    onClick={applyCustomGradient}
                                    className="w-full py-1.5 text-xs font-medium text-white rounded-lg shadow-sm border border-black/5 hover:opacity-90 transition-opacity"
                                    style={{ background: `linear-gradient(${customGradientAngle}, ${customGradientColors[0]}, ${customGradientColors[1]})` }}
                                >
                                    Apply Custom
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Text Color Controls (Always visible if background is set) */}
                    {(tempProfile.backgroundImage || tempProfile.backgroundColor) && (
                        <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
                            <label className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
                                <Type className="w-3 h-3" /> Text Color
                            </label>
                            <div className="flex bg-gray-100 rounded-lg p-1 gap-1">
                                <button
                                    onClick={() => setTempProfile({...tempProfile, textColor: '#111827'})}
                                    className={`p-1.5 rounded-md transition-all ${tempProfile.textColor === '#111827' ? 'bg-white shadow text-gray-900' : 'text-gray-400 hover:text-gray-600'}`}
                                    title="Dark Text"
                                >
                                    <Moon className="w-3.5 h-3.5" />
                                </button>
                                <button
                                    onClick={() => setTempProfile({...tempProfile, textColor: '#ffffff'})}
                                    className={`p-1.5 rounded-md transition-all ${tempProfile.textColor === '#ffffff' ? 'bg-gray-800 shadow text-white' : 'text-gray-400 hover:text-gray-600'}`}
                                    title="Light Text"
                                >
                                    <Sun className="w-3.5 h-3.5" />
                                </button>
                                {/* Auto-detect only works for images */}
                                {activeTab === 'image' && (
                                    <button
                                        onClick={() => analyzeImageBrightness(tempProfile.backgroundImage, false)}
                                        className="p-1.5 text-indigo-500 hover:bg-indigo-50 rounded-md"
                                        title="Auto-detect Best Color from Image"
                                    >
                                        <Wand2 className="w-3.5 h-3.5" />
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-3 bg-gray-50 border-t border-gray-100 flex justify-end">
                <button 
                    onClick={handleSave}
                    className="flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg hover:opacity-90 shadow-sm"
                    style={{ backgroundColor: tempProfile.themeColor }}
                >
                    <Check className="w-4 h-4" />
                    Save Changes
                </button>
            </div>
        </div>
      )}
    </div>
  );
};

export default UserProfile;
