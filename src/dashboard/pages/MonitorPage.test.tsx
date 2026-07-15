import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { stubSource } from "@/__tests__/harness";
import { seedDataset, type DataSource, type VaultDataset } from "@/data";
import { VaultProvider } from "@/dashboard/VaultContext";
import { MonitorPage } from "@/dashboard/pages/MonitorPage";

function renderPage(dataset?: VaultDataset) {
  const source: DataSource = {
    ...stubSource(dataset),
    getUnattributedUsage: () => [{ key: "skill:ghost", count: 9 }],
    getHarnessUsage: () => [
      {
        source: "codex",
        label: "Codex",
        sessions: 5,
        windowStart: "2026-06-01",
        windowEnd: "2026-06-10",
        invocations: 100,
        successes: 8,
        errors: 2,
        latencyMs: 3000,
        tokens: 5000,
        cost: 0,
        models: ["gpt-5.5"],
        note: "Tool calls across sessions.",
        tracked: {
          successes: "partial",
          errors: "partial",
          latency: "full",
          tokens: "full",
          cost: "derived",
        },
      },
    ],
  };
  return render(
    <MemoryRouter>
      <VaultProvider dataSource={source}>
        <MonitorPage />
      </VaultProvider>
    </MemoryRouter>,
  );
}

/** Seed data plus a telemetry meta that reports two probe-seeded assets. */
function probeSeededDataset(): VaultDataset {
  const dataset = structuredClone(seedDataset);
  dataset.telemetryMeta = {
    source: "claude-code",
    generatedAt: "2026-06-15T00:00:00Z",
    windowStart: "2026-05-09",
    windowEnd: "2026-06-15",
    sessions: 42,
    tracked: {
      invocations: true,
      successes: true,
      errors: true,
      latency: true,
      refusals: false,
      tokens: false,
      cost: false,
    },
    probeAssetIds: ["cc-subagent-general-purpose", "cc-skill-brainstorming"],
    probeDate: "2026-06-15",
  };
  return dataset;
}

describe("MonitorPage", () => {
  it("renders the three regions on seed data", async () => {
    renderPage();
    expect(await screen.findByLabelText("Health strip")).toBeInTheDocument();
    expect(screen.getByLabelText("Exception queue")).toBeInTheDocument();
    expect(
      screen.getByLabelText(
        "Asset topology canvas. Use plus and minus to zoom, 0 to fit.",
      ),
    ).toBeInTheDocument();
  });

  it("exposes a clickable health strip whose tiles toggle a pressed state", async () => {
    const user = userEvent.setup();
    renderPage();
    const strip = await screen.findByLabelText("Health strip");
    const tile = within(strip).getAllByRole("button")[0];
    expect(tile).toHaveAttribute("aria-pressed", "false");
    await user.click(tile);
    expect(tile).toHaveAttribute("aria-pressed", "true");
  });

  it("notes how many assets were probe-seeded in the freshness band", async () => {
    renderPage(probeSeededDataset());
    expect(
      await screen.findByText("2 assets probe-seeded on 2026-06-15."),
    ).toBeInTheDocument();
  });

  it("shows no probe-seeded note when the snapshot seeded nothing", async () => {
    renderPage();
    await screen.findByLabelText("Health strip");
    expect(screen.queryByText(/probe-seeded/)).not.toBeInTheDocument();
  });

  it("lists real unattributed usage keys in the orphaned-usage panel", async () => {
    renderPage();
    expect(await screen.findByText("skill:ghost")).toBeInTheDocument();
  });

  it("summarizes usage by harness from the harness-usage snapshot", async () => {
    renderPage();
    // The full detail panel still renders under its own heading at the bottom.
    expect(await screen.findByText("Usage by harness")).toBeInTheDocument();
    // The harness label now appears in both the compact top summary and the full
    // panel, so it is present at least once.
    expect(screen.getAllByText("Codex").length).toBeGreaterThan(0);
  });

  it("shows a compact harness summary near the top that links to the full panel", async () => {
    renderPage();
    expect(
      await screen.findByLabelText("Harness usage summary"),
    ).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "View details" });
    expect(link).toHaveAttribute("href", "#harness-usage-detail");
  });

  it("offers the five map lenses and switches the active radio on click", async () => {
    const user = userEvent.setup();
    renderPage();
    const group = await screen.findByLabelText("Map lens");
    const governance = within(group).getByRole("radio", { name: "Governance" });
    expect(governance).toHaveAttribute("aria-checked", "false");
    await user.click(governance);
    await waitFor(() =>
      expect(governance).toHaveAttribute("aria-checked", "true"),
    );
  });
});
