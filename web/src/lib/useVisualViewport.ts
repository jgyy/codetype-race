"use client";
import { useEffect, useState } from "react";

export interface VisualViewportState {
  /** Height of the visible viewport (i.e. window.innerHeight minus on-screen keyboard). */
  height: number;
  /**
   * How far the visual viewport is offset from the layout viewport's top.
   * iOS Safari shifts the visual viewport down when the soft keyboard
   * pushes the page; offsetTop > 0 means the keyboard is open.
   */
  offsetTop: number;
  keyboardOpen: boolean;
}

/**
 * Wraps the VisualViewport API for React. Falls back to window dimensions
 * when unsupported (older Safari without VV; iframes that strip it).
 *
 * Used by the mobile race composer to stay docked above the on-screen
 * keyboard via a `transform: translateY(-keyboardHeight)`-style hook.
 */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>(() => ({
    height: typeof window === "undefined" ? 0 : window.innerHeight,
    offsetTop: 0,
    keyboardOpen: false,
  }));

  useEffect(() => {
    const vv = window.visualViewport;

    const apply = () => {
      const h = vv?.height ?? window.innerHeight;
      const top = vv?.offsetTop ?? 0;
      // Heuristic: keyboard considered open when the visual viewport is
      // at least 150px shorter than the layout viewport (covers iOS,
      // Android and edge cases where the OS animates partial heights).
      const layoutH = window.innerHeight;
      const keyboardOpen = layoutH - h > 150 || top > 0;
      setState({ height: h, offsetTop: top, keyboardOpen });
    };

    apply();
    if (vv) {
      vv.addEventListener("resize", apply);
      vv.addEventListener("scroll", apply);
    }
    window.addEventListener("resize", apply);
    return () => {
      if (vv) {
        vv.removeEventListener("resize", apply);
        vv.removeEventListener("scroll", apply);
      }
      window.removeEventListener("resize", apply);
    };
  }, []);

  return state;
}
