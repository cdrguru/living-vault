import { describe, expect, it } from "vitest";

import { TOUR_ANCHORS, TOUR_STEPS } from "./steps";
import { NAV } from "@/dashboard/nav";

describe("tour steps", () => {
  const validRoutes = new Set<string>([...NAV.map((n) => n.path), "/settings"]);
  const validAnchors = new Set<string>(Object.values(TOUR_ANCHORS));

  it("points every step at a real route", () => {
    for (const step of TOUR_STEPS) {
      expect(validRoutes.has(step.route), `unknown route ${step.route}`).toBe(true);
    }
  });

  it("points every step at a registered anchor", () => {
    for (const step of TOUR_STEPS) {
      expect(validAnchors.has(step.anchor), `unknown anchor ${step.anchor}`).toBe(true);
    }
  });

  it("uses unique step ids and is non-empty", () => {
    expect(TOUR_STEPS.length).toBeGreaterThan(0);
    const ids = TOUR_STEPS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
