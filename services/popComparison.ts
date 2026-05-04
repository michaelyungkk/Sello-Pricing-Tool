export interface PopComparison {
  current: number;
  previous: number;
  delta: number;
  deltaPct: number | null;
  hasBaseline: boolean;
}

export const getPopComparison = (current: number, previous: number): PopComparison => {
  const safeCurrent = Number.isFinite(current) ? current : 0;
  const safePrevious = Number.isFinite(previous) ? previous : 0;
  const delta = safeCurrent - safePrevious;
  const hasBaseline = safePrevious !== 0;
  return {
    current: safeCurrent,
    previous: safePrevious,
    delta,
    deltaPct: hasBaseline ? (delta / safePrevious) * 100 : null,
    hasBaseline
  };
};

