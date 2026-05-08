/**
 * Wraps a focusable child to guarantee a visible ring on keyboard focus.
 * The actual styling lives in globals.css under `:focus-visible` (using the
 * `colors.focus` Tailwind token). This component exists so call sites can
 * opt in explicitly without each one re-stating the utility classes, and so
 * components that strip outlines on themselves can re-attach a ring via the
 * wrapper.
 */
import type { ReactNode } from "react";

export function FocusRing({ children }: { children: ReactNode }) {
  return (
    <span className="inline-block focus-within:rounded-sm focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-[color:theme(colors.focus)]">
      {children}
    </span>
  );
}
