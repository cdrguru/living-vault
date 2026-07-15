import { describe, expect, it } from "vitest";

import {
  aesEffectiveRate,
  assetHonesty,
  bayesianRate,
  confidenceGrade,
  DEFAULT_SIGNAL_WEIGHTS,
  effectiveAssetRate,
  effectivenessTierFor,
  isConfirmedUnderperformer,
  isProvisionalEffectiveness,
  scoreAsset,
  scoreAssetDetailed,
  scoreFromSignals,
  utilizationByAsset,
  type AssetScoreResult,
  type AssetSignalInputs,
} from "./metrics";
import {
  makeAsset as asset,
  makeDataset as dataset,
  makeUtilRow as utilRow,
} from "./__tests__/fixtures";
import { seedDataset } from "./seed";
import type { TelemetryMeta } from "./types";

// A minimal, fully-observed signal set (latency present, retention/counterfactual
// absent) that every signal-level test overrides as needed.
const signals = (over: Partial<AssetSignalInputs> = {}): AssetSignalInputs => ({
  invocations: 10,
  successes: 10,
  errors: 0,
  latencyMs: 100,
  retention: null,
  honesty: "full",
  counterfactual: null,
  ...over,
});

describe("bayesianRate", () => {
  it("shrinks a 1/1 perfect record below 1.0 with the uniform Beta(1,1) prior", () => {
    // (1 + 1) / (1 + 0 + 1 + 1) = 2/3, never a naked 1.0.
    expect(bayesianRate(1, 0)).toBeCloseTo(2 / 3, 10);
    expect(bayesianRate(1, 0)).toBeLessThan(1);
  });

  it("rewards more evidence: 10/10 ranks above 1/1", () => {
    expect(bayesianRate(10, 0)).toBeGreaterThan(bayesianRate(1, 0));
    // (10 + 1) / (10 + 0 + 1 + 1) = 11/12.
    expect(bayesianRate(10, 0)).toBeCloseTo(11 / 12, 10);
  });

  it("returns the prior mean for an empty record", () => {
    expect(bayesianRate(0, 0)).toBeCloseTo(0.5, 10);
  });
});

describe("scoreFromSignals composite (AES)", () => {
  it("does not score a single success as 1.0 because Bayesian shrinkage applies", () => {
    const result = scoreFromSignals(signals({ invocations: 1, successes: 1 }));
    expect(result.signalScores.reliability).toBeCloseTo(2 / 3, 10);
    expect(result.assetEffectivenessScore).toBeLessThan(1);
  });

  it("scores a 10/10 asset higher than an otherwise identical 1/1 asset", () => {
    const small = scoreFromSignals(signals({ invocations: 1, successes: 1 }));
    const large = scoreFromSignals(signals({ invocations: 10, successes: 10 }));
    expect(large.assetEffectivenessScore).toBeGreaterThan(
      small.assetEffectivenessScore,
    );
  });

  it("never treats a missing signal as a zero: missing retention beats retention=0", () => {
    const missing = scoreFromSignals(signals({ retention: null }));
    const zero = scoreFromSignals(signals({ retention: 0 }));
    expect(missing.assetEffectivenessScore).toBeGreaterThan(
      zero.assetEffectivenessScore,
    );
    // Missing retention is excluded from the weighted average entirely.
    expect(missing.signalScores.retention).toBeNull();
    expect(missing.missingSignals).toContain("retention");
  });

  it("normalizes AES into 0..1 even for an all-perfect, high-volume asset", () => {
    const result = scoreFromSignals(
      signals({ invocations: 100000, successes: 100000, latencyMs: 1 }),
    );
    expect(result.assetEffectivenessScore).toBeGreaterThanOrEqual(0);
    expect(result.assetEffectivenessScore).toBeLessThanOrEqual(1);
  });

  it("reports observedWeight as the summed weight of present signals", () => {
    const result = scoreFromSignals(signals({ retention: null }));
    // reliability + errorResistance + latencyQuality + adoption, retention absent.
    const expected =
      DEFAULT_SIGNAL_WEIGHTS.reliability +
      DEFAULT_SIGNAL_WEIGHTS.errorResistance +
      DEFAULT_SIGNAL_WEIGHTS.latencyQuality +
      DEFAULT_SIGNAL_WEIGHTS.adoption;
    expect(result.observedWeight).toBeCloseTo(expected, 10);
  });

  it("returns insufficient evidence when no meaningful signal is present", () => {
    const result = scoreFromSignals(
      signals({
        invocations: 0,
        successes: 0,
        errors: 0,
        latencyMs: null,
        retention: null,
      }),
    );
    expect(result.assetEffectivenessScore).toBe(0);
    expect(result.evidenceConfidenceGrade).toBe("E");
    expect(result.effectivenessTier).toBe("insufficient-evidence");
    expect(result.observedWeight).toBe(0);
    expect(result.missingSignals).toEqual(
      expect.arrayContaining(Object.keys(DEFAULT_SIGNAL_WEIGHTS)),
    );
  });
});

