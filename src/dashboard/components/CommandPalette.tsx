import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import { useVault } from "@/dashboard/VaultContext";
import { NAV } from "@/dashboard/nav";

interface Command {
  id: string;
  label: string;
  hint: string;
  group: "Pages" | "Assets" | "Actions";
  run: () => void;
}

function toggleTheme() {
  const dark = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("living-vault:theme", dark ? "dark" : "light");
  } catch {
    /* storage unavailable */
  }
}

/**
 * Command-K launcher: jump to any page or asset, or flip the theme, from one
 * keyboard-first surface. Built bespoke (no combobox dependency) but wired for
 * keyboard nav and screen readers: a labelled dialog, arrow-key roving, and an
 * aria-activedescendant pointer onto the highlighted option.
 */
export function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { dataset } = useVault();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const commands = useMemo<Command[]>(() => {
    const go = (path: string) => () => {
      navigate(path);
      onClose();
    };
    const pages: Command[] = NAV.map((item) => ({
      id: `page:${item.path}`,
      label: item.label,
      hint: "Page",
      group: "Pages",
      run: go(item.path),
    }));
    const assets: Command[] = (dataset?.assets ?? []).map((asset) => ({
      id: `asset:${asset.id}`,
      label: asset.name,
      hint: asset.type,
      group: "Assets",
      run: go(`/asset/${asset.id}`),
    }));
    const actions: Command[] = [
      {
        id: "action:theme",
        label: "Toggle light / dark theme",
        hint: "Action",
        group: "Actions",
        run: () => {
          toggleTheme();
          onClose();
        },
      },
      {
        id: "action:shortcuts",
        label: "Keyboard shortcuts",
        hint: "Action",
        group: "Actions",
        run: () => setShowShortcuts(true),
      },
    ];
    return [...pages, ...assets, ...actions];
  }, [dataset, navigate, onClose]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matches = q
      ? commands.filter((command) =>
          `${command.label} ${command.hint}`.toLowerCase().includes(q),
        )
      : commands
          .filter((command) => command.group !== "Assets")
          .concat(
            commands
              .filter((command) => command.group === "Assets")
              .slice(0, 6),
          );
    return matches.slice(0, 40);
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    setShowShortcuts(false);
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [query]);

  useEffect(() => {
    listRef.current
      ?.querySelector('[data-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [active, results]);

  if (!open) return null;

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      // Escape steps back from the shortcuts sheet first, then closes.
      if (showShortcuts) setShowShortcuts(false);
      else onClose();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      results[active]?.run();
    }
  };

  let lastGroup: Command["group"] | null = null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-[12vh]">
      <button
        aria-label="Close command palette"
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        type="button"
      />
      <div
        aria-label="Command palette"
        aria-modal="true"
        className="relative w-full max-w-xl overflow-hidden rounded-xl border border-border bg-surface-raised shadow-raised"
        onKeyDown={onKeyDown}
        role="dialog"
      >
        <div className="flex items-center gap-2 border-b border-border px-4">
          <svg
            aria-hidden="true"
            className="text-subtle"
            fill="none"
            height="18"
            stroke="currentColor"
            strokeWidth="2"
            viewBox="0 0 24 24"
            width="18"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            aria-activedescendant={results[active]?.id}
            aria-controls="command-list"
            aria-label="Search pages, assets, and actions"
            className="w-full bg-transparent py-3.5 text-sm text-fg outline-none placeholder:text-subtle"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Jump to a page or asset..."
            ref={inputRef}
            type="text"
            value={query}
          />
          <kbd className="hidden rounded border border-border-strong px-1.5 py-0.5 font-mono text-[0.625rem] text-subtle sm:inline">
            esc
          </kbd>
        </div>
        {showShortcuts ? (
          <div className="max-h-[50vh] overflow-y-auto p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="eyebrow">Keyboard shortcuts</div>
              <button
                className="rounded-md px-2 py-1 text-xs text-subtle hover:bg-surface-inset hover:text-fg"
                onClick={() => setShowShortcuts(false)}
                type="button"
              >
                Back
              </button>
            </div>
            <dl className="mt-3 space-y-3 text-sm">
              <div>
                <dt className="font-semibold text-fg">Command palette</dt>
                <dd className="mt-1 text-subtle">
                  <ShortcutRow keys={["Arrows"]} label="Move between results" />
                  <ShortcutRow keys={["Enter"]} label="Run the selection" />
                  <ShortcutRow keys={["Esc"]} label="Close the palette" />
                </dd>
              </div>
              <div>
                <dt className="font-semibold text-fg">Model canvas</dt>
                <dd className="mt-1 text-subtle">
                  <ShortcutRow keys={["Enter"]} label="Open the inspector" />
                  <ShortcutRow keys={["Esc"]} label="Close the inspector" />
                  <ShortcutRow keys={["+", "-"]} label="Zoom in and out" />
                  <ShortcutRow keys={["0"]} label="Reset zoom to fit" />
                  <ShortcutRow keys={["Arrows"]} label="Pan the canvas" />
                </dd>
              </div>
            </dl>
          </div>
        ) : (
          <ul
            className="max-h-[50vh] overflow-y-auto p-2"
            id="command-list"
            ref={listRef}
            role="listbox"
          >
            {results.length === 0 && (
              <li className="px-3 py-6 text-center text-sm text-subtle">
                No matches for “{query}”.
              </li>
            )}
            {results.map((command, index) => {
              const header = command.group !== lastGroup ? command.group : null;
              lastGroup = command.group;
              return (
                <li key={command.id}>
                  {header && (
                    <div className="eyebrow px-2 pb-1 pt-3">{header}</div>
                  )}
                  <button
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-3 py-2 text-left text-sm ${
                      index === active
                        ? "bg-accent text-accent-fg"
                        : "text-fg hover:bg-surface-inset"
                    }`}
                    data-active={index === active}
                    id={command.id}
                    onClick={() => command.run()}
                    onMouseMove={() => setActive(index)}
                    role="option"
                    aria-selected={index === active}
                    type="button"
                  >
                    <span className="truncate">{command.label}</span>
                    <span
                      className={`shrink-0 font-mono text-[0.625rem] uppercase tracking-wider ${index === active ? "text-accent-fg/80" : "text-subtle"}`}
                    >
                      {command.hint}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border px-4 py-2 text-[0.6875rem] text-subtle">
          <LegendKey keys={["Arrows"]} label="move" />
          <LegendKey keys={["Enter"]} label="run" />
          <LegendKey keys={["Esc"]} label="close" />
        </div>
      </div>
    </div>
  );
}

/** A single labelled-keys row inside the Keyboard shortcuts sheet. */
function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-0.5">
      <span>{label}</span>
      <span className="flex shrink-0 items-center gap-1">
        {keys.map((key) => (
          <kbd
            className="rounded border border-border-strong px-1.5 py-0.5 font-mono text-[0.625rem] text-fg"
            key={key}
          >
            {key}
          </kbd>
        ))}
      </span>
    </div>
  );
}

/** A compact key plus label pair for the always-on palette footer legend. */
function LegendKey({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key) => (
        <kbd
          className="rounded border border-border-strong px-1 py-0.5 font-mono text-[0.625rem] text-subtle"
          key={key}
        >
          {key}
        </kbd>
      ))}
      <span>{label}</span>
    </span>
  );
}
