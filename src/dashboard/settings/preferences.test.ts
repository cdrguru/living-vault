import { describe, expect, it, beforeEach } from "vitest";

import {
  PREF_KEYS,
  getDefaultFilters,
  getDefaultRange,
  getSidebarStartsCollapsed,
  getTheme,
  setDefaultFilters,
  setDefaultRange,
  setSidebarStartsCollapsed,
  setTheme,
} from "./preferences";
import { defaultFilters } from "@/dashboard/filters";

describe("preferences", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.classList.remove("dark");
  });

  it("round-trips the default range", () => {
    setDefaultRange("90d");
    expect(getDefaultRange()).toBe("90d");
  });

  it("falls back to 30d for a missing or non-persistable range", () => {
    expect(getDefaultRange()).toBe("30d");
    localStorage.setItem(PREF_KEYS.defaultRange, "custom");
    expect(getDefaultRange()).toBe("30d");
    localStorage.setItem(PREF_KEYS.defaultRange, "garbage");
    expect(getDefaultRange()).toBe("30d");
  });

  it("round-trips default filters but never persists the search term", () => {
    setDefaultFilters({ search: "secret", type: "skill", tier: "custom", status: "active", risk: "high" });
    const stored = getDefaultFilters();
    expect(stored.type).toBe("skill");
    expect(stored.risk).toBe("high");
    expect(stored.search).toBe("");
  });

  it("returns the baseline defaults when filters are corrupt", () => {
    localStorage.setItem(PREF_KEYS.defaultFilters, "{not json");
    expect(getDefaultFilters()).toEqual(defaultFilters);
  });

  it("applies the theme to the html element and persists it", () => {
    setTheme("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(getTheme()).toBe("dark");
    setTheme("light");
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(getTheme()).toBe("light");
  });

  it("reads the theme from the html class when nothing is stored", () => {
    document.documentElement.classList.add("dark");
    expect(getTheme()).toBe("dark");
  });

  it("round-trips the initial sidebar state", () => {
    expect(getSidebarStartsCollapsed()).toBe(false);
    setSidebarStartsCollapsed(true);
    expect(getSidebarStartsCollapsed()).toBe(true);
  });
});
