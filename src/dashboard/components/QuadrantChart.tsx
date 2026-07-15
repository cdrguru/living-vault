import {
  CartesianGrid,
  LabelList,
  ReferenceArea,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { Link, useNavigate } from "react-router-dom";

import {
  classifyAsset,
  scoreAssets,
  type DateWindow,
  type Quadrant,
  type VaultDataset,
} from "@/data";
import { ChartFrame } from "@/dashboard/components/Charts";
import { formatPercent } from "@/dashboard/format";
import { useChartTheme } from "@/dashboard/useChartTheme";

type ShapeName = "star" | "triangle" | "square" | "circle";
type ColorKey = "accent" | "danger" | "warning" | "neutral";

const QUADRANTS: Quadrant[] = ["Stars", "Risks", "Shelfware", "Dead weight"];

const QUADRANT_STYLE: Record<
  Quadrant,
  { shape: ShapeName; glyph: string; colorKey: ColorKey }
> = {
  Stars: { shape: "star", glyph: "★", colorKey: "accent" },
  Risks: { shape: "triangle", glyph: "▲", colorKey: "danger" },
  Shelfware: { shape: "square", glyph: "■", colorKey: "warning" },
  "Dead weight": { shape: "circle", glyph: "●", colorKey: "neutral" },
};

// The governed (x=80) and effective (y=60) thresholds split the plane into the
// four named regions. Each region is tinted and labeled with its asset count, so
// the distribution reads at a glance and the legend below is reinforcement.
type LabelCorner =
  | "insideTopRight"
  | "insideTopLeft"
  | "insideBottomRight"
  | "insideBottomLeft";

const REGIONS: {
  quadrant: Quadrant;
  x1: number;
  x2: number;
  y1: number;
  y2: number;
  corner: LabelCorner;
}[] = [
  {
    quadrant: "Stars",
    x1: 80,
    x2: 100,
    y1: 60,
    y2: 100,
    corner: "insideTopRight",
  },
  {
    quadrant: "Risks",
    x1: 0,
    x2: 80,
    y1: 60,
    y2: 100,
    corner: "insideTopLeft",
  },
  {
    quadrant: "Shelfware",
    x1: 80,
    x2: 100,
    y1: 0,
    y2: 60,
    corner: "insideBottomRight",
  },
  {
    quadrant: "Dead weight",
    x1: 0,
    x2: 80,
    y1: 0,
    y2: 60,
    corner: "insideBottomLeft",
  },
];

/**
 * One plotted bubble: every asset sharing a (governed, effective) cell is
 * collapsed into a single bubble sized and labeled by its count. Without this a
 * stack of dozens of assets at the same score (for example 98 Shelfware assets
 * all at 100% governed, 0% effective) overplots into one invisible mark.
 */
interface Bubble {
  x: number;
  y: number;
  count: number;
  quadrant: Quadrant;
  names: string[];
}

export function QuadrantChart({
  dataset,
  window,
}: {
  dataset: VaultDataset;
  window?: DateWindow;
}) {
  const theme = useChartTheme();
  const navigate = useNavigate();
  const scored = scoreAssets(dataset, window);
  const sufficient = scored.filter((score) => score.evidenceSufficient);
  const insufficientCount = scored.length - sufficient.length;

  const counts = QUADRANTS.reduce(
    (acc, quadrant) => {
      acc[quadrant] = sufficient.filter(
        (score) => score.quadrant === quadrant,
      ).length;
      return acc;
    },
    { Stars: 0, Risks: 0, Shelfware: 0, "Dead weight": 0 } as Record<
      Quadrant,
      number
    >,
  );

  const bubblesFor = (quadrant: Quadrant): Bubble[] => {
    const byCell = new Map<string, Bubble>();
    for (const score of sufficient) {
      if (score.quadrant !== quadrant) continue;
      // Use classifyAsset so the bubble lands in the same half-plane its quadrant
      // colour implies; plotting raw scores let a governed Shelfware bubble drift
      // left of the governed line (audit item 4).
      const { plotX: x, plotY: y } = classifyAsset(score);
      const key = `${x}:${y}`;
      const cell = byCell.get(key) ?? { x, y, count: 0, quadrant, names: [] };
      cell.count += 1;
      if (cell.names.length < 6) cell.names.push(score.asset.name);
      byCell.set(key, cell);
    }
    return [...byCell.values()];
  };

  return (
    <div className="min-w-0 [&_.recharts-symbols]:cursor-pointer">
      <ChartFrame aria-hidden="true" className="h-[340px]">
        {({ width, height }) => (
          <ScatterChart
            height={height}
            margin={{ top: 18, right: 24, bottom: 20, left: 4 }}
            width={width}
          >
            <CartesianGrid stroke={theme.grid} />
            {REGIONS.map((region) => {
              const color = theme[QUADRANT_STYLE[region.quadrant].colorKey];
              return (
                <ReferenceArea
                  fill={color}
                  fillOpacity={0.07}
                  key={region.quadrant}
                  label={{
                    value: `${region.quadrant} (${counts[region.quadrant]})`,
                    position: region.corner,
                    fill: color,
                    fontSize: 11,
                    fontWeight: 600,
                    opacity: 0.9,
                  }}
                  stroke="none"
                  x1={region.x1}
                  x2={region.x2}
                  y1={region.y1}
                  y2={region.y2}
                />
              );
            })}
            <XAxis
              dataKey="x"
              domain={[0, 100]}
              name="Governed"
              stroke={theme.grid}
              tick={{ fontSize: 12, fill: theme.axis }}
              tickFormatter={(value) => `${value}%`}
              type="number"
            />
            <YAxis
              dataKey="y"
              domain={[0, 100]}
              name="Effective"
              stroke={theme.grid}
              tick={{ fontSize: 12, fill: theme.axis }}
              tickFormatter={(value) => `${value}%`}
              type="number"
            />
            <ZAxis dataKey="count" name="Assets" range={[180, 900]} />
            <ReferenceLine x={80} stroke={theme.accent} strokeDasharray="4 4" />
            <ReferenceLine y={60} stroke={theme.accent} strokeDasharray="4 4" />
            <Tooltip
              content={<QuadrantTooltip />}
              cursor={{ strokeDasharray: "3 3" }}
            />
            {QUADRANTS.map((quadrant) => (
              <Scatter
                key={quadrant}
                data={bubblesFor(quadrant)}
                fill={theme[QUADRANT_STYLE[quadrant].colorKey]}
                fillOpacity={0.65}
                isAnimationActive={false}
                name={quadrant}
                onClick={() => navigate("/effectiveness")}
                shape={QUADRANT_STYLE[quadrant].shape}
                stroke={theme[QUADRANT_STYLE[quadrant].colorKey]}
              >
                <LabelList
                  dataKey="count"
                  formatter={(value: number) =>
                    value > 1 ? String(value) : ""
                  }
                  position="top"
                  style={{ fill: theme.axis, fontSize: 10, fontWeight: 700 }}
                />
              </Scatter>
            ))}
          </ScatterChart>
        )}
      </ChartFrame>
      {insufficientCount > 0 && (
        <p className="mt-2 text-xs text-muted">
          {insufficientCount} asset{insufficientCount === 1 ? "" : "s"} with
          insufficient evidence, not plotted.
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
        {QUADRANTS.map((quadrant) => (
          <span className="inline-flex items-center gap-1.5" key={quadrant}>
            <span
              aria-hidden="true"
              style={{ color: theme[QUADRANT_STYLE[quadrant].colorKey] }}
            >
              {QUADRANT_STYLE[quadrant].glyph}
            </span>
            {quadrant}
            <span className="tabular-nums text-subtle">
              ({counts[quadrant]})
            </span>
          </span>
        ))}
      </div>
      <p className="mt-1 text-xs text-subtle">
        Bubble size and number show how many assets share a score, since many
        stack at the same governed and effective values. Hover a bubble for the
        assets there, or{" "}
        <Link
          className="font-medium text-accent-strong underline-offset-2 hover:underline focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          to="/effectiveness"
        >
          open the full ranking
        </Link>
        .
      </p>
      <ul className="sr-only">
        {scored.map((score) => (
          <li key={score.asset.id}>
            {score.asset.name}: {score.quadrant}, governed{" "}
            {formatPercent(score.governedScore)}, effective{" "}
            {score.effectiveScore === null
              ? "insufficient evidence"
              : formatPercent(score.effectiveScore)}
          </li>
        ))}
      </ul>
    </div>
  );
}

function QuadrantTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Bubble }[];
}) {
  if (!active || !payload?.length) return null;
  const cell = payload[0].payload;
  const extra = cell.count - cell.names.length;
  return (
    <div className="rounded-md border border-border bg-surface-raised p-3 text-sm shadow-md">
      <div className="font-semibold text-fg">
        {cell.count} {cell.quadrant} asset{cell.count === 1 ? "" : "s"}
      </div>
      <div className="mt-1 text-xs text-subtle">
        Governed {cell.x}% · Effective {cell.y}%
      </div>
      <div className="mt-1.5 text-xs text-muted">
        {cell.names.join(", ")}
        {extra > 0 ? `, +${extra} more` : ""}
      </div>
    </div>
  );
}
