import { describe, expect, it } from "vitest";

import {
  allocateSpendByInvocations,
  assetSignal,
  bundlesOf,
  classifyAsset,
  coverageMatrix,
  dailySeries,
  dependenciesOf,
  duplicateClusters,
  effectiveAssetRate,
  evidenceCoverage,
  classificationCounts,
  costByType,
  effectivenessSignals,
  composeEffectiveScore,
  gradeConfidence,
  governanceChecks,
  recommendedActions,
  scoreAsset,
  scoreAssets,
  utilizationByAsset,
  utilizationByAssetWindowed,
  utilizationDates,
  usageByModel,
  wastedSpendAssets,
  windowDaysOf,
  assetTrend,
  assetTrends,
  regressingAssets,
  driftDirection,
  splitDriftWindows,
  EFFECTIVE_THRESHOLD,
  type AssetScore,
  type Quadrant,
  type UsageSummary,
} from "./metrics";
import { nodeSignal } from "@/dashboard/model/signals";
import {
  makeAsset as asset,
  makeDataset,
  makeUtilRow as utilRow,
} from "./__tests__/fixtures";
import { mergeProjection } from "./merge";
import { fabricLibraryProjection } from "./projection";
import { seedDataset, TENANT } from "./seed";
import type { AssetRow, UtilizationRow, VaultDataset } from "./types";

const fabricDataset = mergeProjection(
  seedDataset,
  fabricLibraryProjection,
  TENANT,
);

const windowDataset: VaultDataset = makeDataset({
  utilization: [
    utilRow("a1", "2026-06-01", 10),
    utilRow("a1", "2026-06-02", 5),
    utilRow("a1", "2026-06-10", 3),
    utilRow("a2", "2026-06-02", 7),
  ],
});

