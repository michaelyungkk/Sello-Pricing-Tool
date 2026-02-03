
import React, { ReactNode } from 'react';

interface DefinitionGridProps {
    children: ReactNode;
    cols?: 1 | 2 | 3;
    gap?: number;
    className?: string;
}

export const DefinitionGrid: React.FC<DefinitionGridProps> = ({ children, cols = 2, gap = 4, className = '' }) => {
    const gridCols = cols === 1 ? 'grid-cols-1' : cols === 2 ? 'md:grid-cols-2' : 'md:grid-cols-3';
    return (
        <div className={`grid ${gridCols} gap-${gap} ${className}`}>
            {children}
        </div>
    );
};
