"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getRoom, createRoom } from "@/lib/api";
import { TypingArea } from "@/components/typing/TypingArea";
import { Leaderboard } from "@/components/race/Leaderboard";
import { Podium } from "@/components/race/Podium";
import { Lobby } from "@/components/lobby/Lobby";
import { useRoomMachine } from "@/lib/machines/useRoomMachine";
import snippets from "@/data/snippets.json";

interface RoomBootstrap {
  snippet_id: string;
  status: "lobby" | "countdown" | "running" | "finished";
  started_at: number | null;
}

export default function RoomClient() {
  const searchParams = useSearchParams();
  const code = (searchParams.get("code") ?? "").toUpperCase();
  const router = useRouter();

  const [bootstrap, setBootstrap] = useState<RoomBootstrap | null>(null);
  const [identity, setIdentity] = useState<{ displayName: string; isHost: boolean } | null>(null);

  useEffect(() => {
    setIdentity({
      displayName: sessionStorage.getItem("display_name") ?? "",
      isHost: sessionStorage.getItem("is_host") === "1",
    });
  }, []);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    getRoom(code).then((r) => {
      if (cancelled) return;
      setBootstrap({
        snippet_id: r.snippet_id,
        status: r.status,
        started_at: r.started_at ?? null,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [code]);

  const snippet = useMemo(() => {
    if (!bootstrap) return null;
    return snippets.find((s) => s.snippet_id === bootstrap.snippet_id) ?? null;
  }, [bootstrap]);

  if (!code || !identity || !bootstrap || !snippet) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-neutral-400">Loading room…</p>
      </main>
    );
  }

  return (
    <RoomShell
      code={code}
      identity={identity}
      bootstrap={bootstrap}
      snippet={snippet}
      onRematch={async () => {
        const r = await createRoom(snippet.snippet_id);
        sessionStorage.setItem("is_host", "1");
        sessionStorage.setItem("display_name", "host");
        router.push(`/room/?code=${r.code}`);
      }}
    />
  );
}

interface ShellProps {
  code: string;
  identity: { displayName: string; isHost: boolean };
  bootstrap: RoomBootstrap;
  snippet: { snippet_id: string; code: string };
  onRematch: () => Promise<void>;
}

function RoomShell({ code, identity, bootstrap, snippet, onRematch }: ShellProps) {
  const { state, send } = useRoomMachine({
    code,
    displayName: identity.displayName,
    isHost: identity.isHost,
    snippetCode: snippet.code,
    status: bootstrap.status,
    startedAt: bootstrap.started_at,
  });

  const players = useMemo(
    () =>
      Object.entries(state.context.players).map(([id, p]) => ({ ...p, id })),
    [state.context.players],
  );
  const finishers = players.filter((p) => p.finished_at);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Room <span className="font-mono text-emerald-400">{code}</span>
        </h1>
        <span className="text-sm text-neutral-400">
          {identity.displayName || "spectator"}
        </span>
      </header>

      {(state.matches("idle") || state.matches("connecting")) && (
        <p className="text-sm text-neutral-400">Connecting…</p>
      )}

      {state.matches("lobby") && (
        <Lobby
          code={code}
          isHost={identity.isHost}
          players={players}
          onStart={() => send({ type: "HOST_START" })}
        />
      )}

      {state.matches("countdown") && (
        <section className="text-center">
          <p className="text-sm text-neutral-400">Starting in</p>
          <p className="text-6xl font-bold">{state.context.countdownValue}</p>
        </section>
      )}

      {state.matches("racing") && (
        <section className="space-y-4">
          <Leaderboard players={players} />
          <TypingArea
            snippet={snippet.code}
            disabled={!identity.displayName}
            onProgress={(s) =>
              send({
                type: "TYPED",
                progress: s.progress,
                chars_typed: s.chars_typed,
                errors: s.errors,
              })
            }
            onFinish={(s) =>
              send({
                type: "FINISH_LOCALLY",
                chars_typed: s.chars_typed,
                errors: s.errors,
              })
            }
          />
        </section>
      )}

      {state.matches("finished") && (
        <section className="space-y-6">
          <Podium
            results={finishers.map((p) => ({
              id: p.id,
              display_name: p.display_name,
              finished_at: p.finished_at!,
              scaled_wpm: p.scaled_wpm ?? 0,
              net_wpm: p.net_wpm ?? 0,
              gross_wpm: p.gross_wpm ?? 0,
              accuracy: p.accuracy ?? 0,
            }))}
          />
          <div className="flex flex-wrap gap-3">
            {identity.isHost && (
              <button
                type="button"
                onClick={onRematch}
                className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black hover:bg-emerald-400"
              >
                Race again
              </button>
            )}
            <Link
              href="/"
              className="rounded border border-neutral-700 px-4 py-2 hover:bg-neutral-800"
            >
              Back home
            </Link>
            {identity.isHost && (
              <Link
                href="/history"
                className="rounded border border-neutral-700 px-4 py-2 hover:bg-neutral-800"
              >
                View history
              </Link>
            )}
          </div>
        </section>
      )}

      {state.matches("reconnecting") && (
        <p className="text-sm text-amber-400">
          Reconnecting (attempt {state.context.retryCount}/5)…
        </p>
      )}

      {state.matches("error") && (
        <section className="space-y-3">
          <p className="text-sm text-red-400">
            {state.context.error?.message ?? "Connection error"}
          </p>
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
