#!/usr/bin/env node
/**
 * Build the co-hosted static bundle for the public repo:
 *   /              landing + docs pages (docs/site, committed in this repo)
 *   /demo/*        interactive demo (Vite React app on synthetic seed data)
 * There is no sync step here: docs/site is part of the repo and is already
 * current. This is the public build of this file.
 */
import { execSync } from "node:child_process";
import { cpSync, existsSync, readdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const siteDir = join(root, "docs/site");
const dist = join(root, "dist");

function run(cmd, env = {}) {
  execSync(cmd, {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });
}

if (existsSync(dist)) rmSync(dist, { recursive: true, force: true });

console.log("bundling telemetry collector...");
run("node scripts/build-collect.mjs");

console.log("typechecking and building demo app at /demo ...");
run("tsc -b");
run("vite build", {
  VITE_DEMO_MODE: "true",
  VITE_SWA_COHOST: "true",
  VITE_PUBLIC_BUILD: "true",
});

console.log("merging site pages into dist root...");
for (const name of readdirSync(siteDir)) {
  cpSync(join(siteDir, name), join(dist, name), { recursive: true });
}

cpSync(
  join(root, "public/staticwebapp.config.json"),
  join(dist, "staticwebapp.config.json"),
);

console.log("public bundle ready:");
console.log("  dist/index.html           landing");
console.log("  dist/demo/index.html      interactive demo");
