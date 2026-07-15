import type { ReactNode } from "react";

/** The default box glyph. Reads as the Vault mark, so the empty state still
 * feels like part of the console rather than a blank slot. */
const defaultIcon = (
  <svg
    aria-hidden="true"
    className="text-subtle"
    fill="none"
    height="28"
    stroke="currentColor"
    strokeWidth="1.5"
    viewBox="0 0 24 24"
    width="28"
  >
    <path
      d="M3 7l9-4 9 4-9 4-9-4z"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M3 7v10l9 4 9-4V7" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M12 11v10" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * Single voice for "nothing here yet" copy across the dashboard. A dashed,
 * centered frame reads as an intentional empty state rather than a missing one.
 *
 * The bare-children call shape still works. An optional title gives the state a
 * headline, an optional action slots a Button as the clear next step, and an
 * optional icon overrides the default box glyph for context-specific states.
 *
 * The optional fill prop grows the frame to claim the available height and
 * centers its content, so a lone empty state on an otherwise short page reads as
 * a deliberate centered state rather than stranding content at the top with a
 * void beneath. It keeps the same dashed-frame visual language, only taller.
 */
export function EmptyState({
  children,
  title,
  action,
  icon,
  fill = false,
}: {
  children: ReactNode;
  title?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  fill?: boolean;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border-strong bg-surface-muted/40 px-6 text-center ${
        fill ? "min-h-[24rem] py-16" : "py-10"
      }`}
    >
      {icon ?? defaultIcon}
      {title && <div className="text-sm font-semibold text-fg">{title}</div>}
      <div className="max-w-md text-sm text-subtle">{children}</div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
