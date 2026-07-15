import { describe, expect, it } from "vitest";

import { applyTelemetry } from "../telemetry";
import type { AssetRow, VaultDataset } from "../types";
import {
  TelemetryUploadError,
  normalizeTelemetryUpload,
  parseTelemetryUpload,
  reconcileTelemetryAssetIds,
  type TelemetryUploadRow,
} from "./normalizeTelemetry";

function asset(type: AssetRow["type"], slug: string, id: string): AssetRow {
  return {
    id,
    tenantId: "cat-tenant",
    type,
    name: slug,
    slug,
    description: "",
    body: "b",
    version: "1.0.0",
    status: "active",
    riskLevel: "low",
    maturity: 0.5,
    tier: "stock",
    contentHash: "h",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

function row(over: Partial<TelemetryUploadRow> = {}): TelemetryUploadRow {
  return {
    id: "cc-skill-x:2026-06-01:m",
    tenantId: "t",
    assetId: "cc-skill-x",
    date: "2026-06-01",
    invocations: 5,
    successes: 4,
    errors: 1,
    refusals: 0,
    latencyMs: 100,
    tokens: 10,
    cost: 0.5,
    model: "claude-opus-4-8",
    ...over,
  };
}

describe("parseTelemetryUpload / normalizeTelemetryUpload", () => {
  it("throws a clear error on invalid JSON", () => {
    expect(() => parseTelemetryUpload("not json")).toThrow(TelemetryUploadError);
    expect(() => parseTelemetryUpload("not json")).toThrow("File is not valid JSON.");
  });

  it("wraps a bare row array and fabricates a valid claude-code meta", () => {
    const upload = normalizeTelemetryUpload([row()]);
    expect(upload.rows).toHaveLength(1);
    expect(upload.meta.source).toBe("claude-code");
    expect(upload.meta.tracked.invocations).toBe(true);
    expect(upload.meta.windowStart).toBe("2026-06-01");
  });

  it("accepts the {source, version, meta, rows} envelope and keeps its meta", () => {
    const upload = normalizeTelemetryUpload({
      source: "telemetry-upload",
      version: 1,
      meta: {
        source: "claude-code",
        generatedAt: "2026-06-02T00:00:00.000Z",
        windowStart: "2026-05-01",
        windowEnd: "2026-06-01",
        sessions: 42,
        tracked: { invocations: true, successes: true, errors: true, latency: true, refusals: true, tokens: true, cost: true },
      },
      rows: [row()],
    });
    expect(upload.meta.sessions).toBe(42);
    expect(upload.meta.windowStart).toBe("2026-05-01");
  });

  it("rejects an empty upload and an oversized one", () => {
    expect(() => normalizeTelemetryUpload([])).toThrow(/No telemetry rows/);
    expect(() => normalizeTelemetryUpload({ rows: "nope" })).toThrow(/"rows" must be an array/);
  });

  it("drops an unknown sourceType so it cannot reconcile", () => {
    const upload = normalizeTelemetryUpload([
      row({ sourceType: "bogus" as never, sourceSlug: "x" }),
    ]);
    expect(upload.rows[0].sourceType).toBeUndefined();
  });

  it("clamps outcome counts so the coherence rule successes+errors+refusals<=invocations holds", () => {
    const upload = normalizeTelemetryUpload([
      row({ invocations: 5, successes: 10, errors: 10, refusals: 10 }),
    ]);
    const r = upload.rows[0];
    expect(r.successes + r.errors + r.refusals).toBeLessThanOrEqual(r.invocations);
  });
});

describe("reconcileTelemetryAssetIds", () => {
  const catalog = [
    asset("skill", "deneb-visuals", "uuid-deneb"),
    asset("mcp-server", "rayfin", "uuid-rayfin"),
  ];

  it("rewrites a matched row's assetId, tenantId, and dedup id onto the catalog asset", () => {
    const { rows, matchedKeys, unmatchedKeys } = reconcileTelemetryAssetIds(
      [row({ assetId: "cc-skill-deneb-visuals", sourceType: "skill", sourceSlug: "deneb-visuals" })],
      catalog,
    );
    expect(rows[0].assetId).toBe("uuid-deneb");
    expect(rows[0].tenantId).toBe("cat-tenant");
    expect(rows[0].id).toBe("claude-code:uuid-deneb:2026-06-01:claude-opus-4-8");
    expect(matchedKeys).toEqual(["skill::deneb-visuals"]);
    expect(unmatchedKeys).toEqual([]);
    // sourceType/sourceSlug are stripped from the clean UtilizationRow output.
    expect("sourceType" in rows[0]).toBe(false);
  });

  it("keys multi-word types on the whole type string, never splitting on '-'", () => {
    const { rows } = reconcileTelemetryAssetIds(
      [row({ assetId: "cc-mcp-server-rayfin", sourceType: "mcp-server", sourceSlug: "rayfin" })],
      catalog,
    );
    expect(rows[0].assetId).toBe("uuid-rayfin");
  });

  it("passes an unmatched (type, slug) through unchanged and reports it", () => {
    const { rows, unmatchedKeys } = reconcileTelemetryAssetIds(
      [row({ assetId: "cc-skill-missing", sourceType: "skill", sourceSlug: "missing" })],
      catalog,
    );
    expect(rows[0].assetId).toBe("cc-skill-missing");
    expect(unmatchedKeys).toEqual(["skill::missing"]);
  });

  it("is pure: it does not mutate the input rows", () => {
    const input = [row({ sourceType: "skill", sourceSlug: "deneb-visuals" })];
    const snapshot = structuredClone(input);
    reconcileTelemetryAssetIds(input, catalog);
    expect(input).toEqual(snapshot);
  });

  it("collapses two source rows that reconcile onto the same (asset, date, model)", () => {
    const reconciled = reconcileTelemetryAssetIds(
      [
        row({ assetId: "cc-skill-deneb-visuals", sourceType: "skill", sourceSlug: "deneb-visuals", successes: 4 }),
        row({ assetId: "cc-skill-deneb-old", sourceType: "skill", sourceSlug: "deneb-visuals", successes: 9 }),
      ],
      catalog,
    ).rows;
    const dataset = { assets: catalog, utilization: [] } as unknown as VaultDataset;
    const next = applyTelemetry(dataset, reconciled, {
      source: "claude-code",
      generatedAt: "2026-06-02",
      windowStart: "2026-06-01",
      windowEnd: "2026-06-01",
      sessions: 1,
      tracked: { invocations: true, successes: true, errors: true, latency: true, refusals: true, tokens: true, cost: true },
    });
    // Same dedup id -> applyTelemetry keeps the last; one utilization row for the asset.
    expect(next.utilization.filter((u) => u.assetId === "uuid-deneb")).toHaveLength(1);
    expect(next.utilization.find((u) => u.assetId === "uuid-deneb")!.successes).toBe(9);
  });

  it("an all-unmatched reconcile yields zero kept rows through applyTelemetry", () => {
    const reconciled = reconcileTelemetryAssetIds(
      [row({ assetId: "cc-skill-ghost", sourceType: "skill", sourceSlug: "ghost" })],
      catalog,
    ).rows;
    const dataset = { assets: catalog, utilization: [] } as unknown as VaultDataset;
    const next = applyTelemetry(dataset, reconciled, {
      source: "claude-code",
      generatedAt: "2026-06-02",
      windowStart: "2026-06-01",
      windowEnd: "2026-06-01",
      sessions: 0,
      tracked: { invocations: true, successes: true, errors: true, latency: true, refusals: true, tokens: true, cost: true },
    });
    expect(next.utilization).toHaveLength(0);
  });
});
