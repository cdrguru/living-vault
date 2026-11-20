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

/** How a revision came to exist. Mirrors rayfin/data/AssetRevision.ts. */
export type AssetRevisionSource = "vault-write" | "observed-scan" | "import";

/**
 * An immutable snapshot of one version of an asset's content. Asset.body is the
 * CURRENT text and updateAsset overwrites it in place; this row is what preserves the
 * prior version, so a before/after comparison has a referent. Append-only: minted by
 * ensureRevisions (src/data/revisions.ts) or the 0005 migration backfill, never
 * updated, deleted only with its asset. The current revision is DERIVED (highest seq);
 * there is deliberately no Asset.currentRevisionId back-reference, which would make
 * replaceDataset's insert order circular.
 */
export interface AssetRevisionRow {
  id: string;
  tenantId: string;
  assetId: string;
  /** Monotonic per-asset version counter, 1-based. */
  seq: number;
  /** The asset's full body as of this version. Immutable. */
  body: string;
  /** contentHashOf(type, body) at mint time, copied from the asset. */
  contentHash: string;
  /**
   * When this version was observed, taken from the asset's updatedAt at mint time
   * rather than a wall clock, so minting is pure and reproducible. Inherits that
   * field's honesty: an overlay-synthesized updatedAt yields a synthesized date here.
   */
  createdAt: string;
  /** Who minted it (for example "seed", "migration", "local-user", "self-host"). */
  createdByActor: string;
  source: AssetRevisionSource;
}

// Intervention history: the durable record of what an agent DID about a recommendation.
// Defined here (not in interventions.ts) because it is now a first-class VaultDataset
// member and a Fabric entity (rayfin/data/Intervention.ts); interventions.ts re-exports
// it and owns the pure append/verdict logic. The action union is kept here rather than
// imported from recommend.ts to avoid a types.ts <-> recommend.ts import cycle; it is the
// same five literals as RecommendedAction.

/** What an agent recommended (the five worklist actions). */
export type InterventionAction =
  | "retire"
  | "improve"
  | "merge"
  | "promote"
  | "review";

/** What the agent actually did about the recommendation. */
export type InterventionOutcome =
  | "revised" // the source was edited
  | "retired" // the asset was withdrawn from use
  | "merged" // folded into a duplicate twin
  | "promoted" // governance metadata added
  | "deferred"; // deliberately not acted on (with a reason)

/**
 * One recorded outcome. Append-only and metadata-only: it names an action, an outcome,
 * a date, an actor, and a short note, never the diff or the agent's reasoning.
 *
 * assetId is a DURABLE reference, deliberately not a foreign key: an intervention is an
 * audit-log fact ("on this date an agent retired this asset") that must survive the
 * asset's deletion, because a `retired`/`merged` record is the tombstone that is MOST
 * useful after the asset is gone. This is why the contract does not flag a dangling
 * intervention asset, and why deleteAsset does not remove interventions. See
 * docs/superpowers/plans/2026-07-17-frontier-ecosystem-5-of-5-plan.md, WP2.
 */
export interface InterventionRow {
  /** Stable unique id (a uuid). Unlike the old deterministic key, two divergent records
   *  on the same asset/day/action get distinct ids so neither is destroyed. */
  id: string;
  tenantId: string;
  assetId: string;
  /** The asset's current revision at record time, or absent when it had none. Not an FK
   *  (cross-store revision ids are not portable; see AssetRevision). Forward-looking. */
  revisionIdBefore?: string;
  /** ISO date (YYYY-MM-DD) the action was taken. */
  date: string;
  action: InterventionAction;
  outcome: InterventionOutcome;
  /** Which agent/harness recorded it (e.g. "claude-code", "codex"). */
  actor: string;
  /** Short human/agent note. Free text, no source content. */
  note?: string;
  /**
   * The asset's effectiveness at the moment of the intervention, frozen so a later run
   * can answer "did the change help?" without reconstructing history. Null when the
   * asset had no gradeable effectiveness then; a missing score is not a zero score.
   */
  effectiveScoreBefore: number | null;
  /** Invocations at record time. The post-change evidence window's lower boundary. */
  invocationsBefore: number;
  /** The old deterministic key (`assetId:date:action`). Non-unique: it groups a record
   *  with any earlier one it supersedes, without being the primary key. */
  dedupeKey: string;
  /** The id of the row this one supersedes (a same-key change of mind), or absent. */
  supersedesId?: string;
  /** Full ISO timestamp the record was written. Orders supersession within a day. */
  recordedAt: string;
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
  /**
   * The fourth outcome bucket: the run completed but its verdict was unusable.
   * Recorded, never dropped (a dropped inconclusive silently biases the retained
   * sample toward clean verdicts) and counted inside trials, so
   * passed + failed + errored + inconclusive <= trials. Excluded from the pass-rate
   * denominator: an unusable verdict is neither a pass nor a failure. Pre-identity
   * snapshots may lack the field at runtime; readers treat absent as 0.
   */
  inconclusive: number;
  latencyMs: number;
  tokens: number;
  cost: number;
  /** The model the eval ran against (for example claude-opus-4-8). Treated as "unknown" when absent. */
  model?: string;
  /** How honestly this result was captured; gates confidence, never the effectiveness
   *  estimate. A row with no assetRevisionId is capped at "derived" on read regardless
   *  of this declared value (see metrics.evalRowHonesty): self-declared "full" on an
   *  unversioned result is self-certification. */
  quality: HarnessMetricQuality;
  /**
   * The asset revision this result ran against, or null/absent for legacy and
   * externally imported rows. A durable BARE reference, not a foreign key (the
   * Intervention precedent): an eval referencing an unknown revision survives with
   * capped honesty, never a dropped row or a failed insert.
   */
  assetRevisionId?: string | null;
  /** The harness that ran the eval (claude-code, codex, grok, copilot, other). */
  harness?: string;
  /** What the result was compared against (Baseline row), or null/absent. Bare reference. */
  baselineId?: string | null;
}

