import { describe, expect, it } from "vitest";

import { actionableOrphans, isPersonalKey } from "./orphanFilter";

describe("isPersonalKey", () => {
  it("flags personal-life keys across the forbidden categories", () => {
    const personal = [
      "skill:grok_job_search_swarm",
      "skill:ats_resume_optimizer",
      "skill:job_application_submitter",
      "skill:recruiter_fit_scorer",
      "skill:inbound_recruiter_assistant",
      "mcp-server:robinhood-trading",
      "skill:clinical-reconciliation",
      "skill:prenup-prep",
      "skill:bio_evidence_miner",
      "skill:xray-analysis",
      "skill:job-search-swarm",
    ];
    for (const key of personal) {
      expect(isPersonalKey(key), key).toBe(true);
    }
  });

  it("does not over-match a professional key that merely shares a broad word", () => {
    // "trading" is deliberately not a pattern (robinhood already catches the one
    // personal key), so a legitimate finance-analytics tool is not silently hidden.
    expect(isPersonalKey("skill:options-trading-analytics")).toBe(false);
    expect(isPersonalKey("mcp-server:northwind-trading-floor")).toBe(false);
    // The actual personal key is still caught via the "robinhood" pattern.
    expect(isPersonalKey("mcp-server:robinhood-trading")).toBe(true);
  });

  it("does not flag professional or catalog-bound keys", () => {
    const professional = [
      "mcp-server:rayfin",
      "skill:workspace-sync",
      "mcp-server:vault",
      "skill:chatgpt-agent-builder",
      "skill:claude-api",
      "skill:ghost",
    ];
    for (const key of professional) {
      expect(isPersonalKey(key), key).toBe(false);
    }
  });
});

describe("actionableOrphans", () => {
  it("hides personal keys and reports how many were hidden", () => {
    const rows = [
      { key: "mcp-server:rayfin", count: 4 },
      { key: "skill:grok_job_search_swarm", count: 10 },
      { key: "skill:workspace-sync", count: 2 },
      { key: "mcp-server:robinhood-trading", count: 5 },
    ];
    const { shown, hiddenPersonal } = actionableOrphans(rows);
    expect(shown.map((r) => r.key)).toEqual([
      "mcp-server:rayfin",
      "skill:workspace-sync",
    ]);
    expect(hiddenPersonal).toBe(2);
  });

  it("hides nothing and reports zero when no key is personal", () => {
    const rows = [{ key: "skill:ghost", count: 9 }];
    const { shown, hiddenPersonal } = actionableOrphans(rows);
    expect(shown).toHaveLength(1);
    expect(hiddenPersonal).toBe(0);
  });
});
