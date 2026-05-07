"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { listHistory, friendlyMessage } from "@/lib/api";
import { configureAuth, getCurrentUser } from "@/lib/aws/cognito";

interface HistoryItem {
  room_id?: string;
  code?: string;
  finished_at?: number;
  scaled_wpm?: number;
  net_wpm?: number;
  accuracy?: number;
  snippet_id?: string;
}

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    configureAuth();
    getCurrentUser()
      .then(() => setSignedIn(true))
      .catch(() => setSignedIn(false));
  }, []);

  useEffect(() => {
    if (!signedIn) return;
    listHistory()
      .then((r) => setItems(r.results ?? []))
      .catch((e) => setErr(friendlyMessage(e)));
  }, [signedIn]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10 space-y-6">
      <h1 className="text-2xl font-semibold">Race history</h1>

      {signedIn === false && (
        <p className="text-sm text-neutral-400">
          <Link href="/host" className="text-emerald-400 hover:underline">
            Sign in
          </Link>{" "}
          to view your race history.
        </p>
      )}

      {err && <p className="text-sm text-red-400">{err}</p>}

      {signedIn && items && items.length === 0 && (
        <p className="text-sm text-neutral-400">No races yet — host one to get started.</p>
      )}

      {signedIn && items && items.length > 0 && (
        <ul className="space-y-2">
          {items.map((it, i) => (
            <li
              key={`${it.room_id ?? "row"}-${i}`}
              className="flex items-center justify-between rounded border border-neutral-800 bg-neutral-900 p-3"
            >
              <span className="font-mono text-sm">
                {it.code ?? it.room_id?.slice(0, 8) ?? "—"}
              </span>
              <span className="text-sm text-neutral-300">
                {it.scaled_wpm != null && `${Math.round(it.scaled_wpm)} wpm · `}
                {it.accuracy != null && `${Math.round(it.accuracy * 100)}% acc · `}
                {it.finished_at != null &&
                  new Date(it.finished_at).toLocaleString()}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
