/**
 * Stroke width for a canvas edge from its live link count, log scaled across the
 * relationship set so a high-traffic edge reads louder without a 1000x count
 * swamping a small one. Active (hovered or selected) edges get extra weight on
 * top; the accent color carries the rest of the active emphasis.
 */
export function edgeStrokeWidth(
  count: number,
  minCount: number,
  maxCount: number,
  active: boolean
): number {
  const lo = Math.log(minCount + 1);
  const hi = Math.log(maxCount + 1);
  const raw = hi > lo ? (Math.log(count + 1) - lo) / (hi - lo) : 0;
  const t = Math.min(1, Math.max(0, raw));
  const base = 1.2 + t * 2.3;
  return active ? base + 1 : base;
}
