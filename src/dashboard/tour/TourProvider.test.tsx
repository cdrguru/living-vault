import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { render } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { TourOverlay } from "./TourOverlay";
import { TourProvider, useTour } from "./TourProvider";
import { TOUR_STEPS } from "./steps";

function Probe() {
  const { pathname } = useLocation();
  const { start } = useTour();
  return (
    <div>
      <div data-testid="path">{pathname}</div>
      <button onClick={start} type="button">
        start tour
      </button>
    </div>
  );
}

function renderTour() {
  return render(
    <MemoryRouter initialEntries={["/"]}>
      <TourProvider>
        <Probe />
        <TourOverlay />
      </TourProvider>
    </MemoryRouter>,
  );
}

describe("guided tour", () => {
  beforeEach(() => localStorage.clear());

  it("starts hidden and shows the first step on demand", async () => {
    renderTour();
    expect(screen.queryByRole("dialog", { name: "Guided tour" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "start tour" }));

    expect(screen.getByRole("dialog", { name: "Guided tour" })).toBeInTheDocument();
    expect(screen.getByText(TOUR_STEPS[0].title)).toBeInTheDocument();
    expect(screen.getByText("1 / " + TOUR_STEPS.length)).toBeInTheDocument();
  });

  it("navigates to each step's route as it advances", async () => {
    renderTour();
    await userEvent.click(screen.getByRole("button", { name: "start tour" }));

    // Advance to the monitor step (the first hero surface) and confirm the
    // router followed. Monitor is the hero "lead with proof" stop after the two
    // Overview intro steps.
    const monitorIndex = TOUR_STEPS.findIndex((s) => s.route === "/monitor");
    for (let i = 0; i < monitorIndex; i += 1) {
      await userEvent.click(screen.getByRole("button", { name: "Next" }));
    }
    expect(screen.getByTestId("path")).toHaveTextContent("/monitor");
  });

  it("closes and records completion when skipped", async () => {
    renderTour();
    await userEvent.click(screen.getByRole("button", { name: "start tour" }));
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));

    expect(screen.queryByRole("dialog", { name: "Guided tour" })).not.toBeInTheDocument();
    expect(localStorage.getItem("living-vault:tour-complete")).toBe("1");
  });
});
