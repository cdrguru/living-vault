import { describe, expect, it } from "vitest";

import { showsCatalogFilters, showsTimeRange, visibleNav } from "./nav";

describe("visibleNav", () => {
  it("hides the role-gated Submissions item below maintainer", () => {
    const paths = visibleNav("author").map((item) => item.path);
    expect(paths).not.toContain("/submissions");
    expect(paths).toContain("/catalogue");
  });

  it("shows Submissions for maintainer and admin", () => {
    expect(visibleNav("maintainer").map((i) => i.path)).toContain(
      "/submissions",
    );
    expect(visibleNav("admin").map((i) => i.path)).toContain("/submissions");
  });
});

describe("showsCatalogFilters", () => {
  it("hides the catalog controls on the submissions route", () => {
    expect(showsCatalogFilters("/submissions")).toBe(false);
  });

  it("hides the catalog search and filters on the model canvas route", () => {
    // The /model canvas reads the full dataset, never filteredAssets, so the
    // header search and filter selects do nothing there and only add a second,
    // confusing search next to the canvas's own Find box.
    expect(showsCatalogFilters("/model")).toBe(false);
  });

  it("treats nested model paths as the model route", () => {
    expect(showsCatalogFilters("/model/anything")).toBe(false);
  });

  it("hides the catalog controls on the settings route", () => {
    expect(showsCatalogFilters("/settings")).toBe(false);
  });

  it("shows the catalog controls on asset-driven routes", () => {
    expect(showsCatalogFilters("/")).toBe(true);
    expect(showsCatalogFilters("/catalogue")).toBe(true);
    expect(showsCatalogFilters("/monitor")).toBe(true);
  });
});

describe("showsTimeRange", () => {
  it("hides the time range on settings, submissions, and model", () => {
    expect(showsTimeRange("/settings")).toBe(false);
    expect(showsTimeRange("/submissions")).toBe(false);
    expect(showsTimeRange("/model")).toBe(false);
  });

  it("shows the time range on data pages that window utilization", () => {
    expect(showsTimeRange("/")).toBe(true);
    expect(showsTimeRange("/monitor")).toBe(true);
    expect(showsTimeRange("/asset/as-11")).toBe(true);
  });
});
