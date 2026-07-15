import { useId, useRef } from "react";

/** Magnifier glyph so the field reads as search by shape, not only by placeholder. */
const searchGlyph = (
  <svg
    aria-hidden="true"
    className="h-4 w-4 text-subtle"
    fill="none"
    height="16"
    stroke="currentColor"
    strokeWidth="1.75"
    viewBox="0 0 24 24"
    width="16"
  >
    <circle
      cx="11"
      cy="11"
      r="7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M21 21l-4.3-4.3" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/** An x glyph for the clear control so it carries meaning by shape, not color alone. */
const clearGlyph = (
  <svg
    aria-hidden="true"
    className="h-3.5 w-3.5"
    fill="none"
    height="14"
    stroke="currentColor"
    strokeWidth="2"
    viewBox="0 0 24 24"
    width="14"
  >
    <path
      d="M6 6l12 12M18 6L6 18"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

/**
 * A self-contained, keyboard-accessible search field. The leading magnifier marks
 * it as search by shape, the trailing clear button appears once there is a query,
 * and Escape clears it in one keystroke. It reuses the shared `field` class so the
 * focus-visible ring matches every other input in the console.
 */
export function SearchInput({
  value,
  onChange,
  label,
  placeholder,
  resultCount,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Accessible label for the field, read by screen readers. */
  label: string;
  placeholder?: string;
  /** When provided, announced politely so result counts update without a visual jump. */
  resultCount?: { matched: number; total: number; noun: string };
}) {
  const inputId = useId();
  const statusId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const hasQuery = value.trim().length > 0;

  return (
    <div className="w-full sm:max-w-xs">
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-2.5">
          {searchGlyph}
        </span>
        <input
          aria-describedby={resultCount ? statusId : undefined}
          aria-label={label}
          className="field pl-8 pr-9 [&::-webkit-search-cancel-button]:hidden"
          id={inputId}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape" && hasQuery) {
              event.preventDefault();
              onChange("");
            }
          }}
          placeholder={placeholder ?? "Search by name"}
          ref={inputRef}
          type="search"
          value={value}
        />
        {hasQuery && (
          <button
            aria-label="Clear search"
            className="absolute inset-y-0 right-0 flex items-center rounded-md px-2 text-subtle transition-colors hover:text-fg focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-surface"
            onClick={() => {
              // Clearing unmounts this button, so return focus to the input
              // instead of letting it fall to the document body.
              onChange("");
              inputRef.current?.focus();
            }}
            type="button"
          >
            {clearGlyph}
          </button>
        )}
      </div>
      {resultCount && (
        <p aria-live="polite" className="sr-only" id={statusId}>
          {hasQuery
            ? `${resultCount.matched} of ${resultCount.total} ${resultCount.noun} match`
            : `${resultCount.total} ${resultCount.noun}`}
        </p>
      )}
    </div>
  );
}
