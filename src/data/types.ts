export type AssetType =
  | "skill"
  | "subagent"
  | "prompt"
  | "mcp-server"
  | "hook"
  | "command"
  | "workflow";
export type AssetStatus =
  "active" | "deprecated" | "retired" | "plugin-managed" | "project-specific";
export type RiskLevel = "low" | "medium" | "high";
export type AssetTier = "stock" | "custom" | "forked";
export type TagKind = "domain" | "capability" | "pillar";
export type OriginKind = "repo" | "url" | "local" | "plugin" | "giac";
export type OwnerRole = "viewer" | "author" | "maintainer" | "admin";

// These row interfaces mirror the STORED columns of the rayfin/data entities as the
// UI consumes them after mapping. Two intentional divergences, both handled in
// rayfinMapper.ts: join rows drop their surrogate uuid `id`, and Date columns become
// ISO strings. Relationship navigation properties (the @one()/@many() decorators on
// the entities) are likewise not mirrored here: they declare the Fabric model graph
// but are never materialized into the flat VaultDataset the UI joins via metrics.
export interface AssetRow {
  id: string;
  tenantId: string;
  type: AssetType;
  name: string;
  slug: string;
  description: string;
  system?: string;
  body: string;
  version: string;
  status: AssetStatus;
  riskLevel: RiskLevel;
  maturity: number;
  tier: AssetTier;
  stockVersion?: string;
  contentHash: string;
  ownerId?: string;
  originId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface TagRow {
  id: string;
  tenantId: string;
  kind: TagKind;
  name: string;
}

export interface OriginRow {
  id: string;
  tenantId: string;
  name: string;
  kind: OriginKind;
  url?: string;
}

export interface OwnerRow {
  id: string;
  tenantId: string;
  name: string;
  email: string;
  role: OwnerRole;
}

export interface BundleRow {
  id: string;
  tenantId: string;
  name: string;
  description: string;
}

export interface AssetTagRow {
  assetId: string;
  tagId: string;
}

export interface AssetDependencyRow {
  assetId: string;
  dependsOnAssetId: string;
}

export interface BundleMembershipRow {
  bundleId: string;
  assetId: string;
}

export interface UtilizationRow {
  id: string;
  tenantId: string;
  assetId: string;
  date: string;
  invocations: number;
  successes: number;
  errors: number;
  refusals: number;
  latencyMs: number;
  tokens: number;
  cost: number;
  /**
   * The model behind this slice of usage (for example claude-opus-4-8). Measured
   * from the transcript's message.model. Optional and absent on pre-model snapshots
   * and on the live Fabric read path until a deploy fills it; treated as "unknown".
   */
  model?: string;
}

// Private-eval evidence. EvalResult is a metadata-only, Utilization-shaped fact table:
// numeric outcomes, timings, cost, and an honesty grade keyed to an asset. There is no
// authored free-text column here. The eval case's prompt/rubric/response lives only in a
// gitignored, DEV-only eval-cases.local.json, joined by caseHash, so real eval content
// never becomes a Fabric column and never ships in a build. See
// docs/superpowers/specs/2026-07-07-private-eval-artifact-design.md.
export interface EvalResultRow {
  id: string;
  tenantId: string;
  assetId: string;
  /**
   * Opaque content hash of the local eval case definition. A grouping key, not a foreign
   * key and not authored text: it joins results that ran the same case without putting the
   * case's prompt or response on this row. The human-readable definition is local-only.
   */
  caseHash: string;
  date: string;
  trials: number;
  passed: number;
  failed: number;
  errored: number;
  latencyMs: number;
  tokens: number;
  cost: number;
  /** The model the eval ran against (for example claude-opus-4-8). Treated as "unknown" when absent. */
  model?: string;
  /** How honestly this result was captured; gates confidence, never the effectiveness estimate. */
  quality: HarnessMetricQuality;
}

export interface TelemetryMeta {
  source: "claude-code";
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  sessions: number;
  tracked: {
    invocations: boolean;
    successes: boolean;
    errors: boolean;
    latency: boolean;
    refusals: boolean;
    tokens: boolean;
    cost: boolean;
    /** Whether per-invocation model is recorded. Optional for pre-model snapshots. */
    model?: boolean;
  };
  // Probe seeding (scripts/vault-telemetry-probe.mjs): the asset ids given one
  // synthetic invocation because they had no real usage yet, and the date that
  // synthetic row carries. Both absent in the committed demo utilization.json and
  // in any pre-probe snapshot, so consumers must treat them as optional. This is
  // snapshot metadata only, not a stored Fabric entity, so it has no rayfin/data
  // mirror (unlike UtilizationRow, which does).
  probeAssetIds?: string[];
  probeDate?: string;
}

/** How honestly a per-harness metric is measured from that harness's own logs. */
export type HarnessMetricQuality =
  "full" | "partial" | "occupancy" | "derived" | "modeled" | "none";

// Snapshot metadata for an eval import, mirroring TelemetryMeta: app-side runtime data
// with no rayfin/data mirror, so it rides VaultDataset as an optional field. Each metric
// carries its own honesty grade.
export interface EvalMeta {
  source: string;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  cases: number;
  tracked: {
    passed: HarnessMetricQuality;
    failed: HarnessMetricQuality;
    latency: HarnessMetricQuality;
    tokens: HarnessMetricQuality;
    cost: HarnessMetricQuality;
  };
}

/** A model's tokens split by billing component, so cost prices each at its rate. */
export interface TokenComponents {
  input: number;
  output: number;
  /** cache_creation_input_tokens (priced ~1.25x input). */
  cacheWrite: number;
  /** cache_read_input_tokens (priced ~0.1x input); excluded from the token total. */
  cacheRead: number;
}

/** One day of a harness's usage, so the summary can be windowed over a date range. */
export interface HarnessDay {
  date: string;
  sessions: number;
  invocations: number;
  successes: number;
  errors: number;
  latencyMs: number;
  tokens: number;
}

/** One agent harness's usage summary, from its own local session logs. */
export interface HarnessUsage {
  source: string;
  label: string;
  sessions: number;
  windowStart: string | null;
  windowEnd: string | null;
  invocations: number;
  successes: number;
  errors: number;
  latencyMs: number;
  tokens: number;
  cost: number;
  models: string[];
  /**
   * Whole-history tokens split per model id, so cost can price each model at its
   * own rate instead of one blended rate. Optional: legacy snapshots without it
   * fall back to attributing all tokens to the primary model.
   */
  tokensByModel?: Record<string, number>;
  /**
   * Whole-history four-way token split per model id. When present, cost is priced
   * per component (input / output / cache-write / cache-read) instead of one
   * blended rate. Optional: harnesses and legacy snapshots without it fall back to
   * the blended tokensByModel path.
   */
  componentsByModel?: Record<string, TokenComponents>;
  note?: string;
  /** Per-day breakdown that lets getHarnessUsage re-aggregate over a window. */
  daily?: HarnessDay[];
  tracked: {
    successes: HarnessMetricQuality;
    errors: HarnessMetricQuality;
    latency: HarnessMetricQuality;
    tokens: HarnessMetricQuality;
    cost: HarnessMetricQuality;
  };
}

export interface HarnessUsageSnapshot {
  generatedAt: string;
  sources: HarnessUsage[];
}

export interface CodexBillingUser {
  label: string;
  credits: number;
}

export interface CodexBillingDay {
  date: string;
  credits: number;
  billedTokens: number;
  /**
   * Tokens observed in local Codex rollout logs for the same date. This can be
   * lower than workspace analytics because local logs are incomplete across
   * devices/surfaces and billing can include API-key or cloud activity.
   */
  localTokens: number;
  runs: number;
  creditsPerRun: number | null;
  tokensPerRun: number | null;
  users: CodexBillingUser[];
  usageTypes: Record<string, number>;
}

export interface CodexBillingSnapshot {
  generatedAt: string;
  source: "chatgpt-codex-analytics-export" | "chatgpt-codex-analytics-api";
  currency: "credits";
  windowStart: string | null;
  windowEnd: string | null;
  totals: {
    credits: number;
    billedTokens: number;
    localTokens: number;
    runs: number;
  };
  daily: CodexBillingDay[];
  notes: string[];
}

export interface CodexWorkspaceUsageClient {
  id: string;
  label: string;
  users: number;
  sessions: number;
  messages: number;
  turns: number;
}

export interface CodexWorkspaceUsageModel {
  model: string;
  users: number;
  turns: number;
}

export interface CodexWorkspaceUsageUser {
  label: string;
  sessions: number;
  messages: number;
  tasksWeb: number;
  codeReviewsWeb: number;
}

export interface CodexWorkspaceCodeReviewMetrics {
  reviews: number;
  comments: number;
  p0Comments: number;
  p1Comments: number;
  p2Comments: number;
  engagedComments: number;
  repliedComments: number;
  replies: number;
  reactions: number;
}

export interface CodexWorkspaceUsageDay {
  date: string;
  users: number;
  sessions: number;
  messages: number;
  turns: number;
  tasksWeb: number;
  codeReviewsWeb: number;
  textInputTokens: number;
  textCachedInputTokens: number;
  textOutputTokens: number;
  textTotalTokens: number;
  clients: CodexWorkspaceUsageClient[];
  models: CodexWorkspaceUsageModel[];
  codeReview: CodexWorkspaceCodeReviewMetrics;
}

export interface CodexWorkspaceUsageSnapshot {
  generatedAt: string;
  source: "codex-workspace-analytics-export";
  windowStart: string | null;
  windowEnd: string | null;
  totals: {
    users: number;
    sessions: number;
    messages: number;
    turns: number;
    tasksWeb: number;
    codeReviewsWeb: number;
    reviews: number;
    reviewComments: number;
    textInputTokens: number;
    textCachedInputTokens: number;
    textOutputTokens: number;
    textTotalTokens: number;
  };
  clients: CodexWorkspaceUsageClient[];
  models: CodexWorkspaceUsageModel[];
  users: CodexWorkspaceUsageUser[];
  daily: CodexWorkspaceUsageDay[];
  notes: string[];
}

export interface VaultDataset {
  assets: AssetRow[];
  tags: TagRow[];
  origins: OriginRow[];
  owners: OwnerRow[];
  bundles: BundleRow[];
  assetTags: AssetTagRow[];
  dependencies: AssetDependencyRow[];
  bundleMemberships: BundleMembershipRow[];
  utilization: UtilizationRow[];
  evalResults: EvalResultRow[];
  telemetryMeta?: TelemetryMeta;
  evalMeta?: EvalMeta;
}

export interface AssetInput {
  type: AssetType;
  name: string;
  slug: string;
  description: string;
  system?: string;
  body: string;
  version: string;
  status: AssetStatus;
  riskLevel: RiskLevel;
  maturity: number;
  tier: AssetTier;
  stockVersion?: string;
  ownerId?: string;
  originId?: string;
  tagIds?: string[];
}

// Asset submission review queue. These rows are deliberately NOT part of
// VaultDataset: pending submissions are staged outside the catalog so the
// coherence contract and every metric (all of which read VaultDataset) are
// structurally unable to see them until an item is accepted. See
// docs/superpowers/specs/2026-06-19-asset-submission-review-queue.md.
export type SubmissionStatus =
  "submitted" | "under_review" | "changes_requested" | "accepted" | "rejected";
export type SubmissionItemDecision = "pending" | "accept" | "refine" | "reject";
/** conflict = same (type, slug) as a catalog row, different contentHash. */
export type SubmissionDedupVerdict = "new" | "duplicate" | "conflict";

export interface SubmissionRow {
  id: string;
  tenantId: string;
  submittedByOwnerId: string;
  originId?: string;
  status: SubmissionStatus;
  itemCount: number;
  acceptedCount: number;
  rejectedCount: number;
  conflictCount: number;
  /** Stable hash over the staged items, for idempotent re-submit detection. */
  contentHash: string;
  submittedAt: string;
  reviewedByOwnerId?: string;
  reviewedAt?: string;
  note?: string;
}

// Staged asset fields are stored decomposed and bounded (mirroring AssetRow),
// never a single unbounded JSON blob, so a future Fabric SubmissionItem entity
// maps to bounded columns. Tag associations carry as a bounded id array;
// dependency and bundle staging are deferred to the accept-path phase.
export interface SubmissionItemRow {
  id: string;
  tenantId: string;
  submissionId: string;
  assetId: string;
  assetName: string;
  assetType: AssetType;
  assetSlug: string;
  description: string;
  system?: string;
  body: string;
  version: string;
  assetStatus: AssetStatus;
  riskLevel: RiskLevel;
  maturity: number;
  tier: AssetTier;
  stockVersion?: string;
  contentHash: string;
  tagIds: string[];
  dedupVerdict: SubmissionDedupVerdict;
  duplicateAssetId?: string;
  decision: SubmissionItemDecision;
  reviewerNote?: string;
}
