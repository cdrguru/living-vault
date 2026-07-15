// src/dashboard/components/Panel.tsx
import type { ReactNode } from 'react';

import { InfoTooltip } from './InfoTooltip';
import { TOOLTIPS, type TooltipKey } from '@/dashboard/tooltips';

export function Panel({
  children,
  title,
  action,
  info,
  dense = false,
}: {
  children: ReactNode;
  title?: string;
  action?: ReactNode;
  info?: TooltipKey;
  dense?: boolean;
}) {
  return (
    <section className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-card">
      {(title || action || info) && (
        <header className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div className="flex min-w-0 items-center gap-1.5">
            {title && (
              <h2 className="font-display text-sm font-semibold tracking-tight text-fg">{title}</h2>
            )}
            {info && <InfoTooltip label={TOOLTIPS[info]} triggerLabel={`About ${title ?? 'this panel'}`} />}
          </div>
          {action}
        </header>
      )}
      <div className={dense ? 'min-w-0 p-3' : 'min-w-0 p-4'}>{children}</div>
    </section>
  );
}
