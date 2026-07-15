/**
 * No-secrets build guard. Fails loudly if a built artifact (dist/) contains a
 * secret-bearing file or a high-confidence secret token. The self-host artifact
 * must be assembled from dist/ plus an explicit allowlist, never a repo copy, so
 * gitignored-but-present local files cannot ride along; this guard is the
 * chokepoint that proves it for every distribution path.
 *
 * Two checks:
 *   1. Filename denylist: .env / .env.* (except *.env.example), *.local / *.local.json,
 *      .deployments.json, anything under a .temp directory.
 *   2. Content scan for high-confidence secret prefixes only. The email and
 *      high-entropy-blob patterns from scripts/telemetry/scrub.mjs are deliberately
 *      NOT used here: they match minified bundle identifiers, base64 assets, and
 *      timestamps, so they are unusable against built JS. The long-digit
 *      credit-card pattern is excluded for the same reason (13-digit timestamps).
 *      The prefixes below (sk-, ghp_, AKIA, xox-, bearer, SSN) do not occur in a
 *      clean bundle.
 *
 * Usage: node scripts/guards/no-secrets-guard.mjs [distDir=dist]
 */
import { readdirSync, statSync, readFileSync, existsSync } from "node:fs";
import { basename, extname, join, sep } from "node:path";
import { fileURLToPath } from "node:url";

// High-confidence secret token shapes (subset of scrub.mjs PATTERNS).
export const SECRET_PATTERNS = [
  /\b(?:sk-[A-Za-z0-9]{8,}|ghp_[A-Za-z0-9]{16,}|gho_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{16,}|AKIA[0-9A-Z]{12,}|xox[baprs]-[A-Za-z0-9-]{8,})\b/,
  /bearer\s+[A-Za-z0-9._-]{8,}/i,
  /\b\d{3}-\d{2}-\d{4}\b/,
];

const BINARY_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".avif",
  ".woff", ".woff2", ".ttf", ".eot", ".otf",
  ".mp4", ".webm", ".pdf", ".zip", ".gz",
]);

/** A file name is denied unless it is a *.example contract placeholder (no secrets),
 *  for example .env.example or .env.selfhost.example. */
export function isDeniedFile(file) {
  const name = basename(file);
  if (name.endsWith(".example")) return false;
  if (name === ".env" || name.startsWith(".env.")) return true;
  if (name.endsWith(".local") || name.endsWith(".local.json")) return true;
  if (name === ".deployments.json") return true;
  if (file.split(sep).includes(".temp")) return true;
  return false;
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

/** Scan distDir for denied files and secret tokens. Returns an array of violations. */
export function scanSecrets(distDir) {
  const violations = [];
  for (const file of walk(distDir)) {
    if (isDeniedFile(file)) {
      violations.push({ file, kind: "denied-file", detail: basename(file) });
      continue;
    }
    if (BINARY_EXT.has(extname(file).toLowerCase())) continue;
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const pattern of SECRET_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        violations.push({ file, kind: "secret-token", detail: match[0].slice(0, 12) });
      }
    }
  }
  return violations;
}

function main() {
  const distDir = process.argv[2] || "dist";
  if (!existsSync(distDir)) {
    console.error(`no-secrets-guard: dist dir not found: ${distDir}`);
    process.exit(2);
  }
  const violations = scanSecrets(distDir);
  if (violations.length > 0) {
    console.error(`no-secrets-guard: FAILED. Secret-bearing content in ${distDir}:`);
    for (const v of violations) {
      console.error(`  [${v.kind}] ${v.detail} in ${v.file}`);
    }
    process.exit(1);
  }
  console.log(`no-secrets-guard: ok. No secret files or tokens in ${distDir}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main();
}
