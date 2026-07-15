// src/dashboard/monitor/subgraph.test.ts
import { describe, expect, it } from "vitest";

import type { MonitorEdge } from "./monitorMeta";
import { neighborhood } from "./subgraph";

const edge = (from: string, to: string): MonitorEdge => ({
  id: `requires:${from}|${to}`,
  kind: "requires",
  from,
  to,
  dashed: false,
});

const edges = [edge("a", "b"), edge("b", "c")];

describe("neighborhood", () => {
  it("includes the node and its one-hop neighbors only", () => {
    expect(neighborhood("a", edges)).toEqual(new Set(["a", "b"]));
    expect(neighborhood("b", edges)).toEqual(new Set(["a", "b", "c"]));
  });

  it("excludes nodes two hops away", () => {
    expect(neighborhood("a", edges).has("c")).toBe(false);
  });

  it("returns just the node when it has no edges", () => {
    expect(neighborhood("lonely", edges)).toEqual(new Set(["lonely"]));
  });

  it("respects the passed edge set, so hidden tagged edges do not connect", () => {
    const visible = [edge("a", "b")]; // a tagged a-c edge was filtered out upstream
    expect(neighborhood("a", visible)).toEqual(new Set(["a", "b"]));
  });
});
