"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  createGuild,
  friendlyMessage,
  redeemGuildInvite,
  searchGuilds,
  type Guild,
} from "@/lib/api";

export default function GuildsPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Guild[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteCode, setInviteCode] = useState("");

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      return;
    }
    const q = query.trim();
    const handle = setTimeout(() => {
      searchGuilds(q)
        .then(setResults)
        .catch((e) => setErr(friendlyMessage(e)));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  return (
    <main className="mx-auto max-w-2xl p-6 text-zinc-100">
      <h1 className="mb-4 text-xl font-semibold">Guilds</h1>
      {err ? (
        <div className="mb-4 rounded border border-red-800 bg-red-950/40 p-2 text-sm text-red-200">
          {err}
        </div>
      ) : null}

      <section className="mb-6">
        <input
          type="text"
          placeholder="search public guilds (3+ chars)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-sm"
        />
        {results.length > 0 ? (
          <ul className="mt-2 divide-y divide-zinc-800 rounded border border-zinc-800">
            {results.map((g) => (
              <li key={g.id} className="p-2 text-sm">
                <Link
                  href={`/guilds/view/?id=${encodeURIComponent(g.id)}`}
                  className="block hover:bg-zinc-900"
                >
                  <span className="font-medium">{g.name}</span>{" "}
                  <span className="text-zinc-500">
                    /{g.slug} • {g.memberCount} members
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-zinc-300">
          Have an invite code?
        </h2>
        <form
          className="flex gap-2"
          onSubmit={async (e) => {
            e.preventDefault();
            setErr(null);
            try {
              const { guild_id } = await redeemGuildInvite(inviteCode);
              window.location.href = `/guilds/view/?id=${encodeURIComponent(guild_id)}`;
            } catch (err) {
              setErr(friendlyMessage(err));
            }
          }}
        >
          <input
            type="text"
            placeholder="invite code"
            value={inviteCode}
            onChange={(e) => setInviteCode(e.target.value)}
            className="flex-1 rounded border border-zinc-800 bg-zinc-900 p-2 text-sm"
          />
          <button
            type="submit"
            className="rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600"
          >
            Join
          </button>
        </form>
      </section>

      <section>
        <button
          className="rounded bg-zinc-800 px-3 py-1 text-sm hover:bg-zinc-700"
          onClick={() => setCreateOpen((o) => !o)}
        >
          {createOpen ? "Cancel" : "Create a guild"}
        </button>
        {createOpen ? <CreateGuildForm onError={setErr} /> : null}
      </section>
    </main>
  );
}

function CreateGuildForm({ onError }: { onError: (msg: string) => void }) {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">("public");
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="mt-3 space-y-2"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          const g = await createGuild({ name, slug, visibility, description });
          window.location.href = `/guilds/view/?id=${encodeURIComponent(g.id)}`;
        } catch (err) {
          onError(friendlyMessage(err));
        } finally {
          setBusy(false);
        }
      }}
    >
      <input
        required
        placeholder="name (3-32 chars)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-sm"
      />
      <input
        required
        placeholder="slug (lowercase, dashes, 3-32 chars)"
        value={slug}
        onChange={(e) => setSlug(e.target.value.toLowerCase())}
        className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-sm"
      />
      <textarea
        placeholder="description (optional)"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-sm"
      />
      <select
        value={visibility}
        onChange={(e) => setVisibility(e.target.value as "public" | "private")}
        className="w-full rounded border border-zinc-800 bg-zinc-900 p-2 text-sm"
      >
        <option value="public">Public</option>
        <option value="private">Private</option>
      </select>
      <button
        type="submit"
        disabled={busy}
        className="rounded bg-emerald-700 px-3 py-1 text-sm hover:bg-emerald-600 disabled:opacity-50"
      >
        {busy ? "Creating..." : "Create"}
      </button>
    </form>
  );
}
