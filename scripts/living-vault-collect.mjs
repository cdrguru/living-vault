/**
 * The Living Vault standalone collector. A single, dependency-free Node tool a user
 * runs WITHOUT a copy of this repo, so anyone the app is shared with can contribute
 * their assets and import their real Claude Code usage. The deployed app serves the
 * bundled build of this file at /living-vault-collect.mjs, and the in-app wizard shows
 * the curl + node command.
 *
 *   node living-vault-collect.mjs assets      -> ./living-vault-assets.json
 *   node living-vault-collect.mjs telemetry   -> ./utilization.upload.json
 *
 * Flags: --out <file> (override output), --home <dir> (override ~/.claude).
 *
 * It scans ~/.claude once for the user's own skills/agents/commands, then: for
 * `assets`, emits them as a contribution projection; for `telemetry`, resolves the
 * user's transcripts against those same assets (reusing this repo's tested extract /
 * resolve / aggregate units) and emits the metadata-only upload envelope. Metadata
 * only: counts, timings, model, and the (type, slug) identity; never prompt, response,
 * or command content. Resolution against the user's own assets is intentional: usage
 * of assets they do not have is left out (the app reports it as unmatched on upload).
 */
import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { aggregate } from "./telemetry/aggregate.mjs";
import { extractEvents } from "./telemetry/extract.mjs";
import { buildCatalogIndex, resolveEvent } from "./telemetry/resolve.mjs";
import { scanClaudeAssets } from "./collect/scanAssets.mjs";

const PLACEHOLDER_TENANT = "00000000-0000-0000-0000-000000000000";

function parseArgs(argv) {
  const args = { command: argv[2], out: undefined, home: undefined };
  for (let i = 3; i < argv.length; i += 1) {
    if (argv[i] === "--out") args.out = argv[(i += 1)];
    else if (argv[i] === "--home") args.home = argv[(i += 1)];
  }
  return args;
}

const isoDate = (ts) => new Date(ts).toISOString().slice(0, 10);

/** Recursively collect every *.jsonl path under dir. */
function walkJsonl(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) out.push(...walkJsonl(full));
    else if (entry.endsWith(".jsonl")) out.push(full);
  }
  return out;
}

function writeJson(path, value, label) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
  console.log(label);
}

function emitAssets(assets, out) {
  const path = out ?? "./living-vault-assets.json";
  writeJson(
    path,
    { source: "living-vault-collect", version: 1, assets },
    `assets: ${assets.length} found -> ${path}`,
  );
}

function emitTelemetry(assets, claudeDir, out) {
  // Catalog the user's own assets so resolveEvent can attribute usage to them. The id
  // encodes (type, slug); the deployed app's reconcile rewrites it onto the live
  // catalog id by (type, slug), so the synthetic id here never needs to be a real one.
  const catalog = {
    assets: assets.map((asset) => ({
      type: asset.type,
      slug: asset.slug,
      id: `cc-${asset.type}-${asset.slug}`,
      tenantId: PLACEHOLDER_TENANT,
    })),
  };
  const index = buildCatalogIndex(catalog);
  const idToTypeSlug = new Map(
    catalog.assets.map((asset) => [
      asset.id,
      { type: asset.type, slug: asset.slug },
    ]),
  );

  const files = walkJsonl(join(claudeDir, "projects"));
  const resolved = [];
  let earliest = Infinity;
  let latest = -Infinity;
  for (const file of files) {
    let events;
    try {
      events = extractEvents(readFileSync(file, "utf8"));
    } catch {
      continue;
    }
    for (const event of events) {
      if (!Number.isFinite(event.ts)) continue;
      const hit = resolveEvent(event, index, {});
      if (!hit) continue;
      earliest = Math.min(earliest, event.ts);
      latest = Math.max(latest, event.ts);
      resolved.push({
        assetId: hit.id,
        tenantId: hit.tenantId,
        date: isoDate(event.ts),
        model: event.model,
        isError: event.isError,
        latencyMs: event.latencyMs,
      });
    }
  }

  const rows = aggregate(resolved);
  const meta = {
    source: "claude-code",
    generatedAt: new Date().toISOString(),
    windowStart: Number.isFinite(earliest)
      ? isoDate(earliest)
      : isoDate(Date.now()),
    windowEnd: Number.isFinite(latest) ? isoDate(latest) : isoDate(Date.now()),
    sessions: files.length,
    tracked: {
      invocations: true,
      successes: true,
      errors: true,
      latency: true,
      refusals: false,
      tokens: false,
      cost: false,
      model: true,
    },
  };
  const envelope = {
    source: "telemetry-upload",
    version: 1,
    meta,
    rows: rows.map((row) => {
      const identity = idToTypeSlug.get(row.assetId);
      return identity
        ? { ...row, sourceType: identity.type, sourceSlug: identity.slug }
        : { ...row };
    }),
  };
  const path = out ?? "./utilization.upload.json";
  writeJson(
    path,
    envelope,
    `telemetry: ${files.length} transcripts, ${envelope.rows.length} rows -> ${path}`,
  );
}

function main() {
  const { command, out, home } = parseArgs(process.argv);
  const claudeDir = home ?? join(homedir(), ".claude");

  if (command !== "assets" && command !== "telemetry") {
    console.error(
      "Usage: node living-vault-collect.mjs <assets|telemetry> [--out file] [--home dir]",
    );
    process.exit(1);
  }
  if (!existsSync(claudeDir)) {
    console.error(
      `No Claude home found at ${claudeDir} (override with --home).`,
    );
    process.exit(1);
  }

  const assets = scanClaudeAssets(claudeDir);
  if (command === "assets") emitAssets(assets, out);
  else emitTelemetry(assets, claudeDir, out);
}

main();
