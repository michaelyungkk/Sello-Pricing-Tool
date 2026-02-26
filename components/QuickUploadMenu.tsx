import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { UploadCloud, ChevronDown } from 'lucide-react';

interface QuickUploadAction {
    label: string;
    icon: React.ElementType;
    action: () => void;
    color: string;
}

interface QuickUploadMenuProps {
    themeColor: string;
    actions: QuickUploadAction[];
}

export const QuickUploadMenu: React.FC<QuickUploadMenuProps> = ({ themeColor, actions }) => {
    const { t } = useTranslation();
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative z-50" ref={menuRef}>
            <button 
                onClick={() => setIsOpen(!isOpen)} 
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg shadow-md transition-all font-medium" 
                style={{ backgroundColor: themeColor }}
            >
                <UploadCloud className="w-4 h-4" />
                <span className="hidden md:inline">{t('upload_data')}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            
            {isOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden animate-in fade-in zoom-in-95 duration-200 origin-top-right">
                    <div className="p-2 grid gap-1">
                        {actions.map((item) => (
                            <button 
                                key={item.label} 
                                onClick={() => { item.action(); setIsOpen(false); }} 
                                className="flex items-center gap-3 px-3 py-2.5 text-sm text-gray-700 hover:bg-gray-50 rounded-lg transition-colors text-left w-full group"
                            >
                                <div className={`p-1.5 rounded-md bg-gray-50 group-hover:bg-white border border-gray-100 group-hover:shadow-sm transition-all ${item.color}`}>
                                    <item.icon className="w-4 h-4" />
                                </div>
                                <span className="font-medium">{item.label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
};
