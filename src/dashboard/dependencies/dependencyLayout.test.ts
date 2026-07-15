import { beforeEach, describe, expect, it } from "vitest";

import {
  STORAGE_KEY as DEPENDENCY_KEY,
  gridLayout,
  loadLayout,
  saveLayout,
} from "./dependencyLayout";

const MONITOR_KEY = "vault.monitor.layout.v1";
const MODEL_KEY = "vault.model.layout.v1";

describe("dependency layout storage key", () => {
  it("is the dependencies key, distinct from the monitor and model keys", () => {
    expect(DEPENDENCY_KEY).toBe("vault.dependencies.layout.v1");
    expect(DEPENDENCY_KEY).not.toBe(MONITOR_KEY);
    expect(DEPENDENCY_KEY).not.toBe(MODEL_KEY);
  });
});

describe("dependency layout persistence", () => {
  beforeEach(() => localStorage.clear());

  it("round-trips a saved override independently of the monitor key", () => {
    // Write a value under the monitor key by hand, then save a different value
    // under the dependency key. Neither may read the other.
    localStorage.setItem(
      MONITOR_KEY,
      JSON.stringify({ a: { x: 1, y: 1 } }),
    );

    const layout = loadLayout(["a", "b"]);
    layout.a = { x: 777, y: 222 };
    saveLayout(layout);

    const reloaded = loadLayout(["a", "b"]);
    expect(reloaded.a).toEqual({ x: 777, y: 222 });
    expect(reloaded.b).toEqual(gridLayout(["a", "b"]).b);

    // The monitor key is untouched by the dependency save.
    expect(localStorage.getItem(MONITOR_KEY)).toBe(
      JSON.stringify({ a: { x: 1, y: 1 } }),
    );
  });

  it("does not read a position stored under the monitor key", () => {
    localStorage.setItem(
      MONITOR_KEY,
      JSON.stringify({ a: { x: 999, y: 999 } }),
    );
    // With nothing under the dependency key, "a" falls back to the grid, proving
    // the dependency loader never reads the monitor key.
    expect(loadLayout(["a"]).a).toEqual(gridLayout(["a"]).a);
  });
});
