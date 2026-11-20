import { harnessSpend } from "./harnessCost";
import { routingTotals } from "./routingMetrics";
import {
  classificationCounts,
  duplicateClusters,
  staleAssets,
  type Quadrant,
} from "./metrics";
import type {
  HarnessMetricQuality,
  HarnessUsage,
  VaultDataset,
} from "./types";

/**
 * The token-capital report: the first thing a practitioner sees after pointing the
 * Vault at their own machine, and the artifact they can share.
 *
 * Two renderers, and the difference between them is the whole point:
 *
 *   renderTerminal  is PRIVATE. It runs on the practitioner's machine, for their eyes,
 *                   and it names assets, because a report that will not tell you WHICH
 *                   skill is shelfware is not actionable.
 *
 *   renderShareable is PUBLIC. It is written to a file the practitioner is invited to
 *                   post, and it must therefore carry counts, rates, and honesty grades
 *                   and NOTHING that identifies what they built. No asset name, no slug,
 *                   no usage key, no path. The guard is report.test.ts, and it is the
 *                   load-bearing test in this file: the funnel depends on people sharing
 *                   this, and a funnel that leaks a private library is not a funnel.
 *
 * Pure: no clock, no filesystem. `generatedAt` is injected so the report is
 * deterministic and testable.
 */

export interface ReportInput {
  dataset: VaultDataset;
  /** Usage keys that resolved to no governed asset, with their measured counts. */
  unattributed: { key: string; count: number }[];
  harnesses: HarnessUsage[];
  generatedAt: string;
  /**
   * The harness whose logs the attribution rate is measured from. Load-bearing, not
   * decoration: asset-level attribution needs a harness that records WHICH reusable
   * asset each invocation used, and today only Claude Code's transcripts do. The
   * per-harness table below therefore counts a DIFFERENT unit (harness events, across
   * every harness) and its totals are not the attribution denominator. Leaving that
   * unsaid would invite the reader to divide one by the other and get a fiction, which
   * is exactly the failure this product exists to refuse.
   */
  attributionScope: string;
}

export interface ReportHarness {
  source: string;
  label: string;
  invocations: number;
  tokens: number;
  /** Null when the harness logs no tokens to price. Never zero, which would read as free. */
  cost: number | null;
  honesty: {
    successes: HarnessMetricQuality;
    errors: HarnessMetricQuality;
    latency: HarnessMetricQuality;
    tokens: HarnessMetricQuality;
    cost: HarnessMetricQuality;
  };
}

export interface TokenCapitalReport {
  generatedAt: string;
  totals: { assets: number; byType: Record<string, number> };
  attribution: {
    attributed: number;
    orphaned: number;
    /** Null when nothing was collected. Zero over zero is not zero percent. */
    rate: number | null;
    /** The harness this rate is measured from. See ReportInput.attributionScope. */
    scope: string;
  };
  classification: Record<Quadrant, number> & { insufficientEvidence: number };
  duplicates: { clusters: number; assets: number };
  stale: number;
  spend: { total: number | null };
  /**
   * Routing accounting, present only when a router (external or local)
   * has imported routing stats. Null means "no router ran", which must never
   * render as a zero hit rate. Every number is scoped to ROUTED traffic only.
   */
  routing: {
    routedDecisions: number;
    localHits: number;
    externalFallbacks: number;
    /** localHits / routedDecisions; null when nothing was routed in the window. */
    hitRate: number | null;
    /** Measured external spend on fallbacks. A measured zero is honestly zero. */
    externalCost: number;
    /** Modeled counterfactual, never measured spend. */
    avoidedCostEstimate: number;
    /** Honesty grades from the import meta; null when the meta is absent. */
    tracked: {
      externalCost: HarnessMetricQuality;
      avoidedCostEstimate: HarnessMetricQuality;
    } | null;
  } | null;
  harnesses: ReportHarness[];
}