describe("metrics", () => {
  it("scores governed and effective dimensions for an asset", () => {
    const usage = utilizationByAsset(seedDataset);
    const score = scoreAsset(seedDataset.assets[0], seedDataset, usage);
    expect(score.governedScore).toBeGreaterThanOrEqual(0);
    expect(score.governedScore).toBeLessThanOrEqual(1);
    if (score.effectiveScore !== null) {
      expect(score.effectiveScore).toBeGreaterThanOrEqual(0);
      expect(score.effectiveScore).toBeLessThanOrEqual(1);
    }
    expect(score.quadrant).toMatch(/Stars|Risks|Shelfware|Dead weight/);
  });

  it("computes a populated Effective Asset Rate and classification counts", () => {
    const counts = classificationCounts(seedDataset);
    expect(Object.values(counts).reduce((sum, count) => sum + count, 0)).toBe(
      seedDataset.assets.length,
    );
    expect(effectiveAssetRate(seedDataset)).toBeGreaterThan(0);
  });

  it("detects duplicate asset clusters", () => {
    expect(duplicateClusters(seedDataset).length).toBeGreaterThanOrEqual(1);
  });

  it("builds a pillar by capability coverage matrix from the fabric library", () => {
    const matrix = coverageMatrix(fabricDataset);
    expect(matrix.pillars.length).toBeGreaterThan(0);
    expect(matrix.capabilities.length).toBeGreaterThan(0);
    expect(matrix.cells.length).toBe(
      matrix.pillars.length * matrix.capabilities.length,
    );
    expect(matrix.cells.some((cell) => cell.count > 0)).toBe(true);
    expect(
      matrix.cells.every((cell) => cell.maturity >= 0 && cell.maturity <= 1),
    ).toBe(true);
  });

  it("returns no pillar rows when the dataset has no pillar tags", () => {
    const noPillars: VaultDataset = {
      ...seedDataset,
      tags: seedDataset.tags.filter((tag) => tag.kind !== "pillar"),
    };
    const matrix = coverageMatrix(noPillars);
    expect(matrix.pillars).toHaveLength(0);
    expect(matrix.cells).toHaveLength(0);
  });

  it("builds a credible partial coverage matrix from the seed pillar tags", () => {
    // The seed now ships synthetic pillar tags assigned to a subset of assets, so
    // the Coverage surface tells a partial story on load (several covered cells and
    // visible gaps) instead of the empty setup CTA.
    const matrix = coverageMatrix(seedDataset);
    expect(matrix.pillars.length).toBeGreaterThan(0);
    expect(matrix.capabilities.length).toBeGreaterThan(0);
    const total = matrix.pillars.length * matrix.capabilities.length;
    const populated = matrix.cells.filter((cell) => cell.count > 0).length;
    // Partial: not empty (a real story) and not full (room to improve).
    expect(populated).toBeGreaterThan(0);
    expect(populated).toBeLessThan(total);
  });

  it("counts a multi-pillar asset in every matching cell, so cell counts can exceed the asset total (by design)", () => {
    // One asset tagged two pillars and one capability sits in exactly two cells:
    // (pillar-a, cap-x) and (pillar-b, cap-x). Membership is intentionally
    // multi-cell, so the sum of cell counts can exceed dataset.assets.length.
    const ds: VaultDataset = {
      ...windowDataset,
      assets: [asset("multi")],
      tags: [
        { id: "p-a", tenantId: TENANT, kind: "pillar", name: "Pillar A" },
        { id: "p-b", tenantId: TENANT, kind: "pillar", name: "Pillar B" },
        { id: "c-x", tenantId: TENANT, kind: "capability", name: "Cap X" },
      ],
      assetTags: [
        { assetId: "multi", tagId: "p-a" },
        { assetId: "multi", tagId: "p-b" },
        { assetId: "multi", tagId: "c-x" },
      ],
      utilization: [],
    };
    const matrix = coverageMatrix(ds);
    const populated = matrix.cells.filter((cell) => cell.count > 0);
    expect(populated).toHaveLength(2);
    expect(populated.every((cell) => cell.count === 1)).toBe(true);

    const cellSum = matrix.cells.reduce((sum, cell) => sum + cell.count, 0);
    expect(cellSum).toBeGreaterThanOrEqual(ds.assets.length);
    // The one asset is double counted across pillars, so the sum exceeds the total.
    expect(cellSum).toBe(2);
    expect(cellSum).toBeGreaterThan(ds.assets.length);
  });

  it("resolves an asset requires and required-by edges", () => {
    const edge = fabricDataset.dependencies[0];
    const fromSource = dependenciesOf(fabricDataset, edge.assetId);
    expect(
      fromSource.requires.some((asset) => asset.id === edge.dependsOnAssetId),
    ).toBe(true);
    const fromTarget = dependenciesOf(fabricDataset, edge.dependsOnAssetId);
    expect(
      fromTarget.requiredBy.some((asset) => asset.id === edge.assetId),
    ).toBe(true);
  });

  it("lists the bundles an asset belongs to", () => {
    const membership = fabricDataset.bundleMemberships[0];
    const bundles = bundlesOf(fabricDataset, membership.assetId);
    expect(bundles.some((bundle) => bundle.id === membership.bundleId)).toBe(
      true,
    );
  });

  it("windows utilization by date and matches the unwindowed total over the full window", () => {
    expect(
      utilizationByAssetWindowed(windowDataset).get("a1")?.invocations,
    ).toBe(utilizationByAsset(windowDataset).get("a1")?.invocations);
    expect(
      utilizationByAssetWindowed(windowDataset, {
        start: "2026-06-01",
        end: "2026-06-02",
      }).get("a1")?.invocations,
    ).toBe(15);
    expect(
      utilizationByAssetWindowed(windowDataset, {
        start: "2026-06-05",
        end: "2026-06-15",
      }).get("a1")?.invocations,
    ).toBe(3);
    expect(
      utilizationByAssetWindowed(windowDataset, {
        start: "2026-06-20",
        end: "2026-06-30",
      }).get("a1"),
    ).toBeUndefined();
  });

  it("builds a per asset daily invocation series sorted by date", () => {
    expect(dailySeries(windowDataset, "a1")).toEqual([10, 5, 3]);
    expect(
      dailySeries(windowDataset, "a1", {
        start: "2026-06-01",
        end: "2026-06-02",
      }),
    ).toEqual([10, 5]);
    expect(dailySeries(windowDataset, "a2")).toEqual([7]);
    expect(dailySeries(windowDataset, "unknown-asset")).toEqual([]);
  });

  // Shared by the wasted-spend tests: one effective earner, two ineffective
  // spenders (big and small), and one ineffective-but-free asset.
  const wastedDs: VaultDataset = {
    ...windowDataset,
    assets: [
      // Effective (effectiveScore >= 0.60) with cost: earns its spend, excluded.
      asset("w-star"),
      // Ineffective with high cost: worst, listed first.
      asset("w-dead-big"),
      // Ineffective with smaller cost: listed second.
      asset("w-dead-small"),
      // Ineffective but free: no spend wasted, excluded.
      asset("w-free"),
    ],
    utilization: [
      { ...utilRow("w-star", "2026-06-01", 200), successes: 180, cost: 50 },
      { ...utilRow("w-dead-big", "2026-06-01", 10), successes: 2, cost: 90 },
      {
        ...utilRow("w-dead-small", "2026-06-01", 10),
        successes: 2,
        cost: 12,
      },
      { ...utilRow("w-free", "2026-06-01", 10), successes: 2, cost: 0 },
    ],
  };

  /** The modeled cost basis: each asset priced at its own utilization cost. */
  const modeledCostOf = (scored: AssetScore[]) => {
    const byId = new Map(scored.map((score) => [score.asset.id, score.usage.cost]));
    return (assetId: string) => byId.get(assetId) ?? 0;
  };

  it("ranks costly-but-ineffective assets worst first and excludes effective or free ones", () => {
    const scored = scoreAssets(wastedDs);
    const wasted = wastedSpendAssets(scored, modeledCostOf(scored));
    expect(wasted.map((row) => row.asset.id)).toEqual([
      "w-dead-big",
      "w-dead-small",
    ]);
    expect(wasted[0].cost).toBe(90);
    expect(wasted.every((row) => row.cost > 0)).toBe(true);
    expect(wasted.some((row) => row.asset.id === "w-star")).toBe(false);
    expect(wasted.some((row) => row.asset.id === "w-free")).toBe(false);
  });

  it("prices wasted spend through the caller's cost basis, not the modeled cost", () => {
    // An allocated basis prices w-free (modeled cost 0) at 25 and zeroes
    // w-dead-small, so inclusion and ranking follow the basis, not utilization.
    const scored = scoreAssets(wastedDs);
    const allocated = new Map([
      ["w-dead-big", 40],
      ["w-free", 25],
    ]);
    const wasted = wastedSpendAssets(
      scored,
      (assetId) => allocated.get(assetId) ?? 0,
    );
    expect(wasted.map((row) => row.asset.id)).toEqual([
      "w-dead-big",
      "w-free",
    ]);
    expect(wasted[1].cost).toBe(25);
  });

  it("aggregates spend by asset type, dropping free types and sorting worst first", () => {
    const ds: VaultDataset = {
      ...windowDataset,
      assets: [
        asset("t-skill-a"),
        asset("t-skill-b"),
        asset("t-prompt", { type: "prompt" }),
        // A type with no spend at all: dropped from the chart rows.
        asset("t-hook", { type: "hook" }),
      ],
      utilization: [
        { ...utilRow("t-skill-a", "2026-06-01", 10), cost: 12.346 },
        { ...utilRow("t-skill-b", "2026-06-01", 10), cost: 20 },
        { ...utilRow("t-prompt", "2026-06-01", 10), cost: 5 },
        { ...utilRow("t-hook", "2026-06-01", 10), cost: 0 },
      ],
    };
    const scored = scoreAssets(ds);
    // Costs round to cents: 12.346 + 20 = 32.346 reads as 32.35.
    expect(costByType(scored, modeledCostOf(scored))).toEqual([
      { type: "skill", cost: 32.35 },
      { type: "prompt", cost: 5 },
    ]);
  });

  it("allocates a spend pool across assets in proportion to their invocations", () => {
    // windowDataset utilization: a1 = 10 + 5 + 3 = 18, a2 = 7, total = 25.
    const ds: VaultDataset = {
      ...windowDataset,
      assets: [asset("a1"), asset("a2")],
    };
    const allocation = allocateSpendByInvocations(scoreAssets(ds), 100);
    expect(allocation.get("a1")).toBeCloseTo(72); // 18/25 * 100
    expect(allocation.get("a2")).toBeCloseTo(28); // 7/25 * 100
    // The allocation conserves the pool: shares sum back to the total spend.
    expect(
      [...allocation.values()].reduce((sum, cost) => sum + cost, 0),
    ).toBeCloseTo(100);
  });

  it("allocates zero to every asset when there are no invocations to weigh by", () => {
    const ds: VaultDataset = {
      ...windowDataset,
      assets: [asset("z1"), asset("z2")],
      utilization: [],
    };
    const allocation = allocateSpendByInvocations(scoreAssets(ds), 100);
    expect(allocation.get("z1")).toBe(0);
    expect(allocation.get("z2")).toBe(0);
  });

  it("lists the sorted unique utilization dates for scrubbing", () => {
    expect(utilizationDates(windowDataset)).toEqual([
      "2026-06-01",
      "2026-06-02",
      "2026-06-10",
    ]);
    expect(utilizationDates({ ...windowDataset, utilization: [] })).toEqual([]);
  });

  it("derives the six governance checks in scoring order and rolls them up to the governed score", () => {
    const asset = seedDataset.assets[0];
    const checks = governanceChecks(asset, seedDataset);
    expect(checks.map((check) => check.id)).toEqual([
      "description",
      "tag",
      "owner",
      "status",
      "origin",
      "deps",
    ]);
    expect(
      checks.every(
        (check) => typeof check.label === "string" && check.label.length > 0,
      ),
    ).toBe(true);
    const score = scoreAsset(
      asset,
      seedDataset,
      utilizationByAsset(seedDataset),
    );
    expect(score.governedScore).toBeCloseTo(
      checks.filter((check) => check.pass).length / checks.length,
      10,
    );
  });

  it("keeps scoreAsset output unchanged after the governanceChecks refactor", () => {
    // Every asset's governed score must equal the fraction of passing checks, and
    // the quadrant distribution over the seed is the fixed pre-refactor baseline.
    const usage = utilizationByAsset(seedDataset);
    for (const asset of seedDataset.assets) {
      const score = scoreAsset(asset, seedDataset, usage);
      const checks = governanceChecks(asset, seedDataset);
      expect(score.governedScore).toBeCloseTo(
        checks.filter((check) => check.pass).length / checks.length,
        10,
      );
      expect(score.governed).toBe(score.governedScore >= 0.8);
    }
    // The committed utilization.json carries complete synthetic telemetry for every
    // neutral demo asset (folded into seedDataset.utilization in seed.ts) and the
    // overlay marks a believable subset of assets ungoverned-by-design, so a fresh
    // visitor sees a healthy-but-imperfect fleet across all four quadrants. The
    // generator (scripts/generate-demo-telemetry.mts) authors this distribution with
    // an adaptive split (about half of each governed/ungoverned pool is effective).
    // Bucketing every asset by governed x effective pins the distribution; under
    // v2 the evidence-aware split (insufficientEvidence assets) lives in
    // classificationCounts, verified separately.
    const counts: Record<Quadrant, number> = {
      Stars: 0,
      Risks: 0,
      Shelfware: 0,
      "Dead weight": 0,
    };
    for (const score of scoreAssets(seedDataset)) counts[score.quadrant] += 1;
    expect(counts).toEqual({
      Stars: 19,
      Risks: 8,
      Shelfware: 20,
      "Dead weight": 7,
    });
  });

  it("flags a duplicate from a shared content hash", () => {
    const cluster = duplicateClusters(seedDataset)[0];
    expect(cluster.length).toBeGreaterThan(1);
    const signal = assetSignal(seedDataset, cluster[0].id);
    expect(signal?.duplicate).toBe(true);
    const unique = seedDataset.assets.find(
      (asset) => !cluster.some((member) => member.id === asset.id),
    );
    expect(assetSignal(seedDataset, unique!.id)?.duplicate).toBe(false);
  });

  it("flags an orphan when the asset has no owner", () => {
    const orphan = seedDataset.assets.find((asset) => !asset.ownerId);
    expect(orphan).toBeDefined();
    expect(assetSignal(seedDataset, orphan!.id)?.orphan).toBe(true);
    const owned = seedDataset.assets.find((asset) => asset.ownerId);
    expect(assetSignal(seedDataset, owned!.id)?.orphan).toBe(false);
  });

  it("flags fragileDeps when a required asset is deprecated or retired", () => {
    const base: VaultDataset = {
      ...windowDataset,
      assets: [
        asset("a-live", { status: "active" }),
        asset("a-dead", { status: "deprecated" }),
        asset("a-fragile", { status: "active" }),
      ],
      dependencies: [{ assetId: "a-fragile", dependsOnAssetId: "a-dead" }],
      utilization: [],
    };
    expect(assetSignal(base, "a-fragile")?.fragileDeps).toBe(true);
    expect(assetSignal(base, "a-live")?.fragileDeps).toBe(false);
  });

  it("reads hasTelemetry from recorded invocations", () => {
    const withUsage = seedDataset.assets.find((a) =>
      seedDataset.utilization.some(
        (u) => u.assetId === a.id && u.invocations > 0,
      ),
    );
    expect(assetSignal(seedDataset, withUsage!.id)?.hasTelemetry).toBe(true);
    expect(assetSignal(seedDataset, "not-in-dataset")).toBeNull();
  });

  it("ranks recommendedActions severity descending: risk over fragile over duplicate over shelfware", () => {
    const built: VaultDataset = {
      ...windowDataset,
      assets: [
        // A Risks asset: effective but ungoverned (no description, tag, owner, origin).
        asset("a-risk", {
          description: "",
          status: "active",
          ownerId: undefined,
          originId: undefined,
        }),
        asset("a-dead", { status: "deprecated" }),
        asset("a-fragile", { status: "active" }),
        // A clean, governed, low-usage asset that lands in Shelfware.
        asset("a-shelf", { status: "active" }),
      ],
      assetTags: [
        { assetId: "a-fragile", tagId: "t1" },
        { assetId: "a-shelf", tagId: "t1" },
        { assetId: "a-dead", tagId: "t1" },
      ],
      dependencies: [{ assetId: "a-fragile", dependsOnAssetId: "a-dead" }],
      utilization: [
        // a-risk is heavily used and successful, so it reads effective.
        { ...utilRow("a-risk", "2026-06-01", 200), successes: 200 },
        { ...utilRow("a-shelf", "2026-06-01", 5), successes: 1 },
      ],
    };
    const actions = recommendedActions(built);
    const order = actions.map((action) => action.assetId);
    expect(order.indexOf("a-risk")).toBeLessThan(order.indexOf("a-fragile"));
    expect(order.indexOf("a-fragile")).toBeLessThan(order.indexOf("a-shelf"));
    expect(
      actions.find((action) => action.assetId === "a-risk")?.severity,
    ).toBe("high");
    expect(actions.find((action) => action.assetId === "a-risk")?.kind).toBe(
      "risk",
    );
    // Severity ranks never go back up as the list descends.
    const ranks = actions.map((action) =>
      action.severity === "high" ? 3 : action.severity === "medium" ? 2 : 1,
    );
    expect([...ranks].sort((a, b) => b - a)).toEqual(ranks);
    // It is read-only advice; no action mutates the dataset.
    expect(built.assets).toHaveLength(4);
  });

  it("scopes nodeSignal to one asset: stale, no-telemetry dashed baseline, and high error", () => {
    const ds: VaultDataset = {
      ...windowDataset,
      assets: [
        asset("n-stale", {
          status: "active",
          updatedAt: "2024-01-01T00:00:00.000Z",
        }),
        asset("n-quiet", { status: "active" }),
        asset("n-noisy", { status: "active" }),
      ],
      utilization: [
        { ...utilRow("n-noisy", "2026-06-01", 100), successes: 60, errors: 40 },
      ],
    };
    const stale = nodeSignal(ds, "n-stale");
    expect(stale?.staleCount).toBe(1);
    expect(stale?.assetCount).toBe(1);

    const quiet = nodeSignal(ds, "n-quiet");
    expect(quiet?.hasTelemetry).toBe(false);
    expect(quiet?.series).toEqual([]);
    expect(quiet?.invocations).toBe(0);

    const noisy = nodeSignal(ds, "n-noisy");
    expect(noisy?.hasTelemetry).toBe(true);
    expect(noisy?.errorRate).toBeCloseTo(0.4, 10);
    expect(noisy?.invocations).toBe(100);

    expect(nodeSignal(ds, "missing")).toBeNull();
  });
});

