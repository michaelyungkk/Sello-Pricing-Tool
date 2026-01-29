
import React from 'react';
import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { SortState, toggleSort } from '../../utils/tableSort';

interface SortableHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onChange: (nextSort: SortState<K>) => void;
  align?: 'left' | 'right' | 'center';
  className?: string;
  themeColor?: string;
}

export function SortableHeader<K extends string>({
  label,
  sortKey,
  sort,
  onChange,
  align = 'left',
  className = '',
  themeColor = '#6366f1'
}: SortableHeaderProps<K>) {
  const isActive = sort?.key === sortKey;
  const dir = sort?.dir;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    const next = toggleSort(sort, sortKey);
    onChange(next);
  };

  return (
    <th
      className={`px-4 py-3 font-semibold cursor-pointer select-none hover:bg-gray-100/50 transition-colors text-${align} ${className}`}
      onClick={handleClick}
      role="columnheader"
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <div className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : align === 'center' ? 'justify-center' : 'justify-start'}`}>
        <span>{label}</span>
        <div className="flex flex-col flex-shrink-0">
          {isActive ? (
            dir === 'asc' ? (
              <ChevronUp className="w-3 h-3" style={{ color: themeColor }} />
            ) : (
              <ChevronDown className="w-3 h-3" style={{ color: themeColor }} />
            )
          ) : (
            <ArrowUpDown className="w-3 h-3 text-gray-400 opacity-50" />
          )}
        </div>
      </div>
    </th>
  );
}
