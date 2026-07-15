import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";

import type {
  SubmissionDedupVerdict,
  SubmissionItemDecision,
  SubmissionItemRow,
  SubmissionRow,
  SubmissionStatus,
} from "@/data";
import type { SubmissionDetail } from "@/data/DataSource";
import { canReview } from "@/dashboard/access";
import { Button } from "@/dashboard/components/Button";
import { DataTable } from "@/dashboard/components/DataTable";
import { EmptyState } from "@/dashboard/components/EmptyState";
import { Panel } from "@/dashboard/components/Panel";
import {
  Pill,
  type PillSeverity,
  type PillTone,
} from "@/dashboard/components/Pill";
import { Skeleton } from "@/dashboard/components/Skeleton";
import { formatDate } from "@/dashboard/format";
import { useActor } from "@/dashboard/useActor";
import { useVault } from "@/dashboard/VaultContext";

const verdictTone: Record<SubmissionDedupVerdict, PillTone> = {
  new: "blue",
  duplicate: "slate",
  conflict: "amber",
};
const verdictSeverity: Record<SubmissionDedupVerdict, PillSeverity> = {
  new: "info",
  duplicate: "neutral",
  conflict: "warn",
};

const statusTone: Record<SubmissionStatus, PillTone> = {
  submitted: "blue",
  under_review: "amber",
  changes_requested: "amber",
  accepted: "green",
  rejected: "slate",
};

const DECISIONS: SubmissionItemDecision[] = ["accept", "refine", "reject"];

// A sensible starting decision per dedup verdict: take the new asset, hold the
// conflict for a human, drop the exact duplicate. The reviewer can override any.
function defaultDecision(
  verdict: SubmissionDedupVerdict,
): SubmissionItemDecision {
  if (verdict === "new") return "accept";
  if (verdict === "conflict") return "refine";
  return "reject";
}

export function SubmissionsPage() {
  const { listSubmissions, getSubmission, decideSubmission, loading } =
    useVault();
  const { role, ownerId } = useActor();
  const allowed = canReview(role);

  const [submissions, setSubmissions] = useState<SubmissionRow[] | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [decisions, setDecisions] = useState<
    Record<string, SubmissionItemDecision>
  >({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const refreshList = useCallback(() => {
    void listSubmissions().then(setSubmissions);
  }, [listSubmissions]);

  useEffect(() => {
    if (allowed) refreshList();
  }, [allowed, refreshList]);

  async function openSubmission(id: string) {
    setMessage(null);
    const loaded = await getSubmission(id);
    setDetail(loaded);
    setDecisions(
      Object.fromEntries(
        loaded.items.map((item) => [
          item.id,
          defaultDecision(item.dedupVerdict),
        ]),
      ),
    );
  }

  async function approve() {
    if (!detail) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await decideSubmission(
        detail.submission.id,
        detail.items.map((item) => ({
          itemId: item.id,
          decision: decisions[item.id] ?? "pending",
        })),
        { reviewedByOwnerId: ownerId },
      );
      setMessage(
        `Imported ${result.added} new and updated ${result.updated} asset(s).`,
      );
      setDetail(null);
      refreshList();
    } catch (err) {
      // Surface the failure in the panel instead of failing silently.
      setMessage(
        `Approve failed: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      setBusy(false);
    }
  }

  if (loading && submissions === null) {
    return (
      <div className="space-y-2" aria-busy="true">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <EmptyState fill title="Review access required">
        Submission review is for maintainers and admins. Ask a Vault admin to
        raise your role to review contributed assets.
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <Panel
        title="Submission queue"
        action={
          <span className="text-xs text-muted">
            {submissions?.length ?? 0} pending
          </span>
        }
      >
        {submissions && submissions.length > 0 ? (
          <DataTable caption="Contributed asset submissions" minWidth={760}>
            <thead>
              <tr>
                <th scope="col">Submitted</th>
                <th scope="col">Contributor</th>
                <th scope="col">Origin</th>
                <th scope="col">Items</th>
                <th scope="col">Conflicts</th>
                <th scope="col">Status</th>
                <th scope="col">
                  <span className="sr-only">Action</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((submission) => (
                <tr key={submission.id}>
                  <td className="whitespace-nowrap text-muted">
                    {formatDate(submission.submittedAt)}
                  </td>
                  <td>{submission.submittedByOwnerId}</td>
                  <td className="text-muted">{submission.originId ?? "-"}</td>
                  <td className="tabular-nums">{submission.itemCount}</td>
                  <td className="tabular-nums">
                    {submission.conflictCount > 0 ? (
                      <Pill tone="amber" severity="warn">
                        {submission.conflictCount}
                      </Pill>
                    ) : (
                      <span className="text-subtle">0</span>
                    )}
                  </td>
                  <td>
                    <Pill tone={statusTone[submission.status]}>
                      {submission.status.replace("_", " ")}
                    </Pill>
                  </td>
                  <td className="text-right">
                    <Button
                      onClick={() => void openSubmission(submission.id)}
                      size="sm"
                      variant="secondary"
                    >
                      Review
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <EmptyState
            action={
              <Link
                className="inline-flex items-center justify-center gap-2 rounded-md bg-accent-strong px-4 py-2 text-sm font-medium text-accent-fg shadow-card transition-[background-color,transform,box-shadow] hover:bg-accent-strong-hover active:translate-y-px"
                to="/settings"
              >
                Open the upload in Settings
              </Link>
            }
            fill
            title="No submissions yet"
          >
            Contributed asset uploads awaiting review will appear here. Share
            the "Submit for review" upload in Settings with your team, then
            triage each item right here.
          </EmptyState>
        )}
      </Panel>

      {detail && (
        <Panel
          title={`Review ${detail.submission.itemCount} item(s)`}
          action={
            <div className="flex items-center gap-2">
              {message && (
                <span className="text-xs text-success-fg" role="status">
                  {message}
                </span>
              )}
              <Button onClick={() => setDetail(null)} size="sm" variant="ghost">
                Close
              </Button>
              <Button
                disabled={busy}
                onClick={() => void approve()}
                size="sm"
                variant="primary"
              >
                {busy ? "Importing..." : "Approve decisions"}
              </Button>
            </div>
          }
        >
          <ul className="divide-y divide-border">
            {detail.items.map((item) => (
              <SubmissionItemReviewRow
                decision={decisions[item.id] ?? "pending"}
                item={item}
                key={item.id}
                onDecision={(decision) =>
                  setDecisions((prev) => ({ ...prev, [item.id]: decision }))
                }
              />
            ))}
          </ul>
        </Panel>
      )}
    </div>
  );
}

function SubmissionItemReviewRow({
  item,
  decision,
  onDecision,
}: {
  item: SubmissionItemRow;
  decision: SubmissionItemDecision;
  onDecision: (decision: SubmissionItemDecision) => void;
}) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-fg">{item.assetName}</span>
          <Pill
            severity={verdictSeverity[item.dedupVerdict]}
            tone={verdictTone[item.dedupVerdict]}
          >
            {item.dedupVerdict}
          </Pill>
        </div>
        <div className="mt-0.5 font-mono text-xs text-subtle">
          {item.assetType} · {item.assetSlug}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <span className="sr-only">Decision for {item.assetName}</span>
        <select
          aria-label={`Decision for ${item.assetName}`}
          className="rounded-md border border-border-strong bg-surface-raised px-2.5 py-1.5 text-sm text-fg"
          onChange={(event) =>
            onDecision(event.target.value as SubmissionItemDecision)
          }
          value={decision}
        >
          {DECISIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>
      </label>
    </li>
  );
}
