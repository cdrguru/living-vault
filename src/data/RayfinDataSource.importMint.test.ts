import { describe, expect, it } from "vitest";

import { FakeDabBackend, UUID_RE } from "@/data/__tests__/fakeDabBackend";

import { normalizeContribution } from "./contribute/normalize";
import { contentHashOf } from "./hash";
import type { ProjectionInput } from "./merge";
import { FABRIC_TENANT_ID, RayfinDataSource } from "./RayfinDataSource";
import type { RayfinEntities } from "./rayfinMapper";

const emptyStore = (): RayfinEntities => ({
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
});

/**
 * Backend that enforces the live Fabric `@uuid()` constraint on a
 * client-supplied `Asset.id` only: a create that passes a non-uuid id rejects
 * with the exact GraphQL error the backend returns. This is what makes the
 * test reproduce the upload bug (normalize assigns `contrib-*` ids, which are
 * not uuids). Ids minted for id-less creates use the non-uuid `gen-<n>` shape.
 */
class UuidBackend extends FakeDabBackend {
  constructor(initial: RayfinEntities) {
    super(initial, { uuidRejectTables: ["Asset"], mintShape: "gen" });
  }
}

const seq = () => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String((n += 1)).padStart(12, "0")}`;
};

describe("RayfinDataSource.importProjection uuid minting", () => {
  it("mints a uuid for a new contributed asset whose normalized id is not a uuid", async () => {
    const backend = new UuidBackend(emptyStore());
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
      newId: seq(),
    });
    const incoming = normalizeContribution({
      assets: [{ type: "skill", name: "Contributed Skill", body: "x" }],
    });
    // Sanity: the contribution path assigned a non-uuid id, the bug's trigger.
    expect(incoming.assets[0].id).toBe("contrib-skill-contributed-skill");

    const result = await source.importProjection(incoming);

    expect(result.added).toBe(1);
    expect(backend.store.assets).toHaveLength(1);
    expect(UUID_RE.test(String(backend.store.assets[0].id))).toBe(true);
  });

  it("remaps join references to the minted uuids", async () => {
    const backend = new UuidBackend(emptyStore());
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
      newId: seq(),
    });
    const incoming = normalizeContribution({
      assets: [
        { id: "asset-a", type: "skill", name: "Asset A", body: "a" },
        { id: "asset-b", type: "skill", name: "Asset B", body: "b" },
      ],
      dependencies: [{ assetId: "asset-a", dependsOnAssetId: "asset-b" }],
    });

    await source.importProjection(incoming);

    const assetA = backend.store.assets.find(
      (a) => (a as { slug: string }).slug === "asset-a",
    ) as { id: string };
    const assetB = backend.store.assets.find(
      (a) => (a as { slug: string }).slug === "asset-b",
    ) as { id: string };
    expect(UUID_RE.test(assetA.id)).toBe(true);
    expect(UUID_RE.test(assetB.id)).toBe(true);
    expect(backend.store.dependencies).toHaveLength(1);
    const dep = backend.store.dependencies[0] as {
      asset_id: string;
      dependsOn_id: string;
    };
    expect(dep.asset_id).toBe(assetA.id);
    expect(dep.dependsOn_id).toBe(assetB.id);
  });

  it("leaves an update by existing uuid id unchanged and mints nothing", async () => {
    const existingId = "22222222-2222-4222-8222-222222222222";
    const store = emptyStore();
    store.assets.push({
      id: existingId,
      tenantId: FABRIC_TENANT_ID,
      type: "skill",
      name: "Existing",
      slug: "existing",
      description: "d",
      body: "old",
      version: "1.0.0",
      status: "active",
      riskLevel: "low",
      maturity: 0.5,
      tier: "custom",
      contentHash: contentHashOf("skill", "old"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const backend = new UuidBackend(store);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
      newId: () => {
        throw new Error("must not mint a uuid for an update");
      },
    });
    const incoming: ProjectionInput = {
      assets: [
        {
          id: existingId,
          tenantId: FABRIC_TENANT_ID,
          type: "skill",
          name: "Existing",
          slug: "existing",
          description: "d",
          body: "new",
          version: "1.0.0",
          status: "active",
          riskLevel: "low",
          maturity: 0.5,
          tier: "custom",
          contentHash: contentHashOf("skill", "new"),
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-06-19T00:00:00.000Z",
        },
      ],
      tags: [],
      origins: [],
      owners: [],
      bundles: [],
      assetTags: [],
      dependencies: [],
      bundleMemberships: [],
    };

    const result = await source.importProjection(incoming);

    expect(result.added).toBe(0);
    expect(result.updated).toBe(1);
    expect(backend.store.assets).toHaveLength(1);
    expect(backend.store.assets[0].id).toBe(existingId);
    expect((backend.store.assets[0] as { body: string }).body).toBe("new");
  });

  it("reconciles a contributed asset by (type, slug) onto an existing uuid without minting", async () => {
    const existingId = "33333333-3333-4333-8333-333333333333";
    const store = emptyStore();
    store.assets.push({
      id: existingId,
      tenantId: FABRIC_TENANT_ID,
      type: "skill",
      name: "Foo",
      slug: "foo",
      description: "d",
      body: "old",
      version: "1.0.0",
      status: "active",
      riskLevel: "low",
      maturity: 0.5,
      tier: "custom",
      contentHash: contentHashOf("skill", "old"),
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });
    const backend = new UuidBackend(store);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
      newId: () => {
        throw new Error("must not mint a uuid for a reconciled asset");
      },
    });
    // Non-uuid contrib id, but its (skill, foo) matches the existing row.
    const incoming = normalizeContribution({
      assets: [{ type: "skill", name: "Foo", body: "new" }],
    });
    expect(incoming.assets[0].id).toBe("contrib-skill-foo");

    const result = await source.importProjection(incoming);

    expect(result.added).toBe(0);
    expect(result.updated).toBe(1);
    expect(backend.store.assets).toHaveLength(1);
    expect(backend.store.assets[0].id).toBe(existingId);
  });
});
