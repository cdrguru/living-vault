import { describe, expect, it } from "vitest";

import type { AssetRow } from "@/data/types";
import type { AssetScore, UsageSummary } from "@/data/metrics";

import {
  LENSES,
  LENS_BY_ID,
  encodeNode,
  fanInScale,
  governanceTone,
  usageScale,
} from "./lenses";
import type { MonitorNode } from "./monitorMeta";

const asset: AssetRow = {
  id: "a1",
  tenantId: "t",
  type: "skill",
  name: "Alpha",
  slug: "alpha",
  description: "A test asset.",
  body: "body",
  version: "1.0.0",
  status: "active",
  riskLevel: "low",
  maturity: 0.8,
  tier: "stock",
  contentHash: "hash-a1",
  ownerId: "own-1",
  originId: "org-1",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
};

const usage = (over: Partial<UsageSummary> = {}): UsageSummary => ({
  assetId: "a1",
  invocations: 0,
  successes: 0,
  errors: 0,
  refusals: 0,
  tokens: 0,
  cost: 0,
  successRate: 0,
  latencyMs: 0,
  activeDays: 0,
  ...over,
});

const score = (over: Partial<AssetScore> = {}): AssetScore => ({
  asset,
  governedScore: 1,
  effectiveScore: 0.9,
  governed: true,
  effective: true,
  quadrant: "Stars",
  usage: usage(),
  stale: false,
  confidence: "high",
  evidenceSufficient: true,
  signals: [],
  ...over,
});

const node = (over: Partial<MonitorNode> = {}): MonitorNode => ({
  id: "a1",
  name: "Alpha",
  type: "skill",
  quadrant: "Stars",
  tone: "success",
  requiredByCount: 0,
  score: score(),
  ...over,
});

describe("lens helpers", () => {
  it("buckets the governed score into good, warn, and risk", () => {
    expect(governanceTone(0.9)).toBe("success");
    expect(governanceTone(0.6)).toBe("warn");
    expect(governanceTone(0.2)).toBe("danger");
  });

  it("scales usage so zero stays at the floor and growth is bounded", () => {
    expect(usageScale(0)).toBe(0.8);
    expect(usageScale(50)).toBeGreaterThan(0.8);
    expect(usageScale(1_000_000)).toBeLessThanOrEqual(1.6);
  });

  it("scales fan-in so a leaf stays small and a hub grows within bounds", () => {
    expect(fanInScale(0)).toBe(0.8);
    expect(fanInScale(2)).toBeGreaterThan(0.8);
    expect(fanInScale(100)).toBeLessThanOrEqual(1.6);
  });
});

describe("encodeNode re-skins the same node per lens", () => {
  it("health uses the quadrant tone and full opacity", () => {
    const encoding = encodeNode("health", node(), usage());
    expect(encoding.tone).toBe("success");
    expect(encoding.opacity).toBe(1);
    expect(encoding.scale).toBe(1);
  });

  it("governance re-tones a poorly governed Star to a risk tone", () => {
    const encoding = encodeNode(
      "governance",
      node({ score: score({ governedScore: 0.3 }) }),
      usage(),
    );
    expect(encoding.tone).toBe("danger");
  });

  it("usage sizes by windowed invocations and survives a missing usage summary", () => {
    const big = encodeNode("usage", node(), usage({ invocations: 500 }));
    const none = encodeNode("usage", node(), undefined);
    expect(big.scale).toBeGreaterThan(none.scale);
    expect(none.scale).toBe(0.8);
  });

  it("dependency sizes by inbound fan-in", () => {
    const hub = encodeNode("dependency", node({ requiredByCount: 5 }), usage());
    const leaf = encodeNode(
      "dependency",
      node({ requiredByCount: 0 }),
      usage(),
    );
    expect(hub.scale).toBeGreaterThan(leaf.scale);
  });

  it("freshness dims and flags a stale node", () => {
    const encoding = encodeNode(
      "freshness",
      node({ score: score({ stale: true }) }),
      usage(),
    );
    expect(encoding.opacity).toBeLessThan(1);
    expect(encoding.tone).toBe("warn");
    expect(encoding.glyph).toBe("flag");
  });
});

describe("lens legends", () => {
  it("every lens names its own legend so the encoding is never tooltip-only", () => {
    for (const lens of LENSES) {
      expect(lens.legend.length).toBeGreaterThan(0);
      for (const entry of lens.legend) {
        expect(entry.label.length).toBeGreaterThan(0);
        expect(entry.glyph.length).toBeGreaterThan(0);
      }
    }
  });

  it("indexes every lens by id", () => {
    for (const lens of LENSES) {
      expect(LENS_BY_ID[lens.id]).toBe(lens);
    }
  });
});
