import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { useTour } from "@/dashboard/tour";
import { ConnectionSection } from "./sections/ConnectionSection";
import { PreferencesSection } from "./sections/PreferencesSection";
import { HelpSection } from "./sections/HelpSection";
import { MaintenanceSection } from "./sections/MaintenanceSection";

const SECTIONS = [
  { id: "connection", label: "Connection & data" },
  { id: "preferences", label: "Preferences" },
  { id: "help", label: "Help & glossary" },
  { id: "maintenance", label: "Maintenance" },
];

/** The unified Settings home: a sticky "on this page" rail beside four stacked,
 * deep-linkable sections. The command palette and empty-state CTAs can land on a
 * section by hash (for example /settings#help). */
export function SettingsPage() {
  const { hash } = useLocation();
  const { start } = useTour();

  useEffect(() => {
    if (!hash) return;
    const el = document.getElementById(hash.slice(1));
    el?.scrollIntoView({ block: "start" });
  }, [hash]);

  return (
    <div className="grid gap-6 lg:grid-cols-[14rem_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="lg:sticky lg:top-24 lg:self-start">
        <div className="eyebrow mb-2">On this page</div>
        <ul className="space-y-1">
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <a
                className="block rounded-md px-3 py-1.5 text-sm text-muted hover:bg-surface-inset hover:text-fg"
                href={`#${s.id}`}
              >
                {s.label}
              </a>
            </li>
          ))}
        </ul>
        <button
          className="mt-3 w-full rounded-md border border-border-strong px-3 py-2 text-sm text-fg hover:bg-surface-inset"
          onClick={start}
          type="button"
        >
          Take the tour
        </button>
      </nav>

      <div className="min-w-0 space-y-10">
        <ConnectionSection />
        <PreferencesSection />
        <HelpSection />
        <MaintenanceSection />
      </div>
    </div>
  );
}
