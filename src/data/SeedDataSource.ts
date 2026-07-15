import { runDataSourceContract } from "./contract";
import type {
  DataSource,
  EvalImportResult,
  SubmissionDetail,
  SubmissionFilter,
  SubmissionItemDecisionInput,
  SubmissionMeta,
  SubmissionReview,
  SubmissionTransitionStatus,
  TelemetryResult,
  UnattributedUsage,
} from "./DataSource";
import { contentHashOf } from "./hash";
import {
  importDelta,
  mergeProjection,
  type ImportResult,
  type ProjectionInput,
} from "./merge";
import { seedDataset, TENANT } from "./seed";
import { getWindowedHarnessUsage } from "./harnessUsage";
import type { DateWindow } from "./metrics";
import {
  applyDecisions,
  assembleAcceptedProjection,
  buildSubmission,
  finalizeSubmission,
} from "./submissions";
import { applyEvals } from "./evals";
import { applyTelemetry } from "./telemetry";
import { telemetrySnapshot } from "./telemetrySnapshot";
import type {
  AssetInput,
  AssetRow,
  EvalMeta,
  EvalResultRow,
  HarnessUsage,
  SubmissionItemRow,
  SubmissionRow,
  TelemetryMeta,
  UtilizationRow,
  VaultDataset,
} from "./types";

const STORAGE_KEY = "living-vault:dataset:v1";
// Pending submissions live under their own key, fully separate from the dataset,
// so the catalog read path and every metric can never see staged rows.
const SUBMISSIONS_KEY = "living-vault:submissions:v1";

interface SubmissionStore {
  submissions: SubmissionRow[];
  items: SubmissionItemRow[];
}

