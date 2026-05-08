/**
 * Skip link — first focusable element in <body>. Visually hidden until
 * keyboard-focused, then jumps focus to <main id="main">.
 */
export function SkipLink({ targetId = "main" }: { targetId?: string }) {
  return (
    <a
      href={`#${targetId}`}
      className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-neutral-900 focus:px-3 focus:py-2 focus:text-sm focus:text-white"
    >
      Skip to main content
    </a>
  );
}
