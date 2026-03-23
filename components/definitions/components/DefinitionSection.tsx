
import React, { ReactNode } from 'react';

interface DefinitionSectionProps {
    children: ReactNode;
    className?: string;
}

export const DefinitionSection: React.FC<DefinitionSectionProps> = ({ children, className = '' }) => {
    return (
        <div className={`bg-custom-glass rounded-xl shadow-lg border border-custom-glass p-6 backdrop-blur-custom ${className}`}>
            {children}
        </div>
    );
};
