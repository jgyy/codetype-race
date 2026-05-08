"use client";
import { useEffect, useState } from "react";
import { friendlyMessage, getUserFeed, type FeedEvent } from "@/lib/api";

function summarise(ev: FeedEvent): string {
  switch (ev.type) {
    case "raced": {
      const lang = (ev.payload.language as string | undefined) ?? "";
      const delta = ev.payload.rating_delta as number | undefined;
      const sign = typeof delta === "number" ? (delta >= 0 ? "+" : "") : "";
      const tail =
        typeof delta === "number" ? ` (${sign}${delta})` : "";
      const won = ev.payload.won === true ? " · won team race" : "";
      return `Raced ${lang}${tail}${won}`;
    }
    case "joined_guild":
      return "Joined a guild";
    case "left_guild":
      return "Left a guild";
    case "won_tournament":
      return "Won a tournament";
    case "daily_completed":
      return "Completed the daily";
    case "achievement_unlocked":
      return `Unlocked ${(ev.payload.name as string | undefined) ?? "an achievement"}`;
    case "pb_set":
      return "Set a new personal best";
  }
}

function relativeTime(iso: string): string {
  const ms = Date.now() - Date.parse(iso);
  const s = Math.max(0, Math.floor(ms / 1000));
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

export function ActivityFeed({ userId }: { userId: string }) {
  const [events, setEvents] = useState<FeedEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    setEvents(null);
    setErr(null);
    getUserFeed(userId)
      .then(setEvents)
      .catch((e) => setErr(friendlyMessage(e)));
  }, [userId]);

  if (err) {
    return (
      <div className="rounded border border-red-800 bg-red-950/40 p-2 text-sm text-red-200">
        {err}
      </div>
    );
  }
  if (events === null) {
    return <div className="text-sm text-zinc-500">Loading…</div>;
  }
  if (events.length === 0) {
    return <div className="text-sm text-zinc-500">No activity yet.</div>;
  }

  return (
    <ul className="divide-y divide-zinc-800 rounded border border-zinc-800">
      {events.map((ev) => (
        <li
          key={ev.event_id}
          className="flex items-center justify-between p-2 text-sm"
        >
          <span>{summarise(ev)}</span>
          <span className="text-xs text-zinc-500">
            {relativeTime(ev.created_at)}
          </span>
        </li>
      ))}
    </ul>
  );
}
