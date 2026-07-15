import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it } from "vitest";

import { SettingsPage } from "./SettingsPage";
import { stubSource } from "@/__tests__/harness";
import { VaultProvider } from "@/dashboard/VaultContext";
import { TourProvider } from "@/dashboard/tour";
import { AuthProvider } from "@/hooks/AuthContext";
import { DemoAuthService } from "@/services/DemoAuthService";

function renderSettings() {
  return render(
    <AuthProvider authService={new DemoAuthService()}>
      <MemoryRouter initialEntries={["/settings"]}>
        <VaultProvider dataSource={stubSource()}>
          <TourProvider>
            <SettingsPage />
          </TourProvider>
        </VaultProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => localStorage.clear());

  it("renders all four sections and the on-this-page rail", async () => {
    renderSettings();
    expect(
      await screen.findByRole("heading", { name: "Connection & data" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Preferences" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Help & glossary" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Maintenance" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("navigation", { name: "Settings sections" }),
    ).toBeInTheDocument();
  });

  it("shows the local wire-your-data guidance with a copyable collector command", async () => {
    // Under vitest, import.meta.env.DEV is true and demo mode is off, so the
    // Connection section resolves to local-dev mode.
    renderSettings();
    expect(
      await screen.findByRole("heading", { name: "Wire your real data" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/node scripts\/vault-telemetry\.mjs/),
    ).toBeInTheDocument();
  });

  it("centralizes the glossary and quadrant model", async () => {
    renderSettings();
    expect(await screen.findByText("Governed score")).toBeInTheDocument();
    expect(screen.getByText("Stars")).toBeInTheDocument();
  });

  it("links each page guide entry to its route", async () => {
    renderSettings();
    const link = await screen.findByRole("link", { name: "Cost" });
    expect(link).toHaveAttribute("href", "/cost");
  });

  it("requires confirmation before resetting to seed", async () => {
    renderSettings();
    const trigger = await screen.findByRole("button", {
      name: "Reset to seed",
    });
    await userEvent.click(trigger);

    const confirm = screen.getByRole("button", { name: "Confirm" });
    expect(confirm).toBeInTheDocument();
    await userEvent.click(confirm);

    expect(
      await screen.findByText("Reset to the seed dataset."),
    ).toBeInTheDocument();
  });
});
