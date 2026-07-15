import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import type {
  AssetRow,
  DataSource,
  HarnessUsage,
  TelemetryMeta,
  UtilizationRow,
  VaultDataset,
} from "@/data";
import { stubSource } from "@/__tests__/harness";
import { VaultProvider, useVault } from "@/dashboard/VaultContext";
import { CostPage } from "./CostPage";

const mkAsset = (
  id: string,
  type: AssetRow["type"],
  over: Partial<AssetRow> = {},
): AssetRow => ({
  id,
  tenantId: "t",
  type,
  name: `${type}-${id}`,
  slug: id,
  description: "d",
  body: "b",
  version: "1.0.0",
  status: "active",
  riskLevel: "low",
  maturity: 0.5,
  tier: "stock",
  contentHash: id,
  ownerId: "o",
  originId: "g",
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
  ...over,
});

const mkUtil = (
  assetId: string,
  over: Partial<UtilizationRow> = {},
): UtilizationRow => ({
  id: `${assetId}-u`,
  tenantId: "t",
  assetId,
  date: "2026-06-07",
  invocations: 10,
  successes: 4,
  errors: 6,
  refusals: 0,
  latencyMs: 100,
  tokens: 0,
  cost: 0,
  ...over,
});

const emptyDataset = (over: Partial<VaultDataset> = {}): VaultDataset => ({
  assets: [],
  tags: [],
  origins: [],
  owners: [],
  bundles: [],
  assetTags: [],
  dependencies: [],
  bundleMemberships: [],
  evalResults: [],
  utilization: [],
  ...over,
});

const meta = (over: Partial<TelemetryMeta["tracked"]> = {}): TelemetryMeta => ({
  source: "claude-code",
  generatedAt: "2026-06-07T00:00:00Z",
  windowStart: "2026-06-01",
  windowEnd: "2026-06-07",
  sessions: 12,
  tracked: {
    invocations: true,
    successes: true,
    errors: true,
    latency: true,
    refusals: false,
    tokens: false,
    cost: false,
    ...over,
  },
});

const mkHarness = (
  source: string,
  over: Partial<HarnessUsage> & {
    tokensQuality: HarnessUsage["tracked"]["tokens"];
  },
): HarnessUsage => ({
  source,
  label: over.label ?? source,
  sessions: 0,
  windowStart: null,
  windowEnd: null,
  invocations: over.invocations ?? 0,
  successes: over.successes ?? 0,
  errors: 0,
  latencyMs: 0,
  tokens: over.tokens ?? 0,
  cost: 0,
  models: over.models ?? [],
  tracked: {
    successes: "full",
    errors: "full",
    latency: "full",
    tokens: over.tokensQuality,
    cost: "none",
  },
});

/** A stub route that surfaces the active type filter so a drill-in is observable. */
function CatalogueStub() {
  const { filters } = useVault();
  return <div data-testid="catalogue">type:{filters.type}</div>;
}

function renderWith(dataset: VaultDataset, harness: HarnessUsage[] = []) {
  const source: DataSource = {
    ...stubSource(dataset),
    getHarnessUsage: () => harness,
  };
  return render(
    <MemoryRouter initialEntries={["/cost"]}>
      <VaultProvider dataSource={source}>
        <Routes>
          <Route path="/cost" element={<CostPage />} />
          <Route path="/catalogue" element={<CatalogueStub />} />
        </Routes>
      </VaultProvider>
    </MemoryRouter>,
  );
}

// A dataset with real cost so the page renders its full content, not the
// zero-cost empty state. The skill asset is costly and ineffective (low success,
// few invocations) so it leads the wasted-spend table; the prompt costs less.
const costlyDataset = emptyDataset({
  assets: [mkAsset("a1", "skill"), mkAsset("a2", "prompt")],
  utilization: [
    mkUtil("a1", { invocations: 10, successes: 4, errors: 6, cost: 90 }),
    mkUtil("a2", { invocations: 10, successes: 4, errors: 6, cost: 12 }),
  ],
  telemetryMeta: meta(),
});

// Harnesses for the per-model efficiency section: codex is expensive per success
// (lots of tokens, few wins), grok is cheap, claude logs no tokens so it cannot be
// priced. Rates come from the committed pricing.json.
const harnessSources: HarnessUsage[] = [
  mkHarness("codex", {
    label: "Codex",
    models: ["gpt-5.5"],
    tokens: 300_000_000,
    successes: 400,
    invocations: 5000,
    tokensQuality: "full",
  }),
  mkHarness("grok", {
    label: "Grok",
    models: ["grok-build"],
    tokens: 4_000_000,
    successes: 780,
    invocations: 800,
    tokensQuality: "partial",
  }),
  mkHarness("claude-code", {
    label: "Claude Code",
    models: [],
    tokens: 0,
    successes: 570,
    invocations: 600,
    tokensQuality: "none",
  }),
];

