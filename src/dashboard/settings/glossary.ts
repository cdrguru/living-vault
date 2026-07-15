import type { PillTone } from "@/dashboard/components/Pill";
import { NAV } from "@/dashboard/nav";

/**
 * The canonical, page-independent definitions for the Vault's metrics and terms.
 * Per-metric tooltip copy lives in tooltips.ts; this module is the concept-level
 * glossary that the tooltips assume but never spell out (what governed and
 * effective actually mean, the quadrant model, how cost is modeled). Kept as
 * plain data so the Help section and any future surface share one source.
 */
export interface GlossaryEntry {
  term: string;
  definition: string;
}

export const CONCEPTS: GlossaryEntry[] = [
  {
    term: "Governed score",
    definition:
      "How completely an asset meets its governance checklist of owner, tags, and origin. It measures metadata completeness, not output quality.",
  },
  {
    term: "Effective score",
    definition:
      "A blended 0 to 100 score from success rate and recency. It rewards assets that are reliable and have been used recently; assets with no telemetry score low because they are unproven, not broken.",
  },
  {
    term: "Star Rate",
    definition:
      "The share of evidence-backed assets that are BOTH governed and effective (the Stars quadrant), shown on the Monitor and Overview. It is stricter than the AES Effective Rate because it also requires governance.",
  },
  {
    term: "AES Effective Rate",
    definition:
      "The share of confidently-evaluated assets (evidence grade A to C) whose Asset Effectiveness Score tier is strong or exceptional, independent of governance, shown on the Effectiveness page. It reads higher than the Star Rate because it ignores governance and drops low-evidence assets from the denominator.",
  },
  {
    term: "Cost per success",
    definition:
      "Estimated spend for each successful outcome, derived from token usage at model list prices. It is a modeled estimate, not metered billing.",
  },
  {
    term: "Coverage",
    definition:
      "The share of pillar by capability cells that hold at least one asset. It counts presence across the taxonomy, not depth or quality.",
  },
  {
    term: "Staleness",
    definition:
      "An asset not edited in over 180 days. Staleness is about edit date, not usage; a stale asset can still be heavily used.",
  },
  {
    term: "Duplicate cluster",
    definition:
      "A group of assets that share identical content, each a consolidation opportunity. Near duplicates that differ slightly are not detected.",
  },
  {
    term: "Maturity",
    definition:
      "A 0 to 100 heuristic for how complete and battle tested an asset is. It is a rubric estimate, not a measure of real usage.",
  },
  {
    term: "Tier",
    definition:
      "Where an asset came from: stock (shipped as-is), custom (authored here), or forked (a stock asset modified locally). A growing custom and forked share means more to maintain.",
  },
  {
    term: "Harness",
    definition:
      "An agent runtime that exercises the assets (Claude Code, Codex, and others). Usage is read locally from each harness's own session logs, counts and timings only, never message content.",
  },
  {
    term: "Modeled cost",
    definition:
      "In v1 spend is not billed. Figures are tokens multiplied by each model's list price, so every cost number is directional, not an invoice.",
  },
];

export interface QuadrantEntry {
  name: string;
  meaning: string;
  tone: PillTone;
}

/** The governed-by-effective health quadrants, matching metrics.ts exactly. */
export const QUADRANTS: QuadrantEntry[] = [
  {
    name: "Stars",
    meaning:
      "High governed and high effective. Well documented and pulling their weight; protect and reuse them.",
    tone: "green",
  },
  {
    name: "Risks",
    meaning:
      "Low governed but high effective. People rely on them, yet they lack owner, tags, or origin; govern them before they break.",
    tone: "red",
  },
  {
    name: "Shelfware",
    meaning:
      "High governed but low effective. Tidy metadata, little proven value; the leading candidates to revive or retire.",
    tone: "amber",
  },
  {
    name: "Dead weight",
    meaning:
      "Low governed and low effective. Neither documented nor proven; the first to cut.",
    tone: "slate",
  },
];

export interface PageGuideEntry {
  path: string;
  label: string;
  answers: string;
}

/** One line of "what this page answers" for each primary route, keyed by path. */
const ANSWERS: Record<string, string> = {
  "/": "Library health at a glance: totals, the governed-by-effective quadrant, live activity, and what needs attention.",
  "/monitor":
    "The operational board: health tiles, the exception queue worst-first, and the dependency map for triage.",
  "/catalogue":
    "The full inventory, sortable and filterable, plus the form to add or edit an asset.",
  "/effectiveness":
    "Which assets pull their weight, ranked so the weakest surface first for fix-or-retire decisions.",
  "/cost":
    "Modeled spend, cost per success, and wasted spend, split by type and by health quadrant.",
  "/coverage":
    "Where the taxonomy has gaps: the pillar-by-capability matrix and duplicate clusters to consolidate.",
  "/governance":
    "The governance posture: governed, needs-governance, and orphaned assets split out, plus utilization traced to the upstream source each asset came from.",
  "/dependencies":
    "How assets connect: a requires graph as a node-link diagram, with arrows from each dependent to what it requires and fragile links to deprecated targets flagged.",
  "/model":
    "The Rayfin data model as an entity diagram, to trace tables and relationships.",
  "/submissions":
    "The review queue for contributed assets: triage submitted items by dedup verdict and accept, refine, or reject before they enter the catalog.",
};

/** Built from NAV so a new route cannot be added without a guide entry (enforced
 * by the completeness test). */
export const PAGE_GUIDE: PageGuideEntry[] = NAV.map((item) => ({
  path: item.path,
  label: item.label,
  answers: ANSWERS[item.path] ?? "",
}));
