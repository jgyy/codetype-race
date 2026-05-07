"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getRoom, createRoom } from "@/lib/api";
import { TypingArea } from "@/components/typing/TypingArea";
import { Leaderboard } from "@/components/race/Leaderboard";
import { Podium } from "@/components/race/Podium";
import { Lobby } from "@/components/lobby/Lobby";
import { ChatPanel } from "@/components/chat/ChatPanel";
import { useRoomMachine } from "@/lib/machines/useRoomMachine";
import { getReplayUploadUrl, uploadReplay } from "@/lib/api";
import snippets from "@/data/snippets.json";

interface RoomBootstrap {
  room_id: string;
  snippet_id: string;
  status: "lobby" | "countdown" | "running" | "finished";
  started_at: number | null;
}

export default function RoomClient() {
  const searchParams = useSearchParams();
  const code = (searchParams.get("code") ?? "").toUpperCase();
  const router = useRouter();

  const [bootstrap, setBootstrap] = useState<RoomBootstrap | null>(null);
  const [identity, setIdentity] = useState<{
    displayName: string;
    isHost: boolean;
    role: "racer" | "spectator";
  } | null>(null);

  useEffect(() => {
    setIdentity({
      displayName: sessionStorage.getItem("display_name") ?? "",
      isHost: sessionStorage.getItem("is_host") === "1",
      role:
        sessionStorage.getItem("role") === "spectator"
          ? "spectator"
          : "racer",
    });
  }, []);

  useEffect(() => {
    if (!code) return;
    let cancelled = false;
    getRoom(code).then((r) => {
      if (cancelled) return;
      setBootstrap({
        room_id: r.room_id,
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

  if (!identity.displayName) {
    return (
      <NamePrompt
        code={code}
        onSubmit={(name, role) => {
          sessionStorage.setItem("display_name", name);
          sessionStorage.setItem("role", role);
          setIdentity({ displayName: name, isHost: false, role });
        }}
      />
    );
  }

  return (
    <RoomShell
      code={code}
      identity={identity}
      bootstrap={bootstrap}
      snippet={snippet}
      onRematch={async () => {
        // Carry over snippet + roster from this room. Backend dedupes
        // disconnected racers and reseeds counters.
        const r = await createRoom({ previous_room_id: bootstrap.room_id });
        sessionStorage.setItem("is_host", "1");
        sessionStorage.setItem("display_name", "host");
        router.push(`/room/?code=${r.code}`);
      }}
    />
  );
}

function NamePrompt({
  code,
  onSubmit,
}: {
  code: string;
  onSubmit: (name: string, role: "racer" | "spectator") => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<"racer" | "spectator">("racer");
  const [err, setErr] = useState<string | null>(null);
  return (
    <main className="mx-auto max-w-md px-6 py-16 space-y-4">
      <h1 className="text-2xl font-semibold">
        Join room <span className="font-mono text-emerald-400">{code}</span>
      </h1>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!/^[A-Za-z0-9 _-]{1,24}$/.test(trimmed)) {
            setErr("1–24 chars; letters, numbers, space, _ or - only");
            return;
          }
          onSubmit(trimmed, role);
        }}
        className="space-y-3"
      >
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="display name"
          className="w-full rounded border border-neutral-700 bg-neutral-950 px-3 py-2"
          required
        />
        <label className="flex items-center gap-2 text-sm text-neutral-300">
          <input
            type="checkbox"
            checked={role === "spectator"}
            onChange={(e) =>
              setRole(e.target.checked ? "spectator" : "racer")
            }
          />
          Watch as spectator
        </label>
        <button
          type="submit"
          className="rounded bg-emerald-500 px-4 py-2 font-semibold text-black"
        >
          Enter room
        </button>
        {err && <p className="text-sm text-red-400">{err}</p>}
      </form>
    </main>
  );
}

interface ShellProps {
  code: string;
  identity: { displayName: string; isHost: boolean; role: "racer" | "spectator" };
  bootstrap: RoomBootstrap;
  snippet: { snippet_id: string; code: string };
  onRematch: () => Promise<void>;
}

function RoomShell({ code, identity, bootstrap, snippet, onRematch }: ShellProps) {
  const { state, send } = useRoomMachine({
    code,
    displayName: identity.displayName,
    isHost: identity.isHost,
    role: identity.role,
    snippetCode: snippet.code,
    status: bootstrap.status,
    startedAt: bootstrap.started_at,
  });
  const isSpectator = identity.role === "spectator";

  const players = useMemo(
    () =>
      Object.entries(state.context.players).map(([id, p]) => ({ ...p, id })),
    [state.context.players],
  );
  const finishers = players.filter((p) => p.finished_at);

  const isFinished = state.matches("finished");
  const replayUploadedRef = useRef(false);
  useEffect(() => {
    if (!isFinished || replayUploadedRef.current) return;
    replayUploadedRef.current = true;
    // Best-effort replay upload. Every finished client races to upload;
    // S3 last-write-wins is acceptable for v1.
    (async () => {
      try {
        const { upload_url } = await getReplayUploadUrl(bootstrap.room_id);
        const startedAt = state.context.startedAt ?? Date.now();
        const replay = {
          version: 1 as const,
          room_id: bootstrap.room_id,
          snippet_id: snippet.snippet_id,
          started_at: startedAt,
          duration_ms: Math.max(1, Date.now() - startedAt),
          participants: Object.entries(state.context.replayBuffer).map(
            ([name, samples]) => ({
              display_name: name,
              samples: samples.slice(),
            }),
          ),
        };
        await uploadReplay(upload_url, replay);
      } catch {
        // ignore — another client may have uploaded successfully
      }
    })();
  }, [isFinished, bootstrap.room_id, snippet.snippet_id, state.context.replayBuffer, state.context.startedAt]);

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
        <div className="grid gap-4 md:grid-cols-[1fr_18rem]">
          <Lobby
            code={code}
            isHost={identity.isHost}
            players={players}
            onStart={() => send({ type: "HOST_START" })}
          />
          <ChatPanel
            messages={state.context.chat}
            onSend={(text) => send({ type: "CHAT_SEND", text })}
          />
        </div>
      )}

      {state.matches("countdown") && (
        <section className="text-center">
          <p className="text-sm text-neutral-400">Starting in</p>
          <p className="text-6xl font-bold">{state.context.countdownValue}</p>
        </section>
      )}

      {state.matches("racing") && (
        <section className="space-y-4">
          <Leaderboard players={players.filter((p) => (p.role ?? "racer") === "racer")} />
          {isSpectator ? (
            <p className="text-sm text-neutral-400">
              Watching as spectator. Live cursors update above.
            </p>
          ) : (
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
          )}
        </section>
      )}

      {state.matches("finished") && (
        <section className="space-y-6">
          <Podium
            ratings={state.context.ratings}
            results={finishers
              .filter((p) => (p.role ?? "racer") === "racer")
              .map((p) => ({
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
              href={`/replay?roomId=${encodeURIComponent(bootstrap.room_id)}`}
              className="rounded border border-emerald-700 px-4 py-2 text-emerald-300 hover:bg-neutral-800"
            >
              Watch replay
            </Link>
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
          <ChatPanel
            messages={state.context.chat}
            onSend={(text) => send({ type: "CHAT_SEND", text })}
          />
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
