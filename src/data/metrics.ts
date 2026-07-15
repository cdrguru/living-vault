import type {
  AssetRow,
  BundleRow,
  EvalResultRow,
  HarnessMetricQuality,
  OriginRow,
  TagRow,
  UtilizationRow,
  VaultDataset,
} from "./types";
import { hasOnlyProbeTelemetry } from "./telemetryProbe";

export type Quadrant = "Stars" | "Risks" | "Shelfware" | "Dead weight";

/**
 * Governed/Effective quadrant thresholds for the LEGACY scatter plot only. They
 * are scatter-plot geometry, not the primary effectiveness classification: a
 * bubble's plotted position always lands in the same half-plane its quadrant
 * implies (governed >= 0.8 on x, effective on y). The defensible primary scoring
 * is the AES + Evidence Confidence model below (scoreAssetDetailed), which uses
 * no fixed 0.6/0.8 cut points. Keep these for the scatter; do not reintroduce
 * them as classification logic.
 */
export const GOVERNED_THRESHOLD = 0.8;
/** Calibrated cut on the multi-signal composite (was the volume-times-quality cut). */
export const EFFECTIVE_THRESHOLD = 0.6;
/** Invocations that saturate the adoption signal. */
export const ADOPTION_TARGET = 500;
/** Invocations below which evidence is insufficient to classify an asset. */
export const MIN_SAMPLE = 20;
/** Invocations at or above which the sample supports a high confidence grade. */
export const HIGH_SAMPLE = 120;

export interface UsageSummary {
  assetId: string;
  invocations: number;
  successes: number;
  errors: number;
  refusals: number;
  tokens: number;
  cost: number;
  successRate: number;
  latencyMs: number;
  activeDays: number;
}

export interface AssetScore {
  asset: AssetRow;
  governedScore: number;
  effectiveScore: number | null;
  governed: boolean;
  effective: boolean;
  quadrant: Quadrant;
  usage: UsageSummary;
  stale: boolean;
  confidence: ConfidenceGrade;
  evidenceSufficient: boolean;
  signals: SignalScore[];
}

export type ConfidenceGrade = "high" | "moderate" | "low" | "none";
export type EffectivenessSignalId = "quality" | "adoption" | "retention";

export interface SignalScore {
  id: EffectivenessSignalId;
  present: boolean;
  value: number; // 0..1; meaningless when present is false
  weight: number; // nominal weight before renormalization
}

/**
 * The effectiveness signals for one asset's windowed usage. quality is the
 * highest weight (hardest to game), adoption the lowest (raw volume is gameable),
 * retention only present when the window spans at least two days so a single-day
 * window does not penalize an asset for a signal that cannot be measured.
 */
export function effectivenessSignals(
  usage: UsageSummary,
  windowDays: number,
): SignalScore[] {
  const hasUsage = usage.invocations > 0;
  const retentionPresent = hasUsage && windowDays >= 2;
  return [
    { id: "quality", present: hasUsage, value: usage.successRate, weight: 0.5 },
    {
      id: "adoption",
      present: hasUsage,
      value: Math.min(usage.invocations / ADOPTION_TARGET, 1),
      weight: 0.2,
    },
    {
      id: "retention",
      present: retentionPresent,
      value: retentionPresent ? Math.min(usage.activeDays / windowDays, 1) : 0,
      weight: 0.3,
    },
  ];
}

/**
 * Weighted mean over the present signals, with weights renormalized over only
 * those present so an absent signal has zero influence and is never imputed as 0.
 * Returns null when nothing is present, which the caller treats as "insufficient
 * evidence", not a real zero.
 */
export function composeEffectiveScore(signals: SignalScore[]): number | null {
  const present = signals.filter((signal) => signal.present);
  if (present.length === 0) return null;
  const weighted = present.reduce((sum, s) => sum + s.weight * s.value, 0);
  const weightSum = present.reduce((sum, s) => sum + s.weight, 0);
  return weightSum === 0 ? null : weighted / weightSum;
}

/** The honesty grade of the effectiveness data path. v1 rides the Claude Code
 *  telemetry path, which is fully instrumented ("full"). Wired in so a future
 *  derived source downgrades the confidence automatically. */
export const EFFECTIVENESS_SOURCE_QUALITY: HarnessMetricQuality = "full";

const GRADE_ORDER: ConfidenceGrade[] = ["none", "low", "moderate", "high"];

const minGrade = (a: ConfidenceGrade, b: ConfidenceGrade): ConfidenceGrade =>
  GRADE_ORDER.indexOf(a) <= GRADE_ORDER.indexOf(b) ? a : b;

const sourceTier = (quality: HarnessMetricQuality): ConfidenceGrade => {
  switch (quality) {
    case "full":
      return "high";
    case "partial":
      return "moderate";
    case "occupancy":
    case "derived":
    // falls through: cache-aware refinement shares estimate-tier provenance
    case "modeled":
      return "low";
    case "none":
      return "none";
  }
};

const sampleGrade = (invocations: number): ConfidenceGrade => {
  if (invocations >= HIGH_SAMPLE) return "high";
  if (invocations >= MIN_SAMPLE) return "moderate";
  if (invocations > 0) return "low";
  return "none";
};

/**
 * The per-asset confidence grade and whether the evidence is sufficient to
 * classify. confidence is the lower of the source tier and the sample grade, or
 * "none" when the high-weight quality signal is absent (zero invocations).
 * Evidence is sufficient at moderate or above.
 */
export function gradeConfidence(
  usage: UsageSummary,
  signals: SignalScore[],
  sourceQuality: HarnessMetricQuality = EFFECTIVENESS_SOURCE_QUALITY,
): { confidence: ConfidenceGrade; evidenceSufficient: boolean } {
  const qualityPresent = signals.some(
    (signal) => signal.id === "quality" && signal.present,
  );
  const confidence: ConfidenceGrade = qualityPresent
    ? minGrade(sourceTier(sourceQuality), sampleGrade(usage.invocations))
    : "none";
  return {
    confidence,
    evidenceSufficient: confidence === "moderate" || confidence === "high",
  };
}

const emptyUsage = (assetId: string): UsageSummary => ({
  assetId,
  invocations: 0,
  successes: 0,
  errors: 0,
  refusals: 0,
  tokens: 0,
  cost: 0,
  successRate: 0,
  latencyMs: 0,
  activeDays: 0,
});

/** An inclusive date window over `UtilizationRow.date` (ISO `YYYY-MM-DD`). */
export interface DateWindow {
  start: string;
  end: string;
}

export const inWindow = (date: string, window?: DateWindow): boolean =>
  !window || (date >= window.start && date <= window.end);

/**
 * Usage summary per asset, restricted to an optional date window. With no window
 * this is the full-history summary; `utilizationByAsset` is the unwindowed form.
 */
export function utilizationByAssetWindowed(
  dataset: VaultDataset,
  window?: DateWindow,
): Map<string, UsageSummary> {
  const grouped = new Map<string, UtilizationRow[]>();
  for (const row of dataset.utilization) {
    if (!inWindow(row.date, window)) continue;
    grouped.set(row.assetId, [...(grouped.get(row.assetId) ?? []), row]);
  }
  const summaries = new Map<string, UsageSummary>();
  for (const [assetId, rows] of grouped.entries()) {
    const invocations = rows.reduce((sum, row) => sum + row.invocations, 0);
    const successes = rows.reduce((sum, row) => sum + row.successes, 0);
    const latencyTotal = rows.reduce(
      (sum, row) => sum + row.latencyMs * row.invocations,
      0,
    );
    summaries.set(assetId, {
      assetId,
      invocations,
      successes,
      errors: rows.reduce((sum, row) => sum + row.errors, 0),
      refusals: rows.reduce((sum, row) => sum + row.refusals, 0),
      tokens: rows.reduce((sum, row) => sum + row.tokens, 0),
      cost: rows.reduce((sum, row) => sum + row.cost, 0),
      successRate: invocations ? successes / invocations : 0,
      latencyMs: invocations ? latencyTotal / invocations : 0,
      activeDays: new Set(
        rows.filter((row) => row.invocations > 0).map((row) => row.date),
      ).size,
    });
  }
  return summaries;
}

/** Full-history usage summary per asset. */
export function utilizationByAsset(
  dataset: VaultDataset,
): Map<string, UsageSummary> {
  return utilizationByAssetWindowed(dataset);
}