describe("scoreFromSignals counterfactual override", () => {
  it("blends 0.7*normalizedGain + 0.3*composite when paired data is present", () => {
    const base = signals({ invocations: 50, successes: 30, errors: 20 });
    const composite = scoreFromSignals(base).assetEffectivenessScore;
    const withCf = scoreFromSignals({
      ...base,
      counterfactual: { baselineSuccessRate: 0.5, treatmentSuccessRate: 0.9 },
    });
    // normalizedGain = (0.9 - 0.5) / (1 - 0.5) = 0.8.
    const expected = 0.7 * 0.8 + 0.3 * composite;
    expect(withCf.assetEffectivenessScore).toBeCloseTo(expected, 10);
    // The override genuinely changes the score away from the composite.
    expect(withCf.assetEffectivenessScore).not.toBeCloseTo(composite, 5);
  });

  it("falls back to the composite when baseline success is 1 (no divide by zero)", () => {
    const base = signals({ invocations: 50, successes: 45, errors: 5 });
    const composite = scoreFromSignals(base).assetEffectivenessScore;
    const withCf = scoreFromSignals({
      ...base,
      counterfactual: { baselineSuccessRate: 1, treatmentSuccessRate: 1 },
    });
    expect(withCf.assetEffectivenessScore).toBeCloseTo(composite, 10);
    expect(Number.isFinite(withCf.assetEffectivenessScore)).toBe(true);
  });

  it("clamps the normalized gain into 0..1", () => {
    // A treatment worse than baseline would give a negative raw gain.
    const withCf = scoreFromSignals({
      ...signals(),
      counterfactual: { baselineSuccessRate: 0.8, treatmentSuccessRate: 0.4 },
    });
    expect(withCf.assetEffectivenessScore).toBeGreaterThanOrEqual(0);
    expect(withCf.assetEffectivenessScore).toBeLessThanOrEqual(1);
  });
});

describe("evidence confidence", () => {
  it("lowers confidence when the invocation sample is small", () => {
    const few = scoreFromSignals(signals({ invocations: 5, successes: 5 }));
    const many = scoreFromSignals(signals({ invocations: 200, successes: 200 }));
    expect(few.evidenceConfidenceScore).toBeLessThan(
      many.evidenceConfidenceScore,
    );
  });

  it("rates full measurement fidelity above derived fidelity", () => {
    const full = scoreFromSignals(signals({ honesty: "full" }));
    const derived = scoreFromSignals(signals({ honesty: "derived" }));
    expect(full.evidenceConfidenceScore).toBeGreaterThan(
      derived.evidenceConfidenceScore,
    );
  });

  it("still penalizes coverage when an OBTAINABLE signal is absent for the asset", () => {
    const obtainable: ("reliability" | "errorResistance" | "latencyQuality" | "adoption")[] =
      ["reliability", "errorResistance", "latencyQuality", "adoption"];
    const withLatency = scoreFromSignals(
      signals({ invocations: 300, successes: 300, observableSignals: obtainable }),
    );
    const noLatency = scoreFromSignals(
      signals({
        invocations: 300,
        successes: 300,
        latencyMs: null,
        observableSignals: obtainable,
      }),
    );
    // Missing an obtainable signal lowers coverage, so confidence drops.
    expect(noLatency.evidenceConfidenceScore).toBeLessThan(
      withLatency.evidenceConfidenceScore,
    );
    // A perfect, fully-obtained, high-volume asset reaches full confidence.
    expect(withLatency.evidenceConfidenceScore).toBeCloseTo(1, 10);
  });

  it("maps confidence scores to grades on the A..E bands", () => {
    expect(confidenceGrade(0.95)).toBe("A");
    expect(confidenceGrade(0.9)).toBe("A");
    expect(confidenceGrade(0.75)).toBe("B");
    expect(confidenceGrade(0.5)).toBe("C");
    expect(confidenceGrade(0.25)).toBe("D");
    expect(confidenceGrade(0.24)).toBe("E");
    expect(confidenceGrade(0)).toBe("E");
  });
});

