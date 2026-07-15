import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { stubSource } from "@/__tests__/harness";
import { seedDataset } from "@/data";
import { VaultProvider } from "@/dashboard/VaultContext";
import { ModelPage } from "@/dashboard/pages/ModelPage";

function renderPage() {
  return render(
    <MemoryRouter>
      <VaultProvider
        dataSource={{
          ...stubSource(),
          // The original stub returned a fresh clone per call; keep that.
          getDataset: () => Promise.resolve(structuredClone(seedDataset)),
        }}
      >
        <ModelPage />
      </VaultProvider>
    </MemoryRouter>,
  );
}

async function findCards() {
  return screen.findAllByRole("button", { name: / table, \d+ rows$/ });
}

describe("ModelPage", () => {
  beforeEach(() => localStorage.clear());

  it("renders 6 table cards collapsed and 9 when joins are shown", async () => {
    renderPage();
    expect(await findCards()).toHaveLength(6);
    await userEvent.click(
      screen.getByRole("switch", { name: "Show join tables" }),
    );
    expect(await findCards()).toHaveLength(9);
  });

  it("shows live counts on the Asset hub card", async () => {
    renderPage();
    expect(
      await screen.findByRole("button", {
        name: `Asset table, ${seedDataset.assets.length} rows`,
      }),
    ).toBeInTheDocument();
  });

  it("renders a canvas search input that flies to a match", async () => {
    renderPage();
    await findCards();
    const box = screen.getByRole("searchbox", { name: "Search the canvas" });
    await userEvent.type(box, "Owner{Enter}");
    expect(box).toHaveValue("Owner");
  });

  it("fits the graph to view from the zoom controls without errors", async () => {
    renderPage();
    await findCards();
    // Fit lives only in the zoom pill now; the duplicate top-toolbar button is
    // gone.
    expect(
      screen.queryByRole("button", { name: "Fit to view" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Zoom to fit" }));
    expect(await findCards()).toHaveLength(6);
  });

  it("labels the time scrubber as scoping Asset health", async () => {
    renderPage();
    await findCards();
    expect(screen.getByText("Asset health")).toBeInTheDocument();
  });

  it("tints the Asset hub with a health status only when the Health view is on", async () => {
    renderPage();
    await findCards();
    expect(
      screen.queryByText(/^(Healthy|Attention|At risk)$/),
    ).not.toBeInTheDocument();
    const healthSwitch = screen.getByRole("switch", { name: "Health view" });
    expect(healthSwitch).toHaveAttribute("aria-checked", "false");
    await userEvent.click(healthSwitch);
    expect(healthSwitch).toHaveAttribute("aria-checked", "true");
    // The seed carries telemetry, so the hub resolves to a measured status.
    expect(
      screen.getByText(/^(Healthy|Attention|At risk)$/),
    ).toBeInTheDocument();
  });

  it("shows a one-time canvas coachmark that dismisses", async () => {
    renderPage();
    await findCards();
    expect(screen.getByText(/Drag to pan/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Got it" }));
    expect(screen.queryByText(/Drag to pan/)).not.toBeInTheDocument();
  });

  it("keeps the coachmark dismissed on a return visit", async () => {
    localStorage.setItem("living-vault:model-coach-seen", "1");
    renderPage();
    await findCards();
    expect(screen.queryByText(/Drag to pan/)).not.toBeInTheDocument();
  });

  it("scrubs the utilization window", async () => {
    renderPage();
    await findCards();
    expect(screen.getByText(/Full window through/)).toBeInTheDocument();
    const slider = screen.getByRole("slider", {
      name: "Scrub the utilization window",
    });
    fireEvent.change(slider, { target: { value: "0" } });
    expect(
      screen.getByText(/\d{4}-\d{2}-\d{2} to \d{4}-\d{2}-\d{2}/),
    ).toBeInTheDocument();
  });

  it("shows operational signal on the Asset hub card", async () => {
    renderPage();
    await findCards();
    expect(
      await screen.findByRole("img", { name: /invocations/ }),
    ).toBeInTheDocument();
    expect(screen.getByText(/^Gov \d+%$/)).toBeInTheDocument();
  });

  it("opens the explorer panel when a card is clicked and closes on Escape", async () => {
    renderPage();
    const cards = await findCards();
    await userEvent.click(
      cards.find((card) =>
        card.getAttribute("aria-label")!.startsWith("Asset"),
      )!,
    );
    expect(
      await screen.findByRole("complementary", { name: "Model explorer" }),
    ).toBeInTheDocument();
    await userEvent.keyboard("{Escape}");
    expect(
      screen.queryByRole("complementary", { name: "Model explorer" }),
    ).not.toBeInTheDocument();
  });

  it("opens the relationship view from a via pill", async () => {
    renderPage();
    await findCards();
    await userEvent.click(
      screen.getByRole("button", { name: "*:* via AssetTag" }),
    );
    const panel = await screen.findByRole("complementary", {
      name: "Model explorer",
    });
    expect(panel).toHaveTextContent("Asset to Tag");
  });

  it("renders the zoom readout, minimap, legend, and sr-only relationship list", async () => {
    renderPage();
    await findCards();
    expect(screen.getByText(/^\d+%$/)).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Minimap" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Legend" })).toBeInTheDocument();
    expect(
      screen.getAllByText(/AssetDependency is a self relationship/).length,
    ).toBeGreaterThan(0);
  });

  it("shows the legend by default on the first visit, then toggles", async () => {
    renderPage();
    await findCards();
    const legendButton = screen.getByRole("button", { name: "Legend" });
    // First visit (cleared storage): the key is open so the diagram is legible
    // without a click.
    expect(legendButton).toHaveAttribute("aria-expanded", "true");
    expect(
      screen.getByText("Many to many through a join table"),
    ).toBeInTheDocument();
    await userEvent.click(legendButton);
    expect(legendButton).toHaveAttribute("aria-expanded", "false");
    expect(
      screen.queryByText("Many to many through a join table"),
    ).not.toBeInTheDocument();
  });

  it("keeps the legend closed on a return visit", async () => {
    localStorage.setItem("living-vault:model-legend-seen", "1");
    renderPage();
    await findCards();
    expect(screen.getByRole("button", { name: "Legend" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(
      screen.queryByText("Many to many through a join table"),
    ).not.toBeInTheDocument();
  });

  it("renders a compact model table list for small screens", async () => {
    renderPage();
    await findCards();
    const list = screen.getByRole("list", { name: "Model tables" });
    expect(list).toHaveTextContent(`Asset${seedDataset.assets.length}`);
    expect(list).toHaveTextContent("Owner");
    expect(
      screen.getByText("Map view remains available below for spatial context."),
    ).toBeInTheDocument();
  });

  it("renders the three join-table cards once joins are shown", async () => {
    renderPage();
    await findCards();
    // Collapsed: no join cards yet.
    expect(
      screen.queryByRole("button", { name: /^AssetTag table, / }),
    ).not.toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("switch", { name: "Show join tables" }),
    );
    for (const name of ["AssetTag", "BundleMembership", "AssetDependency"]) {
      expect(
        await screen.findByRole("button", {
          name: new RegExp(`^${name} table, \\d+ rows$`),
        }),
      ).toBeInTheDocument();
    }
  });

  it("renders every join card after toggling even when a stale stored layout omits the join keys", async () => {
    // A stale expanded layout that predates the join cards: it carries only the
    // entity positions. loadLayout backfills the missing join keys from the
    // defaults, so all three join cards still render after the toggle.
    localStorage.setItem(
      "vault.model.layout.v1",
      JSON.stringify({
        expanded: {
          Asset: { x: 430, y: 270 },
          Owner: { x: 60, y: 200 },
        },
      }),
    );
    renderPage();
    await findCards();
    await userEvent.click(
      screen.getByRole("switch", { name: "Show join tables" }),
    );
    for (const name of ["AssetTag", "BundleMembership", "AssetDependency"]) {
      expect(
        await screen.findByRole("button", {
          name: new RegExp(`^${name} table, \\d+ rows$`),
        }),
      ).toBeInTheDocument();
    }
    expect(await findCards()).toHaveLength(9);
  });

  it("moves the zoom pill aside while the panel is open and resets layout without errors", async () => {
    renderPage();
    const cards = await findCards();
    const zoomOut = screen.getByRole("button", { name: "Zoom out" });
    const closedPosition = zoomOut.parentElement!.className;
    await userEvent.click(
      cards.find((card) =>
        card.getAttribute("aria-label")!.startsWith("Asset"),
      )!,
    );
    await screen.findByRole("complementary", { name: "Model explorer" });
    // The pill repositions so the explorer panel does not cover it; the exact
    // offsets are the component's business.
    expect(zoomOut.parentElement!.className).not.toBe(closedPosition);
    await userEvent.click(screen.getByRole("button", { name: "Reset layout" }));
    expect(await findCards()).toHaveLength(6);
  });
});
