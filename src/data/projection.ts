import demoProjection from './imports/fabric-library.json';
import type { ProjectionInput } from './merge';

/**
 * The committed fabric-library catalog projection.
 *
 * The committed src/data/imports/fabric-library.json is a NEUTRAL, synthetic public
 * projection (no owner or client identifiers), so it ships in public builds. The
 * owner's real catalog is projected upstream from a private repo and kept local-only
 * in the gitignored src/data/imports/fabric-library.local.json; the dev server reads
 * it when present, and `node scripts/neutralize-catalog.mjs` regenerates the neutral
 * committed file from it. See docs/PRIVACY.md.
 *
 * DEV-only override: only the interactive dev server (import.meta.env.DEV and not the
 * test runner) reads the local owner catalog. Vitest and production builds use the
 * neutral committed projection, so the owner's catalog never reaches a test fixture
 * or a bundle. Mirrors telemetrySnapshot.ts.
 */
const localModules = (
  import.meta.env.DEV && import.meta.env.MODE !== 'test'
    ? import.meta.glob('./imports/fabric-library.local.json', { eager: true })
    : {}
) as Record<string, { default: unknown }>;

const localProjection = Object.values(localModules)[0]?.default;

// The JSON also carries a utilization: [] field, which ProjectionInput omits (the
// vault owns telemetry), so the structural cast goes through unknown.
export const fabricLibraryProjection = (localProjection ??
  demoProjection) as unknown as ProjectionInput;
