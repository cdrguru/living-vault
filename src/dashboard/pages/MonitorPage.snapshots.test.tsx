import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

// Both committed Codex snapshots are swapped for deterministic fixtures so the
// harness card renders the billing note and the workspace usage grid regardless
// of what the local demo data contains.
const { billingSnapshot, workspaceSnapshot } = vi.hoisted(() => ({
  billingSnapshot: {
    generatedAt: "2026-06-28T12:00:00.000Z",
    source: "chatgpt-codex-analytics-export",
    currency: "credits",
    windowStart: "2026-06-23",
    windowEnd: "2026-06-27",
    totals: {
      credits: 283.2020625,
      billedTokens: 57696274,
      localTokens: 2038742,
      runs: 52,
    },
    daily: [],
    notes: [],
  },
  workspaceSnapshot: {
    generatedAt: "2026-06-28T12:00:00.000Z",
    source: "codex-workspace-analytics-export",
    windowStart: "2026-06-23",
    windowEnd: "2026-06-27",
    totals: {
      users: 2,
      sessions: 892,
      messages: 3298,
      turns: 3257,
      tasksWeb: 0,
      codeReviewsWeb: 41,
      reviews: 41,
      reviewComments: 38,
      textInputTokens: 149308769,
      textCachedInputTokens: 1230451072,
      textOutputTokens: 8598627,
      textTotalTokens: 1388358468,
    },
    clients: [],
    models: [],
    users: [],
    daily: [],
    notes: [],
  },
}));

vi.mock("@/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/data")>();
  return {
    ...actual,
    codexBillingSnapshot: billingSnapshot,
    codexWorkspaceUsageSnapshot: workspaceSnapshot,
  };
});

import { stubSource } from "@/__tests__/harness";
import { seedDataset, type DataSource } from "@/data";
import { VaultProvider } from "@/dashboard/VaultContext";
import { MonitorPage } from "@/dashboard/pages/MonitorPage";

function renderMonitorPage() {
  const source: DataSource = {
    ...stubSource(),
    // The original stub returned a fresh clone per call; keep that.
    getDataset: () => Promise.resolve(structuredClone(seedDataset)),
    getHarnessUsage: () => [
      {
        source: "codex",
        label: "Codex",
        sessions: 2,
        windowStart: "2026-06-23",
        windowEnd: "2026-06-27",
        invocations: 52,
        successes: 44,
        errors: 0,
        latencyMs: 1000,
        tokens: 2038742,
        cost: 0,
        models: ["gpt-5.5"],
        tokensByModel: { "gpt-5.5": 2038742 },
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

describe("MonitorPage Codex snapshots", () => {
  it("shows the actual imported credit total on the Codex harness card", async () => {
    renderMonitorPage();

    expect((await screen.findAllByText("Codex")).length).toBeGreaterThan(0);
    const note = screen.getByText(/actual credits from ChatGPT\/Codex analytics/i);
    // The rounded snapshot total, not just the label, is on the card.
    expect(note.closest("p")?.textContent).toContain("283");
  });

  it("shows Codex workspace usage separately from local harness metrics", async () => {
    renderMonitorPage();

    expect((await screen.findAllByText("Codex")).length).toBeGreaterThan(0);
    expect(screen.getByText("Workspace turns")).toBeInTheDocument();
    expect(screen.getByText("Admin sessions")).toBeInTheDocument();
    expect(screen.getByText("Code reviews")).toBeInTheDocument();
  });
});
