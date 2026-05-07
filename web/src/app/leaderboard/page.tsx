"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getLeaderboard, friendlyMessage } from "@/lib/api";

interface Entry {
  user_id: string;
  display_name: string;
  rating: number;
}

function LeaderboardView() {
  const params = useSearchParams();
  const lang = params.get("lang") ?? "";
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setEntries(null);
    setErr(null);
    getLeaderboard({ lang: lang || undefined, limit: 100 })
      .then((r) => setEntries(r.entries ?? []))
      .catch((e) => setErr(friendlyMessage(e)));
  }, [lang]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Leaderboard</h1>
        <Link href="/" className="text-sm text-neutral-400 hover:underline">
          Home
        </Link>
      </header>

      <p className="text-sm text-neutral-400">
        {lang ? `Language: ${lang}` : "Global"} ·{" "}
        <Link
          href="/leaderboard"
          className={lang === "" ? "text-emerald-400" : "hover:underline"}
        >
          Global
        </Link>{" "}
        ·{" "}
        <Link
          href="/leaderboard?lang=typescript"
          className={lang === "typescript" ? "text-emerald-400" : "hover:underline"}
        >
          TypeScript
        </Link>{" "}
        ·{" "}
        <Link
          href="/leaderboard?lang=python"
          className={lang === "python" ? "text-emerald-400" : "hover:underline"}
        >
          Python
        </Link>
      </p>

      {err && <p className="text-sm text-red-400">{err}</p>}
      {entries === null && !err && (
        <p className="text-sm text-neutral-500">Loading…</p>
      )}
      {entries && entries.length === 0 && (
        <p className="text-sm text-neutral-500">No ratings yet.</p>
      )}
      {entries && entries.length > 0 && (
        <ol className="space-y-1">
          {entries.map((e, i) => (
            <li
              key={`${e.user_id}-${i}`}
              className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-3 py-2"
            >
              <span className="flex items-center gap-3">
                <span className="w-8 text-right text-neutral-500">{i + 1}</span>
                <Link
                  href={`/profile?id=${encodeURIComponent(e.user_id)}`}
                  className="font-mono hover:underline"
                >
                  {e.display_name}
                </Link>
              </span>
              <span className="text-sm">{e.rating}</span>
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