export function buildTokenCapitalReport(input: ReportInput): TokenCapitalReport {
  const { dataset, unattributed, harnesses, generatedAt, attributionScope } = input;

  const attributed = dataset.utilization.reduce(
    (sum, row) => sum + row.invocations,
    0,
  );
  const orphaned = unattributed.reduce((sum, row) => sum + row.count, 0);
  const collected = attributed + orphaned;

  const byType: Record<string, number> = {};
  for (const asset of dataset.assets) {
    byType[asset.type] = (byType[asset.type] ?? 0) + 1;
  }

  const clusters = duplicateClusters(dataset);
  const spend = harnessSpend(harnesses);
  const priced = spend.filter((row) => row.priced);

  return {
    generatedAt,
    totals: { assets: dataset.assets.length, byType },
    attribution: {
      attributed,
      orphaned,
      rate: collected > 0 ? attributed / collected : null,
      scope: attributionScope,
    },
    classification: classificationCounts(dataset),
    duplicates: {
      clusters: clusters.length,
      assets: clusters.reduce((sum, group) => sum + group.length, 0),
    },
    stale: staleAssets(dataset).length,
    spend: {
      total:
        priced.length > 0
          ? priced.reduce((sum, row) => sum + row.cost, 0)
          : null,
    },
    routing:
      dataset.routingStats.length === 0
        ? null
        : (() => {
            const totals = routingTotals(dataset);
            return {
              routedDecisions: totals.routedDecisions,
              localHits: totals.localHits,
              externalFallbacks: totals.externalFallbacks,
              hitRate: totals.hitRate,
              externalCost: totals.externalCost,
              avoidedCostEstimate: totals.avoidedCostEstimate,
              tracked: dataset.routingStatsMeta
                ? {
                    externalCost: dataset.routingStatsMeta.tracked.externalCost,
                    avoidedCostEstimate:
                      dataset.routingStatsMeta.tracked.avoidedCostEstimate,
                  }
                : null,
            };
          })(),
    harnesses: harnesses.map((source): ReportHarness => {
      const row = spend.find((s) => s.source === source.source);
      return {
        source: source.source,
        label: source.label,
        invocations: source.invocations,
        tokens: source.tokens,
        cost: row?.priced ? row.cost : null,
        honesty: source.tracked,
      };
    }),
  };
}

const pct = (rate: number | null): string =>
  rate === null ? "not measured" : `${Math.round(rate * 100)}%`;

