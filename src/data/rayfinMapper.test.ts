import { describe, expect, it } from "vitest";

import { runDataSourceContract } from "./contract";
import { contentHashOf } from "./hash";
import {
  entitiesToDataset,
  indexJoinIds,
  type RayfinEntities,
} from "./rayfinMapper";

const entities: RayfinEntities = {
  assets: [
    {
      id: "a1",
      tenantId: "t",
      type: "skill",
      name: "A1",
      slug: "a1",
      description: "d",
      body: "b",
      version: "1.0.0",
      status: "active",
      riskLevel: "low",
      maturity: 0.8,
      tier: "stock",
      contentHash: contentHashOf("skill", "b"),
      owner_id: "o1",
      origin_id: "g1",
      createdAt: new Date("2026-01-02T03:04:05Z"),
      updatedAt: new Date("2026-06-01T00:00:00Z"),
    },
  ],
  tags: [{ id: "t1", tenantId: "t", kind: "domain", name: "d" }],
  origins: [{ id: "g1", tenantId: "t", name: "origin", kind: "local" }],
  owners: [
    { id: "o1", tenantId: "t", name: "p", email: "p@x.io", role: "maintainer" },
  ],
  bundles: [{ id: "b1", tenantId: "t", name: "bundle", description: "desc" }],
  assetTags: [{ id: "at1", asset_id: "a1", tag_id: "t1" }],
  dependencies: [{ id: "dep1", asset_id: "a1", dependsOn_id: "a1" }],
  bundleMemberships: [{ id: "bm1", bundle_id: "b1", asset_id: "a1" }],
  evalResults: [],
  utilization: [
    {
      id: "u1",
      tenantId: "t",
      asset_id: "a1",
      date: new Date("2026-06-01T12:00:00Z"),
      invocations: 5,
      successes: 5,
      errors: 0,
      refusals: 0,
      latencyMs: 100,
      tokens: 0,
      cost: 0,
      model: "claude-opus-4-8",
    },
  ],
};

describe("entitiesToDataset", () => {
  it("converts Date fields to ISO strings", () => {
    const dataset = entitiesToDataset(entities);
    expect(dataset.assets[0].createdAt).toBe("2026-01-02T03:04:05.000Z");
    expect(dataset.assets[0].updatedAt).toBe("2026-06-01T00:00:00.000Z");
    expect(dataset.utilization[0].date).toBe("2026-06-01");
    // The model dimension must survive the Fabric read mapping so a live deploy
    // shows it; rayfinReader selects the column and the mapper carries it through.
    expect(dataset.utilization[0].model).toBe("claude-opus-4-8");
  });

  it("strips the surrogate id off join rows", () => {
    const dataset = entitiesToDataset(entities);
    expect(dataset.assetTags[0]).toEqual({ assetId: "a1", tagId: "t1" });
    expect(dataset.dependencies[0]).toEqual({
      assetId: "a1",
      dependsOnAssetId: "a1",
    });
    expect(dataset.bundleMemberships[0]).toEqual({
      bundleId: "b1",
      assetId: "a1",
    });
    expect("id" in dataset.assetTags[0]).toBe(false);
  });

  it("produces a contract-clean dataset", () => {
    expect(runDataSourceContract(entitiesToDataset(entities))).toEqual([]);
  });

  it("synthesizes a telemetry marker from live utilization rows", () => {
    // telemetryMeta has no Fabric entity, so the live read must derive it from the
    // Utilization rows; without it the deployed app reports "not synced" forever.
    const dataset = entitiesToDataset(entities);
    expect(dataset.telemetryMeta).toBeDefined();
    expect(dataset.telemetryMeta?.source).toBe("claude-code");
    expect(dataset.telemetryMeta?.windowStart).toBe("2026-06-01");
    expect(dataset.telemetryMeta?.windowEnd).toBe("2026-06-01");
    expect(dataset.telemetryMeta?.tracked.model).toBe(true);
    // No probe metadata is synthesized, so live rows read as real ("Live"), not probe.
    expect(dataset.telemetryMeta?.probeAssetIds).toBeUndefined();
  });

  it("leaves the telemetry marker undefined when there is no utilization", () => {
    const dataset = entitiesToDataset({ ...entities, utilization: [] });
    expect(dataset.telemetryMeta).toBeUndefined();
  });
});

describe("indexJoinIds", () => {
  // Pins the exact composite-key format the write path deletes by. The keys MUST
  // match RayfinDataSource.syncJoin and the inline keys in updateAsset/deleteAsset;
  // a drift here reintroduces the "argument `id` is required" delete failure.
  it("indexes each join row id by its composite FK key", () => {
    const index = indexJoinIds(entities);
    expect(index.assetTags.get("a1::t1")).toBe("at1");
    expect(index.dependencies.get("a1::a1")).toBe("dep1");
    expect(index.bundleMemberships.get("b1::a1")).toBe("bm1");
  });
});
