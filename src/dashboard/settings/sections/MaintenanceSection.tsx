import { useState } from "react";

import { Button } from "@/dashboard/components/Button";
import { Panel } from "@/dashboard/components/Panel";
import { useVault } from "@/dashboard/VaultContext";
import { readEnvInput } from "@/dashboard/settings/environment";

const MODEL_LAYOUT_KEY = "vault.model.layout.v1";
const HINT_KEYS = [
  "living-vault:palette-hint",
  "living-vault:model-legend-seen",
  "living-vault:tour-complete",
];

function removeKeys(keys: string[]): void {
  for (const key of keys) {
    try {
      globalThis.localStorage?.removeItem(key);
    } catch {
      /* storage unavailable; nothing to remove */
    }
  }
}

/** One destructive action with an inline two-step confirm and a result line.
 * No modal: the confirm replaces the trigger in place, so it stays keyboard
 * reachable and cannot be dismissed by clicking away from a dialog. */
function ConfirmAction({
  label,
  description,
  cta,
  disabled,
  disabledNote,
  onConfirm,
}: {
  label: string;
  description: string;
  cta: string;
  disabled?: boolean;
  disabledNote?: string;
  onConfirm: () => Promise<string> | string;
}) {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      const message = await onConfirm();
      setResult(message);
    } catch (err) {
      setResult(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
      setPending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3 last:border-b-0">
      <div className="min-w-0">
        <div className="text-sm font-medium text-fg">{label}</div>
        <div className="text-xs text-subtle">{description}</div>
        {result && (
          <div className="mt-1 text-xs text-success" role="status">
            {result}
          </div>
        )}
      </div>
      <div className="flex items-center gap-2">
        {disabled ? (
          <span className="text-xs text-subtle">{disabledNote}</span>
        ) : pending ? (
          <>
            <Button onClick={() => setPending(false)} size="sm" variant="ghost">
              Cancel
            </Button>
            <Button disabled={busy} onClick={() => void run()} size="sm" variant="danger">
              {busy ? "Working..." : "Confirm"}
            </Button>
          </>
        ) : (
          <Button onClick={() => { setResult(null); setPending(true); }} size="sm" variant="secondary">
            {cta}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Confirm-gated state resets for the local session. */
export function MaintenanceSection() {
  const { resetToSeed } = useVault();
  const isLive = readEnvInput().rayfinData;

  return (
    <section aria-labelledby="settings-maintenance" className="space-y-4" id="maintenance">
      <div>
        <h2 className="font-display text-lg font-semibold tracking-tight text-fg" id="settings-maintenance">
          Maintenance
        </h2>
        <p className="mt-1 text-sm text-muted">
          Reset local state. These touch only this browser, not the seed in the repo.
        </p>
      </div>

      <Panel title="Reset">
        <ConfirmAction
          cta="Reset to seed"
          description="Discard your added and edited assets and return to the committed seed dataset."
          disabled={isLive}
          disabledNote="Unavailable on live Fabric"
          label="Reset my edits to seed"
          onConfirm={async () => {
            await resetToSeed();
            return "Reset to the seed dataset.";
          }}
        />
        <ConfirmAction
          cta="Reset layout"
          description="Forget your saved node positions on the /model canvas so it re-runs the default layout."
          label="Reset the model layout"
          onConfirm={() => {
            removeKeys([MODEL_LAYOUT_KEY]);
            return "Model layout cleared. It rebuilds next time you open Model.";
          }}
        />
        <ConfirmAction
          cta="Replay hints"
          description="Bring back the command-palette tip, the model legend hint, and the guided-tour offer."
          label="Replay onboarding hints"
          onConfirm={() => {
            removeKeys(HINT_KEYS);
            return "Hints will show again. Reload to see them.";
          }}
        />
      </Panel>
    </section>
  );
}
