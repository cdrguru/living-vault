import { realAssetId } from "./realAssets";
import type { HarnessUsage } from "./types";

/**
 * Whether a harness's per-skill loads were measured. Only `derived` or `full` count:
 * a missing `tracked.skills` (an old snapshot, any other harness) or `none` means the
 * loads were never attributed, which must read as "not measured", never as zero.
 */
export function skillsMeasured(usage: HarnessUsage | null | undefined): boolean {
  const grade = usage?.tracked.skills;
  return grade === "derived" || grade === "full";
}

export interface CodexSkillUse {
  measured: boolean;
  /** assetId -> Codex loads, for skill names that resolve to a Vault asset. */
  byAsset: Record<string, number>;
  /** Names with no Vault asset (Codex built-ins, project skills). Never minted. */
  unresolved: { skill: string; loads: number }[];
}

/**
 * Resolve a Codex source's per-skill loads to Vault asset ids through the same
 * `realAssetId("skill", name)` rule the Claude Code telemetry uses. Pure. Pass the
 * source already windowed (getHarnessUsage) for a windowed count.
 */
export function codexSkillUseByAsset(
  usage: HarnessUsage | null | undefined,
  assets: ReadonlyArray<{ id: string; type: string }>,
): CodexSkillUse {
  if (!usage || !skillsMeasured(usage)) {
    return { measured: false, byAsset: {}, unresolved: [] };
  }
  const known = new Set(
    assets.filter((asset) => asset.type === "skill").map((asset) => asset.id),
  );
  const byAsset: Record<string, number> = {};
  const unresolvedBySkill = new Map<string, number>();
  for (const row of usage.skillUses ?? []) {
    const id = realAssetId("skill", row.skill);
    if (known.has(id)) byAsset[id] = (byAsset[id] ?? 0) + row.loads;
    else unresolvedBySkill.set(row.skill, (unresolvedBySkill.get(row.skill) ?? 0) + row.loads);
  }
  const unresolved = [...unresolvedBySkill.entries()]
    .map(([skill, loads]) => ({ skill, loads }))
    .sort((a, b) => b.loads - a.loads || (a.skill < b.skill ? -1 : 1));
  return { measured: true, byAsset, unresolved };
}
