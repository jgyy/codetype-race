"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getReplay, friendlyMessage } from "@/lib/api";
import { ReplayPlayer } from "@/components/replay/ReplayPlayer";
import snippets from "@/data/snippets.json";

interface ReplayPayload {
  version: 1;
  room_id: string;
  snippet_id: string;
  started_at: number;
  duration_ms: number;
  participants: Array<{
    display_name: string;
    samples: Array<[number, number]>;
  }>;
}

function ReplayView() {
  const params = useSearchParams();
  const roomId = params.get("roomId") ?? "";
  const [replay, setReplay] = useState<ReplayPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!roomId) return;
    setReplay(null);
    setErr(null);
    (async () => {
      try {
        const { download_url } = await getReplay(roomId);
        const r = await fetch(download_url);
        if (!r.ok) throw new Error(`replay download ${r.status}`);
        const json = (await r.json()) as ReplayPayload;
        setReplay(json);
      } catch (e) {
        setErr(friendlyMessage(e));
      }
    })();
  }, [roomId]);

  if (!roomId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-neutral-400">No room selected.</p>
      </main>
    );
  }
  if (err) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10 space-y-3">
        <p className="text-sm text-red-400">{err}</p>
        <p className="text-xs text-neutral-500">
          Replays are deleted automatically after 90 days.
        </p>
      </main>
    );
  }
  if (!replay) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-neutral-400">Loading replay…</p>
      </main>
    );
  }

  const snippet = snippets.find((s) => s.snippet_id === replay.snippet_id);
  const snippetCode = snippet?.code ?? "";

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Replay</h1>
        <Link href="/" className="text-sm text-neutral-400 hover:underline">
          Home
        </Link>
      </header>

      <p className="text-sm text-neutral-400">
        Room <span className="font-mono">{replay.room_id}</span> ·{" "}
        {snippet?.title ?? replay.snippet_id} ·{" "}
        {(replay.duration_ms / 1000).toFixed(1)}s
      </p>

      <ReplayPlayer
        durationMs={replay.duration_ms}
        participants={replay.participants}
        snippetCode={snippetCode}
      />
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ReplayView />
    </Suspense>
  );
}
