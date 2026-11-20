import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { discoverLocalSnapshots, scanLocalTelemetry } from "./local-telemetry-guard.mjs";

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
            "gpt-5.5": { input: 11_111_101, output: 2_222_202, cacheWrite: 0, cacheRead: 333_333_303 },
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
    const { imports, dist } = fixture({ bundleContains: '{"cacheRead":333333303}' });
    const { violations } = scanLocalTelemetry(dist, imports);
    expect(violations.map((v) => v.fingerprint)).toContain("333333303");
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

  it("guards a PER-MACHINE snapshot, which a hardcoded name list never saw", () => {
    // A per-machine snapshot such as harness-usage.laptop.local.json carries the same
    // real telemetry as the plain-named file, so the guard must discover it rather than
    // rely on a fixed list of names.
    const root = mkdtempSync(join(tmpdir(), "lv-guard-machine-"));
    const imports = join(root, "imports");
    const dist = join(root, "dist");
    mkdirSync(imports);
    mkdirSync(dist);
    writeFileSync(
      join(imports, "harness-usage.laptop.local.json"),
      JSON.stringify({
        generatedAt: "2026-07-11T22:00:00.000Z",
        sources: [{ source: "claude", tokens: 555_444_333 }],
      }),
    );
    writeFileSync(join(dist, "index.js"), 'const t = {"tokens":555444333};');
    const { violations } = scanLocalTelemetry(dist, imports);
    expect(violations.map((v) => v.fingerprint)).toContain("555444333");
    expect(violations[0].snapshot).toBe("harness-usage.laptop.local.json");
  });

  it("discovers every *.local.json rather than a fixed list", () => {
    const root = mkdtempSync(join(tmpdir(), "lv-guard-discover-"));
    const imports = join(root, "imports");
    mkdirSync(imports);
    for (const name of [
      "utilization.desktop.local.json",
      "harness-usage.local.json",
      "brand-new-collector.local.json",
      "utilization.json", // committed demo: NOT local, must not be picked up
      "README.md",
    ]) {
      writeFileSync(join(imports, name), "{}");
    }
    // A collector nobody has written yet is covered the day it lands, which is the whole
    // reason this is a pattern and not a list.
    expect(discoverLocalSnapshots(imports)).toEqual([
      "brand-new-collector.local.json",
      "harness-usage.local.json",
      "utilization.desktop.local.json",
    ]);
  });

  it("reports a local file it cannot fingerprint instead of silently ignoring it", () => {
    // A guard's blind spot has to be legible. A snapshot whose shape fingerprints()
    // cannot read is a file this guard is NOT protecting, and saying "ok" without saying
    // that is how "ok" comes to mean less than it looks.
    const root = mkdtempSync(join(tmpdir(), "lv-guard-blind-"));
    const imports = join(root, "imports");
    const dist = join(root, "dist");
    mkdirSync(imports);
    mkdirSync(dist);
    writeFileSync(
      join(imports, "harness-usage.local.json"),
      JSON.stringify({ sources: [{ source: "claude", tokens: 999_888_777 }] }),
    );
    writeFileSync(
      join(imports, "evidence-campaign.local.json"),
      JSON.stringify({ shape: "the guard has no fingerprint rule for this" }),
    );
    writeFileSync(join(dist, "index.js"), "clean");
    const { violations, unfingerprinted, files } = scanLocalTelemetry(dist, imports);
    expect(violations).toEqual([]);
    expect(files).toHaveLength(2);
    expect(unfingerprinted).toEqual(["evidence-campaign.local.json"]);
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

describe("local-telemetry-guard skillUses", () => {
  /** A machine whose only distinctive local data is per-skill Codex loads. */
  function skillFixture(bundleContains) {
    const root = mkdtempSync(join(tmpdir(), "lv-guard-skill-"));
    const imports = join(root, "imports");
    const dist = join(root, "dist");
    mkdirSync(imports);
    mkdirSync(dist);
    writeFileSync(
      join(imports, "harness-usage.local.json"),
      JSON.stringify({
        sources: [
          {
            source: "codex",
            invocations: 12,
            skillUses: [
              { skill: "trim-fat", date: "2026-10-21", loads: 7 },
              { skill: "pdf", date: "2026-10-22", loads: 3 },
            ],
          },
        ],
      }),
    );
    writeFileSync(join(dist, "index.js"), bundleContains);
    return { imports, dist };
  }

  it("guard skillUses", () => {
    // Vite emits large JSON as a compact JSON.parse('...') string and small JSON as an
    // object literal with unquoted keys; key order is not guaranteed in either.
    const asJsonParse = skillFixture(
      `const a=JSON.parse('{"sources":[{"skillUses":[{"loads":7,"skill":"trim-fat","date":"2026-10-21"}]}]}');`,
    );
    const r1 = scanLocalTelemetry(asJsonParse.dist, asJsonParse.imports);
    expect(r1.violations.length).toBeGreaterThan(0);

    const asLiteral = skillFixture(`const b={skillUses:[{skill:"pdf",date:"2026-10-22",loads:3}]};`);
    const r2 = scanLocalTelemetry(asLiteral.dist, asLiteral.imports);
    expect(r2.violations.length).toBeGreaterThan(0);
  });

  it("does not flag a demo row that shares a skill name but not its date and count", () => {
    const demo = skillFixture(`const c={skillUses:[{skill:"pdf",date:"2026-06-02",loads:3},{skill:"trim-fat",date:"2026-10-21",loads:2}]};`);
    const r = scanLocalTelemetry(demo.dist, demo.imports);
    expect(r.checked).toBeGreaterThan(0);
    expect(r.violations).toEqual([]);
  });
});
