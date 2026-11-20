#!/usr/bin/env node
/**
 * Generate the committed synthetic demo telemetry for every catalog asset so a
 * fresh visitor to the build:swa demo sees a healthy-but-imperfect fleet with a
 * populated quadrant distribution on Overview, Effectiveness, Monitor, and Cost.
 *
 *   npx tsx scripts/generate-demo-telemetry.mts
 *
 * Writes (deterministically, no wall clock and no RNG entropy):
 *   - src/data/imports/utilization.json   complete per-asset telemetry
 *   - src/data/imports/harness-usage.json claude-code rollup derived from it,
 *                                         plus codex/grok/copilot re-anchored
 *
 * The asset list and the governance definition are imported from the app so the
 * generator and the app share a single definition. The generator reads only the
 * asset rows and governance, never any telemetry already folded into seedDataset.
 *
 * Partition (flagships to Stars first, then sort by id and split the rest):
 *   governed pool  -> Stars = curated FLAGSHIPS first, then fill to STAR_COUNT; rest Shelfware
 *   ungoverned pool -> first RISK_COUNT Risks, rest Dead weight
 * The neutral demo flagships (see FLAGSHIP_IDS) are pinned into Stars so the demo's
 * recognizable assets read as Stars with real telemetry, never Shelfware or
 * zero-telemetry fixtures.
 * Per-quadrant recipes land each asset in its quadrant under the unified threshold
 * (effective = effectiveScore >= 0.6; effectiveScore = min(inv/500,1)*0.4 + sr*0.6).
 */
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { writeFileSync } from "node:fs";

import { seedDataset } from "../src/data/seed.ts";
import { governanceChecks } from "../src/data/metrics.ts";
import { runDataSourceContract } from "../src/data/contract.ts";
import { applyTelemetry } from "../src/data/telemetry.ts";
import pricing from "../src/data/imports/pricing.json" with { type: "json" };
import type {
  HarnessUsageSnapshot,
  TelemetryMeta,
  UtilizationRow,
  VaultDataset,
} from "../src/data/types.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const TENANT = "tenant-fabricagent";

/** Seeded PRNG copied verbatim from src/data/seed.ts so the generator is RNG-free. */
function rng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let step = Math.imul(value ^ (value >>> 15), 1 | value);
    step = (step + Math.imul(step ^ (step >>> 7), 61 | step)) ^ step;
    return ((step ^ (step >>> 14)) >>> 0) / 4294967296;
  };
}

// Nineteen snapshot anchors on a uniform 5-day cadence spanning 90 days and ending
// 2026-06-05. The presets resolve to genuinely different slices because the window
// counts back from the latest data date (the snapshot anchor, not the wall clock):
// 7d sees ~2 anchors, 30d the last 6, 90d 18, and All all 19. The last RECENT_ANCHORS
// of them fall inside the default 30d window, and per-anchor volume is calibrated to
// that count (see perAnchorVolumes) so the 30d view keeps the same volume, adoption,
// and retention it had at 6 anchors, while wider windows ADD data instead of
// diluting the narrow-window signals. Deterministic strings, never from the clock.
const DATES = [
  "2026-03-07",
  "2026-03-12",
  "2026-03-17",
  "2026-03-22",
  "2026-03-27",
  "2026-04-01",
  "2026-04-06",
  "2026-04-11",
  "2026-04-16",
  "2026-04-21",
  "2026-04-26",
  "2026-05-01",
  "2026-05-06",
  "2026-05-11",
  "2026-05-16",
  "2026-05-21",
  "2026-05-26",
  "2026-05-31",
  "2026-06-05",
] as const;
// Anchors that fall inside the default 30d window (end minus 29 days = 2026-05-07
// onward): 05-11, 05-16, 05-21, 05-26, 05-31, 06-05. Per-anchor volume is scaled by
// this so the 30d window sums to about each asset's invTotal.
const RECENT_ANCHORS = 6;
const WINDOW_START = DATES[0];
const WINDOW_END = DATES[DATES.length - 1];
const GENERATED_AT = "2026-06-05T00:00:00.000Z";
const SESSIONS = 442;

type Quadrant = "Stars" | "Risks" | "Shelfware" | "Dead weight";

