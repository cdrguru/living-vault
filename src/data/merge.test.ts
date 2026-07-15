import { describe, expect, it } from "vitest";

import { importDelta, mergeProjection, type ProjectionInput } from "./merge";
import type { AssetRow, UtilizationRow, VaultDataset } from "./types";

const TENANT = "tenant-fabricagent";

function asset(id: string, over: Partial<AssetRow> = {}): AssetRow {
  return {
    id,
    tenantId: "tenant-source",
    type: "skill",
    name: id,
    slug: id,
    description: "desc",
    body: "body",
    version: "1.0.0",
    status: "active",
    riskLevel: "low",
    maturity: 0.5,
    tier: "custom",
    contentHash: "deadbeef",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    ...over,
  };
}

function emptyProjection(over: Partial<ProjectionInput> = {}): ProjectionInput {
  return {
    assets: [],
    tags: [],
    origins: [],
    owners: [],
    bundles: [],
    assetTags: [],
    dependencies: [],
    bundleMemberships: [],
    ...over,
  };
}

function dataset(over: Partial<VaultDataset> = {}): VaultDataset {
  return {
    assets: [],
    tags: [],
    origins: [],
    owners: [],
    bundles: [],
    assetTags: [],
    dependencies: [],
    bundleMemberships: [],
    evalResults: [],
    utilization: [],
    ...over,
  };
}

