import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ConnectionSection } from "./ConnectionSection";
import { stubSource } from "@/__tests__/harness";
import { VaultProvider } from "@/dashboard/VaultContext";
import { AuthProvider } from "@/hooks/AuthContext";
import { DemoAuthService } from "@/services/DemoAuthService";

function renderSection() {
  return render(
    <AuthProvider authService={new DemoAuthService()}>
      <MemoryRouter>
        <VaultProvider dataSource={stubSource()}>
          <ConnectionSection />
        </VaultProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("ConnectionSection live-Fabric branch", () => {
  // stubEnv is not auto-restored here (no unstubEnvs in config), so reset after
  // each test to avoid leaking the fabric mode into the rest of the suite.
  afterEach(() => vi.unstubAllEnvs());

  it("renders the telemetry wizard when VITE_RAYFIN_DATA is set", async () => {
    vi.stubEnv("VITE_RAYFIN_DATA", "true");
    renderSection();
    expect(
      await screen.findByRole("heading", { name: "Set up live telemetry" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Generate on your Mac" }),
    ).toBeInTheDocument();
  });

  it("shows the local wire-your-data panel, not the wizard, in dev mode", async () => {
    // Default vitest env: DEV true, no rayfin data -> local mode.
    renderSection();
    expect(
      await screen.findByRole("heading", { name: "Wire your real data" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Generate on your Mac" }),
    ).not.toBeInTheDocument();
  });

  it("shows the MCP connect instructions (config, run commands, tools)", async () => {
    renderSection();
    expect(
      await screen.findByRole("heading", { name: /Connect an agent \(MCP\)/i }),
    ).toBeInTheDocument();
    // The .mcp.json registration block and both run commands are present.
    expect(screen.getByText("Add to .mcp.json (stdio)")).toBeInTheDocument();
    expect(screen.getByText(/Run the MCP over HTTP/)).toBeInTheDocument();
    expect(screen.getByLabelText("Copy: npm run mcp")).toBeInTheDocument();
    // The tool surface is named so an agent author knows what to call.
    expect(screen.getByText(/list_filters/)).toBeInTheDocument();
  });
});
