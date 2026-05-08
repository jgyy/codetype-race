"use client";
import { useEffect, useState } from "react";

/**
 * "Install app" affordance.
 *  - Android/Desktop Chromium: captures the `beforeinstallprompt` event
 *    and shows a button that triggers the native install flow.
 *  - iOS Safari: the event never fires, so we fall back to a help card
 *    with the canonical "Share → Add to Home Screen" instructions when a
 *    UA sniff suggests iOS and the page is not running standalone.
 *
 * The prompt is dismissable for the session via localStorage so we don't
 * harass returning users.
 */

type BIPEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "codetype-install-dismissed";

function isStandalone(): boolean {
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // iOS Safari
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

function isIos(): boolean {
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !/CriOS|FxiOS|EdgiOS/.test(navigator.userAgent);
}

export function InstallPrompt() {
  const [bip, setBip] = useState<BIPEvent | null>(null);
  const [showIos, setShowIos] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") {
      setDismissed(true);
      return;
    }
    if (isStandalone()) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setBip(e as BIPEvent);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    if (isIos()) setShowIos(true);

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, "1");
    setDismissed(true);
  };

  if (dismissed) return null;
  if (!bip && !showIos) return null;

  return (
    <aside className="fixed bottom-4 right-4 z-40 max-w-sm rounded-lg border border-neutral-700 bg-neutral-900/95 p-4 text-sm shadow-lg backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold">Install CodeType</p>
          {bip ? (
            <p className="mt-1 text-neutral-400">
              Add CodeType to your home screen for a faster, full-screen race.
            </p>
          ) : (
            <p className="mt-1 text-neutral-400">
              Tap <span className="font-mono">Share</span> →{" "}
              <span className="font-mono">Add to Home Screen</span> to install.
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss install prompt"
          className="rounded p-1 text-neutral-500 hover:bg-neutral-800 hover:text-neutral-300"
        >
          ✕
        </button>
      </div>
      {bip && (
        <div className="mt-3 flex justify-end gap-2">
          <button
            type="button"
            onClick={dismiss}
            className="rounded px-3 py-1.5 text-neutral-400 hover:bg-neutral-800"
          >
            Not now
          </button>
          <button
            type="button"
            className="rounded bg-emerald-500 px-3 py-1.5 font-semibold text-black"
            onClick={async () => {
              await bip.prompt();
              const { outcome } = await bip.userChoice;
              if (outcome === "accepted") dismiss();
              setBip(null);
            }}
          >
            Install
          </button>
        </div>
      )}
    </aside>
  );
}
