import type { ReactNode } from 'react';

import { Button } from '@/dashboard/components/Button';
import { Heatmap, type HeatmapCell } from '@/dashboard/components/Heatmap';
import { Panel } from '@/dashboard/components/Panel';
import { Pill } from '@/dashboard/components/Pill';
import { SectionCard } from '@/dashboard/components/SectionCard';

/**
 * The state of one guided-setup step. The three states are conveyed with color
 * PLUS shape PLUS icon (WCAG 1.4.1): a green check ring reads done, an orange
 * dotted ring with an arrow reads next, and a slate dashed ring with a number
 * reads waiting. Color is never the only signal.
 */
export type StepState = 'done' | 'next' | 'todo';

/** One numbered step in the populate checklist. */
export interface GuideStep {
  /** 1-based position shown when the step is still waiting. */
  index: number;
  title: string;
  detail: string;
  state: StepState;
  /** Optional inline action, normally the Fabric sync Button on the active step. */
  action?: ReactNode;
}

/** A filled check: the step is done. */
const checkGlyph = (
  <path d="M4 8.5l2.6 2.6L12 5.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
);

/** A right arrow: this is the next step to take. */
const nextGlyph = (
  <path d="M5 8h6m0 0L8.5 5.5M11 8l-2.5 2.5" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
);

function StepMarker({ state, index }: { state: StepState; index: number }) {
  if (state === 'done') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-success-surface text-success-fg ring-1 ring-success/40">
        <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
          {checkGlyph}
        </svg>
      </span>
    );
  }
  if (state === 'next') {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-warning/60 bg-warning-surface text-warning-fg">
        <svg aria-hidden="true" height="16" viewBox="0 0 16 16" width="16">
          {nextGlyph}
        </svg>
      </span>
    );
  }
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border-strong bg-surface-inset font-mono text-sm font-semibold text-subtle">
      {index}
    </span>
  );
}

/** Plain-language label for each state, so assistive tech reads the status too. */
const STATE_LABEL: Record<StepState, string> = {
  done: 'Done',
  next: 'Do this next',
  todo: 'Waiting',
};

const STATE_PILL: Record<StepState, { tone: 'green' | 'amber' | 'slate'; severity: 'good' | 'warn' | 'neutral' }> = {
  done: { tone: 'green', severity: 'good' },
  next: { tone: 'amber', severity: 'warn' },
  todo: { tone: 'slate', severity: 'neutral' },
};

function ChecklistRow({ step }: { step: GuideStep }) {
  const pill = STATE_PILL[step.state];
  return (
    <li className="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-3 shadow-card">
      <StepMarker index={step.index} state={step.state} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-semibold text-fg">{step.title}</span>
          <Pill severity={pill.severity} tone={pill.tone}>
            {STATE_LABEL[step.state]}
          </Pill>
        </div>
        <p className="mt-1 text-sm text-subtle">{step.detail}</p>
        {step.action && <div className="mt-3">{step.action}</div>}
      </div>
    </li>
  );
}

/**
 * The numbered next-step checklist for an unconfigured Coverage page. Each row
 * carries a marker that doubles state as color, shape, and icon, plus a status
 * Pill, so the sequence reads at a glance without relying on hue alone.
 */
export function SetupChecklist({ steps }: { steps: GuideStep[] }) {
  return (
    <Panel action={<span className="eyebrow">{steps.length} steps</span>} title="Next steps to populate coverage">
      <ol className="space-y-3">
        {steps.map((step) => (
          <ChecklistRow key={step.title} step={step} />
        ))}
      </ol>
    </Panel>
  );
}

/** The pillars and capabilities used by the populate preview, in plain words. */
const PREVIEW_ROWS = ['Engineering', 'Operations', 'Research'];
const PREVIEW_COLS = ['Build', 'Review', 'Deploy', 'Triage'];

