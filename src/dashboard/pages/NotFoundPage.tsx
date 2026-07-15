import { Link, useLocation } from "react-router-dom";

import { EmptyState } from "@/dashboard/components/EmptyState";

/** A route-specific glyph: a magnifier over a dashed frame reads as "looked
 * here, found nothing", distinct from the EmptyState default vault box. */
const notFoundIcon = (
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
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.3-4.3" strokeLinecap="round" />
    <path d="M8.5 11h5" strokeLinecap="round" />
  </svg>
);

/**
 * The branded 404 for unknown deep routes. Rendered inside DashboardLayout's
 * Outlet so the sidebar nav and header stay present (the primary way back),
 * with an explicit Back to Overview action as the clear next step.
 */
export function NotFoundPage() {
  const location = useLocation();

  return (
    <section aria-labelledby="not-found-title" className="py-6">
      <EmptyState
        action={
          <Link
            className="inline-flex items-center justify-center gap-2 rounded-md bg-accent-strong px-4 py-2 text-sm font-medium text-accent-fg shadow-card transition-[background-color,transform,box-shadow] hover:bg-accent-strong-hover active:translate-y-px"
            to="/"
          >
            Back to Overview
          </Link>
        }
        icon={notFoundIcon}
        title={<span id="not-found-title">This page does not exist</span>}
      >
        We could not find{" "}
        <code className="rounded bg-surface-inset px-1 py-0.5 font-mono text-[0.8125rem] text-fg">
          {location.pathname}
        </code>
        . The link may be out of date. Use the sidebar to jump to a surface, or
        head back to the Overview.
      </EmptyState>
    </section>
  );
}
