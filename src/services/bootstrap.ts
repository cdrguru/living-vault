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
let cachedAuthService: IAuthService | null = null;

/**
 * Read VITE_* env vars, initialize the Rayfin client, and return the right
 * auth service for the target backend. Memoized: the client is initialized once.
 * (This is the public build of this file: the self-host SelfHostAuthService
 * branch exists only in the private repo.)
 *
 * - Localhost API URL -> {@link MockAuthService}
 * - Anything else     -> {@link RayfinAuthService} (requires VITE_FABRIC_* vars)
 */
export function bootstrapAuth(): IAuthService {
  if (cachedAuthService) return cachedAuthService;
  cachedAuthService = createAuthService();
  return cachedAuthService;
}

function createAuthService(): IAuthService {
  const demoMode =
    (import.meta.env.DEV &&
      import.meta.env.VITE_FORCE_FABRIC_AUTH !== "true") ||
    import.meta.env.VITE_DEMO_MODE === "true";
  if (demoMode) return new DemoAuthService();

  const apiUrl = import.meta.env.VITE_RAYFIN_API_URL || "http://localhost:5168";
  const localDev = isLocalBackendUrl(apiUrl);
  const publishableKey = import.meta.env.VITE_RAYFIN_PUBLISHABLE_KEY;

  if (!publishableKey && !localDev) {
    throw new Error(
      "VITE_RAYFIN_PUBLISHABLE_KEY environment variable is required",
    );
  }

  const client = initRayfinClient({
    baseUrl: apiUrl.endsWith("/") ? apiUrl : `${apiUrl}/`,
    publishableKey: publishableKey ?? "local-dev-key",
    localDev,
  });

  if (localDev) {
    return new MockAuthService(client);
  }

  const workspaceId = import.meta.env.VITE_FABRIC_WORKSPACE_ID;
  const projectId = import.meta.env.VITE_FABRIC_ITEM_ID;
  const fabricPortalUrl = import.meta.env.VITE_FABRIC_PORTAL_URL;

  if (!workspaceId || !projectId || !fabricPortalUrl) {
    throw new Error(
      "Missing required Fabric config. Set VITE_FABRIC_WORKSPACE_ID, VITE_FABRIC_ITEM_ID, and VITE_FABRIC_PORTAL_URL.",
    );
  }

  return new RayfinAuthService(client, {
    workspaceId,
    projectId,
    fabricPortalUrl,
    returnOrigin: window.location.origin,
  });
}
