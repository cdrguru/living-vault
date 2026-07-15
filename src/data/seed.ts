import { evalSnapshot } from "./evalSnapshot";
import { modelRate } from "./harnessCost";
import { contentHashOf } from "./hash";
import demoTelemetry from "./imports/utilization.json";
import { mergeProjection } from "./merge";
import { isRealOverlayActive, realAssetsProjection } from "./realAssets";
import type {
  AssetDependencyRow,
  AssetRow,
  AssetTagRow,
  BundleMembershipRow,
  BundleRow,
  OriginRow,
  OwnerRow,
  TagRow,
  UtilizationRow,
  VaultDataset,
} from "./types";

export const TENANT = "tenant-fabricagent";

function rng(seed: number): () => number {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6d2b79f5) | 0;
    let step = Math.imul(value ^ (value >>> 15), 1 | value);
    step = (step + Math.imul(step ^ (step >>> 7), 61 | step)) ^ step;
    return ((step ^ (step >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = rng(20260605);
const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];

/** Named Claude models for synthetic demo telemetry; ~35% of rows omit model (hooks/commands). */
const SEED_MODELS = [
  "claude-opus-4-8",
  "claude-sonnet-4-6",
  "claude-opus-4-7",
  "claude-haiku-4-5-20251001",
  "claude-fable-5",
] as const;

function seedModel(): string | undefined {
  if (rand() < 0.35) return undefined;
  return pick([...SEED_MODELS]);
}
const iso = (daysAgo: number): string =>
  new Date(Date.UTC(2026, 5, 5) - daysAgo * 86_400_000).toISOString();
const isoDate = (daysAgo: number): string => iso(daysAgo).slice(0, 10);

const domains = [
  "fabric",
  "powerbi",
  "northwind",
  "security",
  "meta",
  "prompt-lib",
];
const capabilities = [
  "quality",
  "research",
  "devops",
  "frontend",
  "scaffolding",
  "document-processing",
  "media",
  "marketing",
  "finops",
  "ai-platform",
];

// Coverage pillars: the broad functional areas the Coverage matrix scores against
// the capability columns. Four synthetic pillars give the matrix a credible
// partial story (several covered cells and visible gaps) on load, instead of the
// empty "Not configured" setup CTA that shows when no pillar tags exist.
const pillars = ["Engineering", "Operations", "Analytics", "Governance"];

const tags: TagRow[] = [
  ...domains.map((name, index) => ({
    id: `tag-d-${index}`,
    tenantId: TENANT,
    kind: "domain" as const,
    name,
  })),
  ...capabilities.map((name, index) => ({
    id: `tag-c-${index}`,
    tenantId: TENANT,
    kind: "capability" as const,
    name,
  })),
  ...pillars.map((name, index) => ({
    id: `tag-p-${index}`,
    tenantId: TENANT,
    kind: "pillar" as const,
    name,
  })),
];
const pillarTagIds = tags
  .filter((tag) => tag.kind === "pillar")
  .map((tag) => tag.id);
const domainTagIds = tags
  .filter((tag) => tag.kind === "domain")
  .map((tag) => tag.id);
const capTagIds = tags
  .filter((tag) => tag.kind === "capability")
  .map((tag) => tag.id);

const origins: OriginRow[] = [
  {
    id: "org-giac",
    tenantId: TENANT,
    name: "Guy in a Cube",
    kind: "giac",
    url: "https://youtube.com/@GuyInACube",
  },
  {
    id: "org-vault",
    tenantId: TENANT,
    name: "example-vault",
    kind: "repo",
    url: "https://example.com/acme/example-vault",
  },
  {
    id: "org-fabricagent",
    tenantId: TENANT,
    name: "Example Prompts",
    kind: "url",
    url: "https://example.com",
  },
  { id: "org-local", tenantId: TENANT, name: "local", kind: "local" },
  { id: "org-plugin", tenantId: TENANT, name: "plugin", kind: "plugin" },
];

const owners: OwnerRow[] = [
  {
    id: "own-admin",
    tenantId: TENANT,
    name: "Demo Admin",
    email: "admin@example.com",
    role: "admin",
  },
  {
    id: "own-ava",
    tenantId: TENANT,
    name: "Ava Thompson",
    email: "ava@example.com",
    role: "maintainer",
  },
  {
    id: "own-lee",
    tenantId: TENANT,
    name: "Lee Park",
    email: "lee@example.com",
    role: "author",
  },
];

const bundles: BundleRow[] = [
  {
    id: "bun-fabric",
    tenantId: TENANT,
    name: "Power BI / Fabric",
    description: "DAX, TMDL, Power Query, themes, and visual standards.",
  },
  {
    id: "bun-core",
    tenantId: TENANT,
    name: "Core Ops",
    description: "Code review, QA, repo exploration, and research.",
  },
  {
    id: "bun-sales",
    tenantId: TENANT,
    name: "Sales Ops",
    description: "Northwind sales and customer workflow assets.",
  },
];

const stockNames: Record<AssetRow["type"], string[]> = {
  // The 12 stock Power BI prompts are real slash prompts in the overlay (the owner's
  // gitignored real-assets.local.json on the dev server; the committed
  // real-assets.demo.json is neutral), so they are intentionally absent here. The
  // synthetic seed keeps only the fictional
  // custom-tier prompts (customNames) and the forked-prompt demo below.
  prompt: [],
  skill: [
    "validating-pbip-tmdl",
    "generating-rayfin-seed-data",
    "pbi-dax-audit",
    "fabric-sql-push",
    "northwind-branding",
    "deep-research",
    "security-audit",
    "humanizer",
  ],
  subagent: ["code-reviewer", "deep-researcher", "repo-explorer", "qa-tester"],
  "mcp-server": ["fabric-cli-mcp", "github-mcp", "playwright-mcp"],
  hook: ["pre-commit-secret-scan", "post-edit-formatter"],
  command: ["/code-review", "/simplify", "/security-review"],
  workflow: ["review-changes", "migrate-tmdl"],
};
const customNames = [
  "ACME RLS Policy",
  "Contoso Margin Measures",
  "Northwind Refresh Runbook",
  "Internal Brand Theme",
  "Q3 Exec Summary Prompt",
  "Support Triage Subagent",
  "Vendor Cost Loader",
  "Helpdesk Macro Pack",
];

const assets: AssetRow[] = [];
const assetTags: AssetTagRow[] = [];
let nextAsset = 0;

function addAsset(opts: {
  type: AssetRow["type"];
  name: string;
  tier: AssetRow["tier"];
  status?: AssetRow["status"];
  risk?: AssetRow["riskLevel"];
  maturity?: number;
  stockVersion?: string;
  ageDays: number;
  owner?: string;
  origin: string;
}) {
  const id = `as-${nextAsset}`;
  nextAsset += 1;
  const body = `# ${opts.name}\nObjective: ${opts.name}. Steps: clarify, map, draft, validate, optimize, verify.`;
  assets.push({
    id,
    tenantId: TENANT,
    type: opts.type,
    name: opts.name,
    slug: opts.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, ""),
    description: `Expert guidance for ${opts.name}.`,
    body,
    version: opts.tier === "forked" ? "1.2.0-local" : "1.0.0",
    status: opts.status ?? "active",
    riskLevel: opts.risk ?? "low",
    maturity: opts.maturity ?? 0.5 + rand() * 0.5,
    tier: opts.tier,
    stockVersion: opts.stockVersion,
    contentHash: contentHashOf(opts.type, body),
    ownerId: opts.owner,
    originId: opts.origin,
    createdAt: iso(opts.ageDays + 30),
    updatedAt: iso(opts.ageDays),
  });
  assetTags.push({ assetId: id, tagId: pick(domainTagIds) });
  assetTags.push({ assetId: id, tagId: pick(capTagIds) });
  if (rand() > 0.5) assetTags.push({ assetId: id, tagId: pick(capTagIds) });
  return id;
}

for (const [type, names] of Object.entries(stockNames)) {
  for (const name of names) {
    addAsset({
      type: type as AssetRow["type"],
      name,
      tier: "stock",
      risk: pick(["low", "low", "medium"] as const),
      maturity: 0.7 + rand() * 0.3,
      ageDays: Math.floor(rand() * 90),
      owner: pick(["own-admin", "own-ava"]),
      origin: pick(["org-vault", "org-giac", "org-fabricagent"]),
    });
  }
}

for (const name of customNames) {
  const incomplete = rand() > 0.5;
  const id = addAsset({
    type: pick(["prompt", "skill", "subagent"] as const),
    name,
    tier: "custom",
    risk: pick(["low", "medium", "high"] as const),
    maturity: 0.2 + rand() * 0.5,
    ageDays: Math.floor(rand() * 200),
    owner: incomplete ? undefined : "own-lee",
    origin: "org-local",
  });
  if (incomplete) {
    const asset = assets.find((row) => row.id === id);
    if (asset) asset.description = "";
  }
}

addAsset({
  type: "skill",
  name: "pbi-dax-audit local fork",
  tier: "forked",
  stockVersion: "1.0.0",
  maturity: 0.6,
  ageDays: 240,
  owner: "own-lee",
  origin: "org-local",
});
addAsset({
  type: "prompt",
  name: "Star-Schema First DAX local fork",
  tier: "forked",
  stockVersion: "1.0.0",
  maturity: 0.55,
  ageDays: 300,
  owner: "own-lee",
  origin: "org-local",
});

const duplicateSource = assets.find(
  (asset) => asset.type === "skill" && asset.tier === "stock",
);
if (duplicateSource) {
  const id = `as-${nextAsset}`;
  nextAsset += 1;
  assets.push({
    ...duplicateSource,
    id,
    name: `${duplicateSource.name} copy`,
    slug: `${duplicateSource.slug}-copy`,
    tier: "custom",
    ownerId: undefined,
    originId: "org-local",
    createdAt: iso(120),
    updatedAt: iso(120),
  });
  assetTags.push({ assetId: id, tagId: pick(domainTagIds) });
}

// A deprecated and a retired skill that live assets still depend on, so the
// Dependencies "fragile edges" KPI, the amber/red inspector chips, and the Monitor
// "fragile-deps" exception kind all have a break-waiting-to-happen to show.
const deprecatedSkillId = addAsset({
  type: "skill",
  name: "Legacy TMDL Linter",
  tier: "stock",
  status: "deprecated",
  maturity: 0.4,
  ageDays: 220,
  owner: "own-admin",
  origin: "org-vault",
});
const retiredSkillId = addAsset({
  type: "skill",
  name: "Old Dataflow Validator",
  tier: "stock",
  status: "retired",
  maturity: 0.3,
  ageDays: 400,
  owner: "own-admin",
  origin: "org-vault",
});

const dependencies: AssetDependencyRow[] = [];
const skills = assets.filter((asset) => asset.type === "skill");
for (const dependent of assets.filter(
  (asset) => asset.type === "subagent" || asset.type === "workflow",
)) {
  const dependency = pick(skills);
  if (dependency.id !== dependent.id) {
    dependencies.push({
      assetId: dependent.id,
      dependsOnAssetId: dependency.id,
    });
  }
}

// Two guaranteed fragile edges: a live subagent/workflow depends on each of the
// deprecated and retired skills above, so the fragile-dependency story is never
// empty regardless of what the random wiring above picked.
const hasEdge = (from: string, to: string): boolean =>
  dependencies.some((e) => e.assetId === from && e.dependsOnAssetId === to);
const liveDependents = assets.filter(
  (asset) =>
    (asset.type === "subagent" || asset.type === "workflow") &&
    asset.status === "active",
);
if (liveDependents[0] && !hasEdge(liveDependents[0].id, deprecatedSkillId)) {
  dependencies.push({
    assetId: liveDependents[0].id,
    dependsOnAssetId: deprecatedSkillId,
  });
}
if (liveDependents[1] && !hasEdge(liveDependents[1].id, retiredSkillId)) {
  dependencies.push({
    assetId: liveDependents[1].id,
    dependsOnAssetId: retiredSkillId,
  });
}

const bundleMemberships: BundleMembershipRow[] = assets
  .filter((asset) => asset.tier === "stock")
  .slice(0, 12)
  .map((asset) => ({ bundleId: "bun-fabric", assetId: asset.id }));

const utilization: UtilizationRow[] = [];
let nextUtilization = 0;
for (const asset of assets) {
  const base = asset.tier === "stock" ? 30 + rand() * 60 : rand() * 25;
  const successBias = asset.description ? 0.9 : 0.6;
  for (let daysAgo = 0; daysAgo < 30; daysAgo += 1) {
    const invocations = Math.max(0, Math.round(base * (0.6 + rand() * 0.8)));
    if (invocations === 0) continue;
    const successes = Math.min(
      invocations,
      Math.round(invocations * (successBias - rand() * 0.2)),
    );
    const errors = Math.round((invocations - successes) * 0.7);
    const model = seedModel();
    const latencyMs = Math.round(400 + rand() * 1600);
    const tokens = invocations * Math.round(500 + rand() * 2500);
    utilization.push({
      id: `ut-${nextUtilization}`,
      tenantId: TENANT,
      assetId: asset.id,
      date: isoDate(daysAgo),
      model,
      invocations,
      successes,
      errors,
      refusals: invocations - successes - errors,
      latencyMs,
      tokens,
      // Cost coheres with this row's own tokens at the row's model list rate
      // (it used to be an independent random draw, implying nonsense rates).
      cost: Number(((tokens / 1_000_000) * modelRate(model ?? null)).toFixed(6)),
    });
    nextUtilization += 1;
  }
}

// Assign pillars deterministically (no rand(), so the existing seed sequence is
// untouched). Each seed asset already carries one or two capability tags; pairing
// it with a pillar populates the (pillar x capability) coverage cells it sits in.
// Most assets get a pillar; every 3rd is skipped so some pillar x capability
// intersections stay empty, giving the Coverage matrix a credible partial story
// (several well-covered cells AND visible gaps) rather than a full or empty grid.
assets.forEach((asset, index) => {
  if (index % 3 === 2) return; // a deliberate gap, so coverage is not 100%
  const pillarId = pillarTagIds[index % pillarTagIds.length];
  assetTags.push({ assetId: asset.id, tagId: pillarId });
});

/**
 * The seed catalog and taxonomy BEFORE the real-assets overlay is merged. Exported
 * so node-side tooling (the MCP's src/mcp/dataset.ts) can merge the owner's real
 * overlay onto a demo-overlay-free base: under node/tsx the DEV-gated realAssets
 * overlay is always the neutral demo, so the MCP rebuilds from baseDataset + the
 * real overlay it reads from disk. The SPA still uses seedDataset (below), which
 * keeps the demo overlay for the public build.
 */
export const baseDataset: VaultDataset = {
  assets,
  tags,
  origins,
  owners,
  bundles,
  assetTags,
  dependencies,
  bundleMemberships,
  utilization,
  evalResults: [],
};

/**
 * The real-only seed base: the shared tag vocabulary (domain, capability, pillar)
 * with NO demo assets or asset-dependent rows. The overlay's assetTags reference
 * the standard capability tags (tag-c-*) and the Coverage matrix needs the pillar
 * tags, so those must survive; owners, origins, and bundles are dropped because the
 * overlay projection supplies its own, keeping demo identities out of the catalog.
 */
const REAL_ONLY_BASE: VaultDataset = {
  assets: [],
  tags,
  origins: [],
  owners: [],
  bundles: [],
  assetTags: [],
  dependencies: [],
  bundleMemberships: [],
  utilization: [],
  evalResults: [],
};

/**
 * Compose the dataset the SPA reads, merging the real-assets overlay onto a base.
 *
 * When `realOnly` is true (the owner's interactive dev server, where the gitignored
 * real overlay is present) the base is empty, so the catalog and monitor carry ONLY
 * the owner's real assets, never the synthetic `as-*` demo fixtures. The overlay
 * projection supplies its own taxonomy, so an empty base still merges coherently.
 * When false (tests, CI, the public demo build, node/tsx tooling) the base is the
 * full synthetic seed, so the demo experience is unchanged.
 *
 * The committed src/data/imports/utilization.json is the complete synthetic demo
 * telemetry, authored by scripts/generate-demo-telemetry.mts to hit the target
 * quadrant distribution. Fold it in so a FRESH visitor (who reads seedDataset
 * directly, before any "Sync telemetry") already sees populated telemetry on
 * Overview, Effectiveness, Monitor, and Cost. It is idempotent with a later "Sync
 * telemetry" because that applies the same committed file. Rows whose assetId is
 * not in the dataset are dropped so the referential-integrity contract holds; in
 * real-only mode the owner's real telemetry arrives later via importTelemetry.
 */
export function composeSeedDataset(realOnly: boolean): VaultDataset {
  const merged = mergeProjection(
    realOnly ? REAL_ONLY_BASE : baseDataset,
    realAssetsProjection,
    TENANT,
  );
  const knownAssetIds = new Set(merged.assets.map((asset) => asset.id));
  const demoUtilization: UtilizationRow[] = (
    demoTelemetry as { rows: UtilizationRow[] }
  ).rows.filter((row) => knownAssetIds.has(row.assetId));
  // Fold the eval snapshot the same way: demo rows for a fresh visitor, the owner's real
  // evals.local.json on the dev server. Rows whose asset is absent are dropped so the
  // referential-integrity contract holds. There is no eval "sync" action yet, so unlike
  // utilization (which arrives via importTelemetry) the snapshot is folded directly.
  const demoEvalResults = evalSnapshot.rows.filter((row) =>
    knownAssetIds.has(row.assetId),
  );
  return {
    ...merged,
    utilization: demoUtilization,
    evalResults: demoEvalResults,
  };
}

/**
 * The seed dataset the SPA reads. On the owner's dev server (real overlay present)
 * it is real-only; everywhere else it keeps the synthetic demo seed.
 */
export const seedDataset: VaultDataset =
  composeSeedDataset(isRealOverlayActive);
