import { describe, expect, it } from "vitest";

import { normalizeContribution } from "./normalize";
import {
  normalizeTelemetryUpload,
  reconcileTelemetryAssetIds,
} from "./normalizeTelemetry";

/**
 * The contract between the standalone collector (scripts/living-vault-collect.mjs) and
 * the app's ingestion: the collector annotates each telemetry row with the (type, slug)
 * of one of the user's scanned assets, and the same assets are uploaded as a
 * contribution. This asserts that output reconciles cleanly through the real upload
 * path (parse -> normalize -> reconcile), i.e. the collector's slugify and the app's
 * normalizeAsset slugify agree, so telemetry actually lands. If they drift, this fails.
 */

// Shaped exactly like `living-vault-collect.mjs assets` output (frontmatter name,
// collector slug, full body), for two of the asset types the collector emits.
const collectorAssets = {
  source: "living-vault-collect",
  version: 1,
  assets: [
    {
      type: "skill",
      name: "My Skill",
      slug: "my-skill",
      description: "does things",
      body: "the skill body",
      version: "1.0.0",
    },
    {
      type: "subagent",
      name: "code-reviewer",
      slug: "code-reviewer",
      description: "reviews",
      body: "the agent body",
      version: "1.0.0",
    },
  ],
};

// Shaped exactly like `living-vault-collect.mjs telemetry` output: cc-<type>-<slug>
// ids plus the (type, slug) the row was attributed under.
const collectorTelemetry = {
  source: "telemetry-upload",
  version: 1,
  meta: {
    source: "claude-code",
    generatedAt: "2026-06-19T00:00:00.000Z",
    windowStart: "2026-06-18",
    windowEnd: "2026-06-19",
    sessions: 3,
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
  },
  rows: [
    {
      id: "cc-skill-my-skill",
      tenantId: "00000000-0000-0000-0000-000000000000",
      assetId: "cc-skill-my-skill",
      date: "2026-06-19",
      model: "claude-opus-4-8",
      invocations: 7,
      successes: 7,
      errors: 0,
      refusals: 0,
      latencyMs: 120,
      tokens: 0,
      cost: 0,
      sourceType: "skill",
      sourceSlug: "my-skill",
    },
    {
      id: "cc-subagent-code-reviewer",
      tenantId: "00000000-0000-0000-0000-000000000000",
      assetId: "cc-subagent-code-reviewer",
      date: "2026-06-19",
      model: "claude-opus-4-8",
      invocations: 2,
      successes: 2,
      errors: 0,
      refusals: 0,
      latencyMs: 90,
      tokens: 0,
      cost: 0,
      sourceType: "subagent",
      sourceSlug: "code-reviewer",
    },
  ],
};

describe("collector output reconciles through the app upload path", () => {
  it("matches every telemetry row onto the contributed catalog, none unmatched", () => {
    const projection = normalizeContribution(collectorAssets);
    const upload = normalizeTelemetryUpload(collectorTelemetry);
    const result = reconcileTelemetryAssetIds(upload.rows, projection.assets);

    expect(result.unmatchedKeys).toEqual([]);
    expect(result.matchedKeys.sort()).toEqual([
      "skill::my-skill",
      "subagent::code-reviewer",
    ]);
  });

  it("rewrites each row's assetId off the cc- id onto the contributed catalog id", () => {
    const projection = normalizeContribution(collectorAssets);
    const upload = normalizeTelemetryUpload(collectorTelemetry);
    const { rows } = reconcileTelemetryAssetIds(upload.rows, projection.assets);

    const idByType = new Map(projection.assets.map((a) => [a.type, a.id]));
    const skillRow = rows.find((r) => r.assetId === idByType.get("skill"));
    expect(skillRow).toBeDefined();
    expect(skillRow?.assetId).not.toContain("cc-");
  });
});
