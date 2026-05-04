import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface MetricDefinitionTooltipProps {
    title: string;
    formula: string;
    source: string;
    windowLabel?: string;
    className?: string;
}

export const MetricDefinitionTooltip: React.FC<MetricDefinitionTooltipProps> = ({
    title,
    formula,
    source,
    windowLabel,
    className = ''
}) => {
    const [open, setOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement | null>(null);
    const popRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!open) return;
        const onDocClick = (event: MouseEvent) => {
            const target = event.target as Node;
            if (buttonRef.current?.contains(target) || popRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onEsc = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };
        document.addEventListener('mousedown', onDocClick);
        document.addEventListener('keydown', onEsc);
        return () => {
            document.removeEventListener('mousedown', onDocClick);
            document.removeEventListener('keydown', onEsc);
        };
    }, [open]);

    const popStyle = useMemo(() => {
        if (!open || !buttonRef.current) return null;
        const rect = buttonRef.current.getBoundingClientRect();
        const width = 300;
        const margin = 8;
        let left = rect.right - width;
        left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
        let top = rect.bottom + 8;
        const estimatedHeight = 165;
        if (top + estimatedHeight > window.innerHeight - margin) {
            top = rect.top - estimatedHeight - 8;
        }
        return { position: 'fixed' as const, top, left, width };
    }, [open]);

    return (
        <span className={`inline-flex items-center ${className}`}>
            <button
                ref={buttonRef}
                type="button"
                className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-300 text-[10px] font-bold text-gray-600 bg-white hover:bg-gray-50 transition-colors"
                onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    setOpen(prev => !prev);
                }}
                title={`Show definition: ${title}`}
                aria-label={`Show definition: ${title}`}
            >
                ?
            </button>
            {open && popStyle && createPortal(
                <div
                    ref={popRef}
                    style={popStyle}
                    className="z-[9999] rounded-xl border border-gray-200 bg-white p-3 text-left text-[11px] leading-4 text-gray-700 shadow-xl normal-case"
                >
                    <div className="mb-1.5 font-bold text-gray-900">{title}</div>
                    <div><span className="font-semibold text-gray-500">Formula:</span> {formula}</div>
                    <div><span className="font-semibold text-gray-500">Source:</span> {source}</div>
                    {windowLabel && (
                        <div><span className="font-semibold text-gray-500">Window:</span> {windowLabel}</div>
                    )}
                </div>,
                document.body
            )}
        </span>
    );
};