/** One model's rolled-up usage across the dataset, for the by-model breakdown. */
export interface ModelUsage {
  model: string;
  invocations: number;
  successes: number;
  errors: number;
  successRate: number;
  latencyMs: number;
}

/**
 * Usage rolled up by model over an optional window, ordered by invocations then
 * model id. The model set is derived from distinct UtilizationRow.model values (a
 * missing model reads "unknown"); no Model lookup entity is required. Latency is the
 * invocation-weighted mean, matching utilizationByAssetWindowed.
 */
export function usageByModel(
  dataset: VaultDataset,
  window?: DateWindow,
): ModelUsage[] {
  const byModel = new Map<
    string,
    {
      invocations: number;
      successes: number;
      errors: number;
      latencyTotal: number;
    }
  >();
  for (const row of dataset.utilization) {
    if (!inWindow(row.date, window)) continue;
    const model = row.model ?? "unknown";
    const acc = byModel.get(model) ?? {
      invocations: 0,
      successes: 0,
      errors: 0,
      latencyTotal: 0,
    };
    acc.invocations += row.invocations;
    acc.successes += row.successes;
    acc.errors += row.errors;
    acc.latencyTotal += row.latencyMs * row.invocations;
    byModel.set(model, acc);
  }
  return [...byModel.entries()]
    .map(([model, acc]) => ({
      model,
      invocations: acc.invocations,
      successes: acc.successes,
      errors: acc.errors,
      successRate: acc.invocations ? acc.successes / acc.invocations : 0,
      latencyMs: acc.invocations ? acc.latencyTotal / acc.invocations : 0,
    }))
    .sort(
      (a, b) => b.invocations - a.invocations || a.model.localeCompare(b.model),
    );
}

/** Sorted unique dates present in the utilization table. Drives time scrubbing. */
export function utilizationDates(dataset: VaultDataset): string[] {
  return [...new Set(dataset.utilization.map((row) => row.date))].sort((a, b) =>
    a.localeCompare(b),
  );
}

/**
 * Number of days the scoring window spans. With an explicit window it is the
 * inclusive start-to-end day count; with none it is the span of the dataset's
 * utilization dates. Drives the retention signal's denominator. Returns 0 for an
 * empty or invalid window so retention is treated as unmeasurable.
 */
export function windowDaysOf(
  dataset: VaultDataset,
  window?: DateWindow,
): number {
  const span = (startIso: string, endIso: string): number => {
    const start = Date.parse(startIso);
    const end = Date.parse(endIso);
    if (Number.isNaN(start) || Number.isNaN(end) || end < start) return 0;
    return Math.round((end - start) / 86_400_000) + 1;
  };
  if (window) return span(window.start, window.end);
  const dates = utilizationDates(dataset);
  if (dates.length === 0) return 0;
  return span(dates[0], dates[dates.length - 1]);
}

/** A single date's utilization, summed across every asset. */
export interface DailyTotal {
  date: string;
  invocations: number;
  successes: number;
  errors: number;
  refusals: number;
  tokens: number;
  cost: number;
}

/**
 * Fleet-wide utilization rolled up to one ordered row per date (optionally within
 * a window). Drives the overview activity sparklines: every series the monitor
 * trends (invocations, success rate, spend) is a projection of this single pass.
 */
export function dailyTotals(
  dataset: VaultDataset,
  window?: DateWindow,
): DailyTotal[] {
  const byDate = new Map<string, DailyTotal>();
  for (const row of dataset.utilization) {
    if (!inWindow(row.date, window)) continue;
    const total = byDate.get(row.date) ?? {
      date: row.date,
      invocations: 0,
      successes: 0,
      errors: 0,
      refusals: 0,
      tokens: 0,
      cost: 0,
    };
    total.invocations += row.invocations;
    total.successes += row.successes;
    total.errors += row.errors;
    total.refusals += row.refusals;
    total.tokens += row.tokens;
    total.cost += row.cost;
    byDate.set(row.date, total);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Period-over-period change of a daily series: the sum of the trailing half
 * versus the prior equal-length half, as a signed fraction. Returns null when the
 * series is too short to split or the prior window summed to zero (no honest
 * ratio exists). On odd lengths the oldest point is dropped to keep the windows
 * equal.
 */
export function seriesDelta(values: number[]): number | null {
  const half = Math.floor(values.length / 2);
  if (half < 1) return null;
  const recent = values.slice(values.length - half);
  const prior = values.slice(values.length - 2 * half, values.length - half);
  const sum = (nums: number[]) =>
    nums.reduce((total, value) => total + value, 0);
  const priorSum = sum(prior);
  if (priorSum === 0) return null;
  return (sum(recent) - priorSum) / priorSum;
}

/**
 * Daily invocation counts for one asset over an optional window, ordered by date.
 * Drives card sparklines. Under the model grain an asset-day can have several rows
 * (one per model), so invocations are summed per date to one point. An asset with
 * no telemetry in the window yields [].
 */
export function dailySeries(
  dataset: VaultDataset,
  assetId: string,
  window?: DateWindow,
): number[] {
  const byDate = new Map<string, number>();
  for (const row of dataset.utilization) {
    if (row.assetId !== assetId || !inWindow(row.date, window)) continue;
    byDate.set(row.date, (byDate.get(row.date) ?? 0) + row.invocations);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([, invocations]) => invocations);
}

/** The id of one governance check. Stable so call sites can key off a single check. */
export type GovernanceCheckId =
  "description" | "tag" | "owner" | "status" | "origin" | "deps";

/**
 * One governance check with a human label and a pass flag. The checklist is the
 * source of truth for the governed score: scoreAsset rolls up `pass` so the
 * score and the explanation can never drift apart.
 */
export interface GovernanceCheck {
  id: GovernanceCheckId;
  label: string;
  pass: boolean;
}

/**
 * The six governance checks for one asset, in scoring order: a description, at
 * least one tag, an owner, a live status (not deprecated or retired), a recorded
 * origin, and dependencies that all resolve to live assets. scoreAsset consumes
 * this list so the rolled-up governed score equals the fraction that pass.
 */
export function governanceChecks(
  asset: AssetRow,
  dataset: VaultDataset,
): GovernanceCheck[] {
  const assetTagCount = dataset.assetTags.filter(
    (tag) => tag.assetId === asset.id,
  ).length;
  const dependencyIds = dataset.dependencies
    .filter((dependency) => dependency.assetId === asset.id)
    .map((dependency) => dependency.dependsOnAssetId);
  const assetIds = new Set(dataset.assets.map((row) => row.id));
  const depsResolve = dependencyIds.every((id) => {
    const target = dataset.assets.find((row) => row.id === id);
    return (
      assetIds.has(id) &&
      target?.status !== "deprecated" &&
      target?.status !== "retired"
    );
  });
  return [
    {
      id: "description",
      label: "Has a description",
      pass: Boolean(asset.description.trim()),
    },
    { id: "tag", label: "Has at least one tag", pass: assetTagCount > 0 },
    { id: "owner", label: "Has an owner", pass: Boolean(asset.ownerId) },
    {
      id: "status",
      label: "Status is live",
      pass: asset.status !== "deprecated" && asset.status !== "retired",
    },
    {
      id: "origin",
      label: "Has a recorded origin",
      pass: Boolean(asset.originId),
    },
    { id: "deps", label: "Dependencies all resolve", pass: depsResolve },
  ];
}

/**
 * Asset-level governance partition for the governed-vs-orphaned view. Every asset
 * lands in exactly one bucket, evaluated in precedence order so the buckets are
 * mutually exclusive and exhaustive:
 *  - orphaned: no owner. The headline at-risk bucket, regardless of other checks.
 *  - governed: owned and at or above GOVERNED_THRESHOLD on the governance checks.
 *  - ungoverned: owned but below the bar (governance gaps still to close).
 * Pure: reads assets plus the same governanceChecks the score uses, so for owned
 * assets the partition can never disagree with scoreAsset's governed flag.
 */
export interface GovernancePartition {
  governed: AssetRow[];
  orphaned: AssetRow[];
  ungoverned: AssetRow[];
}

export function partitionGovernance(
  dataset: VaultDataset,
): GovernancePartition {
  const governed: AssetRow[] = [];
  const orphaned: AssetRow[] = [];
  const ungoverned: AssetRow[] = [];
  for (const asset of dataset.assets) {
    if (!asset.ownerId) {
      orphaned.push(asset);
      continue;
    }
    const checks = governanceChecks(asset, dataset);
    const score = checks.filter((check) => check.pass).length / checks.length;
    if (score >= GOVERNED_THRESHOLD) governed.push(asset);
    else ungoverned.push(asset);
  }
  return { governed, orphaned, ungoverned };
}

/**
 * Usage rolled up to the upstream origin (library repo, url, plugin, ...) each
 * asset came from, so utilization can be traced to its source. Assets whose
 * originId is missing or dangles bucket under `origin: null` (ungoverned/local).
 * Sorted by invocations descending, then origin name, so the busiest upstream
 * leads. Pure: joins utilizationByAsset over asset.originId into origins.
 */
export interface OriginUsage {
  origin: OriginRow | null;
  assetCount: number;
  invocations: number;
  successes: number;
  errors: number;
  tokens: number;
  cost: number;
  assetIds: string[];
}

export function utilizationByOrigin(dataset: VaultDataset): OriginUsage[] {
  const usage = utilizationByAsset(dataset);
  const originById = new Map(dataset.origins.map((row) => [row.id, row]));
  const buckets = new Map<string, OriginUsage>();
  // Sentinel bucket key for assets with no (or a dangling) origin. Must never
  // collide with a real origin id; ids are uuid/slug strings, which never
  // carry this bracketed form.
  const NONE = "[no-origin]";
  for (const asset of dataset.assets) {
    const origin = (asset.originId && originById.get(asset.originId)) || null;
    const key = origin ? origin.id : NONE;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        origin,
        assetCount: 0,
        invocations: 0,
        successes: 0,
        errors: 0,
        tokens: 0,
        cost: 0,
        assetIds: [],
      };
      buckets.set(key, bucket);
    }
    bucket.assetCount += 1;
    bucket.assetIds.push(asset.id);
    const used = usage.get(asset.id);
    if (used) {
      bucket.invocations += used.invocations;
      bucket.successes += used.successes;
      bucket.errors += used.errors;
      bucket.tokens += used.tokens;
      bucket.cost += used.cost;
    }
  }
  return [...buckets.values()].sort(
    (a, b) =>
      b.invocations - a.invocations ||
      (a.origin?.name ?? "").localeCompare(b.origin?.name ?? ""),
  );
}

