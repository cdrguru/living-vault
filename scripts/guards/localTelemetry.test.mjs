import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { scanLocalTelemetry } from "./local-telemetry-guard.mjs";

/** A fake machine: an imports dir holding a real local snapshot, and a dist dir. */
function fixture({ bundleContains = "" } = {}) {
  const root = mkdtempSync(join(tmpdir(), "lv-guard-"));
  const imports = join(root, "imports");
  const dist = join(root, "dist");
  mkdirSync(imports);
  mkdirSync(dist);
  writeFileSync(
    join(imports, "harness-usage.local.json"),
    JSON.stringify({
      generatedAt: "2026-07-11T22:00:00.000Z",
      sources: [
        {
          source: "codex",
          invocations: 99_509,
          successes: 9_465,
          tokens: 426_384_801,
          componentsByModel: {
            "gpt-5.5": { input: 15_894_578, output: 1_225_351, cacheWrite: 0, cacheRead: 227_046_144 },
          },
        },
      ],
    }),
  );
  writeFileSync(join(dist, "assets", "..", "index.js"), bundleContains);
  return { imports, dist };
}

describe("local-telemetry-guard", () => {
  it("passes when the bundle carries none of the local snapshot's fingerprints", () => {
    // The synthetic demo numbers are unrelated, so a public SWA bundle is clean.
    const { imports, dist } = fixture({
      bundleContains: '{"source":"codex","invocations":2250,"tokens":8100000}',
    });
    const { violations, checked } = scanLocalTelemetry(dist, imports);
    expect(checked).toBeGreaterThan(0);
    expect(violations).toEqual([]);
  });

  it("FAILS when the owner's real token total reaches a public bundle", () => {
    // This is the leak it exists to catch: build:swa accidentally bundling
    // harness-usage.local.json would publish real usage with no visible symptom,
    // because the numbers would simply look plausible.
    const { imports, dist } = fixture({
      bundleContains: '{"source":"codex","invocations":99509,"tokens":426384801}',
    });
    const { violations } = scanLocalTelemetry(dist, imports);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations.map((v) => v.fingerprint)).toContain("426384801");
  });

  it("catches a leaked component split even when the totals are absent", () => {
    const { imports, dist } = fixture({ bundleContains: '{"cacheRead":227046144}' });
    const { violations } = scanLocalTelemetry(dist, imports);
    expect(violations.map((v) => v.fingerprint)).toContain("227046144");
  });

  it("ignores small numbers, which collide with unrelated code by chance", () => {
    // A guard that cries wolf gets disabled. Session counts and small integers are
    // deliberately not fingerprints.
    const { imports, dist } = fixture({ bundleContains: "const a = [0, 1, 10, 430];" });
    const { violations } = scanLocalTelemetry(dist, imports);
    expect(violations).toEqual([]);
  });

  it("FAILS when an owner's absolute source path reaches a public bundle", () => {
    // The worklist hands agents real paths like /Users/<name>/.claude/skills/x/SKILL.md.
    // Those name the user and the layout of their disk. They live in gitignored local
    // files and must never reach a built artifact; this is the tripwire that makes the
    // "paths never enter the asset record" design enforceable rather than merely
    // intended.
    const root = mkdtempSync(join(tmpdir(), "lv-guard-paths-"));
    const imports = join(root, "imports");
    const dist = join(root, "dist");
    mkdirSync(imports);
    mkdirSync(dist);
    writeFileSync(
      join(imports, "asset-paths.local.json"),
      JSON.stringify({
        version: 2,
        assets: {
          "cc-skill-alpha": {
            sourcePath: "/Users/someone/.claude/skills/alpha/SKILL.md",
            modifiedAt: "2026-01-01T00:00:00.000Z",
          },
        },
      }),
    );
    writeFileSync(
      join(dist, "index.js"),
      'const p = "/Users/someone/.claude/skills/alpha/SKILL.md";',
    );
    const { violations } = scanLocalTelemetry(dist, imports);
    expect(violations.map((v) => v.fingerprint)).toContain(
      "/Users/someone/.claude/skills/alpha/SKILL.md",
    );
  });

  it("passes trivially on a machine with no local snapshots (CI, fresh clone)", () => {
    const root = mkdtempSync(join(tmpdir(), "lv-guard-empty-"));
    const imports = join(root, "imports");
    const dist = join(root, "dist");
    mkdirSync(imports);
    mkdirSync(dist);
    writeFileSync(join(dist, "index.js"), "anything");
    const { violations, checked } = scanLocalTelemetry(dist, imports);
    expect(checked).toBe(0);
    expect(violations).toEqual([]);
  });
});
