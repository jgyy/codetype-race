"use client";
import { useEffect } from "react";
import { maybeRegisterSw } from "@/lib/sw/register";

/**
 * Mounts once at the root layout. Drives SW opt-in/opt-out + killswitch
 * exclusively from the URL+localStorage; no UI of its own.
 */
export function SwBootstrap() {
  useEffect(() => {
    maybeRegisterSw().catch(() => {
      // Already logged inside maybeRegisterSw; never let this bubble.
    });
  }, []);
  return null;
}
