import { describe, expect, it } from "vitest";

import { FakeDabBackend, UUID_RE } from "@/data/__tests__/fakeDabBackend";

import { contentHashOf } from "./hash";
import type { ProjectionInput } from "./merge";
import { FABRIC_TENANT_ID, RayfinDataSource } from "./RayfinDataSource";
import type { RayfinEntities } from "./rayfinMapper";
import type { AssetRow } from "./types";

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
 * Backend that enforces Fabric's `@uuid()` constraint on a client-supplied id for
 * every entity: a create whose id is present but not a uuid rejects with the exact
 * GraphQL error the live backend returns. The contribution path mints non-uuid
 * dimension ids (tag-<slug>, owner-<slug>, ...), so this reproduces the live failure
 * for new tags/owners/origins/bundles. A create with no id gets a minted uuid (the
 * join-row path), and update/delete are keyed by id.
 */
class UuidStrictBackend extends FakeDabBackend {
  constructor(initial: RayfinEntities) {
    super(initial, { uuidRejectTables: "all", filterMode: "id-only" });
  }
}

const seq = () => {
  let n = 0;
  return () => `77777777-7777-4777-8777-${String((n += 1)).padStart(12, "0")}`;
};

const ASSET_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TAG_T = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const OWNER_O = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const storeAsset = (
  id: string,
  slug: string,
  rest: { owner_id?: string; origin_id?: string } = {},
): RayfinEntities["assets"][number] => ({
  id,
  tenantId: FABRIC_TENANT_ID,
  type: "skill",
  name: slug,
  slug,
  description: "d",
  body: "b",
  version: "1.0.0",
  status: "active",
  riskLevel: "low",
  maturity: 0.5,
  tier: "custom",
  contentHash: contentHashOf("skill", "b"),
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-01T00:00:00Z"),
  ...rest,
});

const inputAsset = (
  id: string,
  slug: string,
  rest: { ownerId?: string; originId?: string } = {},
): AssetRow => ({
  id,
  tenantId: FABRIC_TENANT_ID,
  type: "skill",
  name: slug,
  slug,
  description: "d",
  body: "b",
  version: "1.0.0",
  status: "active",
  riskLevel: "low",
  maturity: 0.5,
  tier: "custom",
  contentHash: contentHashOf("skill", "b"),
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-06-19T00:00:00.000Z",
  ...rest,
});

