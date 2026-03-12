import React from 'react';
import { Zap, Clock, Archive } from 'lucide-react';

export const StatusBadge = ({ status }: { status: 'UPCOMING' | 'ACTIVE' | 'ENDED' }) => {
    const badgeClass = {
        UPCOMING: 'sello-badge badge-blue',
        ACTIVE: 'sello-badge badge-green',
        ENDED: 'sello-badge badge-gray',
    }[status];

    return (
        <span className={badgeClass}>
            {status === 'UPCOMING' && <Clock className="w-3 h-3 mr-1" />}
            {status === 'ACTIVE' && <Zap className="w-3 h-3 mr-1" />}
            {status === 'ENDED' && <Archive className="w-3 h-3 mr-1" />}
            {status}
        </span>
    );
};
