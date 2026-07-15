import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ACCENT_KEY,
  ACCENTS,
  DEFAULT_ACCENT,
  applyAccent,
  isAccent,
  readAccent,
} from "@/dashboard/theme";

describe("theme accents", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-accent");
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-accent");
  });

  it("ships orange as the attribute-free default plus the four extra palettes", () => {
    expect(DEFAULT_ACCENT).toBe("orange");
    expect(ACCENTS.map((a) => a.id)).toEqual([
      "orange",
      "teal",
      "indigo",
      "violet",
      "contrast",
    ]);
  });

  it("falls back to the default when nothing is stored or the value is unknown", () => {
    expect(readAccent()).toBe(DEFAULT_ACCENT);
    localStorage.setItem(ACCENT_KEY, "chartreuse");
    expect(readAccent()).toBe(DEFAULT_ACCENT);
  });

  it("validates accent ids", () => {
    expect(isAccent("teal")).toBe(true);
    expect(isAccent("chartreuse")).toBe(false);
    expect(isAccent(null)).toBe(false);
  });

  it("sets data-accent for a non-default palette and persists it", () => {
    applyAccent("teal");
    expect(document.documentElement.getAttribute("data-accent")).toBe("teal");
    expect(localStorage.getItem(ACCENT_KEY)).toBe("teal");
    expect(readAccent()).toBe("teal");
  });

  it("clears the attribute for the default palette so :root stays the baseline", () => {
    applyAccent("violet");
    expect(document.documentElement.getAttribute("data-accent")).toBe("violet");
    applyAccent("orange");
    expect(document.documentElement.hasAttribute("data-accent")).toBe(false);
    expect(localStorage.getItem(ACCENT_KEY)).toBe("orange");
  });
});
