/**
 * Local-telemetry build guard. Fails loudly if the owner's REAL telemetry reached a
 * public artifact (the SWA demo bundle).
 *
 * Real usage lives in gitignored *.local.json snapshots. The dev server reads them,
 * and build:fabric deliberately bundles harness-usage.local.json (VITE_REAL_HARNESS=true)
 * because the Fabric app is the owner's own SSO-gated deployment and harness usage is
 * not a Fabric table. build:swa must NEVER bundle them: that demo is public.
 *
 * The split is a build-time flag, which is easy to get wrong in a way nobody notices
 * (the numbers would simply look real). This guard is the tripwire. It fingerprints
 * whatever local snapshots exist on THIS machine and asserts none of them appear in the
 * artifact, so it fails on the real content rather than on a config value.
 *
 * No local snapshot on this machine (CI, a fresh clone) means nothing to leak, so the
 * guard passes trivially rather than guessing.
 *
 * Usage: node scripts/guards/local-telemetry-guard.mjs [distDir=dist]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const importsDir = join(here, "..", "..", "src", "data", "imports");

const LOCAL_SNAPSHOTS = [
  "harness-usage.local.json",
  "utilization.local.json",
  "evals.local.json",
  // The worklist's inputs and output. asset-paths.local.json maps assets to ABSOLUTE
  // source paths on this machine; worklist.local.json embeds those paths per item.
  // A path is owner-private (it carries the username and the disk layout), and the
  // whole point of keeping it out of the asset record is that it must never reach a
  // shipped artifact. This guard is what makes that structural instead of hoped-for.
  "asset-paths.local.json",
  "worklist.local.json",
  "interventions.local.json",
];

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".avif",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".mp4", ".webm", ".pdf", ".zip", ".gz",
]);

/**
 * Distinctive strings from a local snapshot: its generation stamp and each harness's
 * large counters. Small numbers (0, 1, a session count) are excluded: they collide by
 * chance with unrelated code and would make the guard cry wolf. A 6+ digit token total
 * appearing verbatim in a bundle is not a coincidence.
 */
function fingerprints(snapshot) {
  const out = new Set();
  if (typeof snapshot.generatedAt === "string") out.add(snapshot.generatedAt);
  for (const source of snapshot.sources ?? []) {
    for (const key of ["tokens", "invocations", "successes"]) {
      const value = source[key];
      if (typeof value === "number" && value >= 100_000) out.add(String(value));
    }
    for (const components of Object.values(source.componentsByModel ?? {})) {
      for (const value of Object.values(components)) {
        if (typeof value === "number" && value >= 1_000_000) out.add(String(value));
      }
    }
  }
  for (const row of snapshot.rows ?? []) {
    if (typeof row.id === "string" && row.id.includes(":")) out.add(row.id);
  }
  // asset-paths.local.json: every absolute source path is a fingerprint. These are the
  // most damaging thing in any local file (they name the user and their disk layout),
  // so each one is checked verbatim.
  for (const entry of Object.values(snapshot.assets ?? {})) {
    const path = typeof entry === "string" ? entry : entry?.sourcePath;
    if (typeof path === "string" && path.startsWith("/")) out.add(path);
  }
  // worklist.local.json: the same paths, carried per recommendation.
  for (const action of snapshot.actions ?? []) {
    if (typeof action?.sourcePath === "string" && action.sourcePath.startsWith("/")) {
      out.add(action.sourcePath);
    }
  }
  return [...out];
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) yield* walk(full);
    else yield full;
  }
}

export function scanLocalTelemetry(distDir, importsPath = importsDir) {
  const needles = [];
  for (const name of LOCAL_SNAPSHOTS) {
    const path = join(importsPath, name);
    if (!existsSync(path)) continue;
    let snapshot;
    try {
      snapshot = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      continue;
    }
    for (const fp of fingerprints(snapshot)) needles.push({ name, fp });
  }
  if (needles.length === 0) return { violations: [], checked: 0 };

  const violations = [];
  for (const file of walk(distDir)) {
    if (BINARY_EXT.has(extname(file).toLowerCase())) continue;
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const { name, fp } of needles) {
      if (content.includes(fp)) violations.push({ file, snapshot: name, fingerprint: fp });
    }
  }
  return { violations, checked: needles.length };
}

function main() {
  const distDir = process.argv[2] || "dist";
  if (!existsSync(distDir)) {
    console.error(`local-telemetry-guard: dist dir not found: ${distDir}`);
    process.exit(2);
  }
  const { violations, checked } = scanLocalTelemetry(distDir);
  if (checked === 0) {
    console.log(
      "local-telemetry-guard: ok. No local telemetry snapshots on this machine, so none can leak.",
    );
    return;
  }
  if (violations.length > 0) {
    console.error(
      `local-telemetry-guard: FAILED. The owner's REAL telemetry is in ${distDir}:`,
    );
    for (const v of violations.slice(0, 10)) {
      console.error(`  ${v.snapshot} fingerprint "${v.fingerprint}" in ${v.file}`);
    }
    console.error(
      "This bundle is public. build:swa must not set VITE_REAL_HARNESS; only build:fabric may.",
    );
    process.exit(1);
  }
  console.log(
    `local-telemetry-guard: ok. No real telemetry in ${distDir} (${checked} fingerprints checked).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