describe("effectivenessTierFor", () => {
  it("gates D and E confidence to insufficient evidence regardless of AES", () => {
    expect(effectivenessTierFor(0.99, "D")).toBe("insufficient-evidence");
    expect(effectivenessTierFor(0.99, "E")).toBe("insufficient-evidence");
  });

  it("applies the deterministic fallback bands for A..C confidence", () => {
    expect(effectivenessTierFor(0.85, "A")).toBe("exceptional");
    expect(effectivenessTierFor(0.7, "B")).toBe("strong");
    expect(effectivenessTierFor(0.45, "C")).toBe("average");
    expect(effectivenessTierFor(0.44, "C")).toBe("weak");
    expect(effectivenessTierFor(0, "C")).toBe("weak");
  });
});

describe("isProvisionalEffectiveness (high score, low evidence)", () => {
  const result = (over: Partial<AssetScoreResult> = {}): AssetScoreResult => ({
    assetEffectivenessScore: 0.9,
    evidenceConfidenceScore: 0.3,
    evidenceConfidenceGrade: "D",
    effectivenessTier: "insufficient-evidence",
    observedWeight: 0.85,
    missingSignals: [],
    signalScores: {},
    ...over,
  });

  it("flags a would-be-effective AES gated to insufficient evidence (grade D and E)", () => {
    expect(
      isProvisionalEffectiveness(
        result({ assetEffectivenessScore: 0.9, evidenceConfidenceGrade: "D" }),
      ),
    ).toBe(true);
    expect(
      isProvisionalEffectiveness(
        result({ assetEffectivenessScore: 0.9, evidenceConfidenceGrade: "E" }),
      ),
    ).toBe(true);
  });

  it("does not flag a high AES that is already trusted (grade A-C)", () => {
    expect(
      isProvisionalEffectiveness(
        result({ assetEffectivenessScore: 0.95, evidenceConfidenceGrade: "C" }),
      ),
    ).toBe(false);
    expect(
      isProvisionalEffectiveness(
        result({ assetEffectivenessScore: 0.95, evidenceConfidenceGrade: "A" }),
      ),
    ).toBe(false);
  });

  it("does not flag a low-AES low-evidence asset: nothing tempting to warn about", () => {
    expect(
      isProvisionalEffectiveness(
        result({ assetEffectivenessScore: 0.5, evidenceConfidenceGrade: "E" }),
      ),
    ).toBe(false);
  });

  it("uses the strong-tier floor as the boundary", () => {
    expect(
      isProvisionalEffectiveness(
        result({ assetEffectivenessScore: 0.7, evidenceConfidenceGrade: "D" }),
      ),
    ).toBe(true);
    expect(
      isProvisionalEffectiveness(
        result({ assetEffectivenessScore: 0.69, evidenceConfidenceGrade: "D" }),
      ),
    ).toBe(false);
  });

  it("never flags a zero-evidence asset (AES 0, grade E)", () => {
    expect(
      isProvisionalEffectiveness(
        result({ assetEffectivenessScore: 0, evidenceConfidenceGrade: "E" }),
      ),
    ).toBe(false);
  });

  it("matches the real mirage pattern: ~30 perfect invocations grade to D with a high AES", () => {
    // Mirror the dataset path (scoreAssetDetailed): coverage is over the four
    // obtainable signals, so 30 fully-tracked invocations land at grade D, not E.
    const r = scoreFromSignals(
      signals({
        invocations: 30,
        successes: 30,
        errors: 0,
        observableSignals: [
          "reliability",
          "errorResistance",
          "latencyQuality",
          "adoption",
        ],
      }),
    );
    expect(r.evidenceConfidenceGrade).toBe("D");
    expect(r.assetEffectivenessScore).toBeGreaterThan(0.7);
    expect(isProvisionalEffectiveness(r)).toBe(true);
  });
});

