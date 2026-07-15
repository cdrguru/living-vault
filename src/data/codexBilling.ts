import type { CodexBillingSnapshot } from "./types";

const emptySnapshot: CodexBillingSnapshot = {
  generatedAt: new Date(0).toISOString(),
  source: "chatgpt-codex-analytics-export",
  currency: "credits",
  windowStart: null,
  windowEnd: null,
  totals: {
    credits: 0,
    billedTokens: 0,
    localTokens: 0,
    runs: 0,
  },
  daily: [],
  notes: [],
};

const localModules = (
  import.meta.env.DEV && !import.meta.env.VITEST
    ? import.meta.glob("./imports/codex-billing.local.json", { eager: true })
    : {}
) as Record<string, { default: CodexBillingSnapshot }>;

const localSnapshot = Object.values(localModules)[0]?.default;

export const codexBillingSnapshot: CodexBillingSnapshot =
  localSnapshot ?? emptySnapshot;
