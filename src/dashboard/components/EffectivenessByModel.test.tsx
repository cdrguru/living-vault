import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { ModelUsage } from "@/data";
import { EffectivenessByModel } from "./EffectivenessByModel";

const usage: ModelUsage[] = [
  { model: "claude-opus-4-8", invocations: 16, successes: 15, errors: 1, successRate: 15 / 16, latencyMs: 1500 },
  { model: "claude-sonnet-4-6", invocations: 4, successes: 2, errors: 2, successRate: 0.5, latencyMs: 500 },
];

describe("EffectivenessByModel", () => {
  it("lists each model with its invocation share", () => {
    render(<EffectivenessByModel usage={usage} />);
    expect(screen.getByText("claude-opus-4-8")).toBeInTheDocument();
    expect(screen.getByText("claude-sonnet-4-6")).toBeInTheDocument();
    // 16 of 20 invocations on opus.
    expect(screen.getByText("80% of runs")).toBeInTheDocument();
  });

  it("shows an empty state when no model usage is present", () => {
    render(<EffectivenessByModel usage={[]} />);
    expect(
      screen.getByText(/No model-attributed telemetry/),
    ).toBeInTheDocument();
  });
});
