import { useEffect, useState } from 'react';

export interface ChartTheme {
  grid: string;
  axis: string;
  accent: string;
  series1: string;
  danger: string;
  warning: string;
  neutral: string;
}

const FALLBACK: ChartTheme = {
  grid: '#e2e8f0',
  axis: '#475569',
  accent: '#f97316',
  series1: '#0f766e',
  danger: '#e11d48',
  warning: '#d97706',
  neutral: '#64748b',
};

function readChartTheme(): ChartTheme {
  if (typeof document === 'undefined') return FALLBACK;
  const styles = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => styles.getPropertyValue(name).trim() || fallback;
  return {
    grid: read('--chart-grid', FALLBACK.grid),
    axis: read('--chart-axis', FALLBACK.axis),
    accent: read('--chart-accent', FALLBACK.accent),
    series1: read('--chart-series-1', FALLBACK.series1),
    danger: read('--danger', FALLBACK.danger),
    warning: read('--warning', FALLBACK.warning),
    neutral: read('--subtle', FALLBACK.neutral),
  };
}

/**
 * recharts cannot read Tailwind classes, so chart colors are pulled from the
 * CSS token layer at render and re-read whenever the .dark class (light/dark)
 * or the data-accent attribute (accent palette) on <html> changes, keeping
 * charts in sync with the theme.
 */
export function useChartTheme(): ChartTheme {
  const [theme, setTheme] = useState<ChartTheme>(readChartTheme);
  useEffect(() => {
    setTheme(readChartTheme());
    const observer = new MutationObserver(() => setTheme(readChartTheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-accent'],
    });
    return () => observer.disconnect();
  }, []);
  return theme;
}
