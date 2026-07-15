import { describe, expect, it } from "vitest";

import { makeAsset, makeDataset, makeUtilRow } from "./__tests__/fixtures";
import { partitionGovernance, utilizationByOrigin } from "./metrics";
import { TENANT } from "./seed";
import type {
  AssetRow,
  OriginRow,
  UtilizationRow,
  VaultDataset,
} from "./types";

// A fully governed asset: owner present, origin present, described, active. Tests
// opt into a governance gap via overrides. The shared factory with this file's
// origin default (org-a, an origin that exists in emptyDataset below).
const asset = (id: string, overrides: Partial<AssetRow> = {}): AssetRow =>
  makeAsset(id, { originId: "org-a", ...overrides });

const origin = (id: string, name: string): OriginRow => ({
  id,
  tenantId: TENANT,
  name,
  kind: "repo",
  url: `https://example.test/${id}`,
});

const utilRow = (
  assetId: string,
  invocations: number,
  overrides: Partial<UtilizationRow> = {},
): UtilizationRow => makeUtilRow(assetId, "2026-06-01", invocations, overrides);

const emptyDataset = (over: Partial<VaultDataset> = {}): VaultDataset =>
  makeDataset({
    tags: [{ id: "tg", tenantId: TENANT, kind: "capability", name: "Cap" }],
    origins: [origin("org-a", "Repo A"), origin("org-b", "Repo B")],
    ...over,
  });

describe("partitionGovernance (C11)", () => {
  it("buckets an owner-less asset as orphaned, never governed or ungoverned", () => {
    const ds = emptyDataset({ assets: [asset("a", { ownerId: undefined })] });
    const part = partitionGovernance(ds);
    expect(part.orphaned.map((a) => a.id)).toEqual(["a"]);
    expect(part.governed).toEqual([]);
    expect(part.ungoverned).toEqual([]);
  });

  it("buckets a fully populated owned asset as governed", () => {
    const ds = emptyDataset({
      assets: [asset("a")],
      assetTags: [{ assetId: "a", tagId: "tg" }],
    });
    const part = partitionGovernance(ds);
    expect(part.governed.map((a) => a.id)).toEqual(["a"]);
    expect(part.ungoverned).toEqual([]);
    expect(part.orphaned).toEqual([]);
  });

  it("buckets an owned asset below the governance bar as ungoverned", () => {
    // Owned, but missing description, tag, and origin: well under GOVERNED_THRESHOLD.
    const ds = emptyDataset({
      assets: [asset("a", { description: "  ", originId: undefined })],
    });
    const part = partitionGovernance(ds);
    expect(part.ungoverned.map((a) => a.id)).toEqual(["a"]);
    expect(part.governed).toEqual([]);
    expect(part.orphaned).toEqual([]);
  });

  it("partitions every asset into exactly one bucket (mutually exclusive, exhaustive)", () => {
    const ds = emptyDataset({
      assets: [
        asset("governed", { originId: "org-a" }),
        asset("orphan", { ownerId: undefined }),
        asset("ungoverned", { description: "", originId: undefined }),
      ],
      assetTags: [{ assetId: "governed", tagId: "tg" }],
    });
    const part = partitionGovernance(ds);
    const total =
      part.governed.length + part.orphaned.length + part.ungoverned.length;
    expect(total).toBe(ds.assets.length);
  });
});

describe("utilizationByOrigin (C12)", () => {
  it("rolls up invocations for assets that share an upstream origin", () => {
    const ds = emptyDataset({
      assets: [
        asset("a", { originId: "org-a" }),
        asset("b", { originId: "org-a" }),
      ],
      utilization: [utilRow("a", 10), utilRow("b", 5)],
    });
    const rows = utilizationByOrigin(ds);
    const repoA = rows.find((r) => r.origin?.id === "org-a");
    expect(repoA?.invocations).toBe(15);
    expect(repoA?.assetCount).toBe(2);
    expect(repoA?.assetIds.sort()).toEqual(["a", "b"]);
  });

  it("buckets assets with no recorded origin under a null-origin group", () => {
    const ds = emptyDataset({
      assets: [asset("a", { originId: undefined })],
      utilization: [utilRow("a", 7)],
    });
    const rows = utilizationByOrigin(ds);
    const noOrigin = rows.find((r) => r.origin === null);
    expect(noOrigin?.invocations).toBe(7);
    expect(noOrigin?.assetIds).toEqual(["a"]);
  });

  it("sorts origins by invocations descending", () => {
    const ds = emptyDataset({
      assets: [
        asset("a", { originId: "org-a" }),
        asset("b", { originId: "org-b" }),
      ],
      utilization: [utilRow("a", 3), utilRow("b", 20)],
    });
    const rows = utilizationByOrigin(ds);
    expect(rows.map((r) => r.origin?.id)).toEqual(["org-b", "org-a"]);
  });
});