export class SeedDataSource implements DataSource {
  private load(): VaultDataset {
    const stored = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as VaultDataset;
      // Migration: datasets persisted before evalResults existed rehydrate without it;
      // default to [] so the contract loop and metrics never hit undefined.
      parsed.evalResults ??= [];
      return parsed;
    }
    return structuredClone(seedDataset);
  }

  private save(dataset: VaultDataset): void {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(dataset));
  }

  private commit(dataset: VaultDataset): void {
    const violations = runDataSourceContract(dataset);
    if (violations.length > 0) {
      throw new Error(`Contract violation: ${violations[0]}`);
    }
    this.save(dataset);
  }

  async getDataset(): Promise<VaultDataset> {
    return structuredClone(this.load());
  }

  async reset(): Promise<void> {
    // Drop the persisted overlay so the next load rebuilds the committed seed,
    // and clear the staged submissions alongside it.
    globalThis.localStorage?.removeItem(STORAGE_KEY);
    globalThis.localStorage?.removeItem(SUBMISSIONS_KEY);
  }

  private loadSubmissions(): SubmissionStore {
    const stored = globalThis.localStorage?.getItem(SUBMISSIONS_KEY);
    if (stored) return JSON.parse(stored) as SubmissionStore;
    // In the demo build (VITE_DEMO_MODE) seed one pending submission so /submissions
    // is a live triage story on first load instead of an empty state. It never seeds
    // under test (vitest leaves VITE_DEMO_MODE unset) or in a persistent backend, and
    // any real decision is saved over it, so the seed only ever fills a fresh store.
    if (import.meta.env.VITE_DEMO_MODE === "true") {
      return this.seededSubmissionStore();
    }
    return { submissions: [], items: [] };
  }

  /** A deterministic pending submission (one new, one conflict, one new) so the
   *  maintainer triage UI and the dedup verdicts are demoable out of the box. */
  private seededSubmissionStore(): SubmissionStore {
    const now = "2026-06-04T16:20:00.000Z";
    const staged = (
      type: AssetRow["type"],
      name: string,
      slug: string,
      body: string,
    ): AssetRow => ({
      id: `stg-${slug}`,
      tenantId: TENANT,
      type,
      name,
      slug,
      description: `Contributed asset: ${name}.`,
      body,
      version: "1.0.0",
      status: "active",
      riskLevel: "low",
      maturity: 0.6,
      tier: "custom",
      contentHash: contentHashOf(type, body),
      createdAt: now,
      updatedAt: now,
    });
    const incoming: ProjectionInput = {
      assets: [
        staged(
          "skill",
          "Contributed RLS Helper",
          "contributed-rls-helper",
          "# Contributed RLS Helper\nGuidance for designing row-level security roles.",
        ),
        staged(
          "skill",
          "Sample Data Modeler",
          "sample-data-modeler",
          "# Sample Data Modeler\nA re-contributed variant with a changed body, which reads as a conflict against the catalog.",
        ),
        staged(
          "prompt",
          "Contributed Release Notes Prompt",
          "contributed-release-notes-prompt",
          "# Contributed Release Notes Prompt\nDraft release notes from a diff.",
        ),
      ],
      tags: [],
      origins: [],
      owners: [],
      bundles: [],
      assetTags: [],
      dependencies: [],
      bundleMemberships: [],
    };
    const { submission, items } = buildSubmission(this.load(), incoming, {
      submissionId: "sub-demo-1",
      tenantId: TENANT,
      now,
      submittedByOwnerId: "own-lee",
      originId: "org-local",
      note: "Contributed toolkit assets for maintainer review.",
    });
    return { submissions: [submission], items };
  }

  private saveSubmissions(store: SubmissionStore): void {
    globalThis.localStorage?.setItem(SUBMISSIONS_KEY, JSON.stringify(store));
  }

  async submitProjection(
    incoming: ProjectionInput,
    meta: SubmissionMeta,
  ): Promise<SubmissionRow> {
    const store = this.loadSubmissions();
    const submissionId = `sub-${store.submissions.length}-${Math.floor(
      globalThis.performance?.now?.() ?? 0,
    )}`;
    // The catalog is read (for dedup verdicts) but never written back: a
    // submission only touches the submission store.
    const { submission, items } = buildSubmission(this.load(), incoming, {
      submissionId,
      tenantId: meta.tenantId ?? TENANT,
      now: new Date().toISOString(),
      submittedByOwnerId: meta.submittedByOwnerId,
      originId: meta.originId,
      note: meta.note,
    });

    store.submissions.push(submission);
    store.items.push(...items);
    this.saveSubmissions(store);
    return structuredClone(submission);
  }

  async listSubmissions(filter?: SubmissionFilter): Promise<SubmissionRow[]> {
    const { submissions } = this.loadSubmissions();
    const matched = filter?.status
      ? submissions.filter((submission) => submission.status === filter.status)
      : submissions;
    // Newest first.
    return structuredClone(
      [...matched].sort((a, b) => b.submittedAt.localeCompare(a.submittedAt)),
    );
  }

  async getSubmission(id: string): Promise<SubmissionDetail> {
    const store = this.loadSubmissions();
    const submission = store.submissions.find((row) => row.id === id);
    if (!submission) throw new Error(`Unknown submission "${id}"`);
    return structuredClone({
      submission,
      items: store.items.filter((item) => item.submissionId === id),
    });
  }

  async decideSubmission(
    id: string,
    decisions: SubmissionItemDecisionInput[],
    review: SubmissionReview,
  ): Promise<ImportResult> {
    const store = this.loadSubmissions();
    const submission = store.submissions.find((row) => row.id === id);
    if (!submission) throw new Error(`Unknown submission "${id}"`);

    const items = applyDecisions(
      store.items.filter((item) => item.submissionId === id),
      decisions,
    );

    // Accepted items flow through the existing importProjection path so
    // mergeProjection + the coherence contract stay the only write gate. If
    // importProjection throws (a contract violation), the submission store is
    // left unsaved, so a rejected import never half-updates the review state. The
    // seed source reuses the staged contrib id as the asset id (Fabric mints a UUID).
    const accepted = items.filter((item) => item.decision === "accept");
    let result: ImportResult = { added: 0, updated: 0 };
    if (accepted.length > 0) {
      result = await this.importProjection(
        assembleAcceptedProjection(this.load(), submission, accepted, {
          tenantId: TENANT,
          now: new Date().toISOString(),
          mintAssetId: (item) => item.assetId,
        }),
      );
    }

    const finalized = finalizeSubmission(submission, items, {
      reviewedByOwnerId: review.reviewedByOwnerId,
      reviewedAt: new Date().toISOString(),
      note: review.note,
    });
    store.submissions = store.submissions.map((row) =>
      row.id === id ? finalized : row,
    );
    store.items = [
      ...store.items.filter((item) => item.submissionId !== id),
      ...items,
    ];
    this.saveSubmissions(store);
    return result;
  }

  async transitionSubmission(
    id: string,
    status: SubmissionTransitionStatus,
  ): Promise<SubmissionRow> {
    const store = this.loadSubmissions();
    const submission = store.submissions.find((row) => row.id === id);
    if (!submission) throw new Error(`Unknown submission "${id}"`);
    submission.status = status;
    this.saveSubmissions(store);
    return structuredClone(submission);
  }

  getUnattributedUsage(): UnattributedUsage[] {
    return [...telemetrySnapshot.unattributed].sort(
      (a, b) => b.count - a.count,
    );
  }

  getHarnessUsage(window?: DateWindow): HarnessUsage[] {
    return getWindowedHarnessUsage(window);
  }

  async importProjection(incoming: ProjectionInput): Promise<ImportResult> {
    const dataset = this.load();
    // Reconcile by (type, slug) so the upstream snapshot enriches the catalog rows
    // the overlay already created instead of listing each skill twice.
    const options = { reconcileByTypeSlug: true };
    const delta = importDelta(dataset, incoming, options);
    const merged = mergeProjection(dataset, incoming, TENANT, options);
    this.commit(merged);
    return delta;
  }

  async importTelemetry(
    rows: UtilizationRow[],
    meta: TelemetryMeta,
  ): Promise<TelemetryResult> {
    const dataset = this.load();
    // Guard against a destructive import. applyTelemetry replaces the whole
    // utilization table, so an empty snapshot, or one whose rows reference no
    // asset in the current dataset (for example real telemetry synced before the
    // owning assets are present), would silently wipe the seed effectiveness data
    // and reclassify every asset as shelfware. Treat that as a no op instead.
    const assetIds = new Set(dataset.assets.map((asset) => asset.id));
    const matched = rows.filter((row) => assetIds.has(row.assetId));
    if (matched.length === 0) {
      return { applied: 0, dropped: rows.length, skipped: "no-matching-rows" };
    }
    const merged = applyTelemetry(dataset, rows, meta);
    this.commit(merged);
    return {
      applied: merged.utilization.length,
      dropped: rows.length - merged.utilization.length,
    };
  }

  async importEvalResults(
    rows: EvalResultRow[],
    meta: EvalMeta,
  ): Promise<EvalImportResult> {
    const dataset = this.load();
    // Same destructive-import guard as importTelemetry: applyEvals replaces the whole
    // eval table, so an empty snapshot, or one whose rows reference no present asset,
    // is a no op rather than wiping existing eval evidence.
    const assetIds = new Set(dataset.assets.map((asset) => asset.id));
    const matched = rows.filter((row) => assetIds.has(row.assetId));
    if (matched.length === 0) {
      return { applied: 0, dropped: rows.length, skipped: "no-matching-rows" };
    }
    const merged = applyEvals(dataset, rows, meta);
    this.commit(merged);
    return {
      applied: merged.evalResults.length,
      dropped: rows.length - merged.evalResults.length,
    };
  }

  async addAsset(input: AssetInput): Promise<AssetRow> {
    const dataset = this.load();
    const now = new Date().toISOString();
    const row: AssetRow = {
      id: `as-user-${dataset.assets.length}-${Math.floor(globalThis.performance?.now?.() ?? 0)}`,
      tenantId: TENANT,
      type: input.type,
      name: input.name,
      slug: input.slug,
      description: input.description,
      system: input.system,
      body: input.body,
      version: input.version,
      status: input.status,
      riskLevel: input.riskLevel,
      maturity: input.maturity,
      tier: input.tier,
      stockVersion: input.stockVersion,
      contentHash: contentHashOf(input.type, input.body),
      ownerId: input.ownerId,
      originId: input.originId,
      createdAt: now,
      updatedAt: now,
    };
    dataset.assets.push(row);
    for (const tagId of input.tagIds ?? []) {
      dataset.assetTags.push({ assetId: row.id, tagId });
    }
    this.commit(dataset);
    return structuredClone(row);
  }

  async updateAsset(id: string, patch: Partial<AssetInput>): Promise<AssetRow> {
    const dataset = this.load();
    const row = dataset.assets.find((asset) => asset.id === id);
    if (!row) throw new Error(`Unknown asset "${id}"`);
    Object.assign(row, patch);
    row.contentHash = contentHashOf(row.type, row.body);
    row.updatedAt = new Date().toISOString();
    if (patch.tagIds) {
      dataset.assetTags = dataset.assetTags.filter((tag) => tag.assetId !== id);
      for (const tagId of patch.tagIds) {
        dataset.assetTags.push({ assetId: id, tagId });
      }
    }
    this.commit(dataset);
    return structuredClone(row);
  }

  async retireAsset(id: string): Promise<void> {
    const dataset = this.load();
    const row = dataset.assets.find((asset) => asset.id === id);
    if (!row) throw new Error(`Unknown asset "${id}"`);
    row.status = "retired";
    row.updatedAt = new Date().toISOString();
    this.commit(dataset);
  }

  async deleteAsset(id: string): Promise<void> {
    const dataset = this.load();
    dataset.assets = dataset.assets.filter((asset) => asset.id !== id);
    dataset.assetTags = dataset.assetTags.filter((tag) => tag.assetId !== id);
    dataset.dependencies = dataset.dependencies.filter(
      (dependency) =>
        dependency.assetId !== id && dependency.dependsOnAssetId !== id,
    );
    dataset.bundleMemberships = dataset.bundleMemberships.filter(
      (membership) => membership.assetId !== id,
    );
    dataset.utilization = dataset.utilization.filter(
      (row) => row.assetId !== id,
    );
    this.commit(dataset);
  }
}
