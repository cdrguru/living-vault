import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

/**
 * Eval-content guard. Eval case bodies (prompt / rubric / captured response) are
 * content-bearing by design, so the telemetry sentinel guarantee ("content never appears
 * in collector output") cannot transfer. This is the replacement tripwire: it proves,
 * statically, that authored eval bodies can never reach a shipped bundle, because
 *   1. the *.local.json files that hold them are gitignored,
 *   2. the DEV-only loader globs only the metadata evals.local.json, never the body file,
 *   3. no bundled source module references eval-cases.local.json at all, and
 *   4. the committed demo evals.json is metadata-only (no authored-body fields).
 * See docs/superpowers/specs/2026-07-07-private-eval-artifact-design.md section 10.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel) => readFileSync(join(repoRoot, rel), "utf8");

// Strip block and line comments so the guard checks CODE references (imports, globs),
// not prose. Design comments legitimately name eval-cases.local.json to explain the split.
const stripComments = (src) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if ([".ts", ".tsx"].includes(extname(full))) out.push(full);
  }
  return out;
}

describe("eval-content guard", () => {
  it("gitignores the local-only eval files", () => {
    expect(read(".gitignore")).toMatch(/\*\.local\.json/);
  });

  it("loads only the metadata snapshot on the dev server, never the body file", () => {
    const loader = stripComments(read("src/data/evalSnapshot.ts"));
    expect(loader).toContain("evals.local.json");
    expect(loader).not.toContain("eval-cases.local.json");
  });

  it("has no bundled src module that references the case-body file (comments aside)", () => {
    const offenders = walk(join(repoRoot, "src")).filter((file) =>
      stripComments(readFileSync(file, "utf8")).includes(
        "eval-cases.local.json",
      ),
    );
    expect(
      offenders,
      `bundled files referencing eval bodies: ${offenders}`,
    ).toEqual([]);
  });

  it("ships a metadata-only committed demo (no authored body fields)", () => {
    const demo = JSON.parse(read("src/data/imports/evals.json"));
    expect(demo.demo).toBe(true);
    const allowed = new Set([
      "id",
      "tenantId",
      "assetId",
      "caseHash",
      "date",
      "trials",
      "passed",
      "failed",
      "errored",
      "latencyMs",
      "tokens",
      "cost",
      "model",
      "quality",
    ]);
    for (const row of demo.rows) {
      for (const key of Object.keys(row)) {
        expect(allowed.has(key), `demo eval row carries "${key}"`).toBe(true);
      }
    }
  });
});
