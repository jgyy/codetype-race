"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { TypingArea } from "@/components/typing/TypingArea";
import {
  getDaily,
  getDailyLeaderboard,
  postDailySubmit,
} from "@/lib/api";
import { getCurrentUser } from "@/lib/aws/cognito";

interface Daily {
  date: string;
  snippet: {
    snippet_id: string;
    language: string;
    title: string;
    code: string;
    difficulty?: number;
  };
}

interface LbEntry {
  user_id: string;
  display_name: string;
  scaled_wpm: number;
  finished_at: number;
}

export default function DailyPage() {
  const [daily, setDailyState] = useState<Daily | null>(null);
  const [authed, setAuthed] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LbEntry[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{
    improved: boolean;
    best_wpm: number;
    rank: number;
  } | null>(null);

  const startedRef = useRef<number | null>(null);
  const finishedRef = useRef(false);

  useEffect(() => {
    getCurrentUser()
      .then(() => setAuthed(true))
      .catch(() => {});
    getDaily()
      .then(setDailyState)
      .catch((e: Error) => setErr(e.message));
    getDailyLeaderboard({ limit: 100 })
      .then((r) => setLeaderboard(r.entries))
      .catch(() => {});
  }, []);

  async function refreshLeaderboard(date: string) {
    try {
      const r = await getDailyLeaderboard({ date, limit: 100 });
      setLeaderboard(r.entries);
    } catch {
      // ignore
    }
  }

  async function onFinish(s: { chars_typed: number; errors: number }) {
    if (finishedRef.current || !daily) return;
    finishedRef.current = true;
    if (!authed) {
      setErr("Sign in to submit a daily attempt.");
      return;
    }
    const duration = Math.max(1, Date.now() - (startedRef.current ?? Date.now()));
    try {
      const r = await postDailySubmit({
        date: daily.date,
        snippet_id: daily.snippet.snippet_id,
        chars_typed: s.chars_typed,
        errors: s.errors,
        duration_ms: duration,
      });
      setResult(r);
      await refreshLeaderboard(daily.date);
    } catch (e: any) {
      setErr(e.message);
    }
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Daily challenge</h1>
        <Link href="/" className="text-sm text-neutral-400 hover:underline">
          Home
        </Link>
      </header>

      {err && <p className="text-sm text-red-400">{err}</p>}

      {!daily && !err && (
        <p className="text-sm text-neutral-400">Loading today's snippet…</p>
      )}

      {daily && (
        <section className="space-y-3">
          <p className="text-sm text-neutral-400">
            {daily.date} · {daily.snippet.language} · {daily.snippet.title}
            {daily.snippet.difficulty
              ? ` · diff ${daily.snippet.difficulty}`
              : ""}
          </p>
          {!authed && (
            <p className="text-xs text-amber-400">
              Sign in to submit a ranked attempt.
            </p>
          )}
          <TypingArea
            snippet={daily.snippet.code}
            onProgress={(s) => {
              if (startedRef.current === null && s.chars_typed > 0) {
                startedRef.current = Date.now();
              }
            }}
            onFinish={onFinish}
          />
          {result && (
            <p className="text-sm">
              {result.improved
                ? `New best: ${Math.round(result.best_wpm)} wpm · rank ${result.rank}`
                : `Best stays: ${Math.round(result.best_wpm)} wpm · rank ${result.rank}`}
            </p>
          )}
        </section>
      )}

      <section className="space-y-2">
        <h2 className="text-sm uppercase text-neutral-500">Leaderboard</h2>
        {leaderboard.length === 0 && (
          <p className="text-sm text-neutral-500">No entries yet.</p>
        )}
        <ol className="space-y-1">
          {leaderboard.map((e, i) => (
            <li
              key={`${e.user_id}-${i}`}
              className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm"
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-right text-neutral-500">{i + 1}</span>
                <span className="font-mono">{e.display_name}</span>
              </span>
              <span className="font-mono">
                {Math.round(e.scaled_wpm)} wpm
              </span>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
