import { Link } from "react-router-dom";

import { Button } from "@/dashboard/components/Button";
import { Panel } from "@/dashboard/components/Panel";
import { Pill } from "@/dashboard/components/Pill";
import { CONCEPTS, PAGE_GUIDE, QUADRANTS } from "@/dashboard/settings/glossary";
import { useTour } from "@/dashboard/tour";

/** The centralized canon: concept definitions, the quadrant model, and a one-line
 * guide to each page, plus the launcher for the guided tour. */
export function HelpSection() {
  const { start } = useTour();

  return (
    <section aria-labelledby="settings-help" className="space-y-4" id="help">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold tracking-tight text-fg" id="settings-help">
            Help &amp; glossary
          </h2>
          <p className="mt-1 text-sm text-muted">
            What the numbers mean, and where to find each one.
          </p>
        </div>
        <Button onClick={start} size="sm" variant="primary">
          Take the tour
        </Button>
      </div>

      <Panel title="The health quadrants">
        <ul className="space-y-2">
          {QUADRANTS.map((q) => (
            <li className="flex gap-3" key={q.name}>
              <span className="shrink-0">
                <Pill tone={q.tone}>{q.name}</Pill>
              </span>
              <span className="text-sm text-muted">{q.meaning}</span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Concepts">
        <dl className="space-y-3">
          {CONCEPTS.map((c) => (
            <div key={c.term}>
              <dt className="text-sm font-semibold text-fg">{c.term}</dt>
              <dd className="text-sm text-muted">{c.definition}</dd>
            </div>
          ))}
        </dl>
      </Panel>

      <Panel title="What each page answers">
        <ul className="space-y-2">
          {PAGE_GUIDE.map((page) => (
            <li className="flex flex-col gap-0.5 border-b border-border pb-2 last:border-b-0 sm:flex-row sm:items-baseline sm:gap-3" key={page.path}>
              <Link
                className="shrink-0 text-sm font-semibold text-accent hover:underline sm:w-32"
                to={page.path}
              >
                {page.label}
              </Link>
              <span className="text-sm text-muted">{page.answers}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
}
