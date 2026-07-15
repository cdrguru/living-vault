import { describe, expect, it } from "vitest";

import type { AssetRow, VaultDataset } from "@/data/types";

import { monitorEdges, monitorNodes, QUADRANT_TONE } from "./monitorMeta";

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

const dataset: VaultDataset = {
  assets: [
    mkAsset({ id: "a1" }),
    mkAsset({ id: "a2" }),
    // a3 and a4 share a content hash, so they are duplicates of each other.
    mkAsset({ id: "a3", contentHash: "dupe" }),
    mkAsset({ id: "a4", contentHash: "dupe" }),
  ],
  tags: [{ id: "t1", tenantId: TENANT, kind: "domain", name: "d" }],
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
  bundles: [
    { id: "b1", tenantId: TENANT, name: "Bundle one", description: "d" },
  ],
  assetTags: [
    { assetId: "a1", tagId: "t1" },
    { assetId: "a2", tagId: "t1" },
  ],
  dependencies: [{ assetId: "a1", dependsOnAssetId: "a2" }],
  bundleMemberships: [
    { bundleId: "b1", assetId: "a1" },
    { bundleId: "b1", assetId: "a3" },
  ],
  evalResults: [],
  utilization: [],
};

describe("monitorNodes", () => {
  it("builds one node per asset, not per database table", () => {
    const nodes = monitorNodes(dataset);
    expect(nodes.length).toBe(dataset.assets.length);
    expect(nodes.map((node) => node.id).sort()).toEqual([
      "a1",
      "a2",
      "a3",
      "a4",
    ]);
  });

  it("colors each node by its scoreAssets quadrant tone", () => {
    const nodes = monitorNodes(dataset);
    for (const node of nodes) {
      expect(node.tone).toBe(QUADRANT_TONE[node.quadrant]);
    }
  });

  it("carries the inbound required-by fan-in per node", () => {
    const nodes = monitorNodes(dataset);
    const a2 = nodes.find((node) => node.id === "a2")!;
    // a1 requires a2, so a2 is required by one asset.
    expect(a2.requiredByCount).toBe(1);
  });
});

describe("monitorEdges", () => {
  it("emits a requires edge from the dependency table", () => {
    const requires = monitorEdges(dataset).filter(
      (edge) => edge.kind === "requires",
    );
    expect(requires).toHaveLength(1);
    expect(requires[0].from).toBe("a1");
    expect(requires[0].to).toBe("a2");
    expect(requires[0].dashed).toBe(false);
  });

  it("links bundle co-members with a solid member-of edge", () => {
    const memberOf = monitorEdges(dataset).filter(
      (edge) => edge.kind === "member-of",
    );
    // a1 and a3 share bundle b1, one undirected edge.
    expect(memberOf).toHaveLength(1);
    expect(memberOf[0].dashed).toBe(false);
  });

  it("links assets that share a tag with a dashed tagged edge", () => {
    const tagged = monitorEdges(dataset).filter(
      (edge) => edge.kind === "tagged",
    );
    // a1 and a2 share t1, one undirected dashed edge.
    expect(tagged).toHaveLength(1);
    expect(tagged[0].dashed).toBe(true);
  });

  it("links a duplicate content-hash cluster with a dashed duplicate edge", () => {
    const dupes = monitorEdges(dataset).filter(
      (edge) => edge.kind === "duplicate",
    );
    // a3 and a4 share a content hash, one undirected edge.
    expect(dupes).toHaveLength(1);
    expect(dupes[0].dashed).toBe(true);
  });

  it("does not draw a self edge", () => {
    expect(monitorEdges(dataset).every((edge) => edge.from !== edge.to)).toBe(
      true,
    );
  });
});
