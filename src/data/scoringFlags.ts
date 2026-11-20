/**
 * The VAULT_SCORING_V3 feature flag: the re-weighted value metric from the WP4
 * metric redesign (docs/SCORING_V3.md). Default OFF for one release: off, every
 * score is byte-identical to the pre-redesign formula (pinned by
 * scoreGolden.test.ts), because silently re-weighting a metric the owner has
 * been reading for a month would be exactly the kind of quiet score movement
 * this product exists to prevent.
 *
 * Resolution order, read lazily on every call so tests and CLIs stay
 * deterministic without module-cache tricks:
 *  - Vite builds: VITE_VAULT_SCORING_V3=1 (the typeof guard keeps this
 *    Node-safe for tsx tooling, matching evalSnapshot.ts).
 *  - Node (scripts, MCP, self-host): VAULT_SCORING_V3=1.
 * Anything else, including unset, is off.
 */
export function scoringV3Enabled(): boolean {
  if (
    typeof import.meta.env !== "undefined" &&
    import.meta.env.VITE_VAULT_SCORING_V3 === "1"
  ) {
    return true;
  }
  return (
    typeof process !== "undefined" && process.env.VAULT_SCORING_V3 === "1"
  );
}
