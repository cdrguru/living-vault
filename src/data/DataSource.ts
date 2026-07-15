import type { ImportResult, ProjectionInput } from "./merge";
import type { DateWindow } from "./metrics";
import type {
  AssetInput,
  AssetRow,
  EvalMeta,
  EvalResultRow,
  HarnessUsage,
  SubmissionItemDecision,
  SubmissionItemRow,
  SubmissionRow,
  SubmissionStatus,
  TelemetryMeta,
  UtilizationRow,
  VaultDataset,
} from "./types";

export interface DataSource {
  getDataset(): Promise<VaultDataset>;
  /**
   * Discard any persisted local edits and return the source to its pristine
   * baseline. For the seed source this clears the localStorage-backed dataset so
   * the next read rebuilds the committed seed. The live Fabric source has no
   * local copy to reset and rejects with a clear message.
   */
  reset(): Promise<void>;
  addAsset(input: AssetInput): Promise<AssetRow>;
  updateAsset(id: string, patch: Partial<AssetInput>): Promise<AssetRow>;
  retireAsset(id: string): Promise<void>;
  deleteAsset(id: string): Promise<void>;
  /**
   * Merge an upstream fabric-library projection into the dataset. One-way and
   * idempotent: asset-side rows are upserted, Utilization is preserved, and the
   * coherence contract must pass before anything persists.
   */
  importProjection(incoming: ProjectionInput): Promise<ImportResult>;
  /**
   * Replace the utilization table with real telemetry rows and record its meta.
   * Idempotent and contract-checked. Rows referencing unknown assets are dropped.
   * Returns how many rows were applied and dropped.
   */
  importTelemetry(
    rows: UtilizationRow[],
    meta: TelemetryMeta,
  ): Promise<TelemetryResult>;
  /**
   * Replace the eval-results table with measured private-eval outcomes and record its
   * meta. Idempotent and contract-checked, mirroring importTelemetry. Rows referencing
   * unknown assets are dropped; an import matching no known asset is a no op.
   */
  importEvalResults(
    rows: EvalResultRow[],
    meta: EvalMeta,
  ): Promise<EvalImportResult>;
  /**
   * The real Claude Code usage keys that did not resolve to any governed catalog
   * asset, ranked highest count first. This is a read of the already loaded
   * telemetry snapshot only. It does not add fields to the VaultDataset contract.
   */
  getUnattributedUsage(): UnattributedUsage[];
  /**
   * Per-harness usage summaries (Claude Code, Codex, ...), each derived from that
   * harness's own local session logs. A read of the committed harness-usage
   * snapshot only; it adds no fields to the VaultDataset contract.
   */
  getHarnessUsage(window?: DateWindow): HarnessUsage[];
  /**
   * Stage a normalized contribution as a pending Submission for admin review.
   * The incoming projection is validated by the caller (normalize.ts); each asset
   * gets a dedup verdict against the live catalog. Pending submissions live outside
   * VaultDataset, so this never mutates the catalog and never runs the contract.
   * Acceptance (a later phase) routes accepted items through importProjection.
   */
  submitProjection(
    incoming: ProjectionInput,
    meta: SubmissionMeta,
  ): Promise<SubmissionRow>;
  /** List staged submissions, newest first, optionally filtered by status. */
  listSubmissions(filter?: SubmissionFilter): Promise<SubmissionRow[]>;
  /** A single submission with its staged items. Rejects if the id is unknown. */
  getSubmission(id: string): Promise<SubmissionDetail>;
  /**
   * Record per-item review decisions and finalize the submission. Items marked
   * accept are assembled into a ProjectionInput and routed through importProjection
   * (so mergeProjection + the coherence contract run as the only write gate);
   * reject and refine never touch the catalog. Idempotent: re-deciding an accepted
   * item reconciles onto the same row rather than duplicating it. Returns the
   * import delta (added/updated) for the accepted items.
   */
  decideSubmission(
    id: string,
    decisions: SubmissionItemDecisionInput[],
    review: SubmissionReview,
  ): Promise<ImportResult>;
  /**
   * Move a submission to a non-terminal review state (under_review or
   * changes_requested) without writing the catalog. Rejects if the id is unknown.
   */
  transitionSubmission(
    id: string,
    status: SubmissionTransitionStatus,
  ): Promise<SubmissionRow>;
}

/** A reviewer's decision on one staged item. */
export interface SubmissionItemDecisionInput {
  itemId: string;
  decision: SubmissionItemDecision;
  reviewerNote?: string;
}

/** Who reviewed a submission and an optional note recorded on it. */
export interface SubmissionReview {
  reviewedByOwnerId: string;
  note?: string;
}

/** The non-terminal states transitionSubmission may set. */
export type SubmissionTransitionStatus = "under_review" | "changes_requested";

/** Attribution and provenance for a staged submission. */
export interface SubmissionMeta {
  submittedByOwnerId: string;
  originId?: string;
  note?: string;
  /** tenantId stamped on the stored rows; defaults to the seed tenant. */
  tenantId?: string;
}

export interface SubmissionFilter {
  status?: SubmissionStatus;
}

export interface SubmissionDetail {
  submission: SubmissionRow;
  items: SubmissionItemRow[];
}

/** One unresolved usage key with its measured invocation count. */
export interface UnattributedUsage {
  key: string;
  count: number;
}

export interface TelemetryResult {
  applied: number;
  dropped: number;
  /**
   * Set when the import was a deliberate no op: an empty snapshot, or one whose
   * rows match no asset in the dataset. The existing utilization is left intact
   * rather than being replaced with an empty table.
   */
  skipped?: "no-matching-rows";
}

export interface EvalImportResult {
  applied: number;
  dropped: number;
  /** Set when the import matched no known asset, so the eval table was left intact. */
  skipped?: "no-matching-rows";
}
