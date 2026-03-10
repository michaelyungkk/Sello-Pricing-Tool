import React from 'react';
import { ArrowUpDown, ChevronUp, ChevronDown } from 'lucide-react';
import { SortState, toggleSort } from '../../utils/tableSort';

interface SortableHeaderProps<K extends string> {
  label: string;
  sortKey: K;
  sort: SortState<K>;
  onChange: (nextSort: SortState<K>) => void;
  align?: 'left' | 'right' | 'center';
  /** v4 column tint: 'blue' | 'green' | 'red' | 'ca' */
  tint?: 'blue' | 'green' | 'red' | 'ca';
  className?: string;
  /** @deprecated use tint instead */
  themeColor?: string;
}

export function SortableHeader<K extends string>({
  label,
  sortKey,
  sort,
  onChange,
  align = 'left',
  tint,
  className = '',
}: SortableHeaderProps<K>) {
  const isActive = sort?.key === sortKey;
  const dir = sort?.dir;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(toggleSort(sort, sortKey));
  };

  const tintClass = tint
    ? tint === 'ca'
      ? 'col-ca'
      : `col-${tint}`
    : '';

  const alignClass = align === 'right' ? 'r' : align === 'center' ? 'c' : '';
  const sortedClass = isActive ? 'sorted' : '';

  return (
    <th
      className={`${alignClass} ${tintClass} ${sortedClass} ${className}`.trim()}
      onClick={handleClick}
      role="columnheader"
      aria-sort={isActive ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <div
        className={`flex items-center gap-1 ${
          align === 'right'
            ? 'justify-end'
            : align === 'center'
            ? 'justify-center'
            : 'justify-start'
        }`}
      >
        <span>{label}</span>
        <span className="flex-shrink-0 opacity-40" style={{ lineHeight: 0 }}>
          {isActive ? (
            dir === 'asc' ? (
              <ChevronUp style={{ width: 10, height: 10, opacity: 1, color: 'var(--theme)' }} />
            ) : (
              <ChevronDown style={{ width: 10, height: 10, opacity: 1, color: 'var(--theme)' }} />
            )
          ) : (
            <ArrowUpDown style={{ width: 10, height: 10 }} />
          )}
        </span>
      </div>
    </th>
  );
}
