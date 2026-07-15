import { useEffect, useRef, useState } from "react";

import { ACCENTS, applyAccent, readAccent } from "@/dashboard/theme";

/**
 * Header control that picks the accent palette. Light vs dark stays the
 * ThemeToggle; this is the orthogonal palette axis (a data-accent attribute on
 * <html>). The trigger reuses the ThemeToggle button shell so the header reads
 * as one cluster; the popover mirrors the command-palette hint surface. The
 * active swatch carries a check glyph, so selection is encoded by shape and an
 * accessible name, never color alone.
 */
export function AccentPicker() {
  const [open, setOpen] = useState(false);
  const [accent, setAccent] = useState(() => readAccent());
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const groupRef = useRef<HTMLDivElement>(null);

  const current = ACCENTS.find((a) => a.id === accent) ?? ACCENTS[0];

  function choose(id: string) {
    setAccent(id);
    applyAccent(id);
  }

  // Close on outside click or Escape; Escape returns focus to the trigger.
  useEffect(() => {
    if (!open) return;
    const onPointer = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Move focus into the popover when it opens, landing on the active swatch.
  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => {
      groupRef.current
        ?.querySelector<HTMLButtonElement>('[data-active="true"]')
        ?.focus();
    });
    return () => cancelAnimationFrame(id);
  }, [open]);

  function onGroupKeyDown(event: React.KeyboardEvent) {
    const keys = ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const index = ACCENTS.findIndex((a) => a.id === accent);
    let next = index;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % ACCENTS.length;
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + ACCENTS.length) % ACCENTS.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = ACCENTS.length - 1;
    choose(ACCENTS[next].id);
    groupRef.current
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      ?.[next]?.focus();
  }

  return (
    <div className="relative" ref={wrapRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`Accent color, currently ${current.label}`}
        className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-strong text-muted hover:bg-surface-inset hover:text-fg"
        onClick={() => setOpen((value) => !value)}
        ref={triggerRef}
        type="button"
      >
        <span
          aria-hidden="true"
          className="h-4 w-4 rounded-full ring-1 ring-black/10"
          style={{ backgroundColor: "var(--accent)" }}
        />
      </button>
      {open && (
        <div
          className="absolute right-0 top-full z-20 mt-2 w-56 rounded-md border border-border-strong bg-surface-raised p-3 text-left shadow-raised"
          data-rise
        >
          <div className="eyebrow mb-2">Accent</div>
          <div
            aria-label="Accent color"
            className="grid grid-cols-5 gap-1.5"
            onKeyDown={onGroupKeyDown}
            ref={groupRef}
            role="radiogroup"
          >
            {ACCENTS.map((option) => {
              const active = option.id === accent;
              return (
                <button
                  aria-checked={active}
                  aria-label={option.label}
                  className="relative flex h-9 w-9 items-center justify-center rounded-md ring-1 ring-black/10 transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-accent aria-checked:ring-2 aria-checked:ring-fg"
                  data-active={active}
                  key={option.id}
                  onClick={() => choose(option.id)}
                  role="radio"
                  style={{ backgroundColor: option.swatch }}
                  tabIndex={active ? 0 : -1}
                  title={option.label}
                  type="button"
                >
                  {active && (
                    <svg
                      aria-hidden="true"
                      fill="none"
                      height="14"
                      stroke="#ffffff"
                      strokeWidth="3"
                      viewBox="0 0 24 24"
                      width="14"
                    >
                      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-subtle">{current.label}</p>
        </div>
      )}
    </div>
  );
}
