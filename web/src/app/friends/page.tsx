"use client";
import { useEffect, useState } from "react";
import {
  acceptFriendRequest,
  blockUser,
  friendlyMessage,
  listFriendRequests,
  listFriends,
  removeFriend,
  searchUsers,
  sendFriendRequest,
  type FriendRequestSummary,
  type FriendSummary,
  type UserSearchHit,
} from "@/lib/api";

export default function FriendsPage() {
  const [friends, setFriends] = useState<FriendSummary[]>([]);
  const [requests, setRequests] = useState<FriendRequestSummary[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserSearchHit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function refresh() {
    try {
      const [f, r] = await Promise.all([listFriends(), listFriendRequests()]);
      setFriends(f);
      setRequests(r);
    } catch (e) {
      setErr(friendlyMessage(e));
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const q = query.trim();
    const handle = setTimeout(() => {
      searchUsers(q)
        .then(setResults)
        .catch((e) => setErr(friendlyMessage(e)));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  async function withBusy<T>(key: string, fn: () => Promise<T>) {
    setErr(null);
    setBusy(key);
    try {
      await fn();
      await refresh();
    } catch (e) {
      setErr(friendlyMessage(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-6 text-zinc-100">
      <h1 className="mb-4 text-xl font-semibold">Friends</h1>
      {err ? (
        <div className="mb-4 rounded border border-red-800 bg-red-950/40 p-2 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      <section className="mb-8">
        <h2 className="mb-2 text-sm font-medium text-zinc-300">Find someone</h2>
        <input
          type="text"
          placeholder="search by handle (3+ chars)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-sm"
        />
        {results.length > 0 ? (
          <ul className="mt-2 divide-y divide-zinc-800 rounded border border-zinc-800">
            {results.map((u) => (
              <li
                key={u.user_id}
                className="flex items-center justify-between p-2 text-sm"
              >
                <span>
                  {u.display_name}{" "}
                  <span className="text-zinc-500">• {u.rating}</span>
                </span>
                <button
                  className="rounded bg-emerald-700 px-2 py-1 text-xs hover:bg-emerald-600 disabled:opacity-50"
                  disabled={busy === `req-${u.user_id}`}
                  onClick={() =>
                    withBusy(`req-${u.user_id}`, () =>
                      sendFriendRequest(u.user_id),
                    )
                  }
                >
                  Add
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      {requests.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-2 text-sm font-medium text-zinc-300">
            Incoming requests ({requests.length})
          </h2>
          <ul className="divide-y divide-zinc-800 rounded border border-zinc-800">
            {requests.map((r) => (
              <li
                key={r.from_user_id}
                className="flex items-center justify-between p-2 text-sm"
              >
                <span>
                  {r.display_name}{" "}
                  <span className="text-zinc-500">• {r.rating}</span>
                </span>
                <div className="flex gap-2">
                  <button
                    className="rounded bg-emerald-700 px-2 py-1 text-xs hover:bg-emerald-600 disabled:opacity-50"
                    disabled={busy === `acc-${r.from_user_id}`}
                    onClick={() =>
                      withBusy(`acc-${r.from_user_id}`, () =>
                        acceptFriendRequest(r.from_user_id),
                      )
                    }
                  >
                    Accept
                  </button>
                  <button
                    className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-50"
                    disabled={busy === `dec-${r.from_user_id}`}
                    onClick={() =>
                      withBusy(`dec-${r.from_user_id}`, () =>
                        removeFriend(r.from_user_id),
                      )
                    }
                  >
                    Decline
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-medium text-zinc-300">
          Your friends ({friends.length})
        </h2>
        {friends.length === 0 ? (
          <p className="text-sm text-zinc-500">
            No friends yet. Search above to find people.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-800 rounded border border-zinc-800">
            {friends.map((f) => (
              <li
                key={f.user_id}
                className="flex items-center justify-between p-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span
                    aria-label={f.presence}
                    className={`inline-block size-2 rounded-full ${
                      f.presence === "online"
                        ? "bg-emerald-500"
                        : "bg-zinc-600"
                    }`}
                  />
                  {f.display_name}{" "}
                  <span className="text-zinc-500">• {f.rating}</span>
                </span>
                <div className="flex gap-2">
                  <button
                    className="rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600 disabled:opacity-50"
                    disabled={busy === `rm-${f.user_id}`}
                    onClick={() =>
                      withBusy(`rm-${f.user_id}`, () =>
                        removeFriend(f.user_id),
                      )
                    }
                  >
                    Remove
                  </button>
                  <button
                    className="rounded bg-red-900 px-2 py-1 text-xs hover:bg-red-800 disabled:opacity-50"
                    disabled={busy === `bl-${f.user_id}`}
                    onClick={() =>
                      withBusy(`bl-${f.user_id}`, () => blockUser(f.user_id))
                    }
                  >
                    Block
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
