import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";

import { stubSource } from "@/__tests__/harness";
import {
  seedDataset,
  type AssetRow,
  type DataSource,
  type VaultDataset,
} from "@/data";
import { VaultProvider } from "@/dashboard/VaultContext";
import { AssetDetailPage } from "@/dashboard/pages/AssetDetailPage";

const PROBE_ID = "cc-subagent-example-helper";
const RELATED_TENANT = "tenant-related";

const mkRelatedAsset = (
  over: Partial<AssetRow> & Pick<AssetRow, "id">,
): AssetRow => ({
  tenantId: RELATED_TENANT,
  type: "skill",
  name: over.id,
  slug: over.id,
  description: "A governed asset.",
  body: "body",
  version: "1.0.0",
  status: "active",
  riskLevel: "low",
  maturity: 0.8,
  tier: "stock",
  contentHash: `hash-${over.id}`,
  createdAt: "2026-01-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
  ...over,
});

const relatedBase = (assets: AssetRow[]): VaultDataset => ({
  assets,
  tags: [],
  origins: [],
  owners: [
    {
      id: "own-cur",
      tenantId: RELATED_TENANT,
      name: "Paul Davis",
      email: "paul@x.io",
      role: "maintainer",
    },
  ],
  bundles: [],
  assetTags: [],
  dependencies: [],
  bundleMemberships: [],
  evalResults: [],
  utilization: [],
});

// current shares a type with relatedOne and an owner with relatedTwo, so both
// show up as related with distinct reasons; nothing else in the dataset relates
// to either of them, so search filtering can narrow between the two.
const currentAsset = mkRelatedAsset({
  id: "cur-asset",
  name: "Current Asset",
  type: "skill",
  ownerId: "own-cur",
});
const relatedOne = mkRelatedAsset({
  id: "rel-one",
  name: "Related One",
  type: "skill",
});
const relatedTwo = mkRelatedAsset({
  id: "rel-two",
  name: "Related Two",
  type: "prompt",
  ownerId: "own-cur",
});
const datasetWithRelated = relatedBase([currentAsset, relatedOne, relatedTwo]);

// solo shares no type, owner, origin, tag, bundle, or dependency with anything
// else in its (single-asset) dataset, so it has zero related assets.
const soloAsset = mkRelatedAsset({
  id: "solo-asset",
  name: "Solo Asset",
  type: "workflow",
});
const datasetWithNoRelated = relatedBase([soloAsset]);

function renderAssetDetail(
  retireAsset = vi.fn(),
  dataset: VaultDataset = structuredClone(seedDataset),
  assetId = PROBE_ID,
) {
  const source: DataSource = {
    ...stubSource(dataset),
    retireAsset,
  };

  return render(
    <MemoryRouter initialEntries={[`/asset/${assetId}`]}>
      <VaultProvider dataSource={source}>
        <Routes>
          <Route path="/asset/:assetId" element={<AssetDetailPage />} />
        </Routes>
      </VaultProvider>
    </MemoryRouter>,
  );
}

/** A dataset where PROBE_ID has real, fully-tracked (non-probe) telemetry. */
function fullyMeasuredDataset(): VaultDataset {
  const dataset = structuredClone(seedDataset);
  dataset.telemetryMeta = {
    source: "claude-code",
    generatedAt: "2026-06-15T00:00:00Z",
    windowStart: "2026-05-09",
    windowEnd: "2026-06-15",
    sessions: 10,
    tracked: {
      invocations: true,
      successes: true,
      errors: true,
      latency: true,
      refusals: false,
      tokens: false,
      cost: false,
    },
  };
  dataset.utilization = [
    {
      id: `${PROBE_ID}-2026-06-01`,
      tenantId: dataset.assets[0].tenantId,
      assetId: PROBE_ID,
      date: "2026-06-01",
      invocations: 50,
      successes: 48,
      errors: 2,
      refusals: 0,
      latencyMs: 1200,
      tokens: 0,
      cost: 0,
    },
  ];
  return dataset;
}

