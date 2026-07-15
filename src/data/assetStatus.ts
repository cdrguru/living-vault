import type { AssetStatus } from "./types";

/**
 * The AssetStatus union (rayfin/data/Asset.ts) overloads one column with two
 * orthogonal concerns: a lifecycle stage (active, deprecated, retired) and a
 * scope marker (plugin-managed, project-specific) that says where an asset lives
 * rather than how live it is. This pure module splits the two so the UI can read
 * a clean lifecycle for status filters and badges while still surfacing scope.
 *
 * A scope-marked asset is treated as implied-live: it has no deprecated or
 * retired signal, so its lifecycle maps to active. This matches how
 * metrics.governanceChecks judges "live" (status is neither deprecated nor
 * retired), so a plugin-managed or project-specific asset reads as live there
 * and as active here.
 */
export const LIFECYCLE_STATUSES = ["active", "deprecated", "retired"] as const;
export const SCOPE_STATUSES = ["plugin-managed", "project-specific"] as const;

/** True when the status is a scope marker rather than a lifecycle stage. */
export function isScopeStatus(s: AssetStatus): boolean {
  return (SCOPE_STATUSES as readonly string[]).includes(s);
}

/** The scope marker for a status, or null when it is a lifecycle stage. */
export function scopeOf(s: AssetStatus): (typeof SCOPE_STATUSES)[number] | null {
  return isScopeStatus(s) ? (s as (typeof SCOPE_STATUSES)[number]) : null;
}

/**
 * The lifecycle stage for a status. Lifecycle values map to themselves; the two
 * scope values map to active as implied-live, matching governanceChecks.
 */
export function lifecycleOf(
  s: AssetStatus,
): (typeof LIFECYCLE_STATUSES)[number] {
  return isScopeStatus(s) ? "active" : (s as (typeof LIFECYCLE_STATUSES)[number]);
}
