"use client";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { getUserProfile, friendlyMessage } from "@/lib/api";

interface Profile {
  user_id: string;
  display_name: string;
  rating: number;
  races_completed: number;
  races_won: number;
  best_wpm: Record<string, number>;
  created_at: number;
}

interface Race {
  room_id: string;
  finished_at: number;
  language?: string;
  scaled_wpm: number;
  net_wpm: number;
  accuracy: number;
  rating_delta: number;
  rating_after: number;
}

function ProfileView() {
  const params = useSearchParams();
  const userId = params.get("id") ?? "";
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recent, setRecent] = useState<Race[]>([]);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setProfile(null);
    setRecent([]);
    setErr(null);
    getUserProfile(userId)
      .then((r) => {
        setProfile(r.profile);
        setRecent(r.recent ?? []);
      })
      .catch((e) => setErr(friendlyMessage(e)));
  }, [userId]);

  if (!userId) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-neutral-400">No user selected.</p>
      </main>
    );
  }
  if (err) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-red-400">{err}</p>
      </main>
    );
  }
  if (!profile) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-10">
        <p className="text-sm text-neutral-400">Loading profile…</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{profile.display_name}</h1>
        <Link href="/leaderboard" className="text-sm text-neutral-400 hover:underline">
          Leaderboard →
        </Link>
      </header>

      <section className="grid grid-cols-3 gap-3 text-sm">
        <Stat label="Rating" value={profile.rating.toString()} />
        <Stat label="Races" value={profile.races_completed.toString()} />
        <Stat label="Wins" value={profile.races_won.toString()} />
      </section>

      {Object.keys(profile.best_wpm).length > 0 && (
        <section>
          <h2 className="mb-2 text-sm uppercase text-neutral-500">
            Best WPM by language
          </h2>
          <ul className="grid grid-cols-2 gap-2 text-sm">
            {Object.entries(profile.best_wpm).map(([lang, w]) => (
              <li
                key={lang}
                className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2"
              >
                <span className="text-neutral-400">{lang}</span>{" "}
                <span className="font-mono">{Math.round(w)} wpm</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-sm uppercase text-neutral-500">Recent races</h2>
        {recent.length === 0 && (
          <p className="text-sm text-neutral-500">No rated races yet.</p>
        )}
        <ul className="space-y-1">
          {recent.map((r) => (
            <li
              key={`${r.room_id}-${r.finished_at}`}
              className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-3 py-2 text-sm"
            >
              <span>
                <span className="text-neutral-400">{r.language ?? "?"}</span>{" "}
                <span className="font-mono">{Math.round(r.scaled_wpm)} wpm</span>{" "}
                <span className="text-neutral-500">
                  · {Math.round(r.accuracy * 100)}% acc
                </span>
              </span>
              <span
                className={
                  r.rating_delta > 0
                    ? "text-emerald-400"
                    : r.rating_delta < 0
                    ? "text-red-400"
                    : "text-neutral-400"
                }
              >
                {r.rating_delta > 0 ? "+" : ""}
                {r.rating_delta} → {r.rating_after}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-neutral-800 bg-neutral-900 px-3 py-2">
      <p className="text-xs uppercase text-neutral-500">{label}</p>
      <p className="font-mono text-lg">{value}</p>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense>
      <ProfileView />
    </Suspense>
  );
}
