import { describe, expect, it } from "vitest";

import { compareCodexBilling, selectCostBasis } from "./costBasis";
import { totalCost } from "./metrics";
import type {
  HarnessUsage,
  TelemetryMeta,
  UtilizationRow,
  VaultDataset,
} from "./types";

const util = (over: Partial<UtilizationRow> = {}): UtilizationRow => ({
  id: "u1",
  tenantId: "t",
  assetId: "a1",
  date: "2026-06-01",
  invocations: 10,
  successes: 8,
  errors: 1,
  refusals: 0,
  latencyMs: 100,
  tokens: 1000,
  cost: 2.5,
  model: "claude-opus-4-8",
  ...over,
});

const meta = (cost: boolean): TelemetryMeta => ({
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
    tokens: cost,
    cost,
  },
});

const dataset = (rows: UtilizationRow[], m?: TelemetryMeta): VaultDataset =>
  ({
    assets: [],
    tags: [],
    origins: [],
    owners: [],
    bundles: [],
    assetTags: [],
    dependencies: [],
    bundleMemberships: [],
    utilization: rows,
    telemetryMeta: m,
  }) as unknown as VaultDataset;

const harness = (over: Partial<HarnessUsage> = {}): HarnessUsage => ({
  source: "claude-code",
  label: "Claude Code",
  sessions: 1,
  windowStart: null,
  windowEnd: null,
  invocations: 100,
  successes: 90,
  errors: 5,
  latencyMs: 1000,
  tokens: 5_000_000,
  cost: 0,
  models: ["claude-opus-4-8"],
  tracked: {
    successes: "full",
    errors: "full",
    latency: "full",
    tokens: "full",
    cost: "derived",
  },
  ...over,
});

const codexHarness: HarnessUsage = {
  source: "codex",
  label: "Codex",
  sessions: 2,
  windowStart: "2026-06-23",
  windowEnd: "2026-06-27",
  invocations: 52,
  successes: 44,
  errors: 0,
  latencyMs: 1000,
  tokens: 2_038_742,
  cost: 0,
  models: ["gpt-5.5"],
  tokensByModel: { "gpt-5.5": 2_038_742 },
  tracked: {
    successes: "partial",
    errors: "partial",
    latency: "full",
    tokens: "full",
    cost: "derived",
  },
};

describe("selectCostBasis", () => {
  it("AUDIT 1a: utilization basis totalSuccesses === sum(Utilization.successes) (no harness leakage)", () => {
    const ds = dataset([util({ successes: 8 }), util({ id: "u2", successes: 3 })], meta(true));
    const result = selectCostBasis(ds, [harness()]);
    expect(result.basis).toBe("utilization");
    expect(result.totalSuccesses).toBe(11);
  });

  it("AUDIT 1b: utilization totalCost === totalCost(dataset, window)", () => {
    const ds = dataset([util({ cost: 2.5 }), util({ id: "u2", cost: 1.5 })], meta(true));
    const result = selectCostBasis(ds, [harness()]);
    expect(result.totalCost).toBe(totalCost(ds));
    expect(result.totalCost).toBe(4);
  });

  it("no telemetryMeta (fresh seed) still resolves utilization so modeled cost renders", () => {
    const result = selectCostBasis(dataset([util()]), [harness()]);
    expect(result.basis).toBe("utilization");
  });

  it("tracked.cost=false but harness has tokens => harness-estimate with harness successes", () => {
    const ds = dataset([util({ cost: 0 })], meta(false));
    const result = selectCostBasis(ds, [harness({ successes: 90 })]);
    expect(result.basis).toBe("harness-estimate");
    expect(result.tracked).toBe(false);
    expect(result.totalSuccesses).toBe(90);
    expect(result.totalCost).toBeGreaterThan(0);
  });

  it("neither cost present => basis none, totalCost 0, costPerSuccess null", () => {
    const ds = dataset([util({ cost: 0 })], meta(false));
    const result = selectCostBasis(ds, []);
    expect(result.basis).toBe("none");
    expect(result.totalCost).toBe(0);
    expect(result.costPerSuccess).toBeNull();
  });

  it("window-pure: a window excluding every cost row is not utilization-backed", () => {
    const ds = dataset([util({ date: "2026-06-01", cost: 5 })], meta(true));
    const result = selectCostBasis(ds, [], {
      start: "2027-01-01",
      end: "2027-12-31",
    });
    expect(result.basis).not.toBe("utilization");
  });

  it("compares actual Codex credits against modeled local spend", () => {
    const result = compareCodexBilling([codexHarness], {
      generatedAt: "2026-06-28T12:00:00.000Z",
      source: "chatgpt-codex-analytics-export",
      currency: "credits",
      windowStart: "2026-06-23",
      windowEnd: "2026-06-27",
      totals: {
        credits: 283.2020625,
        billedTokens: 57696274,
        localTokens: 2038742,
        runs: 52,
      },
      daily: [],
      notes: [],
    });

    expect(result.actualCredits).toBeCloseTo(283.2020625);
    expect(result.billedTokens).toBe(57696274);
    expect(result.localTokens).toBe(2038742);
    expect(result.modeledSpend).toBeGreaterThan(0);
    expect(result.tokenCoverage).toBeCloseTo(2038742 / 57696274);
    expect(result.hasBilling).toBe(true);
  });

  it("returns an empty comparison when no billing snapshot exists", () => {
    const result = compareCodexBilling([codexHarness], {
      generatedAt: "1970-01-01T00:00:00.000Z",
      source: "chatgpt-codex-analytics-export",
      currency: "credits",
      windowStart: null,
      windowEnd: null,
      totals: { credits: 0, billedTokens: 0, localTokens: 0, runs: 0 },
      daily: [],
      notes: [],
    });

    expect(result.hasBilling).toBe(false);
    expect(result.actualCredits).toBe(0);
    expect(result.tokenCoverage).toBeNull();
  });

  it("falls back to Codex harness tokens when billing localTokens is unpopulated", () => {
    const result = compareCodexBilling([codexHarness], {
      generatedAt: "2026-06-28T12:00:00.000Z",
      source: "chatgpt-codex-analytics-export",
      currency: "credits",
      windowStart: "2026-06-23",
      windowEnd: "2026-06-27",
      totals: { credits: 283.2020625, billedTokens: 57696274, localTokens: 0, runs: 52 },
      daily: [],
      notes: ["Per-day localTokens is unpopulated until local rollout token wiring lands."],
    });

    expect(result.localTokens).toBe(2_038_742);
    expect(result.tokenCoverage).toBeCloseTo(2_038_742 / 57_696_274);
  });
});
