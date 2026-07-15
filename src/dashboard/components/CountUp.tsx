import { useRef } from "react";

import { useGSAP } from "@gsap/react";
import gsap from "gsap";

import { DUR, EASE } from "@/motion/tokens";
import { prefersReduced } from "@/motion/useReducedMotion";

/**
 * Count a real number up to its value on mount, formatting each frame with the
 * app's own formatter. Drive this only with metrics that are actually tracked,
 * never cost, tokens, or refusals.
 *
 * The tween runs over a proxy and snaps to whole numbers so percentages and
 * integers never show fractional jitter mid-count. The hook keys on the value
 * with revertOnUpdate, so a filter change reverts the old tween and counts to
 * the new number cleanly. Under reduced motion it writes the final formatted
 * value immediately, leaving the number visible and static.
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number;
  /** The app formatter, for example formatNumber or formatPercent. */
  format: (value: number) => string;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;

      // Only genuine integer COUNTS (>= 2) climb from 0; that flourish reads
      // naturally. Rates and percentages (fractional 0..1 values, and an exact
      // 1.0) render at their final value IMMEDIATELY: a percentage headline
      // counting up from 0 passes through wrong-looking numbers like "5%" before
      // settling, which reads as broken or still-loading in a live demo. Reduced
      // motion shows the final value too.
      const isCount = Number.isInteger(value) && Math.abs(value) >= 2;
      if (prefersReduced() || !isCount) {
        el.textContent = format(value);
        return;
      }

      const proxy = { v: 0 };
      gsap.to(proxy, {
        v: value,
        duration: DUR.lg,
        ease: EASE.soft,
        snap: { v: 1 },
        onUpdate: () => {
          el.textContent = format(proxy.v);
        },
      });
    },
    { dependencies: [value], scope: ref, revertOnUpdate: true },
  );

  // Render the formatted final value as the initial and reduced-motion fallback
  // so server-free renders and tests that skip GSAP still read the real number.
  return (
    <span className={className} ref={ref}>
      {format(value)}
    </span>
  );
}
