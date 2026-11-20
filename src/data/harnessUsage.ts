import demoSnapshot from "./imports/harness-usage.json";
import type { DateWindow } from "./metrics";
import type { HarnessUsage, HarnessUsageSnapshot } from "./types";

/**
 * Per-harness usage summaries the UI reads. The committed harness-usage.json is a
 * synthetic demo. Real summaries produced by scripts/vault-harness-usage.mjs (and
 * merged across the owner's machines by scripts/merge-telemetry.mjs) are written to
 * a gitignored harness-usage.local.json. Read through getHarnessUsage on the
 * DataSource. See docs/PRIVACY.md.
 *
 * The local file is bundled in exactly two cases:
 *   - the DEV server (npx vite), for the owner's local loop; and
 *   - VITE_REAL_HARNESS=true, which ONLY build:fabric sets. The Fabric app is the
 *     owner's own SSO-gated deployment, so it shows real usage; harness usage is not
 *     a Fabric table (getHarnessUsage returns this bundled snapshot), so baking it in
 *     is the only way it reaches that app.
 *
 * build:swa never sets the flag, so the public demo keeps the synthetic snapshot and
 * real usage never ships. That is enforced, not merely intended:
 * scripts/guards/local-telemetry-guard.mjs fails the SWA build if any fingerprint of
 * the local snapshot appears in dist/.
 *
 * Both conditions fold to a literal at build time (Vite statically replaces
 * import.meta.env.*), so in a public build the branch is dead and the local file is
 * tree-shaken out entirely rather than being bundled and merely unused. The typeof
 * guard keeps the module Node-safe for tsx tooling (e.g. through RayfinDataSource),
 * and excluding MODE 'test' keeps Vitest on the committed demo snapshot, so tests
 * pass identically whether or not the gitignored local file exists on the machine.
 */
const useLocalSnapshot =
  typeof import.meta.env !== "undefined" &&
  ((import.meta.env.DEV && import.meta.env.MODE !== "test") ||
    import.meta.env.VITE_REAL_HARNESS === "true");

const localModules = (
  useLocalSnapshot
    ? import.meta.glob("./imports/harness-usage.local.json", { eager: true })
    : {}
) as Record<string, { default: HarnessUsageSnapshot }>;

const localSnapshot = Object.values(localModules)[0]?.default;

export const harnessUsageSnapshot: HarnessUsageSnapshot =
  localSnapshot ?? (demoSnapshot as unknown as HarnessUsageSnapshot);

/** Min and max date across every harness's daily rows, for the time-range control. */
export function harnessDateBounds(): DateWindow | null {
  let start: string | null = null;
  let end: string | null = null;
  for (const source of harnessUsageSnapshot.sources) {
    for (const day of source.daily ?? []) {
      if (start === null || day.date < start) start = day.date;
      if (end === null || day.date > end) end = day.date;
    }
  }
  return start !== null && end !== null ? { start, end } : null;
}

/**
 * Re-aggregate one harness over a date window from its daily rows. A source with
 * no daily breakdown keeps its all-time totals (windowing is a no-op for it).
 * Per-skill loads are filtered to the same window.
 */
export function windowedSource(source: HarnessUsage, window: DateWindow): HarnessUsage {
  const daily = source.daily ?? [];
  if (!daily.length) return source;
  const days = daily.filter(
    (day) => day.date >= window.start && day.date <= window.end,
  );
  let invocations = 0;
  let successes = 0;
  let errors = 0;
  let tokens = 0;
  let sessions = 0;
  let latSum = 0;
  let latN = 0;
  let from: string | null = null;
  let to: string | null = null;
  for (const day of days) {
    invocations += day.invocations;
    successes += day.successes;
    errors += day.errors;
    tokens += day.tokens;
    sessions += day.sessions;
    if (day.latencyMs > 0) {
      latSum += day.latencyMs;
      latN += 1;
    }
    if (from === null || day.date < from) from = day.date;
    if (to === null || day.date > to) to = day.date;
  }
  return {
    ...source,
    sessions,
    invocations,
    successes,
    errors,
    tokens,
    latencyMs: latN ? Math.round(latSum / latN) : 0,
    windowStart: from,
    windowEnd: to,
    ...(source.skillUses
      ? {
          skillUses: source.skillUses.filter(
            (row) => row.date >= window.start && row.date <= window.end,
          ),
        }
      : {}),
  };
}

/**
 * Per-harness usage aggregated over the active window (or all-time when the
 * window is null), ranked by invocations. Pure: never mutates the snapshot.
 */
export function getWindowedHarnessUsage(
  window?: DateWindow | null,
): HarnessUsage[] {
  const sources = window
    ? harnessUsageSnapshot.sources.map((source) => windowedSource(source, window))
    : harnessUsageSnapshot.sources;
  return [...sources].sort((a, b) => b.invocations - a.invocations);
}
