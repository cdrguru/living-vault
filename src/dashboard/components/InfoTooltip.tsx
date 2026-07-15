// src/dashboard/components/InfoTooltip.tsx
import { useId } from "react";

/**
 * A circled-i info affordance: a focusable trigger button plus a tooltip popover
 * that reveals on hover and on keyboard focus. It hardens the CSS-only model/Tip
 * pattern with a real button, aria-describedby, Escape-to-dismiss, and an align
 * prop so triggers near a viewport edge do not clip. Shape carries meaning, not
 * color alone, so the glyph is a hand-authored SVG marked aria-hidden.
 */
export function InfoTooltip({
  label,
  triggerLabel = "What this measures",
  align = "center",
  size = "sm",
}: {
  label: string;
  triggerLabel?: string;
  align?: "start" | "center" | "end";
  size?: "sm" | "md";
}) {
  const tipId = useId();
  const anchor =
    align === "start"
      ? "left-0"
      : align === "end"
        ? "right-0"
        : "left-1/2 -translate-x-1/2";
  const glyph = size === "md" ? 16 : 13;

  return (
    <span className="group/tip relative inline-flex">
      <button
        aria-describedby={tipId}
        aria-label={triggerLabel}
        className="inline-flex h-4 w-4 items-center justify-center rounded-full text-subtle hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onKeyDown={(event) => {
          if (event.key === "Escape") event.currentTarget.blur();
        }}
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height={glyph}
          stroke="currentColor"
          strokeWidth="1.6"
          viewBox="0 0 16 16"
          width={glyph}
        >
          <circle cx="8" cy="8" r="6.5" />
          <line strokeLinecap="round" x1="8" x2="8" y1="7.5" y2="11" />
          <circle cx="8" cy="4.8" fill="currentColor" r="0.6" stroke="none" />
        </svg>
      </button>
      <span
        className={`pointer-events-none absolute top-full z-20 mt-1 hidden w-max max-w-[16rem] rounded-md border border-border bg-surface-raised px-2 py-1 text-xs font-normal normal-case leading-snug tracking-normal text-muted shadow-md group-hover/tip:block group-focus-within/tip:block ${anchor}`}
        id={tipId}
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