describe("usageByModel and model-grained dailySeries", () => {
  const base = makeDataset();

  it("rolls up usage per model, ordered by invocations", () => {
    const dataset: VaultDataset = {
      ...base,
      utilization: [
        {
          id: "r1",
          tenantId: "t",
          assetId: "a1",
          date: "2026-06-07",
          model: "claude-opus-4-8",
          invocations: 10,
          successes: 9,
          errors: 1,
          refusals: 0,
          latencyMs: 1000,
          tokens: 0,
          cost: 0,
        },
        {
          id: "r2",
          tenantId: "t",
          assetId: "a2",
          date: "2026-06-07",
          model: "claude-opus-4-8",
          invocations: 6,
          successes: 6,
          errors: 0,
          refusals: 0,
          latencyMs: 2000,
          tokens: 0,
          cost: 0,
        },
        {
          id: "r3",
          tenantId: "t",
          assetId: "a1",
          date: "2026-06-07",
          model: "claude-sonnet-4-6",
          invocations: 4,
          successes: 2,
          errors: 2,
          refusals: 0,
          latencyMs: 500,
          tokens: 0,
          cost: 0,
        },
      ],
    };
    const byModel = usageByModel(dataset);
    expect(byModel.map((m) => m.model)).toEqual([
      "claude-opus-4-8",
      "claude-sonnet-4-6",
    ]);
    const opus = byModel[0];
    expect(opus.invocations).toBe(16);
    expect(opus.successes).toBe(15);
    expect(opus.successRate).toBe(15 / 16);
    // Invocation-weighted mean latency: (10*1000 + 6*2000) / 16.
    expect(opus.latencyMs).toBe((10 * 1000 + 6 * 2000) / 16);
    expect(byModel[1].successRate).toBe(0.5);
  });

  it("defaults a missing model to unknown", () => {
    const dataset: VaultDataset = {
      ...base,
      utilization: [
        {
          id: "r1",
          tenantId: "t",
          assetId: "a1",
          date: "2026-06-07",
          invocations: 5,
          successes: 5,
          errors: 0,
          refusals: 0,
          latencyMs: 100,
          tokens: 0,
          cost: 0,
        },
      ],
    };
    expect(usageByModel(dataset)[0].model).toBe("unknown");
  });

  it("sums one sparkline point per date across model rows", () => {
    const dataset: VaultDataset = {
      ...base,
      utilization: [
        {
          id: "r1",
          tenantId: "t",
          assetId: "a1",
          date: "2026-06-07",
          model: "claude-opus-4-8",
          invocations: 5,
          successes: 5,
          errors: 0,
          refusals: 0,
          latencyMs: 100,
          tokens: 0,
          cost: 0,
        },
        {
          id: "r2",
          tenantId: "t",
          assetId: "a1",
          date: "2026-06-07",
          model: "claude-sonnet-4-6",
          invocations: 3,
          successes: 3,
          errors: 0,
          refusals: 0,
          latencyMs: 100,
          tokens: 0,
          cost: 0,
        },
        {
          id: "r3",
          tenantId: "t",
          assetId: "a1",
          date: "2026-06-08",
          model: "claude-opus-4-8",
          invocations: 2,
          successes: 2,
          errors: 0,
          refusals: 0,
          latencyMs: 100,
          tokens: 0,
          cost: 0,
        },
      ],
    };
    expect(dailySeries(dataset, "a1")).toEqual([8, 2]);
  });
});