export function scoreAsset(
  asset: AssetRow,
  dataset: VaultDataset,
  usage = utilizationByAsset(dataset),
  windowDays = windowDaysOf(dataset),
): AssetScore {
  const checks = governanceChecks(asset, dataset);
  const governedScore =
    checks.filter((check) => check.pass).length / checks.length;
  const currentUsage = usage.get(asset.id) ?? emptyUsage(asset.id);
  const signals = effectivenessSignals(currentUsage, windowDays);
  const effectiveScore = composeEffectiveScore(signals);
  const { confidence, evidenceSufficient } = gradeConfidence(
    currentUsage,
    signals,
  );
  const governed = governedScore >= GOVERNED_THRESHOLD;
  // Derive effective from the same effectiveScore the UI shows, so the quadrant
  // label can never disagree with the displayed score, and gate it on sufficient
  // evidence: an asset with too little telemetry (effectiveScore null, or below the
  // evidence floor) is never classified effective. It reads as insufficient evidence.
  const effective =
    evidenceSufficient &&
    effectiveScore !== null &&
    effectiveScore >= EFFECTIVE_THRESHOLD;
  const quadrant: Quadrant = governed
    ? effective
      ? "Stars"
      : "Shelfware"
    : effective
      ? "Risks"
      : "Dead weight";
  const updatedAt = new Date(asset.updatedAt).getTime();
  const stale = Date.UTC(2026, 5, 5) - updatedAt > 180 * 86_400_000;
  return {
    asset,
    governedScore,
    effectiveScore,
    governed,
    effective,
    quadrant,
    usage: currentUsage,
    stale,
    confidence,
    evidenceSufficient,
    signals,
  };
}

/**
 * Plot coordinates for the Governed x Effective scatter, derived from a score so
 * the bubble position and the quadrant color can never disagree. plotX/plotY are
 * clamped into the half-plane the boolean governed/effective imply (>= 80 / >= 60
 * when true, <= 79 / <= 59 when false), so a Shelfware bubble (governed) always
 * plots right of the governed line and a Dead-weight bubble always plots left.
 * These are presentation coordinates only, not the raw scores.
 */
export function classifyAsset(score: AssetScore): {
  quadrant: Quadrant;
  plotX: number;
  plotY: number;
} {
  const gx = Math.round(score.governedScore * 100);
  const ey = Math.round((score.effectiveScore ?? 0) * 100);
  const gThreshold = GOVERNED_THRESHOLD * 100;
  const eThreshold = EFFECTIVE_THRESHOLD * 100;
  return {
    quadrant: score.quadrant,
    plotX: score.governed
      ? Math.max(gThreshold, gx)
      : Math.min(gThreshold - 1, gx),
    plotY: score.effective
      ? Math.max(eThreshold, ey)
      : Math.min(eThreshold - 1, ey),
  };
}

export function scoreAssets(
  dataset: VaultDataset,
  window?: DateWindow,
): AssetScore[] {
  const usage = utilizationByAssetWindowed(dataset, window);
  const windowDays = windowDaysOf(dataset, window);
  return dataset.assets.map((asset) =>
    scoreAsset(asset, dataset, usage, windowDays),
  );
}

export function effectiveAssetRate(
  dataset: VaultDataset,
  window?: DateWindow,
): number {
  const scored = scoreAssets(dataset, window).filter(
    (score) => score.evidenceSufficient,
  );
  if (scored.length === 0) return 0;
  const stars = scored.filter((score) => score.quadrant === "Stars").length;
  return stars / scored.length;
}

/** How many assets have sufficient evidence to be classified, out of the total. */
export function evidenceCoverage(
  dataset: VaultDataset,
  window?: DateWindow,
): { scored: number; total: number } {
  const all = scoreAssets(dataset, window);
  return {
    scored: all.filter((score) => score.evidenceSufficient).length,
    total: all.length,
  };
}

/** Quadrant counts over sufficient-evidence assets, plus an insufficient count. */
export function classificationCounts(
  dataset: VaultDataset,
  window?: DateWindow,
): Record<Quadrant, number> & { insufficientEvidence: number } {
  const all = scoreAssets(dataset, window);
  const counts = {
    Stars: 0,
    Risks: 0,
    Shelfware: 0,
    "Dead weight": 0,
    insufficientEvidence: 0,
  } as Record<Quadrant, number> & { insufficientEvidence: number };
  for (const score of all) {
    if (score.evidenceSufficient) counts[score.quadrant] += 1;
    else counts.insufficientEvidence += 1;
  }
  return counts;
}

export function duplicateClusters(dataset: VaultDataset): AssetRow[][] {
  const groups = new Map<string, AssetRow[]>();
  for (const asset of dataset.assets) {
    groups.set(asset.contentHash, [
      ...(groups.get(asset.contentHash) ?? []),
      asset,
    ]);
  }
  return [...groups.values()].filter((assets) => assets.length > 1);
}

export function staleAssets(
  dataset: VaultDataset,
  window?: DateWindow,
): AssetScore[] {
  return scoreAssets(dataset, window).filter((score) => score.stale);
}

export function totalCost(dataset: VaultDataset, window?: DateWindow): number {
  return dataset.utilization.reduce(
    (sum, row) => (inWindow(row.date, window) ? sum + row.cost : sum),
    0,
  );
}

/**
 * Split a single real spend pool across scored assets in proportion to each
 * asset's invocation count, returning a per-asset cost map. This is the basis
 * for the Cost page's asset-level view once live telemetry (which carries no
 * per-asset cost) is loaded: the real harness token spend is the pool, and
 * invocation share is the proxy for how it is distributed. An asset with no
 * invocations gets zero, and when nothing was invoked the whole pool allocates
 * to zero rather than dividing by zero. Pure: reads the scores only. The shares
 * conserve the pool (they sum back to `totalSpend`) whenever any invocations
 * exist, so it is an allocation, never an inflation.
 */
