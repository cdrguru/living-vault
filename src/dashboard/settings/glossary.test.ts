import { describe, expect, it } from "vitest";

import { CONCEPTS, PAGE_GUIDE, QUADRANTS } from "./glossary";
import { NAV } from "@/dashboard/nav";

describe("glossary", () => {
  it("gives every primary nav route a non-empty page guide entry", () => {
    for (const item of NAV) {
      const entry = PAGE_GUIDE.find((guide) => guide.path === item.path);
      expect(entry, `missing guide for ${item.path}`).toBeDefined();
      expect(entry?.answers.length ?? 0).toBeGreaterThan(0);
    }
    expect(PAGE_GUIDE).toHaveLength(NAV.length);
  });

  it("names exactly the four metrics.ts health quadrants", () => {
    expect(QUADRANTS.map((q) => q.name)).toEqual([
      "Stars",
      "Risks",
      "Shelfware",
      "Dead weight",
    ]);
  });

  it("has no duplicate concept terms", () => {
    const terms = CONCEPTS.map((c) => c.term);
    expect(new Set(terms).size).toBe(terms.length);
  });

  it("does not invent definitions for terms the app does not use (negative control)", () => {
    expect(CONCEPTS.find((c) => c.term === "Synergy")).toBeUndefined();
    expect(CONCEPTS.find((c) => c.term === "Blockchain")).toBeUndefined();
  });
});