describe("classifyAsset (item 4: plot position matches quadrant)", () => {
  // Only the fields classifyAsset reads; cast keeps the boundary cases readable.
  const score = (over: Partial<AssetScore>): AssetScore =>
    ({
      governedScore: 0.5,
      effectiveScore: 0.5,
      governed: false,
      effective: false,
      quadrant: "Dead weight",
      confidence: "high",
      evidenceSufficient: true,
      signals: [],
      ...over,
    }) as AssetScore;

  it("4a: governed at exactly the threshold plots in the governed (right) half", () => {
    const { plotX } = classifyAsset(
      score({ governedScore: 0.8, governed: true, quadrant: "Shelfware" }),
    );
    expect(plotX).toBeGreaterThanOrEqual(80);
  });

  it("4b: just below the governed threshold plots in the ungoverned (left) half", () => {
    const { plotX } = classifyAsset(
      score({ governedScore: 0.798, governed: false, quadrant: "Dead weight" }),
    );
    expect(plotX).toBeLessThanOrEqual(79);
  });

  it("4d: an ineffective asset plots in the lower half even with a high effectiveScore", () => {
    const { plotY } = classifyAsset(
      score({ effectiveScore: 0.7, effective: false }),
    );
    expect(plotY).toBeLessThanOrEqual(59);
  });

  it("4e: an effective asset plots in the upper half", () => {
    const { plotY } = classifyAsset(
      score({ effectiveScore: 0.9, effective: true, quadrant: "Stars" }),
    );
    expect(plotY).toBeGreaterThanOrEqual(60);
  });

  it("4h/4i invariant over seedDataset: plot half-plane and quadrant agree with the score", () => {
    for (const s of scoreAssets(seedDataset)) {
      const { plotX, plotY, quadrant } = classifyAsset(s);
      expect(plotX >= 80).toBe(s.governed);
      expect(plotY >= 60).toBe(s.effective);
      expect(quadrant).toBe(s.quadrant);
    }
  });
});