describe("mergeProjection", () => {
  it("adds new assets and normalizes their tenant", () => {
    const incoming = emptyProjection({ assets: [asset("fab-1")] });
    const merged = mergeProjection(dataset(), incoming, TENANT);
    expect(merged.assets).toHaveLength(1);
    expect(merged.assets[0].tenantId).toBe(TENANT);
  });

  it("updates an existing asset by id but preserves its original createdAt", () => {
    const current = dataset({
      assets: [
        asset("fab-1", { body: "old", createdAt: "2025-06-01T00:00:00Z" }),
      ],
    });
    const incoming = emptyProjection({
      assets: [
        asset("fab-1", { body: "new", createdAt: "2026-06-06T00:00:00Z" }),
      ],
    });
    const merged = mergeProjection(current, incoming, TENANT);
    expect(merged.assets).toHaveLength(1);
    expect(merged.assets[0].body).toBe("new");
    expect(merged.assets[0].createdAt).toBe("2025-06-01T00:00:00Z");
  });

  it("leaves rows that exist only in the current dataset untouched", () => {
    const current = dataset({
      assets: [asset("seed-1", { tenantId: TENANT })],
    });
    const incoming = emptyProjection({ assets: [asset("fab-1")] });
    const merged = mergeProjection(current, incoming, TENANT);
    expect(merged.assets.map((a) => a.id).sort()).toEqual(["fab-1", "seed-1"]);
  });

  it("preserves utilization telemetry", () => {
    const util: UtilizationRow = {
      id: "util-1",
      tenantId: TENANT,
      assetId: "seed-1",
      date: "2026-06-01",
      invocations: 10,
      successes: 9,
      errors: 1,
      refusals: 0,
      latencyMs: 100,
      tokens: 500,
      cost: 0.01,
    };
    const current = dataset({ assets: [asset("seed-1")], utilization: [util] });
    const merged = mergeProjection(
      current,
      emptyProjection({ assets: [asset("fab-1")] }),
      TENANT,
    );
    expect(merged.utilization).toEqual([util]);
  });

  it("replaces join rows for imported assets but keeps unrelated ones, idempotently", () => {
    const current = dataset({
      assets: [asset("seed-1"), asset("fab-1")],
      assetTags: [
        { assetId: "seed-1", tagId: "tag-keep" },
        { assetId: "fab-1", tagId: "tag-stale" },
      ],
    });
    const incoming = emptyProjection({
      assets: [asset("fab-1")],
      tags: [
        {
          id: "tag-new",
          tenantId: "tenant-source",
          kind: "capability",
          name: "authoring",
        },
      ],
      assetTags: [{ assetId: "fab-1", tagId: "tag-new" }],
    });
    const once = mergeProjection(current, incoming, TENANT);
    expect(once.assetTags).toContainEqual({
      assetId: "seed-1",
      tagId: "tag-keep",
    });
    expect(once.assetTags).toContainEqual({
      assetId: "fab-1",
      tagId: "tag-new",
    });
    expect(once.assetTags).not.toContainEqual({
      assetId: "fab-1",
      tagId: "tag-stale",
    });
    const twice = mergeProjection(once, incoming, TENANT);
    expect(twice.assetTags).toEqual(once.assetTags);
  });

  it("reconciles an incoming asset onto an existing one sharing type+slug under a different id", () => {
    const current = dataset({
      assets: [
        asset("cc-skill-deneb", {
          slug: "deneb",
          body: "local",
          createdAt: "2025-01-01T00:00:00Z",
        }),
      ],
    });
    const incoming = emptyProjection({
      assets: [
        asset("uuid-deneb", {
          slug: "deneb",
          body: "upstream",
          createdAt: "2026-06-10T00:00:00Z",
        }),
      ],
    });
    const merged = mergeProjection(current, incoming, TENANT, {
      reconcileByTypeSlug: true,
    });
    expect(merged.assets).toHaveLength(1);
    const reconciled = merged.assets[0];
    // The local id survives so telemetry keyed to it keeps attributing.
    expect(reconciled.id).toBe("cc-skill-deneb");
    // Local history is preserved; upstream content wins.
    expect(reconciled.createdAt).toBe("2025-01-01T00:00:00Z");
    expect(reconciled.body).toBe("upstream");
  });

  it("remaps incoming join rows onto the reconciled local id so no reference dangles", () => {
    const current = dataset({
      assets: [asset("cc-skill-deneb", { slug: "deneb" })],
    });
    const incoming = emptyProjection({
      assets: [asset("uuid-deneb", { slug: "deneb" })],
      tags: [
        {
          id: "tag-x",
          tenantId: "tenant-source",
          kind: "capability",
          name: "x",
        },
      ],
      assetTags: [{ assetId: "uuid-deneb", tagId: "tag-x" }],
      dependencies: [{ assetId: "uuid-deneb", dependsOnAssetId: "uuid-deneb" }],
      bundles: [
        { id: "bun-x", tenantId: "tenant-source", name: "x", description: "x" },
      ],
      bundleMemberships: [{ bundleId: "bun-x", assetId: "uuid-deneb" }],
    });
    const merged = mergeProjection(current, incoming, TENANT, {
      reconcileByTypeSlug: true,
    });
    const ids = new Set(merged.assets.map((a) => a.id));
    expect(ids.has("uuid-deneb")).toBe(false);
    expect(merged.assetTags).toContainEqual({
      assetId: "cc-skill-deneb",
      tagId: "tag-x",
    });
    expect(merged.dependencies).toContainEqual({
      assetId: "cc-skill-deneb",
      dependsOnAssetId: "cc-skill-deneb",
    });
    expect(merged.bundleMemberships).toContainEqual({
      bundleId: "bun-x",
      assetId: "cc-skill-deneb",
    });
    // Every join-row asset reference resolves to a real asset.
    for (const row of merged.assetTags) expect(ids.has(row.assetId)).toBe(true);
    for (const row of merged.dependencies) {
      expect(ids.has(row.assetId)).toBe(true);
      expect(ids.has(row.dependsOnAssetId)).toBe(true);
    }
    for (const row of merged.bundleMemberships)
      expect(ids.has(row.assetId)).toBe(true);
  });

  it("prefers the overlay (cc-) id over a stock (as-) row regardless of array order", () => {
    // The production sync hits exactly this: a stock seed row and the telemetry-bearing
    // overlay row share a (type, slug). The incoming upstream content must land on the
    // cc- id (so telemetry keeps attributing) and the stock row must survive untouched,
    // whichever order the two appear in the current dataset.
    for (const order of [
      ["as-2", "cc-skill-x"],
      ["cc-skill-x", "as-2"],
    ]) {
      const current = dataset({
        assets: order.map((id) =>
          asset(id, { slug: "x", body: id === "as-2" ? "stock" : "real" }),
        ),
      });
      const incoming = emptyProjection({
        assets: [asset("uuid-x", { slug: "x", body: "upstream" })],
      });
      const merged = mergeProjection(current, incoming, TENANT, {
        reconcileByTypeSlug: true,
      });
      expect(merged.assets.map((a) => a.id).sort()).toEqual([
        "as-2",
        "cc-skill-x",
      ]);
      const cc = merged.assets.find((a) => a.id === "cc-skill-x");
      const stock = merged.assets.find((a) => a.id === "as-2");
      expect(cc?.body).toBe("upstream");
      expect(stock?.body).toBe("stock");
    }
  });

  it("is idempotent under reconcile: a second pass leaves every join array unchanged", () => {
    const current = dataset({
      assets: [asset("cc-skill-deneb", { slug: "deneb" })],
    });
    const incoming = emptyProjection({
      assets: [asset("uuid-deneb", { slug: "deneb" })],
      tags: [
        {
          id: "tag-x",
          tenantId: "tenant-source",
          kind: "capability",
          name: "x",
        },
      ],
      assetTags: [{ assetId: "uuid-deneb", tagId: "tag-x" }],
      dependencies: [{ assetId: "uuid-deneb", dependsOnAssetId: "uuid-deneb" }],
      bundles: [
        { id: "bun-x", tenantId: "tenant-source", name: "x", description: "x" },
      ],
      bundleMemberships: [{ bundleId: "bun-x", assetId: "uuid-deneb" }],
    });
    const once = mergeProjection(current, incoming, TENANT, {
      reconcileByTypeSlug: true,
    });
    const twice = mergeProjection(once, incoming, TENANT, {
      reconcileByTypeSlug: true,
    });
    expect(twice.assets).toEqual(once.assets);
    expect(twice.assetTags).toEqual(once.assetTags);
    expect(twice.dependencies).toEqual(once.dependencies);
    expect(twice.bundleMemberships).toEqual(once.bundleMemberships);
  });

  it("does not reconcile by type+slug unless asked, keeping stock and overlay rows separate", () => {
    const current = dataset({
      assets: [asset("as-1", { slug: "deneb", body: "stock" })],
    });
    const incoming = emptyProjection({
      assets: [asset("cc-skill-deneb", { slug: "deneb", body: "real" })],
    });
    const merged = mergeProjection(current, incoming, TENANT);
    expect(merged.assets.map((a) => a.id).sort()).toEqual([
      "as-1",
      "cc-skill-deneb",
    ]);
  });

  it("does not mutate either input", () => {
    const current = dataset({ assets: [asset("seed-1")] });
    const incoming = emptyProjection({
      assets: [asset("fab-1")],
      assetTags: [{ assetId: "fab-1", tagId: "tag-new" }],
    });
    const currentSnapshot = JSON.parse(JSON.stringify(current));
    const incomingSnapshot = JSON.parse(JSON.stringify(incoming));
    mergeProjection(current, incoming, TENANT);
    expect(current).toEqual(currentSnapshot);
    expect(incoming).toEqual(incomingSnapshot);
  });
});

