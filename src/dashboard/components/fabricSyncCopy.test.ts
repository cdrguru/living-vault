import { describe, expect, it } from "vitest";

import { fabricSyncLabels } from "@/dashboard/components/fabricSyncCopy";

describe("fabricSyncLabels", () => {
  it("uses demo-friendly copy on the showcase build", () => {
    expect(fabricSyncLabels(true)).toEqual({
      idleLabel: "Load demo library",
      idleShort: "Library",
    });
  });

  it("uses Fabric library wording on live builds", () => {
    expect(fabricSyncLabels(false)).toEqual({
      idleLabel: "Sync from Fabric Library",
      idleShort: "Sync",
    });
  });
});