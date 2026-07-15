/**
 * Pure model for the live-Fabric telemetry onboarding wizard. The three steps gate
 * forward: usage can only attribute to a catalogue that already has assets, so
 * "generate" and "upload" stay blocked until at least one asset exists. Kept pure
 * and separate from the component so the gating is unit-testable without a DOM.
 */

export type WizardStepState = "pending" | "done" | "blocked";

export interface WizardStepStates {
  catalogue: WizardStepState;
  generate: WizardStepState;
  upload: WizardStepState;
}

export interface WizardInput {
  /** How many assets are in the live catalogue (telemetry needs a target). */
  catalogueCount: number;
  /** Whether a real usage upload has completed this session. */
  uploaded: boolean;
}

export function deriveWizardSteps({
  catalogueCount,
  uploaded,
}: WizardInput): WizardStepStates {
  const hasCatalogue = catalogueCount > 0;
  // The catalogue gate wins over `uploaded`: an empty catalogue can never have
  // produced a real upload, so downstream steps stay blocked regardless.
  const downstream: WizardStepState = !hasCatalogue
    ? "blocked"
    : uploaded
      ? "done"
      : "pending";
  return {
    catalogue: hasCatalogue ? "done" : "pending",
    generate: downstream,
    upload: downstream,
  };
}

/** The bundled standalone collector this app serves at /<filename>. */
export const COLLECTOR_FILENAME = "living-vault-collect.mjs";

/**
 * One copy-paste command: download the standalone collector FROM THIS APP, then run
 * it. Repo-free on purpose, so anyone the app is shared with can generate their upload
 * without a checkout of this repo. `origin` is the app's own origin (where the bundled
 * collector is served); a trailing slash is tolerated.
 */
export function collectorCommand(
  origin: string,
  mode: "telemetry" | "assets",
): string {
  const base = origin.replace(/\/+$/, "");
  return `curl -fsSL ${base}/${COLLECTOR_FILENAME} -o ${COLLECTOR_FILENAME} && node ${COLLECTOR_FILENAME} ${mode}`;
}

/** Files the collector writes into the current directory, which the user then uploads. */
export const TELEMETRY_UPLOAD_OUTPUT = "./utilization.upload.json";
export const ASSETS_OUTPUT = "./living-vault-assets.json";
