import { useEffect, useState } from 'react';

import { THEME_EVENT, type ThemePref } from '@/dashboard/settings/preferences';

const STORAGE_KEY = 'living-vault:theme';

const sunIcon = (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
  </svg>
);

const moonIcon = (
  <svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
  </svg>
);

/** Header control that flips the .dark class on <html> and persists the choice.
 * Initial state is seeded before paint by the inline script in index.html. */
export function ThemeToggle() {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light');
    } catch {
      /* storage unavailable, in-memory toggle still works */
    }
  }, [dark]);

  // Resync when the Settings preference control changes the theme elsewhere, so
  // this button's icon never disagrees with the document.
  useEffect(() => {
    const onThemeChange = (event: Event) => {
      const next = (event as CustomEvent<ThemePref>).detail;
      if (next === 'dark' || next === 'light') setDark(next === 'dark');
    };
    window.addEventListener(THEME_EVENT, onThemeChange);
    return () => window.removeEventListener(THEME_EVENT, onThemeChange);
  }, []);

  return (
    <button
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      aria-pressed={dark}
      className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-border-strong text-muted hover:bg-surface-inset hover:text-fg"
      onClick={() => setDark((value) => !value)}
      type="button"
    >
      {dark ? sunIcon : moonIcon}
    </button>
  );
}
