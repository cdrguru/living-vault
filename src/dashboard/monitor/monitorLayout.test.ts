import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  NODE_SIZE,
  STORAGE_KEY,
  gridLayout,
  loadLayout,
  resetLayout,
  saveLayout,
} from "./monitorLayout";

describe("monitor layout storage key", () => {
  it("is distinct from the model canvas key so the maps cannot clobber each other", () => {
    expect(STORAGE_KEY).toBe("vault.monitor.layout.v1");
    expect(STORAGE_KEY).not.toBe("vault.model.layout.v1");
  });
});

describe("gridLayout", () => {
  it("is deterministic and order-stable for the same ids", () => {
    const a = gridLayout(["a", "b", "c", "d"]);
    const b = gridLayout(["a", "b", "c", "d"]);
    expect(a).toEqual(b);
  });

  it("places nodes left to right then top to bottom on a near-square grid", () => {
    // Four nodes wrap at two columns (ceil(sqrt(4)) === 2).
    const layout = gridLayout(["a", "b", "c", "d"]);
    expect(layout.a.y).toBe(layout.b.y);
    expect(layout.a.x).toBeLessThan(layout.b.x);
    expect(layout.c.y).toBeGreaterThan(layout.a.y);
    expect(layout.c.x).toBe(layout.a.x);
  });

  it("returns an empty map for no nodes", () => {
    expect(gridLayout([])).toEqual({});
  });

  it("sizes nodes uniformly", () => {
    expect(NODE_SIZE.width).toBeGreaterThan(0);
    expect(NODE_SIZE.height).toBeGreaterThan(0);
  });
});

describe("monitor layout persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a saved override and keeps the grid for the rest", () => {
    const layout = loadLayout(["a", "b"]);
    layout.a = { x: 999, y: 111 };
    saveLayout(layout);
    const reloaded = loadLayout(["a", "b"]);
    expect(reloaded.a).toEqual({ x: 999, y: 111 });
    expect(reloaded.b).toEqual(gridLayout(["a", "b"]).b);
  });

  it("falls back to the grid on corrupt storage", () => {
    localStorage.setItem(STORAGE_KEY, "{not json");
    expect(loadLayout(["a", "b"])).toEqual(gridLayout(["a", "b"]));
  });

  it("falls back per node on invalid coordinates", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ a: { x: "nope", y: 2 } }),
    );
    expect(loadLayout(["a"]).a).toEqual(gridLayout(["a"]).a);
  });

  it("drops a saved position for a node no longer in the dataset", () => {
    saveLayout({ a: { x: 1, y: 2 }, ghost: { x: 9, y: 9 } });
    const layout = loadLayout(["a"]);
    expect(layout.a).toEqual({ x: 1, y: 2 });
    expect(layout.ghost).toBeUndefined();
  });

  it("reset clears overrides and returns the grid", () => {
    saveLayout({ a: { x: 1, y: 2 } });
    expect(resetLayout(["a", "b"])).toEqual(gridLayout(["a", "b"]));
  });

  it("swallows write failures so drag end never throws", () => {
    const original = globalThis.localStorage;
    vi.stubGlobal("localStorage", {
      ...original,
      getItem: () => null,
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    });
    try {
      expect(() => saveLayout({ a: { x: 1, y: 2 } })).not.toThrow();
      expect(() => resetLayout(["a"])).not.toThrow();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
