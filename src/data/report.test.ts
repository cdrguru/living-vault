import { describe, expect, it } from "vitest";

import {
  buildTokenCapitalReport,
  hasMeasurement,
  renderShareable,
  renderTerminal,
  type ReportInput,
} from "./report";
import type {
  AssetRow,
  HarnessUsage,
  UtilizationRow,
  VaultDataset,
} from "./types";

const TENANT = "t1";

// Distinctive, unmistakable names. The privacy invariant below asserts that NONE of
// these reach the shareable artifact, and a name like "review" would pass that test by
// coincidence rather than by correctness.
const asset = (id: string, name: string, extra: Partial<AssetRow> = {}): AssetRow => ({
  id,
  tenantId: TENANT,
  type: "skill",
  name,
  slug: `slug-${name.toLowerCase()}`,
  description: `describes ${name}`,
  body: "",
  version: "1.0.0",
  status: "active",
  riskLevel: "low",
  maturity: 3,
  tier: "custom",
  contentHash: `hash-${id}`,
  createdAt: "2026-01-01",
  updatedAt: "2026-01-01",
  ...extra,
});

const usage = (assetId: string, invocations: number): UtilizationRow => ({
  id: `u-${assetId}`,
  tenantId: TENANT,
  assetId,
  date: "2026-06-01",
  invocations,
  successes: invocations,
  errors: 0,
  refusals: 0,
  latencyMs: 100,
  tokens: 1000,
  cost: 1,
});

const dataset = (
  assets: AssetRow[],
  utilization: UtilizationRow[],
): VaultDataset => ({
  routingStats: [],
  assets,
  tags: [],
  origins: [],
  owners: [],
  bundles: [],
  assetTags: [],
  dependencies: [],
  bundleMemberships: [],
  utilization,
  assetRevisions: [],
  evalResults: [],
  baselines: [],
  interventions: [],
});

const harness = (
  source: string,
  over: Partial<HarnessUsage> = {},
): HarnessUsage => ({
  source,
  label: source,
  sessions: 10,
  windowStart: "2026-06-01",
  windowEnd: "2026-06-30",
  invocations: 100,
  successes: 90,
  errors: 10,
  latencyMs: 200,
  tokens: 1_000_000,
  cost: 0,
  models: ["claude-opus-4-8"],
  tracked: {
    successes: "full",
    errors: "full",
    latency: "full",
    tokens: "full",
    cost: "modeled",
  },
  ...over,
});

const input = (over: Partial<ReportInput> = {}): ReportInput => ({
  dataset: dataset(
    [asset("a1", "ZZQQ-ALPHA"), asset("a2", "ZZQQ-BETA")],
    [usage("a1", 60)],
  ),
  unattributed: [{ key: "ZZQQ-GHOST", count: 40 }],
  harnesses: [harness("claude")],
  generatedAt: "2026-07-13T00:00:00.000Z",
  attributionScope: "Claude Code",
  ...over,
});

describe("buildTokenCapitalReport", () => {
  it("rates attribution as the attributed share of all collected usage", () => {
    const report = buildTokenCapitalReport(input());
    // 60 attributed invocations, 40 orphaned = 60%.
    expect(report.attribution.attributed).toBe(60);
    expect(report.attribution.orphaned).toBe(40);
    expect(report.attribution.rate).toBeCloseTo(0.6);
  });

  it("reports no attribution rate at all when nothing was collected", () => {
    const report = buildTokenCapitalReport(
      input({
        dataset: dataset([asset("a1", "ZZQQ-ALPHA")], []),
        unattributed: [],
      }),
    );
    // Zero over zero is not zero percent. A product that never fakes a number must
    // return null here, so the renderer can say "not measured" instead of "0%".
    expect(report.attribution.rate).toBeNull();
  });

  it("counts duplicate clusters by content hash, not by name", () => {
    const report = buildTokenCapitalReport(
      input({
        dataset: dataset(
          [
            asset("a1", "ZZQQ-ALPHA", { contentHash: "same" }),
            asset("a2", "ZZQQ-BETA", { contentHash: "same" }),
            asset("a3", "ZZQQ-GAMMA", { contentHash: "other" }),
          ],
          [],
        ),
      }),
    );
    expect(report.duplicates.clusters).toBe(1);
    expect(report.duplicates.assets).toBe(2);
  });

  it("leaves an unpriced harness unpriced rather than reporting zero cost", () => {
    const report = buildTokenCapitalReport(
      input({
        harnesses: [
          harness("copilot", {
            tokens: 0,
            tracked: {
              successes: "partial",
              errors: "none",
              latency: "none",
              tokens: "none",
              cost: "none",
            },
          }),
        ],
      }),
    );
    // A harness whose logs carry no tokens cannot be priced. Zero would read as
    // "this harness is free", which is a fabricated number.
    expect(report.harnesses[0].cost).toBeNull();
    expect(report.harnesses[0].honesty.tokens).toBe("none");
  });
});

