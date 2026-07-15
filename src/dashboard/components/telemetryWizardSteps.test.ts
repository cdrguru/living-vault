import { describe, expect, it } from "vitest";

import {
  ASSETS_OUTPUT,
  TELEMETRY_UPLOAD_OUTPUT,
  collectorCommand,
  deriveWizardSteps,
} from "./telemetryWizardSteps";

describe("deriveWizardSteps", () => {
  it("blocks generate and upload until the catalogue has assets", () => {
    expect(deriveWizardSteps({ catalogueCount: 0, uploaded: false })).toEqual({
      catalogue: "pending",
      generate: "blocked",
      upload: "blocked",
    });
  });

  it("opens generate and upload once the catalogue is populated", () => {
    expect(deriveWizardSteps({ catalogueCount: 12, uploaded: false })).toEqual({
      catalogue: "done",
      generate: "pending",
      upload: "pending",
    });
  });

  it("marks every step done after a successful upload", () => {
    expect(deriveWizardSteps({ catalogueCount: 12, uploaded: true })).toEqual({
      catalogue: "done",
      generate: "done",
      upload: "done",
    });
  });

  it("stays blocked downstream even if uploaded is somehow true with no catalogue", () => {
    expect(deriveWizardSteps({ catalogueCount: 0, uploaded: true })).toEqual({
      catalogue: "pending",
      generate: "blocked",
      upload: "blocked",
    });
  });
});

describe("collectorCommand", () => {
  it("downloads the bundled collector from the app origin, then runs the chosen mode", () => {
    const cmd = collectorCommand("https://app.example.net", "telemetry");
    expect(cmd).toContain(
      "curl -fsSL https://app.example.net/living-vault-collect.mjs -o living-vault-collect.mjs",
    );
    expect(cmd).toContain("node living-vault-collect.mjs telemetry");
  });

  it("is repo-free so a shared user with no checkout can run it", () => {
    const cmd = collectorCommand("https://x", "assets");
    expect(cmd).not.toContain("rayfin-projects");
    expect(cmd).not.toContain("scripts/");
    expect(cmd).toContain("node living-vault-collect.mjs assets");
  });

  it("strips a trailing slash from the origin", () => {
    expect(collectorCommand("https://x/", "telemetry")).toContain(
      "https://x/living-vault-collect.mjs",
    );
  });

  it("names the files the collector writes into the current directory", () => {
    expect(TELEMETRY_UPLOAD_OUTPUT).toBe("./utilization.upload.json");
    expect(ASSETS_OUTPUT).toBe("./living-vault-assets.json");
  });
});
