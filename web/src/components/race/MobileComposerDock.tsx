"use client";
import type { ReactNode } from "react";
import { useVisualViewport } from "@/lib/useVisualViewport";

/**
 * Wraps the typing composer so it stays docked above the on-screen
 * keyboard on mobile. On desktop the wrapper is inert.
 *
 * Why not pure CSS? `position: sticky; bottom: 0` works on Chrome
 * Android (the layout viewport shrinks when the soft keyboard opens) but
 * fails on iOS Safari, where the visual viewport shifts upward and the
 * sticky element ends up *under* the keyboard. Reading the
 * VisualViewport API and translating by `offsetTop` is the only fix
 * that works in both engines.
 */
export function MobileComposerDock({ children }: { children: ReactNode }) {
  const { offsetTop, keyboardOpen } = useVisualViewport();
  // On desktop and when no keyboard, render plain — preserves desktop UX.
  return (
    <div
      className="md:static sticky bottom-[env(safe-area-inset-bottom,0)] z-10 bg-[#0a0a0a]"
      style={
        keyboardOpen
          ? { transform: `translateY(${-offsetTop}px)`, transition: "transform 60ms" }
          : undefined
      }
    >
      {children}
    </div>
  );
}