describe("CostPage", () => {
  it("shows the no-token estimate state when no harness logs tokens", async () => {
    renderWith(emptyDataset({ assets: [mkAsset("a1", "skill")] }));
    expect(
      await screen.findByText(/spend cannot be estimated/),
    ).toBeInTheDocument();
  });

  it("labels the per-model spend as an estimate with the pricing date", async () => {
    renderWith(costlyDataset, harnessSources);
    // The estimated pill leads the basis banner (matched by exact text node).
    expect(await screen.findByText("estimated")).toBeInTheDocument();
    expect(screen.getByText(/Prices as of/)).toBeInTheDocument();
  });

  it("ranks harnesses by cost per success cheapest first and flags unpriced ones", async () => {
    renderWith(costlyDataset, harnessSources);
    // Grok is far cheaper per success than Codex, so its row is marked best and
    // Codex's row worst. Anchor on each pill's own list item to verify the pairing.
    const best = (await screen.findByText("most efficient")).closest("li");
    const worst = screen.getByText("least efficient").closest("li");
    expect(best).not.toBeNull();
    expect(worst).not.toBeNull();
    expect(within(best as HTMLElement).getByText("Grok")).toBeInTheDocument();
    expect(within(worst as HTMLElement).getByText("Codex")).toBeInTheDocument();
    // Claude Code logs no tokens, so it is named in the not-priced footnote.
    expect(screen.getByText(/Not priced:/)).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
  });

  it("ranks costly-but-ineffective assets worst first in the modeled wasted spend table", async () => {
    renderWith(costlyDataset, harnessSources);
    const table = await screen.findByRole("table", {
      name: /Costly but ineffective assets/,
    });
    const rows = within(table).getAllByRole("row");
    // rows[0] is the header; the first body row is the worst (highest cost).
    expect(within(rows[1]).getByText("skill-a1")).toBeInTheDocument();
    expect(within(rows[2]).getByText("prompt-a2")).toBeInTheDocument();
  });

  it("allocates real harness spend across assets by invocation share when telemetry carries no per-asset cost", async () => {
    // Live-telemetry shape: per-asset rows have zero cost, but the matching
    // harness (claude-code) logs real tokens and is priced. The asset section
    // must still render, on the allocated basis, weighting by invocations.
    const liveDataset = emptyDataset({
      assets: [mkAsset("a1", "skill"), mkAsset("a2", "prompt")],
      utilization: [
        mkUtil("a1", { invocations: 30, successes: 12, errors: 18, cost: 0 }),
        mkUtil("a2", { invocations: 10, successes: 4, errors: 6, cost: 0 }),
      ],
      telemetryMeta: meta(),
    });
    const claudePriced: HarnessUsage[] = [
      mkHarness("claude-code", {
        label: "Claude Code",
        models: ["claude-opus-4-8"],
        tokens: 100_000_000,
        successes: 16,
        invocations: 40,
        tokensQuality: "full",
      }),
    ];
    renderWith(liveDataset, claudePriced);

    // Section B renders despite zero per-asset cost, labeled as allocated.
    expect(await screen.findByText("Spend by asset")).toBeInTheDocument();
    expect(
      screen.getByText(/allocated across assets by invocation share/),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Spend efficiency \(allocated\)/),
    ).toBeInTheDocument();

    // a1 has 3x the invocations of a2, so it gets the larger allocation and leads.
    const table = screen.getByRole("table", {
      name: /Costly but ineffective assets/,
    });
    const rows = within(table).getAllByRole("row");
    expect(within(rows[1]).getByText("skill-a1")).toBeInTheDocument();
    expect(within(rows[2]).getByText("prompt-a2")).toBeInTheDocument();
  });

  it("filters the wasted spend table by a column header funnel", async () => {
    renderWith(costlyDataset, harnessSources);
    await screen.findByRole("table", { name: /Costly but ineffective assets/ });

    await userEvent.click(
      screen.getByRole("button", { name: /filter by type/i }),
    );
    await userEvent.click(screen.getByRole("checkbox", { name: /^prompt$/i }));

    expect(screen.queryByText("skill-a1")).not.toBeInTheDocument();
    expect(screen.getByText("prompt-a2")).toBeInTheDocument();
  });

  it("drills into the type-filtered catalogue from a keyboard-activated spend bar", async () => {
    const user = userEvent.setup();
    renderWith(costlyDataset, harnessSources);
    await screen.findByText("Spend by asset");
    const drill = screen.getByRole("button", {
      name: /Open skill assets in the catalogue/,
    });
    drill.focus();
    expect(drill).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(await screen.findByTestId("catalogue")).toHaveTextContent(
      "type:skill",
    );
  });
});
