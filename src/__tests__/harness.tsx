import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { render } from "@testing-library/react";

import { seedDataset, type DataSource, type VaultDataset } from "@/data";
import { DashboardLayout } from "@/dashboard/DashboardLayout";
import { VaultProvider } from "@/dashboard/VaultContext";
import { TourProvider } from "@/dashboard/tour";
import { AuthProvider } from "@/hooks/AuthContext";
import { DemoAuthService } from "@/services/DemoAuthService";

export function stubSource(
  dataset: VaultDataset = structuredClone(seedDataset),
): DataSource {
  const unsupported = () => Promise.reject(new Error("not supported in test"));
  return {
    getDataset: () => Promise.resolve(dataset),
    reset: () => Promise.resolve(),
    addAsset: unsupported,
    updateAsset: unsupported,
    retireAsset: unsupported,
    deleteAsset: unsupported,
    importProjection: unsupported,
    importTelemetry: unsupported,
    importEvalResults: unsupported,
    importRoutingStats: unsupported,
    recordIntervention: unsupported,
    getUnattributedUsage: () => [],
    getHarnessUsage: () => [],
    submitProjection: unsupported,
    listSubmissions: () => Promise.resolve([]),
    getSubmission: unsupported,
    decideSubmission: unsupported,
    transitionSubmission: unsupported,
  };
}

export function renderWithVault(
  ui: ReactElement,
  dataset = structuredClone(seedDataset),
) {
  return render(
    <MemoryRouter>
      <VaultProvider dataSource={stubSource(dataset)}>
        <TourProvider>{ui}</TourProvider>
      </VaultProvider>
    </MemoryRouter>,
  );
}

export function renderInDashboard(
  ui: ReactElement,
  route = "/",
  dataset = structuredClone(seedDataset),
) {
  return render(
    <AuthProvider authService={new DemoAuthService()}>
      <MemoryRouter initialEntries={[route]}>
        <VaultProvider dataSource={stubSource(dataset)}>
          <TourProvider>
            <Routes>
              <Route element={<DashboardLayout />}>
                <Route path="*" element={ui} />
              </Route>
            </Routes>
          </TourProvider>
        </VaultProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}
