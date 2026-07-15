import { describe, expect, it } from "vitest";

import {
  LIFECYCLE_STATUSES,
  SCOPE_STATUSES,
  isScopeStatus,
  lifecycleOf,
  scopeOf,
} from "./assetStatus";

describe("assetStatus", () => {
  it("isScopeStatus flags scope markers and not lifecycle stages", () => {
    expect(isScopeStatus("plugin-managed")).toBe(true);
    expect(isScopeStatus("active")).toBe(false);
  });

  it("scopeOf returns the scope marker or null for lifecycle stages", () => {
    expect(scopeOf("project-specific")).toBe("project-specific");
    expect(scopeOf("retired")).toBeNull();
  });

  it("lifecycleOf maps scope to implied-live active and keeps lifecycle values", () => {
    expect(lifecycleOf("plugin-managed")).toBe("active");
    expect(lifecycleOf("deprecated")).toBe("deprecated");
  });

  it("LIFECYCLE_STATUSES and SCOPE_STATUSES partition the five statuses with no overlap", () => {
    expect(LIFECYCLE_STATUSES.length + SCOPE_STATUSES.length).toBe(5);
    const overlap = LIFECYCLE_STATUSES.filter((s) =>
      (SCOPE_STATUSES as readonly string[]).includes(s),
    );
    expect(overlap).toEqual([]);
  });
});
