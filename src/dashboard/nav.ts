import type { OwnerRole } from "@/data";
import { atLeast } from "@/dashboard/access";

export interface NavItem {
  path: string;
  label: string;
  /** Minimum role required to see this item; absent means everyone. */
  minRole?: OwnerRole;
}

export const NAV: readonly NavItem[] = [
  { path: "/", label: "Overview" },
  { path: "/monitor", label: "Monitor" },
  { path: "/catalogue", label: "Catalogue" },
  { path: "/effectiveness", label: "Effectiveness" },
  { path: "/cost", label: "Cost" },
  { path: "/coverage", label: "Coverage" },
  { path: "/governance", label: "Governance" },
  { path: "/dependencies", label: "Dependencies" },
  { path: "/model", label: "Model" },
  { path: "/submissions", label: "Submissions", minRole: "maintainer" },
];

/** The nav items a given role may see (role-gated items filtered out). */
export function visibleNav(role: OwnerRole): NavItem[] {
  return NAV.filter((item) => !item.minRole || atLeast(role, item.minRole));
}

/**
 * The Settings home. Kept out of NAV so it renders in the sidebar footer cluster,
 * visually distinct from the data pages, while still resolving the header
 * page title.
 */
export const SETTINGS_NAV = { path: "/settings", label: "Settings" } as const;

/**
 * Whether the header's asset search and filter selects belong on a route. The
 * /model canvas reads the full dataset rather than filteredAssets, so those
 * controls have no effect there and only add a second, near-identical search
 * box beside the canvas's own Find field. Hidden on the model route and on
 * Settings (which reads neither filteredAssets nor the catalog search), shown
 * everywhere else.
 */
export function showsCatalogFilters(pathname: string): boolean {
  return (
    !pathname.startsWith("/model") &&
    !pathname.startsWith("/settings") &&
    !pathname.startsWith("/submissions")
  );
}

/**
 * Whether the global time-range control belongs in the header. Hidden on routes
 * that do not window utilization (Settings, Submissions) or that carry their own
 * time scrubber (Model canvas).
 */
export function showsTimeRange(pathname: string): boolean {
  return (
    !pathname.startsWith("/model") &&
    !pathname.startsWith("/settings") &&
    !pathname.startsWith("/submissions")
  );
}