/**
 * Curated governed flagship asset ids (the cc-* overlay ids from the neutral demo
 * overlay, real-assets.demo.json). These are assigned to the Stars pool FIRST, with
 * the Star recipe and real telemetry, so the demo's recognizable assets read as
 * Stars rather than landing in Shelfware or with zero telemetry. Every id here is a
 * governed (NOT ungoverned) overlay asset; the build asserts each exists and is in
 * the governed pool, so a renamed or de-governed slug fails loudly instead of
 * silently demoting a flagship. The generator runs under tsx with import.meta.env
 * unset, so realAssets.ts resolves to the neutral demo overlay and the generated
 * telemetry carries no owner-derived ids. See docs/PRIVACY.md.
 */
const FLAGSHIP_IDS = [
  "cc-subagent-example-helper",
  "cc-subagent-demo-reviewer",
  "cc-mcp-server-example-docs-server",
  "cc-skill-starter-scaffolder",
  "cc-skill-example-test-runner",
  "cc-skill-sample-data-modeler",
  "cc-skill-sample-app-builder",
  "cc-skill-sample-ui-refiner",
  "cc-skill-sample-report-builder",
] as const;

/** Per-quadrant window totals chosen to land squarely in the quadrant. */
const RECIPE: Record<Quadrant, { invTotal: number; successRate: number }> = {
  // governed + effective: inv 380, sr 0.93 -> eff 0.862
  Stars: { invTotal: 380, successRate: 0.93 },
  // ungoverned + effective: inv 300, sr 0.90 -> eff 0.78
  Risks: { invTotal: 300, successRate: 0.9 },
  // governed + NOT effective: inv 60, sr 0.90 -> eff 0.588 (low volume, NOT high-sr-low-vol)
  Shelfware: { invTotal: 60, successRate: 0.9 },
  // ungoverned + NOT effective: inv 40, sr 0.50 -> eff 0.332
  "Dead weight": { invTotal: 40, successRate: 0.5 },
};

/**
 * Curated drift flagships. A few governed Stars DECLINE across the window
 * (regressing) and one RISES (improving), so the effectiveness-drift detector has
 * something to show on the demo: the Overview "N regressing" chip, the
 * Effectiveness "Regressing" bucket, the Monitor regressing exception, and the
 * red/green asset-detail trend. The shift is concentrated in the recent part of
 * the window so it registers on the default 30d view AND the wider ranges; both
 * halves keep the Star volume so both stay grade A-C and the drift is trusted,
 * never withheld as insufficient. Ids are flagships (asserted to exist and be
 * governed), so they stay Stars overall while their telemetry tells a trend story.
 */
const REGRESSING_IDS = new Set<string>([
  "cc-skill-sample-data-modeler",
  "cc-skill-sample-app-builder",
]);
const IMPROVING_IDS = new Set<string>(["cc-skill-sample-ui-refiner"]);

/** Success rate: holds healthy, then drops STEEPLY over the recent ~45% of the
 *  window so even the narrow 30d split (3-anchor halves) clears the 0.10 AES
 *  regression bar, while wider windows read it too (the regressing story). */
function decliningSr(d: number, n: number): number {
  const t = n <= 1 ? 1 : d / (n - 1);
  const drop = t < 0.55 ? 0 : (t - 0.55) / 0.45; // 0..1 across the last 45%
  return 0.95 - 0.45 * drop; // 0.95 -> 0.50
}
/** Mirror of decliningSr: low, then climbs steeply over the recent ~45% (improving). */
function risingSr(d: number, n: number): number {
  const t = n <= 1 ? 1 : d / (n - 1);
  const ramp = t < 0.55 ? 0 : (t - 0.55) / 0.45;
  return 0.5 + 0.45 * ramp; // 0.50 -> 0.95
}

// Confirmed-underperformer recipe. A couple of governed Shelfware assets get high
// volume, a low success rate, and ALL-ERROR misses (no refusals), which drags both
// reliability and error-resistance down so the AES lands in the "weak" tier on
// trustworthy (grade A) evidence. This is exactly what lights the Effectiveness
// "Underperforming" bucket and the "fix or retire" story, distinct from an asset
// that merely lacks evidence.
const UNDERPERFORMER_COUNT = 2;
const UNDERPERFORMER_INV = 200;
const UNDERPERFORMER_SR = 0.3;

// Drift assets carry extra volume so that even a narrow window's two-anchor halves
// stay grade A-C and the trend is trusted, never withheld as insufficient evidence.
const DRIFT_INV = 700;

// A small weighted model set so usageByModel has variety. The cumulative weights
// are walked with a seeded draw per row, so model assignment is deterministic.
const MODELS: { model: string; weight: number; tokensPerInv: number }[] = [
  { model: "claude-opus-4-8", weight: 0.45, tokensPerInv: 9000 },
  { model: "claude-sonnet-4-6", weight: 0.4, tokensPerInv: 6000 },
  { model: "claude-haiku-4-5", weight: 0.15, tokensPerInv: 3000 },
];

