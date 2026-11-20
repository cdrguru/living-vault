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
 * (the numbers would simply look real). This guard is the tripwire. It discovers every
 * *.local.json on THIS machine (the same pattern .gitignore uses, so the definition
 * cannot drift) and asserts none of their fingerprints appear in the artifact, so it
 * fails on the real content rather than on a config value.
 *
 * No local snapshot on this machine (CI, a fresh clone) means nothing to leak, so the
 * guard passes trivially rather than guessing.
 *
 * What it does NOT cover, stated because a guard's blind spot must be legible: a local
 * file whose shape fingerprints() cannot read yields no needle, and the run reports it by
 * name rather than passing silently. Those files are still covered by no-secrets-guard
 * (which denies them by filename) and owner-content-guard (which scans for sentinels).
 *
 * Usage: node scripts/guards/local-telemetry-guard.mjs [distDir=dist]
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const importsDir = join(here, "..", "..", "src", "data", "imports");

/**
 * Every gitignored *.local.json in the imports directory, discovered rather than listed.
 *
 * A fixed list of names would miss per-machine snapshots
 * (harness-usage.laptop.local.json, utilization.desktop.local.json, and the rest),
 * which carry the same real telemetry as the plain-named ones.
 *
 * A hardcoded list is the wrong shape for this job: every new collector, every new
 * machine, and every new suffix silently opts out of the guard, and the failure is
 * invisible because the build stays green. `*.local.json` is the gitignore rule, so it is
 * the honest definition of "the files that must never ship".
 *
 * The worklist inputs are worth naming even though they are now matched by pattern:
 * asset-paths.local.json maps assets to ABSOLUTE source paths on this machine, and
 * worklist.local.json embeds those paths per item. A path is owner-private (it carries
 * the username and the disk layout), and the whole point of keeping it out of the asset
 * record is that it must never reach a shipped artifact.
 */
export function discoverLocalSnapshots(importsPath = importsDir) {
  if (!existsSync(importsPath)) return [];
  return readdirSync(importsPath)
    .filter((name) => name.endsWith(".local.json"))
    .sort();
}

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

/**
 * One key per real per-skill load row: skill, date, and count together. A skill name
 * alone is public (the demo uses real skill names), and a small count alone collides
 * with everything, but the triple is specific to the owner's own day.
 */
const skillUseKey = (skill, date, loads) => `${skill}|${date}|${loads}`;

function skillUseKeys(snapshot) {
  const keys = new Set();
  for (const source of snapshot.sources ?? []) {
    for (const row of source.skillUses ?? []) {
      if (typeof row?.skill === "string" && typeof row.date === "string" && typeof row.loads === "number") {
        keys.add(skillUseKey(row.skill, row.date, row.loads));
      }
    }
  }
  return keys;
}

// A serialized skillUses row, however the bundler wrote it: quoted or unquoted keys,
// any key order, double or single quotes, backslash-escaped quotes inside a
// JSON.parse('...') string. Matched per flat object so the three fields must sit in
// the SAME row.
const FLAT_OBJECT = /\{[^{}]{0,400}\}/g;
const FIELD = (name, value) =>
  new RegExp(`(?:^|[{,\\s])\\\\?["']?${name}\\\\?["']?\\s*:\\s*${value}`);
const SKILL_FIELD = FIELD("skill", `\\\\?["']([^"'\\\\]+)\\\\?["']`);
const DATE_FIELD = FIELD("date", `\\\\?["'](\\d{4}-\\d{2}-\\d{2})\\\\?["']`);
const LOADS_FIELD = FIELD("loads", `(\\d+)`);

/** Every skillUses-shaped row in `content`, as skillUseKey strings. */
function skillUseRowsIn(content) {
  const found = [];
  if (!content.includes("loads")) return found;
  for (const [obj] of content.matchAll(FLAT_OBJECT)) {
    const skill = obj.match(SKILL_FIELD);
    const date = obj.match(DATE_FIELD);
    const loads = obj.match(LOADS_FIELD);
    if (skill && date && loads) found.push(skillUseKey(skill[1], date[1], Number(loads[1])));
  }
  return found;
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
  const skillNeedles = new Map(); // skillUseKey -> snapshot name
  const files = discoverLocalSnapshots(importsPath);
  // Local files the guard found but could extract no fingerprint from. Reported rather
  // than swallowed: a snapshot whose shape fingerprints() does not understand is a file
  // this guard is NOT protecting, and the whole failure mode here is a guard that reports
  // "ok" for a file it never looked inside.
  const unfingerprinted = [];
  for (const name of files) {
    const path = join(importsPath, name);
    let snapshot;
    try {
      snapshot = JSON.parse(readFileSync(path, "utf8"));
    } catch {
      unfingerprinted.push(name);
      continue;
    }
    const fps = fingerprints(snapshot);
    const skillKeys = skillUseKeys(snapshot);
    if (fps.length === 0 && skillKeys.size === 0) unfingerprinted.push(name);
    for (const fp of fps) needles.push({ name, fp });
    for (const key of skillKeys) skillNeedles.set(key, name);
  }
  const checked = needles.length + skillNeedles.size;
  if (checked === 0) {
    return { violations: [], checked: 0, files, unfingerprinted };
  }

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
    if (skillNeedles.size > 0) {
      for (const key of skillUseRowsIn(content)) {
        const name = skillNeedles.get(key);
        if (name) violations.push({ file, snapshot: name, fingerprint: `skillUses ${key}` });
      }
    }
  }
  return { violations, checked, files, unfingerprinted };
}

function main() {
  const distDir = process.argv[2] || "dist";
  if (!existsSync(distDir)) {
    console.error(`local-telemetry-guard: dist dir not found: ${distDir}`);
    process.exit(2);
  }
  const { violations, checked, files, unfingerprinted } = scanLocalTelemetry(distDir);
  // Say which local files this guard could NOT fingerprint. It is not a failure (a file
  // may honestly carry no distinctive marker), but it is the guard's blind spot, and a
  // blind spot nobody is told about is how "ok" comes to mean less than it looks.
  if (unfingerprinted.length > 0) {
    console.warn(
      `local-telemetry-guard: NOTE. ${unfingerprinted.length} of ${files.length} local file(s) yielded no fingerprint and are NOT covered by this guard: ${unfingerprinted.join(", ")}. They are still covered by no-secrets-guard (filename) and owner-content-guard (sentinels).`,
    );
  }
  if (checked === 0) {
    console.log(
      `local-telemetry-guard: ok. No fingerprintable local telemetry on this machine (${files.length} local file(s) found), so none can leak.`,
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
    `local-telemetry-guard: ok. No real telemetry in ${distDir} (${checked} fingerprints from ${files.length - unfingerprinted.length} of ${files.length} local file(s) checked).`,
  );
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
