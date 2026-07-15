import { type CSSProperties, type ReactNode } from "react";

import { Panel } from "@/dashboard/components/Panel";
import {
  Pill,
  type PillSeverity,
  type PillTone,
} from "@/dashboard/components/Pill";
import { CopyCommand } from "@/dashboard/components/CopyCommand";
import { FabricSyncButton } from "@/dashboard/components/FabricSyncButton";
import { ContributeUpload } from "@/dashboard/components/ContributeUpload";
import { TelemetryUpload } from "@/dashboard/components/TelemetryUpload";
import { useVault } from "@/dashboard/VaultContext";
import { datasetHasOnlyProbe } from "@/dashboard/settings/environment";
import {
  ASSETS_OUTPUT,
  TELEMETRY_UPLOAD_OUTPUT,
  collectorCommand,
  deriveWizardSteps,
  type WizardStepState,
} from "@/dashboard/components/telemetryWizardSteps";

const STEP_PILL: Record<
  WizardStepState,
  { label: string; tone: PillTone; severity: PillSeverity }
> = {
  done: { label: "Done", tone: "green", severity: "good" },
  pending: { label: "To do", tone: "amber", severity: "warn" },
  blocked: { label: "Blocked", tone: "slate", severity: "neutral" },
};

// The number badge carries the state as colour and shape: a filled accent disc for
// the actionable step, a success disc with a check once done, a muted ring while
// blocked. Matches the console's status language (colour plus glyph, never colour
// alone) used by Pill.
const STEP_BADGE: Record<WizardStepState, string> = {
  done: "bg-success-surface text-success-fg ring-1 ring-success/40",
  pending: "bg-accent-strong text-accent-fg shadow-card",
  blocked: "bg-surface-inset text-subtle ring-1 ring-border",
};

const CheckGlyph = () => (
  <svg
    aria-hidden="true"
    className="h-3.5 w-3.5"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.5"
    viewBox="0 0 24 24"
  >
    <path d="M5 13l4 4L19 7" />
  </svg>
);

