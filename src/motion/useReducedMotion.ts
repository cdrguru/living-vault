import { useEffect, useState } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

/**
 * Reactive read of the user's reduced-motion preference. Returns true when the
 * user has asked the system to minimize non-essential motion, and updates if
 * the preference changes while the app is open.
 *
 * Defaults to false when matchMedia is unavailable (older environments and some
 * test runners) so content still renders. Components that gate motion on this
 * value must keep their content visible and static in the reduced branch.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => prefersReduced());

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }
    const media = window.matchMedia(QUERY);
    const onChange = () => setReduced(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

/** One-shot read of the preference. Safe to call outside React render. */
export function prefersReduced(): boolean {
  if (
    typeof window === "undefined" ||
    typeof window.matchMedia !== "function"
  ) {
    return false;
  }
  return window.matchMedia(QUERY).matches;
}
