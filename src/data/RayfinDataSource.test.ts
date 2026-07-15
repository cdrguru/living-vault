import { describe, expect, it } from "vitest";

import { FakeDabBackend, UUID_RE } from "@/data/__tests__/fakeDabBackend";

import type { DataSource } from "./DataSource";
import { contentHashOf } from "./hash";
import type { ProjectionInput } from "./merge";
import { RayfinDataSource, type RayfinReader } from "./RayfinDataSource";
import type { RayfinEntities } from "./rayfinMapper";
import type { AssetInput, TelemetryMeta } from "./types";

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
  bundles: [],
  assetTags: [{ id: "at1", asset_id: "a1", tag_id: "t1" }],
  dependencies: [],
  bundleMemberships: [],
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
    },
  ],
};

const reader: RayfinReader = { readAll: () => Promise.resolve(entities) };

describe("RayfinDataSource", () => {
  it("maps Fabric entities into a contract-clean dataset on read", async () => {
    const source = new RayfinDataSource(reader);
    const dataset = await source.getDataset();
    expect(dataset.assets[0].createdAt).toBe("2026-01-02T03:04:05.000Z");
    expect(dataset.assetTags[0]).toEqual({ assetId: "a1", tagId: "t1" });
    expect(dataset.utilization[0].date).toBe("2026-06-01");
  });

  it("rejects a read that violates the coherence contract", async () => {
    const bad: RayfinReader = {
      readAll: () =>
        Promise.resolve({
          ...entities,
          assetTags: [{ id: "x", asset_id: "ghost", tag_id: "t1" }],
        }),
    };
    await expect(new RayfinDataSource(bad).getDataset()).rejects.toThrow(
      /Contract violation/,
    );
  });

  it("gates writes behind live Fabric validation", async () => {
    const source: DataSource = new RayfinDataSource(reader);
    await expect(source.addAsset({} as never)).rejects.toThrow(/Fabric/);
    await expect(source.importTelemetry([], {} as never)).rejects.toThrow(
      /Fabric/,
    );
  });
});

/**
 * Backend for the write tests: enforces the deployed schema's required NOT NULL
 * scalar FKs on the join entities and Utilization, plus the Utilization
 * `@uuid()` id constraint (a client-supplied non-uuid id, like the synthetic
 * dedup id normalizeTelemetry mints, rejects exactly like the live backend,
 * and an omitted id gets a server-minted uuid).
 */
class MockBackend extends FakeDabBackend {
  constructor(initial: RayfinEntities) {
    super(initial, {
      requiredScalarFks: {
        AssetTag: ["assetId", "tagId"],
        AssetDependency: ["assetId", "dependsOnAssetId"],
        BundleMembership: ["bundleId", "assetId"],
        Utilization: ["assetId", "tenantId"],
      },
      uuidRejectTables: ["Utilization"],
    });
  }
}

const sampleInput: AssetInput = {
  type: "skill",
  name: "New Skill",
  slug: "new-skill",
  description: "desc",
  body: "body",
  version: "1.0.0",
  status: "active",
  riskLevel: "low",
  maturity: 0.5,
  tier: "custom",
};

const telemetryMeta = {
  source: "claude-code",
  generatedAt: "2026-06-02",
  windowStart: "2026-06-01",
  windowEnd: "2026-06-02",
  sessions: 1,
  tracked: {
    invocations: true,
    successes: true,
    errors: true,
    latency: true,
    refusals: true,
    tokens: true,
    cost: true,
  },
} as TelemetryMeta;

