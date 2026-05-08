/**
 * Visually hidden aria-live region. Renders the latest message produced
 * by the announcer reducer. `role="status"` + `aria-live="polite"` lets
 * screen readers wait for an idle moment before speaking, avoiding
 * overlap with the user's typing feedback.
 */
export function RaceLiveRegion({ message, seq }: { message: string | null; seq: number }) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="sr-only"
      // `key` forces a fresh node when seq increments, which prompts some
      // screen readers (NVDA in particular) to re-announce identical text.
      key={seq}
    >
      {message ?? ""}
    </div>
  );
}