describe("isConfirmedUnderperformer (trustworthy evidence, weak tier)", () => {
  const result = (over: Partial<AssetScoreResult> = {}): AssetScoreResult => ({
    assetEffectivenessScore: 0.4,
    evidenceConfidenceScore: 0.9,
    evidenceConfidenceGrade: "A",
    effectivenessTier: "weak",
    observedWeight: 0.85,
    missingSignals: [],
    signalScores: {},
    ...over,
  });

  it("flags a weak tier earned on trustworthy evidence (grade A-C)", () => {
    expect(
      isConfirmedUnderperformer(
        result({ effectivenessTier: "weak", evidenceConfidenceGrade: "A" }),
      ),
    ).toBe(true);
    expect(
      isConfirmedUnderperformer(
        result({ effectivenessTier: "weak", evidenceConfidenceGrade: "C" }),
      ),
    ).toBe(true);
  });

  it("does not flag insufficient evidence: no trustworthy verdict to act on", () => {
    expect(
      isConfirmedUnderperformer(
        result({
          effectivenessTier: "insufficient-evidence",
          evidenceConfidenceGrade: "E",
        }),
      ),
    ).toBe(false);
  });

  it("does not flag effective or merely-average assets", () => {
    expect(
      isConfirmedUnderperformer(
        result({ effectivenessTier: "exceptional", evidenceConfidenceGrade: "A" }),
      ),
    ).toBe(false);
    expect(
      isConfirmedUnderperformer(
        result({ effectivenessTier: "strong", evidenceConfidenceGrade: "B" }),
      ),
    ).toBe(false);
    expect(
      isConfirmedUnderperformer(
        result({ effectivenessTier: "average", evidenceConfidenceGrade: "C" }),
      ),
    ).toBe(false);
  });

  it("matches the real failing-hook pattern: high volume, low success grades to weak/A", () => {
    const r = scoreFromSignals(
      signals({
        invocations: 200,
        successes: 60,
        errors: 140,
        observableSignals: [
          "reliability",
          "errorResistance",
          "latencyQuality",
          "adoption",
        ],
      }),
    );
    expect(r.evidenceConfidenceGrade).toBe("A");
    expect(r.effectivenessTier).toBe("weak");
    expect(isConfirmedUnderperformer(r)).toBe(true);
  });
});

// --- Dataset-level integration ---------------------------------------------
// asset, utilRow, and dataset come from the shared fixtures import above.

const trackedMeta = (over: Partial<TelemetryMeta> = {}): TelemetryMeta => ({
  source: "claude-code",
  generatedAt: "2026-06-05T00:00:00.000Z",
  windowStart: "2026-05-08",
  windowEnd: "2026-06-05",
  sessions: 10,
  tracked: {
    invocations: true,
    successes: true,
    errors: true,
    latency: true,
    refusals: true,
    tokens: true,
    cost: true,
  },
  ...over,
});

describe("assetHonesty resolver", () => {
  it("grades an asset with no telemetry as none", () => {
    const ds = dataset({ assets: [asset("a1")] });
    expect(assetHonesty(ds, "a1")).toBe("none");
  });

  it("grades a fully-tracked, live asset as full", () => {
    const ds = dataset({
      assets: [asset("a1")],
      utilization: [utilRow("a1", "2026-06-01", 50)],
      telemetryMeta: trackedMeta(),
    });
    expect(assetHonesty(ds, "a1")).toBe("full");
  });

  it("grades a probe-only asset as occupancy, not full", () => {
    const ds = dataset({
      assets: [asset("a1")],
      utilization: [utilRow("a1", "2026-06-15", 1)],
      telemetryMeta: trackedMeta({
        probeAssetIds: ["a1"],
        probeDate: "2026-06-15",
      }),
    });
    expect(assetHonesty(ds, "a1")).toBe("occupancy");
  });

  it("grades a partially-tracked asset as partial", () => {
    const ds = dataset({
      assets: [asset("a1")],
      utilization: [utilRow("a1", "2026-06-01", 50)],
      telemetryMeta: trackedMeta({
        tracked: {
          invocations: true,
          successes: true,
          errors: false,
          latency: false,
          refusals: false,
          tokens: false,
          cost: false,
        },
      }),
    });
    expect(assetHonesty(ds, "a1")).toBe("partial");
  });

  it("grades an asset with no core metric tracked as derived", () => {
    const ds = dataset({
      assets: [asset("a1")],
      utilization: [utilRow("a1", "2026-06-01", 50)],
      telemetryMeta: trackedMeta({
        tracked: {
          invocations: true,
          successes: false,
          errors: false,
          latency: false,
          refusals: false,
          tokens: false,
          cost: false,
        },
      }),
    });
    expect(assetHonesty(ds, "a1")).toBe("derived");
  });

  it("assumes full measurement for real rows with no telemetry metadata", () => {
    const ds = dataset({
      assets: [asset("a1")],
      utilization: [utilRow("a1", "2026-06-01", 50)],
    });
    expect(assetHonesty(ds, "a1")).toBe("full");
  });
});