const rate = (model: string): number =>
  (pricing as { perMillionTokens: Record<string, number> }).perMillionTokens[
    model
  ] ??
  (pricing as { perMillionTokens: Record<string, number> }).perMillionTokens
    .default;

function pickModel(draw: number): (typeof MODELS)[number] {
  let acc = 0;
  for (const m of MODELS) {
    acc += m.weight;
    if (draw <= acc) return m;
  }
  return MODELS[MODELS.length - 1];
}

function isGoverned(dataset: VaultDataset, assetId: string): boolean {
  const asset = dataset.assets.find((row) => row.id === assetId)!;
  const checks = governanceChecks(asset, dataset);
  return checks.filter((c) => c.pass).length / checks.length >= 0.8;
}

/**
 * One invocation count per anchor, with a FIXED per-anchor base (not a fixed total
 * split across anchors). The base is invTotal / RECENT_ANCHORS, so the last
 * RECENT_ANCHORS anchors (the default 30d window) sum to about invTotal, exactly as
 * the old 6-anchor model did, while wider windows accumulate proportionally MORE
 * volume. This is what makes the time-range presets differ without diluting the
 * per-window adoption and retention signals (the trap that demoted Stars when a
 * fixed total was spread thin over a long window). Small seeded jitter per anchor,
 * deterministic and byte-stable.
 */
function perAnchorVolumes(invTotal: number, rand: () => number): number[] {
  if (invTotal === 0) return DATES.map(() => 0);
  const perAnchor = invTotal / RECENT_ANCHORS;
  return DATES.map(() => Math.round(perAnchor * (0.85 + rand() * 0.3)));
}

export interface Built {
  rows: UtilizationRow[];
  unattributed: { key: string; count: number }[];
}