describe("activeDays and windowDaysOf", () => {
  it("counts distinct active dates per asset and spans the window", () => {
    const ds: VaultDataset = {
      ...seedDataset,
      assets: [asset("a1")],
      utilization: [
        utilRow("a1", "2026-06-01", 5),
        utilRow("a1", "2026-06-03", 7),
      ],
    };
    const usage = utilizationByAssetWindowed(ds).get("a1");
    expect(usage?.activeDays).toBe(2);
    expect(windowDaysOf(ds)).toBe(3); // 2026-06-01 .. 2026-06-03 inclusive
  });

  it("uses the explicit window span when given, and 0 for an empty table", () => {
    expect(
      windowDaysOf(seedDataset, { start: "2026-06-01", end: "2026-06-07" }),
    ).toBe(7);
    expect(windowDaysOf({ ...seedDataset, utilization: [] })).toBe(0);
    // A reversed or unparseable window is unmeasurable, not negative.
    expect(
      windowDaysOf(seedDataset, { start: "2026-06-10", end: "2026-06-01" }),
    ).toBe(0);
  });
});

describe("effectivenessSignals and composeEffectiveScore", () => {
  const usageOf = (
    over: Partial<UsageSummary> & { invocations: number },
  ): UsageSummary => ({
    assetId: "a1",
    successes: over.invocations,
    errors: 0,
    refusals: 0,
    tokens: 0,
    cost: 0,
    successRate: 1,
    latencyMs: 100,
    activeDays: 1,
    ...over,
  });

  it("marks retention absent in a single-day window and renormalizes", () => {
    const usage = usageOf({
      invocations: 100,
      successRate: 0.8,
      activeDays: 1,
    });
    const signals = effectivenessSignals(usage, 1); // windowDays < 2
    const retention = signals.find((s) => s.id === "retention");
    expect(retention?.present).toBe(false);
    // toolCallReliability 0.8 (w 0.5) + adoption min(100/500,1)=0.2 (w 0.2), renormalized over 0.7
    const score = composeEffectiveScore(signals);
    expect(score).toBeCloseTo((0.5 * 0.8 + 0.2 * 0.2) / 0.7, 6);
  });

  it("returns null when no signal is present (the false-zero fix)", () => {
    const usage = usageOf({ invocations: 0, successRate: 0, activeDays: 0 });
    expect(composeEffectiveScore(effectivenessSignals(usage, 30))).toBeNull();
  });

  it("includes retention when the window spans multiple days", () => {
    const usage = usageOf({ invocations: 100, successRate: 1, activeDays: 5 });
    const signals = effectivenessSignals(usage, 10);
    expect(signals.find((s) => s.id === "retention")?.present).toBe(true);
    // toolCallReliability 1*0.5 + adoption 0.2*0.2 + retention 0.5*0.3 = 0.69
    expect(composeEffectiveScore(signals)).toBeCloseTo(0.69, 6);
  });
});