describe("scoreAssetDetailed (dataset)", () => {
  it("scores a heavily-used, healthy asset as a graded, confident tier", () => {
    const ds = dataset({
      assets: [asset("a1")],
      utilization: [
        utilRow("a1", "2026-06-01", 200, { successes: 190, errors: 10 }),
      ],
      telemetryMeta: trackedMeta(),
    });
    const result = scoreAssetDetailed(ds.assets[0], ds);
    expect(result.assetEffectivenessScore).toBeGreaterThan(0);
    expect(["A", "B", "C"]).toContain(result.evidenceConfidenceGrade);
    expect(result.effectivenessTier).not.toBe("insufficient-evidence");
  });

  it("lets a fully-measured, high-volume asset reach grade A (coverage over obtainable signals)", () => {
    // Retention is never collected in this dataset, so it must not cap confidence:
    // a perfect, fully-tracked, high-volume asset must be able to earn the top grade.
    const ds = dataset({
      assets: [asset("a1")],
      utilization: [utilRow("a1", "2026-06-01", 300, { successes: 300 })],
      telemetryMeta: trackedMeta(),
    });
    const result = scoreAssetDetailed(ds.assets[0], ds);
    expect(result.evidenceConfidenceGrade).toBe("A");
  });

  it("returns insufficient evidence for a probe-only asset (low fidelity, tiny sample)", () => {
    const ds = dataset({
      assets: [asset("a1")],
      utilization: [utilRow("a1", "2026-06-15", 1)],
      telemetryMeta: trackedMeta({
        probeAssetIds: ["a1"],
        probeDate: "2026-06-15",
      }),
    });
    const result = scoreAssetDetailed(ds.assets[0], ds);
    expect(["D", "E"]).toContain(result.evidenceConfidenceGrade);
    expect(result.effectivenessTier).toBe("insufficient-evidence");
  });
});

describe("aesEffectiveRate (confidence-aware)", () => {
  it("excludes D/E confidence assets from the denominator and reports them separately", () => {
    const ds = dataset({
      assets: [asset("strong"), asset("weakvol")],
      utilization: [
        // High-volume, healthy -> graded A/B/C, effective.
        utilRow("strong", "2026-06-01", 300, { successes: 290, errors: 10 }),
        // One synthetic-style call -> D/E, insufficient evidence.
        utilRow("weakvol", "2026-06-01", 1),
      ],
      telemetryMeta: trackedMeta(),
    });
    const rate = aesEffectiveRate(ds);
    expect(rate.evaluatedCount).toBe(1);
    expect(rate.insufficientEvidence).toBe(1);
    expect(rate.effectiveCount).toBe(1);
    expect(rate.rate).toBeCloseTo(1, 10);
  });

  it("reports a zero rate with zero evaluated when every asset is low-evidence", () => {
    const ds = dataset({
      assets: [asset("p1"), asset("p2")],
      utilization: [
        utilRow("p1", "2026-06-15", 1),
        utilRow("p2", "2026-06-15", 1),
      ],
      telemetryMeta: trackedMeta({
        probeAssetIds: ["p1", "p2"],
        probeDate: "2026-06-15",
      }),
    });
    const rate = aesEffectiveRate(ds);
    expect(rate.evaluatedCount).toBe(0);
    expect(rate.insufficientEvidence).toBe(2);
    expect(rate.rate).toBe(0);
  });
});

describe("backwards compatibility", () => {
  it("keeps the legacy scoreAsset / effectiveAssetRate public API working", () => {
    const usage = utilizationByAsset(seedDataset);
    const legacy = scoreAsset(seedDataset.assets[0], seedDataset, usage);
    expect(legacy.quadrant).toMatch(/Stars|Risks|Shelfware|Dead weight/);
    expect(legacy.governedScore).toBeGreaterThanOrEqual(0);
    expect(typeof effectiveAssetRate(seedDataset)).toBe("number");
  });
});