describe("importDelta", () => {
  it("counts new assets as added and known ids as updated", () => {
    const current = dataset({ assets: [asset("fab-1")] });
    const incoming = emptyProjection({
      assets: [asset("fab-1"), asset("fab-2")],
    });
    expect(importDelta(current, incoming)).toEqual({ added: 1, updated: 1 });
  });

  it("counts a type+slug match under a different id as updated, not added", () => {
    const current = dataset({
      assets: [asset("cc-skill-deneb", { slug: "deneb" })],
    });
    const incoming = emptyProjection({
      assets: [
        asset("uuid-deneb", { slug: "deneb" }),
        asset("fab-new", { slug: "new" }),
      ],
    });
    expect(
      importDelta(current, incoming, { reconcileByTypeSlug: true }),
    ).toEqual({
      added: 1,
      updated: 1,
    });
  });

  it("counts a type+slug match as added when reconcile is off (the default)", () => {
    const current = dataset({
      assets: [asset("cc-skill-deneb", { slug: "deneb" })],
    });
    const incoming = emptyProjection({
      assets: [asset("uuid-deneb", { slug: "deneb" })],
    });
    expect(importDelta(current, incoming)).toEqual({ added: 1, updated: 0 });
  });

  it("counts distinct resolved rows, not raw incoming, when two reconcile onto one", () => {
    const current = dataset({
      assets: [asset("cc-skill-deneb", { slug: "deneb" })],
    });
    const incoming = emptyProjection({
      assets: [
        asset("uuid-deneb-a", { slug: "deneb" }),
        asset("uuid-deneb-b", { slug: "deneb" }),
      ],
    });
    expect(
      importDelta(current, incoming, { reconcileByTypeSlug: true }),
    ).toEqual({ added: 0, updated: 1 });
  });
});
