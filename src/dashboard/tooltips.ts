// src/dashboard/tooltips.ts

/**
 * Every dashboard tooltip string, keyed by a stable page.metric slug. Copy stays
 * out of components so it is auditable in one place and ready for future i18n.
 * Each value is at most two sentences (what it measures and how to read it, then a
 * caveat) and is free of em dash and en dash punctuation per the repo rule.
 */
export const TOOLTIPS = {
  // Overview
  "overview.liveActivity":
    "Invocations, successes, and errors for the current window, so you can confirm the Vault is being exercised. Only attributed Claude Code telemetry is counted.",
  "overview.invocations":
    "Total times your assets ran in the window; read it alongside success rate, since volume alone is not value. Only attributed telemetry is counted.",
  "overview.successRate":
    "Share of invocations that succeeded, where a sustained dip flags a failing asset. Assets with no telemetry are excluded.",
  "overview.errors":
    "Invocations that ended in an error this window; a rising trend means an asset regressed. A spike can be one noisy asset, so check the ranking.",
  "overview.quadrant":
    "Each asset plotted by governed score (x) and effective score (y); top right are Stars and bottom left is dead weight. It is a snapshot, not a trend.",
  "overview.libraryComposition":
    "How the Vault splits across stock, custom, and forked sources and by freshness. Retired assets are still counted unless filtered out.",
  "overview.totalAssets":
    "Every asset in the Vault with its stock, custom, and forked split, where a growing custom share means more to maintain. Retired assets are included.",
  "overview.cost30d":
    "Average spend per successful invocation over the selected window, where lower is better. It shows Not tracked until cost telemetry is wired, since v1 does not measure spend.",
  "overview.staleAssets":
    "Assets not edited in over 180 days, worth reviewing to confirm they are still current. Staleness is about edit date, not usage.",

  // Catalogue
  "catalogue.table":
    "Every asset with its type, tier, risk, maturity, and state, sortable to find what to govern next. The maturity meter is a heuristic, not a guarantee of quality.",
  "catalogue.maturity":
    "A 0 to 100 percent heuristic for how complete and battle tested an asset is. It is a rubric estimate, not a measure of real usage.",

  // Effectiveness
  "effectiveness.effectiveRate":
    "Share of confidently-evaluated assets (evidence grade A to C) whose Asset Effectiveness Score tier is exceptional or strong, independent of governance, with low-evidence assets (grade D or E) excluded and reported separately as needing more evidence. Deliberately different from the Monitor's Star Rate, which requires an asset to be BOTH governed and effective, so the two numbers are not meant to match.",
  "effectiveness.telemetrySource":
    "Split the ranking by usage source. Probe-seeded assets carry one synthetic invocation so the catalog can prove they resolve, not because anyone ran them; switch to Live to judge effectiveness on real usage only.",
  "effectiveness.avgSuccess":
    "Average success rate across assets with live telemetry; pair it with volume, since a high rate on tiny volume is fragile. Untracked and probe-seeded assets are excluded.",
  "effectiveness.totalInvocations":
    "Sum of invocations in the latest window, which sets the confidence behind every rate here. Only attributed telemetry is counted.",
  "effectiveness.effectiveAssets":
    "Count of confidently-evaluated assets whose effectiveness tier is exceptional or strong; compare it to how many report live telemetry. Low-evidence assets are excluded since there is not yet enough trustworthy data to judge them.",
  "effectiveness.ranking":
    "Assets ranked so the weakest surface first, to pick what to fix or retire. Rows without telemetry rank low because they are unproven, not broken.",
  "effectiveness.colSuccess":
    "Successful invocations divided by total for this asset, green healthy and red failing. A low or blank bar can just mean too little data.",
  "effectiveness.colEffective":
    "A blended 0 to 100 percent score from success rate and recency, where higher is better. It rewards assets that are reliable and used recently.",
  "effectiveness.colAes":
    "Asset Effectiveness Score (AES) is a Bayesian-adjusted, multi-signal measure of how well an asset performs, reported with an Evidence Confidence grade (A best, E weakest). Missing signals are treated as unknown, never zero, and a low grade means too little trustworthy data to judge yet.",
  "effectiveness.colGoverned":
    "How completely the asset meets its governance checklist of owner, tags, and origin. It measures metadata, not output quality.",
  "effectiveness.colQuadrant":
    "The governed by effective quadrant for this asset: Star, Risk, Shelfware, or Dead weight. It collapses the two scores into one label.",

  // Coverage
  "coverage.coverage":
    "Share of pillar by capability cells holding at least one asset, where higher means fewer gaps. It counts presence, not depth or quality.",
  "coverage.avgMaturity":
    "Average maturity across populated cells only, so a sparse library can still read high. Higher means a more seasoned set of assets.",
  "coverage.pillars":
    "How many pillars and capabilities the taxonomy defines, which sets the matrix size. More pillars make full coverage harder.",
  "coverage.duplicateClusters":
    "Groups of assets that share identical content, each one a consolidation opportunity. Near duplicates that differ slightly are not detected.",
  "coverage.matrix":
    "Pillars by capability, where tint shows average maturity and the number shows asset count, and one asset can appear in several cells so cell counts can exceed the total asset count. Tint reflects maturity, not usage.",

  // Dependencies
  "dependencies.edges":
    "Total requires relationships between assets, a measure of how interconnected the Vault is. It counts declared dependencies, not runtime calls.",
  "dependencies.fragileEdges":
    "Dependencies pointing at a deprecated or retired asset, where any above zero is a break waiting to happen. Replace the target or update the dependent.",
  "dependencies.graph":
    "A node-link map of the requires relationships, where each arrow points from a dependent asset to the asset it requires. Select a node to focus its one-hop neighborhood; Isolate hides the rest.",
  "dependencies.graphedAssets":
    "Assets that participate in at least one requires edge, so they appear on the graph. Assets with no declared dependencies are not graphed by default.",

  // Cost
  "cost.estTotalSpend":
    "Estimated total spend across the harnesses that log tokens, derived from token usage at model list prices. An estimate, not metered billing.",
  "cost.estCostPerSuccess":
    "Estimated spend for each successful outcome across priced harnesses, where lower is more efficient. Derived from tokens at list prices, not billed.",
  "cost.harnessesPriced":
    "How many harnesses could be priced from their token logs, out of all observed. A harness that logs no tokens locally cannot be estimated yet.",
  "cost.actualCodexCredits":
    "Actual credits reported by ChatGPT/Codex analytics exports. This is billed credit usage, separate from the modeled token spend estimate.",
  "cost.codexCoverage":
    "How much of the billed Codex token volume is represented by local rollout logs. Low coverage means usage happened outside the local logs or the export windows differ.",
  "cost.efficiencyByModel":
    "Estimated dollars per successful outcome for each harness, ranked cheapest first. Spend is tokens times each model's list price, so the whole panel is an estimate.",
  "cost.costPerSuccess":
    "Average spend for each successful invocation, where lower is more efficient. It shows only when cost telemetry is tracked, which v1 does not measure.",
  "cost.totalSpend":
    "Total modeled spend across the window, where falling is good. These are projected figures until real cost telemetry is wired.",
  "cost.successfulInvocations":
    "Count of invocations that succeeded, the denominator behind cost per success. Failures and refusals are excluded.",
  "cost.wastedSpend":
    "Spend on assets judged not effective, where a smaller share means a leaner library. Effectiveness is a heuristic, so treat this as directional.",
  "cost.whereSpendGoes":
    "Modeled spend grouped by asset type, to see which category dominates. Figures are projected, not billed.",
  "cost.spendByQuadrant":
    "Modeled spend across the four health quadrants, where spend in Shelfware or Dead weight is first to cut. Figures are projected, not billed.",
  "cost.spendEfficiency":
    "The split of spend between effective and wasted assets, where a larger green share is healthier. It is based on the effectiveness heuristic.",
  "cost.topWasted":
    "Assets that still cost money while failing the effectiveness bar, worst first. These Shelfware and Dead weight items are the leading candidates to cut or fix.",
  "cost.window":
    "The telemetry window these figures cover and whether cost is measured from live logs or modeled. In v1 cost is modeled, not billed.",

  // Monitor
  "monitor.healthTiles":
    "Each tile counts assets in one health class and, where it maps cleanly, filters the board when clicked. Tiles are live counts, not a trend.",
  "monitor.exceptionQueue":
    "Assets needing attention, worst first, one most urgent gap each. It hides low severity and handled items by default; switch to All to see everything.",
  "monitor.canvas":
    "A map of assets and their dependency edges; pick a lens to recolor and select a node to focus its neighborhood. Layout aids orientation and carries no geographic meaning.",
  "monitor.orphanedUsage":
    "Claude Code telemetry that matched no catalog asset, ranked by volume, hinting an asset is missing or misnamed. It is unattributed usage, not errors.",
  "monitor.harnessUsage":
    "Real usage per agent harness, read locally from each tool's own session logs (counts and timings only, never message content). Grains differ (Codex counts tool calls, Claude Code counts governed-asset invocations), so read each card on its own terms, not as a leaderboard.",
  "monitor.routing":
    "Routing decisions reported by a router: how many routed requests a governed asset answered locally versus falling back to an external model, the measured external spend, and the modeled cost the local hits avoided. Covers routed traffic only, never the whole fleet, and the avoided-cost figure is a labeled counterfactual, not measured spend.",
  "monitor.filters":
    "Narrow the queue and the map by health, issue, type, bundle or domain, and severity, combined with AND. Clear all resets every dimension at once.",

  // Model
  "model.canvas":
    "The Rayfin data model as an entity diagram of tables and relationships; use search and the mode toggle to trace joins. It shows the schema, not live row counts.",
} as const;

export type TooltipKey = keyof typeof TOOLTIPS;
