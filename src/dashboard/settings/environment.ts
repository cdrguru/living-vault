import type { PillSeverity, PillTone } from "@/dashboard/components/Pill";
import { isProbeUtilization, type VaultDataset } from "@/data";

/**
 * The build-time and runtime signals that decide how the app is wired. Kept as a
 * plain object so the derivation is a pure function testable without touching
 * import.meta. The Settings page reads these from import.meta.env at the call
 * site and passes them in.
 */
export interface EnvInput {
  /** Vite dev server (npx vite). True locally, false in any production build. */
  dev: boolean;
  /** VITE_DEMO_MODE: the synthetic showcase build (build:swa). */
  demoMode: boolean;
  /** VITE_RAYFIN_DATA: read the live Fabric backend instead of seed data. */
  rayfinData: boolean;
  /** Whether the VITE_FABRIC_* config needed for Fabric SSO is present. */
  fabricConfigured: boolean;
}

export type EnvironmentMode = "local" | "demo" | "fabric";

export type TelemetryState = "live" | "demo" | "probe" | "none";

export interface EnvironmentField {
  value: string;
  tone: PillTone;
  severity: PillSeverity;
}

export interface EnvironmentStatus {
  mode: EnvironmentMode;
  modeLabel: string;
  isLocalDev: boolean;
  isDemo: boolean;
  dataSource: EnvironmentField;
  auth: EnvironmentField;
  telemetry: EnvironmentField & { state: TelemetryState };
}

function deriveMode(env: EnvInput): EnvironmentMode {
  if (env.demoMode) return "demo";
  if (env.rayfinData) return "fabric";
  return "local";
}

const MODE_LABEL: Record<EnvironmentMode, string> = {
  local: "Local dev",
  demo: "Demo (synthetic showcase)",
  fabric: "Fabric (live)",
};

function deriveTelemetry(
  mode: EnvironmentMode,
  dataset: VaultDataset | null,
  hasOnlyProbe: boolean,
): EnvironmentField & { state: TelemetryState } {
  if (!dataset?.telemetryMeta) {
    return mode === "demo"
      ? { state: "none", value: "Demo data", tone: "blue", severity: "info" }
      : {
          state: "none",
          value: "Not synced yet",
          tone: "amber",
          severity: "warn",
        };
  }
  if (mode === "demo") {
    return {
      state: "demo",
      value: "Demo (synthetic)",
      tone: "blue",
      severity: "info",
    };
  }
  if (hasOnlyProbe) {
    return {
      state: "probe",
      value: "Probe-seeded only",
      tone: "amber",
      severity: "warn",
    };
  }
  return { state: "live", value: "Live", tone: "green", severity: "good" };
}

/**
 * Collapse the env signals and the loaded dataset into a labelled status model
 * for the Connection section. Pure: same inputs always yield the same labels.
 */
export function deriveEnvironment(
  env: EnvInput,
  dataset: VaultDataset | null,
  hasOnlyProbe: boolean,
): EnvironmentStatus {
  const mode = deriveMode(env);
  const dataSource: EnvironmentField = env.rayfinData
    ? { value: "Rayfin (live Fabric)", tone: "green", severity: "good" }
    : { value: "Seed (local)", tone: "slate", severity: "neutral" };

  let auth: EnvironmentField;
  if (env.demoMode || env.dev) {
    auth = { value: "Demo", tone: "blue", severity: "info" };
  } else if (env.fabricConfigured) {
    auth = { value: "Fabric SSO", tone: "green", severity: "good" };
  } else {
    auth = { value: "Mock (localhost)", tone: "slate", severity: "neutral" };
  }

  return {
    mode,
    modeLabel: MODE_LABEL[mode],
    isLocalDev: mode === "local",
    isDemo: mode === "demo",
    dataSource,
    auth,
    telemetry: deriveTelemetry(mode, dataset, hasOnlyProbe),
  };
}

/**
 * True when the loaded telemetry is entirely probe-seeded, so the dataset has
 * resolving assets but no real usage to judge effectiveness on. Promoted here from
 * ConnectionSection so the banner derivation and the section share one definition.
 */
export function datasetHasOnlyProbe(dataset: VaultDataset | null): boolean {
  const meta = dataset?.telemetryMeta;
  if (!meta?.probeAssetIds?.length) return false;
  const rows = dataset?.utilization ?? [];
  if (rows.length === 0) return false;
  return rows.every((row) => isProbeUtilization(row.assetId, row, meta));
}

export type BannerTone = "good" | "info" | "warn";

/**
 * One sentence describing the telemetry/data state, derived from the same signals
 * the page banners use, so the data-source label and the banner can never
 * contradict. Crucially, on live Fabric with no telemetry it says "Live Fabric"
 * (not "modeled seed data"), resolving the audit's contradiction. Pages keep their
 * richer render when telemetry is live; this drives the no-meta / probe branches.
 */
export function telemetryBanner(
  env: EnvInput,
  dataset: VaultDataset | null,
  hasOnlyProbe: boolean,
): { text: string; tone: BannerTone } {
  const mode = deriveMode(env);
  if (mode === "demo") {
    return { text: "Synthetic showcase data. Not a live library.", tone: "info" };
  }
  const { state } = deriveTelemetry(mode, dataset, hasOnlyProbe);
  if (state === "live") {
    return { text: "Live telemetry imported.", tone: "good" };
  }
  if (mode === "fabric") {
    return {
      text:
        state === "probe"
          ? "Live Fabric. Probe-seeded telemetry only."
          : "Live Fabric. No telemetry imported yet.",
      tone: "warn",
    };
  }
  return {
    text:
      state === "probe"
        ? "Seed data plus probe-seeded telemetry only. No real usage measured yet."
        : "Modeled seed data. Run the collectors to import your real usage.",
    tone: "warn",
  };
}

/** Read the live env signals from import.meta.env for the running app. */
export function readEnvInput(): EnvInput {
  const env = import.meta.env;
  return {
    dev: Boolean(env.DEV),
    demoMode: env.VITE_DEMO_MODE === "true",
    rayfinData: env.VITE_RAYFIN_DATA === "true",
    // Match what bootstrapAuth() actually gates RayfinAuthService on, and what
    // `rayfin env --framework vite` actually emits. It writes WORKSPACE_ID, ITEM_ID,
    // and PORTAL_URL (plus TENANT_ID) but never VITE_FABRIC_CLIENT_ID, so keying off
    // CLIENT_ID left this permanently false and mislabeled a real Fabric deploy as Mock.
    fabricConfigured: Boolean(
      env.VITE_FABRIC_WORKSPACE_ID &&
      env.VITE_FABRIC_ITEM_ID &&
      env.VITE_FABRIC_PORTAL_URL,
    ),
  };
}