export function build(dataset: VaultDataset): Built {
  // Partition assets deterministically. Sort governed and ungoverned pools by id,
  // then slice into the quadrant pools, but pin the curated flagships into the
  // Stars pool FIRST so the demo's recognizable governed assets always read as
  // Stars, ahead of obscure fixtures that would otherwise win on id sort order.
  const ids = dataset.assets
    .map((a) => a.id)
    .sort((a, b) => a.localeCompare(b));
  const governedSet = new Set(ids.filter((id) => isGoverned(dataset, id)));
  const ungoverned = ids.filter((id) => !governedSet.has(id));

  // Adaptive split so all four quadrants populate regardless of catalog size: about
  // half of each pool lands in its effective quadrant (Stars / Risks), the rest in
  // its ineffective quadrant (Shelfware / Dead weight). Stars always covers at least
  // the flagship allowlist.
  const STAR_COUNT = Math.max(
    FLAGSHIP_IDS.length,
    Math.round(governedSet.size * 0.5),
  );
  const RISK_COUNT = Math.max(1, Math.round(ungoverned.length / 2));

  // Validate the flagship allowlist against the live dataset: every flagship must
  // exist and be governed, or a quietly demoted flagship would slip through.
  const flagships = FLAGSHIP_IDS.filter((id) => governedSet.has(id));
  const flagshipMissing = FLAGSHIP_IDS.filter((id) => !governedSet.has(id));
  if (flagshipMissing.length > 0) {
    throw new Error(
      `Flagship ids missing from the governed pool (renamed or de-governed?): ${flagshipMissing.join(", ")}`,
    );
  }
  if (flagships.length > STAR_COUNT) {
    throw new Error(
      `More flagships (${flagships.length}) than Star slots (${STAR_COUNT}).`,
    );
  }

  // Stars = the flagships first (in allowlist order), then the remaining governed
  // assets by id order until the Star pool is full. Everything else governed is
  // Shelfware. This keeps the Star COUNT exact while guaranteeing flagships land
  // in Stars with the Star recipe and real telemetry.
  const flagshipSet = new Set<string>(flagships);
  const governedRest = ids.filter(
    (id) => governedSet.has(id) && !flagshipSet.has(id),
  );
  const starFill = governedRest.slice(0, STAR_COUNT - flagships.length);
  const starSet = new Set<string>([...flagships, ...starFill]);

  const quadrantOf = new Map<string, Quadrant>();
  for (const id of governedSet) {
    quadrantOf.set(id, starSet.has(id) ? "Stars" : "Shelfware");
  }
  ungoverned.forEach((id, i) =>
    quadrantOf.set(id, i < RISK_COUNT ? "Risks" : "Dead weight"),
  );

  // The first few governed Shelfware assets (by id order) become confirmed
  // underperformers: high volume + low success, so they grade A-C yet tier "weak".
  const underperformerSet = new Set<string>(
    ids
      .filter((id) => quadrantOf.get(id) === "Shelfware")
      .slice(0, UNDERPERFORMER_COUNT),
  );

  // A few governed and a few ungoverned assets get ZERO rows (also Shelfware /
  // Dead weight by zero telemetry), so the demo shows genuine no-telemetry assets.
  // Chosen deterministically: every 7th asset in array order within the
  // non-effective quadrants. Flagships are Stars (effective), so they are never
  // touched by this rule.
  const rand = rng(424242);
  const rows: UtilizationRow[] = [];
  let nonEffectiveSeen = 0;

  for (const asset of dataset.assets) {
    const quadrant = quadrantOf.get(asset.id)!;
    const recipe = RECIPE[quadrant];
    const isUnder = underperformerSet.has(asset.id);
    const isDrift = REGRESSING_IDS.has(asset.id) || IMPROVING_IDS.has(asset.id);
    let invTotal = isUnder
      ? UNDERPERFORMER_INV
      : isDrift
        ? DRIFT_INV
        : recipe.invTotal;
    const nonEffective = quadrant === "Shelfware" || quadrant === "Dead weight";
    if (nonEffective) {
      nonEffectiveSeen += 1;
      // Underperformers always carry telemetry; they ARE the failing-asset story.
      if (nonEffectiveSeen % 7 === 0 && !isUnder) invTotal = 0; // no-telemetry asset
    }

    const perDate = perAnchorVolumes(invTotal, rand);
    for (let d = 0; d < DATES.length; d += 1) {
      const invocations = perDate[d];
      if (invocations === 0) continue;
      const date = DATES[d];
      const model = pickModel(rand());
      // Per-date success rate: drift flagships decline/rise across the window, an
      // underperformer holds a low flat rate, everyone else holds the quadrant rate.
      const successRate = REGRESSING_IDS.has(asset.id)
        ? decliningSr(d, DATES.length)
        : IMPROVING_IDS.has(asset.id)
          ? risingSr(d, DATES.length)
          : isUnder
            ? UNDERPERFORMER_SR
            : recipe.successRate;
      const successes = Math.round(invocations * successRate);
      const remaining = invocations - successes;
      // Most misses are errors, the rest refusals, so successes+errors+refusals
      // === invocations (contract invariant). An underperformer fails HARD (all
      // misses are errors), dragging error-resistance down into the weak tier.
      const errors = remaining;
      // Per-asset refusals, tokens, and cost are NOT measurable and must stay zero.
      // Claude Code transcripts do not attribute spend to the individual asset a turn
      // fired, so the real collector reports 0 and grades them untracked
      // (scripts/vault-telemetry.mjs). Inventing them here would be bad enough on its
      // own, but it also flips telemetryMeta.tracked.cost to true, which makes
      // costBasis.selectCostBasis return basis 'utilization' with tracked: true, and
      // the UI then presents a fabricated cost per success AS MEASURED TRUTH. The
      // honest path is the fallback: basis 'harness-estimate', tracked: false, which
      // is exactly what a real user of this product sees.
      const refusals = 0;
      const tokens = 0;
      const cost = 0;
      // Latency bounded and seeded; faster models read faster.
      const baseLatency =
        model.model === "claude-haiku-4-5"
          ? 1200
          : model.model === "claude-sonnet-4-6"
            ? 2600
            : 4200;
      const latencyMs = Math.round(baseLatency + rand() * 800);
      rows.push({
        id: `claude-code:${asset.id}:${date}:${model.model}`,
        tenantId: TENANT,
        assetId: asset.id,
        date,
        model: model.model,
        invocations,
        successes,
        errors,
        refusals,
        latencyMs,
        tokens,
        cost,
      });
    }
  }

  // Three orphaned-usage entries (usage with no catalog match), sorted by count
  // desc, so the Orphaned usage panel has content.
  const unattributed = [
    { key: "skill:legacy-tmdl-linter", count: 41 },
    { key: "mcp-server:internal-jira", count: 23 },
    { key: "subagent:onboarding-helper", count: 9 },
  ].sort((a, b) => b.count - a.count);

  return { rows, unattributed };
}

export interface UtilizationFile {
  demo: true;
  rows: UtilizationRow[];
  meta: TelemetryMeta;
  unattributed: { key: string; count: number }[];
}

