import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const base =
  'inline-flex items-center justify-center gap-2 rounded-md font-medium transition-[background-color,transform,box-shadow] active:translate-y-px disabled:opacity-60 disabled:pointer-events-none';

const variants: Record<Variant, string> = {
  // accent-strong (#c2410c) keeps white text at AA; hover stays AA-safe (darker in
  // light, lighter in dark where the foreground is dark).
  primary: 'bg-accent-strong text-accent-fg shadow-card hover:bg-accent-strong-hover',
  secondary: 'border border-border-strong bg-surface-raised text-fg hover:bg-surface-inset',
  ghost: 'text-muted hover:bg-surface-inset hover:text-fg',
  danger: 'text-danger-fg hover:bg-danger-surface',
};

const sizes: Record<Size, string> = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  className = '',
  children,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}) {
  return (
    <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`.trim()} type={type} {...rest}>
      {children}
    </button>
  );
}
