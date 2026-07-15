import { useId, type ButtonHTMLAttributes, type ReactNode } from "react";

import { InfoTooltip } from "./InfoTooltip";
import { TOOLTIPS, type TooltipKey } from "@/dashboard/tooltips";

/**
 * A Panel-styled card whose body collapses to its header bar. The parent owns the
 * open/minimized/closed state machine: render the card for "open" and "minimized"
 * (driving `collapsed`), and unmount it entirely for "closed", offering its own
 * reopen affordance. This component handles only the open <-> minimized transition
 * plus the close request, so it stays reusable for any collapsible form card.
 *
 * The collapse animates with the grid-template-rows 0fr/1fr technique (smooth, no
 * height measuring) and respects prefers-reduced-motion. When collapsed the body
 * is both `aria-hidden` and `inert`, so its fields leave the accessibility tree
 * and the tab order while staying mounted for the transition.
 */
function HeaderIconButton({
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted transition-[background-color,color] hover:bg-surface-inset hover:text-fg motion-reduce:transition-none"
      type="button"
      {...rest}
    >
      {children}
    </button>
  );
}

const iconProps = {
  "aria-hidden": true,
  fill: "none",
  height: 16,
  width: 16,
  stroke: "currentColor",
  strokeWidth: 2,
  viewBox: "0 0 24 24",
} as const;

/** A single low line: window-style minimize. */
function MinimizeIcon() {
  return (
    <svg {...iconProps}>
      <path d="M5 18h14" strokeLinecap="round" />
    </svg>
  );
}

/** A hollow square: maximize/restore the collapsed card. */
function ExpandIcon() {
  return (
    <svg {...iconProps}>
      <rect height="13" rx="1.5" width="14" x="5" y="6" />
    </svg>
  );
}

/** A crossing X: close. Mirrors the clear glyph in SearchInput. */
function CloseIcon() {
  return (
    <svg {...iconProps}>
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CollapsibleCard({
  title,
  collapsed,
  onToggleCollapse,
  onClose,
  info,
  children,
}: {
  title: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onClose: () => void;
  info?: TooltipKey;
  children: ReactNode;
}) {
  const bodyId = useId();
  return (
    <section className="min-w-0 self-start overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <h2 className="font-display text-sm font-semibold tracking-tight text-fg">
            {title}
          </h2>
          {info && (
            <InfoTooltip
              label={TOOLTIPS[info]}
              triggerLabel={`About ${title}`}
            />
          )}
        </div>
        <div className="flex items-center gap-1">
          <HeaderIconButton
            aria-controls={bodyId}
            aria-expanded={!collapsed}
            aria-label={`${collapsed ? "Expand" : "Minimize"} ${title} form`}
            onClick={onToggleCollapse}
          >
            {collapsed ? <ExpandIcon /> : <MinimizeIcon />}
          </HeaderIconButton>
          <HeaderIconButton
            aria-label={`Close ${title} form`}
            onClick={onClose}
          >
            <CloseIcon />
          </HeaderIconButton>
        </div>
      </header>
      <div
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: collapsed ? "0fr" : "1fr" }}
      >
        <div className="overflow-hidden">
          <div
            aria-hidden={collapsed || undefined}
            aria-label={`${title} form fields`}
            className="min-w-0 p-4"
            id={bodyId}
            inert={collapsed || undefined}
            role="group"
          >
            {children}
          </div>
        </div>
      </div>
    </section>
  );
}