export function utilizationFile(built: Built): UtilizationFile {
  return {
    demo: true,
    rows: built.rows,
    meta: {
      source: "claude-code",
      generatedAt: GENERATED_AT,
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      sessions: SESSIONS,
      // Must mirror the real collector's grades exactly (scripts/vault-telemetry.mjs).
      // refusals/tokens/cost are not attributable per asset, so they are untracked;
      // claiming otherwise disables the costBasis honesty guard.
      tracked: {
        invocations: true,
        successes: true,
        errors: true,
        latency: true,
        refusals: false,
        tokens: false,
        cost: false,
        model: true,
      },
    },
    unattributed: built.unattributed,
  };
}

/**
 * Build the harness-usage snapshot. The claude-code rollup invocations,
 * successes, and errors are derived from the generated utilization rows (summed
 * per anchor and uplifted for non-catalog built-in tool fires) so the monitor
 * harness card stays catalog-grounded. Its TOKENS are a harness-grain full-session
 * figure, not the sum of the small per-asset attribution tokens in utilization.json:
 * a real Claude Code turn burns full-context tokens, far more than the slice
 * attributed to the one governed asset it fired.
 *
 * That full-context burn is overwhelmingly CACHE READS, so the snapshot carries a
 * componentsByModel split and reports `tokens` as billable-only (input + output +
 * cacheWrite), exactly like the real collector in scripts/telemetry/claudeHarness.mjs.
 * Emitting the split is what makes the cost engine take its cache-aware path
 * (harnessCost.componentByModelSpend), pricing cache reads at 0.1x input instead of
 * at the full blended rate.
 *
 * This previously did NOT emit the split, so every cache-read token was priced at
 * Opus's full rate and the demo declared Claude Code the priciest harness by ~13x
 * over Grok. That fabricated 13x was false (an 11.2x overstatement against the
 * owner's real telemetry), but so was the "cheapest harness" victory lap that
 * replaced it: with every vendor's cache traffic priced the same way at cited
 * list rates, real Claude Code sits mid-pack, in the same band as its rivals.
 * No cross-harness cost ranking here is apples-to-apples (each vendor's outcome
 * coverage differs), so this file asserts magnitudes, never a winner.
 * Do not reintroduce a hand-tuned "launch story" here. The demo's whole claim is
 * that it never fakes a number it cannot measure; a rigged leaderboard voids it.
 *
 * The other three harnesses are re-anchored to the same dates and stay ranked below
 * claude-code by invocations (a test asserts sorted-by-invocations).
 */
