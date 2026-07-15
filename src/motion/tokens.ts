/**
 * Motion tokens: the animation analogue of the @theme design tokens in main.css.
 *
 * Every tween reads named values from here instead of inline magic numbers, so
 * retuning the whole app's feel is a one-file change. GSAP reads JS values, so
 * this layer is TypeScript, not CSS.
 */

// Durations in seconds.
export const DUR = {
  xs: 0.2,
  sm: 0.4,
  md: 0.6,
  lg: 0.9,
  xl: 1.2,
} as const;

// Named eases. Strings GSAP understands, plus the registered brand curve.
export const EASE = {
  out: "power3.out", // default entrance
  inOut: "power2.inOut", // layout and Flip transitions
  soft: "power1.out", // count-ups and subtle moves
  brand: "brandEase", // signature curve, registered in registerGsap.ts
} as const;

// Stagger steps in seconds.
export const STAGGER = {
  tight: 0.05,
  base: 0.08,
  loose: 0.12,
} as const;

// Travel distances in px for reveals.
export const DIST = {
  sm: 12,
  md: 24,
  lg: 48,
} as const;

export type Dur = keyof typeof DUR;
export type Ease = keyof typeof EASE;