/** What a Baseline compares against. Mirrors rayfin/data/Baseline.ts. */
export type BaselineKind =
  "no-asset-control" | "prior-revision" | "alternate-asset";

/**
 * The named thing an eval result is compared against, so `counterfactual` can
 * eventually be non-null honestly. Empty until real control runs exist:
 * scoreAssetDetailed keeps passing counterfactual null (plan risk R2), and the
 * existence of this table does not license wiring it. Immutable after insert.
 * assetRevisionId is a durable bare reference, like EvalResultRow's.
 */
export interface BaselineRow {
  id: string;
  tenantId: string;
  kind: BaselineKind;
  assetRevisionId?: string | null;
  label: string;
  createdAt: string;
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

// Daily per-asset routing decision aggregates, imported by an external
// orchestrator or a local router. A routing decision is either resolved
// locally by a governed asset (a cache hit) or dispatched externally; this row
// records the counts and the money. Mirrors UtilizationRow: a real Fabric
// entity (rayfin/data/RoutingStat.ts) with an asset FK, replaced wholesale by
// importRoutingStats. avoidedCostEstimate is a MODELED counterfactual (what the
// local hits would have cost externally); it must never be presented as
// measured spend, which is why the meta carries a per-metric honesty grade.
export interface RoutingStatRow {
  id: string;
  tenantId: string;
  assetId: string;
  date: string;
  localHits: number;
  externalFallbacks: number;
  /** Decisions that matched this asset but fell below the router's confidence threshold. */
  belowThreshold: number;
  /** Measured external spend attributed to this asset's fallbacks, USD. */
  externalCost: number;
  /** Modeled external cost the local hits avoided, USD. Modeled, never measured. */
  avoidedCostEstimate: number;
}

// Snapshot metadata for a routing-stats import, mirroring EvalMeta: app-side
// runtime data with no rayfin/data mirror, riding VaultDataset as an optional
// field. Each metric carries its own honesty grade; a router observes its own
// decisions in full, so hit counts are typically "full" while
// avoidedCostEstimate is at best "modeled".
export interface RoutingStatsMeta {
  source: string;
  generatedAt: string;
  windowStart: string;
  windowEnd: string;
  /** Total routing decisions in the window, across all assets. */
  decisions: number;
  tracked: {
    localHits: HarnessMetricQuality;
    externalFallbacks: HarnessMetricQuality;
    belowThreshold: HarnessMetricQuality;
    externalCost: HarnessMetricQuality;
    avoidedCostEstimate: HarnessMetricQuality;
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
  /**
   * Skill loads that day whose SKILL.md could not be tied to a name. Present only for
   * a harness that attributes skills (Codex), so the undercount stays visible.
   */
  unattributedLoads?: number;
}

/** Loads of one skill on one day in a harness, from its own logs. Name, date, count only. */
export interface HarnessSkillUse {
  skill: string;
  date: string;
  loads: number;
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
  /**
   * Per-skill loads per day (Codex only today). Read with `skillsMeasured`: a missing
   * `tracked.skills` means skills were never measured, not that none were loaded.
   */
  skillUses?: HarnessSkillUse[];
  tracked: {
    successes: HarnessMetricQuality;
    errors: HarnessMetricQuality;
    latency: HarnessMetricQuality;
    tokens: HarnessMetricQuality;
    cost: HarnessMetricQuality;
    skills?: HarnessMetricQuality;
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
  /** Absent on legacy exports, which include both metrics. */
  coverage?: { sessions: boolean; reviews: boolean };
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
  assetRevisions: AssetRevisionRow[];
  tags: TagRow[];
  origins: OriginRow[];
  owners: OwnerRow[];
  bundles: BundleRow[];
  assetTags: AssetTagRow[];
  dependencies: AssetDependencyRow[];
  bundleMemberships: BundleMembershipRow[];
  utilization: UtilizationRow[];
  evalResults: EvalResultRow[];
  /** Named comparison targets for eval identity. Empty until real control runs exist. */
  baselines: BaselineRow[];
  interventions: InterventionRow[];
  routingStats: RoutingStatRow[];
  telemetryMeta?: TelemetryMeta;
  evalMeta?: EvalMeta;
  routingStatsMeta?: RoutingStatsMeta;
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
