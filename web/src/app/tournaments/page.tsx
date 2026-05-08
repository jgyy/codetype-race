"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  friendlyMessage,
  listTournaments,
  type TournamentSummary,
} from "@/lib/api";
import { SeasonRibbon } from "@/components/seasons/SeasonRibbon";

const STATUSES: Array<TournamentSummary["status"]> = [
  "registering",
  "running",
  "finished",
];

export default function Page() {
  const [status, setStatus] = useState<TournamentSummary["status"]>(
    "registering",
  );
  const [tournaments, setTournaments] = useState<
    TournamentSummary[] | null
  >(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    setTournaments(null);
    setErr(null);
    listTournaments(status)
      .then((r) => setTournaments(r.tournaments))
      .catch((e) => setErr(friendlyMessage(e)));
  }, [status]);

  return (
    <main className="mx-auto max-w-4xl px-6 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tournaments</h1>
        <SeasonRibbon />
      </header>

      <nav className="flex gap-2 text-sm">
        {STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`rounded px-3 py-1 ${
              status === s
                ? "bg-emerald-700 text-emerald-50"
                : "border border-neutral-800 text-neutral-300 hover:border-neutral-700"
            }`}
          >
            {s}
          </button>
        ))}
      </nav>

      {err && <p className="text-sm text-red-400">{err}</p>}
      {tournaments === null && !err && (
        <p className="text-sm text-neutral-500">Loading…</p>
      )}
      {tournaments && tournaments.length === 0 && (
        <p className="text-sm text-neutral-500">No {status} tournaments.</p>
      )}
      {tournaments && tournaments.length > 0 && (
        <ul className="space-y-2">
          {tournaments.map((t) => (
            <li
              key={t.id}
              className="rounded border border-neutral-800 bg-neutral-900 px-4 py-3"
            >
              <div className="flex items-center justify-between">
                <Link
                  href={`/tournaments/detail?id=${encodeURIComponent(t.id)}`}
                  className="font-medium hover:underline"
                >
                  {t.name}
                </Link>
                <span className="text-xs text-neutral-500">
                  {t.size} · {t.language}
                </span>
              </div>
              <p className="mt-1 text-xs text-neutral-500">
                Starts {new Date(t.startsAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