export function allocateSpendByInvocations(
  scored: AssetScore[],
  totalSpend: number,
): Map<string, number> {
  const totalInvocations = scored.reduce(
    (sum, score) => sum + score.usage.invocations,
    0,
  );
  const allocated = new Map<string, number>();
  for (const score of scored) {
    allocated.set(
      score.asset.id,
      totalInvocations > 0
        ? (score.usage.invocations / totalInvocations) * totalSpend
        : 0,
    );
  }
  return allocated;
}

/**
 * Spend aggregated by asset type through the caller's cost basis (modeled
 * per-asset utilization cost, or a harness pool allocated by invocation
 * share), shaped for the spend chart: rounded to cents, free types dropped,
 * sorted worst-first.
 */
export function costByType(
  scored: AssetScore[],
  costOf: (assetId: string) => number,
): { type: AssetRow["type"]; cost: number }[] {
  const types = new Map<AssetRow["type"], number>();
  for (const score of scored) {
    types.set(
      score.asset.type,
      (types.get(score.asset.type) ?? 0) + costOf(score.asset.id),
    );
  }
  return [...types.entries()]
    .map(([type, cost]) => ({ type, cost: Number(cost.toFixed(2)) }))
    .filter((row) => row.cost > 0)
    .sort((a, b) => b.cost - a.cost);
}

/**
 * One costly-but-ineffective asset: cost is being spent on it yet it is not
 * judged effective (its quadrant is Shelfware or Dead weight). This surfaces
 * the worst cost-without-effectiveness so the user knows what to cut first.
 */
export interface WastedSpendRow {
  asset: AssetRow;
  quadrant: Quadrant;
  cost: number;
  invocations: number;
  successRate: number;
}

/**
 * Assets that still cost money while failing the effectiveness bar, ranked by
 * cost worst-first so the most expensive dead weight or shelfware leads. Cost
 * is priced through the caller's basis (modeled per-asset utilization cost, or
 * a harness pool allocated by invocation share), so inclusion follows the
 * basis: only assets with positive cost are listed (a free asset wastes no
 * spend), and only ineffective ones (Stars and Risks earn their spend). Ties
 * on cost break by name so the order is deterministic across renders.
 */
export function wastedSpendAssets(
  scored: AssetScore[],
  costOf: (assetId: string) => number,
): WastedSpendRow[] {
  return scored
    .filter((score) => !score.effective && costOf(score.asset.id) > 0)
    .map((score) => ({
      asset: score.asset,
      quadrant: score.quadrant,
      cost: costOf(score.asset.id),
      invocations: score.usage.invocations,
      successRate: score.usage.successRate,
    }))
    .sort(
      (a, b) => b.cost - a.cost || a.asset.name.localeCompare(b.asset.name),
    );
}

export function coverageMatrix(dataset: VaultDataset): {
  pillars: TagRow[];
  capabilities: TagRow[];
  cells: {
    pillar: string;
    capability: string;
    count: number;
    maturity: number;
  }[];
} {
  const pillars = dataset.tags.filter((tag) => tag.kind === "pillar");
  const capabilities = dataset.tags.filter((tag) => tag.kind === "capability");
  const tagsByAsset = new Map<string, Set<string>>();
  for (const row of dataset.assetTags) {
    tagsByAsset.set(
      row.assetId,
      new Set([...(tagsByAsset.get(row.assetId) ?? []), row.tagId]),
    );
  }
  const cells = pillars.flatMap((pillar) =>
    capabilities.map((capability) => {
      const matching = dataset.assets.filter((asset) => {
        const tags = tagsByAsset.get(asset.id);
        return tags?.has(pillar.id) && tags.has(capability.id);
      });
      return {
        pillar: pillar.name,
        capability: capability.name,
        count: matching.length,
        maturity: matching.length
          ? matching.reduce((sum, asset) => sum + asset.maturity, 0) /
            matching.length
          : 0,
      };
    }),
  );
  return { pillars, capabilities, cells };
}

/** An asset's outbound (requires) and inbound (required-by) dependency edges, resolved to rows. */
export function dependenciesOf(
  dataset: VaultDataset,
  assetId: string,
): { requires: AssetRow[]; requiredBy: AssetRow[] } {
  const byId = new Map(dataset.assets.map((asset) => [asset.id, asset]));
  const resolve = (id: string): AssetRow[] => {
    const asset = byId.get(id);
    return asset ? [asset] : [];
  };
  const requires = dataset.dependencies
    .filter((edge) => edge.assetId === assetId)
    .flatMap((edge) => resolve(edge.dependsOnAssetId));
  const requiredBy = dataset.dependencies
    .filter((edge) => edge.dependsOnAssetId === assetId)
    .flatMap((edge) => resolve(edge.assetId));
  return { requires, requiredBy };
}

/** The bundles an asset is a member of. */
export function bundlesOf(dataset: VaultDataset, assetId: string): BundleRow[] {
  const bundleIds = new Set(
    dataset.bundleMemberships
      .filter((row) => row.assetId === assetId)
      .map((row) => row.bundleId),
  );
  return dataset.bundles.filter((bundle) => bundleIds.has(bundle.id));
}

/**
 * An AssetScore widened with the derived booleans the Monitor, badges, and the
 * inspector all read so state is computed once. `duplicate` means the content
 * hash is shared by another asset, `orphan` means no owner, `fragileDeps` means
 * at least one required asset is deprecated or retired, and `hasTelemetry`
 * distinguishes a measured zero from no usage data at all.
 */
export interface AssetSignal extends AssetScore {
  duplicate: boolean;
  orphan: boolean;
  fragileDeps: boolean;
  hasTelemetry: boolean;
}

/**
 * The full operational signal for one asset. Reuses scoreAsset, duplicateClusters,
 * and dependenciesOf so no new traversal is invented. Returns null when the id is
 * not in the dataset.
 */
export function assetSignal(
  dataset: VaultDataset,
  assetId: string,
): AssetSignal | null {
  const asset = dataset.assets.find((row) => row.id === assetId);
  if (!asset) return null;
  const score = scoreAsset(asset, dataset);
  const duplicate = duplicateClusters(dataset).some((group) =>
    group.some((member) => member.id === assetId),
  );
  const orphan = !asset.ownerId;
  const { requires } = dependenciesOf(dataset, assetId);
  const fragileDeps = requires.some(
    (target) => target.status === "deprecated" || target.status === "retired",
  );
  const hasTelemetry = score.usage.invocations > 0;
  return { ...score, duplicate, orphan, fragileDeps, hasTelemetry };
}

/**
 * A one-line plain-English reason an asset is not a Star, derived from the same
 * score the UI shows so the caption can never disagree with the badge. Returns
 * null for Stars (no gap to explain). Assets with too little telemetry read as
 * insufficient evidence; ungoverned assets name their failing governance checks;
 * governed-but-ineffective assets show the effective score against the bar, broken
 * down into the present signals. Pure: reads the score and dataset only.
 */
export function classificationReasonFromScore(
  score: AssetScore,
  dataset: VaultDataset,
): string | null {
  const pct = (v: number) => Math.round(v * 100) + "%";
  if (!score.evidenceSufficient) {
    const n = score.usage.invocations;
    return (
      "Insufficient evidence to score: " +
      n +
      " invocation" +
      (n === 1 ? "" : "s") +
      ", " +
      MIN_SAMPLE +
      " needed."
    );
  }
  if (score.quadrant === "Stars") return null;
  if (!score.governed) {
    const failed = governanceChecks(score.asset, dataset).filter(
      (c) => !c.pass,
    );
    if (failed.length === 0) return "Below the governed bar.";
    return (
      "Ungoverned: " + failed.map((c) => c.label.toLowerCase()).join(", ") + "."
    );
  }
  const breakdown = score.signals
    .filter((s) => s.present)
    .map((s) => s.id + " " + pct(s.value))
    .join(", ");
  return (
    "Effective score " +
    pct(score.effectiveScore ?? 0) +
    " is below the " +
    pct(EFFECTIVE_THRESHOLD) +
    " bar: " +
    breakdown +
    "."
  );
}

/** Same reason from a full AssetSignal; delegates to classificationReasonFromScore. */
export function classificationReason(
  signal: AssetSignal,
  dataset: VaultDataset,
): string | null {
  return classificationReasonFromScore(signal, dataset);
}