describe("gradeConfidence", () => {
  const usageN = (invocations: number): UsageSummary => ({
    assetId: "a1",
    invocations,
    successes: invocations,
    errors: 0,
    refusals: 0,
    tokens: 0,
    cost: 0,
    successRate: invocations ? 1 : 0,
    latencyMs: 100,
    activeDays: invocations ? 1 : 0,
  });
  const sig = (u: UsageSummary) => effectivenessSignals(u, 10);

  it("grades by sample size on the full-quality source path", () => {
    expect(gradeConfidence(usageN(0), sig(usageN(0))).confidence).toBe("none");
    expect(gradeConfidence(usageN(19), sig(usageN(19))).confidence).toBe("low");
    expect(gradeConfidence(usageN(20), sig(usageN(20))).confidence).toBe(
      "moderate",
    );
    expect(gradeConfidence(usageN(120), sig(usageN(120))).confidence).toBe(
      "high",
    );
  });

  it("gates evidence sufficiency at moderate", () => {
    expect(
      gradeConfidence(usageN(19), sig(usageN(19))).evidenceSufficient,
    ).toBe(false);
    expect(
      gradeConfidence(usageN(20), sig(usageN(20))).evidenceSufficient,
    ).toBe(true);
  });

  it("caps the grade at the source tier", () => {
    expect(
      gradeConfidence(usageN(120), sig(usageN(120)), "partial").confidence,
    ).toBe("moderate");
    expect(
      gradeConfidence(usageN(120), sig(usageN(120)), "derived").confidence,
    ).toBe("low");
    expect(
      gradeConfidence(usageN(120), sig(usageN(120)), "occupancy").confidence,
    ).toBe("low");
  });

  it("treats 'modeled' as the same confidence tier as 'derived' (low)", () => {
    // "modeled" is a cache-aware refinement of "derived": same provenance tier,
    // so gradeConfidence should cap at "low" just like "derived" does.
    expect(
      gradeConfidence(usageN(120), sig(usageN(120)), "modeled").confidence,
    ).toBe("low");
    expect(
      gradeConfidence(usageN(120), sig(usageN(120)), "modeled").confidence,
    ).toBe(
      gradeConfidence(usageN(120), sig(usageN(120)), "derived").confidence,
    );
  });
});

describe("scoreAsset v2 classification", () => {
  it("scores an unobserved asset as insufficient, not Dead weight zero", () => {
    const ds: VaultDataset = {
      ...seedDataset,
      assets: [asset("ghost")],
      utilization: [],
    };
    const s = scoreAsset(ds.assets[0], ds);
    expect(s.effectiveScore).toBeNull();
    expect(s.confidence).toBe("none");
    expect(s.evidenceSufficient).toBe(false);
    expect(s.effective).toBe(false);
  });

  it("classifies a well-used asset as effective with high confidence", () => {
    const util = Array.from({ length: 6 }, (_, i) =>
      utilRow("hot", `2026-06-0${i + 1}`, 40),
    );
    const ds: VaultDataset = {
      ...seedDataset,
      assets: [asset("hot")],
      utilization: util,
    };
    const s = scoreAsset(ds.assets[0], ds);
    expect(s.evidenceSufficient).toBe(true);
    expect(s.confidence).toBe("high");
    expect(s.effectiveScore).not.toBeNull();
    expect(s.effective).toBe(
      (s.effectiveScore as number) >= EFFECTIVE_THRESHOLD,
    );
  });
});

describe("evidence-aware rate and coverage", () => {
  const ds = (): VaultDataset => {
    const hot = Array.from({ length: 6 }, (_, i) =>
      utilRow("hot", `2026-06-0${i + 1}`, 40),
    );
    return {
      ...seedDataset,
      assets: [asset("hot"), asset("ghost")], // ghost has no telemetry
      utilization: hot,
    };
  };

  it("excludes insufficient-evidence assets from the rate denominator", () => {
    // hot is the only scored asset and is a Star -> rate 1, not 0.5
    expect(effectiveAssetRate(ds())).toBe(1);
  });

  it("reports coverage as scored over total", () => {
    expect(evidenceCoverage(ds())).toEqual({ scored: 1, total: 2 });
  });

  it("counts insufficient evidence separately from the quadrants", () => {
    const counts = classificationCounts(ds());
    expect(counts.insufficientEvidence).toBe(1);
    expect(counts.Stars).toBe(1);
  });
});

it("classifyAsset places a null-score asset in the lower half without NaN", () => {
  const ds: VaultDataset = {
    ...seedDataset,
    assets: [asset("ghost")],
    utilization: [],
  };
  const plot = classifyAsset(scoreAsset(ds.assets[0], ds));
  expect(Number.isNaN(plot.plotY)).toBe(false);
  expect(plot.plotY).toBeLessThan(EFFECTIVE_THRESHOLD * 100);
});

