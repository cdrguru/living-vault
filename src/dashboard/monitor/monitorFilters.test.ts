import { describe, expect, it } from "vitest";

import type { ActionSeverity, AssetScore, Quadrant } from "@/data/metrics";
import type { AssetType } from "@/data/types";

import type { ExceptionKind, ExceptionRow } from "./exceptionQueue";
import type { MonitorNode } from "./monitorMeta";
import {
  defaultMonitorFilters,
  filterExceptions,
  matchingNodeIds,
  type MonitorIndex,
} from "./monitorFilters";
import type { TriageState } from "./triageStore";

const mkRow = (over: {
  assetId: string;
  type?: AssetType;
  kind?: ExceptionKind;
  quadrant?: Quadrant;
  severityBand?: ActionSeverity;
}): ExceptionRow => ({
  assetId: over.assetId,
  name: over.assetId,
  type: over.type ?? "skill",
  kind: over.kind ?? "risk",
  severity: 30,
  severityBand: over.severityBand ?? "high",
  tone: "danger",
  label: "x",
  reason: "x",
  score: { quadrant: over.quadrant ?? "Risks" } as AssetScore,
});

const mkNode = (over: {
  id: string;
  type?: AssetType;
  quadrant?: Quadrant;
}): MonitorNode => ({
  id: over.id,
  name: over.id,
  type: over.type ?? "skill",
  quadrant: over.quadrant ?? "Risks",
  tone: "danger",
  requiredByCount: 0,
  score: { quadrant: over.quadrant ?? "Risks" } as AssetScore,
});

// a is a high risk skill in bundle b1 and domain d1; c is a medium stale prompt.
const index: MonitorIndex = new Map([
  ["a", { bundleIds: new Set(["b1"]), domainTagIds: new Set(["d1"]) }],
  ["c", { bundleIds: new Set(), domainTagIds: new Set() }],
]);
const rows = [
  mkRow({ assetId: "a", type: "skill", kind: "risk", quadrant: "Risks", severityBand: "high" }),
  mkRow({ assetId: "c", type: "prompt", kind: "stale", quadrant: "Shelfware", severityBand: "medium" }),
];
const nodes = [
  mkNode({ id: "a", type: "skill", quadrant: "Risks" }),
  mkNode({ id: "c", type: "prompt", quadrant: "Shelfware" }),
];
const issueByAsset = new Map<string, ExceptionKind>([
  ["a", "risk"],
  ["c", "stale"],
]);
const NOW = new Date("2026-06-13T00:00:00Z");
const NO_TRIAGE: TriageState = {};

describe("filterExceptions", () => {
  it("returns everything in the all view with default filters", () => {
    const out = filterExceptions(rows, defaultMonitorFilters, NO_TRIAGE, "all", NOW, index);
    expect(out.map((r) => r.assetId)).toEqual(["a", "c"]);
  });

  it("filters by health class", () => {
    const out = filterExceptions(
      rows,
      { ...defaultMonitorFilters, health: "Risks" },
      NO_TRIAGE,
      "all",
      NOW,
      index,
    );
    expect(out.map((r) => r.assetId)).toEqual(["a"]);
  });

  it("ANDs across dimensions", () => {
    const out = filterExceptions(
      rows,
      { ...defaultMonitorFilters, type: "skill", bundle: "b1" },
      NO_TRIAGE,
      "all",
      NOW,
      index,
    );
    expect(out.map((r) => r.assetId)).toEqual(["a"]);
    const none = filterExceptions(
      rows,
      { ...defaultMonitorFilters, type: "skill", domain: "nope" },
      NO_TRIAGE,
      "all",
      NOW,
      index,
    );
    expect(none).toEqual([]);
  });

  it("filters by severity band", () => {
    const out = filterExceptions(
      rows,
      { ...defaultMonitorFilters, severity: "medium" },
      NO_TRIAGE,
      "all",
      NOW,
      index,
    );
    expect(out.map((r) => r.assetId)).toEqual(["c"]);
  });

  it("actionable view drops a dismissed row but all view keeps it", () => {
    const triage: TriageState = { a: { status: "dismissed" } };
    const actionable = filterExceptions(rows, defaultMonitorFilters, triage, "actionable", NOW, index);
    expect(actionable.map((r) => r.assetId)).toEqual(["c"]);
    const all = filterExceptions(rows, defaultMonitorFilters, triage, "all", NOW, index);
    expect(all.map((r) => r.assetId)).toEqual(["a", "c"]);
  });
});

describe("matchingNodeIds", () => {
  it("returns every node id when no filter is set", () => {
    const ids = matchingNodeIds(nodes, defaultMonitorFilters, issueByAsset, index);
    expect(ids).toEqual(new Set(["a", "c"]));
  });

  it("narrows by issue type using issueByAsset", () => {
    const ids = matchingNodeIds(
      nodes,
      { ...defaultMonitorFilters, issue: "stale" },
      issueByAsset,
      index,
    );
    expect(ids).toEqual(new Set(["c"]));
  });

  it("ignores severity for nodes (severity is an exception concept)", () => {
    const ids = matchingNodeIds(
      nodes,
      { ...defaultMonitorFilters, severity: "high" },
      issueByAsset,
      index,
    );
    expect(ids).toEqual(new Set(["a", "c"]));
  });
});
