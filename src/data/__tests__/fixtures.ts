import { TENANT } from "@/data/seed";
import type { AssetRow, UtilizationRow, VaultDataset } from "@/data/types";

/**
 * Shared test fixture factories for the src/data suites. This file must not
 * match vitest's test glob (*.test / *.spec), so it holds no tests.
 *
 * The defaults here are the exact defaults previously duplicated in
 * metrics.test.ts and assetScore.test.ts. Files whose local defaults differ
 * (for example a different originId or tenantId) wrap these factories with
 * their own defaults instead of changing the shared ones.
 */

/**
 * A fully populated test asset. The defaults pass every governance check (so
 * tests opt into a gap), are dated recently (so not stale), and carry a unique
 * content hash per id (so not a duplicate) unless an override says otherwise.
 */
export const makeAsset = (
  id: string,
  overrides: Partial<AssetRow> = {},
): AssetRow => ({
  id,
  tenantId: TENANT,
  type: "skill",
  name: id,
  slug: id,
  description: "A described asset.",
  body: "body",
  version: "1.0.0",
  status: "active",
  riskLevel: "low",
  maturity: 0.7,
  tier: "custom",
  contentHash: `hash-${id}`,
  ownerId: "own-lee",
  originId: "org-local",
  createdAt: "2026-05-01T00:00:00.000Z",
  updatedAt: "2026-06-01T00:00:00.000Z",
  ...overrides,
});

/** A healthy utilization row: every invocation succeeds at low latency. */
export const makeUtilRow = (
  assetId: string,
  date: string,
  invocations: number,
  over: Partial<UtilizationRow> = {},
): UtilizationRow => ({
  id: `${assetId}:${date}`,
  tenantId: TENANT,
  assetId,
  date,
  invocations,
  successes: invocations,
  errors: 0,
  refusals: 0,
  latencyMs: 100,
  tokens: 0,
  cost: 0,
  ...over,
});

/** An empty VaultDataset that tests override table by table. */
export const makeDataset = (
  over: Partial<VaultDataset> = {},
): VaultDataset => ({
  assets: [],
  tags: [],
  origins: [],
  owners: [],
  bundles: [],
  assetTags: [],
  dependencies: [],
  bundleMemberships: [],
  utilization: [],
  evalResults: [],
  ...over,
});
