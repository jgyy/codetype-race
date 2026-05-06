"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { getRoom } from "@/lib/api";
import { RoomSocket } from "@/lib/realtime/socket";
import { TypingArea } from "@/components/typing/TypingArea";
import { Leaderboard } from "@/components/race/Leaderboard";
import { Podium } from "@/components/race/Podium";
import snippets from "../../../../../data/snippets.json";

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
  const params = useParams<{ code: string }>();
  const code = params.code.toUpperCase();
  const [snippetId, setSnippetId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("lobby");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [players, setPlayers] = useState<Record<string, PlayerState>>({});
  const socketRef = useRef<RoomSocket | null>(null);
  const isHost =
    typeof window !== "undefined" && sessionStorage.getItem("is_host") === "1";
  const displayName =
    typeof window !== "undefined"
      ? sessionStorage.getItem("display_name") ?? ""
      : "";

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

  const inCountdown =
    status === "countdown" && startedAt && now < startedAt;
  const isRacing = status === "running" || (startedAt && now >= startedAt && status !== "finished");
  const allFinished =
    Object.values(players).length > 0 &&
    Object.values(players).every((p) => p.finished_at);

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
          <Leaderboard players={Object.values(players)} />
          {isHost && (
            <button
              onClick={() => socketRef.current?.start()}
              disabled={Object.keys(players).length < 2}
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

      {!!startedAt && now >= startedAt && !allFinished && (
        <section className="space-y-4">
          <Leaderboard players={Object.values(players)} />
          <TypingArea
            snippet={snippet}
            disabled={!displayName}
            onProgress={(s) => socketRef.current?.cursor(s.progress, s.chars_typed, s.errors)}
            onFinish={(s) => socketRef.current?.finish(s.chars_typed, s.errors)}
          />
        </section>
      )}

      {allFinished && (
        <Podium
          results={Object.values(players)
            .filter((p): p is Required<PlayerState> => !!p.finished_at)
            .map((p) => ({
              display_name: p.display_name,
              finished_at: p.finished_at!,
              scaled_wpm: p.scaled_wpm ?? 0,
              net_wpm: p.net_wpm ?? 0,
              gross_wpm: p.gross_wpm ?? 0,
              accuracy: p.accuracy ?? 0,
            }))}
        />
      )}
    </main>
  );
}
