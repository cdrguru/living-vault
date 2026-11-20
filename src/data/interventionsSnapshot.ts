import demoSnapshot from "./imports/interventions.json";
import { upgradeInterventionRow, type InterventionRow } from "./interventions";

// The seed tenant, inlined rather than imported from ./seed to avoid a load cycle
// (seed.ts imports this module). Matches TENANT in seed.ts and parseInterventions'
// default; a sidecar row rarely carries a tenantId of its own.
const TENANT = "tenant-fabricagent";

/**
 * The intervention history the app folds into the seed. The committed interventions.json
 * is a synthetic demo (empty by default: the public demo has no real history to show).
 * The owner's REAL interventions, written by the MCP/CLI agent loop to the gitignored
 * src/data/imports/interventions.local.json sidecar, are read on the DEV server so the
 * dashboard shows them without a separate import step.
 *
 * Guarded exactly like evalSnapshot.ts: DEV-only, MODE !== 'test', and typeof-guarded so
 * it is Node-safe for tsx tooling. A production build (build:swa) never reads the local
 * file, so real intervention notes never ship. The local file is the v1 sidecar shape
 * ({version, rows}); each row is upgraded to the current InterventionRow shape on read.
 */
interface RawInterventionFile {
  rows?: unknown[];
}

function rowsOf(file: RawInterventionFile | undefined): InterventionRow[] {
  if (!file || !Array.isArray(file.rows)) return [];
  return file.rows
    .map((row) => upgradeInterventionRow(row as Record<string, unknown>, TENANT))
    .filter((row): row is InterventionRow => row !== null);
}

const localModules = (
  typeof import.meta.env !== "undefined" &&
  import.meta.env.DEV &&
  import.meta.env.MODE !== "test"
    ? import.meta.glob("./imports/interventions.local.json", { eager: true })
    : {}
) as Record<string, { default: RawInterventionFile }>;

const localSnapshot = Object.values(localModules)[0]?.default;

export const interventionsSnapshot: InterventionRow[] = localSnapshot
  ? rowsOf(localSnapshot)
  : rowsOf(demoSnapshot as RawInterventionFile);
