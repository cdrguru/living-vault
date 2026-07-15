import { describe, expect, it } from "vitest";

import { harnessUsageSnapshot } from "./harnessUsage";
import { RayfinDataSource } from "./RayfinDataSource";
import { SeedDataSource } from "./SeedDataSource";
import { telemetrySnapshot } from "./telemetrySnapshot";
import type { RayfinEntities } from "./rayfinMapper";

const emptyEntities: RayfinEntities = {
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
};

const fabricSource = () =>
  new RayfinDataSource({ readAll: () => Promise.resolve(emptyEntities) });

describe("getHarnessUsage read path", () => {
  it("returns the committed harness summaries from SeedDataSource", () => {
    const rows = new SeedDataSource().getHarnessUsage();
    expect(rows.length).toBe(harnessUsageSnapshot.sources.length);
  });

  it("ranks harnesses by invocations and does not mutate the snapshot", () => {
    const before = JSON.stringify(harnessUsageSnapshot.sources);
    const rows = new SeedDataSource().getHarnessUsage();
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].invocations).toBeGreaterThanOrEqual(rows[i].invocations);
    }
    expect(JSON.stringify(harnessUsageSnapshot.sources)).toBe(before);
  });

  it("reads the same snapshot from the Fabric source without a contract change", () => {
    const rows = fabricSource().getHarnessUsage();
    expect(rows.length).toBe(harnessUsageSnapshot.sources.length);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].invocations).toBeGreaterThanOrEqual(rows[i].invocations);
    }
  });
});

describe("getUnattributedUsage read path", () => {
  it("returns the committed snapshot keys from SeedDataSource", () => {
    const rows = new SeedDataSource().getUnattributedUsage();
    expect(rows.length).toBe(telemetrySnapshot.unattributed.length);
  });

  it("ranks keys highest count first and does not mutate the snapshot", () => {
    const before = JSON.stringify(telemetrySnapshot.unattributed);
    const rows = new SeedDataSource().getUnattributedUsage();
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].count).toBeGreaterThanOrEqual(rows[i].count);
    }
    // The source array is untouched (we sort a copy).
    expect(JSON.stringify(telemetrySnapshot.unattributed)).toBe(before);
  });

  it("reads the same snapshot from the Fabric source without a contract change", () => {
    const rows = fabricSource().getUnattributedUsage();
    expect(rows.length).toBe(telemetrySnapshot.unattributed.length);
    for (let i = 1; i < rows.length; i += 1) {
      expect(rows[i - 1].count).toBeGreaterThanOrEqual(rows[i].count);
    }
  });
});
