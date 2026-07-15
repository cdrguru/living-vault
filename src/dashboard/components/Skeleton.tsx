/** A single shimmering placeholder block. Compose into shaped loading states. */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div aria-hidden="true" className={`skeleton ${className}`.trim()} />;
}

/** KPI-shaped loading placeholder so the overview reserves its layout while data loads. */
export function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-surface p-3.5 shadow-card">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="mt-3 h-7 w-20" />
      <Skeleton className="mt-3 h-3 w-28" />
    </div>
  );
}

/**
 * A grid of KPI skeletons for the top of a page. The grid breakpoint matches
 * the resolved column count so the loading shell does not jump on hydrate:
 * count=3 uses sm:grid-cols-3, every other count uses lg:grid-cols-4.
 */
export function SkeletonKpiRow({ count = 4 }: { count?: number }) {
  const grid =
    count === 3
      ? "grid grid-cols-1 gap-4 sm:grid-cols-3"
      : "grid grid-cols-2 gap-4 lg:grid-cols-4";
  return (
    <div className={grid}>
      {Array.from({ length: count }, (_, index) => (
        <SkeletonCard key={index} />
      ))}
    </div>
  );
}
