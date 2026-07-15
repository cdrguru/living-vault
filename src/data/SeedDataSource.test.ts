import { beforeEach, describe, expect, it } from "vitest";

import { SeedDataSource } from "./SeedDataSource";
import { fabricLibraryProjection } from "./projection";
import { seedDataset, TENANT } from "./seed";
import type { TelemetryMeta, UtilizationRow, VaultDataset } from "./types";

const baseInput = {
  type: "prompt" as const,
  name: "New Prompt",
  slug: "new-prompt",
  description: "A test prompt.",
  body: "Do the thing.",
  version: "1.0.0",
  status: "active" as const,
  riskLevel: "low" as const,
  maturity: 0.8,
  tier: "custom" as const,
  ownerId: "own-lee",
  originId: "org-local",
};

describe("SeedDataSource CRUD", () => {
  beforeEach(() => localStorage.clear());

  it("adds an asset with derived id, hash, timestamps, and persistence", async () => {
    const ds = new SeedDataSource();
    const before = (await ds.getDataset()).assets.length;
    const created = await ds.addAsset(baseInput);
    expect(created.id).toBeTruthy();
    expect(created.contentHash).toBeTruthy();
    expect(created.createdAt).toBeTruthy();
    const after = (await new SeedDataSource().getDataset()).assets.length;
    expect(after).toBe(before + 1);
  });

  it("rehydrates a dataset persisted before evalResults existed and still writes", async () => {
    // A blob written before the evalResults array was added to VaultDataset.
    const legacy = structuredClone(seedDataset) as Partial<VaultDataset>;
    delete legacy.evalResults;
    localStorage.setItem("living-vault:dataset:v1", JSON.stringify(legacy));
    const ds = new SeedDataSource();
    // load() defaults the missing array so the contract loop never hits undefined.
    expect((await ds.getDataset()).evalResults).toEqual([]);
    await expect(ds.addAsset(baseInput)).resolves.toBeTruthy();
  });

  it("expands tagIds into assetTags on add", async () => {
    const ds = new SeedDataSource();
    const created = await ds.addAsset({
      ...baseInput,
      tagIds: ["tag-d-0", "tag-c-0"],
    });
    const data = await new SeedDataSource().getDataset();
    expect(
      data.assetTags.filter((tag) => tag.assetId === created.id),
    ).toHaveLength(2);
  });

  it("updates an asset and recomputes its hash and updatedAt", async () => {
    const ds = new SeedDataSource();
    const created = await ds.addAsset(baseInput);
    const updated = await ds.updateAsset(created.id, { body: "Changed body." });
    expect(updated.contentHash).not.toBe(created.contentHash);
    expect(updated.updatedAt >= created.updatedAt).toBe(true);
  });

  it("retire is a soft delete and deleteAsset removes row plus bridges", async () => {
    const ds = new SeedDataSource();
    const created = await ds.addAsset({ ...baseInput, tagIds: ["tag-d-0"] });
    await ds.retireAsset(created.id);
    let data = await new SeedDataSource().getDataset();
    expect(data.assets.find((asset) => asset.id === created.id)?.status).toBe(
      "retired",
    );
    await ds.deleteAsset(created.id);
    data = await new SeedDataSource().getDataset();
    expect(
      data.assets.find((asset) => asset.id === created.id),
    ).toBeUndefined();
    expect(
      data.assetTags.find((tag) => tag.assetId === created.id),
    ).toBeUndefined();
  });

  it("rejects a mutation that would violate the coherence contract", async () => {
    const ds = new SeedDataSource();
    await expect(
      ds.addAsset({ ...baseInput, tier: "forked" }),
    ).rejects.toThrow();
  });

  it("importTelemetry replaces utilization, drops unknown assets, and is idempotent", async () => {
    const ds = new SeedDataSource();
    await ds.importProjection(fabricLibraryProjection);
    const seeded = await ds.getDataset();
    const knownId = seeded.assets[0].id;
    const meta: TelemetryMeta = {
      source: "claude-code",
      generatedAt: "2026-06-07T00:00:00Z",
      windowStart: "2026-06-07",
      windowEnd: "2026-06-07",
      sessions: 1,
      tracked: {
        invocations: true,
        successes: true,
        errors: true,
        latency: true,
        refusals: false,
        tokens: false,
        cost: false,
      },
    };
    const rows: UtilizationRow[] = [
      {
        id: `claude-code:${knownId}:2026-06-07`,
        tenantId: TENANT,
        assetId: knownId,
        date: "2026-06-07",
        invocations: 5,
        successes: 4,
        errors: 1,
        refusals: 0,
        latencyMs: 900,
        tokens: 0,
        cost: 0,
      },
      {
        id: "claude-code:ghost:2026-06-07",
        tenantId: TENANT,
        assetId: "ghost",
        date: "2026-06-07",
        invocations: 1,
        successes: 1,
        errors: 0,
        refusals: 0,
        latencyMs: 100,
        tokens: 0,
        cost: 0,
      },
    ];

    const first = await ds.importTelemetry(rows, meta);
    expect(first.applied).toBe(1);
    expect(first.dropped).toBe(1);

    const after = await ds.getDataset();
    expect(after.utilization).toHaveLength(1);
    expect(after.telemetryMeta?.source).toBe("claude-code");

    const second = await ds.importTelemetry(rows, meta);
    expect(second.applied).toBe(1);
    expect(second.dropped).toBe(1);
    const final = await ds.getDataset();
    expect(final.utilization).toHaveLength(1);
  });

  it("does not wipe seed utilization when the snapshot is empty or unmatched", async () => {
    const meta: TelemetryMeta = {
      source: "claude-code",
      generatedAt: "2026-06-07T00:00:00Z",
      windowStart: "2026-06-07",
      windowEnd: "2026-06-07",
      sessions: 0,
      tracked: {
        invocations: true,
        successes: true,
        errors: true,
        latency: true,
        refusals: false,
        tokens: false,
        cost: false,
      },
    };

    const ds = new SeedDataSource();
    const before = (await ds.getDataset()).utilization.length;
    expect(before).toBeGreaterThan(0);

    const empty = await ds.importTelemetry([], meta);
    expect(empty).toEqual({
      applied: 0,
      dropped: 0,
      skipped: "no-matching-rows",
    });
    expect((await ds.getDataset()).utilization).toHaveLength(before);

    const ghostRows: UtilizationRow[] = [
      {
        id: "claude-code:ghost:2026-06-07",
        tenantId: TENANT,
        assetId: "ghost",
        date: "2026-06-07",
        invocations: 3,
        successes: 3,
        errors: 0,
        refusals: 0,
        latencyMs: 100,
        tokens: 0,
        cost: 0,
      },
    ];
    const unmatched = await ds.importTelemetry(ghostRows, meta);
    expect(unmatched).toEqual({
      applied: 0,
      dropped: 1,
      skipped: "no-matching-rows",
    });
    const after = await ds.getDataset();
    expect(after.utilization).toHaveLength(before);
    expect(after.telemetryMeta).toBeUndefined();
  });

  it("preserves telemetryMeta and real utilization across a later importProjection", async () => {
    const ds = new SeedDataSource();
    await ds.importProjection(fabricLibraryProjection);
    const knownId = (await ds.getDataset()).assets[0].id;
    const meta: TelemetryMeta = {
      source: "claude-code",
      generatedAt: "2026-06-07T00:00:00Z",
      windowStart: "2026-06-07",
      windowEnd: "2026-06-07",
      sessions: 1,
      tracked: {
        invocations: true,
        successes: true,
        errors: true,
        latency: true,
        refusals: false,
        tokens: false,
        cost: false,
      },
    };
    await ds.importTelemetry(
      [
        {
          id: `claude-code:${knownId}:2026-06-07`,
          tenantId: TENANT,
          assetId: knownId,
          date: "2026-06-07",
          invocations: 5,
          successes: 5,
          errors: 0,
          refusals: 0,
          latencyMs: 100,
          tokens: 0,
          cost: 0,
        },
      ],
      meta,
    );
    await ds.importProjection(fabricLibraryProjection);
    const after = await ds.getDataset();
    expect(after.telemetryMeta?.source).toBe("claude-code");
    expect(after.utilization).toHaveLength(1);
  });
});
