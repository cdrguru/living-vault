import type { ReactNode } from 'react';

type Tone = 'default' | 'warning';

const tones: Record<Tone, string> = {
  default: 'border-border bg-surface',
  warning: 'border-warning/40 bg-warning-surface',
};

/** Tokenized card used for grid cells (coverage, bundles, clusters) so pages
 * stop hand-rolling border/background divs. */
export function SectionCard({
  tone = 'default',
  className = '',
  children,
}: {
  tone?: Tone;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={`rounded-lg border p-3 shadow-card ${tones[tone]} ${className}`.trim()}>{children}</div>
  );
}
