import { describe, expect, it } from "vitest";

import { dependenciesOf } from "@/data/metrics";
import type { AssetRow, VaultDataset } from "@/data/types";

import { dependencyEdges, dependencyNodes } from "./dependencyMeta";

const TENANT = "tenant-test";

const mkAsset = (over: Partial<AssetRow> & Pick<AssetRow, "id">): AssetRow => ({
  tenantId: TENANT,
  type: "skill",
  name: over.id,
  slug: over.id,
  description: "A governed asset.",
  body: "body",
  version: "1.0.0",
  status: "active",
  riskLevel: "low",
  maturity: 0.8,
  tier: "stock",
  contentHash: `hash-${over.id}`,
  ownerId: "own-1",
  originId: "org-1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
  ...over,
});

const baseDataset = (
  dependencies: VaultDataset["dependencies"],
  assets: AssetRow[],
): VaultDataset => ({
  routingStats: [],
  assets,
  tags: [],
  origins: [{ id: "org-1", tenantId: TENANT, name: "o", kind: "local" }],
  owners: [
    {
      id: "own-1",
      tenantId: TENANT,
      name: "p",
      email: "p@x.io",
      role: "maintainer",
    },
  ],
  bundles: [],
  assetTags: [],
  dependencies,
  bundleMemberships: [],
  assetRevisions: [],
  evalResults: [],
  baselines: [],
  interventions: [],
  utilization: [],
});

// A clean linear chain: a1 requires a2; a2 requires a3; a4 is isolated.
const cleanDataset = baseDataset(
  [
    { assetId: "a1", dependsOnAssetId: "a2" },
    { assetId: "a2", dependsOnAssetId: "a3" },
  ],
  [
    mkAsset({ id: "a1" }),
    mkAsset({ id: "a2" }),
    mkAsset({ id: "a3" }),
    mkAsset({ id: "a4" }),
  ],
);

// The same chain plus junk edges: a self edge, an unknown target, an unknown
// source, and an exact duplicate of the first edge.
const noisyDataset = baseDataset(
  [
    { assetId: "a1", dependsOnAssetId: "a2" },
    { assetId: "a2", dependsOnAssetId: "a3" },
    { assetId: "a1", dependsOnAssetId: "a1" },
    { assetId: "a1", dependsOnAssetId: "ghost" },
    { assetId: "ghost", dependsOnAssetId: "a2" },
    { assetId: "a1", dependsOnAssetId: "a2" },
  ],
  [
    mkAsset({ id: "a1" }),
    mkAsset({ id: "a2" }),
    mkAsset({ id: "a3" }),
    mkAsset({ id: "a4" }),
  ],
);

describe("dependencyEdges", () => {
  it("drops self edges and edges to or from unknown ids", () => {
    const edges = dependencyEdges(noisyDataset);
    expect(edges.every((edge) => edge.from !== edge.to)).toBe(true);
    const ids = new Set(noisyDataset.assets.map((asset) => asset.id));
    for (const edge of edges) {
      expect(ids.has(edge.from)).toBe(true);
      expect(ids.has(edge.to)).toBe(true);
    }
  });

  it("de-dupes by directed key, keeping one edge per from -> to pair", () => {
    const edges = dependencyEdges(noisyDataset);
    // Only a1->a2 and a2->a3 survive the drops and the de-dupe.
    expect(edges).toHaveLength(2);
    expect(edges.map((edge) => edge.id).sort()).toEqual([
      "dep:a1->a2",
      "dep:a2->a3",
    ]);
  });

  it("orients each edge from the dependent to the dependency", () => {
    const edge = dependencyEdges(cleanDataset).find(
      (e) => e.id === "dep:a1->a2",
    )!;
    // a1 requires a2, so the edge runs from a1 (dependent) to a2 (dependency).
    expect(edge.from).toBe("a1");
    expect(edge.to).toBe("a2");
  });
});

describe("dependencyNodes", () => {
  it("returns only participating assets by default", () => {
    const nodes = dependencyNodes(cleanDataset);
    // a4 has no edges, so it is excluded by default.
    expect(nodes.map((node) => node.id).sort()).toEqual(["a1", "a2", "a3"]);
  });

  it("returns one node per asset with includeIsolated", () => {
    const nodes = dependencyNodes(cleanDataset, true);
    expect(nodes.map((node) => node.id).sort()).toEqual([
      "a1",
      "a2",
      "a3",
      "a4",
    ]);
  });

  it("matches dependenciesOf for requiresCount and requiredByCount", () => {
    const nodes = dependencyNodes(cleanDataset, true);
    for (const node of nodes) {
      const deps = dependenciesOf(cleanDataset, node.id);
      expect(node.requiresCount).toBe(deps.requires.length);
      expect(node.requiredByCount).toBe(deps.requiredBy.length);
    }
  });

  it("carries the reverse direction in requiredByCount", () => {
    const nodes = dependencyNodes(cleanDataset, true);
    const a2 = nodes.find((node) => node.id === "a2")!;
    // a1 requires a2 (required by 1) and a2 requires a3 (requires 1).
    expect(a2.requiredByCount).toBe(1);
    expect(a2.requiresCount).toBe(1);
    const a3 = nodes.find((node) => node.id === "a3")!;
    expect(a3.requiredByCount).toBe(1);
    expect(a3.requiresCount).toBe(0);
  });
});
