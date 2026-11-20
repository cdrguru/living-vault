import { render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import {
  seedDataset,
  type DataSource,
  type TelemetryMeta,
  type VaultDataset,
} from "@/data";
import { TelemetryWizard } from "@/dashboard/components/TelemetryWizard";
import { VaultProvider } from "@/dashboard/VaultContext";
import { AuthProvider } from "@/hooks/AuthContext";
import { DemoAuthService } from "@/services/DemoAuthService";
import { stubSource } from "@/__tests__/harness";

const EMPTY: VaultDataset = {
  routingStats: [],
  assets: [],
  tags: [],
  origins: [],
  owners: [],
  bundles: [],
  assetTags: [],
  dependencies: [],
  bundleMemberships: [],
  assetRevisions: [],
  evalResults: [],
  baselines: [],
  interventions: [],
  utilization: [],
};

function renderWizard(
  dataset: VaultDataset,
  overrides: Partial<DataSource> = {},
) {
  const source: DataSource = { ...stubSource(dataset), ...overrides };
  return render(
    <AuthProvider authService={new DemoAuthService()}>
      <MemoryRouter>
        <VaultProvider dataSource={source}>
          <TelemetryWizard />
        </VaultProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}

/** The <li> wrapping a step, found via its heading, for scoped pill assertions. */
function stepLi(name: RegExp | string): HTMLElement {
  return screen.getByRole("heading", { name }).closest("li") as HTMLElement;
}

/** Real (non-probe) telemetry meta, marking the upload step complete. */
const LIVE_META: TelemetryMeta = {
  source: "claude-code",
  generatedAt: "2026-06-19T00:00:00.000Z",
  windowStart: "2026-06-01T00:00:00.000Z",
  windowEnd: "2026-06-19T00:00:00.000Z",
  sessions: 4,
  tracked: {
    invocations: true,
    successes: true,
    errors: true,
    latency: true,
    refusals: true,
    tokens: true,
    cost: true,
  },
};

describe("TelemetryWizard", () => {
  it("renders the three onboarding step titles", async () => {
    renderWizard(structuredClone(seedDataset));
    expect(
      await screen.findByRole("heading", { name: "Catalogue ready" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Generate on your Mac" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Upload" })).toBeInTheDocument();
  });

  it("shows the repo-free collector command and output path", async () => {
    renderWizard(structuredClone(seedDataset));
    // The telemetry command downloads the bundled collector from the app and runs it,
    // with no repo path, so a shared user can paste it as-is.
    expect(
      await screen.findByText(/node living-vault-collect\.mjs telemetry/),
    ).toBeInTheDocument();
    // Step 1 also exposes the assets command for contributing your own assets.
    expect(
      screen.getByText(/node living-vault-collect\.mjs assets/),
    ).toBeInTheDocument();
    // The output path is named in the command's caption and in step 3's body.
    expect(
      screen.getAllByText(/utilization\.upload\.json/).length,
    ).toBeGreaterThanOrEqual(1);
    expect(
      screen.getAllByRole("button", { name: /Copy:/ }).length,
    ).toBeGreaterThanOrEqual(2);
  });

  it("clarifies that the toolbar Sync telemetry button is demo, not the live path", async () => {
    renderWizard(structuredClone(seedDataset));
    const emphasis = await screen.findByText("Sync telemetry");
    const note = emphasis.closest("p") as HTMLElement;
    expect(note).toHaveTextContent(/demo/i);
    expect(note).toHaveTextContent(/does not touch live Fabric/i);
  });

  it("blocks generate and upload until the catalogue has assets", async () => {
    renderWizard(structuredClone(EMPTY));
    await waitFor(() =>
      expect(
        within(stepLi("Generate on your Mac")).getByText("Blocked"),
      ).toBeInTheDocument(),
    );
    expect(within(stepLi("Upload")).getByText("Blocked")).toBeInTheDocument();
    expect(
      screen.getByText(/No assets in the catalogue yet/),
    ).toBeInTheDocument();
  });

  it("opens the steps once the catalogue is populated", async () => {
    renderWizard(structuredClone(seedDataset));
    await waitFor(() =>
      expect(
        within(stepLi("Catalogue ready")).getByText("Done"),
      ).toBeInTheDocument(),
    );
    expect(within(stepLi("Upload")).getByText("To do")).toBeInTheDocument();
  });

  it("marks the upload step done once real telemetry is in the dataset", async () => {
    renderWizard({ ...structuredClone(seedDataset), telemetryMeta: LIVE_META });
    await waitFor(() =>
      expect(within(stepLi("Upload")).getByText("Done")).toBeInTheDocument(),
    );
  });
});
