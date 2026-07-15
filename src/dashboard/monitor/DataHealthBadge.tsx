import { useState } from "react";

import { runDataSourceContract } from "@/data/contract";
import type { VaultDataset } from "@/data/types";

/**
 * The data-health badge runs the same coherence and referential-integrity contract
 * the DataSource runs before every write. Clean reads green with a check glyph and
 * the word Clean; a non-clean read shows the violation count in danger tone and
 * expands on click to list the violation strings. State is carried by color plus a
 * shape glyph plus the count text, never color alone.
 */
export function DataHealthBadge({ dataset }: { dataset: VaultDataset }) {
  const [open, setOpen] = useState(false);
  const violations = runDataSourceContract(dataset);
  const clean = violations.length === 0;

  if (clean) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success-surface px-2.5 py-1 text-xs font-medium text-success-fg ring-1 ring-inset ring-success/30">
        <svg
          aria-hidden="true"
          fill="none"
          height="14"
          stroke="currentColor"
          strokeWidth="2.5"
          viewBox="0 0 24 24"
          width="14"
        >
          <path
            d="M5 13l4 4 10-11"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        Data health: clean
      </span>
    );
  }

  return (
    <div className="relative inline-flex">
      <button
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full bg-danger-surface px-2.5 py-1 text-xs font-medium text-danger-fg ring-1 ring-inset ring-danger/30 focus-visible:outline-2 focus-visible:outline-accent"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <svg
          aria-hidden="true"
          fill="none"
          height="14"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
          width="14"
        >
          <path d="M12 3 2 20h20z" strokeLinejoin="round" />
          <path d="M12 9v5" strokeLinecap="round" />
        </svg>
        Data health: {violations.length}{" "}
        {violations.length === 1 ? "violation" : "violations"}
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-80 rounded-md border border-border bg-surface-raised p-3 shadow-md">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
            Contract violations
          </h3>
          <ul className="mt-2 space-y-1 text-xs text-danger-fg">
            {violations.map((violation) => (
              <li key={violation}>{violation}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