/** What kind of attention an asset needs, ranked highest concern first. */
export type RecommendedActionKind =
  | "risk"
  | "regressing"
  | "fragile-deps"
  | "duplicate"
  | "shelfware"
  | "orphan"
  | "stale"
  | "governance";

/** How loud the recommendation reads. Drives badge tone and queue ordering. */
export type ActionSeverity = "high" | "medium" | "low";

/**
 * One read-only recommendation: the asset to look at, how urgent it is, what
 * kind of gap it is, a short label, and the failing governance check id when
 * the recommendation is a governance gap. This is advice, never a mutation.
 */
export interface RecommendedAction {
  assetId: string;
  asset: AssetRow;
  severity: ActionSeverity;
  kind: RecommendedActionKind;
  label: string;
  check?: GovernanceCheckId;
}

const SEVERITY_RANK: Record<ActionSeverity, number> = {
  high: 3,
  medium: 2,
  low: 1,
};
const KIND_RANK: Record<RecommendedActionKind, number> = {
  risk: 8,
  regressing: 7,
  "fragile-deps": 6,
  duplicate: 5,
  shelfware: 4,
  orphan: 3,
  stale: 2,
  governance: 1,
};

/**
 * The ranked what-to-fix-next list across the whole dataset. Risks (used but
 * ungoverned) outrank fragile dependency edges, which outrank duplicates, which
 * outrank Shelfware, then unowned-but-active assets, then stale, then the
 * remaining governance gaps. Each asset contributes its single most urgent
 * recommendation. The result is sorted by severity then kind, never alphabetical,
 * with a stable name tie-break only so equal-rank rows render deterministically.
 */
export function recommendedActions(dataset: VaultDataset): RecommendedAction[] {
  const actions: RecommendedAction[] = [];
  // Computed once over full history: the assets whose effectiveness is
  // declining on trustworthy evidence. A confirmed regression ranks just below
  // a used-but-ungoverned risk and above a fragile dependency.
  const regressingIds = new Set(
    regressingAssets(dataset).map((trend) => trend.assetId),
  );
  for (const asset of dataset.assets) {
    const signal = assetSignal(dataset, asset.id);
    if (!signal) continue;
    const active = asset.status !== "deprecated" && asset.status !== "retired";
    let action: RecommendedAction | null = null;

    if (signal.quadrant === "Risks") {
      action = {
        assetId: asset.id,
        asset,
        severity: "high",
        kind: "risk",
        label: "Used but ungoverned",
      };
    } else if (regressingIds.has(asset.id) && active) {
      action = {
        assetId: asset.id,
        asset,
        severity: "high",
        kind: "regressing",
        label: "Effectiveness is declining",
      };
    } else if (signal.fragileDeps && active) {
      action = {
        assetId: asset.id,
        asset,
        severity: "high",
        kind: "fragile-deps",
        label: "Depends on a deprecated or retired asset",
        check: "deps",
      };
    } else if (signal.duplicate) {
      action = {
        assetId: asset.id,
        asset,
        severity: "medium",
        kind: "duplicate",
        label: "Duplicate content hash",
      };
    } else if (signal.quadrant === "Shelfware") {
      action = {
        assetId: asset.id,
        asset,
        severity: "medium",
        kind: "shelfware",
        label: "Governed but not effective",
      };
    } else if (signal.orphan && active) {
      action = {
        assetId: asset.id,
        asset,
        severity: "medium",
        kind: "orphan",
        label: "Active asset with no owner",
        check: "owner",
      };
    } else if (signal.stale) {
      action = {
        assetId: asset.id,
        asset,
        severity: "low",
        kind: "stale",
        label: "Not updated in over six months",
      };
    } else if (!signal.governed) {
      const failing = governanceChecks(asset, dataset).find(
        (check) => !check.pass,
      );
      action = {
        assetId: asset.id,
        asset,
        severity: "low",
        kind: "governance",
        label: failing
          ? `Governance gap: ${failing.label.toLowerCase()}`
          : "Below governed bar",
        check: failing?.id,
      };
    }

    if (action) actions.push(action);
  }

  return actions.sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    if (bySeverity !== 0) return bySeverity;
    const byKind = KIND_RANK[b.kind] - KIND_RANK[a.kind];
    if (byKind !== 0) return byKind;
    return a.asset.name.localeCompare(b.asset.name);
  });
}

// ===========================================================================
// Asset Effectiveness Score (AES) + Evidence Confidence Grade (ECG)
//
// The defensible, primary effectiveness model. It replaces the naked-threshold
// classification (effective >= 0.6 / governed >= 0.8) with two separately
// reported quantities:
//
//   1. Asset Effectiveness Score (AES) - HOW well an asset performs. A
//      multi-signal composite, Bayesian-adjusted so a tiny perfect record does
//      not read as a perfect asset. When paired baseline/treatment evaluation
//      data exists, counterfactual normalized gain (the SkillsBench-style
//      measure of marginal lift) dominates the score.
//   2. Evidence Confidence Grade (ECG) - HOW MUCH we should trust that score,
//      derived from measurement fidelity, signal coverage, and sample size.
//
// Core rules: missing signals are NEVER scored as zero (missing means unknown
// and is excluded from the weighted average); confidence is always reported
// separately from effectiveness; and the final tier is gated by confidence, so
// a high point estimate on thin evidence cannot earn a quality label.
// ===========================================================================

/** How honestly an asset's measured signals are captured. Mirrors HarnessMetricQuality. */
export type HonestyGrade =
  "full" | "partial" | "occupancy" | "derived" | "none";

/** Letter grade for how much to trust an asset's effectiveness score. */
export type EvidenceConfidenceGrade = "A" | "B" | "C" | "D" | "E";

/** The effectiveness tier an asset earns, gated by its evidence confidence. */
export type EffectivenessTier =
  "exceptional" | "strong" | "average" | "weak" | "insufficient-evidence";

/**
 * The full two-part score for one asset: the effectiveness point estimate, the
 * confidence in it (numeric and graded), the resulting tier, and the audit
 * trail (which signals were observed and their normalized scores). signalScores
 * carries null for any signal with no data, never a coerced zero.
 */
export interface AssetScoreResult {
  assetEffectivenessScore: number;
  evidenceConfidenceScore: number;
  evidenceConfidenceGrade: EvidenceConfidenceGrade;
  effectivenessTier: EffectivenessTier;
  observedWeight: number;
  missingSignals: string[];
  signalScores: Record<string, number | null>;
}

/**
 * Default signal weights for the AES composite. Reliability dominates, then
 * error resistance, with retention, latency, and adoption as supporting
 * signals. The composite renormalizes over whichever signals are observed, so
 * these are relative weights, not a fixed budget.
 */
export const DEFAULT_SIGNAL_WEIGHTS = {
  reliability: 0.45,
  errorResistance: 0.2,
  latencyQuality: 0.1,
  retention: 0.15,
  adoption: 0.1,
} as const;
export type SignalName = keyof typeof DEFAULT_SIGNAL_WEIGHTS;
const SIGNAL_NAMES = Object.keys(DEFAULT_SIGNAL_WEIGHTS) as SignalName[];

/**
 * The signals the live dataset can supply per asset. Confidence COVERAGE is
 * measured against this obtainable set, NOT all five defined signals, so an
 * asset is never penalized for evidence the system never gathers. Retention
 * (returning-user) and counterfactual (paired baseline/treatment) data are not
 * collected here, so retention is excluded from coverage (counterfactual is not
 * a weighted signal and never affected coverage). Both remain fully defined:
 * retention is still scored if a future source provides it, and counterfactual
 * still overrides the AES when present. Excluding them is what lets a perfect,
 * fully-tracked, high-volume asset earn the top confidence grade.
 */
const DATASET_OBSERVABLE_SIGNALS: SignalName[] = [
  "reliability",
  "errorResistance",
  "latencyQuality",
  "adoption",
];

/** Measurement fidelity per honesty grade. Drives the confidence calculation. */
const HONESTY_TO_FIDELITY: Record<HonestyGrade, number> = {
  full: 1.0,
  partial: 0.75,
  occupancy: 0.5,
  derived: 0.25,
  none: 0.0,
};

