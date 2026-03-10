import React from 'react';

export function GradeBadge({ gradeLevel }: { gradeLevel?: number | string | null }) {
  const n = Number(gradeLevel);

  if (!Number.isFinite(n) || n <= 0) return null;

  let cls = 'sello-badge badge-gray'; // fallback

  if (n <= 2) {
    cls = 'sello-badge badge-g12';
  } else if (n === 3) {
    cls = 'sello-badge badge-g3';
  } else if (n === 4) {
    cls = 'sello-badge badge-g4';
  } else if (n >= 5) {
    cls = 'sello-badge badge-g5';
  }

  return (
    <span className={cls} style={{ marginLeft: '6px', fontSize: '9.5px', lineHeight: '16px', padding: '0 5px' }}>
      G{n}
    </span>
  );
}
