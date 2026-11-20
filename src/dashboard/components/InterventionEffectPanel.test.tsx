import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { InterventionEffectView, InterventionRow, Verdict } from "@/data";

import { InterventionEffectPanel } from "./InterventionEffectPanel";

function row(over: Partial<InterventionRow> = {}): InterventionRow {
  return {
    id: "iv-1",
    tenantId: "t",
    assetId: "a1",
    date: "2026-07-01",
    action: "improve",
    outcome: "revised",
    actor: "claude-code",
    effectiveScoreBefore: 0.5,
    invocationsBefore: 100,
    dedupeKey: "a1:2026-07-01:improve",
    recordedAt: "2026-07-01T00:00:00.000Z",
    ...over,
  };
}

function view(
  verdict: Verdict,
  over: Partial<InterventionEffectView> = {},
): InterventionEffectView {
  return {
    verdict,
    intervention: over.intervention ?? row(),
    delta: over.delta ?? null,
    postChangeSample: over.postChangeSample ?? 0,
    requiredSample: over.requiredSample ?? 20,
    scoreNow: over.scoreNow ?? null,
  };
}

describe("InterventionEffectPanel", () => {
  it("shows the before -> now numbers and delta for a MEASURED improvement", () => {
    const { getByText, container } = render(
      <InterventionEffectPanel
        view={view("improved", {
          intervention: row({ effectiveScoreBefore: 0.56 }),
          delta: 0.15,
          postChangeSample: 34,
          scoreNow: 0.71,
        })}
      />,
    );
    expect(getByText("improved")).toBeTruthy();
    expect(container.textContent).toContain("56% → 71%");
    expect(container.textContent).toContain("+15%");
    expect(container.textContent).toContain("34 post-change invocations");
  });

  it("labels a regression and colors the delta as danger", () => {
    const { getByText, container } = render(
      <InterventionEffectPanel
        view={view("regressed", {
          intervention: row({ effectiveScoreBefore: 0.8 }),
          delta: -0.2,
          postChangeSample: 40,
          scoreNow: 0.6,
        })}
      />,
    );
    expect(getByText("regressed")).toBeTruthy();
    expect(container.textContent).toContain("-20%");
  });

  it("shows a MEASURING message and NO before/now percentages while insufficient", () => {
    // The load-bearing gate: a below-floor window must never render a delta as a result.
    const { getByText, container } = render(
      <InterventionEffectPanel
        view={view("inconclusive", {
          delta: 0.9, // a huge delta that must NOT be shown
          postChangeSample: 6,
          requiredSample: 20,
          scoreNow: 0.95,
        })}
      />,
    );
    expect(getByText("measuring")).toBeTruthy();
    expect(container.textContent).toContain(
      "6 of 20 post-change invocations needed",
    );
    // No result rendered: neither the arrow nor the +90% delta appears.
    expect(container.textContent).not.toContain("→");
    expect(container.textContent).not.toContain("90%");
  });

  it("explains a deferral has nothing to measure", () => {
    const { container } = render(
      <InterventionEffectPanel
        view={view("deferred", {
          intervention: row({ outcome: "deferred", note: "on-call runbook" }),
        })}
      />,
    );
    // "deferred" appears both as the pill label and the outcome word, so assert on the
    // panel's full text rather than a single-match query.
    expect(container.textContent).toContain("deferred");
    expect(container.textContent).toContain("nothing to measure");
    expect(container.textContent).toContain("on-call runbook");
  });

  it("marks a stalled window unmeasurable", () => {
    const { getByText, container } = render(
      <InterventionEffectPanel
        view={view("stalled", { postChangeSample: 3, requiredSample: 20 })}
      />,
    );
    expect(getByText("unmeasurable")).toBeTruthy();
    expect(container.textContent).toContain("cannot be judged");
  });
});
