import { useState } from "react";

/**
 * A multi-line code snippet shown as monospace with a Copy button. The non-shell
 * companion to CopyCommand (no "$ " prefix), for config blocks and example calls
 * that span several lines. The snippet stays selectable if the clipboard is blocked.
 */
export function CopyBlock({ code, label }: { code: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard?.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the snippet is still selectable on screen */
    }
  }

  return (
    <div className="rounded-md border border-border bg-surface-inset p-2.5">
      <div className="flex items-start justify-between gap-2">
        <pre className="min-w-0 flex-1 overflow-x-auto font-mono text-xs leading-relaxed text-fg">
          <code>{code}</code>
        </pre>
        <button
          aria-label={`Copy: ${label}`}
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
