import { useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from 'recharts';

import { useChartTheme } from '@/dashboard/useChartTheme';

const tooltipStyle = {
  background: 'var(--surface-raised)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  color: 'var(--fg)',
};

export function ChartFrame({
  children,
  className = '',
  ...rest
}: Omit<HTMLAttributes<HTMLDivElement>, 'children'> & {
  children: (size: { width: number; height: number }) => ReactNode;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const updateSize = () => {
      const rect = frameRef.current?.getBoundingClientRect();
      if (!rect || rect.width <= 0 || rect.height <= 0) return;
      setSize({
        width: Math.floor(rect.width),
        height: Math.floor(rect.height),
      });
    };

    updateSize();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver(updateSize);
      if (frameRef.current) observer.observe(frameRef.current);
      return () => observer.disconnect();
    }

    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  return (
    <div
      className={`relative h-64 min-h-0 min-w-0 overflow-hidden ${className}`.trim()}
      ref={frameRef}
      {...rest}
    >
      {size.width > 0 && size.height > 0 ? children(size) : null}
    </div>
  );
}

export function SimpleBarChart({
  data,
  xKey,
  yKey,
  onBarClick,
  barLabel,
}: {
  data: Record<string, string | number>[];
  xKey: string;
  yKey: string;
  /**
   * Optional drill-in handler. When provided each bar becomes clickable and a
   * matching keyboard-reachable button is rendered for every category, so the
   * chart can be activated without a pointer. Omit it for a static chart; the
   * default behavior is unchanged.
   */
  onBarClick?: (xValue: string, row: Record<string, string | number>) => void;
  /**
   * Builds the accessible label for one drill-in button. Defaults to
   * "Drill into <category>". Only used when onBarClick is set.
   */
  barLabel?: (xValue: string, row: Record<string, string | number>) => string;
}) {
  const theme = useChartTheme();
  const clickable = Boolean(onBarClick);
  const labelFor = (xValue: string, row: Record<string, string | number>) =>
    barLabel ? barLabel(xValue, row) : `Drill into ${xValue}`;
  return (
    <div className="min-w-0">
      <ChartFrame aria-hidden="true">
        {({ width, height }) => (
          <BarChart
            data={data}
            height={height}
            margin={{ top: 12, right: 12, bottom: 0, left: 0 }}
            width={width}
          >
            <CartesianGrid stroke={theme.grid} />
            <XAxis dataKey={xKey} tick={{ fontSize: 12, fill: theme.axis }} stroke={theme.grid} />
            <YAxis tick={{ fontSize: 12, fill: theme.axis }} stroke={theme.grid} />
            <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'var(--surface-inset)' }} />
            <Bar
              className={clickable ? 'cursor-pointer' : undefined}
              dataKey={yKey}
              fill={theme.accent}
              onClick={
                onBarClick
                  ? (entry: { payload?: Record<string, string | number> }) => {
                      const row = entry?.payload;
                      if (row) onBarClick(String(row[xKey]), row);
                    }
                  : undefined
              }
              radius={[4, 4, 0, 0]}
            >
              {clickable
                ? data.map((_row, index) => (
                    <Cell key={index} cursor="pointer" fill={theme.accent} />
                  ))
                : null}
            </Bar>
          </BarChart>
        )}
      </ChartFrame>
      {clickable ? (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {data.map((row, index) => {
            const xValue = String(row[xKey]);
            return (
              <li key={index}>
                <button
                  className="inline-flex items-center gap-1 rounded-full border border-border
                    bg-surface-inset px-2.5 py-1 text-xs font-medium text-fg transition-colors
                    hover:border-accent hover:bg-surface-muted
                    focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  onClick={() => onBarClick?.(xValue, row)}
                  type="button"
                >
                  <span aria-hidden="true" className="text-accent">&rsaquo;</span>
                  <span className="sr-only">{labelFor(xValue, row)}: </span>
                  <span>{xValue}</span>
                  <span className="font-mono tabular-nums text-muted">
                    {String(row[yKey])}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : (
        <ul className="sr-only">
          {data.map((row, index) => (
            <li key={index}>
              {String(row[xKey])}: {String(row[yKey])}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
