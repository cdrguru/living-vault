/**
 * Bundle the standalone collector into a single dependency-free file the app serves at
 * /living-vault-collect.mjs, so a shared user can `curl` it and run it without this
 * repo. esbuild inlines the reused telemetry/collect units; node built-ins stay
 * external. Run by prebuild:fabric / prebuild so the shipped copy is always current.
 */
import { build } from "esbuild";

await build({
  entryPoints: ["scripts/living-vault-collect.mjs"],
  outfile: "public/living-vault-collect.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node18",
  banner: { js: "#!/usr/bin/env node" },
  legalComments: "none",
});

console.log("bundled -> public/living-vault-collect.mjs");
