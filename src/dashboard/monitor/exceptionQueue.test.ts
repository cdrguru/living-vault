import { describe, expect, it } from "vitest";

import type { AssetRow, UtilizationRow, VaultDataset } from "@/data/types";
import { seedDataset } from "@/data";

import { exceptionQueue, needsAttentionCount } from "./exceptionQueue";

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

const heavy = (assetId: string): UtilizationRow => ({
  id: `${assetId}:u`,
  tenantId: TENANT,
  assetId,
  date: "2026-06-01",
  invocations: 200,
  successes: 190,
  errors: 10,
  refusals: 0,
  latencyMs: 100,
  tokens: 0,
  cost: 0,
});

// star: governed and effective and fresh, never in the queue.
const star = mkAsset({ id: "star" });
// risk: effective but ungoverned (no owner, no tag, no origin).
const risk = mkAsset({ id: "risk", ownerId: undefined, originId: undefined });
// shelfware: governed but no usage, not effective.
const shelfware = mkAsset({ id: "shelf" });
// deadWeight: ungoverned and no usage.
const deadWeight = mkAsset({
  id: "dead",
  ownerId: undefined,
  originId: undefined,
});
// staleStar: governed and effective but very old, surfaces as a stale row.
const staleStar = mkAsset({
  id: "stalestar",
  updatedAt: "2024-01-01T00:00:00Z",
});

const dataset: VaultDataset = {
  assets: [star, risk, shelfware, deadWeight, staleStar],
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
  bundles: [],
  assetTags: [
    { assetId: "star", tagId: "t1" },
    { assetId: "shelf", tagId: "t1" },
    { assetId: "stalestar", tagId: "t1" },
  ],
  dependencies: [],
  bundleMemberships: [],
  evalResults: [],
  utilization: [heavy("star"), heavy("risk"), heavy("stalestar")],
};

describe("exceptionQueue", () => {
  it("excludes a healthy Star but includes the four exception kinds", () => {
    const queue = exceptionQueue(dataset);
    const ids = queue.map((row) => row.assetId);
    expect(ids).not.toContain("star");
    expect(ids).toContain("risk");
    expect(ids).toContain("shelf");
    expect(ids).toContain("dead");
    expect(ids).toContain("stalestar");
  });

  it("orders rows by severity descending, never alphabetical", () => {
    const queue = exceptionQueue(dataset);
    for (let i = 1; i < queue.length; i += 1) {
      expect(queue[i - 1].severity).toBeGreaterThanOrEqual(queue[i].severity);
    }
    // The first row is the highest severity kind present (risk).
    expect(queue[0].kind).toBe("risk");
  });

  it("surfaces a stale Star as a stale row so freshness is never hidden", () => {
    const row = exceptionQueue(dataset).find(
      (item) => item.assetId === "stalestar",
    );
    expect(row?.kind).toBe("stale");
  });

  it("returns an empty queue when every asset is a healthy Star", () => {
    const clean: VaultDataset = {
      ...dataset,
      assets: [star],
      utilization: [heavy("star")],
      assetTags: [{ assetId: "star", tagId: "t1" }],
    };
    expect(exceptionQueue(clean)).toEqual([]);
  });

  it("carries the engine severity band on every row", () => {
    const queue = exceptionQueue(dataset);
    for (const row of queue) {
      expect(["high", "medium", "low"]).toContain(row.severityBand);
    }
    // The ungoverned-but-used risk is a high-severity band.
    const riskRow = queue.find((row) => row.assetId === "risk");
    expect(riskRow?.severityBand).toBe("high");
  });
});

describe("exceptionQueue regressing", () => {
  const richRow = (
    assetId: string,
    date: string,
    invocations: number,
    successes: number,
  ): UtilizationRow => ({
    id: `${assetId}:${date}`,
    tenantId: TENANT,
    assetId,
    date,
    invocations,
    successes,
    errors: invocations - successes,
    refusals: 0,
    latencyMs: 100,
    tokens: 0,
    cost: 0,
  });

  // slipping is a governed Star over full history, but its recent half fell
  // from a perfect to a 0.5 success rate on trustworthy evidence.
  const slippingDs: VaultDataset = {
    ...dataset,
    assets: [mkAsset({ id: "slipping" })],
    assetTags: [],
    utilization: [
      richRow("slipping", "2026-06-01", 60, 60),
      richRow("slipping", "2026-06-02", 60, 30),
    ],
  };

  it("surfaces a regressing asset under the risk display kind with a decline reason", () => {
    const row = exceptionQueue(slippingDs).find(
      (item) => item.assetId === "slipping",
    );
    expect(row).toBeDefined();
    expect(row?.kind).toBe("risk");
    expect(row?.severityBand).toBe("high");
    expect(row?.label).toBe("Effectiveness is declining");
    expect(row?.reason.toLowerCase()).toContain("dropped");
  });
});

describe("needsAttentionCount (item 2: chip matches the rendered Monitor queue)", () => {
  const base = needsAttentionCount(seedDataset);

  it("counts actionable rows only, never more than the full flagged set", () => {
    expect(base).toBeGreaterThan(0);
    expect(base).toBeLessThanOrEqual(exceptionQueue(seedDataset).length);
  });

  it("drops by one when an actionable asset is acknowledged (tracks triage like the Monitor's default view)", () => {
    const top = exceptionQueue(seedDataset)[0]; // highest severity, so actionable
    const triaged = needsAttentionCount(seedDataset, {
      [top.assetId]: { status: "acknowledged" },
    });
    expect(triaged).toBe(base - 1);
  });

  it("excludes a currently-snoozed asset but counts one whose snooze expired", () => {
    const top = exceptionQueue(seedDataset)[0];
    const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    expect(
      needsAttentionCount(seedDataset, {
        [top.assetId]: { status: "snoozed", snoozedUntil: future },
      }),
    ).toBe(base - 1);
    expect(
      needsAttentionCount(seedDataset, {
        [top.assetId]: { status: "snoozed", snoozedUntil: past },
      }),
    ).toBe(base);
  });
});