const usd = (value: number | null): string =>
  value === null
    ? "not measured"
    : `$${value.toLocaleString("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

/**
 * The public artifact. Aggregate only: every number here is a count, a rate, or a
 * grade. Adding an asset name, slug, path, or usage key to this string is a privacy
 * regression, and report.test.ts will fail if you do.
 */
export function renderShareable(report: TokenCapitalReport): string {
  const { attribution, classification, duplicates, totals } = report;

  const harnessLines = report.harnesses
    .map(
      (h) =>
        `| ${h.label} | ${h.invocations.toLocaleString()} | ${usd(h.cost)} | ${h.honesty.tokens} tokens, ${h.honesty.cost} cost |`,
    )
    .join("\n");

  return [
    "# My token capital",
    "",
    `Measured with The Living Vault on ${report.generatedAt.slice(0, 10)}. Every number below is a`,
    "count, a rate, or a measurement-honesty grade. No asset names, no prompts, no content.",
    "",
    "## The headline",
    "",
    `- **${pct(attribution.rate)} of my measured ${attribution.scope} usage attributed to a governed asset.**`,
    `  The rest (${attribution.orphaned.toLocaleString()} invocations) landed orphaned: real work, on assets I do not have a record of.`,
    `- I govern **${totals.assets}** reusable assets.`,
    `- **${classification.Shelfware}** are shelfware and **${classification["Dead weight"]}** are dead weight, on graded evidence.`,
    `- **${classification.insufficientEvidence}** do not have enough evidence to judge at all, and the Vault says so instead of guessing.`,
    `- **${duplicates.assets}** assets are exact duplicates of another, across ${duplicates.clusters} cluster(s).`,
    `- **${report.stale}** are stale.`,
    `- Modeled spend across all harnesses: **${usd(report.spend.total)}**.`,
    ...(report.routing
      ? [
          "",
          "## Routing (of routed traffic only)",
          "",
          `- **${pct(report.routing.hitRate)} cache hit rate**: ${report.routing.localHits.toLocaleString()} of ${report.routing.routedDecisions.toLocaleString()} routed decisions were answered locally by a governed asset.`,
          `- Measured external routing spend: **${usd(report.routing.externalCost)}** (${report.routing.tracked?.externalCost ?? "ungraded"}).`,
          `- Avoided external cost: **${usd(report.routing.avoidedCostEstimate)}** (${report.routing.tracked?.avoidedCostEstimate ?? "ungraded"}: a counterfactual, not measured spend).`,
          "",
          "These rates cover only traffic that went through the router. Usage that never touched",
          "the router is not in the denominator, so this is not a fleet-wide figure.",
        ]
      : []),
    "",
    "## By harness",
    "",
    "| Harness | Invocations | Modeled cost | Honesty |",
    "| ------- | ----------- | ------------ | ------- |",
    harnessLines,
    "",
    "The honesty column is the part that matters. A harness that does not log tokens is shown",
    "as unpriced, never as free, because a fabricated zero is worse than an admitted gap.",
    "",
    `These invocation counts are harness events across every harness. They are NOT the denominator`,
    `of the attribution rate above, which is measured only from ${attribution.scope}, the one harness`,
    `whose logs record which reusable asset each invocation actually used. Dividing one by the other`,
    "would produce a number neither measurement supports.",
    "",
    "Measure your own: `npx the-living-vault report`",
    "",
  ].join("\n");
}

/**
 * True when the scan actually found something to measure. A report over zero assets is not a
 * report of a healthy library, it is the absence of a measurement, and the two must never render
 * the same way. Callers use this to refuse to write a shareable artifact that says nothing.
 */
export function hasMeasurement(report: TokenCapitalReport): boolean {
  return report.totals.assets > 0;
}

/** The private view. Names assets, because the practitioner needs to know which ones. */
export function renderTerminal(report: TokenCapitalReport): string {
  const { attribution, classification, duplicates } = report;

  // The scan ran and found no governed assets. Say that, and say what it looked for. Rendering a
  // scoreboard of zeroes would read as "your library is empty and healthy" when the truth is "we
  // did not find your library."
  if (!hasMeasurement(report)) {
    return [
      "",
      "  Your token capital",
      "  ==================",
      "",
      "  No agentic assets found on this machine.",
      "",
      "  The Vault scanned for skills, subagents, commands, and MCP servers under ~/.claude and",
      "  found none to govern, so there is nothing to measure yet. It will not invent a number.",
      "",
      "  This is expected if you have not used Claude Code on this machine. Other harnesses",
      "  (Codex, Copilot, Grok, Gemini) report usage totals, but their logs do not record WHICH",
      "  reusable asset ran, so they cannot be attributed to a catalog.",
      "",
    ].join("\n");
  }

  const lines = [
    "",
    "  Your token capital",
    "  ==================",
    "",
    `  Attributed usage      ${pct(attribution.rate)}  (${attribution.attributed.toLocaleString()} attributed, ${attribution.orphaned.toLocaleString()} orphaned)`,
    `                        measured from ${attribution.scope} only, the one harness that logs which asset ran`,
    `  Governed assets       ${report.totals.assets}`,
    `  Shelfware             ${classification.Shelfware}`,
    `  Dead weight           ${classification["Dead weight"]}`,
    `  Stars                 ${classification.Stars}`,
    `  Not enough evidence   ${classification.insufficientEvidence}`,
    `  Exact duplicates      ${duplicates.assets} across ${duplicates.clusters} cluster(s)`,
    `  Stale                 ${report.stale}`,
    `  Modeled spend         ${usd(report.spend.total)}`,
    ...(report.routing
      ? [
          `  Routing cache hits    ${pct(report.routing.hitRate)}  (${report.routing.localHits.toLocaleString()} local, ${report.routing.externalFallbacks.toLocaleString()} external; routed traffic only)`,
          `  External routing cost ${usd(report.routing.externalCost)}  (${report.routing.tracked?.externalCost ?? "ungraded"})`,
          `  Avoided cost, modeled ${usd(report.routing.avoidedCostEstimate)}  (${report.routing.tracked?.avoidedCostEstimate ?? "ungraded"}, counterfactual)`,
        ]
      : []),
    "",
  ];

  if (attribution.rate !== null && attribution.rate < 0.8 && attribution.orphaned > 0) {
    lines.push(
      `  ${attribution.orphaned.toLocaleString()} invocations resolved to no governed asset. That is real work`,
      "  you are doing with capability you have no record of. Run the dashboard to see it:",
      "",
      "    npx the-living-vault start",
      "",
    );
  }

  return lines.join("\n");
}