describe("effectiveness drift", () => {
  // A telemetry row with an explicit success count, so a window can carry a
  // degraded success rate. latencyMs is positive so latency quality is present
  // and the asset reaches full signal coverage (grade C or better at >= 50
  // invocations in a half).
  const richRow = (
    assetId: string,
    date: string,
    invocations: number,
    successes: number,
  ): UtilizationRow => ({
    id: `${assetId}:${date}`,
    tenantId: TENANT,
    assetId,
    date,
    invocations,
    successes,
    errors: invocations - successes,
    refusals: 0,
    latencyMs: 100,
    tokens: 0,
    cost: 0,
  });

  const driftDs = (
    utilization: UtilizationRow[],
    assets: AssetRow[] = [asset("slipping")],
  ): VaultDataset => makeDataset({ assets, utilization });

  describe("driftDirection thresholds", () => {
    it("classifies a drop of 0.10 or more as regressing", () => {
      expect(driftDirection(-0.1)).toBe("regressing");
      expect(driftDirection(-0.374)).toBe("regressing");
    });
    it("classifies a rise of 0.10 or more as improving", () => {
      expect(driftDirection(0.1)).toBe("improving");
    });
    it("classifies a change inside the band as steady", () => {
      expect(driftDirection(-0.09)).toBe("steady");
      expect(driftDirection(0)).toBe("steady");
      expect(driftDirection(0.09)).toBe("steady");
    });
  });

  describe("splitDriftWindows", () => {
    it("splits four dates into equal prior and recent halves", () => {
      const ds = driftDs([
        richRow("slipping", "2026-06-01", 1, 1),
        richRow("slipping", "2026-06-02", 1, 1),
        richRow("slipping", "2026-06-03", 1, 1),
        richRow("slipping", "2026-06-04", 1, 1),
      ]);
      expect(splitDriftWindows(ds)).toEqual({
        prior: { start: "2026-06-01", end: "2026-06-02" },
        recent: { start: "2026-06-03", end: "2026-06-04" },
      });
    });

    it("drops the oldest date on an odd-length series so the halves stay equal", () => {
      const ds = driftDs([
        richRow("slipping", "2026-06-01", 1, 1),
        richRow("slipping", "2026-06-02", 1, 1),
        richRow("slipping", "2026-06-03", 1, 1),
        richRow("slipping", "2026-06-04", 1, 1),
        richRow("slipping", "2026-06-05", 1, 1),
      ]);
      expect(splitDriftWindows(ds)).toEqual({
        prior: { start: "2026-06-02", end: "2026-06-03" },
        recent: { start: "2026-06-04", end: "2026-06-05" },
      });
    });

    it("returns null when the series is too short to split", () => {
      const ds = driftDs([richRow("slipping", "2026-06-01", 60, 60)]);
      expect(splitDriftWindows(ds)).toBeNull();
    });
  });

  it("flags a trusted asset whose effectiveness fell as regressing", () => {
    // prior half: 60 perfect invocations -> AES ~0.95; recent half: 60 at a 0.5
    // success rate -> AES ~0.57. Both halves clear the evidence gate.
    const ds = driftDs([
      richRow("slipping", "2026-06-01", 60, 60),
      richRow("slipping", "2026-06-02", 60, 30),
    ]);
    const trend = assetTrend(ds, "slipping");
    expect(trend.direction).toBe("regressing");
    expect(trend.delta).not.toBeNull();
    expect(trend.delta as number).toBeLessThan(-0.1);
  });

  it("flags a trusted asset whose effectiveness rose as improving", () => {
    const ds = driftDs([
      richRow("slipping", "2026-06-01", 60, 30),
      richRow("slipping", "2026-06-02", 60, 60),
    ]);
    const trend = assetTrend(ds, "slipping");
    expect(trend.direction).toBe("improving");
    expect(trend.delta as number).toBeGreaterThan(0.1);
  });

  it("reads a flat trusted asset as steady", () => {
    const ds = driftDs([
      richRow("slipping", "2026-06-01", 60, 60),
      richRow("slipping", "2026-06-02", 60, 60),
    ]);
    expect(assetTrend(ds, "slipping").direction).toBe("steady");
  });

  it("never alarms on thin evidence: a sparse recent half is insufficient, not regressing", () => {
    // prior half trusted (60 invocations), recent half thin (5) -> the recent
    // grade falls to D or E, so the comparison is withheld rather than guessed.
    const ds = driftDs([
      richRow("slipping", "2026-06-01", 60, 60),
      richRow("slipping", "2026-06-02", 5, 1),
    ]);
    const trend = assetTrend(ds, "slipping");
    expect(trend.direction).toBe("insufficient");
    expect(trend.delta).toBeNull();
    // The computed halves are still returned for the detail view.
    expect(trend.recent).not.toBeNull();
    expect(trend.prior).not.toBeNull();
  });

  it("is insufficient with null halves when the series cannot be split", () => {
    const ds = driftDs([richRow("slipping", "2026-06-01", 60, 60)]);
    const trend = assetTrend(ds, "slipping");
    expect(trend.direction).toBe("insufficient");
    expect(trend.recent).toBeNull();
    expect(trend.prior).toBeNull();
  });

  it("ranks regressing assets steepest-drop first with a name tie-break", () => {
    const ds = driftDs(
      [
        richRow("mild", "2026-06-01", 60, 60),
        richRow("mild", "2026-06-02", 60, 42), // smaller drop
        richRow("steep", "2026-06-01", 60, 60),
        richRow("steep", "2026-06-02", 60, 24), // bigger drop
      ],
      [asset("mild"), asset("steep")],
    );
    const ranked = regressingAssets(ds).map((t) => t.assetId);
    expect(ranked).toEqual(["steep", "mild"]);
  });

  it("returns one trend per asset from assetTrends", () => {
    const ds = driftDs(
      [richRow("slipping", "2026-06-01", 60, 60)],
      [asset("slipping"), asset("other")],
    );
    expect(
      assetTrends(ds)
        .map((t) => t.assetId)
        .sort(),
    ).toEqual(["other", "slipping"]);
  });

  it("surfaces a regressing governed asset as a single high-severity action", () => {
    const ds = driftDs([
      richRow("slipping", "2026-06-01", 60, 60),
      richRow("slipping", "2026-06-02", 60, 30),
    ]);
    const actions = recommendedActions(ds).filter(
      (a) => a.assetId === "slipping",
    );
    expect(actions).toHaveLength(1);
    expect(actions[0].kind).toBe("regressing");
    expect(actions[0].severity).toBe("high");
  });

  it("ranks regressing below risk and above fragile dependencies", () => {
    const retired = asset("oldtool", { status: "retired" });
    const ds: VaultDataset = {
      routingStats: [],
      assets: [
        // risky: effective but ungoverned -> Risks quadrant
        asset("risky", { ownerId: undefined, originId: undefined }),
        asset("slipping"),
        asset("fragile"),
        retired,
      ],
      tags: [],
      origins: [],
      owners: [],
      bundles: [],
      assetTags: [],
      dependencies: [{ assetId: "fragile", dependsOnAssetId: "oldtool" }],
      bundleMemberships: [],
      assetRevisions: [],
      evalResults: [],
      baselines: [],
      interventions: [],
      utilization: [
        richRow("risky", "2026-06-01", 200, 190),
        richRow("slipping", "2026-06-01", 60, 60),
        richRow("slipping", "2026-06-02", 60, 30),
      ],
    };
    const order = recommendedActions(ds).map((a) => a.kind);
    const iRisk = order.indexOf("risk");
    const iRegress = order.indexOf("regressing");
    const iFragile = order.indexOf("fragile-deps");
    expect(iRisk).toBeGreaterThanOrEqual(0);
    expect(iRegress).toBeGreaterThan(iRisk);
    expect(iFragile).toBeGreaterThan(iRegress);
  });

  it("does not nag a retired asset that regressed (the active guard)", () => {
    // A governed Star (tagged) that is retired: the only branch that could fire
    // is regressing, and the active guard suppresses it. Drop the `&& active`
    // clause and this test fails, which is the point.
    const ds: VaultDataset = {
      ...driftDs(
        [
          richRow("slipping", "2026-06-01", 60, 60),
          richRow("slipping", "2026-06-02", 60, 30),
        ],
        [asset("slipping", { status: "retired" })],
      ),
      assetTags: [{ assetId: "slipping", tagId: "t1" }],
    };
    // The trend itself is status-agnostic, so the decline is still measured.
    expect(regressingAssets(ds).map((t) => t.assetId)).toContain("slipping");
    // But the engine never raises a regressing action for an asset being sunset.
    const regressingActions = recommendedActions(ds).filter(
      (a) => a.assetId === "slipping" && a.kind === "regressing",
    );
    expect(regressingActions).toHaveLength(0);
  });

  it("withholds the verdict when the prior half is thin, even if the recent half rose", () => {
    // The mirror of the recent-thin case: both halves must clear the evidence
    // gate, so a thin prior makes the comparison insufficient despite a real
    // rise. Pins the AND-gate from the other direction.
    const ds = driftDs([
      richRow("slipping", "2026-06-01", 5, 1),
      richRow("slipping", "2026-06-02", 60, 60),
    ]);
    const trend = assetTrend(ds, "slipping");
    expect(trend.direction).toBe("insufficient");
    expect(trend.delta).toBeNull();
  });

  it("honors a window argument in the split and in assetTrend", () => {
    const ds = driftDs([
      richRow("slipping", "2026-06-01", 60, 60),
      richRow("slipping", "2026-06-02", 60, 60),
      richRow("slipping", "2026-06-03", 60, 60),
      richRow("slipping", "2026-06-04", 60, 60),
      richRow("slipping", "2026-06-05", 60, 60),
      richRow("slipping", "2026-06-06", 60, 60),
    ]);
    // Full history: 6 dates split into [01..03] and [04..06].
    expect(splitDriftWindows(ds)).toEqual({
      prior: { start: "2026-06-01", end: "2026-06-03" },
      recent: { start: "2026-06-04", end: "2026-06-06" },
    });
    // Windowed to the middle four dates: the split moves with the window.
    expect(
      splitDriftWindows(ds, { start: "2026-06-02", end: "2026-06-05" }),
    ).toEqual({
      prior: { start: "2026-06-02", end: "2026-06-03" },
      recent: { start: "2026-06-04", end: "2026-06-05" },
    });
    // assetTrend forwards the window: a single-day window cannot split.
    expect(
      assetTrend(ds, "slipping", {
        start: "2026-06-01",
        end: "2026-06-01",
      }).direction,
    ).toBe("insufficient");
  });

  it("locks the grade-C evidence boundary: 50 invocations per half is trustworthy, 49 is not", () => {
    // Confidence is fidelity x coverage x min(1, invocations / 100). At full
    // fidelity and coverage, 50 invocations grades C (trusted) and 49 grades D
    // (insufficient). One invocation flips the whole drift verdict, so the
    // assumption every other drift test rests on is pinned here.
    const at50 = driftDs([
      richRow("slipping", "2026-06-01", 50, 50),
      richRow("slipping", "2026-06-02", 50, 25),
    ]);
    const at49 = driftDs([
      richRow("slipping", "2026-06-01", 49, 49),
      richRow("slipping", "2026-06-02", 49, 24),
    ]);
    expect(assetTrend(at50, "slipping").direction).toBe("regressing");
    expect(assetTrend(at49, "slipping").direction).toBe("insufficient");
  });
});
