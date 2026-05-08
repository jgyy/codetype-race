"use client";
import { useEffect, useState } from "react";
import { unregisterAllSw } from "@/lib/sw/register";

/**
 * Manual killswitch route. Visit /sw-killswitch to drop all caches and
 * unregister every codetype-race service worker on the device. Equivalent
 * to ?reset=1, but bookmarkable and easy to share in a runbook.
 */
export default function SwKillswitchPage() {
  const [status, setStatus] = useState<"working" | "done" | "error">("working");

  useEffect(() => {
    unregisterAllSw()
      .then(() => setStatus("done"))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <section className="mx-auto max-w-md px-6 py-16 text-sm">
      <h1 className="text-lg font-semibold">Service worker killswitch</h1>
      <p className="mt-3 text-neutral-400">
        {status === "working" && "Unregistering service workers and clearing caches…"}
        {status === "done" && "Done. All codetype-race service workers and caches have been removed from this device. You can close this tab."}
        {status === "error" && "Could not complete killswitch. Try a hard reload (Ctrl+Shift+R) or clear site data from devtools."}
      </p>
    </section>
  );
}
