import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type { ColumnOption } from './columnFilters';

/** Funnel glyph: fills (currentColor) when a filter is applied, outline otherwise. */
function FunnelGlyph({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      fill={active ? 'currentColor' : 'none'}
      height="13"
      stroke="currentColor"
      strokeWidth="1.5"
      viewBox="0 0 16 16"
      width="13"
    >
      <path
        d="M2 3h12l-4.5 5.2V13L6.5 11.4V8.2L2 3Z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type ColumnFilterProps = {
  /** Column label, used for the trigger's accessible name. */
  label: string;
  /** Whether a filter is currently applied to this column. */
  active: boolean;
  /** Clear this column's filter. */
  onClear: () => void;
} & (
  | {
      mode: 'select';
      options: ColumnOption[];
      selected: string[];
      onToggle: (value: string) => void;
      query?: never;
      onQuery?: never;
    }
  | {
      mode: 'text';
      query: string;
      onQuery: (next: string) => void;
      options?: never;
      selected?: never;
      onToggle?: never;
    }
);

/**
 * Per-column header filter: a small funnel button that opens an anchored popover.
 * `select` columns get a checklist of distinct values (with cross-filtered counts);
 * `text` columns get a contains-search. The popover renders through a portal with
 * fixed positioning so it is never clipped by the table's horizontal-scroll
 * container, and it closes on Escape, on outside click, and on scroll/resize.
 */
export function ColumnFilter(props: ColumnFilterProps) {
  const { label, active, onClear } = props;
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const WIDTH = 232;
  // Fallback height for the first position pass, before the popover is measured.
  const estimatedHeight =
    props.mode === 'text' ? 96 : Math.min(320, 88 + props.options.length * 30);

  // Anchor the popover under the trigger, right-aligned and clamped to the
  // viewport. When there is not enough room below (a funnel near the bottom edge),
  // flip it above the trigger; if it fits neither way, clamp it on-screen.
  const reposition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right - WIDTH, window.innerWidth - WIDTH - 8));
    const height = popoverRef.current?.offsetHeight ?? estimatedHeight;
    const margin = 8;
    let top = rect.bottom + 4;
    if (top + height > window.innerHeight - margin) {
      const above = rect.top - height - 4;
      top = above >= margin ? above : Math.max(margin, window.innerHeight - height - margin);
    }
    setPos({ top, left });
  }, [estimatedHeight]);

  useLayoutEffect(() => {
    if (!open) return;
    // The popover is mounted (hidden) on the open render, so this first pass can
    // measure its real height and flip/clamp accordingly.
    reposition();
    // Reposition while open so the popover tracks the column as the table scrolls.
    const onScrollResize = () => reposition();
    window.addEventListener('scroll', onScrollResize, true);
    window.addEventListener('resize', onScrollResize);
    return () => {
      window.removeEventListener('scroll', onScrollResize, true);
      window.removeEventListener('resize', onScrollResize);
      setPos(null);
    };
  }, [open, reposition]);

  // Dismiss on Escape and on a click outside both the trigger and the popover.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onPointer, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onPointer, true);
    };
  }, [open]);

  // Move focus into the popover once, the first time it is positioned. Guarded so
  // the scroll/resize repositions (which also change `pos`) do not re-steal focus.
  const didFocusRef = useRef(false);
  useEffect(() => {
    if (!open) {
      didFocusRef.current = false;
      return;
    }
    if (!pos || didFocusRef.current) return;
    didFocusRef.current = true;
    const node = popoverRef.current?.querySelector<HTMLElement>(
      'input, button, [tabindex]',
    );
    node?.focus();
  }, [open, pos]);

  const badge =
    props.mode === 'select' && props.selected.length > 0 ? props.selected.length : null;

  return (
    <span className="relative inline-flex">
      <button
        aria-controls={open ? dialogId : undefined}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={`Filter by ${label}${active ? ', active' : ''}`}
        className={`inline-flex h-5 items-center gap-0.5 rounded px-1 transition-colors
          focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent
          ${active ? 'text-accent-strong' : 'text-subtle hover:text-fg'}`}
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <FunnelGlyph active={active} />
        {badge !== null && (
          <span className="rounded-full bg-accent-strong px-1 text-[0.625rem] font-semibold leading-tight text-accent-fg tabular-nums">
            {badge}
          </span>
        )}
      </button>

      {open &&
        createPortal(
          <div
            aria-label={`Filter ${label}`}
            className="z-50 w-[232px] rounded-lg border border-border bg-surface-raised p-2 text-left shadow-lg"
            id={dialogId}
            ref={popoverRef}
            role="dialog"
            style={{
              position: 'fixed',
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? 'visible' : 'hidden',
            }}
          >
            <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
              <span className="text-xs font-semibold normal-case text-fg">{label}</span>
              {active && (
                <button
                  className="rounded px-1 text-xs font-medium text-muted hover:text-fg focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent"
                  onClick={onClear}
                  type="button"
                >
                  Clear
                </button>
              )}
            </div>

            {props.mode === 'text' ? (
              <input
                aria-label={`Filter by ${label}`}
                className="field"
                onChange={(event) => props.onQuery(event.target.value)}
                placeholder={`Contains${'…'}`}
                type="search"
                value={props.query}
              />
            ) : props.options.length === 0 ? (
              <p className="px-1 py-2 text-xs text-subtle">No values to filter.</p>
            ) : (
              <ul className="max-h-64 space-y-0.5 overflow-y-auto">
                {props.options.map((option) => (
                  <li key={option.value}>
                    <label
                      className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-fg hover:bg-surface-inset"
                    >
                      <input
                        aria-label={option.label}
                        checked={props.selected.includes(option.value)}
                        className="h-3.5 w-3.5 shrink-0 accent-[var(--color-accent-strong,#c2410c)]"
                        onChange={() => props.onToggle(option.value)}
                        type="checkbox"
                      />
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      <span
                        aria-hidden="true"
                        className="shrink-0 font-mono text-xs tabular-nums text-subtle"
                      >
                        {option.count}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>,
          document.body,
        )}
    </span>
  );
}
