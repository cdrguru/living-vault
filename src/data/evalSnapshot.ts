import demoSnapshot from "./imports/evals.json";
import type { EvalMeta, EvalResultRow } from "./types";

/**
 * The eval snapshot the app folds into the seed. The committed evals.json is a synthetic
 * demo. Real eval results produced by scripts/vault-evals.mjs are written to a gitignored
 * evals.local.json which the DEV server reads for the owner's local experience. Production
 * builds (build:swa / build:fabric) never read or bundle the local file, so real eval
 * evidence never ships. Authored eval-case bodies live in a separate gitignored
 * eval-cases.local.json that no bundled module ever imports. See docs/PRIVACY.md and
 * docs/superpowers/specs/2026-07-07-private-eval-artifact-design.md section 10.
 */
export interface EvalSnapshot {
  demo?: boolean;
  rows: EvalResultRow[];
  meta: EvalMeta;
}

// DEV-only override, guarded exactly like telemetrySnapshot.ts: typeof keeps it Node-safe
// for tsx tooling, DEV is false in a production build (so the local file is tree-shaken
// out), and excluding MODE 'test' keeps Vitest on the committed demo for deterministic
// tests. This globs ONLY the metadata evals.local.json, never eval-cases.local.json.
const localModules = (
  typeof import.meta.env !== "undefined" &&
  import.meta.env.DEV &&
  import.meta.env.MODE !== "test"
    ? import.meta.glob("./imports/evals.local.json", { eager: true })
    : {}
) as Record<string, { default: EvalSnapshot }>;

const localSnapshot = Object.values(localModules)[0]?.default;

export const evalSnapshot: EvalSnapshot =
  localSnapshot ?? (demoSnapshot as unknown as EvalSnapshot);
