// src/dashboard/components/InfoTooltip.test.tsx
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { InfoTooltip } from "./InfoTooltip";

describe("InfoTooltip", () => {
  it("renders a labeled trigger described by the tooltip", () => {
    const { getByRole } = render(
      <InfoTooltip label="What this measures and how to read it." />,
    );
    const trigger = getByRole("button", { name: "What this measures" });
    const tip = getByRole("tooltip");
    expect(trigger.getAttribute("aria-describedby")).toBe(tip.getAttribute("id"));
    expect(tip.textContent).toBe("What this measures and how to read it.");
  });

  it("uses a custom trigger label when provided", () => {
    const { getByRole } = render(
      <InfoTooltip label="x" triggerLabel="About errors" />,
    );
    expect(getByRole("button", { name: "About errors" })).toBeTruthy();
  });

  it("blurs the trigger on Escape so the tooltip dismisses", () => {
    const { getByRole } = render(<InfoTooltip label="x" />);
    const trigger = getByRole("button") as HTMLButtonElement;
    trigger.focus();
    expect(document.activeElement).toBe(trigger);
    fireEvent.keyDown(trigger, { key: "Escape" });
    expect(document.activeElement).not.toBe(trigger);
  });
});
