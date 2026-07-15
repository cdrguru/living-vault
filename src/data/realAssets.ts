import { contentHashOf } from "./hash";
import demoSource from "./imports/real-assets.demo.json";
import type { ProjectionInput } from "./merge";
import type {
  AssetRow,
  AssetDependencyRow,
  AssetTagRow,
  BundleMembershipRow,
  AssetType,
  AssetStatus,
  AssetTier,
  RiskLevel,
} from "./types";

/**
 * The agentic asset overlay merged into the seed dataset so the catalog and monitor
 * show assets out of the box.
 *
 * Privacy gate (see docs/PRIVACY.md): the committed overlay is the NEUTRAL synthetic
 * real-assets.demo.json, which ships in public builds and is used by tests. The
 * owner's real overlay lives only in the gitignored real-assets.local.json and is
 * read ONLY on the interactive dev server (import.meta.env.DEV and not the test
 * runner). Production builds and CI have no local file, so no owner identity or
 * asset list can ship. This module is Node-safe (the import.meta access is guarded
 * with typeof) so the demo telemetry generator, which imports it through seed.ts,
 * resolves to the neutral demo overlay without an import.meta.env.
 *
 * The id rule below is duplicated verbatim in scripts/vault-telemetry.mjs so the
 * producer resolves usage to the same asset ids the dataset carries. Keep in sync.
 */
export const OVERLAY_TENANT = "tenant-fabricagent";

interface RealAssetRecord {
  type: AssetType;
  slug: string;
  name: string;
  tier: AssetTier;
  riskLevel: RiskLevel;
  maturity: number;
  status: AssetStatus;
  capability: string;
  /** Optional bundle key; absent means the default toolkit bundle. */
  bundle?: string;
  /** Optional one-line description; absent falls back to a generated sentence. */
  summary?: string;
  /**
   * Ungoverned by design: a believable lower-stakes asset used but never formally
   * governed. When true the overlay records no origin (originId stays undefined) and
   * emits no tag rows, so the asset fails the origin and tag governance checks
   * (governedScore 4/6 = 0.667, below the 0.8 bar) while keeping a description and
   * owner so it still reads as a real working asset. This is contract-clean because
   * Asset.origin is an optional FK and an untagged asset leaves no dangling assetTag
   * row. It seeds the Risks and Dead weight quadrants.
   */
  ungoverned?: boolean;
}

/**
 * Display strings that identify the overlay source. Owner-identifying values live in
 * the gitignored real-assets.local.json; the committed demo overlay supplies neutral
 * values, so public builds carry no owner identity. Structural ids (tenant, tag,
 * origin, owner, bundle ids) stay constants below, shared by both sources.
 */
interface OverlayIdentity {
  ownerName: string;
  ownerEmail: string;
  originName: string;
  domainTagName: string;
  toolkitBundleName: string;
  toolkitBundleDescription: string;
  rayfinBundleName: string;
  rayfinBundleDescription: string;
  pbiBundleName: string;
  pbiBundleDescription: string;
}

interface OverlaySource {
  identity: OverlayIdentity;
  assets: RealAssetRecord[];
}

/** Deterministic overlay asset id. Mirrored in scripts/vault-telemetry.mjs. */
export function realAssetId(type: string, slug: string): string {
  return `cc-${type}-${slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")}`;
}

const OVERLAY_DOMAIN_TAG = "tag-d-cc";
const OVERLAY_ORIGIN = "org-cc";
const OVERLAY_OWNER = "own-cc";
const OVERLAY_BUNDLE = "bun-cc";
const RAYFIN_BUNDLE = "bun-rayfin";
const PBI_PROMPT_BUNDLE = "bun-pbi-prompts";

// Bundle key on a record to the overlay bundle id it joins. An absent or unknown key
// lands in the default toolkit bundle.
const BUNDLE_BY_KEY: Record<string, string> = {
  "rayfin-suite": RAYFIN_BUNDLE,
  "pbi-prompts": PBI_PROMPT_BUNDLE,
};

const bundleIdFor = (record: RealAssetRecord): string =>
  (record.bundle && BUNDLE_BY_KEY[record.bundle]) || OVERLAY_BUNDLE;

// Capability name to the seed capability tag id it reuses. Unmapped capabilities
// fall back to the ai-platform tag so every overlay asset carries a capability.
const CAPABILITY_TAG: Record<string, string> = {
  quality: "tag-c-0",
  research: "tag-c-1",
  devops: "tag-c-2",
  frontend: "tag-c-3",
  "ai-platform": "tag-c-9",
};

const isoDay = (daysAgo: number): string =>
  new Date(Date.UTC(2026, 5, 10) - daysAgo * 86_400_000)
    .toISOString()
    .slice(0, 19) + "Z";

function describe(record: RealAssetRecord): string {
  if (record.summary) return record.summary;
  const noun =
    record.type === "subagent"
      ? "subagent"
      : record.type === "mcp-server"
        ? "MCP server"
        : record.type === "hook"
          ? "hook"
          : record.type === "command"
            ? "command"
            : record.type === "prompt"
              ? "prompt"
              : "skill";
  return `${record.name} is a ${record.tier} ${noun} invoked from the agent harness.`;
}

/**
 * Pure projection builder: turns a set of records plus the source identity into the
 * overlay ProjectionInput. The dimension display strings (owner, origin, tags,
 * bundles) come from the identity, so the same builder produces the owner overlay on
 * the dev server and the neutral demo overlay everywhere else.
 */
