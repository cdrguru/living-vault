import type { CodexWorkspaceUsageSnapshot } from "./types";

const emptySnapshot: CodexWorkspaceUsageSnapshot = {
  generatedAt: new Date(0).toISOString(),
  source: "codex-workspace-analytics-export",
  windowStart: null,
  windowEnd: null,
  totals: {
    users: 0,
    sessions: 0,
    messages: 0,
    turns: 0,
    tasksWeb: 0,
    codeReviewsWeb: 0,
    reviews: 0,
    reviewComments: 0,
    textInputTokens: 0,
    textCachedInputTokens: 0,
    textOutputTokens: 0,
    textTotalTokens: 0,
  },
  clients: [],
  models: [],
  users: [],
  daily: [],
  notes: [],
};

const localModules = (
  import.meta.env.DEV && !import.meta.env.VITEST
    ? import.meta.glob("./imports/codex-workspace-usage.local.json", { eager: true })
    : {}
) as Record<string, { default: CodexWorkspaceUsageSnapshot }>;

const localSnapshot = Object.values(localModules)[0]?.default;

export const codexWorkspaceUsageSnapshot: CodexWorkspaceUsageSnapshot =
  localSnapshot ?? emptySnapshot;
