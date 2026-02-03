
import React from 'react';
import { Zap, Clock, Archive } from 'lucide-react';

export const StatusBadge = ({ status }: { status: 'UPCOMING' | 'ACTIVE' | 'ENDED' }) => {
    const styles = {
        UPCOMING: 'bg-blue-100 text-blue-700 border-blue-200',
        ACTIVE: 'bg-green-100 text-green-700 border-green-200',
        ENDED: 'bg-gray-100 text-gray-600 border-gray-200'
    };
    return (
        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${styles[status]}`}>
            {status === 'UPCOMING' && <Clock className="w-3 h-3 mr-1" />}
            {status === 'ACTIVE' && <Zap className="w-3 h-3 mr-1" />}
            {status === 'ENDED' && <Archive className="w-3 h-3 mr-1" />}
            {status}
        </span>
    );
};