export function buildRealAssetsProjection(
  records: RealAssetRecord[],
  identity: OverlayIdentity,
): ProjectionInput {
  const assets: AssetRow[] = records.map((record, index) => {
    const description = describe(record);
    const body = `# ${record.name}\n\n${description}\n`;
    return {
      id: realAssetId(record.type, record.slug),
      tenantId: OVERLAY_TENANT,
      type: record.type,
      name: record.name,
      slug: record.slug,
      description,
      body,
      version: "1.0.0",
      status: record.status,
      riskLevel: record.riskLevel,
      maturity: record.maturity,
      tier: record.tier,
      contentHash: contentHashOf(record.type, body),
      ownerId: OVERLAY_OWNER,
      originId: record.ungoverned ? undefined : OVERLAY_ORIGIN,
      createdAt: isoDay(120 + (index % 30)),
      updatedAt: isoDay(index % 30),
    };
  });

  const assetTags: AssetTagRow[] = records.flatMap((record) => {
    if (record.ungoverned) return [];
    const assetId = realAssetId(record.type, record.slug);
    const capabilityTag =
      CAPABILITY_TAG[record.capability] ?? CAPABILITY_TAG["ai-platform"];
    return [
      { assetId, tagId: OVERLAY_DOMAIN_TAG },
      { assetId, tagId: capabilityTag },
    ];
  });

  const bundleMemberships: BundleMembershipRow[] = records.map((record) => ({
    bundleId: bundleIdFor(record),
    assetId: realAssetId(record.type, record.slug),
  }));

  // Flagship dependency edges so the recognizable Stars a presenter opens first
  // have populated Requires / Required-by panels (the subagents require skills, and
  // the regressing flagships read as required-by). Only edges whose endpoints both
  // exist in the overlay survive, so a renamed record drops its edge instead of
  // dangling. Targets are all live, so none of these read as fragile.
  const overlayIds = new Set(assets.map((asset) => asset.id));
  const dependencies: AssetDependencyRow[] = [
    {
      assetId: "cc-subagent-example-helper",
      dependsOnAssetId: "cc-skill-starter-scaffolder",
    },
    {
      assetId: "cc-subagent-example-helper",
      dependsOnAssetId: "cc-skill-sample-data-modeler",
    },
    {
      assetId: "cc-subagent-demo-reviewer",
      dependsOnAssetId: "cc-skill-example-test-runner",
    },
    {
      assetId: "cc-subagent-demo-reviewer",
      dependsOnAssetId: "cc-skill-sample-app-builder",
    },
    {
      assetId: "cc-subagent-demo-reviewer",
      dependsOnAssetId: "cc-mcp-server-example-docs-server",
    },
    {
      assetId: "cc-skill-sample-report-builder",
      dependsOnAssetId: "cc-skill-sample-data-modeler",
    },
    {
      assetId: "cc-skill-sample-ui-refiner",
      dependsOnAssetId: "cc-skill-starter-scaffolder",
    },
  ].filter(
    (edge) =>
      overlayIds.has(edge.assetId) && overlayIds.has(edge.dependsOnAssetId),
  );

  return {
    assets,
    tags: [
      {
        id: OVERLAY_DOMAIN_TAG,
        tenantId: OVERLAY_TENANT,
        kind: "domain",
        name: identity.domainTagName,
      },
    ],
    origins: [
      {
        id: OVERLAY_ORIGIN,
        tenantId: OVERLAY_TENANT,
        name: identity.originName,
        kind: "local",
      },
    ],
    owners: [
      {
        id: OVERLAY_OWNER,
        tenantId: OVERLAY_TENANT,
        name: identity.ownerName,
        email: identity.ownerEmail,
        role: "maintainer",
      },
    ],
    bundles: [
      {
        id: OVERLAY_BUNDLE,
        tenantId: OVERLAY_TENANT,
        name: identity.toolkitBundleName,
        description: identity.toolkitBundleDescription,
      },
      {
        id: RAYFIN_BUNDLE,
        tenantId: OVERLAY_TENANT,
        name: identity.rayfinBundleName,
        description: identity.rayfinBundleDescription,
      },
      {
        id: PBI_PROMPT_BUNDLE,
        tenantId: OVERLAY_TENANT,
        name: identity.pbiBundleName,
        description: identity.pbiBundleDescription,
      },
    ],
    assetTags,
    dependencies,
    bundleMemberships,
  };
}

// Source selection. import.meta.env exists only under Vite; Node/tsx tooling that
// imports this module through seed.ts (the demo telemetry generator) has no
// import.meta.env, so the access is guarded with typeof and there the neutral demo
// overlay is used. The owner's real overlay (real-assets.local.json, gitignored) is
// read ONLY on the interactive dev server (DEV and not the test runner), so Vitest,
// CI, and production builds use the committed neutral demo overlay. The glob targets
// only the gitignored local file, which is absent in CI and production, so no owner
// overlay can be bundled regardless.
const overlayIsDev =
  typeof import.meta.env !== "undefined" &&
  import.meta.env.DEV === true &&
  import.meta.env.MODE !== "test";

const localModules = (
  overlayIsDev
    ? import.meta.glob("./imports/real-assets.local.json", { eager: true })
    : {}
) as Record<string, { default: OverlaySource }>;

const overlaySource: OverlaySource =
  Object.values(localModules)[0]?.default ??
  (demoSource as unknown as OverlaySource);

/**
 * True only when the owner's gitignored real overlay (real-assets.local.json) was
 * found and loaded, i.e. on the interactive dev server with the file present. False
 * for the neutral demo overlay (tests, CI, production, node/tsx tooling). seed.ts
 * keys its real-only seeding off this so the owner's dev catalog shows ONLY their
 * real assets, while the public demo build keeps the synthetic seed.
 */
export const isRealOverlayActive: boolean =
  Object.values(localModules).length > 0;

export const realAssetsProjection: ProjectionInput = buildRealAssetsProjection(
  overlaySource.assets,
  overlaySource.identity,
);
