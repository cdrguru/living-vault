import type { HarnessUsage } from "@/data";

/**
 * Shared honesty-flag helpers for the harness summary strip and the full usage
 * panel, so both read each harness's grain the same way. Pure functions only, so
 * there is no coupling between the two components beyond this small contract.
 */

/**
 * A success rate is honest only when successes are fully measured or derived from
 * real counts (calls minus failures). When only failures are detectable
 * ("partial"), callers should show the error count instead of a rate.
 */
export function reliabilityIsFull(usage: HarnessUsage): boolean {
  return (
    usage.tracked.successes === "full" || usage.tracked.successes === "derived"
  );
}

export function successRateOf(usage: HarnessUsage): number {
  return usage.invocations ? usage.successes / usage.invocations : 0;
}

/** The token honesty caption, or null when tokens are tracked in full. */
export function tokenFlag(usage: HarnessUsage): string | null {
  switch (usage.tracked.tokens) {
    case "occupancy":
      return "occupancy";
    case "partial":
      return "partial";
    case "none":
      return "not tracked";
    default:
      return null;
  }
}

export function formatLatencyMs(ms: number): string {
  if (!ms) return "-";
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`;
}
