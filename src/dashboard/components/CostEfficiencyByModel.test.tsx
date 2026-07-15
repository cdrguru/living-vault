import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { HarnessSpend } from "@/data";
import { CostEfficiencyByModel } from "./CostEfficiencyByModel";

function pricedRow(overrides: Partial<HarnessSpend>): HarnessSpend {
  return {
    source: "claude",
    label: "Claude",
    model: "claude-opus-4-8",
    modelCount: 1,
    rate: 15,
    tokens: 1_000_000,
    successes: 10,
    invocations: 12,
    cost: 1,
    costPerSuccess: 0.1,
    priced: true,
    logsTokens: true,
    quality: "derived",
    byModel: [{ model: "claude-opus-4-8", tokens: 1_000_000, rate: 15, cost: 1 }],
    ...overrides,
  };
}

describe("CostEfficiencyByModel", () => {
  it("renders the relative-scale caption and scales the cheaper bar to half the costliest", () => {
    const spend: HarnessSpend[] = [
      pricedRow({ source: "claude", label: "Claude", costPerSuccess: 0.05 }),
      pricedRow({ source: "codex", label: "Codex", costPerSuccess: 0.1 }),
    ];

    render(<CostEfficiencyByModel spend={spend} />);

    // worst === 0.1, so the caption quotes the formatted costliest cost per success.
    const caption = screen.getByText(
      /Bar length is cost per success relative to the costliest harness/,
    );
    expect(caption).toBeInTheDocument();
    expect(caption.textContent).toContain("$0.1");
    expect(caption.textContent).toContain("Shorter is cheaper.");

    // The cheaper harness (0.05 of a 0.1 worst) fills half the costliest bar.
    const cheaper = screen.getByLabelText(/^Claude:/);
    expect(cheaper).toHaveAttribute("aria-valuenow", "50");
  });

  it("lists every model with its own spend when a harness uses several", () => {
    const spend: HarnessSpend[] = [
      pricedRow({
        source: "codex",
        label: "Codex",
        model: "gpt-5",
        modelCount: 3,
        byModel: [
          { model: "gpt-5", tokens: 10_000_000, rate: 5, cost: 50 },
          { model: "gpt-5.4", tokens: 5_000_000, rate: 4, cost: 20 },
          { model: "gpt-5.1-codex-mini", tokens: 2_000_000, rate: 1.5, cost: 3 },
        ],
      }),
    ];

    render(<CostEfficiencyByModel spend={spend} />);

    // A multi-model harness announces its model count and lists each model.
    expect(screen.getByText(/3 models/)).toBeInTheDocument();
    expect(screen.getByText("gpt-5")).toBeInTheDocument();
    expect(screen.getByText("gpt-5.4")).toBeInTheDocument();
    expect(screen.getByText("gpt-5.1-codex-mini")).toBeInTheDocument();
  });

  it("separates a window-idle harness from one that never logs tokens", () => {
    const spend: HarnessSpend[] = [
      pricedRow({ source: "claude", label: "Claude" }),
      // logs tokens, but none in this window -> idle, not "doesn't log tokens"
      pricedRow({ source: "gemini", label: "Gemini", priced: false, logsTokens: true, costPerSuccess: null, cost: 0, tokens: 0, byModel: [] }),
      // genuinely logs no tokens locally
      pricedRow({ source: "windsurf", label: "Windsurf", priced: false, logsTokens: false, costPerSuccess: null, cost: 0, tokens: 0, byModel: [] }),
    ];

    render(<CostEfficiencyByModel spend={spend} />);

    const idle = screen.getByText(/No activity in this window/);
    expect(idle.textContent).toContain("Gemini");
    expect(idle.textContent).not.toContain("Windsurf");

    const tokenless = screen.getByText(/do not log token counts locally/);
    expect(tokenless.textContent).toContain("Windsurf");
    expect(tokenless.textContent).not.toContain("Gemini");
  });

  it("renders no caption when only one harness is priced", () => {
    const spend: HarnessSpend[] = [pricedRow({ source: "claude", label: "Claude" })];

    render(<CostEfficiencyByModel spend={spend} />);

    expect(
      screen.queryByText(/Bar length is cost per success relative to the costliest harness/),
    ).not.toBeInTheDocument();
  });

  it("shows a 'modeled' pill for a harness with quality='modeled'", () => {
    const spend: HarnessSpend[] = [
      pricedRow({ source: "claude", label: "Claude", quality: "modeled" }),
    ];

    render(<CostEfficiencyByModel spend={spend} />);

    expect(screen.getByText("modeled")).toBeInTheDocument();
    // The "rough" pill for "partial" should NOT appear.
    expect(screen.queryByText("rough")).not.toBeInTheDocument();
  });

  it("surfaces cache-read tokens in the per-model breakdown when present", () => {
    const spend: HarnessSpend[] = [
      pricedRow({
        source: "claude",
        label: "Claude",
        quality: "modeled",
        modelCount: 2,
        byModel: [
          {
            model: "claude-opus-4-8",
            tokens: 1_000_000,
            rate: 15,
            cost: 1,
            cacheReadTokens: 2_000_000,
          },
          {
            model: "claude-sonnet-4-6",
            tokens: 500_000,
            rate: 3,
            cost: 0.5,
            // no cacheReadTokens — should not render the cache-read span
          },
        ],
      }),
    ];

    render(<CostEfficiencyByModel spend={spend} />);

    // The first model has 2M cache-read tokens — should appear as formatted text.
    expect(screen.getByText(/2,000,000 cache-read tok @ ~10%/)).toBeInTheDocument();
    // The second model has no cache-read tokens — only one such span should appear.
    const cacheLines = screen.queryAllByText(/cache-read tok/);
    expect(cacheLines).toHaveLength(1);
  });
});
