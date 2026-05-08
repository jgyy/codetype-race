"use client";
import { Suspense, useEffect, useReducer, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useMachine } from "@xstate/react";
import Link from "next/link";
import { TypingArea } from "@/components/typing/TypingArea";
import { Podium } from "@/components/race/Podium";
import { RaceLiveRegion } from "@/components/a11y/RaceLiveRegion";
import {
  initialAnnouncerState,
  reduceAnnouncer,
  type AnnouncerEvent,
} from "@/lib/a11y/announcer";
import { practiceMachine } from "@/lib/machines/practiceMachine";
import { getCurrentUser } from "@/lib/aws/cognito";

function PracticeView() {
  const params = useSearchParams();
  const language = params.get("language") ?? undefined;
  const difficultyRaw = params.get("difficulty");
  const difficulty = difficultyRaw ? Number(difficultyRaw) : undefined;

  const [authed, setAuthed] = useState(false);
  useEffect(() => {
    getCurrentUser()
      .then(() => setAuthed(true))
      .catch(() => setAuthed(false));
  }, []);

  const [state, send] = useMachine(practiceMachine, {
    input: { language, difficulty },
  });
  const ctx = state.context;

  const [announcer, dispatchAnnouncer] = useReducer(
    (s: ReturnType<typeof initialAnnouncerState>, e: AnnouncerEvent) => reduceAnnouncer(s, e),
    undefined,
    initialAnnouncerState,
  );
  const lastTickRef = useRef(0);
  const snippetLen = ctx.snippet?.code.length ?? 0;

  const finishedAnnouncedRef = useRef(false);
  useEffect(() => {
    if (state.matches("finished") && ctx.result && !finishedAnnouncedRef.current) {
      finishedAnnouncedRef.current = true;
      dispatchAnnouncer({
        type: "finished",
        wpm: ctx.result.net_wpm,
        accuracy: ctx.result.accuracy,
        now: Date.now(),
      });
    }
    if (state.matches("ready") || state.matches("loading")) {
      finishedAnnouncedRef.current = false;
    }
  }, [state, ctx.result]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <RaceLiveRegion message={announcer.message} seq={announcer.seq} />
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Practice</h1>
        <Link href="/" className="text-sm text-neutral-400 hover:underline">
          Home
        </Link>
      </header>

      {authed && (
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={ctx.save}
            onChange={(e) => send({ type: "TOGGLE_SAVE", save: e.target.checked })}
          />
          Save to history
        </label>
      )}

      {state.matches("loading") && (
        <p className="text-sm text-neutral-400">Loading snippet…</p>
      )}

      {(state.matches("ready") ||
        state.matches("racing") ||
        state.matches("submitting")) &&
        ctx.snippet && (
          <section className="space-y-3">
            <p className="text-sm text-neutral-400">
              {ctx.snippet.title} · {ctx.snippet.language}
              {ctx.snippet.difficulty
                ? ` · diff ${ctx.snippet.difficulty}`
                : ""}
            </p>
            <TypingArea
              snippet={ctx.snippet.code}
              onProgress={(s) => {
                send({
                  type: "TYPED",
                  progress: s.progress,
                  chars_typed: s.chars_typed,
                  errors: s.errors,
                });
                const now = Date.now();
                if (now - lastTickRef.current >= 3000) {
                  lastTickRef.current = now;
                  dispatchAnnouncer({
                    type: "tick",
                    charsLeft: Math.max(0, snippetLen - s.chars_typed),
                    now,
                  });
                }
              }}
              onFinish={(s) =>
                send({
                  type: "FINISH",
                  chars_typed: s.chars_typed,
                  errors: s.errors,
                })
              }
            />
            {state.matches("submitting") && (
              <p className="text-sm text-neutral-500">Saving result…</p>
            )}
          </section>
        )}

      {state.matches("finished") && ctx.result && (
        <section className="space-y-4">
          <Podium
            results={[
              {
                id: "you",
                display_name: "you",
                finished_at: ctx.result.finished_at,
                gross_wpm: ctx.result.gross_wpm,
                net_wpm: ctx.result.net_wpm,
                scaled_wpm: ctx.result.scaled_wpm,
                accuracy: ctx.result.accuracy,
              },
            ]}
          />
          {!ctx.result.saved && (
            <p className="text-xs text-neutral-500">
              Result not saved {ctx.save ? "(sign in to enable)" : "(toggle off)"}.
            </p>
          )}
          <button
            type="button"
            onClick={() => send({ type: "RETRY" })}
            className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black"
          >
            Try another
          </button>
        </section>
      )}

      {state.matches("error") && (
        <section className="space-y-3">
          <p className="text-sm text-red-400">{ctx.error ?? "Failed."}</p>
          <button
            type="button"
            onClick={() => send({ type: "RETRY" })}
            className="rounded border border-neutral-700 px-4 py-2 text-sm hover:bg-neutral-800"
          >
            Retry
          </button>
        </section>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <PracticeView />
    </Suspense>
  );
}
