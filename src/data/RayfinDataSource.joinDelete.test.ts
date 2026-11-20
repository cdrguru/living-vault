import { describe, expect, it } from "vitest";

import { FakeDabBackend } from "@/data/__tests__/fakeDabBackend";

import { contentHashOf } from "./hash";
import type { ProjectionInput } from "./merge";
import { FABRIC_TENANT_ID, RayfinDataSource } from "./RayfinDataSource";
import type { RayfinEntities } from "./rayfinMapper";
import type { AssetRow } from "./types";

const emptyStore = (): RayfinEntities => ({
  routingStats: [],
  assets: [],
  assetRevisions: [],
  tags: [],
  origins: [],
  owners: [],
  bundles: [],
  assetTags: [],
  dependencies: [],
  bundleMemberships: [],
  evalResults: [],
  baselines: [],
  interventions: [],
  utilization: [],
});

/**
 * Backend that models DAB's *point* mutation contract faithfully, where the
 * UuidBackend (importMint.test) does not: every generated `delete<Entity>` /
 * `update<Entity>` mutation is keyed strictly on the primary key argument `id`
 * (the "id-required" filter mode), so a filter that omits `id` rejects with
 * the exact GraphQL error the live backend returns. create auto-assigns the
 * surrogate uuid id DAB generates for a join row when none is supplied, and
 * readAll exposes it (snake_case columns + id), mirroring the real reader.
 */
class PointKeyBackend extends FakeDabBackend {
  constructor(initial: RayfinEntities) {
    super(initial, { filterMode: "id-required" });
  }
}

const seq = () => {
  let n = 0;
  return () => `11111111-1111-4111-8111-${String((n += 1)).padStart(12, "0")}`;
};

const assetEntity = (
  id: string,
  slug: string,
  body: string,
): RayfinEntities["assets"][number] => ({
  id,
  tenantId: FABRIC_TENANT_ID,
  type: "skill",
  name: slug,
  slug,
  description: "d",
  body,
  version: "1.0.0",
  status: "active",
  riskLevel: "low",
  maturity: 0.5,
  tier: "custom",
  contentHash: contentHashOf("skill", body),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
});

const assetInput = (id: string, slug: string, body: string): AssetRow => ({
  id,
  tenantId: FABRIC_TENANT_ID,
  type: "skill",
  name: slug,
  slug,
  description: "d",
  body,
  version: "1.0.0",
  status: "active",
  riskLevel: "low",
  maturity: 0.5,
  tier: "custom",
  contentHash: contentHashOf("skill", body),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-06-19T00:00:00.000Z",
});

const ASSET_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ASSET_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const TAG_T = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const EDGE_TAG = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const EDGE_DEP = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const BUNDLE_X = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const EDGE_MEMBER = "99999999-9999-4999-8999-999999999999";

const emptyProjection = (
  overrides: Partial<ProjectionInput> = {},
): ProjectionInput => ({
  assets: [],
  tags: [],
  origins: [],
  owners: [],
  bundles: [],
  assetTags: [],
  dependencies: [],
  bundleMemberships: [],
  ...overrides,
});

describe("RayfinDataSource join-row deletes target the primary key", () => {
  it("importProjection drops a reconciled asset's removed tag edge by id", async () => {
    const store = emptyStore();
    store.assets.push(assetEntity(ASSET_A, "alpha", "old"));
    store.tags.push({
      id: TAG_T,
      tenantId: FABRIC_TENANT_ID,
      kind: "capability",
      name: "Capability",
    });
    // Existing edge in Fabric, carrying its surrogate uuid PK.
    store.assetTags.push({ id: EDGE_TAG, asset_id: ASSET_A, tag_id: TAG_T });

    const backend = new PointKeyBackend(store);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
      newId: seq(),
    });

    // Re-import the asset by (type, slug) with NO tags: mergeProjection drops the
    // existing edge, so applyMerge must issue a join delete.
    const incoming = emptyProjection({
      assets: [assetInput(ASSET_A, "alpha", "new")],
    });

    await source.importProjection(incoming);

    expect(backend.store.assetTags).toHaveLength(0);
  });

  it("updateAsset replaces tags by deleting the old edge by id", async () => {
    const store = emptyStore();
    store.assets.push(assetEntity(ASSET_A, "alpha", "old"));
    store.tags.push({
      id: TAG_T,
      tenantId: FABRIC_TENANT_ID,
      kind: "capability",
      name: "Capability",
    });
    store.assetTags.push({ id: EDGE_TAG, asset_id: ASSET_A, tag_id: TAG_T });

    const backend = new PointKeyBackend(store);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
      newId: seq(),
    });

    // Replace the tag set with the empty set: the old edge must be deleted by id.
    await source.updateAsset(ASSET_A, { tagIds: [] });

    expect(backend.store.assetTags).toHaveLength(0);
  });

  it("deleteAsset cascades join-row deletes by id", async () => {
    const store = emptyStore();
    store.assets.push(assetEntity(ASSET_A, "alpha", "a"));
    store.assets.push(assetEntity(ASSET_B, "beta", "b"));
    store.tags.push({
      id: TAG_T,
      tenantId: FABRIC_TENANT_ID,
      kind: "capability",
      name: "Capability",
    });
    store.bundles.push({
      id: BUNDLE_X,
      tenantId: FABRIC_TENANT_ID,
      name: "Bundle X",
      description: "d",
    });
    store.assetTags.push({ id: EDGE_TAG, asset_id: ASSET_A, tag_id: TAG_T });
    store.dependencies.push({
      id: EDGE_DEP,
      asset_id: ASSET_A,
      dependsOn_id: ASSET_B,
    });
    store.bundleMemberships.push({
      id: EDGE_MEMBER,
      bundle_id: BUNDLE_X,
      asset_id: ASSET_A,
    });

    const backend = new PointKeyBackend(store);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
      newId: seq(),
    });

    await source.deleteAsset(ASSET_A);

    expect(backend.store.assets.map((a) => a.id)).toEqual([ASSET_B]);
    expect(backend.store.assetTags).toHaveLength(0);
    expect(backend.store.dependencies).toHaveLength(0);
    expect(backend.store.bundleMemberships).toHaveLength(0);
  });
});
