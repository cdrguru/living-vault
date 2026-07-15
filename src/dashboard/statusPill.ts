import { lifecycleOf } from "@/data/assetStatus";
import type { AssetStatus, RiskLevel } from "@/data/types";
import type { PillSeverity, PillTone } from "@/dashboard/components/Pill";

type Lifecycle = ReturnType<typeof lifecycleOf>;

/**
 * The one source of truth for how an asset's lifecycle status reads as a Pill, so
 * every surface (the Catalogue table and mobile list, the asset detail header, the
 * related-assets rows) shows the same color and glyph for the same stage.
 *
 * Tone and glyph always agree (WCAG 1.4.1, color plus shape): active is green + a
 * filled "good" circle; deprecated is red + a "danger" octagon (a discouraged,
 * on-its-way-out warning); retired is slate + a "neutral" dot (inert, end of life,
 * not an alarm). Deprecated and retired therefore stay visually distinct. Scope
 * markers (plugin-managed, project-specific) read as active via lifecycleOf.
 */
const LIFECYCLE_TONE: Record<Lifecycle, PillTone> = {
  active: "green",
  deprecated: "red",
  retired: "slate",
};

const LIFECYCLE_SEVERITY: Record<Lifecycle, PillSeverity> = {
  active: "good",
  deprecated: "danger",
  retired: "neutral",
};

/** The Pill tone and severity for one asset status, keyed by its lifecycle stage. */
export function lifecyclePill(status: AssetStatus): {
  tone: PillTone;
  severity: PillSeverity;
} {
  const lifecycle = lifecycleOf(status);
  return {
    tone: LIFECYCLE_TONE[lifecycle],
    severity: LIFECYCLE_SEVERITY[lifecycle],
  };
}

/**
 * Risk reads as the standard green to red gradient with a matching glyph so color
 * and shape agree: low = green + good (safe), medium = amber + warn, high = red +
 * danger. Shared so the Catalogue and the asset detail page never diverge on it.
 */
const RISK_TONE: Record<RiskLevel, PillTone> = {
  low: "green",
  medium: "amber",
  high: "red",
};

const RISK_SEVERITY: Record<RiskLevel, PillSeverity> = {
  low: "good",
  medium: "warn",
  high: "danger",
};

/** The Pill tone and severity for one asset's risk level. */
export function riskPill(risk: RiskLevel): {
  tone: PillTone;
  severity: PillSeverity;
} {
  return { tone: RISK_TONE[risk], severity: RISK_SEVERITY[risk] };
}
