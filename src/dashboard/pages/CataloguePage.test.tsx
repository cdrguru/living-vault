import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { renderInDashboard, renderWithVault } from "@/__tests__/harness";
import { seedDataset, type AssetRow, type VaultDataset } from "@/data";
import { Pill, type PillSeverity } from "@/dashboard/components/Pill";
import { CataloguePage } from "@/dashboard/pages/CataloguePage";

/**
 * A dataset whose first asset carries the scope status "project-specific". Used
 * to assert that the catalogue separates the scope marker from the lifecycle.
 */
function scopedDataset(): VaultDataset {
  const dataset = structuredClone(seedDataset);
  dataset.assets[0] = { ...dataset.assets[0], status: "project-specific" };
  return dataset;
}

/** A dataset whose first asset carries the given lifecycle status. */
function datasetWithStatus(status: AssetRow["status"]): VaultDataset {
  const dataset = structuredClone(seedDataset);
  dataset.assets[0] = { ...dataset.assets[0], status };
  return dataset;
}

/**
 * Renders a reference Pill at the given severity and returns its glyph markup,
 * so page tests can assert "this pill reads as danger/neutral" against the
 * component's own artwork instead of a hardcoded SVG path.
 */
function glyphOf(severity: PillSeverity): string {
  const { container, unmount } = render(<Pill severity={severity}>x</Pill>);
  const markup = container.querySelector("svg")?.innerHTML ?? "";
  unmount();
  return markup;
}