describe("RayfinDataSource writes", () => {
  it("addAsset creates a contract-clean asset with a server id and correct hash", async () => {
    const backend = new MockBackend(entities);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
    });
    const row = await source.addAsset({ ...sampleInput, tagIds: ["t1"] });
    expect(row.id).not.toBe("__pending_new_asset__");
    expect(row.contentHash).toBe(contentHashOf("skill", "body"));
    expect(backend.store.assets).toHaveLength(2);
    expect(
      backend.store.assetTags.some(
        (tag) => tag.asset_id === row.id && tag.tag_id === "t1",
      ),
    ).toBe(true);
  });

  it("addAsset rejects and leaves the store unchanged when the contract fails", async () => {
    const backend = new MockBackend(entities);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
    });
    await expect(
      source.addAsset({ ...sampleInput, tagIds: ["ghost-tag"] }),
    ).rejects.toThrow(/Contract violation/);
    expect(backend.store.assets).toHaveLength(1);
    expect(backend.store.assetTags).toHaveLength(1);
  });

  it("updateAsset recomputes the hash, preserves createdAt, and replaces tags", async () => {
    const backend = new MockBackend(entities);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
    });
    const updated = await source.updateAsset("a1", {
      body: "changed",
      tagIds: [],
    });
    expect(updated.createdAt).toBe("2026-01-02T03:04:05.000Z");
    expect(updated.contentHash).toBe(contentHashOf("skill", "changed"));
    expect((backend.store.assets[0] as { body: string }).body).toBe("changed");
    expect(backend.store.assetTags).toHaveLength(0);
  });

  it("retireAsset sets status to retired", async () => {
    const backend = new MockBackend(entities);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
    });
    await source.retireAsset("a1");
    expect((backend.store.assets[0] as { status: string }).status).toBe(
      "retired",
    );
  });

  it("deleteAsset cascades to tag, dependency (both directions), membership, and utilization rows", async () => {
    // Build a second asset and a full join graph so both AssetDependency directions
    // (a1 as source and a1 as target) and a BundleMembership are exercised.
    const withGraph: RayfinEntities = structuredClone(entities);
    withGraph.assets.push({
      ...withGraph.assets[0],
      id: "a2",
      slug: "a2",
      name: "A2",
    });
    withGraph.bundles = [
      { id: "b1", tenantId: "t", name: "B1", description: "d" },
    ];
    withGraph.dependencies = [
      { id: "d1", asset_id: "a1", dependsOn_id: "a2" },
      { id: "d2", asset_id: "a2", dependsOn_id: "a1" },
    ];
    withGraph.bundleMemberships = [
      { id: "bm1", bundle_id: "b1", asset_id: "a1" },
    ];
    const backend = new MockBackend(withGraph);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
    });
    await source.deleteAsset("a1");
    expect(backend.store.assets.map((a) => (a as { id: string }).id)).toEqual([
      "a2",
    ]);
    expect(backend.store.assetTags).toHaveLength(0);
    expect(backend.store.dependencies).toHaveLength(0);
    expect(backend.store.bundleMemberships).toHaveLength(0);
    expect(backend.store.utilization).toHaveLength(0);
  });

  it("importTelemetry skips when no rows match a known asset", async () => {
    const backend = new MockBackend(entities);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
    });
    const before = backend.store.utilization.length;
    const result = await source.importTelemetry(
      [
        {
          id: "x",
          tenantId: "t",
          assetId: "ghost",
          date: "2026-06-02",
          invocations: 1,
          successes: 1,
          errors: 0,
          refusals: 0,
          latencyMs: 0,
          tokens: 0,
          cost: 0,
        },
      ],
      telemetryMeta,
    );
    expect(result.skipped).toBe("no-matching-rows");
    expect(backend.store.utilization).toHaveLength(before);
  });

  it("importTelemetry replaces the utilization table for matching rows", async () => {
    const backend = new MockBackend(entities);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
    });
    const result = await source.importTelemetry(
      [
        {
          id: "u2",
          tenantId: "t",
          assetId: "a1",
          date: "2026-06-02",
          invocations: 3,
          successes: 3,
          errors: 0,
          refusals: 0,
          latencyMs: 50,
          tokens: 10,
          cost: 0.1,
        },
      ],
      telemetryMeta,
    );
    expect(result.applied).toBe(1);
    expect(backend.store.utilization).toHaveLength(1);
    const stored = backend.store.utilization[0] as {
      id: string;
      asset_id: string;
      invocations: number;
    };
    // Utilization.id is @uuid(): the id is server-assigned, not the upload's synthetic
    // dedup id, so the table is replaced by content rather than by preserving the
    // source id (which Fabric rejects when it is not a uuid).
    expect(stored.id).not.toBe("u2");
    expect(UUID_RE.test(stored.id)).toBe(true);
    expect(stored.asset_id).toBe("a1");
    expect(stored.invocations).toBe(3);
  });

  it("importProjection adds new catalog rows and is idempotent", async () => {
    const backend = new MockBackend(entities);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
    });
    // An upstream catalog projection carries uuid ids, which pass through unminted
    // (idempotent re-import keys off a stable id).
    const a2Id = "a2a2a2a2-0000-4000-8000-000000000002";
    const incoming: ProjectionInput = {
      assets: [
        {
          id: a2Id,
          tenantId: "t",
          type: "skill",
          name: "A2",
          slug: "a2",
          description: "d",
          body: "b2",
          version: "1.0.0",
          status: "active",
          riskLevel: "low",
          maturity: 0.7,
          tier: "stock",
          contentHash: contentHashOf("skill", "b2"),
          createdAt: "2026-05-01T00:00:00.000Z",
          updatedAt: "2026-05-01T00:00:00.000Z",
        },
      ],
      tags: [],
      origins: [],
      owners: [],
      bundles: [],
      assetTags: [{ assetId: a2Id, tagId: "t1" }],
      dependencies: [],
      bundleMemberships: [],
    };
    const first = await source.importProjection(incoming);
    expect(first.added).toBe(1);
    expect(backend.store.assets).toHaveLength(2);
    expect(
      backend.store.assetTags.some(
        (tag) => tag.asset_id === a2Id && tag.tag_id === "t1",
      ),
    ).toBe(true);
    const snapshot = structuredClone(backend.store);
    const second = await source.importProjection(incoming);
    // A re-import adds nothing; importDelta reports the already-present asset as an
    // update, but the store must be byte-identical (true idempotency).
    expect(second.added).toBe(0);
    expect(backend.store).toEqual(snapshot);
  });

  it("importProjection rejects a contract-violating projection and leaves the store unchanged", async () => {
    const backend = new MockBackend(entities);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
    });
    const bad: ProjectionInput = {
      assets: [],
      tags: [],
      origins: [],
      owners: [],
      bundles: [],
      assetTags: [{ assetId: "ghost", tagId: "t1" }],
      dependencies: [],
      bundleMemberships: [],
    };
    await expect(source.importProjection(bad)).rejects.toThrow(
      /Contract violation/,
    );
    expect(backend.store.assets).toHaveLength(1);
    expect(backend.store.assetTags).toHaveLength(1);
  });
});

describe("RayfinDataSource importProjection review gate", () => {
  const emptyProjection: ProjectionInput = {
    assets: [],
    tags: [],
    origins: [],
    owners: [],
    bundles: [],
    assetTags: [],
    dependencies: [],
    bundleMemberships: [],
  };

  it("rejects a merge when the actor cannot review", async () => {
    const backend = new MockBackend(entities);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => false,
    });
    await expect(source.importProjection(emptyProjection)).rejects.toThrow(
      /restricted to maintainers and admins/,
    );
  });

  it("fails closed when no review guard is configured", async () => {
    const backend = new MockBackend(entities);
    const source = new RayfinDataSource(backend, backend);
    await expect(source.importProjection(emptyProjection)).rejects.toThrow(
      /no maintainer\/admin review guard is configured/,
    );
  });

  it("allows a merge for a maintainer/admin actor", async () => {
    const backend = new MockBackend(entities);
    const source = new RayfinDataSource(backend, backend, {
      canReview: () => true,
    });
    await expect(source.importProjection(emptyProjection)).resolves.toEqual({
      added: 0,
      updated: 0,
    });
  });
});
