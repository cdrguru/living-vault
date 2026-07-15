import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { DataTable } from "./DataTable";

describe("DataTable", () => {
  it("exposes the horizontal-scroll wrapper as a focusable, named region", () => {
    render(
      <DataTable caption="Sample library">
        <thead>
          <tr>
            <th scope="col">Name</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Row</td>
          </tr>
        </tbody>
      </DataTable>,
    );

    // The overflow wrapper is a labelled region so the overflow is discoverable
    // and keyboard-reachable; its name defaults to the caption.
    const region = screen.getByRole("region", { name: "Sample library" });
    expect(region).toBeInTheDocument();
    expect(region).toHaveAttribute("tabindex", "0");
    expect(region.className).toContain("overflow-x-auto");
  });

  it("uses scrollRegionLabel for the region name when provided", () => {
    render(
      <DataTable caption="Sample library" scrollRegionLabel="Scroll the ranking">
        <thead>
          <tr>
            <th scope="col">Name</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Row</td>
          </tr>
        </tbody>
      </DataTable>,
    );

    expect(
      screen.getByRole("region", { name: "Scroll the ranking" }),
    ).toBeInTheDocument();
  });
});
