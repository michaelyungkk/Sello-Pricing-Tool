import React from 'react';

type MetricValueProps = {
  value: number;
  type: 'percent' | 'currency' | 'currency-int' | 'multiplier' | 'number';
  /** Force neutral dark color regardless of sign */
  neutral?: boolean;
  /** CA price — renders in purple */
  isCA?: boolean;
  /** Show tooltip underline hint */
  hint?: boolean;
  /** Extra bold (grand total rows etc.) */
  bold?: boolean;
  className?: string;
  title?: string;
};

export const MetricValue: React.FC<MetricValueProps> = ({
  value,
  type,
  neutral = false,
  isCA = false,
  hint = false,
  bold = false,
  className = '',
  title,
}) => {
  const formatValue = () => {
    switch (type) {
      case 'percent':
        return `${value.toFixed(1)}%`;
      case 'currency': {
        const isNegative = value < 0;
        const abs = Math.abs(value).toFixed(2);
        return `${isNegative ? '-' : ''}£${abs}`;
      }
      case 'currency-int': {
        const isNegative = value < 0;
        const abs = Math.abs(value).toLocaleString('en-GB', { maximumFractionDigits: 0 });
        return `${isNegative ? '-' : ''}£${abs}`;
      }
      case 'multiplier':
        return `${value.toFixed(2)}x`;
      case 'number':
      default:
        return value.toLocaleString('en-GB');
    }
  };

  // ── Colour rule:
  //    isCA          → purple (.v-ca)
  //    neutral/zero  → dark gray (.v-num)
  //    negative      → red (.v-neg)
  //    positive      → dark gray (.v-num)  ← bg tint carries meaning, not font colour
  const colorClass = isCA
    ? 'v-ca'
    : neutral || value === 0
    ? 'v-num'
    : value < 0
    ? 'v-neg'
    : 'v-num';

  const boldClass = bold ? 'v-bold' : '';
  const hintClass = hint ? 'v-hint' : '';

  return (
    <span
      className={`${colorClass} ${boldClass} ${hintClass} ${className}`.trim()}
      title={title}
    >
      {formatValue()}
    </span>
  );
};

/**
 * Thin wrapper for plain number display (units, counts, etc.)
 * Always dark gray, never coloured.
 */
export const NumValue: React.FC<{
  value: number | string;
  bold?: boolean;
  dim?: boolean;
  className?: string;
}> = ({ value, bold = false, dim = false, className = '' }) => {
  const cls = dim ? 'v-dim' : bold ? 'v-num v-bold' : 'v-num';
  return (
    <span className={`${cls} ${className}`.trim()}>
      {typeof value === 'number' ? value.toLocaleString('en-GB') : value}
    </span>
  );
};
