import React from 'react';

export function GradeBadge({ gradeLevel }: { gradeLevel?: number | string | null }) {
  const n = Number(gradeLevel);

  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }

  let colorClasses = 'bg-slate-100 text-slate-600 border-slate-200'; // Default/fallback

  if (n <= 2) {
    // Good (1-2)
    colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
  } else if (n === 3) {
    // Okay (3)
    colorClasses = 'bg-sky-50 text-sky-700 border-sky-200';
  } else if (n === 4) {
    // Warning (4)
    colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
  } else if (n >= 5) {
    // Bad (5+)
    colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
  }

  const baseClasses = "inline-flex items-center rounded-full px-1 py-0 text-[10px] font-medium ml-2";

  return (
    <span className={`${baseClasses} ${colorClasses}`}>
      G{n}
    </span>
  );
}
