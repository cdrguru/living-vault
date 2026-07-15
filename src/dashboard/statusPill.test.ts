import { describe, expect, it } from "vitest";

import type { AssetStatus } from "@/data/types";
import { lifecyclePill, riskPill } from "@/dashboard/statusPill";

describe("lifecyclePill", () => {
  it("pairs each lifecycle stage with a tone and its matching glyph", () => {
    // Tone and severity glyph must agree so color and shape never disagree.
    expect(lifecyclePill("active")).toEqual({
      tone: "green",
      severity: "good",
    });
    expect(lifecyclePill("deprecated")).toEqual({
      tone: "red",
      severity: "danger",
    });
    expect(lifecyclePill("retired")).toEqual({
      tone: "slate",
      severity: "neutral",
    });
  });

  it("keeps deprecated and retired visually distinct", () => {
    // Deprecated reads as a warning (red danger); retired reads as inert (slate
    // neutral). They must not collapse into the same appearance.
    const deprecated = lifecyclePill("deprecated");
    const retired = lifecyclePill("retired");
    expect(deprecated.tone).not.toBe(retired.tone);
    expect(deprecated.severity).not.toBe(retired.severity);
  });

  it("reads scope markers as active (implied-live)", () => {
    // Scope statuses carry no lifecycle signal, so lifecycleOf maps them to active.
    const scopeStatuses: AssetStatus[] = ["plugin-managed", "project-specific"];
    for (const status of scopeStatuses) {
      expect(lifecyclePill(status)).toEqual({
        tone: "green",
        severity: "good",
      });
    }
  });
});

describe("riskPill", () => {
  it("maps risk to a green-to-red gradient with matching glyphs", () => {
    // Tone and severity glyph must agree: low reads safe, high reads danger.
    expect(riskPill("low")).toEqual({ tone: "green", severity: "good" });
    expect(riskPill("medium")).toEqual({ tone: "amber", severity: "warn" });
    expect(riskPill("high")).toEqual({ tone: "red", severity: "danger" });
  });
});
