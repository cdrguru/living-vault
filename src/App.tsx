import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";

import { AuthPage } from "@/components/AuthPage";
import { Skeleton } from "@/dashboard/components/Skeleton";
import { DashboardLayout } from "@/dashboard/DashboardLayout";
import { VaultProvider } from "@/dashboard/VaultContext";
import { TourProvider } from "@/dashboard/tour";
import { SettingsPage } from "@/dashboard/settings/SettingsPage";
import { AssetDetailPage } from "@/dashboard/pages/AssetDetailPage";
import { CataloguePage } from "@/dashboard/pages/CataloguePage";
import { CostPage } from "@/dashboard/pages/CostPage";
import { CoveragePage } from "@/dashboard/pages/CoveragePage";
import { DependenciesPage } from "@/dashboard/pages/DependenciesPage";
import { EffectivenessPage } from "@/dashboard/pages/EffectivenessPage";
import { GovernancePage } from "@/dashboard/pages/GovernancePage";
import { ModelPage } from "@/dashboard/pages/ModelPage";
import { MonitorPage } from "@/dashboard/pages/MonitorPage";
import { NotFoundPage } from "@/dashboard/pages/NotFoundPage";
import { OverviewPage } from "@/dashboard/pages/OverviewPage";
import { SubmissionsPage } from "@/dashboard/pages/SubmissionsPage";
import { useAuth } from "@/hooks/AuthContext";

function AuthGuard({
  children,
  requireAuth,
}: {
  children: React.ReactNode;
  requireAuth: boolean;
}) {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        className="flex min-h-screen items-center justify-center p-6"
        role="status"
      >
        <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 shadow-card">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-accent to-accent-strong text-accent-fg shadow-card">
              <svg
                aria-hidden="true"
                fill="none"
                height="20"
                stroke="currentColor"
                strokeWidth="2"
                viewBox="0 0 24 24"
                width="20"
              >
                <rect height="18" rx="2" width="18" x="3" y="3" />
                <circle cx="12" cy="12" r="3.2" />
                <path
                  d="M12 3v3M12 18v3M3 12h3M18 12h3"
                  strokeLinecap="round"
                />
              </svg>
            </span>
            <div className="font-display text-lg font-semibold tracking-tight text-fg">
              The Living Vault
            </div>
          </div>
          <div className="mt-5 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-5/6" />
          </div>
          <span className="sr-only">Loading the Vault</span>
        </div>
      </div>
    );
  }

  if (requireAuth && !isAuthenticated) return <Navigate to="/auth" replace />;
  if (!requireAuth && isAuthenticated) return <Navigate to="/" replace />;

  return <>{children}</>;
}

const routerBasename =
  import.meta.env.VITE_SWA_COHOST === "true" ? "/demo" : undefined;

function App() {
  return (
    <BrowserRouter basename={routerBasename}>
      {/* ensure all new routes require auth */}
      <Routes>
        <Route
          path="/auth"
          element={
            <AuthGuard requireAuth={false}>
              <AuthPage />
            </AuthGuard>
          }
        />
        <Route
          path="/*"
          element={
            <AuthGuard requireAuth={true}>
              <VaultProvider>
                <TourProvider
                  autoStart={import.meta.env.VITE_DEMO_MODE === "true"}
                >
                  <Routes>
                    <Route element={<DashboardLayout />}>
                      <Route index element={<OverviewPage />} />
                      <Route
                        path="overview"
                        element={<Navigate to="/" replace />}
                      />
                      <Route path="catalogue" element={<CataloguePage />} />
                      <Route
                        path="effectiveness"
                        element={<EffectivenessPage />}
                      />
                      <Route path="cost" element={<CostPage />} />
                      <Route path="coverage" element={<CoveragePage />} />
                      <Route path="governance" element={<GovernancePage />} />
                      <Route
                        path="dependencies"
                        element={<DependenciesPage />}
                      />
                      <Route path="model" element={<ModelPage />} />
                      <Route path="monitor" element={<MonitorPage />} />
                      <Route path="submissions" element={<SubmissionsPage />} />
                      <Route path="settings" element={<SettingsPage />} />
                      <Route
                        path="asset/:assetId"
                        element={<AssetDetailPage />}
                      />
                      <Route path="*" element={<NotFoundPage />} />
                    </Route>
                  </Routes>
                </TourProvider>
              </VaultProvider>
            </AuthGuard>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
