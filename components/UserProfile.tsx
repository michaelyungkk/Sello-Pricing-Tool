
import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { UserProfile as UserProfileType } from '../types';
import { User, Settings, Palette, Image as ImageIcon, X, Check, Upload, Wand2, Sun, Moon, Type, PaintBucket, LayoutTemplate, Layers, RotateCw, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

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
  const { t, i18n } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [tempProfile, setTempProfile] = useState(profile);
  const [activeTab, setActiveTab] = useState<'image' | 'solid' | 'gradient'>('image');
  const [dropdownPos, setDropdownPos] = useState<{ top: number; right: number } | null>(null);
  
  // Custom Gradient State
  const [customGradientColors, setCustomGradientColors] = useState(['#6366f1', '#ec4899']);
  const [customGradientAngle, setCustomGradientAngle] = useState('to right');
  
  const dropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
      setTempProfile(profile);
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
    // Using a more robust close handler for Portal
    const handleGlobalClick = (e: MouseEvent) => {
        if (!isOpen) return;
        const target = e.target as Node;
        // Check if click is inside the trigger button
        if (dropdownRef.current && dropdownRef.current.contains(target)) {
            return;
        }
        // Check if click is inside the dropdown (we need an ID or class since ref inside portal is tricky without forwarding)
        const dropdownEl = document.getElementById('user-profile-dropdown');
        if (dropdownEl && dropdownEl.contains(target)) {
            return;
        }
        setIsOpen(false);
    };

    document.addEventListener('mousedown', handleGlobalClick);
    return () => document.removeEventListener('mousedown', handleGlobalClick);
  }, [isOpen]);

  // Update position on open and scroll
  useEffect(() => {
      if (isOpen && dropdownRef.current) {
          const updatePos = () => {
              const rect = dropdownRef.current!.getBoundingClientRect();
              setDropdownPos({
                  top: rect.bottom + 8,
                  right: window.innerWidth - rect.right
              });
          };
          updatePos();
          window.addEventListener('resize', updatePos);
          window.addEventListener('scroll', updatePos); 
          return () => {
              window.removeEventListener('resize', updatePos);
              window.removeEventListener('scroll', updatePos);
          };
      }
  }, [isOpen]);

  // Sync custom gradient when inputs change
  const updateCustomGradient = (colors: string[], angle: string) => {
      const gradientString = `linear-gradient(${angle}, ${colors[0]}, ${colors[1]})`;
      setTempProfile(prev => ({ ...prev, backgroundImage: gradientString }));
  };

  const handleSave = () => {
    onUpdate(tempProfile);
    setIsOpen(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) {
          const reader = new FileReader();
          reader.onloadend = () => {
              const result = reader.result as string;
              setTempProfile(prev => ({ ...prev, backgroundImage: result }));
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

  const handleTextColorChange = (mode: 'auto' | 'dark' | 'light') => {
      let color = undefined;
      if (mode === 'dark') color = '#111827';
      if (mode === 'light') color = '#ffffff';
      setTempProfile(prev => ({ ...prev, textColor: color }));
  };

  const changeLanguage = (lng: string) => {
      i18n.changeLanguage(lng);
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button 
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 p-1.5 pl-3 pr-2 bg-custom-glass border border-custom-glass rounded-full shadow-sm hover:shadow-md transition-all group"
      >
        <div className="flex flex-col items-end mr-1">
             <span className="text-xs font-bold text-gray-700 leading-none" style={{ color: profile.textColor || 'inherit' }}>
                {profile.name || 'Guest'}
             </span>
             <span className="text-[10px] text-gray-500" style={{ color: profile.textColor ? `${profile.textColor}90` : 'inherit' }}>{t('settings')}</span>
        </div>
        <div 
            className="w-8 h-8 rounded-full flex items-center justify-center text-white shadow-inner"
            style={{ backgroundColor: profile.themeColor }}
        >
             <User className="w-4 h-4" />
        </div>
      </button>

      {isOpen && dropdownPos && createPortal(
        <div 
            id="user-profile-dropdown"
            className="fixed w-80 bg-white/95 backdrop-blur-xl rounded-xl shadow-2xl border border-white/40 overflow-hidden z-[9999] animate-in fade-in slide-in-from-top-2 duration-200"
            style={{ top: dropdownPos.top, right: dropdownPos.right }}
        >
            <div className="p-3 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                <h3 className="font-bold text-sm text-gray-800 uppercase tracking-wide">{t('personalize')}</h3>
                <button onClick={() => setIsOpen(false)} className="text-gray-400 hover:text-gray-600"><X className="w-4 h-4"/></button>
            </div>
            
            <div className="p-3 space-y-4 max-h-[80vh] overflow-y-auto">
                {/* Language Toggle */}
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block flex items-center gap-1">
                        <Globe className="w-3 h-3" /> {t('language')}
                    </label>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            onClick={() => changeLanguage('en')}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-medium rounded transition-all ${i18n.language.startsWith('en') ? 'bg-white shadow text-gray-900 border border-gray-200' : 'text-gray-500'}`}
                        >
                            English
                        </button>
                        <button 
                            onClick={() => changeLanguage('zh')}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-medium rounded transition-all ${i18n.language.startsWith('zh') ? 'bg-white shadow text-gray-900 border border-gray-200' : 'text-gray-500'}`}
                        >
                            中文
                        </button>
                    </div>
                </div>

                {/* High Density Row: Name & Color */}
                <div className="flex items-center justify-between gap-3">
                    <div className="flex-1">
                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">{t('display_name')}</label>
                        <input 
                            type="text" 
                            value={tempProfile.name}
                            onChange={(e) => setTempProfile({...tempProfile, name: e.target.value})}
                            className="w-full px-2 py-1.5 border border-gray-200 rounded text-xs focus:ring-1 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">{t('theme')}</label>
                        <div className="relative w-8 h-8 rounded-full overflow-hidden shadow-sm border border-gray-200">
                            <input 
                                type="color" 
                                value={tempProfile.themeColor}
                                onChange={(e) => setTempProfile({...tempProfile, themeColor: e.target.value})}
                                className="absolute -top-2 -left-2 w-12 h-12 cursor-pointer"
                            />
                        </div>
                    </div>
                </div>

                {/* Text Color Preference */}
                <div>
                    <label className="text-[10px] font-bold text-gray-400 uppercase mb-1 block">{t('text_color')}</label>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            onClick={() => handleTextColorChange('auto')}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-medium rounded transition-all ${!tempProfile.textColor ? 'bg-white shadow text-gray-900' : 'text-gray-500'}`}
                        >
                            <Wand2 className="w-3 h-3" /> {t('auto')}
                        </button>
                        <button 
                            onClick={() => handleTextColorChange('dark')}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-medium rounded transition-all ${tempProfile.textColor === '#111827' ? 'bg-gray-800 shadow text-white' : 'text-gray-500'}`}
                        >
                            <Moon className="w-3 h-3" /> {t('dark')}
                        </button>
                        <button 
                            onClick={() => handleTextColorChange('light')}
                            className={`flex-1 flex items-center justify-center gap-1 py-1 text-[10px] font-medium rounded transition-all ${tempProfile.textColor === '#ffffff' ? 'bg-white shadow text-gray-900 border border-gray-200' : 'text-gray-500'}`}
                        >
                            <Sun className="w-3 h-3" /> {t('light')}
                        </button>
                    </div>
                </div>

                {/* Glass Controls */}
                <div className="bg-gray-50/50 p-2 rounded-lg border border-gray-100 space-y-3">
                    <div className="flex justify-between items-center">
                        <label className="text-[10px] font-bold text-gray-500 uppercase flex items-center gap-1">
                            <Layers className="w-3 h-3" /> {t('liquid_glass')}
                        </label>
                        <div className="flex bg-gray-200 p-0.5 rounded text-[10px]">
                            <button 
                                onClick={() => setTempProfile({...tempProfile, glassMode: 'light'})}
                                className={`px-2 py-0.5 rounded transition-all ${tempProfile.glassMode !== 'dark' ? 'bg-white shadow text-gray-800' : 'text-gray-500'}`}
                            >{t('light')}</button>
                            <button 
                                onClick={() => setTempProfile({...tempProfile, glassMode: 'dark'})}
                                className={`px-2 py-0.5 rounded transition-all ${tempProfile.glassMode === 'dark' ? 'bg-gray-800 shadow text-white' : 'text-gray-500'}`}
                            >{t('dark')}</button>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-10">{t('opacity')}</span>
                        <input 
                            type="range" 
                            min="0" max="100" 
                            value={tempProfile.glassOpacity ?? 90} 
                            onChange={(e) => setTempProfile({...tempProfile, glassOpacity: parseInt(e.target.value)})}
                            className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <span className="text-[10px] font-mono text-gray-500 w-6 text-right">{tempProfile.glassOpacity}%</span>
                    </div>

                    <div className="flex items-center gap-2">
                        <span className="text-[10px] text-gray-400 w-10">{t('blur')}</span>
                        <input 
                            type="range" 
                            min="0" max="40" 
                            value={tempProfile.glassBlur ?? 10} 
                            onChange={(e) => setTempProfile({...tempProfile, glassBlur: parseInt(e.target.value)})}
                            className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                        />
                        <span className="text-[10px] font-mono text-gray-500 w-6 text-right">{tempProfile.glassBlur}px</span>
                    </div>

                    <div className="flex justify-between items-center pt-1">
                        <span className="text-[10px] text-gray-400">{t('ambient_depth')}</span>
                        <button 
                            onClick={() => setTempProfile({...tempProfile, ambientGlass: !tempProfile.ambientGlass})}
                            className={`w-8 h-4 rounded-full relative transition-colors ${tempProfile.ambientGlass ? 'bg-indigo-500' : 'bg-gray-300'}`}
                        >
                            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-transform ${tempProfile.ambientGlass ? 'left-4.5' : 'left-0.5'}`} style={tempProfile.ambientGlass ? { left: '18px' } : { left: '2px' }} />
                        </button>
                    </div>

                    {tempProfile.ambientGlass && (
                        <div className="flex items-center gap-2 pt-1 border-t border-gray-200/50 mt-1 animate-in fade-in slide-in-from-top-1">
                            <span className="text-[10px] text-gray-400 w-10">{t('depth')}</span>
                            <input 
                                type="range" 
                                min="0" max="100" 
                                value={tempProfile.ambientGlassOpacity ?? 15} 
                                onChange={(e) => setTempProfile({...tempProfile, ambientGlassOpacity: parseInt(e.target.value)})}
                                className="flex-1 h-1.5 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                            />
                            <span className="text-[10px] font-mono text-gray-500 w-6 text-right">{tempProfile.ambientGlassOpacity ?? 15}%</span>
                        </div>
                    )}
                </div>

                {/* Background Selector */}
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-gray-400 uppercase">{t('background')}</label>
                        <div className="flex gap-1">
                            {[
                                { id: 'image', icon: Upload },
                                { id: 'solid', icon: PaintBucket },
                                { id: 'gradient', icon: LayoutTemplate }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    onClick={() => setActiveTab(tab.id as any)}
                                    className={`p-1 rounded text-gray-500 hover:text-indigo-600 transition-colors ${activeTab === tab.id ? 'bg-indigo-50 text-indigo-600' : ''}`}
                                    title={tab.id}
                                >
                                    <tab.icon className="w-3.5 h-3.5" />
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Content based on Tab */}
                    {activeTab === 'image' && (
                        <div className="flex gap-2">
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-xs text-gray-600 hover:bg-gray-50 flex items-center justify-center gap-1"
                            >
                                <Upload className="w-3 h-3" /> {t('upload')}
                            </button>
                            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileUpload} />
                        </div>
                    )}

                    {activeTab === 'solid' && (
                        <div className="flex items-center gap-2">
                             <div className="relative w-10 h-8 rounded border border-gray-200 overflow-hidden flex-shrink-0">
                                <input 
                                    type="color" 
                                    value={tempProfile.backgroundColor}
                                    onChange={(e) => handleSolidColorChange(e.target.value)}
                                    className="absolute -top-1 -left-1 w-12 h-10 cursor-pointer p-0 border-0"
                                />
                            </div>
                            <div className="flex-1 relative">
                                <input 
                                    type="text" 
                                    value={tempProfile.backgroundColor}
                                    onChange={(e) => handleSolidColorChange(e.target.value)}
                                    className="w-full pl-2 pr-2 py-1.5 border border-gray-200 rounded text-xs font-mono uppercase focus:ring-1 focus:ring-indigo-500"
                                    placeholder="#000000"
                                />
                            </div>
                        </div>
                    )}

                    {activeTab === 'gradient' && (
                        <div className="space-y-3">
                            <div className="grid grid-cols-4 gap-1.5">
                                {GRADIENTS.map((grad, i) => (
                                    <button
                                        key={i}
                                        onClick={() => handleGradientSelect(grad)}
                                        className={`w-full h-6 rounded shadow-sm border border-gray-200 hover:scale-105 transition-transform ${tempProfile.backgroundImage === grad ? 'ring-2 ring-indigo-400' : ''}`}
                                        style={{ background: grad }}
                                    />
                                ))}
                            </div>
                            
                            {/* Custom Gradient Builder */}
                            <div className="bg-gray-50 p-2 rounded border border-gray-100">
                                <label className="text-[10px] font-bold text-gray-400 uppercase mb-2 block">{t('custom_gradient')}</label>
                                <div className="flex items-center gap-2 mb-2">
                                    <input 
                                        type="color" 
                                        value={customGradientColors[0]}
                                        onChange={(e) => {
                                            const newColors = [e.target.value, customGradientColors[1]];
                                            setCustomGradientColors(newColors);
                                            updateCustomGradient(newColors, customGradientAngle);
                                        }}
                                        className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                                    />
                                    <ArrowRightIcon className="w-3 h-3 text-gray-400" />
                                    <input 
                                        type="color" 
                                        value={customGradientColors[1]}
                                        onChange={(e) => {
                                            const newColors = [customGradientColors[0], e.target.value];
                                            setCustomGradientColors(newColors);
                                            updateCustomGradient(newColors, customGradientAngle);
                                        }}
                                        className="w-8 h-8 p-0 border-0 rounded cursor-pointer"
                                    />
                                    <select 
                                        value={customGradientAngle} 
                                        onChange={(e) => {
                                            setCustomGradientAngle(e.target.value);
                                            updateCustomGradient(customGradientColors, e.target.value);
                                        }}
                                        className="flex-1 text-xs border border-gray-300 rounded py-1 pl-1"
                                    >
                                        <option value="to right">Right</option>
                                        <option value="to bottom">Down</option>
                                        <option value="45deg">45°</option>
                                        <option value="135deg">135°</option>
                                    </select>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="p-3 bg-gray-50/80 border-t border-gray-100 flex justify-end">
                <button 
                    onClick={handleSave}
                    className="flex items-center gap-1.5 px-4 py-1.5 text-white text-xs font-bold rounded shadow-sm hover:opacity-90"
                    style={{ backgroundColor: tempProfile.themeColor }}
                >
                    <Check className="w-3.5 h-3.5" />
                    {t('apply_changes')}
                </button>
            </div>
        </div>,
        document.body
      )}
    </div>
  );
};

// Helper icon
const ArrowRightIcon = ({ className }: { className?: string }) => (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line><polyline points="12 5 19 12 12 19"></polyline></svg>
);

export default UserProfile;
