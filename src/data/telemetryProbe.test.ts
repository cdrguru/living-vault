import { describe, expect, it } from "vitest";

import { hasOnlyProbeTelemetry, isProbeUtilization } from "./telemetryProbe";
import type { TelemetryMeta, UtilizationRow } from "./types";

const PROBE_DATE = "2026-06-15";

const baseMeta = (over: Partial<TelemetryMeta> = {}): TelemetryMeta => ({
  source: "claude-code",
  generatedAt: "2026-06-15T00:00:00Z",
  windowStart: "2026-05-09",
  windowEnd: PROBE_DATE,
  sessions: 10,
  tracked: {
    invocations: true,
    successes: true,
    errors: true,
    latency: true,
    refusals: false,
    tokens: false,
    cost: false,
  },
  probeAssetIds: ["cc-skill-alpha"],
  probeDate: PROBE_DATE,
  ...over,
});

const mkRow = (
  assetId: string,
  date: string,
  invocations: number,
): UtilizationRow => ({
  id: `${assetId}-${date}`,
  tenantId: "t",
  assetId,
  date,
  invocations,
  successes: invocations,
  errors: 0,
  refusals: 0,
  latencyMs: 1500,
  tokens: 0,
  cost: 0,
});

describe("isProbeUtilization", () => {
  it("is true for a single invocation on the probe date for a probe-seeded asset", () => {
    const row = mkRow("cc-skill-alpha", PROBE_DATE, 1);
    expect(isProbeUtilization("cc-skill-alpha", row, baseMeta())).toBe(true);
  });

  it("is false when the asset is not in probeAssetIds", () => {
    const row = mkRow("cc-skill-beta", PROBE_DATE, 1);
    expect(isProbeUtilization("cc-skill-beta", row, baseMeta())).toBe(false);
  });

  it("is false for real usage (more than one invocation) on the probe date", () => {
    const row = mkRow("cc-skill-alpha", PROBE_DATE, 12);
    expect(isProbeUtilization("cc-skill-alpha", row, baseMeta())).toBe(false);
  });

  it("is false for a row on a different date", () => {
    const row = mkRow("cc-skill-alpha", "2026-06-01", 1);
    expect(isProbeUtilization("cc-skill-alpha", row, baseMeta())).toBe(false);
  });

  it("is false when meta carries no probe fields", () => {
    const row = mkRow("cc-skill-alpha", PROBE_DATE, 1);
    const meta = baseMeta({ probeAssetIds: undefined, probeDate: undefined });
    expect(isProbeUtilization("cc-skill-alpha", row, meta)).toBe(false);
  });

  it("is false when meta is undefined", () => {
    const row = mkRow("cc-skill-alpha", PROBE_DATE, 1);
    expect(isProbeUtilization("cc-skill-alpha", row, undefined)).toBe(false);
  });
});

describe("hasOnlyProbeTelemetry", () => {
  it("is true when the asset's only row is a probe row", () => {
    const util = [mkRow("cc-skill-alpha", PROBE_DATE, 1)];
    expect(hasOnlyProbeTelemetry("cc-skill-alpha", util, baseMeta())).toBe(true);
  });

  it("is false when the asset also has a real (non-probe) row", () => {
    const util = [
      mkRow("cc-skill-alpha", PROBE_DATE, 1),
      mkRow("cc-skill-alpha", "2026-06-01", 40),
    ];
    expect(hasOnlyProbeTelemetry("cc-skill-alpha", util, baseMeta())).toBe(
      false,
    );
  });

  it("is false when the asset has no rows at all", () => {
    const util = [mkRow("cc-skill-other", PROBE_DATE, 1)];
    expect(hasOnlyProbeTelemetry("cc-skill-alpha", util, baseMeta())).toBe(
      false,
    );
  });

  it("is false when meta carries no probe fields", () => {
    const util = [mkRow("cc-skill-alpha", PROBE_DATE, 1)];
    const meta = baseMeta({ probeAssetIds: undefined, probeDate: undefined });
    expect(hasOnlyProbeTelemetry("cc-skill-alpha", util, meta)).toBe(false);
  });
});
