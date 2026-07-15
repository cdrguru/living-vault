import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";

import { seedDataset, type DataSource, type VaultDataset } from "@/data";
import type {
  SubmissionDedupVerdict,
  SubmissionItemRow,
  SubmissionRow,
} from "@/data";
import { VaultProvider } from "@/dashboard/VaultContext";
import { SubmissionsPage } from "@/dashboard/pages/SubmissionsPage";
import { AuthProvider } from "@/hooks/AuthContext";
import { DemoAuthService } from "@/services/DemoAuthService";
import { stubSource } from "@/__tests__/harness";

function submission(over: Partial<SubmissionRow> = {}): SubmissionRow {
  return {
    id: "sub-1",
    tenantId: "t",
    submittedByOwnerId: "own-lee",
    originId: "org-local",
    status: "submitted",
    itemCount: 1,
    acceptedCount: 0,
    rejectedCount: 0,
    conflictCount: 0,
    contentHash: "abc",
    submittedAt: "2026-06-18T10:00:00.000Z",
    ...over,
  };
}

function item(
  verdict: SubmissionDedupVerdict,
  over: Partial<SubmissionItemRow> = {},
): SubmissionItemRow {
  return {
    id: "sub-1-item-0",
    tenantId: "t",
    submissionId: "sub-1",
    assetId: "contrib-skill-x",
    assetName: "Contributed Skill",
    assetType: "skill",
    assetSlug: "contributed-skill",
    description: "",
    body: "b",
    version: "1.0.0",
    assetStatus: "active",
    riskLevel: "low",
    maturity: 0.5,
    tier: "custom",
    contentHash: "h",
    tagIds: [],
    dedupVerdict: verdict,
    decision: "pending",
    ...over,
  };
}

function sourceWith(
  overrides: Partial<DataSource>,
  dataset: VaultDataset = structuredClone(seedDataset),
): DataSource {
  return { ...stubSource(dataset), ...overrides };
}

function renderPage(source: DataSource) {
  return render(
    <AuthProvider authService={new DemoAuthService()}>
      <MemoryRouter>
        <VaultProvider dataSource={source}>
          <SubmissionsPage />
        </VaultProvider>
      </MemoryRouter>
    </AuthProvider>,
  );
}

describe("SubmissionsPage access", () => {
  it("denies a viewer with an access notice and no queue", async () => {
    const dataset = structuredClone(seedDataset);
    dataset.owners.push({
      id: "own-demo",
      tenantId: dataset.owners[0].tenantId,
      name: "Ava",
      email: "ava@contoso.com",
      role: "viewer",
    });
    const listSubmissions = vi.fn().mockResolvedValue([submission()]);
    renderPage(sourceWith({ listSubmissions }, dataset));

    expect(
      await screen.findByText(/maintainers and admins/i),
    ).toBeInTheDocument();
    expect(screen.queryByText("Contributed Skill")).not.toBeInTheDocument();
  });
});

describe("SubmissionsPage review", () => {
  it("lists submissions for a reviewer", async () => {
    const listSubmissions = vi.fn().mockResolvedValue([submission()]);
    renderPage(sourceWith({ listSubmissions }));

    expect(await screen.findByText("own-lee")).toBeInTheDocument();
    expect(screen.getByText("submitted")).toBeInTheDocument();
  });

  it("shows an empty state when there are no submissions", async () => {
    const listSubmissions = vi.fn().mockResolvedValue([]);
    renderPage(sourceWith({ listSubmissions }));
    expect(await screen.findByText(/no submissions/i)).toBeInTheDocument();
  });

  it("opens a submission and shows its staged items with dedup verdicts", async () => {
    const listSubmissions = vi.fn().mockResolvedValue([submission()]);
    const getSubmission = vi.fn().mockResolvedValue({
      submission: submission(),
      items: [item("conflict")],
    });
    renderPage(sourceWith({ listSubmissions, getSubmission }));

    await userEvent.click(
      await screen.findByRole("button", { name: /review/i }),
    );

    expect(await screen.findByText("Contributed Skill")).toBeInTheDocument();
    expect(screen.getByText("conflict")).toBeInTheDocument();
    expect(getSubmission).toHaveBeenCalledWith("sub-1");
  });

  it("approves decisions through decideSubmission with the reviewer id", async () => {
    const listSubmissions = vi.fn().mockResolvedValue([submission()]);
    const getSubmission = vi.fn().mockResolvedValue({
      submission: submission(),
      items: [item("new")],
    });
    const decideSubmission = vi
      .fn()
      .mockResolvedValue({ added: 1, updated: 0 });
    renderPage(
      sourceWith({ listSubmissions, getSubmission, decideSubmission }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /review/i }),
    );
    await screen.findByText("Contributed Skill");
    await userEvent.click(
      screen.getByRole("button", { name: /approve decisions/i }),
    );

    await waitFor(() => expect(decideSubmission).toHaveBeenCalledTimes(1));
    const [id, decisions, review] = decideSubmission.mock.calls[0];
    expect(id).toBe("sub-1");
    expect(decisions).toContainEqual(
      expect.objectContaining({ itemId: "sub-1-item-0", decision: "accept" }),
    );
    expect(review.reviewedByOwnerId).toBeTruthy();
  });

  it("defaults per-item decisions by verdict and honors a reviewer override", async () => {
    const items = [
      item("new", { id: "it-new", assetName: "New Skill", assetSlug: "new-s" }),
      item("duplicate", { id: "it-dup", assetName: "Dup Skill", assetSlug: "dup-s" }),
      item("conflict", { id: "it-con", assetName: "Conflict Skill", assetSlug: "con-s" }),
    ];
    const listSubmissions = vi
      .fn()
      .mockResolvedValue([submission({ itemCount: items.length })]);
    const getSubmission = vi
      .fn()
      .mockResolvedValue({ submission: submission(), items });
    const decideSubmission = vi
      .fn()
      .mockResolvedValue({ added: 1, updated: 0 });
    renderPage(
      sourceWith({ listSubmissions, getSubmission, decideSubmission }),
    );

    await userEvent.click(
      await screen.findByRole("button", { name: /review/i }),
    );
    await screen.findByText("New Skill");

    // Verdict-derived defaults: take the new, hold the conflict, drop the dup.
    expect(
      screen.getByRole("combobox", { name: "Decision for New Skill" }),
    ).toHaveValue("accept");
    expect(
      screen.getByRole("combobox", { name: "Decision for Dup Skill" }),
    ).toHaveValue("reject");
    expect(
      screen.getByRole("combobox", { name: "Decision for Conflict Skill" }),
    ).toHaveValue("refine");

    // The reviewer overrides the conflict to an outright reject before approving.
    await userEvent.selectOptions(
      screen.getByRole("combobox", { name: "Decision for Conflict Skill" }),
      "reject",
    );
    await userEvent.click(
      screen.getByRole("button", { name: /approve decisions/i }),
    );

    await waitFor(() => expect(decideSubmission).toHaveBeenCalledTimes(1));
    const [, decisions] = decideSubmission.mock.calls[0];
    expect(decisions).toEqual([
      { itemId: "it-new", decision: "accept" },
      { itemId: "it-dup", decision: "reject" },
      { itemId: "it-con", decision: "reject" },
    ]);
  });
});
