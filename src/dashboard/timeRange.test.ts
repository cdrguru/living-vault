import { describe, expect, it } from "vitest";

import { formatDate } from "./format";
import { costRangeLabel } from "./timeRange";

describe("costRangeLabel", () => {
  it("names the rolling preset day count", () => {
    expect(costRangeLabel("30d", null)).toBe("Cost (last 30d)");
    expect(costRangeLabel("7d", null)).toBe("Cost (last 7d)");
    expect(costRangeLabel("90d", null)).toBe("Cost (last 90d)");
  });

  it("labels the all-time range", () => {
    expect(costRangeLabel("all", null)).toBe("Cost (all time)");
  });

  it("names both formatted bounds of a custom window", () => {
    const window = { start: "2026-01-01", end: "2026-03-31" };
    const label = costRangeLabel("custom", window);
    expect(label).toContain(formatDate(window.start));
    expect(label).toContain(formatDate(window.end));
    expect(label).toContain("to");
  });
});