// ----- private-eval evidence (confidence path only) --------------------------------
// EvalResult rows are dataset-resident, so these are pure functions over VaultDataset,
// never an out-of-band snapshot read. Evals gate CONFIDENCE (via assetHonesty), never the
// effectiveness point estimate; scoreAssetDetailed keeps counterfactual null. See
// docs/superpowers/specs/2026-07-07-private-eval-artifact-design.md section 5.

/** Aggregated eval outcomes for one asset over a window. */
export interface EvalSummary {
  assetId: string;
  trials: number;
  passed: number;
  failed: number;
  errored: number;
  latencyMs: number;
  tokens: number;
  cost: number;
  /** The weakest honesty grade among the asset's eval rows (modeled collapsed to derived). */
  quality: HonestyGrade;
}

/**
 * Collapse an eval's HarnessMetricQuality to the asset-level HonestyGrade. HonestyGrade
 * omits "modeled", so a modeled eval maps to "derived" (the same low fidelity) rather than
 * failing to map.
 */
export function evalQualityToHonesty(
  quality: HarnessMetricQuality,
): HonestyGrade {
  return quality === "modeled" ? "derived" : quality;
}

// Honesty grades weakest to strongest, so minHonesty takes the lower-confidence one.
const HONESTY_ORDER: HonestyGrade[] = [
  "none",
  "derived",
  "occupancy",
  "partial",
  "full",
];
const minHonesty = (a: HonestyGrade, b: HonestyGrade): HonestyGrade =>
  HONESTY_ORDER.indexOf(a) <= HONESTY_ORDER.indexOf(b) ? a : b;

/**
 * Eval outcomes per asset over an optional window; `evalResultsByAsset` is the unwindowed
 * form. The summary quality is the weakest collapsed grade among the asset's rows.
 */
export function evalResultsByAssetWindowed(
  dataset: VaultDataset,
  window?: DateWindow,
): Map<string, EvalSummary> {
  const grouped = new Map<string, EvalResultRow[]>();
  for (const row of dataset.evalResults) {
    if (!inWindow(row.date, window)) continue;
    grouped.set(row.assetId, [...(grouped.get(row.assetId) ?? []), row]);
  }
  const summaries = new Map<string, EvalSummary>();
  for (const [assetId, rows] of grouped.entries()) {
    const trials = rows.reduce((sum, row) => sum + row.trials, 0);
    const latencyTotal = rows.reduce(
      (sum, row) => sum + row.latencyMs * row.trials,
      0,
    );
    let quality: HonestyGrade = "full";
    for (const row of rows) {
      quality = minHonesty(quality, evalQualityToHonesty(row.quality));
    }
    summaries.set(assetId, {
      assetId,
      trials,
      passed: rows.reduce((sum, row) => sum + row.passed, 0),
      failed: rows.reduce((sum, row) => sum + row.failed, 0),
      errored: rows.reduce((sum, row) => sum + row.errored, 0),
      latencyMs: trials ? latencyTotal / trials : 0,
      tokens: rows.reduce((sum, row) => sum + row.tokens, 0),
      cost: rows.reduce((sum, row) => sum + row.cost, 0),
      quality,
    });
  }
  return summaries;
}

/** Full-history eval outcomes per asset. */
export function evalResultsByAsset(
  dataset: VaultDataset,
): Map<string, EvalSummary> {
  return evalResultsByAssetWindowed(dataset);
}

/** Pass rate of an eval summary: passed over trials, 0 with no trials. */
export function evalPassRate(summary: EvalSummary): number {
  return summary.trials > 0 ? summary.passed / summary.trials : 0;
}

// Bayesian reliability prior: Beta(1,1) is the uniform prior, so a 1/1 record
// shrinks to 2/3 rather than reading as a perfect 1.0.
const RELIABILITY_PRIOR_ALPHA = 1;
const RELIABILITY_PRIOR_BETA = 1;
// Latency quality is a bounded inverse: a call at the reference latency scores
// 0.5, faster trends to 1, slower to 0. No percentile data is available yet.
const LATENCY_REFERENCE_MS = 2000;
// Adoption is log-normalized against a saturation point: an asset invoked this
// many times scores ~1, fewer scales down by log so early use is not punished.
const ADOPTION_SATURATION = 500;
// Sample sufficiency saturates at this many invocations (confidence component).
const SAMPLE_SUFFICIENCY_TARGET = 100;
// Counterfactual blend: normalized gain dominates, the composite still informs.
const COUNTERFACTUAL_GAIN_WEIGHT = 0.7;

// Confidence grade bands, highest first (A >= 0.90 ... E < 0.25).
const CONFIDENCE_GRADE_BANDS: {
  grade: EvidenceConfidenceGrade;
  min: number;
}[] = [
  { grade: "A", min: 0.9 },
  { grade: "B", min: 0.75 },
  { grade: "C", min: 0.5 },
  { grade: "D", min: 0.25 },
  { grade: "E", min: 0 },
];

// Deterministic fallback effectiveness bands, highest first.
// TODO(percentile): replace these absolute bands with catalog percentile
// ranking once the dashboard has population distribution data, so tiers reflect
// relative standing rather than fixed cut points.
const EFFECTIVENESS_TIER_BANDS: {
  tier: Exclude<EffectivenessTier, "insufficient-evidence">;
  min: number;
}[] = [
  { tier: "exceptional", min: 0.85 },
  { tier: "strong", min: 0.7 },
  { tier: "average", min: 0.45 },
  { tier: "weak", min: 0 },
];

/**
 * Bayesian-adjusted success rate. With the default Beta(1,1) prior this is the
 * posterior mean of the success probability, so small samples are shrunk toward
 * 0.5 and never read as a naked 0 or 1.
 */
export function bayesianRate(
  successes: number,
  failures: number,
  alpha = RELIABILITY_PRIOR_ALPHA,
  beta = RELIABILITY_PRIOR_BETA,
): number {
  return (successes + alpha) / (successes + failures + alpha + beta);
}

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** Map a 0..1 confidence to its letter grade on the A..E bands. */
export function confidenceGrade(confidence: number): EvidenceConfidenceGrade {
  for (const band of CONFIDENCE_GRADE_BANDS) {
    if (confidence >= band.min) return band.grade;
  }
  return "E";
}

/**
 * Resolve the effectiveness tier from the score and its confidence grade.
 * Confidence gates the tier first: a D or E grade is always insufficient
 * evidence, no matter how high the point estimate. Otherwise the deterministic
 * fallback bands apply (see EFFECTIVENESS_TIER_BANDS).
 */
export function effectivenessTierFor(
  aes: number,
  grade: EvidenceConfidenceGrade,
): EffectivenessTier {
  if (grade === "D" || grade === "E") return "insufficient-evidence";
  for (const band of EFFECTIVENESS_TIER_BANDS) {
    if (aes >= band.min) return band.tier;
  }
  return "weak";
}

/**
 * The raw signal inputs for one asset, decoupled from the dataset so the scorer
 * is a pure, exhaustively testable unit. `latencyMs`, `retention`, and
 * `counterfactual` are optional/nullable: absent means the signal is unknown
 * (excluded from the score), not zero. `errors` feeds error resistance; the
 * reliability signal derives its failures from invocations - successes.
 */
export interface AssetSignalInputs {
  invocations: number;
  successes: number;
  errors: number;
  latencyMs?: number | null;
  retention?: number | null;
  honesty?: HonestyGrade;
  counterfactual?: {
    baselineSuccessRate: number;
    treatmentSuccessRate: number;
  } | null;
  /**
   * The signals the data source can in principle supply for this asset.
   * Confidence coverage is measured against this set, so signals nobody collects
   * do not penalize the score. Defaults to all defined signals (the literal
   * methodology view); the dataset adapter narrows it to what it can produce.
   */
  observableSignals?: SignalName[];
}

/**
 * Score one asset from its raw signals into an AssetScoreResult. Pure and
 * deterministic. The composite is a weighted average over only the signals that
 * are present; a missing signal is excluded from both numerator and denominator
 * (never treated as zero). When paired baseline/treatment data is supplied,
 * counterfactual normalized gain dominates the final score. Confidence is the
 * product of measurement fidelity, signal coverage, and sample sufficiency, and
 * the tier is gated by the resulting confidence grade.
 */
