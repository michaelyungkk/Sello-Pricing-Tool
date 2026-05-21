
import React from 'react';

export type Tab = {
    key: string;
    label: string;
    icon?: React.ElementType;
}

export type TabSwitcherProps = {
    tabs: Tab[];
    activeTab: string;
    onChange: (key: string) => void;
    size?: 'sm' | 'md';
    loadingTabKey?: string | null;
    loadingColor?: string;
}

export const TabSwitcher = ({
    tabs,
    activeTab,
    onChange,
    size = 'sm',
    loadingTabKey = null,
    loadingColor = 'var(--theme-color, #4f46e5)'
}: TabSwitcherProps) => {
    const isSm = size === 'sm';
    const paddingClasses = isSm ? 'px-3 py-1.5' : 'px-4 py-2';
    const textClasses = isSm ? 'text-xs' : 'text-sm';
    const iconSize = isSm ? 'w-3 h-3' : 'w-4 h-4';

    return (
        <div className="flex gap-1 p-1 w-fit">
            {tabs.map((tab) => {
                const isActive = activeTab === tab.key;
                const isLoading = loadingTabKey === tab.key;
                const Icon = tab.icon;

                return (
                    <button
                        key={tab.key}
                        onClick={() => onChange(tab.key)}
                        className={`
                            ${paddingClasses} ${textClasses}
                            font-medium rounded-lg transition-all flex items-center gap-2 relative overflow-hidden
                            ${isActive
                                ? 'bg-custom-glass backdrop-blur-custom border border-custom-glass shadow-sm text-gray-900'
                                : 'text-gray-500 hover:text-gray-700 hover:bg-white/10 border border-transparent'
                            }
                        `}
                    >
                        {isLoading && (
                            <span
                                className="pointer-events-none absolute inset-x-1 bottom-0 h-[2px] rounded-full overflow-hidden opacity-90"
                                style={{ backgroundColor: `${loadingColor}22` }}
                            >
                                <span
                                    className="absolute inset-y-0 w-1/2 rounded-full"
                                    style={{
                                        backgroundColor: loadingColor,
                                        animation: 'tab-loading-slide 1.05s ease-in-out infinite'
                                    }}
                                />
                            </span>
                        )}
                        {Icon && <Icon className={iconSize} />}
                        <span>{tab.label}</span>
                    </button>
                );
            })}
            <style>{`
                @keyframes tab-loading-slide {
                    0% { transform: translateX(-120%); }
                    100% { transform: translateX(240%); }
                }
            `}</style>
        </div>
    );
};

export default TabSwitcher;
