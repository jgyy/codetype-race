"use client";
import { useEffect, useState } from "react";

/**
 * Top banner shown when navigator.onLine is false. Hidden during SSG so
 * static HTML never ships with the banner pre-rendered.
 */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const apply = () => setOffline(!navigator.onLine);
    apply();
    window.addEventListener("online", apply);
    window.addEventListener("offline", apply);
    return () => {
      window.removeEventListener("online", apply);
      window.removeEventListener("offline", apply);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className="sticky top-0 z-40 bg-amber-700/90 px-4 py-2 text-center text-sm text-white"
    >
      You&apos;re offline — practice runs will sync when you&apos;re back online.
    </div>
  );
}