/** A dataset where PROBE_ID's only telemetry is the synthetic probe row. */
function probeOnlyDataset(): VaultDataset {
  const dataset = structuredClone(seedDataset);
  dataset.telemetryMeta = {
    source: "claude-code",
    generatedAt: "2026-06-15T00:00:00Z",
    windowStart: "2026-05-09",
    windowEnd: "2026-06-15",
    sessions: 10,
    tracked: {
      invocations: true,
      successes: true,
      errors: true,
      latency: true,
      refusals: false,
      tokens: false,
      cost: false,
    },
    probeAssetIds: [PROBE_ID],
    probeDate: "2026-06-15",
  };
  dataset.utilization = [
    {
      id: `${PROBE_ID}-2026-06-15`,
      tenantId: dataset.assets[0].tenantId,
      assetId: PROBE_ID,
      date: "2026-06-15",
      invocations: 1,
      successes: 1,
      errors: 0,
      refusals: 0,
      latencyMs: 1500,
      tokens: 0,
      cost: 0,
    },
  ];
  return dataset;
}

describe("AssetDetailPage", () => {
  it("makes edit the primary action and confirms before retiring", async () => {
    const retireAsset = vi.fn(() => Promise.resolve());
    renderAssetDetail(retireAsset);

    expect(
      await screen.findByRole("link", { name: "Edit asset" }),
    ).toHaveAttribute("href", "/catalogue?edit=cc-subagent-example-helper");

    await userEvent.click(screen.getByRole("button", { name: "Retire asset" }));
    expect(retireAsset).not.toHaveBeenCalled();
    await userEvent.click(
      screen.getByRole("button", { name: "Confirm retire asset" }),
    );
    expect(retireAsset).toHaveBeenCalledWith("cc-subagent-example-helper");
  });

  it("banners a probe-only asset as synthetic, not live, usage", async () => {
    renderAssetDetail(vi.fn(), probeOnlyDataset());
    expect(
      await screen.findByText(/Synthetic probe invocation, not live usage/),
    ).toBeInTheDocument();
  });

  it("renders the effective score as synthetic, not a percentage, for a probe-only asset", async () => {
    renderAssetDetail(vi.fn(), probeOnlyDataset());
    expect(
      await screen.findByText(/one synthetic call, not a measured score/),
    ).toBeInTheDocument();
    // The loud accent effective-score meter must not paint off one synthetic call.
    expect(
      screen.queryByRole("progressbar", { name: "Effective score" }),
    ).not.toBeInTheDocument();
  });

  it("shows no probe banner for an asset with no probe telemetry", async () => {
    renderAssetDetail();
    await screen.findByRole("link", { name: "Edit asset" });
    expect(
      screen.queryByText(/Synthetic probe invocation/),
    ).not.toBeInTheDocument();
  });

  it("splits a scope-status asset into a lifecycle pill and a separate scope badge", async () => {
    // A scope marker (project-specific) implies-live, so the lifecycle pill reads
    // "active" while the scope marker shows as its own sibling badge.
    const dataset = structuredClone(seedDataset);
    const target = dataset.assets.find((row) => row.id === PROBE_ID)!;
    target.status = "project-specific";
    renderAssetDetail(vi.fn(), dataset);

    await screen.findByRole("link", { name: "Edit asset" });
    // The header shows the lifecycle stage, not the scope marker, as the status.
    // Scoped to the hero header: related-asset rows below may also read "active".
    const title = screen.getByText(target.name);
    const header = within(title.closest("header")!);
    expect(header.getByText("active")).toBeInTheDocument();
    // The scope marker renders as a separate badge.
    expect(header.getByText("project-specific")).toBeInTheDocument();
  });

  describe("measurement honesty badge", () => {
    it("badges an asset with no telemetry as measurement: none", async () => {
      renderAssetDetail(vi.fn(), datasetWithNoRelated, soloAsset.id);
      await screen.findByRole("link", { name: "Edit asset" });
      expect(screen.getByText("measurement: none")).toBeInTheDocument();
    });

    it("badges a probe-only asset as measurement: occupancy", async () => {
      renderAssetDetail(vi.fn(), probeOnlyDataset());
      await screen.findByRole("link", { name: "Edit asset" });
      expect(screen.getByText("measurement: occupancy")).toBeInTheDocument();
    });

    it("badges a fully-measured asset as measurement: full", async () => {
      renderAssetDetail(vi.fn(), fullyMeasuredDataset());
      await screen.findByRole("link", { name: "Edit asset" });
      expect(screen.getByText("measurement: full")).toBeInTheDocument();
    });
  });

  describe("Related assets panel", () => {
    it("shows a distinct empty state when the asset has no related assets", async () => {
      renderAssetDetail(vi.fn(), datasetWithNoRelated, soloAsset.id);
      await screen.findByRole("link", { name: "Edit asset" });

      expect(screen.getByText("No related assets yet.")).toBeInTheDocument();
      // Nothing to search over, so the search field itself does not render.
      expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
    });

    it("lists related assets with their plain-English reasons", async () => {
      renderAssetDetail(vi.fn(), datasetWithRelated, currentAsset.id);
      await screen.findByRole("link", { name: "Edit asset" });

      expect(
        screen.getByRole("link", { name: /Related One/ }),
      ).toBeInTheDocument();
      expect(screen.getByText("same type: skill")).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: /Related Two/ }),
      ).toBeInTheDocument();
      expect(screen.getByText("same owner: Paul Davis")).toBeInTheDocument();
    });

    it("filters related assets as the user types, matching name and reason text", async () => {
      renderAssetDetail(vi.fn(), datasetWithRelated, currentAsset.id);
      await screen.findByRole("link", { name: "Edit asset" });

      await userEvent.type(
        screen.getByRole("searchbox", { name: "Search related assets" }),
        "Related One",
      );

      expect(
        screen.getByRole("link", { name: /Related One/ }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /Related Two/ }),
      ).not.toBeInTheDocument();
    });

    it("shows a distinct empty state when the search matches no related asset", async () => {
      renderAssetDetail(vi.fn(), datasetWithRelated, currentAsset.id);
      await screen.findByRole("link", { name: "Edit asset" });

      await userEvent.type(
        screen.getByRole("searchbox", { name: "Search related assets" }),
        "nothing matches this",
      );

      expect(screen.getByText(/No related assets match/)).toBeInTheDocument();
      expect(
        screen.queryByText("No related assets yet."),
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole("link", { name: /Related One/ }),
      ).not.toBeInTheDocument();
    });

    it("navigates to a related asset's own detail page when clicked", async () => {
      renderAssetDetail(vi.fn(), datasetWithRelated, currentAsset.id);
      await screen.findByRole("link", { name: "Edit asset" });

      await userEvent.click(screen.getByRole("link", { name: /Related One/ }));

      expect(await screen.findByText(relatedOne.name)).toBeInTheDocument();
    });

    it("clears a filtered search when navigating to a related asset's page", async () => {
      // react-router reuses the same AssetDetailPage instance across a
      // :assetId param change, so local search state must not leak between
      // the two assets' panels.
      renderAssetDetail(vi.fn(), datasetWithRelated, currentAsset.id);
      await screen.findByRole("link", { name: "Edit asset" });

      await userEvent.type(
        screen.getByRole("searchbox", { name: "Search related assets" }),
        "Related One",
      );
      await userEvent.click(screen.getByRole("link", { name: /Related One/ }));

      await screen.findByText(relatedOne.name);
      expect(
        screen.getByRole("searchbox", { name: "Search related assets" }),
      ).toHaveValue("");
      // relatedOne shares a type with currentAsset, so it has one related
      // asset of its own; the stale query must not hide it.
      expect(
        screen.getByRole("link", { name: /Current Asset/ }),
      ).toBeInTheDocument();
    });
  });

  describe("eval evidence", () => {
    const withEval = (): VaultDataset => {
      const dataset = relatedBase([soloAsset]);
      dataset.evalResults = [
        {
          id: "ev-solo",
          tenantId: RELATED_TENANT,
          assetId: "solo-asset",
          caseHash: "case-x",
          date: "2026-07-01",
          trials: 20,
          passed: 18,
          failed: 2,
          errored: 0,
          latencyMs: 100,
          tokens: 0,
          cost: 0,
          quality: "full",
        },
      ];
      return dataset;
    };

    it("shows the panel for an asset with private-eval results", async () => {
      renderAssetDetail(vi.fn(), withEval(), "solo-asset");
      expect(await screen.findByText("Eval evidence")).toBeInTheDocument();
      // The Meter carries the 18/20 pass rate under its accessible label.
      expect(
        screen.getByRole("progressbar", { name: "Eval pass rate" }),
      ).toBeInTheDocument();
      expect(screen.getByText("Trials")).toBeInTheDocument();
      expect(screen.getByText("Errored")).toBeInTheDocument();
    });

    it("omits the panel for an asset with no eval results", async () => {
      renderAssetDetail(vi.fn(), datasetWithNoRelated, "solo-asset");
      // Wait for the async load to settle (the asset name appears), then assert absence.
      expect(await screen.findByText("Solo Asset")).toBeInTheDocument();
      expect(screen.queryByText("Eval evidence")).not.toBeInTheDocument();
    });
  });
});