const projection = (
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

const newSource = (store: RayfinEntities) => {
  const backend = new UuidStrictBackend(store);
  return {
    backend,
    source: new RayfinDataSource(backend, backend, {
      canReview: () => true,
      newId: seq(),
    }),
  };
};

describe("RayfinDataSource.importProjection mints/reconciles dimension ids", () => {
  it("mints a uuid for a new tag and remaps the assetTag reference", async () => {
    const store = emptyStore();
    store.assets.push(storeAsset(ASSET_A, "alpha"));
    const { backend, source } = newSource(store);

    const incoming = projection({
      assets: [inputAsset(ASSET_A, "alpha")],
      tags: [
        {
          id: "tag-security",
          tenantId: FABRIC_TENANT_ID,
          kind: "domain",
          name: "Security",
        },
      ],
      assetTags: [{ assetId: ASSET_A, tagId: "tag-security" }],
    });

    await source.importProjection(incoming);

    expect(backend.store.tags).toHaveLength(1);
    const tag = backend.store.tags[0] as { id: string };
    expect(UUID_RE.test(tag.id)).toBe(true);
    expect(backend.store.assetTags).toHaveLength(1);
    expect((backend.store.assetTags[0] as { tag_id: string }).tag_id).toBe(
      tag.id,
    );
  });

  it("reconciles a new tag onto an existing one by (kind, name) without a duplicate", async () => {
    const store = emptyStore();
    store.assets.push(storeAsset(ASSET_A, "alpha"));
    store.tags.push({
      id: TAG_T,
      tenantId: FABRIC_TENANT_ID,
      kind: "domain",
      name: "Security",
    });
    const { backend, source } = newSource(store);

    const incoming = projection({
      assets: [inputAsset(ASSET_A, "alpha")],
      // Non-uuid contrib id, but (domain, Security) matches the existing tag.
      tags: [
        {
          id: "tag-security",
          tenantId: FABRIC_TENANT_ID,
          kind: "domain",
          name: "Security",
        },
      ],
      assetTags: [{ assetId: ASSET_A, tagId: "tag-security" }],
    });

    await source.importProjection(incoming);

    expect(backend.store.tags).toHaveLength(1);
    expect((backend.store.tags[0] as { id: string }).id).toBe(TAG_T);
    expect((backend.store.assetTags[0] as { tag_id: string }).tag_id).toBe(
      TAG_T,
    );
  });

  it("mints a uuid for a new owner and remaps asset.ownerId", async () => {
    const store = emptyStore();
    store.assets.push(storeAsset(ASSET_A, "alpha"));
    const { backend, source } = newSource(store);

    const incoming = projection({
      assets: [inputAsset(ASSET_A, "alpha", { ownerId: "owner-paul" })],
      owners: [
        {
          id: "owner-paul",
          tenantId: FABRIC_TENANT_ID,
          name: "Paul",
          email: "paul@x.io",
          role: "maintainer",
        },
      ],
    });

    await source.importProjection(incoming);

    expect(backend.store.owners).toHaveLength(1);
    const owner = backend.store.owners[0] as { id: string };
    expect(UUID_RE.test(owner.id)).toBe(true);
    expect((backend.store.assets[0] as { owner_id: string }).owner_id).toBe(
      owner.id,
    );
  });

  it("reconciles a new owner onto an existing one by email without a duplicate", async () => {
    const store = emptyStore();
    store.assets.push(storeAsset(ASSET_A, "alpha"));
    store.owners.push({
      id: OWNER_O,
      tenantId: FABRIC_TENANT_ID,
      name: "Paul",
      email: "paul@x.io",
      role: "maintainer",
    });
    const { backend, source } = newSource(store);

    const incoming = projection({
      assets: [inputAsset(ASSET_A, "alpha", { ownerId: "owner-paul" })],
      owners: [
        {
          id: "owner-paul",
          tenantId: FABRIC_TENANT_ID,
          name: "Paul",
          email: "paul@x.io",
          role: "maintainer",
        },
      ],
    });

    await source.importProjection(incoming);

    expect(backend.store.owners).toHaveLength(1);
    expect((backend.store.owners[0] as { id: string }).id).toBe(OWNER_O);
    expect((backend.store.assets[0] as { owner_id: string }).owner_id).toBe(
      OWNER_O,
    );
  });

  it("mints a uuid for a new origin and remaps asset.originId", async () => {
    const store = emptyStore();
    store.assets.push(storeAsset(ASSET_A, "alpha"));
    const { backend, source } = newSource(store);

    const incoming = projection({
      assets: [inputAsset(ASSET_A, "alpha", { originId: "origin-the-vault" })],
      origins: [
        {
          id: "origin-the-vault",
          tenantId: FABRIC_TENANT_ID,
          name: "The Vault",
          kind: "local",
        },
      ],
    });

    await source.importProjection(incoming);

    expect(backend.store.origins).toHaveLength(1);
    const origin = backend.store.origins[0] as { id: string };
    expect(UUID_RE.test(origin.id)).toBe(true);
    expect((backend.store.assets[0] as { origin_id: string }).origin_id).toBe(
      origin.id,
    );
  });

  it("mints a uuid for a new bundle and remaps the bundleMembership reference", async () => {
    const store = emptyStore();
    store.assets.push(storeAsset(ASSET_A, "alpha"));
    const { backend, source } = newSource(store);

    const incoming = projection({
      assets: [inputAsset(ASSET_A, "alpha")],
      bundles: [
        {
          id: "bundle-core",
          tenantId: FABRIC_TENANT_ID,
          name: "Core",
          description: "core bundle",
        },
      ],
      bundleMemberships: [{ bundleId: "bundle-core", assetId: ASSET_A }],
    });

    await source.importProjection(incoming);

    expect(backend.store.bundles).toHaveLength(1);
    const bundle = backend.store.bundles[0] as { id: string };
    expect(UUID_RE.test(bundle.id)).toBe(true);
    expect(backend.store.bundleMemberships).toHaveLength(1);
    expect(
      (backend.store.bundleMemberships[0] as { bundle_id: string }).bundle_id,
    ).toBe(bundle.id);
  });

  it("does not let a reconciled contribution overwrite an existing owner's name or role", async () => {
    const store = emptyStore();
    store.assets.push(storeAsset(ASSET_A, "alpha"));
    store.owners.push({
      id: OWNER_O,
      tenantId: FABRIC_TENANT_ID,
      name: "Paul",
      email: "paul@x.io",
      role: "maintainer",
    });
    const { backend, source } = newSource(store);

    // A contribution reconciles onto the existing owner by email but tries to rename
    // it and downgrade its role. Reconcile must reuse the id without mutating the row.
    const incoming = projection({
      assets: [inputAsset(ASSET_A, "alpha", { ownerId: "owner-evil" })],
      owners: [
        {
          id: "owner-evil",
          tenantId: FABRIC_TENANT_ID,
          name: "ATTACKER",
          email: "paul@x.io",
          role: "author",
        },
      ],
    });

    await source.importProjection(incoming);

    expect(backend.store.owners).toHaveLength(1);
    const owner = backend.store.owners[0] as {
      id: string;
      name: string;
      role: string;
    };
    expect(owner.id).toBe(OWNER_O);
    expect(owner.name).toBe("Paul");
    expect(owner.role).toBe("maintainer");
  });

  it("keeps emailless contributed owners distinct instead of collapsing them", async () => {
    const { backend, source } = newSource(emptyStore());

    const incoming = projection({
      owners: [
        {
          id: "owner-alice",
          tenantId: FABRIC_TENANT_ID,
          name: "Alice",
          email: "",
          role: "author",
        },
        {
          id: "owner-bob",
          tenantId: FABRIC_TENANT_ID,
          name: "Bob",
          email: "",
          role: "author",
        },
      ],
    });

    await source.importProjection(incoming);

    expect(backend.store.owners).toHaveLength(2);
    expect(
      (backend.store.owners as { name: string }[]).map((o) => o.name).sort(),
    ).toEqual(["Alice", "Bob"]);
  });

  it("reconciles a tag case-insensitively by name without a duplicate", async () => {
    const store = emptyStore();
    store.assets.push(storeAsset(ASSET_A, "alpha"));
    store.tags.push({
      id: TAG_T,
      tenantId: FABRIC_TENANT_ID,
      kind: "domain",
      name: "Security",
    });
    const { backend, source } = newSource(store);

    const incoming = projection({
      assets: [inputAsset(ASSET_A, "alpha")],
      // Same tag, lowercased: must reconcile onto the existing row, not duplicate it.
      tags: [
        {
          id: "tag-security",
          tenantId: FABRIC_TENANT_ID,
          kind: "domain",
          name: "security",
        },
      ],
      assetTags: [{ assetId: ASSET_A, tagId: "tag-security" }],
    });

    await source.importProjection(incoming);

    expect(backend.store.tags).toHaveLength(1);
    const tag = backend.store.tags[0] as { id: string; name: string };
    expect(tag.id).toBe(TAG_T);
    expect(tag.name).toBe("Security");
    expect((backend.store.assetTags[0] as { tag_id: string }).tag_id).toBe(
      TAG_T,
    );
  });
});
