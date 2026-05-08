/**
 * Service-worker registration gate. Only registers when the user has
 * opted in via `?sw=on` (sticky in localStorage). Honours `?sw=off` and
 * `?reset=1` for opt-out / killswitch.
 *
 * Slice 3 ships SW behind opt-in for staff testing; slice 5 will flip the
 * default once the offline-practice queue is verified.
 */
const OPT_IN_KEY = "codetype-sw-opt-in";

export type SwGateResult = "registered" | "unregistered" | "skipped" | "unsupported";

export async function maybeRegisterSw(): Promise<SwGateResult> {
  if (typeof window === "undefined") return "skipped";
  if (!("serviceWorker" in navigator)) return "unsupported";

  const url = new URL(window.location.href);

  // Killswitch: ?reset=1 — drop opt-in flag and unregister every SW.
  if (url.searchParams.get("reset") === "1") {
    try {
      localStorage.removeItem(OPT_IN_KEY);
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    } catch {
      // best-effort
    }
    return "unregistered";
  }

  const swParam = url.searchParams.get("sw");
  if (swParam === "on") localStorage.setItem(OPT_IN_KEY, "1");
  if (swParam === "off") {
    localStorage.removeItem(OPT_IN_KEY);
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
    return "unregistered";
  }

  if (localStorage.getItem(OPT_IN_KEY) !== "1") return "skipped";

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
    return "registered";
  } catch (err) {
    console.warn("[sw] register failed", err);
    return "skipped";
  }
}

export async function unregisterAllSw(): Promise<void> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  localStorage.removeItem(OPT_IN_KEY);
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map((r) => r.unregister()));
  const names = await caches.keys();
  await Promise.all(names.map((n) => caches.delete(n)));
}
