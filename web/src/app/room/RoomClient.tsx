"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { getRoom } from "@/lib/api";
import { RoomSocket } from "@/lib/realtime/socket";
import { TypingArea } from "@/components/typing/TypingArea";
import { Leaderboard } from "@/components/race/Leaderboard";
import { Podium } from "@/components/race/Podium";
import snippets from "@/data/snippets.json";

interface PlayerState {
  display_name: string;
  progress: number;
  finished_at?: number;
  scaled_wpm?: number;
  net_wpm?: number;
  gross_wpm?: number;
  accuracy?: number;
}

export default function RoomPage() {
  const searchParams = useSearchParams();
  const code = (searchParams.get("code") ?? "").toUpperCase();
  const [snippetId, setSnippetId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("lobby");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [players, setPlayers] = useState<Record<string, PlayerState>>({});
  const socketRef = useRef<RoomSocket | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [displayName, setDisplayName] = useState("");
  useEffect(() => {
    setIsHost(sessionStorage.getItem("is_host") === "1");
    setDisplayName(sessionStorage.getItem("display_name") ?? "");
  }, []);

  const snippet = useMemo(
    () => snippets.find((s) => s.snippet_id === snippetId)?.code ?? "",
    [snippetId],
  );

  useEffect(() => {
    getRoom(code).then((r) => {
      setSnippetId(r.snippet_id);
      setStatus(r.status);
      if (r.started_at) setStartedAt(r.started_at);
    });
  }, [code]);

  useEffect(() => {
    if (!displayName) return;
    const sock = new RoomSocket(code, displayName, (msg) => {
      if (msg.type === "cursor") {
        setPlayers((p) => ({
          ...p,
          [msg.display_name]: {
            ...(p[msg.display_name] ?? { display_name: msg.display_name, progress: 0 }),
            display_name: msg.display_name,
            progress: msg.progress,
          },
        }));
      } else if (msg.type === "room-event" && msg.event === "status") {
        setStatus(msg.payload.status);
        if (msg.payload.started_at) setStartedAt(msg.payload.started_at);
      } else if (msg.type === "room-event" && msg.event === "join") {
        setPlayers((p) => ({
          ...p,
          [msg.payload.display_name]: p[msg.payload.display_name] ?? {
            display_name: msg.payload.display_name,
            progress: 0,
          },
        }));
      } else if (msg.type === "finish") {
        setPlayers((p) => ({
          ...p,
          [msg.display_name]: {
            ...(p[msg.display_name] ?? { display_name: msg.display_name, progress: 1 }),
            display_name: msg.display_name,
            progress: 1,
            finished_at: msg.finished_at,
            scaled_wpm: msg.scaled_wpm,
            net_wpm: msg.net_wpm,
            gross_wpm: msg.gross_wpm,
            accuracy: msg.accuracy,
          },
        }));
      }
    });
    sock.connect();
    socketRef.current = sock;
    setPlayers((p) => ({
      ...p,
      [displayName]: p[displayName] ?? { display_name: displayName, progress: 0 },
    }));
    return () => sock.close();
  }, [code, displayName]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(id);
  }, []);

  const playerList = useMemo(
    () => Object.entries(players).map(([id, p]) => ({ ...p, id })),
    [players],
  );
  const inCountdown =
    status === "countdown" && startedAt && now < startedAt;
  const isRacing = status === "running" || (startedAt && now >= startedAt && status !== "finished");
  const router = useRouter();
  const finishers = playerList.filter((p) => p.finished_at);
  const stillRacing = playerList.some(
    (p) => !p.finished_at && p.progress > 0 && p.progress < 1,
  );
  const raceOver =
    status === "finished" ||
    (!!startedAt && finishers.length > 0 && !stillRacing);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Room <span className="font-mono text-emerald-400">{code}</span>
        </h1>
        <span className="text-sm text-neutral-400">{displayName || "spectator"}</span>
      </header>

      {status === "lobby" && (
        <section>
          <h2 className="text-lg font-medium">Lobby</h2>
          <p className="text-sm text-neutral-400">
            Share code <span className="font-mono">{code}</span>. Players: {Object.keys(players).length}
          </p>
          <Leaderboard players={playerList} />
          {isHost && (
            <button
              onClick={() => socketRef.current?.start()}
              disabled={Object.keys(players).length < 1}
              className="mt-4 rounded bg-emerald-500 px-4 py-2 font-semibold text-black disabled:opacity-50"
            >
              Start race
            </button>
          )}
        </section>
      )}

      {inCountdown && startedAt && (
        <section className="text-center">
          <p className="text-sm text-neutral-400">Starting in</p>
          <p className="text-6xl font-bold">
            {Math.max(0, Math.ceil((startedAt - now) / 1000))}
          </p>
        </section>
      )}

      {!!startedAt && now >= startedAt && !raceOver && (
        <section className="space-y-4">
          <Leaderboard players={playerList} />
          <TypingArea
            snippet={snippet}
            disabled={!displayName}
            onProgress={(s) => socketRef.current?.cursor(s.progress, s.chars_typed, s.errors)}
            onFinish={(s) => socketRef.current?.finish(s.chars_typed, s.errors)}
          />
        </section>
      )}

      {raceOver && (
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
            {isHost && (
              <button
                onClick={async () => {
                  const { createRoom } = await import("@/lib/api");
                  const r = await createRoom(snippetId ?? snippets[0].snippet_id);
                  sessionStorage.setItem("is_host", "1");
                  sessionStorage.setItem("display_name", "host");
                  router.push(`/room/?code=${r.code}`);
                }}
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
            {isHost && (
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
    </main>
  );
}
