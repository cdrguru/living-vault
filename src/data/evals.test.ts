import { describe, expect, it } from "vitest";

import { applyEvals } from "./evals";
import type { EvalMeta, EvalResultRow, VaultDataset } from "./types";

const META: EvalMeta = {
  source: "local",
  generatedAt: "2026-07-07T00:00:00.000Z",
  windowStart: "2026-07-01",
  windowEnd: "2026-07-07",
  cases: 1,
  tracked: {
    passed: "full",
    failed: "full",
    latency: "full",
    tokens: "none",
    cost: "none",
  },
};

function baseDataset(): VaultDataset {
  return {
    routingStats: [],
    assets: [
      {
        id: "as-1",
        tenantId: "t",
        type: "skill",
        name: "One",
        slug: "one",
        description: "",
        body: "b",
        version: "1.0.0",
        status: "active",
        riskLevel: "low",
        maturity: 0.5,
        tier: "custom",
        contentHash: "h",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
      },
    ],
    tags: [],
    origins: [],
    owners: [],
    bundles: [],
    assetTags: [],
    dependencies: [],
    bundleMemberships: [],
    utilization: [],
    assetRevisions: [],
    evalResults: [],
    baselines: [],
    interventions: [],
  };
}

function result(overrides: Partial<EvalResultRow>): EvalResultRow {
  return {
    id: "ev-1",
    tenantId: "t",
    assetId: "as-1",
    caseHash: "c1",
    date: "2026-07-07",
    trials: 5,
    passed: 4,
    failed: 1,
    errored: 0,
    inconclusive: 0,
    latencyMs: 100,
    tokens: 0,
    cost: 0,
    quality: "full",
    ...overrides,
  };
}

describe("applyEvals", () => {
  it("replaces the eval table with rows whose asset is present and records meta", () => {
    const next = applyEvals(baseDataset(), [result({})], META);
    expect(next.evalResults).toHaveLength(1);
    expect(next.evalResults[0].id).toBe("ev-1");
    expect(next.evalMeta).toEqual(META);
  });

  it("drops rows whose assetId is not in the dataset", () => {
    const next = applyEvals(
      baseDataset(),
      [
        result({ id: "ev-known" }),
        result({ id: "ev-orphan", assetId: "missing" }),
      ],
      META,
    );
    expect(next.evalResults.map((row) => row.id)).toEqual(["ev-known"]);
  });

  it("dedups rows sharing an id, keeping the last occurrence", () => {
    const next = applyEvals(
      baseDataset(),
      [result({ id: "dup", passed: 1 }), result({ id: "dup", passed: 3 })],
      META,
    );
    expect(next.evalResults).toHaveLength(1);
    expect(next.evalResults[0].passed).toBe(3);
  });

  it("does not mutate the input dataset", () => {
    const input = baseDataset();
    applyEvals(input, [result({})], META);
    expect(input.evalResults).toHaveLength(0);
    expect(input.evalMeta).toBeUndefined();
  });
});