function Step({
  index,
  title,
  state,
  current,
  last,
  children,
}: {
  index: number;
  title: string;
  state: WizardStepState;
  current: boolean;
  last: boolean;
  children: ReactNode;
}) {
  const pill = STEP_PILL[state];
  return (
    <li
      aria-current={current ? "step" : undefined}
      className="flex gap-3"
      data-rise
      style={{ "--rise-delay": `${index * 70}ms` } as CSSProperties}
    >
      <div className="flex flex-col items-center">
        <span
          aria-hidden="true"
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${STEP_BADGE[state]}`}
        >
          {state === "done" ? <CheckGlyph /> : index}
        </span>
        {!last && (
          <span aria-hidden="true" className="mt-1 w-px flex-1 bg-border" />
        )}
      </div>
      <div className="min-w-0 flex-1 space-y-2 pb-1">
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-display text-sm font-semibold tracking-tight text-fg">
            {title}
          </h3>
          <Pill severity={pill.severity} tone={pill.tone}>
            {pill.label}
          </Pill>
        </div>
        {children}
      </div>
    </li>
  );
}

/**
 * Live-Fabric telemetry onboarding. Three gated steps walk the owner from an empty
 * deploy to imported real usage: make sure the catalogue has assets to attribute to,
 * generate the metadata-only upload file on the Mac, then upload it. The steps gate
 * forward (see deriveWizardSteps) because usage can only land on assets that already
 * exist, and the upload step reads as Done once real (non-probe) telemetry is in the
 * dataset. It clarifies that the toolbar's Sync telemetry button is bundled demo
 * data, not this live path.
 */
export function TelemetryWizard() {
  const { dataset } = useVault();
  const catalogueCount = dataset?.assets.length ?? 0;
  // Real usage is in the dataset once telemetry is present and not merely probe
  // seeded. Deriving from the dataset (rather than a one-shot callback) keeps the
  // step honest across reloads and navigation.
  const uploaded =
    Boolean(dataset?.telemetryMeta) && !datasetHasOnlyProbe(dataset);
  const steps = deriveWizardSteps({ catalogueCount, uploaded });
  // The collector is downloaded from THIS app, so the command works for anyone the
  // app is shared with, with no copy of the repo. origin is the deployed app's URL.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const telemetryCmd = collectorCommand(origin, "telemetry");
  const assetsCmd = collectorCommand(origin, "assets");
  // Spotlight the first still-actionable step as the current one.
  const order: WizardStepState[] = [
    steps.catalogue,
    steps.generate,
    steps.upload,
  ];
  const currentIndex = order.indexOf("pending");

  return (
    <Panel title="Set up live telemetry">
      <p className="text-sm text-muted">
        Reading and writing the live Fabric backend through Rayfin. Import your
        real Claude Code usage in three steps. No local collector runs against
        the deploy; you generate a metadata-only file on your Mac and upload it
        here.
      </p>
      <div className="mt-3 flex items-start gap-2 rounded-md border border-info/30 bg-info-surface px-3 py-2 text-xs text-info-fg">
        <svg
          aria-hidden="true"
          className="mt-0.5 h-3.5 w-3.5 shrink-0"
          fill="currentColor"
          viewBox="0 0 16 16"
        >
          <circle cx="8" cy="4.4" r="1.2" />
          <rect height="6" rx="0.6" width="2" x="7" y="6.8" />
        </svg>
        <p>
          The toolbar's <span className="font-semibold">Sync telemetry</span>{" "}
          button loads bundled demo usage for a quick look; it does not touch
          live Fabric. Use this wizard to import your own real usage.
        </p>
      </div>

      <ol className="mt-4 space-y-4">
        <Step
          current={currentIndex === 0}
          index={1}
          last={false}
          state={steps.catalogue}
          title="Catalogue ready"
        >
          <p className="text-sm text-muted">
            Usage attributes to catalogue assets by (type, slug), so the
            catalogue needs assets before telemetry has anything to land on.
            Sync the shared Fabric Library, or upload your own assets first.
          </p>
          <p className="text-xs text-subtle">
            {catalogueCount > 0
              ? `${catalogueCount} asset${catalogueCount === 1 ? "" : "s"} in the catalogue.`
              : "No assets in the catalogue yet."}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <FabricSyncButton />
            <ContributeUpload />
          </div>
          <p className="text-xs text-subtle">
            To contribute your own assets, generate them from your{" "}
            <code className="font-mono text-xs">~/.claude</code> with the
            collector, then use Upload contribution above. No repo needed.
            Unlike telemetry, this uploads each asset's full source, not just
            metadata.
          </p>
          <CopyCommand command={assetsCmd} label={`Writes ${ASSETS_OUTPUT}`} />
        </Step>

        <Step
          current={currentIndex === 1}
          index={2}
          last={false}
          state={steps.generate}
          title="Generate on your Mac"
        >
          <p className="text-sm text-muted">
            Download the collector from this app and run it (no repo needed). It
            records metadata only (counts, timings, models) by scanning{" "}
            <code className="font-mono text-xs">~/.claude/projects</code>; it
            never reads message or command content.
          </p>
          <CopyCommand
            command={telemetryCmd}
            label={`Writes ${TELEMETRY_UPLOAD_OUTPUT}`}
          />
        </Step>

        <Step
          current={currentIndex === 2}
          index={3}
          last
          state={steps.upload}
          title="Upload"
        >
          <p className="text-sm text-muted">
            Upload the generated{" "}
            <code className="font-mono text-xs">utilization.upload.json</code>.
            Rows reconcile onto catalogue assets; rows for assets not yet in the
            catalogue are reported as unmatched, not silently dropped.
          </p>
          <TelemetryUpload />
        </Step>
      </ol>
    </Panel>
  );
}
