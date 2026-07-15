import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  datasetHasOnlyProbe,
  deriveEnvironment,
  readEnvInput,
  telemetryBanner,
  type EnvInput,
} from "./environment";
import type { VaultDataset } from "@/data";

const base: EnvInput = {
  dev: false,
  demoMode: false,
  rayfinData: false,
  fabricConfigured: false,
};

function datasetWithMeta(): VaultDataset {
  return {
    telemetryMeta: { generatedAt: "2026-06-01" },
  } as unknown as VaultDataset;
}

describe("deriveEnvironment", () => {
  it("labels the vite dev server as local with seed data and demo auth", () => {
    const status = deriveEnvironment({ ...base, dev: true }, null, false);
    expect(status.mode).toBe("local");
    expect(status.isLocalDev).toBe(true);
    expect(status.dataSource.value).toBe("Seed (local)");
    expect(status.auth.value).toBe("Demo");
  });

  it("treats VITE_DEMO_MODE as demo regardless of the dev flag", () => {
    const status = deriveEnvironment({ ...base, demoMode: true }, null, false);
    expect(status.mode).toBe("demo");
    expect(status.isDemo).toBe(true);
    expect(status.telemetry.value).toBe("Demo data");
  });

  it("treats VITE_RAYFIN_DATA as live Fabric", () => {
    const status = deriveEnvironment(
      { ...base, rayfinData: true, fabricConfigured: true },
      datasetWithMeta(),
      false,
    );
    expect(status.mode).toBe("fabric");
    expect(status.dataSource.value).toBe("Rayfin (live Fabric)");
    expect(status.auth.value).toBe("Fabric SSO");
    expect(status.telemetry.state).toBe("live");
  });

  it("reports not-synced when local dev has no telemetry meta", () => {
    const status = deriveEnvironment({ ...base, dev: true }, null, false);
    expect(status.telemetry.state).toBe("none");
    expect(status.telemetry.value).toBe("Not synced yet");
  });

  it("flags probe-only telemetry distinctly from live in local mode", () => {
    const status = deriveEnvironment(
      { ...base, dev: true },
      datasetWithMeta(),
      true,
    );
    expect(status.telemetry.state).toBe("probe");
    expect(status.telemetry.value).toBe("Probe-seeded only");
  });

  it("calls demo telemetry synthetic even when meta is present", () => {
    const status = deriveEnvironment(
      { ...base, demoMode: true },
      datasetWithMeta(),
      false,
    );
    expect(status.telemetry.state).toBe("demo");
    expect(status.telemetry.value).toBe("Demo (synthetic)");
  });
});

describe("readEnvInput fabricConfigured", () => {
  // Clear the brokered-auth vars first so the test is hermetic: a real deploy
  // writes them into a gitignored .env.local that vitest loads into
  // import.meta.env, which would otherwise leak into the "absent" cases. Each
  // test stubs only the vars it needs present on top of this clean slate.
  beforeEach(() => {
    vi.stubEnv("VITE_FABRIC_WORKSPACE_ID", "");
    vi.stubEnv("VITE_FABRIC_ITEM_ID", "");
    vi.stubEnv("VITE_FABRIC_PORTAL_URL", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("is true when workspace, item, and portal vars are all present", () => {
    vi.stubEnv("VITE_FABRIC_WORKSPACE_ID", "ws");
    vi.stubEnv("VITE_FABRIC_ITEM_ID", "item");
    vi.stubEnv("VITE_FABRIC_PORTAL_URL", "https://app.fabric.microsoft.com/");
    expect(readEnvInput().fabricConfigured).toBe(true);
  });

  it("is false when only the legacy CLIENT_ID and TENANT_ID are set", () => {
    vi.stubEnv("VITE_FABRIC_CLIENT_ID", "client");
    vi.stubEnv("VITE_FABRIC_TENANT_ID", "tenant");
    expect(readEnvInput().fabricConfigured).toBe(false);
  });

  it("is false when a required brokered-auth var is missing", () => {
    vi.stubEnv("VITE_FABRIC_WORKSPACE_ID", "ws");
    vi.stubEnv("VITE_FABRIC_ITEM_ID", "item");
    expect(readEnvInput().fabricConfigured).toBe(false);
  });
});

describe("telemetryBanner (item 5: data-derived, never contradictory)", () => {
  it("demo: synthetic showcase wording", () => {
    expect(telemetryBanner({ ...base, demoMode: true }, null, false).text).toBe(
      "Synthetic showcase data. Not a live library.",
    );
  });

  it("local + no telemetry: modeled seed wording", () => {
    expect(telemetryBanner(base, null, false).text).toBe(
      "Modeled seed data. Run the collectors to import your real usage.",
    );
  });

  it("fabric + no telemetry: says Live Fabric, never 'seed data'", () => {
    const { text } = telemetryBanner({ ...base, rayfinData: true }, null, false);
    expect(text).toBe("Live Fabric. No telemetry imported yet.");
    expect(text).not.toMatch(/seed data/i);
  });

  it("fabric + probe-only telemetry", () => {
    expect(
      telemetryBanner({ ...base, rayfinData: true }, datasetWithMeta(), true)
        .text,
    ).toBe("Live Fabric. Probe-seeded telemetry only.");
  });

  it("local + probe mentions probe, not 'imported yet'", () => {
    const { text } = telemetryBanner(base, datasetWithMeta(), true);
    expect(text).toMatch(/probe/i);
    expect(text).not.toMatch(/imported yet/i);
  });

  it("datasetHasOnlyProbe is false when meta carries no probe ids", () => {
    expect(datasetHasOnlyProbe(datasetWithMeta())).toBe(false);
  });
});
