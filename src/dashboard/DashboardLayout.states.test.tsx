import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";

import { stubSource } from "@/__tests__/harness";
import { seedDataset, type DataSource, type VaultDataset } from "@/data";
import { DashboardLayout } from "@/dashboard/DashboardLayout";
import { VaultProvider } from "@/dashboard/VaultContext";
import { TourProvider } from "@/dashboard/tour";
import { AuthProvider } from "@/hooks/AuthContext";
import { DemoAuthService } from "@/services/DemoAuthService";

function PageStub() {
  return <div>Dashboard content</div>;
}

/** A data source that fails the first load, then succeeds on retry so the
 * Retry button has something to recover to. */
function flakySource(): DataSource {
  let calls = 0;
  return {
    ...stubSource(),
    getDataset(): Promise<VaultDataset> {
      calls += 1;
      if (calls === 1)
        return Promise.reject(new Error("Failed to load vault data"));
      return Promise.resolve(structuredClone(seedDataset));
    },
  };
}

function renderLayout(source: DataSource) {
  return render(
    <AuthProvider authService={new DemoAuthService()}>
      <MemoryRouter initialEntries={["/"]}>
        <VaultProvider dataSource={source}>
          <TourProvider>
            <Routes>
              <Route element={<DashboardLayout />}>
                <Route path="*" element={<PageStub />} />
              </Route>
            </Routes>
          </TourProvider>
        </VaultProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("DashboardLayout degraded states", () => {
  it("shows a Retry button on the error alert that recovers via reload()", async () => {
    renderLayout(flakySource());

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Failed to load vault data");

    const retry = screen.getByRole("button", { name: "Retry" });
    await userEvent.click(retry);

    await waitFor(() => {
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });

  it("defers the palette hint while the guided tour is active", async () => {
    render(
      <AuthProvider authService={new DemoAuthService()}>
        <MemoryRouter initialEntries={["/"]}>
          <VaultProvider dataSource={flakySource()}>
            <TourProvider autoStart>
              <Routes>
                <Route element={<DashboardLayout />}>
                  <Route path="*" element={<PageStub />} />
                </Route>
              </Routes>
            </TourProvider>
          </VaultProvider>
        </MemoryRouter>
      </AuthProvider>,
    );

    await screen.findByRole("dialog", { name: "Guided tour" });
    expect(
      screen.queryByRole("button", { name: "Got it" }),
    ).not.toBeInTheDocument();
  });

  it("shows a dismissible first-run palette hint that persists once dismissed", async () => {
    const { unmount } = renderLayout(flakySource());

    const dismiss = await screen.findByRole("button", { name: "Got it" });
    expect(
      screen.getByText(/jump to any page\s+or asset/i),
    ).toBeInTheDocument();

    await userEvent.click(dismiss);
    expect(
      screen.queryByRole("button", { name: "Got it" }),
    ).not.toBeInTheDocument();

    unmount();
    renderLayout(flakySource());
    expect(
      screen.queryByRole("button", { name: "Got it" }),
    ).not.toBeInTheDocument();
  });
});
