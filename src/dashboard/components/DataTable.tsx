import type { ReactNode } from 'react';

/**
 * Structural table primitive. Owns the horizontal-scroll container, the shared
 * density (px-3 py-2 cells), the eyebrow head style, row dividers, and row
 * hover, so Catalogue and Effectiveness stop styling cells per page and a
 * density or dark-mode change lands in one place. Pages provide thead/tbody;
 * each th should carry scope="col".
 *
 * Overflow affordances, so a reader can tell more columns exist off-screen and
 * reach them at 1280px and on mobile:
 *  - a right-edge gradient fade that overlays the table without scrolling away,
 *  - a sticky thead so the column labels stay while scrolling vertically, and
 *  - an opt-in sticky first column (stickyFirstColumn) that pins the identity
 *    column to the left edge so a wide table keeps its anchor in view while the
 *    rest scrolls horizontally. The pinned cells carry an opaque background so
 *    scrolled content slides under them, and a hairline right border marks the
 *    seam.
 */
export function DataTable({
  caption,
  scrollRegionLabel,
  minWidth = 920,
  stickyFirstColumn = false,
  children,
}: {
  caption: string;
  /** Accessible name for the scroll region; defaults to the caption. */
  scrollRegionLabel?: string;
  minWidth?: number;
  /** Pin the first column to the left edge so it stays visible while scrolling. */
  stickyFirstColumn?: boolean;
  children: ReactNode;
}) {
  // The pinned first cell needs an opaque background to occlude scrolled content,
  // a left sticky offset, and a z-index above the body but below the sticky head
  // corner. The body cell sits at z-[1]; its thead corner gets z-[2] so the head
  // label stays on top where the two sticky axes meet.
  const stickyColumn = stickyFirstColumn
    ? `[&_tbody_td:first-child]:sticky [&_tbody_td:first-child]:left-0 [&_tbody_td:first-child]:z-[1] [&_tbody_td:first-child]:bg-surface [&_tbody_tr:hover_td:first-child]:bg-surface-inset/70 [&_tbody_td:first-child]:after:pointer-events-none [&_tbody_td:first-child]:after:absolute [&_tbody_td:first-child]:after:inset-y-0 [&_tbody_td:first-child]:after:right-0 [&_tbody_td:first-child]:after:w-px [&_tbody_td:first-child]:after:bg-border [&_thead_th:first-child]:sticky [&_thead_th:first-child]:left-0 [&_thead_th:first-child]:z-[2] [&_thead_th:first-child]:bg-surface-muted [&_td:first-child]:relative`
    : "";

  return (
    // Relative outer wrapper: hosts the right-edge fade so it overlays the table
    // without scrolling away. The inner div owns the scroll and is the focusable,
    // labelled scroll region so overflow is keyboard-reachable and discoverable.
    <div className="relative max-w-full after:pointer-events-none after:absolute after:inset-y-0 after:right-0 after:w-6 after:bg-gradient-to-l after:from-surface">
      <div
        aria-label={scrollRegionLabel ?? caption}
        className="max-w-full overflow-x-auto overscroll-x-contain"
        role="region"
        tabIndex={0}
      >
        <table
          className={`w-full border-collapse text-left text-sm
            [&_td]:px-3 [&_td]:py-2.5 [&_td]:align-middle
            [&_th]:px-3 [&_th]:py-2.5 [&_th]:text-left [&_th]:font-mono [&_th]:text-[0.6875rem] [&_th]:font-semibold [&_th]:uppercase [&_th]:tracking-[0.1em] [&_th]:text-subtle
            [&_thead]:sticky [&_thead]:top-0 [&_thead]:z-[1] [&_thead]:border-b [&_thead]:border-border [&_thead]:bg-surface-muted/95
            [&_tbody]:divide-y [&_tbody]:divide-border
            [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-surface-inset/70
            ${stickyColumn}`}
          style={{ minWidth }}
        >
          <caption className="sr-only">{caption}</caption>
          {children}
        </table>
      </div>
    </div>
  );
}
