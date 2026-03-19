
import React, { LegacyRef } from 'react';
import { Activity } from 'lucide-react';

interface Signal {
    id: string;
    label: string;
    severity: string;
    color: string;
    icon: any;
    desc: string;
}

interface DiagnosticSignalsSectionProps {
    diagnostics: Signal[];
    focus?: string;
    activeSignalRef: LegacyRef<HTMLDivElement>;
}

export const DiagnosticSignalsSection: React.FC<DiagnosticSignalsSectionProps> = ({ diagnostics, focus, activeSignalRef }) => {
    return (
        <div className="bg-custom-glass border border-custom-glass rounded-xl p-4 backdrop-blur-custom animate-in fade-in slide-in-from-top-2">
            <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-bold text-gray-700 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-theme" />
                    Diagnostic Signals
                </h3>
                <span className="text-[10px] text-gray-400 italic">Thresholds based on global configuration</span>
            </div>
            <div className="flex flex-wrap gap-3">
                {diagnostics.map((signal, idx) => (
                    <div 
                        key={idx} 
                        ref={signal.id === focus ? activeSignalRef : null}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${signal.color} shadow-sm group relative cursor-help transition-all duration-500 hover:scale-105 ${signal.id === focus ? 'ring-2 ring-offset-2 ring-indigo-50? scale-105 bg-opacity-100' : ''}`}
                    >
                        <div className="p-1.5 bg-white/50 rounded-md">
                            <signal.icon className="w-4 h-4" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-[10px] font-medium uppercase opacity-70 tracking-wide">{signal.severity} Priority</span>
                            <span className="text-sm font-medium leading-tight">{signal.label}</span>
                        </div>
                        
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-gray-900 text-white text-xs rounded-xl shadow-xl opacity-0 group-hover:opacity-100 transition-all duration-200 pointer-events-none z-50 text-center transform translate-y-2 group-hover:translate-y-0">
                            <div className="font-semibold mb-1 border-b border-gray-700 pb-1">{signal.label}</div>
                            <div className="leading-relaxed opacity-90">{signal.desc}</div>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-gray-900"></div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