export function harnessFile(built: Built): HarnessUsageSnapshot {
  const UPLIFT = 1.6;
  // A full Claude Code turn consumes whole-context tokens (system prompt, tool
  // schemas, transcript, output). Grounded in the owner's real harness usage:
  // 4,897 BILLABLE tokens per invocation, which at the component mix below implies
  // ~100k of full-context burn per turn (the rest being cache reads).
  // Every harness rate in this file is measured, not chosen. See the note on the
  // other three harnesses below.
  const CLAUDE_SESSION_TOKENS_PER_INV = 100_000;
  // Component shares of that full-context burn, measured from the owner's real
  // harness-usage (3.54B tokens): cache reads dominate at 95%. Keep these in sync
  // with reality if the collector's mix shifts materially.
  const CLAUDE_COMPONENT_SHARE = {
    input: 0.0033,
    output: 0.006,
    cacheWrite: 0.0393,
    cacheRead: 0.9514,
  };
  // What the harness reports as `tokens`: billable only, cache reads excluded.
  const BILLABLE_SHARE =
    CLAUDE_COMPONENT_SHARE.input +
    CLAUDE_COMPONENT_SHARE.output +
    CLAUDE_COMPONENT_SHARE.cacheWrite;
  const byDate = new Map<
    string,
    { inv: number; succ: number; err: number; tokens: number }
  >();
  // The model mix is weighted by invocations per model at that model's per-turn token
  // appetite. It CANNOT come from the utilization rows' tokens, which are zero: tokens
  // are unmeasurable at the per-asset grain (see the row builder above). Tokens ARE
  // measurable at the harness grain, which is exactly why the real pipeline reports
  // them there and not per asset.
  const modelWeight = new Map<string, number>();
  for (const row of built.rows) {
    const acc = byDate.get(row.date) ?? {
      inv: 0,
      succ: 0,
      err: 0,
      tokens: 0,
    };
    acc.inv += row.invocations;
    acc.succ += row.successes;
    acc.err += row.errors;
    byDate.set(row.date, acc);
    if (row.model) {
      const appetite =
        MODELS.find((m) => m.model === row.model)?.tokensPerInv ?? 0;
      modelWeight.set(
        row.model,
        (modelWeight.get(row.model) ?? 0) + row.invocations * appetite,
      );
    }
  }
  // Dominant model first; ties break by model id so the order is deterministic.
  const models = [...modelWeight.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([model]) => model);

  // Per-anchor claude-code daily rows, uplifted to include built-in tool fires.
  // Invocations/successes/errors come from the catalog (uplifted); tokens use the
  // full-session harness rate, not the per-asset attribution sum, so the cost
  // leaderboard reads at the harness grain.
  const claudeDaily = DATES.map((date, i) => {
    const acc = byDate.get(date) ?? { inv: 0, succ: 0, err: 0, tokens: 0 };
    const inv = Math.round(acc.inv * UPLIFT);
    const succ = Math.round(acc.succ * UPLIFT);
    const err = Math.round(acc.err * UPLIFT);
    // Billable tokens only. The cache-read remainder of the full-context burn is
    // reported separately in componentsByModel, not folded in here.
    const tokens = Math.round(
      inv * CLAUDE_SESSION_TOKENS_PER_INV * BILLABLE_SHARE,
    );
    // Sessions per anchor, deterministic and weekly-ish, robust to anchor count.
    const sessions = 20 + ((i * 5) % 11);
    return {
      date,
      sessions,
      invocations: inv,
      successes: succ,
      errors: err,
      latencyMs: 3200,
      tokens,
    };
  });

  const sum = (key: "invocations" | "successes" | "errors" | "tokens") =>
    claudeDaily.reduce((acc, day) => acc + day[key], 0);
  const claudeSessions = claudeDaily.reduce(
    (acc, day) => acc + day.sessions,
    0,
  );

  // Split the full-context burn across models (by their attribution share) and then
  // across components, so the cost engine prices cache reads at 0.1x input rather
  // than billing 95% of the volume at the full blended rate.
  const weightTotal = [...modelWeight.values()].reduce((a, b) => a + b, 0);
  const fullSessionTokens = sum("invocations") * CLAUDE_SESSION_TOKENS_PER_INV;
  const modelShare = (weight: number) =>
    weightTotal > 0 ? weight / weightTotal : 0;

  const componentsByModel = Object.fromEntries(
    [...modelWeight.entries()].map(([model, weight]) => {
      const modelTokens = fullSessionTokens * modelShare(weight);
      return [
        model,
        {
          input: Math.round(modelTokens * CLAUDE_COMPONENT_SHARE.input),
          output: Math.round(modelTokens * CLAUDE_COMPONENT_SHARE.output),
          cacheWrite: Math.round(modelTokens * CLAUDE_COMPONENT_SHARE.cacheWrite),
          cacheRead: Math.round(modelTokens * CLAUDE_COMPONENT_SHARE.cacheRead),
        },
      ];
    }),
  );
  // Billable tokens per model, so tokensByModel sums to the reported `tokens`.
  const tokensByModel = new Map(
    [...modelWeight.entries()].map(([model, weight]) => [
      model,
      Math.round(sum("tokens") * modelShare(weight)),
    ]),
  );

  const claude = {
    source: "claude-code",
    label: "Claude Code",
    sessions: claudeSessions,
    windowStart: WINDOW_START,
    windowEnd: WINDOW_END,
    invocations: sum("invocations"),
    successes: sum("successes"),
    errors: sum("errors"),
    latencyMs: 3200,
    tokens: sum("tokens"),
    cost: 0,
    models,
    tokensByModel: Object.fromEntries(tokensByModel),
    componentsByModel,
    note: "All tool fires from transcripts (built-ins included), uplifted from the catalog-attributed total. Tokens are billable-new (input, output, cache writes); cache reads are reported separately and priced at 0.1x input. Cost is derived from tokens at list prices, not billed.",
    daily: claudeDaily,
    // Mirrors CLAUDE_TRACKED in scripts/telemetry/claudeHarness.mjs exactly. Cost is
    // 'modeled', not 'none': it IS derived (from real tokens at list prices), it is
    // simply not billed.
    tracked: {
      successes: "full" as const,
      errors: "full" as const,
      latency: "full" as const,
      tokens: "full" as const,
      cost: "modeled" as const,
    },
  };

  // The other three harnesses, re-anchored to the same dates.
  //
  // Two rules govern this block, both learned the hard way.
  //
  // 1. Every `tokensPerInv` is MEASURED from the owner's real harness-usage, not
  //    chosen. These were previously invented (codex 266k, grok 108k, copilot 126k)
  //    and overstated reality by 3.9x to 74.7x, which manufactured a cost-per-success
  //    ranking that does not exist: the demo had Codex at 3.95x Claude Code's cost
  //    when real telemetry puts them in a dead heat ($0.222 vs $0.219).
  //
  // 2. Every honesty grade MUST match what that harness's real collector reports
  //    (scripts/telemetry/{codex,grok,copilot}.mjs). These were previously tuned "so
  //    the cross-harness panel shows the full spectrum", which inflated Codex and Grok
  //    and, worse, published a FALSE claim about a real third-party product: Copilot
  //    was graded occupancy/derived/partial (the weakest telemetry of the four) when
  //    copilot.mjs verifies on disk that its successes, errors, latency, and tokens are
  //    all `full`. The demo is not entitled to defame a competitor to fill a legend.
  //    A grade no collector in this repo can emit (`occupancy`) does not belong here.
  // Component mixes below (shares of billable tokens, plus cache reads as a
  // multiple of billable) are MEASURED from the owner's real harness usage on
  // 2026-07-11, like tokensPerInv. Emitting them is what routes each demo
  // harness through the same cache-aware pricing path the real collectors use.
  const others = [
    {
      source: "codex",
      label: "Codex",
      // 3,639 billable tokens/invocation measured; codex.mjs excludes cached input
      // from billable and reports it as a cacheRead component.
      perDay: { sessionBase: 9, invBase: 75, tokensPerInv: 3_600 },
      sr: 0.78,
      models: ["gpt-5.5"],
      mix: { input: 0.8956, output: 0.1044, cacheWrite: 0, cacheReadPerBillable: 16.82 },
      // codex.mjs CODEX_TRACKED - successes/errors are PARTIAL: only exec exit
      // codes, patch applies, MCP results, and hosted search statuses carry a
      // structured outcome (~10% of fires).
      tracked: {
        successes: "partial",
        errors: "partial",
        latency: "full",
        tokens: "full",
        cost: "modeled",
        // codex.mjs: skill loads are inferred from a SKILL.md path in a shell call.
        skills: "derived",
      },
      note: "Tool calls across sessions, deduped by call id. Successes and errors are partial: ~90% of fires record no structured outcome. Tokens are billable-new (cached input priced at the cache-read rate); cost is modeled at list prices, not billed.",
    },
    {
      source: "grok",
      label: "Grok",
      // 2,161 billable tokens/invocation, measured (fresh prompt + completion;
      // the ~95% cached prompt volume is a cacheRead component, not billable).
      perDay: { sessionBase: 4, invBase: 38, tokensPerInv: 2_200 },
      sr: 0.87,
      models: ["grok-build"],
      mix: { input: 0.8387, output: 0.1613, cacheWrite: 0, cacheReadPerBillable: 18.0 },
      // grok.mjs GROK_TRACKED: successes and errors are COUNTED from each
      // tool_completed.outcome (verified on disk, zero missing outcomes).
      // Latency is avgResponseTimeMs = model-response time, NOT per tool fire,
      // so it is partial. Tokens stay partial: unified.jsonl retention is not
      // guaranteed.
      tracked: {
        successes: "full",
        errors: "full",
        latency: "partial",
        tokens: "partial",
        cost: "modeled",
      },
      note: "Completed tool calls, with successes and errors counted from each tool outcome. Latency is model-response time, not per tool fire. Tokens are billable-new (cached prompt priced at the cache-read rate); cost is modeled at list prices, not billed.",
    },
    {
      source: "copilot",
      label: "Copilot",
      // 3,124 billable tokens/invocation, measured (fresh input + output + cache
      // writes; cache reads are a subset of inputTokens, reported separately).
      perDay: { sessionBase: 2, invBase: 23, tokensPerInv: 3_100 },
      sr: 0.85,
      models: ["gpt-5.4"],
      mix: { input: 0.2912, output: 0.1315, cacheWrite: 0.5772, cacheReadPerBillable: 10.67 },
      // copilot.mjs COPILOT_TRACKED - verified on disk: successes/errors are real
      // per-tool-call events, latency is the per-call start-to-complete delta,
      // tokens are real. Copilot's logs are among the BEST here.
      tracked: {
        successes: "full",
        errors: "full",
        latency: "full",
        tokens: "full",
        cost: "modeled",
      },
      note: "Per-tool-call events with an explicit success boolean; latency is the start-to-complete delta per tool call. Tokens are billable-new (cache reads priced at the cache-read rate); cost is modeled at list prices, not billed.",
    },
  ] as const;

  // Synthetic Codex skill loads: demo skill slugs (so Asset Detail shows a Codex line)
  // plus one name with no demo asset (so the unresolved row shows). Small, seeded counts.
  const DEMO_CODEX_SKILLS = ["sample-app-builder", "sample-data-modeler", "deneb-visuals", "skill-creator"];
  const srand = rng(424242);
  const codexSkillUses = DATES.flatMap((date) =>
    DEMO_CODEX_SKILLS.flatMap((skill) => {
      const loads = Math.floor(srand() * 4);
      return loads > 0 ? [{ skill, date, loads }] : [];
    }),
  );

  const orand = rng(909090);
  const otherSources = others.map((o) => {
    const daily = DATES.map((date, i) => {
      const invocations = Math.round(o.perDay.invBase * (0.9 + orand() * 0.2));
      const successes = Math.round(invocations * o.sr);
      const errors = invocations - successes;
      const tokens = invocations * o.perDay.tokensPerInv;
      return {
        date,
        sessions: o.perDay.sessionBase + (i % 3),
        invocations,
        successes,
        errors,
        latencyMs: 2200,
        tokens,
        ...(o.source === "codex" ? { unattributedLoads: i % 4 === 0 ? 1 : 0 } : {}),
      };
    });
    const dsum = (key: "invocations" | "successes" | "errors" | "tokens") =>
      daily.reduce((acc, day) => acc + day[key], 0);
    // The measured component mix routes this harness through the same
    // cache-aware pricing path as claude-code, so its cache traffic is priced
    // at the cache-read rate instead of the full blended rate.
    const billable = dsum("tokens");
    const otherComponents = {
      [o.models[0]]: {
        input: Math.round(billable * o.mix.input),
        output: Math.round(billable * o.mix.output),
        cacheWrite: Math.round(billable * o.mix.cacheWrite),
        cacheRead: Math.round(billable * o.mix.cacheReadPerBillable),
      },
    };
    return {
      source: o.source,
      label: o.label,
      sessions: daily.reduce((acc, day) => acc + day.sessions, 0),
      windowStart: WINDOW_START,
      windowEnd: WINDOW_END,
      invocations: dsum("invocations"),
      successes: dsum("successes"),
      errors: dsum("errors"),
      latencyMs: 2200,
      tokens: billable,
      cost: 0,
      models: [...o.models],
      tokensByModel: { [o.models[0]]: billable },
      componentsByModel: otherComponents,
      note: o.note,
      daily,
      ...(o.source === "codex" ? { skillUses: codexSkillUses } : {}),
      tracked: { ...o.tracked },
    };
  });

  const sources = [claude, ...otherSources].sort(
    (a, b) => b.invocations - a.invocations,
  );
  return { generatedAt: GENERATED_AT, sources };
}

