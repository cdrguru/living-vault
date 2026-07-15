import { useState } from "react";

/**
 * A single shell command shown as monospace with a Copy button. Extracted from the
 * Connection section so the telemetry wizard and the collector list share one
 * affordance. The command stays selectable on screen if the clipboard is blocked.
 */
export function CopyCommand({
  command,
  label,
}: {
  command: string;
  label: string;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the command is still selectable on screen */
    }
  }

  return (
    <div className="rounded-md border border-border bg-surface-inset p-2.5">
      <div className="flex items-center justify-between gap-2">
        <code className="min-w-0 truncate font-mono text-xs text-fg">
          $ {command}
        </code>
        <button
          aria-label={`Copy: ${command}`}
          className="shrink-0 rounded border border-border-strong px-2 py-0.5 text-xs text-muted hover:bg-surface-raised hover:text-fg"
          onClick={() => void copy()}
          type="button"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1 text-xs text-subtle">{label}</p>
    </div>
  );
}