export function scoreFromSignals(inputs: AssetSignalInputs): AssetScoreResult {
  const {
    invocations,
    successes,
    errors,
    latencyMs = null,
    retention = null,
    honesty = "full",
    counterfactual = null,
    observableSignals = SIGNAL_NAMES,
  } = inputs;

  const hasVolume = invocations > 0;

  // Each signal is null when its inputs are absent, never coerced to 0.
  const signalScores: Record<string, number | null> = {
    reliability: hasVolume
      ? bayesianRate(successes, Math.max(0, invocations - successes))
      : null,
    errorResistance: hasVolume ? 1 - clamp01(errors / invocations) : null,
    latencyQuality:
      latencyMs != null && latencyMs > 0
        ? LATENCY_REFERENCE_MS / (LATENCY_REFERENCE_MS + latencyMs)
        : null,
    retention: retention != null ? clamp01(retention) : null,
    adoption: hasVolume
      ? clamp01(Math.log1p(invocations) / Math.log1p(ADOPTION_SATURATION))
      : null,
  };

  // Composite over every PRESENT (non-null) signal. observedWeight is the summed
  // weight of those signals, i.e. the denominator of the weighted average. Note
  // this iterates all SIGNAL_NAMES, NOT observableSignals, and that is deliberate:
  // observableSignals governs only the confidence COVERAGE denominator below (how
  // complete the evidence we EXPECTED to gather is). The effectiveness score itself
  // uses all real evidence available, so a signal that happens to be present is
  // never discarded just because the data source did not list it as obtainable.
  let weighted = 0;
  let observedWeight = 0;
  const missingSignals: string[] = [];
  for (const name of SIGNAL_NAMES) {
    const score = signalScores[name];
    if (score == null) {
      missingSignals.push(name);
      continue;
    }
    weighted += DEFAULT_SIGNAL_WEIGHTS[name] * score;
    observedWeight += DEFAULT_SIGNAL_WEIGHTS[name];
  }

  // No meaningful signal at all: unknown, not zero-effective.
  if (observedWeight === 0) {
    return {
      assetEffectivenessScore: 0,
      evidenceConfidenceScore: 0,
      evidenceConfidenceGrade: "E",
      effectivenessTier: "insufficient-evidence",
      observedWeight: 0,
      missingSignals,
      signalScores,
    };
  }

  const composite = weighted / observedWeight;

  // Counterfactual override: normalized gain = (lift over baseline) / (headroom
  // above baseline). A baseline of 1 leaves no headroom, so fall back to the
  // composite rather than divide by zero.
  let aes = composite;
  if (counterfactual) {
    const base = clamp01(counterfactual.baselineSuccessRate);
    const treat = clamp01(counterfactual.treatmentSuccessRate);
    if (base < 1) {
      const normalizedGain = clamp01((treat - base) / (1 - base));
      aes =
        COUNTERFACTUAL_GAIN_WEIGHT * normalizedGain +
        (1 - COUNTERFACTUAL_GAIN_WEIGHT) * composite;
    }
  }
  aes = clamp01(aes);

  // Confidence = measurement fidelity x signal coverage x sample sufficiency.
  // Every observed signal currently shares the asset-level honesty, so the
  // weighted average of per-signal fidelity collapses to that one fidelity.
  const fidelity = HONESTY_TO_FIDELITY[honesty];
  // Coverage is measured over the OBTAINABLE signal set, not all defined
  // signals, so an asset is not penalized for evidence the data source never
  // gathers (e.g. retention). A signal that IS obtainable but absent for this
  // asset (e.g. no latency rows) still lowers coverage.
  const observedObtainable = observableSignals.filter(
    (name) => signalScores[name] != null,
  ).length;
  const coverage =
    observableSignals.length > 0
      ? observedObtainable / observableSignals.length
      : 0;
  const sampleFactor = Math.min(1, invocations / SAMPLE_SUFFICIENCY_TARGET);
  const confidence = clamp01(fidelity * coverage * sampleFactor);
  const grade = confidenceGrade(confidence);

  return {
    assetEffectivenessScore: aes,
    evidenceConfidenceScore: confidence,
    evidenceConfidenceGrade: grade,
    effectivenessTier: effectivenessTierFor(aes, grade),
    observedWeight,
    missingSignals,
    signalScores,
  };
}

/**
 * Resolve one asset's measurement honesty grade from the dataset. An asset with
 * no telemetry is "none"; an asset whose only telemetry is the synthetic probe
 * row is "occupancy" (present but not really measured); otherwise the grade
 * follows telemetryMeta.tracked (all core metrics measured -> "full", some ->
 * "partial", none -> "derived"). With no telemetry metadata but real rows
 * present, measured telemetry is assumed ("full").
 */
function telemetryHonesty(
  dataset: VaultDataset,
  assetId: string,
): HonestyGrade {
  if (
    hasOnlyProbeTelemetry(assetId, dataset.utilization, dataset.telemetryMeta)
  ) {
    return "occupancy";
  }
  const tracked = dataset.telemetryMeta?.tracked;
  if (!tracked) return "full";
  const core = [tracked.successes, tracked.errors, tracked.latency];
  if (core.every(Boolean)) return "full";
  if (core.some(Boolean)) return "partial";
  return "derived";
}

export function assetHonesty(
  dataset: VaultDataset,
  assetId: string,
  usage?: UsageSummary,
): HonestyGrade {
  const summary = usage ?? utilizationByAsset(dataset).get(assetId);
  if (!summary || summary.invocations === 0) return "none";
  const grade = telemetryHonesty(dataset, assetId);
  // Eval evidence caps the grade: a low-fidelity eval (LLM-judge -> derived) lowers
  // confidence without touching the effectiveness estimate. An absent or full-grade eval
  // never raises it (min keeps the stronger source). Cheap early-out when no evals exist.
  if (dataset.evalResults.length === 0) return grade;
  const evalGrade = evalResultsByAsset(dataset).get(assetId)?.quality;
  return evalGrade ? minHonesty(grade, evalGrade) : grade;
}

/**
 * The AES + Evidence Confidence score for one asset, resolved from the dataset.
 * Retention (returning-user) and counterfactual (paired baseline/treatment)
 * data are not captured in this dataset, so those signals are reported as
 * missing rather than zero; the model degrades gracefully to the measured
 * signals. The numeric AES is `scoreAssetDetailed(...).assetEffectivenessScore`
 * (the legacy `scoreAsset` predates this and returns the richer quadrant-based
 * AssetScore that the scatter and monitor consume).
 */
export function scoreAssetDetailed(
  asset: AssetRow,
  dataset: VaultDataset,
  usage = utilizationByAsset(dataset),
): AssetScoreResult {
  const summary = usage.get(asset.id) ?? emptyUsage(asset.id);
  const honesty = assetHonesty(dataset, asset.id, summary);
  return scoreFromSignals({
    invocations: summary.invocations,
    successes: summary.successes,
    errors: summary.errors,
    latencyMs: summary.latencyMs,
    retention: null,
    honesty,
    counterfactual: null,
    observableSignals: DATASET_OBSERVABLE_SIGNALS,
  });
}

/**
 * The confidence-aware fleet effectiveness rate. Unlike the legacy
 * `effectiveAssetRate` (Stars share of all assets), this counts an asset as
 * effective only when its tier is exceptional or strong, and only over assets
 * with trustworthy evidence (confidence grade A, B, or C). Low-evidence assets
 * (grade D or E) are EXCLUDED from the denominator and reported separately as
 * `insufficientEvidence`, so the rate is never diluted by unmeasured assets.
 */
export interface AesEffectiveRate {
  rate: number;
  effectiveCount: number;
  evaluatedCount: number;
  insufficientEvidence: number;
}

const AES_EFFECTIVE_TIERS: ReadonlySet<EffectivenessTier> =
  new Set<EffectivenessTier>(["exceptional", "strong"]);

export function aesEffectiveRate(
  dataset: VaultDataset,
  window?: DateWindow,
): AesEffectiveRate {
  const usage = utilizationByAssetWindowed(dataset, window);
  let evaluatedCount = 0;
  let effectiveCount = 0;
  let insufficientEvidence = 0;
  for (const asset of dataset.assets) {
    const result = scoreAssetDetailed(asset, dataset, usage);
    if (
      result.evidenceConfidenceGrade === "D" ||
      result.evidenceConfidenceGrade === "E"
    ) {
      insufficientEvidence += 1;
      continue;
    }
    evaluatedCount += 1;
    if (AES_EFFECTIVE_TIERS.has(result.effectivenessTier)) effectiveCount += 1;
  }
  return {
    rate: evaluatedCount > 0 ? effectiveCount / evaluatedCount : 0,
    effectiveCount,
    evaluatedCount,
    insufficientEvidence,
  };
}

