interface SparklineProps {
  series: number[];
  label: string;
  width?: number;
  height?: number;
  /** Tailwind text-color class that drives the stroke through currentColor. */
  className?: string;
  /** Render a faint area under the line for extra weight on larger sparklines. */
  fill?: boolean;
}

/**
 * A minimal inline SVG sparkline. No charting dependency: it mirrors the inline
 * SVG approach already used by the canvas edge layer and minimap. Stroke color is
 * token driven through currentColor, so a caller sets the tone with `className`
 * (defaults to the brand accent). An empty series renders a dashed baseline so
 * "no telemetry" reads distinct from a flat measured zero.
 */
export function Sparkline({
  series,
  label,
  width = 64,
  height = 18,
  className = 'text-accent',
  fill = false,
}: SparklineProps) {
  if (series.length === 0) {
    return (
      <svg aria-label={label} className="text-subtle" height={height} role="img" width={width}>
        <line
          stroke="currentColor"
          strokeDasharray="2 2"
          strokeWidth="1"
          x1="0"
          x2={width}
          y1={height / 2}
          y2={height / 2}
        />
      </svg>
    );
  }

  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const count = series.length;
  const coords = series.map((value, index) => {
    const x = count > 1 ? (index / (count - 1)) * width : width / 2;
    const y = height - ((value - min) / span) * height;
    return { x, y };
  });
  const points = coords.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const areaPath =
    `M0,${height} L${coords.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' L')}` +
    ` L${width},${height} Z`;

  return (
    <svg
      aria-label={label}
      className={className}
      height={height}
      preserveAspectRatio="none"
      role="img"
      width={width}
    >
      {fill && <path d={areaPath} fill="currentColor" fillOpacity={0.12} stroke="none" />}
      <polyline
        fill="none"
        points={points}
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}
