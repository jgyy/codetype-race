"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { listFriends, type FriendSummary } from "@/lib/api";

const MAX_AVATARS = 8;

export function FriendsOnlineWidget() {
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    listFriends()
      .then((list) => {
        if (cancelled) return;
        setFriends(list);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return null;
  const online = friends.filter((f) => f.presence === "online");
  if (online.length === 0) {
    return (
      <div className="rounded border border-zinc-800 p-3 text-sm text-zinc-400">
        No friends online.{" "}
        <Link className="underline" href="/friends">
          Find some
        </Link>
        .
      </div>
    );
  }
  const visible = online.slice(0, MAX_AVATARS);
  const overflow = online.length - visible.length;
  return (
    <div className="rounded border border-zinc-800 p-3">
      <div className="mb-2 text-sm font-medium text-zinc-200">
        Friends online ({online.length})
      </div>
      <div className="flex flex-wrap gap-2">
        {visible.map((f) => (
          <Link
            key={f.user_id}
            href={`/profile?id=${encodeURIComponent(f.user_id)}`}
            className="rounded bg-emerald-900/40 px-2 py-1 text-xs text-emerald-200 hover:bg-emerald-900/70"
            title={`${f.display_name} • ${f.rating}`}
          >
            {f.display_name}
          </Link>
        ))}
        {overflow > 0 ? (
          <span className="rounded bg-zinc-800 px-2 py-1 text-xs text-zinc-300">
            +{overflow}
          </span>
        ) : null}
      </div>
    </div>
  );
}
