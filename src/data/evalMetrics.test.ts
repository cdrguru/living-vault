import { describe, expect, it } from "vitest";

import { makeAsset, makeDataset, makeUtilRow } from "./__tests__/fixtures";
import {
  assetHonesty,
  evalPassRate,
  evalQualityToHonesty,
  evalResultsByAsset,
  scoreAssetDetailed,
} from "./metrics";
import type { EvalResultRow } from "./types";

const evalRow = (
  assetId: string,
  over: Partial<EvalResultRow> = {},
): EvalResultRow => ({
  id: `${assetId}-ev`,
  tenantId: "t",
  assetId,
  caseHash: "case-1",
  date: "2026-07-01",
  trials: 5,
  passed: 4,
  failed: 1,
  errored: 0,
  latencyMs: 100,
  tokens: 0,
  cost: 0,
  quality: "full",
  ...over,
});

// One asset with healthy utilization and no telemetryMeta, so its telemetry-derived
// honesty is "full" (the assetHonesty `if (!tracked) return "full"` branch).
const datasetWith = (rows: EvalResultRow[]) =>
  makeDataset({
    assets: [makeAsset("a1")],
    utilization: [makeUtilRow("a1", "2026-07-01", 40)],
    evalResults: rows,
  });

describe("evalQualityToHonesty", () => {
  it("collapses modeled to derived and passes the others through", () => {
    expect(evalQualityToHonesty("modeled")).toBe("derived");
    expect(evalQualityToHonesty("full")).toBe("full");
    expect(evalQualityToHonesty("partial")).toBe("partial");
    expect(evalQualityToHonesty("occupancy")).toBe("occupancy");
    expect(evalQualityToHonesty("derived")).toBe("derived");
    expect(evalQualityToHonesty("none")).toBe("none");
  });
});

describe("evalResultsByAsset", () => {
  it("aggregates rows per asset and takes the weakest collapsed grade", () => {
    const dataset = datasetWith([
      evalRow("a1", {
        id: "e1",
        quality: "full",
        trials: 5,
        passed: 5,
        failed: 0,
      }),
      evalRow("a1", {
        id: "e2",
        quality: "modeled",
        trials: 3,
        passed: 1,
        failed: 2,
      }),
    ]);
    const summary = evalResultsByAsset(dataset).get("a1");
    expect(summary?.trials).toBe(8);
    expect(summary?.passed).toBe(6);
    // modeled collapses to derived, which is weaker than full, so it governs.
    expect(summary?.quality).toBe("derived");
  });

  it("is empty when there are no eval rows", () => {
    expect(evalResultsByAsset(datasetWith([])).size).toBe(0);
  });
});

describe("evalPassRate", () => {
  it("is passed over trials, and 0 with no trials", () => {
    const summary = evalResultsByAsset(datasetWith([evalRow("a1")])).get("a1")!;
    expect(evalPassRate(summary)).toBeCloseTo(0.8);
    expect(evalPassRate({ ...summary, trials: 0, passed: 0 })).toBe(0);
  });
});

describe("assetHonesty eval cap", () => {
  it("a weak eval lowers the honesty grade (confidence), never the effectiveness estimate", () => {
    const withoutEval = datasetWith([]);
    const withWeakEval = datasetWith([evalRow("a1", { quality: "modeled" })]);
    const asset = makeAsset("a1");

    // Telemetry-only honesty is "full"; a modeled eval collapses to derived and caps it.
    expect(assetHonesty(withoutEval, "a1")).toBe("full");
    expect(assetHonesty(withWeakEval, "a1")).toBe("derived");

    // The effectiveness point estimate is identical; only the confidence drops.
    const before = scoreAssetDetailed(asset, withoutEval);
    const after = scoreAssetDetailed(asset, withWeakEval);
    expect(after.assetEffectivenessScore).toBe(before.assetEffectivenessScore);
    expect(after.evidenceConfidenceScore).toBeLessThan(
      before.evidenceConfidenceScore,
    );
  });

  it("a full-grade eval does not change the honesty grade (min keeps the stronger source)", () => {
    expect(
      assetHonesty(datasetWith([evalRow("a1", { quality: "full" })]), "a1"),
    ).toBe("full");
  });
});
