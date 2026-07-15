import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { renderWithVault } from "@/__tests__/harness";
import { seedDataset, type TelemetryMeta } from "@/data";
import { OverviewPage } from "@/dashboard/pages/OverviewPage";

/** A realistic phase 1 telemetry snapshot: usage is tracked, cost is not. */
const realTelemetry = (): TelemetryMeta => ({
  source: "claude-code",
  generatedAt: "2026-06-13T05:01:14.296Z",
  windowStart: "2026-05-09",
  windowEnd: "2026-06-13",
  sessions: 791,
  tracked: {
    invocations: true,
    successes: true,
    errors: true,
    latency: true,
    refusals: false,
    tokens: false,
    cost: false,
  },
});

describe("OverviewPage", () => {
  it("renders the not-tracked-here cost card under real telemetry, never a dollar figure", async () => {
    const dataset = structuredClone(seedDataset);
    dataset.telemetryMeta = realTelemetry();

    renderWithVault(<OverviewPage />, dataset);

    expect(await screen.findByText("Not tracked here")).toBeInTheDocument();
    // No measured currency value in the cost tile when per-asset cost is untracked.
    expect(screen.queryByText(/\$[0-9]/)).not.toBeInTheDocument();
  });

  it("declines to show a per-asset cost figure, because per-asset cost is not measurable", async () => {
    // Claude Code does not attribute spend to the individual asset a turn fired, so
    // the collector reports cost 0 / untracked and the Overview must say so rather
    // than print a number it cannot stand behind. This test previously asserted the
    // opposite (a dollar figure, no "Not tracked here") and passed only because the
    // demo generator fabricated per-asset cost and flipped tracked.cost to true,
    // which disabled this very guard. Do not "fix" this back.
    const dataset = structuredClone(seedDataset);
    delete dataset.telemetryMeta;

    renderWithVault(<OverviewPage />, dataset);

    expect(await screen.findByText("Cost (last 30d)")).toBeInTheDocument();
    expect(screen.getByText("Not tracked here")).toBeInTheDocument();
    expect(
      screen.getByText(/Per-asset cost is not tracked for this window/),
    ).toBeInTheDocument();
  });

  it("reads as a freshness band, a verdict, live activity, then the top fixes", async () => {
    const dataset = structuredClone(seedDataset);
    dataset.telemetryMeta = realTelemetry();

    renderWithVault(<OverviewPage />, dataset);

    expect(await screen.findByText(/791 sessions/)).toBeInTheDocument();
    expect(screen.getByText(/are Stars \(governed and effective\)/)).toBeInTheDocument();
    expect(screen.getByText("Live activity")).toBeInTheDocument();
    expect(screen.getByText("What to fix next")).toBeInTheDocument();
    expect(
      screen.getByText("Governed x Effective quadrant"),
    ).toBeInTheDocument();
  });

  it("links each top fix to its asset detail route", async () => {
    const dataset = structuredClone(seedDataset);
    dataset.telemetryMeta = realTelemetry();

    renderWithVault(<OverviewPage />, dataset);

    const panel = await screen.findByText("What to fix next");
    const card = panel.closest("section");
    expect(card).not.toBeNull();
    const links = within(card as HTMLElement).getAllByRole("link");
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(5);
    for (const link of links) {
      expect(link.getAttribute("href")).toMatch(/^\/asset\//);
    }
  });
});
