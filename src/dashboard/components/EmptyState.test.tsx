import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { EmptyState } from "./EmptyState";

describe("EmptyState", () => {
  it("renders the children copy with the default box icon", () => {
    const { getByText, container } = render(
      <EmptyState>Nothing here yet.</EmptyState>,
    );
    expect(getByText("Nothing here yet.")).toBeTruthy();
    // The default glyph is the only svg when no override is supplied.
    expect(container.querySelectorAll("svg").length).toBe(1);
  });

  it("shows an optional title and action when supplied", () => {
    const { getByText, getByRole } = render(
      <EmptyState
        action={<button type="button">Clear filters</button>}
        title="No matches"
      >
        Adjust the filters.
      </EmptyState>,
    );
    expect(getByText("No matches")).toBeTruthy();
    expect(getByRole("button", { name: "Clear filters" })).toBeTruthy();
  });

  it("replaces the default icon when an override is given", () => {
    const { container } = render(
      <EmptyState icon={<svg data-testid="custom" />}>
        Custom state.
      </EmptyState>,
    );
    expect(container.querySelector('[data-testid="custom"]')).not.toBeNull();
    // Only the override svg renders, not the default box glyph.
    expect(container.querySelectorAll("svg").length).toBe(1);
  });
});
