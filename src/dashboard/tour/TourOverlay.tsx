import { useEffect, useState, type CSSProperties } from "react";

import { Button } from "@/dashboard/components/Button";
import { useTour } from "./TourProvider";

const POPOVER_WIDTH = 320;
const GAP = 14;

/** Clamp a coordinate so the popover stays fully on screen. */
function clamp(value: number, size: number, viewport: number): number {
  if (viewport <= size + GAP * 2) return GAP;
  return Math.min(Math.max(value, GAP), viewport - size - GAP);
}

/**
 * The visible half of the tour: a dimming backdrop, a highlight ring around the
 * current step's anchor element, and a popover with the step copy plus
 * navigation. It locates the anchor by its data-tour attribute after each route
 * settles, re-measures on resize, and falls back to a centered popover when the
 * anchor is not on screen. Renders nothing when the tour is inactive.
 */
export function TourOverlay() {
  const { active, step, index, total, next, back, stop } = useTour();
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!active || !step) {
      setRect(null);
      return;
    }
    const measure = () => {
      const el = document.querySelector(`[data-tour="${step.anchor}"]`);
      if (el) {
        el.scrollIntoView({ block: "nearest", inline: "nearest" });
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    // Wait two frames so the just-navigated route has painted before measuring.
    const raf = requestAnimationFrame(() => requestAnimationFrame(measure));
    window.addEventListener("resize", measure);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", measure);
    };
  }, [active, step]);

  if (!active || !step) return null;

  const viewportW =
    typeof window !== "undefined" ? window.innerWidth : POPOVER_WIDTH + GAP * 2;
  const viewportH = typeof window !== "undefined" ? window.innerHeight : 768;

  let ring: CSSProperties | null = null;
  let popover: CSSProperties;
  if (rect && (rect.width > 0 || rect.height > 0)) {
    ring = {
      position: "fixed",
      top: rect.top - 4,
      left: rect.left - 4,
      width: rect.width + 8,
      height: rect.height + 8,
    };
    const below = rect.bottom + GAP;
    const fitsBelow = below + 160 < viewportH;
    popover = {
      position: "fixed",
      width: POPOVER_WIDTH,
      left: clamp(rect.left, POPOVER_WIDTH, viewportW),
      top: fitsBelow ? below : Math.max(GAP, rect.top - 160 - GAP),
    };
  } else {
    popover = {
      position: "fixed",
      width: POPOVER_WIDTH,
      left: Math.max(GAP, (viewportW - POPOVER_WIDTH) / 2),
      top: Math.max(GAP, viewportH / 2 - 100),
    };
  }

  const isLast = index >= total - 1;

  return (
    <div aria-live="polite" className="fixed inset-0 z-[60]" role="dialog" aria-label="Guided tour">
      <div aria-hidden="true" className="absolute inset-0 bg-black/50" />
      {ring && (
        <div
          aria-hidden="true"
          className="pointer-events-none rounded-lg ring-2 ring-accent ring-offset-2 ring-offset-transparent transition-[top,left,width,height] duration-200 motion-reduce:transition-none"
          style={ring}
        />
      )}
      <div
        className="rounded-xl border border-border-strong bg-surface-raised p-4 shadow-raised"
        style={popover}
      >
        <div className="eyebrow mb-1 flex items-center justify-between">
          <span>Tour</span>
          <span className="font-mono text-[0.6875rem] text-muted">
            {index + 1} / {total}
          </span>
        </div>
        <h2 className="font-display text-base font-semibold tracking-tight text-fg">
          {step.title}
        </h2>
        <p className="mt-1.5 text-sm text-muted">{step.body}</p>
        <div className="mt-4 flex items-center justify-between gap-2">
          <Button onClick={stop} size="sm" variant="ghost">
            Skip
          </Button>
          <div className="flex items-center gap-2">
            <Button disabled={index === 0} onClick={back} size="sm" variant="secondary">
              Back
            </Button>
            <Button onClick={isLast ? stop : next} size="sm" variant="primary">
              {isLast ? "Done" : "Next"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