/**
 * The "high score, low evidence" mirage flag. True when an asset's AES point
 * estimate is high enough to count as effective (its score WOULD earn a strong or
 * exceptional tier if the evidence were trustworthy) but its evidence grade is D
 * or E, so the score is gated to insufficient-evidence and must not be believed
 * yet. These are exactly the assets that mislead a naive ranking: they look like
 * top performers until you read the grade. Returns false for low-AES assets
 * (nothing tempting to warn about, including the zero-telemetry case where AES is
 * 0) and for already-trusted assets (grade A-C). The floor reuses
 * AES_EFFECTIVE_TIERS so "would be effective if we trusted it" is the test, not a
 * fresh cut point.
 */
export function isProvisionalEffectiveness(result: AssetScoreResult): boolean {
  const lowEvidence =
    result.evidenceConfidenceGrade === "D" ||
    result.evidenceConfidenceGrade === "E";
  if (!lowEvidence) return false;
  return AES_EFFECTIVE_TIERS.has(
    effectivenessTierFor(result.assetEffectivenessScore, "A"),
  );
}

/**
 * The "confirmed underperformer" flag, the actionable inverse of the provisional
 * mirage: an asset whose effectiveness tier is weak on TRUSTWORTHY evidence
 * (grade A-C). The evidence is good enough to believe the score, and the score
 * says it genuinely underperforms, so the right move is to fix or retire it, not
 * to gather more data. This is what separates a reliably-failing asset (e.g. a
 * guard hook that errors more than it passes) from one that merely lacks evidence
 * (insufficient-evidence). A weak tier is only reachable at grade A-C anyway (D/E
 * always gates to insufficient-evidence); the explicit grade check guards that
 * invariant against future band changes.
 */
export function isConfirmedUnderperformer(result: AssetScoreResult): boolean {
  const trusted =
    result.evidenceConfidenceGrade === "A" ||
    result.evidenceConfidenceGrade === "B" ||
    result.evidenceConfidenceGrade === "C";
  return trusted && result.effectivenessTier === "weak";
}

// ===========================================================================
// Effectiveness drift. Compare an asset's AES over the recent window against the
// prior window of equal length, so a measured decline is caught before the
// asset crosses an absolute bar and reads as Shelfware. Confidence-gated: a drop
// measured on thin evidence is withheld, not reported as a regression, so a real
// decline is distinguished from an asset that merely went quiet. See
// docs/superpowers/specs/2026-06-24-effectiveness-drift-design.md.
// ===========================================================================

/** The direction of an asset's effectiveness change between two equal windows. */
export type DriftDirection =
  "improving" | "steady" | "regressing" | "insufficient";

/** AES drop (recent minus prior) at or beyond which an asset counts as regressing. */
export const REGRESSION_DELTA = 0.1;
/** AES rise at or beyond which an asset counts as improving. */
export const IMPROVEMENT_DELTA = 0.1;

/**
 * One asset's effectiveness trend: the AES over the recent and prior halves of
 * the window, their signed difference, and the resulting direction. recent and
 * prior are null only when the series was too short to split. delta is null
 * whenever the direction is insufficient (either half lacked trustworthy
 * evidence, or there was no split).
 */
export interface AssetTrend {
  assetId: string;
  recent: AssetScoreResult | null;
  prior: AssetScoreResult | null;
  delta: number | null;
  direction: DriftDirection;
}

/**
 * Split the dataset's utilization dates (optionally within a window) into a
 * prior and a recent half of equal length, each returned as an inclusive
 * DateWindow. On an odd number of dates the oldest is dropped so the halves stay
 * equal, matching seriesDelta. Returns null when there are fewer than two dates,
 * i.e. nothing to compare.
 */
export function splitDriftWindows(
  dataset: VaultDataset,
  window?: DateWindow,
): { prior: DateWindow; recent: DateWindow } | null {
  const dates = utilizationDates(dataset).filter((date) =>
    inWindow(date, window),
  );
  const half = Math.floor(dates.length / 2);
  if (half < 1) return null;
  const recent = dates.slice(dates.length - half);
  const prior = dates.slice(dates.length - 2 * half, dates.length - half);
  return {
    prior: { start: prior[0], end: prior[prior.length - 1] },
    recent: { start: recent[0], end: recent[recent.length - 1] },
  };
}

/**
 * Map a signed AES delta to a direction, ignoring evidence (the caller applies
 * the evidence gate first). A drop of REGRESSION_DELTA or more regresses, a rise
 * of IMPROVEMENT_DELTA or more improves, anything between is steady.
 */
export function driftDirection(
  delta: number,
): "improving" | "steady" | "regressing" {
  if (delta <= -REGRESSION_DELTA) return "regressing";
  if (delta >= IMPROVEMENT_DELTA) return "improving";
  return "steady";
}

/** Grade A, B, or C is trustworthy enough to believe an AES point estimate. */
const isTrustedGrade = (result: AssetScoreResult): boolean =>
  result.evidenceConfidenceGrade === "A" ||
  result.evidenceConfidenceGrade === "B" ||
  result.evidenceConfidenceGrade === "C";

/**
 * Resolve a trend from the two halves' scores. Both halves must clear the
 * evidence gate, so a regression means we trusted the asset before and we trust
 * the measurement now; otherwise the comparison is withheld as insufficient.
 */
function trendFromScores(
  assetId: string,
  recent: AssetScoreResult,
  prior: AssetScoreResult,
): AssetTrend {
  if (!isTrustedGrade(recent) || !isTrustedGrade(prior)) {
    return { assetId, recent, prior, delta: null, direction: "insufficient" };
  }
  const delta = recent.assetEffectivenessScore - prior.assetEffectivenessScore;
  return { assetId, recent, prior, delta, direction: driftDirection(delta) };
}

/** The effectiveness trend for one asset over the window. */
export function assetTrend(
  dataset: VaultDataset,
  assetId: string,
  window?: DateWindow,
): AssetTrend {
  const split = splitDriftWindows(dataset, window);
  const asset = dataset.assets.find((row) => row.id === assetId);
  if (!split || !asset) {
    return {
      assetId,
      recent: null,
      prior: null,
      delta: null,
      direction: "insufficient",
    };
  }
  const recent = scoreAssetDetailed(
    asset,
    dataset,
    utilizationByAssetWindowed(dataset, split.recent),
  );
  const prior = scoreAssetDetailed(
    asset,
    dataset,
    utilizationByAssetWindowed(dataset, split.prior),
  );
  return trendFromScores(assetId, recent, prior);
}

/** The effectiveness trend for every asset, computing each half's usage once. */
export function assetTrends(
  dataset: VaultDataset,
  window?: DateWindow,
): AssetTrend[] {
  const split = splitDriftWindows(dataset, window);
  if (!split) {
    return dataset.assets.map((asset) => ({
      assetId: asset.id,
      recent: null,
      prior: null,
      delta: null,
      direction: "insufficient" as DriftDirection,
    }));
  }
  const recentUsage = utilizationByAssetWindowed(dataset, split.recent);
  const priorUsage = utilizationByAssetWindowed(dataset, split.prior);
  return dataset.assets.map((asset) =>
    trendFromScores(
      asset.id,
      scoreAssetDetailed(asset, dataset, recentUsage),
      scoreAssetDetailed(asset, dataset, priorUsage),
    ),
  );
}

/**
 * Assets whose effectiveness is regressing on trustworthy evidence, steepest
 * drop first (most negative delta), with a stable name tie-break.
 */
export function regressingAssets(
  dataset: VaultDataset,
  window?: DateWindow,
): AssetTrend[] {
  const nameById = new Map(dataset.assets.map((row) => [row.id, row.name]));
  return assetTrends(dataset, window)
    .filter((trend) => trend.direction === "regressing")
    .sort(
      (a, b) =>
        (a.delta ?? 0) - (b.delta ?? 0) ||
        (nameById.get(a.assetId) ?? "").localeCompare(
          nameById.get(b.assetId) ?? "",
        ),
    );
}