describe("renderShareable", () => {
  const names = ["ZZQQ-ALPHA", "ZZQQ-BETA", "ZZQQ-GAMMA", "ZZQQ-GHOST"];

  it("never leaks an asset name, slug, or usage key", () => {
    // THE load-bearing test. The shareable artifact exists to be posted in public.
    // It carries counts, rates, and honesty grades, and nothing that identifies what
    // the practitioner actually built. If this ever fails, the funnel is a leak.
    const markdown = renderShareable(
      buildTokenCapitalReport(
        input({
          dataset: dataset(
            [asset("a1", "ZZQQ-ALPHA"), asset("a2", "ZZQQ-BETA")],
            [usage("a1", 60)],
          ),
          unattributed: [{ key: "ZZQQ-GHOST", count: 40 }],
        }),
      ),
    );
    for (const name of names) {
      expect(markdown).not.toContain(name);
      expect(markdown).not.toContain(name.toLowerCase());
    }
    expect(markdown).not.toContain("slug-");
  });

  it("labels an unmeasured rate instead of printing a number for it", () => {
    const markdown = renderShareable(
      buildTokenCapitalReport(
        input({ dataset: dataset([asset("a1", "ZZQQ-ALPHA")], []), unattributed: [] }),
      ),
    );
    expect(markdown).toContain("not measured");
    expect(markdown).not.toMatch(/attributed[^\n]*0%/i);
  });

  it("carries the honesty grade next to each harness", () => {
    const markdown = renderShareable(buildTokenCapitalReport(input()));
    expect(markdown).toMatch(/modeled/);
  });

  it("scopes the attribution rate, and says the harness table is a different unit", () => {
    // The harness table counts events across EVERY harness, while attribution is measured
    // only where a harness logs which asset ran. Publishing both unlabeled invites the
    // reader to divide one by the other. An unscoped rate is a fabricated number.
    const markdown = renderShareable(buildTokenCapitalReport(input()));
    expect(markdown).toContain("my measured Claude Code usage");
    expect(markdown).toContain("NOT the denominator");
  });
});

describe("renderTerminal", () => {
  it("does name assets, because it is the practitioner's own private view", () => {
    const terminal = renderTerminal(buildTokenCapitalReport(input()));
    expect(terminal).toContain("60%");
  });
});

describe("the zero state", () => {
  const empty = () =>
    buildTokenCapitalReport(
      input({ dataset: dataset([], []), unattributed: [], harnesses: [] }),
    );

  it("knows the difference between a measurement of zero and no measurement", () => {
    expect(hasMeasurement(empty())).toBe(false);
    expect(hasMeasurement(buildTokenCapitalReport(input()))).toBe(true);
  });

  it("says nothing was found, rather than printing a scoreboard of zeroes", () => {
    // A grid of zeroes reads as "your library is empty and healthy". The truth is "we did not
    // find your library", and those are different claims.
    const terminal = renderTerminal(empty());
    expect(terminal).toContain("No agentic assets found");
    expect(terminal).not.toContain("Shelfware             0");
  });

  it("explains why other harnesses cannot fill the gap", () => {
    // A Codex-only or Gemini-only user is a real visitor. Telling them "0 assets" with no reason
    // reads as a broken tool. The reason is real and is the product's whole thesis: those
    // harnesses do not record which asset ran.
    expect(renderTerminal(empty())).toContain("do not record WHICH");
  });
});

describe("routing accounting in the report", () => {
  const routingDataset = () => {
    const base = dataset(
      [asset("as-1", "ZZQQ-ALPHA")],
      [usage("as-1", 10)],
    );
    return {
      ...base,
      routingStats: [
        {
          id: "rs-1",
          tenantId: TENANT,
          assetId: "as-1",
          date: "2026-07-20",
          localHits: 6,
          externalFallbacks: 2,
          belowThreshold: 1,
          externalCost: 0.5,
          avoidedCostEstimate: 2,
        },
      ],
      routingStatsMeta: {
        source: "router",
        generatedAt: "2026-07-20T00:00:00Z",
        windowStart: "2026-07-13",
        windowEnd: "2026-07-20",
        decisions: 9,
        tracked: {
          localHits: "full" as const,
          externalFallbacks: "full" as const,
          belowThreshold: "full" as const,
          externalCost: "full" as const,
          avoidedCostEstimate: "modeled" as const,
        },
      },
    };
  };

  it("is null, and renders no routing section, when no router has reported", () => {
    const report = buildTokenCapitalReport(input());
    expect(report.routing).toBeNull();
    expect(renderShareable(report)).not.toContain("## Routing");
    expect(renderTerminal(report)).not.toContain("Routing cache hits");
  });

  it("reports the hit rate over routed traffic and both cost sides", () => {
    const report = buildTokenCapitalReport(input({ dataset: routingDataset() }));
    expect(report.routing?.hitRate).toBeCloseTo(0.75);
    expect(report.routing?.routedDecisions).toBe(8);
    expect(report.routing?.externalCost).toBeCloseTo(0.5);
    expect(report.routing?.avoidedCostEstimate).toBeCloseTo(2);
    expect(report.routing?.tracked?.avoidedCostEstimate).toBe("modeled");
  });

  it("keeps the shareable routing block aggregate-only and scope-labeled", () => {
    const shareable = renderShareable(
      buildTokenCapitalReport(input({ dataset: routingDataset() })),
    );
    expect(shareable).toContain("## Routing (of routed traffic only)");
    expect(shareable).toContain("75% cache hit rate");
    // The modeled counterfactual must carry its grade, never pass as measured.
    expect(shareable).toContain("modeled: a counterfactual, not measured spend");
    // Still no asset names anywhere in the public artifact.
    expect(shareable).not.toContain("ZZQQ-ALPHA");
  });

  it("labels the terminal routing lines with scope and grades", () => {
    const terminal = renderTerminal(
      buildTokenCapitalReport(input({ dataset: routingDataset() })),
    );
    expect(terminal).toContain("Routing cache hits    75%");
    expect(terminal).toContain("routed traffic only");
    expect(terminal).toContain("modeled, counterfactual");
  });
});
