/**
 * A small hand-authored SVG glyph per tone so state reads by shape, not color
 * alone (WCAG 1.4.1). star for Stars or good, alert triangle for Risks or danger,
 * flag for Shelfware or warn, dot for Dead weight or neutral. The glyph is
 * aria-hidden; the surrounding label carries the accessible name.
 */
export function ToneGlyph({
  glyph,
  className,
}: {
  glyph: string;
  className?: string;
}) {
  const common = {
    "aria-hidden": true as const,
    fill: "none" as const,
    height: 14,
    width: 14,
    stroke: "currentColor",
    strokeWidth: 2,
    viewBox: "0 0 24 24",
    className,
  };
  switch (glyph) {
    case "star":
      return (
        <svg {...common}>
          <path
            d="M12 3l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.2l1-5.8L3.5 9.2l5.9-.9z"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M12 3 2 20h20z" strokeLinejoin="round" />
          <path d="M12 9v5" strokeLinecap="round" />
          <circle cx="12" cy="17" r="0.6" fill="currentColor" />
        </svg>
      );
    case "flag":
      return (
        <svg {...common}>
          <path d="M5 21V4" strokeLinecap="round" />
          <path d="M5 4h11l-2 4 2 4H5" strokeLinejoin="round" />
        </svg>
      );
    case "dot":
    default:
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="5" />
        </svg>
      );
  }
}
