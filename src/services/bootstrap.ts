import { resolveRayfinConfig } from "@microsoft/rayfin-client";

import type { IAuthService } from "./IAuthService";
import { DemoAuthService } from "./DemoAuthService";
import { MockAuthService } from "./MockAuthService";
import { RayfinAuthService } from "./RayfinAuthService";
import { initRayfinClient } from "./rayfinClient";

function isLocalBackendUrl(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === "localhost" || hostname === "127.0.0.1";
  } catch {
    return false;
  }
}

// bootstrapAuth initializes a process-global Rayfin client (initRayfinClient
// throws if called twice), so the auth service is a singleton. Memoize it so
// later callers (e.g. the RayfinDataSource review guard resolving the current
// user) reuse the same service instead of re-initializing the client and
// throwing "Rayfin client is already initialized."
let cachedAuthService: Promise<IAuthService> | null = null;

/**
 * Read VITE_* env vars, initialize the Rayfin client, and return the right
 * auth service for the target backend. Memoized: the client is initialized once.
 * (This is the public build of this file: the self-host SelfHostAuthService
 * branch exists only in the private repo.)
 *
 * - Localhost API URL -> {@link MockAuthService}
 * - Anything else     -> {@link RayfinAuthService} (requires VITE_FABRIC_* vars)
 */
export function bootstrapAuth(): Promise<IAuthService> {
  if (cachedAuthService) return cachedAuthService;
  cachedAuthService = createAuthService().catch((error: unknown) => {
    cachedAuthService = null;
    throw error;
  });
  return cachedAuthService;
}

async function createAuthService(): Promise<IAuthService> {
  const demoMode =
    (import.meta.env.DEV &&
      import.meta.env.VITE_FORCE_FABRIC_AUTH !== "true") ||
    import.meta.env.VITE_DEMO_MODE === "true";
  if (demoMode) return new DemoAuthService();

  const { baseUrl, publishableKey, runtimeConfig } = await resolveRayfinConfig({
    apiUrl: import.meta.env.VITE_RAYFIN_API_URL ||
      (isLocalBackendUrl(window.location.origin) ? "http://localhost:5168" : undefined),
    publishableKey: import.meta.env.VITE_RAYFIN_PUBLISHABLE_KEY,
    workspaceId: import.meta.env.VITE_FABRIC_WORKSPACE_ID,
    itemId: import.meta.env.VITE_FABRIC_ITEM_ID,
    portalUrl: import.meta.env.VITE_FABRIC_PORTAL_URL,
    tenantId: import.meta.env.VITE_FABRIC_TENANT_ID,
  });
  if (!baseUrl) throw new Error("Missing Rayfin API URL in runtime configuration.");
  const localDev = isLocalBackendUrl(baseUrl);
  const { workspaceId, itemId: projectId, portalUrl: fabricPortalUrl } = runtimeConfig;

  if (localDev) {
    const client = initRayfinClient({
      baseUrl, publishableKey: publishableKey ?? "local-dev-key", runtimeConfig,
    }, true);
    return new MockAuthService(client);
  }
  if (!publishableKey || !workspaceId || !projectId || !fabricPortalUrl) {
    throw new Error("Missing Fabric publishable key, workspace, item, or portal URL in runtime configuration.");
  }
  const client = initRayfinClient({ baseUrl, publishableKey, runtimeConfig }, false);
  return new RayfinAuthService(client, {
    workspaceId,
    projectId,
    fabricPortalUrl,
    tenantId: runtimeConfig.tenantId,
    returnOrigin: window.location.origin,
  });
}
