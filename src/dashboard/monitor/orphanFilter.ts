import type { UnattributedUsage } from "@/data";

/**
 * Substrings that mark an unattributed usage key as a personal-life asset: job
 * search, ATS, recruiter, trading, clinical, or legal. The real-assets overlay is
 * professional-only by policy (CLAUDE.md), so these keys can never be catalogued
 * and would otherwise sit in the orphaned-usage panel forever as noise. The panel
 * hides them but reports the hidden count, so signal is decluttered, not dropped.
 */
export const PERSONAL_KEY_PATTERNS = [
  "job_search",
  "job-search",
  "ats_resume",
  "job_application",
  "recruiter",
  "robinhood",
  "clinical",
  "prenup",
  "bio_evidence",
  "xray",
];

/** True when a usage key matches a personal-life category we never catalog. */
export function isPersonalKey(key: string): boolean {
  const lower = key.toLowerCase();
  return PERSONAL_KEY_PATTERNS.some((pattern) => lower.includes(pattern));
}

export interface ActionableOrphans {
  /** Keys worth acting on (potential catalog gaps), personal-life keys removed. */
  shown: UnattributedUsage[];
  /** How many personal-life keys were hidden, so the count is never silent. */
  hiddenPersonal: number;
}

/** Split unattributed usage into actionable orphans and a hidden personal count. */
export function actionableOrphans(rows: UnattributedUsage[]): ActionableOrphans {
  const shown = rows.filter((row) => !isPersonalKey(row.key));
  return { shown, hiddenPersonal: rows.length - shown.length };
}