describe("CataloguePage", () => {
  it("renders a compact mobile asset catalogue alongside the desktop data table", async () => {
    renderWithVault(<CataloguePage />);

    expect(
      await screen.findByRole("table", { name: "Agentic asset library" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("list", { name: "Mobile asset catalogue" }),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole("link", { name: seedDataset.assets[0].name })[0],
    ).toHaveAttribute("href", `/asset/${seedDataset.assets[0].id}`);
  });

  it("shows an Add asset empty state when the Vault holds no assets", async () => {
    const empty: VaultDataset = { ...structuredClone(seedDataset), assets: [] };
    renderWithVault(<CataloguePage />, empty);

    expect(await screen.findByText("The Vault is empty")).toBeInTheDocument();
    // Two Add asset buttons exist: the form submit and the empty-state action.
    // The empty-state action is last in DOM order and focuses the name field.
    const addButtons = screen.getAllByRole("button", { name: "Add asset" });
    await userEvent.click(addButtons[addButtons.length - 1]);
    expect(screen.getByLabelText("Name")).toHaveFocus();
  });

  it("offers Clear filters when a search matches nothing and recovers the list", async () => {
    renderInDashboard(<CataloguePage />, "/catalogue");

    const search = await screen.findByRole("searchbox", {
      name: "Search assets",
    });
    await userEvent.type(search, "zzzznomatchzzzz");

    expect(await screen.findByText("No matches")).toBeInTheDocument();
    await userEvent.click(
      screen.getByRole("button", { name: "Clear filters" }),
    );

    expect(
      await screen.findByRole("table", { name: "Agentic asset library" }),
    ).toBeInTheDocument();
    expect((search as HTMLInputElement).value).toBe("");
  });

  it("exposes a per-column header funnel that filters the table", async () => {
    renderWithVault(<CataloguePage />);
    await screen.findByRole("table", { name: "Agentic asset library" });

    // Every filterable column carries a funnel trigger.
    expect(
      screen.getByRole("button", { name: /filter by asset/i }),
    ).toBeInTheDocument();
    const typeFunnel = screen.getByRole("button", { name: /filter by type/i });

    await userEvent.click(typeFunnel);
    // Narrow to a single type by checking its option in the funnel checklist.
    await userEvent.click(screen.getAllByRole("checkbox")[0]);

    // The header count switches to the "shown of total" form once a column filter is active.
    expect(
      (await screen.findAllByText(/of \d+ assets/i)).length,
    ).toBeGreaterThan(0);
  });

  it("shows a project-specific asset with a lifecycle Status pill and a separate Scope cell", async () => {
    const dataset = scopedDataset();
    renderWithVault(<CataloguePage />, dataset);

    const table = await screen.findByRole("table", {
      name: "Agentic asset library",
    });
    // The row for the scoped asset carries the lifecycle stage (active, since a
    // scope marker is implied-live) and the scope marker, in two distinct cells.
    const link = within(table).getAllByRole("link", {
      name: dataset.assets[0].name,
    })[0];
    const row = link.closest("tr") as HTMLElement;
    const cells = within(row).getAllByRole("cell");
    const statusCell = cells.find((cell) => within(cell).queryByText("active"));
    const scopeCell = cells.find((cell) =>
      within(cell).queryByText("project-specific"),
    );
    expect(statusCell).toBeDefined();
    expect(scopeCell).toBeDefined();
    expect(statusCell).not.toBe(scopeCell);
    // The status cell must NOT hold the scope marker (the two are split).
    expect(
      within(statusCell as HTMLElement).queryByText("project-specific"),
    ).not.toBeInTheDocument();
  });

  it("reads a deprecated asset's status pill as a danger warning", async () => {
    const dataset = datasetWithStatus("deprecated");
    renderWithVault(<CataloguePage />, dataset);

    const table = await screen.findByRole("table", {
      name: "Agentic asset library",
    });
    const link = within(table).getAllByRole("link", {
      name: dataset.assets[0].name,
    })[0];
    const row = link.closest("tr") as HTMLElement;
    // Deprecated is a discouraged, on-its-way-out warning: a red tone paired with
    // the danger octagon so color and shape agree (WCAG 1.4.1).
    const statusPill = within(row).getByText("deprecated");
    expect(statusPill.querySelector("svg")?.innerHTML).toBe(glyphOf("danger"));
  });

  it("reads a retired asset's status pill as inert, not an alarm", async () => {
    const dataset = datasetWithStatus("retired");
    renderWithVault(<CataloguePage />, dataset);

    const table = await screen.findByRole("table", {
      name: "Agentic asset library",
    });
    const link = within(table).getAllByRole("link", {
      name: dataset.assets[0].name,
    })[0];
    const row = link.closest("tr") as HTMLElement;
    // Retired is end of life, not danger: a slate tone paired with the neutral dot,
    // so it stays visually distinct from the deprecated warning above.
    const statusPill = within(row).getByText("retired");
    expect(statusPill.querySelector("svg")?.innerHTML).toBe(glyphOf("neutral"));
  });

  it("offers scope values on the Scope filter, not the Status filter", async () => {
    renderWithVault(<CataloguePage />, scopedDataset());
    await screen.findByRole("table", { name: "Agentic asset library" });

    // The Status funnel offers only lifecycle stages, never scope markers.
    await userEvent.click(
      screen.getByRole("button", { name: /filter by status/i }),
    );
    expect(
      screen.queryByRole("checkbox", { name: /plugin-managed/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("checkbox", { name: /project-specific/i }),
    ).not.toBeInTheDocument();
    // Close the status funnel before opening the scope funnel.
    await userEvent.click(
      screen.getByRole("button", { name: /filter by status/i }),
    );

    // The Scope funnel offers the scope markers.
    await userEvent.click(
      screen.getByRole("button", { name: /filter by scope/i }),
    );
    expect(
      screen.getByRole("checkbox", { name: /project-specific/i }),
    ).toBeInTheDocument();
  });
});

describe("CataloguePage Add asset form states", () => {
  it("lands on the list with the form closed and opens it on demand", async () => {
    renderWithVault(<CataloguePage />);

    // Browse-first: the catalogue table shows and the form is not mounted yet.
    expect(
      await screen.findByRole("table", { name: "Agentic asset library" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Add asset form fields" }),
    ).not.toBeInTheDocument();

    // Opening it from the header reveals the fields and both header controls.
    await userEvent.click(screen.getByRole("button", { name: "Add asset" }));
    expect(
      screen.getByRole("group", { name: "Add asset form fields" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Minimize Add asset form" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Close Add asset form" }),
    ).toBeInTheDocument();
  });

  it("minimizes to the header bar and restores from the expand control", async () => {
    renderWithVault(<CataloguePage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Add asset" }),
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Minimize Add asset form" }),
    );

    // The fields collapse out of the accessibility tree, but the header stays.
    expect(
      screen.queryByRole("group", { name: "Add asset form fields" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Add asset" }),
    ).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Expand Add asset form" }),
    );
    expect(
      screen.getByRole("group", { name: "Add asset form fields" }),
    ).toBeInTheDocument();
  });

  it("closes the form entirely and reopens it from the catalogue header", async () => {
    renderWithVault(<CataloguePage />);
    await userEvent.click(
      await screen.findByRole("button", { name: "Add asset" }),
    );
    expect(screen.getByLabelText("Name")).toBeInTheDocument();

    await userEvent.click(
      screen.getByRole("button", { name: "Close Add asset form" }),
    );
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Minimize Add asset form" }),
    ).not.toBeInTheDocument();

    // The only remaining "Add asset" button is the reopen affordance.
    await userEvent.click(screen.getByRole("button", { name: "Add asset" }));
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("reveals the form to edit from the closed list view", async () => {
    renderWithVault(<CataloguePage />);
    // The form starts closed, so no Name field is mounted on the list view.
    expect(
      await screen.findByRole("table", { name: "Agentic asset library" }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText("Name")).not.toBeInTheDocument();

    const [firstEdit] = screen.getAllByRole("button", { name: /^Edit / });
    await userEvent.click(firstEdit);

    expect(screen.getByLabelText("Name")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Edit asset" }),
    ).toBeInTheDocument();
  });
});
