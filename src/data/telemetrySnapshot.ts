import demoSnapshot from './imports/utilization.json';
import type { TelemetryMeta, UtilizationRow } from './types';

/**
 * The telemetry snapshot the UI reads. The committed utilization.json is a
 * synthetic demo. Real telemetry produced by scripts/vault-telemetry.mjs is
 * written to a gitignored utilization.local.json which the DEV server reads for
 * the owner's local experience. Production builds (build:swa) never read or
 * bundle the local file, so real usage never ships. See docs/PRIVACY.md.
 */
export interface TelemetrySnapshot {
  rows: UtilizationRow[];
  meta: TelemetryMeta;
  unattributed: { key: string; count: number }[];
}

// DEV-only override. In a production build import.meta.env.DEV is false, so the
// glob is unused and the local file is tree-shaken out of the bundle. Guarded
// the same way as realAssets.ts: typeof makes the module Node-safe for tsx
// tooling (e.g. through RayfinDataSource), and excluding MODE 'test' keeps
// Vitest on the committed demo snapshot, so tests pass identically whether or
// not the owner's gitignored local telemetry exists on the machine.
const localModules = (
  typeof import.meta.env !== 'undefined' &&
  import.meta.env.DEV &&
  import.meta.env.MODE !== 'test'
    ? import.meta.glob('./imports/utilization.local.json', { eager: true })
    : {}
) as Record<string, { default: TelemetrySnapshot }>;

const localSnapshot = Object.values(localModules)[0]?.default;

export const telemetrySnapshot: TelemetrySnapshot =
  localSnapshot ?? (demoSnapshot as unknown as TelemetrySnapshot);
