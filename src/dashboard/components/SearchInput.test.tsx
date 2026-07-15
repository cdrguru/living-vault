import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { SearchInput } from "@/dashboard/components/SearchInput";

/** A stateful wrapper so the controlled SearchInput behaves like a real caller. */
function Harness() {
  const [value, setValue] = useState("");
  return (
    <SearchInput label="Search assets" onChange={setValue} value={value} />
  );
}

describe("SearchInput", () => {
  it("returns focus to the input after the clear button is used", async () => {
    render(<Harness />);
    const input = screen.getByRole("searchbox", { name: "Search assets" });
    await userEvent.type(input, "abc");

    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));

    // The clear button unmounts on clear; focus must land back on the field,
    // not fall to the document body.
    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });

  it("clears the query on Escape without leaving the field", async () => {
    render(<Harness />);
    const input = screen.getByRole("searchbox", { name: "Search assets" });
    await userEvent.type(input, "abc");

    await userEvent.keyboard("{Escape}");

    expect(input).toHaveValue("");
    expect(input).toHaveFocus();
  });
});