/** A small, deterministic sample grid so the preview reads as a real matrix. */
const PREVIEW_CELLS: HeatmapCell[] = [
  { row: 'Engineering', col: 'Build', count: 6, intensity: 0.82 },
  { row: 'Engineering', col: 'Review', count: 4, intensity: 0.61 },
  { row: 'Engineering', col: 'Deploy', count: 2, intensity: 0.34 },
  { row: 'Operations', col: 'Triage', count: 5, intensity: 0.7 },
  { row: 'Operations', col: 'Deploy', count: 3, intensity: 0.45 },
  { row: 'Research', col: 'Review', count: 2, intensity: 0.28 },
];

/**
 * Explains what pillar tags are and previews the heatmap the page will show once
 * coverage data is present. The preview grid is illustrative sample data, clearly
 * labelled as a preview, and hidden from assistive tech as decorative.
 */
export function PillarExplainer() {
  return (
    <Panel
      action={<span className="eyebrow">why it matters</span>}
      title="What pillar tags are"
    >
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 text-sm text-subtle">
          <p>
            A <span className="font-semibold text-fg">pillar</span> is a business area your agentic
            assets serve, such as Engineering, Operations, or Research. A{' '}
            <span className="font-semibold text-fg">capability</span> is the job an asset does inside
            that area, such as Build, Review, or Deploy.
          </p>
          <p>
            Tagging each skill, subagent, or bundle with a pillar and a capability lets the vault map
            coverage: every pillar by capability intersection becomes a cell, so you can see where you
            are strong, where you are thin, and where you have nothing at all.
          </p>
          <div className="flex flex-wrap gap-1.5 pt-1">
            <Pill severity="info" tone="blue">
              pillar: Engineering
            </Pill>
            <Pill severity="info" tone="blue">
              capability: Deploy
            </Pill>
          </div>
        </div>

        <SectionCard className="bg-surface-muted/40">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="eyebrow">preview after sync</span>
            <span className="text-xs text-subtle">sample data</span>
          </div>
          <div aria-hidden="true" className="opacity-90">
            <Heatmap
              cells={PREVIEW_CELLS}
              cols={PREVIEW_COLS}
              rowHeader="pillar"
              rows={PREVIEW_ROWS}
            />
          </div>
          <p className="mt-3 text-xs text-subtle">
            This is what the coverage matrix will look like. Tint maps average maturity, the number
            maps the asset count.
          </p>
        </SectionCard>
      </div>
    </Panel>
  );
}

/**
 * The full guided-setup view for an empty or sparse Coverage page: a pillar
 * explanation, a populate preview of the matrix, and a numbered next-step
 * checklist. Rendered in place of the live matrix until real coverage exists.
 */
export function CoverageGuide({
  onSyncFabric,
  syncing = false,
}: {
  onSyncFabric: () => void;
  syncing?: boolean;
}) {
  const steps: GuideStep[] = [
    {
      index: 1,
      title: 'Sync from the Fabric Library',
      detail:
        'Pull the catalog projection so the vault knows your skills, subagents, MCP servers, and bundles. This also brings over the pillar and capability tags.',
      state: 'next',
      action: (
        <Button disabled={syncing} onClick={onSyncFabric} variant="primary">
          {syncing ? 'Syncing...' : 'Sync from Fabric Library'}
        </Button>
      ),
    },
    {
      index: 2,
      title: 'Sync telemetry',
      detail:
        'Run the telemetry collector so each asset gets real usage, cost, and maturity. Maturity drives the heatmap tint once assets are tagged.',
      state: 'todo',
    },
    {
      index: 3,
      title: 'Tag assets by pillar',
      detail:
        'Give each asset a pillar and a capability tag. Every tagged pair lights up one cell of the coverage matrix.',
      state: 'todo',
    },
  ];

  return (
    <div className="space-y-4">
      <PillarExplainer />
      <SetupChecklist steps={steps} />
    </div>
  );
}
