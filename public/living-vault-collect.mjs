#!/usr/bin/env node

// scripts/living-vault-collect.mjs
import {
  existsSync as existsSync2,
  readFileSync as readFileSync2,
  readdirSync as readdirSync2,
  statSync as statSync2,
  writeFileSync
} from "node:fs";
import { homedir } from "node:os";
import { join as join2 } from "node:path";

// scripts/telemetry/aggregate.mjs
function aggregate(events) {
  const groups = /* @__PURE__ */ new Map();
  for (const event of events) {
    const model = event.model ?? "unknown";
    const key = `${event.assetId}:${event.date}:${model}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(event);
  }
  const rows = [];
  for (const [, items] of groups) {
    const first = items[0];
    const model = first.model ?? "unknown";
    const withResult = items.filter((e) => e.isError !== void 0);
    const latencies = items.map((e) => e.latencyMs).filter((ms) => typeof ms === "number");
    const meanLatency = latencies.length ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0;
    rows.push({
      id: `claude-code:${first.assetId}:${first.date}:${model}`,
      tenantId: first.tenantId,
      assetId: first.assetId,
      date: first.date,
      model,
      invocations: items.length,
      successes: withResult.filter((e) => e.isError === false).length,
      errors: withResult.filter((e) => e.isError === true).length,
      refusals: 0,
      latencyMs: meanLatency,
      tokens: 0,
      cost: 0
    });
  }
  return rows;
}

// scripts/telemetry/extract.mjs
var HOOK_ERROR_SUBTYPES = /* @__PURE__ */ new Set([
  "hook_non_blocking_error",
  "hook_cancelled"
]);
var COMMAND_NAME_RE = /<command-name>([^<]+)<\/command-name>/;
function extractEvents(jsonlText) {
  const uses = [];
  const useIds = /* @__PURE__ */ new Set();
  const resultById = /* @__PURE__ */ new Map();
  const standalone = [];
  for (const line of jsonlText.split("\n")) {
    if (!line) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch {
      continue;
    }
    const ts = obj.timestamp ? Date.parse(obj.timestamp) : NaN;
    if (obj.type === "attachment" && typeof obj.attachment?.hookName === "string") {
      const att = obj.attachment;
      standalone.push({
        name: "hook",
        hookName: att.hookName,
        hookEvent: typeof att.hookEvent === "string" ? att.hookEvent : void 0,
        ts,
        latencyMs: Number.isFinite(att.durationMs) ? att.durationMs : void 0,
        isError: HOOK_ERROR_SUBTYPES.has(att.type)
      });
      continue;
    }
    if (obj.type === "user" && typeof obj.message?.content === "string") {
      const match = obj.message.content.match(COMMAND_NAME_RE);
      if (match) {
        standalone.push({
          name: "command",
          command: match[1].replace(/^\//, ""),
          ts
        });
      }
      continue;
    }
    const content = obj.message && Array.isArray(obj.message.content) ? obj.message.content : [];
    for (const block of content) {
      if (block.type === "tool_use" && obj.type === "assistant") {
        if (typeof block.id === "string") {
          if (useIds.has(block.id)) continue;
          useIds.add(block.id);
        }
        const input = block.input || {};
        uses.push({
          id: block.id,
          name: block.name,
          subagentType: input.subagent_type,
          skill: input.skill,
          workflow: block.name === "Workflow" ? input.name : void 0,
          mcpServer: typeof block.name === "string" && block.name.startsWith("mcp__") ? block.name.split("__")[1] : void 0,
          // Model behind this tool fire, from the same assistant line's usage-bearing
          // header. Identity only. Defaults to "unknown" downstream in aggregate.mjs.
          model: typeof obj.message?.model === "string" ? obj.message.model : void 0,
          // The asset the transcript stamped as active when this tool fired, used by
          // resolve.mjs as an ambient-attribution fallback for unattributed Bash/Read:
          // attributionSkill on the main thread, attributionAgent inside a subagent's
          // own transcript, attributionMcpServer when an MCP context is active.
          attributionSkill: typeof obj.attributionSkill === "string" ? obj.attributionSkill : void 0,
          attributionAgent: typeof obj.attributionAgent === "string" ? obj.attributionAgent : void 0,
          attributionMcpServer: typeof obj.attributionMcpServer === "string" ? obj.attributionMcpServer : void 0,
          ts
        });
      } else if (block.type === "tool_result" && obj.type === "user") {
        resultById.set(block.tool_use_id, {
          isError: Boolean(block.is_error),
          ts
        });
      }
    }
  }
  const toolEvents = uses.map((use) => {
    const result = resultById.get(use.id);
    return {
      name: use.name,
      subagentType: use.subagentType,
      skill: use.skill,
      workflow: use.workflow,
      mcpServer: use.mcpServer,
      model: use.model,
      attributionSkill: use.attributionSkill,
      attributionAgent: use.attributionAgent,
      attributionMcpServer: use.attributionMcpServer,
      ts: use.ts,
      latencyMs: result && Number.isFinite(result.ts) && Number.isFinite(use.ts) ? Math.max(0, result.ts - use.ts) : void 0,
      isError: result ? result.isError : void 0
    };
  });
  return [...toolEvents, ...standalone];
}

// scripts/telemetry/resolve.mjs
function buildCatalogIndex(catalog) {
  const index = /* @__PURE__ */ new Map();
  for (const asset of catalog.assets || []) {
    index.set(`${asset.type}:${asset.slug}`, {
      id: asset.id,
      tenantId: asset.tenantId
    });
  }
  return index;
}
function namespaceTail(value) {
  const at = value.lastIndexOf(":");
  return at >= 0 ? value.slice(at + 1) : void 0;
}
function hookSlug(hookName) {
  return hookName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function resolveEvent(event, index, aliases = {}) {
  const candidates = [];
  if (event.subagentType) {
    candidates.push(["subagent", event.subagentType]);
    const tail = namespaceTail(event.subagentType);
    if (tail) candidates.push(["subagent", tail]);
  }
  if (event.skill) {
    candidates.push(["skill", event.skill]);
    candidates.push(["command", event.skill]);
    const tail = namespaceTail(event.skill);
    if (tail) {
      candidates.push(["skill", tail]);
      candidates.push(["command", tail]);
    }
  }
  if (event.mcpServer) candidates.push(["mcp-server", event.mcpServer]);
  if (event.workflow) candidates.push(["workflow", event.workflow]);
  if (event.hookName) candidates.push(["hook", hookSlug(event.hookName)]);
  if (event.command) {
    candidates.push(["command", event.command]);
    candidates.push(["skill", event.command]);
    candidates.push(["prompt", event.command]);
    const tail = namespaceTail(event.command);
    if (tail) {
      candidates.push(["command", tail]);
      candidates.push(["skill", tail]);
      candidates.push(["prompt", tail]);
    }
  }
  if (event.attributionSkill) {
    candidates.push(["skill", event.attributionSkill]);
    const tail = namespaceTail(event.attributionSkill);
    if (tail) candidates.push(["skill", tail]);
  }
  if (event.attributionAgent) {
    candidates.push(["subagent", event.attributionAgent]);
    const tail = namespaceTail(event.attributionAgent);
    if (tail) candidates.push(["subagent", tail]);
  }
  if (event.attributionMcpServer) {
    candidates.push(["mcp-server", event.attributionMcpServer]);
    const tail = namespaceTail(event.attributionMcpServer);
    if (tail) candidates.push(["mcp-server", tail]);
  }
  for (const [type, rawSlug] of candidates) {
    const slug = aliases[`${type}:${rawSlug}`] || rawSlug;
    const hit = index.get(`${type}:${slug}`);
    if (hit) return hit;
  }
  return null;
}

// scripts/collect/scanAssets.mjs
import {
  existsSync,
  readFileSync,
  readdirSync,
  realpathSync,
  statSync
} from "node:fs";
import { basename, dirname, join } from "node:path";
function slugify(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
function parseFrontmatter(content) {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { frontmatter: {}, body: content.trim() };
  const frontmatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) frontmatter[kv[1]] = kv[2].trim().replace(/^["']|["']$/g, "");
  }
  return { frontmatter, body: match[2].trim() };
}
function assetFromFile({ type, name, content }) {
  const { frontmatter, body } = parseFrontmatter(content);
  const assetName = (frontmatter.name || name || "").trim();
  if (!assetName) return null;
  return {
    type,
    name: assetName,
    slug: slugify(assetName) || "asset",
    description: (frontmatter.description || "").trim(),
    body,
    version: (frontmatter.version || "1.0.0").trim()
  };
}
function findSkillFiles(dir, out, depth = 0, seen = /* @__PURE__ */ new Set()) {
  if (depth > 10) return;
  let real;
  try {
    real = realpathSync(dir);
  } catch {
    return;
  }
  if (seen.has(real)) return;
  seen.add(real);
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    let isDir = entry.isDirectory();
    let isFile = entry.isFile();
    if (entry.isSymbolicLink()) {
      try {
        const st = statSync(full);
        isDir = st.isDirectory();
        isFile = st.isFile();
      } catch {
        continue;
      }
    }
    if (isDir) findSkillFiles(full, out, depth + 1, seen);
    else if (isFile && entry.name.toLowerCase() === "skill.md") out.push(full);
  }
}
function scanClaudeAssetSources(claudeDir) {
  const found = [];
  const add = (type, name, file) => {
    let content;
    try {
      content = readFileSync(file, "utf8");
    } catch {
      return;
    }
    const asset = assetFromFile({ type, name, content });
    if (asset) found.push({ asset, sourcePath: file });
  };
  const skillsDir = join(claudeDir, "skills");
  let skillEntries = [];
  try {
    skillEntries = readdirSync(skillsDir, { withFileTypes: true });
  } catch {
    skillEntries = [];
  }
  for (const entry of skillEntries) {
    if (!entry.isDirectory()) continue;
    const skillMd = join(skillsDir, entry.name, "SKILL.md");
    if (existsSync(skillMd)) add("skill", entry.name, skillMd);
  }
  const pluginSkills = [];
  findSkillFiles(join(claudeDir, "plugins"), pluginSkills);
  for (const file of pluginSkills) add("skill", basename(dirname(file)), file);
  for (const [dir, type] of [
    ["agents", "subagent"],
    ["commands", "command"]
  ]) {
    let entries = [];
    try {
      entries = readdirSync(join(claudeDir, dir), { withFileTypes: true });
    } catch {
      entries = [];
    }
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
      add(
        type,
        entry.name.replace(/\.md$/, ""),
        join(claudeDir, dir, entry.name)
      );
    }
  }
  const seen = /* @__PURE__ */ new Set();
  return found.filter(({ asset }) => {
    const key = `${asset.type}:${asset.slug}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function scanClaudeAssets(claudeDir) {
  return scanClaudeAssetSources(claudeDir).map(({ asset }) => asset);
}

// scripts/living-vault-collect.mjs
var PLACEHOLDER_TENANT = "00000000-0000-0000-0000-000000000000";
function parseArgs(argv) {
  const args = { command: argv[2], out: void 0, home: void 0 };
  for (let i = 3; i < argv.length; i += 1) {
    if (argv[i] === "--out") args.out = argv[i += 1];
    else if (argv[i] === "--home") args.home = argv[i += 1];
  }
  return args;
}
var isoDate = (ts) => new Date(ts).toISOString().slice(0, 10);
function walkJsonl(dir) {
  if (!existsSync2(dir)) return [];
  const out = [];
  for (const entry of readdirSync2(dir)) {
    const full = join2(dir, entry);
    let stat;
    try {
      stat = statSync2(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) out.push(...walkJsonl(full));
    else if (entry.endsWith(".jsonl")) out.push(full);
  }
  return out;
}
function writeJson(path, value, label) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}
`);
  console.log(label);
}
function emitAssets(assets, out) {
  const path = out ?? "./living-vault-assets.json";
  writeJson(
    path,
    { source: "living-vault-collect", version: 1, assets },
    `assets: ${assets.length} found -> ${path}`
  );
}
function emitTelemetry(assets, claudeDir, out) {
  const catalog = {
    assets: assets.map((asset) => ({
      type: asset.type,
      slug: asset.slug,
      id: `cc-${asset.type}-${asset.slug}`,
      tenantId: PLACEHOLDER_TENANT
    }))
  };
  const index = buildCatalogIndex(catalog);
  const idToTypeSlug = new Map(
    catalog.assets.map((asset) => [
      asset.id,
      { type: asset.type, slug: asset.slug }
    ])
  );
  const files = walkJsonl(join2(claudeDir, "projects"));
  const resolved = [];
  let earliest = Infinity;
  let latest = -Infinity;
  for (const file of files) {
    let events;
    try {
      events = extractEvents(readFileSync2(file, "utf8"));
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
        latencyMs: event.latencyMs
      });
    }
  }
  const rows = aggregate(resolved);
  const meta = {
    source: "claude-code",
    generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
    windowStart: Number.isFinite(earliest) ? isoDate(earliest) : isoDate(Date.now()),
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
      model: true
    }
  };
  const envelope = {
    source: "telemetry-upload",
    version: 1,
    meta,
    rows: rows.map((row) => {
      const identity = idToTypeSlug.get(row.assetId);
      return identity ? { ...row, sourceType: identity.type, sourceSlug: identity.slug } : { ...row };
    })
  };
  const path = out ?? "./utilization.upload.json";
  writeJson(
    path,
    envelope,
    `telemetry: ${files.length} transcripts, ${envelope.rows.length} rows -> ${path}`
  );
}
function main() {
  const { command, out, home } = parseArgs(process.argv);
  const claudeDir = home ?? join2(homedir(), ".claude");
  if (command !== "assets" && command !== "telemetry") {
    console.error(
      "Usage: node living-vault-collect.mjs <assets|telemetry> [--out file] [--home dir]"
    );
    process.exit(1);
  }
  if (!existsSync2(claudeDir)) {
    console.error(
      `No Claude home found at ${claudeDir} (override with --home).`
    );
    process.exit(1);
  }
  const assets = scanClaudeAssets(claudeDir);
  if (command === "assets") emitAssets(assets, out);
  else emitTelemetry(assets, claudeDir, out);
}
main();
