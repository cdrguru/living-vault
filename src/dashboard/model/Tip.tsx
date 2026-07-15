import type { ReactNode } from 'react';

/** CSS-only tooltip: shows on hover and on keyboard focus of the wrapped child. */
export function Tip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <span className="group/tip relative inline-flex">
      {children}
      <span
        className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-max max-w-[16rem] -translate-x-1/2 rounded-md border border-border bg-surface-raised px-2 py-1 text-xs font-normal normal-case tracking-normal text-muted shadow-md group-hover/tip:block group-focus-within/tip:block"
        role="tooltip"
      >
        {label}
      </span>
    </span>
  );
}
