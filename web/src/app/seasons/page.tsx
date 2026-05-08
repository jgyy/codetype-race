"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { friendlyMessage, getCurrentSeason } from "@/lib/api";

export default function Page() {
  const [data, setData] = useState<{
    season: { id: string; status: string; startsAt: string; endsAt: string } | null;
    daysRemaining: number | null;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    getCurrentSeason()
      .then(setData)
      .catch((e) => setErr(friendlyMessage(e)));
  }, []);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Seasons</h1>
        <Link href="/" className="text-sm text-neutral-400 hover:underline">
          Home
        </Link>
      </header>

      {err && <p className="text-sm text-red-400">{err}</p>}
      {!data && !err && <p className="text-sm text-neutral-500">Loading…</p>}
      {data && !data.season && (
        <p className="text-sm text-neutral-500">No active season right now.</p>
      )}
      {data && data.season && (
        <article className="rounded border border-neutral-800 bg-neutral-900 px-4 py-4 space-y-2">
          <h2 className="text-xl font-mono text-emerald-400">
            {data.season.id}
          </h2>
          <p className="text-sm text-neutral-300">
            Started {new Date(data.season.startsAt).toLocaleDateString()} ·
            ends {new Date(data.season.endsAt).toLocaleDateString()}
            {data.daysRemaining !== null && (
              <> · <span className="text-emerald-400">{data.daysRemaining} days remaining</span></>
            )}
          </p>
          <Link
            href={`/seasons/leaderboard?id=${encodeURIComponent(data.season.id)}`}
            className="inline-block rounded border border-neutral-700 px-3 py-1 text-sm hover:border-neutral-500"
          >
            Frozen leaderboard →
          </Link>
        </article>
      )}
    </main>
  );
}
