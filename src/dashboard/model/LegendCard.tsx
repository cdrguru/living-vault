/**
 * The relationship legend. Every entry conveys its meaning through color plus a
 * shape or icon, never color alone (WCAG 1.4.1). Edge rows draw a small SVG line
 * sample so a solid required link and a dashed optional link are told apart by
 * dash pattern, not hue; card rows draw a miniature card so a join table and the
 * Asset hub read by their border treatment. Rendered inside the legend popover on
 * the model page.
 */

interface EdgeLegendItem {
  kind: "edge";
  label: string;
  meaning: string;
  dashed: boolean;
  /** End-cardinality glyphs drawn at the line ends, e.g. "1" and "*". */
  fromEnd: string;
  toEnd: string;
}

interface CardLegendItem {
  kind: "card";
  label: string;
  meaning: string;
  /** Which miniature card to draw: a dashed join card or the orange-topped hub. */
  card: "join" | "hub" | "tenant";
}

type LegendItem = EdgeLegendItem | CardLegendItem;

const LEGEND_ITEMS: LegendItem[] = [
  {
    kind: "edge",
    label: "One to many",
    meaning: "A solid line, one parent row to many child rows.",
    dashed: false,
    fromEnd: "1",
    toEnd: "*",
  },
  {
    kind: "edge",
    label: "Optional lookup",
    meaning: "A dashed line, the foreign key may be empty (0..1).",
    dashed: true,
    fromEnd: "*",
    toEnd: "0..1",
  },
  {
    kind: "edge",
    label: "Many to many through a join table",
    meaning: "Shown as a via pill on the edge between the two entities.",
    dashed: false,
    fromEnd: "*",
    toEnd: "*",
  },
  {
    kind: "card",
    label: "Join table",
    meaning: "A dashed card that holds only the key columns.",
    card: "join",
  },
  {
    kind: "card",
    label: "Asset hub",
    meaning: "The orange top edge marks the hub of the model.",
    card: "hub",
  },
  {
    kind: "card",
    label: "Tenant partition",
    meaning: "A tenant chip marks a table partitioned by tenantId.",
    card: "tenant",
  },
];

/** A short SVG line sample so solid and dashed edges are told apart by pattern. */
function EdgeSample({ item }: { item: EdgeLegendItem }) {
  return (
    <svg
      aria-hidden="true"
      className="shrink-0"
      height="18"
      viewBox="0 0 44 18"
      width="44"
    >
      <line
        stroke="var(--chart-axis)"
        strokeDasharray={item.dashed ? "5 3" : undefined}
        strokeWidth="2"
        x1="2"
        x2="42"
        y1="9"
        y2="9"
      />
      <text fill="var(--chart-axis)" fontSize="8" fontWeight="600" x="2" y="6">
        {item.fromEnd}
      </text>
      <text
        fill="var(--chart-axis)"
        fontSize="8"
        fontWeight="600"
        textAnchor="end"
        x="42"
        y="6"
      >
        {item.toEnd}
      </text>
    </svg>
  );
}

/** A miniature card sample that mirrors how join, hub, and tenant cards read. */
function CardSample({ item }: { item: CardLegendItem }) {
  if (item.card === "join") {
    return (
      <span
        aria-hidden="true"
        className="flex h-[18px] w-11 shrink-0 items-center justify-center rounded border border-dashed border-border-strong bg-surface-raised text-[0.5rem] font-medium text-subtle"
      >
        keys
      </span>
    );
  }
  if (item.card === "hub") {
    return (
      <span
        aria-hidden="true"
        className="flex h-[18px] w-11 shrink-0 items-center justify-center rounded border border-border border-t-[3px] border-t-accent bg-surface-raised text-[0.5rem] font-semibold text-accent-strong"
      >
        Asset
      </span>
    );
  }
  return (
    <span
      aria-hidden="true"
      className="flex h-[18px] w-11 shrink-0 items-center justify-center rounded-full bg-surface-inset text-[0.5rem] font-medium text-subtle"
    >
      tenant
    </span>
  );
}

export function LegendCard({ id }: { id?: string }) {
  return (
    <div
      className="w-80 rounded-md border border-border bg-surface-raised p-3 shadow-md"
      id={id}
    >
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-subtle">
        Relationship legend
      </h3>
      <dl className="mt-2.5 space-y-2.5">
        {LEGEND_ITEMS.map((item) => (
          <div className="flex items-start gap-2.5" key={item.label}>
            <span className="mt-0.5 flex w-11 shrink-0 justify-center">
              {item.kind === "edge" ? (
                <EdgeSample item={item} />
              ) : (
                <CardSample item={item} />
              )}
            </span>
            <div className="min-w-0">
              <dt className="text-sm font-semibold text-fg">{item.label}</dt>
              <dd className="text-xs leading-snug text-muted">{item.meaning}</dd>
            </div>
          </div>
        ))}
      </dl>
    </div>
  );
}
