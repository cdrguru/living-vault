import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";

import { CommandPalette } from "./CommandPalette";
import { renderWithVault } from "@/__tests__/harness";

function open() {
  return renderWithVault(<CommandPalette onClose={() => {}} open />);
}

describe("CommandPalette", () => {
  it("renders a footer key legend with move, run, and close keys", () => {
    open();
    const dialog = screen.getByRole("dialog", { name: "Command palette" });
    expect(dialog).toHaveTextContent("move");
    expect(dialog).toHaveTextContent("run");
    expect(dialog).toHaveTextContent("close");
  });

  it("opens a Keyboard shortcuts sheet listing the model-canvas keys", async () => {
    open();
    await userEvent.click(
      screen.getByRole("option", { name: /Keyboard shortcuts/ }),
    );
    expect(screen.getByText("Model canvas")).toBeInTheDocument();
    expect(screen.getByText("Open the inspector")).toBeInTheDocument();
    expect(screen.getByText("Pan the canvas")).toBeInTheDocument();
  });

  it("renders nothing when closed", () => {
    renderWithVault(<CommandPalette onClose={() => {}} open={false} />);
    expect(
      screen.queryByRole("dialog", { name: "Command palette" }),
    ).not.toBeInTheDocument();
  });
});
