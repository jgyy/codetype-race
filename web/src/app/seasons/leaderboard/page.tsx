"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { friendlyMessage, getSeasonLeaderboard } from "@/lib/api";

interface Row {
  rank: number;
  userId: string;
  displayName: string;
  rating: number;
}

function LeaderboardView() {
  const params = useSearchParams();
  const id = params.get("id") ?? "";
  const lang = params.get("lang") ?? "*";
  const [rows, setRows] = useState<Row[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setRows(null);
    setErr(null);
    getSeasonLeaderboard(id, lang)
      .then((r) => setRows(r.rows))
      .catch((e) => setErr(friendlyMessage(e)));
  }, [id, lang]);

  if (!id) return <p className="p-6 text-sm">Missing season id.</p>;

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold font-mono">{id}</h1>
        <Link href="/seasons" className="text-sm text-neutral-400 hover:underline">
          ← Seasons
        </Link>
      </header>

      <p className="text-sm text-neutral-500">
        {lang === "*" ? "Global frozen rankings" : `Language: ${lang}`}
      </p>

      {err && <p className="text-sm text-red-400">{err}</p>}
      {rows === null && !err && (
        <p className="text-sm text-neutral-500">Loading…</p>
      )}
      {rows && rows.length === 0 && (
        <p className="text-sm text-neutral-500">
          Leaderboard is not yet frozen for this season.
        </p>
      )}
      {rows && rows.length > 0 && (
        <ol className="space-y-1">
          {rows.map((r) => (
            <li
              key={r.userId}
              className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-3 py-2"
            >
              <span className="flex items-center gap-3">
                <span className="w-8 text-right text-neutral-500">
                  {r.rank}
                </span>
                <span className="font-mono">{r.displayName}</span>
              </span>
              <span className="text-sm">{r.rating}</span>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}

export default function Page() {
  return (
    <Suspense>
      <LeaderboardView />
    </Suspense>
  );
}
