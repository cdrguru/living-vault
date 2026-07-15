// src/dashboard/tooltips.test.ts
import { describe, expect, it } from "vitest";

import { TOOLTIPS } from "./tooltips";

describe("TOOLTIPS", () => {
  const entries = Object.entries(TOOLTIPS);

  it("has non-empty copy for every key", () => {
    expect(entries.length).toBeGreaterThan(0);
    for (const [key, value] of entries) {
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it("uses no em dash or en dash, per the repo prose rule", () => {
    for (const [key, value] of entries) {
      expect(value.includes("—"), `em dash in ${key}`).toBe(false);
      expect(value.includes("–"), `en dash in ${key}`).toBe(false);
    }
  });

  it("keeps each tooltip to at most two sentences", () => {
    for (const [key, value] of entries) {
      const terminators = value.match(/[.!?]/g) ?? [];
      expect(terminators.length, `too many sentences in ${key}`).toBeLessThanOrEqual(2);
    }
  });

  it("clarifies that an asset can appear in multiple coverage cells, so counts can exceed the total", () => {
    const copy = TOOLTIPS["coverage.matrix"].toLowerCase();
    expect(copy).toContain("several cells");
    expect(copy).toContain("exceed the total");
  });

  it("frames the overview cost tooltip against the selected window, not a hardcoded 30 days", () => {
    const copy = TOOLTIPS["overview.cost30d"];
    expect(copy).not.toContain("30 days");
    expect(copy.toLowerCase()).toContain("selected window");
  });

  it("includes Codex billing tooltip keys", () => {
    expect(TOOLTIPS).toHaveProperty("cost.actualCodexCredits");
    expect(TOOLTIPS).toHaveProperty("cost.codexCoverage");
  });
});