/** The exact serialized bytes written to each imports file (trailing newline). */
export function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/** The telemetry meta the generator stamps, also reused by the fold-in contract check. */
export const DEMO_META: TelemetryMeta = {
  source: "claude-code",
  generatedAt: GENERATED_AT,
  windowStart: WINDOW_START,
  windowEnd: WINDOW_END,
  sessions: SESSIONS,
  tracked: {
    invocations: true,
    successes: true,
    errors: true,
    latency: true,
    refusals: true,
    tokens: true,
    cost: true,
    model: true,
  },
};

function main(): void {
  const built = build(seedDataset);

  // Run the contract on the dataset with the generated telemetry folded in, the
  // same gate SeedDataSource applies before persistence.
  const folded = applyTelemetry(seedDataset, built.rows, DEMO_META);
  const violations = runDataSourceContract(folded);
  if (violations.length > 0) {
    throw new Error(
      `Generated telemetry violates the contract: ${violations[0]}`,
    );
  }

  const utilOut = join(repoRoot, "src/data/imports/utilization.json");
  const harnessOut = join(repoRoot, "src/data/imports/harness-usage.json");
  writeFileSync(utilOut, serialize(utilizationFile(built)));
  writeFileSync(harnessOut, serialize(harnessFile(built)));
  console.log(
    `generate-demo-telemetry: ${built.rows.length} rows over ${seedDataset.assets.length} assets -> ${utilOut}`,
  );
}

// Run only when executed directly (tsx scripts/generate-demo-telemetry.mts), not
// when imported by the test, which calls the exported pure builders instead.
const invokedDirectly =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main();
