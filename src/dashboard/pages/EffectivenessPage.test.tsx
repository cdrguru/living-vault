import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { stubSource } from "@/__tests__/harness";
import { classificationCounts } from "@/data";
import type {
  AssetRow,
  TelemetryMeta,
  UtilizationRow,
  VaultDataset,
} from "@/data";
import { Pill } from "@/dashboard/components/Pill";
import { VaultProvider } from "@/dashboard/VaultContext";
import { setDefaultRange } from "@/dashboard/settings/preferences";
import { EffectivenessPage } from "./EffectivenessPage";

/** Force the reduced-motion media query to a fixed result for one test. */
function mockReducedMotion(reduced: boolean) {
  const original = window.matchMedia;
  window.matchMedia = ((query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
}

const mkUtil = (assetId: string, invocations: number): UtilizationRow => ({
  id: `${assetId}-u`,
  tenantId: "t",
  assetId,
  date: "2026-06-07",
  invocations,
  successes: invocations,
  errors: 0,
  refusals: 0,
  latencyMs: 100,
  tokens: 0,
  cost: 0,
});

const mkUtilModel = (
  assetId: string,
  invocations: number,
  model: string,
): UtilizationRow => ({
  ...mkUtil(assetId, invocations),
  id: `${assetId}-${model}`,
  model,
});

const mkAsset = (id: string, type: AssetRow["type"]): AssetRow => ({
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
  updatedAt: "2026-01-01T00:00:00Z",
});

const emptyDataset = (over: Partial<VaultDataset> = {}): VaultDataset => ({
  routingStats: [],
  assets: [],
  assetRevisions: [],
  tags: [],
  origins: [],
  owners: [],
  bundles: [],
  assetTags: [],
  dependencies: [],
  bundleMemberships: [],
  evalResults: [],
  baselines: [],
  interventions: [],
  utilization: [],
  ...over,
});

const meta = (over: Partial<TelemetryMeta["tracked"]>): TelemetryMeta => ({
  source: "claude-code",
  generatedAt: "2026-06-07T00:00:00Z",
  windowStart: "2026-06-07",
  windowEnd: "2026-06-07",
  sessions: 1,
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

const probeMeta = (): TelemetryMeta => ({
  ...meta({}),
  probeAssetIds: ["a-probe"],
  probeDate: "2026-06-15",
});

/** A dataset with one live asset and one probe-only asset (single 2026-06-15 row). */
const probeDataset = (): VaultDataset =>
  emptyDataset({
    assets: [mkAsset("a-live", "skill"), mkAsset("a-probe", "skill")],
    utilization: [
      mkUtil("a-live", 200),
      { ...mkUtil("a-probe", 1), date: "2026-06-15" },
    ],
    telemetryMeta: probeMeta(),
  });

function renderWith(dataset: VaultDataset) {
  return render(
    <MemoryRouter>
      <VaultProvider dataSource={stubSource(dataset)}>
        <EffectivenessPage />
      </VaultProvider>
    </MemoryRouter>,
  );
}

describe("EffectivenessPage", () => {
  it("breaks telemetry down by model", async () => {
    renderWith(
      emptyDataset({
        assets: [mkAsset("a1", "skill"), mkAsset("a2", "subagent")],
        utilization: [
          mkUtilModel("a1", 12, "claude-opus-4-8"),
          mkUtilModel("a2", 8, "claude-sonnet-4-6"),
        ],
        telemetryMeta: meta({ model: true }),
      }),
    );
    // Match on text, not role="region": Panel renders a bare <section> with no
    // aria-labelledby, so it has no accessible name. The model ids appear only in
    // the by-model panel (the ranking table shows asset names and types, not models).
    expect(
      await screen.findByText("Effectiveness by model"),
    ).toBeInTheDocument();
    expect(screen.getByText("claude-opus-4-8")).toBeInTheDocument();
    expect(screen.getByText("claude-sonnet-4-6")).toBeInTheDocument();
  });

  it("shows an empty state when there are no assets", async () => {
    renderWith(emptyDataset());
    expect(
      await screen.findByText(/No assets to score yet/),
    ).toBeInTheDocument();
  });

  it("gates 'no telemetry' on data presence, not asset type", async () => {
    // A hook with real utilization rows shows its numbers; a skill with none
    // reads "no telemetry". The gate follows the data, not the type.
    renderWith(
      emptyDataset({
        assets: [mkAsset("a1", "hook"), mkAsset("a2", "skill")],
        utilization: [mkUtil("a1", 120)],
        telemetryMeta: meta({}),
      }),
    );
    const table = await screen.findByRole("table", {
      name: /effectiveness scores/,
    });
    expect(within(table).getByText("120")).toBeInTheDocument();
    expect(within(table).getAllByText("no telemetry").length).toBeGreaterThan(
      0,
    );
  });

  it("notes refusals, tokens, and cost as not tracked when their flags are false", async () => {
    renderWith(
      emptyDataset({
        assets: [mkAsset("a1", "skill")],
        telemetryMeta: meta({}),
      }),
    );
    expect(
      await screen.findByText("Not tracked yet: refusals, tokens, cost."),
    ).toBeInTheDocument();
  });

  it("filters the ranking by a column header funnel", async () => {
    renderWith(
      emptyDataset({
        assets: [mkAsset("a1", "skill"), mkAsset("a2", "subagent")],
        utilization: [mkUtil("a1", 50), mkUtil("a2", 30)],
      }),
    );
    await screen.findByText("skill-a1");
    expect(screen.getByText("subagent-a2")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: /filter by type/i }),
    );
    await userEvent.click(
      screen.getByRole("checkbox", { name: /^subagent$/i }),
    );

    expect(screen.queryByText("skill-a1")).not.toBeInTheDocument();
    expect(screen.getByText("subagent-a2")).toBeInTheDocument();
  });

  it("offers attention filters for shelfware and no-telemetry assets", async () => {
    renderWith(
      emptyDataset({
        // a1 (prompt) has no utilization, so it is the only no-telemetry asset;
        // a2 (skill) has rows and stays out of the no-telemetry funnel.
        assets: [mkAsset("a1", "prompt"), mkAsset("a2", "skill")],
        utilization: [mkUtil("a2", 50)],
        telemetryMeta: meta({}),
      }),
    );
    await screen.findByText("prompt-a1");

    expect(
      screen.getByRole("heading", { name: "Needs attention" }),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /No telemetry/ }));

    const table = screen.getByRole("table", {
      name: "Asset effectiveness scores ranked by invocations",
    });
    expect(within(table).getByText("prompt-a1")).toBeInTheDocument();
    expect(within(table).queryByText("skill-a2")).not.toBeInTheDocument();
  });

  it("offers an Underperforming lane for trustworthy-but-weak assets", async () => {
    renderWith(
      emptyDataset({
        assets: [mkAsset("a-bad", "hook"), mkAsset("a-good", "skill")],
        utilization: [
          // High volume, mostly failing -> grade A, weak tier: a confirmed
          // underperformer (fix it), distinct from a no-evidence asset.
          { ...mkUtil("a-bad", 200), successes: 60, errors: 140 },
          // High volume and healthy -> effective, never flagged.
          mkUtil("a-good", 200),
        ],
        telemetryMeta: meta({}),
      }),
    );
    await screen.findByText("hook-a-bad");
    await userEvent.click(
      screen.getByRole("button", { name: /Underperforming/ }),
    );
    const table = screen.getByRole("table", {
      name: /effectiveness scores/,
    });
    expect(within(table).getByText("hook-a-bad")).toBeInTheDocument();
    expect(within(table).queryByText("skill-a-good")).not.toBeInTheDocument();
  });

  it("shows the AES and evidence-confidence column with a graded tier", async () => {
    renderWith(
      emptyDataset({
        assets: [mkAsset("a1", "skill")],
        // High volume, all successes -> high AES, grade not D/E -> a real tier.
        utilization: [mkUtil("a1", 300)],
        telemetryMeta: meta({}),
      }),
    );
    const table = await screen.findByRole("table", {
      name: /effectiveness scores/,
    });
    expect(
      within(table).getByRole("columnheader", { name: /AES/ }),
    ).toBeInTheDocument();
    // The evidence-confidence-gated tier renders for a well-measured asset.
    expect(within(table).getByText("exceptional")).toBeInTheDocument();
  });

  it("flags a high-AES, low-evidence asset as unverified, but not a trusted one", async () => {
    renderWith(
      emptyDataset({
        assets: [mkAsset("a-mirage", "skill"), mkAsset("a-solid", "skill")],
        utilization: [
          // 30 perfect invocations -> grade D, AES ~0.93: looks strong, unproven.
          mkUtil("a-mirage", 30),
          // 300 perfect invocations -> grade A, genuinely exceptional.
          mkUtil("a-solid", 300),
        ],
        telemetryMeta: meta({}),
      }),
    );
    const table = await screen.findByRole("table", {
      name: /effectiveness scores/,
    });
    // The mirage carries the unverified warning; the trusted grade-A asset shows
    // its real tier with no warning (getByText would throw on a second match).
    expect(within(table).getByText("unverified")).toBeInTheDocument();
    expect(within(table).getByText("exceptional")).toBeInTheDocument();
  });

  it("shows the effective-score and latency columns", async () => {
    renderWith(
      emptyDataset({
        assets: [mkAsset("a1", "skill")],
        utilization: [mkUtil("a1", 200)],
        telemetryMeta: meta({}),
      }),
    );
    const table = await screen.findByRole("table", {
      name: "Asset effectiveness scores ranked by invocations",
    });
    expect(
      within(table).getByRole("columnheader", { name: /^Effective/ }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("columnheader", { name: "Latency" }),
    ).toBeInTheDocument();
    // The latency cell renders the windowed average in whole milliseconds.
    expect(within(table).getByText("100 ms")).toBeInTheDocument();
  });

  it("labels probe-only rows and filters them with the telemetry control", async () => {
    renderWith(probeDataset());
    const table = await screen.findByRole("table", {
      name: /effectiveness scores/,
    });
    // The probe-only asset carries a "probe" label; both rows show under All.
    expect(within(table).getByText("probe")).toBeInTheDocument();
    expect(within(table).getByText("skill-a-live")).toBeInTheDocument();
    expect(within(table).getByText("skill-a-probe")).toBeInTheDocument();

    // "Live only" hides the probe-only row.
    await userEvent.click(screen.getByRole("button", { name: /Live only/ }));
    expect(within(table).getByText("skill-a-live")).toBeInTheDocument();
    expect(within(table).queryByText("skill-a-probe")).not.toBeInTheDocument();

    // "Probe only" shows just the probe-only row.
    await userEvent.click(screen.getByRole("button", { name: /Probe only/ }));
    expect(within(table).getByText("skill-a-probe")).toBeInTheDocument();
    expect(within(table).queryByText("skill-a-live")).not.toBeInTheDocument();
  });

  it("marks the probe pill as warn, matching every other amber pill in the app", async () => {
    renderWith(probeDataset());
    const table = await screen.findByRole("table", {
      name: /effectiveness scores/,
    });
    // The probe pill renders an amber tone; its severity glyph must be the warn
    // glyph, not the info-i, so it reads consistently with the "unverified"
    // amber pill and every other amber pill in the app. The expected markup is
    // taken from a reference warn Pill, not a hardcoded SVG path.
    const reference = render(<Pill severity="warn">x</Pill>);
    const warnGlyph = reference.container.querySelector("svg")?.innerHTML ?? "";
    reference.unmount();
    const probePill = within(table).getByText("probe");
    expect(probePill.querySelector("svg")?.innerHTML).toBe(warnGlyph);
  });

  it("neutralizes the success, effective, and latency cells for probe-only rows", async () => {
    renderWith(probeDataset());
    const table = await screen.findByRole("table", {
      name: /effectiveness scores/,
    });
    // The live asset keeps its real telemetry meters.
    expect(
      within(table).getByRole("progressbar", {
        name: "skill-a-live success rate",
      }),
    ).toBeInTheDocument();
    // The probe-only asset must not paint a green success or accent effective
    // meter off one synthetic call; those cells read "synthetic" instead.
    expect(
      within(table).queryByRole("progressbar", {
        name: "skill-a-probe success rate",
      }),
    ).not.toBeInTheDocument();
    expect(
      within(table).queryByRole("progressbar", {
        name: "skill-a-probe effective score",
      }),
    ).not.toBeInTheDocument();
    expect(within(table).getAllByText("synthetic").length).toBeGreaterThan(0);
  });

  it("excludes probe-only assets from the headline telemetry counts", async () => {
    renderWith(probeDataset());
    await screen.findByText("skill-a-live");
    // Effective-assets detail counts only the live asset, not the probe-only one.
    expect(screen.getByText("1 report live telemetry")).toBeInTheDocument();
    // Avg success rate reads across live assets only.
    expect(screen.getByText("across live assets")).toBeInTheDocument();
  });

  it("renders the classification census with evidence-aware counts", async () => {
    // One confidently-measured asset (200 invocations) and one with no
    // telemetry at all. The strip must mirror classificationCounts exactly, and
    // the untelemetered asset is definitionally insufficient evidence rather
    // than bucketed into a quadrant. The default range preference is pinned to
    // "all" so the page's window (null) matches the unwindowed selector call.
    setDefaultRange("all");
    try {
      const ds = emptyDataset({
        assets: [mkAsset("a1", "skill"), mkAsset("a2", "skill")],
        utilization: [mkUtil("a1", 200)],
        telemetryMeta: meta({}),
      });
      renderWith(ds);
      const counts = classificationCounts(ds);
      expect(counts.insufficientEvidence).toBe(1);
      const census = await screen.findByRole("group", {
        name: "Classification census",
      });
      for (const quadrant of [
        "Stars",
        "Risks",
        "Shelfware",
        "Dead weight",
      ] as const) {
        expect(
          within(census).getByText(new RegExp(`^${quadrant}`)),
        ).toHaveTextContent(`${quadrant} ${counts[quadrant]}`);
      }
      expect(
        within(census).getByText(/^insufficient evidence/),
      ).toHaveTextContent("insufficient evidence 1");
    } finally {
      window.localStorage.clear();
    }
  });

  it("discloses the insufficient-evidence count on the effective rate KPI", async () => {
    renderWith(probeDataset());
    await screen.findByText("skill-a-live");
    // The probe-only asset is low-evidence, so it is excluded from the rate
    // denominator and disclosed as needing more evidence rather than counted
    // against the rate as if it were ineffective.
    expect(screen.getByText(/1 need more evidence/)).toBeInTheDocument();
  });

  it("hides the telemetry control when no asset is probe-only", async () => {
    renderWith(
      emptyDataset({
        assets: [mkAsset("a1", "skill")],
        utilization: [mkUtil("a1", 200)],
        telemetryMeta: meta({}),
      }),
    );
    await screen.findByText("skill-a1");
    expect(
      screen.queryByRole("button", { name: /Probe only/ }),
    ).not.toBeInTheDocument();
  });

  it("re-sorts instantly under reduced motion with the rows still rendered", async () => {
    const restore = mockReducedMotion(true);
    try {
      renderWith(
        emptyDataset({
          // zeta has more invocations, so the default invocations sort puts it
          // first; sorting by name flips the order to alpha first.
          assets: [mkAsset("a1", "skill"), mkAsset("a2", "skill")],
          utilization: [mkUtil("a1", 50), mkUtil("a2", 300)],
          telemetryMeta: meta({}),
        }),
      );
      // Rename for a deterministic name sort.
      await screen.findByText("skill-a1");

      const table = screen.getByRole("table", {
        name: "Asset effectiveness scores ranked by invocations",
      });
      const orderBefore = within(table)
        .getAllByText(/skill-a\d/)
        .map((node) => node.textContent);
      expect(orderBefore).toEqual(["skill-a2", "skill-a1"]);

      // Sorting by name must re-rank synchronously with no Flip glide under
      // reduced motion, and every row stays in the document.
      await userEvent.click(screen.getByRole("button", { name: "Name" }));
      const orderAfter = within(table)
        .getAllByText(/skill-a\d/)
        .map((node) => node.textContent);
      expect(orderAfter).toEqual(["skill-a1", "skill-a2"]);
    } finally {
      restore();
    }
  });
});
