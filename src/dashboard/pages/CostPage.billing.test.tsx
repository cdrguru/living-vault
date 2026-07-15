import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { billingSnapshot } = vi.hoisted(() => ({
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
}));

vi.mock("@/data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/data")>();
  return {
    ...actual,
    codexBillingSnapshot: billingSnapshot,
  };
});

import type {
  AssetRow,
  DataSource,
  HarnessUsage,
  TelemetryMeta,
  UtilizationRow,
  VaultDataset,
} from "@/data";
import { stubSource } from "@/__tests__/harness";
import { VaultProvider } from "@/dashboard/VaultContext";
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

const dataset: VaultDataset = {
  assets: [mkAsset("a1", "skill")],
  tags: [],
  origins: [],
  owners: [],
  bundles: [],
  assetTags: [],
  dependencies: [],
  bundleMemberships: [],
  evalResults: [],
  utilization: [
    mkUtil("a1", { invocations: 10, successes: 4, errors: 6, cost: 0 }),
  ],
  telemetryMeta: meta(),
};

const harnessSources: HarnessUsage[] = [
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
];

function renderBillingCostPage() {
  const source: DataSource = {
    ...stubSource(dataset),
    getHarnessUsage: () => harnessSources,
  };
  return render(
    <MemoryRouter initialEntries={["/cost"]}>
      <VaultProvider dataSource={source}>
        <Routes>
          <Route path="/cost" element={<CostPage />} />
        </Routes>
      </VaultProvider>
    </MemoryRouter>,
  );
}

describe("CostPage Codex billing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders actual Codex credits separately from estimated spend", async () => {
    renderBillingCostPage();

    expect(await screen.findByText(/Est. total spend/i)).toBeInTheDocument();
    expect(screen.getByText(/Actual Codex credits/i)).toBeInTheDocument();
    // The rounded snapshot total itself is rendered, not just the label.
    expect(screen.getByText("283")).toBeInTheDocument();
    expect(screen.getByText("ChatGPT/Codex analytics")).toBeInTheDocument();
  });
});
