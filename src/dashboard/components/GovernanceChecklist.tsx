import type { GovernanceCheck } from "@/data";

/** A check mark for a passing row. aria-hidden, since the row text is the label. */
const passGlyph = (
  <path
    d="M3.5 8.5l3 3 6-7"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="1.8"
  />
);

/** A cross for a failing row, a distinct shape so pass and fail never share only color. */
const failGlyph = (
  <path
    d="M4 4l8 8M12 4l-8 8"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeWidth="1.8"
  />
);

/**
 * The six governance checks as pass/fail rows so a sub-0.8 score is explained
 * rather than decorative. Each row is a glyph (check or cross) plus a token tone
 * plus the label text, so state reads as color plus shape plus icon (WCAG 1.4.1).
 */
export function GovernanceChecklist({
  checks,
  className = "",
}: {
  checks: GovernanceCheck[];
  className?: string;
}) {
  return (
    <ul className={`space-y-1.5 ${className}`.trim()}>
      {checks.map((check) => (
        <li className="flex items-center gap-2 text-sm" key={check.id}>
          <svg
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 ${check.pass ? "text-success" : "text-danger"}`}
            height="16"
            viewBox="0 0 16 16"
            width="16"
          >
            {check.pass ? passGlyph : failGlyph}
          </svg>
          <span className={check.pass ? "text-fg" : "text-muted"}>
            {check.label}
          </span>
          <span className="sr-only">{check.pass ? " passes" : " fails"}</span>
        </li>
      ))}
    </ul>
  );
}
